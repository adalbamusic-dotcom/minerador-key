# RADAR R10 — Auditoria empírica do contexto DNA · Minerador → Arquiteto → Radar

Data: 2026-09-07 · Modo: **auditoria/diagnóstico** · Nenhuma correção implementada.

```
PROVIDER_CALLS = 0
PRODUCTION_CODE_CHANGED = 0
MIGRATIONS_CHANGED = 0
REMOTE_WRITES = 0
DIAGNOSTIC_TEST_FILES = 1 (tests/radar-r10-contexto-diagnostico.test.mts)
```

---

## 0 · BLOQUEADO — o banco real não é alcançável desta sessão

Isto foi **testado, não presumido**. O conector Supabase disponível lista dois
projetos, e nenhum dos dois é o banco do Minerador Key:

| Projeto | `editorial_workflow_items` | `minerador_keywords` |
|---|---|---|
| `betinna` (`grdiuggfklaoqhvnctto`) | `null` | `null` |
| `somatec` (`iwtltrzpzidehumypepy`) | `null` | `null` |

`select to_regclass(...)` devolveu `null` para as duas tabelas nos dois
projetos. Logo:

```
AUDIT_DATABASE_READS = TENTADO E BLOQUEADO (nenhum projeto acessível tem o schema)
```

**Consequência honesta:** a seção "PROVADO NO BANCO REAL" desta auditoria está
**vazia**. Nenhuma célula que dependa de linha real foi preenchida por
inferência — todas estão marcadas `BLOQUEADO`, e os `SELECT`s do R9.5A
continuam válidos para execução manual.

Tudo que segue é **PROVADO NO CÓDIGO** ou **PROVADO POR TESTE**.

---

## 1 · CORREÇÃO MATERIAL DO R9.5

O relatório R9.5 afirmou que `arquitetoKeywordDnaReferences` transporta
`{ keywordId, keywordDnaVersionId, role }` e concluiu que a inteligência das
keywords morre no handoff (`TRANSPORT_LOSS`).

**Está errado.** `ArticleKeywordReferenceSchema`
(`lib/arquiteto/contracts.ts:763`) carrega, **por keyword — inclusive
secundárias e reforços**:

```
strategicContribution · coveredIntentions · requiredTopics · excludedTopics
classificationOrigin · confidence · humanConfirmed
originalIntentLabel · normalizedIntent
volume · resultCount · kgrScore · incrementalVolume
contribution · purpose · purposeRationale · overlapRisk
keywordUrlRelation · urlEvidence
keywordDnaSnapshot   ← o KeywordDNA INTEIRO, via KeywordDnaProvenanceSnapshotSchema
demandEvidence
```

E `importArticlesToRadar` (`lib/editorial/operational-flow.ts:232`) faz
`arquitetoKeywordDnaReferences: version.payload.keywordReferences` — **o array
completo, sem projeção**. `RadarItemSchema` o declara com o mesmo schema.

**PROVADO POR TESTE** (`CORREÇÃO R9.5 · a referência de keyword transporta
métricas, não só identidade`): depois do import, cada referência no RadarItem
tem `volume`, `resultCount`, `kgrScore` numéricos, `coveredIntentions` não
vazio e `strategicContribution` preenchido.

**A classificação muda de `TRANSPORT_LOSS` para `ENGINE_CONSUMER_MISSING`.**
A inteligência atravessa e é persistida. Ninguém no motor a lê.

---

## 2 · PROVADO NO CÓDIGO — as duas portas de keyword

O Radar recebe contexto de keyword por **dois caminhos distintos**, com
propriedades opostas:

| | `arquitetoKeywordDnaReferences` | `hydration.keywordSnapshots` |
|---|---|---|
| Fonte | `ArticleDNA.keywordReferences` (Arquiteto) | `sourceKeywords` (linhas do Minerador) |
| Conteúdo | estratégia + métricas + snapshot do DNA | 12 campos de identificação |
| Texto da keyword | **não tem** | tem |
| Métricas | volume, resultCount, kgrScore, incrementalVolume | **nenhuma** |
| Se a fonte falta | mantém a referência | **descarta a keyword em silêncio** |
| Leitor no Radar | só `editorial-context.ts` | `radar-page.tsx`, `route-resolution.ts` |

Ou seja: **o caminho que tem o texto não tem os números, e o caminho que tem os
números não tem o texto.** Nenhum dos dois é lido pelo motor de pesquisa.

