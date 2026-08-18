-- FASE 2E. SOMENTE LEITURA.
-- Audita se os contratos fisicos legados podem ser removidos por uma futura
-- migration 0017. Nao cria objetos, nao altera dados e nao retorna PII.

WITH legacy_columns AS (
  SELECT * FROM (VALUES
    ('brand_memberships'::text, 'user_key'::text, 'user_key'::text),
    ('perfis'::text, 'marca_id'::text, 'perfis_marca_id'::text),
    ('agency_memberships'::text, 'canonical_role'::text, 'canonical_role'::text)
  ) AS value(table_name, column_name, contract_name)
), attributes AS (
  SELECT legacy.contract_name,
         legacy.table_name,
         legacy.column_name,
         relation.oid AS relation_oid,
         attribute.attnum,
         (attribute.attnum IS NOT NULL) AS column_exists
  FROM legacy_columns legacy
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = 'public'::regnamespace
   AND relation.relname = legacy.table_name
  LEFT JOIN pg_catalog.pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attname = legacy.column_name
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
), function_usage AS (
  SELECT attributes.contract_name, count(*) AS total
  FROM attributes
  JOIN pg_catalog.pg_proc procedure
    ON CASE
      -- `marca_id` e usado legitimamente por diversas tabelas. Para o
      -- contrato legado, contar somente a referencia qualificada a perfis.
      WHEN attributes.contract_name = 'perfis_marca_id'
        THEN pg_get_functiondef(procedure.oid) ILIKE '%perfis.marca_id%'
      ELSE pg_get_functiondef(procedure.oid) ~* ('\m' || attributes.column_name || '\M')
    END
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace AND namespace.nspname = 'public'
  GROUP BY attributes.contract_name
), policy_usage AS (
  SELECT attributes.contract_name, count(*) AS total
  FROM attributes
  JOIN pg_catalog.pg_policies policy
    ON policy.schemaname = 'public'
   AND CASE
     WHEN attributes.contract_name = 'perfis_marca_id' THEN
       (
         policy.tablename = 'perfis'
         AND (coalesce(policy.qual, '') ~* '\mmarca_id\M' OR coalesce(policy.with_check, '') ~* '\mmarca_id\M')
       )
       OR coalesce(policy.qual, '') ILIKE '%perfis.marca_id%'
       OR coalesce(policy.with_check, '') ILIKE '%perfis.marca_id%'
     ELSE coalesce(policy.qual, '') ~* ('\m' || attributes.column_name || '\M')
       OR coalesce(policy.with_check, '') ~* ('\m' || attributes.column_name || '\M')
   END
  GROUP BY attributes.contract_name
), trigger_usage AS (
  SELECT attributes.contract_name, count(*) AS total
  FROM attributes
  JOIN pg_catalog.pg_trigger trigger ON NOT trigger.tgisinternal
  JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid AND relation.relnamespace = 'public'::regnamespace
  WHERE CASE
    WHEN attributes.contract_name = 'perfis_marca_id'
      THEN pg_get_triggerdef(trigger.oid) ILIKE '%perfis.marca_id%'
    ELSE pg_get_triggerdef(trigger.oid) ~* ('\m' || attributes.column_name || '\M')
  END
  GROUP BY attributes.contract_name
), view_usage AS (
  SELECT attributes.contract_name, count(*) AS total
  FROM attributes
  JOIN pg_catalog.pg_rewrite rewrite ON rewrite.rulename = '_RETURN'
  JOIN pg_catalog.pg_class relation ON relation.oid = rewrite.ev_class
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
  WHERE relation.relkind IN ('v', 'm')
    AND CASE
      WHEN attributes.contract_name = 'perfis_marca_id'
        THEN pg_get_viewdef(relation.oid, true) ILIKE '%perfis.marca_id%'
      ELSE pg_get_viewdef(relation.oid, true) ~* ('\m' || attributes.column_name || '\M')
    END
  GROUP BY attributes.contract_name
), catalog_dependencies AS (
  SELECT attributes.contract_name,
         count(*) FILTER (WHERE dependent_catalog.relname IN ('pg_constraint', 'pg_class')) AS expected_drop,
         count(*) FILTER (WHERE dependent_catalog.relname NOT IN ('pg_constraint', 'pg_class', 'pg_attrdef', 'pg_description')) AS blocking
  FROM attributes
  JOIN pg_catalog.pg_depend dependency
    ON dependency.refobjid = attributes.relation_oid
   AND dependency.refobjsubid = attributes.attnum
  JOIN pg_catalog.pg_class dependent_catalog ON dependent_catalog.oid = dependency.classid
  WHERE attributes.column_exists
  GROUP BY attributes.contract_name
), role_facts AS (
  SELECT
    count(*) FILTER (WHERE coalesce(nullif(to_jsonb(membership) ->> 'role', ''), 'INVALID') NOT IN ('agency_admin', 'agency_member')) AS invalid_final_agency_roles,
    count(*) FILTER (
      WHERE nullif(to_jsonb(membership) ->> 'canonical_role', '') IS NOT NULL
        AND nullif(to_jsonb(membership) ->> 'canonical_role', '') IS DISTINCT FROM nullif(to_jsonb(membership) ->> 'role', '')
    ) AS canonical_role_unique_information
  FROM public.agency_memberships membership
), column_presence AS (
  SELECT
    bool_or(contract_name = 'user_key' AND column_exists) AS user_key_column_exists,
    bool_or(contract_name = 'perfis_marca_id' AND column_exists) AS perfis_marca_id_column_exists,
    bool_or(contract_name = 'canonical_role' AND column_exists) AS canonical_role_column_exists,
    bool_or(NOT column_exists) AS has_missing_legacy_column
  FROM attributes
), totals AS (
  SELECT
    coalesce((SELECT total FROM function_usage WHERE contract_name = 'user_key'), 0) AS functions_using_user_key,
    coalesce((SELECT total FROM function_usage WHERE contract_name = 'perfis_marca_id'), 0) AS functions_using_perfis_marca_id,
    coalesce((SELECT total FROM function_usage WHERE contract_name = 'canonical_role'), 0) AS functions_using_canonical_role,
    coalesce((SELECT total FROM policy_usage WHERE contract_name = 'user_key'), 0) AS policies_using_user_key,
    coalesce((SELECT total FROM policy_usage WHERE contract_name = 'perfis_marca_id'), 0) AS policies_using_perfis_marca_id,
    coalesce((SELECT total FROM policy_usage WHERE contract_name = 'canonical_role'), 0) AS policies_using_canonical_role,
    coalesce((SELECT sum(total) FROM trigger_usage), 0) AS triggers_using_legacy_contracts,
    coalesce((SELECT sum(total) FROM view_usage), 0) AS views_using_legacy_contracts,
    coalesce((SELECT sum(expected_drop) FROM catalog_dependencies), 0) AS expected_drop_dependencies,
    coalesce((SELECT sum(blocking) FROM catalog_dependencies), 0) AS blocking_dependencies
)
SELECT
  CASE WHEN column_presence.user_key_column_exists THEN 1 ELSE 0 END AS user_key_column_exists,
  CASE WHEN column_presence.perfis_marca_id_column_exists THEN 1 ELSE 0 END AS perfis_marca_id_column_exists,
  CASE WHEN column_presence.canonical_role_column_exists THEN 1 ELSE 0 END AS canonical_role_column_exists,
  totals.functions_using_user_key + totals.policies_using_user_key
    + (SELECT coalesce(total, 0) FROM trigger_usage WHERE contract_name = 'user_key')
    + (SELECT coalesce(total, 0) FROM view_usage WHERE contract_name = 'user_key') AS user_key_runtime_consumers,
  totals.functions_using_perfis_marca_id + totals.policies_using_perfis_marca_id
    + (SELECT coalesce(total, 0) FROM trigger_usage WHERE contract_name = 'perfis_marca_id')
    + (SELECT coalesce(total, 0) FROM view_usage WHERE contract_name = 'perfis_marca_id') AS perfis_marca_id_runtime_consumers,
  totals.functions_using_canonical_role + totals.policies_using_canonical_role
    + (SELECT coalesce(total, 0) FROM trigger_usage WHERE contract_name = 'canonical_role')
    + (SELECT coalesce(total, 0) FROM view_usage WHERE contract_name = 'canonical_role') AS canonical_role_runtime_consumers,
  totals.*,
  role_facts.invalid_final_agency_roles,
  role_facts.canonical_role_unique_information,
  CASE
    WHEN column_presence.has_missing_legacy_column THEN 'BLOCKED_LEGACY_COLUMN_MISSING_OR_UNEXPECTED'
    WHEN totals.functions_using_user_key <> 0 OR totals.functions_using_perfis_marca_id <> 0 OR totals.functions_using_canonical_role <> 0
      OR totals.policies_using_user_key <> 0 OR totals.policies_using_perfis_marca_id <> 0 OR totals.policies_using_canonical_role <> 0
      OR totals.triggers_using_legacy_contracts <> 0 OR totals.views_using_legacy_contracts <> 0
      OR role_facts.invalid_final_agency_roles <> 0 OR role_facts.canonical_role_unique_information <> 0
      OR totals.blocking_dependencies <> 0 THEN 'BLOCKED'
    ELSE 'READY_FOR_LEGACY_DROP'
  END AS preflight_status
