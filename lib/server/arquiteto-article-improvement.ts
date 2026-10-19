import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ArticleDNASchema, type ArticleDNA, type ArchitectKeyword, type ProvisionalArticleGroup } from "@/lib/arquiteto/contracts";
import { buildCanonicalWorkflowWorkspaceItems } from "@/lib/arquiteto/canonical-workspace";
import { deterministicArticleDnaPayload } from "@/lib/arquiteto/adapters";
import { PUBLISHED_REINFORCEMENT_SWAP_REASON, serpAssessmentComposition, serpCompositionMismatch } from "@/lib/arquiteto/published-formation-serp";
import { suggestArticleSlug } from "@/lib/arquiteto/article-formation";
import { articleSerpBaseHash, articleSerpIntentOf } from "@/lib/arquiteto/article-serp-gate";
import type { SerpFormationAssessment } from "@/lib/arquiteto/serp-formation";
import { siloIsHumanDecided } from "@/lib/arquiteto/territory";
import { bindArticleParentForMaterialization } from "@/lib/arquiteto/article-silo-materialization";
import { articleApprovalRevalidationIssues, DECLARED_PLAN_CONSOLIDATION_ALERT_PREFIX, isDeclaredPlanConsolidation } from "@/lib/arquiteto/article-approval-revalidation";
import { publishedPrimaryPostOf } from "@/lib/arquiteto/published-primary-swap";
import { buildFirstPublishedArticleDna, withHumanArticleApproval } from "@/lib/arquiteto/published-reinforcement";
import { intentIsKnown, resolveKeywordDnaSignals } from "@/lib/arquiteto/keyword-dna-signals";
import { applySerpDecisionToArticle, buildClassificationEvidence, resolveArticleClassification, unresolvedClassifications, ARTICLE_INTENT_LABELS, ARTICLE_FUNNEL_LABELS } from "@/lib/arquiteto/article-classification-closure";
import { resolveApprovedArticleSerpGate, type ApprovedSerpRecord } from "@/lib/arquiteto/approved-article-serp-gate";
import { readArticleKgrDecision } from "@/lib/arquiteto/article-kgr-decision";
import { readArchitectSubjectStanding, readArchitectSubjectStandings, planSubjectAttachment, attachSubjectToArticleDna, freePlanPrincipal, lockedPlanPrincipal, subjectMayBePrincipal } from "@/lib/arquiteto/declared-subject";
import { applyDeclaredPlanToArticleDna, applySerpSupportBasisProvenance, declaredPlanAppliedTo, declaredPlanForGroup } from "@/lib/arquiteto/declared-plan-formation";
import { hasSearchVolume } from "@/lib/arquiteto/serp-subject-suggestions";
import { identityPrincipalSerpSentence, serpCollectionAllowed } from "@/lib/arquiteto/article-batch-serp";
import { shortSeedsOf, sharesTheme } from "@/lib/minerador/short-seeds";
import { ARTICLE_IMPROVEMENT_VERSION, volumelessPrincipalSwap, carriesSlugCore, targetPrincipalIsIdentity, planArticleImprovements, improvementEditorialFit, isListReading, isCopyLineReading, serpSupportedMembers, improvementDiscoverySeeds, improvementIdeaOnCopyLine, improvementSiloContext, IMPROVEMENT_ARTICLE_MAX_KEYWORDS, type ImprovementKeyword, type ImprovementTarget, type ImprovementProposal, type ImprovementEvidence, type ImprovementSerpVocabulary } from "@/lib/arquiteto/article-improvement";
import { buildImprovementAiPrompt, editorialAiRecord, improvementAiEligibleTargets, improvementAiList, improvementAiTargets, IMPROVEMENT_AI_TIMEOUT_MS, validateImprovementAiPicks, type ImprovementEditorialAi } from "@/lib/arquiteto/article-improvement-ai";
import { readPageRanking, rankingBlocksSwap } from "@/lib/arquiteto/published-differentiation";
import { buildSerpSubjectIndex, SERP_SUBJECT_LENS_LABELS } from "@/lib/arquiteto/serp-subject-overlap";
import { createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { normalizeKeyword } from "@/lib/minerador/keyword-import-core";
import { deriveLogicalKeywordBatchItem } from "@/lib/minerador/logical-batch";
import { importSubjectDiscoveryWithCore, readSubjectDiscoveryBlock } from "@/lib/minerador/subject-discovery-import";
import { IMPROVEMENT_NEW_KEYWORDS_APPROVAL_REQUIRED, improvementMineradorNeeds, improvementMineradorNeedsSentence, improvementNewKeywordIds, improvementSuggestionDrafts, markImprovementMineradorNeeds } from "@/lib/arquiteto/article-improvement-minerador";
import { recordArquitetoMineradorSuggestionsSafely } from "./arquiteto-minerador-suggestions";
import { assessRework, decideRework, formatReworkWhen, reworkView, type ReworkView } from "@/lib/editorial/rework-guard";
import { isEditorialGroupColor, type EditorialGroupFilter } from "@/lib/editorial/editorial-groups";
import { parseGroupIdQuery } from "@/lib/editorial/article-groups";
import { listEditorialGroupSummaries } from "@/lib/editorial/editorial-groups-store";
import { getOperationalClient } from "./editorial-db";
import { loadCanonicalArquitetoWorkspace, createMineradorArquitetoHandoff } from "./arquiteto-workspace";
import { applyKeywordDecisionEntries, keywordDecisionEntries, readDecisionKeywords, runKeywordLogicWithCore } from "./minerador-keyword-decision-core";
import { measureKeywordVolume } from "./minerador-volume-measure";
import { handleGoogleAdsKeywordMetrics } from "./minerador-google-ads-metrics-http";
import { replayStoredMeasurements } from "./minerador-architect-suggestions";
import { readDifferentiationBrandKeywords, readPrincipalSerpVocabulary, readPublishedFootprints } from "./arquiteto-differentiation-store";
import { proposeArticleImprovementAiPicks, readGoogleAdsAverageVolumes } from "./arquiteto-differentiation-runtime";
import { handleArchitectWorkspacePatch } from "./arquiteto-workspace-http";
import { handleArchitectFormationSerp } from "./arquiteto-serp-http";
import { appendArquitetoArtifact } from "./arquiteto-persistence";
import { findArticleFormationSerpAssessment, listArticleFormationSerpAssessments, saveArticleFormationSerpAssessment, resolveArticleFormationSerpAssessment, readbackArticleFormationSerpAssessment } from "./arquiteto-article-serp-store";
import { listTerritoryWorkflowItems } from "./arquiteto-territory-store";
import { readArticleFormationMarker, saveArticleFormationMarker, readbackArticleFormationMarker } from "./arquiteto-article-formation-marker-store";
import { WorkflowRepository } from "./pipeline-repositories";
import { resolvePipelineContext, PipelineRuntimeError, type PipelineContext } from "./pipeline-runtime";
import { createGoogleAdsCanonicalClient, resolveGoogleAdsCanonicalContext, targetingToProviderInput, defaultGoogleAdsCanonicalTargeting } from "./google-ads-canonical";
import { createGoogleAdsKeywordAccount } from "@/lib/google/ads/account";
import { generateGoogleAdsKeywordIdeas } from "@/lib/google/ads/keyword-ideas";
import type { GoogleAdsKeywordIdeasInput } from "@/lib/google/ads/contracts";
import { stableUuid } from "./arquiteto-published-reinforcement";
import { improvementAiUsageKey, improvementInputsFingerprint, improvementReuseSeed, improvementReworkPrevious, IMPROVEMENT_DISCOVERY_REQUEST_LIMIT, IMPROVEMENT_REUSE_WINDOW_MS, type ImprovementReusableRun } from "@/lib/arquiteto/article-improvement-reuse";
import type { GoogleAdsDiscoveryUsageKeySuffix } from "@/lib/minerador/google-ads-discovery-usage";
import type { GoogleAdsHistoricalMetric } from "@/lib/google/ads/contracts";
import { buildKnownBeforeSearchPlan, knownBeforeSearchSentences, readKnownVolume, type KnownBeforeSearchPlan, type KnownVolume } from "@/lib/editorial/known-before-search";
import type { ImprovementStoredMeasurement } from "@/lib/arquiteto/article-improvement";
import { planPrincipalSwapCandidates, planSheetArticleConflict } from "@/lib/arquiteto/plan-article-sheet";
import { principalSubjectStanding, resolveKeywordSubject } from "@/lib/minerador/keyword-subject";
import { readSerpEvidenceRecord, serpEvidenceAxisValue } from "@/lib/minerador/serp-evidence-record";
import { resolveBrandSerpTarget } from "@/lib/server/brand-serp-target";

const refusal = (message: string) => new PipelineRuntimeError("CONFLICT", message, 409);
const SUBJECT_TYPE = "article_improvement_run";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonicalJson = (value: unknown): unknown => Array.isArray(value) ? value.map(canonicalJson) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonicalJson(v)])) : value;
export const stableHash = (value: unknown) => hash(canonicalJson(JSON.parse(JSON.stringify(value ?? null))));
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
type Row = ArchitectKeyword & Record<string, unknown>;
type Workspace = Awaited<ReturnType<typeof loadCanonicalArquitetoWorkspace>>;
type Outcome = { targetId: string; status: "improved" | "dna_created" | "unchanged" | "insufficient_evidence" | "failed"; message: string; versionId?: string };
type CostPlan = { paidQueries: number; estimatedCostUsd: { min: number; max: number }; missingDetails: unknown[]; cacheUnavailable?: boolean;
  /** D2(a): das `paidQueries`, as que só coletariam a SERP de principal declarada já coberta pelo parecer das sustentações (opcionais, D2(b)). */
  optionalPaidQueries?: number;
  /**
   * 2026-10-19 · os grupos de coleta que a guarda de retrabalho (G13) tirou do plano: a coleta paga da MESMA consulta
   * já deu parecer inconclusivo. A coleta os pula (nunca derruba a coleta inteira) e a linha diz a recusa e a saída.
   */
  reworkRefused?: { groupId: string; keyword: string; message: string }[] };
export type ImprovementRun = {
  version: number; runId: string; brandId: string; actorId: string; createdAt: string;
  state: "prepared" | "collecting" | "applying" | "complete"; decisionHash: string;
  leaseUntil: string | null;
  sourceHashes: Record<string, string>; targets: ImprovementTarget[]; keywords: ImprovementKeyword[];
  beforeAssignments: Record<string, Record<string, unknown>>;
  proposals: ImprovementProposal[]; costs: CostPlan; reservedCostUsd: number;
  notices: string[]; outcomes: Outcome[]; acceptedIds: string[] | null;
  /** Progress of a bounded paid collection; absent outside \"collecting\". */
  collect?: { doneGroupIds: string[]; remaining: number; reservedRemaining: number; phase: "collect" | "refresh"; totalGroups?: number };
  /** A leitura editorial da IA na lista: feita uma vez no prepare e reaproveitada (nunca repetida) no collect. */
  editorialAi?: ImprovementEditorialAi;
  /** SDD acelerar 2026-10-13, item 4: o recorte do grupo lido no prepare ("Formar os artigos do plano · cor"). Ausente = marca inteira. */
  groupScope?: { requested: string; filter: "group" | "none"; groupId: string | null };
  /** Impressão digital dos insumos (alvos, fontes, lista): igual = reaproveita IA, medições e busca (2026-10-12). */
  inputsHash?: string;
  /** A execução de onde vieram a leitura da IA e a busca, sem chamada nova. */
  reusedFromRunId?: string | null;
  /** Busca nova no Google Ads: só sob pedido explícito; os alvos sem proposta ficam à vista para o pedido. */
  discovery?: { requested: boolean; gapTargetIds: string[]; requests: number };
  /** F5 — o veredito da guarda de retrabalho na preparação (ausente = nunca feito com estes insumos). */
  rework?: ReworkView;
  /** F5 — "Refazer mesmo assim" (D11): o motivo dito e quando. */
  reworkOverride?: { reason: string; at: string };
  /**
   * F3 · LER ANTES DE BUSCAR (SDD 2026-10-13, item 3): o que já temos, o que
   * falta e quanto custa — lido de graça antes de qualquer IA ou Google Ads —,
   * o que a pessoa autorizou nesta preparação e as frases da tela e do MCP.
   */
  reading?: KnownBeforeSearchPlan & { authorized: { ai: boolean; measure: boolean }; sentences: ReturnType<typeof knownBeforeSearchSentences> };
  /** F5 · PLANILHA PRIMEIRO: a execução nasceu da planilha "Artigos do plano" (o painel da melhoria não a retoma). */
  origin?: "plan_sheet";
  /** F5 — os alvos pedidos pela planilha que não são Assunto do plano recebido: recusa POR ITEM, com o motivo. */
  refusedTargets?: { id: string; reason: string }[];
};
/** Uma chamada que custa ou conta cota, para `integration_usage_events`. */
export type ImprovementUsageEvent =
  | { kind: "editorial_ai"; runId: string; resultStatus: "succeeded" | "failed"; errorCode: string | null; targets: number; listSize: number }
  | { kind: "google_ads_discovery"; runId: string; resultStatus: "succeeded" | "failed"; errorCode: string | null; suffix: GoogleAdsDiscoveryUsageKeySuffix; providerReference: string | null; receivedCount: number | null };
export { ArticleImprovementRequestSchema } from "@/lib/arquiteto/article-improvement-request";
import type { ArticleImprovementRequest } from "@/lib/arquiteto/article-improvement-request";
type ContextResolver = (module: string, action: string) => Promise<PipelineContext>;
/** A IA da leitura editorial (injetável; ausente = IA desligada, a jornada segue pelas regras). */
export type ImprovementEditorialAiCall = (prompt: { system: string; user: string; timeoutMs: number }) => Promise<unknown>;
export type ImprovementRuntime = { context: PipelineContext; authorize: ContextResolver; editorialAi?: ImprovementEditorialAiCall; editorialAiTimeoutMs?: number;
  /** Grava o uso da IA e da busca no registro de uso (injetável; ausente = não registra). */
  recordUsage?: (event: ImprovementUsageEvent) => Promise<void>;
  /** Prazo (desde o início da requisição) para começar a ler o parecer de uma composição; testes encurtam. */
  compositionDeadlineMs?: number;
  /**
   * F3 · MEDIR UMA VEZ: a consulta de métricas do Google Ads que devolve a
   * medição inteira (injetável; ausente = só a média, e "Gravar melhorias"
   * mede de novo como antes — o caminho de execuções antigas).
   */
  measureVolumes?: (keywords: readonly string[]) => Promise<{ metrics: Array<{ metric: GoogleAdsHistoricalMetric; requestId: string | null }>; unmatched: string[] }> };

