import type { MineradorSiteSyncCandidate } from "./site-sync-adapter.ts";

/**
 * CASAMENTO KEYWORD × CATÁLOGO DO SITE, E O PAPEL DA PÁGINA.
 *
 * "Conferir site" só encontrava uma keyword quando ela tinha sido EXTRAÍDA
 * como candidata no navegador — e o catálogo saiu do navegador em 2026-09
 * (`brand_site_catalog_entries`). O resultado era "Nenhuma URL foi localizada
 * no catálogo" para uma página que estava lá, com o H1 igual à keyword.
 *
 * Este módulo lê o catálogo remoto e casa pelo que a página declara: H1,
 * título e slug. E responde a segunda pergunta que o Arquiteto faz —
 * *esta URL é um Silo ou um artigo?* — pela posição na árvore publicada,
 * com as mesmas regras de `lib/arquiteto/published-site-architecture.ts`
 * (relação pai→filho é observável no caminho, não inferida). As regras são
 * repetidas aqui porque o Minerador não importa o Arquiteto.
 *
 * Domínio puro.
 */

export type SiteCatalogEntryLike = {
  id: string;
  normalizedUrl: string;
  discoveredUrl?: string | null;
  resolvedUrl?: string | null;
  declaredCanonicalUrl?: string | null;
  title?: string | null;
  h1?: string | null;
  verificationStatus?: string | null;
  presenceState?: string | null;
  ignoredAt?: string | null;
};

export type SitePageRole = "home" | "silo" | "article" | "institutional" | "unresolved";

export type SitePageStructure = {
  role: SitePageRole;
  path: string;
  /** Caminho do Silo que contém a página (`/rotina-skincare-facial`); o próprio, quando é Silo. */
  siloPath: string | null;
  siloSlug: string | null;
  /** Quantas páginas do catálogo estão abaixo desta. */
  childCount: number;
  reason: string;
};

export type CatalogMatch = {
  entry: SiteCatalogEntryLike;
  matchedBy: "h1" | "slug" | "title";
  confidence: "high" | "medium";
};

const SITE_ROLE_LABELS: Record<SitePageRole, string> = {
  home: "Home",
  silo: "Silo",
  article: "Artigo",
  institutional: "Institucional",
  unresolved: "Sem estrutura",
};

export function sitePageRoleLabel(role: SitePageRole | string | null | undefined): string {
  return role && role in SITE_ROLE_LABELS ? SITE_ROLE_LABELS[role as SitePageRole] : "—";
}

// ------------------------------------------------------------ normalização

export function normalizeKeywordText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function slugOfText(value: string): string {
  return normalizeKeywordText(value).replace(/\s+/g, "-");
}

