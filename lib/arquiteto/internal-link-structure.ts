/**
 * AS CONEXÕES QUE A ARQUITETURA JÁ DECIDIU.
 *
 * Um Silo consolidado não deixa em aberto quem aponta para quem no esqueleto:
 * a SiloPage é a raiz do universo, o Pilar responde a intenção macro e os
 * Suportes aprofundam recortes dela. Essas relações são consequência da
 * estrutura que um humano confirmou — derivá-las é leitura, não sugestão.
 *
 * 2026-10-14 · F4 · A MALHA DO SILO (SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md`,
 * D1, D2 e D3, decididas pelo dono: "tem que estar interconectado todos dentro
 * do silo"). A decisão escrita aqui antes — "Suporte ↔ Suporte não; o produto
 * cartesiano encheria o grafo de arestas que ninguém decidiu" — foi REVERTIDA
 * pela D1. O gerador grava a malha inteira, e quem diz o lugar de cada link é o
 * `priority` com sentido (D2, sem migration):
 *
 * - HIGH = obrigatório no corpo: Suporte → Pilar, Pilar → cada Suporte,
 *   SiloPage → Pilar;
 * - MEDIUM = no corpo quando a seção trata do destino, senão a trilha
 *   "Continue no Silo": Suporte ↔ Suporte de assunto próximo, SiloPage →
 *   Suporte, Pilar → SiloPage;
 * - LOW = trilha: Suporte ↔ Suporte de assunto distante e Suporte → SiloPage.
 *
 * A afinidade entre irmãos é determinística (sem IA): os termos de conteúdo
 * que dois Suportes dividem (principal, complementares e Assunto), fora os que
 * metade ou mais do Silo divide (o cenário), e a mesma faceta do plano quando o
 * Silo tem mais de uma. Silo de N artigos: 2 + 3(N−1) + (N−1)(N−2) + (N−1)
 * conexões — 72 com 8, 930 com 30 (o contrato não tem teto).
 *
 * O que este módulo NÃO faz, de propósito:
 *
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
  /** 2026-10-14 · F4 · os termos do artigo para a afinidade entre irmãos (principal, complementares, Assunto). Sem eles, o rótulo. */
  terms?: readonly (string | null | undefined)[] | null;
  /** 2026-10-14 · F4 · a faceta do Silo (cor ou grupo do plano declarado); só pesa quando o Silo tem mais de uma. */
  facet?: string | null;
};

export type StructuralLinkConnection = {
  sourceNodeId: string;
  targetNodeId: string;
  relationType: InternalLinkGraphRelationType;
  /** Por que esta direção existe — em linguagem de arquitetura, não de código. */
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
};

/* ============================ a afinidade (F4, D2) ============================ */

const SEM_PESO = new Set([
  "para", "como", "sobre", "mais", "pelo", "pela", "pelos", "pelas", "entre", "quando", "onde", "qual", "quais", "isso", "esse", "essa",
  "este", "esta", "seus", "suas", "voce", "fazer", "melhor", "melhores", "guia", "dicas", "tudo", "todo", "toda", "todos", "todas", "sem",
  "com", "que", "nao", "uma", "umas", "dos", "das", "nos", "nas", "aos", "vale", "pena", "qual",
]);

/** A raiz de um termo para a afinidade: sem acento, caixa baixa, as 5 primeiras letras ("captação" e "captar" → "capta"). */
function raizDe(palavra: string): string {
  return palavra.length > 5 ? palavra.slice(0, 5) : palavra;
}

/** As raízes de conteúdo de um texto, com a primeira palavra que deu cada raiz (para o motivo legível). */
function raizesDe(textos: readonly (string | null | undefined)[]): Map<string, string> {
  const saida = new Map<string, string>();
  for (const texto of textos) {
    const palavras = (texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/);
    const originais = (texto || "").toLowerCase().split(/[^\p{L}\p{N}]+/u);
    palavras.forEach((palavra, indice) => {
      if (palavra.length < 4 || SEM_PESO.has(palavra)) return;
      const raiz = raizDe(palavra);
      if (!saida.has(raiz)) saida.set(raiz, originais[indice] || palavra);
    });
  }
  return saida;
}

export type StructuralLinkSiblingAffinity = {
  /** Os termos de conteúdo que os dois dividem (a palavra como aparece), fora o cenário do Silo. */
  shared: string[];
  sameFacet: boolean;
  score: number;
  priority: "MEDIUM" | "LOW";
};

/**
 * A AFINIDADE ENTRE DOIS SUPORTES (D2, §6.2). Determinística, sem IA:
 *   - os termos de conteúdo que eles dividem (principal, complementares e
 *     Assunto; sem os termos, o rótulo), fora as raízes que metade ou mais dos
 *     Suportes divide quando o Silo tem 4 ou mais (o cenário do Silo, que não
 *     distingue ninguém);
 *   - a mesma faceta do plano, quando o Silo tem mais de uma.
 * Afinidade ≥ 1 = MEDIUM (no corpo quando a seção trata do irmão); 0 = LOW (trilha).
 * Simétrica: A → B e B → A recebem o mesmo `priority`.
 */
