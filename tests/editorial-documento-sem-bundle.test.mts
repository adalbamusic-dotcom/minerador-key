import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/**
 * ===== E1 · A MESA LISTA O DOCUMENTO SEM O PACOTE DO RADAR =====
 *
 * SDD de egress 2026-09-23, proposta E1. Medido no remoto (agregados, R2/R3):
 * 2 documentos, 4.496.695 bytes de `payload`, dos quais 4.488.306 eram
 * `importedContext.dossier.bundle`. A listagem da mesa trazia tudo a cada
 * carga fria; o bundle só serve ao Redator, no documento aberto.
 *
 * O que este arquivo prova, contra um PostgREST SIMULADO (o cliente é o
 * `supabase-js` real; só o `fetch` global é trocado, e ele recusa rede):
 *
 *   forma       a listagem não pede a coluna `payload` nem o bundle; o v2 com
 *               dossiê volta parcial e MARCADO; v1 e v2 sem dossiê, inteiros;
 *   paridade    listagem + bundle gravado = o documento que a rota devolvia;
 *   salvamento  a cópia parcial NUNCA apaga o bundle: a rota lê o bundle
 *               verbatim da linha e recalcula o hash; lock vencido e pacote
 *               diferente são 409 sem escrita;
 *   isolamento  outra marca não lista, não abre, não completa e não grava;
 *   detalhe     GET devolve o documento inteiro de UM documento da marca.
 *
 * Rodar: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/editorial-documento-sem-bundle.test.mts
 */

/* ======================= ambiente sem rede ======================= */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

/*
 * Autorização inerte, que REGISTRA o que foi pedido: a rota de detalhe tem de
 * exigir a mesma permissão da listagem. `__marcasNegadas` simula a sessão sem
 * acesso a uma marca.
 */
const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return { userId: 'ator-de-teste' }; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": [
    "export async function assertEditorialPermission(profile, brandId, module, action) {",
    "  (globalThis.__permissoesPedidas ||= []).push([brandId, module, action].join(':'));",
    "  if ((globalThis.__marcasNegadas || []).includes(brandId)) { const erro = new Error('Sem acesso a esta marca.'); erro.status = 403; throw erro; }",
    "}",
  ].join("\n"),
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);

/* ======================= PostgREST simulado ======================= */

type Linha = Record<string, unknown>;
type Pedido = { metodo: string; tabela: string; params: URLSearchParams; bytes: number };

const banco: Record<string, Linha[]> = { content_documents: [], content_document_user_states: [], publication_records: [] };
const pedidos: Pedido[] = [];

const PARAMETROS_NAO_FILTRO = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function casa(linha: Linha, params: URLSearchParams): boolean {
  for (const [coluna, filtro] of params) {
    if (PARAMETROS_NAO_FILTRO.has(coluna)) continue;
    const valor = linha[coluna] === null || linha[coluna] === undefined ? "null" : String(linha[coluna]);
    if (filtro.startsWith("eq.")) { if (valor !== filtro.slice(3)) return false; continue; }
    if (filtro.startsWith("in.(") && filtro.endsWith(")")) {
      const lista = filtro.slice(4, -1).split(",").map(item => item.replace(/^"|"$/g, ""));
      if (!lista.includes(valor)) return false;
      continue;
    }
    throw new Error(`filtro não simulado: ${coluna}=${filtro}`);
  }
  return true;
}

/*
 * `apelido:coluna->chave->chave`, como o PostgREST: chave ausente em qualquer
 * nível vira `null`, e JSON `null` também. `->>` e `::` não são simulados — se
 * aparecerem, o teste falha alto em vez de fingir.
 */
function valorDoCaminho(linha: Linha, expressao: string): unknown {
  if (expressao.includes("->>") || expressao.includes("::")) throw new Error(`seletor não simulado: ${expressao}`);
  const [coluna, ...chaves] = expressao.split("->");
  let valor: unknown = linha[coluna];
  for (const chave of chaves) {
    if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return null;
    valor = Object.prototype.hasOwnProperty.call(valor, chave) ? (valor as Linha)[chave] : null;
  }
  return valor === undefined ? null : valor;
}

function projeta(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return structuredClone(linha);
  return Object.fromEntries(select.split(",").map(item => {
    const separador = item.indexOf(":");
    const apelido = separador >= 0 ? item.slice(0, separador) : null;
    const expressao = separador >= 0 ? item.slice(separador + 1) : item;
    return [apelido ?? expressao.split("->").at(-1)!, structuredClone(valorDoCaminho(linha, expressao))];
  }));
}

