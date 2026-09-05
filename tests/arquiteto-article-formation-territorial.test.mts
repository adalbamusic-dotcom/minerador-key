import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KeywordTerritoryAssignmentSchema,
  TerritoryCandidateSchema,
  buildTerritoryRef,
  checkTerritorialConsistency,
  emptyTerritoryDiscovery,
  emptyTerritoryLineage,
  type KeywordTerritoryAssignment,
  type TerritoryCandidate,
} from "../lib/arquiteto/territory.ts";
import {
  ARTICLE_CONFIRMATION_BLOCKER_CODES,
  articleIdentityIsNeverTerritory,
  confirmArticleStructure,
  emptyArticleDefinition,
  planArticleFormationForTerritory,
  resolveArticleConfirmationReadiness,
  type ArticleProposal,
  type ArticleConfirmationReadiness,
  type ExistingArticleState,
  type TerritorialArticleKeyword,
} from "../lib/arquiteto/article-formation-territorial.ts";
import { ArticleDNASchema, ProvisionalArticleGroupSchema } from "../lib/arquiteto/contracts.ts";
import { deriveArchitectureScenarioDiff, safeParseArchitectureScenario } from "../lib/arquiteto/architecture-scenario.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "../lib/arquiteto/domain-rules.ts";

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
    lifecycleStatus: "confirmed",
    decisionState: "confirmed",
    publicationProtection: "unpublished",
    slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: ["Território confirmado pela estratégia da Marca."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
    ...overrides,
  });
}

const assign = (keywordId: string, territoryRef: string | null): KeywordTerritoryAssignment =>
  KeywordTerritoryAssignmentSchema.parse({
    keywordId,
    brandId: BRAND,
    territoryRef,
    state: territoryRef ? "new_silo_candidate" : "unassigned",
    reason: "Decisão humana explícita.",
    source: "human",
    decidedAt: NOW,
  });

const keyword = (
  keywordId: string,
  territoryRef: string | null,
  territoryState: TerritorialArticleKeyword["territoryState"] = "assigned",
  extra: Partial<TerritorialArticleKeyword> = {},
): TerritorialArticleKeyword => ({
  keywordId,
  brandId: BRAND,
  territoryRef: territoryRef as TerritorialArticleKeyword["territoryRef"],
  territoryState,
  isPublished: false,
  workingArticleId: null,
  ...extra,
});

const definition = () => ({
  mainIntent: "explicar a função da barreira cutânea",
  audience: "pele sensível",
  promise: "entender antes de comprar",
  antiCannibalizationBoundary: "não cobre rotina de acne",
});

function plan(input: {
  territory?: TerritoryCandidate;
  keywords: TerritorialArticleKeyword[];
  assignments: KeywordTerritoryAssignment[];
  groupings?: Parameters<typeof planArticleFormationForTerritory>[0]["groupings"];
  existingArticles?: ExistingArticleState[];
}) {
  const target = input.territory || territory();
  return planArticleFormationForTerritory({
    territory: target,
    report: checkTerritorialConsistency({ brandId: BRAND, territories: [target], assignments: input.assignments }),
    assignments: input.assignments,
    keywords: input.keywords,
    existingArticles: input.existingArticles || [],
    groupings: input.groupings,
  });
}

const proposal = (overrides: Partial<ArticleProposal> = {}): ArticleProposal => ({
  proposalId: "prop-1",
  territoryRef: REF_A,
  principalKeywordId: "kw-1",
  keywordIds: ["kw-1", "kw-2"],
  definition: definition(),
  source: "logic",
  reasons: [],
  humanDecisionRequired: [],
  humanApproved: false,
  ...overrides,
});

// --- 1..2 - gate de lifecycle -----------------------------------------------