async function responseData(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.success === false) throw refusal(String(body.error ?? body.message ?? "Operação não confirmada."));
  return object(body.data);
}
const internalRequest = (path: string, body: unknown, method = "POST") => new NextRequest(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function projected(workspace: Workspace, brandId: string): Map<string, Row> {
  return new Map((buildCanonicalWorkflowWorkspaceItems(workspace.workflowItems, workspace.keywords, brandId) as unknown as Row[]).map(row => [row.id, row]));
}
/**
 * 2026-10-19 · a intenção que a SERP mostrou para a keyword: a `evidencia_serp` CONCLUSIVA, nas 4 lentes, do mesmo pacote que
 * `signals` lê (a leitura da mesa, `serpEvidenceAxisValue`). `null` = a SERP não decidiu a intenção dela.
 */
export function observedSerpIntentOfRow(row: Row | undefined): string | null {
  if (!row) return null;
  const workflow = object(row.canonicalWorkflow), payload = object(workflow.payload), approved = object(payload.approvedDna);
  const semantic = Object.keys(object(approved.analiseSemantica)).length ? object(approved.analiseSemantica) : object(row.analise_semantica);
  const registro = readSerpEvidenceRecord(semantic);
  // G1/G9 e a régua c ("intenção pela SERP, 4 lentes"): lente faltando nunca vira decisão — só a leitura com as 4 lentes conta.
  if (!registro || (registro.lentes?.lidas ?? 0) < 4) return null;
  return serpEvidenceAxisValue(registro, "intent");
}
/** 2026-10-19 · a `evidencia_serp` do Minerador desta linha (a do pacote aprovado ou a da linha), quando há. */
function serpEvidenceOfRow(row: Row) {
  const workflow = object(row.canonicalWorkflow), payload = object(workflow.payload), approved = object(payload.approvedDna);
  const semantic = Object.keys(object(approved.analiseSemantica)).length ? object(approved.analiseSemantica) : object(row.analise_semantica);
  return readSerpEvidenceRecord(semantic);
}
/** 2026-10-19 · a intenção que a Lógica do Minerador escreveu (`intencao_principal`), sem a reconciliação pela SERP nacional. */
function logicIntentOfRow(row: Row): string | null {
  const workflow = object(row.canonicalWorkflow), payload = object(workflow.payload), approved = object(payload.approvedDna);
  const semantic = Object.keys(object(approved.analiseSemantica)).length ? object(approved.analiseSemantica) : object(row.analise_semantica);
  const bruto = typeof semantic.intencao_principal === "string" ? semantic.intencao_principal.trim() : "";
  return bruto && intentIsKnown(bruto) ? bruto : null;
}
function signals(row: Row) {
  const workflow = object(row.canonicalWorkflow), payload = object(workflow.payload), approved = object(payload.approvedDna);
  const resolved = resolveKeywordDnaSignals({ keywordId: row.id, text: row.keyword, semanticQualification: object(payload.semanticQualification), semantic: Object.keys(object(approved.analiseSemantica)).length ? object(approved.analiseSemantica) : object(row.analise_semantica) });
  return { ...resolved, dnaVersionId: resolved.dnaVersionId ?? row.keywordDnaRef?.versionId ?? null, dnaContentHash: resolved.dnaContentHash ?? row.keywordDnaRef?.contentHash ?? null };
}
/*
 * 2026-10-18 (amarelo, SELECT de 18/10) · A INTENÇÃO DO MINERADOR ESTÁ RESOLVIDA? Sim com a intenção no DNA; e também
 * quando a Lógica do Minerador JÁ rodou (`logicProcessedAt`) e deixou "Pendente" (ambígua: "planos de internet
 * residencial") — pedir a Lógica de novo é um laço: quem decide a intenção é a SERP (G8). Sem isto, toda proposta com as
 * keywords que a própria confirmação incorporou (o Pilar do amarelo) virava "Precisa do Minerador: a Lógica…", na prévia
 * e na gravação. A que nunca passou pela Lógica continua pedindo o Minerador. Uma regra só, para a prévia e o gravador.
 */
function mineradorIntentSettled(row: Row): boolean {
  if (signals(row).intent) return true;
  const aprovado = object(object(object(object(row.canonicalWorkflow).payload).approvedDna).analiseSemantica);
  return Boolean(text(aprovado.logicProcessedAt) ?? text(object(row.analise_semantica).logicProcessedAt));
}
function sourceHash(target: ImprovementTarget, workspace: Workspace, rows: Map<string, Row>): string {
  const article = workspace.articleDnas.find(a => a.entityId === target.id || a.payload.articleId === target.id || a.payload.subject?.keywordId === target.id || a.payload.publishedIdentityRef?.sourceKeywordDnaIds?.includes(target.id));
  // Only what changes the article: never the whole row. Lock versions, SERP
  // stamps and timestamps change when the preview itself (or "Processar
  // artigos") records a SERP assessment, and made every apply fail with
  // "mudaram desde a prévia".
  const member = (id: string) => {
    const row = rows.get(id);
    if (!row) return { id, missing: true };
    const decision = object(row.articleFormationDecision);
    return { id, territoryRef: text(row.territoryRef), formationRef: text(row.articleFormationRef), role: text(decision.role), decisionSource: text(decision.source), published: Boolean(row.isPublished), post: text(row.primaryKeywordPolicy), dnaVersion: row.keywordDnaRef?.versionId ?? null };
  };
  const identity = { id: target.id, kind: target.kind, theme: target.theme, primaryId: target.primaryId, post: target.post, memberIds: target.memberIds, territoryRef: target.territoryRef, slug: target.slug, url: target.url, canonical: target.canonical,
    // F4 — o plano declarado muda o artigo: entra na impressão digital só quando existe.
    ...(target.declaredPrincipalId ? { declaredPrincipalId: target.declaredPrincipalId } : {}), ...(target.declaredPlanPending ? { declaredPlanPending: true } : {}),
    // 2026-10-18 · o Assunto pela principal (SDD 2026-10-18 §6.3-a): o Assunto da página e o volume dela mudam o artigo.
    // Texto, não objeto: a execução volta do jsonb com as chaves reordenadas (a impressão digital não pode depender da ordem).
    ...(target.principalSubject ? { principalSubject: `${target.principalSubject.keywordId}:${target.principalSubject.volumeState}` } : {}), ...(target.currentSubjectKeywordId ? { currentSubjectKeywordId: target.currentSubjectKeywordId } : {}) };
  return hash({ target: identity, article: article?.contentHash ?? null, members: target.memberIds.map(member) });
}
/*
 * SDD acelerar 2026-10-13, item 4 — "FORMAR OS ARTIGOS DO PLANO · <cor>": o
 * recorte do grupo vem como cor, uuid ou "sem-grupo". Os alvos e a lista da
 * marca passam a ser só os do grupo (fechado por artigo, pelo leitor de
 * sempre); a proteção (publicados da marca inteira, canibalização) continua
 * lendo a marca inteira.
 */
async function resolveImprovementGroup(context: PipelineContext, requested: string): Promise<{ filter: Exclude<EditorialGroupFilter, { kind: "all" }>; scope: NonNullable<ImprovementRun["groupScope"]> }> {
  const valor = requested.trim().toLowerCase();
  const direto = parseGroupIdQuery(valor);
  if (direto.ok && direto.filter.kind === "none") return { filter: direto.filter, scope: { requested: valor, filter: "none", groupId: null } };
  if (direto.ok && direto.filter.kind === "group") return { filter: direto.filter, scope: { requested: valor, filter: "group", groupId: direto.filter.groupId } };
  if (!isEditorialGroupColor(valor)) throw refusal(`Grupo desconhecido: “${requested}”. Use a cor, o id do grupo ou “sem-grupo”.`);
  const lidos = await listEditorialGroupSummaries(getOperationalClient(), context.brandId);
  if (!lidos.ok) throw refusal("Os grupos ainda não estão disponíveis neste banco.");
  const ativos = lidos.groups.filter(group => group.status === "active" && group.color === valor);
  if (ativos.length !== 1) throw refusal(ativos.length ? `A cor ${valor} tem mais de um grupo ativo: use o id do grupo.` : `Nenhum grupo ativo na cor ${valor} nesta marca.`);
  return { filter: { kind: "group", groupId: ativos[0].id }, scope: { requested: valor, filter: "group", groupId: ativos[0].id } };
}
/**
 * F5 · PLANILHA PRIMEIRO (SDD 2026-10-13, item 5) — opções aditivas do prepare:
 * `lenient` recusa por item o alvo pedido que não é alvo (em vez do lote);
 * `excludePlanArticles` deixa o Assunto com plano fora (o painel de texto fica
 * para publicados); `principalChoice` é a troca de principal escolhida na linha.
 */
type ReadInputsOptions = { lenient?: boolean; excludePlanArticles?: boolean; principalChoice?: Record<string, string> };
async function readInputs(context: PipelineContext, requested?: string[], groupFilter?: Exclude<EditorialGroupFilter, { kind: "all" }>, options: ReadInputsOptions = {}) {
  const [workspace, brand, territories] = await Promise.all([loadCanonicalArquitetoWorkspace(context, { keywordDetail: "full", ...(groupFilter ? { groupFilter } : {}) }), readDifferentiationBrandKeywords(context), listTerritoryWorkflowItems(context)]);
  const rows = projected(workspace, context.brandId), targets: ImprovementTarget[] = [];
  const waitingDeclaredPrincipal: string[] = [];
  const esperaPorId = new Map<string, string>();
  const owned = new Map<string, string>();
  for (const a of workspace.articleDnas) for (const reference of a.payload.keywordReferences) owned.set(reference.keywordId, a.payload.subject?.keywordId ?? a.payload.articleId);
  for (const page of brand.pages) {
    const row = rows.get(page.keywordId);
    if (!row) continue;
    // A SiloPage is not an Article target.
    if (row.editorialUnitDeclaration?.unit === "silo") continue;
    const article = workspace.articleDnas.find(a => a.entityId === page.keywordId || a.payload.publishedIdentityRef?.sourceKeywordDnaIds?.includes(page.keywordId) || a.payload.subject?.keywordId === page.keywordId);
    const members = article?.payload.keywordReferences.map(r => r.keywordId) ?? [...rows.values()].filter(r => text(r.articleFormationRef) && r.articleFormationRef === row.articleFormationRef).map(r => r.id);
    const id = page.keywordId;
    /*
     * 2026-10-18 · O ALVO PUBLICADO LÊ O ASSUNTO DA PÁGINA (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.3-a,
     * G6). Com o Assunto declarado no pacote aprovado da página, o tema é o título do Assunto, a nota são os detalhes e o
     * estado do volume da página (a régua do Minerador, `principalSubjectStanding`) decide a troca. A página que já virou
     * o `subject` do ArticleDNA não volta a ser membro (ela é o Assunto, fora das seis).
     */
    const assuntoDaPagina = readArchitectSubjectStanding(row);
    const pacoteDaPagina = object(object(object(object(row.canonicalWorkflow).payload).approvedDna).analiseSemantica);
    const entradaDaPagina = assuntoDaPagina.declared ? resolveKeywordSubject(pacoteDaPagina).entry : null;
    const volumeDaPagina = principalSubjectStanding({ volume_search: row.volume_search ?? null, volume_source: row.volume_source ?? object(row.demandEvidence).source ?? null, analise_semantica: object(row.analise_semantica) }, new Date());
    const paginaEhOAssunto = article?.payload.subject?.keywordId === page.keywordId && !members.includes(page.keywordId);
    const target: ImprovementTarget = { id, kind: "published", theme: assuntoDaPagina.declared ? assuntoDaPagina.phrase : row.keyword, note: assuntoDaPagina.declared ? entradaDaPagina?.details ?? assuntoDaPagina.note ?? null : null, primaryId: article?.payload.principalKeywordId ?? row.id, post: publishedPrimaryPostOf(row.primaryKeywordPolicy ?? page.post), memberIds: paginaEhOAssunto ? [...new Set(members)] : [...new Set([page.keywordId, ...members])], territoryRef: text(row.territoryRef), slug: article?.payload.suggestedSlug ?? page.slug ?? (page.url ? new URL(page.url).pathname.split("/").filter(Boolean).at(-1) ?? null : null), url: page.url, canonical: article?.payload.canonical ?? page.canonical ?? page.url, signals: signals(row),
      ...(assuntoDaPagina.declared && !volumeDaPagina.outOfScope ? { principalSubject: { keywordId: page.keywordId, volumeState: volumeDaPagina.volumeState } } : {}),
      currentSubjectKeywordId: article?.payload.subject?.keywordId ?? null, articleExists: Boolean(article) };
    targets.push(target);
    for (const member of target.memberIds) if (article || !owned.has(member)) owned.set(member, id);
  }
  // 2026-10-13 · com a conversão do formato anterior aplicada: a linha-título convertida não é mais Assunto.
  const standings = readArchitectSubjectStandings(rows.values());
  for (const row of rows.values()) {
    const standing = standings.get(row.id) ?? readArchitectSubjectStanding(row);
    // 2026-10-18 · a página publicada com Assunto é o alvo publicado (mesmo depois de virar o `subject`), nunca um segundo alvo.
    if (!standing.declared || !standing.received || targets.some(t => t.memberIds.includes(row.id) || t.principalSubject?.keywordId === row.id)) continue;
    // F5 — o painel de texto da melhoria fica para publicados: o Assunto com plano é da planilha "Artigos do plano".
    if (options.excludePlanArticles && standing.plan) continue;
    /*
     * 2026-10-13 · CONVERSÃO (SDD `sdd-conversao-assunto-legado-2026-10-13.md` R1):
     * o Assunto já mora nesta keyword, mas o artigo ainda aponta para a
     * linha-título. Até "Atualizar o Assunto do artigo", ele espera — nunca
     * nasce um segundo artigo para a mesma keyword.
     */
    const convertendo = standing.conversion?.articleId ? workspace.articleDnas.find(a => a.payload.articleId === standing.conversion!.articleId && a.payload.subject?.keywordId !== row.id) : undefined;
    if (convertendo) {
      waitingDeclaredPrincipal.push(`“${standing.phrase}” aguarda “Atualizar o Assunto do artigo” no Arquiteto (o Assunto saiu da linha-título e passou para “${row.keyword}”).`);
      esperaPorId.set(row.id, waitingDeclaredPrincipal[waitingDeclaredPrincipal.length - 1]);
      continue;
    }
    const article = workspace.articleDnas.find(a => a.payload.subject?.keywordId === row.id);
    /*
     * 2026-10-14 (caso WifiConecta) · PLANILHA: a keyword do Assunto (ou a
     * principal declarada) presa no ArticleDNA vigente de OUTRO artigo recusa só
     * esta linha, dizendo onde está presa e o caminho ("Retirar artigo do Silo",
     * decisão do dono). Antes ela virava alvo sem artigo e a prévia não dizia por quê.
     */
    if (!article && options.lenient && standing.plan) {
      const conflito = planSheetArticleConflict({
        keywordId: row.id,
        declaredPrincipalId: standing.plan.declaredPrincipal?.keywordId ?? null,
        articles: workspace.articleDnas.map(a => ({
          articleId: a.payload.articleId,
          versionNumber: a.versionNumber,
          subjectKeywordId: a.payload.subject?.keywordId ?? null,
          principalKeywordId: a.payload.principalKeywordId ?? null,
          keywordIds: a.payload.keywordReferences.map(reference => reference.keywordId),
          slug: a.payload.suggestedSlug ?? null,
          siloRef: a.payload.siloId ?? a.payload.territoryRef ?? null,
          siloLabel: territories.find(t => t.territoryRef === (a.payload.territoryRef ?? a.payload.siloId))?.territory.name ?? null,
          subjectPhrase: a.payload.subject?.phrase ?? null,
        })),
      });
      if (conflito) { esperaPorId.set(row.id, conflito.sentence); continue; }
    }
    // F4 — a principal declarada ainda não chegou ao Arquiteto: o Assunto espera (nunca ganha principal sugerida).
    if (standing.plan?.declaredPrincipal && !rows.has(standing.plan.declaredPrincipal.keywordId)) {
      waitingDeclaredPrincipal.push(`“${standing.phrase}” aguarda a principal declarada “${standing.plan.declaredPrincipal.phrase}” chegar ao Arquiteto (aprove-a no Minerador e envie).`);
      esperaPorId.set(row.id, waitingDeclaredPrincipal[waitingDeclaredPrincipal.length - 1]);
      continue;
    }
    /*
     * 2026-10-13 · TRAVA (SDD do cadastro único §3.5): só a principal TRAVADA é
     * fixa (`declaredPrincipalId`); a LIVRE é a principal atual enquanto o artigo
     * não existe e a melhoria pode propor outra pela SERP/volume (decisão humana
     * na prévia). A keyword do plano, travada ou livre, é `planPrincipalId` (D2(a)).
     */
    const fixa = lockedPlanPrincipal(standing);
    const livre = freePlanPrincipal(standing);
    const principalAtual = article?.payload.principalKeywordId ?? livre?.keywordId ?? null;
    /*
     * 2026-10-15 · A REGRA DO DONO (R2) TAMBÉM NO MOTOR DA MELHORIA: "se já está
     * definido [o volume], não pode trocar mesmo que só tenha 10". A principal
     * Livre do plano com volume medido no DNA fica fixa como a travada; só a
     * Livre SEM volume pode receber outra principal (a keyword solta incluída).
     */
    const linhaDaPrincipal = !fixa && standing.plan && principalAtual ? rows.get(principalAtual) : undefined;
    const volumeDaPrincipal = linhaDaPrincipal ? knownVolumeOfRow(linhaDaPrincipal, new Date()) : null;
    const livreComVolume = volumeDaPrincipal?.state === "measured" && volumeDaPrincipal.volume > 0 ? principalAtual : null;
    targets.push({ id: row.id, kind: "subject", theme: standing.phrase, note: standing.note, primaryId: principalAtual, post: "free", memberIds: article?.payload.keywordReferences.map(r => r.keywordId) ?? [], territoryRef: text(row.territoryRef), slug: article?.payload.suggestedSlug ?? null, url: null, canonical: null, signals: signals(row),
      // 2026-10-16 · §15: o slug e os detalhes do plano aprovado são sementes e régua da linha de copy (aditivo).
      ...(standing.plan?.slug ? { planSlug: standing.plan.slug } : {}), ...(standing.plan?.scope ? { planScope: standing.plan.scope } : {}), ...(standing.plan?.role ? { planRole: standing.plan.role } : {}),
      // F4 — principal declarada no plano (pacote aprovado do Assunto): fixa SÓ quando travada (ou, desde 15/10, Livre com volume definido); e o plano ainda não aplicado ao DNA (D8).
      ...(fixa ? { declaredPrincipalId: fixa.keywordId } : livreComVolume ? { declaredPrincipalId: livreComVolume } : {}),
      ...(standing.plan?.declaredPrincipal ? { planPrincipalId: standing.plan.declaredPrincipal.keywordId } : {}),
      // 2026-10-14 (noite) · o artigo "Consolidado do plano do Minerador" sem SERP (gravado antes da restauração de 16/10) volta a ficar "pronto" para receber o parecer pela melhoria.
      ...(standing.plan && article && (!declaredPlanAppliedTo(article.payload, standing) || (!article.payload.serpAssessmentRef && isDeclaredPlanConsolidation(article.payload))) ? { declaredPlanPending: true } : {}) });
  }
  /*
   * 2026-10-18 · O PILAR DO MESMO PLANO, para a regra da cabeça do Pilar (`planPillar`, lido por `suporteReservaAoPilar`):
   * de TODAS as linhas do recorte, antes do filtro por `targetIds` — o "Processar artigos" de algumas linhas (sem o Pilar)
   * e o refazedor de um artigo só também sabem qual é o núcleo do Pilar/Silo. A principal atual do Pilar (a do ArticleDNA
   * vigente; antes dele, a do plano), o slug (do DNA; antes dele, o do plano) e a entidade do DNA. Só leitura (aditivo).
   */
  const pilarDoGrupo = new Map<string, NonNullable<ImprovementTarget["planPillar"]>>();
  for (const row of rows.values()) {
    const plano = (standings.get(row.id) ?? readArchitectSubjectStanding(row)).plan;
    if (plano?.role !== "Pilar" || pilarDoGrupo.has(plano.groupId)) continue;
    const artigo = workspace.articleDnas.find(a => a.payload.subject?.keywordId === row.id);
    const principalDoPilar = artigo?.payload.principalKeywordId ?? plano.declaredPrincipal?.keywordId ?? row.id;
    pilarDoGrupo.set(plano.groupId, { keyword: rows.get(principalDoPilar)?.keyword ?? plano.declaredPrincipal?.phrase ?? row.keyword, slug: artigo?.payload.suggestedSlug ?? plano.slug ?? null, entity: signals(row).centralEntity ?? null });
  }
  for (const target of targets) {
    if (target.kind !== "subject" || target.planRole !== "Suporte") continue;
    const linha = rows.get(target.id);
    const grupo = linha ? (standings.get(target.id) ?? readArchitectSubjectStanding(linha)).plan?.groupId : undefined;
    const pilar = grupo ? pilarDoGrupo.get(grupo) : undefined;
    if (pilar) target.planPillar = pilar;
  }
  /*
   * 2026-10-15 · AS KEYWORDS SOLTAS ENTRAM NA LISTA (pedido do dono: "lembrar
   * das keywords soltas, livres, que não têm assunto nem nada (…) podem ser
   * usadas como secundárias ou principais, sempre de acordo ao DNA delas").
   * Com o recorte de um grupo, a mesa só trazia as keywords DO grupo e a lista
   * da marca perdia as que não têm grupo. Agora as sem grupo (recebidas, com o
   * dono de cada uma pelos artigos delas) entram só na LISTA — nunca como alvo.
   */
  if (groupFilter?.kind === "group") {
    const soltas = await loadCanonicalArquitetoWorkspace(context, { keywordDetail: "full", groupFilter: { kind: "none" } }).catch(() => null);
    if (soltas) {
      for (const a of soltas.articleDnas) for (const reference of a.payload.keywordReferences) if (!owned.has(reference.keywordId)) owned.set(reference.keywordId, a.payload.subject?.keywordId ?? a.payload.articleId);
      for (const [id, row] of projected(soltas, context.brandId)) if (!rows.has(id)) rows.set(id, row);
    }
  }
  for (const target of targets) {
    const territory = territories.find(t => t.territoryRef === target.territoryRef)?.territory;
    target.siloContext = territory && siloIsHumanDecided(territory.lifecycleStatus)
      ? { centralEntity: territory.centralEntity, macroIntent: territory.macroIntent, slug: territory.slugState.publishedSlug || territory.slugState.confirmed || territory.slugState.proposals?.[0]?.slug || null }
      : { centralEntity: null, macroIntent: null, slug: null };
  }
  /*
   * A FORMAÇÃO DA MESA DE UM PUBLICADO É DELE (2026-10-01).
   *
   * Reforço antigo deixava keywords na formação da mesa do publicado sem
   * entrar no ArticleDNA ("marketing digital para dentistas": 9 na mesa, 4 no
   * DNA). Elas contavam como "de outra formação" e não podiam nem entrar no
   * artigo nem sair dele. Agora são candidatas DO PRÓPRIO artigo: entram as que
   * a SERP e o sentido sustentam (teto de 6), e ao gravar as que sobram são
   * liberadas para "Keywords não agrupadas", nomeadas — nenhuma some.
   */
  const formacaoDoAlvo = new Map<string, string>();
  for (const target of targets) {
    if (target.kind !== "published") continue;
    for (const id of target.memberIds) { const ref = text(rows.get(id)?.articleFormationRef); if (ref && !formacaoDoAlvo.has(ref)) formacaoDoAlvo.set(ref, target.id); }
  }
  /*
   * F5 · "TROCAR PRINCIPAL" NA PLANILHA: a escolha só vale para artigo do plano
   * com trava LIVRE e entre as candidatas da regra única (a mesma da tela,
   * `planPrincipalSwapCandidates`). Fora disso, a linha é recusada com o motivo
   * — nunca a principal travada é trocada, nunca uma keyword de fora entra.
   */
  if (options.principalChoice) {
    const agoraDaEscolha = new Date();
    for (const target of targets) {
      const escolhida = options.principalChoice[target.id];
      if (!escolhida) continue;
      const linha = rows.get(target.id);
      if (target.kind !== "subject" || !linha) { target.principalChoiceRefusal = "Trocar principal pela planilha vale só para artigo do plano."; continue; }
      const deOutros = new Set([...owned].filter(([, dono]) => dono !== target.id).map(([id]) => id));
      const lido = planPrincipalSwapCandidates({ brandId: context.brandId, subjectRow: linha, rows: [...rows.values()], currentPrincipalId: target.primaryId, keywordIdsInOtherArticles: deOutros, now: agoraDaEscolha });
      if (!lido.ok) target.principalChoiceRefusal = lido.reason;
      else if (!lido.candidates.some(candidata => candidata.keywordId === escolhida)) target.principalChoiceRefusal = `“${rows.get(escolhida)?.keyword ?? escolhida}” não é candidata a principal deste artigo: só a keyword do Assunto e as sustentações com volume medido da lista dele, sem artigo de outro Assunto. Nada foi trocado.`;
      else target.chosenPrincipalId = escolhida;
    }
  }
  const selected = requested ? targets.filter(t => requested.includes(t.id)) : targets;
  const foraDosAlvos = requested?.filter(id => !selected.some(t => t.id === id)) ?? [];
  if (foraDosAlvos.length && !options.lenient) throw refusal("Um dos alvos não pertence à marca ou não está recebido no Arquiteto.");
  // F5 — a planilha recusa POR ITEM: o resto do lote segue.
  const refusedTargets = foraDosAlvos.map(id => ({ id, reason: esperaPorId.get(id) ?? (rows.has(id) ? "Não é um Assunto do plano recebido no Arquiteto neste recorte de cor (ou já é membro de outro artigo)." : "A keyword não está recebida no Arquiteto nesta marca ou nesta cor.") }));
  // F3 · LER ANTES DE BUSCAR (D4): o que já sabemos do volume de cada keyword, lido da linha (nunca do navegador).
  const agora = new Date();
  /*
   * 2026-10-16 · A KEYWORD QUE CARREGA O ASSUNTO É KEYWORD DA LISTA (cadastro
   * único, ADR-022 D1-ter; regra do dono de 13/10: "keyword que carrega Assunto
   * é keyword como qualquer outra"). Ela ficava fora: a prévia dizia "volume
   * medido de 0 de 0", a SERP da principal Travada era lida pelo TÍTULO do
   * Assunto (nunca achava o cache) e a Livre não tinha com quem se comparar. Ela
   * entra dona do próprio artigo (nunca reforça outro). A linha-título do
   * formato anterior (Assunto sem cadastro na keyword) continua fora.
   */
  const carregaOAssunto = (r: Row) => (standings.get(r.id) ?? readArchitectSubjectStanding(r)).carriesSubject === true;
  const keywords: ImprovementKeyword[] = [...rows.values()].filter(r => { const standing = standings.get(r.id) ?? readArchitectSubjectStanding(r); return !standing.declared || standing.carriesSubject === true; }).map(r => {
    const googleAds = String(r.volume_source ?? object(r.demandEvidence).source ?? "").toLowerCase() === "google_ads";
    const conhecido = knownVolumeOfRow(r, agora);
    return { id: r.id, keyword: r.keyword, volume: r.volume_search ?? null, volumeValidated: googleAds && (r.volume_search ?? 0) > 0, signals: signals(r), ownerId: owned.get(r.id) ?? (carregaOAssunto(r) ? r.id : null) ?? formacaoDoAlvo.get(text(r.articleFormationRef) ?? "") ?? (text(r.articleFormationRef) && object(r.articleFormationDecision).source === "human" ? `formation:${r.articleFormationRef}` : null), published: Boolean(r.isPublished) || brand.pages.some(p => p.keywordId === r.id), territoryRef: text(r.territoryRef), external: false, ...(googleAds || conhecido.state !== "missing" ? { googleAdsMeasured: true } : {}), ...(conhecido.state === "no_average" ? { noAverageAt: conhecido.measuredAt } : {}),
      // 2026-10-18 · volume desconhecido (nunca medida, "sem média" vencida, outro provider): nada se decide sobre a principal (SDD 2026-10-18 §6.1).
      ...(conhecido.state === "missing" ? { volumeUnknown: true } : {}) };
  });
  /*
   * O Assunto que a Pesquisa por Assunto já serviu (alguma keyword recebida traz `subject_discovery.subjectKeywordIds`
   * com ele): a lista dele entra na leitura ("Já temos"). ~~F5 (12/10): a busca nova no Google Ads não roda para ele.~~
   * SUBSTITUÍDO em 2026-10-18 pela regra de 16/10 (§15 passo 4): a lista é lida primeiro e a busca nova roda para todo
   * artigo que ainda pede reforço.
   */
  const subjectsWithMineradorList = new Set<string>();
  const subjectIds = new Set(targets.filter(t => t.kind === "subject").map(t => t.id));
  // 2026-10-13 · a lista da linha-título convertida é a lista da keyword que agora carrega o Assunto (alias derivado; nada é regravado).
  const aliasDoAssunto = new Map<string, string>();
  for (const standing of standings.values()) if (standing.conversion && standing.declared) aliasDoAssunto.set(standing.conversion.fromKeywordId, standing.keywordId);
  if (subjectIds.size) for (const row of rows.values()) {
    const approved = object(object(object(row.canonicalWorkflow).payload).approvedDna);
    for (const semantic of [object(row.analise_semantica), object(approved.analiseSemantica)]) {
      for (const lido of readSubjectDiscoveryBlock(semantic).subjectKeywordIds) {
        const id = subjectIds.has(lido) ? lido : aliasDoAssunto.get(lido) ?? lido;
        if (subjectIds.has(id) && id !== row.id) subjectsWithMineradorList.add(id);
      }
    }
  }
  /*
   * 2026-10-19 · a régua c lê a intenção da SERP (não só o rótulo do DNA) e a localidade da marca (SDD localidade D11:
   * a cidade da própria marca não é "busca local" de fora). Leitura só: o leitor de sempre da localidade da marca.
   */
  const territorioDaMarca = (await resolveBrandSerpTarget(context.supabase, context.brandId)).territory;
  /*
   * 2026-10-19 · A SERP NACIONAL NÃO É PROVA NA MARCA COM LOCALIDADE (dono: "tem que fazer uma nova coleta da SERP quando
   * refizer os processos"; SDD 2026-10-18 R12: "cache coletado na localidade anterior não vale como evidência da
   * localidade nova"). A `evidencia_serp` do Minerador não grava a localidade e foi coletada antes da localidade da
   * marca (nacional): com a marca numa cidade, ela não decide a intenção (nem a observada, nem a que ela pôs na
   * qualificação: vale a da Lógica). A SERP que decide é a do cache na localidade da marca (pareceres de composição).
   */
  const serpNacionalNaoVale = Boolean(territorioDaMarca);
  const comALogica = (k: { signals: ImprovementKeyword["signals"] }, row: Row | undefined) => { if (serpNacionalNaoVale && row && serpEvidenceOfRow(row)) k.signals = { ...k.signals, intent: logicIntentOfRow(row) }; };
  for (const target of selected) {
    const intencaoDaSerp = serpNacionalNaoVale ? null : observedSerpIntentOfRow(rows.get(target.id));
    if (intencaoDaSerp) target.observedIntent = intencaoDaSerp;
    if (territorioDaMarca) target.brandTerritory = territorioDaMarca;
    comALogica(target, rows.get(target.id));
  }
  for (const k of keywords) {
    const intencaoDaSerp = serpNacionalNaoVale ? null : observedSerpIntentOfRow(rows.get(k.id));
    if (intencaoDaSerp) k.observedIntent = intencaoDaSerp;
    comALogica(k, rows.get(k.id));
  }
  return { workspace, rows, targets: selected, keywords, waitingDeclaredPrincipal, subjectsWithMineradorList, brand, refusedTargets };
}
/** F3 — o volume conhecido da linha recebida (coluna, medição gravada e "sem média"), pela regra D4. */
function knownVolumeOfRow(row: Row, now: Date): KnownVolume {
  return readKnownVolume({ volume_search: row.volume_search, volume_source: row.volume_source ?? object(row.demandEvidence).source ?? null, analise_semantica: object(row.analise_semantica) }, now);
}
/** F3 — o que a preparação sabe do volume de uma keyword, depois das medições que ela fez (ou reaproveitou). */
function knownVolumeOfKeyword(k: ImprovementKeyword, row: Row | undefined, now: Date): KnownVolume {
  if (k.noAverageAt) return { state: "no_average", measuredAt: k.noAverageAt, validUntil: new Date(Date.parse(k.noAverageAt) + 30 * 24 * 60 * 60 * 1000).toISOString() };
  if (k.volumeValidated || k.googleAdsMeasured) return { state: "measured", volume: k.volume ?? 0, measuredAt: k.measuredNowAt ?? null };
  if (row) return knownVolumeOfRow(row, now);
  return { state: "missing", reason: "never_measured", previousVolume: k.volume, previousSource: null, measuredAt: null };
}
/** As keywords que a melhoria pode medir: as dos alvos e as do mesmo tema (a MESMA regra da medição). */
function keywordsTiedToTargets(run: Pick<ImprovementRun, "targets" | "keywords">): ImprovementKeyword[] {
  const membros = new Set(run.targets.flatMap(target => target.memberIds));
  return run.keywords.filter(k => !k.external && (membros.has(k.id) || run.targets.some(target => sharesTheme(target.theme, k.keyword))));
}
type EvidenceRead = { evidence: ImprovementEvidence[]; ranking: Record<string, boolean | null>; vocabulary: Record<string, ImprovementSerpVocabulary> };
/**
 * 2026-10-16 · §15 passo 4: o que a SERP da principal de cada alvo mostra, do
 * cache (grátis). Falha de leitura = sem vocabulário: o reforço segue pela linha
 * de copy do plano e do DNA, sem inventar evidência.
 * 2026-10-17 · SUBSTITUÍDO "só a principal com volume tem SERP (sem volume, nunca
 * é coletada)": desde a régua única da coleta (G6, 17/10 tarde) a principal de
 * identidade sem volume TEM a SERP coletada; o vocabulário dela é lido do cache
 * como o de qualquer principal (antes, "Claro, Vivo ou TIM" e "Internet, TV Box e
 * streaming" ficavam sem as relacionadas e os domínios da própria SERP).
 */
async function principalVocabularyOf(context: PipelineContext, targets: ImprovementTarget[], keywords: ImprovementKeyword[]): Promise<Record<string, ImprovementSerpVocabulary>> {
  const porId = new Map(keywords.map(k => [k.id, k]));
  const principais = targets.flatMap(target => {
    const principal = porId.get(target.primaryId ?? "") ?? porId.get(target.declaredPrincipalId ?? "") ?? porId.get(target.planPrincipalId ?? "");
    return principal && !principal.external && (principal.volumeValidated || targetPrincipalIsIdentity(target, principal)) ? [{ targetId: target.id, keywordId: principal.id, keyword: principal.keyword }] : [];
  });
  if (!principais.length) return {};
  try {
    const lido = await readPrincipalSerpVocabulary(context, principais.map(({ keywordId, keyword }) => ({ keywordId, keyword })), new Date());
    return Object.fromEntries(principais.flatMap(item => { const vocab = lido.get(item.keywordId); return vocab ? [[item.targetId, vocab] as const] : []; }));
  } catch { return {}; }
}
async function evidenceOf(context: PipelineContext, targets: ImprovementTarget[], keywords: ImprovementKeyword[]): Promise<EvidenceRead> {
  const queries = new Map([...targets.map(t => [t.id, t.theme] as const), ...keywords.map(k => [k.id, k.keyword] as const)]);
  const vocabulary = await principalVocabularyOf(context, targets, keywords);
  let cache: Awaited<ReturnType<typeof readPublishedFootprints>>;
  try { cache = await readPublishedFootprints(context, [...queries].map(([keywordId, keyword]) => ({ keywordId, keyword })), new Date()); }
  catch { return { vocabulary, ranking: Object.fromEntries(targets.map(t => [t.id, null])), evidence: targets.flatMap(t => keywords.map(k => ({ targetId: t.id, keywordId: k.id, complete: false, sharedPages: 0, contradiction: false, anchorConclusive: false }))) }; }
  const index = buildSerpSubjectIndex(cache.footprints);
  const missing = new Set(cache.missingLenses.map(m => m.keywordId));
  // "Página que ranqueia não troca de principal": a mesma leitura do Reforçar
  // publicados, pelo cache já lido. Sem leitura completa, fica desconhecido (null).
  const ranking: Record<string, boolean | null> = {};
  for (const t of targets) {
    if (t.kind !== "published") continue;
    const footprint = cache.footprints.find(f => f.keywordId === t.id);
    ranking[t.id] = footprint && rankingBlocksSwap(readPageRanking({ url: t.url, canonical: t.canonical }, footprint)) ? true : !footprint || missing.has(t.id) ? null : false;
  }
  const evidence: ImprovementEvidence[] = targets.flatMap(t => keywords.map(k => {
    const overlap = index.overlap(t.id, k.id);
    return { targetId: t.id, keywordId: k.id, complete: !missing.has(k.id) && cache.footprints.some(f => f.keywordId === k.id && f.lenses.length === 4), sharedPages: overlap.sharedPageCount ?? 0, contradiction: overlap.strength === "none" && (keywords.find(old => old.id === t.primaryId)?.volumeValidated ?? false), anchorConclusive: overlap.strength !== "unknown" && !missing.has(t.id) && (keywords.find(old => old.id === t.primaryId)?.volumeValidated ?? false) };
  }));
  return { evidence, ranking, vocabulary };
}
const groupContexts = new WeakMap<ProvisionalArticleGroup, ImprovementTarget>();
function makeGroup(target: ImprovementTarget, proposal: ImprovementProposal, rows: Map<string, Row>): ProvisionalArticleGroup {
  const keywords = proposal.memberIds.map(id => rows.get(id)).filter((r): r is Row => Boolean(r));
  if (keywords.length !== proposal.memberIds.length || !proposal.principalId || !target.territoryRef) throw refusal("Composição sem membros, principal ou Silo suficiente.");
  const group: ProvisionalArticleGroup = { id: target.id, keywordIds: proposal.memberIds, keywords, publishedAnchorId: target.kind === "published" ? target.id : null, territoryRef: target.territoryRef, suggestedSiloId: null, suggestedSiloName: null, evidence: { lexical: 0, intent: 0, entities: 0, silo: 1, combined: 0 }, confidence: 0, alerts: proposal.reasons, principalSuggestion: { keywordId: proposal.principalId, score: 0, breakdown: { cobertura: 0, intencao: 0, centralidadeSemantica: 0, aderenciaMarca: 0, potencialComercial: 0, volume: 0, dificuldade: 0, qualidadeSlug: 0, ancoraPublicada: target.kind === "published" ? 1 : 0, serp: null }, justificativa: proposal.reasons, pendencias: [] }, roles: Object.fromEntries(proposal.memberIds.map(id => [id, id === proposal.principalId ? "principal" : "secundaria"])), suggestedHierarchy: "Suporte", architectureStatus: "architecture_confirmed" };
  // F4 — o artigo de um Assunto com plano: papel e escopo do plano no adapter.
  const plano = target.kind === "subject" && rows.get(target.id) ? declaredPlanForGroup(readArchitectSubjectStanding(rows.get(target.id)!)) : undefined;
  if (plano) group.declaredPlan = plano;
  groupContexts.set(group, target);
  return group;
}
function baseHash(group: ProvisionalArticleGroup) {
  const target = groupContexts.get(group);
  return articleSerpBaseHash({ territoryRef: group.territoryRef!, principalKeywordId: group.principalSuggestion.keywordId,
    roles: group.keywordIds.map(keywordId => ({ keywordId, role: keywordId === group.principalSuggestion.keywordId ? "principal" : "secundaria" })),
    // 2026-10-16 · o slug declarado no plano (artigo novo) entra no hash como na mesa (o candidato do plano nasce com ele).
    suggestedSlug: target?.kind === "published" ? null : group.declaredPlan?.slug ?? suggestArticleSlug({ principal: group.keywords.find(k => k.id === group.principalSuggestion.keywordId)!, siloSlug: target?.siloContext?.slug ?? null }),
    // A MESMA intenção que a mesa usa no hash esperado (articleSerpIntentOf).
    intents: group.keywords.map(k => ({ keywordId: k.id, intent: articleSerpIntentOf(k) })),
    siloContext: { centralEntity: target?.siloContext?.centralEntity ?? null, macroIntent: target?.siloContext?.macroIntent ?? null },
  });
}
/** The SERP route accepts at most 20 groups per request (RequestSchema). */
export const SERP_GROUPS_PER_REQUEST = 20;
/*
 * 2026-10-19 · O REFAZER COLETA A SERP DE NOVO (dono: "tem que fazer uma nova coleta da SERP quando refizer os
 * processos"; "a guarda de retrabalho não pode barrar essa recoleta quando o processo está sendo refeito"). No
 * "Melhorar publicados…" (o refazedor, V5) a coleta paga da SERP na localidade da marca não é barrada pela guarda de
 * retrabalho (G13/G20): o pedido leva o motivo do refazer, a rota registra e o cache de 30 dias continua valendo (só se
 * paga a lente que falta, com o custo dito antes). No "Processar artigos" (origem `plan_sheet`), a guarda de sempre.
 */
export const REFAZER_SERP_REWORK_REASON = "Refazer pelo “Melhorar publicados…” (dono, 19/10): a SERP da localidade da marca é coletada de novo ao refazer; só a lente que falta no cache é paga, com o custo dito antes.";
const refazerSerpOptions = (run: Pick<ImprovementRun, "origin">): SerpOperationOptions => run.origin === "plan_sheet" ? {} : { reworkOverride: { reason: REFAZER_SERP_REWORK_REASON } };
type SerpOperationOptions = { reworkOverride?: { reason: string } };
async function serpOperation(context: PipelineContext, supplied: ProvisionalArticleGroup | ProvisionalArticleGroup[], mode: "plan" | "execute", budget = 0, options: SerpOperationOptions = {}): Promise<Record<string, unknown>> {
  const groups = Array.isArray(supplied) ? supplied : [supplied];
  if (groups.length > SERP_GROUPS_PER_REQUEST) {
    if (mode !== "plan") throw refusal("Validação da SERP em lote acima de 20 grupos não é permitida numa chamada.");
    // Plan only reads the cache: split in blocks and merge, counting each
    // keyword/lens once so the cost is not inflated by repeated candidates.
    const seen = new Set<string>(), details: unknown[] = [], recusados: unknown[] = [];
    let paidQueries = 0, min = 0, max = 0, cacheUnavailable = false;
    for (let start = 0; start < groups.length; start += SERP_GROUPS_PER_REQUEST) {
      const resposta = await serpOperation(context, groups.slice(start, start + SERP_GROUPS_PER_REQUEST), "plan", 0, options);
      const part = object(resposta.plan);
      // 2026-10-19 · os grupos barrados pela guarda de retrabalho em cada bloco não se perdem na soma.
      const barrados = object(resposta.rework).articles;
      if (Array.isArray(barrados)) recusados.push(...barrados);
      const partDetails = Array.isArray(part.missingDetails) ? part.missingDetails : [];
      const fresh = partDetails.filter(raw => { const item = object(raw); const k = `${String(item.keywordId ?? item.keyword ?? "")}|${String(item.lens ?? "")}`; if (seen.has(k)) return false; seen.add(k); return true; });
      const calls = Number(part.paidQueries ?? 0), cost = object(part.estimatedCostUsd);
      const share = partDetails.length ? fresh.length / partDetails.length : 1;
      paidQueries += partDetails.length ? fresh.length : calls;
      min += Number(cost.min ?? 0) * share; max += Number(cost.max ?? 0) * share;
      details.push(...fresh);
      cacheUnavailable ||= part.cacheUnavailable === true;
    }
    return { plan: { paidQueries, estimatedCostUsd: { min, max }, missingDetails: details, ...(cacheUnavailable ? { cacheUnavailable: true } : {}) }, ...(recusados.length ? { rework: { articles: recusados } } : {}) };
  }
  // 2026-10-16 · §15 passo 4: a leitura só com cache dá o parecer pela SERP da principal; a secundária sem SERP no cache fica "não observada" (não derruba o parecer, nada é pago).
  const resposta = await handleArchitectFormationSerp(internalRequest("/api/arquiteto/serp", { brandId: context.brandId, groups, formationBaseHashes: Object.fromEntries(groups.map(group => [group.id, baseHash(group)])), lenses: SERP_SUBJECT_LENS_LABELS, mode, cacheOnly: mode === "execute" && budget === 0, ...(mode === "execute" && budget === 0 ? { observeCachedSupportsOnly: true } : {}), authorizedPaidQueries: budget, payMissingExtraLenses: mode === "plan" || budget > 0, recollectStaleLenses: false, ...(options.reworkOverride ? { reworkOverride: options.reworkOverride } : {}) }), context);
  /*
   * 2026-10-19 · NO PLANO, A GUARDA DE RETRABALHO NÃO É FALHA: quando ela barra TODOS os grupos do pedido (409
   * REWORK_SAME_REFUSAL), o plano é "nada a pagar" e a recusa volta com os grupos (`rework.articles`), como no plano
   * parcial. Antes o 409 virava exceção e derrubava a prévia ou a coleta inteira.
   */
  if (mode === "plan" && resposta.status === 409) {
    const corpo = await resposta.clone().json().catch(() => null) as Record<string, unknown> | null;
    if (corpo && corpo.code === "REWORK_SAME_REFUSAL") return { plan: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, rework: { articles: object(corpo.rework).articles ?? [] } };
  }
  return responseData(resposta);
}
/** Até aqui (a partir do início do prepare) cabem IA + busca gratuita; o resto é cache da SERP e gravação. */
const PREPARE_SEARCH_DEADLINE_MS = 60000;
/**
 * Depois disso (desde o início da requisição) nenhuma composição nova começa a
 * ser conferida: a rota tem 120 s e ainda falta gravar e reler a execução. A
 * composição que ficou de fora vira "precisa validar" (nada pago, nada gravado).
 */
const COMPOSITION_DEADLINE_MS = 90000;
const AI_TIMEOUT_MESSAGE = "A IA excedeu o tempo limite.";
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(AI_TIMEOUT_MESSAGE), { code: "AI_TIMEOUT" })), ms); });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
/**
 * O que vai para a execução (e para o navegador) é um texto fixo por tipo de
 * falha, nunca a mensagem crua do provider.
 */
