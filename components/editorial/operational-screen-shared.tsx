"use client";

import * as React from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { Loader2 } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { EmptyPipelineState } from "@/components/editorial/pipeline-ui";
import { WorkflowImportDialog } from "@/components/editorial/workflow-status";
import { buildRadarArticleHref, radarCanonicalRouteKey, resolveRadarRouteItem } from "@/lib/radar/route-resolution";
import { shouldWaitForRadarBrandBootstrap } from "@/lib/arquiteto/f5-integrity";

export const btn = "inline-flex h-7 items-center rounded border border-divider bg-surface-subtle px-2.5 text-[10px] font-bold text-foreground/75 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
export const field = "h-8 w-full rounded border border-divider bg-surface-subtle px-2 text-[11px] text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/45";
export const card = "rounded-lg border border-slate-900 bg-[#0b0c10] p-4";
export function useOperationalRouter() {
  const router = useNextRouter();
  const pipeline = useEditorialPipeline();
  const { activeBrandRef } = useBrand();
  return {
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => {
      const match = href.match(/^\/radar\/([^?]+)(.*)$/);
      const key = match ? decodeURIComponent(match[1]) : null;
      const item = key ? resolveRadarRouteItem(pipeline.radarItems, key) : null;
      if (match) {
        const canonicalHref = item && buildRadarArticleHref({ brandRef: activeBrandRef, articleId: radarCanonicalRouteKey(item) });
        if (!canonicalHref) return;
        return router.push(`${canonicalHref}${match[2]}`, options);
      }
      return router.push(href, options);
    },
  };
}
export const Field = ({ label, value, tone }: { label: string; value: unknown; tone?: "keyword" }) => <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</dt><dd className={`mt-1 break-words text-[10px] ${tone === "keyword" ? "text-keyword" : "text-slate-300"}`}>{value === null || value === undefined || value === "" ? "Não informado" : String(value)}</dd></div>;

export function ModuleHeader({ title, description, actions, tone = "default", brandName }: { title: string; description: string; actions?: React.ReactNode; tone?: "default" | "neutral"; brandName?: string }) {
  const { activeBrand } = useBrand();
  return <header className="sticky top-0 z-40 flex h-12 max-w-full items-center justify-between gap-2 overflow-hidden border-b border-slate-900 bg-[#07080b]/95 px-3 backdrop-blur"><div className="min-w-0 flex-1"><p className={`truncate text-[8px] font-bold uppercase tracking-[.2em] ${tone === "neutral" ? "text-slate-400" : "text-context-accent"}`}>{brandName || activeBrand?.nome || "Sem marca"}</p><div className="flex min-w-0 items-baseline gap-2"><h1 className="truncate text-sm font-bold text-white">{title}</h1><p className="hidden truncate text-[9px] text-slate-600 md:block">{description}</p></div></div><div className="flex min-w-0 shrink-0 items-center gap-1">{actions}</div></header>;
}

export function useReadyPipeline() {
  const pipeline = useEditorialPipeline();
  const { selectedBrandId, profileLoading } = useBrand();
  // O primeiro render após F5 pode ocorrer antes de o bootstrap do tenant
  // iniciar. Não transformar esse intervalo em “Marca sem dados”; a marca
  // canônica continua vindo da rota/brandId e o provider ainda pode hidratar.
  if (shouldWaitForRadarBrandBootstrap({ selectedBrandId, profileLoading, pipelineLoading: pipeline.loading, hasSnapshot: Boolean(pipeline.snapshot), error: pipeline.error })) return { pipeline, state: <div className="flex min-h-[50vh] items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Carregando…</div> };
  if (!pipeline.snapshot) return { pipeline, state: <EmptyPipelineState title="Marca sem dados" description={pipeline.error || "Selecione uma marca autorizada."}/> };
  return { pipeline, state: null };
}

export function sessionId(session: ReturnType<typeof useSession>["data"]) { return session?.user?.email || session?.user?.id || "usuario-local"; }

export function ImportPanel<T extends { id: string }>({ title, rows, label, disabled, status, onClose, onImport }: { title: string; rows: T[]; label: (row: T) => React.ReactNode; disabled?: (row: T) => boolean; status?: (row: T) => string; onClose: () => void; onImport: (ids: string[]) => void }) {
  const isDisabled = disabled || ((row: T) => Boolean((row as T & { alreadyImported?: boolean }).alreadyImported));
  const rowStatus = status || ((row: T) => (row as T & { importStatus?: string }).importStatus || "approved");
  return <WorkflowImportDialog open title={title} description="Todos os aprovados da etapa anterior aparecem abaixo; os já importados permanecem visíveis e bloqueados." rows={rows} label={label} disabled={isDisabled} status={rowStatus} onClose={onClose} onImport={onImport}/>;
}

export function Metric({ label, value }: { label: string; value: unknown }) { return <div className={card}><p className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</p><p className="mt-2 text-xl font-black text-white">{String(value)}</p></div>; }
export function LocalCollection({ title, count, description }: { title: string; count: number; description: string }) { return <section className={card}><h2 className="text-xs font-bold">{title}</h2><p className="mt-2 text-2xl font-black text-white">{count}</p><p className="mt-2 text-[10px] text-slate-600">{description}</p></section>; }
