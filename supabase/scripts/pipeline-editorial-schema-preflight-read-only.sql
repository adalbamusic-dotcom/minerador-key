-- PIPELINE EDITORIAL SCHEMA PREFLIGHT
-- Version: 2026-08-11-pipeline-editorial-schema-preflight-v4
-- Read-only: catalog metadata only; no DML, DDL, RPC, or migration execution.

WITH
target_tables(table_name) AS (
  VALUES
    ('editorial_artifact_versions'::text),
    ('editorial_workflow_items'::text),
    ('editorial_serp_snapshots'::text),
    ('editorial_serp_reviews'::text),
    ('content_documents'::text),
    ('content_document_versions'::text),
    ('content_document_user_states'::text),
    ('editorial_saved_views'::text),
    ('publication_records'::text)
),
expected_acl(table_name, role_name, privilege_list) AS (
  VALUES
    ('editorial_artifact_versions', 'authenticated', 'SELECT'),
    ('editorial_artifact_versions', 'service_role', 'SELECT,INSERT'),
    ('editorial_workflow_items', 'authenticated', 'SELECT'),
    ('editorial_workflow_items', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('editorial_serp_snapshots', 'authenticated', 'SELECT'),
    ('editorial_serp_snapshots', 'service_role', 'SELECT,INSERT'),
    ('editorial_serp_reviews', 'authenticated', 'SELECT'),
    ('editorial_serp_reviews', 'service_role', 'SELECT,INSERT'),
    ('content_documents', 'authenticated', 'SELECT'),
    ('content_documents', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('content_document_versions', 'authenticated', 'SELECT'),
    ('content_document_versions', 'service_role', 'SELECT,INSERT'),
    ('content_document_user_states', 'authenticated', 'SELECT'),
    ('content_document_user_states', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('editorial_saved_views', 'authenticated', 'SELECT'),
    ('editorial_saved_views', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('publication_records', 'authenticated', 'SELECT'),
    ('publication_records', 'service_role', 'SELECT,INSERT,UPDATE')
),
legacy_names(object_name) AS (
  VALUES
    ('editorial_version_status_events'::text),
    ('editorial_decision_events'::text),
    ('editorial_handoff_events'::text),
    ('content_document_comments'::text),
    ('editorial_silo_pages'::text)
),
target_presence AS (
  SELECT
    t.table_name,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t.table_name
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ) AS public_present,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = t.table_name
        AND n.nspname <> 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ) AS outside_public_present
  FROM target_tables t
),
collision_rows AS (
  SELECT count(*)::integer AS collision_count
  FROM target_tables t
  JOIN pg_class c ON c.relname = t.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace
),
legacy_rows AS (
  SELECT count(*)::integer AS legacy_count
  FROM legacy_names l
  JOIN pg_class c ON c.relname = l.object_name
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
),
required_relations AS (
  SELECT
    to_regclass('public.marcas') IS NOT NULL
      AND to_regclass('public.minerador_keywords') IS NOT NULL
      AND to_regclass('public.minerador_keyword_lists') IS NOT NULL
      AND to_regclass('auth.users') IS NOT NULL AS base_relations_present
),
required_helpers(helper_name, expected_signature, resolved_oid) AS (
  VALUES
    (
      'canonical_actor_can_access_brand'::text,
      'public.canonical_actor_can_access_brand(uuid,uuid)'::text,
      to_regprocedure('public.canonical_actor_can_access_brand(uuid,uuid)')::oid
    ),
    (
      'canonical_actor_can_use_brand_action'::text,
      'public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)'::text,
      to_regprocedure('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)')::oid
    )
),
helper_state AS (
  SELECT
    h.helper_name,
    h.expected_signature,
    h.resolved_oid IS NOT NULL
      AND p.oid IS NOT NULL
      AND n.nspname = 'public'
      AND p.proname = h.helper_name
      AND p.prokind = 'f' AS resolved,
    COALESCE(pg_get_userbyid(p.proowner), '[missing]') AS owner_role,
    COALESCE(p.prosecdef, false) AS security_definer,
    COALESCE(p.provolatile = 's', false) AS stable,
    COALESCE(p.prorettype = 'bool'::regtype::oid, false) AS returns_boolean,
    COALESCE((
      SELECT split_part(value, '=', 2)
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS config(value)
      WHERE value LIKE 'search_path=%'
      LIMIT 1
    ), '[not configured]') AS search_path,
    COALESCE(EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS config(value)
      WHERE value = 'search_path=pg_catalog, public, pg_temp'
    ), false) AS restricted_search_path,
    CASE
      WHEN h.resolved_oid IS NULL OR p.oid IS NULL THEN NULL::boolean
      WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN false
      ELSE has_function_privilege('anon', p.oid, 'EXECUTE')
    END AS anon_execute,
    CASE
      WHEN h.resolved_oid IS NULL OR p.oid IS NULL THEN NULL::boolean
      WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN false
      ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE')
    END AS authenticated_execute,
    CASE
      WHEN h.resolved_oid IS NULL OR p.oid IS NULL THEN NULL::boolean
      WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN false
      ELSE has_function_privilege('service_role', p.oid, 'EXECUTE')
    END AS service_role_execute
  FROM required_helpers h
  LEFT JOIN pg_proc p ON p.oid = h.resolved_oid
  LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
),
default_acl_forbidden AS (
  SELECT count(*)::integer AS forbidden_count
  FROM pg_default_acl d
  JOIN pg_roles owner_role ON owner_role.oid = d.defaclrole
  LEFT JOIN pg_namespace s ON s.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(d.defaclacl, ARRAY[]::aclitem[])) acl
  WHERE owner_role.rolname = 'postgres'
    AND COALESCE(s.nspname, '') = 'public'
    AND pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated', 'service_role', 'public')
),
required_roles AS (
  SELECT
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') AS postgres_present,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AS anon_present,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS authenticated_present,
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS service_role_present
),
existing_metadata AS (
  SELECT
    c.relname AS object_name,
    c.reltuples::bigint AS estimated_rows,
    pg_get_userbyid(c.relowner) AS owner,
    md5(concat_ws('|', n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner), COALESCE(c.relacl::text, ''))) AS object_fingerprint
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'marcas', 'minerador_keyword_lists', 'minerador_keywords', 'agencies',
      'brand_memberships', 'agency_brands'
    )
),
existing_summary AS (
  SELECT
    count(*)::integer AS relevant_relation_count,
    COALESCE(sum(CASE WHEN estimated_rows < 0 THEN 0 ELSE estimated_rows END), 0)::bigint AS estimated_row_total,
    md5(COALESCE(string_agg(object_name || '=' || object_fingerprint, '|' ORDER BY object_name), '')) AS existing_fingerprint
  FROM existing_metadata
),
migration_object_absence AS (
  SELECT count(*) FILTER (WHERE public_present OR outside_public_present)::integer AS present_count
  FROM target_presence
),
checks AS (
  SELECT 'script_version'::text AS check_name,
    '2026-08-11-pipeline-editorial-schema-preflight-v4'::text AS expected,
    '2026-08-11-pipeline-editorial-schema-preflight-v4'::text AS observed,
    'INFO'::text AS verdict
  UNION ALL
  SELECT 'session:current_user', 'postgres', current_user, CASE WHEN current_user = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'session:session_user', 'postgres', session_user, CASE WHEN session_user = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'session:current_role', 'postgres', current_role, CASE WHEN current_role = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'roles:required', 'postgres, anon, authenticated, service_role',
    concat_ws(', ', CASE WHEN postgres_present THEN 'postgres' END, CASE WHEN anon_present THEN 'anon' END, CASE WHEN authenticated_present THEN 'authenticated' END, CASE WHEN service_role_present THEN 'service_role' END),
    CASE WHEN postgres_present AND anon_present AND authenticated_present AND service_role_present THEN 'PASS' ELSE 'FAIL' END
  FROM required_roles
  UNION ALL
  SELECT 'default_acl:postgres/public:no-private-role-grants', '0 prohibited entries', forbidden_count::text,
    CASE WHEN forbidden_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM default_acl_forbidden
  UNION ALL
  SELECT 'dependencies:base-relations', 'marcas, minerador_keywords, minerador_keyword_lists, auth.users present',
    CASE WHEN base_relations_present THEN 'present' ELSE 'missing' END,
    CASE WHEN base_relations_present THEN 'PASS' ELSE 'FAIL' END
  FROM required_relations
  UNION ALL
  SELECT 'dependencies:canonical-brand-access-helper', 'canonical_actor_can_access_brand(uuid,uuid)',
    CASE WHEN resolved THEN 'present' ELSE 'missing' END,
    CASE WHEN resolved THEN 'PASS' ELSE 'FAIL' END
  FROM helper_state
  WHERE helper_name = 'canonical_actor_can_access_brand'
  UNION ALL
  SELECT 'dependencies:canonical-brand-action-helper', 'canonical_actor_can_use_brand_action(uuid,uuid,text,text)',
    CASE WHEN resolved THEN 'present' ELSE 'missing' END,
    CASE WHEN resolved THEN 'PASS' ELSE 'FAIL' END
  FROM helper_state
  WHERE helper_name = 'canonical_actor_can_use_brand_action'
  UNION ALL
  SELECT 'dependencies:canonical-brand-access-helper:contract',
    'owner=postgres; SECURITY DEFINER; STABLE; returns=boolean; search_path=pg_catalog, public, pg_temp; anon=false; authenticated=true; service_role=true',
    CASE WHEN resolved THEN concat('resolved=true; owner=', owner_role, '; security_definer=', security_definer, '; stable=', stable, '; returns_boolean=', returns_boolean, '; search_path=', search_path, '; anon_execute=', anon_execute, '; authenticated_execute=', authenticated_execute, '; service_role_execute=', service_role_execute) ELSE 'not evaluated: function not resolved' END,
    CASE WHEN NOT resolved THEN 'INFO' WHEN owner_role = 'postgres' AND security_definer AND stable AND returns_boolean AND restricted_search_path AND NOT anon_execute AND authenticated_execute AND service_role_execute THEN 'PASS' ELSE 'FAIL' END
  FROM helper_state
  WHERE helper_name = 'canonical_actor_can_access_brand'
  UNION ALL
  SELECT 'dependencies:canonical-brand-action-helper:contract',
    'owner=postgres; SECURITY DEFINER; STABLE; returns=boolean; search_path=pg_catalog, public, pg_temp; anon=false; authenticated=true; service_role=true',
    CASE WHEN resolved THEN concat('resolved=true; owner=', owner_role, '; security_definer=', security_definer, '; stable=', stable, '; returns_boolean=', returns_boolean, '; search_path=', search_path, '; anon_execute=', anon_execute, '; authenticated_execute=', authenticated_execute, '; service_role_execute=', service_role_execute) ELSE 'not evaluated: function not resolved' END,
    CASE WHEN NOT resolved THEN 'INFO' WHEN owner_role = 'postgres' AND security_definer AND stable AND returns_boolean AND restricted_search_path AND NOT anon_execute AND authenticated_execute AND service_role_execute THEN 'PASS' ELSE 'FAIL' END
  FROM helper_state
  WHERE helper_name = 'canonical_actor_can_use_brand_action'
  UNION ALL
  SELECT 'acl-contract:' || table_name || ':' || role_name, privilege_list,
    'not applicable before table creation', 'INFO'
  FROM expected_acl
  UNION ALL
  SELECT 'target:public-table-absence', '9 target tables absent from public',
    (SELECT count(*) FILTER (WHERE public_present)::integer::text FROM target_presence),
    CASE WHEN (SELECT count(*) FILTER (WHERE public_present) FROM target_presence) = 0 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'target:all-schema-name-collisions', '0 objects with target names in any schema', collision_count::text,
    CASE WHEN collision_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM collision_rows
  UNION ALL
  SELECT 'target:historical-legacy-name-collisions', '0 known legacy editorial object names in public', legacy_count::text,
    CASE WHEN legacy_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM legacy_rows
  UNION ALL
  SELECT 'migration:target-objects-not-applied', '0 target objects present', present_count::text,
    CASE WHEN present_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM migration_object_absence
  UNION ALL
  SELECT 'snapshot:relevant-existing-relations', 'catalog metadata only',
    concat('relations=', relevant_relation_count, '; estimated_rows=', estimated_row_total), 'INFO'
  FROM existing_summary
  UNION ALL
  SELECT 'snapshot:existing-public-objects-fingerprint', 'capture for post-apply comparison', existing_fingerprint, 'INFO'
  FROM existing_summary
  UNION ALL
  SELECT 'migration-history', 'target absence is the preflight proof; migration ledger is not read',
    'target-object absence checked', 'INFO'
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY CASE WHEN check_name = 'script_version' THEN 0 ELSE 1 END, check_name;
