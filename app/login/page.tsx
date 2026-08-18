"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordField } from "@/components/auth/password-field";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { useBrand } from "@/components/brand-context";
import { resendSignupConfirmation } from "@/lib/auth/resend-confirmation";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import {
  authFailureDiagnostic,
  authFailureMessage,
  classifyAuthError,
} from "@/lib/auth/classify-auth-error";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import { restoreLastGlobalNavigationContext } from "@/lib/navigation/global-context";

function LoginScreen() {
  const { data: session, status } = useSupabaseSession();
  const { userRole, profileLoading } = useBrand();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const authErrorCode = searchParams.get("error");
  const [error, setError] = useState(
    authErrorCode === "oauth_code_missing" || authErrorCode === "oauth_callback_failed"
      ? "Não foi possível concluir a autenticação. Tente novamente."
      : authErrorCode === "invited_identity_pending_confirmation"
        ? "Esta identidade já existe, mas ainda não foi confirmada. Nenhuma conta nova foi criada; conclua a confirmação ou use a recuperação de acesso."
        : authErrorCode === "invited_identity_unavailable"
          ? "Esta identidade já existe, mas não está disponível para um novo cadastro."
      : "",
  );
  const [unconfirmed, setUnconfirmed] = useState(false);
  const requestedCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = safeAuthRedirect(requestedCallbackUrl);
  const restoreActorRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || profileLoading || !session?.user?.id) return;
    if (requestedCallbackUrl && callbackUrl !== "/selecionar-marca") {
      router.replace(callbackUrl);
      return;
    }
    if (restoreActorRef.current === session.user.id) return;
    restoreActorRef.current = session.user.id;
    void restoreLastGlobalNavigationContext(session.user.id).then((target) => {
      router.replace(target || (userRole === "admin" ? "/admin" : "/conta"));
    });
  }, [callbackUrl, profileLoading, requestedCallbackUrl, router, session?.user?.id, status, userRole]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setUnconfirmed(false);

    try {
      const { data, error: authError } = await getBrowserSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const failure = classifyAuthError(authError);
        if (process.env.NODE_ENV !== "production") {
          console.error("[auth] login failed", authFailureDiagnostic(authError, failure));
        }
        setUnconfirmed(failure === "EMAIL_NOT_CONFIRMED");
        setError(authFailureMessage(failure));
        return;
      }

      // A successful password call must establish the single canonical identity.
      // Do not redirect or fall back to another session when Auth returns no user.
      if (!data.session?.user?.id) {
        const failure = "OUTRO" as const;
        if (process.env.NODE_ENV !== "production") {
          console.error("[auth] login returned no identity", authFailureDiagnostic(null, failure));
        }
        setError(authFailureMessage(failure));
      }
    } catch (reason) {
      const failure = classifyAuthError(reason);
      if (process.env.NODE_ENV !== "production") {
        console.error("[auth] login exception", authFailureDiagnostic(reason, failure));
      }
      setUnconfirmed(failure === "EMAIL_NOT_CONFIRMED");
      setError(authFailureMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    setLoading(true);
    setError("");
    try {
      const { error: resendError } = await resendSignupConfirmation(email.trim(), callbackUrl);
      if (resendError) throw new Error("confirmation_resend_failed");
      setError("E-mail de confirmação solicitado. Verifique sua caixa de entrada.");
    } catch {
      setError("Não foi possível reenviar o e-mail de confirmação.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && profileLoading)) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-foreground">
        <p role="status" className="flex items-center gap-2 text-sm text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando sessão...
        </p>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm space-y-6">
        <header>
          <Link href="/" className="text-sm font-medium text-accent">Minerador Key</Link>
          <h1 className="mt-2 text-2xl font-semibold">Entrar</h1>
          <p className="mt-2 text-base leading-7 text-foreground/70">
            Use sua identidade cadastrada para abrir somente os contextos autorizados.
          </p>
        </header>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-foreground/15 bg-foreground/5 p-5">
          <label className="block text-sm font-medium">
            E-mail
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <PasswordField id="login-password" name="password" label="Senha" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          {error ? <p role="alert" className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm leading-6">{error}</p> : null}
          {unconfirmed ? <button type="button" disabled={loading} onClick={() => void resendConfirmation()} className="min-h-10 w-full rounded-md border border-foreground/20 px-3 text-sm font-semibold disabled:opacity-60">{loading ? "Reenviando..." : "Reenviar confirmação"}</button> : null}
          <button type="submit" disabled={loading} className="min-h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-foreground disabled:opacity-60">{loading ? "Entrando..." : "Entrar"}</button>
        </form>
        <div className="text-sm"><Link href={`/recuperar-senha?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-semibold text-accent hover:underline">Esqueci minha senha</Link></div>
        <p className="text-sm text-foreground/70">Ainda não possui acesso? <Link href={`/cadastro?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-semibold text-accent hover:underline">Criar cadastro</Link></p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-background text-foreground"><p role="status" className="text-sm text-foreground/70">Carregando acesso...</p></main>}>
      <LoginScreen />
    </Suspense>
  );
}