test("1 · território candidate não forma Article", () => {
  const candidato = territory({ lifecycleStatus: "candidate", decisionState: "pending" });
  const resultado = plan({
    territory: candidato,
    keywords: [keyword("kw-1", REF_A)],
    assignments: [assign("kw-1", REF_A)],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-1"], principalKeywordId: "kw-1", source: "logic" }],
  });
  assert.equal(resultado.readiness.state, "blocked");
  assert.deepEqual(resultado.proposals, []);
  assert.ok(resultado.issues.some(issue => issue.startsWith("TERRITORY_NOT_CONFIRMED")));

  // rejected, superseded e archived também não formam.
  for (const status of ["rejected", "superseded", "archived"] as const) {
    const outro = territory({
      lifecycleStatus: status,
      decisionState: status === "rejected" ? "rejected" : "pending",
    });
    const bloqueado = plan({
      territory: outro,
      keywords: [keyword("kw-1", REF_A)],
      assignments: [assign("kw-1", REF_A)],
      groupings: [{ proposalId: "p", keywordIds: ["kw-1"], principalKeywordId: "kw-1", source: "logic" }],
    });
    assert.equal(bloqueado.readiness.state, "blocked", status);
    assert.deepEqual(bloqueado.proposals, [], status);
  }
});

test("2 · território confirmado forma proposta", () => {
  const resultado = plan({
    keywords: [keyword("kw-1", REF_A), keyword("kw-2", REF_A)],
    assignments: [assign("kw-1", REF_A), assign("kw-2", REF_A)],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-1", "kw-2"], principalKeywordId: "kw-1", source: "logic" }],
  });
  assert.equal(resultado.readiness.state, "allowed");
  assert.equal(resultado.proposals.length, 1);
  assert.deepEqual(resultado.proposals[0].keywordIds, ["kw-1", "kw-2"]);
  assert.equal(resultado.proposals[0].territoryRef, REF_A);
  // Proposta nunca nasce aprovada.
  assert.equal(resultado.proposals[0].humanApproved, false);
  assert.deepEqual(resultado.conflicts, []);
  assert.deepEqual(resultado.unallocatedKeywords, []);
});

// --- 3..5 - escopo territorial das keywords ---------------------------------

test("3 · keyword de outro território vira TERRITORIAL_CONFLICT", () => {
  const resultado = plan({
    keywords: [keyword("kw-1", REF_A), keyword("kw-forasteira", REF_B)],
    assignments: [assign("kw-1", REF_A), assign("kw-forasteira", REF_B)],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-1", "kw-forasteira"], principalKeywordId: "kw-1", source: "logic" }],
  });
  const conflito = resultado.conflicts.find(item => item.code === "TERRITORIAL_CONFLICT");
  assert.ok(conflito);
  assert.deepEqual(conflito.keywordIds, ["kw-forasteira"]);
  assert.equal(conflito.requiresHumanTerritorialReview, true);
  // Nada foi autocorrigido: a proposta inteira foi recusada, e a keyword de
  // fora NÃO foi movida para o território para fazer o Article fechar.
  assert.deepEqual(resultado.proposals, []);
  assert.equal(resultado.unallocatedKeywords.some(item => item.keywordId === "kw-forasteira"), false);
});

test("4 · keyword explicitamente sem território não entra", () => {
  const resultado = plan({
    keywords: [keyword("kw-1", REF_A), keyword("kw-solta", null, "explicit_unassigned")],
    assignments: [assign("kw-1", REF_A), assign("kw-solta", null)],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-1", "kw-solta"], principalKeywordId: "kw-1", source: "logic" }],
  });
  assert.deepEqual(resultado.proposals, []);
  assert.ok(resultado.conflicts.some(item => item.code === "TERRITORIAL_CONFLICT"));
  const solta = resultado.unallocatedKeywords.find(item => item.keywordId === "kw-solta");
  assert.equal(solta?.reason, "EXPLICITLY_UNASSIGNED");
});

