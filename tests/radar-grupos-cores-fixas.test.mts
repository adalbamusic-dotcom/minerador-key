import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== 2026-10-12 · CORES FIXAS, ESCOLHA POR ÁREA E CARREGAMENTO SEM ESPERA =====
 *
 * Adendo do §9.1 da SDD docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md.
 * Pedido do dono: "coloca umas cores prefixados e pronto, e até pode e tem que
 * funcionar de forma independente em cada área, mas não pode atrapalhar o
 * carregamento".
 *
 *   1 · a escolha é por marca E por área (lembrada em localStorage por área);
 *   2 · `?grupo=<cor>` (e o uuid antigo, e "sem-grupo") na URL da página aberta;
 *   3 · a lista de grupos da marca é lida UMA vez, em segundo plano, com o
 *       cache local na hora;
 *   4 · o Minerador não espera os grupos com "Todos"/"Sem grupo", nem com uma
 *       cor que o cache resolve; cor sem grupo = vazio sem consulta;
 *   5 · Arquiteto/Radar: a leitura pesada do grupo dos artigos espera a mesa
 *       (com "Todos"); com uma cor escolhida, começa na hora;
 *   6 · mover e o plano do Silo escolhem a COR.
 *
 * Mora no runner do Radar por causa do DOM (happy-dom) e do loader `@/`.
 * Sem rede: o `fetch` é um roteiro em memória. PROVIDER_CALLS = 0.
 */

register("./stubs/radar-tela-hooks.mjs", import.meta.url, { data: { stubs: ["navegacao", "mesa"] } });

type Resposta = { status: number; body: unknown } | "pendente";
const chamadas: Array<{ url: string; method: string; body: unknown }> = [];
let roteiro: (url: string, method: string, body: unknown) => Resposta = () => ({ status: 503, body: { success: false } });
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
const { useMineradorGroups } = await import("../modules/minerador/use-minerador-groups.ts");
const { useEditorialGroups } = await import("../components/editorial/use-editorial-groups.ts");
const { ArticleGroupMoveSelect } = await import("../components/editorial/article-group-controls.tsx");
const { DeclaredPlanImportDialog } = await import("../modules/minerador/declared-plan-import-dialog.tsx");
const dominio = await import("../lib/editorial/editorial-groups.ts");

const LARANJA_ID = "11111111-aaaa-4aaa-8aaa-000000000001";
const AZUL_ID = "11111111-aaaa-4aaa-8aaa-000000000002";
const NOVO_LARANJA_ID = "11111111-aaaa-4aaa-8aaa-000000000009";
const resumo = (id: string, name: string, color: "laranja" | "azul", status: "active" | "archived" = "active") => ({ id, marcaId: MARCA, name, color, origin: "manual" as const, status, siloId: null, planVersion: 0, lockVersion: 1, updatedAt: "2026-10-12T00:00:00+00:00", keywordCount: 56, articleCount: 0 });

const janela = () => (globalThis as unknown as { window: Window & typeof globalThis }).window;
const documento = () => (globalThis as unknown as { document: Document }).document;
const esperar = () => React.act(async () => { for (let i = 0; i < 5; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); });
const irPara = (caminho: string) => janela().history.replaceState(null, "", caminho);
const lembrado = (area: string) => janela().localStorage.getItem(`minerador-key:grupo-ativo:${MARCA}:${area}`);

function limpar(caminho = `/adalbapro--${MARCA}/minerador`) {
  estado.resetEditorialGroupAreaStoreForTests();
  janela().localStorage.clear();
  chamadas.length = 0;
  roteiro = () => "pendente";
  irPara(caminho);
}

const gruposDoServidor = (...grupos: ReturnType<typeof resumo>[]) => (url: string, method: string): Resposta =>
  method === "GET" && url.startsWith("/api/editorial/groups?") ? { status: 200, body: { success: true, available: true, groups: grupos, ungroupedKeywordCount: 4 } } : "pendente";

/** Renderiza um hook e devolve sempre o último valor. */
function sonda<T>(usar: () => T) {
  const caixa: { atual: T | null } = { atual: null };
  function Sonda() {
    caixa.atual = usar();
    return null;
  }
  return { caixa, elemento: React.createElement(Sonda) };
}

/* ================================ domínio puro ================================ */

