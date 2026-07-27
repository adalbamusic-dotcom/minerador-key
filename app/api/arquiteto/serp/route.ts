import { NextResponse } from "next/server";
import { z } from "zod";
import { ProvisionalArticleGroupSchema } from "@/lib/arquiteto/contracts";
import { articleKeywordReference } from "@/lib/arquiteto/adapters";
import { buildSerpFormationAssessment, resolveSerpValidationProfile } from "@/lib/arquiteto/serp-formation";
import { resolveArticleSerpIdentityContext } from "@/lib/arquiteto/identity-context";
import { explicitEditorialFormat, normalizeSearchIntent } from "@/lib/arquiteto/intent-profile";
import { collectSerperSnapshot, SerperProviderError } from "@/lib/radar/serper-provider-core";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { authzErrorResponse, requireSessionProfile } from "@/lib/server/authz";

const RequestSchema = z.object({
  brandId: z.string().min(1),
  groups: z.array(ProvisionalArticleGroupSchema).min(1).max(20),
  location: z.string().trim().min(1).default("Brasil"),
  language: z.string().trim().min(2).default("pt-br"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  resultLimit: z.number().int().positive().max(100).default(10),
  articleDnaVersionIds: z.record(z.string(), z.string().min(1)).optional(),
  previousAssessments: z.record(z.string(), z.object({ id: z.string().min(1), version: z.number().int().positive() })).optional(),
});

export async function POST(request: Request) {
  try {
    const profile = await requireSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido de SERP inválido.", issues: parsed.error.flatten() }, { status: 400 });
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");

    const groups = parsed.data.groups;
    const totalKeywords = groups.reduce((total, group) => total + group.keywords.length, 0);
    if (groups.some(group => group.keywords.length !== group.keywordIds.length)) {
      return NextResponse.json({ success: false, error: "O grupo contém keywords divergentes entre IDs e objetos." }, { status: 422 });
    }
    const assessments = await Promise.all(groups.map(async group => {
      const articleId = group.publishedAnchorId || group.id;
      const articleDnaVersionId = parsed.data.articleDnaVersionIds?.[articleId] || `work:${articleId}`;
      const principalId = group.principalSuggestion.keywordId;
      const principal = group.keywords.find(keyword => keyword.id === principalId);
      const identityContext = resolveArticleSerpIdentityContext({
        published: Boolean(group.publishedAnchorId),
        principalKeywordId: principalId,
        primaryKeywordPolicy: principal?.primaryKeywordPolicy,
        keywordUrlRelation: principal?.keywordUrlRelation,
        architectureStatus: group.architectureStatus || principal?.architectureStatus,
        kgrIdentity: group.kgrIdentity || principal?.kgrIdentity,
        slug: principal?.slug_sugerido,
      });
      const references = group.keywords.map(keyword => articleKeywordReference(keyword,
        keyword.id === principalId ? "principal" : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria", parsed.data.brandId));
      const validationProfile = resolveSerpValidationProfile(identityContext.mode, identityContext.kgrIdentityProtected);
      const collect = (keyword: typeof group.keywords[number], index: number) => {
        const reference = references[index];
        if (!reference) throw new Error(`Referência ausente para ${keyword.id}.`);
        return collectSerperSnapshot({
          brandId: parsed.data.brandId, articleId, articleDnaVersionId, keywordId: keyword.id,
          keywordDnaVersionId: reference.keywordDnaVersionId, keyword: keyword.keyword,
          location: parsed.data.location, language: parsed.data.language, device: parsed.data.device,
          expectedIntent: normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal), expectedFormat: explicitEditorialFormat(keyword) || "",
          requiredTopics: [keyword.keyword], articleEntities: [], resultLimit: parsed.data.resultLimit,
          version: 1, previousSnapshotId: null,
        });
      };
      const principalIndex = group.keywords.findIndex(keyword => keyword.id === principalId);
      if (principalIndex < 0) throw new Error("KeywordDNA principal ausente no grupo.");
      const principalSnapshot = await collect(group.keywords[principalIndex], principalIndex);
      const snapshots = [principalSnapshot];
      const principalAmbiguous = principalSnapshot.diagnostic.verdict === "possivel_conflito"
        || principalSnapshot.diagnostic.verdict === "parcialmente_coerente"
        || principalSnapshot.diagnostic.verdict === "informacao_insuficiente"
        || principalSnapshot.diagnostic.confidence === "low"
        || principalSnapshot.diagnostic.confidence === "insufficient";
      if (validationProfile !== "kgr_light" || principalAmbiguous) {
        const secondarySnapshots = await Promise.all(group.keywords.map((keyword, index) => index === principalIndex ? null : collect(keyword, index)));
        snapshots.push(...secondarySnapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot)));
      }
      const keywordDnaReferences = references.map(reference => reference.keywordDnaSnapshot).filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
      if (keywordDnaReferences.length !== references.length) throw new Error("KeywordDNA integral ausente na formação do assessment.");
      const previous = parsed.data.previousAssessments?.[articleId];
      return buildSerpFormationAssessment({ brandId: parsed.data.brandId, articleId, articleDnaVersionId, createdBy: profile.userId,
        previousVersionId: previous?.id || null, previousVersion: previous?.version || 0,
        principalKeywordId: principalId, assessmentMode: identityContext.mode, validationProfile, keywordReferences: references, keywordDnaReferences, snapshots,
        queriedKeywordDnaIds: snapshots.map(snapshot => snapshot.keywordId) });
    }));
    return NextResponse.json({ success: true, data: { assessments, queryCount: assessments.reduce((total, assessment) => total + assessment.queryCount, 0), requestedKeywordCount: totalKeywords, mode: "keyword_individual" } });
  } catch (error) {
    if (error instanceof SerperProviderError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
