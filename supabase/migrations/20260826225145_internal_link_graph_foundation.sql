BEGIN;

-- InternalLinkGraph is an append-only, tenantized architectural record.
-- It is intentionally separate from ArticleDNA, SiloDNA and SiloPage.

CREATE TABLE public.internal_link_graphs (
  graph_version_id text PRIMARY KEY,
  graph_id text NOT NULL CHECK (char_length(btrim(graph_id)) > 0),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  silo_id text NOT NULL CHECK (char_length(btrim(silo_id)) > 0),
  base_silo_dna_version_id text NOT NULL REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  base_silo_dna_content_hash text NOT NULL CHECK (char_length(btrim(base_silo_dna_content_hash)) > 0),
  base_silo_page_version_id text NOT NULL REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  base_silo_page_content_hash text NOT NULL CHECK (char_length(btrim(base_silo_page_content_hash)) > 0),
  participating_article_dna_version_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(participating_article_dna_version_refs) = 'array'),
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_graph_version_id text REFERENCES public.internal_link_graphs(graph_version_id) ON DELETE RESTRICT,
  workflow_status text NOT NULL CHECK (workflow_status IN ('draft', 'proposed', 'approved', 'rejected', 'superseded')),
  basis_hash text NOT NULL CHECK (char_length(btrim(basis_hash)) > 0),
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conflicts) = 'array'),
  CONSTRAINT internal_link_graphs_brand_version_unique UNIQUE (graph_version_id, marca_id),
  CONSTRAINT internal_link_graphs_identity_version_unique UNIQUE (marca_id, graph_id, version_number),
  CONSTRAINT internal_link_graphs_approval_consistency CHECK (
    (workflow_status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (workflow_status <> 'approved' AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE INDEX internal_link_graphs_brand_silo_version_idx
  ON public.internal_link_graphs (marca_id, silo_id, version_number DESC);

CREATE TABLE public.internal_link_graph_nodes (
  graph_version_id text NOT NULL,
  node_id text NOT NULL CHECK (char_length(btrim(node_id)) > 0),
  marca_id uuid NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('SILO_PAGE', 'ARTICLE_DNA')),
  article_dna_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  article_dna_content_hash text,
  silo_page_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  silo_page_content_hash text,
  architectural_role text CHECK (architectural_role IS NULL OR architectural_role IN ('PILAR', 'SUPORTE', 'REFORCO', 'OUTRO')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  PRIMARY KEY (graph_version_id, node_id),
  CONSTRAINT internal_link_graph_nodes_graph_brand_fk
    FOREIGN KEY (graph_version_id, marca_id)
    REFERENCES public.internal_link_graphs (graph_version_id, marca_id)
    ON DELETE RESTRICT,
  CONSTRAINT internal_link_graph_nodes_one_reference_ck CHECK (
    (CASE WHEN article_dna_version_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN silo_page_version_id IS NULL THEN 0 ELSE 1 END) = 1
  ),
  CONSTRAINT internal_link_graph_nodes_type_reference_ck CHECK (
    (node_type = 'ARTICLE_DNA' AND article_dna_version_id IS NOT NULL AND silo_page_version_id IS NULL)
    OR (node_type = 'SILO_PAGE' AND silo_page_version_id IS NOT NULL AND article_dna_version_id IS NULL)
  ),
  CONSTRAINT internal_link_graph_nodes_article_hash_ck CHECK (
    article_dna_version_id IS NULL OR char_length(btrim(article_dna_content_hash)) > 0
  ),
  CONSTRAINT internal_link_graph_nodes_page_hash_ck CHECK (
    silo_page_version_id IS NULL OR char_length(btrim(silo_page_content_hash)) > 0
  ),
  CONSTRAINT internal_link_graph_nodes_graph_brand_node_unique UNIQUE (graph_version_id, node_id, marca_id)
);

CREATE INDEX internal_link_graph_nodes_brand_lookup_idx
  ON public.internal_link_graph_nodes (marca_id, graph_version_id, node_type);

CREATE TABLE public.internal_link_graph_edges (
  graph_version_id text NOT NULL,
  edge_id text NOT NULL CHECK (char_length(btrim(edge_id)) > 0),
  marca_id uuid NOT NULL,
  source_node_id text NOT NULL,
  target_node_id text NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN (
    'PILLAR_TO_SUPPORT', 'SUPPORT_TO_PILLAR', 'SUPPORT_TO_SUPPORT',
    'SILO_PAGE_TO_ARTICLE', 'ARTICLE_TO_SILO_PAGE'
  )),
  reason text NOT NULL CHECK (char_length(btrim(reason)) > 0),
  priority text NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  anchor_concepts jsonb NOT NULL CHECK (jsonb_typeof(anchor_concepts) = 'array'),
  origin text NOT NULL CHECK (origin IN ('human', 'ai', 'system')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  PRIMARY KEY (graph_version_id, edge_id),
  CONSTRAINT internal_link_graph_edges_graph_brand_fk
    FOREIGN KEY (graph_version_id, marca_id)
    REFERENCES public.internal_link_graphs (graph_version_id, marca_id)
    ON DELETE RESTRICT,
  CONSTRAINT internal_link_graph_edges_source_fk
    FOREIGN KEY (graph_version_id, source_node_id, marca_id)
    REFERENCES public.internal_link_graph_nodes (graph_version_id, node_id, marca_id)
    ON DELETE RESTRICT,
  CONSTRAINT internal_link_graph_edges_target_fk
    FOREIGN KEY (graph_version_id, target_node_id, marca_id)
    REFERENCES public.internal_link_graph_nodes (graph_version_id, node_id, marca_id)
    ON DELETE RESTRICT,
  CONSTRAINT internal_link_graph_edges_no_self_link_ck CHECK (source_node_id <> target_node_id),
  CONSTRAINT internal_link_graph_edges_anchor_concepts_ck CHECK (jsonb_array_length(anchor_concepts) > 0),
  CONSTRAINT internal_link_graph_edges_directed_unique UNIQUE (graph_version_id, source_node_id, target_node_id),
  CONSTRAINT internal_link_graph_edges_brand_id_unique UNIQUE (graph_version_id, edge_id, marca_id)
);

CREATE INDEX internal_link_graph_edges_brand_source_idx
  ON public.internal_link_graph_edges (marca_id, graph_version_id, source_node_id);

CREATE TABLE public.internal_link_graph_proposals (
  proposal_id text PRIMARY KEY CHECK (char_length(btrim(proposal_id)) > 0),
  graph_id text NOT NULL CHECK (char_length(btrim(graph_id)) > 0),
  marca_id uuid NOT NULL,
  base_graph_version_id text NOT NULL,
  base_graph_content_hash text NOT NULL CHECK (char_length(btrim(base_graph_content_hash)) > 0),
  input_hash text NOT NULL CHECK (char_length(btrim(input_hash)) > 0),
  output_hash text,
  proposal_payload jsonb NOT NULL CHECK (jsonb_typeof(proposal_payload) = 'object'),
  review_status text NOT NULL CHECK (review_status IN ('pending_human', 'accepted', 'partially_accepted', 'rejected')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text,
  ai_execution_ref text,
  CONSTRAINT internal_link_graph_proposals_graph_fk
    FOREIGN KEY (base_graph_version_id, marca_id)
    REFERENCES public.internal_link_graphs (graph_version_id, marca_id)
    ON DELETE RESTRICT,
  CONSTRAINT internal_link_graph_proposals_review_consistency CHECK (
    (review_status = 'pending_human' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status <> 'pending_human' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX internal_link_graph_proposals_brand_graph_idx
  ON public.internal_link_graph_proposals (marca_id, graph_id, created_at DESC);

-- A working copy is editable, tenantized state. It is deliberately separate
-- from the append-only graph/version rows below: lock_version is only a
-- concurrency revision and never an editorial graph version.
CREATE TABLE public.internal_link_graph_working_copies (
  working_copy_id text PRIMARY KEY CHECK (char_length(btrim(working_copy_id)) > 0),
  graph_id text NOT NULL CHECK (char_length(btrim(graph_id)) > 0),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  silo_id text NOT NULL CHECK (char_length(btrim(silo_id)) > 0),
  base_graph_version_id text,
  base_graph_content_hash text,
  basis_hash text NOT NULL CHECK (char_length(btrim(basis_hash)) > 0),
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  working_copy_payload jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  lock_version bigint NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  CONSTRAINT internal_link_graph_working_copies_graph_unique UNIQUE (marca_id, graph_id),
  CONSTRAINT internal_link_graph_working_copies_base_pair_ck CHECK (
    (base_graph_version_id IS NULL) = (base_graph_content_hash IS NULL)
  ),
  CONSTRAINT internal_link_graph_working_copies_payload_ck CHECK (
    jsonb_typeof(working_copy_payload) IS NOT DISTINCT FROM 'object'
    AND working_copy_payload->>'schemaVersion' IS NOT DISTINCT FROM '1'
    AND jsonb_typeof(working_copy_payload->'baseSiloDnaVersionRef') IS NOT DISTINCT FROM 'object'
    AND jsonb_typeof(working_copy_payload->'baseSiloPageVersionRef') IS NOT DISTINCT FROM 'object'
    AND jsonb_typeof(working_copy_payload->'participatingArticleDnaVersionRefs') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(working_copy_payload->'nodes') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(working_copy_payload->'edges') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(working_copy_payload->'metadata') IS NOT DISTINCT FROM 'object'
    AND jsonb_typeof(working_copy_payload->'warnings') IS NOT DISTINCT FROM 'array'
    AND jsonb_typeof(working_copy_payload->'conflicts') IS NOT DISTINCT FROM 'array'
  ),
  CONSTRAINT internal_link_graph_working_copies_base_graph_fk
    FOREIGN KEY (base_graph_version_id, marca_id)
    REFERENCES public.internal_link_graphs (graph_version_id, marca_id)
    ON DELETE RESTRICT
);

CREATE INDEX internal_link_graph_working_copies_brand_updated_idx
  ON public.internal_link_graph_working_copies (marca_id, updated_at DESC);

CREATE FUNCTION public.internal_link_graph_validate_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  artifact_type text;
  artifact_brand uuid;
  artifact_hash text;
BEGIN
  IF NEW.article_dna_version_id IS NOT NULL THEN
    SELECT e.artifact_type, e.marca_id, e.content_hash
      INTO artifact_type, artifact_brand, artifact_hash
    FROM public.editorial_artifact_versions e
    WHERE e.version_id = NEW.article_dna_version_id;
    IF artifact_type IS DISTINCT FROM 'article_dna'
       OR artifact_brand IS DISTINCT FROM NEW.marca_id
       OR artifact_hash IS DISTINCT FROM NEW.article_dna_content_hash THEN
      RAISE EXCEPTION 'internal_link_graph article reference must be an ArticleDNA from the same Brand';
    END IF;
  ELSE
    SELECT e.artifact_type, e.marca_id, e.content_hash
      INTO artifact_type, artifact_brand, artifact_hash
    FROM public.editorial_artifact_versions e
    WHERE e.version_id = NEW.silo_page_version_id;
    IF artifact_type IS DISTINCT FROM 'silo_page'
       OR artifact_brand IS DISTINCT FROM NEW.marca_id
       OR artifact_hash IS DISTINCT FROM NEW.silo_page_content_hash THEN
      RAISE EXCEPTION 'internal_link_graph page reference must be a SiloPage from the same Brand';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.internal_link_graph_validate_bases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  dna_type text;
  dna_brand uuid;
  dna_entity text;
  dna_hash text;
  page_type text;
  page_brand uuid;
  page_entity text;
  page_hash text;
  page_source text;
  article_ref jsonb;
BEGIN
  SELECT e.artifact_type, e.marca_id, e.entity_id, e.content_hash
    INTO dna_type, dna_brand, dna_entity, dna_hash
  FROM public.editorial_artifact_versions e
  WHERE e.version_id = NEW.base_silo_dna_version_id;
  IF dna_type IS DISTINCT FROM 'silo_dna'
     OR dna_brand IS DISTINCT FROM NEW.marca_id
     OR dna_entity IS DISTINCT FROM NEW.silo_id
     OR dna_hash IS DISTINCT FROM NEW.base_silo_dna_content_hash THEN
    RAISE EXCEPTION 'internal_link_graph requires a SiloDNA base from the same Brand and Silo';
  END IF;

  SELECT e.artifact_type, e.marca_id, e.entity_id, e.content_hash, e.source_version_id
    INTO page_type, page_brand, page_entity, page_hash, page_source
  FROM public.editorial_artifact_versions e
  WHERE e.version_id = NEW.base_silo_page_version_id;
  IF page_type IS DISTINCT FROM 'silo_page'
     OR page_brand IS DISTINCT FROM NEW.marca_id
     OR page_entity IS DISTINCT FROM 'silo-page:' || NEW.silo_id
     OR page_hash IS DISTINCT FROM NEW.base_silo_page_content_hash
     OR page_source IS DISTINCT FROM NEW.base_silo_dna_version_id THEN
    RAISE EXCEPTION 'internal_link_graph requires a SiloPage based on the same SiloDNA';
  END IF;

  FOR article_ref IN SELECT value FROM jsonb_array_elements(NEW.participating_article_dna_version_refs)
  LOOP
    IF jsonb_typeof(article_ref) IS DISTINCT FROM 'object'
       OR NOT EXISTS (
         SELECT 1
         FROM public.editorial_artifact_versions e
         WHERE e.version_id = article_ref ->> 'versionId'
           AND e.artifact_type = 'article_dna'
           AND e.marca_id = NEW.marca_id
           AND e.content_hash = article_ref ->> 'contentHash'
       ) THEN
      RAISE EXCEPTION 'internal_link_graph participant must be an ArticleDNA from the same Brand';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.internal_link_graph_protect_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'internal_link_graph records are append-only';
END;
$$;

CREATE FUNCTION public.internal_link_graph_validate_version_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  previous_graph public.internal_link_graphs%ROWTYPE;
BEGIN
  IF NEW.previous_graph_version_id IS NULL THEN
    IF NEW.version_number <> 1 THEN
      RAISE EXCEPTION 'internal_link_graph first version must be version 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT *
    INTO previous_graph
  FROM public.internal_link_graphs
  WHERE graph_version_id = NEW.previous_graph_version_id
  FOR SHARE;

  IF NOT FOUND
     OR previous_graph.marca_id IS DISTINCT FROM NEW.marca_id
     OR previous_graph.graph_id IS DISTINCT FROM NEW.graph_id
     OR previous_graph.version_number <> NEW.version_number - 1 THEN
    RAISE EXCEPTION 'internal_link_graph previous version must be the immediate predecessor of the same Brand and Graph';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.internal_link_graph_proposal_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
     OR NEW.graph_id IS DISTINCT FROM OLD.graph_id
     OR NEW.marca_id IS DISTINCT FROM OLD.marca_id
     OR NEW.base_graph_version_id IS DISTINCT FROM OLD.base_graph_version_id
     OR NEW.base_graph_content_hash IS DISTINCT FROM OLD.base_graph_content_hash
     OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
     OR NEW.output_hash IS DISTINCT FROM OLD.output_hash
     OR NEW.proposal_payload IS DISTINCT FROM OLD.proposal_payload
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.ai_execution_ref IS DISTINCT FROM OLD.ai_execution_ref THEN
    RAISE EXCEPTION 'internal_link_graph proposal content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.internal_link_graph_proposal_validate_base()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  base_graph public.internal_link_graphs%ROWTYPE;
BEGIN
  SELECT g.*
    INTO base_graph
  FROM public.internal_link_graphs g
  WHERE g.graph_version_id = NEW.base_graph_version_id
    AND g.marca_id = NEW.marca_id;

  IF NOT FOUND
     OR base_graph.graph_id IS DISTINCT FROM NEW.graph_id
     OR base_graph.content_hash IS DISTINCT FROM NEW.base_graph_content_hash THEN
    RAISE EXCEPTION 'internal_link_graph proposal base does not match the referenced graph version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.persist_internal_link_graph(
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

CREATE FUNCTION public.persist_internal_link_graph_working_copy(
  p_marca_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_expected_lock_version bigint,
  p_working_copy jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_working_copy_id text;
  v_graph_id text;
  v_silo_id text;
  v_base_graph_version_id text;
  v_base_graph_content_hash text;
  v_basis_hash text;
  v_content_hash text;
  v_created_by uuid;
  v_created_at timestamptz;
  stored_payload jsonb;
  current_row public.internal_link_graph_working_copies%ROWTYPE;
  next_lock_version bigint;
  server_now timestamptz := clock_timestamp();
BEGIN
  IF p_marca_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'internal_link_graph_working_copy requires Brand and actor';
  END IF;
  IF p_action NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'internal_link_graph_working_copy action is not allowed';
  END IF;
  IF jsonb_typeof(p_working_copy) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'internal_link_graph_working_copy payload must be an object';
  END IF;

  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_access_brand(p_marca_id, p_actor_user_id)
     OR NOT public.canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'arquiteto', p_action) THEN
    RAISE EXCEPTION 'internal_link_graph_working_copy actor is not authorized for this Brand and action';
  END IF;

  IF p_working_copy->>'schemaVersion' IS DISTINCT FROM '1'
     OR p_working_copy->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR NULLIF(p_working_copy->>'workingCopyId', '') IS NULL
     OR NULLIF(p_working_copy->>'graphId', '') IS NULL
     OR NULLIF(p_working_copy->>'siloId', '') IS NULL
     OR p_working_copy->>'updatedBy' IS DISTINCT FROM p_actor_user_id::text
     OR NULLIF(p_working_copy->>'createdBy', '') IS NULL
     OR NULLIF(p_working_copy->>'createdAt', '') IS NULL
     OR NULLIF(p_working_copy->>'updatedAt', '') IS NULL
     OR NULLIF(p_working_copy->>'basisHash', '') IS NULL
     OR NULLIF(p_working_copy->>'contentHash', '') IS NULL THEN
    RAISE EXCEPTION 'internal_link_graph_working_copy identity or required fields are invalid';
  END IF;
  IF jsonb_typeof(p_working_copy->'baseSiloDnaVersionRef') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_working_copy->'baseSiloPageVersionRef') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_working_copy->'participatingArticleDnaVersionRefs') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_working_copy->'nodes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_working_copy->'edges') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_working_copy->'metadata') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_working_copy->'warnings') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_working_copy->'conflicts') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'internal_link_graph_working_copy structural collections are invalid';
  END IF;

  v_working_copy_id := p_working_copy->>'workingCopyId';
  v_graph_id := p_working_copy->>'graphId';
  v_silo_id := p_working_copy->>'siloId';
  v_base_graph_version_id := NULLIF(p_working_copy->>'baseGraphVersionId', '');
  v_base_graph_content_hash := NULLIF(p_working_copy->>'baseGraphContentHash', '');
  v_basis_hash := p_working_copy->>'basisHash';
  v_content_hash := p_working_copy->>'contentHash';
  v_created_by := (p_working_copy->>'createdBy')::uuid;
  v_created_at := (p_working_copy->>'createdAt')::timestamptz;

  IF (v_base_graph_version_id IS NULL) IS DISTINCT FROM (v_base_graph_content_hash IS NULL) THEN
    RAISE EXCEPTION 'internal_link_graph_working_copy base graph reference and hash must be paired';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_marca_id::text || ':working-copy:' || v_graph_id, 0));
  SELECT *
    INTO current_row
  FROM public.internal_link_graph_working_copies AS wc
  WHERE wc.marca_id = p_marca_id
    AND wc.graph_id = v_graph_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_action = 'create' THEN
      RAISE EXCEPTION 'internal_link_graph_working_copy already exists';
    END IF;
    IF p_expected_lock_version IS NULL OR current_row.lock_version <> p_expected_lock_version THEN
      RAISE EXCEPTION 'internal_link_graph_working_copy lock version is stale';
    END IF;
    IF current_row.working_copy_id IS DISTINCT FROM v_working_copy_id
       OR current_row.silo_id IS DISTINCT FROM v_silo_id
       OR current_row.created_by IS DISTINCT FROM v_created_by
       OR current_row.created_at IS DISTINCT FROM v_created_at THEN
      RAISE EXCEPTION 'internal_link_graph_working_copy immutable identity changed';
    END IF;
    next_lock_version := current_row.lock_version + 1;
    stored_payload := jsonb_set(p_working_copy, '{lockVersion}', to_jsonb(next_lock_version), true);
    stored_payload := jsonb_set(stored_payload, '{updatedBy}', to_jsonb(p_actor_user_id::text), true);
    stored_payload := jsonb_set(stored_payload, '{updatedAt}', to_jsonb(server_now), true);
    UPDATE public.internal_link_graph_working_copies
    SET base_graph_version_id = v_base_graph_version_id,
        base_graph_content_hash = v_base_graph_content_hash,
        basis_hash = v_basis_hash,
        content_hash = v_content_hash,
        working_copy_payload = stored_payload,
        updated_by = p_actor_user_id,
        updated_at = server_now,
        lock_version = next_lock_version
    WHERE working_copy_id = current_row.working_copy_id;
  ELSE
    IF p_action = 'edit' THEN
      RAISE EXCEPTION 'internal_link_graph_working_copy does not exist';
    END IF;
    IF p_expected_lock_version IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'new internal_link_graph_working_copy must start at lock version zero';
    END IF;
    IF v_created_by IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'new internal_link_graph_working_copy must be created by the session actor';
    END IF;
    next_lock_version := 1;
    stored_payload := jsonb_set(p_working_copy, '{lockVersion}', to_jsonb(next_lock_version), true);
    stored_payload := jsonb_set(stored_payload, '{updatedBy}', to_jsonb(p_actor_user_id::text), true);
    stored_payload := jsonb_set(stored_payload, '{updatedAt}', to_jsonb(server_now), true);
    INSERT INTO public.internal_link_graph_working_copies (
      working_copy_id, graph_id, marca_id, silo_id,
      base_graph_version_id, base_graph_content_hash,
      basis_hash, content_hash, working_copy_payload,
      created_by, created_at, updated_by, updated_at, lock_version
    ) VALUES (
      v_working_copy_id, v_graph_id, p_marca_id, v_silo_id,
      v_base_graph_version_id, v_base_graph_content_hash,
      v_basis_hash, v_content_hash, stored_payload,
      v_created_by, v_created_at, p_actor_user_id, server_now, next_lock_version
    );
  END IF;

  RETURN stored_payload;
END;
$$;

CREATE TRIGGER internal_link_graph_validate_bases_trg
  BEFORE INSERT OR UPDATE ON public.internal_link_graphs
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_validate_bases();

CREATE TRIGGER internal_link_graph_validate_version_chain_trg
  BEFORE INSERT OR UPDATE ON public.internal_link_graphs
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_validate_version_chain();

CREATE TRIGGER internal_link_graph_nodes_validate_refs_trg
  BEFORE INSERT OR UPDATE ON public.internal_link_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_validate_references();

CREATE TRIGGER internal_link_graphs_append_only_trg
  BEFORE UPDATE OR DELETE ON public.internal_link_graphs
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_protect_append_only();

CREATE TRIGGER internal_link_graph_nodes_append_only_trg
  BEFORE UPDATE OR DELETE ON public.internal_link_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_protect_append_only();

CREATE TRIGGER internal_link_graph_edges_append_only_trg
  BEFORE UPDATE OR DELETE ON public.internal_link_graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_protect_append_only();

CREATE TRIGGER internal_link_graph_proposals_delete_guard_trg
  BEFORE DELETE ON public.internal_link_graph_proposals
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_protect_append_only();

CREATE TRIGGER internal_link_graph_proposals_validate_base_trg
  BEFORE INSERT ON public.internal_link_graph_proposals
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_proposal_validate_base();

CREATE TRIGGER internal_link_graph_proposals_review_guard_trg
  BEFORE UPDATE ON public.internal_link_graph_proposals
  FOR EACH ROW EXECUTE FUNCTION public.internal_link_graph_proposal_review_guard();

ALTER TABLE public.internal_link_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_link_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_link_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_link_graph_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_link_graph_working_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY internal_link_graphs_select_policy
  ON public.internal_link_graphs FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY internal_link_graph_nodes_select_policy
  ON public.internal_link_graph_nodes FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY internal_link_graph_edges_select_policy
  ON public.internal_link_graph_edges FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY internal_link_graph_proposals_select_policy
  ON public.internal_link_graph_proposals FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY internal_link_graph_working_copies_select_policy
  ON public.internal_link_graph_working_copies FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE
  public.internal_link_graphs,
  public.internal_link_graph_nodes,
  public.internal_link_graph_edges,
  public.internal_link_graph_proposals,
  public.internal_link_graph_working_copies
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.internal_link_graphs,
  public.internal_link_graph_nodes,
  public.internal_link_graph_edges,
  public.internal_link_graph_proposals,
  public.internal_link_graph_working_copies
TO authenticated;

GRANT SELECT, INSERT ON TABLE
  public.internal_link_graphs,
  public.internal_link_graph_nodes,
  public.internal_link_graph_edges
TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.internal_link_graph_working_copies TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.internal_link_graph_proposals TO service_role;

REVOKE ALL ON FUNCTION
  public.internal_link_graph_validate_references(),
  public.internal_link_graph_validate_bases(),
  public.internal_link_graph_validate_version_chain(),
  public.internal_link_graph_protect_append_only(),
  public.internal_link_graph_proposal_review_guard(),
  public.internal_link_graph_proposal_validate_base()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.persist_internal_link_graph(uuid, uuid, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_internal_link_graph(uuid, uuid, text, jsonb)
TO service_role;

REVOKE ALL ON FUNCTION public.persist_internal_link_graph_working_copy(uuid, uuid, text, bigint, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_internal_link_graph_working_copy(uuid, uuid, text, bigint, jsonb)
TO service_role;

COMMENT ON TABLE public.internal_link_graphs IS 'Versoes append-only do grafo estrutural de links internos por Brand e Silo.';
COMMENT ON TABLE public.internal_link_graph_nodes IS 'Nos tipados do InternalLinkGraph; KeywordDNA nunca e no.';
COMMENT ON TABLE public.internal_link_graph_edges IS 'Arestas dirigidas do InternalLinkGraph, sem ancora literal ou layout de UI.';
COMMENT ON TABLE public.internal_link_graph_proposals IS 'Propostas separadas da aprovacao humana do InternalLinkGraph.';
COMMENT ON TABLE public.internal_link_graph_working_copies IS 'Working copy persistente e editavel do InternalLinkGraph; lock_version e concorrencia, nao versao editorial.';

COMMIT;
