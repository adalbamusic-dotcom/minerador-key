import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLogicSiloScenario,
  deriveTerritorialLogic,
  territorialAssignmentsFromWorkflowPayloads,
} from "../lib/arquiteto/territorial-logic.ts";
import { buildTerritorialLandscape } from "../lib/arquiteto/territorial-landscape.ts";
import { SiloArchitectureScenarioSchema, validateArchitectureScenario } from "../lib/arquiteto/architecture-scenario.ts";
import type { TerritoryCandidate } from "../lib/arquiteto/territory.ts";

const logicSource = readFileSync("lib/arquiteto/territorial-logic.ts", "utf8");
const BRAND = "brand-1";
// territoryRef é opaco: territory:<uuid>. Nunca codifica nome nem entidade.
const REF_A = "territory:11111111-1111-4111-8111-111111111111";
const REF_B = "territory:22222222-2222-4222-8222-222222222222";
const REF_SERUM = "territory:33333333-3333-4333-8333-333333333333";

const territory = (territoryRef: string, overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate => ({
  schemaVersion: 1,
  territoryRef,
  brandId: BRAND,
  existingSiloRef: null,
  name: territoryRef,
  centralEntity: "sérum facial",
  macroIntent: "informacional",
  boundary: { includes: ["sérum"], excludes: ["maquiagem"] },
  narrative: { summary: "Universo de sérum.", relationToBrand: "core", editorialAngle: null },
  discovery: { origin: "manual_strategic", evidence: [], detectedAt: "2026-09-02T12:00:00.000Z" },
  territoryKind: "new",
  architecturalOrigin: "manual_strategic",
  ingestionOrigin: "ui",
  publicationProtection: "unpublished",
  lifecycleStatus: "candidate",
  decisionState: "pending",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFrom: null, mergedFrom: [], supersededBy: null },
  conflicts: [],
  pendingOperation: null,
  ...overrides,
} as TerritoryCandidate);

const keyword = (id: string, text: string, entity: string, extra: Record<string, unknown> = {}) => ({
  id, brand_id: BRAND, keyword: text,
  intent: "informacional",
  analise_semantica: { entidade_central: entity },
  ...extra,
});

const landscapeWith = (keywords: ReturnType<typeof keyword>[], territories: TerritoryCandidate[]) =>
  buildTerritorialLandscape({ brandId: BRAND, keywords, territories, assignments: [] });

test("o adaptador lê a membership da fonte canônica do item de workflow", () => {
  const payloads = new Map<string, unknown>([
    ["kw-1", {
      territoryRef: REF_A,
      territoryAssignment: { state: "existing_silo_match", reason: "Decisão humana.", source: "human", decidedAt: "2026-09-02T12:00:00.000Z" },
    }],
    ["kw-2", { territoryRef: null, territoryAssignment: { state: "unassigned", reason: "Fora de escopo.", source: "human", decidedAt: "2026-09-02T12:00:00.000Z" } }],
    ["kw-3", {}],
    // Incoerente: ponteiro sem decisão coerente é recusado, nunca normalizado.
    ["kw-4", { territoryRef: "ref-invalida" }],
  ]);

  const { assignments, incoherentKeywordIds } = territorialAssignmentsFromWorkflowPayloads({ brandId: BRAND, payloads });

  assert.deepEqual(assignments.map(item => item.keywordId).sort(), ["kw-1", "kw-2"]);
  assert.equal(assignments.find(item => item.keywordId === "kw-1")?.territoryRef, REF_A);
  assert.equal(assignments.find(item => item.keywordId === "kw-2")?.territoryRef, null);
  assert.deepEqual(incoherentKeywordIds, ["kw-4"]);
  // kw-3 não endereçada não vira decisão: o Landscape a projeta como pendente.
  assert.equal(assignments.some(item => item.keywordId === "kw-3"), false);
});

test("keyword compatível com território existente vira hipótese de afinidade", () => {
  const landscape = landscapeWith(
    [keyword("kw-1", "sérum facial para pele oleosa", "sérum facial")],
    [territory(REF_SERUM)],
  );

  const logic = deriveTerritorialLogic({ landscape, keywords: [keyword("kw-1", "sérum facial para pele oleosa", "sérum facial")] });

  const hipotese = logic.hypotheses[0];
  assert.equal(hipotese.state, "existing_silo_match");
  assert.equal(hipotese.targets[0].territoryRef, REF_SERUM);
  assert.ok(hipotese.evidence.length > 0, "a evidência acompanha a hipótese");
});

test("keyword sem estrutura que a sustente vira candidata a silo novo", () => {
  const landscape = landscapeWith(
    [keyword("kw-1", "protetor solar mineral", "protetor solar")],
    [territory(REF_SERUM)],
  );

  const logic = deriveTerritorialLogic({ landscape, keywords: [keyword("kw-1", "protetor solar mineral", "protetor solar")] });

  assert.equal(logic.hypotheses[0].state, "new_silo_candidate");
  assert.equal(logic.hypotheses[0].targets.length, 0);
  assert.match(logic.hypotheses[0].evidence[0], /Nenhum silo ou estrutura existente/);
});