test("5 · keyword nunca endereçada não entra e não vira decisão humana", () => {
  const resultado = plan({
    keywords: [keyword("kw-1", REF_A), keyword("kw-nova", null, "unaddressed")],
    assignments: [assign("kw-1", REF_A)],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-1", "kw-nova"], principalKeywordId: "kw-1", source: "logic" }],
  });
  assert.deepEqual(resultado.proposals, []);
  const nova = resultado.unallocatedKeywords.find(item => item.keywordId === "kw-nova");
  assert.equal(nova?.reason, "NOT_ADDRESSED");
  assert.notEqual(nova?.reason, "EXPLICITLY_UNASSIGNED");
});

// --- 6..9 - principal e teto de keywords ------------------------------------

test("6 · exatamente uma principal é obrigatória", () => {
  const keywords = [keyword("kw-1", REF_A), keyword("kw-2", REF_A)];
  const semPrincipal = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposal({ principalKeywordId: null }),
    keywords,
  });
  assert.equal(semPrincipal.state, "blocked");
  assert.ok(semPrincipal.blockers.some(blocker => blocker.code === "ARTICLE_WITHOUT_PRINCIPAL"));

  const comPrincipal = resolveArticleConfirmationReadiness({ territory: territory(), proposal: proposal(), keywords });
  assert.equal(comPrincipal.state, "ready");
});

test("7 · principal fora das keywords do Article é recusada", () => {
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposal({ principalKeywordId: "kw-9" }),
    keywords: [keyword("kw-1", REF_A), keyword("kw-2", REF_A)],
  });
  assert.equal(readiness.state, "blocked");
  const blocker = readiness.blockers.find(item => item.code === "ARTICLE_WITHOUT_PRINCIPAL");
  assert.match(blocker!.detail, /não está entre as keywords/);

  // E o contrato consolidado recusa duas principais na composição.
  const duas = ArticleDNASchema.safeParse({ principalKeywordId: "kw-1", keywordReferences: [{}, {}] });
  assert.equal(duas.success, false);
});

test("8 · sete keywords são recusadas", () => {
  const ids = ["kw-1", "kw-2", "kw-3", "kw-4", "kw-5", "kw-6", "kw-7"];
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposal({ keywordIds: ids }),
    keywords: ids.map(id => keyword(id, REF_A)),
  });
  assert.equal(readiness.state, "blocked");
  const blocker = readiness.blockers.find(item => item.code === "ARTICLE_KEYWORD_LIMIT_EXCEEDED");
  assert.equal(blocker?.detail, "7 > 6");
  assert.equal(MAX_KEYWORDS_PER_ARTICLE, 6);
});

test("9 · de 1 a 6 keywords é permitido, e 6 é teto e não meta", () => {
  for (let total = 1; total <= MAX_KEYWORDS_PER_ARTICLE; total += 1) {
    const ids = Array.from({ length: total }, (_, index) => `kw-${index + 1}`);
    const readiness = resolveArticleConfirmationReadiness({
      territory: territory(),
      proposal: proposal({ keywordIds: ids, principalKeywordId: ids[0] }),
      keywords: ids.map(id => keyword(id, REF_A)),
    });
    assert.equal(readiness.state, "ready", `${total} keyword(s) precisa ser confirmável`);
  }
  // Nenhum código completa a lista até 6.
  const modulo = readFileSync(new URL("../lib/arquiteto/article-formation-territorial.ts", import.meta.url), "utf8");
  assert.equal(/while\s*\(.*length\s*<\s*MAX_KEYWORDS_PER_ARTICLE/.test(modulo), false);
  assert.equal(/\.push\([^)]*\)\s*;?\s*\/\/\s*completa/i.test(modulo), false);
});

// --- 10..13 - duplicidade e publicado ---------------------------------------

