import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARTICLE_KGR_DECISION_CONTRACT_VERSION,
  FULL_KGR_THRESHOLD,
  readArticleKgrDecision,
  resolveArticleKgrSerpReadout,
} from "../lib/arquiteto/article-kgr-decision.ts";
import { readArticleExpandedPanelKeywordFacts } from "../lib/arquiteto/article-expanded-panel.ts";
import { deriveArticleKgrIdentity } from "../lib/arquiteto/strategic-context.ts";
import { ArticleKgrIdentitySchema } from "../lib/arquiteto/contracts.ts";

/*
 * DECISÃO KGR DO ARTIGO — contrato `article-kgr-decision-v2` (SDD
 * `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`, A1).
 * Padrão "KGR não aplicável"; "Aplicar KGR" é escolha humana; score e faixa
 * 150–550 são informação, nunca decisão; nada bloqueia por KGR não aplicável.
 */

const applicable = { kgr_aplicabilidade: "applicable" };
const notApplicable = { kgr_aplicabilidade: "not_applicable" };

test("score válido menor que 0.25 NÃO vira Sim sozinho: o padrão é KGR não aplicável", () => {
  for (const score of [0, 0.1, 0.249]) {
    const decision = readArticleKgrDecision({ principal: { kgr: score, analise_semantica: applicable } });

    assert.equal(decision.decision, "NO", `score ${score}`);
    assert.equal(decision.source, "KEYWORD_APPLICABILITY_RULE");
    assert.equal(decision.label, "Não aplicável");
    assert.equal(decision.tone, "neutral");
    assert.equal(decision.applyKgr, false);
    assert.equal(decision.fullKgr, false);
    assert.equal(decision.requiresHumanDecision, false);
    assert.equal(decision.principalKgrScore, score);
    assert.equal(decision.scoreInFullRange, true, "o score pleno é informação");
  }
  assert.equal(FULL_KGR_THRESHOLD, 0.25);
});

test("0.25 exato não é pleno, e nenhuma combinação pede decisão humana obrigatória", () => {
  const limit = readArticleKgrDecision({ principal: { kgr: 0.25, analise_semantica: applicable } });
  const higher = readArticleKgrDecision({ principal: { kgr: 0.656, analise_semantica: applicable } });

  for (const decision of [limit, higher]) {
    assert.equal(decision.decision, "NO");
    assert.equal(decision.requiresHumanDecision, false);
    assert.equal(decision.scoreInFullRange, false);
  }
  assert.ok(higher.notes.some(note => note.includes("marcada como KGR aplicável no Minerador")), "a marca do Minerador vira aviso, não decisão");
});

test("aplicabilidade da keyword, pendente legado e ausência de semântica dão o mesmo padrão", () => {
  const refused = readArticleKgrDecision({ principal: { kgr: 0.4, analise_semantica: notApplicable } });
  const pending = readArticleKgrDecision({ principal: { kgr_score: 0.9, analise_semantica: { kgr_aplicabilidade: "pending" } } });
  const noSemantic = readArticleKgrDecision({ principal: { kgr: 0.31 } });

  for (const decision of [refused, pending, noSemantic]) {
    assert.equal(decision.decision, "NO");
    assert.equal(decision.source, "KEYWORD_APPLICABILITY_RULE");
    assert.equal(decision.label, "Não aplicável");
    assert.equal(decision.requiresHumanDecision, false);
  }
});

test("score ausente permanece ausente e nunca vira zero; sem Aplicar KGR, nada bloqueia", () => {
  const absent = readArticleKgrDecision({ principal: { kgr: null, kgr_score: null, analise_semantica: applicable } });
  const missing = readArticleKgrDecision({ principal: { analise_semantica: applicable } });
  const invalid = readArticleKgrDecision({ principal: { kgr: -1, analise_semantica: applicable } });

  for (const decision of [absent, missing, invalid]) {
    assert.equal(decision.decision, "NO");
    assert.equal(decision.principalKgrScore, null);
    assert.equal(decision.scoreSource, null);
    assert.equal(decision.applyKgr, false);
  }
});

test("allintitle e volume do Minerador calculam o score quando o kgr_score não veio", () => {
  const decision = readArticleKgrDecision({ principal: { kgr_score: null, results_allintitle: 40, volume_search: 400 } });
  assert.equal(decision.principalKgrScore, 0.1);
  assert.equal(decision.scoreSource, "minerador");
  assert.equal(decision.volumeInInterestRange, true, "400 está na faixa 150–550");
  assert.equal(decision.applyKgr, false, "faixa e score não aplicam o KGR");
});

