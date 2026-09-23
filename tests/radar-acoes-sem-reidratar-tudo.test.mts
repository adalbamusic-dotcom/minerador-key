import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/**
 * AS AÇÕES DO RADAR NÃO REIDRATAM O ITEM INTEIRO — e decidem igual.
 *
 * Medido em 2026-09-23 (cota Free da Supabase estourada), item mais pesado:
 * 0,90 MB de linha + 7,32 MB de corridas = 8,22 MB por chamada.
 *
 *   extração (lote de 5 páginas)   8,22 MB -> 0,90 MB   (não lê corrida)
 *   verificação de fontes (lote)   8,22 MB -> ≤ 2,57 MB (só a corrida pedida)
 *   trava da gravação              8,22 MB -> 2,50 MB   (só a corrida da
 *                                  corrente; 0,90 MB se não finalizada)
 *
 * A extração e a verificação rodam em LAÇO no cliente, um POST por lote: o
 * custo se multiplicava pelo número de lotes de cada investigação.
 *
 * Tudo roda contra um PostgREST SIMULADO: o cliente Supabase é o real, e só o
 * `fetch` global é trocado (mesmo desenho de radar-reidratacao-seletiva). O
 * simulado registra cada pedido — é assim que se prova que
 * `radar_analysis_runs` não foi consultada, ou com que filtro foi.
 *
 * O ORÁCULO é a própria rota com a leitura antiga: o método novo é trocado,
 * no protótipo, por `findByArticle` (que continua reidratando tudo), a rota
 * roda de novo sobre o mesmo banco semeado, e as duas respostas são
 * comparadas byte a byte.
 */

/* ======================= ambiente sem rede ======================= */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

/*
 * Autorização inerte e navegação externa determinística. A extração e a
 * verificação reais buscariam páginas na internet; aqui o que se testa é a
 * LEITURA da autoridade persistida e a decisão sobre ela, não o fetch.
 */
const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return { userId: 'ator-de-teste' }; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
  "@/lib/radar/competitor-extractor": [
    "export class CompetitorExtractionError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }",
    "export async function extractCompetitorPage(url, options) { return { url, keyword: (options && options.keyword) || null }; }",
  ].join("\n"),
  "@/lib/radar/source-verification": [
    "export async function verifyRadarSources(input) {",
    "  return { verified: [], failures: input.targets.map(alvo => ({ sourceId: alvo.sourceId, domain: alvo.domain, code: 'STUB', message: 'sem rede no teste' })), limitations: ['stub'] };",
    "}",
  ].join("\n"),
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);

/* ======================= PostgREST simulado ======================= */

type Linha = Record<string, unknown>;
type Pedido = { metodo: string; tabela: string; params: URLSearchParams };

const banco: Record<string, Linha[]> = {
  editorial_workflow_items: [],
  radar_analysis_runs: [],
  editorial_serp_snapshots: [],
};
const pedidos: Pedido[] = [];

const PARAMETROS_NAO_FILTRO = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function casa(linha: Linha, params: URLSearchParams): boolean {
  for (const [coluna, filtro] of params) {
    if (PARAMETROS_NAO_FILTRO.has(coluna)) continue;
    const valor = linha[coluna] === null || linha[coluna] === undefined ? "null" : String(linha[coluna]);
    if (filtro.startsWith("eq.")) {
      if (valor !== filtro.slice(3)) return false;
      continue;
    }
    if (filtro.startsWith("in.(") && filtro.endsWith(")")) {
      const lista = filtro.slice(4, -1).split(",").map(item => item.replace(/^"|"$/g, ""));
      if (!lista.includes(valor)) return false;
      continue;
    }
    throw new Error(`filtro não simulado: ${coluna}=${filtro}`);
  }
  return true;
}

