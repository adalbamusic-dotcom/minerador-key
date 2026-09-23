import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/**
 * REIDRATAR SÓ O QUE A RESPOSTA USA — e a resposta não muda um byte.
 *
 * Medido em 2026-09-23 (cota Free da Supabase estourada: 5,76 GB de 5 GB):
 *
 *   montagem do Radar       ~10,8 MB lidos, ~7,4 MB zerados pela própria poda
 *   área Vídeos (por foco)   ~8,2 MB lidos para usar ~3,8 kB de pautas
 *   amostra da pesquisa      ~8,2 MB lidos contra ~2,5 MB necessários
 *   autosave do Redator      ~4,48 MB devolvidos por pausa de 1,2 s
 *
 * Tudo aqui roda contra um PostgREST SIMULADO: o cliente Supabase é o real
 * (supabase-js), e só o `fetch` global é trocado. Nenhuma rede, nenhum banco,
 * nenhum provider. O simulado registra cada pedido — é assim que se prova que
 * `radar_analysis_runs` não foi consultada, e com que filtro foi.
 *
 * A equivalência é contra um ORÁCULO: a rota como era antes desta mudança
 * (reidratar tudo com `findByArticle` e podar). `findByArticle` continua
 * existindo e reidratando tudo — é ele que sustenta o oráculo.
 */

/* ======================= ambiente sem rede ======================= */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

/*
 * O carregador compartilhado resolve `@/`, `server-only` e TypeScript. Na
 * suíte do Radar ele já vem pela linha de comando; rodando este arquivo
 * sozinho, é registrado aqui.
 */
const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

/*
 * Autorização inerte, só para as rotas deste arquivo. A autorização real
 * consulta sessão e banco; aqui o que se testa é a leitura depois dela.
 */
const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return { userId: 'ator-de-teste' }; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
};
/*
 * `next/server` é CommonJS sem mapa de exports: o ESM do Node exige a
 * extensão. O bundler do Next resolve sozinho; aqui, a rota é importada pelo
 * Node puro.
 */
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
  content_documents: [],
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
      /* content_documents_touch_trg: todo UPDATE incrementa o lock. */
      linha.lock_version = Number(linha.lock_version) + 1;
      linha.updated_at = "2026-09-23T12:00:00.123456+00:00";
    }
    const devolve = String(cabecalhos.get("Prefer") || "").includes("return=representation");
    return devolve ? json(linhas.map(linha => projeta(linha, select))) : new Response(null, { status: 204 });
  }
  throw new Error(`método não simulado: ${metodo} ${tabela}`);
}) as typeof fetch;

const pedidosA = (tabela: string) => pedidos.filter(pedido => pedido.tabela === tabela);
const idsPedidos = (pedido: Pedido) => {
  const filtro = pedido.params.get("version_id");
  return filtro ? filtro.slice(4, -1).split(",").map(item => item.replace(/^"|"$/g, "")).sort() : null;
};

/* ======================= módulos do projeto ======================= */

const { WorkflowRepository, ContentDocumentRepository } = await import("../lib/server/editorial-repositories.ts");
const { OptimisticLockError } = await import("../lib/server/editorial-db.ts");
const { splitAnalysisRun } = await import("../lib/radar/analysis-run-storage.ts");
const { pruneRadarAnalysisHistory } = await import("../lib/radar/analysis-history-pruning.ts");
const { RadarAnalysisPayloadSchema, RadarExtractionPageSchema, VersionedRadarAnalysisSchema } = await import("../lib/radar/analysis-contracts.ts");
const { radarResearchProvenanceOfAnalysis, radarResearchSampleOfAnalysis } = await import("../lib/radar/research-read-model.ts");
const { readRadarFrozenVideoBriefs } = await import("../lib/server/radar-video-matching-read.ts");
const { NextRequest } = await import("next/server");
const rotaDeAnalise = await import("../app/api/editorial/radar-analysis/route.ts");
const rotaDaParte = await import("../app/api/editorial/radar-research-part/route.ts");

