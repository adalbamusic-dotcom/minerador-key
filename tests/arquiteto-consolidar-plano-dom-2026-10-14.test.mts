import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { GRUPOS } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { AZUL, AZUL_REAL, MARCA_WIFI, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";
import { AbaSilosDoPlano, MesaDoPlano, ROTULOS_REMOVIDOS, novoRegistro, type Registro } from "./arquiteto-mesa-do-plano-harness.mts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import type { PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";
import type { EditorialGroupScreenFilter } from "../lib/editorial/editorial-groups.ts";
import { diagnoseSiloIdentity, siloIdentityCorrectionSentence, siloIdentityFixKind } from "../lib/arquiteto/silo-plan-identity.ts";
import { planSiloHeadSentence, planSiloStatus } from "../lib/arquiteto/declared-plan-silo.ts";
import { planSiloPairStep } from "../lib/arquiteto/plan-consolidation.ts";

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

/*
 * 2026-10-15 · PEDIDO DO DONO: "a definição do silo já tem que estar na aba do
 * Silo e não nos artigos. Artigo só mexe com artigos". A aba Artigos tem quatro
 * etapas SÓ DE ARTIGO (1 formar · 2 reforçar · 3 linha editorial · 4 links); o
 * "Consolidar o Silo do plano" mora na aba Silos (`AbaSilosDoPlano`, as mesmas
 * peças da tela). Testes reescritos com o motivo (antes a barra da aba Artigos
 * consolidava o Silo).
 */
test("a barra · UM lugar, no máximo 3 botões: a etapa atual em destaque, a seguinte desabilitada com o motivo, 'Melhorar publicados…' só com publicados; nenhum dos 9 botões antigos fora dela; nada de Silo", async () => {
  rede();
  await screen.render(mesa({ hasPublished: true })); await assentar();
  const barra = screen.get("architect-articles-formation-actions");
  const botoes = [...barra.querySelectorAll<HTMLButtonElement>("button")];
  assert.ok(botoes.length <= 3, `até 3 botões (${botoes.length})`);
  assert.deepEqual(botoes.map(botao => botao.textContent), ["1 · Formar artigos do plano", "2 · Reforçar keywords e SERP", "Melhorar publicados…"]);
  assert.equal(botoes[0].className, "primary", "a etapa atual em destaque");
  assert.equal(botoes[1].disabled, true, "a seguinte desabilitada");
  assert.match(botoes[1].title, /Depois de formar os artigos do plano \(etapa 1\)/);
  assert.doesNotMatch(botoes[0].textContent!, /\(\d+\)/, "sem contador");
  assert.match(screen.get("architect-plan-stage-line").textContent!, /2 artigo\(s\) do plano sem ArticleDNA para gravar/);
  assert.doesNotMatch(barra.textContent!, /Consolidar o Silo do plano/, "a aba Artigos não consolida Silo");
  const fora = screen.container.textContent!.replace(barra.textContent!, "");
  for (const rotulo of [...ROTULOS_REMOVIDOS, /Reprocessar artigos/, /Processar artigos/, /Concluir formação/, /Validar SERP/]) assert.doesNotMatch(fora, rotulo, String(rotulo));
  assert.equal(screen.all("architect-articles-formation-actions").length, 1, "uma barra só");
});

test("sem o Silo do plano decidido: 'O Silo do plano é consolidado na aba Silos' com o link; as etapas desabilitadas com o motivo; nada é pedido ao servidor", async () => {
  rede();
  const estado = estadoAtual();
  await screen.render(comProductShell(React.createElement(MesaDoPlano, {
    marca: MARCA_WIFI, keywords: estado.keywords, standings: estado.standings, articles: estado.articles, mesa: [], filtro: AZUL_FILTRO, registro,
    groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, siloGate: { ready: false, pairCurrent: false, sentence: "O Silo do plano é consolidado na aba Silos" },
  }))); await assentar();
  const barra = screen.get("architect-articles-formation-actions");
  const etapas = [...barra.querySelectorAll<HTMLButtonElement>("button[data-stage]")];
  assert.ok(etapas.length >= 1 && etapas.every(botao => botao.disabled), "as etapas ficam desabilitadas");
  assert.ok(etapas.every(botao => /aba Silos/.test(botao.title)), "o motivo no title");
  assert.equal(screen.query("architect-plan-stage"), null, "nenhuma etapa em destaque");
  assert.match(screen.get("architect-plan-stage-line").textContent!, /^O Silo do plano é consolidado na aba Silos\./);
  assert.ok([...barra.querySelectorAll("button")].length <= 3);
  await screen.click("architect-plan-go-silos");
  assert.equal(registro.silos, 1, "o link leva à aba Silos");
  assert.equal(chamadas.some(chamada => chamada.url.startsWith("/api/arquiteto/plan-silo")), false, "a aba Artigos não cria nem consolida Silo");
});

test("1 · Formar artigos do plano · prévia grátis → cancelar não grava → confirmar: uma linha por chamada (escopo artigos) com o MESMO hash; nenhum Silo tocado; sem SERP, sem IA, nada no Minerador", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  await screen.click("architect-plan-stage"); await assentar();
  const previa = screen.get("architect-plan-sheet-preview");
  assert.equal(previa.dataset.action, "formArticles");
  const pedido = chamadas.find(chamada => chamada.url === "/api/arquiteto/plan-silo/consolidate")!;
  assert.deepEqual(pedido.body, { brandId: MARCA_WIFI, groupId: AZUL, mode: "preview", scope: "articles" });
  assert.equal(screen.get("architect-plan-consolidation-preview").dataset.scope, "articles");
  assert.match(screen.get("architect-plan-consolidation-preview").textContent!, /O Silo não é tocado/);
  const linhas = screen.all("architect-plan-sheet-preview-line");
  assert.deepEqual(linhas.map(item => item.dataset.kind), ["known", "go", "go", "known", "known", "known", "known"]);
  assert.match(linhas[1].textContent!, /Suporte · 10º · Vai gravar o ArticleDNA v1 do plano.*Alertas: sem volume — livre, pode trocar/);
  assert.match(linhas[2].textContent!, /Alertas: SERP das principais na etapa 2/);
  await screen.click([...previa.querySelectorAll<HTMLButtonElement>("button")].find(botao => botao.textContent === "Cancelar")!); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.mode === "apply").length, 0, "cancelar não grava");
  await screen.click("architect-plan-stage"); await assentar();
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar e gravar");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const aplicacoes = chamadas.filter(chamada => chamada.body?.mode === "apply");
  assert.deepEqual(aplicacoes.map(chamada => chamada.body.keywordId), ["k10", "k11"], "uma linha por chamada");
  assert.ok(aplicacoes.every(chamada => chamada.body.scope === "articles" && chamada.body.decisionHash === "c".repeat(64) && chamada.body.acceptedKeywordIds.join() === "k10,k11"), "a confirmação é uma só: o mesmo hash, escopo artigos");
  assert.deepEqual(registro.pares, [], "a aba Artigos não grava o SiloDNA/SiloPage");
  assert.equal(chamadas.some(chamada => chamada.url === "/api/arquiteto/silo-declared-plan"), false, "nem corrige a página do Silo");
  assert.match(linhaDa("k10").querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /ArticleDNA v1 gravado e relido \(consolidado do plano, sem SERP\)/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /1 · Formar artigos do plano: 2 artigo\(s\) gravado\(s\) e relido\(s\)\. A página do Silo é da aba Silos\. Nada foi gravado no Minerador; nada foi pago/);
  assert.equal(registro.aplicados, 1, "a mesa é relida");
  assert.equal(chamadas.some(chamada => chamada.url === "/api/arquiteto/keyword-serp" || chamada.url === "/api/arquiteto/article-improvement" && chamada.method === "POST"), false, "sem SERP e sem a melhoria");
  assert.equal(screen.query("architect-plan-sheet-progress"), null, "nada fica girando");
  semMinerador();
});

