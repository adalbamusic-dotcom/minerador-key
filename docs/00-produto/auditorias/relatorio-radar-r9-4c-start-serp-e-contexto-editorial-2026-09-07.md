# RADAR R9.4C — Start da SERP visível e ArticleDNA legado × mal hidratado

Data: 2026-09-07 · Área: Radar · Lote: R9.4C (correção do smoke do R9.4B)
`REAL_PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` · `MIGRATIONS = 0` · `COMMITS = 0`.
Escopo fechado nas duas pendências. Nada de CompetitiveModel, relatório
competitivo, aprovação R9, ExternalEvidence, ExpertEvidence, Planejador,
provider DataForSEO ou migrations foi tocado.

---

## PARTE A · O start da SERP

### A causa

A barra da investigação existia e funcionava — mas era renderizada **dentro de
`RadarR3SerpPanel`**, que só monta quando `expandedArea === "serp"`. O
Workbench abre com `expandedArea = null`.

Em artigo sem snapshot isso produzia exatamente o que o smoke viu: a tela sem
nenhuma ação, com a coleta escondida atrás de dois cliques que ninguém tinha
motivo para dar. A ação primária estava certa; o lugar dela estava errado.

Havia um segundo defeito no mesmo ponto. `buildRadarInvestigationView` só
recebia `hasSnapshot`, então ela nunca soube distinguir "ainda não coletou" de
"a coleta foi bloqueada por vínculo". Depois de um bloqueio estrutural a barra
ainda ofereceria `Iniciar coleta SERP` — convidando a pessoa a bater na mesma
parede que o R9.1 já tinha mapeado.

### A correção

1. **A barra saiu do painel.** `modules/radar/radar-investigation-bar.tsx`
   (novo) é montado em `radar-r3-workbench.tsx` no bloco principal, **antes**
   dos cards de área. Não depende de expandir nada.
2. **A ação da coleta passou a vir de quem já sabe classificar a falha.**
   `RadarInvestigationInput` ganhou `collection?: RadarSerpCollectionAction`, e
   a etapa 1 e o botão são derivados dela:

| Estado da coleta | Etapa 1 | Botão | Habilitado |
|---|---|---|---|
| `NOT_COLLECTED` + contexto pronto | pendente | `Iniciar coleta SERP` | sim |
| `NOT_COLLECTED` sem contexto | pendente | `Iniciar coleta SERP` | **não**, com motivo |
| `VALIDATING` / `COLLECTING` / `PERSISTING` | em andamento | `Validando…` / `Coletando SERP…` / `Salvando snapshot…` | **não** |
| `TRANSIENT_FAILURE` | pendente | `Tentar novamente` | sim |
| `STRUCTURAL_BLOCK` | **bloqueada** | `Coleta bloqueada` | **não**, com o motivo escrito |
| com snapshot | concluída | (a ação primária vira `Iniciar curadoria`) | — |

O bloqueio estrutural **não** oferece retry: ele vira motivo escrito no corpo
da barra. Nenhum estado devolve botão mudo — quando não dá para agir,
`nextAction` passa a ser o `blockedReason`.

3. **O clique chama o handler canônico já existente.** O dispatcher continua
   `if (id === "COLLECT") return void collect(target);` — `collect` valida o
   contexto, fecha a porta com `collectingArticleIdRef` antes do primeiro
   `await` e é o único caminho até o provider. Nenhum `useEffect` dispara
   coleta: abrir o artigo, dar F5 ou selecionar a linha não chama provider.

### Evidência

**Confirmado por teste** — `tests/radar-serp-start-visibility.test.mts`
(9 testes): sem snapshot → botão visível e habilitado; com snapshot → a ação
deixa de ser coletar; em voo → visível e desabilitado nos três estados;
bloqueio estrutural → desabilitado, sem "tentar novamente", com motivo;
transitório → retry habilitado; contexto insuficiente → desabilitado com
motivo; ausência de informação de coleta → o start continua oferecido. Mais
dois testes de montagem: a barra está no Workbench antes dos cards, e sumiu do
painel da SERP.

---

## PARTE B · ArticleDNA legado × ArticleDNA mal hidratado

### A causa

