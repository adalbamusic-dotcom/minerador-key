import type { ArticleDNA, VersionEnvelope } from "./contracts";

export type ArquitetoWorkspaceSource = "CANONICAL_REMOTE" | "LEGACY_REMOTE" | "LOCAL_RECOVERY";

export type CanonicalWorkspaceArtifactIdentity = {
  source: "CANONICAL_REMOTE";
  artifactType: "article_dna";
  entityId: string;
  brandId: string;
  versionNumber: number;
};

export type CanonicalArticleWorkspaceItem = Record<string, unknown> & {
  source: "CANONICAL_REMOTE";
  canonicalArtifact: CanonicalWorkspaceArtifactIdentity;
};

export type CanonicalArticleBootstrapResult = {
  source: "CANONICAL_REMOTE";
  items: CanonicalArticleWorkspaceItem[];
  contractGaps: string[];
};

type WorkspaceItem = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function keywordTextFromReference(reference: ArticleDNA["keywordReferences"][number]): string | null {
  const snapshot = reference.keywordDnaSnapshot?.sourceKeywordSnapshot;
  return snapshot && typeof snapshot === "object" ? text(snapshot.keyword) : null;
}

function optionalUrl(value: unknown): string | null | undefined {
  const normalized = text(value);
  return normalized ? normalized : value === null ? null : undefined;
}

/**
 * Materializa somente o read-model mínimo que a tabela antiga do Arquiteto
 * precisa para representar um ArticleDNA remoto. O artifact permanece a
 * fonte canônica; estes itens não são persistidos como um novo contrato.
 */
export function buildCanonicalArticleWorkspaceItems(
  versions: VersionEnvelope<ArticleDNA>[],
  brandId: string,
  handoffKeywordIds?: ReadonlySet<string>,
): CanonicalArticleBootstrapResult {
  const items: CanonicalArticleWorkspaceItem[] = [];
  const contractGaps = new Set<string>();

  for (const version of versions) {
    const article = version.payload;
    if (article.brandId !== brandId || version.entityId !== article.articleId) continue;

    if (handoffKeywordIds && !article.keywordReferences.some(reference => handoffKeywordIds.has(reference.keywordId))) continue;

    const references = handoffKeywordIds
      ? article.keywordReferences.filter(reference => handoffKeywordIds.has(reference.keywordId))
      : article.keywordReferences;
    const missingKeywordText = references.some(reference => !keywordTextFromReference(reference));
    if (missingKeywordText) {
      contractGaps.add("payload.keywordReferences[].keywordDnaSnapshot.sourceKeywordSnapshot.keyword");
      continue;
    }

    const canonicalArtifact: CanonicalWorkspaceArtifactIdentity = {
      source: "CANONICAL_REMOTE",
      artifactType: "article_dna",
      entityId: version.entityId,
      brandId: article.brandId,
      versionNumber: version.versionNumber,
    };
    const primaryMetrics = article.primaryKeywordMetrics;
    const publishedUrl = optionalUrl(article.publishedIdentityRef?.publishedUrl);

    for (const reference of references) {
      const keyword = keywordTextFromReference(reference)!;
      const isPrimary = reference.keywordId === article.principalKeywordId;
      const volume = reference.volume ?? (isPrimary ? numberOrNull(primaryMetrics?.volumeSearch) : null);
      const kgrScore = reference.kgrScore ?? (isPrimary ? numberOrNull(primaryMetrics?.kgrScore) : null);
      const canonical = optionalUrl(article.canonical);

      items.push({
        id: reference.keywordId,
        keywordId: reference.keywordId,
        keyword,
        intent: reference.originalIntentLabel || reference.normalizedIntent || article.mainIntent,
        volume_search: volume,
        results_allintitle: reference.resultCount ?? (isPrimary ? primaryMetrics?.resultCount ?? null : null),
        kgr_score: kgrScore,
        silo_id: article.siloId,
        siloId: article.siloId,
        siloName: null,
        slug_sugerido: article.suggestedSlug,
        computedSlug: article.suggestedSlug,
        hierarquia: article.hierarchy,
        computedHierarquia: article.hierarchy,
        canonical,
        publishedUrl,
        isPublished: article.publishedIdentityRef?.publicationStatus === "published_protected",
        clusterId: version.entityId,
        provisionalGroupId: version.entityId,
        source: "CANONICAL_REMOTE",
        canonicalArtifact,
      });
    }
  }

  return { source: "CANONICAL_REMOTE", items, contractGaps: [...contractGaps] };
}

function stringValue(item: WorkspaceItem, key: string): string | null {
  const value = item[key];
  return value === null || value === undefined ? null : String(value);
}

function canonicalArticleIds(items: CanonicalWorkspaceItem[]): Set<string> {
  return new Set(items.map(item => item.canonicalArtifact.entityId));
}

type CanonicalWorkspaceItem = CanonicalArticleWorkspaceItem;

/**
 * ArticleDNA canônico vence cópias equivalentes, mas preserva handoffs
 * canônicos `received` até que exista ArticleDNA para a mesma keyword.
 * Também não apaga itens que só existem no recovery/local. A equivalência usa
 * apenas IDs/entidade; nunca nome, slug, e-mail ou owner.
 */
export function mergeCanonicalArticleWorkspaceItems(
  existing: WorkspaceItem[],
  canonicalItems: CanonicalWorkspaceItem[],
  brandId: string,
): WorkspaceItem[] {
  const validCanonical = canonicalItems.filter(item => item.canonicalArtifact.brandId === brandId);
  const canonicalKeywordIds = new Set(validCanonical.map(item => stringValue(item, "keywordId") || stringValue(item, "id")).filter(Boolean));
  const articleIds = canonicalArticleIds(validCanonical);
  const seenCanonicalKeywordIds = new Set<string>();
  const deduplicatedCanonical = validCanonical.filter(item => {
    const keywordId = stringValue(item, "keywordId") || stringValue(item, "id");
    if (!keywordId || seenCanonicalKeywordIds.has(keywordId)) return false;
    seenCanonicalKeywordIds.add(keywordId);
    return true;
  });

  const preserved = existing.filter(item => {
    const keywordId = stringValue(item, "keywordId") || stringValue(item, "id");
    const entityCandidates = [item.clusterId, item.provisionalGroupId, item.briefingId]
      .map(value => value === null || value === undefined ? null : String(value));
    return !((keywordId && canonicalKeywordIds.has(keywordId)) || entityCandidates.some(value => value && articleIds.has(value)));
  });

  return [...preserved, ...deduplicatedCanonical];
}
