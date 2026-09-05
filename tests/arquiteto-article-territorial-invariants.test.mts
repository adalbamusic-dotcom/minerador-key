import assert from "node:assert/strict";
import test from "node:test";
import {
  TerritoryCandidateSchema,
  buildTerritoryRef,
  emptyTerritoryDiscovery,
  emptyTerritoryLineage,
  type TerritoryCandidate,
} from "../lib/arquiteto/territory.ts";
import {
  MAX_ADDITIONAL_KEYWORDS_PER_ARTICLE,
  articleNeedsTerritorialReconciliation,
  planArticleDnaConsolidation,
  resolveArticleConfirmationReadiness,
  resolveUnknownProtectionState,
  type ArticleCompositionDraft,
  type ArticleConfirmationReadiness,
  type ArticleProposal,
  type ExistingArticleState,
  type PublicationProtectionDecision,
  type TerritorialArticleKeyword,
} from "../lib/arquiteto/article-formation-territorial.ts";
import { ArticleDNASchema } from "../lib/arquiteto/contracts.ts";
import { deriveArchitectureScenarioDiff } from "../lib/arquiteto/architecture-scenario.ts";

const BRAND = "brand-1";
const NOW = "2026-09-02T12:00:00.000Z";
const REF_A = buildTerritoryRef("11111111-1111-4111-8111-111111111111");
const REF_B = buildTerritoryRef("22222222-2222-4222-8222-222222222222");
const HASH = `sha256:${"a".repeat(64)}`;

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
    narrative: { statement: "Da barreira ao ritual.", continuity: "coherent", brandAlignment: "aligned", rationale: ["Sustenta."] },
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "new",
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "ui",
    lifecycleStatus: "confirmed",
    decisionState: "confirmed",
    publicationProtection: "unpublished",
    slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: ["Confirmado."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  });
}

const keyword = (
  keywordId: string,
  territoryRef: string | null = REF_A,
  territoryState: TerritorialArticleKeyword["territoryState"] = "assigned",
): TerritorialArticleKeyword => ({
  keywordId,
  brandId: BRAND,
  territoryRef: territoryRef as TerritorialArticleKeyword["territoryRef"],
  territoryState,
  isPublished: false,
  workingArticleId: null,
});

const READY: ArticleConfirmationReadiness = { state: "ready", blockers: [] };

const composition = (overrides: Partial<ArticleCompositionDraft> = {}): ArticleCompositionDraft => ({
  articleId: "artigo-1",
  brandId: BRAND,
  territoryRef: REF_A,
  principalKeywordId: "kw-1",
  secondaryKeywordIds: ["kw-2"],
  narrativeReinforcementIds: [],
  ...overrides,
});

const membership = (ids: string[], articleId = "artigo-1") =>
  new Map<string, string | null>(ids.map(id => [id, articleId]));

function consolidate(overrides: Partial<Parameters<typeof planArticleDnaConsolidation>[0]> = {}) {
  const comp = overrides.composition || composition();
  const all = [comp.principalKeywordId, ...comp.secondaryKeywordIds, ...comp.narrativeReinforcementIds];
  return planArticleDnaConsolidation({
    composition: comp,
    territory: territory(),
    readiness: READY,
    keywords: all.map(id => keyword(id)),
    workingMembership: membership(all, comp.articleId),
    ...overrides,
  });
}

const universe = (contentHash: string) => ({ contentHash });

// --- 1..3 - precedência do nível sobre o universo ---------------------------

test("1 · silo × article com o MESMO universo é LEVEL_MISMATCH", () => {
  const mesmo = universe("sha256:identico");
  const diff = deriveArchitectureScenarioDiff(
    { level: "silo", scenarioType: "current", universe: mesmo } as never,
    { level: "article", scenarioType: "logic", universe: mesmo } as never,
  );
  assert.equal(diff.comparable, false);
  assert.equal(diff.incomparableReason, "LEVEL_MISMATCH");
  assert.equal(diff.levelMatch, false);
  assert.equal(diff.universeMatch, true);
});

test("2 · silo × article com universos DIFERENTES continua LEVEL_MISMATCH", () => {
  const diff = deriveArchitectureScenarioDiff(
    { level: "silo", scenarioType: "current", universe: universe("sha256:um") } as never,
    { level: "article", scenarioType: "logic", universe: universe("sha256:dois") } as never,
  );
  assert.equal(diff.incomparableReason, "LEVEL_MISMATCH");
  assert.notEqual(diff.incomparableReason, "UNIVERSE_HASH_MISMATCH");

  // E o nível é decidido SEM tocar no universo: universo ausente não vira exceção.
  const semUniverso = deriveArchitectureScenarioDiff(
    { level: "silo", scenarioType: "current" } as never,
    { level: "article", scenarioType: "logic" } as never,
  );
  assert.equal(semUniverso.incomparableReason, "LEVEL_MISMATCH");
  assert.equal(semUniverso.universeMatch, false);
});

