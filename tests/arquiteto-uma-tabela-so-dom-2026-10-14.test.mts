import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { TopbarGroupTag } from "../components/editorial/group-selector.tsx";
import { editorialGroupChoiceMissingInBrand, resetEditorialGroupAreaStoreForTests, setEditorialGroupAreaChoice, useAreaGroupFilter } from "../components/editorial/editorial-group-area-store.ts";
import { buildPlanSheetRows } from "../lib/arquiteto/plan-article-sheet.ts";
import type { EditorialGroupScreenFilter } from "../lib/editorial/editorial-groups.ts";
import { GRUPOS } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { ARTIGO_INTRUSO, AZUL, MARCA_WIFI, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";
import { COLUNAS, MesaDoPlano, ROTULOS_REMOVIDOS, novoRegistro, type ArtigoDaMesa, type Registro } from "./arquiteto-mesa-do-plano-harness.mts";

/*
 * 2026-10-14 (tarde) · PEDIDO DO DONO, na tela de verdade: "coloca só numa
 * lista, não cria várias listas, sem planilhas duplicadas, (…) os processos
 * ainda estão em paralelo, não está nos botões principais, sumiram os botões
 * de processo normal (…) é tudo por esse painel cheio de textos".
 *
 * 2026-10-14 (noite) · ajustado ao pedido seguinte: "tem 9 botões no painel do
 * topo, e em distintas posições, tudo confuso". Com UM plano no recorte (azul)
 * a barra tem só o botão da etapa atual (e "Melhorar publicados…" quando há
 * publicados); com mais de um plano ("Todos") ou sem plano, a barra de sempre.
 * Na linha ficam só "Procurar outra principal" (sem volume e Livre) e
 * "Retirar artigo do Silo". A mesa vem do harness comum (as MESMAS peças da aba).
 */

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[];
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

/* Caso real WifiConecta: os 4 candidatos do plano (9, 10, 11 e 15) estão na mesa; 12, 13 e 14 estão presos no artigo do laranja. */
const MESA_WIFI: ArtigoDaMesa[] = [
  { id: "cand-k9", keyword: "internet fibra óptica", subjectKeywordId: "k9" },
  { id: "cand-k10", keyword: "diferença entre internet e Wi-Fi", subjectKeywordId: "k10" },
  { id: "cand-k11", keyword: "Wi-Fi lento", subjectKeywordId: "k11" },
  { id: "cand-k15", keyword: "teste de velocidade da internet", subjectKeywordId: "k15" },
  { id: "comum-1", keyword: "internet residencial", subjectKeywordId: null },
];
const AZUL_FILTRO: EditorialGroupScreenFilter = { kind: "groups", color: "azul", groupIds: [AZUL] };
/** "Todos": o azul e o laranja têm plano — mais de um plano no recorte, a barra é a de sempre. */
const TODOS: EditorialGroupScreenFilter = { kind: "all" };
let registro: Registro;
const mesaWifi = (filtro: EditorialGroupScreenFilter = AZUL_FILTRO) => comProductShell(h(MesaDoPlano, { marca: MARCA_WIFI, keywords: mesaWifiReal(), articles: [ARTIGO_INTRUSO], mesa: MESA_WIFI, filtro, registro, groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal }));
const linhaDoPlano = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-table-row"][data-keyword-id="${keywordId}"]`);
const linhaDaMesa = (id: string) => screen.container.querySelector<HTMLElement>(`[data-testid="mesa-article-row"][data-article-id="${id}"]`)!;
const marcar = async (alvo: HTMLElement) => screen.click(alvo.querySelector<HTMLInputElement>("input[type='checkbox']")!);
const semMinerador = () => assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "nenhum pedido ao Minerador");

