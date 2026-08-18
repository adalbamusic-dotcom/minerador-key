-- Fase 2C: auditoria de visibilidade de marca.
-- SOMENTE LEITURA. Não imprime e-mails, UUIDs, tokens, segredos nem dados editoriais.
-- Execute sob uma sessão autenticada do ator a auditar. No SQL Editor sem JWT,
-- current_actor_brand_membership retorna ACTOR_CONTEXT_UNAVAILABLE por segurança.

WITH target AS (
  SELECT id, owner_user_id
  FROM public.marcas
  WHERE lower(regexp_replace(nome, '[^a-z0-9]+', '', 'g')) = 'lindisse'
),
actor AS (
  SELECT auth.uid() AS user_id
),
membership AS (
  SELECT bm.marca_id, bm.status, bm.id
  FROM public.brand_memberships bm
  JOIN target t ON t.id = bm.marca_id
  JOIN actor a ON a.user_id = bm.member_user_id
),
permissions AS (
  SELECT bmp.membership_id, bmp.module, bmp.action, bmp.granted
  FROM public.brand_member_permissions bmp
  JOIN membership m ON m.id = bmp.membership_id
)
SELECT
  CASE
    WHEN (SELECT count(*) FROM target) = 0 THEN 'MISSING'
    WHEN (SELECT count(*) FROM target) = 1 THEN 'PRESENT'
    ELSE 'AMBIGUOUS_NAME_REVIEW_REQUIRED'
  END AS lindisse_exists,
  CASE
    WHEN (SELECT count(*) FROM target) <> 1 THEN 'NOT_EVALUATED'
    WHEN EXISTS (
      SELECT 1
      FROM public.agency_brands ab
      JOIN target t ON t.id = ab.brand_id
      WHERE ab.status = 'active'
    ) THEN 'ACTIVE'
    ELSE 'MISSING_OR_INACTIVE'
  END AS agency_link_active,
  CASE
    WHEN (SELECT count(*) FROM target) <> 1 THEN 'NOT_EVALUATED'
    WHEN EXISTS (SELECT 1 FROM target WHERE owner_user_id IS NOT NULL) THEN 'PRESENT'
    ELSE 'MISSING'
  END AS owner_present,
  CASE
    WHEN (SELECT user_id FROM actor) IS NULL THEN 'ACTOR_CONTEXT_UNAVAILABLE'
    WHEN (SELECT count(*) FROM target) <> 1 THEN 'NOT_EVALUATED'
    WHEN EXISTS (SELECT 1 FROM membership WHERE status = 'active') THEN 'ACTIVE'
    WHEN EXISTS (SELECT 1 FROM membership) THEN 'INACTIVE'
    WHEN EXISTS (SELECT 1 FROM target t JOIN actor a ON t.owner_user_id = a.user_id) THEN 'OWNER'
    ELSE 'MISSING'
  END AS current_actor_brand_membership,
  CASE
    WHEN (SELECT user_id FROM actor) IS NULL THEN 'ACTOR_CONTEXT_UNAVAILABLE'
    WHEN (SELECT count(*) FROM target) <> 1 THEN 'NOT_EVALUATED'
    WHEN EXISTS (SELECT 1 FROM target t JOIN actor a ON t.owner_user_id = a.user_id) THEN 'OWNER_IMPLICIT'
    WHEN EXISTS (SELECT 1 FROM permissions WHERE module = 'marca' AND action = 'view' AND granted) THEN 'MARCA_VIEW_GRANTED'
    WHEN EXISTS (SELECT 1 FROM membership WHERE status = 'active') THEN 'ACTIVE_MEMBERSHIP_PERMISSION_REVIEW_REQUIRED'
    ELSE 'NO_ACTIVE_PERMISSION'
  END AS required_brand_permissions;
