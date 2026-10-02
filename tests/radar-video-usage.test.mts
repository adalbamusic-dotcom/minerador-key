import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_VIDEO_USAGES,
  RADAR_VIDEO_USAGE_ACTION_LABEL,
  radarVideoUsageOf,
  suggestRadarVideoUsage,
  withRadarArticleUsage,
  type RadarLibrarySource,
  type RadarVideoUsage,
} from "../lib/radar/video-library.ts";
import type { RadarVideoTextState } from "../lib/radar/video-text-acquisition.ts";
import { buildRadarVideoEvidenceLayer, type RadarVideoEvidenceLayer } from "../lib/radar/video-evidence.ts";
import {
  radarPortableVideoContext,
  radarVideoContextMarkdown,
  type RadarPortableVideoUsageInput,
} from "../lib/radar/portable-annex-context.ts";
import { buildRadarWritingExportArticle, type RadarWritingArticleContext } from "../lib/radar/portable-writing-export.ts";
import { buildRadarVideoExportArticle } from "../lib/radar/portable-video-export.ts";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintPrompt,
  radarSanitizeArticleBlueprint,
} from "../lib/radar/article-blueprint.ts";
import { readRadarArticleVideoUsages, readRadarVideoUsagesForExport } from "../lib/server/radar-video-usage-read.ts";
import { ARTIGO, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ===== VÍDEOS · MODOS DE USO NO ARTIGO (SDD diretriz editorial, Adendo B, D6 — 2026-10-02) =====
 *
 * O pedido do dono: "coloca igual que no Especialista (...) opções de adicionar
 * como contexto, sugestão, suporte entre outros, por que ele está muito rígido
 * com uma única opção". Cada vídeo SELECIONADO para o artigo ganha um modo —
 * Contexto, Sugestão de pauta, Apoio, Citação, Incorporar, Não usar — escolhido
 * por BOTÕES, como no Especialista.
 *
 * O QUE ESTA SUÍTE GUARDA:
 *
 *   A · o domínio: os seis modos são os do CHECK do banco; a camada do modo
 *       envolve a seleção sem mudá-la; a sugestão é derivada e nunca gravada;
 *   B · a leitura tolerante (coluna ausente = sem modos, nunca quebra);
 *   C · a rota: SET_USAGE é do artigo, só para selecionadas, com readback; e
 *       UNSELECT limpa o modo;
 *   D · o export: sem modo, byte a byte igual; "Não usar" some; cada modo vira
 *       a instrução certa nos dois CSVs e no artigo-modelo; o hash não muda;
 *   E · a tela: botões, estado do servidor, sugestão sem gravação.
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const ler = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComentarios = (fonte: string) => fonte.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ");

const fonte = (patch: Partial<RadarLibrarySource> & { id: string }): RadarLibrarySource => ({
  brandId: "marca-1", articleId: null, sourceKind: "YOUTUBE",
  originalUrl: `https://youtu.be/${patch.id}`, normalizedUrl: `https://www.youtube.com/watch?v=${patch.id}`,
  normalizedUrlHash: `ytv:${patch.id}`, youtubeVideoId: null, displayName: null,
  registrationStatus: "REGISTERED", registeredBy: null,
  registrationArticleDnaVersionId: null, registrationArticleDnaContentHash: null,
  textState: "TEXT_READY" as RadarVideoTextState, textStateReason: null,
  metadataFetchedAt: null, videoTitle: null, channelId: null, channelTitle: null,
  videoDescription: null, publishedAt: null, duration: null, thumbnails: null,
  uploadedMediaUri: null, uploadedMediaContentType: null, uploadedMediaAt: null,
  createdAt: "2026-10-02T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z",
  selectedForArticle: false, articleUsageCount: 0,
  ...patch,
} as RadarLibrarySource);

/* ============================ a camada de vídeo ============================ */

/** Um texto LONGO, para provar que a transcrição nunca vai inteira ao CSV. */
const FALA_LONGA = `No Instagram, quem segue a clínica quer ver o resultado antes de marcar. ${"A constância dos posts importa mais que o volume. ".repeat(60)}`;

const trecho = (videoSourceId: string, texto: string, startMs: number) => ({
  videoBriefId: "vb1", videoSourceId,
  segmentIndexes: [3, 4], startMs, endMs: startMs + 15000,
  originalText: texto, sourceLanguage: "pt-BR",
  reasonForRelevance: "Responde o que a pauta pediu.",
  matchedCriteria: ["Instagram traz pacientes"], answersTitle: true,
  matchedQuestions: [], matchedEntities: [],
  supportType: "COVERS_TOPIC" as const, confidence: 0.8, limitations: [],
  provenance: { processingVersion: 1, anchoredToSegments: true as const },
});

const camada = (): RadarVideoEvidenceLayer => buildRadarVideoEvidenceLayer({
  identity: {
    frozenBundleId: "fb1", frozenBundleHash: "sha256:fb1",
    matchingRunId: "run-1", inputFingerprint: "m4:vs-apoio@v1|vs-fora@v1",
    matcherVersion: 4, matchedAt: "2026-10-02T13:00:00.000Z",
  },
  briefs: [{
    briefId: "vb1", topic: "O Instagram traz pacientes?",
    narrativePurpose: "Mostrar o que converte no Instagram de uma clínica.",
    whatToLookFor: ["Instagram traz pacientes"],
    relatedSectionId: "sec-1", relatedSectionTitle: "Rotina de cuidados para pele oleosa",
    questions: [], entities: [], evidenceNeeded: "Fala da especialista.", priority: "HIGH",
  }],
  coverage: [{
    videoBriefId: "vb1", state: "SUPPORTED",
    reason: "Dois trechos respondem a pauta.",
    criteria: ["Instagram traz pacientes"], matchedCriteria: ["Instagram traz pacientes"], missingCriteria: [],
    usefulSourceIds: ["vs-apoio", "vs-fora"],
    extracts: [trecho("vs-apoio", FALA_LONGA, 62000), trecho("vs-fora", "Trecho de um vídeo que o dono não quer no artigo.", 5000)],
  }],
  sources: [
    { videoSourceId: "vs-apoio", displayName: "Palestra Instagram", languageCode: "pt-BR", processingVersion: 1 },
    { videoSourceId: "vs-fora", displayName: "Vídeo antigo", languageCode: "pt-BR", processingVersion: 1 },
  ],
});

const uso = (patch: Partial<RadarPortableVideoUsageInput> & { videoSourceId: string; usage: RadarVideoUsage }): RadarPortableVideoUsageInput => ({
  note: null, title: null, url: null, channel: null, duration: null, description: null, textPreview: null, ...patch,
});

const USOS: RadarPortableVideoUsageInput[] = [
  uso({ videoSourceId: "vs-apoio", usage: "SUPPORT", title: "Palestra Instagram", url: "https://www.youtube.com/watch?v=apoio000001" }),
  uso({ videoSourceId: "vs-fora", usage: "NOT_USED", title: "Vídeo antigo" }),
  uso({ videoSourceId: "vs-embed", usage: "EMBED", title: "Tour pela clínica", url: "https://www.youtube.com/watch?v=embed000001", note: "Abrir a seção com ele" }),
  uso({ videoSourceId: "vs-contexto", usage: "CONTEXT", title: "Bastidores do Instagram", url: "https://www.youtube.com/watch?v=ctx00000001", description: "Como a equipe planeja os stories da semana." }),
  uso({ videoSourceId: "vs-pauta", usage: "TOPIC_SUGGESTION", title: "Perguntas das pacientes", url: "https://www.youtube.com/watch?v=pauta000001", textPreview: "As pacientes perguntam se o Instagram substitui a consulta." }),
];

const CONTEXTO: RadarWritingArticleContext = { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null };

/* ================================ A · o domínio ================================ */

test("A · os seis modos são exatamente os do CHECK da migration, na mesma ordem", () => {
  const sql = ler("supabase/migrations/20261002120000_radar_artigo_modelo_e_uso_de_videos.sql");
  const check = sql.slice(sql.indexOf("usage IS NULL OR usage IN ("));
  const doBanco = [...check.slice(0, check.indexOf(")")).matchAll(/'([A-Z_]+)'/g)].map(item => item[1]);
  assert.deepEqual([...RADAR_VIDEO_USAGES], doBanco);
  assert.equal(radarVideoUsageOf("EMBED"), "EMBED");
  assert.equal(radarVideoUsageOf("embed"), null, "o banco grava em caixa alta; o resto é 'sem modo'");
  assert.equal(radarVideoUsageOf(null), null);
  /* Os botões são verbos, como no Especialista. */
  assert.deepEqual(Object.values(RADAR_VIDEO_USAGE_ACTION_LABEL), [
    "Usar como contexto", "Sugerir como pauta", "Usar como apoio", "Marcar citação", "Incorporar no artigo", "Não usar",
  ]);
});

test("A · a camada do modo envolve a seleção sem mudá-la, e leitura indisponível não cria chave", () => {
  const sobreposta = [
    fonte({ id: "a", selectedForArticle: true }),
    fonte({ id: "b", selectedForArticle: false }),
  ];
  const usos = new Map([["a", { usage: "QUOTE" as const, note: "minuto 3" }], ["b", { usage: "EMBED" as const, note: null }]]);

  /* Leitura indisponível (coluna ausente): a lista sai como estava, sem as chaves novas. */
  for (const resultado of [withRadarArticleUsage(sobreposta, null, "artigo-1"), withRadarArticleUsage(sobreposta, usos, null)]) {
    assert.deepEqual(resultado, sobreposta);
    assert.ok(resultado.every(item => !("articleUsage" in item)), "chave ausente diz 'não lido'");
  }

  const lida = withRadarArticleUsage(sobreposta, usos, "artigo-1");
  assert.equal(lida[0].articleUsage, "QUOTE");
  assert.equal(lida[0].articleUsageNote, "minuto 3");
  /* Só a SELECIONADA recebe modo: a outra não tem uso declarado neste artigo. */
  assert.ok(!("articleUsage" in lida[1]));
  /* Selecionada e lida, sem modo: `null`, não ausente. */
  const semModo = withRadarArticleUsage(sobreposta, new Map(), "artigo-1");
  assert.equal(semModo[0].articleUsage, null);
  /* A seleção e a contagem não mudaram. */
  assert.deepEqual(lida.map(item => [item.selectedForArticle, item.articleUsageCount]), sobreposta.map(item => [item.selectedForArticle, item.articleUsageCount]));
});

test("A · a sugestão vem do casamento, só para Apoio ou Contexto, e nunca sem casamento", () => {
  const cobertura = [{ extracts: [{ videoSourceId: "casou" }] }];
  const sel = (id: string, textState = "TEXT_READY") => ({ id, selectedForArticle: true, textState });
  assert.equal(suggestRadarVideoUsage({ source: sel("casou"), coverage: cobertura }), "SUPPORT");
  assert.equal(suggestRadarVideoUsage({ source: sel("leu-e-nao-casou"), coverage: cobertura }), "CONTEXT");
  assert.equal(suggestRadarVideoUsage({ source: sel("sem-texto", "QUEUED"), coverage: cobertura }), null);
  assert.equal(suggestRadarVideoUsage({ source: sel("casou"), coverage: null }), null, "sem casamento não há base para sugerir");
  assert.equal(suggestRadarVideoUsage({ source: { ...sel("casou"), selectedForArticle: false }, coverage: cobertura }), null);
});

/* ======================= B · a leitura tolerante ======================= */

type Resposta = { data?: unknown; error?: { code?: string; message: string } | null };
type Construtor = {
  select: (colunas: string) => Construtor;
  eq: (coluna: string, valor: unknown) => Construtor;
  in: (coluna: string, valores: unknown[]) => Construtor;
  order: (coluna: string, opcoes: unknown) => Construtor;
  then: (resolver: (valor: Resposta) => unknown, rejeitar?: (erro: unknown) => unknown) => Promise<unknown>;
};

function clienteFalso(respostas: Record<string, Resposta>) {
  const chamadas: Array<{ tabela: string; passos: string[] }> = [];
  const cliente = {
    from(tabela: string) {
      const registro = { tabela, passos: [] as string[] };
      chamadas.push(registro);
      const construtor: Construtor = {
        select: colunas => { registro.passos.push(`select:${colunas}`); return construtor; },
        eq: (coluna, valor) => { registro.passos.push(`eq:${coluna}=${String(valor)}`); return construtor; },
        in: (coluna, valores) => { registro.passos.push(`in:${coluna}=${valores.join("|")}`); return construtor; },
        order: coluna => { registro.passos.push(`order:${coluna}`); return construtor; },
        then: (resolver, rejeitar) => Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(resolver, rejeitar),
      };
      return construtor;
    },
  };
  return { cliente: cliente as never, chamadas };
}

test("B · coluna ausente (42703) ou falha: a tela segue sem modos, e nada quebra", async () => {
  const avisos = console.warn;
  console.warn = () => {};
  try {
    const ausente = clienteFalso({ radar_article_video_sources: { data: null, error: { code: "42703", message: "column radar_article_video_sources.usage does not exist" } } });
    assert.equal(await readRadarArticleVideoUsages(ausente.cliente, "marca-1", "artigo-1"), null);
    assert.deepEqual([...(await readRadarVideoUsagesForExport(ausente.cliente, "marca-1", ["artigo-1"])).entries()], []);

    const sem = clienteFalso({});
    assert.equal(await readRadarArticleVideoUsages(sem.cliente, "marca-1", null), null, "sem artigo não há modo a ler");
    assert.equal(sem.chamadas.length, 0, "e nenhuma consulta sai");
  } finally {
    console.warn = avisos;
  }

  const lida = clienteFalso({ radar_article_video_sources: { data: [{ video_source_id: "a", usage: "EMBED", usage_note: "  na seção 2 " }, { video_source_id: "b", usage: null, usage_note: null }], error: null } });
  const mapa = await readRadarArticleVideoUsages(lida.cliente, "marca-1", "artigo-1");
  assert.deepEqual([...(mapa || new Map()).entries()], [["a", { usage: "EMBED", note: "na seção 2" }], ["b", { usage: null, note: null }]]);
  /* A leitura é presa à marca, ao artigo e ao vínculo ativo. */
  assert.deepEqual(lida.chamadas[0].passos, ["select:video_source_id,usage,usage_note", "eq:brand_id=marca-1", "eq:article_id=artigo-1", "eq:status=ACTIVE"]);
});

test("B · o export lê o lote uma vez; sem modo nenhum, não lê mais nada", async () => {
  const sem = clienteFalso({ radar_article_video_sources: { data: [{ article_id: "artigo-1", video_source_id: "a", usage: null, usage_note: null }], error: null } });
  assert.equal((await readRadarVideoUsagesForExport(sem.cliente, "marca-1", ["artigo-1", "artigo-1"])).size, 0);
  assert.deepEqual(sem.chamadas.map(item => item.tabela), ["radar_article_video_sources"], "sem modo, nem metadado nem texto são lidos");

  const com = clienteFalso({
    radar_article_video_sources: { data: [
      { article_id: "artigo-1", video_source_id: "a", usage: "CONTEXT", usage_note: null },
      { article_id: "artigo-2", video_source_id: "b", usage: "EMBED", usage_note: "abrir com ele" },
    ], error: null },
    radar_video_sources: { data: [
      { id: "a", video_title: "Bastidores", display_name: null, normalized_url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", channel_title: "Clínica", video_description: null, duration: "PT10M" },
      { id: "b", video_title: null, display_name: "Tour", normalized_url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", channel_title: null, video_description: "Tour pela clínica.", duration: null },
    ], error: null },
    radar_video_source_texts: { data: [
      { id: "t-a-2", video_source_id: "a", transcript_text: `${"palavra ".repeat(400)}`, processing_version: 2 },
      { id: "t-a-1", video_source_id: "a", transcript_text: "versão antiga", processing_version: 1 },
    ], error: null },
  });
  const lote = await readRadarVideoUsagesForExport(com.cliente, "marca-1", ["artigo-1", "artigo-2"]);
  /*
   * 2026-10-02 · revisão da frente: o texto é lido em duas consultas — as
   * versões (sem texto) e, depois, só o texto da versão corrente de cada fonte.
   * Antes vinha `transcript_text` inteiro de todas as versões para guardar 600
   * caracteres; o teste travava a consulta única.
   */
  assert.deepEqual(com.chamadas.map(item => item.tabela), ["radar_article_video_sources", "radar_video_sources", "radar_video_source_texts", "radar_video_source_texts"]);
  assert.ok(com.chamadas[0].passos.includes("in:article_id=artigo-1|artigo-2"), "uma consulta para o lote, presa aos artigos pedidos");
  assert.ok(com.chamadas.every(item => item.passos.includes("eq:brand_id=marca-1")), "toda leitura presa à marca");
  /*
   * Prévia do texto: curta, e da versão corrente. 2026-10-02 · com ou sem
   * descrição (a descrição do YouTube é promocional: ela virou o último
   * recurso) — e, pedido do dono para o CSV de vídeo, de TODO vídeo com modo
   * (aqui "b", Incorporar, entra na leitura e não tem transcrição).
   */
  assert.ok(com.chamadas[2].passos.includes("in:video_source_id=a|b"));
  assert.ok(com.chamadas[2].passos.includes("select:id,video_source_id,processing_version"), "a primeira consulta não traz texto");
  assert.ok(com.chamadas[3].passos.includes("in:id=t-a-2"), "o texto só da maior versão");
  const contexto = lote.get("artigo-1")![0];
  assert.equal(contexto.title, "Bastidores");
  assert.ok(contexto.textPreview && contexto.textPreview.length <= 600 && !contexto.textPreview.includes("versão antiga"));
  const embed = lote.get("artigo-2")![0];
  assert.deepEqual({ usage: embed.usage, note: embed.note, title: embed.title, textPreview: embed.textPreview }, { usage: "EMBED", note: "abrir com ele", title: "Tour", textPreview: null });
});

test("B · a prévia: a maior versão de cada fonte, cortada cedo; sem versão legível, nada de texto", async () => {
  const com = clienteFalso({
    radar_article_video_sources: { data: [
      { article_id: "artigo-1", video_source_id: "a", usage: "SUPPORT", usage_note: null },
      { article_id: "artigo-1", video_source_id: "b", usage: "QUOTE", usage_note: null },
    ], error: null },
    radar_video_sources: { data: [{ id: "a", video_title: "A" }, { id: "b", video_title: "B" }], error: null },
    radar_video_source_texts: { data: [
      /* A ordem de chegada não decide: vale o maior número de versão. */
      { id: "t-a-1", video_source_id: "a", transcript_text: "versão um de a", processing_version: 1 },
      { id: "t-a-3", video_source_id: "a", transcript_text: `versão três de a ${"x".repeat(5_000)}`, processing_version: 3 },
      { id: "t-b-1", video_source_id: "b", transcript_text: "   ", processing_version: 1 },
    ], error: null },
  });
  const lote = await readRadarVideoUsagesForExport(com.cliente, "marca-1", ["artigo-1"]);
  assert.ok(com.chamadas[3].passos.includes("in:id=t-a-3|t-b-1"));
  const porId = new Map((lote.get("artigo-1") || []).map(item => [item.videoSourceId, item]));
  assert.ok(porId.get("a")!.textPreview!.startsWith("versão três de a"), "a corrente, nunca a antiga");
  assert.ok(porId.get("a")!.textPreview!.length <= 600, "cortada cedo");
  assert.equal(porId.get("b")!.textPreview, null, "texto em branco não vira prévia");

  /* Falha na leitura das versões: o export segue sem prévia, e nada quebra. */
  const avisos = console.warn;
  console.warn = () => {};
  try {
    const falha = clienteFalso({
      radar_article_video_sources: { data: [{ article_id: "artigo-1", video_source_id: "a", usage: "EMBED", usage_note: null }], error: null },
      radar_video_sources: { data: [{ id: "a", video_title: "A" }], error: null },
      radar_video_source_texts: { data: null, error: { message: "permission denied" } },
    });
    const semPrevia = await readRadarVideoUsagesForExport(falha.cliente, "marca-1", ["artigo-1"]);
    assert.equal(semPrevia.get("artigo-1")![0].textPreview, null);
    assert.equal(falha.chamadas.filter(item => item.tabela === "radar_video_source_texts").length, 1, "sem versões, o texto nem é pedido");
  } finally {
    console.warn = avisos;
  }
});

/* ============================== C · a rota ============================== */

test("C · SET_USAGE é do artigo, grava só nas selecionadas, com readback, entre PROCESS_SELECTED e ARCHIVE", () => {
  const rota = semComentarios(ler("app/api/editorial/radar-video-library/route.ts"));
  assert.match(rota, /const ACOES_DO_ARTIGO = \["SELECT", "UNSELECT", "PROCESS_SELECTED", "SET_USAGE"\] as const;/);
  assert.match(rota, /usage: z\.enum\(RADAR_VIDEO_USAGES\)\.nullable\(\)\.optional\(\)/);
  assert.match(rota, /usageNote: z\.string\(\)\.trim\(\)\.max\(RADAR_VIDEO_USAGE_NOTE_MAX\)\.nullable\(\)\.optional\(\)/);

  const inicio = rota.indexOf('if (action === "SET_USAGE")');
  assert.ok(inicio > rota.indexOf('if (action === "PROCESS_SELECTED")'), "depois de processar");
  assert.ok(inicio < rota.indexOf("const escopo = action === \"CLEAR_LIST\""), "antes de arquivar e limpar");
  const bloco = rota.slice(inicio, rota.indexOf("const escopo = action === \"CLEAR_LIST\""));
  /* Só as selecionadas neste artigo; o resto é recusado por item, com motivo. */
  /* A mesma fonte pedida duas vezes é uma fonte: o conjunto é deduplicado. */
  assert.match(bloco, /const aplicar = \[\.\.\.new Set\(alvos\)\]\.filter\(id => porId\.get\(id\)\?\.selectedForArticle\);/);
  assert.match(bloco, /não está selecionada neste artigo/);
  assert.match(bloco, /não está na biblioteca desta marca/);
  /* A escrita presa à marca, ao artigo e ao vínculo ativo, devolvendo o gravado. */
  assert.match(bloco, /\.from\("radar_article_video_sources"\)\s*\.update\(\{ usage, usage_note: usageNote \}\)\s*\.eq\("brand_id", context\.brandId\)\s*\.eq\("article_id", articleId\)\s*\.eq\("status", "ACTIVE"\)\s*\.in\("video_source_id", aplicar\)\s*\.select\("video_source_id,usage,usage_note"\)/);
  /* SUCESSO SÓ DEPOIS DO READBACK: o banco tem de devolver o que foi pedido. */
  assert.match(bloco, /radarVideoUsageOf\(linha\.usage\) === usage && \(linha\.usage_note \?\? null\) === usageNote/);
  assert.match(bloco, /if \(!aplicadas\.length\)/);
  /* Modo nulo limpa a nota junto. */
  assert.match(bloco, /const usageNote = usage \? \(parsed\.data\.usageNote\?\.trim\(\) \|\| null\) : null;/);
  /* O modo não toca fonte, texto, casamento nem pacote. */
  assert.equal(/radar_video_sources"|radar_video_source_texts|radar_video_matching|enqueue|\.delete\(/.test(bloco), false);
});

test("C · desmarcar limpa o modo e a nota no mesmo update — reselecionar não ressuscita modo", () => {
  const rota = semComentarios(ler("app/api/editorial/radar-video-library/route.ts"));
  const bloco = rota.slice(rota.indexOf('if (action === "UNSELECT"'), rota.indexOf("return NextResponse.json({ success: true, action, affected"));
  assert.match(bloco, /status: "REMOVED", removed_at: new Date\(\)\.toISOString\(\), \.\.\.\(comModo \? \{ usage: null, usage_note: null \} : \{\}\)/);
  assert.match(bloco, /let remocao = await remover\(true\);/, "a primeira tentativa limpa o modo");
  /* E só a coluna ausente justifica tentar sem ela. */
  assert.match(rota, /const colunaDeModoAusente = \(erro: \{ code\?: string \| null \}\) => erro\.code === "42703" \|\| erro\.code === "PGRST204";/);
});

test("C · as duas rotas põem o modo por cima da sobreposição, sem reimplementá-la", () => {
  for (const caminho of ["app/api/editorial/radar-video-sources/route.ts", "app/api/editorial/radar-video-library/route.ts"]) {
    const rota = semComentarios(ler(caminho));
    assert.match(rota, /const usos = await readRadarArticleVideoUsages\(context\.supabase, context\.brandId, articleId\);/, caminho);
    assert.match(rota, /return withRadarArticleUsage\(overlayRadarArticleSelection\(\{/, caminho);
    /* A consulta dos vínculos continua sem `usage`: se a coluna faltar, a lista não cai. */
    assert.equal(/select\("article_id,video_source_id(,status)?,usage/.test(rota), false, caminho);
  }
  /* RadarVideoSourceSchema é .strict(): o modo NÃO entra nele. */
  assert.equal(/articleUsage/.test(ler("lib/radar/video-source.ts")), false);
});

/* ============================== D · o export ============================== */

test("D · sem modo, a projeção é byte a byte a de antes; com modo, 'Não usar' some", () => {
  const antes = radarPortableVideoContext(camada());
  for (const sem of [radarPortableVideoContext(camada(), null), radarPortableVideoContext(camada(), [])]) {
    assert.equal(JSON.stringify(sem), JSON.stringify(antes));
  }
  assert.ok(!("selected" in antes));

  const com = radarPortableVideoContext(camada(), USOS);
  const trechos = com.briefs.flatMap(brief => brief.extracts);
  assert.deepEqual(trechos.map(item => item.sourceTitle), ["Palestra Instagram"], "o trecho do vídeo 'Não usar' sumiu");
  assert.equal(trechos[0].usage, "SUPPORT");
  assert.equal(trechos[0].sourceUrl, "https://www.youtube.com/watch?v=apoio000001");
  assert.deepEqual(com.sources.map(item => item.title), ["Palestra Instagram"]);
  assert.equal(com.summary.extracts, 1);
  assert.equal(com.summary.sources, 1);
  /* Os selecionados com modo, na ordem de quem escreve, e sem 'Não usar'. */
  assert.deepEqual(com.selected!.map(item => item.usage), ["EMBED", "SUPPORT", "TOPIC_SUGGESTION", "CONTEXT"]);
  const apoio = com.selected!.find(item => item.usage === "SUPPORT")!;
  assert.ok(apoio.excerpt && apoio.excerpt.text.length <= 400, "o trecho é curto, nunca a transcrição");
  assert.equal(apoio.excerpt.startLabel, "01:02");
  assert.equal(com.selected!.find(item => item.usage === "CONTEXT")!.excerpt, null, "Contexto não leva trecho citável");

  /* Só 'Não usar' casado: a pauta diz por quê, e não finge que nunca casou. */
  const soFora = radarPortableVideoContext(camada(), [uso({ videoSourceId: "vs-apoio", usage: "NOT_USED" }), uso({ videoSourceId: "vs-fora", usage: "NOT_USED" })]);
  assert.equal(soFora.state, "NO_MATCHING");
  assert.match(soFora.note, /"Não usar"/);
  assert.ok(!("selected" in soFora));

  /* A camada canônica (a do pacote congelado) não foi tocada. */
  const original = camada();
  radarPortableVideoContext(original, USOS);
  assert.deepEqual(original, camada());

  /* E o formato completo ganha o bloco dos modos. */
  assert.match(radarVideoContextMarkdown(com), /## Modo de uso escolhido no Radar \(decisão do dono\)/);
  assert.doesNotMatch(radarVideoContextMarkdown(antes), /Modo de uso/);
});

test("D · o CSV 'para escrever': cada modo vira a instrução certa, sem transcrição", () => {
  const semModo = buildRadarWritingExportArticle(entradaGoogle({ videoContext: radarPortableVideoContext(camada()) }), CONTEXTO).row;
  const vazio = buildRadarWritingExportArticle(entradaGoogle({ videoContext: radarPortableVideoContext(camada(), []) }), CONTEXTO).row;
  assert.deepEqual(vazio, semModo, "sem modo, a linha é a de antes");

  const linha = buildRadarWritingExportArticle(entradaGoogle({ videoContext: radarPortableVideoContext(camada(), USOS) }), CONTEXTO).row;
  const fontes = linha.fontes_e_especialista;
  /*
   * 2026-10-02 · pedido do dono: o bloco virou "Vídeos selecionados pela marca"
   * (o vídeo pode ser de outro canal) e cada linha diz o canal — ou que ele não
   * está registrado na biblioteca, como nestes fixtures sem canal.
   */
  assert.match(fontes, /Vídeos selecionados pela marca \(modo de uso escolhido no Radar, decisão do dono; conferir no vídeo e atribuir ao canal\):/);
  assert.doesNotMatch(fontes, /Vídeos da marca com modo de uso/);
  assert.match(fontes, /Incorporar no artigo · "Tour pela clínica" \(https:\/\/www\.youtube\.com\/watch\?v=embed000001\) · canal não registrado na biblioteca — o vídeo entra incorporado no artigo, na seção indicada/);
  assert.match(fontes, /Nota do dono: Abrir a seção com ele/);
  assert.match(fontes, /Apoio · "Palestra Instagram"[^\n]*\(01:02–01:17\) "No Instagram, quem segue/);
  assert.match(fontes, /Contexto · "Bastidores do Instagram"[^\n]*ler para entender o assunto, não citar/);
  assert.match(fontes, /Sugestão de pauta · "Perguntas das pacientes"[^\n]*ideia de seção ou pergunta a validar/);
  assert.doesNotMatch(fontes, /Vídeo antigo/, "'Não usar' não entra");
  assert.ok(!fontes.includes(FALA_LONGA.trim()), "a transcrição inteira nunca vai à célula");
  assert.ok(fontes.length <= 6000);
  /* O trecho V do texto leva o modo dele. */
  assert.match(fontes, /V1 · "Palestra Instagram"[^\n]* · Apoio: o trecho sustenta o ponto, atribuído ao vídeo e com o tempo/);
});

test("D · o CSV de vídeo lista os modos mesmo sem casamento", () => {
  const semCasamento = radarPortableVideoContext(null, USOS);
  assert.equal(semCasamento.state, "NO_LIBRARY");
  const linha = buildRadarVideoExportArticle(entradaGoogle({ videoContext: semCasamento }), { position: 1, youtube: null }).row;
  /* 2026-10-02 · o cabeçalho do bloco é "Vídeos selecionados pela marca", o mesmo do CSV para escrever. */
  /* 2026-10-02 · sem casamento, a coluna diz que falta o casamento — não que nada foi selecionado. */
  assert.match(linha.biblioteca_da_marca, /Nenhum trecho casado com as pautas ainda \(o casamento confere a fala do vídeo contra cada pauta\)\. Os vídeos que a marca selecionou, cada um com o trecho candidato:/);
  assert.match(linha.biblioteca_da_marca, /Incorporar no artigo · "Tour pela clínica"/);
  assert.match(linha.biblioteca_da_marca, /Contexto · "Bastidores do Instagram"/);

  const antes = buildRadarVideoExportArticle(entradaGoogle({ videoContext: radarPortableVideoContext(null) }), { position: 1, youtube: null }).row;
  assert.doesNotMatch(antes.biblioteca_da_marca, /Modo de uso|Vídeos selecionados pela marca/, "sem modo, a coluna é a de antes");
});

test("D · o artigo-modelo recebe o modo, a regra só aparece com modo, e Contexto não vira vídeo de seção", () => {
  const semModo = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ videoContext: radarPortableVideoContext(camada()) }), silo: null, articleId: ARTIGO, publication: null });
  assert.ok(semModo.videos.every(item => !("usage" in item)));
  assert.doesNotMatch(radarArticleBlueprintPrompt(semModo).system, /VÍDEOS DA MARCA/, "sem modo, o pedido é o de antes");

  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ videoContext: radarPortableVideoContext(camada(), USOS) }), silo: null, articleId: ARTIGO, publication: null });
  assert.deepEqual(brief.videos.map(item => item.usage), ["SUPPORT", "EMBED", "SUPPORT", "TOPIC_SUGGESTION", "CONTEXT"]);
  assert.ok(brief.videos.every(item => !/Vídeo antigo/.test(item.text)), "'Não usar' não chega à IA");
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /13\. VÍDEOS DA MARCA[^\n]*Incorporar: o vídeo pode virar uma seção[^\n]*Contexto: só para entender o assunto; NÃO é citável/);
  assert.match(user, /modo: Incorporar no artigo/);

  const contexto = brief.videos.find(item => item.usage === "CONTEXT")!.id;
  const embed = brief.videos.find(item => item.usage === "EMBED")!.id;
  const secao = (h2: string, video: string | null) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta.", paragraphs: 2, video });
  const ia = RadarArticleBlueprintAiSchema.parse({
    keywordPlan: { reading: "Leitura." }, reader: "Leitor.", promise: "Promessa.", angle: { statement: "Ângulo." },
    title: { h1: "Um H1 próprio", seoTitle: "SEO", metaDescription: "Meta." },
    opening: { readerQuestion: "Qual a dúvida?", direction: "Responder." },
    sections: [secao("Primeira", embed), secao("Segunda", contexto), secao("Terceira", "V99")],
    closing: { turn: "Virada.", cta: "CTA." },
    visual: [{ slot: "CAPA", concept: "c", prompt: "p", alt: "a", caption: "l" }],
  });
  const { payload, notes } = radarSanitizeArticleBlueprint(ia, brief);
  assert.deepEqual(payload.blueprint.sections.map(item => item.video), [embed, null, null]);
  assert.ok(notes.some(nota => /Contexto \(não citável\)/.test(nota)));
});

/*
 * 2026-10-02 · ACHADO DO REVISOR: o V da seção do artigo-modelo é o do PEDIDO à
 * IA (trechos de todas as pautas, depois os vídeos com modo), não o da coluna
 * de fontes do CSV — e o modo é lido ao vivo, fora do hash. O CSV imprimia
 * "Vídeo da marca: V2" sem resolver: o Incorporar nunca ficava ligado à seção,
 * e um "Não usar" depois da aprovação fazia o V apontar para nada ou para OUTRO
 * vídeo. O payload ganhou o retrato dos V (aditivo) e o export resolve contra
 * o modo vigente.
 */
const planoDaIa = (videoDaPrimeira: string | null) => RadarArticleBlueprintAiSchema.parse({
  keywordPlan: { reading: "Leitura." }, reader: "Leitor.", promise: "Promessa.", angle: { statement: "Ângulo." },
  title: { h1: "Um H1 próprio", seoTitle: "SEO", metaDescription: "Meta." },
  opening: { readerQuestion: "Qual a dúvida?", direction: "Responder." },
  sections: ["Primeira", "Segunda", "Terceira"].map((h2, indice) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta.", paragraphs: 2, video: indice === 0 ? videoDaPrimeira : null })),
  closing: { turn: "Virada.", cta: "CTA." },
  visual: [{ slot: "CAPA", concept: "c", prompt: "p", alt: "a", caption: "l" }],
});
const linhasDeVideo = (celula: string) => celula.split("\n").filter(linha => /Vídeo da marca/.test(linha));

test("D · o vídeo da seção do artigo-modelo sai resolvido no CSV e segue o modo vigente", () => {
  const semModo = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ videoContext: radarPortableVideoContext(camada()) }), silo: null, articleId: ARTIGO, publication: null });
  /* O retrato: o que a IA viu, sem o id da fonte. */
  const plano = (video: string) => radarSanitizeArticleBlueprint(planoDaIa(video), semModo).payload;
  assert.deepEqual(plano("V1").videos, [
    { id: "V1", title: "Palestra Instagram", url: null, usage: null },
    { id: "V2", title: "Vídeo antigo", url: null, usage: null },
  ]);
  assert.ok(!JSON.stringify(plano("V1").videos).includes("vs-"), "o id da fonte não vai ao payload");
  const exportar = (payload: ReturnType<typeof plano>, usos: RadarPortableVideoUsageInput[] | null) =>
    buildRadarWritingExportArticle(entradaGoogle({ videoContext: radarPortableVideoContext(camada(), usos) }), { ...CONTEXTO, blueprint: payload }).row;

  /* Sem modo: o vídeo do plano é nomeado e ligado ao V desta coluna de fontes. */
  assert.deepEqual(linhasDeVideo(exportar(plano("V1"), null).estrutura), ['- Vídeo da marca: "Palestra Instagram" · trecho na coluna de fontes: V1']);

  /* Sonda 1 do revisor: plano em V2 (Vídeo antigo), marcado "Não usar" depois — o CSV avisa, não manda usar. */
  const fora = exportar(plano("V2"), [uso({ videoSourceId: "vs-fora", usage: "NOT_USED" })]);
  assert.deepEqual(linhasDeVideo(fora.estrutura), ['- Vídeo da marca: "Vídeo antigo" — não está mais entre os vídeos deste artigo no Radar (marcado "Não usar" ou retirado depois da aprovação): não usar nesta seção']);
  assert.doesNotMatch(fora.estrutura, /Vídeo da marca: V\d/);

  /* Sonda 2: plano em V1 (Palestra), Palestra marcada "Não usar" — o V1 das fontes agora é OUTRO vídeo, e o plano não aponta para ele. */
  const trocado = exportar(plano("V1"), [uso({ videoSourceId: "vs-apoio", usage: "NOT_USED" })]);
  assert.match(trocado.fontes_e_especialista, /V1 · "Vídeo antigo"/);
  assert.deepEqual(linhasDeVideo(trocado.estrutura), ['- Vídeo da marca: "Palestra Instagram" — não está mais entre os vídeos deste artigo no Radar (marcado "Não usar" ou retirado depois da aprovação): não usar nesta seção']);
  assert.doesNotMatch(trocado.estrutura, /Vídeo antigo/);

  /* Modo trocado depois da aprovação: Contexto não é citável e sai da seção; Apoio vale e é dito. */
  assert.deepEqual(linhasDeVideo(exportar(plano("V1"), [uso({ videoSourceId: "vs-apoio", usage: "CONTEXT", title: "Palestra Instagram" })]).estrutura),
    ['- Vídeo da marca: "Palestra Instagram" — passou a Contexto no Radar depois da aprovação: não é citável e não entra nesta seção']);
  const apoio = exportar(plano("V1"), USOS);
  assert.deepEqual(linhasDeVideo(apoio.estrutura), ['- Vídeo da marca: "Palestra Instagram" (https://www.youtube.com/watch?v=apoio000001) · Apoio (modo atual no Radar) · trecho na coluna de fontes: V1']);
  /* E o bloco dos modos diz a seção do plano para o Apoio. */
  assert.match(apoio.fontes_e_especialista, /Apoio · "Palestra Instagram"[^\n]*· seção do artigo-modelo "Primeira"/);

  /* Versão sem retrato (gerada antes): a linha de antes, sem inventar. */
  const antiga = { ...plano("V2") };
  delete antiga.videos;
  assert.deepEqual(linhasDeVideo(exportar(antiga, null).estrutura), ["- Vídeo da marca: V2"]);
  assert.match(exportar(antiga, USOS).fontes_e_especialista, /Incorporar no artigo · "Tour pela clínica"[^\n]*· seção: a que o vídeo responde \(definir no artigo-modelo\)/);

  /* Sem vídeo no pedido, o payload não ganha a chave. */
  const semVideo = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ videoContext: radarPortableVideoContext(null) }), silo: null, articleId: ARTIGO, publication: null });
  assert.ok(!("videos" in radarSanitizeArticleBlueprint(planoDaIa(null), semVideo).payload));
});

