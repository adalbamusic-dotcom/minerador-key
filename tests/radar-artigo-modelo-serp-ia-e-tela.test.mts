import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildRadarArticleBlueprintBrief } from "../lib/radar/article-blueprint.ts";
import { requestRadarArticleBlueprintAi, RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS } from "../lib/server/radar-article-blueprint.ts";
import { StructuredAIError } from "../lib/server/structured-ai.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import {
  RadarArticleBlueprintPanel,
  organizeRadarArticleBlueprintsInSeries,
  postRadarArticleBlueprintOrganize,
  radarArticleBlueprintCallsLabel,
  radarArticleBlueprintPanelChoice,
  radarArticleBlueprintPanelStateLabel,
  radarArticleBlueprintSeriesSummary,
  radarPhase1WithArticleBlueprint,
  type RadarArticleBlueprintJob,
} from "../modules/radar/radar-article-blueprint-panel.tsx";
import { radarArticleBlueprintExportChoice } from "../lib/server/radar-article-blueprint-read.ts";
import { ARTIGO, entradaGoogle, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== O ARTIGO-MODELO DA SERP: A CHAMADA DE IA E A TELA — 2026-10-02 =====
 *
 * A primeira tentativa real falhou com "A IA retornou JSON invalido": a resposta
 * veio cortada pelo teto. Aqui o provider é um `fetch` FALSO que devolve o
 * envelope do DeepSeek — nenhuma chamada paga. Prova-se:
 *
 *   - o pedido vai sem modo de raciocínio e com o teto declarado;
 *   - resposta cortada ganha UMA nova tentativa, com saída curta, e fica dito;
 *   - duas falhas viram frase clara, nunca "JSON invalido";
 *   - falha que não é de corte ou formato não se repete;
 *   - finalizar → organizar: em série, um por vez, depois do readback, sem
 *     desfazer o finalizar; o botão diz a chamada de IA;
 *   - o painel mora na Pesquisa, logo abaixo do modelo da SERP.
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

const PROVEDOR = {
  provider: "deepseek" as const,
  apiKey: "fixture-sem-valor",
  apiUrl: "https://api.deepseek.com/chat/completions" as const,
  model: "deepseek-v4-pro" as const,
  extraHeaders: {},
  thinkingMode: "provider_default" as const,
};

const brief = () => buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null });

function respostaValida() {
  const b = brief();
  const origem = b.skeleton.length ? b.skeleton.map(item => item.id) : [b.evidence[0].id];
  const secao = (h2: string, indice: number) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: [origem[indice % origem.length]] });
  return {
    keywordPlan: { reading: "A principal no H1." },
    reader: "Leitor.", promise: "Promessa.", angle: { statement: "Ângulo." },
    title: { h1: "Skincare facial: a rotina que funciona", seoTitle: "Skincare facial", metaDescription: "Meta." },
    opening: { readerQuestion: "Como montar uma rotina de skincare facial?", direction: "Responder." },
    sections: ["Limpeza", "Hidratação", "Proteção solar"].map(secao),
    closing: { turn: "Virada.", cta: "CTA." },
    visual: [{ slot: "CAPA", prompt: "pia" }, { slot: "R1", prompt: "espuma" }, { slot: "R2", prompt: "frasco" }],
  };
}

const envelope = (content: string, finishReason = "stop", status = 200) =>
  new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content } }], usage: { completion_tokens: 900 } }), { status, headers: { "content-type": "application/json" } });

function provedorFalso(respostas: Array<() => Response>) {
  const pedidos: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body)));
    const proxima = respostas.shift();
    if (!proxima) throw new Error("chamada a mais do que o teste previu");
    return proxima();
  }) as typeof fetch;
  return { pedidos, fetchImpl };
}

async function semAvisos<T>(trabalho: () => Promise<T>): Promise<{ valor: T | null; erro: unknown; avisos: unknown[][] }> {
  const avisos: unknown[][] = [];
  const original = console.warn;
  const originalErro = console.error;
  console.warn = (...args: unknown[]) => { avisos.push(args); };
  console.error = () => {};
  try {
    return { valor: await trabalho(), erro: null, avisos };
  } catch (erro) {
    return { valor: null, erro, avisos };
  } finally {
    console.warn = original;
    console.error = originalErro;
  }
}

/* ============================== a chamada de IA ============================== */

