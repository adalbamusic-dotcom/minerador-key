-- MASTER REFRESH BATCH 5 - FK-safe allowlisted tenant reset
-- DESTRUCTIVE: execute only after explicit Batch 5 authorization and a verified full recovery export.
-- Triggers, FKs and RLS remain enabled. The two immutable guards are transactionally scoped,
-- allow DELETE only for the approved rows, and are restored byte-for-byte before COMMIT.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
DECLARE
  usage_fp text;
BEGIN
  IF (SELECT count(*) FROM public.agencies WHERE id IN (
    '1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8',
    'cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38')) <> 4 THEN
    RAISE EXCEPTION 'BATCH_5_TARGET_AGENCIES_DRIFT';
  END IF;
  IF (SELECT count(*) FROM public.marcas WHERE id IN (
    'f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61')) <> 2 THEN
    RAISE EXCEPTION 'BATCH_5_TARGET_BRANDS_DRIFT';
  END IF;
  IF (SELECT count(*) FROM auth.users) <> 4 OR
     (SELECT count(*) FROM auth.users WHERE lower(email)='adalbapro@gmail.com') <> 1 OR
     (SELECT count(*) FROM public.perfis p JOIN auth.users u ON u.id=p.id
       WHERE lower(u.email)='adalbapro@gmail.com' AND lower(p.role)='admin') <> 1 THEN
    RAISE EXCEPTION 'BATCH_5_GLOBAL_ADMIN_OR_AUTH_DRIFT';
  END IF;
  IF (SELECT count(*) FROM public.integration_connections WHERE owner_agency_id IN (
      '1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8',
      'cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38')
      OR owner_brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61')) <> 0 THEN
    RAISE EXCEPTION 'BATCH_5_PRESERVED_CONNECTION_TENANT_DEPENDENCY';
  END IF;
  IF (SELECT count(*) FROM vault.secrets) <> 4 THEN RAISE EXCEPTION 'BATCH_5_VAULT_DRIFT'; END IF;
  IF (SELECT count(*) FROM public.integration_connections c
      JOIN public.integration_providers p ON p.id=c.provider_id
      JOIN vault.secrets s ON s.id::text=c.secret_ref
      WHERE c.id='14496206-f2b4-44f0-aa2e-4b412e04386d' AND p.provider_key='dataforseo'
        AND c.owner_scope_type='platform' AND c.owner_agency_id IS NULL AND c.owner_brand_id IS NULL
        AND c.lifecycle_status='ready') <> 1 THEN
    RAISE EXCEPTION 'BATCH_5_DATAFORSEO_PRESERVE_DRIFT';
  END IF;
  IF (SELECT count(*) FROM public.integration_connections c
      JOIN public.integration_providers p ON p.id=c.provider_id
      JOIN vault.secrets s ON s.id::text=c.secret_ref
      WHERE c.id='2f1a8f5c-8070-4c40-893f-5e17f82c8507' AND p.provider_key='openrouter'
        AND c.owner_scope_type='platform' AND c.owner_agency_id IS NULL AND c.owner_brand_id IS NULL
        AND c.lifecycle_status='ready') <> 1 THEN
    RAISE EXCEPTION 'BATCH_5_OPENROUTER_PRESERVE_DRIFT';
  END IF;
  IF (SELECT count(*) FROM public.integration_usage_events WHERE
      agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38')
      AND brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61')) <> 22 THEN
    RAISE EXCEPTION 'BATCH_5_USAGE_COUNT_DRIFT';
  END IF;
  SELECT md5(string_agg(md5(to_jsonb(u)::text),'' ORDER BY u.id)) INTO usage_fp
  FROM public.integration_usage_events u WHERE
    agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38')
    AND brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
  IF usage_fp <> 'ce3174ca2afe39b352ae704c6f96153c' THEN RAISE EXCEPTION 'BATCH_5_USAGE_FINGERPRINT_DRIFT'; END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid='public.integration_usage_events_prevent_mutation()'::regprocedure)) <> '95941662d9e63448cfab04c2ea04979e'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid='public.minerador_discovery_run_immutable()'::regprocedure)) <> 'cc6380c7066bf7f5f0b9385e20ed06d6' THEN
    RAISE EXCEPTION 'BATCH_5_IMMUTABILITY_GUARD_DRIFT';
  END IF;
END
$preflight$;

SELECT set_config('app.master_refresh_batch_5','approved-allowlist-2026-08-17',true);

CREATE OR REPLACE FUNCTION public.integration_usage_events_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public','pg_temp'
AS $guard$
BEGIN
  IF TG_OP='DELETE'
     AND current_setting('app.master_refresh_batch_5',true)='approved-allowlist-2026-08-17'
     AND OLD.agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38')
     AND OLD.brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'INTEGRATION_USAGE_APPEND_ONLY';
END
$guard$;

CREATE OR REPLACE FUNCTION public.minerador_discovery_run_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $guard$
BEGIN
  IF TG_OP='DELETE'
     AND current_setting('app.master_refresh_batch_5',true)='approved-allowlist-2026-08-17'
     AND OLD.brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61') THEN
    RETURN OLD;
  END IF;
  IF TG_OP='DELETE' OR OLD.status IN ('completed','partial') THEN RAISE EXCEPTION 'MINERADOR_DISCOVERY_RUN_IMMUTABLE'; END IF;
  RETURN NEW;
END
$guard$;

-- Children and immutable history first.
DELETE FROM public.integration_usage_events WHERE agency_id IN (
 '1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38')
 AND brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');

