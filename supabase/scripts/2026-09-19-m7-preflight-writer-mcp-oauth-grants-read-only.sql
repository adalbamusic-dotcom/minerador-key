-- =============================================================================
-- M7 · PREFLIGHT (somente leitura) — antes de 20260919120000_m7_writer_mcp_oauth_grants.sql
-- =============================================================================
-- Versão 2026-09-19-v1. Um único result set. Nenhuma escrita.
-- Executar: npx supabase db query --linked -f supabase/scripts/2026-09-19-m7-preflight-writer-mcp-oauth-grants-read-only.sql
-- Todos os `verdict` devem ser PASS antes de aplicar a M7.
-- =============================================================================

SELECT jsonb_pretty(jsonb_build_object(
  'version', '2026-09-19-v1',
  'checks', jsonb_build_array(
    (SELECT jsonb_build_object('check_name', 'writer_mcp_delegations_exists', 'expected', true,
      'observed', to_regclass('public.writer_mcp_delegations') IS NOT NULL,
      'verdict', CASE WHEN to_regclass('public.writer_mcp_delegations') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_call_events_exists', 'expected', true,
      'observed', to_regclass('public.writer_mcp_call_events') IS NOT NULL,
      'verdict', CASE WHEN to_regclass('public.writer_mcp_call_events') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'integration_connections_exists', 'expected', true,
      'observed', to_regclass('public.integration_connections') IS NOT NULL,
      'verdict', CASE WHEN to_regclass('public.integration_connections') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'writer_mcp_grants_absent', 'expected', true,
      'observed', to_regclass('public.writer_mcp_grants') IS NULL,
      'verdict', CASE WHEN to_regclass('public.writer_mcp_grants') IS NULL THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_grant_id_absent', 'expected', true,
      'observed', NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'grant_id'),
      'verdict', CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'grant_id') THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_delegation_id_not_null_today', 'expected', 'NO',
      'observed', (SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'delegation_id'),
      'verdict', CASE WHEN (SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'delegation_id') = 'NO' THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'call_events_append_only_trigger', 'expected', true,
      'observed', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'writer_mcp_call_events_append_only_trg' AND NOT tgisinternal),
      'verdict', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'writer_mcp_call_events_append_only_trg' AND NOT tgisinternal) THEN 'PASS' ELSE 'FAIL' END)),
    (SELECT jsonb_build_object('check_name', 'existing_call_events_count', 'expected', 'informativo',
      'observed', (SELECT count(*) FROM public.writer_mcp_call_events), 'verdict', 'INFO')),
    (SELECT jsonb_build_object('check_name', 'existing_delegations_count', 'expected', 'informativo',
      'observed', (SELECT count(*) FROM public.writer_mcp_delegations), 'verdict', 'INFO'))
  )
));
