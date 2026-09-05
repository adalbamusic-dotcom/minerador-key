# Pedido estrutural — persistência canônica da revisão IA do artigo

STRUCTURAL_AI_REVIEW_PERSISTENCE_REQUIRED = YES
STATUS = RESOLVIDO PELO PLANNER DO ARQUITETO EM 2026-08-29 (ver §9)

Módulo solicitante: Arquiteto
Data: 2026-08-29
Destino: Planner Geral (decisão de contrato/schema)
Execução de SQL/migration/smoke remoto: do produto, nunca do agente

## 1. Problema

A revisão arquitetural por IA já funciona por Article — 1 Article = 1 execução,
concurrency = 1, payload estratégico compacto, isolamento de falhas e proposta
material distinguida de NO-OP. O resultado, porém, vive apenas no estado de
sessão.

Cenário comprovado no smoke:

| Momento | Aba IA | Revisão IA |
| --- | --- | --- |
| Antes do F5 | IA · Concluída sem propostas | Revisada |
| Depois do F5 | IA · Não executada | Não executada |

O Arquiteto não pode considerar executada uma revisão editorial cujo estado
desaparece no reload. Nenhum fallback local foi criado.

## 2. Auditoria da durabilidade atual

| Fonte | Onde vive hoje | Sobrevive ao F5 |
| --- | --- | --- |
| AI_EXECUTION_STATE_SOURCE | `pendingKeywordReview` (React state, `modules/arquiteto/arquiteto-workspace.tsx`) | Não |
| AI_PROPOSAL_STATE_SOURCE | `pendingKeywordReview.review.decisions` (React state) | Não |
| AI_NOOP_STATE_SOURCE | derivado em runtime por `materialKeywordArticleDecisions` | Não |
| Anotação aplicada à keyword | `aiReviewAnnotation` no item em memória e `annotations` no artefato local `minerador-pro:architect-review:{ator}:{marca}` | Sim, só naquele navegador |

A única continuidade existente é a recuperação local do navegador
(`ArchitectReviewRecoverySchema`, `lib/editorial/architect-recovery.ts`). Ela
preserva a anotação de uma proposta já aplicada, no mesmo navegador — não é
canônica, não atravessa dispositivos e não alcança o downstream. A execução em
si, a proposta ainda não aplicada e o resultado NO_OP não estão nela.

Cópia de trabalho canônica: `app/api/arquiteto/workspace/route.ts` →
`AssignmentSchema` é `.strict()` e aceita apenas `workingArticleId`,
`clusterId`, `provisionalGroupId`, `siloId`, `silo_id`, `siloName`,
`computedSlug`, `slug_sugerido`, `computedHierarquia`, `hierarquia`, `role`,
`principalKeywordId`, `siloCandidate`, `articleKgrDecision` e `manualEdit`. Não
há campo para execução, proposta ou NO_OP — o envio seria rejeitado pelo
schema, não silenciosamente perdido.

`LocalWorkflowRecoverySchema` (`lib/editorial/persistence-contracts.ts`) declara
`aiReviewAnnotations`, mas é recuperação local de navegador, declarada no
próprio arquivo como algo que não substitui persistência remota — e hoje nada
escreve ou lê esse campo.

AI_CANONICAL_STORAGE_FOUND = NO

## 3. Requisitos do pedido

**Escopo/tenant.** Tenantizada por `brandId`; `actorUserId = auth.uid()` quando
houver ação humana. Nunca resolver tenant por slug/nome/owner. Cross-brand
impossível por contrato e validação server-side.

**Identidade.** No mínimo `brandId`, `articleId`/working article identity,
`baseArticleVersionId` e `baseArticleVersionNumber` quando existirem,
`baseArticleContentHash` ou equivalente, `principalKeywordId` e `createdAt`. A
revisão de uma versão anterior não pode ser reaproveitada silenciosamente como
revisão da sucessora estrutural.

**Estados.** `NOT_RUN`, `PROCESSING` (pode seguir só em runtime),
`COMPLETED_NO_PROPOSALS`, `COMPLETED_WITH_PROPOSALS`, `ERROR`. O estado
editorial durável relevante são os dois `COMPLETED_*`; `ERROR` só quando fizer
sentido como histórico operacional, sem virar decisão editorial.

**NO_OP é resultado válido.** Revisou pertencimento, Principal, papéis,
coerência SERP e risco de canibalização e concluiu que nada muda: isso é
evidência de execução. Depois do F5 deve continuar `IA · Concluída sem
propostas`.

**Propostas.** Por proposta: `proposalId` estável, article/base version,
`keywordId(s)`, tipo de mudança, estado atual, estado proposto, motivo,
evidências/referências usadas, `materialChange = true`, `reviewState` e
`createdAt`. Sem ampliar o vocabulário de tipos por causa da persistência.

