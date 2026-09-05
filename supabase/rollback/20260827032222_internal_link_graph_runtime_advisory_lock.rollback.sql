-- Rollback local da sucessora do lock de runtime do InternalLinkGraph.
-- Artefato de segurança: não executar automaticamente, não usa CASCADE e
-- não remove tabelas, Graphs, nodes ou edges.
-- Restaura a definição anterior da RPC, inclusive o FOR UPDATE original.
BEGIN;

CREATE OR REPLACE FUNCTION public.persist_internal_link_graph(
  p_marca_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_graph jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  graph_version_id text;
  graph_id text;
  graph_brand_id uuid;
  silo_id text;
  version_number integer;
  previous_graph_version_id text;
  workflow_status text;
  basis_hash text;
  content_hash text;
  created_by uuid;
  created_at timestamptz;
  approved_by uuid;
  approved_at timestamptz;
  base_silo_dna_version_id text;
  base_silo_dna_content_hash text;
  base_silo_page_version_id text;
  base_silo_page_content_hash text;
  participating_refs jsonb;
  nodes jsonb;
  edges jsonb;
  metadata jsonb;
  warnings jsonb;
  conflicts jsonb;
  latest_graph_version_id text;
  latest_version_number integer;
  node jsonb;
  edge jsonb;
BEGIN
  IF p_marca_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'internal_link_graph requires Brand and actor';
  END IF;
  IF p_action NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'internal_link_graph action is not allowed';
  END IF;
  IF jsonb_typeof(p_graph) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'internal_link_graph payload must be an object';
  END IF;

  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_access_brand(p_marca_id, p_actor_user_id)
     OR NOT public.canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'arquiteto', p_action) THEN
    RAISE EXCEPTION 'internal_link_graph actor is not authorized for this Brand and action';
  END IF;

  IF p_graph->>'schemaVersion' IS DISTINCT FROM '1'
     OR p_graph->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR p_graph->>'createdBy' IS DISTINCT FROM p_actor_user_id::text THEN
    RAISE EXCEPTION 'internal_link_graph identity is inconsistent';
  END IF;
  IF COALESCE(p_graph->>'graphVersionId', '') = ''
     OR COALESCE(p_graph->>'graphId', '') = ''
     OR COALESCE(p_graph->>'siloId', '') = ''
     OR COALESCE(p_graph->>'versionNumber', '') !~ '^[0-9]+$'
     OR COALESCE(p_graph->>'basisHash', '') = ''
     OR COALESCE(p_graph->>'contentHash', '') = ''
     OR COALESCE(p_graph->>'createdAt', '') = '' THEN
    RAISE EXCEPTION 'internal_link_graph required fields are missing';
  END IF;
  IF jsonb_typeof(p_graph->'baseSiloDnaVersionRef') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_graph->'baseSiloPageVersionRef') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_graph->'participatingArticleDnaVersionRefs') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_graph->'nodes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_graph->'edges') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'internal_link_graph structural collections are invalid';
  END IF;

  graph_version_id := p_graph->>'graphVersionId';
  graph_id := p_graph->>'graphId';
  graph_brand_id := (p_graph->>'brandId')::uuid;
  silo_id := p_graph->>'siloId';
  version_number := (p_graph->>'versionNumber')::integer;
  previous_graph_version_id := NULLIF(p_graph->>'previousVersionId', '');
  workflow_status := p_graph->>'workflowStatus';
  basis_hash := p_graph->>'basisHash';
  content_hash := p_graph->>'contentHash';
  created_by := (p_graph->>'createdBy')::uuid;
  created_at := (p_graph->>'createdAt')::timestamptz;
  base_silo_dna_version_id := p_graph->'baseSiloDnaVersionRef'->>'versionId';
  base_silo_dna_content_hash := p_graph->'baseSiloDnaVersionRef'->>'contentHash';
  base_silo_page_version_id := p_graph->'baseSiloPageVersionRef'->>'versionId';
  base_silo_page_content_hash := p_graph->'baseSiloPageVersionRef'->>'contentHash';
  participating_refs := p_graph->'participatingArticleDnaVersionRefs';
  nodes := p_graph->'nodes';
  edges := p_graph->'edges';
  metadata := COALESCE(NULLIF(p_graph->'metadata', 'null'::jsonb), '{}'::jsonb);
  warnings := COALESCE(NULLIF(p_graph->'warnings', 'null'::jsonb), '[]'::jsonb);
  conflicts := COALESCE(NULLIF(p_graph->'conflicts', 'null'::jsonb), '[]'::jsonb);

  IF graph_brand_id IS DISTINCT FROM p_marca_id
     OR version_number < 1
     OR workflow_status NOT IN ('draft', 'proposed', 'approved', 'rejected', 'superseded')
     OR jsonb_typeof(metadata) IS DISTINCT FROM 'object'
     OR jsonb_typeof(warnings) IS DISTINCT FROM 'array'
     OR jsonb_typeof(conflicts) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'internal_link_graph scalar fields are invalid';
  END IF;

  IF workflow_status = 'approved' THEN
    IF NULLIF(p_graph->>'approvedBy', '') IS NULL OR NULLIF(p_graph->>'approvedAt', '') IS NULL THEN
      RAISE EXCEPTION 'approved internal_link_graph requires approval metadata';
    END IF;
    approved_by := (p_graph->>'approvedBy')::uuid;
    approved_at := (p_graph->>'approvedAt')::timestamptz;
  ELSE
    IF NULLIF(p_graph->>'approvedBy', '') IS NOT NULL OR NULLIF(p_graph->>'approvedAt', '') IS NOT NULL THEN
      RAISE EXCEPTION 'unapproved internal_link_graph cannot carry approval metadata';
    END IF;
    approved_by := NULL;
    approved_at := NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_marca_id::text || ':' || graph_id, 0));
  SELECT g.graph_version_id, g.version_number
    INTO latest_graph_version_id, latest_version_number
  FROM public.internal_link_graphs g
  WHERE g.marca_id = p_marca_id AND g.graph_id = p_graph->>'graphId'
  ORDER BY g.version_number DESC
  LIMIT 1
  FOR UPDATE;

  IF latest_graph_version_id IS NULL THEN
    IF version_number <> 1 OR previous_graph_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'internal_link_graph initial version must be version 1 without predecessor';
    END IF;
  ELSIF version_number <> latest_version_number + 1
     OR previous_graph_version_id IS DISTINCT FROM latest_graph_version_id THEN
    RAISE EXCEPTION 'internal_link_graph successor is not the next canonical version';
  END IF;

  INSERT INTO public.internal_link_graphs (
    graph_version_id, graph_id, marca_id, silo_id,
    base_silo_dna_version_id, base_silo_dna_content_hash,
    base_silo_page_version_id, base_silo_page_content_hash,
    participating_article_dna_version_refs, version_number,
    previous_graph_version_id, workflow_status, basis_hash, content_hash,
    created_by, created_at, approved_by, approved_at, metadata, warnings, conflicts
  ) VALUES (
    graph_version_id, graph_id, p_marca_id, silo_id,
    base_silo_dna_version_id, base_silo_dna_content_hash,
    base_silo_page_version_id, base_silo_page_content_hash,
    participating_refs, version_number, previous_graph_version_id,
    workflow_status, basis_hash, content_hash, created_by, created_at,
    approved_by, approved_at, metadata, warnings, conflicts
  );

  FOR node IN SELECT value FROM jsonb_array_elements(nodes)
  LOOP
    INSERT INTO public.internal_link_graph_nodes (
      graph_version_id, node_id, marca_id, node_type,
      article_dna_version_id, article_dna_content_hash,
      silo_page_version_id, silo_page_content_hash,
      architectural_role, snapshot
    ) VALUES (
      graph_version_id,
      node->>'nodeId',
      p_marca_id,
      node->>'nodeType',
      CASE WHEN jsonb_typeof(node->'articleDnaVersionRef') = 'object' THEN node->'articleDnaVersionRef'->>'versionId' ELSE NULL END,
      CASE WHEN jsonb_typeof(node->'articleDnaVersionRef') = 'object' THEN node->'articleDnaVersionRef'->>'contentHash' ELSE NULL END,
      CASE WHEN jsonb_typeof(node->'siloPageVersionRef') = 'object' THEN node->'siloPageVersionRef'->>'versionId' ELSE NULL END,
      CASE WHEN jsonb_typeof(node->'siloPageVersionRef') = 'object' THEN node->'siloPageVersionRef'->>'contentHash' ELSE NULL END,
      node->>'architecturalRole',
      CASE WHEN jsonb_typeof(node->'snapshot') = 'object' THEN node->'snapshot' ELSE '{}'::jsonb END
    );
  END LOOP;

  FOR edge IN SELECT value FROM jsonb_array_elements(edges)
  LOOP
    INSERT INTO public.internal_link_graph_edges (
      graph_version_id, edge_id, marca_id, source_node_id, target_node_id,
      relation_type, reason, priority, anchor_concepts, origin,
      created_by, created_at, provenance
    ) VALUES (
      graph_version_id,
      edge->>'edgeId',
      p_marca_id,
      edge->>'sourceNodeId',
      edge->>'targetNodeId',
      edge->>'relationType',
      edge->>'reason',
      edge->>'priority',
      edge->'anchorConcepts',
      edge->>'origin',
      (edge->>'createdBy')::uuid,
      (edge->>'createdAt')::timestamptz,
      edge->'provenance'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'graphVersionId', graph_version_id,
    'graphId', graph_id,
    'brandId', p_marca_id,
    'versionNumber', version_number,
    'nodeCount', (SELECT count(*) FROM public.internal_link_graph_nodes n WHERE n.graph_version_id = p_graph->>'graphVersionId'),
    'edgeCount', (SELECT count(*) FROM public.internal_link_graph_edges e WHERE e.graph_version_id = p_graph->>'graphVersionId')
  );
END;
$$;

COMMIT;
