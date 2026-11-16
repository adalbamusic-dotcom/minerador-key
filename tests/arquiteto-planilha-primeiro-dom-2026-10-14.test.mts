import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { AZUL, GRUPOS, LARANJA, MARCA_WIFI, TERRITORIO, grupoDaKeyword, mesaWifi } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { MesaDoPlano, ROTULOS_REMOVIDOS, novoRegistro, ultimoAviso, type Registro } from "./arquiteto-mesa-do-plano-harness.mts";
import { planPrincipalSwapCandidates, type PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";

/*
 * F5 · PLANILHA PRIMEIRO — a tela de verdade (DOM), com o caso da WifiConecta
 * (azul, 7 linhas). Toda chamada de rede é simulada e contada: as linhas do
 * plano só falam com a melhoria, com a SERP por keyword e com a leitura do
 * cache; nada vai ao Minerador e nada é pago sem a confirmação.
 *
 * 2026-10-14 (noite) · pedido do dono ("tem 9 botões no painel do topo"): sem
 * planilha separada nem botões em lote. A mesa é a da aba (harness comum); na
 * linha, só "Procurar outra principal" (sem volume e Livre).
 *
 * 2026-10-16 · restauração do fluxo de sempre: "Validar SERP" é o "Processar
 * artigos" da barra e formar é o "Concluir formação" da barra, para as linhas
 * do plano marcadas; a linha já formada é reforçada pelo "Melhorar publicados…".
 */

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[], registro: Registro;
const lentes = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];
const planoSerp = (paid: number) => ({ lenses: lentes, perLens: [], paidQueries: paid, primaryPaidQueries: paid / 4, extraPaidQueries: (paid * 3) / 4, conditionalPaidQueries: 0, recollectableQueries: 0, estimatedCostUsd: { min: paid * 0.0006, max: paid * 0.002 }, collectedAtSpreadDays: 0, datesDiverge: false, payMissingExtraLenses: true, recollectStaleLenses: false, digestChecked: false });
const execucao = (extra: Record<string, unknown>) => ({ version: 1, runId: "11111111-1111-4111-8111-111111111111", brandId: MARCA_WIFI, actorId: "ator", createdAt: "2026-10-14T12:00:00Z", state: "prepared", decisionHash: "a".repeat(64), leaseUntil: null, sourceHashes: {}, targets: [], keywords: [{ id: "s2", keyword: "wifi e internet são a mesma coisa" }], beforeAssignments: {}, proposals: [], costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, reservedCostUsd: 0, notices: [], outcomes: [], acceptedIds: null, origin: "plan_sheet", ...extra });
const proposta = (targetId: string, extra: Record<string, unknown> = {}) => ({ targetId, kind: "subject", theme: targetId, currentPrimaryId: targetId, principalId: targetId, memberIds: [targetId], addIds: [], removeIds: [], transfers: [], angle: "", exclusions: [], reasons: ["Motivo do núcleo."], status: "ready", evidenceBasis: "serp", ...extra });

