import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LINK_RELATION_LABELS,
  buildLinkRelationRows,
  linkProjectionsAgree,
  resolveArticleLinkProjection,
  resolveSiloHierarchyView,
  tallyLinkRelations,
} from "../lib/arquiteto/internal-link-projection.ts";
import type { InternalLinkGraphEdge, InternalLinkGraphNode } from "../lib/arquiteto/contracts.ts";

/**
 * A SUPERFÍCIE QUE FALTAVA.
 *
 * O grafo passou a persistir 14 relações e ninguém conseguia responder, sem
 * ler código: qual é o Pilar, quais são os suportes, para onde cada artigo
 * aponta, de onde recebe, com que conceito e por quê.
 *
 * Tudo isso já estava gravado. O que faltava era projeção — e projeção não
 * pode virar uma segunda autoridade:
 *
 *   LINK_HIERARCHY_AUTHORITY = SILODNA
 *   LINK_TOPOLOGY_AUTHORITY  = INTERNAL_LINK_GRAPH
 */

const SILO_ID = "silo-1";
const PILAR = "art-pilar";
const SUPORTES = ["art-s1", "art-s2", "art-s3", "art-s4"];

const siloDna = {
  siloId: SILO_ID,
  name: "Skincare",
  centralEntity: "skincare",
  pillarArticleId: PILAR,
  supportArticleIds: SUPORTES,
  articleReferences: [PILAR, ...SUPORTES].map(articleId => ({ articleId })),
  narrativeOrder: [PILAR, ...SUPORTES],
};

const identidade = new Map([
  [PILAR, { label: "skincare para pele oleosa", slug: "para-pele-oleosa" }],
  ["art-s1", { label: "skin care noturno", slug: "skin-care-noturno" }],
  ["art-s2", { label: "skin care nivea", slug: "skin-care-nivea" }],
  ["art-s3", { label: "mascara facial skin care", slug: "mascara-facial-skin-care" }],
  ["art-s4", { label: "skincare vitamina c", slug: "vitamina-c" }],
]);

/* ============ A/B/C · a hierarquia vem do SiloDNA ======================= */

test("A/B — Pilar e suportes exibidos vêm do SiloDNA", () => {
  const view = resolveSiloHierarchyView({
    siloDna,
    siloPage: { siloPageId: "page-1", h1: "Skincare", slug: "skincare" },
    articleIdentity: identidade,
  });
  assert.equal(view.pillar?.id, PILAR);
  assert.equal(view.pillar?.label, "skincare para pele oleosa");
  assert.equal(view.pillar?.slug, "para-pele-oleosa");
  assert.deepEqual(view.supports.map(item => item.id), SUPORTES);
  assert.equal(view.siloPage?.label, "Skincare");
  assert.deepEqual(view.issues, []);
  assert.deepEqual(view.narrativeOrder, [PILAR, ...SUPORTES]);
});

test("C — a aba Links não reescolhe Pilar: sem Pilar no SiloDNA, ela diz que falta", () => {
  const view = resolveSiloHierarchyView({
    siloDna: { ...siloDna, pillarArticleId: null },
    siloPage: { siloPageId: "page-1", h1: "Skincare", slug: "skincare" },
    articleIdentity: identidade,
  });
  assert.equal(view.pillar, null, "nenhum suporte é promovido para preencher a lacuna");
  assert.match(view.issues.join(" "), /não declara Pilar/);
  // E nenhum artigo recebe papel PILAR por conta própria.
  assert.equal([...view.roleByArticleId.values()].includes("PILAR"), false);
});

test("artigo da composição sem papel declarado aparece como OUTRO, não some", () => {
  const view = resolveSiloHierarchyView({
    siloDna: { ...siloDna, supportArticleIds: ["art-s1"] },
    siloPage: { siloPageId: "page-1", h1: "Skincare", slug: "skincare" },
    articleIdentity: identidade,
  });
  assert.equal(view.supports.length, 4, "os três sem papel continuam visíveis");
  assert.equal(view.supports.filter(item => item.role === "OUTRO").length, 3);
  assert.match(view.issues.join(" "), /sem papel declarado/);
});

/* ============ o grafo do cenário real: 6 nós, 14 arestas =============== */

