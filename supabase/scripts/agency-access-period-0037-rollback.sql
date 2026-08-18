-- Artefato local/documental. Nao executar automaticamente.
-- So e seguro antes de qualquer convite trusted novo ou access period real.
BEGIN;

DO $$
DECLARE
  access_period_count bigint;
  access_expiry_value_count bigint;
BEGIN
  IF to_regclass('public.agency_access_periods') IS NULL
     OR to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)') IS NULL
  THEN
    RAISE EXCEPTION 'AGENCY_ACCESS_0037_ROLLBACK_PRECONDITION_MISSING';
  END IF;

  SELECT count(*) INTO access_period_count
  FROM public.agency_access_periods;
  IF access_period_count <> 0 THEN
    RAISE EXCEPTION 'AGENCY_ACCESS_0037_ROLLBACK_BLOCKED_BY_ACCESS_PERIOD_DATA';
  END IF;

  SELECT count(*) INTO access_expiry_value_count
  FROM public.agency_invitations
  WHERE access_expires_at IS NOT NULL;
  IF access_expiry_value_count <> 0 THEN
    RAISE EXCEPTION 'AGENCY_ACCESS_0037_ROLLBACK_BLOCKED_BY_TRUSTED_INVITE_DATA';
  END IF;
END;
$$;

DROP FUNCTION public.complete_agency_onboarding_authenticated_with_access(uuid, uuid, uuid, text);
DROP FUNCTION public.complete_agency_onboarding_with_access(uuid, uuid, uuid, text, text);
DROP TABLE public.agency_access_periods;
ALTER TABLE public.agency_invitations
  DROP CONSTRAINT ck_agency_invitations_trusted_access_expiry_0037;
ALTER TABLE public.agency_invitations
  DROP COLUMN access_expires_at;

COMMIT;
