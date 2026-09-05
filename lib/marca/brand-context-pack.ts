import type { BrandDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { BrandMaterial, BrandPrompt } from "../editorial/operational-contracts.ts";
import { selectAvailableSkills, toBrandSkillReference } from "./brand-skill-domain.ts";
import type { BrandSkillRecord, BrandSkillReference } from "./brand-skill-contracts.ts";
import type { SkillDefinitionModule } from "./skill-definitions.ts";

/**
 * Resolver compartilhado do contexto da Marca.
 *
 * Regras de fronteira:
 * - a voz canônica vem sempre do BrandDNA aprovado; Skills apenas a operacionalizam;
 * - tudo é filtrado por `brandId`; não existe fallback para outra marca;
 * - `available !== applied`: o pacote lista o que está disponível, a aplicação
 *   continua sendo decisão do módulo consumidor e do humano;
 * - o consumidor recebe somente a versão corrente, válida e não arquivada da
 *   própria Marca; lifecycle e recomendações de consumidor não são autorização;
 * - `applied` só passa a existir quando a operação inclui a Skill no prompt.
 */

export type BrandContextModule = SkillDefinitionModule;

export interface BrandPromptReference {
  promptId: string;
  brandId: string;
  name: string;
  purpose: string;
  scope: BrandPrompt["scope"];
  skillId: string | null;
  applied: false;
}

export interface BrandMaterialReference {
  materialId: string;
  brandId: string;
  name: string;
  type: BrandMaterial["type"];
  status: BrandMaterial["status"];
  applied: false;
}

export interface BrandContextPack {
  brandId: string;
  module: BrandContextModule;
  purpose: string | null;
  voiceCanonicalSource: "brand_dna";
  brandDna: {
    versionId: string;
    contentHash: string;
    status: "approved";
    positioning: string;
    audience: string[];
    voice: string[];
    businessObjectives: string[];
    differentiators: string[];
    prohibitedClaims: string[];
    editorialPrinciples: string[];
  } | null;
  skills: BrandSkillReference[];
  prompts: BrandPromptReference[];
  materials: BrandMaterialReference[];
  provenance: {
    brandDnaVersionId: string | null;
    skillVersions: Array<{ definitionKey: string; version: number; contentHash: string }>;
    resolvedAt: string;
  };
  missing: string[];
}


export function getBrandContextPack(input: {
  brandId: string;
  module: BrandContextModule;
  purpose?: string | null;
  /** Envelope do BrandDNA já resolvido como aprovado pelo chamador. */
  approvedBrandDna?: VersionEnvelope<BrandDNA> | null;
  skills?: BrandSkillRecord[];
  prompts?: BrandPrompt[];
  materials?: BrandMaterial[];
  now?: string;
}): BrandContextPack {
  const purpose = input.purpose?.trim() || null;
  const envelope = input.approvedBrandDna && input.approvedBrandDna.payload.brandId === input.brandId ? input.approvedBrandDna : null;
  const skills = selectAvailableSkills({ skills: input.skills || [], brandId: input.brandId, module: input.module }).map(toBrandSkillReference);
  const prompts: BrandPromptReference[] = (input.prompts || [])
    .filter(prompt => prompt.brandId === input.brandId && prompt.status === "approved")
    .map(prompt => ({ promptId: prompt.id, brandId: prompt.brandId, name: prompt.name, purpose: prompt.purpose, scope: prompt.scope, skillId: prompt.skillId, applied: false }));
  const materials: BrandMaterialReference[] = (input.materials || [])
    .filter(material => material.brandId === input.brandId && material.status !== "missing")
    .map(material => ({ materialId: material.id, brandId: material.brandId, name: material.name, type: material.type, status: material.status, applied: false }));

  const missing: string[] = [];
  if (!envelope) missing.push("BrandDNA aprovado não disponível; a voz canônica da marca não pode ser resolvida.");
  if (!skills.length) missing.push(`Nenhuma Skill corrente disponível para ${input.module}.`);

  return {
    brandId: input.brandId,
    module: input.module,
    purpose,
    voiceCanonicalSource: "brand_dna",
    brandDna: envelope
      ? {
        versionId: envelope.versionId,
        contentHash: envelope.contentHash,
        status: "approved",
        positioning: envelope.payload.positioning,
        audience: envelope.payload.audience,
        voice: envelope.payload.voice,
        businessObjectives: envelope.payload.businessObjectives,
        differentiators: envelope.payload.differentiators,
        prohibitedClaims: envelope.payload.prohibitedClaims,
        editorialPrinciples: envelope.payload.editorialPrinciples,
      }
      : null,
    skills,
    prompts,
    materials,
    provenance: {
      brandDnaVersionId: envelope?.versionId || null,
      skillVersions: skills.map(skill => ({ definitionKey: skill.definitionKey, version: skill.version, contentHash: skill.contentHash })),
      resolvedAt: input.now || new Date().toISOString(),
    },
    missing,
  };
}