/* ======================= fixtures ======================= */

const MARCA = "5f0c3a52-8d4e-4b7a-9c61-2e8f4a1b7c90";
const ARTIGO = "artigo-historico-fora-de-ordem";
const ITEM = "wf-radar-1";
const HASH = `sha256:${"a".repeat(64)}`;

function pagina(id: string) {
  return RadarExtractionPageSchema.parse({
    id, url: `https://concorrente.test/${id}`, status: "success", fetchedAt: "2026-09-20T10:00:00.000Z",
    title: `Página ${id}`, metaDescription: "", canonical: null, h1: [], h2: [], h3: [],
    wordCount: 1200, internalLinkCount: 0, externalLinkCount: 0, listCount: 0, tableCount: 0, faqCount: 0,
    imageCount: 0, blockquoteCount: 0, comparisonCount: 0, hasDates: false, author: null,
    structuredDataTypes: [], recurringTerms: [], boldCount: 0, italicCount: 0, error: null,
    introText: `o corpo pesado da versão ${id}`.repeat(20),
  });
}

/** Uma versão INTEIRA, como o Radar a grava antes de separar a corrida. */
function versao(versionId: string, versionNumber: number, status: "draft" | "approved", comCorrida: boolean) {
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: "dna-v3",
    serpSnapshotId: "serp-9", serpSnapshotVersion: 1, serpSnapshotHash: "sha256:serp",
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: comCorrida ? [`pg-${versionId}`] : [],
    extractions: comCorrida ? [pagina(`pg-${versionId}`)] : [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status, humanNotes: [], approvedAt: null, approvedBy: null,
  });
  return VersionedRadarAnalysisSchema.parse({
    versionId, entityId: `radar-analysis:${ARTIGO}`, versionNumber, previousVersionId: null,
    contentHash: HASH, origin: "human", changeReason: "fixture",
    createdAt: "2026-09-20T10:00:00.000Z", createdBy: "user-1", payload,
  }) as unknown as Record<string, unknown>;
}

/*
 * O ARRAY FORA DE ORDEM, de propósito.
 *
 *   posição   versão   versionNumber   status     papel
 *      0        v2           2          approved   última aprovada (preservada)
 *      1        v5           5          draft      corrente pelo MAIOR número
 *      2        v1           1          approved   aprovada ANTIGA (podada)
 *      3        v4           4          draft      sem corrida gravada
 *      4        v3           3          draft      última DO ARRAY: `at(-1)`
 *
 * Hoje os três itens reais caem numa versão só (at(-1) = maior = preservada),
 * e isso esconderia um conjunto de reidratação errado. Aqui as quatro regras
 * apontam para versões diferentes.
 */
const INTEIRAS = [
  versao("v2", 2, "approved", true),
  versao("v5", 5, "draft", true),
  versao("v1", 1, "approved", true),
  versao("v4", 4, "draft", false),
  versao("v3", 3, "draft", true),
];

