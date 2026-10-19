import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";
import {
  RADAR_RESEARCH_BATCH_FINALIZED_REASON,
  planRadarResearchBatch,
  radarResearchBatchButtonLabel,
  radarResearchBatchConfirmReadback,
  radarResearchBatchConfirmation,
  radarResearchBatchSummary,
  runRadarResearchBatch,
  type RadarResearchBatchCandidate,
  type RadarResearchBatchPhase1,
  type RadarResearchBatchRead,
} from "../lib/radar/research-batch.ts";
import { RADAR_PHASE1_HANDLER, type RadarOperationalActionId } from "../lib/radar/operational-actions.ts";
import { RadarResearchBatchAction, RadarResearchBatchProgressStrip } from "../modules/radar/radar-r4-bulk-operations-bar.tsx";

/*
 * 2026-10-13 · "PESQUISAR E FINALIZAR (N ARTIGOS)" NA BARRA DE LOTE DO RADAR.
 *
 * O lote faz, artigo por artigo, a MESMA sequência do botão do artigo: a Fase 1
 * resolvida pela tela escolhe o handler pelo mesmo mapa (RADAR_PHASE1_HANDLER).
 * Fixtures puras: nenhuma rede, nenhum provider, nenhuma IA — a sentinela de
 * `fetch` abaixo registra qualquer tentativa.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    const alvo = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    tentativasDeRede.push(alvo);
    return Promise.reject(new Error(`REDE PROIBIDA NESTE TESTE: ${alvo}`));
  },
  writable: true, configurable: true,
});

const fase = (id: RadarResearchBatchPhase1["id"], label: string, extra: Partial<RadarResearchBatchPhase1> = {}): RadarResearchBatchPhase1 => ({
  id, label, enabled: true, blockedReason: null, hint: null, ...extra,
});
const INICIAR = fase("START_RESEARCH", "Iniciar Pesquisa Google");
const COMPLETAR = fase("START_RESEARCH", "Completar Pesquisa Google", { hint: "SERP principal já coletada · 1 consulta(s) auxiliar(es) a executar" });
const ANALISAR = fase("ANALYZE_COMPETITION", "Analisar concorrência", { hint: "8 referência(s) selecionada(s) automaticamente." });
const FINALIZAR = fase("FINALIZE_SERP", "Finalizar pesquisa", { hint: "8 página(s) na amostra" });

const candidato = (articleId: string, extra: Partial<RadarResearchBatchCandidate> = {}): RadarResearchBatchCandidate => ({
  articleId, title: `Artigo ${articleId}`, finalized: false, mode: "WEB", phase1: INICIAR,
  canonicalReusable: false, auxiliaryToRun: 2, sufficiencyLevel: "SUFFICIENT", sufficiencyHeadline: null, ...extra,
});

/* ============================== 1 · a prévia ============================== */