const responder = (data: unknown, ok = true, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: ok, data, ...extra }), { status: ok ? 200 : 409 });
/** 2026-10-17 (noite) · a leitura do Processar com a SERP de uma principal por pagar (a de identidade, k10). */
const comSerpPorPagar = (targetIds: string[]) => execucao({ costs: { paidQueries: 4, estimatedCostUsd: { min: 0.0095, max: 0.014 }, missingDetails: [] }, proposals: targetIds.map(id => id === "k10" ? proposta(id, { status: "insufficient_evidence", needsValidation: true }) : proposta(id)) });
function rede(opcoes: { serpLida?: Record<string, number>; serpPorPagar?: boolean } = {}) {
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
      return responder({ observations: [{}], gaps: [], requested: body.keywords.length * 4, reused: 0, collected: body.keywords.length * 4 });
    }
    if (url === "/api/arquiteto/article-improvement") {
      if (body.action === "prepare") {
        const escolhida = body.principalChoice?.k10;
        if (opcoes.serpPorPagar && body.discover) return responder(comSerpPorPagar(body.targetIds));
        const numero = chamadas.filter(chamada => chamada.body?.action === "prepare").length;
        return responder(execucao({ runId: `11111111-1111-4111-8111-${String(numero).padStart(12, "0")}`, proposals: body.targetIds.map((id: string) => id === "k10" && escolhida ? proposta("k10", { currentPrimaryId: "k10", principalId: escolhida, memberIds: [escolhida] }) : proposta(id)) }));
      }
      if (body.action === "collect") return responder(execucao({ proposals: ["k9", "k10", "k11", "k12", "k13", "k14", "k15"].map(id => proposta(id)) }));
      if (body.action === "apply") {
        const ids: string[] = body.targetIds ?? [];
        return responder(execucao({ state: "complete", acceptedIds: ids, outcomes: ids.map(id => ({ targetId: id, status: "improved", message: `ArticleDNA de ${id} gravado (v2) e relido.` })) }));
      }
    }
    throw new Error(`Rede inesperada: ${url}`);
  };
}
const assentar = async () => { for (let i = 0; i < 25; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const AZUL_FILTRO = { kind: "groups" as const, color: "azul" as const, groupIds: [AZUL] };
/** Os 7 artigos do plano já formados. */
const formados = (): PlanSheetArticle[] => ["k9", "k10", "k11", "k12", "k13", "k14", "k15"].map(id => ({ articleId: id, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], slug: id, siloRef: TERRITORIO, siloLabel: "Wi-Fi e fibra óptica" }));
const mesa = (opcoes: { articles?: PlanSheetArticle[]; keywords?: Record<string, unknown>[]; filtro?: typeof AZUL_FILTRO | { kind: "all" } } = {}) => comProductShell(React.createElement(MesaDoPlano, {
  marca: MARCA_WIFI, keywords: opcoes.keywords ?? mesaWifi(), articles: opcoes.articles ?? [], mesa: [], filtro: opcoes.filtro ?? AZUL_FILTRO, registro,
  groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeyword,
}));
const linhaDa = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-table-row"][data-keyword-id="${keywordId}"]`)!;
const marcarTodas = async () => { for (const id of ["k9", "k10", "k11", "k12", "k13", "k14", "k15"]) await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); };
const botao = (texto: string, dentro?: HTMLElement) => [...(dentro ?? screen.container).querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === texto);
const resultado = (keywordId: string) => linhaDa(keywordId).querySelector("[data-testid='architect-plan-row-result']")?.textContent ?? "";
const semMinerador = () => assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "nenhum pedido ao Minerador");

