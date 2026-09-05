/**
 * Projeção NAVEGÁVEL do sitemap remoto para a aba Silos.
 *
 * Não é uma área nova nem um segundo workspace: é outra leitura da mesma mesa,
 * escolhida por `siloView`. A fonte é exclusivamente o snapshot remoto
 * (last-known-good) já lido por `buildSiteStructureReading` — nenhum
 * localStorage, nenhum fallback, nenhuma inferência de URL que o catálogo não
 * tenha registrado.
 *
 * Domínio puro: sem storage, sem fetch, sem UI.
 */

import type { SiteCatalogEntryLike } from "./site-structure-evidence.ts";
import { buildPublishedSiteArchitecture, type PublishedNodeRole, type PublishedRoleConfidence } from "./published-site-architecture.ts";

/** Vínculo da página publicada com a arquitetura do Arquiteto. */
export type SitemapRelationKind =
  | "unevaluated"
  | "existing_structure"
  | "already_silo"
  | "silo_candidate"
  | "silo_confirmed";

export type SitemapRow = {
  /** Identidade da linha: a mesma do catálogo remoto. Nunca fabricada. */
  normalizedUrl: string;
  url: string;
  path: string;
  /** Último segmento do caminho; a raiz aparece como "/". */
  segment: string;
  /** Rótulo humano: H1 observado, senão title, senão o segmento. */
  label: string;
  /** Profundidade no caminho — é o que produz a indentação da árvore. */
  depth: number;
  childCount: number;
  h1: string | null;
  pageType: string | null;
  canonical: string | null;
  /** Estado bruto da verificação remota; a UI escolhe a frase. */
  verificationStatus: string;
  relation: {
    kind: SitemapRelationKind;
    label: string | null;
    /** `territoryRef` quando é Silo; `siloId` quando é estrutura conhecida. */
    ref: string | null;
  };
  /**
   * Só oferece promoção quando NÃO há vínculo E a página é raiz editorial.
   * Uma folha publicada NÃO recebe a oferta principal: ela já pertence a um
   * universo, e oferecê-la como silo era o que tornava a lista ilegível.
   */
  canPromote: boolean;
  /** Papel na arquitetura publicada — vem da árvore, não da contagem. */
  role: PublishedNodeRole;
  roleConfidence: PublishedRoleConfidence;
  /** Raiz editorial ancestral: o Silo publicado provável desta página. */
  structuralRootPath: string | null;
  /** Rótulo do Silo pai quando já reconciliado. */
  structuralRootLabel: string | null;
  /** Por que este papel foi atribuído. */
  roleEvidence: string[];
};

export type SitemapView = {
  rows: SitemapRow[];
  counts: {
    pages: number;
    linked: number;
    promotable: number;
    /** Papéis resolvidos pela árvore publicada. */
    editorialRoots: number;
    leaves: number;
    institutional: number;
    unresolved: number;
  };
  /** Vazio legítimo tem mensagem própria; ausência não é erro. */
  emptyReason: string | null;
};

type StructureProjectionLike = {
  normalizedUrl: string;
  reconciledSiloId: string | null;
  promotedTerritoryRef: string | null;
};

type TerritoryLike = {
  territoryRef: string;
  name: string | null;
  centralEntity: string;
  lifecycleStatus: string;
};

type ExistingStructureLike = {
  siloId: string;
  name: string;
};

