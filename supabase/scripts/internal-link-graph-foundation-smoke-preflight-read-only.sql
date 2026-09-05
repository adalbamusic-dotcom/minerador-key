-- InternalLinkGraph smoke preflight, somente leitura.
--
-- Este artefato não cria Brand, usuário, membership ou fixture. Ele só
-- confirma se existe contexto real suficiente para executar o smoke
-- transacional autorizado sem inventar SiloDNA/SiloPage.

WITH
active_brands AS (
  SELECT
    m.id AS marca_id,
    m.nome,
    m.owner_user_id,
    EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = m.owner_user_id
    ) AS owner_exists
  FROM public.marcas m
  WHERE m.status = 'active'
),
article_candidates AS (
  SELECT
    e.marca_id,
    count(*)::bigint AS article_count,
    count(*) FILTER (WHERE e.status = 'approved')::bigint AS approved_article_count
  FROM public.editorial_artifact_versions e
  WHERE e.artifact_type = 'article_dna'
  GROUP BY e.marca_id
),
silo_pairs AS (
  SELECT
    dna.marca_id,
    dna.entity_id AS silo_id,
    dna.version_id AS silo_dna_version_id,
    page.version_id AS silo_page_version_id,
    dna.content_hash AS silo_dna_content_hash,
    page.content_hash AS silo_page_content_hash
  FROM public.editorial_artifact_versions dna
  JOIN public.editorial_artifact_versions page
    ON page.marca_id = dna.marca_id
   AND page.artifact_type = 'silo_page'
   AND page.entity_id = 'silo-page:' || dna.entity_id
   AND page.source_version_id = dna.version_id
  WHERE dna.artifact_type = 'silo_dna'
),
silo_pair_candidates AS (
  SELECT
    s.marca_id,
    count(*)::bigint AS pair_count,
    coalesce(string_agg(s.silo_id || ':' || s.silo_dna_version_id || '->' || s.silo_page_version_id, '|' ORDER BY s.silo_id, s.silo_dna_version_id), '<none>')::text AS pairs
  FROM silo_pairs s
  GROUP BY s.marca_id
),
actor_candidates AS (
  SELECT
    b.marca_id,
    b.owner_user_id AS actor_user_id
  FROM active_brands b
  WHERE b.owner_exists
),
target_counts AS (
  SELECT
    (SELECT count(*)::bigint FROM public.internal_link_graphs) AS graph_rows,
    (SELECT count(*)::bigint FROM public.internal_link_graph_working_copies) AS working_copy_rows,
    (SELECT count(*)::bigint FROM public.internal_link_graph_nodes) AS node_rows,
    (SELECT count(*)::bigint FROM public.internal_link_graph_edges) AS edge_rows,
    (SELECT count(*)::bigint FROM public.internal_link_graph_proposals) AS proposal_rows
),
summary AS (
  SELECT
    count(*)::bigint AS active_brand_count,
    count(*) FILTER (WHERE owner_exists)::bigint AS active_brand_with_actor_count,
    coalesce((SELECT count(*) FROM silo_pairs), 0)::bigint AS silo_pair_count,
    coalesce((SELECT sum(article_count) FROM article_candidates), 0)::bigint AS article_candidate_count,
    coalesce((SELECT count(*) FROM actor_candidates), 0)::bigint AS actor_candidate_count
  FROM active_brands
),
checks AS (
  SELECT
    'REAL_BRAND_CANDIDATES'::text AS check_name,
    'public.marcas active'::text AS object_name,
    coalesce(string_agg(b.marca_id::text || '=' || b.nome || ';owner=' || coalesce(b.owner_user_id::text, '<null>') || ';owner_exists=' || b.owner_exists::text, ' | ' ORDER BY b.nome), '<none>')::text AS observed,
    CASE WHEN (SELECT active_brand_count FROM summary) >= 1 THEN 'PASS' ELSE 'BLOCKED_PRECONDITION' END::text AS verdict
  FROM active_brands b
  UNION ALL
  SELECT
    'REAL_ARTICLE_DNA_CANDIDATES',
    'public.editorial_artifact_versions artifact_type=article_dna',
    coalesce(string_agg(m.nome || '=total:' || a.article_count::text || ';approved:' || a.approved_article_count::text, ' | ' ORDER BY m.nome), '<none>')::text,
    CASE WHEN (SELECT article_candidate_count FROM summary) >= 2 THEN 'PASS' ELSE 'BLOCKED_PRECONDITION' END
  FROM article_candidates a
  LEFT JOIN public.marcas m ON m.id = a.marca_id
  UNION ALL
  SELECT
    'REAL_SILO_DNA_SILO_PAGE_PAIRS',
    'editorial_artifact_versions silo_dna -> silo_page',
    coalesce(string_agg(m.nome || '=' || s.pairs, ' | ' ORDER BY m.nome), '<none>')::text,
    CASE WHEN (SELECT silo_pair_count FROM summary) >= 1 THEN 'PASS' ELSE 'BLOCKED_PRECONDITION' END
  FROM silo_pair_candidates s
  LEFT JOIN public.marcas m ON m.id = s.marca_id
  UNION ALL
  SELECT
    'REAL_ACTOR_CANDIDATES',
    'owner_user_id -> auth.users',
    coalesce(string_agg(m.nome || '=' || a.actor_user_id::text, ' | ' ORDER BY m.nome), '<none>')::text,
    CASE WHEN (SELECT actor_candidate_count FROM summary) >= 1 THEN 'PASS' ELSE 'BLOCKED_PRECONDITION' END
  FROM actor_candidates a
  LEFT JOIN public.marcas m ON m.id = a.marca_id
  UNION ALL
  SELECT
    'CROSS_BRAND_GRAPH_SMOKE',
    'real active Brands available; no temporary Brand creation',
    format('active_brands=%s; minimum_required=2', (SELECT active_brand_count FROM summary))::text,
    CASE WHEN (SELECT active_brand_count FROM summary) >= 2 THEN 'READY' ELSE 'BLOCKED_PRECONDITION' END
  UNION ALL
  SELECT
    'TEMPORARY_SMOKE_BRAND_REQUIRED',
    'cross-brand smoke prerequisite',
    format('active_brands=%s; temporary Brand is not created automatically', (SELECT active_brand_count FROM summary))::text,
    CASE WHEN (SELECT active_brand_count FROM summary) >= 2 THEN 'NO' ELSE 'YES' END
  UNION ALL
  SELECT
    'GRAPH_SMOKE_DML_GATE',
    'working copy + graph + proposal smoke',
    format('brands=%s; actors=%s; silo_pairs=%s; article_candidates=%s; target_rows=%s/%s/%s/%s/%s', (SELECT active_brand_count FROM summary), (SELECT actor_candidate_count FROM summary), (SELECT silo_pair_count FROM summary), (SELECT article_candidate_count FROM summary), t.graph_rows, t.working_copy_rows, t.node_rows, t.edge_rows, t.proposal_rows)::text,
    CASE WHEN (SELECT active_brand_count FROM summary) >= 1
       AND (SELECT actor_candidate_count FROM summary) >= 1
       AND (SELECT silo_pair_count FROM summary) >= 1
       AND (SELECT article_candidate_count FROM summary) >= 2
      THEN 'READY_FOR_CONTROLLED_SMOKE'
      ELSE 'BLOCKED_PRECONDITION'
    END::text
  FROM target_counts t
)
SELECT
  check_name::text,
  object_name::text,
  observed::text,
  verdict::text
FROM checks
ORDER BY check_name, object_name;
