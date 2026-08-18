-- Fase 1 / 0015: pré-condições de owner de agência e índice ativo.
-- SOMENTE LEITURA. Execute depois da auditoria de catálogo confirmar as relações.
-- Não imprime e-mails, tokens, segredos ou dados editoriais.

WITH agency_owner_state AS (
  SELECT a.id AS agency_id,
         nullif(to_jsonb(a) ->> 'owner_user_id', '')::uuid AS configured_owner_user_id,
         count(am.id) FILTER (WHERE am.status = 'active' AND am.role = 'agency_admin') AS active_agency_admin_candidates
  FROM public.agencies a
  LEFT JOIN public.agency_memberships am ON am.agency_id = a.id
  GROUP BY a.id, nullif(to_jsonb(a) ->> 'owner_user_id', '')::uuid
)
SELECT count(*) AS agencies_total,
       count(*) FILTER (WHERE configured_owner_user_id IS NOT NULL) AS agencies_with_explicit_owner,
       count(*) FILTER (WHERE configured_owner_user_id IS NULL AND active_agency_admin_candidates = 0) AS owners_missing_without_candidate,
       count(*) FILTER (WHERE configured_owner_user_id IS NULL AND active_agency_admin_candidates = 1) AS owners_pending_human_decision,
       count(*) FILTER (WHERE configured_owner_user_id IS NULL AND active_agency_admin_candidates > 1) AS owners_missing_with_ambiguous_candidates,
       CASE
         WHEN count(*) FILTER (WHERE configured_owner_user_id IS NULL AND active_agency_admin_candidates = 0) > 0 THEN 'BLOCKED_ZERO_CANDIDATE'
         WHEN count(*) FILTER (WHERE configured_owner_user_id IS NULL AND active_agency_admin_candidates > 1) > 0 THEN 'BLOCKED_MULTIPLE_CANDIDATES'
         WHEN count(*) FILTER (WHERE configured_owner_user_id IS NULL AND active_agency_admin_candidates = 1) > 0 THEN 'BLOCKED_HUMAN_OWNER_DECISION_REQUIRED'
         ELSE 'OWNER_PRECONDITION_READY'
       END AS owner_gate
FROM agency_owner_state;

SELECT i.indexname,
       i.indexdef,
       CASE
         WHEN i.indexname = 'uq_agency_brands_active_brand_0014'
          AND i.indexdef ILIKE '%UNIQUE INDEX%'
          AND i.indexdef ILIKE '%ON public.agency_brands%'
          AND i.indexdef ILIKE '%(brand_id)%'
          AND i.indexdef ILIKE '%WHERE (status = ''active''%' THEN 'EXPECTED_0014_INDEX'
         WHEN i.indexdef ILIKE '%UNIQUE INDEX%'
          AND i.indexdef ILIKE '%ON public.agency_brands%'
          AND i.indexdef ILIKE '%(brand_id)%'
          AND i.indexdef ILIKE '%WHERE (status = ''active''%' THEN 'DUPLICATE_OR_RENAMED_PARTIAL_INDEX'
         ELSE 'OTHER_INDEX'
       END AS index_gate
FROM pg_catalog.pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename = 'agency_brands'
ORDER BY i.indexname;

SELECT brand_id, count(*) AS active_agency_links
FROM public.agency_brands
WHERE status = 'active'
GROUP BY brand_id
HAVING count(*) > 1
ORDER BY active_agency_links DESC, brand_id;
