"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { useSession, signIn, signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import {
  getSupabaseSessionErrorMessage,
  SUPABASE_SESSION_REASONS,
  type SupabaseSessionFailureReason,
} from "@/lib/auth/supabase-token";

function readAuthCallbackError(): string {
  if (typeof window === "undefined") return "";
  const code = new URLSearchParams(window.location.search).get("error");
  if (!code) return "";
  const known = SUPABASE_SESSION_REASONS.filter(reason => reason !== "SUPABASE_SESSION_READY") as readonly SupabaseSessionFailureReason[];
  return known.includes(code as SupabaseSessionFailureReason)
    ? getSupabaseSessionErrorMessage(code as SupabaseSessionFailureReason)
    : "Não foi possível concluir o login. Tente novamente.";
}

export default function RootPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { userRole, profileLoading } = useBrand();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [callbackAuthError] = useState(readAuthCallbackError);

  // Redireciona quando autenticado (apos perfil carregar)
  useEffect(() => {
    if (sessionStatus === "loading" || profileLoading) return;
    if (sessionStatus === "authenticated" && session?.supabaseAuth?.status !== "ready") return;
    if (sessionStatus === "authenticated") {
      if (userRole === "admin") router.push("/admin");
      else router.push("/selecionar-marca");
    }
  }, [sessionStatus, session?.supabaseAuth?.status, userRole, profileLoading, router]);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setAuthLoading(false);
    if (res?.error) {
      setAuthError("E-mail ou senha incorretos.");
    }
    // Em caso de sucesso, useSession atualiza e o useEffect acima redireciona.
  };

  const incompleteSessionMessage = session?.supabaseAuth?.status === "error"
    ? getSupabaseSessionErrorMessage(session.supabaseAuth.reason === "SUPABASE_SESSION_READY"
      ? "SUPABASE_ACCESS_TOKEN_MISSING"
      : session.supabaseAuth.reason, session.supabaseAuth.expiresAt)
    : getSupabaseSessionErrorMessage("SUPABASE_ACCESS_TOKEN_MISSING");

  if (sessionStatus === "authenticated" && session?.supabaseAuth?.status !== "ready") {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col items-center justify-center font-mono select-none px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-sm uppercase tracking-widest text-rose-400">Sessão incompleta</h1>
          <p className="text-xs text-slate-400">{incompleteSessionMessage}</p>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Sair e entrar novamente
          </button>
        </div>
      </div>
    );
  }

  // Spinner enquanto a sessao carrega OU (autenticado + perfil carregando)
  if (sessionStatus === "loading" || (sessionStatus === "authenticated" && profileLoading)) {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col items-center justify-center font-mono select-none">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Sincronizando Sessão...</span>
      </div>
    );
  }

  // Formulario de login quando deslogado
  if (sessionStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col items-center justify-center font-mono select-none px-4">
        <div className="w-full max-w-xs space-y-4">
          <h1 className="text-center text-sm uppercase tracking-widest text-indigo-400">
            Minerador Key
          </h1>
          <form onSubmit={handleCredentialsLogin} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="w-full bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-600"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="w-full bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-600"
            />
            {(authError || callbackAuthError) && <p className="text-rose-400 text-xs">{authError || callbackAuthError}</p>}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded px-3 py-2 text-sm font-semibold text-white"
            >
              {authLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
          <p className="text-center text-xs text-slate-500">Ainda não possui acesso? <Link href="/cadastro" className="text-indigo-400 hover:underline">Criar cadastro</Link></p>
        </div>
      </div>
    );
  }

  // Fallback (autenticado, aguardando redirect)
  return (
    <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col items-center justify-center font-mono select-none">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Sincronizando Sessão...</span>
    </div>
  );
}
