import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/**
 * R1 DA SDD DO RADAR NAS QUATRO LENTES — o standing da SERP é congelado UMA vez.
 *
 * O dossiê entregue ao Planejador dizia sempre "SERP vigente, suficiente e
 * válida". Calcular isso na leitura mudaria a conclusão e o hash de um artigo
 * já entregue com o tempo (invariantes 30, 57 e 59). Aqui se prova:
 *
 *   - a regra (D1 e D2) avaliada no instante do congelamento;
 *   - o carimbo no bundle, com hash recalculado e integridade conferida;
 *   - o dossiê de bundle ANTIGO byte a byte igual ao de antes (valor dourado
 *     medido com o código anterior a esta mudança);
 *   - o dossiê de bundle NOVO lendo só a cópia;
 *   - a trava: fotografia não é reescrita sem reabrir, e "Atualizar SERP" é
 *     recusado depois do congelamento, antes de qualquer gasto.
 *
 * Rotas rodam contra um PostgREST SIMULADO (o `fetch` global é trocado), sem
 * rede e sem provider: os módulos pagos são substituídos por stubs que contam.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

const contarPaga = "globalThis.__radarChamadasPagas = (globalThis.__radarChamadasPagas || 0) + 1; throw new Error('CHAMADA_PAGA_PROIBIDA_NO_TESTE');";
const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return { userId: 'ator-de-teste', supabase: null }; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
  "@/lib/server/dataforseo-canonical": [
    "export const DATAFORSEO_ALLINTITLE_CAPABILITY_KEY = 'dataforseo.allintitle';",
    "export const DATAFORSEO_SERP_COMPATIBILITY_CAPABILITY_KEY = 'dataforseo.serp_compatibility';",
    "export class DataForSeoCanonicalError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status || 500; } }",
    `export async function resolveDataForSeoCanonicalSerpCompatibilityConfig() { ${contarPaga} }`,
    `export async function resolveDataForSeoCanonicalConfig() { ${contarPaga} }`,
    "export function resolveDataForSeoIntegrationEnvironment() { return 'test'; }",
  ].join("\n"),
  "@/lib/server/dataforseo-serp-operation": [
    `export async function collectDataForSeoSerpSnapshot() { ${contarPaga} }`,
    `export async function executeDataForSeoSerpOperation() { ${contarPaga} }`,
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

const banco: Record<string, Linha[]> = { editorial_workflow_items: [], radar_analysis_runs: [] };
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

/* ======================= módulos do projeto ======================= */

const {
  RadarFrozenEvidenceBundleSchema,
  assertRadarFrozenBundleIntegrity,
  radarFrozenBundleHash,
  radarFrozenSerpStandingOf,
  radarStampFrozenSerpStanding,
} = await import("../lib/radar/investigation-finalization.ts");
const { evaluateRadarFrozenSerpStanding } = await import("../lib/radar/frozen-serp-standing.ts");
const { RadarAnalysisPayloadSchema, VersionedRadarAnalysisSchema } = await import("../lib/radar/analysis-contracts.ts");
const { buildRadarEvidenceBundleFromAnalysis } = await import("../lib/radar/evidence-bundle-runtime.ts");
const { resolveRadarCanonicalDossier } = await import("../lib/server/radar-canonical-dossier.ts");
const {
  RADAR_GOOGLE_RESEARCH_FINALIZED,
  radarGoogleResearchWriteLock,
  radarGoogleSerpWriteLock,
} = await import("../lib/radar/google-research-write-lock.ts");
const { stampRadarSerpStandingAtFreeze } = await import("../lib/server/radar-frozen-serp-standing.ts");
const { contentHash } = await import("../lib/arquiteto/versioning.ts");
const { splitAnalysisRun } = await import("../lib/radar/analysis-run-storage.ts");
const { SerpSnapshotRepository } = await import("../lib/server/editorial-repositories.ts");
const { NextRequest } = await import("next/server");
const rotaDeAnalise = await import("../app/api/editorial/radar-analysis/route.ts");
const rotaDaSerp = await import("../app/api/editorial/serp/route.ts");

/* ======================= fixtures ======================= */

const MARCA = "5f0c3a52-8d4e-4b7a-9c61-2e8f4a1b7c90";
const ARTIGO = "artigo-pele-oleosa";
const ITEM = "wf-radar-standing";
const DNA = "dna-v3";
const SNAPSHOT = "serp-9";
const HASH_SERP = "c".repeat(64);

/* O mesmo conteúdo do script que mediu o valor dourado com o código anterior. */
const CONTEUDO = {
  bundleId: "bundle:legado-1", frozenAt: "2026-09-20T12:00:00.000Z", frozenBy: "user-1",
  conclusion: "FINALIZABLE" as const, acknowledgedInsufficiency: null,
  binding: { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA, articleDnaContentHash: "sha256:dna" },
  foundationFingerprint: "fp-1",
  search: { mode: "kgr_light", canonicalQueries: 1, auxiliaryQueries: 0, queries: [], uniqueReferences: 6, selectedReferences: 6, recurrentReferences: 0, auxiliaryOnlyReferences: 0 },
  sample: { analyzedSuccess: 6, comparablePages: 6, failedFinal: 0, extractionIds: ["https://a.test/1"] },
  model: { sufficiency: "SUFFICIENT", sufficiencyReasons: [], intent: "informacional", dominantFormat: null, recurrentConcepts: 0, questions: 0, gaps: 0, differentiations: 0, conflicts: 0, conceptIds: [] },
  links: { graphVersionId: null, graphContentHash: null, relatedDestinations: 0, outgoing: [], incoming: [], totalRecommendedLinks: 0, unresolvedRelations: 0 },
  authority: { ymylRelevance: "LOW", claims: [], verifiedSources: [], factualEvidence: [], marketVsFactConflicts: [], specialistRequirements: [] },
  discovery: { applicable: false, applicability: "NOT_APPLICABLE", required: false, funnel: null, answerableUnits: [], coreQuestions: 0, definitionRequirements: 0, entityCoverageRequirements: 0, retrievabilityRequirements: 0, matrix: { shared: 0, search: 0, aiDiscovery: 0 } },
  blueprint: null,
  limitations: ["uma limitação congelada"],
};
const LEGADO = RadarFrozenEvidenceBundleSchema.parse({ ...CONTEUDO, bundleHash: radarFrozenBundleHash(CONTEUDO) });

