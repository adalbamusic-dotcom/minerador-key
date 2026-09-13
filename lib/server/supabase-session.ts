import "server-only";

import type { User } from "@supabase/supabase-js";

/*
 * O CLIENTE DE REQUEST É CARREGADO TARDE — e só por quem precisa dele.
 *
 * `lib/supabase/server-client` importa `next/headers`, que só existe dentro do
 * Next. Este módulo também exporta `SupabaseSessionError`, que o `authz` usa
 * num `instanceof` e portanto importa de verdade — e era esse import inocente
 * que arrastava `next/headers` para o boot do Local Worker.
 *
 * As funções abaixo exigem uma requisição em andamento; a classe de erro, não.
 * Separar as duas coisas é o que deixa o worker dar boot.
 */
const clienteDeRequest = async () => (await import("@/lib/supabase/server-client")).createServerSupabaseClient();

export class SupabaseSessionError extends Error {
  /*
   * CAMPO EXPLÍCITO, e não `constructor(public readonly code)`.
   *
   * Parameter property é das poucas sintaxes do TypeScript que PRODUZEM código
   * em vez de anotá-lo, e o Node a recusa no modo strip-only — que é como o
   * Local Worker roda este módulo fora do Next. A alternativa seria pôr um
   * transpilador no caminho de boot do worker; escrever a atribuição resolve o
   * mesmo com menos máquina, e o que roda passa a ser o que está escrito.
   */
  readonly code: "SUPABASE_SESSION_MISSING" | "SUPABASE_SESSION_INVALID";

  constructor(code: "SUPABASE_SESSION_MISSING" | "SUPABASE_SESSION_INVALID") {
    super(code === "SUPABASE_SESSION_MISSING" ? "Sessão Supabase ausente." : "Sessão Supabase inválida ou expirada.");
    this.code = code;
  }
}

/** Uses Auth getUser instead of trusting cookie claims in server authorization. */
export async function requireSupabaseUser(): Promise<User> {
  const supabase = await clienteDeRequest();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new SupabaseSessionError(error ? "SUPABASE_SESSION_INVALID" : "SUPABASE_SESSION_MISSING");
  }
  return data.user;
}

export async function getSupabaseClaims() {
  const supabase = await clienteDeRequest();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims;
}
