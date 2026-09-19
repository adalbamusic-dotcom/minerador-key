import type { NextRequest } from "next/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ContentDocumentSchema, ContentBlockSchema } from "@/lib/arquiteto/contracts";
import { runGuardian } from "@/lib/redator/guardian";
import { WriterDeliverablePayloadSchema, WriterMediaBriefSchema } from "@/lib/redator/multiformat-contracts";
import { requireAgencyAccessToBrand } from "@/lib/server/agency-context";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { getOperationalClient, mapPersistenceError, OptimisticLockError } from "@/lib/server/editorial-db";
import { mcpBearerChallenge } from "@/lib/server/mcp-oauth";
import { mcpRuntimeFailure, readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";
import { listWriterDeliverables, listWriterMedia, registerWriterMediaBrief, saveWriterArticleDraft, saveWriterDeliverable, uploadWriterMediaAsset, WriterDeliverableError } from "@/lib/server/writer-deliverables";
import { recordWriterMcpCall, WriterMcpAuthError, type WriterMcpScope } from "@/lib/server/writer-mcp-delegation";
import { resolveWriterMcpPrincipal, type WriterMcpBrandAccess, type WriterMcpPrincipal } from "@/lib/server/writer-mcp-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

/** Falha de ferramenta com código estável e detalhes que o cliente pode mostrar ao usuário. */
class ToolFailure extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, details: Record<string, unknown> = {}) { super(code); this.code = code; this.details = details; }
}

type DocumentRow = { id: string; marca_id: string; article_id: string; payload: unknown; content_hash: string; lock_version: number; status: string; updated_at: string };

/** Lê pela chave global do documento; a Marca é conferida contra o principal, nunca pelo filtro. */
async function documentRow(documentId: string) {
  const { data, error } = await getOperationalClient().from("content_documents")
    .select("id,marca_id,article_id,payload,content_hash,lock_version,status,updated_at")
    .eq("id", documentId).maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new ToolFailure("document_not_found");
  const row = data as DocumentRow;
  return { ...row, document: ContentDocumentSchema.parse(row.payload) };
}

const brandOptions = (principal: WriterMcpPrincipal) => principal.brands.map((brand) => ({ brandId: brand.brandId, brandName: brand.brandName, scopes: brand.scopes }));