test("URL e lembrança · cor, sem-grupo, todos e uuid antigo; lixo é ignorado", () => {
  assert.equal(dominio.parseEditorialGroupChoice("laranja"), "laranja");
  assert.equal(dominio.parseEditorialGroupChoice(" LARANJA "), "laranja");
  assert.equal(dominio.parseEditorialGroupChoice("sem-grupo"), "sem-grupo");
  assert.equal(dominio.parseEditorialGroupChoice("todos"), "todos");
  assert.deepEqual(dominio.parseEditorialGroupChoice(LARANJA_ID.toUpperCase()), { legacyGroupId: LARANJA_ID });
  assert.equal(dominio.parseEditorialGroupChoice("roxo"), null);
  assert.equal(dominio.parseEditorialGroupChoice(""), null);
  assert.equal(dominio.serializeEditorialGroupChoice("todos"), null, "\"Todos\" tira o parâmetro");
  assert.equal(dominio.editorialGroupChoiceFromLegacyId(AZUL_ID, [resumo(AZUL_ID, "planos", "azul")]), "azul");
  assert.equal(dominio.editorialGroupChoiceFromLegacyId(AZUL_ID, [resumo(AZUL_ID, "planos", "azul", "archived")]), "todos", "arquivado volta a Todos (D12)");
  assert.equal(dominio.editorialGroupAreaStorageKey(MARCA, "radar"), `minerador-key:grupo-ativo:${MARCA}:radar`);
  assert.equal(dominio.editorialGroupsCacheStorageKey(MARCA), `minerador-key:grupos:${MARCA}`);
});

test("recorte da cor · todos os grupos ATIVOS da cor; sem lista ainda, só a cor espera", () => {
  const grupos = [resumo(LARANJA_ID, "laranja", "laranja"), resumo(NOVO_LARANJA_ID, "Plano X", "laranja"), resumo(AZUL_ID, "planos", "azul", "archived")];
  assert.deepEqual(dominio.resolveEditorialGroupScreenFilter("todos", null), { pending: false, filter: { kind: "all" } });
  assert.deepEqual(dominio.resolveEditorialGroupScreenFilter("sem-grupo", null), { pending: false, filter: { kind: "none" } });
  assert.equal(dominio.resolveEditorialGroupScreenFilter("laranja", null).pending, true);
  assert.deepEqual(dominio.resolveEditorialGroupScreenFilter("laranja", grupos).filter, { kind: "groups", color: "laranja", groupIds: [LARANJA_ID, NOVO_LARANJA_ID].sort() });
  assert.deepEqual(dominio.resolveEditorialGroupScreenFilter("azul", grupos).filter, { kind: "groups", color: "azul", groupIds: [] }, "arquivado não entra");
  const filtro = dominio.resolveEditorialGroupScreenFilter("laranja", grupos).filter;
  assert.equal(dominio.editorialGroupFilterMatches(filtro, NOVO_LARANJA_ID), true);
  assert.equal(dominio.editorialGroupFilterMatches(filtro, AZUL_ID), false);
  assert.equal(dominio.editorialGroupFilterMatches(filtro, null), false);
  assert.equal(dominio.editorialGroupChoiceKeeps("todos", "azul"), true);
  assert.equal(dominio.editorialGroupChoiceKeeps("laranja", "laranja"), true);
  assert.equal(dominio.editorialGroupChoiceKeeps("laranja", null), false);
  assert.equal(dominio.editorialGroupChoiceKeeps("sem-grupo", null), true);
  assert.equal(dominio.editorialGroupCustomName("laranja", grupos), "Plano X", "o nome que é só a cor não aparece");
  assert.equal(dominio.editorialGroupNameForColor("laranja", [{ name: "Laranja" }]), "Laranja 2");
  assert.deepEqual(dominio.parseEditorialGroupsCache("{lixo"), null);
  assert.deepEqual(dominio.parseEditorialGroupsCache(JSON.stringify([{ id: LARANJA_ID, color: "roxo", name: "x", status: "active" }, { id: AZUL_ID, color: "azul", name: "planos", status: "active", extra: 1 }])), [{ id: AZUL_ID, color: "azul", name: "planos", status: "active" }]);
  assert.equal(dominio.canEnsureEditorialGroupColor({ permissions: [] }), false, "sem permissão não garante cor");
  assert.equal(dominio.canEnsureEditorialGroupColor({ permissions: ["minerador:view", "radar:view"] }), false, "só ver não basta");
  for (const modulo of ["minerador", "arquiteto", "radar"]) assert.equal(dominio.canEnsureEditorialGroupColor({ permissions: [`${modulo}:edit`] }), true);
  assert.equal(dominio.canEnsureEditorialGroupColor({ isGlobalAdmin: true, permissions: [] }), true);
});

