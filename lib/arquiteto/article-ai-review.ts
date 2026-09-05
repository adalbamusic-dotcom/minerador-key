import { z } from "zod";
import { ContentHashSchema, versionEnvelopeSchema, type VersionEnvelope } from "./contracts.ts";
import { contentHash } from "./versioning.ts";

/**
 * Revisão arquitetural por IA como artefato canônico versionado.
 *
 * Decisão do Planner do Arquiteto (2026-08-29): reutilizar
 * `editorial_artifact_versions` — nenhuma tabela nova. O escopo é
 * `marca_id + artifact_type + entity_id`, com `entity_id = articleId`.
 *
 * O payload é deliberadamente determinístico: nada de timestamp de execução,
 * seleção de UI ou identificador de request dentro dele. O `contentHash` é
 * calculado sobre este payload, então idempotência (mesma base + mesmo
 * resultado → UNCHANGED) e detecção de base alterada saem de graça. O momento
 * da execução e o da decisão humana vivem no `createdAt` do envelope.
 */
export const ARTICLE_AI_REVIEW_ARTIFACT_TYPE = "article_architecture_ai_review" as const;

/** Versão da projeção estratégica enviada ao provider nesta revisão. */
export const ARTICLE_AI_REVIEW_PROJECTION = "ai-strategic-payload@1" as const;

export const ArticleAiReviewStateSchema = z.enum([
  "COMPLETED_NO_PROPOSALS",
  "COMPLETED_WITH_PROPOSALS",
]);
export type ArticleAiReviewState = z.infer<typeof ArticleAiReviewStateSchema>;

/** Estado humano por proposta; não confundir com aprovação do ArticleDNA. */
export const ArticleAiProposalReviewStateSchema = z.enum(["pending", "accepted", "rejected"]);

export const ArticleAiReviewBaseSchema = z.object({
  articleContentHash: ContentHashSchema,
  articleVersionId: z.string().min(1).nullable(),
  articleVersionNumber: z.number().int().positive().nullable(),
  principalKeywordId: z.string().min(1).nullable(),
  keywordIds: z.array(z.string().min(1)),
  serpAssessmentId: z.string().min(1).nullable(),
  serpAssessmentVersion: z.number().int().positive().nullable(),
  serpAssessmentContentHash: z.string().min(1).nullable(),
}).strict();
export type ArticleAiReviewBase = z.infer<typeof ArticleAiReviewBaseSchema>;

export const ArticleAiProposalSchema = z.object({
  proposalId: z.string().min(1),
  keywordId: z.string().min(1),
  keyword: z.string().min(1).nullable(),
  changeType: z.enum(["manter_no_artigo", "mover_para_artigo", "reforcar_publicado", "criar_novo_artigo"]),
  currentState: z.object({
    role: z.enum(["principal", "secundaria", "reforco_narrativo"]).nullable(),
    articleId: z.string().min(1),
    siloId: z.string().min(1).nullable(),
  }).strict(),
  proposedState: z.object({
    role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
    targetArticleId: z.string().min(1).nullable(),
    newArticleKey: z.string().min(1).nullable(),
    siloAction: z.enum(["manter_silo", "usar_silo_existente", "propor_novo_silo"]),
    siloId: z.string().min(1).nullable(),
    siloName: z.string().min(1).nullable(),
    newSiloKey: z.string().min(1).nullable(),
  }).strict(),
  reason: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  materialChange: z.literal(true),
  reviewState: ArticleAiProposalReviewStateSchema,
  decidedBy: z.string().min(1).nullable(),
}).strict();
export type ArticleAiProposal = z.infer<typeof ArticleAiProposalSchema>;

export const ArticleArchitectureAiReviewSchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  base: ArticleAiReviewBaseSchema,
  execution: z.object({
    state: ArticleAiReviewStateSchema,
    provider: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    promptContract: z.string().min(1).nullable(),
    strategicProjection: z.string().min(1),
    rawProposalCount: z.number().int().nonnegative(),
    materialProposalCount: z.number().int().nonnegative(),
  }).strict(),
  proposals: z.array(ArticleAiProposalSchema),
  humanDecision: z.enum(["no_action", "pending", "partially_decided", "resolved"]),
}).strict().superRefine((review, context) => {
  const material = review.execution.materialProposalCount;
  if ((review.execution.state === "COMPLETED_WITH_PROPOSALS") !== material > 0) {
    context.addIssue({ code: "custom", path: ["execution", "state"], message: "O estado precisa refletir a existência de proposta material." });
  }
  if (review.proposals.length !== material) {
    context.addIssue({ code: "custom", path: ["proposals"], message: "As propostas persistidas precisam corresponder à contagem material." });
  }
  if ((review.humanDecision === "no_action") !== (material === 0)) {
    context.addIssue({ code: "custom", path: ["humanDecision"], message: "Sem proposta material, a decisão humana é no_action." });
  }
});
export type ArticleArchitectureAiReview = z.infer<typeof ArticleArchitectureAiReviewSchema>;

