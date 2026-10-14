import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { InternalLinkGraphEdge, InternalLinkGraphNode } from "../lib/arquiteto/contracts.ts";
import { rebaseInternalLinkGraph } from "../lib/arquiteto/internal-link-graph-rebase.ts";
import {
  buildStructuralLinkConnections,
  structuralLinkMeshConnectionCount,
  structuralLinkSiblingAffinities,
  type StructuralLinkConnection,
  type StructuralLinkUnit,
} from "../lib/arquiteto/internal-link-structure.ts";
import {
  LINK_ANCHOR_SYSTEM_PROMPT,
  anchorCompareKey,
  anchorRepeatsTargetKeyword,
  reviewAnchorConcepts,
  type LinkAnchorUnitFacts,
} from "../lib/arquiteto/link-anchor-ai.ts";
import { naturalInternalLinkAnchorConcepts, suggestInternalLinkAnchorConcepts } from "../lib/arquiteto/link-anchor-concepts.ts";
import {
  applySiloMeshAnchorReuse,
  estimateLinkAnchorCost,
  planLinkAnchorWork,
  previewSiloLinkMesh,
  siloMeshCompletionOnlyAdds,
  siloMeshReusedConcepts,
  summarizeSiloLinkMesh,
} from "../lib/arquiteto/silo-link-mesh.ts";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";

/*
 * ===== 2026-10-14 · F4 · A MALHA COMPLETA DO SILO NO ARQUITETO =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6,
 * §11, §14 e §15 (F4); D1, D2 e D3, decididas pelo dono em 2026-10-14 ("sim,
 * pode sim, e do MCP também é uma boa ideia, pode implementar"):
 *   - o gerador grava Suporte → Pilar e Pilar → cada Suporte (HIGH), Suporte ↔
 *     Suporte em todos os pares (MEDIUM de assunto próximo, LOW no resto) e
 *     artigo → SiloPage; 2 + 3(N−1) + (N−1)(N−2) + (N−1) conexões;
 *   - o caso real (AdalbaPro, "Leads sem Tráfego Pago", 8 artigos) e o Silo de 30;
 *   - âncoras: a partida e a IA nunca aceitam a keyword do destino; a malha
 *     reaproveita a âncora do destino, variada por origem (ler antes de buscar);
 *   - o custo antes de rodar (lotes de 40);
 *   - "Completar a malha" só acrescenta;
 *   - nada do Minerador é lido nem escrito.
 * Sem rede, sem IA, sem banco.
 */

Object.defineProperty(globalThis, "fetch", {
  value: () => Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")),
  writable: true, configurable: true,
});

/* ============================== o caso real ============================== */

const SILO_PAGE: StructuralLinkUnit = { nodeId: "silo-page:leads", nodeType: "SILO_PAGE", architecturalRole: null, label: "Leads sem Tráfego Pago" };
const PILAR: StructuralLinkUnit = { nodeId: "article:pilar-leads", nodeType: "ARTICLE_DNA", architecturalRole: "PILAR", label: "leads qualificados", terms: ["leads qualificados", "gerar leads qualificados", "geração de leads qualificados"] };
const suporte = (id: string, terms: string[]): StructuralLinkUnit => ({ nodeId: `article:${id}`, nodeType: "ARTICLE_DNA", architecturalRole: "SUPORTE", label: terms[0], terms });
/** Os 7 Suportes do Silo piloto, com a principal e as complementares que o retrato da SDD (§3, §4.2) mostra. */
const SUPORTES = [
  suporte("sup-instagram", ["instagram não traz pacientes", "atrair pacientes pelo instagram"]),
  suporte("sup-captacao", ["captação de pacientes dentista", "captação de pacientes sem tráfego pago", "tráfego orgânico como fazer", "empresa de captação de pacientes"]),
  suporte("sup-promocoes", ["promoções para estética", "promoções estética"]),
  suporte("sup-captar", ["como captar um cliente"]),
  suporte("sup-trafego", ["tráfego pago vs orgânico para clínica de estética"]),
  suporte("sup-campanhas", ["campanhas de marketing para clínica de estética sem anúncios"]),
  suporte("sup-atrair", ["como atrair um cliente", "como conquistar novos clientes"]),
];
const OITO = [SILO_PAGE, PILAR, ...SUPORTES];

