import { ArticleDNASchema, PrimaryKeywordPolicyContextSchema, type ArticleDNA, type VersionEnvelope } from "./contracts.ts";
import { createVersionEnvelope } from "./versioning.ts";
import { editorialUnitTypeIsDerived, resolveArticleSerpStrategy, resolveEditorialUnitPurpose } from "./unit-strategy.ts";
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
  /*
   * A CONCLUSÃO HUMANA RESOLVE O VÍNCULO KGR, NÃO O DEIXA PENDENTE.
   *
   * Antes, principal ou slug diferentes do par KGR candidato viravam
   * "conflict" + "Resolver a divergência do vínculo KGR…" em
   * `humanPendingDecisions` — uma pendência que nenhum botão resolvia e que o
   * índice canônico do servidor recusa no "Pronto para Radar". O par candidato
   * é sugestão do Minerador; quem concluiu escolheu outra principal ou outro
   * slug, e isso É a decisão: o artigo deixa de ser KGR daquele par, com o par
   * anterior guardado em `humanDecision` (nada some, nada fica pendente).
   */
  const kgrDesvinculado = Boolean(currentKgr?.isKgrArticle && !canConfirmKgr
    && (currentKgr.bindingStatus === "candidate" || currentKgr.bindingStatus === "conflict"));
  const nextKgrIdentity = currentKgr
    ? {
      ...currentKgr,
      primaryKeywordId: principalKeywordId,
      principalKeywordDnaId: currentKgr.principalKeywordDnaId || selectedKeywordDnaId,
      ...(canConfirmKgr ? { bindingStatus: "confirmed" as const, status: "confirmed" as const, source: "human_confirmation" as const, boundSlug: current.suggestedSlug, confirmedAt: now, confirmedBy: actorId, purpose: "Par principal–slug confirmado por decisão arquitetural humana." } : {}),
      ...(kgrDesvinculado ? {
        isKgrArticle: false, bindingStatus: "not_applicable" as const, status: "not_kgr" as const, source: "human_confirmation" as const,
        principalKeywordDnaId: selectedKeywordDnaId, boundSlug: undefined, confirmedAt: now, confirmedBy: actorId,
        purpose: "A conclusão humana fixou principal e slug fora do par KGR candidato; o artigo segue sem vínculo KGR.",
        humanDecision: { decision: "kgr_not_applicable", previousBindingStatus: currentKgr!.bindingStatus, previousPrincipalKeywordDnaId: currentKgr!.principalKeywordDnaId ?? null, previousBoundSlug: currentKgr!.boundSlug ?? null, actorId, decidedAt: now },
      } : {}),
    }
    : undefined;
  // Tipo de unidade derivado (artigo, guia…) vira decisão gravada; conflito ou desconhecido continuam honestos.
  const nextUnitClassification = current.unitClassification && current.unitClassification.status !== "human_confirmed" && editorialUnitTypeIsDerived(current.unitClassification)
    ? { ...current.unitClassification, status: "human_confirmed" as const, confirmedAt: now, confirmedBy: actorId }
    : current.unitClassification;
  const previousPolicy = current.primaryKeywordPolicy || current.primaryKeywordPolicyContext?.policy || "unknown";
  const sourcePolicy = current.primaryKeywordPolicyContext?.sourcePolicy || previousPolicy;
  const policyContext = PrimaryKeywordPolicyContextSchema.parse({
    ...(current.primaryKeywordPolicyContext || {}),
    policy: "locked", currentKeyword: selectedText, sourcePolicy: String(sourcePolicy), source: "human_confirmation",
    actorId, decidedAt: now, history: [
      ...(current.primaryKeywordPolicyContext?.history || []),
      { previous: previousPolicy, next: "locked", actorId, changedAt: now, reason: "Confirmação humana da principal e da arquitetura." },
    ],
  });
  const candidates = (current.primaryKeywordCandidates || []).map(candidate => candidate.keywordId === principalKeywordId
    ? { ...candidate, status: "confirmed" as const, source: "human" as const }
    : candidate.keywordId === previousPrincipalId
      ? { ...candidate, status: "rejected" as const, source: "human" as const, reason: "Principal anterior substituída por decisão humana; identidade publicada preservada." }
      : candidate);
  const nextSerpStrategy = nextUnitClassification ? resolveArticleSerpStrategy({
    unit: nextUnitClassification, primaryIntent: normalizeSearchIntent(current.mainIntent), published: Boolean(current.publishedIdentityRef),
    principalKeywordId, primaryKeywordPolicy: "locked", slug: current.suggestedSlug, keywordUrlRelation: "confirmed_primary",
    architectureStatus: "architecture_confirmed", kgrIdentity: nextKgrIdentity,
  }) : undefined;
  const nextUnitPurpose = nextUnitClassification && nextSerpStrategy ? resolveEditorialUnitPurpose({
    unit: nextUnitClassification, primaryIntent: nextSerpStrategy.primaryIntent, audience: current.audience, searchNeed: current.problem,
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
    ...(nextUnitClassification ? { unitClassification: nextUnitClassification } : {}),
    ...(nextSerpStrategy ? { serpStrategy: nextSerpStrategy } : {}),
    ...(nextUnitPurpose ? { unitPurpose: nextUnitPurpose } : {}),
    ...(nextKgrIdentity ? { kgrIdentity: nextKgrIdentity } : {}),
    humanPendingDecisions: current.humanPendingDecisions.filter(item => !/vínculo KGR/.test(item)),
    alerts: [...current.alerts, "Arquitetura confirmada por decisão humana; identidade publicada preservada.", ...(kgrDesvinculado ? ["Vínculo KGR candidato não se aplica: a conclusão humana fixou outra principal ou outro slug (par anterior guardado na decisão)."] : [])],
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