Duas coisas diferentes tinham a mesma cara. `buildRadarEditorialContext` lia
**apenas o `ArticleDNA`** e chamava de "CONTEXTO EDITORIAL INCOMPLETO" tanto a
linha antiga, importada antes do transporte atual existir, quanto o artigo novo
cujo Arquiteto realmente não declarou tópicos.

E havia um erro pior embaixo: **o `RadarItem` já transportava seis campos que a
tela nunca projetou**. Verificado no código — nenhum módulo do Workbench lia
`arquitetoKeywordDnaReferences`, `arquitetoSerpProvenance`,
`arquitetoInternalLinks`, `hydration.keywordSnapshots` (fora da resolução de
keyword) nem `hydration.silo.siloPage*`. O buraco era de projeção, não de
transporte.

### A matriz

Rastreamento de contrato: onde cada campo pode existir, e o que a tela fazia
com ele **antes** deste lote.

| CAMPO | ARQUITETO | HANDOFF | RADARITEM | HIDRATADO | UI (antes) | CLASSE |
|---|---|---|---|---|---|---|
| articleDnaVersionId | `versionId` | — (é a própria versão) | `articleDnaVersionId` | `hydration.articleDnaVersionId` | sim (dossiê técnico) | AVAILABLE |
| principal | `principalKeywordId` (id) | `sourceKeywords` → hidratação | `arquitetoStrategyContext.primaryKeyword.keyword` | `hydration.principalKeyword.keyword` | sim | AVAILABLE |
| KeywordDNA refs | `keywordReferences` | cópia direta | `arquitetoKeywordDnaReferences` | `hydration.keywordSnapshots` | **não** | **UI_NOT_RENDERED** |
| secundárias / reforços | `secondaryKeywordIds`, `narrativeReinforcementIds` | via `keywordReferences` | referências não principais | snapshots por papel | **não** | **UI_NOT_RENDERED** |
| intenção | `mainIntent` | cópia direta | `intent` | — | sim | AVAILABLE |
| SiloDNA | `siloId` (nullable) | `ResolvedSiloContext` | `siloId` | `hydration.silo.siloDnaVersionId` | parcial (só o nome) | **UI_NOT_RENDERED** (parcial) |
| SiloPage | — | `silo.siloPageId/Slug/Status` | — | `hydration.silo.siloPage*` | **não** | **UI_NOT_RENDERED** |
| função | `hierarchy` | cópia direta | `hierarchy` | `hydration.silo.articleRole` | sim | AVAILABLE |
| tópicos obrigatórios | `requiredTopics` | **não transporta** | — | — | sim (via ArticleDNA) | AVAILABLE |
| perguntas | `questions` | **não transporta** | — | — | sim (via ArticleDNA) | AVAILABLE |
| entidades | `entities` | **não transporta** | — | — | sim (via ArticleDNA) | AVAILABLE |
| publicationContext | `publishedIdentityRef` | via contexto de estratégia | `arquitetoStrategyContext.publicationStatus` | — | parcial (rótulo) | AVAILABLE |
| decisões humanas | parecer da formação | `serpProvenance.humanResolution` | `arquitetoSerpProvenance` | — | **não** | **UI_NOT_RENDERED** |
| proveniência SERP de formação | parecer da formação | `serpProvenance` / `serpAssessments` | `arquitetoSerpAssessment`, `arquitetoSerpProvenance` | — | **não** | **UI_NOT_RENDERED** |
| InternalLinkGraph ref | grafo aprovado | `internalLinks` | `arquitetoInternalLinks` | — | **não** | **UI_NOT_RENDERED** |

Leitura da matriz: **nenhuma queda de transporte foi encontrada no contrato.**
O que existia era perda de projeção em seis campos — e três campos (tópicos,
perguntas, entidades) que o importador deliberadamente não copia, porque o
Radar já lê o `ArticleDNA` inteiro por outro caminho. Isso não é perda: é
desenho, e agora está escrito na tela.

### A correção — somente a projeção

`lib/radar/editorial-context.ts` foi reescrito para receber a **linha inteira**
(`item`), não só o `ArticleDNA`, e para responder três perguntas separadas:

