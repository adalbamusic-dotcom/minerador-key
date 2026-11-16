import test from "node:test";
import assert from "node:assert/strict";
import { siloClosureStep, siloRpcErrorDiagnostic } from "../lib/arquiteto/silo-closure-diagnostics.ts";

test("falha do fechamento conserva o motivo e identifica a etapa exata", async () => {
  const original = new Error("Não foi possível consultar ou persistir o pipeline editorial.");
  await assert.rejects(siloClosureStep("Criação da cópia de trabalho do Silo", async () => { throw original; }), error => {
    assert.equal((error as Error).message, "Criação da cópia de trabalho do Silo: Não foi possível consultar ou persistir o pipeline editorial.");
    assert.equal((error as Error).cause, original);
    return true;
  });
  assert.equal(await siloClosureStep("Leitura", async () => 7), 7);
});

test("diagnóstico do RPC conserva código e categoria sem registrar mensagem ou dados", () => {
  const error = Object.assign(new Error("fetch failed: segredo ou SQL com dados privados"), { cause: { code: "ECONNRESET" } });
  const diagnostic = siloRpcErrorDiagnostic(error);
  assert.deepEqual(diagnostic, { code: null, name: "Error", category: "network", causeCode: "ECONNRESET", domainReason: null });
  assert.doesNotMatch(JSON.stringify(diagnostic), /segredo|SQL|privados/);
  assert.deepEqual(siloRpcErrorDiagnostic({ code: "23514", message: "detalhe privado" }), { code: "23514", name: null, category: "database_or_api", causeCode: null, domainReason: null });
});
