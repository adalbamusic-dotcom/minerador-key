import { radarR6CanApproveReport, radarR6ReportStateLabel, type RadarR6ConsolidatedReport } from "@/lib/radar/r6-sequential";

type RadarR6ReportPanelProps = {
  report: RadarR6ConsolidatedReport | null | undefined;
  /**
   * Aprovação CANÔNICA — a que existe no remoto, não o preparo desta sessão.
   *
   * Sem essa distinção o painel chamava de "Final local" um estado que sumia
   * no F5, ao lado de um botão "Aprovar relatório": dois significados para o
   * mesmo verbo, na mesma tela.
   */
  canonicalApproved?: boolean;
  onGenerate?: () => void;
  onReview?: () => void;
  onApprove?: () => void;
};

const inset = "rounded-md border border-divider bg-surface-subtle p-3";
const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";

function Count({ label, value }: { label: string; value: number }) {
  return <span className="text-sm text-text-muted"><strong className="text-foreground">{value}</strong> {label}</span>;
}

export function RadarR6ReportPanel({ report, canonicalApproved = false, onGenerate, onReview, onApprove }: RadarR6ReportPanelProps) {
  const status = canonicalApproved ? "Aprovado · versão remota confirmada" : report ? radarR6ReportStateLabel(report.state) : "Aguardando geração";
  const canGenerate = Boolean(onGenerate && (!report || report.state === "NOT_STARTED" || report.stale));
  const canReview = report?.state === "REPORT_GENERATED";
  // Pré-condição de BOTÃO. Quem decide se a aprovação vale é `approveRadarReport`.
  const canApprove = radarR6CanApproveReport(report) && !canonicalApproved;
  return <details className="mt-3 rounded-md border border-divider bg-surface" data-testid="radar-r6-report" aria-label="Relatório consolidado do Radar">
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-foreground">
      <span>Relatório consolidado</span>
      <span className="text-sm font-normal text-text-muted">{status}{report ? ` · ${report.needs.length} necessidade(s)` : ""}</span>
    </summary>
    <div className="border-t border-divider px-3 py-3">
      {!report || report.state === "NOT_STARTED" ? <div><p className="text-sm text-text-muted">O relatório competitivo é gerado por ação explícita depois da amostra analisada, e é ele que a aprovação exige.</p><button type="button" className={`${button} mt-3`} onClick={onGenerate} disabled={!canGenerate}>Gerar relatório competitivo</button></div> : <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-4xl text-sm leading-6 text-foreground">{report.summary}</p>
          <span className="shrink-0 rounded-full border border-divider px-3 py-1 text-sm text-text-muted">{canonicalApproved ? "Aprovado no remoto" : report.final ? "Pronto para aprovar" : "Prévia revisável"}</span>
        </div>
        {report.pendingContributions.length > 0 && <div className="mt-3 rounded-md border border-warning/50 bg-warning-soft/20 p-3 text-sm text-foreground"><strong>PENDÊNCIA</strong><p className="mt-1 text-text-muted">{report.pendingContributions.join(" ")}</p></div>}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2" aria-label="Resumo de evidências consolidadas">
          <Count label="referências SERP" value={report.evidence.serp.references.length}/>
          <Count label="evidências Amazon" value={report.evidence.amazon.evidenceIds.length}/>
          <Count label="contribuições ExpertEvidence" value={report.evidence.expert.contributionIds.length}/>
          <Count label="necessidades" value={report.needs.length}/>
          <Count label="lacunas" value={report.gaps.length}/>
          <Count label="conflitos" value={report.conflicts.length}/>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <section className={inset}><h3 className="text-sm font-semibold text-foreground">Necessidades atendidas</h3>{report.needs.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">{report.needs.map(need => <li key={need}>{need}</li>)}</ul> : <p className="mt-2 text-sm text-text-muted">Nenhuma necessidade foi consolidada.</p>}</section>
          <section className={inset}><h3 className="text-sm font-semibold text-foreground">Lacunas restantes</h3>{report.gaps.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">{report.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul> : <p className="mt-2 text-sm text-text-muted">Nenhuma lacuna registrada.</p>}</section>
          <section className={inset}><h3 className="text-sm font-semibold text-foreground">Conflitos</h3>{report.conflicts.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">{report.conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul> : <p className="mt-2 text-sm text-text-muted">Nenhum conflito registrado.</p>}</section>
          <section className={inset}><h3 className="text-sm font-semibold text-foreground">Recomendações editoriais</h3>{report.recommendations.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">{report.recommendations.map(recommendation => <li key={recommendation}>{recommendation}</li>)}</ul> : <p className="mt-2 text-sm text-text-muted">Nenhuma recomendação local.</p>}</section>
        </div>
        <details className="mt-3 rounded-md border border-divider bg-surface p-3"><summary className="cursor-pointer text-sm font-semibold text-foreground">Fontes e proveniência do consolidado</summary><div className="mt-3 grid gap-3 md:grid-cols-3"><SourceList title="SERP" values={report.evidence.serp.references} empty="Nenhuma referência aprovada"/><SourceList title="Amazon" values={[...report.evidence.amazon.evidenceIds, ...report.evidence.amazon.summaries]} empty="Nenhuma evidência Amazon"/><SourceList title="ExpertEvidence" values={[...report.evidence.expert.contributionIds, ...report.evidence.expert.summaries]} empty="Nenhuma evidência revisada"/></div><p className="mt-3 text-sm text-text-muted">ArticleDNA {report.provenance.articleDnaVersionId} · snapshot SERP {report.provenance.serpSnapshotId || "não disponível"} · análise {report.provenance.analysisVersionId || "não disponível"}. IDs técnicos permanecem neste detalhe; perguntas de especialista continuam sendo solicitações, não evidências.</p></details>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={onGenerate} disabled={!canGenerate}>Gerar relatório competitivo novamente</button><button type="button" className={button} onClick={onReview} disabled={!canReview || !onReview}>Marcar relatório revisado</button><button type="button" className={`${button} border-context-accent`} onClick={onApprove} disabled={!canApprove || !onApprove}>{canonicalApproved ? "Relatório aprovado" : "Aprovar relatório"}</button></div>
      </>}
    </div>
  </details>;
}

function SourceList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return <section className={inset}><h3 className="text-sm font-semibold text-foreground">{title}</h3>{values.length ? <ul className="mt-2 space-y-1 text-sm text-text-muted">{values.slice(0, 5).map((value, index) => <li key={`${title}:${index}:${value}`} className="break-words">{value}</li>)}</ul> : <p className="mt-2 text-sm text-text-muted">{empty}</p>}</section>;
}
