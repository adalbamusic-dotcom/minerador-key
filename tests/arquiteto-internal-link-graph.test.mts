import assert from "node:assert/strict";
import test from "node:test";
import {
  InternalLinkGraphSchema,
  type InternalLinkGraphEdge,
  type InternalLinkGraphNode,
  type VersionReference,
} from "../lib/arquiteto/contracts.ts";
import {
  applyInternalLinkGraphProposal,
  createInternalLinkGraph,
  createInternalLinkGraphProposal,
  createInternalLinkGraphSuccessor,
  createInternalLinkGraphWorkingCopy,
  hashInternalLinkGraphContent,
  inferInternalLinkGraphRelationType,
  isInternalLinkGraphRelationCompatible,
  isInternalLinkGraphStale,
  toInternalLinkGraphRef,
  updateInternalLinkGraphWorkingCopy,
} from "../lib/arquiteto/internal-link-graph.ts";

const brandId = "550e8400-e29b-41d4-a716-446655440000";
const actorId = "550e8400-e29b-41d4-a716-446655440001";
const createdAt = "2026-08-26T12:00:00.000Z";
const sha = (char: string) => `sha256:${char.repeat(64)}` as `sha256:${string}`;
const reference = (entityId: string, versionId: string, char: string): VersionReference => ({ entityId, versionId, contentHash: sha(char) });

const pageRef = reference("silo-page:silo-1", "silo-page-v1", "a");
const dnaRef = reference("silo-1", "silo-dna-v1", "b");
const articleA = reference("article-a", "article-a-v1", "c");
const articleB = reference("article-b", "article-b-v1", "d");
const articleC = reference("article-c", "article-c-v1", "e");

function node(nodeId: string, ref: VersionReference, nodeType: "ARTICLE_DNA" | "SILO_PAGE" = "ARTICLE_DNA"): InternalLinkGraphNode {
  return {
    nodeId,
    brandId,
    nodeType,
    articleDnaVersionRef: nodeType === "ARTICLE_DNA" ? ref : null,
    siloPageVersionRef: nodeType === "SILO_PAGE" ? ref : null,
    architecturalRole: nodeType === "SILO_PAGE" ? null : nodeId === "article-a" ? "PILAR" : "SUPORTE",
    snapshot: { label: nodeId, siloId: "silo-1" },
  };
}

function edge(edgeId: string, sourceNodeId: string, targetNodeId: string, anchorConcepts = ["tema"]): InternalLinkGraphEdge {
  return { edgeId, sourceNodeId, targetNodeId, relationType: "SUPPORT_TO_SUPPORT", reason: "Coerência narrativa", priority: "MEDIUM", anchorConcepts, origin: "human", createdBy: actorId, createdAt, provenance: { source: "human-review", references: ["review-1"] } };
}

async function graphWith(edges: InternalLinkGraphEdge[] = [edge("a-b", "article-a", "article-b")], metadata: Record<string, unknown> = {}) {
  return createInternalLinkGraph({
    graphId: "graph-1",
    brandId,
    siloId: "silo-1",
    baseSiloDnaVersionRef: dnaRef,
    baseSiloPageVersionRef: pageRef,
    participatingArticleDnaVersionRefs: [articleC, articleA, articleB],
    versionNumber: 1,
    createdBy: actorId,
    createdAt,
    metadata,
    nodes: [node("article-b", articleB), node("silo-page", pageRef, "SILO_PAGE"), node("article-a", articleA), node("article-c", articleC)],
    edges,
  });
}

test("InternalLinkGraph canonicaliza ordem das coleções e exclui metadado visual do contentHash", async () => {
  const first = await graphWith([edge("a-b", "article-a", "article-b", ["b", "a"])], { layout: { "article-a": { x: 10, y: 20 } }, viewport: { zoom: 1 } });
  const second = await graphWith([edge("a-b", "article-a", "article-b", ["a", "b"])], { layout: { "article-a": { x: 900, y: 400 } }, viewport: { zoom: 2, selected: "article-a" } });
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.basisHash, second.basisHash);
  assert.deepEqual(first.edges[0]?.anchorConcepts, ["a", "b"]);
});

