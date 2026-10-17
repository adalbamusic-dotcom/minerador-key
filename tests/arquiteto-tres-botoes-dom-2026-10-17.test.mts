import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { VOLUME_VALIDADO } from "./arquiteto-assunto-fixtures.mts";
import { cadastro, linha, MARCA_WIFI } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { MesaDoPlano, ROTULOS_REMOVIDOS, botoesDaArea, novoRegistro, type Registro } from "./arquiteto-mesa-do-plano-harness.mts";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";
import type { PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";

/*
 * 2026-10-17 (noite) · OS 3 BOTÕES EM SEQUÊNCIA, NA TELA DE VERDADE (DOM), com o amarelo da WifiConecta.
 *
 * O dono, literal: "o arquiteto ainda não está cumprindo o papel dele… ficou travado nessa janela sem poder
 * avançar… Estes dois botões ficam sem estar habilitados: Reprocessar artigos, Concluir formação… 3 botões já é
 * suficiente… na mesma linha de processo"; "tem 7 botões totalmente inúteis"; "tem que ser sequencial e na mesma
 * linha de trabalho"; o último botão é "o refazedor". AGENTS.md §0.3: a guarda da forma conta os botões.
 *
 *  (a) no começo do amarelo (4 Travados com v1, 4 Livres sem DNA), com as 8 linhas marcadas, só "Processar artigos"
 *      está ativo; a área tem 3 botões;
 *  (b) Processar = UMA prévia de custo (a SERP das 4 principais de identidade) → coleta → a cópia de trabalho em
 *      cada linha → "Concluir formação" ativo e destacado; a área volta a 3 botões;
 *  (c) Concluir = o checklist e UMA confirmação (com as keywords novas) → o Silo do plano fecha no mesmo ato →
 *      com os 8 formados, "Melhorar publicados…" (o refazedor) é o passo; a área tem 3 botões;
 *  e o refazedor: abrir lê sozinho (busca nova incluída); a prévia tem só "Cancelar" e "Confirmar"; o refazer pede o
 *  motivo dentro da prévia.
 *
 * Nenhuma rede real, nenhum provider, nenhum custo: a rede é simulada e contada.
 */

const AMARELO = "aaaa0000-0000-4000-8000-00000000a203";
const TERRITORIO_AMARELO = "territory:2318febb-f4c7-4036-ac8c-b7416be0de3c";
const GRUPOS: Record<string, { color: string; name: string }> = { [AMARELO]: { color: "amarelo", name: "Planos e contratação" } };
const FILTRO = { kind: "groups" as const, color: "amarelo" as const, groupIds: [AMARELO] };
/** [id, keyword, título do Assunto, ordem, papel, slug do plano, volume | null (medida sem número de buscas, Livre)] — os dados reais do amarelo. */
const AMARELO_REAL: Array<[string, string, string, number, "Pilar" | "Suporte", string, number | null]> = [
  ["a1", "como escolher plano de internet residencial", "Como escolher um plano de internet residencial sem cair em uma oferta ruim", 1, "Pilar", "como-escolher-plano-internet-residencial", null],
  ["a2", "internet residencial barata", "Internet residencial barata: o que comparar além da mensalidade", 2, "Suporte", "internet-residencial-barata", 1600],
  ["a3", "claro vivo ou tim internet residencial", "Claro, Vivo ou TIM para casa: como comparar onde você mora", 3, "Suporte", "claro-vivo-tim-internet-residencial", null],
  ["a4", "internet no meu cep", "Como saber quais operadoras de internet atendem minha rua e meu CEP", 4, "Suporte", "operadoras-internet-no-meu-cep", 720],
  ["a5", "quantos mega de internet preciso", "300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", 5, "Suporte", "quantos-mega-de-internet-preciso", null],
  ["a6", "combo internet e celular", "Combo de internet e celular vale a pena? Veja o que entra na conta", 6, "Suporte", "combo-internet-e-celular-vale-a-pena", 720],
  ["a7", "combo internet tv streaming", "Internet, TV Box e streaming: quando compensa contratar tudo junto?", 7, "Suporte", "combo-internet-tv-streaming-vale-a-pena", null],
  ["a8", "instalação de internet residencial", "Instalação de internet: taxas, prazo e quando chega a primeira fatura", 8, "Suporte", "instalacao-internet-primeira-fatura", 170],
];
const IDS = AMARELO_REAL.map(([id]) => id);
const TRAVADOS = AMARELO_REAL.filter(item => item[6] !== null).map(([id]) => id);
const LIVRES = AMARELO_REAL.filter(item => item[6] === null).map(([id]) => id);
const semBuscas = () => ({ volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), averageMonthlySearches: null } });
function mesaAmarela() {
  return AMARELO_REAL.map(([id, keyword, titulo, ordem, papel, slug, volume]) => {
    const base = cadastro(id, keyword, titulo, ordem, papel, AMARELO, volume !== null ? VOLUME_VALIDADO : semBuscas()) as Record<string, any>;
    base.keyword_subject = { ...base.keyword_subject, plan: { ...base.keyword_subject.plan, slug, planVersion: 3, lock: volume !== null ? "locked" : "free" } };
    return { ...linha(id, keyword, base, volume !== null ? { volume_search: volume, volume_source: "google_ads" } : {}), territoryRef: TERRITORIO_AMARELO };
  });
}
const formado = (id: string, versionNumber = 1): PlanSheetArticle => ({ articleId: `art-${id}`, versionNumber, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id] });
const NOVAS: Record<string, Array<[string, string, number]>> = {
  a1: [["n1", "planos de internet residencial", 6600], ["n2", "plano de internet residencial", 2900]],
  a2: [["n3", "preço internet residencial", 170]], a3: [["n4", "internet residencial claro ou vivo", 110]], a4: [["n5", "melhor internet no meu cep", 260]],
  a5: [["n6", "quantos mega preciso", 50]], a6: [["n7", "melhor combo internet e celular", 210]], a7: [["n8", "combo internet e streaming", 210]], a8: [["n9", "taxa de instalação de internet", 260]],
};

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[], registro: Registro;
const nome = (id: string) => AMARELO_REAL.find(item => item[0] === id)?.[1] ?? id;
const keywordsDaRun = () => [
  ...AMARELO_REAL.map(([id, keyword, , , , , volume]) => ({ id, keyword, volume, volumeValidated: volume !== null, external: false })),
  ...Object.values(NOVAS).flat().map(([id, keyword, volume]) => ({ id, keyword, volume, volumeValidated: true, external: true })),
];
/** A execução da melhoria que o servidor devolve; `coletada` = depois da SERP das principais de identidade. */
function execucao(coletada: boolean, extra: Record<string, unknown> = {}) {
  return {
    version: 1, runId: "33333333-3333-4333-8333-333333333333", brandId: MARCA_WIFI, actorId: "ator", createdAt: "2026-10-17T20:00:00Z", state: "prepared", decisionHash: (coletada ? "d" : "c").repeat(64), leaseUntil: null, sourceHashes: {},
    targets: IDS.map(id => ({ id, kind: "subject", theme: nome(id), memberIds: TRAVADOS.includes(id) ? [id] : [] })),
    keywords: keywordsDaRun(), beforeAssignments: {},
    proposals: IDS.map(id => {
      const novas = NOVAS[id].map(([kid]) => kid);
      const livre = LIVRES.includes(id);
      return { targetId: id, kind: "subject", theme: nome(id), currentPrimaryId: id, principalId: id, memberIds: [id, ...novas], addIds: novas, removeIds: [], transfers: [], angle: "", exclusions: [], reasons: ["Motivo do núcleo."], status: livre && !coletada ? "insufficient_evidence" : "ready", evidenceBasis: "copy_line", ...(livre && !coletada ? { needsValidation: true } : {}) };
    }),
    costs: coletada ? { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] } : { paidQueries: 16, estimatedCostUsd: { min: 0.038, max: 0.056 }, missingDetails: [] },
    reservedCostUsd: 0, notices: [], outcomes: [], acceptedIds: null, origin: "plan_sheet", discovery: { requested: true, gapTargetIds: [], requests: 8 }, groupScope: { requested: AMARELO, filter: "group", groupId: AMARELO },
    ...extra,
  };
}
const responder = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
function rede() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ url, method: init?.method ?? "GET", body });
    if (url.startsWith("/api/arquiteto/article-improvement") && !init?.method) return responder(null);
    if (url === "/api/arquiteto/serp-subject") return responder({ footprints: body.keywords.filter((item: any) => TRAVADOS.includes(item.keywordId)).map((item: any) => ({ keywordId: item.keywordId, keyword: item.keyword, lenses: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ lens, urls: [], domains: [], collectedAt: "2026-10-16T00:00:00Z" })) })), withoutSerp: [], missingLenses: [] });
    if (url === "/api/arquiteto/article-improvement") {
      if (body.action === "prepare") return responder(execucao(false));
      if (body.action === "collect") return responder(execucao(true));
      if (body.action === "apply") {
        const ids: string[] = body.targetIds ?? IDS;
        return responder(execucao(true, { state: "complete", acceptedIds: ids, outcomes: ids.map(id => ({ targetId: id, status: TRAVADOS.includes(id) ? "improved" : "dna_created", message: `ArticleDNA de ${nome(id)} gravado (${TRAVADOS.includes(id) ? "v2" : "v1"}) e relido.` })) }));
      }
    }
    throw new Error(`Rede inesperada: ${url}`);
  };
}
const assentar = async (vezes = 25) => { for (let i = 0; i < vezes; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const mesa = (articles: PlanSheetArticle[]) => comProductShell(React.createElement(MesaDoPlano, {
  marca: MARCA_WIFI, keywords: mesaAmarela(), articles, mesa: [], filtro: FILTRO, registro,
  groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: (id: string) => id.startsWith("a") ? AMARELO : null,
}));
const linhaDa = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-table-row"][data-keyword-id="${keywordId}"]`)!;
const marcarTodas = async () => { for (const id of IDS) await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); };
const barraBotao = (testId: string) => screen.get(testId) as HTMLButtonElement;
const passoAtual = () => screen.get("architect-articles-formation-actions").dataset.currentStep;
const resultado = (keywordId: string) => linhaDa(keywordId).querySelector("[data-testid='architect-plan-row-result']")?.textContent ?? "";

test.beforeEach(async () => { chamadas = []; registro = novoRegistro(); screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("amarelo · os 3 botões em sequência: (a) só Processar ativo · (b) depois do Processar, Concluir · (c) depois do Concluir, o refazedor — e a área de ações tem exatamente 3 botões fora das prévias", async () => {
  rede();
  await screen.render(mesa(TRAVADOS.map(id => formado(id)))); await assentar();
  assert.equal(screen.all("architect-plan-table-row").length, 8);
  await marcarTodas();
  // (a) O começo: 3 botões, só o Processar ativo e destacado.
  assert.deepEqual(botoesDaArea(screen.container).map(botao => botao.textContent), ["Processar artigos", "Concluir formação", "Melhorar publicados…"], "a área de ações tem exatamente 3 botões");
  assert.equal(barraBotao("architect-articles-top-process").disabled, false);
  assert.equal(barraBotao("architect-articles-top-confirm").disabled, true);
  assert.match(barraBotao("architect-articles-top-confirm").title, /^Passo 1 primeiro: “Processar artigos” busca o reforço e a SERP que falta \(custo antes\)\.$/);
  assert.equal(barraBotao("architect-articles-improve-published").disabled, true);
  assert.match(barraBotao("architect-articles-improve-published").title, /^Passo 2 primeiro: conclua a formação\./);
  assert.equal(passoAtual(), "process");
  assert.equal(barraBotao("architect-articles-top-process").className, "primary", "o passo atual é o destacado");
  for (const rotulo of ROTULOS_REMOVIDOS) assert.doesNotMatch(screen.text(), rotulo, String(rotulo));
  // A linha Livre de identidade diz que fica (nunca "livre, pode trocar").
  assert.match(linhaDa("a1").querySelector("[data-testid='architect-plan-row-alerts']")!.textContent!, /sem número de buscas — identidade, fica/);

  // (b) PROCESSAR ARTIGOS: a leitura com a busca do reforço (grátis) e UMA prévia de custo da SERP das principais de identidade.
  await screen.click("architect-articles-top-process"); await assentar();
  const preparo = chamadas.filter(chamada => chamada.body?.action === "prepare");
  assert.equal(preparo.length, 1);
  assert.deepEqual([preparo[0].body.group, preparo[0].body.origin, preparo[0].body.discover, preparo[0].body.targetIds], [AMARELO, "plan_sheet", true, IDS], "as 8 linhas, com a busca do reforço");
  const previa = screen.get("architect-plan-sheet-preview");
  assert.equal(previa.dataset.action, "processArticles");
  assert.match(screen.get("architect-plan-sheet-serp-cost").textContent!, /^SERP no DataForSEO: 16 consulta\(s\), até US\$ 0,056 — a primeira coleta da principal que falta \(inclusive a principal de identidade/);
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Autorizar 16 consulta(s) e coletar (até US$ 0,056)");
  assert.equal(barraBotao("architect-articles-top-confirm").disabled, true, "com a prévia aberta, a barra espera");
  assert.match(barraBotao("architect-articles-top-confirm").title, /Há uma prévia aberta logo abaixo: confirme ou cancele\./, "o porquê no title (não 'travado' sem explicação)");
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "collect").length, 0, "nada pago antes da confirmação");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const coletas = chamadas.filter(chamada => chamada.body?.action === "collect");
  assert.equal(coletas.length, 1);
  assert.equal(coletas[0].body.authorizedCostUsd, 0.056, "a coleta paga só o custo autorizado na prévia");
  for (const id of IDS) assert.match(resultado(id), /^Cópia de trabalho \(nada gravado\): principal “.+” \((Travada|identidade), fica\) · secundárias: .+, nova\)\. Pronto para “Concluir formação”\.$/, id);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /^Processar artigos: 8 artigo\(s\) lido\(s\), reforço proposto para 8; SERP paga agora: 16 consulta\(s\)\. Nada foi gravado/);
  assert.equal(barraBotao("architect-articles-top-confirm").disabled, false);
  assert.equal(passoAtual(), "conclude", "depois do Processar, o Concluir é o passo");
  assert.equal(barraBotao("architect-articles-top-confirm").className, "primary");
  assert.equal(barraBotao("architect-articles-improve-published").disabled, true, "o refazedor ainda espera o Concluir");
  assert.equal(botoesDaArea(screen.container).length, 3, "sem prévia aberta, só os 3 botões");

  // (c) CONCLUIR FORMAÇÃO: a cópia de trabalho do Processar (sem preparar de novo), o checklist e UMA confirmação.
  await screen.click("architect-articles-top-confirm"); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "prepare").length, 1, "o Concluir grava a cópia de trabalho do Processar");
  assert.equal(screen.get("architect-plan-sheet-preview").dataset.action, "concludeFormation");
  const checklist = screen.get("architect-plan-sheet-checklist");
  assert.deepEqual([...checklist.querySelectorAll<HTMLElement>("li")].map(item => [item.dataset.check, item.dataset.ok]), [["principal", "true"], ["reforco", "true"], ["serp", "true"], ["plano", "true"], ["silo", "true"]]);
  assert.match(checklist.textContent!, /✓ Silo — fecha neste ato: SiloDNA e SiloPage com o Pilar e a ordem do plano; o grupo é ligado ao Silo/);
  assert.match(screen.get("architect-plan-sheet-new-keywords").textContent!, /9 keyword\(s\) NOVA\(S\) na marca/);
  for (const id of TRAVADOS) assert.match(screen.all("architect-plan-sheet-preview-line").find(item => item.textContent!.startsWith(nome(id)))!.textContent!, /Vai gravar: nova versão \(v2\)/, id);
  for (const id of LIVRES) assert.match(screen.all("architect-plan-sheet-preview-line").find(item => item.textContent!.startsWith(nome(id)))!.textContent!, /Vai gravar: primeiro ArticleDNA \(v1\) · principal “.+” \(identidade, fica\)/, id);
  assert.equal(screen.get("architect-plan-sheet-confirm").textContent, "Confirmar e gravar (com 9 keyword(s) nova(s))");
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  const gravacoes = chamadas.filter(chamada => chamada.body?.action === "apply");
  assert.equal(gravacoes.length, 1);
  assert.deepEqual(gravacoes[0].body.targetIds, IDS);
  assert.equal(gravacoes[0].body.approveNewKeywords, true, "o aceite das novas só porque a prévia as listou");
  assert.deepEqual(registro.silos, [[AMARELO]], "o Silo do plano fecha no MESMO ato do Concluir");
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /^Concluir formação: 8 gravado\(s\) e relido\(s\); 0 fora desta confirmação\..*Silo do plano fechado/);
  assert.equal(registro.aplicados, 1, "a mesa é relida");
  // Com os 8 formados (a releitura da mesa), o refazedor é o passo.
  await screen.render(mesa([...TRAVADOS.map(id => formado(id, 2)), ...LIVRES.map(id => formado(id))])); await assentar();
  assert.equal(passoAtual(), "improve");
  assert.equal(barraBotao("architect-articles-improve-published").disabled, false);
  assert.equal(barraBotao("architect-articles-improve-published").className, "primary");
  assert.equal(botoesDaArea(screen.container).length, 3);
  assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "a tela não fala com o Minerador");
});

