import { ArticleImprovementRequestSchema } from "@/lib/arquiteto/article-improvement-request";
import "server-only";
import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { PLATFORM_CATALOG_HASH } from "@/lib/agent/catalog-hash";
import { MCP_ARTICLE_BLUEPRINT_SCREEN, MCP_WRITER_BLUEPRINT_UNAVAILABLE_MESSAGE, mcpArticleBlueprintAction, mcpArticleBlueprintOrganizeAndExportLabel, mcpArticleBlueprintStateOf, type McpArticleBlueprintState } from "@/lib/agent/mcp-article-blueprint";
import { PLATFORM_GUIDE_TOPICS, renderPlatformGuide } from "@/lib/agent/platform-catalog";
import { resolveNextActions } from "@/lib/agent/next-actions";
import { pathOfUrl, SILO_ARTICLE_RANGE, SiloPlanSchema, validateSiloPlan } from "@/lib/agent/silo-plan";
import { lookupTopic, type TopicCandidate } from "@/lib/agent/topic-match";
import { MINERADOR_EDITORIAL_STATUSES, resolveEditorialKeywordStatus } from "@/lib/minerador/editorial-status";
import { readKgrApplicability } from "@/lib/minerador/kgr-applicability";
import { planKgrApplicabilityBatch } from "@/lib/minerador/kgr-applicability-batch";
import { KEYWORD_PAGE_TYPES, KEYWORD_PAGE_TYPE_STANCES } from "@/lib/minerador/keyword-page-type";
import { planVinculoBatchChoices, VINCULO_SUBJECT_ENTRY_MOVED_REASON, type VinculoBatchAction, type VinculoBatchReadbackRow } from "@/lib/minerador/vinculo-batch";
import { vinculoReadbackConfirmed } from "@/lib/minerador/vinculo-screen";
import { GOOGLE_ADS_DISCOVERY_LANGUAGES } from "@/lib/minerador/google-ads-discovery-catalog";
import { subjectDiscoveryEstimate, subjectDiscoveryHasVolume } from "@/lib/minerador/subject-discovery-volume";
import { deriveKgrVisualState, KGR_FULL_RANGE_LIMIT, kgrApplicabilityLabel } from "@/lib/minerador/kgr-applicability";
import type { SubjectImportChannel } from "@/lib/minerador/keyword-import-core";
import { EDITORIAL_GROUP_COLORS } from "@/lib/editorial/editorial-groups";
import { listEditorialGroupSummaries } from "@/lib/editorial/editorial-groups-store";
import { EDITORIAL_GROUP_MCP_INPUT_HINT, resolveEditorialGroupMcpScope } from "@/lib/editorial/editorial-group-scope";
import { DECLARED_PLAN_ARTICLES_MAX, DECLARED_PLAN_LOCK_CHOICES, DECLARED_PLAN_ROLES, DECLARED_PLAN_SCOPE_MAX } from "@/lib/minerador/declared-plan";
import { importDeclaredPlanWithCore, setKeywordPlanLockWithCore } from "@/lib/minerador/declared-plan-import-core";
import { KEYWORD_PAGE_TYPE_KEY, KEYWORD_PAGE_TYPE_STANCE_KEY, keywordPageTypeStance } from "@/lib/minerador/keyword-page-type";
import { KEYWORD_SUBJECT_AT_KEY, KEYWORD_SUBJECT_KEY, KEYWORD_SUBJECT_ORIGIN_KEY, guardKeywordSemanticWrite } from "@/lib/minerador/keyword-subject";
import { resolveKeywordVinculo } from "@/lib/minerador/keyword-vinculo";
import { LOGICAL_OUTPUT_CONTRACT_KEY } from "@/lib/minerador/logical-processor";
import { readCanonicalKeywordDna } from "@/lib/minerador/logical-read-model";
import { SERP_EVIDENCE_RECORD_KEY } from "@/lib/minerador/serp-evidence-record";
import { importSubjectDiscoveryWithCore, SubjectDiscoveryImportRequestSchema } from "@/lib/minerador/subject-discovery-import";
import { runSubjectDiscoverySearch, SubjectDiscoverySearchRequestSchema, type SubjectDiscoveryExecuteResponse } from "@/lib/minerador/subject-discovery-search";
import type { WriterMcpScope } from "@/lib/redator/mcp-consent-domain";
import { RADAR_HANDOFF_ARTICLE_BLUEPRINT_MISSING } from "@/lib/radar/handoff-readiness";
import { WRITER_EVIDENCE_LIMITS, writerEvidenceJsonBytes } from "@/lib/redator/writer-evidence-catalog";
import { buildTenantPath } from "@/lib/tenant-routing";
import type { EditorialAction, EditorialModule } from "./editorial-authorization";
import { getOperationalClient, mapPersistenceError, OptimisticLockError, PersistenceUnavailableError } from "./editorial-db";
import { readPlatformState, readPublishedPagesForMatching, topicCandidatesFrom } from "./agent-platform-state";
import { createMineradorArquitetoHandoff } from "./arquiteto-workspace";
import { PublishedReinforcementRequestSchema, handlePublishedReinforcement } from "./arquiteto-published-reinforcement";
import { publishedReinforcementReadDeps } from "./arquiteto-published-reinforcement-deps";
import { applyKeywordDecisionEntries, constrainKeywordSnapshot, keywordDecisionBase, keywordDecisionEntries, readDecisionKeywords, runKeywordLogicWithCore, type DecisionKeywordRow } from "./minerador-keyword-decision-core";
import { handleDifferentiationPlan } from "./arquiteto-differentiation";
import { readMcpRuntimeConfig } from "./mcp-runtime-config";
import { resolvePipelineContext } from "./pipeline-runtime";
import type { RadarMcpMaterial } from "./radar-mcp-material";
import { RadarWriterSendError, sendRadarToWriter } from "./radar-writer-send";
import { projectVolumeResultForAgent, sliceWritingCsv, VOLUME_MEASURE_MAX_KEYWORDS } from "@/lib/agent/platform-tool-projections";
import { RadarStartError } from "./radar-youtube-start";
import { readWriterEvidenceHead } from "./writer-evidence-document";
import { readWriterApprovedArticleBlueprint, writerBlueprintInvestigationOf } from "./writer-evidence-sources";
import { ContentDocumentRepository } from "./editorial-repositories";
import { makeApprovedWriterDocument, saveAndFinalizeWriterDocument } from "./writer-document-finalization";
import { prepareWriterPublicationHandoff, sendWriterToPublications } from "./writer-publication-handoff";
import { buildSubjectDiscoveryPorts } from "./subject-discovery-runtime";
import { subjectDiscoveryImportPorts } from "./subject-search-receipts";
import { requireTenantPermission } from "./tenant-context";
import type { WriterMcpBrandAccess, WriterMcpPrincipal } from "./writer-mcp-principal";

/**
 * ===== AS FERRAMENTAS DA PLATAFORMA NO MCP =====
 *
 * SDD: `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md` §3.4.
 *
 * Toda ferramenta que escreve chama o MESMO núcleo que a rota da tela chama —
 * `importDeclaredPlanWithCore` (cadastro único de Assuntos, 2026-10-13),
 * `runSubjectDiscoverySearch` com as portas de
 * `buildSubjectDiscoveryPorts`, `importSubjectDiscoveryWithCore`,
 * `createMineradorArquitetoHandoff`, `sendRadarToWriter`. Nenhuma regra de
 * negócio nasce aqui: o agente é mais um cliente das operações de domínio,
 * como os botões. Toda leitura do Minerador passa pelos resolvers do próprio
 * Minerador (`readCanonicalKeywordDna`, `resolveKeywordVinculo`,
 * `readKgrApplicability`): um leitor paralelo diria à IA outra coisa que a tela.
 *
 * Toda ferramenta passa pelo invólucro `call` do servidor: grant da Marca,
 * escopo, vínculo Agência→Marca, permissão editorial de cada módulo tocado e
 * auditoria em `writer_mcp_call_events`.
 */

/** Módulo que existe nas duas checagens: permissão editorial e vínculo da Agência. */
export type PlatformPermission = { module: Exclude<EditorialModule, "administracao">; action: EditorialAction };

export type PlatformToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/**
 * O invólucro do servidor, visto daqui. `requestId` é o mesmo que vai para
 * `writer_mcp_call_events`: é ele que liga o que a ferramenta grava no domínio
 * à linha da auditoria (adendo da decisão delegada, §2.6).
 */
export type PlatformCall = <T>(
  toolName: string,
  /** Um escopo, ou todos os exigidos: executar pesquisa paga pede minerador.write E provider.spend. */
  scope: WriterMcpScope | readonly WriterMcpScope[],
  target: { brandId?: string | null; humanConfirmation?: string | null },
  permissions: readonly PlatformPermission[],
  work: (resolved: { access: WriterMcpBrandAccess; requestId: string }) => Promise<T>,
) => Promise<PlatformToolResult>;

export class PlatformToolFailure extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, details: Record<string, unknown> = {}) { super(code); this.code = code; this.details = details; }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalValue(entry)]));
}

function hashDecision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

async function persistSemanticDecision(input: {
  brandId: string;
  actorId: string;
  rows: readonly DecisionKeywordRow[];
  updates: readonly { id: string; semantic: Record<string, unknown> }[];
  decisionKind: "kgr" | "vinculo";
}) {
  const db = getOperationalClient();
  const byId = new Map(input.rows.map(row => [row.id, row]));
  const results: Array<{ id: string; outcome: "aplicada" | "inalterada" | "stale"; reason?: string }> = [];
  for (const update of input.updates) {
    const current = byId.get(update.id);
    if (!current) {
      results.push({ id: update.id, outcome: "stale", reason: "current_version_unavailable" });
      continue;
    }
    // 2026-10-13 · o Assunto nunca se perde: nenhuma decisão do MCP grava cópia sem ele.
    const guarded = guardKeywordSemanticWrite(current.analise_semantica, update.semantic);
    if (!guarded.ok) {
      results.push({ id: update.id, outcome: "stale", reason: "subject_release_required" });
      continue;
    }
    const saved = await constrainKeywordSnapshot(
      db.from("minerador_keywords").update({ analise_semantica: guarded.semantic })
        .eq("id", update.id).eq("brand_id", input.brandId).is("deleted_at", null),
      current,
    )
      .select("id,brand_id,analise_semantica").maybeSingle();
    if (saved.error) mapPersistenceError(saved.error);
    const readback = saved.data as Record<string, unknown> | null;
    if (!readback || readback.id !== update.id || readback.brand_id !== input.brandId) {
      results.push({ id: update.id, outcome: "stale", reason: "compare_and_swap_failed" });
      continue;
    }
    const persistedSemantic = readback.analise_semantica && typeof readback.analise_semantica === "object"
      ? readback.analise_semantica as Record<string, unknown> : null;
    const confirmed = input.decisionKind === "kgr"
      ? Boolean(persistedSemantic
        && readKgrApplicability(persistedSemantic) === readKgrApplicability(update.semantic)
        && persistedSemantic.kgr_decidido_por === input.actorId)
      : vinculoReadbackConfirmed({ id: update.id, brandId: input.brandId, keyword: current.keyword, semantic: guarded.semantic, demotesApproval: false },
        persistedSemantic ? { id: update.id, brand_id: input.brandId, ...Object.fromEntries(
          ["keyword_subject", "keyword_page_type", "keyword_page_type_stance", "primary_keyword_policy"]
            .filter(key => key in persistedSemantic).map(key => [key, persistedSemantic[key]]),
        ) } as VinculoBatchReadbackRow : null);
    results.push(confirmed ? { id: update.id, outcome: "aplicada" } : { id: update.id, outcome: "stale", reason: "readback_mismatch" });
  }
  return results;
}

const brandIdInput = z.string().uuid().optional().describe("Marca da operação. Obrigatória quando a conexão cobre mais de uma Marca.");
const confirmationInput = z.string().trim().min(3).max(500)
  .describe("As palavras do usuário aceitando esta ação, como ele escreveu no chat. Fica gravado na trilha de auditoria.");

const asText = (value: unknown): PlatformToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

/*
 * O PLANO DO SILO PELO MCP (SDD 2026-10-12 §6.5, F4).
 *
 * O mesmo contrato da rota da tela (`/api/minerador/marcas/[brandId]/plans/import`):
 * o texto colado OU o plano já estruturado, e o grupo escolhido (existente ou
 * novo com nome e cor). As recusas de conteúdo (Pilar, ordem, principal sem
 * volume igual ao Assunto) são do núcleo, iguais para a tela e para a IA.
 */
const DeclaredSiloPlanInput = z.object({
  silo: z.object({
    name: z.string().trim().min(1).max(200).describe("Nome do Silo. Nunca vira keyword."),
    slug: z.string().trim().max(200).nullable().optional().describe("Slug da página do Silo, se o plano trouxer."),
    objective: z.string().max(4000).nullable().optional(),
  }).strict().nullable().optional().describe("Obrigatório no Silo novo; omita no Silo existente (vem do grupo) e no artigo publicado."),
  articles: z.array(z.object({
    order: z.number().int().min(1).max(99).describe("A ordem do artigo no plano (1 = primeiro)."),
    subject: z.string().trim().max(400).describe("O Assunto do artigo (o título). Nunca vira keyword: mora dentro da keyword."),
    principal: z.string().trim().max(400).nullable().optional().describe("A keyword que carrega o Assunto (obrigatória). Com volume medido entra travada; sem volume, livre."),
    role: z.enum(DECLARED_PLAN_ROLES).describe("Exatamente um Pilar no plano; os demais são Suporte."),
    scope: z.string().max(DECLARED_PLAN_SCOPE_MAX * 2).describe(`Os detalhes do artigo, uma linha, até ${DECLARED_PLAN_SCOPE_MAX} caracteres.`),
    lock: z.enum(DECLARED_PLAN_LOCK_CHOICES).nullable().optional().describe("Trava da keyword: auto (pelo volume medido; padrão), locked (travada à mão) ou free (livre à mão). Omitida = mantém a gravada."),
    slug: z.string().trim().max(400).nullable().optional().describe("Opcional: o slug do artigo ('/slug-do-silo/slug-do-artigo/', a URL ou só o último trecho). Vale só para artigo novo (publicado nunca muda); o servidor normaliza, recusa o inválido e o repetido e avisa quando não fica dentro do slug do Silo. Omitido = mantém o gravado; null = tira."),
  }).strict()).min(1).max(DECLARED_PLAN_ARTICLES_MAX + 10),
}).strict();

/*
 * 2026-10-13 · o DESTINO do cadastro (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`
 * §3.4): Silo novo, Silo existente (acréscimo) ou artigo publicado (URL).
 */
const SubjectCadastroDestinationInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_silo") }).strict(),
  z.object({ kind: z.literal("existing_silo"), groupId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("published"), url: z.string().trim().min(1).max(2048) }).strict(),
]).describe("Destino: { kind: 'new_silo' } (padrão), { kind: 'existing_silo', groupId } (acrescenta artigos; os gravados ficam) ou { kind: 'published', url } (o Assunto vai para a página publicada e as keywords entram como reforço dela).");

/*
 * 2026-10-12 · F6 (decisão do dono) · o grupo do plano é a COR: a cor que já
 * tem grupo leva o plano para ele; a sem grupo ganha o grupo pelo mesmo caminho
 * do mover por cor, com o nome do Silo. `new` (a forma de antes) é a mesma
 * coisa; `existing` aceita o uuid de um grupo (compatibilidade).
 */
const DeclaredPlanGroupInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("color"), color: z.enum(EDITORIAL_GROUP_COLORS), name: z.string().max(200).nullable().optional() }).strict(),
  z.object({ mode: z.literal("existing"), groupId: z.string().uuid() }).strict(),
  z.object({ mode: z.literal("new"), name: z.string().max(200).nullable().optional(), color: z.enum(EDITORIAL_GROUP_COLORS) }).strict(),
]).describe("O grupo do plano é a COR: { mode: 'color', color: amarelo | azul | verde | lima | laranja, name? }. Se a cor já tem grupo nesta marca, o plano vai para ele; se não, o grupo da cor nasce com o nome do Silo (ou o name dado). Nunca há dois grupos da mesma cor. { mode: 'existing', groupId } (uuid) e { mode: 'new', … } continuam aceitos e seguem a mesma regra.");

