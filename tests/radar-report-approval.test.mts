import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approveRadarReport, radarReportApprovalIssues, type ApproveRadarReportInput, type RadarApprovalGateInput } from "../lib/radar/report-approval.ts";
import { RadarAnalysisPayloadSchema, RadarExtractionPageSchema, type RadarAnalysisVersion } from "../lib/radar/analysis-contracts.ts";
import { isRadarPlannerHandoff } from "../lib/radar/planner-handoff.ts";
import { buildRadarCompetitiveReport } from "../lib/radar/competitive-report.ts";
import type { SerpResearchSnapshot } from "../lib/radar/serp/contracts.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const brandId = "11111111-1111-4111-8111-111111111111";
const articleId = "article-1";
const articleDnaVersionId = "22222222-2222-4222-8222-222222222222";
const radarItemId = "33333333-3333-4333-8333-333333333333";
const snapshotId = "serp:article-1:v1";

const organic = (position: number) => ({
  position, title: `Concorrente ${position}`, url: `https://exemplo-${position}.com/pagina`,
  domain: `exemplo-${position}.com`, snippet: "trecho", inferredType: "artigo", isOwnDomain: false,
});

const research = (): SerpResearchSnapshot => ({
  id: snapshotId, brandId, articleId, articleDnaVersionId,
  keywordId: "kw-1", keywordDnaVersionId: "kwdna-1", query: "skin care pele oleosa",
  location: "Brasil", language: "pt", device: "desktop", provider: "dataforseo",
  version: 1, previousSnapshotId: null, contentHash: "sha256:" + "a".repeat(64),
  collectedAt: "2026-09-06T10:00:00.000Z", origin: "real", isMock: false,
  organicResults: [organic(1), organic(2), organic(3)],
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], recurringTitlePatterns: [], questions: [], possibleConflicts: [], opportunities: [], verdict: "coerente", confidence: "high" },
  humanDecisionRequired: true,
} as unknown as SerpResearchSnapshot);

const article = (): VersionEnvelope<ArticleDNA> => ({
  versionId: articleDnaVersionId, entityId: articleId, versionNumber: 1, previousVersionId: null,
  contentHash: "sha256:" + "b".repeat(64), origin: "human", changeReason: "fixture",
  createdAt: "2026-09-06T09:00:00.000Z", createdBy: "fixture",
  payload: { articleId, brandId, promise: "Cobrir skin care para pele oleosa", suggestedSlug: "pele-oleosa", mainIntent: "informacional", hierarchy: "Pilar", requiredTopics: [], coverage: ["skin care"], entities: [], questions: [], objections: [], keywordReferences: [], principalKeywordId: "kw-1", canonical: null, sourcesNeeded: [], evidenceNeeded: [] } as unknown as ArticleDNA,
} as VersionEnvelope<ArticleDNA>);

/*
 * A AMOSTRA COMPARÁVEL ENTROU NA FIXTURE.
 *
 * O portão passou a recusar investigação sem página editorial comparável — foi
 * exatamente com zero comparáveis que o smoke aprovou uma SERP. O caminho feliz
 * precisa descrever uma amostra que existe; a ausência dela virou caso próprio.
 */
const paginaComparavel = (position: number) => RadarExtractionPageSchema.parse({
  id: `page-${position}`, url: `https://exemplo-${position}.com/pagina`, status: "success",
  fetchedAt: "2026-09-06T11:00:00.000Z", title: `Artigo ${position}`, metaDescription: "", canonical: null,
  h1: ["Skin care"], h2: ["Como usar", "Benefícios"], h3: [], wordCount: 1200, internalLinkCount: 6,
  externalLinkCount: 2, listCount: 3, tableCount: 0, faqCount: 0, imageCount: 4, blockquoteCount: 0,
  comparisonCount: 0, hasDates: true, author: null, structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 8, italicCount: 0, error: "",
});
const amostraComparavel = [1, 2, 3].map(paginaComparavel);

