import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * ======  REDATOR · OS DEFEITOS DO INVENTÁRIO DE 2026-10-18, PELOS BOTÕES  ======
 *
 * Inventário de botões (docs/compartilhado/inventario-botoes-e-linha-2026-10-18.md),
 * defeitos do Redator, provados com o `ProfessionalWriter`, o
 * `EditorialPipelineProvider` e o `WriterDerivedEnvironment` REAIS no DOM,
 * clicando nos botões de sempre, com `fetch` interceptado (nenhuma rede, nenhuma
 * IA paga):
 *
 *   A. "Propor escrita para esta seção": a caixa diz o custo antes; Cancelar não
 *      chama a IA; confirmar chama uma vez.
 *   B. "Melhorar trecho": idem.
 *   C. Desfazer/Refazer da barra só valem na aba ativa: na aba Carrossel não
 *      mexem no artigo escondido.
 *   D. "Finalizar carrossel" com alteração não salva: salva primeiro (o mesmo
 *      Salvar rascunho) e finaliza com o lock novo; nada se perde.
 *   E. "Criar carrossel a partir deste contexto": confirmação com o custo;
 *      Cancelar não chama a IA.
 *
 * Rodar: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning
 *   --experimental-loader ./tests/stubs/redator-detalhe-loader.mjs --test tests/redator-defeitos-2026-10-18-dom.test.mts
 */

const { ContentDocumentSchema } = await import("../lib/arquiteto/contracts.ts");
const { contentHash } = await import("../lib/arquiteto/versioning.ts");
const { toListingForm } = await import("../lib/editorial/content-document-listing.ts");
const { newWriterDeliverable } = await import("../lib/redator/multiformat-contracts.ts");
const { documentoV2ComDossie } = await import("./editorial-documento-e1-fixtures.mts");

type Historia = { canUndo: () => boolean; canRedo: () => boolean; undo: () => void; redo: () => void; undoTitle?: string };
type Controles = { actions?: unknown; tabs?: React.ReactNode; history?: Historia } | null;
const controles: { ultimo: Controles } = { ultimo: null };
const estado = {
  brand: { selectedBrandId: "marca-1" as string | null },
  session: { actorUserId: "ator-1" as string | null, sessionEpoch: 1 },
  topbar: {
    registerControls: (valor: Controles) => { controles.ultimo = valor; },
    updateControls: (valor: Controles) => { controles.ultimo = valor; },
    unregisterControls: () => { controles.ultimo = null; },
  },
};
Object.defineProperty(globalThis, "__redatorE1", { value: estado, writable: true, configurable: true });

const COMPLETO = ContentDocumentSchema.parse(documentoV2ComDossie("doc-e1"));
const HASH = await contentHash(COMPLETO);
const TS = "2026-10-18T10:00:00.000000+00:00";

/* O entregável do carrossel guardado no servidor (só no teste D). */
type Guardado = { id: string; kind: "carousel"; status: string; payload: Record<string, unknown>; contentHash: string; lockVersion: number; updatedAt: string };
let carrossel: Guardado | null = null;

type Pedido = { metodo: string; url: string; corpo: unknown };
const pedidos: Pedido[] = [];

