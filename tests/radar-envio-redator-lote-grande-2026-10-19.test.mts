import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/**
 * O ENVIO AO REDATOR EM LOTE COM INVESTIGAÇÃO GRANDE — 2026-10-19.
 *
 * Teste real no local (WifiConecta, amarelo, 8 artigos finalizados com
 * artigo-modelo concluído): "Enviar ao Redator (8)" deixou 3 artigos em 500
 * em toda tentativa — `statement_timeout` (57014) em
 * `ContentDocumentRepository.create` — e 4 em 401 quando o token venceu no meio
 * da fila. O Pilar (22 blocos, 95 fontes) monta um documento de 7,2 MB; os
 * outros dois, 10,4 e 10,7 MB (quase tudo `importedContext.dossier.bundle.observed`).
 *
 * O que estas provas guardam, contra um PostgREST SIMULADO (o cliente Supabase
 * é o real; só o `fetch` global é trocado — sem rede, sem chamada paga):
 *
 *   1. a gravação do documento NÃO pede o documento de volta (era ~40% do
 *      comando que estourava os 8 s) e a confirmação é estreita;
 *   2. o recibo do documento (existente e readback) sai sem `payload`;
 *   3. o estado do Radar do envio reidrata só a corrida da versão corrente, e
 *      a corrente é a MESMA da leitura antiga;
 *   4. o item do Radar e as autoridades leem a linha sem as corridas;
 *   5. o lote sobrevive à renovação do token: 401 → renova → repete o artigo
 *      UMA vez e segue; outras falhas ficam por artigo.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

/* ======================= PostgREST simulado ======================= */

type Linha = Record<string, unknown>;
type Pedido = { metodo: string; tabela: string; params: URLSearchParams; prefer: string; accept: string; bytes: number };

/** A função de gravação do documento (migration 20261019120000): ausente até o dono aplicar. */
let funcaoDeGravacao: "ausente" | "presente" | "timeout" = "ausente";
const banco: Record<string, Linha[]> = { editorial_workflow_items: [], radar_analysis_runs: [], content_documents: [] };
const pedidos: Pedido[] = [];
const NAO_FILTRO = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function casa(linha: Linha, params: URLSearchParams): boolean {
  for (const [coluna, filtro] of params) {
    if (NAO_FILTRO.has(coluna)) continue;
    const valor = linha[coluna] === null || linha[coluna] === undefined ? "null" : String(linha[coluna]);
    if (filtro.startsWith("eq.")) { if (valor !== filtro.slice(3)) return false; continue; }
    if (filtro.startsWith("in.(") && filtro.endsWith(")")) {
      if (!filtro.slice(4, -1).split(",").map(item => item.replace(/^"|"$/g, "")).includes(valor)) return false;
      continue;
    }
    throw new Error(`filtro não simulado: ${coluna}=${filtro}`);
  }
  return true;
}

