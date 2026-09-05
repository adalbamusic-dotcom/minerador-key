import { ArticleDNASchema, PrimaryKeywordPolicyContextSchema, type ArticleDNA, type VersionEnvelope } from "./contracts.ts";
import { createVersionEnvelope } from "./versioning.ts";
import { resolveArticleSerpStrategy, resolveEditorialUnitPurpose } from "./unit-strategy.ts";
import { normalizeSearchIntent } from "./intent-profile.ts";

/**
 * A confirmação como TRANSFORMAÇÃO DE PAYLOAD.
 *
 * Extraída do envelope para que a conclusão da formação possa materializar o
 * ArticleDNA já confirmado numa escrita só. Encadear "cria proposta, depois
 * cria sucessora aprovada" produziria duas versões para uma única decisão
 * humana — e a primeira delas nunca descreveu nada que alguém tenha querido.
 */
export function confirmedArticlePayload(
  current: ArticleDNA,
  principalKeywordId: string,
  actorId: string,
  now = new Date().toISOString(),
): ArticleDNA {
  const selected = current.keywordReferences.find(reference => reference.keywordId === principalKeywordId);
  if (!selected) throw new Error(`Keyword ${principalKeywordId} não pertence ao ArticleDNA.`);
  const previousPrincipalId = current.principalKeywordId;
  const selectedKeyword = selected.keywordDnaSnapshot?.sourceKeywordSnapshot?.keyword;
  const selectedText = typeof selectedKeyword === "string" && selectedKeyword.trim() ? selectedKeyword : selected.keywordId;
  const references = current.keywordReferences.map(reference => reference.keywordId === principalKeywordId
    ? { ...reference, role: "principal" as const, keywordUrlRelation: "confirmed_primary" as const, humanConfirmed: true, classificationOrigin: "human" as const }
    : { ...reference, role: reference.role === "principal" ? "secundaria" as const : reference.role, ...(reference.role === "principal" ? { keywordUrlRelation: "likely_support" as const } : {}) });
  const secondaryKeywordIds = references.filter(reference => reference.role === "secundaria").map(reference => reference.keywordId);
  const narrativeReinforcementIds = references.filter(reference => reference.role === "reforco_narrativo").map(reference => reference.keywordId);
  const currentKgr = current.kgrIdentity;
  const selectedKeywordDnaId = selected.keywordDnaSnapshot?.keywordId || selected.keywordId;
  const kgrPrincipalMatches = !currentKgr?.principalKeywordDnaId || [selected.keywordId, selectedKeywordDnaId, selected.keywordDnaVersionId].includes(currentKgr.principalKeywordDnaId);
  const kgrSlugMatches = !currentKgr?.boundSlug || currentKgr.boundSlug === current.suggestedSlug;
  const canConfirmKgr = Boolean(currentKgr?.isKgrArticle && currentKgr.bindingStatus === "candidate" && kgrPrincipalMatches && kgrSlugMatches);
  const kgrConflict = Boolean(currentKgr?.isKgrArticle && currentKgr.bindingStatus === "candidate" && !canConfirmKgr);
  const nextKgrIdentity = currentKgr
    ? {
      ...currentKgr,
      primaryKeywordId: principalKeywordId,
      principalKeywordDnaId: currentKgr.principalKeywordDnaId || selectedKeywordDnaId,
      ...(canConfirmKgr ? { bindingStatus: "confirmed" as const, status: "confirmed" as const, source: "human_confirmation" as const, boundSlug: current.suggestedSlug, confirmedAt: now, confirmedBy: actorId, purpose: "Par principal–slug confirmado por decisão arquitetural humana." } : {}),
      ...(kgrConflict ? { bindingStatus: "conflict" as const, status: "conflict" as const } : {}),
    }
    : undefined;
  const previousPolicy = current.primaryKeywordPolicy || current.primaryKeywordPolicyContext?.policy || "unknown";
  const sourcePolicy = current.primaryKeywordPolicyContext?.sourcePolicy || previousPolicy;
  const policyContext = PrimaryKeywordPolicyContextSchema.parse({
    ...(current.primaryKeywordPolicyContext || {}),
    policy: "locked", currentKeyword: selectedText, sourcePolicy: String(sourcePolicy), source: "human_confirmation",
    actorId, decidedAt: now, history: [
      ...(current.primaryKeywordPolicyContext?.history || []),
      { previous: previousPolicy, next: "locked", actorId, changedAt: now, reason: "ConfirmaÃ§Ã£o humana da principal e da arquitetura." },
    ],
  });
  const candidates = (current.primaryKeywordCandidates || []).map(candidate => candidate.keywordId === principalKeywordId
    ? { ...candidate, status: "confirmed" as const, source: "human" as const }
    : candidate.keywordId === previousPrincipalId
      ? { ...candidate, status: "rejected" as const, source: "human" as const, reason: "Principal anterior substituÃ­da por decisÃ£o humana; identidade publicada preservada." }
      : candidate);
  const nextSerpStrategy = current.unitClassification ? resolveArticleSerpStrategy({
    unit: current.unitClassification, primaryIntent: normalizeSearchIntent(current.mainIntent), published: Boolean(current.publishedIdentityRef),
    principalKeywordId, primaryKeywordPolicy: "locked", slug: current.suggestedSlug, keywordUrlRelation: "confirmed_primary",
    architectureStatus: "architecture_confirmed", kgrIdentity: nextKgrIdentity,
  }) : undefined;
  const nextUnitPurpose = current.unitClassification && nextSerpStrategy ? resolveEditorialUnitPurpose({
    unit: current.unitClassification, primaryIntent: nextSerpStrategy.primaryIntent, audience: current.audience, searchNeed: current.problem,
    published: Boolean(current.publishedIdentityRef), lifecycleMode: nextSerpStrategy.lifecycleMode,
  }) : undefined;
  const payload = ArticleDNASchema.parse({
    ...current,
    principalKeywordId,
    secondaryKeywordIds,
    narrativeReinforcementIds,
    keywordReferences: references,
    architectureStatus: "architecture_confirmed",
    primaryKeywordPolicy: "locked",
    primaryKeywordPolicyContext: policyContext,
    primaryKeywordCandidates: candidates,
    primaryKeywordDecision: { status: "confirmed", previousKeywordId: previousPrincipalId, selectedKeywordId: principalKeywordId, actorId, decidedAt: now, reason: "Principal confirmada pela arquitetura; URL, slug e canonical preservados." },
    ...(nextSerpStrategy ? { serpStrategy: nextSerpStrategy } : {}),
    ...(nextUnitPurpose ? { unitPurpose: nextUnitPurpose } : {}),
    ...(nextKgrIdentity ? { kgrIdentity: nextKgrIdentity } : {}),
    humanPendingDecisions: [...current.humanPendingDecisions, ...(kgrConflict ? ["Resolver a divergência do vínculo KGR antes de considerar a identidade confirmada."] : [])],
    alerts: [...current.alerts, "Arquitetura confirmada por decisão humana; identidade publicada preservada."],
  });
  return payload;
}

/** Cria uma sucessora real ao confirmar a arquitetura, sem reescrever o histórico. */
export async function confirmArticleArchitecture(
  current: VersionEnvelope<ArticleDNA>,
  principalKeywordId: string,
  actorId: string,
  now = new Date().toISOString(),
): Promise<VersionEnvelope<ArticleDNA>> {
  return createVersionEnvelope({
    entityId: current.payload.articleId,
    versionNumber: current.versionNumber + 1,
    previousVersionId: current.versionId,
    origin: "human",
    changeReason: "Confirmação humana da arquitetura do artigo.",
    createdAt: now,
    createdBy: actorId,
    payload: confirmedArticlePayload(current.payload, principalKeywordId, actorId, now),
  });
}
