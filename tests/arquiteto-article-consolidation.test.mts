import assert from "node:assert/strict";
import test from "node:test";
import { articleConsolidationIssues, articleDnaReadbackIssues, publishedArticleCompatibilityIssues } from "../lib/arquiteto/article-consolidation.ts";
import { confirmArticleArchitecture } from "../lib/arquiteto/architecture-confirmation.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { ArchitectKeywordSchema, ProvisionalArticleGroupSchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { adaptKeywordIdentityContext } from "../lib/arquiteto/identity-context.ts";
import { importArticlesToRadar } from "../lib/editorial/operational-flow.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";

function keyword(id: string, text: string, extras: Record<string, unknown> = {}) {
  const source = {
    id, keyword: text, intent: "informational", volume_search: 120, results_allintitle: 0, kgr_score: null,
    lista_id: "silo-1", silo_id: "silo-1", siloName: "Conteúdo", status: "aprovado", isPublished: false,
    slug_sugerido: null, publishedUrl: null, url: null, canonical: null,
    analise_semantica: { intencao_principal: "informational", entidade_central: "clínica", ...extras }, ...extras,
  };
  return ArchitectKeywordSchema.parse({ ...source, ...adaptKeywordIdentityContext(source) });
}

function group(primaryPolicy?: string) {
  const principal = keyword("kw-1", "captação de pacientes", primaryPolicy ? { isPublished: true, status: "publicado", slug_sugerido: "captacao-de-pacientes", publishedUrl: "https://example.com/captacao-de-pacientes", url: "https://example.com/captacao-de-pacientes", canonical: "https://example.com/captacao-de-pacientes", analise_semantica: { primary_keyword_policy: primaryPolicy } } : {});
  const support = keyword("kw-2", "atrair pacientes");
  return ProvisionalArticleGroupSchema.parse({
    id: "group-1", keywordIds: [principal.id, support.id], keywords: [principal, support],
    publishedAnchorId: principal.isPublished ? principal.id : null, suggestedSiloId: "silo-1", suggestedSiloName: "Conteúdo",
    evidence: { lexical: 0.8, intent: 0.9, entities: 0.8, silo: 1, combined: 0.85 }, confidence: 0.9, alerts: [],
    principalSuggestion: { keywordId: principal.id, score: 0.9, breakdown: { cobertura: 0.9, intencao: 0.9, centralidadeSemantica: 0.9, aderenciaMarca: 0.8, potencialComercial: 0.5, volume: 1, dificuldade: 0.5, qualidadeSlug: 0.8, ancoraPublicada: principal.isPublished ? 1 : 0, serp: null }, justificativa: ["fixture"], pendencias: [] },
    roles: { [principal.id]: "principal", [support.id]: "secundaria" }, suggestedHierarchy: "Pilar",
  });
}

function envelope(payload: ArticleDNA, versionId = "article-v1"): VersionEnvelope<ArticleDNA> {
  return { versionId, entityId: payload.articleId, versionNumber: 1, previousVersionId: null, contentHash: "legacy:article-fixture", origin: "system", changeReason: "fixture", createdAt: "2026-08-25T12:00:00.000Z", createdBy: "fixture", payload };
}

function article(primaryPolicy?: string) {
  const payload = deterministicArticleDnaPayload(group(primaryPolicy), "brand-1");
  return { ...payload, serpAssessmentRef: { entityId: "serp-assessment-1", versionId: "serp-assessment-1:v1", contentHash: "legacy:serp-fixture" } } as ArticleDNA;
}

test("gate exige principal, refs completas, revisão IA, conflitos e SERP", () => {
  const candidate = envelope(article());
  assert.deepEqual(articleConsolidationIssues({ candidate }), []);
  assert.match(articleConsolidationIssues({ candidate, pendingAiReviewCount: 1 }).join(" "), /IA/);
  assert.match(articleConsolidationIssues({ candidate, unresolvedConflictCount: 1 }).join(" "), /conflitos/);
  assert.match(articleConsolidationIssues({ candidate: envelope({ ...candidate.payload, serpAssessmentRef: undefined } as ArticleDNA) }).join(" "), /SERP/);
  assert.match(articleConsolidationIssues({ candidate: envelope({ ...candidate.payload, secondaryKeywordIds: ["kw-missing"] } as ArticleDNA) }).join(" "), /papéis/);
  assert.match(articleConsolidationIssues({ candidate, compatiblePublishedBaselines: [envelope(article("unknown"), "published-v1")] }).join(" "), /publicado compatível/);
  assert.equal(publishedArticleCompatibilityIssues(["kw-1"], candidate.payload.articleId, [envelope(article("unknown"), "published-v1")]).length, 1);
});

test("publicado locked e unknown não trocam principal; reviewable permite sucessora sem tocar identidade", async () => {
  const locked = envelope(article("locked"));
  const lockedSuccessor = await confirmArticleArchitecture(locked, "kw-2", "human-1", "2026-08-25T12:01:00.000Z");
  assert.match(articleConsolidationIssues({ candidate: lockedSuccessor, publishedBaseline: locked }).join(" "), /Principal publicada protegida/);

  const reviewable = envelope(article("reviewable"));
  const reviewableSuccessor = await confirmArticleArchitecture(reviewable, "kw-2", "human-1", "2026-08-25T12:02:00.000Z");
  assert.deepEqual(articleConsolidationIssues({ candidate: reviewableSuccessor, publishedBaseline: reviewable }), []);
  assert.equal(reviewableSuccessor.payload.publishedIdentityRef?.publishedUrl, reviewable.payload.publishedIdentityRef?.publishedUrl);
  assert.equal(reviewableSuccessor.payload.suggestedSlug, reviewable.payload.suggestedSlug);
  assert.equal(reviewableSuccessor.payload.canonical, reviewable.payload.canonical);

  const unknown = envelope(article("unknown"));
  const unknownSuccessor = await confirmArticleArchitecture(unknown, "kw-2", "human-1", "2026-08-25T12:03:00.000Z");
  assert.match(articleConsolidationIssues({ candidate: unknownSuccessor, publishedBaseline: unknown }).join(" "), /Principal publicada protegida pela política unknown/);
});

test("readback exige versão, hash, identidade e status approved", () => {
  const expected = envelope(article());
  const readback = { articleDnas: [expected], statuses: [{ versionId: expected.versionId, status: "approved" }] };
  assert.deepEqual(articleDnaReadbackIssues(expected, readback), []);
  assert.match(articleDnaReadbackIssues(expected, { articleDnas: [], statuses: [] }).join(" "), /readback F5/);
  assert.match(articleDnaReadbackIssues(expected, { articleDnas: [expected], statuses: [{ versionId: expected.versionId, status: "proposed" }] }).join(" "), /approved/);
});

test("handoff existente do Radar recebe refs individuais, métricas, SERP e proveniência do ArticleDNA", async () => {
  const payload = article();
  const version = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "consolidação fixture", createdBy: "human-1", payload });
  const items = importArticlesToRadar([], [version], "brand-1");
  const item = items[0];
  assert.ok(item);
  assert.deepEqual(item.arquitetoKeywordDnaReferences?.map(reference => reference.keywordId), ["kw-1", "kw-2"]);
  assert.equal(item.arquitetoKeywordDnaReferences?.[0]?.volume, 120);
  assert.equal(item.articleDnaVersionId, version.versionId);
  assert.equal(item.articleDnaContentHash, version.contentHash);
  assert.equal(item.arquitetoStrategyContext?.articleId, payload.articleId);
  assert.equal(payload.serpAssessmentRef?.entityId, "serp-assessment-1");
});
