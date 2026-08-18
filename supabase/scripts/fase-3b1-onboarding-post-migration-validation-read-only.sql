-- Fase 3B.1: somente leitura. Executar manualmente depois de aplicar a 0018.
WITH objects AS (
  SELECT
    to_regclass('public.agency_applications') IS NOT NULL AS applications_present,
    to_regclass('public.agency_invitations') IS NOT NULL AS invitations_present,
    to_regclass('public.agency_onboardings') IS NOT NULL AS onboardings_present,
    to_regprocedure('public.approve_agency_application(uuid,uuid,text,timestamptz)') IS NOT NULL AS approval_function_present,
    to_regprocedure('public.complete_agency_onboarding(uuid,uuid,uuid,text)') IS NOT NULL AS onboarding_function_present,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agency_applications'::regclass) AS applications_rls,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agency_invitations'::regclass) AS invitations_rls,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agency_onboardings'::regclass) AS onboardings_rls,
    NOT has_function_privilege('anon', 'public.approve_agency_application(uuid,uuid,text,timestamptz)', 'EXECUTE') AS approval_anon_execute_revoked,
    NOT has_function_privilege('authenticated', 'public.complete_agency_onboarding(uuid,uuid,uuid,text)', 'EXECUTE') AS onboarding_authenticated_execute_revoked
)
SELECT *, CASE WHEN applications_present AND invitations_present AND onboardings_present AND approval_function_present AND onboarding_function_present AND applications_rls AND invitations_rls AND onboardings_rls AND approval_anon_execute_revoked AND onboarding_authenticated_execute_revoked
  THEN 'READY'
  ELSE 'BLOCKED'
END AS post_migration_status
FROM objects;
