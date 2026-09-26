import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { PLATFORM_GUIDE_TOPICS, renderPlatformGuide } from "@/lib/agent/platform-catalog";
import { resolveNextActions } from "@/lib/agent/next-actions";
import { pathOfUrl, SiloPlanSchema, validateSiloPlan } from "@/lib/agent/silo-plan";
import { lookupTopic, type TopicCandidate } from "@/lib/agent/topic-match";
import { resolveEditorialKeywordStatus } from "@/lib/minerador/editorial-status";
import { importSubjectsWithCore } from "@/lib/minerador/keyword-import-core";
import type { LegacyImportList } from "@/lib/minerador/legacy-import";
import { importSubjectDiscoveryWithCore, SubjectDiscoveryImportRequestSchema } from "@/lib/minerador/subject-discovery-import";
import { runSubjectDiscoverySearch, SubjectDiscoverySearchRequestSchema } from "@/lib/minerador/subject-discovery-search";
import type { WriterMcpScope } from "@/lib/redator/mcp-consent-domain";
import type { EditorialAction, EditorialModule } from "./editorial-authorization";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
import { readPlatformState, readPublishedPagesForMatching, topicCandidatesFrom } from "./agent-platform-state";
import { createMineradorArquitetoHandoff } from "./arquiteto-workspace";
import { resolvePipelineContext } from "./pipeline-runtime";
import { sendRadarToWriter } from "./radar-writer-send";
import { buildSubjectDiscoveryPorts } from "./subject-discovery-runtime";
import { requireTenantPermission } from "./tenant-context";
import type { WriterMcpBrandAccess, WriterMcpPrincipal } from "./writer-mcp-principal";

/**
 * ===== AS FERRAMENTAS DA PLATAFORMA NO MCP =====
 *
 * SDD: `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md` §3.4.
 *
 * Toda ferramenta que escreve chama o MESMO núcleo que a rota da tela chama —
 * `importSubjectsWithCore`, `runSubjectDiscoverySearch` com as portas de
 * `buildSubjectDiscoveryPorts`, `importSubjectDiscoveryWithCore`,
 * `createMineradorArquitetoHandoff`, `sendRadarToWriter`. Nenhuma regra de
 * negócio nasce aqui: o agente é mais um cliente das operações de domínio,
 * como os botões.
 *
 * Toda ferramenta passa pelo invólucro `call` do servidor: grant da Marca,
 * escopo, vínculo Agência→Marca, permissão editorial de cada módulo tocado e
 * auditoria em `writer_mcp_call_events`.
 */

/** Módulo que existe nas duas checagens: permissão editorial e vínculo da Agência. */
export type PlatformPermission = { module: Exclude<EditorialModule, "administracao">; action: EditorialAction };

export type PlatformToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/** O invólucro do servidor, visto daqui. */
export type PlatformCall = <T>(
  toolName: string,
  /** Um escopo, ou todos os exigidos: executar pesquisa paga pede minerador.write E provider.spend. */
  scope: WriterMcpScope | readonly WriterMcpScope[],
  target: { brandId?: string | null; humanConfirmation?: string | null },
  permissions: readonly PlatformPermission[],
  work: (resolved: { access: WriterMcpBrandAccess }) => Promise<T>,
) => Promise<PlatformToolResult>;

export class PlatformToolFailure extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, details: Record<string, unknown> = {}) { super(code); this.code = code; this.details = details; }
}

const brandIdInput = z.string().uuid().optional().describe("Marca da operação. Obrigatória quando a conexão cobre mais de uma Marca.");
const confirmationInput = z.string().trim().min(3).max(500)
  .describe("As palavras do usuário aceitando esta ação, como ele escreveu no chat. Fica gravado na trilha de auditoria.");

const asText = (value: unknown): PlatformToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

const LEITURA = [{ module: "marca", action: "view" }] as const satisfies readonly PlatformPermission[];

