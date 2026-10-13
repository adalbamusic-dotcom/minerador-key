import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== 2026-10-12 · "GERENCIAR A COR", "HISTÓRICO DO GRUPO" E "TIRAR DO PLANO" NA ETIQUETA =====
 *
 * SDD docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md (§9.1-A,
 * §10.4, §6.1-5). O menu da etiqueta de cor da topbar ganha:
 *
 *   · por cor que já tem grupo, "Gerenciar" (nome opcional, trocar para cor
 *     LIVRE, liberar a cor só vazia) — só com a lista do servidor;
 *   · "Histórico do grupo" quando há uma cor escolhida — lido SÓ ao abrir;
 *   · no Gerenciar de um grupo com plano, "Tirar do plano" com prévia e confirmação.
 *
 * Mora no runner do Radar por causa do DOM (happy-dom) e do loader `@/`.
 * Sem rede: o `fetch` é um roteiro em memória. PROVIDER_CALLS = 0.
 */

register("./stubs/radar-tela-hooks.mjs", import.meta.url, { data: { stubs: ["navegacao", "mesa"] } });

type Resposta = { status: number; body: unknown } | "pendente";
const chamadas: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
let roteiro: (url: string, method: string, body: Record<string, unknown> | null) => Resposta = () => "pendente";
Object.defineProperty(globalThis, "fetch", {
  value: (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(init.body) : null;
    chamadas.push({ url, method, body });
    const resposta = roteiro(url, method, body);
    if (resposta === "pendente") return new Promise(() => undefined);
    return Promise.resolve({ ok: resposta.status >= 200 && resposta.status < 300, status: resposta.status, json: async () => resposta.body });
  },
  writable: true, configurable: true,
});

const harness = await import("./radar-dom-harness.mts");
const React = harness.React;
const MARCA = "11111111-aaaa-4aaa-8aaa-0000000000aa";
const ATOR = "11111111-2222-4333-8444-555555555555";
const nada = () => undefined;
const nadaAsync = async () => undefined;
(globalThis as Record<string, unknown>).__radarTela = {
  React,
  store: { get: () => ({}), subscribe: () => nada, set: nada },
  pathname: `/adalbapro--${MARCA}/arquiteto`,
  brand: { selectedBrandId: MARCA, setSelectedBrandId: nada, brands: [], refreshBrands: nadaAsync, activeBrand: null, activeBrandRef: `adalbapro--${MARCA}`, loading: false, userRole: "owner", profileLoading: false },
  session: { data: { user: { id: ATOR, email: "dono@exemplo.test", name: "Dono", image: null } }, status: "authenticated", actorUserId: ATOR, sessionEpoch: 1, setPresentationOverride: nada, signOut: nadaAsync },
};

const estado = await import("../components/editorial/editorial-group-area-store.ts");
const { TopbarGroupTag, EditorialGroupSelector } = await import("../components/editorial/group-selector.tsx");

const LARANJA_ID = "11111111-aaaa-4aaa-8aaa-000000000001";
const AZUL_ID = "11111111-aaaa-4aaa-8aaa-000000000002";
type Cor = "laranja" | "azul" | "verde";
const resumo = (id: string, name: string, color: Cor, extra: Record<string, unknown> = {}) => ({ id, marcaId: MARCA, name, color, origin: "manual", status: "active", siloId: null, planVersion: 0, lockVersion: 3, updatedAt: "2026-10-12T00:00:00+00:00", keywordCount: 56, articleCount: 8, ...extra });

const janela = () => (globalThis as unknown as { window: Window & typeof globalThis }).window;
const documento = () => (globalThis as unknown as { document: Document }).document;
const esperar = () => React.act(async () => { for (let i = 0; i < 6; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); });
const $ = (seletor: string) => documento().querySelector(seletor) as HTMLElement | null;

let grupos = [resumo(LARANJA_ID, "Laranja", "laranja"), resumo(AZUL_ID, "Planos e contratação", "azul")];
function limpar(caminho = `/adalbapro--${MARCA}/arquiteto`) {
  estado.resetEditorialGroupAreaStoreForTests();
  janela().localStorage.clear();
  chamadas.length = 0;
  grupos = [resumo(LARANJA_ID, "Laranja", "laranja"), resumo(AZUL_ID, "Planos e contratação", "azul")];
  roteiro = (url, method) => (method === "GET" && url.startsWith("/api/editorial/groups?") ? { status: 200, body: { success: true, available: true, groups: grupos, ungroupedKeywordCount: 4 } } : "pendente");
  janela().history.replaceState(null, "", caminho);
}