function editorialAiFailureMessage(error: unknown): string {
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "AI_TIMEOUT" || (error instanceof Error && error.name === "AbortError")) return AI_TIMEOUT_MESSAGE;
  if (code === "AI_OUTPUT_INVALID" || code === "AI_PROVIDER_INVALID_RESPONSE") return "A resposta da IA veio fora do formato.";
  if (/CONNECTION|CREDENTIAL|PROVIDER_INVALID|NOT_CONFIGURED/i.test(code)) return "A Connection de IA da plataforma (OpenRouter) não está disponível.";
  return "A IA está indisponível.";
}
/**
 * 2 · LEITURA EDITORIAL DA IA NA LISTA (decisão do dono, 2026-09-30). Uma
 * chamada em lote por execução; a resposta fica no run e o collect só a relê.
 * Falha, tempo esgotado ou IA desligada: um aviso e a jornada segue pelas regras.
 */
/**
 * Registro de uso (2026-10-12): a IA e a busca no Google Ads da melhoria não
 * apareciam em `integration_usage_events`. O registro não derruba a jornada —
 * a chamada já aconteceu —, mas a falha dele fica dita na execução.
 */
async function recordImprovementUsage(runtime: ImprovementRuntime, run: ImprovementRun, event: ImprovementUsageEvent) {
  if (!runtime.recordUsage) return;
  try { await runtime.recordUsage(event); }
  catch {
    const aviso = "O registro de uso de uma chamada desta preparação não foi confirmado (a chamada aconteceu).";
    if (!run.notices.includes(aviso)) run.notices.push(aviso);
  }
}
async function readEditorialAi(runtime: ImprovementRuntime, run: ImprovementRun, ranking: Record<string, boolean | null>) {
  if (run.editorialAi) return;
  const eligible = improvementAiEligibleTargets(run.targets, run.proposals).length;
  const targets = improvementAiTargets(run.targets, run.proposals);
  const list = improvementAiList(run.keywords, run.proposals);
  const base = { askedTargetIds: targets.map(t => t.id), listSize: list.length, picks: [], rejected: [] };
  if (!targets.length || !list.length) { run.editorialAi = editorialAiRecord({ ...base, status: "skipped" }); return; }
  if (!runtime.editorialAi) {
    run.editorialAi = editorialAiRecord({ ...base, status: "off", message: "IA desligada nesta execução." });
    run.notices.push("Leitura da IA desligada: a lista existente seguiu só pelas regras da SERP e pela busca gratuita.");
    return;
  }
  try {
    const timeoutMs = runtime.editorialAiTimeoutMs ?? IMPROVEMENT_AI_TIMEOUT_MS;
    // O provider aborta no limite; a corrida garante o mesmo limite para qualquer implementação injetada.
    const prompt = buildImprovementAiPrompt({ targets, list, keywords: run.keywords, ranking });
    let raw: unknown;
    try { raw = await withDeadline(runtime.editorialAi({ system: prompt.system, user: prompt.user, timeoutMs }), timeoutMs + 2000); }
    catch (error) {
      // A chamada saiu: tempo esgotado ou recusa do provider também ficam no registro de uso.
      const code = error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
      await recordImprovementUsage(runtime, run, { kind: "editorial_ai", runId: run.runId, resultStatus: "failed", errorCode: /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : "ARTICLE_IMPROVEMENT_AI_FAILED", targets: targets.length, listSize: list.length });
      throw error;
    }
    await recordImprovementUsage(runtime, run, { kind: "editorial_ai", runId: run.runId, resultStatus: "succeeded", errorCode: null, targets: targets.length, listSize: list.length });
    const checked = validateImprovementAiPicks(raw, { targets, keywords: run.keywords, listIds: list.map(k => k.id), aliases: prompt.aliases });
    run.editorialAi = editorialAiRecord({ ...base, status: "answered", picks: checked.picks, rejected: checked.rejected });
    if (checked.rejected.length) run.notices.push(`Leitura da IA: ${checked.rejected.length} sugestão(ões) recusada(s) pelas regras do código (formato, id fora da lista, sem volume, já publicada, de outro artigo, contradiz o slug ou a restrição do tema, outro público ou nicho, sem o núcleo do assunto, cabeça genérica ou mais de 3 por alvo). Veja cada recusa em “Sugestões da IA recusadas”.`);
  } catch (error) {
    const message = editorialAiFailureMessage(error);
    run.editorialAi = editorialAiRecord({ ...base, status: "failed", message });
    run.notices.push(`Leitura da IA indisponível agora (${message}) A busca seguiu pelas regras de sempre.`);
  }
  if (eligible > targets.length) run.notices.push(`Leitura da IA: ${eligible - targets.length} publicado(s) ou Assunto(s) além dos ${targets.length} desta leitura ficaram só com as regras e a busca gratuita nesta preparação (limite por chamada da IA).`);
}
/** Pagination and direct/expanded seeds share a memo; no repeated seed calls. */
/*
 * VOLUME ANTIGO É MEDIDO DE NOVO NO PREPARO (pedido do dono, 2026-09-30).
 *
 * "tráfego pago vs orgânico para clínica de estética" ficou com a principal
 * publicada sem volume porque as keywords do próprio artigo vieram de outra
 * era (volume de outro provider, "Bruto" no Minerador): sem `volume_source =
 * google_ads` nenhuma contava como volume validado, e a troca nunca era
 * proposta — mesmo "trafego organico e pago" levando o núcleo do slug. Aqui
 * elas são medidas no Google Ads (grátis, só leitura) para a proposta
 * enxergar a demanda real.
 *
 * F3 · LER ANTES DE BUSCAR (2026-10-14): a medição só acontece com a
 * autorização dita na prévia ("já temos · falta · custa"; cota do Google Ads,
 * sem custo em dólar), só para o que falta (medido e "sem média" < 30 dias
 * ficam fora, D4) e UMA vez. F4 (item 2): a gravação da medição é do
 * Minerador — ela vai guardada na sugestão, e "Sugestões do Arquiteto" a grava
 * pelo clique do dono, sem consultar o Google Ads de novo.
 */
const OLD_VOLUME_MEASURE_LIMIT = 300;
/** As keywords que ainda faltam medir (D4: medida e "sem média" < 30 dias não entram). */
function keywordsToMeasure(run: Pick<ImprovementRun, "targets" | "keywords">): ImprovementKeyword[] {
  return keywordsTiedToTargets(run).filter(k => !k.volumeValidated && !k.googleAdsMeasured && !k.noAverageAt).slice(0, OLD_VOLUME_MEASURE_LIMIT);
}
/**
 * F3 · A MEDIÇÃO DO GOOGLE ADS, UMA VEZ. Com `runtime.measureVolumes`, a
 * medição inteira volta e fica guardada na keyword (para "Gravar melhorias"
 * gravar sem consultar de novo); sem ele, só a média, como antes.
 */
async function measureAverages(runtime: ImprovementRuntime, keywords: readonly string[]): Promise<{ volumes: Map<string, number | null>; measurements: Map<string, ImprovementStoredMeasurement>; calls: number }> {
  const context = runtime.context;
  const measurements = new Map<string, ImprovementStoredMeasurement>();
  const calls = keywords.length ? Math.ceil(keywords.length / 10000) : 0;
  if (!keywords.length) return { volumes: new Map(), measurements, calls };
  if (!runtime.measureVolumes) return { volumes: await readGoogleAdsAverageVolumes({ actorUserId: context.actorUserId, agencyId: null, brandId: context.brandId, keywords }), measurements, calls };
  const lido = await runtime.measureVolumes(keywords);
  const volumes = new Map<string, number | null>();
  for (const { metric, requestId } of lido.metrics) {
    for (const pedida of metric.matchedRequestedKeywords) {
      volumes.set(normalizeKeyword(pedida), metric.averageMonthlySearches);
      measurements.set(normalizeKeyword(pedida), { metric, requestId });
    }
  }
  // Pedida sem resposta é "sem média" (sem volume), nunca zero inventado.
  for (const pedida of lido.unmatched) if (!volumes.has(normalizeKeyword(pedida))) volumes.set(normalizeKeyword(pedida), null);
  return { volumes, measurements, calls };
}
/*
 * F4 · a porta de "replay" (gravar a medição guardada sem consultar o Google
 * Ads de novo) mudou para o Minerador, que é quem grava a medição:
 * `replayStoredMeasurements` em `lib/server/minerador-architect-suggestions.ts`.
 */
async function measureOldVolumes(runtime: ImprovementRuntime, run: ImprovementRun): Promise<{ asked: number; calls: number }> {
  const alvo = keywordsToMeasure(run);
  if (!alvo.length) return { asked: 0, calls: 0 };
  try {
    const { volumes, measurements, calls } = await measureAverages(runtime, alvo.map(k => k.keyword));
    const agora = new Date().toISOString();
    // Só volume positivo muda a prévia: "sem média" não valida nada, e a
    // keyword segue sem volume validado, sem gravação pendente — mas conta
    // como medida (D4): a próxima preparação não pergunta de novo.
    let comVolume = 0, semMedia = 0;
    for (const k of alvo) {
      k.measuredNowAt = agora;
      k.googleAdsMeasured = true;
      const medido = volumes.get(normalizeKeyword(k.keyword));
      if (typeof medido !== "number" || medido <= 0) { semMedia++; k.noAverageAt = agora; continue; }
      k.volume = medido;
      k.volumeValidated = true;
      k.volumePendingWrite = true;
      const medicao = measurements.get(normalizeKeyword(k.keyword));
      if (medicao) k.measurement = medicao;
      comVolume++;
    }
    run.notices.push(`${alvo.length} keyword(s) sem volume medido no Google Ads foram medidas agora, com a sua autorização, grátis (cota do Google Ads): ${comVolume} com volume${semMedia ? `, ${semMedia} sem média oficial` : ""}.${comVolume ? " O Arquiteto não grava a medição: ela vai em “Sugestões do Arquiteto” e o Minerador a grava pelo seu clique, sem consultar o Google Ads de novo." : ""}`);
    return { asked: alvo.length, calls };
  } catch (error) {
    run.notices.push(`Não deu para medir no Google Ads o volume de ${alvo.length} keyword(s): ${error instanceof Error ? error.message : "provider indisponível"}. Elas seguem sem volume validado nesta prévia.`);
    return { asked: 0, calls: 0 };
  }
}

