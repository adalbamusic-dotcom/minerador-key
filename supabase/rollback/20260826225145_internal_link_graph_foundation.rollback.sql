-- Rollback local preparado para a fundação do InternalLinkGraph.
-- Artefato de segurança: não executar automaticamente e não usar CASCADE.
BEGIN;

DROP FUNCTION IF EXISTS public.persist_internal_link_graph_working_copy(uuid, uuid, text, bigint, jsonb);
DROP FUNCTION IF EXISTS public.persist_internal_link_graph(uuid, uuid, text, jsonb);

DROP TABLE IF EXISTS public.internal_link_graph_working_copies;
DROP TABLE IF EXISTS public.internal_link_graph_proposals;
DROP TABLE IF EXISTS public.internal_link_graph_edges;
DROP TABLE IF EXISTS public.internal_link_graph_nodes;
DROP TABLE IF EXISTS public.internal_link_graphs;

DROP FUNCTION IF EXISTS public.internal_link_graph_proposal_validate_base();
DROP FUNCTION IF EXISTS public.internal_link_graph_proposal_review_guard();
DROP FUNCTION IF EXISTS public.internal_link_graph_validate_version_chain();
DROP FUNCTION IF EXISTS public.internal_link_graph_protect_append_only();
DROP FUNCTION IF EXISTS public.internal_link_graph_validate_bases();
DROP FUNCTION IF EXISTS public.internal_link_graph_validate_references();

COMMIT;
