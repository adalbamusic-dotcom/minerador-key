import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createMockPlanAndDocument } from "../lib/editorial/providers.ts";
/*
 * Leitor de evidências, Fase 1: o leitor do servidor roda nesta suíte
 * (test:redator:mcp, que resolve `@/` e `server-only`) sem mexer no
 * package.json. Ele injeta o próprio `fetch` no cliente e não toca o global
 * que este arquivo intercepta.
 */
import "./writer-evidence-reader.test.mts";
/* Etapa B2: divergências, pacote da IA interna e Guardião, contra o mesmo falso do leitor. */
import "./writer-evidence-divergencias.test.mts";

/*
 * O ALVO DO MCP DO REDATOR NÃO BAIXA O PAYLOAD SÓ PARA ACHAR A MARCA.
 *
 * Medido em 2026-09-23: o documento que o MCP usa tem 4.479.508 B de payload,
 * e toda ferramenta com documentId o baixava inteiro em resolveTarget, mesmo
 * as que só precisam de marca_id. Aqui o Supabase é falso: o fetch global é
 * interceptado e cada consulta ao PostgREST fica registrada com a tabela e as
 * colunas pedidas. Nada sai da máquina e nenhum crédito é gasto.
 */

const SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";

const { createWriterServer } = await import("../app/api/mcp/redator/route.ts");
const { writerSeedDocument } = await import("../lib/server/writer-seed.ts");
const { WriterDeliverableError } = await import("../lib/server/writer-deliverables.ts");
const { runGuardian } = await import("../lib/redator/guardian.ts");
const { radarFoundationsOf } = await import("../lib/redator/radar-foundations.ts");
const { WRITER_BRIEF_SELECT, WRITER_DOCUMENT_VIEW_SELECT, WRITER_GUARDIAN_SELECT, WRITER_SEED_BUNDLE_SELECTS, WRITER_SEED_DOCUMENT_SELECT } = await import("../lib/redator/writer-document-reads.ts");
const { WRITER_EVIDENCE_LIMITS, writerEvidenceJsonBytes } = await import("../lib/redator/writer-evidence-catalog.ts");
const { ContentDocumentSchema } = await import("../lib/arquiteto/contracts.ts");
const { canonicalJson } = await import("../lib/arquiteto/versioning.ts");
const { bundleDoRadar, documentoV2ComDossie } = await import("./editorial-documento-e1-fixtures.mts");

type Principal = Parameters<typeof createWriterServer>[0];
type Query = { table: string; method: string; select: string | null; filters: string; responseBody: string };

const actorId = "00000000-0000-4000-8000-000000000004";
const agencyId = "00000000-0000-4000-8000-000000000002";
const brandA = { brandId: "00000000-0000-4000-8000-000000000003", brandName: "Care Glow", agencyId, scopes: ["writer.read", "writer.draft.write", "writer.media.brief"], grantId: "00000000-0000-4000-8000-000000000011", delegationId: null } as Principal["brands"][number];
const brandB = "00000000-0000-4000-8000-000000000005";
const documentA = "writer:doc-marca-a";
const documentB = "writer:doc-marca-b";

const { document } = await createMockPlanAndDocument(brandA.brandId);
const fullRows: Record<string, Record<string, unknown>> = {
  [documentA]: { id: documentA, marca_id: brandA.brandId, article_id: "article-a", payload: document, content_hash: "hash-a", lock_version: 3, status: "escrevendo", updated_at: "2026-09-23T10:00:00+00:00" },
  [documentB]: { id: documentB, marca_id: brandB, article_id: "article-b", payload: document, content_hash: "hash-b", lock_version: 1, status: "escrevendo", updated_at: "2026-09-23T10:00:00+00:00" },
};

/*
 * O documento do Radar da Fase 0: v2 válido no schema vigente, com um bundle
 * que carrega o que os fundamentos leem E o peso que eles não leem (links
 * observados, evidência). O marcador mora só no peso: se ele aparecer numa
 * resposta, a leitura estreita trouxe o que não devia.
 */
const PESO_NAO_LIDO = "PESO-NAO-LIDO-DA-FASE-0";
const documentV2 = "writer:doc-radar-v2";
const bundleRico = () => ({
  ...bundleDoRadar(2_000),
  competitiveBlueprint: { profile: "GOOGLE", observed: { comparablePages: 10 }, recommended: { mustAnswer: ["Qual a ordem da rotina?"], mustCover: ["ácido salicílico"] } },
  crossSerp: { signals: [{ signal: "vídeo na SERP", count: 3 }], sources: ["GOOGLE_SERP"] },
  observed: {
    questions: [{ id: "q1", canonicalQuestion: "Posso usar à noite?" }],
    concepts: { recurrent: [{ id: "c1", canonicalLabel: "niacinamida" }], all: [{ id: "c2", corpo: PESO_NAO_LIDO.repeat(200) }] },
    sample: { comparablePages: 12, observedResults: 30 },
    externalLinks: Array.from({ length: 20 }, (_, indice) => ({ url: `https://fonte.test/${indice}`, trecho: PESO_NAO_LIDO.repeat(50) })),
  },
  evidence: { semantic: { corpo: PESO_NAO_LIDO.repeat(300) }, structural: { corpo: PESO_NAO_LIDO.repeat(300) } },
  video: { summary: { briefs: 4, supported: 3, partial: 1, notFound: 0 }, sources: [{ id: "v1", transcricao: PESO_NAO_LIDO.repeat(100) }] },
  specialist: { decision: "incorporada", nota: "Dermatologista revisou." },
  serpStanding: { current: true, sufficient: true, reason: "SERP vigente e suficiente." },
});
const payloadV2 = () => documentoV2ComDossie(documentV2, bundleRico());
const resetV2 = () => {
  fullRows[documentV2] = { id: documentV2, marca_id: brandA.brandId, article_id: "artigo-e1", payload: structuredClone(payloadV2()), content_hash: "hash-v2", lock_version: 7, status: "writing", current_version_id: null, updated_at: "2026-09-23T10:00:00+00:00" };
};
resetV2();

/*
 * B2 · o documento das ferramentas de evidência: o mesmo pacote rico, com a
 * posição da SERP completa (o leitor valida `serpStanding` pelo contrato do
 * congelamento).
 */
const documentEvid = "writer:doc-evidencias";
fullRows[documentEvid] = {
  id: documentEvid, marca_id: brandA.brandId, article_id: "artigo-e1", content_hash: "hash-evid", lock_version: 2, status: "writing", updated_at: "2026-09-23T10:00:00+00:00",
  payload: documentoV2ComDossie(documentEvid, {
    ...bundleRico(),
    serpStanding: { authoritative: true, current: true, sufficient: true, valid: true, reason: "SERP vigente e suficiente." },
    /* Fontes de vídeo como o Radar grava: descritores pequenos; o texto mora em radar_video_source_texts. */
    video: { summary: { briefs: 1, supported: 1, partial: 0, notFound: 0 }, sources: [{ videoSourceId: "77777777-7777-4777-8777-777777777771", displayName: "Canal", languageCode: "pt", processingVersion: 1 }], results: [] },
  }),
};

const pgrst = (code: string, message: string, status: number) => new Response(JSON.stringify({ code, message, details: null, hint: null }), { status, headers: { "Content-Type": "application/json" } });

/* A tabela de divergências no falso do MCP: `null` = migration pendente (PGRST205); vazia por padrão. */
let divergenceRows: Array<Record<string, unknown>> | null = [];
/* Falha transitória da leitura (ex.: 57014, statement timeout): só nos testes que a pedem. */
let divergenceReadFailure: string | null = null;

async function divergenceTable(method: string, url: URL, request: Request, query: Query) {
  if (divergenceReadFailure && method === "GET") return pgrst(divergenceReadFailure, "canceling statement due to statement timeout DADO-DA-LINHA", 500);
  if (!divergenceRows) return pgrst("PGRST205", "Could not find the table 'public.writer_evidence_divergences' in the schema cache", 404);
  const select = url.searchParams.get("select");
  const headers = { "Content-Type": "application/json" };
  if (method === "POST") {
    const body = JSON.parse(await request.text()) as Record<string, unknown>;
    const row = { id: `dddddddd-0000-4000-8000-${String(divergenceRows.length + 1).padStart(12, "0")}`, created_at: "2026-09-23T12:00:00+00:00", ...body };
    divergenceRows.push(row);
    query.responseBody = JSON.stringify(project(row, select));
    const wantsObject = (request.headers.get("accept") || "").includes("vnd.pgrst.object");
    return new Response(wantsObject ? query.responseBody : `[${query.responseBody}]`, { status: 201, headers });
  }
  if (method !== "GET") throw new Error(`o MCP não pode ${method} em writer_evidence_divergences`);
  const eq = (name: string) => (url.searchParams.get(name) || "").replace(/^eq\./, "");
  const status = url.searchParams.get("status");
  const open = status?.startsWith("in.(") ? status.slice(4, -1).split(",") : null;
  const rows = divergenceRows.filter(row => row.marca_id === eq("marca_id") && row.document_id === eq("document_id") && (!open || open.includes(String(row.status))));
  query.responseBody = JSON.stringify(rows.map(row => project(row, select)));
  return new Response(query.responseBody, { status: 200, headers });
}

