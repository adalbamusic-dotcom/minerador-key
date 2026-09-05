import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { currentSerpAssessments, mergeSerpAssessments, resolveSerpArticleState } from "../lib/arquiteto/serp-assessment-registry.ts";
import type { SerpFormationAssessment } from "../lib/arquiteto/serp-formation.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const brandId = "brand-1";

const assessment = (version: number, contentHash: string, overrides: Partial<SerpFormationAssessment> = {}) => ({
  schemaVersion: 1,
  id: `serp-formation:${brandId}:group-tsxaq3:v${version}`,
  brandId,
  articleId: "group-tsxaq3",
  articleDnaVersionId: "work:group-tsxaq3",
  version,
  previousVersionId: version > 1 ? `serp-formation:${brandId}:group-tsxaq3:v${version - 1}` : null,
  contentHash,
  createdAt: "2026-08-29T00:00:00.000Z",
  createdBy: "user-1",
  mode: "keyword_individual",
  assessmentMode: "formacao",
  validationProfile: "standard",
  queryCount: 1,
  keywordDnaReferences: [],
  snapshots: [],
  intentCompatibility: "insuficiente",
  competitionLevel: "media",
  dominantResultTypes: [],
  recommendations: [],
  conflicts: [],
  notes: [],
  evaluationStatus: "active",
  outdatedReason: null,
  ...overrides,
}) as unknown as SerpFormationAssessment;

test("primeira execução registra uma única avaliação vigente", () => {
  const merged = mergeSerpAssessments({ existing: [], incoming: [assessment(1, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")], brandId });

  assert.equal(merged.assessments.length, 1);
  assert.equal(merged.confirmTargets.length, 1);
  assert.deepEqual(merged.unchangedArticleIds, []);
  assert.equal(currentSerpAssessments(merged.assessments, brandId).length, 1);
});

test("segunda execução com conteúdo diferente cria sucessora e preserva histórico", () => {
  const first = mergeSerpAssessments({ existing: [], incoming: [assessment(1, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")], brandId });
  const second = mergeSerpAssessments({ existing: first.assessments, incoming: [assessment(2, "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")], brandId });

  assert.equal(second.assessments.length, 2);
  const current = currentSerpAssessments(second.assessments, brandId);
  assert.equal(current.length, 1, "apenas uma vigente por Article");
  assert.equal(current[0].version, 2);
  const history = second.assessments.filter(item => item.evaluationStatus === "outdated");
  assert.equal(history.length, 1);
  assert.equal(history[0].version, 1);
  // A confirmação olha somente a versão nova.
  assert.deepEqual(second.confirmTargets.map(item => item.version), [2]);
});

test("reexecução com conteúdo idêntico não duplica nem exige confirmação", () => {
  const first = mergeSerpAssessments({ existing: [], incoming: [assessment(1, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")], brandId });
  const repeated = mergeSerpAssessments({ existing: first.assessments, incoming: [assessment(2, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")], brandId });

  assert.equal(repeated.assessments.length, 1);
  assert.deepEqual(repeated.confirmTargets, []);
  assert.deepEqual(repeated.unchangedArticleIds, ["group-tsxaq3"]);
  assert.equal(currentSerpAssessments(repeated.assessments, brandId)[0].version, 1);
});

test("resposta repetida para o mesmo Article não gera duas vigentes", () => {
  const merged = mergeSerpAssessments({
    existing: [],
    incoming: [assessment(2, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), assessment(2, "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")],
    brandId,
  });

  assert.equal(merged.assessments.length, 1);
  assert.equal(merged.assessments[0].contentHash, "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(currentSerpAssessments(merged.assessments, brandId).length, 1);
});

test("mesma identidade de versão substitui em vez de conviver duplicada", () => {
  const existing = [assessment(2, "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc")];
  const merged = mergeSerpAssessments({ existing, incoming: [assessment(2, "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd")], brandId });

  assert.equal(merged.assessments.filter(item => item.id.endsWith(":v2")).length, 1);
  assert.equal(merged.assessments[0].contentHash, "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd");
});

test("falha de atualização não invalida a avaliação vigente", () => {
  const withCurrent = resolveSerpArticleState({
    currentAssessment: assessment(1, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    lastAttempt: { status: "error", message: "Falha ao consultar o provider." },
  });
  const withoutCurrent = resolveSerpArticleState({
    currentAssessment: undefined,
    lastAttempt: { status: "error", message: "Falha ao consultar o provider." },
  });
  const cleanRun = resolveSerpArticleState({ currentAssessment: assessment(1, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), lastAttempt: null });

  assert.equal(withCurrent.processState, "ready");
  assert.equal(withCurrent.hasCurrentAssessment, true);
  assert.equal(withCurrent.lastAttemptFailed, true);
  assert.match(withCurrent.attemptMessage || "", /Falha ao consultar o provider/);
  assert.equal(withoutCurrent.processState, "error");
  assert.equal(cleanRun.processState, "ready");
  assert.equal(cleanRun.lastAttemptFailed, false);
});

test("o workspace usa o registro canônico e confirma só as versões novas", () => {
  assert.match(workspace, /const merged = mergeSerpAssessments\(\{ existing: serpAssessments, incoming: assessments, brandId: brandContext\.id \}\)/);
  assert.match(workspace, /await persistSerpState\(replaced, publicationVerifications, nextCandidateEvidence, merged\.confirmTargets\)/);
  assert.match(workspace, /const expectedAssessments = confirmTargets \?\? assessments;/);
});

test("a UI separa avaliação vigente de tentativa de atualização", () => {
  assert.match(workspace, /data-testid="architect-serp-refresh-failed"/);
  assert.match(workspace, /Última atualização da SERP falhou/);
  assert.match(workspace, /A avaliação vigente deste artigo continua válida e permanece em uso\./);
  assert.match(workspace, /Repetir atualização/);
  assert.match(workspace, /status: hasCurrent \? "ready" as const : "error" as const/);
});

test("a seleção não envia o mesmo Article duas vezes", () => {
  assert.match(workspace, /Um Article por execução: grupo repetido criaria duas avaliações vigentes\./);
  assert.match(workspace, /all\.findIndex\(candidate => \(candidate\.publishedAnchorId \|\| candidate\.id\) === \(group\.publishedAnchorId \|\| group\.id\)\) === index/);
});

test("nenhuma execução automática de SERP ao abrir a tela", () => {
  assert.doesNotMatch(workspace, /useEffect\(\(\) => \{[\s\S]{0,200}confirmSerpValidation\(/);
});
