import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";
import { GRUPOS } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { ARTIGO_INTRUSO, AZUL, INTRUSO_ID, MARCA_WIFI, SILO_PLANOS, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";
import { MesaDoPlano, novoRegistro, type Registro } from "./arquiteto-mesa-do-plano-harness.mts";
import type { EditorialGroupScreenFilter } from "../lib/editorial/editorial-groups.ts";

/*
 * 2026-10-14 · O CAMINHO DO DONO (WifiConecta, cor azul), na tela de verdade:
 * linhas do plano marcadas (7) → os botões de sempre — cada linha termina com
 * um resultado claro (forma, recusa com motivo e caminho, ou falta SERP com
 * custo), nada fica girando; erro do servidor vira frase humana; a linha presa
 * abre "Retirar artigo do Silo" com prévia e só o dono confirma.
 *
 * 2026-10-14 (noite) · sem planilha separada (pedido do dono: "por que no
 * arquiteto tem duas planilhas?"). A mesa é a da aba (harness comum).
 *
 * 2026-10-16 · restauração do fluxo de sempre: em todo recorte (uma cor ou
 * "Todos") a barra é a de sempre — "Processar artigos"/"Concluir formação".
 */

type Chamada = { url: string; method: string; body: any };
let screen: RadarDomScreen, chamadas: Chamada[], registro: Registro;
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
const AZUL_FILTRO: EditorialGroupScreenFilter = { kind: "groups", color: "azul", groupIds: [AZUL] };
const TODOS: EditorialGroupScreenFilter = { kind: "all" };
const mesa = (filtro: EditorialGroupScreenFilter = AZUL_FILTRO) => comProductShell(React.createElement(MesaDoPlano, {
  marca: MARCA_WIFI, keywords: mesaWifiReal(), articles: [ARTIGO_INTRUSO], mesa: [], filtro, registro,
  groupOf: (id: string) => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal,
}));
const AZUIS = ["k9", "k10", "k11", "k12", "k13", "k14", "k15"];
const linhaDa = (keywordId: string) => screen.container.querySelector<HTMLElement>(`[data-testid="architect-plan-table-row"][data-keyword-id="${keywordId}"]`)!;
const marcarAzuis = async () => { for (const id of AZUIS) await screen.click(linhaDa(id).querySelector<HTMLInputElement>("input[type='checkbox']")!); };
const resultado = (keywordId: string) => linhaDa(keywordId).querySelector("[data-testid='architect-plan-row-result']")?.textContent ?? "";
const botao = (texto: string, dentro?: HTMLElement) => [...(dentro ?? screen.container).querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === texto);
const semGirar = () => assert.equal(screen.query("architect-plan-sheet-progress"), null, "nada fica girando");
const semMinerador = () => assert.equal(chamadas.some(chamada => chamada.url.includes("/api/minerador")), false, "nenhum pedido ao Minerador");

test.beforeEach(async () => { chamadas = []; registro = novoRegistro(); screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("azul real: 7 linhas; 12, 13 e 14 presas no artigo do laranja com o caminho; no topo, a barra de sempre (sem cartão 'Próximo passo' nem etapas)", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  assert.equal(screen.all("architect-plan-table-row").length, 7);
  const presas = screen.container.querySelectorAll<HTMLElement>("[data-testid='architect-plan-table-row'][data-formation='conflict']");
  assert.deepEqual([...presas].map(item => item.dataset.order), ["12", "13", "14"]);
  assert.match(linhaDa("k13").querySelector<HTMLElement>("[data-plan-seal='conflict']")!.title, /Presa no artigo “melhor-para-jogos-online” do Silo “planos de internet” \(Assunto “Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar\?” · cor Laranja\)/);
  assert.equal(linhaDa("k13").querySelector("[data-testid='architect-plan-row-withdraw']")?.textContent, "Retirar artigo do Silo");
  assert.equal(screen.query("architect-plan-sheet-next-step"), null);
  // 2026-10-16 · sem etapas do plano: os botões de sempre, uma vez cada.
  assert.equal(screen.query("architect-plan-stage"), null);
  assert.deepEqual([...screen.get("architect-articles-formation-actions").querySelectorAll("button")].map(item => item.textContent), ["Processar artigos", "Concluir formação", "Melhorar publicados…"]);
  semMinerador();
});

/*
 * 2026-10-17 (noite) · os 3 botões em sequência: o Concluir espera o Processar (a presa recusada pelo Processar conta
 * como feita: ele disse o motivo); o Concluir grava a cópia de trabalho do Processar, sem preparar de novo.
 */
test("Concluir formação (7, barra de sempre em 'Todos', depois do Processar): as 3 presas recusadas com o motivo antes do servidor; as 4 formam; resultado por linha; nada gira", async () => {
  rede();
  await screen.render(mesa(TODOS)); await assentar();
  await marcarAzuis();
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, true, "o Concluir espera o Processar");
  await screen.click("architect-articles-top-process"); await assentar();
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, false, "a presa recusada pelo Processar não trava o Concluir");
  await screen.click("architect-articles-top-confirm"); await assentar();
  const preparos = chamadas.filter(chamada => chamada.body?.action === "prepare");
  assert.equal(preparos.length, 1, "uma leitura só: a do Processar");
  assert.deepEqual(preparos[0].body.targetIds, ["k9", "k10", "k11", "k15"], "a presa não vai ao servidor");
  const kinds = screen.all("architect-plan-sheet-preview-line").map(item => [item.textContent!.split(" · ")[0], item.dataset.kind]);
  assert.deepEqual(kinds.filter(([, kind]) => kind === "refused").map(([keyword]) => keyword), ["internet para streaming", "melhor internet para jogos online", "internet para home office"]);
  assert.equal(kinds.filter(([, kind]) => kind === "go").length, 4);
  await screen.click("architect-plan-sheet-confirm"); await assentar();
  assert.deepEqual(chamadas.filter(chamada => chamada.body?.action === "apply").map(chamada => chamada.body.targetIds), [["k9", "k10", "k11", "k15"]]);
  assert.match(resultado("k9"), /ArticleDNA de k9 criado e relido/);
  assert.match(resultado("k13"), /^Não gravado: Presa no artigo/);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /4 gravado\(s\) e relido\(s\); 3 fora desta confirmação/);
  assert.equal(registro.aplicados, 1);
  semGirar(); semMinerador();
});

