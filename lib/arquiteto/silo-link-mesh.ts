/**
 * ===== 2026-10-14 · F4 · A MALHA DO SILO NO GRAFO DO ARQUITETO =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6,
 * §11 e §14 (F4); D1, D2 e D3, decididas pelo dono em 2026-10-14 ("sim, pode
 * sim, e do MCP também é uma boa ideia, pode implementar"). Pedido literal:
 * "tem que estar interconectado todos dentro do silo".
 *
 * O gerador (`buildStructuralLinkConnections`) grava a malha inteira. Este
 * módulo responde, só lendo, as perguntas da aba "Links internos":
 *
 *   1. A MALHA DE CADA ARTIGO (X de Y): todo artigo liga a todas as outras
 *      páginas do Silo (os irmãos, o Pilar e a SiloPage) — no corpo ou na
 *      trilha, quem decide é o Radar pelo `priority`. Y é o número dessas
 *      páginas; X, quantas o grafo já liga. À parte, as obrigatórias no corpo
 *      (Suporte → Pilar e Pilar → cada Suporte).
 *   2. LER ANTES DE BUSCAR (D4 da SDD "Arquiteto só lê"): a aresta que já tem
 *      âncora (aprovada, da IA ou de uma pessoa) fica como está; a aresta nova
 *      da malha (Suporte ↔ Suporte, artigo → SiloPage) reaproveita as âncoras
 *      que o MESMO destino já tem em outra aresta, variadas por origem; só o
 *      que não tem de onde reaproveitar vai à IA, um representante por destino.
 *   3. O CUSTO ANTES DE RODAR: as conexões que vão à IA, em lotes de 40
 *      (`batchLinkAnchorRequests`, o mesmo teto da rota).
 *   4. "COMPLETAR A MALHA" SÓ ACRESCENTA: nenhuma aresta aprovada sai nem muda.
 *
 * O grafo grava só artefatos do Arquiteto: nada aqui lê ou escreve keyword do
 * Minerador. Domínio puro: sem banco, sem rede, sem IA.
 */

import type { InternalLinkGraphEdge, InternalLinkGraphNode, InternalLinkGraphRelationType } from "./contracts.ts";
import { buildStructuralLinkConnections, type StructuralLinkConnection, type StructuralLinkUnit } from "./internal-link-structure.ts";
import { anchorCompareKey, anchorRepeatsTargetKeyword, batchLinkAnchorRequests } from "./link-anchor-ai.ts";

type Prioridade = "HIGH" | "MEDIUM" | "LOW";
const par = (edge: { sourceNodeId: string; targetNodeId: string }) => `${edge.sourceNodeId}->${edge.targetNodeId}`;

/* ============================ 1 · a malha de cada artigo ============================ */

export type SiloLinkMeshArticle = {
  nodeId: string;
  label: string;
  role: "PILAR" | "SUPORTE";
  /** Todas as outras páginas do Silo (os artigos e a SiloPage). */
  required: number;
  covered: number;
  missing: Array<{ nodeId: string; label: string }>;
  /** Obrigatórias no corpo: o Suporte → o Pilar; o Pilar → cada Suporte. */
  bodyRequired: number;
  bodyCovered: number;
  /** Quantos links de corpo (HIGH ou MEDIUM) apontam para este artigo. */
  inboundBody: number;
};

export type SiloLinkMeshCoverage = {
  articles: SiloLinkMeshArticle[];
  required: number;
  covered: number;
  bodyRequired: number;
  bodyCovered: number;
  byPriority: Record<Prioridade, number>;
  /** As relações entre Suportes que o grafo tem (a parte nova da malha). */
  supportToSupport: number;
  /** §6.3 · os artigos que recebem menos de 3 links de corpo (o Pilar e 2 irmãos), quando o Silo tem como dar: "órfãos no corpo". */
  bodyOrphans: Array<{ nodeId: string; label: string; inboundBody: number }>;
  complete: boolean;
  /** "Malha: X de Y …" para o painel. */
  text: string;
};

const rotuloDe = (node: Pick<InternalLinkGraphNode, "nodeId" | "snapshot">) => node.snapshot?.label || node.nodeId;

