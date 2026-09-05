import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARTICLE_COMPATIBILITY_LABELS,
  ARTICLE_FUNNEL_LABELS,
  ARTICLE_INTENT_LABELS,
  ARTICLE_KGR_APPLICABILITY_LABELS,
  ARTICLE_KGR_LABELS,
  ARTICLE_PROTECTION_LABELS,
  isProcessStateWord,
  resolveArticleClassification,
  unresolvedClassificationMessage,
  unresolvedClassifications,
  type ClassificationEvidence,
} from "../lib/arquiteto/article-classification-closure.ts";
import { ArticleClassificationSchema } from "../lib/arquiteto/contracts.ts";

/**
 * INCERTEZA É RESULTADO. PENDÊNCIA NÃO É.
 *
 * Um ArticleDNA aprovado é retrato fechado. Se a evidência não sustenta
 * resposta forte, o campo registra a incerteza com nome próprio — nunca deixa
 * trabalho para depois, e nunca inventa certeza para parecer resolvido.
 */

const evidencia = (overrides: Partial<ClassificationEvidence> = {}): ClassificationEvidence => ({
  principalIntent: "informacional",
  compositionIntents: [],
  serpObservedIntent: "informacional",
  serpMixedIntent: false,
  serpResolved: true,
  principalFunnel: "topo",
  compositionFunnels: [],
  principalKgrScore: 0.1,
  principalKgrApplicability: "applicable",
  fullKgr: true,
  humanKgrDecision: null,
  awaitingHumanKgrDecision: false,
  compatibilityConflicts: 0,
  compatibilityEvaluated: 2,
  isPublished: false,
  principalProtected: false,
  ...overrides,
});

/* --------- nenhum estado de processo sobrevive à classificação ----------- */

test("nenhum campo resolvido é palavra de processo", () => {
  const cenarios: ClassificationEvidence[] = [
    evidencia(),
    // Tudo ausente: o pior caso possível ainda fecha.
    evidencia({
      principalIntent: null, serpObservedIntent: null, serpResolved: true,
      principalFunnel: null, principalKgrScore: null, principalKgrApplicability: "pending",
      fullKgr: false, compatibilityEvaluated: 0,
    }),
    evidencia({ serpMixedIntent: true, principalFunnel: null, compositionFunnels: ["topo", "fundo"] }),
  ];

  for (const cenario of cenarios) {
    const resolvida = resolveArticleClassification(cenario);
    const rotulos = [
      ARTICLE_INTENT_LABELS[resolvida.intent.value],
      ARTICLE_FUNNEL_LABELS[resolvida.funnel.value],
      ARTICLE_KGR_LABELS[resolvida.kgr.value],
      ARTICLE_KGR_APPLICABILITY_LABELS[resolvida.kgrApplicability.value],
      ARTICLE_COMPATIBILITY_LABELS[resolvida.compatibility.value],
      ARTICLE_PROTECTION_LABELS[resolvida.protection.value],
    ];
    for (const rotulo of rotulos) {
      assert.equal(isProcessStateWord(rotulo), false, `"${rotulo}" é estado de processo, não resultado`);
    }
    // E todo campo traz o porquê: terminal sem motivo vira carimbo.
    for (const campo of Object.values(resolvida)) {
      assert.ok(campo.reason.trim().length > 0);
    }
    // O contrato canônico aceita o que a resolução produz.
    ArticleClassificationSchema.parse(resolvida);
  }
});

test("o contrato recusa estado de processo no ArticleDNA", () => {
  const resolvida = resolveArticleClassification(evidencia());
  assert.throws(() => ArticleClassificationSchema.parse({
    ...resolvida,
    intent: { ...resolvida.intent, value: "PENDING" },
  }));
  assert.throws(() => ArticleClassificationSchema.parse({
    ...resolvida,
    funnel: { ...resolvida.funnel, value: "NOT_RECEIVED" },
  }));
  assert.throws(() => ArticleClassificationSchema.parse({
    ...resolvida,
    kgr: { ...resolvida.kgr, value: "PENDING" },
  }));
  assert.throws(() => ArticleClassificationSchema.parse({
    ...resolvida,
    kgrApplicability: { ...resolvida.kgrApplicability, value: "pending" },
  }));
  // Motivo vazio também não passa.
  assert.throws(() => ArticleClassificationSchema.parse({
    ...resolvida,
    compatibility: { ...resolvida.compatibility, reason: "" },
  }));
});

/* ------------------- incerteza como terminal VÁLIDO ---------------------- */

test("SERP que mistura intenções fecha como MIXED, não como dúvida", () => {
  const resolvida = resolveArticleClassification(evidencia({ serpMixedIntent: true }));
  assert.equal(resolvida.intent.value, "MIXED");
  assert.equal(resolvida.intent.source, "serp");
  assert.match(resolvida.intent.reason, /mistura relevante/);
});

test("sem intenção na Principal nem na SERP, o terminal é AMBIGUOUS", () => {
  const resolvida = resolveArticleClassification(evidencia({
    principalIntent: null,
    serpObservedIntent: null,
  }));
  assert.equal(resolvida.intent.value, "AMBIGUOUS");
  assert.equal(ARTICLE_INTENT_LABELS.AMBIGUOUS, "Ambígua");
});

test("funil sem padrão fecha como INDETERMINATE", () => {
  const semFunil = resolveArticleClassification(evidencia({ principalFunnel: null }));
  assert.equal(semFunil.funnel.value, "INDETERMINATE");

  const misto = resolveArticleClassification(evidencia({ principalFunnel: "topo", compositionFunnels: ["fundo"] }));
  assert.equal(misto.funnel.value, "MIXED");
});

