import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveArticleFormationSerpState } from "../lib/arquiteto/article-serp-gate.ts";
import {
  ARTICLE_COMPATIBILITY_LABELS,
  resolveArticleClassification,
  unresolvedClassifications,
  type ClassificationEvidence,
} from "../lib/arquiteto/article-classification-closure.ts";
import { PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION } from "../lib/arquiteto/formation-phase-policy.ts";

/**
 * O PROCESSAMENTO FECHA; O HUMANO CONFIRMA O RESULTADO.
 *
 * Incerteza real vira resultado terminal. Só falta de evidência sobre ESTA
 * composição continua bloqueando.
 */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const gate = (verdict: "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE", extras: Record<string, unknown> = {}) =>
  resolveArticleFormationSerpState({
    candidateRef: "cand:1",
    expectedBaseHash: "base:1",
    observed: { formationBaseHash: "base:1", verdict, humanDecisionBaseHash: null },
    unresolvedBlocksConclusion: PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION,
    ...extras,
  });

/* ============ §5/§7 · vigente e indecisa não é pendência =============== */

test("§5 · SERP vigente e inconclusiva preserva o baseline, sem microdecisão", () => {
  const estado = gate("INCONCLUSIVE");
  assert.equal(estado.state, "current_inconclusive_unresolved");
  assert.equal(estado.blocksConclusion, false);
  assert.equal(estado.requiresHumanDecision, false);
  assert.match(estado.reason, /não apresentou evidência suficiente para alterar a formação/);
  assert.match(estado.reason, /composição decidida foi preservada/);
});

test("§7 · divergência vigente sem ajuste seguro preserva o baseline", () => {
  const estado = gate("DIVERGENCE");
  assert.equal(estado.state, "current_divergent_unresolved");
  assert.equal(estado.blocksConclusion, false);
  assert.match(estado.reason, /composição decidida foi preservada/);
});

test("o padrão do gate continua EXIGINDO decisão: quem não declara nada não muda", () => {
  const semPolitica = resolveArticleFormationSerpState({
    candidateRef: "cand:1",
    expectedBaseHash: "base:1",
    observed: { formationBaseHash: "base:1", verdict: "INCONCLUSIVE", humanDecisionBaseHash: null },
  });
  assert.equal(semPolitica.blocksConclusion, true);
  assert.equal(semPolitica.requiresHumanDecision, true);
});

test("§12 · falta de evidência sobre ESTA composição continua bloqueando", () => {
  for (const caso of [
    resolveArticleFormationSerpState({ candidateRef: "c", expectedBaseHash: "b", observed: null, unresolvedBlocksConclusion: false }),
    resolveArticleFormationSerpState({ candidateRef: "c", expectedBaseHash: "b", observed: { formationBaseHash: "outra", verdict: "COMPATIBLE" }, unresolvedBlocksConclusion: false }),
    resolveArticleFormationSerpState({ candidateRef: "c", expectedBaseHash: "b", observed: null, failed: true, unresolvedBlocksConclusion: false }),
  ]) {
    assert.equal(caso.blocksConclusion, true, `${caso.state} não pode passar: não há evidência desta composição`);
  }
  // Sustentada continua livre.
  assert.equal(gate("COMPATIBLE").blocksConclusion, false);
});

test("a mesa declara a política em vez de embutir a exceção", () => {
  assert.match(workspace, /unresolvedBlocksConclusion: PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION/);
  const politica = readFileSync("lib/arquiteto/formation-phase-policy.ts", "utf8");
  assert.match(politica, /export const PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION = false;/);
  assert.match(politica, /STRUCTURAL_BASELINE_PRESERVED/);
  assert.match(politica, /UPSTREAM_SILO_REVIEW_SUGGESTED/);
});

/* ============ §3 · artigo de uma keyword ============================== */