test("10 · a mesma keyword em dois Articles é conflito", () => {
  const resultado = plan({
    keywords: [keyword("kw-1", REF_A), keyword("kw-2", REF_A)],
    assignments: [assign("kw-1", REF_A), assign("kw-2", REF_A)],
    groupings: [
      { proposalId: "prop-1", keywordIds: ["kw-1", "kw-2"], principalKeywordId: "kw-1", source: "logic" },
      { proposalId: "prop-2", keywordIds: ["kw-2"], principalKeywordId: "kw-2", source: "logic" },
    ],
  });
  const conflito = resultado.conflicts.find(item => item.code === "KEYWORD_IN_TWO_ARTICLES");
  assert.ok(conflito);
  assert.deepEqual(conflito.keywordIds, ["kw-2"]);
  assert.equal(conflito.detail, "prop-1, prop-2");

  // E a confirmação de cada proposta enxerga a irmã.
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: resultado.proposals[0],
    siblingProposals: resultado.proposals,
    keywords: [keyword("kw-1", REF_A), keyword("kw-2", REF_A)],
  });
  assert.ok(readiness.blockers.some(blocker => blocker.code === "KEYWORD_SHARED_WITH_INCOMPATIBLE_ARTICLE"));
});

const publicado = (overrides: Partial<ExistingArticleState> = {}): ExistingArticleState => ({
  articleId: "artigo-publicado",
  brandId: BRAND,
  territoryRef: REF_A,
  principalKeywordId: "kw-pub",
  keywordIds: ["kw-pub"],
  publicationProtection: "locked",
  publishedSlug: "/barreira-cutanea",
  publishedCanonical: "https://marca.com/barreira-cutanea",
  publishedUrl: "https://marca.com/barreira-cutanea",
  ...overrides,
});

test("11 · principal de artigo publicado com trava é preservada", () => {
  const resultado = plan({
    keywords: [keyword("kw-pub", REF_A, "assigned", { isPublished: true }), keyword("kw-1", REF_A)],
    assignments: [assign("kw-pub", REF_A), assign("kw-1", REF_A)],
    existingArticles: [publicado()],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-pub", "kw-1"], principalKeywordId: "kw-1", source: "logic" }],
  });
  const preservado = resultado.preserved.find(item => item.articleId === "artigo-publicado");
  assert.equal(preservado?.reason, "PUBLISHED_PROTECTED");
  assert.equal(preservado?.publicationProtection, "locked");
  // Tentar levar a keyword publicada para outro Article é violação.
  assert.ok(resultado.conflicts.some(item => item.code === "PUBLISHED_PROTECTION_VIOLATION"));
});

test("12 · slug, canonical e URL publicados são preservados intactos", () => {
  const original = publicado();
  const resultado = plan({
    keywords: [keyword("kw-pub", REF_A, "assigned", { isPublished: true })],
    assignments: [assign("kw-pub", REF_A)],
    existingArticles: [original],
  });
  assert.equal(resultado.preserved.length, 1);
  // O plano não reescreve identidade publicada: o objeto de entrada segue igual.
  assert.equal(original.publishedSlug, "/barreira-cutanea");
  assert.equal(original.publishedCanonical, "https://marca.com/barreira-cutanea");
  assert.equal(original.publishedUrl, "https://marca.com/barreira-cutanea");
  assert.equal(original.principalKeywordId, "kw-pub");
  const modulo = readFileSync(new URL("../lib/arquiteto/article-formation-territorial.ts", import.meta.url), "utf8");
  assert.equal(/publishedSlug\s*=|publishedCanonical\s*=|publishedUrl\s*=/.test(modulo), false);
});

