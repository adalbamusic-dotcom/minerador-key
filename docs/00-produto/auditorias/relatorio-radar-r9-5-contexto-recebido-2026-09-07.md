# RADAR R9.5 — Auditoria forense do contexto recebido

Data: 2026-09-07 · Área: Radar · Lote: R9.5 (somente leitura)
`PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` · `CODE_FILES_CHANGED = 0`

Caso: **cremes skin care** · Silo **Skin care para peles oleosas** · ArticleDNA v7.

---

## 0 · Limite desta auditoria, dito antes de tudo

Esta sessão **não tem leitura do banco remoto** (o conector Supabase disponível
aponta para outra organização). Então esta auditoria prova a **cadeia de
contrato no código** — origem, transporte, persistência, projeção e consumo — e
marca como **Bloqueado** tudo que exige ler as linhas reais de
`cremes skin care`.

Classificação de evidência usada em cada afirmação:

- **Verificado no código** — li o contrato/o consumidor.
- **Bloqueado** — depende de leitura remota que não posso executar aqui.

Nenhum arquivo foi alterado.

---

## 1 · KeywordDNAs do Article

### O que existe na origem — Verificado no código

`KeywordDNASchema` (`lib/arquiteto/contracts.ts:713`) carrega, por keyword:

| Campo | Presente na origem |
|---|---|
| `searchIntent` (5 valores canônicos) | SIM |
| `likelyEditorialType` (9 valores) | SIM |
| `centralEntity` | SIM |
| `modifiers[]` | SIM |
| `audience`, `perceivedProblem`, `desiredResult` | SIM |
| `awarenessLevel`, `journeyStage`, `objections[]`, `dominantEmotion` | SIM |
| `commercialPotential`, `affiliatePotential`, `reviewCandidate` | SIM |
| `volumeSearch`, `resultCount`, `kgrScore` | SIM (opcionais) |
| `kgrIdentity`, `primaryKeywordPolicy`, `primaryKeywordPolicyContext` | SIM |
| `demandEvidence` | SIM |
| `keywordUrlRelation` | SIM |
| `siteEvidence` (fonte, slugCoherence, qualificationStatus) | SIM |
| `architectureStatus` | SIM |
| `humanConfirmed`, `confidence`, `stampOrigin` | SIM |

`KEYWORD_DNA_COMPLETE_AT_ORIGIN = YES` — o contrato é rico.

### O que chega ao Radar — Verificado no código

Duas portas, e as duas transportam **identidade, não inteligência**:

**1. `hydration.keywordSnapshots[]`** — `RadarHydrationKeywordSchema`
(`lib/radar/hydration.ts:5`), `.strict()`, doze campos:

```
referenceKeywordId · canonicalKeywordId · sourceKeywordId · originalKeywordId
aliases[] · keywordDnaVersionId · keyword · role
brandId · siloId · siloName · isPublished
```

Nenhuma métrica. Nenhuma classificação. Nenhuma evidência de SERP.

**2. `arquitetoKeywordDnaReferences[]`** — `ArticleKeywordReferenceSchema`:
`{ keywordId, keywordDnaVersionId, role }`. Referência, não payload.

Ou seja: as secundárias e os reforços **chegam** — como nome e papel. Volume,
results, KGR, aplicabilidade, CPC, KD, concorrência de ads, trend, intenção,
funil, entidade, modificadores, qualificação SERP e decisão humana **não
atravessam nenhuma das duas portas**.

```
ARTICLE_KEYWORD_COUNT_EXPECTED = principal + secundárias(≤5) + reforços — Bloqueado para o caso real
ARTICLE_KEYWORD_COUNT_RESOLVED = Bloqueado (exige ler editorial_artifact_versions da marca)
```

O que o Radar consegue resolver hoje, se as linhas existirem: **os nomes e os
papéis de todas elas**. O que ele não consegue: qualquer métrica ou
classificação de qualquer uma, inclusive da principal.

---

## 2 · ArticleDNA

### Origem — Verificado no código

`ArticleDNASchema` (`lib/arquiteto/contracts.ts:850`):