export function structuralLinkSiblingAffinities(supports: readonly StructuralLinkUnit[]): Map<string, StructuralLinkSiblingAffinity> {
  const raizes = new Map(supports.map(unit => [unit.nodeId, raizesDe(unit.terms?.length ? [unit.label, ...unit.terms] : [unit.label])]));
  const cenario = new Set<string>();
  if (supports.length >= 4) {
    const minimo = Math.max(2, Math.ceil(supports.length / 2));
    const contagem = new Map<string, number>();
    for (const mapa of raizes.values()) for (const raiz of mapa.keys()) contagem.set(raiz, (contagem.get(raiz) || 0) + 1);
    for (const [raiz, quantos] of contagem) if (quantos >= minimo) cenario.add(raiz);
  }
  const facetas = new Set(supports.map(unit => (unit.facet || "").trim()).filter(Boolean));
  const facetaPesa = facetas.size > 1;
  const saida = new Map<string, StructuralLinkSiblingAffinity>();
  for (const a of supports) {
    for (const b of supports) {
      if (a.nodeId === b.nodeId) continue;
      const deA = raizes.get(a.nodeId) || new Map<string, string>();
      const deB = raizes.get(b.nodeId) || new Map<string, string>();
      const shared = [...deA.keys()].filter(raiz => !cenario.has(raiz) && deB.has(raiz)).map(raiz => deA.get(raiz) as string);
      const sameFacet = facetaPesa && Boolean(a.facet && a.facet.trim() && a.facet.trim() === (b.facet || "").trim());
      const score = shared.length + (sameFacet ? 1 : 0);
      saida.set(`${a.nodeId}->${b.nodeId}`, { shared, sameFacet, score, priority: score >= 1 ? "MEDIUM" : "LOW" });
    }
  }
  return saida;
}

/** Quantas conexões a malha de um Silo tem (SiloPage + N artigos, 1 Pilar): 2 + 3(N−1) + (N−1)(N−2) + (N−1). */
export function structuralLinkMeshConnectionCount(articles: number): number {
  if (articles < 1) return 0;
  const suportes = articles - 1;
  return 2 + 3 * suportes + suportes * (suportes - 1) + suportes;
}

export type StructuralLinkOptions = {
  /**
   * 2026-10-14 · F4 · D1 · a malha do Silo (Suporte ↔ Suporte e Suporte → SiloPage).
   * Padrão: sim. `false` devolve só o esqueleto (SiloPage, Pilar e Suportes), o
   * de antes — usado para medir o lote de âncoras que vai à IA.
   */
  mesh?: boolean;
};

export function buildStructuralLinkConnections(
  units: readonly StructuralLinkUnit[],
  options: StructuralLinkOptions = {},
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

  if (options.mesh === false) return conexoes;

  /*
   * 2026-10-14 · F4 · D1 · A MALHA: todo Suporte volta à SiloPage (LOW, a
   * trilha) e liga a cada irmão (MEDIUM quando tratam de assunto próximo, LOW
   * no resto). Só com Pilar decidido: sem ele ninguém é Suporte de verdade.
   */
  if (pilar && siloPage) {
    for (const suporte of suportes) {
      conexoes.push({
        sourceNodeId: suporte.nodeId,
        targetNodeId: siloPage.nodeId,
        relationType: "ARTICLE_TO_SILO_PAGE",
        reason: `O suporte devolve o leitor à raiz do Silo, o índice de todos os artigos em volta de "${pilar.label}": vai à trilha "Continue no Silo".`,
        priority: "LOW",
      });
    }
  }
  if (pilar && suportes.length > 1) {
    const afinidades = structuralLinkSiblingAffinities(suportes);
    for (const origem of suportes) {
      for (const destino of suportes) {
        if (origem.nodeId === destino.nodeId) continue;
        const afinidade = afinidades.get(`${origem.nodeId}->${destino.nodeId}`);
        const proximo = afinidade?.priority === "MEDIUM";
        const motivo = afinidade?.shared.length
          ? `tratam de assunto próximo (${afinidade.shared.slice(0, 3).join(", ")})`
          : afinidade?.sameFacet ? "estão na mesma faceta do plano do Silo" : "são irmãos no mesmo Silo, com assuntos distantes";
        conexoes.push({
          sourceNodeId: origem.nodeId,
          targetNodeId: destino.nodeId,
          relationType: "SUPPORT_TO_SUPPORT",
          reason: proximo
            ? `"${origem.label}" e "${destino.label}" ${motivo}: o irmão entra no corpo quando a seção trata dele; senão, na trilha "Continue no Silo".`
            : `"${origem.label}" e "${destino.label}" ${motivo}: o irmão vai à trilha "Continue no Silo", sem link forçado no texto.`,
          priority: proximo ? "MEDIUM" : "LOW",
        });
      }
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
