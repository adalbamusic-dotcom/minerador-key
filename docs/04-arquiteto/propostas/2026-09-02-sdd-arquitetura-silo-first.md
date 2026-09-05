# SDD — Arquitetura Silo-first (Território → Articles → Consolidação → Links → Radar)

- **Módulo proprietário:** Arquiteto
- **Estado:** `SDD_STATUS = APPROVED` (Planner Geral, 2026-09-02) ·
  `FASE_1_AUTHORIZED = YES`
- **Revisão:** `SDD_REVISION = 4` — incorpora as decisões C1–C4, as seções
  obrigatórias [§11 KEYWORD_TERRITORY_MEMBERSHIP_CONSISTENCY](#11-keyword_territory_membership_consistency)
  e [§12 TERRITORY_IDENTITY_LIFECYCLE](#12-territory_identity_lifecycle), as
  emendas normativas [E1, E2 e E3](#41-emendas-normativas-e1-e2-e3) e o
  [Adendo Etapa 0 — Base Territorial](#42-adendo-etapa-0--base-territorial-da-marca),
  este último com os cinco eixos ortogonais corrigidos em §4.2.4.
- **Escopo:** ordem canônica do Arquiteto, entidade de território, membership de
  keyword no nível Silo, cenários em dois níveis, read-model da paisagem
  territorial, gates e reconciliação de legado.
- **Fora de escopo:** Minerador, Marca, Radar, Planejador, Redator, Publicações,
  auth, tenant, KGR, Article KGR, InternalLinkGraph aprovado, GlobalTopbar,
  redesign visual, providers pagos.
- **Autoridade ao ser aprovada:** substitui as premissas Article-first de
  [`2026-09-02-sdd-cenarios-arquiteturais-completos.md`](2026-09-02-sdd-cenarios-arquiteturais-completos.md)
  (`PREVIOUS_ARTICLE_SCENARIO_SDD_STATUS = SUPERSEDE_ON_NEW_SDD_APPROVAL`),
  preservando o documento e a Fase 1 já entregue.

```
SILO_FIRST_CONTRACT_FOUNDATION = IMPLEMENTED (Fase 1)
SILO_FIRST_ARCHITECTURE        = NOT_COMPLETE (Fases 2 a 13 pendentes)
DDL_REQUIRED_PHASE_1   = 0
MIGRATION_REQUIRED_PHASE_1 = 0
REMOTE_MUTATIONS = 0 · PAID_PROVIDER_CALLS = 0
```

---

## 1. Problema

O fluxo implementado hoje decide a página antes de decidir o território.

`buildDeterministicArticleArchitecture` ([engine.ts:441](../../lib/arquiteto/engine.ts))
recebe **todas** as keywords da Brand como universo indiferenciado, reserva
candidatas a Silo fora dos grupos e agrupa o resto em Articles. Só depois
`formSiloWorkingCopies` ([silo-formation.ts:279](../../lib/arquiteto/silo-formation.ts))
recebe `articleVersions: readonly ArticleVersion[]` e tenta responder "em qual
Silo isto entra?".

A consequência está escrita no código:

- `normalizeArticleWorkingCopyKeyword` ([article-phase.ts:31](../../lib/arquiteto/article-phase.ts))
  **zera** `siloId`, `silo_id`, `siloName` e `hierarquia` de toda keyword não
  publicada — "A fase Artigos não atribui Silo a uma keyword nova";
- `articleApprovalIssues` ([operational-flow.ts:104-106](../../lib/editorial/operational-flow.ts))
  registra a dependência circular: "o artigo não fechava sem Silo e o Silo só
  nasce depois do ArticleDNA aprovado";
- `resolveArticleSiloReadiness` ([article-phase.ts:162](../../lib/arquiteto/article-phase.ts))
  devolve `not_started` quando `!hasArticleDna` — Silo é inalcançável antes do
  artigo.

O Silo virou organizador de páginas prontas.

## 2. Decisão

```
STRUCTURAL_DECISION        = SILO_FIRST_ARCHITECTURE
CANONICAL_ARCHITECT_FLOW   = TERRITORY → ARTICLES → SILODNA CONSOLIDATION → INTERNAL LINKS → RADAR
ARTICLE_REQUIRES_CONFIRMED_TERRITORY = YES (fluxo novo)
```

```text
KeywordDNAs aprovadas + Silos existentes/publicados + legado + BrandDNA + imports
        ↓
TerritorialLandscape (read-model)
        ↓
TerritoryCandidate
        ↓
Cenários territoriais — Lógica / SERP / IA / Humano → Atual
        ↓
Confirmed Territory
        ↓
Article Architecture escopada ao território confirmado
        ↓
ArticleDNA
        ↓
Consolidação: SiloDNA + SiloPage + Pilar + Suportes + lacunas + ArticleDNA refs
        ↓
InternalLinkGraph → Radar
```

Proibido regredir para `lista Minerador → Silo → Articles` ou para
`Articles → inferir Silo`.

Isto **não** autoriza criar Silos arbitrários antes de olhar as keywords: a
primeira responsabilidade é compreender e confirmar os territórios que a Marca
**já tem**, e só então perguntar se algum território novo se justifica.

## 3. Estado atual comprovado

Auditoria de código em 2026-09-02. Nenhum arquivo de produto alterado.

### 3.1 Working copy do Arquiteto

```
ARCHITECT_WORKING_COPY_STORAGE = editorial_workflow_items
  (subject_type='keyword', stage='architect', state='received'), 1 linha por keyword
```

`loadCanonicalArquitetoWorkspace` ([lib/server/arquiteto-workspace.ts:194](../../lib/server/arquiteto-workspace.ts))
lê; `PATCH /api/arquiteto/workspace` grava no `payload` com `expectedLock`. O
`AssignmentSchema` da rota é `.strict()`.

**Correção de fato:** `editorial_architect_work_copy` (§5 da SDD anterior) **não
existe**. A única working copy em tabela própria é a do InternalLinkGraph
(`internal_link_graph_working_copies`).

### 3.2 Working copy de Silos

```
SILO_WORKING_COPY_STORAGE = NENHUM — React state
```

`useState<SiloWorkingCopy[]>` ([arquiteto-workspace.tsx:510](../../modules/arquiteto/arquiteto-workspace.tsx)).
Não persiste, não sobrevive ao F5, não está em `architect-recovery.ts`. A
proposta de IA de Silos (`/api/arquiteto/silo-review`) também não persiste.

### 3.3 Identidade do Silo (legado)

```
siloId = minerador_keyword_lists.id
```

`POST /api/arquiteto/silos` ([route.ts:56](../../app/api/arquiteto/silos/route.ts))
insere em `minerador_keyword_lists`, usa o `id` como `siloId`, grava par
SiloDNA(draft)+SiloPage(draft) via `persistSiloPairAtomic` e acrescenta entrada em
`marcas.silos_existentes`.

### 3.4 Contratos

`SiloDNASchema` ([contracts.ts:880](../../lib/arquiteto/contracts.ts)) tem
`formationStatus: "draft" | "formed"` (:882) mas descreve o Silo **por artigos**
(`pillarArticleId`, `supportArticleIds`, `articleReferences`, `articleRoles`,
`narrativeOrder`, `linkMap`). Sem membership de keyword, `macroIntent`,
`architecturalOrigin`, `ingestionOrigin`, `lifecycleStatus` ou `decisionState`.
`SiloPageSchema` (:962) é pareada por `siloDnaRef`.
`ArticleDNASchema` (:801) está íntegro e não muda de forma.

### 3.5 Candidata a Silo hoje é keyword, não território

`SiloCandidateMarkSchema` (:386) marca uma **keyword**.
`candidateAssessmentFor` ([engine.ts:94](../../lib/arquiteto/engine.ts)) tem porta
dura `relatedKeywordCount >= 2` (:109 e :115). Candidatas reservadas saem do
universo de formação (:443).

### 3.6 Cenários

`ArchitectMapScenario = "current"|"logic"|"serp"|"ai"` ([workbench.tsx:29](../../modules/arquiteto/arquiteto-workbench.tsx));
snapshots SERP e IA ainda são cópias do vigente (`arquiteto-workspace.tsx:2182`, `:3005`).
`lib/arquiteto/architecture-scenario.ts` **está implementado** (Fase 1, 20 testes)
e é Article-only: `articles[]`, `ungroupedKeywordIds[]`, `articleRef`, sem `level`.

### 3.7 Gates

`articleRadarGateIssues` ([article-phase.ts:197](../../lib/arquiteto/article-phase.ts))
**já** exige `missingSiloCount === 0` e `missingApprovedInternalLinkGraphCount === 0`.
O gate final ao Radar não muda.

### 3.8 Persistência disponível sem DDL

```
editorial_workflow_items.subject_type = text CHECK (char_length BETWEEN 1 AND 80)  → sem enum
editorial_workflow_items.stage        = CHECK IN ('minerador','architect',...)     → 'architect' aceito
UNIQUE (marca_id, subject_type, subject_id, stage)
lock_version integer NOT NULL DEFAULT 1 CHECK (> 0) + trigger editorial_workflow_items_touch_trg
RLS SELECT: canonical_actor_can_access_brand(marca_id, auth.uid())
GRANT: authenticated = SELECT; service_role = SELECT, INSERT, UPDATE
payload jsonb CHECK (jsonb_typeof(payload) = 'object')
```

`editorial_artifact_versions.artifact_type` é o único ponto com CHECK de lista.

## 4. Decisões C1–C4 do Planner Geral — incorporadas

### C1 — `ARCHITECTURE_SCENARIO_COMPATIBILITY_POLICY = EXTEND_ADDITIVELY`

`lib/arquiteto/architecture-scenario.ts` e seus 20 testes **não são revertidos**.

```
CANONICAL_CONTRACT      = level declarado EXPLICITAMENTE, sempre, em todo payload novo
LEGACY_COMPAT_EDGE      = uma única função de borda assume "article" para payload sem level
DOMAIN_DEFAULT          = PROIBIDO — nenhum default implícito de level no domínio novo
PAYLOAD_SHAPES          = semanticamente distintos; SiloScenario NUNCA usa
                          articles[] + ungroupedKeywordIds[]
```

A borda de compatibilidade é uma função só, nomeada, testada e isolada:

```ts
// lib/arquiteto/architecture-scenario.ts — borda única, não domínio
export function parseArchitectureScenarioWithLegacyLevel(value: unknown): ArchitectureScenario;
// payload sem `level` ⇒ level: "article". Nenhuma outra função do domínio faz isso.
```

Todo construtor, validador, normalizador e diff novo exige `level` presente e
falha alto com `LEVEL_REQUIRED` quando ausente. Ver §7.

### C2 — `LEGACY_MANUAL_SILO_CREATION_POLICY = LEGACY_CREATION_PATH, PRESERVE_AND_FREEZE`

```
LEGACY_CREATION_PATH = POST /api/arquiteto/silos
                       + lib/arquiteto/canonical-workspace.ts → createCanonicalManualSilo
                       + modules/arquiteto/arquiteto-workspace.tsx:1281 (único chamador)
```

**Preservado sem alteração:** dados legados, leitura, adapters, referências,
SiloDNAs/SiloPages já criados, `marcas.silos_existentes`, linhas de
`minerador_keyword_lists`. Nada é apagado, migrado ou reescrito.

**Proibido no fluxo novo:** um `MANUAL_STRATEGIC` **não** passa por esse caminho.
Criar território manual **não** cria lista no Minerador, SiloDNA, SiloPage,
publicação, URL nem canonical.

**Estratégia progressiva de substituição:**

| Etapa | Ação | Route legado |
|---|---|---|
| Fase 5 | novo caminho `MANUAL_STRATEGIC → TerritoryCandidate`; a UI de Silos passa a chamá-lo | intacto e alcançável |
| Fase 11 | consolidação passa a cunhar `siloId` canônico sem lista do Minerador | intacto |
| Fase 13 | verificar zero chamadores de `createCanonicalManualSilo` na UI nova | marcado `DEPRECATED` na documentação |
| Fora destas fases | eventual remoção do route | **decisão separada, não autorizada aqui** |

`NÃO DELETAR ROUTE NESTA FRENTE.` Dois testes dependem do símbolo:
`tests/arquiteto-domain.test.mts:145` exige `createCanonicalManualSilo(` no
código-fonte, e `tests/arquiteto-article-phase.test.mts:161` exige que a Lógica
**não** o chame. Ambos continuam passando.

### C3 — `relatedKeywordCount >= 2` = `LEGACY_SIGNAL`, nunca invariante territorial

```
TERRITORY_MINIMUM_KEYWORD_COUNT = NENHUM
```

Uma única KeywordDNA pode sustentar um `MANUAL_STRATEGIC` e pode sustentar um
`DISCOVERED` quando outros sinais/evidências o justificarem. Quantidade é sinal,
não autoridade — nem como condição suficiente, nem como necessária.

`candidateAssessmentFor` ([engine.ts:94-133](../../lib/arquiteto/engine.ts))
permanece intacto e continua produzindo `SiloCandidateMark` por keyword para os
consumidores atuais. O motor territorial **não o reutiliza como gate** e não
herda a porta. Remoção do código legado só quando não houver consumidor — não
nesta frente.

### C4 — `territoryRef` × `siloId` = separação definitiva

```
territoryRef : identidade da working territorial architecture; do Arquiteto;
               existe antes de SiloDNA; não depende de lista do Minerador
siloId       : referência canônica/legada já usada pelos artefatos existentes
lista_id     : proveniência upstream do Minerador; NUNCA cria identidade territorial

PROIBIDO: territoryRef = lista_id
PROIBIDO: territoryRef = siloId por conveniência
PROIBIDO: criar lista no Minerador só para obter id de Silo
```

A ponte explícita `territoryRef → consolidação → identidade canônica de Silo`
está em [§12.6](#126-ponte-territoryref--identidade-canônica-de-silo).

### 4.1 Emendas normativas E1, E2, E3

#### E1 — Operação de membership parcial bloqueia a confirmação

Moves, split e merge tocam vários itens de keyword e o lote **não** é
transacional. Cada keyword continuar em exatamente um lugar não basta: o
CONJUNTO também precisa estar consistente antes de confirmar.

```
PARTIAL_MEMBERSHIP_OPERATION
  → working state continua legível
  → readback identifica exatamente o que foi aplicado
  → nenhuma keyword é corrigida automaticamente
  → TERRITORY_CONFIRMATION_BLOCKED
  → ARTICLE_FORMATION_BLOCKED para o território afetado
  → até resolução ou retomada humana explícita
```

Representação no contrato de working **já existente**, sem tabela nova: campo
`pendingOperation: MembershipOperation | null` no payload do item de território.

```ts
MembershipOperation {
  operationId, kind: "assign"|"unassign"|"move"|"split"|"merge"|"reject"
  actorUserId, startedAt
  participantTerritoryRefs: string[]     // todos os territórios do lote
  intendedKeywordIds: string[]
  appliedKeywordIds: string[]            // confirmados por readback
  failedKeywordIds: string[]
}
status = "applied" | "in_progress" | "partial"   // derivado, nunca gravado
```

`MembershipOperation` **não é membership**: nunca diz onde uma keyword está —
diz o que um lote pretendeu e o que o readback confirmou. Por isso não recria a
segunda fonte mutável eliminada em §11.1.

#### E2 — Continuidade do split é escolha humana declarada

A origem mantém `territoryRef` **na parte que a operação declarar como
continuidade**. É PROIBIDO inferir a continuidade por primeira posição, ordem do
array, quantidade de keywords, volume, SERP ou IA. Sem `continuingPartId`
declarado, a operação é **recusada** — não há caminho que escolha sozinho.

Proveniência reconstruível pelas duas pontas:

```
sourceTerritoryRef       = território de origem
continuingTerritoryRef   = parte que herdou a identidade (declarada)
createdTerritoryRefs[]   = partes que receberam identidade nova
por parte criada : lineage.splitFromTerritoryRef = sourceTerritoryRef
na origem        : lineage.splitIntoTerritoryRefs += createdTerritoryRefs
```

#### E3 — Sobrevivente do merge é escolha humana declarada

O sobrevivente mantém `territoryRef` e é **declarado na operação**. É PROIBIDO
escolher por posição, tamanho, volume, idade, SERP ou IA. Sem
`survivingTerritoryRef` declarado, a operação é **recusada**.

```
survivingTerritoryRef    = declarado
absorbedTerritoryRefs[]  = os demais participantes
por absorvido : lifecycleStatus = superseded ; lineage.supersededByTerritoryRef = survivor
no survivor   : lineage.absorbedTerritoryRefs += absorbedTerritoryRefs
```

Merge de dois territórios ancorados em Silos existentes **distintos** continua
recusado (`MERGE_OF_TWO_EXISTING_ANCHORS`). Dois territórios sobre o **mesmo**
Silo é o defeito (`DUPLICATE_EXISTING_SILO_ANCHOR`) que o merge existe para
resolver, e é permitido.

## 4.2 Adendo Etapa 0 — Base Territorial da Marca

Aprovado em 2026-09-02 e parte integrante desta SDD.

```
SILO_BASE_TERRITORIAL          = published + manual + imported
SITEMAP_AUTHORITY              = inventory/evidence + human confirmation
MARCA_SITE_INTEGRATION         = READ_ONLY CANONICAL SOURCE
MANUAL_STRATEGIC_BEFORE_KEYWORDS = YES
CSV_BEFORE_KEYWORDS            = YES
SERP_CAN_DISCOVER_TERRITORY    = YES
SERP_CAN_CREATE_KEYWORDDNA     = NO
ARTICLE_FORMATION_SCOPE        = CONFIRMED TERRITORY
SILODNA                        = CONSOLIDATED AFTER ARTICLES
NO_NETWORK_ON_ARCHITECT_LOAD   = YES
```

### 4.2.1 Ordem canônica com a Etapa 0

```text
ETAPA 0  BASE TERRITORIAL DA MARCA
         A. site/sitemap/publicações existentes
         B. Silos estratégicos/manuais
         C. estrutura importada explicitamente por CSV
              ↓  RECONCILIAÇÃO HUMANA DA BASE
ETAPA 1  KeywordDNAs aprovadas do Minerador
              ↓
ETAPA 2  AFINIDADE TERRITORIAL
              ↓  LÓGICA → IA → SERP → HUMANO
         CONFIRMAÇÃO TERRITORIAL
              ↓
         ARTICLES POR TERRITÓRIO CONFIRMADO
              ↓  CONSOLIDAÇÃO SILODNA/SILOPAGE → INTERNAL LINKS → RADAR
```

Proibido regredir para `lista Minerador → Silo → Articles` ou `Articles → inferir Silo`.

### 4.2.2 Fronteira Marca → Arquiteto

A Marca continua **dona** do cadastro do site, URL base, sitemap, configuração,
sincronização e informação institucional. O Arquiteto é **somente consumidor**.

```
MARCA (site/sitemap/publicado) ──READ_ONLY──▶ ARQUITETO (TerritorialBase)
```

Proibido ao Arquiteto: editar URL da Marca, trocar ou registrar sitemap, alterar
a configuração da aba Site, executar sincronização silenciosamente, duplicar
cadastro ou criar uma segunda fonte canônica. Também proibido `fetch` HTTP
interno entre módulos da própria aplicação: a leitura usa camada
server/domain compartilhada.

### 4.2.3 Evidência ≠ território

```
SITEMAP_ENTRY     != SILO
URL_DIRECTORY     != SILO
CATEGORY          != SILO
SITEMAP_STRUCTURE != SILODNA
```

`/pele/barreira-cutanea/` **pode** ser evidência de território; `/autor/fulano/`
normalmente não é. **Nenhum dos dois é decidido pela URL.** O domínio produz uma
*pista* (`structuralHint: editorial_candidate | technical | unknown`) para ordenar
a revisão humana, e a promoção a território exige decisão humana declarada
(`planTerritoryPromotion` recusa sem ela).

### 4.2.4 Estados da Base — cinco eixos ortogonais

Auditoria da revisão 4 encontrou um defeito na revisão 3: o
`reconciliationState` de oito valores ainda misturava decisão
(`confirmed_existing`) com origem (`published_legacy`, `strategic_declared`) e
com lifecycle (`candidate`). Corrigido — os eixos ficam separados:

```
observationState    matched | site_only | database_only | conflicting | unknown
                    → FATO observado entre site e banco. Não é opinião.
decisionState       pending | confirmed_existing | matched_existing_silo
                    | needs_reconciliation | review_later | ignored
                    → DECISÃO humana. `pending` é o estado inicial honesto.
architecturalOrigin existing | manual_strategic | discovered
ingestionOrigin     ui | csv | import | system | sitemap | null
publicationState    published | unpublished | unknown
```

Os vocabulários de observação e decisão **não têm interseção** — há teste que
trava isso. Os quatro recortes da Base (`publishedConfirmed`,
`strategicDeclared`, `importedReconciliation`, `publishedUnresolved`) são
**derivados** desses eixos por `resolveBaseBucket`, com precedência declarada e
total, nunca lidos de um campo único:

1. `observationState = site_only` e não `unpublished` → `publishedUnresolved`;
2. decisão em `needs_reconciliation | review_later | ignored` → `importedReconciliation`;
3. decisão em `confirmed_existing | matched_existing_silo` → `publishedConfirmed`;
4. `architecturalOrigin = manual_strategic` → `strategicDeclared`;
5. resto → `importedReconciliation`.

`StrategicDeclaration` é contrato próprio: `keywordDnaIds: []` é estado legítimo
e **não** implica `lifecycleStatus = confirmed` — continua declaração sujeita à
análise posterior, e não cria lista, SiloDNA, SiloPage, publicação, URL ou
canonical.

### 4.2.5 Autoridade de publicação e divergência site × banco

```
PublicationRecord / estado canônico editorial = AUTORIDADE EDITORIAL INTERNA
Sitemap / site                                = EVIDÊNCIA EXTERNA / INVENTÁRIO
```

Sitemap **não** substitui `PublicationRecord`. A Base reporta
`matched | site_only | database_only | conflicting | unknown` e **nunca corrige
automaticamente**: URL no sitemap sem registro no banco vira
`PUBLISHED_UNRESOLVED`; registro no banco sem URL no sitemap vira `DATABASE_ONLY`
(achado, jamais exclusão); URL/canonical divergentes viram `CANONICAL_CONFLICT`.
Correspondência é feita por refs e URL/canonical normalizados — nunca por
substring frágil.

### 4.2.6 Afinidade territorial e resíduo

Depois da Base, cada KeywordDNA é classificada contra os territórios já
conhecidos: `match_existing`, `expand_existing`, `match_strategic`, `ambiguous`,
`conflicting`, `no_match`.

```
NEW_TERRITORY = EXCEPTION_REQUIRING_JUSTIFICATION
```

Território novo é procurado **apenas no resíduo** (`no_match`, `ambiguous`,
`conflicting`). É proibido rodar clustering global com o objetivo de gerar o
máximo de Silos possível.

### 4.2.7 Narrativa e descoberta

O contrato territorial carrega `narrative { statement, continuity,
brandAlignment, rationale }` porque similaridade lexical não distingue "mesmo
assunto" de "mesma linha editorial da Marca".

A SERP pode descobrir a entidade central de um território mesmo quando ela não
existe literalmente em nenhuma KeywordDNA — declarado em
`discovery.centralEntityInKeywordUniverse: false`. Mas
`SERP_CAN_CREATE_KEYWORDDNA = NO`: o termo novo vira
`DiscoveredKeywordSuggestion` e segue Arquiteto → Minerador → métricas/revisão →
KeywordDNA → retorno. `suggestionUsableAsKeywordId` só devolve um id depois que
o Minerador confirmar.

### 4.2.8 Ordem dos processos territoriais

```
PROCESS_ORDER = LOGIC → AI → SERP → HUMAN
```

Ordem **operacional**, não cadeia de sobrescrita. IA não muta o cenário da
Lógica, SERP não muta o da IA e o Humano não reescreve evidência histórica
(`processMayMutateScenario`).

## 5. Modelo proposto

### 5.1 Dois momentos, uma entidade por momento

```
TERRITÓRIO EM FORMAÇÃO → TerritoryCandidate   (working, mutável, lock_version)
SILO CONSOLIDADO       → SiloDNA + SiloPage   (versionado, imutável, aprovado)
```

### 5.2 TerritoryCandidate — payload do workflow item de território

```ts
TerritoryCandidate {
  schemaVersion: 1
  territoryRef: string                 // opaco, gerado pelo servidor — §12
  brandId: string

  existingSiloRef: {                   // presente só quando ancora Silo canônico
    siloId, siloDnaVersionId, siloDnaContentHash,
    siloPageId?, siloPageVersionId?
  } | null

  name: string | null
  centralEntity: string
  macroIntent: string
  boundary: { includes: string[]; excludes: string[] }

  // eixos ortogonais — nunca um enum só misturando tudo
  territoryKind:         "existing" | "expansion" | "new"
  architecturalOrigin:   "existing" | "manual_strategic" | "discovered"
  ingestionOrigin:       "ui" | "csv" | "import" | "system" | null
  lifecycleStatus:       "candidate" | "confirmed" | "consolidated"
                       | "rejected"  | "superseded" | "archived"
  decisionState:         "pending" | "confirmed" | "rejected"
  publicationProtection: "unpublished" | "protected" | "unknown"

  slugState: {
    proposals: Array<{ slug; source: "logic"|"serp"|"ai"|"human"; rationale }>
    confirmed: string | null           // só por ação humana
    publishedSlug: string | null       // protegido; SERP não substitui
    publishedCanonical: string | null
  }

  lineage: {                           // §12, E2, E3
    splitFromTerritoryRef: string | null    // na parte CRIADA por um split
    splitIntoTerritoryRefs: string[]        // no território que CONTINUOU o split
    supersededByTerritoryRef: string | null // no território ABSORVIDO por um merge
    absorbedTerritoryRefs: string[]         // no SOBREVIVENTE do merge
  }

  pendingOperation: MembershipOperation | null   // E1

  consolidation: {                     // preenchido só na Fase 11
    siloId: string
    siloDnaVersionRef: VersionReference
    siloPageVersionRef: VersionReference
    consolidatedAt: string
  } | null

  evidenceRefs: ScenarioSourceRef[]
  conflicts: TerritoryConflict[]
  reasons: string[]
  provenance: { producedBy; adoptedFromScenarioType; humanAdjustmentCount; note }
}
```

**`keywordRefs` NÃO existe neste payload.** É deliberado: eliminar a segunda
fonte mutável em vez de tentar sincronizá-la. Ver §11.

`lifecycleStatus` ganha `consolidated` em relação à lista conceitual do pedido
porque é um estado materialmente distinto de `confirmed`: território confirmado
libera formação de Article; território consolidado já produziu SiloDNA/SiloPage e
não aceita mais alteração estrutural direta — só sucessor.

### 5.3 Membership de keyword — campos aditivos no item da keyword

No `AssignmentSchema` de `PATCH /api/arquiteto/workspace` (hoje `.strict()`):

```ts
territoryRef: string | null            // exatamente um território, ou null
territoryAssignment: {
  state: "existing_silo_match" | "expand_existing_silo" | "new_silo_candidate"
       | "ambiguous_silo" | "conflicting_silo" | "unassigned"
  reason: string                        // obrigatório também quando unassigned
  source: "logic" | "serp" | "ai" | "human"
  decidedAt: string
} | null
```

`siloId`/`silo_id` continuam significando **Silo canônico consolidado ou
publicado** e não são reaproveitados para candidatura. `lista_id` continua
proveniência do Minerador.

### 5.4 TerritorialLandscape — read-model, somente leitura

```ts
TerritorialLandscape {
  brandId
  existingTerritories: TerritoryProjection[]      // âncoras
  candidateTerritories: TerritoryProjection[]
  confirmedTerritories: TerritoryProjection[]
  legacyNeedsReconciliation: LegacyArticleEntry[]
  unassignedKeywords: Array<{ keywordId; reason; state }>
  conflicts: TerritoryConflict[]
  consistency: MembershipConsistencyReport        // §11.6
  protections: { publishedSiloPageIds; publishedArticleIds; protectedSlugs; protectedCanonicals }
}

TerritoryProjection = TerritoryCandidate & { keywordRefs: string[] }  // derivado
```

Fontes: `SiloDNA`/`SiloPage` vigentes (`latestByEntity`), `ArticleDNA.siloId`,
keywords publicadas (`lista_id`/`silo_id`), `marcas.silos_existentes`, workflow
items de keyword e de território, BrandDNA. Zero chamada a provider.

`candidate` **nunca** é apresentado como `approved SiloDNA`.

## 6. Invariantes

```
INV-T1  KEYWORD_TERRITORY_PARTITION — 1 território ou unassigned explícito e motivado
INV-T2  Nenhuma keyword importada ao Arquiteto desaparece
INV-T3  Território confirmado ≠ SiloDNA aprovado
INV-T4  SiloDNA/SiloPage aprovados e publicados são imutáveis: mudança estrutural cria sucessor
INV-T5  slug/URL/canonical publicados são protegidos; SERP é evidência, nunca decisão de slug
INV-T6  PROIBIDA qualquer regra "N keywords ⇒ novo Silo" (C3)
INV-T7  Lógica, SERP, IA e Humano não se sobrescrevem; adoção é ato humano explícito
INV-T8  Atual = última arquitetura humana confirmada; nunca fallback para Lógica
INV-T9  Article novo só se forma dentro de território confirmado (fluxo novo)
INV-T10 Article não redefine fronteira: devolve conflito para revisão humana
INV-T11 ArticleDNA mantém 1 Principal, ≤5 apoios, ≤6 keywords — inalterado
INV-T12 Nenhum cenário atravessa brandId
INV-T13 Zero chamada a provider em leitura, render, hidratação ou teste
INV-T14 Legado não é convertido, inferido nem apagado
INV-T15 MEMBERSHIP_SINGLE_SOURCE — membership só é gravada no item da keyword (§11)
INV-T16 territoryRef nunca é derivado de lista_id nem de siloId (C4)
INV-T17 Território com membros não é arquivado nem removido (§11.4)
```

## 7. Cenários em dois níveis

### 7.1 Contrato

```ts
type ScenarioLevel = "silo" | "article";      // sempre explícito no payload novo

ScenarioEnvelope {
  schemaVersion: 1
  scenarioId, brandId
  level: ScenarioLevel                        // obrigatório; sem default no domínio
  scenarioType: "base"|"logic"|"serp"|"ai"|"human"|"current"
  capability: "complete"|"partial"
  universe: { keywordIds[], contentHash }
  baseRef: { level, scenarioType, contentHash, universeContentHash } | null
  sourceRefs: ScenarioSourceRef[]
  provenance: ScenarioProvenance
}

type ArchitectureScenario =
  | (ScenarioEnvelope & {
      level: "silo"
      territories: TerritoryScenarioEntry[]        // { territoryRef, centralEntity, macroIntent,
                                                   //   boundary, keywordRefs[], territoryKind,
                                                   //   architecturalOrigin, publicationProtection,
                                                   //   slugProposal, existingSiloRef, conflicts[] }
      unassignedKeywords: UnassignedKeywordEntry[] // { keywordId, reason, state }
    })
  | (ScenarioEnvelope & {
      level: "article"
      confirmedTerritoryRef: string | null         // null só para cenários legados
      articles: ArticleScenario[]
      ungroupedKeywordIds: string[]
    })
```

Discriminated union, não `ArchitectureScenario<T>`: o validador precisa falhar com
códigos específicos por nível, e um genérico esconderia a invariante de partição.

`TerritoryScenarioEntry.keywordRefs` existe porque um **cenário é um snapshot
imutável** — projeção congelada, não estado mutável. Não é uma segunda fonte: ver
§11.2.

### 7.2 Compatibilidade com a Fase 1 entregue

```
DOMAIN_RULE       : level obrigatório; ausência ⇒ LEVEL_REQUIRED
COMPAT_EDGE       : parseArchitectureScenarioWithLegacyLevel() — única função que
                    assume "article" para payload sem level
DIFF_RULE         : níveis diferentes ⇒ { comparable: false, reason: "LEVEL_MISMATCH" },
                    mesma política já usada para UNIVERSE_HASH_MISMATCH
EXISTING_TESTS    : nenhuma expectativa muda; os 20 testes da Fase 1 continuam válidos
PRESERVED SYMBOLS : articleRef, universe, capability, baseRef, sourceRefs, provenance,
                    validateArchitectureScenario, normalizeArchitectureScenario,
                    deriveArchitectureScenarioDiff, SCENARIO_ISSUE_CODES, MATERIAL_MEMBERSHIP
```

### 7.3 Diff territorial

`TERRITORY_CREATED`, `TERRITORY_REMOVED`, `TERRITORY_SPLIT`, `TERRITORY_MERGED`,
`KEYWORD_TERRITORY_MOVED`, `KEYWORD_TERRITORY_ASSIGNED`,
`KEYWORD_TERRITORY_UNASSIGNED`, `BOUNDARY_CHANGED`, `SLUG_PROPOSAL_CHANGED`.

Split e merge por membership material (≥2 keywords em cada lado), nunca por
contagem de territórios — mesma política de `MATERIAL_MEMBERSHIP` já validada.

## 8. Persistência

### 8.1 Prova do working storage (exigência §6 do Planner)

| Requisito | Prova no contrato atual |
|---|---|
| Isolamento por marca | `marca_id uuid NOT NULL REFERENCES marcas(id)`; RLS SELECT `canonical_actor_can_access_brand(marca_id, auth.uid())`; escrita por `service_role` gateada em `resolvePipelineContext` por `canonical_actor_can_access_brand` **e** `canonical_actor_can_use_brand_action(module='arquiteto')`; `ContextBoundRepository` aplica `.eq("marca_id", this.brandId)` em `find`/`update`. `authenticated` tem só SELECT; `anon` não tem nada. |
| Unique key adequada | `UNIQUE (marca_id, subject_type, subject_id, stage)` ⇒ um item por `(brand, 'territory', territoryRef, 'architect')`. Idempotência natural; colisão de `territoryRef` é impossível dentro da Brand. |
| lock_version | `lock_version integer NOT NULL DEFAULT 1 CHECK (>0)` + trigger `editorial_workflow_items_touch_trg` → `pipeline_editorial_touch_lock_version()` faz `NEW.lock_version := OLD.lock_version + 1`. Incremento no banco, não na aplicação. |
| Leitura current | `listArchitectWorkflowItems` já filtra `marca_id + stage='architect'`; basta particionar por `subject_type`. Território "current" = itens com `decisionState='confirmed'`. Sem artifact. |
| Conflito de concorrência | `WorkflowRepository.update` aplica `.eq("lock_version", expectedLock)`; zero linhas ⇒ `PipelineRuntimeError("CONFLICT", …, 409)`. Lost update é impossível. |
| Como `territoryRef` é gerado | §12.1 — servidor, opaco, `territory:<uuid v4>`. |
| Como a confirmação funciona | §12.3. |
| Como a sucessão funciona | §12.4 e §12.5. |
| Consistência da membership | §11. |

```
NEW_TABLES = 0 · NEW_COLUMNS = 0 · NEW_RLS_POLICIES = 0 · NEW_GRANTS = 0 · DDL = 0
```

Não há consulta relacional frequente sobre atributos de território que justifique
colunas: a membership consultável já vive na linha da keyword.

### 8.2 Mapa de storage

```
SILO_CANDIDATE_STORAGE          = editorial_workflow_items
                                  subject_type='territory', stage='architect',
                                  subject_id=territoryRef, payload=TerritoryCandidate
KEYWORD_TERRITORY_MEMBERSHIP    = payload do item da keyword (§5.3)  — fonte única
SCENARIO logic                  = derivado                           — não persiste
SCENARIO human                  = a própria working architecture     — não persiste
SCENARIO current                = read-model dos confirmados         — não persiste
SCENARIO ai                     = proposta separada (Fase 7)         — storage a decidir na Fase 7
SCENARIO serp                   = HIPÓTESE de artifact versionado    — ver §8.3
```

### 8.3 `silo_architecture_scenario` — hipótese, não decisão

```
NEW_ARTIFACT_TYPE = NÃO PROPOSTO NESTA SDD
CHECK_CHANGE      = 0
DDL               = 0
```

O tipo `silo_architecture_scenario` **não é criado** e **não é autorizado** aqui.
Ele só será proposto se, e quando, a fase da SERP territorial provar
necessidade de snapshot persistido que não possa ser reconstruído a partir de
artefatos já gravados. Até lá é hipótese registrada, não plano.

Quando/se essa prova aparecer, a proposta virá em adendo próprio, com: leitura do
CHECK **remoto material** antes de escrever a migration (o repositório não é
autoridade sobre o estado remoto), preservação de todos os `artifact_type`
existentes, SQL controlado, e **parada** — o usuário executa. Sem `db push`, sem
`migration repair`, sem replay linear.

## 9. Legado

```
LEGACY_POLICY = PRESERVE; RECONCILE EXPLICITLY; NO SILENT MIGRATION
```

| Classe | Tratamento |
|---|---|
| A. Silo existente + Articles vinculados | preservado; entra como `existing` |
| B. SiloDNA aprovado/publicado | âncora; imutável |
| C. ArticleDNA aprovado com Silo conhecido | relação preservada; território derivado do `siloId` |
| D. Article publicado | identidade/URL/canonical protegidos |
| E. ArticleDNA sem `siloId` | `LEGACY_NEEDS_RECONCILIATION` (read-model derivado) |
| F. Working groups Article-first existentes | **não convertidos**; continuam legíveis e operáveis |
| G. SERP/IA histórica | preservada como proveniência |
| H. InternalLinkGraph aprovado | intacto |
| I. `SiloCandidateMark` por keyword | preservado como `LEGACY_SIGNAL` (C3) |
| J. Silos manuais com `siloId = lista_id` | preservados; nenhuma lista criada ou apagada (C2) |

Reconciliar **preserva** o ArticleDNA original; mudança estrutural cria sucessor.

## 10. SERP e IA territoriais

**SERP territorial** é de compatibilidade arquitetural, não é Radar. Analisa
entidade, intenção, overlap, separação temática, hubs concorrentes, páginas
equivalentes, nomenclatura, padrões de URL, lacunas e conflito territorial.
Produz **evidência + proposta**, nunca decisão. Zero chamada na abertura da
página; só por ação explícita.

**IA territorial** é segunda leitura: aponta conflito, sugere split/merge,
questiona fronteira, sugere território novo ou expansão, explica consequências.
Não aprova, não altera Atual, não move keyword, não muda publicado, não substitui
SERP.

Prompt territorial **separado** do de Article. O `SYSTEM_PROMPT` de
`app/api/arquiteto/silo-review/route.ts` já é separado e serve de base — hoje
recebe `silos[]` definidos por `articleIds`, e passará a receber territórios
definidos por keywords.

## 11. KEYWORD_TERRITORY_MEMBERSHIP_CONSISTENCY

### 11.1 Fonte canônica

```
SOURCE_OF_TRUTH     = keyword workflow item .payload.territoryRef  (opção B do pedido)
DERIVED_PROJECTION  = TerritoryProjection.keywordRefs, calculado na leitura
SECOND_MUTABLE_SOURCE = NÃO EXISTE — territory.keywordRefs não é persistido
```

Razões concretas, não estéticas:

1. **Divergência estruturalmente impossível.** Uma linha de keyword tem um campo
   `territoryRef`. Uma keyword não consegue fisicamente apontar para dois
   territórios. `DUPLICATE_MEMBERSHIP` deixa de ser uma classe de bug.
2. **O batch PATCH atual não é transacional.** `PATCH /api/arquiteto/workspace`
   percorre `parsed.updates` em laço, uma chamada por item, sem transação. Se a
   membership vivesse do lado do território, uma falha no meio de um merge
   deixaria uma keyword em dois territórios ou em nenhum. Com a fonte no lado da
   keyword, uma falha parcial deixa **cada keyword ainda em exatamente um lugar**:
   só a *intenção* do lote fica parcialmente aplicada, e isso é visível e
   refazível. INV-T1 nunca é violada, nem transitoriamente.
3. **Reaproveita o contrato que já existe.** Lock, RLS, guard de publicado e
   readback já operam por keyword nesse mesmo payload.

### 11.2 Por que o cenário carrega `keywordRefs` sem virar segunda fonte

Um `ArchitectureScenario` é **snapshot imutável** com `contentHash` — uma
fotografia da projeção num instante, não estado editável. Nunca é lido para
decidir onde uma keyword está agora; é lido para comparar. A leitura de "onde a
keyword está" tem um caminho só: o item da keyword.

### 11.3 Operações

Regra de ordenação transversal: **criar/expandir antes de mover; mover antes de
arquivar.** Nenhum estado intermediário viola INV-T1.

| Operação | Sequência | Estado intermediário |
|---|---|---|
| **ASSIGN** | 1 update na keyword: `territoryRef = T`, `state` conforme o caso | válido |
| **MOVE** k: T1→T2 | 1 update na keyword | válido — nunca existe "entre dois" |
| **UNASSIGN** | 1 update: `territoryRef = null`, `state='unassigned'`, `reason` obrigatório | válido |
| **SPLIT** (E2) | exige `continuingPartId` declarado; (a) cria os itens das partes não-continuantes (`splitFromTerritoryRef = origem`); (b) move os subconjuntos | entre (a) e (b), a parte nova existe vazia — legal, sinalizado `EMPTY_TERRITORY` (diagnóstico) |
| **MERGE** (E3) | exige `survivingTerritoryRef` declarado; (a) move as keywords dos absorvidos para o sobrevivente; (b) marca cada absorvido `superseded` + `supersededByTerritoryRef` | entre (a) e (b), o absorvido fica parcialmente vazio — legal |
| **REJECT** T | (a) move os membros para `unassigned` com motivo; (b) `lifecycleStatus='rejected'`, `decisionState='rejected'` | válido |

Guard `INV-T17`: `superseded`/`rejected`/`archived` são recusados enquanto a
projeção acusar membros — a ordem (a)→(b) é obrigatória e verificada no servidor.

`MERGE` de dois territórios ambos `architecturalOrigin='existing'` é **recusado**:
juntar dois Silos publicados é mudança estrutural de identidade e exige sucessor
no nível SiloDNA, com decisão humana própria (§12.5).

### 11.4 Concorrência e lost update

```
LOCK_UNIT = editorial_workflow_items.lock_version, por linha
```

- Cada update carrega `expectedLock`; `WorkflowRepository.update` faz
  `.eq("lock_version", expectedLock)`. Zero linhas ⇒ `409 CONFLICT`. O trigger
  incrementa no banco. **Lost update é impossível.**
- Dois atores movendo a **mesma** keyword: o segundo recebe 409 e reabre a
  leitura. Nada é sobrescrito.
- Dois atores movendo keywords **diferentes** para o mesmo território: ambos
  passam. Correto — a membership derivada é a união, e não há linha compartilhada
  para corromper.
- Edição de fronteira/nome/slug/decisionState do território: usa o `lock_version`
  do **item do território**, independente das keywords.
- Lote parcialmente aplicado: a resposta informa quais itens gravaram e quais
  falharam, com o `lock_version` novo de cada um. Sucesso só é anunciado após
  readback — regra já vigente no módulo.

### 11.5 Nenhuma keyword desaparece, nenhuma duplica

- **Não desaparece:** o universo é o conjunto de itens de keyword com
  `stage='architect'`, `state='received'`. `territoryRef = null` é um estado
  legível, não ausência. A partição do cenário `complete` reporta
  `KEYWORD_MISSING_FROM_COMPLETE_SCENARIO` se alguém sumir.
- **Não duplica:** um campo escalar por linha. Não há caminho de escrita capaz de
  produzir duas associações.
- **Não fica órfã:** se `territoryRef` apontar para território inexistente,
  rejeitado ou consolidado, o read-model reporta `ORPHAN_TERRITORY_REF` e a
  keyword aparece como pendente de reconciliação **humana**. Nunca é
  reatribuída nem zerada automaticamente.

### 11.6 CONSISTENCY_CHECK

Calculado na leitura do `TerritorialLandscape`, resultado estruturado, nunca
boolean:

```
MEMBERSHIP_ISSUE_CODES =
  ORPHAN_TERRITORY_REF              keyword aponta para território que não existe/não vale
  EMPTY_TERRITORY                   território sem membros — DIAGNÓSTICO, ver abaixo
  UNASSIGNED_WITHOUT_REASON         territoryRef null sem motivo declarado
  TERRITORY_WITHOUT_DECISION        lifecycle avançado sem decisionState coerente
  DUPLICATE_EXISTING_SILO_ANCHOR    dois territórios ancorando o mesmo siloId
  DUPLICATE_KEYWORD_MEMBERSHIP      a mesma keyword aparece em mais de um lugar na leitura
  CROSS_BRAND_MEMBERSHIP            keyword ou território de outra Brand
  PUBLISHED_PROTECTION_VIOLATION    tentativa de alterar identidade publicada
  PARTIAL_MEMBERSHIP_OPERATION      lote a meio caminho (E1)
  TERRITORIAL_CONFLICT_OPEN         conflito territorial aberto (§9 do Planner)
```

Nenhum código dispara correção automática. Todos produzem estado explícito para
decisão humana.

**Semântica de `EMPTY_TERRITORY` — decidida, não generalizada.**

| Situação | Efeito |
|---|---|
| `candidate`, qualquer origem (inclusive `manual_strategic`) | **diagnóstico**, não bloqueia. Um estrategista pode declarar o território antes de reservar keywords; um split esvazia um lado por um instante. |
| Porta `candidate → confirmed`, **qualquer origem** | **BLOQUEIA**. Confirmar é o que libera a formação de Article; um território confirmado sem keyword seria um gate que nunca produz artigo. |
| `consolidated`, `rejected`, `superseded`, `archived` | não avaliado — o território não recebe mais membership. |

Por isso `EMPTY_TERRITORY` **não** entra no conjunto que torna a paisagem
inconsistente, e **entra** em `TERRITORY_CONFIRMATION_BLOCKERS`.

### 11.7 Legado nesta representação

Keyword legada sem `territoryRef`:

- **publicada** com `siloId`/`lista_id` ⇒ projetada em território `existing`
  ancorado nesse `siloId`, com `territoryAssignment.source = "system"` e
  `state='existing_silo_match'`. **Projeção de leitura, não gravação.** A linha só
  passa a ter `territoryRef` quando um humano confirmar.
- **não publicada** ⇒ `unassigned` com
  `reason: "Legado anterior à arquitetura territorial; pendente de reconciliação."`

Nenhuma heurística grava membership. `NO_SILENT_MIGRATION` vale aqui literalmente.

## 12. TERRITORY_IDENTITY_LIFECYCLE

### 12.1 Nascimento

```
territoryRef = "territory:" + crypto.randomUUID()   // servidor, opaco
```

Gerado no servidor, no momento da criação do item. **Não** codifica nome, slug,
entidade, `siloId`, `lista_id` nem índice visual. Renomear o território, mudar
fronteira, trocar slug proposto ou mover keywords **não** muda a ref.

Unicidade garantida por `UNIQUE (marca_id, subject_type, subject_id, stage)`.

Origem da criação:

| Origem | Quem cria | `architecturalOrigin` |
|---|---|---|
| Silo canônico existente adotado como âncora | humano, ao confirmar a âncora | `existing` |
| Criação manual estratégica | humano | `manual_strategic` |
| Proposta da Lógica/SERP/IA adotada | humano, no ato de adoção | `discovered` |

Cenários de Lógica/SERP/IA propõem territórios com refs **provisórias de
projeção**, que só viram `territoryRef` persistido quando o humano adota. Cenário
não cria identidade.

### 12.2 Estabilidade

`territoryRef` é estável do nascimento até `superseded`, `rejected` ou
`archived`. Nunca é reciclado: uma ref aposentada não volta a designar outro
território.

### 12.3 Confirmação

`decisionState: "pending" → "confirmed"` e `lifecycleStatus: "candidate" →
"confirmed"`, com `actorUserId` e `decidedAt`. **Mesma ref.** É a confirmação que
libera a formação de Article naquele território (gate `TERRITORY_CONFIRMED`).

Confirmar **não** cria SiloDNA, SiloPage, lista, publicação, URL ou canonical.

### 12.4 Split e merge

```
SPLIT (E2) : a CONTINUIDADE é declarada pela operação humana (continuingPartId).
             A parte declarada MANTÉM a ref da origem; as demais recebem ref NOVA.
             Sem declaração → RECUSA (SPLIT_CONTINUATION_NOT_DECLARED).
MERGE (E3) : o SOBREVIVENTE é declarado pela operação humana (survivingTerritoryRef).
             Ele MANTÉM sua ref; nenhuma ref nova é criada.
             Sem declaração → RECUSA (MERGE_SURVIVOR_NOT_DECLARED).
```

**Proibido inferir continuidade ou sobrevivência** por posição no array, ordem,
quantidade de keywords, volume, idade, SERP ou IA. Quando a declaração falta, a
operação é recusada com motivo — nunca resolvida por heurística. Isso vale
inclusive quando um só dos participantes tem `existingSiloRef`: a âncora é um
argumento forte para o humano, não um seletor automático.

Merge de dois territórios com âncoras `existingSiloRef` **distintas** é recusado
(§11.3). Duas âncoras **iguais** são o defeito que o merge resolve.

Alternativa rejeitada: "split cria refs novas para todas as partes". Perderia a
continuidade da âncora e invalidaria referências já confirmadas sem necessidade.

### 12.5 Rejeição e sucessão de publicado

**Rejeitado:** `lifecycleStatus='rejected'`, `decisionState='rejected'`. Ref e
histórico **preservados**; o item nunca é apagado. Os membros vão para
`unassigned` com motivo (§11.3).

**Sucessor de Silo publicado:** um território ancorado em Silo publicado nunca é
editado destrutivamente. Alteração estrutural aprovada produz, na consolidação,
`SiloDNA v(n+1)` e `SiloPage v(n+1)` com o **mesmo** `siloId`/`siloPageId`,
preservando `slug`, `publishedUrl` e `canonical` — sucessor versionado, nunca
in-place. Se a mudança pretendida implicaria alterar slug/URL/canonical
publicados, ela é recusada: o caminho legítimo é um território novo, não a
mutação do publicado.

### 12.6 Ponte `territoryRef` → identidade canônica de Silo

```
TERRITORY_REF_IS_REUSED_AS_SILO_ID = NÃO — é REFERENCIADO, não reaproveitado
```

Razão: `siloId` já é chave de `SiloDNA.siloId`, `SiloPage.siloId`,
`editorial_artifact_versions.entity_id` (`silo-page:<siloId>`) e das referências
do `InternalLinkGraph`. Reaproveitar `territoryRef` como `siloId` misturaria dois
espaços de identidade com ciclos de vida diferentes — exatamente o que C4 proíbe.

Na consolidação (Fase 11):

| Caso | `siloId` resultante |
|---|---|
| Território com `existingSiloRef` | **o `siloId` existente**; nova versão sucessora de SiloDNA/SiloPage; identidade e URL preservadas |
| Território novo | `siloId` canônico novo, `crypto.randomUUID()`, cunhado pela consolidação. **Sem criar lista no Minerador** (C2/C4) |

`editorial_artifact_versions.entity_id` é `text` sem FK, então um `siloId` que não
é `minerador_keyword_lists.id` é aceito pelo contrato atual sem DDL.
`canonicalSiloOptions` ([silo-workspace.ts:22](../../lib/arquiteto/silo-workspace.ts))
já monta o seletor **somente** a partir de SiloDNA e SiloPage versionados — um
Silo novo sem lista aparece corretamente. A verificação de colisão de slug
continua consultando `marcas.silos_existentes` **e** as SiloPages, como o caminho
legado já faz.

Ao consolidar, o item de território grava `consolidation { siloId, siloDnaVersionRef,
siloPageVersionRef, consolidatedAt }` e passa a `lifecycleStatus='consolidated'`.
A ref permanece legível como proveniência da arquitetura que originou o Silo.

### 12.7 SiloDNA intermediário

```
INTERMEDIATE_SILODNA = NÃO INTRODUZIDO
```

Não há necessidade provada contra os consumidores atuais: `silo-consolidation`,
`persistSiloPairAtomic`, `canonicalSiloOptions`, `siloDnaPreflight`,
`internal-link-graph-persistence` e o handoff ao Radar consomem **SiloDNA
consolidado com par SiloPage**. Um SiloDNA intermediário enfraqueceria o
significado do artefato para economizar um contrato — recusado pelo pedido e por
esta SDD.

## 13. Gates

```
TERRITORY_CONFIRMED  → habilita Article formation naquele território
                       ≠ SILODNA_FINAL_APPROVED
ARTICLE_APPROVED     → inalterado (articleApprovalIssues continua sem exigir Silo)
SILO_CONSOLIDATED    → SiloDNA formed + SiloPage + aprovação humana
GRAPH_APPROVED       → inalterado
RADAR_HANDOFF        → inalterado: articleRadarGateIssues já exige Silo + graph aprovado
```

Território confirmado **não** pula a aprovação do Article.

## 14. Consumidores e mudanças por área

| AREA | CURRENT_CONTRACT | REQUIRED_CHANGE | STRUCT | DDL | BACK_COMPAT | CONSUMERS | ROLLBACK | FASE |
|---|---|---|---|---|---|---|---|---|
| SILO_CANDIDATE_STORAGE | inexistente (React state) | workflow item `subject_type='territory'` | YES | NO | YES | workspace API, read-model, UI Silos | parar de ler o subject_type; linhas ficam inertes | 1–3 |
| KEYWORD_TERRITORY_MEMBERSHIP | `siloId` zerado por `normalizeArticleWorkingCopyKeyword` | `territoryRef` + `territoryAssignment` aditivos | YES | NO | YES | `AssignmentSchema`, `canonical-workspace`, `architect-recovery.ASSIGNMENT_FIELDS` | ignorar campos | 1–3 |
| SCENARIO_INFRA | Article-only, sem `level` | `level` explícito + união discriminada + borda legada | YES | NO | YES | mapa, trilho, comparativo, 20 testes da Fase 1 | remover o ramo `silo` | 1 |
| READ_MODEL | `loadCanonicalArquitetoWorkspace` | + `TerritorialLandscape` somente leitura | NO | NO | YES | UI Silos, gates, comparativo | remover o read-model | 2 |
| API | `/workspace` PATCH, `/silos` POST, `/silo-review` POST | `AssignmentSchema` aditivo; PATCH aceita territory; `/silo-review` recebe territórios | YES | NO | YES | UI, testes | schema aditivo é ignorável | 3, 5, 7 |
| LEGACY_CREATION_PATH | `/api/arquiteto/silos` cria lista+SiloDNA+SiloPage | **congelado**, marcado `DEPRECATED` na Fase 13 | NO | NO | YES | `createCanonicalManualSilo`, 2 testes | n/a — nada muda | 5→13 |
| SILODNA / SILOPAGE | contratos atuais | **nenhuma mudança de forma**; consolidação passa a receber território | NO | NO | YES | `silo-consolidation`, adapters, graph | n/a | 11 |
| ARTICLEDNA | `siloId: string \| null` | nenhuma mudança de forma | NO | NO | YES | Radar, Planejador, graph | n/a | 9–11 |
| WORKING_COPY | keyword-centric; Silos em React state | working copy territorial persistida | YES | NO | YES | workspace route, workbench, recovery | remover a fase | 3 |
| SERP | assessment por Article | assessment territorial separado; Article intacto | YES | NO | YES | `serp-assessment-registry`, verdict | não executar SERP territorial | 6 |
| AI | `silo-review` por artigos | prompt territorial por keywords; Article intacto | YES | a decidir na F7 | YES | `strategic-context`, `ai-strategic-payload` | não executar IA territorial | 7 |
| LEGACY_RECONCILIATION | inexistente | `LEGACY_NEEDS_RECONCILIATION` derivado | NO | NO | YES | read-model, UI | remover o estado | 2 |
| INTERNAL_LINK_GRAPH | por Silo, exige SiloDNA+SiloPage versionados | **nenhuma** | NO | NO | YES | `internal-link-graph*` | n/a | 12 |
| RADAR_HANDOFF | ArticleDNA aprovado + Silo + graph | **nenhuma** | NO | NO | YES | `operational-flow`, Radar | n/a | 13 |

Não mudam: Minerador, Marca, Radar, Planejador, Redator, Publicações, auth,
tenant, GlobalTopbar, KGR, Article KGR, InternalLinkGraph aprovado.

## 15. Tenant, segurança, versionamento e rollback

**Tenant/segurança:** inalterados e congelados —
`brandId = public.marcas.id`, `actorUserId = auth.uid()`,
`brandRef = slug--brandId`, memberships, admin global sem virar owner. Todo item
de território carrega `marca_id`, é filtrado por RLS e por
`.eq("marca_id", brandId)` no repositório. Nenhum segredo chega ao navegador.
Nenhuma chamada paga em leitura, render, hidratação ou teste.

**Versionamento:**

```
NEW_VERSION  = somente artefatos: SiloDNA, SiloPage, ArticleDNA, InternalLinkGraph
               (e cenários persistidos, se algum dia forem autorizados)
WORKING_ONLY = territoryRef, fronteira em revisão, slug proposto, split/merge de
               candidato, unassigned, decisionState, seleção, ordenação, estado visual
STALE        = cenário cujo baseRef.contentHash difere da base atual é histórico,
               nunca vigente, e nunca degrada para "não executado"
UNCHANGED    = reexecução idêntica não cria versão
```

**Rollback:** por fase, sem apagar nada — parar de ler
`subject_type='territory'` devolve o comportamento atual e deixa as linhas
inertes e legíveis; `territoryRef`/`territoryAssignment` são opcionais e
ignoráveis; o read-model é derivado. Nenhuma fase desta SDD tem DDL, então não há
rollback de schema a planejar. Nunca: apagar KeywordDNA, ArticleDNA, SiloDNA,
SiloPage, artifacts, histórico, URL, canonical ou localStorage; nem quebrar
tenant ou InternalLinkGraph.

## 16. Plano de testes

```
A. Silo existente + keywords compatíveis → expande o existente, sem duplicar
B. Keyword sem território adequado → unassigned explícito, com motivo
C. UMA única keyword sustenta MANUAL_STRATEGIC (C3: sem mínimo de contagem)
D. Muitas keywords similares → não forçam território novo
E. SPLIT → nenhuma keyword perdida; origem mantém ref; partes com ref nova + lineage
F. MERGE → nenhuma keyword duplicada; sobrevivente mantém ref; absorvido superseded
G. MERGE de dois territórios existing → RECUSADO
H. Arquivar território com membros → RECUSADO (INV-T17)
I. Silo publicado → slug/canonical preservados; alteração destrutiva recusada
J. Article novo → recusado fora de território confirmado
K. Article detecta conflito territorial → sinal de revisão, sem mover nada
L. Article legado sem Silo → legível e marcado LEGACY_NEEDS_RECONCILIATION
M. Legado NUNCA grava membership por heurística (só projeção de leitura)
N. ORPHAN_TERRITORY_REF → reportado, nunca corrigido automaticamente
O. Cross-brand → recusado em leitura, escrita, cenário e diff
P. Cenário Lógica/SERP/IA → não altera Atual nem outro cenário
Q. Adoção de candidato → só por ação humana; original intacto
R. Cenário sem `level` no domínio → LEVEL_REQUIRED; só a borda legada assume "article"
S. Diff entre níveis diferentes → comparable:false, LEVEL_MISMATCH
T. PATCH com lock desatualizado → 409, sem escrita parcial na linha
U. Lote parcialmente aplicado → cada keyword continua em exatamente um lugar
V. territoryRef nunca igual a lista_id nem a siloId (C4)
W. Consolidação de território novo → siloId novo SEM criar minerador_keyword_lists
X. Consolidação de território ancorado → sucessor do mesmo siloId, URL preservada
Y. InternalLinkGraph aprovado → intacto até sucessor explícito
Z. Zero chamada a provider em leitura, hidratação e testes
AA. Regressão: os 413 testes de `test:arquiteto` mantêm 412 pass / 1 falha
    pré-existente do Minerador; os 20 testes da Fase 1 seguem inalterados
```

## 17. Fases

Cada fase declara arquivos permitidos e proibidos, implementa, roda testes
direcionados, TypeScript, lint, `git diff --check`, valida consumidores e
atualiza documentação. Mudança estrutural adicional para para revisão.

```
FASE 0  auditoria + SDD + política de legado                         ← concluída
FASE 1  contratos de território e cenário (domínio puro; sem storage, UI ou DDL)  ← concluída
        lib/arquiteto/territory.ts + extensão de lib/arquiteto/architecture-scenario.ts
FASE 2  read-model TerritorialLandscape + CONSISTENCY_CHECK, somente leitura
FASE 3  working copy territorial persistida (workflow items + AssignmentSchema aditivo)
FASE 4  Lógica territorial (determinística, derivável)
FASE 5  Humano territorial: criar, rejeitar, mover, unassigned, fronteira, split, merge
        + novo caminho MANUAL_STRATEGIC (legacy route congelado)
FASE 6  SERP territorial — só aqui se avalia se algum snapshot precisa de artifact
FASE 7  IA territorial (proposta separada)
FASE 8  comparação, adoção e confirmação de território
FASE 9  Article architecture escopada ao território confirmado
FASE 10 cenários de Article no escopo territorial
FASE 11 consolidação SiloDNA/SiloPage/Pilar/Suportes + cunhagem de siloId canônico
FASE 12 integração com o InternalLinkGraph existente
FASE 13 handoff Radar + regressões + LEGACY_CREATION_PATH marcado DEPRECATED
```

UI evolui junto das fases que precisam dela, nunca antes dos contratos. Ordem
alvo da área: **Silos → Artigos → Links internos** (hoje o código usa
`["articles","silos","links"]` em `arquiteto-workspace.tsx:5308`). GlobalTopbar
congelada.

## 18. Riscos

```
R1  Extensão do ArchitectureScenario quebrar a Fase 1 entregue.
    Mitigação: level obrigatório só no domínio novo; borda legada isolada e testada;
    nenhuma expectativa dos 20 testes muda.
R2  territoryRef confundido com siloId por consumidor legado.
    Mitigação: nomes distintos, zero fallback entre eles, teste V.
R3  Keyword apontando para território inexistente.
    Mitigação: ORPHAN_TERRITORY_REF no read-model + reconciliação humana; nunca correção silenciosa.
R4  Lote não transacional aplicar parcialmente um merge.
    Mitigação: fonte única no lado da keyword torna todo estado intermediário válido;
    resposta declara o que gravou; readback obrigatório.
R5  Coexistência de Silos legados (siloId = lista_id) com Silos novos (uuid).
    Mitigação: canonicalSiloOptions já lê só de SiloDNA/SiloPage; colisão de slug
    checada contra catálogo e SiloPages.
R6  Ledger de migrations não reconstruído no remoto.
    Mitigação: DDL = 0 nesta SDD; sem db push, sem migration repair.
R7  Custo de UI. Mitigação: fases 2–5 entregam read-model e working copy antes de
    qualquer redesenho.
```

## 19. Alternativas rejeitadas

**A1 — TerritoryCandidate como `SiloDNA formationStatus:"draft"`.** `SiloDNA`
descreve o Silo por artigos e não tem membership de keyword, origem
arquitetural, lifecycle nem decisionState; o caminho que cria draft hoje também
cria SiloPage e linha no Minerador. Enfraqueceria o artefato para economizar uma
representação.

**A2 — Tabela nova `architect_territories`.** `editorial_workflow_items` já
entrega tenant, RLS, `lock_version` com trigger, unicidade e payload jsonb (§8.1).
`NEW_TABLE = REQUIRE PROOF` — a prova não apareceu.

**A3 — Genérico `ArchitectureScenario<TPayload>`.** União discriminada por `level`
dá códigos de falha específicos por nível; o genérico esconderia a invariante de
partição.

**A4 — `SiloScenario` reusando `articles[] + ungroupedKeywordIds[]`.** Proibido
pelo Planner e semanticamente errado: território não é artigo.

**A5 — Membership como fonte no lado do território.** Rejeitada em §11.1: o lote
não é transacional e a divergência passaria a ser possível.

**A6 — Sincronizar as duas fontes (território e keyword).** Rejeitada: qualquer
sincronização admite janela de divergência. Eliminar a segunda fonte é
estritamente mais forte.

**A7 — Migrar automaticamente working groups Article-first para territórios.**
`NO_SILENT_MIGRATION`. Heurística de atribuição é exatamente o erro corrigido.

**A8 — Um único enum de estado do território.** Misturaria lifecycle, origem,
decisão, operação e aprovação. §5.2 mantém eixos ortogonais.

**A9 — Artifact próprio para CURRENT (silo ou article).** `current` é read-model
dos confirmados. `NEW_CURRENT_ARTIFACT = NÃO AUTORIZADO`.

**A10 — Criar `silo_architecture_scenario` agora.** Rejeitada: hipótese sem prova.
§8.3.

**A11 — `territoryRef` virar o `siloId` consolidado.** Rejeitada em §12.6:
misturaria espaços de identidade com ciclos de vida diferentes (C4).

**A12 — SiloDNA intermediário entre território confirmado e consolidação.**
Rejeitada em §12.7: nenhum consumidor atual pede.

## 20. Decisões fechadas

| # | Pergunta | Decisão |
|---|---|---|
| A | Onde vive TerritoryCandidate? | `editorial_workflow_items`, `subject_type='territory'`, `stage='architect'`. Sem DDL. Prova em §8.1. |
| B | SiloDNA pode representar território em formação? | Não. §19/A1 e §12.7. |
| C | Quando nasce nova versão de SiloDNA? | Só na consolidação (Fase 11), após Articles confirmados no território. |
| D | Quando SiloDNA fica consolidado? | `formationStatus='formed'` + par SiloPage + aprovação humana. Contrato atual. |
| E | Como Silo existente entra? | `TerritorialLandscape` como âncora `architecturalOrigin='existing'`; `existingSiloRef` no território. |
| F | Como keyword é reservada? | `territoryRef` + `territoryAssignment` no payload da própria keyword. §11.1. |
| G | Como volta a "sem Silo"? | `territoryRef: null` + `state='unassigned'` + motivo obrigatório. |
| H | Split/merge de candidatos? | §11.3, com ordem obrigatória e guard INV-T17. |
| I | Como publicado impede alteração destrutiva? | `publicationProtection` + guard no PATCH + imutabilidade das versões + §12.5. |
| J | Article restrito a território confirmado? | Gate `TERRITORY_CONFIRMED` na entrada. `articleApprovalIssues` inalterado. |
| K | Article devolve conflito? | Sinal `TERRITORIAL_CONFLICT` derivado; nada move sozinho. |
| L | Como legado é carregado? | §9 e §11.7; projeção de leitura, nunca gravação. |
| M | Infra compartilhada de cenários? | Envelope comum + união discriminada por `level` explícito. §7. |
| N | Handoff ao Radar? | Inalterado. |
| O | Como Atual é derivado? | Read-model dos confirmados. Sem artifact. Nunca fallback para Lógica. |
| P | Unidade de lock? | `lock_version` por linha de workflow item. §11.4. |
| Q | O que gera nova versão? | Só artefatos. Working state não versiona. |
| R | O que é só working/UI? | territoryRef, fronteira em revisão, slug proposto, split/merge, unassigned, seleção. |

## 21. Autorização

Esta SDD altera contrato compartilhado persistido (payload da working copy,
`AssignmentSchema`, contrato de cenário) e a ordem canônica do módulo. Conforme
`AGENTS.md` §4, exige aprovação antes do código.

As quatro contradições da Fase 0 estão resolvidas por decisão do Planner Geral e
incorporadas em §4; as emendas normativas E1, E2 e E3 estão em §4.1.

```
SDD_APPROVED = YES (Planner Geral, 2026-09-02)
FASE_1_AUTHORIZED = YES
FASE_1_STATUS = IMPLEMENTED — domínio puro
SILO_FIRST_CONTRACT_FOUNDATION = IMPLEMENTED
SILO_FIRST_ARCHITECTURE = NOT_COMPLETE — Fases 2 a 13 pendentes
DDL = 0 · MIGRATION = 0 · REMOTE_MUTATION = 0 · PAID_PROVIDER_CALL = 0
```

Cada fase seguinte exige autorização própria do Planner Geral antes do código.

---

## Adendo 2C.1 — Consolidação territorial atômica

`STATUS = PROPOSTO · AGUARDA EXECUÇÃO REMOTA PELO USUÁRIO`

### Problema

`persist_silo_pair_atomic` grava SiloDNA e SiloPage numa transação, mas não toca
`editorial_workflow_items`, onde vive o Território. O runtime fala por PostgREST,
que abre **uma transação por request**. Consolidar em duas chamadas produz dois
estados finais ruins, e nenhum se auto-cura:

| ordem | falha da segunda chamada | consequência |
|---|---|---|
| par → território | par existe, território segue `confirmed` | retry **impossível**: o slot de versão está ocupado e a RPC recusa com *"initial SiloDNA pair must use version 1 without predecessor"* |
| território → par | território `consolidated` | `consolidation` aponta para versões **que não existem** — dado canônico mentindo |

### Proposta

Nova RPC orquestradora `persist_silo_pair_and_consolidate_territory_atomic`, que
**chama** a função existente de dentro do próprio corpo. A função histórica
`20260826225154_silo_pair_atomicity.sql` não é editada nem substituída.

```
p_marca_id, p_actor_user_id, p_action,
p_territory_workflow_item_id, p_territory_expected_lock,
p_silo_dna, p_silo_page, p_silo_dna_status, p_silo_page_status
```

Território entra por **id + lock esperado**, não por payload completo: a
consolidação não é endpoint de edição e não recebe uma cópia do território para
sobrescrever.

### Prova de atomicidade

`persist_silo_pair_atomic` é plpgsql `SECURITY INVOKER`. Uma chamada de função
plpgsql **não abre subtransação** — subtransação só nasce de um bloco
`BEGIN ... EXCEPTION`. A nova função **não possui nenhum handler de exceção**,
deliberadamente. Logo, qualquer `RAISE` posterior à chamada aninhada aborta a
transação inteira e desfaz **também** os dois `INSERT` do par.

Acrescentar um `EXCEPTION WHEN ...` nessa função quebraria a garantia. O comentário
no topo do arquivo registra isso para quem for editá-lo depois.

### Ordem das operações

1. guardas de forma e ação;
2. autorização **própria** (`canonical_assert_rpc_actor` + acesso à Brand + ação
   `arquiteto`) — não delegada à função aninhada, que sequer enxerga o território;
3. `SELECT ... FOR UPDATE` do item de território, validando `marca_id`,
   `subject_type='territory'`, `stage='architect'`, `subject_id == payload
   territoryRef`, `brandId` do payload e `row.state == payload lifecycleStatus`;
4. `territoryRef` obrigatório e idêntico nos payloads de SiloDNA **e** SiloPage;
5. ramo de **replay idempotente** (abaixo) ou caminho canônico;
6. `confirmed` + `decisionState confirmed` + `lock_version == expectedLock`;
7. chamada a `persist_silo_pair_atomic`;
8. `consolidation` derivada do **readback real**;
9. `UPDATE` mínimo do território.

### Replay idempotente

Território já `consolidated` **não** chama a função aninhada e **não escreve
nada**. Compara a `consolidation` guardada com a identidade do par pedido
(`siloId`, e `entityId`/`versionId`/`contentHash` das duas refs) e confirma no
banco que as duas linhas existem para a mesma Brand, com `artifact_type` e
`entity_id` corretos.

- idêntico → `idempotentReplay = true`, zero INSERT, zero UPDATE, devolve os três;
- diferente → `STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR`.

### Escopo da mutação

Só `payload.territory.lifecycleStatus`, `payload.territory.consolidation` e
`row.state`. A garantia é **verificada**, não apenas consequência da montagem:

```sql
IF (next_territory - 'lifecycleStatus' - 'consolidation')
   IS DISTINCT FROM (original_territory - 'lifecycleStatus' - 'consolidation')
```

`centralEntity`, `macroIntent`, `boundary`, `narrative`, `lineage`, membership e
`existingSiloRef` não podem mudar nesta operação.

`lock_version` não é atribuído no `UPDATE`: o gatilho
`editorial_workflow_items_touch_trg` incrementa a partir de `OLD`. Atribuir aqui
causaria incremento duplo.

### Compatibilidade

Os status de SiloDNA e SiloPage continuam parâmetros **independentes**. A nova RPC
os repassa sem forçar `approved` em nenhum dos dois — a aprovação da SiloPage
segue distinta da do SiloDNA.

`ArticleDNASchema.territoryRef` e os futuros campos de Silo continuam **opcionais**
nos schemas TS, para leitura do histórico. A obrigatoriedade vive no gate de
**nova** consolidação.

### Riscos e não-garantias declarados

- A RPC **não** valida operação de membership parcial pendente no território. Esse
  bloqueio é do domínio (`resolveArticleConfirmationReadiness`), não do SQL. Não foi
  acrescentado porque o §5 do pedido enumerou o que validar e isso não estava lá.
- A RPC **não** valida identidade publicada (slug/canonical/URL) — herda a mesma
  não-garantia da função histórica.
- `SiloDNA`/`SiloPage` ainda **não têm** campo `territoryRef` nos schemas TS. A RPC
  já o exige no payload. Enquanto o campo não for acrescentado aditivamente, o
  caminho novo não pode ser exercido — registrado como dependência da 2C.

### Rollback

`DROP FUNCTION` apenas da função nova. `persist_silo_pair_atomic`, tabelas, índices
e histórico permanecem. Territórios já consolidados continuam consolidados: o
rollback remove o caminho, não desfaz decisão editorial tomada.

### Objetos

`NEW_TABLES = 0 · NEW_COLUMNS = 0 · NEW_INDEXES = 0 · NEW_TRIGGERS = 0`
`NEW_FUNCTIONS = 1`

---

## Adendo 2C.3 — Working copy remota de Silo

`STATUS = IMPLEMENTADO · NEW_DDL = 0 · NEW_MIGRATION = 0`

### Problema

`SiloWorkingCopy` existia só em memória. `formSiloWorkingCopies` e
`chooseSiloWorkingCopyPillar` são funções puras, nenhuma rota persistia o
resultado e `siloWorkingCopies` não existia no código. Um reload perdia Pilar,
Suportes e exclusões — decisões humanas. React state não pode ser autoridade.

### Identidade

`SiloWorkingCopy.id` de hoje **não serve** como `subject_id`:

| origem | valor | por que não serve |
|---|---|---|
| cópia nova | `working-silo:<n>` | `n` vem da POSIÇÃO no laço de formação |
| cópia existente | `siloId` | pode ser UUID cru vindo de `lista_id` |

Criado ref próprio, emitido server-side: `silo-working-copy:<uuid>`. O prefixo
também protege `source_entity_id` do predicado de purga da 0047, que em duas
ramificações não filtra `subject_type`.

`workingCopyRef` ≠ `siloId` ≠ `territoryRef` ≠ id da linha de workflow. Quatro
espaços distintos, sem alias.

### Contrato

```
subject_type     = 'silo_working_copy'
stage            = 'architect'
subject_id       = <workingCopyRef>
source_entity_id = <workingCopyRef>
article_id       = NULL
state            = formationStatus  (draft | ready_for_review)
payload = { contractVersion: 'silo-working-copy-v1', workingCopy: {...} }
```

A UNIQUE `(marca_id, subject_type, subject_id, stage)` que já existe fecha a
identidade por Brand. Nenhum índice novo.

### Um único lifecycle

`state` espelha `formationStatus` e nada mais. Não existe `consumed`,
`consolidated` nem `published` nesta linha: consolidação é representada pelo
Território e pelos artefatos versionados. Duas fontes de ciclo de vida seriam
duas verdades.

### Depois da consolidação

Território `consolidated` → toda escrita na working copy é recusada com
`WORKING_COPY_ALREADY_CONSUMED`. A autoridade estrutural passa a ser SiloDNA
versionado + SiloPage versionada + `Territory.consolidation`. A cópia permanece
como histórico pré-consolidação, imutável. Mudança posterior é sucessora.

`rejected`, `superseded` e `archived` recusam com `TERRITORY_NOT_EDITABLE` —
motivo diferente, porque a situação é diferente.

### Pilar: candidato ≠ selecionado

Dois caminhos escolhiam Pilar automaticamente:

1. `silo-consolidation.ts:373` — `pillarCandidateArticleId: selectedIds[0]`,
   Pilar por ordem do array numa proposta de IA. **Corrigido**: a cópia nova
   nasce sem Pilar e sem Suportes atribuídos.
2. `silo-formation.ts` `buildCopy` — `const pillar = scores[0]?.articleId`,
   Pilar pelo maior `pillarScore` (volume, centralidade, KGR...). **Não
   alterado** nesta rodada: é a formação legada em memória, sem autoridade.

A imunidade vem do contrato novo: `pillarSuggestionArticleId` é sugestão e
`pillarSelection` é decisão humana com ator, momento, motivo e a composição
sobre a qual se decidiu. A consolidação lê `pillarSelection`. A sugestão nunca
vira seleção, mesmo que a formação legada continue sugerindo.

`refusePillarSelection` recusa ator não-humano (`PILLAR_NOT_HUMAN_DECIDED`) e
decisão tomada sobre composição diferente da vigente (`PILLAR_DECISION_STALE`).

### Membership não duplicada

Keyword → Território continua vindo do item de workflow da keyword. A working
copy referencia Articles por `{articleId, articleDnaVersionId,
articleDnaContentHash}` — versionado, nunca `workingArticleId`, e sem coleção
capaz de remapear keyword para outro território.

### Riscos

- A working copy legada em memória continua existindo em paralelo. Enquanto a UI
  não ler o remoto, há duas representações; a remota é a autoridade e a legada é
  projeção. Migrar a UI é a 2C.4.
- `buildCopy` continua sugerindo Pilar automaticamente. É sugestão por contrato,
  mas convém remover a inferência quando a UI passar a ler o remoto.

### Rollback

Nenhum objeto de banco foi criado. Reverter é remover o código; as linhas
`subject_type='silo_working_copy'` porventura gravadas ficam órfãs e inertes —
nenhum consumer existente as lê, porque toda leitura da tabela é estreitada por
`stage` ou `subject_type`.

### Correcao 2C.3A — identidade derivada e idempotencia da criacao

O ref aleatorio da 2C.3 NAO dava idempotencia logica. Duas criacoes para o
mesmo territorio geravam refs diferentes, dois `subject_id` diferentes e duas
linhas: a UNIQUE nao participava de nada.

Identidade agora e DETERMINISTICA e derivada:

```
workingCopyRef = silo-working-copy:<territoryRef>
               = silo-working-copy:territory:<uuid>   (64 caracteres)
```

`subject_id` e `source_entity_id` sao `text` com CHECK apenas de `> 0` — sem
maximo. Nada foi truncado nem hasheado.

Derivado NAO e sinonimo: `workingCopyRef` continua distinto de `territoryRef`,
`siloId`, `SiloWorkingCopy.id` e do id da linha. `isSiloWorkingCopyRef` recusa um
territoryRef puro.

O envelope passou a carregar `workingCopyRef` tambem no topo do payload. A
leitura exige que os QUATRO lugares concordem: `subject_id`,
`source_entity_id`, `payload.workingCopyRef` e o ref derivado de
`payload.workingCopy.territoryRef`. Divergencia da derivacao e
`REF_NOT_DERIVED_FROM_TERRITORY`.

Criacao idempotente: SELECT pelo ref antes do INSERT; se existir, devolve a
linha com `idempotentReplay` e NAO sobrescreve. Na corrida, a UNIQUE canonica
`editorial_workflow_items_subject_stage_unique` recebe a colisao, o handler rele
pelo ref e devolve a vencedora.

O INSERT e direto, e nao via `WorkflowRepository.create`, por um motivo preciso:
`mutationData` converte o erro do banco em `PipelineRuntimeError("CONFLICT")` e
apaga o SQLSTATE e o nome da constraint. Sem eles seria impossivel distinguir a
colisao ESPERADA desta identidade de qualquer outro conflito — e tratar conflito
generico como replay esconderia falha real atras de sucesso. A deteccao exige
SQLSTATE 23505 E o nome da constraint canonica.

---

## Adendo 2C.4.1 — Concorrência da SiloWorkingCopy

`STATUS = APROVADO · SQL AINDA NÃO ESCRITO`

### Problema

A `SiloWorkingCopy` virou a autoridade mutável antes da consolidação (2C.3), mas
nem o writer da WC nem a RPC de consolidação participam de uma transação comum.
Duas corridas foram **provadas em código**, não deduzidas.

**Corrida 1 — working copy obsoleta vira Silo consolidado.**
`persist_silo_pair_and_consolidate_territory_atomic` não tem parâmetro de WC,
não trava a linha da WC e não compara `lock_version` da WC — a migration
`20260902140000` tem zero ocorrências de `silo_working_copy`. Então:

```
WC lock=N → servidor lê, readiness, decisão humana, monta SiloDNA/SiloPage
          → outro request leva a WC para N+1
          → a RPC commita artefatos derivados de N
```

**Corrida 2 — working copy alterada depois da consolidação.**
`updateSiloWorkingCopy` faz TRÊS requisições PostgREST, ou seja três transações:
SELECT da WC, SELECT do território (`readTerritoryGuard`), e o UPDATE. O guard de
editabilidade e a escrita estão em transações diferentes:

```
W lê Território `confirmed`      (T2)
consolidação commita → consolidated
UPDATE de W commita              (T3)   ← passa, com expectedLock válido
```

O `WORKING_COPY_ALREADY_CONSUMED` da 2C.3 é real, mas é TOCTOU.

### Alternativas rejeitadas

| alternativa | por que não |
|---|---|
| só travar a WC na consolidação (Opção A isolada) | não fecha a corrida 2: o writer antigo mantém `expectedLock` válido e seu guard territorial continua fora da transação |
| fencear a WC durante a consolidação (Opção C) | produz erro de "lock obsoleto", indistinguível de edição concorrente comum; e o writer que refaz a leitura passa de novo |
| edição de WC tocar também a linha do Território, para o `p_territory_expected_lock` existente detectar a mudança | zero RPC nova, mas acopla a concorrência de dois registros distintos, escreve no registro territorial por motivo não-territorial e põe edições de território e de WC em contenção mútua |

Nenhuma das três resolve as duas corridas. A solução aprovada usa **duas** RPCs
transacionais que compartilham uma ordem de locks.

### RPC A — entrypoint canônico da consolidação

`public.persist_silo_from_working_copy_atomic`

```
p_marca_id                   uuid
p_actor_user_id              uuid
p_action                     text     -- 'create' | 'edit'
p_territory_workflow_item_id uuid
p_territory_expected_lock    integer
p_working_copy_expected_lock integer  -- snapshot que passou pela decisão humana
p_silo_dna                   jsonb
p_silo_page                  jsonb
p_silo_dna_status            text
p_silo_page_status           text
RETURNS jsonb
```

`workingCopyRef` **não é parâmetro**: é derivado do `territoryRef` lido da linha
travada. Aceitá-lo do chamador permitiria apontar para outra working copy.

Fluxo:

1. guardas de forma, ação e status; autorização própria;
2. **Território FOR UPDATE** por `id` + `marca_id`; guards canônicos completos;
3. derivar `workingCopyRef = silo-working-copy:<territoryRef>`;
4. **SiloWorkingCopy FOR UPDATE** por `(marca_id, 'silo_working_copy', ref, 'architect')`;
5. **ramo de replay primeiro** — se o Território já está `consolidated`;
6. caminho canônico: conferir `WC.lock_version = p_working_copy_expected_lock`;
7. conferir a proveniência declarada no payload do SiloDNA contra a WC travada;
8. chamar `persist_silo_pair_and_consolidate_territory_atomic` — **sem copiar seu corpo**;
9. um único commit.

A consolidação **não muta a working copy**. Ela não precisa: a prova de consumo
é `Territory.lifecycleStatus = consolidated` + `Territory.consolidation`.

### RPC B — writer canônico da working copy

`public.persist_silo_working_copy_atomic`

```
p_marca_id                   uuid
p_actor_user_id              uuid
p_action                     text     -- 'create' | 'edit'
p_territory_workflow_item_id uuid
p_working_copy_expected_lock integer  -- NULL na criação
p_working_copy               jsonb    -- o estado; identidade é imposta pelo servidor
RETURNS jsonb
```

CREATE **e** UPDATE, pelo mesmo motivo: hoje a criação também faz
`read Território → INSERT` em transações diferentes. A identidade determinística
da 2C.3A resolveu a duplicação, mas não o guard territorial TOCTOU do create.

Fluxo:

1. guardas + autorização própria;
2. **Território FOR UPDATE**; guards canônicos; editabilidade **na mesma transação**:
   `consolidated` → `WORKING_COPY_ALREADY_CONSUMED`;
   `rejected`/`superseded`/`archived` → `TERRITORY_NOT_EDITABLE`;
3. derivar `workingCopyRef`; conferir `territoryRef` e `brandId` do estado recebido;
4. **WC FOR UPDATE** quando existir;
5. ausente + `expected_lock` NULL → INSERT;
   ausente + `expected_lock` não nulo → recusa (update sobre inexistente);
   presente + `expected_lock` NULL → replay idempotente, **zero overwrite**;
   presente + `expected_lock` → conferir lock, validar identidade, UPDATE.

`lock_version` não é atribuído: o gatilho
`editorial_workflow_items_touch_trg` incrementa a partir de `OLD`.
Sem UPSERT — UPSERT poderia sobrescrever payload.

Depois desta integração, nenhum create/update Silo-first pode usar
`WorkflowRepository.update` nem INSERT isolado como autoridade de escrita.
Leitura continua pelo store/repository normal.

### Ordem global de locks

```
1. Territory
2. SiloWorkingCopy
3. advisory lock do Silo   (já dentro de persist_silo_pair_atomic)
4. artifacts
```

Consolidação percorre 1→2→3→4; mutação de WC percorre 1→2. Nenhum writer
canônico adquire a WC antes do Território, então não há ciclo — é esta a
invariante de prevenção de deadlock. Retravar o Território dentro da 2C.1 é
inócuo: locks de linha são reentrantes na mesma transação.

### Proveniência da working copy

Aditiva e **opcional** em `SiloDNASchema`:

```ts
workingCopyRef?: SiloWorkingCopyRef        // silo-working-copy:territory:<uuid>
workingCopyLockVersion?: number            // inteiro positivo
```

- **legado**: os dois podem faltar — todo SiloDNA anterior à 2C não tem WC;
- **novo Silo-first**: os dois são obrigatórios, exigidos pela RPC A;
- **coerência**: nunca um sem o outro. Um `superRefine` recusa o par incompleto.

Não vai para o `SiloPage`: ela já referencia o SiloDNA versionado por
`siloDnaRef`, e duplicar a proveniência criaria dois lugares para divergir.

Auditoria dos contratos existentes: não há campo reaproveitável. `provenance` em
`contracts.ts` pertence a `InternalLinkGraphEdge`;
`KeywordDnaProvenanceSnapshot` é da keyword; `TerritoryProvenanceSchema` é do
território.

### Replay

A RPC A **não fencea** a WC, então após o commit `WC.lock_version` permanece o
mesmo e um retry chega com o lock certo.

O ramo de replay é avaliado **antes** da checagem de
`p_working_copy_expected_lock` — mesma lição do gate 2C.1: conferir lock antes
de detectar replay mataria o retry exatamente no caso que a idempotência existe
para cobrir.

No replay: localizar a WC pelo ref determinístico, validar a identidade da linha,
confirmar que é histórica pelo Território `consolidated`, conferir que o SiloDNA
persistido carrega `workingCopyRef` e `workingCopyLockVersion` correspondentes à
WC histórica, e delegar a comparação do par à lógica de replay já existente na
2C.1 — que compara o payload inteiro, então a proveniência entra na verificação
sem lógica nova.

Mesmo request → `idempotentReplay = true`, zero mutação.
Par ou proveniência diferentes → `REPLAY_CONFLICT` ou
`STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR`. Sucessora nunca é criada automaticamente.

Primeira consolidação com `WC.lock_version != expected` → `STALE_WORKING_COPY`:
nenhum artefato, Território continua `confirmed`.

### Pós-consolidação

Nenhum lifecycle paralelo: não existe `WC.state = consumed`. A prova de consumo
é o Território. A working copy fica legível e fisicamente intacta, e toda
tentativa de escrita começa travando o Território e é recusada ali.

### Classificação das funções

```
persist_silo_pair_atomic                              primitive interno (2A)
persist_silo_pair_and_consolidate_territory_atomic    primitive interno (2C.1)
persist_silo_from_working_copy_atomic                 ENTRYPOINT CANÔNICO
persist_silo_working_copy_atomic                      writer canônico da WC
```

A 2C.1 **deixa de ser entrypoint**: nenhum adapter ou route do fluxo Silo-first
pode chamá-la diretamente. As migrations históricas `20260826225154` e
`20260902140000` não são editadas.

### Segurança

Ambas: `SECURITY INVOKER`, `search_path` fixado, `EXECUTE` só para
`service_role`, e autorização **própria** — `canonical_assert_rpc_actor` +
`canonical_actor_can_access_brand` + `canonical_actor_can_use_brand_action`.
Não delegada à função aninhada.

### Objetos

```
NEW_TABLES = 0 · NEW_COLUMNS = 0 · NEW_INDEXES = 0 · NEW_TRIGGERS = 0
STORAGE_SCHEMA_DDL = 0
FUNCTION_DDL = 2 · NEW_MIGRATION = 1
```

### Rollback

`DROP` apenas das duas funções novas. As primitivas, tabelas, índices e todo o
histórico permanecem. Working copies e territórios já gravados continuam
legíveis: o rollback remove o caminho transacional, não desfaz decisão editorial.

### Risco declarado

Enquanto a UI não migrar para o entrypoint canônico, o caminho antigo
(`updateSiloWorkingCopy` via store) continua existindo e mantém as duas corridas.
A troca precisa ser completa, não paralela — dois writers com disciplinas de lock
diferentes são piores que um writer errado.

### Testes previstos

Consolidação com WC alterada entre a decisão e o commit → `STALE_WORKING_COPY`,
zero artefato, Território `confirmed`. Update de WC concorrente com consolidação
→ um dos dois falha, nunca os dois passam. Update após consolidação →
`WORKING_COPY_ALREADY_CONSUMED`. Retry idêntico → `idempotentReplay`, zero
mutação, lock da WC inalterado. Proveniência ausente no novo fluxo → recusa.
Proveniência pela metade → recusa. Ordem de locks idêntica nos dois writers.
