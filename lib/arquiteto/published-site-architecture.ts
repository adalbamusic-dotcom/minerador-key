/**
 * ARQUITETURA PUBLICADA — a árvore do site antes de qualquer classificação.
 *
 * A pergunta que este módulo responde vem ANTES de "esta URL é um Silo?":
 *
 *     qual é a posição desta URL na arquitetura já publicada?
 *
 * Sem isso, o catálogo vira lista plana e cada folha recebe a mesma oferta que
 * a raiz — foi exatamente o defeito que a leitura do sitemap expôs.
 *
 * A relação pai→filho de URL é OBSERVÁVEL, não inferida: `/a/b` está sob `/a`
 * porque o caminho diz isso. Por isso nada aqui usa provider, semântica ou IA.
 *
 * Domínio puro: sem storage, sem fetch, sem UI.
 */

import { classifyUrlStructuralHint } from "./territorial-base.ts";

/** Papel na arquitetura publicada. Read-model; nenhum enum persistido. */
export type PublishedNodeRole =
  /** A home do domínio. Tem todos os descendentes e NÃO é silo editorial. */
  | "site_home"
  /** Raiz de um universo publicado: página própria + filhos editoriais. */
  | "editorial_root"
  /** Página sob uma raiz publicada — o artigo já existente. */
  | "leaf"
  /** Fora da arquitetura editorial: institucional, legal, técnica. */
  | "institutional"
  /** Publicada, editorial, mas sem relação estrutural segura. */
  | "unresolved";

/** Quanto a evidência sustenta o papel. Nunca vira decisão sozinha. */
export type PublishedRoleConfidence = "strong" | "moderate" | "weak";

export type PublishedSiteNode = {
  normalizedUrl: string;
  url: string;
  path: string;
  segment: string;
  label: string;
  depth: number;
  role: PublishedNodeRole;
  confidence: PublishedRoleConfidence;
  /** Ancestral publicado mais próximo que EXISTE no catálogo. */
  parentPath: string | null;
  parentNormalizedUrl: string | null;
  /** Raiz editorial ancestral, quando houver. É o Silo publicado provável. */
  structuralRootPath: string | null;
  childPaths: string[];
  h1: string | null;
  canonical: string | null;
  verificationStatus: string;
  /** Por que este papel foi atribuído — a leitura se explica. */
  evidence: string[];
};

export type PublishedSiteArchitecture = {
  nodes: PublishedSiteNode[];
  /** Raízes editoriais: os Silos publicados prováveis. */
  editorialRoots: PublishedSiteNode[];
  leaves: PublishedSiteNode[];
  institutional: PublishedSiteNode[];
  unresolved: PublishedSiteNode[];
  home: PublishedSiteNode | null;
  counts: {
    pages: number;
    editorialRoots: number;
    leaves: number;
    institutional: number;
    unresolved: number;
  };
};

type CatalogEntryLike = {
  normalizedUrl: string;
  discoveredUrl: string;
  resolvedUrl?: string | null;
  declaredCanonicalUrl?: string | null;
  normalizedCanonicalUrl?: string | null;
  title?: string | null;
  h1?: string | null;
  pageType?: string | null;
  verificationStatus?: string | null;
};

/**
 * Caminhos que existem em quase todo site e não pertencem à arquitetura
 * editorial. Complementa `classifyUrlStructuralHint`, que já cobre o técnico.
 */
const INSTITUTIONAL_SEGMENTS = new Set([
  "afiliados", "sobre", "sobre-nos", "quem-somos", "contato", "fale-conosco",
  "politica-de-privacidade", "politica", "privacidade", "termos", "termos-de-uso",
  "cookies", "aviso-legal", "trabalhe-conosco", "imprensa", "faq", "ajuda",
]);

