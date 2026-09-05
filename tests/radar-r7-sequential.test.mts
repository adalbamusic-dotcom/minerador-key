import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import {
  buildExpertTopicContext,
  buildRadarR6ConsolidatedReport,
  radarR6CanApproveReport,
} from "../lib/radar/r6-sequential.ts";
import {
  buildRadarR7LocalAudioPipeline,
  buildRadarR7LocalTextPipeline,
  buildRadarR7StateMatrix,
  parseRadarR7TopicResponse,
  preserveRadarR7TopicsOnFailure,
  radarR7ReportEvidenceFingerprint,
  RADAR_R7_AUDIO_PIPELINE_READINESS,
  RADAR_R7_DEEPSEEK_REAL_SMOKE,
  RADAR_R7_LOCAL_WORKER_READINESS,
  RADAR_R7_PLANNER_ADAPTER,
  RADAR_R7_PLANNER_CONTRACT_AUDIT,
  RADAR_R7_TELEGRAM_REMOTE_FOUNDATION,
  RADAR_R7_TEXT_PIPELINE_READINESS,
  RADAR_R7_TRANSCRIPT_IMMUTABILITY,
} from "../lib/radar/r7-sequential.ts";

const keywordReference = (id: string, role: "principal" | "secundaria" = "secundaria") => ({
  keywordId: id,
  keywordDnaVersionId: `keyword-dna:${id}:v1`,
  keywordDnaContentHash: `hash:${id}`,
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
  articleId: "article-r7-marketing",
  brandId: "brand-r7",
  principalKeywordId: "keyword-r7-principal",
  secondaryKeywordIds: ["keyword-r7-secondary"],
  narrativeReinforcementIds: [],
  keywordReferences: [keywordReference("keyword-r7-principal", "principal"), keywordReference("keyword-r7-secondary")],
  siloId: "silo-r7",
  hierarchy: "Suporte",
  suggestedSlug: "marketing-online",
  canonical: null,
  mainIntent: "informacional",
  auxiliaryIntents: [],
  audience: "Gestores de pequenas empresas",
  problem: "Falta de clareza para priorizar ações de marketing online",
  desiredResult: "Escolher critérios e executar uma decisão melhor",
  journeyStage: "consideração",
  brandObjective: "Construir autoridade",
  promise: "Como avaliar marketing online com critérios claros",
  angle: "Experiência prática",
  cta: "Continuar a avaliação",
  coverage: ["critérios", "experiência prática"],
  excludedSubjects: [],
  antiCannibalizationBoundary: "Não substituir artigos próximos",
  nearbyArticleIds: [],
  differentiation: [],
  entities: ["marketing online", "critérios"],
  requiredTopics: ["critérios de decisão"],
  questions: ["Como comparar alternativas?"],
  objections: [],
  evidenceNeeded: ["exemplo prático"],
  sourcesNeeded: ["referência técnica"],
  internalLinks: [],
  alerts: [],
  confidence: 0.8,
  humanPendingDecisions: [],
});

async function contextFixture() {
  const article = await createVersionEnvelope({
    entityId: "article-r7-marketing",
    versionNumber: 3,
    origin: "human",
    changeReason: "R7 test",
    createdBy: "human-r7",
    payload: articlePayload(),
  });
  return buildExpertTopicContext("article-r7-marketing", {
    brandId: "brand-r7",
    article,
    serp: {
      reviewed: true,
      snapshotId: "snapshot-r7-real",
      snapshotVersion: 4,
      analysisVersionId: "analysis-r7-v2",
      needs: ["Critérios de decisão pouco cobertos"],
      openGaps: ["Exemplo prático de comparação"],
      conflicts: [],
      approvedReferences: [{ position: 1, title: "Referência aprovada de marketing", url: "https://example.com/marketing", role: "primary" }],
    },
  });
}

function suggestions() {
  return [1, 2, 3].map(index => ({
    text: `Como comparar critérios de marketing na prática ${index}?`,
    origin: "SERP" as const,
    origins: ["SERP"] as const,
    justification: "A lacuna da SERP pede uma experiência prática do especialista.",
    need: "Critérios de decisão pouco cobertos",
    reference: "Referência aprovada de marketing",
  }));
}