/** Caminho sem host, sempre iniciado por "/". */
export function sitemapPathOf(normalizedUrl: string): string {
  const withoutScheme = normalizedUrl.replace(/^[a-z]+:\/\//i, "");
  const slash = withoutScheme.indexOf("/");
  if (slash < 0) return "/";
  const path = withoutScheme.slice(slash);
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}

const segmentsOf = (path: string) => path.split("/").filter(Boolean);

export function buildSitemapView(input: {
  catalog: readonly (SiteCatalogEntryLike & { id?: string })[];
  structures?: readonly StructureProjectionLike[];
  territories?: readonly TerritoryLike[];
  existingStructures?: readonly ExistingStructureLike[];
}): SitemapView {
  const catalog = input.catalog || [];
  if (!catalog.length) {
    return {
      rows: [],
      counts: { pages: 0, linked: 0, promotable: 0, editorialRoots: 0, leaves: 0, institutional: 0, unresolved: 0 },
      emptyReason: "Nenhuma página no catálogo remoto. Sincronize o sitemap da Marca para ver o site aqui.",
    };
  }

  const structureByUrl = new Map((input.structures || []).map(item => [item.normalizedUrl, item]));
  const territoryByRef = new Map((input.territories || []).map(item => [item.territoryRef, item]));
  const structureNameById = new Map((input.existingStructures || []).map(item => [item.siloId, item.name]));

  // A ARQUITETURA vem antes da classificação: a posição de cada URL na árvore
  // publicada é o que separa raiz editorial de folha e de institucional.
  const architecture = buildPublishedSiteArchitecture({ catalog });
  const nodeByUrl = new Map(architecture.nodes.map(node => [node.normalizedUrl, node]));
  const labelByPath = new Map(architecture.nodes.map(node => [node.path, node.label]));

  const rows: SitemapRow[] = catalog.map(entry => {
    const path = sitemapPathOf(entry.normalizedUrl);
    const segments = segmentsOf(path);
    const segment = segments.length ? segments[segments.length - 1] : "/";
    const node = nodeByUrl.get(entry.normalizedUrl) ?? null;
    const structure = structureByUrl.get(entry.normalizedUrl) || null;
    const territory = structure?.promotedTerritoryRef
      ? territoryByRef.get(structure.promotedTerritoryRef) ?? null
      : null;

    let relation: SitemapRow["relation"] = { kind: "unevaluated", label: null, ref: null };
    if (territory) {
      const nome = territory.name || territory.centralEntity || "Silo sem nome";
      relation = territory.lifecycleStatus === "confirmed"
        ? { kind: "silo_confirmed", label: nome, ref: territory.territoryRef }
        : { kind: "silo_candidate", label: nome, ref: territory.territoryRef };
    } else if (structure?.reconciledSiloId) {
      relation = {
        kind: "already_silo",
        label: structureNameById.get(structure.reconciledSiloId) || structure.reconciledSiloId,
        ref: structure.reconciledSiloId,
      };
    } else if (structure) {
      relation = { kind: "existing_structure", label: null, ref: null };
    }

    return {
      normalizedUrl: entry.normalizedUrl,
      url: entry.resolvedUrl || entry.discoveredUrl,
      path,
      segment,
      label: entry.h1?.trim() || entry.title?.trim() || segment,
      depth: Math.max(segments.length - 1, 0),
      childCount: node?.childPaths.length ?? 0,
      h1: entry.h1?.trim() || null,
      pageType: entry.pageType || null,
      canonical: entry.normalizedCanonicalUrl || entry.declaredCanonicalUrl || null,
      verificationStatus: entry.verificationStatus,
      relation,
      // Promoção principal só na RAIZ editorial sem vínculo. Folha, home e
      // institucional não recebem a oferta — o override humano existe fora do
      // fluxo principal, na visão Arquitetura.
      canPromote: (relation.kind === "unevaluated" || relation.kind === "existing_structure")
        && (node?.role === "editorial_root" || node?.role === "unresolved"),
      role: node?.role ?? "unresolved",
      roleConfidence: node?.confidence ?? "weak",
      structuralRootPath: node?.structuralRootPath ?? null,
      structuralRootLabel: node?.structuralRootPath ? labelByPath.get(node.structuralRootPath) ?? null : null,
      roleEvidence: node?.evidence ?? [],
    };
  });

  // Ordem de caminho: o pai vem antes dos filhos sem precisar montar árvore.
  rows.sort((left, right) => left.path.localeCompare(right.path));

  return {
    rows,
    counts: {
      pages: rows.length,
      linked: rows.filter(row => row.relation.kind !== "unevaluated" && row.relation.kind !== "existing_structure").length,
      promotable: rows.filter(row => row.canPromote).length,
      editorialRoots: rows.filter(row => row.role === "editorial_root").length,
      leaves: rows.filter(row => row.role === "leaf").length,
      institutional: rows.filter(row => row.role === "institutional").length,
      unresolved: rows.filter(row => row.role === "unresolved").length,
    },
    emptyReason: null,
  };
}
