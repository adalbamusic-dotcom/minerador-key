/** Shared typography for compact textual controls inside the GlobalTopbar. */
export const GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY = "text-xs font-medium leading-5";

/** Shared neutral action geometry for module controls rendered in the topbar center slot. */
export const GLOBAL_TOPBAR_ACTION_CONTROL = `inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-divider bg-surface-subtle px-1 ${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} text-foreground/75 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-40`;

/** Shared page-mode tab geometry. Active state is added by the page consumer. */
export const GLOBAL_TOPBAR_PAGE_TAB = `inline-flex min-h-8 shrink-0 items-center whitespace-nowrap rounded-md border border-transparent px-2 ${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} text-foreground/70 transition-colors hover:border-module-accent/25 hover:bg-module-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35`;

/** Shared active state for page-mode tabs; it remains neutral with a restrained module accent. */
export const GLOBAL_TOPBAR_PAGE_TAB_ACTIVE = "border-module-accent/40 bg-module-accent/10 text-foreground";

/** Shared no-wrap tab group used inside the flexible page-mode slot. */
export const GLOBAL_TOPBAR_PAGE_TABS = "flex min-w-0 items-center gap-0.5";