test("prévia · o teto do lote: 4 lentes por consulta, SERP gravada reaproveitada, finalizado pulado, IA até 2 por artigo", () => {
  const plano = planRadarResearchBatch([
    candidato("novo"), // canônica + 2 auxiliares = 3 consultas × 4 lentes
    candidato("retomado", { phase1: COMPLETAR, canonicalReusable: true, auxiliaryToRun: 1 }), // só 1 auxiliar
    candidato("analisar", { phase1: ANALISAR }), // nenhuma consulta paga
    candidato("pronto", { finalized: true, articleBlueprint: "APPROVED", phase1: fase("NONE", "Pesquisa finalizada", { enabled: false }) }),
    /* 2026-10-18 (dono) · finalizado sem artigo-modelo concluído conhecido: só o artigo-modelo, sem pesquisa paga. */
    candidato("sem-modelo", { finalized: true, phase1: fase("NONE", "Pesquisa finalizada", { enabled: false }) }),
  ]);
  assert.deepEqual(plano.run.map(item => [item.articleId, item.firstStep, item.serpCallsCeiling, item.aiCallsCeiling]), [
    ["novo", "START", 12, 2],
    ["retomado", "START", 4, 2],
    ["analisar", "ANALYZE", 0, 2],
  ]);
  assert.deepEqual(plano.blueprint.map(item => [item.articleId, item.aiCallsCeiling]), [["sem-modelo", 2]]);
  assert.equal(plano.serpCallsCeiling, 16, "o finalizado sem artigo-modelo não paga pesquisa");
  assert.equal(plano.aiCallsCeiling, 8);
  assert.deepEqual(plano.skipped.map(item => [item.articleId, item.reason]), [["pronto", RADAR_RESEARCH_BATCH_FINALIZED_REASON]]);
  assert.equal(radarResearchBatchButtonLabel(plano), "Pesquisar e finalizar (4 artigos)");
  const prevista = radarResearchBatchConfirmation(plano).join(" ");
  assert.match(prevista, /até 16 chamada\(s\)/);
  assert.match(prevista, /cache primeiro, nas 4 lentes/);
  assert.match(prevista, /até 8 chamada\(s\) para organizar o artigo-modelo/);
  assert.match(prevista, /1 já finalizado\(s\) sem artigo-modelo: só o artigo-modelo é organizado \(\+ até 2 chamadas de IA cada\)/);
  assert.match(prevista, /1 já finalizado\(s\) com o artigo-modelo concluído: pulado\(s\), sem custo/);
});

test("2026-10-18 · execução · o finalizado sem artigo-modelo não é aberto nem pesquisado: só a série do artigo-modelo, depois das pesquisas", async () => {
  const plano = planRadarResearchBatch([candidato("sem-modelo", { finalized: true }), candidato("falha-modelo", { finalized: true }), candidato("a1", { phase1: ANALISAR }), candidato("pronto", { finalized: true, articleBlueprint: "APPROVED" })]);
  const tela = telaDeMentira({ a1: { finalized: false, phase1: ANALISAR } }, { a1: { ANALYZE: finalizado } });
  const pedidos: string[][] = [];
  const resultado = await runRadarResearchBatch({
    plan: plano, confirmed: true, open: tela.open, read: tela.read, run: tela.run,
    organizeBlueprints: async ids => { pedidos.push(ids); return { done: ["sem-modelo"], failed: [{ articleId: "falha-modelo", message: "A IA não respondeu." }] }; },
  });
  assert.deepEqual(tela.abertos, ["a1"], "o finalizado não é aberto: nada é pesquisado nele");
  assert.deepEqual(pedidos, [["sem-modelo", "falha-modelo"]], "uma série só, depois das pesquisas");
  assert.deepEqual(resultado.items.map(item => [item.articleId, item.status]), [["sem-modelo", "FINALIZED"], ["falha-modelo", "REFUSED"], ["a1", "FINALIZED"], ["pronto", "SKIPPED"]]);
  assert.match(resultado.items[1].reason || "", /Artigo-modelo: A IA não respondeu\./);
  /* Só finalizados sem artigo-modelo também abrem o lote. */
  const soModelo = planRadarResearchBatch([candidato("sem-modelo", { finalized: true })]);
  assert.equal(soModelo.run.length, 0);
  assert.equal(radarResearchBatchButtonLabel(soModelo), "Pesquisar e finalizar (1 artigo)");
  const semPorta = await runRadarResearchBatch({ plan: soModelo, confirmed: true, open: tela.open, read: tela.read, run: tela.run });
  assert.equal(semPorta.started, true);
  assert.equal(semPorta.items[0].status, "REFUSED", "sem a série, para com o motivo — nunca some");
});

