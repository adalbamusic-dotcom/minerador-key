/**
 * ANÁLISE DE ARQUITETURA DO LOTE — a primeira leitura, do universo inteiro.
 *
 * A ordem importa. Decidir keyword a keyword perde exatamente a visão relativa
 * que revela qual é cabeceira, qual é cauda, quais são a mesma intenção e
 * quantos eixos distintos sustentam um universo próprio:
 *
 *     TODAS AS KEYWORDS + SILOS PUBLICADOS + SILOS MANUAIS + ARQUITETURA DO SITE
 *              ↓
 *          CLUSTERS NARRATIVOS
 *              ↓
 *     fortalecer existente | novo candidato | sem profundidade | ambíguo
 *
 * CLUSTER É HIPÓTESE. SILO É DECISÃO. Nada aqui cria território, move keyword
 * ou confirma silo — a saída é proposta explicada, para revisão humana.
 *
 * Domínio puro: orquestra `KeywordUniverse`, os silos e a arquitetura publicada
 * já existentes. Nenhum algoritmo de clustering paralelo é criado aqui.
 */

import type { KeywordUniverse, UniverseCluster } from "./keyword-universe.ts";
import type { PublishedSiteArchitecture } from "./published-site-architecture.ts";

/** O que o lote recomenda para cada cluster. Nenhum vira Silo sozinho. */
export type ClusterDestination =
  /** Cabe num silo que já existe: fortalecer em vez de criar concorrente. */
  | "strengthen_existing_silo"
  /** Universo próprio com profundidade suficiente e sem dono atual. */
  | "new_silo_candidate"
  /** Não sustenta universo: segue para a formação de Articles. */
  | "insufficient_depth"
  /** Dois encaixes plausíveis: a escolha é humana. */
  | "ambiguous";

/**
 * Pontuação operacional, 0–100. NÃO é score de SEO, ranking ou autoridade.
 * Toda pontuação carrega as razões que a produziram.
 */
export type ExplainedScore = {
  value: number;
  reasons: string[];
};

export type ClusterAnalysis = {
  clusterRef: string;
  label: string;
  memberKeywordIds: string[];
  headKeywordId: string | null;
  ambiguousHeadKeywordIds: string[];
  destination: ClusterDestination;
  /** Silo sugerido quando o destino aponta para um existente. */
  suggestedTerritoryRef: string | null;
  suggestedTerritoryLabel: string | null;
  /** Alternativas plausíveis quando o destino é ambíguo. */
  alternativeTerritoryRefs: string[];
  scores: {
    coherence: ExplainedScore;
    siloFit: ExplainedScore;
    depth: ExplainedScore;
    publishedEvidence: ExplainedScore;
  };
  confidence: "alta" | "média" | "baixa";
  /** Frase única que explica a recomendação. */
  reason: string;
};

export type ArchitectureAnalysis = {
  clusters: ClusterAnalysis[];
  summary: {
    keywords: number;
    clusters: number;
    strengthening: number;
    newSilos: number;
    insufficient: number;
    ambiguous: number;
    confidence: "alta" | "média" | "baixa";
  };
  /** Explicação curta do lote, em frases simples. */
  narrative: string[];
  baseHash: string;
};

type AnalysisTerritory = {
  territoryRef: string;
  name: string | null;
  centralEntity: string;
  lifecycleStatus: string;
  slug: string | null;
  isPublished: boolean;
};

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100)));

/** Tokens comparáveis: acento e plural não podem inventar diferença. */
const tokensOf = (value: string) =>
  new Set(
    value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/).filter(token => token.length > 2)
      .map(token => token.replace(/s$/, "")),
  );

const overlapRatio = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
};

/**
 * Quanto um cluster encaixa num silo existente.
 *
 * A comparação é de identidade — entidade central, nome e slug publicado —,
 * não de volume. Um silo publicado ganha peso porque já é patrimônio no ar.
 */
