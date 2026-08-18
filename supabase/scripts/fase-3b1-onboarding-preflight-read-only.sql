-- Fase 3B.1: somente leitura. Executar manualmente antes de aplicar a 0018.
WITH required_contracts AS (
  SELECT
    to_regclass('public.agencies') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id' AND is_nullable = 'NO') AS agencies_owner_ready,
    to_regclass('public.agency_applications') IS NULL AS applications_absent,
    to_regclass('public.agency_invitations') IS NULL AS invitations_absent,
    to_regclass('public.agency_onboardings') IS NULL AS onboardings_absent,
    to_regprocedure('public.approve_agency_application(uuid,uuid,text,timestamptz)') IS NULL AS approval_function_absent,
    to_regprocedure('public.complete_agency_onboarding(uuid,uuid,uuid,text)') IS NULL AS onboarding_function_absent
)
SELECT agencies_owner_ready,
       invitations_absent,
       onboardings_absent,
       applications_absent,
       approval_function_absent,
       onboarding_function_absent,
       CASE WHEN agencies_owner_ready AND applications_absent AND invitations_absent AND onboardings_absent AND approval_function_absent AND onboarding_function_absent
         THEN 'READY_FOR_0018_REVIEW'
         ELSE 'BLOCKED_OR_ALREADY_APPLIED'
       END AS preflight_status
FROM required_contracts;
