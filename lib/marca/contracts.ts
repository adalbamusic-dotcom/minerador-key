import { z } from "zod";
import { BrandDNASchema, VersionedBrandDNASchema } from "../arquiteto/contracts.ts";

export const BrandStatusSchema = z.enum(["active", "inactive", "archived"]);

export const BrandSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).optional(),
  status: BrandStatusSchema,
  ownerUserId: z.string().min(1),
  activeBrandDnaVersionId: z.string().min(1).optional(),
  defaultLocale: z.string().min(1).optional(),
  defaultCountry: z.string().min(1).optional(),
  defaultTimezone: z.string().min(1).optional(),
  primaryDomain: z.string().url().optional(),
  additionalDomains: z.array(z.string().url()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const BrandDnaDraftSchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  positioning: z.string(),
  audience: z.array(z.string()),
  voice: z.array(z.string()),
  businessObjectives: z.array(z.string()),
  differentiators: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  editorialPrinciples: z.array(z.string()),
});

export const BrandDnaSaveRequestSchema = z.object({
  action: z.enum(["save", "approve"]),
  brandId: z.string().uuid(),
  versionId: z.string().min(1).optional(),
  payload: BrandDnaDraftSchema.optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

export type Brand = z.infer<typeof BrandSchema>;
export type BrandDnaDraft = z.infer<typeof BrandDnaDraftSchema>;
export type BrandDNA = z.infer<typeof BrandDNASchema>;
export type VersionedBrandDNA = z.infer<typeof VersionedBrandDNASchema>;