test("R7 valida o contexto real do artigo e isola a fixture médica", async () => {
  const context = await contextFixture();
  const serialized = JSON.stringify(context);
  assert.equal(context.articleId, "article-r7-marketing");
  assert.equal(context.brandId, "brand-r7");
  assert.equal(context.serpSnapshotId, "snapshot-r7-real");
  assert.ok(context.articleDnaVersionId.length > 0);
  assert.doesNotMatch(serialized, /paciente|procedimento|dermat|cl[ií]nica/i);
  assert.doesNotMatch(serialized, /expert-evidence-fixture|topic-fixture/);
});

test("R7 aceita somente 3 a 5 pautas relacionadas e com proveniência", async () => {
  const context = await contextFixture();
  const parsed = parseRadarR7TopicResponse(context, { topics: suggestions() });
  assert.equal(parsed.length, 3);
  const five = [...suggestions(), { ...suggestions()[0], text: "Como registrar uma decisão de marketing online 4?" }, { ...suggestions()[1], text: "Como revisar uma escolha de marketing online 5?" }];
  assert.equal(parseRadarR7TopicResponse(context, { topics: five }).length, 5);
  assert.throws(() => parseRadarR7TopicResponse(context, { topics: [suggestions()[0]] }), /too_small|min|3/i);
  assert.throws(() => parseRadarR7TopicResponse(context, { topics: [suggestions()[0], suggestions()[0], suggestions()[2]] }), /repete/i);
  assert.throws(() => parseRadarR7TopicResponse(context, { topics: suggestions().map(item => ({ ...item, reference: "https://outside.example" })) }), /referência ausente/i);
  assert.throws(() => parseRadarR7TopicResponse(context, { topics: suggestions().map(item => ({ ...item, need: "Jardim botânico e jardinagem" })) }), /relacionada/i);
  assert.throws(() => parseRadarR7TopicResponse(context, { topics: suggestions().map(item => ({ ...item, origin: "AMAZON", origins: ["AMAZON"] })) }), /fora do contexto/i);
  assert.throws(() => parseRadarR7TopicResponse(context, { topics: suggestions().slice(0, 2) }), /3/i);
  assert.throws(() => parseRadarR7TopicResponse(context, { topics: "resposta truncada" }), /invalid|expected/i);
});

test("R7 preserva pautas válidas quando uma tentativa de IA falha", async () => {
  const context = await contextFixture();
  const current = {
    state: "TOPICS_READY_FOR_REVIEW" as const,
    items: [{ id: "topic-valid-r7", text: "Pauta válida", source: "SERP", sourceType: "SERP" as const }],
    context,
    reviewedIds: ["topic-valid-r7"],
  };
  const preserved = preserveRadarR7TopicsOnFailure(current, null);
  assert.equal(preserved.state, "FAILED_RETRYABLE");
  assert.deepEqual(preserved.items, current.items);
  assert.deepEqual(preserved.reviewedIds, current.reviewedIds);
  assert.equal(preserved.context, context);
});

test("R7 explicita a matriz de estados e não chama estado local de persistido", () => {
  const matrix = buildRadarR7StateMatrix({
    serp: { hasRealSnapshot: true, reviewed: true, persisted: true },
    amazon: { state: "AMAZON_PENDING", hasEvidence: false, persisted: false },
    content: { hasArticleDna: true, hasLocalRows: true, persisted: true },
    specialist: { hasLocalTopics: true, hasRemoteContribution: false, fixtureMode: false },
    report: { state: "REPORT_GENERATED", generatedLocally: true, approvedLocally: false, stale: false },
  });
  assert.deepEqual(matrix.find(item => item.area === "SERP")?.classifications, ["DERIVED_FROM_REAL_DATA", "PERSISTED", "RECONSTRUCTIBLE"]);
  assert.deepEqual(matrix.find(item => item.area === "AMAZON")?.classifications, ["LOCAL_ONLY"]);
  assert.deepEqual(matrix.find(item => item.area === "ESPECIALISTA")?.classifications, ["LOCAL_ONLY"]);
  assert.match(matrix.find(item => item.area === "RELATORIO")?.userFacingLabel || "", /Prévia local/);
});