test("13 · proteção unknown exige decisão humana e preserva a principal atual", () => {
  const desconhecido = publicado({ publicationProtection: "unknown", articleId: "artigo-incerto" });
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposal({ keywordIds: ["kw-pub", "kw-1"], principalKeywordId: "kw-1" }),
    keywords: [keyword("kw-pub", REF_A), keyword("kw-1", REF_A)],
    existingArticles: [desconhecido],
  });
  assert.equal(readiness.state, "blocked");
  const blocker = readiness.blockers.find(item => item.code === "PUBLICATION_PROTECTION_CONFLICT");
  assert.match(blocker!.detail, /decisão humana/);

  // 2B.1: manter a principal NÃO resolve o unknown. "Não mudou" descreve o
  // estado, não a decisão — alguém precisa declarar que examinou a publicação.
  const mantendo = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposal({ keywordIds: ["kw-pub"], principalKeywordId: "kw-pub" }),
    keywords: [keyword("kw-pub", REF_A)],
    existingArticles: [desconhecido],
  });
  assert.equal(mantendo.state, "blocked");
  assert.ok(mantendo.blockers.some(item => item.code === "HUMAN_DECISION_PENDING"));

  // Só a decisão humana explícita libera.
  const decidido = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: proposal({ keywordIds: ["kw-pub"], principalKeywordId: "kw-pub" }),
    keywords: [keyword("kw-pub", REF_A)],
    existingArticles: [desconhecido],
    protectionDecisions: [{
      articleId: "artigo-incerto",
      decision: "preserve_principal",
      actorUserId: "user-1",
      decidedAt: NOW,
      reason: "Publicação examinada por um humano.",
    }],
  });
  assert.equal(decidido.state, "ready");
});

test("14 · Article legado sem território vira LEGACY_NEEDS_RECONCILIATION", () => {
  const legado: ExistingArticleState = {
    articleId: "artigo-legado",
    brandId: BRAND,
    territoryRef: null,
    principalKeywordId: "kw-legado",
    keywordIds: ["kw-legado"],
    publicationProtection: "unpublished",
    publishedSlug: null,
    publishedCanonical: null,
    publishedUrl: null,
  };
  const resultado = plan({
    keywords: [keyword("kw-1", REF_A)],
    assignments: [assign("kw-1", REF_A)],
    existingArticles: [legado],
  });
  const conflito = resultado.conflicts.find(item => item.code === "LEGACY_NEEDS_RECONCILIATION");
  assert.equal(conflito?.articleId, "artigo-legado");
  assert.equal(conflito?.requiresHumanTerritorialReview, true);
  // Não foi anexado a nenhum território.
  const preservado = resultado.preserved.find(item => item.articleId === "artigo-legado");
  assert.equal(preservado?.territoryRef, null);
  assert.equal(preservado?.reason, "OUTSIDE_TERRITORY");
});

// --- 15..16 - cenários ------------------------------------------------------

test("15 · cenário de Article exige level=article", () => {
  const semLevel = safeParseArchitectureScenario({ scenarioType: "logic", brandId: BRAND, articles: [] });
  assert.equal(semLevel.ok, false);
  assert.equal(semLevel.code, "LEVEL_REQUIRED");
  // Com level declarado, a recusa deixa de ser por nível.
  const comLevel = safeParseArchitectureScenario({ level: "article", scenarioType: "logic", brandId: BRAND });
  assert.equal(comLevel.ok, false);
  assert.equal(comLevel.code, "INVALID_SCENARIO");
});

test("16 · diff entre cenário silo e article é LEVEL_MISMATCH", () => {
  const universe = { contentHash: "sha256:mesmo-universo" };
  const diff = deriveArchitectureScenarioDiff(
    { level: "silo", scenarioType: "current", universe } as never,
    { level: "article", scenarioType: "logic", universe } as never,
  );
  assert.equal(diff.comparable, false);
  assert.equal(diff.incomparableReason, "LEVEL_MISMATCH");
  assert.equal(diff.levelMatch, false);
  assert.deepEqual(diff.entries, []);
  // O nível é checado ANTES de qualquer comparação de conteúdo: um cenário de
  // Silo nunca é reinterpretado como cenário de Article.
  assert.equal(diff.universeMatch, true, "mesmo universo, ainda assim incomparável");
});

// --- 17..19 - operação parcial, IA e providers ------------------------------