export function publishedPathOf(normalizedUrl: string): string {
  const withoutScheme = normalizedUrl.replace(/^[a-z]+:\/\//i, "");
  const slash = withoutScheme.indexOf("/");
  if (slash < 0) return "/";
  const trimmed = withoutScheme.slice(slash).replace(/\/+$/, "");
  return trimmed || "/";
}

const segmentsOf = (path: string) => path.split("/").filter(Boolean);

/** Caminho do pai direto. `/a/b/c` → `/a/b`; `/a` → `/`. */
export function parentPathOf(path: string): string | null {
  if (path === "/") return null;
  const segments = segmentsOf(path);
  if (segments.length <= 1) return "/";
  return `/${segments.slice(0, -1).join("/")}`;
}

/**
 * Ancestral publicado mais próximo que EXISTE no catálogo.
 *
 * Sobe a cadeia inteira: um artigo em `/silo/subtema/artigo` continua ligado a
 * `/silo` mesmo quando `/silo/subtema` não foi publicado.
 */
export function nearestPublishedAncestor(path: string, publishedPaths: ReadonlySet<string>): string | null {
  let current = parentPathOf(path);
  while (current) {
    if (current !== "/" && publishedPaths.has(current)) return current;
    current = parentPathOf(current);
  }
  return null;
}

const isInstitutional = (path: string) => {
  if (path === "/") return false;
  const segments = segmentsOf(path).map(segment => segment.toLowerCase());
  if (segments.some(segment => INSTITUTIONAL_SEGMENTS.has(segment))) return true;
  // Padrões legais que variam de site para site, mas seguem o mesmo prefixo.
  return segments.some(segment => /^politica[-_]/.test(segment) || /^termos[-_]/.test(segment));
};

/**
 * Reconstrói a arquitetura publicada a partir do catálogo remoto.
 *
 * As regras, em ordem — e nenhuma delas decide sozinha:
 *
 *  1. `/` é a home. Ter 48 descendentes NÃO a torna silo editorial; é por isso
 *     que contagem de filhos nunca pode ser o único critério.
 *  2. Caminho institucional ou técnico sai da arquitetura editorial.
 *  3. Página com ancestral publicado é folha — o artigo que já existe.
 *  4. Página de primeiro nível COM página própria e filhos editoriais é raiz.
 *  5. O resto fica `unresolved`: publicada, editorial, sem relação segura.
 */
export function buildPublishedSiteArchitecture(input: {
  catalog: readonly CatalogEntryLike[];
}): PublishedSiteArchitecture {
  const catalog = input.catalog || [];
  const publishedPaths = new Set(catalog.map(entry => publishedPathOf(entry.normalizedUrl)));

  const childrenByPath = new Map<string, string[]>();
  for (const entry of catalog) {
    const path = publishedPathOf(entry.normalizedUrl);
    const parent = parentPathOf(path);
    if (!parent) continue;
    childrenByPath.set(parent, [...(childrenByPath.get(parent) || []), path]);
  }

  const nodes: PublishedSiteNode[] = catalog.map(entry => {
    const path = publishedPathOf(entry.normalizedUrl);
    const segments = segmentsOf(path);
    const segment = segments.length ? segments[segments.length - 1] : "/";
    const childPaths = (childrenByPath.get(path) || []).sort();
    const ancestor = nearestPublishedAncestor(path, publishedPaths);
    const hint = classifyUrlStructuralHint(path);
    const evidence: string[] = [];

    let role: PublishedNodeRole;
    let confidence: PublishedRoleConfidence;

    if (path === "/") {
      role = "site_home";
      confidence = "strong";
      evidence.push("Raiz do domínio: é a home do site, não um universo editorial.");
    } else if (hint === "technical" || isInstitutional(path)) {
      role = "institutional";
      confidence = "strong";
      evidence.push("Caminho institucional ou técnico: fora da arquitetura editorial.");
    } else if (ancestor) {
      role = "leaf";
      // Filho direto de uma raiz é mais seguro que neto de raiz intermediária.
      confidence = parentPathOf(path) === ancestor ? "strong" : "moderate";
      evidence.push(`Publicada sob ${ancestor}: é página filha, não raiz de universo.`);
    } else if (segments.length === 1 && childPaths.length > 0) {
      role = "editorial_root";
      confidence = childPaths.length >= 2 ? "strong" : "moderate";
      evidence.push(`Página publicada própria com ${childPaths.length} página(s) abaixo dela.`);
    } else {
      role = "unresolved";
      confidence = "weak";
      evidence.push(segments.length === 1
        ? "Publicada no primeiro nível, mas sem páginas abaixo: não há relação estrutural segura."
        : "Sem ancestral publicado no catálogo: relação estrutural não comprovável.");
    }

    if (entry.h1?.trim()) evidence.push(`H1 observado: ${entry.h1.trim()}`);
    if (entry.verificationStatus === "canonical_confirmed") evidence.push("Canonical confirmado na página.");

    return {
      normalizedUrl: entry.normalizedUrl,
      url: entry.resolvedUrl || entry.discoveredUrl,
      path,
      segment,
      label: entry.h1?.trim() || entry.title?.trim() || segment,
      depth: Math.max(segments.length - 1, 0),
      role,
      confidence,
      parentPath: parentPathOf(path),
      parentNormalizedUrl: null,
      structuralRootPath: null,
      childPaths,
      h1: entry.h1?.trim() || null,
      canonical: entry.normalizedCanonicalUrl || entry.declaredCanonicalUrl || null,
      verificationStatus: entry.verificationStatus || "pending",
      evidence,
    };
  });

  const byPath = new Map(nodes.map(node => [node.path, node]));
  const rootPaths = new Set(nodes.filter(node => node.role === "editorial_root").map(node => node.path));

  for (const node of nodes) {
    if (node.parentPath && byPath.has(node.parentPath)) {
      node.parentNormalizedUrl = byPath.get(node.parentPath)!.normalizedUrl;
    }
    if (node.role !== "leaf") continue;
    // O Silo publicado provável é a RAIZ editorial ancestral, não o pai direto
    // quando o pai é apenas um subtema sem página própria de universo.
    let current: string | null = node.path;
    while (current) {
      const parent: string | null = parentPathOf(current);
      if (parent && rootPaths.has(parent)) { node.structuralRootPath = parent; break; }
      current = parent;
    }
    if (node.structuralRootPath) {
      node.evidence.push(`Silo publicado provável: ${node.structuralRootPath}`);
    }
  }

  nodes.sort((left, right) => left.path.localeCompare(right.path));

  const editorialRoots = nodes.filter(node => node.role === "editorial_root");
  const leaves = nodes.filter(node => node.role === "leaf");
  const institutional = nodes.filter(node => node.role === "institutional");
  const unresolved = nodes.filter(node => node.role === "unresolved");

  return {
    nodes,
    editorialRoots,
    leaves,
    institutional,
    unresolved,
    home: nodes.find(node => node.role === "site_home") ?? null,
    counts: {
      pages: nodes.length,
      editorialRoots: editorialRoots.length,
      leaves: leaves.length,
      institutional: institutional.length,
      unresolved: unresolved.length,
    },
  };
}

/**
 * Silo publicado ancestral de uma URL de artigo.
 *
 * É o elo que a fase Artigos vai usar para saber a que universo um conteúdo já
 * publicado pertence — sem tocar em canonical, slug ou URL.
 */
export function getPublishedParentStructure(
  architecture: PublishedSiteArchitecture,
  articleUrl: string,
): { node: PublishedSiteNode; root: PublishedSiteNode | null } | null {
  const path = publishedPathOf(articleUrl);
  const node = architecture.nodes.find(item => item.path === path) ?? null;
  if (!node) return null;
  const root = node.structuralRootPath
    ? architecture.nodes.find(item => item.path === node.structuralRootPath) ?? null
    : null;
  return { node, root };
}
