import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TerritoryCandidateSchema,
  buildTerritoryRef,
  emptyTerritoryDiscovery,
  emptyTerritoryLineage,
  type TerritoryCandidate,
} from "../lib/arquiteto/territory.ts";
import {
  DEFERRED_EXTERNAL_EVIDENCE,
  confirmSiloConsolidation,
  pillarIsNeverInferred,
  planTerritorialSiloComposition,
  resolveSiloConsolidationReadiness,
  type PublishedSiloIdentity,
  type SiloConsolidationDecision,
  type TerritorialSiloArticle,
  type TerritorialSiloComposition,
} from "../lib/arquiteto/silo-consolidation-territorial.ts";
import { SiloDNASchema, SiloPageSchema } from "../lib/arquiteto/contracts.ts";
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

const article = (
  articleId: string,
  overrides: Partial<TerritorialSiloArticle> = {},
): TerritorialSiloArticle => ({
  articleId,
  brandId: BRAND,
  territoryRef: REF_A,
  articleDnaVersionId: `${articleId}:v1`,
  articleDnaContentHash: HASH,
  isConsolidated: true,
  isHumanApproved: true,
  ...overrides,
});

const exclusion = (articleId: string, overrides: Partial<{ actorUserId: string; decidedAt: string; reason: string }> = {}) => ({
  articleId,
  actorUserId: "user-1",
  decidedAt: NOW,
  reason: "Fora da fronteira deste Silo por decisão editorial.",
  ...overrides,
});

const composition = (overrides: Partial<TerritorialSiloComposition> = {}): TerritorialSiloComposition => ({
  territoryRef: REF_A,
  brandId: BRAND,
  pillarArticleId: "art-pilar",
  supportArticleIds: ["art-s1"],
  exclusions: [],
  ...overrides,
});

const decision = (overrides: Partial<SiloConsolidationDecision> = {}): SiloConsolidationDecision => ({
  actorUserId: "user-1",
  decidedAt: NOW,
  reason: "Arquitetura revisada e aprovada.",
  territoryRef: REF_A,
  pillarArticleId: "art-pilar",
  supportArticleIds: ["art-s1"],
  excludedArticleIds: [],
  publishedIdentityResolved: false,
  ...overrides,
});

const readiness = (overrides: Parameters<typeof resolveSiloConsolidationReadiness>[0] | null = null) =>
  resolveSiloConsolidationReadiness(overrides || {
    territory: territory(),
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1")],
    decision: decision(),
  });

const codes = (result: ReturnType<typeof resolveSiloConsolidationReadiness>) =>
  result.blockers.map(blocker => blocker.code);

// --- 1..5 - territoryRef nos contratos de Silo -------------------------------

const siloDnaBase = {
  schemaVersion: 1, formationStatus: "formed", siloId: "silo-1", brandId: BRAND,
  centralEntity: "e", objective: "o", audience: "a", macroProblem: "m", dominantIntent: "d",
  pillarArticleId: "art-pilar", supportArticleIds: ["art-s1"],
  articleReferences: [
    { articleId: "art-pilar", articleDnaVersionId: "art-pilar:v1", articleDnaContentHash: HASH, role: "Pilar" },
    { articleId: "art-s1", articleDnaVersionId: "art-s1:v1", articleDnaContentHash: HASH, role: "Suporte" },
  ],
  articleRoles: [], narrativeOrder: [], linkMap: [], boundary: "b",
  includedTopics: [], excludedTopics: [], nearbySiloIds: [], possibleConflicts: [],
  gaps: [], nextContents: [], confidence: 1, humanPendingDecisions: [],
};

test("1 · SiloDNA legado sem territoryRef continua legível", () => {
  const legado = SiloDNASchema.safeParse(siloDnaBase);
  assert.equal(legado.success, true, "a ausência de territoryRef não pode ser erro de schema");
  assert.equal(legado.success && legado.data.territoryRef, undefined);
});