**Decisão humana ≠ execução IA.** Persistir separadamente o resultado da IA e a
decisão/aplicação humana. IA aplicada não significa ArticleDNA aprovado.

**Imutabilidade/sucessoras.** Resultado semanticamente idêntico → idempotência,
sem versão inútil. Resultado materialmente diferente → nova versão, anterior
preservada. Base do Article mudou → a revisão nova pertence à nova base, sem
alterar retroativamente a antiga.

**Hash.** `contentHash` somente sobre informação editorial/canônica — nunca
seleção de UI, viewport, React Flow, loading ou timestamp transitório. Deve
permitir idempotência, readback e detecção de base alterada.

**Proveniência.** `provider`, `model`, `executionRequestId`, versão/referência
do contrato de prompt, `createdAt`, SERP base usada, versão/hash do Article base
e referência da projeção estratégica. Sem payload técnico gigante e sem
segredo/credencial.

**SERP e KeywordDNA.** Registrar qual SERP foi considerada
(`serpAssessmentId`/`versionId`/`contentHash`). KeywordDNA é somente leitura: a
revisão jamais sobrescreve intenção, funil, métricas, KGR, aplicabilidade,
apresentação contextual ou revisão do Minerador.

**Fluxo server-side.** IA executa → valida schema → classifica material/no-op →
grava artefato canônico → readback da versão gravada → só então SUCCESS. Falha
de persistência não pode aparecer como revisão durável.

**F5 e stale.** A hidratação recupera a revisão vigente por Article/base version
e reconstrói o read-model. Revisão de base v2/hash A com Article em v3/hash B
não aparece como vigente: vira histórico, e o estado atual é `NOT_RUN`/`STALE`
conforme a decisão de contrato.

**Consumidores.** Arquiteto (aba IA, coluna Revisão IA, Workbench, Revisão
humana, mapa comparativo) e consolidação do ArticleDNA apenas com decisões
efetivamente aplicadas. Radar recebe somente ArticleDNA consolidado/aprovado;
Planejador não consome proposta pendente.

**Proibido.** `localStorage`/IndexedDB/estado React como fonte canônica, mock
como readback, fallback silencioso, resultado da IA como campo solto no
ArticleDNA sem versionamento/proveniência e IA aprovando ArticleDNA
automaticamente.

## 4. Fundação existente que já atende quase tudo

O item 12 do pedido manda preferir reutilização de fundação já aprovada. Ela
existe: `editorial_artifact_versions`, acessada por
`ArtifactVersionRepository` (`lib/server/pipeline-repositories.ts`) e exposta por
`POST/GET /api/arquiteto/artifacts` (`lib/server/arquiteto-persistence.ts`,
`lib/arquiteto/canonical-persistence.ts`).

| Requisito | Como a fundação já resolve |
| --- | --- |
| Tenant | `marca_id` em toda query; `resolvePipelineContext` valida o ator pela RPC `canonical_actor_can_access_brand` antes de qualquer escrita |
| Identidade/escopo | `entity_id` + `artifact_type` + `marca_id`, com `UNIQUE (marca_id, artifact_type, entity_id, version_number)` |
| Versionamento | `version_number` incremental e `previous_version_id` encadeado |
| Idempotência | `append()` devolve `UNCHANGED` quando o `content_hash` é igual ao da versão vigente — nenhuma versão inútil |
| Concorrência | `previousVersionId` divergente da vigente → `409 CONFLICT` |
| Readback | `list(entityId, artifactType)` devolve a cadeia completa ordenada |
| Proveniência | `origin` já aceita `"ai"`; `change_reason`, `created_by`, `created_at` |
| Referência a outro artefato | `source_version_id` (usado hoje pela SiloPage para amarrar o SiloDNA de origem) |
| Decisão humana | `editorial_version_status_events` com `draft`/`proposed`/`approved`/`rejected`/`superseded` |

O envelope de aplicação (`VersionMetadataSchema`) já carrega `versionId`,
`entityId`, `versionNumber`, `previousVersionId`, `contentHash`, `origin`,
`changeReason`, `createdAt` e `createdBy`.

Ou seja: **nenhuma tabela nova é necessária**. O que falta é o tipo de artefato
ser aceito.

## 5. O único bloqueio estrutural

`editorial_artifact_versions.artifact_type` tem CHECK constraint. A auditoria de
baseline (`docs/00-produto/auditorias/master-refresh-manifest-supabase-2026-08-17.md`)
registra que o remoto aceita apenas `article_dna`, `silo_dna`, `silo_page` e
`content_plan` — e é essa CHECK que já bloqueia o BrandDNA hoje. Sem estender a
lista, gravar a revisão IA falha na escrita.

