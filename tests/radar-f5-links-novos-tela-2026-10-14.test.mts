import assert from "node:assert/strict";
import test from "node:test";

/*
 * ===== 2026-10-14 · A TELA DA "ATUALIZAÇÃO DISPONÍVEL DO ARQUITETO · LINKS" =====
 *
 * O mesmo artigo pode ter a versão nova do ArticleDNA e os links novos: a
 * marcação é por atualização. Desmarcar é a recusa por item; o botão diz o que
 * vai gravar; o POST leva `articleIds` (versão nova), `linkArticleIds` (links)
 * e o hash DA SELEÇÃO. Clique real (happy-dom), `fetch` em memória, sem rede.
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
const { radarArchitectAdoptionDecisionHash } = await import("../lib/radar/architect-update.ts");

const MARCA = "11111111-aaaa-4aaa-8aaa-0000000000aa";
const esperar = () => React.act(async () => { for (let i = 0; i < 8; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); });

const base = (articleId: string) => ({
  articleId, itemId: `wf-${articleId}`, lockVersion: 4, title: `Artigo ${articleId}`, slug: `artigo-${articleId}`, siloId: "silo-1", siloName: "Leads sem Tráfego Pago",
  state: "research_pending", from: { versionId: `${articleId}-v1`, versionNumber: 1 }, to: { versionId: `${articleId}-v1`, versionNumber: 1 }, adoptable: true, refusal: null,
});
const DNA_A = {
  ...base("a"), updateKind: "article_dna", label: "Atualização disponível do Arquiteto · v1 → v2", to: { versionId: "a-v2", versionNumber: 2 },
  classification: "same_research_basis", classificationLabel: "Mesma base de pesquisa: a SERP e as evidências continuam valendo",
  changes: [{ field: "promise", label: "Promessa", before: "Antes", after: "Depois" }],
  plan: { keeps: ["A SERP da principal (4 lentes) e a amostra já coletada."], redo: [], costs: ["A adoção em si não chama provider nem IA."] },
  itemHash: "a".repeat(64),
};
const links = (articleId: string, extra: Record<string, unknown> = {}) => ({
  ...base(articleId), updateKind: "links", label: "Atualização disponível do Arquiteto · links · grafo v1 → v2",
  graph: { graphId: "g", fromGraphVersionId: "g1", fromGraphVersionNumber: 1, toGraphVersionId: "g2", toGraphVersionNumber: 2, toGraphContentHash: "h" },
  classification: "links_changed", classificationLabel: "Só os links internos mudaram: a SERP, a investigação e as evidências continuam valendo",
  changes: [
    { field: "links_summary", label: "Links deste artigo", before: "1 destino(s): 1 obrigatório(s) no corpo", after: "8 destino(s): 1 obrigatório(s) no corpo, 7 na trilha \"Continue no Silo\"" },
    { field: "links_added", label: "Links que entram (destino e obrigação)", before: null, after: "promoções estética (trilha)" },
  ],
  plan: { keeps: ["A SERP, a investigação, as evidências e as coletas ficam como estão: links não mudam a SERP (a análise não ganha versão nova)."], redo: [], costs: ["Nada pago e nenhuma IA: grava só o grafo transportado pelo item (o campo de links)."] },
  itemHash: articleId.repeat(64).slice(0, 64).replace(/[^a-f0-9]/g, "b"),
  ...extra,
});
const LINKS_A = links("a");
const LINKS_T = links("t", { state: "sent_writer", itemHash: "c".repeat(64) });

test("links · a faixa conta os artigos, a prévia mostra '· links' e o que muda, e a adoção manda só os links com o hash da seleção", async () => {
  let adotou = false;
  roteiro = (url, method) => {
    if (method === "GET" && url.startsWith("/api/editorial/radar-architect-update?")) return { status: 200, body: { ok: true, items: adotou ? [DNA_A] : [DNA_A, LINKS_A, LINKS_T] } };
    if (method === "POST") {
      adotou = true;
      return { status: 200, body: { ok: true, state: "APPLIED", adopted: 2, refused: 0, readbackConfirmed: true, results: [
        { articleId: "a", status: "adopted", updateKind: "links", title: "Artigo a", fromGraphVersion: 1, toGraphVersion: 2, classification: "links_changed", redo: [], lockVersion: 5 },
        { articleId: "t", status: "adopted", updateKind: "links", title: "Artigo t", fromGraphVersion: 1, toGraphVersion: 2, classification: "links_changed", redo: [], lockVersion: 5 },
      ] } };
    }
    return { status: 404, body: {} };
  };
  const avisos: string[] = [];
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(RadarArchitectUpdatePanel, { brandId: MARCA, articleIds: ["a", "t"], onAdopted: (mensagem: string) => { avisos.push(mensagem); } }));
  await esperar();

  assert.equal(tela.get("radar-architect-update-count").textContent, "Atualização disponível do Arquiteto · 2 artigo(s) · links novos em 2");
  await tela.click("radar-architect-update-open");
  const itens = tela.all("radar-architect-update-item");
  assert.deepEqual(itens.map(item => item.getAttribute("data-update-kind")), ["article_dna", "links", "links"]);
  assert.match(tela.text(), /Atualização disponível do Arquiteto · links · grafo v1 → v2/);
  assert.match(tela.text(), /Links que entram \(destino e obrigação\): — → promoções estética \(trilha\)/);
  assert.match(tela.text(), /links não mudam a SERP/);
  assert.equal(tela.get("radar-architect-update-confirm").textContent, "Adotar a versão nova e os links (3)");

  /* recusa por item: desmarca a versão nova de A (os links de A continuam marcados) */
  const caixas = itens.map(item => item.querySelector("input") as HTMLInputElement);
  await tela.click(caixas[0]);
  assert.equal(tela.get("radar-architect-update-confirm").textContent, "Adotar os links novos (2)");
  await tela.click("radar-architect-update-confirm");
  await esperar();
  const post = chamadas.find(chamada => chamada.method === "POST")!;
  assert.deepEqual(post.body, { action: "adopt", brandId: MARCA, articleIds: [], linkArticleIds: ["a", "t"], decisionHash: await radarArchitectAdoptionDecisionHash([LINKS_A, LINKS_T] as never) });
  assert.match(avisos[0], /2 artigo\(s\) passaram a transportar os links novos do Arquiteto, sem refazer a pesquisa \(confirmado pelo servidor\)/);
  assert.doesNotMatch(avisos[0], /versão nova do Arquiteto/);
  assert.match(tela.text(), /Artigo t: links do grafo v2 \(era v1\)\. A pesquisa e o pacote ficam\./);
  tela.destroy();
});
