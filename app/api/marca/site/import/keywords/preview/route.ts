import { NextResponse } from "next/server";
import { z } from "zod";
import { assertListaBelongsToMarca, authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { SiteKeywordArchitectureStatusSchema, SiteKeywordSourceFieldSchema, SiteKeywordSuggestedRoleSchema, SiteKeywordUrlRelationSchema, SitePublicationStatusSchema, SiteVerificationStatusSchema } from "@/lib/marca/site-contracts";
import { buildSiteKeywordImportPlan } from "@/lib/marca/site-keyword-flow";
import { assertAllowedExternalUrl } from "@/lib/marca/site-security";

const CandidateSchema = z.object({ id: z.string().uuid(), brandId: z.string().uuid(), text: z.string().trim().min(1), normalizedText: z.string().trim().min(1), sourceUrl: z.string().url(), sourceField: SiteKeywordSourceFieldSchema, sourceFields: z.array(SiteKeywordSourceFieldSchema).default([]), suggestedRole: SiteKeywordSuggestedRoleSchema, slugCoherence: z.enum(["high", "medium", "low", "unknown"]).default("unknown"), urlSituation: SiteVerificationStatusSchema.default("unverified"), publicationStatus: SitePublicationStatusSchema.default("not_confirmed"), keywordUrlRelation: SiteKeywordUrlRelationSchema.default("undefined"), architectureStatus: SiteKeywordArchitectureStatusSchema.default("awaiting_architecture"), relationConfirmedBy: z.string().nullable().optional(), relationConfirmedAt: z.string().datetime().nullable().optional(), extractedAt: z.string().datetime().nullable().optional(), resolvedUrl: z.string().url().nullable().optional(), declaredCanonicalUrl: z.string().url().nullable().optional(), confidence: z.enum(["high", "medium", "low"]), catalogEntryId: z.string().uuid() });
const InputSchema = z.object({ brandId: z.string().uuid(), targetListId: z.string().uuid(), batchId: z.string().uuid(), candidates: z.array(CandidateSchema).min(1).max(500) });

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    if (input.candidates.some(candidate => candidate.brandId !== input.brandId)) throw new Error("A candidata não pertence à marca ativa.");
    const brand = await authorizedSiteBrand(input.brandId);
    await assertListaBelongsToMarca(input.targetListId, input.brandId, brand.profile);
    input.candidates.forEach(candidate => assertAllowedExternalUrl(candidate.sourceUrl, brand.primaryHost));
    const { data: existingRows, error } = await brand.profile.supabase.from("keywords_kgr").select("id,brand_id,keyword").eq("lista_id", input.targetListId).eq("brand_id", brand.brandId);
    if (error) throw error;
    const plan = buildSiteKeywordImportPlan(input.candidates, existingRows || []);
    return NextResponse.json({ batchId: input.batchId, targetListId: input.targetListId, items: plan.items, summary: plan.summary, persisted: false, status: "preview" });
  } catch (error) {
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status === 500 ? 422 : mapped.status });
  }
}
