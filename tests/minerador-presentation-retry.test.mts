import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Recovery mínimo da Apresentação Contextual: resposta sem conteúdo utilizável
 * admite uma única nova tentativa da mesma operação. Auth, quota, configuração,
 * validação e timeout nunca são retentados.
 *
 * `lib/server/structured-ai.ts` é server-only e usa aliases "@/…", então o
 * contrato é auditado na fonte — nenhum provider é chamado.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const structuredAi = readFileSync(new URL("../lib/server/structured-ai.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

const plainTextBlock = structuredAi.slice(
  structuredAi.indexOf("export async function generatePlainTextAI"),
  structuredAi.indexOf("export class StructuredAIError"),
);
const contextualHandler = workspace.slice(
  workspace.indexOf("const runContextualPresentation"),
  workspace.indexOf("const handleOpenHumanReview"),
);

test("A · resposta vazia na primeira tentativa autoriza uma segunda execução", () => {
  assert.match(structuredAi, /export const MAX_PROVIDER_ATTEMPTS_PER_OPERATION = 2;/);
  assert.match(plainTextBlock, /const runAttempt = async \(attemptNumber: number\): Promise<string> =>/);
  assert.match(plainTextBlock, /return await runAttempt\(1\);/);
  assert.match(plainTextBlock, /return await runAttempt\(2\);/);
  assert.match(plainTextBlock, /error\.code === "AI_PROVIDER_INVALID_RESPONSE"/);
});

test("B · segunda tentativa vazia devolve erro controlado, sem terceira execução", () => {
  assert.equal((plainTextBlock.match(/runAttempt\(\d\)/g) || []).length, 2, "no máximo duas tentativas");
  assert.match(plainTextBlock, /if \(!recoverable \|\| MAX_PROVIDER_ATTEMPTS_PER_OPERATION < 2\) throw error;/);
  assert.match(plainTextBlock, /O provider DeepSeek não retornou conteúdo utilizável\./);
  assert.match(route, /if \(error instanceof StructuredAIError\) return failure\(error\.code/);
});

test("C · erros não recuperáveis não são retentados", () => {
  // Só o código de conteúdo inutilizável entra no recovery.
  assert.match(plainTextBlock, /const recoverable = error instanceof StructuredAIError && error\.code === "AI_PROVIDER_INVALID_RESPONSE";/);
  for (const nonRecoverable of ["AI_PROVIDER_INVALID", "AI_REQUEST_INVALID", "AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"]) {
    assert.ok(!plainTextBlock.includes(`error.code === "${nonRecoverable}"`), `${nonRecoverable} não pode ser retentado`);
  }
  // Skill, BrandDNA, keyword e authz falham antes do provider e nem chegam ao recovery.
  for (const guard of ["BRAND_SKILLS_LOAD_FAILED", "BRAND_DNA_LOAD_FAILED", "KEYWORD_NOT_FOUND"]) {
    assert.ok(route.indexOf(guard) < route.indexOf("await generatePlainTextAI("), `${guard} precisa falhar antes da chamada`);
  }
});

test("D · duas falhas preservam a working copy anterior da sessão", () => {
  const failureBranch = contextualHandler.slice(
    contextualHandler.indexOf("if (!response.ok"),
    contextualHandler.indexOf("setPresentationBriefs"),
  );
  assert.match(failureBranch, /return \{ ok: false/);
  assert.ok(!failureBranch.includes("setPresentationBriefs"));
  const beforeRequest = contextualHandler.slice(0, contextualHandler.indexOf("await fetch("));
  assert.ok(!beforeRequest.includes("setPresentationBriefs"), "a working copy não é limpa antes da tentativa");
});

test("E · uma ação humana mantém um operationRequestId e contabiliza as tentativas reais", () => {
  assert.equal((route.match(/recordIntegrationUsageForResource\(/g) || []).length, 1);
  assert.match(route, /idempotencyKey: `minerador:contextual-presentation:\$\{operationRequestId\}`/);
  assert.match(route, /units: Math\.max\(1, providerAttempts\)/);
  assert.match(route, /providerAttempts = Math\.min\(diagnostic\.attempt \|\| 1, MAX_PROVIDER_ATTEMPTS_PER_OPERATION\)/);
  assert.match(route, /attempt: diagnostic\.attempt \?\? 1,/);
});

test("F · nenhuma chamada automática em mount ou F5", () => {
  assert.ok(!route.includes("export async function GET"));
  assert.ok(!workspace.includes("useEffect(() => { void handleBatchContextualPresentation"));
  assert.ok(!workspace.includes("useEffect(() => { void runContextualPresentation"));
});

test("G · o rodapé usa somente a copy atual", () => {
  assert.ok(!panel.includes("Baseada nos dados atuais da keyword"));
  assert.ok(!panel.includes("contexto aprovado da Marca"));
  assert.equal((panel.match(/Baseada no tema da keyword e no contexto disponível da Marca\. O KeywordDNA permanece inalterado\./g) || []).length, 1);
});

test("o retry não aciona R5 nem troca de provider", () => {
  assert.ok(!plainTextBlock.includes("process-intent-niche"));
  assert.ok(!plainTextBlock.includes("openrouter"));
  assert.match(plainTextBlock, /provider\.provider !== "deepseek"/);
  assert.ok(!route.includes("semantic_review"));
});
