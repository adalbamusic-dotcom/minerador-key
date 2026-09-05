import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  accountedKeywords,
  buildArchitectureFlowProjection,
  clusterRefOfFlowNode,
} from "../lib/arquiteto/architecture-flow.ts";
import type { ArchitectureAnalysis, ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";

const REF_SITE = "territory:11111111-1111-4111-8111-111111111111";
const REF_MANUAL = "territory:22222222-2222-4222-8222-222222222222";

const score = () => ({ value: 80, reasons: ["motivo"] });

const cluster = (overrides: Partial<ClusterAnalysis> = {}): ClusterAnalysis => ({
  clusterRef: "cluster:a",
  label: "skincare",
  memberKeywordIds: ["k1", "k2", "k3"],
  headKeywordId: "k1",
  ambiguousHeadKeywordIds: [],
  destination: "strengthen_existing_silo",
  suggestedTerritoryRef: REF_SITE,
  suggestedTerritoryLabel: "Pele Oleosa e Acne",
  alternativeTerritoryRefs: [],
  scores: { coherence: score(), siloFit: score(), depth: score(), publishedEvidence: score() },
  confidence: "alta",
  reason: "pertence ao universo existente",
  ...overrides,
});

const analysis = (clusters: ClusterAnalysis[]): ArchitectureAnalysis => ({
  clusters,
  summary: { keywords: 0, clusters: clusters.length, strengthening: 0, newSilos: 0, insufficient: 0, ambiguous: 0, confidence: "alta" },
  narrative: [],
  baseHash: "arch:teste",
});

const build = (clusters: ClusterAnalysis[], extra: Record<string, unknown> = {}) =>
  buildArchitectureFlowProjection({
    analysis: analysis(clusters),
    keywordTexts: new Map([["k1", "skin care caseiro"], ["k2", "skin care barato"], ["k3", "skincare"]]),
    territoryLabels: new Map([
      [REF_SITE, { label: "Pele Oleosa e Acne", slug: "/pele-oleosa-e-acne" }],
      [REF_MANUAL, { label: "Skin care para peles oleosas", slug: "/skin-care-para-peles-oleosas" }],
    ]),
    publishedTerritoryRefs: new Set([REF_SITE]),
    ...extra,
  });

/* --------------------------- silo no centro ------------------------------ */

test("destino resolvido põe o SILO no centro, sem nó de cluster no meio", () => {
  const projecao = build([cluster()]);

  const centro = projecao.nodes.find(node => node.kind === "silo_site")!;
  assert.equal(centro.label, "Pele Oleosa e Acne");
  assert.equal(centro.meta, "/pele-oleosa-e-acne · Publicado");
  // Silo + keywords É o cluster: nenhuma entidade visual extra no meio.
  assert.equal(projecao.nodes.some(node => node.kind === "cluster"), false);
  // Toda aresta vai da keyword direto ao centro.
  for (const edge of projecao.edges) assert.equal(edge.target, centro.id);
});

test("as keywords orbitam o centro em vez de empilhar", () => {
  const projecao = build([cluster()]);

  const centro = projecao.nodes.find(node => node.kind === "silo_site")!;
  const keywords = projecao.nodes.filter(node => node.kind === "keyword");
  assert.equal(keywords.length, 3);
  const xs = new Set(keywords.map(node => node.position.x));
  const ys = new Set(keywords.map(node => node.position.y));
  assert.ok(xs.size > 1 && ys.size > 1, "órbita ocupa os dois eixos, não uma coluna");
  for (const keyword of keywords) {
    assert.notDeepEqual(keyword.position, centro.position);
  }
});

test("silo manual e silo do site têm badges distintos", () => {
  const projecao = build([cluster({ suggestedTerritoryRef: REF_MANUAL })]);

  const centro = projecao.nodes.find(node => node.kind === "silo_manual")!;
  assert.equal(centro.label, "Skin care para peles oleosas");
  assert.match(centro.meta!, /Proposto/);
});

test("a cabeceira provável é marcada, sem virar decisão", () => {
  const projecao = build([cluster()]);
  const cabeceira = projecao.nodes.find(node => node.keywordId === "k1")!;

  assert.equal(cabeceira.meta, "cabeceira provável");
});

/* ------------------------- cluster sem silo ------------------------------ */

test("grupo sem destino usa CLUSTER no centro, nunca SILO", () => {
  const projecao = build([cluster({
    destination: "insufficient_depth", suggestedTerritoryRef: null, suggestedTerritoryLabel: null,
  })]);

  const centro = projecao.nodes.find(node => node.kind === "cluster")!;
  assert.equal(centro.label, "skincare");
  assert.equal(centro.meta, "Sem profundidade para Silo");
  // Nenhum silo é anunciado antes da decisão humana.
  assert.equal(projecao.nodes.some(node => node.kind.startsWith("silo")), false);
  assert.doesNotMatch(centro.id, /^silo:/);
});

test("candidato a novo Silo continua CLUSTER até a confirmação", () => {
  const projecao = build([cluster({
    destination: "new_silo_candidate", suggestedTerritoryRef: null, suggestedTerritoryLabel: null,
  })]);

  const centro = projecao.nodes.find(node => node.kind === "cluster")!;
  assert.equal(centro.meta, "Destino sugerido: novo Silo");
});

test("ambiguidade é declarada no centro", () => {
  const projecao = build([cluster({
    destination: "ambiguous", suggestedTerritoryRef: null,
    alternativeTerritoryRefs: [REF_SITE, REF_MANUAL],
  })]);

  assert.equal(projecao.nodes.find(node => node.kind === "cluster")!.meta, "Dois destinos plausíveis");
});

/* --------------------------- sugerida × confirmada ----------------------- */

test("aresta é sugestão antes da confirmação e vira confirmada depois", () => {
  const sugerida = build([cluster()]);
  assert.ok(sugerida.edges.every(edge => edge.relation === "suggested"));

  const confirmada = build([cluster()], {
    confirmedMembership: new Map([["k1", REF_SITE], ["k2", REF_SITE]]),
  });
  const porKeyword = new Map(confirmada.edges.map(edge => [edge.source, edge.relation]));
  assert.equal(porKeyword.get("kw:cluster:a:k1"), "confirmed");
  assert.equal(porKeyword.get("kw:cluster:a:k3"), "suggested", "quem não foi confirmada continua sugestão");
});

/* ------------------------------ layout ----------------------------------- */

test("cada destino ocupa sua própria célula, sem empilhar tudo numa coluna", () => {
  const projecao = build([
    cluster({ clusterRef: "cluster:a", suggestedTerritoryRef: REF_SITE }),
    cluster({ clusterRef: "cluster:b", suggestedTerritoryRef: REF_MANUAL }),
    cluster({ clusterRef: "cluster:c", destination: "insufficient_depth", suggestedTerritoryRef: null }),
    cluster({ clusterRef: "cluster:d", destination: "new_silo_candidate", suggestedTerritoryRef: null }),
  ]);

  const centros = projecao.nodes.filter(node => node.kind !== "keyword");
  const posicoes = new Set(centros.map(node => `${node.position.x}:${node.position.y}`));
  assert.equal(posicoes.size, 4, "nenhum grupo se sobrepõe a outro");
  const xs = new Set(centros.map(node => node.position.x));
  assert.ok(xs.size > 1, "os grupos se distribuem em colunas");
});

test("dois grupos para o MESMO Silo compartilham o centro, sem duplicá-lo", () => {
  const projecao = build([
    cluster({ clusterRef: "cluster:a", memberKeywordIds: ["k1", "k2"] }),
    cluster({ clusterRef: "cluster:b", memberKeywordIds: ["k3"] }),
  ]);

  // O Silo é um só: duplicar o nó criaria duas identidades para a mesma coisa.
  const centros = projecao.nodes.filter(node => node.kind !== "keyword");
  assert.equal(centros.length, 1);
  assert.equal(centros[0].id, `silo:${REF_SITE}`);
  // As keywords dos dois grupos orbitam esse centro, e nenhuma some.
  assert.equal(projecao.nodes.filter(node => node.kind === "keyword").length, 3);
  assert.ok(projecao.edges.every(edge => edge.target === centros[0].id));
  const angulos = new Set(projecao.nodes.filter(node => node.kind === "keyword").map(node => `${node.position.x}:${node.position.y}`));
  assert.equal(angulos.size, 3, "as três ocupam posições distintas na órbita");
});

/* ------------------------------ hairball --------------------------------- */

test("grupo grande mostra parte e declara o resto", () => {
  const muitas = Array.from({ length: 14 }, (_, index) => `k${index}`);
  const projecao = buildArchitectureFlowProjection({
    analysis: analysis([cluster({ memberKeywordIds: muitas })]),
    keywordTexts: new Map(muitas.map(id => [id, id])),
    territoryLabels: new Map([[REF_SITE, { label: "Silo", slug: "/silo" }]]),
    publishedTerritoryRefs: new Set([REF_SITE]),
  });

  assert.equal(projecao.nodes.filter(node => node.kind === "keyword").length, 8);
  assert.equal(projecao.hiddenByCluster["cluster:a"], 6);
  // Nenhuma keyword some em silêncio.
  const contas = accountedKeywords({ analysis: analysis([cluster({ memberKeywordIds: muitas })]), projection: projecao });
  assert.equal(contas.missing, 0);
  assert.equal(contas.analyzed, 14);
  assert.equal(contas.drawn + contas.hidden, 14);
});

test("expandir o grupo desenha todas as keywords", () => {
  const muitas = Array.from({ length: 14 }, (_, index) => `k${index}`);
  const projecao = buildArchitectureFlowProjection({
    analysis: analysis([cluster({ memberKeywordIds: muitas })]),
    keywordTexts: new Map(muitas.map(id => [id, id])),
    territoryLabels: new Map([[REF_SITE, { label: "Silo", slug: "/silo" }]]),
    publishedTerritoryRefs: new Set([REF_SITE]),
    expandedClusterRefs: new Set(["cluster:a"]),
  });

  assert.equal(projecao.nodes.filter(node => node.kind === "keyword").length, 14);
  assert.deepEqual(projecao.hiddenByCluster, {});
});

/* ---------------------------- seleção ------------------------------------ */

test("clicar em qualquer nó resolve o grupo dono", () => {
  const projecao = build([cluster({ clusterRef: "cluster:a" }), cluster({ clusterRef: "cluster:b" })]);

  assert.equal(clusterRefOfFlowNode(projecao, `silo:${REF_SITE}`), "cluster:a");
  assert.equal(clusterRefOfFlowNode(projecao, "kw:cluster:b:k2"), "cluster:b");
  assert.equal(clusterRefOfFlowNode(projecao, null), null);
  assert.equal(clusterRefOfFlowNode(projecao, "inexistente"), null);
});

/* --------------------------- contrato duro ------------------------------- */

test("o mapa é projeção: nada de posição, zoom ou aresta persistida", () => {
  const source = readFileSync("lib/arquiteto/architecture-flow.ts", "utf8")
    .split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");

  assert.doesNotMatch(source, /fetch\(|supabase|localStorage|subject_type|territoryUpdates/);
  // Nenhuma dependência de React aqui: é read-model.
  assert.doesNotMatch(source, /from "react"|useState|useMemo/);
});

test("a relação vem da análise, não da membership ainda inexistente", () => {
  // Sem membership confirmada, o mapa ainda desenha o destino sugerido.
  const projecao = build([cluster()]);

  assert.equal(projecao.edges.length, 3);
  assert.ok(projecao.edges.every(edge => edge.relation === "suggested"));
});