function responder(metodo: string, url: string, corpo: unknown): { status: number; body: unknown } {
  const alvo = new URL(url, "http://localhost");
  if (alvo.pathname === "/api/inteligencia") {
    const marca = alvo.searchParams.get("marcaId") || "";
    return { status: 200, body: { data: { brand: { id: marca, nome: "Marca", site_url: null, nicho: null, localizacao: null, dna_diretrizes: null, silos_existentes: null, created_at: null }, silos: [], keywords: [], briefings: [], loadedAt: "2026-10-18T10:00:00.000Z" } } };
  }
  if (alvo.pathname === "/api/editorial/workspace") {
    return { status: 200, body: { data: {
      mode: "server", radarItems: [], plannerItems: [], articleVersions: [], siloVersions: [], versionEvents: [], contentPlans: [],
      documents: [{ document: toListingForm(COMPLETO), lockVersion: 4, contentHash: HASH, updatedAt: TS,
        userState: { cursorPosition: null, scrollTop: 0, leftPanelOpen: true, rightPanelOpen: true, lastOpenedAt: TS } }],
      publications: [], invitations: [], views: [], loadedAt: TS,
    } } };
  }
  if (alvo.pathname === "/api/editorial/documents" && metodo === "GET") {
    return { status: 200, body: { data: { brandId: "marca-1", document: COMPLETO, lockVersion: 4, contentHash: HASH, updatedAt: TS } } };
  }
  if (alvo.pathname === "/api/editorial/documents" && metodo === "PATCH") {
    const pedido = corpo as { expectedLockVersion: number; contentHash: string };
    return { status: 200, body: { lockVersion: pedido.expectedLockVersion + 1, updatedAt: TS, contentHash: pedido.contentHash, version: null } };
  }
  if (alvo.pathname === "/api/editorial/documents" && metodo === "POST") return { status: 200, body: { ok: true } };
  if (alvo.pathname === "/api/redator/section" || alvo.pathname === "/api/redator/improve" || alvo.pathname === "/api/redator/seed") {
    return { status: 503, body: { error: "IA desligada no teste." } };
  }
  if (alvo.pathname === "/api/redator/deliverables" && metodo === "GET") {
    return { status: 200, body: { deliverables: carrossel ? [carrossel] : [], sourceDocumentHash: HASH, media: [] } };
  }
  if (alvo.pathname === "/api/redator/deliverables" && metodo === "PUT") {
    const pedido = corpo as { payload: Record<string, unknown>; expectedLockVersion: number | null };
    if (carrossel && pedido.expectedLockVersion !== carrossel.lockVersion) return { status: 409, body: { code: "writer_lock_conflict", error: "lock" } };
    carrossel = { ...(carrossel as Guardado), payload: pedido.payload, lockVersion: (carrossel?.lockVersion ?? 0) + 1 };
    return { status: 200, body: { ok: true } };
  }
  if (alvo.pathname === "/api/redator/deliverables" && metodo === "PATCH") {
    const pedido = corpo as { action: string; expectedLockVersion?: number };
    if (!carrossel || pedido.expectedLockVersion !== carrossel.lockVersion) return { status: 409, body: { code: "writer_lock_conflict", error: "O entregável mudou." } };
    carrossel = { ...carrossel, status: "approved", lockVersion: carrossel.lockVersion + 1 };
    return { status: 200, body: { versionNumber: 1 } };
  }
  return { status: 404, body: { error: `rota inesperada no teste: ${metodo} ${url}` } };
}

Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    if (/^https?:/.test(url)) throw new Error(`rede real proibida neste teste: ${url}`);
    const metodo = String(init?.method || "GET").toUpperCase();
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    pedidos.push({ metodo, url, corpo });
    const { status, body } = responder(metodo, url, corpo);
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  },
  writable: true, configurable: true,
});

/* As caixas do navegador, observáveis: o que foi perguntado e o que a pessoa respondeu. */
const janela = (globalThis as unknown as { window: Record<string, unknown> }).window;
const perguntas: string[] = [];
let respostaDoPrompt: string | null = null;
let respostaDoConfirm = false;
janela.prompt = (mensagem: string) => { perguntas.push(String(mensagem)); return respostaDoPrompt; };
janela.confirm = (mensagem: string) => { perguntas.push(String(mensagem)); return respostaDoConfirm; };

const { EditorialPipelineProvider } = await import("../components/editorial-pipeline-context.tsx");
const { ProfessionalWriter } = await import("../components/editorial/professional-writer.tsx");
const { WriterDerivedEnvironment } = await import("../modules/redator/writer-derived-environment.tsx");
const { GlobalNoticeProvider } = await import("../components/global-notice-center.tsx");
const { createRoot } = await import("react-dom/client");
const h = React.createElement;

