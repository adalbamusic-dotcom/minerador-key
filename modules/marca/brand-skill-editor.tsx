"use client";

import { useMemo, useRef, useState } from "react";
import { Check, CircleDashed, CircleDot, FileText, Upload, X } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { internalBadge, internalButton, internalButtonPrimary, internalField, internalNoticeError, internalNoticeWarning } from "@/components/editorial/internal-page-visual";
import { formatByteSize, summarizeStructure, toPreviewBlocks, validateSkillMarkdown, type MarkdownValidationResult } from "@/lib/marca/brand-skill-markdown";
import { skillVersionLabel } from "@/lib/marca/brand-skill-workspace";
import type { BrandSkillRecord, NormalizedSkillContent } from "@/lib/marca/brand-skill-contracts";
import type { SkillDefinition } from "@/lib/marca/skill-definitions";
import { brandSkillHints, brandSkillPrototypeNotice, brandSkillStatusLabels, brandSkillStatusTones, consumerModulesLabel } from "./brand-skill-labels";

const overlay = "fixed inset-0 z-50 flex items-end justify-center bg-background/75 p-4 sm:items-center";
const dialogSurface = "max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl overflow-y-auto rounded-lg border border-divider bg-surface-elevated p-5 shadow-md sm:p-6";

export interface SelectedMarkdownFile {
  filename: string;
  content: string;
  byteSize: number;
  mimeType: string | null;
}

/** Prévia legível: o Markdown é renderizado como texto, nunca como HTML executável. */
export function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => toPreviewBlocks(markdown), [markdown]);
  return <div className="max-h-72 overflow-y-auto rounded-md border border-divider bg-surface-subtle p-4">
    {blocks.map((block, index) => {
      if (block.kind === "heading") return <p key={index} className={`${index ? "mt-3" : ""} font-semibold text-foreground ${block.level === 1 ? "text-base" : "text-sm"}`}>{block.text}</p>;
      if (block.kind === "list") return <ul key={index} className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
      return <p key={index} className="mt-2 text-sm leading-6 text-text-muted">{block.text}</p>;
    })}
  </div>;
}

const matchLabels = { matched: "encontrada", alias_matched: "reconhecida por alias", not_found: "não identificada" } as const;

/**
 * Diagnóstico da estrutura recomendada. Nenhuma linha aqui reprova o arquivo:
 * a estrutura do gabarito é recomendação, não exigência.
 */