test("D · Incorporar: a seção que o artigo-modelo aprovado escolheu chega ao bloco dos modos (sonda 3 do revisor)", () => {
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ videoContext: radarPortableVideoContext(camada(), USOS) }), silo: null, articleId: ARTIGO, publication: null });
  const embed = brief.videos.find(item => item.usage === "EMBED")!;
  assert.equal(embed.title, "Tour pela clínica");
  const exportar = (video: string | null) => buildRadarWritingExportArticle(
    entradaGoogle({ videoContext: radarPortableVideoContext(camada(), USOS) }),
    { ...CONTEXTO, blueprint: radarSanitizeArticleBlueprint(planoDaIa(video), brief).payload },
  ).row;

  const comPlano = exportar(embed.id);
  assert.deepEqual(linhasDeVideo(comPlano.estrutura), ['- Vídeo da marca: "Tour pela clínica" (https://www.youtube.com/watch?v=embed000001) · Incorporar no artigo']);
  assert.match(comPlano.fontes_e_especialista, /Incorporar no artigo · "Tour pela clínica"[^\n]*· seção do artigo-modelo "Primeira"/);
  assert.doesNotMatch(comPlano.fontes_e_especialista, /definir no artigo-modelo/, "o bloco não devolve a decisão ao artigo-modelo já aprovado");

  /* O plano aprovado não pôs o vídeo em seção: o CSV diz isso, em vez de "definir no artigo-modelo". */
  const semSecao = exportar(null);
  assert.match(semSecao.fontes_e_especialista, /Incorporar no artigo · "Tour pela clínica"[^\n]*· seção: a que o vídeo responde \(o artigo-modelo não indicou\)/);

  /* Sem artigo-modelo, a linha é exatamente a de antes. */
  const semPlano = buildRadarWritingExportArticle(entradaGoogle({ videoContext: radarPortableVideoContext(camada(), USOS) }), CONTEXTO).row;
  assert.match(semPlano.fontes_e_especialista, /· seção: a que o vídeo responde \(definir no artigo-modelo\)/);
  assert.doesNotMatch(semPlano.fontes_e_especialista, /artigo-modelo aprovado/);
});