test("17 · operação de membership parcial bloqueia a confirmação", () => {
  const parcial = territory({
    pendingOperation: {
      operationId: "op-1",
      kind: "move",
      actorUserId: "user-1",
      startedAt: NOW,
      participantTerritoryRefs: [REF_A],
      intendedKeywordIds: ["kw-1", "kw-2"],
      appliedKeywordIds: ["kw-1"],
      failedKeywordIds: ["kw-2"],
    },
  });
  const readiness = resolveArticleConfirmationReadiness({
    territory: parcial,
    proposal: proposal(),
    keywords: [keyword("kw-1", REF_A), keyword("kw-2", REF_A)],
  });
  assert.equal(readiness.state, "blocked");
  const blocker = readiness.blockers.find(item => item.code === "PARTIAL_OPERATION_PENDING");
  assert.equal(blocker?.detail, "op-1");
});

test("18 · IA não aprova; somente humano fecha a estrutura", () => {
  const pronta: ArticleConfirmationReadiness = { state: "ready", blockers: [] };
  for (const actor of ["ai", "logic", "serp", "current"] as const) {
    const tentativa = confirmArticleStructure({
      proposal: proposal(),
      readiness: pronta,
      actor,
      actorUserId: "user-1",
      confirmedAt: NOW,
    });
    assert.equal(tentativa.status, "refused", actor);
    assert.ok(tentativa.refusals.some(refusal => refusal.code === "ONLY_HUMAN_MAY_APPROVE"), actor);
  }
  const humano = confirmArticleStructure({
    proposal: proposal(),
    readiness: pronta,
    actor: "human",
    actorUserId: "user-1",
    confirmedAt: NOW,
  });
  assert.equal(humano.status, "confirmed");

  // Nem o humano aprova estrutura não pronta.
  const naoPronta = confirmArticleStructure({
    proposal: proposal(),
    readiness: { state: "blocked", blockers: [{ code: "ARTICLE_WITHOUT_PRINCIPAL", detail: "x" }] },
    actor: "human",
    actorUserId: "user-1",
    confirmedAt: NOW,
  });
  assert.equal(naoPronta.status, "refused");
  assert.ok(naoPronta.refusals.some(refusal => refusal.code === "ARTICLE_NOT_READY_FOR_CONFIRMATION"));
});