test("prévia · fica fora com motivo: YouTube/Amazon, contexto não resolvido, ação indisponível, Refazer depois de nada analisável, intenção em conflito", () => {
  const plano = planRadarResearchBatch([
    candidato("video", { mode: "YOUTUBE" }),
    candidato("sem-contexto", { phase1: null }),
    candidato("rodando", { phase1: fase("NONE", "Pesquisando Google…", { enabled: false, hint: "A investigação está em andamento." }) }),
    candidato("refazer", { phase1: fase("START_RESEARCH", "Refazer Pesquisa Google", { blockedReason: "A pesquisa não encontrou página analisável." }) }),
    candidato("conflito", { phase1: FINALIZAR, sufficiencyLevel: "CONFLICTING_SEARCH_INTENT", sufficiencyHeadline: "Intenção em conflito" }),
    candidato("video", { mode: "WEB" }), // repetido: conta uma vez
  ]);
  assert.equal(plano.run.length, 0);
  assert.equal(plano.items.length, 5);
  const motivo = Object.fromEntries(plano.refused.map(item => [item.articleId, item.reason]));
  assert.match(motivo.video, /lote é da pesquisa Google/);
  assert.match(motivo["sem-contexto"], /contexto do artigo ainda não foi resolvido/);
  assert.match(motivo.rodando, /em andamento/);
  assert.match(motivo.refazer, /pesquisa paga nova: decisão do artigo/);
  assert.match(motivo.conflito, /pede a sua decisão antes de congelar/);
  assert.equal(plano.serpCallsCeiling, 0);
});

/* ============================== 2 · a execução ============================== */

type Artigo = { finalized: boolean; phase1: RadarResearchBatchPhase1 | null; sufficiencyLevel?: string | null };

/**
 * A "tela" de mentira: cada passo muda a Fase 1 como o handler real mudaria.
 * `transicoes[articleId][passo]` devolve o próximo estado (ou lança).
 */
type Transicao = (atual: Artigo, dizer: (texto: string) => void) => Artigo;
function telaDeMentira(inicial: Record<string, Artigo>, transicoes: Record<string, Partial<Record<RadarOperationalActionId, Transicao>>>) {
  const estado = structuredClone(inicial);
  const abertos: string[] = [];
  const chamadas: Array<{ articleId: string; passo: RadarOperationalActionId; faseAntes: string | null }> = [];
  let mensagem = "";
  const dizer = (texto: string) => { mensagem = texto; };
  return {
    abertos, chamadas, estado,
    open: async (articleId: string) => { abertos.push(articleId); return true; },
    read: (articleId: string): RadarResearchBatchRead | null => {
      const artigo = estado[articleId];
      return artigo ? { finalized: artigo.finalized, phase1: artigo.phase1, sufficiencyLevel: artigo.sufficiencyLevel ?? null } : null;
    },
    run: async (articleId: string, passo: RadarOperationalActionId) => {
      chamadas.push({ articleId, passo, faseAntes: estado[articleId]?.phase1?.id ?? null });
      const proximo = transicoes[articleId]?.[passo];
      if (proximo) estado[articleId] = proximo(estado[articleId], dizer);
    },
    lastMessage: () => mensagem,
  };
}

const finalizado = (): Artigo => ({ finalized: true, phase1: fase("NONE", "Pesquisa finalizada", { enabled: false }) });

test("execução · sem confirmação humana nada é aberto nem executado", async () => {
  const plano = planRadarResearchBatch([candidato("a1"), candidato("a2", { phase1: ANALISAR })]);
  const tela = telaDeMentira({ a1: { finalized: false, phase1: INICIAR }, a2: { finalized: false, phase1: ANALISAR } }, {});
  const resultado = await runRadarResearchBatch({ plan: plano, confirmed: false, open: tela.open, read: tela.read, run: tela.run });
  assert.equal(resultado.started, false);
  assert.deepEqual(tela.abertos, []);
  assert.deepEqual(tela.chamadas, []);
  assert.deepEqual(resultado.items.map(item => item.status), ["QUEUED", "QUEUED"]);
});

