# Corte 6A — Roteiro virou documento produzido

**Data:** 2026-09-19
**Não executado:** migration, DDL, purge, deploy, commit, push.
**Duas lacunas encontradas na auditoria** estão em §7 e §8 — uma delas exige
migration e por isso **parei antes do DDL**.

---

## 1. Auditoria antes de editar

### 1.1 O schema não restringe o conteúdo do payload

| Objeto | Constraint relevante |
| --- | --- |
| `writer_deliverables.payload` | `CHECK (jsonb_typeof(payload) = 'object')` |
| `writer_deliverable_versions.payload` | idem |

**Nenhum CHECK sobre as chaves internas.** O contrato da cena é do Zod, não do
banco — e é por isso que os campos novos (§3) não precisaram de migration.

`current_version_id` existe em `writer_deliverables` e **está populado**
(`cd9d3a55…` para o roteiro): a M2 já é a autoridade de versão corrente, e o
código a usa — nada deduz por `max(version_number)`.

### 1.2 Classificação dos campos

| Campo | Classificação | O que foi feito |
| --- | --- | --- |
| `scenes[].id` | ESTRUTURAL | preservado em todas as operações |
| `scenes[].order` | ESTRUTURAL | recalculado, nunca confiado na entrada |
| `scenes[].narration` | CONTEUDO_DA_CENA | campo principal da cena |
| `scenes[].visualDirection` | CONTEUDO_DA_CENA | segundo campo da cena |
| `scenes[].technicalDirection` | CONTEUDO_DA_CENA | **reusado** como "Observação" |
| `scenes[].durationSeconds` | OPCIONAL | recolhido junto da observação |
| `scenes[].storyboard` | CONTEUDO_DA_CENA | briefing visual, pelo painel |
| `scenes[].sourceRefs` | LEGADO_COMPATIBILIDADE | mantido, sem UI |
| `title` (do roteiro) | ESTRUTURAL | virou o título editável do documento |
| `channel` | OPCIONAL | recolhido, rotulado "(opcional)" |
| `objective`, `audience` | OPCIONAL | recolhidos |
| `durationSeconds`, `openingHook`, `closingCta` | OPCIONAL | recolhidos |
| `caption` (carrossel) | OPCIONAL | recolhido |
| `notes` | LEGADO_COMPATIBILIDADE | mantido, sem UI |

**Nenhuma coluna ou campo de schema foi removido.** O que saiu foi a posição
deles na tela: um campo opcional que abre a tela é um campo que manda.

---

## 2. A tela

Antes: seis campos de briefing — Canal, Público, Objetivo, Duração, Abertura,
Chamada final — e só depois as cenas, em grade de rótulos.

Agora:

```text
Cobrir com clareza o tema "skincare para pele oleosa"      ← título editável
Roteiro e storyboard · derivado de "…" · 2 cenas · rascunho remoto v1

┌ CENA 1   [Identificação da cena]        ↑ ↓ ⧉ 🗑 ┐
│ Fala ou narração
│ Texto na tela
│ Direção visual
│ ▸ Observação e duração
└ Mídia desta cena no painel ao lado.

┌ CENA 2   …
```

Leitura vertical, cada cena uma unidade delimitada, com a selecionada destacada.
Os metadados vivem num `<details>` recolhido **abaixo** das cenas.

---

## 3. Contrato da cena — o que faltava

`VideoScene` representava narração, direção visual e instrução técnica, mas não
tinha como guardar **como a cena se chama** nem **o que aparece escrito na tela**.

```text
SCHEMA_GAP = VideoScene.title (identificação) e VideoScene.onScreenText (texto na tela)
MIGRATION_REQUIRED = NO
```

Os dois entraram com `.default("")`, e por isso são retrocompatíveis: as duas
cenas já gravadas sem as chaves continuam validando, e o parse preenche o vazio.
Conferido na tela — o roteiro existente abriu normalmente depois da mudança.

**`technicalDirection` foi reusado** como "Observação" em vez de criar um segundo
campo livre. Schema paralelo por preguiça de ler o que já existe é dívida, não
funcionalidade.

---

## 4. Operações de cena, e a identidade que elas preservam

`lib/redator/script-scenes.ts` — puro, sem React, sem I/O:

```text
adicionarCena · editarCena · removerCena · duplicarCena · moverCena
cenasEmOrdem · idsEmOrdem
```

Toda operação **recalcula `order` e nunca reatribui `id`**. Isso não é zelo
estético: a mídia ancora em `script_scene + sceneId`. Id trocado numa
reordenação deixaria a imagem apontando para uma cena que não existe mais, e o
índice único da M3 passaria a proteger um fantasma.

Detalhes que a implementação decidiu:

- **editar não consegue trocar o id**, mesmo se ele vier no patch (teste 05);
- **duplicar gera id novo e NÃO copia o `storyboard`** — a cópia não tem imagem,
  e herdar o briefing sugeriria que tem;
