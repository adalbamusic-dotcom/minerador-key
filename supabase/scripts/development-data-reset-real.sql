-- DEVELOPMENT DATA RESET - REAL EXECUTION - version 2026-08-12-v7
--
-- This file is one transaction. It preserves schema, migrations, RLS,
-- policies, constraints, functions, global integrations and the global Admin.
-- It removes only the approved development/homologation data set.
--
-- Before execution: confirm the development project, take the final backup,
-- and replace only reset_ack with the approved literal below.

BEGIN;

DO $$
DECLARE
  reset_ack constant text := 'DEVELOPMENT_DATA_RESET_CONFIRMED_2026_08_12';
  manifest_names text[] := ARRAY[
    'communication_delivery_events', 'communication_messages',
    'agency_invitation_token_generations', 'agency_onboardings',
    'agency_invitations', 'agency_applications',
    'brand_invitation_permissions', 'brand_invitations',
    'brand_exceptional_operation_execution_events', 'brand_exceptional_operation_grants',
    'integration_usage_events', 'integration_bindings', 'integration_grants',
    'integration_quota_policies', 'integration_connections', 'editorial_saved_views',
    'content_document_comments', 'content_document_user_states', 'publication_records',
    'content_document_versions', 'content_documents', 'editorial_version_status_events',
    'editorial_serp_reviews', 'editorial_serp_snapshots', 'editorial_decision_events',
    'editorial_workflow_items', 'editorial_artifact_versions', 'brand_site_import_items',
    'brand_site_import_batches', 'brand_site_keyword_candidates', 'brand_site_page_verifications',
    'brand_site_events', 'brand_site_catalog_entries', 'brand_site_sync_runs',
    'brand_site_sitemaps', 'minerador_keyword_metric_measurements',
    'minerador_google_ads_connections', 'minerador_discovery_candidate_metric_history',
    'minerador_discovery_candidate_current_metrics', 'minerador_discovery_keyword_origins',
    'minerador_discovery_import_batches', 'minerador_discovery_candidates',
    'minerador_discovery_runs', 'briefings_artigos', 'minerador_keywords', 'minerador_keyword_lists',
    'agency_membership_capabilities', 'brand_agency_capability_restrictions',
    'agency_brands', 'tenant_0016_agency_role_rollback', 'agency_memberships',
    'brand_member_permissions', 'brand_memberships', 'brand_role_permissions',
    'delegated_access_permissions', 'delegated_access_grants', 'brand_roles',
    'agencies', 'marcas', 'perfis'
  ];
  manifest_ranks integer[] := ARRAY[
    10, 20, 30, 40, 50, 60, 61, 62, 70, 80, 90, 100, 110, 120, 130, 140,
    145, 150, 160, 170, 180, 185, 190, 200, 205, 210, 220, 230, 240, 250,
    260, 270, 280, 290, 300, 310, 320, 330, 340, 350, 360, 370, 380, 390,
    400, 410, 420, 430, 440, 450, 460, 470, 480, 485, 486, 487, 490, 500,
    510, 520
  ];
  required_names text[] := ARRAY[
    'perfis', 'marcas', 'minerador_keyword_lists', 'minerador_keywords',
    'minerador_google_ads_connections', 'minerador_keyword_metric_measurements',
    'minerador_discovery_runs', 'minerador_discovery_candidates',
    'minerador_discovery_import_batches', 'minerador_discovery_keyword_origins',
    'minerador_discovery_candidate_current_metrics', 'minerador_discovery_candidate_metric_history',
    'editorial_workflow_items', 'editorial_artifact_versions', 'editorial_serp_snapshots',
    'editorial_serp_reviews', 'content_documents', 'content_document_versions',
    'content_document_user_states', 'editorial_saved_views', 'publication_records',
    'agencies', 'agency_memberships', 'agency_brands', 'agency_membership_capabilities',
    'brand_agency_capability_restrictions', 'brand_roles', 'brand_memberships',
    'brand_member_permissions', 'agency_applications', 'agency_invitations',
    'agency_onboardings', 'agency_invitation_token_generations', 'communication_messages',
    'communication_delivery_events', 'communication_templates', 'platform_communication_config',
    'integration_providers', 'integration_capabilities', 'integration_connections',
    'integration_grants', 'integration_bindings', 'integration_quota_policies',
    'integration_usage_events', 'brand_exceptional_operation_grants',
    'tenant_0016_agency_role_rollback', 'brand_exceptional_operation_execution_events'
  ];
  mutation_trigger_specs jsonb := '[
    {"schema_name":"public","table_name":"minerador_keywords","logical_guard":"published_keyword","trigger_name":"trg_protect_published_keyword","function_signature":"public.protect_published_keyword()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"minerador_keywords","logical_guard":"tenant_keyword_brand_guard","trigger_name":"trg_tenant_0005_validate_keyword_brand","function_signature":"public.tenant_0005_validate_keyword_brand()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":23},
    {"schema_name":"public","table_name":"minerador_keyword_lists","logical_guard":"published_lista","trigger_name":"trg_protect_published_lista","function_signature":"public.protect_published_lista()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"marcas","logical_guard":"published_marca","trigger_name":"trg_protect_marca_with_published","function_signature":"public.protect_marca_with_published()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":11},
    {"schema_name":"public","table_name":"marcas","logical_guard":"tenant_owner_change","trigger_name":"trg_tenant_0005_protect_owner_change","function_signature":"public.tenant_0005_protect_owner_change()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"briefings_artigos","logical_guard":"published_briefing","trigger_name":"trg_protect_published_briefing","function_signature":"public.protect_published_briefing()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"minerador_discovery_candidates","logical_guard":"discovery_candidate_brand_guard","trigger_name":"minerador_discovery_candidate_brand_guard","function_signature":"public.minerador_discovery_candidate_brand_guard()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":23},
    {"schema_name":"public","table_name":"minerador_discovery_runs","logical_guard":"discovery_run_immutable","trigger_name":"minerador_discovery_run_immutable","function_signature":"public.minerador_discovery_run_immutable()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"minerador_discovery_keyword_origins","logical_guard":"discovery_import_brand_guard","trigger_name":"minerador_discovery_import_brand_guard","function_signature":"public.minerador_discovery_import_brand_guard()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":23},
    {"schema_name":"public","table_name":"brand_roles","logical_guard":"updated_at_touch","trigger_name":"trg_brand_roles_touch","function_signature":"public.editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"brand_invitations","logical_guard":"updated_at_touch","trigger_name":"trg_brand_invitations_touch","function_signature":"public.editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"brand_memberships","logical_guard":"updated_at_touch","trigger_name":"trg_brand_memberships_touch","function_signature":"public.editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"brand_memberships","logical_guard":"tenant_last_owner","trigger_name":"trg_tenant_0005_protect_last_owner","function_signature":"public.tenant_0005_protect_last_owner()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"brand_member_permissions","logical_guard":"updated_at_touch","trigger_name":"trg_brand_member_permissions_touch","function_signature":"public.editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"delegated_access_grants","logical_guard":"updated_at_touch","trigger_name":"trg_delegated_access_grants_touch","function_signature":"public.editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"editorial_saved_views","logical_guard":"updated_at_touch_legacy","trigger_name":"trg_editorial_saved_views_touch","function_signature":"public.editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"editorial_saved_views","logical_guard":"updated_at_touch","trigger_name":"editorial_saved_views_touch_trg","function_signature":"public.pipeline_editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"content_document_user_states","logical_guard":"updated_at_touch_legacy","trigger_name":"trg_content_document_user_states_touch","function_signature":"public.editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"content_document_user_states","logical_guard":"updated_at_touch","trigger_name":"content_document_user_states_touch_trg","function_signature":"public.pipeline_editorial_touch_updated_at()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"editorial_workflow_items","logical_guard":"lock_version_legacy","trigger_name":"trg_editorial_workflow_items_lock","function_signature":"public.editorial_touch_lock_version()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"editorial_workflow_items","logical_guard":"lock_version","trigger_name":"editorial_workflow_items_touch_trg","function_signature":"public.pipeline_editorial_touch_lock_version()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"content_documents","logical_guard":"lock_version_legacy","trigger_name":"trg_content_documents_lock","function_signature":"public.editorial_touch_lock_version()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"content_documents","logical_guard":"lock_version","trigger_name":"content_documents_touch_trg","function_signature":"public.pipeline_editorial_touch_lock_version()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"publication_records","logical_guard":"lock_version_legacy","trigger_name":"trg_publication_records_lock","function_signature":"public.editorial_touch_lock_version()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"publication_records","logical_guard":"lock_version","trigger_name":"publication_records_touch_trg","function_signature":"public.pipeline_editorial_touch_lock_version()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":19},
    {"schema_name":"public","table_name":"editorial_artifact_versions","logical_guard":"legacy_append_only","trigger_name":"trg_editorial_artifact_versions_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"editorial_artifact_versions","logical_guard":"append_only","trigger_name":"editorial_artifact_versions_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"editorial_artifact_versions","logical_guard":"source_validation","trigger_name":"editorial_artifact_versions_source_trg","function_signature":"public.pipeline_editorial_validate_artifact_source()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":23},
    {"schema_name":"public","table_name":"editorial_version_status_events","logical_guard":"legacy_append_only","trigger_name":"trg_editorial_version_status_events_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"editorial_decision_events","logical_guard":"legacy_append_only","trigger_name":"trg_editorial_decision_events_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"content_document_versions","logical_guard":"legacy_append_only","trigger_name":"trg_content_document_versions_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"content_document_versions","logical_guard":"append_only","trigger_name":"content_document_versions_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"editorial_serp_snapshots","logical_guard":"legacy_append_only","trigger_name":"trg_editorial_serp_snapshots_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"editorial_serp_snapshots","logical_guard":"append_only","trigger_name":"editorial_serp_snapshots_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"editorial_serp_reviews","logical_guard":"legacy_append_only","trigger_name":"trg_editorial_serp_reviews_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"editorial_serp_reviews","logical_guard":"append_only","trigger_name":"editorial_serp_reviews_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"brand_site_sync_runs","logical_guard":"append_only","trigger_name":"trg_brand_site_sync_runs_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"brand_site_page_verifications","logical_guard":"append_only","trigger_name":"trg_brand_site_page_verifications_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"brand_site_events","logical_guard":"append_only","trigger_name":"trg_brand_site_events_append_only","function_signature":"public.editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"agencies","logical_guard":"canonical_agency_actor_guard","trigger_name":"canonical_0021_agencies_actor_guard","function_signature":"public.canonical_validate_single_operational_agency_actor()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":29},
    {"schema_name":"public","table_name":"agency_memberships","logical_guard":"canonical_membership_actor_guard","trigger_name":"canonical_0021_memberships_actor_guard","function_signature":"public.canonical_validate_single_operational_agency_actor()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":29},
    {"schema_name":"public","table_name":"integration_grants","logical_guard":"scope_validation","trigger_name":"trg_integration_grants_validate_scope_0024","function_signature":"public.integration_grants_validate_scope()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":23},
    {"schema_name":"public","table_name":"integration_bindings","logical_guard":"scope_validation","trigger_name":"trg_integration_bindings_validate_scope_0024","function_signature":"public.integration_bindings_validate_scope()","classification":"SAFE_TO_KEEP_ENABLED","expected_tgtype":23},
    {"schema_name":"public","table_name":"integration_usage_events","logical_guard":"append_only","trigger_name":"trg_integration_usage_events_append_only_0024","function_signature":"public.integration_usage_events_prevent_mutation()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27},
    {"schema_name":"public","table_name":"brand_exceptional_operation_execution_events","logical_guard":"append_only","trigger_name":"brand_exceptional_operation_execution_events_append_only_trg_00","function_signature":"public.pipeline_editorial_protect_append_only()","classification":"SUSPEND_DURING_DEV_RESET","expected_tgtype":27}
  ]'::jsonb;
  -- The registry remains 23/23 with dry-run/verifier. allow_absent is only
  -- for historical append-only trigger names: if the exact legacy trigger is
  -- not in pg_trigger, there is nothing to suspend; any catalog-present
  -- trigger is still required to match its function OID, event mask and state.
  protection_specs jsonb := '[
    {"table_name":"minerador_keywords","logical_protection":"published_keyword","trigger_name":"trg_protect_published_keyword","function_signature":"public.protect_published_keyword()","expected_tgtype":27},
    {"table_name":"minerador_keyword_lists","logical_protection":"published_lista","trigger_name":"trg_protect_published_lista","function_signature":"public.protect_published_lista()","expected_tgtype":27},
    {"table_name":"marcas","logical_protection":"published_marca","trigger_name":"trg_protect_marca_with_published","function_signature":"public.protect_marca_with_published()","expected_tgtype":11},
    {"table_name":"briefings_artigos","logical_protection":"published_briefing","trigger_name":"trg_protect_published_briefing","function_signature":"public.protect_published_briefing()","expected_tgtype":27},
    {"table_name":"minerador_discovery_runs","logical_protection":"discovery_run_immutable","trigger_name":"minerador_discovery_run_immutable","function_signature":"public.minerador_discovery_run_immutable()","expected_tgtype":27},
    {"table_name":"editorial_artifact_versions","logical_protection":"legacy_append_only","trigger_name":"trg_editorial_artifact_versions_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"editorial_artifact_versions","logical_protection":"append_only","trigger_name":"editorial_artifact_versions_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","expected_tgtype":27},
    {"table_name":"editorial_version_status_events","logical_protection":"legacy_append_only","trigger_name":"trg_editorial_version_status_events_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"editorial_decision_events","logical_protection":"legacy_append_only","trigger_name":"trg_editorial_decision_events_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"content_document_versions","logical_protection":"legacy_append_only","trigger_name":"trg_content_document_versions_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"editorial_serp_snapshots","logical_protection":"append_only","trigger_name":"editorial_serp_snapshots_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","expected_tgtype":27},
    {"table_name":"editorial_serp_snapshots","logical_protection":"legacy_append_only","trigger_name":"trg_editorial_serp_snapshots_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"editorial_serp_reviews","logical_protection":"append_only","trigger_name":"editorial_serp_reviews_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","expected_tgtype":27},
    {"table_name":"editorial_serp_reviews","logical_protection":"legacy_append_only","trigger_name":"trg_editorial_serp_reviews_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"content_document_versions","logical_protection":"append_only","trigger_name":"content_document_versions_append_only_trg","function_signature":"public.pipeline_editorial_protect_append_only()","expected_tgtype":27},
    {"table_name":"integration_usage_events","logical_protection":"append_only","trigger_name":"trg_integration_usage_events_append_only_0024","function_signature":"public.integration_usage_events_prevent_mutation()","expected_tgtype":27},
    {"table_name":"brand_exceptional_operation_execution_events","logical_protection":"append_only","trigger_name":"brand_exceptional_operation_execution_events_append_only_trg_00","function_signature":"public.pipeline_editorial_protect_append_only()","expected_tgtype":27},
    {"table_name":"brand_memberships","logical_protection":"tenant_last_owner","trigger_name":"trg_tenant_0005_protect_last_owner","function_signature":"public.tenant_0005_protect_last_owner()","expected_tgtype":27},
    {"table_name":"agencies","logical_protection":"canonical_agency_actor_guard","trigger_name":"canonical_0021_agencies_actor_guard","function_signature":"public.canonical_validate_single_operational_agency_actor()","expected_tgtype":29},
    {"table_name":"agency_memberships","logical_protection":"canonical_membership_actor_guard","trigger_name":"canonical_0021_memberships_actor_guard","function_signature":"public.canonical_validate_single_operational_agency_actor()","expected_tgtype":29},
    {"table_name":"brand_site_sync_runs","logical_protection":"append_only","trigger_name":"trg_brand_site_sync_runs_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"brand_site_page_verifications","logical_protection":"append_only","trigger_name":"trg_brand_site_page_verifications_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true},
    {"table_name":"brand_site_events","logical_protection":"append_only","trigger_name":"trg_brand_site_events_append_only","function_signature":"public.editorial_protect_append_only()","expected_tgtype":27,"allow_absent":true}
  ]'::jsonb;
  protected_triggers jsonb := '[]'::jsonb;
  counts_before jsonb := '{}'::jsonb;
  counts_after jsonb := '{}'::jsonb;
  counts_before_count integer;
  counts_after_count integer;
  required_relation text;
  table_name text;
  statement text;
  row_count bigint;
  admin_count integer;
  manifest_count integer;
  fk_issue_count integer;
  fk_order_issue_count integer;
  fk_issue text;
  fk_order_issue text;
  self_fk_count integer;
  self_fk_issue_count integer;
  self_fk_issue text;
  mutation_trigger_count integer;
  mutation_trigger_issue_count integer;
  mutation_trigger_issue text;
  mutation_trigger_inventory text;
  observed_trigger record;
  expected_function_oid oid;
  expected record;
  protection record;
BEGIN
  IF reset_ack <> 'DEVELOPMENT_DATA_RESET_CONFIRMED_2026_08_12' THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_ACK_REQUIRED: replace only the acknowledgement after backup and environment confirmation';
  END IF;

  manifest_count := coalesce(array_length(manifest_names, 1), 0);
  IF manifest_count <> 60 OR coalesce(array_length(manifest_ranks, 1), 0) <> 60 THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_MANIFEST_COUNT_INVALID: expected 60 names and ranks, found %/%', manifest_count, coalesce(array_length(manifest_ranks, 1), 0);
  END IF;

  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_OWNER_REQUIRED: execute only as the expected schema owner in the SQL Editor';
  END IF;

  FOREACH required_relation IN ARRAY required_names LOOP
    IF to_regclass(format('public.%I', required_relation)) IS NULL THEN
      RAISE EXCEPTION 'DEVELOPMENT_RESET_RELATION_MISSING: public.%', required_relation;
    END IF;
  END LOOP;

  SELECT count(*) INTO admin_count
  FROM public.perfis p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'admin';
  IF admin_count <> 1 THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_ADMIN_AMBIGUOUS: exactly one Auth-backed global admin is required, found %', admin_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_communication_config AS pcc WHERE pcc.id = 1) THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_PLATFORM_COMMUNICATION_CONFIG_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.integration_connections c
    WHERE c.owner_scope_type = 'platform'
      AND NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = c.created_by_user_id AND p.role = 'admin')
  ) OR EXISTS (
    SELECT 1 FROM public.integration_quota_policies q
    WHERE q.scope_type = 'platform'
      AND NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = q.created_by_user_id AND p.role = 'admin')
  ) THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_PLATFORM_OWNER_UNCONFIRMED: a preserved platform integration row is owned by a non-admin profile';
  END IF;

  WITH manifest(schema_name, table_name, delete_rank) AS (
    SELECT 'public', u.name, u.rank
    FROM unnest(manifest_names, manifest_ranks) AS u(name, rank)
  ),
  fk_catalog AS (
    SELECT fk.conname AS constraint_name,
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
  links AS (
    SELECT f.*, parent.delete_rank AS parent_rank, child.delete_rank AS child_rank
    FROM fk_catalog f
    JOIN manifest parent ON parent.schema_name = f.parent_schema AND parent.table_name = f.parent_table
    LEFT JOIN manifest child ON child.schema_name = f.child_schema AND child.table_name = f.child_table
  )
  SELECT coalesce(string_agg(format('%I.%I constraint=%I -> %I.%I on_delete=%s', l.child_schema, l.child_table, l.constraint_name, l.parent_schema, l.parent_table, l.on_delete), ' | ' ORDER BY l.child_schema, l.child_table, l.constraint_name), 'none'), count(*)
  INTO fk_issue, fk_issue_count
  FROM links AS l
  WHERE l.child_rank IS NULL;
  IF fk_issue_count <> 0 THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_FK_UNCLASSIFIED: %', fk_issue;
  END IF;

  WITH manifest(schema_name, table_name, delete_rank) AS (
    SELECT 'public', u.name, u.rank
    FROM unnest(manifest_names, manifest_ranks) AS u(name, rank)
  ),
  fk_catalog AS (
    SELECT fk.conname AS constraint_name,
           child_schema.nspname AS child_schema, child_table.relname AS child_table,
           parent_schema.nspname AS parent_schema, parent_table.relname AS parent_table,
           child.delete_rank AS child_rank, parent.delete_rank AS parent_rank
    FROM pg_catalog.pg_constraint fk
    JOIN pg_catalog.pg_class child_table ON child_table.oid = fk.conrelid
    JOIN pg_catalog.pg_namespace child_schema ON child_schema.oid = child_table.relnamespace
    JOIN pg_catalog.pg_class parent_table ON parent_table.oid = fk.confrelid
    JOIN pg_catalog.pg_namespace parent_schema ON parent_schema.oid = parent_table.relnamespace
    JOIN manifest child ON child.schema_name = child_schema.nspname AND child.table_name = child_table.relname
    JOIN manifest parent ON parent.schema_name = parent_schema.nspname AND parent.table_name = parent_table.relname
    WHERE fk.contype = 'f'
      AND NOT (child_schema.nspname = parent_schema.nspname AND child_table.relname = parent_table.relname)
  )
  SELECT coalesce(string_agg(format('%I.%I constraint=%I must precede %I.%I', fc.child_schema, fc.child_table, fc.constraint_name, fc.parent_schema, fc.parent_table), ' | ' ORDER BY fc.child_schema, fc.child_table, fc.constraint_name), 'none'), count(*)
  INTO fk_order_issue, fk_order_issue_count
  FROM fk_catalog AS fc
  WHERE fc.child_rank >= fc.parent_rank
    AND NOT (fc.child_schema = 'public' AND fc.child_table = 'content_documents'
      AND fc.parent_schema = 'public' AND fc.parent_table = 'content_document_versions'
      AND fc.constraint_name = 'content_documents_current_version_fk');
  IF fk_order_issue_count <> 0 THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_FK_ORDER_INVALID: %', fk_order_issue;
  END IF;

  WITH manifest(schema_name, table_name, delete_rank) AS (
    SELECT 'public', u.name, u.rank
    FROM unnest(manifest_names, manifest_ranks) AS u(name, rank)
  ),
  partial_reset_tables(schema_name, table_name) AS (
    VALUES
      ('public', 'integration_connections'),
      ('public', 'integration_quota_policies'),
      ('public', 'brand_roles'),
      ('public', 'perfis')
  ),
  self_fk_catalog AS (
    SELECT fk.conname AS constraint_name,
           child_schema.nspname AS child_schema, child_table.relname AS child_table,
           CASE WHEN partial.table_name IS NULL THEN 'SAFE_FULL_TABLE_RESET' ELSE 'UNSAFE_PARTIAL_RESET' END AS reset_mode
    FROM pg_catalog.pg_constraint fk
    JOIN pg_catalog.pg_class child_table ON child_table.oid = fk.conrelid
    JOIN pg_catalog.pg_namespace child_schema ON child_schema.oid = child_table.relnamespace
    JOIN pg_catalog.pg_class parent_table ON parent_table.oid = fk.confrelid
    JOIN pg_catalog.pg_namespace parent_schema ON parent_schema.oid = parent_table.relnamespace
    JOIN manifest included ON included.schema_name = child_schema.nspname AND included.table_name = child_table.relname
    LEFT JOIN partial_reset_tables partial
      ON partial.schema_name = child_schema.nspname AND partial.table_name = child_table.relname
    WHERE fk.contype = 'f'
      AND child_schema.nspname = parent_schema.nspname
      AND child_table.relname = parent_table.relname
  )
  SELECT coalesce(string_agg(format('%I.%I constraint=%I mode=%s', sfc.child_schema, sfc.child_table, sfc.constraint_name, sfc.reset_mode),
           ' | ' ORDER BY sfc.child_schema, sfc.child_table, sfc.constraint_name), 'none'),
         count(*) FILTER (WHERE sfc.reset_mode <> 'SAFE_FULL_TABLE_RESET')::integer,
         count(*)::integer
  INTO self_fk_issue, self_fk_issue_count, self_fk_count
  FROM self_fk_catalog AS sfc;
  IF self_fk_issue_count <> 0 THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_SELF_FK_UNSAFE: %', self_fk_issue;
  END IF;
  RAISE NOTICE 'DEVELOPMENT_RESET_SELF_FK_GATE_PASS: count=% details=%', self_fk_count, self_fk_issue;

  WITH mutation_expectations AS (
    SELECT me.schema_name, me.table_name, me.logical_guard, me.trigger_name,
           me.function_signature, me.classification, me.expected_tgtype
    FROM jsonb_to_recordset(mutation_trigger_specs)
      AS me(schema_name text, table_name text, logical_guard text, trigger_name text,
          function_signature text, classification text, expected_tgtype integer)
  ),
  mutation_inventory AS (
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
    LEFT JOIN mutation_expectations e
      ON e.schema_name = n.nspname AND e.table_name = c.relname AND e.trigger_name = t.tgname
    WHERE NOT t.tgisinternal
      AND ((t.tgtype::integer & 8) <> 0 OR (t.tgtype::integer & 16) <> 0)
      AND EXISTS (
        SELECT 1
        FROM unnest(manifest_names) AS included(table_name)
        WHERE n.nspname = 'public' AND included.table_name = c.relname
      )
  )
  SELECT coalesce(string_agg(format('%I.%I trigger=%I classification=%s function=%s events=%s enabled=%s',
           mi.schema_name, mi.table_name, mi.trigger_name, mi.classification_result,
           coalesce(mi.function_signature, 'unknown'), mi.actual_tgtype, mi.tgenabled),
           ' | ' ORDER BY mi.schema_name, mi.table_name, mi.trigger_name), 'none'),
         coalesce(string_agg(format('%I.%I trigger=%I classification=%s function=%s events=%s enabled=%s',
           mi.schema_name, mi.table_name, mi.trigger_name, mi.classification_result,
           coalesce(mi.function_signature, 'unknown'), mi.actual_tgtype, mi.tgenabled),
           ' | ' ORDER BY mi.schema_name, mi.table_name, mi.trigger_name)
           FILTER (WHERE mi.classification_result IN ('UNCLASSIFIED', 'INVESTIGATE', 'SPEC_MISMATCH')), 'none'),
         count(*) FILTER (WHERE mi.classification_result IN ('UNCLASSIFIED', 'INVESTIGATE', 'SPEC_MISMATCH'))::integer,
         count(*)::integer
  INTO mutation_trigger_inventory, mutation_trigger_issue, mutation_trigger_issue_count, mutation_trigger_count
  FROM mutation_inventory AS mi;
  IF mutation_trigger_issue_count <> 0 THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_MUTATION_TRIGGER_GATE: %', mutation_trigger_issue;
  END IF;
  RAISE NOTICE 'DEVELOPMENT_RESET_MUTATION_TRIGGER_GATE_PASS: count=% inventory=%', mutation_trigger_count, mutation_trigger_inventory;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname ~* '(activity|notification)'
  ) THEN
    RAISE EXCEPTION 'DEVELOPMENT_RESET_UNCLASSIFIED_ACTIVITY_OR_NOTIFICATION: classify the catalog relation before reset';
  END IF;

  FOR expected IN
    SELECT x.table_name, x.logical_protection, x.trigger_name, x.function_signature, x.expected_tgtype, x.allow_absent
    FROM jsonb_to_recordset(protection_specs)
      AS x(table_name text, logical_protection text, trigger_name text, function_signature text, expected_tgtype integer, allow_absent boolean)
  LOOP
    IF to_regclass(format('public.%I', expected.table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    SELECT n.nspname AS schema_name, c.relname AS table_name, t.tgname AS trigger_name,
           t.tgenabled, t.tgtype::integer AS observed_tgtype, t.tgfoid AS function_oid,
           p.oid::regprocedure::text AS actual_function_signature
    INTO observed_trigger
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public' AND c.relname = expected.table_name
      AND t.tgname = expected.trigger_name AND NOT t.tgisinternal;
    IF NOT FOUND THEN
      IF coalesce(expected.allow_absent, false) THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'DEVELOPMENT_RESET_PROTECTION_PRECONDITION: trigger missing for %.%', expected.table_name, expected.logical_protection;
    END IF;

    expected_function_oid := to_regprocedure(expected.function_signature)::oid;
    IF expected_function_oid IS NULL OR observed_trigger.function_oid IS NULL THEN
      RAISE EXCEPTION 'DEVELOPMENT_RESET_PROTECTION_PRECONDITION: function missing for %.% expected=% actual=%',
        expected.table_name, expected.logical_protection, expected.function_signature,
        coalesce(observed_trigger.actual_function_signature, 'unresolved');
    END IF;
    IF observed_trigger.function_oid <> expected_function_oid
       OR observed_trigger.observed_tgtype <> expected.expected_tgtype
       OR observed_trigger.tgenabled = 'D' THEN
      RAISE EXCEPTION 'DEVELOPMENT_RESET_PROTECTION_PRECONDITION: trigger mismatch for %.%', expected.table_name, expected.logical_protection;
    END IF;
    protected_triggers := protected_triggers || jsonb_build_array(jsonb_build_object(
      'schema_name', observed_trigger.schema_name,
      'table_name', observed_trigger.table_name,
      'trigger_name', observed_trigger.trigger_name,
      'original_enabled', observed_trigger.tgenabled,
      'function_signature', observed_trigger.actual_function_signature,
      'function_oid', observed_trigger.function_oid::bigint,
      'expected_tgtype', expected.expected_tgtype
    ));
  END LOOP;

  FOREACH table_name IN ARRAY manifest_names LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO row_count;
      counts_before := counts_before || jsonb_build_object(table_name, row_count);
    END IF;
  END LOOP;

  FOR protection IN
    SELECT x.schema_name, x.table_name, x.trigger_name, x.original_enabled, x.function_signature, x.function_oid, x.expected_tgtype
    FROM jsonb_to_recordset(protected_triggers)
      AS x(schema_name text, table_name text, trigger_name text, original_enabled text, function_signature text, function_oid bigint, expected_tgtype integer)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I', protection.schema_name, protection.table_name, protection.trigger_name);
  END LOOP;

  FOREACH statement IN ARRAY ARRAY[
    'brand_site_import_items', 'brand_site_import_batches', 'brand_site_keyword_candidates',
    'brand_site_page_verifications', 'brand_site_events', 'brand_site_catalog_entries',
    'brand_site_sync_runs', 'brand_site_sitemaps', 'content_document_comments',
    'editorial_version_status_events', 'editorial_decision_events', 'briefings_artigos',
    'brand_invitation_permissions', 'brand_invitations', 'delegated_access_permissions',
    'delegated_access_grants'
  ] LOOP
    IF to_regclass(format('public.%I', statement)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I', statement);
    END IF;
  END LOOP;

  IF to_regclass('public.brand_role_permissions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.brand_role_permissions AS brp USING public.brand_roles AS br WHERE brp.role_id = br.id AND br.marca_id IS NOT NULL';
  END IF;

  FOREACH statement IN ARRAY ARRAY[
    'DELETE FROM public.communication_delivery_events',
    'DELETE FROM public.communication_messages',
    'DELETE FROM public.agency_invitation_token_generations',
    'DELETE FROM public.agency_onboardings',
    'DELETE FROM public.agency_invitations',
    'DELETE FROM public.agency_applications',
    'DELETE FROM public.brand_exceptional_operation_execution_events',
    'DELETE FROM public.brand_exceptional_operation_grants',
    'DELETE FROM public.integration_usage_events',
    'DELETE FROM public.integration_bindings',
    'DELETE FROM public.integration_grants',
    'DELETE FROM public.integration_quota_policies WHERE scope_type <> ''platform''',
    'DELETE FROM public.integration_connections WHERE owner_scope_type <> ''platform''',
    'DELETE FROM public.editorial_saved_views',
    'DELETE FROM public.content_document_user_states',
    'DELETE FROM public.publication_records',
    'UPDATE public.content_documents SET current_version_id = NULL WHERE current_version_id IS NOT NULL',
    'DELETE FROM public.content_document_versions',
    'DELETE FROM public.content_documents',
    'DELETE FROM public.editorial_serp_reviews',
    'DELETE FROM public.editorial_serp_snapshots',
    'DELETE FROM public.editorial_workflow_items',
    'DELETE FROM public.editorial_artifact_versions',
    'DELETE FROM public.minerador_keyword_metric_measurements',
    'DELETE FROM public.minerador_google_ads_connections',
    'DELETE FROM public.minerador_discovery_candidate_metric_history',
    'DELETE FROM public.minerador_discovery_candidate_current_metrics',
    'DELETE FROM public.minerador_discovery_keyword_origins',
    'DELETE FROM public.minerador_discovery_import_batches',
    'DELETE FROM public.minerador_discovery_candidates',
    'DELETE FROM public.minerador_discovery_runs',
    'DELETE FROM public.minerador_keywords',
    'DELETE FROM public.minerador_keyword_lists',
    'DELETE FROM public.agency_membership_capabilities',
    'DELETE FROM public.brand_agency_capability_restrictions',
    'DELETE FROM public.agency_brands',
    'DELETE FROM public.tenant_0016_agency_role_rollback',
    'DELETE FROM public.agency_memberships',
    'DELETE FROM public.brand_member_permissions',
    'DELETE FROM public.brand_memberships',
    'DELETE FROM public.brand_roles WHERE marca_id IS NOT NULL',
    'DELETE FROM public.agencies',
    'DELETE FROM public.marcas',
    'DELETE FROM public.perfis WHERE role IS DISTINCT FROM ''admin'''
  ] LOOP
    EXECUTE statement;
  END LOOP;

  FOR protection IN
    SELECT x.schema_name, x.table_name, x.trigger_name, x.original_enabled, x.function_signature, x.function_oid, x.expected_tgtype
    FROM jsonb_to_recordset(protected_triggers)
      AS x(schema_name text, table_name text, trigger_name text, original_enabled text, function_signature text, function_oid bigint, expected_tgtype integer)
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I %s TRIGGER %I',
      protection.schema_name,
      protection.table_name,
      CASE protection.original_enabled
        WHEN 'O' THEN 'ENABLE'
        WHEN 'R' THEN 'ENABLE REPLICA'
        WHEN 'A' THEN 'ENABLE ALWAYS'
        ELSE 'DISABLE'
      END,
      protection.trigger_name
    );
  END LOOP;

  FOR protection IN
    SELECT x.schema_name, x.table_name, x.trigger_name, x.original_enabled, x.function_signature, x.function_oid, x.expected_tgtype
    FROM jsonb_to_recordset(protected_triggers)
      AS x(schema_name text, table_name text, trigger_name text, original_enabled text, function_signature text, function_oid bigint, expected_tgtype integer)
  LOOP
    SELECT t.tgenabled, t.tgtype::integer AS observed_tgtype, t.tgfoid
    INTO observed_trigger
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = protection.schema_name AND c.relname = protection.table_name
      AND t.tgname = protection.trigger_name AND NOT t.tgisinternal;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DEVELOPMENT_RESET_PROTECTION_RESTORE_FAILED: %.%', protection.table_name, protection.trigger_name;
    END IF;
    IF observed_trigger.tgenabled <> protection.original_enabled
       OR observed_trigger.observed_tgtype <> protection.expected_tgtype
       OR observed_trigger.tgfoid <> protection.function_oid::oid THEN
      RAISE EXCEPTION 'DEVELOPMENT_RESET_PROTECTION_RESTORE_FAILED: %.%', protection.table_name, protection.trigger_name;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY manifest_names LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    IF table_name = 'integration_connections' THEN
      EXECUTE 'SELECT count(*) FROM public.integration_connections AS ic WHERE ic.owner_scope_type <> ''platform''' INTO row_count;
    ELSIF table_name = 'integration_quota_policies' THEN
      EXECUTE 'SELECT count(*) FROM public.integration_quota_policies AS iqp WHERE iqp.scope_type <> ''platform''' INTO row_count;
    ELSIF table_name = 'brand_roles' THEN
      EXECUTE 'SELECT count(*) FROM public.brand_roles AS br WHERE br.marca_id IS NOT NULL' INTO row_count;
    ELSIF table_name = 'perfis' THEN
      EXECUTE 'SELECT count(*) FROM public.perfis AS prf WHERE prf.role IS DISTINCT FROM ''admin''' INTO row_count;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO row_count;
    END IF;
    counts_after := counts_after || jsonb_build_object(table_name, row_count);
    IF row_count <> 0 THEN
      RAISE EXCEPTION 'DEVELOPMENT_RESET_AFTER_STATE_FAILED: public.% contains % reset rows', table_name, row_count;
    END IF;
  END LOOP;

  SELECT count(*)::integer
  INTO counts_before_count
  FROM jsonb_object_keys(counts_before);
  SELECT count(*)::integer
  INTO counts_after_count
  FROM jsonb_object_keys(counts_after);
  RAISE NOTICE 'DEVELOPMENT_RESET_AFTER_PASS: before_keys=% after_keys=%', counts_before_count, counts_after_count;
END $$;

COMMIT;

SELECT 'RESET_COMMITTED' AS check_name, 'single transaction' AS expected, 'COMMIT' AS observed, 'PASS' AS verdict;