/** A malha do Silo como o grafo (aprovado ou cópia) a tem: X de Y por artigo. */
export function summarizeSiloLinkMesh(input: {
  nodes: readonly Pick<InternalLinkGraphNode, "nodeId" | "nodeType" | "architecturalRole" | "snapshot">[];
  edges: readonly Pick<InternalLinkGraphEdge, "sourceNodeId" | "targetNodeId" | "relationType" | "priority">[];
}): SiloLinkMeshCoverage {
  const artigos = input.nodes.filter(node => node.nodeType === "ARTICLE_DNA");
  const pilar = artigos.find(node => node.architecturalRole === "PILAR") || null;
  const paginas = input.nodes.filter(node => node.nodeType === "ARTICLE_DNA" || node.nodeType === "SILO_PAGE");
  const pares = new Set(input.edges.map(par));
  const byPriority: Record<Prioridade, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const edge of input.edges) byPriority[edge.priority] += 1;
  const entradaNoCorpo = new Map<string, number>();
  for (const edge of input.edges) {
    if (edge.priority === "LOW") continue;
    if (!artigos.some(node => node.nodeId === edge.sourceNodeId)) continue;
    entradaNoCorpo.set(edge.targetNodeId, (entradaNoCorpo.get(edge.targetNodeId) || 0) + 1);
  }
  const articles: SiloLinkMeshArticle[] = artigos.map((node): SiloLinkMeshArticle => {
    const ehPilar = Boolean(pilar && node.nodeId === pilar.nodeId);
    const destinos = paginas.filter(outra => outra.nodeId !== node.nodeId);
    const missing = destinos.filter(destino => !pares.has(`${node.nodeId}->${destino.nodeId}`)).map(destino => ({ nodeId: destino.nodeId, label: rotuloDe(destino) }));
    const doCorpo = !pilar ? [] : ehPilar ? artigos.filter(outra => outra.nodeId !== node.nodeId) : [pilar];
    return {
      nodeId: node.nodeId,
      label: rotuloDe(node),
      role: ehPilar ? "PILAR" : "SUPORTE",
      required: destinos.length,
      covered: destinos.length - missing.length,
      missing,
      bodyRequired: doCorpo.length,
      bodyCovered: doCorpo.filter(destino => pares.has(`${node.nodeId}->${destino.nodeId}`)).length,
      inboundBody: entradaNoCorpo.get(node.nodeId) || 0,
    };
  }).sort((a, b) => Number(b.role === "PILAR") - Number(a.role === "PILAR"));
  const required = articles.reduce((total, item) => total + item.required, 0);
  const covered = articles.reduce((total, item) => total + item.covered, 0);
  const bodyRequired = articles.reduce((total, item) => total + item.bodyRequired, 0);
  const bodyCovered = articles.reduce((total, item) => total + item.bodyCovered, 0);
  const supportToSupport = input.edges.filter(edge => edge.relationType === "SUPPORT_TO_SUPPORT").length;
  const complete = required > 0 && covered === required;
  const minimoDeEntrada = Math.min(3, Math.max(0, artigos.length - 1));
  const bodyOrphans = articles
    .filter(item => item.inboundBody < minimoDeEntrada)
    .map(item => ({ nodeId: item.nodeId, label: item.label, inboundBody: item.inboundBody }));
  return {
    articles, required, covered, bodyRequired, bodyCovered, byPriority, supportToSupport, bodyOrphans, complete,
    text: required
      ? `Malha do Silo: ${covered} de ${required} ligações entre as páginas do Silo (cada artigo liga a todas as outras, no corpo ou na trilha); obrigatórias no corpo (Suporte → Pilar e Pilar → cada Suporte): ${bodyCovered} de ${bodyRequired}.`
      : "Malha do Silo: o grafo ainda não tem artigos.",
  };
}

/* ============================ 2 · ler antes de buscar ============================ */

type ArestaDeAncora = Pick<InternalLinkGraphEdge, "edgeId" | "sourceNodeId" | "targetNodeId" | "relationType" | "anchorConcepts" | "origin" | "provenance">;

/** A aresta nova da malha (D1): entre Suportes ou do artigo para a SiloPage. As do esqueleto vão à IA como sempre. */
export const isSiloMeshRelation = (relationType: InternalLinkGraphRelationType | string) =>
  relationType === "SUPPORT_TO_SUPPORT" || relationType === "ARTICLE_TO_SILO_PAGE";

/**
 * A aresta já tem âncora que se reaproveita? Sim quando o par está no grafo
 * aprovado (as âncoras aprovadas valem como estão) ou quando a IA ou uma pessoa
 * já as escreveu. A partida determinística (`origin: "system"`, fora do
 * aprovado) não conta: é ponto de partida, não âncora decidida.
 */
export function linkAnchorEdgeHasAnchors(edge: Pick<ArestaDeAncora, "sourceNodeId" | "targetNodeId" | "origin" | "anchorConcepts">, approvedPairs: ReadonlySet<string>): boolean {
  if (!edge.anchorConcepts?.length) return false;
  return approvedPairs.has(par(edge)) || edge.origin === "ai" || edge.origin === "human";
}