const queries: Query[] = [];
/*
 * O PostgREST de verdade, no que importa aqui: `apelido:coluna->chave->chave`
 * devolve o valor do caminho, e `null` quando a chave falta ou o pai não é
 * objeto — como o operador `->` do Postgres.
 */
const project = (row: Record<string, unknown>, select: string | null) => {
  if (!select || select === "*") return row;
  return Object.fromEntries(select.split(",").map(column => {
    const [alias, expression] = column.includes(":") ? column.split(":") : [column, column];
    const [base, ...path] = expression.split("->");
    let value: unknown = row[base];
    for (const key of path) value = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
    return [alias, value === undefined ? null : value];
  }));
};

/* Um passo que o teste pode injetar entre consultas, para simular escrita concorrente. */
let afterDocumentRead: ((select: string | null) => void) | null = null;
/* A RPC do save grava o que recebe; o teste pode trocar o que fica gravado. */
let storeOverride: ((payload: Record<string, unknown>) => Record<string, unknown>) | null = null;
let afterRpc: (() => void) | null = null;
const rpcBodies: Array<Record<string, unknown>> = [];

const pgError = (message: string) => new Response(JSON.stringify({ code: "P0001", message, details: null, hint: null }), { status: 400, headers: { "Content-Type": "application/json" } });
const semEditaveis = (payload: unknown) => Object.fromEntries(Object.entries(payload as Record<string, unknown>)
  .filter(([key]) => !["blocks", "editorContent", "status"].includes(key)));

/* A M6 no que o save confere: escopo, hash igual, lock. Só o documento v2 é gravável aqui. */
function saveDraftRpc(body: Record<string, unknown>) {
  /* Os outros documentos seguem com a resposta vazia de antes: aqueles testes só olham o alvo. */
  if (body.p_document_id !== documentV2) return new Response(null, { status: 201 });
  rpcBodies.push(body);
  const row = fullRows[String(body.p_document_id)];
  if (!row || body.p_document_id !== documentV2 || row.marca_id !== body.p_brand_id) return pgError("writer_document_not_found");
  if (canonicalJson(semEditaveis(body.p_payload)) !== canonicalJson(semEditaveis(row.payload))) return pgError("writer_draft_scope_invalid");
  const receipt = (unchanged: boolean) => new Response(JSON.stringify({ id: row.id, contentHash: row.content_hash, lockVersion: row.lock_version, versionId: row.current_version_id ?? null, unchanged }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (row.content_hash === body.p_content_hash) return receipt(true);
  if (body.p_expected_lock !== row.lock_version) return pgError("writer_lock_conflict");
  const payload = body.p_payload as Record<string, unknown>;
  row.payload = storeOverride ? storeOverride(payload) : payload;
  row.content_hash = body.p_content_hash;
  row.lock_version = Number(row.lock_version) + 1;
  const response = receipt(false);
  if (afterRpc) afterRpc();
  return response;
}

/*
 * SDD do Assunto, F4.2 · versões de ArticleDNA no falso, só nos testes que as
 * pedem (vazio por padrão, como antes). `artifactReadFailure` simula falha.
 */
let artifactRows: Array<Record<string, unknown>> = [];
let artifactReadFailure: string | null = null;

/* Responde só o necessário para a cadeia de autorização chegar ao work(). */
function answer(table: string, select: string | null, params: URLSearchParams): unknown[] {
  if (table === "editorial_artifact_versions") {
    const eq = (name: string) => (params.get(name) || "").replace(/^eq\./, "");
    return artifactRows
      .filter(row => row.marca_id === eq("marca_id") && row.version_id === eq("version_id") && (!params.get("artifact_type") || row.artifact_type === eq("artifact_type")))
      .map(row => project(row, select));
  }
  if (table === "content_documents") {
    const id = (params.get("id") || "").replace(/^eq\./, "");
    const row = fullRows[id];
    const brandFilter = params.get("marca_id");
    const inList = brandFilter?.startsWith("in.(") ? brandFilter.slice(4, -1).split(",").map(value => value.replace(/^"|"$/g, "")) : null;
    const brandAllowed = !brandFilter || brandFilter === `eq.${row?.marca_id}` || Boolean(inList?.includes(String(row?.marca_id)));
    if (!row || !brandAllowed) return [];
    return [project(row, select)];
  }
  if (table === "marcas") return [{ id: brandA.brandId, nome: "Care Glow", owner_user_id: actorId, status: "active" }];
  if (table === "agency_brands") return [{ id: "link-1", agency_id: agencyId, status: "active", agencies: { id: agencyId, name: "Agência", slug: "agencia", status: "active" } }];
  if (table === "agency_memberships") return [{ id: "membership-1", agency_id: agencyId, user_id: actorId, role: "agency_admin", status: "active" }];
  if (table === "brand_memberships") return [{ id: "brand-membership-1", status: "active", role: "owner", member_user_id: actorId }];
  return [];
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = input instanceof Request ? input : new Request(input, init);
  if (!request.url.startsWith(SUPABASE_URL)) return originalFetch(input, init);
  const url = new URL(request.url);
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  const method = request.method.toUpperCase();
  const select = url.searchParams.get("select");
  const query: Query = { table, method, select, filters: url.search, responseBody: "" };
  queries.push(query);
  if (method === "POST" && table === "rpc/writer_save_article_draft") return saveDraftRpc(JSON.parse(await request.text()) as Record<string, unknown>);
  /* As funções do leitor ainda não existem no remoto: o MCP precisa funcionar assim. */
  if (method === "POST" && table.startsWith("rpc/writer_evidence_")) return pgrst("PGRST202", `Could not find the function public.${table.slice(4)}`, 404);
  if (table === "writer_evidence_divergences") return divergenceTable(method, url, request, query);
  if (table === "editorial_artifact_versions" && artifactReadFailure) return pgrst(artifactReadFailure, "canceling statement due to statement timeout DADO-DO-DNA", 500);
  if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 201 });
  const rows = answer(table, select, url.searchParams);
  if (table === "content_documents" && afterDocumentRead) afterDocumentRead(select);
  const wantsObject = (request.headers.get("accept") || "").includes("vnd.pgrst.object");
  if (wantsObject) {
    if (rows.length !== 1) return new Response(JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null }), { status: 406, headers: { "Content-Type": "application/json" } });
    query.responseBody = JSON.stringify(rows[0]);
    return new Response(query.responseBody, { status: 200, headers: { "Content-Type": "application/json" } });
  }
  query.responseBody = JSON.stringify(rows);
  return new Response(query.responseBody, { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `0-${Math.max(rows.length - 1, 0)}/*` } });
}) as typeof fetch;

const principal = (): Principal => ({
  authMode: "oauth_supabase", actorId, oauthClientId: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d", clientName: "ChatGPT",
  profile: { userId: actorId, role: "cliente", isAdmin: false, supabase: createClient(SUPABASE_URL, "chave-de-teste", { auth: { persistSession: false, autoRefreshToken: false } }) } as Principal["profile"],
  brands: [brandA], consentUrl: null,
});

async function callTool(name: string, args: Record<string, unknown>, who: Principal = principal()) {
  const handler = createMcpHandler(() => createWriterServer(who));
  const response = await handler.fetch(new Request("http://localhost:3000/api/mcp/redator", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
  assert.equal(response.status, 200);
  const body = await response.text();
  const message = response.headers.get("content-type")?.includes("text/event-stream")
    ? body.split(/\r?\n/).filter(line => line.startsWith("data: ")).at(-1)?.slice(6)
    : body;
  const parsed = JSON.parse(message || "null") as { result?: { content?: Array<{ text: string }>; isError?: boolean } };
  const text = parsed.result?.content?.[0]?.text || "null";
  // Erro de validação de input vem do SDK como texto puro, não pelo asText da rota.
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { ok: false, inputError: text }; }
}

const mediaBrief = (documentId: string) => ({ documentId, deliverableId: null, role: "cover", objective: "Capa", prompt: "Prompt visual", altText: "", aspectRatio: "16:9" });

const documentSelects = () => queries.filter(query => query.table === "content_documents" && query.method === "GET").map(query => query.select);
const firstDocumentSelect = () => documentSelects()[0];

test("ferramentas que só usam o grant resolvem o alvo com id,marca_id, sem payload", async () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["get_writer_deliverables", { documentId: documentA }],
    ["save_writer_draft", { documentId: documentA, expectedLockVersion: 3, blocks: [] }],
    ["register_media_brief", mediaBrief(documentA)],
    ["attach_media_asset", { documentId: documentA, assetId: "00000000-0000-4000-8000-0000000000aa", imageBase64: "AAAA" }],
  ];
  for (const [name, args] of cases) {
    queries.length = 0;
    const result = await callTool(name, args);
    assert.equal(result.inputError, undefined, `${name}: ${String(result.inputError)}`);
    assert.equal(firstDocumentSelect(), "id,marca_id", `${name} resolveu o alvo com ${firstDocumentSelect()}`);
  }
});