test("1 · Formar · linha que falha não derruba as outras (o resumo diz quantas)", async () => {
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
  assert.deepEqual(registro.pares, []);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /1 com falha/);
});

/*
 * ABA SILOS · ESTADO DE 15/10 (SELECT): os 7 artigos formados e o par
 * SiloDNA/SiloPage v1 gravado com o tema de um SUPORTE ("melhor internet para
 * jogos online"); a keyword do Silo "Wi-Fi e fibra óptica" (34bd7c0f) NÃO está
 * no Arquiteto (0 volume, bruta no Minerador) — e isso é normal. "Consolidar o
 * Silo do plano" (aba Silos) reusa o Silo do plano e, na MESMA confirmação,
 * grava "Corrigir a página do Silo (v2)"; nenhum artigo é gravado.
 */
const SETE = AZUL_REAL.map(([id]) => id);
const PREVIA_DO_SILO = {
  ...PREVIA,
  lines: PREVIA.lines.map(line => ({ ...line, action: "keep", sentence: "Já formado · v1: fica como está (nenhuma versão nova).", alerts: [], articleId: line.keywordId, versionNumber: 1 })),
  territory: { kind: "rows", territoryRef: TERRITORIO_REAL, lifecycleStatus: "consolidated", name: "Wi-Fi e fibra óptica", sentence: "Silo do plano “Wi-Fi e fibra óptica” já existe e está consolidado (SiloDNA e SiloPage gravados): fica como está." },
  summary: "0 artigo(s) do plano para gravar (v1), 7 já formado(s). Sem SERP e sem IA; nada é pago; nada é gravado no Minerador.",
  acceptedKeywordIds: [],
  siloDecisionHash: "e".repeat(64),
  siloReady: true,
  headKeyword: null,
  headSentence: "Keyword do Silo: nenhuma no Arquiteto — normal (0 volume, não cadastrada, Silo não indexado). A identidade vem do plano: “Wi-Fi e fibra óptica” · /wifi-e-fibra.",
  keywordsWithoutSilo: [],
  pillarFormed: true,
  siloPair: { state: "fix", siloId: TERRITORIO_REAL, siloDnaVersionId: "6168ca46-d22c-49d9-95c5-94105faa89ef", decisionHash: "d".repeat(64), nextVersion: 2, changes: ["Corrigir a página do Silo: o tema “melhor internet para jogos online” é de um suporte do Silo, não do Silo."], sentence: "Corrigir a página do Silo (v2) nesta mesma confirmação: Corrigir a página do Silo: o tema “melhor internet para jogos online” é de um suporte do Silo, não do Silo." },
};
const ENTRADA_AZUL = (stage: "fix" | "pair" | "done", actionable = true) => ({
  groupId: AZUL, colorLabel: "Azul", color: "azul" as const, siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra",
  status: { stage, actionable, readyForArticles: true, pairCurrent: stage === "done", sentence: stage === "fix" ? "A página do Silo “Wi-Fi e fibra óptica” está fora do plano (tema, Pilar ou ordem): consolidar grava a versão seguinte." : "O Silo do plano “Wi-Fi e fibra óptica” está pronto: consolidar grava o SiloDNA e a SiloPage com o Pilar e a ordem do plano." },
  headSentence: PREVIA_DO_SILO.headSentence,
});
function redeDoSilo(previa: Record<string, unknown>) {
  rede();
  const anterior = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url === "/api/arquiteto/plan-silo/consolidate" && body?.mode === "preview") { chamadas.push({ url, method: "POST", body }); return responder(previa); }
    if (url === "/api/arquiteto/plan-silo/consolidate" && body?.scope === "silo") { chamadas.push({ url, method: "POST", body }); return responder({ territoryRef: TERRITORIO_REAL, message: "Silo do plano “Wi-Fi e fibra óptica” confirmado. Relido.", preview: previa }); }
    if (url === "/api/arquiteto/silo-declared-plan") { chamadas.push({ url, method: "POST", body }); return responder({ mode: "apply", state: "APPLIED", siloDna: { versionId: "v2", versionNumber: 2 }, siloPage: { versionId: "p2", versionNumber: 2 } }); }
    return anterior(input, init);
  };
}
const abaSilos = (entrada: ReturnType<typeof ENTRADA_AZUL>) => {
  const estado = estadoAtual();
  const articles: PlanSheetArticle[] = SETE.map(id => ({ articleId: id, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], slug: id, siloRef: TERRITORIO_REAL, siloLabel: "Wi-Fi e fibra óptica", serpAssessed: true }));
  return comProductShell(React.createElement(AbaSilosDoPlano, {
    marca: MARCA_WIFI, keywords: estado.keywords, standings: estado.standings, articles, filtro: AZUL_FILTRO, registro,
    groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, entradas: [entrada],
  }));
};

