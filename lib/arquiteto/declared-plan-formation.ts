/**
 * ===== O PLANO DECLARADO NO ARQUITETO — LEITURAS ÚNICAS (F4) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §6.2.
 * Tudo sai do PACOTE APROVADO de cada Assunto (`ArchitectSubjectStanding.plan`,
 * lido pelo resolver do Minerador): a formação, a portaria, a materialização e
 * a melhoria perguntam aqui, para as quatro dizerem a mesma coisa.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import type { ArticleDNA, SiloDNA, SiloPage } from "./contracts.ts";
import { plannedSiloMemberKey, plannedSiloSourceIsCurrent, type PlannedSiloCurrentSource } from "./planned-silo-member.ts";
import { freePlanPrincipal, lockedPlanPrincipal, type ArchitectSubjectStanding, type SubjectSupportSuggestion } from "./declared-subject.ts";
import type { DeclaredPrincipalLockView } from "../minerador/declared-plan.ts";
import type { DeclaredPlanFormationInput } from "./article-formation-priority.ts";
import type { DeclaredPlanGateInput } from "./article-formation-confirmation.ts";
import { DECLARED_PRINCIPAL_SUPPORT_BASIS_PREFIX } from "./article-serp-interpretation.ts";

type StandingWithPlan = Pick<ArchitectSubjectStanding, "keywordId" | "brandId" | "declared" | "received" | "approvedPackageRef" | "plan"> & { planLock?: DeclaredPrincipalLockView | null };

/**
 * Prepara o vínculo de uma cópia de ArticleDNA à estrutura aprovada do Silo.
 * A autoridade de status e vigência deve vir do servidor. Esta leitura não
 * grava nem aprova: o writer deverá revalidar dentro da mesma transação.
 */
export function plannedArticleMembership(input: {
  brandId: string;
  article: Pick<ArticleDNA, "articleId" | "brandId" | "siloId" | "territoryRef" | "hierarchy" | "subject" | "keywordReferences">;
  silo: { versionId: string; contentHash: string; current: boolean; effectiveStatus: string | null; payload: SiloDNA };
  page: { current: boolean; effectiveStatus: string | null; payload: SiloPage };
  sourceCurrent: PlannedSiloCurrentSource | null;
  /** Ocupações correntes devem vir de uma leitura canônica completa da marca. */
  occupied: readonly { articleId: string; memberKey: string }[];
}): { ok: true; ref: NonNullable<ArticleDNA["siloMembershipRef"]>; order: number } | { ok: false; reason: string } {
  const { brandId, article, silo, page } = input;
  const members = silo.payload.plannedMembers ?? [];
  if (!brandId || article.brandId !== brandId || silo.payload.brandId !== brandId || page.payload.brandId !== brandId) return { ok: false, reason: "A estrutura e o artigo precisam pertencer à marca ativa." };
  if (!silo.current || silo.effectiveStatus !== "approved" || !page.current || page.effectiveStatus !== "approved" || silo.payload.formationStatus !== "formed" || page.payload.formationStatus !== "formed") return { ok: false, reason: "O Silo e sua página precisam estar vigentes e aprovados." };
  if (!plannedSiloSourceIsCurrent({ brandId, source: silo.payload.compositionSourceRef, expectedSubjectProofs: silo.payload.keywordPackageRefs, current: input.sourceCurrent })) return { ok: false, reason: "O plano ou os Assuntos que originaram o Silo mudaram ou não puderam ser confirmados; revise o Silo antes de formar o artigo." };
  if (!silo.versionId || !silo.contentHash || silo.payload.compositionBasis !== "planned_members" || page.payload.compositionBasis !== "planned_members" || silo.payload.siloId !== page.payload.siloId || article.siloId !== silo.payload.siloId || silo.payload.territoryRef !== page.payload.territoryRef || article.territoryRef !== silo.payload.territoryRef || !silo.payload.territoryRef || page.payload.siloDnaRef.entityId !== silo.payload.siloId || page.payload.siloDnaRef.versionId !== silo.versionId || page.payload.siloDnaRef.contentHash !== silo.contentHash) return { ok: false, reason: "O artigo e a página não correspondem à versão atual da estrutura do Silo." };
  const keys = members.map(member => member.memberKey);
  if (!members.length || members.filter(member => member.role === "Pilar").length !== 1 || members.some((member, index) => member.memberKey !== plannedSiloMemberKey(brandId, member.anchorKind, member.anchorId) || (index > 0 && members[index - 1].order >= member.order)) || new Set(keys).size !== keys.length || page.payload.plannedMemberKeys?.length !== keys.length || page.payload.plannedMemberKeys.some((key, index) => key !== keys[index])) return { ok: false, reason: "A composição planejada é incompleta ou ambígua." };
  const anchors = members.filter(member => member.anchorKind === "existing_article"
    ? member.anchorId === article.articleId
    : article.subject?.keywordId ? member.anchorId === article.subject.keywordId : article.keywordReferences.some(reference => reference.keywordId === member.anchorId));
  if (anchors.length !== 1) return { ok: false, reason: "O artigo não corresponde a um único membro planejado." };
  const member = anchors[0];
  if (article.hierarchy !== member.role) return { ok: false, reason: "O papel do artigo diverge da estrutura aprovada do Silo." };
  if (input.occupied.some(item => item.memberKey === member.memberKey && item.articleId !== article.articleId)) return { ok: false, reason: "O membro planejado já está vinculado a outro artigo vigente." };
  if (input.occupied.some(item => item.articleId === article.articleId && item.memberKey !== member.memberKey)) return { ok: false, reason: "O artigo já está vinculado a outro membro planejado; revise a estrutura antes de alterar o vínculo." };
  return { ok: true, ref: { siloDnaVersionId: silo.versionId, siloDnaContentHash: silo.contentHash, memberKey: member.memberKey }, order: member.order };
}