test("2 · SiloPage legada sem territoryRef continua legível", () => {
  const page = SiloPageSchema.safeParse({
    schemaVersion: 1, formationStatus: "formed", siloPageId: "silo-page:silo-1", brandId: BRAND,
    siloDnaRef: { entityId: "silo-1", versionId: "silo-1:v1", contentHash: HASH },
    siloId: "silo-1", slug: "/barreira", publicationStatus: "new",
    h1: "h", seoTitle: "s", metaDescription: "m", canonical: null, intro: "i",
    sections: [], cta: "c", coverImageBrief: "cb", visualBriefing: "vb", breadcrumbs: [],
    pillarArticleId: "art-pilar", supportArticleIds: ["art-s1"], indexationStatus: "index",
    alerts: [], confidence: 1, humanPendingDecisions: [],
  });
  assert.equal(page.success, true);
  assert.equal(page.success && page.data.territoryRef, undefined);
});

test("3 · novo Silo-first sem territoryRef é bloqueado", () => {
  const resultado = readiness({
    territory: territory(),
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1")],
    decision: decision(),
    siloDnaTerritoryRef: null,
    siloPageTerritoryRef: null,
  });
  assert.equal(resultado.state, "blocked");
  assert.equal(codes(resultado).filter(code => code === "SILO_TERRITORY_REF_MISSING").length, 2);
});

test("4 · territoryRef divergente entre SiloDNA e SiloPage é bloqueado", () => {
  const resultado = readiness({
    territory: territory(),
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1")],
    decision: decision(),
    siloDnaTerritoryRef: REF_A,
    siloPageTerritoryRef: REF_B,
  });
  assert.equal(resultado.state, "blocked");
  const mismatch = resultado.blockers.find(blocker => blocker.code === "SILO_TERRITORY_REF_MISMATCH");
  assert.match(mismatch!.detail, /^SiloPage/);
});

test("5 · território diferente do declarado no par é bloqueado", () => {
  const resultado = readiness({
    territory: territory(),
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1")],
    decision: decision(),
    siloDnaTerritoryRef: REF_B,
    siloPageTerritoryRef: REF_B,
  });
  assert.equal(codes(resultado).filter(code => code === "SILO_TERRITORY_REF_MISMATCH").length, 2);
  // O territoryRef opaco nunca sai de siloId, lista_id ou slug.
  const modulo = readFileSync(new URL("../lib/arquiteto/silo-consolidation-territorial.ts", import.meta.url), "utf8");
  const executavel = modulo.split("\n").filter(line => {
    const t = line.trim();
    return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
  }).join("\n");
  assert.equal(/lista_id/.test(executavel), false);
});

// --- 6..11 - invariantes Pilar/Suporte --------------------------------------

test("6 · consolidação sem Pilar é bloqueada", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition({ pillarArticleId: null, supportArticleIds: ["art-s1"] }),
    articles: [article("art-s1")],
  });
  assert.equal(plano.ok, false);
  assert.ok(plano.issues.some(issue => issue.code === "PILLAR_NOT_SELECTED"));
});

test("7 · zero Articles é bloqueado", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition({ pillarArticleId: null, supportArticleIds: [] }),
    articles: [],
  });
  assert.ok(plano.issues.some(issue => issue.code === "ZERO_ARTICLES"));
});

test("8 · Pilar também como Suporte é bloqueado", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition({ pillarArticleId: "art-pilar", supportArticleIds: ["art-pilar"] }),
    articles: [article("art-pilar")],
  });
  assert.ok(plano.issues.some(issue => issue.code === "PILLAR_ALSO_SUPPORT"));
  assert.ok(plano.issues.some(issue => issue.code === "ROLE_COMPOSITION_CONFLICT"));
});

test("9 · Suporte duplicado é bloqueado", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition({ supportArticleIds: ["art-s1", "art-s1"] }),
    articles: [article("art-pilar"), article("art-s1")],
  });
  const issue = plano.issues.find(item => item.code === "DUPLICATE_SUPPORT");
  assert.equal(issue?.detail, "art-s1");
});

test("10 · referência de Article incoerente é bloqueada", () => {
  const semVersao = planTerritorialSiloComposition({
    composition: composition(),
    articles: [article("art-pilar", { articleDnaVersionId: null, articleDnaContentHash: null }), article("art-s1")],
  });
  assert.ok(semVersao.issues.some(issue => issue.code === "ARTICLE_REFERENCE_INCOHERENT"));

  const inexistente = planTerritorialSiloComposition({
    composition: composition({ supportArticleIds: ["art-fantasma"] }),
    articles: [article("art-pilar")],
  });
  const issue = inexistente.issues.find(item => item.code === "ARTICLE_REFERENCE_INCOHERENT");
  assert.match(issue!.detail, /art-fantasma/);
});

