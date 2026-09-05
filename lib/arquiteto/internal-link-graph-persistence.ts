import {
  InternalLinkGraphSchema,
  InternalLinkGraphRefSchema,
  InternalLinkGraphWorkingCopySchema,
  type InternalLinkGraph,
  type InternalLinkGraphWorkingCopy,
} from "./contracts.ts";

export class InternalLinkGraphWorkingCopyPersistenceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "InternalLinkGraphWorkingCopyPersistenceError";
  }
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown; data?: unknown } | null;
  if (!response.ok || !body || body.error) {
    throw new InternalLinkGraphWorkingCopyPersistenceError(
      typeof body?.code === "string" && body.code.trim() ? body.code : "QUERY_FAILURE",
      typeof body?.error === "string" ? body.error : "Não foi possível confirmar a working copy canônica.",
    );
  }
  return body;
}

export async function loadInternalLinkGraphWorkingCopy(brandId: string, graphId: string) {
  const response = await fetch(`/api/arquiteto/internal-link-graph/working-copy?brandId=${encodeURIComponent(brandId)}&graphId=${encodeURIComponent(graphId)}`, { cache: "no-store" });
  const body = await readResponse(response) as { data: { workingCopy: unknown } };
  return body.data.workingCopy ? InternalLinkGraphWorkingCopySchema.parse(body.data.workingCopy) : null;
}

export async function loadInternalLinkGraphs(brandId: string, graphId?: string) {
  const params = new URLSearchParams({ brandId });
  if (graphId) params.set("graphId", graphId);
  const response = await fetch(`/api/arquiteto/internal-link-graph?${params.toString()}`, { cache: "no-store" });
  const body = await readResponse(response) as { data: { graphs: unknown } };
  const graphs = Array.isArray(body.data.graphs) ? body.data.graphs : [];
  return graphs.map(graph => InternalLinkGraphSchema.parse(graph));
}

export async function persistInternalLinkGraph(input: {
  brandId: string;
  action: "create" | "edit";
  graph: InternalLinkGraph;
}) {
  const graph = InternalLinkGraphSchema.parse(input.graph);
  const response = await fetch("/api/arquiteto/internal-link-graph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: input.brandId, action: input.action, graph }),
  });
  const body = await readResponse(response) as { data: { graph: unknown; ref?: unknown; source: "CANONICAL_REMOTE"; status: "PERSISTED" } };
  return {
    status: body.data.status,
    source: body.data.source,
    graph: InternalLinkGraphSchema.parse(body.data.graph),
    ref: body.data.ref ? InternalLinkGraphRefSchema.parse(body.data.ref) : null,
  };
}

export async function persistInternalLinkGraphWorkingCopy(input: {
  brandId: string;
  action: "create" | "edit";
  workingCopy: InternalLinkGraphWorkingCopy;
}) {
  const workingCopy = InternalLinkGraphWorkingCopySchema.parse(input.workingCopy);
  const response = await fetch("/api/arquiteto/internal-link-graph/working-copy", {
    method: input.action === "create" ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: input.brandId, workingCopy }),
  });
  const body = await readResponse(response) as { data: { workingCopy: unknown; source: "CANONICAL_REMOTE"; status: "PERSISTED" } };
  return {
    status: body.data.status,
    source: body.data.source,
    workingCopy: InternalLinkGraphWorkingCopySchema.parse(body.data.workingCopy),
  };
}
