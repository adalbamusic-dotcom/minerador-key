import "server-only";
import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { PLATFORM_CATALOG_HASH } from "@/lib/agent/catalog-hash";
import { PLATFORM_GUIDE_TOPICS, renderPlatformGuide } from "@/lib/agent/platform-catalog";
import { resolveNextActions } from "@/lib/agent/next-actions";
import { pathOfUrl, SILO_ARTICLE_RANGE, SiloPlanSchema, validateSiloPlan } from "@/lib/agent/silo-plan";
import { lookupTopic, type TopicCandidate } from "@/lib/agent/topic-match";
import { MINERADOR_EDITORIAL_STATUSES, resolveEditorialKeywordStatus, resolveEffectiveKeywordStatus } from "@/lib/minerador/editorial-status";
import { applyApproval, approvedPackageDiverged, readApprovalRecord, resolveApprovalReadiness } from "@/lib/minerador/approved-package";
import { readKgrApplicability } from "@/lib/minerador/kgr-applicability";
import { planKgrApplicabilityBatch } from "@/lib/minerador/kgr-applicability-batch";
import { KEYWORD_PAGE_TYPES, KEYWORD_PAGE_TYPE_STANCES } from "@/lib/minerador/keyword-page-type";
import { planVinculoBatchChoices, type VinculoBatchAction, type VinculoBatchReadbackRow } from "@/lib/minerador/vinculo-batch";
import { vinculoReadbackConfirmed } from "@/lib/minerador/vinculo-screen";
import { resolveKeywordSubject } from "@/lib/minerador/keyword-subject";
import { isKeywordPublished } from "@/lib/minerador/keyword-lifecycle";
import { GOOGLE_ADS_DISCOVERY_LANGUAGES } from "@/lib/minerador/google-ads-discovery-catalog";
import { deriveKgrVisualState, KGR_FULL_RANGE_LIMIT, kgrApplicabilityLabel } from "@/lib/minerador/kgr-applicability";
import { importSubjectsWithCore, type SubjectImportChannel } from "@/lib/minerador/keyword-import-core";
import { KEYWORD_PAGE_TYPE_KEY, KEYWORD_PAGE_TYPE_STANCE_KEY, keywordPageTypeStance } from "@/lib/minerador/keyword-page-type";
import { KEYWORD_SUBJECT_AT_KEY, KEYWORD_SUBJECT_KEY, KEYWORD_SUBJECT_ORIGIN_KEY } from "@/lib/minerador/keyword-subject";
import { resolveKeywordVinculo } from "@/lib/minerador/keyword-vinculo";
import { deriveLogicalKeywordBatchItem } from "@/lib/minerador/logical-batch";
import type { LegacyImportList } from "@/lib/minerador/legacy-import";
import { hasCompleteLogicalOutputContract, hasCurrentLogicalProcessorMetadata, LOGICAL_OUTPUT_CONTRACT_KEY } from "@/lib/minerador/logical-processor";
import { readCanonicalKeywordDna } from "@/lib/minerador/logical-read-model";
import { SERP_EVIDENCE_RECORD_KEY } from "@/lib/minerador/serp-evidence-record";
import { importSubjectDiscoveryWithCore, SubjectDiscoveryImportRequestSchema } from "@/lib/minerador/subject-discovery-import";
import { runSubjectDiscoverySearch, SubjectDiscoverySearchRequestSchema, type SubjectDiscoveryExecuteResponse } from "@/lib/minerador/subject-discovery-search";
import type { WriterMcpScope } from "@/lib/redator/mcp-consent-domain";
import { WRITER_EVIDENCE_LIMITS, writerEvidenceJsonBytes } from "@/lib/redator/writer-evidence-catalog";
import type { EditorialAction, EditorialModule } from "./editorial-authorization";
import { getOperationalClient, mapPersistenceError, OptimisticLockError, PersistenceUnavailableError } from "./editorial-db";
import { readPlatformState, readPublishedPagesForMatching, topicCandidatesFrom } from "./agent-platform-state";
import { createMineradorArquitetoHandoff } from "./arquiteto-workspace";
import { resolvePipelineContext } from "./pipeline-runtime";
import { RadarWriterSendError, sendRadarToWriter } from "./radar-writer-send";
import { RadarStartError } from "./radar-youtube-start";
import { ContentDocumentRepository } from "./editorial-repositories";
import { makeApprovedWriterDocument, saveAndFinalizeWriterDocument } from "./writer-document-finalization";
import { prepareWriterPublicationHandoff, sendWriterToPublications } from "./writer-publication-handoff";
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

