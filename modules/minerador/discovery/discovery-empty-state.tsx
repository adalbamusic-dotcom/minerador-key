import { SearchX } from "lucide-react";

export function DiscoveryEmptyState() {
  return (
    <div className="flex min-h-48 items-center justify-center px-6 py-10 text-center">
      <div className="max-w-xl">
        <SearchX className="mx-auto h-6 w-6 text-text-muted" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-foreground">Nenhuma keyword na Descoberta.</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          As candidatas aparecerão aqui depois de uma descoberta ou importação.
        </p>
      </div>
    </div>
  );
}