test("faixa de interesse 150–550 é só informativa e inclui os limites", () => {
  const dentro = [150, 550].map(volume => readArticleKgrDecision({ principal: { volume_search: volume } }).volumeInInterestRange);
  const fora = [149, 551, 0].map(volume => readArticleKgrDecision({ principal: { volume_search: volume } }).volumeInInterestRange);
  assert.deepEqual(dentro, [true, true]);
  assert.deepEqual(fora, [false, false, false]);
});

test("secundárias e reforços não classificam o artigo nem viram média ou maioria", () => {
  const supports = [
    { kgr: 0.01, analise_semantica: applicable },
    { kgr: 0.02, analise_semantica: applicable },
    { kgr: 0.03, analise_semantica: applicable },
  ];
  const withApplicableSupports = readArticleKgrDecision({ principal: { kgr: 0.8, analise_semantica: notApplicable }, supports });
  const singleSupport = readArticleKgrDecision({
    principal: { kgr: 0.8, analise_semantica: { kgr_aplicabilidade: "pending" } },
    supports: [{ kgr: 0.02, analise_semantica: applicable }],
  });

  assert.equal(withApplicableSupports.decision, "NO");
  assert.equal(withApplicableSupports.secondaryApplicableCount, 3);
  assert.equal(singleSupport.decision, "NO");
  assert.equal(singleSupport.principalReviewProposal, true);
  assert.ok(singleSupport.notes.some(note => note.includes("proposta de revisão da Principal")));
});

test("score e aplicabilidade do KeywordDNA não são sobrescritos pela leitura do artigo", () => {
  const principal = { id: "kw-main", keyword: "clínica popular", kgr: 0.656, analise_semantica: { kgr_aplicabilidade: "applicable" } };
  const before = JSON.stringify(principal);
  const decision = readArticleKgrDecision({ principal, supports: [] });
  const facts = readArticleExpandedPanelKeywordFacts(principal);

  assert.equal(JSON.stringify(principal), before);
  assert.equal(decision.principalKgrScore, 0.656);
  assert.equal(decision.principalApplicability, "applicable");
  assert.equal(decision.principalApplicabilityLabel, "Aplicável");
  assert.equal(facts.kgr.value, 0.656);
  assert.equal(facts.kgr.label, "Aplicável");
});

test("Aplicar KGR humano e vínculo confirmado prevalecem; candidata sem decisão fica no padrão", () => {
  const humanNo = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: false, source: "human_confirmation", bindingStatus: "not_applicable", status: "not_kgr" },
    principal: { kgr: 0.1, analise_semantica: applicable },
  });
  const humanYes = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "human_confirmation", bindingStatus: "candidate", status: "candidate" },
    principal: { kgr: 0.656, analise_semantica: applicable },
  });
  const binding = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "confirmed_import", bindingStatus: "confirmed", status: "confirmed" },
    principal: { kgr: 0.656 },
  });
  const candidate = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "minerador", bindingStatus: "candidate", status: "candidate" },
    principal: { kgr: 0.656, analise_semantica: applicable },
  });

  assert.equal(humanNo.decision, "NO");
  assert.equal(humanNo.source, "HUMAN_DECISION");
  assert.equal(humanNo.label, "Não");
  assert.equal(humanYes.decision, "YES");
  assert.equal(humanYes.applyKgr, true);
  assert.equal(humanYes.label, "Sim");
  assert.equal(binding.source, "CONFIRMED_KGR_BINDING");
  assert.equal(binding.applyKgr, true);
  assert.equal(candidate.decision, "NO");
  assert.equal(candidate.source, "KEYWORD_APPLICABILITY_RULE");
});

test("identidade gravada pela regra antiga é lida como está: Sim · regra antiga", () => {
  const legacy = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "minerador", bindingStatus: "candidate", status: "candidate", primaryKeywordId: "kw-1", decision: "YES", decisionSource: "FULL_KGR_RULE", decisionContractVersion: "article-kgr-decision-v1" },
    principal: { kgr: 0.1 },
    principalKeywordId: "kw-1",
  });
  assert.equal(legacy.decision, "YES");
  assert.equal(legacy.source, "FULL_KGR_RULE");
  assert.equal(legacy.label, "Sim · regra antiga (KGR pleno automático)");
  assert.equal(legacy.fullKgr, true);
  assert.equal(legacy.applyKgr, true);
  // Uma identidade antiga "A decidir" não pende mais: fica no padrão.
  const awaiting = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: false, source: "minerador", bindingStatus: "not_applicable", status: "unknown", primaryKeywordId: "kw-1", decision: "PENDING_HUMAN_DECISION", decisionSource: "AWAITING_HUMAN_DECISION" },
    principal: { kgr: 0.6 },
    principalKeywordId: "kw-1",
  });
  assert.equal(awaiting.decision, "NO");
  assert.equal(awaiting.requiresHumanDecision, false);
});

