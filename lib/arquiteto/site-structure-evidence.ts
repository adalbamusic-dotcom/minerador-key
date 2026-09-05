import { classifyUrlStructuralHint, PublishedStructureEvidenceSchema, type PublishedStructureEvidence } from "./territorial-base.ts";

/**
 * Site/Sitemap → evidência estrutural.
 *
 * Uma página observada no site NÃO é Silo, SiloPage nem ArticleDNA: é evidência
 * de que existe estrutura publicada. O Arquiteto decide depois; este módulo só
 * traduz fato observado em `PublishedStructureEvidence`, o contrato que já
 * existe. Puro: sem fetch, sem storage, sem inferir `siloId` nem `territoryRef`.
 *
 * O catálogo inteiro é patrimônio da Marca. O que chega à mesa do Arquiteto é o
 * subconjunto estruturalmente justificável — filtrado por natureza, nunca por
 * "as N primeiras".
 */

export type SiteCatalogEntryLike = {
  normalizedUrl: string;
  discoveredUrl: string;
  resolvedUrl?: string | null;
  declaredCanonicalUrl?: string | null;
  normalizedCanonicalUrl?: string | null;
  title?: string | null;
  h1?: string | null;
  pageType: string;
  verificationStatus: string;
  presenceState: string;
  sourceSitemapId?: string | null;
  lastSeenAt?: string | null;
};

/** Em que cesta a evidência cai. Read-model; nenhum enum persistido. */
export type SiteStructuralRelevance = "structural" | "technical" | "unresolved";

/**
 * Tipos que carregam função de organização no site. `article` é patrimônio
 * editorial e NÃO entra como estrutura sem evidência adicional; `product` não
 * vira Silo sozinho; `author` é superfície de CMS.
 */
const STRUCTURAL_PAGE_TYPES = new Set(["category", "service", "page"]);
const TECHNICAL_PAGE_TYPES = new Set(["author"]);

/** Caminho da URL, sem host — é sobre ele que a pista estrutural é lida. */
export function sitePathOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).pathname || "/";
  } catch {
    const withoutHost = rawUrl.replace(/^[a-z0-9.-]+/i, "");
    return withoutHost.startsWith("/") ? withoutHost : `/${withoutHost}`;
  }
}

/** Último segmento não vazio: o slug próprio da página. */
export function siteSlugOf(path: string | null): string | null {
  if (!path) return null;
  const segments = path.split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : null;
}

/**
 * Natureza estrutural da entrada.
 *
 * `technical` não entra como candidata a estrutura editorial. O que não é nem
 * claramente estrutural nem claramente técnico fica `unresolved` — contado e
 * auditável, nunca descartado em silêncio.
 */
export function resolveSiteStructuralRelevance(
  entry: SiteCatalogEntryLike,
  /**
   * Quantas páginas observadas vivem ABAIXO desta. Hierarquia de URL é sinal
   * estrutural determinístico e é o único disponível antes da verificação de
   * página — sem ela, `classifySitePage` devolve `unknown` para quase tudo.
   * Continua sendo EVIDÊNCIA: seção não vira Silo por ter filhos.
   */
  childCount = 0,
): {
  relevance: SiteStructuralRelevance;
  hint: PublishedStructureEvidence["structuralHint"];
  reason: string;
} {
  const path = sitePathOf(entry.discoveredUrl || entry.normalizedUrl);
  const hint = classifyUrlStructuralHint(path);

  if (hint === "technical" || TECHNICAL_PAGE_TYPES.has(entry.pageType)) {
    return { relevance: "technical", hint: "technical", reason: "Superfície técnica do site, não estrutura editorial." };
  }
  // Sinais realmente observados. A projeção precisa explicar por que incluiu
  // ou não incluiu — sem score opaco.
  const sinais: string[] = [];
  if (childCount > 0) sinais.push(`${childCount} página(s) publicada(s) abaixo dela`);
  if (STRUCTURAL_PAGE_TYPES.has(entry.pageType)) sinais.push(`tipo ${entry.pageType}`);
  if (entry.verificationStatus === "canonical_confirmed") sinais.push("canonical confirmado na página");
  if (entry.h1) sinais.push(`H1 observado: \"${entry.h1}\"`);

  if (hint === "editorial_candidate" && (childCount > 0 || STRUCTURAL_PAGE_TYPES.has(entry.pageType))) {
    return { relevance: "structural", hint, reason: `Estrutura incluída porque: ${sinais.join("; ")}.` };
  }
  // Página já verificada não está esperando coleta: ela simplesmente não tem
  // papel estrutural reconhecido. Dizer "não resolvida" sugeriria dado faltando.
  const verificada = entry.verificationStatus !== "discovered" && entry.verificationStatus !== "stale";
  const faltas: string[] = [];
  if (!childCount) faltas.push("sem páginas abaixo");
  if (entry.pageType === "unknown") faltas.push("tipo não resolvido");
  if (!entry.h1) faltas.push("sem H1 útil");
  return {
    relevance: "unresolved",
    hint,
    reason: entry.pageType === "article"
      ? "Patrimônio editorial publicado; não é estrutura de silo sem evidência adicional."
      : `${verificada ? "Sem papel estrutural identificado" : "Não resolvida"} porque: ${faltas.join("; ") || "natureza estrutural indefinida"}.`,
  };
}