/** Projeção com caminhos JSON (`alias:payload->a->>b`), como o PostgREST faz. */
function projeta(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return structuredClone(linha);
  return Object.fromEntries(select.split(",").map(coluna => {
    const [alias, caminho] = coluna.includes(":") ? coluna.split(":") : [coluna, coluna];
    const partes = caminho.split(/->>?/);
    let valor: unknown = linha[partes[0]];
    for (const chave of partes.slice(1)) valor = valor && typeof valor === "object" ? (valor as Record<string, unknown>)[chave] : undefined;
    return [alias, valor === undefined ? null : structuredClone(valor)];
  }));
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname !== "supabase.teste.invalid") throw new Error(`rede real proibida neste teste: ${url.href}`);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  const metodo = String(init?.method || "GET").toUpperCase();
  const cabecalhos = new Headers(init?.headers);
  const corpoTexto = typeof init?.body === "string" ? init.body : "";
  const pedido: Pedido = { metodo, tabela, params: new URLSearchParams(url.searchParams), prefer: String(cabecalhos.get("Prefer") || ""), accept: String(cabecalhos.get("Accept") || ""), bytes: Buffer.byteLength(corpoTexto) };
  pedidos.push(pedido);
  const linhas = (banco[tabela] || []).filter(linha => casa(linha, url.searchParams));
  const select = url.searchParams.get("select");
  if (metodo === "GET") {
    const projetadas = linhas.map(linha => projeta(linha, select));
    if (pedido.accept.includes("vnd.pgrst.object")) {
      return projetadas.length === 1 ? json(projetadas[0]) : json({ code: "PGRST116", message: "0 linhas" }, 406);
    }
    return json(projetadas);
  }
  if (metodo === "POST" && tabela === "rpc/editorial_content_document_create_from_radar") {
    /* 2026-10-19 (2) · a função da migration 20261019120000, simulada nos três estados. */
    if (funcaoDeGravacao === "ausente") return json({ code: "PGRST202", message: "Could not find the function public.editorial_content_document_create_from_radar in the schema cache" }, 404);
    if (funcaoDeGravacao === "timeout") return json({ code: "57014", message: "canceling statement due to statement timeout" }, 500);
    const a = JSON.parse(corpoTexto || "{}") as Record<string, unknown>;
    banco.content_documents = banco.content_documents || [];
    let linha = banco.content_documents.find(item => String(item.marca_id) === String(a.p_marca_id) && String(item.article_id) === String(a.p_article_id));
    const criado = !linha;
    if (!linha) {
      linha = { id: a.p_id, marca_id: a.p_marca_id, article_id: a.p_article_id, article_dna_version_id: a.p_article_dna_version_id, status: a.p_status, title: a.p_title, slug: a.p_slug,
        payload: structuredClone(a.p_payload), content_hash: a.p_content_hash, created_by: a.p_actor_id, updated_by: a.p_actor_id, lock_version: 1, updated_at: "2026-10-19T00:10:00.000000+00:00" };
      banco.content_documents.push(linha);
    }
    return json({ id: linha.id, marca_id: linha.marca_id, article_id: linha.article_id, status: linha.status, content_hash: linha.content_hash, lock_version: linha.lock_version, updated_at: linha.updated_at, created: criado });
  }
  if (metodo === "POST") {
    const corpo = JSON.parse(corpoTexto || "{}") as Linha | Linha[];
    const conflito = String(url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    const ignorar = pedido.prefer.includes("resolution=ignore-duplicates");
    banco[tabela] = banco[tabela] || [];
    const gravadas: Linha[] = [];
    for (const nova of Array.isArray(corpo) ? corpo : [corpo]) {
      const existente = conflito.length ? banco[tabela].find(linha => conflito.every(coluna => String(linha[coluna]) === String(nova[coluna]))) : undefined;
      if (existente && ignorar) continue;
      const linha = { lock_version: 1, updated_at: "2026-10-19T00:10:00.000000+00:00", ...structuredClone(nova) };
      if (existente) Object.assign(existente, linha); else banco[tabela].push(linha);
      gravadas.push(linha);
    }
    if (pedido.prefer.includes("return=representation")) return json(gravadas.map(linha => projeta(linha, select)), 201);
    return new Response(null, { status: 201 });
  }
  throw new Error(`método não simulado: ${metodo} ${tabela}`);
}) as typeof fetch;

/* ======================= módulos do projeto ======================= */

const { ContentDocumentRepository, CONTENT_DOCUMENT_RADAR_RECEIPT_SELECT, CONTENT_DOCUMENT_ROW_RECEIPT_SELECT } = await import("../lib/server/editorial-repositories.ts");
const { radarWriterHandoffPorts } = await import("../lib/server/radar-writer-send.ts");
const { radarStartPorts } = await import("../lib/server/radar-youtube-start.ts");
const { splitAnalysisRun } = await import("../lib/radar/analysis-run-storage.ts");
const { RadarAnalysisPayloadSchema, RadarExtractionPageSchema, VersionedRadarAnalysisSchema } = await import("../lib/radar/analysis-contracts.ts");
const { postRadarWriterHandoff, postRadarWriterHandoffBatch, radarWriterHandoffBatchSummary } = await import("../lib/radar/writer-handoff-client.ts");

/* ======================= fixtures ======================= */

const MARCA = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const ARTIGO = "de3573ab-01b1-49a7-ab81-503a92dfb0f5";
const ITEM = "wf-radar-pilar";
const HASH = `sha256:${"c".repeat(64)}`;
const BUNDLE_HASH = `sha256:${"d".repeat(64)}`;

