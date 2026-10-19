import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== 2026-10-14 · F7 · "EXCLUIR TUDO DA COR X" NA ETIQUETA DE COR (DOM) =====
 *
 * SDD docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md,
 * item 6 (D6/D7/D8). Mora no runner do Radar por causa do DOM (happy-dom) e do
 * loader `@/` (como os outros testes da etiqueta de cor). Sem rede: o `fetch` é
 * um roteiro em memória; nenhuma exclusão real. PROVIDER_CALLS = 0.
 *
 *   · no Minerador, com uma cor escolhida, o menu tem "Excluir tudo da cor X…";
 *     no Arquiteto não (o "Gerenciar a cor" de lá só leva ao Minerador);
 *   · sem a migration M-E, a prévia aparece e o botão fica DESABILITADO com a explicação;
 *   · com ela, o botão só habilita com o nome da cor e "apaga de vez" digitados;
 *     confirmar manda a decisão da prévia e a planilha recebe as linhas que saíram;
 *   · `?excluir_tudo_da_cor=<cor>` no Minerador abre o diálogo e sai da URL.
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
  pathname: `/adalbapro--${MARCA}/minerador`,
  brand: { selectedBrandId: MARCA, setSelectedBrandId: nada, brands: [], refreshBrands: nadaAsync, activeBrand: null, activeBrandRef: `adalbapro--${MARCA}`, loading: false, userRole: "owner", profileLoading: false },
  session: { data: { user: { id: ATOR, email: "dono@exemplo.test", name: "Dono", image: null } }, status: "authenticated", actorUserId: ATOR, sessionEpoch: 1, setPresentationOverride: nada, signOut: nadaAsync },
};

const estado = await import("../components/editorial/editorial-group-area-store.ts");
const { TopbarGroupTag } = await import("../components/editorial/group-selector.tsx");
const { buildGroupDeleteAllPreview, GROUP_DELETE_ALL_DONE_EVENT } = await import("../lib/minerador/group-delete-all.ts");

const LARANJA_ID = "11111111-aaaa-4aaa-8aaa-000000000001";
const grupoLaranja = { id: LARANJA_ID, marcaId: MARCA, name: "Laranja", color: "laranja", origin: "manual", status: "active", siloId: null, planVersion: 0, lockVersion: 3, updatedAt: "2026-10-14T00:00:00+00:00", keywordCount: 3, articleCount: 0 };
const K1 = "30000000-0000-4000-8000-000000000001";
const K2 = "30000000-0000-4000-8000-000000000002";
const K3 = "30000000-0000-4000-8000-000000000003";

const previaDe = (available: boolean) => buildGroupDeleteAllPreview({
  group: { id: LARANJA_ID, name: "Laranja", color: "laranja", planVersion: 0, lockVersion: 3, siloId: null, hasPlan: false },
  keywords: [
    { id: K1, keyword: "internet fibra barata", status: "bruto", subjectDeclared: false, plan: null, entryTitle: null, principalMark: null, lifecycle: "hard", architectRefs: [] },
    { id: K2, keyword: "wifi 6 vale a pena", status: "aprovado", subjectDeclared: false, plan: null, entryTitle: null, principalMark: null, lifecycle: "hard", architectRefs: [] },
    { id: K3, keyword: "roteador mesh", status: "aprovado", subjectDeclared: false, plan: null, entryTitle: null, principalMark: null, lifecycle: "hard", architectRefs: [{ articleId: "art-mesh", label: "Roteador mesh" }] },
  ],
  trashedCount: 0,
  taggedArticles: [],
  architectArticles: [{ articleId: "art-mesh", label: "Roteador mesh", stages: ["radar"] }],
  siloConsolidated: false,
  includePublished: false,
  available,
});

const janela = () => (globalThis as unknown as { window: Window & typeof globalThis }).window;
const documento = () => (globalThis as unknown as { document: Document }).document;
const esperar = () => React.act(async () => { for (let i = 0; i < 6; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); });
const $ = (seletor: string) => documento().querySelector(seletor) as HTMLElement | null;