type DecisionKeywordRow = {
  id: string;
  brand_id: string;
  keyword: string;
  status: string | null;
  intent: string | null;
  volume_search: number | null;
  results_allintitle: number | null;
  kgr_score: number | null;
  lista_id: string | null;
  analise_semantica: Record<string, unknown> | null;
};

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

async function readDecisionKeywords(brandId: string, ids: readonly string[]) {
  const uniqueIds = [...new Set(ids)];
  const { data, error } = await getOperationalClient().from("minerador_keywords")
    .select("id,brand_id,keyword,status,intent,volume_search,results_allintitle,kgr_score,lista_id,analise_semantica")
    .eq("brand_id", brandId).is("deleted_at", null).in("id", uniqueIds);
  if (error) mapPersistenceError(error);
  const rows = (data || []) as unknown as DecisionKeywordRow[];
  const byId = new Map(rows.map(row => [row.id, row]));
  return {
    rows: uniqueIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []),
    missingCount: uniqueIds.filter(id => !byId.has(id)).length,
  };
}

function approvalInput(row: DecisionKeywordRow) {
  return {
    keywordId: row.id,
    brandId: row.brand_id,
    keyword: row.keyword,
    intent: row.intent,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
    kgrScore: row.kgr_score,
    listaId: row.lista_id,
    semantic: row.analise_semantica,
  };
}

function keywordDecisionBase(row: DecisionKeywordRow) {
  const diverged = approvedPackageDiverged(approvalInput(row));
  return {
    id: row.id,
    keyword: row.keyword,
    status: resolveEffectiveKeywordStatus({ status: row.status, diverged }).status ?? "desconhecido",
    intent: row.intent,
    volume: row.volume_search,
    allintitle: row.results_allintitle,
    kgr: row.kgr_score,
    listaId: row.lista_id,
    semantic: row.analise_semantica,
  };
}

/**
 * `minerador_keywords` has no `updated_at`. Compare-and-swap the business
 * snapshot that determines eligibility inside the remote UPDATE, so a write
 * cannot overwrite a concurrent edit between preview and apply.
 */
