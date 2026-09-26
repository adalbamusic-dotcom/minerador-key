import type { NextRequest } from "next/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ContentBlockSchema } from "@/lib/arquiteto/contracts";
import { runGuardian } from "@/lib/redator/guardian";
import { WriterDeliverablePayloadSchema, WriterMediaBriefSchema } from "@/lib/redator/multiformat-contracts";
import { WRITER_EVIDENCE_GUARDS, WRITER_EVIDENCE_LIMITS, writerEvidenceJsonBytes } from "@/lib/redator/writer-evidence-catalog";
import { WriterDivergenceRequestSchema } from "@/lib/redator/writer-evidence-divergence";
import {
  WRITER_BRIEF_SELECT,
  WRITER_DOCUMENT_VIEW_SELECT,
  WRITER_GUARDIAN_SELECT,
  writerBriefFromRow,
  writerDocumentViewFromRow,
  writerGuardianArticleDnaRefFromRow,
  writerGuardianViewFromRow,
} from "@/lib/redator/writer-document-reads";
import { requireAgencyAccessToBrand } from "@/lib/server/agency-context";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { getOperationalClient, mapPersistenceError, OptimisticLockError } from "@/lib/server/editorial-db";
import { mcpBearerChallenge } from "@/lib/server/mcp-oauth";
import { mcpRuntimeFailure, readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";
import { listWriterDeliverables, listWriterMedia, registerWriterMediaBrief, saveWriterArticleDraft, saveWriterDeliverable, uploadWriterMediaAsset, WriterDeliverableError } from "@/lib/server/writer-deliverables";
import { readWriterGuardianContext, recordWriterDivergenceFromMcp } from "@/lib/server/writer-evidence-divergences";
import { readWriterEvidence, readWriterEvidenceManifest, readWriterFoundations, WriterEvidenceError } from "@/lib/server/writer-evidence-reader";
import { recordWriterMcpCall, WriterMcpAuthError, type WriterMcpScope } from "@/lib/server/writer-mcp-delegation";
import { resolveWriterMcpPrincipal, type WriterMcpBrandAccess, type WriterMcpPrincipal } from "@/lib/server/writer-mcp-principal";
import { platformServerInstructions } from "@/lib/agent/platform-catalog";
import { AuthzError } from "@/lib/server/authz";
import type { EditorialAction } from "@/lib/server/editorial-authorization";
import { PipelineRuntimeError } from "@/lib/server/pipeline-runtime";
import { PlatformToolFailure, registerPlatformTools, type PlatformPermission } from "@/lib/server/platform-mcp-tools";
import { RadarStartError } from "@/lib/server/radar-youtube-start";
import { RadarWriterSendError } from "@/lib/server/radar-writer-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

/** Falha de ferramenta com código estável e detalhes que o cliente pode mostrar ao usuário. */
class ToolFailure extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, details: Record<string, unknown> = {}) { super(code); this.code = code; this.details = details; }
}

type TargetRow = Record<string, unknown> & { id: string; marca_id: string };

/*
 * O QUE CADA FERRAMENTA LÊ DO DOCUMENTO PARA ACHAR O ALVO.
 *
 * Nenhuma lê o payload inteiro (medido em 2026-09-23: 4,5 MB no documento
 * GOOGLE, 99% no dossiê). Entregável, mídia, rascunho e evidências só
 * precisam de `marca_id` para achar o grant; documento, briefing e Guardião
 * leem caminhos do documento — nunca `importedContext` inteiro (adendo D4).
 */
const TARGET_SELECTS = Object.freeze({
  owner: "id,marca_id",
  document: WRITER_DOCUMENT_VIEW_SELECT,
  brief: WRITER_BRIEF_SELECT,
  guardian: WRITER_GUARDIAN_SELECT,
});
type TargetRead = keyof typeof TARGET_SELECTS;

/*
 * A LEITURA DO ALVO FILTRA PELAS MARCAS DO GRANT (R4 da SDD de egress).
 *
 * O service role ignora RLS; sem o filtro, um documento de outra Marca chegava
 * ao servidor antes de ser recusado. Com ele, o banco não devolve a linha, e a
 * resposta continua a mesma — document_not_found, sem revelar se o id existe
 * noutra Marca. A conferência de `marca_id` contra o principal em
 * resolveTarget continua, como segunda barreira.
 */