function analysisVersionSemRelatorio(patch: Record<string, unknown> = {}, status: "draft" | "approved" = "draft"): RadarAnalysisVersion {
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId, articleId, articleDnaVersionId,
    serpSnapshotId: snapshotId, serpSnapshotVersion: 1, serpSnapshotHash: "sha256:" + "a".repeat(64),
    mode: "kgr_light", modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "",
    serpDecisions: [
      { key: "organic:1", itemType: "organic", decision: "included", reason: "Concorrente selecionado pelo usuário.", note: "", ownDomain: false },
      { key: "organic:2", itemType: "organic", decision: "excluded", reason: "fora do tema", note: "", ownDomain: false },
      { key: "organic:3", itemType: "organic", decision: "excluded", reason: "fora do tema", note: "", ownDomain: false },
    ],
    selectedCompetitorIds: ["organic:1"], extractionIds: amostraComparavel.map(page => page.id), extractions: amostraComparavel,
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null,
    keywordDecisions: [], competitiveReport: null, plannerPackage: null, plannerTransfer: null,
    status, humanNotes: [], approvedAt: null, approvedBy: null,
    ...patch,
  });
  return { versionId: "analysis-v1", entityId: `radar-analysis:${articleId}`, versionNumber: 1, previousVersionId: null, contentHash: "sha256:" + "c".repeat(64), origin: "human", changeReason: "fixture", createdAt: "2026-09-06T09:30:00.000Z", createdBy: "fixture", payload } as RadarAnalysisVersion;
}

/*
 * O RELATÓRIO É PRÉ-CONDIÇÃO, ENTÃO ELE ENTRA NA FIXTURE.
 *
 * Aprovar deixou de construir o relatório por dentro: ele agora é um ato
 * anterior e visível. A fixture padrão passa a descrever esse estado, e a
 * ausência do relatório vira um caso de teste próprio, não o caminho feliz.
 */
const relatorioFixture = await buildRadarCompetitiveReport({
  payload: analysisVersionSemRelatorio().payload, article: article().payload, research: research(),
  radarItemId, analysisVersionId: "analysis-v1", analysisVersionNumber: 1, generatedBy: "fixture", status: "draft",
});

function analysisVersion(patch: Record<string, unknown> = {}, status: "draft" | "approved" = "draft"): RadarAnalysisVersion {
  return analysisVersionSemRelatorio({ competitiveReport: relatorioFixture, ...patch }, status);
}


const identity = { brandId, articleId, articleDnaVersionId, radarItemId };

const gateInput = (patch: Partial<RadarApprovalGateInput> = {}): RadarApprovalGateInput => ({
  identity,
  analysis: analysisVersion(),
  article: article(),
  research: research(),
  serpReview: { status: "approved", currentness: "current" },
  expertEvidence: { loaded: true, contextMatches: true, failed: false, pendingCount: 0, blockedCount: 0 },
  kgrStrategy: null,
  ...patch,
});

const approvalInput = (patch: Partial<ApproveRadarReportInput> = {}): ApproveRadarReportInput => ({
  ...gateInput(),
  analysis: analysisVersion(),
  article: article(),
  research: research(),
  siloDnaVersionId: null,
  selectedBy: "ator-1",
  expertEvidence: { loaded: true, contextMatches: true, failed: false, pendingCount: 0, blockedCount: 0, approved: [] },
  persist: async () => ({ persistenceMode: "remote", readbackConfirmed: true }),
  now: "2026-09-06T12:00:00.000Z",
  ...patch,
} as ApproveRadarReportInput);

/* ------------------------------- A · mesma autoridade -------------------- */