export const VersionedArticleArchitectureAiReviewSchema = versionEnvelopeSchema(ArticleArchitectureAiReviewSchema);
export type VersionedArticleArchitectureAiReview = VersionEnvelope<ArticleArchitectureAiReview>;

/** Identificador estável: a mesma proposta reexecutada não muda de id. */
export function articleAiProposalId(articleId: string, keywordId: string, changeType: string) {
  return `ai-proposal:${articleId}:${keywordId}:${changeType}`;
}

export type ArticleStructuralRole = "principal" | "secundaria" | "reforco_narrativo";

/**
 * Papel estrutural canônico da keyword dentro do Article.
 *
 * `principalKeywordId` é a autoridade: nenhum estado transitório da cópia de
 * trabalho cria uma segunda Principal. A distinção Secundária × Reforço
 * narrativo é estrutural e é preservada; qualquer outro valor — inclusive
 * ausência de papel — colapsa em Secundária.
 */
export function canonicalArticleKeywordRole(input: {
  keywordId: string;
  role?: string | null;
  principalKeywordId: string | null;
}): ArticleStructuralRole {
  if (input.principalKeywordId && input.keywordId === input.principalKeywordId) return "principal";
  return input.role === "reforco_narrativo" ? "reforco_narrativo" : "secundaria";
}

/** Estrutura editorial normalizada e ordenada por identidade estável. */
export function canonicalArticleStructuralKeywords(
  keywords: ReadonlyArray<{ keywordId: string; role?: string | null }>,
  principalKeywordId: string | null,
): Array<{ keywordId: string; role: ArticleStructuralRole }> {
  return [...keywords]
    .map(keyword => ({
      keywordId: keyword.keywordId,
      role: canonicalArticleKeywordRole({ keywordId: keyword.keywordId, role: keyword.role, principalKeywordId }),
    }))
    .sort((first, second) => first.keywordId.localeCompare(second.keywordId));
}

/**
 * Base arquitetural revisada. Quando existe ArticleDNA consolidado, a base é a
 * versão canônica dele; um Article em formação usa a estrutura vigente da cópia
 * de trabalho, que é o que a IA de fato leu.
 */
export async function resolveArticleAiReviewBase(input: {
  articleId: string;
  principalKeywordId: string | null;
  keywords: ReadonlyArray<{ keywordId: string; role: "principal" | "secundaria" | "reforco_narrativo" | null }>;
  articleDna?: { versionId: string; versionNumber: number; contentHash: string } | null;
  serpAssessment?: { id: string; version: number; contentHash: string } | null;
}): Promise<ArticleAiReviewBase> {
  const keywordIds = [...input.keywords.map(keyword => keyword.keywordId)].sort();
  const articleContentHash = input.articleDna?.contentHash || await contentHash({
    articleId: input.articleId,
    principalKeywordId: input.principalKeywordId,
    // Silo NÃO entra na identidade estrutural. A revisão da IA é sobre a
    // formação do Article — pertencimento, Principal e papéis — e acontece
    // antes da etapa de Silos. Atribuir ou trocar o Silo depois é avanço
    // correto do pipeline, não mudança da estrutura revisada.
    //
    // Papéis canônicos, nunca o `reviewRole` cru: a cópia de trabalho pode
    // exibir dois "principal" transitórios e a mesma arquitetura passaria a
    // hashear diferente depois do reload.
    keywords: canonicalArticleStructuralKeywords(input.keywords, input.principalKeywordId),
  });
  return {
    articleContentHash,
    articleVersionId: input.articleDna?.versionId || null,
    articleVersionNumber: input.articleDna?.versionNumber || null,
    principalKeywordId: input.principalKeywordId,
    keywordIds,
    serpAssessmentId: input.serpAssessment?.id || null,
    serpAssessmentVersion: input.serpAssessment?.version || null,
    serpAssessmentContentHash: input.serpAssessment?.contentHash || null,
  };
}

export type ArticleAiReviewProposalInput = {
  keywordId: string;
  keyword: string | null;
  changeType: ArticleAiProposal["changeType"];
  currentRole: ArticleAiProposal["currentState"]["role"];
  currentSiloId: string | null;
  proposedRole: ArticleAiProposal["proposedState"]["role"];
  targetArticleId: string | null;
  newArticleKey: string | null;
  siloAction: ArticleAiProposal["proposedState"]["siloAction"];
  siloId: string | null;
  siloName: string | null;
  newSiloKey: string | null;
  reason: string;
  evidence: readonly string[];
};

