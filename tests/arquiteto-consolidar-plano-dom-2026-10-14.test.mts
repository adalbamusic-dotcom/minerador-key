import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { GRUPOS } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { AZUL, AZUL_REAL, MARCA_WIFI, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";
import { MesaDoPlano, ROTULOS_REMOVIDOS, novoRegistro, type Registro } from "./arquiteto-mesa-do-plano-harness.mts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import type { PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";
import type { EditorialGroupScreenFilter } from "../lib/editorial/editorial-groups.ts";

/*
 * 2026-10-14 (noite) · "CONSOLIDAR O SILO DO PLANO" — o pedido do dono, na tela
 * de verdade, com o ESTADO ATUAL da WifiConecta azul (lido por SELECT em
 * 14/10): Silo "Wi-Fi e fibra óptica" confirmado, 5 ArticleDNA v1 formados
 * (fibra, streaming, jogos online, home office, teste) e 2 sem artigo
 * ("diferença entre internet e Wi-Fi": sem volume e Livre; "Wi-Fi lento": 260,
 * sem SERP no cache). As linhas dos 5 formados vêm do ArticleDNA (a mesa as
 * remonta da referência do DNA: volume + evidência do Google Ads, sem
 * `volume_source` nem semântica) — era aí que a tela dizia "Volume de outra
 * fonte". Sem rede real, sem provider, sem custo.
 */

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[], registro: Registro;
const TERRITORIO_REAL = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const MEDIDO_EM = "2026-10-13T05:31:48.884Z";
const FORMADOS = ["k9", "k12", "k13", "k14", "k15"];
const lentes = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];
const responder = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 300, data }), { status });

/** As linhas da mesa como a aba as tem: os formados remontados do ArticleDNA; os outros, a linha recebida inteira. */
function estadoAtual() {
  const inteiras = mesaWifiReal().filter(linha => String(linha.id).startsWith("k"));
  const standings = readArchitectSubjectStandings(inteiras);
  const keywords = inteiras.map(linha => {
    if (!FORMADOS.includes(String(linha.id))) return { ...linha, territoryRef: TERRITORIO_REAL };
    const volume = AZUL_REAL.find(([id]) => id === linha.id)![5]!;
    return { id: linha.id, keywordId: linha.id, keyword: linha.keyword, brand_id: MARCA_WIFI, volume_search: volume, territoryRef: TERRITORIO_REAL, demandEvidence: { historicalKgr: { resultsAllintitle: null, kgr: null, status: "not_measured" }, googleAds: { source: "google_ads", averageMonthlySearches: volume, measuredAt: MEDIDO_EM, monthlySearchVolumes: [] } }, source: "CANONICAL_REMOTE" };
  });
  const articles: PlanSheetArticle[] = FORMADOS.map(id => ({ articleId: id, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], slug: id, siloRef: TERRITORIO_REAL, siloLabel: "Wi-Fi e fibra óptica", serpAssessed: true }));
  return { keywords, standings, articles };
}

