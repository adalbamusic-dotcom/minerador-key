"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Columns3, Download, ExternalLink, FilePenLine, Loader2, Send } from "lucide-react";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { useBrand } from "@/components/brand-context";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { OperationalDataGrid, type OperationalDataGridTopbarApi, type OperationalGridColumn, type OperationalGridOrderMode, type OperationalGridPageSize } from "@/components/editorial/operational-data-grid";
import { WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { EmptyPipelineState } from "@/components/editorial/pipeline-ui";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import type { OperationalPublication } from "@/lib/editorial/operational-flow";
import { applyPublicationAction } from "@/lib/publicacoes/domain";
import type { PublicationAction, PublicationActionRequest } from "@/lib/publicacoes/contracts";
import { createPublicationExport, createPublicationsCsv } from "@/lib/publicacoes/export";
import { useNoticeBridge } from "@/components/global-notice-center";
import Link from "next/link";
import { PUBLICATIONS_LIBRARY_DEFAULT_FILTER, PUBLICATIONS_LIBRARY_FILTERS, PUBLICATIONS_LIBRARY_FILTER_LABELS, filterEditorialLibrary, projectEditorialLibrary, writerHrefForRow, type EditorialLibraryFilter } from "@/lib/publicacoes/editorial-library";

const btn = "inline-flex h-7 items-center rounded border border-divider bg-surface-subtle px-2.5 text-[10px] font-bold text-foreground/75 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
const field = "h-7 w-full rounded border border-divider bg-surface-subtle px-2 text-[10px] text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/45";
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
  const { data: session } = useSession(); const { selectedBrandId, activeBrandRef } = useBrand(); const pipeline = useEditorialPipeline();
  /* O escopo da biblioteca é a ENTREGA. Sem registro, o documento não é daqui. */
  const [libraryStatus, setLibraryStatus] = useState<EditorialLibraryFilter>(PUBLICATIONS_LIBRARY_DEFAULT_FILTER);
  const [tab, setTab] = useState<"library" | "queue" | "published" | "updates">("library");
  const [notice, setNotice] = useState(""); const [busyId, setBusyId] = useState<string | null>(null);
  useNoticeBridge({ notice, module: "publicacoes", area: "Publicações", title: "Publicações", fallbackSeverity: "INFO" });
  const historyValue = useMemo(() => ({ operationalPublications: pipeline.operationalPublications }), [pipeline.operationalPublications]);
  const history = useLocalHistory("publicacoes", historyValue, snapshot => pipeline.restoreOperationalSnapshot("publicacoes", snapshot), 30, selectedBrandId || "sem-marca");

  if (pipeline.loading && !pipeline.snapshot) return <div className="flex min-h-[50vh] items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Carregando Publicações…</div>;
  if (!pipeline.snapshot || !selectedBrandId) return <EmptyPipelineState title="Marca sem dados" description={pipeline.error || "Selecione uma marca autorizada."}/>;

  const workflowRows: PublicationRow[] = pipeline.operationalPublications.map(item => ({ ...item, source: "workflow" as const }));
  const legacyRows: PublicationRow[] = pipeline.snapshot.briefings.map(item => ({ id: `briefing:${item.id}`, brandId: selectedBrandId, articleId: item.id, plannerItemId: "", contentPlanVersionId: "", documentId: "", title: item.titulo || item.keyword_principal, slug: item.slug_sugerido || "", siloId: item.silo_id, hierarchy: item.hierarquia || "", state: item.status?.toLowerCase() === "publicado" ? "published" : "approved", responsible: null, destination: item.canonical, createdAt: item.created_at || new Date(0).toISOString(), updatedAt: item.updated_at || item.created_at || new Date(0).toISOString(), origin: "real", source: "briefing", unitType: "article" }));
  const allRows = [...workflowRows, ...legacyRows];
  /*
   * ===== A BIBLIOTECA PROJETA `content_documents` =====
   *
   * Antes, a aba lia só registros de publicação. Um documento persistido no
   * Redator, sem registro ainda, não aparecia em lugar nenhum — e a lista de
   * rascunhos do Redator virava uma biblioteca paralela implícita.
   *
   * A linha é o DOCUMENTO. O registro de publicação, quando existe, enriquece a
   * mesma linha; ele nunca cria uma segunda.
   */
  const libraryRows = projectEditorialLibrary({
    brandId: selectedBrandId,
    documents: Object.values(pipeline.documents),
    publications: pipeline.operationalPublications,
    updatedAtByDocument: pipeline.documentUpdatedAt,
  });
  const libraryVisible = filterEditorialLibrary(libraryRows, libraryStatus);
  const rows = allRows.filter(row => tab === "published" ? row.state === "published" && (!isWorkflow(row) || !row.updateRequested) : tab === "updates" ? isWorkflow(row) && row.updateRequested : tab === "queue" ? ["ready_to_export", "queued", "exported"].includes(row.state) : ["approved", "ready_to_export"].includes(row.state));


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
    const document = pipeline.documents[publication.documentId]; if (!document) { setNotice("O conteúdo do artigo não está disponível para exportação."); return; }
    setBusyId(publication.id); setNotice("");
    try {
      const artifact = await createPublicationExport(publication, document, format); downloadFile(artifact.fileName, artifact.mimeType, artifact.content);
      await runAction(publication, { action: "record_export", exportFileName: artifact.fileName, exportFormat: format, documentHash: artifact.documentHash });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível exportar."); setBusyId(null); }
  };

  const exportManifest = () => { downloadFile("publicacoes.csv", "text/csv;charset=utf-8", createPublicationsCsv(pipeline.operationalPublications)); setNotice("Manifesto CSV exportado."); };
  const columns: OperationalGridColumn<PublicationRow>[] = [
    { id: "title", header: "Conteúdo", value: row => row.title, pinned: "left", sortable: true, width: 250 },
    { id: "unitType", header: "Unidade", value: row => row.unitType === "silo_page" ? "Página do silo" : "Artigo", width: 95 },
    { id: "slug", header: "Slug", value: row => row.slug, width: 180, render: row => <code>/{row.slug}</code> },
    { id: "silo", header: "Silo", value: row => row.siloId, width: 130 },
    { id: "responsible", header: "Responsável", value: row => row.responsible || "não atribuído", width: 150 },
    { id: "state", header: "Status", value: row => row.state, render: row => <span className="flex items-center gap-1"><WorkflowStatusBadge status={row.state}/>{isWorkflow(row) && row.updateRequested && <span className="text-[9px] text-amber-400">atualização</span>}</span>, sortable: true, width: 180 },
    { id: "destination", header: "Destino / URL", value: row => isWorkflow(row) ? row.destinationUrl || row.destination || "não definido" : row.destination || "não definido", width: 220 },
    { id: "updatedAt", header: "Atualizado", value: row => new Date(row.updatedAt).toLocaleString("pt-BR"), sortable: true, width: 160 },
  ];

  /*
   * ===== A FILA FICOU SOMENTE LEITURA — CORTE 3.5 =====
   *
   * `importApprovedToPublications` atualizava o estado local e disparava o
   * comando ao servidor sem esperar: a tela dizia "importado" antes de qualquer
   * confirmação. Era uma segunda autoridade de entrada em Publicações, e ela
   * discordava da primeira.
   *
   * A entrada é `sendWriterToPublications`, com persistência e readback. A Fila
   * lista o que JÁ foi recebido; ela não recebe.
   */
  /*
   * ===== A NAVEGAÇÃO NÃO PODE DEPENDER DA ÁREA ABERTA =====
   *
   * Estes quatro botões viviam dentro de `renderTopbarActions`, que só é
   * chamado pelo `OperationalDataGrid`. Como a Biblioteca não é uma planilha,
   * o grid não renderiza nela — e com a Biblioteca sendo a área padrão, `Fila`,
   * `Publicados` e `Atualizações` ficavam INALCANÇÁVEIS ao abrir Publicações.
   *
   * Agora o switcher é um nó só, registrado como `tabs` da GlobalTopbar pelas
   * duas superfícies. Elas são mutuamente exclusivas, então existe sempre
   * exatamente um registro — e nenhuma barra horizontal nova.
   */
  const areaTabs = <div className="flex shrink-0 items-center gap-1" data-publicacoes-area-tabs>
    {([["library", "Biblioteca"], ["queue", "Fila"], ["published", "Publicados"], ["updates", "Atualizações"]] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} ${tab === id ? "border-module-accent/50 bg-surface-elevated text-foreground" : ""}`} title={`Exibir ${label.toLowerCase()}`}>
      {label}
    </button>)}
  </div>;

  const renderTopbarActions = (grid: OperationalDataGridTopbarApi<PublicationRow>) => <>
    <button type="button" onClick={exportManifest} className={GLOBAL_TOPBAR_ACTION_CONTROL} title="Exportar o manifesto CSV de Publicações">
      <Download className="h-3.5 w-3.5" aria-hidden="true" /><span>CSV</span>
    </button>
    <button type="button" onClick={() => grid.exportRows(grid.queriedRows, "planilha")} className={GLOBAL_TOPBAR_ACTION_CONTROL} title="Exportar a visão filtrada">
      <Download className="h-3.5 w-3.5" aria-hidden="true" /><span>Exportar</span>
    </button>
    <div className="relative shrink-0">
      <button type="button" onClick={grid.toggleColumns} className={GLOBAL_TOPBAR_ACTION_CONTROL} title="Exibir ou ocultar colunas" aria-label="Visualização">
        <Columns3 className="h-3.5 w-3.5" aria-hidden="true" /><span>Visualização</span>
      </button>
      {grid.showColumns ? <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-divider bg-surface-elevated p-2 shadow-lg">
        {grid.columns.map(column => <label key={column.id} className="flex items-center gap-2 py-1 text-xs text-foreground/75"><input type="checkbox" checked={!grid.hidden.has(column.id)} onChange={() => grid.toggleColumn(column.id)} />{column.header}</label>)}
      </div> : null}
    </div>
    <select aria-label="Modo de ordenação" value={grid.orderMode} onChange={event => grid.setOrderMode(event.target.value as OperationalGridOrderMode)} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} max-w-36 cursor-pointer`}>
      <option value="automatic">Ordem automática</option><option value="manual">Ordem manual</option>
    </select>
    <select aria-label="Quantidade por página" value={String(grid.pageSize)} onChange={event => grid.setPageSize(event.target.value === "all" ? "all" : Number(event.target.value) as OperationalGridPageSize)} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} max-w-24 cursor-pointer`}>
      {[25, 50, 100, 200].map(size => <option key={size}>{size}</option>)}<option value="all">Todos</option>
    </select>
  </>;

  return <div className="flex h-screen min-h-0 flex-col">{notice && <div className="shrink-0 border-b border-amber-900/40 bg-amber-950/20 px-3 py-1.5 text-[9px] text-amber-300">{notice}</div>}
    <HistoryControls entries={history.entries} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onRestore={history.restore} moduleId="publicacoes" showHistory={false} showUndoRedo={false}/>{tab === "library" ? <><PublicacoesAreaTabs tabs={areaTabs}/><BibliotecaEditorial rows={libraryVisible} status={libraryStatus} onStatus={setLibraryStatus} brandRef={activeBrandRef}/></> : <OperationalDataGrid module={`publicacoes:${tab}`} userId={sessionId(session)} brandId={selectedBrandId} rows={rows} columns={columns} topbar={{ moduleId: "publicacoes", tabs: areaTabs, history: { getCount: () => history.entries.length, canUndo: () => history.canUndo, canRedo: () => history.canRedo, undo: history.undo, redo: history.redo, open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "publicacoes" } })), undoLabel: "Desfazer publicação", redoLabel: "Refazer publicação", historyLabel: "Histórico de Publicações", undoTitle: "Desfazer alteração em Publicações", redoTitle: "Refazer alteração em Publicações", historyTitle: count => `Histórico de Publicações (${count})` }, renderActions: renderTopbarActions }} emptyTitle="Nenhum conteúdo nesta aba." renderActions={row => <PublicationRowActions row={row} busy={busyId === row.id} onAction={runAction} onExport={exportPublication} onNotice={setNotice}/>} renderExpanded={row => <PublicationExpanded row={row}/>}/>}

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
  return <dl className="grid gap-2 md:grid-cols-4"><Detail label="Artigo" value={row.articleId}/><Detail label="Unidade" value={row.unitType === "silo_page" ? "Página do silo" : "Artigo"}/><Detail label="Plano editorial" value={row.contentPlanVersionId || "legado"}/><Detail label="Conteúdo do artigo" value={row.documentId || "ausente"}/><Detail label="Destino" value={isWorkflow(row) ? row.destination || "não definido" : row.destination || "não definido"}/><Detail label="URL final" value={isWorkflow(row) ? row.destinationUrl || "não registrada" : "não registrada"}/><Detail label="Última exportação" value={isWorkflow(row) ? row.lastExportFileName || "não exportado" : "não aplicável"}/><div className={card}><strong className="text-[9px] uppercase text-slate-500">Histórico</strong>{isWorkflow(row) && row.history.length ? <ul className="mt-1 space-y-1">{row.history.slice().reverse().map(event => <li key={event.id} className="text-[9px] text-slate-400">{new Date(event.occurredAt).toLocaleString("pt-BR")} · {event.action}{event.destinationUrl ? ` · ${event.destinationUrl}` : ""}</li>)}</ul> : <p className="mt-1 text-[9px] text-slate-600">Nenhum evento operacional registrado.</p>}</div></dl>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</dt><dd className="mt-1 break-words text-[10px] text-slate-300">{value}</dd></div>; }

/**
 * ===== A BIBLIOTECA EDITORIAL =====
 *
 * Uma linha por DOCUMENTO. Nenhuma tabela nova, nenhuma cópia: a projeção lê
 * `content_documents` e, quando existir, enriquece com o registro de publicação.
 *
 * O destino de cada linha é sempre o Redator, no mesmo documento — abrir um
 * rascunho aqui não pode levar a lugar nenhum, e não pode levar a uma segunda
 * cópia dele.
 */
/**
 * Registra o switcher de áreas quando a superfície aberta NÃO é uma planilha.
 *
 * O `OperationalDataGrid` faz o mesmo registro pelo seu próprio `topbar.tabs`.
 * Como as duas superfícies nunca coexistem, o slot de controles do módulo — que
 * é único, último registro vence — recebe sempre exatamente um dono.
 */
function PublicacoesAreaTabs({ tabs }: { tabs: ReactNode }) {
  const { registerControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  const controls = useMemo<GlobalTopbarModuleControls>(() => ({ moduleId: "publicacoes", tabs }), [tabs]);
  useEffect(() => {
    registerControls(controls);
    return () => unregisterControls(controls.moduleId);
  }, [controls, registerControls, unregisterControls]);
  return null;
}

function BibliotecaEditorial({ rows, status, onStatus, brandRef }: {
  rows: ReturnType<typeof projectEditorialLibrary>;
  status: EditorialLibraryFilter;
  onStatus: (value: EditorialLibraryFilter) => void;
  brandRef: string | null | undefined;
}) {
  const tomRedator: Record<string, string> = { RASCUNHO: "border-warning/40 text-warning", FINALIZADO: "border-context-accent/50 text-context-accent" };
  const tomEntrega: Record<string, string> = { NAO_ENTREGUE: "border-divider text-text-muted", RECEBIDO: "border-context-accent/50 text-context-accent", PUBLICADO: "border-success/50 text-success" };
  const rotuloEntrega: Record<string, string> = { NAO_ENTREGUE: "não entregue", RECEBIDO: "recebido", PUBLICADO: "publicado" };
  return <section className="min-h-0 flex-1 overflow-auto p-3">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/*
        * Recortes do EIXO DE ENTREGA. `Todos`, `Rascunho` e `Finalizado` saíram
        * daqui: os dois últimos são estados do REDATOR, e usá-los como filtro de
        * Publicações trazia para a lista, como item normal, documento que
        * Publicações nunca recebeu. O eixo do Redator continua no selo da linha.
        */}
      {PUBLICATIONS_LIBRARY_FILTERS.map(value =>
        <button key={value} type="button" onClick={() => onStatus(value)} aria-pressed={status === value}
          className={`${btn} ${status === value ? "border-module-accent/50 bg-surface-elevated text-foreground" : ""}`}>
          {PUBLICATIONS_LIBRARY_FILTER_LABELS[value]}
        </button>)}
      <span className="ml-auto text-[10px] text-text-muted">{rows.length} documento(s)</span>
    </div>
    {!rows.length
      ? <EmptyPipelineState
          title={status === "NAO_ENTREGUE" ? "Nenhum documento aguardando entrega" : "Publicações ainda não recebeu nada"}
          description={status === "NAO_ENTREGUE"
            ? "Todo documento do Redator já foi entregue a Publicações, ou ainda não existe documento nenhum para esta marca."
            : "Finalizar no Redator não entrega: o documento só entra aqui depois de “Enviar a Publicações”, com o registro persistido e relido. Use “Ainda no Redator” para ver o que está produzido e ainda não foi entregue."}/>
      : <ul className="space-y-2">{rows.map(row => <li key={row.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{row.title}</p>
              <p className="mt-0.5 text-[10px] text-text-muted">
                /{row.slug || "sem-slug"} · origem {row.origin === "radar" ? "Radar" : "Planejador (histórico)"}
                {row.updatedAt ? ` · atualizado em ${new Date(row.updatedAt).toLocaleString("pt-BR")}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Estado nunca só por cor: o rótulo carrega o significado. */}
              {/* DOIS EIXOS, DOIS SELOS. Um selo só diria que finalizar é entregar. */}
              <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${tomRedator[row.writerStatus]}`} title="Estado no Redator">{row.writerStatus}</span>
              <span className={`rounded border px-2 py-0.5 text-[9px] ${tomEntrega[row.deliveryStatus]}`} title="Estado em Publicações">Publicações: {rotuloEntrega[row.deliveryStatus]}</span>
              {row.publicationStatus ? <span className="text-[9px] text-text-muted">registro: {row.publicationStatus}</span> : null}
              <Link className={btn} href={writerHrefForRow(row, brandRef)}>Abrir no Redator</Link>
            </div>
          </div>
        </li>)}</ul>}
  </section>;
}
