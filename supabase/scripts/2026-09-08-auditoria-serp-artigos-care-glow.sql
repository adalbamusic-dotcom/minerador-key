-- AUDITORIA DOS 8 SNAPSHOTS JÁ COLETADOS — care-glow, 2026-09-08 17:30.
--
-- SOMENTE LEITURA. Nenhum INSERT, UPDATE ou DELETE. Nenhuma chamada ao
-- provider: a pergunta é sobre a evidência que JÁ está no acervo.
--
-- A execução anunciou "8 snapshot(s)" e terminou "BLOCKED = 5". Estas quatro
-- consultas respondem, na ordem, onde a evidência está e se ela é utilizável:
--
--   1. os pareceres existem remotamente?
--   2. cada parecer tem resultados orgânicos de verdade, ou veio vazio?
--   3. a composição que o parecer observou ainda é a de agora?
--   4. quais keywords foram consultadas, por candidato?
--
-- Se (2) devolver zero orgânicos, o defeito é de provider/coleta.
-- Se (2) devolver resultados, o provider funcionou e o defeito é nosso.

\set marca '09762023-d0d4-4c24-b34e-d0fdfd43f891'

-- ============================================================ 1. os pareceres
-- Um por candidateRef. Ausência aqui significa que a gravação remota não
-- aconteceu — e é isso que faria o gate dizer "sem evidência".
SELECT
  payload->>'candidateRef'                                   AS candidate_ref,
  payload->>'territoryRef'                                   AS territory_ref,
  payload->>'verdict'                                        AS verdict,
  payload->>'formationBaseHash'                              AS formation_base_hash,
  payload->'assessment'->>'id'                               AS assessment_id,
  payload->'assessment'->>'evaluationStatus'                 AS evaluation_status,
  jsonb_array_length(COALESCE(payload->'assessment'->'snapshots', '[]'::jsonb))       AS snapshots,
  jsonb_array_length(COALESCE(payload->'assessment'->'recommendations', '[]'::jsonb)) AS recommendations,
  lock_version,
  updated_at
FROM public.editorial_workflow_items
WHERE marca_id = :'marca'::uuid
  AND subject_type = 'article_formation_serp_assessment'
  AND stage = 'architect'
ORDER BY updated_at DESC;

-- ================================================ 2. os resultados orgânicos
-- A pergunta decisiva: o provider devolveu SERP de verdade?
--
-- `organic_results = 0` em todas as linhas → problema de coleta.
-- `organic_results > 0` → o provider funcionou; a evidência existe e o
-- problema está entre a coleta e o gate.
SELECT
  item.payload->>'candidateRef'                              AS candidate_ref,
  snapshot->>'keywordId'                                     AS keyword_id,
  snapshot->>'query'                                         AS query,
  snapshot->>'provider'                                      AS provider,
  snapshot->>'origin'                                        AS origin,
  snapshot->>'isMock'                                        AS is_mock,
  snapshot->>'status'                                        AS status,
  jsonb_array_length(COALESCE(snapshot->'organicResults', '[]'::jsonb))   AS organic_results,
  jsonb_array_length(COALESCE(snapshot->'peopleAlsoAsk', '[]'::jsonb))    AS people_also_ask,
  jsonb_array_length(COALESCE(snapshot->'relatedSearches', '[]'::jsonb))  AS related_searches,
  snapshot->'organicResults'->0->>'url'                      AS primeiro_resultado
FROM public.editorial_workflow_items AS item
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(item.payload->'assessment'->'snapshots', '[]'::jsonb)
) AS snapshot
WHERE item.marca_id = :'marca'::uuid
  AND item.subject_type = 'article_formation_serp_assessment'
  AND item.stage = 'architect'
ORDER BY candidate_ref, keyword_id;

-- ======================================= 3. a evidência descreve o artigo de agora?
-- O gate só aceita parecer cuja composição observada seja a atual. Divergência
-- aqui explica "sem evidência vigente" MESMO com snapshot gravado.
SELECT
  item.payload->>'candidateRef'                              AS candidate_ref,
  item.payload->>'formationBaseHash'                         AS base_do_parecer,
  item.payload->'assessment'->>'formationBaseHash'           AS base_dentro_do_assessment,
  (item.payload->>'formationBaseHash')
    IS NOT DISTINCT FROM
  (item.payload->'assessment'->>'formationBaseHash')         AS bases_coerentes,
  item.payload->'humanResolution'->>'formationBaseHash'      AS base_da_decisao_humana
FROM public.editorial_workflow_items AS item
WHERE item.marca_id = :'marca'::uuid
  AND item.subject_type = 'article_formation_serp_assessment'
  AND item.stage = 'architect'
ORDER BY candidate_ref;

-- =========================== 4. sobreposição real entre as buscas do mesmo candidato
-- É por isto que se paga a SERP: "pele oleosa" e "pele oleosa e acne" devolvem
-- as mesmas páginas, ou universos distintos?
WITH resultados AS (
  SELECT
    item.payload->>'candidateRef'          AS candidate_ref,
    snapshot->>'keywordId'                 AS keyword_id,
    snapshot->>'query'                     AS query,
    organico->>'url'                       AS url
  FROM public.editorial_workflow_items AS item
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(item.payload->'assessment'->'snapshots', '[]'::jsonb)
  ) AS snapshot
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(snapshot->'organicResults', '[]'::jsonb)
  ) AS organico
  WHERE item.marca_id = :'marca'::uuid
    AND item.subject_type = 'article_formation_serp_assessment'
    AND item.stage = 'architect'
)
SELECT
  esquerda.candidate_ref,
  esquerda.query        AS busca_a,
  direita.query         AS busca_b,
  COUNT(*)              AS urls_em_comum
FROM resultados AS esquerda
JOIN resultados AS direita
  ON direita.url = esquerda.url
 AND direita.keyword_id > esquerda.keyword_id
GROUP BY esquerda.candidate_ref, esquerda.query, direita.query
ORDER BY urls_em_comum DESC, esquerda.candidate_ref;