/** A prévia que o servidor devolve para o estado atual: 5 mantidos, 2 a gravar (com os alertas). */
const PREVIA = {
  groupId: AZUL, groupLabel: "Azul (Wi-Fi e fibra óptica)", planVersion: 3, siloName: "Wi-Fi e fibra óptica",
  territory: { kind: "rows", territoryRef: TERRITORIO_REAL, lifecycleStatus: "confirmed", name: "Wi-Fi e fibra óptica", sentence: "Silo do plano “Wi-Fi e fibra óptica” já existe e está confirmado: fica como está." },
  lines: [
    { keywordId: "k9", keyword: "internet fibra óptica", title: "", order: 9, role: "Pilar", action: "keep", sentence: "Já formado · v1: fica como está (nenhuma versão nova).", principalId: "k9", memberIds: ["k9"], alerts: [], articleId: "k9", versionNumber: 1 },
    { keywordId: "k10", keyword: "diferença entre internet e Wi-Fi", title: "", order: 10, role: "Suporte", action: "write", sentence: "Vai gravar o ArticleDNA v1 do plano: principal “diferença entre internet e Wi-Fi”; papel Suporte · 10º; escopo do plano como promessa.", principalId: "k10", memberIds: ["k10"], alerts: ["sem volume — livre, pode trocar"], articleId: null, versionNumber: null },
    { keywordId: "k11", keyword: "Wi-Fi lento", title: "", order: 11, role: "Suporte", action: "write", sentence: "Vai gravar o ArticleDNA v1 do plano: principal “Wi-Fi lento”; papel Suporte · 11º; escopo do plano como promessa.", principalId: "k11", memberIds: ["k11"], alerts: ["SERP das principais na etapa 2 (custo antes)"], articleId: null, versionNumber: null },
    ...["k12", "k13", "k14", "k15"].map((id, i) => ({ keywordId: id, keyword: AZUL_REAL.find(([k]) => k === id)![1], title: "", order: 12 + i, role: "Suporte", action: "keep", sentence: "Já formado · v1: fica como está (nenhuma versão nova).", principalId: id, memberIds: [id], alerts: [], articleId: id, versionNumber: 1 })),
  ],
  pillarKeywordId: "k9",
  summary: "2 artigo(s) do plano para gravar (v1), 5 já formado(s). Sem SERP e sem IA; nada é pago; nada é gravado no Minerador.",
  acceptedKeywordIds: ["k10", "k11"],
  decisionHash: "c".repeat(64),
};