function projeta(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return structuredClone(linha);
  return Object.fromEntries(select.split(",").map(coluna => [coluna, structuredClone(linha[coluna])]));
}

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname !== "supabase.teste.invalid") throw new Error(`rede real proibida neste teste: ${url.href}`);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  const metodo = String(init?.method || "GET").toUpperCase();
  const cabecalhos = new Headers(init?.headers);
  pedidos.push({ metodo, tabela, params: new URLSearchParams(url.searchParams) });

  const linhas = (banco[tabela] || []).filter(linha => casa(linha, url.searchParams));
  const select = url.searchParams.get("select");
  if (metodo === "GET") return json(linhas.map(linha => projeta(linha, select)));
  if (metodo === "PATCH") {
    const mudanca = JSON.parse(String(init?.body || "{}")) as Linha;
    for (const linha of linhas) {
      Object.assign(linha, mudanca);
      linha.lock_version = Number(linha.lock_version) + 1;
      linha.updated_at = "2026-09-23T12:00:00.123456+00:00";
    }
    const devolve = String(cabecalhos.get("Prefer") || "").includes("return=representation");
    return devolve ? json(linhas.map(linha => projeta(linha, select))) : new Response(null, { status: 204 });
  }
  if (metodo === "POST") {
    /* O upsert da corrida da versão nova (guardarCorridas). */
    const corpo = JSON.parse(String(init?.body || "[]")) as Linha | Linha[];
    const conflito = String(url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    banco[tabela] = banco[tabela] || [];
    for (const nova of Array.isArray(corpo) ? corpo : [corpo]) {
      const existente = conflito.length ? banco[tabela].find(linha => conflito.every(coluna => String(linha[coluna]) === String(nova[coluna]))) : undefined;
      if (existente) Object.assign(existente, nova);
      else banco[tabela].push(structuredClone(nova));
    }
    return new Response(null, { status: 201 });
  }
  throw new Error(`método não simulado: ${metodo} ${tabela}`);
}) as typeof fetch;

const leiturasDeCorridas = () => pedidos.filter(pedido => pedido.tabela === "radar_analysis_runs" && pedido.metodo === "GET");

/* ======================= módulos do projeto ======================= */

const { WorkflowRepository } = await import("../lib/server/editorial-repositories.ts");
const { splitAnalysisRun } = await import("../lib/radar/analysis-run-storage.ts");
const { RadarAnalysisPayloadSchema, RadarExtractionPageSchema, VersionedRadarAnalysisSchema } = await import("../lib/radar/analysis-contracts.ts");
const { radarGoogleResearchWriteLock } = await import("../lib/radar/google-research-write-lock.ts");
const { buildRadarSourceVerificationPlan } = await import("../lib/radar/source-authority.ts");
const { buildRadarEvidenceClaims } = await import("../lib/radar/claim-evidence.ts");
const { buildRadarExternalSourceResearch } = await import("../lib/radar/link-and-source-research.ts");
const { buildRadarSemanticConceptModel } = await import("../lib/radar/semantic-concept-model.ts");
const { NextRequest } = await import("next/server");
const rotaDeExtracao = await import("../app/api/editorial/radar-analysis/extract/route.ts");
const rotaDeFontes = await import("../app/api/editorial/radar-analysis/verify-sources/route.ts");
const rotaDeAnalise = await import("../app/api/editorial/radar-analysis/route.ts");

/* ======================= fixtures ======================= */

const MARCA = "5f0c3a52-8d4e-4b7a-9c61-2e8f4a1b7c90";
const ARTIGO = "artigo-pele-oleosa";
const ITEM = "wf-radar-acoes";
const HASH = `sha256:${"b".repeat(64)}`;
const KEYWORDS = ["skincare para pele oleosa"];
const ENTIDADES = ["pele oleosa"];

const link = (patch: Record<string, unknown> = {}) => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org",
  kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Causas da pele oleosa", rel: [], target: null, order: 0,
  ...patch,
});

/* Páginas com citações: é delas que o plano de fontes nasce. */
function pagina(id: string, indice: number) {
  const links = indice < 4
    ? [link()]
    : [link({ destinationUrl: "https://pubmed.ncbi.nlm.nih.gov/12345/", destinationDomain: "pubmed.ncbi.nlm.nih.gov", anchorText: "estudo" })];
  return RadarExtractionPageSchema.parse({
    id: `${id}-p${indice}`, url: `https://concorrente-${indice}.test/${id}`, status: "success",
    fetchedAt: "2026-09-20T10:00:00.000Z", title: `Concorrente ${indice}`, metaDescription: "", canonical: null,
    h1: ["Pele oleosa"], h2: ["Causas da pele oleosa", "Pode usar ácido salicílico na gravidez?"], h3: [], wordCount: 1600,
    internalLinkCount: 0, externalLinkCount: links.length, listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2,
    blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"],
    recurringTerms: [], boldCount: 3, italicCount: 0, observedLinks: links, error: null,
    introText: `o corpo pesado da versão ${id}`.repeat(20),
  });
}

