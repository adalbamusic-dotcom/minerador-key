"use client";
import Link from "next/link";
import type { ArticleDNA, SiloDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { legacyVersionReference } from "@/lib/arquiteto/versioning";
import { ConfidenceBadge, DataOriginBadge, ProvenancePanel, VersionBadge } from "./pipeline-ui";

export function KeywordDnaPanel({
  keyword,
  onWorkflowStatusChange,
  statusUpdating = false,
}: {
  keyword: { id: string; keyword: string; intent?: string | null; status?: string | null; analise_semantica?: Record<string, unknown> | null };
  onWorkflowStatusChange?: (status: string) => void | Promise<void>;
  statusUpdating?: boolean;
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
  return <section className="mb-3 rounded border border-indigo-900/40 bg-indigo-950/10 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">KeywordDNA dentro do Minerador</p><p className="text-[11px] font-bold text-slate-200">{keyword.keyword}</p></div><div className="flex flex-wrap items-center justify-end gap-2">{onWorkflowStatusChange && <label className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">Status da keyword<select aria-label={`Status da keyword ${keyword.keyword}`} value={keyword.status || "bruto"} onChange={event => void onWorkflowStatusChange(event.target.value)} disabled={statusUpdating || published} className={`rounded border bg-[#06070a] px-2 py-1 text-[9px] font-bold normal-case outline-none ${published ? "cursor-not-allowed border-rose-900/60 text-rose-400" : "cursor-pointer border-slate-800 text-slate-300 hover:border-indigo-700"}`}><option value="bruto">Bruto</option><option value="aprovado">Aprovado</option><option value="rejeitado">Rejeitado</option><option value="publicado">Publicado</option></select></label>}<VersionBadge version={String(semantic.dna_schema_version || "legacy")} hash={reference.contentHash}/><DataOriginBadge origin={isLogical ? "local" : "legacy"}/>{Number.isFinite(confidence) && <ConfidenceBadge value={confidence}/>}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{fields.map(([label, value]) => <div key={String(label)}><p className="text-[8px] font-bold uppercase text-slate-600">{String(label)}</p><p className="text-[10px] text-slate-300">{value ? String(value) : "Não informado"}</p></div>)}</div><div className="mt-3"><ProvenancePanel keywordRefs={[reference]} evidenceRefs={[]} sourceIds={[]}/></div><p className="mt-2 text-[9px] text-amber-400">{isLogical ? "DNA-base derivado sem IA; aprove a keyword no seletor de status para liberá-la à próxima etapa." : "Compatibilidade legada; classificação humana aprovada terá precedência."}</p></section>;
}
export function ArticleDnaSummary({ version, published }: { version?: VersionEnvelope<ArticleDNA>; published?: boolean }) {
  return <section className="mb-3 rounded border border-teal-900/40 bg-teal-950/10 p-3"><div className="flex justify-between"><p className="text-[9px] font-bold uppercase tracking-wider text-teal-400">ArticleDNA</p>{version ? <VersionBadge version={version.versionNumber} hash={version.contentHash}/> : <span className="text-[9px] text-slate-600">Ainda não gerado</span>}</div>{version && <><p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-violet-400">IA aplicada localmente · pendente de status humano</p><p className="mt-2 text-[11px] font-bold text-slate-200">{version.payload.promise}</p><p className="text-[10px] text-slate-500">Ângulo: {version.payload.angle}</p><div className="mt-2 flex gap-3"><ConfidenceBadge value={version.payload.confidence}/><span className="text-[9px] text-slate-500">{version.payload.keywordReferences.length} KeywordDNA(s)</span></div>{version.payload.humanPendingDecisions.length > 0 && <div className="mt-2 rounded border border-amber-900/40 bg-amber-950/10 p-2"><p className="text-[8px] font-bold uppercase tracking-wider text-amber-400">Anotações para o pente-fino</p>{version.payload.humanPendingDecisions.map(note => <p key={note} className="mt-1 text-[9px] text-slate-400">• {note}</p>)}</div>}<Link href={`/radar?articleId=${encodeURIComponent(version.payload.articleId)}`} className="mt-2 inline-flex rounded border border-teal-900 px-2 py-1 text-[9px] font-bold text-teal-300">Seguir para o Radar</Link></>}{published && <p className="mt-2 text-[9px] text-emerald-400">Publicado protegido: marca, silo, principal, slug e canonical imutáveis.</p>}</section>;
}
export function SiloDnaSummary({ version }: { version?: VersionEnvelope<SiloDNA> }) {
  if (!version) return <span className="text-[8px] text-slate-600">SiloDNA pendente</span>;
  return <details className="relative"><summary className="cursor-pointer text-[8px] font-bold text-emerald-400">SiloDNA v{version.versionNumber} · IA aplicada</summary><div className="absolute right-0 z-30 mt-2 w-80 rounded border border-emerald-900 bg-[#0b0c10] p-3 shadow-2xl"><p className="text-[8px] font-bold uppercase tracking-wider text-violet-400">Aplicado localmente · revisar na planilha</p><p className="mt-2 text-[10px] font-bold text-white">{version.payload.centralEntity}</p><p className="mt-1 text-[9px] text-slate-500">Pilar: {version.payload.pillarArticleId || "não definido"} · Suportes: {version.payload.supportArticleIds.length}</p><p className="mt-1 text-[9px] text-amber-400">Fronteira: {version.payload.boundary}</p><p className="text-[9px] text-slate-500">Lacunas: {version.payload.gaps.join(", ") || "nenhuma"}</p></div></details>;
}
