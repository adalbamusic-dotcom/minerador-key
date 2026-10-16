import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveSerpFormationVerdict, type SerpFormationObservationInput } from "../lib/arquiteto/serp-formation-verdict.ts";
import { buildArticleReviewChecklist } from "../lib/arquiteto/article-review-checklist.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const observation = (overrides: Partial<SerpFormationObservationInput> = {}): SerpFormationObservationInput => ({
  keywordId: "kw-1",
  keyword: "principia skincare",
  currentRole: "principal",
  upstreamIntent: null,
  observedIntent: "Informacional",
  compatibility: "insuficiente",
  overlap: "unknown",
  dominantPageType: null,
  competition: "media",
  conflict: true,
  insufficientEvidence: true,
  likelyCannibalization: "unknown",
  needsSeparation: null,
  principalPossiblyInadequate: null,
  decisionStatus: "pending",
  recommendationAction: "revisar_humano",
  recommendationReason: "Cobertura não observada nos snippets.",
  ...overrides,
});

const checklistWith = (serp: Parameters<typeof buildArticleReviewChecklist>[0]["serp"]) => buildArticleReviewChecklist({
  hasArticleDna: true,
  approved: false,
  kgr: { label: "Sim · KGR pleno", requiresHumanDecision: false, fullKgr: true, principalKeyword: "principia skincare", principalScoreLabel: "0,022" },
  unitType: { defined: true, label: "Artigo" },
  serp,
  aiProposals: [],
  unresolvedConflicts: [],
});

test("INCONCLUSIVE não cria conflito bloqueante nem decisão humana", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "insuficiente",
    keywordCount: 5,
    observations: [observation(), observation({ keywordId: "kw-2", keyword: "principia sérum" })],
  });

  assert.equal(verdict.kind, "INCONCLUSIVE");
  assert.equal(verdict.blocking, false);
  assert.equal(verdict.humanDecisionRequired, false);
  assert.equal(verdict.divergences.length, 0);
  assert.match(verdict.impact, /A estrutura atual é mantida/);
  assert.equal(verdict.canRefresh, true);
});

test("observações por keyword continuam visíveis sem rótulo de conflito", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "insuficiente",
    keywordCount: 5,
    observations: [observation({ observedIntent: "Informacional", overlap: "low" })],
  });
  const item = verdict.keywordObservations[0];

  assert.equal(verdict.keywordObservations.length, 1);
  assert.equal(item.keyword, "principia skincare");
  assert.equal(item.upstreamIntent, "Indeterminada");
  assert.equal(item.observedBehaviour, "Informacional");
  assert.equal(item.evidenceStrength, "Insuficiente");
  assert.equal(item.architecturalImpact, "Nenhum");
});

test("COMPATIBLE não cria decisão humana", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "prioritaria",
    keywordCount: 3,
    observations: [
      observation({ compatibility: "coerente", conflict: false, insufficientEvidence: false, upstreamIntent: "Informacional", recommendationAction: "manter_no_artigo" }),
      observation({ keywordId: "kw-2", keyword: "principia sérum", currentRole: "secundaria", compatibility: "coerente", conflict: false, insufficientEvidence: false, upstreamIntent: "Informacional", recommendationAction: "manter_secundaria" }),
    ],
  });

  assert.equal(verdict.kind, "COMPATIBLE");
  assert.equal(verdict.humanDecisionRequired, false);
  assert.equal(verdict.divergences.length, 0);
  assert.ok(verdict.keywordObservations.length > 0);
});

test("DIVERGENCE cria decisão humana explícita", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "prioritaria",
    keywordCount: 3,
    observations: [
      observation({ compatibility: "coerente", conflict: false, insufficientEvidence: false, upstreamIntent: "Informacional", recommendationAction: "manter_no_artigo" }),
      observation({ keywordId: "kw-2", keyword: "principia sérum", currentRole: "secundaria", compatibility: "incompativel", conflict: true, insufficientEvidence: false, upstreamIntent: "Local", recommendationAction: "separar_artigo", recommendationReason: "Baixa sobreposição no Top 10." }),
    ],
  });

  assert.equal(verdict.kind, "DIVERGENCE");
  assert.equal(verdict.humanDecisionRequired, true);
  assert.equal(verdict.blocking, true);
  assert.equal(verdict.divergences.length, 1);
});

