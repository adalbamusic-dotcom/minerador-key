"use client";

import { ExternalLink, GitCompareArrows, History, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { SerpCollectionRecord } from "@/lib/editorial/contracts";
import { buildRadarSerpView, type RadarSerpView } from "@/lib/radar/snapshot-view";

type RadarSerpScreenProps = {
  view: RadarSerpView | null;
  records: SerpCollectionRecord[];
  keyword: string | null;
  articleDnaVersionId: string;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenReferences: () => void;
};

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const section = "rounded-lg border border-divider bg-surface p-5";
const inset = "rounded-md border border-divider bg-surface-subtle p-4";

function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

function snapshotLabel(record: SerpCollectionRecord) {
  const view = buildRadarSerpView(record);
  return `v${view.version} · ${view.provider} · ${view.organicResults.length} resultado(s)`;
}

function resultTypes(view: RadarSerpView | null) {
  if (!view) return [];
  return [...new Set(view.organicResults.map(result => result.manualType || result.inferredType))];
}

function MetaField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div><dt className="text-sm text-text-muted">{label}</dt><dd className="mt-1 break-words text-base text-foreground">{value === null || value === undefined || value === "" ? "Não informado" : value}</dd></div>;
}

function Comparison({ left, right }: { left: RadarSerpView | null; right: RadarSerpView | null }) {
  if (!left || !right) return <p className="mt-4 text-base text-text-muted">Selecione dois snapshots para comparar.</p>;
  const countDelta = right.organicResults.length - left.organicResults.length;
  const leftTypes = resultTypes(left);
  const rightTypes = resultTypes(right);
  const addedTypes = rightTypes.filter(type => !leftTypes.includes(type));
  const removedTypes = leftTypes.filter(type => !rightTypes.includes(type));
  return <div className="mt-4 grid gap-3 md:grid-cols-3">
    <div className={inset}><p className="text-sm text-text-muted">Resultados orgânicos</p><p className="mt-1 text-xl font-semibold text-foreground">{left.organicResults.length} → {right.organicResults.length}</p><p className="mt-1 text-sm text-text-muted">Variação: {countDelta > 0 ? "+" : ""}{countDelta}</p></div>
    <div className={inset}><p className="text-sm text-text-muted">Tipos adicionados</p><p className="mt-1 text-base text-foreground">{addedTypes.join(" · ") || "Nenhum"}</p><p className="mt-2 text-sm text-text-muted">Removidos: {removedTypes.join(" · ") || "Nenhum"}</p></div>
    <div className={inset}><p className="text-sm text-text-muted">Capturas</p><p className="mt-1 text-base text-foreground">{formatDate(left.capturedAt)} → {formatDate(right.capturedAt)}</p><p className="mt-2 text-sm text-text-muted">Hash: {left.hash === right.hash ? "inalterado" : "alterado"}</p></div>
  </div>;
}

