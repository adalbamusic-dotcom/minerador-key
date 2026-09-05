import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, assertCanAccessMarca, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { ExpertBriefInputSchema, ExpertBriefStatusSchema } from "@/lib/server/expert-contribution-contracts";
import { createExpertBrief, getExpertBrief, listActiveBrandExperts, listBrandExpertBindings, listExpertBriefsForContext, listExpertContributions, updateExpertBrief } from "@/lib/server/telegram/persistence";

const BriefRequestSchema = ExpertBriefInputSchema.omit({ brandId: true }).extend({ brandId: z.string().uuid() });
const BriefUpdateRequestSchema = BriefRequestSchema.extend({
  briefId: z.string().uuid(),
  status: ExpertBriefStatusSchema.extract(["draft", "reviewed"]).optional(),
});

const QuerySchema = z.object({
  brandId: z.string().uuid(),
  expertId: z.string().uuid().optional(),
  articleId: z.string().trim().min(1).max(256).optional(),
  articleDnaVersionId: z.string().trim().min(1).max(256).optional(),
}).strict().refine(input => Boolean(input.articleId) === Boolean(input.articleDnaVersionId), "O artigo e a versão do ArticleDNA devem ser informados juntos.");

const noStoreHeaders = { "Cache-Control": "no-store" };

function queryInput(request: Request) {
  const params = new URL(request.url).searchParams;
  return QuerySchema.safeParse({
    brandId: params.get("brandId") || "",
    ...(params.get("expertId") ? { expertId: params.get("expertId") } : {}),
    ...(params.get("articleId") ? { articleId: params.get("articleId") } : {}),
    ...(params.get("articleDnaVersionId") ? { articleDnaVersionId: params.get("articleDnaVersionId") } : {}),
  });
}

function requireArticleContext(input: { articleId?: string | null; articleDnaVersionId?: string | null }): asserts input is { articleId: string; articleDnaVersionId: string } {
  if (!input.articleId || !input.articleDnaVersionId) {
    throw new AuthzError(400, "O ExpertBrief precisa do artigo e da versão do ArticleDNA selecionados.");
  }
}

async function assertUsableExpert(input: { brandId: string; expertId: string }, client: ReturnType<typeof createCanonicalServiceClient>) {
  const experts = await listActiveBrandExperts(input.brandId, client);
  if (!experts.some(expert => expert.id === input.expertId)) throw new AuthzError(404, "Especialista não encontrado ou não utilizável nesta Marca.");
}

export async function GET(request: Request) {
  try {
    const query = queryInput(request);
    if (!query.success) return NextResponse.json({ error: "Contexto do ExpertBrief inválido.", details: query.error.issues }, { status: 400, headers: noStoreHeaders });
    const profile = await requireCanonicalSessionProfile();
    await assertCanAccessMarca(profile.userId, query.data.brandId, profile);
    await assertEditorialPermission(profile, query.data.brandId, "radar", "view");
    const client = createCanonicalServiceClient();
    const [experts, allBindings, briefs, contributions] = await Promise.all([
      listActiveBrandExperts(query.data.brandId, client),
      listBrandExpertBindings(query.data.brandId, client),
      listExpertBriefsForContext(query.data, client),
      listExpertContributions(query.data.brandId, client),
    ]);
    const activeExpertIds = new Set(experts.map(expert => expert.id));
    const scopedBriefs = briefs.filter(brief => activeExpertIds.has(brief.expertId));
    const scopedBriefIds = new Set(scopedBriefs.map(brief => brief.id));
    const scopedContributions = contributions.filter(contribution => activeExpertIds.has(contribution.expertId) && (!query.data.articleId || scopedBriefIds.has(contribution.briefId)));
    return NextResponse.json({
      experts,
      // Telegram identifiers never cross into the Radar UI. The binding is an
      // informative capability flag; it is not required to create a brief.
      bindings: allBindings.filter(binding => binding.status === "active" && activeExpertIds.has(binding.expertId)).map(binding => ({ expertId: binding.expertId, status: binding.status })),
      briefs: scopedBriefs,
      contributions: scopedContributions,
    }, { headers: noStoreHeaders });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = BriefRequestSchema.parse(await request.json());
    requireArticleContext(input);
    await assertCanAccessMarca(profile.userId, input.brandId, profile);
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    const client = createCanonicalServiceClient();
    await assertUsableExpert({ brandId: input.brandId, expertId: input.expertId }, client);
    const created = await createExpertBrief({ ...input, status: "draft", createdBy: profile.userId }, client);
    const readback = await getExpertBrief({ brandId: input.brandId, briefId: created.id, expertId: input.expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
    if (!readback) throw new AuthzError(503, "A pauta foi criada, mas o readback compatível não foi confirmado.");
    return NextResponse.json({ brief: readback, persistence: "remote_readback_confirmed", notification: "NOT_SENT" }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados do brief inválidos.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = BriefUpdateRequestSchema.parse(await request.json());
    requireArticleContext(input);
    await assertCanAccessMarca(profile.userId, input.brandId, profile);
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    const client = createCanonicalServiceClient();
    await assertUsableExpert({ brandId: input.brandId, expertId: input.expertId }, client);
    const current = await getExpertBrief({ brandId: input.brandId, briefId: input.briefId, expertId: input.expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
    if (!current) throw new AuthzError(404, "Pauta não encontrada neste contexto de artigo, versão e especialista.");
    if (!["draft", "reviewed"].includes(current.status)) throw new AuthzError(409, "Esta pauta já foi enviada ou está recebendo contribuição; suas perguntas estão congeladas.");
    const updated = await updateExpertBrief({ ...input, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
    if (!updated) throw new AuthzError(404, "Pauta não encontrada neste contexto de artigo, versão e especialista.");
    const readback = await getExpertBrief({ brandId: input.brandId, briefId: input.briefId, expertId: input.expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
    if (!readback) throw new AuthzError(503, "A pauta foi atualizada, mas o readback compatível não foi confirmado.");
    return NextResponse.json({ brief: readback, persistence: "remote_readback_confirmed", notification: "NOT_SENT" }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados do brief inválidos.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}
