-- ============================================================================
-- F7 · Aposentar o Planejador — migration final
-- SDD: docs/compartilhado/sdd-aposentar-planejador-2026-10-01.md
-- Rollback: supabase/rollback/20261001120000_aposentar_planejador.rollback.sql
--
-- APLICAR SÓ DEPOIS DO DEPLOY DE F6 (o código para de ler/escrever as colunas
-- content_plan_version_id e o tipo content_plan). Pelo usuário:
--   npx supabase db query --linked -f supabase/migrations/20261001120000_aposentar_planejador.sql
--   npx supabase migration repair --status applied 20261001120000
-- NUNCA `supabase db push`.
--
-- Preflight de 2026-10-01 (só leitura): todas as contagens em 0 — nenhum
-- content_plan, planner, sent_planner, documento/publicação com plano,
-- permissão, saved view ou capability de agência 'planejador'. Nenhuma policy
-- usa editorial_stage_module/editorial_artifact_module. Por isso os CHECKs são
-- trocados sem migrar dado. Os guardas abaixo abortam se isso mudar.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.editorial_artifact_versions WHERE artifact_type = 'content_plan') > 0
     OR (SELECT count(*) FROM public.brand_member_permissions WHERE module = 'planejador') > 0
     OR (SELECT count(*) FROM public.editorial_saved_views WHERE module = 'planejador') > 0
     OR (SELECT count(*) FROM public.content_documents WHERE content_plan_version_id IS NOT NULL) > 0
     OR (SELECT count(*) FROM public.publication_records WHERE content_plan_version_id IS NOT NULL) > 0
     OR (SELECT count(*) FROM public.agency_membership_capabilities WHERE capability = 'planejador') > 0 THEN
    RAISE EXCEPTION 'Aposentar o Planejador: há dado do Planejador no banco; rode o preflight de novo antes desta migration.';
  END IF;
END $$;

-- 1. Permissões por módulo: sem 'planejador' ('administracao' continua).
ALTER TABLE public.brand_member_permissions DROP CONSTRAINT IF EXISTS ck_brand_member_permissions_module_0005;
ALTER TABLE public.brand_member_permissions ADD CONSTRAINT ck_brand_member_permissions_module_0005
  CHECK (module = ANY (ARRAY['marca', 'minerador', 'arquiteto', 'radar', 'redator', 'publicacoes', 'administracao']));

-- 2. Tipos de artefato: sem 'content_plan'.
ALTER TABLE public.editorial_artifact_versions DROP CONSTRAINT IF EXISTS editorial_artifact_versions_artifact_type_check;
ALTER TABLE public.editorial_artifact_versions ADD CONSTRAINT editorial_artifact_versions_artifact_type_check
  CHECK (artifact_type = ANY (ARRAY['article_dna', 'silo_dna', 'silo_page', 'brand_dna', 'brand_skill', 'keyword_semantic_qualification', 'keyword_contextual_presentation', 'article_architecture_ai_review']));

-- 3. Visões salvas: sem 'planejador'.
ALTER TABLE public.editorial_saved_views DROP CONSTRAINT IF EXISTS editorial_saved_views_module_check;
ALTER TABLE public.editorial_saved_views ADD CONSTRAINT editorial_saved_views_module_check
  CHECK (module = ANY (ARRAY['marca', 'minerador', 'arquiteto', 'radar', 'redator', 'publicacoes']));

-- 4. Capability: desativada (a linha fica como histórico; nenhuma agência a usa).
UPDATE public.canonical_capabilities SET active = false WHERE code = 'planejador';

-- 5. Colunas do plano: vazias no preflight; o código deixou de lê-las em F6.
ALTER TABLE public.content_documents DROP COLUMN IF EXISTS content_plan_version_id;
ALTER TABLE public.publication_records DROP COLUMN IF EXISTS content_plan_version_id;

COMMIT;

-- Conferência (único resultado devolvido com -f).
SELECT jsonb_build_object(
  'checks_que_citam_o_planejador', (
    SELECT count(*) FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND con.contype = 'c'
      AND (pg_get_constraintdef(con.oid) ILIKE '%planejador%' OR pg_get_constraintdef(con.oid) ILIKE '%content_plan%')),
  'capability_planejador_ativa', (SELECT count(*) FROM public.canonical_capabilities WHERE code = 'planejador' AND active),
  'colunas_content_plan_version_id', (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'content_plan_version_id')
) AS aposentar_planejador;
