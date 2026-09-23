import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SerpSnapshotSchema, VersionedArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "@/lib/arquiteto/contracts";
import { SerpCollectionRecordSchema, SerpQueryInputSchema, SerpReviewRecordSchema } from "@/lib/editorial/contracts";
import { RadarItemSchema } from "@/lib/editorial/operational-flow";
import { radarDeclaredArticleIntent, radarDeclaredKeywordIntent } from "@/lib/radar/editorial-identity";
import { type RadarHydrationSnapshot } from "@/lib/radar/hydration";
import { canonicalUuidCandidates, isCanonicalUuid } from "@/lib/radar/identifiers";
import { resolvePrimaryKeyword } from "@/lib/radar/keyword-resolver";
import { assertRadarEnvelopeMatchesArticle, assertRadarWorkflowIdentityMatchesEnvelope, assertRemoteKeywordMatchesEnvelope, RadarResolutionEnvelopeError, validateRadarSerpResolutionEnvelope, type RadarSerpResolutionEnvelope } from "@/lib/radar/resolution-envelope";
import { RadarPrimaryModeConflictError } from "@/lib/radar/search-mode";
import { resolveRadarResearchSource } from "@/lib/server/radar-primary-mode";
import { radarGoogleSerpWriteLock } from "@/lib/radar/google-research-write-lock";
import { RADAR_SERP_FINALIZED_DURING_COLLECTION_MESSAGE, radarGoogleSerpWriteLockAtSave, readRadarCurrentAnalysisForSerp } from "@/lib/server/radar-serp-write-lock";
import { SerpReviewSchema, type SerpResearchSnapshot, type SerpSearchInput } from "@/lib/radar/serp/contracts";
import { RequestSchema } from "@/lib/radar/serp/request";
import { ArtifactRepository, SerpSnapshotRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { recoverRadarSerpSnapshot } from "@/lib/radar/serp-recovery";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { PersistenceUnavailableError, getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";
import { DataForSeoSerpError, readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { resolveDataForSeoCanonicalSerpCompatibilityConfig, DataForSeoCanonicalError } from "@/lib/server/dataforseo-canonical";
import { IntegrationRuntimeError, integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { radarSerpSnapshotSummary } from "@/lib/radar/serp-snapshot-summary";
import { SERP_CACHE_CANONICAL_LENS } from "@/lib/editorial/serp-cache";
import { RADAR_SERP_MAX_AGE_MS, RADAR_SERP_SNAPSHOT_DEPTH } from "@/lib/radar/serp/lens-set";
import { collectRadarSerpLensSnapshot, readRadarKeywordTargetCodes } from "@/lib/server/radar-serp-lenses";

const SerpReviewReadbackQuerySchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().uuid(),
  /*
   * SEM `snapshotId` A PERGUNTA MUDA — e continua sendo uma leitura.
   *
   * Com id, a rota confirma UM snapshot conhecido (comportamento original,
   * intacto). Sem id, ela responde qual coleta real ja gravada responde por
   * este artigo — o caminho de recuperacao de uma coleta ja paga que nunca
   * chegou ao estado do navegador. Nenhum provider e consultado nos dois.
   */
  snapshotId: z.string().min(1).nullable().default(null),
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
  return { workflow, article, resolved, hydration, usedLocalFallback, resolutionMode: canonicalRemoteVerified ? "remote_canonical" as const : "local_recovery" as const, canonicalRemoteVerified };
}

/**
 * O TEXTO DE UMA KEYWORD AUXILIAR — RESOLVIDO AQUI, NUNCA RECEBIDO.
 *
 * A composição do ArticleDNA guarda IDs. O texto vive em `minerador_keywords`
 * (canônico) e na hidratação que o Arquiteto transportou. O cliente manda o ID
 * e só; aceitar texto do navegador seria aceitar consulta paga arbitrária.
 */
async function resolveAuxiliaryKeywordText(
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>,
  reference: { keywordId: string },
  hydration: RadarHydrationSnapshot | null,
) {
  const hidratada = hydration?.keywordSnapshots.find(snapshot =>
    snapshot.referenceKeywordId === reference.keywordId
    || snapshot.canonicalKeywordId === reference.keywordId
    || snapshot.sourceKeywordId === reference.keywordId
    || snapshot.originalKeywordId === reference.keywordId) || null;

  const lookupIds = canonicalUuidCandidates([
    reference.keywordId,
    hidratada?.canonicalKeywordId,
    hidratada?.sourceKeywordId,
    hidratada?.originalKeywordId,
  ]);

  try {
    const result = lookupIds.length
      ? await profile.supabase.from("minerador_keywords").select("id,keyword").in("id", lookupIds)
      : { data: [], error: null };
    if (result.error) mapPersistenceError(result.error);
    const row = ((result.data || []) as Array<{ id: string; keyword: string }>).find(item => lookupIds.includes(item.id));
    if (row?.keyword?.trim()) return { keyword: row.keyword.trim(), source: "remote_canonical" as const };
  } catch (error) {
    if (!(error instanceof PersistenceUnavailableError)) throw error;
  }

  if (hidratada?.keyword?.trim()) return { keyword: hidratada.keyword.trim(), source: "hydration" as const };
  return null;
}

/*
 * 1.1 · §20 · O RESUMO MUDOU DE CASA, e não de comportamento.
 *
 * Ele estava correto e era inalcançável: morava dentro deste `route.ts`, e o
 * apoio da Amazon — que precisava exatamente disto — acabou montando um
 * parecido à mão. O parecido não tinha `schemaVersion`, `keyword` nem
 * `location`, e derrubava a gravação DEPOIS da chamada paga.
 */
const summaryFromResearch = radarSerpSnapshotSummary;

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

    /*
     * RECUPERAR E LER — nunca coletar.
     *
     * Este ramo existe porque uma coleta paga pode estar gravada aqui e
     * ausente da tela: enquanto a copia local teve poder de veto sobre o
     * estado em memoria, o registro remoto ficava sem quem o mostrasse. Sem
     * este caminho a unica saida era clicar em Iniciar pesquisa outra vez e
     * pagar de novo pelo mesmo dado.
     */
    if (!input.snapshotId) {
      const recuperacao = recoverRadarSerpSnapshot({ records: history.records, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId });
      if (recuperacao.state !== "RECOVERED") {
        return NextResponse.json({
          brandId: input.brandId,
          articleId: input.articleId,
          articleDnaVersionId: input.articleDnaVersionId,
          snapshotId: null,
          record: null,
          reviews: [],
          recovery: recuperacao.state,
          recoveryReason: recuperacao.reason,
          persistenceMode: "remote",
          readbackConfirmed: true,
        });
      }
      const recuperado = recuperacao.record;
      const revisoesRecuperadas = reviewHistory.reviews
        .filter(review => review.brandId === input.brandId && review.articleId === input.articleId && review.snapshotId === recuperado.id)
        .map(review => SerpReviewRecordSchema.parse(review));
      return NextResponse.json({
        brandId: input.brandId,
        articleId: input.articleId,
        articleDnaVersionId: input.articleDnaVersionId,
        snapshotId: recuperado.id,
        record: SerpCollectionRecordSchema.parse(recuperado),
        reviews: revisoesRecuperadas,
        recovery: recuperacao.state,
        recoveryReason: recuperacao.reason,
        persistenceMode: "remote",
        readbackConfirmed: true,
      });
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
    if (error instanceof PersistenceUnavailableError) {
      /*
       * ===== O ERRO REAL VAI PARA O LOG DO SERVIDOR =====
       *
       * A frase que a pessoa lê é a mesma para timeout de statement, socket
       * derrubado, projeto inalcançável e RLS. Ela é correta para quem opera e
       * inútil para quem corrige — e o erro do driver já vinha preservado no
       * objeto, sem ninguém nunca o ler.
       *
       * Nada de credencial aqui: só razão, código do Postgres e a mensagem.
       */
      console.error("[serp:readback]", error.reason, error.driver?.code || "", error.driver?.message || "");
      return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    }
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
    /*
     * =========== A AUTORIDADE DE MODO, TAMBÉM AQUI — 1.2 · §3 ===========
     *
     * A SIMETRIA NÃO É SIMETRIA SE FICAR SÓ NA ROTA NOVA. Um artigo que nasceu
     * de YouTube aceitando a SERP do Google por cima é a mesma violação, só que
     * espelhada — e esta rota é a mais antiga das duas, então é justamente onde
     * a falta passaria despercebida.
     *
     * Fica DEPOIS do `review` e ANTES dos dois caminhos que chamam o provider:
     * revisar um snapshot que já existe não inicia investigação nenhuma, e
     * bloquear isso recusaria uma decisão humana sobre trabalho já pago.
     *
     * É a mesma função da rota de YouTube, com o modo trocado. Reescrever a
     * regra aqui criaria a segunda cópia que o §3 proíbe.
     */
    /*
     * ======== 2.1 · PARTE B · O GOOGLE PODE SER APOIO ========
     *
     * ANTES: um artigo de YouTube recusava esta coleta com 409. Isso impedia o
     * caso que o §6 descreve — usar a SERP do Google para ler intenção,
     * perguntas e termos de um artigo cujo DESTINO é vídeo.
     *
     * AGORA a coleta passa e o ALVO NÃO MUDA (§7). Se o artigo é de YouTube,
     * esta SERP entra como `WEB_SERP` de apoio; se o artigo não tem alvo, é
     * ela que o declara como WEB.
     */
    /*
     * ======== R1b · A SERP CONGELADA NÃO É ATUALIZADA — SDD do Radar ========
     *
     * "Atualizar SERP" abria versão nova a cada clique, inclusive com a
     * investigação finalizada: esta rota nunca perguntava pela trava. Um
     * snapshot novo sob uma fotografia congelada troca o que a curadoria e a
     * extração dizem ter lido.
     *
     * A pergunta vem ANTES de tudo o que lê cache, resolve credencial ou chama
     * o provider — inclusive quando tudo viria do cache. Revisar (acima)
     * continua livre: anota, não troca a amostra. Reabrir, que limpa a
     * fotografia, destrava sem segundo mecanismo.
     *
     * A leitura é a MESMA que a autoridade de fonte logo abaixo já fazia; ela
     * só passou a acontecer uma vez e mais cedo, e reidrata só a versão
     * corrente, a única que a trava e o plano de fonte leem.
     */
    const analiseCorrente = await readRadarCurrentAnalysisForSerp(input.brandId, input.articleId);
    const travaDaSerp = radarGoogleSerpWriteLock(analiseCorrente);
    if (!travaDaSerp.allowed) {
      return NextResponse.json({ code: travaDaSerp.code, state: travaDaSerp.state, error: travaDaSerp.message }, { status: 409 });
    }
    await resolveRadarResearchSource({ brandId: input.brandId, articleId: input.articleId, source: "WEB_SERP" }, { loadAnalysisPayload: async () => analiseCorrente });

    const resolutionEnvelope = await validateRadarSerpResolutionEnvelope(input.resolutionEnvelope);
    const { article, resolved, hydration, resolutionMode, canonicalRemoteVerified } = await resolveArticle(profile, input.brandId, input.articleId, input.articleVersion, input.hydration, resolutionEnvelope);
    if (input.articleDnaVersionId && input.articleDnaVersionId !== article.versionId) throw new RadarResolutionEnvelopeError("transfer_conflict", "A versão do ArticleDNA enviada pelo Radar diverge da versão canônica.");

    /*
     * ===================== A PESQUISA AUXILIAR =============================
     *
     * Mesma autorização da SERP canônica — workflow, envelope, ArticleDNA e
     * posse do Silo já foram provados acima. O que muda é o DESTINO: esta
     * coleta não vira snapshot do artigo, não entra na cadeia de versões, não
     * recebe revisão nem aprovação. Ela é evidência de pesquisa, e o Radar a
     * guarda no registro da investigação.
     *
     * A SERP canônica do Article continua sendo uma só: a da principal.
     */
    if (input.action === "collect_auxiliary") {
      const reference = article.payload.keywordReferences.find(item => item.keywordId === input.keywordId);
      if (!reference) throw new AuthzError(409, "A keyword informada não pertence à composição deste artigo.");
      if (reference.role === "principal" || reference.keywordId === article.payload.principalKeywordId) {
        throw new AuthzError(409, "A keyword principal é coletada pela SERP canônica do artigo, não como pesquisa auxiliar.");
      }

      const auxiliar = await resolveAuxiliaryKeywordText(profile, reference, hydration);
      if (!auxiliar) throw new AuthzError(409, "O texto desta keyword não foi resolvido no vínculo canônico. Nenhuma coleta foi iniciada.");

      /*
       * A intenção da CONSULTA é a da keyword, não a do artigo: é ela que diz
       * que tipo de concorrente esperar.
       *
       * "unknown" NÃO É UMA INTENÇÃO — §10 do Gate 18.4. É o que
       * `normalizeSearchIntent` devolve quando não consegue classificar, e ela
       * é truthy: o `||` parava nela e o diagnóstico da SERP registrava "A
       * intenção esperada (unknown) não coincide com a aparente (informacional)"
       * — uma lacuna sobre a ausência de leitura, não sobre o artigo.
       *
       * A ordem é a das autoridades, a mesma do Gate 18.2: qualificação
       * semântica da keyword, intenção normalizada quando ela conclui algo,
       * classificação terminal fechada pelo Arquiteto e, por fim, o campo livre.
       */
      /*
       * A ORDEM ERA CERTA E ESTAVA NO LUGAR ERRADO.
       *
       * O Gate 18.4 filtrou o sentinela aqui com uma `conclusiva()` local, e o
       * 18.5 repetiu a mesma cadeia no caminho canônico logo abaixo. Duas
       * cópias da mesma decisão, cada uma com a sua ordem — que é exatamente
       * como o defeito atravessou três gates. A precedência entre keyword e
       * artigo continua sendo desta rota; a ordem DENTRO de cada um, não.
       */
      const intencao = radarDeclaredKeywordIntent(reference)
        || radarDeclaredArticleIntent(article.payload)
        /*
         * Nada conclusivo: string vazia, e o provider PULA a comparação.
         * É a resposta honesta — sem intenção declarada não há divergência a
         * registrar, e inventar uma produziria a lacuna que este gate remove.
         */
        || "";
      /*
       * ===== R4 · A AUXILIAR PELO MESMO NÚCLEO DAS QUATRO LENTES =====
       *
       * Cache primeiro, só as lentes faltantes pagas, canônica em 20 e extras
       * em 10, gravadas como `radar` — a mesma regra da SERP do artigo, sem
       * uma segunda cópia. O `device` do pedido não é lido.
       *
       * Os `organicResults` saem SÓ da Desktop · Windows; as outras três vivem
       * no `lensSet`. O universo competitivo junta consultas por posição, e
       * somar posições de aparelhos diferentes misturaria lentes. Continua fora
       * de `serpRecords`: sem snapshot anterior, sem "sem mudança", sem versão.
       */
      const queryInput = SerpQueryInputSchema.parse({ keyword: auxiliar.keyword, articleId: input.articleId, location: input.location, language: input.language, device: SERP_CACHE_CANONICAL_LENS.device });
      const searchInput: SerpSearchInput = {
        brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: article.versionId,
        keywordId: reference.keywordId, keywordDnaVersionId: reference.keywordDnaVersionId,
        keyword: queryInput.keyword, location: queryInput.location, language: queryInput.language,
        device: SERP_CACHE_CANONICAL_LENS.device, operatingSystem: SERP_CACHE_CANONICAL_LENS.operatingSystem,
        expectedIntent: intencao, expectedFormat: article.payload.hierarchy,
        requiredTopics: reference.requiredTopics.length ? reference.requiredTopics : article.payload.requiredTopics,
        articleEntities: article.payload.entities,
        resultLimit: RADAR_SERP_SNAPSHOT_DEPTH,
        /* Versão 1 e sem antecessor: a cadeia de versões pertence à SERP canônica. */
        version: 1, previousSnapshotId: null,
      };
      const clienteDaAuxiliar = getOperationalClient();
      const alvoDaAuxiliar = await readRadarKeywordTargetCodes(clienteDaAuxiliar, input.brandId, reference.keywordId, readDataForSeoTargetCodes());
      const lentesDaAuxiliar = await collectRadarSerpLensSnapshot({
        context: { supabase: clienteDaAuxiliar, brandId: input.brandId, actorUserId: profile.userId },
        searchInput,
        codes: alvoDaAuxiliar.codes,
        codesSource: alvoDaAuxiliar.source,
        cacheKeywordId: alvoDaAuxiliar.cacheKeywordId,
        previous: null,
        recollect: false,
        now: new Date(),
        maxAgeMs: RADAR_SERP_MAX_AGE_MS,
        operationRequestId: crypto.randomUUID(),
        purpose: "auxiliary",
        usageMetadata: { keywordId: reference.keywordId },
      }, {
        resolveConfig: quotaUnits => resolveDataForSeoCanonicalSerpCompatibilityConfig({ actorUserId: profile.userId, brandId: input.brandId, quotaUnits }),
        recordUsage: recordIntegrationUsage,
      });
      const auxiliaryResearch = lentesDaAuxiliar.research;
      return NextResponse.json({
        serpClass: "auxiliary_research",
        keywordId: reference.keywordId,
        role: reference.role,
        resolvedKeyword: auxiliar.keyword,
        keywordSource: auxiliar.source,
        research: { ...auxiliaryResearch, resolutionMode, canonicalRemoteVerified },
        lensCoverage: {
          observed: auxiliaryResearch.lensSet?.lenses.filter(lente => lente.status === "observed").length ?? 0,
          total: auxiliaryResearch.lensSet?.lenses.length ?? 0,
          paidCalls: lentesDaAuxiliar.paidCalls,
          cacheHits: lentesDaAuxiliar.cacheHits,
          codesSource: alvoDaAuxiliar.source,
          cacheReadFailed: lentesDaAuxiliar.cacheReadFailed,
        },
        /* Dito em voz alta: nada foi gravado como snapshot do artigo. */
        persistenceMode: "not_persisted_as_article_snapshot",
        note: "Pesquisa auxiliar: alimenta o universo competitivo da investigação e não substitui a SERP canônica do artigo.",
      });
    }

    const repository = new SerpSnapshotRepository(); const history = await repository.list(input.brandId, input.articleId);
    const realHistory = history.records.filter(record => record.origin === "real" && record.research);
    const previous = realHistory.at(-1); const lastVersion = previous?.research?.version || 0;
    /*
     * A INTENÇÃO DA SERP CANÔNICA — o terceiro leitor do sentinela.
     *
     * Este caminho passava `article.payload.mainIntent` CRU ao provider, e foi
     * ele que gravou "a intenção esperada (unknown)" no diagnóstico do snapshot
     * da rodada real. O caminho auxiliar já havia sido corrigido no Gate 18.4;
     * este não.
     *
     * A ordem é a mesma das autoridades: classificação terminal do Arquiteto,
     * depois o campo livre — e nenhum dos dois vale se disser "unknown".
     */
    const intencaoCanonica = radarDeclaredArticleIntent(article.payload)
      || "";
    /*
     * ======== R2 · AS QUATRO LENTES, CACHE PRIMEIRO — SDD do Radar ========
     *
     * A lente, o endpoint e a janela são do SERVIDOR: a canônica é a
     * desktop-windows do produto, e o `device` que o cliente ainda mande não é
     * lido. A janela do snapshot é fixa em 10 — sem ela o mesmo corpo em 20 e
     * em 10 daria hashes diferentes.
     *
     * Os códigos de local e idioma são os do ALVO da keyword, pela função do
     * Minerador: é o que faz a SERP que ele já pagou servir aqui de graça.
     */
    const queryInput = SerpQueryInputSchema.parse({ keyword: resolved.keyword, articleId: input.articleId, location: input.location, language: input.language, device: SERP_CACHE_CANONICAL_LENS.device });
    const searchInput: SerpSearchInput = { brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: article.versionId, keywordId: resolved.keywordId, keywordDnaVersionId: resolved.keywordDnaVersionId,
      keyword: queryInput.keyword, location: queryInput.location, language: queryInput.language, device: SERP_CACHE_CANONICAL_LENS.device, operatingSystem: SERP_CACHE_CANONICAL_LENS.operatingSystem, expectedIntent: intencaoCanonica, expectedFormat: article.payload.hierarchy,
      requiredTopics: article.payload.requiredTopics, articleEntities: article.payload.entities, resultLimit: RADAR_SERP_SNAPSHOT_DEPTH, version: lastVersion + 1, previousSnapshotId: previous?.id || null };
    const cliente = getOperationalClient();
    const alvo = await readRadarKeywordTargetCodes(cliente, input.brandId, resolved.keywordId, readDataForSeoTargetCodes());
    const operationRequestId = crypto.randomUUID();
    /*
     * O núcleo lê o cache ANTES de resolver credencial e quota, paga só as
     * lentes faltantes (ou as quatro, com "Recoletar agora (pago)" confirmado)
     * e registra um uso por chamada paga. Um acerto não registra uso.
     */
    const lentes = await collectRadarSerpLensSnapshot({
      context: { supabase: cliente, brandId: input.brandId, actorUserId: profile.userId },
      searchInput,
      codes: alvo.codes,
      codesSource: alvo.source,
      cacheKeywordId: alvo.cacheKeywordId,
      previous: previous?.research ?? null,
      recollect: input.recollect?.confirmed === true,
      now: new Date(),
      maxAgeMs: RADAR_SERP_MAX_AGE_MS,
      operationRequestId,
    }, {
      resolveConfig: quotaUnits => resolveDataForSeoCanonicalSerpCompatibilityConfig({ actorUserId: profile.userId, brandId: input.brandId, quotaUnits }),
      recordUsage: recordIntegrationUsage,
    });
    const coberturaDasLentes = {
      observed: lentes.research.lensSet?.lenses.filter(lente => lente.status === "observed").length ?? 0,
      total: lentes.research.lensSet?.lenses.length ?? 0,
      paidCalls: lentes.paidCalls,
      cacheHits: lentes.cacheHits,
      codesSource: alvo.source,
      cacheReadFailed: lentes.cacheReadFailed,
      reusedLensGaps: lentes.reusedLensGaps,
    };
    /*
     * SEM MUDANÇA, SEM VERSÃO. O mesmo conteúdo nas quatro lentes devolve o
     * snapshot gravado — nada é gravado, a curadoria presa ao hash não é
     * invalidada, e a idade exibida continua a da versão gravada (D10).
     */
    if (lentes.unchanged && previous) {
      return NextResponse.json({ record: previous, resolvedKeyword: resolved.keyword, persistenceMode: previous.persistenceMode, unchanged: true, unchangedBy: lentes.unchangedBy, lensCoverage: coberturaDasLentes });
    }
    const research = lentes.research;
    const resolvedResearch = { ...research, resolutionMode, canonicalRemoteVerified };
    const summary = summaryFromResearch(resolvedResearch);
    let record = SerpCollectionRecordSchema.parse({ id: research.id, input: queryInput, status: "needs_review", provider: "dataforseo", origin: "real", isMock: false, snapshot: summary, research: resolvedResearch, persistenceMode: "local", resolutionMode, canonicalRemoteVerified, cost: null, error: null,
      dnaIntent: radarDeclaredArticleIntent(article.payload), conflictReason: research.diagnostic.possibleConflicts[0] || null, humanDecisionRequired: true });
    /*
     * A TRAVA DE NOVO, NA GRAVAÇÃO. Um FINALIZE gravado durante a coleta, por
     * outra aba ou outro dispositivo, não recebe uma SERP nova por baixo. O
     * gasto já aconteceu e está no uso; o snapshot não é gravado.
     */
    const travaNaGravacao = await radarGoogleSerpWriteLockAtSave(input.brandId, input.articleId);
    if (!travaNaGravacao.allowed) {
      return NextResponse.json({ code: travaNaGravacao.code, state: travaNaGravacao.state, error: RADAR_SERP_FINALIZED_DURING_COLLECTION_MESSAGE, collected: true, persisted: false }, { status: 409 });
    }
    const persisted = await repository.save(input.brandId, record, profile.userId);
    if (persisted) record = SerpCollectionRecordSchema.parse({ ...record, persistenceMode: "remote", research: { ...resolvedResearch, persistenceMode: "remote" } });
    return NextResponse.json({ record, resolvedKeyword: resolved.keyword, persistenceMode: persisted ? "remote" : "local", unchanged: false, unchangedBy: null, lensCoverage: coberturaDasLentes });
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
    /* §2 · o mesmo 409, com o mesmo código e o mesmo corpo das duas rotas. */
    if (error instanceof RadarPrimaryModeConflictError) return NextResponse.json(error.body, { status: error.status });
    if (error instanceof RadarResolutionEnvelopeError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    if (error instanceof PersistenceUnavailableError) {
      console.error("[serp:collect]", error.reason, error.driver?.code || "", error.driver?.message || "");
      return NextResponse.json({ code: error.code, reason: error.reason, error: error.message, recoverableLocally: true, details: { reason: error.reason, driver: error.driver } }, { status: 503 });
    }
    const mapped = authzErrorResponse(error); const code = error instanceof AuthzError ? error.status === 401 ? "unauthenticated" : error.status === 403 ? "permission_denied" : "authorization_error" : "serp_error";
    return NextResponse.json({ code, error: mapped.message }, { status: mapped.status });
  }
}
