import { BrandDNASchema } from "../arquiteto/contracts.ts";
import { createVersionEnvelope } from "../arquiteto/versioning.ts";
import { BrandDnaDraftSchema, type BrandDnaDraft } from "./contracts.ts";

export function splitLines(value: string) {
  return value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
}

export function joinLines(value: string[]) {
  return value.join("\n");
}

export function createBrandDnaDraft(input: Partial<BrandDnaDraft> & Pick<BrandDnaDraft, "brandId">): BrandDnaDraft {
  return BrandDnaDraftSchema.parse({
    schemaVersion: 1,
    brandId: input.brandId,
    positioning: input.positioning || "",
    audience: input.audience || [],
    voice: input.voice || [],
    businessObjectives: input.businessObjectives || [],
    differentiators: input.differentiators || [],
    prohibitedClaims: input.prohibitedClaims || [],
    editorialPrinciples: input.editorialPrinciples || [],
  });
}

export function validateBrandDnaDraft(draft: BrandDnaDraft) {
  const result = BrandDNASchema.safeParse(draft);
  if (result.success) return result;
  return result;
}

export async function createBrandDnaVersion(input: {
  brandId: string;
  versionNumber: number;
  previousVersionId?: string | null;
  payload: BrandDnaDraft;
  createdBy: string;
  changeReason: string;
}) {
  const payload = BrandDNASchema.parse(input.payload);
  if (payload.brandId !== input.brandId) throw new Error("O BrandDNA não pertence à marca informada.");
  return createVersionEnvelope({
    entityId: `brand:${input.brandId}`,
    versionNumber: input.versionNumber,
    previousVersionId: input.previousVersionId,
    origin: "human",
    changeReason: input.changeReason,
    createdBy: input.createdBy,
    payload,
  });
}

export function effectiveBrandDnaVersionId(versionIds: string[], events: Array<{ versionId: string; status: string }>) {
  const statusByVersion = new Map<string, string>();
  for (const event of events) statusByVersion.set(event.versionId, event.status);
  return versionIds.find(versionId => statusByVersion.get(versionId) === "approved") || null;
}
