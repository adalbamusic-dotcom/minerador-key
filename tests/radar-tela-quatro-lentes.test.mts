import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { RadarSerpScreen } from "../modules/radar/radar-serp-screen.tsx";
import { RadarFrozenLensSummary } from "../modules/radar/radar-serp-lens-coverage.tsx";
import {
  emptyRadarSerpBatchTally,
  radarFinalizeReadbackNotice,
  radarFinalizeSuccessMessage,
  radarSerpBatchQueueState,
  radarSerpBatchStartNotice,
  radarSerpBatchSummary,
  radarSerpCollectReading,
  tallyRadarSerpBatch,
} from "../modules/radar/radar-serp-collect-notices.ts";
import { radarAuxiliaryLensLabel, radarCanonicalLensLabel, radarFrozenLensView } from "../modules/radar/radar-serp-lens-view.ts";
import { buildRadarSerpView } from "../lib/radar/snapshot-view.ts";
import { buildRadarSerpLensCoverage } from "../lib/radar/serp-lens-coverage.ts";
import { radarSerpCollectOutcome } from "../lib/radar/serp/request.ts";
import type { SerpCollectionRecord, SerpReviewRecord } from "../lib/editorial/contracts.ts";
import { radarFrozenSerpLensesFromLensSet } from "../lib/radar/serp/frozen-lenses.ts";
import { ARTIGO, MARCA, blocoCongelado, conjuntoDeLentes, pesquisa, registro } from "./radar-tela-quatro-lentes-fixtures.mts";

/*
 * A TELA DAS QUATRO LENTES — adendos R2 (§6 e §10) e R3.
 *
 * O modelo já estava pronto e testado em `lib/radar/serp-lens-coverage.ts`;
 * aqui se prova o que a tela faz com ele: "SERP · K de 4 lentes" com uma linha
 * por lente, a recoleta que só paga DEPOIS da confirmação com o número de
 * chamadas, o "sem mudança" que não anuncia versão nova, e a mensagem do
 * FINALIZE com o hash GRAVADO (o do readback), não o do navegador.
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

/* ================================ fixtures ================================ */

const revisao = (snapshotId: string, status: "approved" | "rejected"): SerpReviewRecord => ({
  id: `rev-${status}`, brandId: MARCA, articleId: ARTIGO, snapshotId, status, notes: "", reviewedBy: "pessoa", reviewedAt: "2026-09-21T10:00:00.000Z",
});

/* O corpo que `POST /api/editorial/serp` devolve (adendo R2, §2 e §10). */
const resposta = (record: SerpCollectionRecord, unchanged: boolean, paidCalls: number, extra: Record<string, unknown> = {}) => radarSerpCollectOutcome({
  record, unchanged, unchangedBy: unchanged ? "cache_meta" : null,
  lensCoverage: { observed: 3, total: 4, paidCalls, cacheHits: 4 - paidCalls, codesSource: "keyword_targeting", cacheReadFailed: false, reusedLensGaps: 0, ...extra },
}, record);

/* ========================= sem mudança (comportamento) ========================= */

test("sem mudança · a tela diz que a SERP não mudou e não anuncia versão nova", () => {
  const record = registro();
  const leitura = radarSerpCollectReading({ record, outcome: resposta(record, true, 0), reviews: [] });

  assert.equal(leitura.status, "UNCHANGED");
  assert.equal(leitura.unchanged, true);
  assert.match(leitura.notice, /^A SERP não mudou: continua valendo a v3 já gravada \(2 resultado\(s\) · 3 de 4 lentes\)\. Nenhuma versão nova foi aberta\./);
  assert.match(leitura.notice, /Nenhuma chamada DataForSEO paga: as lentes vieram do cache\./);
  assert.doesNotMatch(leitura.notice, /SERP real v/, "sem mudança não anuncia coleta nova");
  assert.doesNotMatch(leitura.notice, /Persistência remota confirmada/, "nada foi gravado agora");
  assert.equal(leitura.serpState, "WAITING_REVIEW", "sem revisão gravada, o estado é o do snapshot gravado");
  assert.equal(leitura.paidCalls, 0);
});

