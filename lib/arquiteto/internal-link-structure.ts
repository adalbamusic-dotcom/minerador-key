/**
 * AS CONEXÕES QUE A ARQUITETURA JÁ DECIDIU.
 *
 * Um Silo consolidado não deixa em aberto quem aponta para quem no esqueleto:
 * a SiloPage é a raiz do universo, o Pilar responde a intenção macro e os
 * Suportes aprofundam recortes dela. Essas relações são consequência da
 * estrutura que um humano confirmou — derivá-las é leitura, não sugestão.
 *
 * O que este módulo NÃO faz, de propósito:
 *
 * - Suporte ↔ Suporte. Um suporte só linka para outro quando o assunto pede,
 *   e isso é julgamento editorial sobre o conteúdo, não consequência do
 *   organograma. Gerar o produto cartesiano encheria o grafo de arestas que
 *   ninguém decidiu e afogaria as que importam.
 * - Âncora. O conceito de âncora descreve o DESTINO e vem de outro lugar:
 *   aqui só se decide a direção e o motivo estrutural dela.
 *
 * Um Silo RASO — SiloPage e Pilar, sem suporte — continua tendo esqueleto:
 * são duas páginas linkáveis, e a relação entre elas existe. Falta de
 * profundidade é dívida registrada no SiloDNA, não ausência de arquitetura.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

import type { InternalLinkGraphRelationType } from "./contracts.ts";

export type StructuralLinkUnit = {
  nodeId: string;
  nodeType: "SILO_PAGE" | "ARTICLE_DNA";
  architecturalRole: "PILAR" | "SUPORTE" | "REFORCO" | "OUTRO" | null;
  label: string;
};

export type StructuralLinkConnection = {
  sourceNodeId: string;
  targetNodeId: string;
  relationType: InternalLinkGraphRelationType;
  /** Por que esta direção existe — em linguagem de arquitetura, não de código. */
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
};

export function buildStructuralLinkConnections(
  units: readonly StructuralLinkUnit[],
): StructuralLinkConnection[] {
  const siloPage = units.find(unit => unit.nodeType === "SILO_PAGE") || null;
  const pilar = units.find(unit => unit.nodeType === "ARTICLE_DNA" && unit.architecturalRole === "PILAR") || null;
  const suportes = units.filter(unit => unit.nodeType === "ARTICLE_DNA" && unit.nodeId !== pilar?.nodeId);

  const conexoes: StructuralLinkConnection[] = [];

  if (siloPage && pilar) {
    conexoes.push({
      sourceNodeId: siloPage.nodeId,
      targetNodeId: pilar.nodeId,
      relationType: "SILO_PAGE_TO_ARTICLE",
      reason: `A raiz do Silo abre pelo Pilar: é "${pilar.label}" que responde à intenção macro do universo.`,
      priority: "HIGH",
    });
  }

  if (siloPage) {
    for (const suporte of suportes) {
      conexoes.push({
        sourceNodeId: siloPage.nodeId,
        targetNodeId: suporte.nodeId,
        relationType: "SILO_PAGE_TO_ARTICLE",
        reason: `A raiz lista "${suporte.label}" como recorte do universo que ela organiza.`,
        priority: "MEDIUM",
      });
    }
  }

  if (siloPage && pilar) {
    conexoes.push({
      sourceNodeId: pilar.nodeId,
      targetNodeId: siloPage.nodeId,
      relationType: "ARTICLE_TO_SILO_PAGE",
      reason: `O Pilar devolve o leitor à raiz do Silo, que organiza o universo em volta de "${pilar.label}".`,
      priority: "MEDIUM",
    });
  }

  if (pilar) {
    for (const suporte of suportes) {
      conexoes.push({
        sourceNodeId: pilar.nodeId,
        targetNodeId: suporte.nodeId,
        relationType: "PILLAR_TO_SUPPORT",
        reason: `O Pilar abre a verticalização e entrega o leitor ao recorte de "${suporte.label}".`,
        priority: "HIGH",
      });
      conexoes.push({
        sourceNodeId: suporte.nodeId,
        targetNodeId: pilar.nodeId,
        relationType: "SUPPORT_TO_PILLAR",
        reason: `O suporte devolve o leitor a "${pilar.label}", que lidera o Silo.`,
        priority: "HIGH",
      });
    }
  }

  return conexoes;
}

/**
 * O que falta para o esqueleto existir.
 *
 * Sem Pilar não há verticalização a derivar, e sem SiloPage não há raiz: dizer
 * isso é mais útil do que devolver uma lista vazia e deixar a pessoa achar que
 * o Silo simplesmente não tem relações.
 */
export function structuralLinkBlockers(units: readonly StructuralLinkUnit[]): string[] {
  const blockers: string[] = [];
  if (!units.some(unit => unit.nodeType === "SILO_PAGE")) {
    blockers.push("O grafo não tem a SiloPage: sem raiz não há de onde abrir o universo.");
  }
  if (!units.some(unit => unit.nodeType === "ARTICLE_DNA" && unit.architecturalRole === "PILAR")) {
    blockers.push("O grafo não tem Pilar: a verticalização parte dele, e ele é decisão humana da etapa Silos.");
  }
  /*
   * O grafo depende de PÁGINAS LINKÁVEIS, não de Articles de suporte.
   *
   * Exigir dois Articles confundia "Silo sem profundidade" com "Silo sem
   * arquitetura": um Silo raso tem SiloPage e Pilar, ou seja, duas páginas
   * que se linkam de verdade. Recusar o grafo ali deixava o Article fora do
   * Radar por uma dívida que já estava registrada em outro lugar — e a
   * rasura vira impedimento em vez de continuar sendo dívida.
   */
  if (units.length < 2) {
    blockers.push("O Silo tem uma única página: não há duas unidades para relacionar.");
  }
  return blockers;
}