test("R7 cobre os cenários A-D do relatório sem inventar evidências", async () => {
  const article = await createVersionEnvelope({ entityId: "article-r7-marketing", versionNumber: 3, origin: "human", changeReason: "report", createdBy: "human-r7", payload: articlePayload() });
  const base = { brandId: "brand-r7", articleId: "article-r7-marketing", article, serp: { reviewed: true, snapshotId: "snapshot-r7-real", analysisVersionId: "analysis-r7-v2", references: ["https://example.com/marketing"], needs: ["Critérios de decisão"] } };
  const scenarioA = buildRadarR6ConsolidatedReport({ ...base, state: "REPORT_REVIEWED", amazon: { state: "AMAZON_NOT_APPLICABLE", reviewed: false }, expert: { required: false, evidence: [] } });
  assert.equal(scenarioA?.pendingContributions.length, 0);
  assert.equal(scenarioA?.evidence.expert.contributionIds.length, 0);
  assert.equal(scenarioA ? scenarioA.final : null, false);
  assert.equal(radarR6CanApproveReport(scenarioA), true);
  const scenarioB = buildRadarR6ConsolidatedReport({ ...base, state: "REPORT_GENERATED", expert: { required: true, evidence: [] } });
  assert.match(scenarioB?.pendingContributions.join(" ") || "", /especialista/i);
  const scenarioC = buildRadarR6ConsolidatedReport({ ...base, state: "REPORT_REVIEWED", expert: { required: true, evidence: [{ id: "expert-evidence-r7", summary: "Experiência prática revisada", reviewed: true }] } });
  assert.equal(scenarioC?.pendingContributions.length, 0);
  assert.equal(scenarioC?.evidence.expert.contributionIds[0], "expert-evidence-r7");
  assert.equal(scenarioC ? scenarioC.final : null, false);
  assert.equal(radarR6CanApproveReport(scenarioC), true);
  const scenarioD = buildRadarR6ConsolidatedReport({ ...base, state: "REPORT_REVIEWED", amazon: { state: "AMAZON_PENDING", reviewed: false }, expert: { required: false, evidence: [] } });
  assert.match(scenarioD?.pendingContributions.join(" ") || "", /Amazon/i);
  assert.equal(scenarioD ? scenarioD.final : null, false);
});

test("R7 reabre a revisão quando nova evidência aparece após aprovação local", async () => {
  const article = await createVersionEnvelope({ entityId: "article-r7-marketing", versionNumber: 3, origin: "human", changeReason: "report", createdBy: "human-r7", payload: articlePayload() });
  const approved = buildRadarR6ConsolidatedReport({ brandId: "brand-r7", articleId: "article-r7-marketing", article, state: "REPORT_APPROVED", serp: { reviewed: true, snapshotId: "snapshot-r7-real", analysisVersionId: "analysis-r7-v2", references: ["https://example.com/marketing"] }, expert: { required: false, evidence: [] } });
  const fingerprint = radarR7ReportEvidenceFingerprint(approved);
  const changed = buildRadarR6ConsolidatedReport({ brandId: "brand-r7", articleId: "article-r7-marketing", article, state: "REPORT_APPROVED", approvedEvidenceFingerprint: fingerprint, serp: { reviewed: true, snapshotId: "snapshot-r7-real", analysisVersionId: "analysis-r7-v2", references: ["https://example.com/marketing", "https://example.com/new-evidence"] }, expert: { required: false, evidence: [] } });
  assert.equal(changed?.stale, true);
  assert.equal(changed?.state, "REPORT_GENERATED");
  assert.equal(changed?.final, false);
  assert.match(changed?.pendingContributions.join(" ") || "", /evidên/i);
});