test("o allintitle medido pelo Arquiteto é a fonte do score do artigo, só para a mesma Principal", () => {
  const identity = {
    isKgrArticle: true, source: "human_confirmation" as const, bindingStatus: "candidate" as const, status: "candidate" as const,
    primaryKeywordId: "kw-1", primaryVolume: 300, decisionSource: "HUMAN_DECISION" as const, decision: "YES" as const,
    evidence: [
      { kind: "article_allintitle", keywordId: "kw-1", resultCount: 30, measuredAt: "2026-09-20T10:00:00.000Z" },
      { kind: "article_allintitle", keywordId: "kw-1", resultCount: 60, measuredAt: "2026-09-27T10:00:00.000Z" },
      { kind: "article_allintitle", keywordId: "kw-outra", resultCount: 1, measuredAt: "2026-09-28T10:00:00.000Z" },
    ],
  };
  const read = readArticleKgrDecision({ kgrIdentity: identity, principal: { kgr_score: 0.9, volume_search: 300 }, principalKeywordId: "kw-1" });
  assert.equal(read.scoreSource, "arquiteto_allintitle");
  assert.equal(read.principalResultCount, 60, "a medição mais nova da mesma Principal");
  assert.equal(read.principalKgrScore, 0.2);
  assert.equal(read.allintitleMeasuredAt, "2026-09-27T10:00:00.000Z");

  const otherPrincipal = readArticleKgrDecision({ kgrIdentity: identity, principal: { kgr_score: 0.9, volume_search: 300 }, principalKeywordId: "kw-nova" });
  assert.equal(otherPrincipal.scoreSource, "minerador");
  assert.equal(otherPrincipal.decision, "NO", "a decisão da Principal anterior é histórico");
});

test("recomendação SERP existe só para artigo que aplica o KGR e com evidência real", () => {
  const applied = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "human_confirmation", bindingStatus: "candidate", status: "candidate" },
    principal: { kgr: 0.656, analise_semantica: applicable },
  });
  const notApplied = readArticleKgrDecision({ principal: { kgr: 0.1, analise_semantica: applicable } });
  const observation = { competition: "baixa" as const, compatibility: "coerente" as const, conflict: false, insufficientEvidence: false, likelyCannibalization: "unlikely" as const };

  const favourable = resolveArticleKgrSerpReadout({ decision: applied, competitionLevel: "baixa", intentCompatibility: "coerente", evidencePriority: "prioritaria", principalObservation: observation });
  const unfavourable = resolveArticleKgrSerpReadout({ decision: applied, competitionLevel: "alta", intentCompatibility: "coerente", evidencePriority: "prioritaria", principalObservation: { ...observation, competition: "alta" } });
  const inconclusive = resolveArticleKgrSerpReadout({ decision: applied, competitionLevel: "media", intentCompatibility: "parcialmente_coerente", evidencePriority: "prioritaria", principalObservation: { ...observation, competition: "media", compatibility: "parcialmente_coerente" } });
  const insufficient = resolveArticleKgrSerpReadout({ decision: applied, competitionLevel: "baixa", intentCompatibility: "coerente", evidencePriority: "insuficiente", principalObservation: { ...observation, insufficientEvidence: true } });
  const noObservation = resolveArticleKgrSerpReadout({ decision: applied, competitionLevel: "desconhecida", intentCompatibility: "insuficiente", evidencePriority: "insuficiente", principalObservation: null });
  const notAppliedReadout = resolveArticleKgrSerpReadout({ decision: notApplied, competitionLevel: "baixa", intentCompatibility: "coerente", evidencePriority: "prioritaria", principalObservation: observation });

  assert.equal(favourable?.recommendationLabel, "Favorável");
  assert.equal(favourable?.principalKgrScore, 0.656);
  assert.equal(favourable?.principalApplicabilityLabel, "Aplicável");
  assert.equal(favourable?.competitionLabel, "Baixa");
  assert.equal(favourable?.evidenceStrengthLabel, "Prioritária");
  assert.equal(unfavourable?.recommendationLabel, "Desfavorável");
  assert.equal(inconclusive?.recommendationLabel, "Inconclusiva");
  assert.equal(insufficient?.recommendationLabel, "Inconclusiva");
  assert.equal(noObservation, null);
  assert.equal(notAppliedReadout, null);
});

