import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";
import type { TerritoryRef } from "./territory-ref.ts";
import {
  isPartialMembershipOperation,
  resolveArticleFormationReadiness,
  type ArticleFormationReadiness,
  type KeywordTerritoryAssignment,
  type KeywordTerritoryState,
  type MembershipConsistencyReport,
  type TerritoryCandidate,
} from "./territory.ts";

/**
 * Formação de Article DENTRO de um território confirmado — Fase 2B.
 *
 * Este módulo PLANEJA. Não persiste, não consolida ArticleDNA, não cria SiloDNA
 * nem SiloPage, não toca o grafo de links, não chama provider. A saída é um
 * plano que separa o que é proposta, o que é preservado, o que é conflito e o
 * que ficou sem destino — para revisão humana.
 *
 * Separação normativa preservada: Território é ÁREA editorial; Article é
 * UNIDADE dentro dela. `articleId`, `workingArticleId`, slug e keyword principal
 * NUNCA viram `territoryRef`, e `territoryRef` nunca é derivado do Article.
 */

/* ------------------------------- entradas -------------------------------- */

/** Política de proteção do publicado (§8): nunca troca nada automaticamente. */
export const ARTICLE_PUBLICATION_PROTECTIONS = ["unpublished", "reviewable", "locked", "unknown"] as const;
export type ArticlePublicationProtection = (typeof ARTICLE_PUBLICATION_PROTECTIONS)[number];

export type TerritorialArticleKeyword = {
  keywordId: string;
  brandId: string;
  /** Ponteiro único de membership, lido do payload da própria keyword. */
  territoryRef: TerritoryRef | null;
  territoryState: KeywordTerritoryState;
  isPublished: boolean;
  /** Membership de trabalho Article↔Keyword que JÁ existe e é canônica remota. */
  workingArticleId: string | null;
};

export type ExistingArticleState = {
  articleId: string;
  brandId: string;
  /** Ausente = artigo anterior ao fluxo Silo-first. */
  territoryRef: TerritoryRef | null;
  principalKeywordId: string | null;
  keywordIds: readonly string[];
  publicationProtection: ArticlePublicationProtection;
  publishedSlug: string | null;
  publishedCanonical: string | null;
  publishedUrl: string | null;
};

/**
 * Definição editorial mínima do Article (§20). Existe para distinguir a
 * FRONTEIRA de um Article das dos demais Articles do MESMO território — sem
 * ela, dois Articles do mesmo território são indistinguíveis e canibalizam.
 */
export type ArticleDefinitionDraft = {
  mainIntent: string | null;
  audience: string | null;
  promise: string | null;
  antiCannibalizationBoundary: string | null;
};

export const emptyArticleDefinition = (): ArticleDefinitionDraft =>
  ({ mainIntent: null, audience: null, promise: null, antiCannibalizationBoundary: null });

export type ArticleProposalSource = "current" | "logic" | "serp" | "ai" | "human";

export type ArticleProposal = {
  proposalId: string;
  territoryRef: TerritoryRef;
  principalKeywordId: string | null;
  keywordIds: string[];
  definition: ArticleDefinitionDraft;
  source: ArticleProposalSource;
  reasons: string[];
  humanDecisionRequired: string[];
  /** Proposta NUNCA nasce aprovada. Só confirmArticleStructure humana muda isto. */
  humanApproved: false;
};

export type PreservedArticle = {
  articleId: string;
  territoryRef: TerritoryRef | null;
  reason: "PUBLISHED_PROTECTED" | "TERRITORY_CONSOLIDATED" | "OUTSIDE_TERRITORY";
  publicationProtection: ArticlePublicationProtection;
};

export const ARTICLE_FORMATION_CONFLICT_CODES = [
  "TERRITORIAL_CONFLICT",
  "KEYWORD_IN_TWO_ARTICLES",
  "PUBLISHED_PROTECTION_VIOLATION",
  "LEGACY_NEEDS_RECONCILIATION",
  "CROSS_BRAND_ARTICLE",
] as const;
export type ArticleFormationConflictCode = (typeof ARTICLE_FORMATION_CONFLICT_CODES)[number];

