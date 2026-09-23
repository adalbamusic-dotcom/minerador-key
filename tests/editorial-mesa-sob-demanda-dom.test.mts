import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * ======  E2 · A MESA EDITORIAL SÓ É LIDA QUANDO ALGUÉM A USA  ==============
 *
 * `EditorialPipelineProvider` continua no layout raiz. Antes, toda carga fria
 * — `/admin`, `/conta`, `/agencias`, o Minerador — disparava `/api/inteligencia`
 * e `/api/editorial/workspace` (~8 MB, SDD de egress 2026-09-23, E2). Agora a
 * leitura espera o primeiro `useEditorialPipeline()` montado.
 *
 * Provado aqui com o provider REAL, renderizado no DOM:
 *   1. sem consumidor, nenhuma leitura e nenhuma abertura da cópia local;
 *   2. o primeiro consumidor dispara exatamente uma leitura de cada rota e
 *      recebe o contexto — "carregando" antes, snapshot depois, nunca "vazio";
 *   3. navegar entre telas preserva o estado e não relê;
 *   4. trocar de consumidor com a leitura em voo não duplica (R13);
 *   5. Strict Mode não duplica (R13);
 *   6. fora do provider, o hook falha igual a antes.
 *
 * Nenhuma rede: `fetch` é substituído e registra cada chamada.
 * Rodar: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning
 *   --experimental-loader ./tests/stubs/mesa-sob-demanda-loader.mjs --test tests/editorial-mesa-sob-demanda-dom.test.mts
 */

type Pendente = { url: string; responder: () => void };
const chamadas: string[] = [];
let pendentes: Pendente[] = [];
let automatico = true;
/* Quando ligado, `/api/inteligencia` responde 500 com `{ error }`. */
let inteligenciaFalha = false;

const snapshotDaMarca = (brandId: string) => ({
  brand: { id: brandId, nome: `Marca ${brandId}`, site_url: null, nicho: null, localizacao: null, dna_diretrizes: null, silos_existentes: null, created_at: null },
  silos: [], keywords: [], briefings: [], loadedAt: "2026-09-23T10:00:00.000Z",
});
const workspaceVazio = () => ({
  mode: "server", radarItems: [], plannerItems: [], articleVersions: [], siloVersions: [], versionEvents: [], contentPlans: [],
  documents: [], publications: [], invitations: [], views: [],
  loadedAt: "2026-09-23T10:00:00.000+00:00",
});

function corpoPara(url: string) {
  const marca = new URL(url, "http://localhost").searchParams.get("marcaId") || "";
  if (url.startsWith("/api/inteligencia") && inteligenciaFalha) return { error: "falha simulada" };
  if (url.startsWith("/api/inteligencia")) return { data: snapshotDaMarca(marca) };
  if (url.startsWith("/api/editorial/workspace")) return { data: workspaceVazio() };
  return { error: `rota inesperada no teste: ${url}` };
}

Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    const url = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    chamadas.push(url);
    const status = inteligenciaFalha && url.startsWith("/api/inteligencia") ? 500 : 200;
    const resposta = () => new Response(JSON.stringify(corpoPara(url)), { status, headers: { "Content-Type": "application/json" } });
    if (automatico) return Promise.resolve(resposta());
    return new Promise(resolve => { pendentes.push({ url, responder: () => resolve(resposta()) }); });
  },
  writable: true, configurable: true,
});

const estado = { brand: { selectedBrandId: "marca-1" as string | null }, session: { actorUserId: "ator-1" as string | null, sessionEpoch: 1 } };
Object.defineProperty(globalThis, "__mesaSobDemanda", { value: estado, writable: true, configurable: true });