const responder = (pedido: Pedido, corpo: unknown) => {
  const texto = JSON.stringify(corpo);
  pedido.bytes = texto.length;
  return new Response(texto, { status: 200, headers: { "content-type": "application/json" } });
};

globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname !== "supabase.teste.invalid") throw new Error(`rede real proibida neste teste: ${url.href}`);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  const metodo = String(init?.method || "GET").toUpperCase();
  const cabecalhos = new Headers(init?.headers);
  const pedido: Pedido = { metodo, tabela, params: new URLSearchParams(url.searchParams), bytes: 0 };
  pedidos.push(pedido);

  const linhas = (banco[tabela] || []).filter(linha => casa(linha, url.searchParams));
  const select = url.searchParams.get("select");
  if (metodo === "GET") return responder(pedido, linhas.map(linha => projeta(linha, select)));
  if (metodo === "PATCH") {
    const mudanca = JSON.parse(String(init?.body || "{}")) as Linha;
    for (const linha of linhas) {
      Object.assign(linha, mudanca);
      /* content_documents_touch_trg: todo UPDATE incrementa o lock. */
      linha.lock_version = Number(linha.lock_version) + 1;
      linha.updated_at = "2026-09-23T12:00:00.123456+00:00";
    }
    const devolve = String(cabecalhos.get("Prefer") || "").includes("return=representation");
    return devolve ? responder(pedido, linhas.map(linha => projeta(linha, select))) : new Response(null, { status: 204 });
  }
  throw new Error(`método não simulado: ${metodo} ${tabela}`);
}) as typeof fetch;

const pedidosA = (tabela: string, metodo?: string) => pedidos.filter(pedido => pedido.tabela === tabela && (!metodo || pedido.metodo === metodo));

/* ======================= módulos do projeto ======================= */

const { ContentDocumentRepository } = await import("../lib/server/editorial-repositories.ts");
const { OptimisticLockError } = await import("../lib/server/editorial-db.ts");
const { ContentDocumentSchema, ContentDocumentV1Schema, ContentDocumentV2Schema, ImportedRadarContextSchema, RadarWriterDossierSchema } = await import("../lib/arquiteto/contracts.ts");
const { contentHash } = await import("../lib/arquiteto/versioning.ts");
const listagem = await import("../lib/editorial/content-document-listing.ts");
const { DocumentSaveInputSchema, LocalWorkflowRecoverySchema, PersistedDocumentSchema, PersistedDocumentDetailSchema } = await import("../lib/editorial/persistence-contracts.ts");
const { NextRequest } = await import("next/server");
const rota = await import("../app/api/editorial/documents/route.ts");
const { bundleDoRadar, documentoV1, documentoV2ComDossie, documentoV2SemDossie, MARCADOR_DO_BUNDLE } = await import("./editorial-documento-e1-fixtures.mts");

/* ======================= fixtures ======================= */

const MARCA_A = "5f0c3a52-8d4e-4b7a-9c61-2e8f4a1b7c90";
const MARCA_B = "7a1d2e3f-4b5c-4d6e-8f90-1a2b3c4d5e6f";
const ATOR = "ator-de-teste";

type Documento = Record<string, unknown> & { id: string };
function linha(marca: string, documento: Documento, extra: Partial<Linha> = {}): Linha {
  return {
    id: documento.id, marca_id: marca, article_id: `art:${documento.id}`, status: "writing", title: "t", slug: "s",
    content_hash: `sha256:${"e".repeat(64)}`, lock_version: 4, updated_at: "2026-09-23T10:00:00.000000+00:00",
    /* O banco guarda JSON: a linha é uma cópia desligada da fixture. */
    payload: structuredClone(documento), ...extra,
  };
}

function semear() {
  banco.content_documents = [
    linha(MARCA_A, documentoV2ComDossie("doc-a")),
    linha(MARCA_A, documentoV1("doc-a-v1")),
    linha(MARCA_A, documentoV2SemDossie("doc-a-sem-dossie")),
    linha(MARCA_B, documentoV2ComDossie("doc-b")),
  ];
  banco.content_document_user_states = [];
  banco.publication_records = [];
  pedidos.length = 0;
  (globalThis as { __permissoesPedidas?: string[] }).__permissoesPedidas = [];
  (globalThis as { __marcasNegadas?: string[] }).__marcasNegadas = [];
}
const linhaDe = (id: string) => banco.content_documents.find(item => item.id === id)!;

const patch = (corpo: unknown) => rota.PATCH(new NextRequest("http://localhost/api/editorial/documents", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
}));
const get = (consulta: string) => rota.GET(new NextRequest(`http://localhost/api/editorial/documents?${consulta}`));

