import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  architectureBaseHash,
  buildArchitectureAnalysis,
  buildArchitectureConfirmationPlan,
} from "../lib/arquiteto/architecture-analysis.ts";
import type { KeywordUniverse } from "../lib/arquiteto/keyword-universe.ts";

const REF_PUB = "territory:11111111-1111-4111-8111-111111111111";
const REF_MAN = "territory:22222222-2222-4222-8222-222222222222";

const cluster = (overrides: Record<string, unknown> = {}) => ({
  clusterRef: "cluster:a",
  headKeywordId: "k1",
  ambiguousHeadKeywordIds: [] as string[],
  memberKeywordIds: ["k1", "k2"],
  coherence: 0.8,
  depth: "vertical",
  verticality: 0.75,
  axes: ["tipo de pele", "rotina"],
  evidence: ["mesma entidade central", "intenção compatível"],
  warnings: [] as string[],
  ...overrides,
});

const universe = (clusters: ReturnType<typeof cluster>[]) => ({ clusters } as unknown as KeywordUniverse);

const territory = (territoryRef: string, overrides: Record<string, unknown> = {}) => ({
  territoryRef,
  name: "Skincare Facial",
  centralEntity: "skincare facial",
  lifecycleStatus: "candidate",
  slug: "/rotina-skincare-facial",
  isPublished: true,
  ...overrides,
});

const texts = (entries: [string, string][]) => new Map(entries);

/* ------------------------- o universo vem primeiro ----------------------- */

test("silo existente tem prioridade sobre criar um concorrente", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster({ memberKeywordIds: ["k1", "k2"] })]),
    territories: [territory(REF_PUB)],
    keywordTexts: texts([["k1", "skincare facial rotina"], ["k2", "skincare facial pele oleosa"]]),
  });

  const item = analise.clusters[0];
  assert.equal(item.destination, "strengthen_existing_silo");
  assert.equal(item.suggestedTerritoryRef, REF_PUB);
  assert.match(item.reason, /já existe.*evita criar um silo concorrente/);
  assert.equal(analise.summary.newSilos, 0);
});

test("grupo profundo sem dono vira candidato a silo novo", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster({ axes: ["preço", "uso", "marca"] })]),
    territories: [territory(REF_PUB)],
    keywordTexts: texts([["k1", "protetor solar mineral"], ["k2", "protetor solar resistente a agua"]]),
  });

  assert.equal(analise.clusters[0].destination, "new_silo_candidate");
  assert.equal(analise.clusters[0].suggestedTerritoryRef, null);
  assert.match(analise.clusters[0].reason, /eixo\(s\) distinto\(s\).*universo próprio/);
});

test("grupo raso não vira silo: segue para artigos", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster({ depth: "horizontal", verticality: 0.2, axes: ["preço"] })]),
    territories: [territory(REF_PUB)],
    keywordTexts: texts([["k1", "vitamina c serum"], ["k2", "vitamina c creme"]]),
  });

  assert.equal(analise.clusters[0].destination, "insufficient_depth");
  assert.match(analise.clusters[0].reason, /segue para a formação de artigos/);
  assert.equal(analise.summary.insufficient, 1);
});

test("encaixe empatado vira ambiguidade, sem escolher pelo humano", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster()]),
    territories: [
      territory(REF_PUB, { name: "Skincare Facial", centralEntity: "skincare facial" }),
      territory(REF_MAN, { name: "Skincare Facial", centralEntity: "skincare facial", slug: "/skin-care", isPublished: false }),
    ],
    keywordTexts: texts([["k1", "skincare facial"], ["k2", "skincare facial rotina"]]),
  });

  const item = analise.clusters[0];
  assert.equal(item.destination, "ambiguous");
  assert.equal(item.alternativeTerritoryRefs.length, 2);
  assert.equal(item.confidence, "baixa");
  assert.match(item.reason, /A escolha é humana/);
});

