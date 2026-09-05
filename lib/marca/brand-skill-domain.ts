import { contentHash } from "../arquiteto/versioning.ts";
import type { BrandSkill as LegacyBrandSkill } from "../editorial/operational-contracts.ts";
import { BrandSkillSchema, type BrandSkillRecord, type BrandSkillReference } from "./brand-skill-contracts.ts";
import { validateSkillMarkdown, type MarkdownValidationResult } from "./brand-skill-markdown.ts";
import { findSkillDefinition, requireSkillDefinition, type SkillDefinition, type SkillDefinitionModule } from "./skill-definitions.ts";

export class BrandSkillError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; this.name = "BrandSkillError"; } }
export function brandSkillIdentity(skill: Pick<BrandSkillRecord, "brandId" | "definitionKey">) { return `${skill.brandId}:${skill.definitionKey}`; }
export function assertSkillBelongsToBrand(skill: Pick<BrandSkillRecord, "brandId">, brandId: string) { if (skill.brandId !== brandId) throw new BrandSkillError("cross_brand_skill", "A Skill não pertence à marca informada."); return skill; }
/** Single canonical hash: metadata does not affect content identity. */
export function markdownContentHash(markdown: string) { return contentHash(markdown); }
export interface BrandSkillImportInput { brandId: string; definitionKey: string; name: string; filename: string; markdown: string; byteSize: number; mimeType?: string | null; importedBy: string; now?: string; }
async function buildVersion(input: BrandSkillImportInput, definition: SkillDefinition, validation: MarkdownValidationResult, version: number, previous: BrandSkillRecord | null): Promise<BrandSkillRecord> { if (!validation.normalized) throw new BrandSkillError("invalid_markdown", "Markdown sem conteúdo normalizado."); return BrandSkillSchema.parse({ schemaVersion: 1, brandId: input.brandId, definitionKey: definition.key, name: input.name.trim(), originalMarkdown: input.markdown, normalizedContent: validation.normalized, structureDiagnostics: validation.normalized.sectionDiagnostics, sourceFilename: input.filename.trim(), contentHash: await markdownContentHash(input.markdown), version, status: "draft", provenance: { importedBy: input.importedBy, importedAt: input.now || new Date().toISOString(), sourceByteSize: input.byteSize, previousContentHash: previous?.contentHash || null, previousVersion: previous?.version || null } }); }
export async function importBrandSkill(input: BrandSkillImportInput): Promise<BrandSkillRecord> { const definition = requireSkillDefinition(input.definitionKey); if (!input.name.trim()) throw new BrandSkillError("missing_name", "Informe o nome da Skill antes de salvar."); const validation = validateSkillMarkdown({ filename: input.filename, content: input.markdown, byteSize: input.byteSize, mimeType: input.mimeType }, definition); if (validation.status === "INVALID") throw new BrandSkillError("invalid_markdown", validation.errors.join(" ")); return buildVersion(input, definition, validation, 1, null); }
export async function replaceBrandSkillMarkdown(input: BrandSkillImportInput & { previous: BrandSkillRecord }): Promise<{ changed: boolean; skill: BrandSkillRecord }> { assertSkillBelongsToBrand(input.previous, input.brandId); if (input.previous.definitionKey !== input.definitionKey) throw new BrandSkillError("definition_mismatch", "O gabarito da Skill não pode mudar em uma substituição."); const definition = requireSkillDefinition(input.definitionKey); const validation = validateSkillMarkdown({ filename: input.filename, content: input.markdown, byteSize: input.byteSize, mimeType: input.mimeType }, definition); if (validation.status === "INVALID") throw new BrandSkillError("invalid_markdown", validation.errors.join(" ")); const hash = await markdownContentHash(input.markdown); if (hash === input.previous.contentHash) return { changed: false, skill: input.previous }; return { changed: true, skill: await buildVersion(input, definition, validation, input.previous.version + 1, input.previous) }; }
export function renameBrandSkill(skill: BrandSkillRecord, name: string): BrandSkillRecord { if (!name.trim()) throw new BrandSkillError("missing_name", "Informe o nome da Skill."); return { ...skill, name: name.trim() }; }
export function submitBrandSkillForApproval(skill: BrandSkillRecord): BrandSkillRecord { if (skill.status !== "draft") throw new BrandSkillError("invalid_transition", "Somente um rascunho pode ser enviado para aprovação."); return { ...skill, status: "pending_approval" }; }
export function approveBrandSkill(input: { skills: BrandSkillRecord[]; brandId: string; definitionKey: string; version: number }): BrandSkillRecord[] { const target = input.skills.find(skill => skill.definitionKey === input.definitionKey && skill.version === input.version && skill.brandId === input.brandId); if (!target) throw new BrandSkillError("skill_not_found", "Versão de Skill não encontrada."); if (target.status === "active") return input.skills; if (target.status !== "draft" && target.status !== "pending_approval") throw new BrandSkillError("invalid_transition", "Somente rascunho ou pendente pode ser ativado."); return input.skills.map(skill => skill.brandId !== input.brandId || skill.definitionKey !== target.definitionKey ? skill : skill.version === target.version ? { ...skill, status: "active" as const } : skill.status === "active" ? { ...skill, status: "archived" as const } : skill); }
export function archiveBrandSkill(input: { skills: BrandSkillRecord[]; brandId: string; definitionKey: string; version: number }): BrandSkillRecord[] { const target = input.skills.find(skill => skill.definitionKey === input.definitionKey && skill.version === input.version && skill.brandId === input.brandId); if (!target) throw new BrandSkillError("skill_not_found", "Versão de Skill não encontrada."); return input.skills.map(skill => skill.brandId === input.brandId && skill.definitionKey === target.definitionKey && skill.version === target.version ? { ...skill, status: "archived" as const } : skill); }
/** Metadata de recomendação; nunca é uma autorização de leitura da Skill. */
export function consumerModulesOf(skill: Pick<BrandSkillRecord, "definitionKey">): SkillDefinitionModule[] { return requireSkillDefinition(skill.definitionKey).consumerModules; }
export function isSkillRecommendedForModule(skill: Pick<BrandSkillRecord, "definitionKey">, module: SkillDefinitionModule) { return consumerModulesOf(skill).includes(module); }

