import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { createCanonicalServiceClient, requireCanonicalBrandManageOrPlatformAdmin } from "@/lib/server/canonical-authorization";
import { createBrandExpert, issueTelegramOnboardingToken, listBrandExpertBindings, listBrandExperts, revokeTelegramBinding } from "@/lib/server/telegram/persistence";
import { telegramPlatformBotUsername } from "@/lib/server/telegram/canonical";

const CreateExpertSchema = z.object({ action: z.literal("create_expert"), displayName: z.string().trim().min(1).max(160), specialty: z.string().trim().max(160).nullable().optional() });
const OnboardingSchema = z.object({ action: z.literal("issue_onboarding_token"), expertId: z.string().uuid() });
const RevokeSchema = z.object({ action: z.literal("revoke_binding"), bindingId: z.string().uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    await requireCanonicalBrandManageOrPlatformAdmin(brandId);
    const client = createCanonicalServiceClient();
    const [experts, bindings, botUsername] = await Promise.all([listBrandExperts(brandId, client), listBrandExpertBindings(brandId, client), telegramPlatformBotUsername(client)]);
    return NextResponse.json({ experts, bindings, botUsername }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    const access = await requireCanonicalBrandManageOrPlatformAdmin(brandId);
    const client = createCanonicalServiceClient();
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : "";
    if (action === "create_expert") {
      const input = CreateExpertSchema.parse(body);
      return NextResponse.json({ expert: await createBrandExpert({ brandId, displayName: input.displayName, specialty: input.specialty, createdBy: access.actorUserId }, client) }, { status: 201 });
    }
    if (action === "issue_onboarding_token") {
      const input = OnboardingSchema.parse(body);
      const token = await issueTelegramOnboardingToken({ brandId, expertId: input.expertId, createdBy: access.actorUserId }, client);
      const botUsername = await telegramPlatformBotUsername(client);
      return NextResponse.json({ onboarding: { ...token, botUsername, startLink: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(token.token)}` : null } }, { status: 201 });
    }
    if (action === "revoke_binding") {
      const input = RevokeSchema.parse(body);
      await revokeTelegramBinding(input.bindingId, brandId, client);
      return NextResponse.json({ revoked: true });
    }
    return NextResponse.json({ error: "Ação de especialista inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados do especialista inválidos.", details: error.issues }, { status: 400 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

