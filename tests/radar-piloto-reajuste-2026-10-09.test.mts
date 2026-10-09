import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";
import {
  IMPROVEMENT_NO_PENDING_SENTENCE,
  IMPROVEMENT_REINVESTIGATE_BUTTON,
  improvementReinvestigateSentence,
  resolveImprovementNextStep,
} from "../lib/arquiteto/article-improvement-next-step.ts";

/*
 * ===== 2026-10-09 · O REAJUSTE COM ARTICLEDNA NOVO =====
 *
 * "Gravar melhorias" grava uma versão nova do ArticleDNA. O cartão "Próximo
 * passo" dizia "Nada a fazer" e, no primeiro desenho desta rodada, passou a
 * prometer "Reinvestigar no Radar e reorganizar o artigo-modelo".
 *
 * (correção) Esse caminho não existe: o item que já está no Radar não é
 * atualizado pelo reajuste, e o Radar continua na versão que recebeu (a versão
 * TRANSPORTADA pelo item). O cartão diz a verdade: o artigo que ainda não foi ao
 * Radar segue no Arquiteto (Pronto para Radar e Enviar ao Radar, na aba Links
 * internos); o que já está no Radar continua na versão enviada até existir o
 * reenvio da versão nova ao Radar. O botão só abre a aba Links internos.
 *
 * Aditivo: nenhum passo antigo muda de ordem nem de texto.
 */

const D10 = /pendência|aguardando aprovação|rascunho|fonte a obter|preencher|peça ao Arquiteto|confira se a coleta traz/i;

test("gravação concluída com ArticleDNA novo: o cartão diz onde o artigo segue e não promete reinvestigar no Radar", () => {
  const passo = resolveImprovementNextStep({ hasRun: true, state: "complete", leaseActive: false, accepted: true, paidQueries: 0, costMaxUsd: 0, selectedCount: 2, readyCount: 2, hasLeftovers: true, reinvestigateCount: 2 });
  assert.equal(passo.kind, "reinvestigate");
  assert.equal(passo.button, IMPROVEMENT_REINVESTIGATE_BUTTON);
  assert.equal(passo.button, "Abrir Links internos");
  assert.equal(passo.sentence, improvementReinvestigateSentence(2));
  assert.match(passo.sentence, /^2 artigo\(s\) ganharam ArticleDNA novo\./);
  assert.match(passo.sentence, /Os que ainda não foram ao Radar seguem aqui no Arquiteto: marque Pronto para Radar e use Enviar ao Radar, na aba Links internos\./);
  assert.match(passo.sentence, /Os que já estão no Radar continuam na versão enviada até existir o reenvio da versão nova ao Radar\./);
  /* A promessa do caminho que não existe saiu da frase e do botão. */
  assert.doesNotMatch(`${passo.sentence} ${passo.button}`, /reinvestig|reorganiz|custo de cada etapa paga/i);
  assert.doesNotMatch(passo.sentence, D10);
});

