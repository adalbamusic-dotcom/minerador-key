import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { PlanArticleTableRow, PlanRowActions, PlanRowSeals, PlanSheetOperations, usePlanArticleSheet } from "../modules/arquiteto/plan-article-sheet.tsx";
import { ArticlesFormationBar } from "../modules/arquiteto/articles-formation-bar.tsx";
import { TopbarGroupTag } from "../components/editorial/group-selector.tsx";
import { editorialGroupChoiceMissingInBrand, resetEditorialGroupAreaStoreForTests, setEditorialGroupAreaChoice, useAreaGroupFilter } from "../components/editorial/editorial-group-area-store.ts";
import { buildPlanSheetRows, planOrderedGroupItems, planRowsWithoutArticle, splitTableSelectionForPlan, type PlanSheetArticle, type PlanSheetRow } from "../lib/arquiteto/plan-article-sheet.ts";
import type { EditorialGroupScreenFilter } from "../lib/editorial/editorial-groups.ts";
import { GRUPOS } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { ARTIGO_INTRUSO, AZUL, MARCA_WIFI, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-14 (tarde) · PEDIDO DO DONO, na tela de verdade: "coloca só numa
 * lista, não cria várias listas, sem planilhas duplicadas, (…) os processos
 * ainda estão em paralelo, não está nos botões principais, sumiram os botões
 * de processo normal (…) é tudo por esse painel cheio de textos".
 *
 * A mesa abaixo é montada com as MESMAS peças que a aba Artigos usa
 * (`usePlanArticleSheet`, `ArticlesFormationBar`, `PlanSheetOperations`,
 * `PlanArticleTableRow`, `PlanRowSeals`, `PlanRowActions` e a ordem/seleção
 * do domínio). Caso real WifiConecta (cor azul, 7 artigos do plano: 4 com
 * candidato na mesa e 3 presos no artigo do laranja) e uma marca grande sem
 * plano (AdalbaPro). Sem rede real, sem provider, sem custo.
 */

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[], aplicados: number;
const lentes = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];
const planoSerp = (paid: number) => ({ lenses: lentes, perLens: [], paidQueries: paid, primaryPaidQueries: paid / 4, extraPaidQueries: (paid * 3) / 4, conditionalPaidQueries: 0, recollectableQueries: 0, estimatedCostUsd: { min: paid * 0.0006, max: paid * 0.002 }, collectedAtSpreadDays: 0, datesDiverge: false, payMissingExtraLenses: true, recollectStaleLenses: false, digestChecked: false });
const execucao = (extra: Record<string, unknown>) => ({ version: 1, runId: "22222222-2222-4222-8222-222222222222", brandId: MARCA_WIFI, actorId: "ator", createdAt: "2026-10-14T12:00:00Z", state: "prepared", decisionHash: "b".repeat(64), leaseUntil: null, sourceHashes: {}, targets: [], keywords: [], beforeAssignments: {}, proposals: [], costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, reservedCostUsd: 0, notices: [], outcomes: [], acceptedIds: null, origin: "plan_sheet", ...extra });
const proposta = (targetId: string) => ({ targetId, kind: "subject", theme: targetId, currentPrimaryId: targetId, principalId: targetId, memberIds: [targetId], addIds: [], removeIds: [], transfers: [], angle: "", exclusions: [], reasons: ["Motivo do núcleo."], status: "ready", evidenceBasis: "serp" });
const responder = (data: unknown, status = 200, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: status < 300, data, ...extra }), { status });

const ADALBAPRO = "a0a0a0a0-0000-4000-8000-0000000000ad";
const GRUPO_LARANJA_ADALBA = "a0a0a0a0-0000-4000-8000-0000000000c1";
const grupoDoServidor = (id: string, marcaId: string, color: string, name: string) => ({ id, marcaId, name, color, origin: "manual", status: "active", siloId: null, planVersion: 0, lockVersion: 1, updatedAt: "2026-10-14T00:00:00Z", keywordCount: 10, articleCount: 2 });

