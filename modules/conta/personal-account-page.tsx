"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { LockKeyhole, ShieldCheck, Store, UserRound } from "lucide-react";
import { WorkspaceFrame, type WorkspaceAgencyLink, type WorkspaceBrandLink } from "@/components/workspace-frame";
import { buildTenantPath } from "@/lib/tenant-routing";

type PersonalAccountPageProps = {
  identity: { name: string | null; email: string | null; image?: string | null };
  brands: WorkspaceBrandLink[];
  agencies: WorkspaceAgencyLink[];
  isPlatformAdmin: boolean;
};

const panel = "rounded-xl border border-foreground/15 bg-foreground/5 p-5";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "U").trim();
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

export function PersonalAccountPage({ identity, brands, agencies, isPlatformAdmin }: PersonalAccountPageProps) {
  return <WorkspaceFrame brands={brands} agencies={agencies}>
    <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
      <header>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sua identidade e seus contextos</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-foreground/70">Esta área pertence à sua conta, não a uma marca ou agência. Os acessos abaixo são confirmados no servidor.</p>
      </header>

      <section className={panel} aria-labelledby="personal-identity">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div role="img" aria-label={identity.image ? "Avatar da conta" : "Avatar não informado"} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-foreground/15 bg-foreground/10 text-xl font-bold text-foreground">
            {identity.image ? <img src={identity.image} alt="Avatar pessoal" className="h-full w-full object-cover" /> : initials(identity.name, identity.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
              <h2 id="personal-identity" className="text-lg font-semibold">Identidade</h2>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-sm text-foreground/60">Nome</dt><dd className="mt-1 break-words font-medium">{identity.name || "Nome não informado"}</dd></div>
              <div><dt className="text-sm text-foreground/60">E-mail</dt><dd className="mt-1 break-words font-medium">{identity.email || "E-mail não informado"}</dd></div>
              <div><dt className="text-sm text-foreground/60">Papel global</dt><dd className="mt-1 font-medium">{isPlatformAdmin ? "Admin global" : "Usuário autenticado"}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={panel} aria-labelledby="personal-security">
          <div className="flex gap-3">
            <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
            <div>
              <h2 id="personal-security" className="text-lg font-semibold">Senha e sessões</h2>
              <p className="mt-2 leading-7 text-foreground/70">A gestão de senha e sessões continua vinculada ao fluxo de autenticação atual.</p>
              <Link href="/recuperar-senha?callbackUrl=%2Fconta" className="mt-3 inline-flex min-h-10 items-center rounded-md border border-foreground/15 px-3 text-sm font-semibold text-context-accent hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">Redefinir senha</Link>
            </div>
          </div>
        </section>

        <section className={panel} aria-labelledby="personal-permissions">
          <div className="flex gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
            <div>
              <h2 id="personal-permissions" className="text-lg font-semibold">Participações e permissões</h2>
              <p className="mt-2 leading-7 text-foreground/70">Você possui {agencies.length} contexto(s) de agência e {brands.length} marca(s) com acesso editorial próprio. Participar de uma agência não concede, por si só, acesso editorial a marcas.</p>
            </div>
          </div>
        </section>
      </div>

      <section className={panel} aria-labelledby="personal-contexts">
        <div className="flex items-center gap-3">
          <Store className="h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
          <div><h2 id="personal-contexts" className="text-lg font-semibold">Acessos operacionais</h2><p className="mt-2 leading-7 text-foreground/70">Somente vínculos confirmados para esta identidade aparecem aqui.</p></div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground/60">Agencies</h3>
            {agencies.length ? <ul className="mt-2 space-y-2">{agencies.map((agency) => <li key={agency.id}><Link href={`/agencias/${agency.agencyRef}`} className="text-sm font-semibold text-context-accent hover:underline">{agency.name}</Link></li>)}</ul> : <p className="mt-2 text-sm text-foreground/60">Nenhuma Agency operacional vinculada.</p>}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground/60">Brands editoriais</h3>
            {brands.length ? <ul className="mt-2 space-y-2">{brands.map((brand) => <li key={brand.id}><Link href={buildTenantPath({ brandId: brand.id, brandName: brand.nome, module: "marca" })} className="text-sm font-semibold text-context-accent hover:underline">{brand.nome}</Link></li>)}</ul> : <p className="mt-2 text-sm text-foreground/60">Nenhuma Brand editorial vinculada.</p>}
          </div>
        </div>
      </section>
    </div>
  </WorkspaceFrame>;
}
