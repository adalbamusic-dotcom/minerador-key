import type { BrandContextPack } from "../marca/brand-context-pack.ts";
import { buildBrandAIContext, type AppliedBrandSkillRef } from "../marca/brand-ai-context.ts";

/** Planejador adapter; the current Planner has no provider call, so this is its prepared entry point. */
export function buildPlannerAIContext(pack: BrandContextPack) {
  if (pack.module !== "planejador") throw new Error("O contexto de IA do Planejador exige module=planejador.");
  if (pack.purpose !== "content-plan") throw new Error("O contexto de IA do Planejador exige purpose=content-plan.");
  return buildBrandAIContext(pack);
}

/** Full Markdown stays in the request context; ContentPlan receives compact provenance only after actual use. */
export function toPlannerAppliedSkillSources(input: { brandId: string; refs: AppliedBrandSkillRef[] }) {
  return input.refs.map(ref => ({ id: `brand-skill:${ref.definitionKey}:${ref.versionId || ref.versionNumber}`, brandId: input.brandId, sourceType: "skill" as const, versionId: ref.versionId, definitionKey: ref.definitionKey, versionNumber: ref.versionNumber, contentHash: ref.contentHash, label: ref.definitionKey, purpose: "content-plan", origin: "brand_skill", applied: true, humanDecision: null }));
}
