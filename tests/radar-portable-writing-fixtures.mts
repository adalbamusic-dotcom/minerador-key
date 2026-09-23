import { readFile } from "node:fs/promises";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { serpCacheObservationFromBody } from "../lib/server/serp-cache-observation.ts";
import { SerpCacheMetaSchema, serpCacheLensLabel, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import { SerpCollectionRecordSchema, type SerpCollectionRecord, type SerpReviewRecord } from "../lib/editorial/contracts.ts";
import { VersionedSiloDNASchema, type SiloDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { RadarSerpDecisionSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarDeepResearchQuerySchema, radarQueryEvidenceFrom } from "../lib/radar/deep-research.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import { radarPortableSerpLensRequests, type RadarPortableSerpLensLookup } from "../lib/radar/portable-serp-observed.ts";
import { planRadarSiloExport, type RadarSiloExportItem, type RadarSiloExportPlan } from "../lib/radar/portable-silo-export.ts";
import {
  radarPortableExportDossierGapsInput,
  radarPortableExportLensKeywords,
  radarPortableExportSerpObservedInput,
  type RadarPortableExportAssembledArticle,
  type RadarPortableExportLensReading,
} from "../lib/radar/portable-export-batch.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarPlannerHandoffReadiness } from "../lib/radar/planner-handoff.ts";
import type { RadarEditorialProfileModel } from "../lib/radar/editorial-profile-model.ts";

/*
 * ===== A BANCADA DO EXPORT "PARA ESCREVER" =====
 *
 * Fora do glob dos testes (não termina em `.test.mts`): é importada pela suíte
 * do modo "Para escrever" e pelo gerador da amostra offline.
 *
 * Um silo de três artigos, como o arquivo real que o usuário exportou:
 *
 *   1 · Pilar   — perfil Google, com a coleta REAL da DataForSEO, a SERP de uma
 *                  secundária, o dossiê congelado e as lentes lidas do cache;
 *   2 · Suporte — perfil Amazon, lista de seis produtos com NENHUM produto
 *                  compatível (o caso "skin care nivea");
 *   3 · Suporte — perfil YouTube (o caso "skin care noturno", roteiro);
 *   4 · Suporte — membro do SiloDNA que não foi enviado ao Radar.
 *
 * Os ids têm cara de produção (UUID e `sha256:`): um vazamento aparece na
 * higiene. PROVIDER_CALLS = 0: nada aqui vai à rede.
 */

export const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
export const ARTIGO = "7c2f9e4b-1a3d-4e5f-9a8b-6c7d8e9f0a1b";
export const ARTIGO_AMAZON = "8d3a0f5c-2b4e-4f6a-8b9c-7d8e9f0a1b2c";
export const ARTIGO_YOUTUBE = "9e4b1a6d-3c5f-4a7b-9c0d-8e9f0a1b2c3d";
export const ARTIGO_NAO_ENVIADO = "af5c2b7e-4d6a-4b8c-8d1e-9f0a1b2c3d4e";
export const SILO = "b06d3c8f-5e7b-4c9d-9e2f-0a1b2c3d4e5f";
export const VERSAO = "9d4e2a7c-3b5f-4c6d-8e9f-1a2b3c4d5e6f";
export const HASH_DO_DNA = `sha256:${"a".repeat(64)}`;
export const KEYWORD = "e1d2c3b4-a5f6-4e7d-8c9b-0a1f2e3d4c5b";
export const KEYWORD_SECUNDARIA = "b9a8f7e6-d5c4-4b3a-8f2e-1d0c9b8a7f6e";
export const ASIN = "B0DBRR5BP4";

export const EXPORTADO_EM = "2026-09-23T12:00:00.000Z";
export const CONGELADO_EM = "2026-09-20T13:00:00.000Z";

/* O UUID de TERCEIRO: faz parte do endereço da página de um concorrente, e sai intacto. */
export const UUID_DE_TERCEIRO = "c0ffee00-1234-4abc-9def-00000000beef";
export const URL_DE_TERCEIRO = `https://concorrente-exemplo.com.br/guias/${UUID_DE_TERCEIRO}/skincare-facial?srsltid=AfmBOoqz123&utm_source=google&amp;utm_medium=organic`;

const lerFixture = async (nome: string) =>
  JSON.parse(await readFile(new URL(`./fixtures/${nome}`, import.meta.url), "utf8")) as Record<string, unknown>;

const CORPO_ADVANCED = await lerFixture("dataforseo-google-skincare-facial-advanced-desktop-windows.json");
const TAREFA_NOTURNO = await lerFixture("dataforseo-google-skin-care-noturno.json");
const CORPO_NOTURNO = { version: "0.1", status_code: 20000, status_message: "Ok.", tasks: [TAREFA_NOTURNO] };
const ID_DA_TAREFA = String((CORPO_ADVANCED.tasks as Array<{ id: string }>)[0].id);

const entradaDaColeta = (keyword: string, keywordId: string, version = 1): SerpSearchInput => ({
  brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: VERSAO,
  keywordId, keywordDnaVersionId: KEYWORD, keyword,
  location: "2076", language: "pt", device: "desktop", operatingSystem: "windows",
  expectedIntent: "informacional", expectedFormat: "Pilar",
  requiredTopics: ["limpeza"], articleEntities: ["sérum"],
  resultLimit: 100, version, previousSnapshotId: null,
});

const snapshotDe = (corpo: unknown, keyword: string, keywordId: string, collectedAt: string, version = 1) =>
  normalizeDataForSeoSerpResponse(corpo, entradaDaColeta(keyword, keywordId, version), { locationCode: 2076, languageCode: "pt" }, collectedAt, ID_DA_TAREFA);

const PESQUISA = (() => {
  const base = snapshotDe(CORPO_ADVANCED, "skincare facial", KEYWORD, "2026-09-20T09:00:00.000Z");
  return { ...base, organicResults: base.organicResults.map((item, indice) => (indice === 1 ? { ...item, url: URL_DE_TERCEIRO } : item)) };
})();
const PESQUISA_AUXILIAR = snapshotDe(CORPO_NOTURNO, "skin care noturno", KEYWORD_SECUNDARIA, "2026-09-20T09:05:00.000Z");

const registro = (research: typeof PESQUISA, id: string): SerpCollectionRecord => SerpCollectionRecordSchema.parse({
  id,
  input: { keyword: research.query, articleId: ARTIGO, location: research.location, language: research.language, device: research.device },
  status: "collected", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null,
  dnaIntent: null, conflictReason: null, humanDecisionRequired: false, research,
});

export const ID_DO_REGISTRO = `serp:${ARTIGO}:3f2c9a1e-5b7d-4c2a-9e1f-0a1b2c3d4e5f`;
const REGISTROS = [registro(PESQUISA, ID_DO_REGISTRO)];

const REVISOES: SerpReviewRecord[] = [{
  id: "rev-1", brandId: MARCA, articleId: ARTIGO, snapshotId: ID_DO_REGISTRO,
  status: "approved", notes: "NOTA INTERNA DA REVISÃO", reviewedBy: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", reviewedAt: "2026-09-20T10:00:00+00:00",
} as SerpReviewRecord];

const DECISOES = [
  { key: "organic:1", itemType: "organic", decision: "included", reason: "Concorrente direto.", note: "", ownDomain: false },
].map(item => RadarSerpDecisionSchema.parse(item));

const CONSULTAS = [
  { queryId: "q:1", keywordId: KEYWORD, keyword: "skincare facial", role: "principal", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "canonical", evidence: null, reason: "SERP principal do artigo." },
  { queryId: "q:2", keywordId: KEYWORD_SECUNDARIA, keyword: "skin care noturno", role: "secundaria", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "auxiliary", evidence: radarQueryEvidenceFrom({ serpClass: "auxiliary", research: PESQUISA_AUXILIAR }), reason: "Secundária executada como SERP auxiliar." },
].map(item => RadarDeepResearchQuerySchema.parse(item));

/* ============================ o dossiê do Google ============================ */

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/skincare-facial`, status: "success",
  fetchedAt: "2026-09-20T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Skincare facial"], h2: headings, h3: [], wordCount: 1600 + id.length * 10, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Skincare facial" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Skincare facial é a rotina de cuidados com o rosto.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [], error: null,
});

const PAGINAS = Array.from({ length: 12 }, (_, indice) => {
  const headings = ["Como montar a rotina de skincare facial?"];
  if (indice < 9) headings.push("Qual a ordem dos produtos?");
  if (indice < 8) headings.push("Skincare facial para pele oleosa");
  if (indice < 3) headings.push("Perguntas frequentes");
  return pagina(`A${indice}`, headings);
});

export const contextoDePesquisa = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA, promise: "Skincare facial passo a passo", mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [
    { identity: { keywordId: KEYWORD, text: "skincare facial", role: "principal" }, strategy: { volume: 720, kgrScore: 0.2, normalizedIntent: "informacional", coveredIntentions: ["informacional"] }, resolution: "FULL", provenance: { textSource: "hydration", strategySource: "article_reference" } },
    { identity: { keywordId: KEYWORD_SECUNDARIA, text: "skin care noturno", role: "secundaria" }, strategy: { volume: 1300, kgrScore: 0.1, normalizedIntent: "informacional", coveredIntentions: ["informacional"] }, resolution: "FULL", provenance: { textSource: "hydration", strategySource: "article_reference" } },
  ],
  editorialTopics: ["ordem dos produtos"],
  resolvedKeywordTexts: ["skincare facial", "skin care noturno"],
  silo: { siloId: SILO, siloName: "Cuidados com a Pele", articleRole: "pillar", siloDnaVersionId: null, siloPageSlug: "cuidados-com-a-pele", siloPageCanonical: "https://careglow.com.br/cuidados-com-a-pele", siloPagePublicationStatus: "new" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

export const vistaDoGoogle = () => buildRadarDeepResearchView({
  context: contextoDePesquisa(),
  snapshot: { query: "skincare facial", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-20T12:00:00.000Z",
});

export const DOSSIE = buildRadarEvidenceBundle({
  observed: vistaDoGoogle().observed,
  serp: { current: true, sufficient: true, valid: true },
  frozenAt: CONGELADO_EM,
  researchRefs: [{
    source: "WEB_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
    ref: ID_DO_REGISTRO, fingerprint: PESQUISA.contentHash, collectedAt: PESQUISA.collectedAt, sampleSize: 12,
  }],
  editorialOutputs: [],
});

export const PRONTO: RadarPlannerHandoffReadiness = { ready: true, headline: "Pacote para planejamento pronto", blocks: [] };

const ANALISE = {
  serpSnapshotId: ID_DO_REGISTRO,
  serpDecisions: DECISOES,
  deepResearch: { queries: CONSULTAS },
  finalizedBundle: { frozenAt: CONGELADO_EM },
} as never;

/* ============================ as lentes ============================ */

const observacao = (corpo: unknown, keyword: string, lens: SerpCacheLens) =>
  serpCacheObservationFromBody(corpo, { keyword, locationCode: 2076, languageCode: "pt", lens, collectedAt: "2026-09-23T09:00:00.000Z" });

const meta = (keyword: string, lens: SerpCacheLens, collectedAt: string) => SerpCacheMetaSchema.parse({
  keyword, normalizedKeyword: keyword.toLowerCase(), locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced",
  depth: 20, collectedAt, providerRequestId: ID_DA_TAREFA, keywordId: KEYWORD, collectedBy: "minerador",
});

export const KEYWORDS_DAS_LENTES = radarPortableExportLensKeywords({
  keywordContext: { principal: "skincare facial", secondary: ["skin care noturno"] },
  researchContext: contextoDePesquisa(),
});

export function leiturasDasLentes(): RadarPortableSerpLensLookup[] {
  const pedidos = radarPortableSerpLensRequests({ keywords: KEYWORDS_DAS_LENTES, locationCode: 2076, languageCode: "pt" });
  return pedidos.map(pedido => {
    const rotulo = `${pedido.query.keyword}|${serpCacheLensLabel(pedido.query.lens)}`;
    if (rotulo === "skincare facial|desktop-windows" || rotulo === "skincare facial|mobile-android") {
      return { request: pedido, hit: { meta: meta(pedido.query.keyword, pedido.query.lens, "2026-09-22T08:00:00+00:00"), observation: observacao(CORPO_ADVANCED, pedido.query.keyword, pedido.query.lens) }, missReason: null };
    }
    return { request: pedido, hit: null, missReason: "sem entrada" };
  });
}

export const LEITURA_DAS_LENTES: RadarPortableExportLensReading = { lookups: leiturasDasLentes(), readFailed: false };

/* ============================ o Pilar (Google) ============================ */

export function entradaGoogle(extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const serpObservada = radarPortableExportSerpObservedInput({
    records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: ANALISE, reviews: REVISOES, reviewsReadable: true,
  });
  const vista = vistaDoGoogle();
  return {
    profile: "GOOGLE",
    blueprintView: { blueprint: null, sample: { label: "página(s)", count: 12 } } as never,
    exportedAt: EXPORTADO_EM,
    article: {
      principalKeyword: "skincare facial", secondaryKeywords: ["skin care noturno"], narrativeReinforcements: [],
      intent: "Informacional", funnel: "Topo", siloName: "Cuidados com a Pele", articleRole: "pillar",
      slug: "skincare-facial", mustCover: ["ordem dos produtos"],
      audience: "Pessoas com pele oleosa que querem uma rotina simples.",
      promise: "Skincare facial passo a passo",
    },
    articleModel: vista.articleModel,
    googleObserved: vista.observed,
    researchContext: contextoDePesquisa(),
    internalLinks: ["ARTICLE_TO_SILO_PAGE: guia de cuidados com a pele"],
    researchLimitations: ["Nenhum destino foi acessado: as fontes são as que os concorrentes CITAM, não fontes verificadas."],
    serpObserved: serpObservada,
    dossierGaps: radarPortableExportDossierGapsInput({
      analysis: ANALISE, profile: "GOOGLE", bundle: DOSSIE, readiness: PRONTO,
      article: { articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA }, exportedAt: EXPORTADO_EM,
      newerSerpCollection: serpObservada.newerCollection,
    }),
    ...extra,
  };
}

/* ======================= o Suporte comercial (Amazon) ======================= */

const modeloDoPerfil = (patch: Partial<RadarEditorialProfileModel> = {}): RadarEditorialProfileModel => ({
  kind: "COMMERCIAL",
  profile: "AMAZON",
  articleIdentity: {
    articleId: ARTIGO_AMAZON, articleDnaVersionId: VERSAO,
    principalKeyword: "skin care nivea", intentLabel: "Mista", siloRole: "support",
  },
  editorialOutput: "TOP_BEST",
  workingTitle: "6 skin care nivea para comparar",
  alternateTitleDirections: [],
  objective: "Dar critério de escolha",
  promise: "Ao final, o leitor sabe por que cada opção entrou na lista e o que as diferencia entre si.",
  hook: null,
  blocks: [
    {
      id: "b1", order: 1, heading: "Como selecionamos skin care nivea",
      objective: "Declarar o critério antes da lista: faixa de preço e nota de avaliação.",
      coveragePoints: [], function: "Bloco comercial", evidenceStrength: "MODERATE",
      mustCoverReasons: ['O ArticleDNA declara "skin care nivea": ele precisa ser coberto, e a arquitetura decide onde.'],
      sourceNeeded: null, specialistRequired: null, visualOpportunity: null,
      sourceSignal: "Bandas derivadas do universo observado.",
    },
    {
      id: "b2", order: 2, heading: "Perguntas frequentes sobre skin care nivea",
      objective: "Responder dúvidas soltas.",
      coveragePoints: [], function: "Bloco comercial", evidenceStrength: "MODERATE",
      mustCoverReasons: [], sourceNeeded: null, specialistRequired: null, visualOpportunity: null,
      sourceSignal: "Bloco legado.",
    },
  ],
  conclusion: "Fechar com a escolha que os critérios sustentam.",
  cta: null,
  derived: [],
  derivedLabel: null,
  articleApplication: [],
  seoApplication: [],
  evidenceNeeds: [],
  specialistNeeds: [],
  limitations: ["Benefícios e atributos do PDP não foram lidos nesta investigação."],
  readiness: { state: "READY", label: "Pronto para o Planejador", reasons: [] },
  promotionLinks: [],
  affiliateDisclosureRequired: false,
  comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
  shortlistStatus: { state: "EMPTY", desired: 6, available: 0, message: "Nenhum produto compatível com o alvo foi encontrado nesta coleta; não há ranking a construir.", fixHint: null },
  ...patch,
} as RadarEditorialProfileModel);

const SETUP_COMERCIAL = {
  intent: { type: "TOP_BEST", desiredCount: 6, rankingCriteria: null, useCase: null },
  target: { type: "CATEGORY_DISCOVERY", productClass: "skincare", brandFilter: "Nivea", categoryQuery: "cremes Nivea" },
} as never;

export function entradaAmazon(comProdutos = false, extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const links = comProdutos
    ? [{
      asin: ASIN, productName: "NIVEA Q10 Sérum Antissinais Expert Dupla Ação 30ml",
      amazonUrl: `https://www.amazon.com.br/dp/${ASIN}?tag=minhaloja-20&ref=sr_1_1`,
      suggestedAnchor: "NIVEA Q10 Sérum Antissinais", suggestedButtonLabel: "Ver preço na Amazon",
      placement: "Na posição 1 da lista.", linkFormat: "BUTTON", affiliateReady: true, relPolicy: "sponsored nofollow",
    }]
    : [];
  return {
    profile: "AMAZON",
    blueprintView: { blueprint: null, sample: { label: "produto(s)", count: 48 } } as never,
    exportedAt: EXPORTADO_EM,
    article: {
      principalKeyword: "skin care nivea", secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Mista", funnel: null, siloName: "Cuidados com a Pele", articleRole: "support",
      slug: "skin-care-nivea", mustCover: ["skin care nivea"],
    },
    profileModel: modeloDoPerfil(comProdutos ? { promotionLinks: links as never, shortlistStatus: { state: "OK", desired: 6, available: 1, message: null, fixHint: null } as never } : {}),
    amazon: {
      setup: SETUP_COMERCIAL,
      universe: comProdutos
        ? [{
          asin: ASIN, title: "NIVEA Q10 Sérum", url: `https://www.amazon.com.br/dp/${ASIN}?tag=outra-20`, imageUrl: null, domain: "amazon.com.br",
          priceFrom: 89.9, currency: "BRL", offerText: [], ratingValue: 4.8, ratingVotes: 835, ratingMax: 5,
          isAmazonChoice: true, isBestSeller: false, boughtPastMonth: 200, deliveryMessage: null,
          placements: ["organic"], bestOrganicRank: 1, bestSponsoredRank: null, occurrences: [], queriesFoundIn: [], occurrenceCount: 1,
        }] as never
        : [],
    },
    commercial: {
      setup: SETUP_COMERCIAL,
      counts: { observed: 48, eligible: comProdutos ? 1 : 0, shortlist: comProdutos ? 1 : 0 },
      products: links.map(item => ({ asin: item.asin, productName: item.productName })),
      links: links as never,
      comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
      disclosureRequired: comProdutos,
      shortlistStatus: comProdutos
        ? { state: "OK", desired: 6, available: 1, message: null, fixHint: null } as never
        : { state: "EMPTY", desired: 6, available: 0, message: "Nenhum produto compatível com o alvo foi encontrado nesta coleta; não há ranking a construir.", fixHint: null } as never,
    },
    researchLimitations: ["A coleta da prateleira não traz texto de avaliação."],
    ...extra,
  };
}

