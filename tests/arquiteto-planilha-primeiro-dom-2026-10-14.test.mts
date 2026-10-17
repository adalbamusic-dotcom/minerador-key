import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { AZUL, GRUPOS, MARCA_WIFI, TERRITORIO, grupoDaKeyword, mesaWifi } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { MesaDoPlano, ROTULOS_REMOVIDOS, novoRegistro, type Registro } from "./arquiteto-mesa-do-plano-harness.mts";
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
      return responder({ observations: [{}], gaps: [], requested: body.keywords.length * 4, reused: 0, collected: body.keywords.length * 4 });
    }
    if (url === "/api/arquiteto/article-improvement") {
      if (body.action === "prepare") {
        const escolhida = body.principalChoice?.k10;
        return responder(execucao({ proposals: body.targetIds.map((id: string) => id === "k10" && escolhida ? proposta("k10", { currentPrimaryId: "k10", principalId: escolhida, memberIds: [escolhida] }) : proposta(id)) }));
      }
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
const mesa = (opcoes: { articles?: PlanSheetArticle[]; keywords?: Record<string, unknown>[] } = {}) => comProductShell(React.createElement(MesaDoPlano, {
  marca: MARCA_WIFI, keywords: opcoes.keywords ?? mesaWifi(), articles: opcoes.articles ?? [], mesa: [], filtro: AZUL_FILTRO, registro,
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

test("'Processar artigos' (barra de sempre) com as linhas do plano marcadas = Validar SERP: prévia com o custo, cancelar não paga; confirmar coleta, resultado por linha e relê", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  assert.equal(screen.query("architect-plan-stage"), null, "sem etapas do plano: a barra de sempre");
  await marcarTodas();
  await screen.click("architect-articles-top-process"); await assentar();
  const previa = screen.get("architect-plan-sheet-preview");
  assert.equal(previa.dataset.action, "validateSerp");
  // 2026-10-17 · régua única: a Livre sem volume "diferença entre internet e wi-fi" é a principal de identidade (no título do Assunto) e vai ao custo, com o propósito.
  assert.match(screen.get("architect-plan-sheet-serp-cost").textContent!, /Até 24 chamada\(s\) paga\(s\)/);
  const vaiColetar = screen.all("architect-plan-sheet-preview-line").filter(item => item.dataset.kind === "go");
  assert.equal(vaiColetar.length, 6, "as principais com volume sem as 4 lentes e a principal de identidade sem volume vão ao custo");
  assert.ok(vaiColetar.some(item => item.textContent!.includes("SERP da principal de identidade “diferença entre internet e wi-fi” (sem volume medido): 4 consultas, até US$ 0,014 — para ver o que o Google mostra para a frase do artigo.")), vaiColetar.map(item => item.textContent).join(" | "));
  assert.match(previa.textContent!, /sem volume, nada é coletado — exceto a principal de identidade do artigo, que o servidor também confere/);
  await screen.click(botao("Cancelar", previa)!); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "execute").length, 0, "cancelar não paga nada");
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /nenhuma chamada foi paga/);
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const executados = chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "execute");
  assert.equal(executados.length, 1);
  assert.equal(executados[0].body.authorizedPaidQueries, 24);
  assert.equal(executados[0].body.onlyMeasuredVolume, true, "o servidor confere de novo o volume e a identidade");
  assert.deepEqual(executados[0].body.keywords.map((item: any) => item.keywordId), ["k10", "k11", "k12", "k13", "k14", "k15"]);
  assert.match(resultado("k11"), /SERP coletada nas 4 lentes/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /Validar SERP: 24 lente\(s\) paga\(s\) agora/);
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/serp-subject").length, 2, "a coluna SERP é relida do cache");
  semMinerador();
});

test("'Concluir formação' (barra de sempre) FORMA: a linha sem ArticleDNA vai à melhoria do plano (prévia grátis, uma confirmação, releitura); a já formada fica fora com o caminho do reforço", async () => {
  rede({ serpLida: { k9: 4, k11: 4, k12: 4, k13: 4, k14: 4, k15: 4, s1: 4, s2: 4 } });
  await screen.render(mesa({ articles: formados().filter(artigo => artigo.articleId === "k9") })); await assentar();
  await marcarTodas();
  await screen.click("architect-articles-top-confirm"); await assentar();
  const preparo = chamadas.find(chamada => chamada.url === "/api/arquiteto/article-improvement" && chamada.body?.action === "prepare")!;
  assert.deepEqual([preparo.body.group, preparo.body.origin, preparo.body.targetIds], [AZUL, "plan_sheet", ["k10", "k11", "k12", "k13", "k14", "k15"]], "o k9 já formado não vai de novo");
  assert.equal(screen.get("architect-plan-sheet-preview").dataset.action, "concludeFormation");
  const k9 = screen.all("architect-plan-sheet-preview-line").find(item => item.textContent!.startsWith("internet fibra óptica"))!;
  assert.equal(k9.dataset.kind, "refused");
  assert.match(k9.textContent!, /Formado · v1: já formado — para reforçar com keywords de respaldo, use “Melhorar publicados…”/);
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "apply").length, 0, "a prévia não grava");
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar e gravar");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k10", "k11", "k12", "k13", "k14", "k15"]]);
  assert.match(resultado("k10"), /ArticleDNA de k10 gravado \(v2\) e relido/);
  assert.match(resultado("k9"), /^Não gravado: Formado · v1: já formado/);
  assert.equal(registro.aplicados, 1, "a mesa é relida depois de gravar");
  semMinerador();
});

test("Procurar outra principal na linha livre: escolha entre as candidatas, prévia com a troca, uma confirmação, nova versão", async () => {
  rede({ serpLida: { k9: 4, s1: 4, s2: 2 } });
  await screen.render(mesa()); await assentar();
  await screen.click(linhaDa("k10").querySelector<HTMLElement>("[data-plan-action='swapPrincipal']")!); await assentar();
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
