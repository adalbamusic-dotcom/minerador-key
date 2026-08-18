-- Fase 3B.1 / 0018. SOMENTE LEITURA.
-- Execute manualmente imediatamente apos a aplicacao bem-sucedida da 0018.
-- Nao retorna e-mails, UUIDs, tokens, segredos ou dados editoriais.
WITH objects AS (
  SELECT
    to_regclass('public.agency_applications') IS NOT NULL AS applications_present,
    to_regclass('public.agency_invitations') IS NOT NULL AS invitations_present,
    to_regclass('public.agency_onboardings') IS NOT NULL AS onboardings_present,
    to_regprocedure('public.approve_agency_application(uuid,uuid,text,timestamp with time zone)') IS NOT NULL AS approval_function_present,
    to_regprocedure('public.complete_agency_onboarding(uuid,uuid,uuid,text)') IS NOT NULL AS completion_function_present
),
columns_and_checks AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_invitations' AND column_name = 'token_hash' AND is_nullable = 'NO')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_invitations' AND column_name IN ('token', 'raw_token', 'invite_token'))
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agency_invitations'::regclass AND pg_get_constraintdef(oid) ILIKE '%char_length(token_hash) = 64%') AS token_hash_only,
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agency_invitations'::regclass AND pg_get_constraintdef(oid) ILIKE '%PENDING%ACCEPTED%EXPIRED%REVOKED%')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agency_invitations'::regclass AND pg_get_constraintdef(oid) ILIKE '%ADMIN_INVITE%PUBLIC_APPLICATION%')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agency_invitations'::regclass AND pg_get_constraintdef(oid) ILIKE '%status <> ''ACCEPTED''%') AS invitation_status_ready,
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agency_applications'::regclass AND pg_get_constraintdef(oid) ILIKE '%PENDING%APPROVED%REJECTED%') AS application_status_ready,
    (SELECT count(*) = 0 FROM public.agency_applications WHERE plan_code <> 'FREE')
      AND (SELECT count(*) = 0 FROM public.agency_invitations WHERE plan_code <> 'FREE')
      AND (SELECT count(*) = 0 FROM public.agency_onboardings WHERE plan_code <> 'FREE') AS plan_free_ready
),
access_state AS (
  SELECT
    (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.agency_applications'::regclass)
      AND NOT has_table_privilege('anon', 'public.agency_applications', 'SELECT')
      AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'agency_applications' AND grantee = 'PUBLIC' AND privilege_type = 'SELECT')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_applications') AS application_read_denied,
    (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.agency_invitations'::regclass)
      AND NOT has_table_privilege('anon', 'public.agency_invitations', 'SELECT')
      AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'agency_invitations' AND grantee = 'PUBLIC' AND privilege_type = 'SELECT')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_invitations') AS invitation_read_denied
),
function_state AS (
  SELECT count(*) FILTER (
    WHERE p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) setting_value WHERE setting_value = 'search_path=pg_catalog, public, pg_temp')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) = 2 AS functions_secure
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('approve_agency_application', 'complete_agency_onboarding')
),
agency_state AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id' AND is_nullable = 'NO')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'member_user_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'role') AS agency_contract_ready,
    to_regclass('auth.users') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'id')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'role') AS auth_contract_ready
)
SELECT
  CASE WHEN objects.applications_present AND objects.onboardings_present THEN 'OK' ELSE 'BLOCKED' END AS agency_applications_contract,
  CASE WHEN objects.invitations_present AND objects.onboardings_present THEN 'OK' ELSE 'BLOCKED' END AS agency_invitations_contract,
  CASE WHEN access_state.application_read_denied THEN 'DENIED' ELSE 'BLOCKED' END AS public_application_read_access,
  CASE WHEN access_state.invitation_read_denied THEN 'DENIED' ELSE 'BLOCKED' END AS public_invitation_read_access,
  CASE WHEN columns_and_checks.token_hash_only THEN 'HASH_ONLY' ELSE 'BLOCKED' END AS invitation_token_storage,
  CASE WHEN columns_and_checks.invitation_status_ready THEN 'OK' ELSE 'BLOCKED' END AS invitation_status_contract,
  CASE WHEN columns_and_checks.application_status_ready THEN 'OK' ELSE 'BLOCKED' END AS application_status_contract,
  CASE WHEN columns_and_checks.plan_free_ready THEN 'OK' ELSE 'BLOCKED' END AS plan_free_contract,
  CASE WHEN agency_state.agency_contract_ready THEN 'OK' ELSE 'BLOCKED' END AS canonical_agency_contract,
  CASE WHEN agency_state.auth_contract_ready THEN 'OK' ELSE 'BLOCKED' END AS canonical_auth_contract,
  CASE
    WHEN objects.applications_present AND objects.invitations_present AND objects.onboardings_present
      AND objects.approval_function_present AND objects.completion_function_present
      AND access_state.application_read_denied AND access_state.invitation_read_denied
      AND columns_and_checks.token_hash_only AND columns_and_checks.invitation_status_ready
      AND columns_and_checks.application_status_ready AND columns_and_checks.plan_free_ready
      AND function_state.functions_secure AND agency_state.agency_contract_ready AND agency_state.auth_contract_ready
    THEN 'READY'
    ELSE 'BLOCKED'
  END AS post_migration_status
FROM objects, columns_and_checks, access_state, function_state, agency_state;