test("execução · a MESMA sequência do botão: Iniciar → Analisar e finaliza; cada passo é o handler que o mapa do botão escolhe", async () => {
  const plano = planRadarResearchBatch([candidato("a1"), candidato("a2", { phase1: ANALISAR })]);
  const tela = telaDeMentira(
    { a1: { finalized: false, phase1: INICIAR }, a2: { finalized: false, phase1: ANALISAR } },
    {
      a1: { START: () => ({ finalized: false, phase1: ANALISAR }), ANALYZE: finalizado },
      a2: { ANALYZE: finalizado },
    },
  );
  const progresso: string[] = [];
  const resultado = await runRadarResearchBatch({
    plan: plano, confirmed: true, open: tela.open, read: tela.read, run: tela.run,
    onProgress: atual => progresso.push(atual.items.map(item => `${item.articleId}:${item.status}`).join(",")),
  });
  assert.equal(resultado.started, true);
  assert.deepEqual(tela.abertos, ["a1", "a2"], "um artigo por vez, na ordem da seleção");
  assert.deepEqual(tela.chamadas.map(chamada => `${chamada.articleId}:${chamada.passo}`), ["a1:START", "a1:ANALYZE", "a2:ANALYZE"]);
  for (const chamada of tela.chamadas) {
    assert.equal(chamada.passo, RADAR_PHASE1_HANDLER[chamada.faseAntes as keyof typeof RADAR_PHASE1_HANDLER], "o passo é o do mapa do botão");
  }
  assert.deepEqual(resultado.items.map(item => [item.articleId, item.status, item.steps.join(">")]), [["a1", "FINALIZED", "START>ANALYZE"], ["a2", "FINALIZED", "ANALYZE"]]);
  assert.ok(progresso.some(linha => linha === "a1:RUNNING,a2:QUEUED"), progresso.join(" | "));
});

test("execução · o finalizado é pulado (nem aberto) e o recusado na prévia não roda", async () => {
  const plano = planRadarResearchBatch([
    candidato("pronto", { finalized: true, articleBlueprint: "APPROVED" }),
    candidato("video", { mode: "YOUTUBE" }),
    candidato("a1", { phase1: ANALISAR }),
  ]);
  const tela = telaDeMentira({ a1: { finalized: false, phase1: ANALISAR } }, { a1: { ANALYZE: finalizado } });
  const resultado = await runRadarResearchBatch({ plan: plano, confirmed: true, open: tela.open, read: tela.read, run: tela.run });
  assert.deepEqual(tela.abertos, ["a1"]);
  assert.deepEqual(resultado.items.map(item => [item.articleId, item.status]), [["pronto", "SKIPPED"], ["video", "REFUSED"], ["a1", "FINALIZED"]]);
});

test("execução · recusa por item, com motivo, sem abortar o lote: a coleta que não avançou não é paga de novo", async () => {
  const plano = planRadarResearchBatch([candidato("falha"), candidato("ok")]);
  const tela = telaDeMentira(
    { falha: { finalized: false, phase1: INICIAR }, ok: { finalized: false, phase1: INICIAR } },
    {
      /* A coleta falhou: a Fase 1 continua "Iniciar". O handler disse o motivo na tela. */
      falha: { START: (atual, dizer) => { dizer("O DataForSEO recusou a consulta (40501)."); return atual; } },
      ok: { START: () => ({ finalized: false, phase1: ANALISAR }), ANALYZE: finalizado },
    },
  );
  const resultado = await runRadarResearchBatch({ plan: plano, confirmed: true, open: tela.open, read: tela.read, run: tela.run, lastMessage: tela.lastMessage });
  assert.deepEqual(tela.chamadas.map(chamada => `${chamada.articleId}:${chamada.passo}`), ["falha:START", "ok:START", "ok:ANALYZE"], "o START do artigo que falhou roda uma vez só");
  const [falha, ok] = resultado.items;
  assert.equal(falha.status, "REFUSED");
  assert.match(falha.reason || "", /nenhum artigo é pesquisado \(pago\) duas vezes/);
  assert.match(falha.reason || "", /40501/);
  assert.equal(ok.status, "FINALIZED");
});

