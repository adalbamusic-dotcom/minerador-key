"use client";

import { useMemo, useState } from "react";
import { Check, Download, ExternalLink, FilePenLine, Loader2, Plus, Send } from "lucide-react";
import { useSession } from "next-auth/react";
import { useBrand } from "@/components/brand-context";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { OperationalDataGrid, type OperationalGridColumn } from "@/components/editorial/operational-data-grid";
import { WorkflowImportDialog, WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { EmptyPipelineState } from "@/components/editorial/pipeline-ui";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import type { OperationalPublication } from "@/lib/editorial/operational-flow";
import { applyPublicationAction } from "@/lib/publicacoes/domain";
import type { PublicationAction, PublicationActionRequest } from "@/lib/publicacoes/contracts";
import { createPublicationExport, createPublicationsCsv } from "@/lib/publicacoes/export";

const btn = "inline-flex h-7 items-center rounded border border-indigo-900 bg-indigo-950/20 px-2.5 text-[10px] font-bold text-indigo-300 hover:bg-indigo-950/50 disabled:cursor-not-allowed disabled:opacity-40";
const field = "h-7 w-full rounded border border-slate-800 bg-black px-2 text-[10px] text-slate-200 outline-none focus:border-indigo-600";
const card = "rounded border border-slate-800 bg-[#090a0e] p-2";

type LegacyPublication = {
  id: string; brandId: string; articleId: string; plannerItemId: string; contentPlanVersionId: string; documentId: string;
  title: string; slug: string; siloId: string; hierarchy: string; state: "published" | "approved"; responsible: string | null;
  destination: string | null; createdAt: string; updatedAt: string; origin: "real"; source: "briefing"; unitType: "article";
};
type PublicationRow = (OperationalPublication & { source: "workflow" }) | LegacyPublication;

function isWorkflow(row: PublicationRow): row is OperationalPublication & { source: "workflow" } { return row.source === "workflow"; }
function sessionId(session: ReturnType<typeof useSession>["data"]) { return session?.user?.email || session?.user?.id || "usuario-local"; }
function downloadFile(fileName: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function PublicationsWorkspace() {
  const { data: session } = useSession(); const { selectedBrandId } = useBrand(); const pipeline = useEditorialPipeline();
  const [tab, setTab] = useState<"library" | "queue" | "published" | "updates">("library"); const [picker, setPicker] = useState(false);
  const [notice, setNotice] = useState(""); const [busyId, setBusyId] = useState<string | null>(null);
  const historyValue = useMemo(() => ({ operationalPublications: pipeline.operationalPublications }), [pipeline.operationalPublications]);
  const history = useLocalHistory("publicacoes", historyValue, snapshot => pipeline.restoreOperationalSnapshot("publicacoes", snapshot), 30, selectedBrandId || "sem-marca");

  if (pipeline.loading && !pipeline.snapshot) return <div className="flex min-h-[50vh] items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Carregando Publicações…</div>;
  if (!pipeline.snapshot || !selectedBrandId) return <EmptyPipelineState title="Marca sem dados" description={pipeline.error || "Selecione uma marca autorizada."}/>;

  const workflowRows: PublicationRow[] = pipeline.operationalPublications.map(item => ({ ...item, source: "workflow" as const }));
  const legacyRows: PublicationRow[] = pipeline.snapshot.briefings.map(item => ({ id: `briefing:${item.id}`, brandId: selectedBrandId, articleId: item.id, plannerItemId: "", contentPlanVersionId: "", documentId: "", title: item.titulo || item.keyword_principal, slug: item.slug_sugerido || "", siloId: item.silo_id, hierarchy: item.hierarquia || "", state: item.status?.toLowerCase() === "publicado" ? "published" : "approved", responsible: null, destination: item.canonical, createdAt: item.created_at || new Date(0).toISOString(), updatedAt: item.updated_at || item.created_at || new Date(0).toISOString(), origin: "real", source: "briefing", unitType: "article" }));
  const allRows = [...workflowRows, ...legacyRows];
  const rows = allRows.filter(row => tab === "published" ? row.state === "published" && (!isWorkflow(row) || !row.updateRequested) : tab === "updates" ? isWorkflow(row) && row.updateRequested : tab === "queue" ? ["ready_to_export", "queued", "exported"].includes(row.state) : ["approved", "ready_to_export"].includes(row.state));
  const approved = pipeline.operationalPublications.filter(item => item.state === "approved").map(item => ({ ...item, alreadyImported: false }));

  const replaceLocal = (publication: OperationalPublication) => pipeline.restoreOperationalSnapshot("publicacoes", { operationalPublications: pipeline.operationalPublications.map(item => item.id === publication.id ? publication : item) });
  const runAction = async (publication: OperationalPublication, action: PublicationAction) => {
    if (!selectedBrandId) return null;
    const request = { ...action, brandId: selectedBrandId, publicationId: publication.id, expectedLockVersion: publication.lockVersion } as PublicationActionRequest;
    const actor = sessionId(session); let optimistic: OperationalPublication;
    try { optimistic = applyPublicationAction(publication, request, actor); } catch (error) { setNotice(error instanceof Error ? error.message : "Ação inválida."); return null; }
    history.capture(`Publicações: ${request.action}`); replaceLocal(optimistic); setBusyId(publication.id); setNotice("");
    try {
      const response = await fetch("/api/publicacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }); const body = await response.json();
      if (!response.ok) { replaceLocal(publication); throw new Error(body.error || "Não foi possível salvar a ação."); }
      if (body.publication) replaceLocal(body.publication as OperationalPublication); setNotice("Ação de Publicações salva."); return body.publication as OperationalPublication;
    } catch (error) {
      if (error instanceof Error && (error.message.includes("persistência") || error.message.includes("indisponível"))) setNotice(`${error.message} Resultado mantido apenas no fallback local.`);
      else if (error instanceof Error) setNotice(error.message);
      return null;
    } finally { setBusyId(null); }
  };

  const exportPublication = async (publication: OperationalPublication, format: "markdown" | "json") => {
    const document = pipeline.documents[publication.documentId]; if (!document) { setNotice("O ContentDocument não está disponível para exportação."); return; }
    setBusyId(publication.id); setNotice("");
    try {
      const artifact = await createPublicationExport(publication, document, format); downloadFile(artifact.fileName, artifact.mimeType, artifact.content);
      await runAction(publication, { action: "record_export", exportFileName: artifact.fileName, exportFormat: format, documentHash: artifact.documentHash });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível exportar."); setBusyId(null); }
  };

  const exportManifest = () => { downloadFile("publicacoes.csv", "text/csv;charset=utf-8", createPublicationsCsv(pipeline.operationalPublications)); setNotice("Manifesto CSV exportado."); };
  const columns: OperationalGridColumn<PublicationRow>[] = [
    { id: "title", header: "Conteúdo", value: row => row.title, pinned: "left", sortable: true, width: 250 },
    { id: "unitType", header: "Unidade", value: row => row.unitType === "silo_page" ? "SiloPage" : "Artigo", width: 95 },
    { id: "slug", header: "Slug", value: row => row.slug, width: 180, render: row => <code>/{row.slug}</code> },
    { id: "silo", header: "Silo", value: row => row.siloId, width: 130 },
    { id: "responsible", header: "Responsável", value: row => row.responsible || "não atribuído", width: 150 },
    { id: "state", header: "Status", value: row => row.state, render: row => <span className="flex items-center gap-1"><WorkflowStatusBadge status={row.state}/>{isWorkflow(row) && row.updateRequested && <span className="text-[9px] text-amber-400">atualização</span>}</span>, sortable: true, width: 180 },
    { id: "destination", header: "Destino / URL", value: row => isWorkflow(row) ? row.destinationUrl || row.destination || "não definido" : row.destination || "não definido", width: 220 },
    { id: "updatedAt", header: "Atualizado", value: row => new Date(row.updatedAt).toLocaleString("pt-BR"), sortable: true, width: 160 },
  ];

  const importApproved = (ids: string[]) => { history.capture(`Importar ${ids.length} item(ns) do Redator`); const result = pipeline.importApprovedToPublications(ids); setPicker(false); setNotice(`${result.imported} item(ns) importado(s); ${result.skipped} ignorado(s).`); };
  const toolbar = <><HistoryControls entries={history.entries} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onRestore={history.restore} compact/>{([["library", "Biblioteca"], ["queue", "Fila"], ["published", "Publicados"], ["updates", "Atualizações"]] as const).map(([id, label]) => <button key={id} className={`${btn} ${tab === id ? "border-indigo-500 text-white" : ""}`} onClick={() => setTab(id)}>{label}</button>)}<button className={btn} onClick={() => setPicker(true)}><Plus className="mr-1 h-3 w-3"/>Importar aprovados</button><button className={btn} onClick={exportManifest}><Download className="mr-1 h-3 w-3"/>CSV</button></>;

  return <div className="flex h-screen min-h-0 flex-col">{notice && <div className="shrink-0 border-b border-amber-900/40 bg-amber-950/20 px-3 py-1.5 text-[9px] text-amber-300">{notice}</div>}
    <OperationalDataGrid title="Publicações" description="Biblioteca, fila, exportação e registro manual — sem envio automático ao CMS." module={`publicacoes:${tab}`} userId={sessionId(session)} brandId={selectedBrandId} rows={rows} columns={columns} toolbar={toolbar} emptyTitle="Nenhum conteúdo nesta aba." renderActions={row => <PublicationRowActions row={row} busy={busyId === row.id} onAction={runAction} onExport={exportPublication} onNotice={setNotice}/>} renderExpanded={row => <PublicationExpanded row={row}/>}/>
    <WorkflowImportDialog open={picker} title="Importar aprovados do Redator" description="Documentos aprovados permanecem visíveis; itens já importados ficam bloqueados." rows={approved} label={item => item.title} details={item => <span className="mt-1 block text-slate-500">/{item.slug} · {item.unitType === "silo_page" ? "SiloPage" : "Artigo"}</span>} disabled={item => item.alreadyImported} status={() => "approved"} onClose={() => setPicker(false)} onImport={importApproved}/>
  </div>;
}

function PublicationRowActions({ row, busy, onAction, onExport, onNotice }: { row: PublicationRow; busy: boolean; onAction: (publication: OperationalPublication, action: PublicationAction) => Promise<OperationalPublication | null>; onExport: (publication: OperationalPublication, format: "markdown" | "json") => Promise<void>; onNotice: (message: string) => void }) {
  if (!isWorkflow(row)) return <span className="text-[9px] text-slate-600">Registro legado; documento local ausente</span>;
  if (row.state === "approved") return <span className="text-[9px] text-cyan-400">Importe pelo seletor</span>;
  if (row.state === "ready_to_export") return <button className={btn} disabled={busy} onClick={() => void onAction(row, { action: "queue" })}><Send className="mr-1 h-3 w-3"/>Colocar na fila</button>;
  if (row.state === "queued") return <div className="flex gap-1"><button className={btn} disabled={busy} onClick={() => void onExport(row, "markdown")}><Download className="mr-1 h-3 w-3"/>Markdown</button><button className={btn} disabled={busy} onClick={() => void onExport(row, "json")}>JSON</button></div>;
  if (row.state === "exported") return <PublicationPublishForm row={row} busy={busy} onPublish={onAction} onNotice={onNotice}/>;
  if (row.state === "published") {
    const updateExported = Boolean(row.updateRequested && row.lastExportedAt && row.updateRequestedAt && row.lastExportedAt >= row.updateRequestedAt);
    if (updateExported) return <PublicationPublishForm row={row} busy={busy} onPublish={onAction} onNotice={onNotice} update/>;
    if (row.updateRequested) return <div className="flex gap-1"><button className={btn} disabled={busy} onClick={() => void onExport(row, "markdown")}><Download className="mr-1 h-3 w-3"/>Exportar atualização</button><button className={btn} disabled={busy} onClick={() => void onAction(row, { action: "reedit", note: "Reedição aberta em Publicações." }).then(result => { if (result) window.location.href = `/redator?articleId=${row.articleId}`; })}><ExternalLink className="mr-1 h-3 w-3"/>Reeditar</button></div>;
    return <div className="flex gap-1"><button className={btn} disabled={busy} onClick={() => void onAction(row, { action: "request_update", note: "Atualização solicitada em Publicações." })}><FilePenLine className="mr-1 h-3 w-3"/>Solicitar atualização</button><button className={btn} disabled={busy} onClick={() => void onAction(row, { action: "reedit", note: "Reedição aberta em Publicações." }).then(result => { if (result) window.location.href = `/redator?articleId=${row.articleId}`; })}><ExternalLink className="mr-1 h-3 w-3"/>Reeditar</button></div>;
  }
  if (row.updateRequested) return <span className="text-[9px] text-amber-400">Atualização solicitada</span>;
  return <span className="text-[9px] text-slate-600">Ação indisponível neste estado</span>;
}

function PublicationPublishForm({ row, busy, onPublish, onNotice, update = false }: { row: OperationalPublication; busy: boolean; onPublish: (publication: OperationalPublication, action: PublicationAction) => Promise<OperationalPublication | null>; onNotice: (message: string) => void; update?: boolean }) {
  const [destination, setDestination] = useState(row.destination || ""); const [url, setUrl] = useState(row.destinationUrl || "");
  const submit = () => { try { new URL(url); } catch { onNotice("Informe uma URL final absoluta válida."); return; } void onPublish(row, { action: "publish", destination, destinationUrl: url, documentHash: row.lastExportDocumentHash || undefined }); };
  return <div className="flex min-w-[300px] items-center gap-1"><input aria-label="Destino manual" className={field} placeholder="Destino" value={destination} onChange={event => setDestination(event.target.value)}/><input aria-label="URL final publicada" className={field} placeholder="https://site/..." value={url} onChange={event => setUrl(event.target.value)}/><button className={btn} disabled={busy || !destination || !url} onClick={submit}><Check className="mr-1 h-3 w-3"/>{update ? "Registrar atualização" : "Registrar URL"}</button></div>;
}

function PublicationExpanded({ row }: { row: PublicationRow }) {
  return <dl className="grid gap-2 md:grid-cols-4"><Detail label="Artigo" value={row.articleId}/><Detail label="Unidade" value={row.unitType === "silo_page" ? "SiloPage" : "Artigo"}/><Detail label="ContentPlan" value={row.contentPlanVersionId || "legado"}/><Detail label="ContentDocument" value={row.documentId || "ausente"}/><Detail label="Destino" value={isWorkflow(row) ? row.destination || "não definido" : row.destination || "não definido"}/><Detail label="URL final" value={isWorkflow(row) ? row.destinationUrl || "não registrada" : "não registrada"}/><Detail label="Última exportação" value={isWorkflow(row) ? row.lastExportFileName || "não exportado" : "não aplicável"}/><div className={card}><strong className="text-[9px] uppercase text-slate-500">Histórico</strong>{isWorkflow(row) && row.history.length ? <ul className="mt-1 space-y-1">{row.history.slice().reverse().map(event => <li key={event.id} className="text-[9px] text-slate-400">{new Date(event.occurredAt).toLocaleString("pt-BR")} · {event.action}{event.destinationUrl ? ` · ${event.destinationUrl}` : ""}</li>)}</ul> : <p className="mt-1 text-[9px] text-slate-600">Nenhum evento operacional registrado.</p>}</div></dl>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</dt><dd className="mt-1 break-words text-[10px] text-slate-300">{value}</dd></div>; }
