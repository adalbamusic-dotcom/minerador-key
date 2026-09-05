import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TerritorialAiProposalSchema,
  isNoOpProposal,
  keepValidTerritorialAiProposals,
  territorialAiAvailabilityOf,
  validateTerritorialAiProposal,
  type TerritorialAiProposal,
} from "../lib/arquiteto/territorial-ai.ts";
import {
  TERRITORIAL_AI_SUBJECT_TYPE,
  TERRITORIAL_AI_WORKFLOW_STAGE,
  buildTerritorialAiBase,
  buildTerritorialAiWorkflowRow,
  parseTerritorialAiWorkflowRow,
  territorialAiBaseHash,
  territorialAiIsStale,
} from "../lib/arquiteto/territorial-ai-record.ts";

const QUESTION = "serp:manual_silo:territory:t1";
const REF_A = "territory:11111111-1111-4111-8111-111111111111";

const proposal = (overrides: Partial<TerritorialAiProposal> = {}): TerritorialAiProposal =>
  TerritorialAiProposalSchema.parse({
    questionId: QUESTION,
    recommendation: "maintain",
    targetRefs: [REF_A],
    keywordRefs: ["k1"],
    reason: "A fronteira sustenta o universo.",
    ...overrides,
  });

const base = (overrides: Partial<{ architectureFacts: string[]; logicFacts: string[]; serpBaseHash: string | null }> = {}) =>
  buildTerritorialAiBase({
    questionId: QUESTION,
    kind: "manual_silo",
    architectureFacts: overrides.architectureFacts ?? ["entidade central: sérum facial"],
    logicFacts: overrides.logicFacts ?? ["k1 · existing_silo_match: afinidade dominante"],
    serpBaseHash: overrides.serpBaseHash === undefined ? "base:abc" : overrides.serpBaseHash,
  });

const serpRef = { questionId: QUESTION, assessmentBaseHash: "base:abc", recommendation: "manter_silo", snapshotIds: ["s1"] };

/* --------------------------- quando a IA pode rodar ---------------------- */

test("dúvida que exige SERP sem parecer bloqueia com motivo funcional", () => {
  const resultado = territorialAiAvailabilityOf({
    questionId: QUESTION, serpRequired: true,
    serpAssessmentBaseHash: null, currentSerpBaseHash: "base:abc",
  });

  assert.equal(resultado.availability, "awaiting_serp");
  assert.match(resultado.reason, /Atualize a validação SERP/);
});

test("SERP desatualizada bloqueia a IA — evidência velha não sustenta proposta", () => {
  const resultado = territorialAiAvailabilityOf({
    questionId: QUESTION, serpRequired: true,
    serpAssessmentBaseHash: "base:antigo", currentSerpBaseHash: "base:novo",
  });

  assert.equal(resultado.availability, "serp_stale");
  assert.match(resultado.reason, /validava outra arquitetura/);
});

test("dúvida sem SERP exigida roda a IA sem chamar provider de SERP", () => {
  const resultado = territorialAiAvailabilityOf({
    questionId: QUESTION, serpRequired: false,
    serpAssessmentBaseHash: null, currentSerpBaseHash: null,
  });

  assert.equal(resultado.availability, "ready");
});

test("SERP vigente libera a IA", () => {
  const resultado = territorialAiAvailabilityOf({
    questionId: QUESTION, serpRequired: true,
    serpAssessmentBaseHash: "base:abc", currentSerpBaseHash: "base:abc",
  });

  assert.equal(resultado.availability, "ready");
});

/* -------------------------- a IA não cria identidade --------------------- */

test("ref fora do universo enviado é recusada", () => {
  const issues = validateTerritorialAiProposal({
    proposal: proposal({ targetRefs: ["inexistente"] }),
    questionId: QUESTION,
    knownTargetRefs: new Set([REF_A]),
    knownKeywordIds: new Set(["k1"]),
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "UNKNOWN_TARGET_REF");
});

test("identidade emitida pela IA é recusada como usurpação de autoridade", () => {
  const emitidas = [
    "territory:99999999-9999-4999-8999-999999999999",
    "silo:novo-silo",
    "silo-page:nova-pagina",
    "article:novo-artigo",
  ];
  for (const ref of emitidas) {
    const issues = validateTerritorialAiProposal({
      proposal: proposal({ recommendation: "create_new_silo", targetRefs: [ref] }),
      questionId: QUESTION,
      knownTargetRefs: new Set([REF_A]),
      knownKeywordIds: new Set(["k1"]),
    });
    assert.equal(issues[0]?.code, "IDENTITY_EMITTED", `${ref} deveria ser recusada`);
  }
});

test("keyword fora do universo é recusada", () => {
  const issues = validateTerritorialAiProposal({
    proposal: proposal({ keywordRefs: ["k-fantasma"] }),
    questionId: QUESTION,
    knownTargetRefs: new Set([REF_A]),
    knownKeywordIds: new Set(["k1"]),
  });

  assert.equal(issues[0].code, "UNKNOWN_KEYWORD_REF");
});

test("proposta inválida cai sozinha, sem derrubar a análise boa", () => {
  const { accepted, rejected } = keepValidTerritorialAiProposals({
    proposals: [proposal(), proposal({ targetRefs: ["inexistente"] })],
    questionId: QUESTION,
    knownTargetRefs: new Set([REF_A]),
    knownKeywordIds: new Set(["k1"]),
  });

  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].issues[0].detail, /fora do universo enviado/);
});

