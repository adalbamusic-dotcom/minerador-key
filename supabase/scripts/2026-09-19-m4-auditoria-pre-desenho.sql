-- =====================================================================
-- M4 · AUDITORIA DA AUTORIDADE ATUAL. SOMENTE LEITURA.
-- =====================================================================
-- Nada aqui grava. O objetivo é ler o schema EFETIVO antes de escrever uma
-- linha de DDL — nomes, constraints e comportamento não são presumidos.
-- =====================================================================
SELECT jsonb_pretty(jsonb_build_object(

  '1_writer_deliverables', jsonb_build_object(
    'colunas', (SELECT jsonb_object_agg(column_name, jsonb_build_object(
        'tipo', data_type, 'nullable', is_nullable, 'default', column_default))
      FROM information_schema.columns WHERE table_schema='public' AND table_name='writer_deliverables'),
    'checks', (SELECT coalesce(jsonb_object_agg(conname, pg_get_constraintdef(oid)), '{}'::jsonb)
      FROM pg_constraint WHERE conrelid='public.writer_deliverables'::regclass AND contype='c'),
    'fks', (SELECT coalesce(jsonb_object_agg(conname, pg_get_constraintdef(oid)), '{}'::jsonb)
      FROM pg_constraint WHERE conrelid='public.writer_deliverables'::regclass AND contype='f'),
    'unicos', (SELECT coalesce(jsonb_object_agg(conname, pg_get_constraintdef(oid)), '{}'::jsonb)
      FROM pg_constraint WHERE conrelid='public.writer_deliverables'::regclass AND contype IN ('u','p')),
    'indices', (SELECT coalesce(jsonb_object_agg(indexname, indexdef), '{}'::jsonb)
      FROM pg_indexes WHERE schemaname='public' AND tablename='writer_deliverables'),
    'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('trigger', t.tgname, 'funcao', p.proname)), '[]'::jsonb)
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND c.relname='writer_deliverables'),
    'rls_ativa', (SELECT relrowsecurity FROM pg_class WHERE oid='public.writer_deliverables'::regclass),
    'politicas', (SELECT coalesce(jsonb_object_agg(policyname, jsonb_build_object(
        'cmd', cmd, 'roles', roles::text, 'using', qual, 'check', with_check)), '{}'::jsonb)
      FROM pg_policies WHERE schemaname='public' AND tablename='writer_deliverables'),
    'grants', (SELECT coalesce(jsonb_object_agg(grantee || ':' || privilege_type, 'yes'), '{}'::jsonb)
      FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='writer_deliverables')),

  '2_writer_deliverable_versions', jsonb_build_object(
    'colunas', (SELECT jsonb_object_agg(column_name, jsonb_build_object(
        'tipo', data_type, 'nullable', is_nullable, 'default', column_default))
      FROM information_schema.columns WHERE table_schema='public' AND table_name='writer_deliverable_versions'),
    'checks', (SELECT coalesce(jsonb_object_agg(conname, pg_get_constraintdef(oid)), '{}'::jsonb)
      FROM pg_constraint WHERE conrelid='public.writer_deliverable_versions'::regclass AND contype='c'),
    'fks', (SELECT coalesce(jsonb_object_agg(conname, pg_get_constraintdef(oid)), '{}'::jsonb)
      FROM pg_constraint WHERE conrelid='public.writer_deliverable_versions'::regclass AND contype='f'),
    'unicos', (SELECT coalesce(jsonb_object_agg(conname, pg_get_constraintdef(oid)), '{}'::jsonb)
      FROM pg_constraint WHERE conrelid='public.writer_deliverable_versions'::regclass AND contype IN ('u','p')),
    'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('trigger', t.tgname, 'funcao', p.proname)), '[]'::jsonb)
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND c.relname='writer_deliverable_versions'),
    'rls_ativa', (SELECT relrowsecurity FROM pg_class WHERE oid='public.writer_deliverable_versions'::regclass),
    'grants', (SELECT coalesce(jsonb_object_agg(grantee || ':' || privilege_type, 'yes'), '{}'::jsonb)
      FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='writer_deliverable_versions')),

  '3_rpcs_do_redator', (SELECT coalesce(jsonb_object_agg(p.proname, jsonb_build_object(
      'args', pg_get_function_arguments(p.oid),
      'retorno', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'search_path', p.proconfig,
      'grants', jsonb_build_object(
        'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE'),
        'public', has_function_privilege('public', p.oid, 'EXECUTE')))), '{}'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'writer_save_deliverable', 'writer_finalize_deliverable',
      'writer_mark_deliverable_version_superseded', 'writer_save_document')),

  '4_dados_existentes', jsonb_build_object(
    'entregaveis', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'status', d.status, 'lock_version', d.lock_version,
        'current_version_id', d.current_version_id,
        'content_hash', left(d.content_hash, 16),
        'versoes', (SELECT count(*) FROM public.writer_deliverable_versions v WHERE v.deliverable_id = d.id))), '[]'::jsonb)
      FROM public.writer_deliverables d),
    'versoes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'version_id', v.version_id, 'deliverable_id', v.deliverable_id,
        'version_number', v.version_number, 'previous_version_id', v.previous_version_id,
        'change_reason', v.change_reason, 'content_hash', left(v.content_hash, 16),
        'superseded_at', v.superseded_at,
        'e_a_corrente', (v.version_id = (SELECT d.current_version_id FROM public.writer_deliverables d WHERE d.id = v.deliverable_id)))
        ORDER BY v.deliverable_id, v.version_number), '[]'::jsonb)
      FROM public.writer_deliverable_versions v),
    'totais', jsonb_build_object(
      'entregaveis', (SELECT count(*) FROM public.writer_deliverables),
      'versoes', (SELECT count(*) FROM public.writer_deliverable_versions),
      'versoes_orfas', (SELECT count(*) FROM public.writer_deliverable_versions v
        WHERE NOT EXISTS (SELECT 1 FROM public.writer_deliverables d WHERE d.id = v.deliverable_id)),
      'aprovados', (SELECT count(*) FROM public.writer_deliverables WHERE status='approved'),
      'em_retencao', (SELECT count(*) FROM public.writer_deliverable_versions WHERE superseded_at IS NOT NULL)))

)) AS auditoria;
