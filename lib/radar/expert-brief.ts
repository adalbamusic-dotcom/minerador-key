import type { RadarR6ExpertTopicContext } from "./r6-sequential.ts";
import type { RadarR7TopicSuggestion } from "./r7-sequential.ts";
import { radarSubjectDeepeningRequest, radarSubjectReaderQuestion, radarSubjectReaderQuestionText } from "./declared-subject.ts";

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
  const assunto = radarExpertBriefSubjectOf(article);
  const perguntaJaNumerada = assunto ? questions.some(question => mesmaPergunta(question, assunto.question)) : false;
  const lines = [
    "Olá! Você foi convidado(a) a contribuir com uma pauta do Radar.",
    `Pauta: ${title.slice(0, 240)}`,
    ...(principal ? [`Tema: ${principal.slice(0, 240)}`] : []),
    ...(assunto ? radarExpertBriefSubjectLines(assunto, { withQuestion: !perguntaJaNumerada }) : []),
    "",
    "Responda às perguntas abaixo com sua experiência prática. Se alguma não se aplicar, sinalize isso.",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    "",
    "Obrigado(a)! Sua resposta será revisada antes de entrar no relatório.",
  ];
  return lines.join("\n").slice(0, 3900);
}

/* ===================== O ASSUNTO PARA O ESPECIALISTA ===================== */

/**
 * O ASSUNTO QUE O ESPECIALISTA PRECISA VER — SDD do Assunto, F3.1.
 *
 * Com Assunto declarado no ArticleDNA, a pauta não pede só a principal: pede
 * que o especialista aprofunde o Assunto e a virada que leva o leitor até ele.
 * A mesma leitura serve o painel (contexto vivo, `articleDna`) e a mensagem
 * do Telegram (contexto persistido na pauta, `radarContext.article`).
 *
 * Sem frase não há Assunto: `null`, e tudo fica como era. A nota e o destino
 * são lidos só para quem opera; ao especialista vão a frase e uma pergunta.
 *
 * O ESPECIALISTA É DE FORA, E O TEXTO É SIMPLES. "Tronco", "virada" e
 * "ArticleDNA" são palavras da casa: ao especialista vão "Tema a aprofundar"
 * e a pergunta sobre o leitor. O `request` (texto da SDD) continua para quem
 * opera por dentro: o prompt das pautas. A pauta do r7 leva no `text` a
 * mesma pergunta simples, porque ela vira item numerado sem edição.
 */
export const RADAR_EXPERT_SUBJECT_LABEL = "Tema a aprofundar";

export const RADAR_EXPERT_SUBJECT_QUESTION_LABEL = "Pergunta";

/** A pergunta ao especialista, sem jargão: só a frase do Assunto. */
export const radarExpertSubjectQuestion = (phrase: string) => radarSubjectReaderQuestion(phrase);

export type RadarExpertBriefSubject = {
  phrase: string;
  note: string | null;
  request: string;
  question: string;
};

export function radarExpertBriefSubjectOf(article: unknown): RadarExpertBriefSubject | null {
  const registro = article && typeof article === "object" && !Array.isArray(article) ? article as Record<string, unknown> : null;
  const bruto = registro?.subject && typeof registro.subject === "object" && !Array.isArray(registro.subject)
    ? registro.subject as Record<string, unknown>
    : null;
  const phrase = textValue(bruto?.phrase);
  if (!phrase) return null;
  return {
    phrase,
    note: textValue(bruto?.note) || null,
    request: textValue(bruto?.request) || radarSubjectDeepeningRequest(phrase),
    question: radarExpertSubjectQuestion(phrase.slice(0, 240)),
  };
}

const semCaixaNemEspaco = (valor: string) => valor.replace(/\s+/g, " ").trim().toLowerCase();

/** A pergunta do Assunto já está na lista numerada? Então ela não se repete no cabeçalho. */
const mesmaPergunta = (texto: string, pergunta: string) => semCaixaNemEspaco(texto) === semCaixaNemEspaco(pergunta);

/**
 * As linhas da mensagem ao especialista: o tema e a pergunta, nada técnico.
 * Quando a pergunta já vai numerada (a pauta do Assunto aprovada sem edição),
 * o cabeçalho leva só o tema: a mesma pergunta não aparece duas vezes.
 */
export function radarExpertBriefSubjectLines(subject: RadarExpertBriefSubject, options: { withQuestion?: boolean } = {}): string[] {
  return [
    `${RADAR_EXPERT_SUBJECT_LABEL}: ${subject.phrase.slice(0, 240)}`,
    ...(options.withQuestion === false ? [] : [`${RADAR_EXPERT_SUBJECT_QUESTION_LABEL}: ${subject.question}`]),
  ];
}

/**
 * O PEDIDO DO ASSUNTO NO PROMPT DAS PAUTAS — rota `radar-topics`.
 *
 * O contexto em JSON já leva `articleDna.subject`, e isso não basta: um campo a
 * mais no JSON não diz à IA o que fazer com ele. Estas linhas citam a frase e a
 * nota e pedem pautas que aprofundem o Assunto e a virada. A garantia continua
 * no domínio (`parseRadarR7TopicResponse` acrescenta a pauta do Assunto quando
 * nenhuma o cobre); o prompt é o pedido, não a garantia.
 *
 * Sem Assunto, lista vazia: o prompt do sistema fica byte a byte igual.
 */
export function radarExpertTopicsSubjectPromptLines(context: { articleDna: { subject?: unknown } }): string[] {
  const assunto = radarExpertBriefSubjectOf(context.articleDna);
  if (!assunto) return [];
  return [
    `O ArticleDNA declara um Assunto (tronco editorial): "${assunto.phrase.slice(0, 240)}".`,
    ...(assunto.note ? [`Nota do Assunto: "${assunto.note.slice(0, 500)}".`] : []),
    "A principal continua sendo a promessa do artigo; o Assunto e para onde o artigo faz a virada e leva o leitor.",
    `Inclua pautas que aprofundem o Assunto e a virada para ele: ${assunto.request.slice(0, 500)}`,
    `O campo text de cada pauta vai a um especialista externo, sem edicao: escreva em linguagem simples, sem as palavras Assunto, tronco, virada ou ArticleDNA. Exemplo: "${radarSubjectReaderQuestionText(assunto.phrase.slice(0, 240))}"`,
    "Essas pautas usam origin ArticleDNA, need ligado a frase ou a nota do Assunto e reference com o rotulo do ArticleDNA presente na proveniencia.",
    "Nao troque a principal pelo Assunto, nao reescreva o Assunto e nao invente fatos sobre ele.",
  ];
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
