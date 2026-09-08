-- =====================================================================
-- EXPORTAÇÃO PRÉVIA — rodar ANTES da purga
-- =====================================================================
--
-- SOMENTE LEITURA. Nenhum DELETE, UPDATE, DDL ou chamada de função que
-- escreva. Produz UMA linha com todo o conjunto afetado em JSON.
--
-- Sem isto, a purga é irreversível. Com isto, ela é reversível.
--
-- COMO USAR
--
--   1. \set alvo '09762023-d0d4-4c24-b34e-d0fdfd43f891'
--   2. Executar e SALVAR o resultado em arquivo, fora do repositório
--      (o payload editorial não deve ser versionado).
--   3. Conferir que `resumo` bate com o esperado antes de purgar.
--   4. Guardar o arquivo até a validação nas duas sessões terminar.
--
-- RESTAURAÇÃO
--
-- O JSON traz as linhas completas de cada tabela, com todas as colunas.
-- Para restaurar, reinserir na ORDEM INVERSA da remoção:
--
--   editorial_artifact_versions  →  editorial_workflow_items
--   →  editorial_version_status_events  →  editorial_serp_snapshots
--   →  editorial_serp_reviews  →  editorial_decision_events
--
-- Os gatilhos append-only bloqueiam UPDATE e DELETE, não INSERT — a
-- reinserção NÃO exige suspendê-los.
-- =====================================================================

\set alvo '09762023-d0d4-4c24-b34e-d0fdfd43f891'

WITH alvo AS (SELECT :'alvo'::uuid AS marca_id),

workflow AS (
  SELECT w.* FROM public.editorial_workflow_items w, alvo
  WHERE w.marca_id = alvo.marca_id AND w.stage IN ('architect', 'radar')
),
artefatos AS (
  SELECT a.* FROM public.editorial_artifact_versions a, alvo
  WHERE a.marca_id = alvo.marca_id
    AND a.artifact_type IN ('article_dna', 'silo_dna', 'silo_page')
),
eventos_status AS (
  SELECT e.* FROM public.editorial_version_status_events e
  WHERE e.version_id IN (SELECT version_id FROM artefatos)
),
eventos_decisao AS (
  SELECT d.* FROM public.editorial_decision_events d, alvo
  WHERE d.marca_id = alvo.marca_id AND d.workflow_item_id IN (SELECT id FROM workflow)
),
snapshots AS (
  SELECT s.* FROM public.editorial_serp_snapshots s, alvo WHERE s.marca_id = alvo.marca_id
),
revisoes AS (
  SELECT r.* FROM public.editorial_serp_reviews r, alvo WHERE r.marca_id = alvo.marca_id
)

SELECT jsonb_pretty(jsonb_build_object(
  'exportadoEm', now(),
  'marcaId',     (SELECT marca_id FROM alvo),
  'marcaNome',   (SELECT nome FROM public.marcas, alvo WHERE marcas.id = alvo.marca_id),
  'escopo',      'Arquiteto (architect) e Radar (radar) desta marca',

  'resumo', jsonb_build_object(
    'workflowItems',    (SELECT count(*) FROM workflow),
    'artefatos',        (SELECT count(*) FROM artefatos),
    'eventosDeStatus',  (SELECT count(*) FROM eventos_status),
    'eventosDeDecisao', (SELECT count(*) FROM eventos_decisao),
    'snapshotsSerp',    (SELECT count(*) FROM snapshots),
    'revisoesSerp',     (SELECT count(*) FROM revisoes)
  ),

  -- O que NÃO pode mudar. Conferir contra a saída da purga.
  'preservadoAntes', jsonb_build_object(
    'mineradorKeywords',    (SELECT count(*) FROM public.minerador_keywords, alvo
                             WHERE brand_id = alvo.marca_id),
    'mineradorHash',        (SELECT md5(coalesce(string_agg(k.id::text, ',' ORDER BY k.id), ''))
                             FROM public.minerador_keywords k, alvo WHERE k.brand_id = alvo.marca_id),
    'listasMinerador',      (SELECT count(*) FROM public.minerador_keyword_lists, alvo
                             WHERE marca_id = alvo.marca_id),
    'contentPlans',         (SELECT count(*) FROM public.editorial_artifact_versions, alvo
                             WHERE marca_id = alvo.marca_id AND artifact_type = 'content_plan'),
    'documentos',           (SELECT count(*) FROM public.content_documents, alvo
                             WHERE marca_id = alvo.marca_id),
    'publicacoes',          (SELECT count(*) FROM public.publication_records, alvo
                             WHERE marca_id = alvo.marca_id),
    'workflowOutrasEtapas', (SELECT count(*) FROM public.editorial_workflow_items, alvo
                             WHERE marca_id = alvo.marca_id AND stage NOT IN ('architect','radar')),
    'outrasMarcasWorkflow', (SELECT count(*) FROM public.editorial_workflow_items, alvo
                             WHERE marca_id <> alvo.marca_id),
    'outrasMarcasHash',     (SELECT md5(coalesce(string_agg(w.id::text, ',' ORDER BY w.id), ''))
                             FROM public.editorial_workflow_items w, alvo WHERE w.marca_id <> alvo.marca_id),
    'outrasArtefatoHash',   (SELECT md5(coalesce(string_agg(a.version_id::text, ',' ORDER BY a.version_id), ''))
                             FROM public.editorial_artifact_versions a, alvo WHERE a.marca_id <> alvo.marca_id)
  ),

  -- As linhas completas. É isto que permite reinserir.
  'linhas', jsonb_build_object(
    'editorial_workflow_items',        (SELECT coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) FROM workflow w),
    'editorial_artifact_versions',     (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM artefatos a),
    'editorial_version_status_events', (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM eventos_status e),
    'editorial_decision_events',       (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM eventos_decisao d),
    'editorial_serp_snapshots',        (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM snapshots s),
    'editorial_serp_reviews',          (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM revisoes r)
  )
)) AS backup_arquiteto_radar;