async function abrirMenu(tela: Awaited<ReturnType<typeof harness.montarRadar>>) {
  await tela.click(tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement);
}

test("menu · 'Gerenciar' só nas cores que têm grupo, e só com a lista do servidor; histórico só com cor escolhida", async () => {
  limpar();
  const tela = await harness.montarRadar();
  // Sem as funções (como os testes antigos e o cache local): nada novo no menu.
  await tela.render(React.createElement(EditorialGroupSelector, { choice: "laranja", onChoose: nada, groups: grupos as never, countsReady: true }));
  await abrirMenu(tela);
  assert.equal($("[data-group-manage-open]"), null);
  assert.equal($("[data-group-history-open]"), null);
  tela.destroy();

  const outra = await harness.montarRadar();
  await outra.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" }));
  await esperar();
  await abrirMenu(outra);
  const engrenagens = [...documento().querySelectorAll("[data-group-manage-open]")].map(item => item.getAttribute("data-group-manage-open"));
  assert.deepEqual(engrenagens, ["azul", "laranja"], "cor sem grupo não tem Gerenciar");
  assert.equal($("[data-group-manage-open='laranja']")!.getAttribute("aria-label"), "Gerenciar a cor Laranja");
  assert.equal($("[data-group-history-open]"), null, "\"Todos os grupos\": sem histórico");
  assert.ok(!chamadas.some(chamada => chamada.url.includes("/history") || chamada.method !== "GET"), "abrir o menu não lê histórico nem escreve");
  outra.destroy();
});

test("gerenciar · trocar a cor: ocupada aparece desabilitada com o dono; livre grava, relê e a escolha acompanha o grupo", async () => {
  limpar(`/adalbapro--${MARCA}/arquiteto?grupo=laranja`);
  roteiro = (url, method, body) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) return { status: 200, body: { success: true, available: true, groups: grupos, ungroupedKeywordCount: 4 } };
    if (method === "PATCH" && url === "/api/editorial/groups") {
      grupos = grupos.map(grupo => (grupo.id === body!.groupId ? { ...grupo, color: body!.color as Cor, name: "Verde", lockVersion: 4 } : grupo));
      return { status: 200, body: { success: true, action: "edit", group: grupos.find(grupo => grupo.id === body!.groupId), summary: ["Cor: Laranja → Verde."], eventRecorded: true } };
    }
    return "pendente";
  };
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" }));
  await esperar();
  await abrirMenu(tela);
  await tela.click($("[data-group-manage-open='laranja']")!);
  assert.equal($("[role='menu']"), null, "o menu fecha e o diálogo abre");
  const azul = $("[data-group-manage-color='azul']") as HTMLButtonElement;
  assert.equal(azul.getAttribute("data-group-manage-color-state"), "taken");
  assert.equal(azul.disabled, true);
  assert.match(azul.textContent || "", /ocupada por “Planos e contratação”/);
  assert.equal(($("[data-group-manage-color='laranja']") as HTMLButtonElement).disabled, true, "a cor atual não se escolhe");
  assert.equal(($("[data-group-manage-recolor]") as HTMLButtonElement).disabled, true, "nada escolhido, nada a gravar");
  await tela.click($("[data-group-manage-color='verde']")!);
  assert.match($("[data-group-manage-recolor]")!.textContent || "", /Trocar para Verde/);
  await tela.click($("[data-group-manage-recolor]")!);
  await esperar();
  const patch = chamadas.find(chamada => chamada.method === "PATCH");
  assert.deepEqual(patch?.body, { marcaId: MARCA, groupId: LARANJA_ID, lockVersion: 3, color: "verde" });
  assert.match($("[data-testid='group-manage-notice']")!.textContent || "", /Gravado e relido\. Cor: Laranja → Verde\./);
  assert.ok(chamadas.filter(chamada => chamada.method === "GET" && chamada.url.startsWith("/api/editorial/groups?")).length >= 2, "a lista foi relida depois de gravar");
  assert.equal(janela().localStorage.getItem(`minerador-key:grupo-ativo:${MARCA}:arquiteto`), "verde", "a escolha da área acompanha o grupo");
  assert.equal(new URL(janela().location.href).searchParams.get("grupo"), "verde");
  tela.destroy();
});

