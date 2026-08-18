BEGIN;

-- 0018 declared application_id UNIQUE inline. Resolve the real generated
-- constraint/index from the catalog instead of assuming its name.
DO $$
DECLARE
  object_name text;
BEGIN
  FOR object_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'public.agency_invitations'::regclass
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'application_id'
  LOOP
    EXECUTE format('ALTER TABLE public.agency_invitations DROP CONSTRAINT %I', object_name);
  END LOOP;
END;
$$;

DO $$
DECLARE
  object_name text;
BEGIN
  FOR object_name IN
    SELECT indexrelid::regclass::text
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'public.agency_invitations'::regclass
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'application_id'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conindid = i.indexrelid
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', object_name);
  END LOOP;
END;
$$;

ALTER TABLE public.agency_invitations
  ADD COLUMN IF NOT EXISTS is_operational boolean NOT NULL DEFAULT false;

-- 0018 guarantees at most one application invitation. The only deterministic
-- backfill is therefore the existing linked row, independent of name, email,
-- creation date or expiry. ACCEPTED is terminal; other linked rows remain the
-- current lineage candidate until an explicit successor operation replaces it.
UPDATE public.agency_invitations
SET is_operational = (status <> 'ACCEPTED')
WHERE application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_agency_invitations_application_0023
  ON public.agency_invitations(application_id)
  WHERE application_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_invitations_operational_0023
  ON public.agency_invitations(application_id)
  WHERE application_id IS NOT NULL AND is_operational;

