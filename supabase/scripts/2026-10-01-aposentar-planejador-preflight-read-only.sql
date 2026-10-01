-- ============================================================================
-- PREFLIGHT SOMENTE LEITURA — aposentar o Planejador (SDD 2026-10-01)
-- docs/compartilhado/sdd-aposentar-planejador-2026-10-01.md
--
-- NENHUM comando altera dado, schema, permissão ou storage. Só SELECT.
-- Rodar no SQL Editor (ou `npx supabase db query --linked -f <arquivo>`; com -f
-- só volta o último resultado, então este arquivo junta tudo num SELECT final).
-- O resultado decide a migration M-final da SDD: tudo precisa estar em 0.
-- ============================================================================

WITH contagens AS (
  SELECT 'artifact content_plan' AS item,
         (SELECT count(*) FROM public.editorial_artifact_versions WHERE artifact_type = 'content_plan') AS total
  UNION ALL SELECT 'workflow stage planner',
         (SELECT count(*) FROM public.editorial_workflow_items WHERE stage = 'planner')
  UNION ALL SELECT 'workflow state sent_planner',
         (SELECT count(*) FROM public.editorial_workflow_items WHERE state = 'sent_planner')
  UNION ALL SELECT 'documentos com content_plan_version_id',
         (SELECT count(*) FROM public.content_documents WHERE content_plan_version_id IS NOT NULL)
  UNION ALL SELECT 'publicações com content_plan_version_id',
         (SELECT count(*) FROM public.publication_records WHERE content_plan_version_id IS NOT NULL)
  UNION ALL SELECT 'permissões module=planejador',
         (SELECT count(*) FROM public.brand_member_permissions WHERE module = 'planejador')
  UNION ALL SELECT 'saved views module=planejador',
         (SELECT count(*) FROM public.editorial_saved_views WHERE module = 'planejador')
  UNION ALL SELECT 'capability planejador (ativa)',
         (SELECT count(*) FROM public.canonical_capabilities WHERE code = 'planejador' AND active)
  UNION ALL SELECT 'agency_membership_capabilities planejador',
         (SELECT count(*) FROM public.agency_membership_capabilities WHERE capability = 'planejador')
),
checks AS (
  SELECT rel.relname AS tabela, con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definicao
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public' AND con.contype = 'c'
    AND (pg_get_constraintdef(con.oid) ILIKE '%planejador%' OR pg_get_constraintdef(con.oid) ILIKE '%content_plan%' OR pg_get_constraintdef(con.oid) ILIKE '%planner%')
),
politicas AS (
  SELECT tablename, policyname, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual ILIKE '%editorial_stage_module%' OR qual ILIKE '%editorial_artifact_module%'
      OR with_check ILIKE '%editorial_stage_module%' OR with_check ILIKE '%editorial_artifact_module%')
)
SELECT jsonb_build_object(
  'contagens', (SELECT jsonb_object_agg(item, total) FROM contagens),
  'checks_que_citam_o_planejador', (SELECT coalesce(jsonb_agg(to_jsonb(checks)), '[]'::jsonb) FROM checks),
  'politicas_que_usam_as_funcoes_de_modulo', (SELECT coalesce(jsonb_agg(to_jsonb(politicas)), '[]'::jsonb) FROM politicas)
) AS preflight;
