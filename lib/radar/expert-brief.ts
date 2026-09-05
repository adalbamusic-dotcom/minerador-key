import type { RadarR6ExpertTopicContext } from "./r6-sequential.ts";
import type { RadarR7TopicSuggestion } from "./r7-sequential.ts";

export const RADAR_EXPERT_BRIEF_STATUS_LABELS = {
  draft: "Rascunho",
  ready_to_send: "Pronta para envio",
  awaiting_expert: "Aguardando resposta",
  receiving: "Recebendo contribuição",
  awaiting_review: "Aguardando revisão",
  reviewed: "Pauta revisada",
  blocked: "Bloqueada",
  cancelled: "Cancelada",
} as const;

export type RadarExpertBriefQuestionOrigin = "radar" | "ai_suggestion" | "human";

export type RadarExpertBriefQuestion = {
  id: string;
  text: string;
  origin: RadarExpertBriefQuestionOrigin;
  need: string | null;
  reference: string | null;
  justification: string | null;
};

export type RadarExpertBriefContext = {
  article: RadarR6ExpertTopicContext["articleDna"];
  needs: string[];
  gaps: string[];
  conflicts: string[];
  knownQuestions: string[];
  approvedReferences: RadarR6ExpertTopicContext["approvedReferences"];
  amazon: {
    state: RadarR6ExpertTopicContext["amazonState"];
    criteria: string[];
    evidence: RadarR6ExpertTopicContext["amazonEvidence"];
  };
  existingContent: string;
  provenance: RadarR6ExpertTopicContext["provenance"];
};

export type RadarExpertBriefLike = {
  brandId: string;
  expertId: string;
  articleId: string | null;
  articleDnaVersionId: string | null;
};

export function radarExpertBriefStatusLabel(status: string) {
  return RADAR_EXPERT_BRIEF_STATUS_LABELS[status as keyof typeof RADAR_EXPERT_BRIEF_STATUS_LABELS] || "Estado não reconhecido";
}

export function radarExpertBriefQuestionOriginLabel(origin: RadarExpertBriefQuestionOrigin) {
  return ({
    radar: "Contexto Radar",
    ai_suggestion: "Sugestão de IA · revisar",
    human: "Adicionada por você",
  } as Record<RadarExpertBriefQuestionOrigin, string>)[origin];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function originValue(value: unknown): RadarExpertBriefQuestionOrigin {
  if (value === "ai_suggestion" || value === "human") return value;
  return "radar";
}

export function normalizeRadarExpertBriefQuestion(value: unknown, index = 0): RadarExpertBriefQuestion | null {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const text = textValue(record?.text ?? record?.question ?? value);
  if (!text) return null;
  return {
    id: textValue(record?.id) || `question-${index + 1}`,
    text,
    origin: originValue(record?.origin),
    need: textValue(record?.need) || null,
    reference: textValue(record?.reference) || null,
    justification: textValue(record?.justification) || null,
  };
}

export function normalizeRadarExpertBriefQuestions(values: unknown[]) {
  return values.map((value, index) => normalizeRadarExpertBriefQuestion(value, index)).filter((question): question is RadarExpertBriefQuestion => Boolean(question));
}

/**
 * Human-facing Telegram copy for an approved brief. Technical provenance is
 * kept in the persisted brief and never sent as part of the expert message.
 */
export function buildRadarExpertBriefTelegramMessage(input: { title: string; questions: unknown[]; radarContext?: unknown }) {
  const title = textValue(input.title);
  const questions = normalizeRadarExpertBriefQuestions(input.questions)
    .map(question => question.text.slice(0, 500))
    .filter(Boolean);
  if (!title || !questions.length) throw new Error("EXPERT_BRIEF_MESSAGE_CONTENT_MISSING");
  const context = input.radarContext && typeof input.radarContext === "object" && !Array.isArray(input.radarContext)
    ? input.radarContext as Record<string, unknown>
    : {};
  const article = context.article && typeof context.article === "object" && !Array.isArray(context.article)
    ? context.article as Record<string, unknown>
    : {};
  const principal = textValue(article.principal);
  const lines = [
    "Olá! Você foi convidado(a) a contribuir com uma pauta do Radar.",
    `Pauta: ${title.slice(0, 240)}`,
    ...(principal ? [`Tema: ${principal.slice(0, 240)}`] : []),
    "",
    "Responda às perguntas abaixo com sua experiência prática. Se alguma não se aplicar, sinalize isso.",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    "",
    "Obrigado(a)! Sua resposta será revisada antes de entrar no relatório.",
  ];
  return lines.join("\n").slice(0, 3900);
}

export function questionFromRadarSuggestion(suggestion: RadarR7TopicSuggestion, index = 0): RadarExpertBriefQuestion {
  return {
    id: `suggestion-${index + 1}`,
    text: suggestion.text,
    origin: "ai_suggestion",
    need: suggestion.need,
    reference: suggestion.reference,
    justification: suggestion.justification,
  };
}

export function buildRadarExpertBriefContext(context: RadarR6ExpertTopicContext): RadarExpertBriefContext {
  return {
    article: context.articleDna,
    needs: [...context.serpNeeds],
    gaps: [...context.openGaps],
    conflicts: [...context.conflicts],
    knownQuestions: [...context.knownQuestions],
    approvedReferences: context.approvedReferences.map(reference => ({ ...reference })),
    amazon: {
      state: context.amazonState,
      criteria: [...context.amazonCriteria],
      evidence: context.amazonEvidence.map(evidence => ({ ...evidence })),
    },
    existingContent: context.existingContent,
    provenance: context.provenance.map(source => ({ ...source })),
  };
}

export function radarExpertBriefMatchesContext(input: RadarExpertBriefLike, context: { brandId: string; expertId?: string; articleId: string; articleDnaVersionId: string }) {
  return input.brandId === context.brandId
    && (!context.expertId || input.expertId === context.expertId)
    && input.articleId === context.articleId
    && input.articleDnaVersionId === context.articleDnaVersionId;
}