/* ======================= o Suporte de vídeo (YouTube) ======================= */

export function entradaYoutube(extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  return {
    profile: "YOUTUBE",
    blueprintView: { blueprint: null, sample: { label: "vídeo(s)", count: 38 } } as never,
    exportedAt: EXPORTADO_EM,
    article: {
      principalKeyword: "skin care noturno", secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Informacional", funnel: null, siloName: "Cuidados com a Pele", articleRole: "support",
      slug: "skin-care-noturno", mustCover: ["skin care noturno"],
    },
    profileModel: modeloDoPerfil({
      kind: "VIDEO", profile: "YOUTUBE", editorialOutput: "Rotina",
      workingTitle: "Skin care noturno: o que mostrar em vídeo", promise: null, hook: "Abra pela dúvida",
      blocks: [{
        id: "v1", order: 1, heading: "Abertura sobre skin care noturno", objective: "Capturar a intenção nos primeiros segundos.",
        coveragePoints: [], function: "Gancho", evidenceStrength: "MODERATE", mustCoverReasons: [],
        sourceNeeded: null, specialistRequired: null, visualOpportunity: null, sourceSignal: "Padrão observado.",
      }],
      comparisonCriteria: [], shortlistStatus: null, promotionLinks: [],
    } as never),
    ...extra,
  };
}

