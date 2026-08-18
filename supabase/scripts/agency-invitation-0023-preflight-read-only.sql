-- AgencyInvitation lifecycle 0023 preflight.
-- SCRIPT_VERSION=2026-08-10-0023-preflight-v2
-- SOMENTE LEITURA. Execute manualmente antes de revisar/aplicar a 0023.
-- Um único result set sanitizado; não retorna UUID, e-mail, nome pessoal,
-- token, token_hash, payload ou URL.
WITH
script_version AS (
  SELECT 'script_version'::text AS check_name,
         '2026-08-10-0023-preflight-v2'::text AS expected,
         '2026-08-10-0023-preflight-v2'::text AS observed,
         'INFO'::text AS verdict
),
versioning AS (
  SELECT
    'migration:versioning_catalog'::text AS check_name,
    'supabase_migrations.schema_migrations relation and version metadata'::text AS expected,
    format(
      'relation=%s columns=%s',
      CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'missing' ELSE 'present' END,
      (SELECT count(*)::text
         FROM information_schema.columns
        WHERE table_schema = 'supabase_migrations'
          AND table_name = 'schema_migrations'
          AND column_name IN ('version', 'name'))
    ) AS observed,
    CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
              AND (SELECT count(*)
                     FROM information_schema.columns
                    WHERE table_schema = 'supabase_migrations'
                      AND table_name = 'schema_migrations'
                      AND column_name IN ('version', 'name')) >= 1
         THEN 'PASS' ELSE 'INFO' END AS verdict
),
tables AS (
  SELECT *
  FROM (VALUES
    ('table:agency_applications', to_regclass('public.agency_applications') IS NOT NULL),
    ('table:agency_invitations', to_regclass('public.agency_invitations') IS NOT NULL),
    ('table:agency_invitation_token_generations', to_regclass('public.agency_invitation_token_generations') IS NOT NULL),
    ('table:communication_messages', to_regclass('public.communication_messages') IS NOT NULL)
  ) AS value(check_name, present)
),
table_checks AS (
  SELECT check_name,
         'present'::text AS expected,
         CASE WHEN present THEN 'present' ELSE 'missing' END AS observed,
         CASE WHEN present THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM tables
),
column_checks AS (
  SELECT 'column:agency_invitations.preflight_contract'::text AS check_name,
         'application_id, status and expires_at present'::text AS expected,
         count(*)::text AS observed,
         CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'agency_invitations'
    AND column_name IN ('application_id', 'status', 'expires_at')
),
unique_metadata AS (
  SELECT
    count(*)::integer AS unique_count,
    coalesce(string_agg(c.conname || ': ' || pg_get_constraintdef(c.oid), ' | ' ORDER BY c.conname), 'none') AS definitions
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = c.conkey[1]
  WHERE c.conrelid = to_regclass('public.agency_invitations')
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 1
    AND a.attname = 'application_id'
),
constraint_checks AS (
  SELECT 'constraint:application_id_unique_preflight'::text AS check_name,
         'one current single-column UNIQUE on application_id before 0023'::text AS expected,
         format('count=%s definitions=%s', unique_count, definitions) AS observed,
         CASE WHEN unique_count = 1 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM unique_metadata
  UNION ALL
  SELECT 'fk:application_id_preflight',
         'FK application_id -> agency_applications.id with RESTRICT',
         coalesce((SELECT string_agg(c.conname || ': ' || pg_get_constraintdef(c.oid), ' | ' ORDER BY c.conname)
                     FROM pg_constraint c
                    WHERE c.conrelid = to_regclass('public.agency_invitations')
                      AND c.contype = 'f'
                      AND c.confrelid = to_regclass('public.agency_applications')
                      AND c.confdeltype = 'r'
                      AND array_length(c.conkey, 1) = 1
                      AND array_length(c.confkey, 1) = 1), 'missing'),
         CASE WHEN EXISTS (
           SELECT 1
             FROM pg_constraint c
             JOIN pg_attribute local_column
               ON local_column.attrelid = c.conrelid
              AND local_column.attnum = c.conkey[1]
             JOIN pg_attribute remote_column
               ON remote_column.attrelid = c.confrelid
              AND remote_column.attnum = c.confkey[1]
            WHERE c.conrelid = to_regclass('public.agency_invitations')
              AND c.contype = 'f'
              AND c.confrelid = to_regclass('public.agency_applications')
              AND c.confdeltype = 'r'
              AND local_column.attname = 'application_id'
              AND remote_column.attname = 'id'
         ) THEN 'PASS' ELSE 'FAIL' END
),
index_metadata AS (
  SELECT coalesce(string_agg(indexname || ': ' || indexdef, ' | ' ORDER BY indexname), 'none') AS definitions
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'agency_invitations'
),
index_checks AS (
  SELECT 'index:agency_invitations_current'::text AS check_name,
         'current indexes catalogued without row contents'::text AS expected,
         definitions AS observed,
         'INFO'::text AS verdict
  FROM index_metadata
),
counts AS (
  SELECT
    count(*)::integer AS total_invitations,
    count(*) FILTER (WHERE row_data->>'application_id' IS NULL)::integer AS application_id_null,
    count(*) FILTER (WHERE row_data->>'status' = 'PENDING')::integer AS pending_count,
    count(*) FILTER (WHERE row_data->>'status' = 'PENDING' AND (row_data->>'expires_at')::timestamptz <= now())::integer AS pending_expired_count,
    count(*) FILTER (WHERE row_data->>'status' = 'PENDING' AND (row_data->>'expires_at')::timestamptz > now() + interval '7 days')::integer AS pending_incompatible_7d_count,
    count(*) FILTER (WHERE row_data->>'status' = 'PENDING' AND (row_data->>'expires_at')::timestamptz > now() + interval '2 hours')::integer AS pending_incompatible_2h_count,
    coalesce((
      SELECT jsonb_object_agg(status, status_count)
      FROM (
        SELECT row_data->>'status' AS status, count(*)::integer AS status_count
        FROM public.agency_invitations invitation
        CROSS JOIN LATERAL to_jsonb(invitation) AS row_data
        GROUP BY row_data->>'status'
      ) grouped_status
    ), '{}'::jsonb) AS status_distribution
  FROM public.agency_invitations invitation
  CROSS JOIN LATERAL to_jsonb(invitation) AS row_data
),
duplicate_counts AS (
  SELECT count(*)::integer AS duplicate_application_groups
  FROM (
    SELECT row_data->>'application_id' AS application_id
    FROM public.agency_invitations invitation
    CROSS JOIN LATERAL to_jsonb(invitation) AS row_data
    WHERE row_data->>'application_id' IS NOT NULL
    GROUP BY row_data->>'application_id'
    HAVING count(*) > 1
  ) duplicates
),
data_checks AS (
  SELECT 'data:invitation_counts'::text AS check_name,
         'counts only; no row contents'::text AS expected,
         format('total=%s status=%s application_id_null=%s pending=%s pending_expired=%s', total_invitations, status_distribution, application_id_null, pending_count, pending_expired_count) AS observed,
         'INFO'::text AS verdict
  FROM counts
  UNION ALL
  SELECT 'data:application_duplicates', '0 duplicate application_id groups', duplicate_application_groups::text, CASE WHEN duplicate_application_groups = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM duplicate_counts
  UNION ALL
  SELECT 'data:policy_window_comparison', 'policy is selected by runtime environment; both safe windows reported', format('pending_beyond_7d=%s pending_beyond_2h=%s', pending_incompatible_7d_count, pending_incompatible_2h_count), 'INFO'
  FROM counts
),
schema_state AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_invitations' AND column_name = 'is_operational') AS operational_column,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agency_invitations' AND indexname = 'uq_agency_invitations_operational_0023') AS operational_index,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agency_invitations' AND indexname = 'ix_agency_invitations_application_0023') AS application_index
),
schema_checks AS (
  SELECT 'schema:is_operational_preexisting'::text AS check_name,
         'absent before 0023'::text AS expected,
         CASE WHEN operational_column THEN 'present' ELSE 'absent' END AS observed,
         CASE WHEN operational_column THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM schema_state
  UNION ALL
  SELECT 'schema:operational_partial_index_preexisting', 'absent before 0023', CASE WHEN operational_index THEN 'present' ELSE 'absent' END, CASE WHEN operational_index THEN 'FAIL' ELSE 'PASS' END FROM schema_state
  UNION ALL
  SELECT 'schema:application_nonunique_index_preexisting', 'absent before 0023 or review existing name', CASE WHEN application_index THEN 'present' ELSE 'absent' END, 'INFO' FROM schema_state
),
rpc_catalog AS (
  SELECT *
  FROM (VALUES
    ('rpc:approve_agency_application', 'public.approve_agency_application(uuid,uuid,text,timestamptz)'),
    ('rpc:create_agency_invitation_token_generation', 'public.create_agency_invitation_token_generation(uuid,text)'),
    ('rpc:renew_agency_invitation', 'public.renew_agency_invitation(uuid,uuid,timestamptz,timestamptz,text,text)'),
    ('rpc:complete_agency_onboarding', 'public.complete_agency_onboarding(uuid,uuid,uuid,text)'),
    ('rpc:complete_agency_onboarding_with_token', 'public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)')
  ) AS value(check_name, identity)
),
rpc_checks AS (
  SELECT check_name,
         'existing signature catalogued; renew signature should be absent before 0023'::text AS expected,
         CASE WHEN to_regprocedure(identity) IS NULL THEN 'missing' ELSE 'present' END AS observed,
         CASE WHEN check_name = 'rpc:renew_agency_invitation' AND to_regprocedure(identity) IS NOT NULL THEN 'FAIL'
              WHEN check_name <> 'rpc:renew_agency_invitation' AND to_regprocedure(identity) IS NULL THEN 'FAIL'
              ELSE 'PASS' END AS verdict
  FROM rpc_catalog
),
security_checks AS (
  SELECT 'security:rls_preflight'::text AS check_name,
         'private tables have RLS enabled'::text AS expected,
         format('agency_invitations=%s token_generations=%s communication_messages=%s',
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.agency_invitations')), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.agency_invitation_token_generations')), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.communication_messages')), 'missing')) AS observed,
         CASE WHEN (SELECT count(*) FROM pg_class WHERE oid IN (to_regclass('public.agency_invitations'), to_regclass('public.agency_invitation_token_generations'), to_regclass('public.communication_messages')) AND relrowsecurity) = 3 THEN 'PASS' ELSE 'FAIL' END AS verdict
  UNION ALL
  SELECT 'security:policies', 'no anon/authenticated policies on private lifecycle tables', count(*)::text, CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('agency_invitations', 'agency_invitation_token_generations', 'communication_messages')
    AND roles && ARRAY['anon', 'authenticated']::name[]
  UNION ALL
  SELECT 'security:acl_snapshot', 'anon/authenticated denied; service_role remains server-side path',
         format('anon_select=%s authenticated_select=%s service_role_invitation_select=%s service_role_message_write=%s',
           has_table_privilege('anon', 'public.agency_invitations', 'SELECT'),
           has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT'),
           has_table_privilege('service_role', 'public.agency_invitations', 'SELECT'),
           has_table_privilege('service_role', 'public.communication_messages', 'IN' || 'SERT')),
         CASE WHEN NOT has_table_privilege('anon', 'public.agency_invitations', 'SELECT')
                   AND NOT has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT')
              THEN 'PASS' ELSE 'FAIL' END
),
all_checks AS (
  SELECT * FROM script_version
  UNION ALL SELECT * FROM versioning
  UNION ALL SELECT * FROM table_checks
  UNION ALL SELECT * FROM column_checks
  UNION ALL SELECT * FROM constraint_checks
  UNION ALL SELECT * FROM index_checks
  UNION ALL SELECT * FROM data_checks
  UNION ALL SELECT * FROM schema_checks
  UNION ALL SELECT * FROM rpc_checks
  UNION ALL SELECT * FROM security_checks
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY CASE verdict WHEN 'FAIL' THEN 1 WHEN 'PASS' THEN 2 ELSE 3 END, check_name;
