-- DEVELOPMENT DATA RESET verifier (read-only), version 2026-08-12-v4.
-- One sanitized result set. It never reads row payloads, URLs, e-mails or secrets.
WITH required_relations AS (
  SELECT unnest(ARRAY[
    'marcas', 'minerador_keyword_lists', 'minerador_keywords', 'editorial_workflow_items',
    'editorial_artifact_versions', 'editorial_serp_snapshots', 'editorial_serp_reviews',
    'content_documents', 'content_document_versions', 'content_document_user_states',
    'editorial_saved_views', 'publication_records', 'agencies', 'agency_memberships',
    'agency_brands', 'agency_applications', 'agency_invitations', 'agency_onboardings',
    'communication_messages', 'communication_delivery_events',
    'platform_communication_config', 'integration_providers', 'integration_capabilities',
    'integration_connections', 'integration_usage_events',
    'brand_exceptional_operation_grants', 'brand_exceptional_operation_execution_events',
    'tenant_0016_agency_role_rollback'
  ]) AS table_name
), reset_counts AS (
  SELECT 'marcas'::text AS table_name, count(*)::bigint AS row_count FROM public.marcas
  UNION ALL SELECT 'minerador_keyword_lists', count(*) FROM public.minerador_keyword_lists
  UNION ALL SELECT 'minerador_keywords', count(*) FROM public.minerador_keywords
  UNION ALL SELECT 'minerador_google_ads_connections', count(*) FROM public.minerador_google_ads_connections
  UNION ALL SELECT 'minerador_keyword_metric_measurements', count(*) FROM public.minerador_keyword_metric_measurements
  UNION ALL SELECT 'minerador_discovery_runs', count(*) FROM public.minerador_discovery_runs
  UNION ALL SELECT 'minerador_discovery_candidates', count(*) FROM public.minerador_discovery_candidates
  UNION ALL SELECT 'minerador_discovery_import_batches', count(*) FROM public.minerador_discovery_import_batches
  UNION ALL SELECT 'minerador_discovery_keyword_origins', count(*) FROM public.minerador_discovery_keyword_origins
  UNION ALL SELECT 'minerador_discovery_candidate_current_metrics', count(*) FROM public.minerador_discovery_candidate_current_metrics
  UNION ALL SELECT 'minerador_discovery_candidate_metric_history', count(*) FROM public.minerador_discovery_candidate_metric_history
  UNION ALL SELECT 'editorial_workflow_items', count(*) FROM public.editorial_workflow_items
  UNION ALL SELECT 'editorial_artifact_versions', count(*) FROM public.editorial_artifact_versions
  UNION ALL SELECT 'editorial_serp_snapshots', count(*) FROM public.editorial_serp_snapshots
  UNION ALL SELECT 'editorial_serp_reviews', count(*) FROM public.editorial_serp_reviews
  UNION ALL SELECT 'content_documents', count(*) FROM public.content_documents
  UNION ALL SELECT 'content_document_versions', count(*) FROM public.content_document_versions
  UNION ALL SELECT 'content_document_user_states', count(*) FROM public.content_document_user_states
  UNION ALL SELECT 'editorial_saved_views', count(*) FROM public.editorial_saved_views
  UNION ALL SELECT 'publication_records', count(*) FROM public.publication_records
  UNION ALL SELECT 'agency_applications', count(*) FROM public.agency_applications
  UNION ALL SELECT 'agency_invitations', count(*) FROM public.agency_invitations
  UNION ALL SELECT 'agency_onboardings', count(*) FROM public.agency_onboardings
  UNION ALL SELECT 'agency_invitation_token_generations', count(*) FROM public.agency_invitation_token_generations
  UNION ALL SELECT 'communication_messages', count(*) FROM public.communication_messages
  UNION ALL SELECT 'communication_delivery_events', count(*) FROM public.communication_delivery_events
  UNION ALL SELECT 'brand_exceptional_operation_grants', count(*) FROM public.brand_exceptional_operation_grants
  UNION ALL SELECT 'brand_exceptional_operation_execution_events', count(*) FROM public.brand_exceptional_operation_execution_events
  UNION ALL SELECT 'tenant_0016_agency_role_rollback', count(*) FROM public.tenant_0016_agency_role_rollback
  UNION ALL SELECT 'integration_usage_events', count(*) FROM public.integration_usage_events
  UNION ALL SELECT 'integration_bindings', count(*) FROM public.integration_bindings
  UNION ALL SELECT 'integration_grants', count(*) FROM public.integration_grants
  UNION ALL SELECT 'integration_connections:non_platform', count(*) FROM public.integration_connections WHERE owner_scope_type <> 'platform'
  UNION ALL SELECT 'integration_quota_policies:non_platform', count(*) FROM public.integration_quota_policies WHERE scope_type <> 'platform'
  UNION ALL SELECT 'agency_membership_capabilities', count(*) FROM public.agency_membership_capabilities
  UNION ALL SELECT 'brand_agency_capability_restrictions', count(*) FROM public.brand_agency_capability_restrictions
  UNION ALL SELECT 'agency_brands', count(*) FROM public.agency_brands
  UNION ALL SELECT 'agency_memberships', count(*) FROM public.agency_memberships
  UNION ALL SELECT 'agencies', count(*) FROM public.agencies
  UNION ALL SELECT 'brand_member_permissions', count(*) FROM public.brand_member_permissions
  UNION ALL SELECT 'brand_memberships', count(*) FROM public.brand_memberships
  UNION ALL SELECT 'brand_roles:brand_scoped', count(*) FROM public.brand_roles WHERE marca_id IS NOT NULL
  UNION ALL SELECT 'perfis:non_admin', count(*) FROM public.perfis WHERE role IS DISTINCT FROM 'admin'
), protection_expectations AS (
  SELECT * FROM (VALUES
    ('minerador_keywords', 'published_keyword', 'trg_protect_published_keyword', 'public.protect_published_keyword()', 27),
    ('minerador_keyword_lists', 'published_lista', 'trg_protect_published_lista', 'public.protect_published_lista()', 27),
    ('marcas', 'published_marca', 'trg_protect_marca_with_published', 'public.protect_marca_with_published()', 11),
    ('briefings_artigos', 'published_briefing', 'trg_protect_published_briefing', 'public.protect_published_briefing()', 27),
    ('minerador_discovery_runs', 'discovery_run_immutable', 'minerador_discovery_run_immutable', 'public.minerador_discovery_run_immutable()', 27),
    ('editorial_artifact_versions', 'legacy_append_only', 'trg_editorial_artifact_versions_append_only', 'public.editorial_protect_append_only()', 27),
    ('editorial_artifact_versions', 'append_only', 'editorial_artifact_versions_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 27),
    ('editorial_version_status_events', 'legacy_append_only', 'trg_editorial_version_status_events_append_only', 'public.editorial_protect_append_only()', 27),
    ('editorial_decision_events', 'legacy_append_only', 'trg_editorial_decision_events_append_only', 'public.editorial_protect_append_only()', 27),
    ('content_document_versions', 'legacy_append_only', 'trg_content_document_versions_append_only', 'public.editorial_protect_append_only()', 27),
    ('editorial_serp_snapshots', 'append_only', 'editorial_serp_snapshots_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 27),
    ('editorial_serp_snapshots', 'legacy_append_only', 'trg_editorial_serp_snapshots_append_only', 'public.editorial_protect_append_only()', 27),
    ('editorial_serp_reviews', 'append_only', 'editorial_serp_reviews_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 27),
    ('editorial_serp_reviews', 'legacy_append_only', 'trg_editorial_serp_reviews_append_only', 'public.editorial_protect_append_only()', 27),
    ('content_document_versions', 'append_only', 'content_document_versions_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 27),
    ('integration_usage_events', 'append_only', 'trg_integration_usage_events_append_only_0024', 'public.integration_usage_events_prevent_mutation()', 27),
    ('brand_exceptional_operation_execution_events', 'append_only', 'brand_exceptional_operation_execution_events_append_only_trg_00', 'public.pipeline_editorial_protect_append_only()', 27),
    ('brand_memberships', 'tenant_last_owner', 'trg_tenant_0005_protect_last_owner', 'public.tenant_0005_protect_last_owner()', 27),
    ('agencies', 'canonical_agency_actor_guard', 'canonical_0021_agencies_actor_guard', 'public.canonical_validate_single_operational_agency_actor()', 29),
    ('agency_memberships', 'canonical_membership_actor_guard', 'canonical_0021_memberships_actor_guard', 'public.canonical_validate_single_operational_agency_actor()', 29),
    ('brand_site_sync_runs', 'append_only', 'trg_brand_site_sync_runs_append_only', 'public.editorial_protect_append_only()', 27),
    ('brand_site_page_verifications', 'append_only', 'trg_brand_site_page_verifications_append_only', 'public.editorial_protect_append_only()', 27),
    ('brand_site_events', 'append_only', 'trg_brand_site_events_append_only', 'public.editorial_protect_append_only()', 27)
  ) AS value(table_name, logical_protection, catalog_trigger_name, function_signature, expected_tgtype)
), protection_probe AS (
  SELECT e.*, to_regclass('public.' || e.table_name) AS relation_oid,
    to_regprocedure(e.function_signature)::oid AS function_oid,
    t.oid AS trigger_oid, t.tgfoid, t.tgtype::integer AS actual_tgtype, t.tgenabled
  FROM protection_expectations e
  LEFT JOIN pg_catalog.pg_trigger t
    ON t.tgrelid = to_regclass('public.' || e.table_name)
    AND t.tgname = e.catalog_trigger_name
    AND NOT t.tgisinternal
), checks AS (
  SELECT 1 AS sort_order, 'script_version'::text AS check_name, '2026-08-12-v4'::text AS expected,
    '2026-08-12-v4'::text AS observed, 'INFO'::text AS verdict
  UNION ALL
  SELECT 2, 'schema:required_relation:' || r.table_name, 'present',
    CASE WHEN to_regclass('public.' || r.table_name) IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN to_regclass('public.' || r.table_name) IS NULL THEN 'FAIL' ELSE 'PASS' END
  FROM required_relations r
  UNION ALL
  SELECT 10, 'rls:required_relation:' || r.table_name, 'enabled',
    CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'disabled-or-missing' END,
    CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END
  FROM required_relations r
  LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || r.table_name)
  UNION ALL
  SELECT 20, 'policies:required_relation:' || r.table_name, 'catalog policy count recorded',
    count(p.policyname)::text, 'INFO'
  FROM required_relations r
  JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || r.table_name) AND c.relrowsecurity
  LEFT JOIN pg_catalog.pg_policies p ON p.schemaname = 'public' AND p.tablename = r.table_name
  GROUP BY r.table_name
  UNION ALL
  SELECT 30, 'function:pipeline_editorial_protect_append_only', 'present',
    CASE WHEN to_regprocedure('public.pipeline_editorial_protect_append_only()') IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN to_regprocedure('public.pipeline_editorial_protect_append_only()') IS NULL THEN 'FAIL' ELSE 'PASS' END
  UNION ALL
  SELECT 31, 'function:canonical_authorization', 'present',
    CASE WHEN to_regprocedure('public.canonical_actor_can_access_brand(uuid,uuid)') IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN to_regprocedure('public.canonical_actor_can_access_brand(uuid,uuid)') IS NULL THEN 'FAIL' ELSE 'PASS' END
  UNION ALL
  SELECT 32, 'function:platform_communication_secret', 'present',
    CASE WHEN to_regprocedure('public.platform_communication_secret()') IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN to_regprocedure('public.platform_communication_secret()') IS NULL THEN 'FAIL' ELSE 'PASS' END
  UNION ALL
  SELECT 40, 'protection:' || p.table_name || ':' || p.logical_protection,
    'catalog_trigger=' || p.catalog_trigger_name || '; function=' || p.function_signature || '; BEFORE ROW event mask=' || p.expected_tgtype::text || '; enabled O/R/A',
    CASE
      WHEN p.relation_oid IS NULL THEN 'table_absent'
      WHEN p.function_oid IS NULL THEN 'function_missing'
      WHEN p.trigger_oid IS NULL THEN 'trigger_missing'
      ELSE 'catalog_trigger=' || p.catalog_trigger_name || '; function=' || p.tgfoid::regprocedure::text || '; event_mask=' || p.actual_tgtype::text || '; enabled=' || p.tgenabled::text
    END,
    CASE
      WHEN p.relation_oid IS NULL THEN 'INFO'
      WHEN p.function_oid IS NULL OR p.trigger_oid IS NULL THEN 'FAIL'
      WHEN p.tgfoid <> p.function_oid OR p.actual_tgtype <> p.expected_tgtype OR p.tgenabled = 'D' THEN 'FAIL'
      ELSE 'PASS'
    END
  FROM protection_probe p
  UNION ALL
  SELECT 50, 'data:reset:' || r.table_name, '0', r.row_count::text,
    CASE WHEN r.row_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM reset_counts r
  UNION ALL
  SELECT 60, 'admin:auth_backed_global_admin', 'exactly 1', count(*)::text,
    CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM public.perfis p JOIN auth.users u ON u.id = p.id WHERE p.role = 'admin'
  UNION ALL
  SELECT 61, 'auth:manual_test_cleanup_candidates', 'manual Dashboard review required',
    count(*)::text, 'INFO'
  FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = u.id AND p.role = 'admin')
  UNION ALL
  SELECT 70, 'platform:communication_config', 'exactly one preserved configuration', count(*)::text,
    CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM public.platform_communication_config
  UNION ALL
  SELECT 71, 'platform:integration_providers', 'structure preserved', count(*)::text, 'INFO' FROM public.integration_providers
  UNION ALL
  SELECT 72, 'platform:integration_capabilities', 'structure preserved', count(*)::text, 'INFO' FROM public.integration_capabilities
  UNION ALL
  SELECT 73, 'migrations:registry_relation', 'catalog relation present or deployment-specific alternative documented',
    CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'not visible in current catalog' ELSE 'present' END,
    'INFO'
  UNION ALL
  SELECT 74, 'catalog:activity_notification_relations', '0 unclassified relations', count(*)::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname ~* '(activity|notification)'
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY sort_order, check_name;