function limpar(caminho: string, available = true) {
  estado.resetEditorialGroupAreaStoreForTests();
  janela().localStorage.clear();
  chamadas.length = 0;
  roteiro = (url, method, body) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) return { status: 200, body: { success: true, available: true, groups: [grupoLaranja], ungroupedKeywordCount: 0 } };
    if (method === "POST" && url === `/api/minerador/marcas/${MARCA}/keywords/delete-group` && body!.mode === "preview") return { status: 200, body: { success: true, mode: "preview", preview: previaDe(available), decisionHash: "sha256:previa-1" } };
    if (method === "POST" && url === `/api/minerador/marcas/${MARCA}/keywords/delete-group` && body!.mode === "apply") {
      return { status: 200, body: { success: true, mode: "apply", decisionHash: "sha256:previa-1", blocks: [{ ids: [K1, K2], allowRecoverable: false, outcome: "done", hardDeletedIds: [K1, K2], recoverableIds: [], releasedSubjectIds: [], code: null, message: null }], hardDeletedIds: [K1, K2], recoverableIds: [], releasedSubjectIds: [], out: [], plan: null, color: { freed: false, archived: false, siloUnlinked: false, keptBecause: ["1 keyword fica fora (motivos na lista)"] }, historyRecorded: true, readback: { confirmed: true, divergences: [] }, complete: true, notices: [] } };
    }
    return "pendente";
  };
  janela().history.replaceState(null, "", caminho);
  (globalThis as unknown as { __radarTela: { pathname: string } }).__radarTela.pathname = caminho.split("?")[0];
}

async function abrirMenu(tela: Awaited<ReturnType<typeof harness.montarRadar>>) {
  await tela.click(tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement);
}

test("menu · só no Minerador e com a cor escolhida aparece \"Excluir tudo da cor\"; sem a M-E o botão fica desabilitado com a explicação", async () => {
  limpar(`/adalbapro--${MARCA}/arquiteto?grupo=laranja`);
  const arquiteto = await harness.montarRadar();
  await arquiteto.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" }));
  await esperar();
  await abrirMenu(arquiteto);
  assert.ok($("[data-group-history-open]"), "o histórico continua");
  assert.equal($("[data-group-delete-all-menu]"), null, "o Arquiteto não exclui keyword (F4)");
  arquiteto.destroy();

  limpar(`/adalbapro--${MARCA}/minerador?grupo=laranja`, false);
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "minerador" }));
  await esperar();
  await abrirMenu(tela);
  assert.match($("[data-group-delete-all-menu='laranja']")!.textContent || "", /Excluir tudo da cor Laranja…/);
  await tela.click($("[data-group-delete-all-menu='laranja']")!);
  await esperar();
  const previa = chamadas.find(chamada => chamada.body?.mode === "preview");
  assert.deepEqual(previa?.body, { groupId: LARANJA_ID, mode: "preview", includePublished: false });
  assert.match($("[data-group-delete-all-unavailable]")!.textContent || "", /20261016130000_excluir_tudo_da_cor não foi aplicada/);
  const botao = $("[data-group-delete-all-confirm]") as HTMLButtonElement;
  assert.equal(botao.disabled, true);
  await tela.type($("[data-group-delete-all-typed-color]")!, "laranja");
  await tela.type($("[data-group-delete-all-typed-phrase]")!, "apaga de vez");
  assert.equal(($("[data-group-delete-all-confirm]") as HTMLButtonElement).disabled, true, "mesmo com a confirmação digitada: sem a M-E, nada é excluído");
  // Áreas (D8): o Minerador executa; as outras ficam fora, com o motivo e os itens.
  assert.equal($("[data-group-delete-all-area='minerador']")!.getAttribute("data-executable"), "sim");
  assert.equal($("[data-group-delete-all-area='radar']")!.getAttribute("data-executable"), "nao");
  assert.match($("[data-group-delete-all-area='radar']")!.textContent || "", /Roteador mesh/);
  // 2026-10-18 · SUBSTITUÍDO "O Arquiteto não exclui keyword (F4)" / architect_reference: sem o desmonte ligado, a keyword com artigo fica fora com o porquê.
  assert.match($("[data-group-delete-all-area='arquiteto']")!.textContent || "", /Fica fora: o desmonte do Arquiteto não está ligado nesta exclusão/);
  assert.match($("[data-group-delete-all-out='architect_unavailable']")!.textContent || "", /Desfazer Silo.*Retirar artigo do Silo/);
  assert.ok(!chamadas.some(chamada => chamada.body?.mode === "apply"));
  tela.destroy();
});

