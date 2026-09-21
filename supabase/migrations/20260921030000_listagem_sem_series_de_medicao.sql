-- ---------------------------------------------------------------------------
-- A listagem do Minerador para de baixar as séries de medição.
--
-- MEDIÇÃO (2026-09-21, bytes de fio, `length(::text)`): a tela carregava
-- `analise_semantica` inteiro para cada keyword da marca — 1 034 kB em 109
-- linhas, 98,3% do peso da linha. Quatro arrays respondiam por 209 kB (20%) e
-- NENHUM deles é lido pela tabela; só o painel do DNA os abre, uma keyword
-- por vez:
--
--   discovery_import.sourceSnapshot.metrics.monthlySearchVolumes   69 kB
--   volume_measurement.monthlySearchVolumes                        64 kB
--   dataforseo_keyword_overview_history                            42 kB
--   allintitle_measurement_history                                 34 kB
--
-- A lista canônica desses caminhos vive em `lib/minerador/listing-payload.ts`
-- (MEASUREMENT_SERIES_PATHS) e é a mesma que a assinatura v3 do pacote
-- aprovado exclui. As duas PRECISAM concordar: uma série podada aqui mas
-- assinada no cliente faria as 29 aprovadas aparecerem divergentes.
--
-- Duas peças:
--   1. a view de listagem, com a mesma forma de linha da tabela (o cliente
--      segue usando `select("*")`), montada a partir do catálogo para não
--      ficar para trás quando a tabela ganhar coluna;
--   2. um gatilho que RECOLOCA a série que um UPDATE omitir.
--
-- A peça 2 é o que torna a 1 segura. São ~20 caminhos de escrita de
-- `analise_semantica` no workspace, vários no formato `{...item.analise_
-- semantica, ...}`. Gravar a partir de uma linha podada apagaria a série do
-- banco — exatamente a classe de perda silenciosa que a Lógica causou ao
-- serializar `site_origin`. Em vez de auditar os vinte, o banco se recusa a
-- perder: omissão restaura, substituição passa.
-- ---------------------------------------------------------------------------

-- 1. Restauração de uma trilha omitida -------------------------------------
CREATE OR REPLACE FUNCTION public.minerador_restaura_serie(
  p_novo jsonb,
  p_antigo jsonb,
  p_caminho text[]
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE
    -- Não havia série: nada a preservar.
    WHEN p_antigo #> p_caminho IS NULL THEN p_novo
    -- O UPDATE trouxe a série (inclusive uma remedição): é ela que vale.
    WHEN p_novo #> p_caminho IS NOT NULL THEN p_novo
    -- O bloco pai inteiro sumiu: restaurar a folha inventaria estrutura que
    -- o escritor não mandou. Deixa passar; o pai é problema de outra trava.
    WHEN array_length(p_caminho, 1) > 1
      AND p_novo #> p_caminho[1:array_length(p_caminho, 1) - 1] IS NULL THEN p_novo
    ELSE jsonb_set(p_novo, p_caminho, p_antigo #> p_caminho, true)
  END;
$function$;

COMMENT ON FUNCTION public.minerador_restaura_serie(jsonb, jsonb, text[]) IS
  'Recoloca uma trilha que o UPDATE omitiu. Substituir continua permitido; só omitir é revertido.';

CREATE OR REPLACE FUNCTION public.minerador_keywords_preserva_series()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  resultado jsonb := NEW.analise_semantica;
BEGIN
  IF resultado IS NULL OR OLD.analise_semantica IS NULL THEN
    RETURN NEW;
  END IF;

  -- MEASUREMENT_SERIES_PATHS, na mesma ordem do módulo TypeScript.
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['discovery_import','sourceSnapshot','metrics','monthlySearchVolumes']);
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['volume_measurement','monthlySearchVolumes']);
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['dataforseo_keyword_overview_history']);
  resultado := public.minerador_restaura_serie(resultado, OLD.analise_semantica, ARRAY['allintitle_measurement_history']);

  NEW.analise_semantica := resultado;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS minerador_keywords_preserva_series ON public.minerador_keywords;
CREATE TRIGGER minerador_keywords_preserva_series
  BEFORE UPDATE ON public.minerador_keywords
  FOR EACH ROW
  WHEN (OLD.analise_semantica IS DISTINCT FROM NEW.analise_semantica)
  EXECUTE FUNCTION public.minerador_keywords_preserva_series();

-- 2. View de listagem -------------------------------------------------------
-- Montada a partir do catálogo: uma coluna nova na tabela entra sozinha na
-- próxima aplicação, em vez de sumir da tela sem aviso. DROP + CREATE porque
-- CREATE OR REPLACE VIEW não aceita mudança na lista de colunas.
DO $bloco$
DECLARE
  colunas text;
BEGIN
  SELECT string_agg(
    CASE WHEN c.column_name = 'analise_semantica' THEN
      '((((k.analise_semantica'
      || ' #- ''{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}'')'
      || ' #- ''{volume_measurement,monthlySearchVolumes}'')'
      || ' #- ''{dataforseo_keyword_overview_history}'')'
      || ' #- ''{allintitle_measurement_history}'') AS analise_semantica'
    ELSE 'k.' || quote_ident(c.column_name) END,
    ', ' ORDER BY c.ordinal_position)
  INTO colunas
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'minerador_keywords';

  IF colunas IS NULL THEN
    RAISE EXCEPTION 'minerador_keywords não encontrada: a view de listagem não pode ser montada às cegas.';
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.minerador_keywords_listagem';
  EXECUTE format(
    'CREATE VIEW public.minerador_keywords_listagem WITH (security_invoker = true) AS SELECT %s FROM public.minerador_keywords k',
    colunas
  );
END;
$bloco$;

COMMENT ON VIEW public.minerador_keywords_listagem IS
  'Mesma forma de linha de minerador_keywords, sem as séries de medição (209 kB/carregamento). O detalhe é hidratado ao expandir. security_invoker: a RLS continua sendo a da tabela.';

GRANT SELECT ON public.minerador_keywords_listagem TO authenticated, service_role;
