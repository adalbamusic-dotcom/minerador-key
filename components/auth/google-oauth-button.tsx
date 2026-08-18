"use client";

import { useState } from "react";
import { startGoogleOAuth } from "@/lib/auth/google-oauth";

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.94v2.79h3.14c1.84-1.7 2.92-4.2 2.92-7.76Z"/><path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.43-2.36l-3.14-2.79c-.87.58-1.99.92-3.29.92-2.53 0-4.68-1.71-5.45-4.01H3.3v2.88A9.72 9.72 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.55 13.51A5.85 5.85 0 0 1 6.25 12c0-.52.09-1.03.3-1.51V7.61H3.3A9.75 9.75 0 0 0 2.25 12c0 1.58.38 3.08 1.05 4.39l3.25-2.88Z"/><path fill="#EA4335" d="M12 6.48c1.43 0 2.72.49 3.73 1.46l2.79-2.79C16.82 3.56 14.62 2.25 12 2.25A9.72 9.72 0 0 0 3.3 7.61l3.25 2.88C7.32 8.19 9.47 6.48 12 6.48Z"/></svg>;
}

export function GoogleOAuthButton({ next = "/conta", enabled = false }: { next?: string; enabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const unavailable = !enabled;

  async function handleClick() {
    setError("");
    setLoading(true);
    try { await startGoogleOAuth(next); } catch { setError("Não foi possível iniciar o login com Google. Tente novamente."); setLoading(false); }
  }

  return <div className="space-y-2">
    <button type="button" disabled={loading || unavailable} onClick={() => void handleClick()} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70 disabled:cursor-not-allowed disabled:opacity-50">
      <GoogleMark />
      {loading ? "Conectando ao Google..." : "Continuar com o Google"}
    </button>
    {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
  </div>;
}