const redator = () => comProductShell(h(GlobalNoticeProvider, null, h(EditorialPipelineProvider, null, h(ProfessionalWriter, {}))));
const assentar = async (ms = 60) => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
const chamadas = (caminho: string, metodo = "POST") => pedidos.filter(pedido => pedido.metodo === metodo && pedido.url.startsWith(caminho));
type EditorNoDom = HTMLElement & { editor?: { getText: () => string; commands: { insertContent: (valor: string) => boolean; focus: (posicao?: string) => boolean; setTextSelection: (alcance: { from: number; to: number }) => boolean } } };
const editorAberto = (tela: RadarDomScreen) => tela.container.querySelector(".ProseMirror") as EditorNoDom | null;

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => {
  pedidos.length = 0; perguntas.length = 0; respostaDoPrompt = null; respostaDoConfirm = false; controles.ultimo = null; carrossel = null;
  (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.clear();
  tela = await montarRadar();
});
test.afterEach(() => { tela?.destroy(); tela = null; });

test("A · Propor escrita para esta seção: o custo vem antes, e Cancelar não chama a IA", async () => {
  await tela!.render(redator());
  await assentar(150);
  const botao = tela!.container.querySelector("[data-propor-secao]") as HTMLElement | null;
  assert.ok(botao, "o botão da seção está no Outline");
  assert.match(botao.getAttribute("title") || "", /até 2 chamadas de IA/, "o botão diz o custo");

  respostaDoPrompt = null;
  await tela!.click(botao);
  await assentar();
  assert.equal(perguntas.length, 1, "a caixa de instrução abriu");
  assert.match(perguntas[0], /IA paga: até 2 chamadas de IA/, "a caixa diz o custo antes da chamada");
  assert.match(perguntas[0], /Cancelar não chama a IA/);
  assert.equal(chamadas("/api/redator/section").length, 0, "cancelado: nenhuma chamada paga");

  respostaDoPrompt = "";
  await tela!.click(botao);
  await assentar();
  assert.equal(chamadas("/api/redator/section").length, 1, "confirmado (mesmo sem instrução): uma chamada");
});

test("B · Melhorar trecho: o custo vem antes, e Cancelar não chama a IA", async () => {
  await tela!.render(redator());
  await assentar(150);
  const editor = editorAberto(tela!);
  assert.ok(editor?.editor, "o editor do artigo abriu");
  await React.act(async () => { editor.editor!.commands.setTextSelection({ from: 1, to: 8 }); });
  const botao = [...tela!.container.querySelectorAll("button")].find(item => (item.getAttribute("title") || "").startsWith("Melhorar trecho")) as HTMLElement | undefined;
  assert.ok(botao, "o botão Melhorar trecho está na barra do editor");
  assert.match(botao.getAttribute("title") || "", /até 2 chamadas de IA/);

  respostaDoPrompt = null;
  await tela!.click(botao);
  await assentar();
  assert.match(perguntas.at(-1) || "", /IA paga: até 2 chamadas de IA/);
  assert.equal(chamadas("/api/redator/improve").length, 0, "cancelado: nenhuma chamada paga");

  respostaDoPrompt = "Mais claro.";
  await tela!.click(botao);
  await assentar();
  assert.equal(chamadas("/api/redator/improve").length, 1);
});

test("C · Desfazer/Refazer só valem na aba ativa: no Carrossel não mexem no artigo escondido", async () => {
  await tela!.render(redator());
  await assentar(150);
  const editor = editorAberto(tela!);
  assert.ok(editor?.editor);
  await React.act(async () => { editor.editor!.commands.focus("end"); editor.editor!.commands.insertContent(" Texto novo."); });
  await assentar();
  assert.equal(controles.ultimo?.history?.canUndo(), true, "no Artigo, há o que desfazer");

  /* As abas moram na barra global; aqui elas são desenhadas à parte e clicadas como na tela. */
  const barra = (globalThis as unknown as { document: Document }).document.createElement("div");
  (globalThis as unknown as { document: Document }).document.body.appendChild(barra);
  const raiz = createRoot(barra);
  await React.act(async () => { raiz.render(h(React.Fragment, null, controles.ultimo!.tabs)); });
  const aba = [...barra.querySelectorAll("button")].find(item => item.textContent === "Carrossel") as HTMLElement;
  await React.act(async () => { aba.click(); });
  await assentar();

  assert.equal(controles.ultimo?.history?.canUndo(), false, "no Carrossel, Desfazer fica desligado");
  assert.equal(controles.ultimo?.history?.canRedo(), false);
  assert.match(controles.ultimo?.history?.undoTitle || "", /só para o texto da aba Artigo/);
  await React.act(async () => { controles.ultimo!.history!.undo(); });
  assert.ok(editor.editor!.getText().includes("Texto novo."), "o artigo escondido continua como estava");
  React.act(() => { raiz.unmount(); });
  barra.remove();
});