/* ============================ escolha por área ============================ */

test("independência · escolher Laranja no Minerador não mexe no Arquiteto nem no Radar; cada área lembra a sua", async () => {
  limpar();
  const tela = await harness.montarRadar();
  await tela.render(React.createElement("div", null,
    React.createElement("div", { "data-area": "minerador" }, React.createElement(TopbarGroupTag, { brandId: MARCA, area: "minerador" })),
    React.createElement("div", { "data-area": "arquiteto" }, React.createElement(TopbarGroupTag, { brandId: MARCA, area: "arquiteto" })),
    React.createElement("div", { "data-area": "radar" }, React.createElement(TopbarGroupTag, { brandId: MARCA, area: "radar" }))));
  const botao = (area: string) => tela.container.querySelector(`[data-area='${area}'] [data-editorial-group-selector]`) as HTMLElement;
  await tela.click(botao("minerador"));
  await tela.click(documento().querySelector("[data-group-choice='laranja']") as HTMLElement);
  assert.equal(botao("minerador").getAttribute("data-group-tag-color"), "laranja");
  assert.equal(botao("arquiteto").getAttribute("data-group-tag-color"), "todos");
  assert.equal(botao("radar").getAttribute("data-group-tag-color"), "todos");
  await tela.click(botao("radar"));
  await tela.click(documento().querySelector("[data-group-choice='sem-grupo']") as HTMLElement);
  assert.equal(lembrado("minerador"), "laranja", "a lembrança guarda a COR");
  assert.equal(lembrado("radar"), "sem-grupo");
  assert.equal(lembrado("arquiteto"), null);
  assert.equal(new URL(janela().location.href).searchParams.get("grupo"), "laranja", "a URL é a da página aberta (Minerador)");
  assert.ok(!chamadas.some(chamada => chamada.method !== "GET"), "filtrar nunca escreve");
  tela.destroy();

  // Lembrança: a memória do módulo zera (nova aba), o armazenamento local fica.
  estado.resetEditorialGroupAreaStoreForTests();
  irPara(`/adalbapro--${MARCA}/arquiteto`);
  const outra = await harness.montarRadar();
  await outra.render(React.createElement("div", null,
    React.createElement("div", { "data-area": "minerador" }, React.createElement(TopbarGroupTag, { brandId: MARCA, area: "minerador" })),
    React.createElement("div", { "data-area": "radar" }, React.createElement(TopbarGroupTag, { brandId: MARCA, area: "radar" }))));
  const botaoNovo = (area: string) => outra.container.querySelector(`[data-area='${area}'] [data-editorial-group-selector]`) as HTMLElement;
  assert.equal(botaoNovo("minerador").getAttribute("data-group-tag-color"), "laranja");
  assert.equal(botaoNovo("radar").getAttribute("data-group-tag-color"), "sem-grupo");
  outra.destroy();
});

test("URL · ?grupo=<cor> vale na área da página aberta (sem virar lembrança); as outras áreas ignoram", async () => {
  limpar(`/adalbapro--${MARCA}/radar?grupo=azul`);
  janela().localStorage.setItem(`minerador-key:grupo-ativo:${MARCA}:radar`, "verde");
  janela().localStorage.setItem(`minerador-key:grupo-ativo:${MARCA}:minerador`, "lima");
  const radar = sonda(() => estado.useAreaGroupFilter(MARCA, "radar"));
  const minerador = sonda(() => estado.useAreaGroupFilter(MARCA, "minerador"));
  const tela = await harness.montarRadar();
  await tela.render(React.createElement("div", null, radar.elemento, minerador.elemento));
  assert.equal(radar.caixa.atual!.choice, "azul", "a URL manda na página aberta");
  assert.equal(minerador.caixa.atual!.choice, "lima", "outra área segue a própria lembrança");
  assert.equal(lembrado("radar"), "verde", "abrir um link não troca a lembrança");
  await React.act(async () => { radar.caixa.atual!.setChoice("sem-grupo"); });
  assert.equal(new URL(janela().location.href).searchParams.get("grupo"), "sem-grupo");
  await React.act(async () => { radar.caixa.atual!.setChoice("todos"); });
  assert.equal(new URL(janela().location.href).searchParams.get("grupo"), null, "\"Todos\" tira o parâmetro");
  tela.destroy();
});

