import "server-only";

import {
  InternalLinkGraphProposalSchema,
  InternalLinkGraphSchema,
  InternalLinkGraphWorkingCopySchema,
  SiloDNASchema,
  SiloPageSchema,
  type InternalLinkGraph,
  type InternalLinkGraphProposal,
  type InternalLinkGraphRef,
  type InternalLinkGraphWorkingCopy,
} from "@/lib/arquiteto/contracts";
import { validateInternalLinkGraphReadback, toInternalLinkGraphRef } from "@/lib/arquiteto/internal-link-graph";
import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { listArquitetoArtifactsVigentes, normalizeDatabaseTimestamp } from "./arquiteto-persistence";
import { siloLinkBasisBlocker } from "@/lib/arquiteto/silo-link-mesh";
import { resolvePlannedSiloMembers } from "@/lib/arquiteto/planned-silo-members";
import { loadCurrentPlannedSiloSource } from "./arquiteto-silo-consolidation-adapter";

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

type LinkGraphBasis = Pick<InternalLinkGraphWorkingCopy, "brandId" | "siloId" | "baseSiloDnaVersionRef" | "baseSiloPageVersionRef" | "participatingArticleDnaVersionRefs" | "nodes">;

function workingCopyArtifactExpectations(workingCopy: LinkGraphBasis): WorkingCopyArtifactExpectation[] {
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

export async function assertWorkingCopyArtifactReferences(context: PipelineContext, workingCopy: LinkGraphBasis) {
  if (workingCopy.nodes.some(node => node.brandId !== workingCopy.brandId)) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "A working copy possui um nó fora da Brand da sessão.", 403);
  }

  const expectations = workingCopyArtifactExpectations(workingCopy);
  const versionIds = [...new Set(expectations.map(expectation => expectation.reference.versionId))];
  const result = await context.supabase
    .from("editorial_artifact_versions")
    .select("version_id, entity_id, marca_id, artifact_type, version_number, status, payload, content_hash, source_version_id")
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

  const siloRow = rows.get(workingCopy.baseSiloDnaVersionRef.versionId)!;
  const pageRow = rows.get(workingCopy.baseSiloPageVersionRef.versionId)!;
  const silo = SiloDNASchema.safeParse(siloRow.payload);
  const page = SiloPageSchema.safeParse(pageRow.payload);
  if (!silo.success || !page.success || silo.data.formationStatus !== "formed" || page.data.formationStatus !== "formed") {
    throw new PipelineRuntimeError("CONFLICT", "A estrutura do Silo ainda não pode ser conferida para processar links.", 409);
  }
  const participatingIds = workingCopy.participatingArticleDnaVersionRefs.map(reference => reference.entityId);
  const effective = new Map<string, string>();
  for (let offset = 0; ;) {
    const events = await context.supabase.from("editorial_version_status_events").select("version_id,status,occurred_at,id", { count: "exact" }).in("version_id", versionIds).order("occurred_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 999);
    if (events.error) throw pipelineErrorFromSupabase(events.error);
    if (typeof events.count !== "number") throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível conferir todos os eventos de aprovação dos links.", 503);
    const pageRows = (events.data || []) as DatabaseRow[];
    for (const row of pageRows) if (typeof row.version_id === "string" && typeof row.status === "string") effective.set(row.version_id, row.status);
    offset += pageRows.length;
    if (!pageRows.length && offset < events.count) throw new PipelineRuntimeError("QUERY_FAILURE", "A leitura dos eventos de aprovação dos links ficou incompleta.", 503);
    if (offset >= events.count) break;
  }
  const status = (row: DatabaseRow) => effective.get(String(row.version_id)) ?? (typeof row.status === "string" ? row.status : null);
  const entities = [...new Set(expectations.map(item => item.entityId))];
  const current = new Map<string, DatabaseRow>();
  for (let offset = 0; ;) {
    const latest = await context.supabase.from("editorial_artifact_versions").select("version_id,entity_id,artifact_type,version_number", { count: "exact" }).eq("marca_id", context.brandId).in("entity_id", entities).in("artifact_type", ["silo_dna", "silo_page", "article_dna"]).order("version_id", { ascending: true }).range(offset, offset + 999);
    if (latest.error) throw pipelineErrorFromSupabase(latest.error);
    if (typeof latest.count !== "number") throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível conferir todas as versões da base dos links.", 503);
    const pageRows = (latest.data || []) as DatabaseRow[];
    for (const row of pageRows) {
      const key = `${row.artifact_type}:${row.entity_id}`;
      const previous = current.get(key);
      if (!previous || Number(row.version_number) > Number(previous.version_number)) current.set(key, row);
    }
    offset += pageRows.length;
    if (!pageRows.length && offset < latest.count) throw new PipelineRuntimeError("QUERY_FAILURE", "A leitura das versões da base dos links ficou incompleta.", 503);
    if (offset >= latest.count) break;
  }
  if (expectations.some(item => current.get(`${item.artifactType}:${item.entityId}`)?.version_id !== item.reference.versionId)) {
    throw new PipelineRuntimeError("CONFLICT", "A arquitetura, a página ou algum artigo mudou. Reabra a prévia dos links.", 409);
  }
  let articleReferences: Array<{ articleId: string; articleDnaVersionId: string; articleDnaContentHash: string; role: "Pilar" | "Suporte" }> = silo.data.articleReferences;
  if (silo.data.compositionBasis === "planned_members") {
    const source = silo.data.compositionSourceRef;
    if (!source || !silo.data.territoryRef || !silo.data.brandId) throw new PipelineRuntimeError("CONFLICT", "A estrutura planejada não possui fonte e território completos.", 409);
    // Ler todos os artigos vigentes da marca impede aceitar dois artigos para
    // o mesmo membro apenas porque um deles não veio na seleção da tela.
    const catalog = await listArquitetoArtifactsVigentes(context);
    const baseStatuses = new Map(catalog.statuses.map(item => [item.versionId, item.status]));
    const articleEvents = new Map<string, string>();
    const allIds = catalog.articleDnas.map(item => item.versionId);
    for (let start = 0; start < allIds.length; start += 100) {
      const ids = allIds.slice(start, start + 100);
      const seen = new Set<string>();
      for (let offset = 0; ;) {
        const result = await context.supabase.from("editorial_version_status_events").select("id,version_id,status,occurred_at", { count: "exact" }).in("version_id", ids).order("occurred_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 999);
        if (result.error) throw pipelineErrorFromSupabase(result.error);
        if (typeof result.count !== "number") throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível conferir as aprovações dos membros do Silo.", 503);
        const items = (result.data || []) as DatabaseRow[];
        for (const item of items) {
          if (typeof item.id !== "string" || seen.has(item.id) || typeof item.version_id !== "string" || typeof item.status !== "string") throw new PipelineRuntimeError("QUERY_FAILURE", "A leitura das aprovações dos membros ficou inconsistente.", 503);
          seen.add(item.id);
          articleEvents.set(item.version_id, item.status);
        }
        offset += items.length;
        if (!items.length && offset < result.count) throw new PipelineRuntimeError("QUERY_FAILURE", "A leitura das aprovações dos membros ficou incompleta.", 503);
        if (offset >= result.count) break;
      }
    }
    const sourceCurrent = await loadCurrentPlannedSiloSource(context, source, silo.data.territoryRef, silo.data.siloId);
    const resolved = resolvePlannedSiloMembers({
      brandId: context.brandId,
      silo: { versionId: String(siloRow.version_id), contentHash: String(siloRow.content_hash), effectiveStatus: status(siloRow), current: true, payload: { ...silo.data, brandId: silo.data.brandId } },
      page: { effectiveStatus: status(pageRow), current: true, payload: page.data },
      articles: catalog.articleDnas.map(item => ({ versionId: item.versionId, contentHash: item.contentHash, current: true, effectiveStatus: articleEvents.get(item.versionId) ?? baseStatuses.get(item.versionId) ?? null, payload: item.payload })),
      sourceCurrent,
    });
    if (!resolved.ok) throw new PipelineRuntimeError("CONFLICT", resolved.reasons.join(" "), 409);
    articleReferences = resolved.members.map(({ member, article }) => ({ articleId: article.payload.articleId, articleDnaVersionId: article.versionId, articleDnaContentHash: article.contentHash, role: member.role }));
  }
  const expectedIds = articleReferences.map(reference => reference.articleId);
  if (new Set(expectedIds).size !== expectedIds.length || new Set(participatingIds).size !== participatingIds.length || expectedIds.length !== participatingIds.length || expectedIds.some(id => !participatingIds.includes(id))) {
    throw new PipelineRuntimeError("CONFLICT", "A cópia de links não cobre exatamente os artigos da arquitetura do Silo.", 409);
  }
  for (const node of workingCopy.nodes) {
    if (node.nodeType !== "ARTICLE_DNA") continue;
    const reference = articleReferences.find(item => item.articleId === node.articleDnaVersionRef?.entityId);
    const expectedRole = reference?.role === "Pilar" ? "PILAR" : reference?.role === "Suporte" ? "SUPORTE" : null;
    if (!reference || node.architecturalRole !== expectedRole) throw new PipelineRuntimeError("CONFLICT", "O papel de um artigo no grafo diverge da arquitetura aprovada do Silo.", 409);
  }
  const blocker = siloLinkBasisBlocker({
    brandId: context.brandId,
    silo: { brandId: silo.data.brandId, siloId: silo.data.siloId, entityId: String(siloRow.entity_id), versionId: String(siloRow.version_id), contentHash: String(siloRow.content_hash), status: status(siloRow) },
    page: { brandId: page.data.brandId, siloId: page.data.siloId, status: status(pageRow), siloDnaRef: page.data.siloDnaRef },
    articles: articleReferences.map(reference => {
      const selected = workingCopy.participatingArticleDnaVersionRefs.find(item => item.entityId === reference.articleId)!;
      const row = rows.get(selected.versionId)!;
      const articlePayload = isRecord(row.payload) ? row.payload : {};
      return { expectedVersionId: reference.articleDnaVersionId, expectedContentHash: reference.articleDnaContentHash, brandId: typeof articlePayload.brandId === "string" ? articlePayload.brandId : "", versionId: selected.versionId, contentHash: selected.contentHash, status: status(row) };
    }),
  });
  if (blocker) throw new PipelineRuntimeError("CONFLICT", blocker, 409);
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
  // A confirmação precisa reler a base: aprovações podem ter mudado desde a prévia.
  await assertWorkingCopyArtifactReferences(context, parsed);
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
