import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTerritorialSurface,
  deriveTerritorialProcessAvailability,
} from "../lib/arquiteto/territorial-surface.ts";
import { buildTerritorialLandscape } from "../lib/arquiteto/territorial-landscape.ts";
import { deriveTerritorialLogic } from "../lib/arquiteto/territorial-logic.ts";
import type { TerritoryCandidate } from "../lib/arquiteto/territory.ts";

const rawSource = readFileSync("lib/arquiteto/territorial-surface.ts", "utf8");
/** Só o código: comentários explicam o que a implementação NÃO usa. */
const surfaceSource = rawSource
  .split("\n")
  .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("/*") && !line.trimStart().startsWith("//"))
  .join("\n");
const BRAND = "brand-1";
const REF_A = "territory:11111111-1111-4111-8111-111111111111";
const REF_B = "territory:22222222-2222-4222-8222-222222222222";

const territory = (territoryRef: string, overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate => ({
  schemaVersion: 1, territoryRef, brandId: BRAND, existingSiloRef: null,
  name: "Sérum facial", centralEntity: "sérum facial", macroIntent: "informacional",
  boundary: { includes: ["sérum"], excludes: ["maquiagem"] },
  narrative: { summary: "Universo de sérum.", relationToBrand: "core", editorialAngle: null },
  discovery: { origin: "manual_strategic", evidence: [], detectedAt: "2026-09-02T12:00:00.000Z" },
  territoryKind: "new", architecturalOrigin: "manual_strategic", ingestionOrigin: "ui",
  publicationProtection: "unpublished", lifecycleStatus: "candidate", decisionState: "pending",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFrom: null, mergedFrom: [], supersededBy: null },
  conflicts: [], pendingOperation: null, ...overrides,
} as TerritoryCandidate);

const keyword = (id: string, text = "sérum facial", entity = "sérum facial", extra: Record<string, unknown> = {}) => ({
  id, brand_id: BRAND, keyword: text, intent: "informacional",
  analise_semantica: { entidade_central: entity }, ...extra,
});

const surfaceFor = (keywords: ReturnType<typeof keyword>[], territories: TerritoryCandidate[] = [], siloDnas: unknown[] = []) => {
  const landscape = buildTerritorialLandscape({
    brandId: BRAND, keywords, territories, assignments: [], siloDnas: siloDnas as never,
  });
  const logic = deriveTerritorialLogic({ landscape, keywords });
  return { landscape, logic, surface: buildTerritorialSurface({ landscape, logic }) };
};

test("Brand vazia tem estado vazio funcional, não erro", () => {
  const { surface, landscape } = surfaceFor([]);

  assert.equal(surface.emptyState.isEmpty, true);
  assert.match(surface.emptyState.message!, /Importe keywords do Minerador ou registre uma estrutura/);
  assert.deepEqual(surface.groups, []);
  assert.equal(landscape.consistency.consistent, true);
});

test("keyword importada aparece SEM SILO, sem depender de Article", () => {
  const { surface } = surfaceFor([keyword("kw-1", "protetor solar mineral", "protetor solar")]);

  const semTerritorio = surface.groups.find(group => group.kind === "unassigned");
  assert.ok(semTerritorio, "a keyword recebida precisa aparecer mesmo sem Article");
  assert.deepEqual(semTerritorio.rows.map(row => row.keywordId), ["kw-1"]);
  assert.equal(semTerritorio.rows[0].territoryRef, null);
  assert.match(semTerritorio.rows[0].decisionReason!, /sem decisão de silo/i);
  // Nenhum agrupamento de Article aparece na projeção territorial.
  assert.equal(surface.groups.some(group => group.header?.kind === "territory"), false);
  assert.equal(surface.counts.keywords, 1);
});