test("11 · papéis incoerentes: nenhum Article em mais de um papel", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition({ supportArticleIds: ["art-s1"], exclusions: [exclusion("art-s1")] }),
    articles: [article("art-pilar"), article("art-s1")],
  });
  const issue = plano.issues.find(item => item.code === "ROLE_COMPOSITION_CONFLICT");
  assert.equal(issue?.detail, "art-s1");
});

test("12 · Article de outro território é bloqueado", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1", { territoryRef: REF_B })],
  });
  const issue = plano.issues.find(item => item.code === "ARTICLE_OUTSIDE_TERRITORY");
  assert.equal(issue?.detail, "art-s1");
});

test("13 · Article legado sem territoryRef vai para reconciliação", () => {
  const resultado = readiness({
    territory: territory(),
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1", { territoryRef: null })],
    decision: decision(),
  });
  const blocker = resultado.blockers.find(item => item.code === "LEGACY_ARTICLE_NEEDS_RECONCILIATION");
  assert.equal(blocker?.detail, "art-s1");
  // Não foi preenchido em silêncio.
  assert.equal(resultado.state, "blocked");
});

// --- 14..18 - composição válida e cobertura ---------------------------------

test("14 · exatamente 1 Pilar passa", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition({ supportArticleIds: [] }),
    articles: [article("art-pilar")],
  });
  assert.equal(plano.ok, true);
  assert.deepEqual(plano.dispositions, [{ articleId: "art-pilar", disposition: "pillar" }]);
});

test("15 · 1 Pilar + N Suportes passa", () => {
  const supports = ["art-s1", "art-s2", "art-s3"];
  const plano = planTerritorialSiloComposition({
    composition: composition({ supportArticleIds: supports }),
    articles: [article("art-pilar"), ...supports.map(id => article(id))],
  });
  assert.equal(plano.ok, true);
  assert.equal(plano.dispositions.filter(item => item.disposition === "pillar").length, 1);
  assert.equal(plano.dispositions.filter(item => item.disposition === "support").length, 3);
});

test("16 · Article não coberto por nenhum papel é bloqueado", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1"), article("art-orfao")],
  });
  const issue = plano.issues.find(item => item.code === "ARTICLE_COVERAGE_GAP");
  assert.equal(issue?.detail, "art-orfao");
});

