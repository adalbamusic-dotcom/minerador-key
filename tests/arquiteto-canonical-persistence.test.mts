import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload, deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { loadCanonicalArquitetoArtifacts, persistArquitetoArtifact } from "../lib/arquiteto/canonical-persistence.ts";
import { appendArquitetoArtifact, listArquitetoArtifacts } from "../lib/server/arquiteto-persistence.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { PipelineRuntimeError } from "../lib/server/pipeline-runtime.ts";
import { buildCanonicalArticleWorkspaceItems, mergeCanonicalArticleWorkspaceItems } from "../lib/arquiteto/canonical-bootstrap.ts";

const actorId = "550e8400-e29b-41d4-a716-446655440000";
const brandId = "550e8400-e29b-41d4-a716-446655440001";

type ResponseValue = { data: unknown; error: unknown };

class FakeQuery {
  private operation = "select";
  private payload: unknown;
  constructor(private readonly client: FakeClient, private readonly table: string) {}
  select() { return this; }
  eq() { return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload: unknown) { this.operation = "insert"; this.payload = payload; return this; }
  single() { return this.resolve(); }
  maybeSingle() { return this.resolve(); }
  then<TResult1 = ResponseValue, TResult2 = never>(onfulfilled?: ((value: ResponseValue) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.resolve().then(onfulfilled, onrejected);
  }
  private resolve() {
    this.client.calls.push({ table: this.table, operation: this.operation, payload: this.payload });
    return Promise.resolve(this.client.responses.shift() ?? { data: null, error: null });
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; operation: string; payload?: unknown }> = [];
  constructor(readonly responses: ResponseValue[]) {}
  from(table: string) { return new FakeQuery(this, table); }
}

function context(client: FakeClient) {
  return { actorUserId: actorId, brandId, module: "arquiteto", action: "create", permissions: ["arquiteto:create"] as readonly [string], authorizationSource: "canonical_actor_rpc" as const, supabase: client as unknown as SupabaseClient };
}

function row(version: Awaited<ReturnType<typeof createVersionEnvelope>>, type: string, sourceVersionId: string | null = null) {
  return {
    version_id: version.versionId,
    entity_id: version.entityId,
    marca_id: brandId,
    artifact_type: type,
    version_number: version.versionNumber,
    previous_version_id: version.previousVersionId,
    source_version_id: sourceVersionId,
    status: "proposed",
    content_hash: version.contentHash,
    payload: version.payload,
    origin: version.origin,
    change_reason: version.changeReason,
    created_by: actorId,
    created_at: version.createdAt.replace(/Z$/, "+00:00"),
  };
}

test("Arquiteto persiste SiloDNA, confirma a linha canônica e retorna UNCHANGED pelo mesmo hash", async () => {
  const payload = deterministicSiloDnaPayload("silo-1", "Silo 1", [], { brandId });
  const version = await createVersionEnvelope({ entityId: "silo-1", versionNumber: 1, origin: "human", changeReason: "teste", createdBy: actorId, payload });
  const stored = row(version, "silo_dna");
  const client = new FakeClient([{ data: null, error: null }, { data: stored, error: null }, { data: stored, error: null }]);

  const first = await appendArquitetoArtifact(context(client), "silo_dna", version);
  const second = await appendArquitetoArtifact(context(client), "silo_dna", version);

  assert.equal(first.status, "PERSISTED");
  assert.equal(second.status, "UNCHANGED");
  assert.equal(first.source, "CANONICAL_REMOTE");
  assert.equal(client.calls.filter(call => call.operation === "insert").length, 1);
});

test("readback remoto inválido retorna diagnóstico sanitizado por linha", async () => {
  const payload = deterministicSiloDnaPayload("silo-readback-invalid", "Silo readback", [], { brandId });
  const version = await createVersionEnvelope({ entityId: "silo-readback-invalid", versionNumber: 1, origin: "human", changeReason: "teste", createdBy: actorId, payload });
  const invalidRow = { ...row(version, "silo_dna"), created_at: "not-a-database-timestamp" };

  await assert.rejects(
    listArquitetoArtifacts(context(new FakeClient([{ data: [invalidRow], error: null }]))),
    (error: unknown) => error instanceof PipelineRuntimeError
      && error.code === "INVALID_ARTIFACT"
      && /row=0/.test(error.message)
      && /artifactType=silo_dna/.test(error.message)
      && /issuePath=createdAt/.test(error.message)
      && /issueCode=invalid_format/.test(error.message)
      && !error.message.includes("not-a-database-timestamp"),
  );
});

test("SiloPage exige e grava a referência de SiloDNA canônica da mesma Brand", async () => {
  const siloPayload = deterministicSiloDnaPayload("silo-2", "Silo 2", [], { brandId });
  const silo = await createVersionEnvelope({ entityId: "silo-2", versionNumber: 1, versionId: "silo-v1", origin: "human", changeReason: "teste", createdBy: actorId, payload: siloPayload });
  const pagePayload = deterministicSiloPagePayload(silo, brandId, "silo-2");
  const page = await createVersionEnvelope({ entityId: pagePayload.siloPageId, versionNumber: 1, origin: "system", changeReason: "teste", createdBy: actorId, payload: pagePayload });
  const sourceRow = row(silo, "silo_dna");
  const pageRow = row(page, "silo_page", silo.versionId);
  const client = new FakeClient([{ data: [sourceRow], error: null }, { data: null, error: null }, { data: pageRow, error: null }]);

  const persisted = await appendArquitetoArtifact(context(client), "silo_page", page);
  assert.equal(persisted.status, "PERSISTED");
  const insert = client.calls.find(call => call.operation === "insert");
  assert.equal((insert?.payload as { source_version_id?: string }).source_version_id, silo.versionId);
});

test("artefato de outra Brand é rejeitado antes da persistência", async () => {
  const payload = deterministicSiloDnaPayload("silo-3", "Silo 3", [], { brandId: "550e8400-e29b-41d4-a716-446655440099" });
  const version = await createVersionEnvelope({ entityId: "silo-3", versionNumber: 1, origin: "human", changeReason: "teste", createdBy: actorId, payload });
  await assert.rejects(appendArquitetoArtifact(context(new FakeClient([])), "silo_dna", version), (error: unknown) => error instanceof PipelineRuntimeError && error.code === "NOT_AUTHORIZED");
});

test("ArticleDNA válido preserva o envelope snake_case e confirma PERSISTED/UNCHANGED", async () => {
  const group = buildProvisionalGroups([
    {
      id: "kw-article-1",
      keyword: "seo para clinicas",
      intent: "Informativo",
      volume_search: 100,
      kgr_score: 0.2,
      lista_id: "silo-article",
      siloName: "SEO para clinicas",
      status: "aprovado",
      analise_semantica: { entidade_central: "SEO" },
    },
  ])[0];
  assert.ok(group);
  const payload = deterministicArticleDnaPayload(group, brandId);
  const version = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "teste", createdBy: actorId, payload });
  const stored = row(version, "article_dna");
  const client = new FakeClient([{ data: null, error: null }, { data: stored, error: null }, { data: stored, error: null }]);