const node = (nodeId: string, nodeType: "SILO_PAGE" | "ARTICLE_DNA", role: string | null, label: string): InternalLinkGraphNode => ({
  nodeId, brandId: "b1", nodeType,
  articleDnaVersionRef: nodeType === "ARTICLE_DNA" ? { entityId: nodeId, versionId: `${nodeId}:v1`, contentHash: "h" } : null,
  siloPageVersionRef: nodeType === "SILO_PAGE" ? { entityId: "page-1", versionId: "page:v1", contentHash: "h" } : null,
  architecturalRole: role,
  snapshot: { label, siloId: SILO_ID },
} as unknown as InternalLinkGraphNode);

const NODES: InternalLinkGraphNode[] = [
  node(`silo-page:${SILO_ID}`, "SILO_PAGE", null, "Skincare"),
  node(`article:${PILAR}`, "ARTICLE_DNA", "PILAR", "skincare para pele oleosa"),
  ...SUPORTES.map(id => node(`article:${id}`, "ARTICLE_DNA", "SUPORTE", identidade.get(id)!.label)),
];

const edge = (source: string, target: string, relationType: string, conceito: string): InternalLinkGraphEdge => ({
  edgeId: `edge:${source}->${target}`,
  sourceNodeId: source, targetNodeId: target,
  relationType, reason: `motivo estrutural de ${source} para ${target}`, priority: "HIGH",
  anchorConcepts: [conceito], origin: "system", createdBy: "sys", createdAt: "2026-09-08T00:00:00.000Z",
  provenance: { source: "structural-derivation", references: ["g1"] },
} as unknown as InternalLinkGraphEdge);

const RAIZ = `silo-page:${SILO_ID}`;
const NO_PILAR = `article:${PILAR}`;
const EDGES: InternalLinkGraphEdge[] = [
  edge(RAIZ, NO_PILAR, "SILO_PAGE_TO_ARTICLE", "skincare para pele oleosa"),
  ...SUPORTES.map(id => edge(RAIZ, `article:${id}`, "SILO_PAGE_TO_ARTICLE", identidade.get(id)!.label)),
  edge(NO_PILAR, RAIZ, "ARTICLE_TO_SILO_PAGE", "skincare"),
  ...SUPORTES.map(id => edge(NO_PILAR, `article:${id}`, "PILLAR_TO_SUPPORT", identidade.get(id)!.label)),
  ...SUPORTES.map(id => edge(`article:${id}`, NO_PILAR, "SUPPORT_TO_PILLAR", "skincare para pele oleosa")),
];

const slugs = new Map<string, string | null>([
  [RAIZ, "skincare"],
  [NO_PILAR, "para-pele-oleosa"],
  ...SUPORTES.map(id => [`article:${id}`, identidade.get(id)!.slug] as [string, string | null]),
]);

test("o cenário real tem 6 nós e 14 arestas", () => {
  assert.equal(NODES.length, 6);
  assert.equal(EDGES.length, 14);
});

/* ============ D/E/F · lista, mapa e painel leem o mesmo grafo =========== */

test("D — a lista de relações usa o InternalLinkGraph, com papel, slug e razão", () => {
  const linhas = buildLinkRelationRows({ nodes: NODES, edges: EDGES, slugByNodeId: slugs });
  assert.equal(linhas.length, 14);
  const raizParaPilar = linhas.find(row => row.source.nodeId === RAIZ && row.target.nodeId === NO_PILAR)!;
  assert.equal(raizParaPilar.source.role, "SILOPAGE");
  assert.equal(raizParaPilar.target.role, "PILAR");
  assert.equal(raizParaPilar.source.slug, "skincare");
  assert.equal(raizParaPilar.target.slug, "para-pele-oleosa");
  assert.equal(raizParaPilar.anchorConcept, "skincare para pele oleosa");
  assert.ok(raizParaPilar.reason.length > 0, "cada relação diz por que existe");
  for (const linha of linhas) {
    assert.ok(linha.anchorConcept, "toda relação carrega conceito de âncora");
    assert.ok(linha.relationLabel.length > 0);
  }
});

