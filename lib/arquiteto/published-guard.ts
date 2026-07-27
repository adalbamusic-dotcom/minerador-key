import type { ArticleDNA, ArchitectConflict, ArticleKgrIdentity } from "./contracts.ts";
import { isConfirmedKgrIdentity } from "./identity-context.ts";

export interface PublishedArticleSnapshot {
  articleId: string;
  isPublished: boolean;
  brandId: string;
  siloId: string | null;
  principalKeywordId: string;
  slug: string;
  canonical: string | null;
  protectPrincipal?: boolean;
  protectSilo?: boolean;
  kgrIdentity?: ArticleKgrIdentity;
}

export function guardPublishedArticleProposal(snapshot: PublishedArticleSnapshot, proposal: ArticleDNA) {
  const kgrProtected = isConfirmedKgrIdentity(snapshot.kgrIdentity, snapshot.principalKeywordId, snapshot.slug);
  if (!snapshot.isPublished && !kgrProtected) return { proposal, alerts: [] as ArchitectConflict[], blockedFields: [] as string[] };
  const proposed = { brandId: proposal.brandId, siloId: proposal.siloId, principalKeywordId: proposal.principalKeywordId, slug: proposal.suggestedSlug, canonical: proposal.canonical };
  const current = { brandId: snapshot.brandId, siloId: snapshot.siloId, principalKeywordId: snapshot.principalKeywordId, slug: snapshot.slug, canonical: snapshot.canonical };
  const protectedFields = new Set<keyof typeof current>(["slug"]);
  if (snapshot.isPublished) {
    protectedFields.add("brandId");
    protectedFields.add("canonical");
    if (snapshot.protectSilo ?? true) protectedFields.add("siloId");
  }
  if ((snapshot.protectPrincipal ?? snapshot.isPublished) || kgrProtected) protectedFields.add("principalKeywordId");
  const blockedFields = [...protectedFields].filter(field => proposed[field] !== current[field]);
  const alerts = blockedFields.map(field => ({ id: `published-${snapshot.articleId}-${field}`, level: "artigo" as const,
    type: "published_immutable_field", severity: "critico" as const, entityIds: [snapshot.articleId],
    reason: `A sugestao tentou alterar o campo protegido ${field} de um artigo publicado.`,
    evidence: [`Atual: ${String(current[field])}`, `Proposto: ${String(proposed[field])}`],
    recommendation: "Manter o valor publicado e registrar a ideia como alerta estrategico.", humanDecisionRequired: true }));
  // current.slug mapeia para suggestedSlug em ArticleDNA; nao podemos espalhar
  // a chave "slug" diretamente porque ArticleDNASchema e strict e rejeitaria o
  // campo extra. Preservamos brandId, siloId, principalKeywordId e canonical,
  // mapeando slug -> suggestedSlug explicitamente.
  const guardedProposal = {
    ...proposal,
    ...(protectedFields.has("brandId") ? { brandId: current.brandId } : {}),
    ...(protectedFields.has("siloId") ? { siloId: current.siloId } : {}),
    ...(protectedFields.has("principalKeywordId") ? { principalKeywordId: current.principalKeywordId } : {}),
    ...(protectedFields.has("canonical") ? { canonical: current.canonical } : {}),
    ...(protectedFields.has("slug") ? { suggestedSlug: current.slug } : {}),
    alerts: [...proposal.alerts, ...alerts.map(alert => alert.reason)],
  };
  return { proposal: guardedProposal, alerts, blockedFields };
}
