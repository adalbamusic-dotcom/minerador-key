import { Suspense } from "react";
import { SelectBrandClient } from "./select-brand-client";

function SelectBrandFallback() {
  return <main className="min-h-screen bg-[#06070a] p-6 text-slate-200"><section className="mx-auto max-w-lg rounded border border-slate-800 bg-[#0b0c10] p-6"><h1 className="text-sm font-bold">Selecione uma marca</h1><p className="mt-4 text-xs text-slate-400">Carregando marcas acessíveis…</p></section></main>;
}

export default function SelectTenantPage() {
  return <Suspense fallback={<SelectBrandFallback />}><SelectBrandClient /></Suspense>;
}
