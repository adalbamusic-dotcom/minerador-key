-- Rollback de 20261002130000_compactacao_por_perfil.sql: volta o corpo de 20260921070000
-- (compacta todas as corridas quando QUALQUER fotografia existe). So pelo dono.

BEGIN;

CREATE OR REPLACE FUNCTION public.editorial_radar_versao_compactada(p_versao jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH base AS (
    SELECT p_versao -> 'payload' AS pl
  ),
  sinais AS (
    SELECT
      pl,
      coalesce(
        jsonb_typeof(pl -> 'amazonFrozenInvestigation') = 'object'
        OR jsonb_typeof(pl -> 'youtubeFrozenInvestigation') = 'object'
        OR jsonb_typeof(pl -> 'finalizedBundle') = 'object', false) AS congelada,
      coalesce(
        jsonb_typeof(pl -> 'amazonSearch') = 'object'
        OR jsonb_typeof(pl -> 'youtubeSearch') = 'object', false) AS tem_corrida,
      coalesce(
        jsonb_typeof(pl -> 'extractions') = 'array'
        AND jsonb_array_length(pl -> 'extractions') > 0, false) AS tem_amostra
    FROM base
  ),
  sem_amostra AS (
    SELECT CASE WHEN tem_amostra
      THEN jsonb_set(pl, ARRAY['extractions'], '[]'::jsonb, true) ELSE pl END AS pl,
      congelada, tem_corrida, tem_amostra
    FROM sinais
  ),
  sem_amazon AS (
    SELECT CASE WHEN jsonb_typeof(pl -> 'amazonSearch') = 'object'
      THEN jsonb_set(pl, ARRAY['amazonSearch'], 'null'::jsonb, true) ELSE pl END AS pl,
      congelada, tem_corrida, tem_amostra
    FROM sem_amostra
  ),
  sem_youtube AS (
    SELECT CASE WHEN jsonb_typeof(pl -> 'youtubeSearch') = 'object'
      THEN jsonb_set(pl, ARRAY['youtubeSearch'], 'null'::jsonb, true) ELSE pl END AS pl,
      congelada, tem_corrida, tem_amostra
    FROM sem_amazon
  ),
  marcada AS (
    SELECT jsonb_set(pl, ARRAY['researchTransport'], '"COMPACT"'::jsonb, true) AS pl,
      congelada, tem_corrida, tem_amostra
    FROM sem_youtube
  )
  SELECT CASE
    WHEN NOT congelada THEN p_versao
    WHEN NOT tem_corrida AND NOT tem_amostra THEN p_versao
    ELSE jsonb_set(p_versao, ARRAY['payload'], pl, true)
  END
  FROM marcada;
$function$;

COMMENT ON FUNCTION public.editorial_radar_versao_compactada(jsonb) IS
  'Espelha compactRadarResearchForRead: so compacta investigacao congelada que tenha algo a perder, e marca researchTransport=COMPACT junto. A marca e a trava que impede escrita nascer de base lossy.';

COMMIT;
