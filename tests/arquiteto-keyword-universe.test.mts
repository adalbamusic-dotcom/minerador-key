import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildKeywordUniverse, qualifiesAsNewSiloHead, reservedSiloPageHeadIds } from "../lib/arquiteto/keyword-universe.ts";
import { buildTerritorialLandscape, type TerritorialLandscapeInput } from "../lib/arquiteto/territorial-landscape.ts";
import { deriveTerritorialLogic } from "../lib/arquiteto/territorial-logic.ts";

/**
 * Primeira leitura do lote recebido do Minerador.
 *
 * A pergunta é sobre o UNIVERSO — quais narrativas sustentam Silos profundos —
 * e não sobre cada keyword isolada contra destinos existentes. Silo novo é a
 * última opção; poucos Silos profundos valem mais que muitos rasos.
 */

const BRAND = "brand-1";
const OTHER = "brand-2";
const HASH = `sha256:${"a".repeat(64)}`;

const kw = (id: string, keyword: string, entity: string, extra: Record<string, unknown> = {}) => ({
  id, brand_id: BRAND, keyword, intent: "informacional",
  analise_semantica: { entidade_central: entity }, ...extra,
});

const siloDna = (siloId: string, name: string) => ({
  versionId: `v-${siloId}`, entityId: siloId, versionNumber: 1, previousVersionId: null,
  contentHash: HASH, origin: "human", changeReason: "seed",
  createdAt: "2026-09-03T12:00:00.000Z", createdBy: "user-1",
  payload: { siloId, name, brandId: BRAND },
});

const universeOf = (keywords: ReturnType<typeof kw>[]) => buildKeywordUniverse({ brandId: BRAND, keywords });

const logicOf = (keywords: ReturnType<typeof kw>[], siloDnas: unknown[] = []) => {
  const landscape = buildTerritorialLandscape({
    brandId: BRAND, keywords, territories: [], assignments: [], siloDnas: siloDnas as never,
  } as TerritorialLandscapeInput);
  return deriveTerritorialLogic({ landscape, keywords, universe: universeOf(keywords) });
};

const newSilos = (result: ReturnType<typeof logicOf>) =>
  result.hypotheses.filter(item => item.state === "new_silo_candidate").map(item => item.keywordId);

/* ------------------------------ cenários §25-§29 ------------------------- */

const SKIN_CARE = [
  kw("a1", "skin care", "skin care"),
  kw("a2", "skin care pele oleosa", "skin care"),
  kw("a3", "skin care pele seca", "skin care"),
  kw("a4", "skin care vitamina c", "skin care"),
  kw("a5", "rotina de skin care", "skin care"),
];

test("A · uma narrativa com cauda não vira cinco Silos", () => {
  const universe = universeOf(SKIN_CARE);

  assert.equal(universe.clusters.length, 1, "o lote inteiro é uma narrativa só");
  const cluster = universe.clusters[0];
  assert.equal(cluster.headKeywordId, "a1", "`skin care` organiza o grupo");
  assert.equal(cluster.depth, "vertical");
  assert.ok(cluster.axes.length >= 2, "eixos de expansão distintos sustentam a profundidade");

  // E a Lógica propõe UM silo, não cinco.
  assert.deepEqual(newSilos(logicOf(SKIN_CARE)), ["a1"]);
});

test("A · os demais viram contexto do silo candidato, sem membership", () => {
  const contexto = logicOf(SKIN_CARE).hypotheses.filter(item => item.keywordId !== "a1");

  for (const item of contexto) {
    assert.equal(item.state, "unassigned", "hipótese não grava membership");
    assert.equal(item.universeRole, "context_of_new_silo");
    assert.equal(item.headKeywordId, "a1");
    assert.deepEqual(item.targets, [], "nenhum destino é fabricado");
  }
});

test("B · duas narrativas independentes podem propor dois Silos", () => {
  const keywords = [
    kw("b1", "skin care", "skin care"),
    kw("b2", "skin care pele oleosa", "skin care"),
    kw("b3", "rotina de skin care", "skin care"),
    kw("b4", "maquiagem", "maquiagem"),
    kw("b5", "maquiagem para pele oleosa", "maquiagem"),
    kw("b6", "base de maquiagem", "maquiagem"),
  ];
  const universe = universeOf(keywords);

  assert.equal(universe.clusters.length, 2, "duas narrativas, dois grupos");
  assert.deepEqual(newSilos(logicOf(keywords)), ["b1", "b4"]);
});

