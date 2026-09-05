import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ArchitectureScenarioSchema,
  buildScenarioUniverse,
  deriveArchitectureScenarioDiff,
  normalizeArchitectureScenario,
  parseArchitectureScenarioWithLegacyLevel,
  safeParseArchitectureScenario,
  validateArchitectureScenario,
  type ArticleArchitectureScenario,
  type SiloArchitectureScenario,
} from "../lib/arquiteto/architecture-scenario.ts";
import {
  TERRITORY_CONFIRMATION_BLOCKERS,
  TerritoryCandidateSchema,
  buildTerritoryRef,
  canTransitionTerritoryLifecycle,
  checkTerritorialConsistency,
  emptyTerritoryDiscovery,
  emptyTerritoryLineage,
  emptyTerritoryNarrative,
  isTerritoryRef,
  suggestionUsableAsKeywordId,
  keywordsBelongToTerritory,
  planTerritoryMerge,
  planTerritorySplit,
  projectTerritoryMembership,
  resolveArticleFormationReadiness,
  resolveMembershipOperationStatus,
  resolveTerritoryConfirmationReadiness,
  structuralChangeRefusal,
  territoryIdentityIssues,
  unassignedKeywordIds,
  type KeywordTerritoryAssignment,
  type TerritoryCandidate,
  type TerritoryLifecycleStatus,
} from "../lib/arquiteto/territory.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const HASH = `sha256:${"a".repeat(64)}`;

const versionRef = (entityId: string) => ({ entityId, versionId: `${entityId}:v1`, contentHash: HASH });

const REF_A = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const REF_B = buildTerritoryRef("22222222-2222-4222-8222-222222222222");
const REF_C = buildTerritoryRef("33333333-3333-4333-8333-333333333333");

