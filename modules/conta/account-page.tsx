"use client";

import { useSession } from "next-auth/react";
import { ModuleHeader, Field, card } from "@/components/editorial/operational-screen-shared";

export function AccountPage() {
  const { data: session } = useSession(); return <><ModuleHeader title="Conta" description="Identidade e segurança separadas da empresa."/><main className="p-4"><div className="grid gap-3 md:grid-cols-2"><section className={card}><h2 className="text-xs font-bold">Dados pessoais</h2><dl className="mt-3 space-y-2"><Field label="Nome" value={session?.user?.name}/><Field label="E-mail" value={session?.user?.email}/><Field label="Foto" value={session?.user?.image ? "Disponível" : "Não informada"}/></dl></section><section className={card}><h2 className="text-xs font-bold">Autenticação e segurança</h2><p className="mt-3 text-[10px] text-slate-500">Senha, sessões, MFA e preferências pessoais ainda não possuem alteração nesta aplicação.</p><div className="mt-3 rounded border border-slate-800 p-2 text-[10px] text-slate-600">Visualizações salvas ficam temporariamente no navegador, separadas por usuário, marca e módulo. Nenhuma alteração de marca pode ser realizada por esta área.</div></section></div></main></>;
}


