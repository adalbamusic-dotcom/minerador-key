# RADAR R9.2 — Operacionalização pós-coleta e reconstrução remota — 2026-09-06

`PROVIDER_CALLS = 0` · `REMOTE_WRITES_FROM_AUTOMATED_TESTS = 0` ·
`R9_APPROVAL_AUTHORITY_CHANGED = NO` · `R9_1_COLLECTION_CHANGED = NO`.

O snapshot v1 de `mascara de skincare` foi **preservado**. Nenhuma coleta nova.

---

## REMOTE_READ_ONLY_VERIFIED

Leituras `SELECT` executadas contra a marca `09762023-…f891`. Zero escritas,
zero provider, nenhum segredo impresso.

### A resposta simples, primeiro

```text
REMOTE_RADAR_ITEM_EXISTS    = YES
REMOTE_SERP_SNAPSHOT_EXISTS = YES
```

**A hipótese principal foi falsificada.** Não são "dois artigos legados locais
sobre um snapshot persistido". Os `RadarItem` existem no banco.

### Os três RadarItem remotos (`stage = radar`)

| workflowItemId | articleId | state | articleDnaVersionId | siloId | hydration | analysisVersions |
| --- | --- | --- | --- | --- | :-: | ---: |
| `eb32458e…9da1` | `article-candidate:territory:83ce07d2…:698d5668…` | `research_pending` | `4bfca609…4849` | **`working-silo:1`** | sim | 0 |
| `e509fc16…f918f` | `article-candidate:territory:83ce07d2…:2962d218…` | `research_pending` | `bb3a18a7…6316` | **`working-silo:1`** | sim | 0 |
| `50778108…d235c` | `group-11aenvf` | `research_pending` | `d6aca87b…6fe4` | `ebdb5bc3…df0` (UUID) | sim | 12 |

Criados em 05/09 (os dois novos) e 25/08 (o legado). Os títulos são
`"Cobrir com clareza o tema 'mascara de skincare'."` e
`"… 'serum facial principia'."` — exatamente as duas linhas da planilha.

> **Confirmação empírica do diagnóstico do R9.1.** `payload.siloId =
> "working-silo:1"` é literalmente o id não-UUID que o R9.1 previu:
> `canonicalUuidCandidates` o descartava e `minerador_keyword_lists` jamais o
> teria. O artigo legado, esse sim, tem UUID e por isso nunca falhou. A
> correção do R9.1 está validada contra o dado real.

### Os snapshots remotos

| articleId | v | provider | orgânicos | resolutionMode | canonicalRemoteVerified |
| --- | :-: | --- | ---: | --- | :-: |
| `article-candidate:…698d5668…` | **1** | dataforseo | **7** | `remote_canonical` | **true** |
| `group-11aenvf` | 1–3 | dataforseo | 8 | `remote_canonical` | true |

O snapshot de `mascara de skincare` está persistido, íntegro, com
`brandId`/`articleId`/`articleDnaVersionId` corretos. `remote_canonical`
significa que a keyword foi resolvida pelo vínculo remoto — não houve fallback.

### Integridade do payload do workspace

Reproduzi os parses da rota com os normalizadores reais:

```text
article_dna   96 ok / 0 falha
silo_dna       3 ok / 0 falha
snapshots      4 ok / 0 falha
serp_reviews   2 ok / 0 falha
radar rows     3 ok / 0 falha   (RadarItemSchema)
WORKSPACE_PARSE_FAILURES = 0
```

---

## DIAGNOSED — Parte B (cross-browser)

### Matriz

```text
CASO B — RadarItem remoto = YES · SerpSnapshot remoto = YES · outro navegador = vazio
```

### Duas hipóteses testadas e derrubadas

**H1 — `WorkflowRepository.list` usa `.parse` e uma linha ruim derruba o
workspace inteiro.** O mecanismo é real (`editorial-repositories.ts:102-103`,
sem `safeParse`, sem isolamento por linha), mas **as três linhas passam**.
Fica registrado como fragilidade estrutural, não como a causa aqui.

**H2 — o cliente descarta os itens na reconciliação.** Não descarta.
`mergeRadarItemsPreservingLocalState` (`workspace-merge.ts`) preserva os dois
lados e `reconcileRadarItems` (`hydration.ts:143-157`) é um `.map` puro — sem
`filter`, sem descarte. Ambos cobertos por teste novo.

### O que sobra

Os dados estão íntegros no servidor e o cliente não os perde. Logo a resposta
do workspace **não chegou** ao segundo navegador — `reloadOperational` só marca
`persistenceMode` e **deixa `radarItems` intocado** quando `!response.ok`
(`editorial-pipeline-context.tsx:287-290`). Com recuperação local vazia, o
resultado é uma tela vazia.

O espaço restante é **sessão/autorização** (`requireCanonicalSessionProfile` →
401, ou `assertEditorialPermission(profile, marcaId, "marca", "view")` → 403)
ou falha de transporte. Não é hidratação, e não é dado.