test("InternalLinkGraph bloqueia nó fora da Brand, auto-link e aresta dirigida duplicada", async () => {
  const base = await graphWith();
  assert.throws(() => InternalLinkGraphSchema.parse({ ...base, nodes: [...base.nodes, { ...base.nodes[0], nodeId: "other-brand", brandId: "550e8400-e29b-41d4-a716-446655440099" }] }));
  assert.throws(() => InternalLinkGraphSchema.parse({ ...base, edges: [edge("self", "article-a", "article-a")] }));
  assert.throws(() => InternalLinkGraphSchema.parse({ ...base, edges: [edge("one", "article-a", "article-b"), edge("two", "article-a", "article-b")] }));
  assert.throws(() => InternalLinkGraphSchema.parse({ ...base, nodes: [{ ...base.nodes[0], articleDnaVersionRef: articleA, siloPageVersionRef: pageRef }] }));
});

test("sucessor é append-only, incrementa versão e rejeita conteúdo inalterado", async () => {
  const base = await graphWith();
  const next = await createInternalLinkGraphSuccessor({ previous: base, actorId, reason: "Revisão humana", changes: { edges: [edge("a-c", "article-a", "article-c")] } });
  assert.equal(next.versionNumber, 2);
  assert.equal(next.previousVersionId, base.graphVersionId);
  await assert.rejects(
    createInternalLinkGraphSuccessor({ previous: base, actorId, reason: "sem mudança", changes: {} }),
    error => Boolean(error && typeof error === "object" && "code" in error && error.code === "UNCHANGED_GRAPH"),
  );
});

test("working copy persiste revisões editáveis sem alterar a versão aprovada", async () => {
  const approved = InternalLinkGraphSchema.parse({
    ...(await graphWith()),
    workflowStatus: "approved",
    approvedBy: actorId,
    approvedAt: createdAt,
  });
  const approvedSnapshot = JSON.stringify(approved);
  const first = await createInternalLinkGraphWorkingCopy({
    graphId: approved.graphId,
    brandId,
    siloId: approved.siloId,
    baseGraphVersionId: approved.graphVersionId,
    baseGraphContentHash: approved.contentHash,
    baseSiloDnaVersionRef: approved.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: approved.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: approved.participatingArticleDnaVersionRefs,
    nodes: approved.nodes,
    edges: approved.edges,
    createdBy: actorId,
    now: createdAt,
    metadata: { viewport: { zoom: 1 } },
  });
  const second = await updateInternalLinkGraphWorkingCopy({
    previous: first,
    actorId,
    now: "2026-08-26T12:01:00.000Z",
    changes: {
      edges: [edge("a-c", "article-a", "article-c")],
      metadata: { viewport: { zoom: 2 } },
    },
  });
  assert.equal(first.lockVersion, 1);
  assert.equal(second.lockVersion, 2);
  assert.notEqual(second.contentHash, first.contentHash);
  assert.deepEqual(second.edges.map(item => `${item.sourceNodeId}->${item.targetNodeId}`), ["article-a->article-c"]);
  assert.equal(JSON.stringify(approved), approvedSnapshot);
  assert.equal(approved.workflowStatus, "approved");

  const diagnosticRevision = await updateInternalLinkGraphWorkingCopy({
    previous: second,
    actorId,
    now: "2026-08-26T12:02:00.000Z",
    changes: {
      warnings: ["Diagnóstico atualizado sem mudança na topologia."],
      conflicts: ["Conflito informativo aguardando revisão."],
      metadata: { viewport: { zoom: 3 } },
    },
  });
  assert.equal(diagnosticRevision.lockVersion, 3);
  assert.equal(diagnosticRevision.contentHash, second.contentHash);
  assert.notDeepEqual(diagnosticRevision.warnings, second.warnings);
  assert.notDeepEqual(diagnosticRevision.conflicts, second.conflicts);
});

test("revisão somente de diagnóstico não cria nova versão editorial", async () => {
  const base = await graphWith();
  await assert.rejects(
    createInternalLinkGraphSuccessor({ previous: base, actorId, reason: "warning diagnóstico", changes: { warnings: ["SERP ainda não executada."] } }),
    error => Boolean(error && typeof error === "object" && "code" in error && error.code === "UNCHANGED_GRAPH"),
  );
  await assert.rejects(
    createInternalLinkGraphSuccessor({ previous: base, actorId, reason: "conflict diagnóstico", changes: { conflicts: ["Âncora pendente de revisão humana."] } }),
    error => Boolean(error && typeof error === "object" && "code" in error && error.code === "UNCHANGED_GRAPH"),
  );
});

