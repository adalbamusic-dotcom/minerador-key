import type { ReactNode } from "react";

export function KeywordTableBulkBarShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <footer aria-label="Ações das keywords selecionadas" data-keyword-table-bulk-bar className={`fixed bottom-0 left-[var(--minerador-sidebar-width,0px)] right-0 z-30 flex h-11 min-h-11 min-w-0 flex-nowrap items-center gap-2 overflow-hidden border-t border-divider bg-surface-elevated px-3 py-1 shadow-lg animate-in slide-in-from-bottom-12 ${className}`.trim()}>{children}</footer>;
}
