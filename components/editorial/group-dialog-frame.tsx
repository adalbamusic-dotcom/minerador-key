"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A MOLDURA DOS DIÁLOGOS DO GRUPO (Gerenciar a cor, Histórico do grupo, Excluir
 * tudo da cor). Extraída de `group-manage-dialogs.tsx` em 2026-10-14 (F7) para
 * os três usarem a mesma, sem estilo próprio por tela (sistema visual §6, §7).
 */

export const GROUP_DIALOG_BUTTON = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-divider px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:cursor-not-allowed disabled:opacity-50";
export const GROUP_DIALOG_BUTTON_PRIMARY = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-action-accent px-3 text-sm font-semibold text-foreground transition-colors hover:bg-action-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:cursor-not-allowed disabled:opacity-50";
/** A variante `danger` da exclusão comum (`components/lifecycle/delete-confirmation.tsx`). */
export const GROUP_DIALOG_BUTTON_DANGER = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-danger/50 bg-danger-soft px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:cursor-not-allowed disabled:opacity-50";
export const GROUP_DIALOG_FIELD = "min-h-10 w-full rounded-md border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted hover:border-module-accent/45 focus-visible:border-module-accent focus-visible:ring-2 focus-visible:ring-module-accent/30";

export type GroupDialogNotice = { tone: "success" | "warning" | "danger"; text: string } | null;

export const GROUP_DIALOG_TONE: Record<"success" | "warning" | "danger" | "neutral", string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-text-muted",
};

export function GroupDialogFrame({ titleId, title, subtitle, onClose, busy, children, footer }: {
  titleId: string;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const fechar = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") fechar(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fechar]);
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) fechar(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-divider bg-surface-elevated text-foreground shadow-lg">
        <header className="flex items-start justify-between gap-3 border-b border-divider p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="flex flex-wrap items-center gap-2 text-base font-semibold">{title}</h2>
            {subtitle ? <div className="mt-1 text-sm leading-5 text-text-muted">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={fechar} disabled={busy} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:opacity-50" aria-label="Fechar"><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-divider p-4">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function GroupDialogNoticeLine({ aviso, testId }: { aviso: GroupDialogNotice; testId: string }) {
  if (!aviso) return null;
  return <p role={aviso.tone === "danger" ? "alert" : "status"} data-testid={testId} className={`text-sm leading-5 ${GROUP_DIALOG_TONE[aviso.tone]}`}>{aviso.text}</p>;
}