test("D · o modo não entra no pacote nem no hash: o núcleo lê ao vivo e só muda a projeção", () => {
  const nucleo = semComentarios(ler("lib/server/radar-portable-export-core.ts"));
  assert.match(nucleo, /const usosDeVideo = await readRadarVideoUsagesForExport\(input\.supabase as never, input\.brandId, input\.articleIds\);/);
  assert.match(nucleo, /radarPortableVideoContext\(bundle\.video, usosDoArtigo\)/);
  /* A chamada de sempre continua para quem não tem modo (paridade com o Planejador). */
  assert.match(nucleo, /: radarPortableVideoContext\(bundle\.video\);/);
  assert.equal(/bundle\.video\s*=|usage/.test(nucleo.slice(nucleo.indexOf("resolveRadarCanonicalDossier({"), nucleo.indexOf("const videoContext"))), false, "o modo não chega à resolução canônica");
  const leitor = semComentarios(ler("lib/server/radar-video-usage-read.ts"));
  assert.equal(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(leitor), false, "o leitor só lê");
});

/* ============================== E · a tela ============================== */

const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
type VistaDeVideos = Parameters<typeof RadarR3VideosPanel>[0]["videoSources"];

const vista = (sources: RadarLibrarySource[], patch: Partial<NonNullable<VistaDeVideos>> = {}): VistaDeVideos => ({
  sources, texts: [], briefs: [], coverage: null, matching: false, investigationFinalized: false, frozenBriefCount: 0, briefsUnavailableReason: "sem investigação neste fixture",
  loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
  ...patch,
});