| Campo | `EXISTS_IN_ARTICLEDNA` |
|---|---|
| `principalKeywordId` | YES |
| `secondaryKeywordIds[]` (≤5) | YES |
| `narrativeReinforcementIds[]` | YES |
| `keywordReferences[]` | YES |
| `classification` (intenção, funil, KGR, aplicabilidade, compatibilidade, proteção) | YES (opcional) |
| `intentProfile`, `volumeStrategy`, `hierarchyStrategy` | YES (opcionais) |
| `strategicPurpose`, `keywordStrategy`, `serpStrategy` | YES (opcionais) |
| `unitClassification`, `unitPurpose` | YES (opcionais) |
| `primaryKeywordMetrics` (volumeSearch, resultCount, kgrScore) | YES (opcional) |
| `primaryKeywordCandidates[]`, `primaryKeywordDecision` | YES (opcionais) |
| `requiredTopics[]`, `questions[]`, `entities[]`, `coverage[]`, `objections[]` | YES |
| `purpose` (via `strategicPurpose`/`brandObjective`/`promise`) | YES |
| `serpAssessmentRef` | YES (opcional) |
| `publishedIdentityRef` | YES (opcional) |
| `territoryRef` | YES (opcional) |
| `combinedVolume` / `combinedResults` | **NO — não existe campo agregado** |

`ARTICLE_DNA_COMPLETE_AT_ORIGIN = YES`, com uma ressalva: **volume e resultados
combinados do conjunto de keywords não existem em lugar nenhum do contrato.**
Isso é `ORIGIN_MISSING`, não perda de transporte.

### Transporte

O ArticleDNA **inteiro** é carregado pelo Radar: `rowWorkbenchData` resolve
`article: VersionEnvelope<ArticleDNA>`. Aqui não há perda de transporte — há
perda de **consumo**, tratada na seção 6.

---

## 3 · SiloDNA e SiloPage

`RadarHydrationSiloSchema` transporta: `id`, `name`, `siloDnaVersionId`,
`siloDnaContentHash`, `territoryRef`, `siloPageId`, `siloPageVersionId`,
`siloPageSlug`, `siloPageCanonical`, `siloPagePublicationStatus`,
`articleRole`.

Isso responde **onde** o artigo está no silo. Não transporta `entity`,
`macroIntent`, `boundary` nem `narrative` do SiloDNA — o Radar recebe o
ponteiro (`siloDnaVersionId`) e o `pipeline.siloVersions` carrega o SiloDNA
completo no workspace, mas nenhum módulo de pesquisa do Radar lê o payload.

```
SILODNA_COMPLETE_AT_ORIGIN = YES (contrato)
SILOPAGE_COMPLETE_AT_ORIGIN = YES (slug, canonical, status, papel)
```

---

## 4 · SERP de formação do Arquiteto

`arquitetoSerpProvenance` existe no `RadarItemSchema`
(`lib/editorial/operational-flow.ts:52`) com `assessmentId`,
`formationBaseHash`, `verdict` (COMPATIBLE/INCONCLUSIVE/DIVERGENCE) e
`humanResolution` (decisão, razão, quem, quando). `arquitetoSerpAssessment`
carrega o parecer completo.

```
FORMATION_SERP_EXISTS            = YES no contrato · Bloqueado para o caso real
FORMATION_SERP_URLS_EXIST        = Bloqueado (dependem do assessment persistido)
FORMATION_SERP_ASSESSMENT_EXISTS = YES no contrato (arquitetoSerpAssessment)
FORMATION_SERP_REACHES_HANDOFF   = YES (handoffContext[...].serpProvenance)
FORMATION_SERP_REACHES_RADARITEM = YES (campo aditivo do RadarItem)
FORMATION_SERP_IS_READ_BY_RADAR  = SOMENTE PELO PAINEL DE DIAGNÓSTICO
```

O único leitor de `arquitetoSerpProvenance` e `arquitetoSerpAssessment` em todo
o Radar é `lib/radar/editorial-context.ts` — o bloco recolhido em
*Conteúdo → Proveniência / detalhes técnicos*. **Nenhum módulo de pesquisa,
coleta, curadoria, análise ou relatório os consulta.**

---

## 5 · InternalLinkGraph

```
LINK_GRAPH_EXISTS            = YES no contrato (arquitetoInternalLinks)
LINK_GRAPH_REACHES_HANDOFF   = YES (handoffContext[...].internalLinks)
LINK_GRAPH_REACHES_RADARITEM = YES (graphId, graphVersionId, graphContentHash, edges[])
LINK_GRAPH_READ_BY_RADAR     = SOMENTE PELO PAINEL DE DIAGNÓSTICO
```

Mesmo leitor único: `editorial-context.ts`. `anchorConcepts` — o universo de
formulação já aprovado — não é lido por nada que produza investigação.

---

## 6 · Matriz ponta a ponta

