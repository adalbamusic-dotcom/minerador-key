import type { NormalizedSkillContent, NormalizedSkillSection, SkillSectionDiagnostic } from "./brand-skill-contracts.ts";
import type { SkillDefinition, SkillDefinitionExpectedSection } from "./skill-definitions.ts";

export interface MarkdownValidationInput { filename: string; content: string; byteSize: number; mimeType?: string | null; }
export type MarkdownValidationStatus = "INVALID" | "VALID" | "VALID_WITH_NOTICES";
export interface MarkdownValidationResult { status: MarkdownValidationStatus; valid: boolean; errors: string[]; notices: string[]; normalized: NormalizedSkillContent | null; }

// O limite de tamanho pertence ao gabarito (`definition.maxFileSizeBytes`);
// não existe segunda constante global duplicando esse contrato.
export function normalizeHeadingKey(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[*_~]/g, "").replace(/^\s*\d+\s*[.)-]\s*/, "").replace(/[.:;,]+\s*$/, "").trim().toLowerCase().replace(/\s+/g, " "); }
function headingTokens(value: string) { return normalizeHeadingKey(value).split(" ").filter(Boolean); }
function containsPhrase(heading: string, phrase: string) { const target = headingTokens(heading); const needle = headingTokens(phrase); return Boolean(needle.length && needle.length <= target.length && target.some((_, index) => needle.every((token, offset) => target[index + offset] === token))); }
export function hasMarkdownExtension(filename: string, extensions = [".md"]) { const value = filename.trim().toLowerCase(); return extensions.some(extension => value.endsWith(extension.toLowerCase())); }
const headingPattern = /^(#{1,6})\s+(.*\S)\s*$/;

export function parseMarkdownSections(markdown: string): { title: string | null; sections: NormalizedSkillSection[] } {
  const lines = markdown.split(/\r?\n/); const headings = lines.map(line => headingPattern.exec(line)).filter(Boolean) as RegExpExecArray[];
  const documentTitle = headings.find(match => match[1].length === 1); const levels = headings.map(match => match[1].length).filter(level => level > 1); const primaryLevel = levels.length ? Math.min(...levels) : 0;
  let title = documentTitle ? documentTitle[2].trim() : null; const sections: NormalizedSkillSection[] = []; let current: NormalizedSkillSection | null = null; let buffer: string[] = [];
  const flush = () => { if (current) { sections.push({ ...current, body: buffer.join("\n").trim() }); buffer = []; } };
  for (const line of lines) { const match = headingPattern.exec(line); const level = match ? match[1].length : 0; if (match && level === 1 && !current) { title ||= match[2].trim(); continue; } if (match && primaryLevel && level === primaryLevel) { flush(); const heading = match[2].trim(); current = { heading, key: normalizeHeadingKey(heading), body: "" }; continue; } if (current) buffer.push(line); }
  flush(); return { title, sections };
}
function diagnoseSection(section: SkillDefinitionExpectedSection, present: NormalizedSkillSection[]): SkillSectionDiagnostic {
  const exact = present.find(item => item.key === normalizeHeadingKey(section.label)); if (exact) return { key: section.key, label: section.label, importance: section.importance, match: "matched", matchedHeading: exact.heading };
  const alias = present.find(item => section.aliases.some(candidate => item.key === normalizeHeadingKey(candidate) || containsPhrase(item.heading, candidate)));
  return alias ? { key: section.key, label: section.label, importance: section.importance, match: "alias_matched", matchedHeading: alias.heading } : { key: section.key, label: section.label, importance: section.importance, match: "not_found", matchedHeading: null };
}
export function normalizeAgainstDefinition(markdown: string, definition: SkillDefinition): NormalizedSkillContent {
  const parsed = parseMarkdownSections(markdown); const present = parsed.sections.filter(section => section.body.length > 0); const sectionDiagnostics = definition.expectedSections.map(section => diagnoseSection(section, present)); const recognized = new Set(sectionDiagnostics.flatMap(item => item.matchedHeading ? [item.matchedHeading] : []));
  return { definitionKey: definition.key, title: parsed.title, sections: parsed.sections, sectionDiagnostics, extraSections: parsed.sections.filter(section => !recognized.has(section.heading)).map(section => section.heading) };
}
export function validateSkillMarkdown(input: MarkdownValidationInput, definition: SkillDefinition): MarkdownValidationResult {
  const errors: string[] = []; if (!hasMarkdownExtension(input.filename, definition.acceptedExtensions)) errors.push(`O arquivo precisa usar ${definition.acceptedExtensions.join(" ou ")}.`);
  const mime = input.mimeType?.toLowerCase().trim() || ""; const demonstratedIncompatibleMime = Boolean(mime && mime !== "application/octet-stream" && !definition.acceptedMimeTypes.includes(mime)); if (demonstratedIncompatibleMime) errors.push(`Tipo de arquivo incompatível: ${input.mimeType}. Envie Markdown.`);
  if (input.byteSize > definition.maxFileSizeBytes) errors.push(`O arquivo excede o limite de ${Math.round(definition.maxFileSizeBytes / 1024)} KB.`); if (!input.content.trim()) errors.push("O arquivo está vazio."); if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(input.content) || input.content.includes("�")) errors.push("O arquivo não é texto UTF-8 válido.");
  if (errors.length) return { status: "INVALID", valid: false, errors, notices: [], normalized: null };
  const normalized = normalizeAgainstDefinition(input.content, definition); const alias = normalized.sectionDiagnostics.filter(item => item.match === "alias_matched"); const missing = normalized.sectionDiagnostics.filter(item => item.match === "not_found"); const notices: string[] = [];
  if (!normalized.sections.length) notices.push("Nenhuma seção Markdown foi identificada; o documento será preservado como está."); if (alias.length) notices.push(`Estruturas reconhecidas por alias: ${alias.map(item => `${item.label} ← ${item.matchedHeading}`).join("; ")}.`); if (missing.length) notices.push(`Estrutura recomendada não identificada: ${missing.map(item => item.label).join(", ")}. Isso não impede o envio.`);
  return { status: notices.length ? "VALID_WITH_NOTICES" : "VALID", valid: true, errors: [], notices, normalized };
}
export function summarizeStructure(normalized: NormalizedSkillContent) { return { recognized: normalized.sectionDiagnostics.filter(item => item.match !== "not_found").length, missing: normalized.sectionDiagnostics.filter(item => item.match === "not_found").length, equivalent: normalized.sectionDiagnostics.filter(item => item.match === "alias_matched").length }; }
export type MarkdownPreviewBlock = { kind: "heading"; level: 1 | 2 | 3; text: string } | { kind: "list"; items: string[] } | { kind: "paragraph"; text: string };
export function toPreviewBlocks(markdown: string, limit = 120): MarkdownPreviewBlock[] { const blocks: MarkdownPreviewBlock[] = []; let paragraph: string[] = []; let list: string[] = []; const flushParagraph = () => { if (paragraph.length) { blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() }); paragraph = []; } }; const flushList = () => { if (list.length) { blocks.push({ kind: "list", items: list }); list = []; } }; for (const line of markdown.split(/\r?\n/)) { if (blocks.length >= limit) break; const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(line); const item = /^\s*(?:[-*+]|\d+\.)\s+(.*\S)\s*$/.exec(line); if (heading) { flushParagraph(); flushList(); blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() }); continue; } if (item) { flushParagraph(); list.push(item[1].trim()); continue; } if (!line.trim()) { flushParagraph(); flushList(); continue; } flushList(); paragraph.push(line.trim()); } flushParagraph(); flushList(); return blocks.slice(0, limit); }
export function formatByteSize(bytes: number) { return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`; }
