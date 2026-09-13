import { RadarExpertEvidenceSchema, type RadarExpertEvidence } from "./analysis-contracts.ts";

export type RadarExpertContributionEvidenceSource = {
  id: string;
  brandId: string;
  expertId: string;
  briefId: string;
  sourceType: "TEXT" | "VOICE" | "AUDIO" | "DOCUMENT";
  originalText: string | null;
  transcriptText: string | null;
  organizationPayload: Record<string, unknown> | null;
  externalUpdateId: string;
  originalAssetUri: string | null;
  checksum: string | null;
  receivedAt: string;
};

export type RadarExpertBriefEvidenceSource = {
  id: string;
  brandId: string;
  expertId: string;
  articleId: string | null;
  articleDnaVersionId: string | null;
};

export type RadarExpertEvidenceReview = {
  decision: "pending" | "accepted" | "support" | "quote" | "rejected";
};

export function parseRadarExpertEvidenceReviews(value: unknown): Record<string, RadarExpertEvidenceReview> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const decisions = new Set<RadarExpertEvidenceReview["decision"]>(["pending", "accepted", "support", "quote", "rejected"]);
  return Object.fromEntries(Object.entries(value).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as Record<string, unknown>).decision !== "string") return [];
    const decision = (raw as Record<string, unknown>).decision as RadarExpertEvidenceReview["decision"];
    return decisions.has(decision) ? [[id, { decision }]] : [];
  }));
}

export type RadarExpertEvidenceProjection = {
  evidence: RadarExpertEvidence | null;
  reason: "pending_review" | "content_not_readable" | "contributed_at_unreadable" | null;
};

/**
 * O INSTANTE DO PROVIDER, NORMALIZADO PARA O CANÔNICO — e por que isto existe.
 *
 * ======================= O DEFEITO QUE ISTO CONSERTA =======================
 *
 * `RadarExpertEvidenceSchema.contributedAt` é `z.string().datetime()`, que
 * EXIGE o sufixo `Z`. O PostgREST devolve `timestamptz` com deslocamento:
 * `2026-09-13T11:11:57.420036+00:00`. As duas formas descrevem o mesmo
 * instante, e o schema recusa a segunda.
 *
 * Enquanto nenhuma contribuição real tinha decisão humana, o caminho nem era
 * alcançado: a projeção devolve `pending_review` ANTES do `parse`. O primeiro
 * "Aceitar como evidência" sobre um dado de verdade quebrou a página inteira
 * com um ZodError, dentro de um efeito de render.
 *
 * ================== POR QUE NORMALIZAR, E NÃO AFROUXAR ==================
 *
 * Aceitar deslocamento no schema deixaria a evidência gravada com `Z` numa
 * linha e `+00:00` em outra, para o mesmo instante. Qualquer comparação de
 * ordem por string — e há várias rio abaixo — passaria a depender do formato
 * que o provider escolheu naquele dia. O contrato continua exigindo UTC
 * canônico; quem converte é a fronteira, que é onde a diferença nasce.
 */
function canonicalInstant(value: string): string | null {
  const instante = new Date(value);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

function nonEmptyText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function organizationText(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  for (const key of ["organizedText", "text", "summary", "content"]) {
    const value = nonEmptyText(payload[key]);
    if (value) return value;
  }
  return null;
}

function assertIdentity(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  brief: RadarExpertBriefEvidenceSource;
  contribution: RadarExpertContributionEvidenceSource;
}) {
  if (input.brief.brandId !== input.brandId || input.contribution.brandId !== input.brandId) throw new Error("RADAR_EXPERT_EVIDENCE_BRAND_MISMATCH");
  if (input.brief.articleId !== input.articleId || input.brief.articleDnaVersionId !== input.articleDnaVersionId) throw new Error("RADAR_EXPERT_EVIDENCE_ARTICLE_MISMATCH");
  if (input.brief.expertId !== input.contribution.expertId || input.brief.id !== input.contribution.briefId) throw new Error("RADAR_EXPERT_EVIDENCE_CONTEXT_MISMATCH");
}

/**
 * Builds only from the exact selected ArticleDNA/brief/contribution context.
 * The remote contribution remains the source; local review supplies only the
 * human decision. A media contribution without a readable transcript or
 * organization is intentionally not promoted to evidence yet.
 */
export function projectRadarExpertEvidence(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  brief: RadarExpertBriefEvidenceSource;
  contribution: RadarExpertContributionEvidenceSource;
  review?: RadarExpertEvidenceReview | null;
}): RadarExpertEvidenceProjection {
  assertIdentity(input);
  const decision = input.review?.decision || "pending";
  if (decision === "pending") return { evidence: null, reason: "pending_review" };

  const organizedText = organizationText(input.contribution.organizationPayload);
  const transcriptText = nonEmptyText(input.contribution.transcriptText);
  const originalText = nonEmptyText(input.contribution.originalText);
  const approvedContent = organizedText || transcriptText || originalText;
  if (!approvedContent) return { evidence: null, reason: "content_not_readable" };

  const evidenceType = organizedText
    ? "EDITORIAL_ORGANIZATION"
    : transcriptText
      ? "TRANSCRIPTION"
      : "ORIGINAL";
  /*
   * UM INSTANTE ILEGÍVEL NÃO DERRUBA A ÁREA — ele bloqueia a promoção.
   *
   * Lançar aqui é lançar dentro de um efeito de render, e o Radar inteiro
   * some da tela por causa de uma linha. A evidência não sai, o motivo é
   * declarado, e a aprovação do relatório continua bloqueada por ele — que é
   * o comportamento correto para um dado que não dá para conferir.
   */
  const contributedAt = canonicalInstant(input.contribution.receivedAt);
  if (!contributedAt) return { evidence: null, reason: "contributed_at_unreadable" };

  const humanDecision = decision === "rejected" ? "rejected" : "accepted";
  const fidelityStatus = decision === "rejected" ? "conflict" : "faithful";
  const evidence = RadarExpertEvidenceSchema.parse({
    id: `expert-evidence:${input.contribution.id}`,
    expertId: input.contribution.expertId,
    briefId: input.contribution.briefId,
    contributionId: input.contribution.id,
    evidenceType,
    approvedContent,
    provider: "telegram",
    externalUpdateId: input.contribution.externalUpdateId,
    originalAssetUri: input.contribution.originalAssetUri,
    checksum: input.contribution.checksum,
    contributedAt,
    humanDecision,
    fidelityStatus,
  });
  return { evidence, reason: null };
}

export function buildRadarExpertEvidence(input: Parameters<typeof projectRadarExpertEvidence>[0]) {
  const projection = projectRadarExpertEvidence(input);
  if (!projection.evidence) {
    /* Cada recusa com o seu nome: um erro genérico esconderia qual conferir. */
    throw new Error(projection.reason === "pending_review"
      ? "RADAR_EXPERT_EVIDENCE_REVIEW_REQUIRED"
      : projection.reason === "contributed_at_unreadable"
        ? "RADAR_EXPERT_EVIDENCE_CONTRIBUTED_AT_UNREADABLE"
        : "RADAR_EXPERT_EVIDENCE_CONTENT_NOT_READABLE");
  }
  return projection.evidence;
}