/* ============================ o silo ============================ */

const envelope = <T,>(payload: T, entityId: string, versionNumber: number) => ({
  versionId: `c1d2e3f4-a5b6-4c7d-8e9f-${String(versionNumber).padStart(12, "0")}`, entityId, versionNumber, previousVersionId: null,
  contentHash: `sha256:${String(versionNumber).padStart(64, "0")}`, origin: "human" as const, changeReason: "bancada",
  createdAt: "2026-09-12T10:00:00.000Z", createdBy: "d2e3f4a5-b6c7-4d8e-9f0a-000000000999",
  payload,
});

export const SILO_DNA: VersionEnvelope<SiloDNA> = VersionedSiloDNASchema.parse(envelope({
  schemaVersion: 1,
  formationStatus: "formed",
  siloId: SILO,
  brandId: MARCA,
  name: "Cuidados com a Pele",
  territoryNarrative: { statement: "Quem tem pele oleosa precisa de rotina, e não de produto solto.", continuity: "coherent", brandAlignment: "aligned", rationale: ["bancada"] },
  centralEntity: "cuidados com a pele",
  objective: "Construir autoridade em cuidados com a pele.",
  audience: "Pendente de enriquecimento e revisão humana",
  macroProblem: "Brilho excessivo e poros obstruídos sem saber por onde começar.",
  dominantIntent: "Informativa",
  pillarArticleId: ARTIGO,
  supportArticleIds: [ARTIGO_AMAZON, ARTIGO_NAO_ENVIADO, ARTIGO_YOUTUBE],
  articleReferences: [ARTIGO, ARTIGO_AMAZON, ARTIGO_NAO_ENVIADO, ARTIGO_YOUTUBE].map((articleId, indice) => ({
    articleId, articleDnaVersionId: `d3e4f5a6-b7c8-4d9e-8f0a-${String(600 + indice).padStart(12, "0")}`, articleDnaContentHash: `sha256:${String(600 + indice).padStart(64, "0")}`,
    role: articleId === ARTIGO ? "Pilar" as const : "Suporte" as const,
  })),
  articleRoles: [ARTIGO, ARTIGO_AMAZON, ARTIGO_NAO_ENVIADO, ARTIGO_YOUTUBE].map(articleId => ({ articleId, role: articleId === ARTIGO ? "Pilar" : "Suporte", reason: "bancada" })),
  narrativeOrder: [ARTIGO, ARTIGO_AMAZON, ARTIGO_NAO_ENVIADO, ARTIGO_YOUTUBE],
  linkMap: [],
  boundary: "Cuidados com a pele do rosto; tratamento de acne com medicamento fica fora.",
  includedTopics: ["skincare facial", "skin care nivea", "skin care noturno", "máscara facial"],
  excludedTopics: ["tratamento de acne com medicamento"],
  nearbySiloIds: [],
  possibleConflicts: [], gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [],
}, SILO, 3)) as VersionEnvelope<SiloDNA>;

