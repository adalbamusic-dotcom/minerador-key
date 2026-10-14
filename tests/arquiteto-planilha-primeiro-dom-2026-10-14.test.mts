import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { PlanArticleSheet } from "../modules/arquiteto/plan-article-sheet.tsx";
import { AZUL, GRUPOS, MARCA_WIFI, grupoDaKeyword, mesaWifi } from "./arquiteto-planilha-primeiro-fixtures.mts";

/*
 * F5 · PLANILHA PRIMEIRO — a tela de verdade (DOM), com o caso real da
 * WifiConecta (azul, 7 linhas). Toda chamada de rede é simulada e contada: a
 * planilha só fala com a melhoria, com a SERP por keyword e com a leitura do
 * cache; nada vai ao Minerador e nada é pago sem a confirmação.
 */

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[], aplicados: number;
const lentes = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];
const planoSerp = (paid: number) => ({ lenses: lentes, perLens: [], paidQueries: paid, primaryPaidQueries: paid / 4, extraPaidQueries: (paid * 3) / 4, conditionalPaidQueries: 0, recollectableQueries: 0, estimatedCostUsd: { min: paid * 0.0006, max: paid * 0.002 }, collectedAtSpreadDays: 0, datesDiverge: false, payMissingExtraLenses: true, recollectStaleLenses: false, digestChecked: false });
const execucao = (extra: Record<string, unknown>) => ({ version: 1, runId: "11111111-1111-4111-8111-111111111111", brandId: MARCA_WIFI, actorId: "ator", createdAt: "2026-10-14T12:00:00Z", state: "prepared", decisionHash: "a".repeat(64), leaseUntil: null, sourceHashes: {}, targets: [], keywords: [{ id: "s2", keyword: "wifi e internet são a mesma coisa" }], beforeAssignments: {}, proposals: [], costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, reservedCostUsd: 0, notices: [], outcomes: [], acceptedIds: null, origin: "plan_sheet", ...extra });
const proposta = (targetId: string, extra: Record<string, unknown> = {}) => ({ targetId, kind: "subject", theme: targetId, currentPrimaryId: targetId, principalId: targetId, memberIds: [targetId], addIds: [], removeIds: [], transfers: [], angle: "", exclusions: [], reasons: ["Motivo do núcleo."], status: "ready", evidenceBasis: "serp", ...extra });

