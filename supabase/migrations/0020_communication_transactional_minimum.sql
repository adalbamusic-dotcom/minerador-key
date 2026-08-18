-- Fase 3B-R2a/3B-R4a. Communication message queue and delivery ledger.
-- Local preparation only: apply remotely only after snapshot and manual review.
BEGIN;

ALTER TABLE public.agency_invitations
  ADD COLUMN IF NOT EXISTS communication_generation integer NOT NULL DEFAULT 0;

ALTER TABLE public.agency_invitations
  ADD CONSTRAINT agency_invitations_communication_generation_0020
  CHECK (communication_generation >= 0);

CREATE TABLE public.agency_invitation_token_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.agency_invitations(id) ON DELETE RESTRICT,
  generation integer NOT NULL CHECK (generation > 0),
  token_hash text NOT NULL CHECK (char_length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (invitation_id, generation),
  UNIQUE (invitation_id, token_hash),
  CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX ix_agency_invitation_token_generations_lookup_0020
  ON public.agency_invitation_token_generations(invitation_id, expires_at, used_at, revoked_at);

CREATE TABLE public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE public.communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type text NOT NULL CHECK (message_type IN ('AGENCY_INVITATION', 'AGENCY_WELCOME')),
  template_code text NOT NULL,
  template_version integer NOT NULL CHECK (template_version > 0),
  destination_email text NOT NULL CHECK (destination_email = lower(btrim(destination_email))),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED')),
  idempotency_key text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  locked_at timestamptz,
  provider text,
  provider_message_id text,
  last_error_category text,
  agency_application_id uuid REFERENCES public.agency_applications(id) ON DELETE RESTRICT,
  agency_invitation_id uuid REFERENCES public.agency_invitations(id) ON DELETE RESTRICT,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz
);

CREATE INDEX ix_communication_messages_dispatch_0020
  ON public.communication_messages(status, next_attempt_at, created_at);
CREATE INDEX ix_communication_messages_invitation_0020
  ON public.communication_messages(agency_invitation_id, created_at DESC);