- **excluir preserva os ids das demais**; só `order` se ajusta.

Conferido no navegador, com o roteiro real: reordenar manteve o conjunto de ids
idêntico, incluindo `036e2252…`, que é a cena com imagem ancorada de verdade.

Não adicionei drag-and-drop: a instrução pedia para não trazer dependência
pesada só para isso, e os quatro botões por cena resolvem.

---

## 5. Storyboard contextual

O painel de mídia recebe **só a âncora da cena aberta**:

```tsx
targets={alvos.filter(alvo => alvo.ref === cenaSelecionada)}
```

Sem cena selecionada não há painel — logo não há galeria global, e não há
"Prompts e imagens".

Uma fricção que a verificação visual expôs: o painel ainda pedia *"selecione uma
posição"* mesmo tendo recebido uma só. Corrigido — com uma única posição o
seletor **não é renderizado** e ela já vem escolhida. Derivado de `targets`, sem
efeito de sincronização.

Na tela, com o roteiro real: a Cena 1 abre mostrando `hash 80c32424ed88…`,
`Ver imagem`, `Substituir imagem`, `Editar alt text`, `Editar briefing` e
"1 versão(ões) anterior(es) nesta posição".

---

## 6. Canal

```text
REQUIRED_IN_UI = NO
REQUIRED_FOR_SAVE = NO
REQUIRED_FOR_FINALIZATION = NO   (não há finalização — ver §8)
```

Rotulado "(opcional)", recolhido, sem `placeholder` sugerindo YouTube ou
Instagram, e sem preenchimento automático. Teste 01 prova que o payload valida e
salva com `channel` vazio.

Nenhuma integração social foi criada. O destino continua sendo Publicações.

---

## 7. Lacuna: não existe finalização de entregável

`writer_save_deliverable(p_brand_id, p_document_id, p_kind, p_payload,
p_content_hash, p_expected_lock, p_actor_id)` **não recebe status**. Ela apenas
*impede* editar o que já está `approved`:

```sql
IF v_current.status = 'approved' THEN RAISE EXCEPTION 'writer_approved_immutable';
```

Não há RPC, rota ou função que transicione `draft → approved` para roteiro ou
carrossel. **Nenhum botão de finalizar foi criado** — botão sem autoridade é
promessa falsa, e o teste 17 trava a ausência.

```text
FINALIZATION_AUTHORITY_FOR_DELIVERABLES = NONE
MIGRATION_REQUIRED = YES (para esta frente)
```

---

## 8. Lacuna maior: o rascunho do entregável CRIA versão histórica

Lendo o corpo da RPC:

```sql
IF v_current.content_hash = p_content_hash THEN
  RETURN ... 'unchanged', true;       -- save idêntico não versiona
...
INSERT INTO public.writer_deliverable_versions (... change_reason ...)
VALUES (..., 'Revisão do rascunho.', p_actor_id)
```

Ou seja: **todo save alterado de roteiro cria uma versão histórica**, rotulada
"Revisão do rascunho". Isso contraria diretamente a regra do §8 da instrução:

```text
autosave = estado atual
salvar rascunho = estado atual
Nenhum deles cria versão histórica.
Somente finalização/refinalização pode participar do lifecycle M2.
```

O artigo obedece a regra; o entregável faz o oposto — e **não tem finalização**,
então hoje o único jeito de um roteiro entrar no lifecycle M2 é salvando
rascunho, que é exatamente o que não deveria versionar.

Corrigir isso exige alterar `writer_save_deliverable` e criar autoridade de
finalização: **migration**. Conforme a instrução, **parei antes do DDL** e
entrego o gap.

```text
DRAFT_CREATES_HISTORY_VERSION = YES (hoje, e é o defeito)
MIGRATION_REQUIRED = YES
```

### 8.1 O que uma M4 precisaria fazer

1. `writer_save_deliverable` deixa de inserir em `writer_deliverable_versions`;
   ela passa a gravar só estado corrente, como o autosave do artigo.
2. Uma função nova — `writer_finalize_deliverable` — cria a versão, define
   `current_version_id` e devolve o recibo, para o código chamar
   `markDeliverablePredecessorSuperseded` depois do readback.
3. As **2 versões já gravadas** (uma por entregável) ficam como estão: elas são
   correntes e não têm predecessora, então nada entra em janela.

Não escrevi essa migration nesta rodada.

---

## 9. Finalizar ≠ enviar a Publicações

Preservado por ausência: como não há finalização de entregável, também não há
`Enviar a Publicações` nesta tela. `sendWriterToPublications` continua sendo a
autoridade única, no ambiente Artigo, e **nenhum caminho especial para roteiro
foi criado** — teste 17.

---

## 10. Topbar