function hasValidSkillContent(skill: BrandSkillRecord) {
  return Boolean(
    findSkillDefinition(skill.definitionKey)
    && skill.contentHash.trim()
    && skill.originalMarkdown.trim()
    && skill.normalizedContent.definitionKey === skill.definitionKey,
  );
}

/**
 * Uma única versão corrente por `brandId + definitionKey` pode entrar no
 * contexto. Draft, pending e active são patrimônio contextual da Marca;
 * archived (inclusive o estado técnico superseded projetado) não é disponível.
 */
export function selectAvailableSkills(input: { skills: BrandSkillRecord[]; brandId: string; module: SkillDefinitionModule }) {
  void input.module;
  const currentByDefinition = new Map<string, BrandSkillRecord>();
  for (const skill of input.skills) {
    if (skill.brandId !== input.brandId || !hasValidSkillContent(skill)) continue;
    const current = currentByDefinition.get(skill.definitionKey);
    if (!current || skill.version > current.version) currentByDefinition.set(skill.definitionKey, skill);
  }
  return [...currentByDefinition.values()]
    .filter(skill => skill.status !== "archived")
    .sort((left, right) => left.definitionKey.localeCompare(right.definitionKey));
}

export function resolveBrandSkill(input: { skills: BrandSkillRecord[]; brandId: string; definitionKey: string }) {
  return selectAvailableSkills({ skills: input.skills, brandId: input.brandId, module: "minerador" })
    .find(skill => skill.definitionKey === input.definitionKey) || null;
}
export function toBrandSkillReference(skill: BrandSkillRecord): BrandSkillReference { return { brandId: skill.brandId, definitionKey: skill.definitionKey, name: skill.name, originalMarkdown: skill.originalMarkdown, normalizedContent: skill.normalizedContent, structureDiagnostics: skill.structureDiagnostics, sourceFilename: skill.sourceFilename, versionId: skill.versionId || null, version: skill.version, contentHash: skill.contentHash, lifecycleStatus: skill.status, provenance: skill.provenance, consumerModules: consumerModulesOf(skill), applied: false }; }
/** The only compatibility adapter retained for the legacy Planner contract. */
export function toLegacyBrandSkill(skill: BrandSkillRecord): LegacyBrandSkill { const definition = requireSkillDefinition(skill.definitionKey); return { id: brandSkillIdentity(skill), brandId: skill.brandId, name: skill.name, description: definition.description, rules: skill.structureDiagnostics.filter(item => item.match !== "not_found").map(item => item.matchedHeading || item.label), status: skill.status === "active" ? "approved" : skill.status === "archived" ? "archived" : "draft", origin: "local" }; }
