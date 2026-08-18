"use client";
import Link from "next/link";
import type { ArticleDNA, SiloDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { legacyVersionReference } from "@/lib/arquiteto/versioning";
import { useBrand } from "@/components/brand-context";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { buildRadarArticleHref, radarCanonicalRouteKey } from "@/lib/radar/route-resolution";
import { ConfidenceBadge, DataOriginBadge, ProvenancePanel, VersionBadge } from "./pipeline-ui";

export function KeywordDnaPanel({
  keyword,
  onWorkflowStatusChange,
  statusUpdating = false,
  canonicalUrl,
  primaryPolicyLabel,
  showProvenance = true,
}: {
  keyword: { id: string; keyword: string; intent?: string | null; status?: string | null; analise_semantica?: Record<string, unknown> | null };
  onWorkflowStatusChange?: (status: string) => void | Promise<void>;
  statusUpdating?: boolean;
  visualPosition?: number;
  canonicalUrl?: string | null;
  primaryPolicyLabel?: string;
  showProvenance?: boolean;
}) {
  const semantic = keyword.analise_semantica || {};
  const reference = legacyVersionReference(keyword.id, { keyword: keyword.keyword, semantic, intent: keyword.intent });
  const isLogical = semantic.dna_origem === "logico_deterministico";
  const confidence = typeof semantic.dna_confianca === "string" ? Number(semantic.dna_confianca) : null;
  const fields = [
    ["Intenção principal", keyword.intent || semantic.intencao_principal],
    ["Intenção secundária", semantic.intencao_secundaria],
    ["Entidade central", semantic.entidade_central],
    ["Público provável", semantic.publico || semantic.perfil_b2b],
    ["Problema percebido", semantic.problema_percebido],
    ["Resultado desejado", semantic.resultado_desejado],
    ["Job to be done", semantic.job_to_be_done],
    ["Consciência", semantic.nivel_consciencia],
    ["Jornada", semantic.etapa_jornada],
  ];
  const published = keyword.status?.toLowerCase() === "publicado";
  return <section className="mb-2 rounded border border-context-accent/35 bg-surface-subtle p-2.5">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-2" aria-label="Metadados do KeywordDNA">
      <span className="text-[10px] font-bold uppercase tracking-wider text-context-accent">KeywordDNA</span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onWorkflowStatusChange && <label className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted">Status
          <select aria-label={`Status da keyword ${keyword.keyword}`} value={keyword.status || "bruto"} onChange={event => void onWorkflowStatusChange(event.target.value)} disabled={statusUpdating || published} className={`rounded border bg-surface px-2 py-1 text-[10px] font-semibold outline-none ${published ? "cursor-not-allowed border-danger/50 text-danger" : "cursor-pointer border-divider text-foreground hover:border-context-accent/60"}`}>
            <option value="bruto">Bruto</option><option value="aprovado">Aprovado</option><option value="rejeitado">Rejeitado</option><option value="publicado">Publicado</option>
          </select>
        </label>}
        <VersionBadge version={String(semantic.dna_schema_version || "legacy")} hash={reference.contentHash}/>
        <DataOriginBadge origin={isLogical ? "local" : "legacy"}/>
        {Number.isFinite(confidence) && <ConfidenceBadge value={confidence}/>}
      </div>
    </div>

    <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.7fr)]">
      <section className="rounded border border-divider bg-surface p-2.5" aria-labelledby={`keyword-identity-${keyword.id}`}>
        <h4 id={`keyword-identity-${keyword.id}`} className="text-[10px] font-bold uppercase tracking-wider text-context-accent">Identidade</h4>
        <dl className="mt-1.5 space-y-1 text-[11px]">
          <div><dt className="text-text-muted">URL / canonical</dt><dd className="break-all select-text cursor-text font-mono text-foreground/80">{canonicalUrl || "Não informado"}</dd></div>
          <div><dt className="text-text-muted">Principal</dt><dd className="text-foreground/80">{primaryPolicyLabel || "Não informado"}</dd></div>
          <div><dt className="text-text-muted">Origem</dt><dd className="text-foreground/80">{String(semantic.origem || semantic.source || "Não informado")}</dd></div>
        </dl>
      </section>
      <section className="rounded border border-divider bg-surface p-2.5" aria-labelledby={`keyword-strategy-${keyword.id}`}>
        <h4 id={`keyword-strategy-${keyword.id}`} className="text-[10px] font-bold uppercase tracking-wider text-context-accent">Intenção e estratégia</h4>
        <div className="mt-1.5 grid gap-x-3 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => <div key={String(label)}><p className="text-[10px] font-semibold text-text-muted">{String(label)}</p><p className="break-words text-[11px] text-foreground/80">{value ? String(value) : "Não informado"}</p></div>)}
        </div>
      </section>
    </div>
    {showProvenance && <KeywordDnaProvenance keyword={keyword}/>}
    <p className="mt-2 text-[10px] text-warning">{isLogical ? "DNA-base derivado sem IA; a decisão humana continua necessária." : "Compatibilidade legada; classificação humana aprovada terá precedência."}</p>
  </section>;
}

