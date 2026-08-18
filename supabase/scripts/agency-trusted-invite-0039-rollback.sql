-- 0039 structural rollback template — MANUAL ONLY.
--
-- Execute only while the successor RPC is unused and the application has not
-- been switched to it. This rollback removes no business rows and does not
-- alter 0037. Review and authorize the operation separately before running.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure(
    'public.complete_agency_onboarding_with_confirmed_agency_name(uuid,uuid,uuid,text,text,text)'
  ) IS NULL
  THEN
    RAISE EXCEPTION 'TRUSTED_INVITE_0039_ROLLBACK_SUCCESSOR_MISSING';
  END IF;
END;
$$;

DROP FUNCTION public.complete_agency_onboarding_with_confirmed_agency_name(
  uuid, uuid, uuid, text, text, text
);

COMMIT;
