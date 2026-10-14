/**
 * ===== 2026-10-14 · F2 · A MALHA DO SILO NO RADAR (links obrigatórios do grafo e trilha) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6,
 * §11 e §14 (F2), D1, D2, D3 e D6, decididas pelo dono em 2026-10-14 ("sim, pode
 * sim, e do MCP também é uma boa ideia, pode implementar"). Pedido literal:
 * "Tem que ser obrigatório que os artigos de suporte apontem para o artigo
 * pilar, e o pilar tem que apontar a todos os artigos de suporte… tem que estar
 * interconectado todos dentro do silo".
 *
 * A régua, uma só (pedido do artigo-modelo, conferência da planta nova e leitura
 * da planta gravada no CSV "Para escrever" e no MCP):
 *   - D2 · a obrigação é o `priority` que o grafo do Arquiteto já tem, com sentido:
 *     HIGH = obrigatório no corpo; MEDIUM = no corpo quando a seção trata do
 *     destino, senão trilha; LOW = trilha. Sem migration.
 *   - O mínimo estrutural não baixa: Suporte → Pilar e Pilar → cada Suporte são
 *     HIGH mesmo quando o grafo diz menos (§6.1). O resto vem do grafo; sem
 *     aresta no grafo (Suporte ↔ Suporte, Suporte → SiloPage, F2), o Radar lê os
 *     membros do Silo e aplica o padrão: irmão MEDIUM, SiloPage LOW (do Pilar,
 *     MEDIUM). O Radar se adapta ao Arquiteto: grafo antigo continua válido.
 *   - D1 · Suporte ↔ Suporte, todos os pares: no corpo só quando a seção trata do
 *     assunto do irmão; o resto vai à trilha "Continue no Silo".
 *   - §6.1 · o Suporte liga ao Pilar NO CORPO, na seção que trata do tema central;
 *     sem ela, na primeira. O Pilar liga a cada Suporte na seção que trata do
 *     recorte dele; o que nenhuma seção trata vai à trilha — nenhum Suporte fica
 *     sem link do Pilar.
 *   - D3 · a trilha leva no máximo 12 irmãos (por afinidade e depois pela ordem
 *     narrativa) e a SiloPage, que é o índice completo; a do Pilar não tem teto. A
 *     relação obrigatória (HIGH) nunca é cortada da trilha; o irmão do grafo
 *     (MEDIUM ou LOW, a malha da F4) passa pelo teto como os outros.
 *   - Teto por seção: 3 links (o mesmo da planta); o servidor só põe no corpo o
 *     HIGH, e só onde cabe. Nada some: o que não cabe vai à trilha.
 *
 * A afinidade é determinística, sem IA: as raízes que distinguem o destino (o
 * nome e as keywords dele, fora as raízes do próprio artigo e as que metade ou
 * mais dos destinos do Silo dividem, que são cenário do Silo) achadas no texto
 * da seção (H2, pergunta, resposta, H3 e "Explicar").
 *
 * Domínio puro: sem banco, sem rede, sem IA.
 */

import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarSiloRoleIsPillar, radarSiloRoleText } from "./silo-role.ts";

export type RadarSiloMeshPriority = "HIGH" | "MEDIUM" | "LOW";
export type RadarSiloMeshPlacement = "BODY" | "BODY_IF_TREATED" | "TRAIL";
/** O que o destino é para a malha: o Pilar decidido, outro artigo do Silo (irmão ou Suporte do Pilar) ou a SiloPage. */
export type RadarSiloMeshTargetKind = "pillar" | "support" | "siloPage";

export const RADAR_SILO_MESH_LIMITS = Object.freeze({
  /** D3 · irmãos na trilha de um Suporte (a SiloPage vem à parte; o Pilar não tem teto). */
  trailSiblings: 12,
  /** O teto de links por seção da planta (`RADAR_ARTICLE_BLUEPRINT_LIMITS.internalLinks`). */
  linksPerSection: 3,
  /** §6.3 · no corpo, no máximo 1 irmão por seção (regra do pedido). */
  siblingsPerSection: 1,
});

/** D2 · o sentido do `priority` do grafo. */
export const RADAR_SILO_MESH_PLACEMENT: Readonly<Record<RadarSiloMeshPriority, RadarSiloMeshPlacement>> = Object.freeze({
  HIGH: "BODY",
  MEDIUM: "BODY_IF_TREATED",
  LOW: "TRAIL",
});

