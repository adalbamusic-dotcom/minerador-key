import assert from "node:assert/strict";
import test from "node:test";

/*
 * ===== 2026-10-18 · "VER E ADOTAR" SOBRE A INVESTIGAÇÃO CONGELADA — pelo botão =====
 *
 * O defeito do teste real (WifiConecta): "Adotar a versão nova (0)" desligado
 * com "Não dá para adotar agora: A investigação está congelada (Google)…".
 * Agora a prévia da tela (continueOnScreen=1) traz o item adotável com o que
 * é reaproveitado, o que é coletado, a IA e o teto; o clique em "Adotar a
 * versão nova (1)" manda continueOnScreen e entrega à página os artigos que
 * seguem para o congelamento novo. Clique real (happy-dom), fetch em memória.
 */

type Resposta = { status: number; body: unknown };
const chamadas: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
let roteiro: (url: string, method: string, body: Record<string, unknown> | null) => Resposta = () => ({ status: 500, body: {} });
Object.defineProperty(globalThis, "fetch", {
  value: (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(init.body) : null;
    chamadas.push({ url, method, body });
    const resposta = roteiro(url, method, body);
    return Promise.resolve({ ok: resposta.status >= 200 && resposta.status < 300, status: resposta.status, json: async () => resposta.body });
  },
  writable: true, configurable: true,
});

const harness = await import("./radar-dom-harness.mts");
const React = harness.React;
const { RadarArchitectUpdatePanel } = await import("../modules/radar/radar-architect-update-panel.tsx");
const { radarArchitectAdoptionDecisionHash, radarArchitectAdoptionPlan } = await import("../lib/radar/architect-update.ts");

const MARCA = "11111111-aaaa-4aaa-8aaa-0000000000aa";
const esperar = () => React.act(async () => { for (let i = 0; i < 8; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); });

const plano = radarArchitectAdoptionPlan({
  classification: "composition_changed", hasAnalysis: true, hasGoogleResearch: true, hasYoutubeRun: false, hasAmazonRun: false, linksCoverNewVersion: null,
  refreeze: { sentToWriter: false, canonicalReused: true, newKeywords: ["internet instalação", "instalação de internet"], keptAuxiliaryMissing: 0, keptAuxiliaryReused: 1, youtubeFrozen: false, amazonFrozen: false, fromVersionNumber: 2, toVersionNumber: 3 },
});
const SUPORTE = {
  articleId: "instalacao", itemId: "wf-instalacao", lockVersion: 7, title: "Instalação de internet: como funciona", slug: "instalacao-de-internet", siloId: "silo-1", siloName: "Internet residencial",
  state: "research_pending", label: "Atualização disponível do Arquiteto · v2 → v3", from: { versionId: "v2", versionNumber: 2 }, to: { versionId: "v3", versionNumber: 3 },
  classification: "composition_changed", classificationLabel: "Composição mudou (principal igual): vale o que foi coletado das keywords que ficaram",
  changes: [{ field: "keywords_added", label: "Keywords que entraram", before: null, after: "internet instalação (secundária), instalação de internet (secundária)" }],
  plan: plano, adoptable: true, refusal: null, itemHash: "c".repeat(64),
};

test("congelada · pelo botão: a prévia diz reaproveitado, coletado, IA e teto; 'Adotar a versão nova (1)' manda continueOnScreen e entrega o artigo ao congelamento novo", async () => {
  let adotou = false;
  roteiro = (url, method) => {
    if (method === "GET" && url.startsWith("/api/editorial/radar-architect-update?")) return { status: 200, body: { ok: true, items: adotou ? [] : [SUPORTE], adoptable: 1, refused: 0 } };
    if (method === "POST") {
      adotou = true;
      return { status: 200, body: { ok: true, state: "APPLIED", adopted: 1, refused: 0, readbackConfirmed: true, results: [{ articleId: "instalacao", status: "adopted", title: SUPORTE.title, from: 2, to: 3, redo: plano.redo, classification: "composition_changed", lockVersion: 8, refreeze: true }] } };
    }
    return { status: 404, body: {} };
  };
  const entregues: Array<{ mensagem: string; ids: string[] | undefined }> = [];
  const tela = await harness.montarRadar();
  await tela.render(harness.comProductShell(React.createElement(RadarArchitectUpdatePanel, {
    brandId: MARCA, articleIds: ["instalacao"], onAdopted: (mensagem: string, ids?: string[]) => { entregues.push({ mensagem, ids }); },
  })));
  await esperar();
  assert.ok(chamadas[0].url.includes("continueOnScreen=1"), "a prévia da tela é a do congelamento novo");
  await tela.click("radar-architect-update-open");
  const texto = tela.text();
  assert.doesNotMatch(texto, /Não dá para adotar agora/);
  assert.match(texto, /Keywords que entraram: — → internet instalação \(secundária\), instalação de internet \(secundária\)/);
  assert.match(texto, /Reaproveitado, sem nova cobrança: a SERP da principal \(4 lentes\)/);
  assert.match(texto, /coleta só o que falta: a SERP das keywords novas \(internet instalação, instalação de internet\)/);
  assert.match(texto, /congelada de novo sobre a v3/);
  assert.match(texto, /artigo-modelo da SERP é organizado de novo/);
  assert.match(texto, /DataForSEO: no máximo 8 chamada\(s\)/);
  assert.match(texto, /IA: até 2 chamada\(s\)/);
  assert.equal(tela.get("radar-architect-update-confirm").textContent, "Adotar a versão nova (1)");
  assert.equal((tela.get("radar-architect-update-confirm") as HTMLButtonElement).disabled, false);

  await tela.click("radar-architect-update-confirm");
  await esperar();
  const post = chamadas.find(chamada => chamada.method === "POST")!;
  assert.deepEqual(post.body, { action: "adopt", brandId: MARCA, articleIds: ["instalacao"], decisionHash: await radarArchitectAdoptionDecisionHash([SUPORTE]), continueOnScreen: true });
  assert.equal(entregues.length, 1);
  assert.deepEqual(entregues[0].ids, ["instalacao"], "a página recebe quem segue para o congelamento novo");
  assert.match(entregues[0].mensagem, /investigação reaberta: o congelamento novo segue agora/);
  assert.match(tela.text(), /agora na v3 \(era v2\)\. Investigação reaberta/);
  tela.destroy();
});
