import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * R3, R4 e R5 DA SDD DO RADAR NAS QUATRO LENTES.
 *
 *   R3 · o bundle congelado e o dossiê carregam as quatro lentes COPIADAS: o
 *        cache pode ser regravado ou vencer, e o bundleHash, o dossiê e as
 *        lentes entregues ao Redator não se movem;
 *   R4 · a pesquisa auxiliar e o apoio Google do perfil Amazon passam pelo
 *        MESMO núcleo, cache primeiro nas quatro lentes; a auxiliar continua
 *        fora de `serpRecords`, e os orgânicos dela são só da Desktop · Windows;
 *   R5 · YouTube e Amazon Merchant continuam em lente única, e o aparelho que
 *        o provider ecoou fica na proveniência.
 *
 * O núcleo roda de verdade (store do cache, normalizador, observação) contra
 * um banco em memória com a forma do `postgrest-js` e um `fetch` FALSO no
 * lugar da DataForSEO, com o corpo real das fixtures. Nenhuma chamada paga,
 * nenhum banco remoto, nenhuma rede.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";
globalThis.fetch = (async (entrada: string | URL | Request) => {
  throw new Error(`rede real proibida neste teste: ${String(entrada)}`);
}) as typeof fetch;

const {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  SERP_CACHE_SUBJECT_TYPE,
  serpCacheLensLabel,
  trimSerpBodyToDepth,
} = await import("../lib/editorial/serp-cache.ts");
const { RADAR_SERP_LENS_LABELS, RadarSerpLensSetSchema } = await import("../lib/radar/serp/lens-set.ts");
const {
  RADAR_FROZEN_SERP_LENSES_VERSION,
  RadarFrozenSerpLensBlockSchema,
  buildRadarFrozenSerpLensBlock,
  radarFrozenLensSetHash,
  radarFrozenSerpLensesFromLensSet,
} = await import("../lib/radar/serp/frozen-lenses.ts");
const {
  RadarFrozenEvidenceBundleSchema,
  assertRadarFrozenBundleIntegrity,
  radarFrozenBundleHash,
  radarFrozenSerpLensesOf,
  radarStampFrozenSerpLenses,
} = await import("../lib/radar/investigation-finalization.ts");
const { evaluateRadarFrozenSerpLenses } = await import("../lib/radar/frozen-serp-standing.ts");
const { RadarQueryEvidenceSchema, radarQueryEvidenceFrom } = await import("../lib/radar/deep-research.ts");
const { RadarAnalysisPayloadSchema, VersionedRadarAnalysisSchema } = await import("../lib/radar/analysis-contracts.ts");
const { buildRadarEvidenceBundleFromAnalysis } = await import("../lib/radar/evidence-bundle-runtime.ts");
const { stampRadarSerpStandingAtFreeze } = await import("../lib/server/radar-frozen-serp-standing.ts");
const { collectRadarSerpLensSnapshot } = await import("../lib/server/radar-serp-lenses.ts");
const { collectAndCacheSerp } = await import("../lib/server/serp-cache.ts");
const { collectRadarGoogleSupport } = await import("../lib/server/radar-support-research.ts");
const { radarProviderDeviceEchoOf } = await import("../lib/radar/provider-device-echo.ts");
const { radarProviderDeviceEchoRecorder } = await import("../lib/server/radar-provider-echo.ts");
const { executeDataForSeoAmazonQuery, buildDataForSeoAmazonRequest } = await import("../lib/server/dataforseo-amazon-operation.ts");
const { normalizeDataForSeoYoutubeResponse } = await import("../lib/server/dataforseo-youtube-operation.ts");
const { RadarAmazonProvenanceSchema } = await import("../lib/radar/amazon-search-run.ts");
const { CollectAuxiliaryRequestSchema, buildRadarSerpAuxiliaryPayload } = await import("../lib/radar/serp/request.ts");

type SerpCacheLens = (typeof SERP_CACHE_LENSES)[number];
type SerpCacheContext = Parameters<typeof collectAndCacheSerp>[0];
type LensInput = Parameters<typeof collectRadarSerpLensSnapshot>[0];
type LensDeps = Parameters<typeof collectRadarSerpLensSnapshot>[1];
type Snapshot = Awaited<ReturnType<typeof collectRadarSerpLensSnapshot>>["research"];
type Bundle = ReturnType<typeof RadarFrozenEvidenceBundleSchema.parse>;
type SupportDeps = NonNullable<Parameters<typeof collectRadarGoogleSupport>[1]>;

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CRU = JSON.parse(ler("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json"));
const CONFIG = { login: "l", password: "p", baseUrl: "https://provider.invalid", timeoutMs: 5_000, locationCode: 2076, languageCode: "pt" };
const MARCA = "5f0c9a1e-3b2d-4c8e-9a7f-1d2e3f4a5b6c";
const KW = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ARTIGO = "artigo-skincare";
const DNA = "dna-v1";
const CODIGOS = { locationCode: 2076, languageCode: "pt" };
const T0 = new Date("2026-09-20T09:00:00.000Z");
const T1 = new Date("2026-09-23T10:00:00.000Z");
const T2 = new Date("2026-09-23T11:00:00.000Z");

/* ------------------------------ banco em memória ----------------------------- */

type Linha = Record<string, unknown> & { id: string; lock_version: number };
type Filtro = { coluna: string; tipo: "eq" | "in" | "is"; valor: unknown };
type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

class Consulta {
  op: "select" | "insert" | "update" = "select";
  colunas = "";
  filtros: Filtro[] = [];
  valores: Record<string, unknown> | null = null;
  unica = false;
  readonly banco: Banco;
  readonly tabela: string;
  constructor(banco: Banco, tabela: string) {
    this.banco = banco;
    this.tabela = tabela;
  }
  select(colunas = "*") { if (this.op === "select" || !this.colunas) this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "eq", valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, tipo: "in", valor }); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "is", valor }); return this; }
  insert(valores: Record<string, unknown>) { this.op = "insert"; this.valores = valores; return this; }
  update(valores: Record<string, unknown>) { this.op = "update"; this.valores = valores; return this; }
  maybeSingle() { this.unica = true; return this; }
  then<A, B = never>(resolve: (valor: Resposta) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
}

function projetar(linha: Linha, colunas: string) {
  if (!colunas || colunas === "*") return structuredClone(linha);
  return Object.fromEntries(colunas.split(",").map(item => {
    const [apelido, caminho] = item.includes(":") ? item.split(":") : [item, item];
    let valor: unknown = linha;
    for (const parte of caminho.split(/->>?/)) valor = valor && typeof valor === "object" ? (valor as Record<string, unknown>)[parte] : undefined;
    if (caminho.includes("->>") && valor !== undefined && valor !== null) valor = String(valor);
    return [apelido, structuredClone(valor ?? null)];
  }));
}

class Banco {
  tabelas: Record<string, Linha[]> = { editorial_workflow_items: [], minerador_keywords: [] };
  chamadas: Consulta[] = [];
  private proximo = 1;
  from(tabela: string) { return new Consulta(this, tabela); }
  private casa(linha: Linha, filtros: Filtro[]) {
    return filtros.every(({ coluna, tipo, valor }) => {
      if (tipo === "eq") return linha[coluna] === valor;
      if (tipo === "is") return (linha[coluna] ?? null) === valor;
      return (valor as unknown[]).includes(linha[coluna]);
    });
  }
  executar(consulta: Consulta): Resposta {
    this.chamadas.push(consulta);
    const linhas = this.tabelas[consulta.tabela] || (this.tabelas[consulta.tabela] = []);
    if (consulta.op === "insert") {
      const valores = consulta.valores!;
      const duplicada = linhas.some(linha => ["marca_id", "subject_type", "subject_id", "stage"].every(chave => linha[chave] === valores[chave]));
      if (duplicada) return { data: null, error: { code: "23505", message: "duplicate key" } };
      const linha: Linha = { ...structuredClone(valores), id: `linha-${this.proximo++}`, lock_version: 1 };
      linhas.push(linha);
      return { data: projetar(linha, consulta.colunas), error: null };
    }
    const alvo = linhas.filter(linha => this.casa(linha, consulta.filtros));
    if (consulta.op === "update") {
      for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: linha.lock_version + 1 });
    }
    const projetadas = alvo.map(linha => projetar(linha, consulta.colunas));
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
  entradaDa(lente: string) {
    return this.tabelas.editorial_workflow_items.find(linha => linha.subject_type === SERP_CACHE_SUBJECT_TYPE
      && serpCacheLensLabel((linha.payload as { meta: { lens: SerpCacheLens } }).meta.lens) === lente);
  }
  metaDa(lente: string) { return (this.entradaDa(lente)?.payload as { meta: { providerRequestId: string; collectedAt: string } }).meta; }
}