/*
 * AS PERMISSÕES DAS LEITURAS SÃO AS DAS TELAS (R5).
 *
 * O retrato, a próxima ação e a busca de tema leem keywords e Assuntos,
 * artigos e silos, itens do Radar e títulos do Redator. Cada tela cobra o
 * `view` do próprio módulo; pedir só `marca:view` aqui deixava um colaborador
 * — ou uma Agência com a capacidade restrita pela Marca — ler pelo MCP o que a
 * tela lhe nega. O plano de silo só compara com artigos, silos e publicadas.
 */
export const PLATFORM_READ_PERMISSIONS = Object.freeze([
  { module: "marca", action: "view" },
  { module: "minerador", action: "view" },
  { module: "arquiteto", action: "view" },
  { module: "radar", action: "view" },
  { module: "redator", action: "view" },
] as const satisfies readonly PlatformPermission[]);

export const SILO_PLAN_READ_PERMISSIONS = Object.freeze([
  { module: "marca", action: "view" },
  { module: "arquiteto", action: "view" },
] as const satisfies readonly PlatformPermission[]);

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

/* ======================= list_platform_keywords ======================= */

/*
 * AS CHAVES DE `analise_semantica` QUE OS RESOLVERS DO MINERADOR LEEM (S2, S18).
 *
 * A listagem vai até 200 linhas; trazer `analise_semantica` inteira seria o
 * payload pesado que a SDD de egress proíbe. Traz-se só o que
 * `readCanonicalKeywordDna` (intenção e funil: SERP > humano > lógica),
 * `readKgrApplicability` e `resolveKeywordVinculo` (posto, tipo de página com
 * o papel observado no site, Assunto) consultam. Cada chave volta com o
 * próprio nome (prefixado no alias) e o objeto é remontado antes de ir ao
 * resolver — assim a leitura é a da tela, não uma reinterpretação.
 */
export const PLATFORM_KEYWORD_SEMANTIC_KEYS = Object.freeze([
  // intenção e funil canônicos
  SERP_EVIDENCE_RECORD_KEY,
  LOGICAL_OUTPUT_CONTRACT_KEY,
  "human_review",
  "intencao_principal",
  "intencao_revisada",
  "intencao_humana",
  "funnel",
  "funnel_humano",
  "funnel_revisado",
  "funnel_canonico",
  "funnel_human",
  // aplicabilidade do KGR (decisão humana explícita)
  "kgr_aplicabilidade",
  "kgr_decisao",
  "kgr_decisao_origem",
  "kgr_applicability",
  "kgrApplicability",
  "kgr_aplicavel",
  // Vínculo: publicação, posto, tipo de página e Assunto
  "site_origin",
  "primary_keyword_policy",
  KEYWORD_PAGE_TYPE_KEY,
  KEYWORD_PAGE_TYPE_STANCE_KEY,
  KEYWORD_SUBJECT_KEY,
  KEYWORD_SUBJECT_ORIGIN_KEY,
  KEYWORD_SUBJECT_AT_KEY,
] as const);

const SEMANTIC_ALIAS_PREFIX = "sem_";

export const PLATFORM_KEYWORD_SELECT = [
  "id,keyword,status,volume_search,results_allintitle,kgr_score,intent",
  ...PLATFORM_KEYWORD_SEMANTIC_KEYS.map(key => `${SEMANTIC_ALIAS_PREFIX}${key}:analise_semantica->${key}`),
].join(",");

/** Remonta o `analise_semantica` estreito a partir das colunas com alias. Chave ausente não vira `null`. */
export function semanticFromPlatformKeywordRow(row: Record<string, unknown>): Record<string, unknown> {
  const semantic: Record<string, unknown> = {};
  for (const key of PLATFORM_KEYWORD_SEMANTIC_KEYS) {
    const value = row[`${SEMANTIC_ALIAS_PREFIX}${key}`];
    if (value !== null && value !== undefined) semantic[key] = value;
  }
  return semantic;
}

/**
 * A linha que a IA recebe, pelos resolvers do Minerador.
 *
 * - `intent`/`funnel`: os canônicos (SERP > humano > lógica), com origem e
 *   estado; a coluna crua `minerador_keywords.intent` não sai (na marca real
 *   ela diz "Pendente" enquanto o DNA já diz "Informativa").
 * - KGR: `kgrFull` pela regra única `deriveKgrVisualState`. Com a
 *   aplicabilidade `not_applicable` (decisão humana), a pontuação "não é usada"
 *   (spec do Minerador §30) e "NÃO nunca é exportado como pontuação numérica"
 *   (§20): `kgr` e `kgrFull` saem nulos e `kgrUse` diz `nao_utilizada`.
 * - `pageType`: resolvido com a origem (humano, site, padrão) e o peso
 *   (potencial ou declarado), com o rótulo da tela.
 */
export function projectPlatformKeywordRow(row: Record<string, unknown>) {
  const semantic = semanticFromPlatformKeywordRow(row);
  const dna = readCanonicalKeywordDna({ intent: typeof row.intent === "string" ? row.intent : null, analise_semantica: semantic });
  const applicability = readKgrApplicability(semantic);
  const naoUtilizada = applicability === "not_applicable";
  const visual = deriveKgrVisualState(row.kgr_score);
  const vinculo = resolveKeywordVinculo({ status: typeof row.status === "string" ? row.status : null, semantic });
  const subject = vinculo.subject?.declared ? vinculo.subject : null;
  return {
    id: row.id,
    keyword: row.keyword,
    status: resolveEditorialKeywordStatus(row.status).status ?? "desconhecido",
    volume: row.volume_search ?? null,
    allintitle: row.results_allintitle ?? null,
    kgr: naoUtilizada || visual.range === "unavailable" ? null : row.kgr_score,
    kgrFull: naoUtilizada || visual.range === "unavailable" ? null : visual.favorable,
    kgrApplicability: applicability,
    kgrApplicabilityLabel: kgrApplicabilityLabel(applicability),
    // `readKgrApplicability` só devolve "applicable" ou "not_applicable" (2026-09-28): o antigo "decisao_pendente" era inalcançável e saiu (F1 da linha única).
    kgrUse: naoUtilizada ? "nao_utilizada" as const : "aplicavel" as const,
    intent: dna.intent ? dna.intentLabel : null,
    intentLabel: dna.intentLabel,
    intentSource: dna.intentSource,
    intentState: dna.intentState,
    funnel: dna.funnel,
    funnelLabel: dna.funnelLabel,
    funnelSource: dna.funnelSource,
    funnelState: dna.funnelState,
    subject: subject ? {
      declared: true as const,
      note: subject.note,
      destinationUrl: subject.destinationUrl,
      noteMissing: subject.noteMissing,
      origin: subject.origin,
      declaredAt: subject.declaredAt,
      label: vinculo.subjectLabel ?? null,
    } : null,
    pageType: {
      type: vinculo.pageType.type,
      source: vinculo.pageType.source,
      determined: vinculo.pageType.determined,
      stance: keywordPageTypeStance(vinculo.pageType),
      label: vinculo.pageTypeLabel,
    },
    post: vinculo.post,
    postLabel: vinculo.postLabel,
    publicationState: vinculo.publicationState,
    publishedUrl: vinculo.publicationDeclared ? vinculo.url : null,
  };
}

/* ======================= search_subject_keywords ======================= */

/*
 * O RESULTADO PAGO CABE NA RESPOSTA (J2).
 *
 * O execute devolve até 600 candidatas com métricas completas, ranked e
 * estimativa do Labs (só em pesquisas antigas): ~300 kB, bem acima do que um cliente MCP aceita numa
 * resposta de ferramenta. E as candidatas não ficam gravadas: repetir a
 * execução é recusado (OPERATION_ALREADY_EXECUTED). A IA recebe então uma
 * projeção compacta — o que ela precisa para escolher e para montar o
 * `import_subject_keywords` (keyword, volume do Ads, concorrência, `origins`,
 * melhor posição, uma evidência) — no mesmo teto de bytes das fatias do
 * Redator. A lista já vem ordenada por volume (D2.3: com volume antes, média
 * do Ads; em pesquisas antigas, depois a estimativa do Labs); se não couber, ficam as primeiras e o corte vai em
 * `trimmed`, nunca em silêncio. A lista inteira segue na tela.
 */
export const PLATFORM_TOOL_RESULT_MAX_BYTES = WRITER_EVIDENCE_LIMITS.sliceMaxBytes;

export type AgentSubjectCandidate = {
  keyword: string;
  /** Média mensal do Google Ads; `null` quando a candidata não veio do Ads. Estimativa do Labs nunca vira volume. */
  volume: number | null;
  /**
   * D2.3 (aditivo): tem demanda — média do Google Ads maior que zero OU
   * estimativa DataForSEO maior que zero. `false` = sem volume: não propor.
   */
  hasVolume: boolean;
  /** D2.3 (aditivo): estimativa DataForSEO Labs, rotulada; nunca é Volume. Só quando maior que zero (só em pesquisas antigas). */
  estimate?: number;
  competition?: string;
  origins: SubjectDiscoveryExecuteResponse["candidates"][number]["origins"];
  bestRankGroup?: number;
  isSubjectPhrase?: true;
  existingKeywordId?: string;
  evidence?: [string];
};

export function compactSubjectCandidate(candidate: SubjectDiscoveryExecuteResponse["candidates"][number]): AgentSubjectCandidate {
  return {
    keyword: candidate.keyword,
    volume: candidate.googleAds?.averageMonthlySearches ?? null,
    hasVolume: subjectDiscoveryHasVolume(candidate),
    ...((subjectDiscoveryEstimate(candidate) ?? 0) > 0 ? { estimate: subjectDiscoveryEstimate(candidate) as number } : {}),
    ...(candidate.googleAds?.competition ? { competition: candidate.googleAds.competition } : {}),
    origins: candidate.origins,
    ...(typeof candidate.bestRankGroup === "number" ? { bestRankGroup: candidate.bestRankGroup } : {}),
    ...(candidate.isSubjectPhrase ? { isSubjectPhrase: true as const } : {}),
    ...(candidate.existingKeywordId ? { existingKeywordId: candidate.existingKeywordId } : {}),
    ...(candidate.evidence[0] ? { evidence: [candidate.evidence[0]] as [string] } : {}),
  };
}

export function projectSubjectSearchForAgent(body: SubjectDiscoveryExecuteResponse, maxBytes: number = PLATFORM_TOOL_RESULT_MAX_BYTES) {
  const all = body.candidates.map(compactSubjectCandidate);
  const header = {
    success: true as const,
    mode: "execute" as const,
    operationRequestId: body.operationRequestId,
    executedAt: body.executedAt,
    subject: body.subject,
    planHash: body.plan.planHash,
    maxCostUsd: body.plan.maxCostUsd,
    sources: body.sources.map(source => ({
      source: source.source,
      status: source.status,
      received: source.received,
      costUsd: source.costUsd,
      ...(source.reason ? { reason: source.reason } : {}),
    })),
    serp: { topUrls: body.serp.topUrls, readFailed: body.serp.readFailed },
    totalCandidates: body.totalCandidates,
    returnedCandidates: body.returnedCandidates,
    truncated: body.truncated,
    reportedCostUsd: body.reportedCostUsd,
    budgetSpentUsd: body.budgetSpentUsd,
    ledgerWarning: body.ledgerWarning,
    existingCheckFailed: body.existingCheckFailed,
    notices: body.notices,
    /* Item 8 (SDD acelerar-fluxo 2026-10-13): o recibo do servidor; "recorded" = o import grava o Volume medido. */
    ...(body.receipt ? { receipt: body.receipt } : {}),
    ...(body.batchId ? { batchId: body.batchId } : {}),
    /* Os três valores do import, já prontos (J6): a mesma ligação que a tela faz. */
    importWith: {
      tool: "import_subject_keywords",
      searchId: body.operationRequestId,
      subjectKeywordId: body.subject.subjectKeywordId,
      subjectPhrase: body.subject.phrase,
    },
  };
  const trimmedOf = (kept: number) => ({
    field: "candidates",
    kept,
    total: all.length,
    reason: `Teto de ${Math.round(maxBytes / 1024)} kB por resposta: ficaram as primeiras na ordem de relevância. A lista inteira está na tela da Pesquisa por Assunto.`,
  });

  // Soma incremental: cada candidata custa o próprio JSON e a vírgula.
  let bytes = writerEvidenceJsonBytes({ ...header, candidates: [], trimmed: trimmedOf(all.length) });
  let kept = 0;
  for (const candidate of all) {
    const custo = writerEvidenceJsonBytes(candidate) + (kept ? 1 : 0);
    if (bytes + custo > maxBytes) break;
    bytes += custo;
    kept += 1;
  }
  const montar = (quantos: number) => quantos < all.length
    ? { ...header, candidates: all.slice(0, quantos), trimmed: trimmedOf(quantos) }
    : { ...header, candidates: all };
  let result = montar(kept);
  while (kept > 0 && writerEvidenceJsonBytes(result) > maxBytes) result = montar(--kept);
  return result;
}

function subjectSearchLanguagesText(): string {
  return Object.entries(GOOGLE_ADS_DISCOVERY_LANGUAGES).map(([label, value]) => `'${value}' (${label})`).join(", ");
}

/* ===================== send_keywords_to_arquiteto ===================== */

/*
 * O LOTE NUNCA ESCONDE O QUE FICOU FORA (J12).
 *
 * O núcleo da tela ignora a keyword que não está aprovada (ou foi aprovada e
 * mexida depois) e devolve só as que entraram. Na tela, a seleção já vem do
 * Minerador; a IA, não — e lia "UNCHANGED" com listas vazias como "já estava
 * lá". A ferramenta diz o que foi pedido, o que foi e o que não foi, com o
 * motivo; e quando nada era elegível, responde com erro explícito.
 */
export const ARQUITETO_HANDOFF_NOT_ELIGIBLE_REASON =
  "Não aprovada no Minerador, ou aprovada e alterada depois (o pacote aprovado divergiu): aprove-a de novo na tela do Minerador.";

export function reportArquitetoHandoff<R extends { importedKeywordIds: readonly string[] }>(keywordIds: readonly string[], result: R) {
  const requested = [...new Set(keywordIds)];
  const sent = new Set(result.importedKeywordIds);
  const notSent = requested.filter(id => !sent.has(id)).map(keywordId => ({ keywordId, reason: ARQUITETO_HANDOFF_NOT_ELIGIBLE_REASON }));
  if (!result.importedKeywordIds.length) {
    throw new PlatformToolFailure("nothing_eligible", {
      requested: requested.length,
      sent: 0,
      notSent,
      message: "Nenhuma das keywords pedidas está aprovada para o envio ao Arquiteto; nada foi enviado.",
    });
  }
  return { ...result, requested: requested.length, sent: result.importedKeywordIds.length, notSent };
}

/* ======================== send_radar_to_writer ======================== */

/*
 * O DESFECHO POR ARTIGO, SEM TEXTO INTERNO (R10).
 *
 * Só erro de domínio devolve a própria mensagem: as do envio (com o texto de
 * cada bloqueio da prontidão, e os bloqueios em forma estruturada, sem o
 * `detail` técnico), as do Radar e as de persistência indisponível ou trava
 * otimista, que são frases canônicas. Qualquer outro erro — o do driver que
 * `mapPersistenceError` relança como veio, um ZodError — vira "Falha no envio."
 * e o detalhe fica no log do servidor, como a rota da tela faz. Com todos os
 * artigos falhando a ferramenta falha também: a auditoria grava o código do
 * desfecho real em vez de 'success'.
 */
export type WriterSendOutcome = Record<string, unknown> & { articleId: string; ok: boolean };

/*
 * 2026-10-09 · O ENVIO EXIGE O ARTIGO-MODELO (regra do dono). O núcleo da tela
 * (`sendRadarToWriter`) recusa sem a planta concluída do pacote, com o
 * bloqueio ARTICLE_BLUEPRINT_MISSING; aqui a recusa ganha a ação na tela
 * (onde organizar, os botões e o custo antes do clique). O MCP não organiza.
 */
