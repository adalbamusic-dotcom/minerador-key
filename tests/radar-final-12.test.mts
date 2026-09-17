import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_HANDOFF_OUTCOMES,
  postRadarPlannerHandoff,
  postRadarPlannerHandoffBatch,
  radarHandoffBatchSummary,
  radarHandoffOutcomeOfCode,
  type RadarHandoffItemResult,
} from "../lib/radar/planner-handoff-client.ts";

/*
 * ===== RADAR_FINAL_1.2 · O LOTE PASSA PELA MESMA AUTORIDADE =====
 *
 * A suíte usa um `fetch` falso que REGISTRA cada ida ao servidor. É isso que
 * torna verificável a única pergunta do gate: o lote repete a porta única, ou
 * abre outra?
 *
 * PROVIDER_CALLS = 0 — nada aqui coleta.
 */

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const fonteDaPagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const fonteDaAnalise = await readFile(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
const fonteDoContexto = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
const fonteDoCliente = await readFile(new URL("../lib/radar/planner-handoff-client.ts", import.meta.url), "utf8");

/* ============================ o servidor falso ============================ */

type Resposta = { ok: boolean; body: Record<string, unknown> };

/**
 * O SERVIDOR MÍNIMO — uma resposta por artigo, e o registro de cada chamada.
 *
 * O registro é o instrumento: sem ele, "o lote chamou a autoridade" seria uma
 * afirmação sobre o código e não sobre o comportamento.
 */
function servidor(porArtigo: Record<string, Resposta>) {
  const chamadas: Array<{ url: string; articleId: string }> = [];

  const fetchImpl = (async (url: unknown, init?: { body?: string }) => {
    const corpo = JSON.parse(init?.body || "{}") as { articleId?: string };
    const articleId = corpo.articleId || "";
    chamadas.push({ url: String(url), articleId });

    const resposta = porArtigo[articleId] || { ok: true, body: { success: true, change: "CREATED", headline: "Pacote enviado ao Planejador." } };
    return {
      ok: resposta.ok,
      json: async () => resposta.body,
    };
  }) as unknown as typeof fetch;

  return { fetchImpl, chamadas };
}

const sucesso = (change = "CREATED"): Resposta =>
  ({ ok: true, body: { success: true, change, headline: `Desfecho ${change}.` } });

const recusa = (code: string, status = 409): Resposta =>
  ({ ok: false, body: { success: false, code, error: `Recusado: ${code}.` } });

const contar = (resultados: readonly RadarHandoffItemResult[], outcome: string) =>
  resultados.filter(item => item.outcome === outcome).length;

/* ================================ A ================================ */

test("A · lote com três artigos válidos faz três handoffs, um por artigo", async () => {
  const s = servidor({});
  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["a1", "a2", "a3"], fetchImpl: s.fetchImpl,
  });

  assert.equal(resultados.length, 3);
  assert.equal(contar(resultados, "IMPORTED"), 3);

  /*
   * ============ §2 e §4 · A MESMA PORTA, TRÊS VEZES ============
   *
   * O lote coordena N handoffs. Ele não monta dossiê, não grava dossiê, não
   * decide prontidão e não toca no Planejador — tudo isso acontece atrás desta
   * mesma URL, uma vez por artigo.
   */
  assert.equal(s.chamadas.length, 3);
  assert.deepEqual([...new Set(s.chamadas.map(item => item.url))], ["/api/editorial/radar-planner-handoff"]);
  assert.deepEqual(s.chamadas.map(item => item.articleId), ["a1", "a2", "a3"]);
});

/* ================================ B ================================ */

