# RADAR R9.4B — Jornada operacional e modelo competitivo observado

Data: 2026-09-07 · Área: Radar · Lote: R9.4B
`REAL_PROVIDER_CALLS = 0` · `REMOTE_WRITES_DURING_TESTS = 0` ·
`EXTERNAL_PAGE_REAL_FETCH = 0` · `MIGRATIONS = 0`. O snapshot v1 continua preservado.

---

## 0 · O que este lote corrige

O R9.4 entregou campos. O smoke manual falhou no critério de produto porque
campo não é jornada: a tela media H2, H3, palavras e imagens, mas não dizia
onde a pessoa estava, o que apertar agora, nem produzia o relatório que o
próprio card anunciava como concluído.

Três defeitos concretos, na ordem em que foram sentidos:

1. **O card somava frases verdadeiras e produzia uma leitura falsa.** "SERP
   concluída" + "Revisão aprovada" ao lado de "Análise reaberta" + "Relatório
   aguardando geração". Coleta concluída virou sinônimo de investigação
   concluída.
2. **O relatório não existia.** O botão dizia "Gerar relatório local" e a
   própria mensagem admitia que nenhuma versão remota era criada. Era um
   booleano de sessão. A pergunta "cadê o relatório?" estava certa.
3. **A tabela do DNA vinha vazia e o Radar seguia calado**, o que fez a lacuna
   de contexto do Arquiteto parecer resultado pobre da SERP.

---

## 1 · Estado composto: uma leitura, uma ação

`lib/radar/investigation-state.ts` (novo, domínio puro) define seis etapas —
`SERP_COLLECTION`, `SERP_CURATION`, `COMPETITIVE_ANALYSIS`,
`COMPETITIVE_MODEL`, `COMPETITIVE_REPORT`, `FINAL_REVIEW` — e devolve UMA
leitura do conjunto: `headline`, `state`, `stages[]`, `action` e `nextAction`.

O título nunca diz que a SERP está concluída quando o que terminou foi a
coleta. Os cinco títulos possíveis são: *Investigação não iniciada*,
*Investigação competitiva em andamento*, *Investigação reaberta*, *Aguardando
revisão final*, *Investigação competitiva aprovada*.

A ação primária é uma só por momento, com verbo de produto:

| Estado | Ação primária |
|---|---|
| Sem snapshot | `Iniciar coleta SERP` |
| Snapshot sem curadoria | `Iniciar curadoria` |
| Decisões pendentes | `Decidir N resultado(s) pendente(s)` |
| Nenhuma referência marcada | `Selecionar referências` (desabilitada, com motivo) |
| Amostra sem extração | `Iniciar análise competitiva (N)` |
| Extrações pendentes | `Analisar referências pendentes (N)` |
| Sem modelo | `Consolidar modelo competitivo` |
| Sem relatório | `Gerar relatório competitivo` |
| Relatório sem revisão | `Revisar investigação` |
| Revisado | `Aprovar investigação` |
| Aprovado | `Preparar para o Planejador` |

Quando a ação não pode ser executada, ela aparece desabilitada **com o motivo
escrito** — `nextAction` devolve o `blockedReason` no lugar do rótulo. Clique
mudo deixou de ser um estado possível.

`radarSerpCurationBadge()` mantém o selo da curadoria SERP visível **ao lado**,
nunca no lugar, do estado da investigação: *Curadoria SERP não aprovada* /
*aprovada* / *aprovada em versão anterior*.

Evidência: **Confirmado por teste** — `tests/radar-investigation-flow.test.mts`
(8 testes), incluindo a jornada completa `START → COLLECTED → CURATING →
CURATED → ANALYZED → MODEL_READY → REPORT_READY → REVIEWED → APPROVED` com
`action.id`, rótulo e `state` determinísticos em cada passo, e a invariante de
que nenhuma etapa repete a ação da anterior.

---

## 2 · Modelo competitivo observado

`lib/radar/competitive-model.ts` (novo) transforma medição em leitura.

- **`RadarModelMeasure`** carrega `kind` (`absent` / `single_page` /
  `distribution`), `median`, `centralRange` (a faixa **depois** de separar
  outliers), `fullRange` (a faixa crua, preservada), `outliers[]` e `sources[]`
  com URL, título e valor por página.