1. a origem entregou? (ArticleDNA aprovado)
2. o transporte preservou? (RadarItem + hydration)
3. a tela projetou? (a tabela nova)

Cada campo sai com `value`, `source` (`ARQUITETO` / `RADAR_ITEM` /
`HYDRATION` / `NONE`), `classification` e `owner`. A tela mostra a tabela
inteira, campo a campo. Nada é preenchido por inferência.

**A classe da linha** separa os dois casos que estavam colados:

- `LEGACY_INCOMPLETE` → **CONTEXTO EDITORIAL LEGADO**. A linha não tem
  `hydration`, nem `arquitetoKeywordDnaReferences`, nem
  `arquitetoStrategyContext` — os três são `.optional()` no schema justamente
  porque linha antiga não os tem. As ausências vêm da origem; reimportar do
  Arquiteto é o caminho.
- `CURRENT_INCOMPLETE` → **CONTEXTO EDITORIAL INCOMPLETO**. O transporte atual
  funcionou e mesmo assim faltam campos. Aí o Arquiteto tem trabalho a fazer
  **neste artigo**.
- `CURRENT_COMPLETE` → nenhum painel.

**Donos**: `LEGACY_SOURCE_MISSING` → `ARQUITETO`; `HANDOFF_DROPPED` e
`HYDRATION_DROPPED` → `SHARED_TRANSPORT`. `SERVER_DISCARDED` **não é emitido**:
provar que um campo entrou na importação e sumiu depois do round-trip exige
comparar payload gravado com payload importado — leitura de banco, não de
contrato. Deduzi-lo seria inventar um defeito.

### Evidência

**Confirmado por teste** — `tests/radar-contexto-editorial.test.mts` (12
testes), incluindo: linha legada e linha nova com o mesmo ArticleDNA pobre
recebem classes diferentes; tudo que a linha transporta chega à tela; campo
presente no RadarItem nunca é classificado como ausente; ausência que nunca
existiu na origem tem dono `ARQUITETO`; `SERVER_DISCARDED` nunca é emitido.

### O que ainda depende de leitura remota

A classificação real de `marketing online v2` e do artigo v7 depende das linhas
gravadas, e o conector Supabase desta sessão não alcança o projeto. **Não
inventei os valores.** A tela agora responde sozinha (o painel imprime
`data-context-class`), e estas duas consultas preenchem a matriz empírica:

```sql
select
  w.article_id,
  w.payload->>'title'                                       as titulo,
  w.payload->>'articleDnaVersionId'                         as article_dna_version_id,
  (w.payload->'hydration')                     is not null  as tem_hydration,
  (w.payload->'arquitetoKeywordDnaReferences') is not null  as tem_keyword_refs,
  (w.payload->'arquitetoStrategyContext')      is not null  as tem_strategy_context,
  (w.payload->'arquitetoSerpProvenance')       is not null  as tem_serp_provenance,
  (w.payload->'arquitetoInternalLinks')        is not null  as tem_internal_links,
  w.payload->'hydration'->'principalKeyword'->>'keyword'    as principal_hidratada,
  jsonb_array_length(coalesce(w.payload->'hydration'->'keywordSnapshots','[]'::jsonb)) as snapshots,
  w.payload->'hydration'->'silo'->>'siloPageSlug'           as silo_page
from editorial_workflow_items w
where w.stage = 'radar' and w.marca_id = '<BRAND_ID>'
order by w.created_at;
```

```sql
select
  v.entity_id as article_id,
  v.version_number,
  v.payload->>'mainIntent' as intencao,
  v.payload->>'siloId'     as silo_id,
  jsonb_array_length(coalesce(v.payload->'requiredTopics','[]'::jsonb))   as topicos,
  jsonb_array_length(coalesce(v.payload->'questions','[]'::jsonb))        as perguntas,
  jsonb_array_length(coalesce(v.payload->'entities','[]'::jsonb))         as entidades,
  jsonb_array_length(coalesce(v.payload->'keywordReferences','[]'::jsonb)) as referencias
from editorial_artifact_versions v
where v.artifact_type = 'article_dna' and v.marca_id = '<BRAND_ID>'
order by v.entity_id, v.version_number;
```