export const ITENS_DO_SILO: RadarSiloExportItem[] = [
  { articleId: ARTIGO, siloId: SILO, status: "finalized", title: "Skincare facial passo a passo", principalKeyword: "skincare facial", slug: "skincare-facial",
    siloPage: { slug: "cuidados-com-a-pele", canonical: "https://careglow.com.br/cuidados-com-a-pele", publicationStatus: "new" } },
  { articleId: ARTIGO_AMAZON, siloId: SILO, status: "finalized", title: "Cobrir com clareza o tema “skin care nivea”.", principalKeyword: "skin care nivea", slug: "skin-care-nivea" },
  { articleId: ARTIGO_YOUTUBE, siloId: SILO, status: "finalized", title: "Cobrir com clareza o tema “skin care noturno”.", principalKeyword: "skin care noturno", slug: "skin-care-noturno" },
];

export const planoDoSilo = (): RadarSiloExportPlan => planRadarSiloExport({
  today: EXPORTADO_EM,
  brandId: MARCA,
  items: ITENS_DO_SILO,
  siloVersions: [SILO_DNA],
  memberDescriptors: [{ articleId: ARTIGO_NAO_ENVIADO, title: "Cobrir com clareza o tema “máscara facial”.", slug: "mascara-facial" }],
});

/* Como a rota guarda cada artigo antes de o lote fechar. */
export function montadasDoSilo(): RadarPortableExportAssembledArticle[] {
  return [
    { articleId: ARTIGO, entrada: entradaGoogle(), lentes: KEYWORDS_DAS_LENTES },
    { articleId: ARTIGO_AMAZON, entrada: entradaAmazon(), lentes: [] },
    { articleId: ARTIGO_YOUTUBE, entrada: entradaYoutube(), lentes: [] },
  ];
}

