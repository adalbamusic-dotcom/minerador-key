import type { BrandDNA, ContentPlanContextSource, ContentPlanDetails, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { BrandMaterial, BrandPrompt, BrandSkill } from "../editorial/operational-contracts.ts";

type LegacyBrand = {
  id: string;
  nome: string;
  nicho?: string | null;
  dna_diretrizes?: string | null;
};

export type PlannerStrategicSourceType = ContentPlanContextSource["sourceType"];

export interface PlannerStrategicSource {
  id: string;
  sourceType: PlannerStrategicSourceType;
  label: string;
  purpose: string;
  origin: string;
  versionId: string | null;
  selected: boolean;
}

export interface PlannerStrategicContext {
  brandId: string;
  brandName: string;
  positioning: string | null;
  audience: string[];
  voice: string[];
  businessObjectives: string[];
  differentiators: string[];
  prohibitedClaims: string[];
  editorialPrinciples: string[];
  brandDnaVersionId: string | null;
  brandDnaStatus: "approved" | "unavailable" | "legacy";
  materials: Array<PlannerStrategicSource & { status: BrandMaterial["status"] }>;
  skills: Array<PlannerStrategicSource & { skill: BrandSkill }>;
  prompts: Array<PlannerStrategicSource & { prompt: Pick<BrandPrompt, "id" | "name" | "purpose" | "scope" | "skillId" | "status" | "origin"> }>;
  sourceRefs: PlannerStrategicSource[];
  missing: string[];
}

export type PlannerBrandDnaEnvelope = VersionEnvelope<BrandDNA>;

function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function sourceRef(input: Omit<PlannerStrategicSource, "selected">): PlannerStrategicSource {
  return { ...input, selected: false };
}

export function selectApprovedBrandDna(input: {
  versions: PlannerBrandDnaEnvelope[];
  events: Array<{ versionId: string; status: string }>;
  activeVersionId?: string | null;
  brandId: string;
}) {
  const statusByVersion = new Map<string, string>();
  for (const event of input.events) statusByVersion.set(event.versionId, event.status);
  const candidates = input.versions.filter(version => version.payload.brandId === input.brandId && statusByVersion.get(version.versionId) === "approved");
  return candidates.find(version => version.versionId === input.activeVersionId) || candidates[0] || null;
}

export function buildPlannerStrategicContext(input: {
  brandId: string;
  brand: LegacyBrand;
  brandDna?: PlannerBrandDnaEnvelope | null;
  materials?: BrandMaterial[];
  skills?: BrandSkill[];
  prompts?: BrandPrompt[];
  selectedSourceIds?: string[];
}): PlannerStrategicContext {
  const dna = input.brandDna?.payload.brandId === input.brandId ? input.brandDna.payload : null;
  const selected = new Set(input.selectedSourceIds || []);
  const materials = (input.materials || [])
    .filter(material => material.brandId === input.brandId && material.status !== "missing")
    .map(material => ({
      ...sourceRef({ id: material.id, sourceType: "material" as const, label: material.name, purpose: `Material ${material.type} disponível para consulta.`, origin: material.origin, versionId: null }),
      selected: selected.has(material.id), status: material.status,
    }));
  const skills = (input.skills || [])
    .filter(skill => skill.brandId === input.brandId && skill.status !== "archived")
    .map(skill => ({
      ...sourceRef({ id: skill.id, sourceType: "skill" as const, label: skill.name, purpose: skill.description || "Regra editorial da marca.", origin: skill.origin, versionId: null }),
      selected: selected.has(skill.id), skill,
    }));
  const prompts = (input.prompts || [])
    .filter(prompt => prompt.brandId === input.brandId && prompt.status !== "archived")
    .map(prompt => ({
      ...sourceRef({ id: prompt.id, sourceType: "prompt" as const, label: prompt.name, purpose: prompt.purpose || "Orientação da marca.", origin: prompt.origin, versionId: null }),
      selected: selected.has(prompt.id), prompt: { id: prompt.id, name: prompt.name, purpose: prompt.purpose, scope: prompt.scope, skillId: prompt.skillId, status: prompt.status, origin: prompt.origin },
    }));
  const sourceRefs: PlannerStrategicSource[] = [
    ...(dna ? [sourceRef({ id: `brand-dna:${input.brandDna!.versionId}`, sourceType: "brand_dna" as const, label: "BrandDNA aprovado", purpose: "Posicionamento, público, voz e princípios editoriais da marca.", origin: input.brandDna!.origin, versionId: input.brandDna!.versionId })] : [sourceRef({ id: `legacy-brand:${input.brandId}`, sourceType: "legacy_brand" as const, label: "Contexto cadastrado da marca", purpose: "Contexto legado disponível enquanto o BrandDNA aprovado não está carregado.", origin: "legacy", versionId: null })]),
    ...materials,
    ...skills,
    ...prompts,
  ];
  const missing: string[] = [];
  if (!dna && !input.brand.dna_diretrizes?.trim()) missing.push("BrandDNA aprovado ou diretrizes cadastradas não estão disponíveis.");
  if (!dna) missing.push("A voz estruturada da marca ainda não foi carregada.");
  if (!materials.length) missing.push("Nenhum material da marca disponível para seleção.");
  if (!skills.length) missing.push("Nenhuma Skill da marca disponível para seleção.");
  return {
    brandId: input.brandId,
    brandName: input.brand.nome,
    positioning: dna?.positioning || input.brand.dna_diretrizes || input.brand.nicho || null,
    audience: dna?.audience || [],
    voice: dna?.voice || [],
    businessObjectives: dna?.businessObjectives || [],
    differentiators: dna?.differentiators || [],
    prohibitedClaims: dna?.prohibitedClaims || [],
    editorialPrinciples: dna?.editorialPrinciples || [],
    brandDnaVersionId: input.brandDna?.versionId || null,
    brandDnaStatus: dna ? "approved" : input.brand.dna_diretrizes ? "legacy" : "unavailable",
    materials,
    skills,
    prompts,
    sourceRefs: sourceRefs.map(ref => ({ ...ref, selected: ref.sourceType === "brand_dna" || ref.sourceType === "legacy_brand" ? true : ref.selected })),
    missing: unique(missing),
  };
}

function isGeneratedPlaceholder(value: string) {
  return !value.trim() || /pendente de revis|definir a fronteira|h1 pendente/i.test(value);
}

function toContentSource(source: PlannerStrategicSource, brandId: string, applied: boolean, humanDecision: string | null): ContentPlanContextSource {
  return { id: source.id, brandId, sourceType: source.sourceType, versionId: source.versionId, label: source.label, purpose: source.purpose, origin: source.origin, applied, humanDecision };
}

export function applyStrategicContext(input: {
  details: ContentPlanDetails;
  context: PlannerStrategicContext;
  selectedSourceIds: string[];
  now?: string;
}) {
  const selectedIds = new Set(input.selectedSourceIds);
  const selectedSkills = input.context.skills.filter(skill => selectedIds.has(skill.id));
  const selectedPrompts = input.context.prompts.filter(prompt => selectedIds.has(prompt.id));
  const selectedMaterials = input.context.materials.filter(material => selectedIds.has(material.id));
  const selectedSources = input.context.sourceRefs.filter(source => source.sourceType === "brand_dna" || source.sourceType === "legacy_brand" || selectedIds.has(source.id));
  const conflicts: string[] = [];
  const differentiation = input.details.strategy.differentiation.length ? input.details.strategy.differentiation : input.context.differentiators;
  if (input.details.strategy.differentiation.length && input.context.differentiators.length) conflicts.push("Os diferenciais já decididos foram preservados; revise a sugestão da marca se necessário.");
  const boundary = isGeneratedPlaceholder(input.details.strategy.boundary) && input.context.prohibitedClaims.length
    ? `Evitar: ${input.context.prohibitedClaims.join("; ")}.`
    : input.details.strategy.boundary;
  if (!isGeneratedPlaceholder(input.details.strategy.boundary) && input.context.prohibitedClaims.length) conflicts.push("A fronteira humana já definida foi preservada; as restrições da marca continuam como referência.");
  const humanDecision = "Contexto aplicado à cópia de trabalho; decisões humanas existentes foram preservadas.";
  const existingRefs = input.details.strategyContext?.sourceRefs || [];
  const refsById = new Map(existingRefs.map(ref => [ref.id, ref]));
  for (const source of selectedSources) refsById.set(source.id, toContentSource(source, input.context.brandId, true, null));
  return {
    ...input.details,
    strategy: { ...input.details.strategy, differentiation, boundary, validationNotes: unique([...input.details.strategy.validationNotes, ...input.context.editorialPrinciples]) },
    skills: { skillIds: unique([...input.details.skills.skillIds, ...selectedSkills.map(skill => skill.skill.id)]), promptIds: unique([...input.details.skills.promptIds, ...selectedPrompts.map(prompt => prompt.prompt.id)]) },
    strategyContext: { sourceRefs: [...refsById.values()], applied: true, appliedAt: input.now || new Date().toISOString(), humanDecision, conflicts: unique([...(input.details.strategyContext?.conflicts || []), ...conflicts, ...selectedMaterials.map(material => `Material selecionado: ${material.label}.`)]), },
  } satisfies ContentPlanDetails;
}
