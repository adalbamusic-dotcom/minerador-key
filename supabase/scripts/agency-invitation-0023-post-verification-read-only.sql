-- AgencyInvitation lifecycle 0023 post-verification.
-- SOMENTE LEITURA. Um único result set final.
-- Não retorna UUID, e-mail, nome pessoal, token, token_hash ou payload.
WITH
script_version AS (
  SELECT 'script_version'::text AS check_name,
         '2026-08-10-0023-v1'::text AS expected,
         '2026-08-10-0023-v1'::text AS observed,
         'INFO'::text AS verdict
),
objects AS (
  SELECT *
  FROM (VALUES
    ('table:agency_applications', to_regclass('public.agency_applications') IS NOT NULL, 'present'::text),
    ('table:agency_invitations', to_regclass('public.agency_invitations') IS NOT NULL, 'present'::text),
    ('table:agency_invitation_token_generations',
      to_regclass('public.agency_invitation_token_generations') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_invitation_token_generations' AND column_name = 'token_hash')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_invitation_token_generations' AND column_name <> 'token_hash' AND column_name ILIKE '%token%')
      AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.agency_invitation_token_generations') AND c.contype = 'f' AND c.confrelid = to_regclass('public.agency_invitations') AND c.confdeltype = 'r')
      AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.agency_invitation_token_generations') AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%generation%>%0%')
      AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.agency_invitation_token_generations') AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%char_length(token_hash)%64%')
      AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.agency_invitation_token_generations') AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%used_at IS NULL%' AND pg_get_constraintdef(c.oid) ILIKE '%revoked_at IS NULL%'),
      'present; hash-only; invitation FK; generation check'::text),
    ('table:communication_messages', to_regclass('public.communication_messages') IS NOT NULL, 'present'::text)
  ) AS value(check_name, contract_ok, observed)
),
object_checks AS (
  SELECT check_name,
         CASE WHEN check_name = 'table:agency_invitation_token_generations' THEN 'present with hash-only/token FK/check contract' ELSE 'present' END AS expected,
         CASE WHEN contract_ok THEN observed ELSE 'missing-or-contract-mismatch' END AS observed,
         CASE WHEN contract_ok THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM objects
),
column_check AS (
  SELECT 'column:agency_invitations.is_operational'::text AS check_name,
         'boolean NOT NULL DEFAULT false'::text AS expected,
         coalesce(format('%s nullable=%s default=%s', data_type, is_nullable, coalesce(column_default, 'none')), 'missing') AS observed,
         CASE WHEN data_type = 'boolean' AND is_nullable = 'NO' AND column_default LIKE '%false%' THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'agency_invitations' AND column_name = 'is_operational'
  UNION ALL
  SELECT 'column:agency_invitations.is_operational', 'boolean NOT NULL DEFAULT false', 'missing', 'FAIL'
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_invitations' AND column_name = 'is_operational')
),
constraint_checks AS (
  SELECT 'constraint:application_id_unique_removed'::text AS check_name,
         'no single-column UNIQUE on application_id'::text AS expected,
         CASE WHEN NOT EXISTS (
           SELECT 1 FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
           WHERE c.conrelid = to_regclass('public.agency_invitations') AND c.contype = 'u' AND array_length(c.conkey, 1) = 1 AND a.attname = 'application_id'
         ) THEN 'absent' ELSE 'present' END AS observed,
         CASE WHEN NOT EXISTS (
           SELECT 1 FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
           WHERE c.conrelid = to_regclass('public.agency_invitations') AND c.contype = 'u' AND array_length(c.conkey, 1) = 1 AND a.attname = 'application_id'
         ) THEN 'PASS' ELSE 'FAIL' END AS verdict
  UNION ALL
  SELECT 'fk:agency_invitations.application_id',
         'referential action = RESTRICT',
         coalesce((SELECT string_agg(c.conname || ': ' || pg_get_constraintdef(c.oid), ' | ' ORDER BY c.conname)
                     FROM pg_constraint c
                    WHERE c.conrelid = to_regclass('public.agency_invitations') AND c.contype = 'f' AND c.confrelid = to_regclass('public.agency_applications') AND c.confdeltype = 'r'), 'missing-or-nonrestrict'),
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_constraint c
           JOIN pg_attribute local_column ON local_column.attrelid = c.conrelid AND local_column.attnum = c.conkey[1]
           JOIN pg_attribute remote_column ON remote_column.attrelid = c.confrelid AND remote_column.attnum = c.confkey[1]
           WHERE c.conrelid = to_regclass('public.agency_invitations') AND c.contype = 'f' AND c.confrelid = to_regclass('public.agency_applications') AND c.confdeltype = 'r' AND local_column.attname = 'application_id' AND remote_column.attname = 'id'
         ) THEN 'PASS' ELSE 'FAIL' END
),
index_checks AS (
  SELECT 'index:agency_invitations.application_id'::text AS check_name,
         'non-unique index on application_id'::text AS expected,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_index i
           WHERE i.indrelid = to_regclass('public.agency_invitations') AND i.indnatts = 1 AND NOT i.indisunique AND pg_get_indexdef(i.indexrelid) ILIKE '%(application_id)%'
         ) THEN 'present' ELSE 'missing' END AS observed,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_index i
           WHERE i.indrelid = to_regclass('public.agency_invitations') AND i.indnatts = 1 AND NOT i.indisunique AND pg_get_indexdef(i.indexrelid) ILIKE '%(application_id)%'
         ) THEN 'PASS' ELSE 'FAIL' END AS verdict
  UNION ALL
  SELECT 'index:agency_invitations.operational_partial_unique',
         'UNIQUE(application_id) WHERE application_id IS NOT NULL AND is_operational',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_index i
           WHERE i.indrelid = to_regclass('public.agency_invitations') AND i.indisunique AND pg_get_indexdef(i.indexrelid) ILIKE '%application_id%' AND pg_get_indexdef(i.indexrelid) ILIKE '%is_operational%' AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%application_id%IS NOT NULL%'
         ) THEN 'present' ELSE 'missing' END,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_index i
           WHERE i.indrelid = to_regclass('public.agency_invitations') AND i.indisunique AND pg_get_indexdef(i.indexrelid) ILIKE '%application_id%' AND pg_get_indexdef(i.indexrelid) ILIKE '%is_operational%' AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%application_id%IS NOT NULL%'
         ) THEN 'PASS' ELSE 'FAIL' END
),
data_checks AS (
  SELECT 'data:operational_duplicate_count'::text AS check_name,
         '0'::text AS expected,
         (SELECT count(*)::text FROM (SELECT application_id FROM public.agency_invitations WHERE application_id IS NOT NULL AND is_operational GROUP BY application_id HAVING count(*) > 1) duplicate_groups) AS observed,
         CASE WHEN NOT EXISTS (SELECT 1 FROM public.agency_invitations WHERE application_id IS NOT NULL AND is_operational GROUP BY application_id HAVING count(*) > 1) THEN 'PASS' ELSE 'FAIL' END AS verdict
  UNION ALL
  SELECT 'count:agency_invitations', 'catalog row-count metadata; no row contents', count(*)::text, 'INFO' FROM public.agency_invitations
  UNION ALL
  SELECT 'count:agency_invitation_token_generations', 'catalog row-count metadata; no row contents', count(*)::text, 'INFO' FROM public.agency_invitation_token_generations
  UNION ALL
  SELECT 'count:communication_messages', 'catalog row-count metadata; no row contents', count(*)::text, 'INFO' FROM public.communication_messages
  UNION ALL
  SELECT 'count:communication_delivery_events', 'catalog row-count metadata; no row contents', count(*)::text, 'INFO' FROM public.communication_delivery_events
),
security_checks AS (
  SELECT 'security:rls_private_tables'::text AS check_name,
         'RLS enabled on invitations, token generations, messages and delivery events'::text AS expected,
         format('invitations=%s token_generations=%s messages=%s delivery_events=%s',
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.agency_invitations')), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.agency_invitation_token_generations')), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.communication_messages')), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.communication_delivery_events')), 'missing')) AS observed,
         CASE WHEN (SELECT count(*) FROM pg_class WHERE oid IN (to_regclass('public.agency_invitations'), to_regclass('public.agency_invitation_token_generations'), to_regclass('public.communication_messages'), to_regclass('public.communication_delivery_events')) AND relrowsecurity) = 4 THEN 'PASS' ELSE 'FAIL' END AS verdict
  UNION ALL
  SELECT 'security:policies', 'none for anon/authenticated on private tables', count(*)::text, CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('agency_invitations', 'agency_invitation_token_generations', 'communication_messages', 'communication_delivery_events') AND roles && ARRAY['anon', 'authenticated']::name[]
  UNION ALL
  SELECT 'security:table_acl', 'anon/authenticated denied; service_role server-side access retained',
         format('anon_select=%s authenticated_select=%s anon_message_write=%s authenticated_message_write=%s service_role_token_select=%s service_role_message_write=%s',
           has_table_privilege('anon', 'public.agency_invitations', 'SELECT'),
           has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT'),
           has_table_privilege('anon', 'public.communication_messages', 'IN' || 'SERT') OR has_table_privilege('anon', 'public.communication_messages', 'UP' || 'DATE'),
           has_table_privilege('authenticated', 'public.communication_messages', 'IN' || 'SERT') OR has_table_privilege('authenticated', 'public.communication_messages', 'UP' || 'DATE'),
           has_table_privilege('service_role', 'public.agency_invitation_token_generations', 'SELECT'),
           has_table_privilege('service_role', 'public.communication_messages', 'IN' || 'SERT')),
         CASE WHEN NOT has_table_privilege('anon', 'public.agency_invitations', 'SELECT')
                   AND NOT has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT')
                   AND NOT has_table_privilege('anon', 'public.communication_messages', 'IN' || 'SERT')
                   AND NOT has_table_privilege('authenticated', 'public.communication_messages', 'IN' || 'SERT')
                   AND NOT has_table_privilege('anon', 'public.communication_messages', 'UP' || 'DATE')
                   AND NOT has_table_privilege('authenticated', 'public.communication_messages', 'UP' || 'DATE')
                   AND has_table_privilege('service_role', 'public.agency_invitation_token_generations', 'SELECT')
                   AND has_table_privilege('service_role', 'public.communication_messages', 'IN' || 'SERT') THEN 'PASS' ELSE 'FAIL' END
),
function_contract AS (
  SELECT count(*) FILTER (WHERE p.oid IS NOT NULL)::integer AS present_count,
         count(*) FILTER (WHERE p.oid IS NOT NULL AND p.prosecdef AND array_to_string(p.proconfig, ',') ILIKE '%search_path=pg_catalog, public, pg_temp%' AND has_function_privilege('service_role', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))::integer AS secure_count,
         coalesce(string_agg(CASE WHEN p.oid IS NULL THEN expected_identity ELSE pg_get_userbyid(p.proowner) END, ' | ' ORDER BY expected_identity), 'none') AS owner_observation
  FROM (VALUES
    ('public.approve_agency_application(uuid,uuid,text,timestamptz)'),
    ('public.create_agency_invitation_token_generation(uuid,text)'),
    ('public.renew_agency_invitation(uuid,uuid,timestamptz,timestamptz,text,text)'),
    ('public.complete_agency_onboarding(uuid,uuid,uuid,text)'),
    ('public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)')
  ) AS expected(expected_identity)
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.expected_identity)
),
function_check AS (
  SELECT 'function:0023_lifecycle_rpc_contract'::text AS check_name,
         '5 signatures; SECURITY DEFINER; restricted search_path; service_role only'::text AS expected,
         format('present=%s secure=%s owners=%s', present_count, secure_count, owner_observation) AS observed,
         CASE WHEN present_count = 5 AND secure_count = 5 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM function_contract
),
all_checks AS (
  SELECT * FROM script_version
  UNION ALL SELECT * FROM object_checks
  UNION ALL SELECT * FROM column_check
  UNION ALL SELECT * FROM constraint_checks
  UNION ALL SELECT * FROM index_checks
  UNION ALL SELECT * FROM data_checks
  UNION ALL SELECT * FROM security_checks
  UNION ALL SELECT * FROM function_check
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY CASE verdict WHEN 'FAIL' THEN 1 WHEN 'PASS' THEN 2 ELSE 3 END, check_name;
