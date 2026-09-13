# RADAR R10.2C — Auditoria da ponte: CompetitorUniverse → Curadoria → Extração

Data: 2026-09-09 · Lote: R10.2C · **Auditoria read-only, sem correção**

```
PRODUCTION_CODE_CHANGES = 0
PROVIDER_CALLS_DURING_AUTOMATED_TESTS = 0
MIGRATIONS = 0
REMOTE_WRITES = 0
ARQUIVOS DE DIAGNÓSTICO CRIADOS = 1
  tests/radar-r10-2c-ponte-universo-curadoria.test.mts (7 testes, 7 passando)
  — exigido pela seção 4 do lote; não altera produção
```

---

## ENTREGA

```
MULTI_QUERY_DISCOVERY          = YES
MULTI_QUERY_CURATION           = NO
MULTI_QUERY_EXTRACTION         = NO
MULTI_QUERY_COMPETITIVE_MODEL  = NO

AUXILIARY_ONLY_EDITORIAL_COMPETITOR_FOUND = YES  (provado em fixture; no smoke real
                                                  depende dos dados — SQL na seção 1)
AUXILIARY_ONLY_COMPETITOR_CAN_BE_CURATED  = NO
AUXILIARY_ONLY_COMPETITOR_CAN_BE_ANALYZED = NO

CANONICAL_RESULTS              = 7   (o que a UI mostra é exatamente isto)
CURATION_AVAILABLE_URLS        = 7   (= CANONICAL_RESULTS, sempre)
CURATION_SELECTED_URLS         = 7
ANALYSIS_MEMBERSHIP_URLS       = 7

UNIQUE_MULTI_QUERY_URLS        = NÃO OBTENÍVEL DESTA SESSÃO (banco inalcançável)
RECURRENT_URLS                 = NÃO OBTENÍVEL DESTA SESSÃO
RECURRENT_DOMAINS              = NÃO OBTENÍVEL DESTA SESSÃO
PROVIDER_CALLS_CANONICAL       = NÃO OBTENÍVEL DESTA SESSÃO (esperado: 1)
PROVIDER_CALLS_AUXILIARY       = NÃO OBTENÍVEL DESTA SESSÃO (esperado: 3)
PROVIDER_CALLS_TOTAL           = NÃO OBTENÍVEL DESTA SESSÃO (esperado: 4)

ROOT_CAUSE_IF_DISCONNECTED     = a identidade da curadoria é POSICIONAL dentro do
                                 snapshot canônico (`organic:${position}`), e a
                                 projeção da aba percorre `view.organicResults`.
                                 Uma URL de outra consulta não tem nome nesse
                                 espaço de identidade — logo não tem linha, não
                                 tem decisão, não tem chave e não tem extração.
```

**A sua hipótese da seção 6 está correta, integralmente.**

---

## 0 · O que é prova e o que é dedução

Duas classes de resposta neste relatório, nunca misturadas:

| Marca | Significado |
| --- | --- |
| **Verificado no código** | li a função que a tela chama |
| **Confirmado por teste** | `tests/radar-r10-2c-ponte-universo-curadoria.test.mts`, executado agora |
| **Bloqueado** | exige o banco real, que **não é alcançável desta sessão** |

O banco continua inalcançável (provado duas vezes em R10 e R10.1C: o conector
Supabase lista `betinna` e `somatec`, e `to_regclass` devolveu `null` para
`editorial_workflow_items` e `minerador_keywords` nos dois). Então **as listas
de URLs do smoke real e o log de uso são seus para executar** — a seção 1 traz o
SQL exato, read-only, contra o schema real.

---

## 1 · As identidades reais — onde cada lista mora

Nenhuma das listas foi inventada aqui. Cada uma tem endereço:

| Lista | Onde mora |
| --- | --- |
| `CANONICAL_SERP_URLS` | `editorial_serp_snapshots.payload -> 'research' -> 'organicResults'` |
| `AUXILIARY_QUERY_*_URLS` | `editorial_workflow_items.payload -> 'analysisVersions' -> [n] -> 'payload' -> 'deepResearch' -> 'queries' -> [i] -> 'evidence' -> 'results'` |
| `COMPETITOR_UNIVERSE_URLS` | **não é persistido** — é derivado em memória por `buildRadarCompetitorUniverse` a cada render |
| `CURATION_AVAILABLE_URLS` | derivado de `view.organicResults` (= a canônica) |
| `CURATION_SELECTED_URLS` | `...payload -> 'serpDecisions'` com `decision = 'included'` |
| `ANALYSIS_MEMBERSHIP_URLS` | `...payload -> 'extractions' -> [] -> 'url'` cruzado com a seleção |

### SQL read-only para preencher as listas

**1a · URLs da SERP canônica**