const contar = (conexoes: readonly StructuralLinkConnection[]) => conexoes.reduce<Record<string, number>>((acc, item) => {
  acc[item.relationType] = (acc[item.relationType] || 0) + 1;
  return acc;
}, {});
const de = (conexoes: readonly StructuralLinkConnection[], origem: string, destino: string) =>
  conexoes.find(item => item.sourceNodeId === `article:${origem}` && item.targetNodeId === `article:${destino}`);

const nos = (unidades: readonly StructuralLinkUnit[]): InternalLinkGraphNode[] => unidades.map(unit => ({
  nodeId: unit.nodeId,
  brandId: "marca-a",
  nodeType: unit.nodeType,
  articleDnaVersionRef: unit.nodeType === "ARTICLE_DNA" ? { entityId: unit.nodeId.slice("article:".length), versionId: `v-${unit.nodeId}`, contentHash: "h" } : null,
  siloPageVersionRef: unit.nodeType === "SILO_PAGE" ? { entityId: unit.nodeId, versionId: "v-sp", contentHash: "h" } : null,
  architecturalRole: unit.architecturalRole,
  snapshot: { label: unit.label, siloId: "leads" },
}) as InternalLinkGraphNode);

let sequencia = 0;
const aresta = (conexao: StructuralLinkConnection, extra: Partial<InternalLinkGraphEdge> = {}): InternalLinkGraphEdge => ({
  edgeId: `edge:${(sequencia += 1)}`,
  sourceNodeId: conexao.sourceNodeId,
  targetNodeId: conexao.targetNodeId,
  relationType: conexao.relationType,
  reason: conexao.reason,
  priority: conexao.priority,
  anchorConcepts: ["partida"],
  origin: "system",
  createdBy: "ator",
  createdAt: "2026-10-14T00:00:00.000Z",
  provenance: { source: "structural-derivation", references: [] },
  ...extra,
});

/** As âncoras que a IA já deu a cada destino no grafo aprovado de hoje (5 conceitos por destino, sem a keyword dele). */
const CONCEITOS_APROVADOS: Record<string, string[]> = {
  "article:pilar-leads": ["contatos que viram consulta", "lead que chega pronto", "contato com intenção de compra", "pedido de orçamento qualificado", "quem já quer marcar"],
  "silo-page:leads": ["o mapa do tema", "todos os caminhos sem anúncio", "o índice do assunto", "por onde começar", "o guia do orgânico"],
};
for (const unit of SUPORTES) {
  CONCEITOS_APROVADOS[unit.nodeId] = [`o recorte de ${unit.nodeId.slice(12)}`, `o caso ${unit.nodeId.slice(12)}`, `a dúvida de ${unit.nodeId.slice(12)}`, `o passo ${unit.nodeId.slice(12)}`, `a saída ${unit.nodeId.slice(12)}`];
}

/** O grafo aprovado de hoje do Silo piloto (§4.1 da SDD): o esqueleto de 23 arestas, âncoras da IA. */
function aprovadoDeHoje(): InternalLinkGraphEdge[] {
  return buildStructuralLinkConnections(OITO, { mesh: false })
    .map(conexao => aresta(conexao, { origin: "ai", anchorConcepts: CONCEITOS_APROVADOS[conexao.targetNodeId], provenance: { source: "link-anchor-ai", references: ["grafo"] } }));
}
const parDe = (edge: { sourceNodeId: string; targetNodeId: string }) => `${edge.sourceNodeId}->${edge.targetNodeId}`;

/* ============================== a malha (D1, D2) ============================== */

