import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildArticleAiReadout, type ArticleAiDecisionInput } from "../lib/arquiteto/article-ai-readout.ts";
import { deriveArticleProcessReadModel } from "../lib/arquiteto/article-process-read-model.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
/** Fechamento do lote da IA: contagem, severidade e mensagem final. */
const batchOutcome = readFileSync("lib/arquiteto/ai-strategic-payload.ts", "utf8");

const decision = (overrides: Partial<ArticleAiDecisionInput> = {}): ArticleAiDecisionInput => ({
  keywordId: "kw-1",
  keyword: "cleansing oil hada labo",
  currentRole: "principal",
  action: "manter_no_artigo",
  suggestedRole: "principal",
  justification: "Encaixe atual competitivo; sem alternativa melhor no catálogo.",
  humanDecisionPoints: [],
  siloPlacementAction: "manter_silo",
  conflictReasons: [],
  material: false,
  ...overrides,
});

const processInput = (overrides: Partial<Parameters<typeof deriveArticleProcessReadModel>[0]> = {}) => ({
  logicProcessing: false,
  hasLogicalOutput: true,
  serpProcessing: false,
  hasSerpAssessment: true,
  serpHasError: false,
  aiProcessing: false,
  pendingProposalCount: 0,
  annotations: [],
  humanPendingDecisionCount: 0,
  reviewProcessing: false,
  ...overrides,
});

test("execução da IA sai de NOT_RUN mesmo quando nada material é proposto", () => {
  const notRun = deriveArticleProcessReadModel(processInput());
  const executedNoOp = deriveArticleProcessReadModel(processInput({ aiCompletedWithoutProposals: true }));
  const withProposal = deriveArticleProcessReadModel(processInput({ pendingProposalCount: 1 }));

  assert.equal(notRun.ai.state, "NOT_RUN");
  assert.equal(executedNoOp.ai.state, "COMPLETED_NO_PROPOSALS");
  assert.equal(executedNoOp.review.state, "NOT_REQUIRED");
  assert.equal(executedNoOp.review.pendingCount, 0);
  assert.equal(withProposal.ai.state, "COMPLETED_WITH_PROPOSALS");
});

test("artigo com uma única keyword e manter_no_artigo é concluído sem propostas", () => {
  const readout = buildArticleAiReadout({ executed: true, keywordCount: 1, serpConsidered: true, decisions: [decision()] });

  assert.equal(readout.executed, true);
  assert.equal(readout.rawCount, 1);
  assert.equal(readout.materialCount, 0);
  assert.equal(readout.noOp, true);
  assert.equal(readout.proposals.length, 0);
  assert.ok(readout.summary.some(item => item.includes("uma única keyword")));
  assert.ok(readout.summary.some(item => item.includes("SERP de formação considerada")));
  assert.ok(readout.summary.some(item => item.includes("nenhuma pendência humana")));
});

test("proposta material aparece com keyword, estado, proposta, motivo, evidência e impacto", () => {
  const readout = buildArticleAiReadout({
    executed: true,
    keywordCount: 3,
    serpConsidered: true,
    decisions: [
      decision(),
      decision({
        keywordId: "kw-2", keyword: "cleansing oil coreano", currentRole: "secundaria", action: "criar_novo_artigo",
        suggestedRole: "principal", justification: "Intenção distinta da Principal.", conflictReasons: ["Sobreposição baixa no Top 10."],
        humanDecisionPoints: ["Confirmar separação antes da consolidação."], material: true,
      }),
    ],
  });

  assert.equal(readout.materialCount, 1);
  assert.equal(readout.noOp, false);
  assert.deepEqual(readout.summary, []);
  const proposal = readout.proposals[0];
  assert.equal(proposal.keyword, "cleansing oil coreano");
  assert.equal(proposal.currentState, "Secundária");
  assert.match(proposal.proposal, /Separar em um novo artigo · passar a Principal/);
  assert.match(proposal.reason, /Intenção distinta/);
  assert.match(proposal.evidence, /Sobreposição baixa/);
  assert.match(proposal.impact, /Confirmar separação/);
});

test("sem execução a leitura permanece vazia e sem no-op", () => {
  const readout = buildArticleAiReadout({ executed: false, keywordCount: 2, serpConsidered: false, decisions: [] });

  assert.equal(readout.executed, false);
  assert.equal(readout.noOp, false);
  assert.equal(readout.rawCount, 0);
  assert.deepEqual(readout.summary, []);
});

test("o toast anuncia a classificação final, não a contagem bruta do provider", () => {
  assert.match(workspace, /const materialDecisions = materialKeywordArticleDecisions\(result\.review, keywordId =>/);
  // A mensagem final é composta pelo fechamento do lote, não montada solta no handler.
  assert.match(workspace, /materialProposalCount: materialDecisions\.length/);
  assert.match(batchOutcome, /Nenhuma alteração estrutural foi recomendada\./);
  assert.doesNotMatch(workspace, /proposta\(s\) de repartição pronta\(s\)/);
});

test("a aba IA separa propostas da IA das demais decisões e projeta o artigo correto", () => {
  assert.match(workspace, /data-testid="architect-ai-readout"/);
  assert.match(workspace, /data-testid="architect-ai-proposal"/);
  assert.match(workspace, /data-testid="architect-ai-noop"/);
  assert.match(workspace, /Propostas da IA<\/dt>/);
  assert.match(workspace, /Decisões pendentes do artigo<\/dt>/);
  assert.match(workspace, /Nem toda decisão pendente veio da IA/);
  // A leitura é filtrada pelas keywords do próprio artigo: A não recebe proposta de B.
  assert.match(workspace, /keywordIds\.has\(String\(decision\.keywordId\)\)/);
  assert.match(workspace, /const articleAiReadout = articleAiReadoutFor\(art\);/);
  assert.match(workspace, /aiCompletedWithoutProposals,/);
});