test("no_op e maintain são resultados válidos, não erro", () => {
  assert.equal(isNoOpProposal(proposal({ recommendation: "no_op" })), true);
  assert.equal(isNoOpProposal(proposal({ recommendation: "maintain" })), true);
  assert.equal(isNoOpProposal(proposal({ recommendation: "merge" })), false);
});

/* ------------------------------- persistência ---------------------------- */

test("a proposta vira UMA linha por pergunta, sem migration", () => {
  const row = buildTerritorialAiWorkflowRow({
    proposal: proposal(), base: base(), serpRef, operationRequestId: "op-1",
    generatedAt: "2026-09-03T12:00:00.000Z",
  });

  assert.equal(row.subjectType, TERRITORIAL_AI_SUBJECT_TYPE);
  assert.equal(row.stage, TERRITORIAL_AI_WORKFLOW_STAGE);
  assert.equal(row.subjectId, QUESTION);
  assert.equal(row.articleId, null);
  assert.equal(row.state, "maintain");
  // subject_type próprio: a IA não escreve na linha da SERP.
  assert.notEqual(row.subjectType, "territorial_serp_assessment");
});

test("a referência à SERP prova de qual versão da evidência a proposta saiu", () => {
  const row = buildTerritorialAiWorkflowRow({
    proposal: proposal(), base: base(), serpRef, operationRequestId: "op-1",
    generatedAt: "2026-09-03T12:00:00.000Z",
  });
  const lido = parseTerritorialAiWorkflowRow(row);

  assert.equal(lido.ok, true);
  assert.equal(lido.payload!.serpRef!.assessmentBaseHash, "base:abc");
  assert.deepEqual(lido.payload!.serpRef!.snapshotIds, ["s1"]);
  // Não basta a frase da recomendação: o hash da base é o que amarra a versão.
  assert.equal(lido.payload!.base.serpBaseHash, "base:abc");
});

test("dúvida sem SERP grava serpRef nulo, sem inventar evidência", () => {
  const row = buildTerritorialAiWorkflowRow({
    proposal: proposal(), base: base({ serpBaseHash: null }), serpRef: null,
    operationRequestId: "op-1", generatedAt: "2026-09-03T12:00:00.000Z",
  });
  const lido = parseTerritorialAiWorkflowRow(row);

  assert.equal(lido.payload!.serpRef, null);
  assert.equal(lido.payload!.base.serpBaseHash, null);
});

test("a autoridade do processo mora no payload, não no campo state", () => {
  const row = buildTerritorialAiWorkflowRow({
    proposal: proposal({ recommendation: "merge", reason: "Universos se sobrepõem." }),
    base: base(), serpRef, operationRequestId: "op-1", generatedAt: "2026-09-03T12:00:00.000Z",
  });
  const lido = parseTerritorialAiWorkflowRow(row);

  // `state` é projeção para o índice; o contrato completo está no payload.
  assert.equal(row.state, "merge");
  assert.equal(lido.payload!.proposal.reason, "Universos se sobrepõem.");
  assert.ok(lido.payload!.baseHash.startsWith("aibase:"));
  assert.equal(lido.payload!.provenance.operationRequestId, "op-1");
});

/* ---------------------------------- stale -------------------------------- */

test("mudar a arquitetura analisada desatualiza a proposta", () => {
  const gravado = territorialAiBaseHash(base());

  assert.equal(territorialAiIsStale({ storedBaseHash: gravado, currentBase: base() }), false);
  assert.equal(territorialAiIsStale({
    storedBaseHash: gravado,
    currentBase: base({ architectureFacts: ["entidade central: protetor solar"] }),
  }), true);
});