test("17 · exclusão humana explícita cobre o Article", () => {
  const plano = planTerritorialSiloComposition({
    composition: composition({ exclusions: [exclusion("art-orfao")] }),
    articles: [article("art-pilar"), article("art-s1"), article("art-orfao")],
  });
  assert.equal(plano.ok, true);
  assert.equal(
    plano.dispositions.find(item => item.articleId === "art-orfao")?.disposition,
    "explicitly_excluded",
  );
  // A exclusão NÃO vira papel de ArticleDNA.
  const contrato = readFileSync(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(/explicitly_excluded/.test(contrato), false);
});

test("18 · exclusão sem decisão humana completa é bloqueada", () => {
  for (const faltando of [{ actorUserId: "" }, { decidedAt: "" }, { reason: "" }]) {
    const plano = planTerritorialSiloComposition({
      composition: composition({ exclusions: [exclusion("art-orfao", faltando)] }),
      articles: [article("art-pilar"), article("art-s1"), article("art-orfao")],
    });
    assert.ok(
      plano.issues.some(issue => issue.code === "EXCLUSION_WITHOUT_HUMAN_DECISION"),
      JSON.stringify(faltando),
    );
  }
});

// --- 19..22 - readiness territorial -----------------------------------------

test("19 · operação de membership parcial bloqueia a consolidação", () => {
  const parcial = territory({
    pendingOperation: {
      operationId: "op-1", kind: "move", actorUserId: "user-1", startedAt: NOW,
      participantTerritoryRefs: [REF_A], intendedKeywordIds: ["kw-1", "kw-2"],
      appliedKeywordIds: ["kw-1"], failedKeywordIds: ["kw-2"],
    },
  });
  const resultado = readiness({
    territory: parcial, composition: composition(),
    articles: [article("art-pilar"), article("art-s1")], decision: decision(),
  });
  assert.ok(codes(resultado).includes("PARTIAL_OPERATION_PENDING"));
});

test("20 · operação inacabada, sem falhas, também bloqueia", () => {
  const inacabada = territory({
    pendingOperation: {
      operationId: "op-2", kind: "move", actorUserId: "user-1", startedAt: NOW,
      participantTerritoryRefs: [REF_A], intendedKeywordIds: ["kw-1", "kw-2"],
      appliedKeywordIds: ["kw-1"], failedKeywordIds: [],
    },
  });
  const resultado = readiness({
    territory: inacabada, composition: composition(),
    articles: [article("art-pilar"), article("art-s1")], decision: decision(),
  });
  assert.ok(codes(resultado).includes("UNFINISHED_MEMBERSHIP_OPERATION"));
  assert.equal(codes(resultado).includes("PARTIAL_OPERATION_PENDING"), false);
});

test("21 · território candidate bloqueia a consolidação", () => {
  const resultado = readiness({
    territory: territory({ lifecycleStatus: "candidate", decisionState: "pending" }),
    composition: composition(),
    articles: [article("art-pilar"), article("art-s1")],
    decision: decision(),
  });
  assert.ok(codes(resultado).includes("TERRITORY_NOT_CONFIRMED"));
});

test("22 · território confirmado avança quando o resto fecha", () => {
  const resultado = readiness();
  assert.equal(resultado.state, "ready", JSON.stringify(resultado.blockers));
  assert.deepEqual(resultado.blockers, []);

  // Keyword nunca endereçada bloqueia.
  const comPendencia = readiness({
    territory: territory(), composition: composition(),
    articles: [article("art-pilar"), article("art-s1")], decision: decision(),
    keywordTerritoryStates: [{ keywordId: "kw-9", state: "unaddressed" }],
  });
  assert.ok(codes(comPendencia).includes("UNADDRESSED_KEYWORDS"));

  // Article sem consolidação ou sem aprovação humana bloqueia.
  const semConsolidacao = readiness({
    territory: territory(), composition: composition(),
    articles: [article("art-pilar", { isConsolidated: false }), article("art-s1", { isHumanApproved: false })],
    decision: decision(),
  });
  assert.ok(codes(semConsolidacao).includes("ARTICLE_NOT_CONSOLIDATED"));
  assert.ok(codes(semConsolidacao).includes("ARTICLE_NOT_HUMAN_APPROVED"));
});

// --- 23..25 - quem aprova ---------------------------------------------------

test("23 · IA não consolida", () => {
  const outcome = confirmSiloConsolidation({
    readiness: readiness(), composition: composition(), decision: decision(), actor: "ai",
  });
  assert.equal(outcome.status, "refused");
  assert.ok(outcome.refusals.some(refusal => refusal.code === "ONLY_HUMAN_MAY_CONSOLIDATE"));
});

test("24 · SERP e Lógica também não consolidam", () => {
  for (const actor of ["serp", "logic", "current"] as const) {
    const outcome = confirmSiloConsolidation({
      readiness: readiness(), composition: composition(), decision: decision(), actor,
    });
    assert.equal(outcome.status, "refused", actor);
    assert.ok(outcome.refusals.some(refusal => refusal.code === "ONLY_HUMAN_MAY_CONSOLIDATE"), actor);
  }
  // Pilar nunca sai de sinal automático.
  assert.equal(pillarIsNeverInferred({ volume: 9999, kgrScore: 0.1, position: 1, articleCount: 5, aiSuggestion: "art-x", serpSuggestion: "art-y" }), null);
});

test("25 · decisão humana consolida, e precisa descrever a MESMA arquitetura", () => {
  const ok = confirmSiloConsolidation({
    readiness: readiness(), composition: composition(), decision: decision(), actor: "human",
  });
  assert.equal(ok.status, "consolidated");
  assert.equal(ok.status === "consolidated" ? ok.pillarArticleId : null, "art-pilar");

  // Decisão que aprova outro Pilar não consolida esta composição.
  const divergente = confirmSiloConsolidation({
    readiness: readiness(), composition: composition(),
    decision: decision({ pillarArticleId: "art-s1", supportArticleIds: ["art-pilar"] }), actor: "human",
  });
  assert.equal(divergente.status, "refused");
  assert.ok(divergente.refusals.some(refusal => refusal.code === "DECISION_DOES_NOT_MATCH_COMPOSITION"));

  // Nem o humano consolida estrutura não pronta.
  const naoPronta = confirmSiloConsolidation({
    readiness: { state: "blocked", blockers: [{ code: "PILLAR_NOT_SELECTED", detail: "x" }], deferred: [] },
    composition: composition(), decision: decision(), actor: "human",
  });
  assert.ok(naoPronta.refusals.some(refusal => refusal.code === "SILO_NOT_READY_FOR_CONSOLIDATION"));
});

// --- 26..30 - publicado, sucessão, identidades e providers ------------------

const publicada = (overrides: Partial<PublishedSiloIdentity> = {}): PublishedSiloIdentity => ({
  siloPageId: "silo-page:silo-1",
  publicationStatus: "published",
  slug: "/barreira",
  canonical: "https://marca.com/barreira",
  publishedUrl: "https://marca.com/barreira",
  verification: "verified",
  ...overrides,
});

test("26 · identidade publicada unknown ou em conflito exige decisão humana", () => {
  for (const verification of ["unknown", "conflict"] as const) {
    const bloqueado = readiness({
      territory: territory(), composition: composition(),
      articles: [article("art-pilar"), article("art-s1")], decision: decision(),
      publishedIdentity: publicada({ verification }),
    });
    assert.ok(codes(bloqueado).includes("PUBLISHED_IDENTITY_DECISION_REQUIRED"), verification);

    const decidido = readiness({
      territory: territory(), composition: composition(),
      articles: [article("art-pilar"), article("art-s1")],
      decision: decision({ publishedIdentityResolved: true }),
      publishedIdentity: publicada({ verification }),
    });
    assert.equal(decidido.state, "ready", verification);
  }
  // O módulo não reescreve slug, canonical nem URL publicada.
  const modulo = readFileSync(new URL("../lib/arquiteto/silo-consolidation-territorial.ts", import.meta.url), "utf8");
  assert.equal(/\bslug\s*=|\bcanonical\s*=|\bpublishedUrl\s*=/.test(modulo), false);
});

test("27 · mudança estrutural após consolidação exige sucessora", () => {
  const outcome = confirmSiloConsolidation({
    readiness: readiness(), composition: composition(), decision: decision(),
    actor: "human", alreadyConsolidated: true,
  });
  assert.equal(outcome.status, "refused");
  assert.ok(outcome.refusals.some(refusal => refusal.code === "SUCCESSOR_REQUIRED"));
});

test("28 · lista_id não vira território nem Silo", () => {
  const resultado = readiness({
    territory: territory(), composition: composition(),
    articles: [article("art-pilar"), article("art-s1")], decision: decision(),
    siloDnaTerritoryRef: "lista-77", siloPageTerritoryRef: "lista-77",
  });
  assert.equal(codes(resultado).filter(code => code === "SILO_TERRITORY_REF_MISMATCH").length, 2);
  assert.equal(codes(resultado).includes("SILO_TERRITORY_REF_MISSING"), false);
});

test("29 · cross-level continua com LEVEL_MISMATCH prioritário", () => {
  const universe = { contentHash: "sha256:mesmo" };
  const diff = deriveArchitectureScenarioDiff(
    { level: "silo", scenarioType: "current", universe } as never,
    { level: "article", scenarioType: "logic", universe } as never,
  );
  assert.equal(diff.incomparableReason, "LEVEL_MISMATCH");
  assert.equal(diff.universeMatch, true);
});

test("30 · zero providers, zero rede, zero persistência no domínio", () => {
  const modulo = readFileSync(new URL("../lib/arquiteto/silo-consolidation-territorial.ts", import.meta.url), "utf8");
  assert.doesNotMatch(modulo, /fetch\(|supabase|dataforseo|deepseek|google-ads|openai|anthropic/i);
  assert.doesNotMatch(modulo, /localStorage|indexedDB|CREATE TABLE|ALTER TABLE|migration|\.rpc\(/i);
  const imports = modulo.split(/\r?\n/).filter(line => line.startsWith("import ") || line.startsWith('} from "')).join("\n");
  assert.doesNotMatch(imports, /internal-link-graph|radar|publicacoes|site-|sitemap/);

  // Evidência externa indisponível é ADIADA, nunca fabricada.
  const adiado = readiness({
    territory: territory(), composition: composition(),
    articles: [article("art-pilar"), article("art-s1")], decision: decision(),
    publishedIdentity: publicada(),
    publishedStructureEvidenceAvailable: false,
  });
  assert.equal(adiado.state, "ready");
  assert.equal(adiado.deferred[0]?.code, DEFERRED_EXTERNAL_EVIDENCE);
});
