import "server-only";

import {
  InternalLinkGraphProposalSchema,
  InternalLinkGraphSchema,
  InternalLinkGraphWorkingCopySchema,
  type InternalLinkGraph,
  type InternalLinkGraphProposal,
  type InternalLinkGraphRef,
  type InternalLinkGraphWorkingCopy,
} from "@/lib/arquiteto/contracts";
import { validateInternalLinkGraphReadback, toInternalLinkGraphRef } from "@/lib/arquiteto/internal-link-graph";
import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { normalizeDatabaseTimestamp } from "./arquiteto-persistence";

type DatabaseRow = Record<string, unknown>;

function isRecord(value: unknown): value is DatabaseRow {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PipelineRuntimeError("INVALID_ARTIFACT", `O readback do grafo não possui ${field}.`, 503);
  }
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function jsonObject(value: unknown, field: string) {
  if (!isRecord(value)) throw new PipelineRuntimeError("INVALID_ARTIFACT", `O readback do grafo possui ${field} inválido.`, 503);
  return value;
}

function jsonArray(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new PipelineRuntimeError("INVALID_ARTIFACT", `O readback do grafo possui ${field} inválido.`, 503);
  return value;
}

type WorkingCopyArtifactExpectation = {
  reference: { entityId: string; versionId: string; contentHash: string };
  artifactType: "article_dna" | "silo_dna" | "silo_page";
  entityId: string;
  sourceVersionId?: string | null;
};

function workingCopyArtifactExpectations(workingCopy: InternalLinkGraphWorkingCopy): WorkingCopyArtifactExpectation[] {
  const expectations: WorkingCopyArtifactExpectation[] = [
    {
      reference: workingCopy.baseSiloDnaVersionRef,
      artifactType: "silo_dna",
      entityId: workingCopy.siloId,
    },
    {
      reference: workingCopy.baseSiloPageVersionRef,
      artifactType: "silo_page",
      entityId: `silo-page:${workingCopy.siloId}`,
      sourceVersionId: workingCopy.baseSiloDnaVersionRef.versionId,
    },
    ...workingCopy.participatingArticleDnaVersionRefs.map(reference => ({
      reference,
      artifactType: "article_dna" as const,
      entityId: reference.entityId,
    })),
  ];

  for (const node of workingCopy.nodes) {
    const reference = node.nodeType === "ARTICLE_DNA" ? node.articleDnaVersionRef : node.siloPageVersionRef;
    if (!reference) {
      throw new PipelineRuntimeError("INVALID_ARTIFACT", "A working copy possui um nó sem referência editorial.", 403);
    }
    expectations.push({
      reference,
      artifactType: node.nodeType === "ARTICLE_DNA" ? "article_dna" : "silo_page",
      entityId: node.nodeType === "ARTICLE_DNA" ? reference.entityId : `silo-page:${workingCopy.siloId}`,
      sourceVersionId: node.nodeType === "SILO_PAGE" ? workingCopy.baseSiloDnaVersionRef.versionId : undefined,
    });
  }

  return expectations;
}

async function assertWorkingCopyArtifactReferences(context: PipelineContext, workingCopy: InternalLinkGraphWorkingCopy) {
  if (workingCopy.nodes.some(node => node.brandId !== workingCopy.brandId)) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "A working copy possui um nó fora da Brand da sessão.", 403);
  }

  const expectations = workingCopyArtifactExpectations(workingCopy);
  const versionIds = [...new Set(expectations.map(expectation => expectation.reference.versionId))];
  const result = await context.supabase
    .from("editorial_artifact_versions")
    .select("version_id, entity_id, marca_id, artifact_type, content_hash, source_version_id")
    .eq("marca_id", context.brandId)
    .in("version_id", versionIds);
  if (result.error) throw pipelineErrorFromSupabase(result.error);

  const rows = new Map<string, DatabaseRow>(((result.data || []) as DatabaseRow[]).map(row => [String(row.version_id), row]));
  const invalid = expectations.find(expectation => {
    const row = rows.get(expectation.reference.versionId);
    return !row
      || row.marca_id !== context.brandId
      || row.artifact_type !== expectation.artifactType
      || row.entity_id !== expectation.entityId
      || row.content_hash !== expectation.reference.contentHash
      || (expectation.sourceVersionId !== undefined && row.source_version_id !== expectation.sourceVersionId);
  });
  if (invalid) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "A working copy referencia artefatos incompatíveis com a Brand da sessão.", 403);
  }
}