test("território e estrutura existente são grupos distintos, nunca fundidos", () => {
  const { surface } = surfaceFor(
    [keyword("kw-1"), keyword("kw-2", "creme skin care", "creme")],
    [territory(REF_A)],
    [{
      versionId: "v1", entityId: "silo-legado", versionNumber: 1, previousVersionId: null,
      contentHash: `sha256:${"a".repeat(64)}`, origin: "human", changeReason: "seed",
      createdAt: "2026-09-02T12:00:00.000Z", createdBy: "user-1",
      payload: { siloId: "silo-legado", name: "Skin care", brandId: BRAND },
    }],
  );

  const estruturas = surface.groups.filter(group => group.kind === "existing_structures");
  const territorios = surface.groups.filter(group => group.kind === "territories");
  assert.equal(estruturas.length, 1);
  assert.equal(territorios.length, 1);
  assert.equal(estruturas[0].header?.kind, "structure");
  assert.equal(estruturas[0].header?.origin, "silo_dna");
  assert.equal(territorios[0].header?.kind, "territory");
  assert.equal(territorios[0].header?.lifecycleStatus, "candidate");
  // Estrutura existente não vira território confirmado sozinha.
  assert.equal(surface.counts.structures, 1);
  assert.equal(surface.counts.territories, 1);
});

test("ambiguidade é projeção de estado, sem território fabricado", () => {
  const { surface } = surfaceFor([keyword("kw-1")], [territory(REF_A), territory(REF_B)]);

  const ambiguas = surface.groups.find(group => group.kind === "ambiguous");
  assert.ok(ambiguas);
  assert.equal(ambiguas.header, null, "grupo de estado não inventa cabeçalho de território");
  assert.equal(ambiguas.rows[0].hypothesis?.state, "ambiguous_silo");
  assert.equal(ambiguas.rows[0].territoryRef, null);
  assert.equal(surface.counts.ambiguous, 1);
});

test("a hipótese acompanha a linha com a evidência, sem virar decisão", () => {
  const { surface } = surfaceFor([keyword("kw-1")], [territory(REF_A)]);

  const linha = surface.groups.flatMap(group => group.rows).find(row => row.keywordId === "kw-1")!;
  assert.equal(linha.hypothesis?.state, "existing_silo_match");
  assert.ok(linha.hypothesis!.evidence.length > 0);
  // Hipótese não move membership: a linha continua sem territoryRef decidido.
  assert.equal(linha.territoryRef, null);
});

test("Lógica fica disponível sem nenhum ArticleDNA", () => {
  const { surface, landscape } = surfaceFor([keyword("kw-1")]);

  const availability = deriveTerritorialProcessAvailability({ surface, landscape });

  assert.equal(availability.logic, "available");
  assert.equal(availability.review, "available");
  assert.equal(availability.blockedReason, null);
  // O gate não conhece ArticleDNA.
  assert.doesNotMatch(surfaceSource, /brandArticleVersions|articleDna|ArticleDNA/);
});

test("SERP e IA territoriais são declaradas não implementadas, não falsas", () => {
  const { surface, landscape } = surfaceFor([keyword("kw-1")], [territory(REF_A)]);

  const availability = deriveTerritorialProcessAvailability({ surface, landscape });

  assert.equal(availability.serp, "not_implemented");
  assert.equal(availability.ai, "not_implemented");
  // Não executar SERP/IA territorial não é erro nem bloqueio.
  assert.notEqual(availability.logic, "blocked");
});

test("inconsistência estrutural bloqueia a análise e é projetada em grupo próprio", () => {
  const landscape = buildTerritorialLandscape({
    brandId: BRAND,
    keywords: [keyword("kw-1")],
    territories: [territory(REF_A)],
    assignments: [{
      keywordId: "kw-1", brandId: BRAND, territoryRef: REF_B,
      state: "existing_silo_match", reason: "Referência quebrada.", source: "human",
      decidedAt: "2026-09-02T12:00:00.000Z",
    } as never],
  });
  const surface = buildTerritorialSurface({ landscape, logic: null });

  assert.equal(landscape.consistency.consistent, false);
  const problema = surface.groups.find(group => group.kind === "inconsistent");
  assert.ok(problema, "inconsistência real aparece separada dos estados de trabalho");
  const availability = deriveTerritorialProcessAvailability({ surface, landscape });
  assert.equal(availability.logic, "blocked");
  assert.match(availability.blockedReason!, /inconsistência na estrutura de silos/i);
});

