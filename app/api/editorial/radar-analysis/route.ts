import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analysisApprovalIssues, VersionedRadarAnalysisSchema } from "@/lib/radar/analysis-contracts";
import { WorkflowRepository } from "@/lib/server/editorial-repositories";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";

const InputSchema = z.object({
  action: z.literal("save"),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  expectedLock: z.number().int().positive(),
  analysis: VersionedRadarAnalysisSchema,
}).strict();

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = InputSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", input.analysis.payload.status === "approved" ? "approve" : "edit");
    if (input.analysis.payload.brandId !== input.brandId || input.analysis.payload.articleId !== input.articleId) throw new AuthzError(409, "A análise não corresponde ao item Radar selecionado.");
    if (input.analysis.payload.status === "approved") {
      const issues = analysisApprovalIssues(input.analysis);
      if (issues.length) return NextResponse.json({ code: "approval_blocked", error: "A análise ainda possui pendências.", issues }, { status: 409 });
    }
    const row = await new WorkflowRepository().appendRadarAnalysis(input.brandId, input.articleId, input.expectedLock, input.analysis, profile.userId);
    if (!row) throw new AuthzError(404, "Item Radar não encontrado para esta marca.");
    return NextResponse.json({ persistenceMode: "remote", versionId: input.analysis.versionId, lockVersion: row.lock_version });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_request", error: "Solicitação de análise Radar inválida.", details: error.issues }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message, recoverableLocally: true }, { status: 503 });
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: "optimistic_conflict", error: error.message }, { status: 409 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_analysis_error", error: mapped.message }, { status: mapped.status });
  }
}
