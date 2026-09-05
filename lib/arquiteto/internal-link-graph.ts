import {
  InternalLinkGraphEdgeSchema,
  InternalLinkGraphNodeSchema,
  InternalLinkGraphProposalSchema,
  InternalLinkGraphRefSchema,
  InternalLinkGraphSchema,
  InternalLinkGraphStructuralPayloadSchema,
  InternalLinkGraphWorkingCopySchema,
  type InternalLinkGraph,
  type InternalLinkGraphEdge,
  type InternalLinkGraphNode,
  type InternalLinkGraphProposal,
  type InternalLinkGraphRef,
  type InternalLinkGraphStructuralPayload,
  type InternalLinkGraphWorkingCopy,
  type VersionReference,
} from "./contracts.ts";
import { contentHash } from "./versioning.ts";

export class InternalLinkGraphError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "InternalLinkGraphError";
  }
}

/**
 * Maps the real node roles to the relation vocabulary already defined by the
 * graph contract. A null result means that the endpoints do not describe a
 * relation the Arquiteto can create.
 */
export function inferInternalLinkGraphRelationType(
  source: Pick<InternalLinkGraphNode, "nodeType" | "architecturalRole">,
  target: Pick<InternalLinkGraphNode, "nodeType" | "architecturalRole">,
): InternalLinkGraph["edges"][number]["relationType"] | null {
  if (source.nodeType === "SILO_PAGE" && target.nodeType === "ARTICLE_DNA") return "SILO_PAGE_TO_ARTICLE";
  if (source.nodeType === "ARTICLE_DNA" && target.nodeType === "SILO_PAGE") return "ARTICLE_TO_SILO_PAGE";
  if (source.nodeType !== "ARTICLE_DNA" || target.nodeType !== "ARTICLE_DNA") return null;
  const sourceIsPillar = source.architecturalRole === "PILAR";
  const targetIsPillar = target.architecturalRole === "PILAR";
  if (sourceIsPillar && !targetIsPillar) return "PILLAR_TO_SUPPORT";
  if (!sourceIsPillar && targetIsPillar) return "SUPPORT_TO_PILLAR";
  if (!sourceIsPillar && !targetIsPillar) return "SUPPORT_TO_SUPPORT";
  return null;
}

export function isInternalLinkGraphRelationCompatible(
  source: Pick<InternalLinkGraphNode, "nodeType" | "architecturalRole">,
  target: Pick<InternalLinkGraphNode, "nodeType" | "architecturalRole">,
  relationType: InternalLinkGraph["edges"][number]["relationType"],
) {
  return inferInternalLinkGraphRelationType(source, target) === relationType;
}

function referenceKey(reference: VersionReference) {
  return `${reference.entityId}\u0000${reference.versionId}\u0000${reference.contentHash}`;
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right, "en");
}

function sortedReference(reference: VersionReference): VersionReference {
  return { entityId: reference.entityId, versionId: reference.versionId, contentHash: reference.contentHash };
}

function sortedReferences(references: readonly VersionReference[]) {
  return references.map(sortedReference).sort((left, right) => referenceKey(left).localeCompare(referenceKey(right), "en"));
}

function normalizeNode(node: InternalLinkGraphNode): InternalLinkGraphNode {
  const parsed = InternalLinkGraphNodeSchema.parse(node);
  return {
    ...parsed,
    articleDnaVersionRef: parsed.articleDnaVersionRef ? sortedReference(parsed.articleDnaVersionRef) : null,
    siloPageVersionRef: parsed.siloPageVersionRef ? sortedReference(parsed.siloPageVersionRef) : null,
    snapshot: { label: parsed.snapshot.label, siloId: parsed.snapshot.siloId },
  };
}

function normalizeEdge(edge: InternalLinkGraphEdge): InternalLinkGraphEdge {
  const parsed = InternalLinkGraphEdgeSchema.parse(edge);
  return {
    ...parsed,
    anchorConcepts: [...new Set(parsed.anchorConcepts.map(concept => concept.trim()).filter(Boolean))].sort(compareStrings),
    provenance: { source: parsed.provenance.source, references: [...new Set(parsed.provenance.references)].sort(compareStrings) },
  };
}

