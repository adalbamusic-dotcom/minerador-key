-- 2026-10-12 · CORREÇÃO: a função que decide "keyword publicada" ainda lia o Planejador aposentado.
--
-- A migration 20261001120000_aposentar_planejador removeu content_documents.content_plan_version_id e
-- publication_records.content_plan_version_id, mas public.lifecycle_keyword_is_published (última versão: 0047)
-- ainda referenciava essas colunas e o tipo 'content_plan'. Ela roda na trava de keyword publicada
-- (protect_published_keyword, em toda gravação de minerador_keywords): desde a aposentadoria aplicada, toda
-- gravação do Minerador falha com "42703 · column document.content_plan_version_id does not exist" —
-- Lógica, revisão humana, status e métricas do Google Ads não salvam.
--
-- Esta versão é a mesma regra sem o Planejador: publicada = vínculo formal de site OU linhagem real até
-- publication_records.status = 'published' pelo artigo (ArticleDNA) ou pelo documento do Redator. O
-- caminho pelo plano saiu porque o plano não existe mais (preflight de 2026-10-01: zero content_plan, zero
-- documento ou publicação com plano). Assinatura, SECURITY DEFINER, search_path e comentário iguais.
--
-- Rollback: reaplicar a definição de 0047 só faz sentido com as colunas de volta (rollback da aposentadoria).
-- Aplicar: npx supabase db query --linked -f supabase/migrations/20261012120000_publicada_sem_planejador.sql
--          npx supabase migration repair --status applied 20261012120000 --linked

BEGIN;

CREATE OR REPLACE FUNCTION public.lifecycle_keyword_is_published(p_brand_id uuid, p_keyword_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
WITH keyword_row AS (
  SELECT k.id, k.brand_id, k.analise_semantica
  FROM public.minerador_keywords k
  WHERE k.id = p_keyword_id
    AND k.brand_id = p_brand_id
), article_refs AS (
  SELECT av.version_id, av.entity_id
  FROM public.editorial_artifact_versions av
  CROSS JOIN keyword_row k
  WHERE av.marca_id = k.brand_id
    AND av.artifact_type = 'article_dna'
    AND (
      av.payload->>'principalKeywordId' = k.id::text
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(av.payload->'keywordReferences') = 'array'
            THEN av.payload->'keywordReferences'
            ELSE '[]'::jsonb
          END
        ) AS reference
        WHERE reference->>'keywordId' = k.id::text
      )
    )
), document_refs AS (
  SELECT document.id
  FROM public.content_documents document
  WHERE document.marca_id = p_brand_id
    AND (
      document.article_dna_version_id IN (SELECT version_id FROM article_refs)
      OR document.article_id IN (SELECT entity_id FROM article_refs)
    )
), formal_site AS (
  SELECT 1
  FROM keyword_row k
  WHERE public.minerador_keyword_is_published(NULL, k.analise_semantica)
), published_record AS (
  SELECT 1
  FROM public.publication_records publication
  WHERE publication.marca_id = p_brand_id
    AND publication.status = 'published'
    AND (
      publication.article_id IN (SELECT entity_id FROM article_refs)
      OR publication.document_id IN (SELECT id FROM document_refs)
    )
)
SELECT EXISTS (SELECT 1 FROM formal_site)
  OR EXISTS (SELECT 1 FROM published_record);
$function$;

COMMENT ON FUNCTION public.lifecycle_keyword_is_published(uuid, uuid) IS
  'Resolver server-side: somente vínculo formal de site ou linhagem real até publication_records.status=published. Status legado, DNA, workflow, aprovação, métricas e handoff não são publicação.';

COMMIT;
