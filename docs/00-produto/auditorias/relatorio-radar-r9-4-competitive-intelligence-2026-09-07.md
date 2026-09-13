# RADAR R9.4 — Investigação competitiva profunda e fluxo operacional da SERP — 2026-09-07

`REAL_PROVIDER_CALLS = 0` · `REMOTE_WRITES_DURING_TESTS = 0` ·
`EXTERNAL_PAGE_REAL_FETCH = 0`. O snapshot v1 continua preservado.

---

## 1. Auditoria — o que já existia

Antes de escrever qualquer coisa, conferi o que o extrator e os contratos já
produziam. **Boa parte da radiografia já existia e não foi duplicada:**

| Já existia | Onde |
| --- | --- |
| `h1` / `h2` / `h3` (textos, não só contagem) | `RadarExtractionPageSchema` |
| `wordCount`, links internos/externos, listas, tabelas, FAQ, imagens, citações | idem |
| `boldCount`, `italicCount`, `structuredDataTypes`, `author`, `hasDates` | idem |
| `recurringTerms` com frequência e páginas | `extractTerms` |
| min/mediana/máximo/média/faixa por métrica | `numericStats` + `buildRadarBenchmark` |
| exclusão de não comparáveis do benchmark | `isComparableRadarExtraction` |
| `RadarCompetitiveReport` versionado dentro da análise | `competitive-report.ts` |

**Faltava:** parágrafos, abertura, fechamento, hierarquia de headings,
termos em destaque, presença da principal por localização — e a consolidação
que transforma isso em padrão de amostra. Nenhuma entidade nova foi criada:
os campos entraram no `RadarExtractionPage` que já existe, e a consolidação é
uma função pura de leitura.

---

## 2. IMPLEMENTED

### Extração por página — campos novos, todos aditivos

`lib/radar/analysis-contracts.ts` + `lib/radar/competitor-extractor.ts`. Todos
com `default`, então página gravada antes deste corte continua parseando e o
campo ausente vira **ausência declarada**, nunca número inventado.

| Campo | O que observa |
| --- | --- |
| `paragraphCount`, `paragraphWordCounts` | parágrafos reais (≥3 palavras), com o tamanho de cada um |
| `headingOutline` | H1/H2/H3 **na ordem do documento** — a hierarquia, não a contagem |
| `introWordCount`, `introText` | a abertura como o documento a escreve |
| `closingWordCount`, `closingText`, `hasClosing` | o fechamento, quando existe |
| `emphasizedTerms` | o que a página escolheu destacar em `<strong>`/`<b>` |
| `keywordPlacement` | onde a principal aparece: title, H1, H2, H3, abertura, corpo + ocorrências |

`keywordPlacement` é **`null`** quando a keyword não foi informada à extração.
Ausência de dado é declarada; nunca vira "a keyword não aparece". A principal
viaja do Workbench para a rota de extração como campo opcional.

### A radiografia — `lib/radar/competitive-benchmark.ts`

Função pura que consolida a amostra. Duas regras que o **formato** carrega
sozinho, sem depender de quem lê:

1. **Uma página comparável não vira média de mercado.** A medida sai com
   `kind: "single_page"` e só `observed` preenchido — `median`, `min`, `max` e
   `average` ficam `null`. O rótulo diz *"Valor observado: 1800 (1 página)"*.
2. **Página não comparável continua visível e fora das métricas.** Ela aparece
   em `sample.nonComparable` com formato e motivo, e não entra em nenhuma
   estatística.

Produz: estrutura (palavras, H2, H3, parágrafos, imagens, links, destaques),
abertura, fechamento, formatação, presença da principal, padrões de heading
(`"O que é" — 3/3 páginas · H2 3 · H3 0`), termos recorrentes em destaque e
**`limitations`** — o que não foi possível observar, explicitamente.

### Ação primária visível

| Antes | Agora |
| --- | --- |
| `Analisar selecionadas (3)` | `Iniciar análise competitiva (3)` na primeira vez; `Analisar referências selecionadas (N)` depois |
| `Analise 3 referência(s) selecionada(s).` | `Inicie a análise competitiva das 3 referência(s) selecionada(s).` quando nada foi extraído |