function scoreSiloFit(input: {
  clusterTokens: Set<string>;
  territory: AnalysisTerritory;
}): ExplainedScore {
  const reasons: string[] = [];
  const entityTokens = tokensOf(input.territory.centralEntity || "");
  const nameTokens = tokensOf(input.territory.name || "");
  const slugTokens = tokensOf(input.territory.slug || "");

  const byEntity = overlapRatio(input.clusterTokens, entityTokens);
  const byName = overlapRatio(input.clusterTokens, nameTokens);
  const bySlug = overlapRatio(input.clusterTokens, slugTokens);
  let value = Math.max(byEntity, byName, bySlug);

  if (byEntity >= 0.5) reasons.push("mesma entidade central do silo");
  else if (byName >= 0.5) reasons.push("o nome do silo cobre o tema do grupo");
  else if (bySlug >= 0.5) reasons.push("o caminho publicado cobre o tema do grupo");

  if (input.territory.isPublished && value > 0) {
    // Patrimônio no ar tem precedência: criar concorrente fragmenta o site.
    value = Math.min(1, value + 0.15);
    reasons.push("estrutura publicada existente cobre este universo");
  }
  if (!reasons.length) reasons.push("nenhuma sobreposição relevante com este silo");
  return { value: pct(value), reasons };
}

const FIT_STRONG = 50;
const FIT_AMBIGUOUS_DELTA = 12;

function scoreCoherence(cluster: UniverseCluster): ExplainedScore {
  const reasons = cluster.evidence.length ? [...cluster.evidence] : ["agrupamento sustentado pela leitura do lote"];
  for (const warning of cluster.warnings) reasons.push(`atenção: ${warning}`);
  return { value: pct(cluster.coherence), reasons };
}

function scoreDepth(cluster: UniverseCluster): ExplainedScore {
  const reasons: string[] = [];
  reasons.push(`${cluster.axes.length} eixo(s) distinto(s) no grupo`);
  reasons.push(cluster.depth === "vertical"
    ? "os membros aprofundam o mesmo universo"
    : cluster.depth === "horizontal"
      ? "os membros repetem a mesma intenção, sem aprofundar"
      : "o grupo não sustenta um universo próprio");
  // Profundidade vale mais que quantidade: dez variações da mesma frase não
  // formam universo, e cinco eixos distintos podem formar.
  return { value: pct(cluster.verticality), reasons };
}

function scorePublishedEvidence(input: {
  territory: AnalysisTerritory | null;
  published: PublishedSiteArchitecture | null;
}): ExplainedScore {
  if (!input.territory) return { value: 0, reasons: ["nenhum silo existente corresponde a este grupo"] };
  const reasons: string[] = [];
  let value = 0;
  if (input.territory.isPublished) {
    value += 0.6;
    reasons.push("o silo já tem página publicada");
  }
  const root = input.published?.editorialRoots.find(node => node.path === input.territory!.slug) ?? null;
  if (root) {
    value += 0.4;
    reasons.push(`raiz editorial publicada com ${root.childPaths.length} página(s) abaixo`);
  }
  if (!reasons.length) reasons.push("silo ainda sem patrimônio publicado");
  return { value: pct(value), reasons };
}

const confidenceOf = (scores: ClusterAnalysis["scores"], destination: ClusterDestination) => {
  if (destination === "ambiguous") return "baixa" as const;
  const media = (scores.coherence.value + scores.depth.value + Math.max(scores.siloFit.value, scores.publishedEvidence.value)) / 3;
  return media >= 70 ? ("alta" as const) : media >= 45 ? ("média" as const) : ("baixa" as const);
};

/**
 * Lê o lote inteiro e devolve a arquitetura proposta.
 *
 * Ordem deliberada: silo existente ANTES de silo novo. Sem isso o lote criaria
 * `/skin-care` concorrendo com `/rotina-skincare-facial` que já está no ar.
 */