`ORIGIN` → `ARQUITETO_READS` → `HANDOFF_EMITS` → `SERVER_ACCEPTS` →
`RADARITEM_PERSISTS` → `WORKSPACE_LOADS` → `RADAR_DOMAIN_READS` →
`UI_PROJECTS` → `RESEARCH_ENGINE_USES`

| Dado | ORIG | HANDOFF | RADARITEM | WORKSPACE | DOMÍNIO | UI | ENGINE | Morre em |
|---|---|---|---|---|---|---|---|---|
| Principal (texto) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✔** | — |
| Secundárias (texto + papel) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✘** | **ENGINE** |
| Reforços (texto + papel) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✘** | **ENGINE** |
| KeywordDNA.volumeSearch | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | **HANDOFF** |
| KeywordDNA.resultCount | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | **HANDOFF** |
| KeywordDNA.kgrScore | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | **HANDOFF** |
| KeywordDNA.searchIntent | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | **HANDOFF** |
| KeywordDNA.centralEntity | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | **HANDOFF** |
| KeywordDNA.modifiers | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | **HANDOFF** |
| KeywordDNA.demandEvidence | ✔ | **✘** | ✘ | ✘ | ✘ | ✘ | ✘ | **HANDOFF** |
| KeywordDNA.keywordUrlRelation | ✔ | ✔¹ | ✔¹ | ✔ | **✘** | ✘ | ✘ | **DOMÍNIO** |
| ArticleDNA.requiredTopics | ✔ | ✔ | — | ✔ | ✔ | ✔ | **✔²** | — |
| ArticleDNA.entities | ✔ | ✔ | — | ✔ | ✔ | ✔ | **✔²** | — |
| ArticleDNA.mainIntent | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✔³** | — |
| ArticleDNA.hierarchy (expectedFormat) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✘⁴** | **ENGINE** |
| ArticleDNA.questions | ✔ | ✔ | — | ✔ | ✔ | ✔ | **✘** | **ENGINE** |
| ArticleDNA.coverage | ✔ | ✔ | — | ✔ | ✔ | ✔ | **✘** | **ENGINE** |
| ArticleDNA.objections | ✔ | ✔ | — | ✔ | ✔ | ✘ | **✘** | **UI + ENGINE** |
| ArticleDNA.classification | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✘ | **DOMÍNIO** |
| ArticleDNA.primaryKeywordMetrics | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✘ | **DOMÍNIO** |
| ArticleDNA.serpStrategy / keywordStrategy | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✘ | **DOMÍNIO** |
| SiloDNA payload (entity, boundary, narrative) | ✔ | ponteiro | ponteiro | ✔ | ✘ | ✘ | ✘ | **DOMÍNIO** |
| SiloPage (slug, canonical, status) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✘** | **ENGINE** |
| SERP de formação (assessment + veredito) | ✔ | ✔ | ✔ | ✔ | ✔⁵ | ✔⁵ | **✘** | **ENGINE** |
| Decisões humanas da formação | ✔ | ✔ | ✔ | ✔ | ✔⁵ | ✔⁵ | **✘** | **ENGINE** |
| InternalLinkGraph.edges + anchorConcepts | ✔ | ✔ | ✔ | ✔ | ✔⁵ | ✔⁵ | **✘** | **ENGINE** |
| arquitetoKeywordUrlRelations | ✔ | ✔ | ✔ | ✔ | **✘** | ✘ | ✘ | **ZERO LEITORES** |

¹ transportado dentro de `arquitetoKeywordUrlRelations`, sem nenhum leitor.
² usados em `SerpSearchInput.requiredTopics` / `articleEntities` — o diagnóstico
do snapshot calcula `missingTopics` e `frequentEntities` a partir deles.
³ usado como `expectedIntent`: o normalizador DataForSEO registra conflito
quando a intenção observada diverge da esperada.
⁴ `expectedFormat` é consumido **apenas** pelo provider `serper`
(`lib/radar/serper-provider-core.ts:79`); o normalizador DataForSEO — o provider
canônico — o ignora.
⁵ leitor único: `lib/radar/editorial-context.ts` (painel recolhido de
diagnóstico). Nenhum consumidor de pesquisa.

---

## 7 · Classificação por tipo de perda

**`TRANSPORT_LOSS`** — existe na origem, não atravessa o handoff:

```
KeywordDNA.searchIntent · likelyEditorialType · centralEntity · modifiers
audience · perceivedProblem · desiredResult · awarenessLevel · journeyStage
objections · dominantEmotion · commercialPotential · affiliatePotential
volumeSearch · resultCount · kgrScore · kgrIdentity · demandEvidence
siteEvidence · primaryKeywordPolicy · architectureStatus · humanConfirmed
```

