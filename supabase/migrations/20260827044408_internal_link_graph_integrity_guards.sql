BEGIN;

-- The RPC already serializes the canonical write path. The trigger must use
-- the same lineage lock as well so a direct INSERT cannot bypass the chain
-- invariant. Row-level locking is intentionally absent: approved graph
-- tables remain INSERT-only for service_role.
CREATE OR REPLACE FUNCTION public.internal_link_graph_validate_version_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  previous_graph public.internal_link_graphs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.marca_id::text || ':' || NEW.graph_id, 0));

  IF NEW.previous_graph_version_id IS NULL THEN
    IF NEW.version_number <> 1 THEN
      RAISE EXCEPTION 'internal_link_graph first version must be version 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT *
    INTO previous_graph
  FROM public.internal_link_graphs
  WHERE graph_version_id = NEW.previous_graph_version_id;

  IF NOT FOUND
     OR previous_graph.marca_id IS DISTINCT FROM NEW.marca_id
     OR previous_graph.graph_id IS DISTINCT FROM NEW.graph_id
     OR previous_graph.version_number <> NEW.version_number - 1 THEN
    RAISE EXCEPTION 'internal_link_graph previous version must be the immediate predecessor of the same Brand and Graph';
  END IF;
  RETURN NEW;
END;
$$;

-- Working copies remain mutable. This trigger protects only the identity of
-- the persisted artifact references, not the editable graph payload itself.
CREATE FUNCTION public.internal_link_graph_validate_working_copy_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  dna_ref jsonb;
  page_ref jsonb;
  article_ref jsonb;
  node jsonb;
  node_ref jsonb;
BEGIN
  dna_ref := NEW.working_copy_payload -> 'baseSiloDnaVersionRef';
  IF jsonb_typeof(dna_ref) IS DISTINCT FROM 'object'
     OR NOT EXISTS (
       SELECT 1
       FROM public.editorial_artifact_versions AS e
       WHERE e.version_id = dna_ref ->> 'versionId'
         AND e.artifact_type = 'silo_dna'
         AND e.marca_id = NEW.marca_id
         AND e.entity_id = NEW.silo_id
         AND e.content_hash = dna_ref ->> 'contentHash'
     ) THEN
    RAISE EXCEPTION 'internal_link_graph working copy requires a SiloDNA from the same Brand and Silo';
  END IF;

  page_ref := NEW.working_copy_payload -> 'baseSiloPageVersionRef';
  IF jsonb_typeof(page_ref) IS DISTINCT FROM 'object'
     OR NOT EXISTS (
       SELECT 1
       FROM public.editorial_artifact_versions AS e
       WHERE e.version_id = page_ref ->> 'versionId'
         AND e.artifact_type = 'silo_page'
         AND e.marca_id = NEW.marca_id
         AND e.entity_id = 'silo-page:' || NEW.silo_id
         AND e.content_hash = page_ref ->> 'contentHash'
         AND e.source_version_id = dna_ref ->> 'versionId'
     ) THEN
    RAISE EXCEPTION 'internal_link_graph working copy requires a SiloPage based on the same SiloDNA, Brand and Silo';
  END IF;

  IF jsonb_typeof(NEW.working_copy_payload -> 'participatingArticleDnaVersionRefs') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'internal_link_graph working copy ArticleDNA participants must be an array';
  END IF;

  FOR article_ref IN
    SELECT refs.value
    FROM jsonb_array_elements(NEW.working_copy_payload -> 'participatingArticleDnaVersionRefs')
      WITH ORDINALITY AS refs(value, ordinal)
    ORDER BY refs.ordinal
  LOOP
    IF jsonb_typeof(article_ref) IS DISTINCT FROM 'object'
       OR NOT EXISTS (
         SELECT 1
         FROM public.editorial_artifact_versions AS e
         WHERE e.version_id = article_ref ->> 'versionId'
           AND e.artifact_type = 'article_dna'
           AND e.marca_id = NEW.marca_id
           AND e.entity_id = article_ref ->> 'entityId'
           AND e.content_hash = article_ref ->> 'contentHash'
       ) THEN
      RAISE EXCEPTION 'internal_link_graph working copy participant must be an ArticleDNA from the same Brand';
    END IF;
  END LOOP;

  IF jsonb_typeof(NEW.working_copy_payload -> 'nodes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'internal_link_graph working copy nodes must be an array';
  END IF;

  FOR node IN
    SELECT nodes.value
    FROM jsonb_array_elements(NEW.working_copy_payload -> 'nodes')
      WITH ORDINALITY AS nodes(value, ordinal)
    ORDER BY nodes.ordinal
  LOOP
    IF jsonb_typeof(node) IS DISTINCT FROM 'object'
       OR node ->> 'brandId' IS DISTINCT FROM NEW.marca_id::text THEN
      RAISE EXCEPTION 'internal_link_graph working copy node must belong to the same Brand';
    END IF;

    IF node ->> 'nodeType' = 'ARTICLE_DNA' THEN
      node_ref := node -> 'articleDnaVersionRef';
      IF jsonb_typeof(node_ref) IS DISTINCT FROM 'object'
         OR NOT EXISTS (
           SELECT 1
           FROM public.editorial_artifact_versions AS e
           WHERE e.version_id = node_ref ->> 'versionId'
             AND e.artifact_type = 'article_dna'
             AND e.marca_id = NEW.marca_id
             AND e.entity_id = node_ref ->> 'entityId'
             AND e.content_hash = node_ref ->> 'contentHash'
         ) THEN
        RAISE EXCEPTION 'internal_link_graph working copy ArticleDNA node must belong to the same Brand';
      END IF;
    ELSIF node ->> 'nodeType' = 'SILO_PAGE' THEN
      node_ref := node -> 'siloPageVersionRef';
      IF jsonb_typeof(node_ref) IS DISTINCT FROM 'object'
         OR NOT EXISTS (
           SELECT 1
           FROM public.editorial_artifact_versions AS e
           WHERE e.version_id = node_ref ->> 'versionId'
             AND e.artifact_type = 'silo_page'
             AND e.marca_id = NEW.marca_id
             AND e.entity_id = 'silo-page:' || NEW.silo_id
             AND e.content_hash = node_ref ->> 'contentHash'
             AND e.source_version_id = dna_ref ->> 'versionId'
         ) THEN
        RAISE EXCEPTION 'internal_link_graph working copy SiloPage node must belong to the same Brand and Silo';
      END IF;
    ELSE
      RAISE EXCEPTION 'internal_link_graph working copy node type is invalid';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER internal_link_graph_working_copies_validate_references_trg
  BEFORE INSERT OR UPDATE ON public.internal_link_graph_working_copies
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_validate_working_copy_references();

REVOKE ALL ON FUNCTION public.internal_link_graph_validate_working_copy_references()
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
