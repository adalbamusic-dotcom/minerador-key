import assert from "node:assert/strict";
import test from "node:test";
import {
  findApprovedGraphForSilo,
  radarLinkContextIsStale,
  relevantEdgesForArticle,
  resolveCanonicalSiloForArticle,
} from "../lib/arquiteto/radar-handoff-context.ts";

const artigo = (overrides: Record<string, unknown> = {}) => ({
  articleId: "article:pilar", brandId: "brand-1", territoryRef: "territory:retinol", siloId: null,
  promise: "retinol creamy antes e depois", ...overrides,
} as never);

const siloDna = (overrides: Record<string, unknown> = {}) => ({
  versionId: "silo-v1", contentHash: "sha256:silo", versionNumber: 1,
  payload: { siloId: "working-silo:3", name: "Anti-idade e Retinol", territoryRef: "territory:retinol", pillarArticleId: "article:pilar", ...overrides },
} as never);

const siloPage = () => ({
  versionId: "page-v1", contentHash: "sha256:page", versionNumber: 1,
  payload: { siloPageId: "silo-page:working-silo:3", siloId: "working-silo:3", slug: "/anti-idade-e-retinol", canonical: "https://careglow.com.br/anti-idade-e-retinol", publicationStatus: "published" },
} as never);

/* ---------------- §1 o Silo é resolvido, nunca exigido ------------------- */

test("o Silo canônico vem do território quando o ArticleDNA não declara siloId", () => {
  const resolucao = resolveCanonicalSiloForArticle({
    article: artigo(), siloVersions: [siloDna()], siloPageVersions: [siloPage()],
  });
  assert.equal(resolucao.ok, true);
  if (!resolucao.ok) return;
  assert.equal(resolucao.context.siloId, "working-silo:3");
  assert.equal(resolucao.context.siloPageVersionId, "page-v1");
  assert.equal(resolucao.context.siloPageCanonical, "https://careglow.com.br/anti-idade-e-retinol");
  // O papel vem do SiloDNA consolidado, não de heurística.
  assert.equal(resolucao.context.articleRole, "pillar");
});

test("nenhum Silo e mais de um Silo são recusa, não escolha", () => {
  const semSilo = resolveCanonicalSiloForArticle({ article: artigo(), siloVersions: [], siloPageVersions: [] });
  assert.equal(semSilo.ok, false);

  // Escolher "o mais parecido" faria o Radar investigar arquitetura que
  // ninguém montou: ambiguidade é bloqueio.
  const ambiguo = resolveCanonicalSiloForArticle({
    article: artigo(),
    siloVersions: [siloDna(), siloDna({ siloId: "working-silo:9", name: "Outro" })],
    siloPageVersions: [],
  });
  assert.equal(ambiguo.ok, false);
  if (ambiguo.ok) return;
  assert.match(ambiguo.reason, /1:1/);
});

test("artigo sem território e sem siloId não tem pai a resolver", () => {
  const orfao = resolveCanonicalSiloForArticle({
    article: artigo({ territoryRef: null }), siloVersions: [siloDna()], siloPageVersions: [],
  });
  assert.equal(orfao.ok, false);
});

/* ------------------- §4 só o grafo aprovado e da versão ------------------ */

const grafo = (overrides: Record<string, unknown> = {}) => ({
  graphId: "arquiteto:internal-links:working-silo:3", graphVersionId: "graph-v1", contentHash: "sha256:graph",
  siloId: "working-silo:3", workflowStatus: "approved",
  baseSiloDnaVersionRef: { versionId: "silo-v1" }, baseSiloPageVersionRef: { versionId: "page-v1" },
  nodes: [
    { nodeId: "silo-page:working-silo:3", nodeType: "SILO_PAGE", articleDnaVersionRef: null },
    { nodeId: "article:pilar", nodeType: "ARTICLE_DNA", articleDnaVersionRef: { versionId: "art-v1" } },
  ],
  edges: [
    { sourceNodeId: "silo-page:working-silo:3", targetNodeId: "article:pilar", relationType: "SILO_PAGE_TO_ARTICLE", anchorConcepts: ["retinol creamy antes e depois"], reason: "raiz abre pelo Pilar", priority: "HIGH" },
    { sourceNodeId: "article:pilar", targetNodeId: "silo-page:working-silo:3", relationType: "ARTICLE_TO_SILO_PAGE", anchorConcepts: ["guia de retinol"], reason: "Pilar devolve à raiz", priority: "MEDIUM" },
  ],
  ...overrides,
} as never);

