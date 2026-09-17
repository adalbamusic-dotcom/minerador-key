import { RADAR_SPECIALIST_CLASSIFICATION_LABELS, RADAR_SPECIALIST_DECISION_LABELS } from "./specialist-contribution-review.ts";
import { radarSpecialistDecisionIsActive } from "./specialist-contribution-review.ts";
import type { RadarSpecialistEvidenceLayer } from "./specialist-evidence.ts";
import type { RadarVideoEvidenceLayer } from "./video-evidence.ts";

/**
 * ===== OS ANEXOS, PROJETADOS DO CANÔNICO — PARITY_1 · §3, §4 e §9 =====
 *
 * ==================== O QUE MUDOU NO PARITY_1 ====================
 *
 * Até aqui este módulo NORMALIZAVA: ele lia contribuição e casamento do banco e
 * inventava um formato só dele. Isso fazia do export uma SEGUNDA AUTORIDADE —
 * duas verdades sobre a mesma resposta de especialista, e a primeira divergência
 * apareceria num artigo já escrito.
 *
 * Agora ele PROJETA. A entrada são as camadas canônicas do bundle V3
 * (`RadarVideoEvidenceLayer`, `RadarSpecialistEvidenceLayer`) — as MESMAS que o
 * Planejador recebe. O que este arquivo faz é escolher o que sai para fora da
 * plataforma e escrever isso em português.
 *
 * ==================== DUAS COISAS QUE NÃO SÃO A MESMA ====================
 *
 * A PESQUISA DE YOUTUBE lê a SERP de vídeo: títulos, canais, duração, posição.
 * Ninguém assiste nada, e é por isso que ela nunca afirma o que um vídeo diz.
 *
 * A BIBLIOTECA DE VÍDEOS da marca é outra coisa: fontes que uma pessoa
 * escolheu, com texto extraído, casadas contra as pautas da investigação. Aqui
 * existe conteúdo — trechos ancorados em tempo, conferíveis no vídeo.
 *
 * ==================== A PRIVACIDADE SAI AQUI — §3 e §4 ====================
 *
 * A camada canônica carrega identidade de domínio porque o Planejador audita
 * com ela. O CSV vai para FORA da plataforma: `videoSourceId`, `contributionId`,
 * `briefId`, `requirementId` e a proveniência do canal não atravessam.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

const lista = (itens: readonly string[]): string[] => itens.filter(Boolean).map(item => `- ${item}`);

const tempo = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/* ============================ §3 · a biblioteca ============================ */

export type RadarPortableVideoExtract = {
  sourceTitle: string;
  text: string;
  startLabel: string;
  endLabel: string;
  whyRelevant: string;
  supports: string[];
  answersQuestion: string[];
  limitations: string[];
};

export type RadarPortableVideoContext = {
  /** `NO_LIBRARY` e `NO_MATCHING` pedem ações diferentes — §14. */
  state: "NO_LIBRARY" | "NO_MATCHING" | "MATCHED";
  note: string;
  briefs: Array<{
    topic: string;
    narrativePurpose: string;
    whatToLookFor: string[];
    relatedSection: string | null;
    coverage: string;
    reason: string;
    matchedCriteria: string[];
    missingCriteria: string[];
    extracts: RadarPortableVideoExtract[];
  }>;
  sources: Array<{ title: string; languageCode: string | null }>;
  summary: { briefs: number; supported: number; partial: number; notFound: number; extracts: number; sources: number };
};

const COBERTURA: Record<string, string> = {
  SUPPORTED: "Sustentada pelo material da biblioteca",
  PARTIAL: "Parcialmente sustentada",
  NOT_FOUND: "Não encontrada no material disponível",
};

const SEM_BIBLIOTECA = "Nenhum vídeo da biblioteca foi selecionado e casado com as pautas deste artigo.";