test("C · keyword ampla de alto volume sozinha não vira Silo", () => {
  const keywords = [kw("c1", "estetica", "estetica", { volume_search: 90000 })];
  const cluster = universeOf(keywords).clusters[0];

  assert.equal(cluster.depth, "insufficient");
  assert.equal(cluster.headKeywordId, null);
  assert.deepEqual(newSilos(logicOf(keywords)), [], "volume sozinho não promove");

  const gate = qualifiesAsNewSiloHead({ universe: universeOf(keywords), keywordId: "c1" });
  assert.equal(gate.qualifies, false);
  assert.match(gate.reason, /Sozinha no lote/);
});

test("D · cauda longa com KGR forte não é cabeceira", () => {
  const keywords = [
    kw("d1", "creme", "creme"),
    kw("d2", "creme para pele oleosa", "creme"),
    kw("d3", "creme hidratante noturno", "creme"),
    kw("d4", "melhor creme para pele oleosa com acido salicilico", "creme", { kgr_score: 0.2, volume_search: 40 }),
  ];
  const universe = universeOf(keywords);

  assert.notEqual(universe.roleOf("d4")?.role, "head");
  assert.equal(newSilos(logicOf(keywords)).includes("d4"), false);
  // Continua disponível: não justificar Silo não a transforma em Article agora.
  const hipotese = logicOf(keywords).hypotheses.find(item => item.keywordId === "d4");
  assert.equal(hipotese?.state, "unassigned");
});

test("E · grupo compatível com Silo existente fortalece em vez de criar", () => {
  const keywords = [
    kw("e1", "skin care pele oleosa", "skin care"),
    kw("e2", "skin care noturno", "skin care"),
  ];
  const resultado = logicOf(keywords, [siloDna("silo-skin", "skin care")]);

  assert.deepEqual(newSilos(resultado), []);
  for (const item of resultado.hypotheses) assert.equal(item.state, "expand_existing_silo");
});

/* ------------------------------- §30 extras ------------------------------ */

test("sinônimos sem substring literal continuam no mesmo universo", () => {
  const keywords = [
    kw("f1", "cuidados com a pele", "skin care"),
    kw("f2", "rotina de skincare", "skin care"),
    kw("f3", "produtos para o rosto", "skin care"),
  ];
  const universe = universeOf(keywords);

  assert.equal(universe.clusters.length, 1, "a entidade do Minerador une o que a substring não uniria");
  assert.deepEqual(universe.clusters[0].memberKeywordIds, ["f1", "f2", "f3"]);
});

test("grupo horizontal não propõe Silo novo", () => {
  const keywords = [
    kw("g1", "skin care rosto", "skin care"),
    kw("g2", "skincare para o rosto", "skin care"),
    kw("g3", "skin care para rosto", "skin care"),
  ];
  const cluster = universeOf(keywords).clusters[0];

  assert.equal(cluster.depth, "horizontal");
  assert.deepEqual(newSilos(logicOf(keywords)), []);
  // Variações do mesmo pedido não devem virar Articles irmãos.
  assert.ok(universeOf(keywords).roleOf("g1")?.nearEquivalentKeywordIds.length);
});

test("grupo numeroso e incoerente não ganha profundidade", () => {
  const keywords = [
    kw("h1", "manicure", "manicure"),
    kw("h2", "contabilidade", "contabilidade"),
    kw("h3", "aluguel de carro", "carro"),
    kw("h4", "curso de ingles", "ingles"),
    kw("h5", "pizza", "pizza"),
  ];

  assert.deepEqual(newSilos(logicOf(keywords)), [], "quantidade não é profundidade");
  for (const cluster of universeOf(keywords).clusters) assert.equal(cluster.depth, "insufficient");
});

test("duas cabeceiras quase empatadas viram ambiguidade, não escolha arbitrária", () => {
  const keywords = [
    kw("i1", "harmonizacao facial", "harmonizacao facial"),
    kw("i2", "harmonizacao orofacial", "harmonizacao facial"),
  ];
  const cluster = universeOf(keywords).clusters[0];

  if (cluster.headKeywordId === null) {
    assert.ok(cluster.warnings.length, "ausência de cabeceira é declarada");
  } else {
    assert.deepEqual(cluster.ambiguousHeadKeywordIds, []);
  }
  assert.deepEqual(newSilos(logicOf(keywords)), [], "sem cabeceira clara não se propõe silo");
});

test("cross-brand não entra no mesmo universo", () => {
  const universe = buildKeywordUniverse({
    brandId: BRAND,
    keywords: [kw("j1", "skin care", "skin care"), { id: "j2", brand_id: OTHER, keyword: "skin care", analise_semantica: { entidade_central: "skin care" } }],
  });

  assert.deepEqual(universe.projections.map(item => item.keywordId), ["j1"]);
});

/* ------------------------------- invariantes ----------------------------- */