Todas — **inclusive as da principal**. O Radar não conhece o volume nem o KGR
nem a intenção declarada de nenhuma keyword do artigo.

**`ENGINE_CONSUMER_MISSING`** — chega, é projetado na tela, nenhum motor usa:

```
secundárias e reforços (texto e papel)
SERP de formação · veredito · decisões humanas
InternalLinkGraph.edges e anchorConcepts
SiloPage.slug/canonical/publicationStatus
ArticleDNA.questions · coverage · hierarchy(expectedFormat no DataForSEO)
```

**`DISPLAY_ONLY_MISSING`** — chega e nem projetado é:

```
ArticleDNA.objections
ArticleDNA.classification · intentProfile · volumeStrategy
ArticleDNA.keywordStrategy · serpStrategy · unitPurpose
ArticleDNA.primaryKeywordMetrics · primaryKeywordCandidates · primaryKeywordDecision
SiloDNA.payload (entity, macroIntent, boundary, narrative)
arquitetoKeywordUrlRelations (zero leitores em qualquer camada)
```

**`ORIGIN_MISSING`**:

```
combinedVolume · combinedResults (nenhum campo agregado existe no ArticleDNA)
CPC · KD · adsCompetition · trend (não estão no KeywordDNASchema)
```

Sobre os quatro últimos: eles são pedidos no escopo desta auditoria, mas
`KeywordDNASchema` não os declara. Se existirem, existem em outro artefato do
Minerador — e nesse caso a pergunta muda de "por que não chegam" para "de qual
artefato viriam". Não afirmo que existam.

---

## 8 · O que o Radar usa hoje — Verificado no código

```
CURRENT_RADAR_RESEARCH_INPUTS = [
  principalKeyword (texto resolvido),        // consulta da coleta
  ArticleDNA.mainIntent,                     // expectedIntent → conflito no diagnóstico
  ArticleDNA.requiredTopics,                 // missingTopics do diagnóstico
  ArticleDNA.entities,                       // frequentEntities do diagnóstico
  currentSerpSnapshot (organicResults, PAA, related, knowledgeGraph, diagnostic),
  selectedUrls (curadoria confirmada),
  extractedPages (HTML normalizado das selecionadas),
  ArticleDNA.promise + requiredTopics,       // keywordTerms do relatório
]
```

Por etapa:

| Etapa | Entradas reais |
|---|---|
| Coleta SERP | principal + mainIntent + requiredTopics + entities + hierarchy |
| Seleção de referências | apenas as decisões humanas sobre o snapshot |
| Análise das páginas | URL + **principal** (`extractCompetitorPage(url, { keyword })`) |
| Classificação de intenção | títulos e snippets do snapshot (`intentFor`) — **não** o ArticleDNA |
| Classificação de formato | `classifyRadarExtractionFormat` sobre a página extraída |
| Lacunas | tópicos observados × consulta/principal (`topic-classification`) |
| Oportunidades | derivadas das lacunas |
| Relatório competitivo | payload da análise + ArticleDNA (promise, requiredTopics, entities, mainIntent) |

**Dois achados concretos nesta seção:**

1. `competitive-report.ts:262` monta `keywordTerms` com
   `input.article.keywordReferences.map(reference => reference.keywordId)` —
   **os IDs**, não os textos das keywords. Comparar termos extraídos contra
   identificadores nunca casa: `keywordObservations` só encontra algo por
   `promise` e `requiredTopics`. As secundárias participam do cálculo como
   strings opacas.
2. `buildRadarCompetitiveModel` aceita `editorialTopics` — o parâmetro existe e
   `topic-classification` o usa para promover lacuna — mas **nenhum chamador o
   passa**. O consumidor foi construído; a entrada nunca foi ligada.

---

## 9 · O que ele poderia usar

```
AVAILABLE_BUT_UNUSED = [
  secundárias e reforços como CONSULTAS (hoje só a principal é pesquisada),
  KeywordDNA.searchIntent e likelyEditorialType (intenção declarada por keyword),
  KeywordDNA.centralEntity e modifiers (âncora semântica real),
  KeywordDNA.volumeSearch/resultCount/kgrScore (peso de cada keyword),
  KeywordDNA.demandEvidence e siteEvidence,
  ArticleDNA.questions e coverage (contraparte editorial de PAA e tópicos),
  ArticleDNA.objections e differentiation,
  ArticleDNA.classification/intentProfile/serpStrategy,
  SERP de formação: URLs, veredito e decisão humana já tomada,
  SiloDNA: entidade, fronteira anticanibalização, narrativa,
  SiloPage: slug e status de publicação,
  InternalLinkGraph: relações aprovadas e anchorConcepts,
]
```