test("get_writer_deliverables chega ao trabalho sem ter baixado o payload em momento algum", async () => {
  queries.length = 0;
  const result = await callTool("get_writer_deliverables", { documentId: documentA });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.brandId, brandA.brandId);
  assert.ok(documentSelects().length >= 1);
  for (const select of documentSelects()) assert.doesNotMatch(select || "", /payload/, `select com payload: ${select}`);
});

/*
 * MUDANÇA DE CONTRATO ACEITA (adendo D4): documento e briefing deixaram de
 * devolver o payload e o dossiê. O documento traz blocos, metadados, status,
 * lock e vínculos; o briefing troca o dossiê por um ponteiro ao manifesto.
 */
test("D4 · documento e briefing leem caminhos numa leitura só, sem o dossiê; o briefing aponta o manifesto", async () => {
  resetV2();
  const completo = ContentDocumentSchema.parse(payloadV2());
  queries.length = 0;
  const read = await callTool("get_writer_document", { documentId: documentV2 });
  assert.equal(read.ok, true, JSON.stringify(read));
  const readResult = read.result as { document: Record<string, unknown>; contentHash: string; lockVersion: number; evidence: Record<string, string> };
  assert.equal(readResult.document.id, documentV2);
  assert.equal(readResult.document.schemaVersion, 2);
  assert.deepEqual(readResult.document.blocks, completo.blocks);
  assert.deepEqual(readResult.document.metadata, completo.metadata);
  assert.deepEqual(readResult.document.radarOrigin, completo.schemaVersion === 2 ? completo.radarOrigin : null);
  assert.deepEqual(readResult.document.articleDnaRef, completo.articleDnaRef);
  assert.equal("importedContext" in readResult.document, false, "o dossiê não sai no documento");
  assert.equal("editorContent" in readResult.document, false);
  assert.equal(readResult.contentHash, "hash-v2");
  assert.equal(readResult.lockVersion, 7);
  assert.equal(readResult.evidence.manifest, "get_writer_evidence_manifest");
  assert.deepEqual(documentSelects(), [WRITER_DOCUMENT_VIEW_SELECT]);
  assert.ok(!bareColumns(WRITER_DOCUMENT_VIEW_SELECT).includes("payload"));
  const lidoDoDocumento = queries.find(query => query.table === "content_documents")?.responseBody || "";
  assert.doesNotMatch(lidoDoDocumento, new RegExp(PESO_NAO_LIDO), "o dossiê não sai do banco");
  assert.ok(lidoDoDocumento.length < JSON.stringify(payloadV2()).length / 5, `documento lido com ${lidoDoDocumento.length} B`);

  queries.length = 0;
  const v1 = await callTool("get_writer_document", { documentId: documentA });
  assert.equal(v1.ok, true, JSON.stringify(v1));
  const v1Result = v1.result as { document: Record<string, unknown>; contentHash: string; lockVersion: number };
  assert.equal(v1Result.document.schemaVersion, 1);
  assert.deepEqual(v1Result.document.contentPlanRef, document.schemaVersion === 1 ? document.contentPlanRef : null);
  assert.equal(v1Result.document.blocks && (v1Result.document.blocks as unknown[]).length, document.blocks.length);
  assert.equal(v1Result.contentHash, "hash-a");
  assert.equal(v1Result.lockVersion, 3);

  queries.length = 0;
  const brief = await callTool("get_writer_brief", { documentId: documentV2 });
  assert.equal(brief.ok, true, JSON.stringify(brief));
  const briefResult = brief.result as Record<string, unknown> & { dossier: Record<string, unknown>; guards: string[]; pendingDecisions: unknown[] };
  assert.equal(briefResult.documentHash, "hash-v2");
  assert.equal(briefResult.dossier.bundleId, "bundle:e1");
  assert.equal(briefResult.dossier.bundle, "not_included");
  assert.deepEqual(briefResult.dossier.read, { manifest: "get_writer_evidence_manifest", foundations: "get_writer_foundations", slices: "read_writer_evidence" });
  assert.deepEqual(briefResult.dossier.writerMayNot, ["Trocar a keyword principal."]);
  assert.equal(briefResult.pendingDecisions.length, 1);
  assert.deepEqual(briefResult.instructions, completo.instructions);
  assert.ok(briefResult.guards.some(guarda => /FAQ/.test(guarda)), "o briefing leva a guarda de FAQ");
  assert.equal(briefResult.warning, null);
  assert.deepEqual(documentSelects(), [WRITER_BRIEF_SELECT]);
  assert.ok(!bareColumns(WRITER_BRIEF_SELECT).includes("payload"));
  const lidoDoBriefing = queries.find(query => query.table === "content_documents")?.responseBody || "";
  assert.doesNotMatch(lidoDoBriefing, new RegExp(PESO_NAO_LIDO));
  assert.ok(writerEvidenceJsonBytes(briefResult) <= WRITER_EVIDENCE_LIMITS.sliceMaxBytes);

  const briefV1 = await callTool("get_writer_brief", { documentId: documentA });
  assert.equal(briefV1.ok, true, JSON.stringify(briefV1));
  assert.equal((briefV1.result as { dossier: unknown }).dossier, null);
  assert.equal((briefV1.result as { radarOrigin: unknown }).radarOrigin, null);
});

/* ============================ Fase 0 · leituras estreitas ============================ */

const bareColumns = (select: string | null) => (select || "").split(",").filter(column => !column.includes(":"));
const semGeradoEm = (report: unknown) => Object.fromEntries(Object.entries(report as Record<string, unknown>)
  .filter(([key]) => key !== "generatedAt"));

/*
 * GUARDA ATUALIZADA — SDD do Assunto, F4.2 (2026-09-24).
 *
 * O Guardião lia só id, blocks e metadata. Para ligar os avisos do Assunto
 * (virada ausente, link para o destino ausente), ele passou a ler também a
 * REFERÊNCIA ao ArticleDNA fixado (`g_articleDnaRef:payload->articleDnaRef`,
 * ~150 B) — na mesma consulta, sem nada do contexto importado — e depois UM
 * caminho do ArticleDNA, `payload->subject` daquela versão, na Marca do grant
 * (< 1 kB; `readWriterGuardianSubject`). Nenhum chamador tinha o Assunto em
 * mãos: o painel manda o documento, que não carrega o Assunto, e o MCP só lê
 * caminhos. A alternativa (o painel e o MCP passarem o Assunto) mudaria o
 * contrato do pedido do painel e deixaria o MCP dependente do que a IA
 * declarar. O relatório sem Assunto continua igual ao do documento inteiro.
 */
test("Fase 0 · o Guardião lê id, blocks, metadata e a referência ao ArticleDNA numa consulta só, e o relatório é o mesmo do documento inteiro", async () => {
  for (const [documentId, hash, payload] of [[documentA, "hash-a", document], [documentV2, "hash-v2", payloadV2()]] as const) {
    queries.length = 0;
    const guardian = await callTool("get_writer_guardian", { documentId });
    assert.equal(guardian.ok, true, JSON.stringify(guardian));
    assert.deepEqual(documentSelects(), [WRITER_GUARDIAN_SELECT]);
    assert.equal(WRITER_GUARDIAN_SELECT, "id,marca_id,content_hash,g_id:payload->id,g_blocks:payload->blocks,g_metadata:payload->metadata,g_articleDnaRef:payload->articleDnaRef");
    /* O Assunto, quando lido, é UM caminho do ArticleDNA fixado, na Marca do grant. */
    for (const leitura of queries.filter(query => query.table === "editorial_artifact_versions")) {
      assert.deepEqual((leitura.select || "").split(",").filter(coluna => coluna.includes("payload")),
        ["a_subject:payload->subject", "e_subject:payload->payload->subject", "e_brandId:payload->payload->brandId", "a_brandId:payload->brandId"]);
      assert.ok(leitura.filters.includes(`marca_id=eq.${brandA.brandId}`), leitura.filters);
    }
    assert.ok(!bareColumns(WRITER_GUARDIAN_SELECT).includes("payload"), "o Guardião não pede o payload inteiro");
    const esperado = runGuardian(ContentDocumentSchema.parse(payload), hash);
    assert.deepEqual(semGeradoEm(guardian.result), semGeradoEm(JSON.parse(JSON.stringify(esperado))));
  }
  const respostaV2 = queries.find(query => query.table === "content_documents")?.responseBody || "";
  assert.doesNotMatch(respostaV2, new RegExp(PESO_NAO_LIDO), "o dossiê não pode sair do banco para o Guardião");
  assert.ok(respostaV2.length < JSON.stringify(payloadV2()).length / 5, `resposta de ${respostaV2.length} B`);
});