/**
 * Traduz uma entrada do catálogo remoto em evidência.
 *
 * `canonical` só viaja quando foi de fato verificado: o sync de sitemap não faz
 * verificação de página, e ausência de canonical observado NÃO é
 * `canonical_missing`. Sem verificação, o campo fica nulo.
 */
export function siteEvidenceFromCatalogEntry(input: {
  brandId: string;
  entry: SiteCatalogEntryLike;
  childCount?: number;
}): PublishedStructureEvidence {
  const { entry } = input;
  const path = sitePathOf(entry.discoveredUrl || entry.normalizedUrl);
  const { relevance, hint, reason } = resolveSiteStructuralRelevance(entry, input.childCount ?? 0);
  const canonicalVerified = entry.verificationStatus === "canonical_confirmed"
    || entry.verificationStatus === "canonical_conflict";

  return PublishedStructureEvidenceSchema.parse({
    evidenceId: `site:${entry.normalizedUrl}`,
    brandId: input.brandId,
    source: "sitemap",

    url: entry.discoveredUrl || null,
    normalizedUrl: entry.normalizedUrl || null,
    path,
    slug: siteSlugOf(path),
    // Canonical não verificado permanece ausente; inventar aqui viraria fato.
    canonical: canonicalVerified ? entry.declaredCanonicalUrl || null : null,
    normalizedCanonical: canonicalVerified ? entry.normalizedCanonicalUrl || null : null,
    title: entry.title || entry.h1 || null,
    observedAt: entry.lastSeenAt || null,

    sitemapRef: entry.sourceSitemapId || null,
    // Vínculo editorial interno é derivado depois, nunca declarado pelo site.
    publicationRef: null,
    articleRef: null,
    siloRef: null,

    publicationState: entry.presenceState === "present" ? "published" : "unknown",
    observationState: "site_only",
    structuralHint: hint,
    provenance: {
      collectedBy: "marca_site",
      collectedAt: entry.lastSeenAt || null,
      sourceRef: entry.sourceSitemapId || null,
    },
    notes: [`${relevance}: ${reason}`],
  });
}

/** Estrutura observada no site — identidade é a URL, nunca um `siloId`. */
export type ObservedSiteStructure = {
  /** Chave canônica da Brand. NÃO é `siloId` e nunca vira `territoryRef`. */
  normalizedUrl: string;
  url: string;
  path: string | null;
  slug: string | null;
  label: string;
  pageType: string;
  structuralHint: PublishedStructureEvidence["structuralHint"];
  canonical: string | null;
  canonicalVerified: boolean;
  isPublished: boolean;
  /** Páginas observadas abaixo desta. Evidência de seção, nunca decisão. */
  childPageCount: number;
  evidenceId: string;
};

export type SiteStructureReading = {
  brandId: string;
  /** Subconjunto estruturalmente justificável; o resto continua no catálogo. */
  structures: ObservedSiteStructure[];
  evidence: PublishedStructureEvidence[];
  counts: {
    observedUrls: number;
    structural: number;
    technical: number;
    unresolved: number;
  };
};

const emptyReading = (brandId: string): SiteStructureReading => ({
  brandId, structures: [], evidence: [],
  counts: { observedUrls: 0, structural: 0, technical: 0, unresolved: 0 },
});

/**
 * Lê o snapshot remoto e devolve o que o Arquiteto pode mostrar como estrutura.
 *
 * Usa o catálogo do LAST-KNOWN-GOOD: se a última execução falhou, o patrimônio
 * válido anterior continua valendo, e coleta parcial nunca vira estrutura.
 * Brand sem snapshot devolve leitura vazia e válida.
 */