test("artigo de uma keyword com evidência insuficiente não vira conflito de agrupamento", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "insuficiente",
    keywordCount: 1,
    observations: [observation({ conflict: true })],
  });

  assert.equal(verdict.kind, "INCONCLUSIVE");
  assert.equal(verdict.humanDecisionRequired, false);
  assert.equal(verdict.divergences.length, 0);
});

test("a Revisão só recebe pendência da SERP em divergência", () => {
  const compatible = checklistWith({ kind: "COMPATIBLE", label: "Compatível", divergences: [] });
  const inconclusive = checklistWith({ kind: "INCONCLUSIVE", label: "Inconclusivo", divergences: [] });
  const divergent = checklistWith({
    kind: "DIVERGENCE",
    label: "Divergência",
    divergences: [{
      keywordId: "kw-2", keyword: "principia sérum", currentRole: "secundaria", upstreamFact: "Local", observedEvidence: "Local",
      overlapLabel: "Baixa", dominantPageType: "Serviço", observedIntent: "Local", evidenceStrength: "Forte",
      recommendation: "Separar esta keyword do artigo atual.", reason: "Baixa compatibilidade.", impact: "Decisão humana.", actions: ["keep", "separate"],
    }],
  });

  assert.equal(compatible.decisions.filter(item => item.kind === "serp_divergence").length, 0);
  assert.equal(inconclusive.decisions.filter(item => item.kind === "serp_divergence").length, 0);
  assert.equal(inconclusive.pendingCount, 0);
  assert.equal(inconclusive.readyForApproval, true);
  assert.equal(divergent.decisions.filter(item => item.kind === "serp_divergence").length, 1);
  assert.equal(divergent.readyForApproval, false);
});

test("a aba SERP separa observação humana de sinal técnico", () => {
  assert.match(workspace, /data-testid="architect-serp-observations"/);
  assert.match(workspace, /data-testid="architect-serp-technical"/);
  assert.match(workspace, /Detalhes técnicos da SERP/);
  assert.match(workspace, /Sem evidência suficiente, nada aqui é conflito nem exige decisão\./);
  // Ações de recomendação só aparecem no caminho de divergência.
  assert.match(workspace, /articleSerpVerdict\.kind === "DIVERGENCE"\r?\n\s*\? <>/);
  assert.doesNotMatch(workspace, /Conclusão arquitetural: <strong>/);
  assert.doesNotMatch(workspace, /Com conflito observado: <strong/);
});

