import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PipelineRuntimeError,
  readMany,
  readOne,
  resolvePipelineContext,
} from "../lib/server/pipeline-runtime.ts";
import {
  ArtifactVersionRepository,
  ContentDocumentUserStateRepository,
  ContentDocumentVersionRepository,
  SerpReviewRepository,
  SerpSnapshotRepository,
  WorkflowRepository,
} from "../lib/server/pipeline-repositories.ts";

const actorId = "550e8400-e29b-41d4-a716-446655440000";
const brandId = "550e8400-e29b-41d4-a716-446655440001";

type ResponseValue = { data: unknown; error: unknown };
type Call = { table: string; operation: string; filters: Array<[string, unknown]>; payload?: unknown };

class FakeQuery {
  private readonly client: FakeClient;
  private readonly table: string;
  private operation = "select";
  private payload: unknown;
  private readonly filters: Array<[string, unknown]> = [];

  constructor(client: FakeClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select() { return this; }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload: unknown) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload: unknown) { this.operation = "update"; this.payload = payload; return this; }
  upsert(payload: unknown) { this.operation = "upsert"; this.payload = payload; return this; }
  single() { return this.resolve(); }
  maybeSingle() { return this.resolve(); }

  then<TResult1 = ResponseValue, TResult2 = never>(
    onfulfilled?: ((value: ResponseValue) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.resolve().then(onfulfilled, onrejected);
  }

  private resolve() {
    this.client.calls.push({ table: this.table, operation: this.operation, filters: [...this.filters], payload: this.payload });
    return Promise.resolve(this.client.responses.shift() ?? { data: null, error: null });
  }
}

class FakeClient {
  readonly calls: Call[] = [];
  readonly rpcCalls: Array<{ name: string; params: Record<string, string> }> = [];
  readonly responses: ResponseValue[];
  private readonly rpcResults: Record<string, ResponseValue>;