async function discover(runtime: ImprovementRuntime, run: ImprovementRun, targets: ImprovementTarget[], existing: ImprovementKeyword[], notices: string[], budgetMs = 35000, knownInBrand?: ReadonlyMap<string, { keywordId: string; known: KnownVolume }>, vocabulary: Readonly<Record<string, ImprovementSerpVocabulary>> = {}, existingInBrand?: ReadonlyMap<string, string>) {
  /*
   * 2026-10-16 · §15 — AS SEMENTES SÃO DO PLANO E DO DNA. Para o Assunto: a
   * principal, o slug, a entidade do DNA, o Assunto e as buscas relacionadas da
   * SERP da principal em cache. Antes eram só pedaços do TÍTULO ("entra na
   * conta", "primeira fatura"), e a busca voltava com "entra na conta do google".
   * Alvo sem semente não busca.
   */
  const porIdDaLista = new Map(existing.map(k => [k.id, k]));
  // 2026-10-17 · o contexto do Silo (marcas da SERP, assunto comum) de TODOS os alvos da execução: a mesma régua do alocador.
  const silo = improvementSiloContext(run.targets, porIdDaLista, vocabulary);
  const sementesDe = (target: ImprovementTarget) => target.kind === "subject" ? improvementDiscoverySeeds(target, porIdDaLista, vocabulary[target.id], shortSeedsOf(target.theme).slice(0, 2), { common: silo.common.get(target.territoryRef ?? "") }) : shortSeedsOf(target.theme);
  const semSemente = targets.filter(target => !sementesDe(target).length);
  if (semSemente.length) notices.push(`Busca nova sem semente do plano ou do DNA não roda: ${semSemente.slice(0, 3).map(t => t.theme).join("; ")}${semSemente.length > 3 ? "…" : ""}.`);
  targets = targets.filter(target => sementesDe(target).length);
  const context = runtime.context;
  const canonical = await resolveGoogleAdsCanonicalContext({ actorUserId: context.actorUserId, agencyId: null, brandId: context.brandId, operation: "discovery" });
  const { client } = await createGoogleAdsCanonicalClient({ context: canonical });
  const account = createGoogleAdsKeywordAccount({ customerId: canonical.customerId, loginCustomerId: canonical.managerCustomerId });
  const memo = new Set<string>(), found = new Map(existing.map(k => [normalizeKeyword(k.keyword), k]));
  // One request per page (theme + URL together); a second, broader one only
  // when the first brings back nothing new. Budget covers every target once.
  const LIMIT = IMPROVEMENT_DISCOVERY_REQUEST_LIMIT, BUDGET_MS = budgetMs, started = Date.now();
  let requests = 0;
  const pending: string[] = [];
  const ask = async (seed: GoogleAdsKeywordIdeasInput["seed"]): Promise<number> => {
    const seedKey = JSON.stringify(seed);
    if (memo.has(seedKey)) return 0;
    memo.add(seedKey); requests++;
    if (run.discovery) run.discovery.requests = requests;
    // Uma chave por chamada da mesma execução (o mesmo sufixo por página da Descoberta).
    const suffix = `${seed.kind === "keyword_and_url" ? "url_seed" : "keyword_seed"}:p${requests}` as GoogleAdsDiscoveryUsageKeySuffix;
    let result: Awaited<ReturnType<typeof generateGoogleAdsKeywordIdeas>>;
    try { result = await generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId, loginCustomerId: account.loginCustomerId ?? undefined }, targeting: targetingToProviderInput(canonical.targeting ?? defaultGoogleAdsCanonicalTargeting()), seed, pageSize: 500 }, account); }
    catch (error) {
      const code = error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
      await recordImprovementUsage(runtime, run, { kind: "google_ads_discovery", runId: run.runId, resultStatus: "failed", errorCode: /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : "GOOGLE_ADS_DISCOVERY_FAILED", suffix, providerReference: null, receivedCount: null });
      throw error;
    }
    await recordImprovementUsage(runtime, run, { kind: "google_ads_discovery", runId: run.runId, resultStatus: "succeeded", errorCode: null, suffix, providerReference: (result as { requestId?: string | null }).requestId ?? null, receivedCount: result.ideas.length });
    let fresh = 0;
    for (const idea of result.ideas) {
      const phrase = idea.keyword, normalized = normalizeKeyword(phrase);
      if (!normalized || found.has(normalized)) continue;
      const id = stableUuid(context.brandId, normalized, "improvement-candidate");
      const logic = deriveLogicalKeywordBatchItem({ id, keyword: phrase, location: null, intent: null, analise_semantica: {} }, null, new Date().toISOString());
      found.set(normalized, { id, keyword: phrase, volume: null, volumeValidated: false, signals: resolveKeywordDnaSignals({ keywordId: id, text: phrase, semantic: logic.update.analise_semantica }), ownerId: null, published: false, territoryRef: null, external: true });
      fresh++;
    }
    return fresh;
  };
  for (const target of targets) {
    // The preparation also reads the SERP cache: keep the free search inside a bounded time.
    if (requests >= LIMIT || Date.now() - started > BUDGET_MS) { pending.push(target.theme); continue; }
    // Google Ads returns only the phrase itself for long titles; short cores
    // ("plano de marketing", "clínica de estética") bring the related searches.
    const cores = sementesDe(target);
    const direct: GoogleAdsKeywordIdeasInput["seed"] = target.url ? { kind: "keyword_and_url", keywords: cores, url: target.url } : { kind: "keyword", keywords: cores };
    const fresh = await ask(direct);
    const concepts = [target.signals.centralEntity, target.signals.perceivedProblem].filter((s): s is string => Boolean(s));
    if (fresh === 0 && concepts.length && requests < LIMIT) await ask({ kind: "keyword", keywords: concepts.slice(0, 2) });
  }
  if (pending.length) notices.push(`Pesquisa gratuita pendente para ${pending.length} item(ns) nesta rodada (${pending.slice(0, 3).join("; ")}${pending.length > 3 ? "…" : ""}). Prepare de novo para continuar.`);
  // §15: no Assunto, só a ideia na linha de copy dele (Assunto, slug, DNA, SERP da principal) é medida; no publicado, a regra de sempre.
  const candidates = [...found.values()].filter(k => k.external && !k.published && !k.ownerId && targets.some(t => t.kind === "subject" ? improvementIdeaOnCopyLine(t, porIdDaLista, vocabulary[t.id], k.keyword, silo) : sharesTheme(t.theme, k.keyword) || improvementEditorialFit(t, k).fits));
  /*
   * F3 · A BUSCA NOVA DEDUPLICA CONTRA A MARCA INTEIRA (regra 5 do item 3). A
   * ideia que já existe no Minerador com volume medido (ou "sem média" há
   * menos de 30 dias) é "já temos": usa o volume dele e não é medida de novo.
   * Só a ideia nova vai às métricas do Google Ads — e a medição fica guardada
   * para "Gravar melhorias" gravar sem consultar de novo.
   */
  let jaTemos = 0;
  /*
   * 2026-10-16 · "NOVA" = NÃO EXISTE NA MARCA (dono: "TUDO QUE VEM DO MINERADOR
   * NÃO PODE MEXER"). A ideia que já existe no Minerador — qualquer lista,
   * qualquer status, com ou sem volume — é só lida: usa o que ele já sabe e
   * nunca é medida, importada, processada nem aprovada de novo pelo Arquiteto.
   */
  const aMedir = candidates.filter(k => {
    const normal = normalizeKeyword(k.keyword);
    const conhecida = knownInBrand?.get(normal);
    const existente = existingInBrand?.get(normal) ?? conhecida?.keywordId ?? null;
    if (!existente) return true;
    k.knownInMinerador = { keywordId: existente };
    if (conhecida?.known.state === "measured") { k.googleAdsMeasured = true; k.volume = conhecida.known.volume; k.volumeValidated = conhecida.known.volume > 0; }
    else if (conhecida?.known.state === "no_average") { k.googleAdsMeasured = true; k.volume = null; k.volumeValidated = false; k.noAverageAt = conhecida.known.measuredAt; }
    else { k.volume = null; k.volumeValidated = false; }
    jaTemos++;
    return false;
  });
  // Metrics are free in dollars (Google Ads quota), and estimates from keyword ideas are never validated demand.
  const { volumes, measurements } = await measureAverages(runtime, aMedir.map(k => k.keyword));
  const agora = new Date().toISOString();
  for (const k of aMedir) {
    const measured = volumes.get(normalizeKeyword(k.keyword));
    if (measured === undefined) continue;
    k.volume = measured; k.volumeValidated = typeof measured === "number" && measured > 0; k.measuredNowAt = agora; k.googleAdsMeasured = true;
    const medicao = measurements.get(normalizeKeyword(k.keyword));
    if (k.volumeValidated && medicao) k.measurement = medicao;
  }
  if (jaTemos) notices.push(`${jaTemos} ideia(s) da busca nova já existem no Minerador: usei o que ele já sabe (volume incluído), sem medir de novo. O Arquiteto não mexe nelas; só as novas entram pela confirmação.`);
  return [...found.values()].filter(k => !k.external || k.volumeValidated);
}
async function findRun(context: PipelineContext, runId: string) {
  const result = await context.supabase.from("editorial_workflow_items").select("id,lock_version,payload").eq("marca_id", context.brandId).eq("subject_type", SUBJECT_TYPE).eq("subject_id", runId).eq("stage", "architect").maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw refusal("Execução não encontrada nesta marca.");
  const run = result.data.payload as ImprovementRun;
  if (run.version !== ARTICLE_IMPROVEMENT_VERSION || run.brandId !== context.brandId || run.actorId !== context.actorUserId) throw refusal("Execução incompatível ou pertencente a outro ator.");
  return { id: String(result.data.id), lock: Number(result.data.lock_version), run };
}
/**
 * A última execução da marca com os mesmos insumos, dentro da janela. Leitura
 * que falha não derruba a preparação: ela segue como preparação nova.
 */
async function findReusableRun(context: PipelineContext, inputsHash: string): Promise<ImprovementReusableRun | null> {
  try {
    const since = new Date(Date.now() - IMPROVEMENT_REUSE_WINDOW_MS).toISOString();
    const result = await context.supabase.from("editorial_workflow_items").select("payload,created_at")
      .eq("marca_id", context.brandId).eq("subject_type", SUBJECT_TYPE).eq("stage", "architect")
      .eq("payload->>inputsHash", inputsHash).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(1);
    if (result.error) return null;
    const payload = (result.data as Array<{ payload?: unknown }> | null)?.[0]?.payload;
    return payload && typeof payload === "object" ? payload as ImprovementReusableRun : null;
  } catch { return null; }
}
async function saveRun(context: PipelineContext, current: Awaited<ReturnType<typeof findRun>>, run: ImprovementRun) {
  await new WorkflowRepository(context).update(current.id, current.lock, { state: run.state, payload: run as unknown as Record<string, unknown> });
  const readback = await findRun(context, run.runId);
  // JSONB reorders object keys and drops undefined: compare the content, not the text.
  if (stableHash(readback.run) !== stableHash(run)) throw refusal("A releitura da execução não confirmou a gravação.");
  return readback;
}
/**
 * F4 · O ARQUITETO SÓ LÊ (SDD 2026-10-13, item 2; D3): as propostas que
 * precisam do Minerador viram "Sugestões do Arquiteto" — o registro desta
 * execução, lido pela caixa do Minerador. Falha de gravação vira aviso; a
 * execução continua válida (e nada é gravado no Minerador por aqui).
 */
async function recordImprovementSuggestions(context: PipelineContext, run: ImprovementRun) {
  const drafts = improvementSuggestionDrafts(run);
  if (!drafts.length) return;
  const gravado = await recordArquitetoMineradorSuggestionsSafely(context, { source: "improvement", sourceId: run.runId, drafts });
  if (!gravado) return;
  if ("error" in gravado) run.notices.push(`As sugestões ao Minerador não foram gravadas agora (${gravado.error}). Prepare de novo para tentar.`);
  else run.notices.push(`${gravado.recorded} sugestão(ões) foram para o Minerador, em “Sugestões do Arquiteto”: lá você importa, grava a medição ou roda a Lógica, e depois usa “Aprovar e enviar”. O Arquiteto não gravou nada no Minerador.`);
}
const decisionHashOf = (run: ImprovementRun) => hash({ version: run.version, brandId: run.brandId, actorId: run.actorId, sources: run.sourceHashes, proposals: run.proposals, keywords: run.keywords, costs: run.costs });
/** F5 — a mesma prévia, comparada pelo conteúdo (o JSONB reordena chaves; `decisionHash` é do texto). */
const previewSignatureOf = (run: Pick<ImprovementRun, "version" | "brandId" | "actorId" | "sourceHashes" | "proposals" | "keywords" | "costs">) => stableHash({ version: run.version, brandId: run.brandId, actorId: run.actorId, sources: run.sourceHashes, proposals: run.proposals, keywords: run.keywords, costs: run.costs });