/* ======================= 1 · forma da listagem ======================= */

test("01 · a listagem pede campo por caminho: nem a coluna `payload`, nem o bundle", async () => {
  semear();
  await new ContentDocumentRepository().list(MARCA_A, ATOR);
  const [leitura] = pedidosA("content_documents", "GET");
  const itens = String(leitura.params.get("select")).split(",");

  assert.equal(itens.includes("payload"), false, "a coluna inteira não pode voltar");
  assert.equal(itens.some(item => /->bundle$/.test(item)), false, "o bundle não é pedido");
  for (const coluna of ["id", "content_hash", "lock_version", "updated_at"]) assert.ok(itens.includes(coluna), `${coluna} continua na listagem`);
  for (const item of itens.filter(item => item.includes("->"))) assert.match(item, /^[a-z]_[A-Za-z]+:payload->/, `seletor com apelido: ${item}`);
  assert.equal(leitura.params.get("marca_id"), `eq.${MARCA_A}`, "R4: a marca filtra na consulta");
});

test("02 · o v2 com dossiê volta PARCIAL e marcado; v1 e v2 sem dossiê voltam inteiros", async () => {
  semear();
  const lista = await new ContentDocumentRepository().list(MARCA_A, ATOR);
  const porId = new Map(lista.map(item => [item.document.id, item.document]));
  assert.deepEqual([...porId.keys()].sort(), ["doc-a", "doc-a-sem-dossie", "doc-a-v1"]);

  const parcial = porId.get("doc-a")!;
  assert.equal(listagem.isPartialContentDocument(parcial), true);
  const dossie = (parcial as { importedContext: { dossier: Record<string, unknown> } }).importedContext.dossier;
  assert.equal(dossie.bundleOmitted, true, "o marcador é explícito");
  assert.equal("bundle" in dossie, false);
  assert.equal(JSON.stringify(lista).includes(MARCADOR_DO_BUNDLE), false, "nenhum byte do bundle sai na listagem");
  assert.equal(ContentDocumentSchema.safeParse(parcial).success, false, "a cópia parcial não passa no schema do documento completo");

  for (const id of ["doc-a-v1", "doc-a-sem-dossie"]) {
    const documento = porId.get(id)!;
    assert.equal(listagem.isPartialContentDocument(documento), false);
    assert.deepEqual(documento, ContentDocumentSchema.parse(linhaDe(id).payload), `${id} sai igual ao parse do payload inteiro`);
  }
  /* Chave ausente continua ausente: o v1 sem `writingBrief` não ganha um. */
  assert.equal("writingBrief" in porId.get("doc-a-v1")!, false);
});

test("03 · PARIDADE: a cópia parcial + o bundle gravado = o documento que a mesa devolvia", async () => {
  semear();
  const lista = await new ContentDocumentRepository().list(MARCA_A, ATOR);
  const parcial = lista.find(item => item.document.id === "doc-a")!.document;
  assert.ok(listagem.isPartialContentDocument(parcial));
  const gravado = linhaDe("doc-a").payload as ReturnType<typeof documentoV2ComDossie>;
  const deHoje = ContentDocumentSchema.parse(gravado);

  const completo = listagem.completeWithStoredBundle(parcial, {
    bundleId: gravado.importedContext.dossier.bundleId, bundleHash: gravado.importedContext.dossier.bundleHash, bundle: gravado.importedContext.dossier.bundle,
  });
  assert.deepEqual(completo, deHoje);
  assert.equal(await contentHash(completo), await contentHash(deHoje), "o hash não muda");
  /* E o caminho inverso: a forma de listagem do completo é a cópia da listagem. */
  assert.deepEqual(listagem.toListingForm(deHoje), parcial);
  assert.deepEqual(listagem.toListingForm(parcial), parcial, "idempotente");
});

test("04 · tamanho: a listagem não cresce com o bundle", async () => {
  const medir = async (enchimento: number) => {
    semear();
    Object.assign(linhaDe("doc-a"), { payload: structuredClone(documentoV2ComDossie("doc-a", bundleDoRadar(enchimento))) });
    pedidos.length = 0;
    await new ContentDocumentRepository().list(MARCA_A, ATOR);
    const [leitura] = pedidosA("content_documents", "GET");
    const inteiro = JSON.stringify(banco.content_documents.filter(item => item.marca_id === MARCA_A).map(item => ({ id: item.id, payload: item.payload }))).length;
    return { listagem: leitura.bytes, inteiro };
  };
  const pequeno = await medir(20_000);
  const grande = await medir(400_000);
  assert.ok(grande.inteiro > 400_000, `o payload inteiro carrega o bundle (${grande.inteiro} bytes)`);
  assert.equal(grande.listagem, pequeno.listagem, "bundle 20x maior, listagem do mesmo tamanho");
  assert.ok(grande.listagem < 12_000, `listagem com ${grande.listagem} bytes contra ${grande.inteiro} do payload inteiro`);
});

