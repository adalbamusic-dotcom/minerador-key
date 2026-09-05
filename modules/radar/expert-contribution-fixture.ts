export type ExpertQuestion = {
  id: string;
  text: string;
  origin: string;
};

export type ExpertContributionItem = {
  id: string;
  label: string;
  kind: "audio" | "text" | "pdf" | "docx";
  duration?: string;
  detail: string;
};

export type ExpertEvidenceDecision = "pending" | "main" | "support" | "quote" | "exclude";

export type ExpertEvidence = {
  id: string;
  topic: string;
  evidenceType: "experiência prática" | "opinião profissional" | "critério de decisão" | "processo" | "ressalva" | "exemplo" | "limitação" | "possível citação";
  sourceLabel: string;
  sourceRange: string;
  originalText: string;
  organizationText: string;
  radarNeed: string;
  decision: ExpertEvidenceDecision;
};

export const EXPERT_CONTRIBUTION_FIXTURE = {
  expert: {
    id: "expert-fixture-01",
    name: "Dra. Marina Alves",
    specialty: "Dermatologia",
    channel: "Telegram",
    channelStatus: "connected" as const,
  },
  questions: [
    {
      id: "expert-question-fixture-01",
      text: "Na sua experiência, em quais situações você não recomenda este procedimento?",
      origin: "Lacuna identificada nas referências da SERP",
    },
    {
      id: "expert-question-fixture-02",
      text: "Qual é o erro de expectativa mais comum que você percebe nos pacientes?",
      origin: "Necessidade editorial: experiência prática",
    },
    {
      id: "expert-question-fixture-03",
      text: "Quais critérios você observa antes de definir a melhor conduta para cada caso?",
      origin: "A SERP explica o procedimento, mas oferece pouca orientação de decisão",
    },
    {
      id: "expert-question-fixture-04",
      text: "Que ressalva você considera indispensável antes de alguém decidir?",
      origin: "Necessidade editorial: limites e segurança da orientação",
    },
  ] satisfies ExpertQuestion[],
  contributions: [
    { id: "expert-contribution-fixture-audio-01", label: "Áudio 1", kind: "audio", duration: "01:42", detail: "Resposta sobre expectativa e indicação" },
    { id: "expert-contribution-fixture-audio-02", label: "Áudio 2", kind: "audio", duration: "00:57", detail: "Ressalvas antes da decisão" },
    { id: "expert-contribution-fixture-text-01", label: "Mensagem de texto", kind: "text", detail: "Exemplo de orientação dada em consulta" },
    { id: "expert-contribution-fixture-pdf-01", label: "artigo-referencia.pdf", kind: "pdf", detail: "Documento enviado pelo especialista" },
    { id: "expert-contribution-fixture-docx-01", label: "orientacoes.docx", kind: "docx", detail: "Material de apoio recebido" },
  ] satisfies ExpertContributionItem[],
  transcript: {
    source: "Áudio 1",
    range: "00:00–01:42",
    text: "Na minha experiência eu vejo que muitos pacientes chegam pensando que quanto mais produto melhor, mas não funciona assim. Eu primeiro tento entender o que a pessoa espera, porque às vezes ela está imaginando um resultado que não combina com o que é seguro para aquele caso.",
  },
  evidence: [
    {
      id: "expert-evidence-fixture-01",
      topic: "Expectativa do paciente",
      evidenceType: "experiência prática",
      sourceLabel: "Áudio 1",
      sourceRange: "00:14–00:48",
      originalText: "Eu primeiro tento entender o que a pessoa espera, porque às vezes ela está imaginando um resultado que não combina com o que é seguro para aquele caso.",
      organizationText: "Relacionar a contribuição à etapa de alinhamento de expectativa antes da conduta.",
      radarNeed: "As referências explicam o procedimento, mas oferecem pouca experiência prática sobre expectativa do paciente.",
      decision: "pending",
    },
    {
      id: "expert-evidence-fixture-02",
      topic: "Critério de decisão",
      evidenceType: "critério de decisão",
      sourceLabel: "Áudio 2",
      sourceRange: "00:08–00:39",
      originalText: "Eu não olho só para o pedido que a pessoa traz. Eu observo o histórico, o momento da pele e o que pode ser feito sem prometer uma coisa que não dá para entregar.",
      organizationText: "Organizar como critério profissional para avaliar contexto, limites e expectativa antes da indicação.",
      radarNeed: "A amostra mostra o que fazer, mas não deixa claro quais critérios orientam uma decisão responsável.",
      decision: "pending",
    },
  ] satisfies ExpertEvidence[],
  openQuestion: "Ainda falta uma resposta específica sobre quando a conduta deve ser adiada.",
} as const;

export type ExpertContributionFixture = typeof EXPERT_CONTRIBUTION_FIXTURE;

export type ExistingContentStatus = "registered" | "awaiting_file" | "file_received" | "ready_for_transcription" | "transcribed" | "reviewed" | "ignored_for_article";

export const EXISTING_CONTENT_STATUS_ORDER: ExistingContentStatus[] = ["registered", "awaiting_file", "file_received", "ready_for_transcription", "transcribed", "reviewed", "ignored_for_article"];

export const EXISTING_CONTENT_STATUS_LABEL: Record<ExistingContentStatus, string> = {
  registered: "Registrada",
  awaiting_file: "Aguardando arquivo",
  file_received: "Arquivo recebido",
  ready_for_transcription: "Pronto para transcrição",
  transcribed: "Transcrito",
  reviewed: "Revisado",
  ignored_for_article: "Ignorado neste artigo",
};

export type ExpertContributionStatus =
  | "questions_preparation"
  | "ready_to_send"
  | "awaiting_expert"
  | "contribution_received"
  | "processing_complete"
  | "awaiting_review"
  | "reviewed";

export const EXPERT_CONTRIBUTION_STATUS_ORDER: ExpertContributionStatus[] = [
  "questions_preparation",
  "ready_to_send",
  "awaiting_expert",
  "contribution_received",
  "processing_complete",
  "awaiting_review",
  "reviewed",
];

export const EXPERT_CONTRIBUTION_STATUS_LABEL: Record<ExpertContributionStatus, string> = {
  questions_preparation: "Perguntas em preparação",
  ready_to_send: "Pronta para enviar",
  awaiting_expert: "Aguardando especialista",
  contribution_received: "Contribuição recebida",
  processing_complete: "Processamento concluído",
  awaiting_review: "Aguardando revisão",
  reviewed: "Revisada",
};

export function moveExpertQuestion(questions: ExpertQuestion[], questionId: string, direction: -1 | 1): ExpertQuestion[] {
  const index = questions.findIndex(question => question.id === questionId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= questions.length) return questions;
  const next = [...questions];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function resetExpertQuestions(): ExpertQuestion[] {
  return EXPERT_CONTRIBUTION_FIXTURE.questions.map(question => ({ ...question }));
}

export function countSelectedExpertEvidence(decisions: Record<string, ExpertEvidenceDecision>): number {
  return Object.values(decisions).filter(decision => decision !== "pending" && decision !== "exclude").length;
}
