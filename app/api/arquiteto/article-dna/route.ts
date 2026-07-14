import { NextResponse } from "next/server";
import { z } from "zod";
import { ArticleDNASchema, ProvisionalArticleGroupSchema } from "@/lib/arquiteto/contracts";
import { articleKeywordReference, deterministicArticleDnaPayload } from "@/lib/arquiteto/adapters";
import { normalizeArticleDnaProviderPayload } from "@/lib/arquiteto/article-dna-provider";
import { guardPublishedArticleProposal } from "@/lib/arquiteto/published-guard";
import { createStatusEvent, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { MAX_KEYWORDS_PER_ARTICLE } from "@/lib/arquiteto/domain-rules";

const RequestSchema = z.object({
  groups: z.array(ProvisionalArticleGroupSchema).min(1).max(20),
  brand: z.object({ id: z.string().min(1), name: z.string(), niche: z.string().nullable().optional() }),
});
const ResponseSchema = z.object({ articles: z.array(z.record(z.string(), z.unknown())).min(1) });

const SYSTEM_PROMPT = `Voce cria DNA editorial de artigos a partir de grupos ja organizados.
Nao escreva o artigo e nao altere dados. Use IDs exatos. Preserve artigos publicados.
A keyword principal deve representar o contrato editorial, nao apenas o maior volume.
Defina cobertura, exclusoes e fronteira anti-canibalizacao com clareza operacional para um futuro Escritor.
Toda decisao incerta precisa ir em humanPendingDecisions. As referencias versionadas serao anexadas pelo servidor.
Retorne um objeto {"articles": [...]} em JSON valido, sem Markdown.
Cada item de articles deve conter diretamente os campos do ArticleDNA. Nao envolva o item em articleDna, dna, payload, result ou data.`;

export async function POST(req: Request) {
  try {
    const profile = await requireSessionProfile();
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Grupos invalidos.", issues: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.groups.some(group => group.keywordIds.length > MAX_KEYWORDS_PER_ARTICLE)) {
      return NextResponse.json({ success: false, error: `Reprocesse a logica: nenhum artigo pode ter mais de ${MAX_KEYWORDS_PER_ARTICLE} keywords.` }, { status: 422 });
    }
    const result = await generateStructuredAI({
      system: SYSTEM_PROMPT,
      user: `Gere um ArticleDNA por grupo:\n${JSON.stringify(parsed.data)}`,
      schema: ResponseSchema,
    });
    const versions = await Promise.all(result.articles.map(async (raw, index) => {
      const group = parsed.data.groups[index];
      if (!group) throw new StructuredAIError("A IA retornou mais artigos que grupos.", 422);
      const base = deterministicArticleDnaPayload(group, parsed.data.brand.id);
      const provider = normalizeArticleDnaProviderPayload(raw);
      const principalId = group.principalSuggestion.keywordId;
      const keywordReferences = group.keywords.map(keyword => articleKeywordReference(keyword,
        keyword.id === principalId ? "principal" : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria"));
      const normalized = ArticleDNASchema.parse({ ...base, ...provider.payload, schemaVersion: 1, articleId: group.publishedAnchorId || group.id,
        brandId: parsed.data.brand.id, principalKeywordId: principalId, keywordReferences,
        secondaryKeywordIds: keywordReferences.filter(reference => reference.role === "secundaria").map(reference => reference.keywordId),
        narrativeReinforcementIds: keywordReferences.filter(reference => reference.role === "reforco_narrativo").map(reference => reference.keywordId),
        siloId: group.suggestedSiloId, hierarchy: group.suggestedHierarchy,
        alerts: [...(provider.payload.alerts || base.alerts), ...provider.warnings],
        canonical: provider.payload.canonical ?? base.canonical });
      const anchor = group.keywords.find(keyword => keyword.id === group.publishedAnchorId);
      const guarded = anchor ? guardPublishedArticleProposal({ articleId: normalized.articleId, isPublished: true,
        brandId: parsed.data.brand.id, siloId: anchor.lista_id || anchor.silo_id || null,
        principalKeywordId: anchor.id, slug: anchor.slug_sugerido || normalized.suggestedSlug, canonical: null }, normalized) : { proposal: normalized, alerts: [] };
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
