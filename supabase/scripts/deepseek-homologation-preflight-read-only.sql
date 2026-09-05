-- Preflight remoto read-only da homologação real DeepSeek — Fase 3.
--
-- Este arquivo produz um único result set sanitizado.
-- Não lê conteúdo de segredo, não chama provider, não executa DDL/DML,
-- não cria TEMP e não altera Connection, Secret Store, capability ou Usage.
--
-- Execução manual, quando autorizada:
-- supabase db query --linked --file supabase/scripts/deepseek-homologation-preflight-read-only.sql

WITH
script_metadata AS (
  SELECT
    'SCRIPT_VERSION'::text AS check_name,
    'deepseek-homologation-preflight-read-only-v1'::text AS expected,
    'deepseek-homologation-preflight-read-only-v1'::text AS observed,
    'INFO'::text AS verdict
),
expected_tables(table_name) AS (
  VALUES
    ('integration_providers'),
    ('integration_capabilities'),
    ('integration_connections'),
    ('integration_grants'),
    ('integration_bindings'),
    ('integration_quota_policies'),
    ('integration_usage_events')
),
relation_catalog AS (
  SELECT
    e.table_name,
    c.oid,
    c.relrowsecurity,
    c.relforcerowsecurity,
    pg_get_userbyid(c.relowner) AS owner_role
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_class c
    ON c.oid = to_regclass('public.' || e.table_name)
),
relation_checks AS (
  SELECT
    'RELATION:' || table_name AS check_name,
    'public.' || table_name || '; present=true; RLS=true' AS expected,
    CASE
      WHEN oid IS NULL THEN 'present=false'
      ELSE 'present=true; RLS=' || relrowsecurity::text
        || '; force_RLS=' || relforcerowsecurity::text
        || '; owner=' || coalesce(owner_role, '<unknown>')
    END AS observed,
    CASE WHEN oid IS NOT NULL AND relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM relation_catalog
),
expected_columns(table_name, column_name, expected_type) AS (
  VALUES
    ('integration_providers', 'provider_key', 'text'),
    ('integration_providers', 'status', 'text'),
    ('integration_capabilities', 'capability_key', 'text'),
    ('integration_capabilities', 'operation_kind', 'text'),
    ('integration_capabilities', 'environment', 'text'),
    ('integration_capabilities', 'unit_name', 'text'),
    ('integration_capabilities', 'status', 'text'),
    ('integration_connections', 'provider_id', 'uuid'),
    ('integration_connections', 'owner_scope_type', 'text'),
    ('integration_connections', 'environment', 'text'),
    ('integration_connections', 'lifecycle_status', 'text'),
    ('integration_connections', 'secret_ref', 'text'),
    ('integration_connections', 'metadata', 'jsonb'),
    ('integration_grants', 'capability_id', 'uuid'),
    ('integration_grants', 'target_scope_type', 'text'),
    ('integration_grants', 'target_agency_id', 'uuid'),
    ('integration_grants', 'target_brand_id', 'uuid'),
    ('integration_grants', 'source_scope_type', 'text'),
    ('integration_grants', 'source_agency_id', 'uuid'),
    ('integration_grants', 'environment', 'text'),
    ('integration_grants', 'lifecycle_status', 'text'),
    ('integration_bindings', 'capability_id', 'uuid'),
    ('integration_bindings', 'target_scope_type', 'text'),
    ('integration_bindings', 'target_agency_id', 'uuid'),
    ('integration_bindings', 'target_brand_id', 'uuid'),
    ('integration_bindings', 'environment', 'text'),
    ('integration_bindings', 'source_kind', 'text'),
    ('integration_bindings', 'connection_id', 'uuid'),
    ('integration_bindings', 'grant_id', 'uuid'),
    ('integration_bindings', 'lifecycle_status', 'text'),
    ('integration_quota_policies', 'capability_id', 'uuid'),
    ('integration_quota_policies', 'scope_type', 'text'),
    ('integration_quota_policies', 'agency_id', 'uuid'),
    ('integration_quota_policies', 'brand_id', 'uuid'),
    ('integration_quota_policies', 'environment', 'text'),
    ('integration_quota_policies', 'window_kind', 'text'),
    ('integration_quota_policies', 'limit_units', 'numeric'),
    ('integration_quota_policies', 'status', 'text'),
    ('integration_usage_events', 'actor_user_id', 'uuid'),
    ('integration_usage_events', 'provider_id', 'uuid'),
    ('integration_usage_events', 'connection_id', 'uuid'),
    ('integration_usage_events', 'capability_id', 'uuid'),
    ('integration_usage_events', 'agency_id', 'uuid'),
    ('integration_usage_events', 'brand_id', 'uuid'),
    ('integration_usage_events', 'operation_kind', 'text'),
    ('integration_usage_events', 'module', 'text'),
    ('integration_usage_events', 'environment', 'text'),
    ('integration_usage_events', 'units', 'numeric'),
    ('integration_usage_events', 'unit_name', 'text'),
    ('integration_usage_events', 'cost_amount', 'numeric'),
    ('integration_usage_events', 'currency_code', 'text'),
    ('integration_usage_events', 'result_status', 'text'),
    ('integration_usage_events', 'provider_request_ref', 'text'),
    ('integration_usage_events', 'metadata', 'jsonb')
),
column_catalog AS (
  SELECT
    e.table_name,
    e.column_name,
    e.expected_type,
    c.data_type,
    c.udt_name,
    c.is_nullable
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
),
column_checks AS (
  SELECT
    'COLUMN:' || table_name || '.' || column_name AS check_name,
    expected_type || '; present=true' AS expected,
    CASE
      WHEN data_type IS NULL THEN 'present=false'
      ELSE 'present=true; data_type=' || coalesce(udt_name, data_type)
        || '; nullable=' || is_nullable
    END AS observed,
    CASE WHEN data_type IS NOT NULL AND (expected_type = data_type OR expected_type = udt_name) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM column_catalog
),
provider_catalog AS (
  SELECT
    expected.provider_key,
    p.id,
    p.display_name,
    p.status
  FROM (VALUES ('deepseek'), ('openrouter')) AS expected(provider_key)
  LEFT JOIN public.integration_providers p
    ON p.provider_key = expected.provider_key
),
provider_checks AS (
  SELECT
    'PROVIDER:' || provider_key AS check_name,
    CASE WHEN provider_key = 'deepseek' THEN 'provider active' ELSE 'historical only; no active runtime selection' END AS expected,
    CASE
      WHEN id IS NULL THEN 'present=false'
      ELSE 'present=true; id=' || id::text || '; status=' || status || '; display_name=' || display_name
    END AS observed,
    CASE
      WHEN provider_key = 'deepseek' AND status = 'active' THEN 'PASS'
      WHEN provider_key = 'deepseek' THEN 'FAIL'
      ELSE 'INFO'
    END AS verdict
  FROM provider_catalog
),
capability_catalog AS (
  SELECT id, capability_key, operation_kind, environment, unit_name, status
  FROM public.integration_capabilities
  WHERE capability_key = 'ai_generation'
),
capability_check AS (
  SELECT
    'CAPABILITY:ai_generation'::text AS check_name,
    'exactly one active production row; operation=ai_generation; unit_name=request'::text AS expected,
    'rows=' || count(*)::text || '; details=' || coalesce(
      string_agg(
        format('%s/%s/%s/%s/%s', id::text, environment, operation_kind, unit_name, status),
        ' | ' ORDER BY environment
      ),
      'none'
    ) AS observed,
    CASE
      WHEN count(*) FILTER (WHERE environment = 'production' AND operation_kind = 'ai_generation' AND unit_name = 'request' AND status = 'active') = 1
        AND count(*) FILTER (WHERE environment = 'production') = 1
      THEN 'PASS'
      WHEN count(*) = 0 THEN 'NOT_CONFIGURED'
      ELSE 'FAIL'
    END AS verdict
  FROM capability_catalog
),
connection_catalog AS (
  SELECT
    p.provider_key,
    c.id,
    c.owner_scope_type,
    c.environment,
    c.lifecycle_status,
    c.secret_ref,
    CASE
      WHEN p.provider_key = 'deepseek' THEN coalesce(
        nullif(c.metadata ->> 'deepseek_model', ''),
        nullif(c.metadata #>> '{deepseek,model}', ''),
        'deepseek-v4-pro'
      )
      WHEN p.provider_key = 'openrouter' THEN coalesce(
        nullif(c.metadata ->> 'openrouter_model', ''),
        nullif(c.metadata #>> '{openrouter,model}', ''),
        'not_read'
      )
      ELSE 'not_applicable'
    END AS configured_model,
    c.metadata -> 'health_check' ->> 'status' AS health_status,
    c.metadata -> 'health_check' ->> 'checked_at' AS health_checked_at,
    c.created_at
  FROM public.integration_connections c
  JOIN public.integration_providers p ON p.id = c.provider_id
  WHERE p.provider_key IN ('deepseek', 'openrouter')
),
connection_summary AS (
  SELECT
    provider_key,
    count(*) FILTER (WHERE owner_scope_type = 'platform' AND environment = 'production') AS production_platform_count,
    count(*) FILTER (WHERE owner_scope_type = 'platform' AND environment = 'production' AND lifecycle_status <> 'revoked') AS non_revoked_count,
    count(*) FILTER (WHERE owner_scope_type = 'platform' AND environment = 'production' AND lifecycle_status = 'ready') AS ready_count,
    count(*) FILTER (WHERE owner_scope_type = 'platform' AND environment = 'production' AND lifecycle_status = 'ready' AND secret_ref IS NOT NULL AND btrim(secret_ref) <> '') AS ready_with_secret_count,
    count(*) FILTER (WHERE owner_scope_type = 'platform' AND environment = 'production' AND lifecycle_status IN ('draft', 'pending', 'ready', 'error')) AS active_configuration_count,
    coalesce(
      string_agg(
        format('id=%s;scope=%s;env=%s;status=%s;secret_configured=%s;model=%s;health=%s;checked_at=%s', id::text, owner_scope_type, environment, lifecycle_status, (secret_ref IS NOT NULL AND btrim(secret_ref) <> '')::text, configured_model, coalesce(health_status, 'none'), coalesce(health_checked_at, 'none')),
        ' | ' ORDER BY created_at DESC
      ),
      'none'
    ) AS details
  FROM connection_catalog
  GROUP BY provider_key
),
expected_connection_summary AS (
  SELECT
    expected.provider_key,
    s.production_platform_count,
    s.non_revoked_count,
    s.ready_count,
    s.ready_with_secret_count,
    s.active_configuration_count,
    s.details
  FROM (VALUES ('deepseek'), ('openrouter')) AS expected(provider_key)
  LEFT JOIN connection_summary s USING (provider_key)
),
connection_checks AS (
  SELECT
    'CONNECTION:' || provider_key || ':platform:production' AS check_name,
    CASE WHEN provider_key = 'deepseek' THEN 'zero or one non-revoked platform connection; secret presence only; no secret contents' ELSE 'historical only; no draft/pending/ready/error OpenRouter configuration' END AS expected,
    CASE
      WHEN provider_key = 'deepseek' THEN format('production_platform=%s; non_revoked=%s; ready=%s; ready_with_secret=%s; details=%s', coalesce(production_platform_count, 0), coalesce(non_revoked_count, 0), coalesce(ready_count, 0), coalesce(ready_with_secret_count, 0), coalesce(details, 'none'))
      ELSE format('production_platform=%s; active_configuration=%s; details=%s', coalesce(production_platform_count, 0), coalesce(active_configuration_count, 0), coalesce(details, 'none'))
    END AS observed,
    CASE
      WHEN provider_key = 'deepseek' AND coalesce(non_revoked_count, 0) = 0 THEN 'NOT_CONFIGURED'
      WHEN provider_key = 'deepseek' AND coalesce(non_revoked_count, 0) = 1 AND coalesce(ready_with_secret_count, 0) = 1 THEN 'READY_FOR_EXPLICIT_HEALTH_CHECK'
      WHEN provider_key = 'deepseek' AND coalesce(non_revoked_count, 0) = 1 THEN 'CONFIGURATION_PENDING'
      WHEN provider_key = 'deepseek' THEN 'FAIL'
      WHEN coalesce(active_configuration_count, 0) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS verdict
  FROM expected_connection_summary
),
binding_summary AS (
  SELECT
    count(*) AS row_count,
    coalesce(
      string_agg(
        format('id=%s;target=%s/%s;source=%s;connection=%s;grant=%s;status=%s', b.id::text, b.target_scope_type, coalesce(b.target_agency_id, b.target_brand_id)::text, b.source_kind, coalesce(b.connection_id::text, 'null'), coalesce(b.grant_id::text, 'null'), b.lifecycle_status),
        ' | ' ORDER BY b.created_at
      ),
      'none'
    ) AS details
  FROM public.integration_bindings b
  JOIN public.integration_capabilities c ON c.id = b.capability_id
  WHERE c.capability_key = 'ai_generation'
    AND b.environment = 'production'
),
grant_summary AS (
  SELECT
    count(*) AS row_count,
    coalesce(
      string_agg(
        format('id=%s;target=%s/%s;source=%s/%s;status=%s', g.id::text, g.target_scope_type, coalesce(g.target_agency_id, g.target_brand_id)::text, g.source_scope_type, coalesce(g.source_agency_id::text, 'null'), g.lifecycle_status),
        ' | ' ORDER BY g.created_at
      ),
      'none'
    ) AS details
  FROM public.integration_grants g
  JOIN public.integration_capabilities c ON c.id = g.capability_id
  WHERE c.capability_key = 'ai_generation'
    AND g.environment = 'production'
),
quota_summary AS (
  SELECT
    count(*) AS row_count,
    coalesce(
      string_agg(
        format('id=%s;scope=%s;window=%s;limit=%s;status=%s', q.id::text, q.scope_type, q.window_kind, coalesce(q.limit_units::text, 'unlimited'), q.status),
        ' | ' ORDER BY q.created_at
      ),
      'none'
    ) AS details
  FROM public.integration_quota_policies q
  JOIN public.integration_capabilities c ON c.id = q.capability_id
  WHERE c.capability_key = 'ai_generation'
    AND q.environment = 'production'
),
governance_state_checks AS (
  SELECT
    'GOVERNANCE:ai_generation:bindings'::text AS check_name,
    'runtime atual usa homologation resource global; bindings/grants não são pré-requisito do caminho ai_generation, mas devem permanecer auditáveis'::text AS expected,
    format('bindings=%s; details=%s', b.row_count::text, b.details) AS observed,
    'INFO'::text AS verdict
  FROM binding_summary b
  UNION ALL
  SELECT
    'GOVERNANCE:ai_generation:grants',
    'runtime atual usa homologation resource global; grants não são pré-requisito do caminho ai_generation',
    format('grants=%s; details=%s', g.row_count::text, g.details),
    'INFO'
  FROM grant_summary g
  UNION ALL
  SELECT
    'GOVERNANCE:ai_generation:quota',
    'runtime atual usa quota ilimitada do homologation resource; quota persistida não é pré-requisito do caminho ai_generation',
    format('quotas=%s; details=%s', q.row_count::text, q.details),
    'INFO'
  FROM quota_summary q
),
expected_constraints(constraint_name) AS (
  VALUES
    ('uq_integration_providers_key_0024'),
    ('uq_integration_capabilities_key_0024'),
    ('uq_integration_connections_id_provider_0024'),
    ('ck_integration_connections_owner_scope_0024'),
    ('ck_integration_grants_target_scope_0024'),
    ('ck_integration_grants_source_scope_0024'),
    ('ck_integration_grants_hierarchy_0024'),
    ('ck_integration_grants_dates_0024'),
    ('ck_integration_grants_status_dates_0024'),
    ('ck_integration_bindings_target_scope_0024'),
    ('ck_integration_bindings_source_0034'),
    ('ck_integration_bindings_target_source_0034'),
    ('ck_integration_quota_scope_0024'),
    ('ck_integration_quota_period_0024'),
    ('fk_integration_usage_connection_provider_0024'),
    ('ck_integration_usage_module_scope_0024'),
    ('uq_integration_usage_events_idempotency_0024')
),
constraint_checks AS (
  SELECT
    'CONSTRAINT:' || e.constraint_name AS check_name,
    'present=true'::text AS expected,
    CASE WHEN c.oid IS NULL THEN 'present=false' ELSE 'present=true; def=' || pg_get_constraintdef(c.oid, true) END AS observed,
    CASE WHEN c.oid IS NULL THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM expected_constraints e
  LEFT JOIN pg_catalog.pg_constraint c
    ON c.conname = e.constraint_name
   AND c.connamespace = 'public'::regnamespace
),
expected_indexes(index_name) AS (
  VALUES
    ('uq_integration_connections_active_owner_0024'),
    ('uq_integration_grants_active_target_0024'),
    ('uq_integration_bindings_active_target_0024'),
    ('uq_integration_quota_active_scope_0024'),
    ('ix_integration_connections_provider_status_0024'),
    ('ix_integration_usage_events_provider_time_0024')
),
index_checks AS (
  SELECT
    'INDEX:' || e.index_name AS check_name,
    'present=true'::text AS expected,
    CASE WHEN i.indexname IS NULL THEN 'present=false' ELSE 'present=true; def=' || i.indexdef END AS observed,
    CASE WHEN i.indexname IS NULL THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM expected_indexes e
  LEFT JOIN pg_catalog.pg_indexes i
    ON i.schemaname = 'public'
   AND i.indexname = e.index_name
),
secret_function_catalog AS (
  SELECT
    resolve_proc.oid AS resolve_oid,
    resolve_proc.proowner AS resolve_owner,
    store_proc.oid AS store_oid,
    store_proc.proowner AS store_owner
  FROM (SELECT 1 AS seed) AS seed
  LEFT JOIN pg_catalog.pg_proc resolve_proc
    ON resolve_proc.oid = to_regprocedure('public.integration_secret_resolve(text)')
  LEFT JOIN pg_catalog.pg_proc store_proc
    ON store_proc.oid = to_regprocedure('public.integration_secret_store_upsert(text,text,text,text)')
),
secret_function_checks AS (
  SELECT
    'SECRET_STORE:functions'::text AS check_name,
    'resolve/store present; service_role EXECUTE; PUBLIC/anon/authenticated EXECUTE=false'::text AS expected,
    format(
      'resolve_present=%s; store_present=%s; resolve_owner=%s; store_owner=%s; service_role(resolve=%s,store=%s); public(resolve=%s,store=%s); anon(resolve=%s,store=%s); authenticated(resolve=%s,store=%s)',
      (resolve_oid IS NOT NULL)::text,
      (store_oid IS NOT NULL)::text,
      coalesce(pg_get_userbyid(resolve_owner), 'missing'),
      coalesce(pg_get_userbyid(store_owner), 'missing'),
      CASE WHEN resolve_oid IS NULL THEN 'false' ELSE has_function_privilege('service_role', 'public.integration_secret_resolve(text)', 'EXECUTE')::text END,
      CASE WHEN store_oid IS NULL THEN 'false' ELSE has_function_privilege('service_role', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')::text END,
      CASE WHEN resolve_oid IS NULL THEN 'false' ELSE has_function_privilege('public', 'public.integration_secret_resolve(text)', 'EXECUTE')::text END,
      CASE WHEN store_oid IS NULL THEN 'false' ELSE has_function_privilege('public', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')::text END,
      CASE WHEN resolve_oid IS NULL THEN 'false' ELSE has_function_privilege('anon', 'public.integration_secret_resolve(text)', 'EXECUTE')::text END,
      CASE WHEN store_oid IS NULL THEN 'false' ELSE has_function_privilege('anon', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')::text END,
      CASE WHEN resolve_oid IS NULL THEN 'false' ELSE has_function_privilege('authenticated', 'public.integration_secret_resolve(text)', 'EXECUTE')::text END,
      CASE WHEN store_oid IS NULL THEN 'false' ELSE has_function_privilege('authenticated', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')::text END
    ) AS observed,
    CASE
      WHEN resolve_oid IS NOT NULL
       AND store_oid IS NOT NULL
       AND has_function_privilege('service_role', 'public.integration_secret_resolve(text)', 'EXECUTE')
       AND has_function_privilege('service_role', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.integration_secret_resolve(text)', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.integration_secret_resolve(text)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.integration_secret_resolve(text)', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.integration_secret_store_upsert(text,text,text,text)', 'EXECUTE')
      THEN 'PASS'
      ELSE 'FAIL'
    END AS verdict
  FROM secret_function_catalog
),
usage_state AS (
  SELECT
    count(*) FILTER (WHERE p.provider_key = 'deepseek') AS deepseek_rows,
    count(*) FILTER (WHERE p.provider_key = 'openrouter') AS openrouter_rows,
    max(u.occurred_at) FILTER (WHERE p.provider_key = 'deepseek') AS deepseek_last,
    max(u.occurred_at) FILTER (WHERE p.provider_key = 'openrouter') AS openrouter_last
  FROM public.integration_usage_events u
  JOIN public.integration_providers p ON p.id = u.provider_id
  JOIN public.integration_capabilities c ON c.id = u.capability_id
  WHERE c.capability_key = 'ai_generation'
),
usage_check AS (
  SELECT
    'USAGE:ai_generation'::text AS check_name,
    'historical OpenRouter rows preserved; no DeepSeek rows expected before real smoke'::text AS expected,
    format('deepseek_rows=%s; deepseek_last=%s; openrouter_rows=%s; openrouter_last=%s', deepseek_rows::text, coalesce(deepseek_last::text, 'none'), openrouter_rows::text, coalesce(openrouter_last::text, 'none')) AS observed,
    CASE WHEN deepseek_rows = 0 THEN 'PASS' ELSE 'INFO' END AS verdict
  FROM usage_state
),
precheck_gate AS (
  SELECT
    'PREFLIGHT_GATE'::text AS check_name,
    'foundation intact; no active OpenRouter configuration; DeepSeek absent or uniquely ready for explicit health check'::text AS expected,
    format(
      'tables_rls_ok=%s; columns_ok=%s; providers_ok=%s; capability_ok=%s; constraints_ok=%s; indexes_ok=%s; secret_store_acl_ok=%s; deepseek_connection_non_revoked=%s; deepseek_connection_ready_with_secret=%s; openrouter_active_configuration=%s',
      (SELECT bool_and(oid IS NOT NULL AND relrowsecurity) FROM relation_catalog)::text,
      (SELECT bool_and(data_type IS NOT NULL AND (expected_type = data_type OR expected_type = udt_name)) FROM column_catalog)::text,
      coalesce(((SELECT status FROM provider_catalog WHERE provider_key = 'deepseek') = 'active')::text, 'false'),
      ((SELECT count(*) FROM capability_catalog WHERE environment = 'production' AND operation_kind = 'ai_generation' AND unit_name = 'request' AND status = 'active') = 1)::text,
      (SELECT bool_and(verdict = 'PASS') FROM constraint_checks)::text,
      (SELECT bool_and(verdict = 'PASS') FROM index_checks)::text,
      (SELECT verdict = 'PASS' FROM secret_function_checks)::text,
      coalesce((SELECT non_revoked_count FROM expected_connection_summary WHERE provider_key = 'deepseek'), 0)::text,
      coalesce((SELECT ready_with_secret_count FROM expected_connection_summary WHERE provider_key = 'deepseek'), 0)::text,
      coalesce((SELECT active_configuration_count FROM expected_connection_summary WHERE provider_key = 'openrouter'), 0)::text
    ) AS observed,
    CASE
      WHEN coalesce((SELECT active_configuration_count FROM expected_connection_summary WHERE provider_key = 'openrouter'), 0) > 0
      THEN 'OPENROUTER_CONFIGURATION_CONFLICT'
      WHEN NOT coalesce((SELECT bool_and(oid IS NOT NULL AND relrowsecurity) FROM relation_catalog), false)
        OR NOT coalesce((SELECT bool_and(data_type IS NOT NULL AND (expected_type = data_type OR expected_type = udt_name)) FROM column_catalog), false)
        OR (SELECT status FROM provider_catalog WHERE provider_key = 'deepseek') IS DISTINCT FROM 'active'
        OR (SELECT count(*) FROM capability_catalog WHERE environment = 'production' AND operation_kind = 'ai_generation' AND unit_name = 'request' AND status = 'active') <> 1
        OR NOT coalesce((SELECT bool_and(verdict = 'PASS') FROM constraint_checks), false)
        OR NOT coalesce((SELECT bool_and(verdict = 'PASS') FROM index_checks), false)
        OR coalesce((SELECT verdict FROM secret_function_checks), 'FAIL') <> 'PASS'
      THEN 'FOUNDATION_GAP'
      WHEN coalesce((SELECT non_revoked_count FROM expected_connection_summary WHERE provider_key = 'deepseek'), 0) = 0
      THEN 'NOT_CONFIGURED'
      WHEN coalesce((SELECT non_revoked_count FROM expected_connection_summary WHERE provider_key = 'deepseek'), 0) = 1
       AND coalesce((SELECT ready_with_secret_count FROM expected_connection_summary WHERE provider_key = 'deepseek'), 0) = 1
      THEN 'READY_FOR_EXPLICIT_HEALTH_CHECK'
      ELSE 'CONFIGURATION_PENDING'
    END AS verdict
),
all_checks AS (
  SELECT check_name, expected, observed, verdict FROM script_metadata
  UNION ALL SELECT check_name, expected, observed, verdict FROM relation_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM column_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM provider_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM capability_check
  UNION ALL SELECT check_name, expected, observed, verdict FROM connection_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM governance_state_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM constraint_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM index_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM secret_function_checks
  UNION ALL SELECT check_name, expected, observed, verdict FROM usage_check
  UNION ALL SELECT check_name, expected, observed, verdict FROM precheck_gate
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY CASE WHEN verdict IN ('FAIL', 'FOUNDATION_GAP', 'OPENROUTER_CONFIGURATION_CONFLICT') THEN 0 WHEN verdict IN ('PASS', 'READY_FOR_EXPLICIT_HEALTH_CHECK') THEN 1 ELSE 2 END, check_name;