```sql
select r->>'position' as posicao, r->>'url' as url, r->>'domain' as dominio, r->>'inferredType' as tipo
from editorial_serp_snapshots s
cross join lateral jsonb_array_elements(s.payload->'research'->'organicResults') r
where s.marca_id = :brand_id
  and s.article_id = :article_id
order by s.snapshot_version desc, (r->>'position')::int;
```

**1b · URLs por consulta da investigação (canônica + auxiliares)**

```sql
select q->>'keyword'    as keyword,
       q->>'role'       as papel,
       q->>'serpClass'  as classe,
       q->>'execution'  as execucao,
       q->'evidence'->>'snapshotId'  as snapshot,
       q->'evidence'->>'resultCount' as resultados_na_serp,
       res->>'position' as posicao,
       res->>'url'      as url,
       res->>'domain'   as dominio
from editorial_workflow_items w
cross join lateral jsonb_array_elements(w.payload->'analysisVersions') v
cross join lateral jsonb_array_elements(v->'payload'->'deepResearch'->'queries') q
left join lateral jsonb_array_elements(q->'evidence'->'results') res on true
where w.marca_id = :brand_id
  and w.article_id = :article_id
  and w.stage = 'radar'
  and (v->'payload'->>'deepResearch') is not null
order by (v->>'versionNumber')::int desc, q->>'role', (res->>'position')::int;
```

> **Atenção ao ler:** a evidência guarda **no máximo 10 resultados por consulta**
> (`RADAR_QUERY_EVIDENCE_LIMIT`). `resultCount` traz o total que a SERP devolveu;
> `results` traz o recorte guardado. Se `resultCount > 10`, a lista é o topo 10.

**1c · Seleção e amostra**

```sql
select v->>'versionNumber' as versao,
       jsonb_array_length(v->'payload'->'serpDecisions')        as decisoes,
       jsonb_array_length(v->'payload'->'selectedCompetitorIds') as selecionadas,
       jsonb_array_length(v->'payload'->'extractions')          as extraidas,
       v->'payload'->'selectedCompetitorIds'                    as chaves_selecionadas,
       (select jsonb_agg(p->>'url') from jsonb_array_elements(v->'payload'->'extractions') p) as urls_extraidas
from editorial_workflow_items w
cross join lateral jsonb_array_elements(w.payload->'analysisVersions') v
where w.marca_id = :brand_id and w.article_id = :article_id and w.stage = 'radar'
order by (v->>'versionNumber')::int desc;
```

**1d · Recorrência real (seção 7) — as URLs que aparecem em mais de uma consulta**

```sql
with observadas as (
  select q->>'keyword' as keyword, q->>'role' as papel, q->>'serpClass' as classe,
         res->>'url' as url, res->>'domain' as dominio, (res->>'position')::int as posicao
  from editorial_workflow_items w
  cross join lateral jsonb_array_elements(w.payload->'analysisVersions') v
  cross join lateral jsonb_array_elements(v->'payload'->'deepResearch'->'queries') q
  cross join lateral jsonb_array_elements(q->'evidence'->'results') res
  where w.marca_id = :brand_id and w.article_id = :article_id and w.stage = 'radar'
    and (v->>'versionNumber')::int = (
      select max((v2->>'versionNumber')::int)
      from jsonb_array_elements(w.payload->'analysisVersions') v2
      where (v2->'payload'->>'deepResearch') is not null)
)
select url, dominio,
       count(distinct keyword) as consultas,
       array_agg(distinct papel)  as papeis,
       array_agg(distinct classe) as classes,
       array_agg(posicao order by posicao) as posicoes
from observadas
group by url, dominio
having count(distinct keyword) > 1
order by consultas desc, dominio;
```

**1e · Custo real (seção 8)**

```sql
select metadata->>'operationKind' as tipo,
       count(*)      as chamadas,
       sum(units)    as unidades,
       min(occurred_at) as primeira,
       max(occurred_at) as ultima
from integration_usage_events
where brand_id = :brand_id
  and module = 'radar'
  and metadata->>'articleId' = :article_id
  and occurred_at >= :inicio_do_smoke
group by 1
order by 1;
```

Esperado: `serp` = 1 (`PROVIDER_CALLS_CANONICAL`) e `serp_auxiliary` = 3
(`PROVIDER_CALLS_AUXILIARY`), total 4. O `idempotencyKey` distingue as duas
famílias (`dataforseo:radar:serp:…` × `dataforseo:radar:serp-auxiliar:…`).

---

## 2 · Fechando as contagens — a parte que o código já responde

