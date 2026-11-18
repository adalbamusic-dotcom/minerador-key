-- SOMENTE LEITURA. Não altera dados, schema, triggers ou políticas.
-- Execute no SQL Editor como quatro consultas separadas, ou pelo CLI com -f.
-- Mostra TODAS as marcas: restrinja por marca nas duas últimas consultas quando
-- necessário. Não considera nenhum artigo automaticamente como descartável.
-- FKs e triggers são só parte do inventário: conteúdo em JSON, Storage,
-- localStorage/IndexedDB e caches externos requerem auditoria própria.

-- 1. FKs de entrada e saída das tabelas editoriais e de descoberta.
SELECT con.conrelid::regclass::text AS tabela_origem,
       con.conname AS constraint_nome,
       con.confrelid::regclass::text AS tabela_destino,
       pg_get_constraintdef(con.oid, true) AS definicao
FROM pg_constraint con
JOIN pg_class origem ON origem.oid = con.conrelid
JOIN pg_namespace origem_ns ON origem_ns.oid = origem.relnamespace
JOIN pg_class destino ON destino.oid = con.confrelid
JOIN pg_namespace destino_ns ON destino_ns.oid = destino.relnamespace
WHERE con.contype = 'f'
  AND (origem_ns.nspname = 'public' OR destino_ns.nspname = 'public')
  AND (origem.relname ~ '^(minerador_|editorial_|internal_link_graph|radar_|content_document|publication_|writer_)'
    OR destino.relname ~ '^(minerador_|editorial_|internal_link_graph|radar_|content_document|publication_|writer_)')
ORDER BY 1, 2;

-- 2. Gatilhos próprios e eventos que podem impedir exclusão por DELETE.
SELECT ns.nspname AS esquema, tabela.relname AS tabela, gatilho.tgname AS gatilho,
       pg_get_triggerdef(gatilho.oid, true) AS definicao,
       funcao.oid::regprocedure::text AS funcao,
       pg_get_functiondef(funcao.oid) AS corpo
FROM pg_trigger gatilho
JOIN pg_class tabela ON tabela.oid = gatilho.tgrelid
JOIN pg_namespace ns ON ns.oid = tabela.relnamespace
JOIN pg_proc funcao ON funcao.oid = gatilho.tgfoid
WHERE NOT gatilho.tgisinternal AND ns.nspname = 'public'
  AND tabela.relname ~ '^(minerador_|editorial_|internal_link_graph|radar_|content_document|publication_|writer_)'
ORDER BY 1, 2, 3;

-- 3. Cache de SERP guardado no banco: por marca e estágio. O corpo não sai.
SELECT marca_id, stage, subject_type, count(*) AS entradas
FROM public.editorial_workflow_items
WHERE subject_type = 'serp_cache_entry'
GROUP BY marca_id, stage, subject_type
ORDER BY marca_id, stage;

-- 4. ArticleDNA cuja principal não existe mais ou está na lixeira da marca.
-- Mostra apenas a versão de maior número de cada artigo. Isto identifica
-- possíveis órfãos, não comprova que o artigo deva ser apagado ou que suas
-- demais dependências foram encontradas. IDs não são comparados entre tipos.
WITH ultimos AS (
  SELECT DISTINCT ON (marca_id, entity_id)
         marca_id, entity_id, version_id, version_number,
         payload->>'principalKeywordId' AS principal_keyword_id
  FROM public.editorial_artifact_versions
  WHERE artifact_type = 'article_dna'
  ORDER BY marca_id, entity_id, version_number DESC, version_id DESC
)
SELECT u.marca_id, u.entity_id AS artigo_id, u.version_id,
       u.version_number, u.principal_keyword_id,
       CASE WHEN k.id IS NULL THEN 'principal ausente'
            WHEN k.deleted_at IS NOT NULL THEN 'principal na lixeira'
            ELSE 'principal presente' END AS situacao_principal,
       k.deleted_at,
       (SELECT count(*) FROM public.editorial_workflow_items w
        WHERE w.marca_id = u.marca_id AND w.article_id = u.entity_id) AS itens_workflow,
       (SELECT count(*) FROM public.content_documents d
        WHERE d.marca_id = u.marca_id AND d.article_id = u.entity_id) AS documentos
FROM ultimos u
LEFT JOIN public.minerador_keywords k
  ON k.brand_id = u.marca_id AND k.id::text = u.principal_keyword_id
WHERE k.id IS NULL OR k.deleted_at IS NOT NULL
ORDER BY u.marca_id, u.entity_id;

-- 5. Marcador: contagem de referências concluídas por marca, sem supor que
-- apagar uma entrada é suficiente para remover suas outras dependências.
SELECT marca_id, id AS marcador_id,
       CASE WHEN jsonb_typeof(payload->'concludedFormations') = 'array'
            THEN jsonb_array_length(payload->'concludedFormations')
            ELSE NULL END AS formacoes_concluidas,
       jsonb_typeof(payload->'concludedFormations') AS tipo_campo
FROM public.editorial_workflow_items
WHERE subject_type = 'article_formation_analysis' AND stage = 'architect'
ORDER BY marca_id, id;