### O descarte silencioso — PROVADO POR TESTE

`snapshotForReference` (`lib/radar/hydration.ts:76`):

```ts
const source = sourceKeywords.find(candidate => sourceMatches(candidate, reference.keywordId));
const keyword = stringOf(source?.keyword);
if (!source || !keyword) return null;
```

Consequências provadas em `TRANSPORTE · referência sem linha do Minerador é
DESCARTADA em silêncio`:

- **sem nenhuma fonte** → `createRadarHydrationSnapshot` devolve `null`; a linha
  do Radar fica com `hydration: null`, sem contexto de keyword algum;
- **com a fonte de 1 de 5** → `keywordSnapshots.length === 1` enquanto
  `arquitetoKeywordDnaReferences.length === 5`. As duas contagens deixam de
  fechar, **sem erro e sem aviso**.

Este é o mecanismo real por trás de "o Radar só conhece a principal": a
principal costuma ter linha no Minerador; secundárias e reforços podem não ter.

---

## 3 · PROVADO POR TESTE — a matriz de consumo

Arquivo: `tests/radar-r10-contexto-diagnostico.test.mts` (13 testes, todos
passando). Ele **descreve o comportamento atual, inclusive onde está errado**.

| Teste | O que prova |
|---|---|
| `U` | 5 keywords do ArticleDNA → 5 no handoff (com fontes do Minerador) |
| `C e D` | principal exatamente uma vez; secundárias e reforços preservados |
| `TRANSPORTE · identidade` | `keywordSnapshots` tem exatamente 12 campos, todos de identificação; nenhuma das 17 métricas testadas atravessa |
| `TRANSPORTE · descarte` | referência sem linha do Minerador some da hidratação |
| `O` | artigo de outra marca não é importado — cross-brand bloqueado como esperado |
| `CORREÇÃO R9.5` | a referência transporta volume, resultCount, kgrScore e intenções |
| `M` | sem `handoffContext`, `arquitetoSerpProvenance`/`InternalLinks`/`SerpAssessment` chegam `null` |
| `R` | o relatório compara termos contra **IDs** |
| `S` | `editorialTopics` muda o resultado e nenhum chamador o passa |
| `CENSO · blocos` | 4 blocos do Arquiteto têm leitor **único**: `editorial-context.ts` |
| `CENSO · coleta` | a coleta usa 4 campos do ArticleDNA; nenhuma secundária vira consulta |
| `CENSO · expectedFormat` | transportado e ignorado pelo provider canônico |
| `ORIGEM` | `keyword_dna` não é `artifact_type`; o DNA é derivado em runtime |

### Fase 10 · `keywordId` usado como texto — reproduzido

`competitive-report.ts:262`:

```ts
const keywordTerms = new Set([input.article.promise, ...input.article.keywordReferences.map(reference => reference.keywordId), ...input.article.requiredTopics].map(normalize));
```

O teste `R` monta 3 páginas cujos `recurringTerms` contêm os **textos** das 5
keywords, 6 ocorrências cada. Resultado: `keywordObservations` **não observa
nenhuma delas** — nem a principal. A comparação é feita contra UUIDs.

```
KEYWORD_ID_USED_AS_TEXT_BUG = CONFIRMADO
IMPACTO = keywordObservations só encontra o que casar com `promise` ou
          `requiredTopics`; a observação por keyword é inoperante
```

### Fase 10 · `editorialTopics`

```
PARAMETER_EXISTS = YES (competitive-model.ts e topic-classification.ts)
CALLER_PASSES_IT = NO  (radar-r3-serp-panel.tsx, radar-page.tsx, competitive-report.ts)
REAL_VALUE = undefined em 100% das chamadas
USED_BY_TOPIC_CLASSIFICATION = YES — e muda a classe:
  sem ele  → "Camadas de hidratação" = ISOLATED_TOPIC
  com ele  → "Camadas de hidratação" = COMPETITIVE_GAP
```

---

## 4 · PROVADO NO CÓDIGO — origem do KeywordDNA

`KeywordDNASchema.parse` aparece **uma única vez** em todo o repositório:
`lib/arquiteto/keyword-dna-engine.ts:322`. E o CHECK vigente de `artifact_type`
(`20260829120000_article_architecture_ai_review_artifact.sql`) aceita
`article_dna, silo_dna, silo_page, content_plan, brand_dna, brand_skill,
keyword_semantic_qualification, keyword_contextual_presentation,
article_architecture_ai_review` — **`keyword_dna` não está na lista**.

