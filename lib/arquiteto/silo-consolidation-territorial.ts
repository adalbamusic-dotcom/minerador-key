import type { TerritoryRef } from "./territory-ref.ts";
import {
  isPartialMembershipOperation,
  type KeywordTerritoryState,
  type TerritoryCandidate,
} from "./territory.ts";

/**
 * Consolidação de Silo a partir de um território — Fase 2C.2.
 *
 * Este módulo VALIDA e PLANEJA. Não persiste, não chama a RPC remota, não toca
 * InternalLinkGraph, Radar, Site/Sitemap nem provider algum.
 *
 * Corrige três defeitos provados na auditoria 2C.0, que hoje o
 * `SiloDNASchema.superRefine` aceita: Silo `formed` sem Pilar, Silo `formed` com
 * zero Articles, e o mesmo Article aparecendo como Pilar e como Suporte. As
 * regras aqui valem para NOVA consolidação Silo-first; o schema base continua
 * permissivo para não quebrar a leitura do histórico.
 */

/* ------------------------------- composição ------------------------------ */

/**
 * `explicitly_excluded` NÃO é papel de ArticleDNA. É decisão da consolidação
 * territorial: o Article existe, foi examinado e um humano decidiu deixá-lo de
 * fora deste Silo. Materializá-lo dentro do ArticleDNA misturaria a composição
 * do Silo com a identidade do artigo.
 */
export const SILO_ARTICLE_DISPOSITIONS = ["pillar", "support", "explicitly_excluded"] as const;
export type SiloArticleDisposition = (typeof SILO_ARTICLE_DISPOSITIONS)[number];

export type TerritorialSiloArticle = {
  articleId: string;
  brandId: string;
  /** Ausente = ArticleDNA anterior ao fluxo Silo-first. */
  territoryRef: TerritoryRef | null;
  /** Referência VERSIONADA. `workingArticleId` nunca chega aqui. */
  articleDnaVersionId: string | null;
  articleDnaContentHash: string | null;
  /** Uma versão consolidada existe e foi aprovada por decisão humana. */
  isConsolidated: boolean;
  isHumanApproved: boolean;
};

/** Exclusão explícita: decisão humana com ator, momento e motivo. */
export type SiloArticleExclusion = {
  articleId: string;
  actorUserId: string;
  decidedAt: string;
  reason: string;
};

export type TerritorialSiloComposition = {
  territoryRef: TerritoryRef | null;
  brandId: string;
  /** Escolha HUMANA. Nunca inferida de volume, KGR, ordem, quantidade, IA ou SERP. */
  pillarArticleId: string | null;
  supportArticleIds: readonly string[];
  exclusions: readonly SiloArticleExclusion[];
};

export const SILO_COMPOSITION_ISSUE_CODES = [
  "PILLAR_NOT_SELECTED",
  "MULTIPLE_PILLAR_CONFLICT",
  "ZERO_ARTICLES",
  "PILLAR_ALSO_SUPPORT",
  "DUPLICATE_SUPPORT",
  "ROLE_COMPOSITION_CONFLICT",
  "ARTICLE_REFERENCE_INCOHERENT",
  "ARTICLE_OUTSIDE_TERRITORY",
  "ARTICLE_COVERAGE_GAP",
  "EXCLUSION_WITHOUT_HUMAN_DECISION",
  "EXCLUSION_OF_UNKNOWN_ARTICLE",
  "CROSS_BRAND_ARTICLE",
] as const;
export type SiloCompositionIssueCode = (typeof SILO_COMPOSITION_ISSUE_CODES)[number];

export type SiloCompositionIssue = { code: SiloCompositionIssueCode; detail: string };

export type SiloCompositionPlan = {
  ok: boolean;
  issues: SiloCompositionIssue[];
  /** Disposição final de cada Article examinado. Ninguém some. */
  dispositions: Array<{ articleId: string; disposition: SiloArticleDisposition }>;
};

/**
 * §4 e §5 — invariantes de composição e cobertura.
 *
 * Todo Article estruturalmente relevante termina em EXATAMENTE um de
 * `pillar`, `support` ou `explicitly_excluded`. Um Article que não aparece em
 * nenhum dos três é `ARTICLE_COVERAGE_GAP`, não um silêncio aceitável.
 */
