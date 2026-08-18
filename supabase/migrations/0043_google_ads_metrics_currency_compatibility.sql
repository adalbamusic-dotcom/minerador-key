-- 0043: aceita moeda desconhecida em medições históricas Google Ads.
-- O único delta permitido é currency_code NOT NULL -> NULLABLE.

BEGIN;

ALTER TABLE public.minerador_keyword_metric_measurements
  ALTER COLUMN currency_code DROP NOT NULL;

COMMIT;