test("aba Silos · estado de 15/10: a linha do Silo do plano oferece 'Consolidar o Silo do plano'; prévia com a identidade do plano, a keyword do Silo ausente (normal) e 'Corrigir a página do Silo (v2)'; a confirmação grava o Silo e a v2 — nenhum artigo, nenhum Silo novo, nada no Minerador", async () => {
  redeDoSilo(PREVIA_DO_SILO);
  await screen.render(abaSilos(ENTRADA_AZUL("fix"))); await assentar();
  const linha = screen.get("architect-plan-silo-row");
  assert.equal(linha.dataset.stage, "fix");
  assert.match(linha.textContent!, /Silo do plano.*“Wi-Fi e fibra óptica” · \/wifi-e-fibra/);
  const botao = screen.get("architect-plan-silo-consolidate");
  assert.equal(botao.textContent, "Consolidar o Silo do plano");
  assert.equal(botao.className, "primary");
  await screen.click(botao); await assentar();
  assert.deepEqual(chamadas.find(chamada => chamada.url === "/api/arquiteto/plan-silo/consolidate")!.body, { brandId: MARCA_WIFI, groupId: AZUL, mode: "preview", scope: "silo" });
  const previa = screen.get("architect-plan-consolidation-preview");
  assert.equal(previa.dataset.scope, "silo");
  assert.match(previa.textContent!, /já existe e está consolidado/);
  assert.match(screen.get("architect-plan-silo-head").textContent!, /Keyword do Silo: nenhuma no Arquiteto — normal/);
  assert.match(previa.textContent!, /Nenhum artigo vira Silo e nenhum Silo paralelo é criado/);
  const par = screen.get("architect-plan-consolidation-silo-pair");
  assert.equal(par.dataset.state, "fix");
  assert.match(par.textContent!, /^Corrigir a página do Silo \(v2\) nesta mesma confirmação/);
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar e consolidar o Silo");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const doSilo = chamadas.filter(chamada => chamada.url === "/api/arquiteto/plan-silo/consolidate" && chamada.body?.mode === "apply");
  assert.deepEqual(doSilo.map(chamada => chamada.body), [{ brandId: MARCA_WIFI, groupId: AZUL, mode: "apply", scope: "silo", decisionHash: "e".repeat(64) }], "uma chamada do Silo, sem linha de artigo");
  const correcao = chamadas.filter(chamada => chamada.url === "/api/arquiteto/silo-declared-plan");
  assert.deepEqual(correcao.map(chamada => chamada.body), [{ brandId: MARCA_WIFI, siloId: TERRITORIO_REAL, mode: "apply", expectedSiloDnaVersionId: "6168ca46-d22c-49d9-95c5-94105faa89ef", decisionHash: "d".repeat(64) }], "a mesma confirmação, o hash da prévia");
  assert.deepEqual(registro.pares, [], "o par existente não passa pela consolidação de primeira vez");
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /Consolidar o Silo do plano: Silo do plano “Wi-Fi e fibra óptica” confirmado\. Relido\. Página do Silo: SiloDNA v2 e SiloPage v2 gravados e relidos, com o tema do Silo do plano\. Nenhum artigo foi convertido em Silo/);
  semMinerador();
});

