/**
 * RESTAURAR BACKUP — o contrato compartilhado entre servidor e mesa.
 *
 * O PLANO é do servidor: só ele enxerga o estado canônico remoto contra o qual
 * cada registro é classificado. Este módulo guarda o que os dois lados
 * precisam falar igual — a forma do plano — e o remapeamento de referências,
 * que é domínio puro e roda dos dois lados.
 *
 * O importador não despeja os ids antigos nas tabelas: território e working
 * copy de Silo têm identidade EMITIDA pelo servidor, e tudo o que aponta para
 * eles é religado pelo mapa `id antigo → id restaurado`. Despejar UUID de
 * outro banco criaria linhas apontando para versões que não existem aqui.
 */

import type { BackupFile, BackupIntegrityIssue, BackupRecordType } from "./backup-contract.ts";

/**
 * A classificação de cada registro no preview.
 *
 *   CREATE   — não existe aqui; entra pelo writer canônico.
 *   NO_OP    — mesma identidade e mesmo conteúdo; nada é reescrito.
 *   REMAP    — identidade emitida pelo servidor; entra com id novo.
 *   CONFLICT — mesma identidade com conteúdo divergente; nada é sobrescrito.
 *   BLOCKED  — o arquivo não passou na integridade; nada é aplicado.
 */
export type RestoreOutcome = "CREATE" | "NO_OP" | "REMAP" | "CONFLICT" | "BLOCKED";

export type RestorePlanEntry = {
  recordType: BackupRecordType;
  recordKey: string;
  recordVersion: number | null;
  outcome: RestoreOutcome;
  reason: string;
};

export type RestorePlan = {
  brandId: string;
  sourceBrandId: string;
  exportedAt: string;
  entries: RestorePlanEntry[];
  issues: BackupIntegrityIssue[];
  counts: Record<RestoreOutcome, number>;
  executable: boolean;
  summary: string;
};

export type RestoreDifference = {
  recordType: BackupRecordType;
  recordKey: string;
  field: string;
  expected: string;
  actual: string;
};

export type RestoreApplyReport = {
  plan: RestorePlan;
  applied: Array<RestorePlanEntry & { restoredKey: string | null; restoredVersionId: string | null }>;
  identityMap: Record<string, string>;
  readback: { checked: number; equivalent: boolean; differences: RestoreDifference[] };
  summary: string;
};

export type ReferenceMap = ReadonlyMap<string, string>;

/**
 * Reescreve as identidades do payload usando o mapa `antiga → restaurada`.
 *
 * Percorre o objeto inteiro porque as referências aparecem em lugares
 * diferentes conforme o artefato: `siloDnaRef.versionId` na SiloPage,
 * `territoryRef` no SiloDNA e no ArticleDNA, `baseSiloDnaVersionRef` e
 * `participatingArticleDnaVersionRefs` no grafo, `articleDnaVersionRef` em
 * cada nó. Reescrever caso a caso deixaria uma referência para trás a cada
 * campo novo do contrato.
 *
 * Não muta a entrada: o plano é leitura.
 */
export function remapReferences<T>(payload: T, map: ReferenceMap): T {
  if (typeof payload === "string") return (map.get(payload) ?? payload) as unknown as T;
  if (Array.isArray(payload)) return payload.map(item => remapReferences(item, map)) as unknown as T;
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) next[key] = remapReferences(value, map);
    return next as unknown as T;
  }
  return payload;
}

function identityOf(record: BackupFile["records"][number]): string | null {
  const payload = record.payload as { versionId?: unknown; graphVersionId?: unknown; workingCopyId?: unknown };
  for (const value of [payload.versionId, payload.graphVersionId, payload.workingCopyId]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/** As identidades que o backup carregava, para conferir o religamento. */
export function collectSourceVersionIds(file: BackupFile): string[] {
  return [...new Set([
    ...file.records.map(identityOf).filter((value): value is string => Boolean(value)),
    ...file.records.map(record => record.recordKey),
  ])];
}