export function radarPortableVideoContext(layer: RadarVideoEvidenceLayer | null): RadarPortableVideoContext {
  if (!layer) {
    return {
      state: "NO_LIBRARY",
      note: SEM_BIBLIOTECA,
      briefs: [], sources: [],
      summary: { briefs: 0, supported: 0, partial: 0, notFound: 0, extracts: 0, sources: 0 },
    };
  }

  /* §3 · o NOME da fonte. O id dela fica na camada canônica, onde é auditado. */
  const nomes = new Map(layer.sources.map(item => [item.videoSourceId, item]));

  const briefs = layer.results.map(resultado => ({
    topic: resultado.topic,
    narrativePurpose: resultado.narrativePurpose,
    whatToLookFor: [...resultado.whatToLookFor],
    relatedSection: resultado.relatedSectionTitle,
    coverage: COBERTURA[resultado.state] || COBERTURA.NOT_FOUND,
    reason: resultado.reason,
    matchedCriteria: [...resultado.matchedCriteria],
    missingCriteria: [...resultado.missingCriteria],
    extracts: resultado.extracts.map(trecho => ({
      sourceTitle: nomes.get(trecho.videoSourceId)?.displayName || "Fonte da biblioteca",
      text: trecho.originalText,
      startLabel: tempo(trecho.startMs),
      endLabel: tempo(trecho.endMs),
      whyRelevant: trecho.reasonForRelevance,
      supports: [...trecho.matchedCriteria],
      answersQuestion: [...trecho.matchedQuestions],
      limitations: [...trecho.limitations],
    })),
  }));

  return {
    state: layer.summary.extracts ? "MATCHED" : "NO_MATCHING",
    note: layer.summary.extracts
      ? "Os trechos abaixo vêm de vídeos que a marca selecionou e cujo texto foi extraído. Cada um está ancorado no tempo e pode ser conferido no vídeo."
      : "As pautas foram casadas contra o material selecionado e nenhum trecho sustentou nenhuma delas.",
    briefs,
    sources: layer.sources.map(item => ({
      title: item.displayName || "Fonte da biblioteca",
      languageCode: item.languageCode,
    })),
    summary: { ...layer.summary },
  };
}

export function radarVideoContextMarkdown(contexto: RadarPortableVideoContext): string {
  if (contexto.state === "NO_LIBRARY") return `# Vídeos da biblioteca\n\n${contexto.note}`;

  return [
    "# Vídeos da biblioteca",
    "",
    contexto.note,
    ...contexto.briefs.flatMap(brief => [
      "",
      `## ${brief.topic}`,
      `Função na narrativa: ${brief.narrativePurpose}`,
      ...(brief.relatedSection ? [`Aplicar em: ${brief.relatedSection}`] : []),
      `Cobertura: ${brief.coverage}. ${brief.reason}`,
      ...(brief.missingCriteria.length ? ["Ainda não encontrado:", ...lista(brief.missingCriteria)] : []),
      ...brief.extracts.flatMap(trecho => [
        "",
        `### Trecho de "${trecho.sourceTitle}" (${trecho.startLabel}–${trecho.endLabel})`,
        `> ${trecho.text.replaceAll("\n", " ")}`,
        `Por que serve: ${trecho.whyRelevant}`,
        ...(trecho.supports.length ? [`Sustenta: ${trecho.supports.join(" · ")}`] : []),
        ...(trecho.limitations.length ? ["Cuidado:", ...lista(trecho.limitations)] : []),
      ]),
    ]),
    "",
    "Os trechos acima são citações do material original. Use-os como evidência; não os apresente como texto próprio sem atribuição.",
  ].join("\n").trim();
}

/* ============================ §4 · o especialista ============================ */

export type RadarPortableSpecialistItem = {
  requirementQuestion: string | null;
  questionsSent: string[];
  /** O recorte declarado do que foi dito. Nunca texto novo. */
  contribution: string;
  /** A resposta original, autoridade de fidelidade. */
  fullAnswer: string;
  classification: string;
  status: string;
  approved: boolean;
  appliesTo: string;
  quote: string | null;
  limitations: string[];
};

