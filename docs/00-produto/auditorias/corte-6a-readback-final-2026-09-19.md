# Corte 6A — readback final

**2026-09-19 06:02 UTC** · frente Redator · **somente leitura, nenhum código alterado**

---

## 1. O estado não mudou em uma hora

Leitura às **06:02**, comparada com a de **05:10** e com a de **05:02**:

| | Roteiro | Carrossel |
| --- | --- | --- |
| `status` | `approved` | `approved` |
| `lock_version` | **5** | **5** |
| `current_version_id` | `06e8fc0f-…` | `e2121556-…` |
| total de versões | **2** | **2** |
| `updated_at` | **05:02:58.916762** | **05:02:37.758745** |

Byte a byte o mesmo de uma hora atrás. `updated_at` continua marcando a
finalização das 05:02 — nenhuma escrita depois dela.

### 1.1 A cadeia, completa

| kind | `version_number` | `change_reason` | `previous` | `superseded_at` | `superseded_by` | `purge_after` | corrente |
| --- | --- | --- | --- | --- | --- | --- | --- |
| video_script | 1 | `Rascunho inicial.` | NULL | NULL | NULL | NULL | não |
| video_script | 2 | `Finalização do entregável.` | NULL | NULL | NULL | NULL | **sim** |
| carousel | 1 | `Rascunho inicial.` | NULL | NULL | NULL | NULL | não |
| carousel | 2 | `Finalização do entregável.` | NULL | NULL | NULL | NULL | **sim** |

Nenhuma terceira versão. Nenhum `superseded_at`. Nenhum `purge_after`.

### 1.2 Artigo

```text
status  writing        payload.status  escrevendo
lock_version  22       current_version_id  null
content_document_versions  0
updated_at  2026-09-19T03:13:53.012452Z   (anterior à aplicação da M4)
```

---

## 2. Mídia

As 9 mídias da Care Glow continuam **9**: 5 correntes, 4 em janela. Nenhuma linha
nova, nenhum `prompt_ready`, nenhuma mudança de âncora.

**O que isso prova e o que não prova.** Prova que nenhuma mutação de mídia teve
efeito — que é o resultado desejado com os dois entregáveis `approved`. **Não**
distingue "foi tentada e recusada" de "não foi tentada": uma recusa 409 não
escreve nada, por desenho.

`FINALIZED_MEDIA_PREVIEW_UI` não é observável por readback. Assinar uma URL de
preview é leitura pura e não deixa traço. Só quem está na tela pode dizer se o
painel abriu ao clicar numa cena com o entregável finalizado.

---

## 3. Um defeito meu que provavelmente explica o padrão

Esta é a terceira leitura seguida em que a execução relatada não aparece no
banco. Antes de repetir o diagnóstico, descartei o que era minha
responsabilidade:

* os fontes que alterei no Corte 6A.7 são de **02:25:23** e **02:25:27** (local);
  `.next` foi tocado em **02:25:47** — o dev server **recompilou depois**;
* o servidor responde: `/` 200, `/redator` 307, `PATCH /api/redator/deliverables`
  **401** com a mensagem correta;
* os 14 `readOnly={finalizado}` caíram todos em `<input>`/`<textarea>`;
* `tsc` 0 erros, `test:redator` 241/241.

Então achei outra coisa — e ela é minha, do Corte 6A.1:

```tsx
/* ARTIGO · components/editorial/professional-writer.tsx:372 */
className={`… ${saveState === "conflict" || saveState === "error" ? "text-danger"
                : saveState === "saved_server" ? "text-success" : "text-text-muted"}`}

/* ENTREGÁVEL · linha 334 */
className={`… min-w-0 max-w-64 truncate text-text-muted`}
```

**A linha de estado do entregável nunca muda de cor.** Um erro em "Reabrir para
edição" — conflito de lock, sessão expirada, 409, qualquer um — aparece em
`text-text-muted`, truncado em `max-w-64`, no mesmo lugar e na mesma cor que
"Sem alterações pendentes".

Clicar, falhar e não perceber é o comportamento **esperado** dessa tela.

Não afirmo que foi isso — não observei o navegador. Afirmo que é um defeito real,
que é meu, e que é a explicação mais econômica para o padrão. Não corrigi:
esta rodada é de leitura.

