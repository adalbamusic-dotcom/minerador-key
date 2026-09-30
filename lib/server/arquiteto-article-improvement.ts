import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ArticleDNASchema, type ArticleDNA, type ArchitectKeyword, type ProvisionalArticleGroup } from "@/lib/arquiteto/contracts";
import { buildCanonicalWorkflowWorkspaceItems } from "@/lib/arquiteto/canonical-workspace";
import { deterministicArticleDnaPayload } from "@/lib/arquiteto/adapters";
import { PUBLISHED_REINFORCEMENT_SWAP_REASON, serpAssessmentComposition, serpCompositionMismatch } from "@/lib/arquiteto/published-formation-serp";
import { suggestArticleSlug } from "@/lib/arquiteto/article-formation";
import { articleSerpBaseHash } from "@/lib/arquiteto/article-serp-gate";
import type { SerpFormationAssessment } from "@/lib/arquiteto/serp-formation";
import { siloIsHumanDecided } from "@/lib/arquiteto/territory";
import { bindArticleParentForMaterialization } from "@/lib/arquiteto/article-silo-materialization";
import { articleApprovalRevalidationIssues } from "@/lib/arquiteto/article-approval-revalidation";
import { publishedPrimaryPostOf } from "@/lib/arquiteto/published-primary-swap";
import { buildFirstPublishedArticleDna, withHumanArticleApproval } from "@/lib/arquiteto/published-reinforcement";
import { resolveKeywordDnaSignals } from "@/lib/arquiteto/keyword-dna-signals";
import { readArchitectSubjectStanding, planSubjectAttachment, attachSubjectToArticleDna } from "@/lib/arquiteto/declared-subject";
import { ARTICLE_IMPROVEMENT_VERSION, planArticleImprovements, improvementEditorialFit, type ImprovementKeyword, type ImprovementTarget, type ImprovementProposal, type ImprovementEvidence } from "@/lib/arquiteto/article-improvement";
import { buildSerpSubjectIndex, SERP_SUBJECT_LENS_LABELS } from "@/lib/arquiteto/serp-subject-overlap";
import { createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { normalizeKeyword } from "@/lib/minerador/keyword-import-core";
import { deriveLogicalKeywordBatchItem } from "@/lib/minerador/logical-batch";
import { importSubjectDiscoveryWithCore } from "@/lib/minerador/subject-discovery-import";
import { loadCanonicalArquitetoWorkspace, createMineradorArquitetoHandoff } from "./arquiteto-workspace";
import { readDifferentiationBrandKeywords, readPublishedFootprints } from "./arquiteto-differentiation-store";
import { readGoogleAdsAverageVolumes } from "./arquiteto-differentiation-runtime";
import { handleArchitectWorkspacePatch } from "./arquiteto-workspace-http";
import { handleArchitectFormationSerp } from "./arquiteto-serp-http";
import { handleGoogleAdsKeywordMetrics } from "./minerador-google-ads-metrics-http";
import { appendArquitetoArtifact } from "./arquiteto-persistence";
import { listArticleFormationSerpAssessments, saveArticleFormationSerpAssessment, resolveArticleFormationSerpAssessment, readbackArticleFormationSerpAssessment } from "./arquiteto-article-serp-store";
import { listTerritoryWorkflowItems } from "./arquiteto-territory-store";
import { readArticleFormationMarker, saveArticleFormationMarker, readbackArticleFormationMarker } from "./arquiteto-article-formation-marker-store";
import { WorkflowRepository } from "./pipeline-repositories";
import { resolvePipelineContext, PipelineRuntimeError, type PipelineContext } from "./pipeline-runtime";
import { runKeywordLogicWithCore, readDecisionKeywords, keywordDecisionEntries, applyKeywordDecisionEntries } from "./minerador-keyword-decision-core";
import { createGoogleAdsCanonicalClient, resolveGoogleAdsCanonicalContext, targetingToProviderInput, defaultGoogleAdsCanonicalTargeting } from "./google-ads-canonical";
import { createGoogleAdsKeywordAccount } from "@/lib/google/ads/account";
import { generateGoogleAdsKeywordIdeas } from "@/lib/google/ads/keyword-ideas";
import type { GoogleAdsKeywordIdeasInput } from "@/lib/google/ads/contracts";
import { stableUuid } from "./arquiteto-published-reinforcement";

const refusal = (message: string) => new PipelineRuntimeError("CONFLICT", message, 409);
const SUBJECT_TYPE = "article_improvement_run";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
type Row = ArchitectKeyword & Record<string, unknown>;
type Workspace = Awaited<ReturnType<typeof loadCanonicalArquitetoWorkspace>>;
type Outcome = { targetId: string; status: "improved" | "dna_created" | "unchanged" | "insufficient_evidence" | "failed"; message: string; versionId?: string };
type CostPlan = { paidQueries: number; estimatedCostUsd: { min: number; max: number }; missingDetails: unknown[]; cacheUnavailable?: boolean };
export type ImprovementRun = {
  version: number; runId: string; brandId: string; actorId: string; createdAt: string;
  state: "prepared" | "collecting" | "applying" | "complete"; decisionHash: string;
  leaseUntil: string | null;
  sourceHashes: Record<string, string>; targets: ImprovementTarget[]; keywords: ImprovementKeyword[];
  beforeAssignments: Record<string, Record<string, unknown>>;
  proposals: ImprovementProposal[]; costs: CostPlan; reservedCostUsd: number;
  notices: string[]; outcomes: Outcome[]; acceptedIds: string[] | null;
};
export { ArticleImprovementRequestSchema } from "@/lib/arquiteto/article-improvement-request";
import type { ArticleImprovementRequest } from "@/lib/arquiteto/article-improvement-request";
type ContextResolver = (module: string, action: string) => Promise<PipelineContext>;
export type ImprovementRuntime = { context: PipelineContext; authorize: ContextResolver };

async function responseData(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.success === false) throw refusal(String(body.error ?? body.message ?? "Operação não confirmada."));
  return object(body.data);
}
const internalRequest = (path: string, body: unknown, method = "POST") => new NextRequest(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function projected(workspace: Workspace, brandId: string): Map<string, Row> {
  return new Map((buildCanonicalWorkflowWorkspaceItems(workspace.workflowItems, workspace.keywords, brandId) as unknown as Row[]).map(row => [row.id, row]));
}
function signals(row: Row) {
  const workflow = object(row.canonicalWorkflow), payload = object(workflow.payload), approved = object(payload.approvedDna);
  const resolved = resolveKeywordDnaSignals({ keywordId: row.id, text: row.keyword, semanticQualification: object(payload.semanticQualification), semantic: Object.keys(object(approved.analiseSemantica)).length ? object(approved.analiseSemantica) : object(row.analise_semantica) });
  return { ...resolved, dnaVersionId: resolved.dnaVersionId ?? row.keywordDnaRef?.versionId ?? null, dnaContentHash: resolved.dnaContentHash ?? row.keywordDnaRef?.contentHash ?? null };
}
function sourceHash(target: ImprovementTarget, workspace: Workspace, rows: Map<string, Row>): string {
  const article = workspace.articleDnas.find(a => a.entityId === target.id || a.payload.articleId === target.id || a.payload.subject?.keywordId === target.id || a.payload.publishedIdentityRef?.sourceKeywordDnaIds?.includes(target.id));
  return hash({ target, article: article?.contentHash ?? null, members: target.memberIds.map(id => ({ id, row: rows.get(id) ?? null })), silos: workspace.siloDnas.map(s => [s.entityId, s.contentHash]) });
}
async function readInputs(context: PipelineContext, requested?: string[]) {
  const [workspace, brand, territories] = await Promise.all([loadCanonicalArquitetoWorkspace(context, { keywordDetail: "full" }), readDifferentiationBrandKeywords(context), listTerritoryWorkflowItems(context)]);
  const rows = projected(workspace, context.brandId), targets: ImprovementTarget[] = [];
  const owned = new Map<string, string>();
  for (const a of workspace.articleDnas) for (const reference of a.payload.keywordReferences) owned.set(reference.keywordId, a.payload.subject?.keywordId ?? a.payload.articleId);
  for (const page of brand.pages) {
    const row = rows.get(page.keywordId);
    if (!row) continue;
    // A SiloPage is not an Article target.
    if (row.editorialUnitDeclaration?.unit === "silo") continue;
    const article = workspace.articleDnas.find(a => a.entityId === page.keywordId || a.payload.publishedIdentityRef?.sourceKeywordDnaIds?.includes(page.keywordId));
    const members = article?.payload.keywordReferences.map(r => r.keywordId) ?? [...rows.values()].filter(r => text(r.articleFormationRef) && r.articleFormationRef === row.articleFormationRef).map(r => r.id);
    const id = page.keywordId;
    const target: ImprovementTarget = { id, kind: "published", theme: row.keyword, note: null, primaryId: article?.payload.principalKeywordId ?? row.id, post: publishedPrimaryPostOf(row.primaryKeywordPolicy ?? page.post), memberIds: [...new Set([page.keywordId, ...members])], territoryRef: text(row.territoryRef), slug: article?.payload.suggestedSlug ?? page.slug ?? (page.url ? new URL(page.url).pathname.split("/").filter(Boolean).at(-1) ?? null : null), url: page.url, canonical: article?.payload.canonical ?? page.canonical ?? page.url, signals: signals(row) };
    targets.push(target);
    for (const member of target.memberIds) if (article || !owned.has(member)) owned.set(member, id);
  }
  for (const row of rows.values()) {
    const standing = readArchitectSubjectStanding(row);
    if (!standing.declared || !standing.received || targets.some(t => t.memberIds.includes(row.id))) continue;
    const article = workspace.articleDnas.find(a => a.payload.subject?.keywordId === row.id);
    targets.push({ id: row.id, kind: "subject", theme: standing.phrase, note: standing.note, primaryId: article?.payload.principalKeywordId ?? null, post: "free", memberIds: article?.payload.keywordReferences.map(r => r.keywordId) ?? [], territoryRef: text(row.territoryRef), slug: article?.payload.suggestedSlug ?? null, url: null, canonical: null, signals: signals(row) });
  }
  for (const target of targets) {
    const territory = territories.find(t => t.territoryRef === target.territoryRef)?.territory;
    target.siloContext = territory && siloIsHumanDecided(territory.lifecycleStatus)
      ? { centralEntity: territory.centralEntity, macroIntent: territory.macroIntent, slug: territory.slugState.publishedSlug || territory.slugState.confirmed || territory.slugState.proposals?.[0]?.slug || null }
      : { centralEntity: null, macroIntent: null, slug: null };
  }
  const selected = requested ? targets.filter(t => requested.includes(t.id)) : targets;
  if (requested?.some(id => !selected.some(t => t.id === id))) throw refusal("Um dos alvos não pertence à marca ou não está recebido no Arquiteto.");
  const keywords: ImprovementKeyword[] = [...rows.values()].filter(r => !readArchitectSubjectStanding(r).declared).map(r => ({ id: r.id, keyword: r.keyword, volume: r.volume_search ?? null, volumeValidated: String(r.volume_source ?? object(r.demandEvidence).source ?? "").toLowerCase() === "google_ads" && (r.volume_search ?? 0) > 0, signals: signals(r), ownerId: owned.get(r.id) ?? (text(r.articleFormationRef) && object(r.articleFormationDecision).source === "human" ? `formation:${r.articleFormationRef}` : null), published: Boolean(r.isPublished) || brand.pages.some(p => p.keywordId === r.id), territoryRef: text(r.territoryRef), external: false }));
  return { workspace, rows, targets: selected, keywords };
}
async function evidenceOf(context: PipelineContext, targets: ImprovementTarget[], keywords: ImprovementKeyword[]) {
  const queries = new Map([...targets.map(t => [t.id, t.theme] as const), ...keywords.map(k => [k.id, k.keyword] as const)]);
  let cache: Awaited<ReturnType<typeof readPublishedFootprints>>;
  try { cache = await readPublishedFootprints(context, [...queries].map(([keywordId, keyword]) => ({ keywordId, keyword })), new Date()); }
  catch { return targets.flatMap(t => keywords.map(k => ({ targetId: t.id, keywordId: k.id, complete: false, sharedPages: 0, contradiction: false, anchorConclusive: false }))); }
  const index = buildSerpSubjectIndex(cache.footprints);
  const missing = new Set(cache.missingLenses.map(m => m.keywordId));
  const evidence: ImprovementEvidence[] = targets.flatMap(t => keywords.map(k => {
    const overlap = index.overlap(t.id, k.id);
    return { targetId: t.id, keywordId: k.id, complete: !missing.has(k.id) && cache.footprints.some(f => f.keywordId === k.id && f.lenses.length === 4), sharedPages: overlap.sharedPageCount ?? 0, contradiction: overlap.strength === "none" && (keywords.find(old => old.id === t.primaryId)?.volumeValidated ?? false), anchorConclusive: overlap.strength !== "unknown" && !missing.has(t.id) && (keywords.find(old => old.id === t.primaryId)?.volumeValidated ?? false) };
  }));
  return evidence;
}
const groupContexts = new WeakMap<ProvisionalArticleGroup, ImprovementTarget>();
function makeGroup(target: ImprovementTarget, proposal: ImprovementProposal, rows: Map<string, Row>): ProvisionalArticleGroup {
  const keywords = proposal.memberIds.map(id => rows.get(id)).filter((r): r is Row => Boolean(r));
  if (keywords.length !== proposal.memberIds.length || !proposal.principalId || !target.territoryRef) throw refusal("Composição sem membros, principal ou Silo suficiente.");
  const group: ProvisionalArticleGroup = { id: target.id, keywordIds: proposal.memberIds, keywords, publishedAnchorId: target.kind === "published" ? target.id : null, territoryRef: target.territoryRef, suggestedSiloId: null, suggestedSiloName: null, evidence: { lexical: 0, intent: 0, entities: 0, silo: 1, combined: 0 }, confidence: 0, alerts: proposal.reasons, principalSuggestion: { keywordId: proposal.principalId, score: 0, breakdown: { cobertura: 0, intencao: 0, centralidadeSemantica: 0, aderenciaMarca: 0, potencialComercial: 0, volume: 0, dificuldade: 0, qualidadeSlug: 0, ancoraPublicada: target.kind === "published" ? 1 : 0, serp: null }, justificativa: proposal.reasons, pendencias: [] }, roles: Object.fromEntries(proposal.memberIds.map(id => [id, id === proposal.principalId ? "principal" : "secundaria"])), suggestedHierarchy: "Suporte", architectureStatus: "architecture_confirmed" };
  groupContexts.set(group, target);
  return group;
}
function baseHash(group: ProvisionalArticleGroup) {
  const target = groupContexts.get(group);
  return articleSerpBaseHash({ territoryRef: group.territoryRef!, principalKeywordId: group.principalSuggestion.keywordId,
    roles: group.keywordIds.map(keywordId => ({ keywordId, role: keywordId === group.principalSuggestion.keywordId ? "principal" : "secundaria" })),
    suggestedSlug: target?.kind === "published" ? null : suggestArticleSlug({ principal: group.keywords.find(k => k.id === group.principalSuggestion.keywordId)!, siloSlug: target?.siloContext?.slug ?? null }),
    intents: group.keywords.map(k => ({ keywordId: k.id, intent: signals(k as Row).intent })),
    siloContext: { centralEntity: target?.siloContext?.centralEntity ?? null, macroIntent: target?.siloContext?.macroIntent ?? null },
  });
}
async function serpOperation(context: PipelineContext, supplied: ProvisionalArticleGroup | ProvisionalArticleGroup[], mode: "plan" | "execute", budget = 0) {
  const groups = Array.isArray(supplied) ? supplied : [supplied];
  return responseData(await handleArchitectFormationSerp(internalRequest("/api/arquiteto/serp", { brandId: context.brandId, groups, formationBaseHashes: Object.fromEntries(groups.map(group => [group.id, baseHash(group)])), lenses: SERP_SUBJECT_LENS_LABELS, mode, cacheOnly: mode === "execute" && budget === 0, authorizedPaidQueries: budget, payMissingExtraLenses: mode === "plan" || budget > 0, recollectStaleLenses: false }), context));
}
/** Pagination and direct/expanded seeds share a memo; no repeated seed calls. */
async function discover(context: PipelineContext, targets: ImprovementTarget[], existing: ImprovementKeyword[], notices: string[]) {
  const canonical = await resolveGoogleAdsCanonicalContext({ actorUserId: context.actorUserId, agencyId: null, brandId: context.brandId, operation: "discovery" });
  const { client } = await createGoogleAdsCanonicalClient({ context: canonical });
  const account = createGoogleAdsKeywordAccount({ customerId: canonical.customerId, loginCustomerId: canonical.managerCustomerId });
  const memo = new Set<string>(), found = new Map(existing.map(k => [normalizeKeyword(k.keyword), k]));
  let requests = 0;
  for (const target of targets) {
    const direct: GoogleAdsKeywordIdeasInput["seed"][] = [{ kind: "keyword", keywords: [target.theme] }];
    if (target.url) direct.push({ kind: "url", url: target.url }, { kind: "keyword_and_url", keywords: [target.theme], url: target.url });
    const concepts = [target.signals.centralEntity, target.signals.perceivedProblem, target.signals.desiredResult].filter((s): s is string => Boolean(s));
    const stages = [direct, concepts.length ? [{ kind: "keyword" as const, keywords: concepts.slice(0, 3) }] : []];
    for (const seeds of stages) for (const seed of seeds) {
      if (requests >= 36) { notices.push(`Limite da rodada gratuita: pesquisa adicional pendente para ${target.theme}.`); break; }
      const seedKey = JSON.stringify(seed);
      if (memo.has(seedKey)) continue;
      memo.add(seedKey);
      let pageToken: string | undefined;
      const seenTokens = new Set<string>();
      for (let page = 0; page < 3 && requests < 36; page++) {
        requests++;
        const result = await generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId, loginCustomerId: account.loginCustomerId ?? undefined }, targeting: targetingToProviderInput(canonical.targeting ?? defaultGoogleAdsCanonicalTargeting()), seed, pageSize: 500, pageToken }, account);
        for (const idea of result.ideas) {
          const phrase = idea.keyword, normalized = normalizeKeyword(phrase);
          if (!normalized || found.has(normalized)) continue;
          const id = stableUuid(context.brandId, normalized, "improvement-candidate");
          const logic = deriveLogicalKeywordBatchItem({ id, keyword: phrase, location: null, intent: null, analise_semantica: {} }, null, new Date().toISOString());
          found.set(normalized, { id, keyword: phrase, volume: null, volumeValidated: false, signals: resolveKeywordDnaSignals({ keywordId: id, text: phrase, semantic: logic.update.analise_semantica }), ownerId: null, published: false, territoryRef: null, external: true });
        }
        if (!result.nextPageToken || seenTokens.has(result.nextPageToken)) break;
        pageToken = result.nextPageToken; seenTokens.add(pageToken);
      }
    }
  }
  const candidates = [...found.values()].filter(k => k.external && !k.published && !k.ownerId && targets.some(t => improvementEditorialFit(t, k).fits));
  // Metrics are free, and estimates from keyword ideas are never validated demand.
  const volumes = await readGoogleAdsAverageVolumes({ actorUserId: context.actorUserId, agencyId: null, brandId: context.brandId, keywords: candidates.map(k => k.keyword) });
  for (const k of candidates) { const measured = volumes.get(normalizeKeyword(k.keyword)); if (measured !== undefined) { k.volume = measured; k.volumeValidated = typeof measured === "number" && measured > 0; } }
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
async function saveRun(context: PipelineContext, current: Awaited<ReturnType<typeof findRun>>, run: ImprovementRun) {
  await new WorkflowRepository(context).update(current.id, current.lock, { state: run.state, payload: run as unknown as Record<string, unknown> });
  const readback = await findRun(context, run.runId);
  if (hash(readback.run) !== hash(run)) throw refusal("A releitura da execução não confirmou a gravação.");
  return readback;
}
const decisionHashOf = (run: ImprovementRun) => hash({ version: run.version, brandId: run.brandId, actorId: run.actorId, sources: run.sourceHashes, proposals: run.proposals, keywords: run.keywords, costs: run.costs });