export type ArticleFormationConflict = {
  code: ArticleFormationConflictCode;
  detail: string;
  keywordIds?: string[];
  articleId?: string;
  /** Conflito territorial volta para revisão HUMANA. Nada se autocorrige. */
  requiresHumanTerritorialReview: boolean;
};

export const UNALLOCATED_REASONS = [
  "NOT_ADDRESSED",
  "EXPLICITLY_UNASSIGNED",
  "RESERVED_BY_HUMAN",
  "NO_PROPOSAL_YET",
] as const;
export type UnallocatedReason = (typeof UNALLOCATED_REASONS)[number];

export type UnallocatedKeyword = { keywordId: string; reason: UnallocatedReason };

export type ArticleFormationPlan = {
  territoryRef: TerritoryRef;
  readiness: ArticleFormationReadiness;
  proposals: ArticleProposal[];
  preserved: PreservedArticle[];
  conflicts: ArticleFormationConflict[];
  unallocatedKeywords: UnallocatedKeyword[];
  issues: string[];
};

/* ------------------------------- formação -------------------------------- */

export type ArticleFormationInput = {
  territory: TerritoryCandidate;
  report: MembershipConsistencyReport;
  assignments: readonly KeywordTerritoryAssignment[];
  keywords: readonly TerritorialArticleKeyword[];
  existingArticles: readonly ExistingArticleState[];
  /** Agrupamentos propostos por Lógica/SERP/IA/humano. Vazio = nada a propor. */
  groupings?: ReadonlyArray<{
    proposalId: string;
    keywordIds: readonly string[];
    principalKeywordId: string | null;
    definition?: ArticleDefinitionDraft;
    source: ArticleProposalSource;
    reasons?: readonly string[];
  }>;
};

/**
 * Gate de entrada + plano. Território que não está `confirmed` não produz
 * proposta nenhuma — o plano volta com `readiness.state = "blocked"` e a lista
 * de proposals vazia. `consolidated` PRESERVA os Articles existentes e exige
 * sucessor para mudança estrutural.
 */