test("3 · mesmo nível com universos diferentes é UNIVERSE_HASH_MISMATCH", () => {
  for (const level of ["article", "silo"] as const) {
    const diff = deriveArchitectureScenarioDiff(
      { level, scenarioType: "current", universe: universe("sha256:um") } as never,
      { level, scenarioType: "logic", universe: universe("sha256:dois") } as never,
    );
    assert.equal(diff.incomparableReason, "UNIVERSE_HASH_MISMATCH", level);
    assert.equal(diff.levelMatch, true, level);
    assert.equal(diff.universeMatch, false, level);
  }
});

// --- 4..6 - território obrigatório no Article novo --------------------------

test("4 · ArticleDNA novo sem territoryRef é recusado", () => {
  const plano = consolidate({ composition: composition({ territoryRef: null }) });
  assert.equal(plano.status, "refused");
  assert.ok(plano.refusals.some(item => item.code === "NEW_SILO_FIRST_ARTICLE_WITHOUT_TERRITORY"));
});

test("5 · ArticleDNA legado sem territoryRef continua legível e vai para reconciliação", () => {
  // LEGACY_READ_COMPATIBILITY: o schema NÃO exige o campo.
  const legado = ArticleDNASchema.safeParse({ articleId: "artigo-legado" });
  assert.equal(legado.success, false); // faltam outros campos obrigatórios
  assert.equal(
    (legado as { error: { issues: Array<{ path: PropertyKey[] }> } }).error.issues
      .some(issue => issue.path[0] === "territoryRef"),
    false,
    "a ausência de territoryRef não pode ser erro de schema",
  );
  assert.equal(articleNeedsTerritorialReconciliation({ territoryRef: null }), true);
  assert.equal(articleNeedsTerritorialReconciliation({}), true);
  assert.equal(articleNeedsTerritorialReconciliation({ territoryRef: REF_A }), false);
});

test("6 · ArticleDNA novo com keyword fora do território é recusado", () => {
  const comp = composition({ secondaryKeywordIds: ["kw-forasteira"] });
  const plano = planArticleDnaConsolidation({
    composition: comp,
    territory: territory(),
    readiness: READY,
    keywords: [keyword("kw-1"), keyword("kw-forasteira", REF_B)],
    workingMembership: membership(["kw-1", "kw-forasteira"]),
  });
  assert.equal(plano.status, "refused");
  const recusa = plano.refusals.find(item => item.code === "ARTICLE_KEYWORD_OUTSIDE_TERRITORY");
  assert.equal(recusa?.detail, "kw-forasteira");

  // Keyword sem endereçamento territorial também não entra.
  const semEndereco = planArticleDnaConsolidation({
    composition: composition({ secondaryKeywordIds: ["kw-nova"] }),
    territory: territory(),
    readiness: READY,
    keywords: [keyword("kw-1"), keyword("kw-nova", null, "unaddressed")],
    workingMembership: membership(["kw-1", "kw-nova"]),
  });
  assert.ok(semEndereco.refusals.some(item => item.code === "ARTICLE_KEYWORD_OUTSIDE_TERRITORY"));
});

test("7 · território de versão consolidada não muda in-place: exige sucessora", () => {
  const trocando = consolidate({
    consolidatedVersion: { articleId: "artigo-1", territoryRef: REF_B },
  });
  assert.equal(trocando.status, "refused");
  const recusa = trocando.refusals.find(item => item.code === "TERRITORY_CHANGE_REQUIRES_SUCCESSOR");
  assert.equal(recusa?.detail, `${REF_B} -> ${REF_A}`);

  // Mesmo território: segue como sucessora legítima, não como update.
  const mesmo = consolidate({ consolidatedVersion: { articleId: "artigo-1", territoryRef: REF_A } });
  assert.equal(mesmo.status, "allowed");
  assert.equal(mesmo.intent, "successor");

  // Primeira consolidação é create.
  const primeira = consolidate();
  assert.equal(primeira.status, "allowed");
  assert.equal(primeira.status === "allowed" ? primeira.intent : null, "create");
});

// --- 8..10 - proteção unknown -----------------------------------------------

const incerto = (overrides: Partial<ExistingArticleState> = {}): ExistingArticleState => ({
  articleId: "artigo-incerto",
  brandId: BRAND,
  territoryRef: REF_A,
  principalKeywordId: "kw-pub",
  keywordIds: ["kw-pub"],
  publicationProtection: "unknown",
  publishedSlug: "/pub",
  publishedCanonical: "https://marca.com/pub",
  publishedUrl: "https://marca.com/pub",
  ...overrides,
});

