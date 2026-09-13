import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildStructuralLinkConnections,
  describeStructuralLinkDerivation,
  structuralLinkBlockers,
  type StructuralLinkUnit,
} from "../lib/arquiteto/internal-link-structure.ts";
import { suggestInternalLinkAnchorConcepts } from "../lib/arquiteto/link-anchor-concepts.ts";
import type { ArticleDNA, SiloPage } from "../lib/arquiteto/contracts.ts";

/**
 * O CENÁRIO REAL: 6 NÓS, 0 ARESTAS.
 *
 * A homologação encontrou 1 SiloPage + 5 ArticleDNA aprovados produzindo zero
 * relações, com a mensagem "o Silo não tem duas páginas linkáveis" — falsa em
 * dois níveis: havia seis páginas linkáveis e a portaria estrutural tinha
 * passado. As catorze conexões eram derivadas e descartadas em silêncio.
 *
 * A causa não estava no motor de arquitetura: estava na busca do nó de destino,
 * feita num `useMemo` calculado antes de a working copy existir.
 */

const SILO_PAGE: StructuralLinkUnit = {
  nodeId: "silo-page:silo-1",
  nodeType: "SILO_PAGE",
  architecturalRole: null,
  label: "Skincare",
};
const PILAR: StructuralLinkUnit = {
  nodeId: "article:a",
  nodeType: "ARTICLE_DNA",
  architecturalRole: "PILAR",
  label: "skin care noturno",
};
const SUPORTES: StructuralLinkUnit[] = ["b", "c", "d", "e"].map((letra, indice) => ({
  nodeId: `article:${letra}`,
  nodeType: "ARTICLE_DNA" as const,
  architecturalRole: "SUPORTE" as const,
  label: `suporte ${indice + 1}`,
}));
const SEIS = [SILO_PAGE, PILAR, ...SUPORTES];

/* ============ A · 1 SiloPage + 5 ArticleDNA aprovados =================== */

test("A — 6 unidades passam pela portaria e derivam relações", () => {
  assert.deepEqual(structuralLinkBlockers(SEIS), [], "nada impede o esqueleto deste Silo");
  const conexoes = buildStructuralLinkConnections(SEIS);
  assert.ok(conexoes.length > 0, "o motor de arquitetura sempre derivou; o problema era adiante");
  // raiz→Pilar, raiz→4 suportes, Pilar→raiz, Pilar→4 suportes, 4 suportes→Pilar.
  assert.equal(conexoes.length, 14);

  const leitura = describeStructuralLinkDerivation({
    units: SEIS, connections: conexoes, edges: conexoes, blockers: [],
  });
  assert.equal(leitura.linkNodes, 6);
  assert.equal(leitura.linkablePages, 6);
  assert.notEqual(leitura.linkablePages, 0);
  assert.doesNotMatch(leitura.summary, /não tem duas páginas linkáveis/);
});

test("A — a portaria nunca acusa 'uma única página' com seis unidades", () => {
  const impedimentos = structuralLinkBlockers(SEIS).join(" ");
  assert.doesNotMatch(impedimentos, /única página/);
  // E com uma página só ela acusa — o texto existe para o caso certo.
  assert.match(structuralLinkBlockers([SILO_PAGE]).join(" "), /única página|não tem Pilar/);
});

/* ============ B/C · planejado, não publicado, continua linkável ========== */

const artigo = (overrides: Partial<ArticleDNA> = {}) => ({
  articleId: "a",
  principalKeywordId: "k1",
  secondaryKeywordIds: ["k2"],
  narrativeReinforcementIds: [],
  keywordReferences: [
    { keywordId: "k1", keywordDnaSnapshot: { sourceKeywordSnapshot: { keyword: "skincare para pele oleosa" } } },
    { keywordId: "k2", keywordDnaSnapshot: { sourceKeywordSnapshot: { keyword: "rotina para pele oleosa" } } },
  ],
  suggestedSlug: "para-pele-oleosa",
  // Nem publicado, nem canonical, nem siloId: o cenário da primeira passada.
  siloId: null,
  canonical: null,
  publishedIdentityRef: null,
  ...overrides,
} as unknown as ArticleDNA);