test("URL · o uuid antigo vira a cor do grupo quando a lista chega, e a URL passa a dizer a cor", async () => {
  limpar(`/adalbapro--${MARCA}/arquiteto?grupo=${AZUL_ID}`);
  roteiro = gruposDoServidor(resumo(AZUL_ID, "planos", "azul"));
  const arquiteto = sonda(() => estado.useAreaGroupFilter(MARCA, "arquiteto"));
  const tela = await harness.montarRadar();
  await tela.render(arquiteto.elemento);
  await esperar();
  assert.equal(arquiteto.caixa.atual!.choice, "azul");
  assert.deepEqual(arquiteto.caixa.atual!.filter, { kind: "groups", color: "azul", groupIds: [AZUL_ID] });
  assert.equal(new URL(janela().location.href).searchParams.get("grupo"), "azul");
  tela.destroy();
});

/* ======================= lista de grupos: uma vez, por trás ======================= */

test("lista de grupos · uma leitura por marca para as três áreas; o cache local entra na hora", async () => {
  limpar();
  janela().localStorage.setItem(`minerador-key:grupos:${MARCA}`, JSON.stringify([{ id: LARANJA_ID, color: "laranja", name: "laranja", status: "active" }]));
  roteiro = () => "pendente";
  const sondas = (["minerador", "arquiteto", "radar"] as const).map(area => sonda(() => estado.useAreaGroupFilter(MARCA, area)));
  const tela = await harness.montarRadar();
  await tela.render(React.createElement("div", null, ...sondas.map(item => item.elemento)));
  await esperar();
  assert.equal(chamadas.filter(chamada => chamada.url.startsWith("/api/editorial/groups?")).length, 1, "uma requisição para as três");
  assert.equal(chamadas.filter(chamada => chamada.url.includes("/groups/articles")).length, 0, "a etiqueta nunca lê os artigos");
  assert.equal(sondas[0].caixa.atual!.groups.source, "cache");
  assert.equal(sondas[0].caixa.atual!.groups.groups[0].id, LARANJA_ID);
  tela.destroy();
});

/* ======================= Minerador: carregar sem esperar ======================= */

test("Minerador · com \"Todos\" e \"Sem grupo\" a planilha carrega na hora, sem esperar os grupos", async () => {
  limpar();
  roteiro = () => "pendente"; // a lista de grupos nunca chega
  const hook = sonda(() => useMineradorGroups({ brandId: MARCA, enabled: true }));
  const tela = await harness.montarRadar();
  await tela.render(hook.elemento);
  assert.equal(hook.caixa.atual!.ready, true, "Todos: carrega já");
  assert.equal(hook.caixa.atual!.filterKey, "todos");
  await React.act(async () => { hook.caixa.atual!.setChoice("sem-grupo"); });
  assert.equal(hook.caixa.atual!.ready, true, "Sem grupo: carrega já");
  assert.deepEqual(hook.caixa.atual!.filter, { kind: "none" });
  await React.act(async () => { hook.caixa.atual!.setChoice("laranja"); });
  assert.equal(hook.caixa.atual!.ready, false, "cor sem cache nenhum: espera a lista");
  tela.destroy();
});

