import { readPublicationLink, readSiteOrigin } from "./publication-link.ts";
import { resolveCanonicalPublication } from "../lifecycle/publication.ts";

/*
 * 2026-10-16 · F1 da linha única do Minerador (SDD
 * `sdd-linha-unica-do-minerador-2026-10-16.md`, P-8): saíram as decisões de
 * exclusão no cliente sem uso em produção (catálogo de dependências, erro de
 * auditoria, avaliação de exclusão definitiva, janela e restauração
 * calculadas no navegador). Quem decide a exclusão é a RPC do ciclo de vida
 * (`lifecycle_delete_minerador_keywords`: a não publicada sai de vez; a
 * publicada vai à lixeira por 24 h). Ficam as leituras que a tela e os núcleos
 * usam.
 */

export type KeywordPublicationResolution = {
  isPublished: boolean;
  source: "formal_site_link" | "legacy_unverified" | "none";
};

export type KeywordLifecycleTombstone = {
  deleted_at?: string | null;
  purge_after?: string | null;
};

/**
 * The browser can only provide a hint. The server/RPC is authoritative and
 * resolves PublicationRecord/lineage. A legacy status is diagnostic only and
 * never activates the recoverable delete path.
 */
export function resolveKeywordPublication(input: {
  status?: string | null;
  semantic?: Record<string, unknown> | null;
}): KeywordPublicationResolution {
  const evidence = readSiteOrigin(input.semantic || null);
  const view = readPublicationLink({ status: input.status, evidence });
  const resolution = resolveCanonicalPublication({ formalSite: evidence, legacyStatus: input.status });
  if (resolution.isPublished && view.state === "published") return { isPublished: true, source: "formal_site_link" };
  if (resolution.source === "legacy_unverified") return { isPublished: false, source: "legacy_unverified" };
  return { isPublished: false, source: "none" };
}

export function isKeywordPublished(input: { status?: string | null; semantic?: Record<string, unknown> | null }): boolean {
  return resolveKeywordPublication(input).isPublished;
}

export function keywordRecoveryRemainingLabel(row: KeywordLifecycleTombstone, now = new Date()): string {
  if (!row.purge_after) return "Janela de recuperação indisponível";
  const remainingMs = Date.parse(row.purge_after) - now.getTime();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "Janela encerrada";
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h restantes`;
  return `${Math.max(1, minutes)}min restantes`;
}