function semear() {
  const leves: Linha[] = [];
  const corridas: Linha[] = [];
  for (const inteira of INTEIRAS) {
    const { light, run, hasRun } = splitAnalysisRun(inteira);
    leves.push(light);
    if (hasRun) corridas.push({ workflow_item_id: ITEM, version_id: inteira.versionId, marca_id: MARCA, article_id: ARTIGO, payload: run });
  }
  banco.editorial_workflow_items = [
    {
      id: ITEM, marca_id: MARCA, article_id: ARTIGO, stage: "radar", state: "in_progress", lock_version: 7,
      created_at: "2026-09-20T10:00:00.000000+00:00", updated_at: "2026-09-21T10:00:00.000000+00:00",
      payload: { id: "radar-item-payload-1", analysisVersions: leves },
    },
    {
      id: "wf-videos", marca_id: MARCA, article_id: "artigo-videos", stage: "radar", state: "in_progress", lock_version: 2,
      created_at: "2026-09-20T10:00:00.000000+00:00", updated_at: "2026-09-21T10:00:00.000000+00:00",
      payload: {
        id: "radar-item-videos",
        analysisVersions: [
          { versionId: "vv1", versionNumber: 1, payload: { status: "draft", extractions: [], competitiveReport: null, youtubeSearch: null, amazonSearch: null,
            finalizedBundle: { bundleId: "bundle-1", bundleHash: "hash-1", blueprint: { videoBriefSnapshots: [{ briefId: "pauta-1", title: "Como escolher" }] } } } },
          { versionId: "vv2", versionNumber: 2, payload: { status: "draft", extractions: [], competitiveReport: null, youtubeSearch: null, amazonSearch: null, finalizedBundle: null } },
        ],
      },
    },
  ];
  banco.radar_analysis_runs = [
    ...corridas,
    /* A área Vídeos tem corrida pesada gravada — e não pode lê-la. */
    { workflow_item_id: "wf-videos", version_id: "vv1", marca_id: MARCA, article_id: "artigo-videos", payload: { extractions: [{ id: "x", peso: "y".repeat(5000) }] } },
    { workflow_item_id: "wf-videos", version_id: "vv2", marca_id: MARCA, article_id: "artigo-videos", payload: { extractions: [{ id: "z", peso: "w".repeat(5000) }] } },
  ];
  pedidos.length = 0;
}

/* ======================= os oráculos: as rotas como eram ======================= */

function storedAnalyses(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as { analysisVersions?: unknown }).analysisVersions;
  return VersionedRadarAnalysisSchema.array().parse(Array.isArray(raw) ? raw : []);
}

/** O GET de radar-analysis antes desta mudança: reidrata tudo, depois poda. */
async function respostaAntigaDaAnalise(articleId: string, versionId?: string) {
  const current = await new WorkflowRepository().findByArticle(MARCA, articleId, "radar");
  if (!current) return { status: 404, corpo: { code: "radar_item_not_found", error: "Item Radar não encontrado." } };
  if (current.marca_id !== MARCA || current.article_id !== articleId) return { status: 409, corpo: { code: "radar_identity_mismatch", error: "O item Radar não corresponde à marca ou ao artigo solicitado." } };
  const analyses = storedAnalyses(current.payload);
  const selected = versionId ? analyses.find(analysis => analysis.versionId === versionId) : analyses.at(-1);
  const history = pruneRadarAnalysisHistory(analyses as Parameters<typeof pruneRadarAnalysisHistory>[0]);
  if (versionId && !selected) return { status: 404, corpo: { code: "radar_analysis_not_found", error: "Versão da análise Radar não encontrada para este artigo." } };
  const payloadRadarItemId = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) && typeof (current.payload as { id?: unknown }).id === "string" ? (current.payload as { id: string }).id : null;
  return { status: 200, corpo: { persistenceMode: "remote", readbackConfirmed: true, brandId: MARCA, articleId, radarItemId: current.id, workflowRowId: current.id, payloadRadarItemId, lockVersion: current.lock_version, analysis: selected || null, analyses: history } };
}

function correnteDe(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const versoes = (payload as { analysisVersions?: unknown }).analysisVersions;
  if (!Array.isArray(versoes) || !versoes.length) return null;
  return [...versoes].sort((esquerda, direita) =>
    Number((direita as { versionNumber?: number }).versionNumber || 0)
    - Number((esquerda as { versionNumber?: number }).versionNumber || 0))[0] as { versionId?: string; payload?: unknown };
}

/** O GET de radar-research-part antes desta mudança. */
async function respostaAntigaDaParte(profile: "GOOGLE" | "AMAZON" | "YOUTUBE", part: "sample" | "provenance") {
  const item = await new WorkflowRepository().findByArticle(MARCA, ARTIGO, "radar");
  const corrente = correnteDe(item.payload);
  if (!corrente) throw new Error("fixture sem corrente");
  const identidade = { articleId: ARTIGO, analysisVersionId: corrente.versionId || null, profile };
  if (part === "sample") return { success: true, readbackConfirmed: true, ...identidade, sample: radarResearchSampleOfAnalysis({ payload: corrente.payload, profile }) };
  return { success: true, readbackConfirmed: true, ...identidade, provenance: radarResearchProvenanceOfAnalysis({ payload: corrente.payload, profile }) };
}