test("F4 · Silo de 8 (caso real) · a malha inteira: 72 conexões = 2 + 3(N−1) + (N−1)(N−2) + (N−1)", () => {
  const conexoes = buildStructuralLinkConnections(OITO);
  assert.equal(conexoes.length, 72);
  assert.equal(structuralLinkMeshConnectionCount(8), 72);
  assert.deepEqual(contar(conexoes), {
    SILO_PAGE_TO_ARTICLE: 8, ARTICLE_TO_SILO_PAGE: 8, PILLAR_TO_SUPPORT: 7, SUPPORT_TO_PILLAR: 7, SUPPORT_TO_SUPPORT: 42,
  });
  assert.equal(new Set(conexoes.map(parDe)).size, 72, "nenhum par repetido");
  const ids = new Set(OITO.map(unit => unit.nodeId));
  assert.ok(conexoes.every(item => ids.has(item.sourceNodeId) && ids.has(item.targetNodeId) && item.sourceNodeId !== item.targetNodeId), "só as páginas do Silo; nada atravessa para outro Silo");
  for (const conexao of conexoes) {
    assert.ok(conexao.reason.length > 20);
    assert.doesNotMatch(conexao.reason, /article:|silo-page:|nodeId/, "o motivo não mostra identificador cru");
  }
});

test("F4 · D2 · priorities: S→P, P→S e SiloPage→Pilar HIGH; SiloPage→S e Pilar→SiloPage MEDIUM; S→SiloPage LOW; S↔S MEDIUM (próximo) ou LOW, simétrico", () => {
  const conexoes = buildStructuralLinkConnections(OITO);
  const porTipo = (tipo: string) => conexoes.filter(item => item.relationType === tipo);
  assert.ok(porTipo("SUPPORT_TO_PILLAR").every(item => item.priority === "HIGH"));
  assert.ok(porTipo("PILLAR_TO_SUPPORT").every(item => item.priority === "HIGH"));
  assert.equal(conexoes.find(item => item.sourceNodeId === SILO_PAGE.nodeId && item.targetNodeId === PILAR.nodeId)?.priority, "HIGH");
  assert.ok(porTipo("SILO_PAGE_TO_ARTICLE").filter(item => item.targetNodeId !== PILAR.nodeId).every(item => item.priority === "MEDIUM"));
  assert.equal(conexoes.find(item => item.sourceNodeId === PILAR.nodeId && item.targetNodeId === SILO_PAGE.nodeId)?.priority, "MEDIUM");
  assert.ok(porTipo("ARTICLE_TO_SILO_PAGE").filter(item => item.sourceNodeId !== PILAR.nodeId).every(item => item.priority === "LOW"));
  const irmaos = porTipo("SUPPORT_TO_SUPPORT");
  assert.ok(irmaos.every(item => item.priority === "MEDIUM" || item.priority === "LOW"), "nenhum irmão é obrigatório no corpo");
  for (const item of irmaos) {
    const volta = irmaos.find(outra => outra.sourceNodeId === item.targetNodeId && outra.targetNodeId === item.sourceNodeId);
    assert.equal(volta?.priority, item.priority, "a afinidade é simétrica");
  }
  /* Assunto próximo (as raízes que os dois dividem), sem IA. */
  assert.equal(de(conexoes, "sup-captacao", "sup-instagram")?.priority, "MEDIUM", "pacientes");
  assert.match(de(conexoes, "sup-captacao", "sup-instagram")!.reason, /assunto próximo \(pacientes\)/);
  assert.equal(de(conexoes, "sup-captacao", "sup-captar")?.priority, "MEDIUM", "captação × captar");
  assert.equal(de(conexoes, "sup-captar", "sup-atrair")?.priority, "MEDIUM", "cliente");
  assert.equal(de(conexoes, "sup-promocoes", "sup-campanhas")?.priority, "MEDIUM", "estética");
  assert.equal(de(conexoes, "sup-promocoes", "sup-captar")?.priority, "LOW", "promoção e captar um cliente: distantes");
  assert.match(de(conexoes, "sup-promocoes", "sup-captar")!.reason, /trilha "Continue no Silo"/);
  const medias = irmaos.filter(item => item.priority === "MEDIUM").length;
  assert.ok(medias > 0 && medias < irmaos.length, `afinidade separa corpo e trilha (${medias} de ${irmaos.length} MEDIUM)`);
});

