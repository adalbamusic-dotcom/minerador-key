-- SOMENTE LEITURA. Não apaga, atualiza ou aprova nada.
-- Corrigido em 02/11: o ID da keyword principal vem do payload, não do ID do artigo.
-- Inventário das sete identidades antigas informadas pelo dono; as atuais ficam fora.
WITH alvos(slug, article_id) AS (
  VALUES
    ('internet-optica', 'c66d4c43-77dd-4d82-a601-ee8b09c9c771'),
    ('internet-para-streaming', '598e45e3-09e8-4ee0-8e5f-a4c72cd19195'),
    ('melhor-internet-para-jogos-online', 'd9a2e65b-a13c-48a5-b56a-afc168dcea67'),
    ('internet-para-home-office', '7daefc3d-2e59-4ece-8ba9-c2aae43426be'),
    ('teste-de-velocidade-da-internet', 'ba713853-658f-431c-a8d9-7fdd54d6fa91'),
    ('diferenca-entre-internet-wi-fi', '352b10e2-48c3-460f-bb73-8c55e4ac3e1a'),
    ('wi-fi-lento', '923c3549-26b3-4e56-9309-b62ca824de66')
), versoes AS (
  SELECT a.slug, a.article_id, v.version_id, v.version_number, v.status,
         v.payload->>'principalKeywordId' AS principal_keyword_id,
         row_number() OVER (PARTITION BY a.article_id ORDER BY v.version_number DESC NULLS LAST) AS ordem
  FROM alvos a
  LEFT JOIN public.editorial_artifact_versions v
    ON v.marca_id = 'd4fa133a-13bd-4bf7-bfd1-d0f22253f223'::uuid
   AND v.artifact_type = 'article_dna' AND v.entity_id = a.article_id
)
SELECT v.slug, v.article_id, v.version_id AS versao_mais_recente,
       v.status AS status_na_versao, ultimo.status AS ultimo_evento,
       coalesce(ultimo.status, v.status) AS status_efetivo,
       ultimo.occurred_at AS data_ultimo_evento,
       (SELECT count(*) FROM versoes todas WHERE todas.article_id = v.article_id AND todas.version_id IS NOT NULL) AS total_versoes,
       (SELECT count(*) FROM public.editorial_version_status_events e
          JOIN versoes todas ON todas.version_id = e.version_id
         WHERE todas.article_id = v.article_id) AS total_eventos_status,
       v.principal_keyword_id,
       k.id IS NOT NULL AS keyword_principal_existe,
       k.deleted_at AS keyword_apagada_em,
       (SELECT count(*) FROM public.editorial_workflow_items w
         WHERE w.marca_id = 'd4fa133a-13bd-4bf7-bfd1-d0f22253f223'::uuid AND w.article_id = v.article_id) AS itens_workflow,
       (SELECT count(*) FROM public.editorial_decision_events d
         WHERE d.marca_id = 'd4fa133a-13bd-4bf7-bfd1-d0f22253f223'::uuid AND d.article_id = v.article_id) AS eventos_decisao,
       (SELECT count(*) FROM public.content_documents d
         WHERE d.marca_id = 'd4fa133a-13bd-4bf7-bfd1-d0f22253f223'::uuid AND d.article_id = v.article_id) AS documentos
FROM versoes v
LEFT JOIN LATERAL (
  SELECT e.status, e.occurred_at FROM public.editorial_version_status_events e
   WHERE e.version_id = v.version_id ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1
) ultimo ON true
LEFT JOIN public.minerador_keywords k
  ON k.brand_id = 'd4fa133a-13bd-4bf7-bfd1-d0f22253f223'::uuid AND k.id::text = v.principal_keyword_id
WHERE v.ordem = 1
ORDER BY v.slug;
