-- SUPABASE_WORKBENCH_CLEANUP_AUDIT
-- Diagnóstico direcionado do workbench de integrações e da mesa legada.
-- Somente leitura: uma única consulta, sem TEMP, DDL, DML ou leitura de Vault.
-- Não retorna payloads, metadata de conexão, valor de secret_ref ou conteúdo de segredo.
-- Para secret_ref, retorna somente presença/ausência da coluna no catálogo.
--
-- A classificação abaixo é a hipótese operacional a confrontar com o catálogo
-- remoto e com a auditoria local de consumidores. Este script não autoriza
-- remoção e não transforma ausência de uma relação em prova de zero consumidor.

WITH
relation_targets(schema_name, object_name, expected_kind, classification, replacement, local_evidence) AS (
  VALUES
    ('public'::text, 'marcas'::text, 'table'::text, 'KEEP_CANONICAL'::text, 'tenant brandId'::text, 'tenant canônico; não remover'),
    ('public', 'agencies', 'table', 'KEEP_CANONICAL', 'hierarquia Agência → Brand', 'owner operacional e escopo de agência'),
    ('public', 'agency_memberships', 'table', 'KEEP_CANONICAL', 'membership de agência', 'autorização de agência'),
    ('public', 'agency_brands', 'table', 'KEEP_CANONICAL', 'vínculo ativo Agência → Brand', 'composição do escopo operacional'),
    ('public', 'canonical_capabilities', 'table', 'KEEP_CANONICAL', 'capabilities de autorização canônica', 'não confundir com integration_capabilities'),
    ('public', 'integration_providers', 'table', 'KEEP_CANONICAL', 'catálogo de providers', 'contrato 0024/0025'),
    ('public', 'integration_capabilities', 'table', 'KEEP_CANONICAL', 'catálogo operacional de capabilities', 'capability não é permissão de módulo'),
    ('public', 'integration_connections', 'table', 'KEEP_CANONICAL', 'Connection + secret_ref server-side', 'não consultar conteúdo do Vault'),
    ('public', 'integration_grants', 'table', 'KEEP_CANONICAL', 'grant/entitlement por escopo', 'não remover por estar vazio'),
    ('public', 'integration_bindings', 'table', 'KEEP_CANONICAL', 'binding de origem efetiva', 'não remover por estar vazio'),
    ('public', 'integration_quota_policies', 'table', 'KEEP_CANONICAL', 'quota por capability/escopo', 'não remover por estar vazio'),
    ('public', 'integration_usage_events', 'table', 'KEEP_CANONICAL', 'ledger append-only de Usage', 'não usar como state store'),
    ('public', 'google_ads_binding_targeting', 'table', 'KEEP_CANONICAL', 'targeting tipado por binding', 'Google Ads canônico'),
    ('public', 'google_ads_binding_account_state', 'table', 'KEEP_CANONICAL', 'estado validado da conta externa', 'Google Ads canônico'),
    ('public', 'minerador_keywords', 'table', 'KEEP_CANONICAL', 'keyword canônica do Minerador', 'renome sucessor da 0036'),
    ('public', 'minerador_keyword_lists', 'table', 'KEEP_CANONICAL', 'lista canônica do Minerador', 'renome sucessor da 0036'),
    ('public', 'minerador_keyword_metric_measurements', 'table', 'KEEP_CANONICAL', 'ledger de medições do Minerador', 'lifecycle de medição; não remover'),
    ('public', 'minerador_discovery_runs', 'table', 'KEEP_CANONICAL', 'execuções de discovery', 'persistência de discovery'),
    ('public', 'minerador_discovery_candidates', 'table', 'KEEP_CANONICAL', 'candidatas de discovery', 'persistência de discovery'),
    ('public', 'minerador_discovery_import_batches', 'table', 'KEEP_CANONICAL', 'lotes de importação', 'proveniência e idempotência'),
    ('public', 'minerador_discovery_keyword_origins', 'table', 'KEEP_CANONICAL', 'origens/proveniência', 'handoff e importação'),
    ('public', 'minerador_discovery_candidate_current_metrics', 'table', 'KEEP_CANONICAL', 'projeção corrente de métricas', 'não apagar histórico'),
    ('public', 'minerador_discovery_candidate_metric_history', 'table', 'KEEP_CANONICAL', 'histórico de métricas', 'append/history'),
    ('public', 'editorial_serp_snapshots', 'table', 'KEEP_COMPATIBILITY', 'futuro contrato SERP DataForSEO', 'preservar snapshots históricos'),
    ('public', 'editorial_serp_reviews', 'table', 'KEEP_COMPATIBILITY', 'futuro contrato SERP DataForSEO', 'preservar decisões/revisões'),
    ('public', 'editorial_saved_views', 'table', 'KEEP_CANONICAL', 'views operacionais persistidas', 'consumidor editorial atual'),
    ('public', 'editorial_workflow_items', 'table', 'KEEP_CANONICAL', 'workflow/handoff editorial', 'consumidor editorial atual'),
    ('public', 'briefings_artigos', 'table', 'KEEP_COMPATIBILITY', 'artefatos/workflow canônicos', 'legado funcional ainda observado'),
    ('public', 'brand_site_sitemaps', 'table', 'INVESTIGATE', 'site/sitemap canônico futuro', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'brand_site_sync_runs', 'table', 'INVESTIGATE', 'site/sitemap canônico futuro', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'brand_site_catalog_entries', 'table', 'INVESTIGATE', 'catálogo de site', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'brand_site_page_verifications', 'table', 'INVESTIGATE', 'verificação de páginas', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'brand_site_keyword_candidates', 'table', 'INVESTIGATE', 'candidatas para Minerador', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'brand_site_import_batches', 'table', 'INVESTIGATE', 'importação site → Minerador', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'brand_site_import_items', 'table', 'INVESTIGATE', 'itens de importação', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'brand_site_events', 'table', 'INVESTIGATE', 'eventos de site', 'migration 0004 proposta; remoto não presumido'),
    ('public', 'minerador_google_ads_connections', 'table', 'MIGRATE_THEN_DROP', 'integration_connections + binding + targeting + account_state', 'Google Ads legado por Brand; não remover antes de smoke/paridade'),
    ('public', 'keywords_kgr', 'table', 'INVESTIGATE', 'minerador_keywords', 'nome antigo; deve estar ausente após 0036'),
    ('public', 'listas_kgr', 'table', 'INVESTIGATE', 'minerador_keyword_lists', 'nome antigo; deve estar ausente após 0036'),
    ('public', 'tenant_0005_migration_guard', 'table', 'DROP_SAFE', 'ausente após 0035', 'resíduo histórico; ausência esperada'),
    ('public', 'tenant_0016_agency_role_rollback', 'table', 'INVESTIGATE', 'agency_memberships.role', 'rollback histórico; remoção depende de prova remota'),
    ('public', 'delegated_access_grants', 'table', 'INVESTIGATE', 'autorização canônica', 'ponte histórica 0016; zero consumidor remoto ainda não provado'),
    ('public', 'delegated_access_permissions', 'table', 'INVESTIGATE', 'canonical_capabilities', 'ponte histórica 0016; zero consumidor remoto ainda não provado')
),
relation_meta AS (
  SELECT
    t.*,
    c.oid,
    CASE WHEN c.oid IS NULL THEN 'ABSENT' ELSE 'PRESENT' END::text AS present,
    CASE c.relkind::text
      WHEN 'r' THEN 'table'
      WHEN 'p' THEN 'partitioned_table'
      WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized_view'
      WHEN 'f' THEN 'foreign_table'
      ELSE coalesce(c.relkind::text, t.expected_kind)
    END::text AS observed_kind,
    coalesce(pg_catalog.pg_get_userbyid(c.relowner), '<absent>')::text AS owner_name,
    CASE WHEN c.oid IS NULL THEN 'n/a' ELSE format('enabled=%s; forced=%s', c.relrowsecurity, c.relforcerowsecurity) END::text AS rls_state,
    CASE WHEN c.oid IS NULL OR c.relkind::text NOT IN ('r', 'p') THEN 'n/a' ELSE coalesce(c.reltuples::bigint::text, 'unknown') || ' (reltuples estimate)' END::text AS row_estimate,
    c.relacl
  FROM relation_targets AS t
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.oid = pg_catalog.to_regclass(format('%I.%I', t.schema_name, t.object_name))
),
column_summary AS (
  SELECT
    r.object_name,
    coalesce(string_agg(
      a.attname::text || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)::text
        || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
      ', ' ORDER BY a.attnum
    ), 'none')::text AS details,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      WHEN coalesce(bool_or(a.attname::text = 'secret_ref'), false) THEN 'PRESENT'
      ELSE 'ABSENT' END::text AS secret_ref_presence
  FROM relation_meta AS r
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = r.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
  GROUP BY r.object_name, r.oid
),
policy_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE format('count=%s; %s', count(p.policyname), coalesce(string_agg(
        p.policyname::text || '; roles=' || pg_catalog.array_to_string(p.roles, ',') || '; cmd=' || p.cmd::text,
        ' | ' ORDER BY p.policyname::text
      ), 'none')) END::text AS details
  FROM relation_meta AS r
  LEFT JOIN pg_catalog.pg_policies AS p
    ON p.schemaname::text = r.schema_name
   AND p.tablename::text = r.object_name
  GROUP BY r.object_name, r.oid
),
relation_acl_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE coalesce((
        SELECT string_agg(
          coalesce(grantee.rolname, 'PUBLIC')::text || ':' || ax.privilege_type::text
            || CASE WHEN ax.is_grantable THEN ':grantable' ELSE '' END,
          ' | ' ORDER BY coalesce(grantee.rolname, 'PUBLIC')::text, ax.privilege_type::text
        )
        FROM pg_catalog.aclexplode(coalesce(r.relacl, pg_catalog.acldefault('r', c.relowner))) AS ax
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = ax.grantee
      ), 'owner/default ACL') END::text AS details
  FROM relation_meta AS r
  LEFT JOIN pg_catalog.pg_class AS c ON c.oid = r.oid
),
constraint_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE coalesce(string_agg(
        c.conname::text || '; type=' || c.contype::text || '; ' || pg_catalog.pg_get_constraintdef(c.oid, true)::text,
        ' | ' ORDER BY c.conname::text
      ), 'none') END::text AS details
  FROM relation_meta AS r
  LEFT JOIN pg_catalog.pg_constraint AS c ON c.conrelid = r.oid
  GROUP BY r.object_name, r.oid
),
index_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE coalesce(string_agg(
        i.indexname::text || '; ' || i.indexdef::text,
        ' | ' ORDER BY i.indexname::text
      ), 'none') END::text AS details
  FROM relation_meta AS r
  LEFT JOIN pg_catalog.pg_indexes AS i
    ON i.schemaname::text = r.schema_name
   AND i.tablename::text = r.object_name
  GROUP BY r.object_name, r.oid
),
foreign_key_rows AS (
  SELECT
    r.object_name,
    CASE WHEN fk.conrelid = r.oid THEN 'outgoing' ELSE 'incoming' END::text AS direction,
    fk.conname::text AS constraint_name,
    src_ns.nspname::text || '.' || src_rel.relname::text AS source_object,
    dst_ns.nspname::text || '.' || dst_rel.relname::text AS target_object,
    CASE fk.confdeltype::text
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE 'UNKNOWN'
    END::text AS delete_action
  FROM relation_meta AS r
  JOIN pg_catalog.pg_constraint AS fk
    ON fk.contype::text = 'f'
   AND (fk.conrelid = r.oid OR fk.confrelid = r.oid)
  JOIN pg_catalog.pg_class AS src_rel ON src_rel.oid = fk.conrelid
  JOIN pg_catalog.pg_namespace AS src_ns ON src_ns.oid = src_rel.relnamespace
  JOIN pg_catalog.pg_class AS dst_rel ON dst_rel.oid = fk.confrelid
  JOIN pg_catalog.pg_namespace AS dst_ns ON dst_ns.oid = dst_rel.relnamespace
),
foreign_key_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE coalesce(string_agg(
        fk.direction || '; ' || fk.constraint_name || '; ' || fk.source_object || ' -> ' || fk.target_object || '; delete=' || fk.delete_action,
        ' | ' ORDER BY fk.direction, fk.constraint_name
      ), 'none') END::text AS details
  FROM relation_meta AS r
  LEFT JOIN foreign_key_rows AS fk ON fk.object_name = r.object_name
  GROUP BY r.object_name, r.oid
),
trigger_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE coalesce(string_agg(
        trg.tgname::text || '; enabled=' || trg.tgenabled::text || '; function='
          || fn_ns.nspname::text || '.' || fn.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(fn.oid)::text || ')',
        ' | ' ORDER BY trg.tgname::text
      ), 'none') END::text AS details
  FROM relation_meta AS r
  LEFT JOIN pg_catalog.pg_trigger AS trg
    ON trg.tgrelid = r.oid
   AND NOT trg.tgisinternal
  LEFT JOIN pg_catalog.pg_proc AS fn ON fn.oid = trg.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS fn_ns ON fn_ns.oid = fn.pronamespace
  GROUP BY r.object_name, r.oid
),
relation_dependency_rows AS (
  SELECT
    r.object_name,
    'dependent'::text AS direction,
    d.deptype::text AS dependency_type,
    pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid)::text AS related_object
  FROM relation_meta AS r
  JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_class'::regclass
   AND d.refobjid = r.oid
  WHERE r.oid IS NOT NULL
  UNION ALL
  SELECT
    r.object_name,
    'dependency'::text,
    d.deptype::text,
    pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid)::text
  FROM relation_meta AS r
  JOIN pg_catalog.pg_depend AS d
    ON d.classid = 'pg_class'::regclass
   AND d.objid = r.oid
  WHERE r.oid IS NOT NULL
),
relation_dependency_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE format('total=%s; non_internal=%s; %s', count(d.related_object), count(*) FILTER (WHERE d.dependency_type <> 'i'), coalesce(string_agg(
        d.direction || '; type=' || d.dependency_type || '; ' || d.related_object,
        ' | ' ORDER BY d.direction, d.dependency_type, d.related_object
      ) FILTER (WHERE d.dependency_type <> 'i'), 'none')) END::text AS details
  FROM relation_meta AS r
  LEFT JOIN relation_dependency_rows AS d ON d.object_name = r.object_name
  GROUP BY r.object_name, r.oid
),
relation_source_function_rows AS (
  SELECT
    r.object_name,
    fn_ns.nspname::text || '.' || fn.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(fn.oid)::text || ')' AS function_signature
  FROM relation_meta AS r
  JOIN pg_catalog.pg_proc AS fn
    ON fn.pronamespace = pg_catalog.to_regnamespace(r.schema_name)
  JOIN pg_catalog.pg_namespace AS fn_ns ON fn_ns.oid = fn.pronamespace
  WHERE r.oid IS NOT NULL
    AND fn.prokind::text IN ('f', 'p')
    AND pg_catalog.pg_get_functiondef(fn.oid)::text ILIKE '%' || r.object_name || '%'
),
relation_source_function_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE coalesce(string_agg(s.function_signature, ' | ' ORDER BY s.function_signature), 'none') END::text AS details
  FROM relation_meta AS r
  LEFT JOIN relation_source_function_rows AS s ON s.object_name = r.object_name
  GROUP BY r.object_name, r.oid
),
view_dependency_rows AS (
  SELECT DISTINCT
    r.object_name,
    view_ns.nspname::text || '.' || view_rel.relname::text AS view_name
  FROM relation_meta AS r
  JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_class'::regclass
   AND d.refobjid = r.oid
   AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_catalog.pg_rewrite AS rw ON rw.oid = d.objid
  JOIN pg_catalog.pg_class AS view_rel ON view_rel.oid = rw.ev_class AND view_rel.relkind::text IN ('v', 'm')
  JOIN pg_catalog.pg_namespace AS view_ns ON view_ns.oid = view_rel.relnamespace
  WHERE r.oid IS NOT NULL
),
view_dependency_summary AS (
  SELECT
    r.object_name,
    CASE WHEN r.oid IS NULL THEN 'n/a'
      ELSE coalesce(string_agg(v.view_name, ' | ' ORDER BY v.view_name), 'none') END::text AS details
  FROM relation_meta AS r
  LEFT JOIN view_dependency_rows AS v ON v.object_name = r.object_name
  GROUP BY r.object_name, r.oid
),
function_targets(signature, expected_kind, classification, replacement, local_evidence) AS (
  VALUES
    ('public.integration_grants_validate_scope()'::text, 'function', 'KEEP_CANONICAL'::text, 'grant scope validator'::text, 'trigger validator'),
    ('public.integration_bindings_validate_scope()'::text, 'function', 'KEEP_CANONICAL', 'binding scope validator', 'trigger validator'),
    ('public.integration_usage_events_prevent_mutation()'::text, 'function', 'KEEP_CANONICAL', 'append-only usage guard', 'trigger validator'),
    ('public.integration_secret_resolve(text)'::text, 'function', 'KEEP_CANONICAL', 'Vault reference resolver', 'server-side only; do not return secret'),
    ('public.integration_secret_store_upsert(text,text,text,text)'::text, 'function', 'KEEP_CANONICAL', 'Vault reference writer', 'server-side only; not called by this script'),
    ('public.google_ads_binding_configuration_validate()'::text, 'function', 'KEEP_CANONICAL', 'Google Ads binding validation', 'trigger validator'),
    ('public.persist_minerador_discovery_run(jsonb,jsonb)'::text, 'function', 'KEEP_CANONICAL', 'Minerador discovery persistence', 'runtime RPC caller'),
    ('public.persist_minerador_discovery_source_run(jsonb,jsonb)'::text, 'function', 'KEEP_CANONICAL', 'Minerador multi-source persistence', 'runtime route caller; remote application must be confirmed'),
    ('public.minerador_discovery_import_brand_guard()'::text, 'function', 'KEEP_CANONICAL', 'keyword origin guard', 'trigger validator'),
    ('public.minerador_discovery_candidate_brand_guard()'::text, 'function', 'KEEP_CANONICAL', 'discovery candidate guard', 'trigger validator'),
    ('public.minerador_discovery_run_immutable()'::text, 'function', 'KEEP_CANONICAL', 'discovery run immutability', 'trigger validator'),
    ('public.can_access_list(uuid)'::text, 'function', 'KEEP_COMPATIBILITY', 'canonical list authorization', 'legacy-named helper; definition must be audited'),
    ('public.protect_published_keyword()'::text, 'function', 'KEEP_CANONICAL', 'published keyword protection', 'trigger function; do not infer table dependency from name'),
    ('public.protect_published_lista()'::text, 'function', 'KEEP_CANONICAL', 'published list protection', 'trigger function; expected to inspect canonical keyword table'),
    ('public.protect_marca_with_published()'::text, 'function', 'KEEP_CANONICAL', 'published content protection', 'trigger function on marcas'),
    ('public.protect_published_briefing()'::text, 'function', 'KEEP_COMPATIBILITY', 'briefings compatibility protection', 'only if relation exists'),
    ('public.pipeline_editorial_protect_append_only()'::text, 'function', 'KEEP_CANONICAL', 'append-only editorial protection', 'shared trigger function'),
    ('public.tenant_0005_validate_keyword_brand()'::text, 'function', 'INVESTIGATE', 'canonical keyword tenant guard', 'historical 0005 name; inspect post-0036 definition'),
    ('public.import_minerador_discovery_candidates(uuid,uuid,uuid,uuid[])'::text, 'function', 'DROP_SAFE', 'importKeywordsWithCore', 'legacy RPC removed by 0038; must be absent')
),
function_meta AS (
  SELECT
    f.*,
    p.oid,
    coalesce(pg_catalog.pg_get_userbyid(p.proowner), '<absent>')::text AS owner_name,
    CASE WHEN p.oid IS NULL THEN 'ABSENT' ELSE 'PRESENT' END::text AS present,
    CASE WHEN p.oid IS NULL THEN 'n/a' ELSE CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END END::text AS security_mode,
    CASE WHEN p.oid IS NULL THEN 'n/a' ELSE coalesce(pg_catalog.array_to_string(p.proconfig, ', '), 'not set') END::text AS search_path_config,
    CASE WHEN p.oid IS NULL THEN 'n/a' ELSE format('legacy_keywords=%s; legacy_lists=%s; canonical_keywords=%s; canonical_lists=%s; integration_refs=%s',
      pg_catalog.pg_get_functiondef(p.oid)::text ILIKE '%keywords_kgr%',
      pg_catalog.pg_get_functiondef(p.oid)::text ILIKE '%listas_kgr%',
      pg_catalog.pg_get_functiondef(p.oid)::text ILIKE '%minerador_keywords%',
      pg_catalog.pg_get_functiondef(p.oid)::text ILIKE '%minerador_keyword_lists%',
      pg_catalog.pg_get_functiondef(p.oid)::text ILIKE '%integration_%') END::text AS source_flags
  FROM function_targets AS f
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = pg_catalog.to_regprocedure(f.signature)
),
function_acl_summary AS (
  SELECT
    f.signature,
    CASE WHEN f.oid IS NULL THEN 'n/a' ELSE coalesce(string_agg(
      coalesce(grantee.rolname, 'PUBLIC')::text || ':' || ax.privilege_type::text
        || CASE WHEN ax.is_grantable THEN ':grantable' ELSE '' END,
      ' | ' ORDER BY coalesce(grantee.rolname, 'PUBLIC')::text, ax.privilege_type::text
    ), 'owner/default ACL') END::text AS details
  FROM function_meta AS f
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = f.oid
  LEFT JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS ax ON true
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = ax.grantee
  GROUP BY f.signature, f.oid
),
function_dependency_summary AS (
  SELECT
    f.signature,
    CASE WHEN f.oid IS NULL THEN 'n/a'
      ELSE format('total=%s; non_internal=%s; %s', count(d.objid), count(*) FILTER (WHERE d.deptype <> 'i'), coalesce(string_agg(
        pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid)::text,
        ' | ' ORDER BY pg_catalog.pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid)::text
      ) FILTER (WHERE d.deptype <> 'i'), 'none')) END::text AS details
  FROM function_meta AS f
  LEFT JOIN pg_catalog.pg_depend AS d
    ON d.classid = 'pg_proc'::regclass
   AND d.objid = f.oid
  GROUP BY f.signature, f.oid
),
public_inventory AS (
  SELECT
    count(*) FILTER (WHERE c.relkind::text IN ('r', 'p'))::bigint AS table_count,
    count(*) FILTER (WHERE c.relkind::text = 'v')::bigint AS view_count,
    count(*) FILTER (WHERE c.relkind::text = 'm')::bigint AS materialized_view_count,
    count(*) FILTER (WHERE c.relkind::text = 'S')::bigint AS sequence_count,
    (SELECT count(*)::bigint FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public') AS function_count,
    (SELECT count(*)::bigint FROM pg_catalog.pg_trigger AS trg JOIN pg_catalog.pg_class AS c2 ON c2.oid = trg.tgrelid JOIN pg_catalog.pg_namespace AS n2 ON n2.oid = c2.relnamespace WHERE n2.nspname = 'public' AND NOT trg.tgisinternal) AS trigger_count
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
),
relation_rows AS (
  SELECT
    'relation'::text AS audit_area,
    'public.' || r.object_name AS object_name,
    r.observed_kind AS object_type,
    r.owner_name,
    r.present,
    r.row_estimate,
    r.rls_state || '; policies=' || ps.details AS rls_policies,
    ra.details AS acl_or_execute,
    'columns=' || cs.details || '; secret_ref=' || cs.secret_ref_presence || '; constraints=' || co.details || '; indexes=' || ix.details || '; foreign_keys=' || fk.details || '; triggers=' || tr.details AS constraints_indexes,
    rd.details || '; dependent_views=' || vd.details || '; source_functions=' || sf.details AS dependencies,
    r.classification AS classification,
    r.replacement,
    r.local_evidence || '; remote decision remains pending catalog result; no data content or Vault payload was read'::text AS observed_or_notes
  FROM relation_meta AS r
  JOIN column_summary AS cs ON cs.object_name = r.object_name
  JOIN policy_summary AS ps ON ps.object_name = r.object_name
  JOIN relation_acl_summary AS ra ON ra.object_name = r.object_name
  JOIN constraint_summary AS co ON co.object_name = r.object_name
  JOIN index_summary AS ix ON ix.object_name = r.object_name
  JOIN foreign_key_summary AS fk ON fk.object_name = r.object_name
  JOIN trigger_summary AS tr ON tr.object_name = r.object_name
  JOIN relation_dependency_summary AS rd ON rd.object_name = r.object_name
  JOIN relation_source_function_summary AS sf ON sf.object_name = r.object_name
  JOIN view_dependency_summary AS vd ON vd.object_name = r.object_name
),
function_rows AS (
  SELECT
    CASE WHEN f.signature LIKE '%import_minerador_discovery_candidates%' THEN 'legacy_rpc' ELSE 'function' END::text AS audit_area,
    f.signature AS object_name,
    f.expected_kind AS object_type,
    f.owner_name,
    f.present,
    'n/a'::text AS row_estimate,
    'security=' || f.security_mode || '; search_path=' || f.search_path_config AS rls_policies,
    fa.details AS acl_or_execute,
    f.source_flags AS constraints_indexes,
    fd.details AS dependencies,
    f.classification,
    f.replacement,
    f.local_evidence || '; source flags are catalog-derived and do not expose function body'::text AS observed_or_notes
  FROM function_meta AS f
  JOIN function_acl_summary AS fa ON fa.signature = f.signature
  JOIN function_dependency_summary AS fd ON fd.signature = f.signature
),
summary_rows AS (
  SELECT
    'catalog_summary'::text AS audit_area,
    'public schema'::text AS object_name,
    'schema'::text AS object_type,
    '<catalog>'::text AS owner_name,
    'PRESENT'::text AS present,
    format('tables=%s; views=%s; materialized_views=%s; sequences=%s; functions=%s; triggers=%s', table_count, view_count, materialized_view_count, sequence_count, function_count, trigger_count)::text AS row_estimate,
    'RLS/policies are returned per target relation'::text AS rls_policies,
    'ACLs/EXECUTE are returned per target relation/function'::text AS acl_or_execute,
    'columns/constraints/indexes/FKs are returned per target relation'::text AS constraints_indexes,
    'pg_depend and view/materialized_view dependents are returned per target'::text AS dependencies,
    'INFO'::text AS classification,
    'none'::text AS replacement,
    'Inventory covers public catalog objects only; it does not inspect Vault contents, secrets, provider network or runtime code'::text AS observed_or_notes
  FROM public_inventory
  UNION ALL
  SELECT
    'operational_policy',
    'HOMOLOGATION_OPEN',
    'governance_policy',
    '<documented>',
    'PRESENT',
    'n/a',
    'Connection global READY + Agency active + Brand active/authorized',
    'authorization != entitlement != connection != binding != quota != usage',
    'capability operational != module permission',
    'Platform -> Agency -> Brand when applicable',
    'INFO',
    'Google Ads + DataForSEO + OpenRouter',
    'Temporary homologation policy; not a commercial entitlement and not a remote-state assertion'
)
SELECT audit_area, object_name, object_type, owner_name, present, row_estimate, rls_policies, acl_or_execute, constraints_indexes, dependencies, classification, replacement, observed_or_notes
FROM summary_rows
UNION ALL
SELECT audit_area, object_name, object_type, owner_name, present, row_estimate, rls_policies, acl_or_execute, constraints_indexes, dependencies, classification, replacement, observed_or_notes
FROM relation_rows
UNION ALL
SELECT audit_area, object_name, object_type, owner_name, present, row_estimate, rls_policies, acl_or_execute, constraints_indexes, dependencies, classification, replacement, observed_or_notes
FROM function_rows
ORDER BY audit_area, object_name;