test("05 · o select deriva do schema: todo campo entra, só o bundle fica de fora", () => {
  const select = listagem.CONTENT_DOCUMENT_LISTING_SELECT;
  const campos = new Set([...Object.keys(ContentDocumentV1Schema.shape), ...Object.keys(ContentDocumentV2Schema.shape)]);
  for (const campo of campos) {
    if (campo === "importedContext") continue;
    assert.ok(select.includes(`:payload->${campo},`) || select.endsWith(`:payload->${campo}`), `campo do documento fora da listagem: ${campo}`);
  }
  for (const campo of Object.keys(ImportedRadarContextSchema.shape)) {
    if (campo === "dossier") continue;
    assert.ok(select.includes(`:payload->importedContext->${campo}`), `campo do contexto fora da listagem: ${campo}`);
  }
  for (const campo of Object.keys(RadarWriterDossierSchema.shape)) {
    const pedido = select.split(",").some(item => item.endsWith(`:payload->importedContext->dossier->${campo}`));
    assert.equal(pedido, campo !== "bundle", `dossiê: ${campo}`);
  }
});

/* ======================= 2 · detalhe e isolamento ======================= */

test("06 · detalhe: UM documento, inteiro, filtrado por id e marca", async () => {
  semear();
  const detalhe = await new ContentDocumentRepository().findDetail(MARCA_A, "doc-a");
  assert.ok(detalhe);
  assert.deepEqual(detalhe.document, ContentDocumentSchema.parse(linhaDe("doc-a").payload));
  assert.equal(detalhe.lockVersion, 4);
  assert.equal(detalhe.updatedAt, "2026-09-23T10:00:00.000Z", "timestamptz do PostgREST normalizado");
  const [leitura] = pedidosA("content_documents", "GET");
  assert.equal(leitura.params.get("id"), "eq.doc-a");
  assert.equal(leitura.params.get("marca_id"), `eq.${MARCA_A}`);
});

test("07 · ISOLAMENTO: a marca B não lista, não abre e não completa documento da marca A", async () => {
  semear();
  const repositorio = new ContentDocumentRepository();
  const daB = await repositorio.list(MARCA_B, ATOR);
  assert.deepEqual(daB.map(item => item.document.id), ["doc-b"]);
  assert.equal(await repositorio.findDetail(MARCA_B, "doc-a"), null);
  const parcialDeA = listagem.toListingForm(ContentDocumentSchema.parse(linhaDe("doc-a").payload));
  assert.ok(listagem.isPartialContentDocument(parcialDeA));
  await assert.rejects(() => repositorio.completeWithStoredBundle(MARCA_B, "doc-a", parcialDeA), (erro: unknown) => erro instanceof OptimisticLockError);
});

/* ======================= 3 · a gravação preserva o bundle ======================= */

async function parcialEditada(id = "doc-a") {
  const completo = ContentDocumentSchema.parse(linhaDe(id).payload);
  const editado = ContentDocumentSchema.parse({ ...completo, blocks: [...completo.blocks, { id: "b3", type: "paragraph", text: "Texto novo.", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } }] });
  return { completo, editado, parcial: listagem.toListingForm(editado) };
}

test("08 · PATCH com a cópia PARCIAL grava o documento completo: o bundle continua no banco", async () => {
  semear();
  const bundleOriginal = structuredClone((linhaDe("doc-a").payload as ReturnType<typeof documentoV2ComDossie>).importedContext.dossier.bundle);
  const { editado, parcial } = await parcialEditada();
  const resposta = await patch({ brandId: MARCA_A, documentId: "doc-a", expectedLockVersion: 4, document: parcial, contentHash: "sha256:" + "0".repeat(64) });
  assert.equal(resposta.status, 200, await resposta.clone().text());

  const gravada = linhaDe("doc-a");
  const payload = gravada.payload as ReturnType<typeof documentoV2ComDossie>;
  assert.deepEqual(payload.importedContext.dossier.bundle, bundleOriginal, "o bundle gravado é o de antes, verbatim");
  assert.equal("bundleOmitted" in payload.importedContext.dossier, false, "o marcador nunca é gravado");
  assert.deepEqual(ContentDocumentSchema.parse(payload), editado, "o texto editado entrou");
  assert.equal(gravada.content_hash, await contentHash(editado), "o hash é o do documento gravado, não o do cliente");
  assert.equal(gravada.lock_version, 5);

  const [escrita] = pedidosA("content_documents", "PATCH");
  assert.equal(escrita.params.get("marca_id"), `eq.${MARCA_A}`, "R4: o UPDATE casa por id E marca");
  assert.equal(escrita.params.get("lock_version"), "eq.4");
  const [leituraDoBundle] = pedidosA("content_documents", "GET");
  assert.equal(leituraDoBundle.params.get("marca_id"), `eq.${MARCA_A}`);
  assert.match(String(leituraDoBundle.params.get("select")), /bundle:payload->importedContext->dossier->bundle/, "o bundle vem da própria linha");
  const corpo = await resposta.json();
  assert.equal(corpo.lockVersion, 5);
  assert.equal(corpo.contentHash, await contentHash(editado));
});