test.beforeEach(async () => { chamadas = []; registro = novoRegistro(); screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("azul: 7 linhas na ordem do plano; 'Procurar outra principal' só na livre sem volume; as travadas com o selo curto; SERP lida do cache", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  const linhas = screen.all("architect-plan-table-row");
  assert.equal(linhas.length, 7);
  assert.deepEqual(linhas.map(item => item.dataset.order), ["9", "10", "11", "12", "13", "14", "15"]);
  const trocas = screen.container.querySelectorAll<HTMLElement>("[data-plan-action='swapPrincipal']");
  assert.equal(trocas.length, 1);
  assert.equal(linhaDa("k10").querySelector("[data-plan-action='swapPrincipal']")?.textContent, "Procurar outra principal");
  const travas = screen.container.querySelectorAll<HTMLElement>("[data-plan-seal='lock']");
  assert.equal([...travas].filter(selo => selo.textContent === "Travada").length, 6, "o selo curto, o porquê no title");
  assert.match(linhaDa("k9").textContent!, /Pilar · 9º/);
  assert.equal(linhaDa("k9").querySelector("[data-plan-seal='serp']")!.textContent, "SERP 4/4");
  assert.equal(linhaDa("k11").querySelector("[data-plan-seal='serp']")!.textContent, "Sem SERP");
  assert.match(linhaDa("k11").querySelector("[data-testid='architect-plan-row-alerts']")!.textContent!, /sem SERP no cache — coletar em “Processar artigos”/);
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/serp-subject").length, 1, "uma leitura grátis do cache");
  for (const rotulo of ROTULOS_REMOVIDOS) assert.doesNotMatch(screen.text(), rotulo, String(rotulo));
  semMinerador();
});

/*
 * 2026-10-17 (noite) · SUBSTITUÍDOS "Processar = Validar SERP" e "Concluir FORMA só a linha sem ArticleDNA" (16/10):
 * Processar = a leitura da melhoria com a busca do reforço (grátis) e UMA prévia de custo da SERP que falta (a da
 * principal de identidade "diferença entre internet e wi-fi"); Concluir = a cópia de trabalho do Processar, com o
 * artigo já formado junto (o reforço dele vira a versão seguinte), UMA confirmação e o Silo do plano no mesmo ato.
 */
test("'Processar artigos' (barra de sempre) com as linhas do plano marcadas: a leitura com a busca do reforço; prévia com o custo; cancelar não paga; confirmar coleta pela melhoria e a cópia de trabalho fica em cada linha", async () => {
  rede({ serpPorPagar: true });
  await screen.render(mesa()); await assentar();
  assert.equal(screen.query("architect-plan-stage"), null, "sem etapas do plano: a barra de sempre");
  await marcarTodas();
  await screen.click("architect-articles-top-process"); await assentar();
  const preparo = chamadas.find(chamada => chamada.body?.action === "prepare")!;
  assert.deepEqual([preparo.body.group, preparo.body.origin, preparo.body.discover, preparo.body.targetIds], [AZUL, "plan_sheet", true, ["k9", "k10", "k11", "k12", "k13", "k14", "k15"]]);
  const previa = screen.get("architect-plan-sheet-preview");
  assert.equal(previa.dataset.action, "processArticles");
  assert.match(screen.get("architect-plan-sheet-serp-cost").textContent!, /^SERP no DataForSEO: 4 consulta\(s\), até US\$ 0,014 — a primeira coleta da principal que falta \(inclusive a principal de identidade, sem buscas no Google Ads\)/);
  await screen.click(botao("Cancelar", previa)!); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "collect").length, 0, "cancelar não paga nada");
  assert.match(ultimoAviso(registro), /a coleta paga foi cancelada — nada foi pago e nenhum artigo foi gravado/);
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const coletas = chamadas.filter(chamada => chamada.body?.action === "collect");
  assert.equal(coletas.length, 1);
  assert.equal(coletas[0].body.authorizedCostUsd, 0.014, "só o custo autorizado na prévia; o servidor confere volume e identidade");
  assert.match(resultado("k11"), /^Cópia de trabalho \(ArticleDNA não gravado\): principal “wi-fi lento” \(Travada, fica\) · sem secundária\. Pronto para “Concluir formação”\.$/);
  assert.match(ultimoAviso(registro), /^Processar artigos: 7 artigo\(s\) lido\(s\), reforço proposto para 0; SERP paga agora: 4 consulta\(s\)\. Nenhum artigo foi gravado/);
  /* 2026-10-18 · o resumo do lote vai para o sino, não para uma faixa na tela (regra do dono). */
  assert.equal(screen.query("architect-plan-sheet-summary"), null, "o resumo não volta a ser faixa na tela");
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp").length, 0, "o Validar SERP de coleta à parte saiu (F3 da linha única)");
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/serp-subject").length, 2, "a coluna SERP é relida do cache");
  semMinerador();
});

