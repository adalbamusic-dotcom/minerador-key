import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { serpCacheObservationFromBody } from "../lib/server/serp-cache-observation.ts";
import { SerpCacheMetaSchema, serpCacheLensLabel, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import { SerpCollectionRecordSchema, type SerpCollectionRecord, type SerpReviewRecord } from "../lib/editorial/contracts.ts";
import { VersionedSiloDNASchema, type ArticleDNA, type SiloDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { RadarSerpDecisionSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarDeepResearchQuerySchema, radarQueryEvidenceFrom } from "../lib/radar/deep-research.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import { resolveRadarCanonicalDossier } from "../lib/server/radar-canonical-dossier.ts";
import { buildRadarPortableExportRow, radarPortableExportCsv, type RadarPortableExportInput, type RadarPortableExportRow } from "../lib/radar/portable-export.ts";
import { radarPortableSerpLensRequests, radarPortableSerpObservedColumns, type RadarPortableSerpLensLookup } from "../lib/radar/portable-serp-observed.ts";
import { planRadarSiloExport, type RadarSiloExportItem } from "../lib/radar/portable-silo-export.ts";
import {
  radarPortableExportDossierGapsInput,
  radarPortableExportEmptySilos,
  radarPortableExportLensKeywords,
  radarPortableExportLensLookupsFor,
  radarPortableExportReadLenses,
  radarPortableExportRows,
  radarPortableExportSerpObservedInput,
  radarPortableExportSiloFiles,
  radarSiloIdFromComposition,
  radarSiloMemberDescriptorsWithTitles,
} from "../lib/radar/portable-export-batch.ts";
import {
  RADAR_EXPORT_MAX_ARTICLES,
  RadarExportRefusedError,
  radarDossierExportNotice,
  radarExportFailureNotice,
  radarPartiallySelectedSilos,
  radarSiloExportNotice,
  radarSiloExportPreview,
  radarSiloExportScope,
  radarSiloExportScopeLimitNotice,
} from "../lib/radar/portable-silo-scope.ts";
import { radarStoredZipOfTexts } from "../lib/radar/stored-zip.ts";
import { readDataForSeoTargetCodes } from "../lib/minerador/dataforseo-serp-core.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarPlannerHandoffReadiness } from "../lib/radar/planner-handoff.ts";

/*
 * ===== A INTEGRAÇÃO DO EXPORT PORTÁTIL — SERP, Redator e silo (2026-09-23) =====
 *
 * ==================== O PEDIDO ====================
 *
 * "no radar tem a opção para exportar em CSV, coloca nele os dados da serp,
 * por que ele é uma saída final (...) então ele tem que ter os mesmos dados
 * que o redator tem por artigo, e coloca como recomendação de export que seja
 * silo completo". Três módulos puros já projetam cada parte; esta suíte prova
 * a LIGAÇÃO — a linha que a rota monta, o agrupamento por silo e a tela.
 *
 * ==================== O QUE ELA PROVA ====================
 *
 *   A · a linha ganha as colunas novas a partir de coletas REAIS, com a SERP
 *       que o dossiê referencia (não a mais recente) e o aviso da posterior;
 *   B · a higiene separa id NOSSO de URL de TERCEIRO: nenhum id nosso sai,
 *       nem dentro de URL; a URL legítima de um concorrente sai intacta;
 *   C · as proibições do Redator entram nas regras sem repetir nenhuma;
 *   D · a leitura do cache que lança NÃO derruba o export;
 *   E · o `groupBy` devolve um arquivo por silo, na ordem do silo, e parcial
 *       quando falta alguém — com o faltante pelo título;
 *   F · a tela: o item recomendado vem primeiro, e o escopo é o silo inteiro;
 *   G · o campo novo das autoridades não muda o hash do dossiê;
 *   H · a rota liga tudo isso, com leituras por lote e sem coleta.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/[^\n]*/g, " ");

/* ============================ as identidades plantadas ============================ */

/* Ids com cara de produção: nenhum deles pode aparecer no arquivo, nem dentro de URL. */
const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const ARTIGO = "7c2f9e4b-1a3d-4e5f-9a8b-6c7d8e9f0a1b";
const VERSAO = "9d4e2a7c-3b5f-4c6d-8e9f-1a2b3c4d5e6f";
const HASH_DO_DNA = `sha256:${"a".repeat(64)}`;
const KEYWORD = "e1d2c3b4-a5f6-4e7d-8c9b-0a1f2e3d4c5b";
const KEYWORD_SECUNDARIA = "b9a8f7e6-d5c4-4b3a-8f2e-1d0c9b8a7f6e";
const REVISOR = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

/* O UUID de TERCEIRO: faz parte do endereço da página de um concorrente. */
const UUID_DE_TERCEIRO = "c0ffee00-1234-4abc-9def-00000000beef";
const URL_DE_TERCEIRO = `https://concorrente-exemplo.com.br/guias/${UUID_DE_TERCEIRO}/skincare-facial`;

/* ============================ a coleta real ============================ */

const lerFixture = async (nome: string) =>
  JSON.parse(await readFile(new URL(`./fixtures/${nome}`, import.meta.url), "utf8")) as Record<string, unknown>;

const CORPO_ADVANCED = await lerFixture("dataforseo-google-skincare-facial-advanced-desktop-windows.json");
const TAREFA_NOTURNO = await lerFixture("dataforseo-google-skin-care-noturno.json");
const CORPO_NOTURNO = { version: "0.1", status_code: 20000, status_message: "Ok.", tasks: [TAREFA_NOTURNO] };
const ID_DA_TAREFA = String((CORPO_ADVANCED.tasks as Array<{ id: string }>)[0].id);

const entrada = (keyword: string, keywordId: string, version = 1): SerpSearchInput => ({
  brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: VERSAO,
  keywordId, keywordDnaVersionId: KEYWORD, keyword,
  location: "2076", language: "pt", device: "desktop", operatingSystem: "windows",
  expectedIntent: "informacional", expectedFormat: "Suporte",
  requiredTopics: ["limpeza"], articleEntities: ["sérum"],
  resultLimit: 100, version, previousSnapshotId: null,
});

const snapshotDe = (corpo: unknown, keyword: string, keywordId: string, collectedAt: string, version = 1) =>
  normalizeDataForSeoSerpResponse(corpo, entrada(keyword, keywordId, version), { locationCode: 2076, languageCode: "pt" }, collectedAt, ID_DA_TAREFA);

/* A SERP da investigação, com a URL de um concorrente que contém um UUID legítimo. */
const PESQUISA = (() => {
  const base = snapshotDe(CORPO_ADVANCED, "skincare facial", KEYWORD, "2026-09-20T09:00:00.000Z");
  return { ...base, organicResults: base.organicResults.map((item, indice) => (indice === 1 ? { ...item, url: URL_DE_TERCEIRO } : item)) };
})();
/* Uma coleta POSTERIOR do mesmo artigo, que a investigação não usou. */
const PESQUISA_POSTERIOR = snapshotDe(CORPO_ADVANCED, "skincare facial", KEYWORD, "2026-09-22T09:00:00.000Z", 2);
const PESQUISA_AUXILIAR = snapshotDe(CORPO_NOTURNO, "skin care noturno", KEYWORD_SECUNDARIA, "2026-09-20T09:05:00.000Z");

const registro = (research: typeof PESQUISA, id: string): SerpCollectionRecord => SerpCollectionRecordSchema.parse({
  id,
  input: { keyword: research.query, articleId: ARTIGO, location: research.location, language: research.language, device: research.device },
  status: "collected", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null,
  dnaIntent: null, conflictReason: null, humanDecisionRequired: false, research,
});

const ID_DO_REGISTRO = `serp:${ARTIGO}:3f2c9a1e-5b7d-4c2a-9e1f-0a1b2c3d4e5f`;
const ID_DO_POSTERIOR = `serp:${ARTIGO}:4a3b2c1d-6e5f-4d3c-8b2a-1f0e9d8c7b6a`;
const REGISTRO = registro(PESQUISA, ID_DO_REGISTRO);
const REGISTRO_POSTERIOR = registro(PESQUISA_POSTERIOR, ID_DO_POSTERIOR);
const REGISTROS = [REGISTRO, REGISTRO_POSTERIOR];

const REVISOES: SerpReviewRecord[] = [{
  id: "rev-1", brandId: MARCA, articleId: ARTIGO, snapshotId: ID_DO_REGISTRO,
  status: "approved", notes: "NOTA INTERNA DA REVISÃO", reviewedBy: REVISOR, reviewedAt: "2026-09-20T10:00:00+00:00",
} as SerpReviewRecord];

const DECISOES = [
  { key: "organic:1", itemType: "organic", decision: "included", reason: "Concorrente direto.", note: "", ownDomain: false },
  { key: "organic:3", itemType: "organic", decision: "excluded", reason: "Página de produto; ver organic:4.", note: "", ownDomain: false },
].map(item => RadarSerpDecisionSchema.parse(item));

const CONSULTAS = [
  { queryId: "q:1", keywordId: KEYWORD, keyword: "skincare facial", role: "principal", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "canonical", evidence: null, reason: "SERP principal do artigo." },
  { queryId: "q:2", keywordId: KEYWORD_SECUNDARIA, keyword: "skin care noturno", role: "secundaria", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "auxiliary", evidence: radarQueryEvidenceFrom({ serpClass: "auxiliary", research: PESQUISA_AUXILIAR }), reason: "Secundária executada como SERP auxiliar." },
].map(item => RadarDeepResearchQuerySchema.parse(item));

/* ============================ o dossiê do Google ============================ */

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/skincare-facial`, status: "success",
  fetchedAt: "2026-09-20T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Skincare facial"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 0,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Skincare facial" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [], error: null,
});

const PAGINAS = Array.from({ length: 12 }, (_, indice) => {
  const headings = ["Como montar a rotina de skincare facial?"];
  if (indice < 9) headings.push("Qual a ordem dos produtos?");
  if (indice < 8) headings.push("Skincare facial para pele oleosa");
  return pagina(`A${indice}`, headings);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA, promise: "Skincare facial passo a passo", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [
    { identity: { keywordId: KEYWORD, text: "skincare facial", role: "principal" }, strategy: { volume: 720, kgrScore: 0.2, normalizedIntent: "informacional", coveredIntentions: ["informacional"] }, resolution: "FULL", provenance: { textSource: "hydration", strategySource: "article_reference" } },
    { identity: { keywordId: KEYWORD_SECUNDARIA, text: "skin care noturno", role: "secundaria" }, strategy: { volume: 320, kgrScore: 0.1, normalizedIntent: "informacional", coveredIntentions: ["informacional"] }, resolution: "FULL", provenance: { textSource: "hydration", strategySource: "article_reference" } },
  ],
  editorialTopics: ["ordem dos produtos"],
  resolvedKeywordTexts: ["skincare facial", "skin care noturno"],
  silo: { siloId: "silo-x", siloName: "Cuidados com a Pele", articleRole: "SUPORTE", siloDnaVersionId: null, siloPageSlug: null, siloPageCanonical: null, siloPagePublicationStatus: null },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const vista = () => buildRadarDeepResearchView({
  context: contexto(),
  snapshot: { query: "skincare facial", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-20T12:00:00.000Z",
});

const CONGELADO_EM = "2026-09-20T13:00:00.000Z";

const DOSSIE = buildRadarEvidenceBundle({
  observed: vista().observed,
  serp: { current: true, sufficient: true, valid: true },
  frozenAt: CONGELADO_EM,
  researchRefs: [{
    source: "WEB_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
    ref: ID_DO_REGISTRO, fingerprint: PESQUISA.contentHash, collectedAt: PESQUISA.collectedAt, sampleSize: 12,
  }],
  editorialOutputs: [],
});

const PRONTO: RadarPlannerHandoffReadiness = { ready: true, headline: "Pacote para planejamento pronto", blocks: [] };

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

const KEYWORDS_DAS_LENTES = radarPortableExportLensKeywords({
  keywordContext: { principal: "skincare facial", secondary: ["skin care noturno", "Skincare Facial "] },
  researchContext: contexto(),
});

/* Um lote com OUTRO artigo junto: as leituras dele não podem entrar na coluna deste. */
function leiturasDoLote(): RadarPortableSerpLensLookup[] {
  const pedidos = radarPortableSerpLensRequests({
    keywords: [...KEYWORDS_DAS_LENTES, { keyword: "protetor solar oil free", role: "principal" }],
    locationCode: 2076, languageCode: "pt",
  });
  return pedidos.map(pedido => {
    const rotulo = `${pedido.query.keyword}|${serpCacheLensLabel(pedido.query.lens)}`;
    if (rotulo === "skincare facial|desktop-windows" || rotulo === "protetor solar oil free|desktop-windows") {
      return { request: pedido, hit: { meta: meta(pedido.query.keyword, pedido.query.lens, "2026-09-22T08:00:00+00:00"), observation: observacao(CORPO_ADVANCED, pedido.query.keyword, pedido.query.lens) }, missReason: null };
    }
    if (rotulo === "skin care noturno|desktop-windows") {
      return { request: pedido, hit: { meta: meta(pedido.query.keyword, pedido.query.lens, "2026-09-21T08:00:00.000Z"), observation: observacao(CORPO_NOTURNO, pedido.query.keyword, pedido.query.lens) }, missReason: null };
    }
    return { request: pedido, hit: null, missReason: "sem entrada" };
  });
}

/* ============================ a linha completa ============================ */

function entradaDoArtigo(extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const lentesDe = radarPortableExportLensLookupsFor(leiturasDoLote());
  const serpObservada = radarPortableExportSerpObservedInput({
    records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: ANALISE, reviews: REVISOES, reviewsReadable: true,
  });
  return {
    profile: "GOOGLE",
    blueprintView: { blueprint: null, sample: { label: "página(s)", count: 12 } } as never,
    exportedAt: "2026-09-23T12:00:00.000Z",
    article: {
      principalKeyword: "skincare facial", secondaryKeywords: ["skin care noturno"], narrativeReinforcements: [],
      intent: "Informacional", funnel: "Topo", siloName: "Cuidados com a Pele", articleRole: "SUPORTE",
      slug: "skincare-facial", mustCover: ["ordem dos produtos"],
    },
    articleModel: vista().articleModel,
    googleObserved: vista().observed,
    researchContext: contexto(),
    serpObserved: serpObservada,
    serpLenses: { keywords: KEYWORDS_DAS_LENTES, lookups: lentesDe(KEYWORDS_DAS_LENTES), readFailed: false },
    /* Como a rota: a coleta posterior avisada na SERP também é avisada na situação. */
    dossierGaps: radarPortableExportDossierGapsInput({
      analysis: ANALISE, profile: "GOOGLE", bundle: DOSSIE, readiness: PRONTO,
      article: { articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA }, exportedAt: "2026-09-23T12:00:00.000Z",
      newerSerpCollection: serpObservada.newerCollection,
    }),
    ...extra,
  };
}

const LINHA = buildRadarPortableExportRow(entradaDoArtigo());

/* ================================ A ================================ */

test("A · a SERP da coluna é a que o DOSSIÊ referencia, e a posterior é avisada", () => {
  const entradaDaSerp = radarPortableExportSerpObservedInput({
    records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: ANALISE, reviews: REVISOES, reviewsReadable: true,
  });

  /* O vinculado é a coleta da investigação, não a mais nova. */
  assert.equal(entradaDaSerp.snapshot?.collectedAt, PESQUISA.collectedAt);
  assert.ok(entradaDaSerp.newerCollection, "a coleta posterior não foi avisada");
  assert.equal(entradaDaSerp.review?.status, "approved");
  assert.equal(entradaDaSerp.serpDecisions?.length, 2, "a curadoria da SERP principal não atravessou");
  assert.equal(entradaDaSerp.deepResearchQueries?.length, 2);

  const json = JSON.parse(LINHA.serp_observed_json);
  assert.equal(json.available, true);
  assert.equal(json.query, "skincare facial");
  assert.equal(json.review.status, "aprovada");
  assert.ok(json.organic.length >= 10, "o top orgânico não chegou à coluna");
  assert.ok(json.organic.some((item: { url: string }) => item.url === URL_DE_TERCEIRO), "a URL do concorrente foi alterada");
  assert.ok(json.auxiliaryQueries.some((item: { query: string }) => item.query === "skin care noturno"), "a SERP da secundária sumiu");
  assert.ok(json.newerCollectionNotUsed, "o JSON não diz que há coleta posterior");
  assert.match(LINHA.serp_observed_md, /^# SERP observada na investigação/);
  assert.match(LINHA.serp_observed_md, /Há coleta posterior à investigação/);
  assert.match(LINHA.serp_observed_md, /trecho de terceiro — referência, não copiar/);
});

test("A · a curadoria NÃO atravessa para a SERP de apoio nem para outro registro", () => {
  const apoio = buildRadarEvidenceBundle({
    observed: vista().observed, serp: { current: true, sufficient: true, valid: true }, frozenAt: CONGELADO_EM,
    researchRefs: [{ source: "WEB_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH", ref: ID_DO_REGISTRO, fingerprint: PESQUISA.contentHash, collectedAt: PESQUISA.collectedAt, sampleSize: 12 }],
    editorialOutputs: [],
  });
  const comoApoio = { ...apoio, research: { ...apoio.research, google: apoio.research.google ? { ...apoio.research.google, role: "SUPPORT" as const } : null } };
  const deApoio = radarPortableExportSerpObservedInput({ records: REGISTROS, articleId: ARTIGO, bundle: comoApoio, analysis: ANALISE, reviews: REVISOES, reviewsReadable: true });
  assert.deepEqual(deApoio.serpDecisions, [], "curadoria posicional aplicada a uma SERP de apoio");

  const outraAnalise = { ...(ANALISE as object), serpSnapshotId: ID_DO_POSTERIOR } as never;
  const deOutra = radarPortableExportSerpObservedInput({ records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: outraAnalise, reviews: REVISOES, reviewsReadable: true });
  assert.deepEqual(deOutra.serpDecisions, [], "curadoria de outro registro aplicada à SERP vinculada");

  /* Revisão ilegível é "não lida", nunca "aguardando". */
  const ilegivel = radarPortableExportSerpObservedInput({ records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: ANALISE, reviews: [], reviewsReadable: false });
  const linha = buildRadarPortableExportRow(entradaDoArtigo({ serpObserved: ilegivel }));
  assert.equal(JSON.parse(linha.serp_observed_json).review.status, "não lida nesta exportação");
});

/*
 * ===== REVISÃO ADVERSARIAL (2026-09-23) · as datas e os rótulos da SERP =====
 *
 * Na SERP de APOIO (YouTube/Amazon), `camada.frozenAt` é a data da COLETA de
 * apoio (`camadaDeApoioDoGoogle`). A coluna dizia "Congelamento da
 * investigação: <coleta de apoio>", e a mesma linha trazia outra data em
 * `research_status_md`. E a SERP de apoio dizia "aguardando revisão humana"
 * de uma revisão que o fluxo nunca faz.
 */
test("A · na SERP de apoio, o congelamento é o da INVESTIGAÇÃO, e a revisão não se aplica", () => {
  const COLETA_DE_APOIO = "2026-09-01T10:00:00.000Z";
  const FINALIZADO_EM = "2026-09-15T18:00:00.000Z";
  const apoio = {
    research: {
      google: {
        role: "SUPPORT", frozenAt: COLETA_DE_APOIO,
        refs: [{ source: "WEB_SERP", role: "SEO_SUPPORT", ref: ID_DO_REGISTRO, fingerprint: null, collectedAt: COLETA_DE_APOIO, sampleSize: 0 }],
        counts: { queries: 1, items: 0 }, limitations: [],
      },
      youtube: null, amazon: null,
    },
  } as never;
  const payloadDoVideo = { youtubeFrozenInvestigation: { finalizedAt: FINALIZADO_EM }, serpDecisions: [], deepResearch: null, serpSnapshotId: null } as never;
  const entradaDeApoio = radarPortableExportSerpObservedInput({
    records: [REGISTRO], articleId: ARTIGO, bundle: apoio, analysis: payloadDoVideo, reviews: [], reviewsReadable: true,
  });
  assert.equal(entradaDeApoio.frozenAt, FINALIZADO_EM, "a data da coleta de apoio foi rotulada como congelamento");

  const md = radarPortableSerpObservedColumns(entradaDeApoio).serp_observed_md;
  assert.match(md, /Congelamento da investigação: 2026-09-15 18:00 UTC/);
  assert.equal(/Congelamento da investigação: 2026-09-01/.test(md), false);
  assert.match(md, /Revisão humana da SERP: não se aplica \(SERP de apoio/);

  /* Na principal do Google, a data é a mesma de antes: o congelamento gravado. */
  const principal = radarPortableExportSerpObservedInput({ records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: ANALISE, reviews: REVISOES, reviewsReadable: true });
  assert.equal(principal.frozenAt, CONGELADO_EM);
});

test("A · curadoria com todos os itens pendentes não é 'registrada'", () => {
  const pendentes = DECISOES.map(item => RadarSerpDecisionSchema.parse({ ...item, decision: "pending", reason: "" }));
  const entradaDaSerp = radarPortableExportSerpObservedInput({
    records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: { ...(ANALISE as object), serpDecisions: pendentes } as never,
    reviews: REVISOES, reviewsReadable: true,
  });
  const md = radarPortableSerpObservedColumns(entradaDaSerp).serp_observed_md;
  assert.match(md, /Curadoria humana item a item: iniciada, com todos os itens ainda pendentes/);
  assert.match(LINHA.serp_observed_md, /Curadoria humana item a item: registrada/, "com decisão tomada, continua 'registrada'");
});

test("A · a coleta posterior também é dita na SITUAÇÃO — as colunas de evidência partem dela", () => {
  assert.match(LINHA.research_status_md, /Há coleta de SERP posterior à investigação \(2026-09-22T09:00:00\.000Z\), não usada por ela\./);
  assert.match(LINHA.research_status_md, /competitors_structure_json e authority_requirements_md\) partem da coleta mais recente/);
  const semPosterior = buildRadarPortableExportRow(entradaDoArtigo({
    dossierGaps: radarPortableExportDossierGapsInput({
      analysis: ANALISE, profile: "GOOGLE", bundle: DOSSIE, readiness: PRONTO,
      article: { articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA }, exportedAt: "2026-09-23T12:00:00.000Z",
      newerSerpCollection: null,
    }),
  }));
  assert.equal(/coleta de SERP posterior/.test(semPosterior.research_status_md), false);
});

test("A · as lentes, a situação, a autoridade e os concorrentes chegam à linha", () => {
  /* Só as keywords DESTE artigo, sem repetir a principal escrita de outro jeito. */
  assert.deepEqual(KEYWORDS_DAS_LENTES.map(item => [item.keyword, item.role]), [["skincare facial", "principal"], ["skin care noturno", "secundaria"]]);
  assert.equal(KEYWORDS_DAS_LENTES[0].keywordId, KEYWORD, "o id da keyword precisa acompanhar o pedido ao cache");

  /* A leitura é uma só para o lote; cada artigo recebe só as leituras das keywords DELE. */
  const doArtigo = radarPortableExportLensLookupsFor(leiturasDoLote())(KEYWORDS_DAS_LENTES);
  assert.equal(doArtigo.length, 2 * 4, "cada keyword do artigo com as quatro lentes");
  assert.equal(doArtigo.some(item => item.request.query.keyword === "protetor solar oil free"), false, "a leitura de outro artigo do lote entrou neste");

  const lentes = JSON.parse(LINHA.serp_lenses_json);
  assert.deepEqual(lentes.keywords.map((item: { keyword: string }) => item.keyword), ["skincare facial", "skin care noturno"],
    "a leitura de outro artigo do lote entrou nesta coluna");
  assert.equal(lentes.keywords[0].readings.length, 4, "as quatro lentes, sempre, com a falta dita");
  assert.equal(lentes.keywords[0].readings.find((item: { lens: string }) => item.lens === "desktop-windows").observed, true);
  assert.match(LINHA.serp_lenses_md, /nenhuma coleta desta lente no cache/);

  assert.match(LINHA.research_status_md, /PRONTO PARA O REDATOR/);
  assert.match(LINHA.authority_requirements_md, /\S/);
  const concorrentes = JSON.parse(LINHA.competitors_structure_json);
  assert.ok(Array.isArray(concorrentes.competitors) && concorrentes.competitors.length > 0, "a estrutura dos concorrentes saiu vazia");

  /* O resumo da SERP no contexto completo: top 10, sem trecho de terceiro. */
  assert.match(LINHA.writer_context_md, /# SERP OBSERVADA/);
  assert.match(LINHA.writer_context_md, /Top 10 orgânico:/);
  const trecho = PESQUISA.organicResults.find(item => (item.snippet || "").length > 60)!.snippet.replace(/\s+/g, " ").trim().slice(0, 50);
  assert.ok(LINHA.serp_observed_md.includes(trecho), "o trecho marcado sumiu da coluna da SERP");
  assert.equal(LINHA.writer_context_md.includes(trecho), false, "trecho de terceiro no contexto que se cola em outra IA");
});

/*
 * ===== REVISÃO ADVERSARIAL (2026-09-23) · a chave das lentes é a do CACHE =====
 *
 * A deduplicação tirava os acentos; a chave do cache os mantém. A secundária
 * "oleo de rosa mosqueta" sumia da coluna sem aviso, embora seja outra consulta
 * para o cache. E "rosa  mosqueta" (espaço duplo) era lida e acertada, mas o
 * índice não a entregava ao artigo: a coluna dizia "nenhuma coleta".
 */
test("A · a variante sem acento é OUTRA consulta, e o espaço duplo não esconde a lente", () => {
  const keywords = radarPortableExportLensKeywords({
    keywordContext: { principal: "óleo de rosa mosqueta", secondary: ["oleo de rosa mosqueta", "rosa  mosqueta", "Óleo de Rosa Mosqueta "] },
    researchContext: { keywords: [{ identity: { keywordId: KEYWORD, text: "óleo de rosa mosqueta", role: "principal" } }] } as never,
  });
  assert.deepEqual(keywords.map(item => item.keyword), ["óleo de rosa mosqueta", "oleo de rosa mosqueta", "rosa mosqueta"],
    "a variante sem acento sumiu, ou a repetição com maiúsculas entrou");
  /* O id acompanha o pedido (para o alvo da keyword); sem texto exato, pelo texto sem acento. */
  assert.deepEqual(keywords.map(item => item.keywordId), [KEYWORD, KEYWORD, null]);

  const pedidos = radarPortableSerpLensRequests({ keywords, locationCode: 2076, languageCode: "pt" });
  assert.equal(pedidos.length, 3 * 4);
  const todasAcertaram = pedidos.map(pedido => ({
    request: pedido,
    hit: { meta: meta(pedido.query.keyword, pedido.query.lens, "2026-09-22T08:00:00.000Z"), observation: observacao(CORPO_ADVANCED, pedido.query.keyword, pedido.query.lens) },
    missReason: null,
  }));
  const lentesDe = radarPortableExportLensLookupsFor(todasAcertaram);
  assert.equal(lentesDe(keywords).length, 12, "leitura acertada que o índice não entregou ao artigo");
  /* O índice colapsa o espaço dos dois lados, mesmo que a keyword chegue crua. */
  assert.equal(lentesDe([{ keyword: "rosa  mosqueta", role: "secundaria" }]).length, 4);

  const coluna = JSON.parse(buildRadarPortableExportRow(entradaDoArtigo({
    serpLenses: { keywords, lookups: lentesDe(keywords), readFailed: false },
  })).serp_lenses_json);
  assert.deepEqual(coluna.keywords.map((item: { keyword: string }) => item.keyword), ["óleo de rosa mosqueta", "oleo de rosa mosqueta", "rosa mosqueta"]);
  assert.ok(coluna.keywords.every((item: { readings: Array<{ observed: boolean }> }) => item.readings.every(leitura => leitura.observed)),
    "uma lente gravada saiu como 'nenhuma coleta'");
});

/*
 * ===== REVISÃO ADVERSARIAL (2026-09-23) · os códigos do ALVO da keyword (A8) =====
 *
 * O Minerador grava o cache com os códigos do alvo da keyword; o export
 * consultava com os do ambiente e caía em outra chave quando os dois
 * divergiam. `codesFor` resolve por keyword; sem ele, o ambiente.
 */
test("A · o pedido ao cache usa os códigos do alvo de cada keyword, e o ambiente na falta", () => {
  const alvo = new Map([[KEYWORD, { locationCode: 2076, languageCode: "en" }]]);
  const pedidos = radarPortableSerpLensRequests({
    keywords: KEYWORDS_DAS_LENTES, locationCode: 2076, languageCode: "pt",
    codesFor: keywordId => (keywordId && alvo.get(keywordId)) || { locationCode: 2076, languageCode: "pt" },
  });
  const idiomaDe = (keyword: string) => [...new Set(pedidos.filter(item => item.query.keyword === keyword).map(item => item.query.languageCode))];
  assert.deepEqual(idiomaDe("skincare facial"), ["en"], "a keyword medida em inglês foi consultada na chave do ambiente");
  assert.deepEqual(idiomaDe("skin care noturno"), ["pt"]);
  /* Sem `codesFor`, o comportamento anterior: o ambiente para todas. */
  const semAlvo = radarPortableSerpLensRequests({ keywords: KEYWORDS_DAS_LENTES, locationCode: 2076, languageCode: "pt" });
  assert.ok(semAlvo.every(item => item.query.languageCode === "pt"));
});

/* ================================ B ================================ */

test("B · nenhum id NOSSO sai — nem dentro de URL — e a URL do concorrente sai intacta", () => {
  const csv = radarPortableExportCsv([LINHA]);

  for (const nosso of [MARCA, ARTIGO, VERSAO, KEYWORD, KEYWORD_SECUNDARIA, REVISOR, ID_DO_REGISTRO, ID_DO_POSTERIOR,
    PESQUISA.id, PESQUISA.contentHash, PESQUISA_POSTERIOR.id, ID_DA_TAREFA, "NOTA INTERNA DA REVISÃO"]) {
    assert.equal(csv.includes(nosso), false, `id nosso vazou: ${nosso}`);
  }
  for (const padrao of [/sha256:/, /\b(organic|paa|related):\d/, /serpSnapshotId|snapshotId|contentHash|reviewedBy|created_by|isMock/, /dataforseo/i]) {
    assert.equal(padrao.test(csv), false, `marca técnica no CSV: ${padrao}`);
  }

  /*
   * ===== A SEPARAÇÃO, SEM AFROUXAR A REGRA =====
   *
   * A URL do concorrente é conteúdo da página: alterá-la falsificaria a
   * referência. O teste de UUID do arquivo inteiro continua valendo para todo
   * o resto — só as URLs de TERCEIRO que a própria SERP gravou são retiradas
   * antes da varredura, e os ids nossos continuam proibidos até dentro delas.
   */
  assert.ok(csv.includes(URL_DE_TERCEIRO), "a URL legítima do concorrente foi alterada");
  const urlsDeTerceiro = new Set([
    ...PESQUISA.organicResults.flatMap(item => [item.url, ...item.sitelinks.map(link => link.url)]),
    ...PESQUISA.peopleAlsoAsk.map(item => item.sourceUrl || ""),
    ...(PESQUISA.serpFeatures?.aiOverview.references || []).map(item => item.url || ""),
    ...(PESQUISA.serpFeatures?.videos || []).map(item => item.url),
    ...(PESQUISA.knowledgeGraph ? [PESQUISA.knowledgeGraph.website || "", ...PESQUISA.knowledgeGraph.sources.map(fonte => fonte.url)] : []),
    ...PESQUISA_AUXILIAR.organicResults.map(item => item.url),
  ].filter(Boolean));
  let semTerceiros = csv;
  for (const url of urlsDeTerceiro) semTerceiros = semTerceiros.split(url).join(" ");
  const uuid = semTerceiros.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.equal(uuid, null, `UUID fora de URL de terceiro: ${uuid?.[0]}`);
});

/*
 * ===== REVISÃO ADVERSARIAL (2026-09-23) · o erro do servidor não vira motivo =====
 *
 * A tela grava "A coleta auxiliar desta keyword não foi concluída: <erro>", e o
 * erro vinha cru da rota da SERP ("O binding DataForSEO aponta para um
 * provider diferente", "O secret store ... não está disponível"). `textoPortatil`
 * só trocava o nome do fornecedor: provider, binding e secret store chegavam
 * ao CSV (invariante 43).
 */
test("B · a falha da coleta auxiliar sai numa frase neutra; o motivo de planejamento sai como está", () => {
  const consulta = (queryId: string, keyword: string, reason: string) => RadarDeepResearchQuerySchema.parse({
    queryId, keywordId: KEYWORD_SECUNDARIA, keyword, role: "secundaria", disposition: "EXECUTE",
    execution: "NOT_EXECUTED", serpClass: "auxiliary", evidence: null, reason,
  });
  const analise = {
    ...(ANALISE as object),
    deepResearch: {
      queries: [
        ...CONSULTAS,
        consulta("q:3", "skin care à noite", "A coleta auxiliar desta keyword não foi concluída: O binding DataForSEO aponta para um provider diferente."),
        consulta("q:4", "rotina facial noturna", "A coleta auxiliar desta keyword não foi concluída: O secret store DataForSEO não está disponível."),
        /* Outro formato de falha: o vocabulário de infraestrutura depois dos dois-pontos. */
        consulta("q:5", "sérum noturno", "Coleta interrompida: Connection refused pelo endpoint (HTTP 503)."),
        consulta("q:6", "creme noturno", "Repete a principal em intenção, funil, entidade e termos; executar traria a mesma leitura."),
      ],
    },
  } as never;
  const linha = buildRadarPortableExportRow(entradaDoArtigo({
    serpObserved: radarPortableExportSerpObservedInput({ records: REGISTROS, articleId: ARTIGO, bundle: DOSSIE, analysis: analise, reviews: REVISOES, reviewsReadable: true }),
  }));

  for (const coluna of ["serp_observed_md", "serp_observed_json", "writer_context_md"] as const) {
    for (const proibido of [/provider/i, /secret store/i, /\bbinding\b/i, /dataforseo/i, /connection refused/i, /endpoint/i, /HTTP 503/]) {
      assert.equal(proibido.test(linha[coluna]), false, `${coluna} carrega vocabulário de infraestrutura: ${proibido}`);
    }
  }
  const auxiliares = JSON.parse(linha.serp_observed_json).auxiliaryQueries as Array<{ query: string; reason: string | null }>;
  const motivo = (query: string) => auxiliares.find(item => item.query === query)?.reason;
  assert.equal(motivo("skin care à noite"), "A coleta auxiliar desta keyword não foi concluída nesta investigação; o detalhe técnico da falha não é exportado.");
  assert.equal(motivo("sérum noturno"), motivo("skin care à noite"));
  assert.equal(motivo("creme noturno"), "Repete a principal em intenção, funil, entidade e termos; executar traria a mesma leitura.");
});

/* ================================ C ================================ */

test("C · as proibições do Redator entram nas regras — e nenhuma regra se repete", () => {
  for (const coluna of ["writer_context_md", "writer_brief_md"] as const) {
    const texto = LINHA[coluna];
    assert.match(texto, /não reconfigurar o Silo/, `${coluna} sem a proibição de reconfigurar o silo`);
    assert.match(texto, /não substituir a composição de secundárias por decisão própria/, `${coluna} sem a proibição das secundárias`);
    const regras = texto.slice(texto.lastIndexOf("# REGRAS")).split("\n").filter(linha => linha.startsWith("- "));
    assert.equal(new Set(regras).size, regras.length, `${coluna} repetiu uma regra`);
    assert.match(regras[regras.length - 1], /sinalizar qualquer dependência que continue sem resolução\.$/, `${coluna} · a regra que fecha a lista deixou de ser a última`);
  }
});

/* ================================ D ================================ */

test("D · a leitura do cache que LANÇA não derruba o export", async () => {
  const falhas: unknown[] = [];
  const lida = await radarPortableExportReadLenses(async () => { throw new Error("banco fora do ar"); }, erro => falhas.push(erro));
  assert.deepEqual(lida, { lookups: [], readFailed: true });
  assert.equal(falhas.length, 1, "a falha precisa chegar ao registro do servidor");

  /* A configuração inválida dos códigos também lança — e também vira "cache indisponível". */
  const configuracao = await radarPortableExportReadLenses(async () => {
    readDataForSeoTargetCodes({ DATAFORSEO_LOCATION_CODE: "brasil" } as never);
    return [];
  });
  assert.equal(configuracao.readFailed, true);

  const linha = buildRadarPortableExportRow(entradaDoArtigo({ serpLenses: { keywords: KEYWORDS_DAS_LENTES, lookups: lida.lookups, readFailed: lida.readFailed } }));
  assert.match(linha.serp_lenses_md, /a leitura do cache falhou/);
  assert.equal(/nenhuma coleta desta lente/.test(linha.serp_lenses_md), false, "falha de leitura dita como ausência de coleta");
  /* O resto do dossiê sai inteiro. */
  assert.ok(linha.writer_brief_md.length > 500 && linha.serp_observed_md.length > 500);
});

/* ================================ E ================================ */

const uuid = (numero: number) => `3f2a${String(numero).padStart(4, "0")}-7c1d-4e2b-9a8f-${String(numero).padStart(12, "0")}`;
const hashDe = (numero: number) => `sha256:${numero.toString(16).padStart(64, "0")}`;

const SILO_PELE = uuid(101);
const SILO_NOITE = uuid(102);
const P1 = uuid(201), P2 = uuid(202), P3 = uuid(203), P4 = uuid(204);
const N1 = uuid(211), N2 = uuid(212);

let sequencia = 1000;
function siloDna(siloId: string, name: string, pilar: string, suportes: string[], ordem: string[]): VersionEnvelope<SiloDNA> {
  sequencia += 1;
  const membros = [pilar, ...suportes];
  return VersionedSiloDNASchema.parse({
    versionId: uuid(sequencia), entityId: siloId, versionNumber: 1, previousVersionId: null,
    contentHash: hashDe(sequencia), origin: "human", changeReason: "bancada",
    createdAt: "2026-09-11T10:00:00.000Z", createdBy: uuid(999),
    payload: {
      schemaVersion: 1, formationStatus: "formed", siloId, brandId: MARCA, name,
      territoryNarrative: { statement: "Rotina antes de produto.", continuity: "coherent", brandAlignment: "aligned", rationale: ["bancada"] },
      centralEntity: "pele", objective: "Autoridade em cuidados com a pele.", audience: "Quem começa uma rotina.",
      macroProblem: "Não saber por onde começar.", dominantIntent: "informacional",
      pillarArticleId: pilar, supportArticleIds: suportes,
      articleReferences: membros.map((articleId, indice) => ({ articleId, articleDnaVersionId: uuid(600 + indice), articleDnaContentHash: hashDe(600 + indice), role: articleId === pilar ? "Pilar" : "Suporte" })),
      articleRoles: membros.map(articleId => ({ articleId, role: articleId === pilar ? "Pilar" : "Suporte", reason: "bancada" })),
      narrativeOrder: ordem, linkMap: [], boundary: "Rosto; acne clínica fica fora.",
      includedTopics: ["limpeza"], excludedTopics: ["medicamento"], nearbySiloIds: [],
      possibleConflicts: [], gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [],
    },
  }) as VersionEnvelope<SiloDNA>;
}

const SILOS = [
  siloDna(SILO_PELE, "Cuidados com a Pele", P1, [P2, P3, P4], [P1, P3, P2]),
  siloDna(SILO_NOITE, "Rotina Noturna", N1, [N2], [N1, N2]),
];

const ARTIGOS = [
  { payload: { articleId: P4, brandId: MARCA, promise: "Protetor solar para pele oleosa", suggestedSlug: "protetor-solar-pele-oleosa" }, versionNumber: 2 },
  { payload: { articleId: P4, brandId: MARCA, promise: "Versão antiga do título", suggestedSlug: "antigo" }, versionNumber: 1 },
] as unknown as VersionEnvelope<ArticleDNA>[];

const linhaDe = (keyword: string, contextoDoSilo: RadarPortableExportInput["siloContext"]): RadarPortableExportRow => buildRadarPortableExportRow({
  profile: "GOOGLE",
  blueprintView: { blueprint: null, sample: { label: "página(s)", count: 0 } } as never,
  exportedAt: "2026-09-23T12:00:00.000Z",
  article: { principalKeyword: keyword, secondaryKeywords: [], narrativeReinforcements: [], intent: "Informacional", funnel: null, siloName: null, articleRole: null, slug: keyword.replace(/\s+/g, "-"), mustCover: [] },
  siloContext: contextoDoSilo,
});

function exportarPorSilo(itens: RadarSiloExportItem[]) {
  const plano = planRadarSiloExport({
    today: "2026-09-23T12:00:00.000Z", brandId: MARCA, items: itens, siloVersions: SILOS,
    memberDescriptors: radarSiloMemberDescriptorsWithTitles(ARTIGOS, MARCA),
  });
  const linhas = new Map(itens.filter(item => item.status === "finalized")
    .map(item => [item.articleId, linhaDe(item.principalKeyword || "", plano.contextByArticleId[item.articleId] ?? null)]));
  return { plano, arquivos: radarPortableExportSiloFiles({ plan: plano, rowsByArticleId: linhas }) };
}

const finalizado = (articleId: string, siloId: string, titulo: string, keyword: string): RadarSiloExportItem =>
  ({ articleId, siloId, status: "finalized", title: titulo, principalKeyword: keyword, slug: keyword.replace(/\s+/g, "-") });

test("E · um CSV por silo, na ordem do silo, e parcial com o faltante pelo título", () => {
  const { plano, arquivos } = exportarPorSilo([
    /* O pedido chega embaralhado: o arquivo sai na ordem do silo. */
    finalizado(P2, SILO_PELE, "Limpeza facial", "limpeza facial"),
    finalizado(P1, SILO_PELE, "Guia de cuidados com a pele", "cuidados com a pele"),
    finalizado(P3, SILO_PELE, "Hidratação leve", "hidratante leve"),
    finalizado(N1, SILO_NOITE, "Rotina noturna", "rotina noturna"),
    finalizado(N2, SILO_NOITE, "Sérum à noite", "serum noturno"),
    /* Recusado antes de o item ser lido: o silo vem da composição. */
    { articleId: P4, siloId: radarSiloIdFromComposition(P4, SILOS, MARCA), status: "not_finalized", title: null, reason: "Não há investigação gravada para este artigo." },
  ]);

  assert.equal(arquivos.length, 2);
  const [pele, noite] = arquivos;
  assert.match(pele.filename, /^radar-silo-cuidados-com-a-pele-2026-09-23-parcial\.csv$/);
  assert.match(noite.filename, /^radar-silo-rotina-noturna-2026-09-23\.csv$/);
  assert.equal(pele.silo.partial, true);
  assert.equal(noite.silo.partial, false);

  /* Faltante pelo TÍTULO (a promessa do ArticleDNA mais recente), nunca pelo id. */
  assert.deepEqual(pele.silo.pending.map(item => [item.title, item.status]), [["Protetor solar para pele oleosa", "não finalizado"]]);
  assert.equal(JSON.stringify(arquivos).includes(P4), false, "o id do faltante saiu na resposta");

  /* A ordem do silo: Pilar, depois a ordem narrativa. */
  const keywords = pele.csv.split("\r\n").slice(1).filter(Boolean).map(linha => linha.slice(1, linha.indexOf('"', 1)));
  assert.deepEqual(keywords, ["cuidados com a pele", "hidratante leve", "limpeza facial"]);
  assert.match(pele.csv, /Contexto do silo/);
  assert.match(pele.csv, /silo_context_json/);

  /* Dois arquivos viram UM zip. */
  assert.equal(plano.delivery.kind, "zip");
  const zip = radarStoredZipOfTexts(arquivos.map(arquivo => ({ name: arquivo.filename, text: arquivo.csv })));
  const nomes = new TextDecoder().decode(zip);
  assert.ok(nomes.includes(pele.filename) && nomes.includes(noite.filename));
  assert.equal(zip[0] === 0x50 && zip[1] === 0x4b, true, "o pacote não começa com a assinatura do zip");
  assert.deepEqual(radarPortableExportEmptySilos(plano), []);
});

test("E · silo sem nenhum finalizado não vira arquivo — vira aviso com os faltantes", () => {
  const { plano, arquivos } = exportarPorSilo([
    finalizado(P1, SILO_PELE, "Guia de cuidados com a pele", "cuidados com a pele"),
    { articleId: N1, siloId: SILO_NOITE, status: "not_finalized", title: "Rotina noturna", reason: "A investigação deste artigo não está finalizada." },
  ]);
  assert.equal(arquivos.length, 1);
  assert.equal(plano.delivery.kind, "csv");
  const vazios = radarPortableExportEmptySilos(plano);
  assert.equal(vazios.length, 1);
  assert.equal(vazios[0].name, "Rotina Noturna");
  /* N2 não foi pedido e não tem descritor: aparece como "não enviado", sem título conhecido — e nunca pelo id. */
  assert.deepEqual(vazios[0].pending.map(item => [item.title, item.status]), [
    ["Rotina noturna", "não finalizado"],
    ["artigo sem título conhecido", "não enviado ao Radar"],
  ]);
});

/*
 * ===== REVISÃO ADVERSARIAL (2026-09-23) · a ligação plano → linha =====
 *
 * Uma cópia da rota sem `siloContext: plano?.contextByArticleId[...]` passava
 * a suíte inteira: os testes acima montam a linha à mão. A ligação agora é a
 * ponte pura `radarPortableExportRows`, provada aqui com o plano REAL.
 */
test("E · as linhas do lote: o contexto do silo e as lentes entram pela ponte, com o plano real", () => {
  const plano = planRadarSiloExport({
    today: "2026-09-23T12:00:00.000Z", brandId: MARCA, siloVersions: SILOS,
    items: [
      finalizado(P1, SILO_PELE, "Guia de cuidados com a pele", "cuidados com a pele"),
      finalizado(P2, SILO_PELE, "Limpeza facial", "limpeza facial"),
      { articleId: P3, siloId: SILO_PELE, status: "not_finalized", title: "Hidratação leve", reason: "A investigação deste artigo não está finalizada." },
    ],
  });
  const artigos = [P1, P2].map(articleId => ({ articleId, entrada: entradaDoArtigo(), lentes: KEYWORDS_DAS_LENTES }));
  const leitura = { lookups: leiturasDoLote(), readFailed: false };

  const porSilo = radarPortableExportRows({ articles: artigos, lenses: leitura, plan: plano });
  assert.equal(porSilo.size, 2);
  for (const articleId of [P1, P2]) {
    assert.equal(porSilo.get(articleId)!.silo_context_md, plano.contextByArticleId[articleId].silo_context_md, "o contexto do silo não chegou à linha");
    assert.equal(porSilo.get(articleId)!.silo_context_json, plano.contextByArticleId[articleId].silo_context_json);
  }
  assert.match(porSilo.get(P1)!.silo_context_md, /parcial/);
  const lentes = JSON.parse(porSilo.get(P1)!.serp_lenses_json);
  assert.deepEqual(lentes.keywords.map((item: { keyword: string }) => item.keyword), ["skincare facial", "skin care noturno"]);

  /* E os arquivos por silo são montados com ESSAS linhas. */
  const [arquivo] = radarPortableExportSiloFiles({ plan: plano, rowsByArticleId: porSilo });
  assert.match(arquivo.csv, /silo_context_md/);
  assert.match(arquivo.csv, /# Contexto do silo/);

  /* Sem plano (dossiê avulso), nenhuma linha ganha contexto de silo. */
  const avulso = radarPortableExportRows({ articles: artigos, lenses: leitura, plan: null });
  assert.equal("silo_context_md" in avulso.get(P1)!, false);
  assert.equal("silo_context_json" in avulso.get(P1)!, false);
  /* A leitura que falhou chega à coluna de cada artigo. */
  const falhou = radarPortableExportRows({ articles: artigos, lenses: { lookups: [], readFailed: true }, plan: null });
  assert.match(falhou.get(P2)!.serp_lenses_md, /a leitura do cache falhou/);
});

test("E · a composição responde pelo silo só de quem ela lista, e da marca certa", () => {
  assert.equal(radarSiloIdFromComposition(P3, SILOS, MARCA), SILO_PELE);
  assert.equal(radarSiloIdFromComposition(uuid(999_001), SILOS, MARCA), null);
  assert.equal(radarSiloIdFromComposition(P3, SILOS, uuid(3)), null, "silo de outra marca emprestou o agrupamento");
  assert.deepEqual(radarSiloMemberDescriptorsWithTitles(ARTIGOS, MARCA), [{ articleId: P4, slug: "protetor-solar-pele-oleosa", title: "Protetor solar para pele oleosa" }]);
});

/* ================================ F ================================ */

const ITENS_DA_TELA = [
  { articleId: P1, siloId: SILO_PELE, title: "Guia de cuidados com a pele" },
  { articleId: P2, siloId: SILO_PELE, title: "Limpeza facial" },
  { articleId: P3, siloId: SILO_PELE, title: "Hidratação leve" },
  { articleId: "pagina-do-silo", siloId: SILO_PELE, title: "Cuidados com a pele (SiloPage)", unitType: "silo_page" },
  { articleId: N1, siloId: SILO_NOITE, title: "Rotina noturna" },
  { articleId: N2, siloId: SILO_NOITE, title: "Sérum à noite" },
  { articleId: "sem-silo-1", siloId: "", title: "Artigo avulso" },
];
const VERSOES_DA_TELA = Object.fromEntries(SILOS.map(versao => [versao.payload.siloId, versao]));

test("F · com seleção, o silo INTEIRO; sem seleção, todos — e a SiloPage nunca vira linha", () => {
  const selecao = radarSiloExportScope({ items: ITENS_DA_TELA, selectedArticleIds: [P2], siloVersions: VERSOES_DA_TELA });
  assert.equal(selecao.mode, "selection");
  assert.deepEqual(selecao.articleIds, [P1, P2, P3], "selecionar um artigo precisa levar o silo inteiro");
  assert.deepEqual(selecao.silos, [{ label: "Cuidados com a Pele", inRadar: 3, inSiloDna: 4 }]);

  const tudo = radarSiloExportScope({ items: ITENS_DA_TELA, selectedArticleIds: [], siloVersions: VERSOES_DA_TELA });
  assert.equal(tudo.mode, "all");
  assert.equal(tudo.articleIds.includes("pagina-do-silo"), false, "a SiloPage entrou no pedido");
  assert.equal(tudo.withoutSilo, 1);
  assert.equal(radarSiloExportPreview(tudo), "Todos os silos: 2 silo(s) · 5 artigo(s) no Radar · 6 no SiloDNA · 1 sem silo");

  /* A prévia conta pelo SiloDNA, nunca pelo id: silo sem SiloDNA carregado não mostra o id. */
  const semDna = radarSiloExportScope({ items: ITENS_DA_TELA, selectedArticleIds: [], siloVersions: {} });
  assert.equal(JSON.stringify(semDna.silos).includes(SILO_PELE), false);
  assert.ok(semDna.silos.every(silo => silo.label === "Silo sem nome"));
});

test("F · os avisos: parcial é ATENÇÃO com o título; completo não diz 'sucesso'", () => {
  const parcial = radarSiloExportNotice({
    response: {
      exported: 3, refused: [{ articleId: P4, reason: "Não há investigação gravada." }],
      files: [{ filename: "radar-silo-cuidados-com-a-pele-2026-09-23-parcial.csv", silo: { name: "Cuidados com a Pele", partial: true, exported: 3, total: 4, pending: [{ title: "Protetor solar para pele oleosa", status: "não finalizado" }] } }],
      warnings: ['Silo "Cuidados com a Pele" saiu parcial: 3 de 4 artigos finalizados. Faltam: "Protetor solar para pele oleosa" (não finalizado).'],
    },
    delivered: { filename: "radar-silo-cuidados-com-a-pele-2026-09-23-parcial.csv", files: 1 },
    titleOf: articleId => (articleId === P4 ? "Protetor solar para pele oleosa" : null),
  });
  assert.equal(parcial.type, "warning");
  assert.match(parcial.message, /Protetor solar para pele oleosa/);
  assert.match(parcial.message, /entregue ao navegador/);
  /* O motivo da recusa, que o aviso não dizia. */
  assert.match(parcial.message, /Ficaram de fora: "Protetor solar para pele oleosa" \(Não há investigação gravada\)/);

  const completo = radarSiloExportNotice({
    response: { exported: 2, refused: [], files: [{ filename: "radar-silo-rotina-noturna-2026-09-23.csv", silo: { name: "Rotina Noturna", partial: false, exported: 2, total: 2, pending: [] } }], warnings: [] },
    delivered: { filename: "radar-silo-rotina-noturna-2026-09-23.csv", files: 1 },
    titleOf: () => null,
  });
  assert.equal(completo.type, "info");
  for (const aviso of [parcial, completo]) assert.equal(/sucesso|confirmad/i.test(aviso.message), false, "download anunciado como sucesso confirmado");

  /* O dossiê avulso: a recusa aparece pelo título, e o silo pela metade ganha a recomendação. */
  const avulso = radarDossierExportNotice({
    headline: "2 dossiê(s) exportado(s); 1 artigo(s) ficaram de fora por não estarem finalizados.",
    refused: [{ articleId: N2, reason: "A investigação deste artigo não está finalizada." }],
    titleOf: articleId => ITENS_DA_TELA.find(item => item.articleId === articleId)?.title || null,
    partialSilos: radarPartiallySelectedSilos({ items: ITENS_DA_TELA, selectedArticleIds: [P1, N1, N2], siloVersions: VERSOES_DA_TELA }),
  });
  assert.equal(avulso.type, "warning");
  assert.match(avulso.message, /"Sérum à noite" \(A investigação deste artigo não está finalizada\)/);
  assert.match(avulso.message, /Recomendado: exportar o silo completo/);
  assert.match(avulso.message, /"Cuidados com a Pele" \(1 de 3 artigos do Radar\)/);
  assert.equal(avulso.message.includes(N2), false, "o id do recusado saiu no aviso");

  /* A recusa do lote inteiro chega com quem ficou de fora, sem id. */
  const falha = radarExportFailureNotice(
    new RadarExportRefusedError("Nenhum dos artigos selecionados tem investigação finalizada para exportar.", [{ articleId: N1, code: "radar_item_not_found", reason: "Não há investigação gravada." }, { lixo: true }], [{ name: "Rotina Noturna", pending: [{ title: "Rotina noturna", status: "não finalizado" }] }]),
    "Falha ao exportar os silos.",
    articleId => ITENS_DA_TELA.find(item => item.articleId === articleId)?.title || null,
  );
  assert.equal(falha.type, "error");
  assert.match(falha.message, /Ficaram de fora: "Rotina noturna"/);
  assert.match(falha.message, /Faltam em "Rotina Noturna"/);
  assert.equal(falha.message.includes(N1), false);
});

/*
 * ===== REVISÃO ADVERSARIAL (2026-09-23) · o aviso por silo nomeia a recusa =====
 *
 * O aviso lia só `warnings` e `emptySilos`. O artigo SEM SILO recusado nunca
 * era nomeado (o plano só o conta), e o motivo de recusa nenhuma aparecia: a
 * tela mostrava ATENÇÃO sem dizer quem saiu.
 */
test("F · o aviso por silo nomeia quem ficou de fora — inclusive sem silo — com o motivo", () => {
  const SEM_SILO_PRONTO = uuid(241), SEM_SILO_PENDENTE = uuid(242);
  const titulos: Record<string, string> = { [P1]: "Guia de cuidados com a pele", [SEM_SILO_PRONTO]: "Avulso pronto", [SEM_SILO_PENDENTE]: "Avulso pendente" };
  const titleOf = (articleId: string) => titulos[articleId] || null;
  const recusa = { articleId: SEM_SILO_PENDENTE, code: "radar_item_not_found", reason: "Não há investigação gravada para este artigo." };

  const avisoDe = (itens: RadarSiloExportItem[]) => {
    const plano = planRadarSiloExport({ today: "2026-09-23T12:00:00.000Z", brandId: MARCA, items: itens, siloVersions: SILOS });
    const linhas = new Map(itens.filter(item => item.status === "finalized")
      .map(item => [item.articleId, linhaDe(item.principalKeyword || "", plano.contextByArticleId[item.articleId] ?? null)]));
    const files = radarPortableExportSiloFiles({ plan: plano, rowsByArticleId: linhas });
    return radarSiloExportNotice({
      response: { exported: linhas.size, refused: [recusa], files, emptySilos: radarPortableExportEmptySilos(plano), warnings: plano.warnings },
      delivered: files.length ? { filename: files.length > 1 ? "radar-silos-2026-09-23.zip" : files[0].filename, files: files.length } : null,
      titleOf,
    });
  };
  const pendente = { articleId: SEM_SILO_PENDENTE, siloId: null, status: "not_finalized" as const, title: "Avulso pendente", reason: recusa.reason };

  /* Com um sem-silo finalizado (há arquivo "sem silo") e outro recusado. */
  const comArquivo = avisoDe([
    finalizado(P1, SILO_PELE, "Guia de cuidados com a pele", "cuidados com a pele"),
    { articleId: SEM_SILO_PRONTO, siloId: null, status: "finalized", title: "Avulso pronto", principalKeyword: "limpeza" },
    pendente,
  ]);
  assert.equal(comArquivo.type, "warning");
  assert.match(comArquivo.message, /Ficaram de fora: "Avulso pendente" \(Não há investigação gravada para este artigo\)\./);

  /* Sem nenhum sem-silo finalizado: o plano só conta — o aviso nomeia. */
  const semArquivo = avisoDe([finalizado(P1, SILO_PELE, "Guia de cuidados com a pele", "cuidados com a pele"), pendente]);
  assert.match(semArquivo.message, /Avulso pendente/);
  for (const aviso of [comArquivo, semArquivo]) assert.equal(aviso.message.includes(SEM_SILO_PENDENTE), false, "o id do recusado saiu no aviso");
});

test("F · acima do teto do servidor, o aviso vem ANTES do pedido — e a rota usa o mesmo teto", async () => {
  const ids = (quantos: number) => Array.from({ length: quantos }, (_, indice) => `artigo-${indice}`);
  assert.equal(radarSiloExportScopeLimitNotice({ mode: "all", articleIds: ids(RADAR_EXPORT_MAX_ARTICLES) }), null);
  const acima = radarSiloExportScopeLimitNotice({ mode: "all", articleIds: ids(RADAR_EXPORT_MAX_ARTICLES + 1) });
  assert.equal(acima?.type, "warning");
  assert.match(acima!.message, /acima do limite de 500 por exportação\. Selecione alguns silos/);

  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8"));
  assert.match(rota, /articleIds: z\.array\([^\n]*\)\.min\(1\)\.max\(RADAR_EXPORT_MAX_ARTICLES\)/, "o teto da rota e o da tela divergiram");
  const pagina = semComentarios(await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const exportar = pagina.slice(pagina.indexOf("const exportarSilosCompletos"), pagina.indexOf("await fetch(\"/api/editorial/radar-export\"", pagina.indexOf("const exportarSilosCompletos")));
  assert.match(exportar, /radarSiloExportScopeLimitNotice\(escopo\)/, "o teto não é conferido antes do pedido");
});

/*
 * ===== REVISÃO ADVERSARIAL (2026-09-23) · a faixa segue a severidade =====
 *
 * Sistema visual §5.1: INFO → context-accent, WARNING → warning, ERROR →
 * danger. A faixa inline saía sempre na cor de atenção e com role=status.
 */
test("F · a faixa do aviso de export usa a cor e o papel da severidade", async () => {
  const pagina = semComentarios(await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const tom = pagina.slice(pagina.indexOf("const TOM_DO_AVISO_DE_EXPORT"), pagina.indexOf("};", pagina.indexOf("const TOM_DO_AVISO_DE_EXPORT")));
  assert.match(tom, /info: "[^"]*\bborder-context-accent\/40\b[^"]*\btext-context-accent\b[^"]*"/);
  assert.match(tom, /warning: "[^"]*\bborder-warning\/40\b[^"]*\btext-warning\b[^"]*"/);
  assert.match(tom, /error: "[^"]*\bborder-danger\/40\b[^"]*\btext-danger\b[^"]*"/);
  assert.equal(/#[0-9a-f]{3,6}\b|rgb\(/i.test(tom), false, "cor fixa na faixa");

  const faixa = pagina.slice(pagina.lastIndexOf("<div", pagina.indexOf('data-testid="radar-export-notice"')), pagina.indexOf("</div>", pagina.indexOf('data-testid="radar-export-notice"')));
  assert.match(faixa, /TOM_DO_AVISO_DE_EXPORT\[avisoDeExport\.type\]/, "a faixa não lê a severidade do aviso");
  assert.match(faixa, /role=\{avisoDeExport\.type === "error" \? "alert" : "status"\}/);
  assert.equal(/border-warning\/40 bg-warning-soft\/30/.test(faixa), false, "a faixa voltou a ter a cor de atenção fixa");
  assert.match(faixa, /text-sm/);
});

test("F · o menu: o item recomendado vem PRIMEIRO, com selo em 14px, e o download não vira 'sucesso'", async () => {
  const pagina = (await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const barra = pagina.slice(pagina.indexOf("const renderTopbarActions"), pagina.indexOf("const openDetail"));
  const menu = barra.slice(barra.indexOf('role="menu"'));
  const primeiroItem = menu.slice(menu.indexOf("<button"), menu.indexOf("</button>") + "</button>".length);

  assert.match(primeiroItem, /data-testid="radar-export-silos"/, "o primeiro item do menu não é o export por silo");
  assert.match(primeiroItem, /Silos completos · um CSV por silo/);
  assert.match(primeiroItem, /Recomendado/);
  assert.match(primeiroItem, /Todos os artigos finalizados de cada silo, na ordem do silo, com a SERP de cada um/);
  /* O selo segue o padrão "Em foco" da planilha (mesma borda e cor), em 14px. */
  assert.match(primeiroItem, /rounded border border-context-accent\/35 px-1\.5 py-0\.5 text-sm font-semibold text-context-accent">Recomendado/);
  assert.equal(/text-xs|#[0-9a-f]{3,6}\b|rgb\(/i.test(primeiroItem), false, "texto abaixo de 14px ou cor fixa no item novo");
  assert.match(primeiroItem, /radarSiloExportPreview\(radarSiloExportScope\(/, "a prévia não conta pelo silo do item");
  assert.match(primeiroItem, /void exportarSilosCompletos\(\)/);

  const codigo = semComentarios(pagina);
  const inicio = codigo.indexOf("const exportarSilosCompletos");
  const exportar = codigo.slice(inicio, codigo.indexOf("};", codigo.indexOf("finally", inicio)));
  assert.match(exportar, /groupBy: "silo"/);
  assert.match(exportar, /radarSiloExportScope\(/);
  assert.match(exportar, /arquivos\.length === 1/);
  assert.match(exportar, /radarStoredZipOfTexts\(/);
  assert.match(exportar, /radarSiloExportNotice\(/);
  assert.equal(/siloLabel\(/.test(exportar), false, "o escopo voltou a usar o rótulo de silo da planilha");
  assert.equal(/sucesso/i.test(exportar), false);

  /* O dossiê avulso passou a tratar `refused` e a recomendar o silo completo. */
  const avulsoInicio = codigo.indexOf("const exportarDossiesFinalizados");
  const avulso = codigo.slice(avulsoInicio, codigo.indexOf("const tituloDoArtigoExportado", avulsoInicio));
  assert.match(avulso, /refused: corpo\.refused/);
  assert.match(avulso, /radarPartiallySelectedSilos\(/);

  /* O aviso do export usa o mesmo mecanismo de notificação, com severidade. */
  assert.match(codigo, /useNoticeBridge\(\{ notice: avisoDeExport,/);
});

/* ================================ G ================================ */

test("G · o campo novo das autoridades fica FORA do dossiê: o hash não muda", () => {
  const base = {
    analysis: { versionId: "v3", versionNumber: 3, payload: { finalizedBundle: { frozenAt: CONGELADO_EM, limitations: [] }, serpSnapshotId: ID_DO_REGISTRO } } as never,
    article: { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA },
    observedAt: CONGELADO_EM,
  };
  const google = vista() as never;
  const sem = resolveRadarCanonicalDossier({ ...base, authorities: { google, video: null, specialist: null, researchContext: null } });
  const com = resolveRadarCanonicalDossier({ ...base, authorities: { google, video: null, specialist: null, researchContext: null, radarItem: { siloId: SILO_PELE, title: "Título", slug: "slug", unitType: "article" } } });
  assert.equal(sem.ok && com.ok, true);
  if (!sem.ok || !com.ok) return;
  assert.equal(com.dossier.bundle.bundleHash, sem.dossier.bundle.bundleHash, "o item do Radar entrou no hash do dossiê");
  assert.equal(JSON.stringify(com.dossier.bundle).includes(SILO_PELE), false);
});

/* ================================ H ================================ */

test("H · a rota liga as colunas novas com leituras por LOTE, sem coleta e sem mexer no E4", async () => {
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8"));

  /* O corpo aceita o agrupamento, e só ele: o schema continua estrito. */
  assert.match(rota, /groupBy: z\.literal\("silo"\)\.optional\(\)/);
  assert.match(rota, /\}\)\.strict\(\)/);

  /* As entradas novas saem das pontes puras testadas acima. */
  /* A SERP sai antes da entrada: a coleta posterior também vai para a situação. */
  assert.match(rota, /const serpObservada = radarPortableExportSerpObservedInput\(\{/);
  assert.match(rota, /serpObserved: serpObservada,/);
  assert.match(rota, /newerSerpCollection: serpObservada\.newerCollection/);
  assert.match(rota, /dossierGaps: radarPortableExportDossierGapsInput\(\{/);
  assert.match(rota, /readiness: canonico\.dossier\.readiness/);
  assert.match(rota, /reviewsReadable: revisoes\.available/);

  /* Uma leitura de revisões e uma do cache — ambas FORA do laço por artigo. */
  const laco = rota.slice(rota.indexOf("for (const articleId of"), rota.indexOf("const lentes ="));
  assert.equal(/listReviews|lookupSerpCache/.test(laco), false, "leitura por artigo onde devia ser por lote");
  assert.equal((rota.match(/\.listReviews\(/g) || []).length, 1);
  assert.equal((rota.match(/lookupSerpCache\(/g) || []).length, 1);
  assert.match(rota, /mode: "observation"/);
  assert.match(rota, /radarPortableExportReadLenses\(/, "a falha do cache precisa ser contida");
  assert.match(rota, /readDataForSeoTargetCodes\(\)/);

  /*
   * A8 (revisão adversarial): os códigos do ALVO de cada keyword, por uma
   * leitura estreita por lote, dentro da leitura contida das lentes.
   */
  const leituraDasLentes = rota.slice(rota.indexOf("const lentes ="), rota.indexOf("const plano ="));
  assert.match(leituraDasLentes, /const ambiente = readDataForSeoTargetCodes\(\)/);
  assert.match(leituraDasLentes, /readMineradorKeywordTargetCodes\(\s*profile\.supabase,\s*input\.brandId,/);
  assert.match(leituraDasLentes, /codesFor: keywordId => serpTargetCodesFor\(alvos\.codes, keywordId, ambiente\)/, "o pedido ao cache voltou aos códigos do ambiente");
  assert.equal((rota.match(/readMineradorKeywordTargetCodes\(/g) || []).length, 1);

  /* O silo agrupa pelo item do Radar, e o plano só existe quando pedido. */
  assert.match(rota, /siloId: autoridades\.radarItem\?\.siloId/);
  assert.match(rota, /input\.groupBy === "silo"\s*\?\s*planRadarSiloExport\(\{/);
  assert.match(rota, /files: radarPortableExportSiloFiles\(\{ plan: plano, rowsByArticleId: linhaPorArtigo \}\)/);

  /*
   * A LIGAÇÃO plano → linha (revisão adversarial): as linhas saem da ponte
   * pura, com o plano; e o recusado continua membro do silo nos TRÊS ramos
   * de recusa — senão ele sumiria do plano e sairia "não enviado ao Radar".
   */
  assert.match(rota, /const linhaPorArtigo = radarPortableExportRows\(\{ articles: montadas, lenses: lentes, plan: plano \}\)/,
    "as linhas deixaram de receber o contexto do silo pela ponte testada");
  const lacoDasRecusas = rota.slice(rota.indexOf("for (const articleId of"), rota.indexOf("const lentes ="));
  const recusas = lacoDasRecusas.split("recusados.push(").slice(1);
  assert.equal(recusas.length, 3, "um ramo de recusa novo precisa entrar no plano do silo");
  for (const ramo of recusas) {
    assert.match(ramo.slice(0, ramo.indexOf("continue;")), /itensDoSilo\.push\(faltante\(/, "um artigo recusado sumiu do plano do silo");
  }

  /*
   * O CSV DO LOTE SÓ NO AVULSO (revisão adversarial, must-fix de egress): com
   * `groupBy: "silo"` as mesmas linhas vão em `files[].csv`, e mandar os dois
   * dobrava a resposta.
   */
  assert.match(rota, /\.\.\.\(plano\s*\?\s*\{\}\s*:\s*\{\s*csv: radarPortableExportCsv\(rows\),\s*filename: radarPortableExportFilename\(/,
    "o CSV do lote voltou a sair também no export por silo (ou sumiu do avulso)");
  assert.equal((rota.match(/csv: radarPortableExportCsv\(/g) || []).length, 1);
  /* E a tela, no export por silo, não depende dele. */
  const pagina = semComentarios(await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const inicio = pagina.indexOf("const exportarSilosCompletos");
  const exportarSilos = pagina.slice(inicio, pagina.indexOf("};", pagina.indexOf("finally", inicio)));
  assert.equal(/corpo\.csv|corpo\.filename/.test(exportarSilos), false, "a tela passou a ler o CSV do lote no export por silo");
  assert.match(exportarSilos, /radarSiloExportNotice\(\{[^}]*titleOf: tituloDoArtigoExportado/, "o aviso por silo não recebe os títulos dos recusados");

  /* E nada disso coleta, grava ou lê tudo. */
  assert.equal(/executeDataForSeo|collectDataForSeo|collectAndCacheSerp|collectRadarGoogleSupport/.test(rota), false);
  assert.equal(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|select\("\*"\)/.test(rota), false);

  /*
   * E4 (2026-09-23): a análise corrente sai da leitura estreita do export, uma
   * por artigo, e as autoridades continuam uma chamada por artigo. O estado
   * inteiro não é mais lido pela rota (ver radar-export-leitura-por-artigo).
   */
  assert.equal((rota.match(/radarStartPorts\.loadRadarState\(/g) || []).length, 0);
  assert.equal((rota.match(/radarExportArticleReads\.currentAnalysis\(/g) || []).length, 1);
  assert.equal((rota.match(/loadRadarCanonicalAuthorities\(\{/g) || []).length, 1);
});

test("H · as pontes do lote são puras", async () => {
  for (const caminho of ["../lib/radar/portable-export-batch.ts", "../lib/radar/portable-silo-scope.ts"]) {
    const fonte = semComentarios(await readFile(new URL(caminho, import.meta.url), "utf8"));
    assert.equal(/fetch\(|supabase|createClient|localStorage|indexedDB|from "react"|lib\/server/i.test(fonte), false, `${caminho} deixou de ser puro`);
  }
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