function rede() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, method: init?.method ?? "GET", body });
    if (url.startsWith("/api/editorial/groups?marcaId=")) {
      const marca = decodeURIComponent(url.split("marcaId=")[1]);
      const grupos = marca === ADALBAPRO ? [grupoDoServidor(GRUPO_LARANJA_ADALBA, ADALBAPRO, "laranja", "Planos")] : [grupoDoServidor(AZUL, MARCA_WIFI, "azul", "Wi-Fi e fibra óptica")];
      return new Response(JSON.stringify({ success: true, groups: grupos, ungroupedKeywordCount: 0 }), { status: 200 });
    }
    if (url.startsWith("/api/arquiteto/article-improvement") && !init?.method) return responder(null);
    if (url === "/api/arquiteto/serp-subject") return responder({ footprints: body.keywords.filter((item: any) => item.keywordId === "k9").map((item: any) => ({ keywordId: item.keywordId, keyword: item.keyword, lenses: lentes.map(lens => ({ lens, urls: [], domains: [], collectedAt: "2026-10-01T00:00:00Z" })) })), withoutSerp: [], missingLenses: [] });
    if (url === "/api/arquiteto/keyword-serp") {
      if (body.mode === "plan") return responder({ mode: "plan", plan: planoSerp(body.keywords.length * 4) });
      return responder({ observations: [{}], gaps: [], collected: body.keywords.length * 4, reused: 0 });
    }
    if (url === "/api/arquiteto/article-improvement") {
      if (body.action === "prepare") return responder(execucao({ proposals: body.targetIds.map(proposta) }));
      if (body.action === "apply" || body.action === "status") {
        const ids: string[] = body.targetIds ?? [];
        return responder(execucao({ state: "complete", acceptedIds: ids, outcomes: ids.map(id => ({ targetId: id, status: "dna_created", message: `ArticleDNA de ${id} criado e relido.` })) }));
      }
    }
    throw new Error(`Rede inesperada: ${url}`);
  };
}
const assentar = async (vezes = 25) => { for (let i = 0; i < vezes; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const h = React.createElement;
const COLUNAS = ["index", "selection", "expand", "article", "keyword", "keywordCount", "siloRole", "articleDefinition", "silo", "actions", "approval", "status"];
const VAZIO = new Set<string>();

/** O artigo da mesa, na forma mínima: o Assunto dele diz se é do plano (o mesmo critério da aba). */
type ArtigoDaMesa = { id: string; keyword: string; subjectKeywordId: string | null };
type Registro = { processar: string[][]; concluir: string[][] };

function MesaUmaTabela({ marca, keywords, articles, mesa, filtro, registro }: { marca: string; keywords: readonly Record<string, unknown>[]; articles: readonly PlanSheetArticle[]; mesa: readonly ArtigoDaMesa[]; filtro: EditorialGroupScreenFilter; registro: Registro }) {
  const sheet = usePlanArticleSheet({ brandId: marca, brandRef: "wificonecta--d4fa133a", keywords, groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, filter: filtro, articles, radarArticleIds: VAZIO, onApplied: () => { aplicados += 1; } });
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
  const planRowOf = (art: ArtigoDaMesa): PlanSheetRow | null => art.subjectKeywordId ? sheet.rowByKeywordId.get(art.subjectKeywordId) ?? null : null;
  const representadas = new Set(mesa.map(planRowOf).filter((row): row is PlanSheetRow => Boolean(row)).map(row => row.keywordId));
  const soDoPlano = planRowsWithoutArticle(sheet.rows, representadas);
  const divisao = splitTableSelectionForPlan({ articles: mesa, selectedArticleIds: selecionados, idOf: art => art.id, planRowOf, planOnlyRows: soDoPlano, selectedPlanKeywordIds: sheet.selected });
  const escopo = { selectedCount: divisao.regularArticleIds.size, reason: divisao.regularArticleIds.size ? null : "Selecione pelo menos um artigo." };
  const itens = planOrderedGroupItems({ articles: mesa, planRows: soDoPlano, idOf: art => art.id, planRowOf });
  const alternar = (id: string) => setSelecionados(atual => { const proximo = new Set(atual); if (proximo.has(id)) proximo.delete(id); else proximo.add(id); return proximo; });
  return h(React.Fragment, null,
    h(ArticlesFormationBar, {
      formationBusy: false, processed: false, selectionScope: escopo, planTargets: divisao.planTargets, planSheet: sheet,
      onProcess: async () => { registro.processar.push([...divisao.regularArticleIds]); },
      onConfirm: async () => { registro.concluir.push([...divisao.regularArticleIds]); },
      improvementOpen: false, onToggleImprovement: () => undefined, buttonClassName: "button",
    }),
    h(PlanSheetOperations, { sheet, buttonClassName: "button", primaryButtonClassName: "button", controlClassName: "control", dangerButtonClassName: "danger" }),
    h("table", { "data-architect-table": "articles" }, h("tbody", null, itens.map(item => item.kind === "plan"
      ? h(PlanArticleTableRow, { key: item.key, sheet, row: item.row, columns: COLUNAS, buttonClassName: "button" })
      : h("tr", { key: item.key, "data-testid": "mesa-article-row", "data-article-id": item.article.id },
        h("td", null, h("input", { type: "checkbox", "aria-label": `Selecionar ${item.article.keyword}`, checked: selecionados.has(item.article.id), onChange: () => alternar(item.article.id), "data-article-selection": item.article.id })),
        h("td", null, item.article.keyword, item.planRow ? h(PlanRowSeals, { row: item.planRow, result: sheet.results.get(item.planRow.keywordId) ?? null }) : null),
        h("td", null, item.planRow ? h(PlanRowActions, { sheet, row: item.planRow, buttonClassName: "button" }) : null))))),
  );
}

/* Caso real WifiConecta: os 4 candidatos do plano (9, 10, 11 e 15) estão na mesa; 12, 13 e 14 estão presos no artigo do laranja. */
const MESA_WIFI: ArtigoDaMesa[] = [
  { id: "cand-k9", keyword: "internet fibra óptica", subjectKeywordId: "k9" },
  { id: "cand-k10", keyword: "diferença entre internet e Wi-Fi", subjectKeywordId: "k10" },
  { id: "cand-k11", keyword: "Wi-Fi lento", subjectKeywordId: "k11" },
  { id: "cand-k15", keyword: "teste de velocidade da internet", subjectKeywordId: "k15" },
  { id: "comum-1", keyword: "internet residencial", subjectKeywordId: null },
];
const AZUL_FILTRO: EditorialGroupScreenFilter = { kind: "groups", color: "azul", groupIds: [AZUL] };
let registro: Registro;
const mesaWifi = () => comProductShell(h(MesaUmaTabela, { marca: MARCA_WIFI, keywords: mesaWifiReal(), articles: [ARTIGO_INTRUSO], mesa: MESA_WIFI, filtro: AZUL_FILTRO, registro }));
const linhaDoPlano = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-table-row"][data-keyword-id="${keywordId}"]`);
const linhaDaMesa = (id: string) => screen.container.querySelector<HTMLElement>(`[data-testid="mesa-article-row"][data-article-id="${id}"]`)!;
const marcar = async (alvo: HTMLElement) => screen.click(alvo.querySelector<HTMLInputElement>("input[type='checkbox']")!);
const semMinerador = () => assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "nenhum pedido ao Minerador");

test.beforeEach(async () => { chamadas = []; aplicados = 0; registro = { processar: [], concluir: [] }; resetEditorialGroupAreaStoreForTests(); screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("azul real · UMA tabela: os 7 do plano na ordem do plano (4 artigos da mesa com os selos + 3 linhas do plano presas), depois o comum; nada de planilha nem cartão", async () => {
  rede();
  await screen.render(mesaWifi()); await assentar();
  assert.equal(screen.container.querySelectorAll("table").length, 1, "uma tabela só");
  assert.equal(screen.query("architect-plan-sheet"), null, "a planilha separada não aparece");
  assert.equal(screen.query("architect-improvement-next-step"), null, "nenhum cartão 'Próximo passo'");
  assert.equal(screen.query("architect-plan-operations"), null, "a prévia só aparece quando há ação");
  const ordem = [...screen.container.querySelectorAll<HTMLElement>("tbody > tr")].map(tr => tr.dataset.keywordId ?? tr.dataset.articleId);
  assert.deepEqual(ordem, ["cand-k9", "cand-k10", "cand-k11", "k12", "k13", "k14", "cand-k15", "comum-1"], "a ordem do plano (9–15), e os demais depois");
  // A linha do artigo do plano ganha os selos curtos: trava, volume, SERP e formação.
  const selosK9 = [...linhaDaMesa("cand-k9").querySelectorAll<HTMLElement>("[data-plan-seal]")].map(selo => `${selo.dataset.planSeal}:${selo.textContent}`);
  assert.deepEqual(selosK9, ["lock:Travada", "volume:Vol. 5.400", "serp:SERP 4/4", "formation:Aguardando formação"]);
  const selosK10 = [...linhaDaMesa("cand-k10").querySelectorAll<HTMLElement>("[data-plan-seal]")].map(selo => selo.textContent);
  assert.deepEqual(selosK10, ["Livre", "Sem volume", "Sem SERP", "Aguardando formação"]);
  assert.ok(linhaDaMesa("cand-k10").querySelector("[data-plan-action='swapPrincipal']"), "trava Livre: Trocar principal na linha");
  assert.equal(linhaDaMesa("cand-k9").querySelector("[data-plan-action='swapPrincipal']"), null, "travada: sem Trocar principal");
  // A linha do plano presa no artigo do laranja: selo do conflito + a ação.
  const presa = linhaDoPlano("k13")!;
  assert.equal(presa.dataset.formation, "conflict");
  assert.match(presa.querySelector("[data-plan-seal='conflict']")!.textContent!, /Presa em outro artigo/);
  assert.match(presa.querySelector<HTMLElement>("[data-plan-seal='conflict']")!.title, /Presa no artigo “melhor-para-jogos-online” do Silo “planos de internet”/);
  assert.equal(presa.querySelector("[data-testid='architect-plan-row-withdraw']")?.textContent, "Retirar artigo do Silo");
  assert.equal(presa.querySelector("[data-testid='architect-plan-row-role']")?.textContent, "Suporte · 13º");
  assert.equal(presa.querySelectorAll("td").length, COLUNAS.length, "as colunas da tabela de sempre");
  // A linha comum não tem nada do plano.
  assert.equal(linhaDaMesa("comum-1").querySelector("[data-plan-seal]"), null);
  semMinerador();
});

test("Processar artigos (barra) com linhas do plano marcadas: o comum vai ao handler de sempre; as do plano, ao Validar SERP com custo antes", async () => {
  rede();
  await screen.render(mesaWifi()); await assentar();
  await marcar(linhaDaMesa("cand-k9"));
  await marcar(linhaDoPlano("k13")!);
  await marcar(linhaDaMesa("comum-1"));
  const barra = screen.get("architect-articles-formation-actions");
  assert.equal(barra.dataset.planSelected, "2");
  assert.match(screen.get("architect-articles-selection-count").textContent!, /3 artigo\(s\) selecionado\(s\) na mesa · 2 do plano/);
  await screen.click("architect-articles-top-process"); await assentar();
  assert.deepEqual(registro.processar, [["comum-1"]], "o artigo de sempre pelo handler de sempre");
  const planos = chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "plan");
  assert.deepEqual(planos.flatMap(chamada => chamada.body.keywords.map((item: any) => item.keywordId)), ["k13"], "k9 já tem as 4 lentes: nada a pagar; k13 entra no plano de custo");
  assert.equal(planos[0].body.onlyMeasuredVolume, true);
  assert.equal(chamadas.some(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "execute"), false, "nada é pago antes da confirmação");
  assert.equal(screen.get("architect-plan-sheet-preview").dataset.action, "validateSerp");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const pagos = chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp" && chamada.body.mode === "execute");
  assert.deepEqual(pagos.flatMap(chamada => chamada.body.keywords.map((item: any) => item.keywordId)), ["k13"]);
  assert.match(linhaDaMesa("cand-k9").querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /Já temos as 4 lentes/);
  assert.match(linhaDoPlano("k13")!.querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /SERP coletada nas 4 lentes/);
  assert.equal(screen.query("architect-plan-sheet-progress"), null, "nada fica girando");
  semMinerador();
});

test("Concluir formação (barra) com o plano inteiro marcado: as 3 presas recusadas antes do servidor; as 4 formam pela melhoria do plano; o handler de sempre não é chamado", async () => {
  rede();
  await screen.render(mesaWifi()); await assentar();
  for (const id of ["cand-k9", "cand-k10", "cand-k11", "cand-k15"]) await marcar(linhaDaMesa(id));
  for (const id of ["k12", "k13", "k14"]) await marcar(linhaDoPlano(id)!);
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, false, "o botão de sempre vale para as linhas do plano (sem processar antes)");
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.deepEqual(registro.concluir, [], "nenhum artigo de sempre selecionado");
  const preparos = chamadas.filter(chamada => chamada.body?.action === "prepare");
  assert.equal(preparos.length, 1);
  assert.deepEqual(preparos[0].body.targetIds, ["k9", "k10", "k11", "k15"], "a presa não vai ao servidor");
  assert.equal(preparos[0].body.origin, "plan_sheet");
  assert.equal(preparos[0].body.group, AZUL);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k9", "k10", "k11", "k15"]]);
  assert.match(linhaDaMesa("cand-k15").querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /ArticleDNA de k15 criado e relido/);
  assert.match(linhaDoPlano("k14")!.querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /^Não gravado: Presa no artigo/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /4 gravado\(s\) e relido\(s\); 3 fora desta confirmação/);
  assert.equal(aplicados, 1, "a mesa é relida");
  semMinerador();
});

test("ações por linha: 'Concluir formação' na linha do artigo do plano chama o núcleo do plano só para ela; 'Retirar artigo do Silo' abre a prévia", async () => {
  rede();
  await screen.render(mesaWifi()); await assentar();
  await screen.click(linhaDaMesa("cand-k15").querySelector<HTMLElement>("[data-plan-action='concludeFormation']")!); await assentar();
  const preparos = chamadas.filter(chamada => chamada.body?.action === "prepare");
  assert.deepEqual(preparos.map(chamada => chamada.body.targetIds), [["k15"]]);
  await screen.click([...screen.get("architect-plan-sheet-preview").querySelectorAll<HTMLButtonElement>("button")].find(botao => botao.textContent === "Cancelar")!);
  assert.equal(screen.query("architect-plan-sheet-preview"), null);
  assert.equal(chamadas.some(chamada => chamada.body?.action === "apply"), false, "cancelar não grava");
  // A ação da linha presa abre "Retirar artigo do Silo" (o núcleo de sempre), com prévia.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, method: init?.method ?? "GET", body });
    if (url === "/api/arquiteto/silo-article-withdrawal") return responder({ mode: "preview", state: "READY", siloId: body.siloId, siloName: "planos de internet", siloDnaVersionId: "silo-v1", article: { articleId: body.articleId, label: "melhor internet para jogos online", versionId: "art-v1" }, remainingArticleIds: [], changes: ["SiloDNA v1 e SiloPage v1 não mudam."], warnings: [] });
    return responder(null);
  }) as typeof fetch;
  await screen.click(linhaDoPlano("k13")!.querySelector<HTMLElement>("[data-testid='architect-plan-row-withdraw']")!); await assentar();
  assert.ok(screen.query("architect-plan-sheet-withdraw"));
  assert.deepEqual(chamadas.filter(chamada => chamada.url === "/api/arquiteto/silo-article-withdrawal").map(chamada => chamada.body.mode), ["preview"], "só a prévia; nada aplicado sem o dono");
});