```
CANONICAL_RESULTS         = 7          ← a UI mostra exatamente isto
CURATION_AVAILABLE_URLS   = 7          ← IGUAL a CANONICAL_RESULTS, por construção
CURATION_SELECTED_URLS    = 7          ← as 7 marcadas
ANALYSIS_MEMBERSHIP_URLS  = 7          ← a amostra confirmada

AUXILIARY_OBSERVATIONS    = soma dos `resultCount` das 3 auxiliares   (SQL 1b)
TOTAL_OBSERVATIONS        = CANONICAL_RESULTS + AUXILIARY_OBSERVATIONS
UNIQUE_URLS_ACROSS_ALL_QUERIES = distintas do SQL 1b
COMPETITOR_UNIVERSE_URLS  = UNIQUE_URLS_ACROSS_ALL_QUERIES            (ver nota)
```

**Nota sobre `COMPETITOR_UNIVERSE_URLS`:** o universo não filtra URL nenhuma. Ele
**classifica** todas — inclusive como `NOT_RELEVANT` — então o número de
candidatos é sempre igual ao número de URLs únicas observadas. O que muda entre
elas é a classe, não a presença. *(Verificado no código:
`competitor-universe.ts`, o laço acumula por `normalizar(url)` e nada é
descartado.)*

**A identidade das três contagens de 7 não é coincidência: é a mesma fonte.**
*(Verificado no código)*

| Contador na tela | Função | Fonte |
| --- | --- | --- |
| `Resultados SERP` | — | `view.organicResults.length` |
| `Concorrentes selecionados` | `buildRadarSerpCurationSummary` | projeção sobre `view.organicResults` |
| `Amostra confirmada` | `buildRadarAnalysisMembership` | a mesma projeção |
| `Analisar páginas selecionadas (N)` | `radarAnalysisCandidates` | a mesma projeção |

As quatro leem o **snapshot canônico**. Nenhuma delas conhece o universo.

---

## 3 · A pergunta principal — resposta hop a hop

> Uma URL que **não** aparece na Principal, **aparece** numa Secundária e recebe
> `EDITORIAL_COMPETITOR` pode hoje:

| | Etapa | Resposta | Prova |
| --- | --- | --- | --- |
| **A** | aparecer na aba Concorrentes | **NO** | HOP 2 |
| **B** | ser selecionada pelo humano | **NO** | HOP 3 |
| **C** | entrar na extração | **NO** | HOP 4 |
| **D** | entrar no CompetitiveModel | **NO** | HOP 5 |
| **E** | entrar no relatório final | **NO** | consequência de D — o relatório lê `extractions` e o modelo |

Cinco NOs. A descoberta multi-query existe e funciona; ela **para no resumo**.

---

## 4 · A prova, com a fixture da seção 4

`tests/radar-r10-2c-ponte-universo-curadoria.test.mts` — 7 testes, **7 passando**,
cada hop chamando a mesma função que a tela chama.

```
Principal   → A B C     (SERP canônica)
Secundária1 → B D E     (SERP auxiliar)
Secundária2 → D F       (SERP auxiliar)
```

| Hop | O que foi provado |
| --- | --- |
| **1 · Descoberta** | universo = A B C D E F; `D.classification = EDITORIAL_COMPETITOR`, `D.principalRank = null`, `D.queryCount = 2`. **A descoberta multi-query funciona.** |
| **2 · Curadoria** | `buildRadarSerpSelectionProjection` devolve **3 linhas** (A B C). D não é renderizável. O painel sequer importa `competitor-universe`. |
| **3 · Seleção** | as chaves existentes são `organic:1..3`. A chave que D teria (`organic:2`, sua posição na auxiliar) **já pertence a B** na canônica. |
| **4 · Extração** | `radarAnalysisCandidates` = 3, sem D. Pedido forjado com D é recusado por `radarExtractionRefusal` → `CURATION_STALE`: *"Somente URLs orgânicas já incluídas na curadoria podem ser extraídas."* |
| **5 · Modelo** | `buildRadarCompetitiveModel` só lê `extractions`; nenhuma medida referencia D. |
| **corte** | descobertas 6 − curáveis 3 = **3 URLs sem porta de entrada** (D, E, F). |

### A célula exata onde a ponte termina

```ts
// lib/radar/serp-curation.ts:110
const rows = compatible ? view!.organicResults.map(result => radarOrganicSelectionFor(analysis, result)) : [];

// lib/radar/serp-curation.ts:12-14
export function radarOrganicDecisionKey(result: Pick<SerpOrganicResult, "position">) {
  return `organic:${result.position}`;
}
```

E o portão que fecha do lado do servidor:

```ts
// lib/radar/extraction-request.ts:155-157
const incluidas = new Set(payload.serpDecisions.filter(d => d.itemType === "organic" && d.decision === "included").map(d => d.key));
const fora = input.candidates.filter(candidate => !incluidas.has(candidate.key)).map(candidate => candidate.key);
if (fora.length) { /* CURATION_STALE */ }
```

