import type { ReactNode } from "react";

export function KeywordTableEmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`flex min-h-56 items-center justify-center px-6 py-10 text-center ${className}`.trim()}>{children}</section>;
}