const contexto = (banco: Banco): SerpCacheContext => ({ supabase: banco as unknown as SerpCacheContext["supabase"], brandId: MARCA, actorUserId: "ator-1" });

/* --------------------------------- provider --------------------------------- */

type Registro = Record<string, unknown>;
type CorpoDaFixture = { tasks: Array<Registro & { id: string; data: Registro; result: Array<Registro & { items: Registro[] }> | null }> };

/* A Android troca o primeiro orgânico; a iOS ganha uma pergunta no PAA; a macOS repete a Windows. */
function variantePadrao(lente: string, corpo: CorpoDaFixture) {
  const itens = corpo.tasks[0].result![0].items;
  if (lente === "mobile-android") {
    const primeiro = itens.find(item => item.type === "organic")!;
    primeiro.domain = "www.so-no-android.com.br";
    primeiro.url = "https://www.so-no-android.com.br/skincare";
  }
  if (lente === "mobile-ios") {
    const paa = itens.find(item => item.type === "people_also_ask") as Registro & { items: Registro[] };
    paa.items.push({ type: "people_also_ask_element", title: "Skincare facial funciona no celular?" });
  }
}

function provedor(opcoes: { variante?: (lente: string, corpo: CorpoDaFixture) => void; falha?: Record<string, "task"> } = {}) {
  const chamadas: Registro[] = [];
  let sequencia = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const pedido = (JSON.parse(String(init?.body)) as Registro[])[0];
    chamadas.push(pedido);
    const lente = `${pedido.device}-${pedido.os}`;
    sequencia += 1;
    const corpo = structuredClone(CRU) as CorpoDaFixture;
    corpo.tasks[0].id = `tarefa-${lente}-${sequencia}`;
    corpo.tasks[0].data = { ...corpo.tasks[0].data, device: pedido.device, os: pedido.os, depth: pedido.depth, tag: pedido.tag };
    if (opcoes.falha?.[lente] === "task") {
      corpo.tasks[0].status_code = 40501;
      corpo.tasks[0].status_message = "Invalid Field: 'os'.";
      corpo.tasks[0].result = null;
    } else {
      variantePadrao(lente, corpo);
      opcoes.variante?.(lente, corpo);
    }
    const resposta = Number(pedido.depth) < 20 ? trimSerpBodyToDepth(corpo, Number(pedido.depth)) : corpo;
    return new Response(JSON.stringify(resposta), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, chamadas };
}

type Uso = Parameters<LensDeps["recordUsage"]>[0];
const RECURSO = { allowed: true, actorUserId: "ator-1", agencyId: null, brandId: MARCA, resourceKey: null, capability: null } as unknown as Uso["resource"];

function dependencias(fetchImpl: typeof fetch) {
  const cotas: number[] = [];
  const usos: Uso[] = [];
  const deps: LensDeps = {
    resolveConfig: async quotaUnits => { cotas.push(quotaUnits); return { config: CONFIG, resource: RECURSO }; },
    recordUsage: async entrada => { usos.push(entrada); return null; },
    fetchImpl,
  };
  return { deps, cotas, usos };
}

const BUSCA: LensInput["searchInput"] = {
  brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA, keywordId: KW, keywordDnaVersionId: "kwdna-v1",
  keyword: "skincare facial", location: "Brasil", language: "pt-BR", device: "desktop", operatingSystem: null,
  expectedIntent: "", expectedFormat: "pilar", requiredTopics: [], articleEntities: [], resultLimit: 10, version: 1, previousSnapshotId: null,
};

const entrada = (banco: Banco, extra: Partial<LensInput> = {}): LensInput => ({
  context: contexto(banco), searchInput: BUSCA, codes: CODIGOS, cacheKeywordId: KW, previous: null, recollect: false, now: T1, operationRequestId: "op-radar", ...extra,
});

async function semearMinerador(banco: Banco, quando = T0, fetchImpl = provedor().fetchImpl, codigos = CODIGOS) {
  for (const lens of SERP_CACHE_LENSES) {
    const canonica = serpCacheLensLabel(lens) === serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS);
    await collectAndCacheSerp(contexto(banco), {
      query: { keyword: BUSCA.keyword, ...codigos, lens, endpoint: "advanced" },
      depth: canonica ? 20 : 10,
      keywordId: KW,
    }, { config: CONFIG, operationRequestId: "op-minerador", collectedBy: "minerador", now: quando, storeBody: canonica, provider: { fetchImpl } });
  }
}

/* O mesmo provider semeia o cache e atende o Radar: a lente que o provider recusa fica faltando. */
async function snapshotDoCache(opcoes: { falha?: Record<string, "task"> } = {}) {
  const banco = new Banco();
  const fornecedor = provedor(opcoes);
  await semearMinerador(banco, T0, fornecedor.fetchImpl);
  const { deps } = dependencias(fornecedor.fetchImpl);
  const coleta = await collectRadarSerpLensSnapshot(entrada(banco), deps);
  return { banco, research: coleta.research };
}

/* ------------------------------ a análise ------------------------------ */

const CONTEUDO = {
  bundleId: "bundle:r3-1", frozenAt: "2026-09-23T12:00:00.000Z", frozenBy: "user-1",
  conclusion: "FINALIZABLE" as const, acknowledgedInsufficiency: null,
  binding: { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA, articleDnaContentHash: "sha256:dna" },
  foundationFingerprint: "fp-1",
  search: { mode: "kgr_light", canonicalQueries: 1, auxiliaryQueries: 1, queries: [], uniqueReferences: 6, selectedReferences: 6, recurrentReferences: 0, auxiliaryOnlyReferences: 0 },
  sample: { analyzedSuccess: 6, comparablePages: 6, failedFinal: 0, extractionIds: ["https://a.test/1"] },
  model: { sufficiency: "SUFFICIENT", sufficiencyReasons: [], intent: "informacional", dominantFormat: null, recurrentConcepts: 0, questions: 0, gaps: 0, differentiations: 0, conflicts: 0, conceptIds: [] },
  links: { graphVersionId: null, graphContentHash: null, relatedDestinations: 0, outgoing: [], incoming: [], totalRecommendedLinks: 0, unresolvedRelations: 0 },
  authority: { ymylRelevance: "LOW", claims: [], verifiedSources: [], factualEvidence: [], marketVsFactConflicts: [], specialistRequirements: [] },
  discovery: { applicable: false, applicability: "NOT_APPLICABLE", required: false, funnel: null, answerableUnits: [], coreQuestions: 0, definitionRequirements: 0, entityCoverageRequirements: 0, retrievabilityRequirements: 0, matrix: { shared: 0, search: 0, aiDiscovery: 0 } },
  blueprint: null,
  limitations: ["uma limitação congelada"],
};
const ABERTO = RadarFrozenEvidenceBundleSchema.parse({ ...CONTEUDO, bundleHash: radarFrozenBundleHash(CONTEUDO) });

function registroDeInvestigacao(consultas: Array<Record<string, unknown>>) {
  return {
    startedAt: "2026-09-23T09:00:00.000Z", startedBy: "user-1", primarySearchMode: "WEB",
    fingerprint: {
      articleDnaVersionId: DNA, articleDnaContentHash: "sha256:dna", keywordRefs: [], siloDnaVersionId: null, siloPageId: null,
      formationAssessmentId: null, formationBaseHash: null, internalLinkGraphVersionId: null, value: "fp-1",
    },
    queries: consultas, summary: null, researchCuration: null, finalizedAt: null, finalizedBy: null, conclusion: null,
  };
}