```text
CROSS_BROWSER_ROOT_CAUSE = LOAD_RESPONSE_NOT_APPLIED — dados remotos íntegros e
    cliente sem descarte; a resposta do workspace não chegou ao 2º navegador.
    Espaço restante: sessão/autorização (CASO D) ou transporte.
CROSS_BROWSER_FIX_OWNER = RADAR (diagnóstico visível) + PLATAFORMA (sessão)
CROSS_BROWSER_BLOCKED_BY_ARCHITECT_IMPORT = NO
```

**O B1 não explica isto.** Os itens já estão no banco; importar de novo não era
o que faltava.

### De onde vem cada linha hoje

```text
ARTICLE_1_SOURCE ("mascara de skincare")  = MERGED (remoto existe; sessão 1 também tem recovery)
ARTICLE_2_SOURCE ("serum facial principia") = MERGED (idem)
SNAPSHOT_SOURCE   = REMOTE (confirmado por SELECT)
LOCALSTORAGE_REQUIRED_TO_DISCOVER_ARTICLE = NO no servidor · SIM hoje no 2º navegador,
    porque a resposta remota não está sendo aplicada lá
```

---

## DIAGNOSED — Parte A (pós-coleta)

### O handler existe, está ligado e o gate passa

| Pergunta | Resposta |
| --- | --- |
| 1. `Iniciar curadoria` tem handler? | **Sim** — `startSerpAnalysis` (`radar-page.tsx`) |
| 2. É chamado? | **Sim** — `onStartAnalysis` → botão em `radar-r3-serp-panel.tsx:85` |
| 3. O que cria? | primeira `RadarAnalysisVersion` do snapshot, via `createRadarAnalysisVersion` |
| 4. Working copy? | **Sim** — a própria versão de análise, com `serpDecisions` em `pending` |
| 5. Decisões temporárias? | em `analysis.payload.serpDecisions` |
| 6. Quando persistem? | a cada decisão, por sucessora + `saveRadarAnalysis` com readback |
| 7. `USAR` depende de? | `analysis` existir — `canChangeDecisions = Boolean(analysis && onDecisionChange && …)` |
| 8. `CLASSIFICAR` depende de? | do mesmo `analysis` |
| 9. Por que os 7 não avançam? | porque a curadoria não foi iniciada; sem análise não há onde gravar decisão |
| 10. Por que `pendentes = 0`? | **defeito de projeção** — ver abaixo |

Testei o snapshot **real** contra o gate de `startSerpAnalysis`:

```text
view? true · research? true · legacy? false · partial? false
PODE INICIAR CURADORIA = SIM
```

### Causa classificada

```text
D = projeção de read model incorreta   (contadores)
+ recusa muda no handler               (clique sem resposta)
```

Não é `A` (handler ausente), nem `B` (não ligado), nem `E` (controles
indevidamente disabled — eles dependem de `analysis`, o que é correto), nem
`G` (o snapshot está associado).

**O contador mentia.** `pendingDecisions` conta decisões pendentes **dentro de
uma análise**; sem análise a projeção é vazia e o número dá `0`. A tela exibia
`Decisões pendentes: 0` ao lado de sete linhas dizendo `Aguardando decisão`.
Zero ali não significava "nada a fazer" — significava "não há onde registrar".

**E o clique podia ficar mudo.** O guard de entrada de `startSerpAnalysis`
devolvia `void` em silêncio quando outra ação estava em voo: sem sucesso, sem
erro, sem motivo.

---

## IMPLEMENTED

| # | Mudança | Arquivo |
| :-: | --- | --- |
| 1 | `RadarSerpCurationSummary` ganha `curationStarted`, `observedResults` e `awaitingCuration`; `pendingDecisions` mantém a semântica antiga (aditivo, retrocompatível) | `lib/radar/serp-curation.ts` |
| 2 | O painel troca o rótulo: `Aguardando curadoria: 7` antes de iniciar, `Decisões pendentes: N` depois | `modules/radar/radar-r3-serp-panel.tsx` |
| 3 | Cada recusa de `Iniciar curadoria` declara o motivo em vez de retornar em silêncio | `modules/radar/radar-page.tsx` |
| 4 | O estado vazio distingue "marca sem artigos" de "não consegui carregar do servidor" | `modules/radar/radar-page.tsx` |

Nada foi redesenhado. Nenhuma categoria nova de curadoria foi inventada — o
contrato `serpDecisions` existente é o mesmo. Abrir a curadoria continua
criando a **primeira versão**, nunca uma sucessora consolidada (teste garante).

O item 4 é o que destrava o próximo passo do cross-browser: hoje o segundo
navegador dizia *"Nenhum artigo importado"* — uma afirmação sobre **ausência de
dado** quando o estado real é **falha de carregamento**. É a mesma classe de
defeito que o R9.1 corrigiu na mensagem do Silo.

