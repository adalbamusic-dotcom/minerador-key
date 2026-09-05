# Inventário técnico — revisão de 2026-09-04

Módulo proprietário: Plataforma / auditoria transversal. Gerado do checkout local. Contagens não incluem node_modules, .next ou .git. Inventário não comprova implantação, disponibilidade HTTP nem aplicação remota de migrations.

## Árvore resumida

```text
minerador-key/
├── app/
│   ├── (admin)/
│   ├── (agency)/
│   ├── (brand)/
│   ├── (personal)/
│   ├── api/
│   ├── auth/
│   ├── cadastro/
│   ├── login/
│   ├── onboarding/
│   ├── recuperar-senha/
│   ├── selecionar-marca/
│   ├── solicitar-acesso/
├── modules/
│   ├── admin/
│   ├── arquiteto/
│   ├── conta/
│   ├── marca/
│   ├── minerador/
│   ├── planejador/
│   ├── publicacoes/
│   ├── radar/
│   ├── redator/
├── components/
│   ├── auth/
│   ├── editorial/
│   ├── lifecycle/
│   ├── marca/
│   ├── minerador/
│   ├── planejador/
│   ├── product/
│   ├── publicacoes/
│   ├── radar/
├── lib/
│   ├── arquiteto/
│   ├── auth/
│   ├── editorial/
│   ├── google/
│   ├── lifecycle/
│   ├── local-worker/
│   ├── marca/
│   ├── minerador/
│   ├── navigation/
│   ├── planejador/
│   ├── publicacoes/
│   ├── radar/
│   ├── redator/
│   ├── server/
│   ├── supabase/
│   ├── tenant/
├── supabase/
│   ├── baseline/
│   ├── migrations/
│   ├── rollback/
│   ├── scripts/
├── docs/
│   ├── 00-produto/
│   ├── 01-admin/
│   ├── 02-marca/
│   ├── 03-minerador/
│   ├── 04-arquiteto/
│   ├── 05-radar/
│   ├── 06-planejador/
│   ├── 07-redator/
│   ├── 08-publicacoes/
│   ├── 09-conta/
│   ├── compartilhado/
│   ├── scratch/
│   ├── _arquivo/
├── tests/
├── scripts/
├── public/
├── types/
├── proxy.ts
├── next.config.ts
├── package.json
└── pnpm-lock.yaml
```

## Volume

| Diretório | Arquivos |
|---|---:|
| `app` | 133 |
| `modules` | 95 |
| `components` | 38 |
| `lib` | 401 |
| `tests` | 377 |
| `supabase/migrations` | 65 |
| `supabase/scripts` | 139 |
| `supabase/rollback` | 9 |
| `docs` | 290 |

## APIs

Métodos e nomes de guards abaixo são extraídos sintaticamente. Guard delegado a um helper pode não aparecer; presença de guard não prova autorização correta para todos os objetos ou ações.

