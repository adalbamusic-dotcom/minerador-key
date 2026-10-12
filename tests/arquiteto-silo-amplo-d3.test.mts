import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SILO_ARTICLE_RANGE, SiloPlanSchema, validateSiloPlan, type SiloPlan, type SiloPlanContext } from "../lib/agent/silo-plan.ts";
import { buildStructuralLinkConnections, structuralLinkBlockers, type StructuralLinkUnit } from "../lib/arquiteto/internal-link-structure.ts";
import { batchLinkAnchorRequests, LINK_ANCHOR_MAX_CANDIDATES_PER_CALL, LINK_ANCHOR_MAX_UNITS_PER_CALL } from "../lib/arquiteto/link-anchor-ai.ts";
import { resolveSiloCompositionFromFormations, type ConcludedFormationInput } from "../lib/arquiteto/silo-composition-from-formations.ts";

/**
 * D3 DO DONO (2026-10-12) — SILO AMPLO, DE 4 A 30 ARTIGOS.
 *
 * "Os próximos projetos vão ser de 15 artigos por silo no mínimo… tem que ser
 * amplo." O teto subiu de 7 para 30, o mínimo continua 4, e de 8 a 30 é
 * tamanho normal: nenhum aviso, nenhuma exceção. Este arquivo prova com Silos
 * de 15 e de 30 artigos que a validação do plano, o esqueleto de links, o lote
 * de âncoras, a ordem narrativa e o funil aguentam o tamanho novo. Sem banco,
 * sem IA, sem SERP.
 */

const sem = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const TEMAS = [
  "alfa", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet",
  "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo", "sierra", "tango",
  "uniform", "victor", "whiskey", "xray", "yankee", "zulu", "ametista", "basalto", "cobalto", "diamante",
  "esmeralda",
] as const;

const FUNIS = ["TOFU", "MOFU", "BOFU"] as const;
const INTENCAO_POR_FUNIL = { TOFU: "informacional", MOFU: "comercial", BOFU: "transacional" } as const;

function planoCom(total: number): SiloPlan {
  return {
    siloName: "Planos de internet residencial",
    siloPage: { keyword: "planos de internet residencial" },
    articles: TEMAS.slice(0, total).map((tema, indice) => {
      const funnel = FUNIS[indice % FUNIS.length];
      return {
        subject: `Guia ${tema} de conexão doméstica`,
        targetKeyword: `conexao ${tema}`,
        role: indice === 0 ? "Pilar" as const : "Suporte" as const,
        funnel,
        intent: INTENCAO_POR_FUNIL[funnel],
      };
    }),
  };
}

const contexto: SiloPlanContext = { publishedPaths: [], existingArticleSlugs: [], existingSiloPageSlugs: [], existingArticleTopics: [] };

test("D3-01 · o tamanho do Silo é de 4 a 30 artigos", () => {
  assert.deepEqual({ ...SILO_ARTICLE_RANGE }, { min: 4, max: 30 });
});

for (const total of [15, 30]) {
  test(`D3-02 · plano de ${total} artigos passa no contrato e na validação, sem aviso de tamanho`, () => {
    const plano = planoCom(total);
    assert.equal(SiloPlanSchema.safeParse(plano).success, true, "o contrato do MCP aceita o plano");
    const resultado = validateSiloPlan(plano, contexto);
    assert.equal(resultado.ok, true, JSON.stringify(resultado.issues));
    assert.equal(resultado.plan.articles.length, total);
    const deTamanho = resultado.issues.filter(issue => issue.field === "articles" || /\bartigos\b/.test(issue.message));
    assert.deepEqual(deTamanho, [], "8+ não é exceção nem aviso");
    assert.equal(resultado.issues.some(issue => issue.field === "articles.funnel"), false, "funil misturado não reclama em Silo grande");
    assert.equal(new Set(resultado.plan.articles.map(article => article.slug)).size, total, "slugs distintos");
  });
}

test("D3-03 · 15 e 30 artigos têm o mesmo tratamento que 5: nenhum issue novo por causa do tamanho", () => {
  const issuesDe = (total: number) => validateSiloPlan(planoCom(total), contexto).issues.map(issue => `${issue.severity}:${issue.field.replace(/\.\d+\./, ".N.")}`);
  const base = new Set(issuesDe(5));
  for (const total of [15, 30]) {
    const novos = issuesDe(total).filter(chave => !base.has(chave));
    assert.deepEqual(novos, [], `Silo de ${total} trouxe issue que o de 5 não tem`);
  }
});