function rede() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, method: init?.method ?? "GET", body });
    if (url.startsWith("/api/arquiteto/article-improvement") && !init?.method) return responder(null);
    if (url === "/api/arquiteto/serp-subject") return responder({ footprints: body.keywords.filter((item: any) => ["k9", "k12", "k13", "k14", "k15"].includes(item.keywordId)).map((item: any) => ({ keywordId: item.keywordId, keyword: item.keyword, lenses: lentes.map(lens => ({ lens, urls: [], domains: [], collectedAt: "2026-10-14T00:00:00Z" })) })), withoutSerp: [], missingLenses: [] });
    if (url === "/api/arquiteto/plan-silo/consolidate") {
      if (body.mode === "preview") return responder(PREVIA);
      return responder({ keywordId: body.keywordId, status: "written", message: `ArticleDNA v1 gravado e relido (consolidado do plano, sem SERP).`, articleId: body.keywordId, versionId: `${body.keywordId}:v1`, territoryRef: TERRITORIO_REAL, preview: PREVIA });
    }
    throw new Error(`Rede inesperada: ${url}`);
  };
}
const assentar = async (vezes = 25) => { for (let i = 0; i < vezes; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const AZUL_FILTRO: EditorialGroupScreenFilter = { kind: "groups", color: "azul", groupIds: [AZUL] };
const mesa = (opcoes: { hasPublished?: boolean } = {}) => {
  const estado = estadoAtual();
  return comProductShell(React.createElement(MesaDoPlano, {
    marca: MARCA_WIFI, keywords: estado.keywords, standings: estado.standings, articles: estado.articles, mesa: [], filtro: AZUL_FILTRO, registro,
    groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, hasPublished: opcoes.hasPublished ?? false,
  }));
};
const linhaDa = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-table-row"][data-keyword-id="${keywordId}"]`)!;
const selo = (keywordId: string, tipo: string) => linhaDa(keywordId).querySelector<HTMLElement>(`[data-plan-seal='${tipo}']`)!;
const semMinerador = () => assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "nenhum pedido ao Minerador");

test.beforeEach(async () => { chamadas = []; registro = novoRegistro(); screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("estado atual · volume do DNA é volume: os 5 formados mostram o número e a origem (nada de 'Volume de outra fonte'); jogos online está na tabela; a diferença alerta 'sem volume — livre'", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  assert.equal(screen.all("architect-plan-table-row").length, 7, "todo artigo do plano aparece (inclusive jogos online)");
  assert.equal(linhaDa("k13").dataset.formation, "formed");
  assert.equal(selo("k13", "formation").textContent, "Formado · v1");
  assert.equal(selo("k9", "volume").textContent, "Vol. 5.400");
  assert.match(selo("k9", "volume").title, /^5\.400 · medido em 13\/10\/2026 · Google Ads/);
  assert.equal(selo("k12", "volume").textContent, "Vol. 10");
  assert.equal(selo("k12", "lock").textContent, "Travada", "volume definido (mesmo 10) fixa a principal");
  assert.equal(selo("k11", "volume").textContent, "Vol. 260");
  assert.equal(selo("k10", "lock").textContent, "Livre");
  assert.match(linhaDa("k10").querySelector("[data-testid='architect-plan-row-alerts']")!.textContent!, /sem volume — livre, pode trocar/);
  assert.match(linhaDa("k11").querySelector("[data-testid='architect-plan-row-alerts']")!.textContent!, /sem SERP no cache — coletar na etapa 2/);
  assert.equal(screen.container.querySelectorAll("[data-plan-action='swapPrincipal']").length, 1, "só a livre sem volume procura outra principal");
  assert.doesNotMatch(screen.text(), /Volume de outra fonte|medir no Minerador/);
  assert.doesNotMatch(screen.text(), /plano v\d|· v[23]\b/, "nenhuma versão de plano misturada nas linhas");
  semMinerador();
});

test("a barra · UM lugar, no máximo 3 botões (a etapa atual em destaque e 'Melhorar publicados…' só com publicados); nenhum dos 9 botões antigos fora dela", async () => {
  rede();
  await screen.render(mesa({ hasPublished: true })); await assentar();
  const barra = screen.get("architect-articles-formation-actions");
  const botoes = [...barra.querySelectorAll<HTMLButtonElement>("button")];
  assert.ok(botoes.length <= 3, `até 3 botões (${botoes.length})`);
  assert.deepEqual(botoes.map(botao => botao.textContent), ["Consolidar o Silo do plano", "Melhorar publicados…"]);
  assert.equal(botoes[0].className, "primary", "a etapa atual em destaque");
  assert.doesNotMatch(botoes[0].textContent!, /\(\d+\)/, "sem contador");
  assert.match(screen.get("architect-plan-stage-line").textContent!, /2 artigo\(s\) do plano para gravar e o Silo do plano para consolidar/);
  const fora = screen.container.textContent!.replace(barra.textContent!, "");
  for (const rotulo of [...ROTULOS_REMOVIDOS, /Reprocessar artigos/, /Processar artigos/, /Concluir formação/, /Validar SERP/]) assert.doesNotMatch(fora, rotulo, String(rotulo));
  assert.equal(screen.all("architect-articles-formation-actions").length, 1, "uma barra só");
});

test("Consolidar o Silo do plano · prévia grátis → cancelar não grava → confirmar: uma linha por chamada com o MESMO hash, depois o SiloDNA/SiloPage do plano; sem SERP, sem IA, nada no Minerador", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  await screen.click("architect-plan-stage"); await assentar();
  const previa = screen.get("architect-plan-sheet-preview");
  assert.equal(previa.dataset.action, "consolidate");
  const pedido = chamadas.find(chamada => chamada.url === "/api/arquiteto/plan-silo/consolidate")!;
  assert.deepEqual(pedido.body, { brandId: MARCA_WIFI, groupId: AZUL, mode: "preview" });
  assert.match(screen.get("architect-plan-consolidation-preview").textContent!, /já existe e está confirmado: fica como está/);
  const linhas = screen.all("architect-plan-sheet-preview-line");
  assert.deepEqual(linhas.map(item => item.dataset.kind), ["known", "go", "go", "known", "known", "known", "known"]);
  assert.match(linhas[1].textContent!, /Suporte · 10º · Vai gravar o ArticleDNA v1 do plano.*Alertas: sem volume — livre, pode trocar/);
  assert.match(linhas[2].textContent!, /Alertas: SERP das principais na etapa 2/);
  await screen.click([...previa.querySelectorAll<HTMLButtonElement>("button")].find(botao => botao.textContent === "Cancelar")!); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.mode === "apply").length, 0, "cancelar não grava");
  await screen.click("architect-plan-stage"); await assentar();
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar e consolidar");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const aplicacoes = chamadas.filter(chamada => chamada.body?.mode === "apply");
  assert.deepEqual(aplicacoes.map(chamada => chamada.body.keywordId), ["k10", "k11"], "uma linha por chamada");
  assert.ok(aplicacoes.every(chamada => chamada.body.decisionHash === "c".repeat(64) && chamada.body.acceptedKeywordIds.join() === "k10,k11"), "a confirmação é uma só: o mesmo hash");
  assert.deepEqual(registro.pares, [{ groupId: AZUL, territoryRef: TERRITORIO_REAL, pillarKeywordId: "k9" }], "depois das linhas, o par do Silo com o Pilar do plano");
  assert.match(linhaDa("k10").querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /ArticleDNA v1 gravado e relido \(consolidado do plano, sem SERP\)/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /Consolidar o Silo do plano: 2 artigo\(s\) gravado\(s\) e relido\(s\)\. Silo: SiloDNA v1 e SiloPage v1 gravados.*Nada foi gravado no Minerador; nada foi pago/);
  assert.equal(registro.aplicados, 1, "a mesa é relida");
  assert.equal(chamadas.some(chamada => chamada.url === "/api/arquiteto/keyword-serp" || chamada.url === "/api/arquiteto/article-improvement" && chamada.method === "POST"), false, "sem SERP e sem a melhoria");
  assert.equal(screen.query("architect-plan-sheet-progress"), null, "nada fica girando");
  semMinerador();
});

