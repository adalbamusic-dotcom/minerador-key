-- TENANT_0005_MIGRATION_GUARD / READ-ONLY TARGETED PREFLIGHT
--
-- Este diagnóstico consulta somente public.tenant_0005_migration_guard e os
-- objetos catalogados que dependem diretamente dele. Não cria objetos
-- persistentes, não altera schema, dados, ACL ou RLS e não executa rollback.
--
-- O bloco DO abaixo executa apenas SELECT count(*) dinamicamente para que a
-- ausência da tabela também possa ser reportada sem falhar o diagnóstico.
-- O resultado exato aparece como NOTICE; o relatório catalogal aparece como
-- um único result set abaixo.

DO $$
DECLARE
  target_relation regclass;
  exact_row_count bigint;
  snapshot_row record;
BEGIN
  target_relation := pg_catalog.to_regclass('public.tenant_0005_migration_guard');

  IF target_relation IS NULL THEN
    RAISE NOTICE 'TENANT_0005_GUARD|EXISTENCE=missing|ROW_COUNT_EXACT=not_applicable';
    RETURN;
  END IF;

  EXECUTE format('SELECT count(*) FROM %s', target_relation) INTO exact_row_count;
  RAISE NOTICE 'TENANT_0005_GUARD|EXISTENCE=present|ROW_COUNT_EXACT=%', exact_row_count;

  FOR snapshot_row IN EXECUTE format(
    'SELECT migration_key, applied_at, brands_count, lists_count, keywords_count,
            keywords_without_list, keywords_with_list, membership_table_existed,
            roles_table_existed, permissions_table_existed, owner_membership_existed,
            (NULLIF(lista_id_fingerprint, '''') IS NOT NULL) AS fingerprint_present,
            cardinality(table_grant_keys) AS table_grant_key_count
       FROM %s ORDER BY migration_key',
    target_relation
  ) LOOP
    RAISE NOTICE 'TENANT_0005_GUARD|SNAPSHOT_ROW|migration_key=%|applied_at=%|brands=%|lists=%|keywords=%|without_list=%|with_list=%|membership_table=%|roles_table=%|permissions_table=%|owner_membership=%|fingerprint_present=%|table_grant_key_count=%',
      snapshot_row.migration_key,
      snapshot_row.applied_at,
      snapshot_row.brands_count,
      snapshot_row.lists_count,
      snapshot_row.keywords_count,
      snapshot_row.keywords_without_list,
      snapshot_row.keywords_with_list,
      snapshot_row.membership_table_existed,
      snapshot_row.roles_table_existed,
      snapshot_row.permissions_table_existed,
      snapshot_row.owner_membership_existed,
      snapshot_row.fingerprint_present,
      snapshot_row.table_grant_key_count;
  END LOOP;
END
$$;

WITH
target AS (
  SELECT
    c.oid,
    n.nspname::text AS schema_name,
    c.relname::text AS relation_name,
    c.relowner AS owner_oid,
    pg_catalog.pg_get_userbyid(c.relowner)::text AS owner_name,
    c.relkind::text AS relation_kind,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    c.relacl AS relacl,
    c.relacl::text AS raw_acl
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tenant_0005_migration_guard'
),
target_state AS (
  SELECT
    CASE WHEN EXISTS (SELECT 1 FROM target) THEN 'present' ELSE 'missing' END AS existence,
    COALESCE((SELECT oid::text FROM target), 'null') AS relation_oid,
    COALESCE((SELECT owner_name FROM target), 'not_available') AS owner_name,
    COALESCE((SELECT relation_kind FROM target), 'not_available') AS relation_kind,
    COALESCE((SELECT rls_enabled::text FROM target), 'not_available') AS rls_enabled,
    COALESCE((SELECT rls_forced::text FROM target), 'not_available') AS rls_forced,
    COALESCE((SELECT raw_acl FROM target), 'not_available') AS raw_acl
),
acl_rows AS (
  SELECT
    CASE WHEN exploded.grantee = 0 THEN 'PUBLIC'::text
         ELSE COALESCE(pg_catalog.pg_get_userbyid(exploded.grantee), 'oid:' || exploded.grantee::text)
    END AS grantee_name,
    exploded.privilege_type::text AS privilege_type,
    exploded.is_grantable::text AS is_grantable,
    (SELECT owner_name FROM target) AS owner_name
  FROM target
  LEFT JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(target.relacl, pg_catalog.acldefault('r', target.owner_oid))
  ) AS exploded ON true
),
acl_classified AS (
  SELECT
    grantee_name,
    privilege_type,
    is_grantable,
    CASE
      WHEN grantee_name = 'PUBLIC' THEN 'PUBLIC'
      WHEN grantee_name IN ('anon', 'authenticated', 'service_role') THEN grantee_name
      WHEN grantee_name = owner_name THEN 'OWNER'
      ELSE 'UNEXPECTED_ROLE'
    END AS role_class
  FROM acl_rows
  WHERE grantee_name IS NOT NULL
),
expected_acl_roles(role_name) AS (
  VALUES ('PUBLIC'::text), ('anon'::text), ('authenticated'::text), ('service_role'::text)
),
incoming_fks AS (
  SELECT
    child_ns.nspname::text AS child_schema,
    child.relname::text AS child_relation,
    fk.conname::text AS constraint_name,
    pg_catalog.pg_get_constraintdef(fk.oid, true)::text AS definition
  FROM target
  JOIN pg_catalog.pg_constraint AS fk
    ON fk.contype = 'f'::"char"
   AND fk.confrelid = target.oid
  JOIN pg_catalog.pg_class AS child ON child.oid = fk.conrelid
  JOIN pg_catalog.pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
),
outgoing_fks AS (
  SELECT
    parent_ns.nspname::text AS parent_schema,
    parent.relname::text AS parent_relation,
    fk.conname::text AS constraint_name,
    pg_catalog.pg_get_constraintdef(fk.oid, true)::text AS definition
  FROM target
  JOIN pg_catalog.pg_constraint AS fk
    ON fk.contype = 'f'::"char"
   AND fk.conrelid = target.oid
  JOIN pg_catalog.pg_class AS parent ON parent.oid = fk.confrelid
  JOIN pg_catalog.pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
),
function_dependency AS (
  SELECT
    p.oid::text AS object_oid,
    n.nspname::text AS object_schema,
    p.proname::text AS object_name,
    p.prokind::text AS object_kind,
    pg_catalog.pg_get_function_identity_arguments(p.oid)::text AS identity_arguments,
    d.deptype::text AS dependency_type,
    'pg_depend:function'::text AS evidence
  FROM target
  JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_catalog.pg_class'::regclass
   AND d.refobjid = target.oid
   AND d.classid = 'pg_catalog.pg_proc'::regclass
  JOIN pg_catalog.pg_proc AS p ON p.oid = d.objid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
),
function_source_reference AS (
  SELECT
    p.oid::text AS object_oid,
    n.nspname::text AS object_schema,
    p.proname::text AS object_name,
    p.prokind::text AS object_kind,
    pg_catalog.pg_get_function_identity_arguments(p.oid)::text AS identity_arguments,
    CASE
      WHEN lower(p.proname) LIKE '%rollback%'
        OR lower(p.prosrc) LIKE '%rollback%'
      THEN 'historical_rollback_candidate'
      ELSE 'database_function_source_reference'
    END AS dependency_type,
    'pg_proc.prosrc:text_reference'::text AS evidence
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE p.prosrc ILIKE '%tenant_0005_migration_guard%'
),
trigger_inventory AS (
  SELECT
    tr.tgname::text AS trigger_name,
    pg_catalog.pg_get_triggerdef(tr.oid, true)::text AS definition,
    p.oid::text AS function_oid,
    pn.nspname::text AS function_schema,
    p.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid)::text AS identity_arguments
  FROM target
  JOIN pg_catalog.pg_trigger AS tr ON tr.tgrelid = target.oid
  JOIN pg_catalog.pg_proc AS p ON p.oid = tr.tgfoid
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE NOT tr.tgisinternal
),
trigger_source_reference AS (
  SELECT
    tr.tgname::text AS trigger_name,
    tn.nspname::text AS trigger_schema,
    trigger_table.relname::text AS trigger_table,
    p.oid::text AS function_oid,
    pn.nspname::text AS function_schema,
    p.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid)::text AS identity_arguments,
    CASE
      WHEN lower(p.proname) LIKE '%rollback%'
        OR lower(p.prosrc) LIKE '%rollback%'
      THEN 'historical_rollback_candidate'
      ELSE 'database_trigger_source_reference'
    END AS purpose
  FROM pg_catalog.pg_trigger AS tr
  JOIN pg_catalog.pg_class AS trigger_table ON trigger_table.oid = tr.tgrelid
  JOIN pg_catalog.pg_namespace AS tn ON tn.oid = trigger_table.relnamespace
  JOIN pg_catalog.pg_proc AS p ON p.oid = tr.tgfoid
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE NOT tr.tgisinternal
    AND p.prosrc ILIKE '%tenant_0005_migration_guard%'
),
view_dependency AS (
  SELECT
    v.oid::text AS object_oid,
    vn.nspname::text AS object_schema,
    v.relname::text AS object_name,
    CASE v.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' ELSE v.relkind::text END AS object_kind,
    d.deptype::text AS dependency_type,
    left(pg_catalog.pg_get_viewdef(v.oid, true), 1200)::text AS definition,
    'pg_depend:view'::text AS evidence
  FROM target
  JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_catalog.pg_class'::regclass
   AND d.refobjid = target.oid
   AND d.classid = 'pg_catalog.pg_class'::regclass
  JOIN pg_catalog.pg_class AS v ON v.oid = d.objid AND v.relkind IN ('v', 'm')
  JOIN pg_catalog.pg_namespace AS vn ON vn.oid = v.relnamespace
),
view_source_reference AS (
  SELECT
    v.oid::text AS object_oid,
    vn.nspname::text AS object_schema,
    v.relname::text AS object_name,
    CASE v.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' ELSE v.relkind::text END AS object_kind,
    'definition_text_reference'::text AS dependency_type,
    left(pg_catalog.pg_get_viewdef(v.oid, true), 1200)::text AS definition,
    'pg_get_viewdef:text_reference'::text AS evidence
  FROM pg_catalog.pg_class AS v
  JOIN pg_catalog.pg_namespace AS vn ON vn.oid = v.relnamespace
  WHERE v.relkind IN ('v', 'm')
    AND pg_catalog.pg_get_viewdef(v.oid, true) ILIKE '%tenant_0005_migration_guard%'
),
dependency_inventory AS (
  SELECT
    'referenced_by'::text AS direction,
    d.classid::regclass::text AS object_class,
    d.objid::text AS object_oid,
    d.objsubid::text AS object_subid,
    d.refclassid::regclass::text AS referenced_class,
    d.refobjid::text AS referenced_oid,
    d.refobjsubid::text AS referenced_subid,
    d.deptype::text AS dependency_type
  FROM target
  JOIN pg_catalog.pg_depend AS d
    ON d.refobjid = target.oid
   AND d.refclassid = 'pg_catalog.pg_class'::regclass
  UNION ALL
  SELECT
    'owns_dependency'::text,
    d.classid::regclass::text,
    d.objid::text,
    d.objsubid::text,
    d.refclassid::regclass::text,
    d.refobjid::text,
    d.refobjsubid::text,
    d.deptype::text
  FROM target
  JOIN pg_catalog.pg_depend AS d
    ON d.objid = target.oid
   AND d.classid = 'pg_catalog.pg_class'::regclass
),
constraint_inventory AS (
  SELECT
    c.conname::text AS constraint_name,
    c.contype::text AS constraint_type,
    pg_catalog.pg_get_constraintdef(c.oid, true)::text AS definition
  FROM target
  JOIN pg_catalog.pg_constraint AS c ON c.conrelid = target.oid
),
column_inventory AS (
  SELECT
    c.ordinal_position::text AS ordinal_position,
    c.column_name::text AS column_name,
    c.data_type::text AS data_type,
    c.is_nullable::text AS is_nullable,
    COALESCE(c.column_default, 'NULL')::text AS column_default
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'tenant_0005_migration_guard'
),
index_inventory AS (
  SELECT
    i.indexname::text AS index_name,
    i.indexdef::text AS definition
  FROM pg_catalog.pg_indexes AS i
  WHERE i.schemaname = 'public'
    AND i.tablename = 'tenant_0005_migration_guard'
),
policy_inventory AS (
  SELECT
    p.policyname::text AS policy_name,
    pg_catalog.array_to_string(p.roles, ',')::text AS roles,
    p.cmd::text AS command,
    COALESCE(p.qual, 'NULL')::text AS using_expression,
    COALESCE(p.with_check, 'NULL')::text AS check_expression
  FROM pg_catalog.pg_policies AS p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'tenant_0005_migration_guard'
),
row_count AS (
  SELECT count(*)::bigint AS exact_row_count
  FROM public.tenant_0005_migration_guard
)
-- UNION_OUTPUT_CONTRACT = 4_COLUMNS
-- Contract: check_name text, object_name text, observed text, verdict text.
-- Every UNION ALL branch returns exactly these four text columns.
SELECT
  'ROW_COUNT'::text AS check_name,
  'public.tenant_0005_migration_guard'::text AS object_name,
  exact_row_count::text AS observed,
  'INFO'::text AS verdict
FROM row_count
UNION ALL
SELECT
  'RELATION'::text,
  'public.tenant_0005_migration_guard:existence'::text,
  state.existence::text,
  'INFO'::text
FROM target_state AS state
UNION ALL
SELECT
  'RELATION'::text,
  'public.tenant_0005_migration_guard:oid'::text,
  state.relation_oid::text,
  'INFO'::text
FROM target_state AS state
UNION ALL
SELECT
  'RELATION'::text,
  'public.tenant_0005_migration_guard:owner'::text,
  state.owner_name::text,
  'INFO'::text
FROM target_state AS state
UNION ALL
SELECT
  'RELATION'::text,
  'public.tenant_0005_migration_guard:kind'::text,
  state.relation_kind::text,
  'INFO'::text
FROM target_state AS state
UNION ALL
SELECT
  'RLS'::text,
  'public.tenant_0005_migration_guard:enabled'::text,
  state.rls_enabled::text,
  'INFO'::text
FROM target_state AS state
UNION ALL
SELECT
  'RLS'::text,
  'public.tenant_0005_migration_guard:forced'::text,
  state.rls_forced::text,
  'INFO'::text
FROM target_state AS state
UNION ALL
SELECT
  'ACL'::text,
  'public.tenant_0005_migration_guard:raw_acl'::text,
  state.raw_acl::text,
  'INFO'::text
FROM target_state AS state
UNION ALL
SELECT
  'COLUMN'::text,
  (ordinal_position || ':' || column_name)::text,
  format('type=%s; nullable=%s; default=%s', data_type, is_nullable, column_default)::text,
  'INFO'::text
FROM column_inventory
UNION ALL
SELECT
  'CONSTRAINT'::text,
  constraint_name::text,
  ('type=' || constraint_type || '; ' || definition)::text,
  'INFO'::text
FROM constraint_inventory
UNION ALL
SELECT
  'FK_INCOMING'::text,
  constraint_name::text,
  (child_schema || '.' || child_relation || '; ' || definition)::text,
  'INFO'::text
FROM incoming_fks
UNION ALL
SELECT
  'FK_OUTGOING'::text,
  constraint_name::text,
  (parent_schema || '.' || parent_relation || '; ' || definition)::text,
  'INFO'::text
FROM outgoing_fks
UNION ALL
SELECT
  'INDEX'::text,
  index_name::text,
  definition::text,
  'INFO'::text
FROM index_inventory
UNION ALL
SELECT
  'POLICY'::text,
  policy_name::text,
  ('roles=' || roles || '; command=' || command || '; using=' || using_expression || '; check=' || check_expression)::text,
  'INFO'::text
FROM policy_inventory
UNION ALL
SELECT
  'ACL'::text,
  expected.role_name::text,
  COALESCE(string_agg(acl.privilege_type || '; grantable=' || acl.is_grantable, ' | ' ORDER BY acl.privilege_type), 'NO_EXPLICIT_ENTRY')::text,
  (CASE WHEN count(acl.grantee_name) = 0 THEN 'INFO' ELSE 'OBSERVED' END)::text
FROM expected_acl_roles AS expected
LEFT JOIN acl_classified AS acl ON acl.grantee_name = expected.role_name
GROUP BY expected.role_name
UNION ALL
SELECT
  'ACL_UNEXPECTED_ROLE'::text,
  grantee_name::text,
  string_agg(privilege_type || '; grantable=' || is_grantable, ' | ' ORDER BY privilege_type)::text,
  'INVESTIGATE'::text
FROM acl_classified
WHERE role_class = 'UNEXPECTED_ROLE'
GROUP BY grantee_name
UNION ALL
SELECT
  'TRIGGER'::text,
  trigger_name::text,
  ('function=' || function_schema || '.' || function_name || '(' || identity_arguments || '); ' || definition)::text,
  'INVESTIGATE'::text
FROM trigger_inventory
UNION ALL
SELECT
  'TRIGGER_SOURCE_REFERENCE'::text,
  (trigger_schema || '.' || trigger_table || ':' || trigger_name)::text,
  ('function=' || function_schema || '.' || function_name || '(' || identity_arguments || '); purpose=' || purpose)::text,
  'INVESTIGATE'::text
FROM trigger_source_reference
UNION ALL
SELECT
  'FUNCTION_DEPENDENCY'::text,
  (object_schema || '.' || object_name || '(' || identity_arguments || ')')::text,
  ('oid=' || object_oid || '; kind=' || object_kind || '; dependency=' || dependency_type)::text,
  'INVESTIGATE'::text
FROM function_dependency
UNION ALL
SELECT
  'FUNCTION_SOURCE_REFERENCE'::text,
  (object_schema || '.' || object_name || '(' || identity_arguments || ')')::text,
  ('oid=' || object_oid || '; kind=' || object_kind || '; purpose=' || dependency_type)::text,
  'INVESTIGATE'::text
FROM function_source_reference
UNION ALL
SELECT
  'VIEW_DEPENDENCY'::text,
  (object_schema || '.' || object_name)::text,
  ('oid=' || object_oid || '; kind=' || object_kind || '; dependency=' || dependency_type || '; definition=' || definition)::text,
  'INVESTIGATE'::text
FROM view_dependency
UNION ALL
SELECT
  'VIEW_SOURCE_REFERENCE'::text,
  (object_schema || '.' || object_name)::text,
  ('oid=' || object_oid || '; kind=' || object_kind || '; dependency=' || dependency_type || '; definition=' || definition)::text,
  'INVESTIGATE'::text
FROM view_source_reference
UNION ALL
SELECT
  'PG_DEPEND'::text,
  (direction || '; object_class=' || object_class || '; object_oid=' || object_oid
    || '; object_subid=' || object_subid || '; referenced_class=' || referenced_class
    || '; referenced_oid=' || referenced_oid || '; referenced_subid=' || referenced_subid)::text,
  ('dependency_type=' || dependency_type)::text,
  'INVESTIGATE'::text
FROM dependency_inventory
UNION ALL
SELECT
  'CURRENT_OPERATIONAL_PURPOSE'::text,
  'database_function_or_trigger_reference_count'::text,
  ((SELECT count(*)::text FROM function_dependency)
    || ' dependency function(s); ' || (SELECT count(*)::text FROM function_source_reference)
    || ' source reference function(s); ' || (SELECT count(*)::text FROM trigger_inventory)
    || ' trigger(s) on target; ' || (SELECT count(*)::text FROM trigger_source_reference)
    || ' trigger function source reference(s)')::text,
  (CASE WHEN (SELECT count(*) FROM function_dependency) = 0
          AND (SELECT count(*) FROM function_source_reference) = 0
          AND (SELECT count(*) FROM trigger_inventory) = 0
          AND (SELECT count(*) FROM trigger_source_reference) = 0
       THEN 'PASS' ELSE 'INVESTIGATE' END)::text
UNION ALL
SELECT
  'CURRENT_OPERATIONAL_PURPOSE'::text,
  'runtime_consumer_confirmation'::text,
  'local audit reported zero runtime consumers; this remote query cannot prove application source usage'::text,
  'INFO'::text
UNION ALL
SELECT
  'CLASSIFICATION'::text,
  'public.tenant_0005_migration_guard'::text,
  CASE
    WHEN state.existence = 'missing' THEN 'target relation is absent; no current database object or rows exist'
    WHEN (SELECT count(*) FROM function_dependency) > 0
      OR (SELECT count(*) FROM function_source_reference) > 0
      OR (SELECT count(*) FROM trigger_inventory) > 0
      OR (SELECT count(*) FROM view_dependency) > 0
      OR (SELECT count(*) FROM view_source_reference) > 0
      OR (SELECT count(*) FROM acl_classified WHERE role_class = 'UNEXPECTED_ROLE') > 0
      THEN 'current catalog dependency or unexpected ACL exists; correlate with local runtime evidence before any decision'
    ELSE 'no current catalog dependency or unexpected ACL found; local zero-runtime evidence and historical row meaning still require review'
  END::text,
  CASE
    WHEN state.existence = 'missing' THEN 'DROP_SAFE'
    ELSE 'INVESTIGATE'
  END::text
FROM target_state AS state
ORDER BY check_name, object_name;
