import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SerpSnapshotSchema, VersionedArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "@/lib/arquiteto/contracts";
import { SerpCollectionRecordSchema, SerpQueryInputSchema, SerpReviewRecordSchema } from "@/lib/editorial/contracts";
import { RadarItemSchema } from "@/lib/editorial/operational-flow";
import { type RadarHydrationSnapshot } from "@/lib/radar/hydration";
import { canonicalUuidCandidates, isCanonicalUuid } from "@/lib/radar/identifiers";
import { resolvePrimaryKeyword } from "@/lib/radar/keyword-resolver";
import { assertRadarEnvelopeMatchesArticle, assertRadarWorkflowIdentityMatchesEnvelope, assertRemoteKeywordMatchesEnvelope, RadarResolutionEnvelopeError, validateRadarSerpResolutionEnvelope, type RadarSerpResolutionEnvelope } from "@/lib/radar/resolution-envelope";
import { SerpReviewSchema, type SerpResearchSnapshot, type SerpSearchInput } from "@/lib/radar/serp/contracts";
import { RequestSchema } from "@/lib/radar/serp/request";
import { ArtifactRepository, SerpSnapshotRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { PersistenceUnavailableError, mapPersistenceError } from "@/lib/server/editorial-db";
import { DataForSeoSerpError } from "@/lib/minerador/dataforseo-serp-core";
import { resolveDataForSeoCanonicalSerpCompatibilityConfig, DataForSeoCanonicalError } from "@/lib/server/dataforseo-canonical";
import { collectDataForSeoSerpSnapshot } from "@/lib/server/dataforseo-serp-operation";
import { IntegrationRuntimeError, integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";

const SerpReviewReadbackQuerySchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().uuid(),
  snapshotId: z.string().min(1),
});

