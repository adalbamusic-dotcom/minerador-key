import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HIGH_IMPACT_ACTIONS,
  buildTerritorialReviewView,
  detectTerritorialConflicts,
  resolveTerritorialReviewStatus,
  serpIsRepresentative,
  type TerritorialReviewAi,
  type TerritorialReviewLogic,
  type TerritorialReviewSerp,
} from "../lib/arquiteto/territorial-review.ts";

const REF_A = "territory:11111111-1111-4111-8111-111111111111";

const territory = (overrides: Record<string, unknown> = {}) => ({
  territoryRef: REF_A,
  name: "Skincare Facial",
  centralEntity: "skincare facial",
  lifecycleStatus: "candidate",
  isPublished: true,
  slug: "/rotina-skincare-facial",
  canonical: "careglow.com.br/rotina-skincare-facial",
  confirmationBlockers: [] as string[],
  confirmationReady: true,
  ...overrides,
});

const logic = (overrides: Partial<TerritorialReviewLogic> = {}): TerritorialReviewLogic => ({
  presence: "current", state: "existing_silo_match", targetTerritoryRef: REF_A,
  reason: "Afinidade dominante.", ...overrides,
});

const serp = (overrides: Partial<TerritorialReviewSerp> = {}): TerritorialReviewSerp => ({
  presence: "current",
  assessment: {
    questionId: "serp:site_silo:t1", kind: "site_silo", territoryRef: REF_A, comparedTerritoryRef: null,
    compatibility: "coerente", observedIntent: "informacional", dominantType: "category",
    overlap: null, breadth: "broad", competition: "low", conflicts: [],
    recommendation: "manter_silo", reason: "Comporta um universo.", snapshotIds: ["s1"],
    collectedAt: "2026-09-03T12:00:00.000Z",
  },
  ...overrides,
});

const ai = (overrides: Partial<TerritorialReviewAi> = {}): TerritorialReviewAi => ({
  presence: "current",
  proposal: {
    questionId: "serp:site_silo:t1", recommendation: "maintain", targetRefs: [REF_A], keywordRefs: [],
    reason: "A arquitetura está coerente.", supportingEvidence: [], conflicts: [], limitations: [],
    legacyStance: "legacy_constraint",
  },
  ...overrides,
});

const keyword = (id: string, extra: Record<string, unknown> = {}) => ({
  keywordId: id, keyword: `kw ${id}`, territoryRef: null, decision: null, ...extra,
});

/* ------------------------------- precedência ----------------------------- */

test("SERP só recebe destaque quando é evidência representativa", () => {
  assert.equal(serpIsRepresentative(serp()), true);
  assert.equal(serpIsRepresentative(serp({ presence: "stale" })), false, "parecer desatualizado não tem precedência");
  assert.equal(serpIsRepresentative(serp({ presence: "not_executed", assessment: null })), false);
  assert.equal(serpIsRepresentative(serp({
    assessment: { ...serp().assessment!, compatibility: "insuficiente" },
  })), false, "evidência insuficiente não vira destaque");
});

test("com SERP vigente contradizendo, a precedência de apresentação é dela", () => {
  const view = buildTerritorialReviewView({
    territory: territory(),
    keywords: [],
    logic: logic({ state: "new_silo_candidate" }),
    serp: serp({ assessment: { ...serp().assessment!, recommendation: "usar_silo_existente", overlap: "high" } }),
    ai: ai({ proposal: { ...ai().proposal!, recommendation: "use_existing_silo" } }),
  });

  assert.equal(view.evidencePrecedence, "serp");
  // Destaque é leitura: nenhuma ação automática nasce daí.
  assert.equal(view.availableHumanActions.some(action => action.kind === "keep_current"), true);
});

test("sem SERP representativa, o eixo volta a ser a Lógica", () => {
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [],
    logic: logic(), serp: serp({ presence: "not_required", assessment: null }), ai: ai(),
  });

  assert.equal(view.evidencePrecedence, "logic");
});

/* -------------------------------- conflito ------------------------------- */

