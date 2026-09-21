"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { ArticleDNA, SiloDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { legacyVersionReference } from "@/lib/arquiteto/versioning";
import { useBrand } from "@/components/brand-context";
import { InfoHint } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { buildRadarArticleHref, radarCanonicalRouteKey } from "@/lib/radar/route-resolution";
import { dataForSeoRecordValue } from "@/lib/minerador/dataforseo-competition";
import { deriveGoogleAdsDemandTrend, formatGoogleAdsCpcTableValue, googleAdsDemandTrendLabel, hasGoogleAdsDemandEvidence } from "@/lib/minerador/google-ads-demand";
import { dataForSeoKeywordDifficultyStateLabel, readDataForSeoKeywordDifficultyEvidence } from "@/lib/minerador/dataforseo-keyword-overview-core";
import { canonicalIntentLabel, normalizeIntentKey } from "@/lib/minerador/intent-taxonomy";
import { calculateKgrFromMetrics, kgrDecisionLabel, kgrTechnicalTone, readKgrApplicability, type KgrApplicability } from "@/lib/minerador/kgr-applicability";
import { serpCollectionLabel, serpEvidenceStrengthPresentation } from "@/lib/minerador/serp-semantic-evidence";
import { qualificationVersionLabel, type KeywordSemanticQualification } from "@/lib/minerador/keyword-semantic-qualification";

import { canCompleteHumanReview, humanReviewRecord, type HumanReviewAction } from "@/lib/minerador/human-review";
import { deriveHumanReviewUiState, humanReviewStatePill, humanReviewStateSummary } from "@/lib/minerador/human-review-ui-state";
import { buildKeywordDecisionSummary, type KeywordDecisionSummary, type KeywordDecisionSummaryState } from "@/lib/minerador/keyword-decision-summary";
import { processorKgrStateLabel, processorMetricStateLabel } from "@/lib/minerador/processor-revalidation";
import { dnaMaturityLabel } from "@/lib/minerador/dna-maturity";
import { volumeEligibilityLabel, type VolumeEligibilityStatus } from "@/lib/minerador/volume-eligibility";
import { readSiteOrigin } from "@/lib/minerador/publication-link";
import { isLegacyPublishedStatus, MINERADOR_EDITORIAL_STATUS_OPTIONS } from "@/lib/minerador/editorial-status";
import { primaryPostLabel } from "@/lib/minerador/primary-keyword-policy";
import { KEYWORD_PAGE_TYPES, keywordPageTypeStanding } from "@/lib/minerador/keyword-page-type";
import { resolveKeywordVinculo } from "@/lib/minerador/keyword-vinculo";
import { keywordUrlRelationLabel } from "@/lib/minerador/publication-link";
import { resolveCanonicalKeywordSnapshot } from "@/lib/minerador/canonical-keyword-snapshot";
import { mineradorProcessPresentation, type MineradorProcessAttempt, type MineradorProcessName, type MineradorProcessState } from "@/lib/minerador/process-state";
import { createSemanticConsolidationDraft, resolveSemanticAxis, semanticConsolidationBySerp, type SemanticAxisResolution, type SemanticConsolidationAxis, type SemanticConsolidationAxisDraft, type SemanticConsolidationDraft, type SemanticSerpStrength } from "@/lib/minerador/semantic-consolidation-draft";
import { ConfidenceBadge, ProvenancePanel, VersionBadge } from "./pipeline-ui";

type ProfileRecord = Record<string, unknown>;
type ProfileFieldValue = unknown;

type KeywordProfileData = {
  listName?: string | null;
  googleAds?: {
    eligibility?: string | null;
    eligibilityStatus?: string | null;
    measurement?: ProfileRecord | null;
  };
  dataForSeo?: {
    measurement?: ProfileRecord | null;
    history?: ProfileRecord[];
    overview?: ProfileRecord | null;
  };
  kgr?: {
    volumeUsed?: number | null;
    allintitleUsed?: number | null;
    score?: number | null;
    calculable?: boolean;
    applicability?: string | null;
    decision?: string | null;
    measurement?: string | null;
    consistency?: string | null;
    history?: ProfileRecord[];
    justification?: string | null;
  };
};

function recordValue(value: unknown): ProfileRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ProfileRecord : null;
}

function googleAdsRecordValue(value: unknown): ProfileRecord | null {
  const objectValue = recordValue(value);
  if (objectValue) return objectValue;
  if (typeof value !== "string" || !value.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ProfileRecord : null;
  } catch {
    return null;
  }
}

function firstRecord(...values: unknown[]): ProfileRecord | null {
  for (const value of values) {
    const result = recordValue(value);
    if (result) return result;
  }
  return null;
}

function displayValue(value: unknown, fallback = "Não informado"): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("pt-BR") : fallback;
  if (Array.isArray(value)) return value.map(item => displayValue(item, "—")).join(", ") || fallback;
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${displayValue(item, "—")}`).join(" · ") || fallback;
  return String(value);
}

function profileDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "Não informado";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(timestamp);
}

function profileConfidence(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Confiança pendente";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "Confiança pendente";
  return `${Math.round((numeric <= 1 ? numeric * 100 : numeric))}% confiança`;
}

function profileNonNegativeNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function kgrCalculationStateLabel(input: { volume: unknown; allintitle: unknown; consistency?: unknown }): string {
  const volume = profileNonNegativeNumber(input.volume);
  if (volume === null) return isMeaningfulProfileValue(input.volume) ? "Medição insuficiente" : "Aguardando volume";
  if (volume === 0) return "Volume zero";

  const allintitle = profileNonNegativeNumber(input.allintitle);
  if (allintitle === null) return isMeaningfulProfileValue(input.allintitle) ? "Medição insuficiente" : "Aguardando Resultado";
  if (calculateKgrFromMetrics(volume, allintitle) === null) return "Medição insuficiente";

  const consistency = normalizeProfileMarker(String(input.consistency || ""));
  if (consistency === "incompatibilidade comprovada") return "Medição inconsistente";
  return "Calculável";
}

function profileAdsCompetition(value: unknown): string | null {
  if (!isMeaningfulProfileValue(value)) return null;

  const normalized = normalizeProfileMarker(String(value));

  return (
    {
      low: "Baixa",
      medium: "Média",
      high: "Alta",
    } as Record<string, string>
  )[normalized] || String(value);
}

function funnelPresentationValue(value: unknown): unknown {
  return normalizeProfileMarker(String(value || "")) === "nao classificavel" ? "Indefinido" : value;
}

function profileTargeting(value: unknown): string {
  const item = recordValue(value);
  if (!item) return typeof value === "string" ? value : "Não informado";
  const languageValue = item.languageCode || item.language;
  const languageMarker = languageValue ? normalizeProfileMarker(String(languageValue)).replace(/[\s_-]/g, "") : "";
  const language = languageValue
    ? ["pt", "ptbr", "portugues", "languageconstants/1014"].includes(languageMarker) ? "Português" : "Idioma configurado"
    : null;
  const geoTargetConstants = Array.isArray(item.geoTargetConstants) ? item.geoTargetConstants : [];
  const locationValue = item.countryCode || item.country || item.locationCode || geoTargetConstants[0];
  const locationMarker = locationValue ? normalizeProfileMarker(String(locationValue)).replace(/\s+/g, "") : "";
  const location = locationValue
    ? ["br", "brasil", "2076", "geotargetconstants/2076"].includes(locationMarker) ? "Brasil" : "Local configurado"
    : null;
  const networkValue = item.keywordPlanNetwork || item.network;
  const networkMarker = networkValue ? normalizeProfileMarker(String(networkValue)).replace(/[\s_-]/g, "") : "";
  const network = networkValue
    ? networkMarker === "googlesearch" ? "Google Search" : networkMarker === "googlesearchandpartners" ? "Google Search + parceiros" : "Rede configurada"
    : null;
  return [language, location, network].filter(Boolean).join(" · ") || "Não informado";
}

function profileJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeProfileMarker(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const profileEmptyMarkers = new Set([
  "",
  "nao informado",
  "nao disponivel",
  "sem silo/categoria",
  "sem relacao definida",
  "confianca nao informada",
]);

function isMeaningfulProfileValue(value: ProfileFieldValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return !profileEmptyMarkers.has(normalizeProfileMarker(value));
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(item => isMeaningfulProfileValue(item));
  if (typeof value === "object") return Object.values(value as ProfileRecord).some(item => isMeaningfulProfileValue(item));
  return true;
}

function logicalSummaryValue(value: ProfileFieldValue): ProfileFieldValue {
  if (typeof value === "string" && normalizeProfileMarker(value) === "nenhuma intencao secundaria inequivoca") return null;
  return value;
}

const profileToneClasses = {
  accent: "border-context-accent/40 bg-context-accent/10 text-context-accent",
  success: "border-success/40 bg-success-soft text-success",
  pending: "border-pending/40 bg-pending-soft text-pending",
  warning: "border-warning/40 bg-warning-soft text-warning",
  danger: "border-danger/40 bg-danger-soft text-danger",
  neutral: "border-divider bg-surface-subtle text-text-muted",
} as const;

function ProfilePill({ label, tone = "neutral" }: { label: string; tone?: keyof typeof profileToneClasses }) {
  const densityClass = "rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none";
  return <span className={`inline-flex items-center ${densityClass} ${profileToneClasses[tone]}`}>{label}</span>;
}

type ProfileFieldDefinition = { label: string; value: ProfileFieldValue; mono?: boolean; wide?: boolean };
type ProfileFieldLayout = "stacked" | "rows" | "rows-compact";

function ProfileField({ label, value, mono = false, wide = false, compact = false, layout = "stacked" }: ProfileFieldDefinition & { compact?: boolean; layout?: ProfileFieldLayout }) {
  if (!isMeaningfulProfileValue(value)) return null;
  const rowLayout = layout !== "stacked";
  const rowGridClass = layout === "rows-compact" ? "grid-cols-[6rem_minmax(0,1fr)]" : "grid-cols-[8rem_minmax(0,1fr)]";
  return <div className={`min-w-0 ${rowLayout ? `grid ${rowGridClass} items-baseline gap-x-2` : `border-b border-divider/70 ${compact ? "pb-2" : "pb-3"} last:border-b-0 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}`}>
    <dt className={`text-sm font-medium text-text-muted ${rowLayout ? "break-words" : ""}`}>{label}</dt>
    <dd className={`min-w-0 whitespace-normal break-words text-foreground [overflow-wrap:anywhere] ${rowLayout ? "mt-0 leading-5" : compact ? "mt-0.5 leading-5" : "mt-1 leading-6"} ${mono ? "font-mono text-sm" : "text-sm"}`}>{displayValue(value)}</dd>
  </div>;
}

