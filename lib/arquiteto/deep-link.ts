export type ArchitectNavigationCandidate = {
  id?: unknown;
  provisionalGroupId?: unknown;
  clusterId?: unknown;
};

export function resolveArchitectDeepLink(candidates: ArchitectNavigationCandidate[], requested: string | null | undefined, brandId: string | null | undefined, consumedKey: string | null) {
  if (!requested || !candidates.length) return null;
  const requestKey = `${brandId || "no-brand"}:${requested}`;
  if (requestKey === consumedKey) return null;
  const match = candidates.find(item => item.provisionalGroupId === requested || item.id === requested);
  if (!match || match.clusterId === null || match.clusterId === undefined || match.clusterId === "") return null;
  return { requestKey, articleRowId: `art-${String(match.clusterId)}` };
}

export function sameStringSet(current: ReadonlySet<string>, expected: string[]) {
  return current.size === expected.length && expected.every(value => current.has(value));
}

/**
 * Área do Arquiteto endereçável pela URL.
 *
 * A área explícita precisa sobreviver ao F5: `DEFAULT_MODE` responde "onde cair
 * quando NADA foi escolhido", não "para onde voltar a cada montagem". URL
 * explícita vence o default local; valor inválido cai no fallback seguro.
 *
 * Sem localStorage e sem IndexedDB: preferência local não é autoridade de rota.
 */
export const ARCHITECT_AREA_PARAM = "area";
export const ARCHITECT_AREAS = ["silos", "articles", "links"] as const;
export type ArchitectArea = (typeof ARCHITECT_AREAS)[number];

export function resolveArchitectArea(
  requested: string | null | undefined,
  fallback: ArchitectArea,
): ArchitectArea {
  const value = String(requested ?? "").trim().toLowerCase();
  return (ARCHITECT_AREAS as readonly string[]).includes(value) ? value as ArchitectArea : fallback;
}

/** Área da URL atual do navegador; `null` fora do browser ou sem parâmetro. */
export function readArchitectAreaFromLocation(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href).searchParams.get(ARCHITECT_AREA_PARAM);
  } catch {
    return null;
  }
}

/**
 * URL com a área explícita, preservando os demais parâmetros. Devolve `null`
 * quando nada mudaria — para não empilhar history sem necessidade.
 */
export function architectAreaHref(href: string, area: ArchitectArea): string | null {
  try {
    const url = new URL(href);
    if (url.searchParams.get(ARCHITECT_AREA_PARAM) === area) return null;
    url.searchParams.set(ARCHITECT_AREA_PARAM, area);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
