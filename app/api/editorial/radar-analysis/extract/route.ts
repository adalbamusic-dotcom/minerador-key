import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VersionedRadarAnalysisSchema } from "@/lib/radar/analysis-contracts";
import { extractCompetitorPage, CompetitorExtractionError } from "@/lib/radar/competitor-extractor";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";

const InputSchema = z.object({
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  analysis: VersionedRadarAnalysisSchema,
  candidates: z.array(z.object({ key: z.string().min(1), url: z.string().url(), itemType: z.literal("organic"), decision: z.literal("included") }).strict()).min(1).max(5),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = InputSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    if (input.analysis.payload.brandId !== input.brandId || input.analysis.payload.articleId !== input.articleId) throw new AuthzError(409, "A análise não corresponde ao item Radar selecionado.");
    const allowedKeys = new Set(input.analysis.payload.serpDecisions.filter(decision => decision.itemType === "organic" && decision.decision === "included").map(decision => decision.key));
    if (input.candidates.some(candidate => !allowedKeys.has(candidate.key))) throw new AuthzError(409, "Somente URLs orgânicas já incluídas na curadoria podem ser extraídas.");
    const unique = [...new Map(input.candidates.map(candidate => [candidate.key, candidate])).values()];
    const pages = await Promise.all(unique.map(async candidate => {
      try {
        return { key: candidate.key, page: await extractCompetitorPage(candidate.url) };
      } catch (error) {
        const extractionError = error instanceof CompetitorExtractionError ? error : new CompetitorExtractionError("fetch_failed", "Falha na extração.", 502);
        return { key: candidate.key, error: { code: extractionError.code, message: extractionError.message, status: extractionError.status, url: candidate.url } };
      }
    }));
    return NextResponse.json({ pages: pages.filter(result => "page" in result), errors: pages.filter(result => "error" in result), extractedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_request", error: "Solicitação de extração Radar inválida.", details: error.issues }, { status: 400 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_extraction_error", error: mapped.message }, { status: mapped.status });
  }
}
