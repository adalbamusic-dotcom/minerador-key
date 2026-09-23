import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_GOOGLE_COMPETITIVE_FIELDS,
  RADAR_GOOGLE_RESEARCH_FINALIZED,
  radarGoogleResearchIsFinalized,
  radarGoogleResearchWriteLock,
} from "../lib/radar/google-research-write-lock.ts";
import {
  compactRadarResearchForRead,
  radarResearchProvenanceOfAnalysis,
  radarResearchSampleOfAnalysis,
  radarResearchSampleSummary,
} from "../lib/radar/research-read-model.ts";
import { RadarCompactBaseError, createRadarAnalysisSuccessor, RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import { buildRadarResetPayload } from "../lib/radar/radar-reset.ts";
import type { RadarAnalysisPayload } from "../lib/radar/analysis-contracts.ts";

/*
 * ===== RADAR_FINAL_2.3 · A FRONTEIRA DE ESCRITA DO GOOGLE, E A AMOSTRA LAZY =====
 *
 * A ORDEM importa e é o que este gate provou: primeiro a fronteira de escrita,
 * depois a compactação. Invertê-la faria a curadoria e a extração gravarem
 * sobre uma lista vazia.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String(entrada));
    return Promise.reject(new Error("REDE NÃO ESPERADA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const fonteDaRota = await readFile(new URL("../app/api/editorial/radar-analysis/route.ts", import.meta.url), "utf8");
const fonteDoRepositorio = await readFile(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8");
const fonteDaRotaLazy = await readFile(new URL("../app/api/editorial/radar-research-part/route.ts", import.meta.url), "utf8");
const fonteDoModelo = await readFile(new URL("../lib/radar/research-read-model.ts", import.meta.url), "utf8");
const fonteDaTrava = await readFile(new URL("../lib/radar/google-research-write-lock.ts", import.meta.url), "utf8");

/* ========================= a investigação do Google ========================= */

const pagina = (indice: number) => RadarExtractionPageSchema.parse({
  id: `page-${indice}`,
  url: `https://exemplo-${indice}.test/artigo`,
  status: "success", fetchedAt: "2026-09-15T12:00:00.000Z",
  title: `Título do concorrente ${indice}`, metaDescription: "Meta do concorrente.",
  canonical: `https://exemplo-${indice}.test/artigo`,
  h1: ["H1"], h2: ["H2 um", "H2 dois"], h3: [],
  wordCount: 1800, internalLinkCount: 24, externalLinkCount: 6,
  listCount: 5, tableCount: 1, faqCount: 4, imageCount: 9,
  blockquoteCount: 2, comparisonCount: 1, hasDates: true,
  author: "Autor", structuredDataTypes: ["Article"],
  recurringTerms: [], boldCount: 18, italicCount: 3, error: "",
});

const fotografia = (ids: string[]) => ({
  bundleId: "bundle-1", bundleHash: "hash-1",
  frozenAt: "2026-09-15T14:00:00.000Z", frozenBy: "user-1",
  sample: { analyzedSuccess: ids.length, comparablePages: ids.length, failedFinal: 0, extractionIds: ids },
  limitations: ["Fonte citada por concorrente não é endosso automático."],
});

const googleAtivo = (paginas = 8) => ({
  extractions: Array.from({ length: paginas }, (_, i) => pagina(i + 1)),
  extractionIds: Array.from({ length: paginas }, (_, i) => `page-${i + 1}`),
  selectedCompetitorIds: ["organic:1", "organic:2"],
  serpSnapshotId: "snap-goo-1",
  finalizedBundle: null,
  researchTransport: "FULL" as const,
});

const googleFinalizado = (paginasCorrentes = 8, idsCongelados = 8) => ({
  ...googleAtivo(paginasCorrentes),
  finalizedBundle: fotografia(Array.from({ length: idsCongelados }, (_, i) => `page-${i + 1}`)),
});

const bytes = (valor: unknown) => JSON.stringify(valor ?? null).length;

/* ============================== A, B, C e D ============================== */

test("A · Google ATIVO continua permitindo escrita competitiva", () => {
  const atual = googleAtivo();
  const proximo = { ...atual, extractions: [...atual.extractions, pagina(99)] };

  const decisao = radarGoogleResearchWriteLock({ current: atual, next: proximo });
  assert.equal(decisao.state, "OPEN");
  assert.equal(decisao.allowed, true);
  assert.equal(radarGoogleResearchIsFinalized(atual), false);
});

test("B, C e D · FINALIZED bloqueia extração, merge e curadoria", () => {
  const atual = googleFinalizado();

  /*
   * ============ §2 · TRÊS CAMINHOS, UMA REGRA ============
   *
   * Extrair, mesclar e recurar mudam campos diferentes — e todos descrevem a
   * mesma coisa: a composição competitiva sob uma fotografia já assinada.
   */
  const casos: Array<[string, Record<string, unknown>]> = [
    ["extração nova", { ...atual, extractions: [...atual.extractions, pagina(99)] }],
    ["merge de extração", { ...atual, extractions: [pagina(1), pagina(50)] }],
    ["curadoria", { ...atual, selectedCompetitorIds: ["organic:3"] }],
    ["remoção de página", { ...atual, extractions: atual.extractions.slice(0, 4) }],
    ["recálculo do modelo", { ...atual, deepResearch: { observed: { sample: { comparablePages: 4 } } } }],
  ];

  for (const [nome, proximo] of casos) {
    const decisao = radarGoogleResearchWriteLock({ current: atual, next: proximo });
    assert.equal(decisao.allowed, false, `${nome} passou pela trava`);
    assert.equal(decisao.state, "FINALIZED_LOCKED");
    assert.equal(decisao.code, RADAR_GOOGLE_RESEARCH_FINALIZED);
    assert.match(decisao.message || "", /Reabra a investigação antes de alterar a amostra competitiva/);
    assert.ok(decisao.competitiveFields.length > 0, `${nome} não nomeou o campo`);
  }
});

test("B · a escrita que NÃO toca a composição continua passando", () => {
  const atual = googleFinalizado();

  /*
   * Aprovar, anotar e registrar o envio ao Planejador acontecem DEPOIS do
   * FINALIZE por construção. Travar tudo faria o congelamento impedir o próprio
   * handoff — a trava existiria para tornar o fluxo impossível.
   */
  for (const proximo of [
    { ...atual, status: "approved" },
    { ...atual, humanNotes: ["uma anotação"] },
    { ...atual, plannerBundle: { bundleHash: "x" } },
  ]) {
    const decisao = radarGoogleResearchWriteLock({ current: atual, next: proximo });
    assert.equal(decisao.allowed, true);
    assert.deepEqual(decisao.competitiveFields, []);
  }
});

/* ================================== E ================================== */

test("E · a trava mora no SERVIDOR, e compara contra a versão gravada", () => {
  const rota = semComentarios(fonteDaRota);

  /*
   * ============ §4 · ESCONDER O BOTÃO NÃO É TRAVAR ============
   *
   * Os três caminhos convergem para esta gravação. Uma trava só na tela seria
   * contornada por qualquer chamada direta à rota — e as três telas continuariam
   * podendo divergir entre si.
   */
  assert.match(rota, /radarGoogleResearchWriteLock\(\{/);
  assert.match(rota, /if \(!trava\.allowed\)/);
  assert.match(rota, /status: 409/);

  /*
   * E A COMPARAÇÃO É CONTRA O REPOSITÓRIO, nunca contra o que o navegador
   * mandou: um cliente que enviasse um payload sem `finalizedBundle` se
   * destravaria sozinho.
   */
  /*
   * Desde 2026-09-23 a corrente chega por um método próprio do repositório
   * (egress: a leitura do item inteiro reidratava 8,22 MB para a trava usar
   * uma versão). A autoridade continua sendo a versão GRAVADA, e continua
   * passando pelo mesmo schema antes de entrar na trava.
   */
  assert.match(rota, /const versaoCorrente = await repositorio\.findCurrentRadarAnalysisForWriteLock\(input\.brandId, input\.articleId\);/);
  assert.match(rota, /const correnteGravada = versaoCorrente \? VersionedRadarAnalysisSchema\.parse\(versaoCorrente\) : null;/);
  assert.match(rota, /current: correnteGravada\?\.payload \|\| null,/);
  assert.equal(/current: input\./.test(rota), false, "a corrente nunca sai do corpo do pedido");
  assert.ok(rota.indexOf("radarGoogleResearchWriteLock") < rota.indexOf("appendRadarAnalysis(input.brandId"), "a trava vem ANTES da escrita");
});

test("E · nenhuma escrita parcial acontece quando a trava recusa", () => {
  const rota = semComentarios(fonteDaRota);
  const fatia = rota.slice(rota.indexOf("const trava ="), rota.indexOf("appendRadarAnalysis(input.brandId"));

  /*
   * Entre a decisão e a escrita não existe efeito nenhum: a recusa retorna
   * antes. Uma gravação parcial deixaria a fotografia descrevendo uma amostra e
   * a versão corrente carregando outra.
   */
  assert.equal(/append|save|upsert|transition/.test(fatia), false, "há efeito entre a trava e a recusa");
  assert.match(fatia, /return NextResponse\.json\(\{/);
});

/* ================================== F ================================== */

test("F · reabrir destrava — e é a ÚNICA porta", () => {
  const atual = googleFinalizado();

  /*
   * ============ §5 · A ESCRITA QUE LIMPA A FOTOGRAFIA É O REABRIR ============
   *
   * Bloqueá-la trancaria a investigação para sempre: a única saída exigiria a
   * trava que a impede. A trava se reconhece nela e sai da frente.
   */
  const reabrindo = { ...atual, finalizedBundle: null, extractions: [] };
  const decisao = radarGoogleResearchWriteLock({ current: atual, next: reabrindo });
  assert.equal(decisao.allowed, true);
  assert.equal(decisao.state, "OPEN");

  /* E depois de reaberta, a escrita competitiva volta a passar. */
  const reaberta = { ...googleAtivo(), extractions: [] };
  const extraindoDeNovo = { ...reaberta, extractions: [pagina(1)] };
  assert.equal(radarGoogleResearchWriteLock({ current: reaberta, next: extraindoDeNovo }).allowed, true);

  /* §5 · nenhum segundo mecanismo de unlock foi inventado. */
  const trava = semComentarios(fonteDaTrava);
  assert.equal(/unlock|forceWrite|bypass|override/i.test(trava), false);
});

/* ============================== G, H, I e J ============================== */

test("G · Google FINALIZED não leva as extrações completas no initial", () => {
  const compacta = compactRadarResearchForRead(googleFinalizado(18, 8) as unknown as Record<string, unknown>);

  assert.deepEqual(compacta.extractions, []);
  assert.equal(compacta.researchTransport, "COMPACT");
  assert.ok(compacta.finalizedBundle, "a fotografia sobrevive: é ela que sustenta a visão");

  const antes = bytes(googleFinalizado(18, 8));
  const depois = bytes(compacta);
  assert.ok(depois < antes * 0.1, `esperava >90% de corte; cortou ${((1 - depois / antes) * 100).toFixed(1)}%`);
});

test("G · Google ATIVO não é compactado — a curadoria precisa das páginas", () => {
  const ativo = googleAtivo() as unknown as Record<string, unknown>;
  const resultado = compactRadarResearchForRead(ativo);

  assert.equal(resultado, ativo, "a investigação viva sai intacta, e pelo mesmo objeto");
  assert.equal(resultado.researchTransport, "FULL");
});

test("H, I e J · a amostra do Google usa a mesma rota genérica, sem provider", () => {
  const rota = semComentarios(fonteDaRotaLazy);

  /* §10 · nenhum endpoint dedicado ao Google nasceu. */
  assert.match(rota, /profile: z\.enum\(RADAR_RESEARCH_PROFILES\)/);
  assert.equal(/google-sample|GOOGLE_ONLY_ROUTE/.test(rota), false);

  /* §13 · e a leitura continua sendo do banco. */
  assert.equal(/executeDataForSeo|collectDataForSeo|dataforseo\.com|\bfetch\(/.test(rota), false);
  assert.match(rota, /export async function GET/);
});

/* ================================ K e L ================================ */

test("K e L · 18 extrações correntes + 8 ids congelados mostram EXATAMENTE as 8", () => {
  const analise = googleFinalizado(18, 8);

  /*
   * ============ §11 · A FOTOGRAFIA MANDA ============
   *
   * Devolver as 18 correntes mostraria uma amostra que a fotografia não tem — e
   * quem lesse acharia que a investigação assinada cobria mais do que cobriu.
   */
  const amostra = radarResearchSampleOfAnalysis({ payload: analise, profile: "GOOGLE" });
  assert.equal(amostra.pages.length, 8);
  assert.equal(amostra.count, 8);
  assert.deepEqual(
    amostra.pages.map(item => (item as { id: string }).id),
    Array.from({ length: 8 }, (_, i) => `page-${i + 1}`),
  );
  assert.equal(amostra.integrity, null);

  /* E o rótulo do disclosure conta o mesmo: 8, não 18. */
  const resumo = radarResearchSampleSummary({ payload: analise, profile: "GOOGLE" });
  assert.deepEqual(resumo, { count: 8, available: true, unit: "página(s)" });

  /* Até sobre a cópia compactada, porque a contagem vem da fotografia. */
  const compacta = compactRadarResearchForRead(analise as unknown as Record<string, unknown>);
  assert.equal(radarResearchSampleSummary({ payload: compacta, profile: "GOOGLE" }).count, 8);
});

/* ================================== M ================================== */

test("M · id congelado que não resolve é erro explícito, sem substituição", () => {
  const analise = {
    ...googleAtivo(3),
    finalizedBundle: fotografia(["page-1", "page-2", "page-7", "page-9"]),
  };

  const amostra = radarResearchSampleOfAnalysis({ payload: analise, profile: "GOOGLE" });

  /*
   * ============ §12 · A FOTOGRAFIA NÃO MUDA DE SIGNIFICADO EM SILÊNCIO ============
   *
   * Duas das quatro páginas congeladas não estão na versão corrente. Completar
   * a amostra com `page-3`, que existe, faria a fotografia descrever uma
   * investigação diferente — e nada na tela diria.
   */
  assert.deepEqual(amostra.pages.map(item => (item as { id: string }).id), ["page-1", "page-2"]);
  assert.equal(amostra.count, 4, "a contagem continua sendo a da fotografia");
  assert.equal(amostra.integrity?.code, "FROZEN_SAMPLE_REFERENCE_MISSING");
  assert.deepEqual(amostra.integrity?.missingIds, ["page-7", "page-9"]);
  assert.match(amostra.integrity?.message || "", /não foram encontradas/);

  /* E nenhuma página fora da fotografia entrou no lugar. */
  assert.equal(amostra.pages.some(item => (item as { id: string }).id === "page-3"), false);
});

/* ================================ N e O ================================ */

test("N e O · a proveniência do Google também sai do payload inicial", () => {
  const analise = googleFinalizado();
  const compacta = compactRadarResearchForRead(analise as unknown as Record<string, unknown>);

  /* A leitura técnica responde sem as extrações ao lado. */
  const tecnico = radarResearchProvenanceOfAnalysis({ payload: compacta, profile: "GOOGLE" });
  assert.equal(tecnico.profile, "GOOGLE");
  assert.ok(bytes(tecnico) < 1024, "a proveniência é leve por construção");

  const modelo = semComentarios(fonteDoModelo);
  assert.match(modelo, /export function radarResearchProvenanceOfAnalysis/);
});

/* ============================== P, Q e R ============================== */

test("P · o DTO compacto continua recusado como base de escrita", async () => {
  const base = {
    versionId: "v-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
    previousVersionId: null, contentHash: "sha256:x", origin: "human" as const,
    changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
    payload: compactRadarResearchForRead(googleFinalizado() as unknown as Record<string, unknown>),
  };

  await assert.rejects(
    () => createRadarAnalysisSuccessor(base as never, {}, "user-1"),
    (erro: unknown) => erro instanceof RadarCompactBaseError,
  );
});

test("Q e R · o servidor resolve a autoridade FULL, e a compactação não apaga nada", () => {
  const rota = semComentarios(fonteDaRota);

  /*
   * §14 · A ESCRITA NUNCA USA O DTO QUE VEIO DO NAVEGADOR COMO AUTORIDADE.
   *
   * A trava lê do REPOSITÓRIO, que não compacta. Comparar contra o payload
   * recebido deixaria o próprio cliente decidir se está travado.
   *
   * Até 2026-09-23 a leitura era `findByArticle`, que reidrata TODAS as
   * corridas do item (8,22 MB no maior) para a trava usar só a corrente. O
   * método novo lê a mesma linha crua do repositório e devolve SÓ a versão
   * corrente, com a corrida DELA reidratada inteira quando a investigação está
   * finalizada — que é quando a trava compara `extractions`. A intenção desta
   * asserção não mudou: repositório, corrente completa, nada compactado. Por
   * isso ela exige, além do nome, o corpo do método.
   */
  assert.match(rota, /repositorio\.findCurrentRadarAnalysisForWriteLock\(input\.brandId, input\.articleId\)/);
  assert.equal(/\.findByArticle\(|findByArticleWithoutRuns/.test(rota.slice(rota.indexOf("export async function POST"))), false, "a gravação não lê o item inteiro nem a linha leve");

  const repositorio = semComentarios(fonteDoRepositorio);
  const metodo = repositorio.slice(repositorio.indexOf("async findCurrentRadarAnalysisForWriteLock("), repositorio.indexOf("async importItem("));
  assert.match(metodo, /this\.findByArticleRaw\(marcaId, articleId, "radar"\)/, "lê a linha do repositório");
  assert.match(metodo, /versoes\[versoes\.length - 1\]/, "a corrente é a última do array, como no `.at(-1)` da trava");
  assert.match(metodo, /if \(!radarGoogleResearchIsFinalized\(corrente\.payload\)\) return corrente;/, "só dispensa a corrida quando a trava abre sem comparar");
  assert.match(metodo, /\.eq\("workflow_item_id", String\(registro\.id\)\)\.eq\("version_id", versionId\)/, "a corrida é só a da corrente");
  assert.match(metodo, /mergeAnalysisRun\(corrente,/, "e volta inteira, pela mesma fusão da reidratação");
  assert.equal(/compactRadarResearchForRead|pruneRadarAnalysisHistory/.test(metodo), false, "nada é compactado nem podado");
  assert.equal(/return linha|return registro|\.\.\.registro/.test(metodo), false, "devolve a versão, nunca a linha");
  assert.equal(/compactRadarResearchForRead/.test(rota), false, "o readback de escrita não compacta");

  /* §7 · e a compactação é de LEITURA: o banco continua completo. */
  const modelo = semComentarios(fonteDoModelo);
  assert.match(modelo, /export function compactRadarResearchForRead/);
  assert.equal(/appendAnalysis|save|upsert|delete/.test(modelo), false, "o modelo de leitura não escreve");
});

/* ============================== S, T, U e V ============================== */

test("S e T · YouTube e Amazon não regridem", () => {
  const modelo = semComentarios(fonteDoModelo);
  assert.match(modelo, /const CORRIDAS = \["amazonSearch", "youtubeSearch"\] as const;/);

  const amazon = compactRadarResearchForRead({
    amazonSearch: { universe: [{ asin: "A1" }] },
    amazonFrozenInvestigation: { finalizedAt: "x", runRef: { universeSize: 51, queriesExecuted: 1 } },
  } as unknown as Record<string, unknown>);
  assert.equal(amazon.amazonSearch, null);

  const youtube = compactRadarResearchForRead({
    youtubeSearch: { universe: [{ videoId: "v1" }] },
    youtubeFrozenInvestigation: { finalizedAt: "x", runRef: { universeSize: 38, queriesExecuted: 3 } },
  } as unknown as Record<string, unknown>);
  assert.equal(youtube.youtubeSearch, null);

  /* E a amostra dos dois continua vindo pela corrida, não pela lista. */
  for (const profile of ["AMAZON", "YOUTUBE"] as const) {
    const amostra = radarResearchSampleOfAnalysis({ payload: {}, profile });
    assert.deepEqual(amostra.pages, [], `${profile} não usa a lista de páginas`);
  }
});

test("V · a trava não alcança o congelamento nem o handoff", () => {
  const ativo = googleAtivo();

  /*
   * O PRÓPRIO FINALIZE É UMA ESCRITA — e ela carrega o payload inteiro.
   *
   * Marcar toda gravação que CARREGA `extractions` faria o congelamento se
   * bloquear: a sucessora que grava a fotografia passa as extrações adiante sem
   * alterá-las.
   */
  const congelando = { ...ativo, finalizedBundle: fotografia(["page-1", "page-2"]) };
  const decisao = radarGoogleResearchWriteLock({ current: ativo, next: congelando });
  assert.equal(decisao.allowed, true, "o FINALIZE não pode ser bloqueado pela própria trava");

  /* E a lista de campos competitivos é dos CAMPOS, não dos botões. */
  assert.ok(RADAR_GOOGLE_COMPETITIVE_FIELDS.includes("extractions"));
  assert.ok(RADAR_GOOGLE_COMPETITIVE_FIELDS.includes("selectedCompetitorIds"));
  assert.equal((RADAR_GOOGLE_COMPETITIVE_FIELDS as readonly string[]).includes("finalizedBundle"), false);
  assert.equal((RADAR_GOOGLE_COMPETITIVE_FIELDS as readonly string[]).includes("plannerBundle"), false);
});

/*
 * ======================= §15 · A UI DEPOIS DO FREEZE =======================
 *
 * O servidor recusa. §15 exige que a tela também não OFEREÇA — e o caso que ela
 * oferecia não era o óbvio: era o congelado que ficou desatualizado.
 */

const acaoBase = {
  contextReady: true, hasPrimaryQuery: true, running: false,
  mode: "WEB" as const, selected: 8, pending: 0, failed: 0, analyzed: 8,
};

test("W · congelada e com fundamento mudado não oferece 'Refazer Pesquisa'", () => {
  /*
   * ESTE É O BURACO QUE §15 FECHOU.
   *
   * `radarDeepResearchState` decide STALE ANTES de olhar `finalizedAt`, e a
   * Fase 1 respondia STALE com START_RESEARCH HABILITADO. Uma investigação
   * assinada cujo ArticleDNA mudou depois voltava a oferecer recoletar a SERP
   * — e recoletar reescreve a composição competitiva sob a fotografia.
   */
  const semTrava = radarPhase1Action({ ...acaoBase, state: "STALE" });
  assert.equal(semTrava.id, "START_RESEARCH", "sem congelamento, STALE continua oferecendo refazer");
  assert.equal(semTrava.enabled, true);

  const congelada = radarPhase1Action({ ...acaoBase, state: "STALE", finalized: true });
  assert.equal(congelada.id, "NONE", "congelada não oferece ação de pesquisa, nem desatualizada");
  assert.equal(congelada.enabled, false);
  assert.match(congelada.hint || "", /Zere a investiga/, "e a saída é nomeada: zerar");
  assert.equal(congelada.blockedReason, null, "não é bloqueio de contexto — é decisão tomada");
});

test("W.1 · a trava vem ANTES de STALE e de NOT_STARTED na autoridade", async () => {
  /*
   * A ORDEM É A GARANTIA, NÃO A EXISTÊNCIA DO `if`.
   *
   * Abaixo de STALE o mesmo código não muda nada: o caso já teria saído pelo
   * ramo habilitado. Um mutante que apenas MOVA o bloco precisa morrer aqui.
   */
  const fonte = semComentarios(await readFile(new URL("../lib/radar/serp-phase1.ts", import.meta.url), "utf8"));
  const trava = fonte.indexOf("if (input.finalized)");
  const naoIniciada = fonte.indexOf('input.state === "NOT_STARTED"');
  const desatualizada = fonte.indexOf('input.state === "STALE"');

  assert.ok(trava > 0, "a trava existe na autoridade da Fase 1");
  assert.ok(trava < desatualizada, "a trava decide antes de STALE");
  assert.ok(trava < naoIniciada, "e antes de NOT_STARTED");
});

test("X · a tela lê a MESMA autoridade que o servidor", async () => {
  /*
   * O servidor decide pela PRESENÇA do bundle (`radarGoogleResearchIsFinalized`).
   * Se a tela derivasse de outro sinal — o carimbo do registro, o fundamento —
   * ela ofereceria o botão que a rota recusa com 409.
   */
  const fonte = semComentarios(await readFile(new URL("../lib/radar/deep-research-view.ts", import.meta.url), "utf8"));
  assert.match(fonte, /finalized:\s*Boolean\(input\.finalizedBundle\)/, "a projeção alimenta a Fase 1 pelo bundle");

  /* E a autoridade do servidor decide pelo mesmo campo, não por outro. */
  assert.equal(radarGoogleResearchIsFinalized({ finalizedBundle: fotografia(["page-1"]) }), true);
  assert.equal(radarGoogleResearchIsFinalized({ finalizedAt: "2026-09-10T10:00:00.000Z" }), false,
    "carimbo sem bundle não é congelamento para nenhum dos dois lados");
});

test("Y · zerar continua sendo a porta, e ela destrava os dois lados", () => {
  /*
   * §5 · UM MECANISMO SÓ. O reset limpa `finalizedBundle`; com ele limpo, a
   * autoridade da tela volta a oferecer pesquisa e a trava do servidor libera
   * a escrita. Se o reset NÃO limpasse, a única saída exigiria a trava que a
   * impede — e a investigação ficaria presa para sempre.
   */
  const congelado = {
    ...googleAtivo(),
    serpDecisions: [{ key: "1", decision: "selected", reason: "comparável", note: "" }],
    finalizedBundle: fotografia(["page-1", "page-2"]),
  };
  /*
   * O PAYLOAD DO RESET É O REAL, não um objeto escrito à mão aqui: o que se
   * prova é que ZERAR limpa o bundle. Um reset que o preservasse deixaria a
   * versão nova nascer travada, e nenhuma escrita competitiva passaria mais.
   */
  const zerado = buildRadarResetPayload(congelado as unknown as RadarAnalysisPayload) as unknown as Record<string, unknown>;
  assert.equal(zerado.finalizedBundle, null, "zerar descarta a fotografia");
  assert.deepEqual(zerado.extractions, [], "e a amostra que ela descrevia");

  assert.equal(radarGoogleResearchWriteLock({ current: congelado, next: zerado }).allowed, true,
    "o servidor deixa a escrita que reabre passar");
  assert.equal(radarPhase1Action({ ...acaoBase, state: "NOT_STARTED", finalized: false }).enabled, true,
    "e a tela volta a oferecer pesquisa depois dela");
});

test("Z · a área Google não oferece extrair sobre a fotografia, e a leitura chega fechada", async () => {
  const fonte = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  /*
   * A condição da área virou uma const nomeada (`areaGoogle`) quando o
   * BLUEPRINT_1 passou a decidir por ela também onde a fronteira do Planejador
   * renderiza. A fatia é a mesma área; só o nome da porta mudou.
   */
  const inicio = fonte.indexOf("{areaGoogle && <>");
  const fim = fonte.indexOf("{writerHandoff && !areaGoogle && <WriterHandoff", inicio);
  assert.ok(inicio > 0 && fim > inicio, "a área do Google foi localizada");
  const area = fonte.slice(inicio, fim);

  /*
   * O ÚNICO DISPARO DE EXTRAÇÃO DAQUI É O BOTÃO DA FASE 1 — e ele só renderiza
   * quando existe ação. Congelada, `phase1` é NONE e nada é oferecido.
   */
  assert.match(area, /acao\.id !== "NONE" && <Phase1Button/, "o botão primário depende de haver ação");
  assert.equal(/<Phase1Button/.test(area.replace(/acao\.id !== "NONE" && <Phase1Button/, "")), false,
    "e não há um segundo lugar que o renderize sem a mesma condição");

  /* §15 · a saída continua oferecida: zerar/reabrir. */
  assert.match(area, /data-testid="radar-reset-investigation"/);
  assert.match(area, /view\.state !== "NOT_STARTED" && <button/, "zerar aparece quando há o que descartar");

  /* §15 · a fotografia tem endereço legível — o [Ver blueprint] da tela. */
  assert.match(area, /data-testid="radar-frozen-bundle"/);
  assert.match(area, /RadarCompetitiveBlueprintSection/, "o blueprint canônico é a leitura oferecida");

  /*
   * §13 · PROVENIÊNCIA E AMOSTRA CHEGAM FECHADAS.
   *
   * `<details>` sem `open` não monta o conteúdo interno até alguém pedir — é a
   * mesma disciplina do YouTube e da Amazon, pelo mecanismo nativo.
   */
  /*
   * O 2.4 quebrou a tag em várias linhas para pendurar o carregamento lazy.
   * A garantia deste teste é outra — nenhum `details` nasce aberto — e ela vale
   * igual numa tag de uma linha ou de dez. Achatar antes de olhar mantém a
   * asserção exigente em vez de afrouxá-la para caber na nova forma.
   */
  const emUmaLinha = area.replace(/\s+/g, " ");
  assert.ok(emUmaLinha.includes('data-testid="radar-technical-provenance"'), "a proveniência está na área");
  /* Nem `open` seco, nem `open={…}`: nenhum detalhe daqui nasce aberto. */
  assert.equal(/<details\s+open/.test(emUmaLinha), false, "nenhum details abre por atributo seco");
  assert.equal(/open=\{/.test(emUmaLinha), false, "nenhum details abre por prop");
});

test("sentinela · nenhuma ida ao servidor fora das leituras declaradas", () => {
  assert.deepEqual(idasAoServidor, []);
});