const proposta = (overrides: Partial<ArticleProposal> = {}): ArticleProposal => ({
  proposalId: "prop-1",
  territoryRef: REF_A,
  principalKeywordId: "kw-pub",
  keywordIds: ["kw-pub"],
  definition: {
    mainIntent: "m", audience: "a", promise: "p", antiCannibalizationBoundary: "b",
  },
  source: "logic",
  reasons: [],
  humanDecisionRequired: [],
  humanApproved: false,
  ...overrides,
});

const decisao = (decision: PublicationProtectionDecision["decision"]): PublicationProtectionDecision => ({
  articleId: "artigo-incerto",
  decision,
  actorUserId: "user-1",
  decidedAt: NOW,
  reason: "Publicação examinada por um humano.",
});

test("8 · unknown com a MESMA principal e sem decisão humana continua bloqueado", () => {
  assert.equal(
    resolveUnknownProtectionState({ article: incerto(), intendedPrincipalKeywordId: "kw-pub", decision: null }),
    "HUMAN_DECISION_REQUIRED",
  );
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposta(),
    keywords: [keyword("kw-pub")],
    existingArticles: [incerto()],
  });
  assert.equal(readiness.state, "blocked", "não mudar a principal NÃO é decisão humana");
  const blocker = readiness.blockers.find(item => item.code === "HUMAN_DECISION_PENDING");
  assert.match(blocker!.detail, /preservar a principal também precisa ser decidido/);
});

test("9 · unknown com tentativa de trocar a principal é conflito de proteção", () => {
  assert.equal(
    resolveUnknownProtectionState({ article: incerto(), intendedPrincipalKeywordId: "kw-outra", decision: null }),
    "PROTECTION_CONFLICT",
  );
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposta({ principalKeywordId: "kw-outra", keywordIds: ["kw-pub", "kw-outra"] }),
    keywords: [keyword("kw-pub"), keyword("kw-outra")],
    existingArticles: [incerto()],
  });
  assert.ok(readiness.blockers.some(item => item.code === "PUBLICATION_PROTECTION_CONFLICT"));
});

test("10 · unknown com decisão humana explícita de preservar libera a confirmação", () => {
  assert.equal(
    resolveUnknownProtectionState({
      article: incerto(),
      intendedPrincipalKeywordId: "kw-pub",
      decision: decisao("preserve_principal"),
    }),
    "RESOLVED_PRESERVED",
  );
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposta(),
    keywords: [keyword("kw-pub")],
    existingArticles: [incerto()],
    protectionDecisions: [decisao("preserve_principal")],
  });
  assert.equal(readiness.state, "ready");

  // Liberar mudança estrutural NÃO consolida in-place: exige sucessora.
  const liberado = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposta(),
    keywords: [keyword("kw-pub")],
    existingArticles: [incerto()],
    protectionDecisions: [decisao("allow_structural_change")],
  });
  assert.equal(liberado.state, "blocked");
  assert.ok(liberado.blockers.some(item => item.code === "STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR"));
});

// --- 11..13 - teto sobre o CONJUNTO e coerência de papéis -------------------

const ref = (keywordId: string, role: string) => ({
  keywordId,
  keywordDnaVersionId: `${keywordId}:v1`,
  keywordDnaContentHash: HASH,
  role,
  strategicContribution: "x",
  coveredIntentions: ["i"],
  requiredTopics: [],
  excludedTopics: [],
  classificationOrigin: "human",
  confidence: 1,
  humanConfirmed: true,
});

const dna = (overrides: Record<string, unknown>) => ArticleDNASchema.safeParse({
  schemaVersion: 1, articleId: "a1", brandId: BRAND,
  principalKeywordId: "A", secondaryKeywordIds: [], narrativeReinforcementIds: [],
  keywordReferences: [ref("A", "principal")],
  siloId: null, hierarchy: "Pilar", suggestedSlug: "s", canonical: null, mainIntent: "m",
  auxiliaryIntents: [], audience: "a", problem: "p", desiredResult: "d", journeyStage: "j",
  brandObjective: "o", promise: "pr", angle: "an", cta: "c", coverage: ["c1"],
  excludedSubjects: [], antiCannibalizationBoundary: "b", nearbyArticleIds: [],
  differentiation: [], entities: [], requiredTopics: [], questions: [], objections: [],
  evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 1,
  humanPendingDecisions: [],
  ...overrides,
});

