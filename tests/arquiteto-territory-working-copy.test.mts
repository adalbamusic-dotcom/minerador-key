import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFERRED_EXTERNAL_EVIDENCE,
  TerritoryCandidateSchema,
  buildTerritoryRef,
  emptyTerritoryDiscovery,
  emptyTerritoryLineage,
  emptyTerritoryNarrative,
  planTerritoryMerge,
  planTerritorySplit,
  territoryContentIssues,
  type KeywordTerritoryAssignment,
  type TerritoryCandidate,
} from "../lib/arquiteto/territory.ts";
import {
  attachPendingOperation,
  deriveTerritorialWorkingView,
  listaIdIsNeverTerritory,
  planMembershipChange,
  resolveLegacyArticleReconciliation,
  settleMembershipOperation,
  type TerritoryWorkingCopy,
  type TerritoryWorkingKeyword,
} from "../lib/arquiteto/territory-working-copy.ts";
import { deriveArchitectureScenarioDiff, safeParseArchitectureScenario } from "../lib/arquiteto/architecture-scenario.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const REF_A = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const REF_B = buildTerritoryRef("22222222-2222-4222-8222-222222222222");

function territory(overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate {
  return TerritoryCandidateSchema.parse({
    schemaVersion: 1,
    territoryRef: REF_A,
    brandId: BRAND,
    existingSiloRef: null,
    name: "Barreira cutânea",
    centralEntity: "barreira cutânea",
    macroIntent: "sustentar autoridade sobre barreira cutânea",
    boundary: { includes: ["barreira cutânea"], excludes: ["acne"] },
    narrative: { statement: "Da barreira ao ritual diário.", continuity: "coherent", brandAlignment: "aligned", rationale: ["Sustenta a promessa."] },
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "new",
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "ui",
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: "unpublished",
    slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: ["Território declarado pela estratégia da Marca."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  });
}

const confirmed = (overrides: Partial<TerritoryCandidate> = {}) =>
  territory({ lifecycleStatus: "confirmed", decisionState: "confirmed", ...overrides });

const assignment = (keywordId: string, territoryRef: string | null): KeywordTerritoryAssignment => ({
  keywordId,
  brandId: BRAND,
  territoryRef,
  state: territoryRef ? "new_silo_candidate" : "unassigned",
  reason: territoryRef ? "Reservada para o território." : "Sem território adequado.",
  source: "human",
  decidedAt: NOW,
});

const keyword = (keywordId: string, territoryRef: string | null, overrides: Partial<TerritoryWorkingKeyword> = {}): TerritoryWorkingKeyword => ({
  keywordId,
  brandId: BRAND,
  workflowItemId: `wf-${keywordId}`,
  lockVersion: 1,
  isPublished: false,
  assignment: territoryRef === undefined ? null : assignment(keywordId, territoryRef),
  ...overrides,
});

const workingCopy = (overrides: Partial<TerritoryWorkingCopy> = {}): TerritoryWorkingCopy => ({
  brandId: BRAND,
  territories: [territory()],
  keywords: [keyword("kw-1", REF_A), keyword("kw-2", null)],
  ...overrides,
});

const change = (overrides: Partial<Parameters<typeof planMembershipChange>[0]> = {}) => planMembershipChange({
  workingCopy: workingCopy(),
  keywordIds: ["kw-2"],
  targetTerritoryRef: REF_A,
  state: "new_silo_candidate",
  reason: "Cabe no território.",
  source: "human",
  actorUserId: "user-1",
  decidedAt: NOW,
  ...overrides,
});

/* ------------------------- 1/2 · membership e projeção -------------------- */

test("1 · cada keyword está em exatamente um território ou explicitamente unassigned", () => {
  const view = deriveTerritorialWorkingView(workingCopy());

  assert.deepEqual(view.territories[0].keywordRefs, ["kw-1"]);
  assert.deepEqual(view.unassignedKeywordIds, ["kw-2"]);
  assert.deepEqual(view.unaddressedKeywordIds, []);
  assert.equal(view.consistency.consistent, true);

  // Keyword sem decisão nenhuma não é "unassigned": continua visível como tal.
  const semDecisao = deriveTerritorialWorkingView(workingCopy({
    keywords: [keyword("kw-1", REF_A), { ...keyword("kw-9", null), assignment: null }],
  }));
  assert.deepEqual(semDecisao.unaddressedKeywordIds, ["kw-9"]);
  assert.deepEqual(semDecisao.unassignedKeywordIds, []);
});

test("2 · a projeção é derivada; keywordRefs não é gravada em lugar nenhum", () => {
  const view = deriveTerritorialWorkingView(workingCopy({
    territories: [territory(), territory({ territoryRef: REF_B })],
    keywords: [keyword("kw-1", REF_A), keyword("kw-2", REF_B), keyword("kw-3", null)],
  }));

  assert.deepEqual(view.territories.find(item => item.territoryRef === REF_A)?.keywordRefs, ["kw-1"]);
  assert.deepEqual(view.territories.find(item => item.territoryRef === REF_B)?.keywordRefs, ["kw-2"]);

  // O contrato persistido do território não tem onde guardar membership.
  assert.equal("keywordRefs" in territory(), false);
  const contrato = readFileSync("lib/arquiteto/territory.ts", "utf8");
  assert.doesNotMatch(contrato, /keywordRefs: z\./, "TerritoryCandidate não pode persistir keywordRefs");
});

test("3 · mover A → B produz um patch por keyword, sobre a fonte canônica", () => {
  const plan = planMembershipChange({
    workingCopy: workingCopy({
      territories: [territory(), territory({ territoryRef: REF_B })],
      keywords: [keyword("kw-1", REF_A)],
    }),
    keywordIds: ["kw-1"],
    targetTerritoryRef: REF_B,
    state: "expand_existing_silo",
    reason: "Fronteira revista pelo humano.",
    source: "human",
    actorUserId: "user-1",
    decidedAt: NOW,
    kind: "move",
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.patches.length, 1);
  const patch = plan.patches[0];
  assert.equal(patch.workflowItemId, "wf-kw-1");
  assert.equal(patch.expectedLock, 1, "o lock do item vai junto: lost update é impossível");
  assert.equal(patch.assignment.territoryRef, REF_B);
  assert.equal(patch.assignment.territoryAssignment.state, "expand_existing_silo");
  // A saída da origem e a entrada no destino são a MESMA escrita.
  assert.equal(plan.patches.filter(item => item.keywordId === "kw-1").length, 1);
});

test("mudança de membership exige motivo e recusa alvo inválido", () => {
  assert.ok(change({ reason: "  " }).refusals.some(refusal => refusal.code === "REASON_REQUIRED"));
  assert.ok(change({ targetTerritoryRef: REF_B }).refusals.some(refusal => refusal.code === "TERRITORY_NOT_IN_WORKING_COPY"));
  assert.ok(change({ keywordIds: ["kw-1"] }).refusals.some(refusal => refusal.code === "ALREADY_IN_TARGET"));
  assert.ok(change({ keywordIds: ["kw-99"] }).refusals.some(refusal => refusal.code === "KEYWORD_NOT_IN_WORKING_COPY"));

  const outraBrand = change({
    workingCopy: workingCopy({ keywords: [{ ...keyword("kw-2", null), brandId: "brand-2" }] }),
  });
  assert.ok(outraBrand.refusals.some(refusal => refusal.code === "KEYWORD_CROSS_BRAND"));

  // Território encerrado não recebe membership.
  const encerrado = change({
    workingCopy: workingCopy({ territories: [territory({ lifecycleStatus: "superseded" })] }),
  });
  assert.ok(encerrado.refusals.some(refusal => refusal.code === "TERRITORY_NOT_ASSIGNABLE"));
});

/* ---------------------- 4 · operação parcial bloqueia --------------------- */

test("4 · lote parcial bloqueia confirmação e formação de Article", () => {
  const plan = planMembershipChange({
    workingCopy: workingCopy({ keywords: [keyword("kw-2", null), keyword("kw-3", null)] }),
    keywordIds: ["kw-2", "kw-3"],
    targetTerritoryRef: REF_A,
    state: "new_silo_candidate",
    reason: "Lote humano.",
    source: "human",
    actorUserId: "user-1",
    decidedAt: NOW,
  });

  const settled = settleMembershipOperation({
    operation: plan.operation,
    appliedKeywordIds: ["kw-2"],
    failedKeywordIds: ["kw-3"],
  });

  assert.equal(settled.status, "partial");
  assert.equal(settled.blocking, true);
  // Diz exatamente quem moveu e quem não moveu — sem autocorreção.
  assert.deepEqual(settled.operation.appliedKeywordIds, ["kw-2"]);
  assert.deepEqual(settled.operation.failedKeywordIds, ["kw-3"]);

  const bloqueado = deriveTerritorialWorkingView(workingCopy({
    territories: attachPendingOperation([confirmed()], settled.operation),
    keywords: [keyword("kw-2", REF_A), keyword("kw-3", null)],
  })).territories[0];

  assert.equal(bloqueado.confirmationReadiness.state, "blocked");
  assert.ok(bloqueado.confirmationReadiness.blockers.some(item => item.code === "PARTIAL_MEMBERSHIP_OPERATION"));
  assert.equal(bloqueado.articleFormationReadiness.state, "blocked");

  // Lote íntegro não bloqueia.
  const integro = settleMembershipOperation({ operation: plan.operation, appliedKeywordIds: ["kw-2", "kw-3"], failedKeywordIds: [] });
  assert.equal(integro.status, "applied");
  assert.equal(integro.blocking, false);
});

/* ------------------------ 5/6/7/8/9 · readiness --------------------------- */

test("5 · candidato sem narrativa, entidade, intenção ou fronteira não confirma", () => {
  const semNarrativa = territory({ narrative: emptyTerritoryNarrative() });
  assert.ok(territoryContentIssues(semNarrativa).some(issue => issue.code === "TERRITORY_NARRATIVE_UNRESOLVED"));

  const codes = (candidate: TerritoryCandidate) => territoryContentIssues(candidate).map(issue => issue.code);
  assert.ok(codes(territory({ centralEntity: "" })).includes("TERRITORY_WITHOUT_CENTRAL_ENTITY"));
  assert.ok(codes(territory({ macroIntent: "" })).includes("TERRITORY_WITHOUT_MACRO_INTENT"));
  assert.ok(codes(territory({ boundary: { includes: [], excludes: [] } })).includes("TERRITORY_WITHOUT_BOUNDARY"));
  assert.deepEqual(codes(territory()), [], "território descrito não tem pendência de conteúdo");

  const view = deriveTerritorialWorkingView(workingCopy({ territories: [semNarrativa] }));
  assert.equal(view.territories[0].confirmationReadiness.state, "blocked");
});

test("6/7 · confirmado libera Article; candidato não", () => {
  const confirmadoView = deriveTerritorialWorkingView(workingCopy({ territories: [confirmed()] }));
  assert.equal(confirmadoView.territories[0].confirmationReadiness.state, "ready");
  assert.equal(confirmadoView.territories[0].articleFormationReadiness.state, "allowed");

  const candidatoView = deriveTerritorialWorkingView(workingCopy());
  assert.equal(candidatoView.territories[0].articleFormationReadiness.state, "blocked");
  assert.ok(candidatoView.territories[0].articleFormationReadiness.refusals.some(item => item.code === "TERRITORY_NOT_CONFIRMED"));
});

test("8/9 · rejeitado e substituído não formam Article", () => {
  for (const lifecycleStatus of ["rejected", "superseded"] as const) {
    const alvo = territory({ lifecycleStatus, decisionState: lifecycleStatus === "rejected" ? "rejected" : "pending" });
    const view = deriveTerritorialWorkingView(workingCopy({ territories: [alvo] }));

    assert.equal(view.territories[0].articleFormationReadiness.state, "blocked", lifecycleStatus);
    assert.ok(view.territories[0].articleFormationReadiness.refusals.some(item => item.code === "TERRITORY_NOT_CONFIRMED"), lifecycleStatus);
  }
});

test("critério que depende da Etapa 0 fica adiado, nunca inventado", () => {
  const ancora = confirmed({
    architecturalOrigin: "existing",
    territoryKind: "existing",
    existingSiloRef: {
      siloId: "silo-a",
      siloDnaVersionRef: { entityId: "silo-a", versionId: "silo-a:v1", contentHash: `sha256:${"a".repeat(64)}` },
      siloPageVersionRef: null,
    },
  });

  const readiness = deriveTerritorialWorkingView(workingCopy({ territories: [ancora] })).territories[0].confirmationReadiness;

  assert.equal(readiness.state, "ready", "a evidência ausente não bloqueia");
  assert.equal(readiness.deferred[0]?.code, DEFERRED_EXTERNAL_EVIDENCE);
  assert.match(readiness.deferred[0]?.detail || "", /Etapa 0/);
});

/* --------------------------- 10/11/12 · split e merge --------------------- */

test("10 · split exige continuidade escolhida pelo humano", () => {
  const base = {
    source: territory(),
    parts: [{ partId: "p1", keywordIds: ["kw-1", "kw-2"] }, { partId: "p2", keywordIds: ["kw-3"] }],
    currentMemberKeywordIds: ["kw-1", "kw-2", "kw-3"],
    actorUserId: "user-1",
    decidedAt: NOW,
  };

  const semEscolha = planTerritorySplit({ ...base, continuingPartId: null });
  assert.ok(!semEscolha.ok && semEscolha.refusals.some(refusal => refusal.code === "SPLIT_CONTINUATION_NOT_DECLARED"));

  // A parte MENOR pode ser a continuidade: nada é inferido por tamanho.
  const escolhaMenor = planTerritorySplit({ ...base, continuingPartId: "p2", refFactory: () => REF_B });
  assert.ok(escolhaMenor.ok);
  if (!escolhaMenor.ok) return;
  assert.equal(escolhaMenor.plan.continuingTerritoryRef, REF_A);
  assert.equal(escolhaMenor.plan.parts.find(part => part.partId === "p2")?.territoryRef, REF_A);
  assert.deepEqual(escolhaMenor.plan.createdTerritoryRefs, [REF_B]);
  assert.equal(escolhaMenor.plan.createdLineageByRef.get(REF_B)?.splitFromTerritoryRef, REF_A);
  assert.deepEqual(escolhaMenor.plan.sourceLineage.splitIntoTerritoryRefs, [REF_B]);
});

test("11/12 · merge exige sobrevivente humano e recusa duas âncoras existentes", () => {
  const anchor = (ref: string, siloId: string) => territory({
    territoryRef: ref,
    architecturalOrigin: "existing",
    territoryKind: "existing",
    existingSiloRef: {
      siloId,
      siloDnaVersionRef: { entityId: siloId, versionId: `${siloId}:v1`, contentHash: `sha256:${"a".repeat(64)}` },
      siloPageVersionRef: null,
    },
  });

  const semSobrevivente = planTerritoryMerge({
    territories: [territory(), territory({ territoryRef: REF_B })],
    survivingTerritoryRef: null,
    assignments: [],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!semSobrevivente.ok && semSobrevivente.refusals.some(refusal => refusal.code === "MERGE_SURVIVOR_NOT_DECLARED"));

  const duasAncoras = planTerritoryMerge({
    territories: [anchor(REF_A, "silo-a"), anchor(REF_B, "silo-b")],
    survivingTerritoryRef: REF_A,
    assignments: [],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!duasAncoras.ok && duasAncoras.refusals.some(refusal => refusal.code === "MERGE_OF_TWO_EXISTING_ANCHORS"));

  const valido = planTerritoryMerge({
    territories: [territory(), territory({ territoryRef: REF_B })],
    survivingTerritoryRef: REF_B,
    assignments: [assignment("kw-1", REF_A)],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(valido.ok);
  if (!valido.ok) return;
  assert.deepEqual(valido.plan.absorbedTerritoryRefs, [REF_A]);
  assert.equal(valido.plan.absorbedLineageByRef.get(REF_A)?.supersededByTerritoryRef, REF_B);
});

/* ---------------------------- 13/14 · legado ------------------------------ */

test("13 · lista_id nunca gera território", () => {
  assert.equal(listaIdIsNeverTerritory("lista-legada"), null);
  assert.equal(listaIdIsNeverTerritory(null), null);

  const modulo = readFileSync("lib/arquiteto/territory-working-copy.ts", "utf8");
  assert.doesNotMatch(modulo, /buildTerritoryRef\(.*lista/i);
  assert.doesNotMatch(modulo, /territoryRef\s*[:=]\s*.*lista_id/);
});

test("14 · Article legado sem Silo é sinalizado, nunca movido", () => {
  const legado = resolveLegacyArticleReconciliation({
    brandId: BRAND,
    articles: [
      { articleId: "art-1", brandId: BRAND, siloId: null },
      { articleId: "art-2", brandId: BRAND, siloId: "silo-a" },
      { articleId: "art-3", brandId: "brand-2", siloId: null },
    ],
  });

  assert.deepEqual(legado.map(item => item.articleId), ["art-1"], "só o desta Brand e sem Silo");
  assert.equal(legado[0].code, "LEGACY_NEEDS_RECONCILIATION");
  assert.equal(legado[0].siloId, null, "nenhum Silo é inferido");
});

/* ------------------------ 15/16 · nível do cenário ------------------------ */

test("15/16 · cenário territorial exige level=silo e diff cruzado é recusado", async () => {
  const { buildScenarioUniverse } = await import("../lib/arquiteto/architecture-scenario.ts");
  const universe = await buildScenarioUniverse(["kw-1"]);
  const envelope = {
    schemaVersion: 1 as const,
    scenarioId: "scenario-silo",
    brandId: BRAND,
    scenarioType: "logic" as const,
    capability: "complete" as const,
    universe,
    baseRef: null,
    sourceRefs: [{ sourceType: "engine" as const, entityId: BRAND }],
    provenance: { producedBy: "engine" as const, adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
  };
  const silo = {
    ...envelope,
    level: "silo" as const,
    territories: [{
      territoryRef: REF_A,
      name: "Barreira cutânea",
      centralEntity: "barreira cutânea",
      macroIntent: "autoridade",
      boundary: { includes: ["barreira"], excludes: [] },
      keywordRefs: ["kw-1"],
      territoryKind: "new" as const,
      architecturalOrigin: "discovered" as const,
      publicationProtection: "unpublished" as const,
      slugProposal: null,
      existingSiloId: null,
      conflictCodes: [],
    }],
    unassignedKeywords: [],
  };
  const article = {
    ...envelope,
    level: "article" as const,
    articles: [{
      articleRef: "art-a",
      publishedAnchorId: null,
      principalKeywordId: "kw-1",
      keywords: [{ keywordId: "kw-1", role: "principal" as const }],
      protections: { principalPolicy: null, publishedUrl: null },
    }],
    ungroupedKeywordIds: [],
  };

  const { level, ...semLevel } = silo;
  void level;
  const recusado = safeParseArchitectureScenario(semLevel);
  assert.equal(recusado.ok, false);
  assert.equal(recusado.ok === false && recusado.code, "LEVEL_REQUIRED");
  assert.equal(safeParseArchitectureScenario(silo).ok, true);

  const diff = deriveArchitectureScenarioDiff(silo, article);
  assert.equal(diff.comparable, false);
  assert.equal(diff.incomparableReason, "LEVEL_MISMATCH");
});

/* -------------------------- 17 · limites da fase -------------------------- */

test("17 · zero provider, zero rede, zero persistência nova nesta fase", () => {
  const modulo = readFileSync("lib/arquiteto/territory-working-copy.ts", "utf8");

  assert.doesNotMatch(modulo, /fetch\(|supabase|dataforseo|deepseek|google-ads/i);
  assert.doesNotMatch(modulo, /localStorage|indexedDB|CREATE TABLE|migration/i);
  // Nada de formar ArticleDNA, consolidar SiloDNA/SiloPage ou tocar o grafo:
  // a checagem é sobre os IMPORTS, porque prosa pode citar os artefatos.
  const imports = modulo.split(/\r?\n/).filter(line => line.startsWith("import ") || line.startsWith('} from "')).join("\n");
  assert.doesNotMatch(imports, /contracts|silo-|article-|internal-link-graph|adapters/);
  assert.doesNotMatch(modulo, /ArticleDNASchema|SiloDNASchema|SiloPageSchema|createVersionEnvelope/);

  // A persistência continua sendo a rota canônica que já existe, com lock.
  const rota = readFileSync("app/api/arquiteto/workspace/route.ts", "utf8");
  assert.match(rota, /territoryRef: TerritoryRefSchema\.nullable\(\)\.optional\(\)/);
  // 2A.1: a decisão persistida NÃO carrega territoryRef. O ponteiro de
  // membership é o campo acima, e só ele.
  assert.match(rota, /territoryAssignment: KeywordTerritoryDecisionSchema/);
  assert.doesNotMatch(rota, /KeywordTerritoryAssignmentSchema/);
  assert.match(rota, /expectedLock/);
  // Payload jsonb já existente: nenhuma coluna, nenhuma migration nesta fase.
  assert.doesNotMatch(rota, /ALTER TABLE|CREATE TABLE/);
});