/* --------------------------- o que a mesa precisa ver --------------------- */

/**
 * §7/§8 — ZERO ARESTA É RESULTADO POSSÍVEL, MAS PRECISA DE PROVA.
 *
 * A homologação encontrou 6 nós e 0 arestas com a frase "o Silo não tem duas
 * páginas linkáveis" — que era falsa em dois níveis: havia seis páginas, e a
 * portaria estrutural tinha passado. As catorze conexões chegaram a ser
 * derivadas e foram descartadas uma a uma, em silêncio, por um motivo que a
 * mensagem não mencionava.
 *
 * Daí esta função: ela não decide nada: conta o que aconteceu e NOMEIA cada
 * página descartada e cada par recusado. Zero arestas continua sendo um
 * desfecho legítimo — só não pode mais ser um desfecho mudo.
 *
 * Domínio puro.
 */
export type BlockedLinkPage = { nodeId: string; label: string; reason: string };
export type RefusedLinkPair = { sourceNodeId: string; targetNodeId: string; reason: string };

export type StructuralLinkDerivationReadout = {
  linkNodes: number;
  linkablePages: number;
  blockedPages: BlockedLinkPage[];
  edgesProposed: number;
  /** Páginas linkáveis que não entraram em nenhuma aresta. */
  orphans: { nodeId: string; label: string }[];
  /** Pares estruturais que existiam e não viraram aresta, com o motivo. */
  refusedPairs: RefusedLinkPair[];
  readyToConfirm: boolean;
  /** A linha de contadores. Nenhum zero é omitido. */
  readout: string;
  /** A mesma coisa em português. */
  summary: string;
};

export function describeStructuralLinkDerivation(input: {
  units: readonly StructuralLinkUnit[];
  /** Nós que não podem participar do grafo, com o motivo de cada um. */
  blockedPages?: readonly BlockedLinkPage[];
  /** As conexões que a arquitetura propôs, antes de qualquer filtro. */
  connections: readonly StructuralLinkConnection[];
  /** As arestas que sobreviveram — já com conceito de âncora. */
  edges: readonly { sourceNodeId: string; targetNodeId: string }[];
  /** Impedimentos da portaria estrutural, quando houver. */
  blockers?: readonly string[];
}): StructuralLinkDerivationReadout {
  const bloqueadas = [...(input.blockedPages || [])];
  const bloqueadosPorId = new Map(bloqueadas.map(item => [item.nodeId, item]));
  const rotuloDe = (nodeId: string) => input.units.find(unit => unit.nodeId === nodeId)?.label || nodeId;

  const arestas = new Set(input.edges.map(edge => `${edge.sourceNodeId}->${edge.targetNodeId}`));
  const refusedPairs: RefusedLinkPair[] = input.connections
    .filter(conexao => !arestas.has(`${conexao.sourceNodeId}->${conexao.targetNodeId}`))
    .map(conexao => {
      const origem = bloqueadosPorId.get(conexao.sourceNodeId);
      const destino = bloqueadosPorId.get(conexao.targetNodeId);
      return {
        sourceNodeId: conexao.sourceNodeId,
        targetNodeId: conexao.targetNodeId,
        /*
         * O motivo é o da PÁGINA, quando existe. Sem página bloqueada e sem
         * aresta, o par já estava no grafo — dizer "recusado" ali seria
         * inventar um impedimento que não houve.
         */
        reason: destino
          ? `${rotuloDe(conexao.targetNodeId)}: ${destino.reason}`
          : origem
            ? `${rotuloDe(conexao.sourceNodeId)}: ${origem.reason}`
            : "A relação já existe na working copy.",
      };
    });

  const participantes = new Set(input.edges.flatMap(edge => [edge.sourceNodeId, edge.targetNodeId]));
  const orphans = input.units
    .filter(unit => !participantes.has(unit.nodeId) && !bloqueadosPorId.has(unit.nodeId))
    .map(unit => ({ nodeId: unit.nodeId, label: unit.label }));

  const linkablePages = input.units.length - bloqueadas.length;
  const readyToConfirm = !(input.blockers || []).length && bloqueadas.length === 0 && input.edges.length > 0;

  return {
    linkNodes: input.units.length,
    linkablePages,
    blockedPages: bloqueadas,
    edgesProposed: input.edges.length,
    orphans,
    refusedPairs,
    readyToConfirm,
    readout: [
      `LINK_NODES = ${input.units.length}`,
      `LINKABLE_PAGES = ${linkablePages}`,
      `EDGES_PROPOSED = ${input.edges.length}`,
      `ORPHANS = ${orphans.length}`,
      `BLOCKED_PAGES = ${bloqueadas.length}`,
      `GRAPH_READY_TO_CONFIRM = ${readyToConfirm ? "YES" : "NO"}`,
    ].join(" · "),
    summary: input.edges.length
      ? `${input.edges.length} relação(ões) estrutural(is) proposta(s) entre ${linkablePages} páginas.`
      : bloqueadas.length
        ? `Nenhuma relação foi proposta: ${bloqueadas.length} página(s) bloqueada(s) — ${bloqueadas.map(item => `${item.label}: ${item.reason}`).join(" · ")}`
        : refusedPairs.length
          ? `Nenhuma relação NOVA foi proposta entre ${linkablePages} páginas: ${refusedPairs.map(item => `${rotuloDe(item.sourceNodeId)} → ${rotuloDe(item.targetNodeId)} (${item.reason})`).join(" · ")}`
          : `Nenhuma relação estrutural existe entre as ${linkablePages} página(s) deste Silo.`,
  };
}
