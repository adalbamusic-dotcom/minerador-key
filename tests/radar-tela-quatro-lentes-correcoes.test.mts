import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { RadarSerpScreen } from "../modules/radar/radar-serp-screen.tsx";
import { RadarR4BulkOperationsBar } from "../modules/radar/radar-r4-bulk-operations-bar.tsx";
import { radarSerpBatchButtonLabel, radarSerpCollectReading, radarStartOnRejectedSerpWarning } from "../modules/radar/radar-serp-collect-notices.ts";
import { buildRadarSerpView } from "../lib/radar/snapshot-view.ts";
import { radarSerpCollectOutcome } from "../lib/radar/serp/request.ts";
import type { SerpCollectionRecord, SerpReviewRecord } from "../lib/editorial/contracts.ts";
import type { RadarR4BulkArticleSnapshot, RadarR4BulkOperation } from "../lib/radar/r4-queue.ts";
import { ARTIGO, MARCA, registro } from "./radar-tela-quatro-lentes-fixtures.mts";

/*
 * CORREÇÕES DA TELA DAS QUATRO LENTES.
 *
 * 1. O lote diz o teto de chamadas NO BOTÃO, antes do clique que já paga; a
 *    tela da SERP diz o teto do "Atualizar SERP" antes do clique.
 * 2. O START sobre uma SERP sem mudança e rejeitada não segue em silêncio.
 * 3. "Recoletando…" só aparece quando a recoleta paga está em curso — não
 *    durante o "Atualizar SERP", que é cache primeiro.
 *
 * Nenhuma chamada de rede: a sentinela abaixo registra qualquer tentativa.
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

const revisao = (snapshotId: string, status: "approved" | "rejected"): SerpReviewRecord => ({
  id: `rev-${status}`, brandId: MARCA, articleId: ARTIGO, snapshotId, status, notes: "", reviewedBy: "pessoa", reviewedAt: "2026-09-21T10:00:00.000Z",
});

const resposta = (record: SerpCollectionRecord, unchanged: boolean, paidCalls: number) => radarSerpCollectOutcome({
  record, unchanged, unchangedBy: unchanged ? "cache_meta" : null,
  lensCoverage: { observed: 3, total: 4, paidCalls, cacheHits: 4 - paidCalls, codesSource: "keyword_targeting", cacheReadFailed: false, reusedLensGaps: 0 },
}, record);

const artigo = (articleId: string, overrides: Partial<RadarR4BulkArticleSnapshot> = {}): RadarR4BulkArticleSnapshot => ({
  articleId, keywordReady: true, serpCollected: false, serpReviewed: false, analysisStarted: false, reportGenerated: false,
  reportApproved: false, sentToWriter: false, rowState: "research_pending", topicsState: "NOT_PREPARED", topicsReviewed: false,
  specialistState: "NOT_REQUIRED", serpQueueState: null, amazonState: "AMAZON_NOT_APPLICABLE", ...overrides,
});

/* ========================= 1 · o teto antes do clique ========================= */

test("lote · o teto de chamadas está no rótulo, 4 por artigo", () => {
  assert.equal(radarSerpBatchButtonLabel("Iniciar lote SERP", 3), "Iniciar lote SERP (3 · até 12 chamadas)");
  assert.equal(radarSerpBatchButtonLabel("Atualizar SERP selecionada (cache primeiro)", 1), "Atualizar SERP selecionada (cache primeiro) (1 · até 4 chamadas)");
});

test("lote (DOM) · os dois botões de SERP mostram o teto antes do clique; os outros não", async () => {
  const cliques: Array<{ operation: RadarR4BulkOperation; ids: string[] }> = [];
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarR4BulkOperationsBar, {
    selectedRows: [artigo("a1"), artigo("a2"), artigo("a3"), artigo("c1", { serpCollected: true, rowState: "needs_review", serpQueueState: "WAITING_REVIEW" })],
    onAction: (operation, ids) => { cliques.push({ operation, ids }); },
  }));
  const botoes = [...tela.container.querySelectorAll("button")].map(botao => botao.textContent || "");
  assert.ok(botoes.includes("Iniciar lote SERP (3 · até 12 chamadas)"), botoes.join(" | "));
  assert.ok(botoes.includes("Atualizar SERP selecionada (cache primeiro) (1 · até 4 chamadas)"), botoes.join(" | "));
  const revisar = botoes.find(texto => texto.startsWith("Revisar SERP"));
  assert.equal(revisar, "Revisar SERP (1)", "operação que não paga não ganha teto");
  assert.equal(cliques.length, 0, "renderizar não dispara nada");
  tela.destroy();
});

