# RADAR / ARQUITETO R10.1B — Fundação completa das keywords no ArticleDNA

Data: 2026-09-07 · Lote: R10.1B

```
MIGRATIONS = 0
PROVIDER_CALLS = 0
REMOTE_WRITES = 0
```

---

## 1 · A auditoria da formação — e uma correção da minha suposição anterior

`lib/arquiteto/adapters.ts` → `articleKeywordReference()` é o construtor real de
`ArticleKeywordReference`. Auditado campo a campo, **já vinha muito mais do que
eu disse no R10.1**:

| Campo | Já vinha? | De onde |
|---|---|---|
| `keywordDnaSnapshot` | **SIM, sempre** | snapshot fornecido, ou `buildKeywordDnaProvenanceSnapshot` |
| `normalizedIntent` | SIM | `normalizeSearchIntent(keyword.intent ‖ analise_semantica.intencao_principal)` |
| `coveredIntentions` | SIM | `keyword.intent` |
| `volume` | SIM | `keyword.volume_search` |
| `resultCount` | SIM | `keyword.results_allintitle` |
| `kgrScore` | SIM | `keyword.kgr_score` |
| `incrementalVolume` | SIM | volume, quando secundária |
| `contribution` / `purpose` / `purposeRationale` | SIM | derivados do papel |
| `overlapRisk` | SIM | `"unknown"` |
| `keywordUrlRelation` / `urlEvidence` | SIM | quando existem na keyword |
| `demandEvidence` | SIM | `normalizeKeywordDemandEvidence` |
| **`semanticQualification`** | **NÃO** | existia no handoff e parava ali |

**Correção honesta:** no R10.1 eu registrei `NOT_IN_THIS_VERSION` para funil e
entidade central. Isso era artefato da **minha fixture de teste**, que omitia o
snapshot — não do pipeline. O pipeline sempre anexou `keywordDnaSnapshot` a
**todos os papéis**, principal, secundária e reforço igualmente.

`KEYWORD_DNA_SNAPSHOT_GUARANTEED = YES (já era, agora provado em teste)`

---

## 2 · O gap real: a qualificação semântica

