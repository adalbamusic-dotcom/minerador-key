import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * ===== F5 · A TELA DA "ATUALIZAÇÃO DISPONÍVEL DO ARQUITETO" (SDD acelerar-fluxo 2026-10-13, item 14) =====
 *
 * A faixa sob "Planilha" diz quantos artigos visíveis estão atrás de uma versão
 * aprovada mais nova; "Ver e adotar" abre a prévia por Silo; a recusa por item
 * é desmarcar; "Adotar a versão nova (k)" manda a seleção e o hash DA SELEÇÃO.
 * O clique é real (happy-dom); o `fetch` é um roteiro em memória. Sem rede.
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
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const plano = { keeps: ["A SERP da principal (4 lentes) e a amostra já coletada."], redo: [], costs: ["A adoção em si não chama provider nem IA."] };
const item = (articleId: string, extra: Record<string, unknown> = {}) => ({
  articleId, itemId: `wf-${articleId}`, lockVersion: 4, title: `Artigo ${articleId}`, slug: `artigo-${articleId}`, siloId: "silo-1", siloName: "Cuidados com a pele",
  state: "research_pending", label: "Atualização disponível do Arquiteto · v1 → v2", from: { versionId: `${articleId}-v1`, versionNumber: 1 }, to: { versionId: `${articleId}-v2`, versionNumber: 2 },
  classification: "same_research_basis", classificationLabel: "Mesma base de pesquisa: a SERP e as evidências continuam valendo",
  changes: [{ field: "promise", label: "Promessa", before: "Antes", after: "Depois" }], plan: plano, adoptable: true, refusal: null, itemHash: `${articleId.padEnd(64, "0")}`.slice(0, 64),
  ...extra,
});
const A = item("a");
const B = item("b");
const F = item("f", { adoptable: false, refusal: { code: "frozen_investigation", reason: "A investigação está congelada (Google) sobre a versão transportada." } });
const FORA = item("fora");

test("F5 · faixa, prévia por Silo, recusa por item e adoção com o hash da seleção", async () => {
  let adotou = false;
  roteiro = (url, method) => {
    if (method === "GET" && url.startsWith("/api/editorial/radar-architect-update?")) return { status: 200, body: { ok: true, items: adotou ? [F] : [A, B, F, FORA], adoptable: 2, refused: 1 } };
    if (method === "POST" && url === "/api/editorial/radar-architect-update") {
      adotou = true;
      return { status: 200, body: { ok: true, state: "APPLIED", adopted: 1, refused: 0, readbackConfirmed: true, results: [{ articleId: "a", status: "adopted", title: "Artigo a", from: 1, to: 2, redo: [], classification: "same_research_basis", lockVersion: 5 }] } };
    }
    return { status: 404, body: {} };
  };
  const avisos: string[] = [];
  const tela = await harness.montarRadar();
  await tela.render(harness.comProductShell(React.createElement(RadarArchitectUpdatePanel, { brandId: MARCA, articleIds: ["a", "b", "f"], onAdopted: (mensagem: string) => { avisos.push(mensagem); } })));
  await esperar();

  assert.equal(tela.get("radar-architect-update-count").textContent, "Atualização disponível do Arquiteto · 3 artigo(s)", "o item fora do recorte da planilha não conta");
  assert.ok(!chamadas.some(chamada => chamada.method === "POST"), "ler não grava");
  await tela.click("radar-architect-update-open");
  assert.equal(tela.all("radar-architect-update-item").length, 3);
  assert.match(tela.text(), /Silo: Cuidados com a pele/);
  assert.match(tela.text(), /Atualização disponível do Arquiteto · v1 → v2/);
  assert.match(tela.text(), /Promessa: Antes → Depois/);
  assert.match(tela.text(), /Não dá para adotar agora: A investigação está congelada/);
  const caixas = tela.all("radar-architect-update-item").map(elemento => elemento.querySelector("input") as HTMLInputElement);
  assert.deepEqual(caixas.map(caixa => caixa.disabled), [false, false, true], "o recusado não marca");
  assert.equal(tela.get("radar-architect-update-confirm").textContent, "Adotar a versão nova (2)");

  /* recusa por item: desmarca B */
  await tela.click(caixas[1]);
  assert.equal(tela.get("radar-architect-update-confirm").textContent, "Adotar a versão nova (1)");
  await tela.click("radar-architect-update-confirm");
  await esperar();
  const post = chamadas.find(chamada => chamada.method === "POST")!;
  assert.deepEqual(post.body, { action: "adopt", brandId: MARCA, articleIds: ["a"], decisionHash: await radarArchitectAdoptionDecisionHash([A]), continueOnScreen: true });
  assert.ok(chamadas.some(chamada => chamada.method === "GET" && /continueOnScreen=1/.test(chamada.url)), "a prévia da tela é a que continua o congelamento novo");
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /1 artigo\(s\) passaram a transportar a versão nova do Arquiteto \(confirmado pelo servidor\)/);
  assert.ok(chamadas.filter(chamada => chamada.method === "GET").length >= 2, "depois de adotar, a prévia é relida");
  assert.match(tela.text(), /Artigo a: agora na v2 \(era v1\)/);
  tela.destroy();
});

test("F5 · sem atualização, a faixa não aparece", async () => {
  chamadas.length = 0;
  roteiro = () => ({ status: 200, body: { ok: true, items: [], adoptable: 0, refused: 0 } });
  const tela = await harness.montarRadar();
  await tela.render(harness.comProductShell(React.createElement(RadarArchitectUpdatePanel, { brandId: MARCA, articleIds: ["a"], onAdopted: () => undefined })));
  await esperar();
  assert.equal(tela.query("radar-architect-update"), null);
  tela.destroy();
});

test("F5 · a planilha do Radar monta a faixa com os artigos visíveis (recorte da cor) e relê a mesa depois de adotar", () => {
  const pagina = semComentarios(readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  assert.match(pagina, /const itensDaAtualizacaoDoArquiteto = useMemo\(\(\) => pipeline\.radarItems\.filter\(row => !filtroDoGrupo \|\| filtroDoGrupo\(row\)\)/);
  assert.match(pagina, /<RadarArchitectUpdatePanel brandId=\{selectedBrandId \|\| null\} articleIds=\{itensDaAtualizacaoDoArquiteto\} onAdopted=\{async \(mensagem, congelarDeNovo\) => \{ setNotice\(mensagem\); await pipeline\.reloadOperational\(\); if \(congelarDeNovo\?\.length\) void congelarDeNovoRef\.current\?\.\(congelarDeNovo\); \}\}\/>/);
});