E a origem das decisões, uma só:

```ts
// lib/radar/analysis-contracts.ts (createRadarAnalysisVersion)
serpDecisions: [ ...input.research.organicResults.map(result => ({ key: `organic:${result.position}`, … })), … ]
```

**`input.research` é sempre a SERP canônica.** Não existe caminho que insira uma
decisão a partir de outra consulta.

---

## 5 · Não confundir duas coisas — confirmado

A SERP canônica do Article contém **A B C** e **isso não muda**: nada nesta
auditoria toca o snapshot, a revisão ou a aprovação.

O que a auditoria mostra é que **a curadoria da pesquisa profunda hoje é a
curadoria da SERP canônica** — as duas são a mesma superfície, sobre a mesma
lista. Não existe hoje uma curadoria do universo que enxergue A B C D E F sem
transformar D E F em resultados da canônica.

---

## 6 · Arquitetura vigente — o desenho real

```
principal ──► SERP canônica ──► snapshot ──► serpDecisions ──► curadoria ──►
                    │                                              seleção ──►
                    │                                            extração ──►
                    │                                    CompetitiveModel ──► relatório
                    │
                    └──────────────┐
auxiliar 1 ──► evidence ───────────┤
auxiliar 2 ──► evidence ───────────┼──► CompetitorUniverse ──► resumo da investigação
auxiliar 3 ──► evidence ───────────┘                              (contadores)
                                                                      ╳
                                                            fim da linha
```

`buildRadarDeepResearchSummary` é o **único** consumidor de `universe` em todo o
código *(verificado: `grep -rn "\.universe" lib/radar modules/radar` devolve uma
ocorrência, em `deep-research.ts:383`)*. E ele consome **contagens por classe**,
não a lista de candidatos.

---

## 7 · Recorrência real

Estruturalmente a recorrência **está sendo calculada** e é o sinal mais forte do
universo *(HOP 1: B recorre entre canônica e auxiliar, `queryCount = 2`;
D recorre entre duas auxiliares)*. O que não existe é **consequência**: a
recorrência não promove nada, não seleciona nada, não é exibida por URL em lugar
nenhum — ela vira apenas os números `editorialCompetitors` /
`commercialCompetitors` do painel.

Para os valores do smoke real: **SQL 1d**. Ele devolve, por URL recorrente,
`consultas`, `papeis`, `classes` e `posicoes` — que é exatamente a tabela pedida
(`url · queries · roles · ranks · classification`, com a classificação derivável
das colunas por não ser persistida).

---

## 8 · Observação adicional encontrada no caminho

Não faz parte da ponte, mas apareceu ao ler o portão da extração e seria
desonesto omitir:

**O portão valida a CHAVE, não o par chave↔URL.** `radarExtractionRefusal`
confere se `candidate.key` está entre as decisões incluídas, e a rota então busca
`candidate.url`. Como `RadarSerpDecisionSchema` não guarda a URL
(`{key, itemType, decision, reason, note, ownDomain}`), um pedido com uma chave
legítima e uma URL trocada seria buscado pelo servidor.

Mitigação existente: `validateExternalUrl` recusa esquemas não-HTTP(S),
localhost, `.local`, `metadata.google.internal`, IPs privados/loopback/reservados
e revalida o destino após resolução de DNS. O impacto é um fetch de URL pública
arbitrária por um editor autenticado da própria marca — não é escalada de
privilégio nem acesso interno.

**Não corrigido neste lote** (auditoria read-only). Fica registrado para decisão
sua.

---

## 9 · O que NÃO foi tocado

Conforme a seção 9 do lote:

- SERP canônica: intocada;
- ArticleDNA: intocado;
- query plan: intocado;
- qualidade temática, links, Planejador: intocados;
- UI: nenhum redesenho, nenhuma correção;
- produção: **zero linhas alteradas**.

---

## 10 · O que a correção exigiria — para o próximo lote decidir

Sem implementar, o que a prova acima já delimita:

1. **Um espaço de identidade que não seja posicional.** `organic:${position}` só
   existe dentro de um snapshot. Uma referência do universo precisaria de
   identidade própria (por URL normalizada, por exemplo) — e isso muda o formato
   de `serpDecisions`, que é persistido.
2. **Uma superfície de curadoria do universo**, distinta da aba da SERP canônica
   — ou a mesma aba com duas seções nomeadas, sem misturar as listas.
3. **O portão de extração** teria de aceitar a nova identidade sem afrouxar a
   regra "só o que a curadoria incluiu pode ser extraído".
4. **O modelo competitivo** teria de saber dizer de qual consulta veio cada
   página, para que a faixa não misture benchmark da principal com evidência de
   uma secundária de outra intenção.

Nenhuma dessas quatro foi feita. A decisão é sua.
