# Corte 6A.7 — mídia em entregável finalizado

**2026-09-19** · frente Redator · **sem migration**

---

## 1. Os dois defeitos

### 1.1 O visível: a cena inalcançável

```tsx
<fieldset disabled={finalizado}>    ← linha 244
  <section data-cena onFocusCapture={() => setCenaSelecionada(parte.id)}>
</fieldset>                          ← linha 377
<aside>{cenaSelecionada ? <WriterMediaAnchorPanel/> : <p>Selecione uma cena…</p>}</aside>
```

`onFocusCapture` era o **único** caminho para `cenaSelecionada`, e elemento
desabilitado não dispara foco. Com o entregável finalizado, nenhuma cena ficava
selecionável, o painel nunca recebia alvo, e a tela pedia algo impossível de
cumprir — sem erro, sem explicação.

### 1.2 O invisível: o servidor não sabia

Nenhuma mutação de mídia olhava `writer_deliverables.status`. A leitura-somente
do finalizado era garantida só pelo `fieldset` — e o painel vive fora dele. Um
estado de React preservado, ou uma chamada direta à rota, **alterava mídia de um
entregável `approved` sem nenhuma recusa**.

---

## 2. Propriedade sem migration

`writer_media_assets.deliverable_id` está NULL em todos os ativos, e esta rodada
**não o preenche**. Não precisa — a identidade já está no banco:

```text
writer_deliverables_document_kind_unique :: UNIQUE (document_id, kind)
CHECK (kind = ANY (ARRAY['video_script', 'carousel']))
```

E o mapa de âncora para tipo é **total e fixo**: cena só existe em roteiro, slide
só existe em carrossel. Logo `(document_id, kind)` resolve **exatamente um**
entregável — por índice único, não por heurística.

Conferido no banco: os 5 ativos ancorados (3 `carousel_slide`, 2 `script_scene`)
resolveram todos, sem ambiguidade, e `ambiguidade_real` voltou vazio.

```text
MEDIA_DELIVERABLE_OWNERSHIP_MIGRATION_REQUIRED = NO
MEDIA_MIGRATION_REQUIRED = NO
```

`article_cover` e `article_block` resolvem `null` de propósito: o artigo tem
lifecycle próprio e o item 8 proíbe tocá-lo.

**Por que o papel também resolve.** A mídia nasce como briefing, antes de existir
âncora. O papel do briefing (`storyboard` → roteiro, `slide` → carrossel) é o que
permite guardar o **primeiro** passo da corrente, quando `anchor_kind` ainda é
NULL. A âncora manda quando existe; o papel resolve enquanto ela não existe.

---

## 3. Seleção separada de edição

O `fieldset disabled` **saiu**. No lugar:

| | Antes | Agora |
| --- | --- | --- |
| campos de conteúdo | `disabled` (sem foco, sem cópia) | `readOnly` — focáveis, selecionáveis, copiáveis |
| botões que mudam estrutura | `disabled` pelo fieldset | `disabled={finalizado}` explícito |
| seleção da cena | só `onFocusCapture` | `onPointerDown` **e** `onFocusCapture` |

Clique **e** foco selecionam: o clique é o que funciona com o conteúdo em
somente leitura, o foco é o que funciona pelo teclado. Depender de um só deixaria
metade das pessoas de fora.

```text
FINALIZED_SCENE_SELECTABLE = YES
FINALIZED_SLIDE_SELECTABLE = YES
```

---

## 4. Painel em finalizado: consulta sim, alteração não

O painel recebe `readOnly` e:

* **continua** mostrando a imagem (`Ver imagem` → URL assinada de 60s), o estado
  da posição, o briefing e o texto alternativo;
* **some** com as quatro ações — anexar, substituir, editar alt, editar briefing;
* **diz o que fazer**: "Entregável finalizado: a mídia está em consulta.
  **Reabra para edição** para alterar a imagem, o briefing ou o texto
  alternativo."