const painel = (articleId: string | null, sources: RadarLibrarySource[], onLibraryAction: (...args: unknown[]) => void, patch: Partial<NonNullable<VistaDeVideos>> = {}) =>
  comProductShell(React.createElement(RadarR3VideosPanel, { articleId, videoSources: vista(sources, patch), onLibraryAction } as never));

test("E · cada vídeo selecionado ganha os seis BOTÕES do Especialista, e o clique pede SET_USAGE", async () => {
  const tela = await montarRadar();
  const acoes: unknown[][] = [];
  await tela.render(painel("artigo-1", [fonte({ id: "palestra", displayName: "Palestra", selectedForArticle: true, articleUsageCount: 1, articleUsage: null })], (...args) => acoes.push(args)));

  const grupo = tela.get("radar-videos-usage-palestra");
  assert.equal(grupo.getAttribute("role"), "group");
  assert.equal(grupo.querySelector("select"), null, "o seletor saiu: são botões");
  assert.deepEqual(RADAR_VIDEO_USAGES.map(modo => tela.get(`radar-videos-usage-palestra-${modo}`).textContent), [
    "Usar como contexto", "Sugerir como pauta", "Usar como apoio", "Marcar citação", "Incorporar no artigo", "Não usar",
  ]);
  for (const modo of RADAR_VIDEO_USAGES) {
    const botao = tela.get(`radar-videos-usage-palestra-${modo}`);
    assert.equal(botao.getAttribute("aria-pressed"), "false");
    assert.match(botao.className, /min-h-10/);
    assert.match(botao.className, /text-sm/);
  }
  assert.equal(tela.query("radar-videos-usage-badge-palestra"), null, "sem modo, sem selo");
  assert.equal(acoes.length, 0, "abrir a tela não grava nada");

  await tela.click("radar-videos-usage-palestra-EMBED");
  assert.deepEqual(acoes, [["artigo-1", "SET_USAGE", ["palestra"], { usage: "EMBED", usageNote: null }]]);
  /* O estado exibido é o do servidor: o clique não marca o botão sozinho. */
  assert.equal(tela.get("radar-videos-usage-palestra-EMBED").getAttribute("aria-pressed"), "false");
  tela.destroy();
});

