import type { ArticleDNA, ArchitectConflict } from "./contracts.ts";

export interface PublishedArticleSnapshot { articleId: string; isPublished: boolean; brandId: string; siloId: string | null; principalKeywordId: string; slug: string; canonical: string | null }

export function guardPublishedArticleProposal(snapshot: PublishedArticleSnapshot, proposal: ArticleDNA) {
  if (!snapshot.isPublished) return { proposal, alerts: [] as ArchitectConflict[], blockedFields: [] as string[] };
  const proposed = { brandId: proposal.brandId, siloId: proposal.siloId, principalKeywordId: proposal.principalKeywordId, slug: proposal.suggestedSlug, canonical: proposal.canonical };
  const current = { brandId: snapshot.brandId, siloId: snapshot.siloId, principalKeywordId: snapshot.principalKeywordId, slug: snapshot.slug, canonical: snapshot.canonical };
  const blockedFields = (Object.keys(current) as (keyof typeof current)[]).filter(field => proposed[field] !== current[field]);
  const alerts = blockedFields.map(field => ({ id: `published-${snapshot.articleId}-${field}`, level: "artigo" as const,
    type: "published_immutable_field", severity: "critico" as const, entityIds: [snapshot.articleId],
    reason: `A sugestao tentou alterar o campo protegido ${field} de um artigo publicado.`,
    evidence: [`Atual: ${String(current[field])}`, `Proposto: ${String(proposed[field])}`],
    recommendation: "Manter o valor publicado e registrar a ideia como alerta estrategico.", humanDecisionRequired: true }));
  return { proposal: { ...proposal, ...current, suggestedSlug: current.slug, alerts: [...proposal.alerts, ...alerts.map(alert => alert.reason)] }, alerts, blockedFields };
}
