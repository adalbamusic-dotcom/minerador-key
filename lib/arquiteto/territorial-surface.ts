import type { TerritorialLandscape } from "./territorial-landscape.ts";
import type { TerritorialLogicResult, TerritorialHypothesis } from "./territorial-logic.ts";
import { resolveTerritoryConfirmationReadiness, type TerritoryMembershipState } from "./territory.ts";

/**
 * Superfície territorial da aba Silos — projeção de leitura, somente.
 *
 * Converte o TerritorialLandscape e as hipóteses da Lógica em linhas agrupadas
 * para a MESMA planilha do Arquiteto: o shell é compartilhado, a projeção de
 * linha é por modo. Nenhuma autoridade nova, nenhuma persistência.
 *
 * A unidade operacional aqui é território → keyword, não Article → keyword.
 */

export type TerritorialRowKind = "structure" | "territory" | "keyword";

/** Grupos da projeção; nenhum território fictício é criado para agrupar. */
export const TERRITORIAL_GROUP_KINDS = [
  "existing_structures",
  "territories",
  "unassigned",
  "ambiguous",
  "inconsistent",
] as const;
export type TerritorialGroupKind = (typeof TERRITORIAL_GROUP_KINDS)[number];

export type TerritorialKeywordRow = {
  kind: "keyword";
  keywordId: string;
  /** Onde a keyword está agora, segundo a fonte canônica de membership. */
  territoryRef: string | null;
  existingSiloId: string | null;
  membershipState: TerritoryMembershipState | null;
  /** Motivo da decisão vigente; nunca inventado. */
  decisionReason: string | null;
  /**
   * SÓ `human` é decisão territorial humana. Recebimento do Minerador,
   * motivo técnico e hipótese da Lógica não são decisão.
   */
  decisionSource: "logic" | "serp" | "ai" | "human" | "system" | null;
  /** Status da PRÓPRIA keyword; nunca herdado da página do silo. */
  keywordStatus: string | null;
  /** Hipótese da Lógica, quando existir. Hipótese nunca é decisão. */
  hypothesis: TerritorialHypothesis | null;
};

export type TerritorialHeaderRow = {
  kind: "structure" | "territory";
  /** `territoryRef` opaco, ou `siloId` da estrutura existente. */
  ref: string;
  label: string;
  origin: string;
  /** Slug conhecido, seja proposta, confirmação ou página real. */
  slug: string | null;
  /**
   * De onde o slug vem. `page` exige SiloPage canônica — chamar proposta de
   * "Página" anunciaria uma entidade que a criação manual não materializa.
   */
  slugKind: "page" | "published" | "confirmed" | "proposal" | null;
  lifecycleStatus: string | null;
  isPublished: boolean;
  /**
   * Confirmação avaliada POR SILO — nunca como gate da aba inteira. `null` para
   * estrutura observada, que ainda não é silo.
   */
  confirmation: { ready: boolean; blockers: { code: string; detail: string | null }[] } | null;
  keywordCount: number;
  /** Articles que declaram este Silo. Unidade editorial != keyword. */
  articleCount: number;
  /** Estado da página: só existe quando existe SiloPage canônica. */
  pageStatus: "published" | "draft" | null;
  canonical: string | null;
  conflictCount: number;
};

export type TerritorialGroup = {
  kind: TerritorialGroupKind;
  header: TerritorialHeaderRow | null;
  rows: TerritorialKeywordRow[];
};

export type TerritorialSurface = {
  brandId: string;
  groups: TerritorialGroup[];
  emptyState: {
    isEmpty: boolean;
    /** Texto funcional; Brand vazia é estado válido, nunca erro. */
    message: string | null;
  };
  counts: {
    keywords: number;
    assigned: number;
    unassigned: number;
    ambiguous: number;
    structures: number;
    territories: number;
    inconsistencies: number;
  };
};

const hypothesisByKeyword = (logic: TerritorialLogicResult | null) =>
  new Map((logic?.hypotheses || []).map(hypothesis => [hypothesis.keywordId, hypothesis]));

const keywordRow = (
  keywordId: string,
  territoryRef: string | null,
  existingSiloId: string | null,
  membershipState: TerritoryMembershipState | null,
  decisionReason: string | null,
  hypothesis: TerritorialHypothesis | null,
  decisionSource: TerritorialKeywordRow["decisionSource"] = null,
  keywordStatus: string | null = null,
): TerritorialKeywordRow => ({
  kind: "keyword", keywordId, territoryRef, existingSiloId, membershipState, decisionReason, hypothesis, decisionSource, keywordStatus,
});

/**
 * Agrupa a paisagem em: estruturas existentes, territórios, sem território,
 * ambíguas e inconsistências. Ambíguas e inconsistências são projeções de
 * estado — não recebem território fabricado.
 */
