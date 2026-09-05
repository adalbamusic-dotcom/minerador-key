-- MASTER REFRESH BATCH 5 - bound read-only preflight
-- Project: hjjlntdpdgvpnazdztqw
-- Baseline captured: 2026-08-17. This statement performs no writes.
BEGIN TRANSACTION READ ONLY;

WITH
target_agencies(id, name) AS (VALUES
  ('1febb431-4e44-49e9-b8cd-12115f4ad999'::uuid, 'AdalbaFotos'),
  ('3cc14013-3296-4094-80de-712abc4ceae8'::uuid, 'AdalbaPro'),
  ('cd84f5ee-b939-4b05-afa4-52aabb8c9aa4'::uuid, 'AdaMusic'),
  ('ae851a64-5bff-449b-865c-ec6aa950be38'::uuid, 'AdaSEO')
),
target_brands(id, name) AS (VALUES
  ('f514a553-ce4a-472e-9aec-c3fecff375f1'::uuid, 'Adalba'),
  ('033b0cde-6e00-472c-b9d6-3c10ad33ae61'::uuid, 'Care Glow')
),
target_applications(id) AS (VALUES ('6aa1c110-33e1-4f9a-b91d-6e546c414260'::uuid)),
target_invitations(id) AS (VALUES
  ('0339a65a-2421-41c3-8130-605e611c567b'::uuid),
  ('1627c94b-d2e3-4dfc-a807-1d7bae8b9fca'::uuid),
  ('f1a545a5-b728-4dbf-b3e4-ee406b259444'::uuid)
),
target_messages(id) AS (VALUES
  ('43c75723-b6d4-4d58-93f2-46ce7d4a03a5'::uuid),
  ('458499f3-67fc-457f-b3a3-324605f29a26'::uuid),
  ('53ccf23a-b33f-4900-a206-2dbdf471e362'::uuid),
  ('9883ace4-612e-4e09-961b-cb0658246c5c'::uuid),
  ('ac57f7dc-3248-4121-8e99-3d312043e0a7'::uuid),
  ('e735b1a7-2e11-47b5-b0ed-137c8a9dc28f'::uuid),
  ('eee3870e-f72b-4da0-a4e9-74bd4e9f921f'::uuid)
),
observations(check_name, expected, observed) AS (
  SELECT 'test_agencies', '4 exact id/name pairs', count(*)::text
  FROM public.agencies a JOIN target_agencies t USING (id) WHERE a.name=t.name
  UNION ALL SELECT 'test_brands', '2 exact id/name pairs', count(*)::text
  FROM public.marcas m JOIN target_brands t ON t.id=m.id WHERE m.nome=t.name
  UNION ALL SELECT 'agency_access_periods', '4', count(*)::text FROM public.agency_access_periods WHERE agency_id IN (SELECT id FROM target_agencies)
  UNION ALL SELECT 'agency_applications', '1', count(*)::text FROM public.agency_applications WHERE id IN (SELECT id FROM target_applications)
  UNION ALL SELECT 'agency_brands', '2', count(*)::text FROM public.agency_brands WHERE agency_id IN (SELECT id FROM target_agencies) OR brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'agency_invitation_token_generations', '3', count(*)::text FROM public.agency_invitation_token_generations WHERE invitation_id IN (SELECT id FROM target_invitations)
  UNION ALL SELECT 'agency_invitations', '3', count(*)::text FROM public.agency_invitations WHERE id IN (SELECT id FROM target_invitations)
  UNION ALL SELECT 'agency_membership_capabilities', '0', count(*)::text FROM public.agency_membership_capabilities WHERE membership_id IN (SELECT id FROM public.agency_memberships WHERE agency_id IN (SELECT id FROM target_agencies))
  UNION ALL SELECT 'agency_memberships', '4', count(*)::text FROM public.agency_memberships WHERE agency_id IN (SELECT id FROM target_agencies)
  UNION ALL SELECT 'agency_onboardings', '3', count(*)::text FROM public.agency_onboardings WHERE agency_id IN (SELECT id FROM target_agencies) OR invitation_id IN (SELECT id FROM target_invitations)
  UNION ALL SELECT 'brand_agency_capability_restrictions', '0', count(*)::text FROM public.brand_agency_capability_restrictions WHERE agency_id IN (SELECT id FROM target_agencies) OR brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'brand_member_permissions', '0', count(*)::text FROM public.brand_member_permissions WHERE membership_id IN (SELECT id FROM public.brand_memberships WHERE marca_id IN (SELECT id FROM target_brands))
  UNION ALL SELECT 'brand_memberships', '0', count(*)::text FROM public.brand_memberships WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'brand_roles', '0', count(*)::text FROM public.brand_roles WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'briefings_artigos', '0', count(*)::text FROM public.briefings_artigos WHERE silo_id IN (SELECT id FROM public.minerador_keyword_lists WHERE marca_id IN (SELECT id FROM target_brands))
  UNION ALL SELECT 'communication_delivery_events', '0', count(*)::text FROM public.communication_delivery_events WHERE communication_message_id IN (SELECT id FROM target_messages)
  UNION ALL SELECT 'communication_messages', '7', count(*)::text FROM public.communication_messages WHERE id IN (SELECT id FROM target_messages)
  UNION ALL SELECT 'content_document_user_states', '0', count(*)::text FROM public.content_document_user_states WHERE document_id IN (SELECT id FROM public.content_documents WHERE marca_id IN (SELECT id FROM target_brands))
  UNION ALL SELECT 'content_document_versions', '0', count(*)::text FROM public.content_document_versions WHERE document_id IN (SELECT id FROM public.content_documents WHERE marca_id IN (SELECT id FROM target_brands))
  UNION ALL SELECT 'content_documents', '0', count(*)::text FROM public.content_documents WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'editorial_artifact_versions', '0', count(*)::text FROM public.editorial_artifact_versions WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'editorial_decision_events', '0', count(*)::text FROM public.editorial_decision_events WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'editorial_saved_views', '0', count(*)::text FROM public.editorial_saved_views WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'editorial_serp_reviews', '0', count(*)::text FROM public.editorial_serp_reviews WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'editorial_serp_snapshots', '0', count(*)::text FROM public.editorial_serp_snapshots WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'editorial_version_status_events', '0', count(*)::text FROM public.editorial_version_status_events WHERE version_id IN (SELECT version_id FROM public.editorial_artifact_versions WHERE marca_id IN (SELECT id FROM target_brands))
  UNION ALL SELECT 'editorial_workflow_items', '0', count(*)::text FROM public.editorial_workflow_items WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'integration_bindings', '12', count(*)::text FROM public.integration_bindings WHERE target_agency_id IN (SELECT id FROM target_agencies) OR target_brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'integration_grants', '12', count(*)::text FROM public.integration_grants WHERE source_agency_id IN (SELECT id FROM target_agencies) OR target_agency_id IN (SELECT id FROM target_agencies) OR target_brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'integration_quota_policies', '0', count(*)::text FROM public.integration_quota_policies WHERE agency_id IN (SELECT id FROM target_agencies) OR brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'integration_usage_events', '22', count(*)::text FROM public.integration_usage_events WHERE agency_id IN (SELECT id FROM target_agencies) AND brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_keywords', '17', count(*)::text FROM public.minerador_keywords WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_keyword_lists', '0', count(*)::text FROM public.minerador_keyword_lists WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_keyword_metric_measurements', '0', count(*)::text FROM public.minerador_keyword_metric_measurements WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_discovery_runs', '20', count(*)::text FROM public.minerador_discovery_runs WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_discovery_candidates', '714', count(*)::text FROM public.minerador_discovery_candidates WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_discovery_import_batches', '10', count(*)::text FROM public.minerador_discovery_import_batches WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_discovery_keyword_origins', '20', count(*)::text FROM public.minerador_discovery_keyword_origins WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_discovery_candidate_current_metrics', '183', count(*)::text FROM public.minerador_discovery_candidate_current_metrics WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'minerador_discovery_candidate_metric_history', '3', count(*)::text FROM public.minerador_discovery_candidate_metric_history WHERE brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'publication_records', '0', count(*)::text FROM public.publication_records WHERE marca_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'global_admin_auth', '1', count(*)::text FROM auth.users WHERE lower(email)='adalbapro@gmail.com'
  UNION ALL SELECT 'global_admin_perfil', '1', count(*)::text FROM public.perfis p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)='adalbapro@gmail.com' AND lower(p.role)='admin'
  UNION ALL SELECT 'auth_users_total', '4', count(*)::text FROM auth.users
  UNION ALL SELECT 'tenant_owned_connections', '0', count(*)::text FROM public.integration_connections WHERE owner_agency_id IN (SELECT id FROM target_agencies) OR owner_brand_id IN (SELECT id FROM target_brands)
  UNION ALL SELECT 'dataforseo_connection', '1 ready platform connection with Vault secret', count(*)::text
    FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id JOIN vault.secrets s ON s.id::text=c.secret_ref
    WHERE p.provider_key='dataforseo' AND c.owner_scope_type='platform' AND c.owner_agency_id IS NULL AND c.owner_brand_id IS NULL AND c.lifecycle_status='ready'
  UNION ALL SELECT 'openrouter_connection', '1 ready platform connection with Vault secret', count(*)::text
    FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id JOIN vault.secrets s ON s.id::text=c.secret_ref
    WHERE p.provider_key='openrouter' AND c.owner_scope_type='platform' AND c.owner_agency_id IS NULL AND c.owner_brand_id IS NULL AND c.lifecycle_status='ready'
  UNION ALL SELECT 'vault_catalog', '4', count(*)::text FROM vault.secrets
  UNION ALL SELECT 'usage_remote_fingerprint', 'ce3174ca2afe39b352ae704c6f96153c',
    md5(coalesce(string_agg(md5(to_jsonb(u)::text), '' ORDER BY u.id), ''))
    FROM public.integration_usage_events u WHERE agency_id IN (SELECT id FROM target_agencies) AND brand_id IN (SELECT id FROM target_brands)
),
checks AS (
  SELECT check_name, expected, observed,
    CASE WHEN (check_name='test_agencies' AND observed='4')
           OR (check_name='test_brands' AND observed='2')
           OR (check_name NOT IN ('test_agencies','test_brands') AND observed=split_part(expected,' ',1))
           OR (check_name='usage_remote_fingerprint' AND observed=expected)
         THEN 'PASS' ELSE 'FAIL' END verdict
  FROM observations
)
SELECT * FROM checks
UNION ALL
SELECT 'BATCH_5_PREFLIGHT', 'all bound checks PASS',
       count(*) FILTER (WHERE verdict='FAIL')::text,
       CASE WHEN count(*) FILTER (WHERE verdict='FAIL')=0 THEN 'PASS' ELSE 'FAIL' END
FROM checks
ORDER BY check_name;

ROLLBACK;
