"use client";

import { useState } from "react";
import type { ContentPlan, ContentPlanDetails, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { useNoticeBridge } from "@/components/global-notice-center";

const inputClass = "mt-1 h-8 w-full rounded border border-divider bg-surface-subtle px-2 text-[11px] text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/45";
const areaClass = "mt-1 w-full rounded border border-divider bg-surface-subtle p-2 text-[11px] text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/45";
const buttonClass = "inline-flex h-7 items-center rounded border border-divider bg-surface-subtle px-2.5 text-[10px] font-bold text-foreground/75 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

const splitLines = (value: string) => value.split("\n").map(item => item.trim()).filter(Boolean);
const joinLines = (value: string[]) => value.join("\n");
const splitCsv = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

export function ContentPlanEditor({ plan, issues, onSave, onClose }: {
  plan: VersionEnvelope<ContentPlan>;
  issues: string[];
  onSave: (details: ContentPlanDetails) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ContentPlanDetails | null>(() => plan.payload.planning ? structuredClone(plan.payload.planning) : null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useNoticeBridge({ notice: message, module: "planejador", area: "Editor de plano", title: "Planejador · Editor", fallbackSeverity: "INFO" });

  if (!draft) return <div className="rounded border border-red-900/50 bg-red-950/20 p-3 text-[10px] text-red-300">Este plano ainda é v1. Prepare uma versão definitiva antes de editar.</div>;

  const update = (fn: (current: ContentPlanDetails) => ContentPlanDetails) => setDraft(current => current ? fn(current) : current);
  const updateStrategy = (patch: Partial<ContentPlanDetails["strategy"]>) => update(current => ({ ...current, strategy: { ...current.strategy, ...patch } }));
  const updateSection = (index: number, patch: Partial<ContentPlanDetails["structure"]["sections"][number]>) => update(current => ({ ...current, structure: { ...current.structure, sections: current.structure.sections.map((section, itemIndex) => itemIndex === index ? { ...section, ...patch } : section) } }));
  const updateSource = (index: number, patch: Partial<ContentPlanDetails["sources"][number]>) => update(current => ({ ...current, sources: current.sources.map((source, itemIndex) => itemIndex === index ? { ...source, ...patch } : source) }));
  const updateImage = (index: number, patch: Partial<ContentPlanDetails["images"][number]>) => update(current => ({ ...current, images: current.images.map((image, itemIndex) => itemIndex === index ? { ...image, ...patch } : image) }));
  const save = async () => {
    setSaving(true);
    setMessage("");
    try { await onSave(draft); setMessage("Sucessora salva e enviada para revisão humana."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar a sucessora."); }
    finally { setSaving(false); }
  };

  return <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-3 rounded border border-context-accent/25 bg-context-accent/10 p-3 text-[10px]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><strong className="text-context-accent">Plano editorial definitivo · v{plan.versionNumber}</strong><p className="text-slate-500">A edição cria uma nova versão; a anterior permanece imutável.</p></div>
      <div className="flex gap-1"><button type="button" className={buttonClass} onClick={onClose}>Fechar</button><button type="submit" className={`${buttonClass} border-emerald-900 text-emerald-300`} disabled={saving}>{saving ? "Salvando…" : "Salvar sucessora"}</button></div>
    </div>
    {message && <p className="rounded border border-amber-900/50 bg-amber-950/20 p-2 text-amber-300">{message}</p>}
    {issues.length > 0 && <div className="rounded border border-amber-900/50 bg-amber-950/20 p-2 text-amber-300"><strong>Pendências do gate</strong><ul className="mt-1 list-disc pl-4">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}

    <details open className="rounded border border-slate-900 p-2">
      <summary className="cursor-pointer font-bold text-slate-300">Estratégia e intenção</summary>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <label>Intenção principal<input className={inputClass} value={draft.strategy.primaryIntent} onChange={event => updateStrategy({ primaryIntent: event.target.value })}/></label>
        <label>Validação<select className={inputClass} value={draft.strategy.intentValidation} onChange={event => updateStrategy({ intentValidation: event.target.value as ContentPlanDetails["strategy"]["intentValidation"] })}><option value="pending">Pendente</option><option value="validated">Validada</option><option value="conflict">Conflito</option><option value="insufficient">Insuficiente</option></select></label>
        <label>Promessa<textarea className={areaClass} rows={2} value={draft.strategy.promise} onChange={event => updateStrategy({ promise: event.target.value })}/></label>
        <label>Ângulo<textarea className={areaClass} rows={2} value={draft.strategy.angle} onChange={event => updateStrategy({ angle: event.target.value })}/></label>
        <label className="md:col-span-2">Fronteira anticanibalização<textarea className={areaClass} rows={2} value={draft.strategy.boundary} onChange={event => updateStrategy({ boundary: event.target.value })}/></label>
      </div>
    </details>

    <details open className="rounded border border-slate-900 p-2">
      <summary className="cursor-pointer font-bold text-slate-300">Estrutura · H1, H2 e H3</summary>
      <label className="mt-2 block">H1<input className={inputClass} value={draft.structure.h1} onChange={event => update(current => ({ ...current, structure: { ...current.structure, h1: event.target.value } }))}/></label>
      <div className="mt-2 space-y-2">
        {draft.structure.sections.map((section, index) => <div key={section.id} className="rounded border border-slate-800 p-2">
          <div className="grid gap-2 md:grid-cols-[80px_1fr]"><label>Nível<select className={inputClass} value={String(section.level)} onChange={event => updateSection(index, { level: Number(event.target.value) as 2 | 3 })}><option value="2">H2</option><option value="3">H3</option></select></label><label>Título<input className={inputClass} value={section.heading} onChange={event => updateSection(index, { heading: event.target.value })}/></label></div>
          <label className="mt-2 block">Objetivo<textarea className={areaClass} rows={2} value={section.objective} onChange={event => updateSection(index, { objective: event.target.value })}/></label>
          <div className="mt-2 grid gap-2 md:grid-cols-2"><label>Tópicos<textarea className={areaClass} rows={2} value={joinLines(section.topics)} onChange={event => updateSection(index, { topics: splitLines(event.target.value) })}/></label><label>Perguntas<textarea className={areaClass} rows={2} value={joinLines(section.questions)} onChange={event => updateSection(index, { questions: splitLines(event.target.value) })}/></label><label>Entidades<textarea className={areaClass} rows={2} value={joinLines(section.entities)} onChange={event => updateSection(index, { entities: splitLines(event.target.value) })}/></label><label>Objeções<textarea className={areaClass} rows={2} value={joinLines(section.objections)} onChange={event => updateSection(index, { objections: splitLines(event.target.value) })}/></label></div>
        </div>)}
        <button type="button" className={buttonClass} onClick={() => update(current => ({ ...current, structure: { ...current.structure, sections: [...current.structure.sections, { id: `section:${current.structure.sections.length + 1}`, level: 2, heading: "Novo H2", objective: "Definir objetivo editorial.", topics: [], questions: [], entities: [], objections: [], keywordDnaRefs: current.structure.sections[0]?.keywordDnaRefs || [], evidenceRefs: [] }] } }))}>Adicionar seção</button>
      </div>
    </details>

    <details className="rounded border border-slate-900 p-2">
      <summary className="cursor-pointer font-bold text-slate-300">CTA e metadados</summary>
      <div className="mt-2 grid gap-2 md:grid-cols-2"><label>CTA<textarea className={areaClass} rows={2} value={draft.cta.text} onChange={event => update(current => ({ ...current, cta: { ...current.cta, text: event.target.value } }))}/></label><label>Objetivo do CTA<textarea className={areaClass} rows={2} value={draft.cta.objective} onChange={event => update(current => ({ ...current, cta: { ...current.cta, objective: event.target.value } }))}/></label><label>Posição<input className={inputClass} value={draft.cta.placement} onChange={event => update(current => ({ ...current, cta: { ...current.cta, placement: event.target.value } }))}/></label><label>Slug<input className={inputClass} value={draft.metadata.slug} onChange={event => update(current => ({ ...current, metadata: { ...current.metadata, slug: event.target.value } }))}/></label><label>Meta title<input className={inputClass} value={draft.metadata.metaTitle} onChange={event => update(current => ({ ...current, metadata: { ...current.metadata, metaTitle: event.target.value } }))}/></label><label>Meta description<textarea className={areaClass} rows={2} value={draft.metadata.metaDescription} onChange={event => update(current => ({ ...current, metadata: { ...current.metadata, metaDescription: event.target.value } }))}/></label><label>Canonical<input className={inputClass} value={draft.metadata.canonical || ""} onChange={event => update(current => ({ ...current, metadata: { ...current.metadata, canonical: event.target.value.trim() || null } }))}/></label><label>Indexação<select className={inputClass} value={draft.metadata.indexationStatus} onChange={event => update(current => ({ ...current, metadata: { ...current.metadata, indexationStatus: event.target.value as "noindex" | "index" } }))}><option value="noindex">noindex</option><option value="index">index</option></select></label></div>
    </details>

    <details className="rounded border border-slate-900 p-2">
      <summary className="cursor-pointer font-bold text-slate-300">Links, âncoras, fontes e evidências</summary>
      <div className="mt-2 space-y-2">
        {draft.internalLinks.length === 0 && <p className="text-amber-300">Nenhum link foi hidratado. A ausência permanece pendente; nenhum ID técnico vira texto editorial.</p>}
        {draft.internalLinks.map((link, index) => <div key={link.id} className="rounded border border-slate-800 p-2"><label>Destino editorial<input className={inputClass} value={link.targetSlug} onChange={event => update(current => ({ ...current, internalLinks: current.internalLinks.map((item, itemIndex) => itemIndex === index ? { ...item, targetSlug: event.target.value } : item) }))}/></label><label className="mt-2 block">Razão<textarea className={areaClass} rows={2} value={link.reason} onChange={event => update(current => ({ ...current, internalLinks: current.internalLinks.map((item, itemIndex) => itemIndex === index ? { ...item, reason: event.target.value } : item) }))}/></label></div>)}
        {draft.sources.map((source, index) => <div key={source.id} className="rounded border border-slate-800 p-2"><label>Claim<input className={inputClass} value={source.claim} onChange={event => updateSource(index, { claim: event.target.value })}/></label><div className="mt-2 grid gap-2 md:grid-cols-3"><label>URL candidata<input className={inputClass} placeholder="https://…" value={source.candidateUrl || ""} onChange={event => updateSource(index, { candidateUrl: event.target.value.trim() || null })}/></label><label>Status<select className={inputClass} value={source.status} onChange={event => updateSource(index, { status: event.target.value as ContentPlanDetails["sources"][number]["status"] })}><option value="needs_source">Precisa de fonte</option><option value="suggested">Sugerida</option><option value="approved">Aprovada</option><option value="rejected">Rejeitada</option></select></label><label>Título<input className={inputClass} value={source.title || ""} onChange={event => updateSource(index, { title: event.target.value || null })}/></label></div></div>)}
        {draft.evidenceRefs.length ? <p className="text-slate-500">Evidências anexadas: {draft.evidenceRefs.map(item => item.artifactId).join(", ")}.</p> : <p className="text-amber-300">Nenhuma evidência de Radar aprovada foi anexada.</p>}
      </div>
    </details>

    <details className="rounded border border-slate-900 p-2">
      <summary className="cursor-pointer font-bold text-slate-300">Imagens, Skills e notas humanas</summary>
      <div className="mt-2 space-y-2">{draft.images.map((image, index) => <div key={image.id} className="grid gap-2 rounded border border-slate-800 p-2 md:grid-cols-2"><label>Objetivo<textarea className={areaClass} rows={2} value={image.objective} onChange={event => updateImage(index, { objective: event.target.value })}/></label><label>Alt text<input className={inputClass} value={image.altText || ""} onChange={event => updateImage(index, { altText: event.target.value || null })}/></label></div>)}<label>Skill IDs, separados por vírgula<input className={inputClass} value={draft.skills.skillIds.join(", ")} onChange={event => update(current => ({ ...current, skills: { ...current.skills, skillIds: splitCsv(event.target.value) } }))}/></label><label>Prompt IDs, separados por vírgula<input className={inputClass} value={draft.skills.promptIds.join(", ")} onChange={event => update(current => ({ ...current, skills: { ...current.skills, promptIds: splitCsv(event.target.value) } }))}/></label><label>Notas humanas<textarea className={areaClass} rows={3} value={joinLines(draft.review.humanNotes)} onChange={event => update(current => ({ ...current, review: { ...current.review, humanNotes: splitLines(event.target.value) } }))}/></label></div>
    </details>
  </form>;
}
