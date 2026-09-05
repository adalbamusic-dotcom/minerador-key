import { z } from "zod";
import { SkillDefinitionModuleSchema } from "./skill-definitions.ts";

export const BrandSkillStatusSchema = z.enum(["draft", "pending_approval", "active", "archived"]);

export const NormalizedSkillSectionSchema = z.object({ heading: z.string(), key: z.string(), body: z.string() });

/** Diagnóstico de estrutura: orienta a leitura, nunca bloqueia conteúdo Markdown tecnicamente válido. */
export const SkillSectionDiagnosticSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  importance: z.enum(["recommended", "optional"]),
  match: z.enum(["matched", "alias_matched", "not_found"]),
  matchedHeading: z.string().nullable(),
});

export const NormalizedSkillContentSchema = z.object({
  definitionKey: z.string().min(1),
  title: z.string().nullable(),
  sections: z.array(NormalizedSkillSectionSchema),
  sectionDiagnostics: z.array(SkillSectionDiagnosticSchema),
  extraSections: z.array(z.string()),
});

export const BrandSkillProvenanceSchema = z.object({
  importedBy: z.string().min(1),
  importedAt: z.string().datetime(),
  sourceByteSize: z.number().int().nonnegative(),
  previousContentHash: z.string().nullable(),
  previousVersion: z.number().int().positive().nullable(),
});

export const BrandSkillSchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  definitionKey: z.string().min(1),
  name: z.string().trim().min(1),
  originalMarkdown: z.string().min(1),
  normalizedContent: NormalizedSkillContentSchema,
  structureDiagnostics: z.array(SkillSectionDiagnosticSchema),
  sourceFilename: z.string().trim().min(1),
  contentHash: z.string().min(1),
  version: z.number().int().positive(),
  status: BrandSkillStatusSchema,
  provenance: BrandSkillProvenanceSchema,
  /** Identificador técnico da versão persistida; nunca substitui a identidade lógica. */
  versionId: z.string().uuid().nullable().optional(),
});

/** Payload compartilhado entre editor e Route Handler. Dados técnicos são anexados no servidor. */
export const BrandSkillSavePayloadSchema = z.object({
  definitionKey: z.string().min(1),
  name: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  markdown: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  mimeType: z.string().nullable().optional(),
  expectedPreviousVersionId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const BrandSkillActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), brandId: z.string().uuid(), payload: BrandSkillSavePayloadSchema }),
  z.object({ action: z.enum(["submit", "approve", "archive"]), brandId: z.string().uuid(), versionId: z.string().uuid(), reason: z.string().trim().max(500).optional() }),
]);

export type BrandSkillStatus = z.infer<typeof BrandSkillStatusSchema>;
export type NormalizedSkillSection = z.infer<typeof NormalizedSkillSectionSchema>;
export type SkillSectionDiagnostic = z.infer<typeof SkillSectionDiagnosticSchema>;
export type NormalizedSkillContent = z.infer<typeof NormalizedSkillContentSchema>;
export type BrandSkillProvenance = z.infer<typeof BrandSkillProvenanceSchema>;
export type BrandSkillRecord = z.infer<typeof BrandSkillSchema>;
export type BrandSkillSavePayload = z.infer<typeof BrandSkillSavePayloadSchema>;
export type BrandSkillActionRequest = z.infer<typeof BrandSkillActionRequestSchema>;

/**
 * Conteúdo corrente resolvido para o consumidor. A disponibilidade é uma
 * leitura tenantizada da versão válida; `applied` continua decisão da operação.
 */
export const BrandSkillReferenceSchema = z.object({
  brandId: z.string().min(1), definitionKey: z.string().min(1), name: z.string().min(1),
  originalMarkdown: z.string().min(1), normalizedContent: NormalizedSkillContentSchema,
  structureDiagnostics: z.array(SkillSectionDiagnosticSchema), sourceFilename: z.string().min(1),
  versionId: z.string().uuid().nullable(), version: z.number().int().positive(), contentHash: z.string().min(1), lifecycleStatus: BrandSkillStatusSchema, provenance: BrandSkillProvenanceSchema,
  consumerModules: z.array(SkillDefinitionModuleSchema), applied: z.literal(false),
});
export type BrandSkillReference = z.infer<typeof BrandSkillReferenceSchema>;
