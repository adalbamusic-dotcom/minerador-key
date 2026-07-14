"use client";

import type { ArtifactReference, VersionReference } from "@/lib/arquiteto/contracts";
import type { DataOrigin, PipelineState } from "@/lib/editorial/contracts";
import { AlertTriangle, Check, Circle, Clock3, Database, FlaskConical, Lock, XCircle } from "lucide-react";

const stateMeta: Record<PipelineState, { label: string; className: string; icon: typeof Circle }> = {
  not_started: { label: "Não iniciada", className: "text-slate-500 border-slate-800", icon: Circle },
  in_progress: { label: "Em andamento", className: "text-blue-400 border-blue-900", icon: Clock3 },
  pending_review: { label: "Revisão pendente", className: "text-amber-400 border-amber-900", icon: Clock3 },
  approved: { label: "Aprovada", className: "text-emerald-400 border-emerald-900", icon: Check },
  has_conflicts: { label: "Com conflitos", className: "text-rose-400 border-rose-900", icon: AlertTriangle },
  blocked: { label: "Bloqueada", className: "text-slate-600 border-slate-850", icon: Lock },
};

export function VersionBadge({ version, hash }: { version: string | number; hash?: string }) {
  return <span title={hash} className="inline-flex rounded border border-indigo-900/60 bg-indigo-950/20 px-1.5 py-0.5 font-mono text-[9px] text-indigo-300">v{version}</span>;
}
export function ApprovalBadge({ state }: { state: PipelineState }) { const meta = stateMeta[state]; return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] ${meta.className}`}>{meta.label}</span>; }
export function ConfidenceBadge({ value }: { value: number | null }) { return <span className="text-[9px] text-slate-400">{value == null ? "Confiança não informada" : `${Math.round(value * 100)}% confiança`}</span>; }
export function ConflictBadge({ count }: { count: number }) { return count ? <span className="rounded border border-rose-900 px-1.5 py-0.5 text-[9px] text-rose-400">{count} conflito(s)</span> : <span className="text-[9px] text-slate-600">Sem conflitos</span>; }
export function DataOriginBadge({ origin }: { origin: DataOrigin }) { const mock = origin === "mock"; return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] ${mock ? "border-amber-800 text-amber-300" : "border-slate-800 text-slate-500"}`}>{mock ? <FlaskConical className="h-3 w-3"/> : <Database className="h-3 w-3"/>}{mock ? "Dados simulados" : origin}</span>; }

export function EmptyPipelineState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 p-8 text-center"><XCircle className="mx-auto h-7 w-7 text-slate-700"/><h2 className="mt-3 text-sm font-bold text-slate-300">{title}</h2><p className="mx-auto mt-1 max-w-xl text-xs text-slate-600">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
export function HumanDecisionRequired({ children }: { children: React.ReactNode }) { return <div className="rounded border border-amber-900/60 bg-amber-950/10 p-2 text-[10px] text-amber-300"><strong>Decisão humana obrigatória.</strong> {children}</div>; }
export function ProviderNotConfiguredState() { return <div className="rounded border border-slate-800 bg-slate-950/40 p-3 text-[10px] text-slate-500">Nenhum provedor real configurado. As ações disponíveis são simulações locais explícitas.</div>; }
export function ProvenancePanel({ keywordRefs, evidenceRefs, sourceIds }: { keywordRefs: VersionReference[]; evidenceRefs: ArtifactReference[]; sourceIds: string[] }) {
  return <div className="rounded border border-slate-800 bg-black/20 p-2 text-[9px] text-slate-500"><p className="font-bold uppercase tracking-wider text-slate-400">Proveniência compacta</p><p className="mt-1">Keywords: {keywordRefs.map(item => `${item.entityId}@${item.versionId}`).join(", ") || "nenhuma"}</p><p>Evidências: {evidenceRefs.map(item => item.artifactId).join(", ") || "nenhuma"}</p><p>Fontes: {sourceIds.join(", ") || "nenhuma"}</p></div>;
}