async function chamarRotaDeAnalise(articleId: string, versionId?: string) {
  const busca = new URLSearchParams({ brandId: MARCA, articleId });
  if (versionId) busca.set("versionId", versionId);
  const resposta = await rotaDeAnalise.GET(new NextRequest(`http://localhost/api/editorial/radar-analysis?${busca}`));
  return { status: resposta.status, texto: await resposta.text() };
}

/* ======================= (a) GET radar-analysis ======================= */

for (const caso of [
  { nome: "sem versionId (selected = at(-1), que NÃO é a de maior número)", versionId: undefined, esperados: ["v2", "v3", "v5"] },
  { nome: "versionId de uma aprovada HISTÓRICA, que a poda esvazia no histórico", versionId: "v1", esperados: ["v1", "v2", "v5"] },
  { nome: "versionId de uma versão sem corrida gravada", versionId: "v4", esperados: ["v2", "v4", "v5"] },
  // Id que a linha não tem NÃO vai ao filtro: texto da requisição não chega
  // cru a `.in("version_id", ...)`. A resposta continua 404, igual à antiga.
  { nome: "versionId inexistente (404)", versionId: "v-que-nao-existe", esperados: ["v2", "v5"] },
  // Aspas e parênteses: o postgrest-js não escapa `"` embutida, e antes isto
  // virava PGRST100 e 500. Agora nem chega à consulta.
  { nome: "versionId malformado não chega ao filtro (404, não 500)", versionId: 'a"b(', esperados: ["v2", "v5"] },
]) {
  test(`(a) radar-analysis GET · ${caso.nome}: resposta idêntica byte a byte à de reidratar tudo e podar`, async () => {
    semear();
    const antiga = await respostaAntigaDaAnalise(ARTIGO, caso.versionId);
    const doOraculo = pedidosA("radar_analysis_runs");
    assert.equal(doOraculo.length, 1);
    assert.equal(idsPedidos(doOraculo[0]), null, "o oráculo (findByArticle) continua reidratando TODAS as versões");

    pedidos.length = 0;
    const nova = await chamarRotaDeAnalise(ARTIGO, caso.versionId);
    assert.equal(nova.status, antiga.status);
    assert.equal(nova.texto, JSON.stringify(antiga.corpo), "nem um byte de diferença");

    const corridas = pedidosA("radar_analysis_runs");
    assert.equal(corridas.length, 1, "uma leitura de corridas, filtrada");
    assert.deepEqual(idsPedidos(corridas[0]), caso.esperados, "só a pedida (ou at(-1)), a corrente e a última aprovada");
    assert.equal(corridas[0].params.get("workflow_item_id"), `eq.${ITEM}`, "e só do item lido");
  });
}

test("(a) radar-analysis GET · a versão escolhida volta INTEIRA e as podadas voltam vazias, como antes", async () => {
  semear();
  const { texto } = await chamarRotaDeAnalise(ARTIGO, "v1");
  const corpo = JSON.parse(texto) as { analysis: { payload: { extractions: Array<{ id: string }> } }; analyses: Array<{ versionId: string; payload: { extractions: unknown[] } }> };
  assert.equal(corpo.analysis.payload.extractions[0]?.id, "pg-v1", "a pedida sai com a corrida reidratada");
  const porId = new Map(corpo.analyses.map(item => [item.versionId, item.payload.extractions.length]));
  assert.equal(porId.get("v5"), 1, "a corrente fica inteira no histórico");
  assert.equal(porId.get("v2"), 1, "a última aprovada fica inteira no histórico");
  assert.equal(porId.get("v1"), 0, "a aprovada antiga sai podada no histórico");
  assert.equal(porId.get("v3"), 0, "at(-1) sai podada no histórico (só `analysis` a leva inteira)");
});