/* Uma fotografia mínima e válida: a trava só pergunta se ela EXISTE. */
const FOTOGRAFIA = {
  bundleId: "bundle-1", bundleHash: "hash-1", frozenAt: "2026-09-20T12:00:00.000Z", frozenBy: "user-1",
  conclusion: "FINALIZABLE", acknowledgedInsufficiency: null,
  binding: { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: "dna-v3", articleDnaContentHash: null },
  foundationFingerprint: "fp-1",
  search: { mode: "kgr_light", canonicalQueries: 1, auxiliaryQueries: 0, queries: [], uniqueReferences: 0, selectedReferences: 0, recurrentReferences: 0, auxiliaryOnlyReferences: 0 },
  sample: { analyzedSuccess: 6, comparablePages: 6, failedFinal: 0, extractionIds: [] },
  model: { sufficiency: "SUFFICIENT", sufficiencyReasons: [], intent: null, dominantFormat: null, recurrentConcepts: 0, questions: 0, gaps: 0, differentiations: 0, conflicts: 0, conceptIds: [] },
  links: { graphVersionId: null, graphContentHash: null, relatedDestinations: 0, outgoing: [], incoming: [], totalRecommendedLinks: 0, unresolvedRelations: 0 },
  authority: { ymylRelevance: "LOW", claims: [], verifiedSources: [], factualEvidence: [], marketVsFactConflicts: [], specialistRequirements: [] },
  discovery: { applicable: false, applicability: "NOT_APPLICABLE", required: false, funnel: null, answerableUnits: [], coreQuestions: 0, definitionRequirements: 0, entityCoverageRequirements: 0, retrievabilityRequirements: 0, matrix: { shared: 0, search: 0, aiDiscovery: 0 } },
  blueprint: null,
  limitations: [],
};

/** Uma versão INTEIRA, como o Radar a grava antes de separar a corrida. */
function versao(versionId: string, versionNumber: number, opcoes: { corrida: boolean; finalizada?: boolean; status?: "draft" | "approved" }) {
  const paginas = opcoes.corrida ? Array.from({ length: 6 }, (_, indice) => pagina(versionId, indice)) : [];
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: "dna-v3",
    serpSnapshotId: "serp-9", serpSnapshotVersion: 1, serpSnapshotHash: "sha256:serp",
    serpDecisions: [
      { key: "organic:1", itemType: "organic", decision: "included", reason: "", note: "", ownDomain: false, url: "https://concorrente-1.test/curado" },
      { key: "organic:2", itemType: "organic", decision: "excluded", reason: "", note: "", ownDomain: false, url: "https://concorrente-2.test/fora" },
    ],
    selectedCompetitorIds: ["organic:1"], extractionIds: paginas.map(item => item.id),
    extractions: paginas, extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: opcoes.finalizada ? { ...FOTOGRAFIA, sample: { ...FOTOGRAFIA.sample, extractionIds: paginas.map(item => item.id) } } : null,
    benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: opcoes.status || "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });
  return VersionedRadarAnalysisSchema.parse({
    versionId, entityId: `radar-analysis:${ARTIGO}`, versionNumber, previousVersionId: null,
    contentHash: HASH, origin: "human", changeReason: "fixture",
    createdAt: "2026-09-20T10:00:00.000Z", createdBy: "user-1", payload,
  }) as unknown as Record<string, unknown>;
}

/*
 *   posição   versão   corrida   papel
 *      0        v1       sim     aprovada antiga
 *      1        v2       sim     a AMOSTRA que a verificação de fontes lê
 *      2        v4       não     versão sem corrida gravada
 *      3        v3       sim     a CORRENTE da trava (última do array)
 */