test("conflito é divergência de direção, não de vocabulário", () => {
  // SERP e IA dizendo a mesma coisa com palavras diferentes NÃO é conflito.
  const semConflito = detectTerritorialConflicts({ logic: logic(), serp: serp(), ai: ai() });
  assert.deepEqual(semConflito, []);

  const comConflito = detectTerritorialConflicts({
    logic: logic({ state: "new_silo_candidate" }),
    serp: serp({ assessment: { ...serp().assessment!, recommendation: "usar_silo_existente" } }),
    ai: ai({ proposal: { ...ai().proposal!, recommendation: "use_existing_silo" } }),
  });
  assert.ok(comConflito.some(texto => /Lógica propõe silo novo e a SERP/.test(texto)));
});

test("fonte desatualizada não entra no cálculo de conflito", () => {
  const conflitos = detectTerritorialConflicts({
    logic: logic(),
    serp: serp({ presence: "stale", assessment: { ...serp().assessment!, recommendation: "usar_silo_existente" } }),
    ai: ai(),
  });

  assert.deepEqual(conflitos, []);
});

/* --------------------------------- status -------------------------------- */

test("status é projeção de UI e reflete o que realmente existe", () => {
  assert.equal(resolveTerritorialReviewStatus({ conflicts: ["x"], hasHumanDecision: false, anyStale: false, hasActions: true }), "conflict");
  assert.equal(resolveTerritorialReviewStatus({ conflicts: [], hasHumanDecision: true, anyStale: false, hasActions: true }), "decision_recorded");
  assert.equal(resolveTerritorialReviewStatus({ conflicts: [], hasHumanDecision: false, anyStale: false, hasActions: true }), "ready_for_decision");
  assert.equal(resolveTerritorialReviewStatus({ conflicts: [], hasHumanDecision: false, anyStale: false, hasActions: false }), "pending");
  // Desatualizado vence: decidir sobre leitura velha seria pior.
  assert.equal(resolveTerritorialReviewStatus({ conflicts: ["x"], hasHumanDecision: true, anyStale: true, hasActions: true }), "stale");
});

/* ------------------------------ ações humanas ---------------------------- */

test("a sugestão vira ação NOMEADA no objeto, nunca 'aplicar IA'", () => {
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [],
    suggestedKeywords: [keyword("k1", { keyword: "skincare vitamina c" })],
    logic: logic(), serp: serp(), ai: ai(),
  });

  const acao = view.availableHumanActions.find(action => action.kind === "assign_keyword")!;
  assert.match(acao.label, /Associar "skincare vitamina c" a Skincare Facial/);
  assert.match(acao.impact, /deixa de estar sem silo/);
  // Nenhuma ação genérica de aplicar evidência ou proposta.
  const rotulos = view.availableHumanActions.map(action => action.label).join(" | ");
  assert.doesNotMatch(rotulos, /Aplicar (IA|SERP|proposta|tudo)/i);
});

test("keyword em outro silo vira mover, não associar", () => {
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [],
    suggestedKeywords: [keyword("k1", { territoryRef: "territory:22222222-2222-4222-8222-222222222222" })],
    logic: logic(), serp: serp(), ai: ai(),
  });

  const acao = view.availableHumanActions.find(action => action.kind === "move_keyword")!;
  assert.equal(acao.fromTerritoryRef, "territory:22222222-2222-4222-8222-222222222222");
  assert.match(acao.impact, /sai do silo atual/);
});

test("confirmar só aparece quando o próprio silo está pronto", () => {
  const pronto = buildTerritorialReviewView({
    territory: territory(), keywords: [], logic: logic(), serp: serp(), ai: ai(),
  });
  const travado = buildTerritorialReviewView({
    territory: territory({ confirmationReady: false, confirmationBlockers: ["falta definir a entidade central;"] }),
    keywords: [], logic: logic(), serp: serp(), ai: ai(),
  });

  assert.equal(pronto.availableHumanActions.some(action => action.kind === "confirm_silo"), true);
  assert.equal(travado.availableHumanActions.some(action => action.kind === "confirm_silo"), false);
  // A Revisão EXPLICA o bloqueio; não altera a prontidão.
  assert.deepEqual(travado.blockers, ["falta definir a entidade central;"]);
});