async function resolveArticle(
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>,
  brandId: string,
  articleId: string,
  localArticle?: unknown,
  localHydration?: RadarHydrationSnapshot | null,
  resolutionEnvelope?: RadarSerpResolutionEnvelope,
) {
  let workflow: Awaited<ReturnType<WorkflowRepository["findByArticle"]>> = null;
  let article: VersionEnvelope<ArticleDNA> | null = null;
  let usedLocalFallback = false;
  /**
   * Os Silos canônicos DESTA marca, lidos do repositório tenantizado.
   *
   * O guard de posse do Silo nasceu quando Silo era sinônimo de lista do
   * Minerador. No fluxo Silo-first o `siloId` passou a vir do SiloDNA, que é
   * outro espaço de identidade — e nem sempre um UUID. Conferir só
   * `minerador_keyword_lists` recusava artigos legítimos e, pior, culpava a
   * keyword por um problema de Silo.
   *
   * A prova de posse continua sendo REMOTA e escopada por marca: o que muda é
   * que ela passa a aceitar as duas identidades canônicas, não uma só.
   */
  const brandSiloDnaIds = new Set<string>();
  try {
    workflow = await new WorkflowRepository().findByArticle(brandId, articleId, "radar");
    if (workflow && workflow.marca_id === brandId) {
      const artifacts = await new ArtifactRepository().list(brandId);
      article = artifacts.articles.find(version => version.payload.articleId === articleId && (!workflow?.source_version_id || version.versionId === workflow.source_version_id)) || artifacts.articles.find(version => version.payload.articleId === articleId) || null;
      for (const silo of artifacts.silos) brandSiloDnaIds.add(silo.payload.siloId);
    }
  } catch (error) {
    if (!(error instanceof PersistenceUnavailableError) || !localArticle) throw error;
    usedLocalFallback = true;
  }
  if (!article && localArticle) {
    const parsedLocalArticle = VersionedArticleDNASchema.safeParse(localArticle);
    if (!parsedLocalArticle.success) throw new RadarResolutionEnvelopeError("invalid_transfer", "O contexto local do ArticleDNA não pôde ser validado para a recuperação da coleta.");
    article = parsedLocalArticle.data;
    usedLocalFallback = true;
  }
  if (!article || article.payload.articleId !== articleId || article.payload.brandId !== brandId) {
    throw new AuthzError(404, "ArticleDNA do item não foi encontrado para esta marca.");
  }
  const principal = article.payload.keywordReferences.find(reference => reference.role === "principal" && reference.keywordId === article.payload.principalKeywordId);
  if (!resolutionEnvelope) throw new RadarResolutionEnvelopeError("invalid_transfer", "A transferência editorial do Arquiteto para o Radar não foi enviada.");
  assertRadarEnvelopeMatchesArticle(resolutionEnvelope, { brandId, articleId, article });
  if (!principal) throw new AuthzError(409, "ArticleDNA sem vínculo coerente com a keyword principal.");
  if (workflow) {
    assertRadarWorkflowIdentityMatchesEnvelope({
      workflowId: workflow.id,
      workflowBrandId: workflow.marca_id,
      workflowArticleId: workflow.article_id,
      workflowSourceVersionId: workflow.source_version_id,
      workflowPayload: workflow.payload,
      brandId,
      articleId,
      articleDnaVersionId: article.versionId,
      resolutionEnvelope,
    });
  }
  const parsedRadar = workflow ? RadarItemSchema.safeParse({ ...(workflow.payload as object), id: workflow.id }) : { success: false as const };
  const hydration = parsedRadar.success && parsedRadar.data.hydration?.principalKeyword ? parsedRadar.data.hydration : localHydration?.principalKeyword ? localHydration : null;
  if (hydration && (hydration.brandId !== brandId || hydration.articleId !== articleId || hydration.principalKeywordId !== article.payload.principalKeywordId)) {
    throw new AuthzError(409, "A hidratação local não corresponde ao ArticleDNA deste artigo.");
  }
  const lookupIds = canonicalUuidCandidates([principal.keywordId, article.payload.principalKeywordId, hydration?.principalKeyword?.canonicalKeywordId, hydration?.principalKeyword?.sourceKeywordId, hydration?.principalKeyword?.originalKeywordId, resolutionEnvelope.principalKeyword.canonicalKeywordId, resolutionEnvelope.principalKeyword.sourceKeywordId, resolutionEnvelope.principalKeyword.originalKeywordId]);
  let keywordRows: Array<{ id: string; keyword: string; lista_id: string | null }> = [];
  try {
    const keywordResult = lookupIds.length ? await profile.supabase.from("minerador_keywords").select("id,keyword,lista_id").in("id", lookupIds) : { data: [], error: null };
    if (keywordResult.error) mapPersistenceError(keywordResult.error);
    keywordRows = (keywordResult.data || []) as Array<{ id: string; keyword: string; lista_id: string | null }>;
  } catch (error) {
    if (!(error instanceof PersistenceUnavailableError) || !usedLocalFallback || !hydration?.principalKeyword) throw error;
  }
  const keyword = keywordRows.find(row => lookupIds.includes(row.id)) || null;
  let publishedBriefing: { keyword_principal: string; silo_id: string | null } | null = null;
  if (!keyword && articleId.startsWith("pub-b-")) {
    try {
      const briefingId = articleId.slice("pub-b-".length);
      if (isCanonicalUuid(briefingId)) {
        const briefingResult = await profile.supabase.from("briefings_artigos").select("keyword_principal,silo_id").eq("id", briefingId).maybeSingle();
        if (briefingResult.error) mapPersistenceError(briefingResult.error);
        publishedBriefing = briefingResult.data;
      }
    } catch (error) {
      if (!(error instanceof PersistenceUnavailableError) || !usedLocalFallback) throw error;
    }
  }
  const hydratedPrincipal = hydration?.principalKeyword;
  if (keyword) assertRemoteKeywordMatchesEnvelope(resolutionEnvelope, keyword.keyword);
  if (publishedBriefing) assertRemoteKeywordMatchesEnvelope(resolutionEnvelope, publishedBriefing.keyword_principal);
  if (hydratedPrincipal) assertRemoteKeywordMatchesEnvelope(resolutionEnvelope, hydratedPrincipal.keyword);
  const transferPrincipal = resolutionEnvelope.principalKeyword;
  if (!keyword && !publishedBriefing && !hydratedPrincipal && !transferPrincipal) throw new AuthzError(409, "A keyword principal deste artigo não foi encontrada no vínculo canônico nem na recuperação local.");
  /*
   * Duas identidades de Silo, duas provas de posse — ambas remotas.
   *
   * `minerador_keyword_lists` continua sendo a prova do espaço legado; o
   * SiloDNA da marca é a prova do espaço canônico. Nenhuma delas confia no
   * payload do navegador, e um Silo de outra marca não passa em nenhuma.
   */
  const siloCandidates = [...new Set([article.payload.siloId, keyword?.lista_id, publishedBriefing?.silo_id, hydratedPrincipal?.siloId, hydration?.silo?.id, resolutionEnvelope.silo?.id]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
  const possibleSiloIds = canonicalUuidCandidates(siloCandidates);
  const ownedSiloIds: string[] = [];
  try {
    const siloResult = possibleSiloIds.length ? await profile.supabase.from("minerador_keyword_lists").select("id,marca_id").in("id", possibleSiloIds) : { data: [], error: null };
    if (siloResult.error) mapPersistenceError(siloResult.error);
    for (const silo of siloResult.data || []) if (silo.marca_id === brandId) ownedSiloIds.push(silo.id);
  } catch (error) {
    if (!(error instanceof PersistenceUnavailableError) || !usedLocalFallback) throw error;
  }
  for (const candidate of siloCandidates) if (brandSiloDnaIds.has(candidate) && !ownedSiloIds.includes(candidate)) ownedSiloIds.push(candidate);
  if (!ownedSiloIds.length && usedLocalFallback && (hydration?.silo?.id || resolutionEnvelope.silo?.id) && resolutionEnvelope.brandId === brandId) {
    ownedSiloIds.push((hydration?.silo?.id || resolutionEnvelope.silo!.id) as string);
  }
  /*
   * A mensagem passa a dizer o que realmente falhou.
   *
   * Antes, um Silo não comprovado era anunciado como "a keyword principal não
   * pertence à marca" — a tela mandava corrigir a keyword e o vínculo quebrado
   * era outro. Culpar o objeto errado custou uma investigação inteira.
   */
  if (!ownedSiloIds.length) throw new AuthzError(403, "O Silo deste artigo não pôde ser comprovado dentro da marca selecionada. Nenhuma coleta foi iniciada.");
  const ownedSilo = { id: ownedSiloIds[0] };
  const candidate = keyword
    ? { id: keyword.id, keyword: keyword.keyword, lista_id: keyword.lista_id, brandId, aliases: [principal.keywordId, ...(hydration?.principalKeyword?.aliases || [])] }
    : publishedBriefing
      ? { id: principal.keywordId, keyword: publishedBriefing.keyword_principal, lista_id: publishedBriefing.silo_id, brandId, aliases: [principal.keywordId] }
      : hydratedPrincipal
        ? { id: hydratedPrincipal.canonicalKeywordId || hydratedPrincipal.referenceKeywordId, keyword: hydratedPrincipal.keyword, lista_id: hydratedPrincipal.siloId, brandId, aliases: [hydratedPrincipal.referenceKeywordId, ...hydratedPrincipal.aliases] }
        : { id: transferPrincipal.canonicalKeywordId || transferPrincipal.referenceKeywordId, keyword: transferPrincipal.keyword, lista_id: transferPrincipal.siloId, brandId, aliases: [transferPrincipal.referenceKeywordId, ...transferPrincipal.aliases] };
  const resolved = resolvePrimaryKeyword({ brandId, article: article.payload, keywords: [candidate], allowedSiloIds: [ownedSilo.id] });
  if (!resolved.ok) throw new AuthzError(409, resolved.message);
  const canonicalRemoteVerified = Boolean(keyword || publishedBriefing);
  return { workflow, article, resolved, usedLocalFallback, resolutionMode: canonicalRemoteVerified ? "remote_canonical" as const : "local_recovery" as const, canonicalRemoteVerified };
}

function summaryFromResearch(research: SerpResearchSnapshot) {
  return SerpSnapshotSchema.parse({ schemaVersion: 1, keyword: research.query, location: research.location, capturedAt: research.collectedAt,
    results: research.organicResults.map(result => ({ position: result.position, title: result.title, url: result.url, pageType: result.inferredType, format: result.inferredType, entities: research.diagnostic.frequentEntities })),
    dominantIntent: research.diagnostic.dominantIntent || "indeterminada", formats: research.diagnostic.dominantFormats, entities: research.diagnostic.frequentEntities,
    questions: research.peopleAlsoAsk.map(item => item.question), patterns: research.diagnostic.recurringTitlePatterns, gaps: research.diagnostic.possibleConflicts,
    opportunities: research.diagnostic.opportunities });
}

/**
 * Narrow, authenticated readback for the current SERP review. It intentionally
 * avoids the broad workspace loader so an unrelated operational artifact cannot
 * make a remotely persisted approval look local after a page reload.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = SerpReviewReadbackQuerySchema.parse({
      brandId: request.nextUrl.searchParams.get("brandId"),
      articleId: request.nextUrl.searchParams.get("articleId"),
      articleDnaVersionId: request.nextUrl.searchParams.get("articleDnaVersionId"),
      snapshotId: request.nextUrl.searchParams.get("snapshotId"),
    });
    await assertEditorialPermission(profile, input.brandId, "radar", "view");

    const repository = new SerpSnapshotRepository();
    const [history, reviewHistory] = await Promise.all([
      repository.list(input.brandId, input.articleId),
      repository.listReviews(input.brandId, input.articleId),
    ]);
    if (!history.available || !reviewHistory.available) {
      return NextResponse.json({
        brandId: input.brandId,
        articleId: input.articleId,
        articleDnaVersionId: input.articleDnaVersionId,
        snapshotId: input.snapshotId,
        record: null,
        reviews: [],
        persistenceMode: "local_fallback",
        readbackConfirmed: false,
      }, { status: 503 });
    }

    const record = history.records.find(candidate => candidate.id === input.snapshotId) || null;
    if (!record?.research || record.research.brandId !== input.brandId || record.research.articleId !== input.articleId) {
      throw new AuthzError(404, "Snapshot SERP não encontrado para o artigo informado.");
    }
    if (record.research.articleDnaVersionId !== input.articleDnaVersionId) {
      throw new AuthzError(409, "O snapshot SERP não pertence à versão atual do ArticleDNA.");
    }
    const reviews = reviewHistory.reviews
      .filter(review => review.brandId === input.brandId && review.articleId === input.articleId && review.snapshotId === record.id)
      .map(review => SerpReviewRecordSchema.parse(review));

    return NextResponse.json({
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      snapshotId: record.id,
      record: SerpCollectionRecordSchema.parse(record),
      reviews,
      persistenceMode: "remote",
      readbackConfirmed: true,
    });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Parâmetros de readback inválidos." }, { status: 400 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", input.action === "review" ? "review" : "edit");
    if (input.action === "review") {
      const resolutionEnvelope = await validateRadarSerpResolutionEnvelope(input.resolutionEnvelope);
      const { article } = await resolveArticle(profile, input.brandId, input.articleId, input.articleVersion, input.hydration, resolutionEnvelope);
      if (input.articleDnaVersionId && input.articleDnaVersionId !== article.versionId) throw new RadarResolutionEnvelopeError("transfer_conflict", "A versão do ArticleDNA enviada pelo Radar diverge da versão canônica.");
      const history = await new SerpSnapshotRepository().list(input.brandId, input.articleId);
      const fallback = input.record?.id === input.snapshotId && input.record.input.articleId === input.articleId && input.record.research?.brandId === input.brandId ? input.record : undefined;
      const target = history.records.find(record => record.id === input.snapshotId) || fallback;
      if (!target) throw new AuthzError(404, "Snapshot SERP não encontrado para este artigo.");
      if (target.origin !== "real" || target.isMock || !target.research) throw new AuthzError(409, "Somente uma SERP real pode ser aprovada ou rejeitada.");
      const review = SerpReviewSchema.parse({ id: `serp-review:${crypto.randomUUID()}`, brandId: input.brandId, articleId: input.articleId, snapshotId: input.snapshotId, status: input.status, notes: input.notes, reviewedBy: profile.userId, reviewedAt: new Date().toISOString() });
      const persisted = await new SerpSnapshotRepository().saveReview(input.brandId, review);
      return NextResponse.json({ review, persistenceMode: persisted ? "remote" : "local", readbackConfirmed: persisted });
    }
    const resolutionEnvelope = await validateRadarSerpResolutionEnvelope(input.resolutionEnvelope);
    const { article, resolved, resolutionMode, canonicalRemoteVerified } = await resolveArticle(profile, input.brandId, input.articleId, input.articleVersion, input.hydration, resolutionEnvelope);
    if (input.articleDnaVersionId && input.articleDnaVersionId !== article.versionId) throw new RadarResolutionEnvelopeError("transfer_conflict", "A versão do ArticleDNA enviada pelo Radar diverge da versão canônica.");
    const repository = new SerpSnapshotRepository(); const history = await repository.list(input.brandId, input.articleId);
    const realHistory = history.records.filter(record => record.origin === "real" && record.research);
    const previous = realHistory.at(-1); const lastVersion = previous?.research?.version || 0;
    const queryInput = SerpQueryInputSchema.parse({ keyword: resolved.keyword, articleId: input.articleId, location: input.location, language: input.language, device: input.device });
    const searchInput: SerpSearchInput = { brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: article.versionId, keywordId: resolved.keywordId, keywordDnaVersionId: resolved.keywordDnaVersionId,
      keyword: queryInput.keyword, location: queryInput.location, language: queryInput.language, device: queryInput.device, expectedIntent: article.payload.mainIntent, expectedFormat: article.payload.hierarchy,
      requiredTopics: article.payload.requiredTopics, articleEntities: article.payload.entities, resultLimit: Number.parseInt(process.env.SERP_DEFAULT_RESULTS || "10", 10) || 10, version: lastVersion + 1, previousSnapshotId: previous?.id || null };
    const dataForSeo = await resolveDataForSeoCanonicalSerpCompatibilityConfig({ actorUserId: profile.userId, brandId: input.brandId, quotaUnits: 1 });
    const operationRequestId = crypto.randomUUID();
    const research = await collectDataForSeoSerpSnapshot(searchInput, { config: dataForSeo.config, operationRequestId });
    const resolvedResearch = { ...research, resolutionMode, canonicalRemoteVerified };
    const summary = summaryFromResearch(resolvedResearch);
    await recordIntegrationUsage({
      resource: dataForSeo.resource,
      operation: "module_operation",
      module: "radar",
      resultStatus: "succeeded",
      units: 1,
      idempotencyKey: `dataforseo:radar:serp:${operationRequestId}:${input.articleId}`,
      providerReference: null,
      metadata: { operationKind: "serp", articleId: input.articleId, snapshotId: research.id },
    });
    let record = SerpCollectionRecordSchema.parse({ id: research.id, input: queryInput, status: "needs_review", provider: "dataforseo", origin: "real", isMock: false, snapshot: summary, research: resolvedResearch, persistenceMode: "local", resolutionMode, canonicalRemoteVerified, cost: null, error: null,
      dnaIntent: article.payload.mainIntent, conflictReason: research.diagnostic.possibleConflicts[0] || null, humanDecisionRequired: true });
    const persisted = await repository.save(input.brandId, record, profile.userId);
    if (persisted) record = SerpCollectionRecordSchema.parse({ ...record, persistenceMode: "remote", research: { ...resolvedResearch, persistenceMode: "remote" } });
    return NextResponse.json({ record, resolvedKeyword: resolved.keyword, persistenceMode: persisted ? "remote" : "local" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field = issue?.path.length ? issue.path.join(".") : "corpo da solicitação";
      return NextResponse.json({ code: "invalid_serp_request", error: `Solicitação SERP inválida no campo ${field}: ${issue?.message || "verifique os dados enviados."}` }, { status: 400 });
    }
    if (error instanceof DataForSeoCanonicalError || error instanceof DataForSeoSerpError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    if (error instanceof IntegrationRuntimeError) {
      const mapped = integrationRuntimeErrorResponse(error);
      return NextResponse.json({ code: mapped.code, error: mapped.message }, { status: mapped.status });
    }
    if (error instanceof RadarResolutionEnvelopeError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, reason: error.reason, error: error.message, recoverableLocally: true }, { status: 503 });
    const mapped = authzErrorResponse(error); const code = error instanceof AuthzError ? error.status === 401 ? "unauthenticated" : error.status === 403 ? "permission_denied" : "authorization_error" : "serp_error";
    return NextResponse.json({ code, error: mapped.message }, { status: mapped.status });
  }
}
