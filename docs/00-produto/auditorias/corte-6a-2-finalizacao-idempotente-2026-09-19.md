# Corte 6A.2 — finalização idempotente após reopen, e auditoria do save do Artigo

**2026-09-19** · frente Redator · migration `20260919043000_m5_writer_deliverable_finalize_idempotency.sql`

Duas frentes: a M5, que moveu para o banco a regra que o Corte 6A.1 tinha
remendado no cliente; e a auditoria do lifecycle do Artigo, que corrigiu uma
afirmação errada minha.

---

## 1. Correção de uma afirmação do Corte 6A.1

No relatório anterior escrevi que `saveWriterArticleDraft` "versiona de verdade a
cada gravação — é o desenho da M2 para `content_document_versions`". **As duas
metades estavam erradas em contexto.**

O Artigo tem **dois** caminhos de gravação, e eles se comportam de forma oposta:

| Caminho | Quem usa | Versiona? |
| --- | --- | --- |
| `PATCH /api/editorial/documents` | a **tela** (autosave e "Salvar rascunho") | **não** |
| `writer_save_article_draft` (RPC) | a ferramenta **MCP** `save_writer_draft` | **sim, sempre** |

Eu descrevi o comportamento do segundo como se fosse o do primeiro. E chamei de
"desenho da M2" o que é, na verdade, **violação da invariante canônica**.

---

## 2. Auditoria do save do Artigo

### 2.1 O caminho da tela — nenhum histórico

`components/editorial/professional-writer.tsx` chama
`PATCH /api/editorial/documents` com um campo `createVersion`:

```ts
// persistence-contracts.ts:138
createVersion: z.boolean().default(false)

// documents/route.ts
const version = input.createVersion
  ? await repository.createVersion(...)   // insere em content_document_versions
  : null;                                  // ← o padrão
```

Quem liga o campo:

| Gatilho | `createVersionRef.current` |
| --- | --- |
| autosave (`pending` → efeito de gravação) | **false** |
| botão **Salvar rascunho** (`saveDraftNow`) | **false**, explicitamente |
| `requestStatus("em_revisao" \| "aprovado")` | **true** |
| botão **Finalizar artigo** → `requestStatus("aprovado")` | **true** |

A rota da tela **nunca** chama `markArticlePredecessorSuperseded`. Ela não
importa a função.

### 2.2 A evidência de comportamento, não de leitura

Leitura remota, somente SELECT:

```text
content_documents            1 linha · status 'writing' · lock_version 22
content_document_versions    total 0
```

**Vinte e duas gravações, zero versões.** Não é inferência sobre o código: é o
estado do banco depois do uso real da tela.

### 2.3 O caminho MCP — histórico a cada save alterado

Corpo efetivo de `writer_save_article_draft` lido de `pg_proc` (comentários
removidos antes de qualquer busca):

```text
insere_versao_sempre       true
move_corrente              true
grava 'Rascunho salvo via MCP.'  true
tem_guarda_de_hash_igual   true     (save idêntico devolve unchanged, sem versão)
tem_ramo_sem_versao        false    (não existe um createVersion aqui)
```

E `saveWriterArticleDraft` chama `markArticlePredecessorSuperseded` logo depois,
com o `versionId` recém-criado no recibo.

**Não é residual nem inócua.** O recibo carrega um id real; `planSupersede`
receberia sucessor = corrente e marcaria o predecessor. O que a segura hoje é
outra coisa: `content_document_versions` está **vazia**, ou seja, a ferramenta
MCP `save_writer_draft` nunca foi usada neste projeto. É código vivo que nunca
disparou.

### 2.4 Classificação

```text
ARTICLE_AUTOSAVE_CREATES_VERSION = NO
ARTICLE_SAVE_DRAFT_CREATES_VERSION = NO
ARTICLE_FINALIZE_CREATES_VERSION = YES
ARTICLE_SAVE_CAN_START_RETENTION = NO  (tela)  ·  YES (ferramenta MCP, nunca usada)
```

`ARTICLE_FINALIZE_CREATES_VERSION = YES` vem do **código** (`requestStatus` liga
`createVersion`). Não há evidência de dado: nenhum artigo foi finalizado ainda, e
por isso `content_document_versions` está vazia. Registro a diferença em vez de
somar as duas provas.