export function normalizeInternalLinkGraphPayload(input: InternalLinkGraphStructuralPayload): InternalLinkGraphStructuralPayload {
  const parsed = InternalLinkGraphStructuralPayloadSchema.parse(input);
  return {
    ...parsed,
    baseSiloDnaVersionRef: sortedReference(parsed.baseSiloDnaVersionRef),
    baseSiloPageVersionRef: sortedReference(parsed.baseSiloPageVersionRef),
    participatingArticleDnaVersionRefs: sortedReferences(parsed.participatingArticleDnaVersionRefs),
    nodes: parsed.nodes.map(normalizeNode).sort((left, right) => {
      const leftKey = `${left.nodeType}\u0000${left.nodeId}`;
      const rightKey = `${right.nodeType}\u0000${right.nodeId}`;
      return leftKey.localeCompare(rightKey, "en");
    }),
    edges: parsed.edges.map(normalizeEdge).sort((left, right) => {
      const leftKey = `${left.sourceNodeId}\u0000${left.targetNodeId}\u0000${left.relationType}`;
      const rightKey = `${right.sourceNodeId}\u0000${right.targetNodeId}\u0000${right.relationType}`;
      return leftKey.localeCompare(rightKey, "en");
    }),
    warnings: [...new Set(parsed.warnings)].sort(compareStrings),
    conflicts: [...new Set(parsed.conflicts)].sort(compareStrings),
  };
}

function hashableStructuralPayload(payload: InternalLinkGraphStructuralPayload) {
  const normalized = normalizeInternalLinkGraphPayload(payload);
  return {
    schemaVersion: 1,
    brandId: normalized.brandId,
    graphId: normalized.graphId,
    siloId: normalized.siloId,
    baseSiloDnaVersionRef: normalized.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: normalized.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: normalized.participatingArticleDnaVersionRefs,
    nodes: normalized.nodes.map(node => ({
      nodeId: node.nodeId,
      brandId: node.brandId,
      nodeType: node.nodeType,
      articleDnaVersionRef: node.articleDnaVersionRef,
      siloPageVersionRef: node.siloPageVersionRef,
      architecturalRole: node.architecturalRole,
      snapshot: node.snapshot,
    })),
    edges: normalized.edges.map(edge => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relationType: edge.relationType,
      reason: edge.reason,
      priority: edge.priority,
      anchorConcepts: edge.anchorConcepts,
      origin: edge.origin,
      provenance: edge.provenance,
    })),
  };
}

export async function hashInternalLinkGraphContent(payload: InternalLinkGraphStructuralPayload) {
  return contentHash(hashableStructuralPayload(payload));
}

export async function hashInternalLinkGraphBasis(input: Pick<InternalLinkGraphStructuralPayload, "brandId" | "siloId" | "baseSiloDnaVersionRef" | "baseSiloPageVersionRef" | "participatingArticleDnaVersionRefs">) {
  return contentHash({
    brandId: input.brandId,
    siloId: input.siloId,
    baseSiloDnaVersionRef: sortedReference(input.baseSiloDnaVersionRef),
    baseSiloPageVersionRef: sortedReference(input.baseSiloPageVersionRef),
    participatingArticleDnaVersionRefs: sortedReferences(input.participatingArticleDnaVersionRefs),
  });
}

