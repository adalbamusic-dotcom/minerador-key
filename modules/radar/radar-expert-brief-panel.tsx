"use client";

import { useEffect, useMemo, useState } from "react";
import type { RadarR6ExpertEvidenceInput, RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import type { RadarR7TopicSuggestion } from "@/lib/radar/r7-sequential";
import { parseRadarR7TopicResponse } from "@/lib/radar/r7-sequential";
import { projectRadarExpertEvidence, type RadarExpertContributionEvidenceSource, type RadarExpertEvidenceReview } from "@/lib/radar/expert-evidence";
import type { RadarExpertEvidence } from "@/lib/radar/analysis-contracts";
import { useNoticeBridge } from "@/components/global-notice-center";
import {
  buildRadarExpertBriefContext,
  normalizeRadarExpertBriefQuestions,
  questionFromRadarSuggestion,
  radarExpertBriefMatchesContext,
  radarExpertBriefQuestionOriginLabel,
  radarExpertBriefStatusLabel,
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

type RadarExpertBriefPanelProps = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleTitle: string;
  articleVersion: string;
  articleRole: string;
  context: RadarR6ExpertTopicContext | null;
  suggestedQuestions?: unknown[];
  onExpertEvidenceChange?: (articleId: string, evidence: RadarR6ExpertEvidenceInput[], summary: { contributionCount: number; pendingCount: number; remote: true; canonicalEvidence: RadarExpertEvidence[]; blockedEvidenceCount: number; articleDnaVersionId: string }) => void;
};

type Draft = { title: string; questions: RadarExpertBriefQuestion[] };

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

function briefDate(brief: RadarBriefRecord) {
  const date = new Date(brief.updatedAt || brief.createdAt);
  return Number.isNaN(date.getTime()) ? "data não informada" : date.toLocaleString("pt-BR");
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

export function RadarExpertBriefPanel({ brandId, articleId, articleDnaVersionId, articleTitle, articleVersion, articleRole, context, suggestedQuestions = [], onExpertEvidenceChange }: RadarExpertBriefPanelProps) {
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
  const [busy, setBusy] = useState<"save" | "review" | "suggestions" | "send" | "" >("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [hydratedReviewKey, setHydratedReviewKey] = useState<string | null>(null);
  useNoticeBridge({ notice: error ? { type: "error", message: error } : notice, module: "radar", area: "Especialista", title: "Radar · Especialista", fallbackSeverity: "INFO" });

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

  const selectedExpert = experts.find(expert => expert.id === selectedExpertId) || null;
  const scopedBriefs = useMemo(() => briefs.filter(brief => brief.expertId === selectedExpertId && radarExpertBriefMatchesContext(brief, { brandId, expertId: selectedExpertId || undefined, articleId, articleDnaVersionId })), [articleDnaVersionId, articleId, brandId, briefs, selectedExpertId]);
  const activeBrief = selectedBriefId ? briefs.find(brief => brief.id === selectedBriefId && brief.expertId === selectedExpertId && radarExpertBriefMatchesContext(brief, { brandId, expertId: selectedExpertId, articleId, articleDnaVersionId })) || null : null;
  const scopedContributions = useMemo(() => activeBrief ? contributions.filter(contribution => contribution.expertId === selectedExpertId && contribution.briefId === activeBrief.id) : [], [activeBrief, contributions, selectedExpertId]);
  const reviewStorageKey = useMemo(() => activeBrief ? `radar:expert-evidence-review:${encodeURIComponent(brandId)}:${encodeURIComponent(articleId)}:${encodeURIComponent(articleDnaVersionId)}:${encodeURIComponent(activeBrief.id)}` : null, [activeBrief, articleDnaVersionId, articleId, brandId]);
  const pendingContributionCount = scopedContributions.filter(contribution => (reviews[contribution.id]?.decision || "pending") === "pending").length;
  const selectedEvidenceCount = scopedContributions.filter(contribution => {
    const decision = reviews[contribution.id]?.decision || "pending";
    return decision === "accepted" || decision === "support" || decision === "quote";
  }).length;
  const briefLocked = Boolean(activeBrief && ["awaiting_expert", "receiving", "awaiting_review"].includes(activeBrief.status));
  const bindingConfigured = Boolean(selectedExpertId && bindings.some(binding => binding.expertId === selectedExpertId && binding.status === "active"));
  const canSave = Boolean(selectedExpertId && draftOpen && draft.title.trim() && contextPayload && !busy && !briefLocked);
  const canReview = Boolean(activeBrief && draftOpen && draft.title.trim() && !busy && !briefLocked);
  const canSend = Boolean(activeBrief && activeBrief.status === "reviewed" && !dirty && bindingConfigured && draft.questions.length && !busy);

  useEffect(() => {
    if (!reviewStorageKey || typeof window === "undefined") return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      try {
        const raw = window.localStorage.getItem(reviewStorageKey);
        setReviews(parseStoredReviews(raw ? JSON.parse(raw) : null));
      } catch {
        setReviews({});
      } finally {
        setHydratedReviewKey(reviewStorageKey);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [reviewStorageKey]);

  useEffect(() => {
    if (!reviewStorageKey || hydratedReviewKey !== reviewStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(reviewStorageKey, JSON.stringify(reviews));
  }, [hydratedReviewKey, reviewStorageKey, reviews]);

  useEffect(() => {
    const evidence: RadarR6ExpertEvidenceInput[] = scopedContributions.map(contribution => {
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
    if (activeBrief) {
      for (const contribution of scopedContributions) {
        const review = reviews[contribution.id] || { decision: "pending" as const };
        const projected = projectRadarExpertEvidence({ brandId, articleId, articleDnaVersionId, brief: activeBrief, contribution, review });
        if (projected.evidence) canonicalEvidence.push(projected.evidence);
        if (projected.reason === "content_not_readable") blockedEvidenceCount += 1;
      }
    }
    onExpertEvidenceChange?.(articleId, evidence, { contributionCount: scopedContributions.length, pendingCount: pendingContributionCount, remote: true, canonicalEvidence, blockedEvidenceCount, articleDnaVersionId });
  }, [activeBrief, articleDnaVersionId, articleId, brandId, onExpertEvidenceChange, pendingContributionCount, reviews, scopedContributions]);

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

  const selectBrief = (briefId: string) => {
    if (!briefId) {
      setSelectedBriefId(null);
      setDraft(emptyDraft(articleTitle, initialQuestions));
      setDraftOpen(false);
      setDirty(false);
      return;
    }
    const brief = scopedBriefs.find(item => item.id === briefId);
    if (!brief) return;
    setSelectedBriefId(brief.id);
    setDraft({ title: brief.title, questions: normalizeRadarExpertBriefQuestions(brief.questions) });
    setDraftOpen(true);
    setDirty(false);
    setNotice("");
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
        radarContext: contextPayload,
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
      setNotice(operation === "created" ? "Pauta criada e confirmada por readback remoto. Nenhuma mensagem Telegram foi enviada." : operation === "reviewed" ? "Pauta revisada humanamente e confirmada por readback remoto." : "Pauta salva e confirmada por readback remoto.");
    } catch (persistError) {
      setError(errorMessage(persistError, "Não foi possível persistir a pauta."));
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

  return <section className="space-y-3" aria-label="ExpertBrief do artigo selecionado" data-testid="radar-expert-brief-panel">
    <header className={surface}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-module-accent">Pauta do especialista</p>
          <h3 className="mt-1 truncate text-base font-semibold text-foreground">{articleTitle}</h3>
          <p className="mt-1 text-sm text-text-muted">ArticleDNA {articleVersion} · {articleRole || "Função não informada"}</p>
        </div>
        <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted">Pedido ≠ evidência</span>
      </div>
      <p className="mt-3 text-sm leading-5 text-text-muted">A pauta usa o contexto já investigado pelo Radar. Perguntas são uma cópia de trabalho; contribuição recebida, revisão e ExpertEvidence continuam etapas separadas.</p>
    </header>

    {loading && <p className={surface + " text-sm text-text-muted"}>Carregando especialistas utilizáveis desta Marca…</p>}
    {error && <p className="rounded-md border border-warning/50 bg-warning-soft/20 p-3 text-sm text-warning" role="alert">{error}</p>}

    {!loading && !experts.length && <section className={surface}><h4 className="text-base font-semibold text-foreground">Nenhum especialista cadastrado nesta Marca</h4><p className="mt-2 text-sm leading-5 text-text-muted">Cadastre um especialista em Marca para criar uma pauta real. Nenhuma entidade é criada silenciosamente pelo Radar.</p></section>}

    {!loading && experts.length > 0 && <section className={surface}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block text-sm text-foreground">Especialista
          <select aria-label="Selecionar especialista" value={selectedExpertId} onChange={event => selectExpert(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground">
            <option value="">Selecionar especialista</option>
            {experts.map(expert => <option value={expert.id} key={expert.id}>{expert.displayName}{expert.specialty ? ` · ${expert.specialty}` : ""}</option>)}
          </select>
        </label>
        <div className="rounded-md border border-divider bg-surface px-3 py-2 text-sm">
          <span className="block text-text-muted">TelegramExpertBinding</span>
          <strong className="mt-1 block text-foreground">{selectedExpert ? bindingConfigured ? "Configurado" : "Não vinculado" : "Selecione um especialista"}</strong>
          <span className="mt-1 block text-text-muted">{selectedExpert ? bindingConfigured ? "O vínculo é informativo; o envio ainda exige ação explícita." : "Não impede criar ou salvar a pauta." : "A configuração não é carregada sem seleção."}</span>
        </div>
      </div>
      {selectedExpert && <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className={primaryAction} onClick={createDraft}>Criar pauta</button><span className="text-sm text-text-muted">{scopedBriefs.length ? `${scopedBriefs.length} pauta(s) neste artigo e nesta versão` : "Nenhuma pauta salva neste contexto"}</span></div>}
      {selectedExpert && scopedBriefs.length > 0 && <label className="mt-3 block text-sm text-foreground">Histórico deste artigo, versão e especialista
        <select aria-label="Selecionar pauta existente" value={selectedBriefId || ""} onChange={event => selectBrief(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground">
          <option value="">Nova pauta não salva</option>
          {scopedBriefs.map(brief => <option value={brief.id} key={brief.id}>{brief.title} · {radarExpertBriefStatusLabel(brief.status)} · {briefDate(brief)}</option>)}
        </select>
      </label>}
    </section>}

    <section className={surface}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">NECESSIDADES DO RADAR</h4>
      <div className="mt-2 flex flex-wrap gap-2">{context.serpNeeds.length ? context.serpNeeds.map((need, index) => <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted" key={`${need}:${index}`}>{need}</span>) : <span className="text-sm text-text-muted">Nenhuma necessidade registrada.</span>}</div>
      <h4 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">LACUNAS OBSERVADAS</h4>
      <div className="mt-2 space-y-2">{context.openGaps.length ? context.openGaps.map((gap, index) => <p className="rounded-md border border-divider bg-surface px-3 py-2 text-sm text-text-muted" key={`${gap}:${index}`}>{gap}</p>) : <p className="text-sm text-text-muted">Nenhuma lacuna explícita foi registrada pela investigação atual.</p>}</div>
    </section>

    {selectedExpert && draftOpen && <section className={surface} aria-label="Editor de perguntas do ExpertBrief">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h4 className="text-base font-semibold text-foreground">PERGUNTAS AO ESPECIALISTA</h4><p className="mt-1 text-sm text-text-muted">Pergunta ≠ contribuição recebida. Remova o que a SERP já responde e mantenha o que depende da prática deste especialista.</p></div>
        <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted">{activeBrief ? radarExpertBriefStatusLabel(activeBrief.status) : "Nova pauta local"}</span>
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
      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Nova pergunta ao especialista" value={newQuestion} onChange={event => setNewQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addQuestion(); } }} disabled={briefLocked} className="min-h-10 min-w-0 flex-1 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70" placeholder="Adicionar pergunta" /><button type="button" className={action} onClick={addQuestion} disabled={briefLocked || !newQuestion.trim()}>Adicionar pergunta</button></div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primaryAction} onClick={() => void persist(undefined, selectedBriefId ? "saved" : "created")} disabled={!canSave}>{busy === "save" ? "Salvando…" : selectedBriefId ? "Salvar pauta" : "Salvar pauta e criar"}</button><button type="button" className={action} onClick={() => void persist("reviewed", "reviewed")} disabled={!canReview}>{busy === "review" ? "Registrando revisão…" : activeBrief?.status === "reviewed" && !dirty ? "Pauta revisada" : "Marcar como revisada"}</button></div>
      {dirty && <p className="mt-2 text-sm text-pending">Alterações locais ainda não salvas.</p>}
      {notice && <p className="mt-2 text-sm text-success" role="status">{notice}</p>}
    </section>}

    {selectedExpert && <section className={surface} aria-label="Contribuições e evidências do ExpertBrief">
      <div className="grid gap-3 sm:grid-cols-2"><div><span className="text-sm text-text-muted">Contribuição recebida</span><strong className="mt-1 block text-sm text-foreground">{activeBrief ? scopedContributions.length ? `${scopedContributions.length} recebida(s)` : activeBrief.status === "awaiting_expert" ? "Aguardando resposta" : "Ainda não recebida" : "Selecione uma pauta"}</strong></div><div><span className="text-sm text-text-muted">ExpertEvidence</span><strong className="mt-1 block text-sm text-foreground">{activeBrief ? `${selectedEvidenceCount} selecionada(s) · ${pendingContributionCount} pendente(s)` : "Ainda não criada"}</strong></div></div>

      <div className="mt-3 rounded-md border border-warning/50 bg-warning-soft/20 p-3"><p className="text-sm font-semibold text-foreground">Envio ao Telegram</p><p className="mt-1 text-sm text-text-muted">{!activeBrief ? "Salve ou selecione uma pauta antes de qualquer envio." : !bindingConfigured ? "O especialista não está vinculado; conclua o onboarding antes do envio." : activeBrief.status === "awaiting_expert" && activeBrief.sentAt ? "Mensagem já confirmada. O Radar aguarda a resposta deste brief." : activeBrief.status !== "reviewed" ? "A pauta precisa de revisão humana antes do envio." : dirty ? "Há alterações locais; salve e revise novamente antes do envio." : "O envio é uma ação explícita e usa somente o vínculo Telegram deste especialista."}</p><button type="button" className={`${primaryAction} mt-2`} onClick={() => void sendToTelegram()} disabled={!canSend}>{busy === "send" ? "Enviando…" : activeBrief?.status === "awaiting_expert" && activeBrief.sentAt ? "Mensagem já enviada" : "Enviar ao especialista"}</button></div>

      {activeBrief && <section className="mt-4" aria-label="Contribuições recebidas do brief selecionado">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">CONTRIBUIÇÃO RECEBIDA</h4><span className="text-sm text-text-muted">Readback remoto · {scopedContributions.length}</span></div>
        {!scopedContributions.length && <p className="mt-2 rounded-md border border-divider bg-surface px-3 py-3 text-sm text-text-muted">Nenhuma contribuição foi lida para esta pauta. Uma resposta recebida por outro brief não aparece aqui.</p>}
        <div className="mt-3 space-y-3">{scopedContributions.map(contribution => {
          const review = reviews[contribution.id] || { decision: "pending" as const, classification: null, need: null };
          const organized = organizationText(contribution);
           const verbatimText = contribution.transcriptText || contribution.originalText || "";
           const originalText = contribution.originalText || (contribution.originalAssetUri ? "Asset original preservado no armazenamento server-side." : "O material original ainda aguarda preservação.");
           return <article className="rounded-md border border-divider bg-surface p-3" key={contribution.id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h5 className="text-sm font-semibold text-foreground">{sourceTypeLabel(contribution.sourceType)}</h5><p className="mt-1 text-sm text-text-muted">{processingStatusLabel(contribution.processingStatus)} · {briefDate({ ...activeBrief, updatedAt: contribution.receivedAt })}</p></div><span className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted">{reviewDecisionLabels[review.decision]}</span></div>
             <div className="mt-3 grid gap-3 lg:grid-cols-3"><div><p className="text-sm font-semibold text-foreground">Original</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-muted">{originalText}</p></div><div><p className="text-sm font-semibold text-foreground">Transcrição fiel</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-muted">{contribution.transcriptText || "Ainda não disponível; o original permanece preservado."}</p></div><div><p className="text-sm font-semibold text-foreground">Organização</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text-muted">{organized || "Ainda não organizada; não é evidência aprovada."}</p></div></div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><label className="block text-sm text-foreground">Classificação<select value={review.classification || ""} onChange={event => updateReview(contribution.id, { classification: (event.target.value || null) as ExpertReviewClassification | null })} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground"><option value="">Selecionar classificação</option>{reviewClassifications.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="block text-sm text-foreground">Relacionar à necessidade<select value={review.need || ""} onChange={event => updateReview(contribution.id, { need: event.target.value || null })} className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground"><option value="">Nenhuma selecionada</option>{[...new Set([...context.serpNeeds, ...context.openGaps])].map(need => <option value={need} key={need}>{need}</option>)}</select></label></div>
             <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={review.decision === "accepted" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "accepted" })} disabled={!verbatimText}>Aceitar trecho</button><button type="button" className={review.decision === "support" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "support" })} disabled={!verbatimText}>Usar como apoio</button><button type="button" className={review.decision === "quote" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "quote" })} disabled={!verbatimText}>Marcar citação literal</button><button type="button" className={review.decision === "rejected" ? primaryAction : action} onClick={() => updateReview(contribution.id, { decision: "rejected" })}>Não utilizar</button></div>
             {review.decision === "quote" && verbatimText && <blockquote className="mt-3 border-l-2 border-context-accent pl-3 text-sm leading-5 text-foreground">“{verbatimText}”<footer className="mt-1 text-text-muted">Trecho original preservado; timestamps só aparecem quando fornecidos pelo provider.</footer></blockquote>}
            <details className="mt-3 rounded-md border border-divider p-2"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Proveniência / detalhes técnicos</summary><dl className="mt-2 grid gap-2 text-sm text-text-muted sm:grid-cols-2"><div><dt>contributionId</dt><dd className="break-all text-foreground">{contribution.id}</dd></div><div><dt>externalUpdateId</dt><dd className="break-all text-foreground">{contribution.externalUpdateId}</dd></div><div><dt>originalAssetUri</dt><dd className="break-all text-foreground">{contribution.originalAssetUri || "não disponível"}</dd></div><div><dt>checksum</dt><dd className="break-all text-foreground">{contribution.checksum || "não disponível"}</dd></div></dl></details>
          </article>;
        })}</div>
        {scopedContributions.length > 0 && <p className="mt-3 text-sm text-text-muted">A contribuição remota não vira ExpertEvidence automaticamente. Toda classificação acima é uma decisão humana local do Radar.</p>}
      </section>}

      <details className="mt-3 rounded-md border border-divider p-3"><summary className="cursor-pointer text-sm font-semibold text-text-muted">Proveniência / detalhes técnicos</summary><dl className="mt-3 grid gap-2 text-sm text-text-muted sm:grid-cols-2"><div><dt>brandId</dt><dd className="break-all text-foreground">{brandId}</dd></div><div><dt>articleId</dt><dd className="break-all text-foreground">{articleId}</dd></div><div><dt>ArticleDNA versionId</dt><dd className="break-all text-foreground">{articleDnaVersionId}</dd></div><div><dt>expertId</dt><dd className="break-all text-foreground">{selectedExpertId || "não selecionado"}</dd></div><div><dt>briefId</dt><dd className="break-all text-foreground">{selectedBriefId || "ainda não criado"}</dd></div><div><dt>Persistência da revisão</dt><dd className="text-foreground">Projeção local; o schema remoto atual não possui tabela/coluna de ExpertEvidence.</dd></div></dl></details>
    </section>}
  </section>;
}
