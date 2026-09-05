import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { topicSuggestionsToRadarTopics } from "../lib/radar/r5-sequential.ts";
import {
  buildExpertTopicContext,
  buildRadarR6ConsolidatedReport,
  classifyRadarR6PlannerHandoff,
  normalizeRadarR6ReportState,
  radarR6CanApproveReport,
  radarR6TopicReviewCounts,
  RadarR6TopicSuggestionSchema,
  RADAR_R6_AUDIO_CONTRACT_READINESS,
  RADAR_R6_PLANNER_HANDOFF_CONTRACT,
  RADAR_R6_TELEGRAM_REMOTE_FOUNDATION,
  validateRadarR6TopicSuggestions,
} from "../lib/radar/r6-sequential.ts";

const keywordReference = (id: string, role: "principal" | "secundaria" = "secundaria") => ({
  keywordId: id,
  keywordDnaVersionId: `keyword-dna:${id}:v1`,
  keywordDnaContentHash: `legacy:${id}`,
  role,
  strategicContribution: "Cobertura editorial",
  coveredIntentions: ["informacional"],
  requiredTopics: [],
  excludedTopics: [],
  classificationOrigin: "legacy" as const,
  confidence: 0.8,
  humanConfirmed: true,
});

const articlePayload = (): ArticleDNA => ({
  schemaVersion: 1,
  articleId: "article-r6",
  brandId: "brand-r6",
  principalKeywordId: "keyword-principal",
  secondaryKeywordIds: ["keyword-secondary"],
  narrativeReinforcementIds: [],
  keywordReferences: [keywordReference("keyword-principal", "principal"), keywordReference("keyword-secondary")],
  siloId: "silo-r6",
  hierarchy: "Suporte",
  suggestedSlug: "artigo-r6",
  canonical: null,
  mainIntent: "informacional",
  auxiliaryIntents: [],
  audience: "Gestores",
  problem: "Falta de clareza",
  desiredResult: "Tomar uma decisão melhor",
  journeyStage: "consideração",
  brandObjective: "Construir autoridade",
  promise: "Decisão orientada por evidências",
  angle: "Experiência prática",
  cta: "Continuar a avaliação",
  coverage: ["critérios", "experiência"],
  excludedSubjects: [],
  antiCannibalizationBoundary: "Não substituir artigos próximos",
  nearbyArticleIds: [],
  differentiation: [],
  entities: ["decisão"],
  requiredTopics: ["critérios"],
  questions: ["Como decidir?"],
  objections: [],
  evidenceNeeded: ["exemplo prático"],
  sourcesNeeded: ["referência técnica"],
  internalLinks: [],
  alerts: [],
  confidence: 0.8,
  humanPendingDecisions: [],
});

async function articleEnvelope(): Promise<VersionEnvelope<ArticleDNA>> {
  return createVersionEnvelope({ entityId: "article-r6", versionNumber: 2, origin: "human", changeReason: "R6 test", createdBy: "human-r6", payload: articlePayload() });
}

test("R6 constrói um contexto canônico sem inventar IDs e preserva as fontes reais", async () => {
  const article = await articleEnvelope();
  const context = buildExpertTopicContext("article-r6", {
    brandId: "brand-r6",
    article,
    serp: {
      reviewed: true,
      snapshotId: "snapshot-real-r6",
      snapshotVersion: 2,
      analysisVersionId: "analysis-r6-v1",
      needs: ["Critério pouco coberto"],
      openGaps: ["Exemplo prático"],
      conflicts: ["Formato divergente"],
      approvedReferences: [{ position: 1, title: "Referência aprovada", url: "https://example.com/referencia", role: "primary" }],
    },
    existingContent: [{ id: "existing-r6", kind: "YOUTUBE", label: "Palestra do especialista", reference: "https://youtube.com/watch?v=r6", state: "LINK_REGISTERED" }],
  });
  assert.equal(context.articleId, "article-r6");
  assert.equal(context.brandId, "brand-r6");
  assert.equal(context.articleDnaVersionId, article.versionId);
  assert.equal(context.serpSnapshotId, "snapshot-real-r6");
  assert.equal(context.approvedReferences[0]?.url, "https://example.com/referencia");
  assert.equal(context.existingContentItems[0]?.id, "existing-r6");
  assert.ok(context.provenance.some(source => source.referenceId === article.versionId));
  assert.ok(!context.provenance.some(source => source.referenceId?.includes("topic")));
});

