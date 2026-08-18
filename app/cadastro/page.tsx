"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordField } from "@/components/auth/password-field";
import { resendSignupConfirmation } from "@/lib/auth/resend-confirmation";
import { safeAuthRedirect } from "@/lib/auth/safe-auth-redirect";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

type InvitationDetails = {
  destination_email: string;
  responsible_name: string;
  proposed_agency_name: string;
  status: string;
};

function responseMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

function CadastroScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeAuthRedirect(searchParams.get("callbackUrl"));
  const inviteToken = searchParams.get("inviteToken")?.trim() || "";
  const inviteMode = Boolean(inviteToken);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [validatedInvitationToken, setValidatedInvitationToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  useEffect(() => {
    if (!inviteMode) return;

    let cancelled = false;
    void fetch(`/api/onboarding/agency?token=${encodeURIComponent(inviteToken)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.invitation || payload.invitation.status !== "PENDING") {
          throw new Error(responseMessage(payload, "Este convite não está disponível."));
        }
        if (!cancelled) {
          setInvitation(payload.invitation as InvitationDetails);
          setEmail(payload.invitation.destination_email);
          setValidatedInvitationToken(inviteToken);
          setError("");
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setInvitation(null);
          setValidatedInvitationToken("");
          setError(reason instanceof Error ? reason.message : "Não foi possível validar o convite.");
        }
      });

    return () => { cancelled = true; };
  }, [inviteMode, inviteToken]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); setLoading(true);
    try {
      if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
      if (password !== passwordConfirmation) throw new Error("As senhas não coincidem.");

      if (inviteMode) {
        if (!invitation) throw new Error("Valide o convite antes de criar a conta.");
        const response = await fetch("/api/auth/invited-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: inviteToken, password, passwordConfirmation }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseMessage(payload, "Não foi possível criar sua conta."));
        setSuccess("Conta criada. Abrindo o onboarding autorizado...");
        setPassword(""); setPasswordConfirmation("");
        router.replace(callbackUrl);
        return;
      }

      if (!name.trim() || !email.trim()) throw new Error("Informe nome e e-mail para criar seu cadastro.");
      const { data, error: signupError } = await getBrowserSupabaseClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
        },
      });
      if (signupError) throw new Error("Não foi possível concluir o cadastro. Se você já possui uma conta, entre ou redefina sua senha.");
      const sessionAvailable = Boolean(data.session);
      setConfirmationRequired(!sessionAvailable);
      setSuccess(sessionAvailable ? "Cadastro concluído. Abrindo seu acesso..." : "Cadastro criado. Confirme seu e-mail para continuar.");
      setPassword(""); setPasswordConfirmation("");
      if (sessionAvailable) router.replace(callbackUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir o cadastro.");
    } finally { setLoading(false); }
  }

  async function resendConfirmation() {
    setError(""); setSuccess(""); setLoading(true);
    try {
      const { error: resendError } = await resendSignupConfirmation(email.trim(), callbackUrl);
      if (resendError) throw new Error("Não foi possível reenviar o e-mail de confirmação.");
      setSuccess("E-mail de confirmação solicitado. Verifique sua caixa de entrada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível reenviar o e-mail de confirmação.");
    } finally { setLoading(false); }
  }

  const formReady = !inviteMode || Boolean(invitation && validatedInvitationToken === inviteToken);
  const invitationLoading = inviteMode && !formReady && !error;
  const disabled = loading || invitationLoading || !formReady;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">{inviteMode ? "Criar sua conta" : "Criar cadastro"}</h1>
          <p className="mt-2 text-sm leading-6 text-foreground/70">
            {inviteMode
              ? "O convite já definiu a identidade que será criada. Depois da conta, você continuará no onboarding da agência."
              : "Seu cadastro cria apenas sua identidade. Os acessos são concedidos explicitamente."}
          </p>
        </div>

        {inviteMode && invitation && validatedInvitationToken === inviteToken ? (
          <div className="space-y-1 rounded-lg border border-foreground/15 bg-foreground/5 p-4 text-sm leading-6">
            <p><span className="font-semibold">Agência:</span> {invitation.proposed_agency_name}</p>
            <p><span className="font-semibold">Responsável:</span> {invitation.responsible_name}</p>
          </div>
        ) : null}
        {invitationLoading ? <p role="status" className="text-sm text-foreground/70">Validando convite...</p> : null}

        {formReady ? (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-foreground/15 bg-foreground/5 p-5">
            {!inviteMode ? (
              <div>
                <label htmlFor="signup-name" className="mb-2 block text-sm font-medium">Nome</label>
                <input id="signup-name" name="name" type="text" required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="min-h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent" />
              </div>
            ) : null}

            <div>
              <label htmlFor="signup-email" className="mb-2 block text-sm font-medium">{inviteMode ? "E-mail de acesso" : "E-mail"}</label>
              {inviteMode ? (
                <input id="signup-email" name="email" type="email" required readOnly value={email} autoComplete="username" className="min-h-10 w-full cursor-not-allowed rounded-md border border-foreground/20 bg-background px-3 text-base opacity-75 outline-none focus-visible:ring-2 focus-visible:ring-accent" />
              ) : (
                <input id="signup-email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="min-h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent" />
              )}
              {inviteMode ? <p className="mt-1 text-sm leading-6 text-foreground/70">Este e-mail pertence ao convite e não pode ser alterado.</p> : null}
            </div>

            <PasswordField id="signup-password" name="password" label="Senha" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha" autoComplete="new-password" />
            <PasswordField id="signup-password-confirmation" name="passwordConfirmation" label="Confirmar senha" required minLength={6} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="Confirmar senha" autoComplete="new-password" />
            {error ? <p role="alert" className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm leading-6">{error}</p> : null}
            {success ? <p role="status" className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm leading-6">{success}</p> : null}
            {!inviteMode && confirmationRequired ? <button type="button" disabled={loading} onClick={() => void resendConfirmation()} className="min-h-10 w-full rounded-md border border-foreground/20 px-3 text-sm font-semibold disabled:opacity-60">{loading ? "Reenviando..." : "Reenviar e-mail de confirmação"}</button> : null}
            <button type="submit" disabled={disabled} className="min-h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{loading ? (inviteMode ? "Criando conta..." : "Cadastrando...") : (inviteMode ? "Criar conta" : "Criar cadastro")}</button>
          </form>
        ) : null}

        <p className="text-center text-sm text-foreground/70">Já possui acesso? <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-semibold text-accent hover:underline">Entrar</Link></p>
      </section>
    </main>
  );
}

export default function CadastroPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-background text-foreground"><p role="status" className="text-sm text-foreground/70">Carregando cadastro...</p></main>}><CadastroScreen /></Suspense>;
}