export async function handleArticleImprovement(runtime: ImprovementRuntime, request: ArticleImprovementRequest): Promise<ImprovementRun> {
  const context = runtime.context;
  if (request.brandId !== context.brandId) throw refusal("Marca divergente do contexto autorizado.");
  if (request.action === "prepare") {
    const input = await readInputs(context, request.targetIds);
    const run: ImprovementRun = { version: ARTICLE_IMPROVEMENT_VERSION, runId: randomUUID(), brandId: context.brandId, actorId: context.actorUserId, createdAt: new Date().toISOString(), state: "prepared", leaseUntil: null, decisionHash: "", sourceHashes: Object.fromEntries(input.targets.map(t => [t.id, sourceHash(t, input.workspace, input.rows)])), targets: input.targets, keywords: input.keywords, beforeAssignments: Object.fromEntries([...input.rows].map(([id, row]) => [id, Object.fromEntries(Object.entries(object(object(row.canonicalWorkflow).payload)).filter(([key]) => ["territoryRef", "territoryAssignment", "articleFormationRef", "articleFormationDecision", "articleSubjectAnchor", "workingArticleId"].includes(key)))])), proposals: [], costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, reservedCostUsd: 0, notices: [], outcomes: [], acceptedIds: null };
    const evidence = await evidenceOf(context, run.targets, run.keywords);
    run.proposals = planArticleImprovements({ targets: run.targets, keywords: run.keywords, evidence });
    const gaps = run.targets.filter(t => run.proposals.find(p => p.targetId === t.id)?.status !== "ready" && run.proposals.find(p => p.targetId === t.id)?.status !== "adequate");
    if (gaps.length) try { run.keywords = await discover(context, gaps, run.keywords, run.notices); } catch (error) { run.notices.push(`Pesquisa gratuita incompleta: ${error instanceof Error ? error.message : "provider indisponível"}. O acervo continua válido.`); }
    await refreshPlan(runtime, run, input.rows);
    run.decisionHash = decisionHashOf(run);
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
    if (!request.authorizedCostUsd || request.authorizedCostUsd < run.costs.estimatedCostUsd.max || request.authorizedCostUsd + run.reservedCostUsd > 1) throw refusal("Autorize o plano vigente dentro do teto total de US$ 1 desta execução.");
    // Reserve before opening a provider. Uncertain completion is not refunded,
    // and retry can only inspect cache; it never repeats an uncertain payment.
    if (run.state === "collecting") throw refusal("Coleta já reservada. Consulte o cache com uma nova preparação; não repita pagamentos incertos.");
    const input = await readInputs(context, run.targets.map(t => t.id));
    for (const target of run.targets) if (sourceHash(input.targets.find(t => t.id === target.id)!, input.workspace, input.rows) !== run.sourceHashes[target.id]) throw refusal("A arquitetura mudou desde a prévia. Prepare novamente antes de autorizar custos.");
    run.state = "collecting"; run.reservedCostUsd += run.costs.estimatedCostUsd.max;
    current = await saveRun(context, current, run);
    let remaining = run.costs.paidQueries, reservedRemaining = run.costs.estimatedCostUsd.max;
    const rows = candidateRows(run.keywords, input.rows);
    for (const group of validationGroups(run, rows)) {
      const plan = object((await serpOperation(context, group, "plan")).plan) as CostPlan;
      if (plan.estimatedCostUsd.max > reservedRemaining || plan.paidQueries > remaining) {
        run.notices.push(`Plano mudou para ${group.keywords[0].keyword}: nova autorização será necessária; nada pago para esta consulta.`);
        continue;
      }
      const amount = Math.min(plan.paidQueries, remaining);
      reservedRemaining -= plan.estimatedCostUsd.max;
      try { await serpOperation(context, group, "execute", amount); remaining -= amount; } catch (error) { run.notices.push(`Coleta/validação ${group.id}: ${error instanceof Error ? error.message : "falhou"}. Pagamentos não serão repetidos automaticamente.`); remaining -= amount; }
    }
    await refreshPlan(runtime, run, input.rows); run.state = "prepared"; run.decisionHash = decisionHashOf(run);
    return (await saveRun(context, current, run)).run;
  }
  // One human confirmation persists the accepted set. Subsequent requests only
  // continue this exact set and hash, one article per bounded server request.
  if (!run.acceptedIds) {
    const selected = request.targetIds ?? run.proposals.filter(p => p.status === "ready").map(p => p.targetId);
    if (selected.some(id => !run.proposals.some(p => p.targetId === id && p.status === "ready"))) throw refusal("Só propostas prontas podem ser aceitas; nenhuma keyword será forçada.");
    if (selected.some(id => run.proposals.find(p => p.targetId === id)?.addIds.some(k => run.keywords.find(keyword => keyword.id === k)?.external)) && request.approveNewKeywords !== true) throw refusal("Confirme explicitamente a aprovação das novas keywords no Minerador.");
    run.acceptedIds = selected;
  } else if (request.targetIds && hash(request.targetIds) !== hash(run.acceptedIds)) throw refusal("A retomada não pode alterar os alvos aceitos.");
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
function validationGroups(run: ImprovementRun, rows: Map<string, Row>): ProvisionalArticleGroup[] {
  const groups: ProvisionalArticleGroup[] = [];
  // Potential candidates not yet in cache are validated individually. Candidate
  // proof may support an old zero-demand phrase without paying for it again.
  for (const target of run.targets) {
    if (!target.territoryRef) continue;
    const proposal = run.proposals.find(p => p.targetId === target.id)!;
    if (proposal.principalId && proposal.memberIds.length) groups.push(makeGroup(target, proposal, rows));
    const recommended = proposal.status === "ready" ? proposal.memberIds.filter(id => id === proposal.principalId || (rows.get(id)?.volume_search ?? 0) > 0) : [];
    const ids = [...new Set([...recommended, ...run.keywords.filter(k => !k.published && k.volumeValidated && (!k.ownerId || k.ownerId === target.id) && improvementEditorialFit(target, k).fits).sort((a, b) => b.volume! - a.volume!).slice(0, 5).map(k => k.id)])];
    for (const id of ids) groups.push(makeGroup({ ...target, id, kind: "subject" }, { ...proposal, targetId: id, principalId: id, memberIds: [id] }, rows));
  }
  return [...new Map(groups.map(g => [g.id, g])).values()];
}
async function refreshPlan(runtime: ImprovementRuntime, run: ImprovementRun, existing: Map<string, Row>) {
  const evidence = await evidenceOf(runtime.context, run.targets, run.keywords);
  run.proposals = planArticleImprovements({ targets: run.targets, keywords: run.keywords, evidence });
  const rows = candidateRows(run.keywords, existing), groups = validationGroups(run, rows);
  // All cached candidates were evaluated above before choosing paid candidates.
  let maximum = 0, minimum = 0, calls = 0, cacheUnavailable = false;
  const details: unknown[] = [];
  // One combined provider plan deduplicates the same keyword/lens across
  // candidate checks and final compositions (including a locked principal).
  if (groups.length) {
    const plan = object((await serpOperation(runtime.context, groups, "plan")).plan) as CostPlan;
    cacheUnavailable = plan.cacheUnavailable === true;
    if (plan.estimatedCostUsd.max + run.reservedCostUsd <= 1) {
      calls = plan.paidQueries; maximum = plan.estimatedCostUsd.max; minimum = plan.estimatedCostUsd.min; details.push(...(plan.missingDetails ?? []));
    } else run.notices.push("O plano completo ultrapassa o teto de US$ 1. Prepare um lote menor; as propostas já sustentadas pelo cache continuam aplicáveis.");
  }
  // A candidate's cache does not by itself prove the whole proposed article.
  // Check the final roles and composition before asking for editorial acceptance.
  for (const proposal of run.proposals.filter(p => p.status === "ready")) {
    const target = run.targets.find(t => t.id === proposal.targetId)!;
    const group = makeGroup(target, proposal, rows);
    try {
      await serpOperation(runtime.context, group, "execute", 0);
      const assessment = (await listArticleFormationSerpAssessments(runtime.context)).find(a => a.candidateRef === group.id && a.payload.formationBaseHash === baseHash(group));
      const composition = assessment ? serpAssessmentComposition(assessment.payload.assessment, object(assessment.payload.interpretation).lenses) : null;
      const mismatch = serpCompositionMismatch(composition, { keywordIds: proposal.memberIds, principalKeywordId: proposal.principalId!, roles: Object.fromEntries(group.keywordIds.map(id => [id, id === group.principalSuggestion.keywordId ? "principal" as const : "secundaria" as const])) });
      if (!assessment || mismatch || composition?.lensesComplete !== true || assessment.payload.verdict === "DIVERGENCE") {
        proposal.status = "insufficient_evidence";
        proposal.reasons.push(mismatch ?? "A SERP da composição final está incompleta ou diverge; complete a evidência antes do aceite.");
      } else if (assessment.payload.verdict === "INCONCLUSIVE") proposal.reasons.push("SERP da composição inconclusiva nas quatro lentes: o aceite humano confirma este fundamento editorial, sem tratar a inconclusão como prova de compatibilidade.");
    } catch { proposal.status = "insufficient_evidence"; proposal.reasons.push("Não foi possível validar a composição pelo cache. Consulte ou complete a evidência antes do aceite."); }
  }
  run.costs = { paidQueries: calls, estimatedCostUsd: { min: Number(minimum.toFixed(6)), max: Number(maximum.toFixed(6)) }, missingDetails: details, ...(cacheUnavailable ? { cacheUnavailable: true } : {}) };
}

async function applyTarget(runtime: ImprovementRuntime, run: ImprovementRun, proposal: ImprovementProposal): Promise<Outcome> {
  const context = runtime.context, target = run.targets.find(t => t.id === proposal.targetId)!;
  let input = await readInputs(context, [target.id]);
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
  if (sourceHash(target, input.workspace, input.rows) !== run.sourceHashes[target.id]) throw refusal("O artigo, suas keywords ou o Silo mudaram desde a prévia. Prepare novamente.");
  let members = [...proposal.memberIds], principalId = proposal.principalId!;
  let transfers = [...proposal.transfers];
  for (const id of members) {
    const accepted = run.keywords.find(k => k.id === id);
    const current = input.keywords.find(k => k.id === id);
    if (!accepted?.external && (!current || hash(current) !== hash(accepted))) throw refusal("Uma keyword da prévia mudou. Prepare novamente para revisar os dados atuais.");
  }
  const newIds = members.filter(id => run.keywords.find(k => k.id === id)?.external);
  if (newIds.length) {
    const create = await runtime.authorize("minerador", "create"), edit = await runtime.authorize("minerador", "edit"), approve = await runtime.authorize("minerador", "approve");
    const phrases = newIds.map(id => run.keywords.find(k => k.id === id)!);
    const imported = await importSubjectDiscoveryWithCore({ brandId: context.brandId, actorUserId: context.actorUserId, supabase: create.supabase, request: { importRequestId: stableUuid(run.runId, target.id, "import"), searchId: run.runId, subjectKeywordId: null, subjectPhrase: target.theme, items: phrases.map(k => ({ keyword: k.keyword, origins: ["ads_keyword_seed"], evidence: [`Google Ads: descoberta e Volume medido para ${target.theme}`] })) } });
    if (!imported.ok) throw refusal(imported.reason);
    const brand = await readDifferentiationBrandKeywords(context);
    const ids = phrases.map(k => brand.existingByNormalized.get(normalizeKeyword(k.keyword)));
    if (ids.some(id => !id)) throw refusal("O import não foi confirmado na releitura.");
    const remap = new Map(newIds.map((id, i) => [id, ids[i]!]));
    const actualIds = ids as string[];
    const logic = await runKeywordLogicWithCore({ brandId: context.brandId, keywordIds: actualIds, db: edit.supabase });
    if (!logic.readbackConfirmed || logic.missingIds.length) throw refusal("Lógica não confirmada no Minerador.");
    await responseData(await handleGoogleAdsKeywordMetrics(internalRequest(`/api/minerador/marcas/${context.brandId}/google-ads/metricas-keywords`, { operationRequestId: stableUuid(run.runId, target.id, "metrics"), keywordIds: actualIds, candidateIds: [] }), { params: Promise.resolve({ brandId: context.brandId }) }, edit));
    const decision = await readDecisionKeywords(context.brandId, actualIds, approve.supabase), entries = keywordDecisionEntries(decision.rows, "approve");
    if (decision.missingCount || entries.some(e => e.outcome === "blocked")) throw refusal("As novas keywords ainda não cumprem a aprovação do Minerador; ficaram preservadas nele.");
    const applied = await applyKeywordDecisionEntries({ brandId: context.brandId, actorId: context.actorUserId, action: "approve", rows: decision.rows, entries, db: approve.supabase });
    if (applied.some(r => r.outcome !== "applied" && r.outcome !== "unchanged")) throw refusal("A aprovação não foi confirmada.");
    await createMineradorArquitetoHandoff(await runtime.authorize("arquiteto", "create"), actualIds);
    members = members.map(id => remap.get(id) ?? id); principalId = remap.get(principalId) ?? principalId;
    transfers = transfers.map(id => remap.get(id) ?? id);
    input = await readInputs(context, [target.id]);
    // Exact measured demand must agree with the accepted preview, not just be >0.
    for (const [before, after] of remap) if (input.rows.get(after)?.volume_search !== run.keywords.find(k => k.id === before)?.volume) throw refusal("O volume medido mudou: prepare outra prévia para aprovar a diferença.");
  }
  const final = { ...proposal, principalId, memberIds: members }, group = makeGroup(target, final, input.rows);
  // No provider call here: the approved final composition is evaluated against
  // the cache in this same action, without a second editorial confirmation.
  await serpOperation(context, group, "execute", 0);
  const assessment = (await listArticleFormationSerpAssessments(context)).find(a => a.candidateRef === group.id && a.payload.formationBaseHash === baseHash(group));
  if (!assessment) throw refusal("O parecer da composição final não foi relido.");
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
  payload = ArticleDNASchema.parse({ ...payload, principalKeywordId: principalId, keywordReferences: references, secondaryKeywordIds: members.filter(id => id !== principalId), narrativeReinforcementIds: [], ...(switched && payload.kgrIdentity ? { kgrIdentity: { ...payload.kgrIdentity, primaryKeywordId: principalId, principalKeywordDnaId: primaryRow.keywordDnaRef?.entityId ?? principalId, principalKeywordDnaVersionId: primaryRow.keywordDnaRef?.versionId, principalKeywordDnaContentHash: primaryRow.keywordDnaRef?.contentHash, primaryVolume: primaryRow.volume_search ?? null, resultCount: primaryRow.results_allintitle ?? null, kgrValue: primaryRow.kgr_score ?? null, ...(payload.kgrIdentity.isKgrArticle ? { bindingStatus: "candidate", status: "candidate", confirmedBy: undefined, confirmedAt: undefined } : {}) } } : {}), ...(switched && policyContext ? { primaryKeywordPolicyContext: { ...policyContext, currentKeyword: primaryRow.keyword, publishedOriginalKeyword: policyContext.publishedOriginalKeyword ?? previousLabel, actorId: context.actorUserId, decidedAt: now, history: [...(policyContext.history ?? []), { previous: policyContext.policy, next: policyContext.policy, actorId: context.actorUserId, changedAt: now, reason: `Troca aceita na melhoria: ${previousLabel} permanece secundária; ${primaryRow.keyword} assume sem alterar a identidade.` }] } } : {}), volumeStrategy: recalculated.volumeStrategy, keywordStrategy: recalculated.keywordStrategy, primaryKeywordMetrics: recalculated.primaryKeywordMetrics, intentProfile: recalculated.intentProfile, mainIntent: recalculated.mainIntent, angle: proposal.angle || payload.angle, antiCannibalizationBoundary: proposal.exclusions.length ? `Cobrir ${proposal.angle}; deixar ${proposal.exclusions.join("; ")} para as páginas vizinhas.` : payload.antiCannibalizationBoundary, differentiation: [...new Set([...payload.differentiation, proposal.angle])].filter(Boolean), excludedSubjects: [...new Set([...payload.excludedSubjects, ...proposal.exclusions])], coverage: [...new Set([...payload.coverage, ...group.keywords.map(k => k.keyword)])], requiredTopics: [...new Set([...payload.requiredTopics, target.theme])], ...(target.kind === "published" ? { suggestedSlug: target.slug, canonical: target.canonical } : { suggestedSlug: suggestArticleSlug({ principal: primaryRow, siloSlug: target.siloContext?.slug ?? null }) }), ...(principalId !== payload.principalKeywordId ? { primaryKeywordDecision: { status: "confirmed", previousKeywordId: payload.principalKeywordId, selectedKeywordId: principalId, actorId: context.actorUserId, decidedAt: now, reason: proposal.reasons.join(" ") } } : {}) });
  if (target.kind === "subject") {
    const attachment = planSubjectAttachment({ brandId: context.brandId, keyword: input.rows.get(target.id)!, actorUserId: context.actorUserId, attachedAt: now, target: { principalKeywordId: principalId, excludedSubjects: payload.excludedSubjects } });
    if (!attachment.ok) throw refusal(attachment.reason);
    const attached = attachSubjectToArticleDna(payload, attachment.subject);
    if (!attached.ok) throw refusal(attached.reason);
    payload = attached.value;
  }
  payload = withHumanArticleApproval(payload, { entityId: assessment.payload.assessment.id, versionId: `${assessment.payload.assessment.id}:${assessment.payload.formationBaseHash}`, contentHash: assessment.payload.assessment.contentHash });
  const formationRef = text(input.rows.get(target.memberIds[0] ?? target.id)?.articleFormationRef) ?? `article-formation:${stableUuid(context.brandId, target.id, "improvement")}`;
  // The provider uses the published identity; the workbench uses the working
  // formation. Bind the SAME observed composition to that stable reference.
  await saveArticleFormationSerpAssessment(context, { candidateRef: formationRef, territoryRef: target.territoryRef!, formationBaseHash: baseHash(group), verdict: assessment.payload.verdict, assessment: assessment.payload.assessment as SerpFormationAssessment, interpretation: assessment.payload.interpretation, operationRequestId: run.runId });
  await resolveArticleFormationSerpAssessment(await runtime.authorize("arquiteto", "approve"), { candidateRef: formationRef, resolution: resolved.payload.humanResolution! });
  const bound = await readbackArticleFormationSerpAssessment(context, formationRef);
  if (bound.payload.formationBaseHash !== baseHash(group) || bound.payload.humanResolution?.decidedBy !== context.actorUserId) throw refusal("O vínculo entre a SERP e a formação não foi relido.");
  const updates = [...new Set([...members, ...proposal.removeIds])].map(id => {
    const row = input.rows.get(id)!; const workflow = object(row.canonicalWorkflow);
    if (!workflow.id) throw refusal("Membro não recebido no Arquiteto.");
    return { workflowItemId: String(workflow.id), expectedLock: Number(workflow.lockVersion), assignment: members.includes(id) ? { articleFormationRef: formationRef, articleFormationDecision: { operation: "move", role: id === principalId ? "principal" : "secundaria", reason: target.kind === "published" && principalId !== target.id && [target.id, principalId].includes(id) ? PUBLISHED_REINFORCEMENT_SWAP_REASON : "Melhoria da composição aceita pelo humano na prévia.", source: "human", decidedAt: now }, ...(target.kind === "subject" ? { articleSubjectAnchor: id === principalId ? { candidateRef: formationRef, subjectKeywordId: target.id, attachedBy: context.actorUserId, attachedAt: now } : null } : {}), ...(transfers.includes(id) ? { territoryRef: target.territoryRef, territoryAssignment: { state: "existing_silo_match", source: "human", reason: "Transferência aceita na prévia de melhoria.", decidedAt: now } } : {}) } : { articleFormationRef: null, articleFormationDecision: null, ...(target.kind === "subject" ? { articleSubjectAnchor: null } : {}) } };
  });
  // Build and validate the DNA before changing its working copy. Existing approved
  // versions remain immutable if any later write fails.
  const version = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: (currentArticle?.versionNumber ?? 0) + 1, previousVersionId: currentArticle?.versionId ?? null, origin: "human", changeReason: `Melhorar publicados e formar Assuntos: composição e diferenciação aceitas na prévia. [run:${run.runId}]`, createdBy: context.actorUserId, payload });
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
  if (!dna || dna.contentHash !== written.version.contentHash || !markerReadback.payload.concludedFormations.some(f => f.materializedArticleId === payload.articleId && f.formationBaseHash === baseHash(group)) || members.some(id => text(rows.get(id)?.articleFormationRef) !== formationRef || object(rows.get(id)?.articleFormationDecision).role !== (id === principalId ? "principal" : "secundaria") || (transfers.includes(id) && text(rows.get(id)?.territoryRef) !== target.territoryRef)) || proposal.removeIds.some(id => text(rows.get(id)?.articleFormationRef))) throw refusal("A releitura não confirmou DNA, composição e marcador. Revise o progresso antes de retomar.");
  const material = proposal.addIds.length > 0 || proposal.removeIds.length > 0 || proposal.principalId !== proposal.currentPrimaryId || proposal.exclusions.length > 0;
  return { targetId: target.id, status: material ? "improved" : currentArticle ? "unchanged" : "dna_created", message: material ? "Melhoria material gravada e relida." : currentArticle ? "Composição já adequada." : "Primeiro ArticleDNA criado; composição não foi ampliada.", versionId: dna.versionId };
}

export function improvementRuntime(context: PipelineContext): ImprovementRuntime {
  return { context, authorize: (module, action) => resolvePipelineContext({ brandId: context.brandId, module, action }, { requireActorUserId: async () => context.actorUserId }) };
}

/** Send only the terms shown in the preview, rather than the full brand pool. */
export function projectImprovementRun(run: ImprovementRun): ImprovementRun {
  const used = new Set(run.proposals.flatMap(p => [...p.memberIds, ...p.removeIds, ...(p.currentPrimaryId ? [p.currentPrimaryId] : [])]));
  return { ...run, sourceHashes: {}, beforeAssignments: {}, keywords: run.keywords.filter(k => used.has(k.id)) };
}
