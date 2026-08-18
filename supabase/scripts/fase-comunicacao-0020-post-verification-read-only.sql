-- Fase 3B-R2a/3B-R4a. Pos-verificacao read-only da migration 0020.
-- Versao estatica: 2026-08-10-v4.
-- O arquivo contem uma unica instrucao SQL e produz um unico result set.
-- Colunas finais: check_name, expected, observed, verdict.
-- Esperado: 249 linhas, sendo 244 PASS/FAIL e 5 INFO.
-- ACLs distinguem concessao explicita no relacl/proacl de privilegio efetivo.
-- A matriz ACL e completa: SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER e MAINTAIN. service_role deve possuir somente o
-- conjunto explicito do contrato; qualquer privilegio extra reprova.
-- Nenhuma consulta abaixo le linhas de negocio completas, segredos, tokens,
-- hashes, UUIDs, e-mails, payloads ou corpos de mensagens.

WITH
script_check AS (
  SELECT 0::integer AS check_order,
         'script_version'::text AS check_name,
         '2026-08-10-v4'::text AS expected,
         '2026-08-10-v4'::text AS observed,
         'INFO'::text AS verdict
),
table_expected(check_order, check_name, relation_name) AS (
  VALUES
    (10, 'table:communication_templates', 'public.communication_templates'),
    (10, 'table:communication_messages', 'public.communication_messages'),
    (10, 'table:communication_delivery_events', 'public.communication_delivery_events'),
    (10, 'table:agency_invitation_token_generations', 'public.agency_invitation_token_generations'),
    (11, 'column:agency_invitations.communication_generation', 'public.agency_invitations')
),
table_checks AS (
  SELECT
    e.check_order,
    e.check_name,
    '1'::text AS expected,
    CASE
      WHEN e.check_name LIKE 'column:%' THEN
        CASE WHEN EXISTS (
          SELECT 1
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = 'agency_invitations'
            AND c.column_name = 'communication_generation'
        ) THEN '1' ELSE '0' END
      ELSE CASE WHEN to_regclass(e.relation_name) IS NULL THEN '0' ELSE '1' END
    END AS observed,
    CASE
      WHEN e.check_name LIKE 'column:%' THEN
        CASE WHEN EXISTS (
          SELECT 1
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = 'agency_invitations'
            AND c.column_name = 'communication_generation'
        ) THEN 'PASS' ELSE 'FAIL' END
      ELSE CASE WHEN to_regclass(e.relation_name) IS NULL THEN 'FAIL' ELSE 'PASS' END
    END AS verdict
  FROM table_expected e
),
column_expected(table_name, column_name, expected_type, expected_nullable) AS (
  VALUES
    ('agency_invitation_token_generations','id','uuid','NO'),
    ('agency_invitation_token_generations','invitation_id','uuid','NO'),
    ('agency_invitation_token_generations','generation','integer','NO'),
    ('agency_invitation_token_generations','token_hash','text','NO'),
    ('agency_invitation_token_generations','created_at','timestamp with time zone','NO'),
    ('agency_invitation_token_generations','expires_at','timestamp with time zone','NO'),
    ('agency_invitation_token_generations','used_at','timestamp with time zone','YES'),
    ('agency_invitation_token_generations','revoked_at','timestamp with time zone','YES'),
    ('communication_templates','id','uuid','NO'),
    ('communication_templates','code','text','NO'),
    ('communication_templates','version','integer','NO'),
    ('communication_templates','subject','text','NO'),
    ('communication_templates','text_body','text','NO'),
    ('communication_templates','html_body','text','NO'),
    ('communication_templates','active','boolean','NO'),
    ('communication_templates','created_at','timestamp with time zone','NO'),
    ('communication_templates','updated_at','timestamp with time zone','NO'),
    ('communication_messages','id','uuid','NO'),
    ('communication_messages','message_type','text','NO'),
    ('communication_messages','template_code','text','NO'),
    ('communication_messages','template_version','integer','NO'),
    ('communication_messages','destination_email','text','NO'),
    ('communication_messages','payload','jsonb','NO'),
    ('communication_messages','status','text','NO'),
    ('communication_messages','idempotency_key','text','NO'),
    ('communication_messages','attempt_count','integer','NO'),
    ('communication_messages','next_attempt_at','timestamp with time zone','NO'),
    ('communication_messages','claimed_at','timestamp with time zone','YES'),
    ('communication_messages','locked_at','timestamp with time zone','YES'),
    ('communication_messages','provider','text','YES'),
    ('communication_messages','provider_message_id','text','YES'),
    ('communication_messages','last_error_category','text','YES'),
    ('communication_messages','agency_application_id','uuid','YES'),
    ('communication_messages','agency_invitation_id','uuid','YES'),
    ('communication_messages','agency_id','uuid','YES'),
    ('communication_messages','created_at','timestamp with time zone','NO'),
    ('communication_messages','updated_at','timestamp with time zone','NO'),
    ('communication_messages','sent_at','timestamp with time zone','YES'),
    ('communication_messages','delivered_at','timestamp with time zone','YES'),
    ('communication_messages','failed_at','timestamp with time zone','YES'),
    ('communication_delivery_events','id','uuid','NO'),
    ('communication_delivery_events','communication_message_id','uuid','NO'),
    ('communication_delivery_events','provider','text','NO'),
    ('communication_delivery_events','provider_message_id','text','YES'),
    ('communication_delivery_events','event_type','text','NO'),
    ('communication_delivery_events','event_id','text','NO'),
    ('communication_delivery_events','payload','jsonb','NO'),
    ('communication_delivery_events','received_at','timestamp with time zone','NO'),
    ('agency_invitations','communication_generation','integer','NO')
),
column_checks AS (
  SELECT
    20::integer AS check_order,
    'column:' || e.table_name || '.' || e.column_name AS check_name,
    e.expected_type || ' ' || e.expected_nullable AS expected,
    CASE WHEN c.column_name IS NOT NULL
               AND CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END = e.expected_type
               AND c.is_nullable = e.expected_nullable
         THEN '1' ELSE '0' END AS observed,
    CASE WHEN c.column_name IS NOT NULL
               AND CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END = e.expected_type
               AND c.is_nullable = e.expected_nullable
         THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM column_expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
),
token_columns AS (
  SELECT lower(column_name) AS column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'agency_invitation_token_generations'
),
token_constraints AS (
  SELECT lower(pg_get_constraintdef(oid, true)) AS definition,
         regexp_replace(lower(pg_get_constraintdef(oid, true)), '[[:space:]()]', '', 'g') AS normalized_definition
  FROM pg_constraint
  WHERE conrelid = to_regclass('public.agency_invitation_token_generations')
),
token_function_definitions AS (
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '') AS definition
  FROM pg_proc p
  WHERE p.oid IN (
    to_regprocedure('public.create_agency_invitation_token_generation(uuid,text)'),
    to_regprocedure('public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)')
  )
),
token_checks(check_name, expected, matches) AS (
  SELECT 'token:token_hash_persisted', 'token_hash text NOT NULL',
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agency_invitation_token_generations'
        AND column_name = 'token_hash' AND data_type = 'text' AND is_nullable = 'NO'
    )
  UNION ALL
  SELECT 'token:no_raw_token_column', 'zero raw-token columns; token_hash allowed',
    NOT EXISTS (
      SELECT 1 FROM token_columns
      WHERE column_name ~ '(^token$|raw.*token|bearer|access[_]?token)'
        AND column_name <> 'token_hash'
    )
  UNION ALL
  SELECT 'token:expiration_check', 'expires_at persisted and used by a function',
    EXISTS (SELECT 1 FROM token_columns WHERE column_name = 'expires_at')
    AND EXISTS (
      SELECT 1 FROM token_function_definitions
      WHERE position('expires_at > now()' IN definition) > 0
         OR position('expires_at <= now()' IN definition) > 0
    )
  UNION ALL
  SELECT 'token:check_generation_positive', 'generation > 0',
    EXISTS (SELECT 1 FROM token_constraints WHERE definition LIKE '%generation > 0%')
  UNION ALL
  SELECT 'token:check_hash_length', 'char_length(token_hash) = 64',
    EXISTS (SELECT 1 FROM token_constraints WHERE definition LIKE '%char_length(token_hash) = 64%')
  UNION ALL
  SELECT 'token:check_used_revoked_exclusive', 'used_at IS NULL OR revoked_at IS NULL',
    EXISTS (SELECT 1 FROM token_constraints WHERE normalized_definition LIKE '%used_atisnullorrevoked_atisnull%')
),
token_check_rows AS (
  SELECT 30::integer AS check_order, check_name, expected,
         CASE WHEN matches THEN '1' ELSE '0' END AS observed,
         CASE WHEN matches THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM token_checks
),
fk_expected(child_table, child_column, parent_table, expected_delete) AS (
  VALUES
    ('agency_invitation_token_generations','invitation_id','agency_invitations','RESTRICT'),
    ('communication_messages','agency_application_id','agency_applications','RESTRICT'),
    ('communication_messages','agency_invitation_id','agency_invitations','RESTRICT'),
    ('communication_messages','agency_id','agencies','RESTRICT'),
    ('communication_delivery_events','communication_message_id','communication_messages','RESTRICT')
),
fk_checks AS (
  SELECT 40::integer AS check_order,
    e.child_table || '.' || e.child_column || ' -> ' || e.parent_table AS check_name,
    'FOREIGN KEY; ON DELETE ' || e.expected_delete AS expected,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = to_regclass('public.' || e.child_table)
        AND c.confrelid = to_regclass('public.' || e.parent_table)
        AND lower(pg_get_constraintdef(c.oid, true)) LIKE '%foreign key (' || lower(e.child_column) || ')%'
        AND c.confdeltype = 'r'
    ) THEN '1' ELSE '0' END AS observed,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = to_regclass('public.' || e.child_table)
        AND c.confrelid = to_regclass('public.' || e.parent_table)
        AND lower(pg_get_constraintdef(c.oid, true)) LIKE '%foreign key (' || lower(e.child_column) || ')%'
        AND c.confdeltype = 'r'
    ) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM fk_expected e
),
check_expected(table_name, contract, definition_pattern) AS (
  VALUES
    ('agency_invitations','communication_generation >= 0','%communication_generation >= 0%'),
    ('communication_templates','version > 0','%version > 0%'),
    ('communication_messages','message type allowlist','%message_type%AGENCY_INVITATION%AGENCY_WELCOME%'),
    ('communication_messages','template version > 0','%template_version > 0%'),
    ('communication_messages','normalized destination email','%destination_email = lower%'),
    ('communication_messages','status allowlist','%status%QUEUED%SENDING%SENT%DELIVERED%FAILED%BOUNCED%'),
    ('communication_messages','attempt count >= 0','%attempt_count >= 0%'),
    ('communication_delivery_events','delivery type allowlist','%event_type%DELIVERED%BOUNCED%')
),
check_rows AS (
  SELECT 50::integer AS check_order,
    e.table_name || ':' || e.contract AS check_name,
    'CHECK present' AS expected,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || e.table_name)
        AND lower(pg_get_constraintdef(c.oid, true)) LIKE lower(e.definition_pattern)
    ) THEN '1' ELSE '0' END AS observed,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || e.table_name)
        AND lower(pg_get_constraintdef(c.oid, true)) LIKE lower(e.definition_pattern)
    ) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM check_expected e
),
unique_expected(constraint_table, definition_pattern, label) AS (
  VALUES
    ('agency_invitation_token_generations','%UNIQUE (invitation_id, generation)%','token generation pair unique'),
    ('agency_invitation_token_generations','%UNIQUE (invitation_id, token_hash)%','token hash unique per invitation'),
    ('communication_templates','%UNIQUE (code, version)%','template code/version unique'),
    ('communication_messages','%UNIQUE (idempotency_key)%','message idempotency unique'),
    ('communication_delivery_events','%UNIQUE (event_id)%','delivery event id unique')
),
unique_rows AS (
  SELECT 60::integer AS check_order, 'unique:' || e.label AS check_name,
    'UNIQUE constraint present' AS expected,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || e.constraint_table)
        AND c.contype = 'u'
        AND lower(pg_get_constraintdef(c.oid, true)) LIKE lower(e.definition_pattern)
    ) THEN '1' ELSE '0' END AS observed,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || e.constraint_table)
        AND c.contype = 'u'
        AND lower(pg_get_constraintdef(c.oid, true)) LIKE lower(e.definition_pattern)
    ) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM unique_expected e
),
primary_rows AS (
  SELECT 60::integer AS check_order, 'primary_key:' || e.table_name AS check_name,
    'PRIMARY KEY present' AS expected,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || e.table_name) AND c.contype = 'p'
    ) THEN '1' ELSE '0' END AS observed,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || e.table_name) AND c.contype = 'p'
    ) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM (VALUES
    ('agency_invitation_token_generations'),('communication_templates'),
    ('communication_messages'),('communication_delivery_events')
  ) e(table_name)
),
index_expected(index_name, definition_pattern) AS (
  VALUES
    ('ix_agency_invitation_token_generations_lookup_0020','%invitation_id%expires_at%used_at%revoked_at%'),
    ('ix_communication_messages_dispatch_0020','%status%next_attempt_at%created_at%'),
    ('ix_communication_messages_invitation_0020','%agency_invitation_id%created_at%'),
    ('ix_communication_delivery_events_message_0020','%communication_message_id%received_at%')
),
index_rows AS (
  SELECT 60::integer AS check_order, 'index:' || e.index_name AS check_name,
    'named index with expected key columns' AS expected,
    CASE WHEN i.indexname IS NOT NULL AND lower(i.indexdef) LIKE lower(e.definition_pattern) THEN '1' ELSE '0' END AS observed,
    CASE WHEN i.indexname IS NOT NULL AND lower(i.indexdef) LIKE lower(e.definition_pattern) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM index_expected e
  LEFT JOIN pg_indexes i ON i.schemaname = 'public' AND i.indexname = e.index_name
),
secret_rows AS (
  SELECT 70::integer AS check_order,
    'security:no_provider_secret_or_raw_bearer_columns' AS check_name,
    'zero matching columns' AS expected,
    count(*)::text AS observed,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('agency_invitation_token_generations','communication_templates','communication_messages','communication_delivery_events')
    AND lower(column_name) ~ '(password|secret|api[_]?key|access[_]?token|bearer|(^|_)raw($|_))'
    AND lower(column_name) <> 'token_hash'
),
rls_expected(table_name) AS (
  VALUES ('agency_invitation_token_generations'),('communication_templates'),
         ('communication_messages'),('communication_delivery_events')
),
rls_rows AS (
  SELECT 71::integer AS check_order, 'rls:' || e.table_name AS check_name,
    'enabled' AS expected,
    CASE WHEN c.oid IS NOT NULL AND c.relrowsecurity THEN '1' ELSE '0' END AS observed,
    CASE WHEN c.oid IS NOT NULL AND c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM rls_expected e
  LEFT JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = e.table_name
),
policy_rows AS (
  SELECT 72::integer AS check_order, 'policy:' || e.table_name AS check_name,
    '0 public policies created by 0020' AS expected,
    coalesce(p.policy_count, 0)::text AS observed,
    CASE WHEN coalesce(p.policy_count, 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM rls_expected e
  LEFT JOIN (
    SELECT tablename, count(*) AS policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
  ) p ON p.tablename = e.table_name
),
privilege_expected(role_name, table_name, privilege_name, expected_value) AS (
  SELECT r.role_name, t.table_name, p.privilege_name,
    CASE
      WHEN r.role_name IN ('anon','authenticated') THEN false
      WHEN t.table_name IN ('communication_templates','communication_messages')
        AND p.privilege_name IN ('SELECT','INSERT','UPDATE') THEN true
      WHEN t.table_name = 'communication_delivery_events'
        AND p.privilege_name IN ('SELECT','INSERT') THEN true
      WHEN t.table_name = 'agency_invitation_token_generations'
        AND p.privilege_name = 'SELECT' THEN true
      ELSE false
    END
  FROM (VALUES ('PUBLIC'),('anon'),('authenticated'),('service_role')) r(role_name)
  CROSS JOIN (VALUES ('agency_invitation_token_generations'),('communication_templates'),
                     ('communication_messages'),('communication_delivery_events')) t(table_name)
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
                    ('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege_name)
),
privilege_rows AS (
  SELECT 80::integer AS check_order,
    'acl:table:' || e.role_name || ':' || e.table_name || ':' || e.privilege_name AS check_name,
    CASE WHEN e.role_name = 'service_role'
      THEN 'explicit=' || e.expected_value::text || '; effective=informational'
      ELSE 'explicit=false; effective=false' END AS expected,
    CASE WHEN c.oid IS NULL THEN 'MISSING_TABLE'
         ELSE 'explicit=' || explicit_grant::text || '; effective=' || effective_grant::text END AS observed,
    CASE WHEN c.oid IS NULL THEN 'FAIL'
         WHEN e.role_name = 'service_role' AND explicit_grant = e.expected_value THEN 'PASS'
         WHEN e.role_name <> 'service_role' AND NOT explicit_grant AND NOT effective_grant THEN 'PASS'
         ELSE 'FAIL' END AS verdict
  FROM privilege_expected e
  LEFT JOIN pg_class c
    ON c.relnamespace = 'public'::regnamespace
   AND c.relname = e.table_name
  CROSS JOIN LATERAL (
    SELECT CASE WHEN c.oid IS NULL THEN false ELSE EXISTS (
      SELECT 1
      FROM aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
      WHERE a.grantee = CASE WHEN e.role_name = 'PUBLIC' THEN 0::oid
                             ELSE coalesce((SELECT oid FROM pg_roles WHERE rolname = e.role_name), 0::oid) END
        AND a.privilege_type = e.privilege_name
    ) END AS explicit_grant,
    CASE
      WHEN c.oid IS NULL THEN false
      WHEN e.role_name = 'PUBLIC' THEN EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
        WHERE a.grantee = 0::oid
          AND a.privilege_type = e.privilege_name
      )
      WHEN (SELECT oid FROM pg_roles WHERE rolname = e.role_name) IS NULL THEN false
      WHEN e.privilege_name = 'MAINTAIN' THEN EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
        WHERE a.grantee = CASE WHEN e.role_name = 'PUBLIC' THEN 0::oid
                               ELSE coalesce((SELECT oid FROM pg_roles WHERE rolname = e.role_name), 0::oid) END
          AND a.privilege_type = e.privilege_name
      )
      ELSE has_table_privilege(e.role_name, 'public.' || e.table_name, e.privilege_name)
    END AS effective_grant
  ) acl
),
function_expected(function_name, signature, expected_security_definer, expected_service_execute) AS (
  VALUES
    ('communication_dispatch_lease_seconds','public.communication_dispatch_lease_seconds()'::text,false,false),
    ('create_agency_invitation_token_generation','public.create_agency_invitation_token_generation(uuid,text)'::text,true,true),
    ('revoke_agency_invitation_token_generations','public.revoke_agency_invitation_token_generations(uuid)'::text,true,true),
    ('enqueue_communication_message','public.enqueue_communication_message(text,text,integer,text,jsonb,text,uuid,uuid,uuid)'::text,true,true),
    ('claim_communication_message','public.claim_communication_message(uuid)'::text,true,true),
    ('complete_communication_message','public.complete_communication_message(uuid,text,text,text,text,timestamptz)'::text,true,true),
    ('complete_agency_onboarding_with_token','public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)'::text,true,true),
    ('record_communication_delivery_event','public.record_communication_delivery_event(uuid,text,text,text,text,jsonb)'::text,true,true)
),
function_rows AS (
  SELECT 90::integer AS check_order, 'function:' || e.function_name AS check_name,
    'present; SECURITY DEFINER=' || e.expected_security_definer::text || '; restricted search_path' AS expected,
    CASE WHEN p.oid IS NULL THEN 'MISSING'
         ELSE 'present; SECURITY DEFINER=' || p.prosecdef::text || '; restricted search_path=' ||
           (coalesce(array_to_string(p.proconfig, ';'), '') LIKE '%search_path=pg_catalog, public, pg_temp%')::text END AS observed,
    CASE WHEN p.oid IS NOT NULL
           AND p.prosecdef = e.expected_security_definer
           AND coalesce(array_to_string(p.proconfig, ';'), '') LIKE '%search_path=pg_catalog, public, pg_temp%'
         THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM function_expected e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
),
execute_rows AS (
  SELECT 91::integer AS check_order, 'acl:function:' || e.function_name AS check_name,
    CASE WHEN e.function_name = 'communication_dispatch_lease_seconds'
      THEN 'PUBLIC=false; anon=false; authenticated=false; service_role=effective informational'
      ELSE 'PUBLIC=false; anon=false; authenticated=false; service_role explicit=true' END AS expected,
    CASE WHEN p.oid IS NULL THEN 'MISSING'
         ELSE 'PUBLIC=' || public_effective::text ||
              '; anon=' || anon_effective::text ||
              '; authenticated=' || authenticated_effective::text ||
              '; service_role_explicit=' || service_explicit::text ||
              '; service_role_effective=' || service_effective::text END AS observed,
    CASE WHEN p.oid IS NULL THEN 'FAIL'
         WHEN NOT public_effective AND NOT anon_effective AND NOT authenticated_effective
              AND (e.function_name = 'communication_dispatch_lease_seconds' OR service_explicit)
           THEN 'PASS'
         ELSE 'FAIL' END AS verdict
  FROM function_expected e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN p.oid IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, ARRAY[]::aclitem[])) a
        WHERE a.grantee = 0::oid
          AND a.privilege_type = 'EXECUTE'
      ) END AS public_effective,
      CASE WHEN p.oid IS NULL OR (SELECT oid FROM pg_roles WHERE rolname = 'anon') IS NULL THEN false
           ELSE has_function_privilege('anon', to_regprocedure(e.signature), 'EXECUTE') END AS anon_effective,
      CASE WHEN p.oid IS NULL OR (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') IS NULL THEN false
           ELSE has_function_privilege('authenticated', to_regprocedure(e.signature), 'EXECUTE') END AS authenticated_effective,
      CASE WHEN p.oid IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, ARRAY[]::aclitem[])) a
        WHERE a.grantee = coalesce((SELECT oid FROM pg_roles WHERE rolname = 'service_role'), 0::oid)
          AND a.privilege_type = 'EXECUTE'
      ) END AS service_explicit,
      CASE WHEN p.oid IS NULL OR (SELECT oid FROM pg_roles WHERE rolname = 'service_role') IS NULL THEN false
           ELSE has_function_privilege('service_role', to_regprocedure(e.signature), 'EXECUTE') END AS service_effective
  ) acl
),
function_definitions AS (
  SELECT
    coalesce((SELECT pg_get_functiondef(to_regprocedure('public.claim_communication_message(uuid)'))), '') AS claim_def,
    coalesce((SELECT pg_get_functiondef(to_regprocedure('public.complete_communication_message(uuid,text,text,text,text,timestamptz)'))), '') AS complete_def,
    coalesce((SELECT pg_get_functiondef(to_regprocedure('public.record_communication_delivery_event(uuid,text,text,text,text,jsonb)'))), '') AS delivery_def,
    coalesce((SELECT pg_get_functiondef(to_regprocedure('public.enqueue_communication_message(text,text,integer,text,jsonb,text,uuid,uuid,uuid)'))), '') AS enqueue_def
),
dispatcher_checks(check_name, expected, matches) AS (
  SELECT 'dispatcher:claim_lease_reclaim', 'SENDING lease; SKIP LOCKED; attempt_count < 3; lease function',
    position('status = ''SENDING''' IN claim_def) > 0
    AND position('SKIP LOCKED' IN claim_def) > 0
    AND position('attempt_count < 3' IN claim_def) > 0
    AND position('communication_dispatch_lease_seconds' IN claim_def) > 0
  FROM function_definitions
  UNION ALL
  SELECT 'dispatcher:complete_lease_clear', 'clears claimed_at and locked_at',
    position('claimed_at = NULL' IN complete_def) > 0
    AND position('locked_at = NULL' IN complete_def) > 0
  FROM function_definitions
  UNION ALL
  SELECT 'dispatcher:provider_message_correlation', 'preserves an existing provider_message_id',
    position('coalesce(provider_message_id, p_provider_message_id)' IN complete_def) > 0
  FROM function_definitions
  UNION ALL
  SELECT 'dispatcher:idempotent_enqueue', 'ON CONFLICT idempotency_key',
    position('ON CONFLICT (idempotency_key)' IN enqueue_def) > 0
  FROM function_definitions
  UNION ALL
  SELECT 'delivery:event_idempotency', 'DELIVERED/BOUNCED; ON CONFLICT event_id; provider correlation',
    position('DELIVERED' IN delivery_def) > 0
    AND position('BOUNCED' IN delivery_def) > 0
    AND position('ON CONFLICT (event_id) DO NOTHING' IN delivery_def) > 0
    AND position('coalesce(provider_message_id, p_provider_message_id)' IN delivery_def) > 0
  FROM function_definitions
),
dispatcher_rows AS (
  SELECT 100::integer AS check_order, check_name, expected,
         CASE WHEN matches THEN '1' ELSE '0' END AS observed,
         CASE WHEN matches THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM dispatcher_checks
),
count_rows AS (
  SELECT 110::integer AS check_order,
    'count:' || e.relation_name AS check_name,
    'catalog row-count metadata; no row contents' AS expected,
    CASE WHEN c.oid IS NULL THEN 'MISSING_TABLE'
         WHEN s.n_live_tup IS NULL OR s.n_live_tup < 0 THEN 'UNAVAILABLE'
         ELSE s.n_live_tup::text END AS observed,
    CASE WHEN c.oid IS NULL THEN 'FAIL' ELSE 'INFO' END AS verdict
  FROM (VALUES
    ('communication_templates'),('communication_messages'),
    ('communication_delivery_events'),('agency_invitation_token_generations')
  ) e(relation_name)
  LEFT JOIN pg_class c
    ON c.relnamespace = 'public'::regnamespace
   AND c.relname = e.relation_name
  LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid = c.oid
),
all_checks AS (
  SELECT check_order, check_name, expected, observed, verdict FROM script_check
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM table_checks
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM column_checks
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM token_check_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM fk_checks
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM check_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM unique_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM primary_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM index_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM secret_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM rls_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM policy_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM privilege_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM function_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM execute_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM dispatcher_rows
  UNION ALL SELECT check_order, check_name, expected, observed, verdict FROM count_rows
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY check_order, check_name;