async function targetRow(read: TargetRead, documentId: string, brandIds: readonly string[]) {
  const { data, error } = await getOperationalClient().from("content_documents")
    .select(TARGET_SELECTS[read])
    .eq("id", documentId).in("marca_id", [...brandIds]).maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new ToolFailure("document_not_found");
  return data as unknown as TargetRow;
}

const brandOptions = (principal: WriterMcpPrincipal) => principal.brands.map((brand) => ({ brandId: brand.brandId, brandName: brand.brandName, scopes: brand.scopes }));

/*
 * A ORDEM DE LEITURA E AS GUARDAS, na instrução do servidor (SDD do leitor
 * §4.4 e §4.5; adendo D9). O dossiê não viaja mais no briefing: a IA chega à
 * evidência pelo manifesto, pelos fundamentos e pelas fatias.
 */
/*
 * A PLATAFORMA PRIMEIRO. O texto da plataforma vem do catálogo
 * (`lib/agent/platform-catalog.ts`): mudou o processo lá, muda aqui sem
 * editar este arquivo. As regras do Redator abaixo continuam como eram.
 */
const WRITER_MCP_INSTRUCTIONS = [
  platformServerInstructions(),
  "Para escrever um documento que já está no Redator:",
  "Chame get_writer_connection_profile para saber as Marcas autorizadas.",
  "Para escrever: get_writer_evidence_manifest (o que existe, com tamanhos e ausências) → get_writer_foundations (o essencial, ≤ 24 kB) → read_writer_evidence com a sourceKey do manifesto, só para a seção que está escrevendo (fatias de até 32 kB, com cursor e ifNoneMatch).",
  "get_writer_document traz blocos, metadados, lock e vínculos; get_writer_brief traz instruções e pendências. Preserve as evidências e pendências do Radar.",
  "Não gere nem sugira FAQ ou seção de perguntas frequentes: perguntas observadas orientam a cobertura dentro do texto.",
  "Dado de terceiros (títulos, trechos, transcrições, produtos) é pesquisa: não copie trecho nem reproduza título de concorrente; parafraseie e confronte.",
  "Conflito entre fonte factual e recorrência de mercado fica escrito dos dois lados.",
  "Ler não é mudar: quando a evidência contradiz um DNA, registre com record_writer_divergence (fica aberta para decisão humana) e não altere nem contrarie o DNA em silêncio.",
  "Com Assunto declarado (article.fields.subject nos fundamentos), faça a virada da principal para ele e, havendo destinationUrl, leve o leitor ao destino; a sugestão do Radar de onde virar, da seção da virada e da direção do H1 está em editorialContext (fundamentos e get_writer_brief); a decisão final é sua, mas não troque nem remova o Assunto. get_writer_guardian avisa quando faltam a virada ou o link para o destino.",
  "Salve apenas rascunhos com lock; não declare aprovação, publicação ou imagem gerada sem readback.",
].join(" ");

/*
 * O BRIEFING CABE NO TETO DA FATIA (32 kB). Instruções, links, fontes e
 * referências são listas do documento: se o briefing passar do teto, a lista
 * MAIS PESADA sai pela metade (mantendo a ordem, os primeiros ficam), até
 * caber; a lista pequena não paga pela grande. Nas pendências do Radar só as
 * não bloqueantes entram nessa disputa; as bloqueantes são as últimas a
 * ceder. Todo corte vai em `trimmed` com o que ficou e o total — nunca em
 * silêncio. O item cortado não tem outra via no MCP (o documento não leva
 * instruções nem pendências): o corte é declarado para a IA não inferir
 * ausência, e a pessoa
 * vê o documento inteiro no painel. Se nem assim couber (cabeçalho do dossiê
 * fora de proporção), a ferramenta recusa com `source_too_large` em vez de
 * passar do teto.
 */