export async function handleArticleImprovement(runtime: ImprovementRuntime, request: ArticleImprovementRequest): Promise<ImprovementRun> {
  const context = runtime.context;
  if (request.brandId !== context.brandId) throw refusal("Marca divergente do contexto autorizado.");
  if (request.action === "prepare") {
    const recorte = request.group ? await resolveImprovementGroup(context, request.group) : null;
    const input = await readInputs(context, request.targetIds, recorte?.filter, { lenient: request.origin === "plan_sheet", excludePlanArticles: request.excludePlanArticles === true, ...(request.principalChoice ? { principalChoice: request.principalChoice } : {}) });
    const run: ImprovementRun = { version: ARTICLE_IMPROVEMENT_VERSION, runId: randomUUID(), brandId: context.brandId, actorId: context.actorUserId, createdAt: new Date().toISOString(), state: "prepared", leaseUntil: null, decisionHash: "", sourceHashes: Object.fromEntries(input.targets.map(t => [t.id, sourceHash(t, input.workspace, input.rows)])), targets: input.targets, keywords: input.keywords, beforeAssignments: Object.fromEntries([...input.rows].map(([id, row]) => [id, Object.fromEntries(Object.entries(object(object(row.canonicalWorkflow).payload)).filter(([key]) => ["territoryRef", "territoryAssignment", "articleFormationRef", "articleFormationDecision", "articleSubjectAnchor", "workingArticleId"].includes(key)))])), proposals: [], costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, reservedCostUsd: 0, notices: [], outcomes: [], acceptedIds: null };
    const started = Date.now();
    // 0 · MESMOS INSUMOS, MESMA LEITURA (2026-10-12): a execução anterior com a
    // mesma impressão digital dá a leitura da IA, as medições e a busca; nada
    // disso é chamado de novo. O cache da SERP (grátis) é relido abaixo.
    // Sem recorte, a impressão digital de sempre; com ele, o recorte entra (execuções de grupos diferentes não se confundem).
    const digital = improvementInputsFingerprint({ version: run.version, brandId: run.brandId, sourceHashes: run.sourceHashes, keywords: input.keywords });
    if (recorte) run.groupScope = recorte.scope;
    // F5 · planilha primeiro: a origem e as recusas por item ficam na execução (aditivo; ausentes = como antes).
    if (request.origin === "plan_sheet") run.origin = "plan_sheet";
    if (input.refusedTargets.length) run.refusedTargets = input.refusedTargets;
    run.inputsHash = stableHash(recorte ? { ...(digital as Record<string, unknown>), groupScope: recorte.scope.groupId ?? recorte.scope.filter } : digital);
    /*
     * F5 · GUARDA DE RETRABALHO (SDD 2026-10-12 §10.3). O registro é a própria
     * execução anterior (mesmo `inputsHash`, na janela): `same_inputs_reuse`
     * devolve o que ela já leu. "Refazer mesmo assim" (motivo, D11) chama de
     * novo a IA, as medições e — se pedida — a busca.
     */
    const anterior = await findReusableRun(context, run.inputsHash);
    // 2026-10-14 · sem IA, medição nem busca pedidas, a preparação é LEITURA GRÁTIS: repetir não pede motivo (só o que custa pede).
    /*
     * 2026-10-16 (amarelo da WifiConecta) · pedir o que a preparação anterior
     * NÃO fez (a busca nova, a leitura da IA) não é retrabalho: o aviso dizia
     * "Já feito com os mesmos insumos… Refazer mesmo assim" no clique que fazia a
     * busca pela primeira vez. Com a semente, o que já foi pago é reaproveitado;
     * o motivo só vale para pagar de novo o que custa.
     */
    const repeteOQueCusta = Boolean(anterior) && ((request.discover === true && anterior!.discovery?.requested === true && (anterior!.discovery.requests ?? 0) > 0) || (request.authorizeReading?.ai === true && anterior!.editorialAi?.status === "answered"));
    const leituraGratis = !(request.authorizeReading?.ai === true || request.authorizeReading?.measure === true || request.discover === true) || !repeteOQueCusta;
    const rework = assessRework({ kind: "article_improvement_prepare", fingerprint: run.inputsHash, previous: improvementReworkPrevious(anterior), policy: { sameInputs: "reuse", sameRefusal: "inform", freeRepeat: leituraGratis } });
    const decisao = decideRework(rework, request.reworkOverride);
    const refazer = decisao.proceed && decisao.overridden && Boolean(decisao.overrideReason);
    // F3 · LER ANTES DE BUSCAR: sem a autorização dita na prévia ("já temos · falta · custa"), nada de IA nem de Google Ads.
    const autorizado = { ai: request.authorizeReading?.ai === true, measure: request.authorizeReading?.measure === true };
    if (refazer) {
      run.reworkOverride = { reason: decisao.overrideReason!, at: run.createdAt };
      run.notices.push(`Refeito com os mesmos insumos da preparação de ${formatReworkWhen(anterior!.createdAt)} por pedido (“${decisao.overrideReason}”): ${autorizado.ai || autorizado.measure ? `${[autorizado.ai ? "a leitura da IA" : null, autorizado.measure ? "as medições que faltam" : null].filter(Boolean).join(" e ")} e a busca pedida foram feitas de novo` : "só a leitura grátis foi refeita; IA e medições só com a sua autorização"}.`);
    }
    /*
     * A preparação anterior com estes insumos parou ANTES da coleta paga: não há
     * o que refazer — a mesma rodada continua ("Coletar a SERP", com o custo
     * antes). O aviso diz isso, em vez de "Refazer mesmo assim".
     */
    const anteriorComoExecucao = anterior as unknown as ImprovementRun | null;
    const paradaAntesDoPago = anteriorComoExecucao?.state === "prepared" && !anteriorComoExecucao.acceptedIds && (anteriorComoExecucao.costs?.paidQueries ?? 0) > 0;
    if (rework.verdict !== "fresh") run.rework = { ...reworkView(rework)!, ...(paradaAntesDoPago && rework.verdict === "same_inputs_reuse" ? { message: `A preparação de ${formatReworkWhen(anterior!.createdAt)} com estes mesmos insumos parou antes da coleta paga da SERP (${anteriorComoExecucao!.costs.paidQueries} consulta(s) no DataForSEO). Não há nada a refazer: continue nesta rodada; o custo aparece antes de autorizar.` } : {}) };
    const seed = refazer ? null : improvementReuseSeed(anterior, { version: run.version, brandId: run.brandId, inputsHash: run.inputsHash, now: new Date() });
    run.reusedFromRunId = seed?.fromRunId ?? null;
    run.notices.push(...input.waitingDeclaredPrincipal);
    if (seed) {
      run.keywords = seed.keywords;
      if (seed.editorialAi) run.editorialAi = seed.editorialAi;
      run.notices.push(seed.notice);
    }
    /*
     * F3 · LER ANTES DE BUSCAR (SDD 2026-10-13, item 3; D4). O que já está
     * medido (qualquer idade) e o "sem média" de menos de 30 dias não vão ao
     * Google Ads; o resto só é medido com a autorização dita na prévia
     * ("já temos · falta · custa"). Antes, o botão "Buscar keywords (grátis)"
     * media e chamava a IA sem dizer.
     */
    const medidas = autorizado.measure ? await measureOldVolumes(runtime, run) : { asked: 0, calls: 0 };
    const { evidence, ranking, vocabulary } = await evidenceOf(context, run.targets, run.keywords);
    // 1 · pares da SERP (cache) e a linha de copy com a SERP da principal em cache (§15, grátis).
    run.proposals = planArticleImprovements({ targets: run.targets, keywords: run.keywords, evidence, ranking, listReading: false, serpVocabulary: vocabulary });
    // 2 · leitura da IA na lista existente, só para quem ficou sem proposta pronta — e só com a autorização.
    const iaAntes = run.editorialAi;
    if (autorizado.ai) await readEditorialAi(runtime, run, ranking);
    const iaChamadaAgora = !iaAntes && Boolean(run.editorialAi) && run.editorialAi!.status !== "skipped" && run.editorialAi!.status !== "off";
    // A semente dizia "sem chamada nova": com o que faltava chamado agora, o aviso diz a verdade.
    if (seed && (iaChamadaAgora || medidas.asked)) {
      run.notices = run.notices.filter(notice => notice !== seed.notice);
      run.notices.push(`Mesmos alvos e mesma lista da preparação anterior: reaproveitei o que ela já tinha lido; só o que faltava foi chamado agora, com a sua autorização (veja “Já temos · Falta · Custa”).${iaChamadaAgora && !seed.editorialAi && iaAntes === undefined && /tinha falhado/.test(seed.notice) ? " A leitura da IA tinha falhado e foi tentada de novo." : ""}`);
    }
    // 2b · leitura da lista pelo código (núcleo do slug) para quem a IA não resolveu.
    run.proposals = planArticleImprovements({ targets: run.targets, keywords: run.keywords, evidence, ranking, editorialPicks: run.editorialAi?.picks, serpVocabulary: vocabulary });
    // 3 · busca nova no Google Ads só para quem ainda ficou sem nada — e só
    // quando o dono pede (`discover: true`, com o custo dito antes do clique).
    // Nunca automática (2026-10-12). O tempo que a IA usou sai do orçamento da
    // busca: o prepare inteiro fica abaixo de 120 s.
    /*
     * 2026-10-18 · SUBSTITUÍDO (§0.5): "Assunto com lista da Pesquisa por Assunto do Minerador não busca" (F5 de 12/10).
     * A regra vigente é a de 16/10 (§15 passo 4; AGENTS.md §0.2): o reforço é de TODOS os artigos — lê a lista da marca
     * (a da Pesquisa por Assunto incluída: ela já está nas keywords desta leitura) e SÓ ENTÃO busca novas, pelas sementes
     * do plano e do DNA. No amarelo, as keywords que a própria confirmação incorporou levam o Assunto na lista
     * (`subject_discovery`) e tiravam da busca justamente os artigos já formados ("4 Assunto(s) com lista… não entram").
     * A lista continua lida primeiro; nenhum Assunto fica fora da busca por ter lista.
     */
    /*
     * 2026-10-16 · §15 passo 4: o reforço é de TODOS os artigos do plano. O
     * Assunto com a principal fixa e com vaga (menos de 6 keywords) fica
     * "adequado", mas ainda pede reforço: entra na busca nova quando ela é pedida.
     */
    const pedeReforco = (t: ImprovementTarget) => {
      const proposta = run.proposals.find(p => p.targetId === t.id);
      // O artigo do Assunto que só forma com a principal (sem nenhuma secundária) também pede reforço.
      if (t.kind === "subject" && proposta && !proposta.memberIds.some(id => id !== proposta.principalId)) return true;
      return proposta?.status !== "ready" && (proposta?.status !== "adequate" || (t.kind === "subject" && t.memberIds.length < IMPROVEMENT_ARTICLE_MAX_KEYWORDS));
    };
    const gaps = run.targets.filter(t => pedeReforco(t));
    run.discovery = { requested: request.discover === true, gapTargetIds: gaps.map(t => t.id), requests: 0 };
    const discoverBudgetMs = Math.max(5000, Math.min(35000, PREPARE_SEARCH_DEADLINE_MS - (Date.now() - started)));
    // F5 — a busca já feita com estes mesmos insumos não é repetida (as keywords dela vêm na semente); só com "Refazer mesmo assim".
    const buscaJaFeita = !refazer && Boolean(seed) && anterior?.discovery?.requested === true && (anterior.discovery.requests ?? 0) > 0;
    if (gaps.length && request.discover === true && buscaJaFeita) run.notices.push(`A busca nova no Google Ads já foi feita com estes mesmos insumos em ${formatReworkWhen(anterior!.createdAt)}: as keywords dela foram reaproveitadas, sem chamada nova. Para buscar de novo, use “Refazer mesmo assim” com o motivo.`);
    else if (gaps.length && request.discover === true) try { run.keywords = await discover(runtime, run, gaps, run.keywords, run.notices, discoverBudgetMs, input.brand.knownVolumeByNormalized, vocabulary, input.brand.existingByNormalized); } catch (error) { run.notices.push(`Busca nova no Google Ads incompleta: ${error instanceof Error ? error.message : "provider indisponível"}. O acervo continua válido.`); }
    await refreshPlan(runtime, run, input.rows, started + (runtime.compositionDeadlineMs ?? COMPOSITION_DEADLINE_MS));
    await planSerpRefreshes(context, run, input);
    // Quem segue sem proposta depois da conferência é quem a busca nova poderia ajudar.
    // F4: quem já tem proposta à espera do Minerador não pede busca nova (a sugestão está lá).
    run.discovery.gapTargetIds = run.targets.filter(t => { const proposta = run.proposals.find(p => p.targetId === t.id); return !proposta?.needsMinerador && pedeReforco(t); }).map(t => t.id);
    /*
     * 2026-10-17 (noite) · SUBSTITUÍDO (dono: "cadê as keywords de reforço?"): a busca nova no Google Ads (grátis,
     * cota) é um passo do "Processar artigos" e do "Melhorar publicados…", que a pedem sozinhos. O "peça em 'Buscar
     * keywords novas no Google Ads'" de 12/10 saiu com o botão. Esta leitura só fica sem ela quando quem chamou não pediu.
     */
    if (!run.discovery.requested && run.discovery.gapTargetIds.length) run.notices.push(`${run.discovery.gapTargetIds.length} artigo(s) sem reforço só com a lista da marca: a busca nova no Google Ads (grátis, cota do Google Ads) ainda não rodou nesta leitura — “Processar artigos” e “Melhorar publicados…” a fazem sozinhos.`);
    // F3 · "JÁ TEMOS · FALTA · CUSTA": lido de graça, dito antes de qualquer pagamento.
    const lidoAgora = new Date();
    const completas = new Set(evidence.filter(item => item.complete).map(item => item.keywordId));
    const iaPendente = runtime.editorialAi && (!run.editorialAi || run.editorialAi.status === "failed") ? (() => {
      const alvosIa = improvementAiTargets(run.targets, run.proposals), listaIa = improvementAiList(run.keywords, run.proposals);
      return alvosIa.length && listaIa.length ? { targets: alvosIa.length, listSize: listaIa.length } : null;
    })() : null;
    const plano = buildKnownBeforeSearchPlan({
      keywords: keywordsTiedToTargets(run).map(k => ({ keywordId: k.id, keyword: k.keyword, volume: knownVolumeOfKeyword(k, input.rows.get(k.id), lidoAgora), serpComplete: completas.has(k.id), dnaIntent: Boolean(k.signals.intent) })),
      subjects: run.targets.filter(target => target.kind === "subject").length,
      lockedPrincipals: run.targets.filter(target => target.declaredPrincipalId).length,
      mineradorLists: input.subjectsWithMineradorList.size,
      reusedRunId: run.reusedFromRunId ?? null,
      aiReadingReused: !iaChamadaAgora && seed?.editorialAi?.status === "answered",
      aiReading: iaPendente,
      serp: { calls: run.costs.paidQueries, costUsd: run.costs.estimatedCostUsd },
      done: { aiCalls: iaChamadaAgora ? 1 : 0, measuredKeywords: medidas.asked, googleAdsCalls: medidas.calls },
    });
    const frases = knownBeforeSearchSentences(plano);
    /*
     * 2026-10-17 (noite) · "Falta: nada" era falso quando a busca de reforço ainda não tinha rodado (amarelo: os 8
     * artigos sem reforço e a tela dizia "Falta: nada"). Aqui a frase diz o que a próxima ação faz.
     */
    // A SERP que falta pagar já entra na frase de sempre (`plano.serp`); faltava dizer a busca de reforço não feita.
    const aindaFalta = !run.discovery.requested && run.discovery.gapTargetIds.length > 0 ? `a busca de reforço no Google Ads (grátis, cota) para ${run.discovery.gapTargetIds.length} artigo(s)` : "";
    if (aindaFalta) frases.missing = /^Falta: nada/.test(frases.missing) ? `Falta: ${aindaFalta}.` : `${frases.missing.replace(/\.$/, "")}; e ${aindaFalta}.`;
    run.reading = { ...plano, authorized: autorizado, sentences: frases };
    run.decisionHash = decisionHashOf(run);
    /*
     * F5 — MESMOS INSUMOS, MESMA EXECUÇÃO (as 9 da WifiConecta viram 1). Sem
     * chamada nova nesta preparação (IA e busca vieram da semente) e com a
     * mesma prévia (`decisionHash`), a execução anterior — ainda preparada, do
     * mesmo ator — é devolvida com o aviso, e nenhuma linha nova nasce.
     */
    const anteriorPreparada = anterior as unknown as ImprovementRun | null;
    if (!refazer && seed && !iaChamadaAgora && medidas.asked === 0 && run.discovery.requests === 0 && anteriorPreparada
      && anteriorPreparada.state === "prepared" && anteriorPreparada.actorId === run.actorId && previewSignatureOf(anteriorPreparada) === previewSignatureOf(run)) {
      return { ...anteriorPreparada, ...(run.rework ? { rework: run.rework } : {}) };
    }
    await recordImprovementSuggestions(context, run);
    await new WorkflowRepository(context).create({ subjectType: SUBJECT_TYPE, subjectId: run.runId, stage: "architect", state: "prepared", sourceEntityId: run.runId, payload: run as unknown as Record<string, unknown> });
    return (await findRun(context, run.runId)).run;
  }
  let current = await findRun(context, request.runId!);
  const run = current.run;
  if (request.action === "status") return run;
  if (request.decisionHash !== run.decisionHash) throw refusal("A prévia mudou. Leia a execução antes de confirmar.");
  if (run.state === "complete") return run;
  if (request.action === "collect") {
    if (run.acceptedIds) throw refusal("Não recolha uma nova composição depois do aceite editorial.");
    // Bounded steps: each request works about a minute, saves the progress and
    // returns "collecting"; the screen calls again. One request for everything
    // exceeded the 120 s function limit in production (11 of 12 paid, then killed).
    // One SERP group per request: a group with four lenses can take a minute by itself.
    // Several groups per request, starting a new one only in the first 30 s:
    // a group with four lenses can take ~40 s, so the request stays under 120 s.
    const started = Date.now(), START_WINDOW_MS = 30000;
    let groupsThisRequest = 0;
    let input: Awaited<ReturnType<typeof readInputs>>;
    if (run.state !== "collecting") {
      if (!request.authorizedCostUsd || request.authorizedCostUsd < run.costs.estimatedCostUsd.max || request.authorizedCostUsd + run.reservedCostUsd > 1) throw refusal("Autorize o plano vigente dentro do teto total de US$ 1 desta execução.");
      input = await readInputs(context, run.targets.map(t => t.id));
      for (const target of run.targets) if (sourceHash(input.targets.find(t => t.id === target.id)!, input.workspace, input.rows) !== run.sourceHashes[target.id]) throw refusal("A arquitetura mudou desde a prévia. Prepare novamente antes de autorizar custos.");
      run.state = "collecting"; run.reservedCostUsd += run.costs.estimatedCostUsd.max;
      run.collect = { doneGroupIds: [], remaining: run.costs.paidQueries, reservedRemaining: run.costs.estimatedCostUsd.max, phase: "collect" };
      current = await saveRun(context, current, run);
    } else {
      // Resume. A run interrupted before this version has no progress record:
      // it continues with zero paid budget, so only the cache is read.
      input = await readInputs(context, run.targets.map(t => t.id));
      run.collect ??= { doneGroupIds: [], remaining: 0, reservedRemaining: 0, phase: "collect" };
    }
    const progress = run.collect!;
    const rows = candidateRows(run.keywords, input.rows);
    if (progress.phase === "collect") {
      const groups = validationGroups(run, rows);
      progress.totalGroups = groups.length;
      for (const group of groups) {
        if (progress.doneGroupIds.includes(group.id)) continue;
        if (groupsThisRequest >= 1 && Date.now() - started > START_WINDOW_MS) return (await saveRun(context, current, run)).run;
        groupsThisRequest++;
        /*
         * 2026-10-19 · CASO REAL DO VERDE: o plano por grupo de um grupo que a guarda de retrabalho barra (a coleta paga
         * da MESMA consulta já deu inconclusiva, e o cache dela vale) devolvia 409 e DERRUBAVA a coleta inteira — 12 de
         * 84 consultas pagas, a execução presa em "collecting", nada na tela. Agora: o grupo que a prévia já sabia
         * barrado é pulado; a recusa (ou qualquer falha) de UM grupo vira aviso e a coleta segue com os outros.
         */
        if (run.costs.reworkRefused?.some(item => item.groupId === group.id)) { progress.doneGroupIds.push(group.id); current = await saveRun(context, current, run); continue; }
        let plan: CostPlan;
        try {
          const resposta = await serpOperation(context, group, "plan", 0, refazerSerpOptions(run));
          const barrado = (object(resposta.rework).articles as unknown[] | undefined ?? []).map(object).find(item => item.articleId === group.id);
          if (barrado) throw new Error(`REWORK_SAME_REFUSAL: ${String(barrado.message ?? "a coleta paga desta consulta já deu parecer inconclusivo")}`);
          plan = object(resposta.plan) as CostPlan;
        }
        catch (error) {
          const texto = error instanceof Error ? error.message : "falhou";
          run.notices.push(/REWORK_SAME_REFUSAL/.test(texto)
            ? `Coleta da SERP de “${group.keywords[0]?.keyword ?? group.id}” pulada: ${texto.replace(/^REWORK_SAME_REFUSAL:\s*/, "")} Nada foi pago por ela; a coleta seguiu com as outras.`
            : `Coleta da SERP de “${group.keywords[0]?.keyword ?? group.id}” não pôde ser planejada (${texto}); nada foi pago por ela; a coleta seguiu com as outras.`);
          progress.doneGroupIds.push(group.id);
          current = await saveRun(context, current, run);
          continue;
        }
        if (plan.paidQueries > 0 && (plan.estimatedCostUsd.max > progress.reservedRemaining || plan.paidQueries > progress.remaining)) {
          if (progress.remaining > 0) run.notices.push(`Plano mudou para ${group.keywords[0].keyword}: nova autorização será necessária; nada pago para esta consulta.`);
        } else {
          const amount = Math.min(plan.paidQueries, progress.remaining);
          progress.reservedRemaining -= plan.estimatedCostUsd.max;
          try { await serpOperation(context, group, "execute", amount, refazerSerpOptions(run)); progress.remaining -= amount; } catch (error) { run.notices.push(`Coleta/validação ${group.id}: ${error instanceof Error ? error.message : "falhou"}. Pagamentos não serão repetidos automaticamente.`); }
        }
        progress.doneGroupIds.push(group.id);
        current = await saveRun(context, current, run);
      }
      progress.phase = "refresh";
      current = await saveRun(context, current, run);
      if (groupsThisRequest > 0 && Date.now() - started > START_WINDOW_MS) return current.run;
    }
    await refreshPlan(runtime, run, input.rows, started + (runtime.compositionDeadlineMs ?? COMPOSITION_DEADLINE_MS));
    await planSerpRefreshes(context, run, input);
    run.state = "prepared"; delete run.collect; run.decisionHash = decisionHashOf(run);
    await recordImprovementSuggestions(context, run);
    return (await saveRun(context, current, run)).run;
  }
  // One human confirmation persists the accepted set. Subsequent requests only
  // continue this exact set and hash, one article per bounded server request.
  if (!run.acceptedIds) {
    const selected = request.targetIds ?? run.proposals.filter(p => p.status === "ready").map(p => p.targetId);
    const precisam = selected.filter(id => run.proposals.find(p => p.targetId === id)?.needsMinerador);
    if (precisam.length) throw refusal(`${precisam.length} linha(s) precisam do Minerador antes de gravar: dependem de keyword que JÁ existe lá (não enviada ao Arquiteto, medição a gravar ou sem a Lógica), e o Arquiteto não mexe nela — decida em “Sugestões do Arquiteto” no Minerador e prepare de novo. Nada foi gravado.`);
    if (selected.some(id => !run.proposals.some(p => p.targetId === id && p.status === "ready"))) throw refusal("Só propostas prontas podem ser aceitas; nenhuma keyword será forçada.");
    /*
     * 2026-10-16 · KEYWORD NOVA NA MESMA CONFIRMAÇÃO (decisão do dono; SDD da
     * linha única §15 passo 4). Com keyword nova (que não existe na marca) no
     * lote aceito: o aceite explícito e as permissões do Minerador (criar,
     * editar, aprovar) e do Arquiteto (criar, aprovar) são conferidos AQUI,
     * antes de qualquer escrita. Substitui a recusa da F4 ("o Arquiteto não
     * aprova keyword"), que valia de 14 a 16/10.
     */
    const comNovas = selected.filter(id => { const proposta = run.proposals.find(p => p.targetId === id); return proposta ? improvementNewKeywordIds(proposta, run.keywords).length > 0 : false; });
    if (comNovas.length) {
      if (request.approveNewKeywords !== true) throw refusal(IMPROVEMENT_NEW_KEYWORDS_APPROVAL_REQUIRED);
      await newKeywordPermissions(runtime);
    }
    const juntas = improvementMovePairRefusal(selected, run.proposals, id => run.targets.find(t => t.id === id)?.theme ?? id);
    if (juntas) throw refusal(juntas);
    run.acceptedIds = improvementMoveOrder(selected, run.proposals);
  } else if (request.targetIds && stableHash(request.targetIds) !== stableHash(run.acceptedIds)) throw refusal("A retomada não pode alterar os alvos aceitos.");
  if (run.leaseUntil && Date.parse(run.leaseUntil) > Date.now()) throw refusal("Execução em andamento. Consulte o progresso antes de retomar.");
  const pending = run.acceptedIds.find(id => !run.outcomes.some(o => o.targetId === id));
  if (!pending) { run.state = "complete"; return (await saveRun(context, current, run)).run; }
  run.state = "applying"; run.leaseUntil = new Date(Date.now() + 120000).toISOString(); current = await saveRun(context, current, run); // optimistic lock claims this turn
  const proposal = run.proposals.find(p => p.targetId === pending)!;
  try {
    const outcome = await applyTarget(runtime, run, proposal);
    run.outcomes = [...run.outcomes.filter(o => o.targetId !== pending), outcome];
  } catch (error) {
    run.outcomes = [...run.outcomes.filter(o => o.targetId !== pending), { targetId: pending, status: "failed", message: error instanceof Error ? error.message : "Falha recuperável." }];
    // A failed item is attempted once in this execution, allowing others to
    // progress. A fresh preparation reads partial writes before proposing retry.
    // Keep the original accepted set immutable, including failed outcomes.
  }
  run.leaseUntil = null;
  if (run.acceptedIds.every(id => run.outcomes.some(o => o.targetId === id))) run.state = "complete";
  return (await saveRun(context, current, run)).run;
}