test("Minerador · a cor resolve pelo cache na hora; cor sem grupo = vazio com aviso; cache errado se corrige", async () => {
  limpar();
  janela().localStorage.setItem(`minerador-key:grupo-ativo:${MARCA}:minerador`, "laranja");
  janela().localStorage.setItem(`minerador-key:grupos:${MARCA}`, JSON.stringify([{ id: LARANJA_ID, color: "laranja", name: "laranja", status: "active" }]));
  let liberar: (() => void) | null = null;
  roteiro = (url, method) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) {
      return liberar ? { status: 200, body: { success: true, groups: [resumo(NOVO_LARANJA_ID, "laranja", "laranja")], ungroupedKeywordCount: 0 } } : "pendente";
    }
    return "pendente";
  };
  const hook = sonda(() => useMineradorGroups({ brandId: MARCA, enabled: true }));
  const tela = await harness.montarRadar();
  await tela.render(hook.elemento);
  assert.equal(hook.caixa.atual!.ready, true, "o cache resolve a cor sem esperar o servidor");
  assert.deepEqual(hook.caixa.atual!.filter, { kind: "groups", color: "laranja", groupIds: [LARANJA_ID] });
  const chaveDoCache = hook.caixa.atual!.filterKey;
  await React.act(async () => { hook.caixa.atual!.setChoice("azul"); });
  assert.deepEqual(hook.caixa.atual!.filter, { kind: "groups", color: "azul", groupIds: [] }, "Azul sem grupo: nada a consultar");
  assert.equal(hook.caixa.atual!.emptyLabel, "Nenhuma keyword na cor Azul ainda");
  await React.act(async () => { hook.caixa.atual!.setChoice("laranja"); });
  // O servidor diz que o grupo laranja é outro: a chave da carga muda e a planilha relê uma vez.
  liberar = () => undefined;
  await React.act(async () => { await estado.refreshBrandEditorialGroups(MARCA); });
  assert.deepEqual(hook.caixa.atual!.filter, { kind: "groups", color: "laranja", groupIds: [NOVO_LARANJA_ID] });
  assert.notEqual(hook.caixa.atual!.filterKey, chaveDoCache);
  assert.match(janela().localStorage.getItem(`minerador-key:grupos:${MARCA}`) || "", new RegExp(NOVO_LARANJA_ID), "o cache de apresentação é corrigido");
  tela.destroy();
});

test("Minerador · mover para uma cor garante o grupo dela antes (só ao mover)", async () => {
  limpar();
  let criado = false;
  roteiro = (url, method, body) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) return { status: 200, body: { success: true, groups: criado ? [resumo(NOVO_LARANJA_ID, "Laranja", "laranja")] : [], ungroupedKeywordCount: 3 } };
    if (method === "POST" && url === "/api/editorial/groups") { criado = true; return { status: 200, body: { success: true, outcome: "created", group: resumo(NOVO_LARANJA_ID, "Laranja", (body as { color: "laranja" }).color) } }; }
    return "pendente";
  };
  const hook = sonda(() => useMineradorGroups({ brandId: MARCA, enabled: true }));
  const tela = await harness.montarRadar();
  await tela.render(hook.elemento);
  await esperar();
  await React.act(async () => { hook.caixa.atual!.setChoice("laranja"); });
  assert.ok(!chamadas.some(chamada => chamada.method === "POST"), "escolher a cor para filtrar não escreve");
  let garantido: Awaited<ReturnType<NonNullable<typeof hook.caixa.atual>["ensureColorGroup"]>> | null = null;
  await React.act(async () => { garantido = await hook.caixa.atual!.ensureColorGroup("laranja"); });
  assert.deepEqual(chamadas.find(chamada => chamada.method === "POST")?.body, { marcaId: MARCA, color: "laranja" }, "sem nome: o servidor garante o grupo da cor");
  assert.equal(garantido!.ok, true);
  assert.equal(hook.caixa.atual!.groupById.get(NOVO_LARANJA_ID)?.color, "laranja", "o grupo novo entra na lista (e a releitura confirma)");
  assert.deepEqual(hook.caixa.atual!.filter, { kind: "groups", color: "laranja", groupIds: [NOVO_LARANJA_ID] }, "a visão da cor passa a ler o grupo garantido");
  tela.destroy();
});

/* ======================= Arquiteto/Radar: leitura pesada adiada ======================= */

