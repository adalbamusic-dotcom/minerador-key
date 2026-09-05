import type { BrandContextPack, BrandContextModule } from "./brand-context-pack.ts";
import type { BrandSkillStatus } from "./brand-skill-contracts.ts";

/** Compact immutable provenance for an operation that actually injected a Skill into its prompt. */
export type AppliedBrandSkillRef = { definitionKey: string; versionId: string | null; versionNumber: number; contentHash: string; lifecycleStatus: BrandSkillStatus; };
export type BrandAIContext = { brandId: string; module: BrandContextModule; purpose: string; appliedSkillRefs: AppliedBrandSkillRef[]; brandContext: string; };
function compact(values: string[]) { return values.map(value => value.trim()).filter(Boolean).join(" · "); }

/** Builds an explicit BRAND CONTEXT layer. It never calls a provider or changes editorial decisions. */
export function buildBrandAIContext(pack: BrandContextPack): BrandAIContext {
  if (!pack.purpose?.trim()) throw new Error("A operação de IA precisa declarar purpose.");
  const dna = pack.brandDna;
  const brandDna = dna ? ["BRAND DNA (fonte superior de identidade)", `Posicionamento: ${dna.positioning}`, `Público: ${compact(dna.audience)}`, `Voz: ${compact(dna.voice)}`, `Princípios editoriais: ${compact(dna.editorialPrinciples)}`, `Claims proibidos: ${compact(dna.prohibitedClaims)}`].join("\n") : "BRAND DNA indisponível: não invente identidade, voz ou claims.";
  const skillBlocks = pack.skills.map(skill => ["BRAND SKILL (contexto complementar; não substitui BrandDNA, evidência ou regras do módulo)", `definitionKey: ${skill.definitionKey}`, `name: ${skill.name}`, `versionId: ${skill.versionId || "unavailable"}`, `versionNumber: ${skill.version}`, `contentHash: ${skill.contentHash}`, `lifecycleStatus: ${skill.lifecycleStatus}`, skill.originalMarkdown].join("\n"));
  return { brandId: pack.brandId, module: pack.module, purpose: pack.purpose.trim(), appliedSkillRefs: pack.skills.map(skill => ({ definitionKey: skill.definitionKey, versionId: skill.versionId, versionNumber: skill.version, contentHash: skill.contentHash, lifecycleStatus: skill.lifecycleStatus })), brandContext: ["BRAND CONTEXT", brandDna, ...skillBlocks].join("\n\n") };
}
function compactSkillContent(skill: BrandContextPack["skills"][number]): string {
  const sections = skill.normalizedContent.sections
    .filter(section => section.body.trim())
    .map(section => ["## " + section.heading, section.body.trim()].join("\n"));
  return sections.length ? sections.join("\n\n") : skill.originalMarkdown.trim();
}

/**
 * Compact variant for contextual Minerador prompts. It keeps the same
 * availability/provenance rules but avoids sending Markdown formatting that
 * is not needed to explain a single keyword.
 */
export function buildBrandAIContextForPresentation(pack: BrandContextPack): BrandAIContext {
  if (!pack.purpose?.trim()) throw new Error("A operação de IA precisa declarar purpose.");
  const dna = pack.brandDna;
  const brandDna = dna ? [
    "BRAND DNA (fonte superior de identidade)",
    "Posicionamento: " + dna.positioning,
    "Público: " + compact(dna.audience),
    "Voz: " + compact(dna.voice),
    "Objetivos: " + compact(dna.businessObjectives),
    "Diferenciais: " + compact(dna.differentiators),
    "Princípios editoriais: " + compact(dna.editorialPrinciples),
    "Claims proibidos: " + compact(dna.prohibitedClaims),
  ].join("\n") : pack.skills.length
    // Sem BrandDNA aprovado a identidade fica registrada como lacuna, mas a Voz
    // da Marca corrente continua sendo fonte legítima de voz e vocabulário.
    ? "BRAND DNA aprovado indisponível: registre essa lacuna, não invente público, oferta nem claims, e use a Voz da Marca abaixo como fonte de voz."
    : "BRAND DNA indisponível: não invente identidade, voz ou claims.";
  const skillBlocks = pack.skills.map(skill => [
    "BRAND SKILL (contexto complementar; não substitui BrandDNA, evidência ou regras do módulo)",
    "definitionKey: " + skill.definitionKey,
    "name: " + skill.name,
    "versionId: " + (skill.versionId || "unavailable"),
    "versionNumber: " + skill.version,
    "contentHash: " + skill.contentHash,
    "lifecycleStatus: " + skill.lifecycleStatus,
    compactSkillContent(skill),
  ].join("\n"));
  return {
    brandId: pack.brandId,
    module: pack.module,
    purpose: pack.purpose.trim(),
    appliedSkillRefs: pack.skills.map(skill => ({
      definitionKey: skill.definitionKey,
      versionId: skill.versionId,
      versionNumber: skill.version,
      contentHash: skill.contentHash,
      lifecycleStatus: skill.lifecycleStatus,
    })),
    brandContext: ["BRAND CONTEXT", brandDna, ...skillBlocks].join("\n\n"),
  };
}
