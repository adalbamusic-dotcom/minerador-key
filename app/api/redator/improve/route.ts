import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { RedatorImproveRequestSchema } from "@/lib/redator/contracts";
import { WriterImproveProviderSchema } from "@/lib/redator/writer-section-evidence";
import { runWriterImproveProposal } from "@/lib/server/writer-evidence-ai";
import { WriterEvidenceError } from "@/lib/server/writer-evidence-document";

/* Mesma regra da seção: evidência lida no servidor pela Marca; alertas viram divergências. */
export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RedatorImproveRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: profile.userId, brandId: input.brandId, client: createCanonicalServiceClient() });
    const result = await runWriterImproveProposal({
      context: { brandId: input.brandId },
      actorUserId: profile.userId,
      document: input.document,
      selectedText: input.selectedText,
      humanInstruction: input.humanInstruction,
      generate: ({ system, user }) => generateStructuredAI({ provider, system, user, schema: WriterImproveProviderSchema, maxTokens: 2200 }),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Pedido de melhoria inválido.", details: error.issues }, { status: 400 });
    if (error instanceof StructuredAIError) return NextResponse.json({ error: error.message, code: error.code, issues: error.issues }, { status: error.status });
    if (error instanceof WriterEvidenceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
