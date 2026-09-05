import { NextResponse } from "next/server";
import { z } from "zod";
import { SiloReviewOperationSchema, SiloReviewProposalSchema } from "@/lib/arquiteto/silo-consolidation";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";

const RequestSchema = z.object({
  brand: z.object({ id: z.string().min(1), name: z.string(), niche: z.string().nullable().optional(), guidelines: z.unknown().nullable().optional() }),
  silos: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), slug: z.string().min(1),
    articleIds: z.array(z.string().min(1)), pillarArticleId: z.string().nullable(), supportArticleIds: z.array(z.string()),
    publishedProtection: z.object({ protected: z.boolean(), protectedFields: z.array(z.string()) }),
    reasons: z.array(z.string()), conflicts: z.array(z.string()),
  })).min(1).max(24),
  articleDnaFacts: z.array(z.object({ versionId: z.string().min(1), contentHash: z.string().min(1), payload: z.record(z.string(), z.unknown()) })).min(1),
  serpGuidelines: z.array(z.object({ articleId: z.string().min(1), reference: z.unknown().nullable(), guideline: z.string().min(1) })).default([]),
}).strict();

const RawOperationSchema = SiloReviewOperationSchema.omit({ operationId: true }).extend({ operationId: z.string().optional() });
const ResponseSchema = z.object({ operations: z.array(RawOperationSchema), summary: z.string().min(1) });

const SYSTEM_PROMPT = `Voce revisa uma working copy de Silos editoriais. Analise os fatos dos ArticleDNAs e as diretrizes SERP recebidas.
Retorne somente uma proposta compacta em JSON com operations e summary. Use apenas IDs existentes.
Pode propor join, split, move_article, eliminate_shallow, rename, suggest_slug, select_pillar, revise_supports e verify_verticality.
Cada operação e apenas uma hipótese reversível e exige decisão humana. Nao aplique, nao aprove, nao persista e nao descarte ArticleDNA.
SiloPage nao e Pilar. Para publicado, preserve brandId, URL, slug e canonical; nao proponha eliminar nem alterar identidade publicada.
Se nao houver mudanca segura, retorne operations vazio e explique no summary.`;

function buildPrompt(input: z.infer<typeof RequestSchema>) {
  return JSON.stringify({
    brand: { id: input.brand.id, name: input.brand.name, niche: input.brand.niche || null },
    silos: input.silos,
    articleDnaFacts: input.articleDnaFacts,
    serpGuidelines: input.serpGuidelines,
  });
}

export async function POST(req: Request) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Working copy de Silos invalida.", issues: parsed.error.flatten() }, { status: 400 });
    const context = await resolvePipelineContext({ brandId: parsed.data.brand.id, module: "arquiteto", action: "view" });
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: context.actorUserId, brandId: context.brandId, client: context.supabase });
    const result = await generateStructuredAI({ provider, system: SYSTEM_PROMPT, user: buildPrompt(parsed.data), schema: ResponseSchema });
    const operations = result.operations.map((operation, index) => SiloReviewOperationSchema.parse({
      ...operation,
      operationId: operation.operationId || `silo-review:${index + 1}`,
      humanDecisionRequired: true,
    }));
    const proposal = SiloReviewProposalSchema.parse({
      proposalId: crypto.randomUUID(), source: "ai", approvalStatus: "pending_human", operations, summary: result.summary,
    });
    return NextResponse.json({ success: true, data: { proposal } });
  } catch (error) {
    if (error instanceof StructuredAIError) return NextResponse.json({ success: false, error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha na revisão de Silos." }, { status: 500 });
  }
}