test("R6 preserva proveniência combinada e conta a revisão individual das pautas", () => {
  const topics = topicSuggestionsToRadarTopics("article-r6", [{
    text: "Qual critério você usa na prática?",
    origin: "SERP",
    origins: ["SERP", "AMAZON"],
    justification: "A pergunta combina uma lacuna SERP e um critério Amazon observado.",
    need: "Critério de decisão pouco coberto",
    reference: "Snapshot SERP v2 / análise Radar",
  }]);
  assert.deepEqual(topics[0]?.provenance?.origins, ["SERP", "AMAZON"]);
  assert.equal(topics[0]?.provenance?.reference, "Snapshot SERP v2 / análise Radar");
  assert.deepEqual(radarR6TopicReviewCounts(topics, []), { total: 1, reviewed: 0, pending: 1 });
  assert.deepEqual(radarR6TopicReviewCounts(topics, [topics[0]!.id]), { total: 1, reviewed: 1, pending: 0 });
});

test("R6 rejeita pauta repetida, conhecida ou sem referência recebida", async () => {
  const context = buildExpertTopicContext("article-r6", {
    brandId: "brand-r6",
    article: await articleEnvelope(),
    serp: {
      snapshotId: "snapshot-real-r6",
      snapshotVersion: 2,
      approvedReferences: [{ position: 1, title: "Referência aprovada", url: "https://example.com/referencia", role: "primary" }],
    },
  });
  const suggestion = RadarR6TopicSuggestionSchema.parse({
    text: "Como comparar critérios na prática?",
    origin: "SERP",
    origins: ["SERP"],
    justification: "A lacuna exige uma pergunta objetiva para o especialista.",
    need: "Critério de decisão pouco coberto",
    reference: "Snapshot SERP v2 / análise Radar",
  });
  assert.doesNotThrow(() => validateRadarR6TopicSuggestions(context, [suggestion]));
  assert.throws(() => validateRadarR6TopicSuggestions(context, [suggestion, suggestion]), /repete/i);
  assert.throws(() => validateRadarR6TopicSuggestions(context, [{ ...suggestion, reference: "https://fora-do-contexto.example" }]), /referência ausente/i);
});

test("R6 separa geração, revisão e aprovação e não finaliza com especialista pendente", async () => {
  const article = await articleEnvelope();
  assert.equal(normalizeRadarR6ReportState({ localState: "READY_FOR_REVIEW" }), "REPORT_GENERATED");
  const waiting = buildRadarR6ConsolidatedReport({
    brandId: "brand-r6",
    articleId: "article-r6",
    article,
    state: "REPORT_GENERATED",
    serp: { reviewed: true, snapshotId: "snapshot-r6", analysisVersionId: "analysis-r6", needs: ["Lacuna"] },
    expert: { required: true, evidence: [] },
  });
  assert.equal(waiting?.final, false);
  assert.match(waiting?.pendingContributions.join(" ") || "", /especialista/i);
  assert.equal(radarR6CanApproveReport(waiting), false);
  const withoutExpert = buildRadarR6ConsolidatedReport({
    brandId: "brand-r6",
    articleId: "article-r6",
    article,
    state: "REPORT_REVIEWED",
    serp: { reviewed: true, snapshotId: "snapshot-r6" },
    expert: { required: false, evidence: [] },
  });
  assert.equal(withoutExpert?.final, false);
  assert.equal(radarR6CanApproveReport(withoutExpert), true);
});

test("R6 classifica o handoff sem alterar o contrato do Planejador", () => {
  assert.equal(classifyRadarR6PlannerHandoff({ includesAmazonOrExpertEvidence: false, existingPackageSupportsSupplement: false }), "COMPATIBLE");
  assert.equal(classifyRadarR6PlannerHandoff({ includesAmazonOrExpertEvidence: true, existingPackageSupportsSupplement: false }), "STRUCTURAL_CHANGE_REQUIRED");
  assert.equal(RADAR_R6_PLANNER_HANDOFF_CONTRACT, "STRUCTURAL_CHANGE_REQUIRED");
  assert.equal(RADAR_R6_TELEGRAM_REMOTE_FOUNDATION, "PARTIAL");
  assert.equal(RADAR_R6_AUDIO_CONTRACT_READINESS, "IMPLEMENTED_NOT_SMOKED");
});

test("R6 mantém DeepSeek/Telegram e mídia fora do render automático", () => {
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/editorial/radar-topics/route.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../modules/radar/radar-r3-specialist-panel.tsx", import.meta.url), "utf8");
  assert.match(route, /resolveDeepSeekCanonicalConfig/);
  assert.match(route, /generateStructuredAI/);
  assert.match(route, /3 a 5/);
  assert.doesNotMatch(page, /useEffect\([^]*collectSerp/);
  assert.doesNotMatch(panel, /fetch\(/);
  assert.match(panel, /LINK_REGISTERED/);
  assert.match(panel, /AWAITING_FILE/);
});
