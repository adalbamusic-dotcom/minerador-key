"use client";

import Link from "next/link";
import { useState } from "react";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { Columns3, Download, FilePenLine } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { OperationalDataGrid, type OperationalDataGridTopbarApi, type OperationalGridColumn, type OperationalGridOrderMode, type OperationalGridPageSize } from "@/components/editorial/operational-data-grid";
import { WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import type { PlannerItem } from "@/lib/editorial/operational-flow";
import { hydratePlanner } from "@/lib/planejador/hydration";
import { resolvePlannerPublicationIdentity } from "@/lib/planejador/publication-identity";
import { buildRadarArticleHref, radarCanonicalRouteKey } from "@/lib/radar/route-resolution";
import { Field, btn, sessionId, useOperationalRouter, useReadyPipeline } from "@/components/editorial/operational-screen-shared";

export function PlannerPage() {
  const { data: session } = useSession(); const { selectedBrandId, activeBrandRef } = useBrand(); const router = useOperationalRouter(); const { pipeline, state } = useReadyPipeline(); const [notice, setNotice] = useState("");
  if (state) return state;
  const planFor = (row: PlannerItem) => Object.values(pipeline.contentPlans).find(plan => plan.versionId === row.contentPlanVersionId) || pipeline.contentPlans[`plan:${row.articleId}`] || null;
  const hydrateRow = (row: PlannerItem) => { if (!selectedBrandId) return null; const plan = planFor(row); const radar = pipeline.radarItems.find(candidate => candidate.id === row.radarItemId || candidate.articleId === row.articleId) || null; const publication = pipeline.operationalPublications.find(candidate => candidate.articleId === row.articleId) || null; const legacyBriefing = pipeline.snapshot?.briefings.find(candidate => candidate.id === row.articleId) || null; const publicationIdentity = resolvePlannerPublicationIdentity({ brandId: selectedBrandId, brandName: pipeline.snapshot?.brand.nome, articleId: row.articleId, operational: publication, legacyBriefing }); return hydratePlanner({ brandId: selectedBrandId, snapshot: pipeline.snapshot, item: row, plan, article: pipeline.articleVersions[row.articleId] || null, silo: pipeline.siloVersions[row.siloId] || null, siloPage: row.unitType === "silo_page" ? pipeline.siloPageVersions[row.articleId] || null : null, serpRecords: pipeline.serpRecords, serpReviews: pipeline.serpReviews, document: Object.values(pipeline.documents).find(document => document.articleDnaRef.entityId === row.articleId) || null, radarHydration: radar?.hydration, publicationIdentity }); };
  const columns: OperationalGridColumn<PlannerItem>[] = [
    { id: "unit", header: "Unidade / título", value: row => `${row.unitType === "silo_page" ? "SiloPage" : "Artigo"} · ${row.title}`, pinned: "left", sortable: true, width: 290 },
    { id: "keyword", header: "Keyword principal", value: row => hydrateRow(row)?.primaryKeyword.label || "Referência não hidratada", width: 190 },
    { id: "silo", header: "Silo", value: row => hydrateRow(row)?.silo.label || "Referência não hidratada", width: 150 },
    { id: "hierarchy", header: "Hierarquia", value: row => hydrateRow(row)?.hierarchy.label || "Referência não hidratada", width: 120 },
    { id: "intent", header: "Intenção", value: row => hydrateRow(row)?.humanDecision.intent || hydrateRow(row)?.recommendation.intent || "Pendente", width: 130 },
    { id: "radar", header: "Radar", value: row => { const value = hydrateRow(row); return `${value?.radar.status || "ausente"}${value?.radar.version ? ` · v${value.radar.version}` : ""}`; }, width: 120 },
    { id: "plan", header: "Plano", value: row => planFor(row) ? `ID · v${planFor(row)!.versionNumber}` : "pendente", width: 105 },
    { id: "conflicts", header: "Conflitos", value: row => hydrateRow(row)?.conflicts.length || 0, width: 80 },
    { id: "pending", header: "Pendências", value: row => hydrateRow(row)?.pending.length || 0, width: 90 },
    { id: "status", header: "Status editorial", value: row => row.state, render: row => <WorkflowStatusBadge status={row.state}/>, sortable: true, width: 150 },
    { id: "publication", header: "Publicação", value: row => hydrateRow(row)?.publicationStatus || "não iniciada", width: 110 },
    { id: "transfer", header: "Transferência", value: row => hydrateRow(row)?.transferStatus || "não enviada", width: 110 },
  ];
  const prepare = async (row: PlannerItem) => { try { await pipeline.preparePlannerItems([row.id], sessionId(session)); setNotice("ContentPlan preparado e disponível para revisão."); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível preparar o plano."); } };
  const approve = (row: PlannerItem) => { pipeline.approvePlannerItems([row.id], sessionId(session)); setNotice("A aprovação foi registrada para a versão ativa, se o gate estiver apto."); };
  const write = async (row: PlannerItem) => { try { const result = await pipeline.startWriting(row.id); router.push(`/redator?articleId=${encodeURIComponent(result.articleId)}`); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível abrir o Redator."); } };
  const renderTopbarActions = (grid: OperationalDataGridTopbarApi<PlannerItem>) => <>
    <button type="button" onClick={() => grid.exportRows(grid.queriedRows, "planilha")} className={GLOBAL_TOPBAR_ACTION_CONTROL} title="Exportar planilha filtrada">
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
  return <div className="flex h-screen min-h-0 flex-col">{notice && <div className="border-b border-amber-900/40 bg-amber-950/20 px-3 py-1.5 text-[10px] text-amber-300">{notice}</div>}<OperationalDataGrid module="planejador" userId={sessionId(session)} brandId={selectedBrandId} rows={pipeline.plannerItems} columns={columns} topbar={{ moduleId: "planejador", renderActions: renderTopbarActions }} emptyTitle="Nenhum artigo importado do Radar." renderActions={row => { const radar = pipeline.radarItems.find(candidate => candidate.id === row.radarItemId || candidate.articleId === row.articleId) || null; const radarHref = radar ? buildRadarArticleHref({ brandRef: activeBrandRef, articleId: radarCanonicalRouteKey(radar) }) : null; const plan = planFor(row); const cockpitHref = activeBrandRef && plan ? `/${activeBrandRef}/planejador/${encodeURIComponent(plan.versionId)}` : null; return <div className="flex flex-wrap justify-end gap-1">{row.state === "draft" && <button className={btn} onClick={() => void prepare(row)}>Preparar plano</button>}{cockpitHref ? <Link className={btn} href={cockpitHref}>Abrir cockpit</Link> : plan ? <button className={btn} disabled title="Contexto da marca não disponível">Abrir cockpit</button> : null}{row.state === "awaiting_review" && <button className={btn} onClick={() => approve(row)}>Aprovar</button>}{["approved", "sent_writer"].includes(row.state) && <button className={btn} onClick={() => void write(row)}><FilePenLine className="mr-1 h-3 w-3"/>Redator</button>}{radarHref ? <Link className={btn} href={radarHref}>Radar</Link> : <button className={btn} disabled title="Contexto da marca não disponível">Radar</button>}</div>; }} renderExpanded={row => { const value = hydrateRow(row); return <div className="grid gap-3 md:grid-cols-4"><Field label="Keyword principal" value={value?.primaryKeyword.label}/><Field label="Silo" value={value?.silo.label}/><Field label="Radar" value={value?.radar.status}/><Field label="ContentPlan" value={value?.plan.label}/><Field label="Conflitos" value={value?.conflicts.length}/><Field label="Pendências" value={value?.pending.length}/><Field label="Origem keyword" value={value?.primaryKeyword.technical.origin}/><Field label="Diagnóstico" value={value?.primaryKeyword.technical.reason}/></div>; }}/></div>;
}
