-- MASTER REFRESH BATCH 5 - recovery export source (read-only)
-- Download the single JSON result locally before execution. Hash the exact bytes with SHA-256.
-- Do not paste the payload in tickets or logs: it contains full recovery rows.
BEGIN TRANSACTION READ ONLY;
WITH ta(id) AS (VALUES
 ('1febb431-4e44-49e9-b8cd-12115f4ad999'::uuid),('3cc14013-3296-4094-80de-712abc4ceae8'::uuid),
 ('cd84f5ee-b939-4b05-afa4-52aabb8c9aa4'::uuid),('ae851a64-5bff-449b-865c-ec6aa950be38'::uuid)
), tb(id) AS (VALUES
 ('f514a553-ce4a-472e-9aec-c3fecff375f1'::uuid),('033b0cde-6e00-472c-b9d6-3c10ad33ae61'::uuid)
), apps(id) AS (VALUES ('6aa1c110-33e1-4f9a-b91d-6e546c414260'::uuid)
), invs(id) AS (VALUES
 ('0339a65a-2421-41c3-8130-605e611c567b'::uuid),('1627c94b-d2e3-4dfc-a807-1d7bae8b9fca'::uuid),('f1a545a5-b728-4dbf-b3e4-ee406b259444'::uuid)
), msgs(id) AS (VALUES
 ('43c75723-b6d4-4d58-93f2-46ce7d4a03a5'::uuid),('458499f3-67fc-457f-b3a3-324605f29a26'::uuid),('53ccf23a-b33f-4900-a206-2dbdf471e362'::uuid),
 ('9883ace4-612e-4e09-961b-cb0658246c5c'::uuid),('ac57f7dc-3248-4121-8e99-3d312043e0a7'::uuid),('e735b1a7-2e11-47b5-b0ed-137c8a9dc28f'::uuid),('eee3870e-f72b-4da0-a4e9-74bd4e9f921f'::uuid)
), payload AS (
 SELECT 'agencies' table_name, to_jsonb(a) row_data FROM public.agencies a WHERE id IN (SELECT id FROM ta)
 UNION ALL SELECT 'agency_access_periods',to_jsonb(t) FROM public.agency_access_periods t WHERE agency_id IN (SELECT id FROM ta)
 UNION ALL SELECT 'agency_applications',to_jsonb(t) FROM public.agency_applications t WHERE id IN (SELECT id FROM apps)
 UNION ALL SELECT 'agency_brands',to_jsonb(t) FROM public.agency_brands t WHERE agency_id IN (SELECT id FROM ta) OR brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'agency_invitation_token_generations',to_jsonb(t) FROM public.agency_invitation_token_generations t WHERE invitation_id IN (SELECT id FROM invs)
 UNION ALL SELECT 'agency_invitations',to_jsonb(t) FROM public.agency_invitations t WHERE id IN (SELECT id FROM invs)
 UNION ALL SELECT 'agency_memberships',to_jsonb(t) FROM public.agency_memberships t WHERE agency_id IN (SELECT id FROM ta)
 UNION ALL SELECT 'agency_onboardings',to_jsonb(t) FROM public.agency_onboardings t WHERE agency_id IN (SELECT id FROM ta) OR invitation_id IN (SELECT id FROM invs)
 UNION ALL SELECT 'communication_delivery_events',to_jsonb(t) FROM public.communication_delivery_events t WHERE communication_message_id IN (SELECT id FROM msgs)
 UNION ALL SELECT 'communication_messages',to_jsonb(t) FROM public.communication_messages t WHERE id IN (SELECT id FROM msgs)
 UNION ALL SELECT 'marcas',to_jsonb(t) FROM public.marcas t WHERE id IN (SELECT id FROM tb)
 UNION ALL SELECT 'integration_usage_events',to_jsonb(t) FROM public.integration_usage_events t WHERE agency_id IN (SELECT id FROM ta) AND brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'integration_grants',to_jsonb(t) FROM public.integration_grants t WHERE source_agency_id IN (SELECT id FROM ta) OR target_agency_id IN (SELECT id FROM ta) OR target_brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'integration_bindings',to_jsonb(t) FROM public.integration_bindings t WHERE target_agency_id IN (SELECT id FROM ta) OR target_brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'minerador_keywords',to_jsonb(t) FROM public.minerador_keywords t WHERE brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'minerador_discovery_runs',to_jsonb(t) FROM public.minerador_discovery_runs t WHERE brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'minerador_discovery_candidates',to_jsonb(t) FROM public.minerador_discovery_candidates t WHERE brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'minerador_discovery_import_batches',to_jsonb(t) FROM public.minerador_discovery_import_batches t WHERE brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'minerador_discovery_keyword_origins',to_jsonb(t) FROM public.minerador_discovery_keyword_origins t WHERE brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'minerador_discovery_candidate_current_metrics',to_jsonb(t) FROM public.minerador_discovery_candidate_current_metrics t WHERE brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'minerador_discovery_candidate_metric_history',to_jsonb(t) FROM public.minerador_discovery_candidate_metric_history t WHERE brand_id IN (SELECT id FROM tb)
), grouped AS (
 SELECT table_name,count(*) row_count,
   md5(string_agg(md5(row_data::text),'' ORDER BY md5(row_data::text))) fingerprint,
   jsonb_agg(row_data ORDER BY md5(row_data::text)) rows
 FROM payload GROUP BY table_name
)
SELECT jsonb_build_object(
 'project','hjjlntdpdgvpnazdztqw','batch','master-refresh-5','captured_at',statement_timestamp(),
 'tables',jsonb_agg(to_jsonb(grouped) ORDER BY table_name)
) AS recovery_export
FROM grouped;
ROLLBACK;
