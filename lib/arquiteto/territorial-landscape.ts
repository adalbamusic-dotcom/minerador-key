import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "./contracts.ts";
import { matchesKnownStructure, type ObservedSiteStructure } from "./site-structure-evidence.ts";
import {
  checkTerritorialConsistency,
  type KeywordTerritoryAssignment,
  type MembershipConsistencyReport,
  type TerritoryCandidate,
  type TerritoryConflict,
} from "./territory.ts";

/**
 * TerritorialLandscape — read-model do estado arquitetural existente da Brand
 * (SDD Silo-first §5.4, Fase 2). SOMENTE LEITURA.
 *
 * Responde "qual é a paisagem estrutural e narrativa atual desta Brand, e onde
 * as KeywordDNAs recebidas podem se encaixar" — sem recomendar nada. Não é
 * engine: não infere território, não cria membership, não grava, não chama
 * provider. Cada informação declara a fonte de onde veio.
 *
 * INV-T13: zero chamada a provider em leitura, render ou hidratação.
 * INV-T14: legado não é convertido, inferido nem apagado.
 * INV-T16: territoryRef nunca é derivado de lista_id nem de siloId.
 */

/** Origem canônica de cada projeção; nunca inferida, sempre declarada. */
export const LANDSCAPE_SOURCE_KINDS = [
  "territory_record",
  "silo_dna",
  "silo_page",
  "article_dna",
  "published_keyword",
  "brand_registry",
  "site_catalog",
] as const;
export type LandscapeSourceKind = (typeof LANDSCAPE_SOURCE_KINDS)[number];

export type TerritoryProjection = TerritoryCandidate & {
  /** Derivado da membership vigente; nunca gravado a partir daqui. */
  keywordRefs: string[];
  /** ArticleDNAs que declaram este Silo. Derivado na leitura, como keywordRefs. */
  articleRefs: string[];
};

/**
 * Estrutura existente reconhecida sem território declarado — âncora de leitura,
 * nunca um território. Vira território só quando um humano confirmar.
 */
export type ExistingStructureProjection = {
  siloId: string;
  name: string | null;
  sourceKind: LandscapeSourceKind;
  sourceEntityId: string;
  versionId: string | null;
  contentHash: string | null;
  isPublished: boolean;
  /** ArticleDNAs que declaram esta estrutura. Derivado na leitura. */
  articleRefs: string[];
  /** Página do Silo vigente, quando existir. Ausência permanece ausência. */
  siloPageId: string | null;
  slug: string | null;
  keywordRefs: string[];
  anchoredByTerritoryRef: string | null;
};

/**
 * Estrutura observada no site que ainda NÃO tem identidade canônica de Silo.
 * Mantida separada de `ExistingStructureProjection` de propósito: `siloId` e
 * URL são espaços de identidade distintos.
 */
export type ObservedSiteStructureProjection = ObservedSiteStructure & {
  /** Preenchido quando a página coincide com um Silo/Página já conhecidos. */
  reconciledSiloId: string | null;
  /** Preenchido quando um humano já promoveu esta página a silo candidato. */
  promotedTerritoryRef: string | null;
};

export type LegacyArticleEntry = {
  articleId: string;
  siloId: string | null;
  reason: string;
};

export type UnassignedKeywordEntry = {
  keywordId: string;
  state: KeywordTerritoryAssignment["state"];
  reason: string;
  /** Quem decidiu. Só "human" é decisão territorial humana. */
  source: KeywordTerritoryAssignment["source"] | null;
};

export type LandscapeProtections = {
  publishedSiloPageIds: string[];
  publishedArticleIds: string[];
  protectedSlugs: string[];
  protectedCanonicals: string[];
};

export type LandscapeSourceAudit = {
  sourceKind: LandscapeSourceKind;
  present: boolean;
  recordCount: number;
};