function payloadDaAnalise(input: { finalizedBundle: unknown; snapshot: { id: string; contentHash: string }; deepResearch?: unknown; brandId?: string; articleId?: string; dna?: string }) {
  return RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: input.brandId || MARCA, articleId: input.articleId || ARTIGO, articleDnaVersionId: input.dna || DNA,
    serpSnapshotId: input.snapshot.id, serpSnapshotVersion: 1, serpSnapshotHash: input.snapshot.contentHash,
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: input.deepResearch ?? null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: input.finalizedBundle,
    benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });
}

function versao(versionId: string, payload: ReturnType<typeof payloadDaAnalise>) {
  return VersionedRadarAnalysisSchema.parse({
    versionId, entityId: `radar-analysis:${ARTIGO}`, versionNumber: 2, previousVersionId: "v1",
    contentHash: `sha256:${"b".repeat(64)}`, origin: "human", changeReason: "fixture",
    createdAt: "2026-09-23T12:00:00.000Z", createdBy: "user-1", payload,
  });
}

const registroGravado = (research: Snapshot) => ({ id: research.id, origin: "real", isMock: false, research });

/** O FINALIZE no servidor, com a leitura da SERP gravada simulada. */
async function congelar(research: Snapshot, opcoes: { deepResearch?: unknown; deepResearchGravado?: unknown; bundle?: Bundle; vinculo?: { id: string; contentHash: string } } = {}) {
  const vinculo = opcoes.vinculo || { id: research.id, contentHash: research.contentHash };
  const gravado = "deepResearchGravado" in opcoes ? opcoes.deepResearchGravado : opcoes.deepResearch;
  const aberta = payloadDaAnalise({ finalizedBundle: null, snapshot: vinculo, deepResearch: gravado });
  const proxima = versao("v2", payloadDaAnalise({ finalizedBundle: opcoes.bundle || ABERTO, snapshot: vinculo, deepResearch: opcoes.deepResearch }));
  const resultado = await stampRadarSerpStandingAtFreeze({
    brandId: MARCA, articleId: ARTIGO, current: aberta, next: proxima,
    source: {
      list: async () => ({ records: [registroGravado(research)], available: true }),
      listReviews: async () => ({ reviews: [], available: true }),
    },
  });
  assert.ok(resultado.ok, JSON.stringify(resultado));
  return resultado.analysis;
}

const ARTIGO_CORRENTE = { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA, articleDnaContentHash: "sha256:dna" };

function dossie(payload: unknown, observedAt = CONTEUDO.frozenAt) {
  const resultado = buildRadarEvidenceBundleFromAnalysis({ payload, article: ARTIGO_CORRENTE, competitiveBlueprint: null, observedAt });
  assert.ok(resultado.ok);
  return resultado.bundle;
}

function chavesDe(valor: unknown, acumulado = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) valor.forEach(item => chavesDe(item, acumulado));
  else if (valor && typeof valor === "object") {
    for (const [chave, item] of Object.entries(valor)) { acumulado.add(chave); chavesDe(item, acumulado); }
  }
  return acumulado;
}

/* ================================ R3 · a cópia ================================ */

test("R3 · a lente congelada é a leitura da observação, sem digest, sem relacionadas e sem ponteiro", async () => {
  const { research } = await snapshotDoCache();
  const lentes = radarFrozenSerpLensesFromLensSet(research.lensSet!);
  assert.deepEqual(lentes.map(lente => lente.lens), [...RADAR_SERP_LENS_LABELS]);
  for (const [indice, lente] of lentes.entries()) {
    const origem = research.lensSet!.lenses[indice];
    assert.deepEqual(Object.keys(lente).sort(), [
      "aiOverviewDomains", "collectedAt", "collectedBy", "commercialSignals", "competitorDomains", "itemTypes",
      "lens", "missingReason", "organicCount", "questions", "source", "status",
    ]);
    assert.equal(lente.organicCount, origem.observation!.organicCount);
    assert.deepEqual(lente.competitorDomains, origem.observation!.competitorDomains);
    assert.deepEqual(lente.questions, origem.observation!.questions);
    assert.equal(lente.collectedBy, "minerador");
    assert.equal(lente.source, "cache");
  }
  const chaves = chavesDe(lentes);
  for (const proibida of ["digest", "organicDigest", "relatedSearches", "providerRequestId", "entryId", "depth"]) {
    assert.equal(chaves.has(proibida), false, `a cópia não leva ${proibida}`);
  }
});

test("R3 · o bloco congelado: identidade da canônica, hash das lentes recalculável e limitações escritas", async () => {
  const { research } = await snapshotDoCache();
  const bloco = buildRadarFrozenSerpLensBlock({ canonical: { snapshotId: research.id, snapshotHash: research.contentHash, lensSet: research.lensSet! }, auxiliary: [], singleLensAuxiliary: 0 })!;
  assert.equal(bloco.version, RADAR_FROZEN_SERP_LENSES_VERSION);
  assert.equal(bloco.canonicalSnapshotId, research.id);
  assert.equal(bloco.canonicalSnapshotHash, research.contentHash);
  assert.equal(bloco.lensSetHash, radarFrozenLensSetHash(bloco.lenses));
  assert.equal(bloco.datesSpreadDays, 0);
  assert.ok(bloco.limitations.some(frase => /Só em Celular · Android: domínios so-no-android\.com\.br/.test(frase)), bloco.limitations.join(" | "));
  assert.ok(bloco.limitations.some(frase => /Só em Celular · iOS: perguntas "Skincare facial funciona no celular\?"/.test(frase)));
  assert.ok(bloco.limitations.every(frase => !/Desktop · macOS:/.test(frase)), "a lente que concorda não vira frase");
  assert.match(bloco.limitations.join(" "), /não reforço de conclusão/);

  const provenienciaTrocada = structuredClone(research.lensSet!);
  provenienciaTrocada.lenses[1] = { ...provenienciaTrocada.lenses[1], collectedAt: "2026-09-01T09:00:00.000Z", providerRequestId: "outra-tarefa", source: "paid", collectedBy: "radar" };
  const outraProveniencia = buildRadarFrozenSerpLensBlock({ canonical: { snapshotId: research.id, snapshotHash: research.contentHash, lensSet: provenienciaTrocada }, auxiliary: [], singleLensAuxiliary: 0 })!;
  assert.equal(outraProveniencia.lensSetHash, bloco.lensSetHash, "proveniência não é conteúdo");
  assert.equal(outraProveniencia.datesSpreadDays, 19);
  assert.ok(outraProveniencia.limitations.some(frase => /19 dias de diferença \(acima de 7\)/.test(frase)));

  const seteDias = structuredClone(research.lensSet!);
  seteDias.lenses[1] = { ...seteDias.lenses[1], collectedAt: "2026-09-13T09:00:00.000Z" };
  const noLimite = buildRadarFrozenSerpLensBlock({ canonical: { snapshotId: research.id, snapshotHash: research.contentHash, lensSet: seteDias }, auxiliary: [], singleLensAuxiliary: 0 })!;
  assert.equal(noLimite.datesSpreadDays, 7);
  assert.equal(noLimite.limitations.some(frase => /dias de diferença/.test(frase)), false, "7 dias não é marcado");

  assert.equal(buildRadarFrozenSerpLensBlock({ canonical: null, auxiliary: [], singleLensAuxiliary: 2 }), null, "sem lentes, sem bloco");
  assert.equal(RadarFrozenSerpLensBlockSchema.safeParse({ ...bloco, lensSetHash: "lenses:00000000" }).success, false, "hash que não confere é recusado");
  const adulterada = structuredClone(bloco);
  adulterada.lenses[2].competitorDomains.push("inventado.com");
  assert.equal(RadarFrozenSerpLensBlockSchema.safeParse(adulterada).success, false, "lente editada depois não passa");
});

test("R3 · lente que faltou é declarada no bloco e vira limitação, sem leitura inventada", async () => {
  const { research } = await snapshotDoCache({ falha: { "mobile-ios": "task" } });
  assert.equal(research.lensSet!.lenses[3].status, "missing");
  const bloco = buildRadarFrozenSerpLensBlock({ canonical: { snapshotId: research.id, snapshotHash: research.contentHash, lensSet: research.lensSet! }, auxiliary: [], singleLensAuxiliary: 0 })!;
  const ios = bloco.lenses[3];
  assert.equal(ios.status, "missing");
  assert.equal(ios.organicCount, null);
  assert.deepEqual([ios.competitorDomains, ios.questions, ios.aiOverviewDomains, ios.itemTypes], [[], [], [], []]);
  assert.match(ios.missingReason || "", /40501|não|Lente/i);
  assert.ok(bloco.limitations.some(frase => frase.startsWith("Celular · iOS não foi observada na SERP canônica congelada")));
});