test("a disponibilidade da Lógica não depende de confirmação de território", () => {
  // Território candidato sem entidade/fronteira completa não é confirmável,
  // mas a Lógica continua disponível — é ela que ajuda a chegar lá.
  const incompleto = territory(REF_A, { centralEntity: "", macroIntent: "" });
  const { surface, landscape } = surfaceFor([keyword("kw-1")], [incompleto]);

  const availability = deriveTerritorialProcessAvailability({ surface, landscape });

  assert.equal(availability.logic, "available");
  // A prontidão pode ser exibida POR SILO no cabeçalho; o que não pode é virar
  // gate da disponibilidade da Lógica — aí sim seria dependência circular.
  const disponibilidade = surfaceSource.slice(surfaceSource.indexOf("export function deriveTerritorialProcessAvailability"));
  assert.doesNotMatch(disponibilidade, /resolveTerritoryConfirmationReadiness/,
    "confirmação de território é outra pergunta; usá-la aqui criaria dependência circular");
});

test("a superfície é somente leitura e determinística", () => {
  const keywords = [keyword("kw-1"), keyword("kw-2", "creme", "creme")];
  const primeira = surfaceFor(keywords, [territory(REF_A)]).surface;
  const segunda = surfaceFor(keywords, [territory(REF_A)]).surface;

  assert.deepEqual(primeira, segunda);
  assert.doesNotMatch(surfaceSource, /fetch\(|supabase|persist|localStorage|randomUUID/);
  assert.doesNotMatch(surfaceSource, /dataforseo|deepseek/i);
});

test("recebimento do Minerador não é decisão territorial humana", () => {
  // keyword recebida / territoryRef = null / sem decisão humana / logic = new_silo_candidate
  const { surface, landscape } = surfaceFor([keyword("kw-1", "sérum facial vitamina c", "sérum facial")]);

  const semTerritorio = surface.groups.find(group => group.kind === "unassigned");
  assert.ok(semTerritorio, "a keyword recebida aparece na paisagem");
  const linha = semTerritorio.rows.find(row => row.keywordId === "kw-1");
  assert.ok(linha);

  // Estado = sem território; a hipótese da Lógica existe, mas é hipótese.
  assert.equal(linha.territoryRef, null);
  assert.equal(linha.membershipState, "unassigned");
  assert.equal(linha.hypothesis?.state, "new_silo_candidate");

  // Decisão: nada aqui é decisão humana.
  assert.equal(linha.decisionSource, null, "motivo técnico não é decisão");
  assert.equal(landscape.decisionSourceOf("kw-1"), null);
  assert.ok(linha.decisionReason, "o motivo técnico continua visível, sem virar decisão");
});

test("só source=human marca decisão territorial registrada", () => {
  const landscape = buildTerritorialLandscape({
    brandId: BRAND,
    keywords: [keyword("kw-humana"), keyword("kw-logica", "creme", "creme")],
    territories: [territory(REF_A)],
    assignments: [
      { keywordId: "kw-humana", brandId: BRAND, territoryRef: REF_A, state: "existing_silo_match",
        reason: "Decisão humana.", source: "human", decidedAt: "2026-09-02T12:00:00.000Z" } as never,
      { keywordId: "kw-logica", brandId: BRAND, territoryRef: null, state: "unassigned",
        reason: "Hipótese automática.", source: "logic", decidedAt: "2026-09-02T12:00:00.000Z" } as never,
    ],
  });
  const surface = buildTerritorialSurface({ landscape, logic: null });

  const rows = surface.groups.flatMap(group => group.rows);
  assert.equal(rows.find(row => row.keywordId === "kw-humana")?.decisionSource, "human");
  assert.equal(rows.find(row => row.keywordId === "kw-logica")?.decisionSource, "logic",
    "decisão da Lógica é rastreada, mas não é decisão humana");
});

test("a UI territorial deriva Decisão da origem, nunca do motivo técnico", () => {
  const rowsSource = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");

  assert.match(rowsSource, /row\.decisionSource === "human"/);
  assert.doesNotMatch(rowsSource, /row\.decisionReason \? "registrada"/,
    "motivo técnico preenchido não pode significar decisão registrada");
});