test("(a) radar-analysis GET · item ausente: 404 idêntico e nenhuma consulta de corridas", async () => {
  semear();
  const antiga = await respostaAntigaDaAnalise("artigo-inexistente");
  pedidos.length = 0;
  const nova = await chamarRotaDeAnalise("artigo-inexistente");
  assert.equal(nova.status, 404);
  assert.equal(nova.texto, JSON.stringify(antiga.corpo));
  assert.equal(pedidosA("radar_analysis_runs").length, 0);
});

/* ======================= radar-research-part ======================= */

for (const [profile, part] of [["GOOGLE", "sample"], ["GOOGLE", "provenance"], ["AMAZON", "sample"], ["YOUTUBE", "provenance"]] as const) {
  test(`research-part GET · ${profile}/${part}: idêntica à leitura reidratada, só com a corrida da corrente`, async () => {
    semear();
    const antiga = await respostaAntigaDaParte(profile, part);
    pedidos.length = 0;
    const busca = new URLSearchParams({ brandId: MARCA, articleId: ARTIGO, profile, part });
    const resposta = await rotaDaParte.GET(new NextRequest(`http://localhost/api/editorial/radar-research-part?${busca}`));
    assert.equal(resposta.status, 200);
    assert.equal(await resposta.text(), JSON.stringify(antiga), "nem um byte de diferença");

    const corridas = pedidosA("radar_analysis_runs");
    assert.equal(corridas.length, 1);
    assert.deepEqual(idsPedidos(corridas[0]), ["v5"], "a corrente é a de MAIOR versionNumber, não a última do array");
  });
}

test("research-part GET · a amostra do Google sai da corrida da corrente", async () => {
  semear();
  const busca = new URLSearchParams({ brandId: MARCA, articleId: ARTIGO, profile: "GOOGLE", part: "sample" });
  const corpo = await (await rotaDaParte.GET(new NextRequest(`http://localhost/api/editorial/radar-research-part?${busca}`))).json() as { analysisVersionId: string; sample: { pages: Array<{ id: string }> } };
  assert.equal(corpo.analysisVersionId, "v5");
  assert.deepEqual(corpo.sample.pages.map(item => item.id), ["pg-v5"], "reidratar a versão errada daria amostra vazia, sem erro");
});

/* ======================= (b) área Vídeos ======================= */

test("(b) Vídeos · as pautas congeladas saem da linha, sem consultar radar_analysis_runs", async () => {
  semear();
  const lido = await readRadarFrozenVideoBriefs(MARCA, "artigo-videos");
  assert.deepEqual(lido, {
    briefs: [{ briefId: "pauta-1", title: "Como escolher" }],
    frozenBundleId: "bundle-1",
    frozenBundleHash: "hash-1",
  }, "a mais recente COM bundle; a posterior sem congelamento não apaga a anterior");
  assert.equal(pedidosA("radar_analysis_runs").length, 0, "nenhuma corrida atravessou a rede");
  assert.equal(pedidosA("editorial_workflow_items").length, 1);

  /* E o resultado é o mesmo da leitura reidratante: finalizedBundle nunca sai da linha. */
  const reidratado = await new WorkflowRepository().findByArticle(MARCA, "artigo-videos", "radar");
  const leve = await new WorkflowRepository().findByArticleWithoutRuns(MARCA, "artigo-videos", "radar");
  const bundles = (item: { payload: { analysisVersions: Array<{ payload: { finalizedBundle: unknown } }> } }) =>
    item.payload.analysisVersions.map(versaoLida => versaoLida.payload.finalizedBundle);
  assert.deepEqual(bundles(leve), bundles(reidratado));
});