/* Uma página do tamanho das do Pilar: o corpo pesado é o que a corrida carrega. */
function pagina(versao: string, indice: number, kb: number) {
  return RadarExtractionPageSchema.parse({
    id: `${versao}-p${indice}`, url: `https://concorrente-${indice}.test/${versao}`, status: "success",
    fetchedAt: "2026-10-18T10:00:00.000Z", title: `Concorrente ${indice}`, metaDescription: "", canonical: null,
    h1: ["Wi-Fi"], h2: ["Como melhorar o sinal"], h3: [], wordCount: 1600,
    internalLinkCount: 0, externalLinkCount: 0, listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2,
    blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null, structuredDataTypes: ["Article"],
    recurringTerms: [], boldCount: 0, italicCount: 0, observedLinks: [], error: null,
    introText: `texto da versão ${versao} `.repeat(Math.ceil((kb * 1024) / 20)),
  });
}

function versao(versionId: string, versionNumber: number, paginas: number, kbPorPagina: number) {
  const extracoes = Array.from({ length: paginas }, (_, indice) => pagina(versionId, indice, kbPorPagina));
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: "dna-v2",
    serpSnapshotId: "serp-1", serpSnapshotVersion: 1, serpSnapshotHash: "sha256:serp",
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: extracoes.map(item => item.id),
    extractions: extracoes, extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });
  return VersionedRadarAnalysisSchema.parse({
    versionId, entityId: `radar-analysis:${ARTIGO}`, versionNumber, previousVersionId: null,
    contentHash: HASH, origin: "human", changeReason: "fixture",
    createdAt: "2026-10-18T10:00:00.000Z", createdBy: "user-1", payload,
  }) as unknown as Record<string, unknown>;
}

/*
 * O histórico do Pilar: 4 versões, 3 corridas. A corrente (v4, a de maior
 * número) carrega ~2 MB de corrida; as antigas somam outros ~4 MB que o envio
 * não usa — e que a leitura antiga reidratava inteiros.
 */
function semear() {
  const inteiras = [
    versao("v1", 1, 0, 1),
    versao("v2", 2, 22, 90),
    versao("v3", 3, 22, 90),
    versao("v4", 4, 22, 90),
  ];
  const leves: Linha[] = [];
  const corridas: Linha[] = [];
  for (const inteira of inteiras) {
    const { light, run, hasRun } = splitAnalysisRun(inteira);
    leves.push(light);
    if (hasRun) corridas.push({ workflow_item_id: ITEM, version_id: inteira.versionId, marca_id: MARCA, article_id: ARTIGO, payload: run });
  }
  banco.editorial_workflow_items = [{
    id: ITEM, marca_id: MARCA, article_id: ARTIGO, stage: "radar", subject_type: "article", state: "research_pending", lock_version: 9,
    source_version_id: "dna-v2", source_content_hash: "sha256:dna",
    created_at: "2026-10-18T10:00:00.000000+00:00", updated_at: "2026-10-18T11:00:00.000000+00:00",
    payload: { id: "radar-item-pilar", articleDnaVersionId: "dna-v2", siloId: "silo-wifi", title: "Wi-Fi", slug: "wifi", analysisVersions: leves },
  }];
  banco.radar_analysis_runs = corridas;
  banco.content_documents = [];
  pedidos.length = 0;
  return inteiras;
}

/** Um documento do tamanho do Pilar (7,2 MB), com o pacote no dossiê e a origem do Radar. */
function documentoDoPilar(megabytes = 7.2) {
  const origem = {
    radarItemId: ITEM, articleId: ARTIGO, analysisVersionId: "v4", analysisVersionNumber: 4,
    evidenceBundleHash: BUNDLE_HASH, articleDnaVersionId: "dna-v2", articleDnaContentHash: "sha256:dna",
    siloDnaVersionId: null, importedAt: "2026-10-19T00:10:00.000Z", importedBy: "user-1",
  };
  const observed = { evidence: "e".repeat(Math.round(megabytes * 1024 * 1024)) };
  return {
    id: `doc:${MARCA}:${ARTIGO}`, schemaVersion: 2, status: "planejado", title: "Wi-Fi",
    radarOrigin: origem,
    importedContext: { dossier: { bundleId: "bundle-1", bundleHash: BUNDLE_HASH, bundle: { bundleHash: BUNDLE_HASH, observed } } },
  };
}

const pedidosA = (tabela: string, metodo = "GET") => pedidos.filter(pedido => pedido.tabela === tabela && pedido.metodo === metodo);

/* ======================= 1 · a gravação do documento ======================= */