export function buildSiteStructureReading(input: {
  brandId: string;
  snapshot: {
    brandId: string;
    catalog: readonly SiteCatalogEntryLike[];
    lastSuccessfulRun: { id: string } | null;
  } | null;
}): SiteStructureReading {
  const snapshot = input.snapshot;
  if (!snapshot || snapshot.brandId !== input.brandId) return emptyReading(input.brandId);
  // Sem execução íntegra não há patrimônio confirmado para projetar.
  if (!snapshot.lastSuccessfulRun) return emptyReading(input.brandId);

  // Hierarquia de URL do conjunto observado: quantas páginas vivem abaixo de
  // cada caminho. É evidência de seção — não decide Silo, apenas mostra que ali
  // existe organização publicada.
  const present = snapshot.catalog.filter(entry => entry.presenceState === "present");
  const childrenByPath = new Map<string, number>();
  for (const entry of present) {
    const path = (sitePathOf(entry.discoveredUrl || entry.normalizedUrl) || "").replace(/\/+$/, "");
    if (!path) continue;
    const segments = path.split("/").filter(Boolean);
    for (let depth = 1; depth < segments.length; depth += 1) {
      const ancestor = `/${segments.slice(0, depth).join("/")}`;
      childrenByPath.set(ancestor, (childrenByPath.get(ancestor) || 0) + 1);
    }
  }
  const childCountOf = (entry: SiteCatalogEntryLike) => {
    const path = (sitePathOf(entry.discoveredUrl || entry.normalizedUrl) || "").replace(/\/+$/, "");
    return path ? childrenByPath.get(path) || 0 : 0;
  };

  const evidence: PublishedStructureEvidence[] = [];
  const structures: ObservedSiteStructure[] = [];
  const counts = { observedUrls: 0, structural: 0, technical: 0, unresolved: 0 };

  for (const entry of snapshot.catalog) {
    // Ausente não é estrutura vigente; continua no catálogo da Marca.
    if (entry.presenceState !== "present") continue;
    counts.observedUrls += 1;
    const children = childCountOf(entry);
    const item = siteEvidenceFromCatalogEntry({ brandId: input.brandId, entry, childCount: children });
    evidence.push(item);

    const { relevance } = resolveSiteStructuralRelevance(entry, children);
    counts[relevance] += 1;
    if (relevance !== "structural") continue;

    const path = sitePathOf(entry.discoveredUrl || entry.normalizedUrl);
    const slug = siteSlugOf(path);
    const canonicalVerified = entry.verificationStatus === "canonical_confirmed"
      || entry.verificationStatus === "canonical_conflict";
    structures.push({
      normalizedUrl: entry.normalizedUrl,
      url: entry.discoveredUrl,
      path,
      slug,
      // Sem título verificado, o rótulo é o próprio caminho: nada é inventado.
      // H1 antes do title: o title costuma carregar sufixo da marca.
      label: entry.h1 || entry.title || slug || path || entry.normalizedUrl,
      pageType: entry.pageType,
      structuralHint: item.structuralHint,
      canonical: canonicalVerified ? entry.normalizedCanonicalUrl || null : null,
      canonicalVerified,
      isPublished: true,
      childPageCount: children,
      evidenceId: item.evidenceId,
    });
  }

  structures.sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl));
  evidence.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  return { brandId: input.brandId, structures, evidence, counts };
}

/**
 * Identidade segura entre uma página observada e uma SiloPage já conhecida.
 *
 * Só une por identidade determinística — canonical verificado, URL publicada ou
 * caminho normalizado idêntico. NUNCA por nome aproximado: `Cuidados Faciais` e
 * `/cuidados-faciais/` podem coincidir, mas isso é hipótese, não identidade.
 */
export function matchesKnownStructure(input: {
  structure: ObservedSiteStructure;
  knownSlug: string | null;
  knownPublishedUrl: string | null;
  knownCanonical: string | null;
}): boolean {
  // Aceita URL completa, chave canônica da Brand (`host/path`) e caminho solto:
  // as três formas circulam nos contratos e precisam comparar iguais.
  const normalizePath = (value: string | null) => {
    if (!value) return null;
    const path = value.includes("://")
      ? sitePathOf(value) || ""
      : value.startsWith("/") ? value : `/${value.split("/").slice(1).join("/")}`;
    return path.replace(/^\/+|\/+$/g, "").toLowerCase() || "/";
  };

  const structurePath = normalizePath(input.structure.path);
  if (!structurePath) return false;

  if (input.structure.canonicalVerified && input.knownCanonical) {
    if (normalizePath(input.knownCanonical) === normalizePath(input.structure.canonical)) return true;
  }
  if (input.knownPublishedUrl && normalizePath(input.knownPublishedUrl) === structurePath) return true;
  if (input.knownSlug && normalizePath(input.knownSlug) === structurePath) return true;
  return false;
}
