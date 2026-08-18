-- Auditoria opcional de ledger — geração canônica.
-- Execute somente após o catálogo confirmar supabase_migrations.schema_migrations
-- e a permissão de leitura. Contém exclusivamente SELECT e WITH.
-- Não retorna statements nem presume inserted_at.

SELECT column_name, ordinal_position, data_type
FROM information_schema.columns
WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations'
ORDER BY ordinal_position;

SELECT CASE
         WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
           THEN 'LEDGER_RELATION_UNAVAILABLE'
         ELSE 'LEDGER_RELATION_PRESENT'
       END AS ledger_state;

WITH expected_objects(migration_version, object_name, object_kind) AS (
  VALUES ('0005', 'tenant_0005_migration_guard', 'table'), ('0005', 'can_access_brand', 'function'),
         ('0005', 'can_manage_brand', 'function'), ('0005', 'tenant_actor_has_permission', 'function'),
         ('0007', 'minerador_google_ads_connections', 'table'), ('0009', 'minerador_discovery_runs', 'table'),
         ('0010', 'minerador_discovery_import_batches', 'table'), ('0013', 'minerador_discovery_candidate_current_metrics', 'table'),
         ('0014', 'agencies', 'table'), ('0014', 'agency_memberships', 'table'), ('0014', 'agency_brands', 'table'),
         ('0014', 'can_access_agency', 'function'), ('0014', 'can_manage_agency', 'function')
), ledger_capability AS (
  SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS relation_available
), objects AS (
  SELECT c.relname AS object_name, 'table' AS object_kind
  FROM pg_catalog.pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT p.proname, 'function'
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
)
SELECT e.migration_version, e.object_name, e.object_kind,
       (SELECT relation_available FROM ledger_capability) AS ledger_relation_available,
       EXISTS (SELECT 1 FROM objects o WHERE o.object_name = e.object_name AND o.object_kind = e.object_kind) AS object_in_catalog,
       CASE WHEN NOT (SELECT relation_available FROM ledger_capability)
                  AND EXISTS (SELECT 1 FROM objects o WHERE o.object_name = e.object_name AND o.object_kind = e.object_kind) THEN 'OBJECT_PRESENT_LEDGER_UNAVAILABLE'
            WHEN NOT (SELECT relation_available FROM ledger_capability) THEN 'OBJECT_AND_LEDGER_UNAVAILABLE'
            WHEN EXISTS (SELECT 1 FROM objects o WHERE o.object_name = e.object_name AND o.object_kind = e.object_kind) THEN 'LEDGER_CONTENT_REVIEW_REQUIRED'
            ELSE 'NOT_FOUND' END AS audit_state
FROM expected_objects e
ORDER BY e.migration_version, e.object_kind, e.object_name;
