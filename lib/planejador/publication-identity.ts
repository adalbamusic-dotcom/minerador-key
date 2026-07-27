import type { EditorialSnapshot } from "../editorial/contracts.ts";
import type { OperationalPublication } from "../editorial/operational-flow.ts";
import type { ArticleDNA, PublishedIdentityReference } from "../arquiteto/contracts.ts";

type EditorialBriefingDto = EditorialSnapshot["briefings"][number];

export type PlannerPublicationIdentity = {
  state: "published" | "not_published" | "unknown" | "conflict";
  label: "Publicado protegido" | "Não publicado" | "Situação de publicação não confirmada" | "Situação de publicação inconsistente";
  protected: boolean;
  source: "operational_publication" | "legacy_briefing" | "combined" | "none" | "conflict";
  brandId: string;
  brandName: string | null;
  articleId: string;
  siloId: string | null;
  publicationRecordId: string | null;
  slug: string | null;
  canonical: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  articleIdentityRef?: PublishedIdentityReference | null;
};

export function publishedIdentityReferenceForArticle(identity: PlannerPublicationIdentity, article?: ArticleDNA | null): PublishedIdentityReference | null {
  if (identity.state !== "published" || !identity.slug) return null;
  const reference: PublishedIdentityReference = {
    publicationStatus: "published_protected",
    slug: identity.slug,
  };
  if (identity.publicationRecordId) reference.publicationRecordId = identity.publicationRecordId;
  if (identity.publishedUrl) reference.publishedUrl = identity.publishedUrl;
  if (identity.canonical || article?.canonical) reference.canonical = identity.canonical || article?.canonical || undefined;
  if (identity.publishedAt) reference.protectedAt = identity.publishedAt;
  return reference;
}

export function publishedIdentityReferenceIssues(article: ArticleDNA, identity: PlannerPublicationIdentity) {
  const reference = article.publishedIdentityRef;
  if (!reference || identity.state !== "published") return [];
  const issues: string[] = [];
  if (identity.publicationRecordId && reference.publicationRecordId && reference.publicationRecordId !== identity.publicationRecordId) issues.push("A referência publicada do ArticleDNA diverge do registro canônico.");
  if (identity.slug && reference.slug !== identity.slug) issues.push("O slug da referência do ArticleDNA diverge da publicação canônica.");
  if (identity.canonical && reference.canonical && reference.canonical !== identity.canonical) issues.push("O canonical da referência do ArticleDNA diverge da publicação canônica.");
  if (identity.publishedUrl && reference.publishedUrl && reference.publishedUrl !== identity.publishedUrl) issues.push("A URL da referência do ArticleDNA diverge da publicação canônica.");
  return [...new Set(issues)];
}

type PublicationCandidate = { state: "published" | "not_published"; source: "operational_publication" | "legacy_briefing"; siloId: string | null; slug: string | null; canonical: string | null; publishedUrl: string | null; publishedAt: string | null; recordId: string | null };