O projeto não tem ledger de migrations (`supabase_migrations.schema_migrations`
não existe no remoto), então `supabase db push` não é seguro: a alteração é uma
instrução SQL única, aplicada pelo produto no SQL Editor.

Antes de decidir, confirmar o estado real do remoto (leitura, não escrita):

```sql
select pg_get_constraintdef(oid) as check_atual
from pg_constraint
where conrelid = 'public.editorial_artifact_versions'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%artifact_type%';

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'editorial_artifact_versions'
order by ordinal_position;
```

A segunda consulta importa porque `status` e `source_version_id` são escritos
pelo runtime e não constam da migration `0002` — foram materializados fora do
ledger. O contrato final precisa ser escrito contra o schema vivo, não contra o
arquivo.

## 6. Resposta proposta ao bloco de retorno

Valores marcados `A CONFIRMAR` dependem do Planner Geral ou da leitura acima.

```
AI_REVIEW_STORAGE_KIND        = store canônico compartilhado (editorial_artifact_versions)
AI_REVIEW_ARTIFACT_TYPE       = ai_article_review  (nome a confirmar pelo Planner Geral)
AI_REVIEW_SCOPE_KEY           = marca_id + artifact_type + entity_id
                                entity_id = ai-review:{articleId}
AI_REVIEW_VERSIONING          = version_number + previous_version_id (append-only)
AI_REVIEW_HASH_POLICY         = contentHash sobre o payload editorial:
                                base do Article, SERP referenciada, estado final,
                                propostas materiais ordenadas por proposalId.
                                Fora do hash: seleção, viewport, loading, tab ativa,
                                timestamps de execução.
AI_REVIEW_WRITE_API           = POST /api/arquiteto/artifacts (estender o enum da rota)
AI_REVIEW_READ_API            = GET  /api/arquiteto/artifacts?brandId=... (já devolve a cadeia)
AI_REVIEW_RLS                 = mesma política das demais versões editoriais; a rota
                                usa service client após a RPC canonical_actor_can_access_brand.
                                Política de tabela A CONFIRMAR na leitura do remoto.
AI_REVIEW_SERVICE_ROLE_USAGE  = sim, apenas server-side, após validação do ator
AI_REVIEW_NOOP_PERSISTED      = sim — COMPLETED_NO_PROPOSALS é versão gravada, não ausência
AI_REVIEW_PROPOSALS_PERSISTED = sim — no payload da versão, com proposalId estável
AI_REVIEW_HUMAN_DECISIONS_PERSISTED = separado do resultado da IA:
                                editorial_version_status_events (approved/rejected)
                                ou campo próprio de decisão no payload. A CONFIRMAR,
                                depois de verificar a existência remota da tabela de eventos.
AI_REVIEW_STALE_POLICY        = revisão vinculada a baseArticleVersionId/contentHash.
                                Base mudou → vigente vira histórico e o Article volta a
                                NOT_RUN (ou STALE, se o Planner Geral quiser o rótulo próprio).
AI_REVIEW_READBACK            = obrigatório: SUCCESS só após reler a versão gravada
AI_REVIEW_F5_READY            = sim, pela hidratação já existente do workspace
SCHEMA_CHANGE_REQUIRED        = SIM, mínimo: estender a CHECK de artifact_type
MIGRATION_REQUIRED            = SIM (arquivo versionado, para o histórico do repositório)
MANUAL_SQL_REQUIRED           = SIM — sem ledger remoto, o produto aplica no SQL Editor
TESTS                         = fixtures: idempotência, sucessora, stale por base,
                                NO_OP durável, isolamento cross-brand, readback obrigatório
REMOTE_SMOKE_REQUIRED         = SIM, cenários A–F do pedido, executados pelo produto
ROLLBACK                      = reverter a CHECK para a lista anterior; as linhas do tipo
                                novo ficam órfãs de contrato mas não afetam os artefatos
                                existentes. Nenhum dado editorial é apagado.
```

## 7. Divisão de trabalho depois da aprovação

Do Planner Geral: nome do `artifact_type`, vocabulário do estado humano
(reutilizar `approved`/`rejected` dos status events ou campo próprio), rótulo de
`STALE` e texto final da instrução SQL.

Do produto: rodar a leitura do schema vivo, aplicar o SQL e executar o smoke
remoto A–F.

Do Arquiteto, sem tocar em schema: contrato Zod do artefato e do payload,
extensão do enum nas rotas de escrita/leitura, gravação com readback
obrigatório, hidratação por Article, política de stale no read-model, separação
entre resultado da IA e decisão humana na UI, e os testes de fixture.

