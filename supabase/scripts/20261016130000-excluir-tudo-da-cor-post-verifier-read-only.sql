-- =============================================================================
-- CONFERÊNCIA (SÓ LEITURA) de 20261016130000_excluir_tudo_da_cor.sql (M-E)
-- SDD: docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md, §18.7
--
--   npx supabase db query --linked -f supabase/scripts/20261016130000-excluir-tudo-da-cor-post-verifier-read-only.sql
--
-- Só SELECT. Uma linha, um jsonb (o `db query -f` devolve só o último resultado).
-- Esperado (depois de aplicar): as duas funções com SECURITY DEFINER, executáveis só por
-- service_role (anon/authenticated = false), contratoMaxIds100 = true,
-- liberaAntesDeExcluir = true, os seis gatilhos de minerador_keywords ligados,
-- exclusaoComum = true e historicoRemoto = true (depois do migration repair).
-- Antes de aplicar: funcoes/contratoMaxIds100/liberaAntesDeExcluir = null (conferido em 2026-10-14).
-- =============================================================================
SELECT jsonb_build_object(
  'funcoes', (SELECT jsonb_agg(jsonb_build_object(
      'assinatura', p.oid::regprocedure::text,
      'securityDefiner', p.prosecdef,
      'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'serviceRole', has_function_privilege('service_role', p.oid, 'EXECUTE')) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('lifecycle_delete_group_keywords', 'lifecycle_delete_group_keywords_contract')),
  'contratoMaxIds100', (SELECT bool_or(p.prosrc LIKE '%''maxIds'', 100%') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'lifecycle_delete_group_keywords_contract'),
  'liberaAntesDeExcluir', (SELECT bool_or(position('UPDATE public.minerador_keywords k' in p.prosrc) > 0
      AND position('UPDATE public.minerador_keywords k' in p.prosrc) < position('public.lifecycle_delete_minerador_keywords(' in p.prosrc))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'lifecycle_delete_group_keywords'),
  'gatilhosMineradorKeywords', (SELECT jsonb_agg(jsonb_build_object('nome', t.tgname, 'ligado', t.tgenabled = 'O') ORDER BY t.tgname)
    FROM pg_trigger t WHERE t.tgrelid = 'public.minerador_keywords'::regclass AND NOT t.tgisinternal),
  'exclusaoComum', to_regprocedure('public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean)') IS NOT NULL,
  'historicoRemoto', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261016130000')
) AS conferencia;