function constrainKeywordSnapshot<T extends {
  eq: (column: string, value: unknown) => T;
  is: (column: string, value: null) => T;
  filter: (column: string, operator: string, value: string) => T;
}>(query: T, row: DecisionKeywordRow): T {
  let guarded = query.eq("keyword", row.keyword);
  const nullable: Array<[string, unknown]> = [
    ["status", row.status], ["intent", row.intent], ["volume_search", row.volume_search],
    ["results_allintitle", row.results_allintitle], ["kgr_score", row.kgr_score], ["lista_id", row.lista_id],
  ];
  for (const [column, value] of nullable) guarded = value === null ? guarded.is(column, null) : guarded.eq(column, value);
  guarded = row.analise_semantica === null
    ? guarded.is("analise_semantica", null)
    : guarded.filter("analise_semantica", "eq", JSON.stringify(row.analise_semantica));
  return guarded;
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
    const saved = await constrainKeywordSnapshot(
      db.from("minerador_keywords").update({ analise_semantica: update.semantic })
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
      : vinculoReadbackConfirmed({ id: update.id, brandId: input.brandId, keyword: current.keyword, semantic: update.semantic, demotesApproval: false },
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
    kgrUse: naoUtilizada ? "nao_utilizada" as const : applicability === "applicable" ? "aplicavel" as const : "decisao_pendente" as const,
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
 * estimativa do Labs: ~300 kB, bem acima do que um cliente MCP aceita numa
 * resposta de ferramenta. E as candidatas não ficam gravadas: repetir a
 * execução é recusado (OPERATION_ALREADY_EXECUTED). A IA recebe então uma
 * projeção compacta — o que ela precisa para escolher e para montar o
 * `import_subject_keywords` (keyword, volume do Ads, concorrência, `origins`,
 * melhor posição, uma evidência) — no mesmo teto de bytes das fatias do
 * Redator. A lista já vem ordenada por relevância (mais fontes, com métrica
 * do Ads, melhor posição); se não couber, ficam as primeiras e o corte vai em
 * `trimmed`, nunca em silêncio. A lista inteira segue na tela.
 */
export const PLATFORM_TOOL_RESULT_MAX_BYTES = WRITER_EVIDENCE_LIMITS.sliceMaxBytes;

export type AgentSubjectCandidate = {
  keyword: string;
  /** Média mensal do Google Ads; `null` quando a candidata não veio do Ads. Estimativa do Labs nunca vira volume. */
  volume: number | null;
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

export function describeWriterSendFailure(articleId: string, error: unknown): WriterSendOutcome {
  if (error instanceof RadarWriterSendError) {
    const blocks = (error.readiness?.blocks ?? []).map(({ code, message }) => ({ code, message }));
    return { articleId, ok: false, code: error.code, message: error.message, ...(blocks.length ? { blocks } : {}) };
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
) {
  const results: WriterSendOutcome[] = [];
  // Sequencial de propósito: cada envio grava sob trava otimista.
  for (const articleId of articleIds) {
    try {
      const resultado = await send(articleId);
      results.push({ articleId, ok: true, change: resultado.change, documentId: resultado.documentId, headline: resultado.headline });
    } catch (error) {
      results.push(describeWriterSendFailure(articleId, error));
    }
  }
  const enviados = results.filter(item => item.ok).length;
  const summary = `${enviados} de ${results.length} artigo(s) no Redator.`;
  if (!enviados) throw new PlatformToolFailure("radar_writer_all_failed", { summary, results });
  return { summary, sent: enviados, failed: results.length - enviados, results };
}

/** Une o bloco do Assunto ao evento auditado da mesma chamada MCP. */
export function mcpChannel(access: WriterMcpBrandAccess, requestId: string): SubjectImportChannel {
  return { kind: "mcp", grantId: access.grantId, requestId };
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
    description: "Use antes de propor qualquer coisa: o que a marca já tem — Assuntos, keywords por status, silos com pilar e suportes, artigos (promessa, slug, principal, etapa), itens do Radar, documentos do Redator, páginas publicadas — e o link de cada tela. Exige ver Marca, Minerador, Arquiteto, Radar e Redator.",
    inputSchema: z.object({ brandId: brandIdInput }),
    annotations: read,
  }, async ({ brandId }) => call("get_platform_state", "platform.read", { brandId }, PLATFORM_READ_PERMISSIONS, async ({ access }) =>
    readPlatformState(access.brandId)));

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
      `kgrFull é KGR < ${kgrLimit} (${kgrLimit} exato não é pleno). O KGR só conta como critério quando kgrApplicability não é 'not_applicable': nesse caso kgr e kgrFull vêm nulos e kgrUse é 'nao_utilizada' (decisão humana).`,
      "pageType vem resolvido: type, source (human, site ou default), stance (potential ou declared) e o rótulo da tela; keyword publicada como silo já é silo declarado.",
    ].join(" "),
    inputSchema: z.object({
      brandId: brandIdInput,
      status: z.enum(MINERADOR_EDITORIAL_STATUSES).optional(),
      subjectsOnly: z.boolean().default(false),
      search: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).max(20_000).default(0),
    }),
    annotations: read,
  }, async ({ brandId, status, subjectsOnly, search, limit, offset }) =>
    call("list_platform_keywords", "platform.read", { brandId }, [{ module: "minerador", action: "view" }], async ({ access }) => {
      let query = getOperationalClient().from("minerador_keywords")
        .select(PLATFORM_KEYWORD_SELECT, { count: "exact" })
        .eq("brand_id", access.brandId).is("deleted_at", null);
      if (status) query = query.eq("status", status);
      if (subjectsOnly) query = query.filter("analise_semantica->keyword_subject->>declared", "eq", "true");
      if (search) query = query.ilike("keyword", `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const { data, error, count } = await query.order("keyword").range(offset, offset + limit - 1);
      if (error) mapPersistenceError(error);
      return {
        total: count ?? null,
        offset,
        keywords: ((data || []) as unknown as Array<Record<string, unknown>>).map(projectPlatformKeywordRow),
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

  server.registerTool("declare_subjects", {
    title: "Declarar Assuntos no Minerador",
    description: "Use depois que o usuário ACEITAR os Assuntos no chat (a IA propõe; só o humano declara — ADR-022). mode 'preview' não grava e classifica cada frase (nova, já existe, publicada); mode 'apply' grava, exige userConfirmation com as palavras do aceite, e só declara frases já existentes se vierem em declareExistingIds. A declaração fica marcada como feita pelo MCP, ligada a esta chamada na auditoria. rows[].keywordId de cada Assunto é o subjectKeywordId da pesquisa por Assunto.",
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
    return call("declare_subjects", "minerador.write", { brandId, humanConfirmation: mode === "apply" ? userConfirmation : null }, [{ module: "minerador", action: "edit" }], async ({ access, requestId }) => {
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
        channel: mcpChannel(access, requestId),
      });
      if (!result.ok) throw new PlatformToolFailure(result.code, { message: result.reason });
      return result;
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
      const entries = await Promise.all(rows.map(async row => {
        const current = keywordDecisionBase(row);
        const published = isKeywordPublished({ status: row.status, semantic: row.analise_semantica });
        const readiness = resolveApprovalReadiness({ semantic: row.analise_semantica, intent: row.intent, volumeSearch: row.volume_search, resultsAllintitle: row.results_allintitle });
        const approval = readApprovalRecord(row.analise_semantica);
        const diverged = approvedPackageDiverged(approvalInput(row));
        const noop = action === "approve"
          ? current.status === "aprovado" && Boolean(approval) && diverged === false
          : current.status === "rejeitado";
        const blocked = published ? "Conteúdo publicado é protegido." : action === "approve" && !readiness.ok ? readiness.reason : null;
        return {
          id: row.id, keyword: row.keyword, currentStatus: current.status,
          proposedStatus: action === "approve" ? "aprovado" : "rejeitado",
          outcome: noop ? "unchanged" as const : blocked ? "blocked" as const : "ready" as const,
          blockers: blocked ? [blocked] : [],
          readiness: action === "approve" ? { ok: readiness.ok, missing: readiness.missing, reason: readiness.reason } : null,
          approvalDiverged: diverged,
        };
      }));
      const snapshot = {
        tool: "decide_keywords", brandId: access.brandId, actorId: principal.actorId, action,
        keywordIds: [...new Set(keywordIds)], missingCount,
        rows: rows.map(row => ({ ...keywordDecisionBase(row), semanticSnapshot: row.analise_semantica })),
        entries,
      };
      const currentDecisionHash = hashDecision(snapshot);
      if (mode === "preview") return { mode, action, entries, missingCount, decisionHash: currentDecisionHash, readOnly: true };
      if (decisionHash !== currentDecisionHash) throw new PlatformToolFailure("decision_stale", { message: "O estado das keywords mudou desde a prévia. Gere uma nova prévia antes de aplicar." });

      const results: Array<{ id: string; outcome: "applied" | "unchanged" | "blocked" | "stale"; reason?: string }> = [];
      const rowById = new Map(rows.map(row => [row.id, row]));
      for (const entry of entries) {
        const row = rowById.get(entry.id)!;
        if (entry.outcome === "unchanged") { results.push({ id: row.id, outcome: "unchanged" }); continue; }
        if (entry.outcome === "blocked") { results.push({ id: row.id, outcome: "blocked", reason: entry.blockers[0] }); continue; }
        let semantic = row.analise_semantica || {};
        if (action === "approve") semantic = await applyApproval({ ...approvalInput(row), approvedAt: new Date().toISOString(), approvedBy: principal.actorId });
        const saved = await constrainKeywordSnapshot(
          getOperationalClient().from("minerador_keywords")
            .update({ status: entry.proposedStatus, ...(action === "approve" ? { analise_semantica: semantic } : {}) })
            .eq("id", row.id).eq("brand_id", access.brandId).is("deleted_at", null),
          row,
        )
          .select("id,status,analise_semantica").maybeSingle();
        if (saved.error) mapPersistenceError(saved.error);
        const readback = saved.data as { id?: unknown; status?: unknown; analise_semantica?: Record<string, unknown> | null } | null;
        const expectedApproval = action === "approve" ? readApprovalRecord(semantic) : null;
        const actualApproval = action === "approve" ? readApprovalRecord(readback?.analise_semantica) : null;
        const confirmed = readback?.id === row.id && readback.status === entry.proposedStatus
          && (action === "reject" || Boolean(expectedApproval && actualApproval
            && expectedApproval.contentHash === actualApproval.contentHash
            && expectedApproval.signature === actualApproval.signature
            && expectedApproval.approvedBy === principal.actorId));
        results.push(confirmed ? { id: row.id, outcome: "applied" } : { id: row.id, outcome: "stale", reason: "compare_and_swap_or_readback_failed" });
      }
      return { mode, action, results, missingCount, decisionHash: currentDecisionHash, readbackConfirmed: results.every(item => item.outcome === "applied" || item.outcome === "unchanged") };
    });
  });

  server.registerTool("set_kgr_applicability", {
    title: "Decidir aplicabilidade do KGR",
    description: "Decisão aceita pelo usuário no chat para keywords selecionadas. Use mode=preview e depois mode=apply com o mesmo decisionHash e userConfirmation. Reusa planKgrApplicabilityBatch; Assuntos declarados são preservados e ficam fora da decisão.",
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
      const eligible = rows.filter(row => !resolveKeywordSubject(row.analise_semantica).declared);
      const skippedSubjects = rows.length - eligible.length;
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
    description: "Altera o tipo/potencial de página ou o posto da principal, somente após o aceite específico no chat. Use mode=preview e depois mode=apply com o mesmo decisionHash. Usa planVinculoBatchChoices e o readback do Minerador; publicação, slug, canonical e marca permanecem protegidos.",
    inputSchema: z.object({
      brandId: brandIdInput,
      mode: z.enum(["preview", "apply"]),
      keywordIds: z.array(z.string().uuid()).min(1).max(100),
      action: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("page_type"), pageType: z.enum(KEYWORD_PAGE_TYPES), stance: z.enum(KEYWORD_PAGE_TYPE_STANCES) }),
        z.object({ kind: z.literal("post"), policy: z.enum(["locked", "reviewable"]) }),
      ]),
      decisionHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      userConfirmation: confirmationInput.optional(),
    }),
    annotations: write,
  }, async ({ brandId, mode, keywordIds, action, decisionHash, userConfirmation }) => {
    if (mode === "apply" && (!userConfirmation || !decisionHash)) {
      return asText({ ok: false, code: !userConfirmation ? "human_confirmation_required" : "decision_hash_required", message: "Mostre a prévia, aguarde o aceite específico do usuário e reaplique com o decisionHash da mesma prévia." });
    }
    const scope = mode === "apply" ? "platform.decide" as const : "platform.read" as const;
    const permission = mode === "apply" ? "edit" as const : "view" as const;
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
      "Use para achar as buscas reais em torno de um Assunto (Google Ads + DataForSEO Labs).",
      "Se o Assunto já está declarado, passe request.subjectKeywordId (de declare_subjects rows[].keywordId ou de get_platform_state minerador.subjects[].keywordId): o servidor relê a frase, a nota e a página de destino, e o destino alimenta a fonte por URL. Sem ele, request.phrase.",
      "Sempre primeiro request.mode 'plan' (grátis): devolve o plano e o custo. Mostre o custo ao usuário.",
      "Só com o aceite dele chame request.mode 'execute' com authorizedPlan (planHash e maxCostUsd do plano), userConfirmation e um operationRequestId UUID v4 novo — repetido só numa nova tentativa do MESMO execute. Executar exige também o escopo provider.spend.",
      `targeting: language ${subjectSearchLanguagesText()}; selectedStates ['Todos os estados'] ou siglas de UF (ex.: ['SP','RJ']); keywordPlanNetwork 'GOOGLE_SEARCH'; includeAdultKeywords false.`,
      `O execute volta compacto, em até ${Math.round(PLATFORM_TOOL_RESULT_MAX_BYTES / 1024)} kB: candidatas na ordem de relevância com keyword, volume (Google Ads), origins e uma evidência; o que não coube vem declarado em trimmed.`,
      "As candidatas NÃO são gravadas e a mesma execução não pode ser repetida: escolha com o usuário e envie com import_subject_keywords usando os valores de importWith.",
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
      return outcome.body.success && outcome.body.mode === "execute" ? projectSubjectSearchForAgent(outcome.body) : outcome.body;
    });
  });

  server.registerTool("import_subject_keywords", {
    title: "Importar candidatas ao Processador",
    description: "Use depois de escolher com o usuário as keywords de sustentação (em grupo ou uma a uma): leva ao Processador do Minerador, ligadas ao Assunto. Uma chamada por Assunto, com os valores de importWith da busca: searchId = operationRequestId da busca; subjectKeywordId = subject.subjectKeywordId da busca (ou o id do Assunto declarado); subjectPhrase = subject.phrase. items[].origins e evidence vêm da candidata. Métricas não vão no envio — o Processador mede. Numa nova tentativa do mesmo envio, repita searchId e importRequestId.",
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

  server.registerTool("run_keyword_logic", {
    title: "Executar Lógica das keywords",
    description: "Roda a mesma Lógica determinística do botão do Minerador: intenção, nicho e funil com preservação das decisões humanas existentes. Não chama providers, não mede e não aprova. Envie keywordIds (individual ou grupo); o servidor grava só depois de derivar o lote inteiro e confirma cada alteração por readback.",
    inputSchema: z.object({ brandId: brandIdInput, keywordIds: z.array(z.string().uuid()).min(1).max(100) }),
    annotations: write,
  }, async ({ brandId, keywordIds }) => call("run_keyword_logic", "minerador.write", { brandId }, [{ module: "minerador", action: "edit" }], async ({ access }) => {
    const uniqueIds = [...new Set(keywordIds)];
    const db = getOperationalClient();
    const selected = await db.from("minerador_keywords")
      .select("id,brand_id,keyword,status,intent,location,volume_search,results_allintitle,kgr_score,lista_id,analise_semantica")
      .eq("brand_id", access.brandId).is("deleted_at", null).in("id", uniqueIds);
    if (selected.error) mapPersistenceError(selected.error);
    const rows = (selected.data || []) as unknown as Array<DecisionKeywordRow & { location: string | null }>;
    const byId = new Map(rows.map(row => [row.id, row]));
    const missingIds = uniqueIds.filter(id => !byId.has(id));
    const listIds = [...new Set(rows.map(row => row.lista_id).filter((id): id is string => Boolean(id)))];
    const listResult = listIds.length
      ? await db.from("minerador_keyword_lists").select("id,nicho").eq("marca_id", access.brandId).in("id", listIds)
      : { data: [], error: null };
    if (listResult.error) mapPersistenceError(listResult.error);
    const listById = new Map(((listResult.data || []) as Array<{ id: string; nicho: string | null }>).map(list => [list.id, list]));
    const processedAt = new Date().toISOString();
    const planned = rows.map(row => ({ row, derived: deriveLogicalKeywordBatchItem(
      { id: row.id, keyword: row.keyword, location: row.location, intent: row.intent, analise_semantica: row.analise_semantica },
      row.lista_id ? listById.get(row.lista_id) || null : null,
      processedAt,
    ) }));
    const results: Array<{ id: string; keyword: string; outcome: "applied" | "unchanged" | "stale"; reason?: string }> = [];
    for (const { row, derived } of planned) {
      if (!derived.needsWrite) { results.push({ id: row.id, keyword: row.keyword, outcome: "unchanged" }); continue; }
      const saved = await constrainKeywordSnapshot(
        db.from("minerador_keywords").update({ intent: derived.update.intent, analise_semantica: derived.update.analise_semantica })
          .eq("id", row.id).eq("brand_id", access.brandId).is("deleted_at", null),
        row,
      ).select("id,intent,analise_semantica").maybeSingle();
      if (saved.error) mapPersistenceError(saved.error);
      const readback = saved.data as { id?: string; intent?: string | null; analise_semantica?: Record<string, unknown> | null } | null;
      const confirmed = Boolean(readback?.id === row.id && readback.intent === derived.update.intent
        && hasCompleteLogicalOutputContract({ semantic: readback.analise_semantica, intent: derived.update.intent })
        && hasCurrentLogicalProcessorMetadata({ keywordId: row.id, keyword: row.keyword, location: row.location, niche: derived.niche, semantic: readback.analise_semantica }));
      results.push(confirmed
        ? { id: row.id, keyword: row.keyword, outcome: "applied" }
        : { id: row.id, keyword: row.keyword, outcome: "stale", reason: "compare_and_swap_or_readback_failed" });
    }
    const applied = results.filter(result => result.outcome === "applied").length;
    const failed = results.filter(result => result.outcome === "stale").length;
    return { processedAt, requested: uniqueIds.length, found: rows.length, missingIds, applied, unchanged: results.length - applied - failed, failed, results, readbackConfirmed: failed === 0 };
  }));

  /* ============================== Arquiteto =========================== */

  server.registerTool("send_keywords_to_arquiteto", {
    title: "Enviar keywords aprovadas ao Arquiteto",
    description: "Use quando o usuário já aprovou as keywords no Minerador: transfere ao Arquiteto (idempotente). A resposta traz requested, sent e notSent: keyword não aprovada (ou aprovada e alterada depois) não vai e aparece em notSent com o motivo; se nenhuma for elegível, a resposta é o erro nothing_eligible. Aprovação incompleta (sem Lógica, Volume, Resultados ou KGR) ou página de destino fora do domínio recusa o lote inteiro. Formar artigos e silos continua na tela do Arquiteto.",
    inputSchema: z.object({ brandId: brandIdInput, keywordIds: z.array(z.string().uuid()).min(1).max(500) }),
    annotations: write,
  }, async ({ brandId, keywordIds }) => call("send_keywords_to_arquiteto", "arquiteto.write", { brandId }, [{ module: "arquiteto", action: "create" }], async ({ access }) => {
    const context = await resolvePipelineContext(
      { brandId: access.brandId, module: "arquiteto", action: "create" },
      { requireActorUserId: async () => principal.actorId },
    );
    return reportArquitetoHandoff(keywordIds, await createMineradorArquitetoHandoff(context, keywordIds));
  }));

  /* ================================ Radar ============================= */

  server.registerTool("send_radar_to_writer", {
    title: "Enviar artigos do Radar ao Redator",
    description: "Use quando o usuário já finalizou a investigação no Radar: cria o documento do Redator a partir do pacote, um artigo por vez (em lote, na ordem). Idempotente; documento existente com outro pacote nunca é sobrescrito. Reporte o desfecho de cada artigo: a falha traz o código, a mensagem e, quando a prontidão bloqueia, os bloqueios (blocks). Se nenhum artigo for enviado, a resposta é o erro radar_writer_all_failed com os resultados.",
    inputSchema: z.object({ brandId: brandIdInput, articleIds: z.array(z.string().trim().min(1).max(256)).min(1).max(30) }),
    annotations: write,
  }, async ({ brandId, articleIds }) => call("send_radar_to_writer", "radar.write", { brandId },
    [{ module: "radar", action: "edit" }, { module: "redator", action: "create" }], async ({ access }) =>
      sendArticlesToWriter(articleIds, articleId => sendRadarToWriter({ brandId: access.brandId, articleId, actorId: principal.actorId, sentAt: new Date().toISOString() }))));
}
