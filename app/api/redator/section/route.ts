import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile, AuthzError } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { RedatorSectionRequestSchema, RedatorSectionProposalSchema } from "@/lib/redator/contracts";
import { buildSectionWritingPrompt, createSectionPromptContext, SECTION_WRITING_SYSTEM_PROMPT } from "@/lib/redator/prompts";

const ProviderSectionSchema = z.object({
  paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(8),
  alerts: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RedatorSectionRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    const section = input.document.blocks.find(block => block.id === input.sectionId && block.type === "heading");
    if (!section) throw new AuthzError(422, "A seção solicitada não pertence ao documento.");
    const context = createSectionPromptContext(input.document, input.sectionId, input.humanInstruction);
    const generated = await generateStructuredAI({
      system: SECTION_WRITING_SYSTEM_PROMPT,
      user: buildSectionWritingPrompt(context),
      schema: ProviderSectionSchema,
      maxTokens: 2400,
    });
    const proposal = RedatorSectionProposalSchema.parse({ documentId: input.document.id, sectionId: input.sectionId, paragraphs: generated.paragraphs, alerts: generated.alerts,
      humanDecisionRequired: true, origin: "ai" });
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Pedido de escrita inválido.", details: error.issues }, { status: 400 });
    if (error instanceof StructuredAIError) return NextResponse.json({ error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
