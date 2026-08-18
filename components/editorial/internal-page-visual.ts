/**
 * Additive visual primitives for the internal Brand, Agency and Admin pages.
 *
 * These classes intentionally do not replace the legacy operational exports
 * used by Minerador, Radar, Redator and the other workflow screens. Consumers
 * must opt in explicitly so a visual correction cannot leak into those modules.
 */
export const internalSurface = "rounded-lg border border-divider bg-surface p-4";
export const internalSurfaceSubtle = "rounded-lg border border-divider bg-surface-subtle p-4";
export const internalSection = "border-t border-divider pt-6";

export const internalField = "min-h-10 w-full rounded-md border border-divider bg-surface-subtle px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted hover:border-module-accent/25 hover:bg-surface focus:border-module-accent/50 focus:ring-2 focus:ring-module-accent/20 disabled:cursor-not-allowed disabled:opacity-60";

export const internalButton = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-divider bg-surface-subtle px-3 text-sm font-semibold text-foreground transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50";
export const internalButtonPrimary = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-action-accent px-3 text-sm font-semibold text-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50";
export const internalButtonDanger = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-danger/50 bg-danger-soft px-3 text-sm font-semibold text-danger transition-colors hover:border-danger hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:cursor-not-allowed disabled:opacity-50";

export const internalNoticeError = "rounded-md border border-danger/35 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger";
export const internalNoticeSuccess = "rounded-md border border-success/35 bg-success-soft px-3 py-2 text-sm leading-6 text-success";
export const internalNoticeWarning = "rounded-md border border-warning/35 bg-warning-soft px-3 py-2 text-sm leading-6 text-warning";

export const internalBadge = "inline-flex items-center rounded-md border border-divider px-3 py-1 text-sm font-semibold";
export const internalSelected = "bg-selected";
