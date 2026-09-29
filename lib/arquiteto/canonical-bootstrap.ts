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
 * A página publicada de um ArticleDNA: a keyword cuja URL está no ar.
 *
 * Nesta ordem: o `articleId` (o construtor do publicado usa a keyword do
 * Vínculo como id do artigo) quando ele é uma das referências; senão a
 * principal ANTERIOR de uma troca confirmada (a página continua a mesma);
 * senão a principal. Artigo sem identidade publicada não tem página: `null`.
 */
export function publishedPageKeywordIdOf(article: Pick<ArticleDNA, "articleId" | "principalKeywordId" | "keywordReferences" | "primaryKeywordDecision" | "publishedIdentityRef">, entityId?: string): string | null {
  if (article.publishedIdentityRef?.publicationStatus !== "published_protected") return null;
  const ids = new Set(article.keywordReferences.map(reference => reference.keywordId));
  for (const candidato of [entityId, article.articleId]) if (candidato && ids.has(candidato)) return candidato;
  const troca = article.primaryKeywordDecision;
  if (troca?.status === "confirmed" && troca.previousKeywordId && ids.has(troca.previousKeywordId)) return troca.previousKeywordId;
  return article.principalKeywordId;
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
    /*
     * A IDENTIDADE PUBLICADA É DA PÁGINA, NÃO DE CADA MEMBRO (2026-09-28).
     *
     * O artigo publicado é UMA página: a keyword do Vínculo. Espalhar
     * `isPublished`, URL e canonical do artigo em toda referência fazia cada
     * secundária do Reforçar virar "outro publicado" na mesa (21 → 27), com
     * "Reforçar este publicado" ativo para uma página que não existe. Só a
     * referência da página carrega a identidade; os membros levam apenas o
     * endereço de LEITURA do artigo de que fazem parte.
     */
    const pageKeywordId = publishedPageKeywordIdOf(article, version.entityId);
    const pageReference = pageKeywordId ? article.keywordReferences.find(reference => reference.keywordId === pageKeywordId) : undefined;
    const pageKeyword = pageReference ? keywordTextFromReference(pageReference) : null;
    const troca = article.primaryKeywordDecision;
    const swappedTo = pageKeywordId && troca?.status === "confirmed" && troca.previousKeywordId === pageKeywordId && article.principalKeywordId !== pageKeywordId
      ? article.principalKeywordId
      : null;

    for (const reference of references) {
      const keyword = keywordTextFromReference(reference)!;
      const isPrimary = reference.keywordId === article.principalKeywordId;
      const volume = reference.volume ?? (isPrimary ? numberOrNull(primaryMetrics?.volumeSearch) : null);
      const kgrScore = reference.kgrScore ?? (isPrimary ? numberOrNull(primaryMetrics?.kgrScore) : null);
      const isPage = pageKeywordId !== null && reference.keywordId === pageKeywordId;
      const memberOfPublished = pageKeywordId !== null && !isPage;
      const canonical = memberOfPublished ? null : optionalUrl(article.canonical);

      items.push({
        id: reference.keywordId,
        keywordId: reference.keywordId,
        keyword,
        articleId: article.articleId,
        workingArticleId: article.articleId,
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
        reviewRole: reference.role,
        keywordDnaRef: reference.keywordDnaSnapshot?.versionReference,
        keywordDnaSnapshot: reference.keywordDnaSnapshot,
        canonical,
        publishedUrl: memberOfPublished ? undefined : publishedUrl,
        isPublished: isPage,
        ...(isPage && swappedTo ? { publishedPrimarySwapTo: swappedTo } : {}),
        ...(memberOfPublished ? { publishedArticlePage: { keywordId: pageKeywordId, keyword: pageKeyword, url: publishedUrl ?? null } } : {}),
        clusterId: version.entityId,
        provisionalGroupId: version.entityId,
        ...(reference.demandEvidence ? { demandEvidence: reference.demandEvidence } : {}),
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
  const workingCopyByKeyword = new Map(existing.map(item => {
    const keywordId = stringValue(item, "keywordId") || stringValue(item, "id");
    return keywordId ? [keywordId, item] as const : null;
  }).filter((entry): entry is readonly [string, WorkspaceItem] => Boolean(entry)));
  /**
   * O que a working copy tem e o ArticleDNA não sabe.
   *
   * `territoryRef`/`territoryAssignment` são a membership canônica da keyword e
   * vivem no item de workflow — o ArticleDNA não os carrega. Sem preservá-los
   * aqui, toda keyword que vira Article perde o Silo a que pertence, e a mesa
   * volta a dizer "aguardando definição de Silo" para uma decisão que já foi
   * tomada. O mesmo vale para a formação revisada.
   *
   * `canonicalWorkflow` é o item de workflow em si — id e `lock_version`. É por
   * ele que TODA decisão humana é gravada, com `expectedLock`. O ArticleDNA não
   * o conhece, então perdê-lo aqui deixava a keyword sem endereço de escrita:
   * assim que o artigo era materializado, mover, separar, juntar e trocar a
   * Principal passavam a recusar com "a keyword não tem item canônico". A
   * revisão humana ficava impossível exatamente nos artigos já formados.
   */
  const assignmentKeys = ["workingArticleId", "clusterId", "provisionalGroupId", "siloId", "silo_id", "siloName", "computedSlug", "slug_sugerido", "computedHierarquia", "hierarquia", "reviewRole", "role", "territoryRef", "territoryAssignment", "articleFormationRef", "articleFormationDecision", "canonicalWorkflow"];
  const identityKeys = ["isPublished", "publishedIdentitySource", "publishedUrl", "canonical"];
  const canonicalWithWorkingCopy = validCanonical.map(item => {
    const keywordId = stringValue(item, "keywordId") || stringValue(item, "id");
    const working = keywordId ? workingCopyByKeyword.get(keywordId) : undefined;
    if (!working) return item;
    const overlay = Object.fromEntries(assignmentKeys.filter(key => working[key] !== undefined).map(key => [key, working[key]]));
    /*
     * A identidade publicada da PRÓPRIA keyword vem do Vínculo do Minerador,
     * que a working copy lê. Quando ela diz que a keyword é uma página
     * publicada, isso vence a projeção do artigo — nunca o contrário: ser
     * membro de um artigo publicado não publica ninguém.
     */
    const identidade = working.isPublished === true
      ? Object.fromEntries(identityKeys.filter(key => working[key] !== undefined).map(key => [key, working[key]]))
      : {};
    return { ...item, ...overlay, ...identidade };
  });
  const canonicalKeywordIds = new Set(canonicalWithWorkingCopy.map(item => stringValue(item, "keywordId") || stringValue(item, "id")).filter(Boolean));
  const articleIds = canonicalArticleIds(canonicalWithWorkingCopy);
  const seenCanonicalKeywordIds = new Set<string>();
  const deduplicatedCanonical = canonicalWithWorkingCopy.filter(item => {
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
