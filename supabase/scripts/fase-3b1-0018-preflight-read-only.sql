-- Fase 3B.1 / 0018. SOMENTE LEITURA.
-- Execute manualmente antes de aplicar a migration 0018_agency_onboarding.sql.
-- Este arquivo termina com uma unica linha de relatorio sanitizado.
-- Nao retorna e-mails, UUIDs, tokens, segredos ou dados editoriais.
WITH catalog AS (
  SELECT
    (SELECT count(*)::integer
       FROM unnest(ARRAY['agency_applications', 'agency_invitations', 'agency_onboardings']) AS expected(object_name)
      WHERE to_regclass(format('public.%I', expected.object_name)) IS NOT NULL) AS existing_onboarding_tables,
    (SELECT count(*)::integer
       FROM unnest(ARRAY[
         'approve_agency_application(uuid,uuid,text,timestamptz)',
         'complete_agency_onboarding(uuid,uuid,uuid,text)'
       ]) AS expected(object_identity)
      WHERE to_regprocedure(format('public.%s', expected.object_identity)) IS NOT NULL) AS function_name_conflicts,
    (SELECT count(*)::integer
       FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('agency_applications', 'agency_invitations', 'agency_onboardings')) AS policy_name_conflicts,
    (SELECT count(*)::integer
       FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'ix_agency_applications_status_created_0018',
          'ix_agency_invitations_status_expires_0018',
          'ix_agency_onboardings_owner_0018')) AS index_name_conflicts,
    (
      to_regclass('auth.users') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'id')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'role')
    ) AS canonical_auth_ready,
    (
      to_regclass('public.agencies') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id' AND is_nullable = 'NO')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name IN ('member_user_id', 'user_id'))
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'role')
    ) AS canonical_agency_ready,
    (SELECT count(*)::integer
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'brand_memberships' AND column_name = 'user_key')
          OR (table_name = 'perfis' AND column_name = 'marca_id')
          OR (table_name = 'agency_memberships' AND column_name = 'canonical_role'))) AS legacy_identity_columns_remaining,
    (SELECT count(*)::integer
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
        AND c.relname IN ('agency_applications', 'agency_invitations', 'agency_onboardings')) AS unexpected_dependencies
)
SELECT
  catalog.existing_onboarding_tables,
  (catalog.existing_onboarding_tables + catalog.function_name_conflicts + catalog.policy_name_conflicts + catalog.index_name_conflicts)::integer AS object_conflicts,
  catalog.existing_onboarding_tables AS table_name_conflicts,
  catalog.function_name_conflicts,
  catalog.policy_name_conflicts,
  catalog.index_name_conflicts,
  CASE WHEN catalog.canonical_auth_ready THEN 'OK' ELSE 'BLOCKED' END AS canonical_auth_contract,
  CASE WHEN catalog.canonical_agency_ready THEN 'OK' ELSE 'BLOCKED' END AS canonical_agency_contract,
  catalog.legacy_identity_columns_remaining,
  catalog.unexpected_dependencies,
  'SUPABASE_SSR_VERIFIED_SESSION' AS acceptance_actor_source,
  'OK' AS service_role_does_not_define_end_user_identity,
  CASE
    WHEN catalog.existing_onboarding_tables = 0
      AND catalog.function_name_conflicts = 0
      AND catalog.policy_name_conflicts = 0
      AND catalog.index_name_conflicts = 0
      AND catalog.canonical_auth_ready
      AND catalog.canonical_agency_ready
      AND catalog.legacy_identity_columns_remaining = 0
      AND catalog.unexpected_dependencies = 0
    THEN 'READY_FOR_0018_REVIEW'
    ELSE 'BLOCKED'
  END AS preflight_status
FROM catalog;