/* ============================= R3 · o FINALIZE ============================= */

test("R3 · o FINALIZE copia as quatro lentes da SERP que a análise leu, e o hash fecha", async () => {
  const { research } = await snapshotDoCache();
  const congelada = await congelar(research);
  const bundle = congelada.payload.finalizedBundle!;
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(bundle));
  const lentes = radarFrozenSerpLensesOf(bundle)!;
  assert.equal(lentes.canonicalSnapshotId, research.id);
  assert.equal(lentes.canonicalSnapshotHash, research.contentHash);
  assert.deepEqual(lentes.lenses, radarFrozenSerpLensesFromLensSet(research.lensSet!));
  assert.deepEqual(lentes.auxiliary, []);
  assert.ok(bundle.serpStanding, "o standing de R1 continua sendo carimbado junto");
  assert.equal(bundle.serpStanding!.authoritative, true);
});

test("R3 · sem lentes, o FINALIZE não cria bloco: snapshot anterior às lentes ou hash que não confere", async () => {
  const { research } = await snapshotDoCache();
  const legado = structuredClone(research) as Record<string, unknown>;
  delete legado.lensSet;
  const semLentes = await congelar(legado as Snapshot);
  assert.equal(radarFrozenSerpLensesOf(semLentes.payload.finalizedBundle), null);
  assert.equal("lenses" in semLentes.payload.finalizedBundle!.search, false, "ausente, nunca nulo");

  const outroConteudo = await congelar(research, { vinculo: { id: research.id, contentHash: "e".repeat(64) } });
  assert.equal(radarFrozenSerpLensesOf(outroConteudo.payload.finalizedBundle), null, "lentes de outro conteúdo não descrevem a amostra congelada");

  const vinculo = { serpSnapshotId: research.id, serpSnapshotHash: research.contentHash };
  assert.ok(evaluateRadarFrozenSerpLenses({ analysis: vinculo, snapshots: [registroGravado(research)], deepResearch: null, storedDeepResearch: null }), "o controle: real e com o mesmo hash, copia");
  for (const [nome, registro] of [
    ["simulado", { ...registroGravado(research), isMock: true }],
    ["de outra origem", { ...registroGravado(research), origin: "mock" }],
  ] as const) {
    assert.equal(evaluateRadarFrozenSerpLenses({ analysis: vinculo, snapshots: [registro], deepResearch: null, storedDeepResearch: null }), null, `snapshot ${nome} não vira lente congelada`);
  }
  assert.equal(evaluateRadarFrozenSerpLenses({ analysis: { serpSnapshotId: "outro", serpSnapshotHash: research.contentHash }, snapshots: [registroGravado(research)], deepResearch: null, storedDeepResearch: null }), null, "outro snapshot vinculado");
});

test("R3 · lentes declaradas pelo navegador são descartadas: o que vale é a leitura do servidor", async () => {
  const { research } = await snapshotDoCache();
  const correta = await congelar(research);
  const verdadeiras = radarFrozenSerpLensesOf(correta.payload.finalizedBundle)!;

  const inventadas = structuredClone(verdadeiras);
  inventadas.lenses[0].competitorDomains = ["inventado.com"];
  inventadas.lensSetHash = radarFrozenLensSetHash(inventadas.lenses);
  const declaradoConteudo = { ...CONTEUDO, search: { ...CONTEUDO.search, lenses: inventadas } };
  const declarado = RadarFrozenEvidenceBundleSchema.parse({ ...declaradoConteudo, bundleHash: radarFrozenBundleHash(declaradoConteudo) });
  const recongelada = await congelar(research, { bundle: declarado });
  assert.deepEqual(radarFrozenSerpLensesOf(recongelada.payload.finalizedBundle), verdadeiras);
  assert.equal(recongelada.payload.finalizedBundle!.bundleHash, correta.payload.finalizedBundle!.bundleHash);

  const semLentes = radarStampFrozenSerpLenses(correta.payload.finalizedBundle!, null);
  assert.equal("lenses" in semLentes.search, false, "null remove a chave");
  assert.throws(() => radarStampFrozenSerpLenses({ ...correta.payload.finalizedBundle!, limitations: ["editada"] }, verdadeiras), /RADAR_FROZEN_BUNDLE_MUTATED/);
});

test("R3 · INVARIANTE 30: regravar e vencer o cache não move o bundleHash, o dossiê nem as lentes entregues", async () => {
  const { banco, research } = await snapshotDoCache();
  const congelada = await congelar(research);
  const bundle = congelada.payload.finalizedBundle!;
  const hashAntes = bundle.bundleHash;
  const entregueAntes = dossie(congelada.payload);
  const metaAntes = banco.metaDa("mobile-android");

  /* O cache é regravado de verdade: outra coleta, outra tarefa, outro domínio na Android. */
  const outraSerp = provedor({ variante: (lente, corpo) => {
    corpo.tasks[0].id = `regravada-${lente}`;
    if (lente !== "mobile-android") return;
    const organicos = corpo.tasks[0].result![0].items.filter(item => item.type === "organic");
    organicos[1].domain = "www.novo-no-cache.com.br";
    organicos[1].url = "https://www.novo-no-cache.com.br/x";
  } });
  const recoleta = await collectRadarSerpLensSnapshot(entrada(banco, { recollect: true, now: T2, previous: research }), dependencias(outraSerp.fetchImpl).deps);
  assert.equal(outraSerp.chamadas.length, 4, "o cache foi de fato regravado nas quatro lentes");
  assert.notEqual(banco.metaDa("mobile-android").providerRequestId, metaAntes.providerRequestId);
  assert.notEqual(recoleta.research.contentHash, research.contentHash, "a SERP do cache agora é outra");
  assert.ok(recoleta.research.lensSet!.lenses[2].observation!.competitorDomains.includes("novo-no-cache.com.br"), "e a Android do cache mudou");

  const relida = RadarFrozenEvidenceBundleSchema.parse(JSON.parse(JSON.stringify(bundle)));
  assert.equal(relida.bundleHash, hashAntes);
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(relida));
  const entregueDepois = dossie(congelada.payload);
  assert.equal(entregueDepois.bundleHash, entregueAntes.bundleHash, "o dossiê entregue ao Redator não muda");
  assert.deepEqual(entregueDepois.serpLenses, entregueAntes.serpLenses);
  assert.equal(entregueDepois.serpLenses!.lenses[2].competitorDomains.includes("novo-no-cache.com.br"), false, "a cópia não segue o cache");

  /* E o cache vencido (meses depois) também não: nada no caminho do dossiê lê cache. */
  banco.tabelas.editorial_workflow_items = [];
  assert.equal(dossie(congelada.payload, "2027-03-01T00:00:00.000Z").serpLenses!.lensSetHash, entregueAntes.serpLenses!.lensSetHash);
});

/* ============================= R3 · o dossiê ============================= */

test("R3 · o dossiê entrega as lentes congeladas, sem digest bruto, e as lacunas nas limitações", async () => {
  const { research } = await snapshotDoCache({ falha: { "mobile-ios": "task" } });
  const congelada = await congelar(research);
  const entregue = dossie(congelada.payload);
  assert.deepEqual(entregue.serpLenses, radarFrozenSerpLensesOf(congelada.payload.finalizedBundle));
  const chaves = chavesDe(entregue.serpLenses);
  for (const proibida of ["digest", "organicDigest", "relatedSearches", "providerRequestId", "items"]) {
    assert.equal(chaves.has(proibida), false, `serpLenses não leva ${proibida}`);
  }
  assert.ok(entregue.limitations.some(frase => frase.startsWith("Celular · iOS não foi observada")), "a lente que faltou chega como limitação");
  assert.ok(entregue.limitations.includes("uma limitação congelada"), "as limitações congeladas continuam");
});