export type TerritorialLandscape = {
  /** Fonte da decisão de membership por keyword; ausente = não decidida. */
  decisionSourceOf: (keywordId: string) => KeywordTerritoryAssignment["source"] | null;
  /**
   * Status de workflow da PRÓPRIA keyword. A linha da keyword não pode herdar
   * "publicado" só porque a página do silo está publicada.
   */
  keywordStatusOf: (keywordId: string) => string | null;
  brandId: string;
  /** Âncoras: estrutura que já existe e ainda não foi declarada território. */
  existingStructures: ExistingStructureProjection[];
  /**
   * Páginas observadas no Site/Sitemap. Evidência publicada, não Silo: quando
   * coincidem com estrutura já conhecida, carregam `reconciledSiloId` em vez de
   * virar uma segunda linha.
   */
  observedSiteStructures: ObservedSiteStructureProjection[];
  candidateTerritories: TerritoryProjection[];
  confirmedTerritories: TerritoryProjection[];
  /** Territórios fora do ciclo de membership (consolidado, rejeitado, arquivado…). */
  otherTerritories: TerritoryProjection[];
  legacyNeedsReconciliation: LegacyArticleEntry[];
  unassignedKeywords: UnassignedKeywordEntry[];
  conflicts: TerritoryConflict[];
  consistency: MembershipConsistencyReport;
  protections: LandscapeProtections;
  sources: LandscapeSourceAudit[];
  counts: {
    keywordsInScope: number;
    keywordsAssigned: number;
    keywordsUnassigned: number;
    existingStructures: number;
    observedSiteStructures: number;
    candidateTerritories: number;
    confirmedTerritories: number;
  };
};

export type TerritorialLandscapeInput = {
  brandId: string;
  /** KeywordDNAs recebidas do Minerador, no estado real em que chegaram. */
  keywords: ReadonlyArray<{ id: string; brand_id?: string | null; [key: string]: unknown }>;
  territories: readonly TerritoryCandidate[];
  assignments: readonly KeywordTerritoryAssignment[];
  siloDnas?: ReadonlyArray<VersionEnvelope<SiloDNA>>;
  siloPages?: ReadonlyArray<VersionEnvelope<SiloPage>>;
  articleDnas?: ReadonlyArray<VersionEnvelope<ArticleDNA>>;
  /**
   * Catálogo `marcas.silos_existentes`. É registro remoto da Marca, escrito
   * pela criação manual de Silo — entra como estrutura existente, nunca como
   * território: promover a território continua sendo decisão humana.
   */
  brandRegistrySilos?: ReadonlyArray<{ id: string; nome?: string | null; slug?: string | null }>;
  /**
   * Estruturas observadas no Site/Sitemap, já filtradas por natureza. Evidência
   * publicada — não é Silo, não tem `siloId` e nunca vira `territoryRef`.
   */
  siteStructures?: ReadonlyArray<ObservedSiteStructure>;
};

const sortedUnique = (values: readonly string[]) => [...new Set(values.filter(Boolean))].sort();
const byRef = (left: { territoryRef: string }, right: { territoryRef: string }) =>
  left.territoryRef.localeCompare(right.territoryRef);

/** `lista_id`/`silo_id` da keyword publicada: evidência de estrutura, nunca membership. */
const keywordSiloEvidence = (keyword: Record<string, unknown>): string | null => {
  const value = keyword.silo_id ?? keyword.siloId ?? keyword.lista_id;
  return typeof value === "string" && value.trim() ? value : null;
};

const keywordIsPublished = (keyword: Record<string, unknown>) =>
  Boolean(keyword.isPublished) || String(keyword.status || "").toLowerCase() === "publicado";

/**
 * Monta a paisagem territorial a partir das fontes canônicas recebidas.
 *
 * Função pura: recebe o snapshot já carregado e devolve a projeção. Toda fonte
 * ausente é registrada como ausente — nenhum fallback preenche a lista.
 */
