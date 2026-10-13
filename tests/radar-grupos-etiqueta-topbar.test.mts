import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== 2026-10-12 · A ETIQUETA DE COR DO GRUPO É FIXA NA TOPBAR GLOBAL =====
 *
 * Pedidos do dono (o primeiro e o adendo do mesmo dia):
 *   "coloca o ícone da tag de cores do lado do sino, que mude só as cores, um
 *    tipo select de tags de cores que o default seja o cinza";
 *   "essa tag tem que estar no global fixado e não de forma independente (…)
 *    coloca umas cores prefixados e pronto".
 *
 *   · a topbar global renderiza a etiqueta ELA MESMA, IMEDIATAMENTE antes do
 *     sino, no Minerador, no Arquiteto e no Radar — sem o módulo registrar
 *     nada e sem esperar a lista de grupos (aqui a rede recusa tudo);
 *   · o menu é um select de CORES: "Todos os grupos" (cinza), as 5 cores,
 *     "Sem grupo" e o rodapé do módulo; nada para escrever;
 *   · o ícone mostra a cor escolhida; "Todos os grupos" é o cinza neutro;
 *   · setas navegam; Esc fecha e devolve o foco;
 *   · o módulo só acrescenta ações no fim do menu (`groupTagMenuFooter`).
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
const { resetEditorialGroupAreaStoreForTests } = await import("../components/editorial/editorial-group-area-store.ts");

const GRUPO_LARANJA = "11111111-aaaa-4aaa-8aaa-000000000001";
const GRUPO_AZUL = "11111111-aaaa-4aaa-8aaa-000000000002";
const grupo = (id: string, name: string, color: "laranja" | "azul") => ({ id, marcaId: MARCA, name, color, origin: "manual" as const, status: "active" as const, siloId: null, planVersion: 0, lockVersion: 1, updatedAt: "2026-10-12T00:00:00Z", keywordCount: 3, articleCount: 1 });
const GRUPOS = [grupo(GRUPO_LARANJA, "laranja", "laranja"), grupo(GRUPO_AZUL, "planos", "azul")];