test("painel do Arquiteto separa a classificação do artigo do KGR recebido na keyword", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(workspace, /ARTICLE_KGR_TONE_CLASSES\[articleKgr\.tone\]/);
  assert.match(workspace, /Classificação do artigo, não o KGR da keyword/);
  assert.match(workspace, /data-testid="architect-serp-kgr-readout"/);
  assert.match(workspace, /Aplicabilidade upstream/);
  assert.match(workspace, /Competição observada/);
  assert.match(workspace, /Força da evidência/);
  assert.match(workspace, /Recomendação para estratégia KGR/);
  assert.match(workspace, /data-testid="architect-review-kgr-decision"/);
  // "Aplicar KGR" sempre visível, padrão Não, com allintitle e a faixa 150–550 como informação.
  assert.match(workspace, /data-testid="architect-article-apply-kgr" value=\{articleKgr\.applyKgr \? "YES" : "NO"\}/);
  assert.match(workspace, /<option value="NO">Não \(padrão\)<\/option>/);
  assert.match(workspace, /data-testid="architect-article-allintitle-measure"/);
  assert.match(workspace, /Recalcular allintitle \(pago\)/);
  assert.match(workspace, /ARTICLE_KGR_INTEREST_VOLUME_RANGE\.min/);
  assert.match(workspace, /não substitui nem reutiliza o select de aplicabilidade do KeywordDNA/);
  assert.doesNotMatch(workspace, /articleKgr\.requiresHumanDecision && <label/);
  assert.doesNotMatch(workspace, /expandedPanelSummary\.kgr\.label/);
});

test("envelope humano preserva a base da Principal e a troca de Principal volta ao padrão, com histórico", () => {
  const persisted = ArticleKgrIdentitySchema.parse({
    isKgrArticle: false,
    source: "human_confirmation",
    brandId: "brand-1",
    articleId: "article-1",
    workflowItemId: "workflow-1",
    principalKeywordDnaId: "keyword-dna-a",
    principalKeywordDnaVersionId: "keyword-dna-a:v2",
    principalKeywordDnaContentHash: "legacy:hash-a",
    primaryKeywordId: "keyword-a",
    kgrValue: 0.5,
    principalKgrApplicability: "applicable",
    bindingStatus: "not_applicable",
    status: "not_kgr",
    decision: "NO",
    decisionSource: "HUMAN_DECISION",
    decisionReason: "Decisão humana explícita.",
    decisionContractVersion: "article-kgr-decision-v1",
    decidedBy: "actor-1",
    decidedAt: "2026-08-28T12:00:00.000Z",
    decisionHistory: [{ decision: "NO", source: "HUMAN_DECISION", principalKeywordId: "keyword-a", principalKeywordDnaId: "keyword-dna-a", principalKeywordDnaVersionId: "keyword-dna-a:v2", principalKeywordDnaContentHash: "legacy:hash-a", principalKgrScore: 0.5, principalKgrApplicability: "applicable", actorUserId: "actor-1", decidedAt: "2026-08-28T12:00:00.000Z", reason: "Decisão humana explícita." }],
  });
  const next = deriveArticleKgrIdentity(
    { kgrIdentity: persisted } as never,
    { id: "keyword-b", keyword: "nova principal", kgr_score: 0.1, analise_semantica: applicable, keywordDnaRef: { entityId: "keyword-dna-b", versionId: "keyword-dna-b:v3", contentHash: "legacy:hash-b" } } as never,
    "nova-principal",
  );

  assert.ok(next);
  assert.equal(ArticleKgrIdentitySchema.safeParse(next).success, true, "sem campo novo: o schema .strict() aceita");
  assert.equal(next?.decision, "NO");
  assert.equal(next?.decisionSource, "KEYWORD_APPLICABILITY_RULE");
  assert.equal(next?.decisionContractVersion, ARTICLE_KGR_DECISION_CONTRACT_VERSION);
  assert.equal(next?.isKgrArticle, false);
  assert.equal(next?.boundSlug, undefined, "sem KGR aplicado não há slug vinculado");
  assert.equal(next?.primaryKeywordId, "keyword-b");
  assert.equal(next?.principalKeywordDnaVersionId, "keyword-dna-b:v3");
  assert.equal(next?.principalKeywordDnaContentHash, "legacy:hash-b");
  assert.equal(next?.decisionHistory?.[0]?.decision, "NO");
  // A leitura da identidade nova para a Principal nova: padrão, sem pendência.
  const read = readArticleKgrDecision({ kgrIdentity: next, principal: { kgr_score: 0.1 }, principalKeywordId: "keyword-b" });
  assert.equal(read.decision, "NO");
  assert.equal(read.requiresHumanDecision, false);
});

test("artigo novo com score pleno não ganha identidade KGR derivada", () => {
  const derived = deriveArticleKgrIdentity(
    {} as never,
    { id: "keyword-c", keyword: "kgr pleno", kgr_score: 0.05, volume_search: 300, analise_semantica: applicable } as never,
    "kgr-pleno",
  );
  assert.equal(derived, undefined);
});