A aba Análise passou a mostrar a seção **Estrutura observada** com a
radiografia inteira, incluindo as limitações da amostra e as páginas fora do
benchmark.

---

## 3. Fronteira — o que o Radar NÃO passou a fazer

Esta é a parte que um teste guarda, não a boa intenção:

```
o Radar não emite outline final, meta de H2/H3, palavras ou densidade
```

O teste varre `competitive-benchmark.ts`, `competitor-extractor.ts`,
`evidence-package.ts`, `planner-handoff.ts` e `competitive-report.ts` por
`finalOutline`, `requiredH2Count`, `requiredH3Count`, `requiredWordCount`,
`requiredKeywordDensity` e "densidade recomendada" — e **serializa o benchmark**
para conferir que nenhum desses nomes aparece no pacote.

O guard pegou um caso real durante a implementação: um comentário meu dizia
*"não existe densidade recomendada nesta saída"* e o teste barrou a frase. Foi
o comentário que mudou, não o teste.

Todas as saídas são rotuladas como observação: `Ocorrências observadas no
corpo`, `Mediana 2000 · faixa 1000–3000 · 3 páginas`, `4/5`. Nenhuma delas diz
o que o nosso artigo deve ter — isso é ContentPlan, e o Planejador não foi
tocado.

---

## 4. TESTED

```text
npm run test:radar
tests 223 · pass 223 · fail 0 · exit 0
arquivos = 40 · não executados = 0
```

`tests/radar-competitive-benchmark.test.mts` (10 testes), com **fixtures HTML
locais** e `fetchImpl`/`lookupImpl` injetados — zero rede:

| Cobertura | Teste |
| --- | --- |
| extração | parágrafos, abertura, fechamento, hierarquia na ordem, destaques, presença da principal |
| ausência de dado | sem keyword informada, `keywordPlacement` é `null` |
| benchmark · 1 página | vira valor observado, `median` é `null`, limitação declarada |
| benchmark · N páginas | min, mediana, máximo, média, `sampleSize` |
| comparabilidade | página bloqueada não contamina a faixa e continua listada |
| padrões | heading recorrente com nível e proporção; destaques por páginas |
| principal | presença por localização; ocorrências como medida observada |
| **fronteira** | nenhum campo prescritivo no código nem no pacote serializado |
| explicitude | um único ponto de chamada da extração; nenhum efeito dispara |
| próxima ação | a primeira análise tem nome próprio |

### Regressão

| Verificação | Antes | Depois |
| --- | --- | --- |
| `test:radar` | 213 / 213 | **223 / 223** |
| `tsc --noEmit` | 5 erros | **5**, os mesmos, nenhum em Radar |
| `eslint` radar + rota | limpo | **limpo** |

Dois testes existentes foram ajustados, ambos por motivo legítimo:

- `radar-analysis` e `radar-usability` passaram a montar o fixture por
  `RadarExtractionPageSchema.parse`, em vez de literal — os campos novos têm
  default e o parse é a forma honesta de obtê-los;
- `radar-post-collection` (do R9.2) tinha uma asserção sobre o estado vazio que
  descrevia a implementação anterior. **O arquivo evoluiu no disco** para um
  diagnóstico melhor (`diagnostico.state === "complete" || "empty_confirmed"` +
  `loadStateSummary`), e o teste foi alinhado à implementação vigente — o
  invariante protegido é o mesmo: marca vazia e carga incompleta não podem
  dizer a mesma coisa.

---

## 5. O que ficou de fora, e por quê

| Item | Estado |
| --- | --- |
| `ExternalEvidence` completa | fora do escopo declarado do lote |
| Relatório consolidado no Workbench com acesso por concorrente | a radiografia está na aba Análise; a navegação por concorrente que sustenta cada observação é lote próprio |
| Revisão corrente × aprovação histórica | **já resolvido antes**: `deriveRadarSerpReviewState` distingue `current`/`reopened`/`unknown`, a aba mostra "Revisão reaberta" e o Histórico preserva as aprovações. As capturas mostram exatamente isso funcionando |
| Autoria/data por página | `author` e `hasDates` já existiam e continuam; não foram aprofundados |