test("E — mapa e lista têm exatamente o mesmo edge count", () => {
  const linhas = buildLinkRelationRows({ nodes: NODES, edges: EDGES, slugByNodeId: slugs });
  const acordo = linkProjectionsAgree({
    authorityEdgeCount: EDGES.length,
    mapEdgeCount: EDGES.length,
    listEdgeCount: linhas.length,
  });
  assert.equal(acordo.agree, true, acordo.detail);
  // E a divergência é DITA, não escondida.
  const divergente = linkProjectionsAgree({ authorityEdgeCount: 14, mapEdgeCount: 14, listEdgeCount: 12 });
  assert.equal(divergente.agree, false);
  assert.match(divergente.detail, /Divergência de projeção/);
});

test("F — o painel do Article deriva entradas e saídas do mesmo grafo", () => {
  const pilar = resolveArticleLinkProjection({ articleId: PILAR, nodes: NODES, edges: EDGES, slugByNodeId: slugs });
  assert.equal(pilar.role, "PILAR");
  // Recebe da raiz e dos 4 suportes; aponta para a raiz e para os 4 suportes.
  assert.equal(pilar.inboundCount, 5);
  assert.equal(pilar.outboundCount, 5);

  const suporte = resolveArticleLinkProjection({ articleId: "art-s1", nodes: NODES, edges: EDGES, slugByNodeId: slugs });
  assert.equal(suporte.role, "SUPORTE");
  assert.equal(suporte.inboundCount, 2, "recebe da raiz e do Pilar");
  assert.equal(suporte.outboundCount, 1, "devolve ao Pilar");
  assert.equal(suporte.outbound[0].target.label, "skincare para pele oleosa");
  assert.ok(suporte.outbound[0].anchorConcept);

  // A soma das saídas de todos os nós é o total de arestas: nada se perde.
  const somaSaidas = [PILAR, ...SUPORTES]
    .map(id => resolveArticleLinkProjection({ articleId: id, nodes: NODES, edges: EDGES }).outboundCount)
    .reduce((total, item) => total + item, 0);
  const daRaiz = EDGES.filter(item => item.sourceNodeId === RAIZ).length;
  assert.equal(somaSaidas + daRaiz, 14, "ARTICLE_EDGE_SUM coerente com as 14 relações");
});

/* ============ G/H/I · a classificação distingue os tipos =============== */

test("G/H/I — Pilar→Suporte, Suporte→Pilar e Suporte→Suporte são distinguíveis", () => {
  const contagem = tallyLinkRelations(EDGES);
  assert.equal(contagem.total, 14);
  const de = (tipo: string) => contagem.byType.find(item => item.relationType === tipo)!.count;
  assert.equal(de("SILO_PAGE_TO_ARTICLE"), 5);
  assert.equal(de("ARTICLE_TO_SILO_PAGE"), 1);
  assert.equal(de("PILLAR_TO_SUPPORT"), 4);
  assert.equal(de("SUPPORT_TO_PILLAR"), 4);
  assert.equal(de("SUPPORT_TO_SUPPORT"), 0);
  assert.equal(contagem.supportToSupport, 0, "hoje não há malha entre suportes — e isso é dito, não omitido");
  // Zero aparece: a ausência de malha é informação.
  assert.equal(contagem.byType.length, 5);
});

test("a malha entre suportes é contada à parte quando existir", () => {
  const comMalha = [...EDGES, edge("article:art-s1", "article:art-s2", "SUPPORT_TO_SUPPORT", "rotina noturna")];
  const contagem = tallyLinkRelations(comMalha);
  assert.equal(contagem.supportToSupport, 1);
  assert.equal(contagem.total, 15);
});

test("todo tipo do contrato tem rótulo legível", () => {
  for (const tipo of ["SILO_PAGE_TO_ARTICLE", "ARTICLE_TO_SILO_PAGE", "PILLAR_TO_SUPPORT", "SUPPORT_TO_PILLAR", "SUPPORT_TO_SUPPORT"] as const) {
    assert.ok(LINK_RELATION_LABELS[tipo], `${tipo} sem rótulo`);
  }
});

/* ============ K/L · nada nasce no ArticleDNA, nada chama provider ======= */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const codigo = workspace
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");
const projecao = readFileSync("lib/arquiteto/internal-link-projection.ts", "utf8");

