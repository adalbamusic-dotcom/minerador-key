import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/**
 * ===== PUBLICAÇÕES · A ENTREGA DO REDATOR CHEGA À FILA (2026-10-18) =====
 *
 * Defeito 1 do inventário de botões (docs/compartilhado/inventario-botoes-e-linha-2026-10-18.md):
 * "Enviar a Publicações" criava o registro em rascunho e nada o levava a
 * "pronto para exportar"; `importApproved` não tinha chamador; "Colocar na
 * fila" nunca aparecia para artigo novo; "Importe pelo seletor" apontava para
 * um seletor que não existe mais.
 *
 * O conserto fica DENTRO da linha: o mesmo núcleo do botão (e da ferramenta MCP),
 * `sendWriterToPublications`, chama o `importApproved` que já existia. Este
 * arquivo roda o núcleo inteiro contra um PostgREST simulado (o cliente é o
 * `supabase-js` real; só o `fetch` é trocado, e ele recusa rede):
 *
 *   novo        documento aprovado entregue nasce `ready_to_export`;
 *   reenvio     registro antigo parado em rascunho avança no reenvio, sem duplicar;
 *   fila        registro já na fila, exportado ou publicado não volta;
 *   isolamento  outra marca não é tocada;
 *   tela        "Colocar na fila" é o botão do estado `ready_to_export`, e o texto
 *               do seletor que não existe saiu.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

/* A divergência bloqueante lê outra tabela, com outro cliente: aqui, nenhuma aberta. */
const STUBS: Record<string, string> = {
  "./writer-evidence-divergences": "export async function checkOpenBlockingWriterDivergence() { return { status: 'read', blocking: false }; }",
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);

type Linha = Record<string, unknown>;
const banco: Record<string, Linha[]> = { content_documents: [], editorial_artifact_versions: [], publication_records: [] };
const escritas: Array<{ metodo: string; tabela: string; marca: string | null }> = [];

function casa(linha: Linha, params: URLSearchParams): boolean {
  for (const [coluna, filtro] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(coluna)) continue;
    const valor = linha[coluna] === null || linha[coluna] === undefined ? "null" : String(linha[coluna]);
    if (filtro.startsWith("eq.")) { if (valor !== filtro.slice(3)) return false; continue; }
    throw new Error(`filtro não simulado: ${coluna}=${filtro}`);
  }
  return true;
}
function projeta(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return structuredClone(linha);
  return Object.fromEntries(select.split(",").map(coluna => [coluna, structuredClone(linha[coluna] ?? null)]));
}
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
let proximoId = 1;

globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname !== "supabase.teste.invalid") throw new Error(`rede real proibida neste teste: ${url.href}`);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  const metodo = String(init?.method || "GET").toUpperCase();
  const select = url.searchParams.get("select");
  const linhas = (banco[tabela] ||= []).filter(linha => casa(linha, url.searchParams));
  if (metodo === "GET") return json(linhas.map(linha => projeta(linha, select)));
  if (metodo === "POST") {
    /* upsert com ignoreDuplicates em (marca_id, article_id): linha existente não muda. */
    const corpo = JSON.parse(String(init?.body || "{}")) as Linha;
    escritas.push({ metodo, tabela, marca: String(corpo.marca_id) });
    const existe = banco[tabela].some(linha => linha.marca_id === corpo.marca_id && linha.article_id === corpo.article_id);
    if (existe) return json([]);
    const nova = { id: `linha-${proximoId++}`, lock_version: 1, updated_at: "2026-10-18T12:00:00.000000+00:00", ...corpo };
    banco[tabela].push(nova);
    return json([projeta(nova, select)]);
  }
  if (metodo === "PATCH") {
    const mudanca = JSON.parse(String(init?.body || "{}")) as Linha;
    for (const linha of linhas) {
      escritas.push({ metodo, tabela, marca: String(linha.marca_id) });
      Object.assign(linha, mudanca);
      /* publication_records_touch_trg: todo UPDATE incrementa o lock. */
      linha.lock_version = Number(linha.lock_version) + 1;
      linha.updated_at = "2026-10-18T12:05:00.000000+00:00";
    }
    return json(linhas.map(linha => projeta(linha, select)));
  }
  throw new Error(`método não simulado: ${metodo} ${tabela}`);
}) as typeof fetch;

const { sendWriterToPublications } = await import("../lib/server/writer-publication-handoff.ts");
const { contentHash } = await import("../lib/arquiteto/versioning.ts");
const { documentoV2SemDossie } = await import("./editorial-documento-e1-fixtures.mts");