test("gerenciar · liberar a cor com itens: desabilitado com a contagem; o servidor é a autoridade (recusa aparece)", async () => {
  limpar();
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" }));
  await esperar();
  await abrirMenu(tela);
  await tela.click($("[data-group-manage-open='laranja']")!);
  assert.equal(($("[data-group-manage-release]") as HTMLButtonElement).disabled, true);
  assert.match($("[data-group-manage-release-blocked]")!.textContent || "", /56 keywords, 8 artigos etiquetados/);
  // Nome: o PATCH devolve a recusa do servidor e a tela a mostra, sem dizer sucesso.
  roteiro = (url, method) => method === "PATCH" ? { status: 409, body: { success: false, code: "GROUP_NAME_TAKEN", message: "Já existe outro grupo ativo chamado “Planos e contratação” nesta marca." } } : { status: 200, body: { success: true, available: true, groups: grupos, ungroupedKeywordCount: 4 } };
  await tela.type($("[data-group-manage-name]")!, "Planos e contratação");
  await tela.click($("[data-group-manage-save-name]")!);
  await esperar();
  assert.match($("[data-testid='group-manage-notice']")!.textContent || "", /Já existe outro grupo ativo/);
  assert.doesNotMatch($("[data-testid='group-manage-notice']")!.textContent || "", /Gravado/);
  assert.deepEqual(chamadas.find(chamada => chamada.method === "PATCH")?.body, { marcaId: MARCA, groupId: LARANJA_ID, lockVersion: 3, name: "Planos e contratação" });
  tela.destroy();
});

test("histórico · só lê ao abrir; mostra tipo, data, ator, resultado, custo e link interno", async () => {
  limpar(`/adalbapro--${MARCA}/arquiteto?grupo=laranja`);
  roteiro = (url, method) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) return { status: 200, body: { success: true, available: true, groups: grupos, ungroupedKeywordCount: 4 } };
    if (method === "GET" && url.startsWith("/api/editorial/groups/history?")) return { status: 200, body: { success: true, viewerUserId: ATOR, ledgerRead: true, entries: [
      { id: "registro:1", source: "operation_ledger", groupId: LARANJA_ID, kind: "article_improvement", label: "Melhorar publicados e formar Assuntos", at: "2026-10-12T17:30:00.000Z", actorId: ATOR, outcome: "Concluído", outcomeTone: "success", detail: "alvos: 8", costUsd: 0.224, resultHref: `/adalbapro--${MARCA}/arquiteto?execucao=1`, resultRef: null },
      { id: "evento:2", source: "group_event", groupId: LARANJA_ID, kind: "recolored", label: "Cor trocada", at: "2026-10-12T15:00:00.000Z", actorId: "99999999-0000-4000-8000-000000000000", outcome: "Gravado e relido", outcomeTone: "success", detail: "Azul → Laranja", costUsd: null, resultHref: null, resultRef: null },
    ] } };
    return "pendente";
  };
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" }));
  await esperar();
  assert.ok(!chamadas.some(chamada => chamada.url.includes("/history")), "carregar a área não lê o histórico");
  await abrirMenu(tela);
  const itens = [...documento().querySelectorAll("[role='menu'] [role='menuitemradio'], [role='menu'] [data-group-history-open]")];
  assert.ok(itens.at(-1)?.hasAttribute("data-group-history-open"), "o histórico vem depois das cores e do \"Sem grupo\"");
  await tela.click($("[data-group-history-open]")!);
  await esperar();
  const leitura = chamadas.find(chamada => chamada.url.includes("/history"))!;
  assert.equal(new URL(`http://x${leitura.url}`).searchParams.getAll("groupId").join(","), LARANJA_ID);
  const linhas = [...documento().querySelectorAll("[data-group-history-entry]")];
  assert.equal(linhas.length, 2);
  assert.match(linhas[0].textContent || "", /Melhorar publicados e formar Assuntos · alvos: 8/);
  assert.match(linhas[0].textContent || "", /Você · Concluído · custo US\$ 0,224/);
  assert.equal(linhas[0].querySelector("a")?.getAttribute("href"), `/adalbapro--${MARCA}/arquiteto?execucao=1`);
  assert.match(linhas[1].textContent || "", /Cor trocada · Azul → Laranja/);
  assert.match(linhas[1].textContent || "", /Outro membro · 99999999/);
  tela.destroy();
});