test("marca grande (AdalbaPro) sem plano na cor: só a tabela de sempre; a barra chama o handler de sempre; nenhuma leitura do plano", async () => {
  rede();
  const keywords = Array.from({ length: 1200 }, (_, i) => ({ id: `ad-${i}`, keyword: `keyword adalba ${i}`, brand_id: ADALBAPRO, analise_semantica: {}, volume_search: 100 + i, volume_source: "google_ads" }));
  const mesa: ArtigoDaMesa[] = Array.from({ length: 300 }, (_, i) => ({ id: `art-${i}`, keyword: `artigo ${i}`, subjectKeywordId: null }));
  const inicio = Date.now();
  const linhas = buildPlanSheetRows({ brandId: ADALBAPRO, keywords, groupOf: () => null, keywordGroupOf: () => null, articles: [], radarArticleIds: VAZIO, serp: null, filter: { kind: "all" }, now: new Date("2026-10-14T12:00:00Z") });
  assert.equal(linhas.length, 0);
  assert.ok(Date.now() - inicio < 2000, "montar as linhas do plano de uma marca grande é barato");
  await screen.render(comProductShell(h(MesaUmaTabela, { marca: ADALBAPRO, keywords, articles: [], mesa, filtro: { kind: "all" }, registro }))); await assentar();
  assert.equal(screen.container.querySelectorAll("table").length, 1);
  assert.equal(screen.all("mesa-article-row").length, 300);
  assert.equal(screen.all("architect-plan-table-row").length, 0);
  assert.equal(screen.container.querySelector("[data-plan-seal]"), null);
  await marcar(linhaDaMesa("art-7"));
  await screen.click("architect-articles-top-process"); await assentar();
  assert.deepEqual(registro.processar, [["art-7"]]);
  assert.equal(chamadas.some(chamada => chamada.method === "POST"), false, "sem linha do plano, nada vai ao núcleo do plano");
});