test("1 · a gravação do documento do Pilar (7,2 MB) não pede o documento de volta, e a confirmação é estreita", async () => {
  semear();
  const documento = documentoDoPilar();
  await radarWriterHandoffPorts.createDocument({
    brandId: MARCA, articleId: ARTIGO, document: documento as never, articleDnaVersionId: "dna-v2", slug: "wifi", actorId: "user-1",
  });

  const escritas = pedidosA("content_documents", "POST");
  assert.equal(escritas.length, 1, "uma escrita só");
  assert.ok(escritas[0].bytes > 7 * 1024 * 1024, "o documento inteiro vai na escrita (o pacote não muda)");
  assert.match(escritas[0].prefer, /resolution=ignore-duplicates/, "a idempotência é a de sempre");
  assert.doesNotMatch(escritas[0].prefer, /return=representation/, "a escrita não devolve a linha (o comando reconvertia os MB em JSON)");
  assert.equal(escritas[0].params.get("select"), null);
  assert.equal(escritas[0].params.get("on_conflict"), "marca_id,article_id");

  const confirmacoes = pedidosA("content_documents");
  assert.equal(confirmacoes.length, 1);
  assert.equal(confirmacoes[0].params.get("select"), CONTENT_DOCUMENT_ROW_RECEIPT_SELECT);
  assert.doesNotMatch(CONTENT_DOCUMENT_ROW_RECEIPT_SELECT, /payload|\*/);

  /* Repetir não sobrescreve: o upsert ignora a duplicata, e a linha é a mesma. */
  await radarWriterHandoffPorts.createDocument({
    brandId: MARCA, articleId: ARTIGO, document: { ...documento, title: "Outro" } as never, articleDnaVersionId: "dna-v2", slug: "wifi", actorId: "user-2",
  });
  assert.equal(banco.content_documents.length, 1);
  assert.equal((banco.content_documents[0].payload as { title: string }).title, "Wi-Fi");
});

/* ======================= 2 · o recibo do documento ======================= */

test("2 · o envio lê do documento só o recibo (id, schemaVersion, radarOrigin, bundleHash gravado), sem payload", async () => {
  semear();
  assert.equal(await radarWriterHandoffPorts.findDocument({ brandId: MARCA, articleId: ARTIGO }), null, "sem documento, nada");
  const documento = documentoDoPilar();
  banco.content_documents.push({ id: documento.id, marca_id: MARCA, article_id: ARTIGO, payload: documento, lock_version: 1 });
  pedidos.length = 0;

  const recibo = await radarWriterHandoffPorts.findDocument({ brandId: MARCA, articleId: ARTIGO });
  assert.deepEqual(recibo, { id: documento.id, schemaVersion: 2, radarOrigin: documento.radarOrigin, storedBundleHash: BUNDLE_HASH });
  const leituras = pedidosA("content_documents");
  assert.equal(leituras.length, 1);
  assert.equal(leituras[0].params.get("select"), CONTENT_DOCUMENT_RADAR_RECEIPT_SELECT);
  assert.ok(CONTENT_DOCUMENT_RADAR_RECEIPT_SELECT.split(",").every(coluna => coluna === "id" || coluna.includes(":payload->")), "nenhuma coluna `payload` inteira");

  /* Origem fora do contrato não vira entrega reconhecida. */
  (banco.content_documents[0].payload as { radarOrigin: unknown }).radarOrigin = { evidenceBundleHash: BUNDLE_HASH };
  const torto = await new ContentDocumentRepository().findRadarReceiptByArticle(MARCA, ARTIGO);
  assert.equal(torto?.radarOrigin, undefined);
});

/* ======================= 3 · o estado do Radar ======================= */

test("3 · o estado do Radar do envio reidrata só a corrida da corrente — e a corrente é a da leitura antiga", async () => {
  const inteiras = semear();
  const estreito = await radarWriterHandoffPorts.loadRadarState({ brandId: MARCA, articleId: ARTIGO });
  const corridas = pedidosA("radar_analysis_runs");
  assert.equal(corridas.length, 1, "uma leitura de corrida");
  assert.equal(corridas[0].params.get("version_id"), "in.(v4)", "só a corrida da versão corrente");
  assert.equal(estreito?.lockVersion, 9);
  assert.equal(estreito?.analyses.length, 1);

  pedidos.length = 0;
  const antigo = await radarStartPorts.loadRadarState({ brandId: MARCA, articleId: ARTIGO });
  assert.equal(pedidosA("radar_analysis_runs")[0].params.get("version_id"), null, "a leitura antiga lia TODAS as corridas");
  const correnteAntiga = antigo!.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0];
  assert.deepEqual(estreito!.analyses[0], correnteAntiga, "a mesma análise, reidratada igual");
  assert.equal(estreito!.analyses[0].payload.extractions.length, 22);
  assert.deepEqual(estreito!.analyses[0], VersionedRadarAnalysisSchema.parse(inteiras[3]));
});