O Minerador consolida intenção e funil no artefato
`keyword_semantic_qualification`. O handoff **já a transportava** —
`lib/arquiteto/minerador-handoff.ts:30` declara
`semanticQualification { versionId, versionNumber, contentHash, intent, funnel,
semanticState, collectedAt }`, e `keyword-dna-projection.ts:246` a projeta na
tela do Arquiteto que aparece nos prints ("Intenção consolidada: Transacional ·
Funil consolidado: BOFU · Estado da evidência: Conclusiva").

Mas `articleKeywordReference` **não a lia**. O ArticleDNA guardava as métricas e
perdia a leitura semântica que as explicava — e por isso o Radar mostrava
"Intenção: Pendente" para uma keyword que o Minerador já havia classificado.

### A correção

`ArticleKeywordReferenceSchema` ganhou `semanticQualificationRef` — **aditivo,
opcional, `.strict()`**, com a mesma forma que o handoff já usava:

```
versionId · versionNumber? · contentHash · intent · funnel · semanticState · collectedAt
```

É **referência versionada, não cópia mutável**: aponta para o artefato que
existia quando aquela versão do ArticleDNA foi formada. E vale igual para os
três papéis — o envelope do fundamento não muda com o papel.

Nada é inventado: sem `versionId`, `contentHash`, data e estado reais, a
referência simplesmente não existe, e a ausência fica explícita.

---

## 3 · O Radar resolve sozinho

Nenhuma segunda projeção. `RadarArticleResearchContext` passou a resolver
`semanticQualification` no mesmo `estrategiaDe()`, e:

- **UI** — o perfil da keyword ganhou `Intenção consolidada`, `Funil
  consolidado`, `Estado da evidência`, `Versão da qualificação`, `Hash da
  qualificação` e `Qualificação coletada em`;
- **Motor** — `radarDeclaredCommercialSignal` passou a ler também a intenção
  consolidada. Uma keyword `Transacional/BOFU` faz o painel dizer que a SERP
  comercial é **coerente** com a composição.

`NOT_IN_THIS_VERSION` volta a significar o que deve: *a versão foi formada sem
este fundamento* — e não *o Arquiteto esqueceu de transportar*.

---

## 4 · O que este lote NÃO fez, e por quê

**A rematerialização dos cinco artigos de homologação não foi executada.**

A seção 7 pede rodar o pipeline real sobre `skin care principia`, `cremes skin
care`, `skin care coreano`, `mascara de skincare` e `serum facial principia`.
Isso exige o banco real, que **não é alcançável desta sessão** — o conector
Supabase lista apenas `betinna` e `somatec`, e `to_regclass` devolveu `null`
para `editorial_workflow_items` e `minerador_keywords` nos dois (provado no
R10).

O que este lote entrega é a **capacidade**: toda formação daqui em diante
incorpora a qualificação. Os ArticleDNA aprovados existentes **permanecem
intactos** — como devem. Para que ganhem o fundamento, é preciso reformá-los
pelo pipeline canônico do Arquiteto, que já cria sucessora com
`previousVersionId`, novo `contentHash` e `changeReason` — sem alterar
composição, principal ou Silo.

```
ARTICLE_IMMUTABILITY_PRESERVED = YES (nenhuma versão foi mutada in-place)
SUCCESSOR_VERSION_USED_FOR_ENRICHMENT = pipeline existente do Arquiteto;
  execução sobre os artigos reais pendente do banco
```

---

## 5 · Testes

`tests/radar-r10-1b-fundacao-keywords.test.mts` — 9 testes:

| | Garantia |
|---|---|
| B, D | todo papel recebe `keywordDnaSnapshot`; o envelope não muda com o papel |
| C | a qualificação é incorporada na formação, para os três papéis |
| P | sem origem completa, nada é inventado; evidência não conclusiva viaja vazia e diz que é vazia |
| E | formar a referência não muta a keyword recebida |
| L | o Radar resolve o fundamento novo sem código especial |
| M | a UI mostra intenção consolidada, funil, estado, versão, hash e data |
| N | o motor consome a intenção consolidada e muda a leitura da SERP |
| E, I | campo aditivo: versão antiga continua válida, e a ausência é declarada |
| J, K | a incorporação não toca principal, papéis nem Silo |

---

## 6 · Entrega

```
ARTICLE_KEYWORD_REFERENCE_FULL_FOUNDATION = YES para formações novas
KEYWORD_DNA_SNAPSHOT_GUARANTEED = YES (já era; agora provado)
SEMANTIC_QUALIFICATION_REFERENCE_CONNECTED = YES (semanticQualificationRef)

PRIMARY_FOUNDATION_COMPLETE       = YES
SECONDARY_FOUNDATION_COMPLETE     = YES
REINFORCEMENT_FOUNDATION_COMPLETE = YES

ARTICLE_IMMUTABILITY_PRESERVED = YES
SUCCESSOR_VERSION_USED_FOR_ENRICHMENT = pipeline canônico; execução pendente do banco

SKIN_CARE_PRINCIPIA_ARTICLE_KEYWORDS = BLOQUEADO (banco inacessível)
SKIN_CARE_PRINCIPIA_RADAR_KEYWORDS   = BLOQUEADO
SKIN_CARE_PRINCIPIA_FULL_FOUNDATIONS = BLOQUEADO

RADAR_UI_MATCHES_ARTICLE_FOUNDATIONS = YES (mesma projeção; provado em teste)
RADAR_ENGINE_RECEIVES_FULL_FOUNDATIONS = YES

RADAR_TESTS_TOTAL = 360
RADAR_TESTS_PASS  = 360
RADAR_TESTS_FAIL  = 0

ARQUITETO_TESTS_TOTAL = 1525
ARQUITETO_TESTS_PASS  = 1524
ARQUITETO_TESTS_FAIL  = 1 (pré-existente e alheio: espera a string
  "Processar lógica" num componente do Minerador; git diff em lib/minerador vazio)

MIGRATIONS = 0
PROVIDER_CALLS = 0
TYPECHECK_ERRORS = 0

NEXT_RECOMMENDED_LOT = reformar os cinco artigos de homologação pelo pipeline
  do Arquiteto (sucessora, composição idêntica) e conferir o smoke Arquiteto ↔
  Radar. Só depois disso o R10.2 — pesquisa multi-keyword ponderada — tem
  fundamento completo para trabalhar.
```