const responder = (data: unknown, ok = true, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: ok, data, ...extra }), { status: ok ? 200 : 409 });
function rede(opcoes: { serpLida?: Record<string, number> } = {}) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, method: init?.method ?? "GET", body });
    if (url.startsWith("/api/arquiteto/article-improvement") && !init?.method) return responder(null);
    if (url === "/api/arquiteto/serp-subject") {
      const lidas = opcoes.serpLida ?? { k9: 4 };
      return responder({ footprints: body.keywords.filter((item: any) => lidas[item.keywordId]).map((item: any) => ({ keywordId: item.keywordId, keyword: item.keyword, lenses: lentes.slice(0, lidas[item.keywordId]).map(lens => ({ lens, urls: [], domains: [], collectedAt: "2026-10-01T00:00:00Z" })) })), withoutSerp: [], missingLenses: [], egress: { queries: 1, entriesRead: 1, approxBytes: 10 }, targetingReadFailed: false });
    }
    if (url === "/api/arquiteto/keyword-serp") {
      if (body.mode === "plan") return responder({ mode: "plan", plan: planoSerp(body.keywords.length * 4), requested: body.keywords.length * 4 });
      return responder({ observations: [{}], gaps: body.keywords[0].keywordId === "k12" ? [{ keywordId: "k12", lens: "mobile-ios", reason: "provider sem resposta" }] : [], requested: body.keywords.length * 4, reused: 0, collected: body.keywords.length * 4 - (body.keywords[0].keywordId === "k12" ? 1 : 0) });
    }
    if (url === "/api/arquiteto/article-improvement") {
      if (body.action === "prepare") {
        const escolhida = body.principalChoice?.k10;
        return responder(execucao({ proposals: body.targetIds.map((id: string) => id === "k10" && escolhida ? proposta("k10", { currentPrimaryId: "k10", principalId: escolhida, memberIds: [escolhida] }) : id === "k11" ? proposta("k11", { status: "insufficient_evidence", needsMinerador: { newKeywordIds: [], measureKeywordIds: ["k11"], logicKeywordIds: [] }, reasons: ["Precisa do Minerador: 1 medição."] }) : proposta(id)) }));
      }
      if (body.action === "apply") {
        const ids: string[] = body.targetIds ?? [];
        return responder(execucao({ state: "complete", acceptedIds: ids, outcomes: ids.map(id => ({ targetId: id, status: "dna_created", message: `ArticleDNA de ${id} criado e relido.` })) }));
      }
    }
    throw new Error(`Rede inesperada: ${url}`);
  };
}
const assentar = async () => { for (let i = 0; i < 25; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const sheet = () => comProductShell(React.createElement(PlanArticleSheet, {
  brandId: MARCA_WIFI, brandRef: "wificonecta--d4fa133a", keywords: mesaWifi(),
  groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeyword,
  filter: { kind: "groups", color: "azul", groupIds: [AZUL] }, articles: [], radarArticleIds: new Set<string>(),
  onApplied: () => { aplicados += 1; }, buttonClassName: "button", primaryButtonClassName: "button", controlClassName: "control",
}));
const botao = (texto: string, dentro?: HTMLElement) => [...(dentro ?? screen.container).querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === texto);
const linhaDa = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-sheet-row"][data-keyword-id="${keywordId}"]`)!;
const semMinerador = () => assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "nenhum pedido ao Minerador");

test.beforeEach(async () => { chamadas = []; aplicados = 0; screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("azul: 7 linhas na ordem do plano; 'Trocar principal' só na livre; as travadas mostram o selo; SERP lida do cache", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  const linhas = screen.all("architect-plan-sheet-row");
  assert.equal(linhas.length, 7);
  assert.deepEqual(linhas.map(item => item.dataset.order), ["9", "10", "11", "12", "13", "14", "15"]);
  assert.equal(screen.all("architect-plan-sheet-row-swap").length, 1);
  assert.equal(linhaDa("k10").querySelector("[data-testid='architect-plan-sheet-row-swap']")?.textContent, "Trocar principal");
  assert.equal(screen.all("architect-plan-sheet-locked-seal").length, 6);
  assert.match(linhaDa("k9").textContent!, /Pilar/);
  assert.match(linhaDa("k9").textContent!, /4\/4 lentes · 01\/10\/2026/);
  assert.match(linhaDa("k11").textContent!, /Sem SERP no cache/);
  assert.match(screen.get("architect-plan-sheet-scope").textContent!, /cor Azul/);
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/serp-subject").length, 1, "uma leitura grátis do cache");
  semMinerador();
});

test("Validar SERP em lote: prévia com o custo, cancelar não paga; confirmar coleta, mostra o andamento, o resultado por linha e relê", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  await screen.click("architect-plan-sheet-select-all");
  await screen.click("architect-plan-sheet-batch-serp"); await assentar();
  const previa = screen.get("architect-plan-sheet-preview");
  assert.equal(previa.dataset.action, "validateSerp");
  assert.match(screen.get("architect-plan-sheet-serp-cost").textContent!, /Até 20 chamada\(s\) paga\(s\)/);
  const kinds = Object.fromEntries(screen.all("architect-plan-sheet-preview-line").map(item => [item.textContent!.split(" · ")[0], item.dataset.kind]));
  assert.equal(kinds["internet fibra óptica"], "known", "já temos as 4 lentes: sem custo");
  assert.equal(kinds["diferença entre internet e wi-fi"], "refused", "sem volume: recusa por item");
  assert.equal(kinds["wi-fi lento"], "go");
  await screen.click(botao("Cancelar", previa)!); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "execute").length, 0, "cancelar não paga nada");
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /nenhuma chamada foi paga/);
  await screen.click("architect-plan-sheet-batch-serp"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const executados = chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "execute");
  assert.equal(executados.length, 1);
  assert.equal(executados[0].body.authorizedPaidQueries, 20);
  assert.equal(executados[0].body.onlyMeasuredVolume, true);
  assert.deepEqual(executados[0].body.keywords.map((item: any) => item.keywordId), ["k11", "k12", "k13", "k14", "k15"]);
  assert.match(linhaDa("k11").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /SERP coletada nas 4 lentes/);
  assert.match(linhaDa("k10").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /Sem volume medido no Minerador/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /Validar SERP: 20 lente\(s\) paga\(s\) agora/);
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/serp-subject").length, 2, "a coluna SERP é relida do cache");
  semMinerador();
});