test("fronteira que exclui a keyword impede o destino", () => {
  const excludente = territory(REF_SERUM, { boundary: { includes: ["sérum"], excludes: ["batom"] } });
  const alvo = keyword("kw-1", "batom sérum matte", "sérum facial");
  const landscape = landscapeWith([alvo], [excludente]);

  const logic = deriveTerritorialLogic({ landscape, keywords: [alvo] });

  assert.equal(logic.hypotheses[0].targets.some(target => target.territoryRef === REF_SERUM), false);
  assert.ok(logic.hypotheses[0].evidence.some(item => /fronteira exclui/.test(item)));
});

test("dois destinos próximos produzem ambiguidade, não um vencedor", () => {
  const alvo = keyword("kw-1", "sérum facial", "sérum facial");
  const landscape = landscapeWith([alvo], [territory(REF_A), territory(REF_B)]);

  const logic = deriveTerritorialLogic({ landscape, keywords: [alvo] });

  assert.equal(logic.hypotheses[0].state, "ambiguous_silo");
  assert.ok(logic.hypotheses[0].targets.length >= 2);
});

test("a Lógica não reabre keyword já endereçada por decisão", () => {
  const alvo = keyword("kw-1", "sérum facial", "sérum facial");
  const landscape = buildTerritorialLandscape({
    brandId: BRAND,
    keywords: [alvo],
    territories: [territory(REF_A)],
    assignments: [{
      keywordId: "kw-1", brandId: BRAND, territoryRef: REF_A,
      state: "existing_silo_match", reason: "Decisão humana.", source: "human", decidedAt: "2026-09-02T12:00:00.000Z",
    } as never],
  });

  const logic = deriveTerritorialLogic({ landscape, keywords: [alvo] });

  assert.deepEqual(logic.hypotheses, []);
  assert.deepEqual(logic.alreadyAddressedKeywordIds, ["kw-1"]);
});

test("o cenário de nível Silo é válido e não inventa territoryRef", async () => {
  const compativel = keyword("kw-1", "sérum facial para pele oleosa", "sérum facial");
  const isolada = keyword("kw-2", "protetor solar mineral", "protetor solar");
  const landscape = landscapeWith([compativel, isolada], [territory(REF_SERUM)]);
  const logic = deriveTerritorialLogic({ landscape, keywords: [compativel, isolada] });

  const scenario = await buildLogicSiloScenario({ landscape, logic });

  assert.equal(SiloArchitectureScenarioSchema.safeParse(scenario).success, true);
  assert.equal(scenario.level, "silo");
  assert.equal(scenario.scenarioType, "logic");
  // Payload de nível Silo: territories + unassignedKeywords, nunca articles.
  assert.ok(Array.isArray(scenario.territories));
  assert.equal("articles" in scenario, false);
  assert.deepEqual(scenario.territories.map(item => item.territoryRef), [REF_SERUM]);
  assert.ok(scenario.territories[0].keywordRefs.includes("kw-1"));
  // A candidata a universo novo não ganha território fabricado.
  const solta = scenario.unassignedKeywords.find(entry => entry.keywordId === "kw-2");
  assert.equal(solta?.state, "new_silo_candidate");
  assert.equal(scenario.territories.length, 1, "nenhum territoryRef novo foi emitido pela Lógica");
  const validation = validateArchitectureScenario(scenario, { brandId: BRAND, expectedUniverse: scenario.universe });
  assert.deepEqual(validation.issues, []);
});

test("a Lógica é determinística e não decide nem grava", async () => {
  const alvo = keyword("kw-1", "sérum facial", "sérum facial");
  const landscape = landscapeWith([alvo], [territory(REF_SERUM)]);

  const primeira = deriveTerritorialLogic({ landscape, keywords: [alvo] });
  const segunda = deriveTerritorialLogic({ landscape, keywords: [alvo] });
  assert.deepEqual(primeira, segunda);

  const cenario = await buildLogicSiloScenario({ landscape, logic: primeira });
  const repetido = await buildLogicSiloScenario({ landscape, logic: segunda });
  assert.deepEqual(cenario, repetido);

  // Sem provider, sem persistência, sem confirmação de território.
  assert.doesNotMatch(logicSource, /fetch\(|supabase|persist|localStorage|dataforseo|deepseek/i);
  assert.doesNotMatch(logicSource, /lifecycleStatus\s*[:=]\s*"confirmed"|decisionState\s*[:=]\s*"confirmed"/);
  assert.doesNotMatch(logicSource, /randomUUID|"territory:" \+/, "territoryRef só é emitido pelo servidor");
  // INV-T6: nenhuma regra de contagem de keywords cria Silo.
  assert.doesNotMatch(logicSource, /keywords\.length\s*>=?\s*[0-9]+\s*\)\s*.*new_silo_candidate/);
});
