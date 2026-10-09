import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { HOST_DO_BANCO, MARCA, instalarPostgrestSimulado, semearBanco, type Banco } from "./radar-export-leitura-fixtures.mts";

/*
 * ===== 2026-10-09 · A LISTA DO RADAR VEM DO SERVIDOR, OU A TELA DIZ QUE NÃO VEIO =====
 *
 * Visto em produção (marca adalbapro): depois de exportar os 8 CSVs do Silo, a
 * planilha do Radar ficou com 1 linha só — o artigo piloto. O banco tinha os 9
 * itens (leitura só de dados nesta data). A leitura da mesa
 * (GET /api/editorial/workspace) montava 10,95 MB (4,17 MB de itens do Radar e
 * 6,55 MB de versões de ArticleDNA), e a função da Vercel recusa corpo acima de
 * 4,5 MB. A planilha seguia na cópia local do navegador e não avisava; a
 * importação seguinte mandou versões dessa cópia.
 *
 * Correção, pelo caminho do piloto (o export já saía em fluxo):
 *   1 · a mesa sai em fluxo, com o MESMO helper do export, o mesmo JSON;
 *   2 · com linhas na tela, a leitura que falhou aparece, com "Tentar carregar
 *       novamente";
 *   3 · a importação espera a lista do servidor;
 *   4 · a importação responde por artigo (`refused`), sem carimbar uma frase só
 *       em todos, e o aviso nomeia o artigo pelo título e pelo slug.
 *
 * PROVIDER_CALLS = 0: o `fetch` só fala com o banco simulado.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${HOST_DO_BANCO}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return globalThis.__perfilDaMesaDeTeste; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
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

/* A view da listagem devolve as mesmas linhas da tabela (o banco simulado não tem view). */
const comListagem = (banco: Banco): Banco => ({ ...banco, editorial_workflow_items_listagem: banco.editorial_workflow_items });
let banco: Banco = comListagem(semearBanco());
const { pedidos, foraDoBanco } = instalarPostgrestSimulado(() => banco);
(globalThis as Record<string, unknown>).__perfilDaMesaDeTeste = { userId: "ator-de-teste" };

const rota = await import("../app/api/editorial/workspace/route.ts");
const { NextRequest } = await import("next/server");
const { radarPortableExportStreamResponse, RADAR_EXPORT_STREAM_CHUNK_BYTES } = await import("../lib/radar/portable-export-response.ts");
const {
  RADAR_IMPORT_NEEDS_SERVER_LIST,
  radarImportBlockedByListRead,
  radarImportNoticeLabel,
  radarListReadFailed,
  radarListReadFailureNotice,
} = await import("../lib/radar/list-read-state.ts");

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const ler = (relativo: string) => readFileSync(new URL("../" + relativo, import.meta.url), "utf8");

async function lerFluxo(resposta: Response): Promise<{ pedacos: number; maior: number; texto: string }> {
  const leitor = resposta.body!.getReader();
  const partes: Uint8Array[] = [];
  let maior = 0;
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    partes.push(value);
    maior = Math.max(maior, value.byteLength);
  }
  return { pedacos: partes.length, maior, texto: Buffer.concat(partes).toString("utf8") };
}

/* ============================== 1 · a mesa em fluxo ============================== */

test("1 · a rota da mesa responde em fluxo pelo MESMO helper do export, com o mesmo JSON", () => {
  const rotaFonte = semComentarios(ler("app/api/editorial/workspace/route.ts"));
  assert.match(rotaFonte, /return radarPortableExportStreamResponse\(\{ requestId, data: parsed\.data \}\);/);
  assert.doesNotMatch(rotaFonte, /NextResponse\.json\(\{ requestId, data: parsed\.data \}\)/, "o corpo grande voltou a sair inteiro");
  assert.match(rotaFonte, /import \{ radarPortableExportStreamResponse \} from "@\/lib\/radar\/portable-export-response";/);
});