test("09 · PATCH parcial com lock vencido: 409 e nada é gravado", async () => {
  semear();
  const { parcial } = await parcialEditada();
  const antes = structuredClone(linhaDe("doc-a"));
  const resposta = await patch({ brandId: MARCA_A, documentId: "doc-a", expectedLockVersion: 3, document: parcial, contentHash: "sha256:" + "0".repeat(64) });
  assert.equal(resposta.status, 409);
  assert.deepEqual(linhaDe("doc-a"), antes);
});

test("10 · PATCH parcial que declara OUTRO pacote: 409 e nada é gravado", async () => {
  semear();
  const { parcial } = await parcialEditada();
  const outroPacote = structuredClone(parcial) as { importedContext: { dossier: { bundleHash: string } } };
  outroPacote.importedContext.dossier.bundleHash = "bundle-hash:outro";
  const antes = structuredClone(linhaDe("doc-a"));
  const resposta = await patch({ brandId: MARCA_A, documentId: "doc-a", expectedLockVersion: 4, document: outroPacote, contentHash: "sha256:" + "0".repeat(64) });
  assert.equal(resposta.status, 409);
  assert.deepEqual(linhaDe("doc-a"), antes);
  assert.equal(pedidosA("content_documents", "PATCH").length, 0);
});

test("11 · PATCH parcial em nome de outra marca: 409; o documento da marca A não muda", async () => {
  semear();
  const { parcial } = await parcialEditada();
  const antes = structuredClone(linhaDe("doc-a"));
  const resposta = await patch({ brandId: MARCA_B, documentId: "doc-a", expectedLockVersion: 4, document: parcial, contentHash: "sha256:" + "0".repeat(64) });
  assert.equal(resposta.status, 409);
  assert.deepEqual(linhaDe("doc-a"), antes);
});

test("12 · PATCH com o documento COMPLETO: igual a antes — o hash é o do cliente", async () => {
  semear();
  const { editado } = await parcialEditada();
  const hashDoCliente = await contentHash(editado);
  const resposta = await patch({ brandId: MARCA_A, documentId: "doc-a", expectedLockVersion: 4, document: editado, contentHash: hashDoCliente });
  assert.equal(resposta.status, 200);
  assert.deepEqual(ContentDocumentSchema.parse(linhaDe("doc-a").payload), editado);
  assert.equal(linhaDe("doc-a").content_hash, hashDoCliente);
  assert.equal(pedidosA("content_documents", "GET").length, 0, "o caminho normal não lê o bundle");
});

test("13 · R4: PATCH completo em nome de outra marca não grava o documento da marca A", async () => {
  semear();
  const { editado } = await parcialEditada();
  const antes = structuredClone(linhaDe("doc-a"));
  const resposta = await patch({ brandId: MARCA_B, documentId: "doc-a", expectedLockVersion: 4, document: editado, contentHash: await contentHash(editado) });
  assert.equal(resposta.status, 409, "o UPDATE por id sem marca gravava aqui");
  assert.deepEqual(linhaDe("doc-a"), antes);
});

/* ======================= 4 · a rota de detalhe ======================= */

test("14 · GET do detalhe: documento inteiro, com a permissão da listagem", async () => {
  semear();
  const resposta = await get(`brandId=${MARCA_A}&documentId=doc-a`);
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  const detalhe = PersistedDocumentDetailSchema.parse(corpo.data);
  assert.equal(detalhe.brandId, MARCA_A);
  assert.deepEqual(detalhe.document, ContentDocumentSchema.parse(linhaDe("doc-a").payload));
  assert.equal(JSON.stringify(corpo).includes(MARCADOR_DO_BUNDLE), true, "o detalhe traz o bundle");
  assert.equal(detalhe.lockVersion, 4);
  assert.deepEqual((globalThis as { __permissoesPedidas?: string[] }).__permissoesPedidas, [`${MARCA_A}:marca:view`]);
});

