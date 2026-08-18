export default function BrandTenantContentLoading() {
  return <div className="p-5 sm:p-8" aria-busy="true" aria-live="polite">
    <div className="mx-auto max-w-5xl rounded-xl border border-foreground/15 bg-foreground/5 p-5">
      <p className="text-sm font-medium text-foreground">Carregando conte\u00fado da marca...</p>
      <p className="mt-2 text-sm leading-6 text-foreground/70">A marca da URL continua sendo confirmada no servidor.</p>
    </div>
  </div>;
}