/** As keywords da Marca, estreitas, para a busca de tema olhar todas. */
async function keywordCandidates(brandId: string, limit = 5000): Promise<{ candidates: TopicCandidate[]; truncated: boolean }> {
  const db = getOperationalClient();
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; from < limit; from += 1000) {
    const page = await db.from("minerador_keywords").select("id,keyword,status")
      .eq("brand_id", brandId).is("deleted_at", null).order("id").range(from, Math.min(from + 1000, limit) - 1);
    if (page.error) mapPersistenceError(page.error);
    const data = (page.data || []) as Array<Record<string, unknown>>;
    rows.push(...data);
    if (data.length < 1000) return { candidates: rows.map(toKeywordCandidate), truncated: false };
  }
  return { candidates: rows.map(toKeywordCandidate), truncated: true };
}

function toKeywordCandidate(row: Record<string, unknown>): TopicCandidate {
  const status = resolveEditorialKeywordStatus(row.status).status ?? "desconhecido";
  return { kind: "keyword", id: String(row.id), text: String(row.keyword), where: `Minerador · keyword · ${status}` };
}

export function registerPlatformTools(server: McpServer, principal: WriterMcpPrincipal, call: PlatformCall) {
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true } as const;
  const paid = { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false } as const;

  /* ============================ orientação ============================ */

  server.registerTool("get_platform_guide", {
    title: "Guia da plataforma",
    description: "Use primeiro: como trabalhar na plataforma, etapa por etapa, com o que a IA executa e o que é decisão humana. topic: overview (padrão), seo (critérios de SEO), playbooks (passo a passo: artigo sobre um tema, silo do zero, escrever, grupo × individual) ou uma etapa (marca, minerador, arquiteto, radar, redator, publicacoes).",
    inputSchema: z.object({ topic: z.enum(PLATFORM_GUIDE_TOPICS).default("overview") }),
    annotations: read,
  }, async ({ topic }) => asText({ ok: true, topic, guide: renderPlatformGuide(topic) }));

  /* ============================== leitura ============================= */

  server.registerTool("get_platform_state", {
    title: "Retrato da marca",
    description: "Use antes de propor qualquer coisa: o que a marca já tem — Assuntos, keywords por status, silos com pilar e suportes, artigos (promessa, slug, principal, etapa), itens do Radar, documentos do Redator, páginas publicadas — e o link de cada tela.",
    inputSchema: z.object({ brandId: brandIdInput }),
    annotations: read,
  }, async ({ brandId }) => call("get_platform_state", "platform.read", { brandId }, LEITURA, async ({ access }) =>
    readPlatformState(access.brandId)));

  server.registerTool("find_topic_in_platform", {
    title: "O tema já existe?",
    description: "Use quando o usuário pedir um artigo ou silo sobre um tema: procura o tema entre Assuntos, keywords, artigos, silos, páginas do silo e páginas publicadas, e diz onde ele está. A busca é por palavras (não entende sinônimos): 'nada encontrado' não prova que o tema é inédito.",
    inputSchema: z.object({ brandId: brandIdInput, topic: z.string().trim().min(2).max(200) }),
    annotations: read,
  }, async ({ brandId, topic }) => call("find_topic_in_platform", "platform.read", { brandId }, LEITURA, async ({ access }) => {
    const [state, published, keywords] = await Promise.all([
      readPlatformState(access.brandId),
      readPublishedPagesForMatching(access.brandId),
      keywordCandidates(access.brandId),
    ]);
    const lookup = lookupTopic(topic, [...topicCandidatesFrom(state, published), ...keywords.candidates]);
    return { ...lookup, ...(keywords.truncated ? { truncated: ["keywords: comparadas as primeiras 5000"] } : {}) };
  }));

  server.registerTool("list_platform_keywords", {
    title: "Listar keywords da marca",
    description: "Use para ver keywords do Minerador com métricas (volume, allintitle, KGR, intenção), status e declaração de Assunto. Filtre por status, só Assuntos ou texto. Paginado.",
    inputSchema: z.object({
      brandId: brandIdInput,
      status: z.enum(["bruto", "em_revisao", "aprovado", "rejeitado"]).optional(),
      subjectsOnly: z.boolean().default(false),
      search: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).max(20_000).default(0),
    }),
    annotations: read,
  }, async ({ brandId, status, subjectsOnly, search, limit, offset }) =>
    call("list_platform_keywords", "platform.read", { brandId }, [{ module: "minerador", action: "view" }], async ({ access }) => {
      let query = getOperationalClient().from("minerador_keywords")
        .select("id,keyword,status,volume_search,results_allintitle,kgr_score,intent,subject:analise_semantica->keyword_subject,pageType:analise_semantica->keyword_page_type", { count: "exact" })
        .eq("brand_id", access.brandId).is("deleted_at", null);
      if (status) query = query.eq("status", status);
      if (subjectsOnly) query = query.filter("analise_semantica->keyword_subject->>declared", "eq", "true");
      if (search) query = query.ilike("keyword", `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const { data, error, count } = await query.order("keyword").range(offset, offset + limit - 1);
      if (error) mapPersistenceError(error);
      return {
        total: count ?? null,
        offset,
        keywords: ((data || []) as Array<Record<string, unknown>>).map(row => ({
          id: row.id,
          keyword: row.keyword,
          status: resolveEditorialKeywordStatus(row.status).status ?? "desconhecido",
          volume: row.volume_search ?? null,
          allintitle: row.results_allintitle ?? null,
          kgr: row.kgr_score ?? null,
          kgrFull: typeof row.kgr_score === "number" ? row.kgr_score < 0.25 : null,
          intent: row.intent ?? null,
          subject: row.subject && typeof row.subject === "object" && (row.subject as { declared?: unknown }).declared === true ? row.subject : null,
          pageType: row.pageType ?? null,
        })),
      };
    }));

  server.registerTool("get_next_actions", {
    title: "O que fazer agora",
    description: "Use para saber o próximo passo da marca, na ordem do pipeline: cada ação diz se é a IA que executa (com a ferramenta) ou se é decisão humana (com o link da tela e onde clicar).",
    inputSchema: z.object({ brandId: brandIdInput }),
    annotations: read,
  }, async ({ brandId }) => call("get_next_actions", "platform.read", { brandId }, LEITURA, async ({ access }) =>
    resolveNextActions(await readPlatformState(access.brandId))));

  server.registerTool("validate_silo_plan", {
    title: "Validar plano de silo",
    description: "Use depois de propor um silo (4 a 7 artigos, 1 Pilar, página do silo com keyword e slug): confere slugs, colisão com páginas publicadas e artigos existentes, canibalização e distribuição do funil (TOFU/MOFU/BOFU). Não grava nada.",
    inputSchema: z.object({ brandId: brandIdInput, plan: SiloPlanSchema }),
    annotations: read,
  }, async ({ brandId, plan }) => call("validate_silo_plan", "platform.read", { brandId }, LEITURA, async ({ access }) => {
    const [state, published] = await Promise.all([readPlatformState(access.brandId), readPublishedPagesForMatching(access.brandId)]);
    return validateSiloPlan(plan, {
      publishedPaths: published.map(page => pathOfUrl(page.url)).filter((path): path is string => Boolean(path)),
      existingArticleSlugs: state.arquiteto.articles.map(article => article.slug).filter((slug): slug is string => Boolean(slug)),
      existingSiloPageSlugs: state.arquiteto.silos.map(silo => silo.page?.slug).filter((slug): slug is string => Boolean(slug)),
      existingArticleTopics: state.arquiteto.articles.map(article => ({ id: article.articleId, text: article.promise })),
    });
  }));

  /* ============================== Minerador =========================== */

  server.registerTool("declare_subjects", {
    title: "Declarar Assuntos no Minerador",
    description: "Use depois que o usuário ACEITAR os Assuntos no chat (a IA propõe; só o humano declara — ADR-022). mode 'preview' não grava e classifica cada frase (nova, já existe, publicada); mode 'apply' grava, exige userConfirmation com as palavras do aceite, e só declara frases já existentes se vierem em declareExistingIds.",
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      entries: z.array(z.object({
        keyword: z.string().trim().min(1).max(400).describe("A frase do Assunto."),
        note: z.string().max(280).nullable().optional().describe("O que é e para quem, em até 280 caracteres."),
        destinationUrl: z.string().max(2048).nullable().optional().describe("Página de destino no site da marca (https, mesmo domínio)."),
      })).min(1).max(200),
      declareExistingIds: z.array(z.string().uuid()).max(200).default([]),
      defaultListaId: z.string().trim().max(120).nullable().optional(),
      importRequestId: z.string().uuid().optional().describe("Repita o mesmo id ao tentar de novo o mesmo envio."),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, entries, declareExistingIds, defaultListaId, importRequestId, userConfirmation }) => {
    if (mode === "apply" && !userConfirmation) {
      return asText({ ok: false, code: "human_confirmation_required", message: "Declarar Assunto é decisão humana (ADR-022). Mostre o preview, peça o aceite e envie as palavras dele em userConfirmation." });
    }
    return call("declare_subjects", "minerador.write", { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "minerador", action: "edit" }], async ({ access }) => {
      const db = getOperationalClient();
      const [lists, brand] = await Promise.all([
        db.from("minerador_keyword_lists").select("id,nome,marca_id").eq("marca_id", access.brandId),
        db.from("marcas").select("id,site_url").eq("id", access.brandId).maybeSingle(),
      ]);
      if (lists.error) mapPersistenceError(lists.error);
      if (brand.error) mapPersistenceError(brand.error);
      const siteUrl = (brand.data as { site_url?: unknown } | null)?.site_url;
      const result = await importSubjectsWithCore({
        brandId: access.brandId,
        actorUserId: principal.actorId,
        supabase: db,
        mode,
        source: "manual",
        items: entries,
        declareExistingIds,
        importRequestId: mode === "apply" ? importRequestId ?? crypto.randomUUID() : null,
        lists: (lists.data || []) as LegacyImportList[],
        defaultListaId: defaultListaId ?? null,
        brandSiteUrl: typeof siteUrl === "string" ? siteUrl : null,
      });
      if (!result.ok) throw new PlatformToolFailure(result.code, { message: result.reason });
      return result;
    });
  });

  server.registerTool("search_subject_keywords", {
    title: "Pesquisar keywords de sustentação por Assunto",
    description: [
      "Use para achar as buscas reais em torno de um Assunto (Google Ads + DataForSEO Labs).",
      "Sempre primeiro request.mode 'plan' (grátis): devolve o plano e o custo. Mostre o custo ao usuário.",
      "Só com o aceite dele chame request.mode 'execute' com authorizedPlan (planHash e maxCostUsd do plano), um operationRequestId novo e userConfirmation. Executar exige também o escopo provider.spend.",
      "targeting: language 'languageConstants/1014' (Português), 'languageConstants/1000' (Inglês) ou 'languageConstants/1003' (Espanhol); selectedStates ['Todos os estados'] ou siglas de UF (ex.: ['SP','RJ']); keywordPlanNetwork 'GOOGLE_SEARCH'; includeAdultKeywords false.",
      "As candidatas NÃO são gravadas: escolha com o usuário e envie com import_subject_keywords.",
    ].join(" "),
    inputSchema: z.object({ brandId: brandIdInput, request: SubjectDiscoverySearchRequestSchema, userConfirmation: confirmationInput.optional() }),
    annotations: paid,
  }, async ({ brandId, request, userConfirmation }) => {
    const executar = request.mode === "execute";
    if (executar && !userConfirmation) {
      return asText({ ok: false, code: "human_confirmation_required", message: "A execução é paga. Mostre o custo do plano, peça o aceite e envie as palavras dele em userConfirmation." });
    }
    // Executar exige os dois escopos; a recusa vem do invólucro, antes de qualquer leitura.
    const escopos = executar ? ["minerador.write", "provider.spend"] as const : "minerador.write" as const;
    return call("search_subject_keywords", escopos, { brandId, humanConfirmation: executar ? userConfirmation : null }, [{ module: "minerador", action: "edit" }], async ({ access }) => {
      // O mesmo contexto que a rota resolve: marca, ator e agência para o ledger.
      const context = await requireTenantPermission({ brandId: access.brandId, actorUserId: principal.actorId, module: "minerador", action: "edit", profile: principal.profile });
      const ports = buildSubjectDiscoveryPorts({ profile: principal.profile, context, input: request });
      const outcome = await runSubjectDiscoverySearch({ brandId: context.brandId, request }, ports);
      if (outcome.status >= 400) throw new PlatformToolFailure("subject_discovery_refused", { status: outcome.status, ...(outcome.body as Record<string, unknown>) });
      return outcome.body;
    });
  });

  server.registerTool("import_subject_keywords", {
    title: "Importar candidatas ao Processador",
    description: "Use depois de escolher com o usuário as keywords de sustentação (em grupo ou uma a uma): leva ao Processador do Minerador, ligadas ao Assunto. Métricas não vão no envio — o Processador mede. searchId e importRequestId: repita os mesmos numa nova tentativa do mesmo envio.",
    inputSchema: z.object({
      brandId: brandIdInput,
      request: SubjectDiscoveryImportRequestSchema.partial({ searchId: true, importRequestId: true }),
    }),
    annotations: write,
  }, async ({ brandId, request }) => call("import_subject_keywords", "minerador.write", { brandId }, [{ module: "minerador", action: "create" }], async ({ access }) => {
    const completo = SubjectDiscoveryImportRequestSchema.parse({
      ...request,
      searchId: request.searchId ?? crypto.randomUUID(),
      importRequestId: request.importRequestId ?? crypto.randomUUID(),
    });
    const result = await importSubjectDiscoveryWithCore({ brandId: access.brandId, actorUserId: principal.actorId, supabase: getOperationalClient(), request: completo });
    if (!result.ok) throw new PlatformToolFailure(result.code, { message: result.reason });
    return { ...result, searchId: completo.searchId, importRequestId: completo.importRequestId };
  }));

  /* ============================== Arquiteto =========================== */

  server.registerTool("send_keywords_to_arquiteto", {
    title: "Enviar keywords aprovadas ao Arquiteto",
    description: "Use quando o usuário já aprovou as keywords no Minerador: transfere ao Arquiteto (idempotente). Keyword não aprovada é recusada pelo servidor. Formar artigos e silos continua na tela do Arquiteto.",
    inputSchema: z.object({ brandId: brandIdInput, keywordIds: z.array(z.string().uuid()).min(1).max(500) }),
    annotations: write,
  }, async ({ brandId, keywordIds }) => call("send_keywords_to_arquiteto", "arquiteto.write", { brandId }, [{ module: "arquiteto", action: "create" }], async ({ access }) => {
    const context = await resolvePipelineContext(
      { brandId: access.brandId, module: "arquiteto", action: "create" },
      { requireActorUserId: async () => principal.actorId },
    );
    return createMineradorArquitetoHandoff(context, keywordIds);
  }));

  /* ================================ Radar ============================= */

  server.registerTool("send_radar_to_writer", {
    title: "Enviar artigos do Radar ao Redator",
    description: "Use quando o usuário já finalizou a investigação no Radar: cria o documento do Redator a partir do pacote, um artigo por vez (em lote, na ordem). Idempotente; documento existente com outro pacote nunca é sobrescrito. Reporte o desfecho de cada artigo.",
    inputSchema: z.object({ brandId: brandIdInput, articleIds: z.array(z.string().trim().min(1).max(256)).min(1).max(30) }),
    annotations: write,
  }, async ({ brandId, articleIds }) => call("send_radar_to_writer", "radar.write", { brandId },
    [{ module: "radar", action: "edit" }, { module: "redator", action: "create" }], async ({ access }) => {
      const results: Array<Record<string, unknown>> = [];
      // Sequencial de propósito: cada envio grava sob trava otimista.
      for (const articleId of articleIds) {
        try {
          const resultado = await sendRadarToWriter({ brandId: access.brandId, articleId, actorId: principal.actorId, sentAt: new Date().toISOString() });
          results.push({ articleId, ok: true, change: resultado.change, documentId: resultado.documentId, headline: resultado.headline });
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "failed";
          results.push({ articleId, ok: false, code, message: error instanceof Error ? error.message : "Falha no envio." });
        }
      }
      const enviados = results.filter(item => item.ok).length;
      return { summary: `${enviados} de ${results.length} artigo(s) no Redator.`, results };
    }));
}
