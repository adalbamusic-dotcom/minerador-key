export const MINERADOR_EDITORIAL_STATUSES = ["bruto", "em_revisao", "aprovado", "rejeitado"] as const;

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
  em_revisao: "Em revisão",
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

/**
 * As opções que TODO seletor de status editorial renderiza.
 *
 * Existiam quatro listas escritas à mão — coluna da tabela, recuperação de
 * legado, filtro do topo e "Status final" na Decisão — e três delas tinham
 * conteúdo diferente: faltava `em_revisao` e sobrava `publicado`, um valor
 * que nenhuma linha do banco usa. Divergência entre telas não se conserta
 * conferindo as quatro; conserta-se tendo uma.
 */
export const MINERADOR_EDITORIAL_STATUS_OPTIONS: ReadonlyArray<{ value: EditorialKeywordStatus; label: string }> =
  MINERADOR_EDITORIAL_STATUSES.map(value => ({ value, label: STATUS_LABELS[value] }));

/** Rótulo do status editorial. Uma lista, um rótulo, quatro telas. */
export function editorialKeywordStatusLabel(status: EditorialKeywordStatus): string {
  return STATUS_LABELS[status];
}

export function isEditorialKeywordStatus(value: unknown): value is EditorialKeywordStatus {
  return resolveEditorialKeywordStatus(value).kind === "resolved"
    && typeof value === "string"
    && MINERADOR_EDITORIAL_STATUSES.includes(value.trim().toLowerCase() as EditorialKeywordStatus);
}

/**
 * Status EFETIVO da keyword.
 *
 * A coluna `status` guarda a última escolha do humano; ela não é a autoridade
 * sozinha. Uma keyword aprovada que foi mexida depois volta a ser
 * `em_revisao`, e isso é DERIVADO da divergência do pacote — não depende de
 * nenhum writer lembrar de rebaixar. Writer esquece; a derivação não.
 *
 * Enquanto está em revisão, o Arquiteto continua consumindo o pacote aprovado
 * anterior. Só uma nova aprovação troca o que ele vê.
 */
export function resolveEffectiveKeywordStatus(input: {
  status: unknown;
  diverged: boolean | null;
}): EditorialKeywordStatusResolution & { divergedFromApproval: boolean } {
  const base = resolveEditorialKeywordStatus(input.status);
  if (base.kind !== "resolved" || base.status !== "aprovado" || input.diverged !== true) {
    return { ...base, divergedFromApproval: false };
  }
  return {
    kind: "resolved",
    status: "em_revisao",
    label: STATUS_LABELS.em_revisao,
    rawStatus: base.rawStatus,
    divergedFromApproval: true,
  };
}

/** Só keyword efetivamente aprovada entrega pacote novo ao Arquiteto. */
export function isApprovedForArchitect(input: { status: unknown; diverged: boolean | null }): boolean {
  return resolveEffectiveKeywordStatus(input).status === "aprovado";
}