### 2.5 Defeito separado, não corrigido aqui

```text
DEFEITO · MCP_ARTICLE_DRAFT_SAVE_CREATES_HISTORY

A ferramenta MCP `save_writer_draft` cria versão em content_document_versions a
cada save alterado e inicia retenção do predecessor. Isso contraria:

    AUTOSAVE_CREATES_HISTORY = NO
    SAVE_DRAFT_CREATES_HISTORY = NO
    FINALIZATION_CREATES_HISTORY = YES

A correção é a mesma da M4 para entregáveis: tirar o INSERT e o movimento de
`current_version_id` do save, e criar autoridade de finalização própria para o
Artigo. Toca o lifecycle do Artigo, não o do entregável, e por isso NÃO foi
feito nesta migration.

Risco hoje: baixo e latente — a ferramenta nunca foi usada (0 versões). Mas o
primeiro uso já produz histórico indevido e abre janela de 48h.
```

---

## 3. M5 — a regra saiu do cliente e foi para o banco

O Corte 6A.1 recusava `reopen → finalize sem editar` com 409 no wrapper, porque
a RPC da M4 criaria um B idêntico a A e abriria janela de 48h sobre A. Remendo de
cliente para defeito de autoridade.

### 3.1 Os três caminhos

| Caminho | Entrada | Resultado |
| --- | --- | --- |
| **A** nunca finalizado | `draft` + corrente NULL | cria FINAL_A · previous NULL · corrente = A · `approved` |
| **B** reaberto sem mudança | `draft` + corrente A + hash igual | **nenhuma versão** · `approved` · corrente continua A · sem retenção |
| **C** reaberto com mudança | `draft` + corrente A + hash diferente | cria B · previous = A · corrente = B · `approved` |

O ramo já existente (`approved` → finalizar de novo) continua igual.

### 3.2 O recibo não ganhou contrato novo

O caminho B devolve `unchanged: true` — o **mesmo** campo que o ramo `approved`
já usava para dizer "nenhuma versão foi criada, esta é a que existe". É a única
informação de que o chamador precisa para não marcar predecessor nenhum.

Um campo `reused` seria um segundo jeito de dizer a mesma coisa, e no dia em que
os dois discordassem alguém teria de escolher qual acreditar. O readback conferiu
que ele não existe no corpo efetivo.

### 3.3 A guarda que protege o caminho B

`writer_predecessor_nao_e_final` vem **antes** do caminho B, e isso não é
detalhe. No caminho C ela impede que um rascunho legado vire predecessor. No
caminho B ela impede algo pior: **reusar** uma versão que não é finalização,
promovendo rascunho a final sem que ninguém tenha finalizado.

### 3.4 O que a M5 não faz

Substitui **uma** função. Nenhuma tabela, coluna, enum, índice, constraint ou
trigger. Nenhuma escrita de dado fora do corpo da própria função — conferido
removendo os blocos `DO` e o corpo e olhando o que sobra. Não toca
`writer_save_deliverable`, `writer_reopen_deliverable`, mídia, purge, M1/M2/M3,
Minerador, Arquiteto, Radar, ArticleDNA, SERP ou Publicações.

### 3.5 Pré-flight

Duas guardas, ambas abortam a transação inteira:

| Guarda | Dispara quando |
| --- | --- |
| `m5_preflight_m4_ausente` | `writer_finalize_deliverable` não existe (M4 não aplicada) |
| `m5_preflight_corrente_nao_e_final` | alguma corrente apontada não é final canônica não substituída |

A segunda é a precondição do caminho B: sem ela, reusar seria adivinhar.

```text
M5_SQL_REVIEW = PASS
```

### 3.6 Mutantes

Seis defeitos introduzidos de propósito na migration, suíte rodada, defeito
revertido:

| Mutante | Morto por |
| --- | --- |
| o caminho B passa a mover a corrente | 17 |
| o caminho B mente no recibo (`unchanged: false`) | 17 |
| o caminho B some (volta o defeito da M4) | 17 |
| a guarda de predecessor é removida | 17 |
| o pré-flight perde a guarda da M4 | 18 |
| a migration passa a mexer em tabela | 18 |

