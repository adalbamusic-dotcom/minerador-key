import { z } from "zod";

/** Referência à fonte real do plano versionado em editorial_groups. */
export const PlannedSiloSourceRefSchema = z.object({
  kind: z.literal("editorial_group_plan"),
  groupId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  planHash: z.string().min(1).max(128).refine(value => value.trim().length > 0, "Hash do plano não pode estar vazio."),
  lockVersion: z.number().int().positive(),
}).strict();
export type PlannedSiloSourceRef = z.infer<typeof PlannedSiloSourceRefSchema>;

/** O lock protege a escrita inicial; versão/hash verificam a vigência durável. */
export function plannedSiloSourceIsCurrent(input: {
  brandId: string;
  source: PlannedSiloSourceRef | undefined;
  expectedSubjectProofs: readonly PlannedSiloSubjectProof[] | undefined;
  current: { brandId: string; groupId: string; origin: string; status: string; planVersion: number; planHash: string | null; subjectProofs: readonly PlannedSiloSubjectProof[] } | null | undefined;
}): boolean {
  const parsed = PlannedSiloSourceRefSchema.safeParse(input.source);
  const current = input.current;
  const expected = input.expectedSubjectProofs;
  const normalize = (proofs: readonly PlannedSiloSubjectProof[]) => proofs.map(proof => [proof.keywordId, proof.version, proof.contentHash, proof.approvedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return Boolean(parsed.success && input.brandId && current && expected && expected.length > 0 && current.brandId === input.brandId && current.groupId === parsed.data.groupId && current.origin === "declared_plan" && current.status === "active" && current.planVersion === parsed.data.planVersion && current.planHash === parsed.data.planHash && JSON.stringify(normalize(expected)) === JSON.stringify(normalize(current.subjectProofs)));
}

export type PlannedSiloSubjectProof = { keywordId: string; version: number; contentHash: string; approvedAt: string };
export type PlannedSiloCurrentSource = NonNullable<Parameters<typeof plannedSiloSourceIsCurrent>[0]["current"]>;

/** Identidade editorial estável, sem depender da keyword principal. */
export function plannedSiloMemberKey(brandId: string, anchorKind: "subject_keyword" | "existing_article", anchorId: string): string {
  return JSON.stringify([brandId, anchorKind, anchorId]);
}

export const PlannedSiloMemberSchema = z.object({
  memberKey: z.string().min(1),
  anchorKind: z.enum(["subject_keyword", "existing_article"]),
  anchorId: z.string().min(1),
  role: z.enum(["Pilar", "Suporte"]),
  order: z.number().int().positive(),
}).strict();
export type PlannedSiloMember = z.infer<typeof PlannedSiloMemberSchema>;