---

## 6. Retorno

```text
SERP_OPERATIONAL_FLOW_COMPLETE = PENDING_MANUAL_CONFIRMATION
    a cadeia coleta → curadoria → análise profunda → benchmark → revisão existe
    e está coberta por teste; falta o percurso humano ponta a ponta.

START_ANALYSIS_ACTION_VISIBLE = YES ("Iniciar análise competitiva (N)")

COMPETITOR_EXTRACTION_OPERATIONAL = YES
STRUCTURE_EXTRACTION_OPERATIONAL = YES
SEMANTIC_EXTRACTION_OPERATIONAL = YES
FORMATTING_EXTRACTION_OPERATIONAL = YES
LINK_EXTRACTION_OPERATIONAL = YES

H1_OBSERVED = YES
H2_COUNTS_OBSERVED = YES
H3_COUNTS_OBSERVED = YES
PARAGRAPH_COUNTS_OBSERVED = YES
WORD_COUNTS_OBSERVED = YES
INTRO_OBSERVED = YES
CLOSING_OBSERVED = YES
EMPHASIS_OBSERVED = YES
KEYWORD_FREQUENCY_OBSERVED = YES (por localização e ocorrências; nunca densidade)

BENCHMARK_MIN_MEDIAN_MAX = YES (uma página = valor observado, sem média)
NON_COMPARABLE_EXCLUDED_FROM_BENCHMARK = YES (e continuam visíveis)

CURRENT_REVIEW_STATE_COHERENT = YES (já vigente; não alterado neste lote)
HISTORICAL_APPROVAL_PRESERVED = YES

RADAR_COMPETITIVE_REPORT_COMPLETE = PARTIAL
    a radiografia está na aba Análise; a navegação por concorrente que sustenta
    cada observação é o próximo corte.

FINAL_OUTLINE_CREATED_BY_RADAR = NO
FINAL_H2_H3_TARGETS_CREATED_BY_RADAR = NO
FINAL_KEYWORD_DENSITY_CREATED_BY_RADAR = NO

RADAR_TEST_FILES_EXECUTED = 40/40
RADAR_TESTS_TOTAL = 223
RADAR_TESTS_PASS = 223
RADAR_TESTS_FAIL = 0

REAL_PROVIDER_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0

MANUAL_COMPETITIVE_SMOKE_READY = YES
NEXT_RECOMMENDED_LOT = R9.5 — relatório consolidado navegável (cada observação
    aponta os concorrentes que a sustentam) + Evidências úteis
```

---

## 7. Smoke manual — preparado, não executado

Sem recoletar. Use o artigo `marketing online`, que já tem snapshot v3 e 7
concorrentes selecionados.

```text
1. SERP → Concorrentes: confirmar a seleção atual.
2. SERP → Análise: o botão deve dizer "Iniciar análise competitiva (N)"
   se nenhuma página foi extraída, ou "Analisar referências selecionadas (N)".
3. Clicar UMA vez. A extração busca as páginas selecionadas — é a única
   chamada externa deste lote.
4. Conferir a seção "Estrutura observada": palavras, H2, H3, parágrafos,
   imagens, links e destaques, cada um com mediana e faixa OU valor observado
   quando houver só uma página comparável.
5. Conferir Abertura e Fechamento, com as proporções em N/N.
6. Conferir "Principal observada": title, H1, H2, H3, abertura, corpo.
7. Conferir "Tópicos recorrentes nos headings" e "Termos em destaque".
8. Conferir "Fora do benchmark, ainda visíveis" e "Limitações da amostra".
9. Confirmar que nenhum número aparece como meta do nosso artigo.
10. Alterar uma decisão de concorrente: a análise reabre e a revisão volta a
    ser necessária, com a aprovação anterior preservada no Histórico.
```

**Fronteira a conferir no passo 9:** tudo deve estar redigido como observação.
Se algum texto disser o que o *nosso* artigo deve ter, é regressão de fronteira
— e o teste automatizado deveria ter pego.