test("R3 · perfil YOUTUBE: as lentes da fotografia do Google não entram num dossiê de vídeo", async () => {
  const { research } = await snapshotDoCache();
  const congelada = await congelar(research);
  assert.ok(radarFrozenSerpLensesOf(congelada.payload.finalizedBundle), "a fotografia do Google tem lentes");
  const payload = {
    ...congelada.payload,
    youtubeFrozenInvestigation: { finalizedAt: "2026-09-23T13:00:00.000Z", runRef: { runId: "yt-1", runFingerprint: "fp", collectedAt: "2026-09-23T12:30:00.000Z", universeSize: 4, queriesExecuted: 1 }, limitations: [] },
  };
  const entregue = dossie(payload, "2026-09-23T13:00:00.000Z");
  assert.equal(entregue.primaryResearchProfile, "YOUTUBE");
  assert.equal("serpLenses" in entregue, false);
  assert.equal(entregue.limitations.some(frase => /Só em Celular/.test(frase)), false);
});

test("R3 · dossiê de investigação sem lentes continua sem a chave e com o hash de antes", async () => {
  const { research } = await snapshotDoCache();
  const legado = structuredClone(research) as Record<string, unknown>;
  delete legado.lensSet;
  const semLentes = await congelar(legado as Snapshot);
  const entregue = dossie(semLentes.payload);
  assert.equal("serpLenses" in entregue, false);

  const HASH_DOURADO_DO_DOSSIE = "bundle-hash:e32e330f";
  const R1_MARCA = "5f0c3a52-8d4e-4b7a-9c61-2e8f4a1b7c90";
  const conteudoR1 = {
    ...CONTEUDO, bundleId: "bundle:legado-1", frozenAt: "2026-09-20T12:00:00.000Z",
    binding: { brandId: R1_MARCA, articleId: "artigo-pele-oleosa", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:dna" },
    search: { ...CONTEUDO.search, auxiliaryQueries: 0 },
  };
  const legadoR1 = RadarFrozenEvidenceBundleSchema.parse({ ...conteudoR1, bundleHash: radarFrozenBundleHash(conteudoR1) });
  const payloadR1 = payloadDaAnalise({ finalizedBundle: legadoR1, snapshot: { id: "serp-9", contentHash: "c".repeat(64) }, brandId: R1_MARCA, articleId: "artigo-pele-oleosa", dna: "dna-v3" });
  const r1 = buildRadarEvidenceBundleFromAnalysis({ payload: payloadR1, article: { brandId: R1_MARCA, articleId: "artigo-pele-oleosa", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:dna" }, competitiveBlueprint: null, observedAt: legadoR1.frozenAt });
  assert.ok(r1.ok);
  assert.equal(r1.bundle.bundleHash, HASH_DOURADO_DO_DOSSIE, "o valor dourado medido antes de R1 continua");
});

test("R3 · o dossiê não lê cache nem snapshot: a leitura é só da cópia congelada", () => {
  const runtime = semComentarios(ler("../lib/radar/evidence-bundle-runtime.ts"));
  assert.match(runtime, /radarFrozenSerpLensesOf\(analise\.finalizedBundle\)/);
  const congelamento = semComentarios(ler("../lib/radar/frozen-serp-standing.ts"));
  const carimbo = semComentarios(ler("../lib/server/radar-frozen-serp-standing.ts"));
  for (const [nome, fonte] of [["runtime", runtime], ["regra", congelamento], ["carimbo", carimbo]] as const) {
    for (const proibido of ["serp-cache", "lookupSerpCache", "collectAndCacheSerp", "collectRadarSerpLensSnapshot"]) {
      assert.equal(fonte.includes(proibido), false, `${nome} não pode usar ${proibido}`);
    }
  }
  assert.match(carimbo, /radarStampFrozenSerpLenses\(radarStampFrozenSerpStanding\(bundle, standing\), lentes\)/);
});

/* ============================== R4 · a auxiliar ============================== */

test("R4 · auxiliar: cache primeiro nas quatro lentes, uso com o nome da auxiliar e a keyword", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const vazio = dependencias(provedor().fetchImpl);
  const doCache = await collectRadarSerpLensSnapshot(entrada(banco, { purpose: "auxiliary", usageMetadata: { keywordId: KW } }), vazio.deps);
  assert.equal(doCache.paidCalls, 0);
  assert.deepEqual(vazio.cotas, [], "tudo no cache: nenhuma credencial");

  const semCache = new Banco();
  const provider = provedor();
  const { deps, cotas, usos } = dependencias(provider.fetchImpl);
  const paga = await collectRadarSerpLensSnapshot(entrada(semCache, { purpose: "auxiliary", usageMetadata: { keywordId: KW } }), deps);
  assert.deepEqual(cotas, [4]);
  assert.equal(paga.paidCalls, 4);
  assert.equal(usos.length, 4);
  for (const uso of usos) {
    assert.match(uso.idempotencyKey, new RegExp(`^dataforseo:radar:serp-auxiliar:op-radar:${ARTIGO}:(desktop-windows|desktop-macos|mobile-android|mobile-ios)$`));
    assert.equal(uso.metadata?.operationKind, "serp_auxiliary");
    assert.equal(uso.metadata?.keywordId, KW);
  }
  assert.ok(RADAR_SERP_LENS_LABELS.every(lente => semCache.entradaDa(lente)), "o que a auxiliar pagou fica no cache para os outros módulos");
  assert.equal((semCache.entradaDa("desktop-windows")!.payload as { meta: { collectedBy: string } }).meta.collectedBy, "radar");
});

test("R4 · auxiliar: os orgânicos são só da Desktop · Windows, e as outras lentes vão copiadas na evidência", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const { research } = await collectRadarSerpLensSnapshot(entrada(banco, { purpose: "auxiliary" }), dependencias(provedor().fetchImpl).deps);
  const soNoAndroid = "so-no-android.com.br";
  assert.equal(research.organicResults.some(item => item.domain.includes(soNoAndroid)), false, "posições de outro aparelho não entram no merge por posição");
  assert.ok(research.lensSet!.lenses[2].observation!.competitorDomains.includes(soNoAndroid), "a Android continua registrada, na lente dela");

  const evidencia = radarQueryEvidenceFrom({ serpClass: "auxiliary", research });
  assert.equal(evidencia.results.some(item => item.domain.includes(soNoAndroid)), false);
  assert.deepEqual(evidencia.lenses, radarFrozenSerpLensesFromLensSet(research.lensSet!));
  assert.equal(chavesDe(evidencia.lenses).has("digest"), false);

  const canonica = radarQueryEvidenceFrom({ serpClass: "canonical", research });
  assert.equal("lenses" in canonica, false, "a canônica vive no snapshot, não na evidência");

  const antiga = { id: "serp-auxiliar-1", collectedAt: "2026-09-09T10:00:00.000Z", contentHash: "a".repeat(64), organicResults: [{ position: 1, url: "https://x.test/a", title: "A", domain: "x.test" }] };
  const semLentes = radarQueryEvidenceFrom({ serpClass: "auxiliary", research: antiga });
  assert.equal("lenses" in semLentes, false, "evidência sem lentes continua sem a chave");
  assert.equal("lenses" in RadarQueryEvidenceSchema.parse(JSON.parse(JSON.stringify(semLentes))), false);
});

test("R4 · o FINALIZE copia o que as auxiliares observaram e declara as de lente única", async () => {
  const { research } = await snapshotDoCache();
  const auxiliar = (await snapshotDoCache({ falha: { "desktop-macos": "task" } })).research;
  const evidencia = radarQueryEvidenceFrom({ serpClass: "auxiliary", research: auxiliar });
  const antiga = radarQueryEvidenceFrom({ serpClass: "auxiliary", research: { id: "serp-aux-antiga", collectedAt: "2026-09-09T10:00:00.000Z", contentHash: "f".repeat(64), organicResults: [] } });
  const consulta = (queryId: string, keyword: string, evidence: unknown, execution = "EXECUTED") => ({
    queryId, keywordId: `kw-${queryId}`, keyword, role: "secundaria", disposition: "EXECUTE", execution, serpClass: "auxiliary", evidence, reason: "fixture",
  });
  const deepResearch = registroDeInvestigacao([
    { queryId: "q0", keywordId: KW, keyword: "skincare facial", role: "principal", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "canonical", evidence: radarQueryEvidenceFrom({ serpClass: "canonical", research }), reason: "fixture" },
    consulta("q1", "skincare facial barato", evidencia),
    consulta("q2", "skincare antigo", antiga),
    consulta("q3", "nao executada", null, "NOT_EXECUTED"),
  ]);
  const congelada = await congelar(research, { deepResearch });
  const bloco = radarFrozenSerpLensesOf(congelada.payload.finalizedBundle)!;
  assert.deepEqual(bloco.auxiliary, [{
    queryId: "q1", keywordId: "kw-q1", keyword: "skincare facial barato", snapshotHash: auxiliar.contentHash,
    lensesObserved: 3, missingLenses: ["desktop-macos"], source: "stored_analysis_evidence",
  }]);
  assert.ok(bloco.limitations.some(frase => /pesquisa auxiliar "skincare facial barato", Desktop · macOS não foi\(ram\) observada/.test(frase)));
  assert.ok(bloco.limitations.includes("1 pesquisa(s) auxiliar(es) desta investigação são anteriores às quatro lentes: um aparelho só."));

  const direto = evaluateRadarFrozenSerpLenses({ analysis: { serpSnapshotId: null, serpSnapshotHash: null }, snapshots: [], deepResearch, storedDeepResearch: deepResearch });
  assert.equal(direto!.canonicalSnapshotId, null, "só auxiliares: a canônica é declarada anterior às lentes");
  assert.deepEqual(direto!.lenses, []);
  assert.ok(direto!.limitations.includes("A SERP canônica congelada é anterior às quatro lentes: ela observou um aparelho só."));
});

function inverterChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(inverterChaves);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor).reverse().map(([chave, item]) => [chave, inverterChaves(item)]));
}