test("aba Silos · Silo pronto sem página e o Pilar já formado: a mesma confirmação grava o SiloDNA e a SiloPage v1 pelo fechamento de sempre (Pilar do plano)", async () => {
  redeDoSilo({ ...PREVIA_DO_SILO, siloPair: { state: "missing", siloId: null, sentence: "O SiloDNA e a SiloPage do plano são gravados depois das linhas (Pilar e ordem do plano)." }, territory: { ...PREVIA_DO_SILO.territory, lifecycleStatus: "confirmed", sentence: "Silo do plano “Wi-Fi e fibra óptica” já existe e está confirmado: fica como está." } });
  await screen.render(abaSilos(ENTRADA_AZUL("pair"))); await assentar();
  await screen.click("architect-plan-silo-consolidate"); await assentar();
  assert.match(screen.get("architect-plan-consolidation-silo-pair").textContent!, /SiloDNA e a SiloPage v1 são gravados nesta mesma confirmação/);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(registro.pares, [{ groupId: AZUL, territoryRef: TERRITORIO_REAL, pillarKeywordId: "k9" }], "o par do Silo com o Pilar do plano");
  assert.equal(chamadas.some(chamada => chamada.body?.keywordId), false, "nenhuma linha de artigo");
});

test("aba Silos · Silo do plano em dia: o botão fica desabilitado com o motivo (nada a consolidar)", async () => {
  rede();
  await screen.render(abaSilos({ ...ENTRADA_AZUL("done", false), status: { stage: "done", actionable: false, readyForArticles: true, pairCurrent: true, sentence: "O Silo do plano “Wi-Fi e fibra óptica” e a página dele seguem o plano." } })); await assentar();
  const botao = screen.get("architect-plan-silo-consolidate") as HTMLButtonElement;
  assert.equal(botao.disabled, true);
  assert.match(botao.title, /seguem o plano/);
});

