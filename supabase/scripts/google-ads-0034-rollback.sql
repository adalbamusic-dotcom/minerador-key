-- Local/manual rollback artifact for 0034. Do not execute automatically.
-- It is valid only when no agency_distributed binding remains.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.integration_bindings') IS NULL THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_ROLLBACK_BINDINGS_RELATION_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.integration_bindings AS b
    WHERE b.source_kind = 'agency_distributed'
  ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0034_ROLLBACK_BLOCKED_BY_DISTRIBUTED_BINDINGS';
  END IF;
END;
$$;

ALTER TABLE public.integration_bindings
  DROP CONSTRAINT ck_integration_bindings_source_0034,
  DROP CONSTRAINT ck_integration_bindings_target_source_0034;

ALTER TABLE public.integration_bindings
  ADD CONSTRAINT ck_integration_bindings_source_0024 CHECK (
    (source_kind = 'unavailable' AND connection_id IS NULL AND grant_id IS NULL)
    OR (source_kind IN ('agency_owned', 'brand_owned') AND connection_id IS NOT NULL AND grant_id IS NULL)
    OR (source_kind IN ('platform_granted', 'agency_granted') AND connection_id IS NOT NULL AND grant_id IS NOT NULL)
  ),
  ADD CONSTRAINT ck_integration_bindings_target_source_0024 CHECK (
    (target_scope_type = 'agency' AND source_kind IN ('platform_granted', 'agency_owned', 'unavailable'))
    OR (target_scope_type = 'brand' AND source_kind IN ('platform_granted', 'agency_granted', 'brand_owned', 'unavailable'))
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

  IF NOT FOUND OR selected_connection.lifecycle_status = 'revoked' THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_CONNECTION_INVALID';
  END IF;

  IF NEW.source_kind = 'agency_owned'
    AND NOT (NEW.target_scope_type = 'agency' AND selected_connection.owner_scope_type = 'agency' AND selected_connection.owner_agency_id = NEW.target_agency_id) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_AGENCY_CONNECTION_MISMATCH';
  END IF;

  IF NEW.source_kind = 'brand_owned'
    AND NOT (NEW.target_scope_type = 'brand' AND selected_connection.owner_scope_type = 'brand' AND selected_connection.owner_brand_id = NEW.target_brand_id) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_BRAND_CONNECTION_MISMATCH';
  END IF;

  IF NEW.source_kind IN ('platform_granted', 'agency_granted') THEN
    SELECT grant_record.target_scope_type, grant_record.target_agency_id,
           grant_record.target_brand_id, grant_record.source_scope_type,
           grant_record.source_agency_id, grant_record.lifecycle_status
    INTO selected_grant
    FROM public.integration_grants AS grant_record
    WHERE grant_record.id = NEW.grant_id;

    IF NOT FOUND
      OR selected_grant.lifecycle_status <> 'active'
      OR selected_grant.target_scope_type <> NEW.target_scope_type
      OR selected_grant.target_agency_id IS DISTINCT FROM NEW.target_agency_id
      OR selected_grant.target_brand_id IS DISTINCT FROM NEW.target_brand_id THEN
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
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION public.integration_secret_store_upsert(text, text, text, text);
DROP FUNCTION public.integration_secret_resolve(text);

REVOKE ALL PRIVILEGES ON FUNCTION public.integration_bindings_validate_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_bindings_validate_scope() TO service_role;

COMMIT;
