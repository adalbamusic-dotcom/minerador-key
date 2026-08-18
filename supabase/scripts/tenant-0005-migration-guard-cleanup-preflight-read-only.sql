-- TENANT_0005_GUARD_CLEANUP / PRECHECK
-- READ-ONLY. Run manually before migration 0035.
-- One result set; no TEMP, DDL, DML, ACL, RLS or data changes.
-- The preserved-object fingerprint explicitly excludes the target relation
-- and catalog relations auto/internal-dependent on that target.

WITH
target AS (
  SELECT to_regclass('public.tenant_0005_migration_guard')::oid AS target_oid
),
-- PK/UNIQUE indexes are identified through pg_index as well as pg_depend:
-- the supporting index may depend internally on pg_constraint rather than
-- directly on the target pg_class row.
target_owned_relations AS (
  SELECT t.target_oid::oid AS relation_oid
  FROM target AS t
  WHERE t.target_oid IS NOT NULL

  UNION

  SELECT i.indexrelid::oid AS relation_oid
  FROM pg_catalog.pg_index AS i
  JOIN target AS t ON t.target_oid = i.indrelid

  UNION

  SELECT d.objid::oid AS relation_oid
  FROM pg_catalog.pg_depend AS d
  JOIN target AS t ON t.target_oid = d.refobjid
  WHERE d.classid = 'pg_class'::regclass
    AND d.refclassid = 'pg_class'::regclass
    AND d.deptype IN ('a', 'i')
),
row_count AS (
  SELECT count(*)::bigint AS exact_row_count
  FROM public.tenant_0005_migration_guard
),
external_dependencies AS (
  SELECT
    (
      SELECT count(*)::bigint
      FROM pg_catalog.pg_depend AS d
      JOIN pg_catalog.pg_proc AS p ON p.oid = d.objid
      WHERE d.classid = 'pg_proc'::regclass
        AND d.refclassid = 'pg_class'::regclass
        AND d.refobjid = t.target_oid
        AND d.deptype <> 'i'
    ) AS function_dependency_count,
    (
      SELECT count(*)::bigint
      FROM pg_catalog.pg_depend AS d
      JOIN pg_catalog.pg_class AS v ON v.oid = d.objid
      WHERE d.classid = 'pg_class'::regclass
        AND d.refclassid = 'pg_class'::regclass
        AND d.refobjid = t.target_oid
        AND v.relkind IN ('v', 'm')
        AND d.deptype <> 'i'
    ) AS view_dependency_count,
    (
      SELECT count(*)::bigint
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND p.prosrc ILIKE '%tenant_0005_migration_guard%'
    ) AS function_source_reference_count,
    (
      SELECT count(*)::bigint
      FROM pg_catalog.pg_constraint AS c
      WHERE c.contype = 'f'
        AND (c.conrelid = t.target_oid OR c.confrelid = t.target_oid)
        AND NOT (c.conrelid = t.target_oid AND c.confrelid = t.target_oid)
    ) AS external_fk_count,
    (
      SELECT count(*)::bigint
      FROM pg_catalog.pg_trigger AS tg
      WHERE tg.tgrelid = t.target_oid
        AND NOT tg.tgisinternal
    ) AS target_trigger_count
  FROM target AS t
),
preserved_relations AS (
  SELECT
    c.oid,
    c.relname::text AS relation_name,
    c.relkind::text AS relation_kind,
    pg_get_userbyid(c.relowner)::text AS owner_name,
    c.relpersistence::text AS persistence,
    c.relrowsecurity::text AS rls_enabled,
    c.relforcerowsecurity::text AS rls_forced,
    coalesce(array_to_string(c.reloptions, ','), '<NULL>')::text AS relation_options,
    coalesce(array_to_string(c.relacl, ','), '<NULL>')::text AS relation_acl
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  LEFT JOIN target_owned_relations AS owned ON owned.relation_oid = c.oid
  WHERE n.nspname = 'public'
    AND owned.relation_oid IS NULL
),
preserved_catalog_rows AS (
  SELECT
    ('namespace|public|owner=' || pg_get_userbyid(n.nspowner)
      || '|acl=' || coalesce(array_to_string(n.nspacl, ','), '<NULL>'))::text AS row_text
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname = 'public'

  UNION ALL

  SELECT
    ('relation|' || r.relation_name
      || '|kind=' || r.relation_kind
      || '|owner=' || r.owner_name
      || '|persistence=' || r.persistence
      || '|rls=' || r.rls_enabled
      || '|forced=' || r.rls_forced
      || '|options=' || r.relation_options
      || '|acl=' || r.relation_acl
      || CASE WHEN r.relation_kind IN ('v', 'm')
        THEN '|view_definition=' || pg_get_viewdef(r.oid, true)
        ELSE ''
      END)::text
  FROM preserved_relations AS r

  UNION ALL

  SELECT
    ('column|' || r.relation_name || '|' || a.attnum::text || '|' || a.attname
      || '|type=' || format_type(a.atttypid, a.atttypmod)
      || '|not_null=' || a.attnotnull::text
      || '|identity=' || a.attidentity::text
      || '|generated=' || a.attgenerated::text
      || '|default=' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '<NULL>'))::text
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = r.oid
  LEFT JOIN pg_catalog.pg_attrdef AS ad
    ON ad.adrelid = a.attrelid
   AND ad.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped

  UNION ALL

  SELECT
    ('constraint|' || r.relation_name || '|' || c.conname
      || '|type=' || c.contype::text
      || '|deferrable=' || c.condeferrable::text
      || '|deferred=' || c.condeferred::text
      || '|definition=' || pg_get_constraintdef(c.oid, true))::text
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_constraint AS c ON c.conrelid = r.oid

  UNION ALL

  SELECT
    ('index|' || r.relation_name || '|' || idx.relname
      || '|unique=' || i.indisunique::text
      || '|primary=' || i.indisprimary::text
      || '|valid=' || i.indisvalid::text
      || '|definition=' || pg_get_indexdef(i.indexrelid))::text
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_index AS i ON i.indrelid = r.oid
  JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid

  UNION ALL

  SELECT
    ('policy|' || p.schemaname || '.' || p.tablename || '|' || p.policyname
      || '|roles=' || coalesce(array_to_string(p.roles, ','), '<NULL>')
      || '|command=' || p.cmd
      || '|using=' || coalesce(p.qual, '<NULL>')
      || '|check=' || coalesce(p.with_check, '<NULL>'))::text
  FROM pg_catalog.pg_policies AS p
  JOIN preserved_relations AS r ON r.relation_name = p.tablename
  WHERE p.schemaname = 'public'

  UNION ALL

  SELECT
    ('trigger|' || n.nspname || '.' || r.relation_name || '|' || tg.tgname
      || '|enabled=' || tg.tgenabled::text
      || '|definition=' || pg_get_triggerdef(tg.oid, true))::text
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_trigger AS tg ON tg.tgrelid = r.oid
  JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  WHERE NOT tg.tgisinternal

  UNION ALL

  SELECT
    ('routine|' || n.nspname || '.' || p.proname || '('
      || pg_get_function_identity_arguments(p.oid) || ')'
      || '|kind=' || p.prokind::text
      || '|owner=' || pg_get_userbyid(p.proowner)
      || '|security_definer=' || p.prosecdef::text
      || '|volatility=' || p.provolatile::text
      || '|config=' || coalesce(array_to_string(p.proconfig, ','), '<NULL>')
      || '|acl=' || coalesce(array_to_string(p.proacl, ','), '<NULL>')
      || '|definition_md5=' || md5(pg_get_functiondef(p.oid)))::text
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
),
preserved_fingerprint AS (
  SELECT
    count(*)::bigint AS catalog_row_count,
    md5(coalesce(string_agg(row_text, E'\n' ORDER BY row_text), ''))::text AS fingerprint
  FROM preserved_catalog_rows
),
target_owned_inventory AS (
  SELECT
    count(*)::bigint AS relation_count,
    coalesce(string_agg(
      n.nspname || '.' || c.relname || '|oid=' || c.oid::text || '|kind=' || c.relkind::text,
      ' | ' ORDER BY n.nspname, c.relname, c.oid
    ), 'none')::text AS relations
  FROM target_owned_relations AS owned
  JOIN pg_catalog.pg_class AS c ON c.oid = owned.relation_oid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
),
checks AS (
  SELECT
    'table_present'::text AS check_name,
    'public.tenant_0005_migration_guard'::text AS object_name,
    CASE WHEN target_oid IS NULL THEN 'missing' ELSE 'present' END::text AS observed,
    CASE WHEN target_oid IS NULL THEN 'FAIL' ELSE 'PASS' END::text AS verdict
  FROM target

  UNION ALL

  SELECT
    'row_count'::text,
    'public.tenant_0005_migration_guard'::text,
    exact_row_count::text,
    CASE WHEN exact_row_count = 1 THEN 'PASS' ELSE 'FAIL' END::text
  FROM row_count

  UNION ALL

  SELECT
    'external_consumers'::text,
    'public.tenant_0005_migration_guard'::text,
    format('functions=%s; views=%s; source_references=%s',
      function_dependency_count,
      view_dependency_count,
      function_source_reference_count)::text,
    CASE WHEN function_dependency_count + view_dependency_count + function_source_reference_count = 0
      THEN 'PASS' ELSE 'FAIL' END::text
  FROM external_dependencies

  UNION ALL

  SELECT
    'external_foreign_keys'::text,
    'public.tenant_0005_migration_guard'::text,
    external_fk_count::text,
    CASE WHEN external_fk_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM external_dependencies

  UNION ALL

  SELECT
    'target_triggers'::text,
    'public.tenant_0005_migration_guard'::text,
    target_trigger_count::text,
    CASE WHEN target_trigger_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM external_dependencies

  UNION ALL

  SELECT
    'pre_drop_preserved_catalog_rows'::text,
    'public schema excluding target and target-owned catalog dependents'::text,
    catalog_row_count::text,
    'INFO'::text
  FROM preserved_fingerprint

  UNION ALL

  SELECT
    'pre_drop_preserved_fingerprint'::text,
    'public schema excluding target and target-owned catalog dependents'::text,
    fingerprint::text,
    'INFO'::text
  FROM preserved_fingerprint

  UNION ALL

  SELECT
    'pre_drop_target_owned_relations'::text,
    'target and all target-owned pg_class relations'::text,
    format('count=%s; %s', relation_count, relations)::text,
    'INFO'::text
  FROM target_owned_inventory

  UNION ALL

  SELECT
    'runtime_consumer_boundary'::text,
    'application runtime'::text,
    'runtime zero-consumer evidence is local; this query reports database catalog evidence only'::text,
    'INFO'::text
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
