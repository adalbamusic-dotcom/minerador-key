import { z } from "zod";

export const PublicationExportFormatSchema = z.enum(["markdown", "json", "csv"]);
export type PublicationExportFormat = z.infer<typeof PublicationExportFormatSchema>;

const ActionBaseSchema = z.object({
  brandId: z.string().min(1),
  publicationId: z.string().min(1),
  expectedLockVersion: z.number().int().positive(),
});

export const PublicationActionRequestSchema = z.discriminatedUnion("action", [
  ActionBaseSchema.extend({ action: z.literal("queue") }),
  ActionBaseSchema.extend({
    action: z.literal("record_export"),
    exportFileName: z.string().min(1).max(240),
    exportFormat: PublicationExportFormatSchema,
    documentHash: z.string().min(1),
  }),
  ActionBaseSchema.extend({
    action: z.literal("publish"),
    destination: z.string().min(1).max(240),
    destinationUrl: z.string().url(),
    documentHash: z.string().min(1).optional(),
  }),
  ActionBaseSchema.extend({ action: z.literal("request_update"), note: z.string().max(500).optional() }),
  ActionBaseSchema.extend({ action: z.literal("reedit"), note: z.string().max(500).optional() }),
]);
export type PublicationActionRequest = z.infer<typeof PublicationActionRequestSchema>;
export type PublicationAction = PublicationActionRequest extends infer T ? T extends object ? Omit<T, "brandId" | "publicationId" | "expectedLockVersion"> : never : never;
