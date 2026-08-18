import { forwardRef, type ComponentPropsWithoutRef } from "react";

type KeywordTableShellProps = ComponentPropsWithoutRef<"main"> & { scroll?: "both" | "x" };

/** Shared structural viewport for Minerador tables. It intentionally owns no data or workflow. */
export const KeywordTableShell = forwardRef<HTMLElement, KeywordTableShellProps>(function KeywordTableShell({ className = "", scroll = "both", ...props }, ref) {
  const overflow = scroll === "x" ? "overflow-x-auto overflow-y-visible" : "flex-1 overflow-auto";
  return <main ref={ref} className={`relative min-w-0 max-w-full ${overflow} ${className}`.trim()} {...props}/>;
});