```text
GAP · DELIVERABLE_STATUS_LINE_HIDES_ERRORS
components/editorial/professional-writer.tsx:334 — a mensagem do entregável usa
sempre `text-text-muted`. Falta o mesmo tratamento que o artigo já tem na linha
372: vermelho em falha, verde em confirmação. Enquanto isso não existir, uma
ação recusada é indistinguível de uma ação bem-sucedida.
```

---

## 4. Invariantes e Publicações

Todas verdadeiras por consulta — várias **vacuamente**, porque não houve
substituição nenhuma:

| Invariante | |
| --- | --- |
| sem duplicata de hash (artigo e entregável) | ✓ |
| toda corrente existe, é do próprio dono, não retida | ✓ |
| toda corrente de entregável é `Finalização do entregável.` | ✓ |
| retenção só em quem foi substituído | ✓ (vacuamente) |
| janelas de 48h | ✓ (vacuamente) |
| legadas de rascunho fora do lifecycle M2 | ✓ |
| nenhuma versão `Rascunho salvo via MCP.` | ✓ |

```text
publication_records = 0
```

Com evidência real: duas finalizações pela interface às 05:02, zero registros.

---

## 6. Segunda leitura — 06:32 UTC, depois do Corte 6A.8

O 6A.8 corrigiu o ponto cego da §3: erro e conflito agora aparecem em vermelho,
com a mensagem do servidor, na barra e num bloco no corpo.

### 6.1 A UI grava — isto ficou provado

Apareceu um **segundo** `content_document`, criado às **06:20:09**:

```text
id            redator:09762023-…:article-candidate:territory:9da03dd0-…:010c6b13-…
title         Cobrir com clareza o tema "skin care noturno".
status        planned          payload.status  planejado
lock_version  1                entregáveis  0        mídias  0
created_at    2026-09-19T06:20:09.795154Z
```

E `editorial_workflow_items` registra o handoff que o criou:

```text
stage radar · state sent_writer · 06:20:09.919786Z
```

Isso encerra três hipóteses de uma vez: **a sessão está válida, o servidor grava,
e a tela funciona**. Não é 401, não é servidor caído, não é código quebrado.

### 6.2 E mesmo assim, nada de Roteiro ou Carrossel

Escritas em cada tabela do Redator **depois das 05:03**:

| Tabela | Escritas |
| --- | --- |
| `content_documents` | **1** (o handoff das 06:20) |
| `writer_deliverables` | **0** |
| `writer_deliverable_versions` | **0** |
| `content_document_versions` | **0** |
| `writer_media_assets` | **0** |
| `publication_records` | **0** |

Os dois entregáveis continuam em `updated_at` 05:02, lock 5, duas versões
cada, sem `superseded_at`.

### 6.3 A explicação mais provável, e ela não é um defeito

```ts
// editorial-repositories.ts:411 — a lista vem do mais recente para o mais antigo
.order("updated_at", { ascending: false })

// professional-writer.tsx:45 — sem seleção explícita, cai no primeiro
useState(preferred?.id || pipeline.moduleState.redator?.selectedId || documents[0]?.id || "")
```

O documento das 06:20 é agora **o mais recente**, logo o **primeiro** da lista. Se
o Redator foi aberto sem uma seleção prévia guardada, ele seleciona o documento
de **"skin care noturno"** — que tem **zero entregáveis**.

Nessa situação, na aba Roteiro:

* `stored` é `null` → o estado da barra é `none`;
* **"Reabrir para edição" não é renderizado** — ele só existe quando o estado é
  `approved`;
* "Finalizar roteiro" aparece **desabilitado**, com o título "Salve o rascunho
  antes de finalizar".

Ou seja: a tela estaria **correta**, apontando para outro artigo. Não haveria o
que reabrir, e nenhum erro apareceria — porque nenhuma requisição é feita.

Isto é hipótese, não constatação: `moduleState.redator.selectedId` pode ter
preservado a seleção anterior. Mas é a explicação mais econômica para "cliquei e
nada aconteceu" **sem** mensagem de erro, agora que o erro seria vermelho e legível.

### 6.4 Como confirmar em dois segundos

No painel esquerdo do Redator, o documento selecionado fica destacado. O ciclo
pendente é o de:

> **Cobrir com clareza o tema "skincare para pele oleosa"**

Não o de *skin care noturno*, que acabou de chegar do Radar e ainda não tem
roteiro nem carrossel.

Com o documento certo selecionado, a aba Roteiro deve mostrar **Finalizado** e o
botão **Reabrir para edição** na barra superior.

### O que fazer antes da próxima tentativa

Se a tela mostrar qualquer texto cinza ao lado dos botões depois de clicar em
**Reabrir para edição**, ele pode ser um erro disfarçado. Vale abrir o console do
navegador (F12 → Network) e olhar o `PATCH /api/redator/deliverables`: o código
de resposta diz na hora se a ação chegou ao servidor e o que ele respondeu.

Corrigir a cor da linha de estado é uma alteração de uma linha e fecharia esse
ponto cego — fica para a próxima rodada, já que esta era de leitura.

---

## 7. Terceira leitura — 07:52 UTC, depois do Corte 6A.9

Os entregáveis continuam em `updated_at` **05:02**. Nenhuma escrita desde então.

### 7.1 O dado que fecha a investigação

`content_document_user_states` é gravado pela própria tela a cada troca de
documento, e é persistido no servidor. Ele diz **qual documento o Redator abriu**:

| documento | `last_opened_at` |
| --- | --- |
| **Cobrir com clareza o tema "skin care noturno"** | **07:14:27** |
| Cobrir com clareza o tema "skincare para pele oleosa" | 06:24:12 |

Às **07:14**, a tela estava no documento **errado** — o que chegou do Radar às
06:20, não o que precisa da homologação.

Última escrita de cada tabela:

```text
content_document_user_states   07:14:27   ← a tela abriu algo
content_documents              06:20:09   ← o handoff
editorial_workflow_items       06:20:09
writer_deliverables            05:02:58
writer_deliverable_versions    05:02:58
writer_media_assets            05:00:00
content_document_versions      (nenhuma)
publication_records            (nenhuma)
```

### 7.2 Por que a correção do 6A.9 não bastou — e o erro é meu

```ts
// editorial-pipeline-context.tsx:343
const updateWorkspace = useCallback((updater) => {
  setWorkspaces(previous => updateBrandWorkspace(...));   // memória React, só isso
}, [...]);

// linha 108 — o workspace nasce com moduleState vazio a cada carregamento
moduleState: {}
```

`moduleState.redator.selectedId` **não é persistido em lugar nenhum**. Ele é
estado React do contexto, e volta a `{}` a cada F5.

Então a regra do 6A.9:

* **protege durante a sessão** — resolvido uma vez, um handoff que chega depois
  não rouba, porque `selectedId` e `moduleState` seguram;
* **não sobrevive ao recarregamento** — `moduleState` volta vazio,
  `selectedId` volta `""`, e a regra cai no passo 4: `documents[0]`, que é
  o mais recente.

Eu afirmei `ACTIVE_DOCUMENT_SURVIVES_LIST_REFRESH = YES` no relatório do 6A.9.
**Estava errado.** O teste que escrevi dizia "refresh → A continua, pela
persistência prevista", e a persistência prevista não persiste. A asserção
verificava que a regra *consulta* o `moduleState`, não que ele sobrevive.

### 7.3 A autoridade certa já existe e não é usada

`content_document_user_states` é persistido no servidor, carregado no workspace
(`editorial-pipeline-context.tsx:480`) e traz `lastOpenedAt` por documento.

É exatamente o que falta na regra: um passo entre a URL e o `documents[0]` que
escolha o documento com `lastOpenedAt` mais recente. Não precisa de tabela nova
nem de migration — a linha já é gravada hoje, a cada abertura.

```text
GAP · ACTIVE_DOCUMENT_DOES_NOT_SURVIVE_RELOAD
lib/redator/active-document.ts — o passo 3 usa moduleState.redator.selectedId,
que é memória React e morre no F5. A autoridade persistida equivalente é
documentUserStates[id].lastOpenedAt, já carregada do servidor. Corrigir é
acrescentar um passo à regra e passar o mapa de user states a ela.
```

### 7.4 A saída imediata, sem esperar código