test("execução · o automático que parou não vira finalização manual quando a intenção está em conflito", async () => {
  const plano = planRadarResearchBatch([candidato("conflito", { phase1: ANALISAR })]);
  const tela = telaDeMentira(
    { conflito: { finalized: false, phase1: ANALISAR } },
    { conflito: { ANALYZE: () => ({ finalized: false, phase1: FINALIZAR, sufficiencyLevel: "CONFLICTING_SEARCH_INTENT" }) } },
  );
  const resultado = await runRadarResearchBatch({ plan: plano, confirmed: true, open: tela.open, read: tela.read, run: tela.run });
  assert.deepEqual(tela.chamadas.map(chamada => chamada.passo), ["ANALYZE"], "FINALIZE não é chamado");
  assert.equal(resultado.items[0].status, "REFUSED");
  assert.match(resultado.items[0].reason || "", /pede a sua decisão antes de congelar/);
});

test("execução · passo que lança e passo que não avança param só aquele artigo", async () => {
  const plano = planRadarResearchBatch([candidato("erro", { phase1: ANALISAR }), candidato("parado", { phase1: ANALISAR }), candidato("ok", { phase1: ANALISAR })]);
  const tela = telaDeMentira(
    { erro: { finalized: false, phase1: ANALISAR }, parado: { finalized: false, phase1: ANALISAR }, ok: { finalized: false, phase1: ANALISAR } },
    {
      erro: { ANALYZE: () => { throw new Error("Outro artigo foi aberto durante o lote; este parou sem executar o passo."); } },
      parado: { ANALYZE: (atual, dizer) => { dizer("Não finalizou sozinha: a gravação não foi confirmada."); return atual; } },
      ok: { ANALYZE: finalizado },
    },
  );
  const resultado = await runRadarResearchBatch({ plan: plano, confirmed: true, open: tela.open, read: tela.read, run: tela.run, lastMessage: tela.lastMessage });
  assert.deepEqual(resultado.items.map(item => item.status), ["REFUSED", "REFUSED", "FINALIZED"]);
  assert.match(resultado.items[0].reason || "", /Outro artigo foi aberto/);
  assert.match(resultado.items[1].reason || "", /"Analisar concorrência" não avançou\. Não finalizou sozinha/);
  assert.deepEqual(tela.chamadas.filter(chamada => chamada.articleId === "parado").map(chamada => chamada.passo), ["ANALYZE"], "o mesmo passo não é repetido em laço");
});

test("execução · o artigo que não abre na tela é recusado sem nenhum passo", async () => {
  const plano = planRadarResearchBatch([candidato("a1")]);
  const resultado = await runRadarResearchBatch({ plan: plano, confirmed: true, open: async () => false, read: () => null, run: async () => { throw new Error("não devia rodar"); } });
  assert.equal(resultado.items[0].status, "REFUSED");
  assert.match(resultado.items[0].reason || "", /não abriu na tela/);
});

/* ============================== 3 · a releitura ============================== */

test("releitura · finalizado só com o servidor confirmando; o resumo diz pulados, parados e o artigo-modelo", () => {
  const itens = [
    { articleId: "a1", title: "Artigo a1", status: "FINALIZED" as const, step: "ANALYZE" as const, reason: null, steps: ["ANALYZE" as const] },
    { articleId: "a2", title: "Artigo a2", status: "FINALIZED" as const, step: "ANALYZE" as const, reason: null, steps: ["ANALYZE" as const] },
    { articleId: "a3", title: "Artigo a3", status: "FINALIZED" as const, step: "ANALYZE" as const, reason: null, steps: ["ANALYZE" as const] },
    { articleId: "a4", title: "Artigo a4", status: "SKIPPED" as const, step: null, reason: RADAR_RESEARCH_BATCH_FINALIZED_REASON, steps: [] },
  ];
  const confirmados = radarResearchBatchConfirmReadback(itens, {
    a1: { confirmed: true, finalized: true },
    a2: { confirmed: true, finalized: false },
    a3: { confirmed: false, finalized: false, reason: "sem resposta" },
  });
  assert.deepEqual(confirmados.map(item => item.status), ["FINALIZED", "REFUSED", "REFUSED", "SKIPPED"]);
  assert.match(confirmados[1].reason || "", /releitura do servidor não encontrou a investigação congelada/);
  assert.match(confirmados[2].reason || "", /não foi confirmada \(sem resposta\)/);
  const resumo = radarResearchBatchSummary(confirmados, { done: 1, failed: 0 });
  assert.match(resumo, /^Pesquisar e finalizar: 1 finalizado\(s\) e confirmado\(s\) na releitura do servidor/);
  assert.match(resumo, /1 já finalizado\(s\), pulado\(s\) sem custo/);
  assert.match(resumo, /2 parado\(s\) — "Artigo a2"/);
  assert.match(resumo, /artigo-modelo: 1 concluído\(s\)/);
});