/*
 * 2026-10-15 (noite) · READBACK DO DONO (SELECT 18:35): nenhum SiloDNA/SiloPage
 * novo — a SiloPage v1 continua com o H1 "melhor internet para jogos online" — e
 * a aba Artigos deixou seguir na etapa 2 sem dizer nada. O estado REAL, montado
 * pelas regras de verdade (sem entrada feita à mão): SiloPage v1 com o H1 de um
 * suporte, a entidade central do território = um suporte, a keyword do Silo
 * ausente e o grupo apontando para um território que sumiu.
 */
const TERRITORIO_QUE_SUMIU = "territory:09d9b92d-db4d-4409-88c7-bd7ca5e77c7e";
const SUPORTES_DO_AZUL = AZUL_REAL.filter(([, , , , papel]) => papel === "Suporte").flatMap(([id, keyword, titulo]) => [keyword, id, titulo]);
const DIAGNOSTICO_REAL = diagnoseSiloIdentity({
  centralEntity: "melhor internet para jogos online",
  siloName: "Wi-Fi e fibra óptica",
  macroProblem: "Dificuldade em melhor internet para jogos online para pendente de enriquecimento e revisão humana.",
  page: { h1: "melhor internet para jogos online", intro: "Este conteúdo organiza os principais temas sobre melhor internet para jogos online para pendente de enriquecimento e revisão humana.", cta: "Conheça todos os conteúdos sobre melhor internet para jogos online.", seoTitle: "melhor internet para jogos online | Guia completo" },
  planSiloName: "Wi-Fi e fibra óptica",
  pillarLabel: "internet fibra óptica",
  supportLabels: SUPORTES_DO_AZUL,
});

