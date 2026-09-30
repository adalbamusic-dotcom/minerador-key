import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessMarca, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { PLATFORM_CONTRIBUTION_KINDS, PLATFORM_CONTRIBUTION_MAX_CHARS, PlatformContributionError, submitPlatformExpertContribution } from "@/lib/server/expert-platform-contribution";

/**
 * O PARECER DIRETO DO ESPECIALISTA — SDD Radar 2026-09-30, Parte B.
 *
 * Quem tem `radar:edit` escreve o parecer na aba Especialista. Ele entra como
 * contribuição a revisar, pelo mesmo caminho das respostas do Telegram; nada
 * vai ao pacote antes da decisão humana na revisão.
 */
const PedidoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
  expertId: z.string().uuid(),
  kind: z.enum(PLATFORM_CONTRIBUTION_KINDS),
  text: z.string().min(1).max(PLATFORM_CONTRIBUTION_MAX_CHARS),
  requirement: z.object({
    id: z.string().trim().min(1).max(256),
    question: z.string().max(2000).nullable().default(null),
    kind: z.string().max(80).nullable().default(null),
  }).strict().nullable().optional(),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = PedidoSchema.parse(await request.json());
    await assertCanAccessMarca(profile.userId, input.brandId, profile);
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");
    const resultado = await submitPlatformExpertContribution({ ...input, requirement: input.requirement ?? null, actorUserId: profile.userId }, createCanonicalServiceClient());
    return NextResponse.json({ success: true, ...resultado, persistence: "remote_readback_confirmed" }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Parecer inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    if (error instanceof PlatformContributionError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}