/** O texto da obrigação, o mesmo no pedido do artigo-modelo e no CSV. */
export const RADAR_SILO_MESH_OBLIGATION_TEXT: Readonly<Record<RadarSiloMeshPriority, string>> = Object.freeze({
  HIGH: "obrigatório no corpo",
  MEDIUM: "no corpo só se uma seção trata do assunto dele; senão, trilha \"Continue no Silo\"",
  LOW: "trilha \"Continue no Silo\"",
});

const ORDEM: Readonly<Record<RadarSiloMeshPriority, number>> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const t = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");

/** O `priority` como o grafo grava (HIGH/MEDIUM/LOW, em qualquer caixa); outro valor = nenhum. */
export function radarSiloMeshPriorityOf(valor: unknown): RadarSiloMeshPriority | null {
  const lido = t(valor).toUpperCase();
  return lido === "HIGH" || lido === "MEDIUM" || lido === "LOW" ? lido : null;
}

/** A mais forte de duas prioridades (HIGH vence). */
export function radarSiloMeshStrongest(a: RadarSiloMeshPriority | null, b: RadarSiloMeshPriority | null): RadarSiloMeshPriority | null {
  if (!a) return b;
  if (!b) return a;
  return ORDEM[a] <= ORDEM[b] ? a : b;
}

/**
 * O destino pelo papel: só o Pilar DECIDIDO é Pilar ("Pilar (formação)" de Silo
 * sem Pilar é sugestão, não destino obrigatório — a mesma regra da cobrança de
 * 2026-10-08); a SiloPage pelo papel; todo outro artigo do Silo é irmão.
 */
export function radarSiloMeshKindOf(role: string | null | undefined): RadarSiloMeshTargetKind {
  const papel = t(role);
  if (/^silo\s*page$/i.test(papel)) return "siloPage";
  return radarSiloRoleText(papel) === "Pilar" ? "pillar" : "support";
}

/**
 * A OBRIGAÇÃO DE UM LINK DE SAÍDA (D2). O mínimo estrutural (Suporte → Pilar e
 * Pilar → cada Suporte, HIGH) não baixa; o resto é o `priority` do grafo; sem
 * aresta, o padrão da malha: irmão MEDIUM; SiloPage LOW (do Pilar, MEDIUM).
 */
export function radarSiloMeshPriority(input: {
  articleRole: string | null | undefined;
  targetRole: string | null | undefined;
  graphPriority?: unknown;
}): RadarSiloMeshPriority {
  const pilar = radarSiloRoleIsPillar(input.articleRole);
  const alvo = radarSiloMeshKindOf(input.targetRole);
  if (!pilar && alvo === "pillar") return "HIGH";
  if (pilar && alvo === "support") return "HIGH";
  const doGrafo = radarSiloMeshPriorityOf(input.graphPriority);
  if (doGrafo) return doGrafo;
  if (alvo === "siloPage") return pilar ? "MEDIUM" : "LOW";
  return "MEDIUM";
}

/** Uma aresta do grafo aprovado como o contexto de pesquisa a traz. */
export type RadarSiloMeshGraphEdge = { targetNodeId: string; relationType?: string | null; priority?: unknown; direction: "outbound" | "inbound" };

/** O `priority` das arestas de SAÍDA deste artigo, por articleId do destino e o da SiloPage (a mais forte, quando há mais de uma). */
export function radarSiloMeshGraphPriorities(edges: readonly RadarSiloMeshGraphEdge[] | null | undefined): { byArticleId: ReadonlyMap<string, RadarSiloMeshPriority>; siloPage: RadarSiloMeshPriority | null } {
  const byArticleId = new Map<string, RadarSiloMeshPriority>();
  let siloPage: RadarSiloMeshPriority | null = null;
  for (const aresta of edges || []) {
    if (!aresta || aresta.direction !== "outbound") continue;
    const prioridade = radarSiloMeshPriorityOf(aresta.priority);
    if (!prioridade) continue;
    const no = t(aresta.targetNodeId);
    if (aresta.relationType === "ARTICLE_TO_SILO_PAGE" || no.startsWith("silo-page:")) {
      siloPage = radarSiloMeshStrongest(siloPage, prioridade);
      continue;
    }
    const articleId = no.startsWith("article:") ? no.slice("article:".length) : no;
    if (!articleId) continue;
    byArticleId.set(articleId, radarSiloMeshStrongest(byArticleId.get(articleId) ?? null, prioridade)!);
  }
  return { byArticleId, siloPage };
}

/* ============================== a afinidade ============================== */

const FUNCAO = new Set(["para", "como", "com", "sem", "sobre", "que", "dos", "das", "nos", "nas", "uma", "uns", "umas", "seu", "sua", "seus", "suas", "mais", "pelo", "pela", "voce"]);
const mesmaRaiz = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