CREATE TABLE public.communication_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_message_id uuid NOT NULL REFERENCES public.communication_messages(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_message_id text,
  event_type text NOT NULL CHECK (event_type IN ('DELIVERED', 'BOUNCED')),
  event_id text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_communication_delivery_events_message_0020
  ON public.communication_delivery_events(communication_message_id, received_at DESC);

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_invitation_token_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.communication_templates, public.communication_messages, public.communication_delivery_events, public.agency_invitation_token_generations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.communication_templates, public.communication_messages TO service_role;
GRANT SELECT, INSERT ON public.communication_delivery_events TO service_role;
GRANT SELECT ON public.agency_invitation_token_generations TO service_role;

INSERT INTO public.communication_templates(code, version, subject, text_body, html_body)
VALUES
(
  'agency_invitation',
  1,
  'Seu acesso ao Minerador Key foi aprovado',
  E'{{greeting}}\n\nSua solicitação para {{agency_name}} foi aprovada no Plano Free. Crie seu acesso em: {{onboarding_url}}\n\nEste convite é de uso único e expira em {{expires_at}}.',
  '<p>{{greeting}}</p><p>Sua solicitação para <strong>{{agency_name}}</strong> foi aprovada no Plano Free.</p><p><a href="{{onboarding_url}}">Criar meu acesso</a></p><p>Este convite é de uso único e expira em {{expires_at}}.</p>'
),
(
  'agency_welcome',
  1,
  'Sua agência está pronta no Minerador Key',
  E'{{greeting}}\n\nSua agência {{agency_name}} foi criada. Acesse em: {{workspace_url}}',
  '<p>{{greeting}}</p><p>Sua agência <strong>{{agency_name}}</strong> foi criada.</p><p><a href="{{workspace_url}}">Abrir workspace</a></p>'
)
ON CONFLICT (code, version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.communication_dispatch_lease_seconds()
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT 300 $$;

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
  IF NOT FOUND OR invitation.status <> 'PENDING' OR invitation.expires_at <= now() THEN
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

CREATE OR REPLACE FUNCTION public.revoke_agency_invitation_token_generations(
  p_invitation_id uuid
) RETURNS integer
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.agency_invitation_token_generations
     SET revoked_at = now()
   WHERE invitation_id = p_invitation_id
     AND used_at IS NULL
     AND revoked_at IS NULL;
  SELECT count(*)::integer FROM public.agency_invitation_token_generations
   WHERE invitation_id = p_invitation_id AND revoked_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_communication_message(
  p_message_type text,
  p_template_code text,
  p_template_version integer,
  p_destination_email text,
  p_payload jsonb,
  p_idempotency_key text,
  p_agency_application_id uuid DEFAULT NULL,
  p_agency_invitation_id uuid DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL
) RETURNS TABLE(message_id uuid, message_status text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  stored public.communication_messages%ROWTYPE;
BEGIN
  INSERT INTO public.communication_messages(
    message_type, template_code, template_version, destination_email,
    payload, status, idempotency_key, agency_application_id,
    agency_invitation_id, agency_id
  )
  VALUES (
    p_message_type, p_template_code, p_template_version,
    lower(btrim(p_destination_email)), coalesce(p_payload, '{}'::jsonb),
    'QUEUED', p_idempotency_key, p_agency_application_id,
    p_agency_invitation_id, p_agency_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET updated_at = now()
  RETURNING * INTO stored;

  RETURN QUERY SELECT stored.id, stored.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_communication_message(
  p_message_id uuid DEFAULT NULL
) RETURNS SETOF public.communication_messages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.communication_messages
    WHERE (p_message_id IS NULL OR id = p_message_id)
      AND attempt_count < 3
      AND (
        (status IN ('QUEUED', 'FAILED') AND next_attempt_at <= now())
        OR (status = 'SENDING' AND coalesce(locked_at, '-infinity'::timestamptz) <= now() - make_interval(secs => public.communication_dispatch_lease_seconds()))
      )
    ORDER BY next_attempt_at, created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.communication_messages message
  SET status = 'SENDING',
      attempt_count = message.attempt_count + 1,
      claimed_at = now(),
      locked_at = now(),
      updated_at = now()
  FROM candidate
  WHERE message.id = candidate.id
  RETURNING message.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_communication_message(
  p_message_id uuid,
  p_status text,
  p_provider text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_error_category text DEFAULT NULL,
  p_next_attempt_at timestamptz DEFAULT NULL
) RETURNS SETOF public.communication_messages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('QUEUED', 'SENT', 'FAILED') THEN
    RAISE EXCEPTION 'COMMUNICATION_MESSAGE_STATUS_INVALID';
  END IF;

  RETURN QUERY
  UPDATE public.communication_messages
  SET status = p_status,
      provider = coalesce(p_provider, provider),
      provider_message_id = coalesce(provider_message_id, p_provider_message_id),
      last_error_category = left(nullif(btrim(p_error_category), ''), 120),
      next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
      claimed_at = NULL,
      locked_at = NULL,
      sent_at = CASE WHEN p_status = 'SENT' THEN coalesce(sent_at, now()) ELSE sent_at END,
      failed_at = CASE WHEN p_status = 'FAILED' THEN now() ELSE failed_at END,
      updated_at = now()
  WHERE id = p_message_id
    AND status = 'SENDING'
  RETURNING *;
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
  IF NOT FOUND OR invitation.status = 'REVOKED' OR invitation.expires_at <= now() THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_UNAVAILABLE'; END IF;
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
  UPDATE public.agency_invitations SET status = 'ACCEPTED', accepted_at = now(), accepted_by_actor_user_id = p_owner_user_id, agency_id = created_agency.id, updated_at = now() WHERE id = invitation.id;
  UPDATE public.agency_invitation_token_generations
     SET used_at = now()
   WHERE invitation_id = invitation.id AND used_at IS NULL AND revoked_at IS NULL;
  RETURN QUERY SELECT created_agency.id, created_agency.name, created_agency.slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_communication_delivery_event(
  p_communication_message_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_event_type text,
  p_event_id text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_event_type NOT IN ('DELIVERED', 'BOUNCED') THEN
    RAISE EXCEPTION 'COMMUNICATION_DELIVERY_EVENT_INVALID';
  END IF;

  INSERT INTO public.communication_delivery_events(
    communication_message_id, provider, provider_message_id,
    event_type, event_id, payload
  )
  VALUES (
    p_communication_message_id, p_provider, p_provider_message_id,
    p_event_type, p_event_id, coalesce(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    UPDATE public.communication_messages
    SET status = p_event_type,
        provider = p_provider,
        provider_message_id = coalesce(provider_message_id, p_provider_message_id),
        delivered_at = CASE WHEN p_event_type = 'DELIVERED' THEN now() ELSE delivered_at END,
        updated_at = now()
    WHERE id = p_communication_message_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_communication_message(text, text, integer, text, jsonb, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_communication_message(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_communication_message(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_communication_delivery_event(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.communication_dispatch_lease_seconds() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_agency_invitation_token_generation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_agency_invitation_token_generations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_agency_onboarding_with_token(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_communication_message(text, text, integer, text, jsonb, text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_communication_message(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_communication_message(uuid, text, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_communication_delivery_event(uuid, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_agency_invitation_token_generation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_agency_invitation_token_generations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_agency_onboarding_with_token(uuid, uuid, uuid, text, text) TO service_role;

COMMIT;