test("Processar artigos (7, barra de sempre em 'Todos'): a leitura com a busca do reforço; sem SERP por pagar, a cópia de trabalho vai direto para cada linha; as presas com o motivo; nada gira", async () => {
  rede();
  await screen.render(mesa(TODOS)); await assentar();
  await marcarAzuis();
  await screen.click("architect-articles-top-process"); await assentar();
  const preparo = chamadas.filter(chamada => chamada.body?.action === "prepare");
  assert.deepEqual(preparo.map(chamada => [chamada.body.discover, chamada.body.targetIds]), [[true, ["k9", "k10", "k11", "k15"]]]);
  assert.equal(screen.query("architect-plan-sheet-preview"), null, "nada a pagar: nenhuma prévia de custo");
  assert.equal(chamadas.filter(chamada => chamada.url === "/api/arquiteto/keyword-serp").length, 0, "o Validar SERP à parte saiu (F3 da linha única)");
  for (const id of AZUIS) assert.ok(resultado(id), `a linha ${id} tem resultado`);
  assert.match(resultado("k9"), /^Cópia de trabalho \(nada gravado\): principal/);
  assert.match(resultado("k13"), /^Presa no artigo/);
  semGirar(); semMinerador();
});

test("erro do servidor na leitura do Processar: frase humana com o que fazer, por linha; nada gira e os botões voltam", async () => {
  rede({ prepareStatus: 500 });
  await screen.render(mesa(TODOS)); await assentar();
  await marcarAzuis();
  await screen.click("architect-articles-top-process"); await assentar();
  for (const id of ["k9", "k10", "k11", "k15"]) assert.match(resultado(id), /O servidor falhou nesta etapa \(erro 500\)\. Nada foi gravado por ela; tente de novo/, id);
  assert.match(screen.get("architect-plan-sheet-summary").textContent!, /a leitura não foi confirmada \(o motivo está em cada linha\)/);
  assert.doesNotMatch(screen.text(), /QUERY_FAILURE/);
  semGirar();
  assert.equal((screen.get("architect-articles-top-process") as HTMLButtonElement).disabled, false, "o Processar volta");
  assert.equal((screen.get("architect-articles-top-confirm") as HTMLButtonElement).disabled, true, "sem a leitura, o Concluir espera");
});