/** Monta o payload canônico; NO_OP é resultado válido, não ausência de registro. */
export function buildArticleAiReviewPayload(input: {
  brandId: string;
  articleId: string;
  base: ArticleAiReviewBase;
  provider: string | null;
  model: string | null;
  promptContract: string | null;
  rawProposalCount: number;
  proposals: readonly ArticleAiReviewProposalInput[];
}): ArticleArchitectureAiReview {
  const proposals: ArticleAiProposal[] = input.proposals.map(proposal => ({
    proposalId: articleAiProposalId(input.articleId, proposal.keywordId, proposal.changeType),
    keywordId: proposal.keywordId,
    keyword: proposal.keyword,
    changeType: proposal.changeType,
    currentState: { role: proposal.currentRole, articleId: input.articleId, siloId: proposal.currentSiloId },
    proposedState: {
      role: proposal.proposedRole,
      targetArticleId: proposal.targetArticleId,
      newArticleKey: proposal.newArticleKey,
      siloAction: proposal.siloAction,
      siloId: proposal.siloId,
      siloName: proposal.siloName,
      newSiloKey: proposal.newSiloKey,
    },
    reason: proposal.reason,
    evidence: [...proposal.evidence],
    materialChange: true as const,
    reviewState: "pending" as const,
    decidedBy: null,
  })).sort((first, second) => first.proposalId.localeCompare(second.proposalId));

  return ArticleArchitectureAiReviewSchema.parse({
    schemaVersion: 1,
    brandId: input.brandId,
    articleId: input.articleId,
    base: input.base,
    execution: {
      state: proposals.length ? "COMPLETED_WITH_PROPOSALS" : "COMPLETED_NO_PROPOSALS",
      provider: input.provider,
      model: input.model,
      promptContract: input.promptContract,
      strategicProjection: ARTICLE_AI_REVIEW_PROJECTION,
      rawProposalCount: input.rawProposalCount,
      materialProposalCount: proposals.length,
    },
    proposals,
    humanDecision: proposals.length ? "pending" : "no_action",
  });
}

/**
 * Decisão humana vira sucessora do próprio artefato: o resultado da IA não é
 * reescrito, e aceitar proposta continua distinto de aprovar o ArticleDNA.
 */
export function applyHumanProposalDecisions(
  review: ArticleArchitectureAiReview,
  decisions: ReadonlyArray<{ proposalId: string; reviewState: "accepted" | "rejected" }>,
  decidedBy: string,
): ArticleArchitectureAiReview {
  const decided = new Map(decisions.map(decision => [decision.proposalId, decision.reviewState]));
  const proposals = review.proposals.map(proposal => {
    const next = decided.get(proposal.proposalId);
    return next ? { ...proposal, reviewState: next, decidedBy } : proposal;
  });
  const pending = proposals.filter(proposal => proposal.reviewState === "pending").length;
  const humanDecision = !proposals.length
    ? "no_action" as const
    : pending === 0
      ? "resolved" as const
      : pending === proposals.length
        ? "pending" as const
        : "partially_decided" as const;
  return ArticleArchitectureAiReviewSchema.parse({ ...review, proposals, humanDecision });
}

export type ArticleAiReviewReadout = {
  /** Estado durável do Article, já considerando a base vigente. */
  state: "NOT_RUN" | "STALE" | ArticleAiReviewState;
  stale: boolean;
  materialProposalCount: number;
  pendingProposalCount: number;
  humanDecision: ArticleArchitectureAiReview["humanDecision"] | null;
  review: ArticleArchitectureAiReview | null;
  label: string;
};

/**
 * Leitura durável por Article. Base divergente vira STALE — a revisão antiga
 * permanece como histórico e não é reaproveitada como revisão vigente. STALE
 * não bloqueia aprovação: é sinal de releitura, não pendência editorial.
 */
export function resolveArticleAiReviewReadout(input: {
  review?: ArticleArchitectureAiReview | null;
  currentBaseContentHash?: string | null;
}): ArticleAiReviewReadout {
  const review = input.review || null;
  if (!review) {
    return { state: "NOT_RUN", stale: false, materialProposalCount: 0, pendingProposalCount: 0, humanDecision: null, review: null, label: "Não executada" };
  }
  const stale = Boolean(input.currentBaseContentHash) && input.currentBaseContentHash !== review.base.articleContentHash;
  const pendingProposalCount = review.proposals.filter(proposal => proposal.reviewState === "pending").length;
  if (stale) {
    return {
      state: "STALE",
      stale: true,
      materialProposalCount: review.execution.materialProposalCount,
      pendingProposalCount,
      humanDecision: review.humanDecision,
      review,
      label: "Estrutura mudou após a revisão",
    };
  }
  return {
    state: review.execution.state,
    stale: false,
    materialProposalCount: review.execution.materialProposalCount,
    pendingProposalCount,
    humanDecision: review.humanDecision,
    review,
    label: review.execution.state === "COMPLETED_WITH_PROPOSALS"
      ? `${review.execution.materialProposalCount} proposta(s) da IA`
      : "Concluída sem propostas",
  };
}

/** Uma revisão vigente por Article; as anteriores permanecem como histórico. */
export function currentArticleAiReviews(
  versions: readonly VersionedArticleArchitectureAiReview[],
  brandId: string,
): Record<string, VersionedArticleArchitectureAiReview> {
  const current: Record<string, VersionedArticleArchitectureAiReview> = {};
  for (const version of versions) {
    if (version.payload.brandId !== brandId) continue;
    const existing = current[version.payload.articleId];
    if (!existing || version.versionNumber > existing.versionNumber) current[version.payload.articleId] = version;
  }
  return current;
}