test("'Concluir formação' (barra de sempre) grava a cópia de trabalho do Processar: o artigo já formado entra (v2), checklist, UMA confirmação, releitura e o Silo do plano no mesmo ato", async () => {
  rede({ serpLida: { k9: 4, k11: 4, k12: 4, k13: 4, k14: 4, k15: 4, s1: 4, s2: 4 } });
  await screen.render(mesa({ articles: formados().filter(artigo => artigo.articleId === "k9") })); await assentar();
  await marcarTodas();
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, true, "o Concluir espera o Processar");
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 1, "o Concluir não prepara de novo: grava a cópia de trabalho do Processar");
  assert.equal(screen.get("architect-plan-sheet-preview").dataset.action, "concludeFormation");
  const k9 = screen.all("architect-plan-sheet-preview-line").find(item => item.textContent!.startsWith("internet fibra óptica"))!;
  assert.equal(k9.dataset.kind, "go");
  assert.match(k9.textContent!, /Vai gravar: nova versão \(v2\)/);
  assert.ok(screen.query("architect-plan-sheet-checklist"), "o checklist da finalização");
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "apply").length, 0, "a prévia não grava");
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar e gravar");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k9", "k10", "k11", "k12", "k13", "k14", "k15"]]);
  assert.match(resultado("k10"), /ArticleDNA de k10 gravado \(v2\) e relido/);
  assert.equal(registro.aplicados, 1, "a mesa é relida depois de gravar");
  assert.deepEqual(registro.silos, [[AZUL]], "o Silo do plano fecha no mesmo ato");
  semMinerador();
});

test("Concluir formação mantém principal sem candidata do artigo já formado e fecha o Silo pelo mesmo botão", async () => {
  rede();
  const fallback = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (String(input) === "/api/arquiteto/article-improvement" && body?.action === "prepare" && body.discover) {
      chamadas.push({ url: String(input), method: "POST", body });
      return responder(execucao({ proposals: body.targetIds.map((id: string) => proposta(id, {
        status: "adequate",
        reasons: id === "k10" ? ["Volume 0 sem candidata: a principal fica; nenhuma troca às cegas."] : ["Sem mudança."],
      })) }));
    }
    return fallback(input, init);
  };
  await screen.render(mesa({ articles: formados() })); await assentar();
  await marcarTodas();
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-articles-top-confirm"); await assentar();
  const linha = screen.all("architect-plan-sheet-preview-line").find(item => item.textContent!.startsWith("diferença"));
  assert.ok(screen.text().includes("Volume 0 sem candidata"));
  assert.ok(linha || screen.get("architect-plan-sheet-preview"));
  assert.equal((screen.get("architect-plan-sheet-confirm") as HTMLButtonElement).disabled, false);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(registro.silos, [[AZUL]], "o mesmo clique confirma o fechamento");
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "apply").length, 0, "nenhum ArticleDNA é regravado sem mudança");
});

for (const leitura of ["conflito", "falha"] as const) test(`Concluir não promete nem fecha o Silo quando a leitura traz ${leitura}`, async () => {
  rede();
  const fallback = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (String(input) === "/api/arquiteto/article-improvement" && body?.action === "prepare" && body.discover) {
      chamadas.push({ url: String(input), method: "POST", body });
      return responder(execucao({ proposals: body.targetIds.map((id: string) => proposta(id, { status: "adequate", reasons: ["Sem mudança."] })) }));
    }
    return fallback(input, init);
  };
  registro.closureRead = leitura === "conflito"
    ? async () => ({ ready: false, detail: "Há 7 formações fora do cenário." })
    : async () => { throw new Error("leitura indisponível"); };
  await screen.render(mesa({ articles: formados() })); await assentar();
  await marcarTodas();
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-articles-top-confirm"); await assentar();
  const silo = screen.get("architect-plan-sheet-checklist").querySelector('[data-check="silo"]')!;
  assert.equal(silo.getAttribute("data-ok"), "false");
  assert.match(silo.textContent!, leitura === "conflito" ? /7 formações fora do cenário/ : /Não foi possível ler o fechamento/);
  assert.equal((screen.get("architect-plan-sheet-confirm") as HTMLButtonElement).disabled, true);
  assert.deepEqual(registro.silos, []);
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "apply").length, 0);
});