test.beforeEach(async () => { chamadas = []; registro = novoRegistro(); resetEditorialGroupAreaStoreForTests(); screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("azul real · UMA tabela: os 7 do plano na ordem do plano (4 artigos da mesa com os selos + 3 linhas do plano presas), depois o comum; uma barra com a etapa atual", async () => {
  rede();
  await screen.render(mesaWifi()); await assentar();
  assert.equal(screen.container.querySelectorAll("table").length, 1, "uma tabela só");
  assert.equal(screen.query("architect-plan-sheet"), null, "a planilha separada não existe");
  assert.equal(screen.query("architect-improvement-next-step"), null, "nenhum cartão 'Próximo passo'");
  assert.equal(screen.query("architect-plan-operations"), null, "a prévia só aparece quando há ação");
  const ordem = [...screen.container.querySelectorAll<HTMLElement>("tbody > tr")].map(tr => tr.dataset.keywordId ?? tr.dataset.articleId);
  assert.deepEqual(ordem, ["cand-k9", "cand-k10", "cand-k11", "k12", "k13", "k14", "cand-k15", "comum-1"], "a ordem do plano (9–15), e os demais depois");
  // 2026-10-16 · restauração do fluxo de sempre: com um plano no recorte, a barra é a de sempre (sem etapas do plano).
  const barra = screen.get("architect-articles-formation-actions");
  assert.equal(barra.dataset.planMode, undefined);
  assert.deepEqual([...barra.querySelectorAll("button")].map(botao => botao.textContent), ["Processar artigos", "Concluir formação", "Melhorar publicados…"]);
  assert.deepEqual([...barra.querySelectorAll<HTMLButtonElement>("button")].map(botao => botao.disabled), [true, true, false], "sem nada marcado, Processar e Concluir esperam a seleção");
  // A linha do artigo do plano ganha os selos curtos: trava, volume, SERP e formação.
  const selosK9 = [...linhaDaMesa("cand-k9").querySelectorAll<HTMLElement>("[data-plan-seal]")].map(selo => `${selo.dataset.planSeal}:${selo.textContent}`);
  assert.deepEqual(selosK9, ["lock:Travada", "volume:Vol. 5.400", "serp:SERP 4/4", "formation:Aguardando formação"]);
  assert.match(linhaDaMesa("cand-k9").querySelector<HTMLElement>("[data-plan-seal='lock']")!.title, /Volume definido não se troca/, "o porquê no title, não repetido na linha");
  const selosK10 = [...linhaDaMesa("cand-k10").querySelectorAll<HTMLElement>("[data-plan-seal]")].map(selo => selo.textContent);
  assert.deepEqual(selosK10, ["Livre", "Sem volume", "Sem SERP", "Aguardando formação"]);
  assert.match(linhaDaMesa("cand-k10").querySelector("[data-testid='architect-plan-row-alerts']")!.textContent!, /sem volume — livre, pode trocar/);
  assert.equal(linhaDaMesa("cand-k10").querySelector("[data-plan-action='swapPrincipal']")?.textContent, "Procurar outra principal", "sem volume e Livre: procurar outra na linha");
  assert.equal(linhaDaMesa("cand-k9").querySelector("[data-plan-action='swapPrincipal']"), null, "volume definido: nunca troca");
  assert.equal(linhaDaMesa("cand-k9").querySelector("[data-testid='architect-plan-row-actions']"), null, "linha travada sem nada a fazer: sem botões");
  // A linha do plano presa no artigo do laranja: selo do conflito + a ação.
  const presa = linhaDoPlano("k13")!;
  assert.equal(presa.dataset.formation, "conflict");
  assert.match(presa.querySelector("[data-plan-seal='conflict']")!.textContent!, /Presa em outro artigo/);
  assert.match(presa.querySelector<HTMLElement>("[data-plan-seal='conflict']")!.title, /Presa no artigo “melhor-para-jogos-online” do Silo “planos de internet”/);
  assert.equal(presa.querySelector("[data-testid='architect-plan-row-withdraw']")?.textContent, "Retirar artigo do Silo");
  assert.equal(presa.querySelector("[data-testid='architect-plan-row-role']")?.textContent, "Suporte · 13º");
  // 2026-10-16 (noite) · pedido do dono ("Pendente" sem explicação): a Definição da linha do plano diz o estado e o porquê curto; o inteiro no title.
  const definicao = presa.querySelector<HTMLElement>("[data-testid='architect-plan-row-definition']")!;
  assert.equal(definicao.firstElementChild!.textContent, "Pendente");
  assert.equal(definicao.querySelector("[data-testid='architect-plan-row-definition-reason']")!.textContent, "presa em outro artigo");
  assert.match(definicao.title, /Presa no artigo “melhor-para-jogos-online”/);
  assert.equal(presa.querySelectorAll("td").length, COLUNAS.length, "as colunas da tabela de sempre");
  assert.equal([...presa.querySelectorAll("td")].at(-1)!.textContent, "Do plano", "uma versão do plano só: a do grupo, sem 'v1/v2/v3' por linha");
  // A linha comum não tem nada do plano.
  assert.equal(linhaDaMesa("comum-1").querySelector("[data-plan-seal]"), null);
  // Nenhum dos botões/textos que o dono mandou tirar.
  for (const rotulo of ROTULOS_REMOVIDOS) assert.doesNotMatch(screen.text(), rotulo, String(rotulo));
  semMinerador();
});

test("'Todos' (azul e laranja com plano): a barra de sempre — Processar artigos com linhas do plano marcadas: o comum vai ao handler de sempre; as do plano, ao Validar SERP com custo antes", async () => {
  rede();
  await screen.render(mesaWifi(TODOS)); await assentar();
  await marcar(linhaDaMesa("cand-k9"));
  await marcar(linhaDoPlano("k13")!);
  await marcar(linhaDaMesa("comum-1"));
  const barra = screen.get("architect-articles-formation-actions");
  assert.equal(barra.dataset.planSelected, "2");
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

test("'Todos' · Concluir formação (barra) com o plano azul marcado: as 3 presas recusadas antes do servidor; as 4 formam pela melhoria do plano; o handler de sempre não é chamado", async () => {
  rede();
  await screen.render(mesaWifi(TODOS)); await assentar();
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
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar e gravar", "sem contador no botão");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k9", "k10", "k11", "k15"]]);
  assert.match(linhaDaMesa("cand-k15").querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /ArticleDNA de k15 criado e relido/);
  assert.match(linhaDoPlano("k14")!.querySelector("[data-testid='architect-plan-row-result']")!.textContent!, /^Não gravado: Presa no artigo/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /4 gravado\(s\) e relido\(s\); 3 fora desta confirmação/);
  assert.equal(registro.aplicados, 1, "a mesa é relida");
  semMinerador();
});

test("2026-10-16 · Concluir formação FORMA: a linha do plano já formada fica fora com o caminho do reforço ('Melhorar publicados…'); só a sem ArticleDNA vai ao servidor", async () => {
  rede();
  const formadoK9 = { articleId: "art-k9", versionNumber: 2, subjectKeywordId: "k9", principalKeywordId: "k9", keywordIds: ["k9"] };
  await screen.render(comProductShell(h(MesaDoPlano, { marca: MARCA_WIFI, keywords: mesaWifiReal(), articles: [ARTIGO_INTRUSO, formadoK9], mesa: MESA_WIFI, filtro: AZUL_FILTRO, registro, groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal }))); await assentar();
  await marcar(linhaDaMesa("cand-k9"));
  await marcar(linhaDaMesa("cand-k10"));
  await screen.click("architect-articles-top-confirm"); await assentar();
  const preparos = chamadas.filter(chamada => chamada.body?.action === "prepare");
  assert.deepEqual(preparos.map(chamada => chamada.body.targetIds), [["k10"]], "o formado não vai de novo à formação");
  const linhaK9 = [...screen.all("architect-plan-sheet-preview-line")].find(item => item.textContent!.startsWith("internet fibra óptica"))!;
  assert.match(linhaK9.textContent!, /Formado · v2: já formado — para reforçar com keywords de respaldo, use “Melhorar publicados…”/);
  semMinerador();
});

test("na linha: nada de 'Validar SERP' nem 'Concluir formação'; 'Retirar artigo do Silo' abre a prévia (só o dono confirma)", async () => {
  rede();
  await screen.render(mesaWifi()); await assentar();
  assert.equal(screen.container.querySelector("[data-plan-action='validateSerp'], [data-plan-action='concludeFormation']"), null, "os processos são da barra, um por vez");
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

test("marca grande (AdalbaPro) sem plano na cor: só a tabela de sempre; a barra de sempre chama o handler de sempre; nenhuma leitura do plano", async () => {
  rede();
  const keywords = Array.from({ length: 1200 }, (_, i) => ({ id: `ad-${i}`, keyword: `keyword adalba ${i}`, brand_id: ADALBAPRO, analise_semantica: {}, volume_search: 100 + i, volume_source: "google_ads" }));
  const mesa: ArtigoDaMesa[] = Array.from({ length: 300 }, (_, i) => ({ id: `art-${i}`, keyword: `artigo ${i}`, subjectKeywordId: null }));
  const inicio = Date.now();
  const linhas = buildPlanSheetRows({ brandId: ADALBAPRO, keywords, groupOf: () => null, keywordGroupOf: () => null, articles: [], radarArticleIds: new Set<string>(), serp: null, filter: { kind: "all" }, now: new Date("2026-10-14T12:00:00Z") });
  assert.equal(linhas.length, 0);
  assert.ok(Date.now() - inicio < 2000, "montar as linhas do plano de uma marca grande é barato");
  await screen.render(comProductShell(h(MesaDoPlano, { marca: ADALBAPRO, keywords, articles: [], mesa, filtro: { kind: "all" }, registro, groupOf: () => null, keywordGroupOf: () => null }))); await assentar();
  assert.equal(screen.container.querySelectorAll("table").length, 1);
  assert.equal(screen.all("mesa-article-row").length, 300);
  assert.equal(screen.all("architect-plan-table-row").length, 0);
  assert.equal(screen.container.querySelector("[data-plan-seal]"), null);
  // A barra de sempre (a de 4d546ce): Processar artigos · Concluir formação · Melhorar publicados…, no mesmo lugar.
  const barra = screen.get("architect-articles-formation-actions");
  assert.equal(barra.dataset.planMode, undefined);
  assert.deepEqual([...barra.querySelectorAll("button")].map(botao => botao.textContent), ["Processar artigos", "Concluir formação", "Melhorar publicados…"]);
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