function territory(overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate {
  return TerritoryCandidateSchema.parse({
    schemaVersion: 1,
    territoryRef: REF_A,
    brandId: BRAND,
    existingSiloRef: null,
    name: "Manicure",
    centralEntity: "manicure",
    macroIntent: "Aprender e contratar serviços de manicure",
    boundary: { includes: ["manicure"], excludes: ["pedicure"] },
    narrative: emptyTerritoryNarrative(),
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
    reasons: ["Território declarado por estratégia da Marca."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  });
}

const confirmed = (overrides: Partial<TerritoryCandidate> = {}) =>
  territory({ lifecycleStatus: "confirmed", decisionState: "confirmed", ...overrides });

function assignment(
  keywordId: string,
  territoryRef: string | null,
  overrides: Partial<KeywordTerritoryAssignment> = {},
): KeywordTerritoryAssignment {
  return {
    keywordId,
    brandId: BRAND,
    territoryRef,
    state: territoryRef ? "new_silo_candidate" : "unassigned",
    reason: territoryRef ? "Reservada para o território." : "Sem território adequado nesta rodada.",
    source: "human",
    decidedAt: NOW,
    ...overrides,
  } as KeywordTerritoryAssignment;
}

const report = (territories: TerritoryCandidate[], assignments: KeywordTerritoryAssignment[]) =>
  checkTerritorialConsistency({ brandId: BRAND, territories, assignments });

const issueCodes = (input: { issues: Array<{ code: string }> }) => input.issues.map(issue => issue.code);

/* ------------------------- nível do cenário (C1) ------------------------- */

async function articleScenario(overrides: Partial<ArticleArchitectureScenario> = {}): Promise<ArticleArchitectureScenario> {
  return {
    schemaVersion: 1,
    level: "article",
    scenarioId: "scenario-article",
    brandId: BRAND,
    scenarioType: "logic",
    capability: "complete",
    universe: await buildScenarioUniverse(["kw-1", "kw-2"]),
    baseRef: null,
    sourceRefs: [{ sourceType: "engine", entityId: BRAND }],
    articles: [{
      articleRef: "art-a",
      publishedAnchorId: null,
      principalKeywordId: "kw-1",
      keywords: [{ keywordId: "kw-1", role: "principal" }, { keywordId: "kw-2", role: "secundaria" }],
      protections: { principalPolicy: null, publishedUrl: null },
    }],
    ungroupedKeywordIds: [],
    provenance: { producedBy: "engine", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  };
}

async function siloScenario(overrides: Partial<SiloArchitectureScenario> = {}): Promise<SiloArchitectureScenario> {
  return {
    schemaVersion: 1,
    level: "silo",
    scenarioId: "scenario-silo",
    brandId: BRAND,
    scenarioType: "logic",
    capability: "complete",
    universe: await buildScenarioUniverse(["kw-1", "kw-2"]),
    baseRef: null,
    sourceRefs: [{ sourceType: "engine", entityId: BRAND }],
    territories: [{
      territoryRef: REF_A,
      name: "Manicure",
      centralEntity: "manicure",
      macroIntent: "contratar manicure",
      boundary: { includes: ["manicure"], excludes: [] },
      keywordRefs: ["kw-1", "kw-2"],
      territoryKind: "new",
      architecturalOrigin: "discovered",
      publicationProtection: "unpublished",
      slugProposal: "/manicure",
      existingSiloId: null,
      conflictCodes: [],
    }],
    unassignedKeywords: [],
    provenance: { producedBy: "engine", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  };
}

test("A · cenário novo sem level é recusado com LEVEL_REQUIRED", async () => {
  const { level, ...semLevel } = await articleScenario();
  void level;

  const parsed = safeParseArchitectureScenario(semLevel);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.ok === false && parsed.code, "LEVEL_REQUIRED");
  assert.equal(ArchitectureScenarioSchema.safeParse(semLevel).success, false);
  // Nível desconhecido também é recusado: não existe fallback silencioso.
  assert.equal(safeParseArchitectureScenario({ ...semLevel, level: "keyword" }).ok, false);
});

test("B · a borda legada nomeada é o único ponto que assume article", async () => {
  const { level, ...semLevel } = await articleScenario();
  void level;

  const legado = parseArchitectureScenarioWithLegacyLevel(semLevel);

  assert.equal(legado.ok, true);
  assert.equal(legado.ok && legado.scenario.level, "article");
  // A borda não reescreve um nível declarado.
  const silo = parseArchitectureScenarioWithLegacyLevel(await siloScenario());
  assert.equal(silo.ok && silo.scenario.level, "silo");
  // E o domínio continua exigindo o discriminador.
  const modulo = readFileSync("lib/arquiteto/architecture-scenario.ts", "utf8");
  const defaults = modulo.match(/level: "article"/g) || [];
  assert.equal(defaults.length, 1, "o default de nível existe em um lugar só");
});

test("C · diff entre níveis diferentes devolve LEVEL_MISMATCH sem entradas", async () => {
  const article = await articleScenario();
  const silo = await siloScenario();

  const diff = deriveArchitectureScenarioDiff(article, silo);

  assert.equal(diff.comparable, false);
  assert.equal(diff.levelMatch, false);
  assert.equal(diff.incomparableReason, "LEVEL_MISMATCH");
  assert.deepEqual(diff.entries, []);
  assert.ok(issueCodes(validateArchitectureScenario(silo, { expectedLevel: "article" })).includes("LEVEL_MISMATCH"));
});

test("cenário de nível Silo valida partição e normaliza determinismo", async () => {
  const silo = await siloScenario();
  assert.deepEqual(validateArchitectureScenario(silo, { brandId: BRAND, expectedUniverse: silo.universe }), { valid: true, issues: [] });

  const duplicado = await siloScenario({
    territories: [
      { ...(await siloScenario()).territories[0], keywordRefs: ["kw-1"] },
      { ...(await siloScenario()).territories[0], territoryRef: REF_B, keywordRefs: ["kw-1", "kw-2"] },
    ],
  });
  assert.ok(issueCodes(validateArchitectureScenario(duplicado)).includes("DUPLICATE_KEYWORD"));

  const bagunçado = await siloScenario({
    territories: [
      { ...(await siloScenario()).territories[0], territoryRef: REF_B, keywordRefs: ["kw-2"] },
      { ...(await siloScenario()).territories[0], territoryRef: REF_A, keywordRefs: ["kw-1"] },
    ],
  });
  const primeira = normalizeArchitectureScenario(bagunçado);
  assert.deepEqual(normalizeArchitectureScenario(primeira), primeira);
  assert.deepEqual(primeira.territories.map(item => item.territoryRef), [REF_A, REF_B]);
});

test("diff territorial registra movimento, atribuição e mudança de fronteira", async () => {
  const base = await siloScenario();
  const candidato = await siloScenario({
    territories: [
      { ...base.territories[0], keywordRefs: ["kw-1"], boundary: { includes: ["manicure", "esmalte"], excludes: [] }, slugProposal: "/unhas" },
      { ...base.territories[0], territoryRef: REF_B, keywordRefs: ["kw-2"] },
    ],
  });

  const diff = deriveArchitectureScenarioDiff(base, candidato);

  assert.equal(diff.comparable, true);
  assert.equal(diff.summary.territoryCreatedCount, 1);
  assert.equal(diff.summary.keywordTerritoryMovedCount, 1);
  assert.equal(diff.summary.boundaryChangedCount, 1);
  assert.equal(diff.summary.slugProposalChangedCount, 1);
  assert.equal(diff.entries.find(entry => entry.type === "KEYWORD_TERRITORY_MOVED")?.toTerritoryRef, REF_B);
});

/* ---------------------------- identidade (C4) ---------------------------- */

test("D · territoryRef é opaco e independente de siloId e lista_id", () => {
  assert.ok(isTerritoryRef(REF_A));
  assert.ok(REF_A.startsWith("territory:"));
  assert.equal(isTerritoryRef("silo-123"), false);
  assert.equal(isTerritoryRef("territory:silo-123"), false);

  assert.deepEqual(territoryIdentityIssues({ territoryRef: REF_A, siloId: "silo-legado", listaId: "lista-legada" }), []);
  assert.deepEqual(
    territoryIdentityIssues({ territoryRef: REF_A, siloId: "11111111-1111-4111-8111-111111111111" }),
    ["TERRITORY_REF_DERIVED_FROM_SILO_ID"],
  );
  assert.deepEqual(
    territoryIdentityIssues({ territoryRef: REF_A, listaId: "11111111-1111-4111-8111-111111111111" }),
    ["TERRITORY_REF_DERIVED_FROM_LISTA_ID"],
  );
  assert.deepEqual(territoryIdentityIssues({ territoryRef: "silo-123" }), ["TERRITORY_REF_INVALID"]);
  // Dois refs gerados nunca colidem nem carregam significado.
  assert.notEqual(buildTerritoryRef(), buildTerritoryRef());
});

/* ------------------------- contagem não é autoridade (C3) ---------------- */

test("E · MANUAL_STRATEGIC com uma única keyword é território válido e confirmável", () => {
  // Território descrito: a Fase 2A passou a exigir narrativa, entidade,
  // intenção e fronteira para confirmar. O que este teste prova é outra coisa —
  // que a CONTAGEM de keywords não é o obstáculo.
  const descrito = territory({
    architecturalOrigin: "manual_strategic",
    narrative: { statement: "Uma linha editorial própria.", continuity: "coherent", brandAlignment: "aligned", rationale: ["Estratégia da Marca."] },
  });
  const assignments = [assignment("kw-1", REF_A)];

  const consistency = report([descrito], assignments);
  const readiness = resolveTerritoryConfirmationReadiness({ territory: descrito, report: consistency });

  assert.equal(consistency.consistent, true);
  assert.deepEqual(projectTerritoryMembership(assignments).get(REF_A), ["kw-1"]);
  assert.equal(readiness.state, "ready", "uma keyword basta: contagem é sinal, não autoridade");

  // E o que bloqueia é a descrição ausente, não a quantidade.
  const semNarrativa = resolveTerritoryConfirmationReadiness({ territory: territory(), report: consistency });
  assert.equal(semNarrativa.state, "blocked");
  assert.deepEqual(semNarrativa.blockers.map(blocker => blocker.code), ["TERRITORY_NARRATIVE_UNRESOLVED"]);
});

test("F · MANUAL_STRATEGIC sem keyword existe como candidato e bloqueia só na confirmação", () => {
  const vazio = territory({ architecturalOrigin: "manual_strategic" });

  const consistency = report([vazio], []);
  const readiness = resolveTerritoryConfirmationReadiness({ territory: vazio, report: consistency });

  // EMPTY_TERRITORY é diagnóstico: o estrategista pode declarar antes de reservar.
  assert.ok(issueCodes(consistency).includes("EMPTY_TERRITORY"));
  assert.equal(consistency.consistent, true, "território vazio não torna a paisagem inconsistente");
  // Mas confirmar libera formação de Article, e isso exige keywords reservadas.
  assert.equal(readiness.state, "blocked");
  assert.ok(readiness.blockers.map(blocker => blocker.code).includes("EMPTY_TERRITORY"));
  assert.ok(TERRITORY_CONFIRMATION_BLOCKERS.includes("EMPTY_TERRITORY"));
});

/* -------------------------------- membership ----------------------------- */

test("G/H · keyword em exatamente um território, ou unassigned com motivo", () => {
  const assignments = [assignment("kw-1", REF_A), assignment("kw-2", null)];

  const consistency = report([territory()], assignments);

  assert.equal(consistency.consistent, true);
  assert.deepEqual(projectTerritoryMembership(assignments).get(REF_A), ["kw-1"]);
  assert.deepEqual(unassignedKeywordIds(assignments), ["kw-2"]);
  assert.equal(keywordsBelongToTerritory(assignments, REF_A, ["kw-1"]).ok, true);
  assert.deepEqual(keywordsBelongToTerritory(assignments, REF_A, ["kw-2"]).foreignKeywordIds, ["kw-2"]);
});

test("H · unassigned sem motivo é recusado pelo contrato e pela consistência", () => {
  assert.equal(
    TerritoryCandidateSchema.safeParse({ ...territory(), reasons: [""] }).success,
    false,
    "motivo vazio não é motivo",
  );
  const semMotivo = { ...assignment("kw-1", null), reason: " " } as KeywordTerritoryAssignment;
  assert.ok(issueCodes(report([territory()], [semMotivo])).includes("UNASSIGNED_WITHOUT_REASON"));
});

test("I · a mesma keyword em dois lugares é reportada como inconsistência", () => {
  const duplicada = [assignment("kw-1", REF_A), assignment("kw-1", REF_B)];

  const consistency = report([territory(), territory({ territoryRef: REF_B })], duplicada);

  assert.ok(issueCodes(consistency).includes("DUPLICATE_KEYWORD_MEMBERSHIP"));
  assert.equal(consistency.consistent, false);
});

test("J · territoryRef órfão vira issue e nunca é corrigido automaticamente", () => {
  const orfa = assignment("kw-1", REF_C);

  const consistency = report([territory()], [orfa]);

  const issue = consistency.issues.find(item => item.code === "ORPHAN_TERRITORY_REF");
  assert.equal(issue?.keywordId, "kw-1");
  assert.equal(issue?.territoryRef, REF_C);
  assert.equal(orfa.territoryRef, REF_C, "a atribuição original permanece intacta");
  assert.equal(consistency.consistent, false);
});

/* ---------------------------------- split (E2) --------------------------- */

test("K · split com continuidade declarada preserva a ref da origem", () => {
  const resultado = planTerritorySplit({
    source: territory(),
    parts: [{ partId: "p1", keywordIds: ["kw-1", "kw-2"] }, { partId: "p2", keywordIds: ["kw-3"] }],
    continuingPartId: "p1",
    currentMemberKeywordIds: ["kw-1", "kw-2", "kw-3"],
    actorUserId: "user-1",
    decidedAt: NOW,
    refFactory: () => REF_B,
  });

  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.plan.continuingTerritoryRef, REF_A);
  assert.deepEqual(resultado.plan.createdTerritoryRefs, [REF_B]);
  assert.equal(resultado.plan.parts.find(part => part.partId === "p1")?.territoryRef, REF_A);
  assert.equal(resultado.plan.parts.find(part => part.partId === "p2")?.territoryRef, REF_B);
  // Linhagem reconstrói a operação pelas duas pontas.
  assert.deepEqual(resultado.plan.sourceLineage.splitIntoTerritoryRefs, [REF_B]);
  assert.equal(resultado.plan.createdLineageByRef.get(REF_B)?.splitFromTerritoryRef, REF_A);
});

test("L · split sem continuidade declarada é recusado, nunca inferido", () => {
  const base = {
    source: territory(),
    parts: [{ partId: "p1", keywordIds: ["kw-1", "kw-2"] }, { partId: "p2", keywordIds: ["kw-3"] }],
    currentMemberKeywordIds: ["kw-1", "kw-2", "kw-3"],
    actorUserId: "user-1",
    decidedAt: NOW,
  };

  const semContinuidade = planTerritorySplit({ ...base, continuingPartId: null });
  assert.equal(semContinuidade.ok, false);
  assert.ok(!semContinuidade.ok && semContinuidade.refusals.some(refusal => refusal.code === "SPLIT_CONTINUATION_NOT_DECLARED"));

  const parteInexistente = planTerritorySplit({ ...base, continuingPartId: "p9" });
  assert.ok(!parteInexistente.ok && parteInexistente.refusals.some(refusal => refusal.code === "SPLIT_CONTINUATION_UNKNOWN_PART"));

  // Nem tamanho, nem posição, nem volume decidem: sem declaração, não há plano.
  assert.equal(semContinuidade.ok, false);
});

test("split não perde nem duplica keyword", () => {
  const perdida = planTerritorySplit({
    source: territory(),
    parts: [{ partId: "p1", keywordIds: ["kw-1"] }, { partId: "p2", keywordIds: ["kw-2"] }],
    continuingPartId: "p1",
    currentMemberKeywordIds: ["kw-1", "kw-2", "kw-3"],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!perdida.ok && perdida.refusals.some(refusal => refusal.code === "SPLIT_KEYWORD_LOST"));

  const duplicada = planTerritorySplit({
    source: territory(),
    parts: [{ partId: "p1", keywordIds: ["kw-1", "kw-2"] }, { partId: "p2", keywordIds: ["kw-2"] }],
    continuingPartId: "p1",
    currentMemberKeywordIds: ["kw-1", "kw-2"],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!duplicada.ok && duplicada.refusals.some(refusal => refusal.code === "SPLIT_DUPLICATE_KEYWORD"));
});

/* ---------------------------------- merge (E3) --------------------------- */

test("M · merge com sobrevivente declarado marca os absorvidos como superseded", () => {
  const resultado = planTerritoryMerge({
    territories: [territory(), territory({ territoryRef: REF_B })],
    survivingTerritoryRef: REF_A,
    assignments: [assignment("kw-1", REF_A), assignment("kw-2", REF_B)],
    actorUserId: "user-1",
    decidedAt: NOW,
  });

  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.plan.survivingTerritoryRef, REF_A);
  assert.deepEqual(resultado.plan.absorbedTerritoryRefs, [REF_B]);
  assert.deepEqual(resultado.plan.keywordReassignments, [{ keywordId: "kw-2", fromTerritoryRef: REF_B, toTerritoryRef: REF_A }]);
  assert.deepEqual(resultado.plan.survivorLineage.absorbedTerritoryRefs, [REF_B]);
  assert.equal(resultado.plan.absorbedLineageByRef.get(REF_B)?.supersededByTerritoryRef, REF_A);
});

test("N · merge sem sobrevivente declarado é recusado, nunca inferido", () => {
  const semSobrevivente = planTerritoryMerge({
    territories: [territory(), territory({ territoryRef: REF_B })],
    survivingTerritoryRef: null,
    assignments: [],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!semSobrevivente.ok && semSobrevivente.refusals.some(refusal => refusal.code === "MERGE_SURVIVOR_NOT_DECLARED"));

  const foraDoLote = planTerritoryMerge({
    territories: [territory(), territory({ territoryRef: REF_B })],
    survivingTerritoryRef: REF_C,
    assignments: [],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!foraDoLote.ok && foraDoLote.refusals.some(refusal => refusal.code === "MERGE_SURVIVOR_NOT_PARTICIPANT"));
});

test("O · merge de dois Silos existentes distintos é recusado; o mesmo Silo é permitido", () => {
  const anchorA = territory({ architecturalOrigin: "existing", territoryKind: "existing", existingSiloRef: { siloId: "silo-a", siloDnaVersionRef: versionRef("silo-a"), siloPageVersionRef: null } });
  const anchorB = territory({ territoryRef: REF_B, architecturalOrigin: "existing", territoryKind: "existing", existingSiloRef: { siloId: "silo-b", siloDnaVersionRef: versionRef("silo-b"), siloPageVersionRef: null } });

  const distintos = planTerritoryMerge({
    territories: [anchorA, anchorB],
    survivingTerritoryRef: REF_A,
    assignments: [],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!distintos.ok && distintos.refusals.some(refusal => refusal.code === "MERGE_OF_TWO_EXISTING_ANCHORS"));

  // Dois territórios sobre a MESMA âncora é o defeito que o merge resolve.
  const mesmaAncora = { ...anchorB, existingSiloRef: anchorA.existingSiloRef };
  const duplicado = report([anchorA, mesmaAncora], []);
  assert.ok(issueCodes(duplicado).includes("DUPLICATE_EXISTING_SILO_ANCHOR"));
  const permitido = planTerritoryMerge({
    territories: [anchorA, mesmaAncora],
    survivingTerritoryRef: REF_A,
    assignments: [],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.equal(permitido.ok, true);
});

/* ------------------- operação parcial bloqueia confirmação (E1) ---------- */

test("P · operação de membership parcial bloqueia a confirmação do território", () => {
  const parcial = {
    operationId: "op-1",
    kind: "merge" as const,
    actorUserId: "user-1",
    startedAt: NOW,
    participantTerritoryRefs: [REF_A, REF_B],
    intendedKeywordIds: ["kw-1", "kw-2", "kw-3"],
    appliedKeywordIds: ["kw-1", "kw-2"],
    failedKeywordIds: ["kw-3"],
  };
  const alvo = territory({ pendingOperation: parcial });
  const assignments = [assignment("kw-1", REF_A), assignment("kw-2", REF_A), assignment("kw-3", REF_B)];

  const consistency = report([alvo, territory({ territoryRef: REF_B })], assignments);
  const readiness = resolveTerritoryConfirmationReadiness({ territory: alvo, report: consistency });
  const formation = resolveArticleFormationReadiness({
    territory: confirmed({ pendingOperation: parcial }),
    report: consistency,
    assignments,
  });

  assert.equal(resolveMembershipOperationStatus(parcial), "partial");
  assert.ok(issueCodes(consistency).includes("PARTIAL_MEMBERSHIP_OPERATION"));
  assert.equal(readiness.state, "blocked");
  assert.ok(readiness.blockers.map(blocker => blocker.code).includes("PARTIAL_MEMBERSHIP_OPERATION"));
  assert.equal(formation.state, "blocked", "meio caminho não é arquitetura confirmável");
  // Cada keyword continua em exatamente um lugar: o lote é que ficou incompleto.
  assert.equal(consistency.issues.some(issue => issue.code === "DUPLICATE_KEYWORD_MEMBERSHIP"), false);
  assert.equal(resolveMembershipOperationStatus({ ...parcial, failedKeywordIds: [], appliedKeywordIds: ["kw-1", "kw-2", "kw-3"] }), "applied");
  assert.equal(resolveMembershipOperationStatus({ ...parcial, failedKeywordIds: [] }), "in_progress");
});

/* --------------------------- gate de Article ----------------------------- */

test("Q · território confirmado e consistente libera a formação de Article", () => {
  const alvo = confirmed();
  const assignments = [assignment("kw-1", REF_A), assignment("kw-2", REF_A)];

  const formation = resolveArticleFormationReadiness({
    territory: alvo,
    report: report([alvo], assignments),
    assignments,
    requestedKeywordIds: ["kw-1", "kw-2"],
  });

  assert.equal(formation.state, "allowed");
  assert.deepEqual(formation.keywordIds, ["kw-1", "kw-2"]);
  assert.deepEqual(formation.refusals, []);
});

test("R · candidato, rejeitado e substituído bloqueiam a formação de Article", () => {
  const estados: TerritoryLifecycleStatus[] = ["candidate", "rejected", "superseded"];

  for (const lifecycleStatus of estados) {
    const alvo = territory({
      lifecycleStatus,
      decisionState: lifecycleStatus === "rejected" ? "rejected" : "pending",
    });
    const assignments = [assignment("kw-1", REF_A)];

    const formation = resolveArticleFormationReadiness({ territory: alvo, report: report([alvo], assignments), assignments });

    assert.equal(formation.state, "blocked", lifecycleStatus);
    assert.ok(formation.refusals.some(refusal => refusal.code === "TERRITORY_NOT_CONFIRMED"), lifecycleStatus);
  }
});

test("keyword fora do território selecionado é recusada na formação", () => {
  const alvo = confirmed();
  const assignments = [assignment("kw-1", REF_A), assignment("kw-9", REF_B)];

  const formation = resolveArticleFormationReadiness({
    territory: alvo,
    report: report([alvo, confirmed({ territoryRef: REF_B })], assignments),
    assignments,
    requestedKeywordIds: ["kw-1", "kw-9"],
  });

  assert.equal(formation.state, "blocked");
  assert.equal(formation.refusals.find(refusal => refusal.code === "KEYWORD_OUTSIDE_TERRITORY")?.detail, "kw-9");
});

/* ------------------------ consolidado e publicado ------------------------ */

test("S · território consolidado não aceita alteração estrutural normal", () => {
  const consolidado = territory({
    lifecycleStatus: "consolidated",
    decisionState: "confirmed",
    consolidation: {
      siloId: "silo-novo",
      // 2C.1: os refs da consolidação carregam versionNumber — só o número diz
      // QUAL passo da cadeia de sucessão consolidou o território.
      siloDnaVersionRef: { ...versionRef("silo-novo"), versionNumber: 1 },
      siloPageVersionRef: { ...versionRef("silo-page:silo-novo"), versionNumber: 1 },
      consolidatedAt: NOW,
    },
  });

  assert.equal(structuralChangeRefusal(consolidado)?.code, "SUCCESSOR_REQUIRED");
  const transicao = canTransitionTerritoryLifecycle("consolidated", "candidate");
  assert.equal(transicao.allowed, false);
  assert.equal(transicao.allowed === false ? transicao.code : null, "SUCCESSOR_REQUIRED");
  assert.equal(canTransitionTerritoryLifecycle("consolidated", "superseded").allowed, true);

  const split = planTerritorySplit({
    source: consolidado,
    parts: [{ partId: "p1", keywordIds: ["kw-1"] }, { partId: "p2", keywordIds: ["kw-2"] }],
    continuingPartId: "p1",
    currentMemberKeywordIds: ["kw-1", "kw-2"],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!split.ok && split.refusals.some(refusal => refusal.code === "SUCCESSOR_REQUIRED"));

  const assignments = [assignment("kw-1", REF_A)];
  const formation = resolveArticleFormationReadiness({ territory: consolidado, report: report([consolidado], assignments), assignments });
  assert.ok(formation.refusals.some(refusal => refusal.code === "SUCCESSOR_REQUIRED"));

  // Consolidado sem referências do par é contrato inválido.
  assert.equal(TerritoryCandidateSchema.safeParse({ ...consolidado, consolidation: null }).success, false);
});

test("T · referência cross-brand é reportada em território e em membership", () => {
  const outraBrand = territory({ brandId: "brand-2" });
  const consistency = report([outraBrand], [assignment("kw-1", REF_A, { brandId: "brand-2" })]);

  const codes = issueCodes(consistency);
  assert.equal(codes.filter(code => code === "CROSS_BRAND_MEMBERSHIP").length, 2);
  assert.equal(consistency.consistent, false);
});

test("U · proteção de publicado recusa alteração estrutural destrutiva", () => {
  const publicado = territory({
    architecturalOrigin: "existing",
    territoryKind: "existing",
    publicationProtection: "protected",
    existingSiloRef: { siloId: "silo-publicado", siloDnaVersionRef: versionRef("silo-publicado"), siloPageVersionRef: versionRef("silo-page:silo-publicado") },
    slugState: { proposals: [], confirmed: null, publishedSlug: "/manicure", publishedCanonical: "https://marca.com/manicure" },
  });

  assert.equal(structuralChangeRefusal(publicado)?.code, "PUBLISHED_PROTECTION_VIOLATION");

  const split = planTerritorySplit({
    source: publicado,
    parts: [{ partId: "p1", keywordIds: ["kw-1"] }, { partId: "p2", keywordIds: ["kw-2"] }],
    continuingPartId: "p1",
    currentMemberKeywordIds: ["kw-1", "kw-2"],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!split.ok && split.refusals.some(refusal => refusal.code === "PUBLISHED_PROTECTION_VIOLATION"));

  // Absorver um publicado num merge também é recusado; o publicado só sobrevive.
  const absorvido = planTerritoryMerge({
    territories: [territory({ territoryRef: REF_B }), publicado],
    survivingTerritoryRef: REF_B,
    assignments: [],
    actorUserId: "user-1",
    decidedAt: NOW,
  });
  assert.ok(!absorvido.ok && absorvido.refusals.some(refusal => refusal.code === "PUBLISHED_PROTECTION_VIOLATION"));

  // O slug publicado permanece no contrato e não é substituído por proposta.
  assert.equal(publicado.slugState.publishedSlug, "/manicure");
  assert.equal(publicado.slugState.confirmed, null);
});

/* -------------------------- limites desta fase --------------------------- */

test("Fase 1 é domínio puro: sem storage, sem provider, sem DDL", () => {
  // Só o código: os comentários explicam justamente o que o módulo NÃO faz.
  const modulo = readFileSync("lib/arquiteto/territory.ts", "utf8").split("\n").filter(line => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  }).join("\n");

  assert.doesNotMatch(modulo, /fetch\(|supabase|migration/i);
  assert.doesNotMatch(modulo, /artifact_type|ARTIFACT_TYPE|persistArquiteto|editorial_workflow_items/);
  assert.doesNotMatch(modulo, /silo_architecture_scenario/);
  // Território não cria SiloDNA, SiloPage nem lista do Minerador nesta fase.
  assert.doesNotMatch(modulo, /minerador_keyword_lists|createCanonicalManualSilo/);
});