test("sem mudança · revisão gravada continua valendo; rejeição também", () => {
  const record = registro();
  const aprovada = radarSerpCollectReading({ record, outcome: resposta(record, true, 0), reviews: [revisao(record.id, "approved")] });
  assert.equal(aprovada.serpState, "COMPLETED", "a revisão não é reaberta por um clique que não mudou nada");
  assert.equal(aprovada.serpError, null);

  const rejeitada = radarSerpCollectReading({ record, outcome: resposta(record, true, 0), reviews: [revisao(record.id, "rejected")] });
  assert.equal(rejeitada.serpState, "COMPLETED");
  assert.ok(rejeitada.serpError, "a rejeição fica dita no estado");
  assert.match(rejeitada.notice, /A revisão que rejeitou esta SERP continua valendo para o mesmo conteúdo\./);

  const deOutroSnapshot = radarSerpCollectReading({ record, outcome: resposta(record, true, 0), reviews: [revisao("serp:outro", "approved")] });
  assert.equal(deOutroSnapshot.serpState, "WAITING_REVIEW", "revisão de outro snapshot não conta");
});

test("sem mudança na recoleta paga · diz que pagou e que nada mudou", () => {
  const record = registro();
  const leitura = radarSerpCollectReading({ record, outcome: resposta(record, true, 4), reviews: [], recollect: true });
  assert.match(leitura.notice, /^A SERP não mudou na recoleta paga:/);
  assert.match(leitura.notice, /4 chamada\(s\) DataForSEO paga\(s\)\./);
  assert.equal(leitura.paidCalls, 4);
});

test("com mudança · versão nova, lentes, chamadas pagas e persistência", () => {
  const record = registro();
  const leitura = radarSerpCollectReading({ record, outcome: resposta(record, false, 4, { cacheReadFailed: true }), reviews: [revisao(record.id, "approved")] });
  assert.equal(leitura.status, "WAITING_REVIEW");
  assert.equal(leitura.serpState, "WAITING_REVIEW", "versão nova aguarda revisão");
  assert.equal(leitura.notice, "SERP real v3 coletada: 2 resultado(s) · 3 de 4 lentes. 4 chamada(s) DataForSEO paga(s). O cache estava indisponível: as lentes foram pagas sem consultar o que já existia. Persistência remota confirmada.");

  const servidorAntigo = radarSerpCollectReading({ record, outcome: null, reviews: [] });
  assert.equal(servidorAntigo.notice, "SERP real v3 coletada: 2 resultado(s). Persistência remota confirmada.", "resposta sem os campos novos segue como coleta nova");
  assert.equal(servidorAntigo.paidCalls, null);
});

/* ================================ o lote ================================ */

test("lote · cache primeiro com o teto de chamadas ANTES, sem recoleta paga", () => {
  const inicio = radarSerpBatchStartNotice({ mode: "explicit_refresh", articles: 3 });
  assert.match(inicio, /^Atualização \(cache primeiro\) iniciada para 3 artigo\(s\)\./);
  assert.match(inicio, /até 12 chamada\(s\) DataForSEO \(4 por artigo\)/);
  assert.match(inicio, /"Recoletar agora \(pago\)" na SERP do artigo/);
  assert.match(radarSerpBatchStartNotice({ mode: "default", articles: 1 }), /^Lote SERP iniciado para 1 artigo\(s\), em sequência\. Cache primeiro: .*até 4 chamada\(s\)/);

  let contagem = emptyRadarSerpBatchTally();
  contagem = tallyRadarSerpBatch(contagem, "WAITING_REVIEW", 4);
  contagem = tallyRadarSerpBatch(contagem, "UNCHANGED", 0);
  contagem = tallyRadarSerpBatch(contagem, "UNCHANGED", null);
  contagem = tallyRadarSerpBatch(contagem, "FAILED_RETRYABLE", 3);
  contagem = tallyRadarSerpBatch(contagem, "FAILED_FINAL", null);
  assert.deepEqual(contagem, { waitingReview: 1, unchanged: 2, failedRetryable: 1, failedFinal: 1, paidCalls: 4, paidCallsUnknown: 1 });
  assert.equal(radarSerpBatchSummary(contagem), "Lote SERP concluído: 1 com versão nova aguardando revisão, 2 sem mudança (nenhuma versão nova), 1 retry disponível e 1 falha(s) final(is). Chamadas DataForSEO pagas: 4 informada(s); 1 coleta(s) não informaram o número.");

  assert.equal(radarSerpBatchQueueState("UNCHANGED", "COMPLETED"), "COMPLETED");
  assert.equal(radarSerpBatchQueueState("UNCHANGED", "WAITING_REVIEW"), "WAITING_REVIEW");
  assert.equal(radarSerpBatchQueueState("UNCHANGED", null), "COMPLETED");
  assert.equal(radarSerpBatchQueueState("WAITING_REVIEW", "COMPLETED"), "WAITING_REVIEW");
  assert.equal(radarSerpBatchQueueState("FAILED_FINAL", null), "FAILED_FINAL");
});

