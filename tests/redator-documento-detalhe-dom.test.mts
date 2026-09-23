import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * ======  E1 · O REDATOR SÓ EDITA O DOCUMENTO COMPLETO  =====================
 *
 * A listagem da mesa passou a trazer o documento SEM o pacote do Radar
 * (`importedContext.dossier.bundle`), marcado como parcial. O autosave reenvia
 * o documento inteiro: se o Redator editasse a cópia parcial, o servidor
 * receberia o documento sem o bundle.
 *
 * Provado aqui com o `ProfessionalWriter` e o `EditorialPipelineProvider`
 * REAIS, renderizados no DOM, com `fetch` interceptado (nenhuma rede):
 *
 *   1. F5: enquanto o detalhe não chega, não há editor, nem ação de salvar,
 *      nem autosave — e o painel diz "carregando", não "sem dossiê";
 *   2. o detalhe chega: o editor abre, e o autosave manda o documento COMPLETO,
 *      com o bundle, o hash dele e o lock lido no detalhe;
 *   3. falha do detalhe: a edição continua bloqueada; "Tentar de novo" relê;
 *   4. a releitura da mesa não rebaixa o documento aberto (o editor fica);
 *   5. a cópia local guarda a forma de listagem, e a cópia ANTIGA, com o
 *      documento inteiro, não vira base de edição depois do F5;
 *   6. o detalhe que chega depois de trocar de marca cai na marca do pedido;
 *   7. Strict Mode: uma leitura de detalhe só.
 *
 * Rodar: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning
 *   --experimental-loader ./tests/stubs/redator-detalhe-loader.mjs --test tests/redator-documento-detalhe-dom.test.mts
 */

const { ContentDocumentSchema } = await import("../lib/arquiteto/contracts.ts");
const { contentHash } = await import("../lib/arquiteto/versioning.ts");
const { isPartialContentDocument, toListingForm } = await import("../lib/editorial/content-document-listing.ts");
const { documentoV2ComDossie, MARCADOR_DO_BUNDLE } = await import("./editorial-documento-e1-fixtures.mts");

type Controles = { actions?: unknown } | null;
const controles: { ultimo: Controles } = { ultimo: null };
const barra = {
  registerControls: (valor: Controles) => { controles.ultimo = valor; },
  updateControls: (valor: Controles) => { controles.ultimo = valor; },
  unregisterControls: () => { controles.ultimo = null; },
};
const estado = {
  brand: { selectedBrandId: "marca-1" as string | null },
  session: { actorUserId: "ator-1" as string | null, sessionEpoch: 1 },
  topbar: barra,
};
Object.defineProperty(globalThis, "__redatorE1", { value: estado, writable: true, configurable: true });

/* ======================= o servidor, simulado ======================= */

const COMPLETO = ContentDocumentSchema.parse(documentoV2ComDossie("doc-e1"));
const BUNDLE = structuredClone((COMPLETO as { importedContext: { dossier: { bundle: unknown } } }).importedContext.dossier.bundle);
const HASH_GRAVADO = await contentHash(COMPLETO);
const TS = "2026-09-23T10:00:00.000000+00:00";

type Pedido = { metodo: string; url: string; corpo: unknown };
const pedidos: Pedido[] = [];
let detalhe: "responde" | "falha" | "segura" = "responde";
let detalhesSegurados: Array<() => void> = [];
/* O lock da listagem: a releitura pode trazer um lock novo. */
let lockDaListagem = 4;
/* O que o GET do detalhe devolve — a resposta é montada na hora do pedido. */
const SALVO_POR_OUTRA_ABA = ContentDocumentSchema.parse({ ...COMPLETO, title: "Título salvo por outra aba" });
const HASH_DA_OUTRA_ABA = await contentHash(SALVO_POR_OUTRA_ABA);
let noServidor = { documento: COMPLETO, lock: 4, hash: HASH_GRAVADO };
let marcaDoDetalhe: string | null = null;

