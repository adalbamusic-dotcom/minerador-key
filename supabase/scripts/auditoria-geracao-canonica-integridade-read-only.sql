-- Auditoria de integridade — geração canônica.
-- SOMENTE LEITURA. Contém exclusivamente SELECT e WITH.
-- Execute somente após o catálogo confirmar as relações citadas em cada seção.
-- Não imprime e-mails, tokens, secrets, prompts ou outros dados pessoais.

-- 1. Pré-requisito: relações exigidas pela reconciliação owner/membership.
WITH required_relations(relation_name) AS (
  VALUES ('marcas'), ('brand_memberships'), ('brand_roles')
)
SELECT required_relations.relation_name,
       EXISTS (SELECT 1 FROM pg_catalog.pg_class c
               WHERE c.relnamespace = 'public'::regnamespace
                 AND c.relname = required_relations.relation_name
                 AND c.relkind IN ('r', 'p')) AS relation_exists
FROM required_relations
ORDER BY relation_name;

-- 2. Owner e membership: role é resolvido exclusivamente por role_id -> brand_roles.slug.
WITH owner_memberships AS (
  SELECT bm.id, bm.marca_id, bm.member_user_id, bm.status, br.slug AS role_slug
  FROM public.brand_memberships bm
  LEFT JOIN public.brand_roles br ON br.id = bm.role_id
), per_brand AS (
  SELECT b.id AS brand_id,
         b.owner_user_id,
         (auth_owner.id IS NOT NULL) AS owner_exists_in_auth,
         count(om.id) FILTER (WHERE om.member_user_id = b.owner_user_id AND om.role_slug = 'owner' AND om.status = 'active') AS matching_active_owner_memberships,
         count(om.id) FILTER (WHERE om.member_user_id = b.owner_user_id AND om.role_slug = 'owner' AND om.status <> 'active') AS matching_inactive_owner_memberships,
         count(om.id) FILTER (WHERE om.role_slug = 'owner' AND om.member_user_id IS DISTINCT FROM b.owner_user_id AND om.status = 'active') AS active_owner_memberships_for_another_actor,
         count(om.id) FILTER (WHERE om.role_slug = 'owner' AND om.member_user_id IS DISTINCT FROM b.owner_user_id AND om.status <> 'active') AS inactive_owner_memberships_for_another_actor,
         count(om.id) FILTER (WHERE om.member_user_id = b.owner_user_id) AS memberships_for_owner_actor
  FROM public.marcas b
  LEFT JOIN auth.users auth_owner ON auth_owner.id = b.owner_user_id
  LEFT JOIN owner_memberships om ON om.marca_id = b.id
  GROUP BY b.id, b.owner_user_id, auth_owner.id
), owner_membership_groups AS (
  SELECT bm.marca_id, bm.member_user_id, count(*) AS owner_membership_count
  FROM public.brand_memberships bm
  JOIN public.brand_roles br ON br.id = bm.role_id AND br.slug = 'owner'
  WHERE bm.status = 'active'
  GROUP BY bm.marca_id, bm.member_user_id
), historical_owner_memberships AS (
  SELECT count(*) AS inactive_or_historical_owner_membership_rows
  FROM public.brand_memberships bm
  JOIN public.brand_roles br ON br.id = bm.role_id AND br.slug = 'owner'
  WHERE bm.status <> 'active'
)
SELECT count(*) FILTER (WHERE owner_user_id IS NULL) AS brands_without_owner_user_id,
       count(*) FILTER (WHERE owner_user_id IS NOT NULL AND NOT owner_exists_in_auth) AS owners_missing_in_auth_users,
       count(*) FILTER (WHERE owner_user_id IS NOT NULL AND matching_active_owner_memberships > 0) AS owners_with_matching_active_owner_membership,
       count(*) FILTER (WHERE owner_user_id IS NOT NULL AND matching_inactive_owner_memberships > 0) AS owners_with_matching_inactive_owner_membership,
       count(*) FILTER (WHERE owner_user_id IS NOT NULL AND matching_active_owner_memberships = 0) AS owners_without_active_owner_membership,
       count(*) FILTER (WHERE active_owner_memberships_for_another_actor > 0) AS brands_with_active_owner_membership_for_different_actor,
       count(*) FILTER (WHERE inactive_owner_memberships_for_another_actor > 0) AS brands_with_inactive_owner_membership_for_different_actor,
       (SELECT count(*) FROM owner_membership_groups WHERE owner_membership_count > 1) AS duplicated_active_owner_membership_groups,
       (SELECT coalesce(sum(owner_membership_count - 1), 0) FROM owner_membership_groups WHERE owner_membership_count > 1) AS redundant_active_owner_membership_rows,
       (SELECT inactive_or_historical_owner_membership_rows FROM historical_owner_memberships) AS inactive_or_historical_owner_membership_rows,
       count(*) FILTER (WHERE owner_user_id IS NOT NULL AND memberships_for_owner_actor > 1) AS brands_with_potentially_redundant_owner_actor_memberships
FROM per_brand;