test("R4 · as lentes da auxiliar no FINALIZE são conferidas com a evidência GRAVADA; a declarada que diverge não entra", async () => {
  const { research } = await snapshotDoCache();
  const auxiliar = (await snapshotDoCache({ falha: { "desktop-macos": "task" } })).research;
  const evidencia = radarQueryEvidenceFrom({ serpClass: "auxiliary", research: auxiliar });
  const consulta = (evidence: unknown, queryId = "q1") => ({
    queryId, keywordId: "kw-q1", keyword: "skincare facial barato", role: "secundaria", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "auxiliary", evidence, reason: "fixture",
  });
  const gravado = registroDeInvestigacao([consulta(evidencia)]);

  const adulterada = structuredClone(evidencia);
  adulterada.lenses![2].competitorDomains = ["inventado-no-navegador.com"];
  const lentesDeclaradas = await congelar(research, { deepResearch: registroDeInvestigacao([consulta(adulterada)]), deepResearchGravado: gravado });
  const blocoAdulterado = radarFrozenSerpLensesOf(lentesDeclaradas.payload.finalizedBundle)!;
  assert.deepEqual(blocoAdulterado.auxiliary, [], "lentes que o navegador trocou não viram cópia congelada");
  assert.ok(blocoAdulterado.limitations.includes("1 pesquisa(s) auxiliar(es) com lentes não conferem com a evidência gravada da análise e não tiveram as lentes copiadas."));

  const outroHash = { ...structuredClone(evidencia), contentHash: "d".repeat(64) };
  const hashDeclarado = await congelar(research, { deepResearch: registroDeInvestigacao([consulta(outroHash)]), deepResearchGravado: gravado });
  assert.deepEqual(radarFrozenSerpLensesOf(hashDeclarado.payload.finalizedBundle)!.auxiliary, [], "outro contentHash também não confere");

  const semGravada = await congelar(research, { deepResearch: registroDeInvestigacao([consulta(evidencia, "q-nova")]), deepResearchGravado: gravado });
  assert.deepEqual(radarFrozenSerpLensesOf(semGravada.payload.finalizedBundle)!.auxiliary, [], "consulta que a versão gravada não tem não entra");
  const semVersaoGravada = evaluateRadarFrozenSerpLenses({ analysis: { serpSnapshotId: research.id, serpSnapshotHash: research.contentHash }, snapshots: [registroGravado(research)], deepResearch: registroDeInvestigacao([consulta(evidencia)]), storedDeepResearch: null });
  assert.deepEqual(semVersaoGravada!.auxiliary, [], "sem versão gravada, nada da auxiliar é conferido");

  const reordenado = registroDeInvestigacao([consulta(inverterChaves(JSON.parse(JSON.stringify(evidencia))))]);
  const conferida = await congelar(research, { deepResearch: registroDeInvestigacao([consulta(evidencia)]), deepResearchGravado: reordenado });
  const blocoConferido = radarFrozenSerpLensesOf(conferida.payload.finalizedBundle)!;
  assert.deepEqual(blocoConferido.auxiliary, [{
    queryId: "q1", keywordId: "kw-q1", keyword: "skincare facial barato", snapshotHash: auxiliar.contentHash,
    lensesObserved: 3, missingLenses: ["desktop-macos"], source: "stored_analysis_evidence",
  }], "a ordem de chaves do jsonb não é divergência");
  assert.equal(blocoConferido.limitations.some(frase => /não conferem com a evidência gravada/.test(frase)), false);

  const bloco = RadarFrozenSerpLensBlockSchema.parse(JSON.parse(JSON.stringify(blocoConferido)));
  const semOrigem = structuredClone(bloco) as { auxiliary: Array<Record<string, unknown>> };
  delete semOrigem.auxiliary[0].source;
  assert.equal(RadarFrozenSerpLensBlockSchema.safeParse(semOrigem).success, true, "bloco montado antes do campo continua legível");
  assert.equal(RadarFrozenSerpLensBlockSchema.safeParse({ ...bloco, auxiliary: [{ ...bloco.auxiliary[0], source: "navegador" }] }).success, false);
});

test("R4 · o carimbo confere as auxiliares com a versão corrente gravada, não com o pedido", () => {
  const carimbo = semComentarios(ler("../lib/server/radar-frozen-serp-standing.ts"));
  assert.match(carimbo, /storedDeepResearch: input\.current && typeof input\.current === "object"/);
  assert.match(carimbo, /\(input\.current as \{ deepResearch\?: unknown \}\)\.deepResearch/);
});

test("R4 · a rota: auxiliar pelo núcleo, sem snapshot, sem versão, sem device; o cliente não manda aparelho", () => {
  const rota = semComentarios(ler("../app/api/editorial/serp/route.ts"));
  const inicio = rota.indexOf("if (input.action === \"collect_auxiliary\")");
  const bloco = rota.slice(inicio, rota.indexOf("const repository = new SerpSnapshotRepository(); const history", inicio));
  assert.ok(inicio > 0);
  assert.ok(bloco.indexOf("readRadarKeywordTargetCodes(clienteDaAuxiliar, input.brandId, reference.keywordId") > 0, "os códigos do alvo da própria auxiliar");
  const nucleo = bloco.indexOf("await collectRadarSerpLensSnapshot(");
  assert.ok(nucleo > bloco.indexOf("readRadarKeywordTargetCodes("));
  for (const trecho of ["codes: alvoDaAuxiliar.codes", "codesSource: alvoDaAuxiliar.source", "cacheKeywordId: alvoDaAuxiliar.cacheKeywordId", "previous: null", "recollect: false", "purpose: \"auxiliary\"", "usageMetadata: { keywordId: reference.keywordId }", "version: 1, previousSnapshotId: null", "not_persisted_as_article_snapshot"]) {
    assert.ok(bloco.includes(trecho), `a auxiliar precisa de ${trecho}`);
  }
  assert.equal(/input\.device|repository\.save|SerpCollectionRecordSchema|collectDataForSeoSerpSnapshot|updateWorkspace/.test(bloco), false);

  const pedido = CollectAuxiliaryRequestSchema.safeParse({ action: "collect_auxiliary", brandId: MARCA, articleId: ARTIGO, keywordId: KW, location: "Brasil", language: "pt-BR", resolutionEnvelope: {} });
  assert.equal(!pedido.success && pedido.error.issues.some(issue => issue.path[0] === "device"), false, "sem device não é motivo de recusa");
  const payload = buildRadarSerpAuxiliaryPayload({ brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA, keywordId: KW, location: "Brasil", language: "pt-BR", resolutionEnvelope: {} as never });
  assert.equal("device" in payload, false);

  const cliente = ler("../components/editorial-pipeline-context.tsx");
  const auxiliarNoCliente = semComentarios(cliente.slice(cliente.indexOf("collectAuxiliarySerp: async"), cliente.indexOf("saveRadarAnalysis: async")));
  assert.equal(/device:/.test(auxiliarNoCliente), false);
  assert.equal(/serpRecords|updateWorkspace|saveLocalSerpRecovery/.test(auxiliarNoCliente), false, "a auxiliar continua fora da cadeia de snapshots");
});