test("as duas superfícies chamam a mesma autoridade, e nenhuma reimplementa a decisão", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const detalhe = readFileSync("modules/radar/radar-analysis-page.tsx", "utf8");

  for (const [nome, fonte] of [["Workbench", workbench], ["detalhe", detalhe]] as const) {
    assert.match(fonte, /from "@\/lib\/radar\/report-approval"/, `${nome} precisa importar a autoridade única`);
    assert.match(fonte, /approveRadarReport\(\{/, `${nome} precisa chamar approveRadarReport`);
  }

  // Nenhuma das telas pode montar pacote/handoff por fora da autoridade: era
  // exatamente assim que existiam duas implementações do mesmo ato.
  for (const [nome, fonte] of [["Workbench", workbench], ["detalhe", detalhe]] as const) {
    assert.equal(/buildRadarEvidencePackage\(/.test(fonte), false, `${nome} não pode montar o pacote por fora`);
    assert.equal(/buildRadarPlannerHandoff\(/.test(fonte), false, `${nome} não pode montar o handoff por fora`);
  }

  // E o Workbench não pode voltar a chamar de "aprovado" um flag de sessão.
  assert.equal(/aprovado localmente/i.test(workbench), false, "o verbo Aprovar não pode voltar a significar estado local");

  const autoridade = readFileSync("lib/radar/report-approval.ts", "utf8");
  assert.match(autoridade, /buildRadarEvidencePackage\(/);
  assert.match(autoridade, /buildRadarPlannerHandoff\(/);
});

/* ------------------------------- B · gates equivalentes ------------------ */

test("o mesmo estado aprova ou recusa igual, venha de onde vier", () => {
  assert.deepEqual(radarReportApprovalIssues(gateInput()), []);

  const bloqueado = gateInput({ serpReview: { status: null, currentness: "none" } });
  const doWorkbench = radarReportApprovalIssues(bloqueado);
  const doDetalhe = radarReportApprovalIssues({ ...bloqueado });
  assert.deepEqual(doWorkbench, doDetalhe);
  assert.ok(doWorkbench.length > 0);
});

test("SERP não aprovada, evidência em leitura e composição acima do teto bloqueiam", () => {
  assert.match(radarReportApprovalIssues(gateInput({ serpReview: { status: null, currentness: "none" } })).join(" "), /SERP deste artigo precisa estar aprovada/);
  assert.match(radarReportApprovalIssues(gateInput({ expertEvidence: { loaded: false, contextMatches: false, failed: false, pendingCount: 0, blockedCount: 0 } })).join(" "), /Aguarde a leitura remota do ExpertBrief/);
  assert.match(radarReportApprovalIssues(gateInput({ expertEvidence: { loaded: true, contextMatches: true, failed: true, pendingCount: 0, blockedCount: 0 } })).join(" "), /não pôde ser lida/);
  assert.match(radarReportApprovalIssues(gateInput({ expertEvidence: { loaded: true, contextMatches: true, failed: false, pendingCount: 2, blockedCount: 0 } })).join(" "), /Revise todas as contribuições/);
  const acimaDoTeto = radarReportApprovalIssues(gateInput({ kgrStrategy: { keywordComposition: { totalCount: 7, strategicLimit: 6 } } as never }));
  assert.match(acimaDoTeto.join(" "), /acima do limite estratégico/);
});

/* ------------------------------- C · falha remota ------------------------ */

test("falha da escrita remota não vira aprovação nem promove pacote", async () => {
  let chamou = 0;
  const result = await approveRadarReport(approvalInput({
    persist: async () => { chamou += 1; return { persistenceMode: "local", readbackConfirmed: false }; },
  }));
  assert.equal(chamou, 1);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "NOT_PERSISTED");
  assert.match(result.message, /não foi confirmada no remoto/);
});

/* ------------------------------- D · readback ---------------------------- */

test("write sem readback compatível não fecha sucesso", async () => {
  const semReadback = await approveRadarReport(approvalInput({
    persist: async () => ({ persistenceMode: "remote", readbackConfirmed: false }),
  }));
  assert.equal(semReadback.ok, false);

  const comReadback = await approveRadarReport(approvalInput());
  assert.equal(comReadback.ok, true);
  if (!comReadback.ok) return;
  assert.equal(comReadback.outcome, "APPROVED");
});

/* ------------------------------- E · fingerprint ------------------------- */

test("curadoria alterada depois da aprovação da SERP reabre o estado", () => {
  const reaberta = radarReportApprovalIssues(gateInput({ serpReview: { status: "approved", currentness: "reopened" } }));
  assert.match(reaberta.join(" "), /curadoria mudou depois da aprovação da SERP/);

  const semFingerprint = radarReportApprovalIssues(gateInput({ serpReview: { status: "approved", currentness: "unknown" } }));
  assert.match(semFingerprint.join(" "), /não traz o fingerprint da curadoria/);
});

/* ------------------------------- F · snapshot ---------------------------- */

test("snapshot sucessor não herda a aprovação do anterior", async () => {
  const novoSnapshot = { ...research(), id: "serp:article-1:v2", version: 2, contentHash: "sha256:" + "d".repeat(64) } as SerpResearchSnapshot;
  const issues = radarReportApprovalIssues(gateInput({ research: novoSnapshot }));
  assert.match(issues.join(" "), /descreve outro snapshot SERP/);

  // E a idempotência não pode confundir snapshot novo com repetição do clique.
  const aprovada = await approveRadarReport(approvalInput());
  assert.equal(aprovada.ok, true);
  if (!aprovada.ok || !aprovada.successor) return;
  const repetido = await approveRadarReport(approvalInput({ analysis: aprovada.successor, research: novoSnapshot }));
  assert.equal(repetido.ok, false, "snapshot novo não pode cair no caminho de já aprovado");
});

/* ------------------------------- G · package ----------------------------- */

test("somente a aprovação canônica gera pacote e handoff v2 no plannerPackage", async () => {
  let persistido: RadarAnalysisVersion | null = null;
  const result = await approveRadarReport(approvalInput({
    persist: async successor => { persistido = successor; return { persistenceMode: "remote", readbackConfirmed: true }; },
  }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.evidencePackageHash, "o pacote precisa ter hash");
  assert.ok(result.handoffId, "o handoff v2 precisa ter identidade");

  const gravado = persistido as RadarAnalysisVersion | null;
  assert.ok(gravado, "a autoridade precisa persistir a sucessora");
  assert.equal(gravado!.payload.status, "approved");
  assert.equal(gravado!.versionId, result.analysisVersionId);
  assert.equal(gravado!.versionNumber, result.analysisVersionNumber);
  assert.equal(gravado!.payload.approvedBy, "ator-1");
  assert.equal(gravado!.payload.competitiveReport?.status, "approved");

  // O Planejador só encontra o envelope se ele estiver em `plannerPackage`
  // como handoff v2 — o pacote v1 passaria no schema e sumiria na leitura.
  assert.equal(isRadarPlannerHandoff(gravado!.payload.plannerPackage), true);
  const handoff = gravado!.payload.plannerPackage as { status: string; radarItemId: string; articleDnaVersionId: string; serp: { snapshotId: string } };
  assert.equal(handoff.status, "APPROVED");
  assert.equal(handoff.radarItemId, radarItemId);
  assert.equal(handoff.articleDnaVersionId, articleDnaVersionId);
  assert.equal(handoff.serp.snapshotId, snapshotId);
});

test("estado bloqueado não constrói pacote nem toca a persistência", async () => {
  let chamou = 0;
  const result = await approveRadarReport(approvalInput({
    serpReview: { status: null, currentness: "none" },
    persist: async () => { chamou += 1; return { persistenceMode: "remote", readbackConfirmed: true }; },
  }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "BLOCKED");
  assert.equal(chamou, 0, "recusa não pode escrever");
});

/* ------------------------------- H · idempotência ------------------------ */

test("repetir a mesma aprovação válida não cria sucessora nova", async () => {
  const primeira = await approveRadarReport(approvalInput());
  assert.equal(primeira.ok, true);
  if (!primeira.ok || !primeira.successor) return;

  let chamou = 0;
  const segunda = await approveRadarReport(approvalInput({
    analysis: primeira.successor,
    persist: async () => { chamou += 1; return { persistenceMode: "remote", readbackConfirmed: true }; },
  }));

  assert.equal(segunda.ok, true);
  if (!segunda.ok) return;
  assert.equal(segunda.outcome, "ALREADY_APPROVED");
  assert.equal(segunda.successor, null);
  assert.equal(chamou, 0, "aprovação repetida não pode escrever de novo");
  assert.equal(segunda.analysisVersionId, primeira.successor.versionId);
});

/* ------------------------------- I · isolamento -------------------------- */

test("contexto de outra marca, artigo ou versão é recusado", () => {
  const outraMarca = radarReportApprovalIssues(gateInput({ identity: { ...identity, brandId: "99999999-9999-4999-8999-999999999999" } }));
  assert.match(outraMarca.join(" "), /não pertence a esta marca, artigo e versão/);

  const outroArtigo = radarReportApprovalIssues(gateInput({ identity: { ...identity, articleId: "article-outro" } }));
  assert.match(outroArtigo.join(" "), /não pertence a esta marca, artigo e versão/);

  const outraVersao = radarReportApprovalIssues(gateInput({ identity: { ...identity, articleDnaVersionId: "44444444-4444-4444-8444-444444444444" } }));
  assert.match(outraVersao.join(" "), /não pertence a esta marca, artigo e versão/);
});

test("aprovação de outra linha do Radar não é reconhecida como repetição", async () => {
  const primeira = await approveRadarReport(approvalInput());
  assert.equal(primeira.ok, true);
  if (!primeira.ok || !primeira.successor) return;

  let chamou = 0;
  const outraLinha = await approveRadarReport(approvalInput({
    analysis: primeira.successor,
    identity: { ...identity, radarItemId: "55555555-5555-4555-8555-555555555555" },
    persist: async () => { chamou += 1; return { persistenceMode: "remote", readbackConfirmed: true }; },
  }));
  assert.equal(outraLinha.ok, true);
  if (!outraLinha.ok) return;
  assert.equal(outraLinha.outcome, "APPROVED", "handoff de outra linha não fecha esta aprovação");
  assert.equal(chamou, 1);
});

/* ---------------------- regressão: contrato do payload ------------------- */

test("o payload da análise recusa campo desconhecido em vez de descartá-lo", () => {
  assert.throws(
    () => RadarAnalysisPayloadSchema.parse({ ...analysisVersion().payload, plannerHandoff: { qualquer: "coisa" } }),
    /Unrecognized key|unrecognized_keys/,
  );
});

test("aprovar sem relatório competitivo desta versão é recusado", () => {
  const issues = radarReportApprovalIssues(gateInput({ analysis: analysisVersionSemRelatorio() }));
  assert.ok(issues.some(issue => /Gere o relatório competitivo desta versão/.test(issue)));
});

test("relatório gerado antes do modelo observado não fecha a investigação", () => {
  const legado = { ...relatorioFixture, observedCompetitiveModel: null };
  const issues = radarReportApprovalIssues(gateInput({ analysis: analysisVersionSemRelatorio({ competitiveReport: legado }) }));
  assert.ok(issues.some(issue => /gerado antes do modelo competitivo observado/.test(issue)));
});

test("o relatório da fixture carrega o modelo observado e libera o portão", () => {
  assert.notEqual(relatorioFixture.observedCompetitiveModel, null);
  assert.deepEqual(radarReportApprovalIssues(gateInput()), []);
});

test("aprovar sem amostra editorial comparável é recusado, mesmo com relatório", () => {
  const semAmostra = analysisVersionSemRelatorio({ competitiveReport: relatorioFixture, extractions: [], extractionIds: [] });
  const issues = radarReportApprovalIssues(gateInput({ analysis: semAmostra }));
  assert.ok(issues.some(issue => /amostra competitiva suficiente/i.test(issue)));
});

test("falha de extração sem nenhuma página comparável também bloqueia", () => {
  const comFalhas = analysisVersionSemRelatorio({
    competitiveReport: relatorioFixture,
    extractions: [], extractionIds: [],
    extractionFailures: [{ key: "organic:1", url: "https://exemplo-1.com/pagina", code: "fetch_failed", message: "timeout", status: 504, observedAt: "2026-09-06T11:05:00.000Z" }],
  });
  const issues = radarReportApprovalIssues(gateInput({ analysis: comFalhas }));
  assert.ok(issues.some(issue => /amostra competitiva suficiente/i.test(issue)));
});
