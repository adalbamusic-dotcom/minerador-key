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

const ReadbackQuerySchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  versionId: z.string().min(1).optional(),
}).strict();

function storedAnalyses(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as { analysisVersions?: unknown }).analysisVersions;
  return VersionedRadarAnalysisSchema.array().parse(Array.isArray(raw) ? raw : []);
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = ReadbackQuerySchema.parse({
      brandId: request.nextUrl.searchParams.get("brandId"),
      articleId: request.nextUrl.searchParams.get("articleId"),
      versionId: request.nextUrl.searchParams.get("versionId") || undefined,
    });
    await assertEditorialPermission(profile, input.brandId, "radar", "view");
    const current = await new WorkflowRepository().findByArticle(input.brandId, input.articleId, "radar");
    if (!current) return NextResponse.json({ code: "radar_item_not_found", error: "Item Radar não encontrado." }, { status: 404 });
    if (current.marca_id !== input.brandId || current.article_id !== input.articleId) return NextResponse.json({ code: "radar_identity_mismatch", error: "O item Radar não corresponde à marca ou ao artigo solicitado." }, { status: 409 });
    const analyses = storedAnalyses(current.payload);
    const selected = input.versionId ? analyses.find(analysis => analysis.versionId === input.versionId) : analyses.at(-1);
    if (input.versionId && !selected) return NextResponse.json({ code: "radar_analysis_not_found", error: "Versão da análise Radar não encontrada para este artigo." }, { status: 404 });
    const payloadRadarItemId = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) && typeof (current.payload as { id?: unknown }).id === "string" ? (current.payload as { id: string }).id : null;
    return NextResponse.json({ persistenceMode: "remote", readbackConfirmed: true, brandId: input.brandId, articleId: input.articleId, radarItemId: current.id, workflowRowId: current.id, payloadRadarItemId, lockVersion: current.lock_version, analysis: selected || null, analyses });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_readback_request", error: "Readback Radar inválido.", details: error.issues }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_analysis_readback_error", error: mapped.message }, { status: mapped.status });
  }
}

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
    const payloadRadarItemId = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) && typeof (row.payload as { id?: unknown }).id === "string" ? (row.payload as { id: string }).id : null;
    return NextResponse.json({ persistenceMode: "remote", versionId: input.analysis.versionId, lockVersion: row.lock_version, radarItemId: row.id, workflowRowId: row.id, payloadRadarItemId });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_request", error: "Solicitação de análise Radar inválida.", details: error.issues }, { status: 400 });
    /*
     * O 503 CARREGA A CAUSA — hotfix final.
     *
     * `reason` e `driver` viajam em `details`: sem eles, "não foi possível
     * conectar" cobria timeout de statement, payload grande demais e socket
     * derrubado sob a mesma frase, e cada clique custava outra rodada de
     * adivinhação.
     */
    if (error instanceof PersistenceUnavailableError) {
      console.error("[radar-analysis:persist]", error.reason, error.driver?.code || "", error.driver?.message || "");
      return NextResponse.json({ code: error.code, error: error.message, recoverableLocally: true, details: { reason: error.reason, driver: error.driver } }, { status: 503 });
    }
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: "optimistic_conflict", error: error.message }, { status: 409 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_analysis_error", error: mapped.message }, { status: mapped.status });
  }
}
