"use client";

import { ArrowRight, FileCheck2, FileSearch, ListChecks, MessageSquareText, Search, Send } from "lucide-react";
import type { RadarWorkbenchModel, RadarWorkbenchStage, RadarWorkbenchStageState } from "@/lib/radar/workbench";
import { RadarActivitySummary } from "./radar-activity-summary";

type RadarWorkbenchProps = {
  model: RadarWorkbenchModel | null;
  activeStage: RadarWorkbenchStage;
  onStageChange: (stage: RadarWorkbenchStage) => void;
  onStageAction: (stage: RadarWorkbenchStage) => void;
  onOpenArticle: () => void;
};

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const subtleButton = `${button} bg-surface-subtle`;

const stageIcons: Record<RadarWorkbenchStage, typeof Search> = {
  serp: Search,
  referencias: ListChecks,
  "analise-serp": FileSearch,
  "evidencias-adicionais": MessageSquareText,
  relatorio: FileCheck2,
  "aprovacao-planejador": Send,
};

const stageTone: Record<RadarWorkbenchStageState, string> = {
  done: "border-success/60 bg-success-soft/40",
  current: "border-context-accent bg-selected",
  pending: "border-divider bg-surface-subtle",
  optional: "border-warning/50 bg-warning-soft/30",
};

const stageStateLabel: Record<RadarWorkbenchStageState, string> = {
  done: "Concluída",
  current: "Etapa atual",
  pending: "Aguardando",
  optional: "Opcional",
};

function ContextValue({ label, value, tone }: { label: string; value: string; tone?: "keyword" }) {
  return <div className="min-w-0"><dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt><dd className={`mt-1 truncate text-sm ${tone === "keyword" ? "text-keyword" : "text-foreground"}`}>{value || "Não informado"}</dd></div>;
}

function StageButton({ stage, active, onClick }: { stage: RadarWorkbenchModel["stages"][number]; active: boolean; onClick: () => void }) {
  const Icon = stageIcons[stage.id];
  return <button type="button" aria-current={active ? "step" : undefined} onClick={onClick} className={`min-w-44 flex-1 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${stageTone[stage.state]} ${active ? "ring-1 ring-context-accent" : "hover:border-context-accent/70"}`}>
    <span className="flex items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-context-accent" aria-hidden="true"/><span className="text-sm font-semibold text-foreground">{stage.label}</span></span>
    <span className="mt-2 block text-xs font-medium text-foreground/85">{stageStateLabel[stage.state]}</span>
    <span className="mt-1 block text-xs leading-5 text-text-muted">{stage.detail}</span>
  </button>;
}

