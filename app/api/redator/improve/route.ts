import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { RedatorImproveRequestSchema, RedatorImproveProposalSchema } from "@/lib/redator/contracts";
import { buildImprovePrompt, IMPROVE_SYSTEM_PROMPT } from "@/lib/redator/prompts";

const ProviderImproveSchema = z.object({ replacementText: z.string().trim().min(1).max(12000), alerts: z.array(z.string().trim().min(1).max(1000)).max(20).default([]) });

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RedatorImproveRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    const generated = await generateStructuredAI({ system: IMPROVE_SYSTEM_PROMPT, user: buildImprovePrompt(input.document, input.selectedText, input.humanInstruction), schema: ProviderImproveSchema, maxTokens: 2200 });
    const proposal = RedatorImproveProposalSchema.parse({ ...generated, humanDecisionRequired: true, origin: "ai" });
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Pedido de melhoria inválido.", details: error.issues }, { status: 400 });
    if (error instanceof StructuredAIError) return NextResponse.json({ error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
