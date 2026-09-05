"use client";

import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Check, CheckCircle2, CircleX, Clock3, Copy, Info, TriangleAlert, X } from "lucide-react";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { createNoticeRecord, formatNoticeDiagnostic, NOTICE_PREVIEW_DURATION_MS, NOTICE_SEVERITIES, NOTICE_TOAST_DURATION_MS, type NoticeRecord, type NoticeScope, type NoticeSeverity, type PublishNoticeInput } from "@/lib/visual-notice-contract";
import { resolveNoticeScope } from "@/lib/visual-notice-scope";

type NoticeCenterValue = {
  notices: NoticeRecord[];
  currentScope: NoticeScope | null;
  autoOpenNotice: NoticeRecord | null;
  toast: NoticeRecord | null;
  publishNotice: (input: PublishNoticeInput) => NoticeRecord;
  consumeAutoOpenNotice: (id: string) => void;
  markNoticeRead: (id: string) => void;
  markAllNoticesRead: () => void;
  unreadCount: number;
  /** @deprecated Use markNoticeRead. Kept as a compatibility alias for existing producers. */
  dismissNotice: (id: string) => void;
  dismissToast: (id: string) => void;
};

const NoticeCenterContext = createContext<NoticeCenterValue | null>(null);

const toneClasses: Record<NoticeSeverity, string> = {
  SUCCESS: "text-success",
  INFO: "text-context-accent",
  PENDING: "text-pending",
  WARNING: "text-warning",
  ERROR: "text-danger",
};

const severityLabels: Record<NoticeSeverity, string> = {
  SUCCESS: "Sucesso",
  INFO: "Informação",
  PENDING: "Pendente",
  WARNING: "Atenção",
  ERROR: "Erro",
};

const metadataLabels: Record<string, string> = {
  summary: "Resumo",
  source: "Origem",
  executedAt: "Executada em",
  targeting: "Targeting",
  providerMetrics: "Métricas do provider",
};

function formatMetadataValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "executedAt" && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString("pt-BR");
  }
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatNoticeTime(createdAt: number) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Horário indisponível";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function NoticeMetadata({ metadata }: { metadata?: Record<string, unknown> }) {
  const entries = Object.entries(metadata || {});
  if (!entries.length) return null;
  return <dl className="mt-2 space-y-1 border-t border-divider pt-2">
    {entries.map(([key, value]) => <div key={key} className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 text-xs leading-5">
      <dt className="text-text-muted">{metadataLabels[key] || key}</dt>
      <dd className="min-w-0 truncate text-foreground/80" title={formatMetadataValue(key, value)}>{formatMetadataValue(key, value)}</dd>
    </div>)}
  </dl>;
}

function SeverityIcon({ severity, className = "h-4 w-4" }: { severity: NoticeSeverity; className?: string }) {
  const props = { className, "aria-hidden": true } as const;
  if (severity === "SUCCESS") return <CheckCircle2 {...props} />;
  if (severity === "INFO") return <Info {...props} />;
  if (severity === "PENDING") return <Clock3 {...props} />;
  if (severity === "WARNING") return <TriangleAlert {...props} />;
  return <CircleX {...props} />;
}

function noticeBelongsToScope(notice: NoticeRecord, currentScope: NoticeScope | null) {
  if (!notice.scope || !currentScope) return false;
  return notice.scope.key === currentScope.key
    || (notice.scope.scopeType === "global" && notice.scope.module === "plataforma");
}

