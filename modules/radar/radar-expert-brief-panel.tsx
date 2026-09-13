"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RadarR6ExpertEvidenceInput, RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import type { RadarR7TopicSuggestion } from "@/lib/radar/r7-sequential";
import { parseRadarR7TopicResponse } from "@/lib/radar/r7-sequential";
import { projectRadarExpertEvidence, type RadarExpertContributionEvidenceSource, type RadarExpertEvidenceReview } from "@/lib/radar/expert-evidence";
import type { RadarExpertEvidence } from "@/lib/radar/analysis-contracts";
import {
  radarSpecialistCounters,
  radarSpecialistPriorityLabel,
  radarSpecialistRequirementIdOf,
  radarSpecialistReviewCard,
  radarSpecialistReviewPoints,
  radarSpecialistStateFromBrief,
  radarSpecialistStateLabel,
  type RadarFrozenSpecialistRequirement,
  type RadarSpecialistBriefReading,
  type RadarSpecialistCounters,
} from "@/lib/radar/specialist-lifecycle";
import { RADAR_SPECIALIST_INVITE_LABELS, RADAR_SPECIALIST_INVITE_STATES, radarSpecialistConsultationOf, type RadarSpecialistInviteState } from "@/lib/radar/specialist-consultation";
import {
  buildRadarExpertBriefContext,
  normalizeRadarExpertBriefQuestions,
  questionFromRadarSuggestion,
  radarExpertBriefMatchesContext,
  radarExpertBriefQuestionOriginLabel,
  type RadarExpertBriefQuestion,
} from "@/lib/radar/expert-brief";

type RadarExpertRecord = {
  id: string;
  brandId: string;
  displayName: string;
  specialty: string | null;
  status: string;
  createdAt: string;
};

type RadarBindingSummary = { expertId: string; status: string };

type RadarExpertContributionRecord = RadarExpertContributionEvidenceSource & {
  sourceType: "TEXT" | "VOICE" | "AUDIO" | "DOCUMENT";
  processingStatus: string;
};

type ExpertReviewDecision = "pending" | "accepted" | "support" | "quote" | "rejected";
type ExpertReviewClassification = "experiência" | "opinião" | "critério" | "processo" | "ressalva" | "limitação" | "exemplo";
type ExpertReview = RadarExpertEvidenceReview & { classification: ExpertReviewClassification | null; need: string | null };

type RadarBriefRecord = {
  id: string;
  brandId: string;
  expertId: string;
  articleId: string | null;
  articleDnaVersionId: string | null;
  title: string;
  radarContext: Record<string, unknown>;
  questions: unknown[];
  status: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
};

export type RadarSpecialistPanelSummary = {
  contributionCount: number;
  pendingCount: number;
  remote: true;
  canonicalEvidence: RadarExpertEvidence[];
  blockedEvidenceCount: number;
  articleDnaVersionId: string;
  /**
   * OS CINCO NÚMEROS, LIDOS DO BANCO — SPECIALIST_1 · §5.
   *
   * A planilha mostrava `requestsSent: 0` fixo enquanto o envio existia e
   * gravava `sent_at`. Quem lê os contadores precisa recebê-los de quem
   * carregou as pautas remotas, e não de uma constante.
   */
  counters: RadarSpecialistCounters;
};

type RadarExpertBriefPanelProps = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleTitle: string;
  articleVersion: string;
  articleRole: string;
  context: RadarR6ExpertTopicContext | null;
  suggestedQuestions?: unknown[];
  /**
   * OS PONTOS QUE A INVESTIGAÇÃO PREPAROU — congelados quando há congelamento.
   *
   * Chegam prontos de quem tem a investigação em mãos. O painel não os
   * reconstrói: duas montagens do mesmo requisito divergiriam no primeiro
   * ajuste, e a coluna direita mostraria um ponto que o bundle não tem.
   */
  requirements?: readonly RadarFrozenSpecialistRequirement[];
  onExpertEvidenceChange?: (articleId: string, evidence: RadarR6ExpertEvidenceInput[], summary: RadarSpecialistPanelSummary) => void;
};

type Draft = { title: string; questions: RadarExpertBriefQuestion[] };

/** O que a projeção canônica de `/expert-consultations` devolve por ponto. */
type RadarConsultationView = {
  requirementId: string | null;
  consultationId: string | null;
  participant: { id: string; displayName: string | null; provisional: boolean };
  briefId: string;
  status: string;
  sentAt: string | null;
  connected: boolean;
  invite: { state: RadarSpecialistInviteState; expiresAt: string | null };
};

const surface = "rounded-md border border-divider bg-surface-subtle p-3";
const action = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";
const primaryAction = `${action} border-context-accent bg-selected`;

function recordValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalRecordValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseExpert(value: unknown): RadarExpertRecord | null {
  const record = asObject(value);
  if (!record || !record.id || !record.brandId || !record.displayName) return null;
  return {
    id: recordValue(record.id),
    brandId: recordValue(record.brandId),
    displayName: recordValue(record.displayName),
    specialty: optionalRecordValue(record.specialty),
    status: recordValue(record.status),
    createdAt: recordValue(record.createdAt),
  };
}

function parseBinding(value: unknown): RadarBindingSummary | null {
  const record = asObject(value);
  if (!record || !record.expertId) return null;
  return { expertId: recordValue(record.expertId), status: recordValue(record.status) };
}

function parseContribution(value: unknown): RadarExpertContributionRecord | null {
  const record = asObject(value);
  if (!record || !record.id || !record.brandId || !record.expertId || !record.briefId) return null;
  const sourceType = record.sourceType;
  if (sourceType !== "TEXT" && sourceType !== "VOICE" && sourceType !== "AUDIO" && sourceType !== "DOCUMENT") return null;
  return {
    id: recordValue(record.id),
    brandId: recordValue(record.brandId),
    expertId: recordValue(record.expertId),
    briefId: recordValue(record.briefId),
    sourceType,
    originalText: optionalRecordValue(record.originalText),
    transcriptText: optionalRecordValue(record.transcriptText),
    organizationPayload: asObject(record.organizationPayload),
    processingStatus: recordValue(record.processingStatus),
    receivedAt: recordValue(record.receivedAt),
    externalUpdateId: recordValue(asObject(record.evidence)?.externalUpdateId),
    originalAssetUri: optionalRecordValue(asObject(record.evidence)?.originalAssetUri),
    checksum: optionalRecordValue(asObject(record.evidence)?.checksum),
  };
}

function parseConsultation(value: unknown): RadarConsultationView | null {
  const record = asObject(value);
  if (!record || !record.briefId) return null;
  const participante = asObject(record.participant) || {};
  const convite = asObject(record.invite) || {};
  const estado = recordValue(convite.state);
  return {
    requirementId: optionalRecordValue(record.requirementId),
    consultationId: optionalRecordValue(record.consultationId),
    participant: { id: recordValue(participante.id), displayName: optionalRecordValue(participante.displayName), provisional: Boolean(participante.provisional) },
    briefId: recordValue(record.briefId),
    status: recordValue(record.status),
    sentAt: optionalRecordValue(record.sentAt),
    connected: Boolean(record.connected),
    invite: {
      state: (RADAR_SPECIALIST_INVITE_STATES as readonly string[]).includes(estado) ? estado as RadarSpecialistInviteState : "NONE",
      expiresAt: optionalRecordValue(convite.expiresAt),
    },
  };
}