test("composição que diverge da Principal fecha a intenção como MIXED", () => {
  const resolvida = resolveArticleClassification(evidencia({
    compositionIntents: ["transacional"],
  }));
  assert.equal(resolvida.intent.value, "MIXED");
  assert.equal(resolvida.intent.source, "group");
});

/* ----------------------------- KGR ---------------------------------------- */

test("aplicabilidade ausente não vira NO: NOT_APPLICABLE é outra coisa", () => {
  const resolvida = resolveArticleClassification(evidencia({
    principalKgrApplicability: "pending",
    fullKgr: false,
    principalKgrScore: 0.9,
  }));
  assert.equal(resolvida.kgrApplicability.value, "NOT_APPLICABLE");
  assert.equal(resolvida.kgr.value, "NOT_APPLICABLE", "o contrato distingue 'não se aplica' de 'não é KGR'");
  assert.match(resolvida.kgrApplicability.reason, /não entregou os fatos/);
});

test("KGR sai da métrica do KeywordDNA, não da SERP", () => {
  const pleno = resolveArticleClassification(evidencia({ fullKgr: true, principalKgrScore: 0.12 }));
  assert.equal(pleno.kgr.value, "YES");
  assert.equal(pleno.kgr.source, "principal");

  const foraDoPleno = resolveArticleClassification(evidencia({ fullKgr: false, principalKgrScore: 0.7 }));
  assert.equal(foraDoPleno.kgr.value, "NO");

  const semScore = resolveArticleClassification(evidencia({ fullKgr: false, principalKgrScore: null }));
  assert.equal(semScore.kgr.value, "NOT_APPLICABLE");
});

test("decisão humana registrada prevalece e não é recalculada", () => {
  const resolvida = resolveArticleClassification(evidencia({
    humanKgrDecision: "YES", fullKgr: false, principalKgrScore: 0.8,
  }));
  assert.equal(resolvida.kgr.value, "YES");
  assert.equal(resolvida.kgr.source, "article_decision");
});

/* ------------------- §13: pendência real BLOQUEIA ------------------------ */

test("cálculo disponível NÃO vira decisão humana", () => {
  /*
   * Score 0,3254 com aplicabilidade Aplicável: o fato já responde — não é
   * KGR pleno, logo NO. Barrar isso devolvia ao humano a aritmética que os
   * dados já fizeram e travava artigos completos.
   */
  const foraDoPleno = evidencia({
    awaitingHumanKgrDecision: true,
    fullKgr: false,
    principalKgrScore: 0.3254,
    principalKgrApplicability: "applicable",
  });
  assert.deepEqual(unresolvedClassifications(foraDoPleno), []);
  assert.equal(resolveArticleClassification(foraDoPleno).kgr.value, "NO");
});

test("aplicável sem métrica é a única pendência editorial real", () => {
  // O contrato diz que o KGR se aplica e a métrica nunca chegou: "Não" seria
  // reprovar sem medir, "Não aplicável" contradiria o próprio Minerador.
  const codes = unresolvedClassifications(evidencia({
    principalKgrApplicability: "applicable",
    principalKgrScore: null,
    fullKgr: false,
  }));
  assert.deepEqual(codes, ["KGR_APPLICABLE_WITHOUT_METRIC"]);
  assert.match(unresolvedClassificationMessage(codes)!, /classificações não resolvidas: KGR/);

  // Decisão humana registrada resolve.
  assert.deepEqual(
    unresolvedClassifications(evidencia({
      principalKgrApplicability: "applicable", principalKgrScore: null, fullKgr: false, humanKgrDecision: "NO",
    })),
    [],
  );
});

test("a exigência de SERP vigente não é redecidida aqui", () => {
  // Ela já é o portão SERP_EVIDENCE_CURRENT da conclusão. Duas leituras da
  // mesma pergunta é o defeito que este módulo existe para não repetir.
  assert.deepEqual(unresolvedClassifications(evidencia({ serpResolved: false, principalIntent: null })), []);
  // E a intenção fecha como incerteza nomeada, não como pendência.
  assert.equal(
    resolveArticleClassification(evidencia({ serpResolved: false, principalIntent: null, serpObservedIntent: null })).intent.value,
    "AMBIGUOUS",
  );
});

test("evidência completa não bloqueia nada", () => {
  assert.deepEqual(unresolvedClassifications(evidencia()), []);
  assert.equal(unresolvedClassificationMessage([]), null);
});

/* --------------------------- fiação da tela ------------------------------ */

test("a tela não escreve mais Pendente nem Não recebido no resumo", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.doesNotMatch(workspace, /expandedPanelSummary\.intent\.principal \|\| "Pendente"/);
  assert.doesNotMatch(workspace, /expandedPanelSummary\.funnel\.principal \|\| "Não recebido"/);
  assert.match(workspace, /data-testid="article-summary-intent"/);
  assert.match(workspace, /data-testid="article-summary-funnel"/);
  assert.match(workspace, /data-testid="article-summary-kgr-applicability"/);
  // O motivo acompanha o valor: terminal sem explicação é carimbo.
  assert.match(workspace, /articleClassification\.intent\.reason/);
  // E o retrato gravado tem precedência sobre o cálculo ao vivo.
  assert.match(workspace, /const gravada = version\?\.payload\.classification;/);
});

test("a conclusão grava a classificação e o portão a exige", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const portaria = readFileSync("lib/arquiteto/article-formation-confirmation.ts", "utf8");
  assert.match(workspace, /const classificacao = resolveArticleClassification\(evidenciaClassificacao\);/);
  assert.match(workspace, /classification: classificacao/);
  assert.match(portaria, /"ARTICLE_REQUIRED_CLASSIFICATIONS_RESOLVED"/);
  assert.match(portaria, /classificacoesAbertas/);
});