O quarto só morreu depois de um reforço: o teste conferia `indexOf(guarda) <
inicioB`, e com a guarda removida `indexOf` devolve −1, que é menor que qualquer
índice — uma migration **sem guarda nenhuma** passaria. A existência agora é
cobrada antes da ordem.

O teste 17 também pegou uma ambiguidade minha: o marcador do caminho B aparece
duas vezes no arquivo (ramo já-aprovado e caminho B), e meu `indexOf` achava o de
cima. A busca virou `lastIndexOf`, com a contagem de ocorrências afirmada.

---

## 4. Wrapper

A recusa 409 saiu. Saíram junto as duas consultas que existiam só para
alimentá-la, e a regra pura `precheckFinalization` foi **removida** do módulo —
não deixada exportada e sem uso. Viva, ela seria um jeito de o cliente impedir o
comportamento correto do banco.

Nenhum `if` novo foi preciso. A decisão de retenção já estava certa para os três
caminhos:

```text
A  create_version, previous NULL  → no_predecessor
B  unchanged: true                → unchanged_finalization
C  create_version, previous A     → marca A
```

O teste 12 agora exige que `precheckFinalization` e `finalization_without_change`
**não** apareçam no corpo do wrapper.

Na tela, a mensagem de `unchanged` passou a servir aos dois casos: "Finalizado na
versão N; nenhuma versão nova foi criada."

---

## 5. Gate e aplicação

```text
REPOSITORY_STABLE = YES · 152s de silêncio contínuo · 2118 arquivos observados
```

| Suíte | Baseline | Antes do DDL | Depois |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | **0** |
| `test:redator` | 204/204 | **207/207** | **207/207** |
| `test:redator:mcp` | 2/2 | **2/2** | — |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | — |
| `test:radar` | 2236/2236 | **2236/2236** | — |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | — |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | — |
| `eslint` (erros) | 124 | **124** | **124** |

Os 124 erros continuam sendo os pré-existentes de Arquiteto e Minerador. Os
arquivos tocados acusam 0.

Aplicada **somente** a M5, por `db query -f`, sem erro.

### 5.1 Readback do schema efetivo

Corpo lido de `pg_proc` **sem comentários**.

| Verificação | Resultado |
| --- | --- |
| assinatura `(uuid,text,text,integer,uuid)` | ✓ |
| `SECURITY DEFINER` · `search_path=public, pg_temp` | ✓ |
| anon · authenticated · service_role | não · não · **sim** |
| comparações de hash no corpo | **2** (ramo aprovado + caminho B) |
| inserções de versão | **1** (caminhos A e C) |
| caminho B devolve status sem mover a corrente | ✓ |
| caminho C move a corrente para a nova | ✓ |
| guarda de predecessor · lock · estado corrompido | ✓ ✓ ✓ |
| contrato paralelo (`reused`) no corpo | **ausente** |
| `COMMENT` atualizado com os três caminhos | ✓ |

Dados inalterados: 2 entregáveis, 0 aprovados, 0 ponteiros, 2 versões legadas, 0
em retenção, 0 `publication_records`, 0 `content_document_versions`, 9 mídias da
Care Glow. `writer_save_deliverable`, `writer_reopen_deliverable` e
`writer_mark_deliverable_version_superseded` intactas.

### 5.2 Histórico

```text
M1 20260918190000  local ✓  remoto ✓
M2 20260918190100  local ✓  remoto ✓
M3 20260918190200  local ✓  remoto ✓
M4 20260919020000  local ✓  remoto ✓
M5 20260919043000  local ✓  remoto ✓

nenhuma migration remota depois da M5
```

---

## 6. Smoke pós-aplicação

Fixture própria na marca de homologação **Somatec Blocking**, em transação que
aborta no fim — as RPCs, os triggers e as constraints rodam de verdade; o que não
acontece é o `COMMIT`.

### 6.1 Caminho B — o alvo da M5

```text
STATUS              = approved
CURRENT_VERSION_ID  = A (b1d3befb-db3a-47e4-ae19-689a3b46f440)
VERSION_COUNT       = 1
A_SUPERSEDED        = NO
recibo              = unchanged: true · versionId = A
```

**PASS** nos quatro marcadores pedidos.