test("D · Finalizar carrossel com alteração não salva: salva primeiro e finaliza o que foi salvo", async () => {
  const base = newWriterDeliverable("carousel", { documentId: "doc-e1", title: "Carrossel", sourceDocumentHash: HASH });
  carrossel = { id: "entregavel-1", kind: "carousel", status: "draft", contentHash: "h", lockVersion: 3, updatedAt: TS,
    payload: { ...base, slides: [{ id: "slide-1", order: 0, heading: "Abertura", body: "Texto antigo", visual: null, sourceRefs: [] }] } as Record<string, unknown> };
  let barraDoEntregavel: { finalizar: () => void } | null = null;
  await tela!.render(comProductShell(h(GlobalNoticeProvider, null, h(WriterDerivedEnvironment, {
    kind: "carousel", brandId: "marca-1", documentId: "doc-e1", title: "Carrossel", document: COMPLETO,
    onBarChange: (valor: { finalizar: () => void } | null) => { barraDoEntregavel = valor; },
  }))));
  await assentar(100);

  const campo = [...tela!.container.querySelectorAll("textarea")].find(item => (item as HTMLTextAreaElement).value === "Texto antigo") as HTMLElement;
  assert.ok(campo, "o slide gravado está na tela");
  await tela!.type(campo, "Texto novo, ainda não salvo");
  await assentar();

  await React.act(async () => { barraDoEntregavel!.finalizar(); await new Promise(resolve => setTimeout(resolve, 80)); });
  await assentar();

  const put = chamadas("/api/redator/deliverables", "PUT");
  const patch = chamadas("/api/redator/deliverables", "PATCH");
  assert.equal(put.length, 1, "salvou antes de finalizar");
  assert.equal(patch.length, 1, "finalizou uma vez");
  assert.ok(pedidos.indexOf(put[0]) < pedidos.indexOf(patch[0]), "salvar vem antes de finalizar");
  assert.equal(((put[0].corpo as { payload: { slides: Array<{ body: string }> } }).payload.slides[0].body), "Texto novo, ainda não salvo", "o que estava na tela foi gravado");
  assert.equal((patch[0].corpo as { expectedLockVersion: number }).expectedLockVersion, 4, "finaliza com o lock do que acabou de salvar");
  assert.equal(carrossel?.status, "approved");
});

test("E · Criar carrossel a partir deste contexto: confirmação com o custo; Cancelar não chama a IA", async () => {
  await tela!.render(comProductShell(h(GlobalNoticeProvider, null, h(WriterDerivedEnvironment, {
    kind: "carousel", brandId: "marca-1", documentId: "doc-e1", title: "Carrossel", document: COMPLETO,
  }))));
  await assentar(100);
  const semear = tela!.container.querySelector("[data-semear]") as HTMLElement | null;
  assert.ok(semear, "o botão de semear aparece com o contexto do Radar");
  assert.match(tela!.container.querySelector("[data-semear-custo]")?.textContent || "", /até 2 chamadas de IA/, "o custo está ao lado do botão");

  respostaDoConfirm = false;
  await tela!.click(semear);
  await assentar();
  assert.match(perguntas.at(-1) || "", /IA paga: até 2 chamadas de IA/);
  assert.equal(chamadas("/api/redator/seed").length, 0, "cancelado: nenhuma chamada paga");

  respostaDoConfirm = true;
  await tela!.click(semear);
  await assentar();
  assert.equal(chamadas("/api/redator/seed").length, 1);
});