const contexto = {
  siloId: "working-silo:3", siloName: "Anti-idade e Retinol", territoryRef: "territory:retinol",
  siloDnaVersionId: "silo-v1", siloDnaContentHash: "sha256:silo",
  siloPageId: "silo-page:working-silo:3", siloPageVersionId: "page-v1",
  siloPageSlug: "/anti-idade-e-retinol", siloPageCanonical: null, siloPagePublicationStatus: "published",
  articleRole: "pillar" as const,
};

test("grafo proposto, de outro Silo ou de outra versão não é aceito", () => {
  assert.equal(findApprovedGraphForSilo({ silo: contexto, graphs: [grafo()] })?.graphVersionId, "graph-v1");
  assert.equal(findApprovedGraphForSilo({ silo: contexto, graphs: [grafo({ workflowStatus: "proposed" })] }), null);
  assert.equal(findApprovedGraphForSilo({ silo: contexto, graphs: [grafo({ siloId: "working-silo:9" })] }), null);
  // Base de outra versão descreveria uma arquitetura que não é a entregue.
  assert.equal(findApprovedGraphForSilo({ silo: contexto, graphs: [grafo({ baseSiloDnaVersionRef: { versionId: "silo-v0" } })] }), null);
});

test("cada Article recebe só as relações que o envolvem, com direção e âncoras", () => {
  const links = relevantEdgesForArticle({ graph: grafo(), articleDnaVersionId: "art-v1" });
  assert.ok(links);
  assert.equal(links!.edges.length, 2);
  assert.deepEqual(links!.edges.map(edge => edge.direction).sort(), ["inbound", "outbound"]);
  assert.deepEqual(links!.edges.find(edge => edge.direction === "outbound")?.anchorConcepts, ["guia de retinol"]);
  // A referência do grafo viaja para rastreabilidade; o todo fica na fonte.
  assert.equal(links!.graphVersionId, "graph-v1");
});

test("Article que não está no grafo não recebe relação alheia", () => {
  assert.equal(relevantEdgesForArticle({ graph: grafo(), articleDnaVersionId: "art-outra" }), null);
  assert.equal(relevantEdgesForArticle({ graph: null, articleDnaVersionId: "art-v1" }), null);
});

/* ----------------------- §12 o contrato de stale ------------------------- */

test("sucessora do ArticleDNA ou nova versão do grafo tornam o contexto stale", () => {
  const atual = { articleDnaVersionId: "art-v1", articleDnaContentHash: "sha256:a", graphVersionId: "graph-v1" };
  assert.equal(radarLinkContextIsStale({ carried: atual, current: atual }), false);

  assert.equal(radarLinkContextIsStale({
    carried: atual, current: { ...atual, articleDnaVersionId: "art-v2" },
  }), true, "sucessora do ArticleDNA não herda a pesquisa da anterior");

  assert.equal(radarLinkContextIsStale({
    carried: atual, current: { ...atual, articleDnaContentHash: "sha256:b" },
  }), true, "mesma versão com outro conteúdo já não descreve o mesmo artigo");

  assert.equal(radarLinkContextIsStale({
    carried: atual, current: { ...atual, graphVersionId: "graph-v2" },
  }), true, "grafo sucedido: o contexto de links antigo não é o atual");
});

/* -------------- o builder único: elegível, bloqueado e por quê ------------ */

import { readFileSync } from "node:fs";
import { buildRadarHandoffContexts } from "../lib/arquiteto/radar-handoff-context.ts";
import { materializeArticleSiloId, readArticleSiloContract } from "../lib/arquiteto/article-silo-materialization.ts";