  constructor(responses: ResponseValue[] = [], rpcResults: Record<string, ResponseValue> = {}) {
    this.responses = responses;
    this.rpcResults = rpcResults;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  async rpc(name: string, params: Record<string, string>) {
    this.rpcCalls.push({ name, params });
    return this.rpcResults[name] ?? { data: false, error: null };
  }
}

function context(client: FakeClient) {
  return {
    actorUserId: actorId,
    brandId,
    module: "radar",
    action: "view",
    permissions: ["radar:view"] as readonly [string],
    authorizationSource: "canonical_actor_rpc" as const,
    supabase: client as unknown as SupabaseClient,
  };
}

test("resolvePipelineContext exige brandId, actor autenticado e os dois RPCs canônicos", async () => {
  const client = new FakeClient([], {
    canonical_actor_can_access_brand: { data: true, error: null },
    canonical_actor_can_use_brand_action: { data: true, error: null },
  });
  const resolved = await resolvePipelineContext(
    { brandId, module: "radar", action: "view" },
    { requireActorUserId: async () => actorId, createServiceClient: () => client as unknown as SupabaseClient },
  );

  assert.equal(resolved.actorUserId, actorId);
  assert.equal(resolved.brandId, brandId);
  assert.deepEqual(client.rpcCalls, [
    { name: "canonical_actor_can_access_brand", params: { target_brand_id: brandId, target_actor_user_id: actorId } },
    { name: "canonical_actor_can_use_brand_action", params: { target_brand_id: brandId, target_actor_user_id: actorId, requested_module: "radar", requested_action: "view" } },
  ]);
});

test("contexto não usa fallback e não entrega service_role antes da autorização", async () => {
  let created = false;
  await assert.rejects(
    resolvePipelineContext(
      { brandId, module: "radar", action: "view" },
      {
        requireActorUserId: async () => { throw new PipelineRuntimeError("NOT_AUTHORIZED", "sessão inválida", 401); },
        createServiceClient: () => { created = true; return new FakeClient() as unknown as SupabaseClient; },
      },
    ),
    (error: unknown) => error instanceof PipelineRuntimeError && error.code === "NOT_AUTHORIZED",
  );
  assert.equal(created, false);

  await assert.rejects(
    resolvePipelineContext(
      { brandId, module: "radar", action: "view" },
      { requireActorUserId: async () => "not-a-uuid", createServiceClient: () => new FakeClient() as unknown as SupabaseClient },
    ),
    (error: unknown) => error instanceof PipelineRuntimeError && error.code === "NOT_AUTHORIZED",
  );

  await assert.rejects(
    resolvePipelineContext(
      { brandId: "", module: "radar", action: "view" },
      { requireActorUserId: async () => actorId, createServiceClient: () => new FakeClient() as unknown as SupabaseClient },
    ),
    (error: unknown) => error instanceof PipelineRuntimeError && error.code === "INVALID_CONTEXT",
  );
});

test("acesso e ação negados são NOT_AUTHORIZED e não viram empty state", async () => {
  const client = new FakeClient([], { canonical_actor_can_access_brand: { data: false, error: null } });
  await assert.rejects(
    resolvePipelineContext({ brandId, module: "radar", action: "view" }, { requireActorUserId: async () => actorId, createServiceClient: () => client as unknown as SupabaseClient }),
    (error: unknown) => error instanceof PipelineRuntimeError && error.code === "NOT_AUTHORIZED",
  );
  assert.equal(client.rpcCalls.length, 1);

  const actionClient = new FakeClient([], {
    canonical_actor_can_access_brand: { data: true, error: null },
    canonical_actor_can_use_brand_action: { data: false, error: null },
  });
  await assert.rejects(
    resolvePipelineContext({ brandId, module: "radar", action: "publish" }, { requireActorUserId: async () => actorId, createServiceClient: () => actionClient as unknown as SupabaseClient }),
    (error: unknown) => error instanceof PipelineRuntimeError && error.code === "NOT_AUTHORIZED",
  );
  assert.equal(actionClient.rpcCalls.length, 2);
});

test("NO_DATA, SCHEMA_MISSING e QUERY_FAILURE permanecem distintos", () => {
  assert.deepEqual(readOne(null, null), { status: "NO_DATA", data: null });
  assert.deepEqual(readMany([], null), { status: "NO_DATA", data: null });
  assert.throws(() => readMany(null, { code: "42P01", message: "relation does not exist" }), (error: unknown) => error instanceof PipelineRuntimeError && error.code === "SCHEMA_MISSING");
  assert.throws(() => readMany(null, { code: "XX000", message: "remote failure" }), (error: unknown) => error instanceof PipelineRuntimeError && error.code === "QUERY_FAILURE");
});

test("ArtifactVersionRepository é append-only, escopado por Brand e não duplica hash", async () => {
  const firstRow = { version_id: "v1", version_number: 1, content_hash: "hash-1", marca_id: brandId };
  const client = new FakeClient([
    { data: null, error: null },
    { data: firstRow, error: null },
    { data: firstRow, error: null },
  ]);
  const repository = new ArtifactVersionRepository(context(client));
  const first = await repository.append({ entityId: "article-1", artifactType: "article_dna", status: "draft", contentHash: "hash-1", payload: {}, origin: "human", changeReason: "initial" });
  const second = await repository.append({ entityId: "article-1", artifactType: "article_dna", status: "draft", contentHash: "hash-1", payload: {}, origin: "human", changeReason: "same" });

  assert.equal(first.status, "PERSISTED");
  assert.equal(second.status, "UNCHANGED");
  assert.equal(client.calls.filter((call) => call.table === "editorial_artifact_versions" && call.operation === "insert").length, 1);
  const select = client.calls.find((call) => call.operation === "select");
  assert.deepEqual(select?.filters.slice(0, 3), [["marca_id", brandId], ["entity_id", "article-1"], ["artifact_type", "article_dna"]]);
  for (const appendOnlyRepository of [
    repository,
    new SerpSnapshotRepository(context(client)),
    new SerpReviewRepository(context(client)),
    new ContentDocumentVersionRepository(context(client)),
  ]) {
    assert.equal("update" in appendOnlyRepository, false);
    assert.equal("delete" in appendOnlyRepository, false);
  }
});

test("repositories SERP do pipeline não enviam IDs textuais para colunas UUID", async () => {
  const client = new FakeClient([{ data: { id: "550e8400-e29b-41d4-a716-446655440002" }, error: null }]);
  const repository = new SerpSnapshotRepository(context(client));
  await repository.append({
    id: "serp:legacy-id",
    articleId: "article-1",
    sourceVersionId: "article-dna-v1",
    snapshotVersion: 1,
    previousSnapshotId: "serp:legacy-previous",
    contentHash: "hash",
    status: "needs_review",
    payload: { provider: "dataforseo" },
    createdAt: "2026-08-25T12:00:00-03:00",
  });
  const insert = client.calls.find(call => call.table === "editorial_serp_snapshots" && call.operation === "insert");
  const payload = insert?.payload as { id?: string; previous_snapshot_id?: string | null; source_version_id?: string; created_at?: string } | undefined;
  assert.equal(typeof payload?.id, "string");
  assert.match(payload?.id || "", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(payload?.previous_snapshot_id, null);
  assert.equal(payload?.source_version_id, "article-dna-v1");
  assert.equal(payload?.created_at, "2026-08-25T15:00:00.000Z");

  const reviewRepository = new SerpReviewRepository(context(new FakeClient()));
  await assert.rejects(
    reviewRepository.append({ id: "serp-review:legacy-id", articleId: "article-1", snapshotId: "serp:legacy-id", status: "approved", payload: {} }),
    (error: unknown) => error instanceof PipelineRuntimeError && error.code === "INVALID_CONTEXT",
  );
});

test("WorkflowRepository aplica brandId e lock_version e retorna CONFLICT sem confirmação", async () => {
  const client = new FakeClient([{ data: null, error: null }]);
  const repository = new WorkflowRepository(context(client));
  await assert.rejects(repository.update("workflow-1", 3, { state: "approved" }), (error: unknown) => error instanceof PipelineRuntimeError && error.code === "CONFLICT");
  assert.deepEqual(client.calls[0]?.filters, [["id", "workflow-1"], ["marca_id", brandId], ["lock_version", 3]]);
});

test("estado pessoal deriva user_id do actor autenticado e nunca recebe userId do cliente", async () => {
  const client = new FakeClient([
    { data: { id: "document-1" }, error: null },
    { data: { document_id: "document-1", user_id: actorId }, error: null },
  ]);
  const repository = new ContentDocumentUserStateRepository(context(client));
  await repository.save("document-1", { cursorPosition: 4, scrollTop: 8, leftPanelOpen: true, rightPanelOpen: false });
  const upsert = client.calls.find((call) => call.operation === "upsert");
  assert.equal((upsert?.payload as { user_id?: string } | undefined)?.user_id, actorId);
  assert.equal(upsert?.filters.length, 0);
});