test("K — nenhum dado de links é gravado dentro do ArticleDNA", () => {
  // O módulo de projeção só LÊ. Nenhum writer, nenhum campo novo no artigo.
  for (const proibido of ["persistArquitetoArtifact", "createVersionEnvelope", "ArticleDNASchema.parse", "internalLinks:"]) {
    assert.equal(projecao.includes(proibido), false, `a projeção não pode conter ${proibido}`);
  }
  // E o painel do Article lê do grafo, não de um campo do DNA.
  assert.equal(codigo.includes("resolveArticleLinkProjection({"), true);
  assert.equal(codigo.includes('data-testid="architect-article-link-projection"'), true);
});

test("L — nenhuma chamada a SERP ou provider na projeção", () => {
  for (const proibido of ["dataforseo", "fetch(", "/api/", "callAi", "serp"]) {
    assert.equal(projecao.toLowerCase().includes(proibido.toLowerCase()), false, `a projeção não pode conter ${proibido}`);
  }
});

/* ============ a mesa mostra tudo isso ================================== */

test("§2/§3 — hierarquia no painel e papel na tabela", () => {
  assert.equal(codigo.includes('data-testid="architect-link-hierarchy"'), true);
  assert.equal(codigo.includes("resolveSiloHierarchyView({"), true);
  // O papel ganhou COLUNA própria neste corte; o badge solto saiu para o fato
  // não aparecer em dois lugares.
  assert.equal(codigo.includes('data-testid="architect-silo-role-cell"'), true);
  assert.equal(codigo.includes("linksHierarchy?.roleByArticleId.get("), true);
});

test("§4/§5 — lista auditável e contadores por tipo", () => {
  assert.equal(codigo.includes('data-testid="architect-link-edge-list"'), true);
  assert.equal(codigo.includes('data-testid="architect-link-relation-tally"'), true);
  assert.equal(codigo.includes("Conceito de âncora:"), true);
  assert.equal(codigo.includes("Razão: {row.reason}"), true);
});

test("§7 — lista, contadores e painel leem a MESMA autoridade", () => {
  assert.equal(codigo.includes("const linksTopologyAuthority = linksWorkingCopy || linksApprovedGraph || null;"), true);
  for (const consumidor of ["linkRelationRows", "linkRelationTally"]) {
    const trecho = codigo.slice(codigo.indexOf(`const ${consumidor} = useMemo`), codigo.indexOf(`const ${consumidor} = useMemo`) + 400);
    assert.equal(trecho.includes("linksTopologyAuthority"), true, `${consumidor} precisa ler a autoridade única`);
  }
  // O painel do Article também.
  assert.equal(codigo.includes("const graph = linksTopologyAuthority;"), true);
});

/* ========== corte da projeção visual: coluna, painel e layout ========== */

const workbench = readFileSync("modules/arquiteto/arquiteto-workbench.tsx", "utf8");
/* Comentário é prosa: "nenhuma posição é persistida" contém "persist". */
const workbenchCodigo = workbench
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");

test("§2 — Papel no Silo tem coluna própria, derivada do SiloDNA", () => {
  assert.equal(codigo.includes(">Papel no Silo</th>"), true);
  assert.equal(codigo.includes('data-testid="architect-silo-role-cell"'), true);
  // A célula lê a projeção do SiloDNA — nunca volume, posição ou nº de links.
  assert.equal(codigo.includes("linksHierarchy?.roleByArticleId.get("), true);
  // E o fato aparece UMA vez: o badge solto na coluna Artigo saiu.
  assert.equal(codigo.includes('data-testid="architect-article-silo-role"'), false);
});

test("§3 — o painel do Article projeta a hierarquia, com a versão do SiloDNA", () => {
  assert.equal(codigo.includes('data-testid="architect-article-silo-hierarchy"'), true);
  for (const campo of ["Papel editorial:", "Pilar do Silo:", "SiloPage:", "Suportes vinculados:", "Pilar relacionado:", "SiloDNA v"]) {
    assert.equal(codigo.includes(campo), true, `falta "${campo}" no painel`);
  }
});