const artigoVersionado = (overrides: Record<string, unknown> = {}) => ({
  versionId: "art-v1", contentHash: "sha256:art", versionNumber: 1,
  payload: artigo(overrides),
} as never);

test("LEGADO: siloId null com território resolvido ainda é hidratável", () => {
  /*
   * ATENÇÃO AO QUE ESTE TESTE PROTEGE — e ao que ele NÃO protege.
   *
   * Ele protege a HIDRATAÇÃO de artefatos emitidos antes do contrato: um
   * ArticleDNA sem `siloId` que declara território continua legível, e volta
   * como elegível em vez de sumir da lista.
   *
   * Ele NÃO diz que emitir `siloId: null` é correto. A versão anterior deste
   * teste afirmava "o ArticleDNA não declara Silo por desenho", e essa frase
   * era a permissão que fazia cada fase seguinte terminar o serviço da
   * anterior. O contrato vigente exige as duas declarações e está coberto
   * abaixo, em `readArticleSiloContract`.
   */
  const plano = buildRadarHandoffContexts({
    articles: [artigoVersionado()],
    siloVersions: [siloDna()],
    siloPageVersions: [siloPage()],
    graphs: [grafo()],
  });
  assert.equal(plano.blocked.length, 0);
  assert.equal(plano.eligible.length, 1);
  assert.equal(plano.eligible[0].silo.siloId, "working-silo:3");
  assert.equal(plano.eligible[0].internalLinks?.edges.length, 2);
});

test("CORRENTE: ArticleDNA sem siloId não é conforme, mesmo hidratável", () => {
  const legado = readArticleSiloContract(artigo() as never);
  assert.equal(legado.state, "LEGACY_HYDRATABLE");
  assert.equal(legado.compliant, false, "hidratável não é conforme");
  assert.equal(legado.siloId, null);

  const corrente = readArticleSiloContract(artigo({ siloId: "working-silo:3" }) as never);
  assert.equal(corrente.state, "CURRENT");
  assert.equal(corrente.compliant, true);
  assert.equal(corrente.siloId, "working-silo:3");
});

test("CORRENTE: concluir a formação materializa o siloId preservando o resto", () => {
  const antes = artigo() as never as Parameters<typeof materializeArticleSiloId>[0]["article"];
  const resultado = materializeArticleSiloId({ article: antes, siloVersions: [siloDna()] as never });
  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.siloId, "working-silo:3");
  assert.equal(resultado.changed, true);
  // Materializar o pai NÃO é oportunidade de reeditar o artigo.
  assert.deepEqual({ ...resultado.payload, siloId: null }, { ...antes, siloId: null });
});

test("CORRENTE: sem Silo consolidado a formação não é concluída", () => {
  const resultado = materializeArticleSiloId({
    article: artigo() as never as Parameters<typeof materializeArticleSiloId>[0]["article"],
    siloVersions: [],
  });
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.reason, /consolidar o Silo/);
});

test("trocar o pai de um artigo nunca é efeito colateral do backfill", () => {
  const resultado = materializeArticleSiloId({
    article: artigo({ siloId: "outro-silo" }) as never as Parameters<typeof materializeArticleSiloId>[0]["article"],
    siloVersions: [siloDna()] as never,
  });
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.reason, /decisão humana/);
});

test("território sem SiloDNA volta BLOQUEADO com o motivo, nunca ignorado", () => {
  const plano = buildRadarHandoffContexts({
    articles: [artigoVersionado()], siloVersions: [], siloPageVersions: [], graphs: [],
    labels: new Map([["article:pilar", "retinol creamy antes e depois"]]),
  });
  assert.equal(plano.eligible.length, 0);
  assert.equal(plano.blocked.length, 1, "o artigo volta na lista, não some");
  assert.equal(plano.blocked[0].label, "retinol creamy antes e depois");
  assert.match(plano.blocked[0].reasons.join(" "), /consolidar o Silo/);
});

