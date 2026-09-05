import type { SiloDNA, SiloPage, VersionEnvelope } from "./contracts.ts";

export type CanonicalSiloOption = {
  id: string;
  nome: string;
  slug: string | null;
};

const NON_ENTITY_SILO_IDS = new Set(["sem-silo", "sem_silo", "none", "null"]);

function canonicalSiloId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || NON_ENTITY_SILO_IDS.has(id.toLowerCase())) return null;
  return id;
}

/**
 * O seletor do Arquiteto só pode apresentar silos que tenham identidade
 * canônica persistida. Catálogos, cache do navegador e estados de grupo não
 * são uma fonte de verdade para esta lista.
 */
export function canonicalSiloOptions(
  siloDnas: readonly VersionEnvelope<SiloDNA>[],
  siloPages: readonly VersionEnvelope<SiloPage>[],
): CanonicalSiloOption[] {
  const pageSlugBySiloId = new Map(siloPages.map(page => [page.payload.siloId, page.payload.slug]));
  const pageBySiloId = new Map(siloPages.map(page => [page.payload.siloId, page.payload]));
  const options = new Map<string, CanonicalSiloOption>();

  siloDnas.forEach(version => {
    const id = canonicalSiloId(version.payload.siloId);
    const page = id ? pageBySiloId.get(id) : undefined;
    const breadcrumbName = Array.isArray(page?.breadcrumbs) ? page.breadcrumbs.at(-1)?.label.trim() : undefined;
    const pageHeading = typeof page?.h1 === "string" ? page.h1.trim() : undefined;
    const slugName = typeof page?.slug === "string" ? page.slug.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ").trim() : undefined;
    const nome = version.payload.name?.trim() || breadcrumbName || pageHeading || slugName;
    if (!id || !nome) return;
    options.set(id, { id, nome, slug: pageSlugBySiloId.get(id) || null });
  });

  return [...options.values()].sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR"));
}

export function applyCanonicalSiloNames<T extends { siloId?: unknown; silo_id?: unknown; siloName?: unknown; isPublished?: unknown; published?: unknown }>(
  items: readonly T[],
  silos: readonly CanonicalSiloOption[],
): T[] {
  const siloById = new Map(silos.map(silo => [silo.id, silo]));
  return items.map(item => {
    const rawId = typeof item.siloId === "string" ? item.siloId : typeof item.silo_id === "string" ? item.silo_id : null;
    const silo = rawId ? siloById.get(rawId) : undefined;
    const published = item.isPublished === true || item.published === true;
    return {
      ...item,
      // An unknown Silo may be a legacy published identity. Keep its
      // reference/name for protection; only new/unpublished projections are
      // reduced to the canonical catalog.
      siloId: silo?.id || (published ? rawId : null),
      silo_id: silo?.id || (published ? rawId : null),
      siloName: silo?.nome || (published ? (typeof item.siloName === "string" ? item.siloName : null) : null),
    };
  });
}

/** Aplica uma mudança de silo somente às keywords que formam o artigo alvo. */
export function assignSiloToArticleMembers<T extends { id: string; siloId?: unknown; silo_id?: unknown; siloName?: unknown }>(
  items: readonly T[],
  articleKeywordIds: ReadonlySet<string>,
  silo: CanonicalSiloOption | null,
): T[] {
  return items.map(item => articleKeywordIds.has(String(item.id))
    ? { ...item, siloId: silo?.id || null, silo_id: silo?.id || null, siloName: silo?.nome || null }
    : item);
}