  const first = await appendArquitetoArtifact(context(client), "article_dna", version);
  const second = await appendArquitetoArtifact(context(client), "article_dna", version);

  assert.equal(first.status, "PERSISTED");
  assert.equal(second.status, "UNCHANGED");
  assert.equal(second.version.entityId, payload.articleId);
  assert.equal(second.version.previousVersionId, null);
});

test("parser do cliente aceita a resposta camelCase de PERSISTED e UNCHANGED", async () => {
  const payload = deterministicSiloDnaPayload("silo-parser", "Silo parser", [], { brandId });
  const version = await createVersionEnvelope({ entityId: "silo-parser", versionNumber: 1, origin: "human", changeReason: "teste", createdBy: actorId, payload });
  const previousFetch = globalThis.fetch;
  try {
    for (const persistence of ["PERSISTED", "UNCHANGED"] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { persistence, version, source: "CANONICAL_REMOTE" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      const parsed = await persistArquitetoArtifact({ brandId, artifactType: "silo_dna", action: "create", version });
      assert.equal(parsed.persistence, persistence);
      assert.equal(parsed.version.versionId, version.versionId);
      assert.equal(parsed.version.previousVersionId, null);
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("parser rejeita campo obrigatório ausente e artifact type incompatível", async () => {
  const payload = deterministicSiloDnaPayload("silo-invalid", "Silo inválido", [], { brandId });
  const version = await createVersionEnvelope({ entityId: "silo-invalid", versionNumber: 1, origin: "human", changeReason: "teste", createdBy: actorId, payload });
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { persistence: "PERSISTED", version: { ...version, entityId: undefined }, source: "CANONICAL_REMOTE" } }), { status: 200 });
    await assert.rejects(persistArquitetoArtifact({ brandId, artifactType: "silo_dna", action: "create", version }), /Invalid input|expected/);

    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { persistence: "PERSISTED", version, source: "CANONICAL_REMOTE" } }), { status: 200 });
    await assert.rejects(persistArquitetoArtifact({ brandId, artifactType: "article_dna", action: "create", version: version as never }), /Invalid input|expected/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("bootstrap fresh-origin materializa ArticleDNA canônico sem masterList legado", async () => {
  const group = buildProvisionalGroups([
    { id: "kw-fresh", keyword: "arquiteto fresh origin", intent: "Informativo", volume_search: 30, lista_id: "silo-fresh", status: "aprovado", analise_semantica: { entidade_central: "arquitetura" } },
  ])[0];
  assert.ok(group);
  const payload = deterministicArticleDnaPayload(group, brandId);
  const version = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "fresh-origin", createdBy: actorId, payload });

  const bootstrap = buildCanonicalArticleWorkspaceItems([version], brandId);
  const workspace = mergeCanonicalArticleWorkspaceItems([], bootstrap.items, brandId);

  assert.equal(bootstrap.contractGaps.length, 0);
  assert.equal(workspace.length, payload.keywordReferences.length);
  assert.equal(workspace[0]?.source, "CANONICAL_REMOTE");
  assert.equal((workspace[0]?.canonicalArtifact as { entityId: string }).entityId, payload.articleId);
  assert.equal(workspace[0]?.keyword, "arquiteto fresh origin");
  assert.equal(workspace[0]?.computedSlug, payload.suggestedSlug);
});