A URL **é** autoridade e funciona sempre — é o passo 2 da regra:

```text
/{brandRef}/redator?documentId=redator%3A09762023-d0d4-4c24-b34e-d0fdfd43f891%3Aarticle-candidate%3Aterritory%3A9da03dd0-cf37-45c3-8562-20e943aa37bd%3Ae42cd892-c5c8-408d-8f12-8128f5310828
```

Abrindo por aí, o documento ativo é o de **"skincare para pele oleosa"**
independentemente de quantos handoffs tenham chegado. Confirme no painel
esquerdo o rótulo **"· em edição"** antes de começar o ciclo.

---

## 8. Quarta leitura — 08:09 UTC, depois do Corte 6A.10

**Nada mudou desde 05:02.** Os ciclos de reopen/refinalização continuam sem
chegar ao banco, então o Corte 6A continua aberto.

| | |
| --- | --- |
| entregáveis | `carousel` e `video_script`, ambos `approved`, `lock_version` 5, `updated_at` 05:02 |
| versões | 4 — duas `Rascunho inicial.` (v1), duas `Finalização do entregável.` (v2) |
| `previous_version_id` | `null` nas quatro · `superseded_at` e `purge_after` vazios |
| `content_document_versions` | 0 |
| `publication_records` | 0 |
| `writer_media_assets` | 9 |
| último `last_opened_at` | 07:14:27 — ainda "skin care noturno" |

### 8.1 O gap do §7.3 foi fechado

`ACTIVE_DOCUMENT_DOES_NOT_SURVIVE_RELOAD` está corrigido. O passo do
`lastOpenedAt` entra entre a URL e o `documents[0]`, e a gravação do
`last_opened_at` passou a ser condicionada à origem da resolução — era ela que
contaminava a autoridade quando a resolução caía no fallback.

Sem migration, sem tabela nova, sem `localStorage`. Detalhe em
`corte-6a-10-documento-ativo-f5-2026-09-19.md`.

### 8.2 O que a correção não faz

Ela impede contaminação **nova**. A que já está gravada continua lá: hoje o
`lastOpenedAt` mais recente é o de "skin care noturno" (07:14), não o do
documento que precisa de homologação (06:24).

Na próxima abertura, a regra vai escolher — corretamente, pela regra — o
documento errado. **Um clique** em "skincare para pele oleosa" na lista da
esquerda resolve, e a partir daí ele atravessa F5, reordenação e handoff novo.

---

## 9. Quinta leitura — 08:16 UTC, Corte 6A.11

**Nada mudou.** Nem desde 08:09, nem desde 05:02:58. Tabelas lidas inteiras, sem
filtro: 2 documentos, 2 entregáveis, 4 versões, 2 linhas de estado de usuário.

### 9.1 Duas provas que não dependem de leitura fina

**`lock_version` continua 5.** O gatilho
`pipeline_editorial_touch_lock_version` não tem cláusula `WHEN` — dispara em
todo `UPDATE`. **Reabrir para edição, sozinho, já o bumparia.** Ele não se mexeu,
então nenhum `UPDATE` de qualquer natureza tocou os entregáveis desde 05:02:58.

**`last_opened_at` continua 07:14:27.** A tela grava esse campo a cada abertura
de documento. O valor mais recente continua sendo o de "skin care noturno", e o de
"skincare para pele oleosa" continua em 06:24:12. Quer dizer: **a tela do Redator
não foi aberta** desde 07:14 — antes, inclusive, de a correção do 6A.10 existir.

### 9.2 A correção do 6A.10 nunca foi carregada

Os arquivos foram ao disco às 08:04:59 UTC; o último sinal da tela é de 07:14:27.
Não há sobreposição. O que dá para verificar sem a interface está verificado —
`tsc` 0, eslint limpo, 264/264 com quatro testes estruturais sobre a tela, e
`documentUserStates` é campo obrigatório já lido por um efeito anterior a esta
rodada. Sobra o risco de erro de runtime na montagem, que só um carregamento real
fecha.

### 9.3 O passo que corta a investigação

Abrir a tela do Redator e nada mais. Se `last_opened_at` se mover em um segundo,
a tela está viva neste banco e o ciclo vale a pena; se não se mover, o problema
não é lifecycle nem documento ativo — é que esta tela não está chegando aqui.

