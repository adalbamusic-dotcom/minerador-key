import { NextResponse } from "next/server";
import { parseManualSignupInput, mapManualSignupError, signupCreatedUser } from "@/lib/auth/manual-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: ReturnType<typeof parseManualSignupInput>;
  try {
    input = parseManualSignupInput(await request.json());
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "Confira nome, e-mail e senha.", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Dados de cadastro inválidos." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Cadastro indisponível: configuração do Supabase ausente." }, { status: 503 });
  }

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email.toLowerCase(), password: input.password, data: { full_name: input.name } }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível conectar ao serviço de autenticação." }, { status: 503 });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: mapManualSignupError(response.status, payload) }, { status: response.status === 422 ? 409 : 400 });
  }
  if (!signupCreatedUser(payload)) {
    return NextResponse.json({ error: "Este e-mail já está cadastrado. Entre com sua senha ou use outro e-mail." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    pendingAssociation: true,
    message: "Cadastro concluído. Aguardando associação a uma marca ou convite.",
  }, { status: 201 });
}