test("confirmação forte: só habilita com o nome da cor e \"apaga de vez\"; confirmar manda a decisão da prévia e avisa a planilha", async () => {
  limpar(`/adalbapro--${MARCA}/minerador?grupo=laranja`);
  const recebidas: unknown[] = [];
  const ouvir = (evento: Event) => recebidas.push((evento as CustomEvent).detail);
  janela().addEventListener(GROUP_DELETE_ALL_DONE_EVENT, ouvir);
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "minerador" }));
  await esperar();
  await abrirMenu(tela);
  await tela.click($("[data-group-delete-all-menu='laranja']")!);
  await esperar();
  const botao = () => $("[data-group-delete-all-confirm]") as HTMLButtonElement;
  assert.match(botao().textContent || "", /Excluir tudo da cor Laranja \(2\)/);
  assert.equal(botao().disabled, true);
  await tela.type($("[data-group-delete-all-typed-color]")!, "azul");
  await tela.type($("[data-group-delete-all-typed-phrase]")!, "apaga de vez");
  assert.equal(botao().disabled, true, "outra cor não vale");
  await tela.type($("[data-group-delete-all-typed-color]")!, "Laranja");
  await tela.type($("[data-group-delete-all-typed-phrase]")!, "apaga");
  assert.equal(botao().disabled, true, "\"apaga de vez\" inteiro");
  await tela.type($("[data-group-delete-all-typed-phrase]")!, "apaga de vez");
  assert.equal(botao().disabled, false);
  await tela.click(botao());
  await esperar();
  const aplicar = chamadas.find(chamada => chamada.body?.mode === "apply");
  assert.deepEqual(aplicar?.body, { groupId: LARANJA_ID, mode: "apply", includePublished: false, decisionHash: "sha256:previa-1", typed: { color: "Laranja", phrase: "apaga de vez", publishedNames: {} } });
  assert.match($("[data-testid='group-delete-all-notice']")!.textContent || "", /Feito e relido: 2 apagada\(s\) de vez, 0 na lixeira de 24 h\./);
  assert.match($("[data-group-delete-all-result]")!.textContent || "", /A cor Laranja continua ocupada/);
  assert.deepEqual(recebidas, [{ brandId: MARCA, groupId: LARANJA_ID, hardDeletedIds: [K1, K2], recoverableIds: [] }]);
  janela().removeEventListener(GROUP_DELETE_ALL_DONE_EVENT, ouvir);
  tela.destroy();
});

test("Gerenciar a cor no Arquiteto: a seção leva ao Minerador (sem botão de excluir); no Minerador, ?excluir_tudo_da_cor abre o diálogo e sai da URL", async () => {
  limpar(`/adalbapro--${MARCA}/arquiteto`);
  const arquiteto = await harness.montarRadar();
  await arquiteto.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" }));
  await esperar();
  await abrirMenu(arquiteto);
  await arquiteto.click($("[data-group-manage-open='laranja']")!);
  await esperar();
  assert.equal($("[data-group-delete-all-open]"), null);
  assert.equal($("[data-group-delete-all-link]")!.getAttribute("href"), `/adalbapro--${MARCA}/minerador?excluir_tudo_da_cor=laranja`);
  arquiteto.destroy();

  limpar(`/adalbapro--${MARCA}/minerador?excluir_tudo_da_cor=laranja`);
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "minerador" }));
  await esperar();
  await esperar();
  assert.ok($("[data-group-delete-all]"), "o diálogo abriu pelo link");
  assert.equal(new URL(janela().location.href).searchParams.get("excluir_tudo_da_cor"), null, "o parâmetro saiu da URL");
  assert.ok(!chamadas.some(chamada => chamada.body?.mode === "apply"), "abrir não exclui");
  tela.destroy();
});

/*
 * 2026-10-18 · O ALERTA NA TELA (decisão do dono, literal: "tem que poder apagar sim não interessa qual seja o estado …
 * e alerta falando o que está apagando"). Pelo MESMO botão "Excluir tudo da cor": a prévia traz o desmonte do Arquiteto
 * (o mesmo núcleo do "Desfazer Silo") e o diálogo lista, por área, o que sai antes das keywords; a keyword com artigo
 * vigente não fica mais fora; o relatório diz o que foi feito no Arquiteto.
 */