function inteiras(correnteFinalizada: boolean) {
  return [
    versao("v1", 1, { corrida: true, status: "approved" }),
    versao("v2", 2, { corrida: true }),
    versao("v4", 4, { corrida: false }),
    versao("v3", 3, { corrida: true, finalizada: correnteFinalizada }),
  ];
}

function semear(correnteFinalizada = false) {
  const leves: Linha[] = [];
  const corridas: Linha[] = [];
  for (const inteira of inteiras(correnteFinalizada)) {
    const { light, run, hasRun } = splitAnalysisRun(inteira);
    leves.push(light);
    if (hasRun) corridas.push({ workflow_item_id: ITEM, version_id: inteira.versionId, marca_id: MARCA, article_id: ARTIGO, payload: run });
  }
  banco.editorial_workflow_items = [
    {
      id: ITEM, marca_id: MARCA, article_id: ARTIGO, stage: "radar", state: "researching", lock_version: 7,
      created_at: "2026-09-20T10:00:00.000000+00:00", updated_at: "2026-09-21T10:00:00.000000+00:00",
      payload: {
        id: "radar-item-payload-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:dna",
        title: "Pele oleosa", slug: "pele-oleosa", siloId: "silo-1", hierarchy: "pilar", principalKeywordId: "kw-1",
        format: "guia", intent: "informacional", analysisVersions: leves,
      },
    },
    {
      id: "wf-vazio", marca_id: MARCA, article_id: "artigo-sem-versoes", stage: "radar", state: "imported", lock_version: 1,
      created_at: "2026-09-20T10:00:00.000000+00:00", updated_at: "2026-09-21T10:00:00.000000+00:00",
      payload: { id: "radar-item-vazio", analysisVersions: [] },
    },
  ];
  banco.radar_analysis_runs = corridas;
  banco.editorial_serp_snapshots = [];
  pedidos.length = 0;
}

/* ======================= o oráculo: a rota com a leitura antiga ======================= */

type Prototipo = Record<string, unknown>;
const prototipo = WorkflowRepository.prototype as unknown as Prototipo;

async function comLeituraAntiga<T>(metodo: string, substituto: (...argumentos: never[]) => unknown, corpo: () => Promise<T>): Promise<T> {
  const original = prototipo[metodo];
  prototipo[metodo] = substituto;
  try {
    return await corpo();
  } finally {
    prototipo[metodo] = original;
  }
}

/* O que muda a cada chamada (relógio) não é decisão: sai da comparação. */
const semRelogio = (texto: string) => texto.replace(/"(extractedAt|verifiedAt|observedAt)":"[^"]*"/g, "\"$1\":\"<agora>\"");

type Resposta = { status: number; texto: string };

async function executar(chamada: () => Promise<Response>): Promise<Resposta> {
  const resposta = await chamada();
  return { status: resposta.status, texto: semRelogio(await resposta.text()) };
}