test("§4 — o mapa é hierárquico: raiz acima, Pilar no centro, suportes embaixo", () => {
  const projecaoMapa = workbenchCodigo.slice(
    workbenchCodigo.indexOf("export function buildInternalLinkGraphProjection"),
    workbenchCodigo.indexOf("function buildArchitectureClusterFlow"),
  );
  assert.ok(projecaoMapa.length > 0);
  assert.equal(projecaoMapa.includes("const rowY = { silo: 0, pillar: 176, support: 352 }"), true);
  // Fluxo de cima para baixo, com handles de entrada e saída distintos.
  assert.equal(projecaoMapa.includes("sourcePosition: Position.Bottom, targetPosition: Position.Top"), true);
  assert.equal(projecaoMapa.includes("sourcePosition: Position.Right, targetPosition: Position.Left"), false);
  // Cards permanentes: papel, slug e In/Out em campos próprios do card.
  assert.equal(projecaoMapa.includes("linkCounts: { in: entradas.get(node.nodeId) || 0, out: saidas.get(node.nodeId) || 0 }"), true);
  assert.equal(projecaoMapa.includes("slug: display?.slug ?? null,"), true);
  assert.equal(projecaoMapa.includes("verticalHandles: true,"), true);
  assert.equal(projecaoMapa.includes("roleLabel,"), true);
});

test("§4 — os suportes são numerados pela ordem da fileira", () => {
  const projecaoMapa = workbenchCodigo.slice(
    workbenchCodigo.indexOf("export function buildInternalLinkGraphProjection"),
    workbenchCodigo.indexOf("function buildArchitectureClusterFlow"),
  );
  assert.equal(projecaoMapa.includes("const ordemDoSuporte = new Map(articleNodes.map((node, index) => [node.nodeId, index + 1]))"), true);
  assert.equal(projecaoMapa.includes("`Suporte ${ordemDoSuporte.get(node.nodeId) ?? \"\"}`.trim()"), true);
  // A numeração é posição no desenho: o PAPEL continua vindo do SiloDNA.
  assert.equal(projecaoMapa.includes('node.architecturalRole === "PILAR" ? "Pilar"'), true);
});

test("§4 — quatro handles nomeados: entrada e saída não dividem o mesmo ponto", () => {
  for (const handle of ['id="in-top"', 'id="out-top"', 'id="out-bottom"', 'id="in-bottom"']) {
    assert.equal(workbenchCodigo.includes(handle), true, `falta o handle ${handle}`);
  }
  // Descer usa a pista de baixo; subir usa a de cima. Sem isso a volta do
  // suporte para o Pilar contornava o card inteiro.
  assert.equal(workbenchCodigo.includes('sourceHandle: descendo ? "out-bottom" : "out-top"'), true);
  assert.equal(workbenchCodigo.includes('targetHandle: descendo ? "in-top" : "in-bottom"'), true);
  assert.equal(workbenchCodigo.includes("const descendo = rowOf ? rowOf(edge.sourceNodeId) <= rowOf(edge.targetNodeId) : true;"), true);
});

test("§4 — o card do Silo mostra papel, endereço e In/Out; os outros mapas não mudam", () => {
  // O card novo só existe quando a projeção pede: Silos e Artigos seguem iguais.
  assert.equal(workbenchCodigo.includes("if (data.verticalHandles) {"), true);
  assert.equal(workbenchCodigo.includes("<span>In: {data.linkCounts.in}</span><span>Out: {data.linkCounts.out}</span>"), true);
  assert.equal(workbenchCodigo.includes("{data.slug && <p"), true);
  // O caminho antigo continua lá, intacto, para os outros dois mapas.
  assert.equal(workbenchCodigo.includes('<Handle type="target" position={targetPosition || Position.Left}'), true);
});