function candidateRows(keywords: ImprovementKeyword[], existing: Map<string, Row>): Map<string, Row> {
  const rows = new Map(existing);
  for (const k of keywords) if (!rows.has(k.id)) {
    const logic = deriveLogicalKeywordBatchItem({ id: k.id, keyword: k.keyword, location: null, intent: null, analise_semantica: {} }, null, new Date().toISOString());
    rows.set(k.id, { id: k.id, keyword: k.keyword, intent: logic.update.intent as ArchitectKeyword["intent"], volume_search: k.volume, analise_semantica: logic.update.analise_semantica });
  }
  return rows;
}
/** 2026-10-19 · a keyword cuja SERP a coleta da linha paga (a MESMA régua de `validationGroups`): a principal ou, na D2a, a secundária de mais volume. */
function validationBaseOf(run: ImprovementRun, proposal: ImprovementProposal, rows: Map<string, Row>): string | null {
  const target = run.targets.find(t => t.id === proposal.targetId);
  if (!target || !proposal.principalId) return null;
  const volumeDe = (id: string) => rows.get(id)?.volume_search ?? 0;
  const principalDaProposta = run.keywords.find(k => k.id === proposal.principalId);
  const daPrincipal = serpCollectionAllowed({ volume: volumeDe(proposal.principalId), identityPrincipal: targetPrincipalIsIdentity(target, principalDaProposta) });
  return daPrincipal ? proposal.principalId : [...proposal.memberIds].filter(id => volumeDe(id) > 0).sort((a, b) => volumeDe(b) - volumeDe(a))[0] ?? null;
}
function validationGroups(run: ImprovementRun, rows: Map<string, Row>): ProvisionalArticleGroup[] {
  const groups: ProvisionalArticleGroup[] = [];
  // Potential candidates not yet in cache are validated individually. Candidate
  // proof may support an old zero-demand phrase without paying for it again.
  /*
   * 2026-10-16 · §15 (passos 3a, 3b e 4) — A SERP PAGA É SÓ A DA PRINCIPAL.
   * Antes, o "Validar no Google" pagava a SERP de cada keyword com volume da
   * composição e de até 5 candidatas por alvo escolhidas pelo TÍTULO do
   * Assunto (no amarelo de 16/10: 25 keywords × 4 lentes = 100 consultas,
   * até US$ 0,35, quase todas fora do assunto — "entra na conta do google",
   * "qual é o meu cep"). Agora o reforço sai da SERP da principal em cache
   * (grátis) e a coleta paga é a primeira da principal que ainda não tem SERP
   * (4 lentes, custo antes); principal sem volume: a de identidade é coletada
   * (2026-10-17, régua única), a de fora da identidade (D2a) usa a sustentação
   * de mais volume. Coletar a SERP de uma candidata para ter evidência a mais
   * continua possível pelo artigo ("Processar artigos"), nunca obrigatório.
   */
  const volumeDe = (id: string) => rows.get(id)?.volume_search ?? 0;
  for (const target of run.targets) {
    if (!target.territoryRef) continue;
    const proposal = run.proposals.find(p => p.targetId === target.id)!;
    const validating = proposal.status === "ready" || proposal.needsValidation === true;
    if (validating && proposal.principalId && proposal.memberIds.length) {
      /*
       * 2026-10-17 · A RÉGUA ÚNICA (`serpCollectionAllowed`): a primeira coleta
       * é a da principal — com volume ou, sem volume, quando é a principal de
       * identidade do artigo (a SERP da frase do artigo). A secundária de mais
       * volume só é a base quando a principal sem volume NÃO é a identidade
       * (D2a); com a identidade coletada, ela fica opcional (evita gasto duplo).
       */
      const principalDaProposta = run.keywords.find(k => k.id === proposal.principalId);
      // 2026-10-19 · o Assunto como foco: a página (o Assunto, volume 0) é a principal — a SERP dela na localidade da marca é a coleta (G6).
      const paginaComoFoco = target.kind === "published" && proposal.principalId === target.principalSubject?.keywordId;
      const daPrincipal = serpCollectionAllowed({ volume: volumeDe(proposal.principalId), identityPrincipal: paginaComoFoco || targetPrincipalIsIdentity(target, principalDaProposta) });
      const base = daPrincipal ? proposal.principalId : [...proposal.memberIds].filter(id => volumeDe(id) > 0).sort((a, b) => volumeDe(b) - volumeDe(a))[0];
      if (base) groups.push(makeGroup({ ...target, id: base, kind: "subject" }, { ...proposal, targetId: base, principalId: base, memberIds: [base] }, rows));
    }
    // Publicado Livre SEM volume: a candidata vira a principal, e a SERP dela decide a troca (a página não tem SERP para comparar).
    const principalDaPagina = target.primaryId ? run.keywords.find(k => k.id === target.primaryId) : undefined;
    // 2026-10-17 · Principal de identidade (o slug publicado foi feito dela): não há troca, então nenhuma SERP de candidata a principal é paga.
    if (target.kind === "published" && target.post === "free" && !principalDaPagina?.volumeValidated && !targetPrincipalIsIdentity(target, principalDaPagina)) {
      const ids = [...new Set([...(isListReading(proposal) ? proposal.addIds : []), ...run.keywords.filter(k => !k.published && k.volumeValidated && (!k.ownerId || k.ownerId === target.id) && (sharesTheme(target.theme, k.keyword) || improvementEditorialFit(target, k).fits)).sort((a, b) => Number(carriesSlugCore(target.slug, b)) - Number(carriesSlugCore(target.slug, a)) || b.volume! - a.volume!).slice(0, 5).map(k => k.id)])];
      for (const id of ids) groups.push(makeGroup({ ...target, id, kind: "subject" }, { ...proposal, targetId: id, principalId: id, memberIds: [id] }, rows));
    }
  }
  return [...new Map(groups.map(g => [g.id, g])).values()];
}
async function refreshPlan(runtime: ImprovementRuntime, run: ImprovementRun, existing: Map<string, Row>, deadlineAt = Number.POSITIVE_INFINITY) {
  const { evidence, ranking, vocabulary } = await evidenceOf(runtime.context, run.targets, run.keywords);
  // As escolhas da IA guardadas no prepare valem de novo aqui; a IA não é chamada outra vez.
  run.proposals = planArticleImprovements({ targets: run.targets, keywords: run.keywords, evidence, ranking, editorialPicks: run.editorialAi?.picks, serpVocabulary: vocabulary });
  // F4 · O ARQUITETO SÓ LÊ: a proposta que precisaria do Minerador (keyword nova, medição, Lógica) sai das prontas antes de qualquer SERP paga.
  markImprovementMineradorNeeds(run.proposals, run.keywords, id => { const row = existing.get(id); return row ? mineradorIntentSettled(row) : null; });
  const rows = candidateRows(run.keywords, existing), groups = validationGroups(run, rows);
  // All cached candidates were evaluated above before choosing paid candidates.
  let maximum = 0, minimum = 0, calls = 0, cacheUnavailable = false;
  const details: unknown[] = [];
  // One combined provider plan deduplicates the same keyword/lens across
  // candidate checks and final compositions (including a locked principal).
  /** 2026-10-19 · os grupos de coleta barrados pela guarda de retrabalho (G13), com a recusa. */
  const recusadosPelaGuarda = new Map<string, string>();
  if (groups.length) {
    const resposta = await serpOperation(runtime.context, groups, "plan", 0, refazerSerpOptions(run));
    const plan = object(resposta.plan) as CostPlan;
    const barrados = object(resposta.rework).articles;
    if (Array.isArray(barrados)) for (const raw of barrados) { const item = object(raw); if (typeof item.articleId === "string") recusadosPelaGuarda.set(item.articleId, String(item.message ?? "a coleta paga desta consulta já deu parecer inconclusivo")); }
    cacheUnavailable = plan.cacheUnavailable === true;
    if (plan.estimatedCostUsd.max + run.reservedCostUsd <= 1) {
      calls = plan.paidQueries; maximum = plan.estimatedCostUsd.max; minimum = plan.estimatedCostUsd.min; details.push(...(plan.missingDetails ?? []));
    } else run.notices.push("O plano completo ultrapassa o teto de US$ 1. Prepare um lote menor; as propostas já sustentadas pelo cache continuam aplicáveis.");
  }
  /** 2026-10-17 · as lentes que faltam por keyword (texto normalizado), para a frase de custo da principal de identidade. */
  const faltamPorKeyword = new Map<string, number>();
  for (const raw of details) { const chave = normalizeKeyword(String(object(raw).keyword ?? "")); if (chave) faltamPorKeyword.set(chave, (faltamPorKeyword.get(chave) ?? 0) + 1); }
  // A candidate's cache does not by itself prove the whole proposed article.
  // Check the final roles and composition before asking for editorial acceptance.
  // Os pares da SERP primeiro (regra anterior); as composições da IA depois. Uma
  // composição só começa dentro do prazo; a que sobra fica "precisa validar".
  const pending = run.proposals.filter(p => p.status === "ready").sort((a, b) => Number(isListReading(a)) - Number(isListReading(b)));
  const executed: { proposal: ImprovementProposal; group: ProvisionalArticleGroup }[] = [];
  const unreadable = (proposal: ImprovementProposal) => {
    proposal.status = "insufficient_evidence"; proposal.reasons.push("Não foi possível validar a composição pelo cache. Consulte ou complete a evidência antes do aceite.");
    if (isListReading(proposal) || isCopyLineReading(proposal)) proposal.needsValidation = true;
  };
  for (const proposal of pending) {
    if (Date.now() > deadlineAt) {
      proposal.status = "insufficient_evidence"; proposal.needsValidation = true;
      proposal.reasons.push("Faltou tempo nesta etapa para ler o parecer da SERP desta composição (nada foi pago nem gravado): valide no passo 2 ou toque em “Buscar de novo”.");
      continue;
    }
    const target = run.targets.find(t => t.id === proposal.targetId)!;
    const group = makeGroup(target, proposal, rows);
    try { await serpOperation(runtime.context, group, "execute", 0); executed.push({ proposal, group }); }
    catch { unreadable(proposal); }
  }
  // Uma leitura dos pareceres para todas as composições conferidas (antes: uma por composição).
  type Checked = { proposal: ImprovementProposal; group: ProvisionalArticleGroup };
  /** D2(a): principais declaradas cujo parecer veio das sustentações — a coleta paga delas é opcional. */
  const principaisPeloApoio = new Set<string>();
  const judge = async (batch: Checked[], allowShrink: boolean): Promise<ImprovementProposal[]> => {
    if (!batch.length) return [];
    let assessments: Awaited<ReturnType<typeof listArticleFormationSerpAssessments>> = [];
    try { assessments = await listArticleFormationSerpAssessments(runtime.context); }
    catch { for (const { proposal } of batch) unreadable(proposal); return []; }
    const shrunk: ImprovementProposal[] = [];
    for (const { proposal, group } of batch) {
      try {
        const assessment = assessments.find(a => a.candidateRef === group.id && a.payload.formationBaseHash === baseHash(group));
        const composition = assessment ? serpAssessmentComposition(assessment.payload.assessment, object(assessment.payload.interpretation).lenses) : null;
        const mismatch = serpCompositionMismatch(composition, { keywordIds: proposal.memberIds, principalKeywordId: proposal.principalId!, roles: Object.fromEntries(group.keywordIds.map(id => [id, id === group.principalSuggestion.keywordId ? "principal" as const : "secundaria" as const])) });
        // Sem lente no cache, a rota em modo só-cache deixa a composição sem parecer (nada pago).
        /*
         * 2026-10-17 (noite) · o artigo do plano ou do Assunto que ainda NÃO tem ArticleDNA (formar, não reforçar) e
         * só falta a SERP da principal fica "precisa coletar" (passo pago do Processar, custo antes), como a linha de
         * copy — antes ele caía em "a SERP da composição final está incompleta" e nunca entrava no plano de custo.
         */
        const alvoSemDna = proposal.kind === "subject" && (run.targets.find(t => t.id === proposal.targetId)?.memberIds.length ?? 0) === 0;
        if ((isListReading(proposal) || isCopyLineReading(proposal) || alvoSemDna) && (!assessment || composition?.lensesComplete !== true) && assessment?.payload.verdict !== "DIVERGENCE") {
          // Faltam lentes da composição escolhida na lista: a linha fica "precisa validar" (passo 2, pago, com prévia).
          proposal.status = "insufficient_evidence"; proposal.needsValidation = true;
          const principal = run.keywords.find(k => k.id === proposal.principalId)?.keyword ?? proposal.principalId;
          /*
           * 2026-10-17 · A RÉGUA ÚNICA DA COLETA (decisão do dono, "implementa a
           * sua recomendação"): a principal de identidade SEM volume tem a SERP
           * coletada na primeira coleta do artigo (4 lentes, ~US$ 0,014) — mostra
           * o que o Google exibe para a frase exata do artigo. A secundária de mais
           * volume NÃO é mais coletada por padrão (gasto duplo); continua opcional
           * para mais evidência. Ela só é a base quando a principal sem volume não
           * é a identidade (D2a). SUBSTITUI a frase da manhã de 17/10 ("a SERP dela
           * não é coletada; a primeira coleta é a da secundária de mais volume").
           */
          const volumeDaLinha = (id: string | null) => (id ? rows.get(id)?.volume_search ?? 0 : 0);
          const alvoDaProposta = run.targets.find(t => t.id === proposal.targetId);
          const semVolume = !(volumeDaLinha(proposal.principalId) > 0);
          const deIdentidade = semVolume && Boolean(alvoDaProposta) && targetPrincipalIsIdentity(alvoDaProposta!, run.keywords.find(k => k.id === proposal.principalId));
          const maisVolume = semVolume ? [...proposal.memberIds].filter(id => id !== proposal.principalId && volumeDaLinha(id) > 0).sort((a, b) => volumeDaLinha(b) - volumeDaLinha(a))[0] ?? null : null;
          const nomeDaBase = maisVolume ? run.keywords.find(k => k.id === maisVolume)?.keyword ?? maisVolume : null;
          const principalTexto = String(principal ?? "");
          const faltam = faltamPorKeyword.get(normalizeKeyword(principalTexto)) || 4;
          const linhaDaPrincipal = proposal.principalId ? rows.get(proposal.principalId) : undefined;
          const principalDaRun = run.keywords.find(k => k.id === proposal.principalId);
          // §15 passos 3a/3b: o reforço já está escolhido; o que falta é a primeira coleta da SERP da principal (4 lentes), paga e com o custo antes.
          proposal.reasons.push(isCopyLineReading(proposal) || alvoSemDna
            ? deIdentidade
              ? `${identityPrincipalSerpSentence(principalTexto, { queries: faltam, neverMeasured: principalDaRun ? knownVolumeOfKeyword(principalDaRun, linhaDaPrincipal, new Date()).state === "missing" : false })} É a primeira coleta do artigo no DataForSEO (paga; o custo aparece antes de autorizar) e o parecer passa a usar a SERP dela.${nomeDaBase ? ` A secundária de mais volume (“${nomeDaBase}”) não é coletada por padrão; colete pelo artigo se quiser mais evidência.` : ""} A principal fica; ${proposal.addIds.some(id => id !== proposal.principalId) ? "o reforço já está escolhido" : "sem reforço novo nesta leitura"}; nada foi pago nem gravado.`
              : nomeDaBase
                ? `A principal “${principal}” não tem volume e não é a identidade do artigo: a SERP dela não é coletada e o parecer do artigo vem das secundárias. Falta a SERP de “${nomeDaBase}”, a secundária de mais volume, no cache: a primeira coleta dela no DataForSEO (4 lentes) é paga, serve de base de evidência do artigo, e o custo aparece antes de autorizar. A principal fica; o reforço já está escolhido; nada foi pago nem gravado.`
                : `Falta a SERP da principal “${principal}” no cache: a primeira coleta dela no DataForSEO (4 lentes) é paga e o custo aparece antes de autorizar. O reforço já está escolhido; nada foi pago nem gravado.`
            : "Precisa coletar a SERP no DataForSEO: faltam lentes da SERP para esta composição. Colete no passo 2 (pago, com prévia) antes de gravar.");
        } else if (!assessment || mismatch || composition?.lensesComplete !== true || assessment.payload.verdict === "DIVERGENCE") {
          /*
           * O Google separou parte da composição (dono, 2026-09-30: "campanhas
           * de marketing" não divide páginas com "melhores/três campanhas…").
           * Uma nova tentativa, só pelo cache e sem custo, com a principal e as
           * keywords que dividem páginas com ela em 2+ lentes.
           */
          // A âncora é a principal quando ela tem volume (e SERP); sem isso — a página publicada sem
          // volume nunca é coletada — é a entrada de maior volume ("como captar um cliente", 390).
          const volumeOf = (id: string | null) => run.keywords.find(k => k.id === id && k.volumeValidated)?.volume ?? 0;
          const anchor = proposal.principalId && volumeOf(proposal.principalId) > 0 ? proposal.principalId
            : [...proposal.addIds].sort((a, b) => volumeOf(b) - volumeOf(a))[0] ?? null;
          const kept = allowShrink && assessment && !mismatch && composition?.lensesComplete === true && assessment.payload.verdict === "DIVERGENCE" && anchor
            ? serpSupportedMembers(object(assessment.payload.interpretation).lenses, anchor, proposal.addIds) : null;
          const dropped = kept ? proposal.addIds.filter(id => !kept.includes(id) && id !== proposal.principalId) : [];
          if (kept && dropped.length && (kept.length > 0 || proposal.principalId !== proposal.currentPrimaryId)) {
            const nomes = dropped.map(id => `“${run.keywords.find(k => k.id === id)?.keyword ?? id}”`).join(", ");
            proposal.addIds = kept;
            proposal.memberIds = proposal.memberIds.filter(id => !dropped.includes(id));
            proposal.transfers = proposal.transfers.filter(id => !dropped.includes(id));
            if (proposal.aiReasons) proposal.aiReasons = proposal.aiReasons.filter(item => !dropped.includes(item.keywordId));
            proposal.reasons.push(`O Google separou ${nomes} da principal (poucas páginas em comum): ficam de fora. A composição menor foi conferida de novo pelo cache, sem custo.`);
            shrunk.push(proposal);
            continue;
          }
          proposal.status = "insufficient_evidence";
          /*
           * 2026-10-19 · FALTA DE LENTE É "PRECISA COLETAR" (caso real do verde, 19/10): a proposta do publicado que
           * a página-Assunto deixou pronta (`editorial_and_candidate_serp`) e cuja principal ainda não tem as 4 lentes
           * caía aqui como "sem parecer da SERP" SEM `needsValidation` — o plano de custo contava a principal (124
           * consultas), mas a coleta (`validationGroups`) a pulava; só as 64 das candidatas foram pagas e a prévia
           * seguinte pedia as outras 64. Sem parecer ou com lente faltando (nunca a divergência), a linha pede a
           * coleta da principal, como a linha de copy.
           */
          const faltaLente = !kept && assessment?.payload.verdict !== "DIVERGENCE" && (!assessment || composition?.lensesComplete !== true);
          /*
           * 2026-10-19 · a coleta que falta foi barrada pela guarda de retrabalho (G13): o plano não a conta, então a
           * linha NÃO pede a coleta (nunca "Falta a SERP" sem o custo no plano) e diz a recusa e a saída.
           */
          const baseDaColeta = faltaLente ? validationBaseOf(run, proposal, rows) : null;
          const recusaDaGuarda = baseDaColeta ? recusadosPelaGuarda.get(baseDaColeta) ?? null : null;
          if (faltaLente && !recusaDaGuarda) proposal.needsValidation = true;
          /*
           * O Google separou TODAS as entradas da página (caso real, 2026-09-30:
           * "como captar clientes para clínica de estética" × "como captar
           * clientes / um cliente / novos clientes", baixa ou nenhuma nas 4
           * lentes). Não é falta de evidência: é outro assunto. A tela diz isso
           * e aponta as Sobras, em vez de "incompleta ou diverge".
           */
          const separadas = kept && kept.every(id => id === anchor) && anchor === proposal.principalId && proposal.principalId === proposal.currentPrimaryId ? dropped : [];
          if (separadas.length) {
            const nomes = separadas.map(id => `“${run.keywords.find(k => k.id === id)?.keyword ?? id}”`).join(", ");
            proposal.reasons.push(`O Google trata ${nomes} como outro assunto: quase nenhuma página em comum com esta nas 4 lentes. Elas não reforçam esta página; formam um artigo novo (veja Sobras). A página fica como está.`);
          } else if (faltaLente && recusaDaGuarda) {
            const nomeDaBase = run.keywords.find(k => k.id === baseDaColeta)?.keyword ?? baseDaColeta;
            proposal.reasons.push(`A coleta paga da SERP de “${nomeDaBase}” já foi feita e deu parecer inconclusivo (${recusaDaGuarda.replace(/^REWORK_SAME_REFUSAL:\s*/, "")}): ela não é paga de novo e não entra no custo desta prévia. Saída: mude a composição do artigo ou decida “Manter” com motivo. Nada foi pago nem gravado.`);
          } else if (faltaLente) {
            const principal = run.keywords.find(k => k.id === proposal.principalId)?.keyword ?? proposal.principalId;
            proposal.reasons.push(`Falta a SERP da principal “${principal}” no cache (4 lentes): a primeira coleta dela no DataForSEO é paga e o custo aparece antes de autorizar. Nada foi pago nem gravado.`);
          } else proposal.reasons.push(mismatch ?? "A SERP da composição final está incompleta ou diverge; complete a evidência antes do aceite.");
          // "A IA sugeriu, o Google discordou": a linha guarda a origem e o motivo.
          if (proposal.evidenceBasis === "editorial_ai") proposal.reasons.push("A IA sugeriu esta composição, mas a SERP dela não confirmou: nada entra.");
          if (proposal.evidenceBasis === "list_core") proposal.reasons.push("A lista sugeriu esta composição, mas a SERP dela não confirmou: nada entra.");
        } else if (assessment.payload.verdict === "INCONCLUSIVE") proposal.reasons.push("SERP da composição inconclusiva nas quatro lentes: o aceite humano confirma este fundamento editorial, sem tratar a inconclusão como prova de compatibilidade.");
        // D2(a): o parecer veio das sustentações, sem custo; a coleta da própria principal declarada fica opcional (D2(b)).
        const apoio = (assessment?.payload.assessment as { supportBasis?: SerpFormationAssessment["supportBasis"] } | undefined)?.supportBasis;
        if (proposal.status === "ready" && apoio && apoio.principalKeywordId === proposal.principalId) {
          // 2026-10-17 · a principal de identidade: a coleta dela tem propósito e custo ditos (régua única); o parecer de agora já veio das secundárias, sem custo.
          const doAlvo = run.targets.find(t => t.id === proposal.targetId);
          const principalTexto = run.keywords.find(k => k.id === proposal.principalId)?.keyword ?? "";
          proposal.reasons.push(doAlvo && principalTexto && targetPrincipalIsIdentity(doAlvo, { keyword: principalTexto })
            ? `${apoio.reason} ${identityPrincipalSerpSentence(principalTexto, { queries: faltamPorKeyword.get(normalizeKeyword(principalTexto)) || 4 })} Ela fica em “Coletar a SERP no DataForSEO”, opcional agora (D2b): o parecer já veio das secundárias, sem custo.`
            : `${apoio.reason} “Coletar a SERP no DataForSEO” é opcional (D2b): só coletaria a SERP da própria principal (sem volume).`);
          principaisPeloApoio.add(apoio.principalKeywordId);
        }
      } catch { unreadable(proposal); }
    }
    return shrunk;
  };
  const shrunk = await judge(executed, true);
  const again: Checked[] = [];
  for (const proposal of shrunk) {
    if (Date.now() > deadlineAt) {
      proposal.status = "insufficient_evidence"; proposal.needsValidation = true;
      proposal.reasons.push("Faltou tempo nesta etapa para ler o parecer da composição menor (nada foi pago nem gravado): toque em “Buscar de novo”.");
      continue;
    }
    const group = makeGroup(run.targets.find(t => t.id === proposal.targetId)!, proposal, rows);
    try { await serpOperation(runtime.context, group, "execute", 0); again.push({ proposal, group }); }
    catch { unreadable(proposal); }
  }
  await judge(again, false);
  /*
   * A LEITURA DA IA OU DA LISTA CAIU NA SERP: TENTA A TROCA INTERNA (2026-10-01).
   *
   * A IA propunha keyword nova de fora, a SERP não confirmava e a linha ficava
   * "evidência insuficiente" — a principal sem volume ficava. A troca pela
   * keyword que já está no artigo (volumelessPrincipalSwap) é conferida aqui
   * pelo mesmo cache, sem custo, e entra no lugar quando a SERP confirma.
   */
  const reservas: Checked[] = [];
  const byIdTroca = new Map(run.keywords.map(k => [k.id, k]));
  run.proposals = run.proposals.map(proposal => {
    if (proposal.status === "ready" || !isListReading(proposal) || Date.now() > deadlineAt) return proposal;
    const target = run.targets.find(t => t.id === proposal.targetId);
    const troca = target ? volumelessPrincipalSwap(target, byIdTroca) : null;
    if (!troca) return proposal;
    troca.reasons.push(`A leitura da ${proposal.evidenceBasis === "list_core" ? "lista" : "IA"} propôs keyword nova, mas a SERP dela não confirmou; a troca usa a keyword que já está no artigo.`);
    return troca;
  });
  for (const proposal of run.proposals.filter(p => p.status === "ready" && p.reasons.some(r => /a troca usa a keyword que já está no artigo/.test(r)))) {
    const group = makeGroup(run.targets.find(t => t.id === proposal.targetId)!, proposal, rows);
    try { await serpOperation(runtime.context, group, "execute", 0); reservas.push({ proposal, group }); }
    catch { unreadable(proposal); }
  }
  await judge(reservas, false);
  // D2(a) é o padrão: as consultas que só serviriam à SERP da principal declarada já coberta pelas sustentações são opcionais (D2(b)).
  const textosOpcionais = new Set([...principaisPeloApoio].map(id => run.keywords.find(k => k.id === id)?.keyword).filter((value): value is string => Boolean(value)));
  const opcionais = textosOpcionais.size ? details.filter(raw => textosOpcionais.has(String(object(raw).keyword ?? ""))).length : 0;
  run.costs = { paidQueries: calls, estimatedCostUsd: { min: Number(minimum.toFixed(6)), max: Number(maximum.toFixed(6)) }, missingDetails: details, ...(cacheUnavailable ? { cacheUnavailable: true } : {}), ...(opcionais ? { optionalPaidQueries: Math.min(opcionais, calls) } : {}),
    ...(recusadosPelaGuarda.size ? { reworkRefused: [...recusadosPelaGuarda].map(([groupId, message]) => ({ groupId, keyword: run.keywords.find(k => k.id === groupId)?.keyword ?? groupId, message })) } : {}) };
}

/*
 * ATUALIZAR O DNA COM A SERP (pedido do dono, 2026-10-01).
 *
 * Publicado já aprovado, com o parecer da SERP da própria composição completo
 * nas 4 lentes, mas com o DNA sem classificação ou com intenção/funil
 * diferentes do que a SERP decidiu (caso real: "tráfego pago vs orgânico",
 * intenção "unknown" e a SERP dizendo informacional). A melhoria dizia "nada a
 * melhorar" e não havia botão que regravasse. Agora a linha aparece pronta, a
 * composição não muda, e a gravação é uma versão nova aprovada do DNA com a
 * decisão da SERP — o mesmo cálculo da tela (buildClassificationEvidence) e a
 * mesma escrita no DNA (applySerpDecisionToArticle).
 */
type SerpRefreshCheck = { article: Workspace["articleDnas"][number]; recordVersionId: string; candidateRef: string; formationBaseHash: string; payload: ArticleDNA; intent: string; funnel: string; detail: string };
function latestArticleOf(target: ImprovementTarget, workspace: Workspace) {
  return workspace.articleDnas
    .filter(a => a.entityId === target.id || a.payload.articleId === target.id || a.payload.subject?.keywordId === target.id || a.payload.publishedIdentityRef?.sourceKeywordDnaIds?.includes(target.id))
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
}
function serpRefreshCheck(target: ImprovementTarget, workspace: Workspace, rows: Map<string, Row>, records: readonly ApprovedSerpRecord[]): SerpRefreshCheck | null {
  const article = latestArticleOf(target, workspace);
  const ref = article?.payload.serpAssessmentRef?.versionId;
  if (!article || !ref) return null;
  const gate = resolveApprovedArticleSerpGate({ articleId: article.payload.articleId, dna: article.payload, records });
  if (!gate || gate.blocksConclusion) return null;
  const record = records.find(r => `${r.payload.assessment.id}:${r.payload.formationBaseHash}` === ref)!;
  const principalId = article.payload.principalKeywordId;
  const ids = article.payload.keywordReferences.map(reference => String(reference.keywordId));
  const principalRow = rows.get(principalId);
  if (!principalRow) return null;
  const semanticaDe = (keywordId: string) => {
    const row = rows.get(keywordId);
    const semantic = object(row?.analise_semantica);
    const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
    return { intent: row ? signals(row).intent : null, funnel: texto(semantic.funil) || texto(semantic.funnel) };
  };
  const kgr = readArticleKgrDecision({
    kgrIdentity: article.payload.kgrIdentity,
    principal: principalRow as unknown as ArchitectKeyword,
    principalKeywordId: principalId,
    supports: ids.filter(id => id !== principalId).map(id => rows.get(id)).filter(Boolean) as unknown as ArchitectKeyword[],
  });
  const evidencia = buildClassificationEvidence({
    principal: semanticaDe(principalId),
    secondaries: ids.filter(id => id !== principalId).map(semanticaDe),
    keywordCount: ids.length,
    serpInterpretation: (record.payload.interpretation ?? null) as { observedIntent: string; observedFunnel?: string | null; intentShares?: { informacional: number; comercial: number; transacional: number; lenses: number; results: number } | null } | null,
    serpResolved: true,
    kgr,
    principalIsSubject: target.kind === "subject" || readArchitectSubjectStanding(principalRow).declared,
    isPublished: Boolean(article.payload.publishedIdentityRef),
    principalProtected: principalRow.primaryKeywordPolicy === "locked",
  });
  if (unresolvedClassifications(evidencia).length) return null;
  const classificacao = resolveArticleClassification(evidencia);
  const payload = ArticleDNASchema.parse(applySerpDecisionToArticle({ ...article.payload, classification: classificacao }, classificacao));
  const muda = !article.payload.classification
    || stableHash(article.payload.classification) !== stableHash(classificacao)
    || payload.mainIntent !== article.payload.mainIntent
    || payload.journeyStage !== article.payload.journeyStage;
  if (!muda) return null;
  const intent = ARTICLE_INTENT_LABELS[classificacao.intent.value] ?? classificacao.intent.value;
  const funnel = ARTICLE_FUNNEL_LABELS[classificacao.funnel.value] ?? classificacao.funnel.value;
  const antes = !article.payload.classification
    ? `O DNA estava sem classificação e com intenção “${article.payload.mainIntent}”.`
    : `O DNA dizia intenção “${article.payload.mainIntent}” e funil “${article.payload.journeyStage}”.`;
  return { article, recordVersionId: ref, candidateRef: record.candidateRef, formationBaseHash: record.payload.formationBaseHash, payload, intent, funnel, detail: `${antes} ${classificacao.intent.reason}` };
}
async function planSerpRefreshes(context: PipelineContext, run: ImprovementRun, input: Awaited<ReturnType<typeof readInputs>>) {
  let records: ApprovedSerpRecord[];
  try { records = (await listArticleFormationSerpAssessments(context)) as unknown as ApprovedSerpRecord[]; } catch { return; }
  let quantos = 0;
  run.proposals = run.proposals.map(proposal => {
    if (proposal.status === "ready") return proposal;
    const target = run.targets.find(t => t.id === proposal.targetId);
    const check = target ? serpRefreshCheck(target, input.workspace, input.rows, records) : null;
    if (!check) return proposal;
    quantos++;
    const ids = check.article.payload.keywordReferences.map(reference => String(reference.keywordId));
    return {
      targetId: proposal.targetId, kind: proposal.kind, theme: proposal.theme,
      currentPrimaryId: check.article.payload.principalKeywordId, principalId: check.article.payload.principalKeywordId, memberIds: ids,
      addIds: [], removeIds: [], transfers: [], angle: "", exclusions: [],
      reasons: [`Atualizar o DNA com a SERP: intenção ${check.intent}, funil ${check.funnel}. ${check.detail}`],
      status: "ready", evidenceBasis: "serp",
      serpRefresh: { recordVersionId: check.recordVersionId, intent: check.intent, funnel: check.funnel, detail: check.detail },
    };
  });
  if (quantos) run.notices.push(`${quantos} DNA(s) aprovado(s) podem ser atualizados com a SERP vigente (intenção e funil decididos pelas 4 lentes), sem mudar a composição.`);
}
async function applySerpRefresh(runtime: ImprovementRuntime, run: ImprovementRun, proposal: ImprovementProposal, target: ImprovementTarget, input: Awaited<ReturnType<typeof readInputs>>): Promise<Outcome> {
  const context = runtime.context;
  // Resposta perdida depois de gravar: a versão desta execução já existe.
  const committed = input.workspace.articleDnas.find(a => a.changeReason.includes(`[run:${run.runId}]`) && a.entityId === latestArticleOf(target, input.workspace)?.entityId);
  if (committed) return { targetId: target.id, status: "improved", message: "Atualização desta execução recuperada e relida; nenhuma versão duplicada.", versionId: committed.versionId };
  if (sourceHash(target, input.workspace, input.rows) !== run.sourceHashes[target.id]) throw refusal("O artigo, suas keywords ou o Silo mudaram desde a prévia. Prepare novamente.");
  const records = (await listArticleFormationSerpAssessments(context)) as unknown as ApprovedSerpRecord[];
  const check = serpRefreshCheck(target, input.workspace, input.rows, records);
  if (!check || check.recordVersionId !== proposal.serpRefresh!.recordVersionId) throw refusal("A SERP ou o DNA mudaram desde a prévia. Prepare novamente.");
  const now = new Date().toISOString();
  const version = await createVersionEnvelope({
    entityId: check.article.entityId,
    versionNumber: check.article.versionNumber + 1,
    previousVersionId: check.article.versionId,
    origin: "human",
    changeReason: `Atualizar o DNA com a SERP: intenção ${check.intent} e funil ${check.funnel} decididos pela SERP vigente (4 lentes); composição, URL, slug e canonical preservados. [run:${run.runId}]`,
    createdBy: context.actorUserId,
    payload: check.payload,
  });
  const issues = articleApprovalRevalidationIssues({ version, authorizedBrandId: context.brandId });
  if (issues.length) throw refusal(`A aprovação não passou na revalidação: ${issues.map(i => i.detail).join(" ")}`);
  const written = await appendArquitetoArtifact(await runtime.authorize("arquiteto", "approve"), "article_dna", version, "approved");
  // A formação entra no marcador como concluída, se ainda não estiver.
  const marker = await readArticleFormationMarker(context);
  const articleId = check.payload.articleId;
  if (!(marker?.payload.concludedFormations ?? []).some(f => f.materializedArticleId === articleId)) {
    const principalId = check.payload.principalKeywordId;
    const candidateRef = text(input.rows.get(principalId)?.articleFormationRef) ?? check.candidateRef;
    const members = check.payload.keywordReferences.map(reference => ({ keywordId: String(reference.keywordId), role: reference.keywordId === principalId ? "principal" as const : reference.role === "reforco_narrativo" ? "reforco" as const : "secundaria" as const }));
    const concluded = { candidateRef, territoryRef: check.payload.territoryRef ?? target.territoryRef!, principalKeywordId: principalId, members, formationBaseHash: check.formationBaseHash, slug: check.payload.suggestedSlug ?? null, fullPath: target.url ?? null, concludedAt: now, concludedBy: context.actorUserId, materializedArticleId: articleId };
    const formations = [...(marker?.payload.concludedFormations ?? []).filter(f => f.candidateRef !== candidateRef), concluded];
    await saveArticleFormationMarker(context, { contractVersion: "article-formation-marker-v1", baseHash: marker?.payload.baseHash ?? check.formationBaseHash, processedAt: now, confirmation: { status: "partial", confirmedAt: now, confirmedArticleCount: formations.length, coveredKeywordCount: new Set(formations.flatMap(f => f.members.map(m => m.keywordId))).size, pendingSiloCount: marker?.payload.confirmation.pendingSiloCount ?? 0, failedCount: marker?.payload.confirmation.failedCount ?? 0 }, concludedFormations: formations });
  }
  const readback = await loadCanonicalArquitetoWorkspace(context);
  const dna = readback.articleDnas.find(a => a.versionId === written.version.versionId);
  if (!dna || dna.contentHash !== written.version.contentHash) throw refusal("A releitura do DNA atualizado não confirmou a gravação.");
  return { targetId: target.id, status: "improved", message: `DNA atualizado com a SERP e relido: intenção ${check.intent}, funil ${check.funnel}. Composição, URL, slug e canonical não mudaram.`, versionId: dna.versionId };
}