Intacta: Artigo · Roteiro e storyboard · Carrossel, mais o estado do documento
no ambiente Artigo. **Nenhuma barra nova**, nenhum rodapé, nenhum "Conectar IA",
nenhum fullscreen. Conferido na tela: altura 40px, um `<header>` de topbar,
zero `<footer>`.

O `Salvar rascunho` do ambiente derivado continua no corpo do documento, junto do
estado — não virou barra. Levá-lo à GlobalTopbar exigiria que o ambiente
derivado reportasse estado para cima; como a finalização não existe (§7), a
metade útil desse controle não teria o que fazer. Fica registrado como próximo
passo natural depois da M4.

---

## 11. IA e estado vazio

Nenhum seletor de modelo, credencial ou "Conectar IA" — integrações continuam em
`Agência → Integrações`.

Estado vazio: `Ainda não há cenas. [Adicionar primeira cena]`. **Não ofereci
"Gerar estrutura inicial"** porque não existe autoridade server-side de geração
de roteiro. Teste 17 trava a ausência dos dois.

---

## 12. Testes

`tests/redator-roteiro-producao.test.mts` — **17/17**, em `test:redator`.

| Cobertura pedida | Teste |
| --- | --- |
| roteiro sem Canal salva | 01 |
| adicionar primeira cena | 02 |
| adicionar múltiplas cenas | 03 |
| `sceneId` permanece ao editar | 04, 05 |
| `sceneId` permanece ao reordenar | 06 |
| duplicação gera novo `sceneId` | 07 |
| exclusão não altera IDs das demais | 08 |
| mídia segue a cena após reordenação | 06, 09 |
| substituir mídia de uma cena não afeta outra | 10 + `redator-media-ui-operacional` 07 |
| nenhuma seção global `Prompts e imagens` | 15 |
| `channel` não é obrigatório | 01, 13 |
| nenhuma nova barra horizontal | 16 |
| retrocompatibilidade do payload gravado | 12 |

Não cobertos por teste automatizado, e por quê:

- **F5 recupera cenas do remoto** — verificado no navegador (§13), não em teste:
  exigiria servidor no runner;
- **salvar rascunho não cria versão histórica** — **hoje ele cria** (§8). Não
  escrevi teste afirmando o contrário;
- **finalizar cria/atualiza lifecycle M2**, **refinalização cria sucessor**,
  **finalizar não cria PublicationRecord**, **enviar a Publicações é separado** —
  não há finalização de entregável (§7). O teste 17 prova que nenhum botão falso
  foi criado, que é o que dá para provar hoje.

### 12.1 Baseline

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 145/145 | **162/162** | +17 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos arquivos tocados | 0 | **0** | 0 |

---

## 13. Verificação visual

Aberto no navegador, com o roteiro real de duas cenas:

| Ponto | Resultado |
| --- | --- |
| parece ambiente de produção | **sim** — CENA 1 é o primeiro conteúdo da tela |
| não parece formulário de briefing | **sim** — metadados recolhidos, abaixo |
| cenas são o elemento principal | **sim** — pilha vertical, unidades delimitadas |
| mídia dentro do contexto da cena | **sim** — painel mostra só a cena aberta |
| topbar continua única | **sim** — 40px, um `<header>` de topbar, zero `<footer>` |
| painel lateral não invade o conteúdo | **sim** — `w-72` fixo, documento com `flex-1` |
| não existe "Prompts e imagens" | **sim** — ausente do DOM |
| não existe Canal obrigatório | **sim** — recolhido e rotulado "(opcional)" |

Também exercitado na tela: reordenar preservou os ids (conjunto idêntico),
adicionar gerou id próprio, e o F5 restaurou as duas cenas do remoto — as
edições locais não salvas foram descartadas, e **o roteiro do usuário ficou como
estava**.

---

```text
SCRIPT_IS_PRODUCTION_DOCUMENT = YES
LEGACY_BRIEFING_FORM_REMOVED_FROM_UI = YES (recolhido, não removido do schema)
CHANNEL_REQUIRED = NO
SCENE_IDS_STABLE = YES
SCENE_REORDER_PRESERVES_MEDIA_ANCHOR = YES
CONTEXTUAL_SCENE_MEDIA = YES
GLOBAL_PROMPTS_IMAGES_SECTION = NO
DRAFT_CREATES_HISTORY_VERSION = YES — defeito herdado, ver §8
FINALIZATION_USES_M2 = NO — não existe finalização de entregável, ver §7
PUBLICATION_IS_SEPARATE_ACTION = YES (por ausência de caminho no roteiro)
NEW_HORIZONTAL_BARS = NO
MIGRATION_REQUIRED = YES — para §7 e §8; NÃO para os campos de cena
REGRESSIONS = NONE
```

### O que fica para decisão

Os campos de cena não precisaram de migration e já estão em uso. O que precisa é
o **lifecycle do entregável**: hoje salvar rascunho versiona e não existe
finalizar. Posso escrever a M4 para revisão — sem aplicar — quando você quiser.