/* ============================== o FINALIZE ============================== */

test("FINALIZE · a mensagem cita o hash do READBACK, nunca o calculado no navegador", () => {
  const vigia = { articleId: ARTIGO, versionId: "analise-v2", sufficiencyLabel: "Suficiente" };
  const semAVersao = [{ articleId: ARTIGO, analysisVersions: [{ versionId: "analise-v1", payload: { finalizedBundle: null } }] }];
  assert.equal(radarFinalizeReadbackNotice(vigia, semAVersao), null, "antes do readback chegar, espera");

  const navegador = { bundleId: "bundle:2f9c1a77", bundleHash: "bundle-hash:navegador" };
  const gravado = { bundleId: "bundle:2f9c1a77", bundleHash: "bundle-hash:gravado0" };
  const relido = [
    { articleId: "outro-artigo", analysisVersions: [{ versionId: "analise-v2", payload: { finalizedBundle: navegador } }] },
    { articleId: ARTIGO, analysisVersions: [{ versionId: "analise-v1", payload: { finalizedBundle: null } }, { versionId: "analise-v2", payload: { finalizedBundle: gravado } }] },
  ];
  const frase = radarFinalizeReadbackNotice(vigia, relido);
  assert.equal(frase, "Investigação finalizada e congelada: Suficiente. Evidências bundle:2f9c1a77 · hash bundle-hash:gravado0 (o gravado no servidor). Persistência remota e readback confirmados.");
  assert.doesNotMatch(frase || "", /navegador/);

  const provisoria = radarFinalizeSuccessMessage({ sufficiencyLabel: "Suficiente", stored: null });
  assert.equal(provisoria, "Investigação finalizada e congelada: Suficiente. Persistência remota e readback confirmados.");
  assert.doesNotMatch(provisoria, /hash/, "até o readback, nenhum hash é citado");

  const semPacote = radarFinalizeReadbackNotice(vigia, [{ articleId: ARTIGO, analysisVersions: [{ versionId: "analise-v2", payload: {} }] }]);
  assert.match(semPacote || "", /a versão relida não trouxe o pacote congelado/);
});

/* =========================== lentes congeladas =========================== */

test("lentes congeladas · cópia do bundle, legado e ausência — ditos sem inventar lente", () => {
  assert.equal(radarFrozenLensView(null), null, "investigação aberta não tem fotografia");

  const legado = radarFrozenLensView({ frozenAt: "2026-09-10T18:00:00.000Z" });
  assert.equal(legado?.state, "legacy");
  assert.equal(legado?.label, "Lentes não congeladas (investigação finalizada antes de 2026-09-23).");
  assert.deepEqual(legado?.rows, []);

  const semConferencia = radarFrozenLensView({ frozenAt: "2026-09-24T09:00:00.000Z" });
  assert.equal(semConferencia?.state, "absent");
  assert.match(semConferencia?.label || "", /^Lentes não congeladas nesta investigação/);

  const congelado = radarFrozenLensView({ frozenAt: "2026-09-23T15:00:00.000Z", search: { lenses: blocoCongelado() } } as { frozenAt: string });
  assert.equal(congelado?.state, "frozen");
  assert.equal(congelado?.label, "Lentes congeladas no FINALIZE · 3 de 4");
  assert.equal(congelado?.shortLabel, "3 de 4 congeladas");
  assert.deepEqual(congelado?.rows.map(linha => linha.name), ["Desktop · Windows", "Desktop · macOS", "Celular · Android", "Celular · iOS"]);
  assert.match(congelado?.rows[3].detail || "", /^Faltou: Falha HTTP 500/);
  assert.equal(congelado?.rows[2].detail, "Pago na coleta · Radar · 2 orgânico(s)");
  assert.deepEqual(congelado?.auxiliary, [{ queryId: "q-aux", keyword: "creme para pele oleosa", label: "3 de 4 lentes · faltou Celular · iOS" }]);
  assert.ok(congelado?.notes.some(nota => nota.startsWith("Só em Celular · Android")), "a divergência entre aparelhos vira limitação escrita");

  const adulterado = blocoCongelado();
  adulterado!.lenses[0].organicCount = 9;
  assert.equal(radarFrozenLensView({ frozenAt: "2026-09-23T15:00:00.000Z", search: { lenses: adulterado } } as { frozenAt: string })?.state, "absent", "bloco que não confere com o próprio hash não é lido como cópia");
});

