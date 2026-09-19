-- =====================================================================
-- PRÉ-M3 · VERIFICAÇÃO READ-ONLY DA M2
-- =====================================================================
--
-- SOMENTE SELECT. Nenhum DDL, DML, DO, CREATE, ALTER, DROP ou GRANT.
-- Nada aqui grava, e nada aqui corrige divergência: a instrução é PARAR
-- se algo divergir, e não consertar automaticamente.
--
-- Cada bloco devolve uma coluna `veredito` em PASS/FAIL para leitura direta,
-- além da evidência crua que sustenta o veredito.
-- =====================================================================

-- === 1 · M2 REGISTRADA E NADA APLICADO DEPOIS DELA ===
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260918190100') AS m2_registrada,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260918190000') AS m1_registrada,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260918190200') AS m3_registrada,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version > '20260918190100') AS posteriores_a_m2,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS ultima_registrada,
  CASE WHEN (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260918190100') = 1
        AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260918190200') = 0
        AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version > '20260918190100') = 0
       THEN 'PASS' ELSE 'FAIL' END AS veredito;

-- === 2 · COLUNAS DO LIFECYCLE EXISTEM ONDE PREVISTO ===
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'writer_deliverables' AND column_name = 'current_version_id')
    OR (table_name IN ('content_document_versions', 'writer_deliverable_versions')
        AND column_name IN ('superseded_at', 'superseded_by_version_id', 'purge_after'))
  )
ORDER BY table_name, column_name;

SELECT CASE WHEN count(*) = 7 THEN 'PASS' ELSE 'FAIL (esperado 7)' END AS veredito, count(*) AS colunas_encontradas
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'writer_deliverables' AND column_name = 'current_version_id')
    OR (table_name IN ('content_document_versions', 'writer_deliverable_versions')
        AND column_name IN ('superseded_at', 'superseded_by_version_id', 'purge_after'))
  );

-- === 2b · AS COLUNAS DE LIFECYCLE NÃO VAZARAM PARA OUTRAS TABELAS ===
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('superseded_at', 'superseded_by_version_id', 'purge_after')
  AND table_name NOT IN ('content_document_versions', 'writer_deliverable_versions')
ORDER BY table_name, column_name;

-- === 3 · TRIGGERS RETENTION-AWARE SÓ NAS VERSÕES DO REDATOR ===
SELECT c.relname AS tabela, t.tgname AS trigger, p.proname AS funcao, t.tgenabled AS habilitado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND p.proname IN ('pipeline_editorial_protect_retention_aware', 'pipeline_editorial_protect_append_only')
ORDER BY p.proname, c.relname;

SELECT CASE
         WHEN (SELECT count(DISTINCT c.relname) FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               JOIN pg_proc p ON p.oid = t.tgfoid
               WHERE NOT t.tgisinternal AND n.nspname = 'public'
                 AND p.proname = 'pipeline_editorial_protect_retention_aware'
                 AND c.relname NOT IN ('content_document_versions', 'writer_deliverable_versions')) = 0
         THEN 'PASS' ELSE 'FAIL (retention-aware fora das versões do Redator)' END AS veredito;

-- === 4 · editorial_artifact_versions SEGUE NA FUNÇÃO APPEND-ONLY ORIGINAL ===
SELECT c.relname AS tabela, t.tgname AS trigger, p.proname AS funcao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname = 'editorial_artifact_versions'
ORDER BY t.tgname;

SELECT CASE
         WHEN (SELECT count(*) FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               JOIN pg_proc p ON p.oid = t.tgfoid
               WHERE NOT t.tgisinternal AND n.nspname = 'public'
                 AND c.relname = 'editorial_artifact_versions'
                 AND p.proname = 'pipeline_editorial_protect_append_only') >= 1
          AND (SELECT count(*) FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               JOIN pg_proc p ON p.oid = t.tgfoid
               WHERE NOT t.tgisinternal AND n.nspname = 'public'
                 AND c.relname = 'editorial_artifact_versions'
                 AND p.proname = 'pipeline_editorial_protect_retention_aware') = 0
         THEN 'PASS' ELSE 'FAIL' END AS veredito;

-- === 4b · O CORPO DA FUNÇÃO APPEND-ONLY NÃO CONHECE RETENÇÃO ===
SELECT proname,
       (prosrc ILIKE '%superseded%' OR prosrc ILIKE '%purge%') AS menciona_retencao,
       CASE WHEN (prosrc ILIKE '%superseded%' OR prosrc ILIKE '%purge%')
            THEN 'FAIL (a função compartilhada foi alterada)' ELSE 'PASS' END AS veredito
FROM pg_proc
WHERE proname = 'pipeline_editorial_protect_append_only';

-- === 5 · NENHUMA VERSÃO CORRENTE MARCADA PARA PURGE ===
-- Documento: a versão corrente é a referida por content_documents.current_version_id.
SELECT count(*) AS documentos_correntes_marcados
FROM public.content_documents d
JOIN public.content_document_versions v ON v.version_id = d.current_version_id
WHERE v.superseded_at IS NOT NULL OR v.purge_after IS NOT NULL;

-- Entregável: idem por writer_deliverables.current_version_id.
SELECT count(*) AS entregaveis_correntes_marcados
FROM public.writer_deliverables w
JOIN public.writer_deliverable_versions v ON v.version_id = w.current_version_id
WHERE v.superseded_at IS NOT NULL OR v.purge_after IS NOT NULL;

-- === 5b · TOTAIS DE MARCAÇÃO E COERÊNCIA DA JANELA ===
SELECT 'content_document_versions' AS tabela,
       count(*) FILTER (WHERE superseded_at IS NOT NULL) AS superseded,
       count(*) FILTER (WHERE purge_after IS NOT NULL) AS com_purge_after,
       count(*) FILTER (WHERE superseded_at IS NOT NULL AND purge_after <> superseded_at + interval '48 hours') AS janela_incoerente,
       count(*) FILTER (WHERE superseded_at IS NULL AND purge_after IS NOT NULL) AS purge_sem_supersede
FROM public.content_document_versions
UNION ALL
SELECT 'writer_deliverable_versions',
       count(*) FILTER (WHERE superseded_at IS NOT NULL),
       count(*) FILTER (WHERE purge_after IS NOT NULL),
       count(*) FILTER (WHERE superseded_at IS NOT NULL AND purge_after <> superseded_at + interval '48 hours'),
       count(*) FILTER (WHERE superseded_at IS NULL AND purge_after IS NOT NULL)
FROM public.writer_deliverable_versions;

-- === 6 · AS FUNÇÕES DA M2 EXISTEM E NENHUM PURGE FOI AGENDADO ===
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('writer_save_deliverable', 'writer_mark_document_version_superseded',
                  'writer_mark_deliverable_version_superseded', 'lifecycle_purge_editorial_history',
                  'pipeline_editorial_protect_retention_aware')
ORDER BY proname;

SELECT count(*) AS extensao_pg_cron_instalada FROM pg_extension WHERE extname = 'pg_cron';
