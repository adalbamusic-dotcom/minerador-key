import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FULL_KGR_THRESHOLD,
  readArticleKgrDecision,
  resolveArticleKgrSerpReadout,
} from "../lib/arquiteto/article-kgr-decision.ts";
import { readArticleExpandedPanelKeywordFacts } from "../lib/arquiteto/article-expanded-panel.ts";
import { deriveArticleKgrIdentity } from "../lib/arquiteto/strategic-context.ts";
import { ArticleKgrIdentitySchema } from "../lib/arquiteto/contracts.ts";

const applicable = { kgr_aplicabilidade: "applicable" };
const notApplicable = { kgr_aplicabilidade: "not_applicable" };

test("score válido menor que 0.25 é KGR pleno e não pede decisão humana", () => {
  for (const score of [0, 0.1, 0.249]) {
    const decision = readArticleKgrDecision({ principal: { kgr: score, analise_semantica: applicable } });

    assert.equal(decision.decision, "YES", `score ${score}`);
    assert.equal(decision.source, "FULL_KGR_RULE");
    assert.equal(decision.label, "Sim · KGR pleno");
    assert.equal(decision.tone, "success");
    assert.equal(decision.fullKgr, true);
    assert.equal(decision.requiresHumanDecision, false);
    assert.equal(decision.principalKgrScore, score);
  }
  assert.equal(FULL_KGR_THRESHOLD, 0.25);
});

test("0.25 exato não é KGR pleno e, com Principal aplicável, vira decisão humana", () => {
  const limit = readArticleKgrDecision({ principal: { kgr: 0.25, analise_semantica: applicable } });
  const higher = readArticleKgrDecision({ principal: { kgr: 0.656, analise_semantica: applicable } });

  for (const decision of [limit, higher]) {
    assert.equal(decision.decision, "PENDING_HUMAN_DECISION");
    assert.equal(decision.source, "AWAITING_HUMAN_DECISION");
    assert.equal(decision.label, "A decidir");
    assert.equal(decision.fullKgr, false);
    assert.equal(decision.requiresHumanDecision, true);
  }
  assert.equal(limit.principalKgrScore, 0.25);
  assert.equal(higher.principalKgrScore, 0.656);
});

test("não pleno com Principal não aplicável é Não, e com aplicabilidade pendente permanece Pendente", () => {
  const refused = readArticleKgrDecision({ principal: { kgr: 0.4, analise_semantica: notApplicable } });
  const pending = readArticleKgrDecision({ principal: { kgr_score: 0.9, analise_semantica: { kgr_aplicabilidade: "pending" } } });
  const noSemantic = readArticleKgrDecision({ principal: { kgr: 0.31 } });

  assert.equal(refused.decision, "NO");
  assert.equal(refused.source, "KEYWORD_APPLICABILITY_RULE");
  assert.equal(refused.label, "Não");
  assert.equal(pending.decision, "PENDING_APPLICABILITY");
  assert.equal(pending.source, "AWAITING_KEYWORD_APPLICABILITY");
  assert.equal(pending.label, "Pendente");
  assert.equal(noSemantic.decision, "PENDING_APPLICABILITY");
  assert.equal(noSemantic.requiresHumanDecision, false);
});

test("score ausente permanece ausente e nunca vira zero", () => {
  const absent = readArticleKgrDecision({ principal: { kgr: null, kgr_score: null, analise_semantica: applicable } });
  const missing = readArticleKgrDecision({ principal: { analise_semantica: applicable } });
  const invalid = readArticleKgrDecision({ principal: { kgr: -1, analise_semantica: applicable } });

  for (const decision of [absent, missing, invalid]) {
    assert.equal(decision.decision, "ABSENT");
    assert.equal(decision.source, "MISSING_KGR_SCORE");
    assert.equal(decision.label, "—");
    assert.equal(decision.principalKgrScore, null);
    assert.equal(decision.fullKgr, false);
  }
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
  assert.equal(singleSupport.decision, "PENDING_APPLICABILITY");
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

test("decisão humana registrada e vínculo confirmado prevalecem sobre a inferência", () => {
  const humanNo = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: false, source: "human_confirmation", bindingStatus: "not_applicable", status: "not_kgr" },
    principal: { kgr: 0.656, analise_semantica: applicable },
  });
  const humanYes = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "human_confirmation", bindingStatus: "candidate", status: "candidate" },
    principal: { kgr: 0.656, analise_semantica: applicable },
  });
  const candidate = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "minerador", bindingStatus: "candidate", status: "candidate" },
    principal: { kgr: 0.656, analise_semantica: applicable },
  });

  assert.equal(humanNo.decision, "NO");
  assert.equal(humanNo.source, "HUMAN_DECISION");
  assert.equal(humanYes.decision, "YES");
  assert.equal(humanYes.label, "Sim");
  assert.equal(candidate.decision, "PENDING_HUMAN_DECISION");
});

