import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { PlanArticleSheet } from "../modules/arquiteto/plan-article-sheet.tsx";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";
import { GRUPOS } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { ARTIGO_INTRUSO, AZUL, INTRUSO_ID, MARCA_WIFI, SILO_PLANOS, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-14 · O CAMINHO DO DONO (WifiConecta, cor azul), na tela de verdade:
 * planilha marcada (7) → "Validar SERP (7)" e "Concluir formação (7)" — cada
 * linha termina com um resultado claro (forma, recusa com motivo e caminho, ou
 * falta SERP com custo), nada fica girando; erro do servidor vira frase humana;
 * a linha presa abre "Retirar artigo do Silo" com prévia e só o dono confirma;
 * (2026-10-14, tarde: o painel dos publicados abre só pelo botão da barra; a
 * planilha separada fica para estes testes do núcleo — a aba não a mostra.)
 */

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[], aplicados: number;
const lentes = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];
const planoSerp = (paid: number) => ({ lenses: lentes, perLens: [], paidQueries: paid, primaryPaidQueries: paid / 4, extraPaidQueries: (paid * 3) / 4, conditionalPaidQueries: 0, recollectableQueries: 0, estimatedCostUsd: { min: paid * 0.0006, max: paid * 0.002 }, collectedAtSpreadDays: 0, datesDiverge: false, payMissingExtraLenses: true, recollectStaleLenses: false, digestChecked: false });
const execucao = (extra: Record<string, unknown>) => ({ version: 1, runId: "22222222-2222-4222-8222-222222222222", brandId: MARCA_WIFI, actorId: "ator", createdAt: "2026-10-14T12:00:00Z", state: "prepared", decisionHash: "b".repeat(64), leaseUntil: null, sourceHashes: {}, targets: [], keywords: [], beforeAssignments: {}, proposals: [], costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, reservedCostUsd: 0, notices: [], outcomes: [], acceptedIds: null, origin: "plan_sheet", ...extra });
const proposta = (targetId: string) => ({ targetId, kind: "subject", theme: targetId, currentPrimaryId: targetId, principalId: targetId, memberIds: [targetId], addIds: [], removeIds: [], transfers: [], angle: "", exclusions: [], reasons: ["Motivo do núcleo."], status: "ready", evidenceBasis: "serp" });
const responder = (data: unknown, status = 200, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: status < 300, data, ...extra }), { status });

