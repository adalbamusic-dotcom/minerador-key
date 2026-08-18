-- Central de Comunicacao global / Supabase Vault.
-- Aplicacao remota exige snapshot, revisao humana e preflight aprovado.
BEGIN;

DO $$
BEGIN
  IF to_regnamespace('vault') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'vault' AND p.proname = 'create_secret'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'vault' AND p.proname = 'update_secret'
    )
    OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'COMMUNICATION_0019_VAULT_GATE_FAILED';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.platform_communication_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend')),
  status text NOT NULL DEFAULT 'NOT_CONFIGURED' CHECK (status IN ('DISABLED', 'NOT_CONFIGURED', 'VALIDATING', 'READY', 'ERROR')),
  sender_name text,
  sender_email text,
  domain text,
  secret_ref uuid,
  validated_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_email IS NULL OR sender_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CHECK ((status = 'READY') = (validated_at IS NOT NULL))
);

INSERT INTO public.platform_communication_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_communication_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_communication_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.platform_communication_config TO service_role;

CREATE OR REPLACE FUNCTION public.save_platform_communication_config(
  p_provider text,
  p_sender_name text,
  p_sender_email text,
  p_domain text,
  p_secret text
) RETURNS TABLE (
  provider text,
  status text,
  sender_name text,
  sender_email text,
  domain text,
  credential_configured boolean,
  validated_at timestamptz,
  last_error_code text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, vault, pg_temp
AS $$
DECLARE
  current_config public.platform_communication_config%ROWTYPE;
  next_secret_ref uuid;
BEGIN
  IF lower(btrim(coalesce(p_provider, ''))) <> 'resend' THEN
    RAISE EXCEPTION 'COMMUNICATION_PROVIDER_UNSUPPORTED';
  END IF;
  IF nullif(btrim(coalesce(p_sender_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'COMMUNICATION_SENDER_NAME_REQUIRED';
  END IF;
  IF nullif(btrim(coalesce(p_sender_email, '')), '') IS NULL
    OR p_sender_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'COMMUNICATION_SENDER_EMAIL_INVALID';
  END IF;

  SELECT * INTO current_config
  FROM public.platform_communication_config
  WHERE id = 1
  FOR UPDATE;

  next_secret_ref := current_config.secret_ref;
  IF nullif(btrim(coalesce(p_secret, '')), '') IS NOT NULL THEN
    IF next_secret_ref IS NULL THEN
      SELECT vault.create_secret(
        btrim(p_secret),
        'platform_communication_resend',
        'Global communication provider secret'
      ) INTO next_secret_ref;
    ELSE
      PERFORM vault.update_secret(
        next_secret_ref,
        btrim(p_secret),
        'platform_communication_resend',
        'Global communication provider secret'
      );
    END IF;
  END IF;

  UPDATE public.platform_communication_config
  SET provider = 'resend',
      status = CASE WHEN next_secret_ref IS NULL THEN 'NOT_CONFIGURED' ELSE 'VALIDATING' END,
      sender_name = btrim(p_sender_name),
      sender_email = lower(btrim(p_sender_email)),
      domain = nullif(btrim(coalesce(p_domain, '')), ''),
      secret_ref = next_secret_ref,
      validated_at = NULL,
      last_error_code = NULL,
      updated_at = now()
  WHERE id = 1;

  RETURN QUERY
  SELECT c.provider, c.status, c.sender_name, c.sender_email, c.domain,
         c.secret_ref IS NOT NULL, c.validated_at, c.last_error_code
  FROM public.platform_communication_config c
  WHERE c.id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_communication_secret()
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, vault, pg_temp
AS $$
  SELECT ds.decrypted_secret
  FROM public.platform_communication_config c
  JOIN vault.decrypted_secrets ds ON ds.id = c.secret_ref
  WHERE c.id = 1 AND c.secret_ref IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mark_platform_communication_validation(
  p_status text,
  p_error_code text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('READY', 'ERROR', 'VALIDATING', 'NOT_CONFIGURED') THEN
    RAISE EXCEPTION 'COMMUNICATION_STATUS_INVALID';
  END IF;
  UPDATE public.platform_communication_config
  SET status = p_status,
      validated_at = CASE WHEN p_status = 'READY' THEN now() ELSE NULL END,
      last_error_code = CASE WHEN p_status = 'ERROR' THEN left(nullif(btrim(p_error_code), ''), 80) ELSE NULL END,
      updated_at = now()
  WHERE id = 1;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.save_platform_communication_config(text,text,text,text,text)') IS NULL
    OR to_regprocedure('public.platform_communication_secret()') IS NULL
    OR to_regprocedure('public.mark_platform_communication_validation(text,text)') IS NULL THEN
    RAISE EXCEPTION 'COMMUNICATION_0019_FUNCTIONS_NOT_CREATED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_platform_communication_config(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_communication_secret() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_platform_communication_validation(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_communication_config(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_communication_secret() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_platform_communication_validation(text, text) TO service_role;

COMMIT;