const evidencia = (overrides: Partial<ClassificationEvidence> = {}): ClassificationEvidence => ({
  principalIntent: "transacional",
  compositionIntents: ["transacional"],
  principalFunnel: "topo",
  compositionFunnels: ["topo"],
  serpObservedIntent: null,
  serpResolved: true,
  principalKgrScore: 0.1,
  principalKgrApplicability: "applicable",
  fullKgr: true,
  humanKgrDecision: "YES",
  awaitingHumanKgrDecision: false,
  compatibilityConflicts: 0,
  compatibilityEvaluated: 0,
  compositionKeywordCount: 1,
  isPublished: false,
  principalProtected: false,
  ...overrides,
} as unknown as ClassificationEvidence);

test("§3 · artigo de uma keyword: compatibilidade NÃO APLICÁVEL, não ambígua", () => {
  const resolvido = resolveArticleClassification(evidencia());
  assert.equal(resolvido.compatibility.value, "NOT_APPLICABLE");
  assert.match(resolvido.compatibility.reason, /não existe par para avaliar/);
  assert.equal(ARTICLE_COMPATIBILITY_LABELS.NOT_APPLICABLE, "Não aplicável");
  // E nada disso vira pendência humana.
  assert.deepEqual(unresolvedClassifications(evidencia()), []);
});

test("§3 · composição com secundária sem avaliação continua AMBÍGUA", () => {
  // "Não aplicável" é para quem não tem par; "ambígua" é para quem tem par e
  // não foi avaliado. As duas frases dizem coisas diferentes.
  const resolvido = resolveArticleClassification(evidencia({ compositionKeywordCount: 3 }));
  assert.equal(resolvido.compatibility.value, "AMBIGUOUS");
});

test("§3 · a mesa informa o tamanho da composição para a classificação", () => {
  assert.match(workspace, /compositionKeywordCount: input\.keywordIds\.length/);
});

/* ============ §2 · uma autoridade visual de SERP ====================== */

test("§2 · badge e parecer saem da MESMA leitura", () => {
  const verdito = workspace.slice(workspace.indexOf("const articleSerpVerdictFor"));
  const corpo = verdito.slice(0, 1800);
  // A chave do gate vem primeiro: `candidateRef`.
  assert.match(corpo, /const registro = article\.candidateRef/);
  assert.match(corpo, /remoteArticleSerp\.find\(item => item\.candidateRef === article\.candidateRef\)\?\.payload/);
  assert.match(corpo, /registro\?\.assessment as ReturnType<typeof latestSerpAssessmentFor>\) \?\? latestSerpAssessmentFor\(articleId\)/);
  // O sintoma: badge "não executada" ao lado de um parecer inteiro.
  assert.match(corpo, /UMA AUTORIDADE VISUAL DE SERP/);
});

/* ============ §8 · Artigos não move keyword entre Silos =============== */

test("§8 · sugestão da SERP não move membership territorial", () => {
  const politica = readFileSync("lib/arquiteto/formation-phase-policy.ts", "utf8");
  assert.match(politica, /Artigos NÃO move keyword entre Silos/);
  const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  // Na revisão, o Silo é leitura: mover entre Silos é membership territorial.
  assert.match(review, /data-testid="architect-review-silo-readonly"/);
  assert.match(review, /Silo definido na fase Silos/);
});

/* ============ a lista de bloqueios não repete o mesmo motivo =========== */

test("o mesmo motivo não entra duas vezes na lista da fase Links", () => {
  const leitura = workspace.slice(workspace.indexOf("const linksPhaseReading"));
  const corpo = leitura.slice(0, leitura.indexOf("const updateLinkEdge"));
  /*
   * A dependência upstream entrava na lista e voltava como `confirmBlocker`:
   * o mesmo fato respondendo a duas perguntas. Repetido na tela, fazia
   * procurar dois problemas onde havia um — e a lista é renderizada pelo
   * próprio texto, então o React ainda acusava chave duplicada.
   */
  assert.match(corpo, /if \(motivo && !motivos\.includes\(motivo\)\) motivos\.push\(motivo\);/);
  assert.ok(!corpo.includes("blockers.push("), "nada entra na lista sem passar pela verificação");
  assert.match(corpo, /anotar\(dependenciaUpstream\);/);
  assert.match(corpo, /if \(linksWorkingCopy\) anotar\(confirmBlocker\);/);
});