test("(b) Vídeos · a leitura das pautas não chama a leitura reidratante (fonte sem comentários)", () => {
  const fonte = readFileSync(new URL("../lib/server/radar-video-matching-read.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(fonte, /\.findByArticleWithoutRuns\(brandId, articleId, "radar"\)/);
  assert.equal(/\.findByArticle\(/.test(fonte), false, "a reidratante não é chamada");
  assert.equal(/extractions|competitiveReport|youtubeSearch|amazonSearch/.test(fonte), false, "nenhum campo de corrida é lido");
});

/* ======================= (c) sem ids, sem consulta ======================= */

test("(c) pick vazio não consulta radar_analysis_runs e devolve a linha como está gravada", async () => {
  semear();
  const repositorio = new WorkflowRepository();
  const leve = await repositorio.findByArticleWithoutRuns(MARCA, ARTIGO, "radar");
  pedidos.length = 0;

  for (const pick of [() => [], () => [null, undefined, ""]]) {
    const lido = await repositorio.findByArticleHydratingVersions(MARCA, ARTIGO, "radar", pick);
    assert.deepEqual(lido, leve);
  }
  assert.equal(pedidosA("radar_analysis_runs").length, 0);

  const ausente = await repositorio.findByArticleHydratingVersions(MARCA, "artigo-inexistente", "radar", () => ["v1"]);
  assert.equal(ausente, null);
  assert.equal(pedidosA("radar_analysis_runs").length, 0, "item ausente também não consulta");
});

test("(c) pick recebe as versões LEVES, na ordem do array", async () => {
  semear();
  let vistas: Array<Record<string, unknown>> = [];
  await new WorkflowRepository().findByArticleHydratingVersions(MARCA, ARTIGO, "radar", versoes => {
    vistas = [...versoes];
    return [];
  });
  assert.deepEqual(vistas.map(item => item.versionId), ["v2", "v5", "v1", "v4", "v3"]);
  assert.ok(vistas.every(item => ((item.payload as { extractions: unknown[] }).extractions).length === 0), "nenhuma corrida antes da escolha");
});

/* ======================= (d) autosave do Redator ======================= */

test("(d) save devolve só as colunas estreitas, com o lock de depois do trigger", async () => {
  banco.content_documents = [{
    id: "doc-1", marca_id: MARCA, article_id: ARTIGO, status: "writing", content_hash: "sha256:antigo",
    lock_version: 3, updated_at: "2026-09-23T10:00:00.000000+00:00",
    payload: { importedContext: "x".repeat(20000) },
  }];
  pedidos.length = 0;

  const salvo = await new ContentDocumentRepository().save("doc-1", 3, { status: "em_revisao" } as never, "sha256:novo", "ator-1");
  assert.deepEqual(Object.keys(salvo).sort(), ["content_hash", "id", "lock_version", "status", "updated_at"]);
  assert.equal("payload" in salvo, false, "o documento não volta");
  assert.equal(salvo.status, "in_review");
  assert.equal(salvo.content_hash, "sha256:novo");
  assert.equal(salvo.lock_version, 4, "o lock devolvido é o pós-trigger");

  const [patch] = pedidosA("content_documents");
  assert.equal(patch.metodo, "PATCH");
  assert.equal(patch.params.get("select"), "id,status,content_hash,lock_version,updated_at");
  assert.equal(patch.params.get("lock_version"), "eq.3", "a trava otimista continua no WHERE");
});

test("(d) lock vencido: zero linhas voltam e o OptimisticLockError continua vindo do data nulo", async () => {
  banco.content_documents = [{
    id: "doc-1", marca_id: MARCA, article_id: ARTIGO, status: "writing", content_hash: "sha256:antigo",
    lock_version: 5, updated_at: "2026-09-23T10:00:00.000000+00:00", payload: {},
  }];
  pedidos.length = 0;
  await assert.rejects(
    () => new ContentDocumentRepository().save("doc-1", 3, { status: "escrevendo" } as never, "sha256:novo", "ator-1"),
    (erro: unknown) => erro instanceof OptimisticLockError,
  );
  assert.equal(banco.content_documents[0].lock_version, 5, "nada foi gravado");
  assert.equal(pedidosA("content_documents")[0].params.get("select"), "id,status,content_hash,lock_version,updated_at");
});