test("aba Artigos · Silo do plano decidido e a página com o tema de um suporte: a barra diz 'A página do Silo precisa de correção (tema) — corrija na aba Silos' com o link; as etapas de artigo seguem", async () => {
  assert.ok(DIAGNOSTICO_REAL, "o par v1 do readback precisa de correção");
  const pageFix = siloIdentityFixKind(DIAGNOSTICO_REAL!);
  assert.equal(pageFix, "tema");
  rede();
  const estado = estadoAtual();
  const sete: PlanSheetArticle[] = SETE.map(id => ({ articleId: id, versionNumber: 2, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], slug: id, siloRef: TERRITORIO_REAL, siloLabel: "Wi-Fi e fibra óptica", serpAssessed: true }));
  await screen.render(comProductShell(React.createElement(MesaDoPlano, {
    marca: MARCA_WIFI, keywords: estado.keywords, standings: estado.standings, articles: sete, mesa: [], filtro: AZUL_FILTRO, registro,
    groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, siloGate: { ready: true, pairCurrent: false, sentence: "O Silo do plano é consolidado na aba Silos", pageFix },
  }))); await assentar();
  const linha = screen.get("architect-plan-stage-line");
  assert.equal(linha.dataset.pageFix, "true");
  assert.match(linha.textContent!, /^A página do Silo precisa de correção \(tema\) — corrija na aba Silos\. Abrir a aba Silos$/);
  const etapas = [...screen.get("architect-articles-formation-actions").querySelectorAll<HTMLButtonElement>("button[data-stage]")];
  assert.ok(etapas.some(botao => !botao.disabled), "as etapas de artigo seguem (o aviso não trava a aba)");
  assert.ok([...screen.get("architect-articles-formation-actions").querySelectorAll("button")].length <= 3, "no máximo 3 botões, o link incluído");
  await screen.click("architect-plan-go-silos");
  assert.equal(registro.silos, 1, "o link leva à aba Silos");
  assert.equal(chamadas.some(chamada => chamada.url.startsWith("/api/arquiteto/plan-silo")), false, "a aba Artigos não corrige nem consolida Silo");
  // Página em dia: nenhuma linha de correção.
  await screen.render(comProductShell(React.createElement(MesaDoPlano, {
    marca: MARCA_WIFI, keywords: estado.keywords, standings: estado.standings, articles: sete, mesa: [], filtro: AZUL_FILTRO, registro,
    groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, siloGate: { ready: true, pairCurrent: true, sentence: "O Silo do plano é consolidado na aba Silos", pageFix: null },
  }))); await assentar();
  assert.doesNotMatch(screen.get("architect-plan-stage-line").textContent!, /precisa de correção/);
  assert.equal(screen.query("architect-plan-go-silos"), null);
});

test("aba Silos · o estado REAL do readback (par v1 com o tema de um suporte, keyword do Silo ausente, vínculo velho): 'Consolidar o Silo do plano' HABILITADO, a linha diz a correção e a prévia traz 'Corrigir a página do Silo (v2)'", async () => {
  const status = planSiloStatus({
    siloName: "Wi-Fi e fibra óptica",
    territory: { territoryRef: TERRITORIO_REAL, lifecycleStatus: "consolidated", name: "Wi-Fi e fibra óptica" },
    linkedTerritoryRef: TERRITORIO_QUE_SUMIU, rejected: false, split: false, keywordsWithoutSilo: 0,
    pair: DIAGNOSTICO_REAL ? "fix" : "current", pillarFormed: true,
  });
  assert.deepEqual([status.stage, status.actionable, status.readyForArticles, status.pairCurrent], ["link", true, true, false]);
  assert.match(status.sentence, /o grupo volta a apontar para ele; a página do Silo está fora do plano e é corrigida na versão seguinte\.$/);
  const entrada = { groupId: AZUL, colorLabel: "Azul", color: "azul" as const, siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", status, headSentence: planSiloHeadSentence({ siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", head: null }) };
  const siloPair = planSiloPairStep({ siloId: TERRITORIO_REAL, currentVersion: 1, declaredPlan: { state: "READY", changes: [siloIdentityCorrectionSentence(DIAGNOSTICO_REAL!)], decisionHash: "d".repeat(64), siloDnaVersionId: "6168ca46-d22c-49d9-95c5-94105faa89ef" } });
  redeDoSilo({ ...PREVIA_DO_SILO, linkedSiloId: TERRITORIO_QUE_SUMIU, siloPair });
  await screen.render(abaSilos(entrada as never)); await assentar();
  const botao = screen.get("architect-plan-silo-consolidate") as HTMLButtonElement;
  assert.equal(botao.disabled, false, "habilitado");
  assert.equal(botao.className, "primary");
  assert.match(screen.get("architect-plan-silo-line").textContent!, /página do Silo está fora do plano/);
  await screen.click(botao); await assentar();
  const par = screen.get("architect-plan-consolidation-silo-pair");
  assert.equal(par.dataset.state, "fix");
  assert.match(par.textContent!, /^Corrigir a página do Silo \(v2\) nesta mesma confirmação: Corrigir a página do Silo: o tema “melhor internet para jogos online” é de um suporte do Silo, não do Silo/);
  assert.match(screen.get("architect-plan-silo-head").textContent!, /Keyword do Silo: nenhuma no Arquiteto — normal/);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/silo-declared-plan").length, 1, "a v2 é gravada na mesma confirmação");
  semMinerador();
});

