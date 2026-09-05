import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLogicalOutputContract,
  buildLogicalProcessorMetadata,
  hasCompleteLogicalOutputContract,
  resolveLogicalProcessReadiness,
} from "../lib/minerador/logical-processor.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { resolveSemanticReviewNotice } from "../lib/minerador/semantic-review-notice.ts";

const logicalInput: {
  keywordId: string;
  keyword: string;
  location: string | null;
  niche: string | null;
} = {
  keywordId: "keyword-logic-gate",
  keyword: "campanha de trafego pago",
  location: "Brasil",
  niche: "Marketing",
};

function logicalSemantic(overrides: Record<string, unknown> = {}, metadataInput = logicalInput): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Comercial",
    nicho_override: "Marketing",
    funnel: "MOFU",
    ...overrides,
  };
  return {
    ...semantic,
    logical_output_contract: buildLogicalOutputContract({
      semantic,
      intent: semantic.intencao_principal,
      niche: semantic.nicho_override,
      funnel: semantic.funnel,
    }),
    ...buildLogicalProcessorMetadata(metadataInput, "2026-08-21T12:00:00.000Z"),
  };
}

function readiness(semantic: Record<string, unknown>, input = logicalInput) {
  return resolveLogicalProcessReadiness({
    ...input,
    semantic,
  });
}

test("a mesma leitura canônica aceita valor, ambiguidade e desconhecido explícito como concluídos", () => {
  const value = readiness(logicalSemantic());
  assert.equal(value.state, "current_valid");
  assert.equal(value.requiredOutputValid, true);
  assert.equal(value.requiredOutputPending, false);

  const ambiguousSemantic = logicalSemantic({ intencao_ambigua: "sim" });
  const ambiguous = readiness(ambiguousSemantic);
  assert.equal(ambiguous.state, "current_valid");
  assert.equal(ambiguous.requiredOutputValid, true);

  const explicitUnknownInput = { ...logicalInput, niche: null };
  const explicitUnknownSemantic = logicalSemantic({ nicho_override: undefined, funnel: undefined }, explicitUnknownInput);
  const explicitUnknown = readiness(explicitUnknownSemantic, explicitUnknownInput);
  assert.equal(explicitUnknown.state, "current_valid");
  assert.equal(explicitUnknown.requiredOutputValid, true);
  assert.equal(explicitUnknown.requiredOutputPending, false);
});

test("saída pendente, campo ausente, hash antigo e readback ausente não produzem lógica verde", () => {
  const pendingSemantic = logicalSemantic();
  const pendingContract = pendingSemantic.logical_output_contract as Record<string, unknown>;
  const pendingFields = pendingContract.fields as Record<string, unknown>;
  pendingSemantic.logical_output_contract = {
    ...pendingContract,
    fields: { ...pendingFields, niche: { state: "pending", value: null } },
  };
  const pending = readiness(pendingSemantic);
  assert.equal(pending.state, "incomplete");
  assert.equal(pending.requiredOutputPending, true);
  assert.equal(pending.requiredOutputValid, false);
  assert.equal(hasCompleteLogicalOutputContract({ semantic: pendingSemantic }), false);

  const missingSemantic = logicalSemantic();
  const missingContract = JSON.parse(JSON.stringify(missingSemantic.logical_output_contract)) as Record<string, unknown>;
  delete (missingContract.fields as Record<string, unknown>).funnel;
  missingSemantic.logical_output_contract = missingContract;
  const missing = readiness(missingSemantic);
  assert.equal(missing.state, "incomplete");
  assert.deepEqual(missing.missingFields, ["funnel"]);

  const stale = readiness(logicalSemantic({}, { ...logicalInput, keyword: "keyword anterior" }));
  assert.equal(stale.state, "stale");
  assert.equal(stale.inputHashMatches, false);

  const absent = readiness({}, logicalInput);
  assert.equal(absent.state, "missing");
  const absentProcess = resolveMineradorProcessState({
    id: logicalInput.keywordId,
    keyword: logicalInput.keyword,
    location: logicalInput.location,
    analise_semantica: {},
  });
  assert.equal(absentProcess.logic.complete, false);
});

test("o perfil e a precondição da IA usam o mesmo estado de readback", () => {
  const validSemantic = logicalSemantic();
  const valid = resolveMineradorProcessState({
    id: logicalInput.keywordId,
    keyword: logicalInput.keyword,
    location: logicalInput.location,
    intent: "Comercial",
    logicalNiche: logicalInput.niche,
    analise_semantica: validSemantic,
  });
  assert.equal(valid.logic.artifactState, "current_valid");
  assert.equal(valid.logic.complete, true);

  const remoteInvalid = resolveMineradorProcessState({
    id: logicalInput.keywordId,
    keyword: logicalInput.keyword,
    location: logicalInput.location,
    intent: "Comercial",
    logicalNiche: logicalInput.niche,
    analise_semantica: logicalSemantic({}, { ...logicalInput, keyword: "outra keyword" }),
  });
  assert.equal(remoteInvalid.logic.complete, false);
  assert.equal(remoteInvalid.logic.artifactState, "stale");
});

test("precondição da lógica não é apresentada como revisão concluída", () => {
  const notice = resolveSemanticReviewNotice({
    successCount: 0,
    failCount: 2,
    failures: [
      { code: "AI_REVIEW_LOGIC_REQUIRED", stage: "precondition" },
      { code: "AI_REVIEW_LOGIC_REQUIRED", stage: "precondition" },
    ],
  });
  assert.equal(notice.kind, "logic_precondition");
  assert.equal(notice.message, "IA não iniciada: atualize a Lógica desta keyword antes da revisão.");
  assert.doesNotMatch(notice.message, /Revisão concluída/);

  const runtime = resolveSemanticReviewNotice({
    successCount: 0,
    failCount: 1,
    failures: [{ code: "AI_PROVIDER_INVALID_RESPONSE", stage: "provider_request" }],
  });
  assert.equal(runtime.kind, "runtime");
  assert.match(runtime.message, /Revisão concluída/);
});

test("a rota bloqueia antes da resolução do provider e preserva o diagnóstico da precondição", async () => {
  const route = await readFile(new URL("../app/api/process-intent-niche/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const semanticBranch = route.indexOf('if (mode === "semantic_review")');
  const logicGate = route.indexOf("if (!processState.logic.complete)", semanticBranch);
  const providerResolution = route.indexOf("resolveDeepSeekCanonicalConfig", semanticBranch);
  assert.ok(semanticBranch >= 0);
  assert.ok(logicGate > semanticBranch);
  assert.ok(providerResolution > logicGate);
  assert.match(route, /apiRequestStarted,\s*source: "canonical",/);
  assert.match(route, /precondition: err\.diagnostic/);
  assert.match(workspace, /for \(const expected of updatedItems\)/);
  assert.match(workspace, /persistedById\.get\(expected\.id\)/);
});