function workingCopyFromRow(row: DatabaseRow): InternalLinkGraphWorkingCopy {
  const payload = jsonObject(row.working_copy_payload, "working_copy_payload");
  return InternalLinkGraphWorkingCopySchema.parse({
    ...payload,
    schemaVersion: 1,
    workingCopyId: requiredString(row.working_copy_id, "working_copy_id"),
    graphId: requiredString(row.graph_id, "graph_id"),
    brandId: requiredString(row.marca_id, "marca_id"),
    siloId: requiredString(row.silo_id, "silo_id"),
    baseGraphVersionId: optionalString(row.base_graph_version_id),
    baseGraphContentHash: optionalString(row.base_graph_content_hash) as `sha256:${string}` | null,
    basisHash: requiredString(row.basis_hash, "basis_hash") as `sha256:${string}`,
    contentHash: requiredString(row.content_hash, "content_hash") as `sha256:${string}`,
    createdBy: requiredString(row.created_by, "created_by"),
    createdAt: requiredString(normalizeDatabaseTimestamp(row.created_at), "created_at"),
    updatedBy: requiredString(row.updated_by, "updated_by"),
    updatedAt: requiredString(normalizeDatabaseTimestamp(row.updated_at), "updated_at"),
    lockVersion: Number(row.lock_version),
  });
}

function versionRef(entityId: string, versionId: unknown, contentHash: unknown, field: string) {
  return {
    entityId,
    versionId: requiredString(versionId, `${field}.versionId`),
    contentHash: requiredString(contentHash, `${field}.contentHash`) as `sha256:${string}`,
  };
}

function graphFromRows(parent: DatabaseRow, nodeRows: DatabaseRow[], edgeRows: DatabaseRow[], artifactEntities: ReadonlyMap<string, string>) : InternalLinkGraph {
  const brandId = requiredString(parent.marca_id, "marca_id");
  const siloId = requiredString(parent.silo_id, "silo_id");
  const participating = jsonArray(parent.participating_article_dna_version_refs, "participating_article_dna_version_refs");
  const nodes = nodeRows.map(node => {
    const articleVersionId = optionalString(node.article_dna_version_id);
    const pageVersionId = optionalString(node.silo_page_version_id);
    return {
      nodeId: requiredString(node.node_id, "node_id"),
      brandId,
      nodeType: requiredString(node.node_type, "node_type") as "SILO_PAGE" | "ARTICLE_DNA",
      articleDnaVersionRef: articleVersionId ? versionRef(requiredString(artifactEntities.get(articleVersionId), "articleDnaVersionRef.entityId"), articleVersionId, node.article_dna_content_hash, "articleDnaVersionRef") : null,
      siloPageVersionRef: pageVersionId ? versionRef(requiredString(artifactEntities.get(pageVersionId), "siloPageVersionRef.entityId"), pageVersionId, node.silo_page_content_hash, "siloPageVersionRef") : null,
      architecturalRole: optionalString(node.architectural_role) as "PILAR" | "SUPORTE" | "REFORCO" | "OUTRO" | null,
      snapshot: jsonObject(node.snapshot, "snapshot") as { label: string | null; siloId: string | null },
    };
  });
  const edges = edgeRows.map(edge => ({
    edgeId: requiredString(edge.edge_id, "edge_id"),
    sourceNodeId: requiredString(edge.source_node_id, "source_node_id"),
    targetNodeId: requiredString(edge.target_node_id, "target_node_id"),
    relationType: requiredString(edge.relation_type, "relation_type") as InternalLinkGraph["edges"][number]["relationType"],
    reason: requiredString(edge.reason, "reason"),
    priority: requiredString(edge.priority, "priority") as "HIGH" | "MEDIUM" | "LOW",
    anchorConcepts: jsonArray(edge.anchor_concepts, "anchor_concepts") as string[],
    origin: requiredString(edge.origin, "origin") as "human" | "ai" | "system",
    createdBy: requiredString(edge.created_by, "created_by"),
    createdAt: requiredString(normalizeDatabaseTimestamp(edge.created_at), "created_at"),
    provenance: jsonObject(edge.provenance, "provenance") as { source: string; references: string[] },
  }));
  return InternalLinkGraphSchema.parse({
    schemaVersion: 1,
    graphVersionId: requiredString(parent.graph_version_id, "graph_version_id"),
    graphId: requiredString(parent.graph_id, "graph_id"),
    brandId,
    siloId,
    baseSiloDnaVersionRef: versionRef(siloId, parent.base_silo_dna_version_id, parent.base_silo_dna_content_hash, "baseSiloDnaVersionRef"),
    baseSiloPageVersionRef: versionRef(`silo-page:${siloId}`, parent.base_silo_page_version_id, parent.base_silo_page_content_hash, "baseSiloPageVersionRef"),
    participatingArticleDnaVersionRefs: participating,
    versionNumber: Number(parent.version_number),
    previousVersionId: optionalString(parent.previous_graph_version_id),
    workflowStatus: requiredString(parent.workflow_status, "workflow_status") as InternalLinkGraph["workflowStatus"],
    basisHash: requiredString(parent.basis_hash, "basis_hash") as `sha256:${string}`,
    contentHash: requiredString(parent.content_hash, "content_hash") as `sha256:${string}`,
    createdBy: requiredString(parent.created_by, "created_by"),
    createdAt: requiredString(normalizeDatabaseTimestamp(parent.created_at), "created_at"),
    approvedBy: optionalString(parent.approved_by),
    approvedAt: optionalString(normalizeDatabaseTimestamp(parent.approved_at)),
    metadata: jsonObject(parent.metadata, "metadata"),
    nodes,
    edges,
    warnings: jsonArray(parent.warnings, "warnings") as string[],
    conflicts: jsonArray(parent.conflicts, "conflicts") as string[],
  });
}