test("gravação que não avança: para com a frase e oferece 'Continuar a gravação'; nunca gira sem fim", async () => {
  rede({ applyPreso: true });
  await screen.render(mesa(TODOS)); await assentar();
  await marcarAzuis();
  await screen.click("architect-articles-top-process"); await assentar();
  await screen.click("architect-articles-top-confirm"); await assentar();
  await screen.click("architect-plan-sheet-confirm"); await assentar(200);
  const aplicacoes = chamadas.filter(chamada => chamada.body?.action === "apply").length;
  assert.ok(aplicacoes > 1 && aplicacoes < 60, `chamadas limitadas (${aplicacoes})`);
  assert.match(screen.container.querySelector("[role='alert']")!.textContent!, /A gravação parou de avançar \(0 de 4 gravado\(s\)\).*Continuar a gravação/);
  assert.ok(screen.query("architect-plan-sheet-resume"), "a retomada fica à mão, sem novo aceite");
  semGirar();
});

test("linha presa → 'Retirar artigo do Silo': abre a PRÉVIA (grátis) do artigo intruso; só o dono, com motivo, confirma", async () => {
  rede();
  await screen.render(mesa()); await assentar();
  await screen.click(linhaDa("k13").querySelector<HTMLElement>("[data-testid='architect-plan-row-withdraw']")!); await assentar();
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
  assert.equal(registro.aplicados, 1, "a mesa é relida");
  assert.equal(screen.query("architect-plan-sheet-withdraw"), null);
  semMinerador();
});

/* --------------------------------------------- o painel dos publicados */

const painel = () => comProductShell(React.createElement(ArticleImprovementPanel, { brandId: MARCA_WIFI, onApplied: () => undefined, buttonClassName: "button", primaryButtonClassName: "button", activeGroup: { requested: "azul", label: "Azul" } }));

test("o painel dos publicados (aberto pelo botão da barra) é o refazedor: sem modo recolhido, sem cartão 'Próximo passo', sem 'Ir para a planilha'; abrir LÊ (grátis, na cor)", async () => {
  rede();
  await screen.render(painel()); await assentar();
  assert.equal(screen.get("architect-article-improvement").dataset.collapsed, undefined);
  assert.equal(screen.query("architect-improvement-collapsed"), null);
  assert.equal(screen.query("architect-improvement-next-step"), null, "2026-10-17 (noite) · SUBSTITUÍDO o cartão 'Próximo passo'");
  assert.doesNotMatch(screen.text(), /Artigos do plano|planilha abaixo|Ir para “Artigos do plano”/);
  // 2026-10-16 · o painel volta a reforçar os artigos do plano (como em 4d546ce): a frase que os mandava para outro lugar saiu.
  assert.equal(screen.query("architect-improvement-plan-elsewhere"), null);
  assert.doesNotMatch(screen.text(), /Consolidar o Silo do plano|Completar sustentações e SERP/);
  // 2026-10-17 (noite) · SUBSTITUÍDO "abrir não prepara nada": abrir o refazedor lê de graça (com a busca nova), na cor da etiqueta.
  assert.deepEqual(chamadas.filter(chamada => chamada.method === "POST").map(chamada => [chamada.body.action, chamada.body.discover, chamada.body.group]), [["prepare", true, "azul"]]);
});