Detalhe em `corte-6a-11-readback-definitivo-2026-09-19.md`.

---

```text
FINALIZED_MEDIA_PREVIEW_UI = NOT_OBSERVABLE_BY_READBACK (preview não deixa traço)
FINALIZED_MEDIA_MUTATION_BLOCKED = YES (nenhuma mídia mudou; a recusa não escreve,
                                        então não distingo tentativa de ausência)

REOPEN_UNCHANGED_UI = NOT_EXECUTED
  UNCHANGED_CREATED_NEW_VERSION = NO (vacuamente)
  UNCHANGED_STARTED_RETENTION = NO (vacuamente)

REFINALIZATION_CHANGED_UI = NOT_EXECUTED
  NEW_VERSION_PREVIOUS_CORRECT = NOT_EXECUTED
  PREDECESSOR_SUPERSEDED = NO
  PREDECESSOR_PURGE_AFTER_48H = NOT_EXECUTED
  CURRENT_VERSION_PURGE_AFTER_NULL = YES (vacuamente)

ARTICLE_FINALIZATION_UI_E2E = NOT_EXECUTED
SCRIPT_FINALIZATION_UI_E2E = PASS na primeira finalização · restante NOT_EXECUTED
CAROUSEL_FINALIZATION_UI_E2E = PASS na primeira finalização · restante NOT_EXECUTED
F5_PERSISTENCE = PASS
PUBLICATION_AUTOMATIC = NO

CODE_MODIFIED_THIS_ROUND = NO
REMOTE_DATA_MODIFIED = NO
CORTE_6A_EDITOR_LIFECYCLE_READY_TO_CLOSE = NO

/* segunda leitura, 06:32 — depois do Corte 6A.8 */
UI_WRITES_TO_DATABASE = CONFIRMED (handoff do Radar gravou às 06:20)
SESSION_VALID = CONFIRMED
DELIVERABLE_WRITES_SINCE_0503 = 0
LIKELY_CAUSE = documento recém-importado selecionado por padrão (ver §6.3)

/* terceira leitura, 07:52 — depois do Corte 6A.9 */
ACTIVE_DOCUMENT_AT_0714 = "skin care noturno"   (o errado — user_states prova)
NEW_HANDOFF_BECAME_ACTIVE = YES, após recarregamento
ACTIVE_DOCUMENT_SURVIVES_LIST_REFRESH = NO   (corrige o que afirmei no 6A.9)
CAUSE = moduleState é memória React e morre no F5 (ver §7.2)
FIX_AVAILABLE_WITHOUT_MIGRATION = YES — documentUserStates.lastOpenedAt (§7.3)
WORKAROUND = abrir por ?documentId= (§7.4)

/* quarta leitura, 08:09 — depois do Corte 6A.10 */
ACTIVE_DOCUMENT_DOES_NOT_SURVIVE_RELOAD = FIXED (§8.1)
DELIVERABLE_WRITES_SINCE_0503 = 0
REOPEN_REFINALIZE_CYCLES_IN_DATABASE = 0
CONTAMINATED_LAST_OPENED_AT_REMAINS = YES — 07:14 no documento errado (§8.2)
MANUAL_UI_VALIDATED = NO
CORTE_6A_EDITOR_LIFECYCLE_READY_TO_CLOSE = NO

/* quinta leitura, 08:16 — Corte 6A.11 */
DELIVERABLE_UPDATES_SINCE_0503 = 0 (lock_version continua 5 — §9.1)
SCREEN_OPENED_SINCE_0714 = NO (last_opened_at congelado — §9.1)
CORTE_6A10_FIX_EVER_LOADED = NO (arquivos em 08:04:59, tela parou em 07:14 — §9.2)
REOPEN_REFINALIZE_CYCLES_IN_DATABASE = 0
FALSE_LAST_OPENED_CONTAMINATION_CORRECTED_BY_REAL_SELECTION = NO
SERVER_SIDE_MEDIA_GUARDS_PRESENT = YES
FINALIZED_MEDIA_PREVIEW_UI = NOT_CONFIRMED
PUBLICATION_RECORD_CREATED_AUTOMATICALLY = NO
MANUAL_UI_VALIDATED = NO
```