/*
 * GUARDA ATUALIZADA — SDD do Assunto, F4.1 (adendo F4.4, 2026-09-24).
 *
 * As linhas da virada (`importedContext.editorialContext`, gravadas no envio
 * só com Assunto) são uma leitura NOVA. Ela é estreita — um caminho, na Marca,
 * `[]` (2 B) em documento enviado antes e < 2 kB com Assunto — e fica FORA do
 * cabeçalho comum: manifesto, fatias do `read_writer_evidence` e divergências
 * leem o cabeçalho e não usam as linhas. Só fundamentos e material por seção,
 * que as entregam ao redator, fazem a leitura, e só quando o ArticleDNA
 * fixado tem Assunto: sem Assunto, nenhuma consulta a mais.
 */
test("Fase 0 · as linhas da virada não entram no cabeçalho comum; um caminho só, pedido por fundamentos e material quando há Assunto", async () => {
  const { WRITER_EVIDENCE_HEAD_SELECT, WRITER_EDITORIAL_CONTEXT_SELECT } = await import("../lib/server/writer-evidence-document.ts");
  assert.equal(WRITER_EVIDENCE_HEAD_SELECT.includes("editorialContext"), false);
  assert.equal(WRITER_EDITORIAL_CONTEXT_SELECT, "c_editorialContext:payload->importedContext->editorialContext");
  const fonte = readFileSync(new URL("../lib/server/writer-evidence-reader.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const chamadas = fonte.match(/readWriterEditorialContext\(context, head\)/g) || [];
  assert.equal(chamadas.length, 2, "fundamentos e material, e mais ninguém");
  assert.equal((fonte.match(/projecao\?\.fields\.subject \? await readWriterEditorialContext\(context, head\) : \[\]/g) || []).length, 2, "só com Assunto");
});

test("Fase 0 · Guardião de outra Marca continua document_not_found, sem autorização nem auditoria depois", async () => {
  queries.length = 0;
  const result = await callTool("get_writer_guardian", { documentId: documentB });
  assert.equal(result.ok, false);
  assert.equal(result.code, "document_not_found");
  assert.deepEqual(Object.keys(result).sort(), ["code", "ok", "requestId"]);
  assert.deepEqual(queries.map(query => query.table), ["content_documents"]);
});

test("Fase 0 · o save lê o payload uma vez (o hash exige), confere por caminho e preserva o dossiê", async () => {
  resetV2();
  queries.length = 0;
  rpcBodies.length = 0;
  const original = payloadV2();
  const blocks = [
    { id: "n1", type: "heading", level: 1, text: "Rotina noturna", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } },
    { id: "n2", type: "paragraph", text: "Limpe a pele antes de dormir.", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } },
  ];
  const result = await callTool("save_writer_draft", { documentId: documentV2, expectedLockVersion: 7, blocks });
  assert.equal(result.ok, true, JSON.stringify(result));
  const saved = result.result as { contentHash: string; lockVersion: number; unchanged: boolean };
  assert.equal(saved.lockVersion, 8);
  assert.equal(saved.unchanged, false);

  assert.deepEqual(documentSelects(), [
    "id,marca_id",
    "id,payload,lock_version",
    "content_hash,lock_version,current_version_id,blocks:payload->blocks",
  ]);
  for (const query of queries.filter(item => item.table === "content_documents")) {
    assert.match(query.filters, /id=eq\./);
  }
  const [, before, readback] = queries.filter(item => item.table === "content_documents");
  assert.match(before.filters, new RegExp(`marca_id=eq\\.${brandA.brandId}`));
  assert.match(readback.filters, new RegExp(`marca_id=eq\\.${brandA.brandId}`));
  assert.doesNotMatch(readback.responseBody, new RegExp(PESO_NAO_LIDO), "o readback não traz o dossiê");
  assert.ok(readback.responseBody.length < 2_000, `readback de ${readback.responseBody.length} B`);

  assert.equal(rpcBodies.length, 1);
  const enviado = rpcBodies[0].p_payload as typeof original;
  assert.deepEqual(enviado.importedContext, original.importedContext, "o dossiê viaja intacto para a RPC");
  assert.deepEqual(enviado.radarOrigin, original.radarOrigin);
  assert.deepEqual(enviado.blocks, blocks);
  assert.equal(enviado.status, "escrevendo");
  assert.equal(enviado.editorContent, null);
  const gravado = fullRows[documentV2].payload as typeof original;
  assert.deepEqual(gravado.importedContext, original.importedContext, "o dossiê continua gravado depois do save");
  assert.equal(fullRows[documentV2].content_hash, saved.contentHash);
});

test("Fase 0 · o readback estreito ainda pega blocos divergentes e hash divergente", async () => {
  const blocks = [{ id: "n9", type: "paragraph", text: "Outro texto.", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } }];

  resetV2();
  storeOverride = payload => ({ ...payload, blocks: [] });
  try {
    const result = await callTool("save_writer_draft", { documentId: documentV2, expectedLockVersion: 7, blocks });
    assert.equal(result.ok, false);
    assert.equal(result.code, "readback_mismatch", JSON.stringify(result));
  } finally { storeOverride = null; }

  /* Outro save grava entre a RPC e o readback: os blocos até batem, o hash não. */
  resetV2();
  afterRpc = () => { fullRows[documentV2] = { ...fullRows[documentV2], content_hash: "sha256:de-outro-save" }; };
  try {
    const result = await callTool("save_writer_draft", { documentId: documentV2, expectedLockVersion: 7, blocks });
    assert.equal(result.ok, false);
    assert.equal(result.code, "readback_mismatch", JSON.stringify(result));
  } finally { afterRpc = null; resetV2(); }
});

test("documento fora do grant continua document_not_found, nos dois caminhos e antes de qualquer outra consulta", async () => {
  for (const [name, args] of [
    ["get_writer_document", { documentId: documentB }],
    ["get_writer_deliverables", { documentId: documentB }],
    ["save_writer_draft", { documentId: documentB, expectedLockVersion: 1, blocks: [] }],
    ["get_writer_brief", { documentId: "writer:inexistente" }],
    ["register_media_brief", mediaBrief("writer:inexistente")],
  ] as Array<[string, Record<string, unknown>]>) {
    queries.length = 0;
    const result = await callTool(name, args);
    assert.equal(result.inputError, undefined, `${name}: ${String(result.inputError)}`);
    assert.equal(result.ok, false, name);
    assert.equal(result.code, "document_not_found", `${name}: ${JSON.stringify(result)}`);
    // Mesma resposta de antes: sem detalhes que revelem a Marca dona.
    assert.deepEqual(Object.keys(result).sort(), ["code", "ok", "requestId"], name);
    // Mesmo momento: nada de autorização nem auditoria depois da leitura do alvo.
    assert.deepEqual(queries.map(query => query.table), ["content_documents"], name);
  }
});

