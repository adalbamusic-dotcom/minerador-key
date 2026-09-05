import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANONICAL_IMPORTABILITY,
  MINERADOR_ARQUITETO_RECEIVED_STATE,
  resolveCanonicalMineradorArquitetoImportEligibility,
} from "../lib/arquiteto/minerador-handoff.ts";
import { resolveArticleSiloReadiness } from "../lib/arquiteto/article-phase.ts";
import { deriveArticleProcessReadModel } from "../lib/arquiteto/article-process-read-model.ts";
import { isNoOpKeywordArticleDecision } from "../lib/arquiteto/keyword-article-review.ts";
import { articleApprovalIssues } from "../lib/editorial/operational-flow.ts";
import type { KeywordArticleDecision } from "../lib/arquiteto/contracts.ts";

const brandId = "brand-1";
const qualification = (semanticState: "conclusive" | "non_conclusive") => ({
  versionId: "ksq-1",
  contentHash: "hash-1",
  intent: semanticState === "conclusive" ? "informational" : null,
  funnel: semanticState === "conclusive" ? "TOFU" : null,
  semanticState,
  collectedAt: "2026-08-29T00:00:00.000Z",
});

test("keyword aprovada é importável mesmo com dimensões semânticas indeterminadas", () => {
  const eligibility = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [
      { id: "kw-conclusiva", brandId, status: "aprovado", semanticQualification: qualification("conclusive") },
      { id: "kw-inconclusiva", brandId, status: "aprovado", semanticQualification: qualification("non_conclusive") },
      { id: "kw-sem-qualificacao", brandId, status: "aprovado", semanticQualification: null },
      { id: "kw-published", brandId, status: "publicado", semanticQualification: null },
    ],
    workflowItems: [],
    articleDnaKeywordIds: new Set<string>(),
  });
  const byId = new Map(eligibility.map(item => [item.keywordId, item.importability]));

  // Aprovado no Minerador é condição suficiente: sem segundo juiz semântico.
  assert.equal(byId.get("kw-conclusiva"), CANONICAL_IMPORTABILITY.IMPORTABLE);
  assert.equal(byId.get("kw-inconclusiva"), CANONICAL_IMPORTABILITY.IMPORTABLE);
  assert.equal(byId.get("kw-sem-qualificacao"), CANONICAL_IMPORTABILITY.IMPORTABLE);
  assert.equal(byId.get("kw-published"), CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED);
});

test("somente impedimentos estruturais bloqueiam a importação", () => {
  const eligibility = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [
      { id: "kw-bruto", brandId, status: "bruto", semanticQualification: qualification("conclusive") },
      { id: "kw-recebida", brandId, status: "aprovado", semanticQualification: null },
      { id: "kw-incorporada", brandId, status: "aprovado", semanticQualification: null },
      { id: "kw-workflow-incompativel", brandId, status: "aprovado", semanticQualification: null },
      { id: "kw-outra-brand", brandId: "outra-brand", status: "aprovado", semanticQualification: null },
    ],
    workflowItems: [
      { marcaId: brandId, subjectType: "keyword", subjectId: "kw-recebida", stage: "architect", state: MINERADOR_ARQUITETO_RECEIVED_STATE },
      { marcaId: brandId, subjectType: "keyword", subjectId: "kw-workflow-incompativel", stage: "architect", state: "sent_radar" },
    ],
    articleDnaKeywordIds: new Set<string>(["kw-incorporada"]),
  });
  const byId = new Map(eligibility.map(item => [item.keywordId, item.importability]));

  assert.equal(byId.get("kw-bruto"), CANONICAL_IMPORTABILITY.NOT_APPROVED);
  assert.equal(byId.get("kw-recebida"), CANONICAL_IMPORTABILITY.WORKFLOW_RECEIVED);
  assert.equal(byId.get("kw-incorporada"), CANONICAL_IMPORTABILITY.ARTICLE_DNA_INCORPORATED);
  assert.equal(byId.get("kw-workflow-incompativel"), CANONICAL_IMPORTABILITY.REMOTE_WORKFLOW_BLOCKED);
  assert.equal(byId.has("kw-outra-brand"), false);
});

test("o gate de aprovação do artigo não exige Silo nem hierarquia da etapa Silos", () => {
  const article = {
    versionId: "v1",
    payload: {
      articleId: "art-1",
      siloId: null,
      hierarchy: "Suporte",
      suggestedSlug: "cleansing-oil-hada-labo",
      keywordReferences: [{ role: "principal", keywordId: "kw-1" }],
    },
  } as never;
  const issues = articleApprovalIssues(article, []);

  assert.equal(issues.some(issue => issue.toLowerCase().includes("silo")), false);
  assert.deepEqual(issues, ["A versão ainda não recebeu aprovação humana."]);
});