Regra de leitura: `tem_hydration = false` **ou** `tem_keyword_refs = false`
**ou** `tem_strategy_context = false` ⇒ a linha é `LEGACY_INCOMPLETE`. Com os
três `true` e campos faltando ⇒ `CURRENT_INCOMPLETE`, e o dono é o Arquiteto
daquele artigo. Só se um campo aparecer na consulta 2 e sumir na consulta 1
para a mesma linha é que `HANDOFF_DROPPED` / `SERVER_DISCARDED` entram — e aí a
distinção entre os dois exige comparar a importação com o gravado.

---

## Bloco de flags

```
SERP_START_VISIBLE_WITHOUT_SNAPSHOT = YES
SERP_START_VISIBLE_WITH_SNAPSHOT = NO
SERP_START_CALLS_CANONICAL_HANDLER = YES (runInvestigationAction → collect)

SERP_START_IN_MAIN_BLOCK = YES (Workbench, antes dos cards de área)
SERP_START_DISABLED_WHILE_COLLECTING = YES
SERP_START_STRUCTURAL_BLOCK_SHOWS_REASON = YES
SERP_START_STRUCTURAL_BLOCK_OFFERS_RETRY = NO
SERP_START_TRANSIENT_OFFERS_RETRY = YES
SILENT_CLICK_STATES = 0
PROVIDER_CALLED_ON_OPEN_OR_F5 = NO

ARTICLE_V2_CONTEXT_CLASS = NÃO VERIFICADO (exige a consulta 1; a tela imprime data-context-class)
ARTICLE_V7_CONTEXT_CLASS = NÃO VERIFICADO (idem)

ARTICLE_V7_DATA_PRESENT_IN_HANDOFF = NÃO VERIFICADO (contrato transporta 12 dos 15 campos; leitura remota pendente)
ARTICLE_V7_DATA_PRESENT_IN_RADARITEM = NÃO VERIFICADO (idem)
ARTICLE_V7_DATA_PRESENT_IN_UI = YES (tudo que a linha carrega passou a ser projetado)

DNA_DATA_LOSS_OWNER = RADAR (projeção da UI, 6 campos — corrigido neste lote)
DNA_DATA_LOSS_OWNER_PENDING = INDETERMINADO até a leitura remota; nenhuma queda de transporte encontrada no contrato

FIELDS_UI_NOT_RENDERED_BEFORE = 6
FIELDS_UI_NOT_RENDERED_AFTER = 0
SERVER_DISCARDED_EMITTED_BY_INFERENCE = NO

RADAR_TESTS_TOTAL = 255
RADAR_TESTS_PASS = 255
RADAR_TESTS_FAIL = 0
TYPECHECK_ERRORS_IN_RADAR = 0

MANUAL_NEW_ARTICLE_SMOKE_READY = YES (roteiro abaixo)

REAL_PROVIDER_CALLS = 0
REMOTE_WRITES = 0
MIGRATIONS = 0
COMMITS = 0
COMPETITIVE_MODEL_TOUCHED = NO
COMPETITIVE_REPORT_TOUCHED = NO
R9_APPROVAL_TOUCHED = NO
```

---

## Roteiro do smoke

**Parte A** — abrir a marca e ativar um artigo **sem snapshot**, sem expandir
nada. Esperado: `Investigação não iniciada`, `0 de 6 etapas concluídas`, etapa
1 pendente e 2–6 bloqueadas, e o botão `Iniciar coleta SERP` visível no bloco
principal. Dar F5 e trocar de linha algumas vezes: nenhuma coleta dispara
sozinha. Clicar uma vez e confirmar que o botão desabilita com rótulo de
progresso. Em artigo com snapshot, confirmar que o start não aparece.

**Parte B** — comparar `marketing online v2` com o artigo v7 (`máscara de
skincare` ou `serum facial principia`). Ler o título do painel de contexto de
cada um: `CONTEXTO EDITORIAL LEGADO` (linha antiga) × `CONTEXTO EDITORIAL
INCOMPLETO` (linha nova com campo faltando) × sem painel (completo). Abrir a
tabela e conferir, campo a campo, valor, fonte e classificação. Rodar as duas
consultas SQL acima para preencher a coluna empírica da matriz.