type Escolha = "todos" | "sem-grupo" | "amarelo" | "azul" | "verde" | "lima" | "laranja";
const documento = () => (globalThis as unknown as { document: Document }).document;
const janela = () => (globalThis as unknown as { window: Window }).window;
const tecla = (alvo: Element, key: string) => React.act(async () => {
  const Evento = (globalThis as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent;
  alvo.dispatchEvent(new Evento("keydown", { key, bubbles: true }));
});
const limpar = () => {
  resetEditorialGroupAreaStoreForTests();
  try { janela().localStorage.clear(); } catch { /* armazenamento do happy-dom do teste */ }
};

/** O seletor com estado de verdade: a escolha muda pelo clique, como na tela. */
function SeletorVivo({ inicial, onTroca }: { inicial: Escolha; onTroca?: (escolha: Escolha) => void }) {
  const [escolha, setEscolha] = React.useState<Escolha>(inicial);
  return React.createElement(EditorialGroupSelector, {
    choice: escolha, groups: GRUPOS,
    onChoose: (proxima: Escolha) => { setEscolha(proxima); onTroca?.(proxima); },
    menuFooter: (fechar: () => void) => React.createElement("button", { type: "button", "data-article-group-tag-open": true, onClick: fechar }, "Etiquetar artigos pelo grupo das keywords"),
  });
}

function Registrador({ moduleId, comRodape }: { moduleId: string; comRodape: boolean }) {
  const { registerControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  React.useEffect(() => {
    registerControls({
      moduleId,
      actions: React.createElement("span", null, "ações"),
      ...(comRodape ? { groupTagMenuFooter: (fechar: () => void) => React.createElement("button", { type: "button", "data-rodape-do-modulo": true, onClick: fechar }, "Ação do módulo") } : {}),
    });
    return () => unregisterControls(moduleId);
  }, [moduleId, comRodape, registerControls, unregisterControls]);
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

for (const area of ["minerador", "arquiteto", "radar", "redator", "publicacoes"] as const) {
  test(`${area} · a topbar mostra a etiqueta SOZINHA, na hora, ao lado do sino, cinza no default`, async () => {
    limpar();
    (globalThis as unknown as { __radarTela: { pathname: string } }).__radarTela.pathname = `/adalbapro--${MARCA}/${area}`;
    const tela = await harness.montarRadar();
    // Nenhum módulo registra nada: a etiqueta é da topbar.
    await tela.render(montarTopbar(null));
    const botao = vizinhoDoSino(tela.container);
    assert.equal(botao.getAttribute("aria-label"), "Todos os grupos");
    assert.equal(botao.getAttribute("title"), "Todos os grupos");
    assert.equal(botao.getAttribute("data-group-tag-color"), "todos");
    assert.match(botao.querySelector("[data-group-tag-icon]")!.getAttribute("class") || "", /\btext-text-muted\b/, "default = cinza neutro (token text-muted)");
    assert.equal(tela.container.querySelectorAll("[data-editorial-group-selector]").length, 1, "nada duplicado na barra");
    tela.destroy();
  });
}

/* 2026-10-12 · F6: o Redator e Publicações ganharam a etiqueta; fora das cinco áreas editoriais, nada. */
test("outras páginas · nada de etiqueta fora das áreas editoriais (Minerador, Arquiteto, Radar, Redator e Publicações)", async () => {
  limpar();
  (globalThis as unknown as { __radarTela: { pathname: string } }).__radarTela.pathname = `/adalbapro--${MARCA}/conta`;
  const tela = await harness.montarRadar();
  await tela.render(montarTopbar(null));
  assert.equal(tela.container.querySelector("[data-editorial-group-selector]"), null);
  tela.destroy();
});

for (const area of ["minerador", "arquiteto", "radar", "redator", "publicacoes"] as const) {
  test(`${area} · o módulo só acrescenta ações no FIM do menu da etiqueta`, async () => {
    limpar();
    (globalThis as unknown as { __radarTela: { pathname: string } }).__radarTela.pathname = `/adalbapro--${MARCA}/${area}`;
    const tela = await harness.montarRadar();
    const rodape = (fechar: () => void) => React.createElement("button", { type: "button", "data-rodape-do-modulo": true, onClick: fechar }, "Ação do módulo");
    await tela.render(montarTopbar(area === "radar"
      ? React.createElement(OperationalDataGrid<{ id: string }>, { module: "radar", userId: ATOR, brandId: MARCA, rows: [], columns: [], topbar: { moduleId: "radar", renderActions: () => null, groupTagMenuFooter: rodape, groupTagUngroupedDetail: "2 artigos" } })
      : React.createElement(Registrador, { moduleId: area, comRodape: true })));
    const botao = vizinhoDoSino(tela.container);
    await tela.click(botao);
    const corpo = documento().body.textContent || "";
    assert.match(corpo, /Ação do módulo/);
    if (area === "radar") assert.match(corpo, /2 artigos/, "o Radar conta artigos no \"Sem grupo\"");
    const itens = [...documento().querySelectorAll("[role='menuitemradio'], [data-rodape-do-modulo]")];
    assert.ok(itens.at(-1)?.hasAttribute("data-rodape-do-modulo"), "a ação do módulo vem depois das cores e do \"Sem grupo\"");
    tela.destroy();
  });
}

test("menu de cores · Todos, as 5 cores, Sem grupo; nada para escrever", async () => {
  limpar();
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(SeletorVivo, { inicial: "todos" }));
  await tela.click(tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement);
  const menu = documento().querySelector("[role='menu']")!;
  const opcoes = [...menu.querySelectorAll("[role='menuitemradio']")] as HTMLElement[];
  assert.deepEqual(opcoes.map(opcao => opcao.getAttribute("data-group-choice")), ["todos", "amarelo", "azul", "verde", "lima", "laranja", "sem-grupo"]);
  assert.ok(opcoes[0].querySelector(".bg-text-muted"), "Todos os grupos tem a bolinha cinza");
  assert.ok(opcoes[5].querySelector(".bg-group-laranja"), "cada cor com a sua bolinha e o nome da cor");
  assert.match(opcoes[5].textContent || "", /^Laranja/);
  assert.match(opcoes[2].querySelector("[data-group-custom-name]")?.textContent || "", /planos/, "o nome próprio do grupo da cor aparece ao lado");
  assert.equal(opcoes[5].querySelector("[data-group-custom-name]"), null, "grupo com o nome da própria cor não repete o nome");
  assert.equal(documento().querySelector("[role='menu'] input, [role='menu'] form"), null, "nada para escrever");
  assert.doesNotMatch(documento().body.textContent || "", /Novo grupo|Criar grupo|Nome do grupo/);
  assert.doesNotMatch(opcoes[5].textContent || "", /keyword/, "contagem só quando já chegou do servidor");
  tela.destroy();
});

test("contagens · aparecem só quando já chegaram (nunca seguram o menu)", async () => {
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(EditorialGroupSelector, { choice: "todos", onChoose: nada, groups: GRUPOS, countsReady: true, ungroupedDetail: "4 keywords" }));
  await tela.click(tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement);
  const laranja = documento().querySelector("[data-group-choice='laranja']")!;
  assert.match(laranja.textContent || "", /3 keywords · 1 artigo/);
  assert.match(documento().querySelector("[data-group-choice='sem-grupo']")!.textContent || "", /4 keywords/);
  assert.doesNotMatch(documento().querySelector("[data-group-choice='verde']")!.textContent || "", /keyword/, "cor sem grupo: sem contagem");
  tela.destroy();
});

test("cor do ativo · o ícone pinta com a cor e o nome vai no tooltip e no aria-label", async () => {
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(SeletorVivo, { inicial: "laranja" }));
  const botao = tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement;
  assert.equal(botao.getAttribute("aria-label"), "Grupo: Laranja");
  assert.equal(botao.getAttribute("title"), "Grupo: Laranja");
  assert.equal(botao.getAttribute("data-group-tag-color"), "laranja");
  assert.match(botao.querySelector("[data-group-tag-icon]")!.getAttribute("class") || "", /\btext-group-laranja\b/);
  assert.doesNotMatch(botao.textContent || "", /laranja/i, "o botão é só o ícone; o nome não ocupa a barra");
  tela.destroy();
});

