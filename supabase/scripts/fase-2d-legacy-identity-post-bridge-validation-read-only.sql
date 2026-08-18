-- FASE 2D / 0016. SOMENTE LEITURA. Execute apenas apos a aplicacao manual.
SELECT
  count(*) FILTER (WHERE member_user_id IS NULL) AS invalid_member_user_ids,
  count(*) FILTER (WHERE nullif(btrim(user_key), '') IS NOT NULL) AS physical_membership_user_keys,
  CASE WHEN count(*) FILTER (WHERE member_user_id IS NULL) = 0 THEN 'OK' ELSE 'BLOCKED' END AS membership_uuid_gate
FROM public.brand_memberships;

SELECT CASE
  WHEN to_regclass('public.content_document_user_states') IS NULL
   AND to_regclass('public.editorial_saved_views') IS NULL
   AND to_regclass('public.delegated_access_grants') IS NULL THEN 'EDITORIAL_TABLES_ABSENT_NOT_MIGRATED'
  WHEN to_regclass('public.content_document_user_states') IS NOT NULL
   AND to_regclass('public.editorial_saved_views') IS NOT NULL
   AND to_regclass('public.delegated_access_grants') IS NOT NULL THEN 'EDITORIAL_UUID_BRIDGE_PRESENT_REVIEW_COUNTS'
  ELSE 'EDITORIAL_TABLE_GROUP_PARTIAL_BLOCKED'
END AS editorial_identity_bridge_status;

SELECT
  count(*) FILTER (WHERE role NOT IN ('agency_admin', 'agency_member')) AS invalid_roles,
  count(*) FILTER (WHERE role IS DISTINCT FROM canonical_role) AS role_transition_conflicts
FROM public.agency_memberships;

SELECT
  count(*) FILTER (WHERE pg_get_functiondef(p.oid) ILIKE '%user_key%') AS functions_still_using_legacy_key,
  count(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) setting_value
      WHERE setting_value = 'search_path=pg_catalog, public, pg_temp'
    )
    OR (p.proname = 'editorial_has_permission' AND p.prosecdef IS NOT TRUE)
    OR (p.proname = 'editorial_current_actor_id' AND p.prosecdef IS TRUE)
  ) AS unsafe_canonical_editorial_functions
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('editorial_current_actor_id', 'editorial_has_permission');