test("3 · Linha editorial sem BrandDNA aprovado: a prévia diz 'Público pendente: Aprove o BrandDNA em Marca e rode a Linha editorial de novo.'; com o BrandDNA, a linha some", async () => {
  const PREVIA_EDITORIAL = (brandDnaAvailable: boolean) => ({
    groupId: AZUL, siloName: "Wi-Fi e fibra óptica", brandDnaAvailable,
    lines: [{ articleId: "k9", versionNumber: 2, keywordId: "k9", keyword: "internet fibra óptica", title: "", role: "Pilar", order: 9, changes: [{ field: "angle", label: "Ângulo", before: "x — intenção commercial_investigation confirmada pela SERP.", after: "x — intenção comercial investigativa confirmada pela SERP.", source: "Assunto + parecer de SERP · corrige o texto da regra antiga" }], sentence: "Vai gravar a versão seguinte com Ângulo.", lineHash: "f".repeat(64) }],
    acceptedArticleIds: ["k9"],
    summary: `1 artigo(s) com a linha editorial para gravar (versão seguinte), 0 sem mudança.${brandDnaAvailable ? "" : " Sem BrandDNA aprovado, o Público fica pendente: Aprove o BrandDNA em Marca e rode a Linha editorial de novo."}`,
  });
  let comMarca = false;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, method: init?.method ?? "GET", body });
    if (url.startsWith("/api/arquiteto/article-improvement") && !init?.method) return responder(null);
    if (url === "/api/arquiteto/serp-subject") return responder({ footprints: body.keywords.map((item: any) => ({ keywordId: item.keywordId, keyword: item.keyword, lenses: lentes.map(lens => ({ lens, urls: [], domains: [], collectedAt: "2026-10-14T00:00:00Z" })) })), withoutSerp: [], missingLenses: [] });
    if (url === "/api/arquiteto/plan-silo/editorial-line") return responder(PREVIA_EDITORIAL(comMarca));
    throw new Error(`Rede inesperada: ${url}`);
  };
  const estado = estadoAtual();
  const sete: PlanSheetArticle[] = SETE.map(id => ({ articleId: id, versionNumber: 2, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], slug: id, siloRef: TERRITORIO_REAL, siloLabel: "Wi-Fi e fibra óptica", serpAssessed: true, editorialPending: true }));
  const montar = () => comProductShell(React.createElement(MesaDoPlano, {
    marca: MARCA_WIFI, keywords: estado.keywords, standings: estado.standings, articles: sete, mesa: [], filtro: AZUL_FILTRO, registro,
    groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, siloGate: { ready: true, pairCurrent: true, sentence: "O Silo do plano é consolidado na aba Silos" },
  }));
  await screen.render(montar()); await assentar();
  const etapa = screen.get("architect-plan-stage");
  assert.equal(etapa.dataset.stage, "3", "a etapa 3 é a atual (os 7 com a linha editorial a corrigir)");
  await screen.click(etapa); await assentar();
  assert.equal(screen.get("architect-plan-editorial-line-brand-dna").textContent, "Público pendente: Aprove o BrandDNA em Marca e rode a Linha editorial de novo.");
  assert.match(screen.get("architect-plan-editorial-line-preview").textContent!, /corrigido/);
  // O dono aprova o BrandDNA em Marca, cancela esta prévia e roda a Linha editorial de novo.
  comMarca = true;
  const cancelar = [...screen.container.querySelectorAll<HTMLButtonElement>("button")].find(botao => botao.textContent === "Cancelar")!;
  await screen.click(cancelar); await assentar();
  await screen.click("architect-plan-stage"); await assentar();
  assert.equal(Boolean(screen.query("architect-plan-editorial-line-preview")), true, "a prévia nova");
  assert.equal(Boolean(screen.query("architect-plan-editorial-line-brand-dna")), false, "com o BrandDNA aprovado, o público entra e o aviso some");
  semMinerador();
});