test("F4 · D2 · a afinidade tira o cenário do Silo e usa a faceta só quando há mais de uma", () => {
  const iguais = ["a", "b", "c", "d"].map(letra => ({ ...suporte(`s-${letra}`, [`leads para ${letra}clinicas`, "leads qualificados"]), facet: "verde" }));
  const afinidades = structuralLinkSiblingAffinities(iguais);
  assert.ok([...afinidades.values()].every(item => item.priority === "LOW" && !item.sameFacet), "\"leads\" é cenário (todos dividem) e a faceta única não distingue");
  const duasFacetas = iguais.map((unit, indice) => ({ ...unit, facet: indice < 2 ? "verde" : "azul" }));
  const comFaceta = structuralLinkSiblingAffinities(duasFacetas);
  assert.equal(comFaceta.get("article:s-a->article:s-b")?.priority, "MEDIUM", "mesma faceta");
  assert.equal(comFaceta.get("article:s-a->article:s-c")?.priority, "LOW");
});

test("F4 · Silo de 30 · 930 conexões (812 Suporte ↔ Suporte); o contrato não tem teto; todo artigo liga às 30 outras páginas", () => {
  const trinta = [SILO_PAGE, PILAR, ...Array.from({ length: 29 }, (_, indice) => suporte(`s${indice + 1}`, [`assunto ${indice + 1} da clínica`, `termo${indice % 5} dentista`]))];
  const conexoes = buildStructuralLinkConnections(trinta);
  assert.equal(conexoes.length, 930);
  assert.equal(structuralLinkMeshConnectionCount(30), 930);
  assert.equal(contar(conexoes).SUPPORT_TO_SUPPORT, 812);
  assert.equal(conexoes.filter(item => item.priority === "HIGH").length, 1 + 29 + 29);
  const malha = summarizeSiloLinkMesh({ nodes: nos(trinta), edges: conexoes });
  assert.equal(malha.required, 30 * 30);
  assert.equal(malha.covered, 900);
  assert.equal(malha.bodyCovered, malha.bodyRequired);
  assert.equal(malha.bodyRequired, 29 + 29);
  assert.ok(malha.complete);
  assert.ok(malha.articles.every(item => item.covered === 30 && item.required === 30));
  assert.match(malha.text, /900 de 900/);
});

test("F4 · rebase mantém Suporte ↔ Suporte e artigo → SiloPage na composição atual", () => {
  const edges = buildStructuralLinkConnections(OITO).map(conexao => aresta(conexao));
  const rebase = rebaseInternalLinkGraph({ previousEdges: edges, currentNodes: nos(OITO) });
  assert.equal(rebase.edges.length, 72);
  assert.deepEqual(rebase.dropped, []);
  assert.equal(rebase.edges.filter(edge => edge.relationType === "SUPPORT_TO_SUPPORT").length, 42);
  /* Um Suporte sai do Silo: as relações dele saem com nome; as outras ficam. */
  const semUm = rebaseInternalLinkGraph({ previousEdges: edges, currentNodes: nos(OITO).filter(node => node.nodeId !== "article:sup-atrair") });
  assert.equal(semUm.edges.some(edge => edge.sourceNodeId === "article:sup-atrair" || edge.targetNodeId === "article:sup-atrair"), false);
  assert.equal(semUm.edges.filter(edge => edge.relationType === "SUPPORT_TO_SUPPORT").length, 30);
});

/* ============================== a malha antes → depois (simulado) ============================== */

