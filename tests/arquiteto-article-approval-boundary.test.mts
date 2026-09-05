import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleRadarGateIssues, resolveArticleRadarReadiness, resolveArticleSiloReadiness } from "../lib/arquiteto/article-phase.ts";
import { projectArticleDnaForArchitect, type ArticleDnaProjectionInput } from "../lib/arquiteto/article-dna-projection.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { importArticlesToRadar, importRadarToPlanner } from "../lib/editorial/operational-flow.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const articlePanel = readFileSync("components/editorial/article-dna-readonly-panel.tsx", "utf8");
const operationalFlow = readFileSync("lib/editorial/operational-flow.ts", "utf8");

const articlePayload = (overrides: Partial<ArticleDNA> = {}): ArticleDNA => ({
  schemaVersion: 1, articleId: "article-1", brandId: "brand-1", principalKeywordId: "kw-1", secondaryKeywordIds: [], narrativeReinforcementIds: [],
  keywordReferences: [{
    keywordId: "kw-1", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "sha256:hash", role: "principal",
    strategicContribution: "central", coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [],
    classificationOrigin: "human", confidence: 0.9, humanConfirmed: true,
  }],
  siloId: null, hierarchy: "Suporte", suggestedSlug: "cleansing-oil-hada-labo", canonical: null, mainIntent: "informacional",
  auxiliaryIntents: [], audience: "público", problem: "problema", desiredResult: "resultado", journeyStage: "TOFU",
  brandObjective: "objetivo", promise: "Cobrir o tema", angle: "ângulo", cta: "cta", coverage: ["cleansing oil"], excludedSubjects: [],
  antiCannibalizationBoundary: "fronteira", nearbyArticleIds: [], differentiation: [], entities: ["cleansing oil"], requiredTopics: [],
  questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [],
  alerts: ["Estratégia, promessa, CTA e fronteira serão enriquecidas no Planejador/Redator; não bloqueiam a arquitetura."],
  confidence: 0.8, humanPendingDecisions: [],
  ...overrides,
});

const articleVersion = async (payload = articlePayload()) => await createVersionEnvelope({
  entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "Aprovação humana", createdBy: "user-1", payload,
}) as VersionEnvelope<ArticleDNA>;

const siloReady = resolveArticleSiloReadiness({
  hasArticleDna: true, siloAssigned: false, reviewPending: false, unresolvedConflicts: 0, approved: true, kgrDecisionPending: false,
});

test("aprovar ArticleDNA sem Silo não quebra e não cria RadarItem, PlannerItem nem PublicationItem", async () => {
  const version = await articleVersion();

  const radar = importArticlesToRadar([], [version], "brand-1");
  assert.equal(radar.length, 0);
  assert.equal(importRadarToPlanner([], radar, "brand-1").length, 0);
  // O Silo do RadarItem é RESOLVIDO pelo território, não exigido do payload —
  // e sem contexto resolvido o artigo continua não virando item, que é o que
  // este teste protege.
  assert.match(operationalFlow, /const siloIdOf = \(version: VersionEnvelope<ArticleDNA>\) =>/);
  assert.match(operationalFlow, /&& Boolean\(siloIdOf\(version\)\)/);
});

test("a aprovação não agenda handoff automático ao Radar", () => {
  assert.equal(workspace.includes("setPendingRadarSmoke("), false);
  assert.equal(workspace.includes("pendingRadarSmoke?.length"), false);
  assert.match(workspace, /O handoff ao Radar é ação explícita e posterior a Silos e Links Internos/);
  assert.match(workspace, /setPendingRadarSmokeReadback\(articleIds\);/);
});

test("Pronto para Silos não é Pronto para Radar", () => {
  assert.equal(siloReady.state, "ready");
  assert.equal(siloReady.label, "Pronto para Silos");

  const radarBlocked = resolveArticleRadarReadiness({
    siloReadiness: siloReady, siloArtifactsApproved: false, internalLinkGraphApproved: false, serpAssessmentComplete: true, alreadySent: false,
  });
  assert.equal(radarBlocked.state, "blocked");
  assert.notEqual(radarBlocked.label, siloReady.label);
  assert.equal(radarBlocked.reasons.length, 3);

  const radarReady = resolveArticleRadarReadiness({
    siloReadiness: { state: "assigned", label: "Silo definido", reasons: [] },
    siloArtifactsApproved: true, internalLinkGraphApproved: true, serpAssessmentComplete: true, alreadySent: false,
  });
  assert.equal(radarReady.state, "ready");
  assert.equal(radarReady.label, "Pronto para o Radar");
});

