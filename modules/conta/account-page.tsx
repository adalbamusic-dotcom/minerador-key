"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { Check, ChevronDown, Info, LockKeyhole, Minus, ShieldCheck, UserRound } from "lucide-react";
import { ModuleHeader } from "@/components/editorial/operational-screen-shared";
import { buildTenantPath } from "@/lib/tenant-routing";
import {
  ACCOUNT_ACTIONS,
  ACCOUNT_MODULES,
  accountRoleLabel,
  canManageTeam,
  hasPermission,
  resolveAccountAccessOrigin,
  type AccountTenantAccess,
} from "./account-access";

const panel = "rounded-lg border border-slate-800/80 bg-slate-900/40 p-6";
const actionButton = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "U").trim();
  return source.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "U";
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" }) {
  const classes = tone === "success"
    ? "border-emerald-800/70 bg-emerald-950/30 text-emerald-300"
    : "border-slate-700 bg-slate-900/80 text-slate-300";
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

function PermissionMark({ granted }: { granted: boolean }) {
  return granted
    ? <span title="Concedida" aria-label="Permissão concedida" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-950/35 text-emerald-300"><Check className="h-4 w-4" aria-hidden="true"/><span className="sr-only">Concedida</span></span>
    : <span title="Não concedida" aria-label="Permissão não concedida" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900/70 text-slate-500"><Minus className="h-4 w-4" aria-hidden="true"/><span className="sr-only">Não concedida</span></span>;
}

function PersonalProfile({ name, email, image }: { name: string | null | undefined; email: string | null | undefined; image: string | null | undefined }) {
  return <section className={panel} aria-labelledby="account-profile-title">
    <div className="flex items-start justify-between gap-4">
      <div><h2 id="account-profile-title" className="text-xl font-bold text-slate-100">Perfil pessoal</h2><p className="mt-2 max-w-prose text-sm leading-6 text-slate-400">Sua identidade permanece independente da marca ativa.</p></div>
      <UserRound className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true"/>
    </div>
    <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
      <div role="img" aria-label={image ? "Avatar da sessão" : "Avatar não informado"} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-xl font-bold text-slate-100">
        {image ? <img src={image} alt="Avatar pessoal" className="h-full w-full object-cover"/> : initials(name, email)}
      </div>
      <div className="min-w-0">
        <p className="break-words text-lg font-semibold text-slate-100">{name || "Nome não informado"}</p>
        <p className="mt-1 break-words text-sm leading-6 text-slate-400">{email || "E-mail não informado"}</p>
      </div>
    </div>
    <p className="mt-6 border-t border-slate-800/80 pt-4 text-sm leading-6 text-slate-500">Dados exibidos a partir da sessão atual. Edição do nome e do avatar ainda não possui persistência própria neste módulo.</p>
  </section>;
}

function SecurityPanel() {
  return <section className={panel} aria-labelledby="account-security-title">
    <div className="flex items-start justify-between gap-4"><div><h2 id="account-security-title" className="text-xl font-bold text-slate-100">Senha e segurança</h2><p className="mt-2 text-sm leading-6 text-slate-400">Proteja sua conta com recursos que tenham confirmação real.</p></div><LockKeyhole className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true"/></div>
    <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-800/35 p-4"><Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" aria-hidden="true"/><div><h3 className="text-base font-semibold text-slate-100">Alteração de senha temporariamente indisponível</h3><p className="mt-2 text-sm leading-6 text-slate-400">O recurso será liberado após uma atualização segura da autenticação. Nenhuma alteração insegura será realizada.</p></div></div>
  </section>;
}