test("15 · GET do detalhe: outra marca é 404, marca negada é 403, marca inválida é 400", async () => {
  semear();
  assert.equal((await get(`brandId=${MARCA_B}&documentId=doc-a`)).status, 404);
  (globalThis as { __marcasNegadas?: string[] }).__marcasNegadas = [MARCA_A];
  assert.equal((await get(`brandId=${MARCA_A}&documentId=doc-a`)).status, 403);
  assert.equal((await get(`brandId=nao-e-uuid&documentId=doc-a`)).status, 400);
  assert.equal((await get(`brandId=${MARCA_A}`)).status, 400);
});

/* ======================= 5 · contratos ======================= */

test("16 · contratos: o completo segue estrito; a parcial só entra onde é esperada", () => {
  const completo = ContentDocumentSchema.parse(documentoV2ComDossie());
  const parcial = listagem.toListingForm(completo);
  assert.equal(ContentDocumentSchema.safeParse(parcial).success, false);
  assert.equal(PersistedDocumentDetailSchema.safeParse({ brandId: MARCA_A, document: parcial, lockVersion: 1, contentHash: "h", updatedAt: "2026-09-23T10:00:00.000000+00:00" }).success, false, "o detalhe nunca é parcial");
  const registro = (document: unknown) => ({ document, lockVersion: 1, contentHash: "h", updatedAt: "2026-09-23T10:00:00.000000+00:00", userState: null });
  assert.equal(PersistedDocumentSchema.safeParse(registro(parcial)).success, true);
  assert.equal(PersistedDocumentSchema.safeParse(registro(completo)).success, true, "o completo continua aceito");
  const entrada = (document: unknown) => ({ brandId: MARCA_A, documentId: completo.id, expectedLockVersion: 1, document, contentHash: "h" });
  assert.equal(DocumentSaveInputSchema.safeParse(entrada(parcial)).success, true);
  assert.deepEqual(DocumentSaveInputSchema.parse(entrada(completo)).document, completo, "o completo sai como sairia antes");
  /* O marcador sem o resto não passa: parcial é só a forma exata da listagem. */
  const falsa = structuredClone(completo) as unknown as { importedContext: { dossier: Record<string, unknown> } };
  falsa.importedContext.dossier.bundleOmitted = true;
  assert.equal(DocumentSaveInputSchema.safeParse(entrada(falsa)).success, false, "bundle e marcador juntos é recusado");
});

test("17 · a cópia local aceita a forma de listagem e a cópia antiga, com o documento inteiro", () => {
  const completo = ContentDocumentSchema.parse(documentoV2ComDossie());
  const recuperacao = (documents: Record<string, unknown>) => ({
    schemaVersion: 1, architectImportedKeywordIds: [], articleVersions: {}, siloVersions: {}, versionEvents: [], contentPlans: {},
    documents, radarItems: [], plannerItems: [], operationalPublications: [], documentLocks: {}, selectedEntityId: null, savedAt: "2026-09-23T10:00:00.000Z",
  });
  assert.equal(LocalWorkflowRecoverySchema.safeParse(recuperacao({ [completo.id]: listagem.toListingForm(completo) })).success, true);
  assert.equal(LocalWorkflowRecoverySchema.safeParse(recuperacao({ [completo.id]: completo })).success, true, "cópia gravada antes do E1 continua legível");
  const formas = listagem.toListingForms({ [completo.id]: completo, v1: ContentDocumentSchema.parse(documentoV1("v1")) });
  assert.equal(listagem.isPartialContentDocument(formas[completo.id]), true);
  assert.equal(JSON.stringify(formas).includes(MARCADOR_DO_BUNDLE), false, "a cópia local não guarda o bundle");
});

/* ======================= 6 · a memória empresta o bundle só do mesmo pacote ======================= */