test("plano pendente na principal Livre aparece na prévia e só grava ao confirmar Concluir", async () => {
  rede();
  const fallback = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (String(input) === "/api/arquiteto/article-improvement" && body?.action === "prepare" && body.discover) {
      chamadas.push({ url: String(input), method: "POST", body });
      return responder(execucao({ proposals: body.targetIds.map((id: string) => proposta(id, {
        status: id === "k10" ? "ready" : "adequate",
        reasons: ["Volume 0 sem candidata: a principal fica; nenhuma troca às cegas."],
      })) }));
    }
    return fallback(input, init);
  };
  await screen.render(mesa({ articles: formados() })); await assentar();
  await marcarTodas();
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "apply").length, 0, "prévia não grava");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k10"]]);
  assert.deepEqual(registro.silos, [[AZUL]]);
});

test("processamentos parciais da mesma cor preservam cada cópia, e concluir cada subconjunto não elimina a outra", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  const marcar = async (id: string) => { await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); await assentar(); };
  await marcar("k9");
  await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9"); await marcar("k10");
  await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9");
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, false, "ambas as leituras continuam prontas");
  await marcar("k9"); // k10 sozinho, concluir só sua execução
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 2, "a prévia reutiliza a segunda leitura");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => [chamada.body.runId, chamada.body.targetIds]), [["11111111-1111-4111-8111-000000000002", ["k10"]]]);
  await marcar("k10"); await marcar("k9");
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, false, "concluir k10 não descarta a cópia de k9");
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 2, "a primeira leitura também foi preservada");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => [chamada.body.runId, chamada.body.targetIds]), [["11111111-1111-4111-8111-000000000002", ["k10"]], ["11111111-1111-4111-8111-000000000001", ["k9"]]]);
  semMinerador();
});

test("a mesma confirmação reúne leituras separadas da cor e preserva o hash de cada run", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  const marcar = async (id: string) => { await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); await assentar(); };
  await marcar("k9"); await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9"); await marcar("k10"); await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9");
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 2);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => [chamada.body.runId, chamada.body.targetIds]), [
    ["11111111-1111-4111-8111-000000000001", ["k9"]],
    ["11111111-1111-4111-8111-000000000002", ["k10"]],
  ]);
  assert.deepEqual(registro.silos, [[AZUL]], "fecha a cor uma única vez após as duas execuções");
  semMinerador();
});

test("ao recarregar duas leituras, Concluir usa cada execução e hash originais", async () => {
  rede();
  const fallback = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("recovery=plan_sheet")) {
      return responder([
        execucao({ runId: "run-new", decisionHash: "new", groupScope: { groupId: AZUL }, discovery: { requested: true }, proposals: [proposta("k10")] }),
        execucao({ runId: "run-old", decisionHash: "old", groupScope: { groupId: AZUL }, discovery: { requested: true }, proposals: [proposta("k9")] }),
      ]);
    }
    return fallback(input, init);
  };
  await screen.render(mesa()); await assentar();
  for (const id of ["k9", "k10"]) await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!);
  await assentar();
  await screen.click("architect-articles-top-confirm"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => [chamada.body.runId, chamada.body.decisionHash, chamada.body.targetIds]), [
    ["run-old", "old", ["k9"]], ["run-new", "new", ["k10"]],
  ]);
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 0);
});