function assertGraphIdentity(payload: InternalLinkGraphStructuralPayload) {
  if (payload.baseSiloDnaVersionRef.entityId !== payload.siloId) {
    throw new InternalLinkGraphError("SILO_DNA_MISMATCH", "A base do grafo precisa ser um SiloDNA do mesmo Silo.");
  }
  if (payload.baseSiloPageVersionRef.entityId !== `silo-page:${payload.siloId}`) {
    throw new InternalLinkGraphError("SILO_PAGE_MISMATCH", "A base do grafo precisa ser a SiloPage do mesmo Silo.");
  }
  for (const node of payload.nodes) {
    if (node.brandId !== payload.brandId) throw new InternalLinkGraphError("BRAND_MISMATCH", "Todos os nós precisam pertencer à Brand do grafo.");
  }
  const articleRefs = new Set(payload.participatingArticleDnaVersionRefs.map(reference => reference.versionId));
  const articleNodes = payload.nodes
    .map(node => node.articleDnaVersionRef)
    .filter((reference): reference is VersionReference => Boolean(reference));
  if (articleNodes.some(reference => !articleRefs.has(reference.versionId))) {
    throw new InternalLinkGraphError("ARTICLE_NOT_PARTICIPATING", "Todo ArticleDNA do grafo precisa estar na lista de participantes.");
  }
}

export async function createInternalLinkGraph(input: {
  graphVersionId?: string;
  graphId: string;
  brandId: string;
  siloId: string;
  baseSiloDnaVersionRef: VersionReference;
  baseSiloPageVersionRef: VersionReference;
  participatingArticleDnaVersionRefs: VersionReference[];
  versionNumber: number;
  previousVersionId?: string | null;
  workflowStatus?: InternalLinkGraph["workflowStatus"];
  createdBy: string;
  createdAt?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  metadata?: Record<string, unknown>;
  nodes: InternalLinkGraphNode[];
  edges: InternalLinkGraphEdge[];
  warnings?: string[];
  conflicts?: string[];
}) {
  const payload = normalizeInternalLinkGraphPayload({
    brandId: input.brandId,
    graphId: input.graphId,
    siloId: input.siloId,
    baseSiloDnaVersionRef: input.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: input.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: input.participatingArticleDnaVersionRefs,
    nodes: input.nodes,
    edges: input.edges,
    warnings: input.warnings || [],
    conflicts: input.conflicts || [],
  });
  assertGraphIdentity(payload);
  const workflowStatus = input.workflowStatus || "draft";
  const graph = InternalLinkGraphSchema.parse({
    schemaVersion: 1,
    graphVersionId: input.graphVersionId || crypto.randomUUID(),
    graphId: input.graphId,
    brandId: input.brandId,
    siloId: input.siloId,
    baseSiloDnaVersionRef: payload.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: payload.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: payload.participatingArticleDnaVersionRefs,
    versionNumber: input.versionNumber,
    previousVersionId: input.previousVersionId ?? null,
    workflowStatus,
    basisHash: await hashInternalLinkGraphBasis(payload),
    contentHash: await hashInternalLinkGraphContent(payload),
    createdBy: input.createdBy,
    createdAt: input.createdAt || new Date().toISOString(),
    approvedBy: input.approvedBy ?? null,
    approvedAt: input.approvedAt ?? null,
    metadata: input.metadata || {},
    nodes: payload.nodes,
    edges: payload.edges,
    warnings: payload.warnings,
    conflicts: payload.conflicts,
  });
  return graph;
}

