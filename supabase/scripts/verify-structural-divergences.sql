-- Sprint 0: auditoria estrutural somente leitura.
-- Pode ser executada pelo wrapper PowerShell ou colada no SQL Editor do Supabase.

BEGIN TRANSACTION READ ONLY;

-- 1. Colunas cuja existencia precisa ser confirmada antes da Sprint 1.
WITH expected(table_name, column_name) AS (
  VALUES
    ('keywords_kgr', 'marca_id'),
    ('briefings_artigos', 'status'),
    ('listas_kgr', 'slug'),
    ('keywords_kgr', 'slug'),
    ('keywords_kgr', 'canonical'),
    ('briefings_artigos', 'slug_sugerido'),
    ('briefings_artigos', 'canonical')
)
SELECT
  expected.table_name,
  expected.column_name,
  columns.data_type,
  (columns.column_name IS NOT NULL) AS exists_in_database
FROM expected
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = 'public'
 AND columns.table_name = expected.table_name
 AND columns.column_name = expected.column_name
ORDER BY expected.table_name, expected.column_name;

-- 2. Chaves primarias e estrangeiras das tabelas do aplicativo.
SELECT
  constraints.table_name,
  constraints.constraint_name,
  constraints.constraint_type,
  key_usage.column_name,
  foreign_columns.table_name AS referenced_table,
  foreign_columns.column_name AS referenced_column
FROM information_schema.table_constraints AS constraints
LEFT JOIN information_schema.key_column_usage AS key_usage
  ON key_usage.constraint_schema = constraints.constraint_schema
 AND key_usage.constraint_name = constraints.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS foreign_columns
  ON foreign_columns.constraint_schema = constraints.constraint_schema
 AND foreign_columns.constraint_name = constraints.constraint_name
WHERE constraints.table_schema = 'public'
  AND constraints.table_name IN ('marcas', 'perfis', 'listas_kgr', 'keywords_kgr', 'briefings_artigos')
  AND constraints.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY constraints.table_name, constraints.constraint_name, key_usage.ordinal_position;

-- 3. Indices.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('marcas', 'perfis', 'listas_kgr', 'keywords_kgr', 'briefings_artigos')
ORDER BY tablename, indexname;

-- 4. Funcoes de protecao esperadas pela migration 0001.
WITH expected(function_name) AS (
  VALUES
    ('protect_published_keyword'),
    ('protect_published_lista'),
    ('protect_marca_with_published'),
    ('protect_published_briefing')
)
SELECT
  expected.function_name,
  (procedures.oid IS NOT NULL) AS installed
FROM expected
LEFT JOIN pg_proc AS procedures
  ON procedures.proname = expected.function_name
LEFT JOIN pg_namespace AS namespaces
  ON namespaces.oid = procedures.pronamespace
 AND namespaces.nspname = 'public'
ORDER BY expected.function_name;

-- 5. Triggers instalados e suas definicoes.
SELECT
  tables.relname AS table_name,
  triggers.tgname AS trigger_name,
  functions.proname AS function_name,
  pg_get_triggerdef(triggers.oid, true) AS definition
FROM pg_trigger AS triggers
JOIN pg_class AS tables ON tables.oid = triggers.tgrelid
JOIN pg_namespace AS namespaces ON namespaces.oid = tables.relnamespace
JOIN pg_proc AS functions ON functions.oid = triggers.tgfoid
WHERE namespaces.nspname = 'public'
  AND NOT triggers.tgisinternal
  AND tables.relname IN ('marcas', 'perfis', 'listas_kgr', 'keywords_kgr', 'briefings_artigos')
ORDER BY tables.relname, triggers.tgname;

-- 6. Estado de RLS.
SELECT
  tables.relname AS table_name,
  tables.relrowsecurity AS rls_enabled,
  tables.relforcerowsecurity AS rls_forced
FROM pg_class AS tables
JOIN pg_namespace AS namespaces ON namespaces.oid = tables.relnamespace
WHERE namespaces.nspname = 'public'
  AND tables.relkind = 'r'
  AND tables.relname IN ('marcas', 'perfis', 'listas_kgr', 'keywords_kgr', 'briefings_artigos')
ORDER BY tables.relname;

-- 7. Policies RLS.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('marcas', 'perfis', 'listas_kgr', 'keywords_kgr', 'briefings_artigos')
ORDER BY tablename, policyname;

-- 8. Grants de tabela e de funcoes publicas.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('marcas', 'perfis', 'listas_kgr', 'keywords_kgr', 'briefings_artigos')
ORDER BY table_name, grantee, privilege_type;

SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema = 'public'
  AND routine_name LIKE 'protect_%'
