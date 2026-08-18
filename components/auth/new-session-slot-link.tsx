import Link from "next/link";

export function NewSessionSlotLink({ next, label = "Entrar em outra conta" }: { next: string; label?: string }) {
  const href = `/auth/new-slot?next=${encodeURIComponent(next)}`;
  return <Link href={href} className="inline-flex min-h-9 items-center rounded-md border border-slate-700 px-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70">{label}</Link>;
}
