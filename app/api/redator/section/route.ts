import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile, AuthzError } from "@/lib/server/authz";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { RedatorSectionRequestSchema } from "@/lib/redator/contracts";
import { WriterSectionProviderSchema } from "@/lib/redator/writer-section-evidence";
import { runWriterSectionProposal } from "@/lib/server/writer-evidence-ai";
import { WriterEvidenceError } from "@/lib/server/writer-evidence-document";

/*
 * A evidência vem do SERVIDOR, pela linha do documento na Marca autorizada
 * (lib/server/writer-evidence-ai.ts). Do navegador só entram os blocos em
 * edição e o id; os alertas da IA viram divergências para decisão humana.
 */
export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RedatorSectionRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    const section = input.document.blocks.find(block => block.id === input.sectionId && block.type === "heading");
    if (!section) throw new AuthzError(422, "A seção solicitada não pertence ao documento.");
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: profile.userId, brandId: input.brandId, client: createCanonicalServiceClient() });
    const result = await runWriterSectionProposal({
      context: { brandId: input.brandId },
      actorUserId: profile.userId,
      document: input.document,
      sectionId: input.sectionId,
      humanInstruction: input.humanInstruction,
      generate: ({ system, user }) => generateStructuredAI({ provider, system, user, schema: WriterSectionProviderSchema, maxTokens: 2400 }),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Pedido de escrita inválido.", details: error.issues }, { status: 400 });
    if (error instanceof StructuredAIError) return NextResponse.json({ error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    if (error instanceof WriterEvidenceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