const MARCA_A = "5f0c3a52-8d4e-4b7a-9c61-2e8f4a1b7c90";
const MARCA_B = "7a1d2e3f-4b5c-4d6e-8f90-1a2b3c4d5e6f";
const ATOR = "ator-de-teste";

async function semear() {
  const base = documentoV2SemDossie("doc-entrega");
  const documento = {
    ...base, status: "aprovado" as const,
    blocks: [
      { id: "h1", type: "heading" as const, level: 1, text: "Rotina de skin care noturno", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } },
      { id: "p1", type: "paragraph" as const, text: "Primeiro, limpe a pele com cuidado.", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } },
    ],
  };
  const hash = await contentHash(documento);
  banco.content_documents = [MARCA_A, MARCA_B].map(marca => ({
    id: "doc-entrega", marca_id: marca, article_id: "artigo-e1", article_dna_version_id: "artigo-e1-v1",
    payload: structuredClone(documento), content_hash: hash, status: "approved",
  }));
  banco.editorial_artifact_versions = [MARCA_A, MARCA_B].map(marca => ({
    marca_id: marca, version_id: "artigo-e1-v1", payload: { payload: { suggestedSlug: "skin-care-noturno", hierarchy: "suporte" } },
  }));
  banco.publication_records = [];
  escritas.length = 0;
}
const registroDa = (marca: string) => banco.publication_records.find(linha => linha.marca_id === marca);

test("novo · documento aprovado entregue nasce pronto para exportar (Colocar na fila aparece)", async () => {
  await semear();
  const resultado = await sendWriterToPublications({ brandId: MARCA_A, documentId: "doc-entrega", actorId: ATOR });
  assert.equal(resultado.change, "CREATED");
  assert.equal(resultado.publication.state, "ready_to_export", "o readback devolve o estado que a Fila lê");
  assert.equal(registroDa(MARCA_A)?.status, "ready_to_export");
  assert.equal(registroDa(MARCA_B), undefined, "outra marca não ganhou registro");
  assert.ok(escritas.every(escrita => escrita.marca === MARCA_A), "nenhuma escrita fora da marca");
});

test("reenvio · registro antigo parado em rascunho avança, sem duplicar", async () => {
  await semear();
  await sendWriterToPublications({ brandId: MARCA_A, documentId: "doc-entrega", actorId: ATOR });
  /* O estado que o defeito deixou no banco: registro criado e preso em rascunho. */
  const preso = registroDa(MARCA_A)!;
  preso.status = "draft";
  preso.payload = { ...(preso.payload as Linha), state: "draft" };
  const resultado = await sendWriterToPublications({ brandId: MARCA_A, documentId: "doc-entrega", actorId: ATOR });
  assert.equal(resultado.change, "ALREADY_SENT");
  assert.equal(resultado.publication.state, "ready_to_export");
  assert.equal(banco.publication_records.filter(linha => linha.marca_id === MARCA_A).length, 1, "não duplica");
});

test("fila · registro já na fila, exportado ou publicado não volta no reenvio", async () => {
  for (const estado of ["queued", "exported", "published"]) {
    await semear();
    await sendWriterToPublications({ brandId: MARCA_A, documentId: "doc-entrega", actorId: ATOR });
    const linha = registroDa(MARCA_A)!;
    linha.status = estado;
    linha.payload = { ...(linha.payload as Linha), state: estado };
    const lockAntes = linha.lock_version;
    const resultado = await sendWriterToPublications({ brandId: MARCA_A, documentId: "doc-entrega", actorId: ATOR });
    assert.equal(resultado.publication.state, estado, `${estado} ficou como estava`);
    assert.equal(linha.lock_version, lockAntes, `${estado}: nenhuma escrita`);
  }
});

function semComentarios(caminho: string) {
  return readFileSync(new URL(caminho, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("linha · o handoff chama o importApproved entre PERSISTIR e RELER, e não há segunda porta", () => {
  const servico = readFileSync(new URL("../lib/server/writer-publication-handoff.ts", import.meta.url), "utf8");
  const persistir = servico.indexOf("5. PERSISTIR");
  const importar = servico.indexOf("repositorio.importApproved(");
  const reler = servico.indexOf("6. RELER DO SERVIDOR");
  assert.ok(persistir > 0 && importar > persistir && reler > importar, "a ordem do handoff");
  const tela = semComentarios("../modules/publicacoes/publications-workspace.tsx");
  assert.equal(/importApproved/.test(tela), false, "a tela não ganhou porta de importação própria");
  assert.equal(/Importe pelo seletor/.test(tela), false, "o texto do seletor inexistente saiu");
  assert.match(tela, /row\.state === "ready_to_export"\) return[\s\S]{0,400}Colocar na fila/, "Colocar na fila continua o botão do pronto para exportar");
});