test("amarelo · cancelar a coleta paga do Processar não paga nada, deixa o reforço na linha e o Concluir espera (o porquê no title)", async () => {
  rede();
  await screen.render(mesa(TRAVADOS.map(id => formado(id)))); await assentar();
  await marcarTodas();
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click([...screen.get("architect-plan-sheet-preview").querySelectorAll<HTMLButtonElement>("button")].find(botao => botao.textContent === "Cancelar")!); await assentar();
  assert.equal(chamadas.filter(chamada => chamada.body?.action === "collect").length, 0);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /a coleta paga foi cancelada — nada foi pago nem gravado/);
  for (const id of LIVRES) assert.match(resultado(id), /Falta a SERP da principal: “Processar artigos” coleta, com o custo antes\./, id);
  assert.equal(barraBotao("architect-articles-top-confirm").disabled, true);
  assert.equal(passoAtual(), "process");
});

/* ------------------------------------------------------------- o refazedor */

let restaurada: any = null;
const execucaoPublicado = (extra: Record<string, unknown> = {}) => ({ version: 1, brandId: "brand-a", runId: "run", decisionHash: "a".repeat(64), state: "prepared", acceptedIds: null, leaseUntil: null, costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] }, keywords: [{ id: "old", keyword: "tema antigo", volumeValidated: false }, { id: "new", keyword: "demanda nova", volume: 50, volumeValidated: true }], targets: [], proposals: ["a", "b"].map(id => ({ targetId: id, kind: "published", theme: `Publicado ${id}`, currentPrimaryId: "old", principalId: "old", memberIds: ["old", "new"], addIds: ["new"], removeIds: [], transfers: [], angle: "", exclusions: [], reasons: ["Cache completo"], status: "ready" })), notices: [], outcomes: [], ...extra });
function redeDoRefazedor(resposta: (body: any) => any) {
  globalThis.fetch = async (_url: RequestInfo | URL, options?: RequestInit) => {
    if (!options?.method) return new Response(JSON.stringify({ success: true, data: restaurada }));
    const body = JSON.parse(String(options.body));
    chamadas.push({ url: "/api/arquiteto/article-improvement", method: "POST", body });
    return new Response(JSON.stringify({ success: true, data: resposta(body) }));
  };
}
let fechou = 0;
const refazedor = () => comProductShell(React.createElement(ArticleImprovementPanel, { brandId: "brand-a", onApplied: () => undefined, onClose: () => { fechou += 1; }, buttonClassName: "button", primaryButtonClassName: "primary" }));