test("§4/§6 — o mapa NÃO muta o grafo: só lê e posiciona", () => {
  const projecaoMapa = workbenchCodigo.slice(
    workbenchCodigo.indexOf("export function buildInternalLinkGraphProjection"),
    workbenchCodigo.indexOf("function buildArchitectureClusterFlow"),
  );
  for (const proibido of ["persist", "fetch(", "graph.edges.push", "graph.nodes.push", "setLinks", "updateLinksWorkingCopy"]) {
    assert.equal(projecaoMapa.includes(proibido), false, `a projeção do mapa não pode conter ${proibido}`);
  }
  // Roteamento ortogonal e seta fechada continuam sendo do edge builder.
  assert.match(workbench, /type: "smoothstep"/);
  assert.match(workbench, /markerEnd: \{ type: MarkerType\.ArrowClosed/);
});

test("§4 — o mapa desenha exatamente as arestas do grafo, sem filtrar nem inventar", () => {
  const projecaoMapa = workbenchCodigo.slice(
    workbenchCodigo.indexOf("export function buildInternalLinkGraphProjection"),
    workbenchCodigo.indexOf("function buildArchitectureClusterFlow"),
  );
  // SUPPORT_TO_SUPPORT só aparece se existir: não há filtro por tipo aqui.
  assert.equal(projecaoMapa.includes("edges: graph.edges.map(edge => linkFlowEdge(edge"), true);
  assert.equal(projecaoMapa.includes("SUPPORT_TO_SUPPORT"), false, "o mapa não decide tipos: ele projeta os que existem");
});

test("§6 — o slug do mapa e o da lista saem da mesma fonte", () => {
  /*
   * A asserção é sobre o CÓDIGO, não sobre o fim de linha: um checkout do git
   * normaliza LF para CRLF e derrubava este teste sem nada ter mudado na
   * lógica. A comparação passa a ignorar a quebra.
   */
  const semQuebra = codigo.replace(/\r\n/g, "\n");
  assert.equal(semQuebra.includes("const linkSlugByNodeId = useMemo(\n    () => new Map(Object.entries(linkNodeDisplay)"), true);
});

/* ====== fechamento · as duas superfícies precisam CHEGAR à tela ======== */

test("a linha re-renderiza ao entrar em Links: a coluna tem célula", () => {
  /*
   * O cabeçalho não é memoizado e a linha é. Sem `workspaceMode` na revisão,
   * entrar em Links criava a coluna sem as células: tabela desalinhada e papel
   * invisível — exatamente o que a homologação encontrou.
   */
  assert.equal(codigo.includes("const articleRowRevision = useMemo("), true);
  assert.equal(codigo.includes("() => ({ base: articleTableRenderRevision, workspaceMode, linksHierarchy })"), true);
  assert.equal(codigo.includes("revision={articleRowRevision}"), true);
  assert.equal(codigo.includes("revision={articleTableRenderRevision}"), false, "as linhas não podem mais comparar a revisão antiga");
});

test("a coluna Papel no Silo fica entre Quantidade de keywords e Definição do artigo", () => {
  const cabecalhos = [...codigo.matchAll(/>(Quantidade de keywords|Papel no Silo|Definição do artigo)</g)].map(item => item[1]);
  assert.deepEqual(cabecalhos, ["Quantidade de keywords", "Papel no Silo", "Definição do artigo"]);
  // E a célula segue a mesma ordem: quantidade → papel → definição.
  const quantidade = codigo.indexOf("{art.supportKeywords.length + 1}");
  const papel = codigo.indexOf('data-testid="architect-silo-role-cell"');
  const definicao = codigo.indexOf('data-testid="architect-article-definition"');
  assert.ok(quantidade > 0 && papel > quantidade, "a célula do papel vem depois da quantidade");
  assert.ok(definicao > papel, "e antes da definição");
});

test("aprovar o grafo alimenta quem decide o Pronto para Radar", () => {
  /*
   * `approvedLinkGraphs` só recarregava por brand/reload. Aprovar não mexia em
   * nenhum dos dois, então `graphApproval` seguia BRUTO na mesma sessão e o
   * portão recusava um grafo que o servidor tinha confirmado no readback.
   */
  const aprovar = codigo.slice(codigo.indexOf("const handleApproveLinks = async"), codigo.indexOf("const linkNodeById"));
  assert.ok(aprovar.length > 0, "o ato de confirmar existe e é delimitável");
  assert.equal(aprovar.includes("setApprovedLinkGraphs(previous => ["), true);
  assert.equal(aprovar.includes("persisted.graph,"), true, "o que entra na lista é o readback, não o enviado");
  assert.equal(aprovar.includes("setCanonicalWorkspaceReload(current => current + 1);"), true);
});