async function readGraphRows(context: PipelineContext, graphVersionId: string) {
  const parentResult = await context.supabase
    .from("internal_link_graphs")
    .select("*")
    .eq("marca_id", context.brandId)
    .eq("graph_version_id", graphVersionId)
    .maybeSingle();
  if (parentResult.error) throw pipelineErrorFromSupabase(parentResult.error);
  if (!parentResult.data) return null;

  const [nodesResult, edgesResult] = await Promise.all([
    context.supabase.from("internal_link_graph_nodes").select("*").eq("marca_id", context.brandId).eq("graph_version_id", graphVersionId).order("node_id", { ascending: true }),
    context.supabase.from("internal_link_graph_edges").select("*").eq("marca_id", context.brandId).eq("graph_version_id", graphVersionId).order("edge_id", { ascending: true }),
  ]);
  if (nodesResult.error) throw pipelineErrorFromSupabase(nodesResult.error);
  if (edgesResult.error) throw pipelineErrorFromSupabase(edgesResult.error);
  const referenceIds = [...new Set((nodesResult.data || []).flatMap(row => [row.article_dna_version_id, row.silo_page_version_id].filter((value): value is string => typeof value === "string" && value.length > 0)))];
  const artifactsResult = referenceIds.length
    ? await context.supabase.from("editorial_artifact_versions").select("version_id,entity_id").eq("marca_id", context.brandId).in("version_id", referenceIds)
    : { data: [], error: null };
  if (artifactsResult.error) throw pipelineErrorFromSupabase(artifactsResult.error);
  const artifactEntities = new Map<string, string>((artifactsResult.data || []).map(row => [String(row.version_id), String(row.entity_id)]));
  return {
    parent: parentResult.data as DatabaseRow,
    nodes: (nodesResult.data || []) as DatabaseRow[],
    edges: (edgesResult.data || []) as DatabaseRow[],
    artifactEntities,
  };
}

export async function readInternalLinkGraph(context: PipelineContext, graphVersionId: string) {
  const rows = await readGraphRows(context, graphVersionId);
  if (!rows) return null;
  const graph = graphFromRows(rows.parent, rows.nodes, rows.edges, rows.artifactEntities);
  if (graph.brandId !== context.brandId) throw new PipelineRuntimeError("INVALID_ARTIFACT", "O grafo retornado pertence a outra Brand.", 503);
  return graph;
}