test("lentes da auxiliar e da canônica · o rótulo da coluna", () => {
  assert.equal(radarAuxiliaryLensLabel(undefined), null, "evidência anterior às lentes");
  assert.equal(radarAuxiliaryLensLabel(radarFrozenSerpLensesFromLensSet(conjuntoDeLentes())), "3 de 4 lentes · faltou Celular · iOS");
  assert.equal(radarCanonicalLensLabel(buildRadarSerpLensCoverage(pesquisa() as never)), "3 de 4 lentes");
  assert.equal(radarCanonicalLensLabel(buildRadarSerpLensCoverage(registro({ lensSet: undefined, cacheProvenance: undefined }).research)), "1 lente (anterior às quatro lentes)");
  assert.equal(radarCanonicalLensLabel(buildRadarSerpLensCoverage(null)), null);
});

/* ============================== a tela (DOM) ============================== */

async function telaDaSerp(props: { onRecollect?: () => void; onRefresh?: () => void; recollecting?: boolean; recollectBlockedReason?: string | null; record?: SerpCollectionRecord }) {
  const record = props.record || registro();
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarSerpScreen, {
    view: buildRadarSerpView(record), records: [record], keyword: "creme facial", articleDnaVersionId: "adna-1",
    refreshing: false, onRefresh: props.onRefresh || (() => {}), onOpenReferences: () => {},
    onRecollect: props.onRecollect, recollecting: props.recollecting, recollectBlockedReason: props.recollectBlockedReason,
  }));
  return tela;
}