test("1 · corpo acima do teto de 4,5 MB sai em pedaços e chega inteiro", async () => {
  const corpo = { requestId: "r", data: { radarItems: [{ titulo: "instagram não traz pacientes", texto: "ç".repeat(3 * 1024 * 1024) }] } };
  const resposta = radarPortableExportStreamResponse(corpo);
  const { pedacos, maior, texto } = await lerFluxo(resposta);
  assert.ok(Buffer.byteLength(texto) > 4.5 * 1024 * 1024, "o caso tem de passar do teto da Vercel");
  assert.ok(pedacos > 20);
  assert.ok(maior <= RADAR_EXPORT_STREAM_CHUNK_BYTES);
  assert.deepEqual(JSON.parse(texto), corpo, "o acento cortado entre dois pedaços volta inteiro");
});

test("1 · a rota real, sobre o banco simulado: 200, em fluxo, com todos os itens do Radar, só leitura", async () => {
  banco = comListagem(semearBanco());
  pedidos.length = 0;
  const resposta = await rota.GET(new NextRequest(`http://localhost/api/editorial/workspace?marcaId=${MARCA}`));
  assert.equal(resposta.status, 200);
  assert.match(resposta.headers.get("content-type") || "", /application\/json/);
  assert.ok(resposta.body instanceof ReadableStream);
  const corpo = await resposta.json() as { requestId: string; data: { radarItems: Array<{ articleId: string }>; loadDiagnostics: { state: string; incompatible: Array<{ id: string; paths: string[] }> } } };
  assert.equal(typeof corpo.requestId, "string");
  /* O fluxo entrega tudo o que a leitura devolveu: o que o repositório lê (itens + incompatíveis nomeados) chega inteiro. */
  const lidos = await new (await import("../lib/server/editorial-repositories.ts")).WorkflowRepository().list(MARCA);
  assert.deepEqual(corpo.data.radarItems.map(item => item.articleId).sort(), lidos.radar.map((item: { articleId: string }) => item.articleId).sort());
  assert.equal(corpo.data.radarItems.length + lidos.incompatible.length, banco.editorial_workflow_items.length, JSON.stringify(corpo.data.loadDiagnostics.incompatible));
  assert.ok(corpo.data.radarItems.length > 1);
  assert.notEqual(corpo.data.loadDiagnostics.state, "read_failure");
  assert.ok(pedidos.every(pedido => pedido.metodo === "GET"));
  assert.deepEqual(foraDoBanco, []);
});

/* ============================== 2 e 3 · a tela diz quando a lista não veio ============================== */

const falhou = { state: "read_failure" as const, loadedCount: 0, incompatible: [], message: "A leitura remota falhou (HTTP 413)." };
const completo = { state: "complete" as const, loadedCount: 9, incompatible: [], message: null };

test("2 · leitura que falhou aparece com linhas na tela; vazio e leitura boa não ganham este aviso", () => {
  const aviso = radarListReadFailureNotice(falhou, 1);
  assert.ok(aviso);
  assert.match(aviso!, /A leitura remota falhou \(HTTP 413\)\./);
  assert.match(aviso!, /A planilha mostra só o que este navegador guardou; os artigos continuam salvos no servidor\./);
  assert.equal(radarListReadFailureNotice(falhou, 0), null, "a planilha vazia já tem a frase dela");
  assert.equal(radarListReadFailureNotice(completo, 9), null);
  assert.ok(radarListReadFailureNotice({ ...falhou, state: "access_denied", message: null }, 3));
  assert.equal(radarListReadFailed({ state: "partial" }), false, "parcial tem o aviso dos incompatíveis");
});

test("3 · a importação espera a lista do servidor", () => {
  assert.equal(radarImportBlockedByListRead(falhou), RADAR_IMPORT_NEEDS_SERVER_LIST);
  assert.equal(radarImportBlockedByListRead({ state: "access_denied" }), RADAR_IMPORT_NEEDS_SERVER_LIST);
  for (const state of ["complete", "empty_confirmed", "partial"] as const) assert.equal(radarImportBlockedByListRead({ state }), null, state);
  assert.match(RADAR_IMPORT_NEEDS_SERVER_LIST, /Tentar carregar novamente/);
});