test("F4 · caso real · antes (grafo aprovado de hoje: 23 arestas, 0 S↔S) → depois (72): cada artigo de 1/8 a 8/8", () => {
  const antes = summarizeSiloLinkMesh({ nodes: nos(OITO), edges: aprovadoDeHoje() });
  assert.equal(aprovadoDeHoje().length, 23, "o retrato do banco (§4.1): 7 S→P, 7 P→S, 8 SP→artigo, 1 Pilar→SP");
  assert.equal(antes.supportToSupport, 0);
  assert.equal(antes.required, 64);
  assert.equal(antes.covered, 15, "o Pilar 8/8 e cada Suporte 1/8 (só o Pilar)");
  assert.equal(antes.articles.find(item => item.role === "PILAR")?.covered, 8);
  assert.ok(antes.articles.filter(item => item.role === "SUPORTE").every(item => item.covered === 1 && item.missing.length === 7));
  assert.equal(antes.bodyCovered, 14, "o obrigatório (S→P e P→S) já existia");
  assert.equal(antes.bodyOrphans.length, 7, "todo Suporte recebe só o link do Pilar no corpo");
  const depois = summarizeSiloLinkMesh({ nodes: nos(OITO), edges: buildStructuralLinkConnections(OITO) });
  assert.equal(depois.covered, 64);
  assert.ok(depois.complete);
  assert.deepEqual(depois.byPriority, {
    HIGH: 15,
    MEDIUM: 8 + depois.supportToSupport - buildStructuralLinkConnections(OITO).filter(item => item.relationType === "SUPPORT_TO_SUPPORT" && item.priority === "LOW").length,
    LOW: 7 + buildStructuralLinkConnections(OITO).filter(item => item.relationType === "SUPPORT_TO_SUPPORT" && item.priority === "LOW").length,
  });
});

/* ============================== "Completar a malha" só acrescenta ============================== */

test("F4 · Completar a malha do grafo aprovado: prévia com 49 acréscimos, 23 mantidas, 0 chamada de IA; nenhuma aprovada sai nem muda", () => {
  const aprovado = aprovadoDeHoje();
  const aprovadas = new Set(aprovado.map(parDe));
  const previa = previewSiloLinkMesh({ units: OITO, nodes: nos(OITO), existingEdges: aprovado, approvedPairs: aprovadas });
  assert.equal(previa.connections, 72);
  assert.equal(previa.additions.length, 49);
  assert.deepEqual(previa.additionsByRelation, { ARTICLE_TO_SILO_PAGE: 7, SUPPORT_TO_SUPPORT: 42 });
  assert.equal(previa.existing, 23);
  assert.equal(previa.edgesAfter, 72);
  assert.deepEqual(previa.anchors, { kept: 23, reuse: 49, ask: 0, reuseAfterAi: 0 });
  assert.deepEqual(previa.cost, { calls: 0, connections: 0 }, "ler antes de buscar: tudo reaproveita a âncora aprovada do destino");
  assert.equal(previa.coverageBefore.covered, 15);
  assert.equal(previa.coverageAfter.covered, 64);

  /* A execução simulada: a cópia nasce do aprovado, ganha as 49 (partida do sistema) e reaproveita as âncoras. */
  const novas = previa.additions.map(conexao => aresta(conexao));
  const reuso = applySiloMeshAnchorReuse({ edges: [...aprovado, ...novas], approvedPairs: aprovadas, graphId: "grafo" });
  assert.equal(reuso.reused, 49);
  assert.deepEqual(reuso.pending, []);
  const conferencia = siloMeshCompletionOnlyAdds({ approvedEdges: aprovado, workingEdges: reuso.edges });
  assert.deepEqual(conferencia, { ok: true, removed: [], changed: [], added: 49 });
  for (const edge of reuso.edges.slice(0, 23)) assert.deepEqual(edge, aprovado.find(item => item.edgeId === edge.edgeId), "a aprovada é a mesma, byte a byte");
  assert.ok(reuso.edges.slice(23).every(edge => edge.provenance.source === "link-anchor-reuse" && edge.provenance.references.includes("grafo")));

  /* A conferência pega o que não é "só acrescentar". */
  const semUma = siloMeshCompletionOnlyAdds({ approvedEdges: aprovado, workingEdges: reuso.edges.slice(1) });
  assert.equal(semUma.ok, false);
  assert.equal(semUma.removed.length, 1);
  const mudada = siloMeshCompletionOnlyAdds({ approvedEdges: aprovado, workingEdges: reuso.edges.map((edge, indice) => (indice === 0 ? { ...edge, priority: "LOW" as const } : edge)) });
  assert.equal(mudada.ok, false);
  assert.equal(mudada.changed.length, 1);
});

/* ============================== o custo antes de rodar ============================== */