function rede(opcoes: { prepareStatus?: number; applyPreso?: boolean } = {}) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, method: init?.method ?? "GET", body });
    if (url.startsWith("/api/arquiteto/article-improvement") && !init?.method) return responder(null);
    if (url === "/api/arquiteto/serp-subject") return responder({ footprints: body.keywords.filter((item: any) => item.keywordId === "k9").map((item: any) => ({ keywordId: item.keywordId, keyword: item.keyword, lenses: lentes.map(lens => ({ lens, urls: [], domains: [], collectedAt: "2026-10-01T00:00:00Z" })) })), withoutSerp: [], missingLenses: [] });
    if (url === "/api/arquiteto/keyword-serp") {
      if (body.mode === "plan") return responder({ mode: "plan", plan: planoSerp(body.keywords.length * 4) });
      return responder({ observations: [{}], gaps: [], collected: body.keywords.length * 4, reused: 0 });
    }
    if (url === "/api/arquiteto/article-improvement") {
      if (body.action === "prepare") {
        if (opcoes.prepareStatus) return new Response(JSON.stringify({ success: false, error: "QUERY_FAILURE" }), { status: opcoes.prepareStatus });
        return responder(execucao({ proposals: body.targetIds.map(proposta) }));
      }
      if (body.action === "apply" || body.action === "status") {
        if (opcoes.applyPreso) return responder(execucao({ state: "applying", acceptedIds: ["k9", "k10", "k11", "k15"], outcomes: [] }));
        const ids: string[] = body.targetIds ?? [];
        return responder(execucao({ state: "complete", acceptedIds: ids, outcomes: ids.map(id => ({ targetId: id, status: "dna_created", message: `ArticleDNA de ${id} criado e relido.` })) }));
      }
    }
    if (url === "/api/arquiteto/silo-article-withdrawal") {
      if (body.mode === "preview") return responder({ mode: "preview", state: "READY", siloId: body.siloId, siloName: "planos de internet", siloDnaVersionId: "silo-v1", article: { articleId: body.articleId, label: "melhor internet para jogos online", versionId: "art-v1" }, remainingArticleIds: [], changes: ["ArticleDNA de “melhor internet para jogos online”: a versão vigente (v1) recebe o status “rejeitado” com o motivo. Nada é apagado.", "SiloDNA v1 e SiloPage v1 não mudam."], warnings: [] });
      return responder({ mode: "apply", state: "APPLIED", warnings: [], pairUnchanged: true });
    }
    throw new Error(`Rede inesperada: ${url}`);
  };
}
const assentar = async (vezes = 25) => { for (let i = 0; i < vezes; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const sheet = () => comProductShell(React.createElement(PlanArticleSheet, {
  brandId: MARCA_WIFI, brandRef: "wificonecta--d4fa133a", keywords: mesaWifiReal(),
  groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal,
  filter: { kind: "groups", color: "azul", groupIds: [AZUL] }, articles: [ARTIGO_INTRUSO], radarArticleIds: new Set<string>(),
  onApplied: () => { aplicados += 1; }, buttonClassName: "button", primaryButtonClassName: "button", controlClassName: "control", dangerButtonClassName: "danger",
}));
const linhaDa = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-sheet-row"][data-keyword-id="${keywordId}"]`)!;
const botao = (texto: string, dentro?: HTMLElement) => [...(dentro ?? screen.container).querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === texto);
const semGirar = () => assert.equal(screen.query("architect-plan-sheet-progress"), null, "nada fica girando");
const semMinerador = () => assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "nenhum pedido ao Minerador");

test.beforeEach(async () => { chamadas = []; aplicados = 0; screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("azul real: 7 linhas; 12, 13 e 14 presas no artigo do laranja com o caminho; próximo passo no topo", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  assert.equal(screen.all("architect-plan-sheet-row").length, 7);
  const presas = screen.all("architect-plan-sheet-conflict");
  assert.deepEqual(presas.map(item => item.closest<HTMLElement>("[data-testid='architect-plan-sheet-row']")!.dataset.order), ["12", "13", "14"]);
  assert.match(linhaDa("k13").textContent!, /Presa no artigo “melhor-para-jogos-online” do Silo “planos de internet” \(Assunto “Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar\?” · cor Laranja\)/);
  assert.equal(linhaDa("k13").querySelector("[data-testid='architect-plan-sheet-row-withdraw']")?.textContent, "Retirar artigo do Silo");
  const proximo = screen.get("architect-plan-sheet-next-step");
  assert.equal(proximo.dataset.nextStep, "validateSerp");
  assert.match(proximo.textContent!, /Validar SERP de 2 linha\(s\).*3 linha\(s\) presa\(s\) em outro artigo/);
  semMinerador();
});

test("Concluir formação (7): as 3 presas recusadas com o motivo antes do servidor; as 4 formam; resultado por linha; nada gira", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  await screen.click("architect-plan-sheet-select-all");
  assert.equal(screen.get("architect-plan-sheet-batch-form").textContent, "Concluir formação (7)");
  await screen.click("architect-plan-sheet-batch-form"); await assentar();
  const preparos = chamadas.filter(chamada => chamada.body?.action === "prepare");
  assert.equal(preparos.length, 1);
  assert.deepEqual(preparos[0].body.targetIds, ["k9", "k10", "k11", "k15"], "a presa não vai ao servidor");
  const kinds = screen.all("architect-plan-sheet-preview-line").map(item => [item.textContent!.split(" · ")[0], item.dataset.kind]);
  assert.deepEqual(kinds.filter(([, kind]) => kind === "refused").map(([keyword]) => keyword), ["internet para streaming", "melhor internet para jogos online", "internet para home office"]);
  assert.equal(kinds.filter(([, kind]) => kind === "go").length, 4);
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Concluir formação (4)");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k9", "k10", "k11", "k15"]]);
  assert.match(linhaDa("k9").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /ArticleDNA de k9 criado e relido/);
  assert.match(linhaDa("k13").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /^Não gravado: Presa no artigo/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /4 gravado\(s\) e relido\(s\); 3 fora desta confirmação/);
  assert.equal(aplicados, 1);
  semGirar(); semMinerador();
});

test("Validar SERP (7): custo antes, uma confirmação, resultado por linha (sem volume, já no cache, coletada) e nada gira", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  await screen.click("architect-plan-sheet-select-all");
  await screen.click("architect-plan-sheet-batch-serp"); await assentar();
  assert.equal(screen.get("architect-plan-sheet-preview").dataset.action, "validateSerp");
  assert.match(screen.get("architect-plan-sheet-serp-cost").textContent!, /chamada\(s\) paga\(s\)/);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const pagos = chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "execute");
  assert.deepEqual(pagos.flatMap(chamada => chamada.body.keywords.map((item: any) => item.keywordId)), ["k11", "k12", "k13", "k14", "k15"]);
  for (const id of ["k9", "k10", "k11", "k12", "k13", "k14", "k15"]) assert.ok(linhaDa(id).querySelector("[data-testid='architect-plan-sheet-result']"), `a linha ${id} tem resultado`);
  assert.match(linhaDa("k10").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /Sem volume medido/);
  assert.match(linhaDa("k9").querySelector("[data-testid='architect-plan-sheet-result']")!.textContent!, /Já temos as 4 lentes/);
  semGirar(); semMinerador();
});

