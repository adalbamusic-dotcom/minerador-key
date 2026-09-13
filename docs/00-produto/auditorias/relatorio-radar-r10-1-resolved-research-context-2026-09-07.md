# RADAR R10.1 — Contexto de pesquisa resolvido do artigo

Data: 2026-09-07 · Lote: R10.1 · Implementação autorizada pelo R10.

```
PROVIDER_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0
MIGRATIONS = 0
NOVA_ENTIDADE_PERSISTENTE = 0
```

---

## 0 · O que este lote resolve

A auditoria R10 provou que o Radar recebia muito mais contexto do que lia, e que
as duas fontes de keyword eram complementares e incompletas:

- `arquitetoKeywordDnaReferences` tem **os números** (volume, resultCount,
  kgrScore, intenção normalizada, contribuição estratégica, e opcionalmente o
  KeywordDNA inteiro) e **não tem o texto**;
- `hydration.keywordSnapshots` tem **o texto** e **não tem os números** — e
  descartava em silêncio qualquer keyword sem linha do Minerador.

Ninguém as juntava, e o único leitor dos blocos do Arquiteto era o painel de
diagnóstico.

---

## 1 · `RadarArticleResearchContext`

`lib/radar/article-research-context.ts` — **projeção pura**. Não é DNA novo, não
é entidade nova, não persiste cópia nenhuma: é o RadarItem + o ArticleDNA já
recebidos, resolvidos em uma leitura só.

```
article  · brandId, articleId, articleDnaVersionId, hash, promessa, intenção, hierarquia
keywords · identity + strategy + resolution + provenance, uma por referência
editorialTopics · requiredTopics + coverage do ArticleDNA
resolvedKeywordTexts · os textos que existem de verdade
silo · SiloDNA + SiloPage + papel do artigo
formationSerp · assessment, veredito, decisão humana, relações keyword→URL
internalLinks · grafo aprovado, com anchorConcepts
limitations · o que faltou, nomeado
```

### O join é por identidade, nunca por texto

`referenceKeywordId`, `canonicalKeywordId`, `sourceKeywordId`,
`originalKeywordId` e `aliases` formam o conjunto de identidade de cada lado.
Casar por texto reintroduziria exatamente o que a auditoria condenou — inferir
identidade a partir de string parecida.

### Nenhuma keyword some

A regra que substitui o `if (!source || !keyword) return null`:

> cinco referências entram, cinco keywords saem.

Quando o texto não resolve, a keyword permanece com `resolution: PARTIAL` (ou
`UNRESOLVED` quando também falta estratégia) e a ausência vira limitação
explícita. **O id nunca vira texto.**

### A principal é única, e o Radar não escolhe outra

Zero ou duas principais produzem limitação estrutural declarada. O Radar não
desempata — isso é decisão do Arquiteto.

---

## 2 · Correções ligadas

**`keywordId` como texto — corrigido.** `competitive-report.ts` montava
`keywordTerms` com `keywordReferences.map(r => r.keywordId)`. Agora usa
`researchContext.resolvedKeywordTexts`. Keyword sem texto **não entra** na
análise textual e vira limitação; o id não é fallback.

**`editorialTopics` — ligado.** O painel passa
`editorialTopics: researchContext?.editorialTopics` a
`buildRadarCompetitiveModel`, com fonte canônica `ArticleDNA.requiredTopics +
coverage`. `topic-classification` passa a distinguir `COMPETITIVE_GAP` de
`ISOLATED_TOPIC` usando consulta + principal + contexto editorial.

**A principal do modelo** deixou de ser a consulta da SERP por conveniência e
passou a ser a principal resolvida do contexto.

---

## 3 · Os fundamentos do artigo, na UI

O ajuste de escopo mudou a natureza desta seção: KeywordDNA, ArticleDNA e
SiloDNA **não são provenance técnica** — são o que o artigo é. A mesma
projeção que alimenta o motor passou a alimentar a leitura humana. Não existe
um contexto técnico para o motor e um resumo pobre para a pessoa.

`lib/radar/foundation-profiles.ts` transforma o contexto em seções de leitura,
no card **Conteúdo**, com o padrão do Arquiteto: resumo visível + expansível.

**Resumo por keyword** — todas: principal, secundárias e reforços, com texto,
papel, volume, resultados, KGR, intenção, contribuição e risco de sobreposição.

**Perfil completo da keyword** (um clique): Identidade · Leitura lógica ·
Demanda · Competição SEO · Qualificação semântica · Proveniência e publicação.
**O mesmo envelope para os três papéis** — uma secundária deixou de ser
`{ keywordId, role }`.

**Definição completa** (um clique): Article · Silo · Formação do artigo ·
Arquitetura interna, com versão, hash, veredito, decisão humana, relações e
conceitos de âncora.

### Ausência tem tipo

Nenhum campo some em silêncio. Cada um declara qual é a sua ausência:

```
AVAILABLE            valor real
NOT_INFORMED         a origem não informou
PENDING              aguarda decisão upstream
NOT_APPLICABLE       não se aplica a este papel (ex.: volume incremental na principal)
NOT_IN_THIS_VERSION  o artefato não foi incorporado nesta versão do ArticleDNA
```