export function createWriterServer(principal: WriterMcpPrincipal) {
  const server = new McpServer({ name: "minerador-key-redator", version: "0.2.0" }, {
    instructions: "Chame get_writer_connection_profile para saber as Marcas autorizadas. Leia get_writer_brief e get_writer_document antes de escrever. Preserve as evidências e pendências do Radar. Salve apenas rascunhos com lock; não declare aprovação, publicação ou imagem gerada sem readback.",
  });
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
  const draftAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false } as const;

  type Target = { brandId?: string | null; documentId?: string };
  type Resolved = { access: WriterMcpBrandAccess; row: Awaited<ReturnType<typeof documentRow>> | null };

  /*
   * A Marca vem do documento quando há documento; senão do parâmetro; senão
   * é implícita só quando o principal tem uma única Marca. Documento fora do
   * grant responde como inexistente, sem revelar que existe noutra Marca.
   */
  const resolveTarget = async (target: Target): Promise<Resolved> => {
    if (!principal.brands.length) throw new ToolFailure("grant_required", { consentUrl: principal.consentUrl, message: "Nenhuma Marca autorizada para esta conexão. Abra o link e escolha as Marcas e permissões." });
    if (target.documentId) {
      const row = await documentRow(target.documentId);
      const access = principal.brands.find((brand) => brand.brandId === row.marca_id);
      if (!access) throw new ToolFailure("document_not_found");
      return { access, row };
    }
    if (target.brandId) {
      const access = principal.brands.find((brand) => brand.brandId === target.brandId);
      if (!access) throw new ToolFailure("brand_not_authorized", { brands: brandOptions(principal) });
      return { access, row: null };
    }
    if (principal.brands.length === 1) return { access: principal.brands[0], row: null };
    throw new ToolFailure("brand_required", { brands: brandOptions(principal), message: "Informe brandId: esta conexão cobre mais de uma Marca." });
  };

  const call = async <T>(toolName: string, scope: WriterMcpScope, action: "view" | "edit", target: Target, work: (resolved: Resolved) => Promise<T>) => {
    const requestId = crypto.randomUUID();
    let resolved: Resolved | null = null;
    const audit = async (resultCode: string) => {
      if (!resolved) return;
      await recordWriterMcpCall({
        delegationId: resolved.access.delegationId, grantId: resolved.access.grantId, brandId: resolved.access.brandId,
        documentId: target.documentId, toolName, resultCode: resultCode.slice(0, 100), requestId,
      });
    };
    try {
      resolved = await resolveTarget(target);
      if (!resolved.access.scopes.includes(scope)) throw new ToolFailure("scope_denied", { scope });
      // Vínculo Agência→Marca ainda vale? Quem consentiu ainda pode agir? Conferido a cada chamada.
      const agency = await requireAgencyAccessToBrand({ brandId: resolved.access.brandId, module: "redator", action, profile: principal.profile });
      if (agency.agency.agencyId !== resolved.access.agencyId) throw new ToolFailure("agency_changed");
      await assertEditorialPermission(principal.profile, resolved.access.brandId, "redator", action);
      await audit("attempt");
      const result = await work(resolved);
      await audit("success");
      return asText({ ok: true, requestId, brandId: resolved.access.brandId, result });
    } catch (error) {
      const code = error instanceof ToolFailure ? error.code
        : error instanceof OptimisticLockError ? "conflict"
        : error instanceof WriterDeliverableError ? error.code
        : "tool_failed";
      const details = error instanceof ToolFailure ? error.details : {};
      try { await audit(code); } catch { /* the original error is retained */ }
      return { isError: true, ...asText({ ok: false, requestId, code, ...details }) };
    }
  };

  server.registerTool("get_writer_connection_profile", { title: "Identificar conexão do Redator",
    description: "Use primeiro: informa usuário, cliente, Marcas autorizadas e permissões desta conexão. Sem Marca autorizada, devolve o link de consentimento.",
    inputSchema: z.object({}), annotations: readAnnotations, _meta: { "openai/profile": true } },
  async () => asText({
    ok: true,
    authMode: principal.authMode,
    actorId: principal.actorId,
    oauthClientId: principal.oauthClientId,
    clientName: principal.clientName,
    brands: brandOptions(principal),
    grantRequired: principal.brands.length === 0,
    consentUrl: principal.consentUrl,
  }));

  server.registerTool("list_writer_documents", { title: "Listar documentos do Redator",
    description: "Use quando precisar encontrar os documentos de uma Marca autorizada antes de ler ou escrever. Com mais de uma Marca, informe brandId.", annotations: readAnnotations,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20), brandId: z.string().uuid().optional() }) },
  async ({ limit, brandId }) => call("list_writer_documents", "writer.read", "view", { brandId }, async ({ access }) => {
    const { data, error } = await getOperationalClient().from("content_documents")
      .select("id,marca_id,article_id,title,status,content_hash,lock_version,updated_at")
      .eq("marca_id", access.brandId).order("updated_at", { ascending: false }).limit(limit);
    if (error) mapPersistenceError(error);
    return ((data || []) as Array<Record<string, unknown> & { marca_id: string }>).map(({ marca_id, ...row }) => ({ ...row, brandId: marca_id }));
  }));

  server.registerTool("get_writer_document", { title: "Ler documento do Redator", description: "Use para ler blocos, metadados, versão e hash canônicos de um documento antes de editá-lo.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_document", "writer.read", "view", { documentId }, async ({ row }) => {
    const current = row as NonNullable<typeof row>;
    return { document: current.document, contentHash: current.content_hash, lockVersion: current.lock_version, updatedAt: current.updated_at };
  }));

  server.registerTool("get_writer_brief", { title: "Ler briefing do Radar", description: "Use antes de redigir para conferir dossiê, evidências, instruções e pendências do artigo, sem inventar ausências.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_brief", "writer.read", "view", { documentId }, async ({ row }) => {
    const { document, content_hash } = row as NonNullable<typeof row>;
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
  async ({ documentId }) => call("get_writer_guardian", "writer.read", "view", { documentId }, async ({ row }) => {
    const current = row as NonNullable<typeof row>;
    return runGuardian(current.document, current.content_hash);
  }));

  server.registerTool("get_writer_deliverables", { title: "Ler roteiros e carrosséis", description: "Use para ler roteiros, carrosséis e briefings de imagem associados ao documento.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_deliverables", "writer.read", "view", { documentId }, async ({ access }) => ({
    deliverables: await listWriterDeliverables(access.brandId, documentId),
    media: await listWriterMedia(access.brandId, documentId),
  })));

  server.registerTool("save_writer_draft", { title: "Salvar rascunho do artigo", description: "Use após ler o documento para salvar apenas seus blocos de rascunho. Exige lock e readback; nunca aprova.", annotations: draftAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1), expectedLockVersion: z.number().int().positive(),
      blocks: z.array(ContentBlockSchema).max(500) }) },
  async ({ documentId, expectedLockVersion, blocks }) => call("save_writer_draft", "writer.draft.write", "edit", { documentId }, async ({ access }) =>
    saveWriterArticleDraft({ brandId: access.brandId, documentId, expectedLockVersion, blocks, actorId: principal.actorId })));

  server.registerTool("save_writer_deliverable", { title: "Salvar roteiro ou carrossel", description: "Use para salvar rascunho de roteiro ou carrossel com lock e readback.", annotations: draftAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1), expectedLockVersion: z.number().int().positive().nullable(), payload: WriterDeliverablePayloadSchema }) },
  async ({ documentId, expectedLockVersion, payload }) => call("save_writer_deliverable", "writer.draft.write", "edit", { documentId }, async ({ access }) =>
    saveWriterDeliverable({ brandId: access.brandId, documentId, expectedLockVersion, payload, actorId: principal.actorId })));

  server.registerTool("register_media_brief", { title: "Registrar prompt visual", description: "Use para registrar prompt e direção visual; não afirma que a imagem foi gerada ou anexada.", annotations: draftAnnotations,
    inputSchema: WriterMediaBriefSchema.omit({ brandId: true }) },
  async (input) => call("register_media_brief", "writer.media.brief", "edit", { documentId: input.documentId }, async ({ access }) =>
    registerWriterMediaBrief({ ...input, brandId: access.brandId }, principal.actorId)));

  server.registerTool("attach_media_asset", { title: "Anexar imagem gerada", description: "Use quando houver um PNG, JPEG ou WebP realmente gerado pelo cliente para anexá-lo ao briefing existente. O servidor confere bytes e hash.", annotations: draftAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1), assetId: z.string().uuid(), imageBase64: z.string().min(1).max(14_000_000) }) },
  async ({ documentId, assetId, imageBase64 }) => call("attach_media_asset", "writer.media.brief", "edit", { documentId }, async ({ access }) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length % 4 !== 0) throw new ToolFailure("invalid_base64");
    return uploadWriterMediaAsset({ brandId: access.brandId, documentId, assetId,
      bytes: Buffer.from(imageBase64, "base64"), actorId: principal.actorId });
  }));

  return server;
}

async function handle(request: NextRequest) {
  const runtime = readMcpRuntimeConfig();
  try {
    const configurationFailure = mcpRuntimeFailure(runtime);
    if (configurationFailure) throw new WriterMcpAuthError(configurationFailure.code, 503);
    if (!runtime.allowedHosts.includes(request.headers.get("host") || "")) return Response.json({ error: "host_not_allowed" }, { status: 403 });
    const principal = await resolveWriterMcpPrincipal(request.headers.get("authorization"), runtime);
    if (request.headers.get("origin")) return Response.json({ error: "browser_origin_not_allowed" }, { status: 403 });
    const handler = createMcpHandler(() => createWriterServer(principal));
    return await handler.fetch(request);
  } catch (error) {
    const status = error instanceof WriterMcpAuthError ? error.status : 503;
    return Response.json({ error: error instanceof WriterMcpAuthError ? error.code : "mcp_unavailable" },
      { status, headers: { "WWW-Authenticate": mcpBearerChallenge(runtime), "Cache-Control": "no-store" } });
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