export function planArticleFormationForTerritory(input: ArticleFormationInput): ArticleFormationPlan {
  const { territory } = input;
  const territoryRef = territory.territoryRef;
  const readiness = resolveArticleFormationReadiness({
    territory,
    report: input.report,
    assignments: input.assignments,
  });

  const conflicts: ArticleFormationConflict[] = [];
  const issues: string[] = [];
  const preserved: PreservedArticle[] = [];

  // Publicado é preservado ANTES de qualquer proposta, em qualquer lifecycle.
  for (const article of input.existingArticles) {
    if (article.brandId !== territory.brandId) {
      conflicts.push({
        code: "CROSS_BRAND_ARTICLE",
        detail: article.articleId,
        articleId: article.articleId,
        requiresHumanTerritorialReview: true,
      });
      continue;
    }
    if (article.territoryRef === null) {
      // §15: nunca anexar automaticamente. Similaridade pode sugerir; humano confirma.
      conflicts.push({
        code: "LEGACY_NEEDS_RECONCILIATION",
        detail: article.articleId,
        articleId: article.articleId,
        requiresHumanTerritorialReview: true,
      });
      preserved.push({
        articleId: article.articleId,
        territoryRef: null,
        reason: "OUTSIDE_TERRITORY",
        publicationProtection: article.publicationProtection,
      });
      continue;
    }
    if (article.territoryRef !== territoryRef) {
      preserved.push({
        articleId: article.articleId,
        territoryRef: article.territoryRef,
        reason: "OUTSIDE_TERRITORY",
        publicationProtection: article.publicationProtection,
      });
      continue;
    }
    if (article.publicationProtection !== "unpublished") {
      preserved.push({
        articleId: article.articleId,
        territoryRef,
        reason: "PUBLISHED_PROTECTED",
        publicationProtection: article.publicationProtection,
      });
    }
    if (territory.lifecycleStatus === "consolidated") {
      preserved.push({
        articleId: article.articleId,
        territoryRef,
        reason: "TERRITORY_CONSOLIDATED",
        publicationProtection: article.publicationProtection,
      });
    }
  }

  if (readiness.state === "blocked") {
    issues.push(...readiness.refusals.map(refusal => `${refusal.code}: ${refusal.detail}`));
    return {
      territoryRef,
      readiness,
      proposals: [],
      preserved: dedupePreserved(preserved),
      conflicts,
      unallocatedKeywords: unallocatedFrom(input.keywords, territoryRef, new Set()),
      issues,
    };
  }

  // Escopo: SOMENTE keywords cujo territoryRef é o deste território.
  const inTerritory = new Set(
    input.keywords.filter(keyword => keyword.territoryState === "assigned" && keyword.territoryRef === territoryRef)
      .map(keyword => keyword.keywordId),
  );

  const allocated = new Set<string>();
  const keywordToProposals = new Map<string, string[]>();
  const proposals: ArticleProposal[] = [];

  for (const grouping of input.groupings || []) {
    const requested = [...new Set(grouping.keywordIds)];
    const foreign = requested.filter(keywordId => !inTerritory.has(keywordId));
    if (foreign.length) {
      // §5: NUNCA mover keyword para fazer o Article fechar.
      conflicts.push({
        code: "TERRITORIAL_CONFLICT",
        detail: `A proposta ${grouping.proposalId} usa keyword de fora do território.`,
        keywordIds: foreign.sort(),
        requiresHumanTerritorialReview: true,
      });
      continue;
    }
    for (const keywordId of requested) {
      keywordToProposals.set(keywordId, [...(keywordToProposals.get(keywordId) || []), grouping.proposalId]);
      allocated.add(keywordId);
    }
    proposals.push({
      proposalId: grouping.proposalId,
      territoryRef,
      principalKeywordId: grouping.principalKeywordId,
      keywordIds: requested.sort(),
      definition: grouping.definition || emptyArticleDefinition(),
      source: grouping.source,
      reasons: [...(grouping.reasons || [])],
      humanDecisionRequired: [],
      humanApproved: false,
    });
  }

  // §12: a mesma keyword não pode estar em dois Articles da mesma versão.
  for (const [keywordId, proposalIds] of keywordToProposals) {
    if (proposalIds.length > 1) {
      conflicts.push({
        code: "KEYWORD_IN_TWO_ARTICLES",
        detail: proposalIds.sort().join(", "),
        keywordIds: [keywordId],
        requiresHumanTerritorialReview: false,
      });
    }
  }

  // Keyword já publicada sob outro Article não pode ser realocada em silêncio.
  const publishedOwner = new Map<string, ExistingArticleState>();
  for (const article of input.existingArticles) {
    if (article.publicationProtection === "unpublished") continue;
    for (const keywordId of article.keywordIds) publishedOwner.set(keywordId, article);
  }
  for (const proposal of proposals) {
    for (const keywordId of proposal.keywordIds) {
      const owner = publishedOwner.get(keywordId);
      if (owner && !proposal.proposalId.includes(owner.articleId)) {
        conflicts.push({
          code: "PUBLISHED_PROTECTION_VIOLATION",
          detail: `A keyword pertence ao artigo publicado ${owner.articleId}.`,
          keywordIds: [keywordId],
          articleId: owner.articleId,
          requiresHumanTerritorialReview: false,
        });
      }
    }
  }

  return {
    territoryRef,
    readiness,
    proposals,
    preserved: dedupePreserved(preserved),
    conflicts,
    unallocatedKeywords: unallocatedFrom(input.keywords, territoryRef, allocated),
    issues,
  };
}