export function buildTerritorialSurface(input: {
  landscape: TerritorialLandscape;
  logic?: TerritorialLogicResult | null;
}): TerritorialSurface {
  const { landscape } = input;
  // Prontidão é do silo específico: usar como gate da aba inteira travaria
  // silos saudáveis por causa de um problema alheio.
  const confirmationOf = (territory: TerritorialLandscape["candidateTerritories"][number]) => {
    if (territory.lifecycleStatus !== "candidate") return null;
    const readiness = resolveTerritoryConfirmationReadiness({ territory, report: landscape.consistency });
    // O código sai cru: a frase humana é escolhida pela UI, que é onde mora a
    // copy. A projeção não decide texto de tela.
    return {
      ready: readiness.state === "ready",
      blockers: readiness.blockers.map(blocker => ({ code: blocker.code, detail: blocker.detail ?? null })),
    };
  };
  const hypotheses = hypothesisByKeyword(input.logic ?? null);
  const groups: TerritorialGroup[] = [];

  // Site/Sitemap entra como estrutura observada. Quando reconciliada com um
  // Silo conhecido, NÃO vira segunda linha: a proveniência é somada à estrutura
  // canônica, que continua sendo a identidade.
  const siteBySiloId = new Map<string, typeof landscape.observedSiteStructures>();
  const siteOnly: typeof landscape.observedSiteStructures = [];
  for (const structure of landscape.observedSiteStructures) {
    // Promovida já é representada pelo próprio Silo candidato.
    if (structure.promotedTerritoryRef) continue;
    if (structure.reconciledSiloId) {
      siteBySiloId.set(structure.reconciledSiloId, [...(siteBySiloId.get(structure.reconciledSiloId) || []), structure]);
      continue;
    }
    siteOnly.push(structure);
  }

  for (const structure of landscape.existingStructures) {
    groups.push({
      kind: "existing_structures",
      header: {
        kind: "structure",
        ref: structure.siloId,
        label: structure.name || structure.siloId,
        origin: siteBySiloId.has(structure.siloId) ? `${structure.sourceKind}+site_catalog` : structure.sourceKind,
        slug: structure.slug,
        slugKind: structure.slug ? (structure.siloPageId ? "page" : "proposal") : null,
        confirmation: null,
        lifecycleStatus: null,
        isPublished: structure.isPublished,
        keywordCount: structure.keywordRefs.length,
        articleCount: structure.articleRefs.length,
        pageStatus: structure.siloPageId ? (structure.isPublished ? "published" : "draft") : null,
        canonical: null,
        conflictCount: 0,
      },
      rows: structure.keywordRefs.map(keywordId =>
        keywordRow(keywordId, null, structure.siloId, null, null, hypotheses.get(keywordId) ?? null, null, landscape.keywordStatusOf(keywordId))),
    });
  }

  for (const structure of siteOnly) {
    groups.push({
      kind: "existing_structures",
      header: {
        kind: "structure",
        // Identidade é a URL observada; nunca um siloId inventado.
        ref: structure.normalizedUrl,
        label: structure.label,
        origin: "site_catalog",
        slug: structure.path,
        slugKind: "page",
        lifecycleStatus: null,
        isPublished: structure.isPublished,
        confirmation: null,
        keywordCount: 0,
        articleCount: 0,
        pageStatus: "published",
        // Canonical só viaja quando foi verificado de fato.
        canonical: structure.canonicalVerified ? structure.canonical : null,
        conflictCount: 0,
      },
      rows: [],
    });
  }

  for (const territory of [...landscape.candidateTerritories, ...landscape.confirmedTerritories]) {
    groups.push({
      kind: "territories",
      header: {
        kind: "territory",
        ref: territory.territoryRef,
        label: territory.name || territory.centralEntity || territory.territoryRef,
        origin: territory.publishedStructureRef ? "site_catalog" : territory.architecturalOrigin,
        slug: territory.slugState.publishedSlug ?? territory.slugState.confirmed ?? territory.slugState.proposals[0]?.slug ?? null,
        slugKind: territory.slugState.publishedSlug ? "published"
          : territory.slugState.confirmed ? "confirmed"
          : territory.slugState.proposals[0]?.slug ? "proposal"
          : null,
        lifecycleStatus: territory.lifecycleStatus,
        isPublished: territory.publicationProtection === "protected",
        confirmation: confirmationOf(territory),
        keywordCount: territory.keywordRefs.length,
        articleCount: territory.articleRefs.length,
        // Candidato não tem SiloPage: declarar `null` em vez de fingir rascunho.
        pageStatus: territory.slugState.publishedSlug ? "published" : null,
        canonical: territory.slugState.publishedCanonical,
        conflictCount: territory.conflicts.length,
      },
      rows: territory.keywordRefs.map(keywordId =>
        keywordRow(keywordId, territory.territoryRef, territory.existingSiloRef?.siloId ?? null,
          "existing_silo_match", null, hypotheses.get(keywordId) ?? null, landscape.decisionSourceOf(keywordId), landscape.keywordStatusOf(keywordId))),
    });
  }

  // Sem território é o estado inicial esperado, não um problema.
  const ambiguousRows: TerritorialKeywordRow[] = [];
  const unassignedRows: TerritorialKeywordRow[] = [];
  for (const entry of landscape.unassignedKeywords) {
    const hypothesis = hypotheses.get(entry.keywordId) ?? null;
    const row = keywordRow(entry.keywordId, null, null, entry.state, entry.reason, hypothesis, entry.source, landscape.keywordStatusOf(entry.keywordId));
    if (hypothesis?.state === "ambiguous_silo" || entry.state === "ambiguous_silo") ambiguousRows.push(row);
    else unassignedRows.push(row);
  }
  if (unassignedRows.length) groups.push({ kind: "unassigned", header: null, rows: unassignedRows });
  if (ambiguousRows.length) groups.push({ kind: "ambiguous", header: null, rows: ambiguousRows });

  const inconsistentKeywordIds = [...new Set(landscape.consistency.issues
    .map(issue => issue.keywordId)
    .filter((keywordId): keywordId is string => Boolean(keywordId)))].sort();
  if (inconsistentKeywordIds.length) {
    groups.push({
      kind: "inconsistent",
      header: null,
      rows: inconsistentKeywordIds.map(keywordId => keywordRow(keywordId, null, null, null, null, null)),
    });
  }

  const isEmpty = landscape.counts.keywordsInScope === 0 && landscape.existingStructures.length === 0
    && landscape.observedSiteStructures.length === 0
    && landscape.candidateTerritories.length === 0 && landscape.confirmedTerritories.length === 0;

  return {
    brandId: landscape.brandId,
    groups,
    emptyState: {
      isEmpty,
      message: isEmpty
        ? "Nenhum silo ou keyword disponível. Importe keywords do Minerador ou registre uma estrutura da Marca."
        : null,
    },
    counts: {
      keywords: landscape.counts.keywordsInScope,
      assigned: landscape.counts.keywordsAssigned,
      unassigned: unassignedRows.length,
      ambiguous: ambiguousRows.length,
      structures: landscape.existingStructures.length + siteOnly.length,
      territories: landscape.candidateTerritories.length + landscape.confirmedTerritories.length,
      inconsistencies: landscape.consistency.issues.length,
    },
  };
}

