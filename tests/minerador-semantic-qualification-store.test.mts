import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KEYWORD_SEMANTIC_QUALIFICATION_ORIGIN,
  KEYWORD_SEMANTIC_QUALIFICATION_STATUS,
  buildKeywordSemanticQualificationRow,
  classifyQualificationPersistenceError,
} from "../lib/minerador/keyword-semantic-qualification-row.ts";
import { buildKeywordSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";

/**
 * Persistência da Qualificação Semântica sem banco e sem provider.
 *
 * A linha enviada ao `editorial_artifact_versions` é montada por uma camada
 * pura, então o contrato da tabela (migration 0027) pode ser verificado sem
 * gastar nenhuma chamada DataForSEO.
 * PROVIDER_CALLS_FOR_PERSISTENCE_DIAGNOSIS = 0.
 */

const store = readFileSync(new URL("../lib/server/keyword-semantic-qualification-store.ts", import.meta.url), "utf8");
const tableDefinition = readFileSync(new URL("../supabase/migrations/0027_editorial_artifacts_workflow_serp.sql", import.meta.url), "utf8")
  .slice(0, 2000);

const BRAND = "11111111-1111-4111-8111-111111111111";
const KEYWORD = "22222222-2222-4222-8222-222222222222";
const ACTOR = "44444444-4444-4444-8444-444444444444";

const items = Array.from({ length: 8 }, (_, index) => ({ title: `O que é rotina para pele oleosa ${index + 1}`, description: "Guia passo a passo." }));

function evidence() {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-serp-1",
        status_code: 20000,
        result: [{
          keyword: "skin care pele oleosa",
          location_code: 2076,
          language_code: "pt",
          items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, ...item })),
        }],
      }],
    },
    keyword: "skin care pele oleosa",
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-serp-1",
    operationRequestId: "33333333-3333-4333-8333-333333333333",
    collectedAt: "2026-08-28T18:00:00.000Z",
  })!;
}

const qualification = (previous = null as Awaited<ReturnType<typeof buildKeywordSemanticQualification>> | null) =>
  buildKeywordSemanticQualification({ brandId: BRAND, keywordId: KEYWORD, evidence: evidence(), createdBy: ACTOR, previous });

/** Colunas NOT NULL sem default no contrato vigente da tabela. */
const REQUIRED_COLUMNS = ["version_id", "entity_id", "marca_id", "artifact_type", "version_number", "status", "content_hash", "payload", "origin", "change_reason", "created_by"];

test("A · a linha cobre todas as colunas obrigatórias da tabela", async () => {
  const row = buildKeywordSemanticQualificationRow({ qualification: await qualification(), changeReason: "SERP coletada pelo processo Resultados." });
  for (const column of REQUIRED_COLUMNS) {
    assert.ok(Object.prototype.hasOwnProperty.call(row, column), `a linha precisa enviar ${column}`);
    assert.ok(row[column as keyof typeof row] !== null && row[column as keyof typeof row] !== undefined, `${column} é NOT NULL`);
  }
  // O contrato conferido é o da migration que recriou a tabela.
  assert.match(tableDefinition, /status text NOT NULL/);
  assert.match(tableDefinition, /created_by uuid NOT NULL/);
  assert.equal(row.artifact_type, "keyword_semantic_qualification");
  assert.equal(row.status, KEYWORD_SEMANTIC_QUALIFICATION_STATUS);
  assert.equal(row.origin, KEYWORD_SEMANTIC_QUALIFICATION_ORIGIN);
  assert.ok(row.status.trim().length >= 1 && row.status.trim().length <= 80);
  assert.equal(typeof row.payload, "object");
  assert.equal(row.created_by, ACTOR);
});

test("B/C · versionamento: v1 sem antecessora, v2 apontando para a v1", async () => {
  const v1 = await qualification();
  const firstRow = buildKeywordSemanticQualificationRow({ qualification: v1, changeReason: "Primeira coleta." });
  assert.equal(firstRow.version_number, 1);
  assert.equal(firstRow.previous_version_id, null);
  assert.equal(firstRow.source_version_id, null);

  const v2 = await qualification(v1);
  const secondRow = buildKeywordSemanticQualificationRow({ qualification: v2, changeReason: "Nova coleta." });
  assert.equal(secondRow.version_number, 2);
  assert.equal(secondRow.previous_version_id, v1.id);
  assert.notEqual(secondRow.version_id, firstRow.version_id, "a UNIQUE (marca, tipo, entidade, versão) é respeitada");
});

test("D · cross-brand e keyword de outra Marca são recusados antes do insert", () => {
  assert.ok(store.includes("input.qualification.brandId !== input.brandId || input.qualification.keywordId !== input.keywordId"));
  assert.ok(store.includes("A Qualificação Semântica não pertence à Marca/keyword do write."));
  assert.ok(store.includes('.eq("marca_id", input.brandId)'));
  assert.ok(store.includes("parsed.brandId !== input.brandId || parsed.keywordId !== entityId"));
});