/** `/a/b/` → `/a/b`; host sem caminho → `/`. Aceita URL com ou sem esquema. */
export function sitePathOf(url: string): string {
  const withoutScheme = url.trim().replace(/^[a-z]+:\/\//i, "");
  const slash = withoutScheme.indexOf("/");
  if (slash < 0) return "/";
  const trimmed = withoutScheme.slice(slash).split(/[?#]/)[0].replace(/\/+$/, "");
  return trimmed || "/";
}

const segmentsOf = (path: string) => path.split("/").filter(Boolean);

function parentPathOf(path: string): string | null {
  if (path === "/") return null;
  const segments = segmentsOf(path);
  if (segments.length <= 1) return "/";
  return `/${segments.slice(0, -1).join("/")}`;
}

const INSTITUTIONAL_SEGMENTS = new Set([
  "afiliados", "sobre", "sobre-nos", "quem-somos", "contato", "fale-conosco",
  "politica-de-privacidade", "politica", "privacidade", "termos", "termos-de-uso",
  "cookies", "aviso-legal", "trabalhe-conosco", "imprensa", "faq", "ajuda",
  "colaboradores", "politica-editorial", "login", "cadastro", "carrinho", "checkout",
]);

function isInstitutional(path: string): boolean {
  if (path === "/") return false;
  const segments = segmentsOf(path).map(segment => segment.toLowerCase());
  if (segments.some(segment => INSTITUTIONAL_SEGMENTS.has(segment))) return true;
  return segments.some(segment => /^politica[-_]/.test(segment) || /^termos[-_]/.test(segment));
}

// ------------------------------------------------------------ estrutura

function liveEntries(catalog: readonly SiteCatalogEntryLike[]): SiteCatalogEntryLike[] {
  return catalog.filter(entry => !entry.ignoredAt && entry.presenceState !== "removed" && entry.presenceState !== "missing");
}

/**
 * Papel de uma URL na árvore publicada.
 *
 * A URL conferida não precisa estar no catálogo: a página de Silo do
 * Care Glow não está no sitemap, mas seis artigos abaixo dela estão — e é
 * isso que a torna Silo. Regras, na ordem, nenhuma decide sozinha:
 *
 *  1. `/` é a home.
 *  2. Caminho institucional sai da arquitetura editorial.
 *  3. Página com ancestral (no catálogo OU no caminho) é artigo.
 *  4. Primeiro nível com páginas abaixo é Silo.
 *  5. Primeiro nível sem filhos fica `unresolved` — o humano decide.
 */
export function deriveSitePageStructure(url: string, catalog: readonly SiteCatalogEntryLike[]): SitePageStructure {
  const path = sitePathOf(url);
  const segments = segmentsOf(path);
  const paths = new Set(liveEntries(catalog).map(entry => sitePathOf(entry.normalizedUrl)));
  const childCount = [...paths].filter(candidate => candidate !== path && candidate.startsWith(`${path}/`)).length;

  if (path === "/") return { role: "home", path, siloPath: null, siloSlug: null, childCount, reason: "Raiz do domínio: é a home, não um universo editorial." };
  if (isInstitutional(path)) return { role: "institutional", path, siloPath: null, siloSlug: null, childCount, reason: "Caminho institucional: fora da arquitetura editorial." };
  if (segments.length >= 2) {
    // O Silo é o primeiro nível do caminho. Um artigo em `/silo/subtema/artigo`
    // continua ligado a `/silo` mesmo sem `/silo/subtema` publicado.
    const siloPath = `/${segments[0]}`;
    const parent = parentPathOf(path);
    const parentPublished = parent ? paths.has(parent) : false;
    return {
      role: "article",
      path,
      siloPath,
      siloSlug: segments[0],
      childCount,
      reason: parentPublished
        ? `Publicada sob ${siloPath}, que também está no catálogo.`
        : `Publicada sob ${siloPath} pelo caminho; a página do Silo não consta no catálogo.`,
    };
  }
  if (childCount > 0) {
    return { role: "silo", path, siloPath: path, siloSlug: segments[0], childCount, reason: `Primeiro nível com ${childCount} página(s) abaixo: raiz de um universo publicado.` };
  }
  return { role: "unresolved", path, siloPath: null, siloSlug: null, childCount: 0, reason: "Primeiro nível sem páginas abaixo: pode ser Silo novo ou página avulsa; decisão humana." };
}

// ------------------------------------------------------------ casamento

function lastSlug(path: string): string {
  const segments = segmentsOf(path);
  return segments.length ? segments[segments.length - 1].toLowerCase() : "";
}

/**
 * Encontra no catálogo as páginas que declaram a keyword.
 *
 * H1 igual e slug igual são casamentos fortes: a página diz que é sobre isto.
 * Título que contém a keyword inteira é fraco — "Qual pomada é boa para
 * queimadura? Como escolher | CareGlow" contém, mas também conteria uma
 * keyword mais curta. Nunca se casa por pedaço de palavra.
 */
export function matchKeywordToCatalog(keyword: string, catalog: readonly SiteCatalogEntryLike[]): CatalogMatch[] {
  const wanted = normalizeKeywordText(keyword);
  const wantedSlug = slugOfText(keyword);
  if (!wanted) return [];
  // Título contém a keyword só conta para keyword de duas palavras ou mais:
  // "pomada" está em dezenas de títulos e não identifica página nenhuma.
  const titleEligible = wanted.split(" ").length >= 2;
  const matches: CatalogMatch[] = [];
  for (const entry of liveEntries(catalog)) {
    const h1 = entry.h1 ? normalizeKeywordText(entry.h1) : "";
    const title = entry.title ? normalizeKeywordText(entry.title) : "";
    const slug = lastSlug(sitePathOf(entry.normalizedUrl));
    if (h1 && h1 === wanted) matches.push({ entry, matchedBy: "h1", confidence: "high" });
    else if (slug && slug === wantedSlug) matches.push({ entry, matchedBy: "slug", confidence: "high" });
    else if (title && titleEligible && (title === wanted || title.startsWith(`${wanted} `) || title.includes(` ${wanted} `) || title.endsWith(` ${wanted}`))) {
      matches.push({ entry, matchedBy: "title", confidence: "medium" });
    }
  }
  return matches.sort((left, right) => (left.confidence === right.confidence ? 0 : left.confidence === "high" ? -1 : 1));
}

function entryUrl(entry: SiteCatalogEntryLike): string {
  const raw = entry.resolvedUrl || entry.discoveredUrl || entry.normalizedUrl;
  return /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const VERIFICATION_STATUSES = new Set(["discovered", "unverified", "accessible", "canonical_confirmed", "canonical_missing", "canonical_conflict", "redirect", "noindex", "not_found", "error", "stale"]);

/**
 * Converte o casamento numa candidata do fluxo existente de conferência —
 * o mesmo objeto que a verificação técnica e a persistência já entendem.
 */
export function candidateFromCatalogMatch(input: {
  keyword: string;
  brandId: string;
  match: CatalogMatch;
  catalog: readonly SiteCatalogEntryLike[];
  candidateId: string;
  /** Linha que originou a conferência; a evidência volta para ela. */
  mineradorKeywordId?: string | null;
}): MineradorSiteSyncCandidate {
  const { entry, matchedBy, confidence } = input.match;
  const structure = deriveSitePageStructure(entry.normalizedUrl, input.catalog);
  const verification = entry.verificationStatus && VERIFICATION_STATUSES.has(entry.verificationStatus) ? entry.verificationStatus : "unverified";
  return {
    id: input.candidateId,
    brandId: input.brandId,
    text: input.keyword,
    normalizedText: normalizeKeywordText(input.keyword),
    catalogEntryId: entry.id,
    sourceKind: "site_sitemap",
    sourceUrl: entryUrl(entry),
    sourceField: matchedBy,
    sourceFields: [matchedBy],
    suggestedRole: "possible_primary",
    slugCoherence: matchedBy === "slug" ? "high" : lastSlug(sitePathOf(entry.normalizedUrl)) === slugOfText(input.keyword) ? "high" : "medium",
    urlSituation: verification as MineradorSiteSyncCandidate["urlSituation"],
    publicationStatus: "not_confirmed",
    keywordUrlRelation: "candidate_primary",
    architectureStatus: "awaiting_architecture",
    relationConfirmedBy: null,
    relationConfirmedAt: null,
    lastCheckedAt: null,
    confidence,
    resolvedUrl: entry.resolvedUrl ?? null,
    declaredCanonicalUrl: entry.declaredCanonicalUrl ?? null,
    pageTitle: entry.title ?? null,
    pageH1: entry.h1 ?? null,
    catalogTitle: entry.title || entry.h1 || null,
    siteRole: structure.role,
    siloPath: structure.siloPath,
    mineradorKeywordId: input.mineradorKeywordId ?? null,
  };
}
