import type { ReactNode } from "react";

export function KeywordTableHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <thead className={className}>{children}</thead>;
}
