-- Local rollback artifact for Google Ads 0033.
-- Execute only after explicit approval. It refuses to remove non-empty data.
-- It never touches minerador_google_ads_connections or integration_bindings.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.google_ads_binding_targeting') IS NULL
    OR to_regclass('public.google_ads_binding_account_state') IS NULL THEN
    RAISE EXCEPTION 'GOOGLE_ADS_0033_ROLLBACK_RELATION_MISSING';
  END IF;

  IF (SELECT count(*) FROM public.google_ads_binding_targeting) <> 0
    OR (SELECT count(*) FROM public.google_ads_binding_account_state) <> 0 THEN
    RAISE EXCEPTION 'GOOGLE_ADS_0033_ROLLBACK_DATA_PRESENT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dependency_row
    WHERE dependency_row.refclassid = 'pg_class'::regclass
      AND dependency_row.refobjid IN (
        'public.google_ads_binding_targeting'::regclass,
        'public.google_ads_binding_account_state'::regclass
      )
      AND dependency_row.deptype = 'n'
      AND dependency_row.classid NOT IN ('pg_constraint'::regclass, 'pg_index'::regclass, 'pg_trigger'::regclass)
  ) THEN
    RAISE EXCEPTION 'GOOGLE_ADS_0033_ROLLBACK_EXTERNAL_DEPENDENCY';
  END IF;
END;
$$;

DROP TABLE public.google_ads_binding_targeting;
DROP TABLE public.google_ads_binding_account_state;
DROP FUNCTION public.google_ads_binding_configuration_validate();

COMMIT;