/* ============================== 4 · a tela ============================== */

test("tela (DOM) · o botão abre a prévia com o teto; só o \"Confirmar e pesquisar\" dispara", async () => {
  const plano = planRadarResearchBatch([candidato("a1"), candidato("a2", { phase1: ANALISAR }), candidato("pronto", { finalized: true, articleBlueprint: "APPROVED" })]);
  let confirmacoes = 0;
  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(RadarResearchBatchAction, { plan: plano, busy: false, onConfirm: () => { confirmacoes += 1; } })));
  assert.equal(tela.get("radar-pesquisa-lote").textContent, "Pesquisar e finalizar (2 artigos)");
  /* 2026-10-18 · o "i" ao lado do botão explica para que serve e como usar. */
  assert.ok(tela.container.querySelector(".info-hint-inline-trigger"), "o InfoHint ao lado de \"Pesquisar e finalizar\"");
  await tela.click("radar-pesquisa-lote");
  assert.equal(confirmacoes, 0, "abrir a prévia não dispara nada");
  const previa = tela.get("radar-pesquisa-lote-confirm").textContent || "";
  assert.match(previa, /até 12 chamada\(s\)/);
  assert.match(previa, /até 4 chamada\(s\) para organizar o artigo-modelo/);
  assert.match(previa, /1 já finalizado\(s\) com o artigo-modelo concluído: pulado\(s\), sem custo/);
  await tela.click("radar-pesquisa-lote-confirmar");
  assert.equal(confirmacoes, 1);
  tela.destroy();
});

/*
 * 2026-10-18 · SUBSTITUÍDO "no fim, a faixa diz quem parou e por quê": todos os
 * avisos no sino (regra do dono). A faixa é só ANDAMENTO; o desfecho do lote,
 * com os parados e o motivo, vai para o sino pelo resumo (`radarResearchBatchSummary`).
 */
test("tela (DOM) · sem artigo para pesquisar não há botão; a faixa é só andamento e some no fim (o desfecho vai ao sino)", async () => {
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarResearchBatchAction, { plan: planRadarResearchBatch([candidato("pronto", { finalized: true, articleBlueprint: "APPROVED" })]), busy: false, onConfirm: () => {} }));
  assert.equal(tela.query("radar-pesquisa-lote"), null);
  const itens = [
    { articleId: "a1", title: "Creme facial", status: "FINALIZED" as const, step: "ANALYZE" as const, reason: null, steps: ["START" as const, "ANALYZE" as const] },
    { articleId: "a2", title: "Sérum", status: "RUNNING" as const, step: "START" as const, reason: null, steps: ["START" as const] },
  ];
  await tela.render(React.createElement(RadarResearchBatchProgressStrip, { progress: { active: true, position: 2, total: 2, items: itens } }));
  const andamento = tela.get("radar-pesquisa-lote-progresso").textContent || "";
  assert.match(andamento, /Artigo 2 de 2 · “Sérum”/);
  assert.match(andamento, /1 finalizado\(s\)/);
  await tela.render(React.createElement(RadarResearchBatchProgressStrip, { progress: { active: false, position: 0, total: 2, items: [itens[0], { ...itens[1], status: "REFUSED" as const, reason: "O DataForSEO recusou a consulta." }] } }));
  assert.equal(tela.query("radar-pesquisa-lote-progresso"), null, "lote encerrado: a faixa sai; o desfecho está no sino");
  const resumo = radarResearchBatchSummary([itens[0], { ...itens[1], status: "REFUSED" as const, reason: "O DataForSEO recusou a consulta." }]);
  assert.match(resumo, /1 parado\(s\) — "Sérum": O DataForSEO recusou a consulta\./, "quem parou e por quê vai no aviso do sino");
  tela.destroy();
});