export function buildTerritorialLandscape(input: TerritorialLandscapeInput): TerritorialLandscape {
  const siloDnas = input.siloDnas || [];
  const siloPages = input.siloPages || [];
  const articleDnas = input.articleDnas || [];
  const brandRegistrySilos = input.brandRegistrySilos || [];
  const siteStructures = input.siteStructures || [];

  // INV-T12: nada de outra Brand entra na paisagem.
  const keywords = input.keywords.filter(keyword => !keyword.brand_id || keyword.brand_id === input.brandId);
  const keywordIds = new Set(keywords.map(keyword => String(keyword.id)));
  const territories = input.territories.filter(territory => territory.brandId === input.brandId);
  const assignments = input.assignments.filter(assignment => assignment.brandId === input.brandId);

  const membersByTerritory = new Map<string, string[]>();
  const sourceByKeyword = new Map<string, KeywordTerritoryAssignment["source"]>();
  const assignedKeywordIds = new Set<string>();
  const unassignedKeywords: UnassignedKeywordEntry[] = [];
  for (const assignment of assignments) {
    if (!assignment.territoryRef) {
      unassignedKeywords.push({ keywordId: assignment.keywordId, state: assignment.state, reason: assignment.reason, source: assignment.source });
      continue;
    }
    assignedKeywordIds.add(assignment.keywordId);
    sourceByKeyword.set(assignment.keywordId, assignment.source);
    membersByTerritory.set(assignment.territoryRef, [
      ...(membersByTerritory.get(assignment.territoryRef) || []),
      assignment.keywordId,
    ]);
  }

  // Keyword em escopo sem decisão declarada continua visível e explicitamente
  // pendente — INV-T2: nenhuma keyword importada desaparece.
  const decided = new Set([...assignedKeywordIds, ...unassignedKeywords.map(entry => entry.keywordId)]);
  for (const keywordId of keywordIds) {
    if (decided.has(keywordId)) continue;
    unassignedKeywords.push({
      keywordId,
      state: "unassigned",
      reason: "Recebida do Minerador; ainda sem decisão de silo.",
      // Recebimento do Minerador NÃO é decisão territorial.
      source: null,
    });
  }

  const decisionSourceOf = (keywordId: string) => sourceByKeyword.get(keywordId) ?? null;

  const statusByKeyword = new Map<string, string>(keywords.map(keyword => [
    String(keyword.id),
    keywordIsPublished(keyword as Record<string, unknown>) ? "publicado" : String((keyword as Record<string, unknown>).status || "recebida"),
  ]));
  const keywordStatusOf = (keywordId: string) => statusByKeyword.get(keywordId) ?? null;

  // ArticleDNA declara território OU silo; os dois espaços de identidade são
  // distintos, então cada um é contado pela chave que o próprio Article traz.
  const articlesByTerritory = new Map<string, string[]>();
  const articlesBySilo = new Map<string, string[]>();
  for (const version of articleDnas) {
    if (version.payload.brandId !== input.brandId) continue;
    const articleId = version.payload.articleId;
    const ref = version.payload.territoryRef;
    if (ref) articlesByTerritory.set(ref, [...(articlesByTerritory.get(ref) || []), articleId]);
    const siloId = version.payload.siloId;
    if (siloId) articlesBySilo.set(String(siloId), [...(articlesBySilo.get(String(siloId)) || []), articleId]);
  }

  const project = (territory: TerritoryCandidate): TerritoryProjection => ({
    ...territory,
    keywordRefs: sortedUnique(membersByTerritory.get(territory.territoryRef) || []),
    articleRefs: sortedUnique(articlesByTerritory.get(territory.territoryRef) || []),
  });

  const projections = territories.map(project).sort(byRef);
  const candidateTerritories = projections.filter(territory => territory.lifecycleStatus === "candidate");
  const confirmedTerritories = projections.filter(territory => territory.lifecycleStatus === "confirmed");
  const otherTerritories = projections.filter(territory =>
    territory.lifecycleStatus !== "candidate" && territory.lifecycleStatus !== "confirmed");

  // Estruturas existentes: SiloDNA/SiloPage vigentes e evidência de keyword
  // publicada. São âncoras de leitura — território só nasce por decisão humana.
  const anchoredSiloIds = new Map<string, string>();
  for (const territory of territories) {
    if (territory.existingSiloRef?.siloId) anchoredSiloIds.set(territory.existingSiloRef.siloId, territory.territoryRef);
  }
  const publishedSiloPageIds = sortedUnique(siloPages
    .filter(version => Boolean((version.payload as { publishedUrl?: string | null }).publishedUrl))
    .map(version => version.payload.siloPageId));
  const keywordsBySilo = new Map<string, string[]>();
  for (const keyword of keywords) {
    const siloId = keywordSiloEvidence(keyword);
    if (!siloId) continue;
    keywordsBySilo.set(siloId, [...(keywordsBySilo.get(siloId) || []), String(keyword.id)]);
  }

  // Página vigente por Silo: dá slug e proteção sem inventar nenhum dos dois.
  const pageBySiloId = new Map<string, { siloPageId: string; slug: string | null }>();
  for (const version of siloPages) {
    const payload = version.payload as { siloId?: string | null; siloPageId: string; slug?: string | null };
    if (!payload.siloId) continue;
    pageBySiloId.set(String(payload.siloId), { siloPageId: payload.siloPageId, slug: payload.slug ?? null });
  }

  const structureBySiloId = new Map<string, ExistingStructureProjection>();
  for (const version of siloDnas) {
    const siloId = version.payload.siloId;
    structureBySiloId.set(siloId, {
      siloId,
      name: version.payload.name ?? null,
      sourceKind: "silo_dna",
      sourceEntityId: version.entityId,
      versionId: version.versionId,
      contentHash: version.contentHash,
      isPublished: siloPages.some(page => page.payload.siloId === siloId && publishedSiloPageIds.includes(page.payload.siloPageId)),
      siloPageId: pageBySiloId.get(siloId)?.siloPageId ?? null,
      slug: pageBySiloId.get(siloId)?.slug ?? null,
      keywordRefs: sortedUnique(keywordsBySilo.get(siloId) || []),
      articleRefs: sortedUnique(articlesBySilo.get(siloId) || []),
      anchoredByTerritoryRef: anchoredSiloIds.get(siloId) ?? null,
    });
  }
  // Keyword publicada apontando para um Silo sem SiloDNA vigente ainda é
  // estrutura existente — registrada com a origem real, sem inventar SiloDNA.
  for (const [siloId, refs] of keywordsBySilo) {
    if (structureBySiloId.has(siloId)) continue;
    structureBySiloId.set(siloId, {
      siloId,
      name: null,
      sourceKind: "published_keyword",
      sourceEntityId: siloId,
      versionId: null,
      contentHash: null,
      isPublished: keywords.some(keyword => keywordSiloEvidence(keyword) === siloId && keywordIsPublished(keyword)),
      siloPageId: pageBySiloId.get(siloId)?.siloPageId ?? null,
      slug: pageBySiloId.get(siloId)?.slug ?? null,
      keywordRefs: sortedUnique(refs),
      articleRefs: sortedUnique(articlesBySilo.get(siloId) || []),
      anchoredByTerritoryRef: anchoredSiloIds.get(siloId) ?? null,
    });
  }
  // Catálogo da Marca entra por último: SiloDNA e keyword publicada são
  // evidência mais forte e não podem ser sobrescritas pelo registro.
  for (const entry of brandRegistrySilos) {
    const siloId = String(entry.id || "").trim();
    if (!siloId || structureBySiloId.has(siloId)) continue;
    structureBySiloId.set(siloId, {
      siloId,
      name: entry.nome?.trim() || null,
      sourceKind: "brand_registry",
      sourceEntityId: siloId,
      versionId: null,
      contentHash: null,
      isPublished: false,
      siloPageId: pageBySiloId.get(siloId)?.siloPageId ?? null,
      slug: entry.slug?.trim() || pageBySiloId.get(siloId)?.slug || null,
      keywordRefs: sortedUnique(keywordsBySilo.get(siloId) || []),
      articleRefs: sortedUnique(articlesBySilo.get(siloId) || []),
      anchoredByTerritoryRef: anchoredSiloIds.get(siloId) ?? null,
    });
  }
  const existingStructures = [...structureBySiloId.values()].sort((left, right) => left.siloId.localeCompare(right.siloId));

  // Site/Sitemap: identidade é a URL. Só reconcilia com Silo conhecido por
  // identidade determinística — canonical verificado, URL publicada ou caminho
  // idêntico. Nome aproximado NUNCA une, para não fundir coisas diferentes.
  // Estrutura já promovida a candidato não aparece duas vezes: o Silo
  // candidato assume a linha, e a evidência observada segue disponível.
  const promotedByUrl = new Map(territories
    .filter(territory => territory.publishedStructureRef?.normalizedUrl)
    .map(territory => [territory.publishedStructureRef!.normalizedUrl, territory.territoryRef]));

  const observedSiteStructures: ObservedSiteStructureProjection[] = siteStructures.map(structure => {
    const page = siloPages.find(version => {
      const payload = version.payload as { slug?: string | null; publishedUrl?: string | null; canonical?: string | null };
      return matchesKnownStructure({
        structure,
        knownSlug: payload.slug ?? null,
        knownPublishedUrl: payload.publishedUrl ?? null,
        knownCanonical: payload.canonical ?? null,
      });
    });
    const reconciledSiloId = page ? String((page.payload as { siloId?: string | null }).siloId || "") || null : null;
    return { ...structure, reconciledSiloId, promotedTerritoryRef: promotedByUrl.get(structure.normalizedUrl) ?? null };
  }).sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl));

  // Legado: Article com siloId cujo território ainda não foi declarado.
  const legacyNeedsReconciliation: LegacyArticleEntry[] = articleDnas
    .filter(version => version.payload.brandId === input.brandId)
    .filter(version => {
      const siloId = version.payload.siloId;
      return Boolean(siloId) && !anchoredSiloIds.has(String(siloId));
    })
    .map(version => ({
      articleId: version.payload.articleId,
      siloId: version.payload.siloId ? String(version.payload.siloId) : null,
      reason: "Legado anterior à arquitetura de silos; pendente de reconciliação.",
    }))
    .sort((left, right) => left.articleId.localeCompare(right.articleId));

  const protections: LandscapeProtections = {
    publishedSiloPageIds,
    publishedArticleIds: sortedUnique(articleDnas
      .filter(version => Boolean((version.payload as { publishedUrl?: string | null }).publishedUrl))
      .map(version => version.payload.articleId)),
    protectedSlugs: sortedUnique(siloPages.map(version => (version.payload as { slug?: string | null }).slug || "")),
    protectedCanonicals: sortedUnique(siloPages.map(version => (version.payload as { canonical?: string | null }).canonical || "")),
  };

  return {
    decisionSourceOf,
    keywordStatusOf,
    brandId: input.brandId,
    existingStructures,
    observedSiteStructures,
    candidateTerritories,
    confirmedTerritories,
    otherTerritories,
    legacyNeedsReconciliation,
    unassignedKeywords: [...unassignedKeywords].sort((left, right) => left.keywordId.localeCompare(right.keywordId)),
    conflicts: territories.flatMap(territory => territory.conflicts),
    consistency: checkTerritorialConsistency({ brandId: input.brandId, territories, assignments }),
    protections,
    sources: [
      { sourceKind: "territory_record", present: territories.length > 0, recordCount: territories.length },
      { sourceKind: "silo_dna", present: siloDnas.length > 0, recordCount: siloDnas.length },
      { sourceKind: "silo_page", present: siloPages.length > 0, recordCount: siloPages.length },
      { sourceKind: "article_dna", present: articleDnas.length > 0, recordCount: articleDnas.length },
      { sourceKind: "published_keyword", present: keywordsBySilo.size > 0, recordCount: keywordsBySilo.size },
      { sourceKind: "brand_registry", present: brandRegistrySilos.length > 0, recordCount: brandRegistrySilos.length },
      { sourceKind: "site_catalog", present: siteStructures.length > 0, recordCount: siteStructures.length },
    ],
    counts: {
      keywordsInScope: keywordIds.size,
      keywordsAssigned: assignedKeywordIds.size,
      keywordsUnassigned: unassignedKeywords.length,
      existingStructures: existingStructures.length,
      observedSiteStructures: observedSiteStructures.length,
      candidateTerritories: candidateTerritories.length,
      confirmedTerritories: confirmedTerritories.length,
    },
  };
}