test("o universo é determinístico, derivado e não persiste nada", () => {
  const primeira = universeOf(SKIN_CARE);
  const segunda = universeOf(SKIN_CARE);
  assert.deepEqual(JSON.parse(JSON.stringify(primeira.clusters)), JSON.parse(JSON.stringify(segunda.clusters)));

  const source = readFileSync("lib/arquiteto/keyword-universe.ts", "utf8");
  assert.doesNotMatch(source, /fetch\(|supabase|localStorage|IndexedDB|migration|deepseek|dataforseo/i);
  // Nem territoryRef, nem Silo, nem recálculo de KGR.
  assert.doesNotMatch(source, /territory:|territoryRef\s*[:=]|kgr_score\s*=/);
  // Contagem nunca decide.
  assert.doesNotMatch(source, /memberCount >= \d|length >= \d\s*\)\s*return\s*\{\s*depth: "vertical"/);
});

test("a UI mostra cabeceira e contexto sem falar em Cluster", () => {
  const rows = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(rows, /Relacionado ao silo candidato/);
  assert.match(rows, /Candidata a novo silo/);
  assert.doesNotMatch(rows, /[Cc]luster/, "Cluster é termo interno, não vocabulário do usuário");
  assert.match(workspace, /buildKeywordUniverse\(/);
});

/* ---------------------- reserva da cabeceira (§A) ------------------------ */

test("a cabeceira fica reservada e os membros continuam disponíveis", () => {
  const keywords = [
    kw("r1", "skin care", "skin care"),
    kw("r2", "skin care pele oleosa", "skin care"),
    kw("r3", "skin care pele seca", "skin care"),
  ];
  const universe = universeOf(keywords);
  const reservadas = reservedSiloPageHeadIds(universe);

  assert.equal(universe.roleOf("r1")?.role, "head");
  assert.deepEqual([...reservadas], ["r1"], "só a cabeceira é reservada");
  // §5: contexto do silo continua disponível para virar Article.
  assert.equal(reservadas.has("r2"), false);
  assert.equal(reservadas.has("r3"), false);
});

test("a reserva cai sozinha quando a hipótese deixa de valer", () => {
  const vertical = [
    kw("r1", "skin care", "skin care"),
    kw("r2", "skin care pele oleosa", "skin care"),
    kw("r3", "skin care pele seca", "skin care"),
  ];
  assert.deepEqual([...reservedSiloPageHeadIds(universeOf(vertical))], ["r1"]);

  // Mesmo grupo, agora só variações do mesmo pedido: deixa de ser vertical.
  const horizontal = [
    kw("r1", "skin care rosto", "skin care"),
    kw("r2", "skincare para o rosto", "skin care"),
    kw("r3", "skin care para rosto", "skin care"),
  ];
  assert.deepEqual([...reservedSiloPageHeadIds(universeOf(horizontal))], [], "sem tombstone: basta recalcular");

  // Keyword sozinha também não fica reservada.
  assert.deepEqual([...reservedSiloPageHeadIds(universeOf([kw("r1", "skin care", "skin care")]))], []);
});

test("pertencer a Silo existente não reserva a keyword como cabeceira de página", () => {
  const keywords = [
    kw("s1", "skin care", "skin care"),
    kw("s2", "skin care pele oleosa", "skin care"),
    kw("s3", "skin care pele seca", "skin care"),
  ];
  const resultado = logicOf(keywords, [siloDna("silo-skin", "skin care")]);

  // §7: com destino existente a hipótese é fortalecer, não criar página nova.
  assert.deepEqual(newSilos(resultado), []);
  const universe = universeOf(keywords);
  const gate = qualifiesAsNewSiloHead({ universe, keywordId: "s1" });
  assert.equal(gate.qualifies, true, "o universo isolado ainda vê a cabeceira");
  // Mas a Lógica, que enxerga o patrimônio, não propõe silo novo.
  assert.equal(resultado.hypotheses.every(item => item.state === "expand_existing_silo"), true);
});

test("a projeção de Article exclui a cabeceira reservada, não os membros", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(workspace, /reservedSiloPageHeadIds\(keywordUniverse\)/);
  assert.match(workspace, /if \(reservedSiloHeadIds\.has\(String\(kw\.id\)\)\) return;/);
  // Transparência sem artigo falso.
  assert.match(workspace, /architect-reserved-silo-heads/);
  assert.match(workspace, /Reservadas para Silo/);
  // Nenhuma persistência nova para sustentar a reserva.
  const universo = readFileSync("lib/arquiteto/keyword-universe.ts", "utf8");
  assert.doesNotMatch(universo, /reserved.*(insert|update|upsert|supabase)/i);
});
