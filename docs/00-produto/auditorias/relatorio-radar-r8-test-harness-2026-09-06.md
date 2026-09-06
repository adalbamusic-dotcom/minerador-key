# RADAR R8 — Chão de prova do Radar — 2026-09-06

Lote de infraestrutura de testes. Nenhuma funcionalidade editorial nova.
`PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` · `PRODUCTION_CODE_CHANGED = 0`.

Estado de partida: `RADAR_TEST_HARNESS_READY = NO`, 36 arquivos órfãos,
execução manual 169/167/2.
Estado de chegada: **`npm run test:radar` · 36 arquivos · 178 testes · 178
pass · 0 fail**.

---

## IMPLEMENTED

### 1. Inventário e classificação

Antes de escolher o padrão, os 375 arquivos de `tests/` foram classificados
por importação real (`lib/radar`, `modules/radar`, leitura de fonte do Radar):

| Classe | Qtd. | Entra em `test:radar`? |
| --- | ---: | --- |
| `RADAR_OWNED_TEST` | **36** | **sim** — todos |
| `ARQUITETO_OWNED_RADAR_HANDOFF_TEST` | 2 | não — `arquiteto-radar-handoff-context`, `arquiteto-radar-handoff-gate`; já rodam em `test:arquiteto` e testam o **emissor** |
| `CROSS_MODULE_CONTRACT_TEST` | 5 | não — `arquiteto-serp-formation`, `editorial-pipeline`, `identity-keyword-colors`, `operational-flow`, `ui-display-language-humanization`; pertencem às suítes dos seus donos |

**Resultado do inventário:** o conjunto `RADAR_OWNED_TEST` coincide
exatamente com o prefixo `radar-`. Nenhum teste proprietário do Radar vive
fora da convenção de nome, e nenhum arquivo de outro dono usa o prefixo. O
glob é, portanto, uma partição exata — não uma aproximação.

### 2. Script canônico

```json
"test:radar": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --experimental-loader ./tests/integrations-runtime-loader.mjs --test \"tests/radar-*.test.mts\""
```

Três decisões, cada uma com sua razão:

**Descoberta por glob, não por lista.** `tests/radar-*.test.mts` entre aspas —
o Node 24 expande o padrão internamente, então o script funciona igual no
`cmd.exe` do Windows (que não expande globs) e no shell POSIX. Um teste novo
que siga a convenção do módulo entra sozinho. É a diferença central em relação
a `test:arquiteto`, cuja lista manual de 100 arquivos é exatamente o mecanismo
que deixou 36 arquivos apodrecerem.

**Loader já existente do repositório.** `tests/integrations-runtime-loader.mjs`
é a convenção que o repo já usa em `test:integrations-runtime`. Ele resolve
alias `@/`, resolve especificador relativo sem extensão, transpila TS e
neutraliza `server-only` / `next/headers`. Nenhum arquivo novo de
infraestrutura foi criado.

**Dois `--disable-warning`.** `MODULE_TYPELESS_PACKAGE_JSON` acompanha o padrão
das outras suítes; `ExperimentalWarning` silencia o aviso de depreciação do
`--experimental-loader`, que polui a saída sem informar nada acionável.

### 3. Fixture de `radar-hydration` — reconstruída, não remendada

**Causa revalidada e confirmada:** a fixture montava o `ArticleDNA` com cinco
campos e `as any`. O contrato vigente exige `confidence`
(`lib/arquiteto/contracts.ts:911`), de onde `fallbackHierarchyStrategy`
(`strategic-context.ts:267-274`) tira `score` e os cinco `components`, e
`fallbackPurpose` (`:253-262`) tira `summary`, `audienceNeed`, `searchNeed` e
`semanticScope`. Sem esses campos o caminho de compatibilidade produzia uma
estratégia inválida e o `ZodError` estourava dentro do código de produção.

**Correção aplicada:** a fixture agora é **parseada pelo schema vigente** —
`ArticleDNASchema.parse({...})`, sem `as any`, com as três
`ArticleKeywordReferenceSchema` completas. Uma mudança futura do ArticleDNA
passa a falhar **nessa linha, com o nome do campo**, antes de qualquer teste
rodar.

Nenhum schema foi enfraquecido. Nenhum campo obrigatório virou opcional.
Nenhum arquivo de produção foi tocado.

### 4. `radar-persistence` — nunca esteve quebrado, estava inalcançável

**Causa revalidada:** `lib/server/serp-persistence-adapter.ts:1-3` usa três
imports relativos sem extensão. O runner ESM do Node não resolve, e o arquivo
de teste inteiro morria em `ERR_MODULE_NOT_FOUND` — não era uma falha, era
ausência.

**Achado que muda o enquadramento:** importar sem extensão **não é um defeito
daquele arquivo — é a norma do repositório**. A varredura encontrou **264
arquivos** em `lib/` com o mesmo padrão, praticamente todo o `lib/server/**`.
Esses módulos só são carregados pelo bundler do Next, que resolve sem
extensão. Não há nada a consertar em produção: há um runner que precisava do
loader que o repositório já tem.