- **Outlier** é regra explicável: acima de 3× ou abaixo de 1/3 da mediana, com
  no mínimo três páginas. O artigo de 15.944 palavras numa amostra de mediana
  1.056 não descreve o que os concorrentes fazem — descreve outra coisa que
  apareceu na mesma busca. Ele sai da faixa central e **continua visível**,
  nomeado.
- **`RadarTopicPattern`** dá a ordem temática: tópico, em quantas páginas
  aparece, quantas vezes como H2, quantas como H3, posição média no documento
  e a lista de ocorrências por página.
- Blocos: identidade (consulta, intenção observada, formato que compete),
  amostra (analisadas / comparáveis / excluídas com motivo), estrutura,
  abertura, organização, fechamento, semântica, formatação, principal, links,
  lacunas, oportunidades (`DERIVED_OPPORTUNITY`) e limitações.

Na UI (`modules/radar/radar-r3-serp-panel.tsx`, `data-testid=
"radar-competitive-model"`), cada medida mostra o rótulo legível, os outliers
nomeados e um `<details>` "Ver páginas (N)" com a rastreabilidade por página.
O componente `ObservedRadiography` foi substituído por `CompetitiveModel`.

Evidência: **Confirmado por teste** — `tests/radar-contexto-editorial.test.mts`
(round-trip do schema) e `tests/radar-competitive-benchmark.test.mts`
(separação de outlier, amostra de uma página, exclusão de não comparáveis).

---

## 3 · O relatório passou a existir

`observedCompetitiveModel` entra como **bloco aditivo dentro de
`RadarCompetitiveReport`** — `RadarCompetitiveModelSchema.nullable()
.default(null)`. Nenhuma entidade persistente nova: o modelo vive na versão da
análise que o produziu, e relatórios antigos continuam parseando.

`RadarCompetitiveModelSchema` é `.strict()` e o compilador confere que schema e
tipo descrevem a mesma coisa (`CONTRATO_DO_MODELO` em `competitive-model.ts`):
um campo novo no modelo que esquecer o schema falha em `tsc`, não em produção.

`generateReportForArticle` em `modules/radar/radar-page.tsx` deixou de ser um
flag de sessão. Agora ele:

1. recusa quando falta SERP, ArticleDNA, amostra ou quando ainda há referências
   selecionadas não analisadas — com a razão escrita;
2. constrói o relatório da versão via `buildRadarCompetitiveReport`, já com o
   modelo dentro;
3. cria a **sucessora** da análise com `createRadarAnalysisSuccessor`;
4. persiste e **só marca revisão local quando o readback remoto confirma**.

Os rótulos acompanharam: `Gerar relatório local` → **`Gerar relatório
competitivo`**; `Atualizar prévia local` → **`Gerar relatório competitivo
novamente`**.

`reportReady` deixou de significar "existe um objeto relatório" e passou a
significar "existe o modelo observado desta amostra". `reportStale` compara o
tamanho da amostra do modelo com as páginas analisadas agora.

---

## 4 · Aprovação final exige o relatório

`radarReportApprovalIssues` (`lib/radar/report-approval.ts`) ganhou duas
recusas:

- `Gere o relatório competitivo desta versão antes de aprovar a investigação.`
- `O relatório desta versão foi gerado antes do modelo competitivo observado;
  gere o relatório novamente antes de aprovar.`

O relatório era construído **dentro** da própria aprovação: a pessoa clicava em
aprovar e o objeto nascia junto com o "aprovado". Ela nunca leu o que estava
assinando. Agora o relatório é um ato anterior e visível.

Duas aprovações permanecem separadas e com nomes distintos: **curadoria SERP**
(a amostra) e **investigação competitiva** (a entrega). O selo histórico da
curadoria continua visível e datado, sem virar conclusão da investigação.

Evidência: **Confirmado por teste** — `tests/radar-report-approval.test.mts`
ganhou três casos (`aprovar sem relatório competitivo desta versão é
recusado`, `relatório gerado antes do modelo observado não fecha a
investigação`, `o relatório da fixture carrega o modelo observado e libera o
portão`) e a fixture padrão passou a descrever o estado real: relatório gerado
antes, aprovação depois.

---

## 5 · Contexto editorial incompleto tem nome e endereço

`lib/radar/editorial-context.ts` (novo, domínio puro) nomeia campo a campo o
que o ArticleDNA entregou — promessa, intenção esperada, keyword principal,
tópicos obrigatórios, cobertura, entidades, perguntas — e, para cada ausência,
**qual capacidade a investigação perde**. Exemplos:

- sem intenção esperada → a intenção observada não tem com o que ser comparada;
- sem principal hidratada → a presença por localização (title, H1, H2,
  abertura) não é medida na amostra;
- sem tópicos obrigatórios → as lacunas dos concorrentes não podem ser cruzadas
  com o que o artigo já promete cobrir.

`radarPrincipalHydrated()` recusa UUID e identificador técnico (`kw-…`) como
keyword: identificador não é keyword hidratada.

O painel (`data-testid="radar-editorial-context"`) aparece no Workbench acima
dos cards, com o título **CONTEXTO EDITORIAL INCOMPLETO**, a lista de
consequências, o detalhe campo a campo e a frase final: a correção é do
Arquiteto, o Radar não edita identidade.

Evidência: **Confirmado por teste** — `tests/radar-contexto-editorial.test.mts`.

---

## 6 · Evidências passou a mostrar o que a SERP produziu

A aba Evidências dizia apenas o que **não** existe (nenhuma ExternalEvidence,
nenhuma ProductEvidence). Depois de uma coleta e uma análise inteiras, ler só
ausências é o que fez a investigação parecer inútil.

O bloco `Observações vindas da SERP` (`data-testid="radar-serp-observations"`)
mostra, a partir do relatório **persistido** — não do cálculo de render —:
tópicos recorrentes com a contagem de páginas, lacunas dos concorrentes com a
evidência, oportunidades derivadas e as limitações da amostra. Quando o
relatório ainda não existe, o bloco diz exatamente isso em vez de ficar vazio.

---

## 7 · Keyword que não chegava à extração

O R9.4 já passou `keyword` de `radar-page.tsx` para
`/api/editorial/radar-analysis/extract` e daí para `extractCompetitorPage`. O
que faltava era a leitura honesta do efeito colateral: páginas extraídas
**antes** desse corte não têm `keywordPlacement`, e o modelo tratava isso como
silêncio.

Agora `model.keyword` é `null` nesse caso e a limitação é explícita: *"As
páginas desta amostra foram extraídas sem a principal informada; a presença por
localização só aparece após reanalisar as referências."* O painel repete a
mesma frase no lugar do bloco.

`KEYWORD_REACHES_EXTRACTION = YES` para extrações novas ·
`PRE_R9_4_PAGES_NEED_REEXTRACTION = YES` (declarado, não silenciado).

---

## 8 · Fronteira preservada

O Radar **observa**; o Planejador **prescreve**. Nada neste lote emite
`finalOutline`, `requiredH2Count`, `requiredWordCount` ou
`requiredKeywordDensity`.

- Medidas saem como mediana, faixa central e faixa cheia — nunca como meta.
- Oportunidades saem rotuladas `DERIVED_OPPORTUNITY` com a frase "Derivadas da
  amostra. Viram decisão editorial somente no Planejador."
- A frequência da principal é observada por localização e ocorrência; a UI diz
  "O Radar não define quantas vezes usar."

```
FINAL_OUTLINE_CREATED_BY_RADAR = NO
FINAL_H2_H3_TARGETS_CREATED_BY_RADAR = NO
FINAL_KEYWORD_DENSITY_CREATED_BY_RADAR = NO
PRESCRIPTIVE_FIELDS_EMITTED = 0
```

---

## 9 · Bloco de flags

```
RADAR_R9_4B_DONE = YES

COMPOSITE_STATE_SINGLE_READING = YES
ONE_PRIMARY_ACTION_PER_STAGE = YES
BLOCKED_ACTION_STATES_REASON = YES
HEADLINE_NEVER_CLAIMS_FALSE_COMPLETION = YES

CANONICAL_REPORT_BUTTON = "Gerar relatório competitivo"
REPORT_IS_SESSION_FLAG = NO
REPORT_BELONGS_TO_ANALYSIS_VERSION = YES
REPORT_WRITE_READBACK = YES
FINAL_APPROVAL_REQUIRES_REPORT = YES
SERP_CURATION_APPROVAL_SEPARATED = YES

OBSERVED_MODEL_PERSISTED = YES (bloco aditivo em RadarCompetitiveReport)
NEW_PERSISTENT_ENTITY = NO
OUTLIERS_SEPARATED_AND_VISIBLE = YES
PER_PAGE_TRACEABILITY = YES
TOPIC_ORDER_OBSERVED = YES

EDITORIAL_CONTEXT_PANEL = YES (CONTEXTO EDITORIAL INCOMPLETO)
EVIDENCE_TAB_SHOWS_SERP_OBSERVATIONS = YES
KEYWORD_REACHES_EXTRACTION = YES
PRE_R9_4_PAGES_NEED_REEXTRACTION = YES

RADAR_TESTS_TOTAL = 240
RADAR_TESTS_FAIL = 0
RADAR_TEST_FILES = 42
TYPECHECK_ERRORS_IN_RADAR = 0

REAL_PROVIDER_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0
EXTERNAL_PAGE_REAL_FETCH = 0
MIGRATIONS = 0
SCHEMA_CHANGES = 0
RLS_CHANGES = 0
COMMITS = 0
SERP_RECOLLECTED = NO (snapshot v1 preservado)

MANUAL_SMOKE_EXECUTED = NO (roteiro na seção 11; execução é humana)
```

