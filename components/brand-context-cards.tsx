"use client";

import Link from "next/link";
import { ArrowRight, Globe, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { internalButton, internalSurface } from "@/components/editorial/internal-page-visual";

export type BrandContextCard = {
  id: string;
  name: string;
  status: string;
  ownerUserId: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  membershipCount: number;
  siteUrl: string | null;
  strategySummary: string | null;
  agencyName?: string | null;
  authorizedForEditorial?: boolean;
};

function ownerLabel(brand: Pick<BrandContextCard, "ownerUserId" | "ownerName" | "ownerEmail">) {
  return brand.ownerName || brand.ownerEmail || (brand.ownerUserId ? "Owner confirmado" : "Não definido");
}

function statusLabel(value: string) {
  return value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : value === "inactive" ? "Inativa" : value;
}

function agencyStatusClass(value: string) {
  return value === "active" ? "border-success/35 text-success" : value === "suspended" ? "border-warning/35 text-warning" : "border-divider text-text-muted";
}

function externalSiteHref(siteUrl: string) {
  return siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
}

export function AgencyBrandCard({ brand, brandHref, showStrategySummary = true }: { brand: BrandContextCard; brandHref?: string; showStrategySummary?: boolean }) {
  return <article className={`${internalSurface} flex min-h-64 flex-col p-5`}>
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm font-semibold text-text-muted">Marca</p><h2 className="mt-2 text-lg font-semibold text-foreground">{brand.name}</h2></div>
      <div className="flex items-start gap-2"><span className={`rounded-md border px-2 py-1 text-sm font-medium ${agencyStatusClass(brand.status)}`}>{statusLabel(brand.status)}</span>{brandHref ? <details className="relative"><summary className={`${internalButton} min-h-9 min-w-9 cursor-pointer list-none p-0`} aria-label={`Ações da Marca ${brand.name}`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></summary><div className="absolute right-0 top-11 z-20 w-64 rounded-lg border border-divider bg-surface-elevated p-2 shadow-md"><Link href={`${brandHref}?secao=configuracoes`} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30"><Pencil className="h-4 w-4" aria-hidden="true" />Editar cadastro</Link><Link href={`${brandHref}?secao=equipe`} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30"><Users className="h-4 w-4" aria-hidden="true" />Administrar colaboradores</Link><p className="mt-2 border-t border-divider px-3 pt-2 text-xs leading-5 text-text-muted">Permissões da Agência e ações de ciclo de vida dependem de contrato próprio e não estão disponíveis nesta fase.</p></div></details> : null}</div>
    </div>

    <dl className="mt-5 grid gap-3 border-y border-divider py-4 text-sm"><div className="flex items-center justify-between gap-3"><dt className="text-text-muted">Owner</dt><dd className="max-w-48 truncate font-medium text-foreground" title={ownerLabel(brand)}>{ownerLabel(brand)}</dd></div><div className="flex items-center justify-between gap-3"><dt className="inline-flex items-center gap-2 text-text-muted"><Users className="h-4 w-4" aria-hidden="true" />Colaboradores ativos</dt><dd className="font-medium text-foreground">{brand.membershipCount}</dd></div></dl>
    {brand.siteUrl ? <a href={externalSiteHref(brand.siteUrl)} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-context-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30"><Globe className="h-4 w-4" aria-hidden="true" />{brand.siteUrl}</a> : null}
    {showStrategySummary ? (brand.strategySummary ? <p className="mt-4 line-clamp-3 text-sm leading-6 text-text-muted">{brand.strategySummary}</p> : <p className="mt-4 text-sm leading-6 text-text-muted">Resumo estratégico ainda não informado.</p>) : null}
    <div className="mt-auto pt-5">{brand.authorizedForEditorial && brandHref ? <Link href={brandHref} className={`${internalButton} min-h-11 w-full px-4`}>Entrar na Marca <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link> : <p className="rounded-md border border-divider px-3 py-3 text-sm text-text-muted">Sem acesso editorial individual.</p>}</div>
  </article>;
}

export function AdminBrandStructureCard({ brand, onEdit, onDelete }: { brand: BrandContextCard; onEdit: () => void; onDelete: () => void }) {
  return <article className="rounded-xl border border-foreground/15 bg-foreground/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-foreground/60">Registro estrutural</p><h2 className="mt-2 text-lg font-semibold text-foreground">{brand.name}</h2></div><span className="rounded-md border border-foreground/15 px-2 py-1 text-sm font-medium text-foreground/75">{statusLabel(brand.status)}</span></div><dl className="mt-5 grid gap-3 border-y border-foreground/10 py-4 text-sm"><div className="flex items-center justify-between gap-3"><dt className="text-foreground/60">Agência vinculada</dt><dd className="font-medium text-foreground">{brand.agencyName || "Sem agência ativa"}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-foreground/60">Owner</dt><dd className="max-w-48 truncate font-medium text-foreground" title={ownerLabel(brand)}>{ownerLabel(brand)}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-foreground/60">Colaboradores</dt><dd className="font-medium text-foreground">{brand.membershipCount}</dd></div></dl><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Pencil className="h-4 w-4" aria-hidden="true" />Administrar</button><button type="button" onClick={onDelete} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm font-semibold text-foreground/75 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir</button></div></article>;
}