| Endpoint | Métodos explícitos | Guards diretamente observados |
|---|---|---|
| `/api/admin/agencies` | GET, POST, PATCH | `requireCanonicalPlatformAdmin` |
| `/api/admin/agencies/users` | GET | `requireCanonicalPlatformAdmin` |
| `/api/admin/agency-applications` | GET, PATCH | `requireCanonicalPlatformAdmin` |
| `/api/admin/agency-invitations` | GET, POST, PATCH | `requireCanonicalPlatformAdmin` |
| `/api/admin/communication` | GET, POST | `requireCanonicalPlatformAdmin` |
| `/api/admin/integrations` | GET, POST | `requireCanonicalPlatformAdmin` |
| `/api/admin/owners` | GET | `requireCanonicalPlatformAdmin` |
| `/api/admin/users` | GET, PATCH | `requireCanonicalPlatformAdmin` |
| `/api/agencies/[agencyRef]/brands` | POST | Ver handler/helpers |
| `/api/agencies/[agencyRef]/integrations` | GET, POST | Ver handler/helpers |
| `/api/agencies/[agencyRef]/members` | GET, POST, PATCH | Ver handler/helpers |
| `/api/agencies/[agencyRef]` | PATCH | Ver handler/helpers |
| `/api/agency-applications` | POST | Ver handler/helpers |
| `/api/analyze` | POST | `requireCanonicalSessionProfile`, `assertCanAccessMarca` |
| `/api/arquiteto/architecture-marker` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission`, `resolvePipelineContext` |
| `/api/arquiteto/article-dna` | POST | `resolvePipelineContext` |
| `/api/arquiteto/article-formation-marker` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission`, `resolvePipelineContext` |
| `/api/arquiteto/artifacts` | GET, POST | `resolvePipelineContext` |
| `/api/arquiteto/handoff` | POST | `resolvePipelineContext` |
| `/api/arquiteto/internal-link-graph/anchors` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission`, `resolvePipelineContext` |
| `/api/arquiteto/internal-link-graph/proposals` | GET, POST, PATCH | `resolvePipelineContext` |
| `/api/arquiteto/internal-link-graph` | GET, POST | `resolvePipelineContext` |
| `/api/arquiteto/internal-link-graph/working-copy` | GET, POST, PATCH | `resolvePipelineContext` |
| `/api/arquiteto/publication/verify` | POST | `authorizedSiteBrand`, `assertEditorialPermission` |
| `/api/arquiteto/serp` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission`, `resolvePipelineContext` |
| `/api/arquiteto/serp-resolution` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission`, `resolvePipelineContext` |
| `/api/arquiteto/silo-consolidation` | POST | `resolvePipelineContext` |
| `/api/arquiteto/silo-dna` | POST | `resolvePipelineContext` |
| `/api/arquiteto/silo-page` | POST | `resolvePipelineContext` |
| `/api/arquiteto/silo-pair` | POST | `resolvePipelineContext` |
| `/api/arquiteto/silo-review` | POST | `resolvePipelineContext` |
| `/api/arquiteto/silos` | POST | `resolvePipelineContext` |
| `/api/arquiteto/territorial-ai` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission`, `resolvePipelineContext` |
| `/api/arquiteto/territorial-serp` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission`, `resolvePipelineContext` |
| `/api/arquiteto/workspace` | GET, PATCH | `resolvePipelineContext` |
| `/api/auth/google-client-id` | GET | Ver handler/helpers |
| `/api/auth/invited-signup` | POST | Ver handler/helpers |
| `/api/auth/signup` | POST | Ver handler/helpers |
| `/api/clusterize` | POST | `requireCanonicalSessionProfile`, `assertCanAccessMarca` |
| `/api/communication/delivery` | POST | Ver handler/helpers |
| `/api/contexts/restore` | POST | `requireCanonicalActorUserId` |
| `/api/contexts` | GET | Ver handler/helpers |
| `/api/editorial/documents` | PATCH, POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/editorial/expert-briefs` | GET, POST, PATCH | `requireCanonicalSessionProfile`, `assertCanAccessMarca`, `assertEditorialPermission` |
| `/api/editorial/expert-briefs/send` | POST | `requireCanonicalSessionProfile`, `assertCanAccessMarca`, `assertEditorialPermission` |
| `/api/editorial/invitations` | POST | `requireCanonicalSessionProfile`, `assertCanAccessMarca`, `assertEditorialPermission` |
| `/api/editorial/radar-analysis/extract` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/editorial/radar-analysis` | GET, POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/editorial/radar-topics` | POST | `resolvePipelineContext` |
| `/api/editorial/serp` | GET, POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/editorial/views` | GET, POST, DELETE | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/editorial/workflow` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/editorial/workspace` | GET | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/generate-briefing` | POST | `requireCanonicalSessionProfile`, `assertCanAccessMarca` |
| `/api/integrations/telegram/webhook` | POST | Ver handler/helpers |
| `/api/inteligencia` | GET | `requireCanonicalSessionProfile`, `assertCanAccessMarca` |
| `/api/marca/brand-dna` | GET, POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/marca/site/import/keywords/preview` | POST | `authorizedSiteBrand` |
| `/api/marca/site/import/keywords` | POST | `authorizedSiteBrand` |
| `/api/marca/site/lists` | GET | `authorizedSiteBrand` |
| `/api/marca/site/page/verify` | POST | `authorizedSiteBrand`, `resolvePipelineContext` |
| `/api/marca/site/sitemap` | GET, POST | `resolvePipelineContext` |
| `/api/marca/site/sitemap/sync` | POST | `authorizedSiteBrand`, `resolvePipelineContext` |
| `/api/marca/site/sitemap/test` | POST | `authorizedSiteBrand` |
| `/api/marca/skills` | GET, POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/marcas/[brandId]/experts` | GET, POST | `requireCanonicalBrandManageOrPlatformAdmin` |
| `/api/marcas` | GET, POST, DELETE, PUT | `requireCanonicalPlatformAdmin`, `requireCanonicalBrandManageOrPlatformAdmin` |
| `/api/mine` | POST | Ver handler/helpers |
| `/api/minerador/marcas/[brandId]/dataforseo/allintitle` | POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/discovery/import` | POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/discovery/sources` | GET, POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/google-ads/conexao` | GET, POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords` | GET, POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/google-ads/metricas-keywords` | POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/ia/brief-apresentacao` | POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/keywords/delete/preview` | POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/keywords/delete` | POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/keywords/purge` | POST | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/keywords/recoverable` | GET | `requireCanonicalSessionProfile` |
| `/api/minerador/marcas/[brandId]/keywords/restore` | POST | `requireCanonicalSessionProfile` |
| `/api/onboarding/agency/continue` | GET | Ver handler/helpers |
| `/api/onboarding/agency` | GET, POST | Ver handler/helpers |
| `/api/process-intent-niche` | POST | `requireCanonicalSessionProfile`, `assertCanAccessMarca` |
| `/api/publicacoes` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/redator/guardian` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/redator/improve` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/redator/section` | POST | `requireCanonicalSessionProfile`, `assertEditorialPermission` |
| `/api/revalidate-structure` | POST | `requireCanonicalSessionProfile`, `assertCanAccessMarca` |
| `/api/tenants` | GET | Ver handler/helpers |
| `/api/volume` | POST | Ver handler/helpers |

## Páginas físicas do App Router

Grupos entre parênteses não são segmentos de URL. `[brandRef]` identifica a marca canônica.

- `app/(admin)/admin/agencias/page.tsx`
- `app/(admin)/admin/marcas/page.tsx`
- `app/(admin)/admin/page.tsx`
- `app/(admin)/admin/usuarios/page.tsx`
- `app/(agency)/agencias/[agencyRef]/configuracoes/page.tsx`
- `app/(agency)/agencias/[agencyRef]/integracoes/page.tsx`
- `app/(agency)/agencias/[agencyRef]/marcas/page.tsx`
- `app/(agency)/agencias/[agencyRef]/membros/page.tsx`
- `app/(agency)/agencias/[agencyRef]/page.tsx`
- `app/(brand)/[brandRef]/arquiteto/page.tsx`
- `app/(brand)/[brandRef]/conta/page.tsx`
- `app/(brand)/[brandRef]/minerador/descobrir/page.tsx`
- `app/(brand)/[brandRef]/minerador/page.tsx`
- `app/(brand)/[brandRef]/page.tsx`
- `app/(brand)/[brandRef]/planejador/[contentPlanId]/page.tsx`
- `app/(brand)/[brandRef]/planejador/page.tsx`
- `app/(brand)/[brandRef]/publicacoes/page.tsx`
- `app/(brand)/[brandRef]/radar/[articleId]/page.tsx`
- `app/(brand)/[brandRef]/radar/page.tsx`
- `app/(brand)/[brandRef]/redator/page.tsx`
- `app/(personal)/conta/page.tsx`
- `app/cadastro/page.tsx`
- `app/login/page.tsx`
- `app/onboarding/agencia/page.tsx`
- `app/page.tsx`
- `app/recuperar-senha/page.tsx`
- `app/selecionar-marca/page.tsx`
- `app/solicitar-acesso/page.tsx`

## Migrations presentes

Lista física; não é ledger de execução. Arquivos de proposta e scripts vinculados a ambientes coexistem com migrations canônicas. Não executar esta lista em lote.

- `0001_protect_publicado.sql`
- `0002_operational_editorial_flow.sql`
- `0003_radar_serp_snapshots.sql`
- `0004_brand_site_catalog.sql`
- `0005_tenant_ownership_and_rls.sql`
- `0006_reconcile_tenant_security.sql`
- `0007_minerador_google_ads_volume.sql`
- `0008_minerador_keyword_measurement_delete_cascade.sql`
- `0009_minerador_discovery_persistence.sql`
- `0010_minerador_discovery_import.sql`
- `0011_fix_minerador_discovery_import_candidate_alias.sql`
- `0012_fix_minerador_discovery_import_finalized_run.sql`
- `0013_minerador_discovery_candidate_current_metrics.sql`
- `0014_agency_foundation.sql`
- `0015_canonical_identity_authorization_foundation.sql`
- `0016_legacy_identity_runtime_bridge.sql`
- `0017_remove_legacy_identity_contracts.sql`
- `0018_agency_onboarding.sql`
- `0019_platform_communication.sql`
- `0020_communication_transactional_minimum.sql`
- `0021_canonical_agency_brand_authorization.sql`
- `0022_communication_service_role_acl_hardening.sql`
- `0023_agency_invitation_successor_lifecycle.sql`
- `0024_integrations_resource_governance.sql`
- `0025_integrations_usage_acl_hardening.sql`
- `0026_public_default_acl_baseline.sql`
- `0027_editorial_artifacts_workflow_serp.sql`
- `0028_editorial_documents_and_views.sql`
- `0029_editorial_publication_records.sql`
- `0030_brand_exceptional_operation_grants.sql`
- `0032_structural_legacy_cleanup.sql`
- `0033_google_ads_canonical_binding_configuration.sql`
- `0034_google_ads_platform_distribution_secret_store.sql`
- `0035_remove_tenant_0005_migration_guard.sql`
- `0036_rename_minerador_keyword_entities.sql`
- `0037_agency_access_periods.sql`
- `0038_remove_legacy_minerador_discovery_import_rpc.sql`
- `0039_trusted_invite_confirmed_agency_name.sql`
- `0040_minerador_discovery_multi_source.sql`
- `0041_google_ads_research_persistence_constraints.sql`
- `0042_google_ads_infrastructure_usage_ledger.sql`
- `0043_google_ads_metrics_currency_compatibility.sql`
- `0044_google_ads_metrics_time_zone_compatibility.sql`
- `0045_profile_avatar_storage.sql`
- `0046_minerador_keyword_delete_lifecycle.sql`
- `0047_global_lifecycle_delete_recovery_purge.sql`
- `20260817231313_master_refresh_batch_2_security_hardening.sql`
- `20260817233939_master_refresh_batch_3_editorial_contract_alignment.sql`
- `20260818000454_master_refresh_batch_4_google_ads_legacy_removal.sql`
- `20260818011009_master_refresh_batch_6_drop_migration_backup.sql`
- `20260824185700_dataforseo_serp_compatibility_operation.sql`
- `20260825090000_google_cloud_media_capabilities.sql`
- `20260825150000_telegram_expert_contribution_platform_foundation.sql`
- `20260826225145_internal_link_graph_foundation.sql`
- `20260826225154_silo_pair_atomicity.sql`
- `20260827032222_internal_link_graph_runtime_advisory_lock.sql`
- `20260827044408_internal_link_graph_integrity_guards.sql`
- `20260828090000_brand_skills_persistence.sql`
- `20260828234500_keyword_semantic_qualification_artifact.sql`
- `20260828235500_keyword_contextual_presentation_artifact.sql`
- `20260829120000_article_architecture_ai_review_artifact.sql`
- `20260902120000_brand_site_canonical_persistence.sql`
- `20260902130000_brand_site_sync_finalization_atomic.sql`
- `20260902140000_silo_pair_territory_consolidation_atomic.sql`
- `20260902150000_silo_working_copy_transactional_writers.sql`