FROM column_presence
CROSS JOIN totals
CROSS JOIN role_facts;

-- Classificacao sanitizada das dependencias para a revisao humana.
WITH legacy_columns AS (
  SELECT * FROM (VALUES
    ('brand_memberships'::text, 'user_key'::text, 'user_key'::text),
    ('perfis'::text, 'marca_id'::text, 'perfis_marca_id'::text),
    ('agency_memberships'::text, 'canonical_role'::text, 'canonical_role'::text)
  ) AS value(table_name, column_name, contract_name)
), attributes AS (
  SELECT legacy.contract_name, relation.oid AS relation_oid, attribute.attnum
  FROM legacy_columns legacy
  JOIN pg_catalog.pg_class relation ON relation.relnamespace = 'public'::regnamespace AND relation.relname = legacy.table_name
  JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attname = legacy.column_name AND attribute.attnum > 0 AND NOT attribute.attisdropped
)
SELECT contract_name,
       CASE WHEN dependent_catalog.relname IN ('pg_constraint', 'pg_class') THEN 'EXPECTED_DROP_DEPENDENCY' ELSE 'BLOCKING_FUNCTIONAL_DEPENDENCY' END AS dependency_classification,
       count(*) AS dependency_count
FROM attributes
JOIN pg_catalog.pg_depend dependency ON dependency.refobjid = relation_oid AND dependency.refobjsubid = attnum
JOIN pg_catalog.pg_class dependent_catalog ON dependent_catalog.oid = dependency.classid
GROUP BY contract_name, dependency_classification
UNION ALL
SELECT contract_name, 'HISTORICAL_ONLY' AS dependency_classification, 0 AS dependency_count
FROM attributes
UNION ALL
SELECT attributes.contract_name, 'SAFE' AS dependency_classification, 0 AS dependency_count
FROM attributes
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_depend dependency
  WHERE dependency.refobjid = attributes.relation_oid
    AND dependency.refobjsubid = attributes.attnum
)
ORDER BY contract_name, dependency_classification;