export function buildArchitectureAnalysis(input: {
  universe: KeywordUniverse | null;
  territories: readonly AnalysisTerritory[];
  /**
   * Territórios que não devem competir por score, por identidade estrutural.
   *
   * Duplicata exata da mesma raiz publicada entra aqui. Opcional: sem o
   * conjunto, o comportamento anterior é preservado inteiro.
   */
  outOfCompetitionTerritoryRefs?: ReadonlySet<string>;
  publishedArchitecture?: PublishedSiteArchitecture | null;
  /** Texto por keywordId, para comparar o grupo com a identidade dos silos. */
  keywordTexts: ReadonlyMap<string, string>;
}): ArchitectureAnalysis {
  const universe = input.universe;
  const clusters = universe?.clusters ?? [];
  const published = input.publishedArchitecture ?? null;

  const analyses: ClusterAnalysis[] = clusters.map(cluster => {
    const textos = cluster.memberKeywordIds.map(id => input.keywordTexts.get(id) || "").filter(Boolean);
    const clusterTokens = tokensOf(textos.join(" "));
    const label = (cluster.headKeywordId ? input.keywordTexts.get(cluster.headKeywordId) : null) || textos[0] || cluster.clusterRef;

    /*
     * Fora da disputa: arquivado, substituído e DUPLICATA EXATA.
     *
     * `scoreSiloFit` ordena por afinidade de tokens, e o desempate cai na
     * ordem da lista. Com dois territórios de mesmo nome apontando para a
     * mesma raiz publicada, isso vira sorteio — e foi assim que um candidato
     * de campos vazios venceu um consolidado com SiloDNA, SiloPage e
     * fronteira declarada, levando junto uma busca de ArticleDNA aprovado.
     *
     * A exclusão é DETERMINÍSTICA e vem de fora: quem decide é a identidade
     * estrutural (mesma entrada de catálogo), não a pontuação. Nenhuma
     * heurística foi alterada aqui.
     */
    const foraDaDisputa = input.outOfCompetitionTerritoryRefs ?? new Set<string>();
    const fits = input.territories
      .filter(territory => territory.lifecycleStatus !== "archived" && territory.lifecycleStatus !== "superseded")
      .filter(territory => !foraDaDisputa.has(territory.territoryRef))
      .map(territory => ({ territory, score: scoreSiloFit({ clusterTokens, territory }) }))
      .sort((left, right) => right.score.value - left.score.value);

    const melhor = fits[0] ?? null;
    const segundo = fits[1] ?? null;
    const encaixaForte = Boolean(melhor && melhor.score.value >= FIT_STRONG);
    const empatado = Boolean(
      encaixaForte && segundo && segundo.score.value >= FIT_STRONG
      && melhor!.score.value - segundo.score.value <= FIT_AMBIGUOUS_DELTA,
    );
    const temProfundidade = cluster.depth === "vertical";

    let destination: ClusterDestination;
    let reason: string;
    if (empatado) {
      destination = "ambiguous";
      reason = `O grupo encaixa igualmente em "${melhor!.territory.name || melhor!.territory.centralEntity}" e "${segundo!.territory.name || segundo!.territory.centralEntity}". A escolha é humana.`;
    } else if (encaixaForte) {
      destination = "strengthen_existing_silo";
      reason = `O grupo pertence ao universo de "${melhor!.territory.name || melhor!.territory.centralEntity}", que já existe. Fortalecer evita criar um silo concorrente.`;
    } else if (temProfundidade) {
      destination = "new_silo_candidate";
      reason = `O grupo tem ${cluster.axes.length} eixo(s) distinto(s) e nenhum silo atual o cobre: sustenta um universo próprio.`;
    } else {
      destination = "insufficient_depth";
      reason = "O grupo não tem profundidade para um silo próprio neste lote; segue para a formação de artigos.";
    }

    const scores = {
      coherence: scoreCoherence(cluster),
      siloFit: melhor?.score ?? { value: 0, reasons: ["nenhum silo existente corresponde a este grupo"] },
      depth: scoreDepth(cluster),
      publishedEvidence: scorePublishedEvidence({
        territory: encaixaForte || empatado ? melhor!.territory : null,
        published,
      }),
    };

    return {
      clusterRef: cluster.clusterRef,
      label,
      memberKeywordIds: [...cluster.memberKeywordIds],
      headKeywordId: cluster.headKeywordId,
      ambiguousHeadKeywordIds: [...cluster.ambiguousHeadKeywordIds],
      destination,
      suggestedTerritoryRef: destination === "strengthen_existing_silo" ? melhor!.territory.territoryRef : null,
      suggestedTerritoryLabel: destination === "strengthen_existing_silo"
        ? melhor!.territory.name || melhor!.territory.centralEntity
        : null,
      alternativeTerritoryRefs: empatado ? [melhor!.territory.territoryRef, segundo!.territory.territoryRef] : [],
      scores,
      confidence: confidenceOf(scores, destination),
      reason,
    };
  });

  const strengthening = analyses.filter(item => item.destination === "strengthen_existing_silo").length;
  const newSilos = analyses.filter(item => item.destination === "new_silo_candidate").length;
  const insufficient = analyses.filter(item => item.destination === "insufficient_depth").length;
  const ambiguous = analyses.filter(item => item.destination === "ambiguous").length;
  const altas = analyses.filter(item => item.confidence === "alta").length;

  const narrative: string[] = [];
  for (const item of analyses.slice(0, 6)) narrative.push(`${item.label}: ${item.reason}`);

  return {
    clusters: analyses,
    summary: {
      keywords: universe?.clusters.reduce((total, cluster) => total + cluster.memberKeywordIds.length, 0) ?? 0,
      clusters: analyses.length,
      strengthening,
      newSilos,
      insufficient,
      ambiguous,
      confidence: !analyses.length ? "baixa" : altas >= analyses.length / 2 ? "alta" : ambiguous ? "baixa" : "média",
    },
    narrative,
    baseHash: architectureBaseHash({
      keywordIds: [...input.keywordTexts.keys()],
      territoryRefs: input.territories.map(territory => territory.territoryRef),
      publishedRootPaths: published?.editorialRoots.map(node => node.path) ?? [],
    }),
  };
}