function parseBrief(value: unknown): RadarBriefRecord | null {
  const record = asObject(value);
  if (!record || !record.id || !record.brandId || !record.expertId || !record.title) return null;
  return {
    id: recordValue(record.id),
    brandId: recordValue(record.brandId),
    expertId: recordValue(record.expertId),
    articleId: optionalRecordValue(record.articleId),
    articleDnaVersionId: optionalRecordValue(record.articleDnaVersionId),
    title: recordValue(record.title),
    radarContext: asObject(record.radarContext) || {},
    questions: Array.isArray(record.questions) ? record.questions : [],
    status: recordValue(record.status),
    createdAt: recordValue(record.createdAt),
    updatedAt: recordValue(record.updatedAt) || recordValue(record.createdAt),
    sentAt: optionalRecordValue(record.sentAt),
    completedAt: optionalRecordValue(record.completedAt),
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "data não informada" : date.toLocaleString("pt-BR");
}

function briefDate(brief: RadarBriefRecord) {
  return formatDate(brief.updatedAt || brief.createdAt);
}

/**
 * A DURAÇÃO, SÓ QUANDO ELA EXISTE DE VERDADE.
 *
 * `expert_contributions` não tem coluna de duração: quando o provider a
 * informou, ela chega dentro do payload de organização. Exibir "00:00" para o
 * resto faria uma mensagem de voz de três minutos parecer vazia.
 */
function contributionDuration(contribution: RadarExpertContributionRecord): string | null {
  const payload = contribution.organizationPayload;
  if (!payload) return null;
  const raw = payload.durationSeconds ?? payload.duration;
  const seconds = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function localQuestionId() {
  return `question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDraft(articleTitle: string, questions: RadarExpertBriefQuestion[] = []): Draft {
  return { title: `Pauta para ${articleTitle}`.slice(0, 240), questions };
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error && value.message ? value.message : fallback;
}

function parseStoredReviews(value: unknown): Record<string, ExpertReview> {
  const source = asObject(value);
  if (!source) return {};
  const validDecisions = new Set<ExpertReviewDecision>(["pending", "accepted", "support", "quote", "rejected"]);
  const validClassifications = new Set<ExpertReviewClassification>(reviewClassifications.map(item => item.value));
  return Object.fromEntries(Object.entries(source).flatMap(([id, raw]) => {
    const review = asObject(raw);
    if (!review || typeof review.decision !== "string" || !validDecisions.has(review.decision as ExpertReviewDecision)) return [];
    return [[id, {
      decision: review.decision as ExpertReviewDecision,
      classification: typeof review.classification === "string" && validClassifications.has(review.classification as ExpertReviewClassification) ? review.classification as ExpertReviewClassification : null,
      need: optionalRecordValue(review.need),
    } satisfies ExpertReview]];
  }));
}

function organizationText(contribution: RadarExpertContributionRecord) {
  const payload = contribution.organizationPayload;
  if (!payload) return null;
  for (const key of ["text", "organizedText", "summary", "content"]) {
    if (typeof payload[key] === "string" && payload[key].trim()) return payload[key].trim();
  }
  return null;
}

function sourceTypeLabel(sourceType: RadarExpertContributionRecord["sourceType"]) {
  return ({ TEXT: "Texto", VOICE: "Mensagem de voz", AUDIO: "Áudio", DOCUMENT: "Documento" } as const)[sourceType];
}

function processingStatusLabel(status: string) {
  return ({ RECEIVED: "Recebida", PENDING_LOCAL_PROCESSING: "Aguardando processamento", PROCESSING: "Em processamento", EXTRACTED: "Asset preservado", FAILED_RETRYABLE: "Falha recuperável", FAILED_FINAL: "Falha final" } as Record<string, string>)[status] || "Estado não reconhecido";
}

const reviewDecisionLabels: Record<ExpertReviewDecision, string> = {
  pending: "Aguardando decisão",
  accepted: "Evidência principal",
  support: "Evidência de apoio",
  quote: "Possível citação",
  rejected: "Não utilizar",
};

const reviewClassifications: Array<{ value: ExpertReviewClassification; label: string }> = [
  { value: "experiência", label: "Experiência prática" },
  { value: "opinião", label: "Opinião profissional" },
  { value: "critério", label: "Critério de decisão" },
  { value: "processo", label: "Processo" },
  { value: "ressalva", label: "Ressalva" },
  { value: "limitação", label: "Limitação" },
  { value: "exemplo", label: "Exemplo" },
];

/** A decisão humana que transforma contribuição em evidência. */
const acceptedDecisions = new Set<ExpertReviewDecision>(["accepted", "support", "quote"]);

export function RadarExpertBriefPanel({ brandId, articleId, articleDnaVersionId, articleTitle, articleVersion, articleRole, context, suggestedQuestions = [], requirements = [], onExpertEvidenceChange }: RadarExpertBriefPanelProps) {
  const [experts, setExperts] = useState<RadarExpertRecord[]>([]);
  const [bindings, setBindings] = useState<RadarBindingSummary[]>([]);
  const [briefs, setBriefs] = useState<RadarBriefRecord[]>([]);
  const [contributions, setContributions] = useState<RadarExpertContributionRecord[]>([]);
  const [reviews, setReviews] = useState<Record<string, ExpertReview>>({});
  const [selectedExpertId, setSelectedExpertId] = useState("");
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(articleTitle));
  const [draftOpen, setDraftOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "review" | "suggestions" | "send" | "requirement" | "">("");
  const [creatingRequirementId, setCreatingRequirementId] = useState<string | null>(null);
  /**
   * O CONVITE VIVE NESTA SESSÃO, e isso é deliberado.
   *
   * O token é gravado como hash: o servidor não consegue devolvê-lo depois, e
   * guardá-lo em claro seria transformar um segredo de uso único em dado
   * persistido. Perdeu o link? Clicar de novo emite outro para a MESMA pauta —
   * por isso a rota é idempotente na pauta e não no token.
   */
  const [invites, setInvites] = useState<Record<string, { link: string | null; message: string; connected: boolean }>>({});
  /**
   * A CONSULTA LIDA DO BANCO — a autoridade que sobrevive ao F5.
   *
   * `invites` guarda o link, que só existe na resposta do POST e morre com a
   * aba. Isto aqui guarda o que o servidor sabe: quem é o participante, qual
   * é a pauta, se o convite ainda está aberto, se alguém entrou. É o que faz
   * a tela recém-carregada mostrar a consulta em vez de pedir um cadastro.
   */
  const [consultations, setConsultations] = useState<RadarConsultationView[]>([]);
  const [copied, setCopied] = useState("");
  /*
   * O GUARDA FECHA A PORTA ANTES DO PRIMEIRO `await`.
   *
   * Estado de render chega tarde: dois cliques dentro do mesmo tique veem o
   * mesmo `busy` vazio e disparam dois POST. Os dois correm em paralelo, e a
   * guarda da rota — que lê o que já está gravado — não enxerga a inserção do
   * irmão. O especialista receberia a mesma dúvida duas vezes.
   */
  const criandoPauta = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [hydratedReviewKey, setHydratedReviewKey] = useState<string | null>(null);

  const contextPayload = useMemo(() => context ? buildRadarExpertBriefContext(context) : null, [context]);
  const initialQuestions = useMemo(() => normalizeRadarExpertBriefQuestions(suggestedQuestions), [suggestedQuestions]);
  const canLoad = Boolean(brandId && articleId && articleDnaVersionId && context);

  useEffect(() => {
    if (!canLoad) return;
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ brandId, articleId, articleDnaVersionId });
    void fetch(`/api/editorial/expert-briefs?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível carregar os especialistas da Marca.");
        if (!active) return;
        const rawExperts: unknown[] = Array.isArray(payload.experts) ? payload.experts : [];
        const rawBindings: unknown[] = Array.isArray(payload.bindings) ? payload.bindings : [];
        const rawBriefs: unknown[] = Array.isArray(payload.briefs) ? payload.briefs : [];
        const rawContributions: unknown[] = Array.isArray(payload.contributions) ? payload.contributions : [];
        setExperts(rawExperts.map(parseExpert).filter((item): item is RadarExpertRecord => Boolean(item && item.status === "active" && item.brandId === brandId)));
        setBindings(rawBindings.map(parseBinding).filter((item): item is RadarBindingSummary => Boolean(item && item.status === "active")));
        setBriefs(rawBriefs.map(parseBrief).filter((item): item is RadarBriefRecord => Boolean(item && radarExpertBriefMatchesContext(item, { brandId, articleId, articleDnaVersionId }))));
        setContributions(rawContributions.map(parseContribution).filter((item): item is RadarExpertContributionRecord => Boolean(item && item.brandId === brandId)));
      })
      .catch(loadError => {
        if (active && (loadError as Error)?.name !== "AbortError") setError(errorMessage(loadError, "Não foi possível carregar os especialistas da Marca."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [articleDnaVersionId, articleId, brandId, canLoad]);

  /**
   * A LEITURA QUE FALTAVA — SPECIALIST_2.1.1 · §3.
   *
   * Sem ela, tudo o que o POST devolveu morria no primeiro F5 e a área voltava
   * a pedir "Selecionar especialista" com a consulta inteira gravada no banco.
   * `recarregarConsultas` também é chamada depois de criar ou reemitir, para a
   * tela nunca depender só do que ela mesma lembra.
   */
  const [recargaConsultas, setRecargaConsultas] = useState(0);
  const recarregarConsultas = useCallback(() => setRecargaConsultas(atual => atual + 1), []);

  useEffect(() => {
    if (!canLoad) return;
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ brandId, articleId, articleDnaVersionId });
    void fetch(`/api/editorial/expert-consultations?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !active) return;
        const brutas: unknown[] = Array.isArray(payload.consultations) ? payload.consultations : [];
        setConsultations(brutas.map(parseConsultation).filter((item): item is RadarConsultationView => Boolean(item)));
      })
      .catch(() => { /* a área continua utilizável sem a projeção; o erro do GET principal já aparece. */ });
    return () => { active = false; controller.abort(); };
  }, [articleDnaVersionId, articleId, brandId, canLoad, recargaConsultas]);

  const selectedExpert = experts.find(expert => expert.id === selectedExpertId) || null;
  const expertName = useCallback((expertId: string | null) => experts.find(expert => expert.id === expertId)?.displayName || "Especialista não identificado", [experts]);
  const scopedBriefs = useMemo(() => briefs.filter(brief => brief.expertId === selectedExpertId && radarExpertBriefMatchesContext(brief, { brandId, expertId: selectedExpertId || undefined, articleId, articleDnaVersionId })), [articleDnaVersionId, articleId, brandId, briefs, selectedExpertId]);
  const activeBrief = selectedBriefId ? briefs.find(brief => brief.id === selectedBriefId && brief.expertId === selectedExpertId && radarExpertBriefMatchesContext(brief, { brandId, expertId: selectedExpertId, articleId, articleDnaVersionId })) || null : null;

  /*
   * AS RESPOSTAS DO ARTIGO INTEIRO, NÃO SÓ AS DA PAUTA ABERTA.
   *
   * Enquanto a leitura era presa ao brief selecionado, uma contribuição que
   * chegou por outra pauta do mesmo artigo não existia para a tela nem para os
   * contadores — e "0 contribuições" aparecia com a resposta já no banco.
   */
  const briefIds = useMemo(() => new Set(briefs.map(brief => brief.id)), [briefs]);
  const articleContributions = useMemo(
    () => contributions.filter(contribution => briefIds.has(contribution.briefId)).slice().sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt)),
    [briefIds, contributions],
  );
  const contributionsByBrief = useMemo(() => {
    const mapa = new Map<string, RadarExpertContributionRecord[]>();
    for (const contribution of articleContributions) {
      const lista = mapa.get(contribution.briefId) || [];
      lista.push(contribution);
      mapa.set(contribution.briefId, lista);
    }
    return mapa;
  }, [articleContributions]);

  const decisionOf = useCallback((contributionId: string): ExpertReviewDecision => reviews[contributionId]?.decision || "pending", [reviews]);

  /* A leitura única das pautas: contadores e pontos falam do mesmo conjunto. */
  const vinculados = useMemo(() => new Set(bindings.filter(item => item.status === "active").map(item => item.expertId)), [bindings]);
  const briefReadings = useMemo<RadarSpecialistBriefReading[]>(() => briefs.map(brief => {
    const recebidas = contributionsByBrief.get(brief.id) || [];
    return {
      id: brief.id,
      expertId: brief.expertId,
      status: brief.status,
      sentAt: brief.sentAt,
      requirementId: radarSpecialistRequirementIdOf(brief.radarContext),
      contributionIds: recebidas.map(item => item.id),
      acceptedContributionIds: recebidas.filter(item => acceptedDecisions.has(decisionOf(item.id))).map(item => item.id),
      /*
       * CONECTADO É FATO DO BANCO: existe vínculo Telegram ativo para este
       * participante. CONVIDADO é fato da pauta: ela nasceu de uma consulta.
       * Nenhum dos dois é envio — `sent_at` continua sozinho nesse papel.
       */
      connected: vinculados.has(brief.expertId),
      invited: Boolean(radarSpecialistConsultationOf(brief.radarContext)),
    };
  }), [briefs, contributionsByBrief, decisionOf, vinculados]);

  const counters = useMemo(() => radarSpecialistCounters({ requirements, briefs: briefReadings }), [briefReadings, requirements]);
  const reviewPoints = useMemo(() => radarSpecialistReviewPoints({ requirements, briefs: briefReadings }), [briefReadings, requirements]);
  const requirementByBriefId = useMemo(() => new Map(briefReadings.map(item => [item.id, item.requirementId])), [briefReadings]);
  const briefById = useMemo(() => new Map(briefs.map(brief => [brief.id, brief])), [briefs]);
  const requirementById = useMemo(() => new Map(requirements.map(item => [item.requirementId, item])), [requirements]);
  const consultationByRequirement = useMemo(() => new Map(consultations.filter(item => item.requirementId).map(item => [item.requirementId as string, item])), [consultations]);

  /*
   * A REVISÃO LOCAL É DO ARTIGO, NÃO DE UMA PAUTA.
   *
   * A chave antiga incluía o briefId, e a decisão sobre uma contribuição sumia
   * ao trocar de pauta — inclusive dos contadores. A chave passa a ser o
   * contexto do artigo, e as chaves antigas ainda são lidas uma vez para que
   * nenhuma decisão já tomada se perca na mudança.
   */
  const reviewStorageKey = useMemo(() => `radar:expert-evidence-review:${encodeURIComponent(brandId)}:${encodeURIComponent(articleId)}:${encodeURIComponent(articleDnaVersionId)}`, [articleDnaVersionId, articleId, brandId]);
  const legacyReviewKeys = useMemo(() => briefs.map(brief => `${reviewStorageKey}:${encodeURIComponent(brief.id)}`), [briefs, reviewStorageKey]);
  const pendingContributionCount = articleContributions.filter(contribution => decisionOf(contribution.id) === "pending").length;
  const selectedEvidenceCount = articleContributions.filter(contribution => acceptedDecisions.has(decisionOf(contribution.id))).length;
  const briefLocked = Boolean(activeBrief && ["awaiting_expert", "receiving", "awaiting_review"].includes(activeBrief.status));
  const bindingConfigured = Boolean(selectedExpertId && bindings.some(binding => binding.expertId === selectedExpertId && binding.status === "active"));
  const canSave = Boolean(selectedExpertId && draftOpen && draft.title.trim() && contextPayload && !busy && !briefLocked);
  const canReview = Boolean(activeBrief && draftOpen && draft.title.trim() && !busy && !briefLocked);
  const canSend = Boolean(activeBrief && activeBrief.status === "reviewed" && !dirty && bindingConfigured && draft.questions.length && !busy);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      try {
        const herdadas = legacyReviewKeys.reduce<Record<string, ExpertReview>>((total, key) => {
          const raw = window.localStorage.getItem(key);
          return raw ? { ...total, ...parseStoredReviews(JSON.parse(raw)) } : total;
        }, {});
        const raw = window.localStorage.getItem(reviewStorageKey);
        setReviews({ ...herdadas, ...parseStoredReviews(raw ? JSON.parse(raw) : null) });
      } catch {
        setReviews({});
      } finally {
        setHydratedReviewKey(reviewStorageKey);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [legacyReviewKeys, reviewStorageKey]);

  useEffect(() => {
    if (hydratedReviewKey !== reviewStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(reviewStorageKey, JSON.stringify(reviews));
  }, [hydratedReviewKey, reviewStorageKey, reviews]);

  useEffect(() => {
    const evidence: RadarR6ExpertEvidenceInput[] = articleContributions.map(contribution => {
      const review = reviews[contribution.id] || { decision: "pending" as const, classification: null, need: null };
      return {
        id: contribution.id,
        contributionId: contribution.id,
        summary: organizationText(contribution) || contribution.transcriptText || contribution.originalText || "Contribuição recebida sem texto disponível.",
        reviewed: review.decision !== "pending",
        decision: review.decision,
        classification: review.classification,
        need: review.need,
        sourceType: contribution.sourceType,
      };
    });
    const canonicalEvidence: RadarExpertEvidence[] = [];
    let blockedEvidenceCount = 0;
    for (const contribution of articleContributions) {
      const brief = briefById.get(contribution.briefId);
      if (!brief) continue;
      const review = reviews[contribution.id] || { decision: "pending" as const };
      const projected = projectRadarExpertEvidence({ brandId, articleId, articleDnaVersionId, brief, contribution, review });
      if (projected.evidence) canonicalEvidence.push(projected.evidence);
      if (projected.reason === "content_not_readable") blockedEvidenceCount += 1;
    }
    onExpertEvidenceChange?.(articleId, evidence, { contributionCount: articleContributions.length, pendingCount: pendingContributionCount, remote: true, canonicalEvidence, blockedEvidenceCount, articleDnaVersionId, counters });
  }, [articleContributions, articleDnaVersionId, articleId, brandId, briefById, counters, onExpertEvidenceChange, pendingContributionCount, reviews]);

  const setDraftValue = (update: (current: Draft) => Draft) => {
    setDraft(current => update(current));
    setDirty(true);
    setNotice("");
  };

  const selectExpert = (expertId: string) => {
    setSelectedExpertId(expertId);
    setSelectedBriefId(null);
    setDraft(emptyDraft(articleTitle));
    setDraftOpen(false);
    setDirty(false);
    setNotice("");
    setError("");
  };

  const openBrief = useCallback((brief: RadarBriefRecord) => {
    setSelectedExpertId(brief.expertId);
    setSelectedBriefId(brief.id);
    setDraft({ title: brief.title, questions: normalizeRadarExpertBriefQuestions(brief.questions) });
    setDraftOpen(true);
    setDirty(false);
    setNotice("");
  }, []);

  const selectBrief = (briefId: string) => {
    if (!briefId) {
      setSelectedBriefId(null);
      setDraft(emptyDraft(articleTitle, initialQuestions));
      setDraftOpen(false);
      setDirty(false);
      return;
    }
    const brief = scopedBriefs.find(item => item.id === briefId);
    if (brief) openBrief(brief);
  };

  const createDraft = () => {
    if (!selectedExpert) {
      setError("Selecione um especialista antes de criar a pauta.");
      return;
    }
    setSelectedBriefId(null);
    setDraft(emptyDraft(articleTitle, initialQuestions));
    setDraftOpen(true);
    setDirty(true);
    setError("");
    setNotice("Pauta de trabalho aberta. Salve para criar o ExpertBrief remoto.");
  };

  const updateQuestion = (questionId: string, text: string) => setDraftValue(current => ({ ...current, questions: current.questions.map(question => question.id === questionId ? { ...question, text } : question) }));
  const removeQuestion = (questionId: string) => setDraftValue(current => ({ ...current, questions: current.questions.filter(question => question.id !== questionId) }));
  const moveQuestion = (questionId: string, direction: -1 | 1) => setDraftValue(current => {
    const index = current.questions.findIndex(question => question.id === questionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.questions.length) return current;
    const questions = current.questions.slice();
    [questions[index], questions[nextIndex]] = [questions[nextIndex], questions[index]];
    return { ...current, questions };
  });

  const addQuestion = () => {
    const text = newQuestion.replace(/\s+/g, " ").trim();
    if (!text) return;
    setDraftValue(current => ({ ...current, questions: [...current.questions, { id: localQuestionId(), text, origin: "human", need: null, reference: null, justification: null }] }));
    setNewQuestion("");
  };

  const generateSuggestions = async () => {
    if (!context || !draftOpen) return;
    setBusy("suggestions");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/radar-topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, articleId, articleDnaVersionId, context }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível gerar sugestões para esta pauta.");
      const suggestions = parseRadarR7TopicResponse(context, payload);
      setDraftValue(current => ({ ...current, questions: suggestions.map((suggestion: RadarR7TopicSuggestion, index) => questionFromRadarSuggestion(suggestion, index)) }));
      setNotice("Sugestões geradas para esta cópia de trabalho. Revise-as antes de salvar.");
    } catch (suggestionError) {
      setError(errorMessage(suggestionError, "Não foi possível gerar sugestões para esta pauta."));
    } finally {
      setBusy("");
    }
  };

  const persist = async (status: "reviewed" | undefined, operation: "created" | "saved" | "reviewed") => {
    if (!selectedExpertId || !contextPayload || !draft.title.trim()) return;
    setBusy(operation === "reviewed" ? "review" : "save");
    setError("");
    setNotice("");
    try {
      const body = {
        brandId,
        expertId: selectedExpertId,
        articleId,
        articleDnaVersionId,
        title: draft.title.trim(),
        /* Editar a pauta não pode apagar de onde ela veio. */
        radarContext: activeBrief ? { ...activeBrief.radarContext, ...contextPayload } : contextPayload,
        questions: draft.questions,
        ...(status ? { status } : activeBrief?.status === "reviewed" ? { status: "draft" } : {}),
        ...(selectedBriefId ? { briefId: selectedBriefId } : {}),
      };
      const response = await fetch("/api/editorial/expert-briefs", { method: selectedBriefId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível persistir a pauta.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("A confirmação remota da pauta não retornou um readback compatível.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, expertId: selectedExpertId, articleId, articleDnaVersionId })) throw new Error("O readback retornou uma pauta fora do contexto selecionado.");
      setBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      setSelectedBriefId(persisted.id);
      setDraft({ title: persisted.title, questions: normalizeRadarExpertBriefQuestions(persisted.questions) });
      setDraftOpen(true);
      setDirty(false);
      setNotice(operation === "created" ? "Pauta criada e confirmada por readback remoto. Nenhuma mensagem Telegram foi enviada." : operation === "reviewed" ? "Pauta aprovada para envio e confirmada por readback remoto." : "Pauta salva e confirmada por readback remoto.");
    } catch (persistError) {
      setError(errorMessage(persistError, "Não foi possível persistir a pauta."));
    } finally {
      setBusy("");
    }
  };

  /**
   * O PONTO DE REVISÃO VIRA CONSULTA — SPECIALIST_2.1.
   *
   * A pergunta enviada é a `specificQuestion` que a investigação já escreveu,
   * a partir do conflito ou da lacuna concretos daquele claim. Nada de IA aqui:
   * trocar uma pergunta fundamentada por uma inventada esvaziaria o motivo de
   * consultar um profissional.
   *
   * O QUE MUDOU: não é mais preciso escolher um especialista cadastrado antes.
   * A rota cria o participante externo provisório, a pauta e o token de convite
   * no mesmo ato — e devolve o deep link para o operador COPIAR. Quem convida
   * não precisa sair do Radar para preencher um formulário sobre alguém que
   * ainda não aceitou revisar nada.
   *
   * O QUE ESTA AÇÃO NÃO FAZ, e é o ponto inteiro do gate: não envia Telegram,
   * não marca como aprovada, não escreve `sent_at`, não abre nenhum app. Ela
   * cria um convite — e PREPARED continua diferente de SENT do outro lado do
   * clique.
   */
  const createConsultationFromRequirement = async (requirement: RadarFrozenSpecialistRequirement, action: "create" | "reissue" = "create") => {
    if (!contextPayload) return;
    if (criandoPauta.current) return;
    criandoPauta.current = requirement.requirementId;
    setBusy("requirement");
    setCreatingRequirementId(requirement.requirementId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brandId, articleId, articleDnaVersionId, requirement, radarContext: contextPayload, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível criar a consulta deste ponto de revisão.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, articleId, articleDnaVersionId })) throw new Error("O readback retornou uma pauta fora do contexto selecionado.");
      setBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);

      const convite = asObject(payload.invite);
      const link = convite ? optionalRecordValue(convite.link) : null;
      setInvites(current => ({
        ...current,
        [requirement.requirementId]: {
          link,
          message: convite ? recordValue(convite.message) : "",
          connected: Boolean(payload.connected),
        },
      }));
      /* A projeção remota é relida: a tela não fica dependendo do que lembrou. */
      recarregarConsultas();
      setNotice(payload.connected
        ? "O especialista desta consulta já está conectado. Nenhum link novo foi gerado."
        : link
          ? action === "reissue" ? "Link novo gerado. O anterior foi revogado." : "Consulta criada. Copie o link e compartilhe com o especialista — nada foi enviado."
          : "Consulta criada, mas o link não pôde ser montado: confirme o username do Bot no Admin.");
    } catch (requirementError) {
      setError(errorMessage(requirementError, "Não foi possível criar a consulta deste ponto de revisão."));
    } finally {
      criandoPauta.current = null;
      setBusy("");
      setCreatingRequirementId(null);
    }
  };

  /**
   * ENVIAR A PAUTA — a única ação que escreve `sent_at`.
   *
   * Recebe pauta e participante por argumento porque a consulta do card não
   * passa pelo editor: exigir que alguém "abrisse" a pauta antes de enviá-la
   * era resquício do fluxo em que o especialista era escolhido à mão.
   *
   * A confirmação remota é obrigatória: sem o readback, "enviado" seria só a
   * tentativa HTTP — e uma pauta apareceria como pedida sem ninguém ter
   * recebido nada.
   */
  const enviarPauta = async (briefId: string, expertIdDaPauta: string) => {
    setBusy("send");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-briefs/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brandId, expertId: expertIdDaPauta, briefId, articleId, articleDnaVersionId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível enviar a pauta ao especialista.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("O envio não retornou confirmação remota da pauta.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, expertId: expertIdDaPauta, articleId, articleDnaVersionId })) throw new Error("O readback do envio retornou uma pauta fora do contexto selecionado.");
      setBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      if (selectedBriefId === persisted.id) { setDraft({ title: persisted.title, questions: normalizeRadarExpertBriefQuestions(persisted.questions) }); setDirty(false); }
      recarregarConsultas();
      setNotice(payload.send === "already_confirmed" ? "Esta pauta já havia sido enviada; nenhum novo envio foi feito." : "Pauta enviada ao especialista e confirmada por readback remoto.");
    } catch (sendError) {
      setError(errorMessage(sendError, "Não foi possível enviar a pauta ao especialista."));
    } finally {
      setBusy("");
    }
  };

  const sendToTelegram = async () => {
    if (!activeBrief || !canSend) return;
    setBusy("send");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/editorial/expert-briefs/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brandId, expertId: selectedExpertId, briefId: activeBrief.id, articleId, articleDnaVersionId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(recordValue(asObject(payload)?.error) || "Não foi possível enviar a pauta ao especialista.");
      if (payload.persistence !== "remote_readback_confirmed") throw new Error("O envio não retornou confirmação remota da pauta.");
      const persisted = parseBrief(payload.brief);
      if (!persisted || !radarExpertBriefMatchesContext(persisted, { brandId, expertId: selectedExpertId, articleId, articleDnaVersionId })) throw new Error("O readback do envio retornou uma pauta fora do contexto selecionado.");
      setBriefs(current => [persisted, ...current.filter(brief => brief.id !== persisted.id)]);
      setDraft({ title: persisted.title, questions: normalizeRadarExpertBriefQuestions(persisted.questions) });
      setDirty(false);
      setNotice(payload.send === "already_confirmed" ? "Esta pauta já havia sido enviada; nenhum novo envio foi feito." : "Pauta enviada ao especialista e confirmada por readback remoto.");
    } catch (sendError) {
      setError(errorMessage(sendError, "Não foi possível enviar a pauta ao especialista."));
    } finally {
      setBusy("");
    }
  };

  /**
   * COPIAR É A ÚNICA AÇÃO — o gate proíbe abrir ou enviar qualquer coisa.
   *
   * `navigator.clipboard` exige contexto seguro e pode ser recusado pelo
   * navegador; nesse caso o erro precisa aparecer, senão o operador sai
   * achando que copiou e cola um link vazio no WhatsApp do especialista.
   */
  const copiar = async (valor: string, requirementId: string, tipo: "link" | "mensagem") => {
    if (!valor) return;
    try {
      await navigator.clipboard.writeText(valor);
      setCopied(`${requirementId}:${tipo}`);
      setError("");
    } catch {
      setCopied("");
      setError(`Não foi possível copiar o ${tipo}. Copie manualmente do campo de proveniência.`);
    }
  };

  const updateReview = (contributionId: string, update: Partial<ExpertReview>) => {
    setReviews(current => ({
      ...current,
      [contributionId]: {
        decision: current[contributionId]?.decision || "pending",
        classification: current[contributionId]?.classification || null,
        need: current[contributionId]?.need || null,
        ...update,
      },
    }));
  };

  if (!context) return <section className={surface} aria-label="ExpertBrief indisponível"><h3 className="text-base font-semibold text-foreground">ExpertBrief</h3><p className="mt-2 text-sm text-text-muted">ArticleDNA não está hidratado para este artigo. A seleção de especialista e qualquer chamada de IA permanecem bloqueadas.</p></section>;

  const needOptions = [...new Set([...context.serpNeeds, ...context.openGaps])];
  const resultPoints = reviewPoints.filter(point => point.contributionIds.length > 0);
  const unassignedContributions = articleContributions.filter(contribution => !requirementByBriefId.get(contribution.briefId));

  /**
   * UMA LINHA DE ESTADO, NA ORDEM DO QUE PEDE ATENÇÃO.
   *
   * O que trava primeiro vem primeiro: sem especialista cadastrado, nada mais
   * importa; com resposta a revisar, é isso que espera uma pessoa. Sem esta
   * ordem, a linha diria "vinculado ao Telegram" enquanto uma contribuição
   * aguardava decisão logo abaixo.
   */
  const estadoOperacional = !experts.length
    ? "Nenhuma consulta criada ainda."
    : !selectedExpert
      ? "Nenhum especialista selecionado."
      : counters.responded > counters.accepted
        ? `${selectedExpert.displayName} · resposta recebida, aguardando sua decisão`
        : counters.waiting > 0
          ? `${selectedExpert.displayName} · aguardando resposta`
          : counters.drafts > 0
            ? `${selectedExpert.displayName} · pauta em rascunho, ainda não enviada`
            : `${selectedExpert.displayName} · ${bindingConfigured ? "vinculado ao Telegram" : "sem vínculo Telegram"}`;

  const contributionCard = (contribution: RadarExpertContributionRecord, brief: RadarBriefRecord | null) => {
    const review = reviews[contribution.id] || { decision: "pending" as const, classification: null, need: null };
    const organized = organizationText(contribution);
    const verbatimText = contribution.transcriptText || contribution.originalText || "";
    const originalText = contribution.originalText || (contribution.originalAssetUri ? "Asset original preservado no armazenamento server-side." : "O material original ainda aguarda preservação.");
    return <article className="rounded-md border border-divider bg-surface p-3" key={contribution.id} data-testid="radar-specialist-review-contribution">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-foreground">{expertName(contribution.expertId)} · {sourceTypeLabel(contribution.sourceType)}</h5>
          <p className="mt-1 text-sm text-text-muted">Telegram · {formatDate(contribution.receivedAt)}{contributionDuration(contribution) ? ` · ${contributionDuration(contribution)}` : ""} · {processingStatusLabel(contribution.processingStatus)}</p>
        </div>
        <span className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted">{reviewDecisionLabels[review.decision]}</span>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div><p className="text-sm font-semibold text-foreground">Original</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-muted">{originalText}</p></div>
        <div><p className="text-sm font-semibold text-foreground">Transcrição fiel</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-muted">{contribution.transcriptText || "Ainda não disponível; o original permanece preservado."}</p></div>
        <div><p className="text-sm font-semibold text-foreground">Contribuição extraída</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-muted">{organized || "Ainda não organizada; não é evidência aprovada."}</p></div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block text-sm text-foreground">Classificação<select value={review.classification || ""} onChange={event => updateReview(contribution.id, { classification: (event.target.value || null) as ExpertReviewClassification | null })} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground"><option value="">Selecionar classificação</option>{reviewClassifications.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="block text-sm text-foreground">Relacionar à necessidade<select value={review.need || ""} onChange={event => updateReview(contribution.id, { need: event.target.value || null })} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground"><option value="">Nenhuma selecionada</option>{needOptions.map(need => <option value={need} key={need}>{need}</option>)}</select></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={review.decision === "accepted" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "accepted" })} disabled={!verbatimText}>Aceitar como evidência</button>
        <button type="button" className={review.decision === "support" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "support" })} disabled={!verbatimText}>Usar como apoio</button>
        <button type="button" className={review.decision === "quote" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "quote" })} disabled={!verbatimText}>Marcar citação literal</button>
        <button type="button" className={review.decision === "rejected" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "rejected" })}>Rejeitar</button>
      </div>
      {review.decision === "quote" && verbatimText && <blockquote className="mt-3 border-l-2 border-context-accent pl-3 text-sm leading-5 text-foreground">“{verbatimText}”<footer className="mt-1 text-text-muted">Trecho original preservado; timestamps só aparecem quando fornecidos pelo provider.</footer></blockquote>}
      <details className="mt-3 rounded-md border border-divider p-2"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Proveniência / detalhes técnicos</summary><dl className="mt-2 grid gap-2 text-sm text-text-muted sm:grid-cols-2"><div><dt>contributionId</dt><dd className="break-all text-foreground">{contribution.id}</dd></div><div><dt>briefId</dt><dd className="break-all text-foreground">{brief?.id || contribution.briefId}</dd></div><div><dt>externalUpdateId</dt><dd className="break-all text-foreground">{contribution.externalUpdateId}</dd></div><div><dt>originalAssetUri</dt><dd className="break-all text-foreground">{contribution.originalAssetUri || "não disponível"}</dd></div><div><dt>checksum</dt><dd className="break-all text-foreground">{contribution.checksum || "não disponível"}</dd></div></dl></details>
    </article>;
  };

  return <section className="space-y-3" aria-label="ExpertBrief do artigo selecionado" data-testid="radar-expert-brief-panel">
    {/*
      * O CABEÇALHO RESPONDE UMA PERGUNTA SÓ: em que pé está o especialista.
      *
      * Ele carregava o ArticleDNA, o selo "Pedido ≠ evidência" e um parágrafo
      * explicando a diferença entre pauta, contribuição e evidência. Tudo
      * verdadeiro, e nada disso é decisão: quem abre esta área já sabe onde
      * está, e precisa saber se há ponto preparado, se alguém pediu, e se
      * respondeu. Uma linha, com os números que já vêm do banco.
      */}
    <header className={surface} data-testid="radar-specialist-header">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-foreground">Especialista</h3>
        <p className="text-sm text-text-muted" data-testid="radar-specialist-counters">{counters.prepared} ponto(s) preparado(s) · {counters.sent} enviado(s) · {counters.responded} resposta(s) · {counters.accepted} aceita(s)</p>
      </div>
      <p className="mt-1 text-sm text-text-muted" data-testid="radar-specialist-state-line">{estadoOperacional}</p>
    </header>

    {loading && <p className={surface + " text-sm text-text-muted"}>Carregando especialistas utilizáveis desta Marca…</p>}
    {error && <p className="rounded-md border border-warning/50 bg-warning-soft/20 p-3 text-sm text-warning" role="alert">{error}</p>}
    {notice && <p className="rounded-md border border-divider bg-surface-subtle p-3 text-sm text-success" role="status">{notice}</p>}

    {/*
      * AS DUAS COLUNAS — SPECIALIST_1 · §7, o mesmo princípio de Vídeos.
      *
      * À esquerda o que CHEGOU do especialista; à direita o que o Radar PEDIU.
      * Empilhadas, as duas leituras se misturavam e uma resposta parecia
      * pertencer ao ponto listado logo acima dela.
      *
      * A ordem do DOM é a ordem do mobile (§9): entradas, pontos, resultado.
      */}
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-testid="radar-specialist-operational-grid">
      <div className="space-y-3 min-w-0" data-testid="radar-specialist-entries-column">
        
        {!loading && experts.length > 0 && <section className={surface}>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">ENTRADAS / RESPOSTAS DO ESPECIALISTA</h4>
          {/*
            * O SELETOR MANUAL SAIU DA VISÃO NORMAL — SPECIALIST_2.1.1 · §8.
            *
            * Ele pertence ao fluxo anterior, em que alguém cadastrava um
            * especialista antes de poder perguntar qualquer coisa. No fluxo por
            * consulta, o participante é criado pelo convite e É a autoridade
            * daquela consulta: não há o que escolher, e a caixa "Selecionar
            * especialista" fazia a tela pedir uma ação que não existe mais.
            *
            * Continua acessível porque a pauta avulsa ainda é uma ferramenta
            * legítima — só deixou de competir com a ação principal (§10).
            */}
          <details className="mt-3 rounded-md border border-divider p-2" data-testid="radar-specialist-advanced">
            <summary className="cursor-pointer text-sm font-semibold text-text-muted">Ferramentas avançadas</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="block text-sm text-foreground">Especialista
                <select aria-label="Selecionar especialista" value={selectedExpertId} onChange={event => selectExpert(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground">
                  <option value="">Selecionar especialista</option>
                  {experts.map(expert => <option value={expert.id} key={expert.id}>{expert.displayName}{expert.specialty ? ` · ${expert.specialty}` : ""}</option>)}
                </select>
              </label>
              <div className="rounded-md border border-divider bg-surface px-3 py-2 text-sm">
                <span className="block text-text-muted">Canal Telegram</span>
                <strong className="mt-1 block text-foreground">{selectedExpert ? bindingConfigured ? "Configurado" : "Não vinculado" : "Nenhum selecionado"}</strong>
              </div>
            </div>
            {selectedExpert && <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className={action} onClick={createDraft}>Criar pauta avulsa</button><span className="text-sm text-text-muted">Fora do ponto de revisão; não substitui a consulta.</span></div>}
          </details>
        </section>}

        <section className={surface} aria-label="Entradas recebidas do especialista">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">RESPOSTAS RECEBIDAS</h4>
            <span className="text-sm text-text-muted">Readback remoto · {articleContributions.length}</span>
          </div>
          {!articleContributions.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">Nenhuma resposta recebida.</p>}
          <ul className="mt-3 space-y-2">{articleContributions.map(contribution => {
            const requirementId = requirementByBriefId.get(contribution.briefId) || null;
            const ponto = requirementId ? requirementById.get(requirementId) : null;
            const verbatimText = contribution.transcriptText || contribution.originalText || "";
            return <li className="rounded-md border border-divider bg-surface p-3" key={contribution.id} data-testid="radar-specialist-entry">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{expertName(contribution.expertId)} · {sourceTypeLabel(contribution.sourceType)}</p>
                  <p className="mt-1 text-sm text-text-muted">Telegram · {formatDate(contribution.receivedAt)}{contributionDuration(contribution) ? ` · ${contributionDuration(contribution)}` : ""}</p>
                </div>
                <span className="shrink-0 rounded-full border border-divider px-2 py-1 text-sm text-text-muted">{processingStatusLabel(contribution.processingStatus)}</span>
              </div>
              <p className="mt-2 text-sm text-text-muted">{contribution.transcriptText ? "Transcrição disponível." : contribution.sourceType === "TEXT" ? "Texto recebido." : "Transcrição ainda não disponível; o original permanece preservado."}</p>
              {/*
                * O ÁUDIO JÁ TRANSCRITO APARECE COMO TEXTO CONSULTÁVEL — e recolhido.
                *
                * Aberta por padrão, uma transcrição de três minutos empurra as
                * outras respostas para fora da tela, e a coluna deixa de servir
                * como caixa de entrada.
                */}
              {verbatimText && <details className="mt-2 rounded-md border border-divider p-2" data-testid="radar-specialist-entry-transcript"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Ver transcrição completa</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-text-muted">{verbatimText}</p></details>}
              <p className="mt-2 text-sm text-text-muted">{ponto ? `Responde ao ponto: ${ponto.topic || ponto.claim || ponto.requirementId}` : requirementId ? `Responde ao ponto ${requirementId}, que não está nesta investigação.` : "Contribuição ainda não associada a um ponto de revisão."}</p>
            </li>;
          })}</ul>
        </section>
      </div>

      <aside className="space-y-3 min-w-0" data-testid="radar-specialist-review-points-column">
        <section className={surface} aria-label="Pontos preparados para revisão profissional">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">PONTOS PARA REVISÃO</h4>
            <span className="text-sm text-text-muted">{reviewPoints.length}</span>
          </div>
          {!reviewPoints.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">Nenhum ponto preparado para revisão.</p>}
          <ul className="mt-3 space-y-2">{reviewPoints.map(point => {
            const requisito = requirementById.get(point.requirementId);
            const card = requisito ? radarSpecialistReviewCard(requisito) : null;
            const convite = invites[point.requirementId] || null;
            const consulta = consultationByRequirement.get(point.requirementId) || null;
            return <li className="rounded-md border border-divider bg-surface p-3" key={point.requirementId} data-testid="radar-specialist-review-point">
            <p className="text-sm font-semibold text-foreground">{point.title}</p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-text-muted">{radarSpecialistPriorityLabel(point.priority)} · {point.stateLabel}</p>
            {/*
              * A PERGUNTA, O MOTIVO E O QUE SE ESPERA — nada do diagnóstico.
              *
              * A `specificQuestion` congelada começa com a contagem de mercado
              * que levou o Radar até aqui ("3 de 10 concorrentes…"). Ela não
              * ajuda ninguém a decidir o que perguntar, e empurrava a pergunta
              * de verdade para o fim de um parágrafo. O texto integral continua
              * na pauta e na proveniência; o card mostra o que se opera.
              */}
            {card && card.question !== point.title && <><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Pergunta</p><p className="mt-1 text-sm text-foreground" data-testid="radar-specialist-point-question">{card.question}</p></>}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Por que revisar</p>
            <p className="mt-1 text-sm text-text-muted" data-testid="radar-specialist-point-reason">{card?.reason || point.whyReviewIsNeeded || "Esta afirmação precisa de validação profissional."}</p>
            {card && <><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">O que esperamos</p><p className="mt-1 text-sm text-text-muted">{card.expectation}</p>{card.contributions.length > 0 && <p className="mt-1 text-sm text-foreground" data-testid="radar-specialist-point-contributions">{card.contributions.join(" · ")}</p>}</>}
            {point.canCreateDraft && <button type="button" className={`${primaryAction} mt-3`} onClick={() => void createConsultationFromRequirement(requisito as RadarFrozenSpecialistRequirement)} disabled={busy !== "" || !requisito} data-testid="radar-specialist-create-consultation">{creatingRequirementId === point.requirementId ? "Criando consulta…" : "Criar consulta"}</button>}
            {/*
              * A CONSULTA, LIDA DO BANCO — SPECIALIST_2.1.1 · §4, §5 e §9.
              *
              * Este bloco não depende mais do que o POST devolveu: ele existe
              * porque a consulta existe. Antes, o primeiro F5 apagava tudo e a
              * área voltava a pedir "Selecionar especialista" com participante,
              * pauta e convite gravados a três tabelas de distância.
              *
              * O LINK, ESSE, NÃO VOLTA. Só o hash do token é persistido: a URL
              * existiu uma vez, na resposta que a criou. Em vez de esconder o
              * botão — o defeito de runtime deste gate — a tela diz que o
              * convite está aberto e oferece gerar outro, revogando o anterior.
              */}
            {consulta && <div className="mt-3 rounded-md border border-divider bg-surface-subtle p-2" data-testid="radar-specialist-consultation">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Consulta</p>
              <p className="mt-1 text-sm text-foreground" data-testid="radar-specialist-consultation-participant">{consulta.participant.displayName || "Especialista convidado"}{consulta.connected ? " · Telegram conectado" : ""}</p>
              <p className="mt-1 text-sm text-text-muted">{consulta.sentAt ? "Pedido enviado" : consulta.status === "reviewed" ? "Pauta aprovada para envio" : "Pauta em preparação"}</p>
              {!consulta.connected && <p className="mt-1 text-sm text-text-muted" data-testid="radar-specialist-invite-state">{RADAR_SPECIALIST_INVITE_LABELS[consulta.invite.state]}</p>}

              {convite?.link && <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={action} onClick={() => void copiar(convite.link || "", point.requirementId, "link")} data-testid="radar-specialist-copy-link">Copiar link</button>
                <button type="button" className={action} onClick={() => void copiar(convite.message, point.requirementId, "mensagem")} data-testid="radar-specialist-copy-message">Copiar mensagem</button>
              </div>}
              {!convite?.link && !consulta.connected && <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className={action} onClick={() => void createConsultationFromRequirement(requisito as RadarFrozenSpecialistRequirement, "reissue")} disabled={busy !== "" || !requisito} data-testid="radar-specialist-reissue-link">{creatingRequirementId === point.requirementId ? "Gerando…" : "Gerar novo link"}</button>
                <span className="text-sm text-text-muted">{consulta.invite.state === "OPEN" ? "O link anterior continua válido até ser substituído." : "Gere um link para o especialista entrar."}</span>
              </div>}

              {/*
                * ENVIAR SÓ DEPOIS DO /START — §6 e §7.
                *
                * Sem `chat_id` não há para onde mandar, e o `chat_id` só nasce
                * quando a pessoa abre o bot. Habilitar antes disso ofereceria
                * uma ação que falharia no provider.
                */}
              {consulta.connected && !consulta.sentAt && <button type="button" className={`${primaryAction} mt-2`} onClick={() => void enviarPauta(consulta.briefId, consulta.participant.id)} disabled={consulta.status !== "reviewed" || busy !== ""} data-testid="radar-specialist-send-brief">{busy === "send" ? "Enviando…" : "Enviar pauta"}</button>}
              {consulta.connected && !consulta.sentAt && consulta.status !== "reviewed" && <p className="mt-1 text-sm text-text-muted">Aprove a pauta para envio antes de enviá-la.</p>}
              {consulta.sentAt && <p className="mt-2 text-sm text-text-muted">Enviado em {formatDate(consulta.sentAt)}.</p>}

              <button type="button" className={`${action} mt-2`} onClick={() => { const brief = briefById.get(consulta.briefId); if (brief) openBrief(brief); }}>Abrir pauta</button>
              {copied === `${point.requirementId}:link` && <p className="mt-2 text-sm text-success" role="status">Link copiado</p>}
              {copied === `${point.requirementId}:mensagem` && <p className="mt-2 text-sm text-success" role="status">Mensagem copiada</p>}
              {convite && !convite.link && !consulta.connected && <p className="mt-2 text-sm text-warning">O username do Bot ainda não foi confirmado no Admin; sem ele o link direto não pode ser montado.</p>}
            </div>}
          </li>;
          })}</ul>
        </section>

        <section className={surface} aria-label="Pautas e pedidos deste artigo">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">PAUTAS / PEDIDOS</h4>
            <span className="text-sm text-text-muted">{briefs.length}</span>
          </div>
          {!briefs.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">Nenhuma pauta criada.</p>}
          <ul className="mt-3 space-y-2">{briefs.map(brief => {
            const recebidas = contributionsByBrief.get(brief.id) || [];
            /*
             * O ESTADO CANÔNICO, NUNCA O RÓTULO DO BANCO — §6.
             *
             * `reviewed` significa "uma pessoa aprovou o envio" nesta coluna e
             * "chegou contribuição e falta revisar" em `awaiting_review`. Duas
             * revisões no mesmo enum; expor a palavra crua faria a tela dizer
             * "revisada" sobre uma pauta que ninguém enviou.
             */
            const state = radarSpecialistStateFromBrief({ status: brief.status, sentAt: brief.sentAt, contributions: recebidas.length, acceptedContributions: recebidas.filter(item => acceptedDecisions.has(decisionOf(item.id))).length, connected: vinculados.has(brief.expertId), invited: Boolean(radarSpecialistConsultationOf(brief.radarContext)) });
            return <li className="rounded-md border border-divider bg-surface p-3" key={brief.id} data-testid="radar-specialist-brief-row">
              <p className="text-sm font-semibold text-foreground">{brief.title}</p>
              <p className="mt-1 text-sm text-text-muted">{expertName(brief.expertId)} · {briefDate(brief)}</p>
              <p className="mt-2 flex flex-wrap gap-2 text-sm"><span className="rounded-full border border-divider px-2 py-1 text-foreground">{radarSpecialistStateLabel(state)}</span><span className="rounded-full border border-divider px-2 py-1 text-text-muted">{recebidas.length} resposta(s)</span></p>
              <button type="button" className={`${action} mt-3`} onClick={() => openBrief(brief)}>Abrir pauta</button>
            </li>;
          })}</ul>
          {selectedExpert && scopedBriefs.length > 0 && <label className="mt-3 block text-sm text-foreground">Histórico deste artigo, versão e especialista
            <select aria-label="Selecionar pauta existente" value={selectedBriefId || ""} onChange={event => selectBrief(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground">
              <option value="">Nova pauta não salva</option>
              {scopedBriefs.map(brief => <option value={brief.id} key={brief.id}>{brief.title} · {radarSpecialistStateLabel(radarSpecialistStateFromBrief({ status: brief.status, sentAt: brief.sentAt, contributions: (contributionsByBrief.get(brief.id) || []).length }))} · {briefDate(brief)}</option>)}
            </select>
          </label>}
        </section>

        {selectedExpert && draftOpen && <section className={surface} aria-label="Editor de perguntas do ExpertBrief">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">PERGUNTAS AO ESPECIALISTA</h4><p className="mt-1 text-sm text-text-muted">Pergunta ≠ contribuição recebida. Remova o que a SERP já responde e mantenha o que depende da prática deste especialista.</p></div>
            <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted">{activeBrief ? radarSpecialistStateLabel(radarSpecialistStateFromBrief({ status: activeBrief.status, sentAt: activeBrief.sentAt, contributions: (contributionsByBrief.get(activeBrief.id) || []).length })) : "Nova pauta local"}</span>
          </div>
          <label className="mt-3 block text-sm text-foreground">Título da pauta<input value={draft.title} onChange={event => setDraftValue(current => ({ ...current, title: event.target.value }))} maxLength={240} disabled={briefLocked} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70" /></label>
          <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className={action} onClick={() => void generateSuggestions()} disabled={busy !== "" || briefLocked}>{busy === "suggestions" ? "Gerando sugestões…" : "Gerar sugestões"}</button><span className="text-sm text-text-muted">A IA só é chamada por esta ação; o resultado continua revisável.</span></div>
          <ol className="mt-3 space-y-2" aria-label="Perguntas editáveis do ExpertBrief">
            {draft.questions.map((question, index) => <li className="rounded-md border border-divider bg-surface p-3" key={question.id}>
              <div className="flex items-start gap-2"><span className="pt-2 text-sm font-semibold text-context-accent">{index + 1}.</span><textarea value={question.text} onChange={event => updateQuestion(question.id, event.target.value)} rows={2} disabled={briefLocked} className="min-h-16 min-w-0 flex-1 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70" aria-label={`Pergunta ${index + 1}`} /></div>
              <p className="mt-2 text-sm text-text-muted">Origem: {radarExpertBriefQuestionOriginLabel(question.origin)}{question.need ? ` · necessidade: ${question.need}` : ""}</p>
              {question.reference && <p className="mt-1 break-words text-sm text-text-muted">Referência: {question.reference}</p>}
              <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={action} onClick={() => moveQuestion(question.id, -1)} disabled={briefLocked || index === 0}>Subir</button><button type="button" className={action} onClick={() => moveQuestion(question.id, 1)} disabled={briefLocked || index === draft.questions.length - 1}>Descer</button><button type="button" className={action} onClick={() => removeQuestion(question.id)} disabled={briefLocked}>Remover</button></div>
            </li>)}
          </ol>
          {!draft.questions.length && <p className="mt-3 rounded-md border border-divider bg-surface px-3 py-2 text-sm text-text-muted">Nenhuma pergunta adicionada. Crie uma pergunta ou gere sugestões explicitamente.</p>}
          <div className="mt-3 flex flex-col gap-2"><input aria-label="Nova pergunta ao especialista" value={newQuestion} onChange={event => setNewQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addQuestion(); } }} disabled={briefLocked} className="min-h-10 min-w-0 flex-1 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70" placeholder="Adicionar pergunta" /><button type="button" className={action} onClick={addQuestion} disabled={briefLocked || !newQuestion.trim()}>Adicionar pergunta</button></div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primaryAction} onClick={() => void persist(undefined, selectedBriefId ? "saved" : "created")} disabled={!canSave}>{busy === "save" ? "Salvando…" : selectedBriefId ? "Salvar pauta" : "Salvar pauta e criar"}</button><button type="button" className={action} onClick={() => void persist("reviewed", "reviewed")} disabled={!canReview}>{busy === "review" ? "Registrando aprovação…" : activeBrief?.status === "reviewed" && !dirty ? "Aprovada para envio" : "Aprovar para envio"}</button></div>
          {dirty && <p className="mt-2 text-sm text-pending">Alterações locais ainda não salvas.</p>}

          <div className="mt-3 rounded-md border border-warning/50 bg-warning-soft/20 p-3"><p className="text-sm font-semibold text-foreground">Envio ao Telegram</p><p className="mt-1 text-sm text-text-muted">{!activeBrief ? "Salve ou selecione uma pauta antes de qualquer envio." : !bindingConfigured ? "O especialista não está vinculado; conclua o onboarding antes do envio." : activeBrief.sentAt ? "Mensagem já confirmada. O Radar aguarda a resposta deste brief." : activeBrief.status !== "reviewed" ? "A pauta precisa da aprovação humana antes do envio." : dirty ? "Há alterações locais; salve e aprove novamente antes do envio." : "O envio é uma ação explícita e usa somente o vínculo Telegram deste especialista."}</p><button type="button" className={`${primaryAction} mt-2`} onClick={() => void sendToTelegram()} disabled={!canSend}>{busy === "send" ? "Enviando…" : activeBrief?.sentAt ? "Mensagem já enviada" : "Enviar ao especialista"}</button></div>
        </section>}
      </aside>
    </div>

    {/*
      * O RESULTADO DA REVISÃO, ORGANIZADO PELO PONTO — §8, largura inteira.
      *
      * Original, transcrição, contribuição extraída e a decisão humana não
      * cabem numa coluna de um terço: é aqui que alguém decide se a resposta
      * de um profissional vira evidência do artigo.
      */}
    <section className={surface} aria-label="Resultado da revisão do especialista" data-testid="radar-specialist-review-result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">RESULTADO DA REVISÃO</h4>
        <span className="text-sm text-text-muted">{selectedEvidenceCount} aceita(s) · {pendingContributionCount} pendente(s)</span>
      </div>
      {!articleContributions.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">A revisão começa quando uma contribuição é recebida.</p>}
      <div className="mt-3 space-y-4">{resultPoints.map(point => <section className="rounded-md border border-divider bg-surface-subtle p-3" key={point.requirementId} data-testid="radar-specialist-result-point">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><h5 className="text-sm font-semibold text-foreground">{point.title}</h5><p className="mt-1 text-sm text-text-muted">{point.specificQuestion}</p></div>
          <span className="shrink-0 rounded-full border border-divider px-3 py-1 text-sm text-foreground">{point.stateLabel}</span>
        </div>
        <p className="mt-2 text-sm text-text-muted">Especialista: {expertName(point.expertId)}</p>
        <div className="mt-3 space-y-3">{point.contributionIds.map(contributionId => {
          const contribution = articleContributions.find(item => item.id === contributionId);
          return contribution ? contributionCard(contribution, point.briefId ? briefById.get(point.briefId) || null : null) : null;
        })}</div>
      </section>)}</div>
      {unassignedContributions.length > 0 && <section className="mt-4 rounded-md border border-divider bg-surface-subtle p-3" data-testid="radar-specialist-result-unassigned">
        <h5 className="text-sm font-semibold text-foreground">Respostas sem ponto de revisão associado</h5>
        <p className="mt-1 text-sm text-text-muted">Chegaram por pautas que não nasceram de um ponto preparado. A associação a um requisito não é feita automaticamente sem evidência suficiente.</p>
        <div className="mt-3 space-y-3">{unassignedContributions.map(contribution => contributionCard(contribution, briefById.get(contribution.briefId) || null))}</div>
      </section>}
      {articleContributions.length > 0 && <p className="mt-3 text-sm text-text-muted">A contribuição remota não vira ExpertEvidence automaticamente.</p>}
    </section>

    {/*
      * UM DISCLOSURE SÓ, E FECHADO — SPECIALIST_1.1.
      *
      * NECESSIDADES DO RADAR, LACUNAS OBSERVADAS e o texto congelado inteiro de
      * cada ponto saíram da visão principal e vieram para cá. NADA FOI APAGADO:
      * é o mesmo dado, na profundidade certa. Quem opera a revisão precisa saber
      * o que perguntar e para quem; o diagnóstico que levou o Radar até o ponto
      * é conferência, não operação.
      *
      * Um disclosure, não vários: uma fileira de accordions recria exatamente o
      * muro de texto que este gate veio derrubar.
      */}
    <details className="rounded-md border border-divider p-3" data-testid="radar-specialist-provenance"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Proveniência / detalhes técnicos</summary>
      <h5 className="mt-3 text-sm font-semibold uppercase tracking-wide text-foreground">NECESSIDADES DO RADAR</h5>
      <div className="mt-2 flex flex-wrap gap-2">{context.serpNeeds.length ? context.serpNeeds.map((need, index) => <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted" key={`${need}:${index}`}>{need}</span>) : <span className="text-sm text-text-muted">Nenhuma necessidade registrada.</span>}</div>
      <h5 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">LACUNAS OBSERVADAS</h5>
      <div className="mt-2 space-y-2">{context.openGaps.length ? context.openGaps.map((gap, index) => <p className="rounded-md border border-divider bg-surface px-3 py-2 text-sm text-text-muted" key={`${gap}:${index}`}>{gap}</p>) : <p className="text-sm text-text-muted">Nenhuma lacuna explícita foi registrada pela investigação atual.</p>}</div>
      {reviewPoints.length > 0 && <><h5 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">PONTOS DE REVISÃO, TEXTO CONGELADO</h5>
        <dl className="mt-2 space-y-2">{reviewPoints.map(point => {
          const requisito = requirementById.get(point.requirementId);
          return <div className="rounded-md border border-divider bg-surface px-3 py-2" key={point.requirementId}><dt className="break-all text-sm text-text-muted">{point.requirementId}</dt><dd className="mt-1 text-sm text-foreground">{requisito ? radarSpecialistReviewCard(requisito).fullQuestion : point.specificQuestion}</dd></div>;
        })}</dl></>}
      <dl className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2"><div><dt>brandId</dt><dd className="break-all text-foreground">{brandId}</dd></div><div><dt>articleId</dt><dd className="break-all text-foreground">{articleId}</dd></div><div><dt>ArticleDNA</dt><dd className="break-all text-foreground">{articleVersion} · {articleRole || "função não informada"}</dd></div><div><dt>ArticleDNA versionId</dt><dd className="break-all text-foreground">{articleDnaVersionId}</dd></div><div><dt>expertId</dt><dd className="break-all text-foreground">{selectedExpertId || "não selecionado"}</dd></div><div><dt>briefId</dt><dd className="break-all text-foreground">{selectedBriefId || "ainda não criado"}</dd></div><div><dt>Origem dos contadores</dt><dd className="text-foreground">Pautas e contribuições lidas do banco remoto.</dd></div><div><dt>Persistência da revisão</dt><dd className="text-foreground">Projeção local; o schema remoto atual não possui tabela/coluna de ExpertEvidence.</dd></div></dl>
    </details>
  </section>;
}