/* Valores MEDIDOS com o código anterior a R1 (scratchpad/r1/dourado.mts). */
const HASH_DOURADO_DO_BUNDLE = "ada4b4b2";
const HASH_DOURADO_DO_DOSSIE = "bundle-hash:e32e330f";

type Registro = { id: string; origin: string; isMock: boolean; research: { id: string; contentHash: string; articleDnaVersionId: string; status: string } | null };

const registro = (patch: Partial<Registro> = {}, pesquisa: Partial<NonNullable<Registro["research"]>> = {}): Registro => ({
  id: SNAPSHOT, origin: "real", isMock: false,
  research: { id: SNAPSHOT, contentHash: HASH_SERP, articleDnaVersionId: DNA, status: "needs_review", ...pesquisa },
  ...patch,
});

const revisao = (status: "approved" | "rejected", reviewedAt: string, snapshotId = SNAPSHOT) => ({
  id: `rev-${status}-${reviewedAt}`, brandId: MARCA, articleId: ARTIGO, snapshotId, status, notes: "", reviewedBy: "user-1", reviewedAt,
});

type Revisao = ReturnType<typeof revisao>;

function avaliar(patch: {
  sufficiency?: string;
  analysis?: { serpSnapshotId: string | null; serpSnapshotHash: string | null };
  snapshots?: Registro[];
  reviews?: Revisao[];
} = {}) {
  return evaluateRadarFrozenSerpStanding({
    bundle: { ...LEGADO, model: { ...LEGADO.model, sufficiency: patch.sufficiency || LEGADO.model.sufficiency } },
    analysis: patch.analysis || { serpSnapshotId: SNAPSHOT, serpSnapshotHash: HASH_SERP },
    snapshots: patch.snapshots || [registro()],
    reviews: patch.reviews || [],
  });
}

function payloadDaAnalise(finalizedBundle: unknown) {
  return RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA,
    serpSnapshotId: SNAPSHOT, serpSnapshotVersion: 1, serpSnapshotHash: HASH_SERP,
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle,
    benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });
}

function versao(versionId: string, versionNumber: number, finalizedBundle: unknown, previousVersionId: string | null = null) {
  return VersionedRadarAnalysisSchema.parse({
    versionId, entityId: `radar-analysis:${ARTIGO}`, versionNumber, previousVersionId,
    contentHash: `sha256:${"b".repeat(64)}`, origin: "human", changeReason: "fixture",
    createdAt: "2026-09-20T10:00:00.000Z", createdBy: "user-1", payload: payloadDaAnalise(finalizedBundle),
  });
}

const ARTIGO_CORRENTE = { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA, articleDnaContentHash: "sha256:dna" };

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ======================= (1) a regra, no instante do congelamento ======================= */

test("R1 · needs_review, hash e DNA conferem, amostra suficiente: autoritativa, com a base gravada", () => {
  const standing = avaliar();
  assert.equal(standing.authoritative, true);
  assert.equal(standing.current, true);
  assert.equal(standing.sufficient, true);
  assert.equal(standing.valid, true);
  assert.match(standing.reason, /SERP vigente, suficiente e válida/);
  assert.deepEqual(standing.basis, {
    snapshotId: SNAPSHOT, snapshotHash: HASH_SERP, reviewStatus: "needs_review",
    sufficiencyLevel: "SUFFICIENT", invalidReasons: [],
  });
});