```
onde nasce        = lib/arquiteto/keyword-dna-engine.ts (derivação em runtime)
fontes que lê     = texto da keyword + nicho/localização + registro semântico
schema produzido  = KeywordDNASchema
materialização    = NENHUMA tabela própria; o snapshot equivalente é
                    ArticleKeywordReference.keywordDnaSnapshot
                    (KeywordDnaProvenanceSnapshotSchema), opcional
onde deixa de existir = não deixa: nunca foi persistido como artefato
```

As **métricas** (volume, allintitle/resultCount, KGR, CPC, concorrência,
dificuldade) são dado armazenado, em `minerador_keywords` — cujos nomes reais
de coluna estão **BLOQUEADOS** até a execução do `SELECT 2a` do R9.5A.

---

## 5 · Matriz final

`ENGINE` = motor de pesquisa (coleta, curadoria, análise, modelo, síntese).
Painel técnico **não** conta como consumo do motor.

| FIELD | ORIGIN | ORIGIN_HAS | ARTICLE_DNA | HANDOFF | RADARITEM | HYDRATED | ENGINE | REPORT | UI | CLASSIFICATION | OWNER |
|---|---|---|---|---|---|---|---|---|---|---|---|
| principal (texto) | Minerador | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | OK | — |
| secundárias (texto) | Minerador | ✔ | ✔ | ✔¹ | ✔¹ | ✔¹ | ✘ | ✘ | ✔ | ENGINE_CONSUMER_MISSING | Radar |
| reforços (texto) | Minerador | ✔ | ✔ | ✔¹ | ✔¹ | ✔¹ | ✘ | ✘ | ✔ | ENGINE_CONSUMER_MISSING | Radar |
| keyword sem linha no Minerador | Minerador | ✔ | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | HYDRATION_LOSS | Arquiteto/handoff |
| volume (por keyword) | Minerador | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| resultCount | Minerador | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| kgrScore | Minerador | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| incrementalVolume / contribution | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| normalizedIntent / coveredIntentions | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| strategicContribution / purpose | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| keywordDnaSnapshot | Arquiteto | ✔ (opcional) | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| demandEvidence | Minerador | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| keywordUrlRelation | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| CPC / KD / trend | — | ✘ | ✘ | — | — | — | — | — | — | ORIGIN_MISSING (não estão no KeywordDNASchema) | Minerador |
| combinedVolume / combinedResults | — | ✘ | ✘ | — | — | — | — | — | — | ORIGIN_MISSING | Arquiteto |
| ArticleDNA.mainIntent | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | ✔² | ✔ | ✔ | OK | — |
| ArticleDNA.requiredTopics | Arquiteto | ✔ | ✔ | ✔ | — | ✔ | ✔³ | ✔ | ✔ | OK | — |
| ArticleDNA.entities | Arquiteto | ✔ | ✔ | ✔ | — | ✔ | ✔³ | ✔ | ✔ | OK | — |
| ArticleDNA.hierarchy (expectedFormat) | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | **✘⁴** | ✘ | ✔ | ENGINE_CONSUMER_MISSING | Radar |
| ArticleDNA.questions | Arquiteto | ✔ | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✔ | ENGINE_CONSUMER_MISSING | Radar |
| ArticleDNA.coverage | Arquiteto | ✔ | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✔ | ENGINE_CONSUMER_MISSING | Radar |
| ArticleDNA.objections | Arquiteto | ✔ | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✘ | UI_PROJECTION_MISSING | Radar |
| ArticleDNA.classification / intentProfile | Arquiteto | ✔ | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✘ | UI_PROJECTION_MISSING | Radar |
| SiloDNA payload | Arquiteto | ✔ | ponteiro | ponteiro | ponteiro | ✔ | ✘ | ✘ | ✘ | ENGINE_CONSUMER_MISSING | Radar |
| SiloPage slug/canonical/status | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ENGINE_CONSUMER_MISSING | Radar |
| SERP de formação + veredito | Arquiteto | ✔ | ✔ | ✔⁵ | ✔⁵ | ✔ | ✘ | ✘ | ✔⁶ | ENGINE_CONSUMER_MISSING | Radar |
| decisões humanas da formação | Arquiteto | ✔ | ✔ | ✔⁵ | ✔⁵ | ✔ | ✘ | ✘ | ✔⁶ | ENGINE_CONSUMER_MISSING | Radar |
| InternalLinkGraph edges/anchors | Arquiteto | ✔ | ✔ | ✔⁵ | ✔⁵ | ✔ | ✘ | ✘ | ✔⁶ | ENGINE_CONSUMER_MISSING | Radar |
| arquitetoKeywordUrlRelations | Arquiteto | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | UI_PROJECTION_MISSING | Radar |
| cross-brand | — | — | — | bloqueado | bloqueado | bloqueado | — | — | — | CROSS_BRAND_BLOCKED_AS_EXPECTED | — |

