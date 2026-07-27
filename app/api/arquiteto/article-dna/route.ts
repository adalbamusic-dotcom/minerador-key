import { NextResponse } from "next/server";
import { z } from "zod";
import { ArticleDNASchema, ProvisionalArticleGroupSchema, VersionReferenceSchema } from "@/lib/arquiteto/contracts";
import { deterministicArticleDnaPayload } from "@/lib/arquiteto/adapters";
import { normalizeArticleDnaProviderPayload } from "@/lib/arquiteto/article-dna-provider";
import { guardPublishedArticleProposal } from "@/lib/arquiteto/published-guard";
import { resolveArticleSerpIdentityContext } from "@/lib/arquiteto/identity-context";
import { createStatusEvent, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { MAX_KEYWORDS_PER_ARTICLE } from "@/lib/arquiteto/domain-rules";
import { inspectArticleFormation } from "@/lib/arquiteto/article-formation-rules";

const RequestSchema = z.object({
  groups: z.array(ProvisionalArticleGroupSchema).min(1).max(20),
  brand: z.object({ id: z.string().min(1), name: z.string(), niche: z.string().nullable().optional() }),
  serpAssessmentRefs: z.record(z.string(), VersionReferenceSchema).optional(),
});
const ResponseSchema = z.object({ articles: z.array(z.record(z.string(), z.unknown())).min(1) });

const SYSTEM_PROMPT = `Voce cria DNA editorial de artigos a partir de grupos ja organizados.
Nao escreva o artigo. Use IDs exatos. Preserve artigos publicados.
A keyword principal representa o contrato editorial, nao apenas o maior volume.
Defina cobertura, exclusoes e fronteira anti-canibalizacao com clareza operacional.
Toda decisao incerta vai em humanPendingDecisions. As referencias versionadas serao anexadas pelo servidor.
Retorne {"articles": [...]} em JSON valido, sem Markdown.
Cada item deve conter diretamente os campos do ArticleDNA. Nao envolva em articleDna, dna, payload, result ou data.`;

function buildArticleDnaUserPrompt(groups: z.infer<typeof RequestSchema>["groups"], brand: z.infer<typeof RequestSchema>["brand"]): string {
  // Envia apenas os campos que a IA precisa para gerar conteudo editorial.
  // Identidade (articleId, brandId, principalKeywordId, keywordReferences,
  // siloId, hierarchy) e definida pelo servidor — nao pedimos para a IA gerar.
  const compact = groups.map(group => ({
    principalKeyword: group.keywords.find(kw => kw.id === group.principalSuggestion.keywordId)?.keyword,
    keywords: group.keywords.map(kw => ({ id: kw.id, keyword: kw.keyword, intent: kw.intent, volume: kw.volume_search })),
    suggestedSiloName: group.suggestedSiloName,
    isPublished: Boolean(group.publishedAnchorId),
    alerts: group.alerts,
  }));
  return `Marca: ${brand.name}${brand.niche ? ` (${brand.niche})` : ""}.
Gere um ArticleDNA por grupo:\n${JSON.stringify(compact)}`;
}

export async function POST(req: Request) {
  try {
    const profile = await requireSessionProfile();
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Grupos invalidos.", issues: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.groups.some(group => group.keywordIds.length > MAX_KEYWORDS_PER_ARTICLE)) {
      return NextResponse.json({ success: false, error: `Reprocesse a logica: nenhum artigo pode ter mais de ${MAX_KEYWORDS_PER_ARTICLE} keywords.` }, { status: 422 });
    }
    const formationIssues = parsed.data.groups.flatMap(group => inspectArticleFormation(group, parsed.data.brand.id).map(issue => ({ groupId: group.id, ...issue })));
    if (formationIssues.length) {
      return NextResponse.json({ success: false, error: "A formação do artigo possui bloqueios estruturais.", issues: formationIssues }, { status: 422 });
    }
    const result = await generateStructuredAI({
      system: SYSTEM_PROMPT,
      user: buildArticleDnaUserPrompt(parsed.data.groups, parsed.data.brand),
      schema: ResponseSchema,
    });
    const versions = await Promise.all(result.articles.map(async (raw, index) => {
      const group = parsed.data.groups[index];
      if (!group) throw new StructuredAIError("A IA retornou mais artigos que grupos.", 422);
      const serpAssessmentRef = parsed.data.serpAssessmentRefs?.[group.publishedAnchorId || group.id];
      const base = deterministicArticleDnaPayload(group, parsed.data.brand.id);
      const provider = normalizeArticleDnaProviderPayload(raw);
      const principalId = group.principalSuggestion.keywordId;
      const keywordReferences = base.keywordReferences;
      const normalized = ArticleDNASchema.parse({ ...base, ...provider.payload, schemaVersion: 1, articleId: group.publishedAnchorId || group.id,
        brandId: parsed.data.brand.id, principalKeywordId: principalId, keywordReferences,
        secondaryKeywordIds: keywordReferences.filter(reference => reference.role === "secundaria").map(reference => reference.keywordId),
        narrativeReinforcementIds: keywordReferences.filter(reference => reference.role === "reforco_narrativo").map(reference => reference.keywordId),
        siloId: group.suggestedSiloId, hierarchy: group.suggestedHierarchy,
        intentProfile: base.intentProfile, mainIntent: base.mainIntent, volumeStrategy: base.volumeStrategy,
        hierarchyStrategy: base.hierarchyStrategy, strategicPurpose: base.strategicPurpose, unitClassification: base.unitClassification, unitPurpose: base.unitPurpose, serpStrategy: base.serpStrategy,
        primaryKeywordMetrics: base.primaryKeywordMetrics, primaryKeywordPolicy: base.primaryKeywordPolicy,
        ...(base.primaryKeywordPolicyContext ? { primaryKeywordPolicyContext: base.primaryKeywordPolicyContext } : {}),
        ...(base.primaryKeywordCandidates ? { primaryKeywordCandidates: base.primaryKeywordCandidates } : {}),
        ...(base.primaryKeywordDecision ? { primaryKeywordDecision: base.primaryKeywordDecision } : {}),
        ...(base.kgrIdentity ? { kgrIdentity: base.kgrIdentity } : {}),
        alerts: [...(provider.payload.alerts || base.alerts), ...provider.warnings],
        canonical: provider.payload.canonical ?? base.canonical, ...(serpAssessmentRef ? { serpAssessmentRef } : {}) });
      const anchor = group.keywords.find(keyword => keyword.id === group.publishedAnchorId || keyword.isPublished || keyword.status?.toLowerCase() === "publicado");
      const identityContext = resolveArticleSerpIdentityContext({
        published: Boolean(group.publishedAnchorId),
        principalKeywordId: principalId,
        primaryKeywordPolicy: group.keywords.find(keyword => keyword.id === principalId)?.primaryKeywordPolicy,
        keywordUrlRelation: group.keywords.find(keyword => keyword.id === principalId)?.keywordUrlRelation,
        architectureStatus: group.architectureStatus || group.keywords.find(keyword => keyword.id === principalId)?.architectureStatus,
        kgrIdentity: group.kgrIdentity || group.keywords.find(keyword => keyword.id === principalId)?.kgrIdentity,
        slug: anchor?.slug_sugerido || normalized.suggestedSlug,
      });
      const guarded = anchor ? guardPublishedArticleProposal({ articleId: normalized.articleId, isPublished: Boolean(group.publishedAnchorId),
        brandId: parsed.data.brand.id, siloId: anchor.lista_id || anchor.silo_id || null,
        principalKeywordId: anchor.id, slug: anchor.slug_sugerido || normalized.suggestedSlug,
        canonical: anchor.canonical || normalized.publishedIdentityRef?.canonical || normalized.canonical || null,
        protectPrincipal: identityContext.principalProtected,
        protectSilo: identityContext.principalProtected,
        kgrIdentity: identityContext.kgrIdentityProtected ? (group.kgrIdentity || group.keywords.find(keyword => keyword.id === principalId)?.kgrIdentity) : undefined,
      }, normalized) : guardPublishedArticleProposal({ articleId: normalized.articleId, isPublished: false,
        brandId: parsed.data.brand.id, siloId: group.suggestedSiloId, principalKeywordId: principalId,
        slug: normalized.suggestedSlug, canonical: normalized.canonical,
        kgrIdentity: identityContext.kgrIdentityProtected ? (group.kgrIdentity || group.keywords.find(keyword => keyword.id === principalId)?.kgrIdentity) : undefined,
      }, normalized);
      return createVersionEnvelope({ entityId: guarded.proposal.articleId, versionNumber: 1, previousVersionId: null,
        origin: "ai", changeReason: "Proposta inicial de ArticleDNA.", createdBy: profile.userId, payload: guarded.proposal });
    }));
    const events = versions.map(version => createStatusEvent(version.versionId, "proposed", profile.userId, "Aguardando revisao humana."));
    return NextResponse.json({ success: true, data: { versions, events } });
  } catch (error) {
    if (error instanceof StructuredAIError) return NextResponse.json({ success: false, error: error.message, issues: error.issues }, { status: error.status });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
