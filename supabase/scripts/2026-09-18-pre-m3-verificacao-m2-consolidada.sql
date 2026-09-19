-- PRÉ-M3 · VERIFICAÇÃO READ-ONLY DA M2, CONSOLIDADA EM UM ÚNICO SELECT.
--
-- `supabase db query -f` devolve somente o resultado do ÚLTIMO comando, então
-- os sete blocos viram subconsultas de um `jsonb_build_object`. Continua sendo
-- SOMENTE LEITURA: nenhum DDL, DML, DO ou GRANT.
SELECT jsonb_pretty(jsonb_build_object(

  '1_historico', (SELECT jsonb_build_object(
      'm1_registrada', count(*) FILTER (WHERE version = '20260918190000'),
      'm2_registrada', count(*) FILTER (WHERE version = '20260918190100'),
      'm3_registrada', count(*) FILTER (WHERE version = '20260918190200'),
      'posteriores_a_m2', count(*) FILTER (WHERE version > '20260918190100'),
      'ultima_registrada', max(version),
      'veredito', CASE WHEN count(*) FILTER (WHERE version = '20260918190100') = 1
                        AND count(*) FILTER (WHERE version = '20260918190200') = 0
                        AND count(*) FILTER (WHERE version > '20260918190100') = 0
                       THEN 'PASS' ELSE 'FAIL' END)
    FROM supabase_migrations.schema_migrations),

  '2_colunas', (SELECT jsonb_build_object(
      'encontradas', jsonb_agg(jsonb_build_object('tabela', table_name, 'coluna', column_name, 'tipo', data_type, 'nullable', is_nullable) ORDER BY table_name, column_name),
      'total', count(*),
      'veredito', CASE WHEN count(*) = 7 THEN 'PASS' ELSE 'FAIL (esperado 7)' END)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'writer_deliverables' AND column_name = 'current_version_id')
        OR (table_name IN ('content_document_versions','writer_deliverable_versions')
            AND column_name IN ('superseded_at','superseded_by_version_id','purge_after')))),

  '2b_vazamento_de_colunas', (SELECT jsonb_build_object(
      'fora_do_redator', coalesce(jsonb_agg(jsonb_build_object('tabela', table_name, 'coluna', column_name)), '[]'::jsonb),
      'veredito', CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('superseded_at','superseded_by_version_id','purge_after')
      AND table_name NOT IN ('content_document_versions','writer_deliverable_versions')),

  '3_triggers', (SELECT jsonb_build_object(
      'mapa', jsonb_agg(jsonb_build_object('tabela', tabela, 'trigger', gatilho, 'funcao', funcao, 'habilitado', habilitado) ORDER BY funcao, tabela),
      'retention_aware_fora_do_redator', count(*) FILTER (WHERE funcao = 'pipeline_editorial_protect_retention_aware'
                                                            AND tabela NOT IN ('content_document_versions','writer_deliverable_versions')),
      'veredito', CASE WHEN count(*) FILTER (WHERE funcao = 'pipeline_editorial_protect_retention_aware'
                                               AND tabela NOT IN ('content_document_versions','writer_deliverable_versions')) = 0
                       THEN 'PASS' ELSE 'FAIL' END)
    FROM (SELECT c.relname AS tabela, t.tgname AS gatilho, p.proname AS funcao, t.tgenabled AS habilitado
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE NOT t.tgisinternal AND n.nspname = 'public'
            AND p.proname IN ('pipeline_editorial_protect_retention_aware','pipeline_editorial_protect_append_only')) g),

  '4_dna_append_only', (SELECT jsonb_build_object(
      'triggers_na_tabela', coalesce(jsonb_agg(jsonb_build_object('trigger', gatilho, 'funcao', funcao) ORDER BY gatilho), '[]'::jsonb),
      'veredito', CASE WHEN count(*) FILTER (WHERE funcao = 'pipeline_editorial_protect_append_only') >= 1
                        AND count(*) FILTER (WHERE funcao = 'pipeline_editorial_protect_retention_aware') = 0
                       THEN 'PASS' ELSE 'FAIL' END)
    FROM (SELECT t.tgname AS gatilho, p.proname AS funcao
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE NOT t.tgisinternal AND n.nspname = 'public'
            AND c.relname = 'editorial_artifact_versions') d),

  '4b_corpo_da_funcao_compartilhada', (SELECT jsonb_build_object(
      'menciona_retencao', bool_or(prosrc ILIKE '%superseded%' OR prosrc ILIKE '%purge%'),
      'veredito', CASE WHEN bool_or(prosrc ILIKE '%superseded%' OR prosrc ILIKE '%purge%')
                       THEN 'FAIL (a função compartilhada foi alterada)' ELSE 'PASS' END)
    FROM pg_proc WHERE proname = 'pipeline_editorial_protect_append_only'),

  '5_correntes_marcadas', jsonb_build_object(
      'documentos', (SELECT count(*) FROM public.content_documents d
                     JOIN public.content_document_versions v ON v.version_id = d.current_version_id
                     WHERE v.superseded_at IS NOT NULL OR v.purge_after IS NOT NULL),
      'entregaveis', (SELECT count(*) FROM public.writer_deliverables w
                      JOIN public.writer_deliverable_versions v ON v.version_id = w.current_version_id
                      WHERE v.superseded_at IS NOT NULL OR v.purge_after IS NOT NULL)),

  '5b_marcacoes', jsonb_build_object(
      'content_document_versions', (SELECT jsonb_build_object(
          'total', count(*),
          'superseded', count(*) FILTER (WHERE superseded_at IS NOT NULL),
          'com_purge_after', count(*) FILTER (WHERE purge_after IS NOT NULL),
          'janela_incoerente', count(*) FILTER (WHERE superseded_at IS NOT NULL AND purge_after IS DISTINCT FROM superseded_at + interval '48 hours'),
          'purge_sem_supersede', count(*) FILTER (WHERE superseded_at IS NULL AND purge_after IS NOT NULL))
        FROM public.content_document_versions),
      'writer_deliverable_versions', (SELECT jsonb_build_object(
          'total', count(*),
          'superseded', count(*) FILTER (WHERE superseded_at IS NOT NULL),
          'com_purge_after', count(*) FILTER (WHERE purge_after IS NOT NULL),
          'janela_incoerente', count(*) FILTER (WHERE superseded_at IS NOT NULL AND purge_after IS DISTINCT FROM superseded_at + interval '48 hours'),
          'purge_sem_supersede', count(*) FILTER (WHERE superseded_at IS NULL AND purge_after IS NOT NULL))
        FROM public.writer_deliverable_versions)),

  '6_funcoes_e_cron', jsonb_build_object(
      'funcoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', proname, 'security_definer', prosecdef) ORDER BY proname), '[]'::jsonb)
                  FROM pg_proc WHERE proname IN ('writer_save_deliverable','writer_mark_document_version_superseded',
                                                 'writer_mark_deliverable_version_superseded','lifecycle_purge_editorial_history',
                                                 'pipeline_editorial_protect_retention_aware')),
      'pg_cron_instalado', (SELECT count(*) FROM pg_extension WHERE extname = 'pg_cron')),

  '7_media', jsonb_build_object(
      'writer_media_assets_existe', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'writer_media_assets'),
      'colunas', (SELECT coalesce(jsonb_agg(jsonb_build_object('coluna', column_name, 'tipo', data_type, 'nullable', is_nullable, 'default', column_default) ORDER BY ordinal_position), '[]'::jsonb)
                  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'writer_media_assets'))

)) AS verificacao;
