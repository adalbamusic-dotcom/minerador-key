"use client";

import { useState } from "react";
import { ChevronDown, FileText, Search, ShoppingBag, UserRound } from "lucide-react";
import { RADAR_R3_AREAS, type RadarR3Area, type RadarR3Model } from "@/lib/radar/r3-workbench";
import type { RadarR6ExpertEvidenceInput, RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import type { RadarExpertEvidence } from "@/lib/radar/analysis-contracts";
import { radarR4AmazonStatusLabel, radarR4SerpStatusLabel, type RadarR4AmazonState } from "@/lib/radar/r4-queue";
import { RadarR3AmazonPanel } from "./radar-r3-amazon-panel";
import { RadarR3ContentDossier } from "./radar-r3-content-dossier";
import { RadarR3SerpPanel } from "./radar-r3-serp-panel";
import { RadarR3SpecialistPanel } from "./radar-r3-specialist-panel";
import { RadarR6ReportPanel } from "./radar-r6-report-panel";

type RadarR3WorkbenchProps = {
  model: RadarR3Model | null;
  refreshing: boolean;
  onRefreshSerp: () => void;
  reviewingSerp?: boolean;
  onReviewSerp?: (status: "approved" | "rejected") => void;
  serpAction?: "start" | "decision" | "extract" | null;
  onStartSerpAnalysis?: () => void;
  onSerpDecisionChange?: (key: string, role: "primary" | "support" | "format" | "excluded" | "pending", reason?: string) => void;
  onSerpDecisionReasonChange?: (key: string, reason: string) => void;
  onAnalyzeSerpSelection?: () => void;
  serpApprovalBlockedReason?: string | null;
  serpReviewRemoteConfirmed?: boolean;
  onFocusAdjacent?: (direction: "previous" | "next") => void;
  pendingReviewCount?: number;
  onTopicChange?: (articleId: string, topicId: string, text: string) => void;
  onTopicRemove?: (articleId: string, topicId: string) => void;
  onTopicMove?: (articleId: string, topicId: string, direction: -1 | 1) => void;
  onTopicAdd?: (articleId: string, text: string) => void;
  onTopicReview?: (articleId: string, topicId: string) => void;
  onTopicUndo?: (articleId: string) => void;
  onTopicRedo?: (articleId: string) => void;
  canUndoTopics?: boolean;
  canRedoTopics?: boolean;
  onTopicAdjacent?: (direction: "previous" | "next") => void;
  topicQueuePosition?: number;
  topicQueueTotal?: number;
  onExistingContentAdd?: (articleId: string, input: { kind: "YOUTUBE" | "PODCAST" | "VIDEO" | "AUDIO" | "DOCUMENT"; label: string; reference: string; state: "LINK_REGISTERED" | "AWAITING_FILE" | "IGNORED_FOR_ARTICLE" }) => void;
  onExistingContentStateChange?: (articleId: string, contentId: string, state: "LINK_REGISTERED" | "AWAITING_FILE" | "IGNORED_FOR_ARTICLE") => void;
  onReportReview?: () => void;
  onReportApprove?: () => void;
  onReportGenerate?: () => void;
  onAmazonStateChange?: (articleId: string, state: RadarR4AmazonState) => void;
  expertContext?: RadarR6ExpertTopicContext | null;
  onExpertEvidenceChange?: (articleId: string, evidence: RadarR6ExpertEvidenceInput[], summary: { contributionCount: number; pendingCount: number; remote: true; canonicalEvidence: RadarExpertEvidence[]; blockedEvidenceCount: number; articleDnaVersionId: string }) => void;
  /** Kept for the canonical article route and legacy deep-link callers. */
  onOpenArticle: () => void;
  onOpenDetail: (tab?: "resumo" | "serp" | "referencias" | "analise-serp" | "relatorio") => void;
};

type StatusTone = "info" | "pending" | "success" | "warning" | "neutral";

const areaIcon: Record<RadarR3Area, typeof Search> = { serp: Search, amazon: ShoppingBag, conteudo: FileText, especialista: UserRound };
const areaLabel: Record<RadarR3Area, string> = { serp: "SERP", amazon: "Amazon", conteudo: "Conteúdo", especialista: "Especialista" };

const toneText: Record<StatusTone, string> = {
  info: "text-context-accent",
  pending: "text-pending",
  success: "text-success",
  warning: "text-warning",
  neutral: "text-text-muted",
};

const toneDot: Record<StatusTone, string> = {
  info: "bg-context-accent",
  pending: "bg-pending",
  success: "bg-success",
  warning: "bg-warning",
  neutral: "bg-divider",
};

function StatusMark({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`mt-2 inline-flex items-center gap-2 text-sm ${toneText[tone]}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[tone]}`} aria-hidden="true" />{children}</span>;
}

function areaCopy(area: RadarR3Area, model: RadarR3Model): { summary: string; status: string; tone: StatusTone } {
  if (area === "serp") {
    const queueState = model.r4?.serp.state;
    if (queueState) {
      const progress = model.r4?.serp.position && model.r4.serp.total ? ` · ${model.r4.serp.position}/${model.r4.serp.total}` : "";
      return { summary: `${model.serp.resultCount} resultado(s)${progress}`, status: radarR4SerpStatusLabel(queueState), tone: queueState === "COMPLETED" ? "success" : queueState.startsWith("FAILED") ? "warning" : "pending" };
    }
    const tone: StatusTone = model.serp.status.includes("Simulada") ? "warning" : model.serp.pendingCount > 0 || !model.serp.resultCount ? "pending" : "success";
    return { summary: `${model.serp.resultCount} resultado(s) · ${model.serp.primaryCount} principal(is)`, status: model.serp.pendingCount > 0 ? `${model.serp.pendingCount} pendente(s)` : model.serp.status, tone };
  }
  if (area === "amazon") {
    const amazonState = model.r4?.amazon || "AMAZON_NOT_APPLICABLE";
    return { summary: amazonState === "AMAZON_PENDING" ? "Decisão pendente" : "Sem coleta externa", status: radarR4AmazonStatusLabel(amazonState), tone: amazonState === "AMAZON_REVIEWED" ? "success" : amazonState === "AMAZON_PENDING" ? "pending" : "neutral" };
  }
  if (area === "conteudo") return { summary: `${model.content.needs} necessidade(s) · ${model.content.evidenceCount} evidência(s)`, status: `${model.content.articleDnaVersion} · dossiê preservado`, tone: "info" };
  return { summary: model.r4?.topics.items.length ? `${model.r4.topics.items.length} pauta(s) local(is)` : `${model.specialist.contributionsReceived} contribuição(ões) · ${model.specialist.pending} pendente(s)`, status: model.specialist.status, tone: model.r4?.specialist === "READY_FOR_REVIEW" || model.r4?.specialist === "RECEIVED" ? "pending" : "neutral" };
}

function AreaCard({ area, model, expanded, onToggle }: { area: RadarR3Area; model: RadarR3Model; expanded: boolean; onToggle: () => void }) {
  const Icon = areaIcon[area];
  const copy = areaCopy(area, model);
  return <button type="button" data-testid={`radar-r3-card-${area}`} aria-controls={`radar-r3-panel-${area}`} aria-expanded={expanded} onClick={onToggle} className={`min-h-28 min-w-0 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:min-h-32 ${expanded ? "border-context-accent bg-selected" : "border-divider bg-surface-subtle hover:border-context-accent/70"}`}>
    <span className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><Icon className={`h-4 w-4 shrink-0 ${expanded ? "text-context-accent" : "text-text-muted"}`} aria-hidden="true" /><span className="text-base font-semibold text-foreground">{areaLabel[area]}</span></span><ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></span>
    <span className="mt-2 block truncate text-sm leading-5 text-foreground">{copy.summary}</span>
    <StatusMark tone={copy.tone}>{copy.status}</StatusMark>
  </button>;
}

function DisabledAreaCard({ area }: { area: RadarR3Area }) {
  const Icon = areaIcon[area];
  return <button type="button" disabled aria-disabled="true" data-testid={`radar-r3-card-${area}-disabled`} className="min-h-28 min-w-0 cursor-not-allowed rounded-md border border-divider bg-surface-subtle px-3 py-3 text-left lg:min-h-32">
    <span className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="text-base font-semibold text-text-muted">{areaLabel[area]}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" /></span>
    <span className="mt-2 block text-sm text-text-muted" aria-hidden="true">&nbsp;</span>
    <span className="mt-2 block h-1.5 w-24 rounded-full bg-divider" aria-hidden="true" />
  </button>;
}

export function RadarR3Workbench({ model, refreshing, reviewingSerp = false, onReviewSerp, onRefreshSerp, onFocusAdjacent, pendingReviewCount = 0, serpAction = null, onStartSerpAnalysis, onSerpDecisionChange, onSerpDecisionReasonChange, onAnalyzeSerpSelection, serpApprovalBlockedReason = null, serpReviewRemoteConfirmed = false, onTopicChange, onTopicRemove, onTopicMove, onTopicAdd, onTopicReview, onTopicUndo, onTopicRedo, canUndoTopics = false, canRedoTopics = false, onTopicAdjacent, topicQueuePosition, topicQueueTotal, onExistingContentAdd, onExistingContentStateChange, onReportReview, onReportApprove, onReportGenerate, onAmazonStateChange, expertContext, onExpertEvidenceChange }: RadarR3WorkbenchProps) {
  const [expandedArea, setExpandedArea] = useState<RadarR3Area | null>(null);

  if (!model) return <section className="shrink-0 border-b border-divider bg-surface px-4 py-4 lg:px-6 lg:py-8" aria-label="Radar Workbench R4" data-testid="radar-r3-workbench-empty"><div className="mx-auto max-w-[1800px]"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-module-accent">Radar Workbench</p><p className="mt-1 text-sm text-foreground">Selecione um artigo para trabalhar</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{RADAR_R3_AREAS.map(area => <DisabledAreaCard key={area} area={area} />)}</div></div></section>;

  return <section className="shrink-0 border-b border-divider bg-surface px-4 py-4 lg:px-6 lg:py-8" aria-label="Radar Workbench R4" data-testid="radar-r3-workbench"><div className="mx-auto max-w-[1800px]">
    <header><p className="text-xs font-semibold uppercase tracking-[0.16em] text-module-accent">Radar Workbench</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Trabalhando em</p><h1 className="mt-1 truncate text-xl font-semibold text-foreground">{model.title}</h1></header>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{RADAR_R3_AREAS.map(area => <AreaCard key={area} area={area} model={model} expanded={expandedArea === area} onToggle={() => setExpandedArea(current => current === area ? null : area)} />)}</div>
    <div id={expandedArea ? `radar-r3-panel-${expandedArea}` : undefined} className="mt-3">{expandedArea === "serp" && <RadarR3SerpPanel model={model.serp} scope={{ brandId: model.brandId, articleId: model.articleId, articleDnaVersionId: model.articleDnaVersionId }} refreshing={refreshing} reviewing={reviewingSerp} onReview={onReviewSerp} queueState={model.r4?.serp.state} onRefresh={onRefreshSerp} onFocusAdjacent={onFocusAdjacent} pendingReviewCount={pendingReviewCount} action={serpAction} onStartAnalysis={onStartSerpAnalysis} onDecisionChange={onSerpDecisionChange} onDecisionReasonChange={onSerpDecisionReasonChange} onAnalyzeSelected={onAnalyzeSerpSelection} approvalBlockedReason={serpApprovalBlockedReason} reviewRemoteConfirmed={serpReviewRemoteConfirmed} />}{expandedArea === "amazon" && <RadarR3AmazonPanel model={model.amazon} state={model.r4?.amazon} onStateChange={state => onAmazonStateChange?.(model.articleId, state)} />}{expandedArea === "conteudo" && <RadarR3ContentDossier model={model.content} />}{expandedArea === "especialista" && <RadarR3SpecialistPanel model={model} expertContext={expertContext} onExpertEvidenceChange={onExpertEvidenceChange} onTopicChange={onTopicChange} onTopicRemove={onTopicRemove} onTopicMove={onTopicMove} onTopicAdd={onTopicAdd} onTopicReview={onTopicReview} onTopicUndo={onTopicUndo} onTopicRedo={onTopicRedo} canUndoTopics={canUndoTopics} canRedoTopics={canRedoTopics} onTopicAdjacent={onTopicAdjacent} topicQueuePosition={topicQueuePosition} topicQueueTotal={topicQueueTotal} onExistingContentAdd={onExistingContentAdd} onExistingContentStateChange={onExistingContentStateChange} />}</div>
    <RadarR6ReportPanel report={model.r6Report} canonicalApproved={model.report.approved} onGenerate={onReportGenerate} onReview={onReportReview} onApprove={onReportApprove} />
  </div></section>;
}
