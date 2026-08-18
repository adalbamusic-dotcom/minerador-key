-- TENANT_0005_GUARD_CLEANUP / POST-VERIFIER
-- READ-ONLY. Run manually after migration 0035.
-- The values below are the captured remote preflight evidence supplied for
-- this verification. They must not be recomputed after DROP TABLE.
-- One result set; no TEMP, DDL, DML, ACL, RLS or data changes.

WITH
expected AS (
  SELECT
    '656759095048cae1ad83b4c2212c0e4e'::text AS pre_drop_fingerprint,
    1720::bigint AS pre_drop_catalog_row_count,
    2::bigint AS observed_pre_post_row_delta,
    0::bigint AS pre_drop_external_consumers,
    0::bigint AS pre_drop_external_foreign_keys,
    0::bigint AS pre_drop_target_triggers
),
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
checks AS (
  SELECT
    'target_absent'::text AS check_name,
    'public.tenant_0005_migration_guard'::text AS object_name,
    CASE WHEN target_oid IS NULL THEN 'absent' ELSE 'still present' END::text AS observed,
    CASE WHEN target_oid IS NULL THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  FROM target

  UNION ALL

  SELECT
    'post_preserved_catalog_rows'::text,
    'public schema excluding target and target-owned catalog dependents'::text,
    catalog_row_count::text,
    'INFO'::text
  FROM preserved_fingerprint

  UNION ALL

  SELECT
    'post_preserved_fingerprint'::text,
    'public schema excluding target and target-owned catalog dependents'::text,
    fingerprint::text,
    'INFO'::text
  FROM preserved_fingerprint

  UNION ALL

  SELECT
    'pre_drop_evidence'::text,
    'captured remote preflight'::text,
    format('catalog_rows=%s; fingerprint=%s; exact pre-drop catalog cannot be recomputed after DROP',
      e.pre_drop_catalog_row_count,
      e.pre_drop_fingerprint)::text,
    'INFO'::text
  FROM expected AS e

  UNION ALL

  SELECT
    'pre_drop_external_boundary'::text,
    'captured remote preflight'::text,
    format('external_consumers=%s; external_foreign_keys=%s; target_triggers=%s',
      e.pre_drop_external_consumers,
      e.pre_drop_external_foreign_keys,
      e.pre_drop_target_triggers)::text,
    CASE WHEN e.pre_drop_external_consumers = 0
       AND e.pre_drop_external_foreign_keys = 0
       AND e.pre_drop_target_triggers = 0 THEN 'PASS' ELSE 'INVESTIGATE' END::text
  FROM expected AS e

  UNION ALL

  SELECT
    'target_internal_identity_evidence'::text,
    'public.tenant_0005_migration_guard_pkey'::text,
    'known candidate: the PK supporting index is internally tied through pg_constraint.conindid; the old scope could miss that indirect path. The second removed fingerprint row is not identifiable from the aggregate capture.'::text,
    'INVESTIGATE'::text

  UNION ALL

  SELECT
    'observed_row_delta'::text,
    'preserved_catalog_rows'::text,
    format('pre=%s; post=%s; delta=%s; supplied_delta_magnitude=%s',
      e.pre_drop_catalog_row_count,
      f.catalog_row_count,
      f.catalog_row_count - e.pre_drop_catalog_row_count,
      e.observed_pre_post_row_delta)::text,
    'INVESTIGATE'::text
  FROM target AS t
  CROSS JOIN expected AS e
  CROSS JOIN preserved_fingerprint AS f

  UNION ALL

  SELECT
    'fingerprint_pre_post'::text,
    'public schema preserved-object catalog fingerprint'::text,
    format('original_pre=%s; observed_post=%s; exact_equal=%s; original pre-drop row set is not reconstructable after DROP',
      e.pre_drop_fingerprint,
      f.fingerprint,
      (e.pre_drop_fingerprint = f.fingerprint)::text)::text,
    CASE
      WHEN e.pre_drop_fingerprint = f.fingerprint THEN 'PASS'
      ELSE 'INVESTIGATE'
    END::text
  FROM expected AS e
  CROSS JOIN preserved_fingerprint AS f
  CROSS JOIN target AS t

  UNION ALL

  SELECT
    'pre_drop_fingerprint_recalculation'::text,
    'captured evidence boundary'::text,
    'not possible after DROP TABLE; the original fingerprint is retained only as supplied pre-drop evidence'::text,
    'EVIDENCE_GAP'::text

  UNION ALL

  SELECT
    'unexpected_change'::text,
    '0035 cleanup boundary'::text,
    format('target_absent=%s; row_delta=%s; fingerprint_equal=%s; row identities are unavailable after DROP',
      (t.target_oid IS NULL)::text,
      (f.catalog_row_count - e.pre_drop_catalog_row_count)::text,
      (e.pre_drop_fingerprint = f.fingerprint)::text)::text,
    CASE
      WHEN e.pre_drop_fingerprint = f.fingerprint THEN 'PASS'
      ELSE 'INVESTIGATE'
    END::text
  FROM target AS t
  CROSS JOIN expected AS e
  CROSS JOIN preserved_fingerprint AS f

  UNION ALL

  SELECT
    'classification'::text,
    '0035 tenant_0005 guard cleanup'::text,
    'DROP completed with target absent; no external dependency evidence; the -2 aggregate delta cannot be attributed to exactly two catalog rows from the captured evidence'::text,
    CASE
      WHEN e.pre_drop_fingerprint = f.fingerprint THEN 'PASS'
      ELSE 'INVESTIGATE'
    END::text
  FROM target AS t
  CROSS JOIN expected AS e
  CROSS JOIN preserved_fingerprint AS f
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