test("R7 reabre quando a mesma contribuição ganha conteúdo novo", async () => {
  const article = await createVersionEnvelope({ entityId: "article-r7-marketing", versionNumber: 3, origin: "human", changeReason: "report", createdBy: "human-r7", payload: articlePayload() });
  const baseEvidence = [{ id: "expert-evidence-r7", contributionId: "contribution-r7", summary: "Critério inicial", reviewed: true, decision: "accepted" as const }];
  const approved = buildRadarR6ConsolidatedReport({ brandId: "brand-r7", articleId: "article-r7-marketing", article, state: "REPORT_APPROVED", serp: { reviewed: true, snapshotId: "snapshot-r7-real", analysisVersionId: "analysis-r7-v2", references: ["https://example.com/marketing"] }, expert: { required: false, evidence: baseEvidence } });
  const fingerprint = radarR7ReportEvidenceFingerprint(approved);
  const changed = buildRadarR6ConsolidatedReport({ brandId: "brand-r7", articleId: "article-r7-marketing", article, state: "REPORT_APPROVED", approvedEvidenceFingerprint: fingerprint, serp: { reviewed: true, snapshotId: "snapshot-r7-real", analysisVersionId: "analysis-r7-v2", references: ["https://example.com/marketing"] }, expert: { required: false, evidence: [{ ...baseEvidence[0], summary: "Critério inicial com contexto organizado" }] } });
  assert.equal(changed?.stale, true);
  assert.equal(changed?.state, "REPORT_GENERATED");
  assert.equal(changed?.final, false);
});

test("R7 preserva as três camadas dos pipelines locais de texto e áudio", () => {
  const text = buildRadarR7LocalTextPipeline({ updateId: "update-text-r7", bindingId: "binding-r7", briefId: "brief-r7", articleId: "article-r7-marketing", originalText: "Critérios práticos de marketing online." });
  assert.equal(text.contribution.originalText, "Critérios práticos de marketing online.");
  assert.equal(text.contribution.transcriptText, null);
  assert.equal(text.radar.evidenceState, "NOT_AVAILABLE");
  const audio = buildRadarR7LocalAudioPipeline({ updateId: "update-audio-r7", bindingId: "binding-r7", briefId: "brief-r7", articleId: "article-r7-marketing", originalAssetUri: "gs://local-fixture/audio-r7.ogg", checksum: "checksum-r7", transcriptText: "Fala original", organizedText: "Contribuição organizada", sourceRange: { label: "Áudio 2", start: "00:41", end: "01:13" } });
  assert.equal(audio.contribution.layers.original.immutable, true);
  assert.equal(audio.contribution.layers.transcript.immutable, true);
  assert.equal(audio.contribution.layers.organized.immutable, false);
  assert.deepEqual(audio.expertEvidence.source, { label: "Áudio 2", start: "00:41", end: "01:13" });
});

test("R7 mantém fixture e caminhos remotos fora do fluxo real", () => {
  const panel = readFileSync(new URL("../modules/radar/radar-r3-specialist-panel.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(panel, /showLocalFixture = false/);
  assert.match(panel, /showLocalFixture \?/);
  assert.match(panel, /Não representa Telegram real conectado/);
  assert.match(page, /parseRadarR7TopicResponse/);
  assert.match(page, /preserveRadarR7TopicsOnFailure/);
  assert.match(page, /reportApprovedEvidenceFingerprint/);
  assert.doesNotMatch(page, /useEffect\([^]*collectSerp/);
});

test("R7 registra os gates que permanecem sem smoke remoto", () => {
  assert.equal(RADAR_R7_DEEPSEEK_REAL_SMOKE, "AWAITING_AUTHORIZATION");
  assert.equal(RADAR_R7_PLANNER_CONTRACT_AUDIT, "STRUCTURAL_CHANGE_REQUIRED");
  assert.equal(RADAR_R7_PLANNER_ADAPTER, "BLOCKED_BY_PLANNER_GERAL");
  assert.equal(RADAR_R7_TELEGRAM_REMOTE_FOUNDATION, "BLOCKED_BY_DATABASE");
  assert.equal(RADAR_R7_LOCAL_WORKER_READINESS, "IMPLEMENTED_NOT_SMOKED");
  assert.equal(RADAR_R7_TEXT_PIPELINE_READINESS, "LOCAL_VALIDATED");
  assert.equal(RADAR_R7_AUDIO_PIPELINE_READINESS, "LOCAL_VALIDATED");
  assert.equal(RADAR_R7_TRANSCRIPT_IMMUTABILITY, "LOCAL_VALIDATED");
});
