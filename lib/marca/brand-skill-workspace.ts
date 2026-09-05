import { isSkillRecommendedForModule } from "./brand-skill-domain.ts";
import type { BrandSkillRecord, BrandSkillStatus } from "./brand-skill-contracts.ts";
import type { SkillDefinitionModule } from "./skill-definitions.ts";

/** Projeções puras da lista já lida do servidor; não é uma cópia de trabalho. */
export interface BrandSkillFilters { search: string; definitionKey: "all" | string; status: "all" | BrandSkillStatus; consumer: "all" | SkillDefinitionModule; }
export const emptyBrandSkillFilters: BrandSkillFilters = { search: "", definitionKey: "all", status: "all", consumer: "all" };
export function skillVersionLabel(skill: Pick<BrandSkillRecord, "version" | "status">) { const state = skill.status === "active" ? "Ativa" : skill.status === "pending_approval" ? "Aguardando aprovação" : skill.status === "archived" ? "Arquivada" : "Rascunho"; return `v${skill.version} · ${state}`; }
export function brandSkillsOf(skills: BrandSkillRecord[], brandId: string) { return skills.filter(skill => skill.brandId === brandId); }
export function latestBrandSkillVersions(skills: BrandSkillRecord[], brandId: string) { const latest = new Map<string, BrandSkillRecord>(); for (const skill of brandSkillsOf(skills, brandId)) { const current = latest.get(skill.definitionKey); if (!current || skill.version > current.version) latest.set(skill.definitionKey, skill); } return [...latest.values()]; }
export function filterBrandSkills(input: { skills: BrandSkillRecord[]; brandId: string; filters: BrandSkillFilters }) { const term = input.filters.search.trim().toLowerCase(); return latestBrandSkillVersions(input.skills, input.brandId).filter(skill => input.filters.definitionKey === "all" || skill.definitionKey === input.filters.definitionKey).filter(skill => input.filters.status === "all" || skill.status === input.filters.status).filter(skill => input.filters.consumer === "all" || isSkillRecommendedForModule(skill, input.filters.consumer)).filter(skill => !term || `${skill.name} ${skill.definitionKey} ${skill.sourceFilename}`.toLowerCase().includes(term)).sort((left, right) => left.name.localeCompare(right.name, "pt-BR")); }
export function versionsOfDefinition(skills: BrandSkillRecord[], brandId: string, definitionKey: string) { return brandSkillsOf(skills, brandId).filter(skill => skill.definitionKey === definitionKey).sort((left, right) => right.version - left.version); }