-- Resumo final: mantido por ultimo para o SQL Editor exibir os gates ao
-- executar o arquivo inteiro, sem depender de selecao manual.
WITH contracts AS (
  SELECT * FROM (VALUES
    ('brand_memberships'::text, 'user_key'::text, 'user_key'::text),
    ('perfis'::text, 'marca_id'::text, 'perfis_marca_id'::text),
    ('agency_memberships'::text, 'canonical_role'::text, 'canonical_role'::text)
  ) AS value(table_name, column_name, contract_name)
), presence AS (
  SELECT contracts.contract_name,
         EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = contracts.table_name AND c.column_name = contracts.column_name) AS exists_in_catalog
  FROM contracts
), function_counts AS (
  SELECT contracts.contract_name, count(*) AS total
  FROM contracts
  JOIN pg_catalog.pg_proc p
    ON CASE
      WHEN contracts.contract_name = 'perfis_marca_id'
        THEN pg_get_functiondef(p.oid) ILIKE '%perfis.marca_id%'
      ELSE pg_get_functiondef(p.oid) ~* ('\m' || contracts.column_name || '\M')
    END
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  GROUP BY contracts.contract_name
), policy_counts AS (
  SELECT contracts.contract_name, count(*) AS total
  FROM contracts
  JOIN pg_catalog.pg_policies p ON p.schemaname = 'public'
    AND CASE
      WHEN contracts.contract_name = 'perfis_marca_id' THEN
        (
          p.tablename = 'perfis'
          AND (coalesce(p.qual, '') ~* '\mmarca_id\M' OR coalesce(p.with_check, '') ~* '\mmarca_id\M')
        )
        OR coalesce(p.qual, '') ILIKE '%perfis.marca_id%'
        OR coalesce(p.with_check, '') ILIKE '%perfis.marca_id%'
      ELSE coalesce(p.qual, '') ~* ('\m' || contracts.column_name || '\M')
        OR coalesce(p.with_check, '') ~* ('\m' || contracts.column_name || '\M')
    END
  GROUP BY contracts.contract_name
), trigger_view_counts AS (
  SELECT contracts.contract_name,
    (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND CASE WHEN contracts.contract_name = 'perfis_marca_id' THEN pg_get_triggerdef(t.oid) ILIKE '%perfis.marca_id%' ELSE pg_get_triggerdef(t.oid) ~* ('\m' || contracts.column_name || '\M') END) AS triggers,
    (SELECT count(*) FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class v ON v.oid = r.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = v.relnamespace WHERE r.rulename = '_RETURN' AND n.nspname = 'public' AND v.relkind IN ('v', 'm') AND CASE WHEN contracts.contract_name = 'perfis_marca_id' THEN pg_get_viewdef(v.oid, true) ILIKE '%perfis.marca_id%' ELSE pg_get_viewdef(v.oid, true) ~* ('\m' || contracts.column_name || '\M') END) AS views
  FROM contracts
), dependency_counts AS (
  SELECT contracts.contract_name,
    count(*) FILTER (WHERE catalog.relname IN ('pg_constraint', 'pg_class')) AS expected_drop,
    count(*) FILTER (WHERE catalog.relname NOT IN ('pg_constraint', 'pg_class', 'pg_attrdef', 'pg_description')) AS blocking
  FROM contracts
  JOIN pg_catalog.pg_class relation ON relation.relnamespace = 'public'::regnamespace AND relation.relname = contracts.table_name
  JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attname = contracts.column_name AND attribute.attnum > 0 AND NOT attribute.attisdropped
  JOIN pg_catalog.pg_depend d ON d.refobjid = relation.oid AND d.refobjsubid = attribute.attnum
  JOIN pg_catalog.pg_class catalog ON catalog.oid = d.classid
  GROUP BY contracts.contract_name
), role_facts AS (
  SELECT count(*) FILTER (WHERE coalesce(nullif(to_jsonb(a) ->> 'role', ''), 'INVALID') NOT IN ('agency_admin', 'agency_member')) AS invalid_final_agency_roles,
         count(*) FILTER (WHERE nullif(to_jsonb(a) ->> 'canonical_role', '') IS NOT NULL AND nullif(to_jsonb(a) ->> 'canonical_role', '') IS DISTINCT FROM nullif(to_jsonb(a) ->> 'role', '')) AS canonical_role_unique_information
  FROM public.agency_memberships a
), facts AS (
  SELECT
    coalesce((SELECT total FROM function_counts WHERE contract_name = 'user_key'), 0) AS functions_using_user_key,
    coalesce((SELECT total FROM function_counts WHERE contract_name = 'perfis_marca_id'), 0) AS functions_using_perfis_marca_id,
    coalesce((SELECT total FROM function_counts WHERE contract_name = 'canonical_role'), 0) AS functions_using_canonical_role,
    coalesce((SELECT total FROM policy_counts WHERE contract_name = 'user_key'), 0) AS policies_using_user_key,
    coalesce((SELECT total FROM policy_counts WHERE contract_name = 'perfis_marca_id'), 0) AS policies_using_perfis_marca_id,
    coalesce((SELECT total FROM policy_counts WHERE contract_name = 'canonical_role'), 0) AS policies_using_canonical_role,
    coalesce((SELECT sum(triggers) FROM trigger_view_counts), 0) AS triggers_using_legacy_contracts,
    coalesce((SELECT sum(views) FROM trigger_view_counts), 0) AS views_using_legacy_contracts,
    coalesce((SELECT sum(expected_drop) FROM dependency_counts), 0) AS expected_drop_dependencies,
    coalesce((SELECT sum(blocking) FROM dependency_counts), 0) AS blocking_dependencies
)
SELECT
  facts.functions_using_user_key + facts.policies_using_user_key + coalesce((SELECT triggers FROM trigger_view_counts WHERE contract_name = 'user_key'), 0) + coalesce((SELECT views FROM trigger_view_counts WHERE contract_name = 'user_key'), 0) AS user_key_runtime_consumers,
  facts.functions_using_perfis_marca_id + facts.policies_using_perfis_marca_id + coalesce((SELECT triggers FROM trigger_view_counts WHERE contract_name = 'perfis_marca_id'), 0) + coalesce((SELECT views FROM trigger_view_counts WHERE contract_name = 'perfis_marca_id'), 0) AS perfis_marca_id_runtime_consumers,
  facts.functions_using_canonical_role + facts.policies_using_canonical_role + coalesce((SELECT triggers FROM trigger_view_counts WHERE contract_name = 'canonical_role'), 0) + coalesce((SELECT views FROM trigger_view_counts WHERE contract_name = 'canonical_role'), 0) AS canonical_role_runtime_consumers,
  facts.*, role_facts.invalid_final_agency_roles, role_facts.canonical_role_unique_information,
  CASE WHEN EXISTS (SELECT 1 FROM presence WHERE NOT exists_in_catalog) THEN 'BLOCKED_LEGACY_COLUMN_MISSING_OR_UNEXPECTED'
       WHEN facts.functions_using_user_key <> 0 OR facts.functions_using_perfis_marca_id <> 0 OR facts.functions_using_canonical_role <> 0
         OR facts.policies_using_user_key <> 0 OR facts.policies_using_perfis_marca_id <> 0 OR facts.policies_using_canonical_role <> 0
         OR facts.triggers_using_legacy_contracts <> 0 OR facts.views_using_legacy_contracts <> 0
         OR facts.blocking_dependencies <> 0 OR role_facts.invalid_final_agency_roles <> 0 OR role_facts.canonical_role_unique_information <> 0 THEN 'BLOCKED'
       ELSE 'READY_FOR_LEGACY_DROP' END AS preflight_status
FROM facts CROSS JOIN role_facts;