---

## 10 · Portão de nove perguntas

1. **A pessoa sabe onde está?** Sim — `headline` + seis etapas rotuladas com
   estado e detalhe. *Confirmado por teste.*
2. **A pessoa sabe o que apertar agora?** Sim — uma ação primária por momento,
   com verbo próprio. *Confirmado por teste.*
3. **Quando não dá para agir, a tela diz por quê?** Sim — `blockedReason` vira
   `nextAction` e aparece no painel. *Confirmado por teste.*
4. **"Concluída" só aparece quando tudo descreve a mesma coisa?** Sim —
   `COMPLETED` exige snapshot, curadoria, análise, modelo, relatório e
   aprovação humana coerentes. *Confirmado por teste.*
5. **O relatório existe como objeto da versão?** Sim — sucessora da análise com
   write e readback; o readback é quem fecha. *Verificado no código.*
6. **A aprovação exige o relatório?** Sim — duas recusas no portão único.
   *Confirmado por teste.*
7. **O modelo é útil, e não números soltos?** Sim — faixa central sem outlier,
   ordem temática, padrão de abertura e fechamento, lacunas, oportunidades e
   rastreabilidade por página. *Verificado no código + Confirmado por teste.*
8. **A lacuna de contexto é distinguível de resultado pobre?** Sim — painel
   nomeado, com consequência por campo e endereço no Arquiteto. *Confirmado por
   teste.*
9. **A fronteira Radar/Planejador continua intacta?** Sim — zero campos
   prescritivos emitidos. *Verificado no código.*

---

## 11 · Roteiro do smoke manual (execução humana)

Usar **`máscara de skincare v7`**, não `marketing online v2`. Não recoletar a
SERP.

1. Abrir o Radar na marca, ativar a linha do artigo, expandir **SERP**.
2. Ler a barra da investigação: confirmar `headline`, as seis etapas e **um**
   botão primário.
3. Se o ArticleDNA for legado, confirmar o painel **CONTEXTO EDITORIAL
   INCOMPLETO** acima dos cards, com consequência por campo.
4. Seguir a ação primária até `Iniciar análise competitiva (N)` e executar.
5. Confirmar a seção **Modelo competitivo observado**: faixa central, outlier
   nomeado, `Ver páginas (N)` em cada medida, padrão de organização.
6. Clicar **`Gerar relatório competitivo`** e confirmar a mensagem de
   persistência remota + readback.
7. Abrir a aba **Evidências** e confirmar `Observações vindas da SERP`.
8. Confirmar que o botão de aprovação só libera depois do relatório, e que o
   selo da curadoria SERP aparece separado.
9. Aprovar e confirmar `Investigação competitiva aprovada` com as seis etapas
   concluídas.

---

## 12 · Pendências declaradas

- **`lib/radar/competitive-benchmark.ts` ficou sem importadores.** Foi a
  primeira consolidação do R9.4, superada por `competitive-model.ts` neste
  lote. Continua coberta por `tests/radar-competitive-benchmark.test.mts`. Não
  foi removida porque remoção não estava no escopo pedido; recomendo remover
  módulo e teste no próximo lote.
- **Páginas extraídas antes do R9.4 precisam ser reanalisadas** para que a
  presença da principal por localização apareça. A limitação é declarada, não
  silenciada.
- **`CONSOLIDATE_MODEL` é alcançável apenas para análises legadas.** Em fluxo
  novo o modelo fica pronto junto com a análise, e a ação primária salta para
  `Gerar relatório competitivo`. Comportamento intencional; registrado para não
  ser lido como etapa morta.
- **Smoke manual não executado por mim** — depende de sessão autenticada e
  decisão humana.