test("R4 · as leituras do alvo filtram pelas Marcas do grant, e documento de outra Marca não sai do banco", async () => {
  const brandInFilter = `in.(${brandA.brandId})`;
  const brandOf = (query: Query) => new URLSearchParams(query.filters).get("marca_id");
  for (const [name, args, select] of [
    ["get_writer_document", { documentId: documentB }, WRITER_DOCUMENT_VIEW_SELECT],
    ["get_writer_brief", { documentId: documentB }, WRITER_BRIEF_SELECT],
    ["get_writer_guardian", { documentId: documentB }, WRITER_GUARDIAN_SELECT],
    ["get_writer_deliverables", { documentId: documentB }, "id,marca_id"],
    ["get_writer_evidence_manifest", { documentId: documentB }, "id,marca_id"],
    ["get_writer_foundations", { documentId: documentB }, "id,marca_id"],
    ["read_writer_evidence", { documentId: documentB, sourceKey: "radar.bundle.specialist" }, "id,marca_id"],
    ["record_writer_divergence", { documentId: documentB, ...pedidoDeDivergencia() }, "id,marca_id"],
  ] as Array<[string, Record<string, unknown>, string]>) {
    queries.length = 0;
    const result = await callTool(name, args);
    assert.equal(result.code, "document_not_found", `${name}: ${JSON.stringify(result)}`);
    assert.deepEqual(Object.keys(result).sort(), ["code", "ok", "requestId"], name);
    const [target, ...rest] = queries;
    assert.equal(rest.length, 0, name);
    assert.equal(target.select, select, name);
    assert.equal(brandOf(target), brandInFilter, `${name} sem filtro de Marca: ${target.filters}`);
    assert.ok(!target.responseBody.includes(brandB), `${name}: a linha da outra Marca chegou ao servidor`);
    assert.ok(!target.responseBody.includes(documentB), name);
  }

  for (const [name, args] of [
    ["get_writer_document", { documentId: documentA }],
    ["get_writer_guardian", { documentId: documentA }],
    ["get_writer_deliverables", { documentId: documentA }],
  ] as Array<[string, Record<string, unknown>]>) {
    queries.length = 0;
    const result = await callTool(name, args);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
    assert.equal(brandOf(queries[0]), brandInFilter, `${name}: ${queries[0].filters}`);
  }
});