test("a resposta inteira na primeira: 1 chamada, sem raciocínio, com o teto declarado", async () => {
  const { pedidos, fetchImpl } = provedorFalso([() => envelope(JSON.stringify(respostaValida()))]);
  const { valor, erro } = await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl }));
  assert.equal(erro, null);
  assert.equal(valor!.calls, 1);
  assert.deepEqual(valor!.notes, []);
  assert.equal(pedidos.length, 1);
  assert.deepEqual(pedidos[0].thinking, { type: "disabled" }, "sem modo de raciocínio: ele consome o mesmo teto");
  assert.equal(pedidos[0].max_tokens, 8000);
  assert.ok(RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS.first + RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS.retry < 300_000, "as duas tentativas cabem no teto da rota");
});

test("resposta cortada (finish_reason length): UMA nova tentativa, com saída curta, registrada", async () => {
  const cortada = JSON.stringify(respostaValida()).slice(0, 180);
  const { pedidos, fetchImpl } = provedorFalso([() => envelope(cortada, "length"), () => envelope(JSON.stringify(respostaValida()))]);
  const { valor, erro, avisos } = await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), articleId: "artigo-1", fetchImpl }));
  assert.equal(erro, null);
  assert.equal(valor!.calls, 2);
  assert.equal(pedidos.length, 2);
  const sistema = (pedido: Record<string, unknown>) => String((pedido.messages as Array<{ role: string; content: string }>)[0].content);
  assert.doesNotMatch(sistema(pedidos[0]), /SAÍDA CURTA/);
  assert.match(sistema(pedidos[1]), /SAÍDA CURTA \(a resposta anterior veio cortada ou fora do formato\)/);
  assert.match(valor!.notes[0], /^A primeira resposta da IA veio cortada \(passou do tamanho máximo\); o servidor fez 1 nova tentativa pedindo saída mais curta \(2 chamadas de IA nesta organização\)\.$/);
  const log = avisos.find(item => item[0] === "[radar-article-blueprint] nova_tentativa");
  assert.ok(log, "o log diz a nova tentativa");
  assert.deepEqual(log![1], { articleId: "artigo-1", motivo: "CUT", finishReason: "length", code: "AI_OUTPUT_INVALID", chamadasDeIa: 2 });
});

test("cortada duas vezes: erro claro para a tela, nunca 'JSON invalido' cru, e nenhuma terceira chamada", async () => {
  const cortada = JSON.stringify(respostaValida()).slice(0, 120);
  const { pedidos, fetchImpl } = provedorFalso([() => envelope(cortada, "length"), () => envelope(cortada, "length")]);
  const { erro } = await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl }));
  assert.equal(pedidos.length, 2);
  assert.ok(erro instanceof StructuredAIError);
  assert.equal((erro as StructuredAIError).code, "AI_OUTPUT_INVALID");
  assert.match((erro as Error).message, /^A resposta da IA veio cortada \(passou do tamanho máximo\), mesmo depois de 1 nova tentativa com saída mais curta\. Tente de novo; a investigação continua finalizada\.$/);
  assert.doesNotMatch((erro as Error).message, /JSON/);
});

test("JSON fora do formato sem corte também ganha uma nova tentativa; erro do provider não", async () => {
  const formato = provedorFalso([() => envelope("{\"keywordPlan\": \"não é objeto\"}"), () => envelope(JSON.stringify(respostaValida()))]);
  const primeiro = await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl: formato.fetchImpl }));
  assert.equal(primeiro.erro, null);
  assert.equal(primeiro.valor!.calls, 2);
  assert.match(primeiro.valor!.notes[0], /veio fora do formato/);

  const credencial = provedorFalso([() => new Response("{}", { status: 401 })]);
  const segundo = await semAvisos(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl: credencial.fetchImpl }));
  assert.equal(credencial.pedidos.length, 1, "credencial recusada não é repetida");
  assert.ok(segundo.erro instanceof StructuredAIError);
  assert.equal(segundo.avisos.some(item => item[0] === "[radar-article-blueprint] nova_tentativa"), false);
});

/* ============================== finalizar → organizar ============================== */

