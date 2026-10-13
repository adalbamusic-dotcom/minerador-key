import { approvalRequirementLabel, type ApprovalRequirement } from "./approved-package.ts";

/**
 * TODOS OS MOTIVOS, AGRUPADOS (SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`,
 * itens 2 e 12).
 *
 * Aprovar em lote dizia só o motivo da PRIMEIRA keyword ("3 keyword(s) ainda
 * não podem ser aprovadas. Aprovar exige Lógica…") e as outras ficavam sem
 * explicação. Aqui cada keyword entra em cada motivo que tem, e o resumo diz
 * quantas por motivo: "falta a Lógica: 3 · falta o Volume: 2 · publicada: 1".
 */

export type ApprovalBlockerInput = {
  keyword: string;
  /** Requisitos que faltam (`resolveApprovalReadiness().missing`). */
  missing?: readonly ApprovalRequirement[];
  /** Outros motivos já em português (publicada, recusa do envio…). */
  reasons?: readonly string[];
};

export type ApprovalBlockerGroup = { label: string; count: number; keywords: string[] };

const ROTULO_DO_REQUISITO: Partial<Record<ApprovalRequirement, string>> = {
  logic: "falta a Lógica",
  volume: "falta o Volume",
};

export function approvalBlockerLabel(requirement: ApprovalRequirement): string {
  return ROTULO_DO_REQUISITO[requirement] ?? `falta ${approvalRequirementLabel(requirement)}`;
}

export function groupApprovalBlockers(items: readonly ApprovalBlockerInput[]): ApprovalBlockerGroup[] {
  const grupos = new Map<string, ApprovalBlockerGroup>();
  const somar = (label: string, keyword: string) => {
    const grupo = grupos.get(label) ?? { label, count: 0, keywords: [] };
    if (!grupo.keywords.includes(keyword)) {
      grupo.count += 1;
      grupo.keywords.push(keyword);
    }
    grupos.set(label, grupo);
  };
  for (const item of items) {
    const rotulos = [
      ...(item.missing ?? []).map(approvalBlockerLabel),
      ...(item.reasons ?? []).map(reason => reason.trim()).filter(Boolean),
    ];
    for (const rotulo of rotulos.length ? rotulos : ["sem motivo informado"]) somar(rotulo, item.keyword);
  }
  return [...grupos.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

/** "falta a Lógica: 3 · falta o Volume: 2" — a frase curta do lote. */
export function summarizeApprovalBlockers(groups: readonly ApprovalBlockerGroup[]): string {
  return groups.map(group => `${group.label}: ${group.count}`).join(" · ");
}