test("B — ArticleDNA planejado e não publicado continua linkável", () => {
  const conceitos = suggestInternalLinkAnchorConcepts({ article: artigo(), fallbackLabel: "para pele oleosa" });
  assert.ok(conceitos.length > 0, "sem conceito o destino é descartado — e ele não pode ser");
  assert.equal(conceitos[0], "skincare para pele oleosa", "o conceito vem da Principal do destino");
  // Nada aqui olhou para publicação.
  const estrutura = readFileSync("lib/arquiteto/internal-link-structure.ts", "utf8");
  for (const exigencia of ["publishedUrl", "publicationStatus", "publishedIdentityRef", "canonical", "siloId"]) {
    assert.equal(estrutura.includes(exigencia), false, `a portaria estrutural não pode exigir ${exigencia}`);
  }
});

test("C — SiloPage planejada e não publicada participa do grafo", () => {
  const conceitos = suggestInternalLinkAnchorConcepts({
    siloPage: { h1: "Skincare", slug: "skincare", publicationStatus: "planned", publishedUrl: null } as unknown as SiloPage,
    fallbackLabel: "Skincare",
  });
  assert.ok(conceitos.length > 0);
  // `compact` normaliza para minúsculas: conceito é universo semântico, não copy.
  assert.equal(conceitos[0], "skincare");
});

test("B/C — sem artefato o rótulo ainda sustenta o conceito", () => {
  assert.deepEqual(suggestInternalLinkAnchorConcepts({ fallbackLabel: "Skincare" }), ["skincare"]);
  // E só com rótulo vazio o destino é legitimamente bloqueado.
  assert.deepEqual(suggestInternalLinkAnchorConcepts({ fallbackLabel: "" }), []);
});

/* ============ D/E · Pilar e suportes, sem all-to-all ==================== */

test("D — Pilar e suportes derivam relações estruturais nos dois sentidos", () => {
  const conexoes = buildStructuralLinkConnections(SEIS);
  const tipos = new Set(conexoes.map(item => item.relationType));
  assert.equal(tipos.has("SILO_PAGE_TO_ARTICLE"), true);
  assert.equal(tipos.has("ARTICLE_TO_SILO_PAGE"), true);
  assert.equal(tipos.has("PILLAR_TO_SUPPORT"), true);
  assert.equal(tipos.has("SUPPORT_TO_PILLAR"), true);
  for (const conexao of conexoes) {
    assert.ok(conexao.reason.trim().length > 0, "cada aresta carrega justificativa estrutural");
  }
});

test("E — não cria all-to-all: suporte↔suporte não é consequência do organograma", () => {
  const conexoes = buildStructuralLinkConnections(SEIS);
  const idsSuporte = new Set(SUPORTES.map(item => item.nodeId));
  const entreSuportes = conexoes.filter(item => idsSuporte.has(item.sourceNodeId) && idsSuporte.has(item.targetNodeId));
  assert.deepEqual(entreSuportes, [], "estar no mesmo Silo não é evidência de relação");
  // O cartesiano de 6 nós seria 30; o esqueleto é bem menor e declarado.
  assert.ok(conexoes.length < 6 * 5, `esperava menos que o cartesiano, achei ${conexoes.length}`);
});

/* ============ F · toda aresta carrega conceito de âncora ================ */