const registroListado = (brandId: string) => brandId === "marca-1" ? [{
  document: toListingForm(COMPLETO), lockVersion: lockDaListagem, contentHash: HASH_GRAVADO, updatedAt: TS,
  userState: { cursorPosition: null, scrollTop: 0, leftPanelOpen: true, rightPanelOpen: true, lastOpenedAt: "2026-09-23T09:00:00.000000+00:00" },
}] : [];

function responder(metodo: string, url: string, corpo: unknown): { status: number; body: unknown } {
  const alvo = new URL(url, "http://localhost");
  if (alvo.pathname === "/api/inteligencia") {
    const marca = alvo.searchParams.get("marcaId") || "";
    return { status: 200, body: { data: {
      brand: { id: marca, nome: `Marca ${marca}`, site_url: null, nicho: null, localizacao: null, dna_diretrizes: null, silos_existentes: null, created_at: null },
      silos: [], keywords: [], briefings: [], loadedAt: "2026-09-23T10:00:00.000Z",
    } } };
  }
  if (alvo.pathname === "/api/editorial/workspace") {
    const marca = alvo.searchParams.get("marcaId") || "";
    return { status: 200, body: { data: {
      mode: "server", radarItems: [], plannerItems: [], articleVersions: [], siloVersions: [], versionEvents: [], contentPlans: [],
      documents: registroListado(marca), publications: [], invitations: [], views: [], loadedAt: TS,
    } } };
  }
  if (alvo.pathname === "/api/editorial/documents" && metodo === "GET") {
    if (detalhe === "falha") return { status: 500, body: { error: "falha simulada do detalhe" } };
    return { status: 200, body: { data: { brandId: marcaDoDetalhe ?? alvo.searchParams.get("brandId"), document: noServidor.documento, lockVersion: noServidor.lock, contentHash: noServidor.hash, updatedAt: TS } } };
  }
  if (alvo.pathname === "/api/editorial/documents" && metodo === "PATCH") {
    const pedido = corpo as { expectedLockVersion: number; contentHash: string };
    return { status: 200, body: { lockVersion: pedido.expectedLockVersion + 1, updatedAt: "2026-09-23T12:00:00.000000+00:00", contentHash: pedido.contentHash, version: null } };
  }
  if (alvo.pathname === "/api/editorial/documents" && metodo === "POST") return { status: 200, body: { ok: true } };
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
    const resposta = () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (metodo === "GET" && url.startsWith("/api/editorial/documents") && detalhe === "segura") {
      return new Promise(resolve => { detalhesSegurados.push(() => resolve(resposta())); });
    }
    return Promise.resolve(resposta());
  },
  writable: true, configurable: true,
});

const { EditorialPipelineProvider, useEditorialPipeline } = await import("../components/editorial-pipeline-context.tsx");
const { ProfessionalWriter } = await import("../components/editorial/professional-writer.tsx");
const h = React.createElement;

type Mesa = ReturnType<typeof useEditorialPipeline>;
const sonda: { mesa: Mesa | null } = { mesa: null };
function Sonda() { sonda.mesa = useEditorialPipeline(); return null; }