test("F4 · custo por Silo: grafo novo de 8 = 1 chamada (23 conexões do esqueleto); de 30 = 3 chamadas (89); a malha reaproveita, sem custo", () => {
  for (const [total, chamadas, conexoes] of [[8, 1, 23], [15, 2, 44], [30, 3, 89]] as const) {
    const unidades = total === 8 ? OITO : [SILO_PAGE, PILAR, ...Array.from({ length: total - 1 }, (_, indice) => suporte(`s${indice + 1}`, [`assunto ${indice + 1}`]))];
    const previa = previewSiloLinkMesh({ units: unidades, nodes: nos(unidades), existingEdges: [] });
    assert.equal(previa.additions.length, structuralLinkMeshConnectionCount(total));
    assert.deepEqual(previa.cost, { calls: chamadas, connections: conexoes }, `Silo de ${total}`);
    assert.equal(previa.anchors.reuseAfterAi, structuralLinkMeshConnectionCount(total) - conexoes, "toda aresta da malha espera a âncora do destino");
    /* Sem o reaproveitamento, a malha inteira iria à IA. */
    const tudo = estimateLinkAnchorCost({ units: nos(unidades).map(node => ({ ref: node.nodeId })), candidates: buildStructuralLinkConnections(unidades).map(item => ({ sourceRef: item.sourceNodeId, targetRef: item.targetNodeId })) });
    assert.ok(tudo.calls > chamadas, `${tudo.calls} chamadas sem ler antes; ${chamadas} lendo antes`);
  }
});

test("F4 · reprocessar uma cópia já proposta pela IA não paga de novo (as âncoras da IA ficam)", () => {
  const edges = buildStructuralLinkConnections(OITO).map(conexao => aresta(conexao, isMalha(conexao) ? {} : { origin: "ai", anchorConcepts: CONCEITOS_APROVADOS[conexao.targetNodeId] }));
  const plano = planLinkAnchorWork({ edges });
  assert.equal(plano.ask.length, 0);
  assert.equal(plano.kept.length, 23);
  assert.equal(plano.reuse.length, 49);
  /* Um destino sem âncora em lugar nenhum: um representante vai à IA; os irmãos esperam a resposta. */
  const semDoador = edges.map(edge => (edge.targetNodeId === "article:sup-atrair" ? { ...edge, origin: "system" as const, provenance: { source: "structural-derivation", references: [] } } : edge));
  const outro = planLinkAnchorWork({ edges: semDoador });
  assert.ok(outro.ask.length >= 1 && outro.ask.length <= 2, "o esqueleto do destino (Pilar → ele) vai; a malha espera");
  assert.equal(outro.reuseAfterAi.length, 6, "os 6 irmãos que apontam para ele reaproveitam depois");
});

function isMalha(conexao: StructuralLinkConnection) {
  return conexao.relationType === "SUPPORT_TO_SUPPORT" || (conexao.relationType === "ARTICLE_TO_SILO_PAGE" && conexao.sourceNodeId !== PILAR.nodeId);
}

/* ============================== âncoras naturais, sem repetição ============================== */

const KEYWORDS: Record<string, string[]> = Object.fromEntries([PILAR, ...SUPORTES].map(unit => [unit.nodeId, (unit.terms || []).map(String)]));

