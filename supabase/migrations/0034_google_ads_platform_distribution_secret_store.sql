-- Google Ads platform distribution and shared integration secret store.
-- Candidate only: apply remotely after the dedicated preflight and approval.
-- This migration does not provision providers, connections, grants or bindings.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.integration_bindings') IS NULL
    OR to_regclass('public.integration_connections') IS NULL
    OR to_regclass('public.integration_grants') IS NULL
    OR to_regprocedure('public.integration_bindings_validate_scope()') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS c
      JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname = 'integration_bindings'
        AND c.conname = 'ck_integration_bindings_source_0024'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS c
      JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname = 'integration_bindings'
        AND c.conname = 'ck_integration_bindings_target_source_0024'
    ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_PRECONDITION_FAILED';
  END IF;

  IF to_regprocedure('public.integration_secret_resolve(text)') IS NOT NULL
    OR to_regprocedure('public.integration_secret_store_upsert(text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_FUNCTION_CONFLICT';
  END IF;

  IF to_regnamespace('vault') IS NULL
    OR to_regclass('vault.decrypted_secrets') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'vault'
        AND p.proname = 'create_secret'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'vault'
        AND p.proname = 'update_secret'
    ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_VAULT_GATE_FAILED';
  END IF;
END;
$$;

ALTER TABLE public.integration_bindings
  DROP CONSTRAINT ck_integration_bindings_source_0024,
  DROP CONSTRAINT ck_integration_bindings_target_source_0024;

ALTER TABLE public.integration_bindings
  ADD CONSTRAINT ck_integration_bindings_source_0034 CHECK (
    (source_kind = 'unavailable' AND connection_id IS NULL AND grant_id IS NULL)
    OR (source_kind IN ('agency_owned', 'brand_owned') AND connection_id IS NOT NULL AND grant_id IS NULL)
    OR (source_kind IN ('platform_granted', 'agency_granted', 'agency_distributed') AND connection_id IS NOT NULL AND grant_id IS NOT NULL)
  ),
  ADD CONSTRAINT ck_integration_bindings_target_source_0034 CHECK (
    (target_scope_type = 'agency' AND source_kind IN ('platform_granted', 'agency_owned', 'unavailable'))
    OR (target_scope_type = 'brand' AND source_kind IN ('platform_granted', 'agency_granted', 'agency_distributed', 'brand_owned', 'unavailable'))
  );

CREATE OR REPLACE FUNCTION public.integration_bindings_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  selected_connection record;
  selected_grant record;
BEGIN
  IF NEW.source_kind = 'unavailable' THEN
    RETURN NEW;
  END IF;

  SELECT conn_row.owner_scope_type, conn_row.owner_agency_id, conn_row.owner_brand_id,
         conn_row.lifecycle_status
  INTO selected_connection
  FROM public.integration_connections AS conn_row
  WHERE conn_row.id = NEW.connection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_CONNECTION_INVALID';
  END IF;
  IF selected_connection.lifecycle_status = 'revoked' THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_CONNECTION_INVALID';
  END IF;

  IF NEW.source_kind = 'agency_owned'
    AND NOT (
      NEW.target_scope_type = 'agency'
      AND selected_connection.owner_scope_type = 'agency'
      AND selected_connection.owner_agency_id = NEW.target_agency_id
    ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_AGENCY_CONNECTION_MISMATCH';
  END IF;

  IF NEW.source_kind = 'brand_owned'
    AND NOT (
      NEW.target_scope_type = 'brand'
      AND selected_connection.owner_scope_type = 'brand'
      AND selected_connection.owner_brand_id = NEW.target_brand_id
    ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_BRAND_CONNECTION_MISMATCH';
  END IF;

  IF NEW.source_kind IN ('platform_granted', 'agency_granted', 'agency_distributed') THEN
    SELECT grant_record.capability_id, grant_record.target_scope_type, grant_record.target_agency_id,
           grant_record.target_brand_id, grant_record.source_scope_type,
           grant_record.source_agency_id, grant_record.lifecycle_status
    INTO selected_grant
    FROM public.integration_grants AS grant_record
    WHERE grant_record.id = NEW.grant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_GRANT_TARGET_MISMATCH';
    END IF;
    IF selected_grant.lifecycle_status <> 'active'
      OR selected_grant.capability_id IS DISTINCT FROM NEW.capability_id
      OR (
        NEW.source_kind <> 'agency_distributed'
        AND (
          selected_grant.target_scope_type <> NEW.target_scope_type
          OR selected_grant.target_agency_id IS DISTINCT FROM NEW.target_agency_id
          OR selected_grant.target_brand_id IS DISTINCT FROM NEW.target_brand_id
        )
      ) THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_GRANT_TARGET_MISMATCH';
    END IF;

    IF NEW.source_kind = 'platform_granted'
      AND NOT (selected_grant.source_scope_type = 'platform' AND selected_connection.owner_scope_type = 'platform') THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_PLATFORM_SOURCE_MISMATCH';
    END IF;

    IF NEW.source_kind = 'agency_granted'
      AND NOT (
        NEW.target_scope_type = 'brand'
        AND selected_grant.source_scope_type = 'agency'
        AND selected_connection.owner_scope_type = 'agency'
        AND selected_connection.owner_agency_id = selected_grant.source_agency_id
        AND selected_grant.target_scope_type = 'brand'
        AND selected_grant.target_brand_id = NEW.target_brand_id
        AND EXISTS (
          SELECT 1
          FROM public.agency_brands AS link
          WHERE link.agency_id = selected_grant.source_agency_id
            AND link.brand_id = NEW.target_brand_id
            AND link.status = 'active'
        )
      ) THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_AGENCY_SOURCE_MISMATCH';
    END IF;

    IF NEW.source_kind = 'agency_distributed'
      AND NOT (
        NEW.target_scope_type = 'brand'
        AND selected_grant.target_scope_type = 'agency'
        AND selected_grant.target_agency_id IS NOT NULL
        AND selected_grant.target_brand_id IS NULL
        AND selected_grant.source_scope_type = 'platform'
        AND selected_grant.source_agency_id IS NULL
        AND (
          selected_connection.owner_scope_type = 'platform'
          OR (
            selected_connection.owner_scope_type = 'agency'
            AND selected_connection.owner_agency_id = selected_grant.target_agency_id
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public.agency_brands AS link
          WHERE link.agency_id = selected_grant.target_agency_id
            AND link.brand_id = NEW.target_brand_id
            AND link.status = 'active'
        )
      ) THEN
      RAISE EXCEPTION 'INTEGRATIONS_0034_BINDING_DISTRIBUTION_SCOPE_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_secret_resolve(p_secret_ref text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, vault, pg_temp
AS $$
DECLARE
  secret_id uuid;
  secret_value text;
BEGIN
  IF nullif(btrim(coalesce(p_secret_ref, '')), '') IS NULL
    OR btrim(p_secret_ref) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  secret_id := btrim(p_secret_ref)::uuid;
  SELECT ds.decrypted_secret
  INTO secret_value
  FROM vault.decrypted_secrets AS ds
  WHERE ds.id = secret_id
  LIMIT 1;
  RETURN secret_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_secret_store_upsert(
  p_secret_ref text,
  p_secret text,
  p_name text,
  p_description text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog, public, vault, pg_temp
AS $$
DECLARE
  secret_id uuid;
  secret_value text;
  secret_name text;
  secret_description text;
BEGIN
  secret_value := nullif(btrim(coalesce(p_secret, '')), '');
  secret_name := nullif(btrim(coalesce(p_name, '')), '');
  secret_description := nullif(btrim(coalesce(p_description, '')), '');

  IF secret_value IS NULL OR char_length(secret_value) > 200000 THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_SECRET_VALUE_INVALID';
  END IF;
  IF secret_name IS NULL OR char_length(secret_name) > 160 THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_SECRET_NAME_INVALID';
  END IF;
  IF secret_description IS NULL OR char_length(secret_description) > 500 THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_SECRET_DESCRIPTION_INVALID';
  END IF;

  IF nullif(btrim(coalesce(p_secret_ref, '')), '') IS NULL THEN
    SELECT vault.create_secret(secret_value, secret_name, secret_description) INTO secret_id;
  ELSE
    IF btrim(p_secret_ref) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'INTEGRATIONS_0034_SECRET_REF_INVALID';
    END IF;
    secret_id := btrim(p_secret_ref)::uuid;
    PERFORM vault.update_secret(secret_id, secret_value, secret_name, secret_description);
  END IF;

  RETURN secret_id::text;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.integration_bindings_validate_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_bindings_validate_scope() TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.integration_secret_resolve(text), public.integration_secret_store_upsert(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_secret_resolve(text), public.integration_secret_store_upsert(text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.integration_secret_resolve(text) IS
  'Resolve apenas server-side uma referência UUID do Vault; nunca expõe credencial a anon/authenticated.';
COMMENT ON FUNCTION public.integration_secret_store_upsert(text, text, text, text) IS
  'Cria ou rotaciona segredo do secret store compartilhado; execução restrita a service_role.';

COMMIT;
