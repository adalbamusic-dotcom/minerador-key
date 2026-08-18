"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Bell, Check, CheckCircle2, CircleX, Clock3, Copy, Info, TriangleAlert, X } from "lucide-react";
import {
  createNoticeRecord,
  formatNoticeDiagnostic,
  NOTICE_RETENTION_MS,
  NOTICE_SEVERITIES,
  NOTICE_TOAST_DURATION_MS,
  type NoticeRecord,
  type NoticeSeverity,
  type PublishNoticeInput,
} from "@/lib/visual-notice-contract";

type NoticeCenterValue = {
  notices: NoticeRecord[];
  toast: NoticeRecord | null;
  publishNotice: (input: PublishNoticeInput) => NoticeRecord;
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

export function GlobalNoticeProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [toast, setToast] = useState<NoticeRecord | null>(null);

  const publishNotice = useCallback((input: PublishNoticeInput) => {
    const record = createNoticeRecord(input);
    setNotices((current) => [record, ...current.filter((notice) => Date.now() - notice.createdAt < NOTICE_RETENTION_MS)].slice(0, 30));
    setToast(record);
    return record;
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
    setToast((current) => current?.id === id ? null : current);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToast((current) => current?.id === id ? null : current);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - NOTICE_RETENTION_MS;
      setNotices((current) => current.filter((notice) => notice.createdAt >= cutoff));
      setToast((current) => current && current.createdAt >= cutoff ? current : null);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dismissToast(toast.id), NOTICE_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dismissToast, toast]);

  const value = useMemo(() => ({ notices, toast, publishNotice, dismissNotice, dismissToast }), [dismissNotice, dismissToast, notices, publishNotice, toast]);

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

function NoticeActions({ notice, onDismiss }: { notice: NoticeRecord; onDismiss: (id: string) => void }) {
  const copyDiagnostic = () => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(formatNoticeDiagnostic(notice));
  };

  return <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
    <button type="button" onClick={copyDiagnostic} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      Copiar diagnóstico
    </button>
    <button type="button" onClick={() => onDismiss(notice.id)} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      Fechar
    </button>
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

export function NotificationBell() {
  const { notices, dismissNotice } = useNoticeCenter();
  const [open, setOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  return <div className="relative">
    <button type="button" onClick={() => setOpen((current) => !current)} className="relative inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-foreground/75 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label={notices.length ? `Abrir avisos recentes (${notices.length})` : "Abrir avisos recentes"} aria-expanded={open} aria-haspopup="dialog">
      <Bell className="h-5 w-5" aria-hidden="true" />
      {notices.length ? <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-context-accent px-1 text-[10px] font-bold text-background">{notices.length > 9 ? "9+" : notices.length}</span> : null}
    </button>
    {open ? <div className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-divider bg-surface-elevated p-3 shadow-lg" role="dialog" aria-label="Avisos recentes">
      <div className="flex items-center justify-between gap-3 border-b border-divider pb-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Avisos recentes</p>
          <p className="text-xs text-text-muted">Disponíveis por até 2 minutos.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label="Fechar avisos">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {notices.length ? <ul className="mt-2 max-h-[min(26rem,calc(100vh-10rem))] space-y-2 overflow-y-auto">
        {notices.map((notice) => <li key={notice.id} className="rounded-md border border-divider bg-surface-subtle p-3">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 rounded-full bg-background p-1 ${toneClasses[notice.severity]}`} aria-hidden="true"><SeverityIcon severity={notice.severity} className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-text-muted">{severityLabels[notice.severity]}</p>
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
                <button type="button" onClick={() => dismissNotice(notice.id)} className="inline-flex min-h-8 items-center gap-1 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Fechar
                </button>
              </div>
            </div>
          </div>
        </li>)}
      </ul> : <div className="py-8 text-center text-sm text-text-muted">Nenhum aviso recente.</div>}
    </div> : null}
  </div>;
}

export { NOTICE_RETENTION_MS, NOTICE_SEVERITIES };
