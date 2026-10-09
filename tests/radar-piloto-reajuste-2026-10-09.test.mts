import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";
import * as proximoPasso from "../lib/arquiteto/article-improvement-next-step.ts";

const { IMPROVEMENT_NO_PENDING_SENTENCE, resolveImprovementNextStep } = proximoPasso;

/*
 * ===== 2026-10-09 · O ARQUITETO NÃO SE ADAPTA AO RADAR =====
 *
 * A rodada "piloto em tudo" pôs no cartão "Próximo passo" do Arquiteto um passo
 * novo depois de "Melhoria gravada" ("reinvestigate", com o botão "Abrir Links
 * internos"). Regra do dono, no mesmo dia: "no arquiteto não tem que mexer mais
 * nada… não é o arquiteto que tem que se adaptar ao radar, é o radar". O passo
 * saiu e o cartão voltou a ser o de antes da rodada (commit 638a807): os três
 * arquivos do Arquiteto estão idênticos a ele.
 *
 * Estes testes guardam a reversão: nenhum passo, prop ou texto do Radar volta
 * ao cartão do Arquiteto sem pedido do dono.
 */

test("o cartão do Arquiteto não tem passo do Radar: melhoria gravada termina como antes da rodada", () => {
  const base = { hasRun: true, leaseActive: false, accepted: true, paidQueries: 0, costMaxUsd: 0, selectedCount: 2, readyCount: 2 };
  const concluido = resolveImprovementNextStep({ ...base, state: "complete", hasLeftovers: true });
  assert.equal(concluido.kind, "none");
  assert.equal(concluido.sentence, IMPROVEMENT_NO_PENDING_SENTENCE);
  assert.equal(resolveImprovementNextStep({ ...base, state: "applying" }).kind, "resume_apply", "a gravação parada no meio continua vindo primeiro");
  assert.equal(resolveImprovementNextStep({ ...base, state: "complete", leaseActive: true }).kind, "refresh");
  assert.equal("IMPROVEMENT_REINVESTIGATE_BUTTON" in proximoPasso, false);
  assert.equal("improvementReinvestigateSentence" in proximoPasso, false);
});

/* ============================== a tela ============================== */

let screen: RadarDomScreen;
let restaurado: unknown;
const destinos: string[] = [];
const run = (outcomes: Array<{ targetId: string; status: string; message: string; versionId?: string }>) => ({
  brandId: "brand-a", runId: "run", decisionHash: "a".repeat(64), state: "complete", acceptedIds: ["a", "b"], leaseUntil: null,
  costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] },
  keywords: [{ id: "old", keyword: "tema antigo", volumeValidated: false }, { id: "new", keyword: "demanda nova", volume: 50, volumeValidated: true }],
  proposals: ["a", "b"].map(id => ({ targetId: id, kind: "published", theme: `Publicado ${id}`, currentPrimaryId: "old", principalId: "new", memberIds: ["old", "new"], addIds: ["new"], removeIds: [], transfers: [], angle: null, exclusions: [], reasons: ["Cache completo"], status: "ready" })),
  notices: [], outcomes,
});
const painel = () => comProductShell(React.createElement(ArticleImprovementPanel, { brandId: "brand-a", onApplied: () => {}, buttonClassName: "button", primaryButtonClassName: "button", hasLeftovers: true }));
const cartao = () => screen.container.querySelector<HTMLElement>("[data-testid='architect-improvement-next-step']")!;

test.beforeEach(async () => {
  screen = await montarRadar();
  destinos.length = 0;
  globalThis.fetch = (async (_url: unknown, options?: { method?: string }) => {
    if (!options?.method) return new Response(JSON.stringify({ success: true, data: restaurado }));
    throw new Error("nenhuma escrita neste teste");
  }) as typeof fetch;
  (window.location as unknown as { assign: (url: string) => void }).assign = (url: string) => { destinos.push(url); };
});
test.afterEach(() => screen.destroy());

test("tela · melhoria gravada: o cartão é o de antes da rodada, sem frase nem botão do Radar", async () => {
  restaurado = run([{ targetId: "a", status: "improved", message: "Relido", versionId: "dna-v2" }, { targetId: "b", status: "failed", message: "Falha" }]);
  await screen.render(painel());
  assert.equal(cartao().dataset.nextStep, "none");
  const texto = cartao().textContent || "";
  assert.match(texto, /Nada a fazer nos publicados agora/);
  assert.doesNotMatch(texto, /ArticleDNA novo|Radar|Links internos|reinvestig/i);
  assert.deepEqual(destinos, []);
});

test("a montagem do painel no Arquiteto não recebe prop vinda do Radar", async () => {
  const { readFile } = await import("node:fs/promises");
  const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const fonte = semComentarios(await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"));
  const montagem = fonte.slice(fonte.indexOf("<ArticleImprovementPanel"), fonte.indexOf("/>", fonte.indexOf("<ArticleImprovementPanel")));
  assert.doesNotMatch(montagem, /onOpenLinks|radarHref/);
  const painelFonte = semComentarios(await readFile(new URL("../modules/arquiteto/article-improvement-panel.tsx", import.meta.url), "utf8"));
  assert.doesNotMatch(painelFonte, /reinvestigate|onOpenLinks|window\.location\.assign|\/radar`/);
});
