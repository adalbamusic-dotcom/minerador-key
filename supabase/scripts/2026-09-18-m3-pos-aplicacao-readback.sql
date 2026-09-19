-- M3 · READBACK PÓS-APLICAÇÃO. SOMENTE LEITURA.
--
-- "Success. No rows returned" prova que a execução não devolveu erro; não prova
-- que o schema ficou como projetado. Isto lê o schema EFETIVO.
SELECT jsonb_pretty(jsonb_build_object(

  '1_colunas', (SELECT coalesce(jsonb_object_agg(column_name, jsonb_build_object('tipo', data_type, 'nullable', is_nullable)), '{}'::jsonb)
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='writer_media_assets'
      AND column_name IN ('anchor_kind','anchor_ref','replaced_by_asset_id','superseded_at','purge_after')),

  '2_checks', (SELECT coalesce(jsonb_object_agg(conname, pg_get_constraintdef(oid)), '{}'::jsonb)
    FROM pg_constraint WHERE conrelid='public.writer_media_assets'::regclass AND contype='c'),

  '3_indices', (SELECT coalesce(jsonb_object_agg(indexname, indexdef), '{}'::jsonb)
    FROM pg_indexes WHERE schemaname='public' AND tablename='writer_media_assets'),

  '4_assinatura_rpc', (SELECT coalesce(jsonb_object_agg(p.proname || '/' || p.pronargs,
      jsonb_build_object('args', pg_get_function_arguments(p.oid),
                         'retorno', pg_get_function_result(p.oid),
                         'security_definer', p.prosecdef)), '{}'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('writer_replace_media_asset',
      'lifecycle_claim_writer_media_purge','lifecycle_confirm_writer_media_purge')),

  '5_grants_efetivos', (SELECT coalesce(jsonb_object_agg(rotulo, permissoes), '{}'::jsonb) FROM (
      SELECT p.proname || '(' || p.pronargs || ')' AS rotulo,
             jsonb_build_object(
               'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
               'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
               'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE'),
               'public', has_function_privilege('public', p.oid, 'EXECUTE')) AS permissoes
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('writer_replace_media_asset',
         'lifecycle_claim_writer_media_purge','lifecycle_confirm_writer_media_purge')) g),

  '6_triggers_na_tabela', (SELECT coalesce(jsonb_agg(jsonb_build_object('trigger', t.tgname, 'funcao', pr.proname)), '[]'::jsonb)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc pr ON pr.oid=t.tgfoid
    WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname='writer_media_assets'),

  '7_cron', (SELECT count(*) FROM pg_extension WHERE extname IN ('pg_cron','pg_net')),

  '8_historico', (SELECT jsonb_build_object(
      'm1', count(*) FILTER (WHERE version='20260918190000'),
      'm2', count(*) FILTER (WHERE version='20260918190100'),
      'm3', count(*) FILTER (WHERE version='20260918190200'),
      'posteriores_a_m3', count(*) FILTER (WHERE version > '20260918190200'))
    FROM supabase_migrations.schema_migrations),

  '9_linhas', (SELECT jsonb_build_object(
      'media_assets', (SELECT count(*) FROM public.writer_media_assets),
      'ancorados', (SELECT count(*) FROM public.writer_media_assets WHERE anchor_kind IS NOT NULL),
      'em_janela', (SELECT count(*) FROM public.writer_media_assets WHERE superseded_at IS NOT NULL),
      'com_purge_after', (SELECT count(*) FROM public.writer_media_assets WHERE purge_after IS NOT NULL)))

)) AS readback;
