-- ============================================================================
-- PREFLIGHT SOMENTE LEITURA — remoção do Planejador e retenção de 48h
-- Data: 2026-09-18
-- Fecha as três lacunas que o PostgREST não consegue ler (catálogo do Postgres).
-- NENHUM comando altera dado, schema, permissão ou storage. Só SELECT.
-- Rodar no SQL editor do projeto e colar o resultado na auditoria:
--   docs/00-produto/auditorias/auditoria-remocao-planejador-2026-09-18.md
-- ============================================================================

-- [1] NULABILIDADE EFETIVA das colunas que prendem Publicações ao plano.
--     Esperado para o fluxo novo: is_nullable = YES nas duas.
SELECT '1. nulabilidade' AS bloco, table_name, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('publication_records', 'content_plan_version_id'),
    ('publication_records', 'document_id'),
    ('publication_records', 'article_id'),
    ('content_documents',   'content_plan_version_id'),
    ('content_documents',   'article_dna_version_id'),
    ('content_documents',   'current_version_id'))
ORDER BY table_name, column_name;

-- [2] CHECK CONSTRAINTS de stage/state — qual migration prevaleceu (0002 x 0027).
--     Decide se a M3 precisa apenas apertar o CHECK ou também recriar a função
--     editorial_stage_module(), usada pela policy workflow_write.
SELECT '2. checks' AS bloco, rel.relname AS tabela, con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public' AND con.contype = 'c'
  AND (pg_get_constraintdef(con.oid) ILIKE '%planner%'
    OR pg_get_constraintdef(con.oid) ILIKE '%sent_planner%'
    OR rel.relname IN ('editorial_workflow_items', 'editorial_artifact_versions',
                       'publication_records', 'content_documents'))
ORDER BY tabela, constraint_name;

-- [2b] Definição atual de editorial_stage_module (mapeia planner -> planejador).
SELECT '2b. funcao stage' AS bloco, p.proname, pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'editorial_stage_module';

-- [3] TRIGGERS APPEND-ONLY — o obstáculo direto do purge de 48h.
--     Confirma em quais tabelas de versão o DELETE está bloqueado hoje.
SELECT '3. triggers' AS bloco, rel.relname AS tabela, tg.tgname, p.proname AS funcao,
       pg_get_triggerdef(tg.oid) AS definicao
FROM pg_trigger tg
JOIN pg_class rel ON rel.oid = tg.tgrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE ns.nspname = 'public' AND NOT tg.tgisinternal
  AND (p.proname ILIKE '%append_only%' OR p.proname ILIKE '%protect%'
    OR p.proname ILIKE '%immutable%')
ORDER BY tabela, tg.tgname;

-- [3b] Corpo da função que protege append-only: precisa passar a liberar
--      DELETE de linha com purge_after <= now(), sem liberar mais nada.
SELECT '3b. corpo append-only' AS bloco, p.proname, pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'pipeline_editorial_protect_append_only';

-- [4] FKs QUE APONTAM PARA AS TABELAS DE VERSÃO E MÍDIA.
--     Qualquer RESTRICT aqui impede o purge de apagar a linha expirada.
SELECT '4. fks' AS bloco, src.relname AS tabela_origem, con.conname,
       tgt.relname AS tabela_destino, pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN pg_namespace ns ON ns.oid = src.relnamespace
WHERE ns.nspname = 'public' AND con.contype = 'f'
  AND tgt.relname IN ('content_document_versions', 'writer_deliverable_versions',
                      'writer_media_assets', 'editorial_artifact_versions')
ORDER BY tabela_destino, tabela_origem;

-- [5] AGENDADOR — decide se o purge roda por pg_cron ou por rota server-side.
SELECT '5. extensoes' AS bloco, extname, extversion
FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net') ORDER BY extname;

-- [6] CONFIRMAÇÃO DE VOLUME — reconfirma o que a auditoria leu por PostgREST.
--     Esperado: planner_items/content_plans ausentes, 0 stage='planner',
--     0 content_plan em editorial_artifact_versions.
SELECT '6. volume' AS bloco, 'editorial_workflow_items stage=planner' AS medida,
       count(*)::text AS valor FROM public.editorial_workflow_items WHERE stage = 'planner'
UNION ALL SELECT '6. volume', 'editorial_workflow_items state=sent_planner',
       count(*)::text FROM public.editorial_workflow_items WHERE state = 'sent_planner'
UNION ALL SELECT '6. volume', 'editorial_artifact_versions artifact_type=content_plan',
       count(*)::text FROM public.editorial_artifact_versions WHERE artifact_type = 'content_plan'
UNION ALL SELECT '6. volume', 'publication_records total',
       count(*)::text FROM public.publication_records
UNION ALL SELECT '6. volume', 'content_document_versions total',
       count(*)::text FROM public.content_document_versions
UNION ALL SELECT '6. volume', 'writer_deliverable_versions total',
       count(*)::text FROM public.writer_deliverable_versions
UNION ALL SELECT '6. volume', 'writer_media_assets total',
       count(*)::text FROM public.writer_media_assets
UNION ALL SELECT '6. volume', 'storage.objects bucket=writer-media',
       count(*)::text FROM storage.objects WHERE bucket_id = 'writer-media';

-- [7] TABELAS DE PLANEJADOR — confirma ausência no schema efetivo.
SELECT '7. tabelas planner' AS bloco, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name ILIKE '%planner%' OR table_name ILIKE '%content_plan%')
ORDER BY table_name;
-- Resultado esperado: NENHUMA LINHA.
