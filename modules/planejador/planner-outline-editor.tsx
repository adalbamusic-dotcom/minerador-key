"use client";

import { useState } from "react";
import type { ContentPlanDetails } from "@/lib/arquiteto/contracts";
import { addOutlineSection, clonePlanDetails, moveOutlineSection, removeOutlineSection, updateOutlineSection, validateOutline } from "@/lib/planejador/outline";

const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider bg-surface-subtle px-3 text-sm font-semibold text-context-accent transition-colors hover:bg-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const input = "mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none placeholder:text-text-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const area = "mt-1 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-text-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const panel = "rounded-lg border border-divider bg-surface p-5";
const inset = "rounded-md border border-divider bg-surface-subtle p-4";

function lines(value: string) { return value.split("\n").map(item => item.trim()).filter(Boolean); }
function text(items: string[]) { return items.join("\n"); }
function numericValue(raw: string) {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

const emptyGabarito: NonNullable<ContentPlanDetails["gabarito"]> = {
  globalWords: { min: null, ideal: null, max: null },
  paragraphRange: { min: null, max: null },
  estimatedParagraphs: null,
  tone: null,
  depth: null,
  detail: null,
  counts: { h2: 0, h3: 0, intro: 1, conclusion: 1, faq: 0, tables: 0, comparisons: 0, checklists: 0, lists: 0, quotes: 0, images: 0, internalLinks: 0, externalLinks: 0, cta: 0, specialBlocks: 0 },
  alerts: [],
  humanDecision: null,
};

const blockLabels = { table: "Tabela", list: "Lista", comparison: "Comparação", checklist: "Checklist" } as const;

export function PlannerOutlineEditor({ details, onChange }: { details: ContentPlanDetails; onChange: (details: ContentPlanDetails) => void }) {
  const [present, setPresent] = useState(() => clonePlanDetails(details));
  const [past, setPast] = useState<ContentPlanDetails[]>([]);
  const [future, setFuture] = useState<ContentPlanDetails[]>([]);
  const validation = validateOutline(present);

  const apply = (next: ContentPlanDetails) => {
    setPast(current => [...current.slice(-19), present]);
    setFuture([]);
    setPresent(next);
    onChange(next);
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(current => current.slice(0, -1));
    setFuture(current => [present, ...current]);
    setPresent(previous);
    onChange(previous);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(current => current.slice(1));
    setPast(current => [...current, present]);
    setPresent(next);
    onChange(next);
  };
  const update = (id: string, patch: Partial<ContentPlanDetails["structure"]["sections"][number]>) => apply(updateOutlineSection(present, id, patch));
  const updateRange = (id: string, field: "wordRange" | "paragraphRange", key: "min" | "ideal" | "max", raw: string) => {
    const section = present.structure.sections.find(item => item.id === id);
    if (!section) return;
    const value = numericValue(raw);
    if (field === "wordRange") {
      const current = section.wordRange || { min: null, ideal: null, max: null };
      apply(updateOutlineSection(present, id, { wordRange: { ...current, [key]: value } }));
      return;
    }
    const current = section.paragraphRange || { min: null, max: null };
    if (key === "ideal") return;
    apply(updateOutlineSection(present, id, { paragraphRange: { ...current, [key]: value } }));
  };
  const setGabaritoNumber = (key: "min" | "ideal" | "max" | "estimatedParagraphs", raw: string) => {
    const current = present.gabarito || emptyGabarito;
    if (key === "estimatedParagraphs") {
      apply({ ...present, gabarito: { ...current, estimatedParagraphs: numericValue(raw) } });
      return;
    }
    apply({ ...present, gabarito: { ...current, globalWords: { ...current.globalWords, [key]: numericValue(raw) } } });
  };
  const setGabaritoText = (key: "tone" | "depth" | "detail", value: string) => {
    const current = present.gabarito || emptyGabarito;
    apply({ ...present, gabarito: { ...current, [key]: value.trim() || null } });
  };
  const addBlock = (type: keyof typeof blockLabels) => apply({ ...present, blocks: [...present.blocks, { id: `block:${type}:${present.blocks.length + 1}`, type, sectionId: null, order: present.blocks.length, objective: `Planejar bloco ${blockLabels[type].toLowerCase()}.`, instructions: [], origin: "human", humanDecision: "Adicionado no editor.", alert: null }] });

  return <div className="space-y-5">
    <section className={`${panel} border-module-accent`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Editor central de estrutura</h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">Esqueleto argumentativo e gabarito editorial. Nenhum parágrafo do artigo é escrito nesta etapa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={!past.length} onClick={undo}>Desfazer</button>
          <button type="button" className={button} disabled={!future.length} onClick={redo}>Refazer</button>
          <button type="button" className={button} onClick={() => apply(addOutlineSection(present, 2))}>Adicionar H2</button>
          <button type="button" className={button} onClick={() => apply(addOutlineSection(present, 3))}>Adicionar H3</button>
        </div>
      </div>
    </section>

    <section className={panel}>
      <label className="block text-sm font-semibold text-foreground">H1
        <input className={input} value={present.structure.h1} onChange={event => apply({ ...present, structure: { ...present.structure, h1: event.target.value } })}/>
      </label>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text">Blocos disponíveis</span>
        {(Object.keys(blockLabels) as Array<keyof typeof blockLabels>).map(type => <button type="button" key={type} className={button} onClick={() => addBlock(type)}>{blockLabels[type]}</button>)}
      </div>
      <p className="mt-3 text-sm leading-6 text-text-muted">FAQ não integra o fluxo padrão. Perguntas recebidas devem ser associadas às seções e não convertidas automaticamente em um bloco.</p>
    </section>

    <section className={panel}>
      <h3 className="text-base font-bold text-foreground">Gabarito editorial</h3>
      <p className="mt-1 text-sm leading-6 text-text-muted">Valores observados pelo Radar são recomendações. A pessoa responsável revisa e decide antes da aprovação.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-text">Palavras mínimas<input className={input} type="number" min="0" value={present.gabarito?.globalWords.min ?? ""} onChange={event => setGabaritoNumber("min", event.target.value)}/></label>
        <label className="text-sm font-medium text-text">Palavras ideais<input className={input} type="number" min="0" value={present.gabarito?.globalWords.ideal ?? ""} onChange={event => setGabaritoNumber("ideal", event.target.value)}/></label>
        <label className="text-sm font-medium text-text">Palavras máximas<input className={input} type="number" min="0" value={present.gabarito?.globalWords.max ?? ""} onChange={event => setGabaritoNumber("max", event.target.value)}/></label>
        <label className="text-sm font-medium text-text">Parágrafos estimados<input className={input} type="number" min="0" value={present.gabarito?.estimatedParagraphs ?? ""} onChange={event => setGabaritoNumber("estimatedParagraphs", event.target.value)}/></label>
        <label className="text-sm font-medium text-text">Tom<input className={input} value={present.gabarito?.tone || ""} onChange={event => setGabaritoText("tone", event.target.value)}/></label>
        <label className="text-sm font-medium text-text">Profundidade<input className={input} value={present.gabarito?.depth || ""} onChange={event => setGabaritoText("depth", event.target.value)}/></label>
        <label className="text-sm font-medium text-text lg:col-span-2">Nível de detalhe<input className={input} value={present.gabarito?.detail || ""} onChange={event => setGabaritoText("detail", event.target.value)}/></label>
      </div>
    </section>

    <div className="space-y-3">
      {present.structure.sections.map((section, index) => {
        const invalid = validation.orphanH3.includes(section.id) || validation.emptyH2.includes(section.id);
        return <details key={section.id} open={index === 0} className={`${inset} ${invalid ? "border-danger" : ""}`}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 text-base font-semibold text-foreground">
            <span className="rounded-md bg-selected px-2 py-1 text-sm font-bold text-context-accent">H{section.level}</span>
            <span className="min-w-0 flex-1">{section.decidedHeading || section.heading || "Título pendente"}</span>
            <span className="text-sm font-normal text-text-muted">{section.topics.length} tópicos · {section.questions.length} perguntas · {section.entities.length} entidades</span>
          </summary>
          <div className="mt-4 border-t border-divider pt-4">
            <div className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
              <label className="text-sm font-medium text-text">Nível<select className={input} value={section.level} onChange={event => { const next = Number(event.target.value) as 2 | 3; if (next === 3 && index === 0) return; update(section.id, { level: next }); }}><option value="2">H2</option><option value="3">H3</option></select></label>
              <label className="text-sm font-medium text-text">Título editorial<input className={input} value={section.decidedHeading || section.heading} onChange={event => update(section.id, { decidedHeading: event.target.value, heading: event.target.value })}/></label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-text">Objetivo<textarea className={area} rows={3} value={section.objective} onChange={event => update(section.id, { objective: event.target.value })}/></label>
              <label className="text-sm font-medium text-text">Função argumentativa<textarea className={area} rows={3} value={section.argumentativeFunction || ""} onChange={event => update(section.id, { argumentativeFunction: event.target.value || null })}/></label>
              <label className="text-sm font-medium text-text">Tópicos incluídos<textarea className={area} rows={3} value={text(section.topics)} onChange={event => update(section.id, { topics: lines(event.target.value) })}/></label>
              <label className="text-sm font-medium text-text">Perguntas associadas<textarea className={area} rows={3} value={text(section.questions)} onChange={event => update(section.id, { questions: lines(event.target.value) })}/></label>
              <label className="text-sm font-medium text-text">Entidades<textarea className={area} rows={3} value={text(section.entities)} onChange={event => update(section.id, { entities: lines(event.target.value) })}/></label>
              <label className="text-sm font-medium text-text">Objeções<textarea className={area} rows={3} value={text(section.objections)} onChange={event => update(section.id, { objections: lines(event.target.value) })}/></label>
              <label className="text-sm font-medium text-text">Instruções da seção<textarea className={area} rows={3} value={text(section.instructions || [])} onChange={event => update(section.id, { instructions: lines(event.target.value) })}/></label>
              <label className="text-sm font-medium text-text">Restrições da seção<textarea className={area} rows={3} value={text(section.restrictions || [])} onChange={event => update(section.id, { restrictions: lines(event.target.value) })}/></label>
              <label className="text-sm font-medium text-text">Tópicos excluídos<textarea className={area} rows={2} value={text(section.excludedTopics || [])} onChange={event => update(section.id, { excludedTopics: lines(event.target.value) })}/></label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-sm font-medium text-text">Palavras mínimas<input className={input} type="number" min="0" value={section.wordRange?.min ?? ""} onChange={event => updateRange(section.id, "wordRange", "min", event.target.value)}/></label>
              <label className="text-sm font-medium text-text">Palavras ideais<input className={input} type="number" min="0" value={section.wordRange?.ideal ?? ""} onChange={event => updateRange(section.id, "wordRange", "ideal", event.target.value)}/></label>
              <label className="text-sm font-medium text-text">Palavras máximas<input className={input} type="number" min="0" value={section.wordRange?.max ?? ""} onChange={event => updateRange(section.id, "wordRange", "max", event.target.value)}/></label>
              <label className="text-sm font-medium text-text">Parágrafos mínimos<input className={input} type="number" min="0" value={section.paragraphRange?.min ?? ""} onChange={event => updateRange(section.id, "paragraphRange", "min", event.target.value)}/></label>
              <label className="text-sm font-medium text-text">Parágrafos máximos<input className={input} type="number" min="0" value={section.paragraphRange?.max ?? ""} onChange={event => updateRange(section.id, "paragraphRange", "max", event.target.value)}/></label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-divider bg-surface-elevated p-4"><p className="text-sm font-semibold text-text">Referências preservadas</p><p className="mt-2 text-sm leading-6 text-text-muted">{section.keywordDnaRefs.length} KeywordDNA · {section.evidenceRefs.length} evidência(s) Radar</p></div>
              <div className="rounded-md border border-divider bg-surface-elevated p-4"><p className="text-sm font-semibold text-text">Cobertura visual</p><p className="mt-2 text-sm leading-6 text-text-muted">{section.imageId ? "Imagem associada" : "Sem imagem associada"} · {section.ctaId ? "CTA associado" : "CTA global"}</p></div>
              <div className="rounded-md border border-divider bg-surface-elevated p-4"><p className="text-sm font-semibold text-text">Estimativa</p><p className="mt-2 text-sm leading-6 text-text-muted">{section.estimatedParagraphs ?? "—"} parágrafo(s) · origem {section.origin || "não informada"}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={button} disabled={index === 0} onClick={() => apply(moveOutlineSection(present, section.id, -1))}>Subir</button>
              <button type="button" className={button} disabled={index === present.structure.sections.length - 1} onClick={() => apply(moveOutlineSection(present, section.id, 1))}>Descer</button>
              <button type="button" className={button} disabled={section.level === 3 && index === 0} onClick={() => update(section.id, { level: section.level === 2 ? 3 : 2 })}>{section.level === 2 ? "Transformar em H3" : "Transformar em H2"}</button>
              <button type="button" className={`${button} border-danger text-danger`} onClick={() => apply(removeOutlineSection(present, section.id))}>Remover</button>
            </div>
            {(section.alerts || []).map(alert => <p key={alert} className="mt-3 text-sm leading-6 text-warning">{alert}</p>)}
            {validation.orphanH3.includes(section.id) && <p className="mt-3 text-sm leading-6 text-danger">H3 órfão: crie ou mova-o para depois de um H2.</p>}
          </div>
        </details>;
      })}
    </div>
  </div>;
}
