-- 0020 rollback preflight. READ-ONLY: no schema or data mutation.
-- Operational rollback is separate: stop dispatch invocation and disable the
-- communication configuration manually. This script never touches messages,
-- delivery events, invitations, agencies, Auth, Vault, or provider state.
SELECT
  to_regclass('public.communication_templates') AS communication_templates,
  to_regclass('public.communication_messages') AS communication_messages,
  to_regclass('public.communication_delivery_events') AS communication_delivery_events,
  to_regclass('public.agency_invitation_token_generations') AS token_generations,
  to_regclass('public.agency_invitations') AS agency_invitations,
  to_regprocedure('public.create_agency_invitation_token_generation(uuid,text)') AS token_generation_function,
  to_regprocedure('public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)') AS onboarding_function;

SELECT
  (SELECT count(*) FROM public.communication_templates) AS template_rows,
  (SELECT count(*) FROM public.communication_messages) AS message_rows,
  (SELECT count(*) FROM public.communication_delivery_events) AS delivery_event_rows,
  (SELECT count(*) FROM public.agency_invitation_token_generations) AS token_generation_rows;

SELECT CASE
  WHEN to_regclass('public.communication_templates') IS NULL
    OR to_regclass('public.communication_messages') IS NULL
    OR to_regclass('public.communication_delivery_events') IS NULL
    OR to_regclass('public.agency_invitation_token_generations') IS NULL
    THEN 'NOT_APPLIED_OR_ALREADY_REMOVED'
  WHEN (SELECT count(*) FROM public.communication_templates)
     + (SELECT count(*) FROM public.communication_messages)
     + (SELECT count(*) FROM public.communication_delivery_events)
     + (SELECT count(*) FROM public.agency_invitation_token_generations) = 0
    THEN 'SAFE_TO_REVIEW_SCHEMA_REMOVAL'
  ELSE 'BLOCKED_DATA_PRESENT'
END AS rollback_status;