export function GlobalNoticeProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [toast, setToast] = useState<NoticeRecord | null>(null);
  const [autoOpenNotice, setAutoOpenNotice] = useState<NoticeRecord | null>(null);
  const pathname = usePathname();
  const currentScope = useMemo(() => resolveNoticeScope(pathname), [pathname]);
  const { actorUserId, status: sessionStatus } = useSupabaseSession();
  const previousActorUserIdRef = useRef<string | null | undefined>(undefined);

  const publishNotice = useCallback((input: PublishNoticeInput) => {
    const scope = input.scope || (currentScope ? { ...currentScope, area: input.area || currentScope.area } : undefined);
    const record = createNoticeRecord({ ...input, scope });
    if (scope) {
      setNotices((current) => [record, ...current]);
      setAutoOpenNotice(record);
    }
    setToast(input.showToast && scope ? record : null);
    return record;
  }, [currentScope]);

  const markNoticeRead = useCallback((id: string) => {
    const readAt = Date.now();
    setNotices((current) => current.map((notice) => notice.id === id
      ? { ...notice, readAt: notice.readAt || readAt, readState: "read" }
      : notice));
  }, []);

  const markAllNoticesRead = useCallback(() => {
    const readAt = Date.now();
    setNotices((current) => current.map((notice) => notice.readState === "unread"
      && noticeBelongsToScope(notice, currentScope)
      ? { ...notice, readAt, readState: "read" }
      : notice));
  }, [currentScope]);

  const dismissNotice = markNoticeRead;

  const dismissToast = useCallback((id: string) => {
    setToast((current) => current?.id === id ? null : current);
  }, []);

  const consumeAutoOpenNotice = useCallback((id: string) => {
    setAutoOpenNotice((current) => current?.id === id ? null : current);
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    const previousActorUserId = previousActorUserIdRef.current;
    if (previousActorUserId !== undefined && previousActorUserId !== actorUserId) {
      setNotices([]);
      setToast(null);
      setAutoOpenNotice(null);
    }
    previousActorUserIdRef.current = actorUserId;
  }, [actorUserId, sessionStatus]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dismissToast(toast.id), NOTICE_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dismissToast, toast]);

  const visibleNotices = useMemo(() => currentScope
    ? notices.filter((notice) => noticeBelongsToScope(notice, currentScope))
    : [], [currentScope, notices]);
  const unreadCount = visibleNotices.reduce((count, notice) => count + (notice.readState === "unread" ? 1 : 0), 0);
  const value = useMemo(() => ({ notices: visibleNotices, currentScope, autoOpenNotice, toast, publishNotice, consumeAutoOpenNotice, markNoticeRead, markAllNoticesRead, unreadCount, dismissNotice, dismissToast }), [autoOpenNotice, consumeAutoOpenNotice, currentScope, dismissNotice, dismissToast, markAllNoticesRead, markNoticeRead, publishNotice, toast, unreadCount, visibleNotices]);

  return <NoticeCenterContext.Provider value={value}>
    {children}
    <NoticeToast notice={toast} onDismiss={dismissToast} />
  </NoticeCenterContext.Provider>;
}

export function useNoticeCenter() {
  const value = useContext(NoticeCenterContext);
  if (!value) throw new Error("useNoticeCenter deve ser usado dentro de GlobalNoticeProvider.");
  return value;
}

type LegacyNoticeValue = string | { type?: string; tone?: string; message?: string } | null | undefined;

/**
 * Bridges an existing inline notice into the shared center without replacing
 * the module's immediate feedback. It deliberately keeps the local UI state
 * as the source for the inline message and publishes only new non-empty text.
 */
export function useNoticeBridge({
  notice,
  module,
  area,
  title = area,
  source = "workflow",
  fallbackSeverity = "INFO",
}: {
  notice: LegacyNoticeValue;
  module: string;
  area: string;
  title?: string;
  source?: PublishNoticeInput["source"];
  fallbackSeverity?: NoticeSeverity;
}) {
  const { publishNotice } = useNoticeCenter();
  const lastPublished = useRef("");
  const text = typeof notice === "string" ? notice : notice?.message || "";
  const rawSeverity = typeof notice === "object" && notice ? notice.type || notice.tone : undefined;
  const severity: NoticeSeverity = rawSeverity === "success" ? "SUCCESS" : rawSeverity === "error" ? "ERROR" : rawSeverity === "warning" ? "WARNING" : rawSeverity === "pending" ? "PENDING" : fallbackSeverity;

  useEffect(() => {
    if (!text) {
      lastPublished.current = "";
      return;
    }
    const signature = `${module}:${area}:${severity}:${text}`;
    if (signature === lastPublished.current) return;
    lastPublished.current = signature;
    publishNotice({ severity, title, message: text, source, module, area });
  }, [area, module, publishNotice, severity, source, text, title]);
}