### O motor lê a intenção declarada

`radarDeclaredCommercialSignal` responde, antes de olhar a SERP, se a própria
composição declara comportamento comercial. Quando declara, o painel diz:
*a SERP com lojas e produtos é coerente com essa composição — a ausência de
amostra editorial descreve a consulta, não uma falha da coleta*.

Foi exatamente o que faltou em `cremes skin care`: páginas de produto foram
julgadas incomparáveis sem ninguém perguntar se o artigo é transacional.

---
## 4 · Testes

`tests/radar-r10-1-research-context.test.mts` — 18 testes cobrindo A–R, o
contrato de consumo do item 15 e o fechamento UI ↔ engine:

| | Garantia |
|---|---|
| A, R | 5 referências + 5 hidratações → 5 keywords; a conta fecha |
| B, C | 5 referências + 1 hidratação → **5 keywords**, 4 como `PARTIAL` |
| D | principal única; 0 ou 2 viram limitação, nunca inferência |
| E, F | secundária e reforço têm o **mesmo** envelope estratégico da principal |
| G, H | o relatório observa os textos reais; nenhum id vira termo |
| I, J | `editorialTopics` chega ao modelo e muda a classificação |
| K, L | SERP de formação e decisão humana chegam ao contexto |
| M, N | SiloDNA, SiloPage e grafo de links chegam ao contexto |
| O | projeção de leitura: não muta a linha, e o grafo é copiado |
| P | cross-brand continua bloqueado |
| Q | linha legada continua parseando, como `PARTIAL` |
| 15 | os blocos do Arquiteto deixaram de ter o painel como único consumidor |
| UI ↔ engine | `ENGINE_KEYWORD_COUNT = UI_KEYWORD_COUNT = ARTICLE_KEYWORD_COUNT` |
| fundamentos | keyword parcial continua visível, com a ausência nomeada |
| fundamentos | pendente, não informado e não disponível são estados distintos |
| fundamentos | as quatro seções de leitura existem e nomeiam o que falta |
| engine | a intenção declarada das keywords é consumida na leitura da SERP |

Os dois testes de diagnóstico do R10 que afirmavam o comportamento quebrado
foram invertidos: agora provam a correção.

---

## 5 · Entrega

```
RADAR_ARTICLE_RESEARCH_CONTEXT = lib/radar/article-research-context.ts (projeção pura)

ARTICLE_KEYWORD_REFERENCES = 5 (fixture)
RESOLVED_KEYWORDS = 5

SILENT_KEYWORD_DROP = NO

PRIMARY_CONTEXT_COMPLETE       = YES
SECONDARY_CONTEXT_COMPLETE     = YES
REINFORCEMENT_CONTEXT_COMPLETE = YES

KEYWORD_IDS_USED_AS_TEXT = NO

EDITORIAL_TOPICS_CONNECTED = YES (ArticleDNA.requiredTopics + coverage)

FORMATION_SERP_CONTEXT_CONNECTED     = YES
FORMATION_HUMAN_DECISION_CONNECTED   = YES
SILO_CONTEXT_CONNECTED               = YES
INTERNAL_LINK_CONTEXT_CONNECTED      = YES

COMPETITIVE_REPORT_USES_RESOLVED_KEYWORDS = YES
COMPETITIVE_MODEL_USES_EDITORIAL_CONTEXT  = YES

LEGACY_ITEMS_SUPPORTED = YES (parse preservado; estado PARTIAL com limitações)

RADAR_TEST_FILES  = 50
RADAR_TESTS_TOTAL = 351
RADAR_TESTS_PASS  = 351
RADAR_TESTS_FAIL  = 0
TYPECHECK_ERRORS_IN_RADAR = 0

PROVIDER_CALLS = 0
REMOTE_WRITES_DURING_TESTS = 0
MIGRATIONS = 0

NEXT_RECOMMENDED_LOT = R10.2 — usar o contexto para pesquisa multi-keyword:
  SERP das secundárias com peso por volume/KGR, cruzamento com a SERP de
  formação (URL já vista, divergência já resolvida) e leitura de lacuna
  ancorada em coverage/questions. O contexto já está resolvido e disponível;
  falta decidir COMO usá-lo.
```

---

## 6 · O que este lote deliberadamente não fez

Nenhuma coleta multi-keyword, nenhum scoring de concorrente, nenhum provider
novo. `ArticleDNA`, `SiloDNA`, `InternalLinkGraph` e Planejador intactos;
nenhuma migration; nenhum redesenho de layout.

Uma observação honesta sobre o alcance: o contexto agora **chega ao motor**, mas
quem o consome hoje são: o relatório competitivo (textos resolvidos), o modelo
(tópicos editoriais e principal resolvida), a leitura da SERP (intenção comercial
declarada) e a UI de fundamentos (tudo). Volume, KGR, contribuição, SERP de
formação, Silo e grafo estão **projetados, visíveis e disponíveis ao motor**;
ainda não ponderam a pesquisa — isso é o R10.2.
