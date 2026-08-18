-- Contingency only. Never run automatically.
-- Restores the exact 2026-08-17 Batch 4 baseline after a successful Batch 4 apply.
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.minerador_google_ads_connections') IS NOT NULL
    OR to_regclass('public.google_ads_binding_targeting') IS NOT NULL
    OR to_regclass('public.google_ads_binding_account_state') IS NOT NULL
    OR to_regprocedure('public.google_ads_binding_configuration_validate()') IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_4_ROLLBACK_TARGETS_ALREADY_EXIST';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_grants g JOIN public.integration_capabilities c ON c.id=g.capability_id WHERE c.capability_key LIKE 'google_ads_%')
    OR EXISTS (SELECT 1 FROM public.integration_bindings b JOIN public.integration_capabilities c ON c.id=b.capability_id WHERE c.capability_key LIKE 'google_ads_%')
    OR EXISTS (SELECT 1 FROM public.integration_quota_policies q JOIN public.integration_capabilities c ON c.id=q.capability_id WHERE c.capability_key LIKE 'google_ads_%') THEN
    RAISE EXCEPTION 'BATCH_4_ROLLBACK_SHARED_ROWS_ALREADY_EXIST';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integration_connections WHERE id='9360a075-cb90-4771-8dfd-56729263fe3a'::uuid AND lifecycle_status='revoked') THEN
    RAISE EXCEPTION 'BATCH_4_ROLLBACK_CONNECTION_STATE_DRIFT';
  END IF;
END;
$$;

CREATE TABLE public.minerador_google_ads_connections (
  brand_id uuid PRIMARY KEY REFERENCES public.marcas(id) ON DELETE RESTRICT,
  customer_id text NOT NULL CHECK (customer_id ~ '^[0-9]{10}$'),
  login_customer_id text CHECK (login_customer_id IS NULL OR login_customer_id ~ '^[0-9]{10}$'),
  language_constant text NOT NULL,
  geo_target_constants text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(geo_target_constants) <= 10),
  keyword_plan_network text NOT NULL CHECK (keyword_plan_network IN ('GOOGLE_SEARCH','GOOGLE_SEARCH_AND_PARTNERS')),
  include_adult_keywords boolean NOT NULL DEFAULT false,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  time_zone text NOT NULL,
  status text NOT NULL CHECK (status IN ('validated','invalid','pending','disabled')),
  validated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.minerador_google_ads_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY minerador_google_ads_connections_select ON public.minerador_google_ads_connections FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY minerador_google_ads_connections_manage ON public.minerador_google_ads_connections FOR ALL TO authenticated USING (public.tenant_actor_has_permission(brand_id,'minerador','manage')) WITH CHECK (public.tenant_actor_has_permission(brand_id,'minerador','manage'));
REVOKE ALL PRIVILEGES ON TABLE public.minerador_google_ads_connections FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.minerador_google_ads_connections FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minerador_google_ads_connections TO authenticated;

CREATE TABLE public.google_ads_binding_targeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), binding_id uuid NOT NULL UNIQUE REFERENCES public.integration_bindings(id) ON DELETE RESTRICT,
  language_constant text NOT NULL CHECK (language_constant ~ '^languageConstants/[0-9]+$'),
  geo_target_constants text[] NOT NULL CHECK (cardinality(geo_target_constants) BETWEEN 1 AND 10 AND array_position(geo_target_constants,NULL) IS NULL AND array_position(geo_target_constants,'') IS NULL),
  keyword_plan_network text NOT NULL CHECK (keyword_plan_network IN ('GOOGLE_SEARCH','GOOGLE_SEARCH_AND_PARTNERS')),
  include_adult_keywords boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.google_ads_binding_account_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), binding_id uuid NOT NULL UNIQUE REFERENCES public.integration_bindings(id) ON DELETE RESTRICT,
  currency_code text CHECK (currency_code ~ '^[A-Z]{3}$'), time_zone text NOT NULL CHECK (char_length(btrim(time_zone)) BETWEEN 1 AND 160),
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('validated','invalid','pending','disabled')),
  validated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_google_ads_account_state_validated_at_0033 CHECK (validation_status <> 'validated' OR validated_at IS NOT NULL)
);
CREATE FUNCTION public.google_ads_binding_configuration_validate() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE binding_row record;
BEGIN
 SELECT b.target_scope_type,b.target_brand_id,b.lifecycle_status INTO binding_row FROM public.integration_bindings b WHERE b.id=NEW.binding_id;
 IF NOT FOUND OR binding_row.target_scope_type<>'brand' OR binding_row.target_brand_id IS NULL OR binding_row.lifecycle_status<>'active' THEN RAISE EXCEPTION 'GOOGLE_ADS_0033_BINDING_MUST_BE_ACTIVE_BRAND'; END IF;
 IF TG_TABLE_NAME='google_ads_binding_targeting' AND (SELECT count(*) FROM unnest(NEW.geo_target_constants) g(value))<>(SELECT count(DISTINCT g.value) FROM unnest(NEW.geo_target_constants) g(value)) THEN RAISE EXCEPTION 'GOOGLE_ADS_0033_TARGETING_DUPLICATE_GEO_TARGET'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER google_ads_binding_targeting_validate_trg_0033 BEFORE INSERT OR UPDATE ON public.google_ads_binding_targeting FOR EACH ROW EXECUTE FUNCTION public.google_ads_binding_configuration_validate();