test("o botão de finalizar diz que inclui a chamada de IA; as outras ações não mudam", () => {
  const finalizar = radarPhase1Action({ state: "AWAITING_REVIEW" as never, contextReady: true, hasPrimaryQuery: true, running: false, selected: 10, pending: 0, failed: 0, analyzed: 10 });
  assert.equal(finalizar.id, "FINALIZE_SERP");
  const comIa = radarPhase1WithArticleBlueprint(finalizar);
  assert.equal(comIa.label, "Finalizar pesquisa · inclui 1 chamada de IA");
  assert.equal(comIa.id, finalizar.id, "a ação e o handler são os da Fase 1");
  assert.match(comIa.info!, /a IA organiza o artigo-modelo da SERP sobre o pacote congelado: 1 chamada de IA/);
  assert.match(comIa.info!, /Se a IA falhar, a investigação continua finalizada/);
  assert.match(radarPhase1WithArticleBlueprint(finalizar, 3).label, /inclui 3 chamadas de IA$/);
  assert.equal(radarArticleBlueprintCallsLabel(1), "1 chamada de IA");

  const iniciar = radarPhase1Action({ state: "NOT_STARTED", contextReady: true, hasPrimaryQuery: true, running: false, selected: 0, pending: 0, failed: 0, analyzed: 0 });
  assert.equal(radarPhase1WithArticleBlueprint(iniciar), iniciar, "iniciar e analisar não ganham aviso de IA");
});

test("organizar em série: um por vez, com progresso, e a falha de um não para os outros", async () => {
  let ativos = 0;
  let maximo = 0;
  const ordem: string[] = [];
  const eventos: RadarArticleBlueprintJob[] = [];
  const resultado = await organizeRadarArticleBlueprintsInSeries({
    articleIds: ["a1", "a2", "a2", "a3"],
    now: () => 7,
    organize: async articleId => {
      ativos += 1;
      maximo = Math.max(maximo, ativos);
      ordem.push(articleId);
      await new Promise(resolver => setTimeout(resolver, 1));
      ativos -= 1;
      if (articleId === "a2") return { ok: false, message: "A resposta da IA veio cortada." };
      if (articleId === "a3") throw new Error("rede caiu");
      return { ok: true, versionNumber: 4 };
    },
    onProgress: job => eventos.push(job),
  });
  assert.equal(maximo, 1, "nunca em paralelo");
  assert.deepEqual(ordem, ["a1", "a2", "a3"], "cada artigo uma vez, na ordem");
  assert.deepEqual(resultado.done, ["a1"]);
  assert.deepEqual(resultado.failed.map(item => item.articleId), ["a2", "a3"]);
  assert.deepEqual(eventos.map(item => `${item.articleId}:${item.state}:${item.position.index}/${item.position.total}`), [
    "a1:running:1/3", "a1:done:1/3", "a2:running:2/3", "a2:failed:2/3", "a3:running:3/3", "a3:failed:3/3",
  ]);
  assert.match(radarArticleBlueprintSeriesSummary(resultado), /^Artigo-modelo da SERP: 1 organizado\(s\) e 2 com falha \(3 chamadas de IA no lote\)\. As investigações continuam finalizadas/);
  assert.match(radarArticleBlueprintSeriesSummary({ done: [], failed: [{ message: "A resposta da IA veio cortada." }] }), /^A investigação continua finalizada, mas a IA não organizou o artigo-modelo da SERP: A resposta da IA veio cortada\. Use "Organizar de novo \(IA\)"/);
  assert.match(radarArticleBlueprintSeriesSummary({ done: ["a1"], failed: [] }), /^Artigo-modelo da SERP organizado pela IA\. Revise e aprove/);
});

test("o pedido de organizar: POST 'generate' com o custo aceito, e o erro do servidor chega como veio", async () => {
  const enviados: Array<{ url: string; corpo: Record<string, unknown> }> = [];
  const ok = await postRadarArticleBlueprintOrganize({
    brandId: "marca", articleId: "artigo",
    fetchImpl: (async (url: unknown, init?: RequestInit) => {
      enviados.push({ url: String(url), corpo: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ success: true, version: { versionNumber: 3 } }), { status: 200 });
    }) as typeof fetch,
  });
  assert.deepEqual(ok, { ok: true, versionNumber: 3 });
  assert.deepEqual(enviados, [{ url: "/api/editorial/radar-article-blueprint", corpo: { action: "generate", brandId: "marca", articleId: "artigo", confirmPaid: true } }]);

  const falha = await postRadarArticleBlueprintOrganize({
    brandId: "marca", articleId: "artigo",
    fetchImpl: (async () => new Response(JSON.stringify({ success: false, error: "A resposta da IA veio cortada (passou do tamanho máximo)." }), { status: 502 })) as typeof fetch,
  });
  assert.deepEqual(falha, { ok: false, message: "A resposta da IA veio cortada (passou do tamanho máximo)." });
  const semRede = await postRadarArticleBlueprintOrganize({ brandId: "marca", articleId: "artigo", fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch });
  assert.equal(semRede.ok, false);
});

