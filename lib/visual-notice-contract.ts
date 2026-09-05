export const NOTICE_TOAST_DURATION_MS = 4_500;
export const NOTICE_PREVIEW_DURATION_MS = 5_000;

export const NOTICE_SEVERITIES = ["SUCCESS", "INFO", "PENDING", "WARNING", "ERROR"] as const;
export type NoticeSeverity = (typeof NOTICE_SEVERITIES)[number];

export type NoticeSource = "persistence" | "validation" | "workflow" | "local" | "system" | (string & {});
export type NoticeMetadata = Record<string, unknown>;

export type NoticeReadState = "unread" | "read";

export type NoticeScopeType = "brand" | "agency" | "global";

export type NoticeScope = {
  key: string;
  scopeType: NoticeScopeType;
  module: string;
  area?: string;
  brandId?: string;
  agencyId?: string;
};

export type NoticeAction = {
  label: string;
  href?: string;
};

export type PublishNoticeInput = {
  severity: NoticeSeverity;
  title: string;
  message: string;
  details?: string;
  metadata?: NoticeMetadata;
  copyPayload?: unknown;
  source?: NoticeSource;
  confirmed?: boolean;
  module?: string;
  area?: string;
  scope?: NoticeScope;
  showToast?: boolean;
  action?: NoticeAction;
  /**
   * Optional caller-owned key for idempotent publication during one SPA session.
   * It is not rendered and is never used as an authorization boundary.
   */
  dedupeKey?: string;
};

export type NoticeRecord = Omit<PublishNoticeInput, "scope"> & {
  scope: NoticeScope | null;
  id: string;
  createdAt: number;
  readAt: number | null;
  readState: NoticeReadState;
};

const SENSITIVE_KEY = /token|cookie|authorization|secret|credential|password|service[_-]?role|private[_-]?key|access[_-]?key|api[_-]?key|header/i;
const SENSITIVE_TEXT = /((?:authorization|cookie|token|secret|password|service[_-]?role)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi;

export function noticeToneToken(severity: NoticeSeverity) {
  return {
    SUCCESS: "success",
    INFO: "context-accent",
    PENDING: "pending",
    WARNING: "warning",
    ERROR: "danger",
  }[severity];
}

export function validateNoticeInput(input: PublishNoticeInput) {
  if (!input.title.trim()) throw new Error("Notice sem título não pode ser publicado.");
  if (!input.message.trim()) throw new Error("Notice sem mensagem não pode ser publicado.");
  if (input.severity === "SUCCESS" && input.source === "persistence" && input.confirmed !== true) {
    throw new Error("SUCCESS de persistência exige confirmação real da operação.");
  }
}

function sanitizeText(value: string) {
  return value.replace(SENSITIVE_TEXT, "$1[redacted]");
}

function sanitizeMetadata(value: NoticeMetadata | undefined) {
  if (!value) return undefined;
  const sanitized = sanitizeCopyPayload(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as NoticeMetadata
    : undefined;
}

export function sanitizeCopyPayload(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return "[circular omitted]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((entry) => sanitizeCopyPayload(entry, seen));

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const sanitized = sanitizeCopyPayload(entry, seen);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

export function createNoticeRecord(input: PublishNoticeInput, now = Date.now(), id = `notice-${now}-${Math.random().toString(36).slice(2, 8)}`): NoticeRecord {
  validateNoticeInput(input);
  return {
    ...input,
    title: sanitizeText(input.title.trim()),
    message: sanitizeText(input.message.trim()),
    details: input.details ? sanitizeText(input.details.trim()) : undefined,
    module: input.module ? sanitizeText(input.module.trim()) : undefined,
    area: input.area ? sanitizeText(input.area.trim()) : undefined,
    scope: input.scope || null,
    action: input.action ? {
      label: sanitizeText(input.action.label.trim()),
      href: input.action.href ? sanitizeText(input.action.href.trim()) : undefined,
    } : undefined,
    metadata: sanitizeMetadata(input.metadata),
    copyPayload: sanitizeCopyPayload(input.copyPayload),
    id,
    createdAt: now,
    readAt: null,
    readState: "unread",
  };
}

export function formatNoticeDiagnostic(notice: NoticeRecord) {
  return JSON.stringify({
    severity: notice.severity,
    title: notice.title,
    message: notice.message,
    details: notice.details || null,
    metadata: notice.metadata || null,
    source: notice.source || null,
    module: notice.module || null,
    area: notice.area || null,
    scope: notice.scope || null,
    readState: notice.readState,
    diagnostic: sanitizeCopyPayload(notice.copyPayload),
  }, null, 2);
}