test("Consolidar · linha que falha não derruba as outras e o Silo NÃO é consolidado sobre ela (o resumo diz o caminho)", async () => {
  rede();
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (String(input) === "/api/arquiteto/plan-silo/consolidate" && body?.mode === "apply" && body.keywordId === "k11") {
      chamadas.push({ url: String(input), method: "POST", body });
      return new Response(JSON.stringify({ success: false, error: "O plano, o Silo ou um artigo mudou desde a prévia. Gere a prévia de novo; nada foi gravado por esta linha.", code: "PLAN_CONSOLIDATION_STALE" }), { status: 409 });
    }
    return original(input, init);
  };
  await screen.render(mesa()); await assentar();
  await screen.click("architect-plan-stage"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.match(linhaDa("k11").querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /mudou desde a prévia/);
  assert.match(linhaDa("k10").querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /gravado e relido/);
  assert.deepEqual(registro.pares, [], "o Silo espera as linhas");
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /1 com falha.*O Silo não foi consolidado/);
});

/*
 * 2026-10-15 · ESTADO DE 15/10 (depois da consolidação de 03:25): os 7 artigos
 * formados e o par SiloDNA/SiloPage v1 gravado com o tema de um SUPORTE ("melhor
 * internet para jogos online") e a pendência na frase. A aba diz que o par não
 * está em dia (`siloConsolidatedOf` = falso) e a etapa 1 volta; a prévia
 * oferece "Corrigir a página do Silo (v2)" e a MESMA confirmação grava a v2 pelo
 * núcleo de "Aplicar o plano declarado ao Silo" — nenhuma linha é regravada.
 */