test("3b · item de outra marca, ou ausente, continua sem estado", async () => {
  semear();
  assert.equal(await radarWriterHandoffPorts.loadRadarState({ brandId: "11111111-1111-4111-8111-111111111111", articleId: ARTIGO }), null);
  assert.equal(await radarWriterHandoffPorts.loadRadarState({ brandId: MARCA, articleId: "outro-artigo" }), null);
});

/* ======================= 4 · item e autoridades sem corridas ======================= */

test("4 · o item do Radar do envio vem sem as corridas (o envio não as lê dali)", async () => {
  semear();
  const item = await radarWriterHandoffPorts.findWorkflowItem({ brandId: MARCA, articleId: ARTIGO, stage: "radar" });
  assert.equal(item?.id, ITEM);
  assert.equal(item?.lock_version, 9);
  assert.equal(pedidosA("radar_analysis_runs").length, 0, "nenhuma corrida lida para o item");
});

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("4b · as autoridades leem a linha sem corridas; o envio não volta à leitura total nem ao documento inteiro", () => {
  const autoridades = semComentarios(readFileSync(new URL("../lib/server/radar-canonical-authorities.ts", import.meta.url), "utf8"));
  assert.match(autoridades, /new WorkflowRepository\(\)\.findByArticleWithoutRuns\(input\.brandId, input\.articleId, "radar"\)/);
  assert.doesNotMatch(autoridades, /\.findByArticle\(/);

  const envio = semComentarios(readFileSync(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8"));
  const portas = envio.slice(envio.indexOf("export const radarWriterHandoffPorts"), envio.indexOf("export async function sendRadarToWriter"));
  assert.doesNotMatch(portas, /\.findByArticle\(/, "nenhuma porta reidrata todas as corridas");
  assert.doesNotMatch(portas, /ContentDocumentRepository\(\)\.findByArticle\(/, "o envio não lê o documento inteiro");
  assert.match(portas, /findByArticleHydratingVersions\(brandId, articleId, "radar", radarPortableExportCurrentVersionPick\)/);

  const repositorio = semComentarios(readFileSync(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8"));
  const criar = repositorio.slice(repositorio.indexOf("async create(marcaId: string, document: ContentDocument"), repositorio.indexOf("async findRadarReceiptByArticle"));
  assert.doesNotMatch(criar, /select\("\*"\)/, "a gravação do documento não devolve a linha inteira");
});

/* ======================= 5 · o lote e o token vencido ======================= */

type Chamada = { articleId: string };
function servidorComToken(respostas: Record<string, number[]>) {
  const chamadas: Chamada[] = [];
  const restantes = new Map(Object.entries(respostas).map(([artigo, lista]) => [artigo, [...lista]]));
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const { articleId } = JSON.parse(String(init?.body || "{}")) as { articleId: string };
    chamadas.push({ articleId });
    const status = restantes.get(articleId)?.shift() ?? 200;
    if (status === 200) return new Response(JSON.stringify({ success: true, change: "CREATED", headline: "Pacote entregue ao Redator." }), { status: 200 });
    if (status === 401) return new Response(JSON.stringify({ success: false, error: "Nao autorizado: sessao Supabase ausente." }), { status: 401 });
    return new Response(JSON.stringify({ success: false, error: "A operação no banco excedeu o tempo limite." }), { status });
  }) as unknown as typeof fetch;
  return { chamadas, fetchImpl };
}

test("5 · 401 no meio do lote: renova a sessão, repete AQUELE artigo uma vez e segue", async () => {
  const s = servidorComToken({ a2: [401], a3: [401] });
  let renovacoes = 0;
  const resultados = await postRadarWriterHandoffBatch({
    brandId: MARCA, articleIds: ["a1", "a2", "a3", "a4"], fetchImpl: s.fetchImpl,
    refreshSession: async () => { renovacoes += 1; return true; },
  });
  assert.deepEqual(resultados.map(item => item.outcome), ["IMPORTED", "IMPORTED", "IMPORTED", "IMPORTED"]);
  assert.equal(renovacoes, 2);
  assert.deepEqual(s.chamadas.map(item => item.articleId), ["a1", "a2", "a2", "a3", "a3", "a4"]);
  assert.equal(radarWriterHandoffBatchSummary(resultados), "4 enviado(s)");
});

test("5b · a repetição é uma só: 401 de novo fica como falha daquele artigo, e o lote continua", async () => {
  const s = servidorComToken({ a1: [401, 401] });
  const resultados = await postRadarWriterHandoffBatch({
    brandId: MARCA, articleIds: ["a1", "a2"], fetchImpl: s.fetchImpl, refreshSession: async () => true,
  });
  assert.equal(resultados[0].outcome, "FAILED");
  assert.match(resultados[0].message, /sessao Supabase ausente/);
  assert.equal(resultados[1].outcome, "IMPORTED");
  assert.deepEqual(s.chamadas.map(item => item.articleId), ["a1", "a1", "a2"]);
});

test("5c · sem sessão renovada não repete; outra falha (500) nunca repete e fica por artigo", async () => {
  const semSessao = servidorComToken({ a1: [401] });
  const r1 = await postRadarWriterHandoff({ brandId: MARCA, articleId: "a1", fetchImpl: semSessao.fetchImpl, refreshSession: async () => false });
  assert.equal(r1.outcome, "FAILED");
  assert.equal(semSessao.chamadas.length, 1);

  const comErro = servidorComToken({ a1: [500] });
  let renovou = false;
  const resultados = await postRadarWriterHandoffBatch({
    brandId: MARCA, articleIds: ["a1", "a2"], fetchImpl: comErro.fetchImpl, refreshSession: async () => { renovou = true; return true; },
  });
  assert.equal(renovou, false, "500 não é sessão: não renova");
  assert.deepEqual(resultados.map(item => item.outcome), ["FAILED", "IMPORTED"]);
  assert.deepEqual(comErro.chamadas.map(item => item.articleId), ["a1", "a2"]);
  assert.equal(radarWriterHandoffBatchSummary(resultados), "1 enviado(s) · 1 com falha");
});

test("5d · a renovação que lança não derruba o lote", async () => {
  const s = servidorComToken({ a1: [401] });
  const resultados = await postRadarWriterHandoffBatch({
    brandId: MARCA, articleIds: ["a1", "a2"], fetchImpl: s.fetchImpl, refreshSession: async () => { throw new Error("rede"); },
  });
  assert.deepEqual(resultados.map(item => item.outcome), ["FAILED", "IMPORTED"]);
});

test("5e · o botão do lote do Radar e o do Redator usam a mesma porta (a renovação vale para os dois)", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const redator = readFileSync(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  assert.ok(pagina.includes("postRadarWriterHandoffBatch({ brandId: selectedBrandId, articleIds })"));
  assert.match(redator, /postRadarWriterHandoffBatch\(\{ brandId: selectedBrandId, articleIds: ids \}\)/);
  const cliente = semComentarios(readFileSync(new URL("../lib/radar/writer-handoff-client.ts", import.meta.url), "utf8"));
  assert.match(cliente, /if \(resposta\.status === 401\)/);
  assert.match(cliente, /auth\.refreshSession\(\)/);
});

/* ======================= 6 · o pacote grande (10,7 MB) ======================= */

/*
 * 2026-10-19 (2) · O CASO QUE CONTINUOU EM 500 DEPOIS DO CONSERTO 1-5.
 *
 * Reteste pelo botão "Enviar ao Redator (1)" (WifiConecta, 90326a17, 978165e0,
 * de3573ab): 57014 de novo. A instrução é o INSERT do documento — medido em
 * pg_stat_statements: 5,2 s em média e 7,5 s no máximo para 5,3 a 8,4 MB (~0,9 s
 * por MB); os três montam 10 a 11 MB. A MESMA escrita passa pela função com
 * `statement_timeout` próprio (migration 20261019120000), e sem a função o upsert
 * antigo responde (cenário 1).
 */

test("6 · pacote grande: o documento de 10,7 MB vai inteiro numa chamada à função de gravação, sem corpo de volta, e repetir não sobrescreve", async () => {
  semear();
  funcaoDeGravacao = "presente";
  try {
    const documento = documentoDoPilar(10.7);
    const recibo = await new ContentDocumentRepository().create(MARCA, documento as never, ARTIGO, "dna-v2", "wifi", HASH, "11111111-1111-4111-8111-111111111111");

    const chamadas = pedidosA("rpc/editorial_content_document_create_from_radar", "POST");
    assert.equal(chamadas.length, 1, "uma chamada só");
    assert.ok(chamadas[0].bytes > 10 * 1024 * 1024, "o pacote inteiro vai (nada podado: ele entra no hash)");
    assert.equal(pedidosA("content_documents", "POST").length, 0, "o upsert antigo não roda junto");
    assert.equal(pedidosA("content_documents").length, 0, "o recibo volta da própria função, sem segunda leitura");
    assert.deepEqual(Object.keys(recibo as object).sort(), CONTENT_DOCUMENT_ROW_RECEIPT_SELECT.split(",").sort(), "o recibo é o estreito de sempre");
    assert.equal(JSON.stringify(recibo).includes("payload"), false);
    assert.equal(banco.content_documents.length, 1);

    /* O readback do envio continua estreito e confere o pacote gravado. */
    const lido = await radarWriterHandoffPorts.findDocument({ brandId: MARCA, articleId: ARTIGO });
    assert.equal(lido?.storedBundleHash, BUNDLE_HASH);
    assert.equal(lido?.radarOrigin?.evidenceBundleHash, BUNDLE_HASH);

    /* Repetir (o clique de novo) não sobrescreve: ON CONFLICT DO NOTHING. */
    await radarWriterHandoffPorts.createDocument({
      brandId: MARCA, articleId: ARTIGO, document: { ...documento, title: "Outro" } as never, articleDnaVersionId: "dna-v2", slug: "wifi", actorId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(banco.content_documents.length, 1);
    assert.equal((banco.content_documents[0].payload as { title: string }).title, "Wi-Fi");
  } finally {
    funcaoDeGravacao = "ausente";
  }
});

test("6b · pacote grande: 57014 na função sobe como tempo limite do banco, e a escrita de 10 MB NÃO é repetida pelo outro caminho", async () => {
  semear();
  funcaoDeGravacao = "timeout";
  try {
    await assert.rejects(
      new ContentDocumentRepository().create(MARCA, documentoDoPilar(10.7) as never, ARTIGO, "dna-v2", "wifi", HASH, "11111111-1111-4111-8111-111111111111"),
      (erro: unknown) => (erro as { reason?: string }).reason === "statement_timeout",
    );
    assert.equal(pedidosA("rpc/editorial_content_document_create_from_radar", "POST").length, 1);
    assert.equal(pedidosA("content_documents", "POST").length, 0, "sem segunda escrita gigante");
    assert.equal(banco.content_documents.length, 0, "nada gravado");
  } finally {
    funcaoDeGravacao = "ausente";
  }
});

test("6c · sem a função no banco (migration não aplicada), a gravação é o upsert de sempre", async () => {
  semear();
  await new ContentDocumentRepository().create(MARCA, documentoDoPilar(10.7) as never, ARTIGO, "dna-v2", "wifi", HASH, "11111111-1111-4111-8111-111111111111");
  assert.equal(pedidosA("rpc/editorial_content_document_create_from_radar", "POST").length, 1, "tentou a função");
  const escritas = pedidosA("content_documents", "POST");
  assert.equal(escritas.length, 1, "e caiu no upsert antigo, uma vez");
  assert.match(escritas[0].prefer, /resolution=ignore-duplicates/);
  assert.equal(banco.content_documents.length, 1);
});

test("6d · a migration da função: mesma escrita idempotente, tempo próprio, só service_role", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261019120000_documento_do_radar_gravacao_com_tempo_proprio.sql", import.meta.url), "utf8")
    .replace(/--.*$/gm, " ");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.editorial_content_document_create_from_radar\(/);
  assert.match(sql, /SET statement_timeout = '60s'/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /ON CONFLICT \(marca_id, article_id\) DO NOTHING/);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|DO UPDATE|SECURITY DEFINER|ALTER (TABLE|ROLE)/i, "nada sobrescrito, nenhum papel mudado");
  assert.match(sql, /FROM anon, authenticated/);
  assert.match(sql, /TO service_role;/);
  const repositorio = semComentarios(readFileSync(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8"));
  const criar = repositorio.slice(repositorio.indexOf("async create(marcaId: string, document: ContentDocument"), repositorio.indexOf("async findRadarReceiptByArticle"));
  assert.match(criar, /rpc\("editorial_content_document_create_from_radar"/);
});
