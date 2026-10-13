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
import type { ArticleDNA } from "./contracts.ts";
import type { ArchitectSubjectStanding, SubjectSupportSuggestion } from "./declared-subject.ts";
import type { DeclaredPlanFormationInput } from "./article-formation-priority.ts";
import type { DeclaredPlanGateInput } from "./article-formation-confirmation.ts";
import { DECLARED_PRINCIPAL_SUPPORT_BASIS_PREFIX } from "./article-serp-interpretation.ts";

type StandingWithPlan = Pick<ArchitectSubjectStanding, "keywordId" | "brandId" | "declared" | "received" | "approvedPackageRef" | "plan">;

/** Os Assuntos com plano que o Arquiteto pode obedecer: declarados, recebidos, com pacote aprovado, desta marca. */
export function declaredPlanStandings<T extends StandingWithPlan>(standings: readonly T[], brandId: string | null): T[] {
  if (!brandId) return [];
  return standings.filter(standing => standing.declared && standing.received && standing.approvedPackageRef && standing.brandId === brandId && standing.plan);
}

/** O plano de cada Assunto como a formação o recebe. */
export function declaredPlanFormationInputs(input: { standings: readonly StandingWithPlan[]; brandId: string | null }): Map<string, DeclaredPlanFormationInput> {
  return new Map(declaredPlanStandings(input.standings, input.brandId).map(standing => [standing.keywordId, {
    principalKeywordId: standing.plan!.declaredPrincipal?.keywordId ?? null,
    groupId: standing.plan!.groupId,
    order: standing.plan!.order,
    role: standing.plan!.role,
  }]));
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
    const principalKeywordId = standing.plan!.declaredPrincipal?.keywordId ?? null;
    return [standing.keywordId, {
      principalKeywordId,
      subjectListKeywordIds: [...(input.subjectLists?.get(standing.keywordId) || [])],
      principalLabel: standing.plan!.declaredPrincipal?.phrase ?? (principalKeywordId ? input.labelOf?.(principalKeywordId) ?? null : null),
    }];
  }));
}

/** O papel e o escopo que o adapter grava (`ProvisionalArticleGroup.declaredPlan`). */
export function declaredPlanForGroup(standing: Pick<ArchitectSubjectStanding, "plan"> | null | undefined): { role: "Pilar" | "Suporte"; scope: string } | undefined {
  return standing?.plan ? { role: standing.plan.role, scope: standing.plan.scope } : undefined;
}

export type DeclaredPlanArticleApplication =
  | { ok: true; value: ArticleDNA; changed: boolean }
  | { ok: false; code: "DECLARED_PRINCIPAL_CONTRADICTION"; reason: string };

/**
 * Aplica o plano num ArticleDNA já montado (a melhoria parte do DNA vigente):
 * `hierarchy` = papel declarado, `promise` = escopo. Recusa quando a principal
 * do DNA não é a declarada — a contradição do plano não tem "refazer mesmo
 * assim" (D11): muda-se o plano no Minerador.
 */
export function applyDeclaredPlanToArticleDna(article: ArticleDNA, standing: Pick<ArchitectSubjectStanding, "plan" | "keywordId"> | null | undefined): DeclaredPlanArticleApplication {
  const plan = standing?.plan;
  if (!plan) return { ok: true, value: article, changed: false };
  const declarada = plan.declaredPrincipal?.keywordId ?? null;
  if (declarada && article.principalKeywordId !== declarada) {
    return { ok: false, code: "DECLARED_PRINCIPAL_CONTRADICTION", reason: `A principal do artigo não é a principal declarada no plano (“${plan.declaredPrincipal!.phrase}”). Mude o plano no Minerador; o Arquiteto não troca o que foi declarado.` };
  }
  if (article.hierarchy === plan.role && article.promise === plan.scope) return { ok: true, value: article, changed: false };
  return { ok: true, value: { ...article, hierarchy: plan.role, promise: plan.scope }, changed: true };
}

/** O plano de um ArticleDNA já está aplicado (papel e promessa)? Sem plano = sim. */
export function declaredPlanAppliedTo(article: Pick<ArticleDNA, "hierarchy" | "promise" | "principalKeywordId">, standing: Pick<ArchitectSubjectStanding, "plan"> | null | undefined): boolean {
  const plan = standing?.plan;
  if (!plan) return true;
  return article.hierarchy === plan.role && article.promise === plan.scope
    && (!plan.declaredPrincipal || article.principalKeywordId === plan.declaredPrincipal.keywordId);
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