const arvore = (strict = false) => {
  const conteudo = h(EditorialPipelineProvider, null, h(Sonda), h(ProfessionalWriter, {}));
  return strict ? h(React.StrictMode, null, conteudo) : conteudo;
};
const assentar = async (ms = 40) => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
const soltarDetalhes = async () => {
  const lote = detalhesSegurados; detalhesSegurados = [];
  await React.act(async () => { lote.forEach(soltar => soltar()); await new Promise(resolve => setTimeout(resolve, 20)); });
  await assentar();
};
const leiturasDoDetalhe = () => pedidos.filter(pedido => pedido.metodo === "GET" && pedido.url.startsWith("/api/editorial/documents")).length;
const gravacoes = () => pedidos.filter(pedido => pedido.metodo === "PATCH");
type EditorNoDom = HTMLElement & { editor?: { commands: { insertContent: (valor: string) => boolean; focus: (posicao?: string) => boolean } } };
const editorAberto = (tela: RadarDomScreen) => tela.container.querySelector(".ProseMirror") as EditorNoDom | null;
const armazenamento = () => (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage;
const CHAVE_DA_COPIA = "minerador-pro:workflow-recovery:ator-1:marca-1";

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => {
  pedidos.length = 0; detalhe = "responde"; detalhesSegurados = []; lockDaListagem = 4; controles.ultimo = null; sonda.mesa = null;
  noServidor = { documento: COMPLETO, lock: 4, hash: HASH_GRAVADO }; marcaDoDetalhe = null;
  estado.brand.selectedBrandId = "marca-1"; estado.session.actorUserId = "ator-1";
  /* Armazenamento do happy-dom, não do navegador do usuário: cada teste começa sem cópia. */
  armazenamento().clear();
  tela = await montarRadar();
});
test.afterEach(() => { tela?.destroy(); tela = null; });

test("01 · F5: antes do detalhe não há editor, nem ação de salvar, nem autosave", async () => {
  detalhe = "segura";
  await tela!.render(arvore());
  await assentar(80);

  assert.equal(leiturasDoDetalhe(), 1, "o documento aberto pede o detalhe");
  const listado = sonda.mesa!.documents["doc-e1"];
  assert.ok(listado && isPartialContentDocument(listado), "a mesa guarda a cópia parcial");
  assert.ok(tela!.container.querySelector('[data-documento-detalhe="carregando"]'), "a tela diz que está carregando");
  assert.equal(editorAberto(tela!), null, "nenhum editor sobre a cópia parcial");
  assert.equal(controles.ultimo?.actions ?? null, null, "sem Salvar rascunho nem Finalizar");
  assert.ok(tela!.container.querySelector('[data-radar-foundations="carregando"]'));
  assert.equal(tela!.container.querySelector('[data-radar-foundations="ausente"]'), null, "não diz \"sem dossiê\" enquanto o dossiê não chegou");
  await assentar(1400);
  assert.equal(gravacoes().length, 0, "nenhum autosave");
  await soltarDetalhes();
});

test("02 · o detalhe chega: o editor abre e o autosave manda o documento COMPLETO", async () => {
  await tela!.render(arvore());
  await assentar(120);

  const editor = editorAberto(tela!);
  assert.ok(editor?.editor, "o editor abre com o documento completo");
  assert.equal(editor.getAttribute("contenteditable"), "true");
  assert.ok(tela!.container.textContent?.includes("Primeiro, limpe a pele."), "o conteúdo do documento está no editor");
  assert.ok(tela!.container.querySelector('[data-radar-foundations="presente"]'), "os fundamentos do Radar aparecem");
  assert.notEqual(controles.ultimo?.actions ?? null, null, "as ações do documento aparecem");
  assert.equal(isPartialContentDocument(sonda.mesa!.documents["doc-e1"]), false);
  assert.equal(sonda.mesa!.documentLocks["doc-e1"], 4, "o lock é o do detalhe");

  await React.act(async () => { editor.editor!.commands.focus("end"); editor.editor!.commands.insertContent(" Texto novo."); });
  await assentar(1500);

  const [gravacao] = gravacoes();
  assert.ok(gravacao, "o autosave gravou");
  const corpo = gravacao.corpo as { document: { importedContext: { dossier: Record<string, unknown> } }; contentHash: string; expectedLockVersion: number };
  assert.deepEqual(corpo.document.importedContext.dossier.bundle, BUNDLE, "o bundle vai inteiro");
  assert.equal("bundleOmitted" in corpo.document.importedContext.dossier, false, "nunca a cópia parcial");
  assert.equal(ContentDocumentSchema.safeParse(corpo.document).success, true);
  assert.equal(corpo.contentHash, await contentHash(ContentDocumentSchema.parse(corpo.document)), "o hash descreve o documento completo");
  assert.equal(corpo.expectedLockVersion, 4);
  assert.equal(sonda.mesa!.documentLocks["doc-e1"], 5, "o lock confirmado pelo servidor");
});