test("B · artigo já enviado volta como ALREADY_IMPORTED, sem duplicar nada", async () => {
  const s = servidor({ a2: sucesso("ALREADY_IMPORTED") });
  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["a1", "a2"], fetchImpl: s.fetchImpl,
  });

  assert.equal(resultados[1].outcome, "ALREADY_IMPORTED");
  /*
   * A NÃO-DUPLICAÇÃO É DECIDIDA NO SERVIDOR, e é o lote que precisa RESPEITAR
   * isso: repetir a chamada é seguro justamente porque a autoridade reconhece o
   * dossiê pelo hash. Um lote que "pulasse" artigos já enviados por conta
   * própria teria uma segunda regra de idempotência, com outro critério.
   */
  assert.equal(s.chamadas.filter(item => item.articleId === "a2").length, 1);
});

/* ================================ C ================================ */

test("C · artigo stale volta bloqueado, e o bloqueio tem nome próprio", async () => {
  const s = servidor({ a1: recusa("radar_handoff_blocked_stale") });
  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["a1"], fetchImpl: s.fetchImpl,
  });

  assert.equal(resultados[0].outcome, "BLOCKED_STALE");
  /*
   * STALE E "NÃO PRONTO" PEDEM AÇÕES DIFERENTES: um exige refazer a
   * investigação sobre o ArticleDNA novo; o outro, terminar a que existe.
   * Colapsá-los em "bloqueado" faria a pessoa tentar a ação errada.
   */
  assert.notEqual(resultados[0].outcome, "BLOCKED_NOT_READY");
  assert.equal(radarHandoffOutcomeOfCode("radar_handoff_blocked_stale"), "BLOCKED_STALE");
});

/* ================================ D ================================ */

test("D · artigo sem investigação finalizada volta BLOCKED_NOT_READY", async () => {
  const s = servidor({
    a1: recusa("radar_research_not_finalized"),
    a2: recusa("radar_handoff_blocked"),
    a3: recusa("radar_not_approved"),
    a4: recusa("radar_handoff_inconsistent"),
  });
  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["a1", "a2", "a3", "a4"], fetchImpl: s.fetchImpl,
  });

  assert.equal(contar(resultados, "BLOCKED_NOT_READY"), 4);
  /* E a frase de cada recusa chega inteira a quem opera. */
  for (const item of resultados) assert.match(item.message, /Recusado:/);
});

/* ================================ E ================================ */

test("E · a falha de um artigo não fabrica sucesso nem esconde os que passaram", async () => {
  const s = servidor({
    a2: recusa("radar_handoff_readback_failed", 502),
    a4: recusa("radar_handoff_blocked_stale"),
  });
  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["a1", "a2", "a3", "a4", "a5"], fetchImpl: s.fetchImpl,
  });

  /*
   * ============ §5 · O LOTE NÃO É ALL-OR-NOTHING ARTIFICIAL ============
   *
   * Três artigos passaram e precisam continuar passados; dois não, e precisam
   * continuar visíveis. Abortar no primeiro erro desfaria trabalho legítimo;
   * engolir o erro esconderia artigos que ninguém vai reabrir.
   */
  assert.equal(resultados.length, 5, "o lote não abortou no primeiro erro");
  assert.equal(contar(resultados, "IMPORTED"), 3);
  assert.equal(contar(resultados, "FAILED"), 1);
  assert.equal(contar(resultados, "BLOCKED_STALE"), 1);
  assert.equal(s.chamadas.length, 5, "todos os artigos foram tentados");

  /* §8 · e o resumo NUNCA declara sucesso global com bloqueio dentro. */
  const resumo = radarHandoffBatchSummary(resultados);
  assert.match(resumo, /3 enviado\(s\)/);
  assert.match(resumo, /1 bloqueado\(s\)/);
  assert.match(resumo, /1 com falha/);
});