test("a SERP mudar desatualiza a IA que a usou", () => {
  const gravado = territorialAiBaseHash(base({ serpBaseHash: "base:abc" }));

  assert.equal(territorialAiIsStale({
    storedBaseHash: gravado,
    currentBase: base({ serpBaseHash: "base:outro" }),
  }), true);
});

test("a base ignora ruído de UI", () => {
  const source = readFileSync("lib/arquiteto/territorial-ai-record.ts", "utf8")
    .split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");

  assert.doesNotMatch(source, /zoom|scrollTop|selectedIds|Date\.now\(\)/);
  // Ordem dos fatos não muda o hash.
  assert.equal(
    territorialAiBaseHash(base({ architectureFacts: ["a", "b"] })),
    territorialAiBaseHash(base({ architectureFacts: ["b", "a"] })),
  );
});

/* --------------------------- contratos verificáveis ---------------------- */

test("a IA territorial não reaproveita o contrato de Article", () => {
  const domain = readFileSync("lib/arquiteto/territorial-ai.ts", "utf8");
  const route = readFileSync("app/api/arquiteto/territorial-ai/route.ts", "utf8");

  // Só o código: os comentários explicam justamente o que NÃO é reaproveitado.
  const semComentarios = (texto: string) => texto
    .split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");
  for (const fonte of [domain, route]) {
    assert.doesNotMatch(semComentarios(fonte), /ArticleDNA|SiloWorkingCopy|SiloReviewProposal|articleDnaFacts/);
  }
  // Infraestrutura compartilhada É reutilizada; o contrato é que é próprio.
  assert.match(route, /resolveDeepSeekCanonicalConfig/);
  assert.match(route, /generateStructuredAI/);
});

test("a IA não escreve território nem toca no registro da SERP", () => {
  const route = readFileSync("app/api/arquiteto/territorial-ai/route.ts", "utf8");
  const store = readFileSync("lib/server/arquiteto-territorial-ai-store.ts", "utf8");

  for (const fonte of [route, store]) {
    assert.doesNotMatch(fonte, /territoryUpdates|territoryCreates|updateTerritoryWorkflowItem|createTerritoryWorkflowItem/);
    assert.doesNotMatch(fonte, /saveTerritorialSerpAssessment|territorial_serp_assessment/);
  }
  // Nem DDL, nem tabela nova.
  assert.doesNotMatch(store, /CREATE TABLE|ALTER TABLE|editorial_artifact_versions/);
  assert.match(store, /editorial_workflow_items/);
});

test("provider OK não é sucesso: a rota persiste E relê", () => {
  const route = readFileSync("app/api/arquiteto/territorial-ai/route.ts", "utf8");

  const ordem = ["generateStructuredAI(", "keepValidTerritorialAiProposals(", "saveTerritorialAiProposal(", "readbackTerritorialAiProposal("];
  let anterior = -1;
  for (const marca of ordem) {
    const posicao = route.indexOf(marca);
    assert.ok(posicao > anterior, `${marca} precisa vir depois do passo anterior`);
    anterior = posicao;
  }
  assert.match(route, /proposals\.push\(readback\.payload\.proposal\)/);
});

test("o provider nunca aparece na interface", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const inicio = workspace.indexOf("const reviewTerritorialWithAi");
  const handler = workspace.slice(inicio, inicio + 5400);

  assert.doesNotMatch(handler, /DeepSeek|deepseek|apiKey|token|crédito|Connection/i);
  assert.match(handler, /Nada foi aplicado/);
  // A UI fala de revisão, não de provider.
  assert.match(handler, /revisar os silos com IA/i);

  // Nem o erro devolvido pela rota cita fornecedor: a infraestrutura menciona,
  // a interface não.
  const route = readFileSync("app/api/arquiteto/territorial-ai/route.ts", "utf8");
  assert.match(route, /publicFailureMessage/);
  assert.match(route, /replace\(\/\\bDeepSeek\\b\/gi/);
  assert.match(route, /replace\(\/\\bprovider\\b\/gi/);
});

test("o boot hidrata a proposta e não chama provider", () => {
  const route = readFileSync("app/api/arquiteto/workspace/route.ts", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(route, /listTerritorialAiProposals/);
  assert.doesNotMatch(route, /deepseek|generateStructuredAI/i);
  assert.match(workspace, /setTerritorialAiProposals\(canonical\.territorialAi/);
});

test("falha de execução preserva a proposta válida anterior", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const inicio = workspace.indexOf("setTerritorialAiBaseHashes(previous =>");
  const trecho = workspace.slice(inicio, inicio + 480);

  // Só entra hash de quem voltou; nada é removido por causa da falha.
  assert.match(trecho, /propostas\.some/);
  assert.doesNotMatch(trecho, /\.delete\(|new Map\(\)/);
});