test("03 · falha do detalhe: a edição continua bloqueada, e \"Tentar de novo\" relê", async () => {
  detalhe = "falha";
  await tela!.render(arvore());
  await assentar(120);

  const aviso = tela!.container.querySelector('[data-documento-detalhe="falhou"]');
  assert.ok(aviso, "a falha aparece como falha");
  assert.ok(aviso.textContent?.includes("falha simulada do detalhe"), "com a mensagem do servidor");
  assert.equal(aviso.querySelector("[data-rascunho-local-guardado]"), null, "sem rascunho local, nenhum aviso de rascunho");
  assert.equal(editorAberto(tela!), null);
  assert.equal(leiturasDoDetalhe(), 1);

  detalhe = "responde";
  const botao = [...aviso.querySelectorAll("button")].find(item => item.textContent === "Tentar de novo") as HTMLElement;
  await tela!.click(botao);
  await assentar(120);
  assert.equal(leiturasDoDetalhe(), 2);
  assert.ok(editorAberto(tela!)?.editor, "depois da nova leitura, o editor abre");
});

test("04 · a releitura da mesa não rebaixa o documento aberto: o editor continua o mesmo", async () => {
  await tela!.render(arvore());
  await assentar(120);
  const antes = editorAberto(tela!);
  assert.ok(antes);

  lockDaListagem = 6;
  await React.act(async () => { await sonda.mesa!.reloadOperational(); });
  await assentar(60);

  assert.equal(isPartialContentDocument(sonda.mesa!.documents["doc-e1"]), false, "continua completo");
  assert.equal(editorAberto(tela!), antes, "o mesmo editor, nada desmontado");
  assert.equal(sonda.mesa!.documentLocks["doc-e1"], 6, "o lock acompanha a leitura nova");
  assert.equal(leiturasDoDetalhe(), 1, "sem reler o detalhe");
});

test("05 · a cópia local guarda a forma de listagem, sem o bundle", async () => {
  await tela!.render(arvore());
  await assentar(1200);
  const bruto = armazenamento().getItem(CHAVE_DA_COPIA);
  assert.ok(bruto, "a cópia de continuidade foi gravada");
  assert.equal(bruto.includes(MARCADOR_DO_BUNDLE), false, "nenhum byte do bundle na cópia local");
  const copia = JSON.parse(bruto) as { documents: Record<string, { importedContext: { dossier: Record<string, unknown> } }> };
  assert.equal(copia.documents["doc-e1"].importedContext.dossier.bundleOmitted, true);
});

test("06 · F5 com a cópia local ANTIGA (documento inteiro): ela não vira base de edição", async () => {
  armazenamento().setItem(CHAVE_DA_COPIA, JSON.stringify({
    schemaVersion: 1, architectImportedKeywordIds: [], articleVersions: {}, siloVersions: {}, versionEvents: [], contentPlans: {},
    documents: { "doc-e1": COMPLETO }, radarItems: [], plannerItems: [], operationalPublications: [], documentLocks: { "doc-e1": 4 },
    selectedEntityId: null, savedAt: "2026-09-22T10:00:00.000Z",
  }));
  detalhe = "segura";
  await tela!.render(arvore());
  await assentar(80);

  assert.ok(isPartialContentDocument(sonda.mesa!.documents["doc-e1"]), "o documento da cópia antiga entra parcial");
  assert.equal(editorAberto(tela!), null, "sem editor até o servidor responder");
  assert.equal(leiturasDoDetalhe(), 1);
  await soltarDetalhes();
  assert.ok(editorAberto(tela!)?.editor, "o editor abre com o detalhe do servidor");
});