function NoticeActions({ notice, onMarkRead, onDismiss }: { notice: NoticeRecord; onMarkRead?: (id: string) => void; onDismiss?: (id: string) => void }) {
  const copyDiagnostic = () => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(formatNoticeDiagnostic(notice));
  };

  return <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
    <button type="button" onClick={copyDiagnostic} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      Copiar diagnóstico
    </button>
    {onDismiss ? <button type="button" onClick={() => onDismiss(notice.id)} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
      <X className="h-3.5 w-3.5" aria-hidden="true" /> Fechar
    </button> : <button type="button" onClick={() => onMarkRead?.(notice.id)} disabled={notice.readState === "read"} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent disabled:cursor-default disabled:opacity-60">
      <Check className="h-3.5 w-3.5" aria-hidden="true" /> {notice.readState === "read" ? "Lido" : "Marcar como lido"}
    </button>}
  </div>;
}

function NoticeToast({ notice, onDismiss }: { notice: NoticeRecord | null; onDismiss: (id: string) => void }) {
  if (!notice) return null;
  return <div className="pointer-events-none fixed inset-x-4 top-14 z-50 flex justify-end sm:left-auto sm:max-w-md" aria-live="polite">
    <div className="pointer-events-auto w-full rounded-lg border border-divider bg-surface-elevated p-4 shadow-lg" role="status">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle ${toneClasses[notice.severity]}`} aria-hidden="true">
          <SeverityIcon severity={notice.severity} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${toneClasses[notice.severity]}`}>{severityLabels[notice.severity]}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{notice.title}</p>
            </div>
            <button type="button" onClick={() => onDismiss(notice.id)} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label="Fechar aviso">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-sm leading-6 text-foreground/80">{notice.message}</p>
          <NoticeActions notice={notice} onDismiss={onDismiss} />
        </div>
      </div>
    </div>
  </div>;
}

type NoticePanelPosition = {
  top: number;
  right: number;
};