export function RadarSerpScreen({ view, records, keyword, articleDnaVersionId, refreshing, onRefresh, onOpenReferences }: RadarSerpScreenProps) {
  const orderedRecords = useMemo(() => [...records].sort((left, right) => (buildRadarSerpView(left).version - buildRadarSerpView(right).version)), [records]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const currentRecordId = view?.record.id || orderedRecords.at(-1)?.id || "";
  const previousSnapshotId = view?.record.research?.previousSnapshotId || null;
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const resolvedLeftId = leftId || previousSnapshotId || (orderedRecords.length > 1 ? orderedRecords.at(-2)?.id : "") || currentRecordId;
  const resolvedRightId = rightId || currentRecordId;
  const leftView = orderedRecords.find(record => record.id === resolvedLeftId);
  const rightView = orderedRecords.find(record => record.id === resolvedRightId);
  const left = leftView ? buildRadarSerpView(leftView) : null;
  const right = rightView ? buildRadarSerpView(rightView) : null;
  const targeting = view?.record.research || null;
  const types = resultTypes(view);

  return <section className="space-y-5" aria-labelledby="radar-serp-screen-title">
    <header className={section}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-module-accent">Processo operacional</p>
          <h2 id="radar-serp-screen-title" className="mt-1 text-2xl font-semibold text-foreground">SERP</h2>
          <p className="mt-2 max-w-3xl text-base leading-6 text-text-muted">Consulte o snapshot atual, a proveniência e o histórico da coleta. Abrir esta tela não executa nova chamada; a atualização permanece explícita.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={onRefresh} disabled={refreshing}>{refreshing ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}{refreshing ? "Atualizando…" : "Atualizar SERP"}</button>
          <button type="button" className={button} onClick={() => setHistoryOpen(current => !current)} disabled={!orderedRecords.length}><History className="h-4 w-4" aria-hidden="true" />{historyOpen ? "Ocultar histórico" : "Ver histórico"}</button>
          <button type="button" className={button} onClick={() => setCompareOpen(current => !current)} disabled={orderedRecords.length < 2}><GitCompareArrows className="h-4 w-4" aria-hidden="true" />Comparar snapshots</button>
        </div>
      </div>
      {!view && <div className="mt-5 rounded-md border border-pending bg-pending-soft p-4 text-base text-foreground">Nenhum snapshot SERP disponível para este artigo. Use “Atualizar SERP” somente quando quiser iniciar uma coleta explícita.</div>}
      {onOpenReferences && <button type="button" className="mt-4 text-sm font-medium text-context-accent underline" onClick={onOpenReferences}>Abrir resultados para selecionar referências</button>}
    </header>

    {view && <>
      <section className={section} aria-label="Snapshot SERP atual">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Snapshot atual</h3><p className="mt-1 text-base text-text-muted">{view.query} · {view.provider} · {view.origin === "real" ? "Coleta real" : "Snapshot legado ou simulado"}</p></div><span className={`rounded-full border px-3 py-1 text-sm ${view.persistenceMode === "remote" ? "border-success/60 text-success" : "border-pending/60 text-pending"}`}>{view.persistenceMode === "remote" ? "Persistência remota confirmada" : "Persistência local/fallback"}</span></div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetaField label="Keyword principal" value={keyword || view.query}/><MetaField label="Provider" value={view.provider || "DataForSEO"}/><MetaField label="ArticleDNA" value={view.record.research?.articleDnaVersionId || articleDnaVersionId}/><MetaField label="Versão" value={`v${view.version}`}/><MetaField label="Capturado em" value={formatDate(view.capturedAt)}/><MetaField label="Resultados" value={view.organicResults.length}/><MetaField label="Tipos encontrados" value={types.join(" · ") || "Não classificados"}/><MetaField label="Previous snapshot" value={previousSnapshotId || "Nenhum"}/></dl>
      </section>

      <section className={section} aria-label="Targeting da SERP">
        <h3 className="text-lg font-semibold text-foreground">Targeting</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetaField label="País" value={targeting?.country || "Não recebido"}/><MetaField label="Idioma" value={targeting?.language || view.record.input.language}/><MetaField label="Localização" value={targeting?.location || view.record.input.location}/><MetaField label="Dispositivo" value={targeting?.device || view.record.input.device}/></dl>
      </section>

      <section className={section} aria-label="Preview dos resultados SERP">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Preview dos resultados</h3><p className="mt-1 text-base text-text-muted">Os resultados continuam evidência observada; a classificação editorial acontece em Referências.</p></div><span className="text-base text-text-muted">{view.organicResults.length} resultado(s)</span></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{view.organicResults.slice(0, 10).map(result => <article className={inset} key={`${view.record.id}:${result.position}:${result.url}`}><div className="flex flex-wrap items-start justify-between gap-3"><strong className="text-base text-foreground">{result.position}. {result.title}</strong><span className="text-sm text-text-muted">{result.manualType || result.inferredType}</span></div><a className="mt-2 flex items-start gap-1 break-all text-sm text-context-accent underline" href={result.url} target="_blank" rel="noreferrer">{result.domain}<ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a><p className="mt-2 text-base leading-6 text-text-muted">{result.snippet || "Snippet não retornado."}</p></article>)}</div>
      </section>
    </>}

    {historyOpen && <section className={section} aria-label="Histórico de snapshots SERP"><h3 className="text-lg font-semibold text-foreground">Histórico de snapshots</h3><div className="mt-4 space-y-3">{orderedRecords.map(record => { const item = buildRadarSerpView(record); return <article className={`${inset} ${record.id === currentRecordId ? "border-context-accent" : ""}`} key={record.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-base font-semibold text-foreground">{snapshotLabel(record)}{record.id === currentRecordId ? " · atual" : ""}</p><p className="mt-1 text-sm text-text-muted">{formatDate(item.capturedAt)} · {item.persistenceMode === "remote" ? "remoto" : "local/fallback"}</p></div><span className="text-sm text-text-muted">Anterior: {record.research?.previousSnapshotId || "nenhum"}</span></div></article>; })}</div></section>}

    {compareOpen && <section className={section} aria-label="Comparação de snapshots SERP"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Comparar snapshots</h3><p className="mt-1 text-base text-text-muted">A comparação é descritiva e não cria versão nem altera a persistência.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-sm text-foreground">Snapshot anterior<select className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" value={resolvedLeftId} onChange={event => setLeftId(event.target.value)}>{orderedRecords.map(record => <option key={`left:${record.id}`} value={record.id}>{snapshotLabel(record)}</option>)}</select></label><label className="text-sm text-foreground">Snapshot atual<select className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" value={resolvedRightId} onChange={event => setRightId(event.target.value)}>{orderedRecords.map(record => <option key={`right:${record.id}`} value={record.id}>{snapshotLabel(record)}</option>)}</select></label></div><Comparison left={left} right={right}/></section>}
  </section>;
}
