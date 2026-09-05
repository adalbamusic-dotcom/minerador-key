-- 0044: aceita timezone desconhecido em medições históricas Google Ads.
-- O único delta permitido é time_zone NOT NULL -> NULLABLE.

BEGIN;

ALTER TABLE public.minerador_keyword_metric_measurements
  ALTER COLUMN time_zone DROP NOT NULL;

COMMIT;