test("duas gravações interrompidas são retomadas uma a uma pelo botão existente", async () => {
  rede();
  const fallback = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (String(input).includes("recovery=plan_sheet")) return responder([
      execucao({ runId: "write-one", state: "applying", acceptedIds: ["k9"], proposals: [proposta("k9")] }),
      execucao({ runId: "write-two", state: "applying", acceptedIds: ["k10"], proposals: [proposta("k10")] }),
    ]);
    if (body?.action === "apply") {
      chamadas.push({ url: String(input), method: "POST", body });
      const id = body.runId === "write-one" ? "k9" : "k10";
      return responder(execucao({ runId: body.runId, state: "complete", acceptedIds: [id], outcomes: [{ targetId: id, status: "improved", message: "Gravado e relido." }] }));
    }
    return fallback(input, init);
  };
  await screen.render(mesa()); await assentar();
  await screen.click(botao("Continuar a gravação")!); await assentar();
  assert.ok(botao("Continuar a gravação"), "a segunda gravação continua visível");
  await screen.click(botao("Continuar a gravação")!); await assentar();
  assert.equal(botao("Continuar a gravação"), undefined);
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.runId), ["write-one", "write-two"]);
});

test("cancelar SERP paga preserva outras leituras da mesma cor e usa a execução original", async () => {
  rede();
  const fallback = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (String(input) === "/api/arquiteto/article-improvement" && body?.action === "prepare") {
      chamadas.push({ url: String(input), method: "POST", body });
      return responder(body.targetIds.includes("k10")
        ? comSerpPorPagar(["k10"])
        : execucao({ runId: "first", decisionHash: "first-hash", proposals: [proposta("k9")] }));
    }
    return fallback(input, init);
  };
  await screen.render(mesa()); await assentar();
  const marcar = async (id: string) => { await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); await assentar(); };
  await marcar("k9"); await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9"); await marcar("k10"); await screen.click("architect-articles-top-process"); await assentar();
  await screen.click(botao("Cancelar", screen.get("architect-plan-sheet-preview"))!); await assentar();
  await marcar("k10"); await marcar("k9");
  await screen.click("architect-articles-top-confirm"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => [chamada.body.runId, chamada.body.decisionHash]), [["first", "first-hash"]]);
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 2);
});

test("falha na recuperação bloqueia processamento até nova leitura", async () => {
  rede();
  const fallback = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).includes("recovery=plan_sheet")
    ? responder(null, false, { error: "Falha de leitura" }) : fallback(input, init);
  await screen.render(mesa()); await assentar();
  await screen.click(linhaDa("k9").querySelector<HTMLInputElement>("input[type='checkbox']")!); await assentar();
  await screen.click("architect-articles-top-process"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 0);
  assert.match(ultimoAviso(registro), /ações da planilha permanecem bloqueadas/i);
});

test("reprocessar um artigo do lote substitui apenas a cópia dele, sem ressuscitar a anterior", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  const marcar = async (id: string) => { await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); await assentar(); };
  await marcar("k9"); await marcar("k10");
  await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9");
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-articles-top-confirm"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  await marcar("k10"); await marcar("k9");
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, false, "a proposta de k9 ainda está pronta");
  await screen.click("architect-articles-top-confirm"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => [chamada.body.runId, chamada.body.targetIds]), [
    ["11111111-1111-4111-8111-000000000002", ["k10"]],
    ["11111111-1111-4111-8111-000000000001", ["k9"]],
  ]);
  semMinerador();
});

test("processar outra cor conserva a primeira e confirma cada execução do grupo certo", async () => {
  rede();
  await screen.render(mesa({ filtro: { kind: "all" } })); await assentar();
  const marcar = async (id: string) => { await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); await assentar(); };
  await marcar("k9"); await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9"); await marcar("l1"); await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k9");
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, false);
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 2);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => [chamada.body.runId, chamada.body.targetIds]).sort(([a], [b]) => String(a).localeCompare(String(b))), [
    ["11111111-1111-4111-8111-000000000001", ["k9"]],
    ["11111111-1111-4111-8111-000000000002", ["l1"]],
  ]);
  assert.deepEqual([...registro.silos[0]].sort(), [AZUL, LARANJA].sort());
  semMinerador();
});