test("estrutura: o alvo é lido numa função só, pelas Marcas do grant; nenhuma ferramenta pede o payload inteiro", () => {
  const source = readFileSync(new URL("../app/api/mcp/redator/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const lendo = [...source.matchAll(/call\("([a-z_]+)",[^{]*\{[^}]*read: "([a-z]+)"[^}]*\}/g)].map(match => `${match[1]}:${match[2]}`).sort();
  assert.deepEqual(lendo, ["get_writer_brief:brief", "get_writer_document:document", "get_writer_guardian:guardian"]);
  assert.match(source, /owner: "id,marca_id",/);
  assert.match(source, /document: WRITER_DOCUMENT_VIEW_SELECT,/);
  assert.match(source, /brief: WRITER_BRIEF_SELECT,/);
  assert.match(source, /guardian: WRITER_GUARDIAN_SELECT,/);
  assert.match(source, /\.select\(TARGET_SELECTS\[read\]\)/);
  for (const select of [WRITER_DOCUMENT_VIEW_SELECT, WRITER_BRIEF_SELECT, WRITER_GUARDIAN_SELECT]) {
    assert.ok(!bareColumns(select).includes("payload"), `payload inteiro em ${select}`);
    assert.doesNotMatch(select, /->bundle(->|,|$)|editorContent/, select);
  }
  assert.doesNotMatch(source, /select\("[^"]*\bpayload\b/, "nenhum select literal com payload");
  /* F4.2 · a referência ao ArticleDNA sai da MESMA linha do alvo; nenhuma leitura extra do documento. */
  assert.match(source, /const context = await readWriterGuardianContext\(evidenceContext\(access\), documentId, \{ articleDnaRef: writerGuardianArticleDnaRefFromRow\(current\) \}\);/);
  assert.match(source, /runGuardian\(writerGuardianViewFromRow\(current\), String\(current\.content_hash\), context\)/);
  assert.doesNotMatch(source, /readOpenWriterDivergences/, "o Guardião do MCP lê pela forma que não derruba a análise");
  const fromContentDocuments = source.split('.from("content_documents")').length - 1;
  const alvoFiltrado = source.split('.eq("id", documentId).in("marca_id", [...brandIds]).maybeSingle()').length - 1;
  assert.equal(alvoFiltrado, 1, "targetRow é a única leitura do alvo, filtrada pelas Marcas do grant");
  assert.equal(fromContentDocuments, 2, "a leitura do alvo e a listagem por Marca");
  assert.match(source, /const brandIds = principal\.brands\.map\(\(brand\) => brand\.brandId\);/);
  /* Opção A: leitura sob writer.read (view); divergência sob writer.draft.write (edit). A Marca do leitor é a do grant. */
  const escopos = new Map([...source.matchAll(/call\("([a-z_]+)", "([a-z.]+)", "(view|edit)"/g)].map(match => [match[1], `${match[2]}:${match[3]}`]));
  for (const nome of ["get_writer_evidence_manifest", "get_writer_foundations", "read_writer_evidence"]) assert.equal(escopos.get(nome), "writer.read:view", nome);
  assert.equal(escopos.get("record_writer_divergence"), "writer.draft.write:edit");
  assert.match(source, /const evidenceContext = \(access: WriterMcpBrandAccess\) => \(\{ brandId: access\.brandId \}\);/);
  assert.doesNotMatch(source, /\.(update|upsert|delete)\(/, "o MCP não atualiza nem apaga");
});

/* ============================ Fase 0 · semeadura da IA interna ============================ */

const documentSelectsOf = (list: Query[]) => list.filter(query => query.table === "content_documents").map(query => query.select || "");

test("Fase 0 · a semeadura lê só os caminhos dos fundamentos, sempre pela Marca, e projeta o mesmo", async () => {
  resetV2();
  queries.length = 0;
  const { document: lido, foundations, contentHash } = await writerSeedDocument(brandA.brandId, documentV2);
  const completo = ContentDocumentSchema.parse(payloadV2());

  assert.deepEqual(foundations, radarFoundationsOf(completo), "os fundamentos são os mesmos do documento inteiro");
  assert.deepEqual(lido, { id: completo.id, schemaVersion: 2, title: completo.title, status: completo.status, blocks: completo.blocks });
  assert.equal(contentHash, "hash-v2");

  const consultas = queries.filter(query => query.table === "content_documents");
  assert.deepEqual(consultas.map(query => query.select), [WRITER_SEED_DOCUMENT_SELECT, ...WRITER_SEED_BUNDLE_SELECTS]);
  for (const consulta of consultas) {
    assert.match(consulta.filters, new RegExp(`marca_id=eq\\.${brandA.brandId}`), "toda consulta filtra a Marca");
    assert.ok(!bareColumns(consulta.select).includes("payload"), `payload inteiro em ${consulta.select}`);
    assert.doesNotMatch(consulta.responseBody, new RegExp(PESO_NAO_LIDO), "o peso do bundle não sai do banco");
  }
  const lidos = consultas.reduce((total, consulta) => total + consulta.responseBody.length, 0);
  assert.ok(lidos < JSON.stringify(payloadV2()).length / 5, `semeadura leu ${lidos} B`);
});

test("Fase 0 · semeadura: v1 para na primeira consulta; outra Marca é document_not_found", async () => {
  queries.length = 0;
  const v1 = await writerSeedDocument(brandA.brandId, documentA);
  assert.equal(v1.foundations, null);
  assert.equal(v1.document.schemaVersion, 1);
  assert.deepEqual(documentSelectsOf(queries), [WRITER_SEED_DOCUMENT_SELECT]);

  queries.length = 0;
  await assert.rejects(writerSeedDocument(brandA.brandId, documentB),
    (error: unknown) => error instanceof WriterDeliverableError && error.code === "document_not_found" && error.status === 404);
  assert.deepEqual(documentSelectsOf(queries), [WRITER_SEED_DOCUMENT_SELECT]);
});

test("Fase 0 · semeadura: dossiê fora do contrato é incompatível; pacote trocado no meio da leitura é conflito", async () => {
  resetV2();
  const quebrado = structuredClone(payloadV2()) as Record<string, unknown> & { importedContext: { dossier: Record<string, unknown> } };
  delete quebrado.importedContext.dossier.keywordContext;
  fullRows[documentV2] = { ...fullRows[documentV2], payload: quebrado };
  await assert.rejects(writerSeedDocument(brandA.brandId, documentV2),
    (error: unknown) => error instanceof WriterDeliverableError && error.code === "document_incompatible" && error.status === 422);

  /* Vínculo com o ArticleDNA fora do contrato: a leitura inteira recusava, a estreita também, na primeira consulta. */
  resetV2();
  const semArtigo = structuredClone(payloadV2()) as Record<string, unknown>;
  semArtigo.articleDnaRef = { entityId: "artigo-e1" };
  fullRows[documentV2] = { ...fullRows[documentV2], payload: semArtigo };
  assert.equal(ContentDocumentSchema.safeParse(semArtigo).success, false, "a leitura inteira recusaria");
  queries.length = 0;
  await assert.rejects(writerSeedDocument(brandA.brandId, documentV2),
    (error: unknown) => error instanceof WriterDeliverableError && error.code === "document_incompatible" && error.status === 422);
  assert.deepEqual(documentSelectsOf(queries), [WRITER_SEED_DOCUMENT_SELECT]);

  resetV2();
  afterDocumentRead = select => {
    if (select !== WRITER_SEED_DOCUMENT_SELECT) return;
    afterDocumentRead = null;
    const trocado = structuredClone(payloadV2()) as ReturnType<typeof payloadV2>;
    trocado.importedContext.dossier.bundleHash = "bundle-hash:outro-pacote";
    fullRows[documentV2] = { ...fullRows[documentV2], payload: trocado };
  };
  try {
    await assert.rejects(writerSeedDocument(brandA.brandId, documentV2),
      (error: unknown) => error instanceof WriterDeliverableError && error.code === "document_changed" && error.status === 409);
  } finally { afterDocumentRead = null; resetV2(); }
});

/* ============================ B2 · leitor de evidências pelo MCP ============================ */

function pedidoDeDivergencia() {
  return {
    target: { kind: "article_dna" },
    dnaClaim: { path: "mainIntent", summary: "O DNA declara intenção informacional; as perguntas observadas pedem comparação." },
    evidence: { sourceKey: "radar.bundle.observed.questions" },
  };
}

const writes = () => queries.filter(query => query.method !== "GET" && query.method !== "HEAD" && !query.table.startsWith("rpc/"));
const byteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

test("B2 · manifesto ≤ 8 kB e fundamentos ≤ 24 kB pelo MCP antes da migration, sem payload e pela Marca do grant", async () => {
  queries.length = 0;
  const manifest = await callTool("get_writer_evidence_manifest", { documentId: documentEvid });
  assert.equal(manifest.ok, true, JSON.stringify(manifest));
  const result = manifest.result as { kind: string; sizes: string; notices: string[]; brandId: string; bundle: { bundleId: string } };
  assert.equal(result.kind, "writer_evidence_manifest");
  assert.equal(result.sizes, "unknown_migration_pending");
  assert.equal(result.brandId, brandA.brandId);
  assert.equal(result.bundle.bundleId, "bundle:e1");
  assert.ok(result.notices.some(notice => /migration_pendente/.test(notice)));
  assert.ok(byteLength(result) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes, `${byteLength(result)} B`);
  assert.ok(queries.some(query => query.table === "rpc/writer_evidence_manifest"), "tentou a função SQL e degradou");

  const foundations = await callTool("get_writer_foundations", { documentId: documentEvid });
  assert.equal(foundations.ok, true, JSON.stringify(foundations));
  const base = foundations.result as { guards: string[]; writerMayNot: string[]; questions: Array<{ question: string }> };
  assert.ok(base.guards.some(guard => /FAQ/.test(guard)));
  assert.deepEqual(base.writerMayNot, ["Trocar a keyword principal."]);
  assert.deepEqual(base.questions.map(item => item.question), ["Posso usar à noite?"]);
  assert.ok(byteLength(base) <= WRITER_EVIDENCE_LIMITS.foundationsMaxBytes);

  for (const query of queries.filter(item => item.table === "content_documents")) {
    assert.ok(/marca_id=(eq|in)\./.test(query.filters), `sem filtro de Marca: ${query.filters}`);
    assert.ok(!bareColumns(query.select).includes("payload"), `payload inteiro: ${query.select}`);
    assert.doesNotMatch(query.responseBody, new RegExp(PESO_NAO_LIDO), "o peso do dossiê não sai do banco");
  }
  assert.deepEqual(writes().map(query => query.table).filter(table => table !== "writer_mcp_call_events"), [], "ler evidência não escreve");
});

test("B2 · read_writer_evidence: seção pequena com etag e not_modified; seção grande responde migration_pendente; chave inventada é recusada", async () => {
  const slice = await callTool("read_writer_evidence", { documentId: documentEvid, sourceKey: "radar.bundle.specialist" });
  assert.equal(slice.ok, true, JSON.stringify(slice));
  const envelope = slice.result as { etag: string; guards: string[]; usage: string; frozen: boolean; hierarchyLevel: string; supersedes: boolean; data: Record<string, unknown> };
  assert.ok(envelope.guards.some(guard => /FAQ/.test(guard)));
  assert.equal(envelope.usage, "research_only");
  assert.equal(envelope.frozen, true);
  assert.equal(envelope.supersedes, false);
  assert.equal(envelope.hierarchyLevel, "QUALIFIED_SPECIALIST");
  assert.equal(envelope.data.nota, "Dermatologista revisou.");
  assert.ok(byteLength(envelope) <= WRITER_EVIDENCE_LIMITS.sliceDefaultBytes);

  queries.length = 0;
  const same = await callTool("read_writer_evidence", { documentId: documentEvid, sourceKey: "radar.bundle.specialist", ifNoneMatch: envelope.etag });
  assert.equal(same.ok, true, JSON.stringify(same));
  assert.deepEqual(same.result, { sourceKey: "radar.bundle.specialist", notModified: true, etag: envelope.etag });
  assert.ok(!queries.some(query => (query.select || "").includes("->bundle->specialist")), "etag igual não lê o conteúdo");

  queries.length = 0;
  const large = await callTool("read_writer_evidence", { documentId: documentEvid, sourceKey: "radar.bundle.observed.concepts" });
  assert.equal(large.ok, false);
  assert.equal(large.code, "migration_pendente", JSON.stringify(large));
  assert.equal(large.migration, "20260923150000_writer_evidence_reader");
  for (const query of queries.filter(item => item.table === "content_documents")) {
    assert.ok(!(query.select || "").split(",").some(column => column.endsWith("->bundle->observed") || column.includes("->observed->concepts")), `baixou para compensar: ${query.select}`);
  }

  for (const sourceKey of ["dna.article/versao-inventada", "qualquer coisa", "serp.cache/keyword-inventada"]) {
    const refused = await callTool("read_writer_evidence", { documentId: documentEvid, sourceKey });
    assert.equal(refused.ok, false, sourceKey);
    assert.equal(refused.code, "source_not_in_manifest", `${sourceKey}: ${JSON.stringify(refused)}`);
  }
  const tooLarge = await callTool("read_writer_evidence", { documentId: documentEvid, sourceKey: "radar.bundle.specialist", maxBytes: 1_000_000 });
  assert.notEqual(tooLarge.ok, true, "teto acima de 32 kB é recusado na entrada");
});

test("B2 · escopos (opção A): ler evidência sob writer.read; registrar divergência exige writer.draft.write", async () => {
  const readOnly = { ...principal(), brands: [{ ...brandA, scopes: ["writer.read"] }] } as Principal;
  const manifest = await callTool("get_writer_evidence_manifest", { documentId: documentEvid }, readOnly);
  assert.equal(manifest.ok, true, JSON.stringify(manifest));
  divergenceRows = [];
  queries.length = 0;
  const denied = await callTool("record_writer_divergence", { documentId: documentEvid, ...pedidoDeDivergencia() }, readOnly);
  assert.equal(denied.code, "scope_denied", JSON.stringify(denied));
  assert.equal(divergenceRows.length, 0);
  assert.ok(!queries.some(query => query.table === "writer_evidence_divergences"));
});

test("B2 · record_writer_divergence sem a migration responde migration_pendente e não grava noutro lugar", async () => {
  divergenceRows = null;
  queries.length = 0;
  try {
    const result = await callTool("record_writer_divergence", { documentId: documentEvid, ...pedidoDeDivergencia() });
    assert.equal(result.ok, false);
    assert.equal(result.code, "migration_pendente", JSON.stringify(result));
    assert.match(String(result.message), /migration pendente/);
    assert.deepEqual(writes().map(query => query.table).filter(table => table !== "writer_mcp_call_events"), ["writer_evidence_divergences"], "só a tentativa na tabela que ainda não existe");
  } finally { divergenceRows = []; }
});

test("B2 · record_writer_divergence grava 'aberta' com o grant, o ator e o alvo do documento; a IA não escolhe status, bloqueio nem hierarquia", async () => {
  divergenceRows = [];
  const recorded = await callTool("record_writer_divergence", { documentId: documentEvid, ...pedidoDeDivergencia() });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal((recorded.result as { status: string }).status, "recorded");
  assert.equal(divergenceRows.length, 1);
  const [row] = divergenceRows;
  assert.equal(row.status, "aberta");
  assert.equal(row.severity, "alerta");
  assert.equal(row.origin, "ia_mcp");
  assert.equal(row.mcp_grant_id, brandA.grantId);
  assert.equal(row.created_by, actorId);
  assert.equal(row.marca_id, brandA.brandId);
  assert.equal(row.document_id, documentEvid);
  assert.equal(row.target_kind, "article_dna");
  assert.equal(row.target_version_id, "artigo-e1-v1");
  assert.equal(row.evidence_frozen, true);
  assert.equal(row.evidence_hierarchy_level, "CURRENT_SUFFICIENT_SERP");

  for (const forbidden of [
    { status: "resolvida" },
    { severity: "bloqueante" },
    { evidence: { sourceKey: "radar.bundle.observed.questions", hierarchyLevel: "CURRENT_SUFFICIENT_SERP" } },
    { target: { kind: "article_dna", contentHash: "sha256:inventado" } },
  ]) {
    const result = await callTool("record_writer_divergence", { documentId: documentEvid, ...pedidoDeDivergencia(), ...forbidden });
    assert.notEqual(result.ok, true, JSON.stringify(forbidden));
  }
  assert.equal(divergenceRows.length, 1, "nenhum pedido proibido gravou");

  const invented = await callTool("record_writer_divergence", { documentId: documentEvid, ...pedidoDeDivergencia(), target: { kind: "keyword_dna", keywordId: "kw-inventada" } });
  assert.equal(invented.code, "target_not_in_document", JSON.stringify(invented));

  const bearer = { ...principal(), authMode: "delegated_bearer", brands: [{ ...brandA, grantId: null, delegationId: "00000000-0000-4000-8000-0000000000de" }] } as Principal;
  const noGrant = await callTool("record_writer_divergence", { documentId: documentEvid, ...pedidoDeDivergencia() }, bearer);
  assert.equal(noGrant.code, "divergence_requires_grant", JSON.stringify(noGrant));
  assert.equal(divergenceRows.length, 1);
});

test("B2 · o Guardião do MCP lê as divergências abertas; sem a migration, segue com aviso", async () => {
  const row = (id: string, extra: Record<string, unknown>) => ({
    id, marca_id: brandA.brandId, document_id: documentEvid, status: "aberta", severity: "alerta", origin: "ia_mcp", target_kind: "article_dna",
    target_entity_id: "artigo-e1", target_version_id: "artigo-e1-v1", dna_claim_path: "evidenceNeeded", dna_claim_summary: `resumo ${id}`,
    evidence_source_key: "radar.bundle.observed.questions", evidence_path: null, evidence_hierarchy_level: "OTHER_RADAR_EVIDENCE",
    evidence_frozen: true, evidence_posterior_ao_pacote: false, suggested_owner: "arquiteto", created_at: "2026-09-23T12:00:00+00:00", ...extra,
  });
  divergenceRows = [
    row("aaaaaaa1-intent", { dna_claim_path: "mainIntent" }),
    row("aaaaaaa2-canibal", { dna_claim_path: "antiCannibalizationBoundary", status: "reconhecida" }),
    row("aaaaaaa3-resolvida", { status: "resolvida" }),
    { ...row("aaaaaaa4-outra", {}), marca_id: brandB },
  ];
  try {
    queries.length = 0;
    const guardian = await callTool("get_writer_guardian", { documentId: documentEvid });
    assert.equal(guardian.ok, true, JSON.stringify(guardian));
    const report = guardian.result as { findings: Array<{ category: string; message: string; severity: string }>; notices?: string[] };
    const fromDivergences = report.findings.filter(item => item.message.includes("Divergência"));
    assert.deepEqual(fromDivergences.map(item => item.category).sort(), ["cannibalization", "intent"]);
    assert.ok(fromDivergences.every(item => item.severity === "warning"));
    assert.equal(report.notices, undefined);
    const divergenceQuery = queries.filter(query => query.table === "writer_evidence_divergences").at(-1)!;
    assert.ok(divergenceQuery.filters.includes(`marca_id=eq.${brandA.brandId}`), divergenceQuery.filters);

    divergenceRows = null;
    const pending = await callTool("get_writer_guardian", { documentId: documentEvid });
    assert.equal(pending.ok, true, JSON.stringify(pending));
    const pendingReport = pending.result as { findings: Array<{ message: string }>; notices?: string[] };
    assert.match(pendingReport.notices?.[0] ?? "", /migration_pendente/);
    assert.ok(!pendingReport.findings.some(item => item.message.includes("Divergência")));
  } finally { divergenceRows = []; }
});

test("B2 · o Guardião do MCP com falha transitória nas divergências segue com a análise determinística e um aviso, sem vazar o driver", async () => {
  divergenceRows = [];
  const antes = await callTool("get_writer_guardian", { documentId: documentEvid });
  assert.equal(antes.ok, true, JSON.stringify(antes));
  divergenceReadFailure = "57014";
  try {
    const guardian = await callTool("get_writer_guardian", { documentId: documentEvid });
    assert.equal(guardian.ok, true, JSON.stringify(guardian));
    const report = guardian.result as { findings: unknown[]; notices?: string[] };
    assert.match(report.notices?.[0] ?? "", /^divergencias_nao_lidas \(statement_timeout\)/);
    assert.doesNotMatch(JSON.stringify(report), /DADO-DA-LINHA|canceling/);
    assert.deepEqual(report.findings, (antes.result as { findings: unknown[] }).findings, "as regras determinísticas seguem iguais");
  } finally { divergenceReadFailure = null; }
});

const HASH_BRIEF = `sha256:${"f".repeat(64)}`;
function briefRow(id: string, change: (payload: Record<string, unknown>) => Record<string, unknown>) {
  const base = documentoV2ComDossie(id, bundleDoRadar(200)) as unknown as Record<string, unknown>;
  const payload = change(base);
  ContentDocumentSchema.parse(payload);
  fullRows[id] = { id, marca_id: brandA.brandId, article_id: "artigo-e1", content_hash: `hash-${id}`, lock_version: 1, status: "writing", updated_at: "2026-09-23T10:00:00+00:00", payload };
}
type BriefResult = Record<string, unknown> & { trimmed?: Array<{ field: string; kept: number; total: number }>; instructions: string[]; pendingDecisions: Array<{ id: string; blocking: boolean }> };

test("B2 · briefing enorme cabe em 32 kB: a lista mais pesada cede primeiro, as pendências bloqueantes ficam, todo corte é declarado", async () => {
  const id = "writer:doc-briefing-grande";
  const instrucoes = Array.from({ length: 200 }, (_, indice) => `Instrução ${indice}: ${"detalhe da instrução ".repeat(16)}`);
  const pendencias = Array.from({ length: 150 }, (_, indice) => ({ id: `p${indice}`, label: `Pendência ${indice}`, blocking: indice % 25 === 7, reason: "motivo da pendência ".repeat(10) }));
  briefRow(id, base => ({
    ...base,
    instructions: instrucoes,
    linkMap: Array.from({ length: 120 }, (_, indice) => ({ targetArticleId: `artigo-${indice}`, anchor: `âncora ${indice} ${"texto".repeat(20)}` })),
    evidenceRefs: [{ artifactId: "ev-1", artifactType: "source", contentHash: HASH_BRIEF }],
    importedContext: { ...(base.importedContext as Record<string, unknown>), pendingDecisions: pendencias },
  }));
  try {
    const brief = await callTool("get_writer_brief", { documentId: id });
    assert.equal(brief.ok, true, JSON.stringify(brief).slice(0, 400));
    const result = brief.result as BriefResult;
    assert.ok(writerEvidenceJsonBytes(result) <= WRITER_EVIDENCE_LIMITS.sliceMaxBytes, `${writerEvidenceJsonBytes(result)} B`);
    const cuts = new Map((result.trimmed ?? []).map(item => [item.field, item]));
    assert.equal(cuts.get("instructions")?.total, 200);
    assert.ok(result.instructions.length > 0 && result.instructions.length < 200, String(result.instructions.length));
    assert.deepEqual(result.instructions, instrucoes.slice(0, result.instructions.length), "a ordem fica: os primeiros ficam");
    for (const [field, cut] of cuts) assert.equal((result[field] as unknown[]).length, cut.kept, `${field}: o que ficou é o declarado`);
    assert.equal(cuts.has("evidenceRefs"), false, "a lista pequena não paga pela grande");
    assert.equal(cuts.has("sourceIds"), false);
    assert.equal((result.evidenceRefs as unknown[]).length, 1);
    assert.equal(cuts.get("pendingDecisions")?.total, 150);
    assert.deepEqual(result.pendingDecisions.filter(item => item.blocking).map(item => item.id), pendencias.filter(item => item.blocking).map(item => item.id), "as bloqueantes ficam todas");
  } finally { delete fullRows[id]; }
});

test("B2 · briefing: uma instrução sozinha acima de 32 kB sai declarada (0 de 1); cabeçalho do dossiê fora de proporção é source_too_large, nunca acima do teto", async () => {
  const unica = "writer:doc-briefing-instrucao-unica";
  briefRow(unica, base => ({ ...base, instructions: [`Instrução gigante ${"x".repeat(40_000)}`] }));
  const enorme = "writer:doc-briefing-cabecalho-enorme";
  briefRow(enorme, base => {
    const contexto = base.importedContext as Record<string, unknown> & { dossier: Record<string, unknown> & { keywordContext: Record<string, unknown> } };
    return { ...base, importedContext: { ...contexto, dossier: { ...contexto.dossier, keywordContext: { ...contexto.dossier.keywordContext, secondary: Array.from({ length: 400 }, (_, indice) => `secundária ${indice} ${"y".repeat(100)}`) } } } };
  });
  try {
    const brief = await callTool("get_writer_brief", { documentId: unica });
    assert.equal(brief.ok, true, JSON.stringify(brief).slice(0, 400));
    const result = brief.result as BriefResult;
    assert.ok(writerEvidenceJsonBytes(result) <= WRITER_EVIDENCE_LIMITS.sliceMaxBytes);
    assert.deepEqual(result.instructions, []);
    assert.deepEqual(result.trimmed, [{ field: "instructions", kept: 0, total: 1 }], "o corte é dito, para a IA não inferir que não havia instrução");

    const refused = await callTool("get_writer_brief", { documentId: enorme });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "source_too_large", JSON.stringify(refused).slice(0, 400));
    assert.ok(byteLength(refused) < 2_000, "a recusa não carrega o briefing");
  } finally { delete fullRows[unica]; delete fullRows[enorme]; }
});

/* ============ SDD do Assunto, F4.1 e F4.2 · briefing e Guardião do MCP ============ */

const HASH_DNA = `sha256:${"a".repeat(64)}`;
const ASSUNTO_DO_DNA = {
  keywordId: "kw-2",
  approvedPackageRef: { version: 3, contentHash: `sha256:${"p".repeat(64)}`, approvedAt: "2026-09-24T10:00:00+00:00" },
  phrase: "Consulta dermatológica online",
  note: "A marca atende por teleconsulta.",
  destinationUrl: "https://careglow.com.br/consulta-online",
  attachedBy: actorId,
  attachedAt: "2026-09-24T12:00:00+00:00",
};
/* A versão do ArticleDNA que o documento da E1 fixa (`artigo-e1-v1`), com ou sem Assunto. */
const versaoDoArtigo = (payload: Record<string, unknown>, marca = brandA.brandId) => ({
  version_id: "artigo-e1-v1", entity_id: "artigo-e1", artifact_type: "article_dna", version_number: 1, status: "approved",
  content_hash: HASH_DNA, created_at: "2026-09-24T12:00:00+00:00", marca_id: marca, payload: { brandId: marca, ...payload },
});

test("F4.2 · Guardião do MCP: com Assunto no ArticleDNA fixado, dois AVISOS (virada e destino), nunca bloqueio; sem Assunto, o relatório de antes", async () => {
  const id = "writer:doc-assunto-guardiao";
  fullRows[id] = { id, marca_id: brandA.brandId, article_id: "artigo-e1", content_hash: "hash-assunto", lock_version: 1, status: "writing", updated_at: "2026-09-23T10:00:00+00:00", payload: documentoV2ComDossie(id, bundleDoRadar(200)) };
  try {
    artifactRows = [versaoDoArtigo({ promise: "Rotina" })];
    const semAssunto = await callTool("get_writer_guardian", { documentId: id });
    assert.equal(semAssunto.ok, true, JSON.stringify(semAssunto));
    const antes = semAssunto.result as { findings: Array<{ category: string; severity: string; message: string }>; blockingCount: number; warningCount: number; notices?: string[] };
    assert.equal(antes.findings.some(item => /Assunto/.test(item.message)), false, "sem Assunto, nenhuma conferência nova");
    assert.deepEqual(semGeradoEm(antes), semGeradoEm(JSON.parse(JSON.stringify(runGuardian(ContentDocumentSchema.parse(fullRows[id].payload), "hash-assunto")))));

    artifactRows = [versaoDoArtigo({ subject: ASSUNTO_DO_DNA }), versaoDoArtigo({ subject: { ...ASSUNTO_DO_DNA, phrase: "Assunto de outra Marca" } }, brandB)];
    queries.length = 0;
    const comAssunto = await callTool("get_writer_guardian", { documentId: id });
    assert.equal(comAssunto.ok, true, JSON.stringify(comAssunto));
    const depois = comAssunto.result as typeof antes;
    const doAssunto = depois.findings.filter(item => /Assunto/.test(item.message));
    assert.deepEqual(doAssunto.map(item => `${item.category}:${item.severity}`).sort(), ["coverage:warning", "cta:warning"]);
    assert.match(doAssunto.find(item => item.category === "coverage")!.message, /Consulta dermatológica online/);
    assert.match(doAssunto.find(item => item.category === "cta")!.message, /careglow\.com\.br\/consulta-online/);
    assert.equal(depois.blockingCount, antes.blockingCount, "o Assunto nunca bloqueia");
    assert.equal(depois.warningCount, antes.warningCount + 2);
    assert.deepEqual(documentSelects(), [WRITER_GUARDIAN_SELECT], "o documento é lido uma vez só");
    const leituraDoDna = queries.filter(query => query.table === "editorial_artifact_versions");
    assert.equal(leituraDoDna.length, 1, "UMA leitura do ArticleDNA");
    assert.ok(leituraDoDna[0].filters.includes("version_id=eq.artigo-e1-v1"), leituraDoDna[0].filters);
    assert.ok(leituraDoDna[0].filters.includes(`marca_id=eq.${brandA.brandId}`), leituraDoDna[0].filters);
    assert.ok(Buffer.byteLength(leituraDoDna[0].responseBody) < 1_024, `${Buffer.byteLength(leituraDoDna[0].responseBody)} B`);
    assert.doesNotMatch(JSON.stringify(depois), /Assunto de outra Marca/);

    /* A virada escrita e o link para o destino: os avisos somem. */
    const payload = structuredClone(fullRows[id].payload) as Record<string, unknown> & { blocks: unknown[] };
    const proveniencia = { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] };
    payload.blocks = [...payload.blocks,
      { id: "b3", type: "heading", level: 3, text: "Quando procurar uma consulta dermatológica online", provenance: proveniencia },
      { id: "b4", type: "paragraph", text: "Agende em [careglow](https://www.careglow.com.br/consulta-online/).", provenance: proveniencia }];
    fullRows[id] = { ...fullRows[id], payload };
    const escrito = await callTool("get_writer_guardian", { documentId: id });
    assert.equal(((escrito.result as typeof antes).findings).some(item => /Assunto/.test(item.message)), false);

    /* Falha ao ler o ArticleDNA: aviso, e a análise determinística segue. */
    artifactReadFailure = "57014";
    const falhou = await callTool("get_writer_guardian", { documentId: id });
    assert.equal(falhou.ok, true, JSON.stringify(falhou));
    const relatorio = falhou.result as typeof antes;
    assert.ok((relatorio.notices || []).some(item => /^assunto_nao_lido \(statement_timeout\)/.test(item)), JSON.stringify(relatorio.notices));
    assert.doesNotMatch(JSON.stringify(relatorio), /DADO-DO-DNA|canceling/);
  } finally { artifactRows = []; artifactReadFailure = null; delete fullRows[id]; }
});

test("F4.1 · briefing do MCP: as linhas do envio saem em editorialContext; lista vazia não acrescenta chave", async () => {
  const comLinhas = "writer:doc-assunto-briefing";
  const semLinhas = "writer:doc-assunto-briefing-vazio";
  const LINHAS = ["Tronco (Assunto): Consulta dermatológica online.", "Virada: onde quem redige decidir (sem sinal na SERP), levar o leitor de skin care noturno a Consulta dermatológica online."];
  briefRow(comLinhas, base => ({ ...base, importedContext: { ...(base.importedContext as Record<string, unknown>), editorialContext: LINHAS } }));
  briefRow(semLinhas, base => ({ ...base, importedContext: { ...(base.importedContext as Record<string, unknown>), editorialContext: [] } }));
  try {
    queries.length = 0;
    const brief = await callTool("get_writer_brief", { documentId: comLinhas });
    assert.equal(brief.ok, true, JSON.stringify(brief));
    assert.deepEqual((brief.result as Record<string, unknown>).editorialContext, LINHAS);
    assert.deepEqual(documentSelects(), [WRITER_BRIEF_SELECT]);
    assert.match(WRITER_BRIEF_SELECT, /r_editorialContext:payload->importedContext->editorialContext/);
    const vazio = await callTool("get_writer_brief", { documentId: semLinhas });
    assert.equal(vazio.ok, true, JSON.stringify(vazio));
    assert.equal("editorialContext" in (vazio.result as Record<string, unknown>), false, "sem linhas, o briefing de antes");
    const v1 = await callTool("get_writer_brief", { documentId: documentA });
    assert.equal("editorialContext" in (v1.result as Record<string, unknown>), false);
  } finally { delete fullRows[comLinhas]; delete fullRows[semLinhas]; }
});