export function describeWriterSendFailure(articleId: string, error: unknown, radarScreen: string | null = null): WriterSendOutcome {
  if (error instanceof RadarWriterSendError) {
    const blocks = (error.readiness?.blocks ?? []).map(({ code, message }) => ({ code, message }));
    const semPlanta = error.code === RADAR_HANDOFF_ARTICLE_BLUEPRINT_MISSING;
    return {
      articleId, ok: false, code: error.code, message: error.message, ...(blocks.length ? { blocks } : {}),
      ...(semPlanta ? {
        action: mcpArticleBlueprintAction({
          articles: 1,
          screen: radarScreen,
          flowButton: MCP_ARTICLE_BLUEPRINT_SCREEN.organizeAndSend,
          afterwards: "Com o artigo-modelo concluído, chame send_radar_to_writer de novo para este artigo.",
        }),
      } : {}),
    };
  }
  if (error instanceof RadarStartError || error instanceof PersistenceUnavailableError || error instanceof OptimisticLockError) {
    return { articleId, ok: false, code: error.code, message: error.message };
  }
  console.error("[mcp:send_radar_to_writer]", articleId, error);
  return { articleId, ok: false, code: "failed", message: "Falha no envio." };
}

export async function sendArticlesToWriter(
  articleIds: readonly string[],
  send: (articleId: string) => Promise<{ change: unknown; documentId: string; headline: string }>,
  /** 2026-10-09 · Aditivo: o link da tela do artigo no Radar, para a recusa por falta do artigo-modelo dizer onde organizar. */
  radarScreenOf: (articleId: string) => string | null = () => null,
) {
  const results: WriterSendOutcome[] = [];
  // Sequencial de propósito: cada envio grava sob trava otimista.
  for (const articleId of articleIds) {
    try {
      const resultado = await send(articleId);
      results.push({ articleId, ok: true, change: resultado.change, documentId: resultado.documentId, headline: resultado.headline });
    } catch (error) {
      results.push(describeWriterSendFailure(articleId, error, radarScreenOf(articleId)));
    }
  }
  const enviados = results.filter(item => item.ok).length;
  /* 2026-10-09 · os recusados por falta do artigo-modelo, juntos: a IA mostra ao usuário onde organizar todos de uma vez. */
  const semPlanta = results.filter(item => item.code === RADAR_HANDOFF_ARTICLE_BLUEPRINT_MISSING).map(item => item.articleId);
  const summary = `${enviados} de ${results.length} artigo(s) no Redator.${semPlanta.length ? ` ${semPlanta.length} sem o artigo-modelo concluído: organize-o no Radar (${MCP_ARTICLE_BLUEPRINT_SCREEN.where}) e envie de novo.` : ""}`;
  const extra = semPlanta.length ? { needsArticleBlueprint: semPlanta } : {};
  if (!enviados) throw new PlatformToolFailure("radar_writer_all_failed", { summary, ...extra, results });
  return { summary, sent: enviados, failed: results.length - enviados, ...extra, results };
}

/* ================= 2026-10-09 · o material do Radar e a planta ================= */

/** O link da tela do artigo no Radar (`/{brandRef}/radar/{articleId}`), quando a Marca e o endereço público são conhecidos. */
export function radarArticleScreen(access: Pick<WriterMcpBrandAccess, "brandId" | "brandName">, articleId: string): string | null {
  try {
    const base = readMcpRuntimeConfig().publicBaseUrl || "";
    return `${base}${buildTenantPath({ brandId: access.brandId, brandName: access.brandName, module: "radar" })}/${encodeURIComponent(articleId)}`;
  } catch {
    return null;
  }
}

/**
 * O MATERIAL (CSV "Para escrever" ou de vídeo) COMO RESPOSTA DA FERRAMENTA.
 *
 * Sem o artigo-modelo concluído, a falha `needs_article_blueprint` com o que
 * falta pelo título, o teto do custo e a ação na tela — nunca um arquivo pelo
 * modelo editorial antigo. A recusa de antes (investigação não finalizada)
 * continua com o código e o motivo dela.
 */
export function radarMaterialOrFailure(material: RadarMcpMaterial, radarScreen: string | null = null): Extract<RadarMcpMaterial, { status: "ready" }> {
  if (material.status === "ready") return material;
  if (material.status === "refused") throw new PlatformToolFailure(material.code, { message: material.reason });
  const ferramenta = material.mode === "video" ? "get_video_material" : "get_article_for_writing";
  throw new PlatformToolFailure("needs_article_blueprint", {
    message: material.message,
    missingArticleBlueprints: material.missing,
    maxAiCalls: material.maxAiCalls,
    action: mcpArticleBlueprintAction({
      articles: Math.max(1, material.missing.length),
      screen: radarScreen,
      flowButton: mcpArticleBlueprintOrganizeAndExportLabel(Math.max(1, material.missing.length)),
      afterwards: `Com o artigo-modelo concluído, chame ${ferramenta} de novo.`,
    }),
  });
}

/** A leitura do artigo-modelo que falhou (503 `blueprint_unavailable`) vira falha com o código: nada foi montado sem a planta. */
export function radarMaterialReadFailure(error: unknown): PlatformToolFailure | null {
  const lido = error as { code?: unknown; message?: unknown } | null;
  if (!lido || typeof lido !== "object" || lido.code !== "blueprint_unavailable") return null;
  return new PlatformToolFailure("blueprint_unavailable", { message: typeof lido.message === "string" ? lido.message : "Não foi possível ler o artigo-modelo agora: tente de novo em instantes." });
}

/**
 * O ESTADO DO ARTIGO-MODELO DE UM DOCUMENTO DO REDATOR, pela MESMA leitura do
 * Redator e do envio (`readWriterApprovedArticleBlueprint`, só metadados, pelo
 * pacote e pela investigação congelada do documento). Serve ao briefing e aos
 * fundamentos do MCP: sem a planta, o estado explícito, nunca o legado.
 */
export async function readMcpArticleBlueprintState(
  access: Pick<WriterMcpBrandAccess, "brandId" | "brandName">,
  documentId: string,
  /**
   * O artigo e o pacote que o chamador já leu do documento (o briefing), para
   * quando o cabeçalho do leitor não abre (documento gravado fora do contrato
   * atual): a conferência cai no hash exato do pacote, sem a investigação.
   */
  reserva: { articleId: string; bundleHash: string | null } | null = null,
): Promise<McpArticleBlueprintState> {
  const contexto = { brandId: access.brandId };
  let alvo: Parameters<typeof readWriterApprovedArticleBlueprint>[1];
  try {
    const head = await readWriterEvidenceHead(contexto, documentId);
    alvo = { articleId: head.articleId, bundleHash: head.dossier?.bundleHash ?? null, investigation: writerBlueprintInvestigationOf(head) };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "o cabeçalho do documento não foi lido";
    if (!reserva) return { status: "blueprint_unavailable", reason: motivo, message: MCP_WRITER_BLUEPRINT_UNAVAILABLE_MESSAGE };
    alvo = { articleId: reserva.articleId, bundleHash: reserva.bundleHash, investigation: null };
  }
  const lido = await readWriterApprovedArticleBlueprint(contexto, alvo, { content: false });
  return mcpArticleBlueprintStateOf(lido, { screen: radarArticleScreen(access, alvo.articleId) });
}

/** Une o bloco do Assunto ao evento auditado da mesma chamada MCP. */
export function mcpChannel(access: WriterMcpBrandAccess, requestId: string): SubjectImportChannel {
  return { kind: "mcp", grantId: access.grantId, requestId };
}

/*
 * 2026-10-12 · F6 (SDD do plano declarado e grupos, §6.5) · O RECORTE POR GRUPO
 * DAS LEITURAS DO MCP. `group` aceita a cor ("laranja"), "sem-grupo" e o uuid
 * de um grupo (compatibilidade); a lista de grupos é a da marca autorizada (o
 * uuid de outra marca não existe aqui). Sem o parâmetro, nada de grupo é lido.
 */
export const platformGroupInput = z.string().trim().max(80).optional()
  .describe(`Recorte por grupo de cor: ${EDITORIAL_GROUP_MCP_INPUT_HINT}. Sem ele, a marca inteira.`);

export async function resolvePlatformGroupScope(brandId: string, raw: string | null | undefined) {
  if (!raw || !raw.trim()) return null;
  /* Formato e "sem-grupo"/"todos" se decidem sem ler o banco; a cor e o uuid precisam da lista desta marca. */
  const semLista = resolveEditorialGroupMcpScope(raw, []);
  if (!semLista.ok && semLista.code === "group_invalid") throw new PlatformToolFailure(semLista.code, { message: semLista.message });
  if (semLista.ok && semLista.scope.kind !== "groups") return semLista.scope.kind === "all" ? null : semLista.scope;
  const lista = await listEditorialGroupSummaries(getOperationalClient(), brandId);
  if (!lista.ok) throw new PlatformToolFailure(lista.code, { message: lista.message });
  const resolvido = resolveEditorialGroupMcpScope(raw, lista.groups);
  if (!resolvido.ok) throw new PlatformToolFailure(resolvido.code, { message: resolvido.message });
  return resolvido.scope.kind === "all" ? null : resolvido.scope;
}

/** O que a resposta diz do recorte (a cor, os grupos dela e a frase). */
function grupoDaResposta(scope: Awaited<ReturnType<typeof resolvePlatformGroupScope>>) {
  if (!scope) return {};
  return {
    group: {
      choice: scope.kind === "none" ? "sem-grupo" : scope.color,
      description: scope.description,
      groups: scope.kind === "none" ? [] : scope.groups.map(item => ({ groupId: item.groupId, color: item.color, colorLabel: item.colorLabel, name: item.name, text: item.text })),
    },
  };
}