function PermissionMatrix({ access }: { access: AccountTenantAccess }) {
  return <div id="account-permissions-details" className="mt-6 overflow-x-auto rounded-lg border border-slate-800/80" tabIndex={0} aria-label="Tabela de permissões detalhadas">
    <table className="min-w-[780px] w-full text-left text-sm">
      <caption className="sr-only">Permissões reais por módulo na marca atual</caption>
      <thead className="bg-slate-900 text-sm text-slate-300"><tr><th scope="col" className="sticky left-0 z-10 bg-slate-900 px-4 py-3 text-left font-semibold">Módulo</th>{ACCOUNT_ACTIONS.map(action => <th key={action.id} scope="col" className="px-3 py-3 text-center font-semibold">{action.label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-800/80">{ACCOUNT_MODULES.map(module => <tr key={module.id} className="text-slate-300"><th scope="row" className="sticky left-0 z-[1] whitespace-nowrap bg-slate-950 px-4 py-3 font-semibold text-slate-100">{module.label}</th>{ACCOUNT_ACTIONS.map(action => <td key={action.id} className="px-3 py-3 text-center"><PermissionMark granted={hasPermission(access, module.id, action.id)}/></td>)}</tr>)}</tbody>
    </table>
  </div>;
}

function AccessPanel({ access }: { access: AccountTenantAccess }) {
  const origin = resolveAccountAccessOrigin(access);
  const isFullAccess = origin !== "membership";
  const [detailsOpen, setDetailsOpen] = useState(!isFullAccess);
  const originLabel = origin === "global_admin" ? "Admin global" : origin === "owner" ? "Propriedade da marca" : "Membership";
  const statusLabel = origin === "global_admin" ? "Acesso administrativo global" : origin === "owner" ? "Acesso derivado da propriedade" : "Membership ativa";
  const manageHref = buildTenantPath({ brandId: access.brandId, brandName: access.brandName, module: "marca" });
  return <section className={`${panel} md:col-span-2`} aria-labelledby="account-access-title">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><h2 id="account-access-title" className="text-xl font-bold text-slate-100">Seu acesso nesta marca</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Acesso consultado para a marca atual. Conta não altera papéis ou permissões.</p></div>{canManageTeam(access) && <Link href={`${manageHref}?secao=equipe`} className={actionButton}>Gerenciar equipe e permissões</Link>}</div>
    <div className="mt-6 grid gap-4 border-y border-slate-800/80 py-5 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marca</p><p className="mt-1 text-base font-semibold text-slate-100">{access.brandName}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Origem</p><p className="mt-1 text-base font-semibold text-slate-100">{originLabel}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Papel</p><p className="mt-1 text-base font-semibold text-slate-100">{accountRoleLabel(access)}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p><p className="mt-1"><Badge tone="success">{statusLabel}</Badge></p></div>
    </div>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-base font-semibold text-slate-100">Permissões</p><p className="mt-1 text-sm text-slate-400">{isFullAccess ? "Acesso integral aos módulos e ações previstos." : "Consulte o que está concedido e o que permanece não concedido."}</p></div>{isFullAccess && <button type="button" onClick={() => setDetailsOpen(value => !value)} className={actionButton} aria-expanded={detailsOpen} aria-controls="account-permissions-details">{detailsOpen ? "Ocultar permissões" : "Ver permissões detalhadas"}<ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} aria-hidden="true"/></button>}</div>
    {detailsOpen && <PermissionMatrix access={access}/>}
  </section>;
}

function PreferencesPanel() {
  return <section className="md:col-span-2 border-t border-slate-800/80 pt-6" aria-labelledby="account-preferences-title">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true"/><div><h2 id="account-preferences-title" className="text-xl font-bold text-slate-100">Preferências</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Nenhuma preferência pessoal persistida está disponível para edição nesta conta. Configurações da marca, identidade da marca, Site/Sitemap e permissões ficam fora desta área.</p></div></div>
  </section>;
}

export function AccountPage({ tenant }: { tenant: AccountTenantAccess }) {
  const { data: session, status } = useSession();
  const name = session?.user?.name;
  const email = session?.user?.email;
  const image = session?.user?.image;

  if (status === "loading") return <><ModuleHeader title="Conta" description="Identidade pessoal e acesso à marca atual."/><main className="p-4 sm:p-6"><div className="flex min-h-48 items-center justify-center text-sm text-slate-400" role="status">Carregando dados da conta…</div></main></>;
  if (status === "unauthenticated") return <><ModuleHeader title="Conta" description="Identidade pessoal e acesso à marca atual."/><main className="p-4 sm:p-6"><div className={`${panel} mx-auto max-w-2xl`} role="alert"><h2 className="text-xl font-bold text-slate-100">Sessão não disponível</h2><p className="mt-2 text-sm leading-6 text-slate-400">Entre novamente para consultar sua conta.</p></div></main></>;

  return <><ModuleHeader title="Conta" description="Identidade pessoal e acesso à marca atual."/><main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8" aria-labelledby="account-page-title"><div><h1 id="account-page-title" className="text-2xl font-bold tracking-tight text-slate-100">Minha conta</h1><p className="mt-2 max-w-2xl text-base leading-7 text-slate-400">Gerencie seus dados pessoais, segurança e acesso à marca atual.</p></div><div className="grid gap-6 md:grid-cols-2"><PersonalProfile name={name} email={email} image={image}/><SecurityPanel/><AccessPanel access={tenant}/><PreferencesPanel/></div></main></>;
}