ORDER BY routine_name, grantee, privilege_type;

-- 9. Divergencias entre marcas.silos_existentes e listas_kgr.
WITH configured_silos AS (
  SELECT
    marcas.id::text AS marca_id,
    lower(trim(coalesce(element->>'nome', trim(both '"' from element::text)))) AS silo_name,
    nullif(element->>'slug', '') AS configured_slug
  FROM public.marcas AS marcas
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(to_jsonb(marcas)->'silos_existentes') = 'array'
        THEN to_jsonb(marcas)->'silos_existentes'
      ELSE '[]'::jsonb
    END
  ) AS element
),
database_silos AS (
  SELECT
    to_jsonb(listas)->>'marca_id' AS marca_id,
    lower(trim(to_jsonb(listas)->>'nome')) AS silo_name,
    nullif(to_jsonb(listas)->>'slug', '') AS database_slug
  FROM public.listas_kgr AS listas
)
SELECT
  coalesce(configured.marca_id, database.marca_id) AS marca_id,
  coalesce(configured.silo_name, database.silo_name) AS silo_name,
  configured.configured_slug,
  database.database_slug,
  CASE
    WHEN configured.silo_name IS NULL THEN 'somente_listas_kgr'
    WHEN database.silo_name IS NULL THEN 'somente_marcas_jsonb'
    WHEN configured.configured_slug IS DISTINCT FROM database.database_slug THEN 'slug_divergente'
    ELSE 'alinhado'
  END AS result
FROM configured_silos AS configured
FULL OUTER JOIN database_silos AS database
  ON database.marca_id = configured.marca_id
 AND database.silo_name = configured.silo_name
WHERE configured.silo_name IS NULL
   OR database.silo_name IS NULL
   OR configured.configured_slug IS DISTINCT FROM database.database_slug
ORDER BY marca_id, silo_name;

-- 10. Keywords sem lista ou com lista inexistente.
SELECT
  to_jsonb(keywords)->>'id' AS keyword_id,
  to_jsonb(keywords)->>'keyword' AS keyword,
  to_jsonb(keywords)->>'lista_id' AS lista_id,
  CASE
    WHEN nullif(to_jsonb(keywords)->>'lista_id', '') IS NULL THEN 'sem_lista'
    ELSE 'lista_inexistente'
  END AS result
FROM public.keywords_kgr AS keywords
LEFT JOIN public.listas_kgr AS listas
  ON listas.id::text = to_jsonb(keywords)->>'lista_id'
WHERE nullif(to_jsonb(keywords)->>'lista_id', '') IS NULL
   OR listas.id IS NULL
ORDER BY keyword_id;

-- 11. Listas sem marca ou com marca inexistente.
SELECT
  to_jsonb(listas)->>'id' AS lista_id,
  to_jsonb(listas)->>'nome' AS lista_nome,
  to_jsonb(listas)->>'marca_id' AS marca_id,
  CASE
    WHEN nullif(to_jsonb(listas)->>'marca_id', '') IS NULL THEN 'sem_marca'
    ELSE 'marca_inexistente'
  END AS result
FROM public.listas_kgr AS listas
LEFT JOIN public.marcas AS marcas
  ON marcas.id::text = to_jsonb(listas)->>'marca_id'
WHERE nullif(to_jsonb(listas)->>'marca_id', '') IS NULL
   OR marcas.id IS NULL
ORDER BY lista_id;

-- 12. Briefings sem silo ou sem marca identificavel pelo silo.
SELECT
  to_jsonb(briefings)->>'id' AS briefing_id,
  to_jsonb(briefings)->>'silo_id' AS silo_id,
  to_jsonb(listas)->>'marca_id' AS resolved_marca_id,
  CASE
    WHEN nullif(to_jsonb(briefings)->>'silo_id', '') IS NULL THEN 'sem_silo'
    WHEN listas.id IS NULL THEN 'silo_inexistente'
    WHEN nullif(to_jsonb(listas)->>'marca_id', '') IS NULL THEN 'silo_sem_marca'
    WHEN marcas.id IS NULL THEN 'marca_inexistente'
  END AS result
FROM public.briefings_artigos AS briefings
LEFT JOIN public.listas_kgr AS listas
  ON listas.id::text = to_jsonb(briefings)->>'silo_id'
LEFT JOIN public.marcas AS marcas
  ON marcas.id::text = to_jsonb(listas)->>'marca_id'
WHERE nullif(to_jsonb(briefings)->>'silo_id', '') IS NULL
   OR listas.id IS NULL
   OR nullif(to_jsonb(listas)->>'marca_id', '') IS NULL
   OR marcas.id IS NULL
ORDER BY briefing_id;

COMMIT;