export type LinkAnchorWorkPlan = {
  /** Arestas que ficam como estão (âncora aprovada, da IA ou humana). */
  kept: string[];
  /** Arestas da malha que reaproveitam a âncora do mesmo destino, sem custo. */
  reuse: string[];
  /** Arestas que vão à IA (o esqueleto sem âncora e um representante por destino sem âncora reaproveitável). */
  ask: string[];
  /** Arestas da malha que esperam a resposta da IA para o seu destino e então reaproveitam. */
  reuseAfterAi: string[];
};

/** Quem doa âncora para um destino: a aresta aprovada primeiro, depois a da IA e a humana; o Pilar e a SiloPage antes dos irmãos. */
function doadorPara(destino: string, arestas: readonly ArestaDeAncora[], approvedPairs: ReadonlySet<string>): ArestaDeAncora | null {
  const ordem = (edge: ArestaDeAncora) => (approvedPairs.has(par(edge)) ? 0 : 1) * 10
    + (edge.relationType === "PILLAR_TO_SUPPORT" || edge.relationType === "SUPPORT_TO_PILLAR" ? 0 : edge.relationType === "SILO_PAGE_TO_ARTICLE" ? 1 : edge.relationType === "ARTICLE_TO_SILO_PAGE" ? 2 : 3);
  return arestas
    .filter(edge => edge.targetNodeId === destino && linkAnchorEdgeHasAnchors(edge, approvedPairs))
    .sort((a, b) => ordem(a) - ordem(b) || a.edgeId.localeCompare(b.edgeId))[0] ?? null;
}

/** O plano das âncoras de uma cópia: o que fica, o que reaproveita e o que vai à IA. Puro. */
export function planLinkAnchorWork(input: {
  edges: readonly ArestaDeAncora[];
  approvedPairs?: ReadonlySet<string>;
}): LinkAnchorWorkPlan {
  const aprovados = input.approvedPairs ?? new Set<string>();
  const kept: string[] = [];
  const reuse: string[] = [];
  const ask: string[] = [];
  const reuseAfterAi: string[] = [];
  const destinosPedidos = new Set<string>();
  /* O esqueleto sem âncora vai à IA primeiro: o destino dele passa a ter doador. */
  for (const edge of input.edges) {
    if (linkAnchorEdgeHasAnchors(edge, aprovados)) { kept.push(edge.edgeId); continue; }
    if (isSiloMeshRelation(edge.relationType)) continue;
    ask.push(edge.edgeId);
    destinosPedidos.add(edge.targetNodeId);
  }
  for (const edge of input.edges) {
    if (linkAnchorEdgeHasAnchors(edge, aprovados) || !isSiloMeshRelation(edge.relationType)) continue;
    if (doadorPara(edge.targetNodeId, input.edges, aprovados)) { reuse.push(edge.edgeId); continue; }
    if (destinosPedidos.has(edge.targetNodeId)) { reuseAfterAi.push(edge.edgeId); continue; }
    /* Nenhuma aresta do destino tem âncora nem vai à IA: este é o representante dele. */
    ask.push(edge.edgeId);
    destinosPedidos.add(edge.targetNodeId);
  }
  return { kept, reuse, ask, reuseAfterAi };
}

/**
 * Os conceitos reaproveitados para UMA origem: sem a keyword do destino (a
 * régua natural), sem repetir dentro da aresta, e variados por origem — até 3
 * conceitos, a partir de uma posição que muda de origem para origem, para que
 * dois irmãos não recebam o mesmo conjunto enquanto houver conceitos.
 */
export function siloMeshReusedConcepts(input: {
  donorConcepts: readonly string[];
  targetKeywords?: readonly (string | null | undefined)[];
  /** A posição desta origem entre as que reaproveitam do mesmo destino. */
  index: number;
  size?: number;
}): string[] {
  const unicos: string[] = [];
  for (const conceito of input.donorConcepts) {
    const limpo = typeof conceito === "string" ? conceito.trim() : "";
    if (!limpo || anchorRepeatsTargetKeyword(limpo, input.targetKeywords || [])) continue;
    if (!unicos.some(atual => anchorCompareKey(atual) === anchorCompareKey(limpo))) unicos.push(limpo);
  }
  /* Se a régua tirar tudo, fica o que o doador tinha: a régua do Radar escolhe a âncora final. */
  const base = unicos.length ? unicos : [...new Set(input.donorConcepts.map(item => item.trim()).filter(Boolean))];
  const tamanho = Math.min(base.length, Math.max(1, input.size ?? 3));
  if (base.length <= tamanho) return base;
  const inicio = ((input.index % base.length) + base.length) % base.length;
  return Array.from({ length: tamanho }, (_, passo) => base[(inicio + passo) % base.length]);
}

