-- ---------------------------------------------------------------------------
-- A listagem do workflow para de baixar as corridas historicas.
--
-- MEDIDO EM 2026-09-21, em bytes de fio (`length(::text)`):
--
--   editorial_workflow_items, estagio 'radar':  3 linhas,  10 MB  (96,1%)
--   editorial_workflow_items, estagio 'architect': 47 linhas, 427 kB
--
-- Dentro do payload radar, `analysisVersions` e 98,7% do peso. As 62 versoes
-- das 3 linhas somam 10,45 MB, dos quais 8,99 MB estao em QUATRO campos:
-- `extractions`, `competitiveReport`, `youtubeSearch` e `amazonSearch`.
--
-- POR QUE A PODA QUE JA EXISTE NAO RESOLVIA
--
-- `EditorialRepositories.list` ja poda (`pruneRadarAnalysisHistory`) e
-- compacta (`compactRadarResearchForRead`) — mas DEPOIS do download. Aquele
-- codigo roda no servidor Next: os 10 MB ja atravessaram a saida da Supabase
-- quando a poda comeca. A economia era de banda do navegador, nao de egresso.
--
-- O CORTE PRECISA ACONTECER NA CONSULTA. E o que esta view faz.
--
-- CONSERVADORA DE PROPOSITO
--
-- A regra do TS preserva a versao CORRENTE e a ULTIMA APROVADA. A view
-- preserva a corrente e TODAS as aprovadas — um superconjunto. Assim a poda
-- em TS continua sendo a autoridade: ela roda depois, sobre o que chegou, e
-- estreita o conjunto. O SQL e otimizacao, nunca decisao.
--
-- A propriedade que importa: a view NUNCA tira o que o TS preservaria. Se as
-- duas regras divergirem um dia, o resultado lido continua correto — so deixa
-- de economizar. O inverso (SQL mais agressivo que o TS) seria perda de dado
-- na leitura, e e por isso que o superconjunto nao e detalhe.
--
-- Versao sem `versionNumber` legivel tambem e preservada: sem saber ordenar,
-- nao se decide o que e historico.
--
-- SEMANTICA IDENTICA A DA PODA EM TS
--
-- Os campos viram `[]` e `null`, nao somem — o schema aceita esses valores, e
-- uma versao sem a chave falharia a validacao em vez de carregar leve. Nada e
-- apagado do banco: a fotografia continua inteira na tabela, e o readback por
-- artigo (`byArticle`) segue lendo a tabela completa.
-- ---------------------------------------------------------------------------

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
          CASE
            -- Corrente, aprovada, ou sem numero legivel: passa inteira.
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
          ORDER BY entrada.ordem
        )
        FROM jsonb_array_elements(p_payload -> 'analysisVersions') WITH ORDINALITY AS entrada(valor, ordem)
      ), '[]'::jsonb),
      true
    )
  END;
$function$;

COMMENT ON FUNCTION public.editorial_workflow_payload_sem_corridas(jsonb) IS
  'Esvazia extractions/competitiveReport/youtubeSearch/amazonSearch das versoes historicas. Preserva a corrente e TODAS as aprovadas: superconjunto do que a poda em TS preserva.';

-- Montada a partir do catalogo: coluna nova na tabela entra sozinha na
-- proxima aplicacao, em vez de sumir da leitura sem aviso. DROP + CREATE
-- porque CREATE OR REPLACE VIEW nao aceita mudanca na lista de colunas.
DO $bloco$
DECLARE
  colunas text;
BEGIN
  SELECT string_agg(
    CASE WHEN c.column_name = 'payload'
      THEN 'public.editorial_workflow_payload_sem_corridas(w.payload) AS payload'
    ELSE 'w.' || quote_ident(c.column_name) END,
    ', ' ORDER BY c.ordinal_position)
  INTO colunas
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'editorial_workflow_items';

  IF colunas IS NULL THEN
    RAISE EXCEPTION 'editorial_workflow_items nao encontrada: a view nao pode ser montada as cegas.';
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.editorial_workflow_items_listagem';
  EXECUTE format(
    'CREATE VIEW public.editorial_workflow_items_listagem WITH (security_invoker = true) AS SELECT %s FROM public.editorial_workflow_items w',
    colunas
  );
END;
$bloco$;

COMMENT ON VIEW public.editorial_workflow_items_listagem IS
  'Mesma forma de linha de editorial_workflow_items, sem as corridas das versoes historicas (~9 MB/carregamento). O readback por artigo continua lendo a tabela.';

GRANT SELECT ON public.editorial_workflow_items_listagem TO authenticated, service_role;
