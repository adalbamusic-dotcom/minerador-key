import { brandCanonicalSiteKey, brandCanonicalSiteKeyFromSlug } from "./site-canonical-url.ts";

/**
 * Reconciliação entre o site observado e o estado editorial interno
 * (SDD 2026-09-02, Fase 1 — domínio puro).
 *
 * AUTORIDADE EDITORIAL INTERNA = PublicationRecord / SiloPage / ArticleDNA
 * EVIDÊNCIA EXTERNA            = catálogo do site
 *
 * Nenhuma das duas substitui a outra, e nada aqui corrige nada: a função
 * descreve o que casa, o que só existe de um lado e o que conflita.
 *
 * As entradas são formas mínimas e locais de propósito: este módulo pertence à
 * Marca e não importa contratos do Arquiteto — quem chama adapta.
 */

export type CatalogSideEntry = {
  entryId: string;
  normalizedUrl: string;
  normalizedCanonicalUrl: string | null;
  /**
   * Vínculo editorial confirmado, quando existir. NÃO tem fonte persistida: o
   * catálogo não guarda referência genérica, porque PublicationRecord, SiloPage
   * e ArticleDNA têm identidades heterogêneas. Permanece como entrada do
   * chamador para quando existir contrato tipado e discriminado; até lá chega
   * sempre nulo e a correspondência cai nos passos derivados.
   */
  publicationRef: string | null;
};

export type EditorialSideEntry = {
  /** Referência estável do lado editorial: publicationRef, siloPageId ou articleId. */
  editorialRef: string;
  kind: "publication_record" | "silo_page" | "article_dna";
  publishedUrl: string | null;
  canonical: string | null;
  slug: string | null;
};

export const RECONCILIATION_STATES = ["matched", "site_only", "database_only", "conflicting"] as const;
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number];

export const RECONCILIATION_MATCHED_BY = ["declared_ref", "canonical", "published_url", "site_url_slug"] as const;
export type ReconciliationMatchedBy = (typeof RECONCILIATION_MATCHED_BY)[number];

export type ReconciliationEntry = {
  state: ReconciliationState;
  catalogEntryId: string | null;
  editorialRef: string | null;
  editorialKind: EditorialSideEntry["kind"] | null;
  normalizedUrl: string | null;
  matchedBy: ReconciliationMatchedBy | null;
  detail: string | null;
};

export type ReconciliationResult = {
  entries: ReconciliationEntry[];
  summary: Record<ReconciliationState, number>;
};

/**
 * Ordem de correspondência aprovada, aplicada nesta sequência e só nela:
 *
 *   1. ref canônica já declarada no catálogo;
 *   2. canonical normalizado do lado editorial;
 *   3. publishedUrl normalizada;
 *   4. site_url + slug normalizado;
 *   5. sem correspondência.
 *
 * PROIBIDO comparar por substring. Duas URLs só são a mesma quando produzem a
 * mesma `canonicalSiteKey`.
 *
 * `conflicting` é o caso em que a URL casa mas o canonical declarado pelo site
 * aponta para outro recurso: divergência real, que vai para revisão humana.
 */
export function reconcileSiteWithEditorialState(input: {
  siteUrl: string | null;
  catalog: readonly CatalogSideEntry[];
  editorial: readonly EditorialSideEntry[];
}): ReconciliationResult {
  const entries: ReconciliationEntry[] = [];
  const matchedCatalogIds = new Set<string>();
  const matchedEditorialRefs = new Set<string>();

  const catalogByUrl = new Map<string, CatalogSideEntry>();
  const catalogByRef = new Map<string, CatalogSideEntry>();
  for (const entry of input.catalog) {
    if (!catalogByUrl.has(entry.normalizedUrl)) catalogByUrl.set(entry.normalizedUrl, entry);
    if (entry.publicationRef) catalogByRef.set(entry.publicationRef, entry);
  }

  for (const editorial of input.editorial) {
    const candidates: Array<{ matchedBy: ReconciliationMatchedBy; entry: CatalogSideEntry | undefined }> = [
      { matchedBy: "declared_ref", entry: catalogByRef.get(editorial.editorialRef) },
      { matchedBy: "canonical", entry: lookup(catalogByUrl, brandKey(input.siteUrl, editorial.canonical)) },
      { matchedBy: "published_url", entry: lookup(catalogByUrl, brandKey(input.siteUrl, editorial.publishedUrl)) },
      { matchedBy: "site_url_slug", entry: lookup(catalogByUrl, brandCanonicalSiteKeyFromSlug(input.siteUrl, editorial.slug)) },
    ];

    const hit = candidates.find(candidate => candidate.entry);
    if (!hit?.entry) {
      // Registro editorial sem URL correspondente no site observado. É achado,
      // nunca exclusão: pode ser página fora do sitemap ou sync desatualizado.
      entries.push({
        state: "database_only",
        catalogEntryId: null,
        editorialRef: editorial.editorialRef,
        editorialKind: editorial.kind,
        normalizedUrl: null,
        matchedBy: null,
        detail: null,
      });
      matchedEditorialRefs.add(editorial.editorialRef);
      continue;
    }

    matchedCatalogIds.add(hit.entry.entryId);
    matchedEditorialRefs.add(editorial.editorialRef);

    const editorialCanonical = brandKey(input.siteUrl, editorial.canonical);
    const observedCanonical = hit.entry.normalizedCanonicalUrl;
    const conflicting = Boolean(editorialCanonical && observedCanonical && editorialCanonical !== observedCanonical);

    entries.push({
      state: conflicting ? "conflicting" : "matched",
      catalogEntryId: hit.entry.entryId,
      editorialRef: editorial.editorialRef,
      editorialKind: editorial.kind,
      normalizedUrl: hit.entry.normalizedUrl,
      matchedBy: hit.matchedBy,
      detail: conflicting ? `${observedCanonical} ≠ ${editorialCanonical}` : null,
    });
  }

  for (const entry of input.catalog) {
    if (matchedCatalogIds.has(entry.entryId)) continue;
    // URL presente no site sem registro editorial interno.
    entries.push({
      state: "site_only",
      catalogEntryId: entry.entryId,
      editorialRef: null,
      editorialKind: null,
      normalizedUrl: entry.normalizedUrl,
      matchedBy: null,
      detail: null,
    });
  }

  const summary: Record<ReconciliationState, number> = { matched: 0, site_only: 0, database_only: 0, conflicting: 0 };
  for (const entry of entries) summary[entry.state] += 1;
  return { entries, summary };
}

function lookup(index: Map<string, CatalogSideEntry>, key: string | null): CatalogSideEntry | undefined {
  return key ? index.get(key) : undefined;
}

/** Identidade ancorada na Brand; URL fora do site da Brand não casa com nada. */
function brandKey(siteUrl: string | null, rawUrl: string | null): string | null {
  return rawUrl ? brandCanonicalSiteKey(siteUrl, rawUrl) : null;
}