CREATE TRIGGER google_ads_binding_account_state_validate_trg_0033 BEFORE INSERT OR UPDATE ON public.google_ads_binding_account_state FOR EACH ROW EXECUTE FUNCTION public.google_ads_binding_configuration_validate();
ALTER TABLE public.google_ads_binding_targeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_binding_account_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY google_ads_binding_targeting_select_0033 ON public.google_ads_binding_targeting FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.integration_bindings b WHERE b.id=google_ads_binding_targeting.binding_id AND b.target_scope_type='brand' AND b.target_brand_id IS NOT NULL AND public.can_access_brand(b.target_brand_id)));
CREATE POLICY google_ads_binding_account_state_select_0033 ON public.google_ads_binding_account_state FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.integration_bindings b WHERE b.id=google_ads_binding_account_state.binding_id AND b.target_scope_type='brand' AND b.target_brand_id IS NOT NULL AND public.can_access_brand(b.target_brand_id)));
REVOKE ALL PRIVILEGES ON TABLE public.google_ads_binding_targeting,public.google_ads_binding_account_state FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.google_ads_binding_targeting,public.google_ads_binding_account_state TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.google_ads_binding_targeting,public.google_ads_binding_account_state TO service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.google_ads_binding_configuration_validate() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.google_ads_binding_configuration_validate() TO service_role;

INSERT INTO public.integration_grants (id,capability_id,target_scope_type,target_agency_id,target_brand_id,source_scope_type,source_agency_id,environment,lifecycle_status,starts_at,ends_at,reason,created_by_user_id,created_at,updated_at) VALUES
('07378f92-d8bc-46da-b912-3186d11f100e','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','3cc14013-3296-4094-80de-712abc4ceae8',NULL,'platform',NULL,'production','active','2026-08-16T00:00:19.685Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.684302Z','2026-08-16T00:00:19.684302Z'),
('1ceee2f5-8b9d-4ca2-bc35-aadb2f11600d','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','1febb431-4e44-49e9-b8cd-12115f4ad999',NULL,'platform',NULL,'production','active','2026-08-16T00:00:19.822Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.823006Z','2026-08-16T00:00:19.823006Z'),
('23ba635f-fe85-4ead-9d48-62039f94abde','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','ae851a64-5bff-449b-865c-ec6aa950be38',NULL,'platform',NULL,'production','active','2026-08-16T00:00:20.080Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:20.079719Z','2026-08-16T00:00:20.079719Z'),
('2e3ceefc-3cab-4768-b995-2dbb8512bc18','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4',NULL,'platform',NULL,'production','active','2026-08-16T00:00:19.954Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.951661Z','2026-08-16T00:00:19.951661Z'),
('612b492c-f467-4f9b-bac8-0950fa923617','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4',NULL,'platform',NULL,'production','active','2026-08-16T00:00:19.378Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.373826Z','2026-08-16T00:00:19.373826Z'),
('622c2cd0-930a-46b7-b2ec-3de4c4e37a01','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','ae851a64-5bff-449b-865c-ec6aa950be38',NULL,'platform',NULL,'production','active','2026-08-16T00:00:19.501Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.503110Z','2026-08-16T00:00:19.503110Z'),
('e026652f-9c78-425a-a833-0539b65cfeee','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','1febb431-4e44-49e9-b8cd-12115f4ad999',NULL,'platform',NULL,'production','active','2026-08-16T00:00:19.247Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.249365Z','2026-08-16T00:00:19.249365Z'),
('ebd97d5b-fa55-4fca-adbe-919df2a44f90','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','3cc14013-3296-4094-80de-712abc4ceae8',NULL,'platform',NULL,'production','active','2026-08-16T00:00:19.104Z',NULL,'Golden Path Minerador → DataForSEO','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.103822Z','2026-08-16T00:00:19.103822Z');