**Correção aplicada:** nenhuma. O arquivo executa sob o loader e **os 10
testes passam** — sem uma linha alterada, nem no teste, nem na produção.

---

## TESTED

### `npm run test:radar`

```text
tests 178 · suites 0 · pass 178 · fail 0 · cancelled 0 · skipped 0 · todo 0
duration_ms 4272
exit code 0
```

### Prova de execução por arquivo

O reporter agrega os testes sem nomear o arquivo de origem, então a lista foi
derivada deterministicamente: cada um dos 36 arquivos foi executado
isoladamente e a soma conferida contra a execução agregada.

| Arquivo | testes | | Arquivo | testes |
| --- | ---: | --- | --- | ---: |
| `radar-analysis-readback` | 3 | | `radar-r2-screens` | 4 |
| `radar-analysis` | 5 | | `radar-r3-workbench` | 13 |
| `radar-canonical-navigation` | 4 | | `radar-r4-queue` | 7 |
| `radar-competitive-report` | 2 | | `radar-r5-sequential` | 5 |
| `radar-dataforseo-serp` | 8 | | `radar-r6-sequential` | 6 |
| `radar-editorial-identity` | 5 | | `radar-r7-sequential` | 10 |
| `radar-expert-brief` | 13 | | `radar-resolution-envelope` | 4 |
| `radar-expert-contribution` | 4 | | `radar-route-resolution` | 2 |
| `radar-expert-evidence` | 4 | | `radar-serp-curation` | 8 |
| `radar-expert-organization` | 2 | | `radar-serp-hydration` | 2 |
| `radar-extraction` | 3 | | `radar-serp-merge` | 3 |
| `radar-f5-brand-bootstrap` | 2 | | `radar-serp-process-navigation` | 3 |
| `radar-flow-organization` | 5 | | `radar-serp-review-readback` | 5 |
| `radar-hydration` | 2 | | `radar-serper-provider` | 3 |
| `radar-kgr-context` | 6 | | `radar-spreadsheet-selection` | 5 |
| `radar-navigation` | 7 | | `radar-usability` | 3 |
| `radar-persistence` | 10 | | `radar-workbench` | 5 |
| `radar-planner-handoff` | 3 | | `radar-workspace-merge` | 2 |

```text
arquivos executados = 36
soma dos testes     = 178   (idêntica à execução agregada)
arquivos com falha  = 0
```

```text
RADAR_OWNED_TEST_FILES_DISCOVERED   = 36
RADAR_OWNED_TEST_FILES_EXECUTED     = 36
RADAR_OWNED_TEST_FILES_NOT_EXECUTED = 0
```

### Regressão

| Verificação | Antes | Depois |
| --- | --- | --- |
| `test:arquiteto` | 1480 / 1479 / 1 | **1480 / 1479 / 1** — idêntico |
| `npx tsc --noEmit` | 5 erros | **5 erros**, os mesmos, nenhum em `radar` |

A falha remanescente de `test:arquiteto` é a pré-existente do Minerador
(`arquiteto-domain.test.mts:310`), fora do escopo deste lote.

### Regressão do próprio harness

A garantia é a **descoberta por glob**, não um teste de teste. Um arquivo novo
`tests/radar-<qualquer-coisa>.test.mts` entra em `test:radar` sem edição de
script — que é exatamente o que a lista manual de `test:arquiteto` não oferece.

**Limite honesto desta garantia:** ela cobre a convenção de nome, não a
intenção. Um teste proprietário do Radar batizado fora do prefixo `radar-`
continuaria órfão. Hoje isso não acontece em nenhum dos 36 arquivos, e a
verificação é uma linha (`comparar tests/radar-*.test.mts com os arquivos que
importam lib/radar ou modules/radar`). Não criei meta-framework para isso.

---

## PENDING

| # | Item | Observação |
| :-: | --- | --- |
| P1 | `test:radar` fora da cadeia de `npm test` | Incluí-lo mudaria o comando canônico do repositório — governança, não Radar. E `npm test` hoje aborta em `test:authz`. |
| P2 | Cobertura das mutações do B2 | Ver abaixo: três das quatro mutações de workflow do Radar não têm teste algum. |
| P3 | `test:arquiteto` continua com lista manual de 100 arquivos | Mesmo mecanismo de apodrecimento; dono é o Arquiteto. |

### P2 — o que a suíte nova cobre e o que não cobre (registro, sem correção)

| Símbolo | Testes que o citam | Em `tests/radar-*`? |
| --- | --- | :-: |
| `transition_radar` | **0** | não |
| `import_planner` | **0** | não |
| `importApprovedToPlanner` | **0** | não |
| `importApprovedSiloPagesToRadar` | 1 — `arquiteto-silo-phase-2c-closure` | não |
| `importRadarToPlanner` | 3 — `arquiteto-article-approval-boundary`, `operational-flow`, `planejador-cockpit` | não |
| `setRadarState` | 1 — `operational-flow` | não |
| `sendWorkflowCommand` | 2 — `arquiteto-radar-handoff-context`, `arquiteto-silo-phase-2c-closure` | não |