/* ============================== 5 · a estrutura ============================== */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const trecho = (fonte: string, de: string, ate: string) => {
  const inicio = fonte.indexOf(de);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.ok(inicio >= 0 && fim > inicio, `trecho não encontrado: ${de} … ${ate}`);
  return fonte.slice(inicio, fim);
};

test("estrutura · o lote da página chama os handlers do botão do artigo, e nenhum provider direto", () => {
  const pagina = semComentarios(ler("../modules/radar/radar-page.tsx"));
  const lote = trecho(pagina, "const candidatoDoLote", "const handleBulkAction");
  assert.match(lote, /passo: \{ START: \(\) => startDeepResearch\(\), ANALYZE: \(\) => analyzeSerpSelection\(\), FINALIZE: \(\) => finalizeInvestigation\(\) \}/);
  assert.match(lote, /runRadarResearchBatch\(\{/);
  assert.match(lote, /await vista\.passo\[passo\]\(\);/);
  assert.match(lote, /selectAndActivate\(articleId\);/, "o lote abre o artigo como o clique na linha");
  assert.match(lote, /analiseConfirmadaNoServidor\(row\)/, "a releitura do fim é do servidor");
  assert.match(lote, /radarResearchBatchConfirmReadback\(resultado\.items, releitura\)/);
  assert.doesNotMatch(lote, /fetch\(|collectSerp|collectAuxiliarySerp|postRadarArticleBlueprintOrganize|recollect/, "o lote não tem caminho próprio até provider ou IA");
  /* Só o "Confirmar e pesquisar" da prévia chega ao laço. */
  assert.match(lote, /<RadarResearchBatchAction plan=\{plano\} busy=\{Boolean\(lotePesquisa\?\.active\)\} onConfirm=\{\(\) => void pesquisarEFinalizarEmLote\(plano\)\} \/>/);
  /*
   * 2026-10-18 · e pela confirmação de "Adotar a versão nova" sobre a
   * investigação congelada (o congelamento novo segue pelo MESMO lote, com o
   * custo dito na prévia da adoção). Nenhum outro caminho chega ao laço.
   */
  assert.equal((pagina.match(/pesquisarEFinalizarEmLote\(/g) || []).length, 2, "o laço só é chamado pela confirmação do lote e pela da adoção");
  assert.match(pagina, /const congelarDeNovoDepoisDaAdocao = async[\s\S]*?await pesquisarEFinalizarEmLote\(plano\);/);
  assert.match(pagina, /if \(congelarDeNovo\?\.length\) void congelarDeNovoRef\.current\?\.\(congelarDeNovo\);/, "só depois da adoção confirmada pelo servidor");
});

test("estrutura · a barra oferece só o caminho do piloto; as operações antigas ficam no código, fora da tela", () => {
  const barra = semComentarios(ler("../modules/radar/radar-r4-bulk-operations-bar.tsx"));
  assert.match(barra, /RADAR_PILOT_BULK_OPERATIONS: readonly RadarR4BulkOperation\[\] = \["writer"\]/);
  assert.equal((barra.match(/actionCopy\.filter\(\(\{ operation \}\) => RADAR_PILOT_BULK_OPERATIONS\.includes\(operation\)\)/g) || []).length, 2, "botões e detalhes filtrados pela mesma lista");
  assert.doesNotMatch(barra, /Pautas prontas|elegíveis SERP/);
});

test("REAL_PROVIDER_CALLS = 0 nesta suíte", () => {
  assert.deepEqual(tentativasDeRede, []);
});