function normalized(value: string | null | undefined) { return (value || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function legacyState(value: string | null | undefined) {
  const status = normalized(value);
  if (!status) return null;
  return ["publicado", "published"].includes(status) ? "published" as const : "not_published" as const;
}

function operationalState(value: OperationalPublication["state"]) {
  return value === "published" ? "published" as const : "not_published" as const;
}

export function resolvePlannerPublicationIdentity(input: { brandId: string; brandName?: string | null; articleId: string; article?: ArticleDNA | null; operational?: OperationalPublication | null; legacyBriefing?: EditorialBriefingDto | null }): PlannerPublicationIdentity {
  const candidates: PublicationCandidate[] = [];
  const operational = input.operational && input.operational.brandId === input.brandId && input.operational.articleId === input.articleId ? input.operational : null;
  if (operational) candidates.push({ state: operationalState(operational.state), source: "operational_publication", siloId: operational.siloId, slug: operational.slug || null, canonical: null, publishedUrl: operational.destinationUrl || null, publishedAt: operational.publishedAt || null, recordId: operational.id });
  const legacy = input.legacyBriefing && input.legacyBriefing.id === input.articleId ? input.legacyBriefing : null;
  const legacyStatus = legacyState(legacy?.status);
  if (legacy && legacyStatus) candidates.push({ state: legacyStatus, source: "legacy_briefing", siloId: legacy.silo_id, slug: legacy.slug_sugerido || null, canonical: legacy.canonical || null, publishedUrl: null, publishedAt: null, recordId: legacy.id });

  const states = new Set(candidates.map(candidate => candidate.state));
  const conflict = states.has("published") && states.has("not_published");
  const state = conflict ? "conflict" as const : candidates[0]?.state || "unknown" as const;
  const published = candidates.find(candidate => candidate.state === "published") || candidates[0] || null;
  const source = conflict ? "conflict" as const : candidates.length > 1 ? "combined" as const : candidates[0]?.source || "none" as const;
  return {
    state,
    label: state === "published" ? "Publicado protegido" : state === "not_published" ? "Não publicado" : state === "conflict" ? "Situação de publicação inconsistente" : "Situação de publicação não confirmada",
    protected: state !== "not_published",
    source,
    brandId: input.brandId,
    brandName: input.brandName || null,
    articleId: input.articleId,
    siloId: published?.siloId || null,
    publicationRecordId: published?.recordId || null,
    slug: published?.slug || null,
    canonical: published?.canonical || null,
    publishedUrl: published?.publishedUrl || null,
    publishedAt: published?.publishedAt || null,
    articleIdentityRef: input.article?.brandId === input.brandId && input.article.articleId === input.articleId ? input.article.publishedIdentityRef || null : null,
  };
}

export function protectedIdentityIssues(previous: { brandId: string; editorialUnitId: string; editorialUnitType: "article" | "silo_page"; articleId: string | null; siloPageId: string | null; siloId: string | null; metadata: { slug: string; canonical: string | null; principalKeywordId: string } }, next: typeof previous, identity: PlannerPublicationIdentity) {
  if (!identity.protected) return [];
  const issues: string[] = [];
  if (next.brandId !== previous.brandId) issues.push("A marca vinculada ao conteúdo publicado não pode ser alterada.");
  if (next.editorialUnitId !== previous.editorialUnitId || next.editorialUnitType !== previous.editorialUnitType) issues.push("A unidade editorial publicada não pode ser trocada.");
  if (next.articleId !== previous.articleId || next.siloPageId !== previous.siloPageId || next.siloId !== previous.siloId) issues.push("O vínculo estrutural publicado não pode ser alterado.");
  if (next.metadata.principalKeywordId !== previous.metadata.principalKeywordId) issues.push("A keyword principal publicada não pode ser trocada.");
  if (next.metadata.slug !== previous.metadata.slug) issues.push("O slug publicado não pode ser alterado.");
  if (next.metadata.canonical !== previous.metadata.canonical) issues.push("O canonical publicado não pode ser alterado.");
  return [...new Set(issues)];
}

export function publicationSourceIssues(details: { brandId: string; articleId: string | null; siloId: string | null; metadata: { slug: string; canonical: string | null } }, identity: PlannerPublicationIdentity) {
  if (!identity.protected) return [];
  const issues: string[] = [];
  if (details.brandId !== identity.brandId) issues.push("A marca do plano diverge da marca da publicação protegida.");
  if (details.articleId !== identity.articleId) issues.push("O artigo do plano diverge do artigo da publicação protegida.");
  if (identity.siloId && details.siloId !== identity.siloId) issues.push("O silo do plano diverge do silo da publicação protegida.");
  if (identity.slug && details.metadata.slug !== identity.slug) issues.push("O slug do plano diverge do slug da publicação protegida.");
  if (identity.canonical && details.metadata.canonical !== identity.canonical) issues.push("O canonical do plano diverge do canonical da publicação protegida.");
  return [...new Set(issues)];
}
