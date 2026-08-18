-- Somente leitura. Executar manualmente antes de aplicar 0040.
SELECT 'migration_candidate' AS check_name, '0040_minerador_discovery_multi_source.sql' AS expected_value;

SELECT table_name, column_name, is_nullable, column_default, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('minerador_discovery_runs', 'minerador_discovery_candidates')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS relation_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.minerador_discovery_runs'::regclass, 'public.minerador_discovery_candidates'::regclass)
ORDER BY conrelid::regclass::text, conname;

SELECT source, count(*) AS row_count
FROM public.minerador_discovery_runs
GROUP BY source
ORDER BY source;

SELECT source, count(*) AS row_count
FROM public.minerador_discovery_candidates
GROUP BY source
ORDER BY source;

SELECT relname AS relation_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid IN ('public.minerador_discovery_runs'::regclass, 'public.minerador_discovery_candidates'::regclass);

SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('persist_minerador_discovery_run', 'persist_minerador_discovery_source_run');