/**
 * A paisagem é legível mesmo vazia: Brand sem território e sem Silo é um estado
 * válido de trabalho, não um erro. Serve ao gate que futuramente substitui
 * `brandArticleVersions.length` — abrir Silos nunca deve exigir ArticleDNA.
 */
export const territorialLandscapeIsReadable = (landscape: TerritorialLandscape): boolean =>
  landscape.brandId.trim().length > 0;

export const territorialLandscapeIsEmpty = (landscape: TerritorialLandscape): boolean =>
  landscape.existingStructures.length === 0
  && landscape.candidateTerritories.length === 0
  && landscape.confirmedTerritories.length === 0
  && landscape.otherTerritories.length === 0;

/**
 * Lê o catálogo `marcas.silos_existentes` como ele chega do banco.
 *
 * Entrada sem `id` é descartada em vez de ganhar identidade inventada: o id do
 * silo é emitido pelo servidor na criação, nunca derivado de nome ou slug.
 */
export function readBrandSiloCatalog(value: unknown): Array<{ id: string; nome: string | null; slug: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map(item => ({
      id: typeof item.id === "string" ? item.id.trim() : "",
      nome: typeof item.nome === "string" ? item.nome : null,
      slug: typeof item.slug === "string" ? item.slug : typeof item.path === "string" ? item.path : null,
    }))
    .filter(item => item.id.length > 0);
}
