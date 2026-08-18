-- 0039 — Trusted invite: confirmed Agency name
--
-- Successor of 0037. The existing 0037 RPC remains immutable and continues
-- to own the canonical onboarding write sequence. This wrapper locks and
-- canonicalizes the invited name before delegating to that RPC in the same
-- PostgreSQL transaction.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.agency_invitations') IS NULL
     OR to_regclass('public.agency_onboardings') IS NULL
     OR to_regclass('public.agencies') IS NULL
     OR to_regclass('public.agency_memberships') IS NULL
     OR to_regclass('public.agency_access_periods') IS NULL
     OR to_regclass('auth.users') IS NULL
     OR to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NULL
  THEN
    RAISE EXCEPTION 'TRUSTED_INVITE_0039_REQUIRED_CONTRACT_MISSING';
  END IF;

  IF to_regprocedure('public.complete_agency_onboarding_with_confirmed_agency_name(uuid,uuid,uuid,text,text,text)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'TRUSTED_INVITE_0039_ALREADY_APPLIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = 'public.agency_invitations'::regclass
      AND a.attname = 'proposed_agency_name'
      AND a.atttypid = 'text'::regtype
      AND a.attnotnull
      AND NOT a.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = 'public.agency_invitations'::regclass
      AND a.attname = 'access_expires_at'
      AND a.atttypid = 'timestamptz'::regtype
      AND NOT a.attisdropped
  )
  THEN
    RAISE EXCEPTION 'TRUSTED_INVITE_0039_INVITATION_COLUMNS_MISSING';
  END IF;
END;
$$;

CREATE FUNCTION public.complete_agency_onboarding_with_confirmed_agency_name(
  p_idempotency_key uuid,
  p_owner_user_id uuid,
  p_invitation_id uuid,
  p_agency_slug text,
  p_token_hash text,
  p_confirmed_agency_name text
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
  owner_email text;
  confirmed_name text;
  activation_at timestamptz := now();
BEGIN
  IF p_idempotency_key IS NULL
     OR p_owner_user_id IS NULL
     OR p_invitation_id IS NULL
  THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVALID_INPUT';
  END IF;

  PERFORM public.canonical_assert_rpc_actor(p_owner_user_id);

  -- The same key is the idempotency boundary. A successful retry reads the
  -- existing result and cannot rename the already-created Agency.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 37038));

  SELECT *
    INTO existing
  FROM public.agency_onboardings AS ao
  WHERE ao.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF existing.owner_user_id <> p_owner_user_id
       OR existing.invitation_id IS DISTINCT FROM p_invitation_id
       OR existing.onboarding_source <> 'ADMIN_INVITE'
    THEN
      RAISE EXCEPTION 'AGENCY_ONBOARDING_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.complete_agency_onboarding_with_access(
      p_idempotency_key,
      p_owner_user_id,
      p_invitation_id,
      p_agency_slug,
      p_token_hash
    );
    RETURN;
  END IF;

  confirmed_name := btrim(coalesce(p_confirmed_agency_name, ''));
  IF char_length(confirmed_name) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVALID_AGENCY_NAME';
  END IF;

  IF p_agency_slug IS NULL OR p_agency_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVALID_SLUG';
  END IF;

  IF p_token_hash IS NOT NULL AND p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_TOKEN_INVALID';
  END IF;

  SELECT lower(u.email)
    INTO owner_email
  FROM auth.users AS u
  WHERE u.id = p_owner_user_id;

  IF owner_email IS NULL THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_OWNER_INVALID';
  END IF;

  -- Lock the invitation before changing its proposal. A second idempotency
  -- key for the same invitation therefore observes ACCEPTED after the first
  -- call commits and cannot create a second Agency or rename the first one.
  SELECT *
    INTO invitation
  FROM public.agency_invitations AS ai
  WHERE ai.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND
     OR invitation.source <> 'ADMIN_INVITE'
     OR invitation.status <> 'PENDING'
     OR invitation.expires_at <= activation_at
     OR invitation.access_expires_at IS NULL
     OR invitation.access_expires_at <= activation_at
  THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_TRUSTED_INVITE_UNAVAILABLE';
  END IF;

  IF invitation.destination_email <> owner_email THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_FORBIDDEN';
  END IF;

  UPDATE public.agency_invitations AS ai
  SET proposed_agency_name = confirmed_name,
      updated_at = activation_at
  WHERE ai.id = invitation.id
    AND ai.status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_TRUSTED_INVITE_UNAVAILABLE';
  END IF;

  -- 0037 performs the complete atomic write: Agency, owner membership,
  -- onboarding record, access period, invitation acceptance, and token use.
  -- The call is inside this function's transaction; any downstream error
  -- rolls back the name update as well.
  RETURN QUERY
  SELECT *
  FROM public.complete_agency_onboarding_with_access(
    p_idempotency_key,
    p_owner_user_id,
    p_invitation_id,
    p_agency_slug,
    p_token_hash
  );
END;
$$;

ALTER FUNCTION public.complete_agency_onboarding_with_confirmed_agency_name(
  uuid, uuid, uuid, text, text, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.complete_agency_onboarding_with_confirmed_agency_name(
  uuid, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.complete_agency_onboarding_with_confirmed_agency_name(
  uuid, uuid, uuid, text, text, text
) TO service_role;

COMMIT;