test("18 · releitura: o documento completo na memória continua completo quando o pacote é o mesmo", () => {
  const completo = ContentDocumentSchema.parse(documentoV2ComDossie());
  const chegou = listagem.toListingForm(ContentDocumentSchema.parse({ ...completo, title: "Título novo do servidor" }));
  const fundido = listagem.mergeListedDocument(completo, chegou);
  assert.equal(listagem.isPartialContentDocument(fundido), false);
  assert.equal(fundido.title, "Título novo do servidor", "os campos vêm da leitura nova");
  type ComDossie = { importedContext: { dossier: unknown } };
  assert.deepEqual((fundido as unknown as ComDossie).importedContext.dossier, (completo as unknown as ComDossie).importedContext.dossier);

  /* Pacote diferente: a memória não empresta — o documento fica parcial e o Redator relê. */
  const outroPacote = structuredClone(chegou) as { importedContext: { dossier: { bundleHash: string } } };
  outroPacote.importedContext.dossier.bundleHash = "bundle-hash:outro";
  assert.equal(listagem.isPartialContentDocument(listagem.mergeListedDocument(completo, outroPacote as never)), true);
  /* Sem nada na memória, a parcial fica parcial. */
  assert.equal(listagem.isPartialContentDocument(listagem.mergeListedDocument(undefined, chegou)), true);
  /* E a leitura completa sempre vence. */
  const completoNovo = ContentDocumentSchema.parse({ ...completo, title: "outro" });
  assert.equal(listagem.mergeListedDocument(chegou, completoNovo), completoNovo);
  assert.equal(listagem.completeWithStoredBundle(chegou as never, { bundleId: "bundle:e1", bundleHash: "bundle-hash:e1", bundle: ["não é registro"] }), null);
  assert.equal(bundleDoRadar().marcador, MARCADOR_DO_BUNDLE);
});