test("silo confirmado não oferece confirmar nem atualizar contexto de novo", () => {
  const view = buildTerritorialReviewView({
    territory: territory({ lifecycleStatus: "confirmed" }),
    keywords: [], logic: logic(), serp: serp(), ai: ai(),
  });

  assert.equal(view.availableHumanActions.some(action => action.kind === "confirm_silo"), false);
  assert.equal(view.availableHumanActions.some(action => action.kind === "update_context"), false);
});

test("manter atual existe sempre: discordar das fontes é decisão legítima", () => {
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [],
    logic: logic({ presence: "not_executed", state: null, targetTerritoryRef: null, reason: null }),
    serp: serp({ presence: "failed", assessment: null }),
    ai: ai({ presence: "not_executed", proposal: null }),
  });

  assert.equal(view.availableHumanActions.some(action => action.kind === "keep_current"), true);
});

test("IA ausente não bloqueia a revisão", () => {
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [],
    suggestedKeywords: [keyword("k1")],
    logic: logic(), serp: serp(), ai: ai({ presence: "not_executed", proposal: null }),
  });

  assert.notEqual(view.status, "pending");
  assert.equal(view.availableHumanActions.length > 1, true);
});

test("SERP não exigida também não bloqueia", () => {
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [],
    suggestedKeywords: [keyword("k1")],
    logic: logic(), serp: serp({ presence: "not_required", assessment: null }), ai: ai(),
  });

  assert.equal(view.status, "ready_for_decision");
});

test("identidade publicada aparece como contexto protegido", () => {
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [], logic: logic(), serp: serp(), ai: ai(),
  });

  assert.equal(view.current.isPublished, true);
  assert.equal(view.current.slug, "/rotina-skincare-facial");
  // Nenhuma ação toca a identidade publicada.
  const kinds = view.availableHumanActions.map(action => action.kind);
  assert.equal(kinds.some(kind => /slug|canonical|url|publish/i.test(kind)), false);
});

test("ações de alto impacto são declaradas e trazem antes/depois", () => {
  assert.deepEqual([...HIGH_IMPACT_ACTIONS], ["move_keyword", "update_context", "confirm_silo"]);
  const view = buildTerritorialReviewView({
    territory: territory(), keywords: [],
    suggestedKeywords: [keyword("k1", { territoryRef: "territory:22222222-2222-4222-8222-222222222222" })],
    logic: logic(), serp: serp(), ai: ai(),
  });
  for (const action of view.availableHumanActions) {
    assert.ok(action.impact.length > 0, `${action.kind} precisa declarar o impacto`);
  }
});

/* ------------------------------ contrato duro ---------------------------- */

test("a Revisão não é uma quinta opinião nem tem storage próprio", () => {
  const source = readFileSync("lib/arquiteto/territorial-review.ts", "utf8");
  const codigo = source.split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");

  // Nenhuma recomendação própria calculada.
  assert.doesNotMatch(codigo, /reviewRecommendation/);
  // Nenhum storage: a Revisão é recalculada das fontes remotas.
  assert.doesNotMatch(codigo, /supabase|fetch\(|localStorage|subject_type|editorial_workflow_items/);
});

test("a decisão humana vem do writer canônico, não de carimbo inventado", () => {
  const view = buildTerritorialReviewView({
    territory: territory(),
    keywords: [keyword("k1", { territoryRef: REF_A, decision: { source: "human", reason: "Decisão na mesa.", decidedAt: "2026-09-03T12:00:00.000Z" } })],
    logic: logic(), serp: serp(), ai: ai(),
  });

  assert.equal(view.current.decision!.source, "human");
  assert.equal(view.status, "decision_recorded");
});

test("hipótese e proposta não são decisão humana", () => {
  const view = buildTerritorialReviewView({
    territory: territory(),
    keywords: [keyword("k1", { territoryRef: REF_A, decision: { source: "logic", reason: "Hipótese.", decidedAt: "2026-09-03T12:00:00.000Z" } })],
    logic: logic(), serp: serp(), ai: ai(),
  });

  // Decisão de origem "logic" não marca a revisão como decidida.
  assert.notEqual(view.status, "decision_recorded");
});