test("Arquiteto/Radar · com \"Todos\" a leitura dos artigos espera a mesa; com uma cor, começa na hora", async () => {
  limpar(`/adalbapro--${MARCA}/radar`);
  roteiro = (url, method) => {
    if (method === "GET" && url.startsWith("/api/editorial/groups?")) return { status: 200, body: { success: true, groups: [resumo(LARANJA_ID, "laranja", "laranja")], ungroupedKeywordCount: 0 } };
    if (method === "GET" && url.startsWith("/api/editorial/groups/articles?")) return { status: 200, body: { success: true, articles: [{ articleId: "a1", groupId: LARANJA_ID, origin: "subject", persisted: false, conflict: false }] } };
    return "pendente";
  };
  const artigos = () => chamadas.filter(chamada => chamada.url.startsWith("/api/editorial/groups/articles?")).length;
  let mesaPronta = false;
  const hook = sonda(() => useEditorialGroups({ brandId: MARCA, enabled: true, area: "radar", mainReady: mesaPronta }));
  const tela = await harness.montarRadar();
  await tela.render(hook.elemento);
  await esperar();
  assert.equal(artigos(), 0, "carregamento inicial com Todos: nada de leitura pesada em paralelo");
  assert.equal(hook.caixa.atual!.available, true, "a etiqueta e o rodapé já existem");
  mesaPronta = true;
  await tela.render(sonda(() => null).elemento);
  await tela.render(hook.elemento);
  await esperar();
  assert.equal(artigos(), 1, "depois da mesa, uma leitura");
  assert.equal(hook.caixa.atual!.articleGroupById.get("a1")?.groupId, LARANJA_ID);
  tela.destroy();

  // Com uma cor já escolhida (outra marca de sessão zerada), a leitura não espera a mesa.
  limpar(`/adalbapro--${MARCA}/radar?grupo=laranja`);
  roteiro = () => "pendente";
  const comCor = sonda(() => useEditorialGroups({ brandId: MARCA, enabled: true, area: "radar", mainReady: false }));
  const outra = await harness.montarRadar();
  await outra.render(comCor.elemento);
  await esperar();
  assert.equal(artigos(), 1, "cor escolhida: lê os artigos já, sem esperar a mesa");
  const filtro = comCor.caixa.atual!.filter;
  assert.equal(dominio.editorialGroupFilterMatches(filtro, LARANJA_ID), false, "enquanto os artigos não chegam, o recorte não mostra nada…");
  assert.equal(dominio.editorialGroupFilterMatches(filtro, null), false, "…nem tudo por engano");
  outra.destroy();
});

/* ============================== mover e plano por cor ============================== */

test("rodapé dos artigos · as 5 cores sempre, com o nome próprio; e voltar ao grupo das keywords", async () => {
  const movidos: Array<string | null> = [];
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(ArticleGroupMoveSelect, { groups: [resumo(AZUL_ID, "planos", "azul")], onMove: (cor: string | null) => movidos.push(cor) }));
  const select = tela.container.querySelector("[data-article-group-move]") as HTMLSelectElement;
  const opcoes = [...select.querySelectorAll("option")].map(opcao => opcao.textContent);
  assert.deepEqual(opcoes, ["Grupo", "Mover para Amarelo", "Mover para Azul (planos)", "Mover para Verde", "Mover para Lima", "Mover para Laranja", "Voltar ao grupo das keywords"]);
  await tela.select(select, "azul");
  await tela.select(select, "__voltar_ao_grupo_das_keywords__");
  assert.deepEqual(movidos, ["azul", null]);
  tela.destroy();
});

test("plano do Silo · escolhe a COR: cor com grupo vai para ele; cor sem grupo nasce com o nome do Silo", async () => {
  limpar();
  roteiro = () => ({ status: 422, body: { success: false, code: "PLAN_INVALID", message: "só o pedido interessa aqui" } });
  const tela = await harness.montarRadar();
  await tela.render(React.createElement(DeclaredPlanImportDialog, { brandId: MARCA, groups: [resumo(LARANJA_ID, "laranja", "laranja")], onClose: nada, onApplied: nada, onUnavailable: nada }));
  assert.equal(documento().querySelector("[data-minerador-declared-plan-dialog] input:not([type='radio'])"), null, "nada para escrever além do plano");
  assert.match(documento().querySelector("[data-declared-plan-color='laranja']")?.textContent || "", /grupo existente: laranja/);
  assert.match(documento().querySelector("[data-declared-plan-color='azul']")?.textContent || "", /grupo novo, com o nome do Silo/);
  await tela.type(documento().querySelector("[data-minerador-declared-plan-dialog] textarea") as HTMLElement, "Silo 1 — Planos\n1. Artigo\nPalavra-chave: plano");
  const gerar = () => [...documento().querySelectorAll("button")].find(botao => /Gerar prévia/.test(botao.textContent || "")) as HTMLElement;
  await tela.click(documento().querySelector("[data-declared-plan-color='laranja'] input") as HTMLElement);
  await tela.click(gerar());
  await esperar();
  assert.deepEqual((chamadas.at(-1)!.body as { group: unknown }).group, { mode: "existing", groupId: LARANJA_ID });
  await tela.click(documento().querySelector("[data-declared-plan-color='azul'] input") as HTMLElement);
  await tela.click(gerar());
  await esperar();
  assert.deepEqual((chamadas.at(-1)!.body as { group: unknown }).group, { mode: "new", name: null, color: "azul" });
  tela.destroy();
});
