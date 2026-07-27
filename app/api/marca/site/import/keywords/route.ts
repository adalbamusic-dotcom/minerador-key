import { NextResponse } from "next/server";
import { z } from "zod";
import { assertListaBelongsToMarca, authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { SiteKeywordArchitectureStatusSchema, SiteKeywordSourceFieldSchema, SiteKeywordSuggestedRoleSchema, SiteKeywordUrlRelationSchema, SitePublicationStatusSchema, SiteVerificationStatusSchema } from "@/lib/marca/site-contracts";
import { assertAllowedExternalUrl } from "@/lib/marca/site-security";
import { importSiteKeywordsToMinerador } from "@/lib/marca/site-minerador-import";

const CandidateSchema = z.object({ id: z.string().uuid(), brandId: z.string().uuid(), text: z.string().trim().min(1), normalizedText: z.string().trim().min(1), sourceUrl: z.string().url(), sourceField: SiteKeywordSourceFieldSchema, sourceFields: z.array(SiteKeywordSourceFieldSchema).default([]), suggestedRole: SiteKeywordSuggestedRoleSchema, slugCoherence: z.enum(["high", "medium", "low", "unknown"]).default("unknown"), urlSituation: SiteVerificationStatusSchema.default("unverified"), publicationStatus: SitePublicationStatusSchema.default("not_confirmed"), keywordUrlRelation: SiteKeywordUrlRelationSchema.default("undefined"), architectureStatus: SiteKeywordArchitectureStatusSchema.default("awaiting_architecture"), relationConfirmedBy: z.string().nullable().optional(), relationConfirmedAt: z.string().datetime().nullable().optional(), extractedAt: z.string().datetime().nullable().optional(), resolvedUrl: z.string().url().nullable().optional(), declaredCanonicalUrl: z.string().url().nullable().optional(), confidence: z.enum(["high", "medium", "low"]), catalogEntryId: z.string().uuid() });
const InputSchema = z.object({ brandId: z.string().uuid(), targetListId: z.string().uuid(), batchId: z.string().uuid(), candidates: z.array(CandidateSchema).min(1).max(500) });

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    if (input.candidates.some(candidate => candidate.brandId !== input.brandId)) throw new Error("A candidata não pertence à marca ativa.");
    const brand = await authorizedSiteBrand(input.brandId);
    const brandId = brand.brandId;
    await assertListaBelongsToMarca(input.targetListId, brandId, brand.profile);
    const { data: targetList, error: targetListError } = await brand.profile.supabase.from("listas_kgr").select("id,nome,marca_id").eq("id", input.targetListId).eq("marca_id", brandId).maybeSingle();
    if (targetListError) throw targetListError;
    if (!targetList) throw new Error("A lista de destino não foi localizada para a marca ativa.");
    input.candidates.forEach(candidate => assertAllowedExternalUrl(candidate.sourceUrl, brand.primaryHost));
    const result = await importSiteKeywordsToMinerador({
      brandId,
      targetListId: input.targetListId,
      candidates: input.candidates,
      importBatchId: input.batchId,
      requestedBy: brand.profile.userId,
      targetListName: targetList.nome,
      repository: {
        validateDestination: async (requestedBrandId, targetListId) => assertListaBelongsToMarca(targetListId, requestedBrandId, brand.profile),
        findByList: async (requestedBrandId, targetListId) => {
          if (requestedBrandId !== brandId) throw new Error("A marca da importacao nao corresponde ao tenant autorizado.");
          const { data, error } = await brand.profile.supabase.from("keywords_kgr").select("id,brand_id,keyword,status,analise_semantica").eq("lista_id", targetListId).eq("brand_id", brandId);
          if (error) throw error;
          return data || [];
        },
        updateKeywordEvidence: async ({ id, brandId: requestedBrandId, analise_semantica }) => {
          if (requestedBrandId !== brandId) throw new Error("A marca da atualizacao nao corresponde ao tenant autorizado.");
          const { error } = await brand.profile.supabase.from("keywords_kgr").update({ analise_semantica }).eq("id", id).eq("brand_id", brandId);
          if (error) throw error;
        },
        insertKeyword: async payload => {
          const { data, error } = await brand.profile.supabase.from("keywords_kgr").insert({ ...payload, brand_id: brandId }).select("id,keyword,brand_id").single();
          if (error) throw error;
          if (!data?.id) throw new Error("O Minerador não retornou o ID real da keyword persistida.");
          return { id: data.id, brand_id: data.brand_id || brandId, keyword: data.keyword };
        },
      },
    });
    return NextResponse.json({
      ...result,
      imported: result.inserted.map(item => item.candidateId),
      alreadyExists: result.existing.map(item => item.candidateId),
      duplicateInBatch: result.items.filter(item => item.outcome === "duplicate_in_batch").map(item => item.candidateId),
    });
  } catch (error) {
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status === 500 ? 422 : mapped.status });
  }
}