test("07 · o detalhe que chega depois da troca de marca cai na marca do pedido", async () => {
  detalhe = "segura";
  await tela!.render(arvore());
  await assentar(80);
  assert.equal(leiturasDoDetalhe(), 1);

  estado.brand.selectedBrandId = "marca-2";
  await tela!.render(arvore());
  await assentar(80);
  await soltarDetalhes();
  assert.equal(sonda.mesa!.documents["doc-e1"], undefined, "a marca 2 não recebe o documento da marca 1");

  estado.brand.selectedBrandId = "marca-1";
  await tela!.render(arvore());
  await assentar(80);
  const naMarca1 = sonda.mesa!.documents["doc-e1"];
  assert.ok(naMarca1 && !isPartialContentDocument(naMarca1), "o detalhe ficou na marca 1");
});

test("08 · Strict Mode: uma leitura de detalhe só, mesmo abrindo o Redator com a mesa já carregada", async () => {
  /*
   * O caso que repete o efeito: chegar ao Redator vindo de outra tela da mesa.
   * O documento já está na memória (parcial) quando o Redator monta, e o
   * Strict Mode monta os efeitos duas vezes (R13).
   */
  await tela!.render(h(EditorialPipelineProvider, null, h(Sonda)));
  await assentar(80);
  assert.ok(isPartialContentDocument(sonda.mesa!.documents["doc-e1"]));
  assert.equal(leiturasDoDetalhe(), 0, "sem Redator, ninguém pede o detalhe");

  await tela!.render(h(EditorialPipelineProvider, null, h(Sonda), h(React.StrictMode, null, h(ProfessionalWriter, {}))));
  await assentar(150);
  assert.equal(leiturasDoDetalhe(), 1);
  assert.ok(editorAberto(tela!)?.editor);
});

test("09 · o detalhe não sobrescreve o documento completo que a memória tem (edição não salva)", async () => {
  await tela!.render(arvore());
  await assentar(120);
  const editado = ContentDocumentSchema.parse({ ...COMPLETO, title: "Título editado e ainda não salvo" });
  await React.act(async () => { sonda.mesa!.updateDocumentLocal(editado); });
  const devolvido = await React.act(async () => sonda.mesa!.loadDocumentDetail("doc-e1"));
  await assentar(40);
  assert.equal(devolvido.title, COMPLETO.title, "quem pediu recebe o que o servidor tem");
  assert.equal(sonda.mesa!.documents["doc-e1"].title, "Título editado e ainda não salvo", "a memória não perde a edição");
});

/* ======================= correções da revisão ======================= */

const CHAVE_DO_RASCUNHO = "minerador-pro:document-recovery:ator-1:marca-1:doc-e1";
type ComDossie = { title: string; importedContext: { dossier: { bundle: Record<string, unknown>; bundleHash: string } } };

test("10 · o detalhe atrasado não faz o lock andar para trás: a lista mais nova vence, e o Redator pede de novo", async () => {
  detalhe = "segura";
  await tela!.render(arvore());
  await assentar(80);
  assert.equal(leiturasDoDetalhe(), 1, "o detalhe do lock 4 está no ar");

  /* Outra aba salva (lock 5); a releitura da mesa traz a cópia parcial com o lock novo. */
  noServidor = { documento: SALVO_POR_OUTRA_ABA, lock: 5, hash: HASH_DA_OUTRA_ABA };
  lockDaListagem = 5;
  await React.act(async () => { await sonda.mesa!.reloadOperational(); });
  await assentar(80);
  assert.equal(sonda.mesa!.documentLocks["doc-e1"], 5);
  assert.equal(leiturasDoDetalhe(), 2, "o lock novo gera uma leitura nova, sem reaproveitar a atrasada");

  /* Chega primeiro a resposta ATRASADA (lock 4, texto antigo). */
  const [atrasada, nova] = detalhesSegurados; detalhesSegurados = [];
  await React.act(async () => { atrasada(); await new Promise(resolve => setTimeout(resolve, 20)); });
  await assentar();
  assert.ok(isPartialContentDocument(sonda.mesa!.documents["doc-e1"]), "o detalhe do lock 4 é descartado");
  assert.equal(sonda.mesa!.documentLocks["doc-e1"], 5, "o lock não volta para 4");
  assert.equal(editorAberto(tela!), null, "nenhum editor sobre o texto antigo");

  await React.act(async () => { nova(); await new Promise(resolve => setTimeout(resolve, 20)); });
  await assentar(80);
  assert.equal(sonda.mesa!.documents["doc-e1"].title, "Título salvo por outra aba");
  assert.equal(sonda.mesa!.documentLocks["doc-e1"], 5);
  assert.ok(editorAberto(tela!)?.editor, "o editor abre com o documento do lock 5");
});