const post = (caminho: string, corpo: unknown) => new NextRequest(`http://localhost${caminho}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
});

/* ======================= (1) extração ======================= */

const extrair = (corpo: unknown) => executar(() => rotaDeExtracao.POST(post("/api/editorial/radar-analysis/extract", corpo)));

function pedidoDeExtracao(patch: Record<string, unknown> = {}) {
  return {
    brandId: MARCA, articleId: ARTIGO,
    analysis: inteiras(false)[3],
    candidates: [{ key: "organic:1", url: "https://concorrente-1.test/curado", itemType: "organic", decision: "included" }],
    keyword: "pele oleosa",
    ...patch,
  };
}

for (const caso of [
  { nome: "canônica incluída: extrai o destino da CURADORIA gravada", corpo: pedidoDeExtracao(), status: 200 },
  { nome: "versionId do corpo aponta a aprovada antiga", corpo: pedidoDeExtracao({ analysis: inteiras(false)[0] }), status: 200 },
  { nome: "chave excluída na curadoria: 409", corpo: pedidoDeExtracao({ candidates: [{ key: "organic:2", url: "https://concorrente-2.test/fora", itemType: "organic", decision: "included" }] }), status: 409 },
  { nome: "snapshot diferente do gravado: 409", corpo: pedidoDeExtracao({ snapshotId: "serp-outro" }), status: 409 },
  { nome: "referência da pesquisa sem curadoria gravada: 409", corpo: pedidoDeExtracao({ candidates: [{ source: "research", referenceId: "ref-1" }] }), status: 409 },
  { nome: "item ausente com referência da pesquisa: 503", corpo: pedidoDeExtracao({ articleId: "artigo-inexistente", candidates: [{ source: "research", referenceId: "ref-1" }] }), status: 503 },
]) {
  test(`(1) extract · ${caso.nome}: idêntica à leitura reidratada, sem tocar radar_analysis_runs`, async () => {
    semear();
    const antiga = await comLeituraAntiga("findByArticleWithoutRuns", function (this: { findByArticle: (...argumentos: unknown[]) => unknown }, ...argumentos: unknown[]) {
      return this.findByArticle(...argumentos);
    } as never, () => extrair(caso.corpo));
    const oraculoLeuCorridas = leiturasDeCorridas().length;

    pedidos.length = 0;
    const nova = await extrair(caso.corpo);
    assert.equal(nova.status, caso.status, nova.texto);
    assert.equal(nova.status, antiga.status);
    assert.equal(nova.texto, antiga.texto, "nem um byte de diferença");
    assert.equal(leiturasDeCorridas().length, 0, "nenhuma corrida atravessou a rede");
    if (caso.status !== 503) assert.equal(oraculoLeuCorridas, 1, "o oráculo lia todas as corridas do item");
  });
}

test("(1) extract · o destino buscado é o da curadoria gravada, não o do corpo", async () => {
  semear();
  const corpo = pedidoDeExtracao({ candidates: [{ key: "organic:1", url: "https://concorrente-1.test/curado", itemType: "organic", decision: "included" }] });
  const { texto } = await extrair(corpo);
  const lido = JSON.parse(texto) as { pages: Array<{ key: string; page: { url: string } }> };
  assert.deepEqual(lido.pages.map(item => [item.key, item.page.url]), [["organic:1", "https://concorrente-1.test/curado"]]);
});

/* ======================= (2) verificação de fontes ======================= */

const verificar = (corpo: unknown) => executar(() => rotaDeFontes.POST(post("/api/editorial/radar-analysis/verify-sources", corpo)));

function planoDaAmostra() {
  const pages = (inteiras(false)[1].payload as { extractions: Parameters<typeof buildRadarExternalSourceResearch>[0]["pages"] }).extractions;
  const semantic = buildRadarSemanticConceptModel({ pages, keywordTexts: KEYWORDS, centralEntities: ENTIDADES });
  return buildRadarSourceVerificationPlan({
    candidates: buildRadarExternalSourceResearch({ pages, semantic }).evidenceCandidates,
    claims: buildRadarEvidenceClaims({ semantic }),
  });
}

function pedidoDeFontes(patch: Record<string, unknown> = {}) {
  return {
    brandId: MARCA, articleId: ARTIGO, analysisVersionId: "v2", articleDnaVersionId: "dna-v3",
    sourceIds: planoDaAmostra().map(item => item.sourceId), keywordTexts: KEYWORDS, centralEntities: ENTIDADES,
    ...patch,
  };
}

const leituraAntigaDasFontes = function (this: { findByArticle: (...argumentos: unknown[]) => unknown }, marca: unknown, artigo: unknown, etapa: unknown) {
  return this.findByArticle(marca, artigo, etapa);
} as never;

test("(2) verify-sources · a fixture tem plano: sem ele o teste não provaria nada", () => {
  assert.ok(planoDaAmostra().length > 0, "as páginas da amostra citam fontes");
});

for (const caso of [
  { nome: "plano montado sobre a amostra: 200", corpo: () => pedidoDeFontes(), status: 200, ids: ["v2"] },
  { nome: "fundamento diferente: 409", corpo: () => pedidoDeFontes({ articleDnaVersionId: "dna-outro" }), status: 409, ids: ["v2"] },
  { nome: "fonte fora do plano: 422", corpo: () => pedidoDeFontes({ sourceIds: ["source:inexistente"] }), status: 422, ids: ["v2"] },
  { nome: "versão sem corrida gravada: plano vazio, 422 como antes", corpo: () => pedidoDeFontes({ analysisVersionId: "v4" }), status: 422, ids: ["v4"] },
  { nome: "versão que a linha não tem: 404, sem consulta", corpo: () => pedidoDeFontes({ analysisVersionId: "v-que-nao-existe" }), status: 404, ids: null },
  { nome: "versionId malformado não chega ao filtro: 404, não 500", corpo: () => pedidoDeFontes({ analysisVersionId: 'a"b(' }), status: 404, ids: null },
]) {
  test(`(2) verify-sources · ${caso.nome}: idêntica à leitura reidratada, só com a corrida pedida`, async () => {
    semear();
    const corpo = caso.corpo();
    const antiga = await comLeituraAntiga("findByArticleHydratingVersions", leituraAntigaDasFontes, () => verificar(corpo));

    pedidos.length = 0;
    const nova = await verificar(corpo);
    assert.equal(nova.status, caso.status, nova.texto);
    assert.equal(nova.status, antiga.status);
    assert.equal(nova.texto, antiga.texto, "nem um byte de diferença");

    const corridas = leiturasDeCorridas();
    if (caso.ids === null) {
      assert.equal(corridas.length, 0, "id que a linha não tem não vira consulta");
    } else {
      assert.equal(corridas.length, 1);
      assert.equal(corridas[0].params.get("workflow_item_id"), `eq.${ITEM}`);
      assert.equal(corridas[0].params.get("version_id"), `in.(${caso.ids.join(",")})`, "só a versão pedida");
    }
  });
}

test("(2) verify-sources · a leitura SEM corridas quebraria a verificação (por isso ela reidrata a pedida)", async () => {
  semear();
  const corpo = pedidoDeFontes();
  const semCorridas = await comLeituraAntiga("findByArticleHydratingVersions", function (this: { findByArticleWithoutRuns: (...argumentos: unknown[]) => unknown }, marca: unknown, artigo: unknown, etapa: unknown) {
    return this.findByArticleWithoutRuns(marca, artigo, etapa);
  } as never, () => verificar(corpo));
  assert.equal(semCorridas.status, 422, "sem as extractions o plano some e toda fonte vira desconhecida");
  assert.equal((await verificar(corpo)).status, 200);
});

/* ======================= (3) a trava da gravação ======================= */

const gravar = (corpo: unknown) => executar(() => rotaDeAnalise.POST(post("/api/editorial/radar-analysis", corpo)));

/* A leitura antiga: o item inteiro reidratado, e a última versão do array. */
const correnteAntiga = async function (this: { findByArticle: (...argumentos: unknown[]) => Promise<{ payload?: { analysisVersions?: unknown[] } } | null> }, marca: unknown, artigo: unknown) {
  const item = await this.findByArticle(marca, artigo, "radar");
  const versoes = item?.payload?.analysisVersions;
  return Array.isArray(versoes) && versoes.length ? versoes[versoes.length - 1] : null;
} as never;

function sucessora(correnteFinalizada: boolean, mudar: (payload: Record<string, unknown>) => Record<string, unknown>) {
  const corrente = inteiras(correnteFinalizada)[3] as { payload: Record<string, unknown> };
  return { ...corrente, versionId: "v6", versionNumber: 6, previousVersionId: "v3", payload: mudar(corrente.payload) };
}

function pedidoDeGravacao(correnteFinalizada: boolean, mudar: (payload: Record<string, unknown>) => Record<string, unknown>, articleId = ARTIGO) {
  return { action: "save", brandId: MARCA, articleId, expectedLock: 7, analysis: sucessora(correnteFinalizada, mudar) };
}

const anotar = (payload: Record<string, unknown>) => ({ ...payload, modeHumanReason: "anotado depois do congelamento" });
const trocarAmostra = (payload: Record<string, unknown>) => ({ ...payload, extractions: [...(payload.extractions as unknown[]), pagina("nova", 9)] });
const reabrir = (payload: Record<string, unknown>) => ({ ...payload, finalizedBundle: null, extractions: [] });

for (const caso of [
  { nome: "aberta + amostra trocada: grava, sem ler corrida nenhuma", finalizada: false, mudar: trocarAmostra, status: 200 },
  { nome: "finalizada + só anotação: grava (as extractions batem com a corrida)", finalizada: true, mudar: anotar, status: 200 },
  { nome: "finalizada + amostra trocada: 409 da trava", finalizada: true, mudar: trocarAmostra, status: 409 },
  { nome: "finalizada + reabrir: grava", finalizada: true, mudar: reabrir, status: 200 },
]) {
  test(`(3) save · ${caso.nome}: decisão e resposta idênticas às do item inteiro`, async () => {
    const corpo = pedidoDeGravacao(caso.finalizada, caso.mudar);
    semear(caso.finalizada);
    const antiga = await comLeituraAntiga("findCurrentRadarAnalysisForWriteLock", correnteAntiga, () => gravar(corpo));
    const doOraculo = leiturasDeCorridas();
    assert.equal(doOraculo.length, 1);
    assert.equal(doOraculo[0].params.get("version_id"), null, "o oráculo lia TODAS as corridas");

    semear(caso.finalizada);
    const nova = await gravar(corpo);
    assert.equal(nova.status, caso.status, nova.texto);
    assert.equal(nova.status, antiga.status);
    assert.equal(nova.texto, antiga.texto, "nem um byte de diferença");

    const corridas = leiturasDeCorridas();
    if (!caso.finalizada) {
      assert.equal(corridas.length, 0, "não finalizada: a trava abre sem olhar campo competitivo");
    } else {
      assert.equal(corridas.length, 1, "uma leitura, só da corrente");
      assert.equal(corridas[0].params.get("workflow_item_id"), `eq.${ITEM}`);
      assert.equal(corridas[0].params.get("version_id"), "eq.v3", "a corrente é a última do array, não a de maior número");
    }
    if (caso.status === 409) {
      assert.equal(pedidos.some(pedido => pedido.metodo !== "GET"), false, "a recusa não escreve nada");
      assert.deepEqual((JSON.parse(nova.texto) as { competitiveFields: string[] }).competitiveFields, ["extractions"], "a trava viu a corrida da corrente e só a amostra mudou");
    }
  });
}

test("(3) save · item ausente: 404 idêntico e nenhuma corrida lida", async () => {
  const corpo = pedidoDeGravacao(false, anotar, "artigo-inexistente");
  const semArtigo = { ...corpo, analysis: { ...corpo.analysis, payload: { ...corpo.analysis.payload, articleId: "artigo-inexistente" } } };
  semear();
  const antiga = await comLeituraAntiga("findCurrentRadarAnalysisForWriteLock", correnteAntiga, () => gravar(semArtigo));
  semear();
  const nova = await gravar(semArtigo);
  assert.equal(nova.status, 404);
  assert.equal(nova.texto, antiga.texto);
  assert.equal(leiturasDeCorridas().length, 0);
});

test("(3) save · a corrida da corrente é indispensável quando finalizada: leve, a trava recusaria à toa", async () => {
  semear(true);
  const repositorio = new WorkflowRepository();
  const leve = await repositorio.findByArticleWithoutRuns(MARCA, ARTIGO, "radar") as { payload: { analysisVersions: Array<{ payload: unknown }> } };
  const correnteLeve = leve.payload.analysisVersions.at(-1)?.payload;
  const proximo = anotar((inteiras(true)[3] as { payload: Record<string, unknown> }).payload);

  const semCorrida = radarGoogleResearchWriteLock({ current: correnteLeve, next: proximo });
  assert.equal(semCorrida.allowed, false, "sem a corrida, extractions [] pareceria amostra trocada");

  const corrente = await repositorio.findCurrentRadarAnalysisForWriteLock(MARCA, ARTIGO) as { payload: unknown };
  assert.equal(radarGoogleResearchWriteLock({ current: corrente.payload, next: proximo }).allowed, true);
});

/* ======================= (4) o método novo devolve a versão, nunca a linha ======================= */

test("(4) findCurrentRadarAnalysisForWriteLock · finalizada: a última do array, com a corrida dela inteira", async () => {
  semear(true);
  const repositorio = new WorkflowRepository();
  const reidratado = await repositorio.findByArticle(MARCA, ARTIGO, "radar") as { payload: { analysisVersions: unknown[] } };
  pedidos.length = 0;

  const corrente = await repositorio.findCurrentRadarAnalysisForWriteLock(MARCA, ARTIGO);
  assert.deepEqual(corrente, reidratado.payload.analysisVersions.at(-1), "idêntica à versão que findByArticle devolveria");
  assert.equal((corrente as { versionId: string }).versionId, "v3");
  for (const chaveDaLinha of ["id", "marca_id", "article_id", "lock_version", "stage", "analysisVersions"]) {
    assert.equal(chaveDaLinha in (corrente as object), false, `não carrega \`${chaveDaLinha}\`: é a versão, não a linha`);
  }
  assert.equal(leiturasDeCorridas().length, 1);
});