export function LegacyRadarWorkbench({ model, activeStage, onStageChange, onStageAction, onOpenArticle }: RadarWorkbenchProps) {
  if (!model) return <section className="shrink-0 border-b border-divider bg-surface px-4 py-5 lg:px-6" aria-label="Radar Workbench"><div className="mx-auto max-w-[1800px]"><p className="text-sm font-semibold text-foreground">Radar Workbench</p><p className="mt-1 text-sm text-text-muted">Selecione ou expanda um artigo na planilha para acompanhar o processo e a próxima ação.</p></div></section>;

  const selectedStage = model.stages.find(stage => stage.id === activeStage) || model.stages[0];
  const actionLabel = activeStage === "serp" ? "Atualizar SERP" : activeStage === "referencias" ? "Revisar referências" : activeStage === "analise-serp" ? "Abrir análise SERP" : activeStage === "evidencias-adicionais" ? "Trabalhar evidências" : activeStage === "relatorio" ? "Abrir relatório" : "Revisar aprovação";

  return <section className="shrink-0 border-b border-divider bg-surface px-4 py-4 lg:px-6" aria-label="Radar Workbench">
    <div className="mx-auto max-w-[1800px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-module-accent">Radar Workbench</p>
          <h1 className="mt-1 truncate text-xl font-semibold text-foreground">{model.title}</h1>
          <p className="mt-1 text-sm text-text-muted">Contexto do artigo selecionado · próxima ação guiada pela etapa ativa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={subtleButton} onClick={onOpenArticle}>Abrir detalhe completo<ArrowRight className="h-4 w-4" aria-hidden="true"/></button>
        </div>
      </div>
      <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <ContextValue label="Keyword principal" value={model.keyword} tone="keyword"/>
        <ContextValue label="Silo" value={model.silo}/>
        <ContextValue label="Função" value={model.hierarchy}/>
        <ContextValue label="ArticleDNA" value={model.articleDnaVersion}/>
        <ContextValue label="Publicação" value={model.publication}/>
        <ContextValue label="Modo Radar" value={model.mode}/>
      </dl>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Processo sequencial do Radar">
        {model.stages.map(stage => <StageButton key={stage.id} stage={stage} active={stage.id === activeStage} onClick={() => onStageChange(stage.id)}/>)}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="rounded-md border border-divider bg-surface-subtle p-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Próxima ação</p><p className="mt-1 text-sm leading-6 text-foreground">{model.nextAction}</p></div><span className="rounded-full border border-divider px-2.5 py-1 text-xs text-text-muted">{selectedStage?.label} · {selectedStage?.detail}</span></div>
          <button type="button" className={`${button} mt-3`} onClick={() => onStageAction(activeStage)}>{actionLabel}<ArrowRight className="h-4 w-4" aria-hidden="true"/></button>
        </div>
        <div className="rounded-md border border-divider bg-surface-subtle p-3" aria-label="Ferramentas contextuais">
          {activeStage === "serp" && <dl className="grid grid-cols-2 gap-3"><ContextValue label="Provider" value={model.serp.provider}/><ContextValue label="Resultados" value={String(model.serp.resultCount)}/><ContextValue label="Última coleta" value={model.serp.capturedAt || "Ainda não coletada"}/><ContextValue label="Status" value={model.serp.status}/></dl>}
          {activeStage === "referencias" && <dl className="grid grid-cols-2 gap-3"><ContextValue label="Resultados" value={String(model.references.total)}/><ContextValue label="Principais" value={String(model.references.primary)}/><ContextValue label="Apoio" value={String(model.references.support)}/><ContextValue label="Pendentes" value={String(model.references.pending)}/></dl>}
          {activeStage === "analise-serp" && <dl className="grid grid-cols-2 gap-3"><ContextValue label="Status" value={model.analysis.status}/><ContextValue label="Páginas" value={model.analysis.detail}/><ContextValue label="Relatório" value={model.report.status}/><ContextValue label="SERP" value={model.serp.status}/></dl>}
          {activeStage === "evidencias-adicionais" && <dl className="grid grid-cols-2 gap-3"><ContextValue label="Especialista" value={model.additionalEvidence.specialist}/><ContextValue label="Conteúdo existente" value={String(model.additionalEvidence.contentCount)}/><ContextValue label="Contribuições" value={String(model.additionalEvidence.contributionCount)}/><ContextValue label="Estado" value={model.stages.find(stage => stage.id === activeStage)?.detail || "Não iniciadas"}/></dl>}
          {activeStage === "relatorio" && <dl className="grid grid-cols-2 gap-3"><ContextValue label="Relatório" value={model.report.status}/><ContextValue label="Detalhe" value={model.report.detail}/><ContextValue label="Amostra" value={model.analysis.detail}/><ContextValue label="Próximo" value={model.nextAction}/></dl>}
          {activeStage === "aprovacao-planejador" && <dl className="grid grid-cols-2 gap-3"><ContextValue label="Relatório" value={model.report.status}/><ContextValue label="Ação" value={model.nextAction}/><ContextValue label="Publicação" value={model.publication}/><ContextValue label="Modo" value={model.mode}/></dl>}
        </div>
      </div>
      <div className="mt-4">
        <RadarActivitySummary activity={model.activity}/>
      </div>
    </div>
  </section>;
}

export { RadarR3Workbench as RadarWorkbench } from "./radar-r3-workbench";