/* --------------------- disponibilidade dos processos --------------------- */

export type TerritorialProcessState = "available" | "blocked" | "not_implemented";

export type TerritorialProcessAvailability = {
  logic: TerritorialProcessState;
  serp: TerritorialProcessState;
  ai: TerritorialProcessState;
  review: TerritorialProcessState;
  /** Motivo quando bloqueado; a UI explica em vez de só desabilitar. */
  blockedReason: string | null;
};

/**
 * Disponibilidade derivada da PRÓPRIA fase territorial.
 *
 * Deliberadamente NÃO usa `brandArticleVersions.length`: exigir ArticleDNA para
 * abrir a análise territorial é o gate Article-first invertido. Também não usa
 * `resolveTerritoryConfirmationReadiness` — confirmar um território é outra
 * pergunta, e usá-la aqui criaria dependência circular (a Lógica é justamente o
 * que ajuda a chegar ao estado confirmável).
 *
 * Projeção funcional de UI, não autoridade nova nem enum persistido.
 */
export function deriveTerritorialProcessAvailability(input: {
  surface: TerritorialSurface;
  landscape: TerritorialLandscape;
}): TerritorialProcessAvailability {
  const { surface, landscape } = input;
  // Inconsistência estrutural torna a leitura não confiável para analisar.
  const blockedByConsistency = !landscape.consistency.consistent;
  const hasAnalyzable = surface.counts.unassigned > 0
    || surface.counts.structures > 0
    || landscape.candidateTerritories.length > 0;
  const hasReviewable = surface.counts.ambiguous > 0
    || surface.counts.unassigned > 0
    || landscape.candidateTerritories.length > 0
    || surface.groups.some(group => group.rows.some(row => row.hypothesis));

  return {
    logic: blockedByConsistency ? "blocked" : hasAnalyzable ? "available" : "blocked",
    // SERP e IA territoriais não existem nesta rodada: declarar isso é mais
    // honesto do que exibir um processo "disponível" que não roda.
    serp: "not_implemented",
    ai: "not_implemented",
    review: blockedByConsistency ? "blocked" : hasReviewable ? "available" : "blocked",
    blockedReason: blockedByConsistency
      ? "Há inconsistência na estrutura de silos; resolva antes de analisar."
      : hasAnalyzable ? null : "Nenhuma keyword ou estrutura disponível para analisar.",
  };
}
