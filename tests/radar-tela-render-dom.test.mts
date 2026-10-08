import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * ====== 2026-10-08 · A TELA DO RADAR INTEIRA: RÁPIDA, E NUNCA COM DADO VELHO ======
 *
 * O dono: "o selector e o scroll estão muito lentos … parece um computador dos
 * anos 80". Medido na bancada do scratchpad (25 artigos, 36 links por página):
 * clicar numa linha custava de 15 s a 6 min, um aviso publicado ~10 s, e a
 * área Especialista aberta prendia a thread num laço de render.
 *
 * Aqui a tela é montada INTEIRA — RadarPage real, centro de avisos real,
 * topbar real —, com a marca, a sessão e a mesa trocadas por fixture
 * (`tests/stubs/radar-tela-hooks.mjs`, registrado por este arquivo). Cada
 * chamada de `buildRadarDeepResearchView` é contada.
 *
 * O ORÁCULO DE "DADO VELHO": depois de cada ação, o texto da tela é comparado
 * com o de uma releitura FRIA — a mesma mesa com todos os itens clonados, o
 * que obriga cada linha a recalcular tudo do zero. Memória que servisse uma
 * view guardada de outra entrada mostraria um texto diferente do frio.
 *
 *   · trocar de artigo e marcar checkbox: 0 recálculo da view;
 *   · versão nova gravada e seleção nova: só a linha mudada recalcula, e a
 *     tela mostra a amostra nova;
 *   · área Especialista aberta e ociosa: a tela assenta (sem laço);
 *   · aviso publicado: o RadarPage não renderiza.
 *
 * Nenhuma rede: o `fetch` recusa tudo. PROVIDER_CALLS = 0.
 */

register("./stubs/radar-tela-hooks.mjs", import.meta.url, { data: { stubs: ["navegacao", "mesa", "contagem"] } });

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => { tentativasDeRede.push(String(entrada)); return Promise.reject(new Error("REDE PROIBIDA")); },
  writable: true, configurable: true,
});

const harness = await import("./radar-dom-harness.mts");
const React = harness.React;
const { montarMesa, MARCA } = await import("./radar-tela-render-fixtures.mts");

const mesa = montarMesa({ total: 4, analisados: 2, soSerp: 1 });
const ATOR = "11111111-2222-4333-8444-555555555555";
const brandRef = `adalbapro--${MARCA}`;
type Mesa = Record<string, unknown> & { radarItems: Array<Record<string, unknown>>; serpRecords: unknown[] };
let pipeline: Mesa;
const ouvintes = new Set<() => void>();
const store = {
  get: () => pipeline,
  subscribe: (ouvinte: () => void) => { ouvintes.add(ouvinte); return () => { ouvintes.delete(ouvinte); }; },
  set: (mudanca: Partial<Mesa>) => { pipeline = { ...pipeline, ...mudanca } as Mesa; ouvintes.forEach(ouvinte => ouvinte()); },
};
const nada = () => undefined;
const nadaAsync = async () => undefined;
pipeline = {
  radarItems: mesa.radarItems, serpRecords: mesa.serpRecords, serpReviews: [], serpMergeConflicts: [],
  articleVersions: mesa.articleVersions, siloVersions: mesa.siloVersions, siloPageVersions: {}, versionEvents: [],
  operationalPublications: [], publications: [], productEvidence: [], documents: {}, documentLocks: {}, invitations: [], backgroundTasks: [], moduleState: {},
  snapshot: { keywords: mesa.keywords, silos: mesa.silos, marca: { id: MARCA } },
  loading: false, error: null, localRecoveryWarning: null, serpReviewReadbackSnapshotIds: [],
  loadDiagnostics: { state: "complete", loadedCount: 4, incompatible: [] }, persistenceMode: "server", serpPersistenceMode: "server",
  reload: nadaAsync, reloadOperational: nadaAsync, reloadRadarAnalysis: nadaAsync, reloadSerpReview: nadaAsync,
  restoreOperationalSnapshot: nada, saveRadarAnalysis: nadaAsync, readRemoteRadarAnalyses: nadaAsync, updateRadarState: nadaAsync,
  reviewSerp: nadaAsync, recoverSerp: nadaAsync, importApprovedToRadar: nadaAsync, collectSerp: nadaAsync, collectAuxiliarySerp: nadaAsync,
};
const contagem = { views: 0 };
(globalThis as Record<string, unknown>).__radarTela = {
  React, store, contagem,
  pathname: `/${brandRef}/radar`,
  brand: { selectedBrandId: MARCA, setSelectedBrandId: nada, brands: [], refreshBrands: nadaAsync, activeBrand: null, activeBrandRef: brandRef, loading: false, userRole: "owner", profileLoading: false },
  session: { data: { user: { id: ATOR, email: "dono@exemplo.test", name: "Dono", image: null } }, status: "authenticated", actorUserId: ATOR, sessionEpoch: 1, setPresentationOverride: nada, signOut: nadaAsync },
};

