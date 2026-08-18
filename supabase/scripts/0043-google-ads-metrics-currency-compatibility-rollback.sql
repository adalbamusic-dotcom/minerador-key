-- Rollback fail-closed da 0043. Não executar automaticamente.
-- Nenhuma moeda é inferida, preenchida, convertida ou removida.

BEGIN;

LOCK TABLE public.minerador_keyword_metric_measurements IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.minerador_keyword_metric_measurements
    WHERE currency_code IS NULL
  ) THEN
    RAISE EXCEPTION 'GOOGLE_ADS_METRICS_CURRENCY_ROLLBACK_BLOCKED: null currency_code rows exist';
  END IF;
END;
$$;

ALTER TABLE public.minerador_keyword_metric_measurements
  ALTER COLUMN currency_code SET NOT NULL;

COMMIT;