const LISTAS_DO_BRIEFING = ["evidenceRefs", "sourceIds", "linkMap", "instructions", "editorialContext", "pendingDecisions"] as const;
type BriefTrim = { field: string; kept: number; total: number };

const pendenciaBloqueante = (item: unknown) => Boolean(item && typeof item === "object" && (item as { blocking?: unknown }).blocking === true);

function fitBrief<T extends Record<string, unknown>>(brief: T): T & { trimmed?: BriefTrim[] } {
  let atual: Record<string, unknown> = brief;
  const trimmed: BriefTrim[] = [];
  const excede = () => writerEvidenceJsonBytes({ ...atual, trimmed }) > WRITER_EVIDENCE_LIMITS.sliceMaxBytes;
  const listaDe = (campo: string): unknown[] => (Array.isArray(atual[campo]) ? atual[campo] as unknown[] : []);
  /* O que pode ceder nesta rodada: nas pendências, só as não bloqueantes (salvo na última rodada). */
  const cedivel = (campo: string, bloqueantesTambem: boolean) => campo === "pendingDecisions" && !bloqueantesTambem
    ? listaDe(campo).filter(item => !pendenciaBloqueante(item))
    : listaDe(campo);
  const cortar = (campo: string, bloqueantesTambem: boolean) => {
    const lista = listaDe(campo);
    const grupo = cedivel(campo, bloqueantesTambem);
    const ficam = new Set(grupo.slice(0, Math.floor(grupo.length / 2)));
    const restantes = lista.filter(item => ficam.has(item) || !grupo.includes(item));
    const existente = trimmed.find(item => item.field === campo);
    if (existente) existente.kept = restantes.length; else trimmed.push({ field: campo, kept: restantes.length, total: lista.length });
    atual = { ...atual, [campo]: restantes };
  };

  for (const bloqueantesTambem of [false, true]) {
    while (excede()) {
      const cortaveis = LISTAS_DO_BRIEFING.filter(campo => cedivel(campo, bloqueantesTambem).length);
      if (!cortaveis.length) break;
      const peso = (campo: string) => writerEvidenceJsonBytes(cedivel(campo, bloqueantesTambem));
      cortar(cortaveis.reduce((maior, campo) => peso(campo) > peso(maior) ? campo : maior), bloqueantesTambem);
    }
  }

  if (excede()) {
    throw new ToolFailure("source_too_large", { message: "O briefing não coube em 32 kB nem sem as listas do documento; peça get_writer_foundations e o manifesto." });
  }
  return (trimmed.length ? { ...atual, trimmed } : atual) as T & { trimmed?: BriefTrim[] };
}