INSERT INTO public.integration_bindings (id,capability_id,target_scope_type,target_agency_id,target_brand_id,environment,source_kind,connection_id,grant_id,external_account_ref,lifecycle_status,created_by_user_id,created_at,updated_at) VALUES
('3d092d82-48fc-4dc1-9ed0-799264650d4a','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','1febb431-4e44-49e9-b8cd-12115f4ad999',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','1ceee2f5-8b9d-4ca2-bc35-aadb2f11600d',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.869717Z','2026-08-16T00:00:19.869717Z'),
('87888a08-6a64-4be4-9e3f-7b3b371bc0e0','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','2e3ceefc-3cab-4768-b995-2dbb8512bc18',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:20.000284Z','2026-08-16T00:00:20.000284Z'),
('8ed2042d-258b-4f2a-b6fc-f7c7f93b7e8f','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','612b492c-f467-4f9b-bac8-0950fa923617',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.420003Z','2026-08-16T00:00:19.420003Z'),
('97e3ec23-aa03-4147-8e6c-c36df4097ad8','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','1febb431-4e44-49e9-b8cd-12115f4ad999',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','e026652f-9c78-425a-a833-0539b65cfeee',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.297675Z','2026-08-16T00:00:19.297675Z'),
('b103c4f5-d1b4-4dc2-ba14-64d69279db05','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','ae851a64-5bff-449b-865c-ec6aa950be38',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','622c2cd0-930a-46b7-b2ec-3de4c4e37a01',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.555518Z','2026-08-16T00:00:19.555518Z'),
('ba6e2fa4-705c-4ed8-b536-63bc4a95c61a','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','ae851a64-5bff-449b-865c-ec6aa950be38',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','23ba635f-fe85-4ead-9d48-62039f94abde',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:20.159654Z','2026-08-16T00:00:20.159654Z'),
('c459007a-fde0-481d-8585-275d99223c62','25afb5ab-81be-40a2-ac04-27e86503ea2d','agency','3cc14013-3296-4094-80de-712abc4ceae8',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','ebd97d5b-fa55-4fca-adbe-919df2a44f90',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.157603Z','2026-08-16T00:00:19.157603Z'),
('e246dee0-2e3a-47d2-8301-174a0a5dc7cc','d1e5ec64-9787-4df2-a027-fc241966c70d','agency','3cc14013-3296-4094-80de-712abc4ceae8',NULL,'production','platform_granted','9360a075-cb90-4771-8dfd-56729263fe3a','07378f92-d8bc-46da-b912-3186d11f100e',NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.730749Z','2026-08-16T00:00:19.730749Z');

INSERT INTO public.integration_quota_policies (id,capability_id,scope_type,agency_id,brand_id,environment,window_kind,limit_units,period_started_at,period_ends_at,status,created_by_user_id,created_at,updated_at) VALUES
('133f0c9d-a80d-4d49-b3a6-db9e7185c77a','d1e5ec64-9787-4df2-a027-fc241966c70d','platform',NULL,NULL,'production','none',NULL,NULL,NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.608531Z','2026-08-16T00:00:19.608Z'),
('ae995fed-e4a5-447a-8951-fe9ad4bf8086','25afb5ab-81be-40a2-ac04-27e86503ea2d','platform',NULL,NULL,'production','none',NULL,NULL,NULL,'active','d67ebbad-a590-45f8-8bb5-a19c6241ac1b','2026-08-16T00:00:19.012029Z','2026-08-16T00:00:19.012Z');

UPDATE public.integration_connections SET lifecycle_status='ready',updated_at='2026-08-16T03:38:25.795Z'
WHERE id='9360a075-cb90-4771-8dfd-56729263fe3a'::uuid AND lifecycle_status='revoked';

COMMIT;