/** As permissões da confirmação com keyword nova: conferidas antes de qualquer escrita (sem elas, recusa com o motivo). */
async function newKeywordPermissions(runtime: ImprovementRuntime) {
  const pedidos: Array<[string, string]> = [["minerador", "create"], ["minerador", "edit"], ["minerador", "approve"], ["arquiteto", "create"], ["arquiteto", "approve"]];
  const contextos: Record<string, PipelineContext> = {};
  for (const [modulo, acao] of pedidos) {
    try { contextos[`${modulo}:${acao}`] = await runtime.authorize(modulo, acao); }
    catch (error) { throw refusal(`Para incorporar keyword nova nesta confirmação é preciso a permissão ${modulo}:${acao} (${error instanceof Error ? error.message : "sem permissão"}). Nada foi gravado.`); }
  }
  return contextos;
}
type NewKeywordIncorporation = { remap: Map<string, string>; leftOut: Array<{ id: string; keyword: string; reason: string }>; saved: string[]; created: number };
/**
 * 2026-10-16 · INCORPORAR A KEYWORD NOVA (decisão do dono: "PROCURA NOVOS,
 * DIFERENTES DAS QUE JÁ ESTÃO NA LISTA, PODE PROCESSAR ELES E INCORPORAR
 * ELES"). Os MESMOS núcleos das telas do Minerador, na ordem, cada um com
 * releitura: import da Pesquisa por Assunto (com a Lógica nas criadas) →
 * Volume (a medição guardada na prévia, sem consultar o Google Ads de novo;
 * sem ela, o "Medir volume" de sempre) → aprovação → envio ao Arquiteto.
 * Só as linhas que ESTE import criou são tocadas; a keyword que passou a
 * existir na marca depois da prévia recusa a linha antes de qualquer escrita.
 */
async function incorporateNewKeywords(runtime: ImprovementRuntime, run: ImprovementRun, target: ImprovementTarget, novasIds: readonly string[]): Promise<NewKeywordIncorporation> {
  const context = runtime.context;
  const permissoes = await newKeywordPermissions(runtime);
  const criar = permissoes["minerador:create"], editar = permissoes["minerador:edit"], aprovar = permissoes["minerador:approve"], enviar = permissoes["arquiteto:create"];
  const novas = novasIds.map(id => run.keywords.find(k => k.id === id)!).filter(Boolean);
  const nomes = (lista: readonly { keyword: string }[]) => lista.map(k => `“${k.keyword}”`).join(", ");
  const marca = await readDifferentiationBrandKeywords(context);
  const jaExistem = novas.filter(k => marca.existingByNormalized.has(normalizeKeyword(k.keyword)));
  if (jaExistem.length) throw refusal(`${nomes(jaExistem)} passou a existir no Minerador depois da prévia: o Arquiteto não mexe em keyword que já existe. Prepare de novo. Nada foi gravado.`);
  const saved: string[] = [];
  const parcial = (motivo: string) => refusal(`${motivo} Já gravado no Minerador nesta confirmação: ${saved.join("; ") || "nada"}. O artigo não foi gravado; prepare de novo para continuar.`);
  const importado = await importSubjectDiscoveryWithCore({
    brandId: context.brandId, actorUserId: criar.actorUserId, supabase: criar.supabase,
    request: { importRequestId: stableUuid(run.runId, target.id, "import"), searchId: run.runId, subjectKeywordId: target.kind === "subject" ? target.id : null, subjectPhrase: target.theme, items: novas.map(k => ({ keyword: k.keyword, origins: ["ads_keyword_seed"], evidence: [`Google Ads: ideia da busca pelas sementes do plano e do DNA, Volume medido para ${target.theme}`] })) },
    runLogic: async keywordIds => { const logica = await runKeywordLogicWithCore({ brandId: editar.brandId, keywordIds, db: editar.supabase }); return { applied: logica.applied, unchanged: logica.unchanged, failed: logica.failed }; },
  });
  if (!importado.ok) throw refusal(`O import das keywords novas no Minerador não foi feito: ${importado.reason}. Nada foi gravado.`);
  // Só as linhas que este import CRIOU (nunca uma que já existia).
  const criadas = new Map(importado.rows.filter(row => row.outcome === "created" && row.keywordId).map(row => [row.normalizedKeyword, row.keywordId!]));
  const remapTodas = new Map<string, string>();
  for (const k of novas) { const id = criadas.get(normalizeKeyword(k.keyword)); if (id) remapTodas.set(k.id, id); }
  if (remapTodas.size !== novas.length) throw parcial(`O import não confirmou como NOVAS todas as keywords (${nomes(novas.filter(k => !remapTodas.has(k.id)))}).`);
  saved.push(`${remapTodas.size} keyword(s) nova(s) importada(s) com a Lógica (${nomes(novas)})`);
  const idsNovos = [...remapTodas.values()];
  const guardadas = novas.map(k => k.measurement).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const medicao = await measureKeywordVolume(editar, idsNovos, guardadas.length === novas.length ? { measure: (req, params, ctx) => handleGoogleAdsKeywordMetrics(req, params, ctx, { replay: replayStoredMeasurements(guardadas) }) } : {});
  const medidas = new Map(medicao.outcomes.map(item => [item.keywordId, item]));
  saved.push("o Volume do Google Ads delas");
  const remap = new Map<string, string>(), leftOut: NewKeywordIncorporation["leftOut"] = [];
  for (const [antigo, novo] of remapTodas) {
    const medida = medidas.get(novo);
    if (medida && medida.outcome !== "failed" && (medida.volume ?? 0) > 0) remap.set(antigo, novo);
    else leftOut.push({ id: antigo, keyword: run.keywords.find(k => k.id === antigo)?.keyword ?? antigo, reason: medida?.outcome === "failed" ? `a medição não foi gravada (${medida.reason ?? "sem confirmação"})` : "o Google Ads não confirmou volume" });
  }
  if (remap.size) {
    const decisao = await readDecisionKeywords(context.brandId, [...remap.values()], aprovar.supabase);
    const entradas = keywordDecisionEntries(decisao.rows, "approve");
    const barrada = entradas.find(entry => entry.outcome === "blocked");
    if (decisao.missingCount || barrada) throw parcial(`A aprovação no Minerador não pôde ser feita${barrada ? ` (“${barrada.keyword}”: ${barrada.blockers[0]})` : ""}.`);
    const aplicadas = await applyKeywordDecisionEntries({ brandId: context.brandId, actorId: aprovar.actorUserId, action: "approve", rows: decisao.rows, entries: entradas, db: aprovar.supabase });
    if (aplicadas.some(item => item.outcome !== "applied" && item.outcome !== "unchanged")) throw parcial("A releitura não confirmou a aprovação no Minerador.");
    saved.push(`aprovação de ${remap.size} no Minerador`);
    try { await createMineradorArquitetoHandoff(enviar, [...remap.values()]); }
    catch (error) { throw parcial(`O envio ao Arquiteto falhou (${error instanceof Error ? error.message.slice(0, 160) : "erro"}).`); }
    saved.push(`envio de ${remap.size} ao Arquiteto`);
  }
  return { remap, leftOut, saved, created: remapTodas.size };
}

/*
 * 2026-10-19 · CANIBALIZAÇÃO ENTRE OS ARTIGOS DO GRUPO NO GRAVADOR (o mesmo de sempre). A keyword que muda de artigo na
 * prévia (`movedOut` na origem, `movedIn` no destino) só é gravada com as DUAS linhas aceitas juntas, a origem primeiro:
 * assim ela nunca fica em dois artigos nem some. Em ciclo (A dá a B e B dá a A), a ordem é a da prévia e o gravador
 * tolera a atribuição que a outra linha já gravou.
 */
