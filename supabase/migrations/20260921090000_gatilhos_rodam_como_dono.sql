-- ---------------------------------------------------------------------------
-- CORRECAO URGENTE: os gatilhos precisam rodar como dono.
--
-- O DEFEITO, INTRODUZIDO EM 20260921050000
--
-- `minerador_keywords_trava_identidade_publicada` foi criada SEM
-- `SECURITY DEFINER`, entao roda com o papel de quem faz o UPDATE. Ela chama
-- `minerador_keyword_is_published`, cuja ACL e `postgres=X/postgres` -- so o
-- dono executa. Resultado, com o usuario da tela:
--
--   42501 · permission denied for function minerador_keyword_is_published
--
-- E o alcance nao era so a keyword publicada. A checagem acontece ANTES do
-- retorno antecipado, entao QUALQUER update de `analise_semantica`, em
-- qualquer keyword, falhava. O caminho de escrita inteiro do Minerador ficou
-- parado desde que 050000 foi aplicada.
--
-- O PADRAO JA EXISTIA AO LADO
--
-- `protect_published_keyword` convive com a mesma ACL restrita ha muito tempo
-- porque E `SECURITY DEFINER`. Era so ter seguido o vizinho.
--
-- `minerador_keywords_preserva_series` (20260921030000) nao quebrou porque
-- `minerador_restaura_serie` ficou com EXECUTE para PUBLIC. Mas depender
-- disso e depender de acidente: se um dia aquela funcao for restringida, o
-- mesmo 42501 volta, e volta no caminho de escrita. Vai junto.
--
-- POR QUE E SEGURO
--
-- Sao gatilhos BEFORE UPDATE que so transformam NEW -- restauram uma serie
-- omitida, congelam um endereco. Rodar como dono nao contorna a RLS do
-- UPDATE, que continua sendo avaliada para quem chamou. O que muda e apenas
-- a permissao de EXECUTAR as funcoes auxiliares de leitura.
--
-- `search_path` ja estava fixo nas duas, que e o cuidado que SECURITY DEFINER
-- exige.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.minerador_keywords_trava_identidade_publicada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caminho text[];
  antes jsonb;
  depois jsonb;
  resultado jsonb := NEW.analise_semantica;
  bloqueios jsonb := '[]'::jsonb;
  historico jsonb;
  excedente integer;
  agora text := to_char(current_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF resultado IS NULL OR OLD.analise_semantica IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.minerador_keyword_is_published(OLD.status, OLD.analise_semantica) THEN
    RETURN NEW;
  END IF;

  -- A identidade: o slug e as tres fontes de endereco que `actualUrl` le, em
  -- ordem de precedencia. Congelar so o `canonicalUrl` nao bastaria -- a URL
  -- que a tela mostra sai de `declaredCanonicalUrl || resolvedUrl ||
  -- sourceUrl`, entao mexer numa dessas moveria o endereco exibido com o
  -- canonico intacto.
  FOR caminho IN SELECT p FROM (VALUES
    (ARRAY['slug_sugerido']),
    (ARRAY['site_origin','canonicalUrl']),
    (ARRAY['site_origin','declaredCanonicalUrl']),
    (ARRAY['site_origin','resolvedUrl']),
    (ARRAY['site_origin','sourceUrl'])
  ) AS t(p)
  LOOP
    antes := OLD.analise_semantica #> caminho;
    depois := resultado #> caminho;

    CONTINUE WHEN antes IS NULL;
    CONTINUE WHEN depois IS NOT DISTINCT FROM antes;

    -- Se o bloco pai inteiro sumiu, restaurar a folha inventaria estrutura
    -- que o escritor nao mandou. Deixa passar; o pai e outra conversa.
    CONTINUE WHEN array_length(caminho, 1) > 1
      AND resultado #> caminho[1:array_length(caminho, 1) - 1] IS NULL;

    resultado := jsonb_set(resultado, caminho, antes, true);
    bloqueios := bloqueios || jsonb_build_object(
      'field', array_to_string(caminho, '.'),
      'previous', antes,
      'attempted', coalesce(depois, 'null'::jsonb),
      'blockedAt', agora
    );
  END LOOP;

  IF jsonb_array_length(bloqueios) = 0 THEN
    RETURN NEW;
  END IF;

  historico := CASE
    WHEN jsonb_typeof(resultado -> 'publication_identity_lock_history') = 'array'
      THEN resultado -> 'publication_identity_lock_history'
    ELSE '[]'::jsonb
  END || bloqueios;

  -- Teto: o historico e sinal para o humano, nao arquivo.
  excedente := jsonb_array_length(historico) - 50;
  IF excedente > 0 THEN
    SELECT coalesce(jsonb_agg(elemento ORDER BY ordem), '[]'::jsonb)
    INTO historico
    FROM jsonb_array_elements(historico) WITH ORDINALITY AS entrada(elemento, ordem)
    WHERE ordem > excedente;
  END IF;

  resultado := jsonb_set(resultado, ARRAY['publication_identity_lock_history'], historico, true);
  NEW.analise_semantica := resultado;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.minerador_keywords_preserva_series()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  resultado jsonb := NEW.analise_semantica;
BEGIN
  IF resultado IS NULL OR OLD.analise_semantica IS NULL THEN
    RETURN NEW;
  END IF;

  -- MEASUREMENT_SERIES_PATHS, na mesma ordem do modulo TypeScript.
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['discovery_import','sourceSnapshot','metrics','monthlySearchVolumes']);
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['volume_measurement','monthlySearchVolumes']);
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['dataforseo_keyword_overview_history']);
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['allintitle_measurement_history']);

  NEW.analise_semantica := resultado;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.minerador_keywords_trava_identidade_publicada() IS
  'Congela slug e endereco da keyword publicada e registra a tentativa. SECURITY DEFINER: le minerador_keyword_is_published, cuja execucao e restrita ao dono.';

COMMENT ON FUNCTION public.minerador_keywords_preserva_series() IS
  'Recoloca a serie de medicao que um UPDATE omitir. SECURITY DEFINER para nao depender de a funcao auxiliar continuar aberta a PUBLIC.';
