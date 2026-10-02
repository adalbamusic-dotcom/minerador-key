-- ---------------------------------------------------------------------------
-- A compactacao da listagem passa a ser POR PERFIL (2026-10-02).
--
-- 20260921070000 compactava assim: "alguma fotografia existe (Google, YouTube
-- ou Amazon) -> esvazia TODAS as corridas e a amostra". Com os acrescimos
-- (SDD Radar 2026-09-30), um artigo do Google FINALIZADO ganha uma pesquisa
-- do YouTube ou da Amazon VIVA, ainda nao congelada. A listagem apagava essa
-- corrida da copia que vai ao navegador: depois de recarregar, a tela dizia
-- "Nenhuma coleta ainda" sobre 51 videos coletados e escondia o finalizar.
--
-- Agora cada campo so sai quando a fotografia DO SEU perfil o substitui:
--
--   youtubeSearch -> null  so se youtubeFrozenInvestigation e OBJETO
--   amazonSearch  -> null  so se amazonFrozenInvestigation  e OBJETO
--   extractions   -> []    so se finalizedBundle            e OBJETO
--   researchTransport = "COMPACT" so se algo de fato saiu (a trava de escrita
--   continua: marca exatamente quem perdeu conteudo, nem mais nem menos).
--
-- Espelha `compactRadarResearchForRead` (lib/radar/research-read-model.ts),
-- conferido pelo teste tests/editorial-listagem-workflow-sem-corridas.test.mts.
-- So troca o corpo da funcao (CREATE OR REPLACE): grants, view e a funcao de
-- payload que a chama continuam como estao.
--
-- APLICACAO: pelo dono, com `npx supabase db query --linked -f <este arquivo>`
-- seguido de `npx supabase migration repair --status applied 20261002130000 --linked`.
-- Nunca `supabase db push`.
-- Rollback: supabase/rollback/20261002130000_compactacao_por_perfil.rollback.sql
-- ---------------------------------------------------------------------------

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
        jsonb_typeof(pl -> 'finalizedBundle') = 'object'
        AND jsonb_typeof(pl -> 'extractions') = 'array'
        AND jsonb_array_length(pl -> 'extractions') > 0, false) AS tira_amostra,
      coalesce(
        jsonb_typeof(pl -> 'amazonFrozenInvestigation') = 'object'
        AND jsonb_typeof(pl -> 'amazonSearch') = 'object', false) AS tira_amazon,
      coalesce(
        jsonb_typeof(pl -> 'youtubeFrozenInvestigation') = 'object'
        AND jsonb_typeof(pl -> 'youtubeSearch') = 'object', false) AS tira_youtube
    FROM base
  ),
  sem_amostra AS (
    SELECT CASE WHEN tira_amostra
      THEN jsonb_set(pl, ARRAY['extractions'], '[]'::jsonb, true) ELSE pl END AS pl,
      tira_amostra, tira_amazon, tira_youtube
    FROM sinais
  ),
  sem_amazon AS (
    SELECT CASE WHEN tira_amazon
      THEN jsonb_set(pl, ARRAY['amazonSearch'], 'null'::jsonb, true) ELSE pl END AS pl,
      tira_amostra, tira_amazon, tira_youtube
    FROM sem_amostra
  ),
  sem_youtube AS (
    SELECT CASE WHEN tira_youtube
      THEN jsonb_set(pl, ARRAY['youtubeSearch'], 'null'::jsonb, true) ELSE pl END AS pl,
      tira_amostra, tira_amazon, tira_youtube
    FROM sem_amazon
  ),
  marcada AS (
    SELECT jsonb_set(pl, ARRAY['researchTransport'], '"COMPACT"'::jsonb, true) AS pl,
      tira_amostra, tira_amazon, tira_youtube
    FROM sem_youtube
  )
  SELECT CASE
    WHEN tira_amostra OR tira_amazon OR tira_youtube THEN jsonb_set(p_versao, ARRAY['payload'], pl, true)
    ELSE p_versao
  END
  FROM marcada;
$function$;

COMMENT ON FUNCTION public.editorial_radar_versao_compactada(jsonb) IS
  'Espelha compactRadarResearchForRead POR PERFIL (2026-10-02): cada corrida so sai quando a fotografia do seu perfil existe; a amostra do Google so sai com finalizedBundle; marca researchTransport=COMPACT so quando algo saiu.';

COMMIT;