test("F — a derivação descarta quem não tem conceito, e o diz com nome", () => {
  const semConceito = { ...SUPORTES[0], label: "" };
  const unidades = [SILO_PAGE, PILAR, semConceito];
  const conexoes = buildStructuralLinkConnections(unidades);
  const bloqueadas = [{ nodeId: semConceito.nodeId, label: semConceito.nodeId, reason: "nenhum conceito de âncora pôde ser derivado do artefato canônico." }];
  const sobreviventes = conexoes.filter(item =>
    item.sourceNodeId !== semConceito.nodeId && item.targetNodeId !== semConceito.nodeId);

  const leitura = describeStructuralLinkDerivation({
    units: unidades, blockedPages: bloqueadas, connections: conexoes, edges: sobreviventes, blockers: [],
  });
  assert.equal(leitura.blockedPages.length, 1);
  assert.equal(leitura.linkablePages, 2);
  assert.equal(leitura.readyToConfirm, false, "página bloqueada impede a confirmação");
  assert.match(leitura.readout, /BLOCKED_PAGES = 1/);
  assert.ok(leitura.refusedPairs.length > 0);
  for (const par of leitura.refusedPairs) {
    assert.ok(par.reason.trim().length > 0, "cada par recusado precisa dizer por quê");
  }
});

/* ============ §7/§8 · zero arestas precisa de prova ===================== */

test("§7 — zero arestas nomeia as páginas descartadas, nunca 'não tem duas linkáveis'", () => {
  const bloqueadas = SEIS.map(unit => ({ nodeId: unit.nodeId, label: unit.label, reason: "nenhum conceito de âncora pôde ser derivado do artefato canônico." }));
  const leitura = describeStructuralLinkDerivation({
    units: SEIS, blockedPages: bloqueadas, connections: buildStructuralLinkConnections(SEIS), edges: [], blockers: [],
  });
  assert.equal(leitura.edgesProposed, 0);
  assert.equal(leitura.linkNodes, 6);
  assert.match(leitura.readout, /LINK_NODES = 6/);
  assert.match(leitura.readout, /EDGES_PROPOSED = 0/);
  assert.match(leitura.readout, /BLOCKED_PAGES = 6/);
  assert.match(leitura.readout, /GRAPH_READY_TO_CONFIRM = NO/);
  assert.doesNotMatch(leitura.summary, /não tem duas páginas linkáveis/);
  for (const unidade of SEIS) assert.match(leitura.summary, new RegExp(unidade.label));
});

test("§8 — o readout não omite zero e diz a frase humana", () => {
  const conexoes = buildStructuralLinkConnections(SEIS);
  const leitura = describeStructuralLinkDerivation({ units: SEIS, connections: conexoes, edges: conexoes, blockers: [] });
  assert.equal(
    leitura.readout,
    "LINK_NODES = 6 · LINKABLE_PAGES = 6 · EDGES_PROPOSED = 14 · ORPHANS = 0 · BLOCKED_PAGES = 0 · GRAPH_READY_TO_CONFIRM = YES",
  );
  assert.equal(leitura.summary, "14 relação(ões) estrutural(is) proposta(s) entre 6 páginas.");
});

test("§8 — órfã é contada, não escondida", () => {
  const solta: StructuralLinkUnit = { nodeId: "article:z", nodeType: "ARTICLE_DNA", architecturalRole: "OUTRO", label: "solta" };
  const unidades = [SILO_PAGE, PILAR, solta];
  const conexoes = buildStructuralLinkConnections(unidades);
  const semSolta = conexoes.filter(item => item.sourceNodeId !== solta.nodeId && item.targetNodeId !== solta.nodeId);
  const leitura = describeStructuralLinkDerivation({ units: unidades, connections: conexoes, edges: semSolta, blockers: [] });
  assert.equal(leitura.orphans.length, 1);
  assert.equal(leitura.orphans[0].nodeId, "article:z");
  assert.match(leitura.readout, /ORPHANS = 1/);
});

/* ============ §5 · SiloPage != Pilar =================================== */