/* ------------------------------------------- a cor que não existe na marca */

const BRAND_REF_ADALBA = `adalbapro--${ADALBAPRO}`;
function Sonda({ brandId }: { brandId: string }) {
  const recorte = useAreaGroupFilter(brandId, "arquiteto");
  return h("output", { "data-testid": "sonda", "data-choice": recorte.choice, "data-filter": recorte.filter.kind, "data-fallback": recorte.colorFallback ?? "" });
}
const urlAtual = () => new URL((globalThis as unknown as { window: Window }).window.location.href);
const irPara = (caminho: string) => (globalThis as unknown as { window: Window }).window.history.replaceState(null, "", caminho);

test("filtro de cor entre marcas: '?grupo=azul' na AdalbaPro (que não tem azul) volta para 'Todos os grupos', tira o ?grupo da URL e avisa em uma linha", async () => {
  rede();
  irPara(`/${BRAND_REF_ADALBA}/arquiteto?grupo=azul`);
  await screen.render(comProductShell(h(React.Fragment, null, h(TopbarGroupTag, { brandId: ADALBAPRO, area: "arquiteto" }), h(Sonda, { brandId: ADALBAPRO })))); await assentar();
  const sonda = screen.get("sonda");
  assert.equal(sonda.dataset.choice, "todos");
  assert.equal(sonda.dataset.filter, "all", "a lista mostra tudo, não '0 artigos'");
  assert.equal(sonda.dataset.fallback, "azul");
  assert.equal(urlAtual().searchParams.get("grupo"), null, "o ?grupo sai da URL");
  const aviso = screen.get("editorial-group-color-fallback");
  assert.match(aviso.textContent!, /Sem a cor Azul nesta marca · mostrando todos os grupos/);
  await screen.click(aviso.querySelector<HTMLElement>("button")!); await assentar(2);
  assert.equal(screen.query("editorial-group-color-fallback"), null, "o aviso fecha");
  assert.equal(screen.get("sonda").dataset.filter, "all");
});