const { RadarPage } = await import("../modules/radar/radar-page.tsx");
const { GlobalNoticeProvider, useNoticeCenter } = await import("../components/global-notice-center.tsx");
const { GlobalTopbarControlsProvider } = await import("../components/global-topbar.tsx");

let commits = 0;
let publicar: ((texto: string) => void) | null = null;
function Publicador() {
  const { publishNotice } = useNoticeCenter();
  publicar = texto => { publishNotice({ severity: "INFO", title: "Radar", message: texto, source: "workflow", module: "radar", area: "Radar" }); };
  return null;
}
const tela = await harness.montarRadar();
const arvore = harness.comProductShell(
  React.createElement(GlobalNoticeProvider, null,
    React.createElement(GlobalTopbarControlsProvider, null,
      React.createElement(Publicador),
      React.createElement(React.Profiler, { id: "radar", onRender: () => { commits += 1; } }, React.createElement(RadarPage, { brandRef })))));

const act = (fazer: () => void | Promise<void>) => React.act(async () => { await fazer(); });
const linhas = () => [...tela.container.querySelectorAll("section[aria-label='Planilha radar'] tbody tr[tabindex]")] as HTMLElement[];
const caixas = () => [...tela.container.querySelectorAll("section[aria-label='Planilha radar'] tbody input[type=checkbox]")] as HTMLInputElement[];
const textoDaTela = () => (tela.container.textContent || "").replace(/\s+/g, " ").trim();
const itemDe = (indice: number) => pipeline.radarItems[indice];
const trocarItem = (indice: number, novo: Record<string, unknown>) => store.set({ radarItems: pipeline.radarItems.map((item, k) => k === indice ? novo : item) });

/** A releitura fria: os mesmos itens, clonados — a memória não tem nada para devolver. */
async function textoFrio(): Promise<{ texto: string; views: number }> {
  const antes = contagem.views;
  await act(() => { store.set({ radarItems: pipeline.radarItems.map(item => ({ ...item })) }); });
  return { texto: textoDaTela(), views: contagem.views - antes };
}

async function medirViews(fazer: () => void | Promise<void>): Promise<number> {
  const antes = contagem.views;
  await act(fazer);
  return contagem.views - antes;
}

test("montagem: cada linha monta a investigação uma vez, mesmo com vários renders", async () => {
  const views = await medirViews(async () => { await tela.render(arvore); });
  assert.equal(linhas().length, 4);
  assert.ok(commits >= 2, "a montagem renderiza mais de uma vez — é isso que a memória poupa");
  assert.equal(views, 4, `esperava 1 view por linha, vieram ${views}`);
});

test("trocar de artigo: nenhuma view recalculada, e a tela é a mesma de uma releitura fria", async () => {
  for (const indice of [1, 2, 0]) {
    const views = await medirViews(() => { (linhas()[indice].querySelector("td:nth-child(4)") as HTMLElement).click(); });
    assert.equal(views, 0, `clicar na linha ${indice} recalculou ${views} view(s)`);
    assert.equal(linhas()[indice].getAttribute("aria-current"), "true", "a linha clicada não ficou ativa");
    const quente = textoDaTela();
    const frio = await textoFrio();
    assert.equal(frio.views, 4, "a releitura fria precisa recalcular todas as linhas");
    assert.equal(quente, frio.texto, `a linha ${indice} mostrou algo diferente da releitura fria`);
  }
});