const SETE = AZUL_REAL.map(([id]) => id);
const PREVIA_COM_PAR = {
  ...PREVIA,
  lines: PREVIA.lines.map(line => ({ ...line, action: "keep", sentence: "Já formado · v1: fica como está (nenhuma versão nova).", alerts: [], articleId: line.keywordId, versionNumber: 1 })),
  territory: { kind: "rows", territoryRef: TERRITORIO_REAL, lifecycleStatus: "consolidated", name: "Wi-Fi e fibra óptica", sentence: "Silo do plano “Wi-Fi e fibra óptica” já existe e está consolidado (SiloDNA e SiloPage gravados): fica como está." },
  summary: "0 artigo(s) do plano para gravar (v1), 7 já formado(s). Sem SERP e sem IA; nada é pago; nada é gravado no Minerador.",
  acceptedKeywordIds: [],
  siloPair: { state: "fix", siloId: TERRITORIO_REAL, siloDnaVersionId: "6168ca46-d22c-49d9-95c5-94105faa89ef", decisionHash: "d".repeat(64), nextVersion: 2, changes: ["Corrigir a página do Silo: o tema “melhor internet para jogos online” é de um suporte do Silo, não do Silo; há pendência (“pendente de enriquecimento…”) dentro do texto. A versão nova grava o tema “melhor internet para jogos online” → “Wi-Fi e fibra óptica” no SiloDNA e no H1, título, introdução, chamada e seções da SiloPage, sem pendência no texto."], sentence: "Corrigir a página do Silo (v2) nesta mesma confirmação: Corrigir a página do Silo: o tema “melhor internet para jogos online” é de um suporte do Silo, não do Silo." },
};

test("estado de 15/10 · par v1 com o tema de um suporte: a etapa 1 volta, a prévia oferece 'Corrigir a página do Silo (v2)' e a confirmação grava a v2 (nenhuma linha regravada, nada no Minerador)", async () => {
  rede();
  const anterior = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url === "/api/arquiteto/plan-silo/consolidate" && body?.mode === "preview") { chamadas.push({ url, method: "POST", body }); return responder(PREVIA_COM_PAR); }
    if (url === "/api/arquiteto/silo-declared-plan") { chamadas.push({ url, method: "POST", body }); return responder({ mode: "apply", state: "APPLIED", siloDna: { versionId: "v2", versionNumber: 2 }, siloPage: { versionId: "p2", versionNumber: 2 } }); }
    return anterior(input, init);
  };
  const estado = estadoAtual();
  const articles: PlanSheetArticle[] = SETE.map(id => ({ articleId: id, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], slug: id, siloRef: TERRITORIO_REAL, siloLabel: "Wi-Fi e fibra óptica", serpAssessed: id !== "k10" && id !== "k11" }));
  await screen.render(comProductShell(React.createElement(MesaDoPlano, {
    marca: MARCA_WIFI, keywords: estado.keywords, standings: estado.standings, articles, mesa: SETE.map(id => ({ id: `art:${id}`, keyword: id, subjectKeywordId: id })), filtro: AZUL_FILTRO, registro,
    groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, siloConsolidado: false,
  }))); await assentar();
  assert.equal(screen.all("architect-plan-table-row").length, 0, "os 7 são artigos da tabela: nenhuma linha 'Ainda sem ArticleDNA'");
  assert.equal(screen.all("mesa-article-row").length, 7);
  assert.equal(screen.get("architect-plan-stage").textContent, "Consolidar o Silo do plano", "par com o tema errado: a etapa 1 volta");
  await screen.click("architect-plan-stage"); await assentar();
  const par = screen.get("architect-plan-consolidation-silo-pair");
  assert.equal(par.dataset.state, "fix");
  assert.match(par.textContent!, /^Corrigir a página do Silo \(v2\) nesta mesma confirmação/);
  assert.match(screen.get("architect-plan-consolidation-preview").textContent!, /já existe e está consolidado/);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/plan-silo/consolidate" && chamada.body?.mode === "apply").length, 0, "nenhuma linha é regravada");
  const correcao = chamadas.filter(chamada => chamada.url === "/api/arquiteto/silo-declared-plan");
  assert.deepEqual(correcao.map(chamada => chamada.body), [{ brandId: MARCA_WIFI, siloId: TERRITORIO_REAL, mode: "apply", expectedSiloDnaVersionId: "6168ca46-d22c-49d9-95c5-94105faa89ef", decisionHash: "d".repeat(64) }], "a mesma confirmação, o hash da prévia");
  assert.deepEqual(registro.pares, [], "o par existente não passa pela consolidação de primeira vez");
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /Silo: SiloDNA v2 e SiloPage v2 gravados e relidos, com o tema do Silo do plano\./);
  semMinerador();
});