/* ============================ as variantes do caso real ============================ */

/*
 * O PILAR COMO O ARQUIVO REAL O MOSTROU (processo antigo): tema de saúde com
 * YMYL gravado como "baixa" e uma afirmação material sem fonte; fonte citada
 * pelo mercado com `utm` e `&amp;`; fonte de menu não classificada; pergunta
 * em caixa alta com entidade HTML; assunto fora do escopo; lacuna de uma
 * página só achada por keyword auxiliar; plano de links para os irmãos; uma
 * seção de perguntas frequentes no modelo; e uma contribuição de especialista
 * ACEITA que responde outra coisa.
 */
export function entradaGoogleSaude(extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const base = entradaGoogle();
  const vista = vistaDoGoogle();
  const observado = vista.observed as unknown as Record<string, unknown> & {
    authorityEvidence: Record<string, unknown> & { ymylAssessment: Record<string, unknown> };
    externalSources: Record<string, unknown>;
    internalLinkPlan: Record<string, unknown>;
    internalLinks: Record<string, unknown>;
    concepts: Record<string, unknown> & { all: unknown[] };
    questions: unknown[];
    gaps: unknown[];
  };
  const afirmacao = {
    claimId: "claim:9f8e7d6c", canonicalClaim: "O que causa acne", conceptId: "concept:acne-causa", claimType: "CAUSE",
    ymyl: { relevance: "MATERIAL", claimType: "CAUSE", signals: ["acne"], reason: "saúde", confidence: "MEDIUM", sensitivePopulation: false },
    market: { competitors: 3, sampleSize: 12, recurrence: "MODERATE", queryCoverage: 2, supportingCompetitors: [], statement: "3 de 12" },
    observedSourceDomains: ["www.beiersdorf.com"], confidence: "MEDIUM", provenance: "page:A1",
  };
  const autoridade = {
    ...observado.authorityEvidence,
    ymylAssessment: { ...observado.authorityEvidence.ymylAssessment, relevance: "LOW", evidenceRequirements: ["Fonte identificável para afirmações factuais."], specialistReviewRequired: false },
    claims: [afirmacao],
    factualEvidence: [],
    marketVsFactConflicts: [],
  };
  const secoes = (vista.articleModel as unknown as { sections: Array<Record<string, unknown>> }).sections;
  const modelo = {
    ...vista.articleModel,
    sections: [
      { ...secoes[0], internalLinks: [] },
      {
        ...secoes[1],
        headingSuggestion: "Pele oleosa e acne",
        readerQuestion: "O que causa acne?",
        factualRequirement: "Precisa de fonte: nenhuma sustentação adequada foi encontrada nesta investigação.",
        specialistRequirement: "Uma afirmação desta seção precisa de revisão profissional.",
      },
      ...secoes.slice(2),
      { ...secoes[0], id: "section:faq", headingSuggestion: "Perguntas frequentes sobre skincare facial", readerQuestion: null, childSections: [] },
    ],
    candidates: [
      ...((vista.articleModel as unknown as { candidates: unknown[] }).candidates || []),
      { observedLabel: "As melhores ofertas de skincare", pages: 3, sampleSize: 12, verdict: "OUT_OF_SCOPE", reason: "A intenção declarada é Informacional; este assunto pertence a uma intenção comercial.", sectionId: null },
    ],
  };
  const observadoSaude = {
    ...observado,
    authorityEvidence: autoridade,
    externalSources: {
      ...observado.externalSources,
      evidenceCandidates: [
        { destinationUrl: "https://wa.me/5511937611577", anchors: ["WhatsApp"], domain: "wa.me", sourceType: "unknown", authoritySignals: [], sections: ["Fale conosco"], competitorsUsingIt: 1 },
        { destinationUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9311318/?utm_source=site&amp;utm_medium=link", anchors: ["https://pmc.ncbi.nlm.nih.gov/articles/PMC9311318/"], domain: "pmc.ncbi.nlm.nih.gov", sourceType: "study", authoritySignals: ["base de estudos ou publicação científica"], sections: ["Rotina noturna"], competitorsUsingIt: 2 },
      ],
    },
    internalLinkPlan: {
      ...observado.internalLinkPlan,
      outgoing: [
        { nodeId: "article:article-candidate:territory:abc", slug: null, approvedAnchorConcepts: ["skin care noturno"], relationTypes: ["PILLAR_TO_SUPPORT"], targetRole: "support",
          anchor: { recommendedAnchor: "skin care noturno" }, preferredContexts: ["Seção que desenvolve \"Como montar a rotina de skincare facial?\" — 12 de 12 página(s) da amostra tratam do assunto."], distribution: [], reason: "O Pilar abre a verticalização." },
        { nodeId: "article:article-candidate:territory:def", slug: null, approvedAnchorConcepts: ["produtos nivea para a pele"], relationTypes: ["PILLAR_TO_SUPPORT"], targetRole: "support",
          anchor: { recommendedAnchor: "produtos nivea para a pele" }, preferredContexts: ["Seção que desenvolve \"O que causa acne?\"."], distribution: [], reason: "O suporte devolve o leitor ao Pilar." },
      ],
    },
    internalLinks: {
      ...observado.internalLinks,
      relatedInternalPages: [
        { nodeId: "article:article-candidate:territory:abc", label: "skin care noturno", slug: null },
        { nodeId: "article:article-candidate:territory:def", label: "cuidados com nivea", slug: null },
      ],
    },
    concepts: {
      ...observado.concepts,
      all: [
        ...observado.concepts.all,
        { canonicalLabel: "voce", status: "RECURRENT", sourceCount: 6, sampleSize: 12, queries: [], evidence: "6 de 12" },
        { canonicalLabel: "6 &#8211; Manter a pele limpa", status: "UNDERCOVERED", sourceCount: 1, sampleSize: 12, queries: [], evidence: "1 de 12" },
      ],
    },
    questions: [
      ...observado.questions,
      { canonicalQuestion: "COMO &Eacute; A PELE OLEOSA?", status: "ARTICLE_QUESTION_CONFIRMED", pages: 1, sampleSize: 12, declaredByArticle: true, evidence: "1 de 12" },
      { canonicalQuestion: "Como é a pele oleosa?", status: "MARKET_QUESTION_UNDERCOVERED", pages: 2, sampleSize: 12, declaredByArticle: false, evidence: "2 de 12" },
      { canonicalQuestion: "Cabelo virgem: o que é e como cuidar?", status: "ISOLATED_QUESTION", pages: 1, sampleSize: 12, declaredByArticle: false, evidence: "1 de 12" },
    ],
    gaps: [
      ...observado.gaps,
      { subject: "O artigo declara \"6 &#8211; Manter a pele limpa\" e a amostra não cobre.", against: "ARTICLE_DNA", pagesCovering: 1, sampleSize: 12, queryCoverage: 1, queries: [], sources: [], confidence: "LOW", evidence: "Encontrado apenas por keyword auxiliar da composição." },
    ],
  };
  return {
    ...base,
    internalLinks: ["ARTICLE_TO_SILO_PAGE: guia de cuidados com a pele", "PILLAR_TO_SUPPORT: cuidados com máscara facial, máscara facial de skincare"],
    articleModel: modelo as never,
    googleObserved: observadoSaude as never,
    dossierGaps: base.dossierGaps ? { ...base.dossierGaps, observed: observadoSaude as never } : null,
    specialistContext: {
      state: "RECEIVED",
      note: "As contribuições abaixo foram revisadas e aprovadas por uma pessoa.",
      items: [{
        requirementQuestion: "O que pode ser afirmado com segurança neste ponto, e o que precisa ser qualificado ou omitido?",
        questionsSent: ["3 de 12 concorrentes tratam de \"O que causa acne\". O que pode ser afirmado com segurança?"],
        contribution: "Todo mundo fala de protetor solar, mas será que você está usando o melhor pra sua pele? Neste vídeo eu trago uma resenha completa dos protetores solares.",
        fullAnswer: "Todo mundo fala de protetor solar.",
        classification: "Ressalva", status: "Aceita como evidência", approved: true,
        appliesTo: "Aplicação editorial ainda não definida: esta resposta não nasceu de um ponto preparado.",
        quote: null, limitations: [],
      }],
      pending: 0, rejected: 0,
    },
    ...extra,
  };
}

/* O mesmo Pilar, publicado, sem a política da principal no ArticleDNA. */
export const PUBLICACAO_SEM_POLITICA = {
  published: true,
  publishedUrl: "https://careglow.com.br/skincare-facial",
  canonical: "https://careglow.com.br/skincare-facial",
  slug: "skincare-facial",
  principalPolicy: null,
};

/* O silo com o Pilar do caso real no lugar do Pilar da bancada. */
export function montadasDoSiloSaude(): RadarPortableExportAssembledArticle[] {
  return [
    { articleId: ARTIGO, entrada: entradaGoogleSaude(), lentes: KEYWORDS_DAS_LENTES },
    { articleId: ARTIGO_AMAZON, entrada: entradaAmazon(true), lentes: [] },
    { articleId: ARTIGO_YOUTUBE, entrada: entradaYoutube(), lentes: [] },
  ];
}