test("11 · 3 secundárias + 3 reforços é recusado, mesmo com cada array ≤ 5", () => {
  const sete = dna({
    secondaryKeywordIds: ["B", "C", "D"],
    narrativeReinforcementIds: ["E", "F", "G"],
    keywordReferences: ["A", "B", "C", "D", "E", "F", "G"].map((k, i) => ref(k, i === 0 ? "principal" : "secundaria")),
  });
  assert.equal(sete.success, false, "cada array cabe em 5, mas a SOMA não cabe em 6");

  // 3 + 2 = 5 adicionais: no teto, permitido.
  const seis = dna({
    secondaryKeywordIds: ["B", "C", "D"],
    narrativeReinforcementIds: ["E", "F"],
    keywordReferences: ["A", "B", "C", "D", "E", "F"].map((k, i) => ref(k, i === 0 ? "principal" : "secundaria")),
  });
  assert.equal(seis.success, true);

  // O gate de consolidação mede a mesma SOMA.
  const plano = consolidate({
    composition: composition({
      secondaryKeywordIds: ["kw-2", "kw-3", "kw-4"],
      narrativeReinforcementIds: ["kw-5", "kw-6", "kw-7"],
    }),
  });
  const recusa = plano.refusals.find(item => item.code === "ADDITIONAL_KEYWORD_LIMIT_EXCEEDED");
  assert.equal(recusa?.detail, "6 > 5");
  assert.equal(MAX_ADDITIONAL_KEYWORDS_PER_ARTICLE, 5);
});

test("12 · a mesma keyword em dois papéis é recusada", () => {
  const doisPapeis = dna({
    secondaryKeywordIds: ["B"],
    narrativeReinforcementIds: ["B"],
    keywordReferences: [ref("A", "principal"), ref("B", "secundaria")],
  });
  assert.equal(doisPapeis.success, false);
  assert.ok(
    (doisPapeis as { error: { issues: Array<{ message: string }> } }).error.issues
      .some(issue => issue.message.includes("dois papeis")),
  );

  // Principal repetida entre as secundárias também é recusada.
  const principalRepetida = dna({
    secondaryKeywordIds: ["A"],
    keywordReferences: [ref("A", "principal")],
  });
  assert.equal(principalRepetida.success, false);

  // E o gate de consolidação recusa a mesma coisa.
  const plano = consolidate({
    composition: composition({ secondaryKeywordIds: ["kw-2"], narrativeReinforcementIds: ["kw-2"] }),
  });
  const recusa = plano.refusals.find(item => item.code === "ROLE_DUPLICATE_KEYWORD");
  assert.equal(recusa?.detail, "kw-2");
});

test("13 · mais de 6 keywordReferences é recusado", () => {
  const sete = dna({
    secondaryKeywordIds: ["B", "C", "D", "E", "F"],
    keywordReferences: ["A", "B", "C", "D", "E", "F", "G"].map((k, i) => ref(k, i === 0 ? "principal" : "secundaria")),
  });
  assert.equal(sete.success, false);
  assert.ok(
    (sete as { error: { issues: Array<{ message: string }> } }).error.issues
      .some(issue => /<=6|maximo cinco/.test(issue.message)),
  );
});

// --- 14 - working membership × composição consolidada -----------------------

test("14 · working membership divergente da composição é recusada", () => {
  // kw-2 está na composição mas não pertence a este Article na working copy.
  const faltando = planArticleDnaConsolidation({
    composition: composition(),
    territory: territory(),
    readiness: READY,
    keywords: [keyword("kw-1"), keyword("kw-2")],
    workingMembership: new Map<string, string | null>([["kw-1", "artigo-1"], ["kw-2", null]]),
  });
  assert.equal(faltando.status, "refused");
  const recusaFalta = faltando.refusals.find(item => item.code === "WORKING_MEMBERSHIP_DIVERGES_FROM_COMPOSITION");
  assert.match(recusaFalta!.detail, /fora da working copy: kw-2/);

  // kw-3 pertence ao Article na working copy mas ficou fora da composição.
  const sobrando = planArticleDnaConsolidation({
    composition: composition(),
    territory: territory(),
    readiness: READY,
    keywords: [keyword("kw-1"), keyword("kw-2"), keyword("kw-3")],
    workingMembership: membership(["kw-1", "kw-2", "kw-3"]),
  });
  assert.equal(sobrando.status, "refused");
  const recusaSobra = sobrando.refusals.find(item => item.code === "WORKING_MEMBERSHIP_DIVERGES_FROM_COMPOSITION");
  assert.match(recusaSobra!.detail, /fora da composicao: kw-3/);

  // Correspondência exata passa.
  assert.equal(consolidate().status, "allowed");
});

test("15 · readiness não pronta impede a consolidação, mesmo com tudo o resto correto", () => {
  const plano = consolidate({
    readiness: { state: "blocked", blockers: [{ code: "ARTICLE_DEFINITION_INCOMPLETE", detail: "mainIntent" }] },
  });
  assert.equal(plano.status, "refused");
  const recusa = plano.refusals.find(item => item.code === "ARTICLE_NOT_READY_FOR_CONFIRMATION");
  assert.equal(recusa?.detail, "ARTICLE_DEFINITION_INCOMPLETE");
});
