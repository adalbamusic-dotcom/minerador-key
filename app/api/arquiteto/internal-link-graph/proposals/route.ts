import { NextResponse } from "next/server";
import { z } from "zod";
import { InternalLinkGraphProposalSchema } from "@/lib/arquiteto/contracts";
import { listInternalLinkGraphProposals, persistInternalLinkGraphProposal, reviewInternalLinkGraphProposal } from "@/lib/server/internal-link-graph-persistence";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

const BrandQuerySchema = z.object({ brandId: z.string().uuid() });
const CreateRequestSchema = z.object({
  brandId: z.string().uuid(),
  action: z.literal("create"),
  proposal: InternalLinkGraphProposalSchema,
}).strict();
const ReviewRequestSchema = z.object({
  brandId: z.string().uuid(),
  action: z.literal("edit"),
  proposalId: z.string().min(1),
  reviewStatus: z.enum(["accepted", "partially_accepted", "rejected"]),
  reviewNote: z.string().nullable(),
}).strict();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = BrandQuerySchema.parse({ brandId: url.searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    const proposals = await listInternalLinkGraphProposals(context, url.searchParams.get("graphId") || undefined);
    return NextResponse.json({ success: true, data: { source: "CANONICAL_REMOTE", proposals } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "brandId é obrigatório e deve ser válido." }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = CreateRequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: parsed.action });
    const result = await persistInternalLinkGraphProposal(context, parsed.proposal);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "A proposta de InternalLinkGraph não corresponde ao contrato canônico." }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = ReviewRequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: parsed.action });
    const result = await reviewInternalLinkGraphProposal(context, parsed.proposalId, { reviewStatus: parsed.reviewStatus, reviewNote: parsed.reviewNote });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "A revisão da proposta não corresponde ao contrato canônico." }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