function ProfileFields({ fields, compact = false, layout = "stacked" }: { fields: ProfileFieldDefinition[]; compact?: boolean; layout?: ProfileFieldLayout }) {
  const visibleFields = fields.filter(field => isMeaningfulProfileValue(field.value));
  if (visibleFields.length === 0) return null;
  return <dl className={layout !== "stacked" ? "min-w-0 space-y-1" : `grid min-w-0 gap-x-4 sm:grid-cols-2 lg:grid-cols-3 ${compact ? "gap-y-2" : "gap-y-3"}`}>{visibleFields.map(field => <ProfileField key={field.label} compact={compact} layout={layout} {...field} />)}</dl>;
}

function ProfileStepStrip({ steps }: { steps: Array<{ label: string; complete: boolean; value?: string | null; state: MineradorProcessState; title?: string }> }) {
  return <nav aria-label="Progresso do perfil da keyword" data-keyword-profile-steps className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5">
    {steps.map(step => {
      const presentation = mineradorProcessPresentation(step.state);
      const failed = presentation === "failed";
      const stale = presentation === "stale";
      const running = presentation === "running";
      const label = failed ? `${step.label} · Falhou` : stale ? `${step.label} · Atualizar` : running ? `${step.label} · Processando` : step.value !== undefined ? `${step.label} ${step.value ?? "—"}` : step.label;
      const accessibleState = failed
        ? "falha na última tentativa; dados anteriores preservados"
        : stale
          ? "artefato anterior preservado; atualização disponível"
          : running
            ? "processamento em andamento; artefato anterior preservado"
            : step.complete
              ? "concluída"
              : "pendente";
      const tone = failed ? "border-danger/45 bg-danger-soft text-danger" : stale ? "border-pending/40 bg-pending-soft text-pending" : running ? "border-context-accent/40 bg-context-accent/10 text-context-accent" : step.complete ? "border-success/35 bg-success-soft text-success" : "border-divider bg-surface-subtle text-text-muted";
      return <span key={step.label} aria-label={`${step.label}: ${accessibleState}`} title={failed ? "Falha na última tentativa; dados anteriores foram preservados." : stale ? "Artefato anterior preservado. Atualize esta etapa quando desejar." : step.title} data-process-artifact-state={step.state.artifactState} data-process-attempt-state={step.state.attemptState} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${tone}`}>
        {step.value !== undefined && presentation === "current" ? <span>{label}</span> : <><span aria-hidden="true">{failed ? "!" : stale ? "↻" : running ? "·" : step.complete ? "✓" : "—"}</span><span>{label}</span></>}
      </span>;
    })}
  </nav>;
}

function ProfileBento({ number, title, subtitle, status, children }: { number: string; title: string; subtitle?: string; status?: ReactNode; children: ReactNode }) {
  return <section className="min-w-0 rounded-md border border-divider bg-surface-subtle p-2.5" aria-labelledby={`keyword-profile-${number}`}>
    <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-1.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-xs font-bold uppercase tracking-[0.16em] text-context-accent">{number}</span>
        <h3 id={`keyword-profile-${number}`} className="min-w-0 break-words text-base font-semibold tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="mt-1 text-sm leading-5 text-text-muted">{subtitle}</p>}
      </div>
      {status && <div className="flex flex-wrap items-center justify-end gap-2">{status}</div>}
    </header>
    <div className="mt-1.5 min-w-0">{children}</div>
  </section>;
}

function HistoryDetails({ label, value }: { label: string; value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return <details className="mt-2 rounded-md border border-divider bg-surface px-2.5 py-1.5">
    <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">{label} ({value.length})</summary>
    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-divider pt-2 font-mono text-xs leading-5 text-text-muted">{profileJson(value)}</pre>
  </details>;
}

function profileMonthLabel(value: ProfileRecord | null, index: number): string {
  const monthValue = typeof value?.month === "string" ? value.month : null;
  const monthKey = monthValue?.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  const monthLabel = ({ january: "Janeiro", janeiro: "Janeiro", fevereiro: "Fevereiro", february: "Fevereiro", march: "Março", marco: "Março", april: "Abril", abril: "Abril", maio: "Maio", may: "Maio", june: "Junho", junho: "Junho", july: "Julho", julho: "Julho", august: "Agosto", agosto: "Agosto", september: "Setembro", setembro: "Setembro", october: "Outubro", outubro: "Outubro", november: "Novembro", novembro: "Novembro", december: "Dezembro", dezembro: "Dezembro" } as Record<string, string>)[monthKey] || monthValue;
  const period = [monthLabel, value?.year].filter(part => part !== undefined && part !== null).join("/");
  return period || String(value?.date || value?.monthLabel || `Mês ${index + 1}`);
}

function MonthlyHistoryDetails({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return <details className="mt-2 rounded-md border border-divider bg-surface px-2.5 py-1.5">
    <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Histórico mensal ({value.length})</summary>
    <ul className="mt-2 grid max-h-64 grid-cols-2 gap-1.5 overflow-auto border-t border-divider pt-2 sm:grid-cols-3">
      {value.map((entry, index) => {
        const item = recordValue(entry);
        const searches = item?.searches ?? item?.monthlySearches ?? item?.volume ?? item?.value;
        return <li key={`${profileMonthLabel(item, index)}:${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded border border-divider/70 bg-surface-subtle px-2 py-1.5 text-sm">
          <span className="min-w-0 truncate text-text-muted">{profileMonthLabel(item, index)}</span>
          <strong className="shrink-0 font-semibold text-foreground">{displayValue(searches, "Sem dado")}</strong>
        </li>;
      })}
    </ul>
  </details>;
}

const kgrToneClasses = {
  success: "border-success/50 bg-success-soft text-success",
  warning: "border-warning/50 bg-warning-soft text-warning",
  danger: "border-danger/50 bg-danger-soft text-danger",
  neutral: "border-divider bg-surface-subtle text-text-muted",
} as const;

function decisionSummaryTone(state: KeywordDecisionSummaryState): keyof typeof profileToneClasses {
  const marker = normalizeProfileMarker(state.value);
  if (state.key === "dna") {
    if (marker === "confirmada") return "success";
    if (marker === "completa para revisao") return "accent";
    return "pending";
  }
  if (marker === "aplicavel") return "success";
  if (marker === "nao aplicavel") return "neutral";
  return "pending";
}

function DecisionSummary({ summary, kgrTone }: { summary: KeywordDecisionSummary; kgrTone: keyof typeof kgrToneClasses }) {
  const metricRow = (metric: KeywordDecisionSummary["metrics"][number]) => <div key={metric.key} className="grid min-w-0 grid-cols-[5.75rem_minmax(0,1fr)] items-baseline gap-x-2">
    <dt className="text-sm font-medium text-text-muted">{metric.label}</dt>
    <dd className="min-w-0 break-words text-sm font-semibold text-foreground">
      {metric.key === "kgr" ? <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${kgrToneClasses[kgrTone]}`}>{metric.value}</span> : metric.value}
    </dd>
  </div>;
  return <section data-keyword-decision-summary aria-label="Resumo para decisão" className="mt-2 min-w-0 border-t border-divider pt-2">
    <p className="text-sm font-semibold tracking-tight text-foreground">RESUMO PARA DECISÃO</p>
    {summary.groups ? summary.groups.map(group => <section key={group.key} data-keyword-decision-group={group.key} className="mt-1.5 min-w-0">
       <p className="text-sm font-bold tracking-[0.12em] text-text-muted">{group.label}</p>
      <dl className="mt-0.5 grid min-w-0 grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">{group.metrics.map(metricRow)}</dl>
    </section>) : summary.metrics.length > 0 && <dl className="mt-1.5 grid min-w-0 grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">{summary.metrics.map(metricRow)}</dl>}
    {summary.states.length > 0 && <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-divider pt-1.5">
      {summary.states.map(state => <div key={state.key} className="inline-flex min-w-0 items-center gap-1.5">
        <span className="text-sm font-medium text-text-muted">{state.label}</span>
        <ProfilePill label={state.value} tone={decisionSummaryTone(state)} />
      </div>)}
    </div>}
  </section>;
}

// Camada somente de leitura: a consolidação vem da evidência, não de ação humana.
function SemanticConsolidationPanel({ draft, qualification = null, serpCollecting = false, serpFailed = false }: { draft: SemanticConsolidationDraft; qualification?: KeywordSemanticQualification | null; serpCollecting?: boolean; serpFailed?: boolean }) {
  const intentResolution = resolveSemanticAxis(draft.intent);
  const funnelResolution = resolveSemanticAxis(draft.funnel);
  // Rótulo da força vem do read-model da evidência: um único vocabulário para
  // cabeçalho e cards. `null` é ausência de coleta, não força fraca.
  const strength = (value: SemanticSerpStrength) => value
    ? serpEvidenceStrengthPresentation(value)
    : { label: "SERP não coletada", tone: "pending" as const, description: "A coleta real da SERP ainda não foi executada para esta keyword." };
  // Evidência conclusiva fecha o eixo sozinha: não há confirmação humana,
  // proposta, edição semântica nem fallback para a Lógica.
  const axisPanel = (axis: SemanticConsolidationAxis, label: string, value: SemanticConsolidationAxisDraft, resolution: SemanticAxisResolution) => {
    const evidence = strength(value.serpStrength);
    const consolidated = resolution.status === "serp_consolidated";
    // Valor nulo com coleta feita é "sem conclusão"; sem coleta é "não coletada".
    return <section key={axis} data-semantic-consolidation-axis={axis} className="min-w-0 rounded-md border border-divider bg-surface px-2.5 py-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-foreground">{label}</p><div className="inline-flex items-center gap-1.5"><ProfilePill label={evidence.label} tone={evidence.tone} /><InfoHint title={evidence.label} description={evidence.description} /></div></div>
      <dl className="mt-1.5 grid min-w-0 gap-x-3 gap-y-1.5 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-sm text-text-muted">Lógica · hipótese</dt><dd className="break-words text-sm font-semibold text-foreground">{displayValue(value.logic, "Não informado")}</dd></div>
        <div className="min-w-0"><dt className="text-sm text-text-muted">SERP · evidência externa</dt><dd className="break-words text-sm font-semibold text-foreground">{!value.serpStrength ? "Não coletada" : consolidated ? displayValue(value.serp, "Sem conclusão") : "Sem conclusão"}</dd></div>
      </dl>
      <div data-semantic-consolidation-outcome className="mt-2 min-w-0 border-t border-divider pt-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">{consolidated ? "Resultado consolidado" : "Resultado"}</span>
          <strong className={consolidated ? "break-words text-sm font-semibold text-foreground" : "break-words text-sm font-semibold text-text-muted"}>{consolidated ? displayValue(resolution.value, "Indeterminado") : "Não consolidado"}</strong>
          {consolidated && <ProfilePill label="✓ Consolidado pela SERP" tone="success" />}
        </div>
        {!consolidated && resolution.reason && <p className="mt-1 text-sm text-text-muted">Motivo: {resolution.reason}</p>}
        {value.rationale && <p data-semantic-consolidation-rationale className="mt-1 text-sm text-text-muted">{value.rationale}</p>}
      </div>
    </section>;
  };
  // Estado honesto da coleta: só há evidência quando a SERP natural do processo
  // Resultados foi realmente analisada para esta keyword.
  const serpConclusive = draft.intent.serpStrength === "conclusive" || draft.funnel.serpStrength === "conclusive";
  const serpState = serpCollecting
    ? "collecting" as const
    : draft.serpSnapshotRef?.source === "dataforseo_organic"
      ? (serpConclusive ? "analyzed" as const : "analyzed_without_consolidation" as const)
      : serpFailed ? "failed" as const : "not_collected" as const;
  const serpStateDescription = serpState === "not_collected"
    ? "SERP não coletada. Execute o processo Resultados para coletar a evidência externa desta keyword."
    : serpState === "collecting"
      ? "Coletando a SERP da keyword dentro do processo Resultados."
      : serpState === "failed"
        ? (qualification ? `Falha na nova coleta da SERP. A última qualificação válida (v${qualification.lifecycle.version}) continua em uso.` : "Falha na coleta da SERP. Resultado, KD e KGR desta keyword foram preservados.")
        : serpState === "analyzed_without_consolidation"
          ? "SERP analisada, mas a evidência não é conclusiva. Intenção e Funil permanecem não consolidados."
          : "SERP analisada. A evidência conclusiva consolidou Intenção e/ou Funil automaticamente.";
  const consolidatedBySerp = semanticConsolidationBySerp(draft);
  return <section data-keyword-semantic-consolidation className="min-w-0 rounded-md border border-context-accent/35 bg-surface-subtle p-2.5" aria-label="Qualificação semântica">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1.5"><h3 className="text-base font-semibold tracking-tight text-foreground">QUALIFICAÇÃO SEMÂNTICA</h3><InfoHint title="Consolidação semântica" description="A Lógica é hipótese inicial. A SERP real é evidência externa: quando conclusiva, ela fecha Intenção e Funil automaticamente, sem confirmação humana." /></div><ProfilePill label={serpCollectionLabel(serpState)} tone={serpState === "analyzed" ? "success" : serpState === "failed" ? "danger" : serpState === "collecting" ? "accent" : "pending"} /></header>
    <p className="mt-1 text-sm text-text-muted">Esta camada é uma working copy local: não altera Lógica, métricas, KGR, revisão persistida nem o runtime do Arquiteto.</p>
    <div className="mt-2 grid min-w-0 gap-2 xl:grid-cols-2">{axisPanel("intent", "INTENÇÃO", draft.intent, intentResolution)}{axisPanel("funnel", "FUNIL", draft.funnel, funnelResolution)}</div>
    <p data-semantic-consolidation-serp-state className="mt-2 border-t border-divider pt-2 text-sm text-text-muted">{serpStateDescription}</p>
    {draft.serpSnapshotRef && <details data-semantic-consolidation-evidence className="mt-2 border-t border-divider pt-1.5"><summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Ver evidências</summary><p className="mt-1 text-sm text-text-muted">{`${draft.serpSnapshotRef.label} (${draft.serpSnapshotRef.id})`}</p></details>}
    <section data-semantic-consolidation-handoff-preview className="mt-2 rounded-md border border-divider bg-surface px-2.5 py-2" aria-label="Prévia do KeywordDNA"><p className="text-sm font-semibold text-foreground">PRÉVIA DO KEYWORDDNA</p><dl className="mt-1.5 grid min-w-0 gap-x-3 gap-y-1.5 sm:grid-cols-2"><div><dt className="text-sm text-text-muted">Intenção</dt><dd className="text-sm font-semibold text-foreground">{intentResolution.status === "serp_consolidated" ? displayValue(intentResolution.value, "Indeterminado") : "Não consolidada"}</dd></div><div><dt className="text-sm text-text-muted">Funil</dt><dd className="text-sm font-semibold text-foreground">{funnelResolution.status === "serp_consolidated" ? displayValue(funnelResolution.value, "Indefinido") : "Não consolidado"}</dd></div><div><dt className="text-sm text-text-muted">Evidência</dt><dd className="text-sm font-semibold text-foreground">{consolidatedBySerp ? "SERP forte / conclusiva" : serpState === "not_collected" ? "SERP ainda não coletada" : "SERP não conclusiva"}</dd></div><div><dt className="text-sm text-text-muted">Versão</dt><dd className="text-sm font-semibold text-foreground">{qualification ? qualificationVersionLabel(qualification) : "Prévia local · ainda não persistida"}</dd></div></dl></section>
  </section>;
}

function HumanReviewPanel({
  semantic,
  intent,
  status,
  keywordId = "keyword",
  volume,
  allintitle,
  cpc,
  keywordDifficulty,
  kgrScore,
  kgrVolume,
  kgrDetails,
  onAction,
  statusUpdating = false,
  open,
  onOpenChange,
  reviewDraftActive = false,
}: {
  semantic: ProfileRecord;
  intent?: string | null;
  volume: unknown;
  allintitle: unknown;
  cpc: unknown;
  keywordDifficulty: unknown;
  kgrScore: number | null;
  kgrVolume: number | null;
  kgrDetails?: ProfileFieldDefinition[];
  onAction?: (action: HumanReviewAction) => void | Promise<void>;
  statusUpdating?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  reviewDraftActive?: boolean;
  status?: string | null;
  keywordId?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const humanReview = humanReviewRecord(semantic);
  // The review badge reflects the review artifact itself. The KGR gate applies
  // when opening or concluding a review, not retroactively to a completed
  // snapshot after another process is re-run.
  const reviewCompleted = humanReview.status === "completed";
  const reviewEditing = reviewDraftActive || editingReview;
  const reviewLocked = reviewCompleted && !reviewEditing;
  const kgrApplicability = readKgrApplicability(semantic);
  const kgrTone = kgrTechnicalTone(kgrScore, kgrVolume);
  const kgrText = typeof kgrScore === "number" && Number.isFinite(kgrScore)
    ? kgrScore.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
    : "Não calculável";
  const completion = canCompleteHumanReview(semantic, { intent, status });
  // Aqui se decide. Coluna e cabeçalho leem exatamente este mesmo resultado.
  const vinculo = resolveKeywordVinculo({ status, semantic });
  // Decisão humana disponível é decisão concreta esperando escolha — nunca a
  // ausência de clique. Sem nada a decidir, o painel se declara de leitura.
  const pendingHumanDecisions = completion.pendingFields.length + (completion.pendingKgrDecision ? 1 : 0);
  const reviewUiState = deriveHumanReviewUiState({ completed: reviewCompleted, pendingDecisions: pendingHumanDecisions });
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return <section data-keyword-human-review className="min-w-0 rounded-md border border-context-accent/35 bg-surface-subtle p-2.5" aria-label="Revisão humana">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold tracking-tight text-foreground">REVISÃO HUMANA</h3>
        <span data-human-review-state className="text-sm font-medium text-text-muted">{humanReviewStateSummary(reviewUiState, pendingHumanDecisions)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ProfilePill label={humanReviewStatePill(reviewUiState).label} tone={humanReviewStatePill(reviewUiState).tone} />
      </div>
    </header>

    <section aria-label="Resumo da revisão humana" data-human-review-summary className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-divider bg-surface px-2.5 py-2 text-sm">
      {pendingHumanDecisions > 0
        ? <span className="font-semibold text-warning">Decisões pendentes: {pendingHumanDecisions}</span>
        : <span data-human-review-semantic-clean className="font-semibold text-success">Nenhuma decisão humana pendente.</span>}
    </section>

    <section aria-label="Fatos medidos somente leitura" className="mt-2 min-w-0 rounded-md border border-divider bg-surface px-2.5 py-2">
      <p className="text-sm font-semibold text-foreground">FATOS MEDIDOS · somente leitura</p>
      <dl className="mt-1.5 grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-5">
        <div className="min-w-0"><dt className="text-sm text-text-muted">Volume</dt><dd className="mt-0.5 break-words text-base font-semibold text-foreground">{displayValue(volume, "Não medido")}</dd><dd className="text-sm text-text-muted">Google Ads</dd></div>
        <div className="min-w-0"><dt className="text-sm text-text-muted">Resultado</dt><dd className="mt-0.5 break-words text-base font-semibold text-foreground">{displayValue(allintitle, "Não medido")}</dd><dd className="text-sm text-text-muted">DataForSEO</dd></div>
        <div className="min-w-0"><dt className="text-sm text-text-muted">KGR</dt><dd className={`mt-0.5 inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${kgrToneClasses[kgrTone]}`}>{kgrText}</dd><dd className="text-sm text-text-muted">Automático</dd></div>
        <div className="min-w-0"><dt className="text-sm text-text-muted">CPC</dt><dd className="mt-0.5 break-words text-base font-semibold text-foreground">{displayValue(cpc, "Não medido")}</dd><dd className="text-sm text-text-muted">Google Ads</dd></div>
        <div className="min-w-0"><dt className="text-sm text-text-muted">KD</dt><dd className="mt-0.5 break-words text-base font-semibold text-foreground">{displayValue(keywordDifficulty, "Não medido")}</dd><dd className="text-sm text-text-muted">DataForSEO</dd></div>
      </dl>
    </section>

    <section aria-label="Aplicabilidade do KGR" className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-divider bg-surface px-2.5 py-2">
      <div className="min-w-0"><p className="text-sm font-semibold text-foreground">Aplicabilidade do KGR</p><p className="text-sm text-text-muted">A decisão não altera o score nem o status.</p></div>
      <select aria-label="Aplicabilidade do KGR na revisão humana" value={kgrApplicability} disabled={statusUpdating || reviewLocked} onChange={event => void onAction?.({ type: "kgr", applicability: event.target.value as KgrApplicability })} className="min-h-9 rounded-md border border-divider bg-surface-subtle px-2 text-sm font-semibold text-foreground outline-none focus:border-context-accent focus:ring-2 focus:ring-context-accent/30 disabled:cursor-not-allowed disabled:opacity-60">
        <option value="pending">Pendente</option>
        <option value="applicable">Aplicável</option>
        <option value="not_applicable">Não aplicável</option>
      </select>
    </section>

    <section aria-label="Vínculo da keyword" className="mt-2 min-w-0 rounded-md border border-divider bg-surface px-2.5 py-2">
      <p className="text-sm font-semibold text-foreground">Vínculo</p>
      <p className="text-sm text-text-muted">{vinculo.publicationDeclared
        ? "Esta keyword pertence a uma publicação. Diga se ela está travada ao slug e o que a página é."
        : "Nenhuma publicação declarada: a keyword está livre e o tipo é potencial. Nada aqui é obrigatório, e nada trava a escolha."}</p>

      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium text-text-muted" htmlFor={`review-primary-post-${keywordId}`}>Posto de principal</label>
        <select
          id={`review-primary-post-${keywordId}`}
          aria-label="Posto de principal na revisão humana"
          value={vinculo.postSelectValue}
          disabled={statusUpdating || reviewLocked || !onAction}
          onChange={event => { const value = event.target.value; if (value === "locked" || value === "reviewable") void onAction?.({ type: "primary_policy", policy: value }); }}
          className="h-8 rounded-md border border-divider bg-surface-subtle px-2 text-sm font-semibold text-foreground outline-none hover:border-context-accent/60 focus:border-context-accent focus:ring-2 focus:ring-context-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          title="Livre: a keyword pode ser primária ou secundária de qualquer página, e pode perder a vaga. Travado ao slug: ela é a primária desta URL e não se solta dela."
        >
          <option value="reviewable">{primaryPostLabel("free")}</option>
          <option value="locked">{primaryPostLabel("locked")}</option>
        </select>
      </div>

      <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium text-text-muted" htmlFor={`review-page-type-${keywordId}`}>
          {vinculo.publicationDeclared ? "A página publicada é" : "Potencial de página"}
        </label>
        <select
          id={`review-page-type-${keywordId}`}
          aria-label="Tipo de página na revisão humana"
          value={vinculo.pageType.type}
          disabled={statusUpdating || reviewLocked || !onAction}
          onChange={event => void onAction?.({ type: "page_type", pageType: event.target.value as typeof KEYWORD_PAGE_TYPES[number] })}
          className="h-8 rounded-md border border-divider bg-surface-subtle px-2 text-sm font-semibold text-foreground outline-none hover:border-context-accent/60 focus:border-context-accent focus:ring-2 focus:ring-context-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          title="Enquanto a keyword é nova, o tipo é potencial; com publicação declarada, passa a ser declaração. A escolha continua sua nos dois casos."
        >
          {/* O peso vem da publicação, não da opção: escolher Silo numa
              keyword nova é "Silo · potencial"; na publicada é "Silo ·
              declarado". Mostrar só "Silo" escondia metade da frase. */}
          {KEYWORD_PAGE_TYPES.map(value => (
            <option key={value} value={value}>
              {keywordPageTypeStanding(value, { declared: vinculo.publicationDeclared })}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        <span className="font-semibold text-foreground">{vinculo.postLabel}</span>
        {" · "}
        <span className="font-semibold text-foreground">{vinculo.pageTypeLabel}</span>
        {" — "}
        {vinculo.pageType.source === "human"
          ? "escolhido por alguém desta marca."
          : vinculo.pageType.source === "site"
            ? "veio do papel observado na página publicada."
            : "padrão do Minerador. Marque Silo se esta keyword deve abrir um universo novo."}
      </p>
    </section>

    <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm text-text-muted">{reviewLocked ? `Concluída por ${humanReview.completedBy || "usuário"}.` : completion.pendingKgrDecision ? completion.reason || "Trate a aplicabilidade do KGR para concluir a revisão humana." : reviewUiState === "no_decision_needed" ? "Não há decisão humana pendente aqui. Registrar a revisão é opcional e não condiciona aprovação nem envio." : "Você pode revisar cada item ou concluir agora."}</p>
        {!reviewLocked && !completion.pendingKgrDecision && <p className="mt-0.5 text-sm text-text-muted">Ao concluir, divergências sem decisão mantêm a Lógica, enriquecimentos não selecionados são ignorados e campos sem evidência permanecem desconhecidos.</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {reviewLocked ? <button type="button" onClick={() => { setEditingReview(true); setOpen(true); void onAction?.({ type: "reopen" }); }} disabled={statusUpdating || !onAction} className="min-h-9 rounded-md border border-context-accent/50 px-3 text-sm font-semibold text-context-accent transition-colors hover:bg-context-accent/10 disabled:cursor-not-allowed disabled:opacity-50">Revisar novamente</button> : <>
          <button type="button" onClick={() => { setEditingReview(false); void onAction?.({ type: "complete" }); }} disabled={statusUpdating || !onAction} title={completion.reason || "Concluir revisão com os defaults conservadores para itens sem decisão."} className="min-h-9 rounded-md border border-success/50 bg-success-soft px-3 text-sm font-semibold text-success transition-colors hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50">Concluir revisão</button>
          {reviewEditing && <button type="button" onClick={() => { setEditingReview(false); setOpen(false); void onAction?.({ type: "cancel" }); }} disabled={statusUpdating || !onAction} className="min-h-9 rounded-md border border-divider px-3 text-sm font-semibold text-text-muted transition-colors hover:border-context-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>}
        </>}
      </div>
    </div>

    <details data-keyword-human-review-checklist className="mt-2 border-t border-divider pt-2" open={isOpen} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer list-inside text-sm font-semibold text-text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/30">Ver detalhes da revisão</summary>
      <div className="mt-2 min-w-0 space-y-2">
        <div data-keyword-ai-review className="min-w-0">
          {kgrDetails && <section aria-label="Detalhes técnicos do KGR" className="mb-2 min-w-0 rounded-md border border-divider bg-surface px-2.5 py-2">
            <p className="text-sm font-semibold text-foreground">KGR · detalhes técnicos</p>
            <div className="mt-1.5 min-w-0"><ProfileFields fields={kgrDetails} compact layout="rows" /></div>
          </section>}
        </div>
      </div>
    </details>
  </section>;
}

function TechnicalDetails({ semantic, reference, showProvenance, googleAdsValidated, dataForSeoValidated, kgrHistory }: { semantic: ProfileRecord; reference: ReturnType<typeof legacyVersionReference>; showProvenance: boolean; googleAdsValidated: boolean; dataForSeoValidated: boolean; kgrHistory?: ProfileRecord[] }) {
  if (!showProvenance) return null;
  const siteOrigin = firstRecord(semantic.site_origin);
  const dataForSeoMeasurement = dataForSeoRecordValue(semantic.allintitle_measurement);
  const keywordDifficultyEvidence = readDataForSeoKeywordDifficultyEvidence(semantic);
  const dataForSeoOverview = keywordDifficultyEvidence.measurement;
  const dataForSeoLastError = dataForSeoRecordValue(semantic.allintitle_last_error);
  const dataForSeoOverviewLastError = dataForSeoRecordValue(semantic.dataforseo_keyword_overview_last_error);
  const provenanceSummaryFields: ProfileFieldDefinition[] = [
    { label: "Origem do DNA", value: semantic.dna_origem, mono: true },
    { label: "Modelo do DNA", value: semantic.dna_modelo, mono: true },
    { label: "Google Ads", value: googleAdsValidated ? "Validado no Processador" : null },
    { label: "DataForSEO", value: dataForSeoValidated ? "Validado no Processador" : null },
    { label: "KD DataForSEO", value: dataForSeoOverview ? dataForSeoKeywordDifficultyStateLabel(keywordDifficultyEvidence.state, keywordDifficultyEvidence.value) : null },
    { label: "Última atualização", value: profileDate(semantic.updated_at || semantic.processed_at || semantic.created_at) },
    { label: "Hash/versão", value: reference.contentHash, mono: true },
  ];
  const technicalFields = [
    { label: "DNA schema", value: semantic.dna_schema_version, mono: true },
    { label: "Modelo do DNA", value: semantic.dna_modelo, mono: true },
    { label: "Origem do DNA", value: semantic.dna_origem, mono: true },
    { label: "Hash da versão", value: reference.contentHash, mono: true },
    { label: "Processado em", value: profileDate(semantic.processed_at || semantic.updated_at || semantic.created_at) },
    { label: "Request ID Google Ads", value: googleAdsRecordValue(semantic.volume_measurement)?.googleAdsRequestId, mono: true },
    { label: "Provider DataForSEO", value: dataForSeoMeasurement?.provider, mono: true },
    { label: "Versão DataForSEO", value: dataForSeoMeasurement?.providerVersion, mono: true },
    { label: "Executor DataForSEO", value: dataForSeoMeasurement?.executor, mono: true },
    { label: "Endpoint DataForSEO", value: dataForSeoMeasurement?.endpoint, mono: true },
    { label: "Request ID DataForSEO", value: dataForSeoMeasurement?.operationRequestId, mono: true },
    { label: "Request do provider DataForSEO", value: dataForSeoMeasurement?.providerRequestId, mono: true },
    { label: "Tipo da medição", value: dataForSeoMeasurement ? "allintitle" : null, mono: true },
    { label: "Query técnica", value: dataForSeoMeasurement?.query, mono: true },
    { label: "Campo do provider", value: dataForSeoMeasurement ? "resultsAllintitle" : null, mono: true },
    { label: "Custo DataForSEO", value: dataForSeoMeasurement?.cost },
    { label: "Último erro DataForSEO", value: dataForSeoLastError?.message || dataForSeoLastError?.errorCode },
    { label: "KD DataForSEO", value: keywordDifficultyEvidence.value },
    { label: "Executor KD", value: dataForSeoOverview?.executor, mono: true },
    { label: "Endpoint Keyword Overview", value: dataForSeoOverview?.endpoint, mono: true },
    { label: "Request ID Keyword Overview", value: dataForSeoOverview?.operationRequestId, mono: true },
    { label: "Request do provider KD", value: dataForSeoOverview?.providerRequestId, mono: true },
    { label: "Core keyword externo", value: dataForSeoOverview?.coreKeyword || dataForSeoOverview?.core_keyword },
    { label: "Sinal DataForSEO Labs", value: dataForSeoOverview?.externalIntent || dataForSeoOverview?.external_intent },
    { label: "Idioma detectado", value: dataForSeoOverview?.detectedLanguage || dataForSeoOverview?.detected_language },
    { label: "Referring Domains médios", value: dataForSeoOverview?.avgReferringDomains ?? dataForSeoOverview?.avg_referring_domains },
    { label: "Backlinks médios", value: dataForSeoOverview?.avgBacklinks ?? dataForSeoOverview?.avg_backlinks },
    { label: "Main Domain Rank médio", value: dataForSeoOverview?.avgMainDomainRank ?? dataForSeoOverview?.avg_main_domain_rank },
    { label: "Atualização keyword overview", value: dataForSeoOverview?.keywordInfoUpdatedAt || dataForSeoOverview?.keyword_info_updated_at },
    { label: "Atualização backlinks overview", value: dataForSeoOverview?.backlinksInfoUpdatedAt || dataForSeoOverview?.backlinks_info_updated_at },
    { label: "Atualização intenção externa", value: dataForSeoOverview?.searchIntentUpdatedAt || dataForSeoOverview?.search_intent_updated_at },
    { label: "Último erro KD", value: dataForSeoOverviewLastError?.message || dataForSeoOverviewLastError?.errorCode },
  ];
  return <details data-keyword-technical-details className="mt-2 min-w-0 border-t border-divider pt-1.5" aria-label="Proveniência e detalhes técnicos">
    <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Proveniência e detalhes técnicos</summary>
    <div className="mt-1.5 min-w-0">
      <ProfileFields fields={provenanceSummaryFields} compact layout="rows" />
    </div>
    <details data-keyword-technical-details-disclosure className="mt-2 border-t border-divider pt-1.5">
      <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Ver detalhes técnicos</summary>
      <div className="mt-2 min-w-0 space-y-2">
        <ProfileFields fields={technicalFields} />
        {siteOrigin && isMeaningfulProfileValue(siteOrigin) && <div className="rounded-md border border-divider bg-surface p-2.5">
          <p className="text-sm font-semibold text-text-muted">Origem Site/Sitemap</p>
          <div className="mt-2 min-w-0">
            <ProfileFields fields={[
              { label: "Relação", value: siteOrigin.keywordUrlRelation },
              { label: "Situação da URL", value: siteOrigin.urlSituation },
              { label: "Publicação", value: siteOrigin.publicationStatus },
              { label: "Arquitetura", value: siteOrigin.architectureStatus },
              { label: "Silo", value: siteOrigin.siloName || siteOrigin.siloId },
              { label: "Última verificação", value: profileDate(siteOrigin.lastCheckedAt) },
            ]} />
          </div>
        </div>}
        <HistoryDetails label="Histórico KGR" value={kgrHistory} />
        <ProvenancePanel keywordRefs={[reference]} evidenceRefs={[]} sourceIds={[]} />
        <details className="rounded-md border border-divider bg-surface px-2.5 py-1.5">
          <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Payload técnico completo</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-divider pt-2 font-mono text-xs leading-5 text-text-muted">{profileJson(semantic)}</pre>
        </details>
      </div>
    </details>
  </details>;
}

export function KeywordDnaPanel({
  keyword,
  onWorkflowStatusChange,
  onHumanReviewAction,
  humanReviewOpen,
  onHumanReviewOpenChange,
  reviewDraftActive = false,
  statusUpdating = false,
  canonicalUrl,
  primaryPolicy,
  primaryPolicyLabel,
  publication,
  onCheckByLink,
  onPublicationAction,
  semanticConsolidationDraft,
  semanticQualification,
  serpCollecting = false,
  serpFailed = false,
  profile,
  processAttempts,
  showProvenance = true,
  allowPublishedWorkflowStatus = true,
}: {
  keyword: { id: string; keyword: string; intent?: string | null; status?: string | null; volume_search?: number | null; results_allintitle?: number | null; kgr_score?: number | null; volume_source?: string | null; analise_semantica?: ProfileRecord | null };
  onWorkflowStatusChange?: (status: string) => void | Promise<void>;
  onHumanReviewAction?: (action: HumanReviewAction) => void | Promise<void>;
  humanReviewOpen?: boolean;
  onHumanReviewOpenChange?: (open: boolean) => void;
  reviewDraftActive?: boolean;
  statusUpdating?: boolean;
  visualPosition?: number;
  canonicalUrl?: string | null;
  primaryPolicy?: string | null;
  primaryPolicyLabel?: string;
  /**
   * Conferência da página: onde ela está, se foi lida e o que falta declarar.
   * Saiu da coluna Vínculo — lá ficam as declarações, aqui os dados.
   */
  publication?: {
    label: string;
    url: string | null;
    canonicalUrl: string | null;
    checkedAt: string | null;
    canConfirm: boolean;
    canUnlink: boolean;
  };
  onCheckByLink?: () => void;
  onPublicationAction?: (action: "confirm" | "unlink") => void | Promise<void>;
  semanticConsolidationDraft?: SemanticConsolidationDraft;
  semanticQualification?: KeywordSemanticQualification | null;
  serpCollecting?: boolean;
  serpFailed?: boolean;
  profile?: KeywordProfileData;
  processAttempts?: Partial<Record<MineradorProcessName, MineradorProcessAttempt>>;
  showProvenance?: boolean;
  allowPublishedWorkflowStatus?: boolean;
}) {
  const semantic = keyword.analise_semantica || {};
  const canonicalSnapshot = resolveCanonicalKeywordSnapshot({ ...keyword, attempts: processAttempts });
  const keywordReadModel = canonicalSnapshot.semantic;
  const reference = legacyVersionReference(keyword.id, { keyword: keyword.keyword, semantic, intent: keyword.intent });
  const siteOrigin = readSiteOrigin(semantic);
  const publicationLink = canonicalSnapshot.vinculo;
  const legacyPublishedStatus = isLegacyPublishedStatus(keyword.status);
  const editorialStatus = canonicalSnapshot.status;
  const published = publicationLink.state === "published" || publicationLink.state === "legacy_unverified";
  const volumeMeasurement = profile?.googleAds?.measurement || googleAdsRecordValue(semantic.volume_measurement);
  const volumeEligibilityMeasurement = googleAdsRecordValue(semantic.volume_eligibility);
  const volumeEligibilityStatus = volumeEligibilityMeasurement?.status;
  const volumeEligibility = typeof volumeEligibilityStatus === "string" && ["pending", "eligible", "below_threshold", "unavailable", "measurement_failed"].includes(volumeEligibilityStatus)
    ? volumeEligibilityLabel(volumeEligibilityStatus as VolumeEligibilityStatus)
    : profile?.googleAds?.eligibility || "Pendente de medição";
  const dataForSeoOverview = firstRecord(
    profile?.dataForSeo?.overview,
    semantic.dataforseo_keyword_overview,
    semantic.dataforseo_keyword_overview_measurement,
    semantic.keyword_overview_measurement,
  );
  const processorRevalidation = canonicalSnapshot.processor;
  const processStates = canonicalSnapshot.process;
  const logicalProcessComplete = processStates.logic.complete;
  const googleAdsStageComplete = processStates.volume.complete;
  const googleAdsDisplayMeasurement = processorRevalidation.volume.validated ? volumeMeasurement : processorRevalidation.imported.metrics;
  // resolveCanonicalKeywordSnapshot centralizes the former readGoogleAdsCpcEvidence path.
  const cpcEvidence = canonicalSnapshot.metrics.cpc;
  const cpcDecisionValue = cpcEvidence.source === "none" ? null : formatGoogleAdsCpcTableValue(cpcEvidence);
  const googleAdsTrend = deriveGoogleAdsDemandTrend(googleAdsDisplayMeasurement?.monthlySearchVolumes);
  const kgr = profile?.kgr;
  const humanReviewCompleted = processStates.review.complete;
  // Mesma fonte canônica do painel: sem decisão concreta esperando escolha, o
  // Perfil não anuncia pendência de revisão.
  const profilePendingHumanDecisions = canCompleteHumanReview(semantic, { intent: keyword.intent }).pendingKgrDecision ? 1 : 0;
  const profileReviewUiState = deriveHumanReviewUiState({ completed: humanReviewCompleted, pendingDecisions: profilePendingHumanDecisions });
  const primaryPolicyText = primaryPolicyLabel || (primaryPolicy === "locked" ? "Principal travada" : primaryPolicy === "reviewable" ? "Principal revisável" : null);
  const publishedContextFields: ProfileFieldDefinition[] = [
    { label: "URL", value: published ? semantic.published_url || semantic.url_publicada || semantic.url || publicationLink.url : null, mono: true },
    { label: "Canonical", value: published ? semantic.canonical_url || semantic.canonicalUrl || semantic.canonical || siteOrigin?.declaredCanonicalUrl || canonicalUrl || publicationLink.url : null, mono: true },
    // O último elo é a relação keyword/URL, e ela vem do contrato com valores
    // de fio — inclusive o literal "undefined", que é um valor válido ali e
    // aparecia cru na tela. Rótulo, ou nada.
    { label: "Papel atual", value: published ? semantic.papel_atual || semantic.keyword_role || semantic.primary_keyword_role || semantic.papel || keywordUrlRelationLabel(siteOrigin?.keywordUrlRelation as string | null | undefined) : null },
    { label: "Política da principal", value: published ? primaryPolicyText : null },
    { label: "Lista/Silo atual", value: published ? profile?.listName : null },
  ].filter(field => isMeaningfulProfileValue(field.value));
  const hasGoogleAdsMeasurement = hasGoogleAdsDemandEvidence({
    measurement: volumeMeasurement,
    eligibility: volumeEligibilityMeasurement,
    volumeSource: keyword.volume_source,
    volumeSearch: keyword.volume_search,
  }) || processorRevalidation.volume.value !== null;
  const dataForSeoResult = canonicalSnapshot.metrics.result.value;
  const keywordDifficulty = canonicalSnapshot.metrics.kd.value;
  const dataForSeoStageComplete = processStates.results.complete;
  const kgrVolume = canonicalSnapshot.metrics.kgr.volumeUsed;
  const kgrAllintitle = canonicalSnapshot.metrics.kgr.allintitleUsed;
  const resolvedKgrVolume = kgrVolume;
  const resolvedKgrAllintitle = kgrAllintitle;
  const kgrVolumeNumber = profileNonNegativeNumber(resolvedKgrVolume);
  const kgrAllintitleNumber = profileNonNegativeNumber(resolvedKgrAllintitle);
  const kgrScoreValue = canonicalSnapshot.metrics.kgr.score;
  const kgrScore = kgrScoreValue !== null
    ? kgrScoreValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })
    : null;
  const decisionIntent = keywordReadModel.intentState === "confirmed_unknown"
    ? keywordReadModel.intentLabel
    : normalizeIntentKey(keywordReadModel.intent) === "unknown" ? null : keywordReadModel.intentLabel;
  const dataForSeoExternalIntent = keywordReadModel.externalIntentLabel;
  const kgrApplicabilityState = canonicalSnapshot.metrics.kgr.applicability;
  const kgrApplicabilityValue = canonicalSnapshot.metrics.kgr.applicabilityLabel;
  const kgrCalculationState = processorRevalidation.kgr.ready
    ? kgrCalculationStateLabel({ volume: kgrVolumeNumber, allintitle: kgrAllintitleNumber, consistency: kgr?.consistency })
    : processorKgrStateLabel(processorRevalidation.kgr);
  const kgrDetailsFields: ProfileFieldDefinition[] = [
    { label: "Volume usado", value: resolvedKgrVolume },
    { label: "Resultado usado", value: resolvedKgrAllintitle },
    { label: "Estado do cálculo", value: kgrCalculationState },
    { label: "Origem dos inputs", value: processorKgrStateLabel(processorRevalidation.kgr) },
    { label: "Aplicabilidade", value: kgrApplicabilityValue },
    { label: "Decisão", value: kgr?.decision || kgrDecisionLabel(kgrApplicabilityState), wide: true },
    { label: "Justificativa", value: kgr?.justification, wide: true },
  ];
  const logicalIntentValue = typeof semantic.intencao_principal === "string" && semantic.intencao_principal.trim() ? semantic.intencao_principal : null;
  const logicalNicheValue = typeof semantic.nicho === "string" && semantic.nicho.trim() && normalizeProfileMarker(semantic.nicho) !== "geral" ? semantic.nicho : null;
  const logicalFunnelValue = typeof semantic.funnel === "string" && semantic.funnel.trim()
    ? semantic.funnel
    : keywordReadModel.funnelState === "resolved" ? keywordReadModel.funnelLabel : null;
  const canonicalIntentDiffers = keywordReadModel.intentState === "confirmed_unknown"
    || (keywordReadModel.intentState === "resolved" && normalizeIntentKey(keywordReadModel.intent) !== normalizeIntentKey(logicalIntentValue));
  const canonicalNicheDiffers = keywordReadModel.nicheState === "confirmed_unknown"
    || (keywordReadModel.nicheState === "resolved" && normalizeProfileMarker(keywordReadModel.niche || "") !== normalizeProfileMarker(logicalNicheValue || ""));
  const canonicalFunnelValue = keywordReadModel.funnel || keywordReadModel.funnelLabel;
  const logicalFunnelRawValue = funnelPresentationValue(logicalFunnelValue);
  const logicalFunnelDisplayValue: string | null = isMeaningfulProfileValue(logicalFunnelRawValue)
    ? String(logicalFunnelRawValue)
    : null;
  const canonicalFunnelDisplayValue = funnelPresentationValue(keywordReadModel.funnelLabel);
  const semanticConsolidation = semanticConsolidationDraft || createSemanticConsolidationDraft({
    keywordId: keyword.id, brandId: canonicalSnapshot.identity.brandId,
    intent: { logic: logicalIntentValue ? canonicalIntentLabel(logicalIntentValue) : null, ai: null },
    funnel: { logic: logicalFunnelDisplayValue, ai: null },
  });
  // O card da Qualificação Semântica é parte estável do Perfil: sem coleta ele
  // mostra "SERP · Não coletada" em vez de desaparecer.
  const canonicalFunnelDiffers = keywordReadModel.funnelState === "confirmed_unknown"
    || (keywordReadModel.funnelState === "resolved" && String(canonicalFunnelValue || "").toUpperCase() !== String(logicalFunnelValue || "").toUpperCase());
  const logicSummaryFields: ProfileFieldDefinition[] = [
    { label: "Intenção lógica", value: logicalIntentValue || (canonicalIntentDiffers ? null : keywordReadModel.intent) },
    { label: "Intenção canônica", value: canonicalIntentDiffers ? keywordReadModel.intentLabel : null },
    { label: "Intenção secundária", value: logicalSummaryValue(semantic.intencao_secundaria) },
    { label: "Funil lógico", value: logicalFunnelDisplayValue || (canonicalFunnelDiffers ? null : funnelPresentationValue(keywordReadModel.funnel)) },
    { label: "Funil canônico", value: canonicalFunnelDiffers ? canonicalFunnelDisplayValue : null },
    { label: "Entidade central", value: semantic.entidade_central },
    { label: "Modificadores", value: semantic.modificadores },
    { label: "Nicho lógico", value: logicalNicheValue || (canonicalNicheDiffers ? null : keywordReadModel.niche) },
    { label: "Nicho canônico", value: canonicalNicheDiffers ? keywordReadModel.nicheLabel : null },
    { label: "Potencial comercial lógico", value: semantic.potencial_comercial },
  ];
  const logicDetailsFields: ProfileFieldDefinition[] = [
    { label: "Audiência", value: semantic.publico || semantic.perfil_b2b },
    { label: "Problema percebido", value: semantic.problema_percebido, wide: true },
    { label: "Resultado desejado", value: semantic.resultado_desejado, wide: true },
    { label: "Job to be done", value: semantic.job_to_be_done, wide: true },
    { label: "Jornada", value: semantic.etapa_jornada },
    { label: "Nível de consciência", value: semantic.nivel_consciencia },
    { label: "Tipo editorial", value: semantic.tipo_editorial },
    { label: "Formato esperado", value: semantic.formato_esperado },
    { label: "Intenção local", value: semantic.intencao_local },
    { label: "Objeção implícita", value: semantic.objecao_implicita },
    { label: "Urgência/tempo", value: semantic.urgencia_tempo },
    { label: "Emoção dominante", value: semantic.emocao_dominante },
    { label: "Evidências lógicas", value: semantic.evidencias_logicas, wide: true },
  ];
  const hasLogicDetails = logicDetailsFields.some(field => isMeaningfulProfileValue(field.value));
  const googleAdsFields: ProfileFieldDefinition[] = [
    { label: "Volume atual", value: processorRevalidation.volume.value },
    { label: "Tendência", value: googleAdsDemandTrendLabel(googleAdsTrend) },
    { label: "CPC", value: cpcEvidence.sortValue !== null ? formatGoogleAdsCpcTableValue(cpcEvidence) : null },
    { label: "Concorrência Ads", value: profileAdsCompetition(googleAdsDisplayMeasurement?.competition) },
    { label: "Índice de concorrência", value: googleAdsDisplayMeasurement?.competitionIndex },
    { label: "Elegibilidade por volume", value: volumeEligibility },
    { label: "Última medição", value: profileDate(processorRevalidation.volume.measuredAt || volumeEligibilityMeasurement?.measuredAt) },
    { label: "Targeting", value: profileTargeting(googleAdsDisplayMeasurement?.targeting || volumeMeasurement?.targeting) },
    { label: "Estado no Processador", value: processorMetricStateLabel(processorRevalidation.volume.state, processorRevalidation.volume.value !== null), wide: true },
  ];
  const dnaMaturity = canonicalSnapshot.maturity;
  // O cabeçalho REFLETE o que a Revisão Humana decidiu — mesmo resolvedor,
  // nenhuma derivação própria. Foi assim que a coluna passou a discordar do
  // painel: cada tela calculava o seu.
  const headerVinculo = resolveKeywordVinculo({ status: keyword.status, semantic });
  const decisionSummary = buildKeywordDecisionSummary({
    volume: processorRevalidation.volume.value,
    cpc: cpcDecisionValue,
    allintitle: dataForSeoResult,
    kgr: kgrScoreValue,
    keywordDifficulty,
    intent: decisionIntent,
    trend: hasGoogleAdsMeasurement ? googleAdsDemandTrendLabel(googleAdsTrend) : null,
    adsCompetition: hasGoogleAdsMeasurement ? profileAdsCompetition(googleAdsDisplayMeasurement?.competition) : null,
    competitionIndex: hasGoogleAdsMeasurement ? googleAdsDisplayMeasurement?.competitionIndex : null,
    externalIntent: dataForSeoExternalIntent,
    referringDomains: dataForSeoOverview?.avgReferringDomains ?? dataForSeoOverview?.avg_referring_domains,
    backlinks: dataForSeoOverview?.avgBacklinks ?? dataForSeoOverview?.avg_backlinks,
    niche: keywordReadModel.nicheState === "confirmed_unknown" ? keywordReadModel.nicheLabel : keywordReadModel.niche,
    funnel: funnelPresentationValue(keywordReadModel.funnel || (keywordReadModel.funnelState === "resolved" || keywordReadModel.funnelState === "confirmed_unknown" ? keywordReadModel.funnelLabel : null)),
    dnaMaturity: dnaMaturityLabel(dnaMaturity),
    kgrApplicability: kgrApplicabilityValue,
    includeSections: true,
  });
  const finalStatusLabel = !allowPublishedWorkflowStatus && editorialStatus.kind === "legacyEditorialStatusUnresolved"
    ? editorialStatus.label
    : editorialStatus.kind === "resolved"
      ? editorialStatus.label
      : published ? "Publicada" : "Status a definir";
  const logicStateFields: ProfileFieldDefinition[] = [
    { label: "Confiança", value: profileConfidence(semantic.dna_confianca) },
    { label: "Ambiguidade", value: semantic.intencao_ambigua },
    { label: "Revisão humana", value: humanReviewCompleted ? "Concluída" : humanReviewStateSummary(profileReviewUiState, profilePendingHumanDecisions) },
    { label: "Origem lógica", value: logicalProcessComplete ? "Motor determinístico" : null },
    { label: "Maturidade do DNA", value: dnaMaturityLabel(dnaMaturity) },
    { label: "Status final", value: finalStatusLabel },
  ];
  const profileSteps = [
    { label: "Lógica", complete: logicalProcessComplete, state: processStates.logic },
    { label: "Volume", complete: googleAdsStageComplete, state: processStates.volume },
    { label: "Resultados", complete: dataForSeoStageComplete, state: processStates.results },
    { label: "KGR", complete: processStates.kgr.complete, value: processStates.kgr.complete ? kgrScore : null, state: processStates.kgr },
    { label: "Revisão", complete: humanReviewCompleted, state: processStates.review },
  ];
  return <section data-keyword-profile="bento" className="mb-3 w-full min-w-0 whitespace-normal rounded-lg border border-context-accent/35 bg-surface p-2.5">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-divider/70 pb-2" aria-label="Perfil da keyword">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0">
        <InlineLabelCluster
          label={<span className="text-xs font-bold uppercase tracking-[0.16em] text-context-accent">Perfil da keyword</span>}
          info={<InfoHint title="Perfil da keyword" description="Reúne os dados estratégicos consolidados desta keyword para apoiar a decisão editorial." />}
        />
        <h2 className="mt-0.5 min-w-0 break-words text-xl font-semibold tracking-tight text-keyword [overflow-wrap:anywhere]">{keyword.keyword}</h2>
        </div>
        {/* Só há o que anunciar quando existe publicação: aí o endereço, o
            posto e o tipo são fatos. Antes disso não há URL nem vaga a
            perder, e o par do Vínculo continua visível na coluna. */}
        {published && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {/* Publicada é ALERTA, não troféu: dali em diante exclusão e
                edição estrutural ficam bloqueadas (sistema-visual §5.1). */}
            <ProfilePill label="Publicada" tone="danger" />
            <ProfilePill label={headerVinculo.postLabel} tone={headerVinculo.postLockedToSlug ? "accent" : "neutral"} />
            <ProfilePill label={headerVinculo.pageTypeLabel} tone={headerVinculo.pageType.declared ? "accent" : "neutral"} />
          </div>
        )}
      </div>
      <ProfileStepStrip steps={profileSteps} />
    </header>

    {published && publishedContextFields.length > 0 && <div className="mt-2 min-w-0 rounded-md border border-divider bg-surface-subtle p-2.5">
      <p className="text-sm font-semibold text-foreground">CONTEXTO PUBLICADO</p>
      <div className="mt-1.5 min-w-0">
        <ProfileFields fields={publishedContextFields} compact layout="rows" />
      </div>
    </div>}

    <div className="mt-2 grid min-w-0 grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0 xl:col-span-1">
        <ProfileBento number="1" title="LEITURA LÓGICA">
          <div className="grid min-w-0 gap-2 md:grid-cols-2">
            <div className="min-w-0">
              <ProfileFields fields={logicSummaryFields} compact layout="rows-compact" />
              {hasLogicDetails && <details className="mt-2 border-t border-divider pt-1.5">
                <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/30">Mais detalhes da leitura lógica</summary>
                <div className="mt-1.5 min-w-0">
                  <ProfileFields fields={logicDetailsFields} compact layout="rows" />
                </div>
              </details>}
            </div>
            <aside className="min-w-0 border-t border-divider pt-2 md:border-l md:border-t-0 md:pl-3 md:pt-0" aria-label="Estado da leitura lógica">
              <p className="mb-1 text-sm font-semibold text-foreground">ESTADO</p>
              <ProfileFields fields={logicStateFields} compact layout="rows-compact" />
            </aside>
          </div>
        </ProfileBento>
      </div>

      {hasGoogleAdsMeasurement && <div className="min-w-0 xl:col-span-1">
        <ProfileBento number="2" title="GOOGLE ADS" status={<ProfilePill label={processorMetricStateLabel(processorRevalidation.volume.state, processorRevalidation.volume.value !== null)} tone={googleAdsStageComplete ? "success" : "warning"} />}>
          <ProfileFields fields={googleAdsFields} compact layout="rows" />
          <MonthlyHistoryDetails value={googleAdsDisplayMeasurement?.monthlySearchVolumes} />
        </ProfileBento>
      </div>}

      {<div className="min-w-0 md:col-span-2 xl:col-span-2" data-keyword-profile-stage="semantic-consolidation">
        <SemanticConsolidationPanel draft={semanticConsolidation} qualification={semanticQualification} serpCollecting={serpCollecting} serpFailed={serpFailed} />
      </div>}
      <div className="min-w-0 xl:col-span-2" data-keyword-profile-stage="human-review">
        <HumanReviewPanel
          semantic={semantic}
          intent={keyword.intent}
          volume={processorRevalidation.volume.value}
          allintitle={dataForSeoResult}
          cpc={cpcDecisionValue}
          keywordDifficulty={keywordDifficulty}
          kgrScore={kgrScoreValue}
          kgrVolume={kgrVolumeNumber}
          kgrDetails={kgrDetailsFields}
          onAction={onHumanReviewAction}
          statusUpdating={statusUpdating}
          open={humanReviewOpen}
          onOpenChange={onHumanReviewOpenChange}
          reviewDraftActive={reviewDraftActive}
          status={keyword.status}
          keywordId={keyword.id}
        />
      </div>

      <div className="min-w-0 xl:col-span-2" data-keyword-profile-stage="decision">
        <section data-keyword-human-decision className="min-w-0 rounded-md border border-divider bg-surface-subtle p-2.5" aria-label="Decisão humana">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="text-base font-semibold tracking-tight text-foreground">DECISÃO</p>
              <ProfilePill label={humanReviewStatePill(profileReviewUiState).label} tone={humanReviewStatePill(profileReviewUiState).tone} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label className="text-sm font-semibold text-text-muted" htmlFor={`status-${keyword.id}`}>Status final</label>
              {onWorkflowStatusChange && !(legacyPublishedStatus && !allowPublishedWorkflowStatus) ? <select id={`status-${keyword.id}`} aria-label={`Status da keyword ${keyword.keyword}`} value={editorialStatus.status || "bruto"} onChange={event => void onWorkflowStatusChange(event.target.value)} disabled={statusUpdating || legacyPublishedStatus} className="h-8 rounded-md border border-divider bg-surface px-2 text-sm font-semibold text-foreground outline-none hover:border-context-accent/60 focus:border-context-accent focus:ring-2 focus:ring-context-accent/30 disabled:cursor-not-allowed disabled:opacity-60">
                {/* Mesma lista da coluna Status da tabela: o status editorial
                    é um eixo só. "Publicado" saiu daqui — publicação é o outro
                    eixo, declarado no Vínculo, e nenhuma linha do banco usava
                    esse valor. */}
                {MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select> : <span className="text-sm font-semibold text-foreground">{finalStatusLabel}</span>}
            </div>
          </div>
          <DecisionSummary summary={decisionSummary} kgrTone={kgrTechnicalTone(kgrScoreValue, kgrVolumeNumber)} />
          {publication && (
            <section aria-label="Página publicada" className="mt-1.5 min-w-0 border-t border-divider pt-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text-muted">Página</span>
                <span className="text-sm font-semibold text-foreground">{publication.label}</span>
                {publication.checkedAt && <span className="text-sm text-text-muted">Conferida em {new Date(publication.checkedAt).toLocaleString("pt-BR")}</span>}
              </div>
              {publication.url && (
                <a
                  href={publication.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={"mt-0.5 block max-w-full truncate font-mono text-sm hover:underline " + (publication.canonicalUrl ? "text-identity-published" : "text-identity-new")}
                  title={publication.canonicalUrl ? "Endereço da página publicada." : "Página conferida; ainda sem canônico declarado."}
                >
                  {publication.url}
                </a>
              )}
              {publication.canonicalUrl && (
                /* Canônico é identidade SEO, não endereço: cor própria
                   (`identity-slug`) em qualquer estado. */
                <p className="mt-0.5 min-w-0 text-sm text-text-muted">
                  Canônico{" "}
                  <span className="max-w-full break-all font-mono text-identity-slug" title="Canônico declarado na publicação: imutável enquanto o vínculo existir.">
                    {publication.canonicalUrl}
                  </span>
                </p>
              )}
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
                {onCheckByLink && (
                  <button type="button" onClick={onCheckByLink} disabled={statusUpdating} className="min-h-8 rounded-md border border-divider px-2 py-1 text-sm font-medium text-text-muted hover:border-context-accent hover:text-context-accent disabled:cursor-not-allowed disabled:opacity-60">
                    Conferir por link
                  </button>
                )}
                {publication.canConfirm && onPublicationAction && (
                  <button type="button" onClick={() => void onPublicationAction("confirm")} disabled={statusUpdating} className="min-h-8 rounded-md border border-success/50 bg-success-soft px-2 py-1 text-sm font-semibold text-success hover:border-success disabled:cursor-not-allowed disabled:opacity-60">
                    Confirmar publicada
                  </button>
                )}
                {publication.canUnlink && onPublicationAction && (
                  <button type="button" onClick={() => void onPublicationAction("unlink")} disabled={statusUpdating} className="min-h-8 rounded-md border border-divider px-2 py-1 text-sm font-medium text-text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-60">
                    Desvincular publicação
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-text-muted">Conferir lê a página no domínio autorizado. Declarar a publicação é ação humana e não aprova a keyword.</p>
            </section>
          )}
          {showProvenance && <TechnicalDetails semantic={semantic} reference={reference} showProvenance={showProvenance} googleAdsValidated={googleAdsStageComplete} dataForSeoValidated={dataForSeoStageComplete} kgrHistory={kgr?.history} />}
        </section>
      </div>
    </div>
  </section>;
}

export function KeywordDnaProvenance({ keyword }: { keyword: { id: string; keyword: string; intent?: string | null; analise_semantica?: Record<string, unknown> | null } }) {
  const semantic = keyword.analise_semantica || {};
  const reference = legacyVersionReference(keyword.id, { keyword: keyword.keyword, semantic, intent: keyword.intent });
  return <div className="mt-2 rounded border border-divider bg-surface p-2 text-[11px]"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-context-accent">Proveniência</p><ProvenancePanel keywordRefs={[reference]} evidenceRefs={[]} sourceIds={[]}/></div>;
}
type ArticleDnaSummaryProps = {
  version?: VersionEnvelope<ArticleDNA>;
  published?: boolean;
  status?: string | null;
  showSiloProtection?: boolean;
};

export function ArticleDnaSummary({ version, published, status, showSiloProtection = true }: ArticleDnaSummaryProps) {
  const { activeBrandRef } = useBrand();
  const pipeline = useEditorialPipeline();
  const radarItem = version ? pipeline.radarItems.find(item => item.articleDnaVersionId === version.versionId || item.articleId === version.payload.articleId) : null;
  const href = radarItem ? buildRadarArticleHref({ brandRef: activeBrandRef, articleId: radarCanonicalRouteKey(radarItem) }) : null;
  const statusLabel = status === "approved" ? "consolidado e aprovado" : status ? "em revisão humana" : "status não confirmado";
  const originLabel = version?.origin === "ai" ? "Proposta IA" : version?.origin === "system" ? "Base lógica" : version?.origin || "Origem não informada";
  const canFollowToRadar = Boolean(href && status === "approved");
  return <section className="mb-3 rounded-md border border-teal-500/15 bg-teal-950/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold uppercase tracking-wider text-teal-200">Definição do artigo</p>{version ? <VersionBadge version={version.versionNumber} hash={version.contentHash}/> : <span className="text-sm text-slate-500">ArticleDNA ainda não consolidado</span>}</div>{version && <><p className="mt-2 text-xs font-medium uppercase tracking-wider text-context-accent">{originLabel} · {statusLabel}</p><p className="mt-1 text-base font-semibold leading-6 text-slate-50">{version.payload.promise}</p><p className="mt-1 text-sm leading-5 text-slate-400">Ângulo: {version.payload.angle}</p><div className="mt-2 flex flex-wrap items-center gap-2"><ConfidenceBadge value={version.payload.confidence}/><span className="text-sm text-slate-400">{version.payload.keywordReferences.length} perfil(is) de keyword</span></div>{version.payload.humanPendingDecisions.length > 0 && <div className="mt-2 rounded border border-amber-800/40 bg-amber-950/20 p-2"><p className="text-xs font-medium uppercase tracking-wider text-amber-200">Anotações para o pente-fino</p>{version.payload.humanPendingDecisions.map(note => <p key={note} className="mt-1 text-sm leading-5 text-slate-300">• {note}</p>)}</div>}{canFollowToRadar ? <Link href={href!} className="mt-2 inline-flex h-8 items-center rounded-md border border-teal-700/60 bg-teal-950/20 px-2.5 text-[13px] font-medium text-teal-100 transition-colors hover:border-teal-400 hover:bg-teal-900/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70">Seguir para o Radar</Link> : <button type="button" disabled title={status === "approved" ? "O item ainda não possui handoff confirmado ao Radar" : "ArticleDNA precisa de confirmação humana antes do Radar"} className="mt-2 inline-flex h-8 items-center rounded-md border border-teal-700/60 bg-teal-950/20 px-2.5 text-[13px] font-medium text-teal-100 opacity-50">Radar bloqueado até aprovação</button>}</>}{published && <p className="mt-2 rounded border border-emerald-800/40 bg-emerald-950/15 p-2 text-sm leading-5 text-emerald-100">Publicado protegido: marca, {showSiloProtection ? "silo, " : ""}principal, slug e canonical imutáveis.</p>}</section>;
}
export function SiloDnaSummary({ version }: { version?: VersionEnvelope<SiloDNA> }) {
  if (!version) return <span className="text-[8px] text-slate-600">Arquitetura do silo pendente</span>;
  return <details className="relative"><summary className="cursor-pointer text-[8px] font-bold text-emerald-400">Arquitetura do silo · v{version.versionNumber} · IA aplicada</summary><div className="absolute right-0 z-30 mt-2 w-80 rounded border border-emerald-900 bg-[#0b0c10] p-3 shadow-2xl"><p className="text-[8px] font-bold uppercase tracking-wider text-pending">Aplicado localmente · revisar na planilha</p><p className="mt-2 text-[10px] font-bold text-white">{version.payload.centralEntity}</p><p className="mt-1 text-[9px] text-slate-500">Pilar: {version.payload.pillarArticleId || "não definido"} · Suportes: {version.payload.supportArticleIds.length}</p><p className="mt-1 text-[9px] text-amber-400">Fronteira: {version.payload.boundary}</p><p className="text-[9px] text-slate-500">Lacunas: {version.payload.gaps.join(", ") || "nenhuma"}</p></div></details>;
}