export function registerPlatformTools(server: McpServer, principal: WriterMcpPrincipal, call: PlatformCall) {
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true } as const;
  const paid = { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false } as const;
  const kgrLimit = KGR_FULL_RANGE_LIMIT.toLocaleString("pt-BR");

  /* ============================ orientação ============================ */

  server.registerTool("get_platform_guide", {
    title: "Guia da plataforma",
    description: "Use primeiro: como trabalhar na plataforma, etapa por etapa, com o que a IA executa e o que é decisão humana. topic: overview (padrão), seo (critérios de SEO), playbooks (passo a passo) ou uma etapa (marca, minerador, arquiteto, radar, redator, publicacoes). catalogHash muda quando o processo muda: com outro hash, releia o guia.",
    inputSchema: z.object({ topic: z.enum(PLATFORM_GUIDE_TOPICS).default("overview") }),
    annotations: read,
  }, async ({ topic }) => asText({ ok: true, topic, catalogHash: PLATFORM_CATALOG_HASH, guide: renderPlatformGuide(topic) }));

  /* ============================== leitura ============================= */

  server.registerTool("get_platform_state", {
    title: "Retrato da marca",
    description: "Use antes de propor qualquer coisa: o que a marca já tem — Assuntos, keywords por status, silos com pilar e suportes, artigos (promessa, slug, principal, etapa), itens do Radar, documentos do Redator, páginas publicadas — e o link de cada tela. Exige ver Marca, Minerador, Arquiteto, Radar e Redator. Com group (a cor, ex.: 'laranja', ou 'sem-grupo'), só o que é daquele grupo — keywords e Assuntos pelo grupo da keyword; artigos, Silos, itens do Radar e documentos pelo grupo do artigo — e a resposta traz group; as páginas publicadas são sempre o site inteiro.",
    inputSchema: z.object({ brandId: brandIdInput, group: platformGroupInput }),
    annotations: read,
  }, async ({ brandId, group }) => call("get_platform_state", "platform.read", { brandId }, PLATFORM_READ_PERMISSIONS, async ({ access }) => {
    const recorte = await resolvePlatformGroupScope(access.brandId, group);
    return recorte ? readPlatformState(access.brandId, { group: recorte }) : readPlatformState(access.brandId);
  }));

  server.registerTool("find_topic_in_platform", {
    title: "O tema já existe?",
    description: "Use quando o usuário pedir um artigo ou silo sobre um tema: procura o tema entre Assuntos, keywords, artigos, silos, páginas do silo e páginas publicadas, e diz onde ele está. A busca é por palavras (não entende sinônimos): 'nada encontrado' não prova que o tema é inédito.",
    inputSchema: z.object({ brandId: brandIdInput, topic: z.string().trim().min(2).max(200) }),
    annotations: read,
  }, async ({ brandId, topic }) => call("find_topic_in_platform", "platform.read", { brandId }, PLATFORM_READ_PERMISSIONS, async ({ access }) => {
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
    description: [
      "Use para ver keywords do Minerador com métricas, status, Vínculo e declaração de Assunto, lidas como a tela lê. Filtre por status, só Assuntos ou texto. Paginado.",
      "intent e funnel são os canônicos (SERP > humano > lógica), com a origem em intentSource/funnelSource; intent nulo é intenção ainda não resolvida (intentLabel diz o estado).",
      `kgrFull é KGR < ${kgrLimit} (${kgrLimit} exato não é pleno). O KGR só conta como critério quando kgrApplicability não é 'not_applicable': nesse caso kgr e kgrFull vêm nulos e kgrUse é 'nao_utilizada' — é o padrão desde 2026-09-28; só a decisão humana 'Aplicável' liga o KGR. Resultados e KGR não são requisito para aprovar.`,
      "pageType vem resolvido: type, source (human, site ou default), stance (potential ou declared) e o rótulo da tela; keyword publicada como silo já é silo declarado.",
      "group (opcional) recorta pelo grupo de cor, como o seletor da tela: a cor ('laranja'), 'sem-grupo' ou o uuid de um grupo; a resposta traz group (a cor, os grupos dela e a frase). Cor sem grupo nesta marca = lista vazia, dita em group.description.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      status: z.enum(MINERADOR_EDITORIAL_STATUSES).optional(),
      subjectsOnly: z.boolean().default(false),
      search: z.string().trim().max(120).optional(),
      group: platformGroupInput,
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).max(20_000).default(0),
    }),
    annotations: read,
  }, async ({ brandId, status, subjectsOnly, search, group, limit, offset }) =>
    call("list_platform_keywords", "platform.read", { brandId }, [{ module: "minerador", action: "view" }], async ({ access }) => {
      const recorte = await resolvePlatformGroupScope(access.brandId, group);
      /* 2026-10-12 · F6 · cor sem grupo nesta marca: nada a ler (nunca "tudo" por engano). */
      if (recorte?.kind === "groups" && !recorte.groupIds.length) return { total: 0, offset, keywords: [], ...grupoDaResposta(recorte) };
      let query = getOperationalClient().from("minerador_keywords")
        .select(PLATFORM_KEYWORD_SELECT, { count: "exact" })
        .eq("brand_id", access.brandId).is("deleted_at", null);
      if (recorte?.kind === "none") query = query.is("group_id", null);
      if (recorte?.kind === "groups") query = query.in("group_id", recorte.groupIds);
      if (status) query = query.eq("status", status);
      if (subjectsOnly) query = query.filter("analise_semantica->keyword_subject->>declared", "eq", "true");
      if (search) query = query.ilike("keyword", `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const { data, error, count } = await query.order("keyword").range(offset, offset + limit - 1);
      if (error) mapPersistenceError(error);
      return {
        total: count ?? null,
        offset,
        keywords: ((data || []) as unknown as Array<Record<string, unknown>>).map(projectPlatformKeywordRow),
        ...grupoDaResposta(recorte),
      };
    }));

  server.registerTool("get_next_actions", {
    title: "O que fazer agora",
    description: "Use para saber o próximo passo da marca, na ordem do pipeline: cada ação diz se é a IA que executa (com a ferramenta) ou se é decisão humana (com o link da tela e onde clicar).",
    inputSchema: z.object({ brandId: brandIdInput }),
    annotations: read,
  }, async ({ brandId }) => call("get_next_actions", "platform.read", { brandId }, PLATFORM_READ_PERMISSIONS, async ({ access }) =>
    resolveNextActions(await readPlatformState(access.brandId))));

  server.registerTool("validate_silo_plan", {
    title: "Validar plano de silo",
    description: `Use depois de propor um silo (${SILO_ARTICLE_RANGE.min} a ${SILO_ARTICLE_RANGE.max} artigos, 1 Pilar, página do silo com keyword e slug): confere slugs, colisão com páginas publicadas e artigos existentes, canibalização e distribuição do funil (TOFU/MOFU/BOFU). Não grava nada.`,
    inputSchema: z.object({ brandId: brandIdInput, plan: SiloPlanSchema }),
    annotations: read,
  }, async ({ brandId, plan }) => call("validate_silo_plan", "platform.read", { brandId }, SILO_PLAN_READ_PERMISSIONS, async ({ access }) => {
    const [state, published] = await Promise.all([readPlatformState(access.brandId), readPublishedPagesForMatching(access.brandId)]);
    return validateSiloPlan(plan, {
      publishedPaths: published.map(page => pathOfUrl(page.url)).filter((path): path is string => Boolean(path)),
      existingArticleSlugs: state.arquiteto.articles.map(article => article.slug).filter((slug): slug is string => Boolean(slug)),
      existingSiloPageSlugs: state.arquiteto.silos.map(silo => silo.page?.slug).filter((slug): slug is string => Boolean(slug)),
      existingArticleTopics: state.arquiteto.articles.map(article => ({ id: article.articleId, text: article.promise })),
    });
  }));

  /* ============================== Minerador =========================== */

  /*
   * 2026-10-13 · `declare_subjects` SAIU (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`
   * §3.1): ela criava o Assunto solto, numa linha própria. O Assunto entra só
   * pelo cadastro único — `declare_silo_plan` abaixo, o mesmo núcleo do card.
   */

  server.registerTool("declare_silo_plan", {
    title: "Cadastrar Assuntos no Minerador (cadastro único)",
    description: [
      "É o card 'Cadastrar Assuntos' do Minerador, pelo mesmo núcleo (importDeclaredPlanWithCore) — a única porta para o Assunto desde 2026-10-13. O Assunto mora DENTRO da keyword: por artigo, o título (subject), a keyword que o carrega (principal, obrigatória), os detalhes (scope), o papel Pilar/Suporte, a ordem e a trava (lock). Nenhuma linha de título vira keyword.",
      "Use quando o usuário trouxer o plano de um Silo novo, artigos para um Silo existente ou keywords para reforçar um artigo publicado, e ACEITAR cadastrar no chat. Envie o texto colado (text) OU o plano estruturado (plan), nunca os dois; o grupo pela COR (group { mode: 'color', color: amarelo, azul, verde, lima ou laranja, name opcional }) e o destino (destination: new_silo, existing_silo com groupId, ou published com url).",
      "Trava: keyword com volume medido entra TRAVADA (o Arquiteto a usa como principal e só busca sustentações); sem volume, LIVRE (o Arquiteto pode propor outra principal pela SERP/volume, mantendo o Assunto, o papel e a ordem no artigo). lock: 'locked' ou 'free' fixa à mão; 'auto' volta ao volume. Planos anteriores ao cadastro único ficam travados até o usuário mudar.",
      "Silo existente, planMode 'append' (padrão): acréscimo — os artigos já gravados ficam como estão; tirar UM artigo do plano é pela tela ('Tirar do plano'). planMode 'replace' (Substituir o plano, só com destination existing_silo): as linhas enviadas SÃO o plano novo inteiro; a prévia devolve replace { same, changed, entering, leaving (com o motivo de cada uma), decisionHash } — o que sai passa pelo 'Tirar do plano' (inclusive o Pilar quando o plano novo traz outro; o Assunto pode mudar de keyword), nada é apagado, o artigo já no Arquiteto fica 'Fora do plano' até o dono decidir lá; Radar, Redator e publicados não mudam. Aplicar a substituição exige o aceite no chat, o MESMO decisionHash da prévia e o escopo platform.decide. Artigo publicado: o Assunto vai para a keyword da página (URL, slug, canonical e principal intocados) e as keywords entram como reforço dela.",
      "mode 'preview' não grava: devolve cada artigo com o título, a keyword, a trava efetiva, o que muda, as sobras e os impedimentos (blockers; com algum, canApply é false). Mostre a prévia ao usuário. mode 'apply' exige userConfirmation (as palavras do aceite) e importRequestId (uuid; repita o mesmo ao tentar de novo): cria as keywords que faltam como Bruto, grava o Assunto e o plano nelas, etiqueta com a cor e devolve o resultado relido. Sem custo.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      text: z.string().max(60000).optional().describe("O plano do Silo como o usuário colou, pelo mesmo leitor do card: lista numerada ('1. Título', 'Palavra-chave: …'), blocos separados por linha em branco com o papel na 1ª linha ('Silo', 'Pilar', 'Suporte') e título, keyword, slug e descrição com ou sem rótulo, tabela com '|', planilha colada (TAB) ou CSV com cabeçalho (Papel, Assunto, Keyword, Slug, Descrição — também por sinônimo, como o CSV de planejamento: numero, silo, hierarquia, titulo_h1_sugerido, keyword_hipotese_a_validar, slug_proposto, intencao_exclusiva; as outras colunas são ignoradas e ditas nos avisos)."),
      siloName: z.string().trim().min(1).max(200).optional().describe("Só com text que traz MAIS DE UM Silo (ex.: o CSV com a coluna silo): o nome do Silo a cadastrar agora. Sem ele, a recusa SILO_CHOICE_REQUIRED lista os Silos com a contagem; um cadastro = um Silo, e o outro continua no mesmo texto para o próximo cadastro."),
      plan: DeclaredSiloPlanInput.optional(),
      group: DeclaredPlanGroupInput,
      destination: SubjectCadastroDestinationInput.optional(),
      importRequestId: z.string().uuid().optional().describe("Obrigatório no apply. Repita o mesmo id ao tentar de novo o mesmo envio."),
      planMode: z.enum(["append", "replace"]).optional().describe("Só com destination existing_silo. 'append' (padrão): acrescenta. 'replace': Substituir o plano — as linhas são o plano novo inteiro; prévia com as quatro listas e o decisionHash."),
      decisionHash: z.string().trim().min(1).max(200).optional().describe("planMode 'replace': o decisionHash da prévia (obrigatório no apply)."),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, text, plan, group, destination, importRequestId, planMode, decisionHash, userConfirmation, siloName }) => {
    if (mode === "apply" && !userConfirmation) {
      return asText({ ok: false, code: "human_confirmation_required", message: "Declarar o plano do Silo é decisão humana (ADR-022). Mostre a prévia, peça o aceite e envie as palavras dele em userConfirmation." });
    }
    if (mode === "apply" && !importRequestId) {
      return asText({ ok: false, code: "import_request_required", message: "O apply precisa de importRequestId (uuid). Gere um e repita o mesmo ao tentar de novo o mesmo envio." });
    }
    if (Boolean(text?.trim()) === Boolean(plan)) {
      return asText({ ok: false, code: "plan_required", message: "Envie o texto colado (text) ou o plano estruturado (plan) — um dos dois." });
    }
    // 2026-10-13 · "Substituir o plano": aplicar é decisão humana sobre a prévia das quatro listas (decisionHash) e pede platform.decide.
    const substituir = planMode === "replace";
    if (substituir && mode === "apply" && !decisionHash) {
      return asText({ ok: false, code: "decision_hash_required", message: "Substituir o plano exige a prévia (mode 'preview', planMode 'replace'): mostre ao usuário as quatro listas (fica igual, muda, entra, sai), peça o aceite e envie o decisionHash dela." });
    }
    const escopos = substituir && mode === "apply" ? ["minerador.write", "platform.decide"] as const : "minerador.write";
    return call("declare_silo_plan", escopos, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "minerador", action: "edit" }], async ({ access, requestId }) => {
      /*
       * Os clientes, como nas outras escritas do MCP: o
       * operacional, depois de o invólucro conferir grant, escopo, Agência e
       * permissão. As tabelas de grupo só aceitam escrita do servidor; a rota
       * da tela usa `editorialGroupsClient()`, que É `getOperationalClient()`
       * (lib/server/editorial-groups.ts). Aquele módulo não é importado aqui
       * porque traz `next/server` (respostas HTTP da rota), que o MCP não usa.
       */
      const db = getOperationalClient();
      const brand = await db.from("marcas").select("id,site_url").eq("id", access.brandId).maybeSingle();
      if (brand.error) mapPersistenceError(brand.error);
      const siteUrl = (brand.data as { site_url?: unknown } | null)?.site_url;
      const result = await importDeclaredPlanWithCore({
        brandId: access.brandId,
        actorUserId: principal.actorId,
        keywordsClient: db,
        groupsClient: db,
        mode,
        text: plan ? null : text ?? null,
        plan: plan ?? null,
        group,
        destination: destination ?? null,
        importRequestId: mode === "apply" ? importRequestId ?? null : null,
        channel: mcpChannel(access, requestId),
        brandSiteUrl: typeof siteUrl === "string" ? siteUrl : null,
        planMode: planMode ?? null,
        decisionHash: decisionHash ?? null,
        siloName: plan ? null : siloName ?? null,
      });
      if (!result.ok) throw new PlatformToolFailure(result.code, { message: result.reason, ...(result.blockers ? { blockers: result.blockers } : {}) });
      return result;
    });
  });

  /*
   * 2026-10-13 · CONVERTER O FORMATO ANTERIOR (SDD
   * `sdd-conversao-assunto-legado-2026-10-13.md` §13): o MESMO núcleo da rota
   * `/api/minerador/marcas/[brandId]/plans/convert` (`readConversionDraftWithCore`
   * e `convertLegacySubjectsWithCore`, que passa pelo núcleo do cadastro). Ler e
   * prever são leitura; converter grava, aprova (D2-bis) e envia ao Arquiteto,
   * só com o aceite do usuário no chat.
   */
  server.registerTool("convert_legacy_subjects", {
    title: "Converter Assuntos do formato anterior (o Assunto passa a morar na keyword)",
    description: [
      "No formato anterior, o Assunto era uma linha própria (o título) e a principal vinha de outra linha. Converter leva o Assunto para DENTRO da keyword que carrega o artigo (por padrão, a principal que o artigo já tem no Arquiteto), grava o plano do grupo com o Silo consolidado, roda a Lógica (grátis), aprova (só a Lógica, D2-bis) e envia ao Arquiteto. A linha-título não é tocada nem vai para a lixeira: fica arquivada como histórico.",
      "mode 'read' (leitura): o rascunho do grupo — cada linha-título, o artigo, a keyword sugerida, as alternativas (secundária do artigo não pode carregar o Assunto), os detalhes pré-preenchidos com a promessa vigente, o Silo e a ordem do SiloDNA. mode 'preview' (leitura): a prévia do cadastro, com impedimentos (canApply). mode 'apply': exige userConfirmation (as palavras do aceite) e importRequestId (uuid; repita o mesmo ao tentar de novo).",
      "Depois de aplicar, o artigo no Arquiteto precisa da versão nova: chame update_article_subject (prévia → aceite → apply). Sem custo: nenhuma chamada de provider nem de IA.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["read", "preview", "apply"]),
      groupId: z.string().uuid().describe("O grupo (cor) das linhas-título."),
      silo: z.object({ name: z.string().trim().min(1).max(200), slug: z.string().trim().max(200).nullable().optional(), objective: z.string().max(4000).nullable().optional() }).strict().nullable().optional().describe("Só quando o grupo ainda não tem plano (padrão: o do rascunho)."),
      rows: z.array(z.object({
        fromKeywordId: z.string().uuid(),
        articleId: z.string().min(1).max(400).nullable(),
        order: z.number().int().min(1).max(DECLARED_PLAN_ARTICLES_MAX),
        role: z.enum(DECLARED_PLAN_ROLES),
        title: z.string().trim().min(1).max(400),
        keyword: z.string().trim().min(1).max(400),
        scope: z.string().max(DECLARED_PLAN_SCOPE_MAX * 2),
        lock: z.enum(DECLARED_PLAN_LOCK_CHOICES).nullable().optional(),
      }).strict()).max(DECLARED_PLAN_ARTICLES_MAX).optional(),
      importRequestId: z.string().uuid().optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, groupId, silo, rows, importRequestId, userConfirmation }) => {
    if (mode === "apply" && !userConfirmation) {
      return asText({ ok: false, code: "human_confirmation_required", message: "Converter o Assunto é decisão humana (ADR-022): mostre a prévia, peça o aceite e envie as palavras dele em userConfirmation." });
    }
    if (mode === "apply" && !importRequestId) {
      return asText({ ok: false, code: "import_request_required", message: "O apply precisa de importRequestId (uuid). Gere um e repita o mesmo ao tentar de novo." });
    }
    if (mode !== "read" && !rows?.length) {
      return asText({ ok: false, code: "rows_required", message: "Envie as linhas (rows) do rascunho que o usuário aceitou converter (use mode 'read' para obtê-las)." });
    }
    const scopes = mode === "apply" ? ["minerador.write", "platform.decide", "arquiteto.write"] as const : ["platform.read"] as const;
    const permissions = mode === "apply"
      ? [{ module: "minerador", action: "edit" } as const, { module: "minerador", action: "approve" } as const, { module: "arquiteto", action: "create" } as const]
      : [{ module: "minerador", action: "view" } as const];
    return call("convert_legacy_subjects", scopes, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, permissions, async ({ access, requestId }) => {
      const db = getOperationalClient();
      const { convertLegacySubjectsWithCore, readConversionDraftWithCore } = await import("@/lib/minerador/subject-conversion-core");
      if (mode === "read") {
        const draft = await readConversionDraftWithCore({ brandId: access.brandId, keywordsClient: db, groupsClient: db, groupId });
        if (!draft.ok) throw new PlatformToolFailure(draft.code, { message: draft.reason });
        return { ...draft, readOnly: true };
      }
      const brand = await db.from("marcas").select("id,site_url").eq("id", access.brandId).maybeSingle();
      if (brand.error) mapPersistenceError(brand.error);
      const siteUrl = (brand.data as { site_url?: unknown } | null)?.site_url;
      const { serverConversionFollowUp } = await import("./minerador-subject-conversion");
      const result = await convertLegacySubjectsWithCore({
        brandId: access.brandId,
        actorUserId: principal.actorId,
        keywordsClient: db,
        groupsClient: db,
        mode,
        groupId,
        silo: silo ?? null,
        rows: rows ?? [],
        importRequestId: mode === "apply" ? importRequestId ?? null : null,
        brandSiteUrl: typeof siteUrl === "string" ? siteUrl : null,
        channel: mcpChannel(access, requestId),
        followUp: mode === "apply" ? serverConversionFollowUp(access.brandId, principal.actorId) : null,
      });
      if (!result.ok) throw new PlatformToolFailure(result.code, { message: result.reason, ...(result.blockers ? { blockers: result.blockers } : {}) });
      return mode === "preview" ? { ...result, readOnly: true } : result;
    });
  });

  /* ================= decisões humanas aceitas no chat ================= */

  server.registerTool("decide_keywords", {
    title: "Aprovar ou rejeitar keywords",
    description: "Decisão delegada pelo usuário no chat. Faça mode=preview, mostre elegibilidade, bloqueios e decisão proposta; só depois do aceite explícito chame mode=apply com o mesmo decisionHash e userConfirmation contendo as palavras do usuário. A aprovação usa o mesmo readiness e applyApproval do Minerador, grava como o usuário autenticado e confirma o readback. Publicadas são protegidas.",
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      action: z.enum(["approve", "reject"]),
      keywordIds: z.array(z.string().uuid()).min(1).max(100),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, action, keywordIds, decisionHash, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e reaplique com o decisionHash da mesma prévia." });
    }
    const scope = mode === "apply" ? "platform.decide" as const : "platform.read" as const;
    const permission = mode === "apply" ? "approve" as const : "view" as const;
    return call("decide_keywords", scope, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "minerador", action: permission }], async ({ access }) => {
      const { rows, missingCount } = await readDecisionKeywords(access.brandId, keywordIds);
      // O MESMO núcleo do "Reforçar publicados" (lib/server/minerador-keyword-decision-core.ts).
      const entries = keywordDecisionEntries(rows, action);
      const snapshot = {
        tool: "decide_keywords", brandId: access.brandId, actorId: principal.actorId, action,
        keywordIds: [...new Set(keywordIds)], missingCount,
        rows: rows.map(row => ({ ...keywordDecisionBase(row), semanticSnapshot: row.analise_semantica })),
        entries,
      };
      const currentDecisionHash = hashDecision(snapshot);
      if (mode === "preview") return { mode, action, entries, missingCount, decisionHash: currentDecisionHash, readOnly: true };
      if (decisionHash !== currentDecisionHash) throw new PlatformToolFailure("decision_stale", { message: "O estado das keywords mudou desde a prévia. Gere uma nova prévia antes de aplicar." });

      const results = await applyKeywordDecisionEntries({ brandId: access.brandId, actorId: principal.actorId, action, rows, entries });
      return { mode, action, results, missingCount, decisionHash: currentDecisionHash, readbackConfirmed: results.every(item => item.outcome === "applied" || item.outcome === "unchanged") };
    });
  });

  server.registerTool("set_kgr_applicability", {
    title: "Decidir aplicabilidade do KGR",
    description: "Decisão aceita pelo usuário no chat para keywords selecionadas. Use mode=preview e depois mode=apply com o mesmo decisionHash e userConfirmation. Reusa planKgrApplicabilityBatch. Desde 2026-10-13 a keyword que carrega um Assunto é tratada como qualquer keyword (o KGR vale para ela); skippedSubjects fica 0, por compatibilidade.",
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      applicability: z.enum(["applicable", "not_applicable"]),
      keywordIds: z.array(z.string().uuid()).min(1).max(100),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, applicability, keywordIds, decisionHash, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e reaplique com o decisionHash da mesma prévia." });
    }
    const scope = mode === "apply" ? "platform.decide" as const : "platform.read" as const;
    const permission = mode === "apply" ? "edit" as const : "view" as const;
    return call("set_kgr_applicability", scope, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "minerador", action: permission }], async ({ access }) => {
      const { rows, missingCount } = await readDecisionKeywords(access.brandId, keywordIds);
      // 2026-10-13: a keyword que carrega Assunto é tratada como qualquer keyword.
      const eligible = rows;
      const skippedSubjects = 0;
      const plan = planKgrApplicabilityBatch(eligible.map(row => ({ id: row.id, keyword: row.keyword, analise_semantica: row.analise_semantica })), applicability, { actorId: principal.actorId, decidedAt: "decision-preview" });
      const entries = [
        ...plan.updates.map(item => ({ id: item.id, keyword: item.keyword, current: item.previous, proposed: applicability, outcome: "ready" as const })),
        ...plan.unchangedIds.map(id => ({ id, keyword: rows.find(row => row.id === id)?.keyword || id, current: applicability, proposed: applicability, outcome: "unchanged" as const })),
        ...plan.draftIds.map(id => ({ id, keyword: rows.find(row => row.id === id)?.keyword || id, current: readKgrApplicability(rows.find(row => row.id === id)?.analise_semantica), proposed: applicability, outcome: "blocked" as const })),
      ];
      const currentDecisionHash = hashDecision({ tool: "set_kgr_applicability", brandId: access.brandId, actorId: principal.actorId, applicability, keywordIds: [...new Set(keywordIds)], missingCount, skippedSubjects, rows: rows.map(row => ({ ...keywordDecisionBase(row), semanticSnapshot: row.analise_semantica })), entries });
      if (mode === "preview") return { mode, applicability, entries, skippedSubjects, missingCount, decisionHash: currentDecisionHash, readOnly: true };
      if (decisionHash !== currentDecisionHash) throw new PlatformToolFailure("decision_stale", { message: "O estado das keywords mudou desde a prévia. Gere uma nova prévia antes de aplicar." });
      const applyPlan = planKgrApplicabilityBatch(eligible.map(row => ({ id: row.id, keyword: row.keyword, analise_semantica: row.analise_semantica })), applicability, { actorId: principal.actorId, decidedAt: new Date().toISOString() });
      const results = await persistSemanticDecision({ brandId: access.brandId, actorId: principal.actorId, rows, updates: applyPlan.updates, decisionKind: "kgr" });
      return { mode, applicability, results, skippedSubjects, missingCount, decisionHash: currentDecisionHash, readbackConfirmed: results.every(item => item.outcome !== "stale") };
    });
  });

  server.registerTool("set_keyword_vinculo", {
    title: "Decidir Vínculo das keywords",
    description: "Altera o tipo/potencial de página (inclui 'silo', a cabeça do silo) ou a TRAVA da keyword NÃO publicada do plano (kind 'plan_lock', lock locked|free|auto — o 'Posto de principal' da tela na não publicada, gravado pelo núcleo do cadastro com nova versão do plano e releitura; sem plano, recusa por item 'Para travar, cadastre o artigo em Cadastrar Assuntos.'; a trava entra no pacote aprovado: a aprovada volta a Em revisão e o Arquiteto só vê a trava nova depois de reaprovar e reenviar), somente após o aceite específico no chat. Use mode=preview e depois mode=apply com o mesmo decisionHash. Usa planVinculoBatchChoices e o readback do Minerador. O posto (travado/revisável) da principal publicada NÃO é alterável pelo MCP: é decisão na tela do Minerador. Publicação, slug, canonical e marca permanecem protegidos. O Assunto NÃO é do Vínculo (2026-10-13): kind subject_declare/subject_withdraw é recusado com subject_entry_moved — o Assunto entra só por declare_silo_plan (o card 'Cadastrar Assuntos') e sai do plano por 'Tirar do plano' na tela.",
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      keywordIds: z.array(z.string().uuid()).min(1).max(100),
      /*
       * Só o tipo de página. O posto (travado/revisável) protege a principal de
       * conteúdo PUBLICADO: o adendo de 2026-09-26 §3 e o AGENTS.md §11 o deixam
       * fora do alcance do MCP, mesmo com aceite. Estava aceito aqui; saiu.
       */
      action: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("page_type"), pageType: z.enum(KEYWORD_PAGE_TYPES), stance: z.enum(KEYWORD_PAGE_TYPE_STANCES) }),
        /*
         * 2026-10-13: o Assunto saiu do Vínculo. Estes dois valores existem só
         * para a recusa ser clara (`subject_entry_moved`, apontando "Cadastrar
         * Assuntos"/declare_silo_plan) em vez de um erro de validação mudo.
         */
        z.object({ kind: z.literal("subject_declare") }).passthrough(),
        z.object({ kind: z.literal("subject_withdraw") }).passthrough(),
        /*
         * 2026-10-13 · A TRAVA DA KEYWORD DO PLANO (pedido do dono): na keyword
         * NÃO publicada, o "Posto de principal" da tela é a trava do cadastro.
         * Mesmo núcleo da tela (`setKeywordPlanLockWithCore` → núcleo do
         * cadastro): nova versão do plano, releitura, recusa por item.
         */
        z.object({ kind: z.literal("plan_lock"), lock: z.enum(DECLARED_PLAN_LOCK_CHOICES) }),
      ]),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, keywordIds, action, decisionHash, userConfirmation }) => {
    if (action.kind === "subject_declare" || action.kind === "subject_withdraw") {
      return asText({ ok: false, code: "subject_entry_moved", message: VINCULO_SUBJECT_ENTRY_MOVED_REASON });
    }
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e reaplique com o decisionHash da mesma prévia." });
    }
    const scope = mode === "apply" ? "platform.decide" as const : "platform.read" as const;
    const permission = mode === "apply" ? "edit" as const : "view" as const;
    if (action.kind === "plan_lock") {
      return call("set_keyword_vinculo", scope, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "minerador", action: permission }], async ({ access, requestId }) => {
        // Os clientes, como em declare_silo_plan: o operacional, depois de o invólucro conferir grant, escopo e permissão.
        const db = getOperationalClient();
        const previa = await setKeywordPlanLockWithCore({ brandId: access.brandId, actorUserId: principal.actorId, keywordsClient: db, groupsClient: db, mode: "preview", keywordIds, lock: action.lock });
        if (!previa.ok) throw new PlatformToolFailure(previa.code, { message: previa.reason });
        const entries = previa.items.map(item => ({ keywordId: item.keywordId, keyword: item.keyword, outcome: item.outcome, reason: item.reason, before: item.before, after: item.after, approvedToReview: item.approvedToReview }));
        const currentDecisionHash = hashDecision({ tool: "set_keyword_vinculo", brandId: access.brandId, actorId: principal.actorId, action, keywordIds: [...new Set(keywordIds)], entries });
        if (mode === "preview") return { mode, action, entries, counts: previa.counts, architectHint: previa.architectHint, decisionHash: currentDecisionHash, readOnly: true };
        if (decisionHash !== currentDecisionHash) throw new PlatformToolFailure("decision_stale", { message: "O estado das keywords mudou desde a prévia. Gere uma nova prévia antes de aplicar." });
        const brand = await db.from("marcas").select("id,site_url").eq("id", access.brandId).maybeSingle();
        if (brand.error) mapPersistenceError(brand.error);
        const siteUrl = (brand.data as { site_url?: unknown } | null)?.site_url;
        const gravado = await setKeywordPlanLockWithCore({
          brandId: access.brandId, actorUserId: principal.actorId, keywordsClient: db, groupsClient: db, mode: "apply", keywordIds, lock: action.lock,
          importRequestId: crypto.randomUUID(), channel: mcpChannel(access, requestId), brandSiteUrl: typeof siteUrl === "string" ? siteUrl : null,
        });
        if (!gravado.ok) throw new PlatformToolFailure(gravado.code, { message: gravado.reason });
        return { mode, action, results: gravado.items, counts: gravado.counts, planVersions: gravado.planVersions, architectHint: gravado.architectHint, decisionHash: currentDecisionHash, readbackConfirmed: gravado.items.every(item => item.outcome !== "failed") };
      });
    }
    return call("set_keyword_vinculo", scope, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "minerador", action: permission }], async ({ access }) => {
      const { rows, missingCount } = await readDecisionKeywords(access.brandId, keywordIds);
      const planForPreview = planVinculoBatchChoices({ keywords: rows, brandId: access.brandId, actions: [action as VinculoBatchAction], actorId: principal.actorId, changedAt: "decision-preview" });
      if (!planForPreview.ok) throw new PlatformToolFailure(planForPreview.code, { message: planForPreview.reason });
      const entries = {
        updates: planForPreview.updates.map(item => ({ id: item.id, keyword: item.keyword, demotesApproval: item.demotesApproval })),
        skipped: planForPreview.steps.flatMap(step => step.skipped),
        counts: planForPreview.counts,
        actionLabel: planForPreview.actionLabel,
      };
      const currentDecisionHash = hashDecision({ tool: "set_keyword_vinculo", brandId: access.brandId, actorId: principal.actorId, action, keywordIds: [...new Set(keywordIds)], missingCount, rows: rows.map(row => ({ ...keywordDecisionBase(row), semanticSnapshot: row.analise_semantica })), entries, proposedSemantic: planForPreview.updates.map(item => ({ id: item.id, semantic: item.semantic })) });
      if (mode === "preview") return { mode, action, entries, missingCount, decisionHash: currentDecisionHash, readOnly: true };
      if (decisionHash !== currentDecisionHash) throw new PlatformToolFailure("decision_stale", { message: "O estado das keywords mudou desde a prévia. Gere uma nova prévia antes de aplicar." });
      const planToApply = planVinculoBatchChoices({ keywords: rows, brandId: access.brandId, actions: [action as VinculoBatchAction], actorId: principal.actorId, changedAt: new Date().toISOString() });
      if (!planToApply.ok) throw new PlatformToolFailure(planToApply.code, { message: planToApply.reason });
      const results = await persistSemanticDecision({ brandId: access.brandId, actorId: principal.actorId, rows, updates: planToApply.updates, decisionKind: "vinculo" });
      return { mode, action, results, missingCount, decisionHash: currentDecisionHash, readbackConfirmed: results.every(item => item.outcome !== "stale") };
    });
  });

  server.registerTool("finalize_writer_document", {
    title: "Finalizar artigo do Redator",
    description: "Aprova o ContentDocument e cria/confirma sua versão final usando o mesmo núcleo da tela, com Guardião, lock, readback e retenção. Primeiro mode=preview; depois do aceite explícito do usuário no chat, mode=apply com o mesmo decisionHash e userConfirmation. Não publica o artigo.",
    inputSchema: z.object({
      brandId: brandIdInput,
      documentId: z.string().trim().min(1).max(512),
      mode: z.enum(["preview", "apply"]),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, documentId, mode, decisionHash, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e aplique com o mesmo decisionHash." });
    }
    const scope = mode === "apply" ? "platform.decide" as const : "platform.read" as const;
    const permission = mode === "apply" ? "approve" as const : "view" as const;
    return call("finalize_writer_document", scope, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "redator", action: permission }], async ({ access }) => {
      const repository = new ContentDocumentRepository();
      const current = await repository.findDetail(access.brandId, documentId);
      if (!current) throw new PlatformToolFailure("document_not_found", { message: "Documento não encontrado nesta marca." });
      const approved = await makeApprovedWriterDocument(current.document);
      const blockers = approved.assessment.blockers;
      const snapshot = {
        tool: "finalize_writer_document", brandId: access.brandId, actorId: principal.actorId,
        documentId,
        currentStatus: current.document.status,
        currentContentHash: current.contentHash,
        expectedLockVersion: current.lockVersion,
        proposedContentHash: approved.contentHash,
        guardianFindings: approved.assessment.guardian.findings.map(finding => ({ severity: finding.severity, code: finding.category, message: finding.message })),
        blockers,
      };
      const currentDecisionHash = hashDecision(snapshot);
      if (mode === "preview") return {
        mode, documentId, articleId: approved.document.articleDnaRef.entityId,
        currentStatus: current.document.status, expectedLockVersion: current.lockVersion,
        guardian: { blocking: blockers.length, findings: snapshot.guardianFindings },
        blockers, decisionHash: currentDecisionHash, readOnly: true,
      };
      if (decisionHash !== currentDecisionHash) throw new PlatformToolFailure("decision_stale", { message: "Documento ou bloqueios do Guardião mudaram desde a prévia. Gere nova prévia." });
      if (blockers.length) throw new PlatformToolFailure("writer_finalize_blocked", { blockers });
      const result = await saveAndFinalizeWriterDocument({
        brandId: access.brandId, documentId,
        expectedLockVersion: current.lockVersion,
        document: approved.document,
        contentHash: approved.contentHash,
        createVersion: true,
        changeReason: "Aprovação do documento solicitada pelo usuário via MCP.",
        actorId: principal.actorId,
      });
      if (result.version?.retention.status === "skipped" && result.version.retention.reason === "readback_failed") throw new PlatformToolFailure("writer_finalization_readback_failed", { message: "A gravação ocorreu, mas a leitura da versão corrente não confirmou o resultado." });
      return { mode, ...result, decisionHash: currentDecisionHash, readbackConfirmed: true };
    });
  });

  server.registerTool("send_writer_to_publications", {
    title: "Entregar artigo a Publicações",
    description: "Cria o PublicationRecord interno a partir do documento aprovado do Redator; não publica URL no site nem altera canonical. Faça mode=preview; depois do aceite do usuário, mode=apply com o mesmo decisionHash e userConfirmation. A prévia executa os mesmos gates do envio e o servidor os repete antes da gravação.",
    inputSchema: z.object({
      brandId: brandIdInput,
      documentId: z.string().trim().min(1).max(512),
      mode: z.enum(["preview", "apply"]),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, documentId, mode, decisionHash, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e aplique com o mesmo decisionHash." });
    }
    const scope = mode === "apply" ? "platform.decide" as const : "platform.read" as const;
    const permissions = mode === "apply"
      ? [{ module: "redator", action: "approve" }, { module: "publicacoes", action: "create" }] as const
      : [{ module: "redator", action: "view" }, { module: "publicacoes", action: "view" }] as const;
    return call("send_writer_to_publications", scope, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, permissions, async ({ access }) => {
      const prepared = await prepareWriterPublicationHandoff({ brandId: access.brandId, documentId, now: "decision-preview" });
      const currentDecisionHash = hashDecision({
        tool: "send_writer_to_publications", brandId: access.brandId, actorId: principal.actorId,
        sourceSnapshot: prepared.sourceSnapshot,
      });
      if (mode === "preview") return {
        mode, sourceSnapshot: prepared.sourceSnapshot,
        action: "Criar PublicationRecord interno em Publicações; nenhuma URL será publicada.",
        decisionHash: currentDecisionHash, readOnly: true,
      };
      if (decisionHash !== currentDecisionHash) throw new PlatformToolFailure("decision_stale", { message: "Documento, evidências ou identidade mudaram desde a prévia. Gere nova prévia." });
      const result = await sendWriterToPublications({ brandId: access.brandId, documentId, actorId: principal.actorId });
      return { mode, ...result, decisionHash: currentDecisionHash, readbackConfirmed: true };
    });
  });

  server.registerTool("search_subject_keywords", {
    title: "Pesquisar keywords de sustentação por Assunto",
    description: [
      "Use para achar as buscas reais em torno de um Assunto (Google Ads: frase e página de destino).",
      "Se o Assunto já está declarado, passe request.subjectKeywordId (de declare_silo_plan articles[].subjectKeywordId ou de get_platform_state minerador.subjects[].keywordId): o servidor relê a frase, a nota e a página de destino, e o destino alimenta a fonte por URL. Sem ele, request.phrase.",
      "Sempre primeiro request.mode 'plan' (grátis): devolve o plano (sem custo no DataForSEO; usa a cota do Google Ads). Mostre o plano ao usuário.",
      "Custo em dinheiro: zero (o Google Ads não cobra a consulta). A ferramenta continua marcada como de provider porque a execução gasta a cota do Google Ads da marca: por isso o aceite do usuário e o escopo provider.spend. Não apresente a pesquisa como gasto em dinheiro.",
      "Só com o aceite dele chame request.mode 'execute' com authorizedPlan (planHash e maxCostUsd do plano), userConfirmation e um operationRequestId UUID v4 novo — repetido só numa nova tentativa do MESMO execute. Executar exige também o escopo provider.spend.",
      `targeting: language ${subjectSearchLanguagesText()}; selectedStates ['Todos os estados'] ou siglas de UF (ex.: ['SP','RJ']); keywordPlanNetwork 'GOOGLE_SEARCH'; includeAdultKeywords false.`,
      `O execute volta compacto, em até ${Math.round(PLATFORM_TOOL_RESULT_MAX_BYTES / 1024)} kB: candidatas na ordem de relevância com keyword, volume (Google Ads), origins e uma evidência; o que não coube vem declarado em trimmed.`,
      "As candidatas NÃO viram keyword sozinhas e a mesma execução não pode ser repetida: escolha com o usuário e envie com import_subject_keywords usando os valores de importWith.",
      "O servidor guarda o recibo da execução com a média do Google Ads de cada candidata (receipt.status 'recorded'): o import usa esse recibo para gravar o Volume, sem medir de novo. Para pesquisar as linhas de um cadastro em lote, mande o mesmo request.batchId (UUID) em cada execução.",
    ].join(" "),
    inputSchema: z.object({ brandId: brandIdInput, request: SubjectDiscoverySearchRequestSchema, userConfirmation: confirmationInput.optional() }),
    annotations: paid,
  }, async ({ brandId, request, userConfirmation }) => {
    const executar = request.mode === "execute";
    if (executar && !userConfirmation) {
      return asText({ ok: false, code: "human_confirmation_required", message: "A execução consulta o Google Ads da marca (sem custo no DataForSEO; usa a cota). Mostre o plano, peça o aceite e envie as palavras dele em userConfirmation." });
    }
    // Executar exige os dois escopos; a recusa vem do invólucro, antes de qualquer leitura.
    const escopos = executar ? ["minerador.write", "provider.spend"] as const : "minerador.write" as const;
    return call("search_subject_keywords", escopos, { brandId, humanConfirmation: executar ? userConfirmation : null }, [{ module: "minerador", action: "edit" }], async ({ access }) => {
      // O mesmo contexto que a rota resolve: marca, ator e agência para o ledger.
      const context = await requireTenantPermission({ brandId: access.brandId, actorUserId: principal.actorId, module: "minerador", action: "edit", profile: principal.profile });
      const ports = buildSubjectDiscoveryPorts({ profile: principal.profile, context, input: request });
      const outcome = await runSubjectDiscoverySearch({ brandId: context.brandId, request }, ports);
      if (outcome.status >= 400) throw new PlatformToolFailure("subject_discovery_refused", { status: outcome.status, ...(outcome.body as Record<string, unknown>) });
      return outcome.body.success && outcome.body.mode === "execute" ? projectSubjectSearchForAgent(outcome.body) : outcome.body;
    });
  });

  server.registerTool("import_subject_keywords", {
    title: "Importar candidatas ao Processador",
    description: "Use depois de escolher com o usuário as keywords de sustentação (em grupo ou uma a uma): leva ao Processador do Minerador, ligadas ao Assunto. Uma chamada por Assunto, com os valores de importWith da busca: searchId = operationRequestId da busca; subjectKeywordId = subject.subjectKeywordId da busca (ou o id do Assunto declarado); subjectPhrase = subject.phrase. items[].origins e evidence vêm da candidata. Métricas não vão no envio: com o searchId da busca, o servidor lê o recibo que gravou na execução e grava a média do Google Ads como Volume validado (keyword nova, ou existente sem medição, não publicada e fora do plano; a do plano se mede com measure_keywords) e roda a Lógica nas keywords do envio — a resposta traz volume e logic. Sem recibo (busca antiga), meça com measure_keywords. Numa nova tentativa do mesmo envio, repita searchId e importRequestId.",
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
    // Item 8 (SDD acelerar-fluxo 2026-10-13): as MESMAS portas da rota — o Volume do recibo do servidor e a Lógica.
    const importPorts = await subjectDiscoveryImportPorts({ brandId: access.brandId, searchId: completo.searchId, db: getOperationalClient() });
    const result = await importSubjectDiscoveryWithCore({ brandId: access.brandId, actorUserId: principal.actorId, supabase: getOperationalClient(), request: completo, volume: importPorts.volume, runLogic: importPorts.runLogic });
    if (!result.ok) throw new PlatformToolFailure(result.code, { message: result.reason });
    return { ...result, searchId: completo.searchId, importRequestId: completo.importRequestId };
  }));

  server.registerTool("run_keyword_logic", {
    title: "Executar Lógica das keywords",
    description: "Roda a mesma Lógica determinística do botão do Minerador: intenção, nicho e funil com preservação das decisões humanas existentes. Não chama providers, não mede e não aprova. Envie keywordIds (individual ou grupo); o servidor grava só depois de derivar o lote inteiro e confirma cada alteração por readback.",
    inputSchema: z.object({ brandId: brandIdInput, keywordIds: z.array(z.string().uuid()).min(1).max(100) }),
    annotations: write,
  }, async ({ brandId, keywordIds }) => call("run_keyword_logic", "minerador.write", { brandId }, [{ module: "minerador", action: "edit" }], async ({ access }) => {
    // O MESMO núcleo do "Reforçar publicados" (lib/server/minerador-keyword-decision-core.ts).
    return runKeywordLogicWithCore({ brandId: access.brandId, keywordIds });
  }));

  server.registerTool("measure_keywords", {
    title: "Medir Volume (Google Ads)",
    description: [
      "Mede o Volume das keywords no Google Ads, como o botão 'Volume' do Processador (SDD MCP ponta a ponta, F1). Aprovar keyword exige Lógica e Volume: use depois de import_subject_keywords e run_keyword_logic.",
      "Sempre primeiro mode 'plan' (grátis, só lê): devolve as keywords que existem na marca, o número de blocos de 200 e o planHash. Mostre ao usuário.",
      "Ler antes de buscar (F3, D4): o plano traz alreadyKnown — as que já têm volume medido no Google Ads (vale até 'medir de novo' explícito) ou 'sem média' há menos de 30 dias — e toMeasureFirstTime. Diga 'já temos X, falta Y' e, salvo pedido explícito de medir de novo, gere o plano só com as que faltam.",
      "Custo em dinheiro: zero (o Google Ads não cobra a consulta), mas gasta a cota do Google Ads da marca: por isso o aceite e o escopo provider.spend. Não apresente como gasto em dinheiro.",
      `Só com o aceite dele chame mode 'execute' com o mesmo keywordIds, o planHash do plano e userConfirmation. Até ${VOLUME_MEASURE_MAX_KEYWORDS} keywords por chamada.`,
      "O execute relê cada keyword: 'medida' tem volume confirmado; 'sem_media' é processada, sem dado (não é falha); 'falhou' traz o motivo. Cota atingida para o lote; o que já voltou fica gravado.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["plan", "execute"]),
      keywordIds: z.array(z.string().uuid()).min(1).max(VOLUME_MEASURE_MAX_KEYWORDS),
      planHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: paid,
  }, async ({ brandId, mode, keywordIds, planHash, userConfirmation }) => {
    const executar = mode === "execute";
    if (executar && !userConfirmation) return asText({ ok: false, code: "human_confirmation_required", message: "Mostre o plano (cota do Google Ads, sem custo em dinheiro), peça o aceite e envie as palavras dele em userConfirmation." });
    if (executar && !planHash) return asText({ ok: false, code: "plan_hash_required", message: "Chame mode 'plan' e envie o planHash dele no execute." });
    const escopos = executar ? ["minerador.write", "provider.spend"] as const : "platform.read" as const;
    return call("measure_keywords", escopos, { brandId, humanConfirmation: executar ? userConfirmation : null }, [{ module: "minerador", action: executar ? "edit" : "view" }], async ({ access }) => {
      const context = await resolvePipelineContext({ brandId: access.brandId, module: "minerador", action: executar ? "edit" : "view" }, { requireActorUserId: async () => principal.actorId });
      const { measureKeywordVolume, planKeywordVolume } = await import("./minerador-volume-measure");
      const plan = await planKeywordVolume(context, keywordIds);
      if (!executar) return { mode, ...plan, readOnly: true };
      if (plan.planHash !== planHash) throw new PlatformToolFailure("plan_stale", { message: "As keywords mudaram desde o plano. Gere um plano novo e peça o aceite de novo." });
      if (!plan.keywordIds.length) throw new PlatformToolFailure("nothing_to_measure", { message: "Nenhuma das keywords pedidas existe nesta marca.", missingIds: plan.missingIds });
      const result = await measureKeywordVolume(context, plan.keywordIds);
      return { mode, planHash, missingIds: plan.missingIds, ...projectVolumeResultForAgent(result, PLATFORM_TOOL_RESULT_MAX_BYTES - 1024) };
    });
  });

  /* ============================== Arquiteto =========================== */

  server.registerTool("send_keywords_to_arquiteto", {
    title: "Enviar keywords aprovadas ao Arquiteto",
    description: "Use quando o usuário já aprovou as keywords no Minerador: transfere ao Arquiteto (idempotente). A resposta traz requested, sent e notSent: keyword não aprovada (ou aprovada e alterada depois) não vai e aparece em notSent com o motivo; se nenhuma for elegível, a resposta é o erro nothing_eligible. Aprovação incompleta (sem Lógica ou Volume) ou página de destino fora do domínio recusa o lote inteiro. Formar artigos e silos continua na tela do Arquiteto.",
    inputSchema: z.object({ brandId: brandIdInput, keywordIds: z.array(z.string().uuid()).min(1).max(500) }),
    annotations: write,
  }, async ({ brandId, keywordIds }) => call("send_keywords_to_arquiteto", "arquiteto.write", { brandId }, [{ module: "arquiteto", action: "create" }], async ({ access }) => {
    const context = await resolvePipelineContext(
      { brandId: access.brandId, module: "arquiteto", action: "create" },
      { requireActorUserId: async () => principal.actorId },
    );
    return reportArquitetoHandoff(keywordIds, await createMineradorArquitetoHandoff(context, keywordIds));
  }));

  server.registerTool("plan_published_differentiation", {
    title: "Publicados que disputam o mesmo assunto",
    description: [
      "Use para achar canibalização entre páginas publicadas da marca e montar a prévia da diferenciação (SDD 2026-09-27).",
      "mode 'detect' (grátis, só lê o cache de SERP): os grupos de publicados com 3 ou mais páginas em comum no top 10 (4 lentes), com o Posto, o volume e quem ranqueia (posição).",
      "mode 'preview' com o groupId de um grupo (grátis, grava a prévia): o ângulo de cada página, as chamadas, a faixa de custo (teto de US$ 0,50 por grupo, com os cortes) e o planHash. Mostre o custo ao usuário.",
      "A prévia nunca apaga uma rodada paga nem desfaz 'Manter como está': grupo mantido (erro DIFFERENTIATION_GROUP_KEPT) ou com avaliação gravada (DIFFERENTIATION_EVALUATION_PENDING) é recusado — o usuário reabre o resultado ou pede uma nova rodada na tela. Cada grupo do 'detect' traz proposal (estado e se já há avaliação).",
      "Buscar as keywords (pago) e aceitar a diferenciação são atos humanos na tela do Arquiteto; não há ferramenta para isso. Nada aqui apaga, redireciona, funde nem muda URL, slug ou canonical.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["detect", "preview"]).default("detect"),
      groupId: z.string().regex(/^dg-[0-9a-f]{16}$/).optional().describe("O groupId devolvido pelo mode 'detect'."),
    }),
    annotations: write,
  }, async ({ brandId, mode, groupId }) => {
    const previa = mode === "preview";
    if (previa && !groupId) return asText({ ok: false, code: "group_required", message: "A prévia é de um grupo: rode mode 'detect' e passe o groupId." });
    const acao = previa ? "edit" as const : "view" as const;
    return call("plan_published_differentiation", previa ? "arquiteto.write" : "platform.read", { brandId }, [{ module: "arquiteto", action: acao }], async ({ access }) => {
      // O mesmo núcleo da rota /api/arquiteto/cannibalization/plan, sem a IA da plataforma.
      const context = await resolvePipelineContext(
        { brandId: access.brandId, module: "arquiteto", action: acao },
        { requireActorUserId: async () => principal.actorId },
      );
      const outcome = await handleDifferentiationPlan({ store: context, now: () => new Date() }, { brandId: access.brandId, groupId: previa ? groupId : undefined, ai: false });
      if (outcome.status >= 400) throw new PlatformToolFailure(String(outcome.body.code || "differentiation_refused"), { message: outcome.body.error ?? null });
      return outcome.body.data;
    });
  });

  server.registerTool("preview_published_reinforcement", {
    title: "Reforçar publicados: prévia (grátis)",
    description: [
      "Use para mostrar ao usuário o que o botão 'Reforçar publicados' do Arquiteto gravaria (SDD 2026-09-28): por página publicada, se nasce o primeiro ArticleDNA ou uma versão nova, quais keywords do Minerador entram (as que o cartão mostra e as marcadas), quais keywords novas da busca em lote vão como sugestão ao Minerador (F4: o Arquiteto só lê keyword — elas não entram no artigo agora; o usuário importa, mede e aprova no Minerador, em 'Sugestões do Arquiteto'), a troca da principal aceita e o que fica de fora, com o motivo.",
      "Grátis e sem gravar: relê publicados, Posto, cache de SERP e o resultado gravado da busca. Devolve decisionHash e as frases da confirmação.",
      "Confirmar (gravar) e a busca paga em lote são atos humanos na tela do Arquiteto; não há ferramenta para isso. URL, slug e canonical nunca mudam.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      pages: z.array(z.object({
        publishedKeywordId: z.string().min(1).max(80).describe("O id da keyword publicada (a principal da página)."),
        keywordIds: z.array(z.string().min(1).max(80)).max(10).default([]).describe("Keywords do Minerador que devem estar no artigo."),
        newKeywords: z.array(z.string().trim().min(1).max(200)).max(10).default([]).describe("Keywords novas do resultado da busca em lote desta página."),
        swapKeywordId: z.string().min(1).max(80).nullable().default(null).describe("A troca da principal que o usuário quer (Posto Livre)."),
      })).min(1).max(30),
    }),
    annotations: read,
  }, async ({ brandId, pages }) => call("preview_published_reinforcement", "platform.read", { brandId }, [{ module: "arquiteto", action: "view" }], async ({ access }) => {
    // O mesmo núcleo da rota /api/arquiteto/published-reinforcement (mode preview).
    const context = await resolvePipelineContext(
      { brandId: access.brandId, module: "arquiteto", action: "view" },
      { requireActorUserId: async () => principal.actorId },
    );
    // O MESMO schema da rota: publicado repetido, a mesma keyword em dois
    // publicados ou uma publicada como reforço são recusados antes de ler.
    const pedido = PublishedReinforcementRequestSchema.safeParse({ brandId: access.brandId, mode: "preview", pages });
    if (!pedido.success) throw new PlatformToolFailure("invalid_reinforcement_request", { message: pedido.error.issues.map(issue => issue.message).join(" ") });
    const outcome = await handlePublishedReinforcement(publishedReinforcementReadDeps(context), pedido.data);
    if (outcome.status >= 400) throw new PlatformToolFailure(String(outcome.body.code || "reinforcement_refused"), { message: outcome.body.error ?? null });
    return outcome.body.data;
  }));

  server.registerTool("improve_articles", {
    title: "Melhorar publicados e formar Assuntos",
    description: "Uma jornada para todos os publicados e Assuntos da marca. prepare (F3 · ler antes de buscar): sem authorizeReading só LÊ, de graça — acervo, DNAs, volume já medido (inclusive 'sem média' há menos de 30 dias), SERP em cache, Assunto, plano e trava — e devolve reading { known, missing, plan, sentences } ('Já temos · Falta · Custa'); mostre as frases ao usuário. Só com o aceite desse plano chame prepare de novo com authorizeReading { ai: true } (leitura editorial da IA, OpenRouter, recebe o resumo do DNA) e/ou { measure: true } (mede no Google Ads só o que falta: cota, sem custo em dólar; o Arquiteto NÃO grava a medição — ela vai guardada como sugestão ao Minerador). Mesmos insumos reaproveitam a execução anterior sem chamar a IA de novo. Busca nova no Google Ads só com discover: true, depois de aceite que cite o custo (até 2 chamadas por alvo sem proposta, teto 40, cota de Descoberta, sem custo em dólar); nunca automática. status: retomar. Linha com evidenceBasis editorial_ai é sugestão da IA: mostre o motivo de cada keyword e peça conferência. Mostre principal, entradas/saídas, transferências, enfoques, evidência e custos. collect: só com aceite específico do plano vigente e teto total US$ 1. apply: só após aceite editorial da prévia vigente; cada chamada avança um artigo, até state complete. O Arquiteto só LÊ keyword (F4): apply grava só ArticleDNA, composição e parecer, nunca importa, mede, roda a Lógica, aprova ou envia no Minerador; approveNewKeywords é recusado. Linha com needsMinerador (newKeywordIds, measureKeywordIds, logicKeywordIds) não é aceitável: as ideias viram 'Sugestões do Arquiteto' no Minerador; o usuário decide lá (ou, no chat, pelas ferramentas do Minerador: import_subject_keywords, measure_keywords, run_keyword_logic, decide_keywords, send_keywords_to_arquiteto, cada uma com o aceite dela) e depois prepare de novo aqui. Não reescreve nem publica no site. Principal Livre pode trocar; Travada, URLs, slugs, canonical e Silo publicados preservados. Nenhuma troca de sinônimos é apresentada como solução de canibalização. group (opcional: a cor, o id do grupo ou sem-grupo) recorta o prepare ao grupo — alvos e lista só do grupo, proteção da marca inteira; é a porta única para formar os artigos de um grupo com plano declarado (na tela, desde 2026-10-14: a planilha 'Artigos do plano' em Artigos novos). Com targetIds, só as linhas pedidas; principalChoice { alvo: keyword } troca a principal de um artigo do plano com a trava LIVRE por uma candidata da lista do Assunto (travada ou candidata fora da regra: a linha volta recusada com o motivo); origin: 'plan_sheet' devolve em refusedTargets, por item, o alvo que não é Assunto do plano recebido; excludePlanArticles: true deixa o Assunto com plano fora (só publicados).",
    inputSchema: ArticleImprovementRequestSchema.safeExtend({ userConfirmation: confirmationInput.optional() }),
    annotations: write,
  }, async ({ userConfirmation, ...request }) => {
    if (request.action !== "status" && !userConfirmation) return asText({ ok: false, code: "human_confirmation_required", message: "Exiba a prévia pertinente e envie o aceite específico do usuário. Preparar sem authorizeReading só lê o que já temos (grátis) e devolve 'Já temos · Falta · Custa'; com authorizeReading, chama a IA da plataforma (OpenRouter) e/ou mede no Google Ads (cota) só o que falta; com discover: true, também a busca nova no Google Ads (cota de Descoberta)." });
    // F3 · a leitura grátis não gasta provider; IA, medição e busca nova exigem provider.spend.
    const paga = request.action === "prepare" && (request.authorizeReading?.ai === true || request.authorizeReading?.measure === true || request.discover === true);
    // F4 · O ARQUITETO SÓ LÊ: aplicar não escreve no Minerador — nem escopo minerador.write nem permissão minerador:approve.
    const scopes = request.action === "status" ? ["platform.read"] as const : request.action === "prepare" ? (paga ? ["arquiteto.write", "provider.spend"] as const : ["arquiteto.write"] as const) : request.action === "collect" ? ["arquiteto.write", "provider.spend"] as const : ["arquiteto.write", "platform.decide"] as const;
    return call("improve_articles", scopes, { brandId: request.brandId, humanConfirmation: userConfirmation ?? null }, [{ module: "arquiteto", action: request.action === "status" ? "view" : "edit" }, ...(request.action === "apply" ? [{ module: "arquiteto", action: "approve" } as const] : [])], async ({ access }) => {
      const context = await resolvePipelineContext({ brandId: access.brandId, module: "arquiteto", action: request.action === "status" ? "view" : "edit" }, { requireActorUserId: async () => principal.actorId });
      const { handleArticleImprovement, improvementRuntime, projectImprovementRun } = await import("./arquiteto-article-improvement");
      const outcome = await handleArticleImprovement(improvementRuntime(context), ArticleImprovementRequestSchema.parse({ ...request, brandId: access.brandId }));
      return projectImprovementRun(outcome);
    });
  });

  /*
   * 2026-10-12 · SDD do plano declarado §11 passo 7 (D7): o plano no Silo já
   * consolidado — Pilar, ordem, nome, objetivo e slug (se não publicado). O
   * MESMO núcleo da rota /api/arquiteto/silo-declared-plan; a aprovação é
   * decisão humana aceita no chat, com o decisionHash da prévia.
   */
  server.registerTool("apply_declared_plan_to_silo", {
    title: "Aplicar o plano declarado ao Silo",
    description: [
      "Decisão delegada pelo usuário no chat para um Silo JÁ consolidado: troca o Pilar pelo Pilar declarado no plano, aplica a ordem do plano, o nome e o objetivo do Silo planejado e o slug (só se a SiloPage não estiver publicada nem tiver canonical). Grava SiloDNA e SiloPage em versão nova (as aprovadas ficam no histórico) e liga o grupo do plano ao Silo.",
      "Faça mode=preview e mostre ao usuário as mudanças e os avisos; só depois do aceite explícito chame mode=apply com o mesmo decisionHash e userConfirmation contendo as palavras do usuário. Sem mudança real, não há versão nova.",
      "Recusa: Pilar atual publicado, plano que não vale para os artigos do Silo. Artigo fora do plano ainda no Silo: com withdrawNonPlan: true a prévia o lista com 'retirar do Silo' marcado (ArticleDNA preservado, keywords de volta a não agrupadas) e o apply retira (núcleo da retirada) e aplica o plano numa decisão, com um decisionHash só; sem withdrawNonPlan, a recusa de sempre. Retirada que falha para tudo e o plano não é aplicado. URL, slug e canonical publicados nunca mudam. Depois de aplicar, o grafo de links internos precisa ser processado de novo na tela (Links internos → Processar links).",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      siloId: z.string().trim().min(1).max(256).describe("O siloId do SiloDNA (ex.: territory:<uuid>)."),
      mode: z.enum(["preview", "apply"]),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      withdrawNonPlan: z.boolean().optional().describe("SDD acelerar 2026-10-13, item 10: retirar do Silo os artigos fora do plano e aplicar o plano numa decisão."),
      withdrawArticleIds: z.array(z.string().min(1)).max(60).optional().describe("Os artigos fora do plano que o usuário manteve marcados para retirar (ausente = todos)."),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, siloId, mode, decisionHash, withdrawNonPlan, withdrawArticleIds, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e aplique com o mesmo decisionHash." });
    }
    const scopes = mode === "apply" ? ["arquiteto.write", "platform.decide"] as const : ["platform.read"] as const;
    const permissions = mode === "apply" ? [{ module: "arquiteto", action: "edit" } as const, { module: "arquiteto", action: "approve" } as const] : [{ module: "arquiteto", action: "view" } as const];
    return call("apply_declared_plan_to_silo", scopes, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, permissions, async ({ access }) => {
      const context = await resolvePipelineContext({ brandId: access.brandId, module: "arquiteto", action: mode === "apply" ? "edit" : "view" }, { requireActorUserId: async () => principal.actorId });
      const { handleSiloDeclaredPlan, siloDeclaredPlanRuntime } = await import("./arquiteto-silo-declared-plan");
      const result = withdrawNonPlan
        ? await (await import("./arquiteto-silo-plan-with-withdrawal")).handleSiloDeclaredPlanWithWithdrawal(siloDeclaredPlanRuntime(context), (await import("./arquiteto-silo-article-withdrawal")).siloArticleWithdrawalRuntime(context), { siloId, mode, withdrawArticleIds: withdrawArticleIds ?? null, decisionHash: decisionHash?.toLowerCase() ?? null })
        : await handleSiloDeclaredPlan(siloDeclaredPlanRuntime(context), { siloId, mode, decisionHash: decisionHash?.toLowerCase() ?? null });
      // F5 — a recusa leva o veredito da guarda ("a mesma recusa de <data>"), quando há.
      if (result.state === "REFUSED") throw new PlatformToolFailure(result.code === "STALE_DECISION" ? "decision_stale" : `silo_plan_${result.code.toLowerCase()}`, { message: result.message, ...("rework" in result && result.rework ? { rework: result.rework } : {}), ...("articleIds" in result && result.articleIds ? { articleIds: result.articleIds } : {}) });
      return mode === "preview" ? { ...result, readOnly: true } : { ...result, readbackConfirmed: result.state === "APPLIED" };
    });
  });

  /*
   * 2026-10-13 · CONVERSÃO DO FORMATO ANTERIOR, lado do Arquiteto (SDD
   * `sdd-conversao-assunto-legado-2026-10-13.md` §7): o MESMO núcleo da rota
   * /api/arquiteto/subject-conversion. A versão nova do ArticleDNA nasce
   * aprovada, decisão humana aceita no chat com o decisionHash da prévia.
   */
  server.registerTool("update_article_subject", {
    title: "Atualizar o Assunto dos artigos (conversão do formato anterior)",
    description: [
      "Depois de convert_legacy_subjects, cada artigo cujo Assunto ainda aponta para a linha-título ganha uma versão nova do ArticleDNA com o Assunto na keyword nova (pacote aprovado dela), o papel e a promessa do plano. A principal, o slug e as keywords do artigo não mudam; as versões anteriores ficam no histórico.",
      "Faça mode=preview e mostre ao usuário a troca de cada artigo e os impedimentos; só depois do aceite explícito chame mode=apply com o mesmo decisionHash e userConfirmation. Sem artigo pendente, a resposta é nothing_to_convert. Com o plano do grupo, o passo seguinte é apply_declared_plan_to_silo.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      articleIds: z.array(z.string().trim().min(1).max(400)).max(60).optional(),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, articleIds, decisionHash, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e aplique com o mesmo decisionHash." });
    }
    const scopes = mode === "apply" ? ["arquiteto.write", "platform.decide"] as const : ["platform.read"] as const;
    const permissions = mode === "apply" ? [{ module: "arquiteto", action: "edit" } as const, { module: "arquiteto", action: "approve" } as const] : [{ module: "arquiteto", action: "view" } as const];
    return call("update_article_subject", scopes, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, permissions, async ({ access }) => {
      const context = await resolvePipelineContext({ brandId: access.brandId, module: "arquiteto", action: mode === "apply" ? "edit" : "view" }, { requireActorUserId: async () => principal.actorId });
      const { handleArticleSubjectConversion } = await import("./arquiteto-subject-conversion");
      const result = await handleArticleSubjectConversion(context, { mode, articleIds: articleIds ?? null, decisionHash: decisionHash?.toLowerCase() ?? null });
      if (result.state === "REFUSED") throw new PlatformToolFailure(result.code === "STALE_DECISION" ? "decision_stale" : result.code.toLowerCase(), { message: result.message });
      return mode === "preview" ? { ...result, readOnly: true } : { ...result, readbackConfirmed: result.state === "APPLIED" && result.failed === 0 };
    });
  });

  /* ================================ Radar ============================= */

  server.registerTool("send_radar_to_writer", {
    title: "Enviar artigos do Radar ao Redator",
    description: [
      "Use quando o usuário já finalizou a investigação no Radar: cria o documento do Redator a partir do pacote, um artigo por vez (em lote, na ordem). Idempotente; documento existente com outro pacote nunca é sobrescrito.",
      "O envio exige o artigo-modelo da SERP concluído do pacote (o mesmo núcleo da tela): sem ele, o artigo é recusado com o código radar_handoff_article_blueprint_missing, o bloqueio ARTICLE_BLUEPRINT_MISSING e a ação na tela (onde organizar e o custo, até 2 chamadas de IA por artigo, dito no botão). O MCP não organiza o artigo-modelo: mostre ao usuário onde clicar.",
      "Reporte o desfecho de cada artigo: a falha traz o código, a mensagem e, quando a prontidão bloqueia, os bloqueios (blocks). Se nenhum artigo for enviado, a resposta é o erro radar_writer_all_failed com os resultados.",
    ].join(" "),
    inputSchema: z.object({ brandId: brandIdInput, articleIds: z.array(z.string().trim().min(1).max(256)).min(1).max(30) }),
    annotations: write,
  }, async ({ brandId, articleIds }) => call("send_radar_to_writer", "radar.write", { brandId },
    [{ module: "radar", action: "edit" }, { module: "redator", action: "create" }], async ({ access }) =>
      sendArticlesToWriter(articleIds, articleId => sendRadarToWriter({ brandId: access.brandId, articleId, actorId: principal.actorId, sentAt: new Date().toISOString() }),
        articleId => radarArticleScreen(access, articleId))));

  /*
   * 2026-10-13 · F5 (SDD acelerar-fluxo-do-plano, item 14) · O RADAR ACOMPANHA O
   * ARQUITETO. O MESMO núcleo da rota /api/editorial/radar-architect-update:
   * prévia com platform.read; adoção com radar.write + platform.decide, aceite
   * do usuário no chat e o decisionHash da prévia. Nada pago, nada de IA; o
   * Arquiteto não é tocado. 2026-10-14 · cobre também o grafo de links novo
   * (`links_changed`, `kinds`), pelo mesmo núcleo.
   */
  server.registerTool("adopt_architect_version", {
    title: "Adotar no Radar a versão nova do ArticleDNA ou os links novos do grafo",
    description: [
      "Quando o Arquiteto aprova uma versão nova de um artigo que já está no Radar, o item mostra 'Atualização disponível do Arquiteto · vN → vM' (rótulo do Radar, diferente do 'Atualização disponível' da publicação). mode=preview lista os itens atrás, o que mudou (principal, slug, keywords, papel, promessa/escopo, Assunto), a classe (mesma base de pesquisa, composição mudou, principal mudou), o que continua valendo, o que fica para refazer, o custo e quem é recusado e por quê.",
      "Mostre a prévia ao usuário; só depois do aceite explícito chame mode=apply com os mesmos articleIds (ou o mesmo siloId) e o decisionHash da prévia, e userConfirmation com as palavras do usuário. Desmarcar um artigo é a recusa por item: tire-o de articleIds e gere a prévia de novo para ter o hash daquele conjunto.",
      "A adoção troca o item para a versão nova pelo mesmo caminho do envio, reaproveita a investigação que continua válida numa versão nova da análise e marca o que precisa ser refeito; a releitura do servidor confirma. Nada pago e nada de IA na adoção; refazer uma pesquisa (quando a prévia diz) é na tela, com o custo no botão.",
      "Recusas: investigação congelada, pacote aprovado ou enviado ao Redator (a troca só depois de um congelamento novo, que esta fase ainda não faz: o item e os entregáveis seguem na versão enviada), slug publicado que mudaria, Silo não resolvido. O Radar não reagrupa, não troca a principal por conta própria nem muda slug, canonical ou URL publicada.",
      "Links (2026-10-14): quando o grafo de links aprovado vigente do Silo é mais novo que o transportado pelo item, a prévia traz também 'Atualização disponível do Arquiteto · links · grafo vA → vB' (updateKind=links, classe links_changed), com os links que entram e saem por destino, a obrigação (obrigatório no corpo, no corpo se a seção tratar, trilha 'Continue no Silo') e quem aponta para o artigo. Adotar troca só os links do item, sem refazer a pesquisa e sem nada pago (links não mudam a SERP), também em item finalizado, aprovado ou enviado ao Redator; o artigo-modelo e o CSV leem a malha nova na leitura. kinds escolhe o que aplicar (padrão: as duas); com uma só, use o hash dela em decisionHashByKind.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      articleIds: z.array(z.string().trim().min(1).max(400)).max(60).optional(),
      siloId: z.string().trim().min(1).max(400).optional().describe("Recorte pelo Silo (o lote do Silo)."),
      kinds: z.array(z.enum(["article_dna", "links"])).min(1).max(2).optional().describe("O que aplicar: 'article_dna' (versão nova do ArticleDNA) e/ou 'links' (grafo de links novo). Padrão: as duas."),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, articleIds, siloId, kinds, decisionHash, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e aplique com o mesmo decisionHash." });
    }
    const scopes = mode === "apply" ? ["radar.write", "platform.decide"] as const : ["platform.read"] as const;
    const permissions = mode === "apply" ? [{ module: "radar", action: "edit" } as const] : [{ module: "radar", action: "view" } as const];
    return call("adopt_architect_version", scopes, { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, permissions, async ({ access }) => {
      const { adoptArchitectVersionWithCore, previewArchitectUpdatesWithCore } = await import("./radar-architect-adoption");
      const { supabaseRadarArchitectAdoptionStore } = await import("./radar-architect-adoption-store");
      const store = supabaseRadarArchitectAdoptionStore(getOperationalClient());
      const previa = await previewArchitectUpdatesWithCore(store, { brandId: access.brandId, articleIds: articleIds ?? null, siloId: siloId ?? null });
      if (mode === "preview") return { ...previa, screen: "Radar → faixa 'Atualização disponível do Arquiteto' → 'Ver e adotar'" };
      /* 2026-10-14 · as duas atualizações (versão nova e links), ou só a de `kinds`. */
      const tipos = new Set(kinds?.length ? kinds : ["article_dna", "links"]);
      const doTipo = (tipo: string) => previa.items.filter(item => (item.updateKind ?? "article_dna") === tipo);
      const comLinks = new Set(doTipo("links").map(item => item.articleId));
      const comVersao = new Set(doTipo("article_dna").map(item => item.articleId));
      const escolhidos = doTipo("article_dna").filter(item => item.adoptable).map(item => item.articleId);
      const escolhidosLinks = doTipo("links").filter(item => item.adoptable).map(item => item.articleId);
      const resultado = await adoptArchitectVersionWithCore(store, {
        brandId: access.brandId, actorId: principal.actorId,
        articleIds: !tipos.has("article_dna") ? [] : articleIds?.length ? articleIds.filter(id => comVersao.has(id) || !comLinks.has(id)) : escolhidos,
        linkArticleIds: !tipos.has("links") ? [] : articleIds?.length ? articleIds.filter(id => comLinks.has(id)) : escolhidosLinks,
        decisionHash: decisionHash!.toLowerCase(),
      });
      if (resultado.state === "REFUSED") throw new PlatformToolFailure(resultado.code === "STALE_DECISION" ? "decision_stale" : "nothing_to_adopt", { message: resultado.message });
      return resultado;
    });
  });

  /*
   * 2026-10-14 · F5 · LINKS A ATIVAR E "ATUALIZAR LINKS DO SILO" (SDD silo
   * interligado §6.5 e D10). Leitura, pelo MESMO núcleo do painel do Radar e do
   * `-links.csv` do .zip da exportação por artigo (`radarSiloLinksRead`). Nunca
   * altera a página publicada, a URL, o slug nem o canonical.
   */
  server.registerTool("get_silo_links_update", {
    title: "Links a ativar e o que falta da malha do Silo (só lista)",
    description: [
      "Use quando um destino do Silo foi ao ar, quando o usuário quer atualizar os links de artigos publicados ou conferir a malha do Silo: devolve, para o artigo (scope 'article') ou para todos os artigos do Silo dele (scope 'silo', o padrão), cada link da malha (L no corpo, T na trilha 'Continue no Silo') com a situação — 'ativar' (o destino estava novo na planta e foi ao ar: a âncora que ficou como texto simples vira link), 'falta_na_pagina' (o artigo está no ar e a página não tem o link), 'conferir' (página não lida agora), 'escrever_com_link', 'aguardar_destino' (destino ainda não publicado: texto simples até ir ao ar) ou 'na_pagina' —, a âncora natural, onde entra (seção ou trilha) e a URL; o resumo 'malha X/Y' do Silo; e o CSV de cada artigo ('<NN>-<papel>-<slug>-links.csv', o mesmo do .zip da exportação por artigo).",
      "Só lista: a plataforma nunca altera a página publicada, a URL, o slug nem o canonical; quem inclui o link é o usuário, no site dele.",
      "Grátis: só lê o que o Radar já tem e as páginas publicadas (GET, a mesma leitura do CSV 'Para escrever'); nunca chama provider nem IA. Artigo sem artigo-modelo concluído sai em withoutRow, com o motivo.",
    ].join(" "),
    inputSchema: z.object({ brandId: brandIdInput, articleId: z.string().trim().min(1).max(256), scope: z.enum(["article", "silo"]).optional(), includeCsv: z.boolean().optional() }),
    annotations: read,
  }, async ({ brandId, articleId, scope, includeCsv }) => call("get_silo_links_update", "platform.read", { brandId }, [{ module: "radar", action: "view" }], async ({ access }) => {
    const { radarSiloLinksRead } = await import("./radar-silo-links");
    const leitura = await radarSiloLinksRead({ brandId: access.brandId, articleId, scope: scope ?? "silo", actorUserId: principal.actorId, supabase: getOperationalClient() });
    return {
      articleId, exportedAt: leitura.exportedAt, siloLabel: leitura.siloLabel, summary: leitura.summary, notice: leitura.notice,
      articles: leitura.articles.map(({ csv, ...artigo }) => ({ ...artigo, ...(includeCsv ? { csv } : {}) })),
      withoutRow: leitura.withoutRow,
    };
  }));

  /*
   * 2026-10-14 · A SERP CRUA DE UM ARTIGO (SDD silo interligado §16.1, decisão do
   * dono). Ferramenta própria, e não uma mudança em get_article_for_writing: o
   * contrato e o arquivo de escrita ficam iguais (o E0 trava os dois), e a SERP
   * crua é leitura opcional, pedida só para conferir a SERP. O MESMO arquivo que a
   * tela põe no .zip da exportação por artigo (`radarMcpSerpRawForArticle`, pela
   * montagem do export e por `radarSerpRawExport`), em partes como o CSV de escrita.
   */
  server.registerTool("get_article_serp_raw", {
    title: "SERP crua do artigo, para conferir fora da plataforma",
    description: [
      "Use quando o usuário (ou você) quer conferir a SERP de um artigo fora da plataforma: devolve o MESMO arquivo '<NN>-<papel>-<slug>-serp.csv' que a exportação por artigo da tela põe no .zip, ao lado do CSV 'Para escrever'.",
      "Uma linha por resultado orgânico por lente (as 4 lentes): lente, posição, URL, domínio, data da coleta, título, trecho, estrutura de títulos da página (H1/H2) e sinais (data visível, autor, resumo de IA no topo); linhas de 'Pessoas também perguntam' (com a resposta exibida e a fonte), buscas relacionadas e as fontes citadas pelo resumo de IA. A coluna relevancia_d11 marca, sem esconder, o concorrente fora do leitor, fora do território ou com medida fora da curva.",
      "No fim (2026-10-14), as fontes citadas pelos concorrentes (todo link externo de conteúdo das páginas lidas, sem verificação) e as fontes verificadas no Radar (id X, URL, entidade, trecho e a afirmação que sustentam, com YMYL marcado) ou não conferidas (com o motivo). Elas ainda não estão no artigo-modelo nem no CSV de escrita.",
      "Nunca traz o texto integral das páginas (só título, trecho, estrutura de títulos e URL): é referência para conferir, não para copiar.",
      `Grátis: só lê o que o Radar já coletou e o resumo do cache das lentes extras; nunca chama provider nem IA e não precisa do artigo-modelo. O CSV vem em partes de até ${Math.round(SERP_RAW_PART_CHARS / 1000)} mil caracteres: peça part 1, 2, … até parts e junte na ordem. Artigo sem investigação finalizada volta recusado com o motivo.`,
    ].join(" "),
    inputSchema: z.object({ brandId: brandIdInput, articleId: z.string().trim().min(1).max(256), part: z.number().int().min(1).max(200).optional() }),
    annotations: read,
  }, async ({ brandId, articleId, part }) => call("get_article_serp_raw", "platform.read", { brandId }, [{ module: "radar", action: "view" }], async ({ access }) => {
    const { radarMcpSerpRawForArticle } = await import("./radar-mcp-material");
    const serp = await radarMcpSerpRawForArticle({ brandId: access.brandId, articleId, supabase: getOperationalClient(), actorUserId: principal.actorId });
    if (serp.status === "refused") throw new PlatformToolFailure(serp.code, { message: serp.reason });
    return { articleId, filename: serp.filename, exportedAt: serp.exportedAt, rows: serp.rows, ...sliceWritingCsv(serp.csv, part ?? 1, SERP_RAW_PART_CHARS) };
  }));

  server.registerTool("get_article_for_writing", {
    title: "Material do artigo para escrever fora da plataforma",
    description: [
      "Use quando o usuário vai escrever o artigo no ambiente dele (e não no Redator): devolve o MESMO CSV do botão 'Para escrever' do Radar, de um artigo com investigação finalizada e artigo-modelo da SERP concluído.",
      "Título, promessa, estrutura, links internos e plano visual saem só do artigo-modelo; traz também identidade da página (URL, slug e canonical protegidos quando publicada), principal e secundárias, SERP das 4 lentes, perguntas, fontes, autoridade, identidade visual e se pode escrever (coluna pode_escrever).",
      "Artigo com grupo de cor: a coluna artigo diz o grupo (a cor e o nome, ex.: 'Grupo: Laranja · Planos e contratação') e a promessa declarada do ArticleDNA (no plano do Silo, a descrição do artigo), e a resposta traz group (color, colorLabel, name, text) ou null.",
      `Grátis: só lê o que o Radar já congelou; nunca chama provider nem IA. Uma chamada por artigo; o CSV vem em partes de até ${Math.round(WRITING_CSV_PART_CHARS / 1000)} mil caracteres: peça part 1, 2, … até parts e junte na ordem.`,
      "Sem o artigo-modelo concluído, a resposta é o erro needs_article_blueprint com o que falta, o teto do custo de organizar e a ação na tela; nada sai pelo processo antigo. Artigo sem investigação finalizada volta recusado com o motivo; finalize no Radar antes.",
    ].join(" "),
    inputSchema: z.object({ brandId: brandIdInput, articleId: z.string().trim().min(1).max(256), part: z.number().int().min(1).max(200).optional() }),
    annotations: read,
  }, async ({ brandId, articleId, part }) => call("get_article_for_writing", "platform.read", { brandId }, [{ module: "radar", action: "view" }], async ({ access }) => {
    const pronto = await materialDoRadar(access, articleId, "writing");
    const grupo = pronto.group ? { color: pronto.group.color, colorLabel: pronto.group.colorLabel, name: pronto.group.name, text: pronto.group.text } : null;
    return { articleId, filename: pronto.filename, canWrite: pronto.blocked === 0, exportedAt: pronto.exportedAt, group: grupo, ...sliceWritingCsv(pronto.csv, part ?? 1, WRITING_CSV_PART_CHARS) };
  }));

  /*
   * 2026-10-09 · O MATERIAL DO VÍDEO PELO MCP (inventário do YouTube, item 7).
   *
   * O MESMO CSV do botão "CSV para vídeo e redes sociais", pelo mesmo núcleo
   * da rota (`radarMcpMaterialForArticle`, modo vídeo): capítulos = seções do
   * artigo-modelo, cortes pela utilidade, formato decidido pela amostra
   * pertinente e faixa de duração por coorte. Leitura, sem custo, com o
   * escopo de leitura que já existe (platform.read + radar:view).
   */
  server.registerTool("get_video_material", {
    title: "Material do vídeo (CSV para vídeo e redes sociais)",
    description: [
      "Use quando o artigo também vai virar vídeo, cortes ou carrossel: devolve o MESMO CSV do botão 'CSV para vídeo e redes sociais' do Radar, de um artigo com investigação finalizada e artigo-modelo da SERP concluído.",
      "Os capítulos são as seções do artigo-modelo; os cortes são escolhidos pela utilidade; o formato é decidido pela amostra pertinente do YouTube (formato curto só quando os Shorts pertinentes lideram e são pelo menos 4, e aí o curto é o recorte do artigo-modelo); a duração é a faixa por coorte dos vídeos pertinentes; traz também o gancho, o CTA para o artigo, o carrossel, o storyboard e a cadeia competitiva.",
      `Grátis: só lê o que o Radar já congelou (e o resumo do cache de SERP das lentes extras); nunca chama provider nem IA. Uma chamada por artigo; o CSV vem em partes de até ${Math.round(WRITING_CSV_PART_CHARS / 1000)} mil caracteres: peça part 1, 2, … até parts e junte na ordem. A coluna pode_gravar diz se há ressalva.`,
      "Sem o artigo-modelo concluído, a resposta é o erro needs_article_blueprint com o que falta, o teto do custo de organizar e a ação na tela; não há roteiro pelo processo antigo. Artigo sem investigação finalizada volta recusado com o motivo.",
    ].join(" "),
    inputSchema: z.object({ brandId: brandIdInput, articleId: z.string().trim().min(1).max(256), part: z.number().int().min(1).max(200).optional() }),
    annotations: read,
  }, async ({ brandId, articleId, part }) => call("get_video_material", "platform.read", { brandId }, [{ module: "radar", action: "view" }], async ({ access }) => {
    const pronto = await materialDoRadar(access, articleId, "video");
    return { articleId, filename: pronto.filename, withoutYoutube: pronto.withoutYoutube > 0, exportedAt: pronto.exportedAt, ...sliceWritingCsv(pronto.csv, part ?? 1, WRITING_CSV_PART_CHARS) };
  }));

  /** O material do Radar de um artigo, pelo núcleo da rota de export; sem a planta, a falha explícita. */
  async function materialDoRadar(access: WriterMcpBrandAccess, articleId: string, mode: "writing" | "video") {
    const { radarMcpMaterialForArticle } = await import("./radar-mcp-material");
    let material: RadarMcpMaterial;
    try {
      material = await radarMcpMaterialForArticle({ brandId: access.brandId, articleId, mode, supabase: getOperationalClient(), actorUserId: principal.actorId });
    } catch (error) {
      throw radarMaterialReadFailure(error) ?? error;
    }
    return radarMaterialOrFailure(material, radarArticleScreen(access, articleId));
  }
}

/** Folga para o escape do JSON (aspas e quebras de linha do CSV) dentro do teto de bytes. */
const WRITING_CSV_PART_CHARS = 12_000;

/** 2026-10-14 · As partes da SERP crua (`get_article_serp_raw`): o mesmo teto do CSV de escrita. */
const SERP_RAW_PART_CHARS = 12_000;
