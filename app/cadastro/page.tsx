"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CadastroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, passwordConfirmation }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir o cadastro.");
      setSuccess(body.message || "Cadastro concluído. Aguardando associação a uma marca ou convite.");
      setPassword("");
      setPasswordConfirmation("");
      window.setTimeout(() => router.push("/login"), 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir o cadastro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#06070a] text-slate-200 flex items-center justify-center px-4">
      <section className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-sm uppercase tracking-widest text-indigo-400">Criar cadastro</h1>
          <p className="mt-2 text-xs text-slate-500">Seu cadastro cria apenas a identidade. A associação a uma marca é explícita.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-800 bg-slate-900/30 p-4">
          <input type="text" required value={name} onChange={event => setName(event.target.value)} placeholder="Nome" autoComplete="name" className="w-full bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-600" />
          <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="E-mail" autoComplete="email" className="w-full bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-600" />
          <input type="password" required minLength={6} value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha" autoComplete="new-password" className="w-full bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-600" />
          <input type="password" required minLength={6} value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} placeholder="Confirmar senha" autoComplete="new-password" className="w-full bg-slate-900/60 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-indigo-600" />
          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
          {success ? <p className="text-xs text-emerald-400">{success}</p> : null}
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded px-3 py-2 text-sm font-semibold text-white">{loading ? "Cadastrando..." : "Criar cadastro"}</button>
        </form>
        <p className="text-center text-xs text-slate-500">Já possui acesso? <Link href="/login" className="text-indigo-400 hover:underline">Entrar</Link></p>
      </section>
    </main>
  );
}