test("tela da SERP · \"SERP · 3 de 4 lentes\", uma linha por lente e o que veio de um aparelho só", async () => {
  const tela = await telaDaSerp({ onRecollect: () => {} });
  assert.equal(tela.get("radar-serp-lens-label").textContent, "SERP · 3 de 4 lentes");
  const linhas = tela.all("radar-serp-lens-row");
  assert.deepEqual(linhas.map(linha => linha.getAttribute("data-lens")), ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  assert.equal(linhas[3].getAttribute("data-observed"), "false");
  assert.match(linhas[3].textContent || "", /Faltou: Falha HTTP 500/);
  assert.match(linhas[0].textContent || "", /Cache · pago pelo Minerador/);
  assert.match(linhas[2].textContent || "", /Pago nesta coleta · Radar/);
  assert.match(tela.get("radar-serp-lens-exclusive").textContent || "", /so-no-android\.com\.br/);
  assert.match(tela.get("radar-serp-lens-notes").textContent || "", /Celular · iOS não entrou nesta coleta/);
  const texto = tela.text();
  assert.match(texto, /SERP observada em/);
  assert.match(texto, /Versão aberta em/);
  assert.doesNotMatch(texto, /Capturado em/, "a data do conteúdo não é rotulada como captura da versão");
  tela.destroy();
});

test("tela da SERP · snapshot anterior às lentes diz uma lente só, sem inventar linha", async () => {
  const tela = await telaDaSerp({ onRecollect: () => {}, record: registro({ lensSet: undefined, cacheProvenance: undefined }) });
  assert.equal(tela.get("radar-serp-lens-label").textContent, "SERP · 1 lente (coleta anterior às quatro lentes)");
  assert.equal(tela.all("radar-serp-lens-row").length, 0);
  tela.destroy();
});

test("recoleta paga · a confirmação com o número de chamadas vem ANTES de pagar", async () => {
  let recoletas = 0;
  let atualizacoes = 0;
  const tela = await telaDaSerp({ onRecollect: () => { recoletas += 1; }, onRefresh: () => { atualizacoes += 1; } });

  assert.equal(tela.query("radar-serp-recollect-confirmation"), null, "fechada ao abrir a tela");
  await tela.click("radar-serp-recollect-open");
  const confirmacao = tela.get("radar-serp-recollect-confirmation");
  assert.match(confirmacao.textContent || "", /Isto paga até 4 chamadas DataForSEO, uma por lente, mesmo com a SERP válida no cache/);
  assert.equal(tela.get("radar-serp-recollect-confirm").textContent, "Pagar até 4 chamadas");
  assert.equal(recoletas, 0, "abrir a confirmação não paga nada");

  await tela.click("radar-serp-recollect-cancel");
  assert.equal(tela.query("radar-serp-recollect-confirmation"), null);
  assert.equal(recoletas, 0, "cancelar não paga nada");

  await tela.click("radar-serp-recollect-open");
  await tela.click("radar-serp-recollect-confirm");
  assert.equal(recoletas, 1, "só a confirmação chama a recoleta");
  assert.equal(tela.query("radar-serp-recollect-confirmation"), null);
  assert.equal(atualizacoes, 0, "\"Atualizar SERP\" (cache primeiro) é outra porta");
  tela.destroy();
});

test("recoleta paga · bloqueada ou em curso não abre a confirmação", async () => {
  let recoletas = 0;
  const bloqueada = await telaDaSerp({ onRecollect: () => { recoletas += 1; }, recollectBlockedReason: "A investigação deste artigo foi finalizada." });
  assert.equal((bloqueada.get("radar-serp-recollect-open") as HTMLButtonElement).disabled, true);
  assert.match(bloqueada.get("radar-serp-recollect-blocked").textContent || "", /finalizada/);
  await bloqueada.click("radar-serp-recollect-open");
  assert.equal(bloqueada.query("radar-serp-recollect-confirmation"), null);
  bloqueada.destroy();

  const emCurso = await telaDaSerp({ onRecollect: () => { recoletas += 1; }, recollecting: true });
  assert.equal(emCurso.get("radar-serp-recollect-open").textContent, "Recoletando…");
  assert.equal((emCurso.get("radar-serp-recollect-open") as HTMLButtonElement).disabled, true);
  const atualizar = [...emCurso.container.querySelectorAll("button")].find(botao => /Atualizar SERP/.test(botao.textContent || "")) as HTMLButtonElement | undefined;
  assert.equal(atualizar?.disabled, true, "com a recoleta em curso, \"Atualizar SERP\" também espera");
  assert.equal(recoletas, 0);
  emCurso.destroy();

  const semHandler = await telaDaSerp({});
  assert.equal(semHandler.query("radar-serp-recollect"), null, "sem quem pague, o botão não aparece");
  semHandler.destroy();
});

test("lentes congeladas na tela · legado numa linha discreta; cópia com as auxiliares", async () => {
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarFrozenLensSummary, { view: radarFrozenLensView({ frozenAt: "2026-09-10T18:00:00.000Z" })! }));
  const aviso = tela.get("radar-frozen-lenses-absent");
  assert.equal(aviso.getAttribute("data-state"), "legacy");
  assert.equal(aviso.textContent, "Lentes não congeladas (investigação finalizada antes de 2026-09-23).");
  assert.equal(tela.all("radar-serp-lens-row").length, 0);

  await tela.render(React.createElement(RadarFrozenLensSummary, { view: radarFrozenLensView({ frozenAt: "2026-09-23T15:00:00.000Z", search: { lenses: blocoCongelado() } } as { frozenAt: string })! }));
  assert.equal(tela.get("radar-frozen-lenses-label").textContent, "Lentes congeladas no FINALIZE · 3 de 4");
  assert.equal(tela.all("radar-serp-lens-row").length, 4);
  assert.match(tela.get("radar-frozen-lenses-auxiliary").textContent || "", /creme para pele oleosa3 de 4 lentes · faltou Celular · iOS/);
  tela.destroy();
});

/* ============================== a estrutura ============================== */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(new URL(caminho, import.meta.url), "utf8"));
const trecho = (fonte: string, inicio: string, fim: string) => {
  const de = fonte.indexOf(inicio);
  assert.ok(de >= 0, `âncora não encontrada: ${inicio}`);
  const ate = fonte.indexOf(fim, de + inicio.length);
  assert.ok(ate > de, `fim não encontrado: ${fim}`);
  return fonte.slice(de, ate);
};

