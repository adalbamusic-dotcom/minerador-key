-- PRÉ-M3 · CORREÇÃO DO CHECK 2b. SOMENTE LEITURA.
--
-- A primeira versão perguntava "estes NOMES de coluna existem em outra tabela?"
-- e acusou `minerador_keywords.purge_after` e
-- `radar_video_brief_extract_runs.superseded_at`. As duas são de outros módulos
-- e nasceram antes da M2 (migrations 0046/0047 e 20260914100000), que não
-- menciona nenhuma das duas tabelas.
--
-- A pergunta certa é sobre o CONTRATO de retenção do Redator — as três colunas
-- JUNTAS. Nenhuma tabela fora das versões do Redator pode carregá-lo.
SELECT jsonb_pretty(jsonb_build_object(

  'tabelas_com_o_contrato_completo', (
    SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)
    FROM (SELECT table_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name IN ('superseded_at','superseded_by_version_id','purge_after')
          GROUP BY table_name
          HAVING count(DISTINCT column_name) = 3) t),

  'veredito', (
    SELECT CASE WHEN coalesce(array_agg(table_name::text ORDER BY table_name::text), ARRAY[]::text[])
                     = ARRAY['content_document_versions','writer_deliverable_versions']
                THEN 'PASS' ELSE 'FAIL' END
    FROM (SELECT table_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name IN ('superseded_at','superseded_by_version_id','purge_after')
          GROUP BY table_name
          HAVING count(DISTINCT column_name) = 3) t),

  -- As duas acusadas, com o que de fato têm: nenhuma carrega o contrato.
  'acusadas_no_check_anterior', (
    SELECT coalesce(jsonb_object_agg(table_name, colunas), '{}'::jsonb)
    FROM (SELECT table_name, jsonb_agg(column_name ORDER BY column_name) AS colunas
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('minerador_keywords','radar_video_brief_extract_runs')
            AND column_name IN ('superseded_at','superseded_by_version_id','purge_after')
          GROUP BY table_name) t),

  -- E nenhuma delas tem gatilho de retenção do Redator.
  'gatilhos_de_retencao_nas_acusadas', (
    SELECT count(*)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND n.nspname = 'public'
      AND c.relname IN ('minerador_keywords','radar_video_brief_extract_runs')
      AND p.proname = 'pipeline_editorial_protect_retention_aware')

)) AS verificacao_2b;