## 8. O que o micro-lote anterior já entregou

Execução por Article (`AI_BATCH_UNIT = ARTICLE`), concurrency = 1, projeção
estratégica compacta, guard determinístico de tamanho antes da chamada,
isolamento de falha por Article e contagem de propostas materiais igual entre a
bancada e a aba do artigo. O HTTP 413 foi corrigido pela redução do contexto
enviado, não por aumento do limite.

## 9. Decisão do Planner e implementação

```
FOUNDATION_REUSE = APPROVED
STORAGE = public.editorial_artifact_versions
NEW_TABLE = NO
ARTIFACT_TYPE = article_architecture_ai_review
SCOPE = marca_id + artifact_type + entity_id(articleId)
BASE_IDENTITY = articleId + baseArticleContentHash + optional versionId/versionNumber
SOURCE_VERSION_ID = usado quando existe ArticleDNA consolidado; opcional em formação
NO_OP = persistido como resultado válido
PROPOSALS = persistidas no payload versionado
HUMAN_PROPOSAL_DECISIONS = sucessora do próprio artefato
STALE_POLICY = STALE quando baseArticleContentHash diverge
STALE_BLOCKS_APPROVAL = NO
CONTENT_HASH_MUST_INCLUDE_BASE = YES
IDEMPOTENCE = mesma base + mesmo resultado → UNCHANGED
BASE_CHANGED_SAME_RESULT = nova versão
READBACK = obrigatório antes de SUCCESS
SCHEMA_CHANGE = ampliação do CHECK artifact_type
```

### O que foi implementado

- **Contrato** — `lib/arquiteto/article-ai-review.ts`:
  `ArticleArchitectureAiReviewSchema` (base, execução, propostas, decisão
  humana), `resolveArticleAiReviewBase`, `buildArticleAiReviewPayload`,
  `applyHumanProposalDecisions`, `resolveArticleAiReviewReadout` e
  `currentArticleAiReviews`.
- **Payload determinístico** — nada de `executedAt`, request id, seleção de UI
  ou estado visual dentro do payload. O `contentHash` do envelope cobre base +
  execução + propostas + decisão humana, então a idempotência e a detecção de
  base alterada vêm da própria fundação. O momento da execução e o da decisão
  humana ficam no `createdAt` do envelope, fora do hash.
- **Servidor** — `article_architecture_ai_review` entrou em `ArtifactType`,
  em `validatePayload`, no `artifactEntityId` (= `articleId`), no readback
  tipado e na listagem (`aiReviews`). `resolveAiReviewSourceVersionId` amarra
  `source_version_id` ao ArticleDNA consolidado quando a revisão declara a
  versão base, recusando versão de outra Brand ou hash divergente.
- **Escrita e readback** — a execução por Article grava a revisão logo após a
  resposta do provider e, antes de anunciar SUCCESS, relê os artefatos canônicos
  e compara `versionId`/`contentHash`. Sem confirmação não há sucesso.
- **F5** — a hidratação do workspace devolve `aiReviews` e o read-model do
  Article passou a aceitar `durableAiState`, `durableMaterialProposalCount`,
  `durablePendingProposalCount` e `aiBaseChanged`. NO_OP e propostas
  sobrevivem ao reload.
- **STALE** — o hash da base vigente é recalculado fora do render; base
  divergente marca a revisão como histórico, mostra aviso na aba IA e não entra
  como pendência, portanto não bloqueia a aprovação do ArticleDNA.
- **Decisão humana** — aceitar ou rejeitar proposta grava sucessora com
  `reviewState` e `decidedBy` por proposta, sem reescrever o resultado da IA.
- **Migration** —
  `supabase/migrations/20260829120000_article_architecture_ai_review_artifact.sql`
  amplia o CHECK de `artifact_type` seguindo o mesmo padrão das migrations de
  artifact anteriores, com guarda por dados e sem tabela, coluna, RLS ou grant
  novo. A aplicação no remoto é do produto.

### Correção da §5

A lista do CHECK citada na auditoria de 2026-08-17 estava desatualizada: as
migrations posteriores já acrescentaram `brand_dna`, `brand_skill`,
`keyword_semantic_qualification` e `keyword_contextual_presentation`. A
migration deste lote parte dessa lista e acrescenta
`article_architecture_ai_review`.

### Smoke remoto pendente (executado pelo produto)

Cenários A–F do pedido: NO_OP durável, proposta durável com decisão humana,
reexecução idêntica sem versão nova, reexecução diferente com sucessora, base
alterada saindo de vigente e isolamento entre Brands.