test("tela da SERP · o teto do \"Atualizar SERP\" aparece antes do clique, com ou sem snapshot", async () => {
  const semSnapshot = await montarRadar();
  await semSnapshot.render(React.createElement(RadarSerpScreen, {
    view: null, records: [], keyword: "creme facial", articleDnaVersionId: "adna-1",
    refreshing: false, onRefresh: () => {}, onOpenReferences: () => {},
  }));
  assert.equal(semSnapshot.get("radar-serp-refresh-cost").textContent, "“Atualizar SERP” é cache primeiro: paga só as lentes que faltam, no máximo 4 chamadas DataForSEO.");
  semSnapshot.destroy();
});

/* ===================== 3 · "Recoletando…" só na recoleta ===================== */

async function telaDaSerp(props: { refreshing?: boolean; recollecting?: boolean }) {
  const record = registro();
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarSerpScreen, {
    view: buildRadarSerpView(record), records: [record], keyword: "creme facial", articleDnaVersionId: "adna-1",
    refreshing: props.refreshing || false, onRefresh: () => {}, onOpenReferences: () => {},
    onRecollect: () => {}, recollecting: props.recollecting,
  }));
  return tela;
}

test("recoleta paga · durante o \"Atualizar SERP\" o botão pago espera, mas não diz \"Recoletando…\"", async () => {
  const atualizando = await telaDaSerp({ refreshing: true });
  const aberto = atualizando.get("radar-serp-recollect-open") as HTMLButtonElement;
  assert.equal(aberto.disabled, true, "com uma coleta em curso, a recoleta espera");
  assert.equal(aberto.textContent, "Recoletar agora (pago)", "a tela não anuncia uma recoleta paga que não acontece");
  atualizando.destroy();

  const recoletando = await telaDaSerp({ recollecting: true });
  assert.equal(recoletando.get("radar-serp-recollect-open").textContent, "Recoletando…");
  recoletando.destroy();
});

/* ================= 2 · START sobre SERP sem mudança e rejeitada ================= */

test("START · sem mudança e rejeitada: a frase acompanha a investigação", () => {
  const record = registro();
  const rejeitada = radarSerpCollectReading({ record, outcome: resposta(record, true, 0), reviews: [revisao(record.id, "rejected")] });
  const aviso = radarStartOnRejectedSerpWarning(rejeitada);
  assert.ok(aviso);
  assert.match(aviso, /não mudou e continua rejeitada na revisão/);
  assert.match(aviso, /"Recoletar agora \(pago\)"/);

  const aprovada = radarSerpCollectReading({ record, outcome: resposta(record, true, 0), reviews: [revisao(record.id, "approved")] });
  assert.equal(radarStartOnRejectedSerpWarning(aprovada), null, "aprovada não gera aviso");
  const nova = radarSerpCollectReading({ record, outcome: resposta(record, false, 2), reviews: [revisao(record.id, "rejected")] });
  assert.equal(radarStartOnRejectedSerpWarning(nova), null, "versão nova vai à revisão; a rejeição antiga não se aplica");
  assert.equal(radarStartOnRejectedSerpWarning({ ...nova, serpError: "erro de outra origem" }), null, "só o sem-mudança herda a rejeição");
  assert.equal(radarStartOnRejectedSerpWarning(null), null);
  assert.equal(radarStartOnRejectedSerpWarning(undefined), null);
});

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(new URL(caminho, import.meta.url), "utf8"));

test("estrutura · o START lê a rejeição do resultado e a leva ao aviso final", () => {
  const pagina = ler("../modules/radar/radar-page.tsx");
  const de = pagina.indexOf("const status = await collect(target);");
  const ate = pagina.indexOf("const recuperarPesquisaPaga", de);
  assert.ok(de >= 0 && ate > de);
  const inicio = pagina.slice(de, ate);
  assert.match(inicio, /avisoDeRejeicao = radarStartOnRejectedSerpWarning\(coletado\?\.reading\);/);
  assert.match(inicio, /persistSerpAnalysis\(target\.articleId, next, avisoDeRejeicao \? `\$\{aviso\} \$\{avisoDeRejeicao\}` : aviso\)/);

  const barra = ler("../modules/radar/radar-r4-bulk-operations-bar.tsx");
  assert.match(barra, /SERP_PAID_OPERATIONS: readonly RadarR4BulkOperation\[\] = \["serp", "refreshSerp"\]/);
  assert.match(barra, /radarSerpBatchButtonLabel\(label, eligibility\.eligible\.length\)/);
});

test("REAL_PROVIDER_CALLS = 0 nesta suíte", () => {
  assert.deepEqual(tentativasDeRede, []);
});