/* ============================== R4 · o apoio da Amazon ============================== */

function artigoDeApoio() {
  return {
    versionId: DNA,
    payload: {
      articleId: ARTIGO, brandId: MARCA, principalKeywordId: KW, hierarchy: "pilar", requiredTopics: [], entities: [], mainIntent: null,
      keywordReferences: [{ role: "principal", keywordId: KW, keywordDnaVersionId: "kwdna-v1" }],
    },
  };
}

const TRAVA_ABERTA = { state: "OPEN", allowed: true, code: null, message: null } as const;
const TRAVA_FINALIZADA = { state: "FINALIZED_LOCKED", allowed: false, code: "RADAR_GOOGLE_RESEARCH_FINALIZED", message: "finalizada" } as const;

function apoio(banco: Banco, fetchImpl: typeof fetch, gravados: Array<Record<string, unknown>> = [], travas: ReadonlyArray<typeof TRAVA_ABERTA | typeof TRAVA_FINALIZADA> = [TRAVA_ABERTA]) {
  const salvos: Array<Record<string, unknown>> = [];
  const { deps: lentes, cotas, usos } = dependencias(fetchImpl);
  const perguntasATrava: number[] = [];
  const deps: SupportDeps = {
    googleSerpLock: async () => {
      perguntasATrava.push(banco.chamadas.length);
      return (travas[perguntasATrava.length - 1] || travas.at(-1)!) as never;
    },
    loadArticles: async () => ({ articles: [artigoDeApoio()] }) as never,
    snapshots: {
      list: async () => ({ records: gravados as never }),
      save: async (_marca, registro) => { salvos.push(registro as unknown as Record<string, unknown>); return true; },
    },
    cacheClient: banco as unknown as SupportDeps["cacheClient"],
    environmentCodes: CODIGOS,
    lenses: lentes,
    now: () => T1,
  };
  const coletar = () => collectRadarGoogleSupport({ brandId: MARCA, articleId: ARTIGO, actorUserId: "ator-1", role: "SEO_COMMERCIAL_SUPPORT", location: "Brasil", primaryKeyword: "skincare facial" }, deps);
  return { coletar, salvos, cotas, usos, perguntasATrava };
}

test("R4 · apoio da Amazon: SERP real existente é reaproveitada, sem cache, credencial nem gravação", async () => {
  const banco = new Banco();
  const provider = provedor();
  const { research } = await snapshotDoCache();
  const { coletar, salvos, cotas } = apoio(banco, provider.fetchImpl, [registroGravado(research)]);
  const desfecho = await coletar();
  assert.equal(desfecho.status, "COLLECTED");
  assert.equal((desfecho as { snapshotId: string }).snapshotId, research.id);
  assert.equal(provider.chamadas.length, 0);
  assert.deepEqual(cotas, []);
  assert.deepEqual(salvos, []);
  assert.equal(banco.chamadas.length, 0, "nem o cache é lido");
});

test("R4 · apoio da Amazon sem SERP: o núcleo das lentes, cache primeiro, idioma do alvo e nada de 'pt-br'", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  const provider = provedor();
  const { coletar, salvos, cotas, usos } = apoio(banco, provider.fetchImpl);
  const desfecho = await coletar();
  assert.equal(desfecho.status, "COLLECTED", JSON.stringify(desfecho));
  assert.equal(provider.chamadas.length, 0, "o Minerador já pagou as quatro: zero chamada");
  assert.deepEqual(cotas, []);
  assert.deepEqual(usos, []);
  assert.equal(salvos.length, 1);
  const gravado = salvos[0] as { input: { language: string; device: string }; research: Snapshot };
  assert.equal(gravado.input.language, "pt", "o código consultado, não o literal pt-br");
  assert.equal(gravado.research.device, "desktop");
  assert.equal(gravado.research.operatingSystem, "windows");
  assert.equal(gravado.research.payloadDepth, "advanced");
  assert.equal(RadarSerpLensSetSchema.parse(gravado.research.lensSet).lenses.filter(lente => lente.status === "observed").length, 4);
  assert.equal(gravado.research.version, 1);
  assert.equal(gravado.research.previousSnapshotId, null);
});

test("R4 · apoio da Amazon sem cache: paga as quatro lentes, uso de apoio com o papel, gravado como radar", async () => {
  const banco = new Banco();
  const provider = provedor();
  const { coletar, salvos, cotas, usos } = apoio(banco, provider.fetchImpl);
  const desfecho = await coletar();
  assert.equal(desfecho.status, "COLLECTED", JSON.stringify(desfecho));
  assert.deepEqual(cotas, [4]);
  assert.deepEqual(provider.chamadas.map(pedido => `${pedido.device}-${pedido.os}`).sort(), [...RADAR_SERP_LENS_LABELS].sort());
  assert.equal(provider.chamadas.every(pedido => pedido.language_code === "pt"), true, "o idioma do alvo, na chave do Minerador");
  assert.equal(usos.length, 4);
  for (const uso of usos) {
    assert.match(uso.idempotencyKey, new RegExp(`^dataforseo:radar:support:[^:]+:${ARTIGO}:`));
    assert.equal(uso.metadata?.operationKind, "serp_support");
    assert.equal(uso.metadata?.role, "SEO_COMMERCIAL_SUPPORT");
  }
  assert.equal(salvos.length, 1);
  assert.equal((banco.entradaDa("mobile-ios")!.payload as { meta: { collectedBy: string } }).meta.collectedBy, "radar");
});

const ALVO_EN = { languageCode: "languageConstants/1000", sourceGeoTargetConstants: ["geoTargetConstants/2076"] };
const CODIGOS_EN = { locationCode: 2076, languageCode: "en" };
const comAlvoEmIngles = (banco: Banco) => {
  banco.tabelas.minerador_keywords.push({ id: KW, lock_version: 1, brand_id: MARCA, deleted_at: null, analise_semantica: { allintitle_measurement: { targeting: ALVO_EN } } });
  return banco;
};

test("R4 · apoio da Amazon: os códigos são os do alvo da principal, não os do ambiente — com e sem cache", async () => {
  const comCache = comAlvoEmIngles(new Banco());
  await semearMinerador(comCache, T0, provedor().fetchImpl, CODIGOS_EN);
  const semPagar = provedor();
  const doCache = apoio(comCache, semPagar.fetchImpl);
  assert.equal((await doCache.coletar()).status, "COLLECTED");
  assert.equal(semPagar.chamadas.length, 0, "o Minerador pagou em 'en': a chave casa e nada é pago");
  assert.deepEqual(doCache.cotas, []);
  const gravado = doCache.salvos[0] as { input: { language: string }; research: { cacheProvenance?: { languageCode?: string; codesSource?: string } } };
  assert.equal(gravado.input.language, "en");
  assert.equal(gravado.research.cacheProvenance?.codesSource, "keyword_targeting");

  const semCache = comAlvoEmIngles(new Banco());
  const pago = provedor();
  const pagando = apoio(semCache, pago.fetchImpl);
  assert.equal((await pagando.coletar()).status, "COLLECTED");
  assert.equal(pago.chamadas.length, 4);
  assert.equal(pago.chamadas.every(pedido => pedido.language_code === "en"), true, "o idioma do alvo, não o 'pt' do ambiente");
  const leitura = semCache.chamadas.find(consulta => consulta.tabela === "minerador_keywords")!;
  assert.deepEqual(leitura.filtros.find(filtro => filtro.coluna === "id")?.valor, KW, "o alvo lido é o da keyword principal");
});