/**
 * Aplica o reaproveitamento: cada aresta da malha sem âncora recebe os
 * conceitos do doador do mesmo destino (variados por origem), com a
 * proveniência dita. Devolve as arestas na mesma ordem.
 */
export function applySiloMeshAnchorReuse<E extends ArestaDeAncora>(input: {
  edges: readonly E[];
  approvedPairs?: ReadonlySet<string>;
  /** As keywords de cada destino (por nodeId), que a âncora não repete. */
  targetKeywords?: ReadonlyMap<string, readonly string[]>;
  graphId: string;
}): { edges: E[]; reused: number; pending: string[] } {
  const aprovados = input.approvedPairs ?? new Set<string>();
  const indicePorDestino = new Map<string, number>();
  let reused = 0;
  const pending: string[] = [];
  const edges = input.edges.map(edge => {
    if (linkAnchorEdgeHasAnchors(edge, aprovados) || !isSiloMeshRelation(edge.relationType)) return edge;
    const doador = doadorPara(edge.targetNodeId, input.edges, aprovados);
    if (!doador) { pending.push(edge.edgeId); return edge; }
    const indice = indicePorDestino.get(edge.targetNodeId) || 0;
    indicePorDestino.set(edge.targetNodeId, indice + 1);
    const conceitos = siloMeshReusedConcepts({ donorConcepts: doador.anchorConcepts, targetKeywords: input.targetKeywords?.get(edge.targetNodeId), index: indice });
    if (!conceitos.length) { pending.push(edge.edgeId); return edge; }
    reused += 1;
    return {
      ...edge,
      anchorConcepts: conceitos,
      origin: doador.origin === "human" || doador.origin === "ai" ? "ai" : doador.origin,
      provenance: { source: "link-anchor-reuse", references: [input.graphId, doador.edgeId] },
    };
  });
  return { edges, reused, pending };
}

/* ============================ 3 · o custo antes de rodar ============================ */

export type LinkAnchorCostEstimate = {
  /** Chamadas de IA (lotes de até 40 conexões e 40 páginas, o teto da rota). */
  calls: number;
  /** Conexões que vão à IA (a cota da marca conta conexões). */
  connections: number;
};

/** O custo das âncoras: os lotes que `batchLinkAnchorRequests` montaria com as conexões pedidas. */
export function estimateLinkAnchorCost(input: {
  units: readonly { ref: string }[];
  candidates: readonly { sourceRef: string; targetRef: string }[];
}): LinkAnchorCostEstimate {
  const lotes = batchLinkAnchorRequests(input.units, input.candidates);
  return { calls: lotes.length, connections: lotes.reduce((total, lote) => total + lote.candidates.length, 0) };
}

/** "N chamada(s) de IA" — o texto do botão e da prévia. */
export const siloMeshCallsLabel = (calls: number) => (calls === 0 ? "0 chamada de IA" : calls === 1 ? "1 chamada de IA" : `${calls} chamadas de IA`);

/* ============================ 4 · a prévia e o "só acrescenta" ============================ */

export type SiloLinkMeshPreview = {
  /** Todas as conexões que a malha pede para a composição atual. */
  connections: number;
  /** As que faltam na cópia (ou no aprovado) e serão acrescentadas. */
  additions: StructuralLinkConnection[];
  additionsByRelation: Partial<Record<InternalLinkGraphRelationType, number>>;
  /** Arestas que já existem e ficam como estão. */
  existing: number;
  edgesAfter: number;
  anchors: { kept: number; reuse: number; ask: number; reuseAfterAi: number };
  cost: LinkAnchorCostEstimate;
  /** Antes → depois, como a malha de cada artigo fica. */
  coverageBefore: SiloLinkMeshCoverage;
  coverageAfter: SiloLinkMeshCoverage;
};

/**
 * A PRÉVIA de "Processar links" e de "Completar a malha do Silo": o que entra,
 * o que fica, o que reaproveita âncora e o que vai à IA — antes de qualquer
 * gravação ou chamada. A simulação usa as mesmas funções da execução.
 */