test("cinquenta keywords não viram cinquenta silos", () => {
  // Dez clusters rasos: nenhum sustenta universo próprio.
  const rasos = Array.from({ length: 10 }, (_, index) => cluster({
    clusterRef: `cluster:${index}`,
    memberKeywordIds: [`k${index}`],
    depth: "insufficient",
    verticality: 0.1,
    axes: ["preço"],
  }));
  const analise = buildArchitectureAnalysis({
    universe: universe(rasos),
    territories: [],
    keywordTexts: texts(rasos.map((_, index) => [`k${index}`, `tema ${index}`] as [string, string])),
  });

  assert.equal(analise.summary.clusters, 10);
  assert.equal(analise.summary.newSilos, 0);
  assert.equal(analise.summary.insufficient, 10);
});

/* -------------------------- pontuação explicável ------------------------- */

test("nenhuma pontuação é opaca: toda nota carrega as razões", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster({ warnings: ["uma keyword tem intenção parcialmente diferente"] })]),
    territories: [territory(REF_PUB)],
    keywordTexts: texts([["k1", "skincare facial rotina"], ["k2", "skincare facial pele oleosa"]]),
  });

  const scores = analise.clusters[0].scores;
  for (const [nome, score] of Object.entries(scores)) {
    assert.ok(score.value >= 0 && score.value <= 100, `${nome} fora de 0..100`);
    assert.ok(score.reasons.length > 0, `${nome} sem razões`);
  }
  assert.match(scores.coherence.reasons.join(" "), /atenção: uma keyword tem intenção parcialmente diferente/);
  assert.match(scores.depth.reasons.join(" "), /eixo\(s\) distinto\(s\)/);
  assert.match(scores.siloFit.reasons.join(" "), /estrutura publicada existente cobre este universo/);
});

test("profundidade vale mais que quantidade", () => {
  const muitas = buildArchitectureAnalysis({
    universe: universe([cluster({ memberKeywordIds: Array.from({ length: 10 }, (_, i) => `k${i}`), depth: "horizontal", verticality: 0.2, axes: ["preço"] })]),
    territories: [],
    keywordTexts: texts(Array.from({ length: 10 }, (_, i) => [`k${i}`, "creme barato"] as [string, string])),
  });
  const poucas = buildArchitectureAnalysis({
    universe: universe([cluster({ memberKeywordIds: ["k1", "k2", "k3"], depth: "vertical", verticality: 0.8, axes: ["a", "b", "c", "d"] })]),
    territories: [],
    keywordTexts: texts([["k1", "retinol iniciante"], ["k2", "retinol preço"], ["k3", "retinol como usar"]]),
  });

  assert.equal(muitas.clusters[0].destination, "insufficient_depth");
  assert.equal(poucas.clusters[0].destination, "new_silo_candidate");
});

/* ------------------------------ hash do lote ----------------------------- */

test("o hash muda com o universo e ignora a ordem", () => {
  const base = { keywordIds: ["a", "b"], territoryRefs: ["t1"], publishedRootPaths: ["/x"] };
  assert.equal(
    architectureBaseHash(base),
    architectureBaseHash({ keywordIds: ["b", "a"], territoryRefs: ["t1"], publishedRootPaths: ["/x"] }),
  );
  assert.notEqual(base && architectureBaseHash(base), architectureBaseHash({ ...base, keywordIds: ["a", "b", "c"] }));
  assert.match(architectureBaseHash(base), /^arch:[0-9a-f]{16}$/);
});

test("mesmos inputs produzem a mesma arquitetura", () => {
  const entrada = {
    universe: universe([cluster()]),
    territories: [territory(REF_PUB)],
    keywordTexts: texts([["k1", "skincare facial"], ["k2", "skincare facial rotina"]]),
  };
  const primeira = buildArchitectureAnalysis(entrada);
  const segunda = buildArchitectureAnalysis(entrada);

  assert.deepEqual(primeira.clusters, segunda.clusters);
  assert.equal(primeira.baseHash, segunda.baseHash);
});

