-- ---------------------------------------------------------------------------
-- Keyword publicada NUNCA é apagada.
--
-- O que havia: `lifecycle_delete_minerador_keywords` tratava a keyword
-- publicada com um SOFT DELETE de 24 horas — some da operação, recuperável
-- até `purge_after`, e depois some de vez. Não é o contrato: página no ar não
-- se apaga por decisão de tela, nem "por enquanto".
--
-- E havia coisa pior. A pergunta "está publicada?" era feita por
-- `p_semantic #>> '{site_origin,publicationStatus}'`. Quando a Lógica gravou
-- `site_origin` como STRING JSON (corrigido em 2026-09-21), esse caminho
-- devolvia NULL, `is_published` virava false e a keyword publicada caía no
-- ramo do DELETE FÍSICO em cascata. A proteção se desligava sozinha, em
-- silêncio, porque o dado mudou de forma.
--
-- Esta migration faz duas coisas:
--   1. a leitura passa a aceitar as duas formas do jsonb — objeto e string —
--      para que a trava não dependa de o dado estar bem gravado;
--   2. publicada deixa de ser soft-deletada: a operação inteira é RECUSADA
--      com `KEYWORD_DELETE_PUBLICATION_PROTECTED`.
--
-- Recusar o lote inteiro é deliberado: apagar "as outras" e falar da
-- publicada depois deixaria o humano sem saber o que aconteceu com o quê.
-- Para remover o vínculo existe "Desvincular publicação" — ação própria,
-- explícita e reversível.
-- ---------------------------------------------------------------------------

-- 1. Leitura resiliente ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minerador_keyword_site_origin(
  p_semantic jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  -- Objeto é a forma canônica. String JSON é a forma corrompida que a Lógica
  -- produziu até 2026-09-21: ilegível não pode significar inexistente quando
  -- é disso que depende a proteção de uma página no ar.
  SELECT CASE
    WHEN jsonb_typeof(p_semantic -> 'site_origin') = 'object'
      THEN p_semantic -> 'site_origin'
    WHEN jsonb_typeof(p_semantic -> 'site_origin') = 'string'
      AND btrim(p_semantic ->> 'site_origin') LIKE '{%'
      THEN (
        SELECT parsed FROM (
          SELECT CASE
            WHEN jsonb_typeof(candidate) = 'object' THEN candidate
            ELSE NULL
          END AS parsed
          FROM (SELECT (p_semantic ->> 'site_origin')::jsonb AS candidate) inner_parse
        ) outer_parse
      )
    ELSE NULL
  END;
$function$;

COMMENT ON FUNCTION public.minerador_keyword_site_origin(jsonb) IS
  'Evidência de publicação tolerando objeto e string JSON. A trava de exclusão não pode desligar porque o dado mudou de forma.';

CREATE OR REPLACE FUNCTION public.minerador_keyword_is_published(
  p_status text,
  p_semantic jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH origin AS (
    SELECT public.minerador_keyword_site_origin(coalesce(p_semantic, '{}'::jsonb)) AS value
  )
  SELECT coalesce(
    lower(coalesce((SELECT value ->> 'publicationStatus' FROM origin), '')) = 'published'
    AND (
      nullif(btrim((SELECT value ->> 'resolvedUrl' FROM origin)), '') IS NOT NULL
      OR nullif(btrim((SELECT value ->> 'sourceUrl' FROM origin)), '') IS NOT NULL
      OR nullif(btrim((SELECT value ->> 'declaredCanonicalUrl' FROM origin)), '') IS NOT NULL
    )
    AND (
      nullif(btrim((SELECT value ->> 'lastCheckedAt' FROM origin)), '') IS NOT NULL
      OR nullif(btrim((SELECT value ->> 'verifiedAt' FROM origin)), '') IS NOT NULL
      OR nullif(btrim((SELECT value ->> 'lastVerifiedAt' FROM origin)), '') IS NOT NULL
    )
    AND lower(coalesce((SELECT value ->> 'urlSituation' FROM origin), '')) IN (
      'accessible', 'canonical_confirmed', 'canonical_missing', 'canonical_conflict', 'noindex'
    )
    AND nullif(btrim((SELECT value ->> 'publicationConfirmedBy' FROM origin)), '') IS NOT NULL
    AND nullif(btrim((SELECT value ->> 'publicationConfirmedAt' FROM origin)), '') IS NOT NULL
    AND nullif(btrim((SELECT value ->> 'publicationCorrectedAt' FROM origin)), '') IS NULL
    AND nullif(btrim((SELECT value ->> 'publicationUnlinkedAt' FROM origin)), '') IS NULL,
    false
  );
$function$;

-- 2. Publicada é recusada, não soft-deletada ---------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_assert_keywords_not_published(
  p_brand_id uuid,
  p_keyword_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  protegidas text;
BEGIN
  SELECT string_agg(k.keyword, ', ' ORDER BY k.keyword)
  INTO protegidas
  FROM public.minerador_keywords k
  WHERE k.brand_id = p_brand_id
    AND k.id = ANY(p_keyword_ids)
    AND k.deleted_at IS NULL
    AND public.lifecycle_keyword_is_published(p_brand_id, k.id);

  IF protegidas IS NOT NULL THEN
    -- O lote inteiro é recusado: apagar "as outras" e avisar depois deixaria
    -- o humano sem saber o que aconteceu com o quê.
    RAISE EXCEPTION 'KEYWORD_DELETE_PUBLICATION_PROTECTED: %', protegidas
      USING HINT = 'Página publicada não é apagada. Use "Desvincular publicação" antes, se for mesmo o caso.';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.lifecycle_assert_keywords_not_published(uuid, uuid[]) IS
  'Recusa o lote inteiro quando qualquer keyword tem publicação declarada. Nenhum volume, KGR ou resultado justifica apagar uma página no ar.';
