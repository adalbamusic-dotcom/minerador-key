import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== 2026-10-12 · A ETIQUETA DE COR DO GRUPO MORA AO LADO DO SINO =====
 *
 * Pedido do dono: "coloca o ícone da tag de cores do lado do sino, que mude só
 * as cores, um tipo select de tags de cores que o default seja o cinza, isso
 * em todas essas planilhas".
 *
 *   · a topbar global real põe `groupTag` IMEDIATAMENTE antes do sino, no
 *     Minerador, no Arquiteto e no Radar (o Radar passa pela ponte do grid);
 *   · o ícone mostra a cor do grupo ativo; "Todos os grupos" é o cinza neutro;
 *   · trocar de grupo é um clique; setas navegam; Esc fecha e devolve o foco;
 *   · as três telas registram o botão em `groupTag` e o seletor largo saiu
 *     das ações/abas (nada duplicado).
 *
 * Sem rede: o `fetch` recusa tudo. PROVIDER_CALLS = 0.
 */

register("./stubs/radar-tela-hooks.mjs", import.meta.url, { data: { stubs: ["navegacao", "mesa"] } });

Object.defineProperty(globalThis, "fetch", {
  value: () => Promise.reject(new Error("REDE PROIBIDA")),
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
  pathname: `/adalbapro--${MARCA}/radar`,
  brand: { selectedBrandId: MARCA, setSelectedBrandId: nada, brands: [], refreshBrands: nadaAsync, activeBrand: null, activeBrandRef: `adalbapro--${MARCA}`, loading: false, userRole: "owner", profileLoading: false },
  session: { data: { user: { id: ATOR, email: "dono@exemplo.test", name: "Dono", image: null } }, status: "authenticated", actorUserId: ATOR, sessionEpoch: 1, setPresentationOverride: nada, signOut: nadaAsync },
};

const { GlobalNoticeProvider } = await import("../components/global-notice-center.tsx");
const { GlobalTopbar, GlobalTopbarControlsProvider, useGlobalTopbarControlsRegistration } = await import("../components/global-topbar.tsx");
const { EditorialGroupSelector } = await import("../components/editorial/group-selector.tsx");
const { OperationalDataGrid } = await import("../components/editorial/operational-data-grid.tsx");

const GRUPO_LARANJA = "11111111-aaaa-4aaa-8aaa-000000000001";
const GRUPO_AZUL = "11111111-aaaa-4aaa-8aaa-000000000002";
const grupo = (id: string, name: string, color: "laranja" | "azul") => ({ id, marcaId: MARCA, name, color, origin: "manual" as const, status: "active" as const, siloId: null, planVersion: 0, lockVersion: 1, updatedAt: "2026-10-12T00:00:00Z", keywordCount: 3, articleCount: 1 });
const GRUPOS = [grupo(GRUPO_LARANJA, "laranja", "laranja"), grupo(GRUPO_AZUL, "planos", "azul")];

type Filtro = { kind: "all" } | { kind: "none" } | { kind: "group"; groupId: string };
const documento = () => (globalThis as unknown as { document: Document }).document;
const tecla = (alvo: Element, key: string) => React.act(async () => {
  const Evento = (globalThis as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent;
  alvo.dispatchEvent(new Evento("keydown", { key, bubbles: true }));
});

/** O seletor com estado de verdade: o filtro muda pelo clique, como na tela. */
function SeletorVivo({ inicial, onTroca }: { inicial: Filtro; onTroca?: (filtro: Filtro) => void }) {
  const [filtro, setFiltro] = React.useState<Filtro>(inicial);
  return React.createElement(EditorialGroupSelector, {
    groups: GRUPOS, ungroupedCount: 2, filter: filtro,
    onChange: (proximo: Filtro) => { setFiltro(proximo); onTroca?.(proximo); },
    menuFooter: (fechar: () => void) => React.createElement("button", { type: "button", "data-article-group-tag-open": true, onClick: fechar }, "Etiquetar artigos pelo grupo das keywords"),
  });
}

function Registrador({ moduleId, groupTag }: { moduleId: string; groupTag: React.ReactNode }) {
  const { registerControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  React.useEffect(() => {
    registerControls({ moduleId, actions: React.createElement("span", null, "ações"), groupTag });
    return () => unregisterControls(moduleId);
  }, [moduleId, groupTag, registerControls, unregisterControls]);
  return null;
}

const montarTopbar = (conteudo: React.ReactNode) => harness.comProductShell(
  React.createElement(GlobalNoticeProvider, null,
    React.createElement(GlobalTopbarControlsProvider, null,
      React.createElement(GlobalTopbar),
      conteudo)));

function vizinhoDoSino(container: HTMLElement) {
  const slot = container.querySelector("header[data-global-topbar] [data-topbar-group-tag]");
  assert.ok(slot, "o slot da etiqueta existe na topbar");
  assert.ok(slot!.nextElementSibling?.hasAttribute("data-notice-badge-tone"), "o vizinho imediato do botão é o sino");
  const botao = slot!.querySelector("[data-editorial-group-selector]") as HTMLElement | null;
  assert.ok(botao, "o botão-ícone de etiqueta está no slot ao lado do sino");
  return botao!;
}

for (const area of ["minerador", "arquiteto", "radar"] as const) {
  test(`${area} · o botão de etiqueta fica IMEDIATAMENTE ao lado do sino, cinza no default`, async () => {
    (globalThis as unknown as { __radarTela: { pathname: string } }).__radarTela.pathname = `/adalbapro--${MARCA}/${area}`;
    const tela = await harness.montarRadar();
    const groupTag = React.createElement(SeletorVivo, { inicial: { kind: "all" } });
    await tela.render(montarTopbar(area === "radar"
      ? React.createElement(OperationalDataGrid<{ id: string }>, { module: "radar", userId: ATOR, brandId: MARCA, rows: [], columns: [], topbar: { moduleId: "radar", renderActions: () => null, groupTag } })
      : React.createElement(Registrador, { moduleId: area, groupTag })));
    const botao = vizinhoDoSino(tela.container);
    assert.equal(botao.getAttribute("aria-label"), "Todos os grupos");
    assert.equal(botao.getAttribute("title"), "Todos os grupos");
    assert.equal(botao.getAttribute("data-group-tag-color"), "todos");
    assert.match(botao.querySelector("[data-group-tag-icon]")!.getAttribute("class") || "", /\btext-text-muted\b/, "default = cinza neutro (token text-muted)");
    assert.equal(tela.container.querySelectorAll("[data-editorial-group-selector]").length, 1, "nada duplicado na barra");
    tela.destroy();
  });
}

test("cor do ativo · o ícone pinta com a cor do grupo e o nome vai no tooltip e no aria-label", async () => {
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(SeletorVivo, { inicial: { kind: "group", groupId: GRUPO_LARANJA } }));
  const botao = tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement;
  assert.equal(botao.getAttribute("aria-label"), "Grupo: laranja");
  assert.equal(botao.getAttribute("title"), "Grupo: laranja");
  assert.equal(botao.getAttribute("data-group-tag-color"), "laranja");
  assert.match(botao.querySelector("[data-group-tag-icon]")!.getAttribute("class") || "", /\btext-group-laranja\b/);
  assert.doesNotMatch(botao.textContent || "", /laranja/, "o botão é só o ícone; o nome não ocupa a barra");
  tela.destroy();
});

test("troca por um clique · abre o select de cores, escolhe o grupo e o ícone muda de cor", async () => {
  const tela = await harness.montarRadar();
  const trocas: Filtro[] = [];
  await tela.render(React.createElement(SeletorVivo, { inicial: { kind: "all" }, onTroca: filtro => trocas.push(filtro) }));
  const botao = tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement;
  assert.equal(botao.getAttribute("aria-haspopup"), "menu");
  assert.equal(botao.getAttribute("aria-expanded"), "false");
  await tela.click(botao);
  assert.equal(botao.getAttribute("aria-expanded"), "true");
  const menu = documento().querySelector("[role='menu']")!;
  assert.equal(botao.getAttribute("aria-controls"), menu.getAttribute("id"));
  const opcoes = [...menu.querySelectorAll("[role='menuitemradio']")] as HTMLElement[];
  assert.deepEqual(opcoes.map(opcao => (opcao.textContent || "").replace(/\d+ keywords?.*$/, "").trim()), ["Todos os grupos", "Sem grupo", "laranja", "planos"]);
  assert.equal(opcoes[0].getAttribute("aria-checked"), "true", "Todos os grupos é o padrão");
  assert.ok(opcoes[0].querySelector(".bg-text-muted"), "Todos os grupos tem a bolinha cinza");
  assert.ok(opcoes[2].querySelector(".bg-group-laranja"), "uma bolinha por grupo, com o nome ao lado");
  assert.match(documento().body.textContent || "", /Novo grupo|Etiquetar artigos pelo grupo das keywords/);
  await tela.click(opcoes[3]);
  assert.deepEqual(trocas, [{ kind: "group", groupId: GRUPO_AZUL }]);
  assert.equal(documento().querySelector("[role='menu']"), null, "o menu fecha depois da escolha");
  assert.equal(botao.getAttribute("aria-label"), "Grupo: planos");
  assert.match(botao.querySelector("[data-group-tag-icon]")!.getAttribute("class") || "", /\btext-group-azul\b/);
  tela.destroy();
});

test("teclado · setas navegam entre as opções, Esc fecha e o foco volta ao botão", async () => {
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(SeletorVivo, { inicial: { kind: "group", groupId: GRUPO_LARANJA } }));
  const botao = tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement;
  botao.focus();
  await tecla(botao, "ArrowDown");
  assert.equal(botao.getAttribute("aria-expanded"), "true", "seta para baixo abre o menu");
  const ativo = () => documento().activeElement as HTMLElement | null;
  assert.equal(ativo()?.getAttribute("aria-checked"), "true", "o foco começa na opção escolhida");
  assert.match(ativo()?.textContent || "", /laranja/);
  await tecla(ativo()!, "ArrowDown");
  assert.match(ativo()?.textContent || "", /planos/);
  await tecla(ativo()!, "Home");
  assert.match(ativo()?.textContent || "", /Todos os grupos/);
  await tecla(ativo()!, "ArrowUp");
  assert.match(ativo()?.textContent || "", /Etiquetar artigos pelo grupo das keywords/, "seta para cima no topo vai ao fim do menu");
  await tecla(ativo()!, "Escape");
  assert.equal(documento().querySelector("[role='menu']"), null);
  assert.equal(botao.getAttribute("aria-expanded"), "false");
  assert.equal(ativo(), botao, "Esc devolve o foco ao botão");
  tela.destroy();
});

/* ============ as três telas registram o botão ao lado do sino (e só lá) ============ */

const ler = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("telas · Minerador, Arquiteto e Radar registram o seletor em `groupTag`, fora das ações e das abas", () => {
  const minerador = ler("modules/minerador/minerador-workspace.tsx");
  assert.match(minerador, /const groupTagButton = useMemo\(\(\) => \(keywordGroups\.available\s*\?\s*<EditorialGroupSelector/);
  assert.match(minerador, /tabs: sectionTabs,\s*groupTag: groupTagButton,/);
  assert.equal(minerador.split("<EditorialGroupSelector").length - 1, 1);

  const arquiteto = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(arquiteto, /groupTag: seletorDeGrupoDoArquiteto,/);
  assert.doesNotMatch(arquiteto, /data-arquiteto-topbar-actions>\s*\{seletorDeGrupoDoArquiteto\}/, "o seletor largo saiu das ações");
  assert.equal(arquiteto.split("<EditorialGroupSelector").length - 1, 1);

  const radar = ler("modules/radar/radar-page.tsx");
  assert.match(radar, /renderActions: renderTopbarActions, groupTag: seletorDeGrupoDoRadar \}\}/);
  assert.doesNotMatch(radar, /tabs: seletorDeGrupoDoRadar/);
  assert.equal(radar.split("<EditorialGroupSelector").length - 1, 1);

  const topbar = ler("components/global-topbar.tsx");
  assert.match(topbar, /data-topbar-group-tag>\{moduleControls\.groupTag\}<\/div> : null\}\s*<NotificationBell \/>/, "o slot vem imediatamente antes do sino");
});