/* ============================== o plano da malha ============================== */

export type RadarSiloMeshTargetInput = {
  /** O id com que a planta se refere ao destino (o candidato K). */
  id: string;
  role: string | null | undefined;
  label: string;
  keywords?: readonly (string | null | undefined)[] | null;
  /** A ordem narrativa no Silo (1…n); sem ela, depois dos que têm. */
  position?: number | null;
  /** O `priority` do grafo (ou o gravado no candidato); ausente = o padrão da malha. */
  priority?: unknown;
  /** A relação está no grafo aprovado (vem antes na trilha; o teto de irmãos vale para ela, F4). */
  fromGraph?: boolean;
};

export type RadarSiloMeshTarget = {
  id: string;
  kind: RadarSiloMeshTargetKind;
  priority: RadarSiloMeshPriority;
  label: string;
  position: number | null;
  fromGraph: boolean;
  /** O link já estava no corpo (posto pela planta). */
  inBody: boolean;
  /** A maior afinidade com uma seção (0 = nenhuma seção trata do destino). */
  affinity: number;
  /** A seção de maior afinidade (índice), quando há. */
  bestSection: number | null;
};

export type RadarSiloMeshPlan = {
  articleKind: "pillar" | "support";
  targets: RadarSiloMeshTarget[];
  /** O HIGH que faltava no corpo e o servidor pôs (só com `insertHigh`), na seção dita. */
  inserted: Array<{ id: string; section: number }>;
  /** O HIGH que falta no corpo e uma seção trata (ou é o Pilar): sem `insertHigh`, vira pendência. */
  missingHigh: Array<{ id: string; section: number | null }>;
  /** A trilha "Continue no Silo", na ordem: os artigos e, por último, a SiloPage. */
  trail: Array<{ id: string; priority: RadarSiloMeshPriority }>;
  /** D3 · os irmãos que passaram do teto da trilha (ficam a dois cliques, pelo Pilar e pela SiloPage). */
  outOfTrail: string[];
};

/**
 * O PLANO DA MALHA de um artigo: quem já está no corpo, o HIGH que falta (e onde
 * entra, pela afinidade), e a trilha com o resto. Puro: quem chama aplica.
 */