const leiturasDaCopiaLocal: string[] = [];
const renderizacoes: string[] = [];
const armazenamento = (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage;
/* O Storage do happy-dom é um proxy: atribuir na instância é ignorado; o espião vai no protótipo. */
const prototipoDoStorage = Object.getPrototypeOf(armazenamento) as { getItem: (this: Storage, chave: string) => string | null };
const getItemOriginal = prototipoDoStorage.getItem;
prototipoDoStorage.getItem = function (this: Storage, chave: string) { leiturasDaCopiaLocal.push(chave); return getItemOriginal.call(this, chave); };

const { EditorialPipelineProvider, useEditorialPipeline } = await import("../components/editorial-pipeline-context.tsx");
const h = React.createElement;

/* Uma tela editorial: lê o contexto como Radar, Redator e Arquiteto leem. */
function TelaDaMesa({ nome }: { nome: string }) {
  const mesa = useEditorialPipeline();
  const situacao = mesa.snapshot ? `snapshot:${mesa.snapshot.brand.id}` : mesa.loading ? "carregando" : `vazio:${mesa.error || ""}`;
  renderizacoes.push(`${nome}|${situacao}`);
  return h("p", { "data-testid": "mesa" }, `${nome}|${situacao}|${mesa.persistenceMode}`);
}
/* Uma tela sem mesa: Admin, Conta, Agências, Minerador. */
function TelaSemMesa() { return h("p", { "data-testid": "fora" }, "admin"); }

const comProvider = (filho: React.ReactElement) => h(EditorialPipelineProvider, null, filho);
const assentar = async (ms = 30) => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
const responderTudo = async () => {
  while (pendentes.length) {
    const lote = pendentes; pendentes = [];
    await React.act(async () => { lote.forEach(item => item.responder()); await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  await assentar();
};
const contar = (prefixo: string) => chamadas.filter(url => url.startsWith(prefixo)).length;

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => {
  chamadas.length = 0; pendentes = []; automatico = true; inteligenciaFalha = false; leiturasDaCopiaLocal.length = 0; renderizacoes.length = 0;
  estado.brand.selectedBrandId = "marca-1"; estado.session.actorUserId = "ator-1";
  tela = await montarRadar();
});
test.afterEach(() => { tela?.destroy(); tela = null; });

test("01 · rota sem mesa: o provider na raiz não lê nada e não abre a cópia local", async () => {
  await tela!.render(comProvider(h(TelaSemMesa)));
  await assentar(60);
  assert.equal(tela!.get("fora").textContent, "admin");
  assert.deepEqual(chamadas, [], "nenhuma leitura de /api/inteligencia nem /api/editorial/workspace");
  assert.deepEqual(leiturasDaCopiaLocal.filter(chave => chave.includes("workflow-recovery")), [], "a cópia local de 9 MB não é aberta");

  /* Trocar de marca numa tela sem mesa também não lê. */
  estado.brand.selectedBrandId = "marca-2";
  await tela!.render(comProvider(h(TelaSemMesa, { key: "outra" })));
  await assentar(60);
  assert.deepEqual(chamadas, []);
});

test("02 · o primeiro consumidor pede a mesa: uma leitura de cada rota, carregando antes, contexto depois", async () => {
  automatico = false;
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar" })));
  /* Antes de a leitura começar — o primeiro render, antes de qualquer efeito — já é carga. */
  assert.equal(renderizacoes[0], "radar|carregando", "o primeiro render do consumidor não mostra marca vazia");
  assert.ok(!renderizacoes.some(item => item.includes("vazio")), `nenhum render intermediário vazio: ${renderizacoes.join(" / ")}`);
  await assentar();
  assert.match(tela!.get("mesa").textContent || "", /^radar\|carregando\|/, "entre o pedido e a resposta é carga, não marca vazia");
  assert.deepEqual(chamadas, ["/api/inteligencia?marcaId=marca-1"]);
  await responderTudo();
  assert.deepEqual(chamadas, ["/api/inteligencia?marcaId=marca-1", "/api/editorial/workspace?marcaId=marca-1"]);
  assert.equal(tela!.get("mesa").textContent, "radar|snapshot:marca-1|server");
  assert.ok(leiturasDaCopiaLocal.some(chave => chave.includes("workflow-recovery")), "a recuperação local continua antes da leitura remota");
});

test("03 · navegar para fora e de volta preserva o estado e não relê", async () => {
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "arquiteto" })));
  await assentar();
  assert.equal(tela!.get("mesa").textContent, "arquiteto|snapshot:marca-1|server");
  assert.equal(chamadas.length, 2);

  await tela!.render(comProvider(h(TelaSemMesa)));
  await assentar();
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar" })));
  await assentar();
  assert.equal(tela!.get("mesa").textContent, "radar|snapshot:marca-1|server", "o snapshot já lido chega na hora");
  assert.equal(chamadas.length, 2, "nenhuma leitura nova ao voltar");
});

test("04 · trocar de consumidor com a leitura em voo não duplica a mesa (R13)", async () => {
  automatico = false;
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "arquiteto" })));
  await assentar();
  await tela!.render(comProvider(h(TelaSemMesa)));
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar", key: "radar" })));
  await assentar();
  await responderTudo();
  assert.equal(contar("/api/inteligencia"), 1);
  assert.equal(contar("/api/editorial/workspace"), 1);
  assert.equal(tela!.get("mesa").textContent, "radar|snapshot:marca-1|server");
});

test("05 · Strict Mode monta os efeitos duas vezes e a mesa é lida uma vez (R13)", async () => {
  await tela!.render(h(React.StrictMode, null, comProvider(h("div", null, h(TelaDaMesa, { nome: "redator" }), h(TelaDaMesa, { nome: "painel" })))));
  await assentar(60);
  assert.equal(contar("/api/inteligencia"), 1);
  assert.equal(contar("/api/editorial/workspace"), 1);
  assert.deepEqual(tela!.all("mesa").map(item => item.textContent), ["redator|snapshot:marca-1|server", "painel|snapshot:marca-1|server"]);
});

test("06 · trocar de marca com um consumidor vivo lê a nova marca, isolada", async () => {
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar" })));
  await assentar();
  estado.brand.selectedBrandId = "marca-2";
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar" })));
  await assentar(60);
  assert.deepEqual(chamadas, [
    "/api/inteligencia?marcaId=marca-1", "/api/editorial/workspace?marcaId=marca-1",
    "/api/inteligencia?marcaId=marca-2", "/api/editorial/workspace?marcaId=marca-2",
  ]);
  assert.equal(tela!.get("mesa").textContent, "radar|snapshot:marca-2|server", "nunca o snapshot da outra marca");
});

