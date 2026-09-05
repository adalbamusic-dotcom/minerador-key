"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { Plus } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { OperationalDataGrid, type OperationalGridColumn } from "@/components/editorial/operational-data-grid";
import { WorkflowImportDialog, WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import type { OperationalPublication } from "@/lib/editorial/operational-flow";
import { Field, btn, sessionId, useReadyPipeline } from "@/components/editorial/operational-screen-shared";
import { useNoticeBridge } from "@/components/global-notice-center";

type PublicationRow = OperationalPublication & { source: "workflow" } | { id: string; brandId: string; articleId: string; plannerItemId: string; contentPlanVersionId: string; documentId: string; title: string; slug: string; siloId: string; hierarchy: string; state: "published" | "approved"; responsible: string | null; destination: string | null; createdAt: string; updatedAt: string; origin: "real"; source: "briefing" };
export function PublicationsPage() {
  const { data: session } = useSession();
  const { selectedBrandId } = useBrand();
  const { pipeline, state } = useReadyPipeline();
  const [tab, setTab] = useState("library");
  const [picker, setPicker] = useState(false);
  const [notice, setNotice] = useState("");
  useNoticeBridge({ notice, module: "publicacoes", area: "Publicações", title: "Publicações", fallbackSeverity: "INFO" });
  const historyValue = useMemo(() => ({ operationalPublications: pipeline.operationalPublications }), [pipeline.operationalPublications]);
  const history = useLocalHistory("publicacoes", historyValue, snapshot => pipeline.restoreOperationalSnapshot("publicacoes", snapshot), 30, selectedBrandId || "sem-marca");
  if (state || !pipeline.snapshot) return state;
  const approvedWriter = pipeline.operationalPublications.filter(item => ["approved", "ready_to_export", "queued", "exported", "published"].includes(item.state)).map(item => ({ ...item, alreadyImported: item.state !== "approved" }));
  const real: PublicationRow[] = pipeline.snapshot.briefings.map(item => ({ id: `briefing:${item.id}`, brandId: selectedBrandId, articleId: item.id, plannerItemId: "", contentPlanVersionId: "", documentId: "", title: item.titulo || item.keyword_principal, slug: item.slug_sugerido || "", siloId: item.silo_id, hierarchy: item.hierarquia || "", state: item.status?.toLowerCase() === "publicado" ? "published" : "approved", responsible: null, destination: item.canonical, createdAt: item.created_at || new Date(0).toISOString(), updatedAt: item.updated_at || item.created_at || new Date(0).toISOString(), origin: "real", source: "briefing" }));
  const imported: PublicationRow[] = pipeline.operationalPublications.filter(item => !["draft", "writing", "awaiting_review", "in_review", "approved"].includes(item.state)).map(item => ({ ...item, source: "workflow" }));
  const all = [...imported, ...real.filter(item => item.state === "published")];
  const rows = all.filter(item => tab === "published" ? item.state === "published" : tab === "queue" ? ["ready_to_export", "queued", "exported"].includes(item.state) : tab === "updates" ? item.state === "update_due" : !["published", "update_due", "queued", "exported"].includes(item.state));
  const columns: OperationalGridColumn<PublicationRow>[] = [
    { id: "title", header: "Artigo", value: row => row.title, pinned: "left", sortable: true, width: 250 },
    { id: "slug", header: "Slug", value: row => row.slug, width: 190, render: row => <code>/{row.slug}</code> },
    { id: "siloId", header: "Silo", value: row => row.siloId, sortable: true },
    { id: "hierarchy", header: "Hierarquia", value: row => row.hierarchy },
    { id: "version", header: "Versão", value: row => row.contentPlanVersionId || "legado" },
    { id: "keywordDnas", header: "Perfis das keywords", value: row => pipeline.contentPlans[`plan:${row.articleId}`]?.payload.keywordDnaRefs.length || (row.source === "briefing" ? "legado" : 0), width: 105 },
    { id: "articleDna", header: "Definição do artigo", value: row => pipeline.contentPlans[`plan:${row.articleId}`]?.payload.articleDnaRef.versionId || (row.source === "briefing" ? "legado" : "ausente"), width: 120 },
    { id: "siloDna", header: "Arquitetura do silo", value: row => pipeline.contentPlans[`plan:${row.articleId}`]?.payload.siloDnaRef.versionId || (row.source === "briefing" ? "legado" : "ausente"), width: 120 },
    { id: "responsible", header: "Responsável", value: row => row.responsible || "não atribuído" },
    { id: "state", header: "Status", value: row => row.state, render: row => <WorkflowStatusBadge status={row.state}/>, sortable: true, width: 180 },
    { id: "destination", header: "Destino", value: row => row.destination || "não definido", width: 180 },
    { id: "updatedAt", header: "Última edição", value: row => new Date(row.updatedAt).toLocaleString("pt-BR"), sortable: true, width: 160 },
  ];
  const importApproved = (ids: string[]) => { history.capture(`Importar ${ids.length} artigo(s) do Redator`); const result = pipeline.importApprovedToPublications(ids); setNotice(`${result.imported} artigo(s) importado(s); ${result.skipped} ignorado(s).`); setPicker(false); };
  return <div className="flex h-screen min-h-0 flex-col">
    {notice && <div className="shrink-0 border-b border-amber-900/40 bg-amber-950/20 px-3 py-1.5 text-[9px] text-amber-300">{notice}</div>}
    <OperationalDataGrid title="Publicações" description="Artigos completos recebidos do Redator, sem envio automático ao CMS." module={`publicacoes:${tab}`} userId={sessionId(session)} brandId={selectedBrandId} rows={rows} columns={columns} toolbar={<><HistoryControls entries={history.entries} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onRestore={history.restore} compact/>{[["library", "Biblioteca"], ["queue", "Fila"], ["published", "Publicados"], ["updates", "Atualizações"]].map(([id, label]) => <button key={id} className={`${btn} ${tab === id ? "border-module-accent/45 text-white" : ""}`} onClick={() => setTab(id)}>{label}</button>)}<button className={btn} onClick={() => setPicker(true)}><Plus className="mr-1 h-3 w-3"/>Importar do Redator</button></>} emptyTitle="Nenhum conteúdo importado nesta aba." renderActions={row => row.documentId ? <Link href={`/redator?articleId=${row.articleId}`} className={btn}>{row.state === "published" ? "Reeditar" : "Abrir no Redator"}</Link> : <span className="text-[9px] text-slate-600">Documento local ausente</span>} renderExpanded={row => <div className="grid gap-3 md:grid-cols-4"><Field label="Artigo" value={row.articleId}/><Field label="Perfis das keywords" value={pipeline.contentPlans[`plan:${row.articleId}`]?.payload.keywordDnaRefs.length}/><Field label="Definição do artigo" value={pipeline.contentPlans[`plan:${row.articleId}`]?.payload.articleDnaRef.versionId}/><Field label="Arquitetura do silo" value={pipeline.contentPlans[`plan:${row.articleId}`]?.payload.siloDnaRef.versionId}/><Field label="Plano editorial" value={row.contentPlanVersionId}/><Field label="Conteúdo do artigo" value={row.documentId}/><Field label="Origem" value={row.origin}/><Field label="Destino" value={row.destination}/><Field label="Estado" value={row.state}/></div>}/>
    <WorkflowImportDialog open={picker} title="Importar artigos aprovados do Redator" description="Todos os documentos aprovados aparecem aqui. Os já importados em Publicações permanecem visíveis e bloqueados." rows={approvedWriter} label={item => item.title} details={item => <span className="mt-1 block text-slate-500">/{item.slug} · {item.hierarchy}</span>} disabled={item => item.alreadyImported} status={item => item.alreadyImported ? item.state : "approved"} onClose={() => setPicker(false)} onImport={importApproved}/>
  </div>;
}