DELETE FROM public.communication_delivery_events WHERE communication_message_id IN (
 '43c75723-b6d4-4d58-93f2-46ce7d4a03a5','458499f3-67fc-457f-b3a3-324605f29a26','53ccf23a-b33f-4900-a206-2dbdf471e362','9883ace4-612e-4e09-961b-cb0658246c5c','ac57f7dc-3248-4121-8e99-3d312043e0a7','e735b1a7-2e11-47b5-b0ed-137c8a9dc28f','eee3870e-f72b-4da0-a4e9-74bd4e9f921f');
DELETE FROM public.communication_messages WHERE id IN (
 '43c75723-b6d4-4d58-93f2-46ce7d4a03a5','458499f3-67fc-457f-b3a3-324605f29a26','53ccf23a-b33f-4900-a206-2dbdf471e362','9883ace4-612e-4e09-961b-cb0658246c5c','ac57f7dc-3248-4121-8e99-3d312043e0a7','e735b1a7-2e11-47b5-b0ed-137c8a9dc28f','eee3870e-f72b-4da0-a4e9-74bd4e9f921f');
DELETE FROM public.agency_invitation_token_generations WHERE invitation_id IN ('0339a65a-2421-41c3-8130-605e611c567b','1627c94b-d2e3-4dfc-a807-1d7bae8b9fca','f1a545a5-b728-4dbf-b3e4-ee406b259444');
DELETE FROM public.agency_access_periods WHERE agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38');
DELETE FROM public.agency_onboardings WHERE agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38');
DELETE FROM public.agency_invitations WHERE id IN ('0339a65a-2421-41c3-8130-605e611c567b','1627c94b-d2e3-4dfc-a807-1d7bae8b9fca','f1a545a5-b728-4dbf-b3e4-ee406b259444');
DELETE FROM public.agency_applications WHERE id='6aa1c110-33e1-4f9a-b91d-6e546c414260';

DELETE FROM public.integration_bindings WHERE target_agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38') OR target_brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.integration_grants WHERE source_agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38') OR target_agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38') OR target_brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');

DELETE FROM public.minerador_discovery_keyword_origins WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.minerador_discovery_candidate_metric_history WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.minerador_discovery_candidate_current_metrics WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.minerador_keyword_metric_measurements WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.minerador_discovery_candidates WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.minerador_discovery_import_batches WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.minerador_discovery_runs WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.minerador_keywords WHERE brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.briefings_artigos WHERE silo_id IN (SELECT id FROM public.minerador_keyword_lists WHERE marca_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61'));
DELETE FROM public.minerador_keyword_lists WHERE marca_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');

DELETE FROM public.brand_member_permissions WHERE membership_id IN (SELECT id FROM public.brand_memberships WHERE marca_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61'));
DELETE FROM public.brand_memberships WHERE marca_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.brand_agency_capability_restrictions WHERE agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38') OR brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.agency_brands WHERE agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38') OR brand_id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.agency_membership_capabilities WHERE membership_id IN (SELECT id FROM public.agency_memberships WHERE agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38'));
DELETE FROM public.agency_memberships WHERE agency_id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38');
DELETE FROM public.marcas WHERE id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61');
DELETE FROM public.agencies WHERE id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38');

-- Restore the two original function bodies exactly, including CRLF bytes.
CREATE OR REPLACE FUNCTION public.integration_usage_events_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public','pg_temp'
AS E'\r\nBEGIN\r\n  RAISE EXCEPTION ''INTEGRATION_USAGE_APPEND_ONLY'';\r\nEND;\r\n';
CREATE OR REPLACE FUNCTION public.minerador_discovery_run_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp'
AS E'\r\nBEGIN\r\n  IF TG_OP = ''DELETE'' THEN\r\n    RAISE EXCEPTION ''MINERADOR_DISCOVERY_RUN_IMMUTABLE'';\r\n  END IF;\r\n  IF OLD.status IN (''completed'', ''partial'') THEN\r\n    RAISE EXCEPTION ''MINERADOR_DISCOVERY_RUN_IMMUTABLE'';\r\n  END IF;\r\n  RETURN NEW;\r\nEND;\r\n';

DO $post$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid='public.integration_usage_events_prevent_mutation()'::regprocedure)) <> '95941662d9e63448cfab04c2ea04979e'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid='public.minerador_discovery_run_immutable()'::regprocedure)) <> 'cc6380c7066bf7f5f0b9385e20ed06d6' THEN
    RAISE EXCEPTION 'BATCH_5_GUARD_RESTORE_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agencies WHERE id IN ('1febb431-4e44-49e9-b8cd-12115f4ad999','3cc14013-3296-4094-80de-712abc4ceae8','cd84f5ee-b939-4b05-afa4-52aabb8c9aa4','ae851a64-5bff-449b-865c-ec6aa950be38'))
     OR EXISTS (SELECT 1 FROM public.marcas WHERE id IN ('f514a553-ce4a-472e-9aec-c3fecff375f1','033b0cde-6e00-472c-b9d6-3c10ad33ae61')) THEN
    RAISE EXCEPTION 'BATCH_5_TARGET_TENANT_DELETE_INCOMPLETE';
  END IF;
  IF (SELECT count(*) FROM auth.users) <> 4 OR (SELECT count(*) FROM vault.secrets) <> 4
     OR (SELECT count(*) FROM public.integration_connections) <> 3 THEN
    RAISE EXCEPTION 'BATCH_5_PRESERVE_INVARIANT_FAILED';
  END IF;
END
$post$;
COMMIT;
