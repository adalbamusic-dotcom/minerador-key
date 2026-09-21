-- ---------------------------------------------------------------------------
-- A listagem tambem compacta a investigacao CONGELADA.
--
-- 20260921060000 esvaziou as corridas das versoes HISTORICAS: 10 MB -> 3400 kB
-- (67,9%). O que sobrou e quase todo a versao CORRENTE, que passa inteira.
--
-- Medido: as 3 correntes estao congeladas, e 1061 kB dos seus 2037 kB sao
-- exatamente o que `compactRadarResearchForRead` descarta LOGO DEPOIS do
-- download. Desperdicio puro: sai da Supabase para ser jogado fora no
-- servidor Next, no mesmo ciclo.
--
-- A TRAVA DE ESCRITA, QUE E O MOTIVO DE TODO O CUIDADO AQUI
--
-- A compactacao marca `researchTransport: "COMPACT"`, e isso NAO e rotulo:
-- `analysis-contracts.ts:869` recusa construir uma versao nova a partir de
-- base com essa marca (`RadarCompactBaseError`). E o que impede uma escrita
-- nascer de leitura incompleta.
--
-- Por isso esvaziar os campos SEM marcar seria pior que nao economizar: a
-- base ficaria lossy e a trava nao dispararia. E marcar DEMAIS -- numa versao
-- que nada perdeu -- recusaria escrita legitima.
--
-- Entao a condicao e a do TS, campo a campo:
--
--   congelada  = amazonFrozenInvestigation | youtubeFrozenInvestigation |
--                finalizedBundle sao OBJETO
--   temCorrida = amazonSearch | youtubeSearch sao OBJETO
--   temAmostra = extractions e array NAO VAZIO
--
--   se (!congelada) ................... devolve intacta
--   se (!temCorrida && !temAmostra) ... devolve intacta, SEM marca
--   senao ............................. esvazia so o que existe, e marca
--
-- Os booleanos vao com `coalesce(..., false)`: payload ausente faz
-- `jsonb_typeof(NULL)` virar NULL, e um NULL em `NOT congelada` cairia no
-- ELSE -- compactando o que nao devia.
--
-- ORDEM: poda primeiro, compactacao depois, como em `WorkflowRepository.list`.
-- Numa versao ja podada, amazonSearch/youtubeSearch sao null e extractions e
-- [], entao temCorrida e temAmostra sao falsos e a compactacao nao a marca.
-- A marca so alcanca quem de fato perdeu conteudo.
-- ---------------------------------------------------------------------------

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

-- A funcao de payload passa a aplicar poda E compactacao, nessa ordem.
CREATE OR REPLACE FUNCTION public.editorial_workflow_payload_sem_corridas(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_payload -> 'analysisVersions') <> 'array' THEN p_payload
    ELSE jsonb_set(
      p_payload,
      ARRAY['analysisVersions'],
      coalesce((
        SELECT jsonb_agg(
          public.editorial_radar_versao_compactada(
            CASE
              -- Corrente, aprovada, ou sem numero legivel: nao e podada.
              WHEN entrada.valor ->> 'versionNumber' IS NULL
                OR entrada.valor ->> 'versionNumber' !~ '^-?[0-9]+(\.[0-9]+)?$'
                OR entrada.valor -> 'payload' ->> 'status' = 'approved'
                OR (entrada.valor ->> 'versionNumber')::numeric = (
                  SELECT max((maior.valor ->> 'versionNumber')::numeric)
                  FROM jsonb_array_elements(p_payload -> 'analysisVersions') AS maior(valor)
                  WHERE maior.valor ->> 'versionNumber' ~ '^-?[0-9]+(\.[0-9]+)?$'
                )
                THEN entrada.valor
              ELSE jsonb_set(jsonb_set(jsonb_set(jsonb_set(
                     entrada.valor,
                     ARRAY['payload','extractions'], '[]'::jsonb, true),
                     ARRAY['payload','competitiveReport'], 'null'::jsonb, true),
                     ARRAY['payload','youtubeSearch'], 'null'::jsonb, true),
                     ARRAY['payload','amazonSearch'], 'null'::jsonb, true)
            END
          )
          ORDER BY entrada.ordem
        )
        FROM jsonb_array_elements(p_payload -> 'analysisVersions') WITH ORDINALITY AS entrada(valor, ordem)
      ), '[]'::jsonb),
      true
    )
  END;
$function$;

COMMENT ON FUNCTION public.editorial_workflow_payload_sem_corridas(jsonb) IS
  'Poda as versoes historicas e compacta as congeladas, na mesma ordem de WorkflowRepository.list. Preserva um superconjunto do que a poda em TS preserva.';