test("E · o modo gravado fica marcado, com selo; clicar de novo ou 'Limpar modo' limpa", async () => {
  const tela = await montarRadar();
  const acoes: unknown[][] = [];
  await tela.render(painel("artigo-1", [fonte({ id: "palestra", selectedForArticle: true, articleUsageCount: 1, articleUsage: "QUOTE", articleUsageNote: "minuto 3" })], (...args) => acoes.push(args)));

  const ativo = tela.get("radar-videos-usage-palestra-QUOTE");
  assert.equal(ativo.getAttribute("aria-pressed"), "true");
  assert.match(ativo.className, /border-context-accent/);
  assert.match(ativo.className, /bg-selected/);
  assert.equal(tela.get("radar-videos-usage-badge-palestra").textContent, "Citação");
  assert.match(tela.get("radar-videos-usage-hint-palestra").textContent || "", /fala literal entre aspas/);
  assert.equal((tela.get("radar-videos-usage-note-palestra") as HTMLInputElement).value, "minuto 3");

  /* Trocar de modo mantém a nota gravada. */
  await tela.click("radar-videos-usage-palestra-SUPPORT");
  assert.deepEqual(acoes.at(-1), ["artigo-1", "SET_USAGE", ["palestra"], { usage: "SUPPORT", usageNote: "minuto 3" }]);
  /* Clicar no ativo limpa o modo e a nota. */
  await tela.click(ativo);
  assert.deepEqual(acoes.at(-1), ["artigo-1", "SET_USAGE", ["palestra"], { usage: null, usageNote: null }]);
  await tela.click("radar-videos-usage-clear-palestra");
  assert.deepEqual(acoes.at(-1), ["artigo-1", "SET_USAGE", ["palestra"], { usage: null, usageNote: null }]);

  /* A nota só grava no clique de salvar. */
  await tela.type(tela.get("radar-videos-usage-note-palestra"), "parte sobre o Instagram");
  const antes = acoes.length;
  await tela.click("radar-videos-usage-note-save-palestra");
  assert.equal(acoes.length, antes + 1);
  assert.deepEqual(acoes.at(-1), ["artigo-1", "SET_USAGE", ["palestra"], { usage: "QUOTE", usageNote: "parte sobre o Instagram" }]);
  tela.destroy();
});