test("bootstrap canônico vence cópia local equivalente, preserva recovery local-only e não duplica", async () => {
  const group = buildProvisionalGroups([
    { id: "kw-merge", keyword: "artigo canônico", intent: "Informativo", volume_search: 20, status: "aprovado", analise_semantica: { entidade_central: "artigo" } },
  ])[0];
  assert.ok(group);
  const payload = deterministicArticleDnaPayload(group, brandId);
  const version = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: 2, origin: "human", changeReason: "precedence", createdBy: actorId, payload });
  const canonical = buildCanonicalArticleWorkspaceItems([version], brandId).items;
  const merged = mergeCanonicalArticleWorkspaceItems([
    { id: "kw-merge", keywordId: "kw-merge", keyword: "cópia local", clusterId: payload.articleId, source: "LOCAL_RECOVERY" },
    { id: "kw-local-only", keywordId: "kw-local-only", keyword: "somente recovery", clusterId: "local-article", source: "LOCAL_RECOVERY" },
  ], canonical, brandId);

  assert.equal(merged.filter(item => item.keywordId === "kw-merge").length, 1);
  assert.equal(merged.find(item => item.keywordId === "kw-merge")?.source, "CANONICAL_REMOTE");
  assert.equal(merged.some(item => item.keywordId === "kw-local-only"), true);
});

test("bootstrap não cria linha para Brand diferente e distingue lacuna de texto da origem", async () => {
  const group = buildProvisionalGroups([
    { id: "kw-brand", keyword: "brand isolada", intent: "Informativo", status: "aprovado", analise_semantica: { entidade_central: "brand" } },
  ])[0];
  assert.ok(group);
  const payload = deterministicArticleDnaPayload(group, brandId);
  const version = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "isolation", createdBy: actorId, payload });
  assert.equal(buildCanonicalArticleWorkspaceItems([version], "550e8400-e29b-41d4-a716-446655440099").items.length, 0);

  const incomplete = {
    ...version,
    payload: {
      ...payload,
      keywordReferences: payload.keywordReferences.map(reference => ({ ...reference, keywordDnaSnapshot: undefined })),
    },
  } as typeof version;
  const gap = buildCanonicalArticleWorkspaceItems([incomplete], brandId);
  assert.deepEqual(gap.items, []);
  assert.deepEqual(gap.contractGaps, ["payload.keywordReferences[].keywordDnaSnapshot.sourceKeywordSnapshot.keyword"]);
});

test("readback mantém o código seguro da rota e NO_DATA continua sendo lista vazia", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, error: "falha sanitizada", code: "SCHEMA_MISSING" }), { status: 503 });
    await assert.rejects(loadCanonicalArquitetoArtifacts(brandId), (error: unknown) => error instanceof Error && "code" in error && error.code === "SCHEMA_MISSING");

    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { articleDnas: [], siloDnas: [], siloPages: [], statuses: [], source: "CANONICAL_REMOTE" } }), { status: 200 });
    const empty = await loadCanonicalArquitetoArtifacts(brandId);
    assert.deepEqual(empty.articleDnas, []);
    assert.equal(empty.source, "CANONICAL_REMOTE");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