Sumir em vez de desabilitar é deliberado: quatro botões cinzas sem motivo são
outro beco sem saída. O aviso dá o caminho de volta.

```text
FINALIZED_MEDIA_PREVIEW = PASS
FINALIZED_MEDIA_MUTATION_UI_BLOCKED = YES
```

---

## 5. A guarda de servidor — cinco pontos

`lib/server/writer-media-guard.ts`, `server-only`, consultada em **todas** as
mutações:

| Ponto | Onde | Recusa |
| --- | --- | --- |
| registrar briefing | `registerWriterMediaBrief` | `WriterDeliverableError` 409 |
| anexar bytes | `uploadWriterMediaAsset` | `WriterDeliverableError` 409 |
| ancorar | `anchorWriterMediaAsset` | `{ status: "finalized" }` → 409 |
| substituir | `replaceWriterMediaAsset` | `{ status: "finalized" }` → 409 |
| alt text / briefing | `updateWriterMediaBrief` | `{ status: "finalized" }` → 409 |

**`signWriterMediaPreview` NÃO é guardada, de propósito.** Consultar a imagem de
um entregável finalizado é exatamente o que o painel precisa fazer; guardar ali
reabriria o beco sem saída por outro caminho. Há um teste que cobra essa
ausência, e um mutante que a quebra morre.

```text
FINALIZED_MEDIA_MUTATION_SERVER_BLOCKED = YES
```

Erro canônico: **`writer_deliverable_finalized`**, com a mensagem "Este
entregável está finalizado. Reabra para edição antes de alterar a mídia."

### 5.1 Por que a guarda devolve em vez de lançar

Os chamadores traduzem de jeitos diferentes: `writer-deliverables.ts` lança,
`writer-media-lifecycle.ts` devolve desfecho. Se a guarda lançasse um erro
definido em qualquer um dos dois, os módulos passariam a se importar em círculo.
Devolver o veredito mantém a decisão em um lugar só e a tradução em cada
fronteira.

### 5.2 Falha aberta em dois pontos, de propósito

Entregável **inexistente** e **erro de leitura** não recusam. O primeiro porque a
mídia pode nascer antes do entregável — recusar impediria o primeiro briefing. O
segundo porque derrubar a mutação por causa de uma consulta auxiliar trocaria um
risco por outro, e a mutação seguinte tem as próprias guardas.

---

## 6. Testes

`tests/redator-midia-finalizada.test.mts` — **7/7**, dentro de `test:redator`.

| # | Natureza | Cobre |
| --- | --- | --- |
| 01 | COMPORTAMENTAL | âncora e papel resolvem o dono; artigo devolve `null` |
| 02 | COMPORTAMENTAL | só `approved` recusa; `draft`/`in_review`/inexistente seguem |
| 03 | ESTRUTURAL | cena selecionável por clique e foco, conteúdo em `readOnly` |
| 04 | ESTRUTURAL | painel abre em finalizado, sem ações, com explicação |
| 05 | ESTRUTURAL | a guarda resolve sem `deliverable_id` e não escreve nada |
| 06 | ESTRUTURAL | os cinco pontos guardados; preview livre |
| 07 | ESTRUTURAL | a rota traduz 409; a guarda é `server-only` |

Cobertura pedida, ponto a ponto:

| Pedido | Onde |
| --- | --- |
| draft scene selecionável · approved scene também | 03 |
| approved scene/slide → preview permitido | 04, 06 |
| approved → upload / replace / alt / briefing recusados no servidor | 02, 06 |
| reopen → mutações voltam | 02 |
| chamada direta à rota não contorna a UI | 07 (guarda `server-only`, 409 na rota) |

### 6.1 Mutantes

