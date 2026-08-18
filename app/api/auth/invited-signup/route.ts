import { NextResponse } from "next/server";
import { parseInvitedSignupInput } from "@/lib/auth/manual-auth";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { findAuthUserByEmail } from "@/lib/server/auth-users";
import { AgencyOnboardingError, resolveInvitedAccountCreationContext } from "@/lib/server/agency-onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";

function responseFor(error: unknown) {
  if (error instanceof AgencyOnboardingError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "Não foi possível concluir a criação da conta." }, { status: 503 });
}

function existingIdentityResponse(status: "confirmed" | "pending_confirmation" | "disabled") {
  return status === "confirmed"
    ? NextResponse.json({ error: "Esta identidade já existe. Entre com sua senha para continuar.", code: "INVITED_IDENTITY_ALREADY_EXISTS" }, { status: 409 })
    : NextResponse.json({ error: "Já existe uma identidade para este convite. Use o fluxo de acesso existente; nenhuma conta nova foi criada.", code: status === "pending_confirmation" ? "INVITED_IDENTITY_PENDING_CONFIRMATION" : "INVITED_IDENTITY_UNAVAILABLE" }, { status: 409 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token : "";
    const input = parseInvitedSignupInput({
      password: body?.password,
      passwordConfirmation: body?.passwordConfirmation,
    });
    const service = createCanonicalServiceClient();
    const context = await resolveInvitedAccountCreationContext(service, token);
    const existing = await findAuthUserByEmail(service, context.email);
    if (existing) return existingIdentityResponse(existing.identityStatus);

    const created = await service.auth.admin.createUser({
      email: context.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: context.responsibleName },
    });
    if (created.error || !created.data.user?.id) {
      const racedIdentity = await findAuthUserByEmail(service, context.email);
      if (racedIdentity) return existingIdentityResponse(racedIdentity.identityStatus);
      return NextResponse.json({ error: "Não foi possível criar a identidade para este convite.", code: "INVITED_IDENTITY_CREATE_FAILED" }, { status: 503 });
    }

    const sessionClient = await createServerSupabaseClient();
    const session = await sessionClient.auth.signInWithPassword({ email: context.email, password: input.password });
    if (session.error || !session.data.session?.user?.id) {
      return NextResponse.json({ error: "A identidade foi criada, mas a sessão não pôde ser estabelecida. Entre com sua senha para continuar.", code: "INVITED_SESSION_ESTABLISHMENT_FAILED" }, { status: 503 });
    }

    return NextResponse.json({ ok: true, next: "onboarding" }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Confira a senha e a confirmação.", code: "INVITED_SIGNUP_INPUT_INVALID" }, { status: 400 });
    }
    return responseFor(error);
  }
}