test("07 · sem sessão não há leitura nem carga fingida", async () => {
  estado.session.actorUserId = null;
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar" })));
  await assentar(60);
  assert.deepEqual(chamadas, []);
  assert.equal(tela!.get("mesa").textContent, "radar|vazio:|local_fallback");
});

test("08 · fora do provider o hook falha como antes", async () => {
  const erros: unknown[] = [];
  const erroOriginal = console.error;
  console.error = () => {};
  class Captura extends React.Component<{ children: React.ReactNode }, { falhou: boolean }> {
    state = { falhou: false };
    static getDerivedStateFromError() { return { falhou: true }; }
    componentDidCatch(erro: unknown) { erros.push(erro); }
    render() { return this.state.falhou ? h("p", { "data-testid": "falhou" }, "falhou") : this.props.children; }
  }
  try {
    await tela!.render(h(Captura, null, h(TelaDaMesa, { nome: "solto" })));
  } finally {
    console.error = erroOriginal;
  }
  assert.ok(tela!.query("falhou"));
  assert.match(String((erros[0] as Error)?.message), /useEditorialPipeline deve ser usado dentro de EditorialPipelineProvider/);
  assert.deepEqual(chamadas, []);
});

test("09 · o consumidor que sai deixa de pedir a mesa: trocar de marca numa tela sem mesa não lê a nova marca", async () => {
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar" })));
  await assentar();
  assert.equal(chamadas.length, 2);
  await tela!.render(comProvider(h(TelaSemMesa)));
  await assentar();
  estado.brand.selectedBrandId = "marca-2";
  await tela!.render(comProvider(h(TelaSemMesa, { key: "minerador" })));
  await assentar(60);
  assert.deepEqual(chamadas.slice(2), [], "o Minerador da marca 2 não paga a mesa");
  assert.ok(!leiturasDaCopiaLocal.some(chave => chave.endsWith(":marca-2")), "nem abre a cópia local da marca 2");
});

test("10 · leitura que falha sai de \"carregando\" e mostra o erro", async () => {
  inteligenciaFalha = true;
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar" })));
  await assentar(60);
  assert.equal(contar("/api/inteligencia"), 1);
  assert.match(tela!.get("mesa").textContent || "", /^radar\|vazio:falha simulada\|/, "erro assentado não é carga sem fim");
});

/* Um consumidor que grava versões na mesa ao montar, como o bootstrap canônico do Arquiteto. */
function TelaQueGravaVersoes() {
  const mesa = useEditorialPipeline();
  const { setArticleVersions } = mesa;
  React.useEffect(() => {
    setArticleVersions(atual => ({ ...atual, "artigo-canonico": { versionId: "v-canonica", payload: { articleId: "artigo-canonico", brandId: "marca-1" } } as never }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return h("p", { "data-testid": "versoes" }, Object.keys(mesa.articleVersions).sort().join(",") || "nenhuma");
}

test("11 · a recuperação local não apaga versões que um consumidor gravou antes dela", async () => {
  const chave = "minerador-pro:workflow-recovery:ator-1:marca-1";
  armazenamento.setItem(chave, JSON.stringify({
    schemaVersion: 1, architectImportedKeywordIds: [], articleVersions: {}, siloVersions: {}, siloPageVersions: {}, versionEvents: [],
    contentPlans: {}, documents: {}, radarItems: [], plannerItems: [], serpRecords: [], serpReviews: [], serpMergeConflicts: [],
    operationalPublications: [], documentLocks: {}, selectedEntityId: null, aiReviewAnnotations: [], savedAt: "2026-09-22T10:00:00.000+00:00",
  }));
  try {
    await tela!.render(comProvider(h(TelaQueGravaVersoes)));
    await assentar(60);
    assert.ok(leiturasDaCopiaLocal.includes(chave), "a cópia local foi aberta e aplicada");
    assert.equal(tela!.get("versoes").textContent, "artigo-canonico", "a versão canônica em memória sobrevive à cópia local");
  } finally {
    armazenamento.removeItem(chave);
  }
});

test("12 · leitura automática pendurada além do prazo não trava a mesa para sempre", async () => {
  automatico = false;
  await tela!.render(comProvider(h(TelaDaMesa, { nome: "arquiteto" })));
  await assentar();
  assert.equal(contar("/api/inteligencia"), 1);
  await tela!.render(comProvider(h(TelaSemMesa)));
  await assentar();
  const agoraReal = Date.now;
  Date.now = () => agoraReal() + 10 * 60_000;
  try {
    await tela!.render(comProvider(h(TelaDaMesa, { nome: "radar", key: "radar" })));
    await assentar();
    assert.equal(contar("/api/inteligencia"), 2, "a volta à tela tenta de novo depois do prazo");
  } finally {
    Date.now = agoraReal;
  }
  await responderTudo();
  assert.equal(tela!.get("mesa").textContent, "radar|snapshot:marca-1|server");
});