export function improvementMovePairRefusal(selected: readonly string[], proposals: readonly ImprovementProposal[], themeOf: (id: string) => string): string | null {
  const aceitos = new Set(selected);
  for (const id of selected) {
    const p = proposals.find(item => item.targetId === id);
    for (const m of p?.movedIn ?? []) if (!aceitos.has(m.fromTargetId)) return `A linha “${themeOf(id)}” recebe uma keyword de “${themeOf(m.fromTargetId)}”: aceite as duas linhas juntas (ou nenhuma). Nada foi gravado.`;
    for (const m of p?.movedOut ?? []) if (!aceitos.has(m.toTargetId)) return `A linha “${themeOf(id)}” manda uma keyword para “${themeOf(m.toTargetId)}”: aceite as duas linhas juntas (ou nenhuma). Nada foi gravado.`;
  }
  return null;
}
export function improvementMoveOrder(selected: readonly string[], proposals: readonly ImprovementProposal[]): string[] {
  const ordem: string[] = [], visitando = new Set<string>(), feitos = new Set<string>();
  const visita = (id: string) => {
    if (feitos.has(id) || visitando.has(id)) return;
    visitando.add(id);
    for (const m of proposals.find(p => p.targetId === id)?.movedIn ?? []) if (selected.includes(m.fromTargetId)) visita(m.fromTargetId);
    visitando.delete(id); feitos.add(id); ordem.push(id);
  };
  for (const id of selected) visita(id);
  return ordem;
}
/** As linhas como estavam na prévia para as keywords que esta linha manda para outro artigo (o destino pode ter gravado antes). */
function rowsBeforeMoves(run: ImprovementRun, proposal: ImprovementProposal, rows: Map<string, Row>): Map<string, Row> {
  const saidas = (proposal.movedOut ?? []).map(m => m.keywordId);
  if (!saidas.length) return rows;
  const copia = new Map(rows);
  for (const id of saidas) {
    const row = rows.get(id), antes = run.beforeAssignments[id];
    if (!row || !antes) continue;
    copia.set(id, { ...row, territoryRef: (antes.territoryRef ?? null) as Row["territoryRef"], articleFormationRef: (antes.articleFormationRef ?? null) as Row["articleFormationRef"], articleFormationDecision: (antes.articleFormationDecision ?? null) as Row["articleFormationDecision"] });
  }
  return copia;
}
async function applyTarget(runtime: ImprovementRuntime, run: ImprovementRun, proposal: ImprovementProposal): Promise<Outcome> {
  const context = runtime.context, target = run.targets.find(t => t.id === proposal.targetId)!;
  let input = await readInputs(context, [target.id]);
  if (proposal.serpRefresh) return applySerpRefresh(runtime, run, proposal, target, input);
  // The last article may have committed before its journal response was lost.
  // Recover only when the DNA, marker and every assignment prove this run;
  // never create a second version merely to acknowledge the first one.
  const committed = input.workspace.articleDnas.find(a => a.changeReason.includes(`[run:${run.runId}]`) && (a.payload.articleId === target.id || a.payload.subject?.keywordId === target.id || a.payload.publishedIdentityRef?.sourceKeywordDnaIds?.includes(target.id)));
  if (committed) {
    const marker = await readArticleFormationMarker(context);
    const formation = marker?.payload.concludedFormations.find(f => f.materializedArticleId === committed.payload.articleId);
    const references = committed.payload.keywordReferences;
    if (formation && references.length === formation.members.length && references.every(reference => {
      const row = input.rows.get(reference.keywordId);
      return formation.members.some(m => m.keywordId === reference.keywordId && m.role === reference.role) && text(row?.articleFormationRef) === formation.candidateRef && object(row?.articleFormationDecision).role === reference.role;
    })) return { targetId: target.id, status: "improved", message: "Gravação desta execução recuperada e relida; nenhuma versão duplicada.", versionId: committed.versionId };
    throw refusal("Há gravação parcial desta execução. Prepare uma nova prévia para revisar a composição atual.");
  }
  if (sourceHash(target, input.workspace, input.rows) !== run.sourceHashes[target.id] && sourceHash(target, input.workspace, rowsBeforeMoves(run, proposal, input.rows)) !== run.sourceHashes[target.id]) throw refusal("O artigo, suas keywords ou o Silo mudaram desde a prévia. Prepare novamente.");
  // 2026-10-19 · a keyword que vem de outro artigo do recorte: a linha de origem não pode ter falhado nesta execução.
  for (const movida of proposal.movedIn ?? []) {
    const origem = run.outcomes.find(o => o.targetId === movida.fromTargetId);
    if (origem?.status === "failed") throw refusal(`“${run.keywords.find(k => k.id === movida.keywordId)?.keyword ?? movida.keywordId}” vinha de “${run.targets.find(t => t.id === movida.fromTargetId)?.theme ?? movida.fromTargetId}”, e essa linha não foi gravada: esta também não é (a keyword não fica em dois artigos). Prepare de novo.`);
  }
  /*
   * F4 · O ARQUITETO SÓ LÊ (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`,
   * item 2; D3). Antes, aqui a gravação media o volume, rodava a Lógica,
   * importava, media, aprovava e enviava keywords NO MINERADOR (seis escritas
   * num clique). Agora a melhoria só reorganiza o ArticleDNA com keywords que
   * já estão no Minerador e recebidas no Arquiteto, com o volume e a Lógica
   * gravados lá. O que falta — keyword nova, medição não gravada, keyword sem
   * intenção — recusa ESTA linha antes de qualquer escrita (inclusive da
   * execução de antes desta versão), e a sugestão está na caixa "Sugestões do
   * Arquiteto" do Minerador.
   */
  const precisaDoMinerador = improvementMineradorNeeds(proposal, run.keywords, id => {
    const row = input.rows.get(id);
    return row ? mineradorIntentSettled(row) : null;
  });
  if (precisaDoMinerador) throw refusal(improvementMineradorNeedsSentence(precisaDoMinerador, id => run.keywords.find(k => k.id === id)?.keyword ?? input.rows.get(id)?.keyword ?? id));
  let members = [...proposal.memberIds], principalId = proposal.principalId!;
  let transfers = [...proposal.transfers];
  // Só o que muda o artigo conta como "mudou": texto, volume, Silo, dono e publicação.
  // A página publicada e o Assunto declarado nunca entram na lista de keywords
  // (nem na prévia nem agora): antes, isso acusava "mudou" para sempre e o
  // artigo que também é Assunto nunca gravava.
  const materialOf = (k: ImprovementKeyword) => ({ keyword: normalizeKeyword(k.keyword), volume: k.volume, volumeValidated: k.volumeValidated, territoryRef: k.territoryRef, ownerId: k.ownerId, published: k.published });
  for (const id of members) {
    const accepted = run.keywords.find(k => k.id === id);
    if (accepted?.external) continue;
    const current = input.keywords.find(k => k.id === id);
    if (!accepted && !current) {
      if (!input.rows.has(id)) throw refusal("Uma keyword da prévia saiu do Arquiteto. Prepare novamente para revisar os dados atuais.");
      continue;
    }
    // Volume medido no preparo: o número gravado agora pode diferir por
    // arredondamento do provider; o que a prévia aceitou é "validado".
    const veioDe = (proposal.movedIn ?? []).find(m => m.keywordId === id)?.fromTargetId;
    const comparar = (k: ImprovementKeyword) => { const material = accepted?.volumePendingWrite ? { ...materialOf(k), volume: null } : materialOf(k); return veioDe && (k.ownerId === veioDe || k.ownerId === null || k.ownerId === target.id) ? { ...material, ownerId: "movida" } : material; };
    if (!accepted || !current || stableHash(comparar(current)) !== stableHash(comparar(accepted))) {
      const nome = (current ?? accepted)?.keyword ?? id;
      throw refusal(`A keyword "${nome}" mudou desde a prévia (volume, Silo ou artigo). Prepare novamente para revisar os dados atuais.`);
    }
  }
  /*
   * A keyword que JÁ existe no Minerador e não tem a Lógica, a medição gravada
   * ou o envio foi recusada acima: o Arquiteto não mexe nela.
   *
   * 2026-10-16 · A KEYWORD NOVA ENTRA NESTA MESMA CONFIRMAÇÃO (decisão do dono;
   * SDD da linha única §15 passo 4): import → Lógica → Volume → aprovação →
   * envio, pelos núcleos do Minerador, SÓ nas linhas que esta confirmação
   * criou. A que ficou sem volume confirmado sai do artigo e fica no
   * Minerador, dita. Depois, a composição e o ArticleDNA, como sempre.
   */
  const novas = improvementNewKeywordIds({ memberIds: members, principalId }, run.keywords);
  let incorporadas: NewKeywordIncorporation | null = null;
  if (novas.length) {
    incorporadas = await incorporateNewKeywords(runtime, run, target, novas);
    const semVolume = new Set(incorporadas.leftOut.map(item => item.id));
    if (semVolume.has(principalId)) throw refusal(`A nova principal “${run.keywords.find(k => k.id === principalId)?.keyword ?? principalId}” ficou sem volume confirmado no Google Ads: ela ficou no Minerador e a troca não foi gravada. Já gravado no Minerador nesta confirmação: ${incorporadas.saved.join("; ") || "nada"}. Prepare de novo.`);
    members = members.flatMap(id => semVolume.has(id) ? [] : [incorporadas!.remap.get(id) ?? id]);
    principalId = incorporadas.remap.get(principalId) ?? principalId;
    transfers = transfers.flatMap(id => semVolume.has(id) ? [] : [incorporadas!.remap.get(id) ?? id]);
    input = await readInputs(context, [target.id]);
    const naoChegaram = [...incorporadas.remap.values()].filter(id => !input.rows.has(id));
    if (naoChegaram.length) throw refusal(`As keywords novas não chegaram ao Arquiteto na releitura. Já gravado no Minerador nesta confirmação: ${incorporadas.saved.join("; ")}. Prepare de novo para continuar.`);
  }
  const final = { ...proposal, principalId, memberIds: members }, group = makeGroup(target, final, input.rows);
  // No provider call here: the approved final composition is evaluated against
  // the cache in this same action, without a second editorial confirmation.
  // D2(a): principal declarada no plano aprovado, sem volume — o parecer pode vir das sustentações (sem custo).
  // 2026-10-13 · a keyword do plano, travada ou livre (a livre que ficou principal também vale).
  const principalDeclarada = target.kind === "subject" && Boolean(target.declaredPrincipalId ?? target.planPrincipalId) && (target.declaredPrincipalId ?? target.planPrincipalId) === principalId;
  const semParecerDaDeclarada = () => refusal(`A principal declarada “${input.rows.get(principalId)?.keyword ?? principalId}” não tem SERP no cache e nenhuma sustentação com volume do artigo tem as 4 lentes no cache: não há base para o parecer pelas sustentações (D2a). Nada foi gravado. Para gravar, use “Coletar a SERP no DataForSEO” (pago; o custo aparece antes de autorizar).`);
  try { await serpOperation(context, group, "execute", 0); }
  catch (error) { if (principalDeclarada && !hasSearchVolume(input.rows.get(principalId)?.volume_search)) throw semParecerDaDeclarada(); throw error; }
  // F2 das listas leves (2026-10-14): o parecer desta composição por `candidateRef`, não a lista inteira da marca.
  const lidoDaComposicao = await findArticleFormationSerpAssessment(context, group.id);
  const assessment = lidoDaComposicao && lidoDaComposicao.payload.formationBaseHash === baseHash(group) ? lidoDaComposicao : undefined;
  if (!assessment) {
    if (principalDeclarada && !hasSearchVolume(input.rows.get(principalId)?.volume_search)) throw semParecerDaDeclarada();
    throw refusal("O parecer da composição final não foi relido.");
  }
  const apoioDoParecer = (assessment.payload.assessment as { supportBasis?: SerpFormationAssessment["supportBasis"] }).supportBasis ?? null;
  if (apoioDoParecer && (!principalDeclarada || apoioDoParecer.principalKeywordId !== principalId)) throw refusal("O parecer pelas sustentações só vale para a principal declarada no plano aprovado deste artigo. Nada foi gravado.");
  const interpretation = object(assessment.payload.interpretation), lenses = object(interpretation.lenses);
  const mismatch = serpCompositionMismatch(serpAssessmentComposition(assessment.payload.assessment, lenses), { keywordIds: members, principalKeywordId: principalId, roles: Object.fromEntries(group.keywordIds.map(id => [id, id === group.principalSuggestion.keywordId ? "principal" as const : "secundaria" as const])) });
  if (mismatch) throw refusal(`O parecer não responde à composição aceita: ${mismatch}.`);
  if (!Array.isArray(lenses.observed) || lenses.observed.length !== 4 || (Array.isArray(lenses.missing) && lenses.missing.length > 0) || assessment.payload.verdict === "DIVERGENCE") throw refusal("SERP da composição incompleta ou contraditória; nenhuma nova aprovação do ArticleDNA foi feita.");
  await resolveArticleFormationSerpAssessment(await runtime.authorize("arquiteto", "approve"), { candidateRef: group.id, resolution: { decision: "accept_current_composition", reason: `Prévia ${run.decisionHash} aceita: ${proposal.reasons.join(" ")}`, source: "human", decidedAt: new Date().toISOString(), decidedBy: context.actorUserId, assessmentId: assessment.payload.assessment.id, formationBaseHash: baseHash(group) } });
  const resolved = await readbackArticleFormationSerpAssessment(context, group.id);
  if (resolved.payload.humanResolution?.formationBaseHash !== baseHash(group) || resolved.payload.humanResolution.decidedBy !== context.actorUserId) throw refusal("O aceite editorial não foi confirmado na releitura do parecer.");
  const currentArticle = input.workspace.articleDnas.find(a => a.payload.articleId === target.id || a.payload.subject?.keywordId === target.id || a.payload.publishedIdentityRef?.sourceKeywordDnaIds?.includes(target.id));
  let payload: ArticleDNA;
  if (currentArticle) payload = currentArticle.payload;
  else if (target.kind === "published") {
    const original = target.memberIds.find(id => input.rows.get(id)?.isPublished) ?? target.memberIds[0];
    const first = buildFirstPublishedArticleDna({ brandId: context.brandId, page: { keywordId: original, keyword: target.theme, url: target.url, canonical: target.canonical }, territoryRef: target.territoryRef!, keywords: group.keywords, roles: Object.fromEntries(members.map(id => [id, id === original ? "principal" : "secundaria"])), siloVersions: input.workspace.siloDnas });
    if (!first.ok) throw refusal(first.reason);
    payload = first.payload;
  } else {
    const draft = deterministicArticleDnaPayload(group, context.brandId);
    const bound = bindArticleParentForMaterialization({ article: draft, siloVersions: input.workspace.siloDnas, stage: "INITIAL" });
    if (!bound.ok) throw refusal(bound.reason);
    payload = bound.payload;
  }
  const recalculated = deterministicArticleDnaPayload(group, context.brandId);
  const references = recalculated.keywordReferences;
  const now = new Date().toISOString();
  const previousPrimaryId = payload.principalKeywordId;
  const switched = principalId !== previousPrimaryId;
  const policyContext = payload.primaryKeywordPolicyContext;
  const primaryRow = input.rows.get(principalId)!;
  const previousLabel = input.rows.get(previousPrimaryId)?.keyword ?? target.theme;
  payload = ArticleDNASchema.parse({ ...payload, principalKeywordId: principalId, keywordReferences: references, secondaryKeywordIds: members.filter(id => id !== principalId), narrativeReinforcementIds: [], ...(switched && payload.kgrIdentity ? { kgrIdentity: { ...payload.kgrIdentity, primaryKeywordId: principalId, principalKeywordDnaId: primaryRow.keywordDnaRef?.entityId ?? principalId, principalKeywordDnaVersionId: primaryRow.keywordDnaRef?.versionId, principalKeywordDnaContentHash: primaryRow.keywordDnaRef?.contentHash, primaryVolume: primaryRow.volume_search ?? null, resultCount: primaryRow.results_allintitle ?? null, kgrValue: primaryRow.kgr_score ?? null, ...(payload.kgrIdentity.isKgrArticle ? { bindingStatus: "candidate", status: "candidate", confirmedBy: undefined, confirmedAt: undefined } : {}) } } : {}), ...(switched && policyContext ? { primaryKeywordPolicyContext: { ...policyContext, currentKeyword: primaryRow.keyword, publishedOriginalKeyword: policyContext.publishedOriginalKeyword ?? previousLabel, actorId: context.actorUserId, decidedAt: now, history: [...(policyContext.history ?? []), { previous: policyContext.policy, next: policyContext.policy, actorId: context.actorUserId, changedAt: now, reason: proposal.subjectKeywordId && proposal.subjectKeywordId === previousPrimaryId ? `Troca aceita na melhoria (volume 0, SDD 2026-10-18): ${previousLabel} vira o Assunto do artigo; ${primaryRow.keyword} assume sem alterar a identidade.` : `Troca aceita na melhoria: ${previousLabel} permanece secundária; ${primaryRow.keyword} assume sem alterar a identidade.` }] } } : {}), volumeStrategy: recalculated.volumeStrategy, keywordStrategy: recalculated.keywordStrategy, primaryKeywordMetrics: recalculated.primaryKeywordMetrics, intentProfile: recalculated.intentProfile, mainIntent: recalculated.mainIntent, angle: proposal.angle || payload.angle, antiCannibalizationBoundary: proposal.exclusions.length ? `Cobrir ${proposal.angle}; deixar ${proposal.exclusions.join("; ")} para as páginas vizinhas.` : payload.antiCannibalizationBoundary, differentiation: [...new Set([...payload.differentiation, proposal.angle])].filter(Boolean), excludedSubjects: [...new Set([...payload.excludedSubjects, ...proposal.exclusions])], coverage: [...new Set([...payload.coverage, ...group.keywords.map(k => k.keyword)])], requiredTopics: [...new Set([...payload.requiredTopics, target.theme])], ...(target.kind === "published" ? { suggestedSlug: target.slug, canonical: target.canonical } : { suggestedSlug: suggestArticleSlug({ principal: primaryRow, siloSlug: target.siloContext?.slug ?? null }) }), ...(principalId !== payload.principalKeywordId ? { primaryKeywordDecision: { status: "confirmed", previousKeywordId: payload.principalKeywordId, selectedKeywordId: principalId, actorId: context.actorUserId, decidedAt: now, reason: proposal.reasons.join(" ") } } : {}) });
  /*
   * 2026-10-18 · A PÁGINA VIRA O ASSUNTO (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.3-d/f, X12 SUBSTITUÍDO):
   * a página publicada com Assunto no pacote aprovado fica como o `subject` do ArticleDNA — fora das keywords quando a
   * principal é outra (a antiga não fica secundária), ou a própria principal com volume definido (volume baixo). Prender
   * é o ato humano desta confirmação (`attachedBy` = o ator), conferido pela guarda de sempre. URL, slug, canonical,
   * marca e `publishedIdentityRef` vêm do DNA anterior e não mudam.
   */
  if (target.kind === "published" && proposal.subjectKeywordId) {
    const pagina = input.rows.get(proposal.subjectKeywordId);
    if (!pagina) throw refusal("A página publicada não foi relida no Arquiteto: prepare de novo.");
    if (members.includes(proposal.subjectKeywordId) && proposal.subjectKeywordId !== principalId) throw refusal("A página que vira o Assunto não pode continuar entre as secundárias do próprio artigo: prepare de novo.");
    const attachment = planSubjectAttachment({ brandId: context.brandId, keyword: pagina, actorUserId: context.actorUserId, attachedAt: now, target: { principalKeywordId: principalId, keywords: members.map(id => ({ keywordId: id, role: id === principalId ? "principal" : "secundaria" })), excludedSubjects: payload.excludedSubjects } });
    if (!attachment.ok) throw refusal(`O Assunto da página não pôde entrar no artigo: ${attachment.reason}`);
    const attached = attachSubjectToArticleDna(payload, attachment.subject, { principalVolumeValidated: subjectMayBePrincipal(readArchitectSubjectStanding(pagina)) });
    if (!attached.ok) throw refusal(attached.reason);
    payload = ArticleDNASchema.parse(attached.value);
  }
  if (target.kind === "subject") {
    const attachment = planSubjectAttachment({ brandId: context.brandId, keyword: input.rows.get(target.id)!, actorUserId: context.actorUserId, attachedAt: now, target: { principalKeywordId: principalId, excludedSubjects: payload.excludedSubjects } });
    if (!attachment.ok) throw refusal(attachment.reason);
    const attached = attachSubjectToArticleDna(payload, attachment.subject, { principalVolumeValidated: subjectMayBePrincipal(readArchitectSubjectStanding(input.rows.get(target.id)!)) });
    if (!attached.ok) throw refusal(attached.reason);
    payload = attached.value;
    // F4 — o plano declarado: papel = hierarquia, escopo = promessa; principal diferente da declarada é recusa (D11).
    const comPlano = applyDeclaredPlanToArticleDna(payload, readArchitectSubjectStanding(input.rows.get(target.id)!));
    if (!comPlano.ok) throw refusal(comPlano.reason);
    payload = ArticleDNASchema.parse(comPlano.value);
  }
  /*
   * A SUCESSORA FALA DA COMPOSIÇÃO NOVA (regra do dono, 2026-10-01).
   *
   * O spread do DNA anterior carregava `classification` e `auxiliaryIntents`
   * da composição velha: outra principal, outras keywords, e a ficha mostrava
   * a classificação de um artigo que não existe mais. Agora as duas são
   * recalculadas aqui, pela mesma evidência da tela (KeywordDNA, parecer da
   * SERP desta composição e KGR do artigo). Se a regra devolve a decisão ao
   * humano (KGR aplicável sem métrica), a classificação velha sai e a tela
   * mostra a leitura ao vivo — nunca a de outra composição.
   */
  {
    const semanticaDe = (keywordId: string) => {
      const row = input.rows.get(keywordId);
      const semantic = object(row?.analise_semantica);
      const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
      return { intent: row ? signals(row).intent : null, funnel: texto(semantic.funil) || texto(semantic.funnel) };
    };
    const kgr = readArticleKgrDecision({
      kgrIdentity: payload.kgrIdentity,
      principal: primaryRow as unknown as ArchitectKeyword,
      principalKeywordId: principalId,
      supports: members.filter(id => id !== principalId).map(id => input.rows.get(id)).filter(Boolean) as unknown as ArchitectKeyword[],
    });
    const evidencia = buildClassificationEvidence({
      principal: semanticaDe(principalId),
      secondaries: members.filter(id => id !== principalId).map(semanticaDe),
      keywordCount: members.length,
      serpInterpretation: (assessment.payload as { interpretation?: { observedIntent: string; observedFunnel?: string | null; intentShares?: { informacional: number; comercial: number; transacional: number; lenses: number; results: number } | null } | null }).interpretation ?? null,
      serpResolved: true,
      kgr,
      principalIsSubject: target.kind === "subject" || readArchitectSubjectStanding(primaryRow).declared,
      isPublished: target.kind === "published",
      principalProtected: primaryRow.primaryKeywordPolicy === "locked",
    });
    const classificacao = unresolvedClassifications(evidencia).length ? undefined : resolveArticleClassification(evidencia);
    const comClassificacao = { ...payload, auxiliaryIntents: recalculated.auxiliaryIntents, classification: classificacao };
    // A SERP tem a última palavra: intenção e funil que ela decidiu entram no DNA.
    payload = ArticleDNASchema.parse(classificacao ? applySerpDecisionToArticle(comClassificacao, classificacao) : comClassificacao);
  }
  // D2(a) — de onde veio o parecer fica escrito no DNA (serpStrategy.rationale), trocado a cada versão; não é pendência.
  payload = ArticleDNASchema.parse(applySerpSupportBasisProvenance(payload, apoioDoParecer?.reason ?? null, recalculated.serpStrategy));
  payload = withHumanArticleApproval(payload, { entityId: assessment.payload.assessment.id, versionId: `${assessment.payload.assessment.id}:${assessment.payload.formationBaseHash}`, contentHash: assessment.payload.assessment.contentHash });
  // 2026-10-14 · consolidado do plano sem SERP: com o parecer gravado agora, a marca "sem parecer de SERP" sai desta versão.
  if (payload.alerts.some(alert => alert.startsWith(DECLARED_PLAN_CONSOLIDATION_ALERT_PREFIX))) payload = ArticleDNASchema.parse({ ...payload, alerts: payload.alerts.filter(alert => !alert.startsWith(DECLARED_PLAN_CONSOLIDATION_ALERT_PREFIX)) });
  // 2026-10-19 · a formação do artigo é lida de um membro que fica nele (a keyword que foi para outro artigo já pode estar na formação do destino).
  const saiuParaOutro = new Set((proposal.movedOut ?? []).map(m => m.keywordId));
  const formationRef = text(input.rows.get(target.memberIds.find(id => !saiuParaOutro.has(id)) ?? target.id)?.articleFormationRef) ?? `article-formation:${stableUuid(context.brandId, target.id, "improvement")}`;
  // The provider uses the published identity; the workbench uses the working
  // formation. Bind the SAME observed composition to that stable reference.
  await saveArticleFormationSerpAssessment(context, { candidateRef: formationRef, territoryRef: target.territoryRef!, formationBaseHash: baseHash(group), verdict: assessment.payload.verdict, assessment: assessment.payload.assessment as SerpFormationAssessment, interpretation: assessment.payload.interpretation, operationRequestId: run.runId });
  await resolveArticleFormationSerpAssessment(await runtime.authorize("arquiteto", "approve"), { candidateRef: formationRef, resolution: resolved.payload.humanResolution! });
  const bound = await readbackArticleFormationSerpAssessment(context, formationRef);
  if (bound.payload.formationBaseHash !== baseHash(group) || bound.payload.humanResolution?.decidedBy !== context.actorUserId) throw refusal("O vínculo entre a SERP e a formação não foi relido.");
  // Quem está na formação da mesa e não ficou no artigo é liberado (vai para "Keywords não agrupadas").
  const liberadas = target.kind === "published"
    ? [...input.rows.values()].filter(row => text(row.articleFormationRef) === formationRef && !members.includes(row.id) && !proposal.removeIds.includes(row.id)).map(row => row.id)
    : [];
  // 2026-10-19 · a keyword que foi para outro artigo do recorte e que o destino JÁ gravou fica com o destino (não volta a "não agrupadas").
  const jaNoDestino = new Set((proposal.movedOut ?? []).map(m => m.keywordId).filter(id => { const ref = text(input.rows.get(id)?.articleFormationRef); return Boolean(ref) && ref !== formationRef; }));
  const updates = [...new Set([...members, ...proposal.removeIds.filter(id => !jaNoDestino.has(id)), ...liberadas])].map(id => {
    const row = input.rows.get(id)!; const workflow = object(row.canonicalWorkflow);
    if (!workflow.id) throw refusal("Membro não recebido no Arquiteto.");
    return { workflowItemId: String(workflow.id), expectedLock: Number(workflow.lockVersion), assignment: members.includes(id) ? { articleFormationRef: formationRef, articleFormationDecision: { operation: "move", role: id === principalId ? "principal" : "secundaria", reason: target.kind === "published" && principalId !== target.id && [target.id, principalId].includes(id) ? PUBLISHED_REINFORCEMENT_SWAP_REASON : "Melhoria da composição aceita pelo humano na prévia.", source: "human", decidedAt: now }, ...(target.kind === "subject" ? { articleSubjectAnchor: id === principalId ? { candidateRef: formationRef, subjectKeywordId: target.id, attachedBy: context.actorUserId, attachedAt: now } : null } : {}), ...(transfers.includes(id) ? { territoryRef: target.territoryRef, territoryAssignment: { state: "existing_silo_match", source: "human", reason: "Transferência aceita na prévia de melhoria.", decidedAt: now } } : {}) } : { articleFormationRef: null, articleFormationDecision: null, ...(target.kind === "subject" ? { articleSubjectAnchor: null } : {}) } };
  });
  // Build and validate the DNA before changing its working copy. Existing approved
  // versions remain immutable if any later write fails.
  const version = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: (currentArticle?.versionNumber ?? 0) + 1, previousVersionId: currentArticle?.versionId ?? null, origin: "human", changeReason: `Melhorar publicados e formar Assuntos: composição e diferenciação aceitas na prévia.${apoioDoParecer ? ` ${apoioDoParecer.reason}` : ""} [run:${run.runId}]`, createdBy: context.actorUserId, payload });
  const issues = articleApprovalRevalidationIssues({ version, authorizedBrandId: context.brandId });
  if (issues.length) throw refusal(`A aprovação não passou na revalidação: ${issues.map(i => i.detail).join(" ")}`);
  await responseData(await handleArchitectWorkspacePatch(internalRequest("/api/arquiteto/workspace", { brandId: context.brandId, updates }, "PATCH"), context));
  const written = await appendArquitetoArtifact(await runtime.authorize("arquiteto", "approve"), "article_dna", version, "approved");
  const marker = await readArticleFormationMarker(context);
  const concluded = { candidateRef: formationRef, territoryRef: target.territoryRef!, principalKeywordId: principalId, members: members.map(keywordId => ({ keywordId, role: keywordId === principalId ? "principal" as const : "secundaria" as const })), formationBaseHash: baseHash(group), slug: payload.suggestedSlug, fullPath: target.url ?? null, concludedAt: now, concludedBy: context.actorUserId, materializedArticleId: payload.articleId };
  const formations = [...(marker?.payload.concludedFormations ?? []).filter(f => f.materializedArticleId !== payload.articleId && f.candidateRef !== formationRef), concluded];
  await saveArticleFormationMarker(context, { contractVersion: "article-formation-marker-v1", baseHash: marker?.payload.baseHash ?? baseHash(group), processedAt: now, confirmation: { status: "partial", confirmedAt: now, confirmedArticleCount: formations.length, coveredKeywordCount: new Set(formations.flatMap(f => f.members.map(m => m.keywordId))).size, pendingSiloCount: marker?.payload.confirmation.pendingSiloCount ?? 0, failedCount: marker?.payload.confirmation.failedCount ?? 0 }, concludedFormations: formations });
  const [readback, markerReadback] = await Promise.all([loadCanonicalArquitetoWorkspace(context), readbackArticleFormationMarker(context)]);
  const dna = readback.articleDnas.find(a => a.versionId === written.version.versionId), rows = projected(readback, context.brandId);
  if (!dna || dna.contentHash !== written.version.contentHash || !markerReadback.payload.concludedFormations.some(f => f.materializedArticleId === payload.articleId && f.formationBaseHash === baseHash(group)) || members.some(id => text(rows.get(id)?.articleFormationRef) !== formationRef || object(rows.get(id)?.articleFormationDecision).role !== (id === principalId ? "principal" : "secundaria") || (transfers.includes(id) && text(rows.get(id)?.territoryRef) !== target.territoryRef)) || proposal.removeIds.some(id => jaNoDestino.has(id) ? text(rows.get(id)?.articleFormationRef) === formationRef : Boolean(text(rows.get(id)?.articleFormationRef)))) throw refusal("A releitura não confirmou DNA, composição e marcador. Revise o progresso antes de retomar.");
  const material = proposal.addIds.length > 0 || proposal.removeIds.length > 0 || proposal.principalId !== proposal.currentPrimaryId || proposal.exclusions.length > 0 || Boolean(target.declaredPlanPending);
  // 2026-10-16 · o que a confirmação gravou no Minerador (só keywords novas) e o que ficou de fora, com o motivo.
  const doMinerador = incorporadas ? ` Keywords novas: ${incorporadas.saved.join("; ")}.${incorporadas.leftOut.length ? ` Ficaram fora do artigo (no Minerador, sem aprovação): ${incorporadas.leftOut.map(item => `“${item.keyword}” — ${item.reason}`).join("; ")}.` : ""} As keywords que já vieram do Minerador não foram alteradas.` : "";
  return { targetId: target.id, status: material ? "improved" : currentArticle ? "unchanged" : "dna_created", message: `${material ? "Melhoria material gravada e relida." : currentArticle ? "Composição já adequada." : "Primeiro ArticleDNA criado; composição não foi ampliada."}${doMinerador}${liberadas.length ? ` A tabela voltou a bater com o artigo: ${liberadas.map(id => `“${input.rows.get(id)?.keyword ?? id}”`).join(", ")} ${liberadas.length === 1 ? "foi liberada" : "foram liberadas"} para “Keywords não agrupadas” (nenhuma foi apagada).` : ""}`, versionId: dna.versionId };
}

export function improvementRuntime(context: PipelineContext): ImprovementRuntime {
  return {
    context,
    authorize: (module, action) => resolvePipelineContext({ brandId: context.brandId, module, action }, { requireActorUserId: async () => context.actorUserId }),
    // A Connection de IA resolvida como nas outras rotas do Arquiteto (cliente da sessão).
    editorialAi: prompt => proposeArticleImprovementAiPicks({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase, ...prompt }),
    recordUsage: event => recordImprovementUsageEvent(context, event),
    // F3 · medir uma vez: a medição inteira volta e é guardada para "Gravar melhorias" gravar sem consultar de novo.
    measureVolumes: async keywords => (await import("./arquiteto-differentiation-runtime")).readGoogleAdsHistoricalMetricsOnce({ actorUserId: context.actorUserId, agencyId: null, brandId: context.brandId, keywords }),
  };
}

/**
 * O MESMO caminho do registro de uso das outras chamadas (2026-10-12): a IA
 * como a revisão territorial e o DataForSEO (`recordIntegrationUsage*` sobre a
 * resource da Connection), a busca como a Descoberta do Minerador
 * (`recordGoogleAdsDiscoveryUsage`, módulo `arquiteto`). Sem schema novo.
 * Carregado sob demanda: o registro só abre o repositório quando há o que gravar.
 */
async function recordImprovementUsageEvent(context: PipelineContext, event: ImprovementUsageEvent): Promise<void> {
  const [{ createIntegrationRuntimeRepository, recordIntegrationUsageForResource }, { createCanonicalAuthorizationRepository }] = await Promise.all([import("./integrations-runtime"), import("./canonical-authorization")]);
  const dependencies = { repository: createIntegrationRuntimeRepository(context.supabase), authorizationRepository: createCanonicalAuthorizationRepository(context.supabase) };
  if (event.kind === "editorial_ai") {
    const { resolveDeepSeekCanonicalConfig } = await import("./deepseek-canonical");
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: context.actorUserId, agencyId: null, brandId: context.brandId, client: context.supabase });
    await recordIntegrationUsageForResource({
      resource: provider.resource, operation: "module_operation", module: "arquiteto", resultStatus: event.resultStatus, units: 1,
      errorCode: event.errorCode, idempotencyKey: improvementAiUsageKey(provider.provider, event.runId, event.resultStatus),
      metadata: { operationRequestId: event.runId, operationKind: "article_improvement_ai", targets: event.targets, listSize: event.listSize },
    }, dependencies);
    return;
  }
  const { recordGoogleAdsDiscoveryUsage } = await import("@/lib/minerador/google-ads-discovery-usage");
  await recordGoogleAdsDiscoveryUsage({
    actorUserId: context.actorUserId, agencyId: null, brandId: context.brandId, operationRequestId: event.runId,
    resultStatus: event.resultStatus, providerReference: event.providerReference, errorCode: event.errorCode,
    receivedCount: event.receivedCount ?? undefined, normalizedCount: event.receivedCount ?? undefined,
    usageKeySuffix: event.suffix, module: "arquiteto", dependencies,
  });
}

/** Send only the terms shown in the preview, rather than the full brand pool. */
export function projectImprovementRun(run: ImprovementRun): ImprovementRun {
  const used = new Set(run.proposals.flatMap(p => [...p.memberIds, ...p.removeIds, ...(p.currentPrimaryId ? [p.currentPrimaryId] : [])]));
  // F3 — a medição guardada para gravar depois não vai ao navegador nem ao MCP (só serve ao servidor).
  return { ...run, sourceHashes: {}, beforeAssignments: {}, keywords: run.keywords.filter(k => used.has(k.id)).map(semMedicaoGuardada) };
}
function semMedicaoGuardada(keyword: ImprovementKeyword): ImprovementKeyword {
  if (!keyword.measurement) return keyword;
  const copia = { ...keyword };
  delete copia.measurement;
  return copia;
}