test("E · uma exceção de rede vira FAILED daquele artigo, não do lote", async () => {
  const explodir = (async (_url: unknown, init?: { body?: string }) => {
    const corpo = JSON.parse(init?.body || "{}") as { articleId?: string };
    if (corpo.articleId === "a2") throw new Error("REDE CAIU");
    return { ok: true, json: async () => ({ success: true, change: "CREATED", headline: "ok" }) };
  }) as unknown as typeof fetch;

  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["a1", "a2", "a3"], fetchImpl: explodir,
  });

  assert.equal(resultados.length, 3);
  assert.equal(resultados[1].outcome, "FAILED");
  assert.match(resultados[1].message, /REDE CAIU/);
  assert.equal(resultados[2].outcome, "IMPORTED", "o artigo seguinte continua sendo tentado");
});

/* ================================ F ================================ */

test("F · nenhum caminho do lote grava sent_planner sem dossiê", () => {
  const pagina = semComentarios(fonteDaPagina);
  const analise = semComentarios(fonteDaAnalise);
  const contexto = semComentarios(fonteDoContexto);

  /*
   * ============ §2 · O CAMINHO PARALELO FOI REMOVIDO ============
   *
   * `importApprovedToPlanner` movia a esteira e nada mais. Depois que os três
   * chamadores passaram pela autoridade única ele ficou sem uso — e um caminho
   * morto que ainda FUNCIONA é uma arma carregada: alguém o encontraria e
   * voltaria a usá-lo.
   */
  for (const [nome, fonte] of [["página", pagina], ["análise", analise], ["contexto", contexto]] as const) {
    assert.equal(/importApprovedToPlanner/.test(fonte), false, `${nome} ainda conhece o caminho paralelo`);
  }

  /*
   * ============ NENHUMA TELA MOVE A ESTEIRA PARA sent_planner ============
   *
   * A auditoria é sobre MUTAÇÃO, não sobre a palavra: as telas LEEM
   * `sent_planner` o tempo todo para saber se o artigo já foi. O que elas não
   * podem é escrevê-lo — por `updateRadarState`, por `setRadarState` ou por um
   * comando de workflow.
   */
  for (const [nome, fonte] of [["página", pagina], ["análise", analise]] as const) {
    assert.equal(
      /(updateRadarState|setRadarState|transitionRadar|transition)\([^;]*sent_planner/.test(fonte),
      false,
      `${nome} move a esteira para sent_planner por conta própria`,
    );
    assert.equal(/"sent_planner" as const|state: "sent_planner"/.test(fonte), false, `${nome} escreve sent_planner direto`);
    assert.equal(/action: "import_planner"/.test(fonte), false, `${nome} dispara o comando de esteira`);
  }

  /*
   * E O LOTE CHAMA MESMO A AUTORIDADE — a ausência do caminho antigo não
   * prova que o novo está lá. Um lote que fabricasse resultados sem sair da
   * tela passaria por todas as proibições acima.
   */
  assert.ok(pagina.includes("postRadarPlannerHandoffBatch({ brandId: selectedBrandId, articleIds })"));
  assert.ok(analise.includes("postRadarPlannerHandoff({ brandId: selectedBrandId, articleId: row.articleId })"));

  /*
   * O comando `import_planner` continua existindo no contrato de workflow — ele
   * é a operação da ESTEIRA, e quem a usa agora é o serviço, no servidor.
   */
  assert.equal(/action: "import_planner"/.test(contexto), false, "o contexto não dispara mais a esteira");
});

/* ================================ G ================================ */

test("G · os três perfis atravessam o lote pela mesma porta", async () => {
  /*
   * O LOTE É CEGO AO PERFIL, e isso é o ponto.
   *
   * Quem resolve Google, YouTube ou Amazon é o dossiê, atrás da mesma URL. Um
   * lote que soubesse distinguir perfis teria de conhecer a investigação — e
   * seria a segunda autoridade outra vez.
   */
  const s = servidor({
    google: sucesso("CREATED"),
    youtube: sucesso("CREATED"),
    amazon: sucesso("TRANSITION_COMPLETED"),
  });
  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["google", "youtube", "amazon"], fetchImpl: s.fetchImpl,
  });

  assert.equal(contar(resultados, "IMPORTED"), 2);
  assert.equal(contar(resultados, "TRANSITION_COMPLETED"), 1);
  assert.deepEqual([...new Set(s.chamadas.map(item => item.url))], ["/api/editorial/radar-planner-handoff"]);

  const cliente = semComentarios(fonteDoCliente);
  assert.equal(/GOOGLE|YOUTUBE|AMAZON/.test(cliente), false, "a porta não conhece perfil nenhum");
});