export async function createInternalLinkGraphWorkingCopy(input: {
  workingCopyId?: string;
  graphId: string;
  brandId: string;
  siloId: string;
  baseGraphVersionId?: string | null;
  baseGraphContentHash?: string | null;
  baseSiloDnaVersionRef: VersionReference;
  baseSiloPageVersionRef: VersionReference;
  participatingArticleDnaVersionRefs: VersionReference[];
  nodes: InternalLinkGraphNode[];
  edges: InternalLinkGraphEdge[];
  warnings?: string[];
  conflicts?: string[];
  metadata?: Record<string, unknown>;
  createdBy: string;
  now?: string;
  lockVersion?: number;
}) {
  const payload = normalizeInternalLinkGraphPayload({
    brandId: input.brandId,
    graphId: input.graphId,
    siloId: input.siloId,
    baseSiloDnaVersionRef: input.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: input.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: input.participatingArticleDnaVersionRefs,
    nodes: input.nodes,
    edges: input.edges,
    warnings: input.warnings || [],
    conflicts: input.conflicts || [],
  });
  assertGraphIdentity(payload);
  const now = input.now || new Date().toISOString();
  return InternalLinkGraphWorkingCopySchema.parse({
    schemaVersion: 1,
    workingCopyId: input.workingCopyId || crypto.randomUUID(),
    graphId: input.graphId,
    brandId: input.brandId,
    siloId: input.siloId,
    baseGraphVersionId: input.baseGraphVersionId ?? null,
    baseGraphContentHash: input.baseGraphContentHash ?? null,
    baseSiloDnaVersionRef: payload.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: payload.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: payload.participatingArticleDnaVersionRefs,
    basisHash: await hashInternalLinkGraphBasis(payload),
    contentHash: await hashInternalLinkGraphContent(payload),
    createdBy: input.createdBy,
    createdAt: now,
    updatedBy: input.createdBy,
    updatedAt: now,
    lockVersion: input.lockVersion || 1,
    metadata: input.metadata || {},
    nodes: payload.nodes,
    edges: payload.edges,
    warnings: payload.warnings,
    conflicts: payload.conflicts,
  });
}

export async function updateInternalLinkGraphWorkingCopy(input: {
  previous: InternalLinkGraphWorkingCopy;
  changes: Partial<Pick<InternalLinkGraphStructuralPayload, "baseSiloDnaVersionRef" | "baseSiloPageVersionRef" | "participatingArticleDnaVersionRefs" | "nodes" | "edges" | "warnings" | "conflicts">> & { metadata?: Record<string, unknown>; baseGraphVersionId?: string | null; baseGraphContentHash?: string | null };
  actorId: string;
  now?: string;
}) {
  const previous = InternalLinkGraphWorkingCopySchema.parse(input.previous);
  const payload = normalizeInternalLinkGraphPayload({
    brandId: previous.brandId,
    graphId: previous.graphId,
    siloId: previous.siloId,
    baseSiloDnaVersionRef: input.changes.baseSiloDnaVersionRef || previous.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: input.changes.baseSiloPageVersionRef || previous.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: input.changes.participatingArticleDnaVersionRefs || previous.participatingArticleDnaVersionRefs,
    nodes: input.changes.nodes || previous.nodes,
    edges: input.changes.edges || previous.edges,
    warnings: input.changes.warnings || previous.warnings,
    conflicts: input.changes.conflicts || previous.conflicts,
  });
  assertGraphIdentity(payload);
  const baseGraphVersionId = input.changes.baseGraphVersionId === undefined ? previous.baseGraphVersionId : input.changes.baseGraphVersionId;
  const baseGraphContentHash = input.changes.baseGraphContentHash === undefined ? previous.baseGraphContentHash : input.changes.baseGraphContentHash;
  return InternalLinkGraphWorkingCopySchema.parse({
    ...previous,
    baseGraphVersionId,
    baseGraphContentHash,
    baseSiloDnaVersionRef: payload.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: payload.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: payload.participatingArticleDnaVersionRefs,
    basisHash: await hashInternalLinkGraphBasis(payload),
    contentHash: await hashInternalLinkGraphContent(payload),
    updatedBy: input.actorId,
    updatedAt: input.now || new Date().toISOString(),
    lockVersion: previous.lockVersion + 1,
    metadata: input.changes.metadata === undefined ? previous.metadata : input.changes.metadata,
    nodes: payload.nodes,
    edges: payload.edges,
    warnings: payload.warnings,
    conflicts: payload.conflicts,
  });
}