test("19 · zero chamadas a provider, storage ou rede no domínio", () => {
  const modulo = readFileSync(new URL("../lib/arquiteto/article-formation-territorial.ts", import.meta.url), "utf8");
  assert.doesNotMatch(modulo, /fetch\(|supabase|dataforseo|deepseek|google-ads|openai|anthropic/i);
  assert.doesNotMatch(modulo, /localStorage|indexedDB|CREATE TABLE|ALTER TABLE|migration/i);
  // Não consolida SiloDNA, não cria SiloPage, não toca o grafo de links.
  const imports = modulo.split(/\r?\n/).filter(line => line.startsWith("import ") || line.startsWith('} from "')).join("\n");
  assert.doesNotMatch(imports, /silo-|internal-link-graph|radar|publicacoes|dataforseo/);
  assert.doesNotMatch(modulo, /SiloDNASchema|SiloPageSchema|createVersionEnvelope/);
});

// --- 20 - separação de identidades ------------------------------------------

test("20 · territoryRef nunca é derivado de Article, Silo, lista ou slug", () => {
  assert.equal(articleIdentityIsNeverTerritory({
    articleId: "artigo-1",
    workingArticleId: "working-article:abc",
    slug: "/barreira-cutanea",
    principalKeywordId: "kw-1",
    siloId: "silo-1",
    listaId: "lista-77",
  }), null);

  // O contrato consolidado aceita território, mas só no formato opaco.
  const base = {
    articleId: "artigo-1",
    territoryRef: "artigo-1",
  };
  assert.equal(ArticleDNASchema.safeParse(base).success, false);
  assert.equal(ProvisionalArticleGroupSchema.safeParse({ id: "g1", territoryRef: "silo-1" }).success, false);

  // territoryRef é OPCIONAL: ArticleDNA legado, sem o campo, continua parseando.
  const legado = ArticleDNASchema.safeParse({ articleId: "artigo-legado" });
  assert.equal(legado.success, false); // faltam outros campos obrigatórios
  assert.equal(
    (legado as { error: { issues: Array<{ path: PropertyKey[] }> } }).error.issues
      .some(issue => issue.path[0] === "territoryRef"),
    false,
    "a ausência de territoryRef não pode ser um erro",
  );

  // E o campo não substitui siloId: os dois coexistem, com validações próprias.
  const contrato = readFileSync(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.ok(contrato.includes("siloId: z.string().nullable(),"), "siloId continua no contrato");
  assert.ok(contrato.includes("territoryRef: TerritoryRefSchema.optional(),"), "territoryRef é aditivo e opcional");
  // territoryRef válido é aceito onde territoryRef inválido é recusado.
  const valido = ArticleDNASchema.safeParse({ articleId: "artigo-1", territoryRef: REF_A });
  assert.equal(
    (valido as { error: { issues: Array<{ path: PropertyKey[] }> } }).error.issues
      .some(issue => issue.path[0] === "territoryRef"),
    false,
    "um territoryRef opaco válido não pode ser recusado",
  );
});

test("21 · cobertura: nenhuma keyword endereçada desaparece do plano", () => {
  const keywords = [
    keyword("kw-1", REF_A),
    keyword("kw-2", REF_A),
    keyword("kw-3", REF_A),
    keyword("kw-solta", null, "explicit_unassigned"),
    keyword("kw-nova", null, "unaddressed"),
  ];
  const resultado = plan({
    keywords,
    assignments: [assign("kw-1", REF_A), assign("kw-2", REF_A), assign("kw-3", REF_A), assign("kw-solta", null)],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-1", "kw-2"], principalKeywordId: "kw-1", source: "logic" }],
  });
  const alocadas = new Set(resultado.proposals.flatMap(item => item.keywordIds));
  const naoAlocadas = new Set(resultado.unallocatedKeywords.map(item => item.keywordId));
  for (const item of keywords) {
    assert.ok(
      alocadas.has(item.keywordId) || naoAlocadas.has(item.keywordId),
      `${item.keywordId} não pode desaparecer`,
    );
    assert.equal(alocadas.has(item.keywordId) && naoAlocadas.has(item.keywordId), false, item.keywordId);
  }
  assert.equal(resultado.unallocatedKeywords.find(item => item.keywordId === "kw-3")?.reason, "NO_PROPOSAL_YET");
  assert.deepEqual(ARTICLE_CONFIRMATION_BLOCKER_CODES.includes("ARTICLE_DEFINITION_INCOMPLETE"), true);
});

test("22 · definição ausente bloqueia confirmação, mas não formação", () => {
  const resultado = plan({
    keywords: [keyword("kw-1", REF_A)],
    assignments: [assign("kw-1", REF_A)],
    groupings: [{ proposalId: "prop-1", keywordIds: ["kw-1"], principalKeywordId: "kw-1", source: "logic" }],
  });
  // FORMATION passou: propor é permitido sem definição fechada.
  assert.equal(resultado.readiness.state, "allowed");
  assert.equal(resultado.proposals.length, 1);
  assert.deepEqual(resultado.proposals[0].definition, emptyArticleDefinition());

  // CONFIRMATION não: a fronteira precisa distinguir este Article dos demais.
  const readiness = resolveArticleConfirmationReadiness({
    territory: territory(),
    proposal: resultado.proposals[0],
    keywords: [keyword("kw-1", REF_A)],
  });
  assert.equal(readiness.state, "blocked");
  const blocker = readiness.blockers.find(item => item.code === "ARTICLE_DEFINITION_INCOMPLETE");
  assert.equal(blocker?.detail, "antiCannibalizationBoundary, audience, mainIntent, promise");
});