test("o handoff ao Radar continua bloqueado sem Silo e sem InternalLinkGraph aprovado", () => {
  const base = {
    selectedArticleCount: 1, consolidatedArticleCount: 1, approvedArticleCount: 1, pendingAiReviewCount: 0,
    unresolvedConflictCount: 0, missingSerpAssessmentCount: 0, incompleteSerpAssessmentCount: 0,
  };
  const withoutSilo = articleRadarGateIssues({ ...base, missingSiloCount: 1, missingApprovedInternalLinkGraphCount: 0 });
  const withoutGraph = articleRadarGateIssues({ ...base, missingSiloCount: 0, missingApprovedInternalLinkGraphCount: 1 });
  const complete = articleRadarGateIssues({ ...base, missingSiloCount: 0, missingApprovedInternalLinkGraphCount: 0 });

  assert.ok(withoutSilo.some(issue => issue.includes("sem Silo definido")));
  assert.ok(withoutGraph.some(issue => issue.includes("InternalLinkGraph aprovado")));
  assert.deepEqual(complete, []);
  // O portão da mesa é o MESMO do lote: `buildRadarHandoffPlan`. A memo anterior
  // redecidia Silo, SERP e conflitos por chaves próprias, e recusava por
  // pendências que já não existiam.
  assert.match(workspace, /const selectedArticleRadarPlan = useMemo\(\(\) => buildRadarHandoffPlan\(/);
  assert.match(workspace, /selectedArticleRadarPlan\.blocked\.flatMap\(item => item\.blockers\)/);
});

const definition = (version: VersionEnvelope<ArticleDNA> | null): ArticleDnaProjectionInput => ({
  version,
  versionStatus: "approved",
  principalKeyword: "cleansing oil hada labo",
  supportKeywords: [{ keyword: "cleansing oil", role: "secundaria" }, { keyword: "limpeza facial", role: "reforco_narrativo" }],
  unitTypeLabel: "Artigo",
  kgr: { label: "Sim · KGR pleno", source: "FULL_KGR_RULE", principalScoreLabel: "0,022", applicabilityLabel: "Aplicável", requiresHumanDecision: false },
  serp: { executionLabel: "Concluída", verdictLabel: "Inconclusivo", impact: "Nenhuma alteração estrutural obrigatória.", divergenceCount: 0, registeredDecisions: 1 },
  ai: { executionLabel: "Concluída sem propostas", proposalCount: 0, pendingCount: 0 },
  review: { statusLabel: "Aprovado", requiredCount: 2, resolvedCount: 2, pendingCount: 0, approved: true },
  protection: { publicationLabel: "Novo", principalPolicy: "Principal revisável", slug: "cleansing-oil-hada-labo", canonical: null, url: null, published: false },
  siloLabel: "Pronto para Silos",
  linksLabel: "Não iniciados",
});

test("a ficha do artigo abre com todas as seções do estado consolidado", async () => {
  const projection = projectArticleDnaForArchitect(definition(await articleVersion()));
  const ids = projection.sections.map(item => item.id);

  assert.equal(projection.available, true);
  for (const id of ["identidade-article", "arquitetura-article", "semantica-article", "kgr-article", "serp-article", "ia-article", "revisao-article", "protecoes-article", "silo-article", "links-article"]) {
    assert.ok(ids.includes(id), `seção ausente: ${id}`);
  }
  const values = new Map(projection.sections.flatMap(item => item.fields).map(item => [item.label, item.value]));
  assert.equal(values.get("Decisão"), "Sim · KGR pleno");
  assert.equal(values.get("Veredito"), "Inconclusivo");
  assert.equal(values.get("Execução"), "Concluída sem propostas");
  assert.equal(values.get("Aprovação"), "ArticleDNA aprovado");
  assert.equal(values.get("Slug"), "cleansing-oil-hada-labo");
  assert.equal(projection.sections.find(item => item.id === "silo-article")?.fields[0]?.value, "Pronto para Silos");
  assert.equal(projection.sections.find(item => item.id === "links-article")?.fields[0]?.value, "Não iniciados");
  assert.ok(projection.technical.some(item => item.label === "Hash"));
});

test("a ficha é vertical, somente leitura e não repete a planilha", () => {
  for (const control of ["<input", "<select", "<textarea", "onChange", "onClick"]) {
    assert.equal(articlePanel.includes(control), false, `controle proibido na ficha: ${control}`);
  }
  assert.match(articlePanel, /sm:grid-cols-2/);
  assert.match(articlePanel, /Ver definição completa do artigo/);
  assert.match(articlePanel, /As decisões humanas ficam na aba Revisão/);
  assert.match(workspace, /<ArticleDnaReadonlyPanel definition=\{\{/);
  assert.equal(workspace.includes("<ArticleDnaSummary"), false);
});

test("notas repetidas entre alertas e pendências herdadas aparecem uma única vez", async () => {
  const repeated = "Arquitetura confirmada por decisão humana; identidade publicada preservada.";
  const version = await articleVersion(articlePayload({
    alerts: [repeated, repeated, "ArticleDNA-base criado pela lógica determinística, sem IA."],
    humanPendingDecisions: [repeated],
  }));
  const projection = projectArticleDnaForArchitect(definition(version));

  assert.equal(projection.notes.filter(note => note === repeated).length, 1);
  assert.equal(new Set(projection.notes).size, projection.notes.length);
});

test("CTA, promessa e briefing aparecem como nota, nunca como pendência bloqueante", async () => {
  const projection = projectArticleDnaForArchitect(definition(await articleVersion()));

  assert.ok(projection.notes.some(note => note.includes("Planejador/Redator")));
  assert.match(articlePanel, /não bloqueia a aprovação do artigo/);
  const blockingFields = projection.sections.flatMap(item => item.fields).filter(item => item.unresolved);
  assert.equal(blockingFields.some(item => item.value.toLowerCase().includes("cta")), false);
});

test("sem ArticleDNA consolidado a ficha explica o estado em vez de sumir", () => {
  const projection = projectArticleDnaForArchitect(definition(null));

  assert.equal(projection.available, false);
  assert.equal(projection.sections.length, 0);
  assert.match(projection.emptyNote || "", /ainda não foi consolidada/);
  assert.ok(projection.summary.length > 0);
});