test("§5 — a SiloPage não vira Article para conseguir criar links", () => {
  const conexoes = buildStructuralLinkConnections(SEIS);
  for (const conexao of conexoes) {
    const envolveRaiz = conexao.sourceNodeId === SILO_PAGE.nodeId || conexao.targetNodeId === SILO_PAGE.nodeId;
    if (!envolveRaiz) continue;
    assert.ok(
      ["SILO_PAGE_TO_ARTICLE", "ARTICLE_TO_SILO_PAGE"].includes(conexao.relationType),
      `a raiz só participa como SiloPage, e veio ${conexao.relationType}`,
    );
  }
  // E o Pilar continua sendo um ArticleDNA, com seu próprio par de relações.
  const doPilar = conexoes.filter(item => item.sourceNodeId === PILAR.nodeId);
  assert.ok(doPilar.some(item => item.relationType === "ARTICLE_TO_SILO_PAGE"));
  assert.ok(doPilar.some(item => item.relationType === "PILLAR_TO_SUPPORT"));
});

/* ============ contrato de tela · a causa raiz não pode voltar =========== */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const codigo = workspace
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");

test("ROOT CAUSE — o destino sai da cópia recebida, não do memo do render", () => {
  const derivacao = codigo.slice(
    codigo.indexOf("const generateStructuralLinks = async"),
    codigo.indexOf("const generateLinkAnchors"),
  );
  assert.ok(derivacao.length > 0, "a derivação existe e é delimitável");
  assert.equal(derivacao.includes("const nosDaCopia = new Map(copia.nodes.map("), true);
  assert.equal(derivacao.includes("nosDaCopia.get(conexao.targetNodeId)"), true);
  assert.equal(
    derivacao.includes("linkNodeById.get(conexao.targetNodeId)"),
    false,
    "o memo é do render anterior: no primeiro Processar links ele é um Map vazio",
  );
});

test("§7 — a mensagem que mentia sobre a causa saiu do código", () => {
  assert.equal(
    codigo.includes("o Silo não tem duas páginas linkáveis"),
    false,
    "zero arestas passa a ser explicado pelo readout, não por um palpite",
  );
  assert.equal(codigo.includes("describeStructuralLinkDerivation({"), true);
  assert.equal(codigo.includes("setLinksDerivationReadout("), true);
});

test("§8/§9 — a mesa mostra contadores e a lista auditável de relações", () => {
  assert.equal(codigo.includes('data-testid="architect-link-derivation-readout"'), true);
  assert.equal(codigo.includes('data-testid="architect-link-blocked-pages"'), true);
  assert.equal(codigo.includes('data-testid="architect-link-refused-pairs"'), true);
  assert.equal(codigo.includes('data-testid="architect-link-edge-list"'), true);
  /*
   * A lista é projeção da working copy — a mesma autoridade do mapa. Ela
   * deixou de ser um `map` cru sobre `edges` e passa por `buildLinkRelationRows`,
   * que acrescenta papel, endereço e razão sem mudar a fonte.
   */
  assert.equal(codigo.includes("{linkRelationRows.map(row =>"), true);
  assert.equal(codigo.includes("const linkRelationRows = useMemo(() => buildLinkRelationRows({"), true);
});

test("H/I — Processar não aprova; Confirmar aprova", () => {
  // O ato de confirmar chama-se `handleApproveLinks` e nasce logo depois.
  const processar = codigo.slice(codigo.indexOf("const processarLinks = async"), codigo.indexOf("const handleApproveLinks = async"));
  assert.ok(processar.length > 0);
  for (const proibido of ["handleApproveLinks(", "approveInternalLinkGraph(", "status: \"approved\""]) {
    assert.equal(processar.includes(proibido), false, `Processar links não pode chamar ${proibido}`);
  }
  assert.equal(processar.includes("generateStructuralLinks("), true);
});

test("§0 — nada de provider nem de reconstrução editorial na derivação", () => {
  const derivacao = codigo.slice(
    codigo.indexOf("const generateStructuralLinks = async"),
    codigo.indexOf("const generateLinkAnchors"),
  );
  for (const proibido of ["dataforseo", "/api/arquiteto/serp", "buildArticleFormationUniverses", "suggestPrincipal", "deriveSemanticNuclei"]) {
    assert.equal(derivacao.includes(proibido), false, `a derivação estrutural não pode conter ${proibido}`);
  }
  // Ela consome o que já foi aprovado: os nós da working copy.
  assert.equal(derivacao.includes("copia.nodes"), true);
});
