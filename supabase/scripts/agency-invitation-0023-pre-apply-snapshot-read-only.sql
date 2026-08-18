-- AgencyInvitation lifecycle 0023 pre-apply snapshot.
-- SCRIPT_VERSION=2026-08-10-0023-snapshot-v2
-- SOMENTE LEITURA. Execute manualmente depois do preflight e antes da 0023.
-- Um único result set; não retorna nomes pessoais, e-mails, tokens, hashes,
-- URLs bearer ou conteúdo de mensagens.
WITH
script_version AS (
  SELECT 'script_version'::text AS check_name,
         '2026-08-10-0023-snapshot-v2'::text AS expected,
         '2026-08-10-0023-snapshot-v2'::text AS observed,
         'INFO'::text AS verdict
),
invitation_counts AS (
  SELECT
    count(*)::integer AS total_invitations,
    count(*) FILTER (WHERE application_id IS NULL)::integer AS application_id_null,
    count(*) FILTER (WHERE application_id IS NOT NULL)::integer AS application_id_not_null,
    count(*) FILTER (WHERE status = 'PENDING')::integer AS pending_count,
    count(*) FILTER (WHERE status = 'PENDING' AND expires_at <= now())::integer AS pending_expired_count,
    count(*) FILTER (WHERE status = 'PENDING' AND expires_at > now() + interval '7 days')::integer AS pending_beyond_7d_count,
    count(*) FILTER (WHERE status = 'PENDING' AND expires_at > now() + interval '2 hours')::integer AS pending_beyond_2h_count,
    coalesce((
      SELECT jsonb_object_agg(status, status_count)
      FROM (
        SELECT status, count(*)::integer AS status_count
        FROM public.agency_invitations
        GROUP BY status
      ) status_groups
    ), '{}'::jsonb) AS status_distribution
  FROM public.agency_invitations
),
duplicate_counts AS (
  SELECT count(*)::integer AS duplicate_application_groups
  FROM (
    SELECT application_id
    FROM public.agency_invitations
    WHERE application_id IS NOT NULL
    GROUP BY application_id
    HAVING count(*) > 1
  ) duplicate_groups
),
data_checks AS (
  SELECT 'count:agency_applications'::text AS check_name,
         'baseline count only'::text AS expected,
         count(*)::text AS observed,
         'INFO'::text AS verdict
  FROM public.agency_applications
  UNION ALL
  SELECT 'count:agency_invitations', 'baseline count only', total_invitations::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_by_status', 'status distribution only', status_distribution::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_application_id_null', 'baseline count only', application_id_null::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_application_id_not_null', 'baseline count only', application_id_not_null::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_pending', 'baseline count only', pending_count::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_pending_expired', 'baseline count only', pending_expired_count::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_pending_beyond_7d', 'baseline count only', pending_beyond_7d_count::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_pending_beyond_2h', 'baseline count only', pending_beyond_2h_count::text, 'INFO'
  FROM invitation_counts
  UNION ALL
  SELECT 'count:agency_invitations_duplicate_application_groups', '0 expected before 0023', duplicate_application_groups::text, CASE WHEN duplicate_application_groups = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM duplicate_counts
  UNION ALL
  SELECT 'count:agency_invitation_token_generations', 'baseline count only', count(*)::text, 'INFO'
  FROM public.agency_invitation_token_generations
  UNION ALL
  SELECT 'count:communication_messages', 'baseline count only', count(*)::text, 'INFO'
  FROM public.communication_messages
  UNION ALL
  SELECT 'count:communication_delivery_events', 'baseline count only', count(*)::text, 'INFO'
  FROM public.communication_delivery_events
),
constraint_checks AS (
  SELECT 'constraint:agency_invitations.application_id_fk'::text AS check_name,
         'FK definition and RESTRICT action'::text AS expected,
         coalesce((SELECT string_agg(c.conname || ': ' || pg_get_constraintdef(c.oid), ' | ' ORDER BY c.conname)
                     FROM pg_constraint c
                    WHERE c.conrelid = 'public.agency_invitations'::regclass
                      AND c.contype = 'f'
                      AND c.confrelid = 'public.agency_applications'::regclass
                      AND c.confdeltype = 'r'), 'missing') AS observed,
         CASE WHEN EXISTS (
           SELECT 1
           FROM pg_constraint c
           JOIN pg_attribute local_column ON local_column.attrelid = c.conrelid AND local_column.attnum = c.conkey[1]
           JOIN pg_attribute remote_column ON remote_column.attrelid = c.confrelid AND remote_column.attnum = c.confkey[1]
           WHERE c.conrelid = 'public.agency_invitations'::regclass
             AND c.contype = 'f'
             AND c.confrelid = 'public.agency_applications'::regclass
             AND c.confdeltype = 'r'
             AND local_column.attname = 'application_id'
             AND remote_column.attname = 'id'
         ) THEN 'PASS' ELSE 'FAIL' END AS verdict
  UNION ALL
  SELECT 'constraint:agency_invitations.application_id_unique',
         'current single-column UNIQUE definition',
         coalesce((SELECT string_agg(c.conname || ': ' || pg_get_constraintdef(c.oid), ' | ' ORDER BY c.conname)
                     FROM pg_constraint c
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                    WHERE c.conrelid = 'public.agency_invitations'::regclass
                      AND c.contype = 'u'
                      AND array_length(c.conkey, 1) = 1
                      AND a.attname = 'application_id'), 'missing'),
         CASE WHEN EXISTS (
           SELECT 1
           FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
           WHERE c.conrelid = 'public.agency_invitations'::regclass
             AND c.contype = 'u'
             AND array_length(c.conkey, 1) = 1
             AND a.attname = 'application_id'
         ) THEN 'PASS' ELSE 'FAIL' END
),
index_check AS (
  SELECT 'index:agency_invitations_current'::text AS check_name,
         'current index definitions only'::text AS expected,
         coalesce((SELECT string_agg(indexname || ': ' || indexdef, ' | ' ORDER BY indexname)
                     FROM pg_indexes
                    WHERE schemaname = 'public' AND tablename = 'agency_invitations'), 'none') AS observed,
         'INFO'::text AS verdict
),
security_checks AS (
  SELECT 'security:rls_involved_tables'::text AS check_name,
         'RLS enabled on all involved private tables'::text AS expected,
         format('applications=%s invitations=%s token_generations=%s messages=%s delivery_events=%s',
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.agency_applications'::regclass), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.agency_invitations'::regclass), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.agency_invitation_token_generations'::regclass), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.communication_messages'::regclass), 'missing'),
           coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.communication_delivery_events'::regclass), 'missing')) AS observed,
         CASE WHEN (SELECT count(*) FROM pg_class WHERE oid IN ('public.agency_applications'::regclass, 'public.agency_invitations'::regclass, 'public.agency_invitation_token_generations'::regclass, 'public.communication_messages'::regclass, 'public.communication_delivery_events'::regclass) AND relrowsecurity) = 5 THEN 'PASS' ELSE 'FAIL' END AS verdict
  UNION ALL
  SELECT 'security:policy_count', 'policy count only; no policy expressions', count(*)::text, 'INFO'
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('agency_applications', 'agency_invitations', 'agency_invitation_token_generations', 'communication_messages', 'communication_delivery_events')
  UNION ALL
  SELECT 'security:acl_snapshot',
         'anon/authenticated denied; service_role server-side privileges only',
         format('anon_invitation_select=%s authenticated_invitation_select=%s service_role_token_select=%s service_role_message_write=%s',
           has_table_privilege('anon', 'public.agency_invitations', 'SELECT'),
           has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT'),
           has_table_privilege('service_role', 'public.agency_invitation_token_generations', 'SELECT'),
           has_table_privilege('service_role', 'public.communication_messages', 'IN' || 'SERT')),
         CASE WHEN NOT has_table_privilege('anon', 'public.agency_invitations', 'SELECT')
                   AND NOT has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT')
                   AND has_table_privilege('service_role', 'public.agency_invitation_token_generations', 'SELECT')
                   AND has_table_privilege('service_role', 'public.communication_messages', 'IN' || 'SERT') THEN 'PASS' ELSE 'FAIL' END
),
rpc_catalog AS (
  SELECT *
  FROM (VALUES
    ('public.approve_agency_application(uuid,uuid,text,timestamptz)'),
    ('public.create_agency_invitation_token_generation(uuid,text)'),
    ('public.renew_agency_invitation(uuid,uuid,timestamptz,timestamptz,text,text)'),
    ('public.complete_agency_onboarding(uuid,uuid,uuid,text)'),
    ('public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)')
  ) AS expected(identity)
),
rpc_check AS (
  SELECT 'rpc:agency_invitation_lifecycle_signatures'::text AS check_name,
         'pre-0023: four existing lifecycle signatures; exact renew signature absent'::text AS expected,
         format('present=%s missing=%s owners=%s missing_signatures=%s',
           count(*) FILTER (WHERE p.oid IS NOT NULL),
           count(*) FILTER (WHERE p.oid IS NULL),
           coalesce(string_agg(pg_get_userbyid(p.proowner), ' | ' ORDER BY expected.identity) FILTER (WHERE p.oid IS NOT NULL), 'none'),
           coalesce(string_agg(expected.identity, ' | ' ORDER BY expected.identity) FILTER (WHERE p.oid IS NULL), 'none')) AS observed,
         CASE WHEN count(*) FILTER (WHERE p.oid IS NOT NULL AND expected.identity <> 'public.renew_agency_invitation(uuid,uuid,timestamptz,timestamptz,text,text)') = 4
                   AND count(*) FILTER (WHERE expected.identity = 'public.renew_agency_invitation(uuid,uuid,timestamptz,timestamptz,text,text)' AND p.oid IS NULL) = 1
              THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM rpc_catalog expected
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.identity)
),
all_checks AS (
  SELECT * FROM script_version
  UNION ALL SELECT * FROM data_checks
  UNION ALL SELECT * FROM constraint_checks
  UNION ALL SELECT * FROM index_check
  UNION ALL SELECT * FROM security_checks
  UNION ALL SELECT * FROM rpc_check
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY CASE verdict WHEN 'FAIL' THEN 1 WHEN 'PASS' THEN 2 ELSE 3 END, check_name;
