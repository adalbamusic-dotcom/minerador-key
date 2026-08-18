-- PROPOSED ONLY. Do not run until the read-only inventory is reviewed and a
-- human-approved, record-level manifest has been inserted below.
-- Target Brand is fixed: 95bef1bb-0a3d-4218-a01f-ac7281c55e45.
-- No CASCADE. No Minerador, auth, agency, brand, list or keyword mutation.
--
-- Contract boundary: 0027/0028 append-only triggers prohibit UPDATE/DELETE on
-- artifacts, document versions, SERP snapshots and SERP reviews. This script
-- deliberately refuses those objects rather than bypassing their protection.
BEGIN;

CREATE TEMP TABLE _adalba_reset_manifest (
  object_name text NOT NULL CHECK (object_name IN (
    'editorial_workflow_items', 'editorial_artifact_versions',
    'editorial_serp_snapshots', 'editorial_serp_reviews',
    'content_documents', 'content_document_versions',
    'content_document_user_states', 'editorial_saved_views',
    'publication_records', 'briefings_artigos'
  )),
  record_id text NOT NULL,
  PRIMARY KEY (object_name, record_id)
) ON COMMIT DROP;

-- Intentionally empty. Populate only after inventory review and separate
-- human approval. Never include a published/URL/canonical record.
-- INSERT INTO _adalba_reset_manifest (object_name, record_id) VALUES
--   ('editorial_workflow_items', 'approved-id-from-reviewed-inventory');

DO $$
DECLARE
  target_brand_id constant uuid := '95bef1bb-0a3d-4218-a01f-ac7281c55e45';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _adalba_reset_manifest) THEN
    RAISE EXCEPTION 'RESET_MANIFEST_REQUIRED: this proposed script is intentionally inert without an approved record-level manifest';
  END IF;

  IF EXISTS (
    SELECT 1 FROM _adalba_reset_manifest
    WHERE object_name IN (
      'editorial_artifact_versions', 'editorial_serp_snapshots',
      'editorial_serp_reviews', 'content_document_versions'
    )
  ) THEN
    RAISE EXCEPTION 'RESET_APPEND_ONLY_CONTRACT_BLOCKED: 0027/0028 protects selected artifact/version/SERP rows; a separate approved structural decision is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM _adalba_reset_manifest m
    LEFT JOIN public.editorial_workflow_items w ON m.object_name = 'editorial_workflow_items' AND w.id::text = m.record_id AND w.marca_id = target_brand_id
    LEFT JOIN public.content_documents d ON m.object_name = 'content_documents' AND d.id = m.record_id AND d.marca_id = target_brand_id
    LEFT JOIN public.content_document_user_states us ON m.object_name = 'content_document_user_states' AND us.document_id::text || ':' || us.user_id::text = m.record_id AND EXISTS (SELECT 1 FROM public.content_documents d2 WHERE d2.id = us.document_id AND d2.marca_id = target_brand_id)
    LEFT JOIN public.editorial_saved_views sv ON m.object_name = 'editorial_saved_views' AND sv.id::text = m.record_id AND sv.marca_id = target_brand_id
    LEFT JOIN public.publication_records p ON m.object_name = 'publication_records' AND p.id::text = m.record_id AND p.marca_id = target_brand_id
    LEFT JOIN public.briefings_artigos b ON m.object_name = 'briefings_artigos' AND b.id::text = m.record_id AND EXISTS (SELECT 1 FROM public.minerador_keyword_lists l WHERE l.id = b.silo_id AND l.marca_id = target_brand_id)
    WHERE (m.object_name = 'editorial_workflow_items' AND w.id IS NULL)
       OR (m.object_name = 'content_documents' AND d.id IS NULL)
       OR (m.object_name = 'content_document_user_states' AND us.document_id IS NULL)
       OR (m.object_name = 'editorial_saved_views' AND sv.id IS NULL)
       OR (m.object_name = 'publication_records' AND p.id IS NULL)
       OR (m.object_name = 'briefings_artigos' AND b.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'RESET_MANIFEST_SCOPE_FAILED: every selected row must exist and belong to the fixed Brand';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.publication_records p
    JOIN _adalba_reset_manifest m ON m.object_name = 'publication_records' AND m.record_id = p.id::text
    WHERE p.marca_id = target_brand_id
      AND (lower(coalesce(p.status, '')) IN ('publicado', 'published') OR nullif(btrim(p.published_url), '') IS NOT NULL OR nullif(btrim(p.canonical), '') IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'RESET_PUBLISHED_PUBLICATION_FORBIDDEN: published or URL/canonical publication records must be preserved';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.briefings_artigos b
    JOIN _adalba_reset_manifest m ON m.object_name = 'briefings_artigos' AND m.record_id = b.id::text
    WHERE lower(coalesce(b.status, '')) IN ('publicado', 'published') OR nullif(btrim(to_jsonb(b) ->> 'canonical'), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'RESET_PUBLISHED_BRIEFING_FORBIDDEN: published or canonical legacy briefings must be preserved';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.content_documents d
    JOIN _adalba_reset_manifest m ON m.object_name = 'content_documents' AND m.record_id = d.id
    WHERE d.marca_id = target_brand_id
      AND EXISTS (SELECT 1 FROM public.content_document_versions dv WHERE dv.document_id = d.id)
  ) THEN
    RAISE EXCEPTION 'RESET_DOCUMENT_VERSION_DEPENDENCY: a document with append-only versions cannot be reset by this proposal';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.content_documents d
    JOIN _adalba_reset_manifest m ON m.object_name = 'content_documents' AND m.record_id = d.id
    WHERE d.marca_id = target_brand_id
      AND EXISTS (
        SELECT 1 FROM public.content_document_user_states us
        WHERE us.document_id = d.id
          AND NOT EXISTS (SELECT 1 FROM _adalba_reset_manifest selected WHERE selected.object_name = 'content_document_user_states' AND selected.record_id = us.document_id::text || ':' || us.user_id::text)
      )
  ) THEN
    RAISE EXCEPTION 'RESET_DOCUMENT_USER_STATE_DEPENDENCY: select all user states of a selected empty document or preserve the document';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.publication_records p
    WHERE p.marca_id = target_brand_id
      AND NOT EXISTS (SELECT 1 FROM _adalba_reset_manifest m WHERE m.object_name = 'publication_records' AND m.record_id = p.id::text)
      AND EXISTS (SELECT 1 FROM _adalba_reset_manifest m WHERE m.object_name = 'content_documents' AND m.record_id = p.document_id)
  ) THEN
    RAISE EXCEPTION 'RESET_PRESERVED_PUBLICATION_DEPENDENCY: a preserved publication still references a selected document';
  END IF;
