"use client";

import { ClipboardPaste, Upload } from "lucide-react";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";

export function DiscoverySourceTopbarActions({ onManual, onCsv }: { onManual: () => void; onCsv: () => void }) {
  return <div className="flex min-w-0 items-center gap-1" data-minerador-discovery-source-actions aria-label="Entradas da Descoberta">
    <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} onClick={onManual} aria-label="Colar keywords" title="Colar keywords"><ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden xl:inline">Colar keywords</span></button>
    <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} onClick={onCsv} aria-label="Importar CSV" title="Importar CSV"><Upload className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden xl:inline">Importar CSV</span></button>
  </div>;
}
