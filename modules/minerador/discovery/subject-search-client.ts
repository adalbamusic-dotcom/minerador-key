import type { SubjectDiscoveryErrorResponse } from "../../../lib/minerador/subject-discovery-search.ts";
import type {
  SubjectDiscoveryImportCounts,
  SubjectDiscoveryImportLogicSummary,
  SubjectDiscoveryImportRow,
  SubjectDiscoveryImportVolumeSummary,
  SubjectDiscoverySubjectCheck,
} from "../../../lib/minerador/subject-discovery-import.ts";

/**
 * PESQUISA POR ASSUNTO — as duas chamadas da tela, num lugar só (SDD
 * `sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 7).
 *
 * A pesquisa de uma frase (`use-subject-search.ts`) e a pesquisa em lote das
 * linhas do cadastro (`use-subject-search-batch.ts`) falam com as MESMAS rotas,
 * pelos mesmos corpos: `POST …/subject-discovery/search` (plano e execução,
 * `runSubjectDiscoverySearch`) e `POST …/subject-discovery/import`
 * (`importSubjectDiscoveryWithCore`). Nada de caminho paralelo: o lote é a
 * pesquisa de sempre, uma vez por linha.
 */

export type SubjectDiscoveryImportRouteResponse = {
  success?: boolean;
  message?: string;
  code?: string;
  subject?: SubjectDiscoverySubjectCheck;
  rows?: SubjectDiscoveryImportRow[];
  notAffected?: SubjectDiscoveryImportRow[];
  counts?: SubjectDiscoveryImportCounts;
  /** Item 8: o Volume que o recibo do servidor deu (ausente em servidor antigo). */
  volume?: SubjectDiscoveryImportVolumeSummary;
  /** Item 8: a Lógica rodada nas keywords do envio. */
  logic?: SubjectDiscoveryImportLogicSummary;
};

export function subjectSearchRoute(brandId: string) {
  return `/api/minerador/marcas/${encodeURIComponent(brandId)}/subject-discovery/search`;
}

export function subjectDiscoveryImportRoute(brandId: string) {
  return `/api/minerador/marcas/${encodeURIComponent(brandId)}/subject-discovery/import`;
}

export async function readSubjectSearchJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export function isSubjectSearchErrorResponse(value: unknown): value is SubjectDiscoveryErrorResponse {
  return Boolean(value) && typeof value === "object" && (value as { success?: unknown }).success === false;
}

/** Plano ou execução da Pesquisa por Assunto (o corpo vem de `buildSubjectSearchRequest`). */
export async function postSubjectSearch(brandId: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetch(subjectSearchRoute(brandId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, payload: await readSubjectSearchJson(response) };
}

/** Envio ao Processador: só keyword, origens e evidência (nenhuma métrica). */
export async function postSubjectDiscoveryImport(brandId: string, body: {
  importRequestId: string;
  searchId: string;
  subjectKeywordId: string | null;
  subjectPhrase: string;
  items: Array<{ keyword: string; origins: string[]; evidence: string[] }>;
}): Promise<{ ok: boolean; payload: SubjectDiscoveryImportRouteResponse | null }> {
  const response = await fetch(subjectDiscoveryImportRoute(brandId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readSubjectSearchJson(response) as SubjectDiscoveryImportRouteResponse | null;
  return { ok: response.ok && Boolean(payload) && payload?.success === true, payload };
}

/** O texto do resultado do envio, com o Volume do recibo e a Lógica (item 8). */
export function subjectImportResultText(payload: Pick<SubjectDiscoveryImportRouteResponse, "counts" | "volume" | "logic">): string {
  const counts = payload.counts;
  const parts = counts
    ? [`${counts.created} criada(s)`, `${counts.recorded} já existia(m) e receberam a origem`, `${counts.notAffected} sem a origem gravada`, `${counts.failed} falha(s)`]
    : [];
  if (payload.volume) {
    parts.push(payload.volume.receipt === "found"
      ? `${payload.volume.written} já com o Volume da pesquisa`
      : "sem recibo da pesquisa: meça o Volume pelo botão \"Volume\"");
  }
  if (payload.logic) {
    parts.push(payload.logic.error ? payload.logic.error : payload.logic.ran ? `Lógica rodada em ${payload.logic.applied + payload.logic.unchanged}` : "Lógica sem keyword nova");
  }
  return `${parts.join(" · ")}.`;
}