test("E · a sugestão do casamento é dita e destacada, e nada é gravado sem clique", async () => {
  const tela = await montarRadar();
  const acoes: unknown[][] = [];
  const cobertura = [{
    videoBriefId: "vb1", state: "SUPPORTED" as const, reason: "ok", criteria: [], matchedCriteria: [], missingCriteria: [],
    usefulSourceIds: ["casou"], extracts: [trecho("casou", "Fala.", 1000)],
  }];
  await tela.render(painel("artigo-1", [
    fonte({ id: "casou", selectedForArticle: true, articleUsageCount: 1, articleUsage: null }),
    fonte({ id: "so-leu", selectedForArticle: true, articleUsageCount: 1, articleUsage: null }),
  ], (...args) => acoes.push(args), { coverage: cobertura }));

  assert.match(tela.get("radar-videos-usage-hint-casou").textContent || "", /^Sugerido: Apoio — .*Nada é gravado até você clicar\./);
  const sugerido = tela.get("radar-videos-usage-casou-SUPPORT");
  assert.equal(sugerido.getAttribute("data-suggested"), "true");
  assert.equal(sugerido.getAttribute("aria-pressed"), "false", "sugestão não é modo");
  assert.match(sugerido.className, /border-dashed/);
  assert.match(tela.get("radar-videos-usage-hint-so-leu").textContent || "", /^Sugerido: Contexto/);
  assert.equal(acoes.length, 0, "a sugestão nunca grava sozinha");

  await tela.click(sugerido);
  assert.deepEqual(acoes, [["artigo-1", "SET_USAGE", ["casou"], { usage: "SUPPORT", usageNote: null }]]);
  tela.destroy();
});