export function NotificationBell() {
  const { notices, unreadCount, markNoticeRead, markAllNoticesRead, currentScope, autoOpenNotice, consumeAutoOpenNotice } = useNoticeCenter();
  const [open, setOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState<NoticePanelPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previewTimerRef = useRef<number | null>(null);
  const panelModeRef = useRef<"manual" | "preview" | null>(null);
  const panelInteractionRef = useRef(false);
  const focusPanelOnOpenRef = useRef(false);
  const panelId = "global-notification-center";

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current === null) return;
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }, []);

  const closePanel = useCallback((restoreFocus = true) => {
    clearPreviewTimer();
    setOpen(false);
    setPanelPosition(null);
    setDetailsId(null);
    panelModeRef.current = null;
    panelInteractionRef.current = false;
    if (restoreFocus) buttonRef.current?.focus();
  }, [clearPreviewTimer]);

  const schedulePreviewClose = useCallback(() => {
    clearPreviewTimer();
    if (panelModeRef.current !== "preview" || panelInteractionRef.current) return;
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      if (panelModeRef.current === "preview" && !panelInteractionRef.current) closePanel(false);
    }, NOTICE_PREVIEW_DURATION_MS);
  }, [clearPreviewTimer, closePanel]);

  const openPanelManually = useCallback(() => {
    if (open) {
      closePanel();
      return;
    }
    clearPreviewTimer();
    panelModeRef.current = "manual";
    panelInteractionRef.current = false;
    focusPanelOnOpenRef.current = true;
    setOpen(true);
  }, [clearPreviewTimer, closePanel, open]);

  const markPanelInteracting = useCallback(() => {
    panelInteractionRef.current = true;
    clearPreviewTimer();
  }, [clearPreviewTimer]);

  const releasePanelInteraction = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) return;
    panelInteractionRef.current = false;
    if (panelModeRef.current === "preview") schedulePreviewClose();
  }, [schedulePreviewClose]);

  const updatePanelPosition = useCallback(() => {
    const buttonRect = buttonRef.current?.getBoundingClientRect();
    if (!buttonRect) return;
    const viewportWidth = document.body.clientWidth || document.documentElement.clientWidth;
    setPanelPosition({
      top: Math.max(8, buttonRect.bottom + 8),
      right: Math.max(8, viewportWidth - buttonRect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const handleViewportChange = () => updatePanelPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!autoOpenNotice || !noticeBelongsToScope(autoOpenNotice, currentScope)) return;
    consumeAutoOpenNotice(autoOpenNotice.id);
    if (open) {
      if (panelModeRef.current === "preview") schedulePreviewClose();
      return;
    }
    panelInteractionRef.current = false;
    panelModeRef.current = "preview";
    focusPanelOnOpenRef.current = false;
    queueMicrotask(() => setOpen(true));
    schedulePreviewClose();
  }, [autoOpenNotice, consumeAutoOpenNotice, currentScope, open, schedulePreviewClose]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) closePanel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    if (focusPanelOnOpenRef.current) {
      focusPanelOnOpenRef.current = false;
      panelRef.current?.focus();
    }
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, open]);

  useEffect(() => () => clearPreviewTimer(), [clearPreviewTimer]);

  const panel = open ? <div ref={panelRef} id={panelId} tabIndex={-1} onPointerEnter={markPanelInteracting} onPointerDown={markPanelInteracting} onPointerLeave={releasePanelInteraction} onFocusCapture={markPanelInteracting} onBlurCapture={releasePanelInteraction} style={{ top: panelPosition?.top ?? 48, right: panelPosition?.right ?? 8 }} className="fixed z-50 max-h-[calc(100vh-4rem)] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-divider bg-surface-elevated p-3 shadow-lg outline-none" role="dialog" aria-labelledby={`${panelId}-title`}>
    <div className="flex items-center justify-between gap-3 border-b border-divider pb-2">
      <div className="min-w-0">
        <p id={`${panelId}-title`} className="text-sm font-semibold text-foreground">Central de avisos</p>
        <p className="text-xs text-text-muted">Histórico operacional desta sessão · disponível até recarregar ou sair.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {unreadCount ? <button type="button" onClick={markAllNoticesRead} className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-semibold text-context-accent hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">Marcar todos como lidos</button> : null}
        <button type="button" onClick={() => closePanel()} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label="Fechar avisos">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
    {notices.length ? <ul className="mt-2 max-h-[min(26rem,calc(100vh-10rem))] space-y-2 overflow-y-auto">
      {notices.map((notice) => <li key={notice.id} className={`rounded-md border border-divider bg-surface-subtle p-3 ${notice.readState === "unread" ? "ring-1 ring-context-accent/25" : "opacity-90"}`}>
        <div className="flex items-start gap-2">
          <span className={`mt-0.5 rounded-full bg-background p-1 ${toneClasses[notice.severity]}`} aria-hidden="true"><SeverityIcon severity={notice.severity} className="h-3.5 w-3.5" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-text-muted">
              <span>{severityLabels[notice.severity]}</span>
              {notice.area || notice.module ? <span className="font-normal text-text-muted/80">{notice.area || notice.module}</span> : null}
              <span title={new Date(notice.createdAt).toLocaleString("pt-BR")}>{formatNoticeTime(notice.createdAt)}</span>
              {notice.readState === "unread" ? <span className="text-context-accent">Não lido</span> : <span>Lido</span>}
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">{notice.title}</p>
            <p className="mt-1 text-sm leading-5 text-foreground/75">{notice.message}</p>
            <NoticeMetadata metadata={notice.metadata} />
            {detailsId === notice.id && notice.details ? <p className="mt-2 text-xs leading-5 text-text-muted">{notice.details}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
              {notice.details ? <button type="button" onClick={() => setDetailsId((current) => current === notice.id ? null : notice.id)} className="inline-flex min-h-8 items-center gap-1 text-context-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
                {detailsId === notice.id ? "Ocultar detalhes" : "Ver detalhes"}
              </button> : null}
              <button type="button" onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(formatNoticeDiagnostic(notice)); }} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar
              </button>
              <button type="button" onClick={() => markNoticeRead(notice.id)} disabled={notice.readState === "read"} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent disabled:cursor-default disabled:opacity-60">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> {notice.readState === "read" ? "Lido" : "Marcar como lido"}
              </button>
            </div>
          </div>
        </div>
      </li>)}
    </ul> : <div className="py-8 text-center text-sm text-text-muted">Nenhum aviso recente.</div>}
  </div> : null;

  return <div ref={containerRef} className="relative">
    <button ref={buttonRef} type="button" onClick={openPanelManually} className="relative inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-foreground/75 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label={unreadCount ? `Abrir avisos recentes (${unreadCount} não lidos)` : "Abrir avisos recentes"} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog">
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount ? <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-context-accent px-1 text-[10px] font-bold text-background" aria-label={`${unreadCount} avisos não lidos`}>{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
    </button>
    {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
  </div>;
}

export { NOTICE_SEVERITIES };