test("conflito técnico só vira rótulo humano em divergência", () => {
  assert.match(workspace, /if \(articleSerpVerdictFor\(article\)\.kind === "DIVERGENCE"\) return \{ label: `SERP com divergência/);
  /*
   * A divergência TAMBÉM ocupava a coluna Aprovação, devolvendo `conflicts`.
   *
   * Aprovação fala do artefato canônico; SERP é evidência sobre a formação.
   * Duas perguntas, e a resposta de uma estava na célula da outra — junto com
   * `draft`, que se chama "Em processo" e colidia com a coluna de Status.
   * O rótulo próprio da SERP, acima, continua sendo onde a divergência é dita.
   */
  assert.doesNotMatch(workspace, /if \(assessment && articleSerpVerdictFor\(art\)\.kind === "DIVERGENCE"\) return "conflicts";/);
  // A contagem de conflitos do portão do Radar saiu da memo local: quem responde
  // por divergência ali é o gate canônico, pelo estado da SERP da formação, e
  // não pelo assessment legado.
  assert.match(workspace, /serpState: gate\?\.state \?\? null,/);
});

test("o readback confirma assessment a assessment e não é mais atômico", () => {
  assert.match(workspace, /const expectedAssessments = confirmTargets \?\? assessments;/);
  assert.match(workspace, /const missingAssessments = expectedAssessments\.filter\(expected => \{/);
  assert.match(workspace, /const assessmentsPreserved = missingAssessments\.length === 0;/);
  assert.doesNotMatch(workspace, /confirmed\.assessments\.length !== assessments\.length/);
  assert.match(workspace, /Não confirmados: \$\{missingAssessments\.map\(assessment => assessment\.articleId\)\.join\(", "\)\}/);
});

test("reexecução do mesmo artigo não duplica assessment e a mensagem atômica sumiu", () => {
  // A deduplicação vive no registro canônico das avaliações.
  assert.match(readFileSync("lib/arquiteto/serp-assessment-registry.ts", "utf8"), /\.filter\(item => item\.id !== assessment\.id\)/);
  assert.doesNotMatch(workspace, /a execução da SERP é atômica hoje/);
  assert.match(workspace, /os assessments já confirmados anteriormente permanecem/);
});

test("divergência SERP explicada para quem não conhece SEO: o que houve, por que importa e o que cada botão faz (dono, 2026-09-30)", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "prioritaria",
    keywordCount: 3,
    observations: [observation({ keyword: "marketing digital para dentistas", currentRole: "secundaria", insufficientEvidence: false, compatibility: "incompativel", overlap: "low" })],
  });
  assert.equal(verdict.kind, "DIVERGENCE");
  const plain = verdict.divergences[0].plain!;
  assert.match(plain.title, /pode não pertencer a este artigo/);
  assert.match(plain.what, /páginas diferentes/);
  assert.match(plain.what, /páginas em comum: baixa/);
  assert.match(plain.why, /Não é um erro do sistema/);
  assert.match(plain.keep, /Manter no artigo/);
  assert.match(plain.apply, /nada sai do artigo sozinho/);
  const decision = checklistWith(verdict).decisions.find(item => item.kind === "serp_divergence")!;
  assert.match(decision.why, /Por que isso importa/);
  assert.match(decision.how, /Manter no artigo.*Aplicar recomendação/);
  assert.match(workspace, /data-testid="architect-serp-divergence-plain"/);

  const promote = resolveSerpFormationVerdict({ hasAssessment: true, evidencePriority: "prioritaria", keywordCount: 3,
    observations: [observation({ insufficientEvidence: false, recommendationAction: "tornar_principal", currentRole: "secundaria" })] });
  assert.match(promote.divergences[0].plain!.title, /pode representar melhor este artigo/);
  assert.match(promote.divergences[0].plain!.apply, /URL e slug não mudam/);
});

test("painel da formação resolve a divergência ali mesmo: aviso, porquê e os dois botões", () => {
  const panel = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  assert.match(panel, /data-testid="architect-review-serp-divergence-plain"/);
  assert.match(panel, /data-testid="architect-review-serp-divergence-keep"/);
  assert.match(panel, /data-testid="architect-review-serp-divergence-apply"/);
  assert.match(panel, /Por quê: \{decision\.why\}/);
  assert.match(workspace, /onKeep: \(\) => \{ void handleSerpRecommendationDecision\(art, divergence\.keywordId, "ignored"\); \}/);
  assert.match(workspace, /onApply: \(\) => \{ void handleSerpRecommendationDecision\(art, divergence\.keywordId, "followed"\); \}/);
  const promote = resolveSerpFormationVerdict({ hasAssessment: true, evidencePriority: "prioritaria", keywordCount: 3,
    observations: [observation({ insufficientEvidence: false, principalPossiblyInadequate: true, recommendationAction: "revisar_humano", currentRole: "secundaria" })] });
  assert.match(promote.divergences[0].plain!.why, /nunca troca a principal sozinha/);
  assert.match(promote.divergences[0].plain!.keep, /a principal atual continua/);
});