¹ o texto chega pela hidratação; as métricas, pela referência. Nunca no mesmo objeto.
² usado como `expectedIntent` no diagnóstico do snapshot (conflito de intenção).
³ usado em `SerpSearchInput` para `missingTopics` e `frequentEntities`.
⁴ `expectedFormat` só é lido por `serper-provider-core.ts`; o normalizador
DataForSEO — provider canônico — o ignora. **Provado por teste.**
⁵ depende de `handoffContext`; sem ele chegam `null`. **Provado por teste.**
⁶ leitor único `lib/radar/editorial-context.ts` — diagnóstico, não motor.

---

## 6 · Cadeia por categoria

**Métricas e estratégia por keyword**
```
Minerador  ✔ existe (minerador_keywords — colunas reais BLOQUEADAS)
Arquiteto  ✔ entra em ArticleKeywordReference (volume, resultCount, kgrScore, …)
handoff    ✔ atravessa inteiro
RadarItem  ✔ persiste em arquitetoKeywordDnaReferences
hydration  ✔ o RadarItem carrega o array
engine     ✘ NENHUM leitor
report     ✘ usa keywordId como texto
```

**Texto das secundárias e reforços**
```
Minerador  ✔ existe
Arquiteto  ✔ referência por id
handoff    ✔/✘ só se a linha do Minerador vier em sourceKeywords
RadarItem  ✔/✘ idem
hydration  ✔/✘ descarte SILENCIOSO quando falta a fonte
engine     ✘ nem quando chega
```

**SERP de formação, decisões humanas, InternalLinkGraph, SiloPage**
```
Arquiteto  ✔ → handoff ✔ → RadarItem ✔ → hydration ✔ → engine ✘ → report ✘
UI: apenas o painel recolhido de diagnóstico
```

---

## 7 · Fase 11 — o que seria possível hoje

```
RADAR_RESEARCH_INPUT_CURRENT = [
  principal (texto), ArticleDNA.mainIntent, ArticleDNA.requiredTopics,
  ArticleDNA.entities, snapshot SERP atual, URLs selecionadas, páginas extraídas
]

RADAR_RESEARCH_INPUT_AVAILABLE_FROM_UPSTREAM = CURRENT + [
  textos de secundárias e reforços (quando a fonte do Minerador chega),
  volume/resultCount/kgrScore/incrementalVolume por keyword,
  normalizedIntent e coveredIntentions por keyword,
  strategicContribution/purpose/overlapRisk por keyword,
  keywordDnaSnapshot (KeywordDNA completo, quando presente),
  demandEvidence e keywordUrlRelation,
  ArticleDNA.questions/coverage/objections/classification,
  SiloDNA payload, SiloPage, SERP de formação + decisões humanas,
  InternalLinkGraph (edges e anchorConcepts)
]
```

Para um artigo de 5 keywords, o Radar hoje pesquisa **uma** consulta. Os dados
para conhecer as outras quatro — com intenção, volume e contribuição — **já
estão persistidos na própria linha do Radar**.

---

## 8 · Resumo executivo