export function KeywordDnaProvenance({ keyword }: { keyword: { id: string; keyword: string; intent?: string | null; analise_semantica?: Record<string, unknown> | null } }) {
  const semantic = keyword.analise_semantica || {};
  const reference = legacyVersionReference(keyword.id, { keyword: keyword.keyword, semantic, intent: keyword.intent });
  return <div className="mt-2 rounded border border-divider bg-surface p-2 text-[11px]"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-context-accent">Proveniência</p><ProvenancePanel keywordRefs={[reference]} evidenceRefs={[]} sourceIds={[]}/></div>;
}
export function ArticleDnaSummary({ version, published }: { version?: VersionEnvelope<ArticleDNA>; published?: boolean }) {
  const { activeBrandRef } = useBrand();
  const pipeline = useEditorialPipeline();
  const radarItem = version ? pipeline.radarItems.find(item => item.articleDnaVersionId === version.versionId || item.articleId === version.payload.articleId) : null;
  const href = radarItem ? buildRadarArticleHref({ brandRef: activeBrandRef, articleId: radarCanonicalRouteKey(radarItem) }) : null;
  return <section className="mb-3 rounded-md border border-teal-500/15 bg-teal-950/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold uppercase tracking-wider text-teal-200">ArticleDNA</p>{version ? <VersionBadge version={version.versionNumber} hash={version.contentHash}/> : <span className="text-sm text-slate-500">Ainda não gerado</span>}</div>{version && <><p className="mt-2 text-xs font-medium uppercase tracking-wider text-violet-200">IA aplicada localmente · pendente de status humano</p><p className="mt-1 text-base font-semibold leading-6 text-slate-50">{version.payload.promise}</p><p className="mt-1 text-sm leading-5 text-slate-400">Ângulo: {version.payload.angle}</p><div className="mt-2 flex flex-wrap items-center gap-2"><ConfidenceBadge value={version.payload.confidence}/><span className="text-sm text-slate-400">{version.payload.keywordReferences.length} KeywordDNA(s)</span></div>{version.payload.humanPendingDecisions.length > 0 && <div className="mt-2 rounded border border-amber-800/40 bg-amber-950/20 p-2"><p className="text-xs font-medium uppercase tracking-wider text-amber-200">Anotações para o pente-fino</p>{version.payload.humanPendingDecisions.map(note => <p key={note} className="mt-1 text-sm leading-5 text-slate-300">• {note}</p>)}</div>}{href ? <Link href={href} className="mt-2 inline-flex h-8 items-center rounded-md border border-teal-700/60 bg-teal-950/20 px-2.5 text-[13px] font-medium text-teal-100 transition-colors hover:border-teal-400 hover:bg-teal-900/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70">Seguir para o Radar</Link> : <button type="button" disabled title="Contexto da marca não disponível" className="mt-2 inline-flex h-8 items-center rounded-md border border-teal-700/60 bg-teal-950/20 px-2.5 text-[13px] font-medium text-teal-100 opacity-50">Seguir para o Radar</button>}</>}{published && <p className="mt-2 rounded border border-emerald-800/40 bg-emerald-950/15 p-2 text-sm leading-5 text-emerald-100">Publicado protegido: marca, silo, principal, slug e canonical imutáveis.</p>}</section>;
}
export function SiloDnaSummary({ version }: { version?: VersionEnvelope<SiloDNA> }) {
  if (!version) return <span className="text-[8px] text-slate-600">SiloDNA pendente</span>;
  return <details className="relative"><summary className="cursor-pointer text-[8px] font-bold text-emerald-400">SiloDNA v{version.versionNumber} · IA aplicada</summary><div className="absolute right-0 z-30 mt-2 w-80 rounded border border-emerald-900 bg-[#0b0c10] p-3 shadow-2xl"><p className="text-[8px] font-bold uppercase tracking-wider text-violet-400">Aplicado localmente · revisar na planilha</p><p className="mt-2 text-[10px] font-bold text-white">{version.payload.centralEntity}</p><p className="mt-1 text-[9px] text-slate-500">Pilar: {version.payload.pillarArticleId || "não definido"} · Suportes: {version.payload.supportArticleIds.length}</p><p className="mt-1 text-[9px] text-amber-400">Fronteira: {version.payload.boundary}</p><p className="text-[9px] text-slate-500">Lacunas: {version.payload.gaps.join(", ") || "nenhuma"}</p></div></details>;
}
