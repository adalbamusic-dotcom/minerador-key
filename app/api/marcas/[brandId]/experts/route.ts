import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { createCanonicalServiceClient, requireCanonicalBrandManageOrPlatformAdmin } from "@/lib/server/canonical-authorization";
import { createBrandExpert, issueTelegramOnboardingToken, listBrandExpertBindings, listBrandExperts, revokeTelegramBinding } from "@/lib/server/telegram/persistence";

const CreateExpertSchema = z.object({ action: z.literal("create_expert"), displayName: z.string().trim().min(1).max(160), specialty: z.string().trim().max(160).nullable().optional() });
const OnboardingSchema = z.object({ action: z.literal("issue_onboarding_token"), expertId: z.string().uuid() });
const RevokeSchema = z.object({ action: z.literal("revoke_binding"), bindingId: z.string().uuid() });

async function telegramBotUsername(client: ReturnType<typeof createCanonicalServiceClient>) {
  const provider = await client.from("integration_providers").select("id").eq("provider_key", "telegram").maybeSingle();
  if (provider.error || !provider.data) return null;
  const connection = await client.from("integration_connections").select("metadata").eq("provider_id", provider.data.id).eq("owner_scope_type", "platform").eq("environment", "production").neq("lifecycle_status", "revoked").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const metadata = connection.data?.metadata && typeof connection.data.metadata === "object" && !Array.isArray(connection.data.metadata) ? connection.data.metadata as Record<string, unknown> : {};
  const health = metadata.health_check && typeof metadata.health_check === "object" && !Array.isArray(metadata.health_check) ? metadata.health_check as Record<string, unknown> : {};
  const details = health.details && typeof health.details === "object" && !Array.isArray(health.details) ? health.details as Record<string, unknown> : {};
  return typeof details.botUsername === "string" && details.botUsername.trim() ? details.botUsername.trim().replace(/^@/, "") : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    await requireCanonicalBrandManageOrPlatformAdmin(brandId);
    const client = createCanonicalServiceClient();
    const [experts, bindings, botUsername] = await Promise.all([listBrandExperts(brandId, client), listBrandExpertBindings(brandId, client), telegramBotUsername(client)]);
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
      const botUsername = await telegramBotUsername(client);
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