test("aditivo: sem ArticleDNA novo, o cartão é o de antes; o que ficou pela metade continua vindo primeiro", () => {
  const base = { hasRun: true, leaseActive: false, accepted: true, paidQueries: 0, costMaxUsd: 0, selectedCount: 2 };
  const nada = resolveImprovementNextStep({ ...base, state: "complete", hasLeftovers: true, reinvestigateCount: 0 });
  assert.equal(nada.kind, "none");
  assert.equal(nada.sentence, IMPROVEMENT_NO_PENDING_SENTENCE);
  assert.equal(resolveImprovementNextStep({ ...base, state: "complete", hasLeftovers: true }).kind, "none", "sem o campo novo, o comportamento de sempre");
  assert.equal(resolveImprovementNextStep({ ...base, state: "applying", reinvestigateCount: 3 }).kind, "resume_apply", "a gravação parada no meio vem antes");
  assert.equal(resolveImprovementNextStep({ ...base, state: "applying", busy: true, reinvestigateCount: 3 }).kind, "working");
  assert.equal(resolveImprovementNextStep({ ...base, state: "complete", leaseActive: true, reinvestigateCount: 3 }).kind, "refresh");
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
const abas: string[] = [];
const painel = (comAba = true) => comProductShell(React.createElement(ArticleImprovementPanel, { brandId: "brand-a", onApplied: () => {}, buttonClassName: "button", primaryButtonClassName: "button", hasLeftovers: true, ...(comAba ? { onOpenLinks: () => { abas.push("links"); } } : {}) }));
const cartao = () => screen.container.querySelector<HTMLElement>("[data-testid='architect-improvement-next-step']")!;

test.beforeEach(async () => {
  screen = await montarRadar();
  destinos.length = 0;
  abas.length = 0;
  globalThis.fetch = (async (_url: unknown, options?: { method?: string }) => {
    if (!options?.method) return new Response(JSON.stringify({ success: true, data: restaurado }));
    throw new Error("nenhuma escrita neste teste");
  }) as typeof fetch;
  (window.location as unknown as { assign: (url: string) => void }).assign = (url: string) => { destinos.push(url); };
});
test.afterEach(() => screen.destroy());

test("tela · melhoria gravada: o cartão diz onde o artigo segue, com UM botão que abre a aba Links internos (e não leva ao Radar)", async () => {
  restaurado = run([{ targetId: "a", status: "improved", message: "Relido", versionId: "dna-v2" }, { targetId: "b", status: "failed", message: "Falha" }]);
  await screen.render(painel());
  assert.equal(cartao().dataset.nextStep, "reinvestigate");
  const texto = cartao().textContent || "";
  assert.match(texto, /1 artigo\(s\) ganharam ArticleDNA novo/);
  assert.match(texto, /continuam na versão enviada até existir o reenvio da versão nova ao Radar/);
  assert.doesNotMatch(texto, /Reinvestigar no Radar|reorganize o artigo-modelo/);
  const botoes = cartao().querySelectorAll("button");
  assert.equal(botoes.length, 1);
  assert.equal(botoes[0].textContent, IMPROVEMENT_REINVESTIGATE_BUTTON);
  assert.equal(botoes[0].disabled, false);
  await screen.click(botoes[0]);
  assert.deepEqual(abas, ["links"]);
  assert.deepEqual(destinos, [], "o botão não navega para o Radar");
});

test("tela · sem quem abra a aba Links internos, o botão do passo fica desligado e nada navega", async () => {
  window.history.pushState({}, "", "/marca-teste--brand-a/arquiteto");
  try {
    restaurado = run([{ targetId: "a", status: "improved", message: "Relido" }, { targetId: "b", status: "improved", message: "Relido" }]);
    await screen.render(painel(false));
    assert.match(cartao().textContent || "", /2 artigo\(s\) ganharam ArticleDNA novo/);
    const botao = cartao().querySelector("button")!;
    assert.equal(botao.disabled, true);
    await screen.click(botao);
    assert.deepEqual(destinos, []);
    assert.deepEqual(abas, []);
  } finally {
    window.history.pushState({}, "", "/");
  }
});

test("o Arquiteto liga o botão do passo à aba Links internos (onde ficam Aplicar status e Enviar ao Radar)", async () => {
  const { readFile } = await import("node:fs/promises");
  const fonte = (await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, " ");
  const montagem = fonte.slice(fonte.indexOf("<ArticleImprovementPanel"), fonte.indexOf("/>", fonte.indexOf("<ArticleImprovementPanel")));
  assert.match(montagem, /onOpenLinks=\{\(\) => setWorkspaceMode\("links"\)\}/);
  const painelFonte = (await readFile(new URL("../modules/arquiteto/article-improvement-panel.tsx", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  assert.doesNotMatch(painelFonte, /window\.location\.assign|\/radar`/, "o cartão voltou a levar ao Radar");
});

test("tela · sem melhoria gravada (só falha ou nada), o cartão é o de antes", async () => {
  restaurado = run([{ targetId: "a", status: "failed", message: "Falha" }]);
  await screen.render(painel());
  assert.equal(cartao().dataset.nextStep, "none");
  assert.match(cartao().textContent || "", /Nada a fazer nos publicados agora/);
});