```
KEYWORDS_IN_MINERADOR  = BLOQUEADO (exige SELECT 2 do R9.5A)
KEYWORDS_IN_ARTICLES   = BLOQUEADO (exige SELECT 1 e 3a)
KEYWORDS_RESOLVED_BY_RADAR = BLOQUEADO no real · em teste, 5 de 5 com fonte; 1 de 5 sem fonte

PRIMARY_FULL_CONTEXT       = PARCIAL — texto + métricas existem em objetos separados; motor lê só o texto
SECONDARY_FULL_CONTEXT     = NÃO CONSUMIDO — chega, não é lido
REINFORCEMENT_FULL_CONTEXT = NÃO CONSUMIDO — idem

ARTICLE_DNA_FULL_CONTEXT = CHEGA COMPLETO; motor lê 4 campos (mainIntent, requiredTopics, entities, hierarchy*)
SILO_DNA_CONTEXT   = ponteiro no RadarItem; payload carregado no workspace; motor não lê
SILO_PAGE_CONTEXT  = chega completo; motor não lê

FORMATION_SERP_CONTEXT      = chega quando o handoffContext o monta; motor não lê
FORMATION_HUMAN_DECISIONS   = idem
INTERNAL_LINK_GRAPH_CONTEXT = idem

HANDOFF_CONTEXT_COMPLETE   = QUASE — completo para referências/estratégia; perde keyword sem linha do Minerador
RADARITEM_CONTEXT_COMPLETE = SIM para o que o handoff emite
RADAR_HYDRATION_COMPLETE   = NÃO — descarte silencioso por ausência de fonte

RADAR_ENGINE_CONSUMES_UPSTREAM_CONTEXT = NÃO

UPSTREAM_CONTEXT_AVAILABLE_BUT_UNUSED = métricas e estratégia por keyword ·
  secundárias e reforços · SERP de formação · decisões humanas ·
  InternalLinkGraph · SiloDNA/SiloPage · questions/coverage/objections

KEYWORD_ID_USED_AS_TEXT_BUG    = CONFIRMADO (reproduzido em teste)
EDITORIAL_TOPICS_CALLER_CONNECTED = NÃO (parâmetro existe, muda o resultado, ninguém passa)
```

### ROOT CAUSE

Não é "o Radar está incompleto". São **três causas distintas**, com donos
distintos:

1. **`ENGINE_CONSUMER_MISSING` (dono: Radar) — a principal.** Métricas,
   intenção, contribuição estratégica, SERP de formação, decisões humanas,
   grafo de links e Silo **atravessam o handoff e estão persistidos na linha do
   Radar**. Nenhum módulo do motor de pesquisa os lê; o único leitor é o painel
   de diagnóstico. O Radar pesquisa só com a principal porque nunca foi escrito
   para ler o resto.

2. **`HYDRATION_LOSS` (dono: handoff/Arquiteto).** `snapshotForReference`
   descarta em silêncio qualquer keyword sem linha correspondente em
   `sourceKeywords`; sem nenhuma, a hidratação inteira vira `null`. É por aqui
   que uma secundária desaparece sem erro.

3. **Dois defeitos pontuais no consumo que já existe:** o relatório compara
   termos contra `keywordId` em vez do texto, e `editorialTopics` nunca é
   ligado — um consumidor construído e sem entrada.

---

## 9 · Testes executados

```
tests/radar-r10-contexto-diagnostico.test.mts   13 testes · 13 passando
pnpm run test:radar                             333 testes · 333 passando · 0 falhas
pnpm run test:arquiteto                        1525 testes · 1524 passando · 1 falha
```

A única falha do Arquiteto é **anterior a esta auditoria e alheia a ela**:
`Minerador qualifica somente por ação explícita e não chama IA no motor lógico`
espera a string `Processar lógica` num componente do Minerador. Nenhum arquivo
de `lib/minerador` foi tocado nesta sessão (`git diff --stat lib/minerador`
vazio); a divergência vem do working tree de outro lote.

Nenhum provider externo foi chamado. Nenhuma escrita remota foi feita.

---

## 10 · O que fecha as células BLOQUEADAS

Os quatro `SELECT`s do R9.5A, executados manualmente contra o banco do
Minerador Key. Eles preenchem, sem tocar em código:

- `KEYWORDS_IN_MINERADOR`, `KEYWORDS_IN_ARTICLES`,
  `MINERADOR_KEYWORDS_RESOLVED`;
- os nomes **reais** das colunas de métrica (`SELECT 2a`);
- `FORMATION_SERP_EXISTS` e `INTERNAL_LINK_GRAPH_EXISTS` para os quatro artigos
  auditados;
- e, decisivo: se `hydration.keywordSnapshots` do artigo de 5 keywords tem 5 ou
  menos itens — o que dirá se o descarte silencioso **já aconteceu em produção**
  ou se é só um caminho possível.