export async function listInternalLinkGraphs(context: PipelineContext, graphId?: string) {
  let query = context.supabase
    .from("internal_link_graphs")
    .select("graph_version_id")
    .eq("marca_id", context.brandId)
    .order("version_number", { ascending: false });
  if (graphId) query = query.eq("graph_id", graphId);
  const result = await query;
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const graphs: InternalLinkGraph[] = [];
  for (const row of (result.data || []) as DatabaseRow[]) {
    const graph = await readInternalLinkGraph(context, requiredString(row.graph_version_id, "graph_version_id"));
    if (graph) graphs.push(graph);
  }
  return graphs;
}

export async function persistInternalLinkGraph(context: PipelineContext, graph: InternalLinkGraph) {
  const parsed = InternalLinkGraphSchema.parse(graph);
  if (parsed.brandId !== context.brandId || parsed.createdBy !== context.actorUserId) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "O grafo precisa pertencer à Brand e ao ator da sessão.", 403);
  }
  const result = await context.supabase.rpc("persist_internal_link_graph", {
    p_marca_id: context.brandId,
    p_actor_user_id: context.actorUserId,
    p_action: context.action,
    p_graph: parsed,
  });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const readback = await readInternalLinkGraph(context, parsed.graphVersionId);
  if (!readback) throw new PipelineRuntimeError("QUERY_FAILURE", "O grafo não foi confirmado no readback canônico.", 503);
  const issues = validateInternalLinkGraphReadback(parsed, readback);
  if (issues.length) throw new PipelineRuntimeError("INVALID_ARTIFACT", `O readback do grafo divergiu: ${issues.join(" ")}`, 503);
  return { status: "PERSISTED" as const, graph: readback, ref: toInternalLinkGraphRef(readback), source: "CANONICAL_REMOTE" as const };
}

export async function readInternalLinkGraphWorkingCopy(context: PipelineContext, graphId: string) {
  const result = await context.supabase
    .from("internal_link_graph_working_copies")
    .select("*")
    .eq("marca_id", context.brandId)
    .eq("graph_id", graphId)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return result.data ? workingCopyFromRow(result.data as DatabaseRow) : null;
}

export async function persistInternalLinkGraphWorkingCopy(context: PipelineContext, workingCopy: InternalLinkGraphWorkingCopy) {
  const parsed = InternalLinkGraphWorkingCopySchema.parse(workingCopy);
  if (parsed.brandId !== context.brandId || parsed.updatedBy !== context.actorUserId) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "A working copy precisa pertencer à Brand e ao ator da sessão.", 403);
  }
  await assertWorkingCopyArtifactReferences(context, parsed);
  const expectedLockVersion = context.action === "create" ? 0 : parsed.lockVersion;
  const result = await context.supabase.rpc("persist_internal_link_graph_working_copy", {
    p_marca_id: context.brandId,
    p_actor_user_id: context.actorUserId,
    p_action: context.action,
    p_expected_lock_version: expectedLockVersion,
    p_working_copy: parsed,
  });
  if (result.error) {
    // O erro bruto fica no log do servidor: a mensagem mapeada nao distingue
    // privilegio de schema de constraint, e sem o original a investigacao vira
    // adivinhacao. Ele nunca vai para a resposta.
    console.error("[internal-link-graph] RPC recusou a working copy", result.error);
    throw pipelineErrorFromSupabase(result.error);
  }
  const readback = await readInternalLinkGraphWorkingCopy(context, parsed.graphId);
  if (!readback) throw new PipelineRuntimeError("QUERY_FAILURE", "A working copy não foi confirmada no readback canônico.", 503);
  if (readback.workingCopyId !== parsed.workingCopyId || readback.brandId !== parsed.brandId || readback.graphId !== parsed.graphId || readback.contentHash !== parsed.contentHash) {
    throw new PipelineRuntimeError("INVALID_ARTIFACT", "O readback da working copy divergiu da estrutura enviada.", 503);
  }
  return { status: "PERSISTED" as const, workingCopy: readback, source: "CANONICAL_REMOTE" as const };
}