test("F4 · âncoras reaproveitadas: sem a keyword do destino, sem repetir na aresta e variadas por origem", () => {
  const aprovado = aprovadoDeHoje().map(edge => ({
    ...edge,
    /* O aprovado de hoje traz, entre os conceitos, a principal do destino (a regra antiga aceitava "exact"). */
    anchorConcepts: [...edge.anchorConcepts, ...(KEYWORDS[edge.targetNodeId]?.slice(0, 1) || [])],
  }));
  const aprovadas = new Set(aprovado.map(parDe));
  const novas = buildStructuralLinkConnections(OITO).filter(conexao => !aprovadas.has(parDe(conexao))).map(conexao => aresta(conexao));
  const reuso = applySiloMeshAnchorReuse({
    edges: [...aprovado, ...novas],
    approvedPairs: aprovadas,
    targetKeywords: new Map(Object.entries(KEYWORDS)),
    graphId: "grafo",
  });
  const malha = reuso.edges.filter(edge => !aprovadas.has(parDe(edge)));
  assert.equal(malha.length, 49);
  for (const edge of malha) {
    assert.ok(edge.anchorConcepts.length >= 1 && edge.anchorConcepts.length <= 3);
    assert.equal(new Set(edge.anchorConcepts.map(anchorCompareKey)).size, edge.anchorConcepts.length, "nada se repete dentro da aresta");
    assert.ok(edge.anchorConcepts.every(conceito => !anchorRepeatsTargetKeyword(conceito, KEYWORDS[edge.targetNodeId] || [])), `${edge.targetNodeId}: a keyword do destino nunca é âncora`);
  }
  /* Para o mesmo destino, cada irmão recebe um conjunto diferente enquanto há conceitos (5 conceitos, 6 irmãos → 5 conjuntos). */
  const paraOInstagram = malha.filter(edge => edge.targetNodeId === "article:sup-instagram").map(edge => [...edge.anchorConcepts].sort().join("|"));
  assert.equal(paraOInstagram.length, 6);
  assert.equal(new Set(paraOInstagram).size, 5);
  assert.deepEqual(siloMeshReusedConcepts({ donorConcepts: ["a b", "c d"], index: 4 }), ["a b", "c d"], "com até 3 conceitos, vão todos");
});

test("F4 · a partida nunca é a keyword do destino (os 8 do caso real) e a IA recusa a keyword do destino", () => {
  for (const [nodeId, keywords] of Object.entries(KEYWORDS)) {
    const partida = naturalInternalLinkAnchorConcepts({ keywords });
    assert.ok(partida.length >= 1, `${nodeId}: há recorte natural`);
    assert.ok(partida.every(conceito => !anchorRepeatsTargetKeyword(conceito, keywords)), `${nodeId}: ${partida.join(" · ")}`);
  }
  const artigo = {
    principalKeywordId: "k1", secondaryKeywordIds: ["k2", "k3", "k4"], narrativeReinforcementIds: [], entities: [],
    keywordReferences: KEYWORDS["article:sup-captacao"].map((keyword, indice) => ({ keywordId: `k${indice + 1}`, keywordDnaSnapshot: { sourceKeywordSnapshot: { keyword } } })),
  } as unknown as ArticleDNA;
  const sugerida = suggestInternalLinkAnchorConcepts({ article: artigo, fallbackLabel: "captação de pacientes dentista" });
  assert.notEqual(sugerida[0], "captação de pacientes dentista", "a principal não é mais o primeiro conceito");
  assert.ok(sugerida.every(conceito => !anchorRepeatsTargetKeyword(conceito, KEYWORDS["article:sup-captacao"])));

  const destino: LinkAnchorUnitFacts = {
    ref: "article:sup-captacao", unitType: "ARTICLE_DNA", label: "captação de pacientes dentista", siloId: "leads", siloLabel: "Leads sem Tráfego Pago",
    architecturalRole: "SUPORTE", principal: "captação de pacientes dentista", secondaries: KEYWORDS["article:sup-captacao"].slice(1), reinforcements: [],
    entities: [], intent: null, slug: "captacao-de-pacientes-sem-trafego-pago", narrative: null, published: true,
  };
  const revisao = reviewAnchorConcepts({
    target: destino,
    concepts: [
      { text: "captação de pacientes dentista", semanticRelation: "exact", reason: "a principal" },
      { text: "a empresa de captação de pacientes certa", semanticRelation: "expressao_contextual", reason: "contém a complementar inteira" },
      { text: "Captações de Paciente Dentista", semanticRelation: "variante_lexical", reason: "plural e caixa" },
      { text: "captação de pacientes", semanticRelation: "recorte", reason: "recorte curto" },
      { text: "pacientes que chegam sem anúncio", semanticRelation: "expressao_contextual", reason: "a ideia" },
    ],
  });
  assert.deepEqual(revisao.rejected.map(item => item.code), ["TARGET_KEYWORD", "TARGET_KEYWORD", "TARGET_KEYWORD"]);
  assert.deepEqual(revisao.accepted.map(item => item.text), ["captação de pacientes", "pacientes que chegam sem anúncio"]);
  assert.match(LINK_ANCHOR_SYSTEM_PROMPT, /NAO e aceito/);
  assert.match(LINK_ANCHOR_SYSTEM_PROMPT, /11\. Varie/);
});

