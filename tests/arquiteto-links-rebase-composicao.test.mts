import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { InternalLinkGraphEdge, InternalLinkGraphNode } from "../lib/arquiteto/contracts.ts";
import { internalLinkGraphBasisIsCurrent, rebaseInternalLinkGraph } from "../lib/arquiteto/internal-link-graph-rebase.ts";

/*
 * O caso real de 2026-10-01: o Silo "Crescimento de Clínicas" trocou a principal
 * de cinco artigos, a sucessora do grafo copiava os nós do aprovado e cada nova
 * aprovação continuava descrevendo as versões antigas — o portão do Radar
 * recusava os mesmos artigos para sempre.
 */

const ref = (entityId: string, versionId: string) => ({ entityId, versionId, contentHash: `sha256:${versionId}` });

const no = (id: string, papel: "PILAR" | "SUPORTE" | null, versao: string): InternalLinkGraphNode => ({
  nodeId: papel === null ? `silo-page:${id}` : `article:${id}`,
  brandId: "marca-1",
  nodeType: papel === null ? "SILO_PAGE" : "ARTICLE_DNA",
  articleDnaVersionRef: papel === null ? null : ref(id, versao),
  siloPageVersionRef: papel === null ? ref(`silo-page:${id}`, versao) : null,
  architecturalRole: papel,
  snapshot: { label: `${id} ${versao}`, siloId: "silo-1" },
} as InternalLinkGraphNode);

const aresta = (de: string, para: string, relationType: InternalLinkGraphEdge["relationType"], origin: InternalLinkGraphEdge["origin"] = "ai"): InternalLinkGraphEdge => ({
  edgeId: `edge:${de}->${para}`, sourceNodeId: de, targetNodeId: para, relationType,
  reason: "motivo", priority: "HIGH", anchorConcepts: ["conceito antigo"], origin,
  createdBy: "ator", createdAt: "2026-10-01T00:00:00.000Z", provenance: { source: "teste", references: [] },
} as InternalLinkGraphEdge);

const baseAntiga = {
  baseSiloDnaVersionRef: ref("silo-1", "silo-v1"),
  baseSiloPageVersionRef: ref("silo-page:silo-1", "page-v1"),
  participatingArticleDnaVersionRefs: [ref("pilar", "pilar-v1"), ref("s1", "s1-v1"), ref("s2", "s2-v1")],
};

test("a base com versão de artigo antiga NÃO é a vigente", () => {
  assert.equal(internalLinkGraphBasisIsCurrent(baseAntiga, baseAntiga), true);
  assert.equal(internalLinkGraphBasisIsCurrent(baseAntiga, {
    ...baseAntiga,
    participatingArticleDnaVersionRefs: [ref("pilar", "pilar-v2"), ref("s1", "s1-v1"), ref("s2", "s2-v1")],
  }), false, "a principal trocou: a cópia precisa ser rebaseada");
  assert.equal(internalLinkGraphBasisIsCurrent(baseAntiga, { ...baseAntiga, baseSiloDnaVersionRef: ref("silo-1", "silo-v2") }), false);
  assert.equal(internalLinkGraphBasisIsCurrent(baseAntiga, {
    ...baseAntiga,
    participatingArticleDnaVersionRefs: [...baseAntiga.participatingArticleDnaVersionRefs].reverse(),
  }), true, "a ordem não muda a composição");
});

test("o rebase troca os nós pelos vigentes e leva só as arestas que ainda cabem", () => {
  const nosAtuais = [no("silo-1", null, "page-v1"), no("pilar", "PILAR", "pilar-v2"), no("s1", "SUPORTE", "s1-v2")];
  const resultado = rebaseInternalLinkGraph({
    currentNodes: nosAtuais,
    previousEdges: [
      aresta("article:pilar", "article:s1", "PILLAR_TO_SUPPORT"),
      aresta("article:s1", "article:pilar", "SUPPORT_TO_PILLAR", "human"),
      aresta("article:pilar", "article:s2", "PILLAR_TO_SUPPORT"),
      aresta("article:s1", "article:pilar", "SUPPORT_TO_PILLAR"),
    ],
  });
  assert.deepEqual(resultado.nodes.map(item => item.articleDnaVersionRef?.versionId ?? item.siloPageVersionRef?.versionId), ["page-v1", "pilar-v2", "s1-v2"]);
  assert.deepEqual(resultado.edges.map(item => item.edgeId), ["edge:article:pilar->article:s1", "edge:article:s1->article:pilar"]);
  assert.equal(resultado.edges[1].origin, "human", "a relação criada por humano é preservada");
  assert.equal(resultado.dropped.length, 1, "o s2 saiu do Silo: a aresta para ele sai com motivo");
  assert.match(resultado.dropped[0].reason, /saiu da composição/);
});

test("papel trocado derruba a relação que não combina mais", () => {
  // O antigo suporte virou Pilar: PILLAR_TO_SUPPORT de pilar→s1 deixa de valer.
  const nosAtuais = [no("pilar", "SUPORTE", "pilar-v2"), no("s1", "PILAR", "s1-v2")];
  const resultado = rebaseInternalLinkGraph({
    currentNodes: nosAtuais,
    previousEdges: [aresta("article:pilar", "article:s1", "PILLAR_TO_SUPPORT")],
  });
  assert.equal(resultado.edges.length, 0);
  assert.match(resultado.dropped[0].reason, /papéis atuais/);
});

test("a tela abre a cópia pela composição vigente e processa os Silos marcados", () => {
  const fonte = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const processar = fonte.slice(fonte.indexOf("const processarLinks = async () => {"), fonte.indexOf("const handleApproveLinks = async"));
  assert.match(processar, /selectedArticleIds\.has\(article\.id\)/, "a seleção decide os Silos");
  assert.match(processar, /for \(const contexto of alvos\)/, "um Silo de cada vez");
  assert.match(processar, /abrirCopiaVigente\(contexto\)/);
  const sucessora = fonte.slice(fonte.indexOf("const handleCreateLinksSuccessor = async"), fonte.indexOf("const abrirCopiaVigente = async"));
  assert.equal(/nodes: linksApprovedGraph\.nodes/.test(sucessora), false, "a sucessora não copia mais os nós do aprovado");
  const abrir = fonte.slice(fonte.indexOf("const abrirCopiaVigente = async"), fonte.indexOf("const processarLinks = async () => {"));
  assert.match(abrir, /internalLinkGraphBasisIsCurrent\(existente, base\)/, "cópia com base antiga é rebaseada");
  assert.match(abrir, /rebaseInternalLinkGraph\(\{ previousEdges: aprovado\.edges/);
});
