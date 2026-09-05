-- Rollback fail-closed da 0044. Não executar automaticamente.
-- Nenhum timezone é inferido, preenchido, convertido ou removido.

BEGIN;

LOCK TABLE public.minerador_keyword_metric_measurements IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.minerador_keyword_metric_measurements
    WHERE time_zone IS NULL
  ) THEN
    RAISE EXCEPTION 'GOOGLE_ADS_METRICS_TIME_ZONE_ROLLBACK_BLOCKED: null time_zone rows exist';
  END IF;
END;
$$;

ALTER TABLE public.minerador_keyword_metric_measurements
  ALTER COLUMN time_zone SET NOT NULL;

COMMIT;
