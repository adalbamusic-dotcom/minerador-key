-- Fase 1 / 0015: parecer unificado pré-aplicação.
-- SOMENTE LEITURA. Não cria, altera ou remove objetos e não retorna e-mails,
-- UUIDs, tokens, segredos ou conteúdo editorial.
-- Execute após catálogo, preflight de owner e snapshot. Não aplicar a 0015
-- enquanto algum gate abaixo não retornar OK.

WITH membership_integrity AS (
  SELECT
    count(*) FILTER (
      WHERE bm.member_user_id IS NULL OR auth_actor.id IS NULL
    ) AS invalid_member_user_ids,
    count(*) FILTER (
      WHERE nullif(btrim(bm.user_key), '') IS NOT NULL
        AND auth_actor.email IS NOT NULL
        AND lower(btrim(bm.user_key)) IS DISTINCT FROM lower(auth_actor.email)
    ) AS membership_identity_conflicts
  FROM public.brand_memberships bm
  LEFT JOIN auth.users auth_actor ON auth_actor.id = bm.member_user_id
), owner_integrity AS (
  SELECT count(*) AS owner_membership_conflicts
  FROM public.marcas b
  WHERE b.owner_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.owner_user_id)
     OR EXISTS (
       SELECT 1
       FROM public.brand_memberships bm
       JOIN public.brand_roles br ON br.id = bm.role_id
       WHERE bm.marca_id = b.id
         AND bm.status = 'active'
         AND br.slug = 'owner'
         AND bm.member_user_id IS DISTINCT FROM b.owner_user_id
     )
), agency_integrity AS (
  SELECT
    (SELECT count(*)
     FROM public.agency_memberships am
     WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = am.user_id)
    ) AS orphan_agency_memberships,
    (SELECT count(*)
     FROM public.agency_brands ab
     WHERE NOT EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = ab.agency_id)
        OR NOT EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = ab.brand_id)
    ) AS orphan_agency_brands,
    (SELECT count(*)
     FROM (
       SELECT brand_id
       FROM public.agency_brands
       WHERE status = 'active'
       GROUP BY brand_id
       HAVING count(*) > 1
     ) duplicate_link
    ) AS duplicate_active_agency_brands
), access_review AS (
  SELECT
    (SELECT count(*)
     FROM (VALUES ('marcas'), ('brand_memberships'), ('minerador_keyword_lists'), ('minerador_keywords'),
                  ('agencies'), ('agency_memberships'), ('agency_brands')) expected(table_name)
     LEFT JOIN pg_catalog.pg_class c
       ON c.relnamespace = 'public'::regnamespace AND c.relname = expected.table_name
     WHERE c.oid IS NULL OR NOT c.relrowsecurity
    ) AS private_tables_without_rls,
    (SELECT count(*)
     FROM information_schema.table_privileges p
     WHERE p.table_schema = 'public'
       AND p.grantee IN ('PUBLIC', 'anon')
       AND p.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
    ) AS excessive_anon_or_public_table_grants,
    (SELECT count(*)
     FROM pg_catalog.pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND (
         NOT EXISTS (
           SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting_value
           WHERE setting_value LIKE 'search_path=%'
         )
         OR EXISTS (
           SELECT 1
           FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl_grant
           WHERE acl_grant.grantee = 0
             AND acl_grant.privilege_type = 'EXECUTE'
         )
       )
    ) AS unsafe_security_definer_functions
)
SELECT
  a.duplicate_active_agency_brands,
  a.orphan_agency_memberships,
  a.orphan_agency_brands,
  m.invalid_member_user_ids,
  m.membership_identity_conflicts,
  o.owner_membership_conflicts,
  CASE
    WHEN a.duplicate_active_agency_brands = 0
     AND a.orphan_agency_memberships = 0
     AND a.orphan_agency_brands = 0
     AND m.invalid_member_user_ids = 0
     AND m.membership_identity_conflicts = 0
     AND o.owner_membership_conflicts = 0
    THEN 'OK' ELSE 'BLOCKED' END AS integridade,
  r.private_tables_without_rls,
  r.excessive_anon_or_public_table_grants,
  r.unsafe_security_definer_functions,
  coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'table', p.table_name,
        'grantee', p.grantee,
        'privilege', p.privilege_type
      ) ORDER BY p.table_name, p.grantee, p.privilege_type
    )
    FROM information_schema.table_privileges p
    WHERE p.table_schema = 'public'
      AND p.grantee IN ('PUBLIC', 'anon')
      AND p.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ), '[]'::jsonb) AS anon_or_public_grant_details,
  coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'function', p.proname,
        'missing_search_path', NOT EXISTS (
          SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting_value
          WHERE setting_value LIKE 'search_path=%'
        ),
        'public_execute', EXISTS (
          SELECT 1
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl_grant
          WHERE acl_grant.grantee = 0
            AND acl_grant.privilege_type = 'EXECUTE'
        )
      ) ORDER BY p.proname
    )
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND (
        NOT EXISTS (
          SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting_value
          WHERE setting_value LIKE 'search_path=%'
        )
        OR EXISTS (
          SELECT 1
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl_grant
          WHERE acl_grant.grantee = 0
            AND acl_grant.privilege_type = 'EXECUTE'
        )
      )
  ), '[]'::jsonb) AS unsafe_security_definer_details,
  CASE
    WHEN r.private_tables_without_rls = 0
     AND r.excessive_anon_or_public_table_grants = 0
     AND r.unsafe_security_definer_functions = 0
    THEN 'OK' ELSE 'BLOCKED' END AS current_rls_and_grants
FROM membership_integrity m
CROSS JOIN owner_integrity o
CROSS JOIN agency_integrity a
CROSS JOIN access_review r;