test("estrutura · a coleta e o lote leem o resultado; o lote não manda recoleta paga", () => {
  const pagina = ler("../modules/radar/radar-page.tsx");
  const coleta = trecho(pagina, "const collect = async", "const radarItemForArticleId");
  assert.match(coleta, /await coletarSerpDoProvider\(row, \{ onOutcome: resultado => \{ capturado\.outcome = resultado; \} \}\)/);
  assert.match(coleta, /radarSerpCollectReading\(\{ record, outcome: capturado\.outcome, reviews: pipeline\.serpReviews \}\)/);
  assert.match(coleta, /state: leitura\.serpState/, "o estado local sai do resultado, não de um WAITING_REVIEW fixo");
  assert.match(coleta, /setNotice\(leitura\.notice\)/);
  assert.match(coleta, /return leitura\.status;/);
  assert.doesNotMatch(pagina, /SERP real v\$\{/, "o aviso fixo de versão nova saiu da página");

  const lote = trecho(pagina, "const startSerpBatch = async", "const reviewSelected");
  assert.doesNotMatch(lote, /recollect/, "o lote é cache primeiro: nenhuma recoleta paga em lote");
  assert.match(lote, /radarSerpBatchStartNotice\(\{ mode, articles: queue\.articleIds\.length \}\)/);
  assert.match(lote, /radarSerpBatchQueueState\(outcome, leitura\?\.serpState \?\? null\)/);
  assert.match(lote, /setNotice\(radarSerpBatchSummary\(contagem\)\)/);
  assert.doesNotMatch(pagina, /recollect: true/, "a página operacional não tem caminho de recoleta paga");

  const inicio = trecho(pagina, "const status = await collect(target);", "if (!research)");
  assert.match(inicio, /status === "WAITING_REVIEW" \|\| status === "UNCHANGED"/, "sem mudança continua sendo a SERP canônica da pesquisa");

  assert.match(ler("../modules/radar/radar-r4-bulk-operations-bar.tsx"), /label: "Atualizar SERP selecionada \(cache primeiro\)"/);
});

test("estrutura · a mensagem do FINALIZE não cita o hash do navegador e espera o readback", () => {
  const pagina = ler("../modules/radar/radar-page.tsx");
  const finalizar = trecho(pagina, "const finalizeInvestigation = async", "releaseSerpAction(target.articleId, \"decision\"); }");
  assert.doesNotMatch(finalizar, /congelamento\.bundle\.bundleHash/, "o hash calculado no navegador saiu da frase");
  assert.match(finalizar, /successMessage: radarFinalizeSuccessMessage\(\{ sufficiencyLabel: suficiencia, stored: null \}\)/);
  assert.match(finalizar, /if \(desfecho\.status === "SUCCEEDED"\) setFinalizeReadback\(\{ articleId: target\.articleId, versionId: next\.versionId, sufficiencyLabel: suficiencia \}\);/);
  assert.match(pagina, /const avisoDoReadback = finalizeReadback \? radarFinalizeReadbackNotice\(finalizeReadback, pipeline\.radarItems\) : null;/);
  assert.match(pagina, /if \(finalizeReadback && avisoDoReadback !== null\) \{ setFinalizeReadback\(null\); setNotice\(avisoDoReadback\); \}/);
});

test("estrutura · a rota do artigo pede a recoleta só pela confirmação da tela da SERP", () => {
  const analise = ler("../modules/radar/radar-analysis-page.tsx");
  const coleta = trecho(analise, "const collectCurrentSerp = async", "const patchAnalysis");
  assert.match(coleta, /pipeline\.collectSerp\(articleId, [^)]*row\.articleDnaVersionId, \{ recollect, onOutcome: resultado => \{ capturado\.outcome = resultado; \} \}\)/);
  assert.match(coleta, /setNotice\(radarSerpCollectReading\(\{ record, outcome: capturado\.outcome, reviews: pipeline\.serpReviews, recollect \}\)\.notice\)/);
  assert.doesNotMatch(analise, /SERP real v\$\{/);
  assert.equal((analise.match(/collectCurrentSerp\(true\)/g) || []).length, 1, "um caminho só até a recoleta paga");
  assert.match(analise, /onRecollect=\{\(\) => void collectCurrentSerp\(true\)\}/);

  const tela = ler("../modules/radar/radar-serp-screen.tsx");
  assert.match(tela, /<RadarSerpRecollectAction onConfirm=\{onRecollect\}/);
  assert.doesNotMatch(tela, /onClick=\{onRecollect\}/, "o botão não chama a recoleta direto");

  const componente = ler("../modules/radar/radar-serp-lens-coverage.tsx");
  assert.equal((componente.match(/onConfirm\(\)/g) || []).length, 1, "um único lugar chama quem paga");
  assert.match(componente, /onClick=\{\(\) => \{ setAberta\(false\); onConfirm\(\); \}\} data-testid="radar-serp-recollect-confirm"/);
  assert.match(componente, /onClick=\{\(\) => setAberta\(true\)\}[^>]*data-testid="radar-serp-recollect-open"/);
});

test("REAL_PROVIDER_CALLS = 0 nesta suíte", () => {
  assert.deepEqual(tentativasDeRede, []);
});