test("troca por um clique · escolhe a cor e o ícone muda de cor (nome próprio no tooltip)", async () => {
  const tela = await harness.montarRadar();
  const trocas: Escolha[] = [];
  await tela.render(React.createElement(SeletorVivo, { inicial: "todos", onTroca: escolha => trocas.push(escolha) }));
  const botao = tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement;
  assert.equal(botao.getAttribute("aria-haspopup"), "menu");
  assert.equal(botao.getAttribute("aria-expanded"), "false");
  await tela.click(botao);
  assert.equal(botao.getAttribute("aria-expanded"), "true");
  const menu = documento().querySelector("[role='menu']")!;
  assert.equal(botao.getAttribute("aria-controls"), menu.getAttribute("id"));
  assert.equal(menu.querySelector("[data-group-choice='todos']")!.getAttribute("aria-checked"), "true", "Todos os grupos é o padrão");
  await tela.click(menu.querySelector("[data-group-choice='azul']") as HTMLElement);
  assert.deepEqual(trocas, ["azul"]);
  assert.equal(documento().querySelector("[role='menu']"), null, "o menu fecha depois da escolha");
  assert.equal(botao.getAttribute("aria-label"), "Grupo: Azul · planos");
  assert.match(botao.querySelector("[data-group-tag-icon]")!.getAttribute("class") || "", /\btext-group-azul\b/);
  tela.destroy();
});

test("teclado · setas navegam entre as opções, Esc fecha e o foco volta ao botão", async () => {
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(SeletorVivo, { inicial: "laranja" }));
  const botao = tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement;
  botao.focus();
  await tecla(botao, "ArrowDown");
  assert.equal(botao.getAttribute("aria-expanded"), "true", "seta para baixo abre o menu");
  const ativo = () => documento().activeElement as HTMLElement | null;
  assert.equal(ativo()?.getAttribute("aria-checked"), "true", "o foco começa na opção escolhida");
  assert.equal(ativo()?.getAttribute("data-group-choice"), "laranja");
  await tecla(ativo()!, "ArrowDown");
  assert.equal(ativo()?.getAttribute("data-group-choice"), "sem-grupo");
  await tecla(ativo()!, "Home");
  assert.equal(ativo()?.getAttribute("data-group-choice"), "todos");
  await tecla(ativo()!, "ArrowUp");
  assert.match(ativo()?.textContent || "", /Etiquetar artigos pelo grupo das keywords/, "seta para cima no topo vai ao fim do menu");
  await tecla(ativo()!, "Escape");
  assert.equal(documento().querySelector("[role='menu']"), null);
  assert.equal(botao.getAttribute("aria-expanded"), "false");
  assert.equal(ativo(), botao, "Esc devolve o foco ao botão");
  tela.destroy();
});

/* ============ as três telas não montam mais o seletor: a topbar monta ============ */

const ler = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("telas · a topbar global monta a etiqueta; Minerador, Arquiteto e Radar só dão o rodapé", () => {
  const minerador = ler("modules/minerador/minerador-workspace.tsx");
  assert.doesNotMatch(minerador, /<EditorialGroupSelector|groupTag/);

  const arquiteto = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(arquiteto, /groupTagMenuFooter: rodapeDaEtiquetaDoArquiteto,/);
  assert.doesNotMatch(arquiteto, /<EditorialGroupSelector|groupTag:/);

  const radar = ler("modules/radar/radar-page.tsx");
  assert.match(radar, /groupTagMenuFooter: rodapeDaEtiquetaDoRadar, groupTagUngroupedDetail:/);
  assert.doesNotMatch(radar, /<EditorialGroupSelector|groupTag:/);

  const topbar = ler("components/global-topbar.tsx");
  assert.match(topbar, /areaDaEtiqueta && marcaDaEtiqueta && sessaoDaEtiqueta === "authenticated" \? <div className="flex shrink-0 items-center" data-topbar-group-tag><TopbarGroupTag /);
  assert.match(topbar, /data-topbar-group-tag><TopbarGroupTag [^\n]*<\/div> : null\}\s*<NotificationBell \/>/, "o slot vem imediatamente antes do sino");
  assert.doesNotMatch(topbar, /moduleControls\??\.groupTag\b/, "não depende mais de o módulo registrar a etiqueta");
});