export function radarSiloMeshPlan(input: {
  articleRole: string | null | undefined;
  /** As keywords do artigo (a principal primeiro): as raízes delas não distinguem destino. */
  articleKeywords: readonly (string | null | undefined)[];
  /** Cada seção: o texto (H2, pergunta, resposta, H3, explicar) e os ids que ela já liga. */
  sections: ReadonlyArray<{ text: string; linked: readonly string[] }>;
  targets: readonly RadarSiloMeshTargetInput[];
  /** Fechando (planta nova) ou na leitura da planta gravada: o servidor põe o HIGH que falta. */
  insertHigh: boolean;
}): RadarSiloMeshPlan {
  const articleKind = radarSiloRoleIsPillar(input.articleRole) ? "pillar" : "support";
  const doArtigo = radarSemanticStems(input.articleKeywords.map(t).filter(Boolean).join(" "));
  const raizesDe = (alvo: RadarSiloMeshTargetInput) => radarSemanticStems([alvo.label, ...(alvo.keywords || [])].map(t).filter(Boolean).join(" "))
    .filter(raiz => raiz.length >= 4 && !FUNCAO.has(raiz) && !doArtigo.some(outra => mesmaRaiz(raiz, outra)));
  const artigos = input.targets.filter(alvo => radarSiloMeshKindOf(alvo.role) !== "siloPage");
  const brutas = new Map(input.targets.map(alvo => [alvo.id, raizesDe(alvo)]));
  /* O cenário do Silo: a raiz que metade ou mais dos artigos-destino dividem não distingue nenhum (com 4 destinos ou mais). */
  const cenario = new Set<string>();
  if (artigos.length >= 4) {
    const minimo = Math.max(2, Math.ceil(artigos.length / 2));
    const todas = [...new Set(artigos.flatMap(alvo => brutas.get(alvo.id) || []))];
    for (const raiz of todas) {
      if (artigos.filter(alvo => (brutas.get(alvo.id) || []).some(outra => mesmaRaiz(raiz, outra))).length >= minimo) cenario.add(raiz);
    }
  }
  const secoes = input.sections.map(secao => radarSemanticStems(secao.text));
  const afinidade = (id: string, indice: number) => (brutas.get(id) || [])
    .filter(raiz => !cenario.has(raiz))
    .filter(raiz => secoes[indice].some(outra => mesmaRaiz(raiz, outra))).length;
  const linksNaSecao = input.sections.map(secao => secao.linked.length);
  const noCorpo = new Set(input.sections.flatMap(secao => secao.linked));

  const targets: RadarSiloMeshTarget[] = input.targets.map(alvo => {
    const kind = radarSiloMeshKindOf(alvo.role);
    let melhor: number | null = null;
    let maior = 0;
    secoes.forEach((_secao, indice) => {
      const valor = afinidade(alvo.id, indice);
      if (valor > maior) { maior = valor; melhor = indice; }
    });
    return {
      id: alvo.id,
      kind,
      priority: radarSiloMeshPriority({ articleRole: input.articleRole, targetRole: alvo.role, graphPriority: alvo.priority }),
      label: t(alvo.label),
      position: typeof alvo.position === "number" && Number.isFinite(alvo.position) ? alvo.position : null,
      fromGraph: alvo.fromGraph === true,
      inBody: noCorpo.has(alvo.id),
      affinity: maior,
      bestSection: melhor,
    };
  });

  /* O HIGH que falta no corpo: o Pilar primeiro, depois na ordem narrativa. */
  const porOrdem = (a: RadarSiloMeshTarget, b: RadarSiloMeshTarget) =>
    Number(b.kind === "pillar") - Number(a.kind === "pillar") || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
  const inserted: RadarSiloMeshPlan["inserted"] = [];
  const missingHigh: RadarSiloMeshPlan["missingHigh"] = [];
  const cabe = (indice: number) => linksNaSecao[indice] < RADAR_SILO_MESH_LIMITS.linksPerSection;
  for (const alvo of targets.filter(item => item.priority === "HIGH" && !item.inBody).sort(porOrdem)) {
    /* A seção que trata do destino (maior afinidade, a primeira no empate) e que ainda cabe. */
    const tratam = secoes.map((_secao, indice) => ({ indice, valor: afinidade(alvo.id, indice) }))
      .filter(item => item.valor > 0)
      .sort((a, b) => b.valor - a.valor || a.indice - b.indice);
    const quemTrata = tratam.find(item => cabe(item.indice))?.indice ?? null;
    /* §6.1 · o Pilar entra mesmo sem seção que trate do tema central: na primeira que cabe. */
    const lugar = quemTrata ?? (alvo.kind === "pillar" ? secoes.findIndex((_secao, indice) => cabe(indice)) : -1);
    if (lugar === null || lugar < 0) continue;
    if (!input.insertHigh) {
      missingHigh.push({ id: alvo.id, section: lugar });
      continue;
    }
    inserted.push({ id: alvo.id, section: lugar });
    linksNaSecao[lugar] += 1;
    alvo.inBody = true;
  }

  /*
   * A trilha: todo destino que não está no corpo. O obrigatório (HIGH) nunca é
   * cortado; o irmão passa pelo teto (D3), menos na trilha do Pilar.
   * 2026-10-14 · F4 · com a malha gravada pelo Arquiteto, todo irmão vem do grafo
   * (MEDIUM ou LOW): o teto de 12 vale para ele também — antes da F4 só havia no
   * grafo a relação obrigatória, e "do grafo" bastava para não cortar.
   */
  const fora = targets.filter(item => !item.inBody);
  const ordemDaTrilha = (a: RadarSiloMeshTarget, b: RadarSiloMeshTarget) =>
    Number(b.kind === "pillar") - Number(a.kind === "pillar")
    || Number(b.fromGraph) - Number(a.fromGraph)
    || ORDEM[a.priority] - ORDEM[b.priority]
    || b.affinity - a.affinity
    || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
  const artigosFora = fora.filter(item => item.kind !== "siloPage").sort(ordemDaTrilha);
  const trail: RadarSiloMeshPlan["trail"] = [];
  const outOfTrail: string[] = [];
  let irmaos = 0;
  for (const alvo of artigosFora) {
    const corta = articleKind !== "pillar" && alvo.kind === "support" && alvo.priority !== "HIGH" && irmaos >= RADAR_SILO_MESH_LIMITS.trailSiblings;
    if (corta) {
      outOfTrail.push(alvo.id);
      continue;
    }
    if (alvo.kind === "support") irmaos += 1;
    trail.push({ id: alvo.id, priority: alvo.priority });
  }
  for (const alvo of fora.filter(item => item.kind === "siloPage")) trail.push({ id: alvo.id, priority: alvo.priority });
  return { articleKind, targets, inserted, missingHigh, trail, outOfTrail };
}