-- 3. Duplicidades de membership e divergência agregada user_key/UUID, sem retornar e-mails.
WITH membership_pairs AS (
  SELECT marca_id, member_user_id, count(*) AS membership_count
  FROM public.brand_memberships
  WHERE member_user_id IS NOT NULL
  GROUP BY marca_id, member_user_id
), key_reconciliation AS (
  SELECT bm.id,
         nullif(btrim(bm.user_key), '') IS NOT NULL AS has_legacy_user_key,
         u.id IS NOT NULL AS actor_exists_in_auth,
         CASE WHEN nullif(btrim(bm.user_key), '') IS NOT NULL AND u.email IS NOT NULL
                   AND lower(btrim(bm.user_key)) IS DISTINCT FROM lower(btrim(u.email))
              THEN true ELSE false END AS user_key_differs_from_auth_email
  FROM public.brand_memberships bm
  LEFT JOIN auth.users u ON u.id = bm.member_user_id
)
SELECT (SELECT count(*) FROM membership_pairs WHERE membership_count > 1) AS duplicated_membership_groups,
       (SELECT coalesce(sum(membership_count - 1), 0) FROM membership_pairs WHERE membership_count > 1) AS redundant_membership_rows,
       count(*) FILTER (WHERE has_legacy_user_key) AS memberships_with_legacy_user_key,
       count(*) FILTER (WHERE has_legacy_user_key AND actor_exists_in_auth) AS comparable_user_key_uuid_memberships,
       count(*) FILTER (WHERE user_key_differs_from_auth_email) AS user_key_auth_email_divergences,
       count(*) FILTER (WHERE has_legacy_user_key AND NOT actor_exists_in_auth) AS user_key_without_resolved_auth_actor
FROM key_reconciliation;

-- 3b. brand_roles com marca_id nulo: inventário agregado para decidir a finalidade do catálogo global.
SELECT CASE WHEN br.marca_id IS NULL THEN 'GLOBAL_SCOPE_NULL' ELSE 'BRAND_SCOPE' END AS role_scope,
       br.slug AS role_slug,
       count(bm.id) AS memberships_using_role,
       count(DISTINCT br.id) AS role_rows
FROM public.brand_roles br
LEFT JOIN public.brand_memberships bm ON bm.role_id = br.id
GROUP BY CASE WHEN br.marca_id IS NULL THEN 'GLOBAL_SCOPE_NULL' ELSE 'BRAND_SCOPE' END, br.slug
ORDER BY role_scope, role_slug;

-- 4. Lista/keyword; confirma isolamento e FK de lista sem criar ou alterar dados.
SELECT (SELECT count(*) FROM public.minerador_keyword_lists WHERE marca_id IS NULL) AS lists_without_brand,
       (SELECT count(*) FROM public.minerador_keywords WHERE brand_id IS NULL) AS keywords_without_brand,
       (SELECT count(*) FROM public.minerador_keywords k WHERE k.lista_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.minerador_keyword_lists l WHERE l.id = k.lista_id)) AS keywords_with_missing_list,
       (SELECT count(*) FROM public.minerador_keywords k JOIN public.minerador_keyword_lists l ON l.id = k.lista_id
         WHERE k.lista_id IS NOT NULL AND k.brand_id IS DISTINCT FROM l.marca_id) AS keywords_cross_brand_list;

-- 5. Agência. Execute somente depois de confirmar as três tabelas na auditoria de catálogo.
SELECT status, count(*) AS memberships_count
FROM public.agency_memberships
GROUP BY status
ORDER BY status;

SELECT (SELECT count(*) FROM public.agencies) AS agencies_total,
       (SELECT count(*) FROM public.agency_memberships am WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = am.user_id)) AS memberships_missing_auth_actor,
       (SELECT count(*) FROM public.agency_brands ab WHERE NOT EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = ab.brand_id)) AS agency_links_missing_brand,
       (SELECT count(*) FROM public.agency_brands ab WHERE NOT EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = ab.agency_id)) AS agency_links_missing_agency;

SELECT agency_id, user_id, count(*) AS duplicate_memberships
FROM public.agency_memberships
GROUP BY agency_id, user_id
HAVING count(*) > 1
ORDER BY duplicate_memberships DESC, agency_id, user_id;

SELECT brand_id, count(*) AS active_agency_links
FROM public.agency_brands
WHERE status = 'active'
GROUP BY brand_id
HAVING count(*) > 1
ORDER BY active_agency_links DESC, brand_id;

-- 6. Artefatos canônicos, discovery e providers: somente contagens de órfãos.
WITH optional_relations(relation_name) AS (
  VALUES ('minerador_google_ads_connections'), ('minerador_keyword_metric_measurements'),
         ('minerador_discovery_runs'), ('minerador_discovery_import_batches'),
         ('editorial_artifact_versions'), ('editorial_serp_snapshots'),
         ('content_documents'), ('publication_records'), ('tenant_0005_migration_guard')
)
SELECT relation_name,
       CASE WHEN to_regclass('public.' || relation_name) IS NULL THEN 'MISSING_NOT_IN_SCOPE'
            ELSE 'PRESENT_OPTIONAL_RELATION' END AS relation_state
FROM optional_relations
ORDER BY relation_name;

-- 7. Guard 0005: executar somente se existir. Não despeja arrays, IDs, e-mails nem snapshot bruto.
SELECT CASE
         WHEN to_regclass('public.tenant_0005_migration_guard') IS NULL
           THEN 'GUARD_0005_UNAVAILABLE'
         ELSE 'GUARD_0005_PRESENT_REVIEW_SEPARATELY'
       END AS guard_0005_state;