/* ======================= 7 · estrutural ======================= */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("19 · ESTRUTURAL · a rota completa a cópia antes de guardião, reuso e save, e grava por marca", () => {
  const fonte = semComentarios(readFileSync(new URL("../app/api/editorial/documents/route.ts", import.meta.url), "utf8"));
  const finalizacao = semComentarios(readFileSync(new URL("../lib/server/writer-document-finalization.ts", import.meta.url), "utf8"));
  const completa = fonte.indexOf("repository.completeWithStoredBundle(");
  assert.ok(completa > 0);
  for (const depois of ["saveAndFinalizeWriterDocument({", "contentHash: hash,"]) {
    assert.ok(fonte.indexOf(depois) > completa, `${depois} usa o documento completo`);
  }
  for (const gate of ["runGuardian(input.document, input.contentHash)", "reuseFinalizedArticleVersion({", "repository.save(input.documentId, input.expectedLockVersion, input.document, input.contentHash, input.actorId, input.brandId)"]) {
    assert.ok(finalizacao.includes(gate), `${gate} permanece no núcleo compartilhado`);
  }
  /* `input.document` seguido de vírgula ou parêntese: `input.documentId` não conta. */
  assert.doesNotMatch(fonte, /runGuardian\(input\.document[,)]|repository\.save\([^)]*input\.document[,)]/);
  const repositorio = semComentarios(readFileSync(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8"));
  const lista = repositorio.slice(repositorio.indexOf("async list(marcaId: string, userId: string)"), repositorio.indexOf("async findDetail("));
  assert.doesNotMatch(lista, /select\("id,payload/, "a listagem não volta a pedir a coluna inteira");
  assert.match(lista, /CONTENT_DOCUMENT_LISTING_SELECT/);
});

test("20 · ESTRUTURAL · Publicações exporta o documento COMPLETO: a cópia parcial busca o detalhe antes", () => {
  const fonte = semComentarios(readFileSync(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8"));
  const exportar = fonte.slice(fonte.indexOf("const exportPublication = async"), fonte.indexOf("const exportManifest"));
  assert.match(exportar, /const document = isPartialContentDocument\(listado\) \? await pipeline\.loadDocumentDetail\(listado\.id\) : listado;/);
  assert.ok(exportar.indexOf("loadDocumentDetail(") < exportar.indexOf("createPublicationExport(publication, document, format)"), "detalhe antes de exportar");
  /* A biblioteca continua projetando a MESMA lista da mesa. */
  assert.match(fonte, /documents: Object\.values\(pipeline\.documents\)/);
});

/*
 * Os literais `LocalWorkflowRecoverySchema.parse({ ... })` do provider, por
 * casamento de chaves. Cada um é uma gravação da cópia local, exceto a
 * migração da cópia antiga na restauração (que lê `partial.documents` e é
 * rebaixada à forma de listagem logo depois, na aplicação).
 */
function literaisDaCopiaLocal(fonte: string): string[] {
  const inicio = "LocalWorkflowRecoverySchema.parse({";
  const literais: string[] = [];
  for (let posicao = fonte.indexOf(inicio); posicao >= 0; posicao = fonte.indexOf(inicio, posicao + 1)) {
    let profundidade = 0;
    let fim = posicao + inicio.length - 1;
    for (; fim < fonte.length; fim += 1) {
      if (fonte[fim] === "{") profundidade += 1;
      if (fonte[fim] === "}" && --profundidade === 0) break;
    }
    literais.push(fonte.slice(posicao, fim + 1));
  }
  return literais;
}

test("21 · ESTRUTURAL · as TRÊS gravações da cópia local guardam a forma de listagem (sem o bundle)", () => {
  const fonte = semComentarios(readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8"));
  const literais = literaisDaCopiaLocal(fonte);
  const gravacoes = literais.filter(literal => !literal.includes("partial.documents"));
  const migracoes = literais.filter(literal => literal.includes("partial.documents"));
  assert.equal(migracoes.length, 1, "só a migração da cópia antiga lê `partial.documents`");
  assert.equal(gravacoes.length, 3, "saveLocalSerpRecovery, saveLocalRadarAnalysisRecovery e a cópia de continuidade");
  for (const literal of gravacoes) {
    const documentos = literal.match(/\bdocuments:\s*([^\n]*)/);
    assert.ok(documentos, "toda gravação declara `documents`");
    assert.match(documentos[1], /^toListingForms\(/, `gravação local sem toListingForms: ${documentos[1]}`);
  }
  /* A restauração rebaixa qualquer cópia (inclusive a antiga, inteira) antes de aplicar. */
  assert.match(fonte, /documents: \{ \.\.\.toListingForms\(recovered\.documents\), \.\.\.current\.documents \}/);
});

test("22 · CUSTO NO BANCO · a projeção tem 29 seletores de caminho; cada um descomprime o payload inteiro", () => {
  /*
   * Medido no remoto em 2026-09-23 (EXPLAIN ANALYZE sobre agregado, só
   * leitura): com os 29 seletores, ~0,79 s para os 2 documentos (1 grande, de
   * ~4,5 MB); a leitura antiga da coluna inteira, ~0,08-0,12 s. O custo é por
   * documento grande (~0,8 s cada) e o PostgREST corta em 8 s
   * (statement_timeout do `authenticator`): ~8 a 9 documentos v2 com dossiê
   * derrubam a seção `documents` da mesa. Um campo novo no schema acrescenta
   * um seletor e ~27 ms por documento grande. Se este número mudar, a medição
   * e o gate da view/coluna gerada da listagem (SDD de egress, E1) precisam
   * ser revistos ANTES de aceitar o novo número.
   */
  const seletores = listagem.CONTENT_DOCUMENT_LISTING_SELECT.split(",");
  assert.equal(seletores.length, 29, `seletores de caminho na listagem: ${seletores.length}`);
  assert.ok(seletores.every(item => /^[a-z]_[A-Za-z]+:payload->/.test(item)), "todo seletor é um caminho dentro de `payload`");
});

test("23 · o rascunho de recuperação por documento nunca traz o bundle do navegador", () => {
  const servidor = ContentDocumentSchema.parse(documentoV2ComDossie("doc-r"));
  type ComDossie = { importedContext: { dossier: { bundle: Record<string, unknown>; bundleHash: string } }; title: string };
  const adulterado = structuredClone(servidor) as unknown as ComDossie;
  adulterado.title = "Texto do rascunho local";
  adulterado.importedContext.dossier.bundle = { adulterado: true };
  const aplicado = listagem.recoveryOverServerDocument(servidor, ContentDocumentSchema.parse(adulterado)) as unknown as ComDossie | null;
  assert.ok(aplicado, "mesmo pacote: o rascunho se aplica");
  assert.equal(aplicado.title, "Texto do rascunho local", "o que o Redator edita vem do rascunho");
  assert.deepEqual(aplicado.importedContext.dossier.bundle, (servidor as unknown as ComDossie).importedContext.dossier.bundle, "o bundle vem do servidor");

  const outroPacote = structuredClone(servidor) as unknown as ComDossie;
  outroPacote.importedContext.dossier.bundleHash = "sha256:outro-pacote";
  assert.equal(listagem.recoveryOverServerDocument(servidor, ContentDocumentSchema.parse(outroPacote)), null, "outro pacote: não se aplica");
  assert.equal(listagem.recoveryOverServerDocument(servidor, ContentDocumentSchema.parse(documentoV2ComDossie("outro-doc"))), null, "outro documento: não se aplica");
  const v1 = ContentDocumentSchema.parse(documentoV1("doc-v1"));
  const v1Editado = ContentDocumentSchema.parse({ ...v1, title: "v1 editado" });
  assert.deepEqual(listagem.recoveryOverServerDocument(v1, v1Editado), v1Editado, "v1 (sem pacote): comportamento de antes");
});