test("erro do servidor na prévia: frase humana com o que fazer, por linha; nada gira e os botões voltam", async () => {
  rede({ prepareStatus: 500 });
  await screen.render(sheet()); await assentar();
  await screen.click("architect-plan-sheet-select-all");
  await screen.click("architect-plan-sheet-batch-form"); await assentar();
  const recusadas = screen.all("architect-plan-sheet-preview-line").filter(item => /O servidor falhou nesta etapa \(erro 500\)\. Nada foi gravado por ela; tente de novo/.test(item.textContent!));
  assert.equal(recusadas.length, 4);
  assert.doesNotMatch(screen.text(), /QUERY_FAILURE/);
  semGirar();
  await screen.click(botao("Cancelar", screen.get("architect-plan-sheet-preview"))!);
  assert.equal((screen.get("architect-plan-sheet-batch-form") as HTMLButtonElement).disabled, false);
});

test("gravação que não avança: para com a frase e oferece 'Continuar a gravação'; nunca gira sem fim", async () => {
  rede({ applyPreso: true });
  await screen.render(sheet()); await assentar();
  await screen.click("architect-plan-sheet-select-all");
  await screen.click("architect-plan-sheet-batch-form"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar(200);
  const aplicacoes = chamadas.filter(chamada => chamada.body?.action === "apply").length;
  assert.ok(aplicacoes > 1 && aplicacoes < 60, `chamadas limitadas (${aplicacoes})`);
  assert.match(screen.container.querySelector("[role='alert']")!.textContent!, /A gravação parou de avançar \(0 de 4 gravado\(s\)\).*Continuar a gravação/);
  assert.ok(screen.query("architect-plan-sheet-resume"), "a retomada fica à mão, sem novo aceite");
  semGirar();
});

test("linha presa → 'Retirar artigo do Silo': abre a PRÉVIA (grátis) do artigo intruso; só o dono, com motivo, confirma", async () => {
  rede();
  await screen.render(sheet()); await assentar();
  await screen.click(linhaDa("k13").querySelector<HTMLElement>("[data-testid='architect-plan-sheet-row-withdraw']")!); await assentar();
  const regiao = screen.get("architect-plan-sheet-withdraw");
  assert.equal(regiao.dataset.articleId, INTRUSO_ID);
  const retiradas = chamadas.filter(chamada => chamada.url === "/api/arquiteto/silo-article-withdrawal");
  assert.deepEqual(retiradas.map(chamada => [chamada.body.mode, chamada.body.siloId, chamada.body.articleId]), [["preview", SILO_PLANOS, INTRUSO_ID]], "só a prévia; nada aplicado sem o dono");
  assert.match(regiao.textContent!, /SiloDNA v1 e SiloPage v1 não mudam/);
  const confirmar = botao("Confirmar retirada", regiao)!;
  assert.equal(confirmar.disabled, true, "sem motivo, não confirma");
  await screen.type(regiao.querySelector("input")!, "Assunto do laranja; libera as keywords do plano azul");
  await screen.click(botao("Confirmar retirada", regiao)!); await assentar();
  const aplicou = chamadas.filter(chamada => chamada.url === "/api/arquiteto/silo-article-withdrawal" && chamada.body.mode === "apply");
  assert.equal(aplicou.length, 1);
  assert.equal(aplicou[0].body.reason, "Assunto do laranja; libera as keywords do plano azul");
  assert.equal(aplicou[0].body.expectedSiloDnaVersionId, "silo-v1");
  assert.equal(aplicados, 1, "a mesa é relida");
  assert.equal(screen.query("architect-plan-sheet-withdraw"), null);
  semMinerador();
});

/* --------------------------------------------- o painel dos publicados */

/*
 * 2026-10-14 (tarde) · pedido do dono ("é tudo por esse painel cheio de textos"):
 * o painel dos publicados saiu do topo da aba e abre só pelo botão
 * "Melhorar publicados…" da barra. O modo "recolhido com Próximo passo para a
 * planilha" saiu junto com a planilha separada; estes testes substituem os
 * dois que fixavam aquele modo.
 */
const painel = () => comProductShell(React.createElement(ArticleImprovementPanel, { brandId: MARCA_WIFI, onApplied: () => undefined, buttonClassName: "button", primaryButtonClassName: "button", activeGroup: { requested: "azul", label: "Azul" } }));

test("o painel dos publicados (aberto pelo botão da barra) é o de sempre: sem modo recolhido nem 'Ir para a planilha'; o artigo do plano é linha da tabela", async () => {
  rede();
  await screen.render(painel()); await assentar();
  assert.equal(screen.get("architect-article-improvement").dataset.collapsed, undefined);
  assert.equal(screen.query("architect-improvement-collapsed"), null);
  assert.equal(screen.get("architect-improvement-next-step").dataset.nextStep, "prepare");
  assert.doesNotMatch(screen.text(), /Artigos do plano|planilha abaixo|Ir para “Artigos do plano”/);
  assert.match(screen.get("architect-improvement-plan-elsewhere").textContent!, /linha da tabela de artigos, com “Processar artigos” e “Concluir formação” da barra/);
  assert.equal(chamadas.filter(chamada => chamada.method === "POST").length, 0, "abrir não prepara nada");
});