export function previewSiloLinkMesh(input: {
  units: readonly StructuralLinkUnit[];
  nodes: readonly Pick<InternalLinkGraphNode, "nodeId" | "nodeType" | "architecturalRole" | "snapshot">[];
  /** As arestas da cópia (ou, sem cópia, as do aprovado levadas à composição atual). */
  existingEdges: readonly ArestaDeAncora[];
  approvedPairs?: ReadonlySet<string>;
}): SiloLinkMeshPreview {
  const conexoes = buildStructuralLinkConnections(input.units);
  const existentes = new Set(input.existingEdges.map(par));
  const additions = conexoes.filter(conexao => !existentes.has(par(conexao)));
  const additionsByRelation: SiloLinkMeshPreview["additionsByRelation"] = {};
  for (const item of additions) additionsByRelation[item.relationType] = (additionsByRelation[item.relationType] || 0) + 1;
  const simuladas: Array<ArestaDeAncora & { priority: Prioridade }> = [
    ...input.existingEdges.map(edge => ({ ...edge, priority: ((edge as { priority?: Prioridade }).priority ?? "MEDIUM") as Prioridade })),
    ...additions.map((conexao, indice) => ({
      edgeId: `previa:${indice}`,
      sourceNodeId: conexao.sourceNodeId,
      targetNodeId: conexao.targetNodeId,
      relationType: conexao.relationType,
      priority: conexao.priority,
      anchorConcepts: ["partida"],
      origin: "system" as const,
      provenance: { source: "structural-derivation", references: [] },
    })),
  ];
  const plano = planLinkAnchorWork({ edges: simuladas, approvedPairs: input.approvedPairs });
  const porId = new Map(simuladas.map(edge => [edge.edgeId, edge]));
  const pedidas = plano.ask.map(id => porId.get(id)!).map(edge => ({ sourceRef: edge.sourceNodeId, targetRef: edge.targetNodeId }));
  return {
    connections: conexoes.length,
    additions,
    additionsByRelation,
    existing: input.existingEdges.length,
    edgesAfter: input.existingEdges.length + additions.length,
    anchors: { kept: plano.kept.length, reuse: plano.reuse.length, ask: plano.ask.length, reuseAfterAi: plano.reuseAfterAi.length },
    cost: estimateLinkAnchorCost({ units: input.nodes.map(node => ({ ref: node.nodeId })), candidates: pedidas }),
    coverageBefore: summarizeSiloLinkMesh({ nodes: input.nodes, edges: input.existingEdges.map(edge => ({ ...edge, priority: ((edge as { priority?: Prioridade }).priority ?? "MEDIUM") as Prioridade })) }),
    coverageAfter: summarizeSiloLinkMesh({ nodes: input.nodes, edges: simuladas }),
  };
}

export type SiloMeshOnlyAddsCheck = {
  ok: boolean;
  /** Arestas aprovadas que sumiram da cópia. */
  removed: string[];
  /** Arestas aprovadas que mudaram (tipo, prioridade, conceitos ou motivo). */
  changed: string[];
  added: number;
};

const assinatura = (edge: Pick<InternalLinkGraphEdge, "relationType" | "priority" | "anchorConcepts" | "reason">) =>
  JSON.stringify([edge.relationType, edge.priority, [...edge.anchorConcepts].map(item => item.trim()).sort(), edge.reason]);

/**
 * "COMPLETAR A MALHA" SÓ ACRESCENTA: toda aresta aprovada continua na cópia,
 * com o mesmo tipo, prioridade, conceitos e motivo. Quem chama recusa gravar
 * quando `ok` é falso.
 */
export function siloMeshCompletionOnlyAdds(input: {
  approvedEdges: readonly Pick<InternalLinkGraphEdge, "sourceNodeId" | "targetNodeId" | "relationType" | "priority" | "anchorConcepts" | "reason">[];
  workingEdges: readonly Pick<InternalLinkGraphEdge, "sourceNodeId" | "targetNodeId" | "relationType" | "priority" | "anchorConcepts" | "reason">[];
}): SiloMeshOnlyAddsCheck {
  const naCopia = new Map(input.workingEdges.map(edge => [par(edge), edge]));
  const removed: string[] = [];
  const changed: string[] = [];
  for (const aprovada of input.approvedEdges) {
    const atual = naCopia.get(par(aprovada));
    if (!atual) { removed.push(par(aprovada)); continue; }
    if (assinatura(atual) !== assinatura(aprovada)) changed.push(par(aprovada));
  }
  const aprovadas = new Set(input.approvedEdges.map(par));
  return { ok: !removed.length && !changed.length, removed, changed, added: input.workingEdges.filter(edge => !aprovadas.has(par(edge))).length };
}
