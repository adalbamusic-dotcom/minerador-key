export const MINERADOR_EDITORIAL_STATUSES = ["bruto", "aprovado", "rejeitado"] as const;

export type EditorialKeywordStatus = typeof MINERADOR_EDITORIAL_STATUSES[number];

export type EditorialKeywordStatusResolution =
  | {
      kind: "resolved";
      status: EditorialKeywordStatus;
      label: string;
      rawStatus: string | null;
    }
  | {
      kind: "legacyEditorialStatusUnresolved";
      status: null;
      label: "Status a definir";
      rawStatus: string | null;
    };

const STATUS_LABELS: Record<EditorialKeywordStatus, string> = {
  bruto: "Bruto",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

function normalizedStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().toLowerCase();
  return result || null;
}

export function isLegacyPublishedStatus(value: unknown): boolean {
  const status = normalizedStatus(value);
  return status === "publicado" || status === "published";
}

export function resolveEditorialKeywordStatus(value: unknown): EditorialKeywordStatusResolution {
  const rawStatus = normalizedStatus(value);
  if (!rawStatus) {
    return { kind: "resolved", status: "bruto", label: STATUS_LABELS.bruto, rawStatus: null };
  }
  if ((MINERADOR_EDITORIAL_STATUSES as readonly string[]).includes(rawStatus)) {
    const status = rawStatus as EditorialKeywordStatus;
    return { kind: "resolved", status, label: STATUS_LABELS[status], rawStatus };
  }
  return { kind: "legacyEditorialStatusUnresolved", status: null, label: "Status a definir", rawStatus };
}

export function isEditorialKeywordStatus(value: unknown): value is EditorialKeywordStatus {
  return resolveEditorialKeywordStatus(value).kind === "resolved"
    && typeof value === "string"
    && MINERADOR_EDITORIAL_STATUSES.includes(value.trim().toLowerCase() as EditorialKeywordStatus);
}