function proposalFromRow(row: DatabaseRow): InternalLinkGraphProposal {
  return InternalLinkGraphProposalSchema.parse({
    schemaVersion: 1,
    proposalId: requiredString(row.proposal_id, "proposal_id"),
    graphId: requiredString(row.graph_id, "graph_id"),
    brandId: requiredString(row.marca_id, "marca_id"),
    baseGraphVersionId: requiredString(row.base_graph_version_id, "base_graph_version_id"),
    baseGraphContentHash: requiredString(row.base_graph_content_hash, "base_graph_content_hash"),
    inputHash: requiredString(row.input_hash, "input_hash"),
    outputHash: optionalString(row.output_hash),
    payload: jsonObject(row.proposal_payload, "proposal_payload"),
    reviewStatus: requiredString(row.review_status, "review_status") as InternalLinkGraphProposal["reviewStatus"],
    createdBy: requiredString(row.created_by, "created_by"),
    createdAt: requiredString(normalizeDatabaseTimestamp(row.created_at), "created_at"),
    reviewedBy: optionalString(row.reviewed_by),
    reviewedAt: optionalString(normalizeDatabaseTimestamp(row.reviewed_at)),
    reviewNote: optionalString(row.review_note),
    aiExecutionRef: optionalString(row.ai_execution_ref),
  });
}

export async function persistInternalLinkGraphProposal(context: PipelineContext, proposal: InternalLinkGraphProposal) {
  const parsed = InternalLinkGraphProposalSchema.parse(proposal);
  if (parsed.brandId !== context.brandId || parsed.createdBy !== context.actorUserId) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "A proposta precisa pertencer à Brand e ao ator da sessão.", 403);
  }
  const result = await context.supabase.from("internal_link_graph_proposals").insert({
    proposal_id: parsed.proposalId,
    graph_id: parsed.graphId,
    marca_id: parsed.brandId,
    base_graph_version_id: parsed.baseGraphVersionId,
    base_graph_content_hash: parsed.baseGraphContentHash,
    input_hash: parsed.inputHash,
    output_hash: parsed.outputHash,
    proposal_payload: parsed.payload,
    review_status: parsed.reviewStatus,
    created_by: parsed.createdBy,
    created_at: parsed.createdAt,
    reviewed_by: parsed.reviewedBy,
    reviewed_at: parsed.reviewedAt,
    review_note: parsed.reviewNote,
    ai_execution_ref: parsed.aiExecutionRef,
  }).select("*").single();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  if (!result.data) throw new PipelineRuntimeError("QUERY_FAILURE", "A proposta não foi confirmada no banco.", 503);
  return { status: "PERSISTED" as const, proposal: proposalFromRow(result.data as DatabaseRow), source: "CANONICAL_REMOTE" as const };
}

export async function readInternalLinkGraphProposal(context: PipelineContext, proposalId: string) {
  const result = await context.supabase.from("internal_link_graph_proposals").select("*").eq("marca_id", context.brandId).eq("proposal_id", proposalId).maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return result.data ? proposalFromRow(result.data as DatabaseRow) : null;
}

export async function listInternalLinkGraphProposals(context: PipelineContext, graphId?: string) {
  let query = context.supabase
    .from("internal_link_graph_proposals")
    .select("*")
    .eq("marca_id", context.brandId)
    .order("created_at", { ascending: false });
  if (graphId) query = query.eq("graph_id", graphId);
  const result = await query;
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as DatabaseRow[]).map(proposalFromRow);
}

export async function reviewInternalLinkGraphProposal(
  context: PipelineContext,
  proposalId: string,
  input: { reviewStatus: Exclude<InternalLinkGraphProposal["reviewStatus"], "pending_human">; reviewNote: string | null; reviewedAt?: string },
) {
  const current = await readInternalLinkGraphProposal(context, proposalId);
  if (!current) throw new PipelineRuntimeError("NO_DATA", "A proposta canônica não foi encontrada.", 503);
  if (current.brandId !== context.brandId) throw new PipelineRuntimeError("NOT_AUTHORIZED", "A proposta não pertence à Brand da sessão.", 403);
  const result = await context.supabase.from("internal_link_graph_proposals").update({
    review_status: input.reviewStatus,
    reviewed_by: context.actorUserId,
    reviewed_at: input.reviewedAt || new Date().toISOString(),
    review_note: input.reviewNote,
  }).eq("marca_id", context.brandId).eq("proposal_id", proposalId).select("*").single();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  if (!result.data) throw new PipelineRuntimeError("QUERY_FAILURE", "A revisão da proposta não foi confirmada.", 503);
  return { status: "PERSISTED" as const, proposal: proposalFromRow(result.data as DatabaseRow), source: "CANONICAL_REMOTE" as const };
}

export function internalLinkGraphRefForDownstream(graph: InternalLinkGraph): InternalLinkGraphRef {
  return toInternalLinkGraphRef(graph);
}