export function planTerritorialSiloComposition(input: {
  composition: TerritorialSiloComposition;
  articles: readonly TerritorialSiloArticle[];
}): SiloCompositionPlan {
  const { composition, articles } = input;
  const issues: SiloCompositionIssue[] = [];
  const byId = new Map(articles.map(article => [article.articleId, article]));

  const supports = [...composition.supportArticleIds];
  const duplicatedSupports = supports.filter((id, index) => supports.indexOf(id) !== index);
  if (duplicatedSupports.length) {
    issues.push({ code: "DUPLICATE_SUPPORT", detail: [...new Set(duplicatedSupports)].sort().join(", ") });
  }

  if (!composition.pillarArticleId) {
    issues.push({ code: "PILLAR_NOT_SELECTED", detail: "Um Silo consolidado exige exatamente um Pilar, escolhido por decisão humana." });
  } else if (supports.includes(composition.pillarArticleId)) {
    issues.push({ code: "PILLAR_ALSO_SUPPORT", detail: composition.pillarArticleId });
  }

  const structural = composition.pillarArticleId ? [composition.pillarArticleId, ...supports] : [...supports];
  if (!structural.length) {
    issues.push({ code: "ZERO_ARTICLES", detail: "Um Silo consolidado precisa de ao menos um Article." });
  }

  // Nenhum Article em mais de um papel — inclui a colisão com as exclusões.
  const excludedIds = composition.exclusions.map(exclusion => exclusion.articleId);
  const allAssigned = [...structural, ...excludedIds];
  const multiRole = allAssigned.filter((id, index) => allAssigned.indexOf(id) !== index);
  if (multiRole.length) {
    issues.push({ code: "ROLE_COMPOSITION_CONFLICT", detail: [...new Set(multiRole)].sort().join(", ") });
  }

  for (const exclusion of composition.exclusions) {
    if (!byId.has(exclusion.articleId)) {
      issues.push({ code: "EXCLUSION_OF_UNKNOWN_ARTICLE", detail: exclusion.articleId });
      continue;
    }
    if (!exclusion.actorUserId.trim() || !exclusion.decidedAt.trim() || !exclusion.reason.trim()) {
      issues.push({ code: "EXCLUSION_WITHOUT_HUMAN_DECISION", detail: exclusion.articleId });
    }
  }

  for (const articleId of structural) {
    const article = byId.get(articleId);
    if (!article) {
      issues.push({ code: "ARTICLE_REFERENCE_INCOHERENT", detail: `${articleId} não está entre os Articles do território` });
      continue;
    }
    if (article.brandId !== composition.brandId) {
      issues.push({ code: "CROSS_BRAND_ARTICLE", detail: articleId });
    }
    if (!article.articleDnaVersionId || !article.articleDnaContentHash) {
      issues.push({ code: "ARTICLE_REFERENCE_INCOHERENT", detail: `${articleId} não tem versão consolidada de ArticleDNA` });
    }
    if (article.territoryRef !== composition.territoryRef) {
      issues.push({ code: "ARTICLE_OUTSIDE_TERRITORY", detail: articleId });
    }
  }

  // Cobertura: ninguém desaparece.
  const assigned = new Set(allAssigned);
  const uncovered = articles.filter(article => !assigned.has(article.articleId)).map(article => article.articleId);
  if (uncovered.length) {
    issues.push({ code: "ARTICLE_COVERAGE_GAP", detail: uncovered.sort().join(", ") });
  }

  const dispositions = articles
    .map(article => ({
      articleId: article.articleId,
      disposition: article.articleId === composition.pillarArticleId
        ? "pillar" as const
        : supports.includes(article.articleId)
          ? "support" as const
          : "explicitly_excluded" as const,
    }))
    .filter(entry => assigned.has(entry.articleId))
    .sort((left, right) => left.articleId.localeCompare(right.articleId));

  return { ok: issues.length === 0, issues, dispositions };
}