/* ------------------------ plano de confirmação --------------------------- */

test("a confirmação global não ignora bloqueio de silo", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster()]),
    territories: [territory(REF_PUB)],
    keywordTexts: texts([["k1", "skincare facial"], ["k2", "skincare facial rotina"]]),
  });

  const plano = buildArchitectureConfirmationPlan({
    analysis: analise,
    readiness: new Map([
      [REF_PUB, { ready: true, blockers: [], label: "Skincare Facial" }],
      [REF_MAN, { ready: false, blockers: ["falta definir a entidade central;"], label: "Cuidados faciais" }],
    ]),
    candidateTerritoryRefs: new Set([REF_PUB, REF_MAN]),
  });

  assert.deepEqual(plano.confirmTerritoryRefs, [REF_PUB]);
  assert.equal(plano.skipped.length, 1);
  assert.equal(plano.skipped[0].label, "Cuidados faciais");
  assert.match(plano.skipped[0].blockers.join(" "), /falta definir a entidade central/);
});

test("o plano registra a membership aprovada, com motivo humano", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster()]),
    territories: [territory(REF_PUB)],
    keywordTexts: texts([["k1", "skincare facial"], ["k2", "skincare facial rotina"]]),
  });

  const plano = buildArchitectureConfirmationPlan({
    analysis: analise,
    readiness: new Map(),
    candidateTerritoryRefs: new Set(),
  });

  assert.equal(plano.assignments.length, 2);
  assert.equal(plano.assignments[0].territoryRef, REF_PUB);
  assert.match(plano.assignments[0].reason, /Arquitetura do lote confirmada/);
});

test("ambiguidade nunca é resolvida em lote", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster()]),
    territories: [
      territory(REF_PUB),
      territory(REF_MAN, { slug: "/skin-care", isPublished: false }),
    ],
    keywordTexts: texts([["k1", "skincare facial"], ["k2", "skincare facial rotina"]]),
  });
  const plano = buildArchitectureConfirmationPlan({
    analysis: analise,
    readiness: new Map(),
    candidateTerritoryRefs: new Set(),
  });

  assert.equal(analise.clusters[0].destination, "ambiguous");
  assert.deepEqual(plano.assignments, [], "escolher por conta própria seria decidir no lugar da pessoa");
});

test("cluster mantido sem silo não vira território", () => {
  const analise = buildArchitectureAnalysis({
    universe: universe([cluster({ depth: "horizontal", verticality: 0.2 })]),
    territories: [],
    keywordTexts: texts([["k1", "vitamina c"], ["k2", "vitamina c rosto"]]),
  });
  const plano = buildArchitectureConfirmationPlan({
    analysis: analise, readiness: new Map(), candidateTerritoryRefs: new Set(),
  });

  assert.equal(plano.keptWithoutSilo.length, 1);
  assert.deepEqual(plano.assignments, []);
  assert.deepEqual(plano.confirmTerritoryRefs, []);
});

/* ------------------------------ contrato duro ---------------------------- */

test("a análise é proposta, não aplicação", () => {
  const source = readFileSync("lib/arquiteto/architecture-analysis.ts", "utf8")
    .split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");

  // Nenhuma escrita, nenhum provider, nenhum storage.
  assert.doesNotMatch(source, /fetch\(|supabase|territoryUpdates|territoryCreates|localStorage/);
  assert.doesNotMatch(source, /dataforseo|deepseek/i);
  // Nenhum algoritmo de clustering paralelo: o universo vem pronto.
  assert.match(source, /import type \{ KeywordUniverse/);
});

test("identidade publicada nunca é alvo de mudança", () => {
  const source = readFileSync("lib/arquiteto/architecture-analysis.ts", "utf8");
  assert.doesNotMatch(source, /setCanonical|rewriteUrl|newSlug|redirect/i);
});