export function createWriterServer(principal: WriterMcpPrincipal) {
  const server = new McpServer({ name: "minerador-key", version: "0.4.0" }, { instructions: WRITER_MCP_INSTRUCTIONS });
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
  const draftAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false } as const;
  const divergenceAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true } as const;

  /*
   * `read` diz o que a ferramenta lê do documento na mesma ida em que a Marca
   * é conferida: a checagem e os caminhos vêm da mesma linha, sem janela
   * entre as duas e sem consulta a mais. Sem `read`, só o dono (id,marca_id).
   */
  type Target = { brandId?: string | null; documentId?: string; read?: Exclude<TargetRead, "owner">;
    /** As palavras do usuário aceitando a ação. Só as ferramentas de escrita da plataforma mandam. */
    humanConfirmation?: string | null };
  type Resolved = { access: WriterMcpBrandAccess; row: TargetRow | null };

  /*
   * A Marca vem do documento quando há documento; senão do parâmetro; senão
   * é implícita só quando o principal tem uma única Marca. Documento fora do
   * grant responde como inexistente, sem revelar que existe noutra Marca.
   */
  const resolveTarget = async (target: Target): Promise<Resolved> => {
    if (!principal.brands.length) throw new ToolFailure("grant_required", { consentUrl: principal.consentUrl, message: "Nenhuma Marca autorizada para esta conexão. Abra o link e escolha as Marcas e permissões." });
    if (target.documentId) {
      // Todos os caminhos respondem document_not_found no mesmo ponto, antes de escopo e auditoria.
      const brandIds = principal.brands.map((brand) => brand.brandId);
      const row = await targetRow(target.read ?? "owner", target.documentId, brandIds);
      const access = principal.brands.find((brand) => brand.brandId === row.marca_id);
      if (!access) throw new ToolFailure("document_not_found");
      return { access, row: target.read ? row : null };
    }
    if (target.brandId) {
      const access = principal.brands.find((brand) => brand.brandId === target.brandId);
      if (!access) throw new ToolFailure("brand_not_authorized", { brands: brandOptions(principal) });
      return { access, row: null };
    }
    if (principal.brands.length === 1) return { access: principal.brands[0], row: null };
    throw new ToolFailure("brand_required", { brands: brandOptions(principal), message: "Informe brandId: esta conexão cobre mais de uma Marca." });
  };

  /*
   * UM INVÓLUCRO, VÁRIOS MÓDULOS.
   *
   * As ferramentas do Redator conferem `redator`; as da plataforma dizem
   * quais módulos tocam — o envio do Radar ao Redator, por exemplo, exige
   * editar no Radar E criar no Redator, como a rota da tela. Cada permissão é
   * conferida na Agência e na Marca, a cada chamada.
   */
  const callWith = async <T>(toolName: string, scope: WriterMcpScope | readonly WriterMcpScope[], permissions: readonly PlatformPermission[], target: Target, work: (resolved: Resolved) => Promise<T>) => {
    const requestId = crypto.randomUUID();
    let resolved: Resolved | null = null;
    const audit = async (resultCode: string) => {
      if (!resolved) return;
      await recordWriterMcpCall({
        delegationId: resolved.access.delegationId, grantId: resolved.access.grantId, brandId: resolved.access.brandId,
        documentId: target.documentId, toolName, resultCode: resultCode.slice(0, 100), requestId,
        humanConfirmation: target.humanConfirmation ?? null,
      });
    };
    try {
      resolved = await resolveTarget(target);
      for (const required of Array.isArray(scope) ? scope : [scope as WriterMcpScope]) {
        if (!resolved.access.scopes.includes(required)) throw new ToolFailure("scope_denied", { scope: required, consentUrl: principal.consentUrl, message: `Esta conexão não tem a permissão ${required}. O usuário pode reconsentir na Conta → Conexões de IA.` });
      }
      // Vínculo Agência→Marca ainda vale? Quem consentiu ainda pode agir? Conferido a cada chamada.
      for (const permission of permissions) {
        const agency = await requireAgencyAccessToBrand({ brandId: resolved.access.brandId, module: permission.module, action: permission.action, profile: principal.profile });
        if (agency.agency.agencyId !== resolved.access.agencyId) throw new ToolFailure("agency_changed");
        await assertEditorialPermission(principal.profile, resolved.access.brandId, permission.module, permission.action);
      }
      await audit("attempt");
      const result = await work(resolved);
      await audit("success");
      return asText({ ok: true, requestId, brandId: resolved.access.brandId, result });
    } catch (error) {
      const code = error instanceof ToolFailure ? error.code
        : error instanceof PlatformToolFailure ? error.code
        : error instanceof AuthzError ? "permission_denied"
        : error instanceof PipelineRuntimeError || error instanceof RadarStartError || error instanceof RadarWriterSendError ? String((error as { code: unknown }).code)
        : error instanceof WriterEvidenceError ? error.code
        : error instanceof OptimisticLockError ? "conflict"
        : error instanceof WriterDeliverableError ? error.code
        : "tool_failed";
      // O motivo do leitor (onde descer, o que falta) ajuda a IA; nunca carrega payload nem segredo.
      const details = error instanceof ToolFailure ? error.details
        : error instanceof PlatformToolFailure ? error.details
        : error instanceof AuthzError || error instanceof PipelineRuntimeError || error instanceof RadarStartError || error instanceof RadarWriterSendError ? { message: error.message }
        : error instanceof WriterEvidenceError && error.code !== "document_not_found" ? { message: error.message, ...error.details }
        : {};
      try { await audit(code); } catch { /* the original error is retained */ }
      return { isError: true, ...asText({ ok: false, requestId, code, ...details }) };
    }
  };

  /** As ferramentas do Redator: um módulo, uma ação — exatamente como eram. */
  const call = <T>(toolName: string, scope: WriterMcpScope, action: "view" | "edit", target: Target, work: (resolved: Resolved) => Promise<T>) =>
    callWith(toolName, scope, [{ module: "redator", action: action as EditorialAction }], target, work);

  /** As ferramentas da plataforma: `lib/server/platform-mcp-tools.ts`. */
  registerPlatformTools(server, principal, (toolName, scope, target, permissions, work) => callWith(toolName, scope, permissions, target, work));

  /** A Marca da leitura de evidência é a do grant que resolveu o documento — nunca um parâmetro. */
  const evidenceContext = (access: WriterMcpBrandAccess) => ({ brandId: access.brandId });

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

  server.registerTool("get_writer_document", { title: "Ler documento do Redator",
    description: "Use para ler blocos, metadados, status, lock, hash e vínculos com os DNAs antes de editar. A evidência do Radar não vem aqui: use get_writer_evidence_manifest, get_writer_foundations e read_writer_evidence.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_document", "writer.read", "view", { documentId, read: "document" }, async ({ row }) => {
    const current = row as TargetRow;
    const document = writerDocumentViewFromRow(current);
    if (!document) throw new ToolFailure("document_incompatible");
    return {
      document, contentHash: current.content_hash, lockVersion: current.lock_version, updatedAt: current.updated_at,
      evidence: { manifest: "get_writer_evidence_manifest", foundations: "get_writer_foundations", read: "read_writer_evidence" },
    };
  }));

  server.registerTool("get_writer_brief", { title: "Ler briefing do Radar",
    description: "Use antes de redigir para conferir vínculos, instruções e pendências do artigo, sem inventar ausências. O dossiê do Radar não viaja aqui: siga o ponteiro para o manifesto e os fundamentos.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_brief", "writer.read", "view", { documentId, read: "brief" }, async ({ row }) => {
    const current = row as TargetRow;
    const brief = writerBriefFromRow(current);
    if (!brief) throw new ToolFailure("document_incompatible");
    const dossier = brief.dossier;
    return fitBrief({
      documentId, documentHash: current.content_hash,
      articleDnaRef: brief.fields.articleDnaRef, keywordDnaRefs: brief.fields.keywordDnaRefs, siloDnaRef: brief.fields.siloDnaRef,
      instructions: brief.fields.instructions,
      /* SDD do Assunto, F4.1 · onde virar e a direção do H1, gravados no envio. Ausente sem Assunto. */
      ...(brief.editorialContext.length ? { editorialContext: brief.editorialContext } : {}),
      linkMap: brief.fields.linkMap,
      sourceIds: brief.fields.sourceIds, evidenceRefs: brief.fields.evidenceRefs,
      radarOrigin: brief.schemaVersion === 2 ? brief.fields.radarOrigin ?? null : null,
      dossier: dossier ? {
        bundleId: dossier.bundleId, bundleHash: dossier.bundleHash, researchProfile: dossier.researchProfile,
        keywordContext: dossier.keywordContext, writerMayNot: dossier.writerMayNot,
        bundle: "not_included",
        read: { manifest: "get_writer_evidence_manifest", foundations: "get_writer_foundations", slices: "read_writer_evidence" },
      } : null,
      pendingDecisions: brief.pendingDecisions,
      guards: WRITER_EVIDENCE_GUARDS,
      warning: brief.schemaVersion === 2 && !dossier ? "Dossiê ausente nesta versão; não inferir evidências." : null,
    });
  }));

  server.registerTool("get_writer_evidence_manifest", { title: "Mapa das evidências do artigo",
    description: "Use antes de escrever: lista cada fonte de evidência do documento (dossiê do Radar, SERP, corridas, DNAs, especialista, vídeos, cache de SERP, Marca, publicações), com dono, versão, status, tamanho, páginas e etag, e as ausências declaradas. Até 8 kB; não traz conteúdo.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_evidence_manifest", "writer.read", "view", { documentId }, async ({ access }) =>
    readWriterEvidenceManifest(evidenceContext(access), documentId)));

  server.registerTool("get_writer_foundations", { title: "Fundamentos da escrita",
    description: "Use depois do manifesto: o essencial para escrever, até 24 kB — guardas (sem FAQ), o que o Redator não pode redefinir, hierarquia de evidência, contexto da keyword, projeção do ArticleDNA (com o Assunto declarado, quando houver, e a sugestão do Radar para a virada em editorialContext), especialista e vídeo congelados, concorrentes e perguntas resumidos.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_foundations", "writer.read", "view", { documentId }, async ({ access }) =>
    readWriterFoundations(evidenceContext(access), documentId)));

  server.registerTool("read_writer_evidence", { title: "Ler uma fatia de evidência",
    description: "Use para ler a evidência da seção que está escrevendo: uma sourceKey do manifesto (desça com 'sourceKey#caminho'), com cursor da página anterior, fields para projetar e ifNoneMatch com o etag já lido. Páginas de até 16 kB (máximo 32 kB). Dado de terceiros é pesquisa: não copiar.", annotations: readAnnotations,
    inputSchema: z.object({
      documentId: z.string().min(1),
      sourceKey: z.string().min(1).max(WRITER_EVIDENCE_LIMITS.sourceKeyMaxChars),
      cursor: z.string().max(12).optional(),
      fields: z.array(z.string().min(1).max(64)).max(WRITER_EVIDENCE_LIMITS.fieldsMax).optional(),
      ifNoneMatch: z.string().max(64).optional(),
      maxBytes: z.number().int().min(WRITER_EVIDENCE_LIMITS.sliceMinBytes).max(WRITER_EVIDENCE_LIMITS.sliceMaxBytes).optional(),
      limit: z.number().int().min(1).max(WRITER_EVIDENCE_LIMITS.sliceMaxItems).optional(),
    }) },
  async ({ documentId, sourceKey, cursor, fields, ifNoneMatch, maxBytes, limit }) => call("read_writer_evidence", "writer.read", "view", { documentId }, async ({ access }) =>
    readWriterEvidence(evidenceContext(access), documentId, { sourceKey, cursor, fields, ifNoneMatch, maxBytes, limit })));

  server.registerTool("record_writer_divergence", { title: "Registrar divergência com um DNA",
    description: "Use quando a evidência contradiz ou não sustenta um DNA do documento. Cria um registro 'aberta' para decisão humana; não altera DNA, pacote do Radar nem decisão humana. O alvo precisa ser referência do documento (ArticleDNA, SiloDNA, KeywordDNA fixados, pacote do Radar ou contexto vigente da Marca) e a evidência, uma sourceKey do manifesto.", annotations: divergenceAnnotations,
    inputSchema: WriterDivergenceRequestSchema.extend({ documentId: z.string().min(1) }) },
  async ({ documentId, ...request }) => call("record_writer_divergence", "writer.draft.write", "edit", { documentId }, async ({ access }) =>
    recordWriterDivergenceFromMcp(evidenceContext(access), { documentId, request, actorUserId: principal.actorId, mcpGrantId: access.grantId })));

  server.registerTool("get_writer_guardian", { title: "Analisar com Guardião", description: "Use para verificar o rascunho com análise determinística e as divergências abertas com os DNAs; esta ferramenta não aprova o documento.", annotations: readAnnotations,
    inputSchema: z.object({ documentId: z.string().min(1) }) },
  async ({ documentId }) => call("get_writer_guardian", "writer.read", "view", { documentId, read: "guardian" }, async ({ access, row }) => {
    const current = row as TargetRow;
    /* SDD do Assunto, F4.2 · a referência ao ArticleDNA vem da mesma linha: o Assunto liga os avisos da virada e do destino. */
    const context = await readWriterGuardianContext(evidenceContext(access), documentId, { articleDnaRef: writerGuardianArticleDnaRefFromRow(current) });
    return runGuardian(writerGuardianViewFromRow(current), String(current.content_hash), context);
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