test("Pronto para Silos exige o fechamento da fase Artigos, não a existência de Silo", () => {
  const base = {
    hasArticleDna: true,
    siloAssigned: false,
    reviewPending: false,
    unresolvedConflicts: 0,
    approved: true,
    kgrDecisionPending: false,
  };

  assert.equal(resolveArticleSiloReadiness(base).state, "ready");
  assert.equal(resolveArticleSiloReadiness(base).label, "Pronto para Silos");
  assert.equal(resolveArticleSiloReadiness({ ...base, hasArticleDna: false }).state, "not_started");
  assert.equal(resolveArticleSiloReadiness({ ...base, siloAssigned: true }).state, "assigned");

  const inReview = resolveArticleSiloReadiness({ ...base, reviewPending: true, approved: false });
  assert.equal(inReview.state, "blocked");
  assert.notEqual(inReview.label, "Pronto para Silos");
  assert.equal(inReview.reasons.length, 2);
  assert.equal(resolveArticleSiloReadiness({ ...base, unresolvedConflicts: 1 }).state, "blocked");
  assert.equal(resolveArticleSiloReadiness({ ...base, kgrDecisionPending: true }).state, "blocked");
});

const decision = (overrides: Partial<KeywordArticleDecision> = {}): KeywordArticleDecision => ({
  keywordId: "kw-1",
  sourceGroupId: "group-1",
  action: "manter_no_artigo",
  targetGroupId: null,
  newArticleKey: null,
  siloPlacement: { action: "manter_silo", siloId: null, siloName: null, newSiloKey: null },
  suggestedRole: "principal",
  justification: "Encaixe atual competitivo; sem alternativa melhor no catálogo.",
  confidence: 0.9,
  humanDecisionPoints: [],
  ...overrides,
});

test("proposta da IA sem mutação não cria pendência humana; proposta real continua criando", () => {
  assert.equal(isNoOpKeywordArticleDecision(decision(), "principal"), true);
  assert.equal(isNoOpKeywordArticleDecision(decision(), undefined), true);
  assert.equal(isNoOpKeywordArticleDecision(decision(), "secundaria"), false);
  assert.equal(isNoOpKeywordArticleDecision(decision({ humanDecisionPoints: ["Confirmar principal."] }), "principal"), false);
  assert.equal(isNoOpKeywordArticleDecision(decision(), "principal", 1), false);
  assert.equal(isNoOpKeywordArticleDecision(decision({ action: "criar_novo_artigo", newArticleKey: "novo" }), "principal"), false);
  assert.equal(isNoOpKeywordArticleDecision(decision({ siloPlacement: { action: "propor_novo_silo", siloId: null, siloName: "Silo", newSiloKey: "novo" } }), "principal"), false);
});

test("execução sem mutação fica registrada como IA concluída sem propostas", () => {
  const noop = deriveArticleProcessReadModel({
    logicProcessing: false,
    hasLogicalOutput: true,
    serpProcessing: false,
    hasSerpAssessment: true,
    serpHasError: false,
    aiProcessing: false,
    pendingProposalCount: 0,
    annotations: [{ reviewState: "reviewed", structuralChange: false }],
    humanPendingDecisionCount: 0,
    reviewProcessing: false,
  });
  const structural = deriveArticleProcessReadModel({
    logicProcessing: false,
    hasLogicalOutput: true,
    serpProcessing: false,
    hasSerpAssessment: true,
    serpHasError: false,
    aiProcessing: false,
    pendingProposalCount: 0,
    annotations: [{ reviewState: "pending_fine_review" }],
    humanPendingDecisionCount: 0,
    reviewProcessing: false,
  });

  assert.equal(noop.ai.state, "COMPLETED_NO_PROPOSALS");
  assert.equal(noop.ai.proposalCount, 0);
  assert.equal(noop.review.state, "NOT_REQUIRED");
  assert.equal(noop.review.pendingCount, 0);
  assert.equal(structural.ai.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(structural.review.state, "PENDING");
});

test("promessa e CTA saem do gate estrutural e permanecem como alerta", () => {
  const adapters = readFileSync("lib/arquiteto/adapters.ts", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(adapters, /Estratégia, promessa, CTA e fronteira serão enriquecidas no Planejador\/Redator/);
  assert.doesNotMatch(adapters, /humanPendingDecisions: \["Enriquecer estratégia, promessa, CTA/);
  assert.match(workspace, /articleSiloReadinessFor\(art, articleProcess, articleKgr\)/);
  assert.match(workspace, /articleSiloReadiness\.label/);
  assert.doesNotMatch(workspace, /articleDnaVersion \? "Pronto para Silos" : "Não iniciado"/);
});
