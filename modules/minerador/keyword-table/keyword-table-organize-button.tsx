import { ListFilter } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

type KeywordTableOrganizeButtonProps = ComponentPropsWithoutRef<"button"> & { labelClassName?: string };

/** Shared Organizar trigger used by both Minerador tables. */
export const KeywordTableOrganizeButton = forwardRef<HTMLButtonElement, KeywordTableOrganizeButtonProps>(function KeywordTableOrganizeButton({ className = "", labelClassName = "", ...props }, ref) {
  return <button ref={ref} type="button" data-keyword-table-organize-button className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded border border-divider px-2.5 py-1 text-sm font-semibold text-foreground/80 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40 ${className}`.trim()} {...props}>
    <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
    <span className={labelClassName}>{"Organizar"}</span>
  </button>;
});