export async function createInternalLinkGraphSuccessor(input: {
  previous: InternalLinkGraph;
  changes: Partial<Pick<InternalLinkGraphStructuralPayload, "baseSiloDnaVersionRef" | "baseSiloPageVersionRef" | "participatingArticleDnaVersionRefs" | "nodes" | "edges" | "warnings" | "conflicts">>;
  actorId: string;
  reason: string;
  now?: string;
  workflowStatus?: InternalLinkGraph["workflowStatus"];
}) {
  const previous = InternalLinkGraphSchema.parse(input.previous);
  const payload = normalizeInternalLinkGraphPayload({
    brandId: previous.brandId,
    graphId: previous.graphId,
    siloId: previous.siloId,
    baseSiloDnaVersionRef: input.changes.baseSiloDnaVersionRef || previous.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: input.changes.baseSiloPageVersionRef || previous.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: input.changes.participatingArticleDnaVersionRefs || previous.participatingArticleDnaVersionRefs,
    nodes: input.changes.nodes || previous.nodes,
    edges: input.changes.edges || previous.edges,
    warnings: input.changes.warnings || previous.warnings,
    conflicts: input.changes.conflicts || previous.conflicts,
  });
  assertGraphIdentity(payload);
  const nextContentHash = await hashInternalLinkGraphContent(payload);
  if (nextContentHash === previous.contentHash) throw new InternalLinkGraphError("UNCHANGED_GRAPH", "Nenhuma mudança estrutural criou uma nova versão do grafo.");
  return createInternalLinkGraph({
    ...payload,
    versionNumber: previous.versionNumber + 1,
    previousVersionId: previous.graphVersionId,
    workflowStatus: input.workflowStatus || "draft",
    createdBy: input.actorId,
    createdAt: input.now,
    metadata: previous.metadata,
  });
}

export async function createInternalLinkGraphProposal(input: {
  proposalId?: string;
  graph: InternalLinkGraph;
  nodes: InternalLinkGraphNode[];
  edges: InternalLinkGraphEdge[];
  warnings?: string[];
  conflicts?: string[];
  createdBy: string;
  createdAt?: string;
  aiExecutionRef?: string | null;
}) {
  const graph = InternalLinkGraphSchema.parse(input.graph);
  const payload = normalizeInternalLinkGraphPayload({
    brandId: graph.brandId,
    graphId: graph.graphId,
    siloId: graph.siloId,
    baseSiloDnaVersionRef: graph.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: graph.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: graph.participatingArticleDnaVersionRefs,
    nodes: input.nodes,
    edges: input.edges,
    warnings: input.warnings || [],
    conflicts: input.conflicts || [],
  });
  assertGraphIdentity(payload);
  const outputHash = await hashInternalLinkGraphContent(payload);
  const proposal = InternalLinkGraphProposalSchema.parse({
    schemaVersion: 1,
    proposalId: input.proposalId || crypto.randomUUID(),
    graphId: graph.graphId,
    brandId: graph.brandId,
    baseGraphVersionId: graph.graphVersionId,
    baseGraphContentHash: graph.contentHash,
    inputHash: await contentHash({ graphVersionId: graph.graphVersionId, graphContentHash: graph.contentHash, basisHash: graph.basisHash }),
    outputHash,
    payload: { nodes: payload.nodes, edges: payload.edges, warnings: payload.warnings, conflicts: payload.conflicts },
    reviewStatus: "pending_human",
    createdBy: input.createdBy,
    createdAt: input.createdAt || new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    aiExecutionRef: input.aiExecutionRef ?? null,
  });
  return proposal;
}