test("(4) findCurrentRadarAnalysisForWriteLock · aberta: a versão como gravada, sem consultar corridas", async () => {
  semear(false);
  const repositorio = new WorkflowRepository();
  const leve = await repositorio.findByArticleWithoutRuns(MARCA, ARTIGO, "radar") as { payload: { analysisVersions: unknown[] } };
  pedidos.length = 0;

  const corrente = await repositorio.findCurrentRadarAnalysisForWriteLock(MARCA, ARTIGO);
  assert.deepEqual(corrente, leve.payload.analysisVersions.at(-1));
  assert.equal("analysisVersions" in (corrente as object), false);
  assert.equal(leiturasDeCorridas().length, 0);
});

test("(4) findCurrentRadarAnalysisForWriteLock · sem item ou sem versões: null, sem consultar corridas", async () => {
  semear(true);
  const repositorio = new WorkflowRepository();
  assert.equal(await repositorio.findCurrentRadarAnalysisForWriteLock(MARCA, "artigo-inexistente"), null);
  assert.equal(await repositorio.findCurrentRadarAnalysisForWriteLock(MARCA, "artigo-sem-versoes"), null);
  assert.equal(leiturasDeCorridas().length, 0);
});

/* ======================= (5) as fontes, sem comentários ======================= */

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("(5) extract lê a linha sem corridas, e não lê nenhum campo de corrida", () => {
  const fonte = semComentarios("../app/api/editorial/radar-analysis/extract/route.ts");
  assert.match(fonte, /new WorkflowRepository\(\)\.findByArticleWithoutRuns\(input\.brandId, input\.articleId, "radar"\)/);
  assert.equal(/\.findByArticle\(/.test(fonte), false, "a reidratante não é chamada");
  assert.equal(/extractions|competitiveReport|youtubeSearch|amazonSearch/.test(fonte), false, "nenhum campo de corrida é lido");
  for (const dominio of ["../lib/radar/extraction-request.ts", "../lib/radar/research-curation.ts"]) {
    assert.equal(/extractions|competitiveReport|youtubeSearch|amazonSearch/.test(semComentarios(dominio)), false, `${dominio} não lê campo de corrida`);
  }
});

test("(5) verify-sources reidrata só a versão pedida", () => {
  const fonte = semComentarios("../app/api/editorial/radar-analysis/verify-sources/route.ts");
  assert.match(fonte, /\.findByArticleHydratingVersions\(input\.brandId, input\.articleId, "radar", \(\) => \[input\.analysisVersionId\]\)/);
  assert.equal(/\.findByArticle\(|findByArticleWithoutRuns/.test(fonte), false);
});

test("(5) a gravação lê só a corrente para a trava; a escrita continua crua", () => {
  const rota = semComentarios("../app/api/editorial/radar-analysis/route.ts");
  const post = rota.slice(rota.indexOf("export async function POST"));
  assert.match(post, /repositorio\.findCurrentRadarAnalysisForWriteLock\(input\.brandId, input\.articleId\)/);
  assert.equal(/\.findByArticle\(/.test(post), false);

  const repositorio = semComentarios("../lib/server/editorial-repositories.ts");
  const append = repositorio.slice(repositorio.indexOf("async appendRadarAnalysis"));
  assert.match(append, /this\.findByArticleRaw\(marcaId, articleId, "radar"\)/, "o append segue lendo a linha crua");
  assert.match(repositorio, /async findByArticle\([\s\S]{0,240}this\.reidratarCorridas\(/, "findByArticle continua reidratando tudo");
});
