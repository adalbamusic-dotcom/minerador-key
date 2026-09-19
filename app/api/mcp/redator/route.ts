import type { NextRequest } from "next/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ContentDocumentSchema, ContentBlockSchema } from "@/lib/arquiteto/contracts";
import { runGuardian } from "@/lib/redator/guardian";
import { WriterDeliverablePayloadSchema, WriterMediaBriefSchema } from "@/lib/redator/multiformat-contracts";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { getOperationalClient, mapPersistenceError, OptimisticLockError } from "@/lib/server/editorial-db";
import { listWriterDeliverables, listWriterMedia, registerWriterMediaBrief, saveWriterArticleDraft, saveWriterDeliverable, uploadWriterMediaAsset, WriterDeliverableError } from "@/lib/server/writer-deliverables";
import { recordWriterMcpCall, verifyWriterMcpBearer, WriterMcpAuthError, type WriterMcpScope } from "@/lib/server/writer-mcp-delegation";
import { mcpRuntimeFailure, readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

async function documentRow(brandId: string, documentId: string) {
  const { data, error } = await getOperationalClient().from("content_documents")
    .select("id,article_id,payload,content_hash,lock_version,status,updated_at")
    .eq("marca_id", brandId).eq("id", documentId).maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new Error("document_not_found");
  return { ...data, document: ContentDocumentSchema.parse(data.payload) };
}

export function createWriterServer(delegation: Awaited<ReturnType<typeof verifyWriterMcpBearer>>) {
  const server = new McpServer({ name: "minerador-key-redator", version: "0.1.0" }, {
    instructions: "Leia get_writer_brief e get_writer_document antes de escrever. Preserve as evidências e pendências do Radar. Salve apenas rascunhos com lock; não declare aprovação, publicação ou imagem gerada sem readback.",
  });
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
  const draftAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false } as const;
  const call = async <T>(toolName: string, scope: WriterMcpScope, action: "view" | "edit", documentId: string | undefined, work: () => Promise<T>) => {
    const requestId = crypto.randomUUID();
    try {
      if (!delegation.scopes.includes(scope)) throw new Error("scope_denied");
      await assertEditorialPermission(delegation.profile, delegation.brandId, "redator", action);
      await recordWriterMcpCall({ delegationId: delegation.id, brandId: delegation.brandId, documentId, toolName, resultCode: "attempt", requestId });
      const result = await work();
      await recordWriterMcpCall({ delegationId: delegation.id, brandId: delegation.brandId, documentId, toolName, resultCode: "success", requestId });
      return asText({ ok: true, requestId, result });
    } catch (error) {
      const code = error instanceof OptimisticLockError ? "conflict" : error instanceof WriterDeliverableError ? error.code
        : error instanceof Error && error.message === "scope_denied" ? "scope_denied" : "tool_failed";
      try { await recordWriterMcpCall({ delegationId: delegation.id, brandId: delegation.brandId, documentId, toolName, resultCode: code.slice(0, 100), requestId }); } catch { /* the original error is retained */ }
      return { isError: true, ...asText({ ok: false, requestId, code }) };
    }
  };

  server.registerTool("get_writer_connection_profile", { title: "Identificar conexão do Redator",
    description: "Use quando precisar confirmar qual agência, marca e usuário estão vinculados a esta conexão antes de acessar documentos.",
    inputSchema: z.object({}), annotations: readAnnotations, _meta: { "openai/profile": true } },
  async () => call("get_writer_connection_profile", "writer.read", "view", undefined, async () => ({
    agencyId: delegation.agencyId, brandId: delegation.brandId, actorId: delegation.actorId,
    scopes: delegation.scopes,
  })));

  server.registerTool("list_writer_documents", { title: "Listar documentos do Redator",
    description: "Use quando precisar encontrar os documentos da marca delegada antes de ler ou escrever um artigo.", annotations: readAnnotations,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }) },
  async ({ limit }) => call("list_writer_documents", "writer.read", "view", undefined, async () => {
    const { data, error } = await getOperationalClient().from("content_documents")
      .select("id,article_id,title,status,content_hash,lock_version,updated_at")
      .eq("marca_id", delegation.brandId).order("updated_at", { ascending: false }).limit(limit);
    if (error) mapPersistenceError(error);
    return data || [];
  }));

  server.registerTool("get_writer_document", { title: "Ler documento do Redator", description: "Use para ler blocos, metadados, versão e hash canônicos de um documento antes de editá-lo.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_document", "writer.read", "view", documentId, async () => {
    const row = await documentRow(delegation.brandId, documentId);
    return { document: row.document, contentHash: row.content_hash, lockVersion: row.lock_version, updatedAt: row.updated_at };
  }));

  server.registerTool("get_writer_brief", { title: "Ler briefing do Radar", description: "Use antes de redigir para conferir dossiê, evidências, instruções e pendências do artigo, sem inventar ausências.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_brief", "writer.read", "view", documentId, async () => {
    const { document, content_hash } = await documentRow(delegation.brandId, documentId);
    return { documentId, documentHash: content_hash, articleDnaRef: document.articleDnaRef,
      keywordDnaRefs: document.keywordDnaRefs, siloDnaRef: document.siloDnaRef,
      instructions: document.instructions, linkMap: document.linkMap,
      sourceIds: document.sourceIds, evidenceRefs: document.evidenceRefs,
      radarOrigin: document.schemaVersion === 2 ? document.radarOrigin : null,
      dossier: document.schemaVersion === 2 ? document.importedContext.dossier : null,
      pendingDecisions: document.schemaVersion === 2 ? document.importedContext.pendingDecisions : [],
      warning: document.schemaVersion === 2 && !document.importedContext.dossier ? "Dossiê ausente nesta versão; não inferir evidências." : null };
  }));

  server.registerTool("get_writer_guardian", { title: "Analisar com Guardião", description: "Use para verificar o rascunho com análise determinística; esta ferramenta não aprova o documento.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_guardian", "writer.read", "view", documentId, async () => {
    const row = await documentRow(delegation.brandId, documentId);
    return runGuardian(row.document, row.content_hash);
  }));

  server.registerTool("get_writer_deliverables", { title: "Ler roteiros e carrosséis", description: "Use para ler roteiros, carrosséis e briefings de imagem associados ao documento.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_deliverables", "writer.read", "view", documentId, async () => ({
    deliverables: await listWriterDeliverables(delegation.brandId, documentId),
    media: await listWriterMedia(delegation.brandId, documentId),
  })));

  server.registerTool("save_writer_draft", { title: "Salvar rascunho do artigo", description: "Use após ler o documento para salvar apenas seus blocos de rascunho. Exige lock e readback; nunca aprova.", annotations: draftAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1), expectedLockVersion: z.number().int().positive(),
      blocks: z.array(ContentBlockSchema).max(500) }) },
  async ({ documentId, expectedLockVersion, blocks }) => call("save_writer_draft", "writer.draft.write", "edit", documentId, async () =>
    saveWriterArticleDraft({ brandId: delegation.brandId, documentId, expectedLockVersion, blocks, actorId: delegation.actorId })));

  server.registerTool("save_writer_deliverable", { title: "Salvar roteiro ou carrossel", description: "Use para salvar rascunho de roteiro ou carrossel com lock e readback.", annotations: draftAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1), expectedLockVersion: z.number().int().positive().nullable(), payload: WriterDeliverablePayloadSchema }) },
  async ({ documentId, expectedLockVersion, payload }) => call("save_writer_deliverable", "writer.draft.write", "edit", documentId, async () =>
    saveWriterDeliverable({ brandId: delegation.brandId, documentId, expectedLockVersion, payload, actorId: delegation.actorId })));

  server.registerTool("register_media_brief", { title: "Registrar prompt visual", description: "Use para registrar prompt e direção visual; não afirma que a imagem foi gerada ou anexada.", annotations: draftAnnotations,
    inputSchema: WriterMediaBriefSchema.omit({ brandId: true }) },
  async (input) => call("register_media_brief", "writer.media.brief", "edit", input.documentId, async () =>
    registerWriterMediaBrief({ ...input, brandId: delegation.brandId }, delegation.actorId)));

  server.registerTool("attach_media_asset", { title: "Anexar imagem gerada", description: "Use quando houver um PNG, JPEG ou WebP realmente gerado pelo cliente para anexá-lo ao briefing existente. O servidor confere bytes e hash.", annotations: draftAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1), assetId: z.string().uuid(), imageBase64: z.string().min(1).max(14_000_000) }) },
  async ({ documentId, assetId, imageBase64 }) => call("attach_media_asset", "writer.media.brief", "edit", documentId, async () => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length % 4 !== 0) throw new Error("invalid_base64");
    return uploadWriterMediaAsset({ brandId: delegation.brandId, documentId, assetId,
      bytes: Buffer.from(imageBase64, "base64"), actorId: delegation.actorId });
  }));

  return server;
}

async function handle(request: NextRequest) {
  try {
    const runtime = readMcpRuntimeConfig();
    const configurationFailure = mcpRuntimeFailure(runtime);
    if (configurationFailure) throw new WriterMcpAuthError(configurationFailure.code, 503);
    if (!runtime.allowedHosts.includes(request.headers.get("host") || "")) return Response.json({ error: "host_not_allowed" }, { status: 403 });
    const delegation = await verifyWriterMcpBearer(request.headers.get("authorization"));
    if (request.headers.get("origin")) return Response.json({ error: "browser_origin_not_allowed" }, { status: 403 });
    const handler = createMcpHandler(() => createWriterServer(delegation));
    return await handler.fetch(request);
  } catch (error) {
    const status = error instanceof WriterMcpAuthError ? error.status : 503;
    return Response.json({ error: error instanceof WriterMcpAuthError ? error.code : "mcp_unavailable" },
      { status, headers: { "WWW-Authenticate": "Bearer realm=\"minerador-key-redator\"", "Cache-Control": "no-store" } });
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