test("recomendação SERP existe apenas para artigo não pleno com Principal aplicável e evidência real", () => {
  const pendingDecision = readArticleKgrDecision({ principal: { kgr: 0.656, analise_semantica: applicable } });
  const fullKgr = readArticleKgrDecision({ principal: { kgr: 0.1, analise_semantica: applicable } });
  const observation = { competition: "baixa" as const, compatibility: "coerente" as const, conflict: false, insufficientEvidence: false, likelyCannibalization: "unlikely" as const };

  const favourable = resolveArticleKgrSerpReadout({
    decision: pendingDecision,
    competitionLevel: "baixa",
    intentCompatibility: "coerente",
    evidencePriority: "prioritaria",
    principalObservation: observation,
  });
  const unfavourable = resolveArticleKgrSerpReadout({
    decision: pendingDecision,
    competitionLevel: "alta",
    intentCompatibility: "coerente",
    evidencePriority: "prioritaria",
    principalObservation: { ...observation, competition: "alta" },
  });
  const inconclusive = resolveArticleKgrSerpReadout({
    decision: pendingDecision,
    competitionLevel: "media",
    intentCompatibility: "parcialmente_coerente",
    evidencePriority: "prioritaria",
    principalObservation: { ...observation, competition: "media", compatibility: "parcialmente_coerente" },
  });
  const insufficient = resolveArticleKgrSerpReadout({
    decision: pendingDecision,
    competitionLevel: "baixa",
    intentCompatibility: "coerente",
    evidencePriority: "insuficiente",
    principalObservation: { ...observation, insufficientEvidence: true },
  });
  const noObservation = resolveArticleKgrSerpReadout({
    decision: pendingDecision,
    competitionLevel: "desconhecida",
    intentCompatibility: "insuficiente",
    evidencePriority: "insuficiente",
    principalObservation: null,
  });
  const fullKgrReadout = resolveArticleKgrSerpReadout({
    decision: fullKgr,
    competitionLevel: "baixa",
    intentCompatibility: "coerente",
    evidencePriority: "prioritaria",
    principalObservation: observation,
  });

  assert.equal(favourable?.recommendationLabel, "Favorável");
  assert.equal(favourable?.principalKgrScore, 0.656);
  assert.equal(favourable?.principalApplicabilityLabel, "Aplicável");
  assert.equal(favourable?.competitionLabel, "Baixa");
  assert.equal(favourable?.evidenceStrengthLabel, "Prioritária");
  assert.equal(unfavourable?.recommendationLabel, "Desfavorável");
  assert.equal(inconclusive?.recommendationLabel, "Inconclusiva");
  assert.equal(insufficient?.recommendationLabel, "Inconclusiva");
  assert.equal(noObservation, null);
  assert.equal(fullKgrReadout, null);
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
  assert.match(workspace, /articleKgr\.requiresHumanDecision/);
  assert.match(workspace, /não substitui nem reutiliza o select de aplicabilidade do KeywordDNA/);
  assert.doesNotMatch(workspace, /expandedPanelSummary\.kgr\.label/);
});

test("decisão humana da Principal anterior é reavaliada quando a Principal muda", () => {
  const stale = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "human_confirmation", bindingStatus: "candidate", status: "candidate", primaryKeywordId: "kw-anterior", decision: "YES", decisionSource: "HUMAN_DECISION" },
    principalKeywordId: "kw-nova",
    principal: { kgr: 0.5, analise_semantica: applicable },
  });
  assert.equal(stale.decision, "PENDING_HUMAN_DECISION");
  assert.equal(stale.source, "AWAITING_HUMAN_DECISION");
});

test("envelope humano preserva a base da Principal e a troca de Principal reavalia o estado", () => {
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
    { id: "keyword-b", keyword: "nova principal", kgr_score: 0.25, analise_semantica: applicable, keywordDnaRef: { entityId: "keyword-dna-b", versionId: "keyword-dna-b:v3", contentHash: "legacy:hash-b" } } as never,
    "nova-principal",
  );

  assert.equal(next?.decision, "PENDING_HUMAN_DECISION");
  assert.equal(next?.decisionSource, "AWAITING_HUMAN_DECISION");
  assert.equal(next?.primaryKeywordId, "keyword-b");
  assert.equal(next?.principalKeywordDnaVersionId, "keyword-dna-b:v3");
  assert.equal(next?.principalKeywordDnaContentHash, "legacy:hash-b");
  assert.equal(next?.principalKgrApplicability, "applicable");
  assert.equal(next?.decisionHistory?.[0]?.decision, "NO");
});