test("território que resolve mais de um SiloDNA volta BLOQUEADO por ambiguidade", () => {
  const plano = buildRadarHandoffContexts({
    articles: [artigoVersionado()],
    siloVersions: [siloDna(), siloDna({ siloId: "working-silo:9", name: "Outro" })],
    siloPageVersions: [], graphs: [],
  });
  assert.equal(plano.eligible.length, 0);
  assert.match(plano.blocked[0].reasons.join(" "), /1:1/);
});

test("grafo exigido e ausente vira bloqueio nomeado, não descarte", () => {
  const plano = buildRadarHandoffContexts({
    articles: [artigoVersionado()], siloVersions: [siloDna()], siloPageVersions: [siloPage()],
    graphs: [], requireApprovedGraph: true,
  });
  assert.equal(plano.blocked.length, 1);
  assert.match(plano.blocked[0].reasons.join(" "), /InternalLinkGraph aprovado/);
});

/* ------------------ uma autoridade só para as três telas ----------------- */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const radarPage = readFileSync("modules/radar/radar-page.tsx", "utf8");
const pipeline = readFileSync("components/editorial-pipeline-context.tsx", "utf8");
const workflowRoute = readFileSync("app/api/editorial/workflow/route.ts", "utf8");
const operationalFlow = readFileSync("lib/editorial/operational-flow.ts", "utf8");

test("Arquiteto e Radar importam pelo mesmo caminho canônico", () => {
  // Duas telas resolviam a mesma pergunta de jeitos diferentes: o Arquiteto
  // montava contexto, a tela Radar chamava sem nada e perdia os oito.
  assert.match(workspace, /await importApprovedToRadar\(/);
  assert.match(radarPage, /await pipeline\.importApprovedToRadar\(/);
  assert.match(pipeline, /buildRadarHandoffContexts\(\{/);
  // A resolução de Silo não é reimplementada em nenhuma tela.
  assert.doesNotMatch(radarPage, /resolveCanonicalSiloForArticle/);
  assert.doesNotMatch(workspace, /territoryRef === .*siloVersions/);
});

test("a tela Radar não usa payload.siloId como autoridade", () => {
  assert.doesNotMatch(radarPage, /payload\.siloId/);
});

test("o servidor recusa em vez de gravar RadarItem indefinido", () => {
  // `importArticlesToRadar(...)[0]` virava `undefined` e seguia para o
  // `importItem`. Agora a ausência é recusa declarada, com o artigo nomeado.
  assert.match(workflowRoute, /const item = construidos\[0\];/);
  assert.match(workflowRoute, /if \(!item\) \{/);
  assert.match(workflowRoute, /Sem Silo canônico resolvido para/);
  assert.match(workflowRoute, /const validado = RadarItemSchema\.parse\(item\);/);
  assert.doesNotMatch(workflowRoute, /payload: item,/);
});

test("o servidor valida o item contra o ArticleDNA enviado", () => {
  assert.match(workflowRoute, /validado\.articleDnaVersionId !== version\.versionId/);
  assert.match(workflowRoute, /validado\.articleDnaContentHash !== version\.contentHash/);
  assert.match(workflowRoute, /validado\.brandId !== command\.brandId/);
});

test("a escrita remota é aguardada antes do estado local", () => {
  // Optimistic success dizia "8 enviados" no instante do clique, mesmo quando
  // o servidor recusava tudo.
  assert.match(pipeline, /await sendWorkflowCommand\(\{ action: "import_radar"/);
  assert.doesNotMatch(pipeline, /void sendWorkflowCommand\(\{ action: "import_radar"/);
  const trecho = pipeline.slice(pipeline.indexOf('await sendWorkflowCommand({ action: "import_radar"'));
  assert.ok(
    trecho.indexOf("updateWorkspace(current => ({ ...current, radarItems: next }))") >= 0,
    "o estado local é atualizado depois da escrita, não antes",
  );
});

test("nenhum artigo é descartado em silêncio pelo importador", () => {
  assert.match(operationalFlow, /const siloIdOf = /);
  assert.match(pipeline, /blocked: resolvido\.blocked/);
});