test("E · sem seleção, sem artigo ou sem leitura do modo, os botões não aparecem", async () => {
  const tela = await montarRadar();
  await tela.render(painel("artigo-1", [
    fonte({ id: "solta", selectedForArticle: false }),
    fonte({ id: "sem-leitura", selectedForArticle: true, articleUsageCount: 1 }),
  ], () => {}));
  assert.equal(tela.query("radar-videos-usage-solta"), null, "fonte não selecionada não tem modo");
  assert.equal(tela.query("radar-videos-usage-sem-leitura"), null, "chave ausente: o servidor não leu o modo");

  await tela.render(painel(null, [fonte({ id: "marca", selectedForArticle: true, articleUsage: null })], () => {}));
  assert.equal(tela.query("radar-videos-usage-marca"), null, "sem artigo não há uso a declarar");
  tela.destroy();
});

test("E · a página manda o modo para a rota da biblioteca e relê a área", () => {
  const pagina = ler("modules/radar/radar-page.tsx");
  const acao = pagina.slice(pagina.indexOf("const runVideoLibraryAction = useCallback"), pagina.indexOf("const runVideoMatching"));
  assert.match(acao, /action: "SELECT" \| "UNSELECT" \| "PROCESS_SELECTED" \| "SET_USAGE" \| "ARCHIVE" \| "CLEAR_LIST",/);
  assert.match(acao, /options\?: \{ usage: RadarVideoUsage \| null; usageNote\?: string \| null \},/);
  assert.match(acao, /\.\.\.\(action === "SET_USAGE" \? \{ usage: options\?\.usage \?\? null, usageNote: options\?\.usageNote \?\? null \} : \{\}\),/);
  assert.match(acao, /leituraDeVideos\.refresh\(\);/);
  const workbench = ler("modules/radar/radar-r3-workbench.tsx");
  assert.match(workbench, /"SET_USAGE" \| "ARCHIVE" \| "CLEAR_LIST", videoSourceIds: string\[\], options\?: \{ usage: RadarVideoUsage \| null; usageNote\?: string \| null \}\) => void;/);
});

/* ============================== a sentinela ============================== */

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
