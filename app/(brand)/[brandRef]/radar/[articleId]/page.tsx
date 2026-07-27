import { Suspense } from "react";
import { RadarAnalysisPage } from "@/modules/radar";
import { requireTenantModule } from "../../layout";

export default async function Page({ params }: { params: Promise<{ brandRef: string; articleId: string }> }) {
  const { brandRef, articleId } = await params;
  await requireTenantModule(brandRef, "radar");
  return <Suspense fallback={<div className="p-6 text-sm text-slate-400">Carregando análise do Radar…</div>}><RadarAnalysisPage articleId={decodeURIComponent(articleId)} /></Suspense>;
}