test("concluir parte de uma única leitura avisa antes de consumir as propostas restantes", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  const marcar = async (id: string) => { await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); await assentar(); };
  await marcar("k9"); await marcar("k10");
  await screen.click("architect-articles-top-process"); await assentar();
  await marcar("k10");
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.match(screen.get("architect-plan-sheet-preview").textContent!, /selecione todos os artigos prontos da mesma leitura/);
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "apply").length, 0, "nenhuma parte é gravada");
  assert.equal((screen.get("architect-plan-sheet-confirm") as HTMLButtonElement).disabled, true);
  semMinerador();
});

test("Procurar outra principal na linha livre: escolha entre as candidatas, prévia com a troca, uma confirmação, nova versão", async () => {
  rede({ serpLida: { k9: 4, s1: 4, s2: 2 } });
  await screen.render(mesa()); await assentar();
  await screen.click(linhaDa("k10").querySelector<HTMLElement>("[data-plan-action='swapPrincipal']")!); await assentar();
  const escolha = screen.get("architect-plan-sheet-preview");
  assert.equal(escolha.dataset.action, "chooseSwap");
  const seletor = escolha.querySelector("select")!;
  assert.deepEqual([...seletor.options].map(option => option.value), ["", "s1", "s2"], "a ordem é informativa, não escolhe a principal pela pessoa");
  assert.equal(seletor.value, "", "nenhuma candidata é escolhida automaticamente");
  assert.equal((screen.get("architect-plan-sheet-swap-preview") as HTMLButtonElement).disabled, true);
  assert.equal(chamadas.some(chamada => chamada.body?.principalChoice), false, "não prepara uma troca antes da escolha");
  await screen.select(seletor, "s2");
  assert.equal((screen.get("architect-plan-sheet-swap-preview") as HTMLButtonElement).disabled, false);
  await screen.click("architect-plan-sheet-swap-preview"); await assentar();
  const preparo = chamadas.find(chamada => chamada.body?.action === "prepare")!;
  assert.deepEqual(preparo.body.principalChoice, { k10: "s2" });
  const linha = screen.get("architect-plan-sheet-preview-line");
  assert.equal(linha.dataset.kind, "go");
  // 2026-10-17 (noite) · a composição inteira na frase da prévia (a troca e as secundárias).
  assert.match(linha.textContent!, /principal “wifi e internet são a mesma coisa” \(troca proposta: “diferença entre internet e wi-fi” → esta; decisão sua\)/);
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar a troca");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k10"]]);
  assert.equal(registro.aplicados, 1);
  semMinerador();
});

test("volume definido nunca troca: Livre à mão mas com volume no DNA não ganha 'Procurar outra principal', e a regra única recusa a escolha", async () => {
  rede();
  const keywords = (mesaWifi() as Record<string, any>[]).map((linha): Record<string, any> => {
    if (linha.id !== "k9") return linha;
    const semantica = structuredClone(linha.analise_semantica as Record<string, any>);
    semantica.keyword_subject.plan.lock = "free";
    const pacote = structuredClone(linha.canonicalWorkflow as Record<string, any>);
    pacote.payload.approvedDna.analiseSemantica = semantica;
    return { ...linha, analise_semantica: semantica, canonicalWorkflow: pacote };
  });
  await screen.render(mesa({ keywords })); await assentar();
  assert.equal(linhaDa("k9").querySelector("[data-plan-action='swapPrincipal']"), null);
  assert.equal(linhaDa("k9").dataset.lock, "locked");
  const lido = planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: keywords.find(linha => linha.id === "k9")!, rows: keywords, currentPrincipalId: "k9", now: new Date("2026-10-14T12:00:00Z") });
  assert.equal(lido.ok, false);
  assert.match(!lido.ok ? lido.reason : "", /^Travada \(Travada · volume definido\)\. Volume definido no DNA/);
});