test("E · payload inválido falha na montagem, antes de tocar o banco", async () => {
  const valid = await qualification();
  assert.throws(() => buildKeywordSemanticQualificationRow({ qualification: { ...valid, brandId: "" }, changeReason: "x" }), /brandId e keywordId/);
  assert.throws(() => buildKeywordSemanticQualificationRow({ qualification: { ...valid, lifecycle: { ...valid.lifecycle, contentHash: "" } }, changeReason: "x" }), /contentHash/);
  assert.throws(() => buildKeywordSemanticQualificationRow({ qualification: { ...valid, lifecycle: { ...valid.lifecycle, createdBy: "" } }, changeReason: "x" }), /autor da coleta/);
  assert.throws(() => buildKeywordSemanticQualificationRow({ qualification: valid, changeReason: "   " }), /motivo de mudança/);
});

test("erros reais do banco são classificados e sanitizados", () => {
  const check = classifyQualificationPersistenceError({ code: "23514", message: 'new row for relation "editorial_artifact_versions" violates check constraint "editorial_artifact_versions_artifact_type_check"' });
  assert.equal(check.classification, "DB_CONSTRAINT_VIOLATION");
  assert.equal(check.constraint, "editorial_artifact_versions_artifact_type_check");

  const notNull = classifyQualificationPersistenceError({ code: "23502", message: 'null value in column "status" of relation "editorial_artifact_versions" violates not-null constraint' });
  assert.equal(notNull.classification, "DB_INVALID_PAYLOAD");
  assert.equal(notNull.column, "status");

  assert.equal(classifyQualificationPersistenceError({ code: "23503" }).classification, "DB_FOREIGN_KEY");
  assert.equal(classifyQualificationPersistenceError({ code: "23505" }).classification, "DB_UNIQUE_CONFLICT");
  assert.equal(classifyQualificationPersistenceError({ code: "42501" }).classification, "DB_RLS_DENIED");
  assert.equal(classifyQualificationPersistenceError({ message: "violates row-level security policy" }).classification, "DB_RLS_DENIED");
  assert.equal(classifyQualificationPersistenceError({ code: "XX000" }).classification, "DB_UNKNOWN");

  // Nada sensível atravessa o diagnóstico.
  const leaky = classifyQualificationPersistenceError({ code: "XX000", message: "failed with authorization: Bearer abc.def.ghi" });
  assert.ok(!leaky.message.includes("abc.def.ghi"));
  assert.match(leaky.message, /\[redacted\]/);
});

test("F · falha não apaga nem sobrescreve a versão anterior", () => {
  for (const destructive of [".delete(", ".update(", ".upsert("]) {
    assert.ok(!store.includes(destructive), `o store não pode usar ${destructive}`);
  }
  // Retry da mesma versão com o mesmo conteúdo é idempotente, não duplicação.
  assert.ok(store.includes('diagnostic.classification === "DB_UNIQUE_CONFLICT"'));
  assert.ok(store.includes("current.lifecycle.contentHash === input.qualification.lifecycle.contentHash"));
  assert.ok(store.includes("alreadyPersisted: true"));
  // Sucesso só depois do write confirmado.
  assert.ok(store.includes("if (!inserted.error) {"));
});

test("G · o diagnóstico não gasta nenhuma chamada de provider", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("REAL_PROVIDER_CALL"); }) as typeof fetch;
  try {
    const row = buildKeywordSemanticQualificationRow({ qualification: await qualification(), changeReason: "Coleta." });
    assert.equal(row.marca_id, BRAND);
    assert.equal(row.entity_id, KEYWORD);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const rowSource = readFileSync(new URL("../lib/minerador/keyword-semantic-qualification-row.ts", import.meta.url), "utf8");
  for (const forbidden of ["fetch(", "supabase", "https://", "createClient"]) {
    assert.ok(!rowSource.includes(forbidden), `a camada pura não pode usar ${forbidden}`);
  }
});

test("a rota preserva a causa técnica real sem expor SQL ao usuário", () => {
  const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes('console.error("[minerador] semantic_qualification_persistence"'));
  assert.ok(route.includes("classification: diagnostic.classification"));
  assert.ok(route.includes("constraint: diagnostic.constraint"));
  assert.ok(route.includes("column: diagnostic.column"));
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const handler = workspace.slice(workspace.indexOf("const handleBatchAllintitle"), workspace.indexOf("const handleBatchQualify"));
  assert.ok(handler.includes("não foi possível persistir a Qualificação Semântica de"));
  for (const sql of ["constraint", "insert into", "violates"]) {
    assert.ok(!handler.toLowerCase().includes(sql), `a notificação não pode expor ${sql}`);
  }
});