/**
 * §4 — guarda explícita contra seleção automática de Pilar. Devolve sempre
 * `null`: existe para tornar a recusa legível em código e testável.
 */
export function pillarIsNeverInferred(signals: {
  volume?: number | null;
  kgrScore?: number | null;
  position?: number | null;
  articleCount?: number | null;
  aiSuggestion?: string | null;
  serpSuggestion?: string | null;
}): null {
  // Lê a entrada de propósito: a recusa é sobre ESTES sinais, e um parâmetro
  // ignorado esconderia que nenhum deles foi consultado como critério.
  void Object.keys(signals);
  return null;
}

/* ------------------------- readiness de consolidação --------------------- */

export const SILO_CONSOLIDATION_BLOCKER_CODES = [
  "TERRITORY_NOT_CONFIRMED",
  "PARTIAL_OPERATION_PENDING",
  "UNFINISHED_MEMBERSHIP_OPERATION",
  "UNADDRESSED_KEYWORDS",
  "ARTICLE_NOT_CONSOLIDATED",
  "ARTICLE_NOT_HUMAN_APPROVED",
  "ARTICLE_TERRITORIAL_CONFLICT",
  "LEGACY_ARTICLE_NEEDS_RECONCILIATION",
  "ARTICLE_COVERAGE_GAP",
  "PILLAR_NOT_SELECTED",
  "MULTIPLE_PILLAR_CONFLICT",
  "ROLE_COMPOSITION_CONFLICT",
  "PUBLISHED_IDENTITY_DECISION_REQUIRED",
  "HUMAN_SILO_CONSOLIDATION_REQUIRED",
  "SILO_TERRITORY_REF_MISSING",
  "SILO_TERRITORY_REF_MISMATCH",
] as const;
export type SiloConsolidationBlockerCode = (typeof SILO_CONSOLIDATION_BLOCKER_CODES)[number];

export type SiloConsolidationBlocker = { code: SiloConsolidationBlockerCode; detail: string };

/** Evidência que depende da Etapa 0 da Marca: adiada, nunca inventada. */
export const DEFERRED_EXTERNAL_EVIDENCE = "DEFERRED_EXTERNAL_EVIDENCE" as const;
export type SiloConsolidationDeferral = { code: typeof DEFERRED_EXTERNAL_EVIDENCE; detail: string };

export type SiloConsolidationReadiness =
  | { state: "ready"; blockers: []; deferred: SiloConsolidationDeferral[] }
  | { state: "blocked"; blockers: SiloConsolidationBlocker[]; deferred: SiloConsolidationDeferral[] };

export type PublishedSiloIdentity = {
  siloPageId: string;
  publicationStatus: "new" | "published";
  slug: string | null;
  canonical: string | null;
  publishedUrl: string | null;
  /** `unknown` e `conflict` exigem decisão humana; nunca se resolvem sozinhos. */
  verification: "not_applicable" | "verified" | "unknown" | "conflict";
};

/** Decisão humana explícita de consolidação. IA, Lógica e SERP não chegam aqui. */
export type SiloConsolidationDecision = {
  actorUserId: string;
  decidedAt: string;
  reason: string;
  territoryRef: TerritoryRef;
  pillarArticleId: string;
  supportArticleIds: readonly string[];
  excludedArticleIds: readonly string[];
  /** Decisão sobre identidade publicada, quando houver o que decidir. */
  publishedIdentityResolved: boolean;
};

export type SiloConsolidationReadinessInput = {
  territory: TerritoryCandidate;
  composition: TerritorialSiloComposition;
  articles: readonly TerritorialSiloArticle[];
  /** Estado territorial de cada keyword do território. */
  keywordTerritoryStates?: ReadonlyArray<{ keywordId: string; state: KeywordTerritoryState }>;
  publishedIdentity?: PublishedSiloIdentity | null;
  decision?: SiloConsolidationDecision | null;
  /** territoryRef declarado nos dois payloads do par que será persistido. */
  siloDnaTerritoryRef?: string | null;
  siloPageTerritoryRef?: string | null;
  /** Evidência de estrutura publicada ainda represada na frente da Marca. */
  publishedStructureEvidenceAvailable?: boolean;
};