/** Os Assuntos com plano que o Arquiteto pode obedecer: declarados, recebidos, com pacote aprovado, desta marca. */
export function declaredPlanStandings<T extends StandingWithPlan>(standings: readonly T[], brandId: string | null): T[] {
  if (!brandId) return [];
  return standings.filter(standing => standing.declared && standing.received && standing.approvedPackageRef && standing.brandId === brandId && standing.plan);
}

/**
 * O plano de cada Assunto como a formação o recebe. 2026-10-13 · a TRAVA
 * (SDD do cadastro único §3.3): só a principal travada é cabeceira fixa
 * (`principalKeywordId`); a livre vai em `freePrincipalKeywordId` — a
 * formação pode propor outra principal pela SERP/volume e, sem candidata
 * melhor, usa a livre.
 */
export function declaredPlanFormationInputs(input: { standings: readonly StandingWithPlan[]; brandId: string | null }): Map<string, DeclaredPlanFormationInput> {
  return new Map(declaredPlanStandings(input.standings, input.brandId).map(standing => {
    const livre = freePlanPrincipal(standing);
    return [standing.keywordId, {
      principalKeywordId: lockedPlanPrincipal(standing)?.keywordId ?? null,
      ...(livre ? { freePrincipalKeywordId: livre.keywordId } : {}),
      groupId: standing.plan!.groupId,
      order: standing.plan!.order,
      role: standing.plan!.role,
      // 2026-10-16 · o slug declarado no Minerador: o candidato do artigo NOVO nasce com ele.
      ...(standing.plan!.slug ? { slug: standing.plan!.slug } : {}),
    }];
  }));
}

/**
 * A lista do Assunto com plano: só o que a Pesquisa por Assunto trouxe para
 * ELE (`subject_discovery.subjectKeywordIds`), na ordem da sugestão. As demais
 * keywords do grupo entram depois, dentro da formação; sinais fracos (termos,
 * entidade, lista) não puxam keyword de fora do grupo para o artigo do plano.
 */
export function declaredPlanSubjectList<T extends Pick<SubjectSupportSuggestion, "signals">>(suggestions: readonly T[]): T[] {
  return suggestions.filter(suggestion => suggestion.signals.includes("subject_discovery"));
}

/** O que a portaria `DECLARED_PLAN_PRESERVED` confere por Assunto. */
export function declaredPlanGateInputs(input: {
  standings: readonly StandingWithPlan[];
  brandId: string | null;
  /** A lista de cada Assunto (a mesma claim que a formação recebeu). */
  subjectLists?: ReadonlyMap<string, readonly string[]>;
  labelOf?: (keywordId: string) => string | null;
}): Map<string, DeclaredPlanGateInput> {
  return new Map(declaredPlanStandings(input.standings, input.brandId).map(standing => {
    // 2026-10-13 · só a principal TRAVADA é conferida; a livre pode ser trocada (decisão humana na prévia).
    const fixa = lockedPlanPrincipal(standing);
    const principalKeywordId = fixa?.keywordId ?? null;
    return [standing.keywordId, {
      principalKeywordId,
      subjectListKeywordIds: [...(input.subjectLists?.get(standing.keywordId) || [])],
      principalLabel: fixa?.phrase ?? (principalKeywordId ? input.labelOf?.(principalKeywordId) ?? null : null),
    }];
  }));
}

/**
 * O papel e o escopo que o adapter grava (`ProvisionalArticleGroup.declaredPlan`).
 * 2026-10-16 · e o slug declarado, quando o plano trouxe: o adapter o usa só no
 * artigo novo (o publicado mantém URL, slug e canonical — AGENTS §11).
 */
export function declaredPlanForGroup(standing: Pick<ArchitectSubjectStanding, "plan"> | null | undefined): { role: "Pilar" | "Suporte"; scope: string; slug?: string } | undefined {
  return standing?.plan ? { role: standing.plan.role, scope: standing.plan.scope, ...(standing.plan.slug ? { slug: standing.plan.slug } : {}) } : undefined;
}

/** 2026-10-16 · o slug declarado que vale para ESTE ArticleDNA: só no artigo novo (sem identidade publicada). */
function declaredSlugFor(article: Partial<Pick<ArticleDNA, "publishedIdentityRef">>, plan: { slug?: string } | null | undefined): string | null {
  return plan?.slug && !article.publishedIdentityRef ? plan.slug : null;
}