test("11 · detalhe que volta com a marca errada não é aplicado: continua parcial e bloqueado", async () => {
  marcaDoDetalhe = "marca-2";
  await tela!.render(arvore());
  await assentar(120);
  assert.ok(isPartialContentDocument(sonda.mesa!.documents["doc-e1"]), "a cópia continua parcial");
  assert.equal(editorAberto(tela!), null, "edição bloqueada");
  const aviso = tela!.container.querySelector('[data-documento-detalhe="falhou"]');
  assert.ok(aviso?.textContent?.includes("O servidor devolveu outro documento"), "a recusa aparece como falha");
});

test("12 · rascunho local por documento: o texto vem do rascunho, o bundle SEMPRE do servidor", async () => {
  const rascunho = structuredClone(COMPLETO) as unknown as ComDossie;
  rascunho.title = "Rascunho local restaurado";
  rascunho.importedContext.dossier.bundle = { adulterado: true };
  armazenamento().setItem(CHAVE_DO_RASCUNHO, JSON.stringify(rascunho));
  await tela!.render(arvore());
  await assentar(150);

  const naMemoria = sonda.mesa!.documents["doc-e1"] as unknown as ComDossie;
  assert.equal(naMemoria.title, "Rascunho local restaurado", "o rascunho do mesmo pacote é restaurado");
  assert.deepEqual(naMemoria.importedContext.dossier.bundle, BUNDLE, "o bundle do navegador não vira base de edição");
});

test("12b · rascunho local de OUTRO pacote do Radar não é aplicado e continua guardado", async () => {
  const rascunho = structuredClone(COMPLETO) as unknown as ComDossie;
  rascunho.title = "Rascunho de outro pacote";
  rascunho.importedContext.dossier.bundleHash = "sha256:outro-pacote";
  armazenamento().setItem(CHAVE_DO_RASCUNHO, JSON.stringify(rascunho));
  await tela!.render(arvore());
  await assentar(150);

  assert.equal(sonda.mesa!.documents["doc-e1"].title, COMPLETO.title, "o documento do servidor fica");
  assert.deepEqual((sonda.mesa!.documents["doc-e1"] as unknown as ComDossie).importedContext.dossier.bundle, BUNDLE);
  assert.ok(armazenamento().getItem(CHAVE_DO_RASCUNHO), "o rascunho não é apagado");
});

test("13 · sem servidor, a falha do detalhe avisa que há rascunho local guardado — sem liberar a edição", async () => {
  armazenamento().setItem(CHAVE_DO_RASCUNHO, JSON.stringify(COMPLETO));
  detalhe = "falha";
  await tela!.render(arvore());
  await assentar(120);
  const aviso = tela!.container.querySelector('[data-documento-detalhe="falhou"]');
  assert.ok(aviso?.querySelector("[data-rascunho-local-guardado]"), "o rascunho local é avisado");
  assert.equal(editorAberto(tela!), null, "a edição continua bloqueada");
  assert.ok(armazenamento().getItem(CHAVE_DO_RASCUNHO), "o rascunho continua guardado");
});
