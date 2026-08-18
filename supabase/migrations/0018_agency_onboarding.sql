-- Fase 3B.1. Preparação local: solicitação Free, convite autorizado e onboarding.
-- Aplicação remota somente após snapshot, revisão humana e preflight aprovado.
BEGIN;

CREATE TABLE public.agency_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_agency_name text NOT NULL CHECK (char_length(btrim(proposed_agency_name)) BETWEEN 1 AND 160),
  responsible_name text NOT NULL CHECK (char_length(btrim(responsible_name)) BETWEEN 1 AND 160),
  destination_email text NOT NULL CHECK (destination_email = lower(btrim(destination_email))),
  website_url text,
  approximate_brand_count integer CHECK (approximate_brand_count IS NULL OR approximate_brand_count BETWEEN 1 AND 100000),
  plan_code text NOT NULL DEFAULT 'FREE' CHECK (plan_code = 'FREE'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  idempotency_key uuid NOT NULL UNIQUE,
  reviewed_by_actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'PENDING' AND reviewed_by_actor_user_id IS NULL AND reviewed_at IS NULL) OR (status IN ('APPROVED', 'REJECTED') AND reviewed_by_actor_user_id IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE public.agency_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_email text NOT NULL CHECK (destination_email = lower(btrim(destination_email))),
  responsible_name text NOT NULL CHECK (char_length(btrim(responsible_name)) BETWEEN 1 AND 160),
  proposed_agency_name text NOT NULL CHECK (char_length(btrim(proposed_agency_name)) BETWEEN 1 AND 160),
  plan_code text NOT NULL DEFAULT 'FREE' CHECK (plan_code = 'FREE'),
  source text NOT NULL CHECK (source IN ('ADMIN_INVITE', 'PUBLIC_APPLICATION')),
  application_id uuid UNIQUE REFERENCES public.agency_applications(id) ON DELETE RESTRICT,
  invited_by_actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  accepted_at timestamptz,
  accepted_by_actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  agency_id uuid UNIQUE REFERENCES public.agencies(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'PUBLIC_APPLICATION') = (application_id IS NOT NULL)),
  CHECK ((status <> 'ACCEPTED') OR (accepted_at IS NOT NULL AND accepted_by_actor_user_id IS NOT NULL AND agency_id IS NOT NULL))
);

CREATE TABLE public.agency_onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_source text NOT NULL CHECK (onboarding_source IN ('ADMIN_INVITE', 'PUBLIC_APPLICATION')),
  idempotency_key uuid NOT NULL UNIQUE,
  agency_id uuid NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invitation_id uuid NOT NULL UNIQUE REFERENCES public.agency_invitations(id) ON DELETE RESTRICT,
  plan_code text NOT NULL CHECK (plan_code = 'FREE'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_agency_applications_status_created_0018 ON public.agency_applications(status, created_at DESC);
CREATE INDEX ix_agency_invitations_status_expires_0018 ON public.agency_invitations(status, expires_at);
CREATE INDEX ix_agency_onboardings_owner_0018 ON public.agency_onboardings(owner_user_id, created_at DESC);

ALTER TABLE public.agency_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_onboardings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agency_applications, public.agency_invitations, public.agency_onboardings FROM anon, authenticated, PUBLIC;

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
  IF FOUND THEN
    -- O token bruto nunca é persistido. Uma segunda aprovação não pode gerar
    -- um novo token que não corresponda ao hash do convite já existente.
    RAISE EXCEPTION 'AGENCY_APPLICATION_ALREADY_APPROVED';
  END IF;
  IF application.status <> 'PENDING' THEN RAISE EXCEPTION 'AGENCY_APPLICATION_CONFLICT'; END IF;
  INSERT INTO public.agency_invitations(destination_email, responsible_name, proposed_agency_name, plan_code, source, application_id, invited_by_actor_user_id, expires_at, token_hash)
  VALUES (application.destination_email, application.responsible_name, application.proposed_agency_name, 'FREE', 'PUBLIC_APPLICATION', application.id, p_actor_user_id, p_expires_at, p_token_hash)
  RETURNING * INTO invitation;
  UPDATE public.agency_applications SET status = 'APPROVED', reviewed_by_actor_user_id = p_actor_user_id, reviewed_at = now(), updated_at = now() WHERE id = application.id;
  RETURN QUERY SELECT invitation.id, invitation.proposed_agency_name, invitation.plan_code;
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
  IF NOT FOUND OR invitation.status = 'REVOKED' OR invitation.expires_at <= now() THEN RAISE EXCEPTION 'AGENCY_ONBOARDING_INVITATION_UNAVAILABLE'; END IF;
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
  UPDATE public.agency_invitations SET status = 'ACCEPTED', accepted_at = now(), accepted_by_actor_user_id = p_owner_user_id, agency_id = created_agency.id, updated_at = now() WHERE id = invitation.id;
  RETURN QUERY SELECT created_agency.id, created_agency.name, created_agency.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_agency_application(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_agency_onboarding(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_agency_application(uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_agency_onboarding(uuid, uuid, uuid, text) TO service_role;

COMMIT;