function dedupePreserved(preserved: PreservedArticle[]): PreservedArticle[] {
  const seen = new Set<string>();
  return preserved.filter(item => {
    const key = `${item.articleId}|${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * §12 — COBERTURA. Nenhuma keyword endereçada desaparece: ou está alocada, ou
 * aparece aqui com o motivo. `NOT_ADDRESSED` e `EXPLICITLY_UNASSIGNED` são
 * motivos DIFERENTES e continuam separados até o fim do plano.
 */
function unallocatedFrom(
  keywords: readonly TerritorialArticleKeyword[],
  territoryRef: TerritoryRef,
  allocated: ReadonlySet<string>,
): UnallocatedKeyword[] {
  const result: UnallocatedKeyword[] = [];
  for (const keyword of keywords) {
    if (allocated.has(keyword.keywordId)) continue;
    if (keyword.territoryState === "unaddressed") {
      result.push({ keywordId: keyword.keywordId, reason: "NOT_ADDRESSED" });
      continue;
    }
    if (keyword.territoryState === "explicit_unassigned") {
      result.push({ keywordId: keyword.keywordId, reason: "EXPLICITLY_UNASSIGNED" });
      continue;
    }
    if (keyword.territoryRef === territoryRef) {
      result.push({ keywordId: keyword.keywordId, reason: "NO_PROPOSAL_YET" });
    }
  }
  return result.sort((left, right) => left.keywordId.localeCompare(right.keywordId));
}

/* -------------------------- readiness de confirmação --------------------- */

export const ARTICLE_CONFIRMATION_BLOCKER_CODES = [
  "ARTICLE_WITHOUT_PRINCIPAL",
  "ARTICLE_WITH_MULTIPLE_PRINCIPALS",
  "ARTICLE_KEYWORD_LIMIT_EXCEEDED",
  "ARTICLE_WITHOUT_KEYWORDS",
  "KEYWORD_OUTSIDE_TERRITORY",
  "KEYWORD_SHARED_WITH_INCOMPATIBLE_ARTICLE",
  "ARTICLE_DEFINITION_INCOMPLETE",
  "TERRITORIAL_CONFLICT",
  "PUBLICATION_PROTECTION_CONFLICT",
  "HUMAN_DECISION_PENDING",
  "PARTIAL_OPERATION_PENDING",
  "STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR",
] as const;
export type ArticleConfirmationBlockerCode = (typeof ARTICLE_CONFIRMATION_BLOCKER_CODES)[number];

export type ArticleConfirmationBlocker = { code: ArticleConfirmationBlockerCode; detail: string };

export type ArticleConfirmationReadiness =
  | { state: "ready"; blockers: [] }
  | { state: "blocked"; blockers: ArticleConfirmationBlocker[] };

export type ArticleConfirmationInput = {
  territory: TerritoryCandidate;
  proposal: ArticleProposal;
  keywords: readonly TerritorialArticleKeyword[];
  /** Outras propostas da MESMA versão estrutural. */
  siblingProposals?: readonly ArticleProposal[];
  existingArticles?: readonly ExistingArticleState[];
  conflicts?: readonly ArticleFormationConflict[];
  pendingHumanDecisions?: readonly string[];
  /** Decisoes humanas explicitas sobre protecao de publicacao desconhecida. */
  protectionDecisions?: readonly PublicationProtectionDecision[];
};

/**
 * FORMATION != CONFIRMATION.
 *
 * FORMATION responde "podemos propor um Article aqui?".
 * CONFIRMATION responde "esta estrutura está resolvida a ponto de consolidar?".
 *
 * O teto de 6 keywords é TETO, não meta: um Article com uma única keyword é
 * confirmável. Nada aqui completa a lista artificialmente.
 */
export function resolveArticleConfirmationReadiness(input: ArticleConfirmationInput): ArticleConfirmationReadiness {
  const { proposal, territory } = input;
  const blockers: ArticleConfirmationBlocker[] = [];
  const keywordById = new Map(input.keywords.map(keyword => [keyword.keywordId, keyword]));

  if (!proposal.keywordIds.length) {
    blockers.push({ code: "ARTICLE_WITHOUT_KEYWORDS", detail: proposal.proposalId });
  }
  if (!proposal.principalKeywordId) {
    blockers.push({ code: "ARTICLE_WITHOUT_PRINCIPAL", detail: proposal.proposalId });
  } else if (!proposal.keywordIds.includes(proposal.principalKeywordId)) {
    blockers.push({ code: "ARTICLE_WITHOUT_PRINCIPAL", detail: "A principal declarada não está entre as keywords." });
  }
  const declaredPrincipals = proposal.keywordIds.filter(keywordId => keywordId === proposal.principalKeywordId);
  if (declaredPrincipals.length > 1) {
    blockers.push({ code: "ARTICLE_WITH_MULTIPLE_PRINCIPALS", detail: proposal.proposalId });
  }
  if (proposal.keywordIds.length > MAX_KEYWORDS_PER_ARTICLE) {
    blockers.push({
      code: "ARTICLE_KEYWORD_LIMIT_EXCEEDED",
      detail: `${proposal.keywordIds.length} > ${MAX_KEYWORDS_PER_ARTICLE}`,
    });
  }

  const foreign = proposal.keywordIds.filter(keywordId => {
    const keyword = keywordById.get(keywordId);
    return !keyword || keyword.territoryState !== "assigned" || keyword.territoryRef !== proposal.territoryRef;
  });
  if (foreign.length) {
    blockers.push({ code: "KEYWORD_OUTSIDE_TERRITORY", detail: foreign.sort().join(", ") });
  }

  const siblingOwners = new Map<string, string>();
  for (const sibling of input.siblingProposals || []) {
    if (sibling.proposalId === proposal.proposalId) continue;
    for (const keywordId of sibling.keywordIds) siblingOwners.set(keywordId, sibling.proposalId);
  }
  const shared = proposal.keywordIds.filter(keywordId => siblingOwners.has(keywordId));
  if (shared.length) {
    blockers.push({
      code: "KEYWORD_SHARED_WITH_INCOMPATIBLE_ARTICLE",
      detail: shared.map(keywordId => `${keywordId}→${siblingOwners.get(keywordId)}`).sort().join(", "),
    });
  }

  const definitionGaps = (Object.entries(proposal.definition) as Array<[string, string | null]>)
    .filter(([, value]) => !value || !value.trim())
    .map(([field]) => field);
  if (definitionGaps.length) {
    blockers.push({ code: "ARTICLE_DEFINITION_INCOMPLETE", detail: definitionGaps.sort().join(", ") });
  }

  for (const conflict of input.conflicts || []) {
    if (conflict.code === "TERRITORIAL_CONFLICT") {
      blockers.push({ code: "TERRITORIAL_CONFLICT", detail: conflict.detail });
    }
    if (conflict.code === "PUBLISHED_PROTECTION_VIOLATION") {
      blockers.push({ code: "PUBLICATION_PROTECTION_CONFLICT", detail: conflict.detail });
    }
  }

  // Proteção `unknown` NÃO se resolve por inércia: "a principal não mudou"
  // descreve o estado, não a decisão. Só um registro humano explícito resolve.
  const decisionByArticle = new Map(
    (input.protectionDecisions || []).map(decision => [decision.articleId, decision]),
  );
  for (const article of input.existingArticles || []) {
    if (article.publicationProtection !== "unknown") continue;
    const touches = proposal.keywordIds.some(keywordId => article.keywordIds.includes(keywordId));
    if (!touches) continue;
    const state = resolveUnknownProtectionState({
      article,
      intendedPrincipalKeywordId: proposal.principalKeywordId,
      decision: decisionByArticle.get(article.articleId) || null,
    });
    if (state === "PROTECTION_CONFLICT") {
      blockers.push({
        code: "PUBLICATION_PROTECTION_CONFLICT",
        detail: `Proteção desconhecida em ${article.articleId}: trocar a principal publicada exige decisão humana.`,
      });
    }
    if (state === "HUMAN_DECISION_REQUIRED") {
      blockers.push({
        code: "HUMAN_DECISION_PENDING",
        detail: `Proteção desconhecida em ${article.articleId}: preservar a principal também precisa ser decidido.`,
      });
    }
    if (state === "STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR") {
      blockers.push({
        code: "STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR",
        detail: `A mudança estrutural liberada em ${article.articleId} exige versão sucessora.`,
      });
    }
  }

  for (const pending of input.pendingHumanDecisions || []) {
    blockers.push({ code: "HUMAN_DECISION_PENDING", detail: pending });
  }
  if (proposal.humanDecisionRequired.length) {
    blockers.push({ code: "HUMAN_DECISION_PENDING", detail: proposal.humanDecisionRequired.sort().join(", ") });
  }

  // Operação de membership parcial no território congela a confirmação.
  if (isPartialMembershipOperation(territory.pendingOperation)) {
    blockers.push({
      code: "PARTIAL_OPERATION_PENDING",
      detail: territory.pendingOperation?.operationId || territory.territoryRef,
    });
  }

  return blockers.length ? { state: "blocked", blockers } : { state: "ready", blockers: [] };
}

/* --------------------------- gate de aprovação --------------------------- */

export const ARTICLE_APPROVAL_REFUSAL_CODES = [
  "ONLY_HUMAN_MAY_APPROVE",
  "ARTICLE_NOT_READY_FOR_CONFIRMATION",
] as const;
export type ArticleApprovalRefusalCode = (typeof ARTICLE_APPROVAL_REFUSAL_CODES)[number];

export type ArticleStructureConfirmation =
  | { status: "confirmed"; proposalId: string; actorUserId: string; confirmedAt: string; refusals: [] }
  | { status: "refused"; proposalId: string; refusals: Array<{ code: ArticleApprovalRefusalCode; detail: string }> };

/**
 * §7 e §18 — SOMENTE decisão humana fecha a estrutura. Lógica, SERP e IA
 * produzem evidência e proposta; nenhuma delas aprova. IA nem sequer chega aqui
 * com `actor` válido: a recusa é por contrato, não por convenção.
 */
export function confirmArticleStructure(input: {
  proposal: ArticleProposal;
  readiness: ArticleConfirmationReadiness;
  actor: ArticleProposalSource;
  actorUserId: string;
  confirmedAt: string;
}): ArticleStructureConfirmation {
  const refusals: Array<{ code: ArticleApprovalRefusalCode; detail: string }> = [];
  if (input.actor !== "human") {
    refusals.push({ code: "ONLY_HUMAN_MAY_APPROVE", detail: input.actor });
  }
  if (input.readiness.state !== "ready") {
    refusals.push({
      code: "ARTICLE_NOT_READY_FOR_CONFIRMATION",
      detail: input.readiness.blockers.map(blocker => blocker.code).join(", "),
    });
  }
  return refusals.length
    ? { status: "refused", proposalId: input.proposal.proposalId, refusals }
    : {
      status: "confirmed",
      proposalId: input.proposal.proposalId,
      actorUserId: input.actorUserId,
      confirmedAt: input.confirmedAt,
      refusals: [],
    };
}

/**
 * §10 — guarda explícita. Nenhuma identidade de Article vira território.
 * Devolve sempre `null`: existe para que a intenção seja legível em código e
 * para que um teste possa provar a recusa.
 */
export function articleIdentityIsNeverTerritory(identity: {
  articleId?: string | null;
  workingArticleId?: string | null;
  slug?: string | null;
  principalKeywordId?: string | null;
  siloId?: string | null;
  listaId?: string | null;
}): null {
  // Lê a entrada de propósito: a recusa é sobre ESTAS identidades, e um
  // parâmetro ignorado esconderia que nenhuma delas foi consultada como origem.
  void Object.keys(identity);
  return null;
}

/* ------------------- proteção de publicação desconhecida ----------------- */

/**
 * §4 — `unknown` NÃO se resolve por inércia.
 *
 * "A principal não mudou" descreve o estado, não a decisão: alguém precisa
 * declarar que examinou a publicação e resolveu preservar. Sem esse registro, a
 * proteção continua pendente mesmo quando nada foi tocado.
 *
 * O shape segue o precedente já usado no KGR do artigo — decisão explícita com
 * ator, momento e motivo — em vez de um booleano paralelo.
 */
export const PROTECTION_DECISIONS = ["preserve_principal", "allow_structural_change"] as const;
export type ProtectionDecisionKind = (typeof PROTECTION_DECISIONS)[number];

export type PublicationProtectionDecision = {
  articleId: string;
  decision: ProtectionDecisionKind;
  actorUserId: string;
  decidedAt: string;
  reason: string;
};

export const UNKNOWN_PROTECTION_STATES = [
  "HUMAN_DECISION_REQUIRED",
  "PROTECTION_CONFLICT",
  "RESOLVED_PRESERVED",
  "STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR",
] as const;
export type UnknownProtectionState = (typeof UNKNOWN_PROTECTION_STATES)[number];

/**
 * Os quatro estados do §4, resolvidos explicitamente.
 *
 * A. preservada + sem decisão   → HUMAN_DECISION_REQUIRED
 * B. tentativa de troca         → PROTECTION_CONFLICT
 * C. decisão humana: preservar  → RESOLVED_PRESERVED
 * D. decisão humana: permitir   → STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR
 */
export function resolveUnknownProtectionState(input: {
  article: ExistingArticleState;
  intendedPrincipalKeywordId: string | null;
  decision: PublicationProtectionDecision | null;
}): UnknownProtectionState {
  const principalPreserved =
    input.article.principalKeywordId === null ||
    input.intendedPrincipalKeywordId === input.article.principalKeywordId;

  if (input.decision?.decision === "allow_structural_change") {
    // Permitir mudar não é executar a mudança aqui: ela passa pelo fluxo
    // estrutural, que preserva histórico criando uma versão sucessora.
    return "STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR";
  }
  if (!principalPreserved) return "PROTECTION_CONFLICT";
  if (input.decision?.decision === "preserve_principal") return "RESOLVED_PRESERVED";
  return "HUMAN_DECISION_REQUIRED";
}

/* --------------------- consolidação do ArticleDNA novo ------------------- */

export const ARTICLE_CONSOLIDATION_REFUSAL_CODES = [
  "NEW_SILO_FIRST_ARTICLE_WITHOUT_TERRITORY",
  "ARTICLE_KEYWORD_OUTSIDE_TERRITORY",
  "ARTICLE_BRAND_MISMATCH",
  "TERRITORY_CHANGE_REQUIRES_SUCCESSOR",
  "WORKING_MEMBERSHIP_DIVERGES_FROM_COMPOSITION",
  "ROLE_DUPLICATE_KEYWORD",
  "ADDITIONAL_KEYWORD_LIMIT_EXCEEDED",
  "ARTICLE_NOT_READY_FOR_CONFIRMATION",
] as const;
export type ArticleConsolidationRefusalCode = (typeof ARTICLE_CONSOLIDATION_REFUSAL_CODES)[number];

export type ArticleConsolidationRefusal = { code: ArticleConsolidationRefusalCode; detail: string };

export type ArticleCompositionDraft = {
  articleId: string;
  brandId: string;
  territoryRef: TerritoryRef | null;
  principalKeywordId: string;
  secondaryKeywordIds: readonly string[];
  narrativeReinforcementIds: readonly string[];
};

export type ArticleConsolidationPlan =
  | { status: "allowed"; intent: "create" | "successor"; articleId: string; territoryRef: TerritoryRef; refusals: [] }
  | { status: "refused"; articleId: string; refusals: ArticleConsolidationRefusal[] };

/** Adicionais = secundárias + reforços. O teto de 5 é sobre a SOMA. */
export const MAX_ADDITIONAL_KEYWORDS_PER_ARTICLE = MAX_KEYWORDS_PER_ARTICLE - 1;

/**
 * §2, §3 e §6 — gate de consolidação do fluxo Silo-first.
 *
 * LEGACY_READ_COMPATIBILITY e NEW_ARTICLE_CONSOLIDATION_REQUIREMENTS são coisas
 * diferentes: `ArticleDNASchema.territoryRef` continua OPCIONAL para que o
 * histórico anterior à 2B permaneça legível, e este gate exige o território em
 * todo ArticleDNA NOVO produzido pelo fluxo territorial. Tornar o campo
 * obrigatório no schema quebraria a leitura do histórico.
 */
export function planArticleDnaConsolidation(input: {
  composition: ArticleCompositionDraft;
  territory: TerritoryCandidate;
  readiness: ArticleConfirmationReadiness;
  keywords: readonly TerritorialArticleKeyword[];
  /** Membership de trabalho vigente: keywordId → workingArticleId. */
  workingMembership: ReadonlyMap<string, string | null>;
  /** Versão consolidada anterior, quando existir. */
  consolidatedVersion?: { articleId: string; territoryRef: TerritoryRef | null } | null;
}): ArticleConsolidationPlan {
  const { composition, territory } = input;
  const refusals: ArticleConsolidationRefusal[] = [];

  if (!composition.territoryRef) {
    refusals.push({ code: "NEW_SILO_FIRST_ARTICLE_WITHOUT_TERRITORY", detail: composition.articleId });
  }
  if (composition.brandId !== territory.brandId) {
    refusals.push({ code: "ARTICLE_BRAND_MISMATCH", detail: composition.brandId + " != " + territory.brandId });
  }

  const all = [
    composition.principalKeywordId,
    ...composition.secondaryKeywordIds,
    ...composition.narrativeReinforcementIds,
  ];
  const duplicates = all.filter((id, index) => all.indexOf(id) !== index);
  if (duplicates.length) {
    refusals.push({ code: "ROLE_DUPLICATE_KEYWORD", detail: [...new Set(duplicates)].sort().join(", ") });
  }
  const additional = composition.secondaryKeywordIds.length + composition.narrativeReinforcementIds.length;
  if (additional > MAX_ADDITIONAL_KEYWORDS_PER_ARTICLE) {
    refusals.push({
      code: "ADDITIONAL_KEYWORD_LIMIT_EXCEEDED",
      detail: additional + " > " + MAX_ADDITIONAL_KEYWORDS_PER_ARTICLE,
    });
  }

  const keywordById = new Map(input.keywords.map(keyword => [keyword.keywordId, keyword]));
  const foreign = [...new Set(all)].filter(keywordId => {
    const keyword = keywordById.get(keywordId);
    return !keyword || keyword.territoryState !== "assigned" || keyword.territoryRef !== composition.territoryRef;
  });
  if (foreign.length) {
    refusals.push({ code: "ARTICLE_KEYWORD_OUTSIDE_TERRITORY", detail: foreign.sort().join(", ") });
  }

  // §6: a working membership aprovada precisa corresponder à composição gravada.
  // Depois disto o ArticleDNA NÃO acompanha mudanças do workingArticleId.
  const divergent = [...new Set(all)].filter(keywordId => input.workingMembership.get(keywordId) !== composition.articleId);
  const extraneous = [...input.workingMembership.entries()]
    .filter(([keywordId, articleId]) => articleId === composition.articleId && !all.includes(keywordId))
    .map(([keywordId]) => keywordId);
  if (divergent.length || extraneous.length) {
    refusals.push({
      code: "WORKING_MEMBERSHIP_DIVERGES_FROM_COMPOSITION",
      detail: [
        divergent.length ? "fora da working copy: " + divergent.sort().join(", ") : "",
        extraneous.length ? "na working copy e fora da composicao: " + extraneous.sort().join(", ") : "",
      ].filter(Boolean).join(" | "),
    });
  }

  // §3: território consolidado é identidade da versão. Trocar exige sucessora.
  const previous = input.consolidatedVersion;
  if (previous && previous.territoryRef && previous.territoryRef !== composition.territoryRef) {
    refusals.push({
      code: "TERRITORY_CHANGE_REQUIRES_SUCCESSOR",
      detail: previous.territoryRef + " -> " + composition.territoryRef,
    });
  }

  if (input.readiness.state !== "ready") {
    refusals.push({
      code: "ARTICLE_NOT_READY_FOR_CONFIRMATION",
      detail: input.readiness.blockers.map(blocker => blocker.code).join(", "),
    });
  }

  if (refusals.length) return { status: "refused", articleId: composition.articleId, refusals };
  return {
    status: "allowed",
    intent: previous ? "successor" : "create",
    articleId: composition.articleId,
    territoryRef: composition.territoryRef as TerritoryRef,
    refusals: [],
  };
}

/**
 * §7 — ArticleDNA sem território é LEGADO, não "sem território por decisão".
 * Nenhuma inferência por siloId, lista_id, workingArticleId, slug, principal ou
 * similaridade: a função só reconhece a ausência.
 */
export function articleNeedsTerritorialReconciliation(article: { territoryRef?: string | null }): boolean {
  return !article.territoryRef;
}