/**
 * READY_FOR_SILO_CONSOLIDATION — separada de confirmação de Território, de
 * formação de Article, de confirmação de Article e da aprovação do Silo.
 *
 * Responde só isto: "esta arquitetura está resolvida a ponto de virar SiloDNA e
 * SiloPage?". Aprovar o par é outro ato, humano, depois desta resposta.
 */
export function resolveSiloConsolidationReadiness(
  input: SiloConsolidationReadinessInput,
): SiloConsolidationReadiness {
  const { territory, composition } = input;
  const blockers: SiloConsolidationBlocker[] = [];
  const deferred: SiloConsolidationDeferral[] = [];

  if (territory.lifecycleStatus !== "confirmed" || territory.decisionState !== "confirmed") {
    blockers.push({ code: "TERRITORY_NOT_CONFIRMED", detail: `lifecycleStatus=${territory.lifecycleStatus}` });
  }

  const operation = territory.pendingOperation;
  if (isPartialMembershipOperation(operation)) {
    blockers.push({ code: "PARTIAL_OPERATION_PENDING", detail: operation?.operationId || territory.territoryRef });
  } else if (operation) {
    const applied = new Set(operation.appliedKeywordIds);
    if (operation.intendedKeywordIds.some(keywordId => !applied.has(keywordId))) {
      blockers.push({ code: "UNFINISHED_MEMBERSHIP_OPERATION", detail: operation.operationId });
    }
  }

  const unaddressed = (input.keywordTerritoryStates || [])
    .filter(entry => entry.state === "unaddressed")
    .map(entry => entry.keywordId);
  if (unaddressed.length) {
    blockers.push({ code: "UNADDRESSED_KEYWORDS", detail: unaddressed.sort().join(", ") });
  }

  const byId = new Map(input.articles.map(article => [article.articleId, article]));
  const structural = composition.pillarArticleId
    ? [composition.pillarArticleId, ...composition.supportArticleIds]
    : [...composition.supportArticleIds];

  for (const articleId of structural) {
    const article = byId.get(articleId);
    if (!article) continue;
    if (article.territoryRef === null) {
      blockers.push({ code: "LEGACY_ARTICLE_NEEDS_RECONCILIATION", detail: articleId });
      continue;
    }
    if (article.territoryRef !== territory.territoryRef) {
      blockers.push({ code: "ARTICLE_TERRITORIAL_CONFLICT", detail: articleId });
    }
    if (!article.isConsolidated || !article.articleDnaVersionId) {
      blockers.push({ code: "ARTICLE_NOT_CONSOLIDATED", detail: articleId });
    }
    if (!article.isHumanApproved) {
      blockers.push({ code: "ARTICLE_NOT_HUMAN_APPROVED", detail: articleId });
    }
  }

  const plan = planTerritorialSiloComposition({ composition, articles: input.articles });
  for (const issue of plan.issues) {
    if (issue.code === "PILLAR_NOT_SELECTED") blockers.push({ code: "PILLAR_NOT_SELECTED", detail: issue.detail });
    else if (issue.code === "ARTICLE_COVERAGE_GAP") blockers.push({ code: "ARTICLE_COVERAGE_GAP", detail: issue.detail });
    else if (issue.code === "ARTICLE_OUTSIDE_TERRITORY") blockers.push({ code: "ARTICLE_TERRITORIAL_CONFLICT", detail: issue.detail });
    else blockers.push({ code: "ROLE_COMPOSITION_CONFLICT", detail: `${issue.code}: ${issue.detail}` });
  }

  // O par precisa declarar o mesmo território, e declarar algum.
  for (const [label, declared] of [["SiloDNA", input.siloDnaTerritoryRef], ["SiloPage", input.siloPageTerritoryRef]] as const) {
    if (declared === undefined) continue;
    if (declared === null || !declared) {
      blockers.push({ code: "SILO_TERRITORY_REF_MISSING", detail: label });
    } else if (declared !== territory.territoryRef) {
      blockers.push({ code: "SILO_TERRITORY_REF_MISMATCH", detail: `${label}: ${declared}` });
    }
  }

  const published = input.publishedIdentity;
  if (published && (published.verification === "unknown" || published.verification === "conflict")) {
    if (!input.decision?.publishedIdentityResolved) {
      blockers.push({
        code: "PUBLISHED_IDENTITY_DECISION_REQUIRED",
        detail: `${published.siloPageId}: verificação ${published.verification}`,
      });
    }
  }

  // Evidência de estrutura publicada mora na Etapa 0 da Marca, ainda em HOLD.
  // Ausência é ADIAMENTO declarado, não falha e muito menos dado inventado.
  if (published?.publicationStatus === "published" && input.publishedStructureEvidenceAvailable === false) {
    deferred.push({
      code: DEFERRED_EXTERNAL_EVIDENCE,
      detail: "Estrutura publicada do Site/Sitemap indisponível: evidência adiada, não simulada.",
    });
  }

  if (!input.decision) {
    blockers.push({ code: "HUMAN_SILO_CONSOLIDATION_REQUIRED", detail: territory.territoryRef });
  }

  return blockers.length
    ? { state: "blocked", blockers, deferred }
    : { state: "ready", blockers: [], deferred };
}

