-- =============================================================================
-- M7 · POST-VERIFIER (somente leitura) — depois de 20260919120000_m7_writer_mcp_oauth_grants.sql
-- =============================================================================
-- Versão 2026-09-19-v1. Um único result set. Nenhuma escrita.
-- Executar: npx supabase db query --linked -f supabase/scripts/2026-09-19-m7-post-verifier-writer-mcp-oauth-grants-read-only.sql
-- =============================================================================

WITH grant_privs AS (
  SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'writer_mcp_grants'
  GROUP BY grantee
)
SELECT jsonb_pretty(jsonb_build_object(
  'version', '2026-09-19-v1',
  'checks', jsonb_build_array(
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_exists', 'expected', true,
      'observed', to_regclass('public.writer_mcp_grants') IS NOT NULL,
      'verdict', CASE WHEN to_regclass('public.writer_mcp_grants') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_column_count', 'expected', 14,
      'observed', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'writer_mcp_grants'),
      'verdict', CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'writer_mcp_grants') = 14 THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_active_unique_index', 'expected', true,
      'observed', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'writer_mcp_grants_active_uidx'),
      'verdict', CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'writer_mcp_grants_active_uidx') THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_rls_enabled', 'expected', true,
      'observed', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.writer_mcp_grants'::regclass),
      'verdict', CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.writer_mcp_grants'::regclass) THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_policies', 'expected', 0,
      'observed', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'writer_mcp_grants'),
      'verdict', CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'writer_mcp_grants') = 0 THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_service_role_privs', 'expected', 'INSERT,SELECT,UPDATE',
      'observed', (SELECT privs FROM grant_privs WHERE grantee = 'service_role'),
      'verdict', CASE WHEN (SELECT privs FROM grant_privs WHERE grantee = 'service_role') = 'INSERT,SELECT,UPDATE' THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_anon_authenticated_privs', 'expected', 'nenhum',
      'observed', COALESCE((SELECT string_agg(grantee || ':' || privs, ';') FROM grant_privs WHERE grantee IN ('anon', 'authenticated', 'PUBLIC')), 'nenhum'),
      'verdict', CASE WHEN NOT EXISTS (SELECT 1 FROM grant_privs WHERE grantee IN ('anon', 'authenticated', 'PUBLIC')) THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_grant_id_exists', 'expected', true,
      'observed', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'grant_id'),
      'verdict', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'grant_id') THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_delegation_id_nullable', 'expected', 'YES',
      'observed', (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'delegation_id'),
      'verdict', CASE WHEN (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'delegation_id') = 'YES' THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_principal_check', 'expected', true,
      'observed', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'writer_mcp_call_events_principal_check'),
      'verdict', CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'writer_mcp_call_events_principal_check') THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_rows_without_principal', 'expected', 0,
      'observed', (SELECT count(*) FROM public.writer_mcp_call_events WHERE delegation_id IS NULL AND grant_id IS NULL),
      'verdict', CASE WHEN (SELECT count(*) FROM public.writer_mcp_call_events WHERE delegation_id IS NULL AND grant_id IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_append_only_trigger_preserved', 'expected', true,
      'observed', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'writer_mcp_call_events_append_only_trg' AND NOT tgisinternal),
      'verdict', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'writer_mcp_call_events_append_only_trg' AND NOT tgisinternal) THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_rows', 'expected', 'informativo',
      'observed', (SELECT count(*) FROM public.writer_mcp_grants), 'verdict', 'INFO'))
  )
));