Ou seja: as três mutações que atualizam estado local antes do remoto
(`transition_radar`, `import_planner`, `importApprovedSiloPagesToRadar`) **não
têm nenhum teste que cubra a ordem entre local e remoto**. O que existe cobre
a projeção pura (`importRadarToPlanner`, `setRadarState`), não o efeito
colateral. Registrado; não corrigido.

---

## BLOCKED_EXTERNALLY

Registrados, intocados.

**B1 — import Arquiteto → Radar recusado.** `ResolvedSiloContext.siloIdProvenance`
→ `handoffContext.silo` → `WorkflowCommandSchema` `.strict()` sem o campo →
`unrecognized_keys` → HTTP 400 → `imported: 0`. Dono: Arquiteto / transporte
compartilhado. Nenhum workaround criado no Radar. Nenhum teste deste lote
mascara o bloqueio.

**B2 — mutações locais antes do remoto.** `transition_radar`, `import_planner`,
`importApprovedSiloPagesToRadar`. Não corrigidas. Cobertura registrada em P2.

**B3 — `npm test` global.** `test:authz` aborta a cadeia `&&`.
`GLOBAL_NPM_TEST_BLOCKED_BY_PLATFORM = YES`. `test:radar` é homologável
independentemente e não depende dessa cadeia.

---

## Fronteiras respeitadas

| Não tocado | Confirmação |
| --- | --- |
| `modules/radar/**` | 0 arquivos alterados |
| `lib/radar/**` | 0 arquivos alterados |
| `lib/server/**`, `lib/arquiteto/**`, `lib/editorial/**` | 0 arquivos alterados |
| `WorkflowCommandSchema`, handoff, aprovação, `RadarEvidencePackage`, `RadarPlannerHandoff` | intocados |
| `lib/radar/report-approval.ts` / `git revert 2e2e9a6` | não executado |
| Campos mortos do handoff | intocados |
| Provider, banco, migration, RLS | nenhum acesso |

**Arquivos alterados neste lote — dois:**

| Arquivo | Mudança |
| --- | --- |
| `package.json` | +1 linha: script `test:radar` |
| `tests/radar-hydration.test.mts` | fixture reconstruída via `ArticleDNASchema.parse` |

As demais entradas de `git status` (`lib/arquiteto/*`, `modules/arquiteto/*`,
`scripts/arquiteto-audit-*`, `tests/arquiteto-*`, e as duas adições em
`test:arquiteto`) são do lote anterior do Arquiteto e foram preservadas.

---

## PRODUCTION_DEFECT_DISCOVERED

```text
PRODUCTION_DEFECT_DISCOVERED = NO
```

Nenhum teste, depois de corrigida a fixture, falhou por comportamento real de
produção. As duas falhas conhecidas eram, ambas, defeito de teste:

- `radar-hydration` — fixture anterior ao contrato vigente do `ArticleDNA`;
- `radar-persistence` — arquivo inalcançável pelo runner, sem loader.

Nenhuma alteração de produção foi feita para obter verde. `RADAR_FUNCTIONAL_BASELINE = PASS`
descreve os 178 testes existentes — **não** significa que o Radar está
funcionalmente homologado: B1 continua fechando o canal de entrada, e a
autoridade de aprovação continua dupla.

---

## Critério de fechamento

| Critério | Resultado |
| --- | --- |
| `npm run test:radar` existe | ✅ |
| Todos os testes proprietários do Radar são executados | ✅ 36/36, `NOT_EXECUTED = 0` |
| Nenhuma fixture inválida conhecida permanece | ✅ ambas revalidadas e corrigidas no lado do teste |
| Nenhuma falha escondida por alteração de produção | ✅ `PRODUCTION_CODE_CHANGED = 0` |

```text
HARNESS_IMPLEMENTED      = YES
RADAR_TEST_HARNESS_READY = YES
RADAR_FUNCTIONAL_BASELINE = PASS
R8 = PASS
```

---

## Próximo lote recomendado

**R9 — Autoridade única de aprovação do Radar.**

É o que o R8 existiu para proteger. A suíte agora cobre `radar-r6-sequential`
(6), `radar-r7-sequential` (10), `radar-planner-handoff` (3),
`radar-serp-review-readback` (5) e `radar-analysis-readback` (3) — as áreas que
a unificação move — e roda por um comando.

Pré-condição de leitura, não de execução: R9 mexe em `modules/radar/**` e em
`lib/radar/**`, e sua homologação ponta a ponta depende de **B1 resolvido pelo
Arquiteto**, porque sem import não há artigo novo para aprovar. A parte de
domínio e persistência é testável por fixture desde já.

Sugestão de sequência caso B1 demore: R9 entrega a autoridade única e seus
testes; a homologação autenticada fica como gate separado, explicitamente
pendente, em vez de bloquear o lote inteiro.
