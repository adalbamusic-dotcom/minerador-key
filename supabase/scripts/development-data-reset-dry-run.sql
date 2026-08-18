-- DEVELOPMENT DATA RESET - READ-ONLY PREFLIGHT - version 2026-08-12-v6
-- Execute this file as one statement in the SQL Editor.
-- It returns one sanitized result set and performs no state change.

WITH
manifest(schema_name, table_name, delete_rank) AS (
  VALUES
    ('public', 'communication_delivery_events', 10), ('public', 'communication_messages', 20),
    ('public', 'agency_invitation_token_generations', 30), ('public', 'agency_onboardings', 40),
    ('public', 'agency_invitations', 50), ('public', 'agency_applications', 60),
    ('public', 'brand_invitation_permissions', 61), ('public', 'brand_invitations', 62),
    ('public', 'brand_exceptional_operation_execution_events', 70), ('public', 'brand_exceptional_operation_grants', 80),
    ('public', 'integration_usage_events', 90), ('public', 'integration_bindings', 100),
    ('public', 'integration_grants', 110), ('public', 'integration_quota_policies', 120),
    ('public', 'integration_connections', 130), ('public', 'editorial_saved_views', 140),
    ('public', 'content_document_comments', 145), ('public', 'content_document_user_states', 150),
    ('public', 'publication_records', 160), ('public', 'content_document_versions', 170),
    ('public', 'content_documents', 180), ('public', 'editorial_version_status_events', 185),
    ('public', 'editorial_serp_reviews', 190), ('public', 'editorial_serp_snapshots', 200),
    ('public', 'editorial_decision_events', 205), ('public', 'editorial_workflow_items', 210),
    ('public', 'editorial_artifact_versions', 220), ('public', 'brand_site_import_items', 230),
    ('public', 'brand_site_import_batches', 240), ('public', 'brand_site_keyword_candidates', 250),
    ('public', 'brand_site_page_verifications', 260), ('public', 'brand_site_events', 270),
    ('public', 'brand_site_catalog_entries', 280), ('public', 'brand_site_sync_runs', 290),
    ('public', 'brand_site_sitemaps', 300), ('public', 'minerador_keyword_metric_measurements', 310),
    ('public', 'minerador_google_ads_connections', 320), ('public', 'minerador_discovery_candidate_metric_history', 330),
    ('public', 'minerador_discovery_candidate_current_metrics', 340), ('public', 'minerador_discovery_keyword_origins', 350),
    ('public', 'minerador_discovery_import_batches', 360), ('public', 'minerador_discovery_candidates', 370),
    ('public', 'minerador_discovery_runs', 380), ('public', 'briefings_artigos', 390),
    ('public', 'minerador_keywords', 400), ('public', 'minerador_keyword_lists', 410),
    ('public', 'agency_membership_capabilities', 420), ('public', 'brand_agency_capability_restrictions', 430),
    ('public', 'agency_brands', 440), ('public', 'tenant_0016_agency_role_rollback', 450),
    ('public', 'agency_memberships', 460), ('public', 'brand_member_permissions', 470),
    ('public', 'brand_memberships', 480), ('public', 'brand_role_permissions', 485),
    ('public', 'delegated_access_permissions', 486), ('public', 'delegated_access_grants', 487),
    ('public', 'brand_roles', 490), ('public', 'agencies', 500),
    ('public', 'marcas', 510), ('public', 'perfis', 520)
),
manifest_integrity AS (
  SELECT count(*)::integer AS manifest_count,
         count(DISTINCT table_name)::integer AS distinct_tables,
         count(DISTINCT delete_rank)::integer AS distinct_ranks
  FROM manifest
),
required_relations(schema_name, table_name) AS (
  VALUES
    ('public', 'perfis'), ('public', 'marcas'), ('public', 'minerador_keyword_lists'), ('public', 'minerador_keywords'),
    ('public', 'minerador_google_ads_connections'), ('public', 'minerador_keyword_metric_measurements'),
    ('public', 'minerador_discovery_runs'), ('public', 'minerador_discovery_candidates'),
    ('public', 'minerador_discovery_import_batches'), ('public', 'minerador_discovery_keyword_origins'),
    ('public', 'minerador_discovery_candidate_current_metrics'), ('public', 'minerador_discovery_candidate_metric_history'),
    ('public', 'editorial_workflow_items'), ('public', 'editorial_artifact_versions'),
    ('public', 'editorial_serp_snapshots'), ('public', 'editorial_serp_reviews'),
    ('public', 'content_documents'), ('public', 'content_document_versions'),
    ('public', 'content_document_user_states'), ('public', 'editorial_saved_views'),
    ('public', 'publication_records'), ('public', 'agencies'), ('public', 'agency_memberships'),
    ('public', 'agency_brands'), ('public', 'agency_membership_capabilities'),
    ('public', 'brand_agency_capability_restrictions'), ('public', 'brand_roles'),
    ('public', 'brand_memberships'), ('public', 'brand_member_permissions'),
    ('public', 'agency_applications'), ('public', 'agency_invitations'), ('public', 'agency_onboardings'),
    ('public', 'agency_invitation_token_generations'), ('public', 'communication_messages'),
    ('public', 'communication_delivery_events'), ('public', 'communication_templates'),
    ('public', 'platform_communication_config'), ('public', 'integration_providers'),
    ('public', 'integration_capabilities'), ('public', 'integration_connections'),
    ('public', 'integration_grants'), ('public', 'integration_bindings'),
    ('public', 'integration_quota_policies'), ('public', 'integration_usage_events'),
    ('public', 'brand_exceptional_operation_grants'), ('public', 'tenant_0016_agency_role_rollback'),
    ('public', 'brand_exceptional_operation_execution_events')
),
relation_presence AS (
  SELECT r.schema_name, r.table_name,
         to_regclass(format('%I.%I', r.schema_name, r.table_name)) IS NOT NULL AS present
  FROM required_relations r
),
fk_catalog AS (
  SELECT fk.oid AS constraint_oid, fk.conname AS constraint_name,
         child_schema.nspname AS child_schema, child_table.relname AS child_table,
         parent_schema.nspname AS parent_schema, parent_table.relname AS parent_table,
         CASE fk.confdeltype WHEN 'a' THEN 'NO_ACTION' WHEN 'r' THEN 'RESTRICT'
           WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET_NULL'
           WHEN 'd' THEN 'SET_DEFAULT' ELSE 'UNKNOWN' END AS on_delete
  FROM pg_catalog.pg_constraint fk
  JOIN pg_catalog.pg_class child_table ON child_table.oid = fk.conrelid
  JOIN pg_catalog.pg_namespace child_schema ON child_schema.oid = child_table.relnamespace
  JOIN pg_catalog.pg_class parent_table ON parent_table.oid = fk.confrelid
  JOIN pg_catalog.pg_namespace parent_schema ON parent_schema.oid = parent_table.relnamespace
  WHERE fk.contype = 'f'
),
edge_actions(child_schema, child_table, parent_schema, parent_table, constraint_name) AS (
  VALUES ('public', 'content_documents', 'public', 'content_document_versions', 'content_documents_current_version_fk')
),
partial_reset_tables(schema_name, table_name) AS (
  VALUES
    ('public', 'integration_connections'),
    ('public', 'integration_quota_policies'),
    ('public', 'brand_roles'),
    ('public', 'perfis')
),
fk_links AS (
  SELECT f.*, parent_manifest.delete_rank AS parent_rank,
         child_manifest.delete_rank AS child_rank,
         edge.constraint_name AS approved_edge
  FROM fk_catalog f
  JOIN manifest parent_manifest
    ON parent_manifest.schema_name = f.parent_schema
   AND parent_manifest.table_name = f.parent_table
  LEFT JOIN manifest child_manifest
    ON child_manifest.schema_name = f.child_schema
   AND child_manifest.table_name = f.child_table
  LEFT JOIN edge_actions edge
    ON edge.child_schema = f.child_schema AND edge.child_table = f.child_table
   AND edge.parent_schema = f.parent_schema AND edge.parent_table = f.parent_table
   AND edge.constraint_name = f.constraint_name
),
unknown_fk AS (
  SELECT count(*)::integer AS issue_count,
         coalesce(string_agg(format('%I.%I constraint=%I -> %I.%I on_delete=%s',
           child_schema, child_table, constraint_name, parent_schema, parent_table, on_delete),
           ' | ' ORDER BY child_schema, child_table, constraint_name), 'none') AS details
  FROM fk_links
  WHERE child_rank IS NULL
),
fk_order AS (
  SELECT count(*)::integer AS issue_count,
         coalesce(string_agg(format('%I.%I constraint=%I must precede %I.%I',
           child_schema, child_table, constraint_name, parent_schema, parent_table),
           ' | ' ORDER BY child_schema, child_table, constraint_name), 'none') AS details
  FROM fk_links
  WHERE child_rank IS NOT NULL AND parent_rank IS NOT NULL
    AND NOT (child_schema = parent_schema AND child_table = parent_table)
    AND approved_edge IS NULL AND child_rank >= parent_rank
),
self_fk_inventory AS (
  SELECT f.constraint_name, f.child_schema, f.child_table,
         CASE WHEN partial.table_name IS NULL THEN 'SAFE_FULL_TABLE_RESET' ELSE 'UNSAFE_PARTIAL_RESET' END AS reset_mode
  FROM fk_catalog f
  JOIN manifest m
    ON m.schema_name = f.child_schema AND m.table_name = f.child_table
  LEFT JOIN partial_reset_tables partial
    ON partial.schema_name = f.child_schema AND partial.table_name = f.child_table
  WHERE f.child_schema = f.parent_schema AND f.child_table = f.parent_table
),
self_fk_gate AS (
  SELECT count(*)::integer AS self_fk_count,
         count(*) FILTER (WHERE reset_mode <> 'SAFE_FULL_TABLE_RESET')::integer AS unsafe_count,
         coalesce(string_agg(format('%I.%I constraint=%I mode=%s', child_schema, child_table, constraint_name, reset_mode),
           ' | ' ORDER BY child_schema, child_table, constraint_name), 'none') AS details
  FROM self_fk_inventory
),
protection_expectations(table_name, logical_protection, trigger_name, function_signature, expected_tgtype) AS (
  VALUES
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
),
mutation_trigger_expectations(schema_name, table_name, logical_guard, trigger_name, function_signature, classification, expected_tgtype) AS (
  VALUES
    ('public', 'minerador_keywords', 'published_keyword', 'trg_protect_published_keyword', 'public.protect_published_keyword()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'minerador_keywords', 'tenant_keyword_brand_guard', 'trg_tenant_0005_validate_keyword_brand', 'public.tenant_0005_validate_keyword_brand()', 'SAFE_TO_KEEP_ENABLED', 23),
    ('public', 'minerador_keyword_lists', 'published_lista', 'trg_protect_published_lista', 'public.protect_published_lista()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'marcas', 'published_marca', 'trg_protect_marca_with_published', 'public.protect_marca_with_published()', 'SUSPEND_DURING_DEV_RESET', 11),
    ('public', 'marcas', 'tenant_owner_change', 'trg_tenant_0005_protect_owner_change', 'public.tenant_0005_protect_owner_change()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'briefings_artigos', 'published_briefing', 'trg_protect_published_briefing', 'public.protect_published_briefing()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'minerador_discovery_candidates', 'discovery_candidate_brand_guard', 'minerador_discovery_candidate_brand_guard', 'public.minerador_discovery_candidate_brand_guard()', 'SAFE_TO_KEEP_ENABLED', 23),
    ('public', 'minerador_discovery_runs', 'discovery_run_immutable', 'minerador_discovery_run_immutable', 'public.minerador_discovery_run_immutable()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'minerador_discovery_keyword_origins', 'discovery_import_brand_guard', 'minerador_discovery_import_brand_guard', 'public.minerador_discovery_import_brand_guard()', 'SAFE_TO_KEEP_ENABLED', 23),
    ('public', 'brand_roles', 'updated_at_touch', 'trg_brand_roles_touch', 'public.editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'brand_invitations', 'updated_at_touch', 'trg_brand_invitations_touch', 'public.editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'brand_memberships', 'updated_at_touch', 'trg_brand_memberships_touch', 'public.editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'brand_memberships', 'tenant_last_owner', 'trg_tenant_0005_protect_last_owner', 'public.tenant_0005_protect_last_owner()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'brand_member_permissions', 'updated_at_touch', 'trg_brand_member_permissions_touch', 'public.editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'delegated_access_grants', 'updated_at_touch', 'trg_delegated_access_grants_touch', 'public.editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'editorial_saved_views', 'updated_at_touch_legacy', 'trg_editorial_saved_views_touch', 'public.editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'editorial_saved_views', 'updated_at_touch', 'editorial_saved_views_touch_trg', 'public.pipeline_editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'content_document_user_states', 'updated_at_touch_legacy', 'trg_content_document_user_states_touch', 'public.editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'content_document_user_states', 'updated_at_touch', 'content_document_user_states_touch_trg', 'public.pipeline_editorial_touch_updated_at()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'editorial_workflow_items', 'lock_version_legacy', 'trg_editorial_workflow_items_lock', 'public.editorial_touch_lock_version()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'editorial_workflow_items', 'lock_version', 'editorial_workflow_items_touch_trg', 'public.pipeline_editorial_touch_lock_version()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'content_documents', 'lock_version_legacy', 'trg_content_documents_lock', 'public.editorial_touch_lock_version()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'content_documents', 'lock_version', 'content_documents_touch_trg', 'public.pipeline_editorial_touch_lock_version()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'publication_records', 'lock_version_legacy', 'trg_publication_records_lock', 'public.editorial_touch_lock_version()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'publication_records', 'lock_version', 'publication_records_touch_trg', 'public.pipeline_editorial_touch_lock_version()', 'SAFE_TO_KEEP_ENABLED', 19),
    ('public', 'editorial_artifact_versions', 'legacy_append_only', 'trg_editorial_artifact_versions_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'editorial_artifact_versions', 'append_only', 'editorial_artifact_versions_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'editorial_artifact_versions', 'source_validation', 'editorial_artifact_versions_source_trg', 'public.pipeline_editorial_validate_artifact_source()', 'SAFE_TO_KEEP_ENABLED', 23),
    ('public', 'editorial_version_status_events', 'legacy_append_only', 'trg_editorial_version_status_events_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'editorial_decision_events', 'legacy_append_only', 'trg_editorial_decision_events_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'content_document_versions', 'legacy_append_only', 'trg_content_document_versions_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'content_document_versions', 'append_only', 'content_document_versions_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'editorial_serp_snapshots', 'legacy_append_only', 'trg_editorial_serp_snapshots_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'editorial_serp_snapshots', 'append_only', 'editorial_serp_snapshots_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'editorial_serp_reviews', 'legacy_append_only', 'trg_editorial_serp_reviews_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'editorial_serp_reviews', 'append_only', 'editorial_serp_reviews_append_only_trg', 'public.pipeline_editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'brand_site_sync_runs', 'append_only', 'trg_brand_site_sync_runs_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'brand_site_page_verifications', 'append_only', 'trg_brand_site_page_verifications_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'brand_site_events', 'append_only', 'trg_brand_site_events_append_only', 'public.editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'agencies', 'canonical_agency_actor_guard', 'canonical_0021_agencies_actor_guard', 'public.canonical_validate_single_operational_agency_actor()', 'SUSPEND_DURING_DEV_RESET', 29),
    ('public', 'agency_memberships', 'canonical_membership_actor_guard', 'canonical_0021_memberships_actor_guard', 'public.canonical_validate_single_operational_agency_actor()', 'SUSPEND_DURING_DEV_RESET', 29),
    ('public', 'integration_grants', 'scope_validation', 'trg_integration_grants_validate_scope_0024', 'public.integration_grants_validate_scope()', 'SAFE_TO_KEEP_ENABLED', 23),
    ('public', 'integration_bindings', 'scope_validation', 'trg_integration_bindings_validate_scope_0024', 'public.integration_bindings_validate_scope()', 'SAFE_TO_KEEP_ENABLED', 23),
    ('public', 'integration_usage_events', 'append_only', 'trg_integration_usage_events_append_only_0024', 'public.integration_usage_events_prevent_mutation()', 'SUSPEND_DURING_DEV_RESET', 27),
    ('public', 'brand_exceptional_operation_execution_events', 'append_only', 'brand_exceptional_operation_execution_events_append_only_trg_00', 'public.pipeline_editorial_protect_append_only()', 'SUSPEND_DURING_DEV_RESET', 27)
),
mutation_trigger_inventory AS (
  SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname AS trigger_name,
         t.tgfoid, t.tgtype::integer AS actual_tgtype, t.tgenabled,
         e.classification, e.function_signature, e.expected_tgtype,
         CASE
           WHEN e.trigger_name IS NULL THEN 'UNCLASSIFIED'
           WHEN e.classification = 'INVESTIGATE' THEN 'INVESTIGATE'
           WHEN to_regprocedure(e.function_signature) IS NULL
             OR t.tgfoid <> to_regprocedure(e.function_signature)::oid
             OR t.tgtype::integer <> e.expected_tgtype THEN 'SPEC_MISMATCH'
           ELSE e.classification
         END AS classification_result
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN mutation_trigger_expectations e
    ON e.schema_name = n.nspname AND e.table_name = c.relname AND e.trigger_name = t.tgname
  JOIN manifest m ON m.schema_name = n.nspname AND m.table_name = c.relname
  WHERE NOT t.tgisinternal
    AND ((t.tgtype::integer & 8) <> 0 OR (t.tgtype::integer & 16) <> 0)
),
mutation_trigger_gate AS (
  SELECT count(*)::integer AS trigger_count,
         count(*) FILTER (WHERE classification_result IN ('UNCLASSIFIED', 'INVESTIGATE', 'SPEC_MISMATCH'))::integer AS issue_count,
         coalesce(string_agg(format('%I.%I trigger=%I classification=%s function=%s events=%s enabled=%s',
           schema_name, table_name, trigger_name, classification_result,
           coalesce(function_signature, 'unknown'), actual_tgtype, tgenabled),
           ' | ' ORDER BY schema_name, table_name, trigger_name), 'none') AS inventory,
         coalesce(string_agg(format('%I.%I trigger=%I classification=%s function=%s events=%s enabled=%s',
           schema_name, table_name, trigger_name, classification_result,
           coalesce(function_signature, 'unknown'), actual_tgtype, tgenabled),
           ' | ' ORDER BY schema_name, table_name, trigger_name)
           FILTER (WHERE classification_result IN ('UNCLASSIFIED', 'INVESTIGATE', 'SPEC_MISMATCH')), 'none') AS issues
  FROM mutation_trigger_inventory
),
protection_observations AS (
  SELECT e.*,
         fn.oid AS function_oid, t.oid AS trigger_oid,
         t.tgenabled, t.tgtype::integer AS observed_tgtype,
         CASE
           WHEN to_regclass(format('public.%I', e.table_name)) IS NULL THEN 'not_applicable'
           WHEN fn.oid IS NULL THEN 'function_missing'
           WHEN t.oid IS NULL THEN 'trigger_missing'
           WHEN t.tgfoid <> fn.oid THEN 'function_mismatch'
           WHEN t.tgtype::integer <> e.expected_tgtype THEN 'event_scope_mismatch'
           WHEN t.tgenabled = 'D' THEN 'disabled'
           ELSE 'ready'
         END AS observed_state
  FROM protection_expectations e
  LEFT JOIN pg_catalog.pg_proc fn ON fn.oid = to_regprocedure(e.function_signature)
  LEFT JOIN pg_catalog.pg_trigger t
    ON t.tgrelid = to_regclass(format('public.%I', e.table_name))
   AND t.tgname = e.trigger_name AND NOT t.tgisinternal
),
protection_gate AS (
  SELECT count(*) FILTER (WHERE observed_state NOT IN ('ready', 'not_applicable'))::integer AS issue_count,
         coalesce(string_agg(format('%s.%s catalog=%s state=%s', table_name, logical_protection, trigger_name, observed_state),
           ' | ' ORDER BY table_name, logical_protection) FILTER (WHERE observed_state NOT IN ('ready', 'not_applicable')), 'none') AS details
  FROM protection_observations
),
admin_gate AS (
  SELECT count(*)::integer AS admin_count
  FROM public.perfis p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'admin'
),
manifest_gate AS (
  SELECT manifest_count, distinct_tables, distinct_ranks
  FROM manifest_integrity
),
required_gate AS (
  SELECT count(*) FILTER (WHERE NOT present)::integer AS missing_count,
         coalesce(string_agg(format('%I.%I', schema_name, table_name), ' | ' ORDER BY schema_name, table_name)
           FILTER (WHERE NOT present), 'none') AS missing_relations
  FROM relation_presence
),
tenant_order_gate AS (
  SELECT CASE WHEN child.delete_rank < parent.delete_rank THEN 'PASS' ELSE 'FAIL' END AS verdict,
         child.delete_rank AS rollback_rank, parent.delete_rank AS membership_rank
  FROM manifest child
  JOIN manifest parent ON child.table_name = 'tenant_0016_agency_role_rollback'
                      AND parent.table_name = 'agency_memberships'
),
environment_gate AS (
  SELECT current_database()::text AS database_name, current_user::text AS execution_role
),
counts AS (
  SELECT 'communication_delivery_events'::text AS object_name, count(*)::bigint AS row_count FROM public.communication_delivery_events
  UNION ALL SELECT 'communication_messages', count(*) FROM public.communication_messages
  UNION ALL SELECT 'agency_invitation_token_generations', count(*) FROM public.agency_invitation_token_generations
  UNION ALL SELECT 'agency_onboardings', count(*) FROM public.agency_onboardings
  UNION ALL SELECT 'agency_invitations', count(*) FROM public.agency_invitations
  UNION ALL SELECT 'agency_applications', count(*) FROM public.agency_applications
  UNION ALL SELECT 'brand_exceptional_operation_execution_events', count(*) FROM public.brand_exceptional_operation_execution_events
  UNION ALL SELECT 'tenant_0016_agency_role_rollback', count(*) FROM public.tenant_0016_agency_role_rollback
  UNION ALL SELECT 'brand_exceptional_operation_grants', count(*) FROM public.brand_exceptional_operation_grants
  UNION ALL SELECT 'integration_usage_events', count(*) FROM public.integration_usage_events
  UNION ALL SELECT 'integration_bindings', count(*) FROM public.integration_bindings
  UNION ALL SELECT 'integration_grants', count(*) FROM public.integration_grants
  UNION ALL SELECT 'integration_connections:non_platform', count(*) FROM public.integration_connections WHERE owner_scope_type <> 'platform'
  UNION ALL SELECT 'integration_quota_policies:non_platform', count(*) FROM public.integration_quota_policies WHERE scope_type <> 'platform'
  UNION ALL SELECT 'editorial_saved_views', count(*) FROM public.editorial_saved_views
  UNION ALL SELECT 'content_document_user_states', count(*) FROM public.content_document_user_states
  UNION ALL SELECT 'publication_records', count(*) FROM public.publication_records
  UNION ALL SELECT 'content_document_versions', count(*) FROM public.content_document_versions
  UNION ALL SELECT 'content_documents', count(*) FROM public.content_documents
  UNION ALL SELECT 'editorial_serp_reviews', count(*) FROM public.editorial_serp_reviews
  UNION ALL SELECT 'editorial_serp_snapshots', count(*) FROM public.editorial_serp_snapshots
  UNION ALL SELECT 'editorial_workflow_items', count(*) FROM public.editorial_workflow_items
  UNION ALL SELECT 'editorial_artifact_versions', count(*) FROM public.editorial_artifact_versions
  UNION ALL SELECT 'minerador_keyword_metric_measurements', count(*) FROM public.minerador_keyword_metric_measurements
  UNION ALL SELECT 'minerador_google_ads_connections', count(*) FROM public.minerador_google_ads_connections
  UNION ALL SELECT 'minerador_discovery_candidate_metric_history', count(*) FROM public.minerador_discovery_candidate_metric_history
  UNION ALL SELECT 'minerador_discovery_candidate_current_metrics', count(*) FROM public.minerador_discovery_candidate_current_metrics
  UNION ALL SELECT 'minerador_discovery_keyword_origins', count(*) FROM public.minerador_discovery_keyword_origins
  UNION ALL SELECT 'minerador_discovery_import_batches', count(*) FROM public.minerador_discovery_import_batches
  UNION ALL SELECT 'minerador_discovery_candidates', count(*) FROM public.minerador_discovery_candidates
  UNION ALL SELECT 'minerador_discovery_runs', count(*) FROM public.minerador_discovery_runs
  UNION ALL SELECT 'minerador_keywords', count(*) FROM public.minerador_keywords
  UNION ALL SELECT 'minerador_keyword_lists', count(*) FROM public.minerador_keyword_lists
  UNION ALL SELECT 'marcas', count(*) FROM public.marcas
  UNION ALL SELECT 'agency_membership_capabilities', count(*) FROM public.agency_membership_capabilities
  UNION ALL SELECT 'brand_agency_capability_restrictions', count(*) FROM public.brand_agency_capability_restrictions
  UNION ALL SELECT 'agency_brands', count(*) FROM public.agency_brands
  UNION ALL SELECT 'agency_memberships', count(*) FROM public.agency_memberships
  UNION ALL SELECT 'agencies', count(*) FROM public.agencies
  UNION ALL SELECT 'brand_member_permissions', count(*) FROM public.brand_member_permissions
  UNION ALL SELECT 'brand_memberships', count(*) FROM public.brand_memberships
  UNION ALL SELECT 'brand_roles:brand_scoped', count(*) FROM public.brand_roles WHERE marca_id IS NOT NULL
  UNION ALL SELECT 'perfis:non_admin', count(*) FROM public.perfis WHERE role IS DISTINCT FROM 'admin'
),
checks AS (
  SELECT 'SCRIPT_VERSION'::text AS check_name, '2026-08-12-v6'::text AS expected, '2026-08-12-v6'::text AS observed, 'INFO'::text AS verdict
  UNION ALL SELECT 'MANIFEST_COUNT', '60', manifest_count::text, CASE WHEN manifest_count = 60 THEN 'PASS' ELSE 'FAIL' END FROM manifest_gate
  UNION ALL SELECT 'MANIFEST_CLASSIFICATIONS', '60 unique tables and ranks', format('%s tables / %s ranks', distinct_tables, distinct_ranks), CASE WHEN manifest_count = 60 AND distinct_tables = 60 AND distinct_ranks = 60 THEN 'PASS' ELSE 'FAIL' END FROM manifest_gate
  UNION ALL SELECT 'REQUIRED_RELATIONS_GATE', 'all required relations present', format('%s missing: %s', missing_count, missing_relations), CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM required_gate
  UNION ALL SELECT 'FK_DEPENDENCY_GATE', '0 unclassified inbound FKs', format('%s: %s', issue_count, details), CASE WHEN issue_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM unknown_fk
  UNION ALL SELECT 'FK_ORDER_GATE', '0 invalid dependency-order FKs', format('%s: %s', issue_count, details), CASE WHEN issue_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM fk_order
  UNION ALL SELECT 'TENANT_0016_ORDER_GATE', 'rollback before agency_memberships', format('rollback=%s membership=%s', rollback_rank, membership_rank), verdict FROM tenant_order_gate
  UNION ALL SELECT 'SELF_FK_GATE', 'all self-referential FKs are safe under full-table reset', format('count=%s; unsafe=%s; %s', self_fk_count, unsafe_count, details), CASE WHEN unsafe_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM self_fk_gate
  UNION ALL SELECT 'MUTATION_TRIGGER_GATE', 'all DELETE/UPDATE triggers on reset tables are exactly classified', format('count=%s; issues=%s; inventory=%s; issues_detail=%s', trigger_count, issue_count, inventory, issues), CASE WHEN issue_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM mutation_trigger_gate
  UNION ALL SELECT 'PROTECTION_GATE', 'all approved protections present, enabled and event-safe', format('%s: %s', issue_count, details), CASE WHEN issue_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM protection_gate
  UNION ALL SELECT 'ADMIN_GATE', 'exactly one Auth-backed global admin', admin_count::text, CASE WHEN admin_count = 1 THEN 'PASS' ELSE 'FAIL' END FROM admin_gate
  UNION ALL SELECT 'PROJECT_ENVIRONMENT_CONFIRMATION', 'manual development project confirmation required', format('database=%s; role=%s', database_name, execution_role), 'INFO' FROM environment_gate
),
final_verdict AS (
  SELECT count(*) FILTER (WHERE verdict = 'FAIL')::integer AS fail_count FROM checks
)
SELECT check_name, expected, observed, verdict FROM checks
UNION ALL
SELECT 'count:' || object_name, 'sanitized current count', row_count::text, 'INFO' FROM counts
UNION ALL
SELECT 'VERDICT_FINAL', '0 FAIL', fail_count::text, CASE WHEN fail_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM final_verdict
ORDER BY check_name;
