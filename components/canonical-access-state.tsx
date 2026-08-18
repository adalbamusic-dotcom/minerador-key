import Link from "next/link";

type CanonicalAccessStateProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  status?: "loading" | "denied" | "unavailable";
};

/** A neutral boundary shown before a canonical authorization result is known. */
export function CanonicalAccessState({
  title,
  description,
  actionHref,
  actionLabel,
  status = "unavailable",
}: CanonicalAccessStateProps) {
  const statusClass = status === "denied"
    ? "border-amber-900/60 bg-amber-950/20 text-amber-100"
    : "border-slate-800 bg-slate-900/40 text-slate-200";

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-6 text-slate-200 sm:px-6">
    <section className={`w-full max-w-lg rounded-lg border p-6 ${statusClass}`} aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {status === "loading" ? "Verificando contexto" : "Acesso canônico"}
      </p>
      <h1 className="mt-2 text-xl font-semibold text-slate-100">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
      {actionHref && actionLabel ? <Link className="mt-5 inline-flex rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70" href={actionHref}>{actionLabel}</Link> : null}
    </section>
  </main>;
}