test("checkbox: nenhuma view recalculada, tela igual à fria", async () => {
  const views = await medirViews(() => { caixas()[1].click(); });
  assert.equal(views, 0);
  assert.equal(textoDaTela(), (await textoFrio()).texto);
});

test("versão nova gravada: só a linha mudada recalcula, e a tela mostra a amostra NOVA", async () => {
  /* A linha 0 está ativa; abrir o card da Pesquisa mostra "N analisada(s) · M falha(s)". */
  await act(() => { tela.get("radar-r3-card-pesquisa").click(); });
  const card = () => tela.get("radar-r3-card-pesquisa").textContent || "";
  /*
   * 2026-10-08 · revisão (F2): a amostra conta só as páginas da SELEÇÃO. A 5ª
   * página da fixture é de uma referência "format" — fora da seleção
   * analisável —, então ela fica como cache e não como analisada: 12 extraídas
   * dão 11 analisadas (e 8 dão 7). Antes o card dizia 12 analisadas + 1 falha
   * para 12 selecionadas.
   */
  assert.match(card(), /11 analisada\(s\) · 1 falha\(s\)/, "a amostra inicial da linha ativa não apareceu");
  const views = await medirViews(() => { trocarItem(0, mesa.novaVersao(itemDe(0), { extraidas: 8, falhas: 2 })); });
  assert.equal(views, 1, `uma linha mudou, ${views} view(s) recalculada(s)`);
  assert.match(card(), /7 analisada\(s\) · 2 falha\(s\)/, "a versão nova não chegou à tela");
  assert.doesNotMatch(card(), /11 analisada\(s\)/, "a tela ainda mostra a amostra anterior");
  assert.equal(textoDaTela(), (await textoFrio()).texto);
});

test("seleção nova (curadoria mudada): só a linha mudada recalcula, e a tela é a da seleção nova", async () => {
  const antes = textoDaTela();
  const views = await medirViews(() => { trocarItem(0, mesa.novaSelecao(itemDe(0), (_url, indice) => indice % 2 === 0)); });
  assert.equal(views, 1);
  const depois = textoDaTela();
  assert.notEqual(depois, antes, "a seleção mudou e a tela não");
  assert.equal(depois, (await textoFrio()).texto);
});

test("aviso publicado no centro de avisos: o RadarPage não renderiza", async () => {
  /* Assenta o que ainda estiver em voo (leituras recusadas das áreas) antes de contar. */
  await act(() => new Promise(resolve => setTimeout(resolve, 50)));
  const antes = commits;
  const views = await medirViews(() => {
    publicar?.("Analisando páginas 5 de 6…");
    publicar?.("Analisando páginas 6 de 6…");
    publicar?.("17 selecionada(s) · 12 analisada(s) · 5 sem acesso.");
  });
  assert.equal(commits - antes, 0, "quem só publica voltou a renderizar a cada aviso");
  assert.equal(views, 0);
});

test("área Especialista aberta e ociosa: a tela assenta (sem laço de render)", async () => {
  await act(() => { tela.get("radar-r3-card-especialista").click(); });
  const global = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean };
  global.IS_REACT_ACT_ENVIRONMENT = false;
  const errosOriginais = console.error;
  console.error = () => undefined;
  try {
    /* Deixa o primeiro aviso do painel assentar; depois, 1,5 s parado. */
    await new Promise(resolve => setTimeout(resolve, 300));
    const antes = commits;
    const viewsAntes = contagem.views;
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.ok(commits - antes <= 2, `${commits - antes} commit(s) em 1,5 s com a área parada — o laço voltou`);
    assert.equal(contagem.views - viewsAntes, 0);
  } finally {
    console.error = errosOriginais;
    global.IS_REACT_ACT_ENVIRONMENT = true;
  }
});

test("nenhuma chamada a provider: a rede só viu leituras recusadas da própria API", () => {
  for (const alvo of tentativasDeRede) assert.match(alvo, /^\/api\//, `rede fora da API local: ${alvo}`);
  tela.destroy();
});
