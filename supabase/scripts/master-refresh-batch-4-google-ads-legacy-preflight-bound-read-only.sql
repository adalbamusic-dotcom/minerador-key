-- Bound to the remote baseline captured on 2026-08-17 for hjjlntdpdgvpnazdztqw.
BEGIN TRANSACTION READ ONLY;

DO $$
BEGIN
  IF to_regclass('public.minerador_google_ads_connections') IS NULL
    OR to_regclass('public.google_ads_binding_targeting') IS NULL
    OR to_regclass('public.google_ads_binding_account_state') IS NULL
    OR to_regprocedure('public.google_ads_binding_configuration_validate()') IS NULL THEN
    RAISE EXCEPTION 'BATCH_4_TARGET_OBJECT_DRIFT';
  END IF;
  IF (SELECT count(*) FROM public.minerador_google_ads_connections) <> 0
    OR (SELECT count(*) FROM public.google_ads_binding_targeting) <> 0
    OR (SELECT count(*) FROM public.google_ads_binding_account_state) <> 0 THEN
    RAISE EXCEPTION 'BATCH_4_TARGET_DATA_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = ANY (ARRAY['public.minerador_google_ads_connections'::regclass,'public.google_ads_binding_targeting'::regclass,'public.google_ads_binding_account_state'::regclass])
  ) THEN RAISE EXCEPTION 'BATCH_4_INCOMING_FK_DRIFT'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class v ON v.oid=r.ev_class
    WHERE d.refobjid = ANY (ARRAY['public.minerador_google_ads_connections'::regclass,'public.google_ads_binding_targeting'::regclass,'public.google_ads_binding_account_state'::regclass])
      AND v.relkind IN ('v','m')
  ) THEN RAISE EXCEPTION 'BATCH_4_VIEW_DEPENDENCY_DRIFT'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.prokind IN ('f','p')
      AND p.oid <> 'public.google_ads_binding_configuration_validate()'::regprocedure
      AND pg_get_functiondef(p.oid) ~ '(minerador_google_ads_connections|google_ads_binding_targeting|google_ads_binding_account_state)'
  ) THEN RAISE EXCEPTION 'BATCH_4_FUNCTION_DEPENDENCY_DRIFT'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgfoid='public.google_ads_binding_configuration_validate()'::regprocedure AND NOT tgisinternal) <> 2
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid='public.google_ads_binding_configuration_validate()'::regprocedure AND NOT tgisinternal AND tgrelid <> ALL (ARRAY['public.google_ads_binding_targeting'::regclass,'public.google_ads_binding_account_state'::regclass])) THEN
    RAISE EXCEPTION 'BATCH_4_EXCLUSIVE_TRIGGER_FUNCTION_DRIFT';
  END IF;
  IF (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT g.* FROM public.integration_grants g JOIN public.integration_capabilities c ON c.id=g.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> 'fed3019c82fbb354ad83b3fd36d7b1b8'
    OR (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT b.* FROM public.integration_bindings b JOIN public.integration_capabilities c ON c.id=b.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> 'b7a20ec1d753459674abf8195391fdb6'
    OR (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT q.* FROM public.integration_quota_policies q JOIN public.integration_capabilities c ON c.id=q.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> '145e6b9bead2f43561b4f1df5ed9cfc3'
    OR (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT u.* FROM public.integration_usage_events u JOIN public.integration_capabilities c ON c.id=u.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> 'b5a6391e881c7e3f8e4cd645112b3707' THEN
    RAISE EXCEPTION 'BATCH_4_BOUND_FINGERPRINT_DRIFT';
  END IF;
END;
$$;

WITH ga_caps AS (SELECT id FROM public.integration_capabilities WHERE capability_key LIKE 'google_ads_%'),
fingerprints AS (
  SELECT
    (SELECT count(*) FROM public.integration_grants WHERE capability_id IN (SELECT id FROM ga_caps)) grants_count,
    (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT g.* FROM public.integration_grants g WHERE g.capability_id IN (SELECT id FROM ga_caps)) x) grants_fp,
    (SELECT count(*) FROM public.integration_bindings WHERE capability_id IN (SELECT id FROM ga_caps)) bindings_count,
    (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT b.* FROM public.integration_bindings b WHERE b.capability_id IN (SELECT id FROM ga_caps)) x) bindings_fp,
    (SELECT count(*) FROM public.integration_quota_policies WHERE capability_id IN (SELECT id FROM ga_caps)) quotas_count,
    (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT q.* FROM public.integration_quota_policies q WHERE q.capability_id IN (SELECT id FROM ga_caps)) x) quotas_fp,
    (SELECT count(*) FROM public.integration_usage_events WHERE capability_id IN (SELECT id FROM ga_caps)) usage_count,
    (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT u.* FROM public.integration_usage_events u WHERE u.capability_id IN (SELECT id FROM ga_caps)) x) usage_fp
)
SELECT *,
  grants_count=8 AND grants_fp='fed3019c82fbb354ad83b3fd36d7b1b8'
    AND bindings_count=8 AND bindings_fp='b7a20ec1d753459674abf8195391fdb6'
    AND quotas_count=2 AND quotas_fp='145e6b9bead2f43561b4f1df5ed9cfc3'
    AND usage_count=11 AND usage_fp='b5a6391e881c7e3f8e4cd645112b3707' AS batch_4_bound_baseline_pass
FROM fingerprints;

ROLLBACK;