### 6.2 Caminho C — depois de editar

```text
VERSION_COUNT              = 2
CURRENT_VERSION_ID         = B (7701e750-a8d2-493c-8526-f07e59f8b39c)
B_PREVIOUS                 = A
A_RETENTION_AFTER_READBACK = YES
```

A ordem da M2 foi respeitada literalmente: B persistida → `current_version_id`
lido de volta e confirmado igual a B → **só então** A entrou em retenção.
`A.purge_after = 2026-09-21T04:07:00` contra
`A.superseded_at = 2026-09-19T04:07:00` — 48h exatas. B sem janela.

### 6.3 Publicações e resíduo

`publication_records` 0 antes e 0 depois, atravessando três finalizações e duas
reaberturas.

Depois do rollback: Somatec Blocking com 0 documentos, 0 entregáveis, 0 mídias.
Estado do banco inalterado, 9 mídias da Care Glow intactas.

---

## 7. Publicações — gap registrado, não tratado

Confirmado que `sendWriterToPublications` entrega apenas o `content_document` do
Artigo e nunca lê `writer_deliverables`. O rótulo **"Enviar artigo a
Publicações"** continua correto.

```text
SCRIPT_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
CAROUSEL_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
```

Fica para depois do Redator fechado.

---

## 8. Homologação pela tela — liberada

Com a M5 aplicada, o ciclo completo está disponível e a recusa artificial não
existe mais:

```text
SCRIPT_FINALIZATION_UI_E2E = READY
CAROUSEL_FINALIZATION_UI_E2E = READY
```

Roteiro da homologação, em Redator → aba **Roteiro e storyboard**:

1. editar uma cena → **Salvar rascunho** → "Rascunho salvo e confirmado no
   servidor"; estado **Em redação**;
2. **Finalizar roteiro** → "Finalizado e confirmado no servidor como versão 1";
   estado **Finalizado**; campos somente leitura;
3. **F5** → continua **Finalizado**;
4. **Reabrir para edição** → volta a **Em redação**;
5. **Finalizar roteiro** sem editar nada → agora **funciona**: volta a
   **Finalizado** com "Finalizado na versão 1; nenhuma versão nova foi criada";
6. **Reabrir** → editar uma cena → **Salvar rascunho** → **Finalizar roteiro** →
   "versão 2".

Mesmo ciclo mínimo no **Carrossel**.

Não executei isso: o navegador embutido é isolado do Chrome do usuário e chegar
ao Redator exigiria digitar credenciais. Verificado contra o servidor na porta
3000: `PATCH /api/redator/deliverables` sem sessão devolve **401**.

---

```text
M5_REQUIRED = YES
M5_SQL_REVIEW = PASS
M5_APPLIED = YES
REOPEN_UNCHANGED_PATH = IDEMPOTENT
REOPEN_UNCHANGED_FINALIZE = PASS
DUPLICATE_VERSION_CREATED = NO
RETENTION_ON_UNCHANGED_FINALIZE = NO

ARTICLE_SAVE_AUDIT_COMPLETE = YES
ARTICLE_AUTOSAVE_CREATES_VERSION = NO
ARTICLE_SAVE_DRAFT_CREATES_VERSION = NO
ARTICLE_FINALIZE_CREATES_VERSION = YES (por código; sem evidência de dado ainda)
ARTICLE_SAVE_CAN_START_RETENTION = NO na tela · YES na ferramenta MCP, nunca usada

SCRIPT_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
CAROUSEL_PUBLICATION_HANDOFF = NOT_IMPLEMENTED
SCRIPT_FINALIZATION_UI_E2E = READY (homologação do usuário)
CAROUSEL_FINALIZATION_UI_E2E = READY (homologação do usuário)

REMOTE_DATA_MODIFIED = NO
REGRESSIONS = NONE
```

### O que fica aberto

1. **§2.5** — `MCP_ARTICLE_DRAFT_SAVE_CREATES_HISTORY`: a ferramenta MCP
   `save_writer_draft` versiona rascunho e inicia retenção. Latente (nunca usada),
   mas o primeiro uso já produz histórico indevido.
2. **§7** — handoff de Roteiro e Carrossel para Publicações.
3. **§8** — a homologação pela tela.