/**
 * Hash do cenário global.
 *
 * Muda quando muda o que a análise leu — keywords, silos, raízes publicadas.
 * Não entra nada de UI: abrir a página não pode gerar arquitetura diferente.
 */
export function architectureBaseHash(input: {
  keywordIds: readonly string[];
  territoryRefs: readonly string[];
  publishedRootPaths: readonly string[];
}): string {
  const canonical = JSON.stringify([
    [...input.keywordIds].sort(),
    [...input.territoryRefs].sort(),
    [...input.publishedRootPaths].sort(),
  ]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `arch:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/* ------------------------- plano de confirmação -------------------------- */

export type ArchitectureConfirmationPlan = {
  /** Silos prontos para confirmar, já filtrados por readiness própria. */
  confirmTerritoryRefs: string[];
  /** Memberships que o humano aprovou no cenário revisado. */
  assignments: { keywordId: string; territoryRef: string; reason: string }[];
  /** Clusters mantidos sem silo novo — nada é criado para eles. */
  keptWithoutSilo: string[];
  /** Silos que ficam de fora, com o motivo em texto. */
  skipped: { territoryRef: string; label: string; blockers: string[] }[];
};

/**
 * Traduz o cenário revisado em trabalho para os writers canônicos.
 *
 * Confirmação global NÃO ignora bloqueio: cada silo passa pela própria
 * prontidão. Um silo incompleto fica de fora com o motivo, e o resto segue.
 */
export function buildArchitectureConfirmationPlan(input: {
  analysis: ArchitectureAnalysis;
  /** Prontidão por silo, resolvida por quem chama. */
  readiness: ReadonlyMap<string, { ready: boolean; blockers: string[]; label: string }>;
  /** Silos que ainda são candidatos; confirmados não entram de novo. */
  candidateTerritoryRefs: ReadonlySet<string>;
}): ArchitectureConfirmationPlan {
  const confirmTerritoryRefs: string[] = [];
  const skipped: ArchitectureConfirmationPlan["skipped"] = [];
  const assignments: ArchitectureConfirmationPlan["assignments"] = [];
  const keptWithoutSilo: string[] = [];

  for (const cluster of input.analysis.clusters) {
    if (cluster.destination === "insufficient_depth") { keptWithoutSilo.push(cluster.clusterRef); continue; }
    // Ambiguidade não é resolvida em lote: seria escolher no lugar da pessoa.
    if (cluster.destination === "ambiguous") continue;
    if (cluster.destination !== "strengthen_existing_silo" || !cluster.suggestedTerritoryRef) continue;
    for (const keywordId of cluster.memberKeywordIds) {
      assignments.push({
        keywordId,
        territoryRef: cluster.suggestedTerritoryRef,
        reason: `Arquitetura do lote confirmada: ${cluster.reason}`,
      });
    }
  }

  for (const territoryRef of input.candidateTerritoryRefs) {
    const readiness = input.readiness.get(territoryRef);
    if (!readiness) continue;
    if (readiness.ready) confirmTerritoryRefs.push(territoryRef);
    else skipped.push({ territoryRef, label: readiness.label, blockers: readiness.blockers });
  }

  return { confirmTerritoryRefs, assignments, keptWithoutSilo, skipped };
}
