"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordField } from "@/components/auth/password-field";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

function RecoveryScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSupabaseSession();
  const callbackUrl = safeAuthRedirect(searchParams.get("callbackUrl"));
  const isUpdate = searchParams.get("mode") === "update";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function requestRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setNotice("");
    try {
      const recoveryPath = `/recuperar-senha?mode=update&callbackUrl=${encodeURIComponent(callbackUrl)}`;
      const { error: recoveryError } = await getBrowserSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(recoveryPath)}`,
      });
      if (recoveryError) throw new Error("Não foi possível solicitar a recuperação agora.");
      setNotice("Se o endereço estiver cadastrado, você receberá as instruções para redefinir a senha.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível solicitar a recuperação agora."); }
    finally { setLoading(false); }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setNotice("");
    try {
      if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
      if (password !== confirmation) throw new Error("As senhas não coincidem.");
      const { error: updateError } = await getBrowserSupabaseClient().auth.updateUser({ password });
      if (updateError) throw new Error("Não foi possível atualizar sua senha.");
      setNotice("Senha atualizada. Você será redirecionado para continuar.");
      setPassword(""); setConfirmation("");
      window.setTimeout(() => router.replace(callbackUrl), 500);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar sua senha."); }
    finally { setLoading(false); }
  }

  if (status === "loading") return <main className="grid min-h-screen place-items-center bg-background text-foreground"><p role="status" className="flex items-center gap-2 text-sm text-foreground/70"><Loader2 className="h-4 w-4 animate-spin" />Verificando sessão...</p></main>;
  const updating = isUpdate && status === "authenticated";
  return <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground"><section className="w-full max-w-sm space-y-6"><header><Link href="/" className="text-sm font-medium text-accent">Minerador Key</Link><h1 className="mt-2 text-2xl font-semibold">{updating ? "Definir nova senha" : "Esqueci minha senha"}</h1><p className="mt-2 text-base leading-7 text-foreground/70">{updating ? "Escolha uma nova senha para recuperar seu acesso." : "Informe seu e-mail e enviaremos instruções de recuperação sem revelar se a conta existe."}</p></header><form onSubmit={updating ? updatePassword : requestRecovery} className="space-y-4 rounded-xl border border-foreground/15 bg-foreground/5 p-5">{updating ? <><PasswordField id="recovery-password" name="password" label="Nova senha" required minLength={6} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" /><PasswordField id="recovery-confirmation" name="confirmation" label="Confirmar nova senha" required minLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" /></> : <label className="block text-sm font-medium">E-mail<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent" /></label>}{error ? <p role="alert" className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm leading-6">{error}</p> : null}{notice ? <p role="status" className="rounded-md border border-foreground/15 bg-foreground/5 px-3 py-2 text-sm leading-6">{notice}</p> : null}<button type="submit" disabled={loading} className="min-h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-foreground disabled:opacity-60">{loading ? "Aguarde..." : updating ? "Atualizar senha" : "Enviar instruções"}</button></form><p className="text-sm text-foreground/70"><Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-semibold text-accent hover:underline">Voltar para o login</Link></p></section></main>;
}

export default function RecoveryPage() { return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-background text-foreground"><p role="status" className="text-sm text-foreground/70">Carregando recuperação...</p></main>}><RecoveryScreen /></Suspense>; }
