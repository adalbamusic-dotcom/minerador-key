/**
 * Egress do Arquiteto: listArquitetoArtifacts pede ao banco só os tipos que monta.
 *
 * Antes, ArtifactVersionRepository.list() sem argumentos baixava TODAS as
 * versões de editorial_artifact_versions da marca, com payload, inclusive as do
 * Minerador (keyword_semantic_qualification, keyword_contextual_presentation,
 * brand_skill), e o laço de listArquitetoArtifacts as descartava. Medido em
 * 2026-09-23: ~1 MB por chamada na marca 09762023 (81% descartado) e ~1,5 MB na
 * 4a737e74 (100% descartado).
 *
 * O que este arquivo prova:
 * (a) o parâmetro novo `artifactTypes` é opcional: ausente ou vazio, a consulta
 *     é a mesma de antes (nenhum filtro de tipo), porque há outros chamadores;
 * (b) listArquitetoArtifacts envia exatamente os tipos do laço, e o retorno é
 *     idêntico ao que o laço produziria lendo a tabela inteira;
 * (c) o conjunto enviado é derivado do próprio laço: um tipo novo tratado lá e
 *     esquecido na constante derruba o teste.
 *
 * Os módulos de servidor importam "server-only" e o alias "@/"; o loader de
 * integração do repositório resolve os dois, então ele é registrado antes do
 * import dinâmico.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

register("./integrations-runtime-loader.mjs", import.meta.url);

const { ArtifactVersionRepository } = await import("../lib/server/pipeline-repositories.ts");
const { ARQUITETO_LISTED_ARTIFACT_TYPES, listArquitetoArtifacts } = await import("../lib/server/arquiteto-persistence.ts");
const { ARTICLE_AI_REVIEW_ARTIFACT_TYPE } = await import("../lib/arquiteto/article-ai-review.ts");
const { deterministicSiloDnaPayload } = await import("../lib/arquiteto/adapters.ts");
const { createVersionEnvelope } = await import("../lib/arquiteto/versioning.ts");

const actorId = "550e8400-e29b-41d4-a716-446655440000";
const brandId = "550e8400-e29b-41d4-a716-446655440001";

type Row = Record<string, unknown>;
type Call = { method: string; args: unknown[] };

/*
 * Driver fake que REGISTRA cada método encadeado. Com `applyFilters`, ele
 * também aplica eq/in às linhas, como o PostgREST; sem, devolve a tabela
 * inteira — é o cenário "antes do filtro", usado para provar que o retorno
 * não muda.
 */
function fakeClient(rows: Row[], applyFilters: boolean) {
  const calls: Call[] = [];
  const client = {
    calls,
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      const predicates: Array<(row: Row) => boolean> = [];
      const query = {
        select(...args: unknown[]) { calls.push({ method: "select", args }); return query; },
        eq(column: string, value: unknown) {
          calls.push({ method: "eq", args: [column, value] });
          predicates.push(row => row[column] === value);
          return query;
        },
        in(column: string, values: readonly unknown[]) {
          calls.push({ method: "in", args: [column, values] });
          predicates.push(row => values.includes(row[column]));
          return query;
        },
        order(...args: unknown[]) {
          calls.push({ method: "order", args });
          const data = applyFilters ? rows.filter(row => predicates.every(predicate => predicate(row))) : rows;
          return Promise.resolve({ data: JSON.parse(JSON.stringify(data)), error: null });
        },
      };
      return query;
    },
  };
  return client;
}

function context(client: unknown) {
  return {
    actorUserId: actorId,
    brandId,
    module: "arquiteto",
    action: "read",
    permissions: ["arquiteto:read"] as readonly [string],
    authorizationSource: "canonical_actor_rpc" as const,
    supabase: client as never,
  };
}

async function siloDnaRow() {
  const payload = deterministicSiloDnaPayload("silo-egress", "Silo egress", [], { brandId });
  const version = await createVersionEnvelope({ entityId: "silo-egress", versionNumber: 1, origin: "human", changeReason: "teste", createdBy: actorId, payload });
  return {
    version_id: version.versionId,
    entity_id: version.entityId,
    marca_id: brandId,
    artifact_type: "silo_dna",
    version_number: version.versionNumber,
    previous_version_id: version.previousVersionId,
    source_version_id: null,
    status: "proposed",
    content_hash: version.contentHash,
    payload: version.payload,
    origin: version.origin,
    change_reason: version.changeReason,
    created_by: actorId,
    // O PostgREST devolve timestamptz com deslocamento, não com "Z".
    created_at: version.createdAt.replace(/Z$/, "+00:00"),
  };
}

/* Linhas de outros módulos na mesma tabela: payload que não passaria nos schemas do Arquiteto. */
function foreignRow(type: string, index: number): Row {
  return {
    version_id: `foreign-${index}`,
    entity_id: `keyword-${index}`,
    marca_id: brandId,
    artifact_type: type,
    version_number: 1,
    status: "proposed",
    payload: { blob: "x".repeat(64) },
  };
}