test("refazedor · abrir LÊ sozinho (busca nova incluída, sem autorização paga); a prévia tem só Cancelar e Confirmar; Confirmar grava; Cancelar fecha", async () => {
  restaurada = null; fechou = 0;
  redeDoRefazedor(body => body.action === "apply" ? execucaoPublicado({ state: "complete", acceptedIds: ["a", "b"], outcomes: [{ targetId: "a", status: "improved", message: "Relido" }, { targetId: "b", status: "improved", message: "Relido" }] }) : execucaoPublicado());
  await screen.render(refazedor()); await assentar();
  assert.deepEqual(chamadas.map(chamada => [chamada.body.action, chamada.body.discover, "authorizeReading" in chamada.body]), [["prepare", true, false]], "abrir = uma leitura grátis, com a busca nova");
  const painel = screen.get("architect-article-improvement");
  assert.deepEqual([...painel.querySelectorAll("button")].map(botao => botao.textContent), ["Cancelar", "Confirmar e gravar (2)"]);
  for (const fora of [/Próximo passo/, /Buscar keywords/, /Gravar sem validar/, /Buscar de novo/, /Retomar esta análise/, /Refazer mesmo assim/, /URL, slug e canonical nunca mudam/, /analisado\(s\)/, /Já temos/]) assert.doesNotMatch(screen.text(), fora, String(fora));
  await screen.click(screen.get("architect-improvement-confirm")); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body.action === "apply").map(chamada => chamada.body.targetIds), [["a", "b"]]);
  assert.match(screen.text(), /Melhoria gravada/);
  assert.equal(screen.container.querySelectorAll("button").length, 0, "com tudo gravado, nenhum botão a mais (o da barra fecha)");
  // Uma leitura nova com SERP por pagar: o Confirmar autoriza a coleta (custo antes); Cancelar fecha o refazedor.
  screen.destroy(); screen = await montarRadar(); chamadas = [];
  redeDoRefazedor(body => body.action === "collect" ? execucaoPublicado() : execucaoPublicado({ costs: { paidQueries: 2, estimatedCostUsd: { min: 0.004, max: 0.006 }, missingDetails: [] } }));
  await screen.render(refazedor()); await assentar();
  assert.match(screen.get("architect-improvement-cost").textContent!, /^SERP no DataForSEO: 2 consulta\(s\), até US\$ 0,006/);
  assert.equal(screen.get("architect-improvement-confirm").textContent, "Autorizar 2 consulta(s) e coletar a SERP (até US$ 0,006)");
  await screen.click(screen.get("architect-improvement-confirm")); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body.action === "collect").map(chamada => chamada.body.authorizedCostUsd), [0.006]);
  assert.equal(screen.get("architect-improvement-confirm").textContent, "Confirmar e gravar (2)", "depois da coleta, o mesmo Confirmar grava");
  await screen.click([...screen.container.querySelectorAll<HTMLButtonElement>("button")].find(botao => botao.textContent === "Cancelar")!);
  assert.equal(fechou, 1);
});