test("R1 · D1 · a ÚLTIMA revisão decide: rejeitada tira a validade, aprovada depois devolve", () => {
  const rejeitada = avaliar({ reviews: [revisao("approved", "2026-09-20T10:00:00+00:00"), revisao("rejected", "2026-09-21T10:00:00+00:00")] });
  assert.equal(rejeitada.valid, false);
  assert.equal(rejeitada.authoritative, false);
  assert.equal(rejeitada.basis.reviewStatus, "rejected");
  assert.deepEqual(rejeitada.basis.invalidReasons, ["SNAPSHOT_REJECTED"]);
  assert.match(rejeitada.reason, /a coleta não pôde ser validada/);

  const reaprovada = avaliar({ reviews: [revisao("rejected", "2026-09-20T10:00:00+00:00"), revisao("approved", "2026-09-21T10:00:00+00:00")] });
  assert.equal(reaprovada.valid, true);
  assert.equal(reaprovada.basis.reviewStatus, "approved");

  const deOutroSnapshot = avaliar({ reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00", "serp-outro")] });
  assert.equal(deOutroSnapshot.valid, true, "revisão de outro snapshot não conta");
});

test("R1 · validade: cada falha tem nome, e nenhuma é resolvida em silêncio", () => {
  const casos: Array<[string, Parameters<typeof avaliar>[0], string]> = [
    ["sem snapshot vinculado", { analysis: { serpSnapshotId: null, serpSnapshotHash: null } }, "SNAPSHOT_NOT_BOUND"],
    ["snapshot não gravado", { snapshots: [] }, "SNAPSHOT_NOT_FOUND"],
    ["snapshot simulado", { snapshots: [registro({ isMock: true, origin: "mock" })] }, "SNAPSHOT_NOT_REAL"],
    ["hash diferente do que a análise leu", { analysis: { serpSnapshotId: SNAPSHOT, serpSnapshotHash: "d".repeat(64) } }, "SNAPSHOT_HASH_MISMATCH"],
    ["outra versão do ArticleDNA", { snapshots: [registro({}, { articleDnaVersionId: "dna-v2" })] }, "ARTICLE_DNA_MISMATCH"],
  ];
  for (const [nome, patch, motivo] of casos) {
    const standing = avaliar(patch);
    assert.equal(standing.valid, false, nome);
    assert.equal(standing.authoritative, false, nome);
    assert.ok(standing.basis.invalidReasons.includes(motivo as never), `${nome}: esperava ${motivo}, veio ${standing.basis.invalidReasons.join(",")}`);
  }
});

test("R1 · D2 · suficiência: SUFFICIENT, PARTIAL_BUT_USABLE e CONFLICTING_SEARCH_INTENT sustentam; INSUFFICIENT não", () => {
  for (const nivel of ["SUFFICIENT", "PARTIAL_BUT_USABLE", "CONFLICTING_SEARCH_INTENT"]) {
    assert.equal(avaliar({ sufficiency: nivel }).sufficient, true, nivel);
  }
  const insuficiente = avaliar({ sufficiency: "INSUFFICIENT" });
  assert.equal(insuficiente.sufficient, false);
  assert.equal(insuficiente.authoritative, false);
  assert.equal(insuficiente.valid, true, "a insuficiência não invalida a coleta");
  assert.match(insuficiente.reason, /a amostra não sustenta leitura de mercado/);
});

/* ======================= (2) o carimbo e o legado ======================= */

test("R1 · legado: bundle sem a chave mantém o hash medido e continua sem a chave depois do parse", () => {
  assert.equal(LEGADO.bundleHash, HASH_DOURADO_DO_BUNDLE);
  assert.equal(Object.keys(LEGADO).includes("serpStanding"), false, "ausente, nunca nulo");
  const relido = RadarFrozenEvidenceBundleSchema.parse(JSON.parse(JSON.stringify(LEGADO)));
  assert.equal(Object.keys(relido).includes("serpStanding"), false);
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(relido));
  assert.equal(radarFrozenSerpStandingOf(relido), null);
});

test("R1 · carimbo: hash recalculado, integridade confere, e o standing declarado pelo navegador é descartado", () => {
  const avaliado = avaliar({ reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00")] });
  const carimbado = radarStampFrozenSerpStanding(LEGADO, avaliado);
  assert.notEqual(carimbado.bundleHash, LEGADO.bundleHash, "o standing faz parte do conteúdo congelado");
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(carimbado));
  assert.deepEqual(carimbado.serpStanding, avaliado);

  const declaradoConteudo = { ...CONTEUDO, serpStanding: { ...avaliar(), reason: "declarado pelo navegador" } };
  const declarado = RadarFrozenEvidenceBundleSchema.parse({ ...declaradoConteudo, bundleHash: radarFrozenBundleHash(declaradoConteudo) });
  const recarimbado = radarStampFrozenSerpStanding(declarado, avaliado);
  assert.deepEqual(recarimbado.serpStanding, avaliado);
  assert.equal(recarimbado.bundleHash, carimbado.bundleHash, "o que vale é o avaliado, não o declarado");

  assert.throws(() => radarStampFrozenSerpStanding({ ...LEGADO, limitations: ["editada depois"] }, avaliado), /RADAR_FROZEN_BUNDLE_MUTATED/,
    "recalcular o hash sobre conteúdo adulterado lavaria a adulteração");
});

/* ======================= (3) o dossiê ======================= */

test("R1 · dourado: bundle ANTIGO dá o dossiê byte a byte igual ao de antes, pelos dois caminhos", () => {
  const direto = buildRadarEvidenceBundleFromAnalysis({ payload: payloadDaAnalise(LEGADO), article: ARTIGO_CORRENTE, competitiveBlueprint: null, observedAt: LEGADO.frozenAt });
  assert.ok(direto.ok);
  assert.equal(direto.bundle.bundleHash, HASH_DOURADO_DO_DOSSIE);
  assert.deepEqual(direto.bundle.serpStanding, {
    authoritative: true, current: true, sufficient: true, valid: true,
    reason: "SERP vigente, suficiente e válida: ela é a autoridade evidencial sobre o terreno competitivo desta investigação.",
  });

  const canonico = resolveRadarCanonicalDossier({ analysis: versao("v3", 3, LEGADO), article: ARTIGO_CORRENTE, observedAt: LEGADO.frozenAt, authorities: null });
  assert.ok(canonico.ok);
  assert.equal(canonico.dossier.bundle.bundleHash, HASH_DOURADO_DO_DOSSIE, "o dossiê entregue ao Planejador e ao Redator não muda de hash");
});

test("R1 · bundle NOVO: o dossiê lê só a cópia — um serp vivo não a sobrepõe, e o hash não se move", () => {
  const congelado = radarStampFrozenSerpStanding(LEGADO, avaliar({ reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00")] }));
  const payload = payloadDaAnalise(congelado);

  const montar = (serp?: { current: boolean; sufficient: boolean; valid: boolean }) => {
    const resultado = buildRadarEvidenceBundleFromAnalysis({ payload, article: ARTIGO_CORRENTE, competitiveBlueprint: null, observedAt: congelado.frozenAt, ...(serp ? { serp } : {}) });
    assert.ok(resultado.ok);
    return resultado.bundle;
  };

  const primeira = montar();
  assert.deepEqual(primeira.serpStanding, radarFrozenSerpStandingOf(congelado));
  assert.equal(primeira.serpStanding.authoritative, false);
  assert.deepEqual(Object.keys(primeira.serpStanding).sort(), ["authoritative", "current", "reason", "sufficient", "valid"], "a base fica no bundle congelado");

  const comSerpViva = montar({ current: true, sufficient: true, valid: true });
  assert.equal(comSerpViva.bundleHash, primeira.bundleHash, "leitura viva não muda a conclusão entregue");

  const canonico = resolveRadarCanonicalDossier({ analysis: versao("v7", 7, congelado), article: ARTIGO_CORRENTE, observedAt: congelado.frozenAt, authorities: null });
  assert.ok(canonico.ok);
  assert.equal(canonico.dossier.bundle.bundleHash, primeira.bundleHash);
  assert.notEqual(primeira.bundleHash, HASH_DOURADO_DO_DOSSIE, "o standing congelado entra na identidade do dossiê novo");
});

test("R1 · perfil YOUTUBE: o standing do Google congelado não entra num dossiê de vídeo", () => {
  const congelado = radarStampFrozenSerpStanding(LEGADO, avaliar({ sufficiency: "INSUFFICIENT" }));
  const payload = {
    ...payloadDaAnalise(congelado),
    youtubeFrozenInvestigation: { finalizedAt: "2026-09-21T12:00:00.000Z", runRef: { runId: "yt-1", runFingerprint: "fp", collectedAt: "2026-09-21T11:00:00.000Z", universeSize: 4, queriesExecuted: 1 }, limitations: [] },
  };
  const resultado = buildRadarEvidenceBundleFromAnalysis({ payload, article: ARTIGO_CORRENTE, competitiveBlueprint: null, observedAt: "2026-09-21T12:00:00.000Z" });
  assert.ok(resultado.ok);
  assert.equal(resultado.bundle.primaryResearchProfile, "YOUTUBE");
  assert.equal(resultado.bundle.serpStanding.authoritative, true, "comportamento anterior preservado fora do perfil Google");
});

/* ======================= (4) as travas ======================= */

test("R1 · trava: a fotografia não é reescrita sem reabrir — nem para tirar, nem para trocar o standing", () => {
  const congelado = radarStampFrozenSerpStanding(LEGADO, avaliar());
  const atual = payloadDaAnalise(congelado);

  const semStanding = radarGoogleResearchWriteLock({ current: atual, next: { ...atual, finalizedBundle: LEGADO } });
  assert.equal(semStanding.allowed, false);
  assert.equal(semStanding.state, "FINALIZED_LOCKED");
  assert.equal(semStanding.code, RADAR_GOOGLE_RESEARCH_FINALIZED);
  assert.equal(semStanding.frozenBundleRewritten, true);
  assert.deepEqual(semStanding.competitiveFields, []);

  const outroStanding = radarStampFrozenSerpStanding(LEGADO, avaliar({ sufficiency: "INSUFFICIENT" }));
  assert.equal(radarGoogleResearchWriteLock({ current: atual, next: { ...atual, finalizedBundle: outroStanding } }).allowed, false);

  const mesmaFotografiaOutraOrdem = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(congelado).reverse())));
  const anotar = radarGoogleResearchWriteLock({ current: atual, next: { ...atual, finalizedBundle: mesmaFotografiaOutraOrdem, humanNotes: ["nota"] } });
  assert.equal(anotar.allowed, true, "a mesma fotografia, noutra ordem de chaves, não é reescrita");
  assert.equal(anotar.frozenBundleRewritten, false);

  assert.equal(radarGoogleResearchWriteLock({ current: atual, next: { ...atual, finalizedBundle: null } }).allowed, true, "reabrir continua sendo a porta");
  assert.equal(radarGoogleResearchWriteLock({ current: payloadDaAnalise(null), next: atual }).allowed, true, "o próprio congelamento passa");
});

test("R1b · a coleta da SERP é recusada sob a fotografia e livre sem ela", () => {
  const recusa = radarGoogleSerpWriteLock(payloadDaAnalise(LEGADO));
  assert.equal(recusa.allowed, false);
  assert.equal(recusa.state, "FINALIZED_LOCKED");
  assert.equal(recusa.code, RADAR_GOOGLE_RESEARCH_FINALIZED);
  assert.match(recusa.message || "", /Reabra a investigação/);

  assert.equal(radarGoogleSerpWriteLock(payloadDaAnalise(null)).allowed, true);
  assert.equal(radarGoogleSerpWriteLock(null).allowed, true, "artigo sem análise ainda não tem o que travar");
});

/* ======================= (5) o carimbo no servidor ======================= */

function fonteContada(opcoes: { snapshots?: Registro[]; reviews?: Revisao[]; disponivel?: boolean } = {}) {
  const chamadas: string[] = [];
  return {
    chamadas,
    fonte: {
      async list(marca: string, artigo?: string) {
        chamadas.push(`list:${marca}:${artigo}`);
        return { records: opcoes.snapshots || [registro()], available: opcoes.disponivel !== false };
      },
      async listReviews(marca: string, artigo?: string) {
        chamadas.push(`reviews:${marca}:${artigo}`);
        return { reviews: opcoes.reviews || [], available: opcoes.disponivel !== false };
      },
    },
  };
}

test("R1 · servidor: só a TRANSIÇÃO congela e lê a SERP gravada; o envelope continua coerente", async () => {
  const { chamadas, fonte } = fonteContada({ reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00")] });
  const sucessora = versao("v6", 6, LEGADO, "v3");
  const resultado = await stampRadarSerpStandingAtFreeze({ brandId: MARCA, articleId: ARTIGO, current: payloadDaAnalise(null), next: sucessora, source: fonte });
  assert.ok(resultado.ok);
  assert.equal(resultado.stamped, true);
  assert.deepEqual(chamadas, [`list:${MARCA}:${ARTIGO}`, `reviews:${MARCA}:${ARTIGO}`]);
  const bundle = resultado.analysis.payload.finalizedBundle;
  assert.ok(bundle?.serpStanding);
  assert.equal(bundle.serpStanding.valid, false);
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(bundle));
  assert.equal(resultado.analysis.contentHash, await contentHash(resultado.analysis.payload), "o hash do envelope descreve o payload gravado");
  assert.equal(resultado.analysis.versionId, "v6");

  const jaCongelada = fonteContada();
  const depois = await stampRadarSerpStandingAtFreeze({ brandId: MARCA, articleId: ARTIGO, current: resultado.analysis.payload, next: resultado.analysis, source: jaCongelada.fonte });
  assert.ok(depois.ok);
  assert.equal(depois.stamped, false);
  assert.equal(depois.analysis, resultado.analysis, "anotar sobre a fotografia não relê nem recarimba");
  assert.deepEqual(jaCongelada.chamadas, []);

  const aberta = fonteContada();
  const semFotografia = versao("v8", 8, null);
  const livre = await stampRadarSerpStandingAtFreeze({ brandId: MARCA, articleId: ARTIGO, current: null, next: semFotografia, source: aberta.fonte });
  assert.ok(livre.ok);
  assert.equal(livre.stamped, false);
  assert.deepEqual(aberta.chamadas, []);
});

test("R1 · servidor: sem a leitura não se congela (503), e fotografia adulterada é recusada (409)", async () => {
  const indisponivel = await stampRadarSerpStandingAtFreeze({ brandId: MARCA, articleId: ARTIGO, current: null, next: versao("v6", 6, LEGADO), source: fonteContada({ disponivel: false }).fonte });
  assert.equal(indisponivel.ok, false);
  assert.ok(!indisponivel.ok && indisponivel.status === 503);

  const adulterada = { ...LEGADO, limitations: ["editada depois do hash"] };
  const recusa = await stampRadarSerpStandingAtFreeze({ brandId: MARCA, articleId: ARTIGO, current: null, next: versao("v6", 6, adulterada), source: fonteContada().fonte });
  assert.equal(recusa.ok, false);
  assert.ok(!recusa.ok && recusa.status === 409 && recusa.code === "RADAR_FROZEN_BUNDLE_MUTATED");
});

/* ======================= (6) as rotas, contra o banco simulado ======================= */

type Prototipo = Record<string, unknown>;
const prototipoDaSerp = SerpSnapshotRepository.prototype as unknown as Prototipo;

async function comSerpGravada<T>(fonte: ReturnType<typeof fonteContada>["fonte"], corpo: () => Promise<T>): Promise<T> {
  const originais = { list: prototipoDaSerp.list, listReviews: prototipoDaSerp.listReviews };
  prototipoDaSerp.list = fonte.list;
  prototipoDaSerp.listReviews = fonte.listReviews;
  try {
    return await corpo();
  } finally {
    prototipoDaSerp.list = originais.list;
    prototipoDaSerp.listReviews = originais.listReviews;
  }
}

function semear(corrente: unknown) {
  const { light } = splitAnalysisRun(corrente as Record<string, unknown>);
  banco.editorial_workflow_items = [{
    id: ITEM, marca_id: MARCA, article_id: ARTIGO, stage: "radar", state: "researching", lock_version: 7,
    created_at: "2026-09-20T10:00:00.000000+00:00", updated_at: "2026-09-21T10:00:00.000000+00:00",
    payload: {
      id: "radar-item-payload-1", articleDnaVersionId: DNA, articleDnaContentHash: "sha256:dna",
      title: "Pele oleosa", slug: "pele-oleosa", siloId: "silo-1", hierarchy: "pilar", principalKeywordId: "kw-1",
      format: "guia", intent: "informacional", analysisVersions: [light],
    },
  }];
  banco.radar_analysis_runs = [];
  pedidos.length = 0;
}

const post = (caminho: string, corpo: unknown) => new NextRequest(`http://localhost${caminho}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
});

const gravarAnalise = async (analysis: unknown) => {
  const resposta = await rotaDeAnalise.POST(post("/api/editorial/radar-analysis", { action: "save", brandId: MARCA, articleId: ARTIGO, expectedLock: 7, analysis }));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, unknown> };
};

const versaoGravada = () => {
  const versoes = (banco.editorial_workflow_items[0].payload as { analysisVersions: Array<{ versionId: string; contentHash: string; payload: { finalizedBundle: unknown } }> }).analysisVersions;
  return versoes[versoes.length - 1];
};

test("R1 · rota: o FINALIZE grava a fotografia com o standing avaliado no servidor", async () => {
  semear(versao("v3", 3, null));
  const { chamadas, fonte } = fonteContada({ reviews: [revisao("approved", "2026-09-21T10:00:00+00:00")] });
  const resposta = await comSerpGravada(fonte, () => gravarAnalise(versao("v6", 6, LEGADO, "v3")));
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(chamadas.length, 2, "a SERP gravada foi lida uma vez, na transição");

  const gravada = versaoGravada();
  assert.equal(gravada.versionId, "v6");
  const bundle = RadarFrozenEvidenceBundleSchema.parse(gravada.payload.finalizedBundle);
  assert.deepEqual(bundle.serpStanding?.basis, { snapshotId: SNAPSHOT, snapshotHash: HASH_SERP, reviewStatus: "approved", sufficiencyLevel: "SUFFICIENT", invalidReasons: [] });
  assert.equal(bundle.serpStanding?.authoritative, true);
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(bundle));
  assert.notEqual(bundle.bundleHash, LEGADO.bundleHash);
});

test("R1 · rota: FINALIZE com fotografia adulterada é 409, sem a SERP gravada é 503, e nada é gravado", async () => {
  semear(versao("v3", 3, null));
  const adulterada = await comSerpGravada(fonteContada().fonte, () => gravarAnalise(versao("v6", 6, { ...LEGADO, limitations: ["editada depois do hash"] }, "v3")));
  assert.equal(adulterada.status, 409, JSON.stringify(adulterada.corpo));
  assert.equal(adulterada.corpo.code, "RADAR_FROZEN_BUNDLE_MUTATED");
  assert.equal(pedidos.some(pedido => pedido.metodo !== "GET"), false, "a recusa não escreve nada");

  semear(versao("v3", 3, null));
  const semLeitura = await comSerpGravada(fonteContada({ disponivel: false }).fonte, () => gravarAnalise(versao("v6", 6, LEGADO, "v3")));
  assert.equal(semLeitura.status, 503, JSON.stringify(semLeitura.corpo));
  assert.equal(semLeitura.corpo.code, "RADAR_SERP_STANDING_UNAVAILABLE");
  assert.equal(pedidos.some(pedido => pedido.metodo !== "GET"), false, "sem avaliar, não congela");
});

test("R1 · rota: fotografia reescrita sem reabrir é 409, e nada é gravado", async () => {
  const congelada = versao("v3", 3, radarStampFrozenSerpStanding(LEGADO, avaliar()));
  semear(congelada);
  const { chamadas, fonte } = fonteContada();
  const resposta = await comSerpGravada(fonte, () => gravarAnalise(versao("v6", 6, LEGADO, "v3")));
  assert.equal(resposta.status, 409);
  assert.equal(resposta.corpo.code, RADAR_GOOGLE_RESEARCH_FINALIZED);
  assert.equal(pedidos.some(pedido => pedido.metodo !== "GET"), false, "a recusa não escreve nada");
  assert.deepEqual(chamadas, [], "nem relê a SERP");

  semear(congelada);
  const anotacao = { ...congelada, versionId: "v6", versionNumber: 6, previousVersionId: "v3", payload: { ...congelada.payload, humanNotes: ["depois do congelamento"] } };
  const permitida = await comSerpGravada(fonte, () => gravarAnalise(anotacao));
  assert.equal(permitida.status, 200, JSON.stringify(permitida.corpo));
  assert.deepEqual(chamadas, [], "anotar sobre a fotografia não relê a SERP");
});

const ENVELOPE = {
  schemaVersion: 1, brandId: MARCA, radarItemId: ITEM, articleId: ARTIGO,
  articleDna: { versionId: DNA, versionNumber: 3, contentHash: "sha256:dna", publicationState: "approved" },
  principalKeyword: {
    referenceKeywordId: "kw-1", canonicalKeywordId: null, sourceKeywordId: null, originalKeywordId: null, aliases: [],
    keywordDnaVersionId: "kdna-1", keyword: "pele oleosa", role: "principal", brandId: MARCA, siloId: null, siloName: null, isPublished: false,
  },
  silo: null,
  transfer: { sourceModule: "arquiteto", targetModule: "radar", source: "browser_hydration", transferredAt: "2026-09-20T10:00:00.000Z", importKey: "importacao-1" },
  snapshotHash: `sha256:${"a".repeat(64)}`,
};

const coletar = async (acao: "collect" | "collect_auxiliary") => {
  const corpo = {
    action: acao, brandId: MARCA, articleId: ARTIGO, location: "Brasil", language: "pt-BR", device: "desktop",
    articleDnaVersionId: DNA, resolutionEnvelope: ENVELOPE, ...(acao === "collect_auxiliary" ? { keywordId: "kw-2" } : {}),
  };
  const resposta = await rotaDaSerp.POST(post("/api/editorial/serp", corpo));
  return { status: resposta.status, corpo: await resposta.json() as Record<string, unknown> };
};

const chamadasPagas = () => Number((globalThis as { __radarChamadasPagas?: number }).__radarChamadasPagas || 0);

test("R1b · rota: \"Atualizar SERP\" e a auxiliar são recusadas depois do FINALIZE, antes de qualquer gasto", async () => {
  for (const acao of ["collect", "collect_auxiliary"] as const) {
    semear(versao("v3", 3, radarStampFrozenSerpStanding(LEGADO, avaliar())));
    const antes = chamadasPagas();
    const resposta = await coletar(acao);
    assert.equal(resposta.status, 409, `${acao}: ${JSON.stringify(resposta.corpo)}`);
    assert.equal(resposta.corpo.code, RADAR_GOOGLE_RESEARCH_FINALIZED);
    assert.equal(resposta.corpo.state, "FINALIZED_LOCKED");
    assert.equal(chamadasPagas(), antes, `${acao}: nenhuma credencial resolvida, nenhum provider chamado`);
    assert.equal(pedidos.some(pedido => pedido.metodo !== "GET"), false, `${acao}: nada gravado`);
    assert.deepEqual([...new Set(pedidos.map(pedido => pedido.tabela))].sort(), ["editorial_workflow_items", "radar_analysis_runs"], `${acao}: só a leitura da trava`);
  }
});

test("R1b · rota: sem fotografia a trava abre, e a leitura da análise continua sendo UMA", async () => {
  semear(versao("v3", 3, null));
  const antes = chamadasPagas();
  const resposta = await coletar("collect");
  assert.notEqual(resposta.corpo.code, RADAR_GOOGLE_RESEARCH_FINALIZED, JSON.stringify(resposta.corpo));
  assert.equal(chamadasPagas(), antes, "o envelope de fixture é recusado antes de qualquer gasto");
  const leiturasDoItem = pedidos.filter(pedido => pedido.tabela === "editorial_workflow_items" && pedido.metodo === "GET");
  assert.equal(leiturasDoItem.length, 1, "a autoridade de fonte reaproveita a leitura da trava");
});

test("R1b · a trava da SERP vem depois do review e antes de tudo que custa", () => {
  const rota = semComentarios(readFileSync(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8"));
  const corpoDoPost = rota.slice(rota.indexOf("export async function POST"));
  const trava = corpoDoPost.indexOf("radarGoogleSerpWriteLock(");
  assert.ok(trava > 0, "a rota consulta a trava");
  assert.ok(corpoDoPost.indexOf("input.action === \"review\"") < trava, "revisar continua livre");
  for (const depois of [
    "resolveRadarResearchSource(",
    "resolveDataForSeoCanonicalSerpCompatibilityConfig(",
    "recordUsage: recordIntegrationUsage",
    "new SerpSnapshotRepository(); const history",
    "collectRadarSerpLensSnapshot(",
    "readRadarKeywordTargetCodes(",
  ]) {
    assert.ok(corpoDoPost.indexOf(depois) > trava, `a trava vem antes de ${depois}`);
  }
  for (const portaAntiga of ["collectDataForSeoSerpSnapshot(", "recordIntegrationUsage("]) {
    assert.equal(corpoDoPost.indexOf(portaAntiga), -1, `todo gasto passa pelo núcleo das lentes, e não por ${portaAntiga}`);
  }
  for (const cache of ["lookupSerpCache(", "collectAndCacheSerp("]) {
    const onde = corpoDoPost.indexOf(cache);
    assert.ok(onde === -1 || onde > trava, `a trava vem antes de ${cache}, inclusive por acerto de cache`);
  }

  const analise = semComentarios(readFileSync(new URL("../app/api/editorial/radar-analysis/route.ts", import.meta.url), "utf8"));
  const carimbo = analise.indexOf("stampRadarSerpStandingAtFreeze(");
  assert.ok(analise.indexOf("radarGoogleResearchWriteLock(") < carimbo, "o carimbo vem depois da trava");
  assert.ok(carimbo < analise.indexOf("appendRadarAnalysis(input.brandId"), "e antes da escrita");
  assert.match(analise, /appendRadarAnalysis\(input\.brandId, input\.articleId, input\.expectedLock, congelamento\.analysis, profile\.userId\)/);
});

test("R1 · o dossiê não calcula o standing na leitura", () => {
  const runtime = semComentarios(readFileSync(new URL("../lib/radar/evidence-bundle-runtime.ts", import.meta.url), "utf8"));
  assert.match(runtime, /radarFrozenSerpStandingOf\(analise\.finalizedBundle\)/);
  for (const proibido of ["evaluateRadarFrozenSerpStanding", "SerpSnapshotRepository", "listReviews", "Date.now", "new Date("]) {
    assert.equal(runtime.includes(proibido), false, `o dossiê não pode usar ${proibido}`);
  }
});

/* ======================= (7) correções da revisão ======================= */

function comVinculo(base: ReturnType<typeof versao>, serpSnapshotId: string, serpSnapshotHash: string) {
  return VersionedRadarAnalysisSchema.parse({ ...base, payload: { ...base.payload, serpSnapshotId, serpSnapshotHash } });
}

const OUTRO_SNAPSHOT = "serp-outro";
const HASH_OUTRO = "e".repeat(64);

test("R1 · servidor: o congelamento que troca a SERP vinculada é 409, antes de ler a SERP gravada", async () => {
  const correnteAberta = payloadDaAnalise(null);
  const casos: Array<[string, string, string]> = [["outro snapshot", OUTRO_SNAPSHOT, HASH_OUTRO], ["mesmo snapshot, outro hash", SNAPSHOT, HASH_OUTRO]];
  for (const [nome, id, hash] of casos) {
    const { chamadas, fonte } = fonteContada({ snapshots: [registro(), registro({ id: OUTRO_SNAPSHOT }, { id: OUTRO_SNAPSHOT, contentHash: HASH_OUTRO })] });
    const resultado = await stampRadarSerpStandingAtFreeze({ brandId: MARCA, articleId: ARTIGO, current: correnteAberta, next: comVinculo(versao("v6", 6, LEGADO, "v3"), id, hash), source: fonte });
    assert.equal(resultado.ok, false, nome);
    assert.ok(!resultado.ok && resultado.status === 409 && resultado.code === "RADAR_FREEZE_SERP_LINK_CHANGED", nome);
    assert.deepEqual(chamadas, [], `${nome}: a recusa não lê a SERP gravada`);
  }

  const { fonte } = fonteContada({ reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00")] });
  const mesmoVinculo = await stampRadarSerpStandingAtFreeze({ brandId: MARCA, articleId: ARTIGO, current: correnteAberta, next: versao("v6", 6, LEGADO, "v3"), source: fonte });
  assert.ok(mesmoVinculo.ok);
  assert.equal(mesmoVinculo.analysis.payload.finalizedBundle?.serpStanding?.basis.snapshotId, SNAPSHOT, "avaliado sobre o vínculo gravado");
  assert.equal(mesmoVinculo.analysis.payload.finalizedBundle?.serpStanding?.valid, false);
});

test("R1 · rota: FINALIZE que troca a SERP vinculada é 409, e nada é gravado", async () => {
  semear(versao("v3", 3, null));
  const { chamadas, fonte } = fonteContada({ snapshots: [registro(), registro({ id: OUTRO_SNAPSHOT }, { id: OUTRO_SNAPSHOT, contentHash: HASH_OUTRO })] });
  const resposta = await comSerpGravada(fonte, () => gravarAnalise(comVinculo(versao("v6", 6, LEGADO, "v3"), OUTRO_SNAPSHOT, HASH_OUTRO)));
  assert.equal(resposta.status, 409, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.code, "RADAR_FREEZE_SERP_LINK_CHANGED");
  assert.equal(pedidos.some(pedido => pedido.metodo !== "GET"), false, "a recusa não escreve nada");
  assert.deepEqual(chamadas, []);
  assert.equal(versaoGravada().versionId, "v3");
});

test("R1 · D1 · a revisão casa pelo id do registro e pelo id da pesquisa", () => {
  const snapshotComDoisIds = [registro({ id: "linha-uuid-1" }, { id: SNAPSHOT })];
  const pelaLinha = avaliar({ snapshots: snapshotComDoisIds, reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00", "linha-uuid-1")] });
  assert.equal(pelaLinha.valid, false, "revisão gravada com o id da linha");
  assert.deepEqual(pelaLinha.basis.invalidReasons, ["SNAPSHOT_REJECTED"]);
  assert.equal(pelaLinha.basis.snapshotId, "linha-uuid-1");

  const pelaPesquisa = avaliar({ snapshots: snapshotComDoisIds, reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00", SNAPSHOT)] });
  assert.equal(pelaPesquisa.valid, false, "revisão gravada com o id da pesquisa");

  const vinculadaPelaLinha = avaliar({ analysis: { serpSnapshotId: "linha-uuid-1", serpSnapshotHash: HASH_SERP }, snapshots: snapshotComDoisIds, reviews: [revisao("rejected", "2026-09-21T10:00:00+00:00", SNAPSHOT)] });
  assert.equal(vinculadaPelaLinha.valid, false, "análise vinculada pelo id da linha, revisão pelo da pesquisa");
});

test("R1 · perfil AMAZON: o standing do Google congelado não entra num dossiê de produto", () => {
  const congelado = radarStampFrozenSerpStanding(LEGADO, avaliar({ sufficiency: "INSUFFICIENT" }));
  const payload = {
    ...payloadDaAnalise(congelado),
    amazonFrozenInvestigation: { frozenVersion: 1, finalizedAt: "2026-09-21T12:00:00.000Z", finalizedBy: "user-1", runRef: { runId: "amz-1", runFingerprint: "fp", collectedAt: "2026-09-21T11:00:00.000Z", universeSize: 4, queriesExecuted: 1 }, limitations: [] },
  };
  const resultado = buildRadarEvidenceBundleFromAnalysis({ payload, article: ARTIGO_CORRENTE, competitiveBlueprint: null, observedAt: "2026-09-21T12:00:00.000Z" });
  assert.ok(resultado.ok, JSON.stringify(resultado));
  assert.equal(resultado.bundle.primaryResearchProfile, "AMAZON");
  assert.equal(resultado.bundle.serpStanding.authoritative, true, "comportamento anterior preservado fora do perfil Google");
  assert.equal(resultado.bundle.serpStanding.sufficient, true);
});

function semearHistorico(versoes: unknown[]) {
  const partes = versoes.map(item => splitAnalysisRun(item as Record<string, unknown>));
  semear(versoes.at(-1));
  (banco.editorial_workflow_items[0].payload as { analysisVersions: unknown[] }).analysisVersions = partes.map(parte => parte.light);
  banco.radar_analysis_runs = versoes.map(item => ({ workflow_item_id: ITEM, version_id: (item as { versionId: string }).versionId, payload: { extractions: [] } }));
}

test("R1b · rota: a leitura da trava reidrata só a versão corrente, aberta ou congelada", async () => {
  for (const corrente of [versao("v3", 3, null, "v2"), versao("v3", 3, radarStampFrozenSerpStanding(LEGADO, avaliar()), "v2")]) {
    semearHistorico([versao("v1", 1, null), versao("v2", 2, null, "v1"), corrente]);
    await coletar("collect");
    const corridas = pedidos.filter(pedido => pedido.tabela === "radar_analysis_runs" && pedido.metodo === "GET");
    assert.equal(corridas.length, 1, "uma leitura de corridas");
    assert.equal(corridas[0].params.get("version_id"), "in.(v3)", "só a corrente é reidratada");
  }
});

test("R1b · a trava na gravação lê só a parte leve e enxerga um FINALIZE feito durante a coleta", async () => {
  const { radarGoogleSerpWriteLockAtSave, readRadarCurrentAnalysisForSerp } = await import("../lib/server/radar-serp-write-lock.ts");
  semear(versao("v3", 3, null));
  assert.equal(radarGoogleSerpWriteLock(await readRadarCurrentAnalysisForSerp(MARCA, ARTIGO)).allowed, true, "aberta no início da coleta");

  semear(versao("v4", 4, radarStampFrozenSerpStanding(LEGADO, avaliar()), "v3"));
  const naGravacao = await radarGoogleSerpWriteLockAtSave(MARCA, ARTIGO);
  assert.equal(naGravacao.allowed, false);
  assert.equal(naGravacao.state, "FINALIZED_LOCKED");
  assert.equal(naGravacao.code, RADAR_GOOGLE_RESEARCH_FINALIZED);
  assert.deepEqual([...new Set(pedidos.map(pedido => pedido.tabela))], ["editorial_workflow_items"], "nenhuma corrida lida");

  semear(versao("v5", 5, null, "v4"));
  assert.equal((await radarGoogleSerpWriteLockAtSave(MARCA, ARTIGO)).allowed, true, "reaberta, grava");
});

test("R1b · a rota consulta a trava de novo entre a coleta paga e a gravação do snapshot", () => {
  const rota = semComentarios(readFileSync(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8"));
  const corpoDoPost = rota.slice(rota.indexOf("export async function POST"));
  const coleta = corpoDoPost.indexOf("await collectRadarSerpLensSnapshot(");
  const rechecagem = corpoDoPost.indexOf("radarGoogleSerpWriteLockAtSave(input.brandId, input.articleId)");
  const recusa = corpoDoPost.indexOf("if (!travaNaGravacao.allowed)");
  const gravacao = corpoDoPost.indexOf("repository.save(input.brandId, record");
  assert.ok(coleta > 0 && rechecagem > coleta, "a trava é relida depois da coleta");
  assert.ok(recusa > rechecagem && gravacao > recusa, "e antes de gravar o snapshot");
  assert.match(corpoDoPost.slice(recusa, gravacao), /return NextResponse\.json\(/);
  assert.equal(/\.findByArticle\(/.test(corpoDoPost), false, "o POST não reidrata todas as versões para a trava");
  assert.match(corpoDoPost, /await readRadarCurrentAnalysisForSerp\(input\.brandId, input\.articleId\)/);
});