/* ============================== a tela e as fronteiras ============================== */

/** O código sem comentários: o teste estrutural não pode casar com o próprio comentário. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(linha => !linha.trimStart().startsWith("//")).join("\n");
}
const ler = (caminho: string) => semComentarios(readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8"));

test("F4 · tela · Processar links e Completar a malha abrem a prévia com o custo; confirmar roda; aprovar continua humano", () => {
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /data-testid="architect-links-process"\s*onClick=\{\(\) => abrirPreviaDosLinks\("process"\)\}/);
  assert.match(tela, /data-testid="architect-links-complete-mesh"\s*onClick=\{\(\) => abrirPreviaDosLinks\("complete"\)\}/);
  assert.match(tela, /processarLinksRef\.current = async \(\) => \{ abrirPreviaDosLinks\("process"\); \};/, "o \"Processar links de novo\" também passa pela prévia");
  assert.match(tela, /data-testid="architect-links-mesh-preview-cost"/);
  assert.match(tela, /siloMeshCallsLabel\(linksMeshPreview\.calls\)/);
  const confirmar = tela.slice(tela.indexOf("const confirmarPreviaDosLinks = "), tela.indexOf("const handleDeleteLinkEdge = async"));
  assert.match(confirmar, /void completarMalhaDoSilo\(\)/);
  assert.match(confirmar, /void processarLinks\(\)/);
  const completar = tela.slice(tela.indexOf("const completarMalhaDoSilo = async"), tela.indexOf("const confirmarPreviaDosLinks = "));
  assert.match(completar, /siloMeshCompletionOnlyAdds\(\{ approvedEdges: aprovado\.edges, workingEdges: comEstrutura\.edges \}\)/);
  assert.match(completar, /if \(!antes\.ok\)/);
  for (const proibido of ["handleApproveLinks(", "createInternalLinkGraph(", "persistInternalLinkGraph(", "status: \"approved\""]) {
    assert.equal(completar.includes(proibido), false, `Completar a malha não aprova: ${proibido}`);
  }
  assert.match(tela, /data-testid="architect-link-mesh-coverage"/);
  const ancoras = tela.slice(tela.indexOf("const generateLinkAnchors = async"), tela.indexOf("const handleDeleteLinkEdge = async"));
  assert.match(ancoras, /planLinkAnchorWork\(\{ edges: copia\.edges, approvedPairs: aprovadas \}\)/);
  assert.match(ancoras, /copia\.edges\.filter\(edge => pedidas\.has\(edge\.edgeId\)\)/, "só o que falta vai à IA");
  assert.match(ancoras, /applySiloMeshAnchorReuse\(\{/);
  assert.match(ancoras, /batchLinkAnchorRequests\(units, candidates\)/);
});

test("F4 · fronteiras: o grafo grava só artefatos do Arquiteto; nada do Minerador é lido, escrito ou excluído", () => {
  for (const caminho of ["lib/arquiteto/silo-link-mesh.ts", "lib/arquiteto/internal-link-structure.ts", "lib/arquiteto/link-anchor-ai.ts", "lib/arquiteto/link-anchor-concepts.ts"]) {
    const fonte = ler(caminho);
    assert.doesNotMatch(fonte, /minerador|supabase|fetch\(|keyword_lists|minerador_keywords|delete/i, `${caminho} é puro e não toca o Minerador`);
  }
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  for (const [inicio, fim] of [
    ["const linksStructuralUnitsOf = ", "const generateStructuralLinks = async"],
    ["const abrirPreviaDosLinks = ", "const handleDeleteLinkEdge = async"],
  ] as const) {
    const trecho = tela.slice(tela.indexOf(inicio), tela.indexOf(fim));
    assert.ok(trecho.length > 100, inicio);
    assert.doesNotMatch(trecho, /\/api\/minerador|deleteKeyword|excluir|minerador_keywords|callStrategicApi\("\/api\/minerador/i, `${inicio} não fala com o Minerador`);
  }
});