test("refazedor · o refazer (mesmos insumos) pede o motivo DENTRO da prévia; sem motivo, não refaz; com motivo, o Confirmar refaz pelo servidor (reworkOverride)", async () => {
  restaurada = null; fechou = 0;
  const reuso = { verdict: "same_inputs_reuse", previous: null, reasons: [], blocks: false, canOverride: true, message: "Já feito com os mesmos insumos em 17/10 às 20:00 — o resultado foi reaproveitado." };
  redeDoRefazedor(body => execucaoPublicado({ rework: reuso, proposals: [], ...(body.reworkOverride ? { rework: undefined } : {}) }));
  await screen.render(refazedor()); await assentar();
  assert.match(screen.get("architect-improvement-rework").textContent!, /Já feito com os mesmos insumos em 17\/10/);
  const confirmar = () => screen.get("architect-improvement-confirm") as HTMLButtonElement;
  assert.equal(confirmar().disabled, true);
  assert.equal(confirmar().textContent, "Diga o motivo para refazer");
  await screen.type(screen.get("architect-improvement-rework-reason") as HTMLInputElement, "o artigo ficou fraco: refazer o reforço");
  assert.equal(confirmar().textContent, "Refazer com o motivo dito");
  await screen.click(confirmar()); await assentar();
  const refeitas = chamadas.filter(chamada => chamada.body.reworkOverride);
  assert.deepEqual(refeitas.map(chamada => [chamada.body.action, chamada.body.reworkOverride.reason, chamada.body.discover]), [["prepare", "o artigo ficou fraco: refazer o reforço", true]]);
  assert.equal([...screen.container.querySelectorAll("button")].filter(botao => /Refazer mesmo assim/.test(botao.textContent ?? "")).length, 0);
});