test("D3-04 · acima de 30 é recusado; abaixo de 4 continua bloqueio", () => {
  const grande = planoCom(30);
  grande.articles.push({ ...grande.articles[1], subject: "Guia extra de conexão doméstica", targetKeyword: "conexao extra" });
  assert.equal(SiloPlanSchema.safeParse(grande).success, false, "o contrato recusa 31");
  const bloqueio = validateSiloPlan(grande, contexto);
  assert.equal(bloqueio.ok, false);
  assert.ok(bloqueio.issues.some(issue => issue.severity === "block" && /de 4 a 30 artigos; a proposta tem 31/.test(issue.message)));
  const pequeno = planoCom(3);
  assert.ok(validateSiloPlan(pequeno, contexto).issues.some(issue => issue.severity === "block" && /de 4 a 30 artigos; a proposta tem 3/.test(issue.message)));
});

/* ------------------------- esqueleto e âncoras ------------------------- */

function unidades(total: number): StructuralLinkUnit[] {
  return [
    { nodeId: "silo-page", nodeType: "SILO_PAGE", architecturalRole: null, label: "Planos de internet" },
    ...Array.from({ length: total }, (_, indice) => ({
      nodeId: `article-${indice + 1}`,
      nodeType: "ARTICLE_DNA" as const,
      architecturalRole: indice === 0 ? "PILAR" as const : "SUPORTE" as const,
      label: `Artigo ${indice + 1}`,
    })),
  ];
}

for (const total of [15, 30]) {
  test(`D3-05 · o esqueleto de links de um Silo de ${total} artigos tem 2 + 3 × ${total - 1} conexões, sem Suporte ↔ Suporte`, () => {
    const units = unidades(total);
    assert.deepEqual(structuralLinkBlockers(units), []);
    const conexoes = buildStructuralLinkConnections(units);
    assert.equal(conexoes.length, 2 + 3 * (total - 1));
    const pares = new Set(conexoes.map(conexao => `${conexao.sourceNodeId}->${conexao.targetNodeId}`));
    assert.equal(pares.size, conexoes.length, "nenhuma conexão repetida");
    for (let indice = 2; indice <= total; indice += 1) {
      const suporte = `article-${indice}`;
      assert.ok(pares.has(`silo-page->${suporte}`));
      assert.ok(pares.has(`article-1->${suporte}`));
      assert.ok(pares.has(`${suporte}->article-1`));
    }
    assert.equal(conexoes.some(conexao => conexao.sourceNodeId !== "article-1" && conexao.targetNodeId !== "article-1" && conexao.sourceNodeId.startsWith("article-") && conexao.targetNodeId.startsWith("article-")), false);
  });
}

function pedidoDeAncoras(total: number) {
  const units = unidades(total).map(unit => ({ ref: unit.nodeId, label: unit.label }));
  const candidates = buildStructuralLinkConnections(unidades(total)).map(conexao => ({
    sourceRef: conexao.sourceNodeId,
    targetRef: conexao.targetNodeId,
    relationType: conexao.relationType,
    structuralReason: conexao.reason,
  }));
  return { units, candidates };
}

for (const [total, lotesEsperados] of [[7, 1], [13, 1], [14, 2], [15, 2], [30, 3]] as const) {
  test(`D3-06 · Silo de ${total} artigos: âncoras em ${lotesEsperados} lote(s), todos dentro do teto da rota`, () => {
    const { units, candidates } = pedidoDeAncoras(total);
    const lotes = batchLinkAnchorRequests(units, candidates);
    assert.equal(lotes.length, lotesEsperados);
    for (const lote of lotes) {
      assert.ok(lote.candidates.length >= 1 && lote.candidates.length <= LINK_ANCHOR_MAX_CANDIDATES_PER_CALL);
      assert.ok(lote.units.length >= 2 && lote.units.length <= LINK_ANCHOR_MAX_UNITS_PER_CALL);
      const refs = new Set(lote.units.map(unit => unit.ref));
      for (const candidate of lote.candidates) {
        assert.ok(refs.has(candidate.sourceRef) && refs.has(candidate.targetRef), "o lote leva as páginas que as conexões citam");
      }
    }
    assert.deepEqual(lotes.flatMap(lote => lote.candidates), candidates, "todas as conexões, uma vez, na ordem");
  });
}