/* --------------------------- gate de aprovação --------------------------- */

export const SILO_CONSOLIDATION_REFUSAL_CODES = [
  "ONLY_HUMAN_MAY_CONSOLIDATE",
  "SILO_NOT_READY_FOR_CONSOLIDATION",
  "DECISION_DOES_NOT_MATCH_COMPOSITION",
  "SUCCESSOR_REQUIRED",
] as const;
export type SiloConsolidationRefusalCode = (typeof SILO_CONSOLIDATION_REFUSAL_CODES)[number];

export type SiloConsolidationOutcome =
  | { status: "consolidated"; territoryRef: TerritoryRef; pillarArticleId: string; refusals: [] }
  | { status: "refused"; refusals: Array<{ code: SiloConsolidationRefusalCode; detail: string }> };

const sameSet = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());

/**
 * §8 — só decisão humana consolida. Lógica, SERP e IA propõem; nenhuma aprova.
 * A decisão precisa descrever a MESMA arquitetura que está sendo consolidada:
 * aprovar uma composição e gravar outra é o defeito que este gate impede.
 */
export function confirmSiloConsolidation(input: {
  readiness: SiloConsolidationReadiness;
  composition: TerritorialSiloComposition;
  decision: SiloConsolidationDecision;
  actor: "human" | "ai" | "logic" | "serp" | "current";
  /** Silo já consolidado ou publicado: mudança estrutural exige sucessora. */
  alreadyConsolidated?: boolean;
}): SiloConsolidationOutcome {
  const refusals: Array<{ code: SiloConsolidationRefusalCode; detail: string }> = [];

  if (input.actor !== "human") {
    refusals.push({ code: "ONLY_HUMAN_MAY_CONSOLIDATE", detail: input.actor });
  }
  if (input.readiness.state !== "ready") {
    refusals.push({
      code: "SILO_NOT_READY_FOR_CONSOLIDATION",
      detail: input.readiness.blockers.map(blocker => blocker.code).join(", "),
    });
  }
  if (input.alreadyConsolidated) {
    refusals.push({ code: "SUCCESSOR_REQUIRED", detail: "Silo consolidado não muda estrutura in-place." });
  }

  const { decision, composition } = input;
  const excluded = composition.exclusions.map(exclusion => exclusion.articleId);
  if (decision.territoryRef !== composition.territoryRef
    || decision.pillarArticleId !== composition.pillarArticleId
    || !sameSet(decision.supportArticleIds, composition.supportArticleIds)
    || !sameSet(decision.excludedArticleIds, excluded)) {
    refusals.push({
      code: "DECISION_DOES_NOT_MATCH_COMPOSITION",
      detail: "A decisão humana descreve uma arquitetura diferente da que seria consolidada.",
    });
  }

  if (refusals.length) return { status: "refused", refusals };
  return {
    status: "consolidated",
    territoryRef: decision.territoryRef,
    pillarArticleId: decision.pillarArticleId,
    refusals: [],
  };
}