export function StructureReport({ normalized }: { normalized: NormalizedSkillContent }) {
  return <ul className="space-y-2">
    {normalized.sectionDiagnostics.map(row => <li key={`${row.importance}:${row.key}`} className="flex items-start gap-2 text-sm text-text-muted">
      {row.match === "matched" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true"/>
        : row.match === "alias_matched" ? <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true"/>
        : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true"/>}
      <span><span className="text-foreground">{row.label}</span> · {matchLabels[row.match]}{row.match === "alias_matched" && row.matchedHeading ? ` (${row.matchedHeading})` : ""}{row.importance === "optional" ? " · opcional" : ""}</span>
    </li>)}
    {normalized.extraSections.length ? <li className="text-sm text-text-muted">Seções próprias preservadas: {normalized.extraSections.join(", ")}.</li> : null}
  </ul>;
}

export function BrandSkillFormDialog({ mode, definitions, definition, previous, name, file, saving, error, onSelectDefinition, onChangeName, onSelectFile, onSubmit, onClose }: {
  mode: "add" | "replace";
  definitions: SkillDefinition[];
  definition: SkillDefinition;
  previous: BrandSkillRecord | null;
  name: string;
  file: SelectedMarkdownFile | null;
  saving: boolean;
  error: string;
  onSelectDefinition: (key: string) => void;
  onChangeName: (name: string) => void;
  onSelectFile: (file: SelectedMarkdownFile | null) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [readError, setReadError] = useState("");
  const validation: MarkdownValidationResult | null = useMemo(
    () => (file ? validateSkillMarkdown({ filename: file.filename, content: file.content, byteSize: file.byteSize, mimeType: file.mimeType }, definition) : null),
    [file, definition],
  );

  const pick = async (picked: File | undefined) => {
    setReadError("");
    if (!picked) { onSelectFile(null); return; }
    if (picked.size > definition.maxFileSizeBytes) { onSelectFile({ filename: picked.name, content: "", byteSize: picked.size, mimeType: picked.type || null }); return; }
    try {
      const content = await picked.text();
      onSelectFile({ filename: picked.name, content, byteSize: picked.size, mimeType: picked.type || null });
    } catch {
      onSelectFile(null);
      setReadError("Não foi possível ler o arquivo selecionado.");
    }
  };

  // Só erro técnico impede o envio: divergência de estrutura é diagnóstico.
  const ready = Boolean(name.trim() && validation && validation.status !== "INVALID");
  const summary = validation?.normalized ? summarizeStructure(validation.normalized) : null;

  return <div className={overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className={dialogSurface} role="dialog" aria-modal="true" aria-labelledby="brand-skill-form-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-muted">{mode === "add" ? "Adicionar Skill" : "Substituir arquivo"}</p>
          <h2 id="brand-skill-form-title" className="mt-1 text-xl font-semibold text-foreground">{mode === "add" ? "Alimentar um gabarito da Plataforma" : previous?.name}</h2>
          {previous && <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted"><span className={`${internalBadge} ${brandSkillStatusTones[previous.status]}`}>{brandSkillStatusLabels[previous.status]}</span><span className="font-mono">{skillVersionLabel(previous)}</span><span>Enviar conteúdo diferente cria a v{previous.version + 1} após confirmação do servidor.</span></p>}
        </div>
        <button type="button" className={`${internalButton} min-h-11 min-w-11 p-0`} onClick={onClose} disabled={saving} aria-label="Fechar diálogo de Skill"><X className="h-5 w-5" aria-hidden="true"/></button>
      </div>

      <p className={`${internalNoticeWarning} mt-5`}>{brandSkillPrototypeNotice}</p>
      {error && <p role="alert" className={`${internalNoticeWarning} mt-3`}>{error}</p>}
      {readError && <p role="alert" className={`${internalNoticeWarning} mt-3`}>{readError}</p>}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-foreground" htmlFor="brand-skill-definition"><span className="flex items-center gap-1.5">Tipo de Skill<InfoHint description={brandSkillHints.definition}/></span>
          <select id="brand-skill-definition" className={`${internalField} mt-2`} value={definition.key} onChange={event => onSelectDefinition(event.target.value)} disabled={mode === "replace"}>
            {definitions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-foreground" htmlFor="brand-skill-name"><span className="flex items-center gap-1.5">Nome<InfoHint description={brandSkillHints.name}/></span>
          <input id="brand-skill-name" className={`${internalField} mt-2`} value={name} onChange={event => onChangeName(event.target.value)} placeholder="Voz editorial Care Glow"/>
        </label>
      </div>

      <section className="mt-5 rounded-md border border-divider bg-surface-subtle p-4">
        <h3 className="text-sm font-semibold text-foreground">{definition.label}</h3>
        <p className="mt-2 text-sm leading-6 text-text-muted">{definition.description}</p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-text-muted">Áreas recomendadas: {consumerModulesLabel(definition.consumerModules)}<InfoHint description={brandSkillHints.consumers}/></p>
        <div className="mt-3">
          <p className="text-sm font-semibold text-foreground">Estrutura recomendada</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">É orientação, não exigência: um documento mais rico ou organizado de outra forma é aceito e preservado como está.</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted">
            {definition.expectedSections.map(section => <li key={section.key}><span className="text-foreground">## {section.label}</span> · {section.importance === "recommended" ? "recomendada" : "opcional"}{section.description ? ` — ${section.description}` : ""}</li>)}
          </ul>
        </div>
      </section>

      <div className="mt-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">Arquivo Markdown<InfoHint description={brandSkillHints.markdown}/></p>
        <p className="mt-1 text-sm leading-6 text-text-muted">Somente arquivos Markdown nesta fase. O conteúdo original é preservado e o salvamento só confirma após readback do servidor.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept=".md,text/markdown" className="sr-only" aria-label="Selecionar arquivo Markdown" onChange={event => void pick(event.target.files?.[0])}/>
          <button type="button" className={internalButton} onClick={() => inputRef.current?.click()} disabled={saving}><Upload className="h-4 w-4" aria-hidden="true"/>Selecionar arquivo .md</button>
          {file && <span className="flex flex-wrap items-center gap-2 text-sm text-text-muted"><FileText className="h-4 w-4" aria-hidden="true"/>{file.filename}<span>{formatByteSize(file.byteSize)}</span><span className={`${internalBadge} ${validation?.status === "VALID" ? "border-success/40 bg-success-soft text-success" : validation?.status === "VALID_WITH_NOTICES" ? "border-warning/40 bg-warning-soft text-warning" : "border-danger/40 bg-danger-soft text-danger"}`}>{validation?.status === "INVALID" ? "Markdown inválido" : "Markdown válido"}</span>{summary ? <span>{summary.recognized} estrutura(s) reconhecida(s) · {summary.missing} recomendada(s) não identificada(s)</span> : null}</span>}
        </div>
        {validation?.status === "INVALID" && <ul role="alert" className={`${internalNoticeError} mt-3 list-disc space-y-1 pl-8`}>{validation.errors.map(item => <li key={item}>{item}</li>)}</ul>}
        {validation?.status === "VALID_WITH_NOTICES" && <div className={`${internalNoticeWarning} mt-3`}><p className="font-semibold">Estrutura recomendada parcialmente reconhecida</p><ul className="mt-1 list-disc space-y-1 pl-5">{validation.notices.map(item => <li key={item}>{item}</li>)}</ul><p className="mt-1">O documento é aceito como está e o conteúdo original é preservado.</p></div>}
      </div>

      {validation?.normalized && <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section><p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">Estrutura encontrada<InfoHint description={brandSkillHints.structure}/></p><div className="mt-3"><StructureReport normalized={validation.normalized}/></div></section>
        <section><p className="text-sm font-semibold text-foreground">Prévia do conteúdo</p><div className="mt-3">{file && <MarkdownPreview markdown={file.content}/>}</div></section>
      </div>}

      <p className="mt-5 border-t border-divider pt-4 text-sm leading-6 text-text-muted">A identidade da marca continua sendo a fonte canônica; esta Skill operacionaliza esse conhecimento e não o substitui.</p>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-divider pt-5">
        <button type="button" className={internalButton} onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="button" className={internalButtonPrimary} onClick={onSubmit} disabled={saving || !ready}>{saving ? "Salvando no servidor…" : mode === "add" ? "Salvar Skill" : "Substituir arquivo"}</button>
      </div>
    </section>
  </div>;
}

export function BrandSkillDetailDialog({ skill, definition, onReplace, onRename, onArchive, onClose }: {
  skill: BrandSkillRecord;
  definition: SkillDefinition;
  onReplace: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(skill.name);
  return <div className={overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={dialogSurface} role="dialog" aria-modal="true" aria-labelledby="brand-skill-detail-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-muted">{definition.label}</p>
          <h2 id="brand-skill-detail-title" className="mt-1 text-xl font-semibold text-foreground">{skill.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`${internalBadge} ${brandSkillStatusTones[skill.status]}`}>{brandSkillStatusLabels[skill.status]}</span><span className="font-mono text-sm text-text-muted" title={skill.contentHash}>{skillVersionLabel(skill)}</span><span className={`${internalBadge} border-divider font-mono text-text-muted`}>{skill.definitionKey}</span></div>
        </div>
        <button type="button" className={`${internalButton} min-h-11 min-w-11 p-0`} onClick={onClose} aria-label="Fechar Skill"><X className="h-5 w-5" aria-hidden="true"/></button>
      </div>

      <p className={`${internalNoticeWarning} mt-5`}>{brandSkillPrototypeNotice}</p>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm font-semibold text-foreground">Descrição do gabarito</dt><dd className="mt-1 text-sm leading-6 text-text-muted">{definition.description}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-sm font-semibold text-foreground">Áreas recomendadas<InfoHint description={brandSkillHints.consumers}/></dt><dd className="mt-1 text-sm leading-6 text-text-muted">{consumerModulesLabel(definition.consumerModules)}</dd></div>
        <div><dt className="text-sm font-semibold text-foreground">Arquivo original</dt><dd className="mt-1 text-sm leading-6 text-text-muted">{skill.sourceFilename} · {formatByteSize(skill.provenance.sourceByteSize)}</dd></div>
        <div><dt className="text-sm font-semibold text-foreground">Versão e estado</dt><dd className="mt-1 text-sm leading-6 text-text-muted">{skillVersionLabel(skill)}</dd></div>
      </dl>

      <section className="mt-5 border-t border-divider pt-5">
        <label className="block text-sm font-semibold text-foreground" htmlFor="brand-skill-rename"><span className="flex items-center gap-1.5">Nome<InfoHint description={brandSkillHints.name}/></span>
          <span className="mt-2 flex flex-wrap gap-2"><input id="brand-skill-rename" className={`${internalField} min-w-0 flex-1`} value={name} onChange={event => setName(event.target.value)}/><button type="button" className={internalButton} onClick={() => onRename(name)} disabled={!name.trim() || name.trim() === skill.name}>Renomear</button></span>
        </label>
      </section>

      <section className="mt-5 grid gap-5 border-t border-divider pt-5 lg:grid-cols-2">
        <div><p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">Estrutura reconhecida<InfoHint description={brandSkillHints.structure}/></p><div className="mt-3"><StructureReport normalized={skill.normalizedContent}/></div></div>
        <div><p className="text-sm font-semibold text-foreground">Conteúdo Markdown</p><div className="mt-3"><MarkdownPreview markdown={skill.originalMarkdown}/></div></div>
      </section>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-divider pt-5">
        <button type="button" className={internalButton} onClick={onArchive} disabled={skill.status === "archived"}>Arquivar</button>
        <button type="button" className={internalButtonPrimary} onClick={onReplace}>Substituir arquivo</button>
      </div>
    </section>
  </div>;
}