test("Concluir formação em lote: prévia (grátis) com recusa por item, uma confirmação, resultado por linha e releitura da mesa", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  await React.act(async () => { (linhaDa("k9").querySelector("input[type='checkbox']") as HTMLInputElement).click(); });
  await React.act(async () => { (linhaDa("k11").querySelector("input[type='checkbox']") as HTMLInputElement).click(); });
  await screen.click("architect-plan-sheet-batch-form"); await assentar();
  const preparo = chamadas.find(chamada => chamada.url === "/api/arquiteto/article-improvement" && chamada.body?.action === "prepare")!;
  assert.deepEqual([preparo.body.group, preparo.body.origin, preparo.body.targetIds], [AZUL, "plan_sheet", ["k9", "k11"]]);
  assert.equal("principalChoice" in preparo.body, false);
  assert.equal(screen.get("architect-plan-sheet-preview").dataset.action, "concludeFormation");
  const linhas = screen.all("architect-plan-sheet-preview-line");
  assert.deepEqual(linhas.map(item => item.dataset.kind), ["go", "minerador"]);
  assert.match(linhas[0].textContent!, /Vai gravar: primeiro ArticleDNA \(v1\)/);
  assert.match(linhas[1].textContent!, /Abrir “Sugestões do Arquiteto” no Minerador/);
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "apply").length, 0, "a prévia não grava");
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Concluir formação (1)");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const aplicar = chamadas.filter(chamada => chamada.body?.action === "apply");
  assert.equal(aplicar.length, 1);
  assert.deepEqual(aplicar[0].body.targetIds, ["k9"], "só a linha pronta é aceita");
  assert.match(linhaDa("k9").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /ArticleDNA de k9 criado e relido/);
  assert.match(linhaDa("k11").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /Não gravado: Precisa do Minerador/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /1 gravado\(s\) e relido\(s\).*Nada foi gravado no Minerador/);
  assert.equal(aplicados, 1, "a mesa é relida depois de gravar");
  semMinerador();
});

test("Trocar principal na linha livre: escolha entre as candidatas, prévia com a troca, uma confirmação, nova versão", async () => {
  rede({ serpLida: { k9: 4, s1: 4, s2: 2 } });
  await screen.render(sheet()); await assentar();
  await screen.click(linhaDa("k10").querySelector<HTMLElement>("[data-testid='architect-plan-sheet-row-swap']")!); await assentar();
  const escolha = screen.get("architect-plan-sheet-preview");
  assert.equal(escolha.dataset.action, "chooseSwap");
  const seletor = escolha.querySelector("select")!;
  assert.deepEqual([...seletor.options].map(option => option.value), ["s1", "s2"], "mais lentes de SERP primeiro; sem volume e publicada fora");
  await screen.select(seletor, "s2");
  await screen.click("architect-plan-sheet-swap-preview"); await assentar();
  const preparo = chamadas.find(chamada => chamada.body?.action === "prepare")!;
  assert.deepEqual(preparo.body.principalChoice, { k10: "s2" });
  const linha = screen.get("architect-plan-sheet-preview-line");
  assert.equal(linha.dataset.kind, "go");
  assert.match(linha.textContent!, /principal: diferença entre internet e wi-fi → wifi e internet são a mesma coisa/);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k10"]]);
  assert.equal(aplicados, 1);
  semMinerador();
});

test("Trocar principal no lote só com travadas: recusa por item com o selo e nada vai ao servidor", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  await React.act(async () => { (linhaDa("k9").querySelector("input[type='checkbox']") as HTMLInputElement).click(); });
  await screen.click("architect-plan-sheet-batch-swap"); await assentar();
  const linha = screen.get("architect-plan-sheet-preview-line");
  assert.equal(linha.dataset.kind, "refused");
  assert.match(linha.textContent!, /Principal travada · mude a trava no Minerador/);
  assert.equal((screen.get("architect-plan-sheet-swap-preview") as HTMLButtonElement).disabled, true);
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/article-improvement" && chamada.method === "POST").length, 0);
});
