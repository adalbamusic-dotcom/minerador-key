import { NextResponse } from "next/server";
import { z } from "zod";
import { ArchitectKeywordSchema, ProvisionalArticleGroupSchema } from "@/lib/arquiteto/contracts";
import { articleKeywordReference, buildKeywordDnaProvenanceSnapshot } from "@/lib/arquiteto/adapters";
import { buildSiloCandidateSerpEvidence, buildSerpFormationAssessment, resolveSerpValidationProfile } from "@/lib/arquiteto/serp-formation";
import { resolveArticleSerpIdentityContext } from "@/lib/arquiteto/identity-context";
import { explicitEditorialFormat, normalizeSearchIntent } from "@/lib/arquiteto/intent-profile";
import {
  architectSerpCollectionRequest,
  architectSerpStoresBody,
  createFormationSerpQuotaLedger,
  formationSerpCacheRequest,
  formationSerpCodesMatch,
  normalizeCachedFormationSerp,
  normalizeOrganicDigestSerp,
  providerDiagnosticAtRequestedDepth,
  resolveDataForSeoCompatibilityConfig,
  serpBodyAtRequestedDepth,
} from "@/lib/arquiteto/dataforseo-serp-compatibility";
import {
  SerpLensLabelSchema,
  SerpPaidBudgetExhaustedError,
  authorizeSerpPaidPlan,
  buildSerpPaidPlan,
  createPaidQueryBudget,
  serpPaidPlanKeys,
  resolveRequestedSerpLenses,
  staleSlotKeys,
  type SerpLensesMarker,
  type SerpPlanSlot,
} from "@/lib/arquiteto/serp-lens-plan";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor } from "@/lib/arquiteto/serp-lens-targeting";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { DataForSeoCanonicalError } from "@/lib/server/dataforseo-canonical";
import { DataForSeoSerpError } from "@/lib/minerador/dataforseo-serp";
import { readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { IntegrationRuntimeError, integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { readbackArticleFormationSerpAssessment, saveArticleFormationSerpAssessment } from "@/lib/server/arquiteto-article-serp-store";
import {
  formationLensesMarkerOf,
  interpretArticleSerp,
  interpretArticleSerpAcrossLenses,
  notObservedRecordOf,
  serpResultFactsOf,
  splitArticleSerpMembers,
  type KeywordSerpFacts,
  type LensKeywordFacts,
} from "@/lib/arquiteto/article-serp-interpretation";
import { inspectDataForSeoSerpResponse, type DataForSeoSerpProviderDiagnostic } from "@/lib/server/dataforseo-serp-operation";
import { normalizeDataForSeoSerpResponse } from "@/lib/server/dataforseo-serp-normalizer";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheLookup } from "@/lib/server/serp-cache";
import { serpCacheLensLabel, serpCacheSubjectId, type SerpCacheLens, type SerpCacheMeta } from "@/lib/editorial/serp-cache";
import type { SerpResearchSnapshot, SerpSearchInput } from "@/lib/radar/serp/contracts";

const RequestSchema = z.object({
  brandId: z.string().min(1),
  groups: z.array(ProvisionalArticleGroupSchema).min(1).max(20),
  siloCandidates: z.array(ArchitectKeywordSchema).max(20).default([]),
  location: z.string().trim().min(1).default("Brasil"),
  language: z.string().trim().min(2).default("pt-br"),
  /** Forma LEGADA de uma lente só. O cliente atual manda `lenses`. */
  device: z.enum(["desktop", "mobile"]).optional(),
  /** As lentes a observar. Ausente (e sem `device`): as quatro do produto. */
  lenses: z.array(SerpLensLabelSchema).min(1).max(4).optional(),
  resultLimit: z.number().int().positive().max(100).default(10),
  articleDnaVersionIds: z.record(z.string(), z.string().min(1)).optional(),
  previousAssessments: z.record(z.string(), z.object({ id: z.string().min(1), version: z.number().int().positive() })).optional(),
  /** Composição de cada Article candidato; a evidência nasce carimbada. */
  formationBaseHashes: z.record(z.string(), z.string().min(1)).optional(),
  /**
   * `plan` lê só `meta` e devolve o plano de chamadas pagas, sem pagar nem
   * resolver credencial. `execute` valida — e só paga até o autorizado.
   */
  mode: z.enum(["plan", "execute"]).default("execute"),
  /** Quantas chamadas pagas a pessoa autorizou ao ver o plano. */
  authorizedPaidQueries: z.number().int().nonnegative().max(2000).default(0),
  /** `false`: as lentes extras que faltam não são pagas; o parecer sai com as do cache. */
  payMissingExtraLenses: z.boolean().default(true),
  /** Recoleta das lentes antigas pelo portão de datas — só por pedido explícito. */
  recollectStaleLenses: z.boolean().default(false),
});

type SerpQueryDiagnostic = DataForSeoSerpProviderDiagnostic & {
  keywordId: string;
  internalCode: "SERP_REQUEST_FAILED" | "SERP_PROVIDER_RESPONSE_ERROR" | "SERP_TASK_ERROR" | "SERP_EMPTY_RESULT" | "SERP_NORMALIZATION_FAILED" | "SERP_PAID_NOT_AUTHORIZED" | null;
  requestBuilt: boolean;
  apiRequestStarted: boolean;
  normalizationSucceeded: boolean;
  /**
   * De onde veio a SERP desta keyword: `cache` não pagou nada, `provider`
   * pagou. `null` enquanto nenhuma das duas chegou.
   */
  source: "cache" | "provider" | null;
};

/** Uma lente extra de uma keyword: de onde veio, ou por que faltou. */
type ExtraLensQueryDiagnostic = {
  articleId: string;
  keywordId: string;
  lens: string;
  source: "cache" | "provider" | null;
  missing: SerpLensesMarker["missing"][number]["reason"] | null;
};

type SerpOperationDiagnostic = {
  correlationId: string;
  route: "/api/arquiteto/serp";
  endpoint: "/v3/serp/google/organic/live/advanced";
  stage: "request_validation" | "connection_resolution" | "provider_request" | "response_normalization" | "assessment" | "completed";
  internalCode: "SERP_CONNECTION_RESOLUTION_FAILED" | "SERP_REQUEST_FAILED" | "SERP_PROVIDER_RESPONSE_ERROR" | "SERP_TASK_ERROR" | "SERP_EMPTY_RESULT" | "SERP_NORMALIZATION_FAILED" | "SERP_PERSISTENCE_FAILED" | "SERP_READBACK_FAILED" | "SERP_PAID_NOT_AUTHORIZED" | null;
  connectionResolved: boolean;
  requestBuilt: boolean;
  apiRequestStarted: boolean;
  httpStatus: number | null;
  rootStatusCode: number | null;
  rootStatusMessage: string | null;
  taskStatusCode: number | null;
  taskStatusMessage: string | null;
  taskCount: number;
  resultCount: number;
  itemsCount: number;
  normalizationSucceeded: boolean;
  assessmentSucceeded: boolean;
  persistenceSucceeded: "client_pending";
  readbackSucceeded: "client_pending";
  /** Keywords atendidas pelo cache de SERP: nenhuma chamada paga. */
  cacheHits: number;
  /** Chamadas pagas de fato nesta execução, em todas as lentes. */
  paidQueries: number;
  /** A leitura do cache falhou e a rota pagou como antes do cache. */
  cacheReadFailed: boolean;
  /** Das pagas, as das lentes extras. */
  extraLensPaidQueries: number;
  /** Lentes extras lidas do cache (digest), sem pagar. */
  extraLensCacheHits: number;
  /** A leitura do targeting do Minerador falhou: todas as chaves usaram os códigos do ambiente. */
  targetingReadFailed: boolean;
  queries: SerpQueryDiagnostic[];
  extraLensQueries: ExtraLensQueryDiagnostic[];
};

/**
 * Falha de um Article não é falha do lote: cada unidade carrega estágio,
 * código e motivo reais, e só erros compartilhados encerram a execução inteira.
 */
type SerpArticleFailure = {
  articleId: string;
  principalKeywordId: string;
  stage: SerpOperationDiagnostic["stage"];
  code: string;
  message: string;
  retryable: boolean;
};

function describeArticleFailure(input: {
  articleId: string;
  principalKeywordId: string;
  keywordIds: readonly string[];
  error: unknown;
  diagnostic: SerpOperationDiagnostic;
}): SerpArticleFailure {
  const queries = input.diagnostic.queries.filter(query => input.keywordIds.includes(query.keywordId));
  const failedQuery = queries.find(query => query.internalCode) || queries.at(-1) || null;
  const providerError = input.error instanceof DataForSeoSerpError ? input.error : null;
  const stage: SerpOperationDiagnostic["stage"] = failedQuery?.normalizationSucceeded === false && failedQuery.apiRequestStarted
    ? "response_normalization"
    : failedQuery?.apiRequestStarted
      ? "provider_request"
      : failedQuery?.requestBuilt
        ? "provider_request"
        : "assessment";
  const code = failedQuery?.internalCode
    || (providerError
      ? providerError.code === "dataforseo_task_failed" ? "SERP_TASK_ERROR" : "SERP_PROVIDER_RESPONSE_ERROR"
      : "SERP_ASSESSMENT_FAILED");
  // Falha de provider/normalização é tentável de novo; falha estrutural do
  // grupo (principal ausente, refs incompletas) exige correção antes.
  const retryable = code !== "SERP_ASSESSMENT_FAILED";
  return {
    articleId: input.articleId,
    principalKeywordId: input.principalKeywordId,
    stage,
    code,
    message: input.error instanceof Error && input.error.message.trim() ? input.error.message.trim() : "Falha não identificada ao avaliar a SERP deste artigo.",
    retryable,
  };
}

function createSerpDiagnostic(correlationId: string): SerpOperationDiagnostic {
  return {
    correlationId,
    route: "/api/arquiteto/serp",
    endpoint: "/v3/serp/google/organic/live/advanced",
    stage: "request_validation",
    internalCode: null,
    connectionResolved: false,
    requestBuilt: false,
    apiRequestStarted: false,
    httpStatus: null,
    rootStatusCode: null,
    rootStatusMessage: null,
    taskStatusCode: null,
    taskStatusMessage: null,
    taskCount: 0,
    resultCount: 0,
    itemsCount: 0,
    normalizationSucceeded: false,
    assessmentSucceeded: false,
    // O endpoint constrói assessments; a persistência/readback ocorre no
    // artefato local do workspace após a resposta e não é alegada pelo servidor.
    persistenceSucceeded: "client_pending",
    readbackSucceeded: "client_pending",
    cacheHits: 0,
    paidQueries: 0,
    cacheReadFailed: false,
    extraLensPaidQueries: 0,
    extraLensCacheHits: 0,
    targetingReadFailed: false,
    queries: [],
    extraLensQueries: [],
  };
}

function emptyQueryDiagnostic(keywordId: string): SerpQueryDiagnostic {
  return {
    keywordId,
    internalCode: null,
    requestBuilt: false,
    apiRequestStarted: false,
    normalizationSucceeded: false,
    httpStatus: null,
    rootStatusCode: null,
    rootStatusMessage: null,
    taskStatusCode: null,
    taskStatusMessage: null,
    taskCount: 0,
    resultCount: 0,
    itemsCount: 0,
    providerRequestId: null,
    source: null,
  };
}

function diagnosticCodeFor(query: SerpQueryDiagnostic): SerpQueryDiagnostic["internalCode"] {
  if (!query.requestBuilt || !query.apiRequestStarted) return "SERP_REQUEST_FAILED";
  if (query.httpStatus === null) return "SERP_REQUEST_FAILED";
  if (query.httpStatus !== null && (query.httpStatus < 200 || query.httpStatus >= 300)) return "SERP_PROVIDER_RESPONSE_ERROR";
  if (query.rootStatusCode !== null && query.rootStatusCode !== 20000) return "SERP_PROVIDER_RESPONSE_ERROR";
  if (query.taskStatusCode !== null && query.taskStatusCode !== 20000) return "SERP_TASK_ERROR";
  if (query.resultCount === 0 || query.itemsCount === 0) return "SERP_EMPTY_RESULT";
  if (!query.normalizationSucceeded) return "SERP_NORMALIZATION_FAILED";
  return null;
}

type DataForSeoResolution = Awaited<ReturnType<typeof resolveDataForSeoCompatibilityConfig>>;

/** O corpo podado de um acerto, com a meta da coleta que o produziu. */
type CachedSerpBody = { meta: SerpCacheMeta; body: Record<string, unknown> };

/** O que as lentes extras de um artigo trouxeram, para o parecer e o marcador. */
type ArticleExtraLenses = {
  extras: LensKeywordFacts[];
  missing: SerpLensesMarker["missing"];
  collectedAtByLens: Map<string, string[]>;
  collectedAtByKeyword: Map<string, string[]>;
};

/** O diagnóstico saneado da resposta paga, na consulta e no agregado. */
function applyProviderDiagnostic(diagnostic: SerpOperationDiagnostic, queryDiagnostic: SerpQueryDiagnostic, providerDiagnostic: DataForSeoSerpProviderDiagnostic) {
  Object.assign(queryDiagnostic, providerDiagnostic);
  diagnostic.httpStatus = providerDiagnostic.httpStatus;
  diagnostic.rootStatusCode = providerDiagnostic.rootStatusCode;
  diagnostic.rootStatusMessage = providerDiagnostic.rootStatusMessage;
  diagnostic.taskStatusCode = providerDiagnostic.taskStatusCode;
  diagnostic.taskStatusMessage = providerDiagnostic.taskStatusMessage;
  diagnostic.taskCount = providerDiagnostic.taskCount;
  diagnostic.resultCount = providerDiagnostic.resultCount;
  diagnostic.itemsCount = providerDiagnostic.itemsCount;
}

function logSerpFailure(diagnostic: SerpOperationDiagnostic, error: unknown) {
  console.error("[arquiteto/serp] operação não concluída", {
    correlationId: diagnostic.correlationId,
    route: diagnostic.route,
    stage: diagnostic.stage,
    internalCode: diagnostic.internalCode,
    connectionResolved: diagnostic.connectionResolved,
    requestBuilt: diagnostic.requestBuilt,
    apiRequestStarted: diagnostic.apiRequestStarted,
    httpStatus: diagnostic.httpStatus,
    rootStatusCode: diagnostic.rootStatusCode,
    taskStatusCode: diagnostic.taskStatusCode,
    taskCount: diagnostic.taskCount,
    resultCount: diagnostic.resultCount,
    itemsCount: diagnostic.itemsCount,
    normalizationSucceeded: diagnostic.normalizationSucceeded,
    assessmentSucceeded: diagnostic.assessmentSucceeded,
    persistenceSucceeded: diagnostic.persistenceSucceeded,
    readbackSucceeded: diagnostic.readbackSucceeded,
    cacheHits: diagnostic.cacheHits,
    paidQueries: diagnostic.paidQueries,
    cacheReadFailed: diagnostic.cacheReadFailed,
    queries: diagnostic.queries,
    errorName: error instanceof Error ? error.name : "UnknownError",
    // A mensagem já é sanitizada nas camadas de provider; não logamos payload,
    // headers, credenciais, snippets ou qualquer campo de raciocínio.
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Falha não identificada.",
  });
}

/** A identidade de uma consulta paga da formação na lente principal: cada ocorrência paga, como antes do cache. */
const payKeyOf = (articleId: string, keywordId: string, lens: SerpCacheLens) => `${articleId}\u0000${keywordId}\u0000${serpCacheLensLabel(lens)}`;
/**
 * A identidade de uma consulta paga numa LENTE EXTRA: a própria consulta
 * (keyword × lente × códigos). A mesma keyword em dois artigos do lote é UMA
 * chamada — o digest é o mesmo, e cada artigo o lê com a sua identidade.
 */
const extraPayKeyOf = (subjectId: string) => `extra\u0000${subjectId}`;

export async function POST(request: Request) {
  const diagnostic = createSerpDiagnostic(crypto.randomUUID());
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido de SERP inválido.", issues: parsed.error.flatten() }, { status: 400 });
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    const groups = parsed.data.groups;
    const totalKeywords = groups.reduce((total, group) => total + group.keywords.length, 0) + parsed.data.siloCandidates.length;
    if (groups.some(group => group.keywords.length !== group.keywordIds.length)) {
      return NextResponse.json({ success: false, error: "O grupo contém keywords divergentes entre IDs e objetos." }, { status: 422 });
    }
    const operationRequestId = diagnostic.correlationId;
    // Um único instante por requisição: validade do cache e `collectedAt` das faltas pagas.
    const now = new Date();
    /*
     * AS QUATRO LENTES (adendo A3). A lente principal — a canônica sempre que
     * pedida — é lida em corpo e gera os snapshots do parecer e do ArticleDNA,
     * como antes. As extras são lidas pelo digest orgânico, nunca em corpo, e
     * só votam a convergência dos pares.
     */
    const requested = resolveRequestedSerpLenses({ lenses: parsed.data.lenses, device: parsed.data.device });
    const lens = requested.primary;
    const lensLabels = requested.lenses.map(serpCacheLensLabel);
    diagnostic.stage = "connection_resolution";
    // Os MESMOS códigos que a config resolvida terá (`buildDataForSeoSerpConfig`
    // lê este leitor), obtidos sem tocar credencial: a chave precisa deles
    // antes de a quota ser avaliada.
    const targetCodes = readDataForSeoTargetCodes();

    const siloCandidateKeywords = parsed.data.siloCandidates.filter(keyword => keyword.siloCandidate?.status === "candidate");
    const potentialKeywords = [...groups.flatMap(group => group.keywords), ...siloCandidateKeywords];

    /*
     * OS CÓDIGOS DO MINERADOR (A8). Keyword do acervo da marca ativa usa os
     * códigos que o Minerador usaria para ela — pelo resolvedor dele, a partir
     * do targeting da última medição, lido aqui no servidor e filtrado pela
     * marca. Falha de leitura: tudo segue com os códigos do ambiente.
     */
    const targeting = await readMineradorKeywordTargetCodes(pipelineContext.supabase, pipelineContext.brandId, potentialKeywords.map(keyword => String(keyword.id)), targetCodes);
    diagnostic.targetingReadFailed = targeting.readFailed;
    const usesEnvironmentCodes = (keywordId: string) => !targeting.codes.has(keywordId);
    const codesFor = (keywordId: string) => serpTargetCodesFor(targeting.codes, keywordId, targetCodes);
    const cacheRequestFor = (keyword: { id: string; keyword: string }, codes = codesFor(String(keyword.id)), requestLens = lens) => formationSerpCacheRequest({
      keyword: keyword.keyword, keywordId: String(keyword.id), depth: parsed.data.resultLimit, lens: requestLens, codes,
    });

    /** Perfil de validação e Principal de cada grupo: decidem o que é condicional ANTES de qualquer SERP. */
    const groupProfileOf = (group: typeof groups[number]) => {
      const principalId = group.principalSuggestion.keywordId;
      const principal = group.keywords.find(keyword => keyword.id === principalId);
      const identityContext = resolveArticleSerpIdentityContext({
        published: Boolean(group.publishedAnchorId),
        principalKeywordId: principalId,
        primaryKeywordPolicy: principal?.primaryKeywordPolicy,
        keywordUrlRelation: principal?.keywordUrlRelation,
        architectureStatus: group.architectureStatus || principal?.architectureStatus,
        kgrIdentity: group.kgrIdentity || principal?.kgrIdentity,
        slug: principal?.slug_sugerido,
      });
      return { principalId, principal, identityContext, validationProfile: resolveSerpValidationProfile(identityContext.mode, identityContext.kgrIdentityProtected) };
    };

    /*
     * CACHE ANTES DA QUOTA.
     *
     * Cada keyword de cada grupo era paga de novo aqui, embora o Minerador já
     * tivesse pago a mesma SERP desktop-windows `advanced` com profundidade 20
     * — que atende o pedido de 10. A leitura é em modo `meta` (sem corpo, R8):
     * só decide quem falta. O corpo trafega depois, e só para a keyword que a
     * rota de fato normaliza — a secundária de um KGR leve pode nem ser lida.
     *
     * As lentes extras entram na mesma leitura `meta`, só para os grupos com
     * mais de uma busca: num artigo de uma busca só não há par a comparar, e
     * pagar outra lente não mudaria o parecer.
     */
    const extraSlotsWanted = groups.flatMap(group => {
      if (group.keywords.length < 2) return [];
      const articleId = group.publishedAnchorId || group.id;
      return group.keywords.flatMap(keyword => requested.extras.map(extraLens => ({ group, articleId, keyword, extraLens })));
    });
    let metaLookups: SerpCacheLookup[];
    let extraMetaLookups: SerpCacheLookup[];
    try {
      metaLookups = await lookupSerpCache(pipelineContext, potentialKeywords.map(keyword => cacheRequestFor(keyword)), { mode: "meta", now });
      extraMetaLookups = extraSlotsWanted.length
        ? await lookupSerpCache(pipelineContext, extraSlotsWanted.map(item => cacheRequestFor(item.keyword, undefined, item.extraLens)), { mode: "meta", now })
        : [];
    } catch (error) {
      // Cache fora nunca derruba a operação: tudo vira falta e é pago como antes.
      diagnostic.cacheReadFailed = true;
      console.warn("[arquiteto/serp] leitura do cache de SERP falhou; seguindo sem cache", {
        correlationId: diagnostic.correlationId, error: error instanceof Error ? error.message.slice(0, 300) : "falha desconhecida",
      });
      metaLookups = potentialKeywords.map(keyword => {
        const cacheRequest = cacheRequestFor(keyword);
        return { request: cacheRequest, subjectId: serpCacheSubjectId(cacheRequest.query), hit: null, missReason: "cache indisponível" };
      });
      extraMetaLookups = extraSlotsWanted.map(item => {
        const cacheRequest = cacheRequestFor(item.keyword, undefined, item.extraLens);
        return { request: cacheRequest, subjectId: serpCacheSubjectId(cacheRequest.query), hit: null, missReason: "cache indisponível" };
      });
    }

    /*
     * O PLANO DE CHAMADAS PAGAS (A6). Uma consulta por keyword × lente. A
     * Principal é sempre paga se faltar; no KGR leve, as outras buscas — e as
     * lentes extras da própria Principal — só se ela for ambígua: entram como
     * teto, ditas condicionais.
     */
    const slots: SerpPlanSlot[] = [];
    // A entrada da lente principal de cada consulta: é ela que a recoleta pedida deixa de usar.
    const primarySubjectByPayKey = new Map<string, string>();
    let cursor = 0;
    for (const group of groups) {
      const articleId = group.publishedAnchorId || group.id;
      const { principalId, validationProfile } = groupProfileOf(group);
      const kgrLight = validationProfile === "kgr_light";
      for (const keyword of group.keywords) {
        const lookup = metaLookups[cursor];
        cursor += 1;
        const payKey = payKeyOf(articleId, String(keyword.id), lens);
        if (lookup) primarySubjectByPayKey.set(payKey, lookup.subjectId);
        slots.push({
          payKey, dateGroup: String(keyword.id), lens, primary: true,
          conditional: kgrLight && keyword.id !== principalId, payable: true,
          hitCollectedAt: lookup?.hit?.meta.collectedAt ?? null, missReason: lookup?.missReason ?? null,
        });
      }
    }
    for (const keyword of siloCandidateKeywords) {
      const lookup = metaLookups[cursor];
      cursor += 1;
      const payKey = payKeyOf(`silo-candidate:${keyword.id}`, String(keyword.id), lens);
      if (lookup) primarySubjectByPayKey.set(payKey, lookup.subjectId);
      slots.push({
        payKey, dateGroup: String(keyword.id), lens, primary: true,
        conditional: false, payable: true, hitCollectedAt: lookup?.hit?.meta.collectedAt ?? null, missReason: lookup?.missReason ?? null,
      });
    }
    extraSlotsWanted.forEach((item, index) => {
      const lookup = extraMetaLookups[index];
      const { validationProfile } = groupProfileOf(item.group);
      slots.push({
        payKey: extraPayKeyOf(serpCacheSubjectId(cacheRequestFor(item.keyword, undefined, item.extraLens).query)), dateGroup: String(item.keyword.id), lens: item.extraLens, primary: false,
        conditional: validationProfile === "kgr_light", payable: true,
        hitCollectedAt: lookup?.hit?.meta.collectedAt ?? null, missReason: lookup?.missReason ?? null,
      });
    });
    const planInput = {
      lenses: requested.lenses, slots,
      payMissingExtraLenses: parsed.data.payMissingExtraLenses,
      recollectStaleLenses: parsed.data.recollectStaleLenses,
    };
    const plan = buildSerpPaidPlan(planInput);

    // O plano não paga, não resolve credencial e não lê corpo.
    if (parsed.data.mode === "plan") {
      return NextResponse.json({ success: true, data: { mode: "plan", plan, lenses: lensLabels, requestedKeywordCount: totalKeywords }, diagnostic });
    }
    const authorization = authorizeSerpPaidPlan(plan, parsed.data.authorizedPaidQueries);
    if (!authorization.ok) {
      // Nada foi pago: o plano de agora vai junto, para a pessoa decidir de novo.
      return NextResponse.json({ success: false, error: authorization.message, code: authorization.code, data: { plan, lenses: lensLabels }, diagnostic }, { status: 409 });
    }
    /*
     * Toda chamada paga consome o orçamento autorizado; esgotado, nada mais é
     * pago. Cada falta PLANEJADA tem a sua vaga reservada: um acerto que
     * degrada em falta num artigo só usa a sobra, e nunca deixa sem vaga a
     * falta planejada de outro artigo que corre em paralelo.
     */
    const budget = createPaidQueryBudget(parsed.data.authorizedPaidQueries, serpPaidPlanKeys(planInput));
    // Lentes antigas pelo portão de datas: só recoletadas quando a pessoa pediu.
    const recollectKeys = parsed.data.recollectStaleLenses ? staleSlotKeys(slots) : new Set<string>();
    const recollectSubjects = new Set([...recollectKeys].map(payKey => primarySubjectByPayKey.get(payKey)).filter((subjectId): subjectId is string => Boolean(subjectId)));

    const cachedMeta = new Map<string, SerpCacheMeta>();
    for (const lookup of metaLookups) if (lookup.hit && !recollectSubjects.has(lookup.subjectId)) cachedMeta.set(lookup.subjectId, lookup.hit.meta);
    // Teto, não previsão: a secundária de um KGR leve pode não ser consultada.
    const potentialMisses = plan.paidQueries;

    // Cai para `false` se a config resolvida divergir dos códigos da chave.
    let cacheCodesMatch = true;
    const resolveDataForSeo = async (quotaUnits: number): Promise<DataForSeoResolution> => {
      const resolution = await resolveDataForSeoCompatibilityConfig({
        actorUserId: pipelineContext.actorUserId,
        brandId: pipelineContext.brandId,
        client: pipelineContext.supabase,
        quotaUnits,
      });
      diagnostic.connectionResolved = true;
      if (!formationSerpCodesMatch(targetCodes, resolution.config) && cacheCodesMatch) {
        /*
         * A chave das keywords SEM targeting do Minerador foi montada com
         * códigos que a config não enviaria: nenhuma entrada lida para elas
         * descreve a SERP que esta rota pediria. Daqui em diante elas são
         * pagas — e gravadas com os códigos de fato enviados. As keywords com
         * os códigos do Minerador não mudam: a chave delas é o que vai ao
         * provider. O orçamento autorizado continua sendo o teto.
         */
        cacheCodesMatch = false;
        quota.expectAtLeast(potentialKeywords.length - diagnostic.cacheHits);
        console.warn("[arquiteto/serp] localidade/idioma da config divergem da chave do cache; acertos descartados", {
          correlationId: diagnostic.correlationId, discardedHits: cachedMeta.size,
        });
      }
      return resolution;
    };
    /*
     * A quota cobre toda chamada paga PREVISTA, não só as faltas da leitura
     * meta: um acerto que degrada em falta (lote de corpos que lança, entrada
     * sumida, corpo que não normaliza) soma à previsão, e a quota é avaliada
     * de novo antes de pagá-lo. Sem isso, um lote de 20 principais degradado
     * seria pago com a quota avaliada para 0 ou 1 unidade.
     */
    const quota = createFormationSerpQuotaLedger(resolveDataForSeo);
    quota.expectMisses(potentialMisses);
    // A quota recusa zero unidade: com tudo em cache, nem o Secret Store é lido.
    if (potentialMisses > 0) await quota.ensureCovered();

    const recordSerpUsage = async (resolution: DataForSeoResolution, input: { articleId: string; keywordId: string; lens?: string; resultStatus: "succeeded" | "failed"; errorCode?: string | null }) => recordIntegrationUsage({
      resource: resolution.resource,
      operation: "module_operation",
      module: "arquiteto",
      resultStatus: input.resultStatus,
      units: 1,
      errorCode: input.errorCode || null,
      idempotencyKey: `dataforseo:serp_validation:${operationRequestId}:${input.articleId}:${input.keywordId}${input.lens ? `:${input.lens}` : ""}`,
      metadata: {
        operationRequestId,
        operationKind: "serp_validation",
        articleId: input.articleId,
        keywordId: input.keywordId,
        ...(input.lens ? { lens: input.lens } : {}),
      },
    });

    /** A chave de uma keyword serve nesta execução? A das keywords com códigos do ambiente depende da config. */
    const keyServes = (keywordId: string) => cacheCodesMatch || !usesEnvironmentCodes(keywordId);

    /**
     * Os corpos dos acertos, lidos só quando a rota vai normalizá-los — uma
     * consulta para um lote de keywords, nunca uma por keyword.
     */
    const readCachedBodies = async (keywords: readonly { id: string; keyword: string }[]): Promise<Map<string, CachedSerpBody>> => {
      const found = new Map<string, CachedSerpBody>();
      const cacheRequests = keywords.filter(keyword => keyServes(String(keyword.id))).map(keyword => cacheRequestFor(keyword)).filter(cacheRequest => cachedMeta.has(serpCacheSubjectId(cacheRequest.query)));
      if (!cacheRequests.length) return found;
      // Contado por pedido, não pelo mapa: a mesma keyword em dois grupos são duas chamadas.
      let servedRequests = 0;
      try {
        const lookups = await lookupSerpCache(pipelineContext, cacheRequests, { mode: "body", now });
        for (const lookup of lookups) {
          if (!lookup.hit?.body) continue;
          found.set(lookup.subjectId, { meta: lookup.hit.meta, body: lookup.hit.body });
          servedRequests += 1;
        }
      } catch (error) {
        diagnostic.cacheReadFailed = true;
        console.warn("[arquiteto/serp] leitura do corpo em cache falhou; as keywords serão pagas", {
          correlationId: diagnostic.correlationId, error: error instanceof Error ? error.message.slice(0, 300) : "falha desconhecida",
        });
      }
      // Acerto meta sem corpo vira chamada paga: a quota é reavaliada para o lote antes de pagar.
      const degradedHits = cacheRequests.length - servedRequests;
      if (degradedHits > 0) {
        quota.expectMisses(degradedHits);
        await quota.ensureCovered();
      }
      return found;
    };

    /** A resposta do provider chegou: diagnóstico saneado aplicado e a chamada contada como paga. */
    const markProviderResponse = (queryDiagnostic: SerpQueryDiagnostic, providerDiagnostic: DataForSeoSerpProviderDiagnostic) => {
      applyProviderDiagnostic(diagnostic, queryDiagnostic, providerDiagnostic);
      if (queryDiagnostic.source === "provider") return;
      diagnostic.paidQueries += 1;
      queryDiagnostic.source = "provider";
    };

    /**
     * FALTA: paga UMA SERP, grava no cache e normaliza o corpo CRU — o mesmo
     * que `collectDataForSeoCompatibilitySnapshot` normalizava antes do cache.
     * O uso só é registrado aqui: acerto de cache não é chamada paga.
     */
    const payKeywordSerp = async (input: { articleId: string; keywordId: string; serpInput: SerpSearchInput; queryDiagnostic: SerpQueryDiagnostic }): Promise<SerpResearchSnapshot> => {
      const { queryDiagnostic } = input;
      // Fora do plano autorizado, nada é pago: a unidade falha dizendo por quê.
      if (!budget.take(payKeyOf(input.articleId, input.keywordId, lens))) {
        queryDiagnostic.internalCode = "SERP_PAID_NOT_AUTHORIZED";
        throw new SerpPaidBudgetExhaustedError();
      }
      try {
        // Toda falta chega aqui já prevista no livro: sem reavaliação, isto só devolve a resolução.
        const resolution = await quota.ensureCovered();
        diagnostic.stage = "provider_request";
        // A chave é o que vai ao provider: os códigos do Minerador para a keyword
        // que os tem; para as outras, os da config resolvida.
        // A canônica é paga com 20, a profundidade da CALL 3 do Minerador:
        // com 10, a entrada gravada aqui obrigaria o Minerador a pagar de novo.
        const cacheRequest = architectSerpCollectionRequest(cacheRequestFor({ id: input.keywordId, keyword: input.serpInput.keyword }, usesEnvironmentCodes(input.keywordId) ? {
          locationCode: resolution.config.locationCode, languageCode: resolution.config.languageCode,
        } : codesFor(input.keywordId)));
        const collection = await collectAndCacheSerp(pipelineContext, cacheRequest, {
          config: resolution.config,
          operationRequestId,
          collectedBy: "arquiteto",
          now,
          provider: {
            onRequestBuilt: () => { queryDiagnostic.requestBuilt = true; diagnostic.requestBuilt = true; },
            onRequestStarted: () => { queryDiagnostic.apiRequestStarted = true; diagnostic.apiRequestStarted = true; },
            onHttpResponse: (httpStatus) => { queryDiagnostic.httpStatus = httpStatus; diagnostic.httpStatus = httpStatus; },
          },
        });
        /*
         * Toda resposta 2xx com JSON chega aqui, inclusive a task recusada: o
         * núcleo não lança nela (devolve `observation: null`). O diagnóstico do
         * provider é aplicado ANTES de normalizar, que é quem recusa.
         */
        // Recortado à profundidade do pedido, como o acerto: pagar mais fundo não muda o parecer.
        const requestedBody = serpBodyAtRequestedDepth(collection.body, collection.meta.depth, input.serpInput.resultLimit);
        // As contagens do diagnóstico são as do corpo recortado, como no acerto.
        markProviderResponse(queryDiagnostic, providerDiagnosticAtRequestedDepth(collection.diagnostic, collection.body, requestedBody));
        if (collection.write === "failed") {
          // A SERP já está na mão; o cache só não guardou desta vez.
          console.warn("[arquiteto/serp] gravação do cache de SERP falhou", {
            correlationId: diagnostic.correlationId, keywordId: input.keywordId, error: collection.writeError?.slice(0, 300) || null,
          });
        }
        const snapshot = normalizeDataForSeoSerpResponse(requestedBody, input.serpInput, { locationCode: cacheRequest.query.locationCode, languageCode: cacheRequest.query.languageCode }, collection.meta.collectedAt, collection.providerRequestId);
        queryDiagnostic.normalizationSucceeded = true;
        diagnostic.normalizationSucceeded = true;
        queryDiagnostic.internalCode = diagnosticCodeFor(queryDiagnostic);
        await recordSerpUsage(resolution, { articleId: input.articleId, keywordId: input.keywordId, resultStatus: "succeeded" });
        quota.recordSucceeded();
        return snapshot;
      } catch (error) {
        queryDiagnostic.internalCode = diagnosticCodeFor(queryDiagnostic);
        if (error instanceof DataForSeoSerpError) {
          queryDiagnostic.internalCode = error.code === "dataforseo_task_failed"
            ? "SERP_TASK_ERROR"
            : error.code === "dataforseo_http" || error.code === "dataforseo_timeout"
              ? "SERP_PROVIDER_RESPONSE_ERROR"
              : "SERP_NORMALIZATION_FAILED";
          if (quota.resolution) await recordSerpUsage(quota.resolution, { articleId: input.articleId, keywordId: input.keywordId, resultStatus: "failed", errorCode: error.code });
        }
        throw error;
      }
    };

    /**
     * ACERTO: normaliza o corpo gravado com a proveniência da coleta original.
     * Devolve `null` quando o corpo não normaliza — um corpo ruim no cache não
     * pode reprovar o artigo por 30 dias; a keyword é paga como antes.
     */
    const serveFromCache = (input: { keywordId: string; serpInput: SerpSearchInput; queryDiagnostic: SerpQueryDiagnostic; cached: CachedSerpBody }): SerpResearchSnapshot | null => {
      const { queryDiagnostic, cached } = input;
      try {
        const snapshot = normalizeCachedFormationSerp(cached.body, input.serpInput, cached.meta);
        // Sem HTTP nesta execução: `httpStatus` fica nulo, as contagens são as do corpo gravado.
        Object.assign(queryDiagnostic, inspectDataForSeoSerpResponse(cached.body, null, cached.meta.providerRequestId));
        queryDiagnostic.source = "cache";
        queryDiagnostic.normalizationSucceeded = true;
        queryDiagnostic.internalCode = null;
        diagnostic.normalizationSucceeded = true;
        diagnostic.cacheHits += 1;
        return snapshot;
      } catch (error) {
        console.warn("[arquiteto/serp] corpo em cache não normalizou; a keyword será paga", {
          correlationId: diagnostic.correlationId, keywordId: input.keywordId, error: error instanceof Error ? error.message.slice(0, 300) : "falha desconhecida",
        });
        return null;
      }
    };

    const obtainKeywordSerp = async (input: { articleId: string; keywordId: string; serpInput: SerpSearchInput; queryDiagnostic: SerpQueryDiagnostic; cachedBodies: ReadonlyMap<string, CachedSerpBody> }) => {
      const subjectId = serpCacheSubjectId(cacheRequestFor({ id: input.keywordId, keyword: input.serpInput.keyword }).query);
      const cached = keyServes(input.keywordId) ? input.cachedBodies.get(subjectId) : undefined;
      const fromCache = cached ? serveFromCache({ ...input, cached }) : null;
      if (fromCache) return fromCache;
      // Corpo gravado que não normaliza: um acerto que vira chamada paga entra na previsão da quota.
      if (cached) quota.expectMisses(1);
      return payKeywordSerp(input);
    };

    /**
     * LENTE EXTRA QUE FALTA: paga UMA SERP nela, SEM corpo (`storeBody: false`
     * — ninguém relê o corpo de uma extra) e com o digest que o núcleo grava em
     * toda lente não canônica. O parecer lê o MESMO digest que um acerto futuro
     * leria. Devolve o snapshot normalizado do digest, ou o motivo da falta.
     */
    type ExtraLensCollection =
      | { digest: NonNullable<Awaited<ReturnType<typeof collectAndCacheSerp>>["digest"]>; locationCode: number; languageCode: string; collectedAt: string; providerRequestId: string | null }
      | { missing: "não paga" | "falha"; detail: string };
    /*
     * A coleta de cada consulta extra, uma vez por requisição: a mesma keyword
     * em dois artigos do lote espera a MESMA chamada em vez de pagar outra.
     */
    const extraCollections = new Map<string, Promise<ExtraLensCollection>>();
    const collectExtraLens = async (input: { payKey: string; articleId: string; keyword: { id: string; keyword: string }; extraLens: SerpCacheLens }): Promise<ExtraLensCollection> => {
      if (!budget.take(input.payKey)) return { missing: "não paga", detail: "Fora do plano de chamadas autorizado." };
      const keywordId = String(input.keyword.id);
      try {
        const resolution = await quota.ensureCovered();
        const cacheRequest = architectSerpCollectionRequest(cacheRequestFor(input.keyword, usesEnvironmentCodes(keywordId) ? {
          locationCode: resolution.config.locationCode, languageCode: resolution.config.languageCode,
        } : codesFor(keywordId), input.extraLens));
        const collection = await collectAndCacheSerp(pipelineContext, cacheRequest, {
          config: resolution.config,
          operationRequestId,
          collectedBy: "arquiteto",
          now,
          storeBody: architectSerpStoresBody(input.extraLens),
        });
        diagnostic.paidQueries += 1;
        diagnostic.extraLensPaidQueries += 1;
        if (collection.write === "failed") {
          console.warn("[arquiteto/serp] gravação do cache de SERP (lente extra) falhou", {
            correlationId: diagnostic.correlationId, keywordId, lens: serpCacheLensLabel(input.extraLens), error: collection.writeError?.slice(0, 300) || null,
          });
        }
        if (!collection.digest) {
          await recordSerpUsage(resolution, { articleId: input.articleId, keywordId, lens: serpCacheLensLabel(input.extraLens), resultStatus: "failed", errorCode: "SERP_LENS_REFUSED" });
          return { missing: "falha", detail: (collection.observationError || "A resposta do provider não é uma SERP.").slice(0, 200) };
        }
        await recordSerpUsage(resolution, { articleId: input.articleId, keywordId, lens: serpCacheLensLabel(input.extraLens), resultStatus: "succeeded" });
        quota.recordSucceeded();
        return {
          digest: collection.digest, locationCode: cacheRequest.query.locationCode, languageCode: cacheRequest.query.languageCode,
          collectedAt: collection.meta.collectedAt, providerRequestId: collection.providerRequestId,
        };
      } catch (error) {
        // Erro compartilhado (conexão, credencial, quota) encerra o lote como antes.
        if (error instanceof DataForSeoCanonicalError || error instanceof IntegrationRuntimeError) throw error;
        if (error instanceof DataForSeoSerpError && quota.resolution) {
          await recordSerpUsage(quota.resolution, { articleId: input.articleId, keywordId, lens: serpCacheLensLabel(input.extraLens), resultStatus: "failed", errorCode: error.code });
        }
        return { missing: "falha", detail: error instanceof Error ? error.message.slice(0, 200) : "Falha ao consultar a lente." };
      }
    };
    const payExtraLensDigest = async (input: { payKey: string; articleId: string; keyword: { id: string; keyword: string }; extraLens: SerpCacheLens; serpInput: SerpSearchInput }): Promise<{ snapshot: SerpResearchSnapshot } | { missing: "não paga" | "falha"; detail: string }> => {
      let collection = extraCollections.get(input.payKey);
      if (!collection) {
        collection = collectExtraLens(input);
        extraCollections.set(input.payKey, collection);
      }
      const collected = await collection;
      if ("missing" in collected) return collected;
      // Cada artigo lê o digest pago com a SUA identidade (artigo, versão, keyword).
      try {
        return { snapshot: normalizeOrganicDigestSerp(collected.digest, input.serpInput, collected) };
      } catch (error) {
        return { missing: "falha", detail: error instanceof Error ? error.message.slice(0, 200) : "O digest pago não normalizou." };
      }
    };

    /**
     * As lentes extras das buscas OBSERVADAS de um artigo: digest do cache
     * primeiro (uma leitura por artigo), e só a falta é paga — se a pessoa
     * autorizou. Entrada extra gravada antes do digest não é paga de novo:
     * fica "sem digest". Lente faltante nunca vira "de fora": só não vota.
     */
    const readExtraLenses = async (input: { articleId: string; articleDnaVersionId: string; observed: readonly { id: string; keyword: string }[] }): Promise<ArticleExtraLenses> => {
      const result: ArticleExtraLenses = { extras: [], missing: [], collectedAtByLens: new Map(), collectedAtByKeyword: new Map() };
      const pedidos = input.observed.flatMap(keyword => requested.extras.map(extraLens => ({ keyword, extraLens, request: cacheRequestFor(keyword, undefined, extraLens) })));
      let lookups: SerpCacheLookup[];
      try {
        lookups = await lookupSerpCache(pipelineContext, pedidos.map(item => item.request), { mode: "digest", now });
      } catch (error) {
        diagnostic.cacheReadFailed = true;
        console.warn("[arquiteto/serp] leitura do digest das lentes extras falhou; as faltas seguem o plano", {
          correlationId: diagnostic.correlationId, error: error instanceof Error ? error.message.slice(0, 300) : "falha desconhecida",
        });
        lookups = pedidos.map(item => ({ request: item.request, subjectId: serpCacheSubjectId(item.request.query), hit: null, missReason: "cache indisponível" }));
      }
      const porLente = new Map<string, KeywordSerpFacts[]>(requested.extras.map(extraLens => [serpCacheLensLabel(extraLens), []]));
      for (const [index, item] of pedidos.entries()) {
        const lookup = lookups[index];
        const keywordId = String(item.keyword.id);
        const label = serpCacheLensLabel(item.extraLens);
        const lensDiagnostic: ExtraLensQueryDiagnostic = { articleId: input.articleId, keywordId, lens: label, source: null, missing: null };
        diagnostic.extraLensQueries.push(lensDiagnostic);
        const serpInput: SerpSearchInput = {
          brandId: parsed.data.brandId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId, keywordId,
          keywordDnaVersionId: `lens:${label}:${keywordId}`, keyword: item.keyword.keyword,
          location: parsed.data.location, language: parsed.data.language,
          device: item.extraLens.device, operatingSystem: item.extraLens.operatingSystem,
          expectedIntent: "", expectedFormat: "", requiredTopics: [item.keyword.keyword], articleEntities: [],
          resultLimit: parsed.data.resultLimit, version: 1, previousSnapshotId: null,
        };
        // A lente antiga só é trocada quando a pessoa pediu a recoleta E aceitou pagar extras.
        const extraPayKey = extraPayKeyOf(serpCacheSubjectId(item.request.query));
        const stale = parsed.data.payMissingExtraLenses && recollectKeys.has(extraPayKey);
        let snapshot: SerpResearchSnapshot | null = null;
        if (lookup?.hit && keyServes(keywordId) && !stale) {
          if (!lookup.hit.digest) {
            lensDiagnostic.missing = "sem digest";
            result.missing.push({ lens: label, keywordId, reason: "sem digest", detail: "Entrada gravada antes do digest orgânico; não é paga de novo sem pedido." });
            continue;
          }
          try {
            snapshot = normalizeOrganicDigestSerp(lookup.hit.digest, serpInput, lookup.hit.meta);
            lensDiagnostic.source = "cache";
            diagnostic.extraLensCacheHits += 1;
          } catch {
            lensDiagnostic.missing = "falha";
            result.missing.push({ lens: label, keywordId, reason: "falha", detail: "O digest gravado não normalizou." });
            continue;
          }
        } else if (!parsed.data.payMissingExtraLenses) {
          lensDiagnostic.missing = "não paga";
          result.missing.push({ lens: label, keywordId, reason: "não paga", detail: "A validação foi pedida só com as lentes em cache." });
          continue;
        } else {
          const paga = await payExtraLensDigest({ payKey: extraPayKey, articleId: input.articleId, keyword: item.keyword, extraLens: item.extraLens, serpInput });
          if ("missing" in paga) {
            lensDiagnostic.missing = paga.missing;
            result.missing.push({ lens: label, keywordId, reason: paga.missing, detail: paga.detail });
            continue;
          }
          snapshot = paga.snapshot;
          lensDiagnostic.source = "provider";
        }
        porLente.get(label)?.push({ keywordId, keyword: item.keyword.keyword, role: "secundaria", results: serpResultFactsOf(snapshot) });
        result.collectedAtByLens.set(label, [...(result.collectedAtByLens.get(label) || []), snapshot.collectedAt]);
        result.collectedAtByKeyword.set(keywordId, [...(result.collectedAtByKeyword.get(keywordId) || []), snapshot.collectedAt]);
      }
      result.extras = [...porLente.entries()].map(([label, members]) => ({ lens: label, members }));
      return result;
    };

    const extraLensesByArticle = new Map<string, ArticleExtraLenses>();

    // A principal de todo grupo é sempre normalizada: uma leitura só para todas.
    const principalBodies = await readCachedBodies(groups.flatMap(group => group.keywords.filter(keyword => keyword.id === group.principalSuggestion.keywordId)));
    const settledAssessments = await Promise.allSettled(groups.map(async group => {
      const articleId = group.publishedAnchorId || group.id;
      const articleDnaVersionId = parsed.data.articleDnaVersionIds?.[articleId] || `work:${articleId}`;
      const { principalId, identityContext, validationProfile } = groupProfileOf(group);
      const references = group.keywords.map(keyword => articleKeywordReference(keyword,
        keyword.id === principalId ? "principal" : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria", parsed.data.brandId));
      const collect = async (keyword: typeof group.keywords[number], index: number, cachedBodies: ReadonlyMap<string, CachedSerpBody>) => {
        const queryDiagnostic = emptyQueryDiagnostic(keyword.id);
        diagnostic.queries.push(queryDiagnostic);
        const reference = references[index];
        if (!reference) throw new Error(`Referência ausente para ${keyword.id}.`);
        const serpInput: SerpSearchInput = {
          brandId: parsed.data.brandId, articleId, articleDnaVersionId, keywordId: keyword.id,
          keywordDnaVersionId: reference.keywordDnaVersionId, keyword: keyword.keyword,
          location: parsed.data.location, language: parsed.data.language,
          // A lente enviada ao provider — e só ela — fica registrada no snapshot.
          device: lens.device, operatingSystem: lens.operatingSystem,
          expectedIntent: normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal), expectedFormat: explicitEditorialFormat(keyword) || "",
          requiredTopics: [keyword.keyword], articleEntities: [], resultLimit: parsed.data.resultLimit,
          version: 1, previousSnapshotId: null,
        };
        try {
          return await obtainKeywordSerp({ articleId, keywordId: keyword.id, serpInput, queryDiagnostic, cachedBodies });
        } catch (error) {
          diagnostic.normalizationSucceeded = false;
          diagnostic.internalCode = queryDiagnostic.internalCode || "SERP_NORMALIZATION_FAILED";
          diagnostic.stage = queryDiagnostic.normalizationSucceeded ? "assessment" : "response_normalization";
          throw error;
        }
      };
      const principalIndex = group.keywords.findIndex(keyword => keyword.id === principalId);
      if (principalIndex < 0) throw new Error("KeywordDNA principal ausente no grupo.");
      const principalSnapshot = await collect(group.keywords[principalIndex], principalIndex, principalBodies);
      const snapshots = [principalSnapshot];
      const principalAmbiguous = principalSnapshot.diagnostic.verdict === "possivel_conflito"
        || principalSnapshot.diagnostic.verdict === "parcialmente_coerente"
        || principalSnapshot.diagnostic.verdict === "informacao_insuficiente"
        || principalSnapshot.diagnostic.confidence === "low"
        || principalSnapshot.diagnostic.confidence === "insufficient";
      if (validationProfile !== "kgr_light" || principalAmbiguous) {
        // Uma leitura de corpos para todas as secundárias e reforços do grupo.
        const secondaryBodies = await readCachedBodies(group.keywords.filter((_, index) => index !== principalIndex));
        const secondarySnapshots = await Promise.all(group.keywords.map((keyword, index) => index === principalIndex ? null : collect(keyword, index, secondaryBodies)));
        snapshots.push(...secondarySnapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot)));
      }
      /*
       * AS LENTES EXTRAS votam só onde há par: com uma busca observada, outra
       * lente não mudaria o parecer, e nada é lido nem pago por ela.
       */
      if (requested.extras.length && snapshots.length >= 2) {
        const observed = snapshots.map(snapshot => group.keywords.find(keyword => keyword.id === snapshot.keywordId)).filter((keyword): keyword is NonNullable<typeof keyword> => Boolean(keyword));
        extraLensesByArticle.set(articleId, await readExtraLenses({ articleId, articleDnaVersionId, observed }));
      }
      const keywordDnaReferences = references.map(reference => reference.keywordDnaSnapshot).filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
      if (keywordDnaReferences.length !== references.length) throw new Error("KeywordDNA integral ausente na formação do assessment.");
      const previous = parsed.data.previousAssessments?.[articleId];
      return buildSerpFormationAssessment({ brandId: parsed.data.brandId, articleId, articleDnaVersionId, createdBy: profile.userId,
        previousVersionId: previous?.id || null, previousVersion: previous?.version || 0,
        principalKeywordId: principalId, assessmentMode: identityContext.mode, validationProfile, keywordReferences: references, keywordDnaReferences, snapshots,
        queriedKeywordDnaIds: snapshots.map(snapshot => snapshot.keywordId),
        // A evidência nasce dizendo qual composição observou.
        formationBaseHash: parsed.data.formationBaseHashes?.[articleId] || null });
    }));

    // Erro compartilhado (conexão, credencial, capability, quota) encerra o
    // lote; falha específica de um Article preserva os assessments válidos.
    const assessments: Awaited<ReturnType<typeof buildSerpFormationAssessment>>[] = [];
    const failures: SerpArticleFailure[] = [];
    settledAssessments.forEach((settled, index) => {
      const group = groups[index];
      if (settled.status === "fulfilled") {
        assessments.push(settled.value);
        return;
      }
      const error = settled.reason;
      if (error instanceof DataForSeoCanonicalError || error instanceof IntegrationRuntimeError) throw error;
      failures.push(describeArticleFailure({
        articleId: group.publishedAnchorId || group.id,
        principalKeywordId: group.principalSuggestion.keywordId,
        keywordIds: group.keywords.map(keyword => keyword.id),
        error,
        diagnostic,
      }));
    });
    // Uma leitura de corpos para todas as candidatas a silo.
    const candidateBodies = await readCachedBodies(siloCandidateKeywords);
    const siloCandidateEvidence = await Promise.all(siloCandidateKeywords
      .map(async keyword => {
        const articleId = `silo-candidate:${keyword.id}`;
        const articleDnaVersionId = `work:${articleId}`;
        const keywordDnaSnapshot = buildKeywordDnaProvenanceSnapshot(keyword, { brandId: parsed.data.brandId });
        const queryDiagnostic = emptyQueryDiagnostic(keyword.id);
        diagnostic.queries.push(queryDiagnostic);
        try {
          const snapshot = await obtainKeywordSerp({
            articleId,
            keywordId: keyword.id,
            queryDiagnostic,
            cachedBodies: candidateBodies,
            serpInput: {
              brandId: parsed.data.brandId, articleId, articleDnaVersionId, keywordId: keyword.id,
              keywordDnaVersionId: keywordDnaSnapshot.versionReference.versionId, keyword: keyword.keyword,
              location: parsed.data.location, language: parsed.data.language,
              device: lens.device, operatingSystem: lens.operatingSystem,
              expectedIntent: normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal),
              expectedFormat: explicitEditorialFormat(keyword) || "", requiredTopics: [keyword.keyword], articleEntities: [],
              resultLimit: parsed.data.resultLimit, version: 1, previousSnapshotId: null,
            },
          });
          return buildSiloCandidateSerpEvidence({ brandId: parsed.data.brandId, createdBy: profile.userId, keywordDnaSnapshot, snapshot });
        } catch {
          // O código da falha já está no diagnóstico da consulta; a candidata segue sem evidência, como antes.
          return buildSiloCandidateSerpEvidence({ brandId: parsed.data.brandId, createdBy: profile.userId, keywordDnaSnapshot, snapshot: null });
        }
      }));
    /**
     * A evidência vira artefato remoto ANTES de a rota responder.
     *
     * Enquanto ela vivia só no navegador, era um cache com cara de contrato:
     * outra máquina, outro ator, e a mesa continuaria capaz de dizer
     * "SERP atual" sobre uma evidência que não existia em lugar nenhum.
     *
     * O parecer é interpretado aqui, dos resultados observados — e não da
     * intenção que o Minerador declarou, que pode legitimamente ser unknown.
     */
    const persisted: { candidateRef: string; verdict: string; workflowItemId: string }[] = [];
    const lensSummaries: { candidateRef: string; lenses: SerpLensesMarker }[] = [];
    for (const assessment of assessments) {
      const group = groups.find(item => (item.publishedAnchorId || item.id) === assessment.articleId);
      const territoryRef = group ? (group as { territoryRef?: string }).territoryRef : null;
      const formationBaseHash = parsed.data.formationBaseHashes?.[assessment.articleId];
      // Sem pai declarado ou sem base, a evidência não teria como provar que
      // descreve esta composição: melhor não gravar do que gravar sem prova.
      if (!group || !territoryRef || !formationBaseHash) continue;

      /*
       * Só é membro quem tem SERP nesta execução. No KGR leve com Principal
       * clara só ela é consultada: a secundária sem snapshot fica registrada
       * como não observada, e nunca vira "de fora" por falta de dado.
       */
      const { members, notObserved } = splitArticleSerpMembers({
        keywords: group.keywords.map(keyword => ({
          keywordId: String(keyword.id),
          keyword: String(keyword.keyword),
          role: String(keyword.id) === group.principalSuggestion.keywordId
            ? "principal" as const
            : (group.roles || {})[String(keyword.id)] === "reforco_narrativo" ? "reforco" as const : "secundaria" as const,
        })),
        snapshots: assessment.snapshots,
      });

      /*
       * Pedido legado (`device`): uma lente, o parecer de antes, sem marcador.
       * Pedido com lentes: o voto de cada par é agregado nas lentes em que as
       * duas buscas foram observadas, e o marcador diz o que foi observado.
       */
      let lensesMarker: SerpLensesMarker | null = null;
      let interpretation: ReturnType<typeof interpretArticleSerp>;
      if (requested.legacy) {
        interpretation = interpretArticleSerp({
          candidateRef: assessment.articleId,
          members,
          notObserved,
          principalKeywordId: group.principalSuggestion.keywordId,
        });
      } else {
        const extras = extraLensesByArticle.get(assessment.articleId);
        const primaryLabel = serpCacheLensLabel(lens);
        const across = interpretArticleSerpAcrossLenses({
          candidateRef: assessment.articleId,
          primary: { lens: primaryLabel, members },
          extras: extras?.extras || [],
          principalKeywordId: group.principalSuggestion.keywordId,
          notObserved,
        });
        const missing: SerpLensesMarker["missing"] = extras
          ? extras.missing
          : requested.extras.map(extraLens => ({ lens: serpCacheLensLabel(extraLens), keywordId: null, reason: "sem par" as const, detail: "Só uma busca observada: outra lente não mudaria o parecer, e nada foi lido nem pago." }));
        const collectedAtByLens = new Map<string, string[]>([[primaryLabel, assessment.snapshots.map(snapshot => snapshot.collectedAt)], ...(extras?.collectedAtByLens || new Map<string, string[]>())]);
        // O portão de datas é por keyword: a lente principal e as extras da MESMA busca.
        const collectedAtByKeyword = new Map<string, string[]>();
        for (const snapshot of assessment.snapshots) collectedAtByKeyword.set(snapshot.keywordId, [snapshot.collectedAt, ...(extras?.collectedAtByKeyword.get(snapshot.keywordId) || [])]);
        lensesMarker = formationLensesMarkerOf({
          requested: lensLabels,
          interpretation: across,
          collectedAtByLens,
          collectedAtByKeyword,
          missing,
          withExtras: requested.extras.length > 0,
        });
        interpretation = across;
        lensSummaries.push({ candidateRef: assessment.articleId, lenses: lensesMarker });
      }

      const saved = await saveArticleFormationSerpAssessment(pipelineContext, {
        candidateRef: assessment.articleId,
        territoryRef,
        formationBaseHash,
        verdict: interpretation.verdict,
        assessment,
        operationRequestId,
        interpretation: {
          principalVerdict: interpretation.principal.kind,
          principalAlternativeKeywordId: interpretation.principal.principalAlternativeKeywordId,
          principalReason: interpretation.principal.reason,
          groupVerdict: interpretation.group.kind,
          groupReason: interpretation.group.reason,
          outsiders: interpretation.group.outsiders.map(item => ({ ...item })),
          observedIntent: interpretation.observedIntent,
          dominantType: interpretation.dominantType,
          viability: interpretation.viability.level,
          viabilityText: interpretation.viability.text,
          distinctDomains: interpretation.viability.distinctDomains,
          converging: interpretation.group.converging,
          total: interpretation.group.total,
          recommendation: interpretation.recommendation,
          // Só quando há: com todas observadas, o registro é o mesmo de antes.
          ...(interpretation.notObserved.length ? { notObserved: notObservedRecordOf(interpretation.notObserved) } : {}),
          // Só no pedido com lentes: o pedido legado grava o registro de antes.
          ...(lensesMarker ? { lenses: lensesMarker } : {}),
        },
      });
      // Gravar não é sucesso: sucesso é o remoto devolver o que foi gravado.
      const lido = await readbackArticleFormationSerpAssessment(pipelineContext, assessment.articleId);
      if (lido.payload.formationBaseHash !== formationBaseHash) {
        throw new Error(`O readback do parecer ${assessment.articleId} não devolveu a composição gravada.`);
      }
      persisted.push({ candidateRef: saved.candidateRef, verdict: lido.payload.verdict, workflowItemId: saved.workflowItemId });
    }

    diagnostic.assessmentSucceeded = assessments.length > 0;
    diagnostic.stage = failures.length && !assessments.length ? "assessment" : "completed";
    if (failures.length) diagnostic.internalCode = failures[0].code as SerpOperationDiagnostic["internalCode"];
    return NextResponse.json({ success: true, data: { assessments, persisted, failures, summary: { requestedArticles: groups.length, completedArticles: assessments.length, failedArticles: failures.length }, siloCandidateEvidence, queryCount: assessments.reduce((total, assessment) => total + assessment.queryCount, 0), candidateQueryCount: siloCandidateEvidence.filter(item => item.snapshot).length, requestedKeywordCount: totalKeywords, mode: "keyword_individual", lenses: lensLabels, plan, paidQueries: budget.used, lensSummaries }, diagnostic });
  } catch (error) {
    if (error instanceof DataForSeoCanonicalError || error instanceof DataForSeoSerpError) {
      if (!diagnostic.internalCode) diagnostic.internalCode = error instanceof DataForSeoCanonicalError ? "SERP_CONNECTION_RESOLUTION_FAILED" : "SERP_REQUEST_FAILED";
      logSerpFailure(diagnostic, error);
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code,
        diagnostic,
      }, { status: error.status });
    }
    if (error instanceof IntegrationRuntimeError) {
      const mapped = integrationRuntimeErrorResponse(error);
      diagnostic.stage = "connection_resolution";
      diagnostic.internalCode = "SERP_CONNECTION_RESOLUTION_FAILED";
      logSerpFailure(diagnostic, error);
      return NextResponse.json({ success: false, error: mapped.message, code: mapped.code, diagnostic }, { status: mapped.status });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