export type DeclaredPlanArticleApplication =
  | { ok: true; value: ArticleDNA; changed: boolean }
  | { ok: false; code: "DECLARED_PRINCIPAL_CONTRADICTION"; reason: string };

/**
 * O caminho inteiro para trocar a principal travada (SDD acelerar 2026-10-13,
 * item 12): a mensagem diz cada clique, do Minerador de volta ao Arquiteto.
 */
export function declaredPrincipalLockedMessage(phrase: string): string {
  return `A principal está travada no plano (“${phrase}”). Para trocar: Minerador → Cadastrar Assuntos → trava "Livre" → aprovar e enviar a keyword ao Arquiteto → aqui, Artigos → na linha do artigo do plano, “Procurar outra principal”. O Arquiteto não troca o que foi travado.`;
}

/**
 * Aplica o plano num ArticleDNA já montado (a melhoria parte do DNA vigente):
 * `hierarchy` = papel declarado, `promise` = escopo. Recusa quando a principal
 * do DNA não é a declarada — a contradição do plano não tem "refazer mesmo
 * assim" (D11): muda-se o plano no Minerador.
 */
export function applyDeclaredPlanToArticleDna(article: ArticleDNA, standing: (Pick<ArchitectSubjectStanding, "plan" | "keywordId"> & { planLock?: DeclaredPrincipalLockView | null }) | null | undefined): DeclaredPlanArticleApplication {
  const plan = standing?.plan;
  if (!plan) return { ok: true, value: article, changed: false };
  // 2026-10-13 · só a principal TRAVADA contradiz; a livre pode ter sido trocada pela SERP/volume.
  const fixa = lockedPlanPrincipal(standing);
  if (fixa && article.principalKeywordId !== fixa.keywordId) {
    return { ok: false, code: "DECLARED_PRINCIPAL_CONTRADICTION", reason: declaredPrincipalLockedMessage(fixa.phrase) };
  }
  // 2026-10-16 · o slug declarado no plano vira o `suggestedSlug` do artigo NOVO; o publicado nunca muda.
  const slug = declaredSlugFor(article, plan);
  const slugMuda = Boolean(slug) && article.suggestedSlug !== slug;
  if (article.hierarchy === plan.role && article.promise === plan.scope && !slugMuda) return { ok: true, value: article, changed: false };
  return { ok: true, value: { ...article, hierarchy: plan.role, promise: plan.scope, ...(slugMuda ? { suggestedSlug: slug! } : {}) }, changed: true };
}

/** O plano de um ArticleDNA já está aplicado (papel, promessa e, no artigo novo, o slug declarado)? Sem plano = sim. */
export function declaredPlanAppliedTo(article: Pick<ArticleDNA, "hierarchy" | "promise" | "principalKeywordId"> & Partial<Pick<ArticleDNA, "suggestedSlug" | "publishedIdentityRef">>, standing: (Pick<ArchitectSubjectStanding, "plan"> & { keywordId?: string; planLock?: DeclaredPrincipalLockView | null }) | null | undefined): boolean {
  const plan = standing?.plan;
  if (!plan) return true;
  const fixa = lockedPlanPrincipal({ plan, keywordId: standing?.keywordId ?? "", ...(standing && "planLock" in standing ? { planLock: standing.planLock } : {}) });
  const slug = declaredSlugFor(article, plan);
  return article.hierarchy === plan.role && article.promise === plan.scope
    && (!fixa || article.principalKeywordId === fixa.keywordId)
    && (!slug || article.suggestedSlug === undefined || article.suggestedSlug === slug);
}

/**
 * D2(a) — A PROVENIÊNCIA DO PARECER NO DNA (SDD 2026-10-12 §17).
 *
 * Quando o parecer da SERP veio das sustentações (principal declarada sem
 * volume e sem SERP no cache), o ArticleDNA diz isso em `serpStrategy.rationale`
 * — campo que já existe; nenhum campo novo no ArticleDNA (§5.4). A linha é
 * TROCADA a cada versão, nunca acumulada; sem parecer pelas sustentações, a
 * linha antiga sai (a proveniência não pode mentir sobre a versão nova). Não é
 * pendência: o artigo fica concluído (D10).
 */
export function applySerpSupportBasisProvenance(
  article: ArticleDNA,
  basisReason: string | null,
  fallbackStrategy?: ArticleDNA["serpStrategy"],
): ArticleDNA {
  const strategy = article.serpStrategy ?? (basisReason ? fallbackStrategy : undefined);
  if (!strategy) return article;
  const demais = strategy.rationale.filter(line => !line.startsWith(DECLARED_PRINCIPAL_SUPPORT_BASIS_PREFIX));
  const rationale = basisReason ? [...demais, basisReason] : demais;
  if (!rationale.length) return article;
  if (article.serpStrategy && rationale.length === article.serpStrategy.rationale.length && rationale.every((line, index) => line === article.serpStrategy!.rationale[index])) return article;
  return { ...article, serpStrategy: { ...strategy, rationale } };
}