test("filtro de cor que existe na marca (WifiConecta, azul): continua azul, sem aviso", async () => {
  rede();
  irPara(`/wificonecta--${MARCA_WIFI}/arquiteto?grupo=azul`);
  await screen.render(comProductShell(h(React.Fragment, null, h(TopbarGroupTag, { brandId: MARCA_WIFI, area: "arquiteto" }), h(Sonda, { brandId: MARCA_WIFI })))); await assentar();
  const sonda = screen.get("sonda");
  assert.equal(sonda.dataset.choice, "azul");
  assert.equal(sonda.dataset.filter, "groups");
  assert.equal(sonda.dataset.fallback, "");
  assert.equal(urlAtual().searchParams.get("grupo"), "azul");
  assert.equal(screen.query("editorial-group-color-fallback"), null);
});

test("escolha FEITA nesta sessão (clique na cor) não é derrubada: escolher uma cor ainda sem grupo continua valendo (mover para a cor cria o grupo)", async () => {
  rede();
  irPara(`/${BRAND_REF_ADALBA}/arquiteto`);
  await screen.render(comProductShell(h(Sonda, { brandId: ADALBAPRO }))); await assentar();
  assert.equal(screen.get("sonda").dataset.choice, "todos");
  await React.act(async () => { setEditorialGroupAreaChoice(ADALBAPRO, "arquiteto", "azul"); });
  await assentar();
  assert.equal(screen.get("sonda").dataset.choice, "azul");
  assert.equal(screen.get("sonda").dataset.fallback, "");
  assert.equal(urlAtual().searchParams.get("grupo"), "azul");
});