test("tirar do plano · no Gerenciar de um grupo com plano: lista, prévia com os efeitos, confirmação com o decisionHash", async () => {
  limpar();
  grupos = [resumo(LARANJA_ID, "Planos e contratação", "laranja", { origin: "declared_plan", planVersion: 1 })];
  const plano = { id: LARANJA_ID, name: "Planos e contratação", color: "laranja", planVersion: 1, siloName: "Planos e contratação", articleCount: 2 };
  const artigo = (ordem: number, papel: string, assunto: string, pode: boolean) => ({ order: ordem, role: papel, scope: "x", subject: { keywordId: `s${ordem}`, phrase: assunto, status: "aprovado" }, principal: null, canWithdraw: pode, withdrawBlocker: pode ? null : "O Pilar não sai do plano sozinho." });
  roteiro = (url, method, body) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) return { status: 200, body: { success: true, available: true, groups: grupos, ungroupedKeywordCount: 0 } };
    if (url.endsWith(`/plans/withdraw?groupId=${LARANJA_ID}`)) return { status: 200, body: { success: true, mode: "list", group: plano, articles: [artigo(1, "Pilar", "Como escolher", false), artigo(2, "Suporte", "Barata", true)] } };
    if (method === "POST" && url.endsWith("/plans/withdraw") && body!.mode === "preview") return { status: 200, body: { success: true, mode: "preview", group: plano, article: artigo(2, "Suporte", "Barata", true), remainingArticles: 1, nextPlanVersion: 2, approvedToReview: 1, effects: ["O Assunto “Barata” continua declarado.", "Nada é apagado."], decisionHash: "hash-da-previa" } };
    // SDD acelerar 2026-10-13, item 15 (mudança declarada): "Tirar do plano" numa confirmação devolve os passos.
    if (method === "POST" && url.endsWith("/plans/withdraw") && body!.mode === "apply") return { status: 200, body: { success: true, mode: "apply", chain: { complete: true, steps: [{ step: "plan", outcome: "done", message: "Plano v2 gravado e relido." }, { step: "approve_and_send", outcome: "done", message: "1 keyword(s) reaprovada(s) e enviada(s)." }, { step: "silo", outcome: "already", message: "O artigo não está em Silo no Arquiteto." }] } } };
    return "pendente";
  };
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" }));
  await esperar();
  await abrirMenu(tela);
  await tela.click($("[data-group-manage-open='laranja']")!);
  assert.match($("[data-group-manage-release-blocked]")!.textContent || "", /plano declarado do Silo \(v1\)/);
  await tela.click($("[data-declared-plan-load]")!);
  await esperar();
  assert.equal(($("[data-declared-plan-withdraw='s1']") as HTMLButtonElement).disabled, true, "o Pilar não sai sozinho");
  await tela.click($("[data-declared-plan-withdraw='s2']")!);
  await esperar();
  assert.match($("[data-declared-plan-preview]")!.textContent || "", /Nada é apagado/);
  assert.ok(!chamadas.some(chamada => chamada.body?.mode === "apply"), "a prévia não grava");
  await tela.click($("[data-declared-plan-confirm]")!);
  await esperar();
  const aplicar = chamadas.find(chamada => chamada.body?.mode === "apply");
  assert.deepEqual(aplicar?.body, { groupId: LARANJA_ID, subjectKeywordId: "s2", mode: "apply", decisionHash: "hash-da-previa", chain: { reapproveAndSend: true, withdrawFromSilo: true } });
  assert.match($("[data-testid='declared-plan-notice']")!.textContent || "", /“Barata” saiu do plano; cada passo foi relido\./);
  assert.match($("[data-declared-plan-chain-steps]")!.textContent || "", /Plano v2 gravado e relido\./);
  tela.destroy();
});