END $$;

CREATE TEMP TABLE _adalba_reset_before_counts ON COMMIT DROP AS
SELECT object_name, count(*)::integer AS selected_count
FROM _adalba_reset_manifest
GROUP BY object_name;

-- FK-aware order for the only rows this proposal can safely reset today.
DELETE FROM public.publication_records p USING _adalba_reset_manifest m
WHERE m.object_name = 'publication_records' AND m.record_id = p.id::text
  AND p.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid;

DELETE FROM public.editorial_saved_views sv USING _adalba_reset_manifest m
WHERE m.object_name = 'editorial_saved_views' AND m.record_id = sv.id::text
  AND sv.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid;

DELETE FROM public.content_document_user_states us USING _adalba_reset_manifest m
WHERE m.object_name = 'content_document_user_states' AND m.record_id = us.document_id::text || ':' || us.user_id::text
  AND EXISTS (SELECT 1 FROM public.content_documents d WHERE d.id = us.document_id AND d.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid);

DELETE FROM public.content_documents d USING _adalba_reset_manifest m
WHERE m.object_name = 'content_documents' AND m.record_id = d.id
  AND d.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid;

DELETE FROM public.briefings_artigos b USING _adalba_reset_manifest m
WHERE m.object_name = 'briefings_artigos' AND m.record_id = b.id::text
  AND EXISTS (SELECT 1 FROM public.minerador_keyword_lists l WHERE l.id = b.silo_id AND l.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid);

DELETE FROM public.editorial_workflow_items w USING _adalba_reset_manifest m
WHERE m.object_name = 'editorial_workflow_items' AND m.record_id = w.id::text
  AND w.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid;

WITH remaining AS (
  SELECT 'editorial_workflow_items'::text AS object_name, count(*)::integer AS remaining_count FROM public.editorial_workflow_items w JOIN _adalba_reset_manifest m ON m.object_name = 'editorial_workflow_items' AND m.record_id = w.id::text
  UNION ALL SELECT 'content_documents', count(*)::integer FROM public.content_documents d JOIN _adalba_reset_manifest m ON m.object_name = 'content_documents' AND m.record_id = d.id
  UNION ALL SELECT 'content_document_user_states', count(*)::integer FROM public.content_document_user_states us JOIN _adalba_reset_manifest m ON m.object_name = 'content_document_user_states' AND m.record_id = us.document_id::text || ':' || us.user_id::text
  UNION ALL SELECT 'editorial_saved_views', count(*)::integer FROM public.editorial_saved_views sv JOIN _adalba_reset_manifest m ON m.object_name = 'editorial_saved_views' AND m.record_id = sv.id::text
  UNION ALL SELECT 'publication_records', count(*)::integer FROM public.publication_records p JOIN _adalba_reset_manifest m ON m.object_name = 'publication_records' AND m.record_id = p.id::text
  UNION ALL SELECT 'briefings_artigos', count(*)::integer FROM public.briefings_artigos b JOIN _adalba_reset_manifest m ON m.object_name = 'briefings_artigos' AND m.record_id = b.id::text
)
SELECT b.object_name, b.selected_count AS before_count, coalesce(r.remaining_count, 0) AS after_count,
  CASE WHEN coalesce(r.remaining_count, 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS verifier
FROM _adalba_reset_before_counts b
LEFT JOIN remaining r USING (object_name)
ORDER BY b.object_name;

-- STOP HERE. Review the final verifier while the transaction is still open.
-- Run COMMIT only after an explicit, separate human approval; otherwise ROLLBACK.