Três dessas são as que mais mudariam a investigação de `cremes skin care`:

- **as secundárias como consultas** — hoje uma SERP só, da principal;
- **a SERP de formação** — o Arquiteto já olhou esta consulta e uma pessoa já
  decidiu algo sobre ela; o Radar recomeça do zero;
- **`coverage` + `questions` + `objections`** — a contraparte editorial que
  hoje falta para separar lacuna real de bloco de vitrine.

---

## 10 · Entrega

```
ARTICLE_KEYWORDS_EXPECTED = principal + secundárias(≤5) + reforços  · Bloqueado para o caso real
ARTICLE_KEYWORDS_FOUND    = Bloqueado (sem leitura remota nesta sessão)

KEYWORD_DNA_COMPLETE_AT_ORIGIN = YES
ARTICLE_DNA_COMPLETE_AT_ORIGIN = YES (exceto combinedVolume/combinedResults, que não existem)
SILODNA_COMPLETE_AT_ORIGIN     = YES
SILOPAGE_COMPLETE_AT_ORIGIN    = YES

FORMATION_SERP_EXISTS      = YES no contrato · Bloqueado para o caso real
INTERNAL_LINK_GRAPH_EXISTS = YES no contrato · Bloqueado para o caso real

HANDOFF_HAS_KEYWORD_CONTEXT  = PARCIAL — identidade e papel; nenhuma métrica ou classificação
HANDOFF_HAS_ARTICLE_CONTEXT  = YES — o ArticleDNA inteiro é carregado
HANDOFF_HAS_SILO_CONTEXT     = PARCIAL — ponteiros e SiloPage; payload do SiloDNA não
HANDOFF_HAS_FORMATION_SERP   = YES
HANDOFF_HAS_LINK_GRAPH       = YES

RADARITEM_PRESERVES_ALL   = NO (preserva o que o handoff emite; o que não é emitido não chega)
WORKSPACE_LOADS_ALL       = YES (o que está persistido é carregado)
RADAR_ENGINE_CONSUMES_ALL = NO

TRANSPORT_LOSSES = [KeywordDNA inteiro exceto id/versão/texto/papel]
PROJECTION_LOSSES = [ArticleDNA.objections, classification, intentProfile, volumeStrategy,
                     keywordStrategy, serpStrategy, primaryKeywordMetrics,
                     SiloDNA.payload, arquitetoKeywordUrlRelations]
ENGINE_UNUSED_DATA = [secundárias, reforços, SERP de formação, decisões humanas da formação,
                      InternalLinkGraph, SiloPage, ArticleDNA.questions/coverage/hierarchy]

ROOT_CAUSE = O handoff Arquiteto→Radar transporta a IDENTIDADE das keywords
             (RadarHydrationKeywordSchema: 12 campos, todos de identificação) e
             nunca o PAYLOAD do KeywordDNA; e os blocos que atravessam inteiros
             — SERP de formação, decisões humanas, InternalLinkGraph, SiloPage —
             têm como único leitor o painel de diagnóstico, sem nenhum
             consumidor no motor de pesquisa. O Radar investiga com a principal
             porque é a única coisa que ele recebe COM conteúdo e lê COM motor.

PROVIDER_CALLS = 0
REMOTE_WRITES = 0
CODE_FILES_CHANGED = 0
```

---

## 11 · Para fechar o que ficou Bloqueado

Três leituras remotas respondem tudo que falta, e são `SELECT` puros:

1. **Quantas KeywordDNAs o artigo tem, e o que elas contêm** — ler
   `editorial_artifact_versions` com `artifact_type = 'keyword_dna'` para os
   `keywordId` de `keywordReferences` do ArticleDNA v7 de `cremes skin care`.
2. **Se existe SERP de formação** — ler o `serpAssessmentRef` do mesmo
   ArticleDNA e o `arquitetoSerpProvenance` da linha do Radar.
3. **Se existe grafo de links** — ler `arquitetoInternalLinks` da mesma linha.

Com essas três eu fecho `ARTICLE_KEYWORDS_FOUND`, `FORMATION_SERP_EXISTS` e
`INTERNAL_LINK_GRAPH_EXISTS` para o caso real, sem alterar código.
