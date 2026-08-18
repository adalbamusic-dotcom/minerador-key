BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  access_expiry_type text;
BEGIN
  IF to_regclass('public.agencies') IS NULL
     OR to_regclass('public.agency_invitations') IS NULL
     OR to_regclass('public.agency_applications') IS NULL
     OR to_regclass('public.agency_onboardings') IS NULL
     OR to_regclass('public.agency_memberships') IS NULL
     OR to_regclass('auth.users') IS NULL
     OR to_regprocedure('public.canonical_assert_rpc_actor(uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'AGENCY_ACCESS_0037_REQUIRED_CONTRACT_MISSING';
  END IF;

  IF to_regclass('public.agency_access_periods') IS NOT NULL
     OR to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'AGENCY_ACCESS_0037_PARTIAL_OR_ALREADY_APPLIED';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO access_expiry_type
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = 'public.agency_invitations'::regclass
    AND a.attname = 'access_expires_at'
    AND NOT a.attisdropped;

  IF access_expiry_type IS NOT NULL THEN
    RAISE EXCEPTION 'AGENCY_ACCESS_0037_PARTIAL_INVITATION_COLUMN';
  END IF;
END;
$$;

ALTER TABLE public.agency_invitations
  ADD COLUMN access_expires_at timestamptz;

ALTER TABLE public.agency_invitations
  ADD CONSTRAINT ck_agency_invitations_trusted_access_expiry_0037
  CHECK (source <> 'ADMIN_INVITE' OR access_expires_at IS NOT NULL)
  NOT VALID;

CREATE TABLE public.agency_access_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL
    CONSTRAINT fk_agency_access_periods_agency_0037
    REFERENCES public.agencies(id) ON DELETE RESTRICT,
  plan_code text NOT NULL DEFAULT 'FREE'
    CONSTRAINT ck_agency_access_periods_plan_0037
    CHECK (plan_code = 'FREE'),
  origin text NOT NULL
    CONSTRAINT ck_agency_access_periods_origin_0037
    CHECK (origin IN ('PUBLIC_FREE_TRIAL', 'ADMIN_TRUSTED_INVITE', 'PLATFORM_INTERNAL')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT ck_agency_access_periods_status_0037
    CHECK (status IN ('active', 'revoked')),
  source_application_id uuid
    CONSTRAINT fk_agency_access_periods_application_0037
    REFERENCES public.agency_applications(id) ON DELETE RESTRICT,
  source_invitation_id uuid
    CONSTRAINT fk_agency_access_periods_invitation_0037
    REFERENCES public.agency_invitations(id) ON DELETE RESTRICT,
  activated_by_actor_user_id uuid
    CONSTRAINT fk_agency_access_periods_activated_by_0037
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_actor_user_id uuid
    CONSTRAINT fk_agency_access_periods_revoked_by_0037
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  revocation_reason text,
  CONSTRAINT ck_agency_access_periods_dates_0037
    CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT ck_agency_access_periods_revocation_0037
    CHECK (
      (status = 'active' AND revoked_at IS NULL AND revoked_by_actor_user_id IS NULL)
      OR
      (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_actor_user_id IS NOT NULL)
    ),
  CONSTRAINT ck_agency_access_periods_provenance_0037
    CHECK (
      (
        origin = 'PUBLIC_FREE_TRIAL'
        AND source_application_id IS NOT NULL
        AND source_invitation_id IS NOT NULL
        AND ends_at IS NOT NULL
      )
      OR
      (
        origin = 'ADMIN_TRUSTED_INVITE'
        AND source_application_id IS NULL
        AND source_invitation_id IS NOT NULL
        AND ends_at IS NOT NULL
      )
      OR
      (
        origin = 'PLATFORM_INTERNAL'
        AND source_application_id IS NULL
        AND source_invitation_id IS NULL
        AND ends_at IS NULL
      )
    ),
  CONSTRAINT ck_agency_access_periods_reason_0037
    CHECK (revocation_reason IS NULL OR char_length(btrim(revocation_reason)) BETWEEN 1 AND 500)
);

CREATE INDEX ix_agency_access_periods_agency_effective_0037
  ON public.agency_access_periods (agency_id, status, starts_at, ends_at);

CREATE UNIQUE INDEX uq_agency_access_periods_invitation_0037
  ON public.agency_access_periods (source_invitation_id)
  WHERE source_invitation_id IS NOT NULL;

ALTER TABLE public.agency_access_periods ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agency_access_periods FROM PUBLIC, anon, authenticated, service_role;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agency_access_periods FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.agency_access_periods TO service_role;

CREATE OR REPLACE FUNCTION public.complete_agency_onboarding_with_access(
  p_idempotency_key uuid,
  p_owner_user_id uuid,
  p_invitation_id uuid,
  p_agency_slug text,
  p_token_hash text
) RETURNS TABLE (
  agency_id uuid,
  agency_name text,
  agency_slug text,
  membership_id uuid,
  access_period_id uuid,
  access_origin text,
  access_starts_at timestamptz,
  access_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing public.agency_onboardings%ROWTYPE;
  invitation public.agency_invitations%ROWTYPE;
  application public.agency_applications%ROWTYPE;
  created_agency public.agencies%ROWTYPE;
  membership public.agency_memberships%ROWTYPE;
  access_period public.agency_access_periods%ROWTYPE;
  owner_email text;
  activation_at timestamptz := now();
  access_origin_value text;
  access_ends_at_value timestamptz;
  source_application_id_value uuid;
BEGIN
  PERFORM public.canonical_assert_rpc_actor(p_owner_user_id);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 37038));

  SELECT *
    INTO existing
  FROM public.agency_onboardings AS ao
  WHERE ao.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF existing.owner_user_id <> p_owner_user_id THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_IDEMPOTENCY_CONFLICT';
    END IF;

    SELECT *
      INTO created_agency
    FROM public.agencies AS a
    WHERE a.id = existing.agency_id;

    SELECT *
      INTO membership
    FROM public.agency_memberships AS am
    WHERE am.agency_id = existing.agency_id
      AND am.user_id = p_owner_user_id
      AND am.role = 'agency_admin'
      AND am.status = 'active'
    LIMIT 1;

    SELECT *
      INTO access_period
    FROM public.agency_access_periods AS ap
    WHERE ap.agency_id = existing.agency_id
      AND ap.source_invitation_id = existing.invitation_id
    ORDER BY ap.created_at DESC
    LIMIT 1;

    IF created_agency.id IS NULL OR membership.id IS NULL OR access_period.id IS NULL THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_ACCESS_INCOMPLETE';
    END IF;

    RETURN QUERY
    SELECT created_agency.id, created_agency.name, created_agency.slug,
      membership.id, access_period.id, access_period.origin,
      access_period.starts_at, access_period.ends_at;
    RETURN;
  END IF;

  SELECT lower(u.email)
    INTO owner_email
  FROM auth.users AS u
  WHERE u.id = p_owner_user_id;

  IF owner_email IS NULL THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_OWNER_INVALID';
  END IF;

  SELECT *
    INTO invitation
  FROM public.agency_invitations AS ai
  WHERE ai.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND
     OR invitation.status = 'REVOKED'
     OR invitation.status = 'EXPIRED'
     OR invitation.expires_at <= activation_at
  THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_UNAVAILABLE';
  END IF;

  IF invitation.status = 'ACCEPTED' THEN
    IF invitation.accepted_by_actor_user_id IS DISTINCT FROM p_owner_user_id THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_FORBIDDEN';
    END IF;

    SELECT *
      INTO existing
    FROM public.agency_onboardings AS ao
    WHERE ao.invitation_id = invitation.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_ACCESS_INCOMPLETE';
    END IF;

    SELECT * INTO created_agency
    FROM public.agencies AS a
    WHERE a.id = existing.agency_id;

    SELECT * INTO membership
    FROM public.agency_memberships AS am
    WHERE am.agency_id = existing.agency_id
      AND am.user_id = p_owner_user_id
      AND am.role = 'agency_admin'
      AND am.status = 'active'
    LIMIT 1;

    SELECT * INTO access_period
    FROM public.agency_access_periods AS ap
    WHERE ap.agency_id = existing.agency_id
      AND ap.source_invitation_id = invitation.id
    ORDER BY ap.created_at DESC
    LIMIT 1;

    IF created_agency.id IS NULL OR membership.id IS NULL OR access_period.id IS NULL THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_ACCESS_INCOMPLETE';
    END IF;

    RETURN QUERY
    SELECT created_agency.id, created_agency.name, created_agency.slug,
      membership.id, access_period.id, access_period.origin,
      access_period.starts_at, access_period.ends_at;
    RETURN;
  END IF;

  IF invitation.destination_email <> owner_email THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_FORBIDDEN';
  END IF;

  IF p_agency_slug IS NULL OR p_agency_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVALID_SLUG';
  END IF;

  IF invitation.source = 'PUBLIC_APPLICATION' THEN
    IF invitation.application_id IS NULL OR NOT invitation.is_operational THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_UNAVAILABLE';
    END IF;

    SELECT *
      INTO application
    FROM public.agency_applications AS aa
    WHERE aa.id = invitation.application_id
    FOR UPDATE;

    IF NOT FOUND OR application.status <> 'APPROVED' THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_APPLICATION_UNAVAILABLE';
    END IF;

    access_origin_value := 'PUBLIC_FREE_TRIAL';
    source_application_id_value := application.id;
    access_ends_at_value := activation_at + interval '30 days';
  ELSIF invitation.source = 'ADMIN_INVITE' THEN
    IF invitation.access_expires_at IS NULL OR invitation.access_expires_at <= activation_at THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_ACCESS_EXPIRED';
    END IF;

    access_origin_value := 'ADMIN_TRUSTED_INVITE';
    source_application_id_value := NULL;
    access_ends_at_value := invitation.access_expires_at;
  ELSE
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_SOURCE_INVALID';
  END IF;

  IF p_token_hash IS NOT NULL THEN
    IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_TOKEN_INVALID';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.agency_invitation_token_generations AS tg
      WHERE tg.invitation_id = invitation.id
        AND tg.token_hash = p_token_hash
        AND tg.expires_at > activation_at
        AND tg.used_at IS NULL
        AND tg.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_TOKEN_INVALID';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text, 37037));

  IF EXISTS (
    SELECT 1
    FROM public.agencies AS a
    WHERE a.owner_user_id = p_owner_user_id
      AND a.status = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.agency_memberships AS am
    JOIN public.agencies AS a ON a.id = am.agency_id
    WHERE am.user_id = p_owner_user_id
      AND am.status = 'active'
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_OWNER_ALREADY_ASSIGNED';
  END IF;

  INSERT INTO public.agencies(name, slug, status, owner_user_id)
  VALUES (btrim(invitation.proposed_agency_name), p_agency_slug, 'active', p_owner_user_id)
  RETURNING * INTO created_agency;

  INSERT INTO public.agency_memberships(agency_id, user_id, role, status)
  VALUES (created_agency.id, p_owner_user_id, 'agency_admin', 'active')
  RETURNING * INTO membership;

  INSERT INTO public.agency_onboardings(
    onboarding_source, idempotency_key, agency_id, owner_user_id, invitation_id, plan_code
  )
  VALUES (
    invitation.source, p_idempotency_key, created_agency.id, p_owner_user_id,
    invitation.id, invitation.plan_code
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(created_agency.id::text, 37037));

  IF EXISTS (
    SELECT 1
    FROM public.agency_access_periods AS ap
    WHERE ap.agency_id = created_agency.id
      AND ap.status = 'active'
      AND ap.starts_at <= activation_at
      AND (ap.ends_at IS NULL OR ap.ends_at > activation_at)
  ) THEN
    RAISE EXCEPTION 'AGENCY_ACCESS_PERIOD_OVERLAP';
  END IF;

  INSERT INTO public.agency_access_periods(
    agency_id, plan_code, origin, starts_at, ends_at, status,
    source_application_id, source_invitation_id, activated_by_actor_user_id
  )
  VALUES (
    created_agency.id, invitation.plan_code, access_origin_value,
    activation_at, access_ends_at_value, 'active',
    source_application_id_value, invitation.id, p_owner_user_id
  )
  RETURNING * INTO access_period;

  UPDATE public.agency_invitations AS ai
  SET status = 'ACCEPTED',
      accepted_at = activation_at,
      accepted_by_actor_user_id = p_owner_user_id,
      agency_id = created_agency.id,
      is_operational = false,
      updated_at = activation_at
  WHERE ai.id = invitation.id;

  IF p_token_hash IS NOT NULL THEN
    UPDATE public.agency_invitation_token_generations AS tg
    SET used_at = activation_at
    WHERE tg.invitation_id = invitation.id
      AND tg.token_hash = p_token_hash
      AND tg.used_at IS NULL
      AND tg.revoked_at IS NULL;
  END IF;

  RETURN QUERY
  SELECT created_agency.id, created_agency.name, created_agency.slug,
    membership.id, access_period.id, access_period.origin,
    access_period.starts_at, access_period.ends_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_agency_onboarding_authenticated_with_access(
  p_idempotency_key uuid,
  p_owner_user_id uuid,
  p_invitation_id uuid,
  p_agency_slug text
) RETURNS TABLE (
  agency_id uuid,
  agency_name text,
  agency_slug text,
  membership_id uuid,
  access_period_id uuid,
  access_origin text,
  access_starts_at timestamptz,
  access_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.complete_agency_onboarding_with_access(
    p_idempotency_key,
    p_owner_user_id,
    p_invitation_id,
    p_agency_slug,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_agency_onboarding_with_access(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_agency_onboarding_authenticated_with_access(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_agency_onboarding_with_access(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_agency_onboarding_authenticated_with_access(uuid, uuid, uuid, text) TO service_role;

COMMIT;