test("a regra da cor inexistente só vale com a lista do SERVIDOR (cache atrasado não derruba a escolha); 'todos' e 'sem-grupo' nunca caem", () => {
  const laranja = [{ id: "g1", marcaId: ADALBAPRO, name: "Planos", color: "laranja", origin: "manual", status: "active", siloId: null, planVersion: 0, lockVersion: 1, updatedAt: "", keywordCount: 0, articleCount: 0 }] as never[];
  assert.equal(editorialGroupChoiceMissingInBrand("azul", { status: "ready", source: "server", groups: laranja }), "azul");
  assert.equal(editorialGroupChoiceMissingInBrand("laranja", { status: "ready", source: "server", groups: laranja }), null);
  assert.equal(editorialGroupChoiceMissingInBrand("azul", { status: "loading", source: "cache", groups: laranja }), null, "cache: espera o servidor");
  assert.equal(editorialGroupChoiceMissingInBrand("todos", { status: "ready", source: "server", groups: [] }), null);
  assert.equal(editorialGroupChoiceMissingInBrand("sem-grupo", { status: "ready", source: "server", groups: [] }), null);
  const arquivado = [{ ...(laranja[0] as object), color: "azul", status: "archived" }] as never[];
  assert.equal(editorialGroupChoiceMissingInBrand("azul", { status: "ready", source: "server", groups: arquivado }), "azul", "grupo arquivado não conta");
});