| Mutante | Morto por |
| --- | --- |
| o portão deixa de recusar finalizado | 02 |
| o papel do briefing deixa de resolver o dono | 01 |
| volta o `fieldset` que matava a seleção | 03 |
| a cena perde a seleção por clique | 03 |
| o painel volta a mostrar ações em finalizado | 04 |
| a guarda passa a ler `deliverable_id` | 05 |
| o briefing perde a guarda | 06 |
| substituir perde a guarda | 06 |
| a rota deixa de traduzir a recusa | 07 |
| preview passa a ser guardado | 06 |

**Um sobreviveu na primeira rodada.** O mutante "o briefing perde a guarda"
neutralizava o `if` (`if (false && !portao.editable)`) mantendo a chamada e o
código de erro no arquivo — e meu teste 06 conferia **presença de palavras**.
Reescrevi a asserção para cobrar o **condicional** inteiro. Na segunda rodada,
dez de dez.

### 6.2 Um teste que exigia o defeito

O teste 15 de `redator-finalizacao-entregavel.test.mts` afirmava
`<fieldset disabled={finalizado}>` — exatamente a construção que tornava a cena
inalcançável. Um teste pedindo o defeito é pior que teste nenhum.

Foi trocado por: `doesNotMatch(/<fieldset[^>]*disabled=/)` mais a contagem de
`readOnly` no conteúdo e de `disabled` nos botões de estrutura. A garantia
continua — mudou o mecanismo que a sustenta.

---

## 7. Bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 231/231 | **241/241** | +10 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` (erros) | 124 | **124 — os mesmos dois arquivos** | 0 |

Nenhuma escrita remota: só leituras de constraints e de estado.

---

## 8. O que falta — e agora dá para fazer

Os ciclos de lifecycle continuam **não executados** (readback às 05:10 idêntico
ao de 05:02). Com a mídia destravada, o roteiro fica:

**Roteiro, depois Carrossel** — os dois estão `approved`, lock 5, versão 2:

1. **Com o entregável ainda finalizado**, clique numa cena → o painel deve abrir,
   mostrar a imagem e o aviso de consulta, **sem** botões de ação. Era aqui que
   travava.
2. **Reabrir para edição** → lock a 6, ponteiro segue na versão 2, e as ações de
   mídia voltam.
3. **Finalizar** sem editar → "Finalizado na versão 2; nenhuma versão nova foi
   criada", lock a 7, nenhuma versão nova, versão 2 sem `superseded_at`.
4. **Reabrir** → editar uma cena → **Salvar rascunho** → **Finalizar** → versão 3
   com `previous` = versão 2, e só então a versão 2 com `purge_after =
   superseded_at + 48h`.

Para testar mídia, faça no passo 2 ou 4 — em `Em redação`.

O **Artigo** segue sem nenhum passo executado; o código dele não foi tocado nesta
rodada, como pedido.

---

```text
FINALIZED_SCENE_SELECTABLE = YES
FINALIZED_SLIDE_SELECTABLE = YES
FINALIZED_MEDIA_PREVIEW = PASS
FINALIZED_MEDIA_MUTATION_UI_BLOCKED = YES
FINALIZED_MEDIA_MUTATION_SERVER_BLOCKED = YES

SCRIPT_REOPEN_UNCHANGED_UI = NOT_EXECUTED
CAROUSEL_REOPEN_UNCHANGED_UI = NOT_EXECUTED
SCRIPT_REFINALIZATION_CHANGED_UI = NOT_EXECUTED
CAROUSEL_REFINALIZATION_CHANGED_UI = NOT_EXECUTED

MEDIA_MIGRATION_REQUIRED = NO
MEDIA_DELIVERABLE_OWNERSHIP_MIGRATION_REQUIRED = NO
CORTE_6A_EDITOR_LIFECYCLE_READY_TO_CLOSE = NO
REMOTE_DATA_MODIFIED = NO
REGRESSIONS = NONE
```

`READY_TO_CLOSE = NO` porque os quatro caminhos de lifecycle continuam sem
execução real. O defeito que os precedia está corrigido; falta rodar.