test("D3-07 · conexão com página ausente ou para si mesma não vai à rota", () => {
  const units = [{ ref: "a" }, { ref: "b" }];
  const lotes = batchLinkAnchorRequests(units, [
    { sourceRef: "a", targetRef: "b" },
    { sourceRef: "a", targetRef: "fantasma" },
    { sourceRef: "b", targetRef: "b" },
  ]);
  assert.deepEqual(lotes, [{ units, candidates: [{ sourceRef: "a", targetRef: "b" }] }]);
  assert.deepEqual(batchLinkAnchorRequests(units, []), []);
});

test("D3-08 · a rota de âncoras e a tela usam o mesmo teto do lote", () => {
  const rota = sem(readFileSync(new URL("../app/api/arquiteto/internal-link-graph/anchors/route.ts", import.meta.url), "utf8"));
  assert.match(rota, /units: z\.array\(UnitSchema\)\.min\(2\)\.max\(LINK_ANCHOR_MAX_UNITS_PER_CALL\)/);
  assert.match(rota, /\.min\(1\)\.max\(LINK_ANCHOR_MAX_CANDIDATES_PER_CALL\)/);
  const tela = sem(readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"));
  assert.match(tela, /batchLinkAnchorRequests\(units, candidates\)/);
  assert.doesNotMatch(tela, /internal-link-graph\/anchors", \{\s*brandId: selectedBrandId,\s*siloId,\s*units,\s*candidates,/, "nenhum pedido único com o Silo inteiro");
});

/* --------------------------- ordem narrativa --------------------------- */

for (const total of [15, 30]) {
  test(`D3-09 · composição de ${total} formações: Pilar primeiro e ${total - 1} Suportes na ordem narrativa`, () => {
    const formacoes: ConcludedFormationInput[] = Array.from({ length: total }, (_, indice) => ({
      candidateRef: `candidate-${String(indice + 1).padStart(2, "0")}`,
      principalKeywordId: `kw-${indice + 1}`,
      members: Array.from({ length: indice === 0 ? 6 : 1 + (indice % 4) }, (_, membro) => ({ keywordId: `kw-${indice + 1}-${membro}`, role: membro === 0 ? "principal" as const : "secundaria" as const })),
      formationBaseHash: `hash-${indice + 1}`,
      materializedArticleId: null,
    }));
    const composicao = resolveSiloCompositionFromFormations({ formations: formacoes });
    assert.equal(composicao.pillarCandidateRef, "candidate-01");
    assert.equal(composicao.supportCandidateRefs.length, total - 1);
    assert.equal(composicao.narrativeOrder.length, total);
    assert.equal(new Set(composicao.narrativeOrder).size, total);
    assert.equal(composicao.narrativeOrder[0], "candidate-01");
  });
}

/* ------------------------- tela, MCP e catálogo ------------------------ */

test("D3-10 · o mapa do Silo no Arquiteto mostra todos os Suportes", () => {
  const workbench = sem(readFileSync(new URL("../modules/arquiteto/arquiteto-workbench.tsx", import.meta.url), "utf8"));
  assert.doesNotMatch(workbench, /supportArticleIds\.slice\(0,/);
});

test("D3-11 · o MCP e o catálogo dizem 4 a 30, sem o teto antigo", () => {
  const mcp = sem(readFileSync(new URL("../lib/server/platform-mcp-tools.ts", import.meta.url), "utf8"));
  assert.match(mcp, /\$\{SILO_ARTICLE_RANGE\.min\} a \$\{SILO_ARTICLE_RANGE\.max\} artigos/);
  const catalogo = readFileSync(new URL("../lib/agent/platform-catalog.ts", import.meta.url), "utf8");
  assert.match(catalogo, /silo de 4 a 30 artigos/i);
  assert.match(catalogo, /Silo: de 4 a 30 artigos/);
  assert.doesNotMatch(catalogo, /4 a 7 artigos/);
});