export function applyInternalLinkGraphProposal(input: {
  base: InternalLinkGraph;
  proposal: InternalLinkGraphProposal;
  acceptedEdgeIds?: readonly string[];
  rejectedEdgeIds?: readonly string[];
  additionalEdges?: readonly InternalLinkGraphEdge[];
}) {
  const base = InternalLinkGraphSchema.parse(input.base);
  const proposal = InternalLinkGraphProposalSchema.parse(input.proposal);
  if (proposal.brandId !== base.brandId || proposal.graphId !== base.graphId || proposal.baseGraphVersionId !== base.graphVersionId || proposal.baseGraphContentHash !== base.contentHash) {
    throw new InternalLinkGraphError("STALE_PROPOSAL", "A proposta foi criada contra uma versão diferente do grafo.");
  }
  const rejected = new Set(input.rejectedEdgeIds || []);
  const accepted = input.acceptedEdgeIds ? new Set(input.acceptedEdgeIds) : null;
  const proposedEdges = proposal.payload.edges.filter(edge => !rejected.has(edge.edgeId) && (!accepted || accepted.has(edge.edgeId)));
  const proposedKeys = new Set(proposal.payload.edges.map(edge => `${edge.sourceNodeId}\u0000${edge.targetNodeId}`));
  const preservedBaseEdges = base.edges.filter(edge => !proposedKeys.has(`${edge.sourceNodeId}\u0000${edge.targetNodeId}`));
  const additional = (input.additionalEdges || []).map(edge => InternalLinkGraphEdgeSchema.parse(edge));
  const nodes = proposal.payload.nodes.length ? proposal.payload.nodes : base.nodes;
  const edges = [...preservedBaseEdges, ...proposedEdges, ...additional];
  return normalizeInternalLinkGraphPayload({
    brandId: base.brandId,
    graphId: base.graphId,
    siloId: base.siloId,
    baseSiloDnaVersionRef: base.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: base.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: base.participatingArticleDnaVersionRefs,
    nodes,
    edges,
    warnings: proposal.payload.warnings,
    conflicts: proposal.payload.conflicts,
  });
}

export async function isInternalLinkGraphStale(graph: InternalLinkGraph, current: Pick<InternalLinkGraphStructuralPayload, "brandId" | "siloId" | "baseSiloDnaVersionRef" | "baseSiloPageVersionRef" | "participatingArticleDnaVersionRefs">) {
  return graph.basisHash !== await hashInternalLinkGraphBasis({ brandId: current.brandId, siloId: current.siloId, baseSiloDnaVersionRef: current.baseSiloDnaVersionRef, baseSiloPageVersionRef: current.baseSiloPageVersionRef, participatingArticleDnaVersionRefs: current.participatingArticleDnaVersionRefs });
}

export function validateInternalLinkGraphReadback(expected: InternalLinkGraph, actual: unknown) {
  const parsed = InternalLinkGraphSchema.safeParse(actual);
  if (!parsed.success) return ["O grafo retornado não satisfaz o contrato canônico."];
  const issues: string[] = [];
  if (parsed.data.graphVersionId !== expected.graphVersionId) issues.push("graphVersionId divergente.");
  if (parsed.data.graphId !== expected.graphId) issues.push("graphId divergente.");
  if (parsed.data.brandId !== expected.brandId) issues.push("Brand divergente.");
  if (parsed.data.contentHash !== expected.contentHash) issues.push("contentHash divergente.");
  if (parsed.data.basisHash !== expected.basisHash) issues.push("basisHash divergente.");
  if (parsed.data.versionNumber !== expected.versionNumber) issues.push("versionNumber divergente.");
  if (parsed.data.workflowStatus !== expected.workflowStatus) issues.push("workflowStatus divergente.");
  return issues;
}

export function toInternalLinkGraphRef(graph: InternalLinkGraph): InternalLinkGraphRef {
  return InternalLinkGraphRefSchema.parse({
    graphId: graph.graphId,
    graphVersionId: graph.graphVersionId,
    brandId: graph.brandId,
    siloId: graph.siloId,
    baseSiloDnaVersionRef: graph.baseSiloDnaVersionRef,
    baseSiloPageVersionRef: graph.baseSiloPageVersionRef,
    participatingArticleDnaVersionRefs: graph.participatingArticleDnaVersionRefs,
    versionNumber: graph.versionNumber,
    workflowStatus: graph.workflowStatus,
    basisHash: graph.basisHash,
    contentHash: graph.contentHash,
    approvedBy: graph.approvedBy,
    approvedAt: graph.approvedAt,
    nodes: graph.nodes,
    edges: graph.edges,
  });
}