test("2 e 3 · a tela usa as duas réguas: aviso na planilha e importação segurada", () => {
  const tela = semComentarios(ler("modules/radar/radar-page.tsx"));
  assert.match(tela, /const avisoDaLeituraDaLista = radarListReadFailureNotice\(diagnostico, pipeline\.radarItems\.length\);/);
  assert.match(tela, /\{avisoDaLeituraDaLista && <p[^>]*data-testid="radar-planilha-leitura-falhou">\{avisoDaLeituraDaLista\} <button type="button" className="underline" onClick=\{\(\) => void pipeline\.reloadOperational\(\)\}>Tentar carregar novamente<\/button><\/p>\}/);
  assert.match(tela, /const espera = radarImportBlockedByListRead\(pipeline\.loadDiagnostics\); if \(espera\) \{ setNotice\(espera\); return; \} setPicker\(true\);/);
});

/* ============================== 4 · a importação responde por artigo ============================== */

test("4 · o aviso nomeia o artigo pelo título e pelo slug, e separa os homônimos", () => {
  const moldura = "Cobrir com clareza o tema “como atrair clientes pelo whatsapp”.";
  assert.equal(radarImportNoticeLabel({ promise: moldura, slug: "como-atrair-clientes-pelo-whatsapp", fallback: "x" }), "como atrair clientes pelo whatsapp · /como-atrair-clientes-pelo-whatsapp");
  assert.notEqual(
    radarImportNoticeLabel({ promise: moldura, slug: "como-atrair-clientes-pelo-whatsapp", fallback: "a" }),
    radarImportNoticeLabel({ promise: moldura, slug: "whatsapp-para-clinicas", fallback: "b" }),
  );
  assert.equal(radarImportNoticeLabel({ promise: null, slug: null, fallback: "article-formation:62ade5c4" }), "article-formation:62ade5c4");
  const tela = semComentarios(ler("modules/radar/radar-page.tsx"));
  assert.match(tela, /radarImportNoticeLabel\(\{ promise: versao\?\.payload\.promise \?\? item\.label, slug: versao\?\.suggestedSlug, fallback: item\.label \}\)/);
});

test("4 · a rota de importação recusa por artigo, com código e motivo, e segue com os outros", () => {
  const rotaFonte = semComentarios(ler("app/api/editorial/workflow/route.ts"));
  const laco = rotaFonte.slice(rotaFonte.indexOf("for (const version of command.articleVersions)"), rotaFonte.indexOf("if (command.action === \"transition_radar\")"));
  for (const codigo of ["not_delivered", "already_in_radar", "not_ready", "ready_base_incomplete", "version_mismatch"]) {
    assert.match(laco, new RegExp(`new RecusaDeImportacao\\("${codigo}"`), codigo);
  }
  /* A recusa de regra (409) fica no artigo; a de infraestrutura continua parando o lote. */
  assert.match(laco, /if \(error instanceof AuthzError && error\.status === 409\) \{\s*refused\.push\(\{ articleId: version\.payload\.articleId, code: error instanceof RecusaDeImportacao \? error\.code : "refused", reason: error\.message \}\);\s*continue;\s*\}\s*throw error;/);
  assert.match(laco, /return NextResponse\.json\(\{ok:true,radarItems:confirmedRadar,readbackConfirmed:true,refused\}\);/);
  /* A regra de entrada é a mesma: Pronto para Radar na versão enviada. */
  assert.match(laco, /if \(ready\.data\.state !== "PRONTO_PARA_RADAR"\)/);
  assert.match(laco, /if \(base\.articleDnaVersionId !== version\.versionId\)/);
  assert.doesNotMatch(laco, /O artigo precisa estar Pronto para Radar sobre a versão enviada\./, "a frase única que caía em todos voltou");
});

test("4 · o cliente confere o readback só dos que entraram e devolve cada recusa com o motivo dela", () => {
  const contexto = semComentarios(ler("components/editorial-pipeline-context.tsx"));
  assert.match(contexto, /command\.articleVersions\.filter\(v=>!recusados\.has\(v\.payload\.articleId\)\)\.some\(/);
  assert.match(contexto, /return \{ok:true,radarItems:items,refused\};/);
  assert.match(contexto, /recusas\.filter\(recusa => recusa\.code !== "already_in_radar"\)/);
  assert.match(contexto, /blocked: \[\.\.\.resolvido\.blocked, \.\.\.bloqueados\]/);
  /* "Já está no Radar" não é bloqueio: entra na conta dos já existentes. */
  assert.match(contexto, /skipped: Math\.max\(0, candidates\.length - importados - bloqueados\.length\)/);
});
