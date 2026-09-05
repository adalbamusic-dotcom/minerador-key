import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { lifecycleErrorDiagnostic } from "../lib/minerador/keyword-lifecycle-diagnostic.ts";

/**
 * Observabilidade do ciclo de vida da keyword.
 *
 * A correção é de diagnóstico, não de autorização: nenhuma falha passa a
 * autorizar exclusão. Estes testes provam que a causa real deixa de ser
 * descartada e que credencial nunca atravessa a resposta.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("../lib/server/minerador-keyword-lifecycle.ts", import.meta.url), "utf8");

test("A · AuthzError preserva estágio, status e código sem virar erro de banco", () => {
  const diagnostic = lifecycleErrorDiagnostic(new Error("Nao foi possivel validar permissoes."), {
    stage: "authorization",
    httpStatus: 503,
    code: "KEYWORD_DELETE_TRANSACTION_FAILED",
  });
  assert.equal(diagnostic.stage, "authorization");
  assert.equal(diagnostic.httpStatus, 503);
  assert.equal(diagnostic.code, "KEYWORD_DELETE_TRANSACTION_FAILED");
  assert.equal(diagnostic.message, "Nao foi possivel validar permissoes.");
  assert.equal(diagnostic.postgresCode, null);
});

test("B · erro Postgres preserva code, message, details, hint, constraint e relation", () => {
  const diagnostic = lifecycleErrorDiagnostic({
    code: "23503",
    message: 'insert or update on table "minerador_keywords" violates foreign key constraint "fk_demo"',
    details: 'Key (id)=(x) is not present in relation "marcas".',
    hint: "Verifique a Brand.",
    constraint: "fk_demo",
  }, { stage: "repository", httpStatus: 422, code: "KEYWORD_DELETE_TRANSACTION_FAILED" });
  assert.equal(diagnostic.postgresCode, "23503");
  assert.match(diagnostic.postgresMessage || "", /violates foreign key constraint/);
  assert.match(diagnostic.postgresDetails || "", /is not present in relation/);
  assert.equal(diagnostic.postgresHint, "Verifique a Brand.");
  assert.equal(diagnostic.constraint, "fk_demo");
  assert.equal(diagnostic.relation, "marcas");
});

test("B2 · constraint e relation também são extraídas da mensagem quando não vêm em campo próprio", () => {
  const diagnostic = lifecycleErrorDiagnostic({
    code: "23514",
    message: 'new row for relation "editorial_artifact_versions" violates check constraint "artifact_type_check"',
  }, { stage: "repository", httpStatus: 422, code: "KEYWORD_DELETE_TRANSACTION_FAILED" });
  assert.equal(diagnostic.constraint, "artifact_type_check");
  assert.equal(diagnostic.relation, "editorial_artifact_versions");
});

test("C · erro desconhecido continua bloqueando e não inventa campos", () => {
  const diagnostic = lifecycleErrorDiagnostic({}, { stage: "repository", httpStatus: 422, code: "KEYWORD_DELETE_TRANSACTION_FAILED" });
  assert.equal(diagnostic.httpStatus, 422);
  assert.equal(diagnostic.postgresCode, null);
  assert.equal(diagnostic.postgresDetails, null);
  assert.equal(diagnostic.postgresHint, null);
  assert.equal(diagnostic.constraint, null);
  assert.equal(diagnostic.relation, null);
  // 422 continua sendo falha: nenhum caminho devolve sucesso.
  assert.notEqual(diagnostic.httpStatus, 200);
});

test("F · nenhum segredo atravessa o diagnóstico", () => {
  const diagnostic = lifecycleErrorDiagnostic({
    code: "08006",
    message: "connection failed: postgres://user:hunter2@db.internal:5432/app apikey=abc.def service_role=xyz",
    details: "Authorization: Bearer eyJhbGciOi token=segredo123 password=trocar",
  }, { stage: "repository", httpStatus: 422, code: "KEYWORD_DELETE_TRANSACTION_FAILED" });
  const blob = JSON.stringify(diagnostic);
  for (const leak of ["hunter2", "abc.def", "xyz", "eyJhbGciOi", "segredo123", "trocar"]) {
    assert.ok(!blob.includes(leak), `vazou: ${leak}`);
  }
  assert.match(blob, /\[redacted\]/);
});

test("D/E · o guard de publicação não foi afetado: resolução continua decidindo", () => {
  // A correção é aditiva. O mapeamento de código/status permanece intacto e
  // nenhuma falha é convertida em NOT_PUBLISHED.
  assert.match(lifecycle, /KEYWORD_DELETE_TRANSACTION_FAILED: 422/);
  assert.match(lifecycle, /KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: 409/);
  assert.doesNotMatch(lifecycle, /NOT_PUBLISHED/);
  // O preview continua sendo a única fonte de publishedIds/hardDeleteIds.
  assert.match(workspace, /publishedIds: Array\.isArray\(body\.publishedIds\)/);
  assert.match(workspace, /if \(review\.publishedIds\.length > 0\)/);
});

test("§4 · o cliente deixa de descartar o diagnóstico recebido do servidor", () => {
  assert.match(workspace, /if \(body\?\.diagnostic && typeof body\.diagnostic === "object"\) error\.diagnostic = body\.diagnostic/);
  assert.match(workspace, /stage: "publication_resolution", persistent: true, diagnostic \}/);
  // A mensagem visível continua amigável.
  assert.match(workspace, /Nada foi apagado: não foi possível confirmar o estado de publicação da seleção\./);
});

test("G · KeywordSemanticQualification não participa da decisão de publicação", () => {
  const preview = readFileSync(new URL("../supabase/migrations/0047_global_lifecycle_delete_recovery_purge.sql", import.meta.url), "utf8");
  const resolver = preview.slice(preview.indexOf("FUNCTION public.lifecycle_keyword_is_published"));
  assert.doesNotMatch(resolver.slice(0, 4000), /keyword_semantic_qualification/);
});