export type RadarPortableSpecialistContext = {
  state: "NONE" | "RECEIVED";
  note: string;
  items: RadarPortableSpecialistItem[];
  pending: number;
  rejected: number;
};

export const RADAR_NO_SPECIALIST = "Nenhuma contribuição especializada recebida.";

export function radarPortableSpecialistContext(layer: RadarSpecialistEvidenceLayer | null): RadarPortableSpecialistContext {
  if (!layer || !layer.items.length) {
    const pending = layer?.notApproved ?? 0;
    const rejected = layer?.rejected ?? 0;
    return {
      state: "NONE",
      /*
       * A FRASE É EXPLÍCITA DE PROPÓSITO — §14.
       *
       * Uma coluna vazia não distingue "não houve especialista" de "o export
       * esqueceu de trazer". Quem consome de fora precisa saber a diferença
       * antes de decidir escrever sem lastro profissional.
       */
      note: pending || rejected
        ? `${RADAR_NO_SPECIALIST} Há ${pending} resposta(s) aguardando decisão e ${rejected} recusada(s): nenhuma delas pode ser usada como evidência.`
        : RADAR_NO_SPECIALIST,
      items: [], pending, rejected,
    };
  }

  return {
    state: "RECEIVED",
    note: "As contribuições abaixo foram revisadas e aprovadas por uma pessoa. Cada uma responde a um ponto preparado pela investigação.",
    items: layer.items.map(item => ({
      requirementQuestion: item.requirementQuestion,
      questionsSent: [...item.sentQuestions],
      contribution: item.extractedSummary,
      fullAnswer: item.originalText,
      classification: RADAR_SPECIALIST_CLASSIFICATION_LABELS[item.classification] || item.classification,
      status: RADAR_SPECIALIST_DECISION_LABELS[item.humanDecision] || item.humanDecision,
      approved: radarSpecialistDecisionIsActive(item.humanDecision),
      appliesTo: item.editorialUse,
      quote: item.quote,
      /*
       * "APOIO" NÃO SUSTENTA AFIRMAÇÃO FACTUAL, e isso precisa viajar.
       *
       * Quem marcou a contribuição como apoio decidiu que ela ORIENTA o texto.
       * Sem esta linha, ela chega lá fora com o mesmo peso de uma evidência
       * aceita — e vira afirmação atribuída a um profissional.
       */
      limitations: item.humanDecision === "SUPPORT_ONLY"
        ? ["Esta contribuição foi marcada como APOIO: ela orienta o texto, e não sustenta afirmação factual sozinha."]
        : [],
    })),
    pending: layer.notApproved,
    rejected: layer.rejected,
  };
}

export function radarSpecialistContextMarkdown(contexto: RadarPortableSpecialistContext): string {
  if (contexto.state === "NONE") return `# Especialista\n\n${contexto.note}`;

  return [
    "# Especialista",
    "",
    contexto.note,
    ...contexto.items.flatMap((item, indice) => [
      "",
      `## ${item.requirementQuestion || `Contribuição ${indice + 1}`}`,
      ...(item.questionsSent.length ? ["Perguntas enviadas:", ...lista(item.questionsSent)] : []),
      "",
      "Contribuição:",
      item.contribution,
      ...(item.quote ? ["", `Citação literal autorizada: "${item.quote}"`] : []),
      "",
      `Aplicar em: ${item.appliesTo}`,
      `Natureza: ${item.classification}`,
      `Status: ${item.status}`,
      ...(item.limitations.length ? ["", "Limitações:", ...lista(item.limitations)] : []),
    ]),
    ...(contexto.pending || contexto.rejected
      ? ["", `Fora deste dossiê: ${contexto.pending} resposta(s) aguardando decisão e ${contexto.rejected} recusada(s). Nenhuma delas pode sustentar afirmação.`]
      : []),
  ].join("\n").trim();
}