test("proposta preserva o registro da IA e aplicação parcial respeita decisões humanas", async () => {
  const base = await graphWith();
  const proposal = await createInternalLinkGraphProposal({
    graph: base,
    createdBy: actorId,
    nodes: base.nodes,
    edges: [edge("proposed-a-b", "article-a", "article-b"), edge("proposed-a-c", "article-a", "article-c")],
  });
  assert.equal(proposal.reviewStatus, "pending_human");
  const applied = applyInternalLinkGraphProposal({ base, proposal, acceptedEdgeIds: ["proposed-a-b"], rejectedEdgeIds: ["proposed-a-c"], additionalEdges: [edge("human-b-a", "article-b", "article-a")] });
  assert.deepEqual(applied.edges.map(item => `${item.sourceNodeId}->${item.targetNodeId}`).sort(), ["article-a->article-b", "article-b->article-a"]);
  assert.equal(proposal.payload.edges.length, 2);
});

test("basisHash detecta upstream alterado e o ref downstream mantém a aprovação", async () => {
  const graph = await graphWith();
  assert.equal(await isInternalLinkGraphStale(graph, { brandId, siloId: "silo-1", baseSiloDnaVersionRef: dnaRef, baseSiloPageVersionRef: pageRef, participatingArticleDnaVersionRefs: [articleA, articleB, articleC] }), false);
  assert.equal(await isInternalLinkGraphStale(graph, { brandId, siloId: "silo-1", baseSiloDnaVersionRef: reference("silo-1", "silo-dna-v2", "f"), baseSiloPageVersionRef: pageRef, participatingArticleDnaVersionRefs: [articleA, articleB, articleC] }), true);
  const ref = toInternalLinkGraphRef({ ...graph, workflowStatus: "approved", approvedBy: actorId, approvedAt: createdAt });
  assert.equal(ref.workflowStatus, "approved");
  assert.equal(ref.nodes.length, graph.nodes.length);
  assert.equal(ref.edges.length, graph.edges.length);
});

test("contentHash expõe somente a estrutura canônica recebida", async () => {
  const graph = await graphWith();
  const structuralHash = await hashInternalLinkGraphContent({ brandId: graph.brandId, graphId: graph.graphId, siloId: graph.siloId, baseSiloDnaVersionRef: graph.baseSiloDnaVersionRef, baseSiloPageVersionRef: graph.baseSiloPageVersionRef, participatingArticleDnaVersionRefs: graph.participatingArticleDnaVersionRefs, nodes: graph.nodes, edges: graph.edges, warnings: graph.warnings, conflicts: graph.conflicts });
  assert.equal(structuralHash, graph.contentHash);
});

test("a relação inferida respeita os endpoints do contrato sem aceitar SiloPage→SiloPage ou Pilar→Pilar", () => {
  const pillar = { nodeType: "ARTICLE_DNA" as const, architecturalRole: "PILAR" as const };
  const support = { nodeType: "ARTICLE_DNA" as const, architecturalRole: "SUPORTE" as const };
  const siloPage = { nodeType: "SILO_PAGE" as const, architecturalRole: null };
  assert.equal(inferInternalLinkGraphRelationType(pillar, support), "PILLAR_TO_SUPPORT");
  assert.equal(inferInternalLinkGraphRelationType(support, pillar), "SUPPORT_TO_PILLAR");
  assert.equal(inferInternalLinkGraphRelationType(support, support), "SUPPORT_TO_SUPPORT");
  assert.equal(inferInternalLinkGraphRelationType(siloPage, support), "SILO_PAGE_TO_ARTICLE");
  assert.equal(inferInternalLinkGraphRelationType(siloPage, siloPage), null);
  assert.equal(inferInternalLinkGraphRelationType(pillar, pillar), null);
  assert.equal(isInternalLinkGraphRelationCompatible(pillar, support, "PILLAR_TO_SUPPORT"), true);
  assert.equal(isInternalLinkGraphRelationCompatible(pillar, support, "SUPPORT_TO_SUPPORT"), false);
});