/* ================================ H ================================ */

test("H · a ação individual continua idêntica à do lote", async () => {
  const s = servidor({});
  const individual = await postRadarPlannerHandoff({ brandId: "marca-1", articleId: "a1", fetchImpl: s.fetchImpl });
  const emLote = await postRadarPlannerHandoffBatch({ brandId: "marca-1", articleIds: ["a1"], fetchImpl: s.fetchImpl });

  assert.deepEqual(emLote[0], individual, "o lote de um artigo é o envio individual");
  assert.equal(s.chamadas.length, 2);
  assert.deepEqual([...new Set(s.chamadas.map(item => item.url))], ["/api/editorial/radar-planner-handoff"]);

  /* §7 · e as duas telas chamam a mesma função. */
  for (const fonte of [semComentarios(fonteDaPagina), semComentarios(fonteDaAnalise)]) {
    assert.match(fonte, /postRadarPlannerHandoff/);
  }
});

/* ======================== §7 · uma prontidão só ======================== */

test("§7 · não existe prontidão de lote separada da individual", () => {
  const cliente = semComentarios(fonteDoCliente);

  /*
   * A PORTA NÃO DECIDE NADA — ela pergunta.
   *
   * Uma checagem de prontidão aqui seria `batchReady` com outro critério, e um
   * dia ela discordaria do servidor: a tela ofereceria o envio de um artigo que
   * a autoridade recusa, ou esconderia um que ela aceitaria.
   */
  assert.equal(/readiness|batchReady|isReady|reportApproved/i.test(cliente), false);
  assert.equal(/plannerBundle|bundleHash|articleDnaContentHash/.test(cliente), false, "a porta não conhece o dossiê");

  const pagina = semComentarios(fonteDaPagina);
  const lote = pagina.slice(pagina.indexOf("const sendToPlanner"), pagina.indexOf("const radarItemIdsForArticles") > pagina.indexOf("const sendToPlanner")
    ? pagina.indexOf("const radarItemIdsForArticles")
    : pagina.indexOf("const sendToPlanner") + 1200);
  assert.equal(/buildRadarEvidenceBundle|radarPlannerHandoffReadiness/.test(lote), false, "o lote não monta nem avalia nada");
});

/* ===================== §5 · o vocabulário fechado ===================== */

test("§5 · todo desfecho pertence ao vocabulário declarado", async () => {
  const s = servidor({
    a1: sucesso("CREATED"), a2: sucesso("NEW_VERSION"), a3: sucesso("TRANSITION_COMPLETED"),
    a4: sucesso("ALREADY_IMPORTED"), a5: recusa("radar_handoff_blocked"),
    a6: recusa("radar_handoff_blocked_stale"), a7: recusa("boom", 500),
  });
  const resultados = await postRadarPlannerHandoffBatch({
    brandId: "marca-1", articleIds: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"], fetchImpl: s.fetchImpl,
  });

  for (const item of resultados) {
    assert.ok(RADAR_HANDOFF_OUTCOMES.includes(item.outcome), `desfecho fora do vocabulário: ${item.outcome}`);
  }
  assert.deepEqual(resultados.map(item => item.outcome), [
    "IMPORTED", "IMPORTED", "TRANSITION_COMPLETED", "ALREADY_IMPORTED",
    "BLOCKED_NOT_READY", "BLOCKED_STALE", "FAILED",
  ]);

  /* Um lote vazio não mente sucesso. */
  assert.equal(radarHandoffBatchSummary([]), "Nenhum artigo elegível no lote.");
});