test("(a) sem artifactTypes, list() não filtra tipo: a consulta é a mesma de antes", async () => {
  for (const args of [[], [undefined, undefined, undefined], [undefined, undefined, []]] as const) {
    const client = fakeClient([], true);
    const repository = new ArtifactVersionRepository(context(client));
    await repository.list(...(args as []));
    assert.deepEqual(
      client.calls,
      [
        { method: "from", args: ["editorial_artifact_versions"] },
        { method: "select", args: ["*"] },
        { method: "eq", args: ["marca_id", brandId] },
        { method: "order", args: ["version_number", { ascending: true }] },
      ],
      `list(${JSON.stringify(args)}) mudou a consulta`,
    );
  }
});

test("(a) list(entityId, tipo) dos validadores de append continua sem filtro 'in'", async () => {
  const client = fakeClient([], true);
  const repository = new ArtifactVersionRepository(context(client));
  await repository.list("silo-1", "silo_dna");
  assert.deepEqual(client.calls.map(call => call.method), ["from", "select", "eq", "eq", "eq", "order"]);
  assert.deepEqual(client.calls.slice(3, 5).map(call => call.args), [["entity_id", "silo-1"], ["artifact_type", "silo_dna"]]);
});

test("(a) com artifactTypes, list() aplica exatamente um 'in' em artifact_type", async () => {
  const client = fakeClient([], true);
  const repository = new ArtifactVersionRepository(context(client));
  await repository.list(undefined, undefined, ["article_dna", "silo_page"]);
  const inCalls = client.calls.filter(call => call.method === "in");
  assert.deepEqual(inCalls, [{ method: "in", args: ["artifact_type", ["article_dna", "silo_page"]] }]);
});

test("(b) listArquitetoArtifacts envia só os tipos do laço e devolve o mesmo que a leitura integral", async () => {
  const rows: Row[] = [
    foreignRow("keyword_semantic_qualification", 1),
    await siloDnaRow(),
    foreignRow("keyword_contextual_presentation", 2),
    foreignRow("brand_skill", 3),
  ];

  const filtered = fakeClient(rows, true);
  const result = await listArquitetoArtifacts(context(filtered) as never);

  const inCalls = filtered.calls.filter(call => call.method === "in");
  assert.equal(inCalls.length, 1, "a consulta do Arquiteto precisa filtrar o tipo no banco");
  assert.equal(inCalls[0].args[0], "artifact_type");
  assert.deepEqual(
    [...(inCalls[0].args[1] as string[])].sort(),
    ["article_dna", ARTICLE_AI_REVIEW_ARTIFACT_TYPE, "silo_dna", "silo_page"].sort(),
  );
  assert.ok(
    filtered.calls.some(call => call.method === "eq" && call.args[0] === "marca_id" && call.args[1] === brandId),
    "o filtro de tipo não substitui o de marca",
  );

  // Cenário anterior: o banco devolve tudo e o laço descarta. O retorno tem de ser igual.
  const unfiltered = fakeClient(rows, false);
  const before = await listArquitetoArtifacts(context(unfiltered) as never);
  assert.deepEqual(result, before);
  assert.equal(result.siloDnas.length, 1);
  assert.equal(result.statuses.length, 1);
  assert.deepEqual([result.articleDnas.length, result.siloPages.length, result.aiReviews.length], [0, 0, 0]);
});

test("(b) marca só com linhas do Minerador cai em NO_DATA com o mesmo retorno vazio", async () => {
  const rows = [foreignRow("keyword_semantic_qualification", 1), foreignRow("brand_skill", 2)];
  const result = await listArquitetoArtifacts(context(fakeClient(rows, true)) as never);
  assert.deepEqual(result, { articleDnas: [], siloDnas: [], siloPages: [], aiReviews: [], statuses: [], source: "CANONICAL_REMOTE" });
});

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("(c) os tipos filtrados são exatamente os que o laço de listArquitetoArtifacts trata", () => {
  const source = stripComments(readFileSync(new URL("../lib/server/arquiteto-persistence.ts", import.meta.url), "utf8"));
  const start = source.indexOf("export async function listArquitetoArtifacts(");
  assert.ok(start >= 0, "listArquitetoArtifacts não encontrada");
  const end = source.slice(start).search(/\r?\n\}\r?\n/);
  assert.ok(end > 0, "fim de listArquitetoArtifacts não encontrado");
  const body = source.slice(start, start + end);

  // Todo tipo comparado no laço, literal ou constante importada.
  const constants: Record<string, string> = { ARTICLE_AI_REVIEW_ARTIFACT_TYPE };
  const compared = new Set<string>();
  for (const match of body.matchAll(/\btype\s*===\s*(?:"([^"]+)"|([A-Z_][A-Z0-9_]*))/g)) {
    const value = match[1] ?? constants[match[2]];
    assert.ok(value, `constante de tipo desconhecida no laço: ${match[2]}`);
    compared.add(value);
  }
  assert.ok(compared.size >= 4, "o laço deveria comparar pelo menos os 4 tipos do Arquiteto");
  assert.deepEqual([...compared].sort(), [...ARQUITETO_LISTED_ARTIFACT_TYPES].sort());

  // E a consulta usa a constante, não uma list() sem filtro.
  assert.match(body, /repository\.list\(\s*undefined\s*,\s*undefined\s*,\s*ARQUITETO_LISTED_ARTIFACT_TYPES\s*\)/);
  assert.doesNotMatch(body, /repository\.list\(\s*\)/);
});
