-- ============================================================================
-- ROLLBACK · Aposentar o Planejador (20261001120000)
-- Devolve os CHECKs, a capability e as colunas content_plan_version_id
-- (nuláveis, com a mesma FK). Nenhum dado é recriado: as colunas voltam vazias,
-- como estavam no preflight de 2026-10-01.
-- Pelo usuário: npx supabase db query --linked -f <este arquivo>
--               npx supabase migration repair --status reverted 20261001120000
-- ============================================================================

BEGIN;

ALTER TABLE public.brand_member_permissions DROP CONSTRAINT IF EXISTS ck_brand_member_permissions_module_0005;
ALTER TABLE public.brand_member_permissions ADD CONSTRAINT ck_brand_member_permissions_module_0005
  CHECK (module = ANY (ARRAY['marca', 'minerador', 'arquiteto', 'radar', 'planejador', 'redator', 'publicacoes', 'administracao']));

ALTER TABLE public.editorial_artifact_versions DROP CONSTRAINT IF EXISTS editorial_artifact_versions_artifact_type_check;
ALTER TABLE public.editorial_artifact_versions ADD CONSTRAINT editorial_artifact_versions_artifact_type_check
  CHECK (artifact_type = ANY (ARRAY['article_dna', 'silo_dna', 'silo_page', 'content_plan', 'brand_dna', 'brand_skill', 'keyword_semantic_qualification', 'keyword_contextual_presentation', 'article_architecture_ai_review']));

ALTER TABLE public.editorial_saved_views DROP CONSTRAINT IF EXISTS editorial_saved_views_module_check;
ALTER TABLE public.editorial_saved_views ADD CONSTRAINT editorial_saved_views_module_check
  CHECK (module = ANY (ARRAY['marca', 'minerador', 'arquiteto', 'radar', 'planejador', 'redator', 'publicacoes']));

UPDATE public.canonical_capabilities SET active = true WHERE code = 'planejador';

ALTER TABLE public.content_documents
  ADD COLUMN IF NOT EXISTS content_plan_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT;
ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS content_plan_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT;

COMMIT;