test("R4 · apoio da Amazon com a investigação Google finalizada: nada de cache, chamada ou snapshot novo", async () => {
  const banco = new Banco();
  await semearMinerador(banco);
  banco.chamadas = [];
  const provider = provedor();
  const { coletar, salvos, cotas, usos, perguntasATrava } = apoio(banco, provider.fetchImpl, [], [TRAVA_FINALIZADA]);
  const desfecho = await coletar();
  assert.equal(desfecho.status, "SKIPPED");
  assert.match((desfecho as { reason: string }).reason, /finalizada/);
  assert.deepEqual(perguntasATrava, [0], "a trava é perguntada antes de qualquer leitura");
  assert.equal(banco.chamadas.length, 0, "nem o alvo nem o cache são lidos");
  assert.equal(provider.chamadas.length, 0);
  assert.deepEqual(cotas, []);
  assert.deepEqual(usos, []);
  assert.deepEqual(salvos, [], "nenhum snapshot novo sob a fotografia congelada, nem por acerto de cache");
});

test("R4 · apoio da Amazon: FINALIZE gravado durante a coleta impede a gravação do snapshot", async () => {
  const banco = new Banco();
  const provider = provedor();
  const { coletar, salvos, usos, perguntasATrava } = apoio(banco, provider.fetchImpl, [], [TRAVA_ABERTA, TRAVA_FINALIZADA]);
  const desfecho = await coletar();
  assert.equal(desfecho.status, "SKIPPED");
  assert.match((desfecho as { reason: string }).reason, /enquanto o apoio era coletado/);
  assert.equal(perguntasATrava.length, 2);
  assert.ok(perguntasATrava[1] > perguntasATrava[0], "a segunda pergunta vem depois da coleta");
  assert.equal(provider.chamadas.length, 4, "a coleta aconteceu");
  assert.equal(usos.length, 4, "e ficou registrada no uso");
  assert.deepEqual(salvos, [], "mas não virou snapshot");
});

test("R4 · o apoio pergunta à trava leve antes do alvo e do núcleo, e de novo antes de gravar", () => {
  const fonte = semComentarios(ler("../lib/server/radar-support-research.ts"));
  assert.match(fonte, /radarGoogleSerpWriteLockAtSave\(input\.brandId, input\.articleId\)/);
  const perguntas = [...fonte.matchAll(/await trava\(\)/g)].map(item => item.index!);
  assert.equal(perguntas.length, 2);
  assert.ok(perguntas[0] > fonte.indexOf("if (anterior?.research)"), "a SERP real existente continua reaproveitada sem pergunta");
  assert.ok(perguntas[0] < fonte.indexOf("readRadarKeywordTargetCodes(cliente"));
  assert.ok(perguntas[0] < fonte.indexOf("await collectRadarSerpLensSnapshot("));
  assert.ok(perguntas[1] > fonte.indexOf("await collectRadarSerpLensSnapshot("));
  assert.ok(perguntas[1] < fonte.indexOf("await repositorio.save("));
  assert.match(fonte, /codes: alvo\.codes/);
  assert.match(fonte, /readRadarKeywordTargetCodes\(cliente, input\.brandId, article\.payload\.principalKeywordId,/);
});

test("R4 · o apoio continua sem curadoria, sem FINALIZE e com o resumo canônico", () => {
  const fonte = semComentarios(ler("../lib/server/radar-support-research.ts"));
  assert.equal(/curationVersionFor|startSerpAnalysis|selectedCompetitorIds|deepResearch|finalizedBundle|persistSerpAnalysis/.test(fonte), false);
  assert.equal(/collectDataForSeoSerpSnapshot|"pt-br"|device: "desktop"/.test(fonte), false, "nem a porta antiga, nem o idioma literal, nem o desktop fixo");
  assert.match(fonte, /purpose: "support"/);
  assert.match(fonte, /previous: null/);
  assert.match(fonte, /snapshot: radarSerpSnapshotSummary\(research\)/);
});

/* ============================== R5 · lente única ============================== */

test("R5 · o eco do aparelho é lido da tarefa, e só dela", () => {
  const amazon = JSON.parse(ler("./fixtures/dataforseo-amazon-discovery.json"));
  const youtubeMobile = JSON.parse(ler("./fixtures/dataforseo-youtube-skincare-pele-oleosa.json"));
  assert.deepEqual(radarProviderDeviceEchoOf(amazon), { device: "desktop", os: "windows" });
  assert.deepEqual(radarProviderDeviceEchoOf(youtubeMobile), { device: "mobile", os: "android" });
  assert.equal(radarProviderDeviceEchoOf({ tasks: [{ data: {} }] }), null);
  assert.equal(radarProviderDeviceEchoOf(null), null);
  assert.equal(radarProviderDeviceEchoOf("texto"), null);
});

test("R5 · Amazon: o gravador entrega a MESMA resposta ao adapter e guarda o eco, sem mudar o pedido", async () => {
  const corpo = ler("./fixtures/dataforseo-amazon-discovery.json");
  const pedidos: unknown[] = [];
  const base = (async (_url: string | URL | Request, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body)));
    return new Response(corpo, { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const gravador = radarProviderDeviceEchoRecorder(base);
  const entradaAmazon = { keyword: "skincare facial", locationCode: 2076, languageCode: "pt", depth: 20, operationRequestId: "op-amz", queryId: "q1" };
  const normalizada = await executeDataForSeoAmazonQuery(entradaAmazon, { config: CONFIG, fetchImpl: gravador.fetchImpl });
  assert.ok(normalizada.results.length > 0, "o adapter leu a resposta inteira");
  assert.deepEqual(gravador.echo(), { device: "desktop", os: "windows" });
  assert.deepEqual(pedidos, [buildDataForSeoAmazonRequest(entradaAmazon).body], "o pedido é o de sempre, sem device nem os");

  const falha = radarProviderDeviceEchoRecorder((async () => new Response("não é json", { status: 200 })) as typeof fetch);
  const resposta = await falha.fetchImpl("https://provider.invalid/x");
  assert.equal(await resposta.text(), "não é json", "a resposta segue intacta para o adapter");
  assert.equal(falha.echo(), null);
  const recusa = radarProviderDeviceEchoRecorder((async () => new Response(corpo, { status: 500 })) as typeof fetch);
  await recusa.fetchImpl("https://provider.invalid/x");
  assert.equal(recusa.echo(), null, "resposta recusada não vira eco");
});

test("R5 · proveniência: o eco entra na corrida da Amazon; a corrida antiga não ganha chave", () => {
  const antiga = { provider: "dataforseo", endpoint: "/v3/merchant/amazon/products/live/advanced", queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, collectedAt: "2026-09-10T10:00:00.000Z" };
  const relida = RadarAmazonProvenanceSchema.parse(antiga);
  assert.equal("device" in relida, false);
  assert.equal("os" in relida, false);
  const nova = RadarAmazonProvenanceSchema.parse({ ...antiga, device: "desktop", os: "windows" });
  assert.equal(nova.device, "desktop");
  assert.equal(nova.os, "windows");

  const rota = semComentarios(ler("../app/api/editorial/radar-amazon-search/route.ts"));
  assert.match(rota, /const ecoDoAparelho = radarProviderDeviceEchoRecorder\(\);/);
  assert.match(rota, /\}, \{ config, fetchImpl: ecoDoAparelho\.fetchImpl \}\);/);
  assert.match(rota, /device: ecoDoAparelho\.echo\(\)\?\.device \?\? null,/);
  assert.match(rota, /os: ecoDoAparelho\.echo\(\)\?\.os \?\? null,/);
  assert.equal((rota.match(/executeDataForSeoAmazonQuery\(/g) || []).length, 1, "uma porta ao provider da Amazon");
  assert.equal(/\bfetch\(/.test(rota), false);
});

test("R5 · YouTube: o eco já vai para a proveniência da corrida, e o pedido continua sem aparelho", () => {
  const corpo = JSON.parse(ler("./fixtures/dataforseo-youtube-skincare-pele-oleosa.json"));
  const normalizada = normalizeDataForSeoYoutubeResponse(corpo, "q1");
  assert.equal(normalizada.search.device, "mobile");
  assert.equal(normalizada.search.os, "android");
  const rota = semComentarios(ler("../app/api/editorial/radar-youtube-search/route.ts"));
  assert.match(rota, /device: eco\?\.device \|\| null,/);
  assert.match(rota, /os: eco\?\.os \|\| null,/);
});