test("o alerta por área: o Arquiteto e o Radar saem junto, antes das keywords; nenhuma fica fora por estar num artigo; o relatório diz o que foi feito lá", async () => {
  limpar(`/adalbapro--${MARCA}/minerador?grupo=laranja`);
  const linhasArquiteto = ["Silo “Roteadores”: sai inteiro — 1 artigo(s) (Pilar incluído): “Roteador mesh”; SiloDNA e SiloPage deixam de valer. As versões ficam como histórico."];
  const linhasRadar = ["“Roteador mesh”: o item sai da operação do Radar (“retirado”); a investigação e o histórico ficam."];
  const comDesmonte = buildGroupDeleteAllPreview({
    group: { id: LARANJA_ID, name: "Laranja", color: "laranja", planVersion: 0, lockVersion: 3, siloId: null, hasPlan: false },
    keywords: [
      { id: K1, keyword: "internet fibra barata", status: "bruto", subjectDeclared: false, plan: null, entryTitle: null, principalMark: null, lifecycle: "hard", architectRefs: [] },
      { id: K3, keyword: "roteador mesh", status: "aprovado", subjectDeclared: false, plan: null, entryTitle: null, principalMark: null, lifecycle: "hard", architectRefs: [{ articleId: "art-mesh", label: "Roteador mesh" }] },
    ],
    trashedCount: 0,
    taggedArticles: [],
    architectArticles: [{ articleId: "art-mesh", label: "Roteador mesh", stages: ["radar"] }],
    siloConsolidated: false,
    includePublished: false,
    available: true,
    architectDismantle: { ok: true, preview: { keywordIds: [K3], articleIds: ["art-mesh"], territoryRefs: ["territory:1"], untagArticleIds: ["art-mesh"], unlinkGroupIds: [], areas: { arquiteto: linhasArquiteto, radar: linhasRadar, redator: [], publicacoes: [] }, lines: [...linhasArquiteto.map(linha => `Arquiteto · ${linha}`), ...linhasRadar.map(linha => `Radar · ${linha}`)], basis: { operation: "architect_dismantle@1", silos: ["territory:1"] } } },
  });
  roteiro = (url, method, body) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) return { status: 200, body: { success: true, available: true, groups: [grupoLaranja], ungroupedKeywordCount: 0 } };
    if (method === "POST" && url === `/api/minerador/marcas/${MARCA}/keywords/delete-group` && body!.mode === "preview") return { status: 200, body: { success: true, mode: "preview", preview: comDesmonte, decisionHash: "sha256:previa-2" } };
    if (method === "POST" && url === `/api/minerador/marcas/${MARCA}/keywords/delete-group` && body!.mode === "apply") {
      return { status: 200, body: { success: true, mode: "apply", decisionHash: "sha256:previa-2", blocks: [{ ids: [K1, K3], allowRecoverable: false, outcome: "done", hardDeletedIds: [K1, K3], recoverableIds: [], releasedSubjectIds: [], code: null, message: null }], hardDeletedIds: [K1, K3], recoverableIds: [], releasedSubjectIds: [], out: [], plan: null, color: { freed: true, archived: true, siloUnlinked: false, keptBecause: [] }, historyRecorded: true, readback: { confirmed: true, divergences: [] }, complete: true, notices: [], architect: { applied: ["Silo “Roteadores” desfeito", "1 item(ns) adiante retirado(s) da operação"] } } };
    }
    return "pendente";
  };
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(TopbarGroupTag, { brandId: MARCA, area: "minerador" }));
  await esperar();
  await abrirMenu(tela);
  await tela.click($("[data-group-delete-all-menu='laranja']")!);
  await esperar();
  assert.equal(comDesmonte.out.length, 0, "a keyword com artigo vigente não fica mais fora");
  assert.equal($("[data-group-delete-all-area='arquiteto']")!.getAttribute("data-executable"), "sim");
  assert.equal($("[data-group-delete-all-area='radar']")!.getAttribute("data-executable"), "sim");
  assert.match($("[data-group-delete-all-area='arquiteto']")!.textContent || "", /sai junto, antes das keywords/);
  assert.match($("[data-group-delete-all-area-items='arquiteto']")!.textContent || "", /Silo “Roteadores”: sai inteiro — 1 artigo\(s\) \(Pilar incluído\): “Roteador mesh”/);
  assert.match($("[data-group-delete-all-area-items='radar']")!.textContent || "", /o item sai da operação do Radar/);
  assert.match($("[data-group-delete-all-effects]")!.textContent || "", /Antes das keywords, sai junto/);
  const botao = () => $("[data-group-delete-all-confirm]") as HTMLButtonElement;
  assert.match(botao().textContent || "", /Excluir tudo da cor Laranja \(2\)/);
  await tela.type($("[data-group-delete-all-typed-color]")!, "laranja");
  await tela.type($("[data-group-delete-all-typed-phrase]")!, "apaga de vez");
  assert.equal(botao().disabled, false);
  await tela.click(botao());
  await esperar();
  const aplicar = chamadas.find(chamada => chamada.body?.mode === "apply");
  assert.deepEqual(aplicar?.body, { groupId: LARANJA_ID, mode: "apply", includePublished: false, decisionHash: "sha256:previa-2", typed: { color: "laranja", phrase: "apaga de vez", publishedNames: {} } }, "uma confirmação só: a da cor");
  assert.match($("[data-group-delete-all-result]")!.textContent || "", /Antes, no Arquiteto: Silo “Roteadores” desfeito · 1 item\(ns\) adiante retirado\(s\) da operação\./);
  assert.match($("[data-group-delete-all-result]")!.textContent || "", /A cor Laranja está livre/);
  tela.destroy();
});