const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const bancada = () => readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
const trecho = (fonte: string, inicio: string, fim: string) => {
  const de = fonte.indexOf(inicio);
  assert.ok(de >= 0, `âncora "${inicio}"`);
  const ate = fonte.indexOf(fim, de + inicio.length);
  assert.ok(ate > de, `âncora "${fim}"`);
  return fonte.slice(de, ate);
};
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("finalizar → organizar: só depois do readback confirmado, e nada desfaz o finalizar", () => {
  const finalizar = semComentarios(trecho(pagina(), "const finalizeInvestigation = async () => {", "const confirmResearchCuration = async"));
  const readback = finalizar.indexOf("if (desfecho.status === \"SUCCEEDED\") setFinalizeReadback(");
  const organizar = finalizar.indexOf("if (desfecho.status === \"SUCCEEDED\") void organizarArtigosModeloDaSerp([target.articleId]);");
  assert.ok(readback > 0 && organizar > readback, "organiza depois do finalizar confirmado, pelo mesmo desfecho");
  assert.ok(finalizar.indexOf("const gravado = await pipeline.saveRadarAnalysis(") < organizar, "e depois da gravação remota");
  assert.equal(/radar-article-blueprint|confirmPaid/.test(finalizar), false, "o finalizar não chama a IA por conta própria: delega");

  const organizador = semComentarios(trecho(pagina(), "const organizarArtigosModeloDaSerp = async", "const approveTopicsBatch ="));
  assert.match(organizador, /organizeRadarArticleBlueprintsInSeries\(\{/);
  assert.match(organizador, /postRadarArticleBlueprintOrganize\(\{ brandId: marca, articleId \}\)/);
  assert.match(organizador, /setBlueprintJobs\(/);
  assert.equal(/resetRadarInvestigation|saveRadarAnalysis|setFinalizeReadback|updateLocalState/.test(organizador), false, "falha da IA não toca a investigação");
  assert.equal(/useEffect\([^)]*organizarArtigosModeloDaSerp/.test(pagina()), false, "nenhuma chamada de IA nasce de efeito");
  assert.match(pagina(), /articleBlueprintJob=\{activeRadarItem \? blueprintJobs\[activeRadarItem\.articleId\] \?\? null : null\}/);
});

test("a tela: o painel mora na Pesquisa, logo abaixo do modelo da SERP; o botão de finalizar usa o aviso", () => {
  const fonte = bancada();
  const pesquisa = semComentarios(trecho(fonte, "function DeepResearch(", "function Phase1Slot("));
  const modelo = pesquisa.indexOf("<RadarArticleModelSection model={view.articleModel} />");
  const painel = pesquisa.indexOf("{articleBlueprint && <div className=\"mt-3\">{articleBlueprint}</div>}");
  assert.ok(modelo > 0 && painel > modelo, "o artigo-modelo da SERP vem logo depois do modelo do artigo");
  assert.ok(painel < pesquisa.indexOf("{writerHandoff && <WriterHandoff"), "e antes da decisão de envio");
  const botao = semComentarios(trecho(fonte, "function Phase1Button(", "function RecoverSerpAction("));
  assert.match(botao, /const acao = radarPhase1WithArticleBlueprint\(resolvida\);/);
  const bancadaFora = semComentarios(fonte.slice(fonte.indexOf("export function RadarR3Workbench(")));
  assert.match(bancadaFora, /articleBlueprint=\{model\.deepResearch\.finalizedBundle && brandId && articleId \? <RadarArticleBlueprintPanel brandId=\{brandId\} articleId=\{articleId\} job=\{articleBlueprintJob\} \/> : null\}/);
  assert.equal((bancadaFora.match(/<RadarArticleBlueprintPanel/g) || []).length, 1, "um lugar só: o painel solto saiu");
});

test("o painel: título, explicação e o estado do trabalho pedido pela página", () => {
  const job = (state: RadarArticleBlueprintJob["state"], message: string | null = null): RadarArticleBlueprintJob => ({ articleId: "artigo", state, message, at: 1, position: { index: 1, total: 1 } });
  const html = (estado: RadarArticleBlueprintJob | null) => renderToStaticMarkup(createElement(RadarArticleBlueprintPanel, { brandId: "marca", articleId: "artigo", job: estado }));
  const emCurso = html(job("running"));
  assert.match(emCurso, /<h3[^>]*>Artigo-modelo da SERP<\/h3>/);
  assert.match(emCurso, /A SERP monta o esqueleto; a IA organiza; você aprova\./);
  assert.match(emCurso, /data-testid="radar-article-blueprint-organizing"[^>]*>Organizando o artigo-modelo da SERP com a IA… a investigação já está finalizada\./);
  const falhou = html(job("failed", "A resposta da IA veio cortada (passou do tamanho máximo)."));
  assert.match(falhou, /A investigação está finalizada, mas a IA não organizou o artigo-modelo: A resposta da IA veio cortada/);
  assert.doesNotMatch(html(null), /Organizando/);
  const fonte = readFileSync(new URL("../modules/radar/radar-article-blueprint-panel.tsx", import.meta.url), "utf8");
  assert.match(fonte, /"Organizar de novo \(IA\)" : "Organizar o artigo-modelo da SERP \(IA\)"/);
  assert.equal(/text-xs|#[0-9a-f]{3,6}\b/i.test(semComentarios(fonte)), false, "texto ≥ 14px e nenhuma cor fixa (sistema visual)");
});

/*
 * 2026-10-02 · revisão da frente: o painel mostrava sempre `versoes[0]` — a
 * mais nova de QUALQUER congelamento — e dizia que o CSV saía com ela. Agora
 * mostra a do pacote vigente, pela mesma regra do export, e avisa quando a mais
 * nova é de outro congelamento.
 */
test("o painel mostra a versão do pacote vigente, pela mesma regra do export, e avisa a de outro congelamento", () => {
  type V = { id: string; versionNumber: number; state: "DRAFT" | "APPROVED"; origin: "ai" | "human_edit"; bundleHash?: string };
  const v = (id: string, versionNumber: number, state: V["state"], origin: V["origin"], bundleHash?: string): V => ({ id, versionNumber, state, origin, bundleHash });

  /* Reorganizado sobre um congelamento novo: a proposta nova é a do pacote vigente. */
  const reorganizado = [v("v3", 3, "DRAFT", "ai", "B"), v("v2", 2, "APPROVED", "ai", "A"), v("v1", 1, "DRAFT", "ai", "A")];
  assert.equal(radarArticleBlueprintPanelChoice(reorganizado).shown?.id, "v3");
  assert.equal(radarArticleBlueprintPanelChoice(reorganizado).newestFromOtherFreeze, null);
  /* Quem chama sabe que o vigente ainda é A: a aprovada de A vai ao CSV, e a v3 é de outro congelamento. */
  const sabendo = radarArticleBlueprintPanelChoice(reorganizado, "A");
  assert.equal(sabendo.shown?.id, "v2");
  assert.equal(sabendo.newestFromOtherFreeze?.id, "v3");

  /* A edição de uma versão antiga é a mais nova, mas de outro congelamento; e há proposta nova sobre a aprovada. */
  const editadaAntiga = [v("v5", 5, "DRAFT", "human_edit", "A"), v("v4", 4, "DRAFT", "ai", "B"), v("v3", 3, "APPROVED", "ai", "B")];
  const escolha = radarArticleBlueprintPanelChoice(editadaAntiga);
  assert.equal(escolha.shown?.id, "v3", "a aprovada do vigente vai ao CSV");
  assert.equal(escolha.newestFromOtherFreeze?.id, "v5");
  assert.equal(escolha.newerDraft?.id, "v4", "a proposta mais nova do mesmo congelamento fica à mão para revisar e aprovar");

  /* Nenhuma versão do vigente: nada a mostrar como a do CSV. */
  assert.equal(radarArticleBlueprintPanelChoice([v("v1", 1, "APPROVED", "ai", "A")], "C").shown, null);
  /* Resposta antiga da rota, sem congelamento: a regra de antes (a mais nova). */
  assert.equal(radarArticleBlueprintPanelChoice([v("v1", 1, "APPROVED", "ai"), v("v2", 2, "DRAFT", "ai")]).shown?.id, "v2");
  assert.equal(radarArticleBlueprintPanelChoice([]).shown, null);

  /* A MESMA regra do export, com o vigente conhecido. */
  for (const [versoes, vigente] of [[reorganizado, "A"], [reorganizado, "B"], [editadaAntiga, "B"], [editadaAntiga, "A"]] as const) {
    const doExport = radarArticleBlueprintExportChoice(versoes.map(item => ({ id: item.id, articleId: "a1", bundleHash: item.bundleHash!, versionNumber: item.versionNumber, state: item.state })), new Map([["a1", vigente]]));
    assert.equal(radarArticleBlueprintPanelChoice(versoes, vigente).shown?.id ?? null, doExport.get("a1")?.id ?? null, `vigente ${vigente}`);
  }

  const fonte = semComentarios(readFileSync(new URL("../modules/radar/radar-article-blueprint-panel.tsx", import.meta.url), "utf8"));
  assert.match(fonte, /const escolha = radarArticleBlueprintPanelChoice\(versoes, currentBundleHash\);/);
  assert.equal(/const atual = versoes\[0\]/.test(fonte), false, "nunca mais a mais nova de qualquer congelamento");
  assert.match(fonte, /data-testid="radar-article-blueprint-other-freeze"/);
  assert.match(fonte, /data-testid="radar-article-blueprint-newer-draft"/);
});

/*
 * 2026-10-02 · REVISÃO: O PAINEL NÃO AFIRMA O QUE NÃO SABE.
 *
 * Refinalizada a investigação (congelamento B) com a IA falhando, a única
 * versão é a aprovada de A. Deduzindo o vigente pelas versões, o painel dizia
 * "Aprovado — vai ao CSV e ao Redator", e o export (preso a B) não levava
 * artigo-modelo nenhum. Com o vigente informado, nada é mostrado como a versão
 * do CSV; sem ele, a aprovada não afirma que vai.
 */
test("refinalizada com a IA falhando: com o vigente informado, nada vai ao CSV; sem ele, o painel não afirma que vai", () => {
  type V = { id: string; versionNumber: number; state: "DRAFT" | "APPROVED"; origin: "ai" | "human_edit"; bundleHash?: string };
  const versoes: V[] = [{ id: "v1", versionNumber: 1, state: "APPROVED", origin: "ai", bundleHash: "A" }];

  const informado = radarArticleBlueprintPanelChoice(versoes, "B");
  assert.equal(informado.shown, null, "nenhuma versão do pacote vigente: nada é mostrado como a do CSV");
  assert.equal(informado.newestFromOtherFreeze?.id, "v1", "e o aviso de outro congelamento dispara");
  assert.equal(informado.currentConfirmed, true);
  const doExport = radarArticleBlueprintExportChoice(versoes.map(item => ({ id: item.id, articleId: "a1", bundleHash: item.bundleHash!, versionNumber: item.versionNumber, state: item.state })), new Map([["a1", "B"]]));
  assert.equal(doExport.get("a1") ?? null, null, "o export também não leva");

  const deduzido = radarArticleBlueprintPanelChoice(versoes);
  assert.equal(deduzido.shown?.id, "v1");
  assert.equal(deduzido.currentConfirmed, false, "sem o vigente, a escolha é dedução");

  assert.equal(radarArticleBlueprintPanelStateLabel({ state: "APPROVED", origin: "ai" }, true), "Aprovado — vai ao CSV e ao Redator");
  assert.equal(radarArticleBlueprintPanelStateLabel({ state: "APPROVED", origin: "ai" }, false), "Aprovado — vai ao CSV e ao Redator se for do congelamento vigente");
  assert.equal(radarArticleBlueprintPanelStateLabel({ state: "DRAFT", origin: "ai" }, true), "Proposta da IA — aguardando aprovação");
  assert.equal(radarArticleBlueprintPanelStateLabel({ state: "DRAFT", origin: "human_edit" }, false), "Editado — aguardando aprovação");

  const fonte = semComentarios(readFileSync(new URL("../modules/radar/radar-article-blueprint-panel.tsx", import.meta.url), "utf8"));
  assert.match(fonte, /const vaiAoCsvConferido = Boolean\(atual && atual === vaiAoCsv && escolha\.currentConfirmed\);/);
  assert.match(fonte, /radarArticleBlueprintPanelStateLabel\(atual, vaiAoCsvConferido\)/);
  assert.equal((fonte.match(/"Aprovado — vai ao CSV e ao Redator"/g) || []).length, 1, "o rótulo afirmativo mora só no helper, atrás da conferência");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
