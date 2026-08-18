"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";

type Invitation = {
  proposed_agency_name: string;
  responsible_name: string;
  destination_email?: string;
  plan_code: string;
  expires_at: string;
  access_expires_at?: string | null;
  source: "ADMIN_INVITE" | "PUBLIC_APPLICATION";
  status: string;
};

const invitationStatusMessage = {
  ACCEPTED: "Este convite já foi utilizado.",
  EXPIRED: "Este convite expirou.",
  REVOKED: "Este convite foi revogado.",
};

function formatInvitationDate(value: string | null | undefined) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "não informada" : date.toLocaleDateString("pt-BR");
}

function AgencyOnboardingScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus, signOut } = useSupabaseSession();
  const token = searchParams.get("token");
  const idempotencyKey = searchParams.get("operation");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [confirmedAgencyName, setConfirmedAgencyName] = useState("");
  const [inspectError, setInspectError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!idempotencyKey) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("operation", window.crypto.randomUUID());
      router.replace(`/onboarding/agencia?${params.toString()}`);
    }
  }, [idempotencyKey, router, searchParams]);

  useEffect(() => {
    if (!token && sessionStatus === "loading") return;
    if (!token && sessionStatus === "unauthenticated") return;
    let active = true;
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    void fetch(`/api/onboarding/agency${query}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) throw new Error(body.error || "Convite indisponível.");
        setInvitation(body.invitation);
        setConfirmedAgencyName(body.invitation.proposed_agency_name);
      })
      .catch((cause) => {
        if (active) setInspectError(cause instanceof Error ? cause.message : "Convite indisponível.");
      });
    return () => { active = false; };
  }, [sessionStatus, token]);

  useEffect(() => {
    if (!token || !idempotencyKey || invitation?.source !== "ADMIN_INVITE" || sessionStatus !== "unauthenticated") return;
    const query = new URLSearchParams({ token, operation: idempotencyKey });
    window.location.replace(`/api/onboarding/agency/continue?${query.toString()}`);
  }, [idempotencyKey, invitation?.source, sessionStatus, token]);

  const currentPath = `/onboarding/agencia?${new URLSearchParams({ ...(token ? { token } : {}), operation: idempotencyKey || "" }).toString()}`;
  const authenticated = sessionStatus === "authenticated" && Boolean(session);
  const trustedInviteNeedsAuthentication = Boolean(token && invitation?.status === "PENDING" && invitation?.source === "ADMIN_INVITE" && !authenticated);
  const unauthenticatedResume = !token && sessionStatus === "unauthenticated";
  const identityMatches = authenticated && (!token || (Boolean(session?.user.email) && session!.user.email!.trim().toLowerCase() === invitation?.destination_email?.trim().toLowerCase()));

  async function complete() {
    if (!idempotencyKey || !identityMatches) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/agency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey, ...(token ? { token } : {}), ...(invitation?.source === "ADMIN_INVITE" ? { confirmedAgencyName } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir o onboarding.");
      router.replace(`/agencias/${encodeURIComponent(body.agencyRef)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir o onboarding.");
    } finally {
      setSaving(false);
    }
  }

  if (unauthenticatedResume) return <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground"><section className="w-full max-w-md rounded-xl border border-foreground/15 bg-foreground/5 p-5"><h1 className="text-lg font-semibold">Onboarding indisponível</h1><p className="mt-2 text-sm leading-6 text-foreground/70">Entre para retomar o onboarding da sua identidade.</p><Link className="mt-4 inline-flex min-h-10 items-center rounded-md bg-accent px-3 py-2 text-sm font-semibold text-foreground" href={`/login?callbackUrl=${encodeURIComponent("/onboarding/agencia")}`}>Entrar</Link></section></main>;
  if (!invitation && !inspectError) return <main className="grid min-h-screen place-items-center bg-background text-foreground"><p role="status" className="flex items-center gap-2 text-sm text-foreground/70"><Loader2 className="h-4 w-4 animate-spin" />Validando convite...</p></main>;
  if (trustedInviteNeedsAuthentication) return <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground"><section className="w-full max-w-md rounded-xl border border-foreground/15 bg-foreground/5 p-5"><p role="status" className="text-sm leading-6 text-foreground/70">Preparando o acesso seguro do convite...</p></section></main>;
  if (invitation?.source === "ADMIN_INVITE" && invitation.status === "PENDING" && authenticated && identityMatches) return <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground"><section className="w-full max-w-md rounded-xl border border-foreground/15 bg-foreground/5 p-5">
    <p className="text-sm font-medium text-accent">Convite administrativo</p>
    <h1 className="mt-2 text-2xl font-semibold">Confirmar sua Agência</h1>
    <p className="mt-2 text-sm leading-6 text-foreground/70">Confira os dados definidos no convite antes de criar sua Agency.</p>
    <dl className="mt-5 space-y-3 rounded-lg border border-foreground/15 p-4 text-sm leading-6">
      <div><dt className="font-semibold"><label htmlFor="confirmed-agency-name">Agência</label></dt><dd><input id="confirmed-agency-name" name="confirmedAgencyName" type="text" required maxLength={160} autoComplete="organization" value={confirmedAgencyName} onChange={(event) => setConfirmedAgencyName(event.target.value)} aria-describedby="confirmed-agency-name-help" className="mt-1 min-h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-base text-foreground outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent" /></dd><p id="confirmed-agency-name-help" className="mt-1 text-sm text-foreground/60">Este nome será usado para criar sua Agency.</p></div>
      <div><dt className="font-semibold">Responsável</dt><dd>{invitation.responsible_name}</dd></div>
      <div><dt className="font-semibold">E-mail de acesso</dt><dd>{invitation.destination_email}</dd></div>
      <div><dt className="font-semibold">Acesso de teste até</dt><dd>{formatInvitationDate(invitation.access_expires_at)}</dd></div>
    </dl>
    {error ? <p role="alert" className="mt-4 rounded-md border border-red-500/35 bg-red-500/10 p-3 text-sm leading-6">{error}</p> : null}
    <button type="button" disabled={saving || !idempotencyKey || !confirmedAgencyName.trim()} onClick={() => void complete()} className="mt-5 min-h-10 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{saving ? "Criando Agência..." : "Confirmar e criar Agência"}</button>
    <p className="mt-3 text-sm leading-6 text-foreground/60">Confira ou corrija o nome antes de confirmar. Responsável, e-mail e validade permanecem definidos no convite.</p>
  </section></main>;
  if (inspectError || (invitation && invitation.status !== "PENDING")) return <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground"><section className="w-full max-w-md rounded-xl border border-foreground/15 bg-foreground/5 p-5"><h1 className="text-lg font-semibold">Convite indisponível</h1><p className="mt-2 text-sm leading-6 text-foreground/70">{inspectError || invitationStatusMessage[invitation!.status as keyof typeof invitationStatusMessage]}</p></section></main>;

  return <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground"><section className="w-full max-w-md rounded-xl border border-foreground/15 bg-foreground/5 p-5">
    <p className="text-sm font-medium text-accent">Onboarding de agência</p>
    <h1 className="mt-2 text-2xl font-semibold">{invitation?.proposed_agency_name}</h1>
    <p className="mt-2 text-sm leading-6 text-foreground/70">Plano {invitation?.plan_code}. A agência será criada somente após sua confirmação explícita e o aceite autenticado.</p>
    {!authenticated ? <div className="mt-5 rounded-lg border border-foreground/15 p-4 text-sm"><p>Continue para o fluxo de acesso correspondente a este convite.</p><Link className="mt-4 inline-flex min-h-10 items-center rounded-md bg-accent px-3 py-2 text-sm font-semibold text-foreground" href={`/api/onboarding/agency/continue?${new URLSearchParams({ token: token || "", operation: idempotencyKey || "" }).toString()}`}>Continuar com este convite</Link></div> : !identityMatches ? <div className="mt-5 space-y-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm"><p role="alert">Você está conectado com outra conta.</p><p className="leading-6 text-foreground/70">Saia desta sessão para continuar com o e-mail destinatário do convite.</p><div className="flex flex-wrap gap-3"><button type="button" className="min-h-10 rounded-md bg-accent px-3 text-sm font-semibold text-foreground" onClick={() => void signOut(currentPath)}>Sair e continuar com este convite</button><Link className="min-h-10 rounded-md border border-foreground/20 px-3 py-2 text-sm font-semibold" href="/">Cancelar</Link></div></div> : <div className="mt-5 space-y-4">{error ? <p role="alert" className="rounded-md border border-red-500/35 bg-red-500/10 p-3 text-sm">{error}</p> : null}<button type="button" disabled={saving || !idempotencyKey} onClick={() => void complete()} className="min-h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-foreground disabled:opacity-60">{saving ? "Concluindo..." : "Aceitar e criar agência"}</button><p className="text-sm leading-6 text-foreground/60">O aceite não cria membership administrativa nem acesso editorial implícito.</p></div>}
  </section></main>;
}

export default function AgencyOnboardingPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-background text-foreground"><p role="status" className="text-sm text-foreground/70">Carregando onboarding...</p></main>}><AgencyOnboardingScreen /></Suspense>;
}