---

## TESTED

```text
npm run test:radar
tests 213 · pass 213 · fail 0 · exit 0
arquivos = 39 · não executados = 0
```

`tests/radar-post-collection.test.mts` (7 testes) cobre: contador honesto sem
curadoria (G), rótulo trocado no painel (G), curadoria sem provider e sem SERP
nova (B, C), recusa declarada, resultados visíveis com seleção controlando só a
ação (E, F), loader que não inventa persistência (N) e merge/reconciliação que
preserva os dois lados sem descarte (L, M, O).

| Regressão | Antes | Depois |
| --- | --- | --- |
| `test:radar` | 206 / 206 | **213 / 213** |
| `tsc --noEmit` | 5 erros | **5**, os mesmos, nenhum em Radar |
| `eslint` radar | limpo | **limpo** |

Itens **não** cobertos por teste automatizado, por dependerem de interação
real: D (classificar um resultado), H/I (gate da análise), J (troca de artigo),
K (F5 reconstruindo curadoria persistida). Ficam no roteiro manual.

---

## MANUAL_UI_VALIDATION

Nada executado. Roteiro, sem recoletar:

```text
1. Selecionar "mascara de skincare". SERP → Concorrentes.
2. Conferir: "Aguardando curadoria: 7" (não mais "Decisões pendentes: 0").
3. Clicar "Iniciar curadoria". Esperado: análise v1 criada, write + readback.
   Se recusar, agora há motivo escrito.
4. Classificar os 7 resultados. Conferir que o contador vira "Decisões
   pendentes" e desce a cada decisão.
5. Conferir que resultados ignorados continuam visíveis.
6. Análise → confirmar que só a seleção humana entra.
7. F5 → curadoria persistida reaparece.
8. No 2º navegador, autenticado com acesso a Care Glow: se aparecer a mensagem
   de falha de carregamento, o problema é sessão/transporte; se aparecer
   "Nenhum artigo importado", é dado — e sabemos que não é.
```

---

## BLOCKED_EXTERNALLY

**B1** (`siloIdProvenance` → `WorkflowCommandSchema.strict()` → HTTP 400 no
`import_radar`) — intocado. **Não participa** do cross-browser: os itens já
estão persistidos.

**B2** (mutações locais antes do remoto) e **B3** (`npm test` global) —
intocados.

**Fragilidade registrada, não corrigida:** `WorkflowRepository.list` e
`ArtifactRepository.list` usam `.parse` por linha sem isolamento. Hoje nenhuma
linha falha, mas uma única linha inválida derrubaria o workspace inteiro de
todos os módulos. É correção compartilhada, fora do escopo deste lote.

---

## Retorno

```text
POST_COLLECTION_FLOW_OPERATIONAL = PENDING_MANUAL_CONFIRMATION
    gates provados satisfeitos contra o snapshot real; handler existe, está
    ligado e agora fala; contadores honestos. Falta o clique humano.

CURATION_START_HANDLER_EXISTS = YES
CURATION_CAN_START = YES (gate verificado contra o snapshot v1 real)
RESULTS_CAN_BE_CLASSIFIED = YES após iniciar a curadoria (dependem de `analysis`)
CURATION_COUNTERS_CORRECT = YES
ANALYSIS_GATE_OPERATIONAL = YES por contrato; confirmação manual pendente

REMOTE_RADAR_ITEM_EXISTS = YES (3 itens)
REMOTE_SERP_SNAPSHOT_EXISTS = YES (4 snapshots; mascara de skincare v1, 7 orgânicos)

ARTICLE_SOURCE = MERGED (remoto existe para os dois)
SNAPSHOT_SOURCE = REMOTE

CROSS_BROWSER_ROOT_CAUSE = LOAD_RESPONSE_NOT_APPLIED (sessão/autorização ou transporte)
CROSS_BROWSER_FIX_OWNER = RADAR (tornar visível) + PLATAFORMA (sessão)
CROSS_BROWSER_BLOCKED_BY_ARCHITECT_IMPORT = NO

LOCALSTORAGE_REQUIRED_TO_DISCOVER_ARTICLE = NO (o remoto tem os itens)

RADAR_TEST_FILES_EXECUTED = 39/39
RADAR_TESTS_TOTAL = 213
RADAR_TESTS_PASS = 213
RADAR_TESTS_FAIL = 0

PROVIDER_CALLS = 0
REMOTE_WRITES_FROM_AUTOMATED_TESTS = 0

R9_APPROVAL_AUTHORITY_CHANGED = NO
R9_1_COLLECTION_CHANGED = NO

NEXT_RECOMMENDED_ACTION = executar o roteiro manual acima. O passo 8 decide o
    cross-browser em um minuto: com a mensagem nova, a tela passa a dizer se
    não carregou em vez de afirmar que a marca está vazia.
```
