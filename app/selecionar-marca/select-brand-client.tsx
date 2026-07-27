"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { buildTenantPath, type TenantRouteModule } from "@/lib/tenant-routing";

type Tenant = { id: string; nome: string };
const tenantModules: TenantRouteModule[] = ["marca", "conta", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"];

function moduleFromContinuation(value: string): TenantRouteModule {
  const candidate = value.replace(/^\/+/, "").split("?")[0] as TenantRouteModule;
  return tenantModules.includes(candidate) ? candidate : "marca";
}

export function SelectBrandClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const destinationParam = searchParams.get("destino");
  const continuation = searchParams.get("continuar") || (destinationParam ? `/${destinationParam.replace(/^\/+/, "")}` : "/");
  const destination = (tenant: Tenant) => {
    const path = continuation.startsWith("/") ? continuation : "/";
    const [pathname, query] = path.split("?");
    const target = buildTenantPath({ brandId: tenant.id, brandName: tenant.nome, module: moduleFromContinuation(pathname) });
    return query ? `${target}?${query}` : target;
  };

  useEffect(() => {
    void fetch("/api/tenants", { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar marcas.");
        setTenants(body.tenants || []);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Não foi possível carregar marcas."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tenants.length === 1) router.replace(destination(tenants[0]));
  }, [router, tenants]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen bg-[#06070a] p-6 text-slate-200">
      <section className="mx-auto max-w-lg rounded border border-slate-800 bg-[#0b0c10] p-6">
        <h1 className="text-sm font-bold">Selecione uma marca</h1>
        <p className="mt-2 text-xs text-slate-400">A escolha é validada no servidor a cada rota; nenhuma marca é inferida do armazenamento local.</p>
        {error ? <p className="mt-4 text-xs text-rose-400">{error}</p> : loading ? <p className="mt-4 text-xs text-slate-400">Verificando associações autorizadas...</p> : tenants.length ? <div className="mt-4 grid gap-2">{tenants.map(tenant => <Link key={tenant.id} className="rounded border border-slate-800 px-3 py-2 text-xs hover:border-indigo-500" href={destination(tenant)}>{tenant.nome}</Link>)}</div> : (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-amber-300">Aguardando associação a uma marca ou convite.</p>
            <p className="text-[11px] text-slate-500">Nenhuma lista ou keyword de marca é consultada enquanto sua identidade não tiver acesso autorizado.</p>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="w-full rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-indigo-500">Sair da conta</button>
          </div>
        )}
      </section>
    </main>
  );
}