CREATE OR REPLACE FUNCTION public.approve_agency_application(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) RETURNS TABLE (invitation_id uuid, proposed_agency_name text, plan_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  application public.agency_applications%ROWTYPE;
  invitation public.agency_invitations%ROWTYPE;
BEGIN
  IF char_length(p_token_hash) <> 64 OR p_expires_at <= now() THEN RAISE EXCEPTION 'AGENCY_APPLICATION_INVALID_INPUT'; END IF;
  SELECT * INTO application FROM public.agency_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND OR application.status = 'REJECTED' THEN RAISE EXCEPTION 'AGENCY_APPLICATION_UNAVAILABLE'; END IF;
  SELECT * INTO invitation FROM public.agency_invitations WHERE application_id = application.id FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'AGENCY_APPLICATION_ALREADY_APPROVED'; END IF;
  IF application.status <> 'PENDING' THEN RAISE EXCEPTION 'AGENCY_APPLICATION_CONFLICT'; END IF;
  INSERT INTO public.agency_invitations(
    destination_email, responsible_name, proposed_agency_name, plan_code,
    source, application_id, invited_by_actor_user_id, expires_at, token_hash,
    is_operational
  )
  VALUES (
    application.destination_email, application.responsible_name,
    application.proposed_agency_name, 'FREE', 'PUBLIC_APPLICATION',
    application.id, p_actor_user_id, p_expires_at, p_token_hash, true
  )
  RETURNING * INTO invitation;
  UPDATE public.agency_applications
  SET status = 'APPROVED', reviewed_by_actor_user_id = p_actor_user_id,
      reviewed_at = now(), updated_at = now()
  WHERE id = application.id;
  RETURN QUERY SELECT invitation.id, invitation.proposed_agency_name, invitation.plan_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_agency_invitation_token_generation(
  p_invitation_id uuid,
  p_token_hash text
) RETURNS TABLE(token_generation integer, token_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  invitation public.agency_invitations%ROWTYPE;
  next_generation integer;
BEGIN
  IF char_length(p_token_hash) <> 64 THEN RAISE EXCEPTION 'AGENCY_INVITATION_TOKEN_HASH_INVALID'; END IF;
  SELECT * INTO invitation FROM public.agency_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND
     OR invitation.status <> 'PENDING'
     OR invitation.expires_at <= now()
     OR (invitation.application_id IS NOT NULL AND NOT invitation.is_operational)
  THEN
    RAISE EXCEPTION 'AGENCY_INVITATION_TOKEN_GENERATION_UNAVAILABLE';
  END IF;
  SELECT greatest(invitation.communication_generation, coalesce(max(generation), 0)) + 1
    INTO next_generation
    FROM public.agency_invitation_token_generations
   WHERE invitation_id = p_invitation_id;
  INSERT INTO public.agency_invitation_token_generations(invitation_id, generation, token_hash, expires_at)
  VALUES (p_invitation_id, next_generation, p_token_hash, invitation.expires_at);
  UPDATE public.agency_invitations
     SET communication_generation = next_generation, updated_at = now()
   WHERE id = p_invitation_id;
  RETURN QUERY SELECT next_generation, invitation.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_agency_invitation(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_policy_expires_at timestamptz,
  p_successor_expires_at timestamptz,
  p_token_hash text,
  p_origin text
) RETURNS TABLE(
  invitation_id uuid,
  application_id uuid,
  renewal_action text,
  communication_message_id uuid,
  message_status text,
  expires_at timestamptz,
  communication_generation integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  application public.agency_applications%ROWTYPE;
  current_invitation public.agency_invitations%ROWTYPE;
  successor public.agency_invitations%ROWTYPE;
  queued_message_id uuid;
  queued_message_status text;
  next_generation integer;
  action text;
BEGIN
  IF p_policy_expires_at <= now()
     OR p_successor_expires_at <= now()
     OR p_successor_expires_at > p_policy_expires_at
     OR char_length(p_token_hash) <> 64
     OR char_length(btrim(coalesce(p_origin, ''))) = 0
  THEN
    RAISE EXCEPTION 'AGENCY_INVITATION_RENEWAL_INVALID_INPUT';
  END IF;

  SELECT * INTO application
  FROM public.agency_applications
  WHERE id = p_application_id
  FOR UPDATE;
  IF NOT FOUND OR application.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'AGENCY_APPLICATION_NOT_APPROVED';
  END IF;

  SELECT * INTO current_invitation
  FROM public.agency_invitations
  WHERE application_id = application.id
    AND is_operational
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.agency_invitations
      WHERE application_id = application.id AND status = 'ACCEPTED'
    ) THEN
      RAISE EXCEPTION 'AGENCY_INVITATION_ACCEPTED_TERMINAL';
    END IF;
    RAISE EXCEPTION 'AGENCY_INVITATION_CURRENT_NOT_FOUND';
  END IF;

  IF current_invitation.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'AGENCY_INVITATION_ACCEPTED_TERMINAL';
  END IF;

  IF current_invitation.status = 'PENDING'
     AND current_invitation.expires_at > now()
     AND current_invitation.expires_at <= p_policy_expires_at
  THEN
    action := 'REUSE_CURRENT_INVITATION';
    next_generation := greatest(current_invitation.communication_generation, 0) + 1;
    UPDATE public.agency_invitations
    SET communication_generation = next_generation, updated_at = now()
    WHERE id = current_invitation.id;

    SELECT m.message_id, m.message_status
      INTO queued_message_id, queued_message_status
      FROM public.enqueue_communication_message(
        'AGENCY_INVITATION', 'agency_invitation', 1,
        current_invitation.destination_email,
        jsonb_build_object(
          'invitationId', current_invitation.id,
          'responsibleName', current_invitation.responsible_name,
          'agencyName', current_invitation.proposed_agency_name,
          'expiresAt', current_invitation.expires_at,
          'origin', p_origin
        ),
        format('agency_invitation:%s:generation:%s', current_invitation.id, next_generation),
        current_invitation.application_id, current_invitation.id, NULL
      ) m;

    RETURN QUERY SELECT current_invitation.id, current_invitation.application_id,
      action, queued_message_id, queued_message_status, current_invitation.expires_at,
      next_generation;
    RETURN;
  END IF;

  UPDATE public.agency_invitations
  SET is_operational = false, updated_at = now()
  WHERE id = current_invitation.id AND is_operational;

  INSERT INTO public.agency_invitations(
    destination_email, responsible_name, proposed_agency_name, plan_code,
    source, application_id, invited_by_actor_user_id, expires_at, status,
    token_hash, is_operational
  )
  VALUES (
    current_invitation.destination_email, current_invitation.responsible_name,
    current_invitation.proposed_agency_name, current_invitation.plan_code,
    current_invitation.source, current_invitation.application_id,
    p_actor_user_id, p_successor_expires_at, 'PENDING', p_token_hash, true
  )
  RETURNING * INTO successor;

  action := 'CREATE_SUCCESSOR_INVITATION';
  SELECT m.message_id, m.message_status
    INTO queued_message_id, queued_message_status
    FROM public.enqueue_communication_message(
      'AGENCY_INVITATION', 'agency_invitation', 1,
      successor.destination_email,
      jsonb_build_object(
        'invitationId', successor.id,
        'responsibleName', successor.responsible_name,
        'agencyName', successor.proposed_agency_name,
        'expiresAt', successor.expires_at,
        'origin', p_origin
      ),
      format('agency_invitation:%s:generation:0', successor.id),
      successor.application_id, successor.id, NULL
    ) m;

  RETURN QUERY SELECT successor.id, successor.application_id, action,
    queued_message_id, queued_message_status, successor.expires_at,
    successor.communication_generation;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_agency_onboarding(
  p_idempotency_key uuid,
  p_owner_user_id uuid,
  p_invitation_id uuid,
  p_agency_slug text
) RETURNS TABLE (agency_id uuid, agency_name text, agency_slug text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing public.agency_onboardings%ROWTYPE;
  invitation public.agency_invitations%ROWTYPE;
  owner_email text;
  created_agency public.agencies%ROWTYPE;
BEGIN
  SELECT * INTO existing FROM public.agency_onboardings WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF existing.owner_user_id <> p_owner_user_id THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN QUERY SELECT a.id, a.name, a.slug FROM public.agencies a WHERE a.id = existing.agency_id;
    RETURN;
  END IF;
  SELECT lower(email) INTO owner_email FROM auth.users WHERE id = p_owner_user_id;
  IF owner_email IS NULL THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_OWNER_INVALID'; END IF;
  SELECT * INTO invitation FROM public.agency_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR invitation.status = 'REVOKED' OR invitation.expires_at <= now()
     OR (invitation.application_id IS NOT NULL AND NOT invitation.is_operational)
  THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_UNAVAILABLE';
  END IF;
  IF invitation.status = 'ACCEPTED' THEN
    IF invitation.accepted_by_actor_user_id <> p_owner_user_id THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_FORBIDDEN'; END IF;
    RETURN QUERY SELECT a.id, a.name, a.slug FROM public.agencies a WHERE a.id = invitation.agency_id;
    RETURN;
  END IF;
  IF invitation.destination_email <> owner_email THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_FORBIDDEN'; END IF;
  IF p_agency_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVALID_SLUG'; END IF;
  INSERT INTO public.agencies(name, slug, status, owner_user_id)
  VALUES (btrim(invitation.proposed_agency_name), p_agency_slug, 'active', p_owner_user_id)
  RETURNING * INTO created_agency;
  INSERT INTO public.agency_onboardings(onboarding_source, idempotency_key, agency_id, owner_user_id, invitation_id, plan_code)
  VALUES (invitation.source, p_idempotency_key, created_agency.id, p_owner_user_id, invitation.id, invitation.plan_code);
  UPDATE public.agency_invitations
  SET status = 'ACCEPTED', accepted_at = now(), accepted_by_actor_user_id = p_owner_user_id,
      agency_id = created_agency.id, is_operational = false, updated_at = now()
  WHERE id = invitation.id;
  RETURN QUERY SELECT created_agency.id, created_agency.name, created_agency.slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_agency_onboarding_with_token(
  p_idempotency_key uuid,
  p_owner_user_id uuid,
  p_invitation_id uuid,
  p_agency_slug text,
  p_token_hash text
) RETURNS TABLE (agency_id uuid, agency_name text, agency_slug text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing public.agency_onboardings%ROWTYPE;
  invitation public.agency_invitations%ROWTYPE;
  owner_email text;
  created_agency public.agencies%ROWTYPE;
BEGIN
  IF char_length(p_token_hash) <> 64 THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_TOKEN_INVALID'; END IF;
  SELECT * INTO existing FROM public.agency_onboardings WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF existing.owner_user_id <> p_owner_user_id THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN QUERY SELECT a.id, a.name, a.slug FROM public.agencies a WHERE a.id = existing.agency_id;
    RETURN;
  END IF;
  SELECT lower(email) INTO owner_email FROM auth.users WHERE id = p_owner_user_id;
  IF owner_email IS NULL THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_OWNER_INVALID'; END IF;
  SELECT * INTO invitation FROM public.agency_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR invitation.status = 'REVOKED' OR invitation.expires_at <= now()
     OR (invitation.application_id IS NOT NULL AND NOT invitation.is_operational)
  THEN
    RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_UNAVAILABLE';
  END IF;
  IF invitation.status = 'ACCEPTED' THEN
    IF invitation.accepted_by_actor_user_id <> p_owner_user_id THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_FORBIDDEN'; END IF;
    RETURN QUERY SELECT a.id, a.name, a.slug FROM public.agencies a WHERE a.id = invitation.agency_id;
    RETURN;
  END IF;
  IF invitation.destination_email <> owner_email THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_FORBIDDEN'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_invitation_token_generations
    WHERE invitation_id = invitation.id
      AND token_hash = p_token_hash
      AND expires_at > now()
      AND used_at IS NULL
      AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_TOKEN_INVALID'; END IF;
  IF p_agency_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVALID_SLUG'; END IF;
  INSERT INTO public.agencies(name, slug, status, owner_user_id)
  VALUES (btrim(invitation.proposed_agency_name), p_agency_slug, 'active', p_owner_user_id)
  RETURNING * INTO created_agency;
  INSERT INTO public.agency_onboardings(onboarding_source, idempotency_key, agency_id, owner_user_id, invitation_id, plan_code)
  VALUES (invitation.source, p_idempotency_key, created_agency.id, p_owner_user_id, invitation.id, invitation.plan_code);
  UPDATE public.agency_invitations
  SET status = 'ACCEPTED', accepted_at = now(), accepted_by_actor_user_id = p_owner_user_id,
      agency_id = created_agency.id, is_operational = false, updated_at = now()
  WHERE id = invitation.id;
  UPDATE public.agency_invitation_token_generations
  SET used_at = now()
  WHERE invitation_id = invitation.id AND used_at IS NULL AND revoked_at IS NULL;
  RETURN QUERY SELECT created_agency.id, created_agency.name, created_agency.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_agency_application(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_agency_invitation_token_generation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_agency_invitation(uuid, uuid, timestamptz, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_agency_onboarding(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_agency_onboarding_with_token(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_agency_application(uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_agency_invitation_token_generation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_agency_invitation(uuid, uuid, timestamptz, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_agency_onboarding(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_agency_onboarding_with_token(uuid, uuid, uuid, text, text) TO service_role;

COMMIT;
