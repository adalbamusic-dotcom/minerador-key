/**
 * ===== A GUARDA NA GRAVAÇÃO DO ArticleDNA (F5) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §5.4,
 * §10.2 e §10.3 ("Formação / conclusão: `contradicts_declared` antes de
 * gravar"). A gravação do ArticleDNA é o ponto por onde passam a conclusão da
 * formação, a melhoria, o Reforçar publicados e o "Prender Assunto": a guarda
 * fica nela, e as quatro dizem a mesma coisa.
 *
 * O plano vem do PACOTE APROVADO do Assunto do artigo (`subject.keywordId`):
 * a principal declarada e o papel declarado. Contradição é MUDANÇA para longe
 * do plano — o artigo antigo que ainda carrega o estado anterior ao plano não
 * é recusado por continuar igual (a versão nova que o corrige é que vem pela
 * melhoria, D8). Sem plano, nada muda.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import type { ArticleDNA } from "./contracts.ts";
import type { DeclaredArticlePlan } from "../minerador/declared-plan.ts";

export type ArticleWriteSnapshot = Pick<ArticleDNA, "principalKeywordId" | "hierarchy">;

/**
 * As contradições do plano numa versão nova do ArticleDNA, em frases.
 * `previous` é a versão vigente (só principal e papel); `null` = artigo novo.
 */
export function declaredPlanArticleContradictions(input: {
  plan: DeclaredArticlePlan | null | undefined;
  next: ArticleWriteSnapshot;
  previous?: ArticleWriteSnapshot | null;
  subjectLabel?: string | null;
  /**
   * 2026-10-13 · TRAVA (SDD do cadastro único §3.5): a principal do plano está
   * travada? Livre = trocá-la não é contradição (a formação/melhoria pode
   * propor outra com decisão humana). Ausente = travada (o contrato de antes).
   */
  principalLocked?: boolean;
}): string[] {
  const plan = input.plan;
  if (!plan) return [];
  const motivos: string[] = [];
  const previous = input.previous ?? null;
  const nome = input.subjectLabel ? `do Assunto “${input.subjectLabel}”` : "do Assunto";
  const declarada = input.principalLocked === false ? null : plan.declaredPrincipal?.keywordId ?? null;
  if (declarada && input.next.principalKeywordId !== declarada
    && (!previous || previous.principalKeywordId !== input.next.principalKeywordId)) {
    motivos.push(`a principal do artigo ${nome} deixaria de ser a declarada (“${plan.declaredPrincipal!.phrase}”).`);
  }
  if (input.next.hierarchy !== plan.role
    && (!previous || previous.hierarchy !== input.next.hierarchy)) {
    motivos.push(`o papel do artigo ${nome} viraria “${input.next.hierarchy}”, e o plano declara “${plan.role}”.`);
  }
  return motivos;
}

/**
 * CAMINHO PARALELO (§10.2): um ArticleDNA NOVO, sem Assunto e não publicado,
 * cuja principal está num grupo com plano declarado. A formação do plano nunca
 * produz isso (D6: nada solto dentro de grupo com plano); quem produziria é um
 * caminho que não passa pelo núcleo de sempre.
 */
export function declaredPlanParallelPath(input: {
  article: Pick<ArticleDNA, "subject" | "publishedIdentityRef">;
  hasPreviousVersion: boolean;
  principalGroupHasPlan: boolean;
  principalLabel?: string | null;
}): string[] {
  if (input.hasPreviousVersion || input.article.subject || !input.principalGroupHasPlan) return [];
  if (input.article.publishedIdentityRef) return [];
  const nome = input.principalLabel ? `“${input.principalLabel}”` : "a principal";
  return [`${nome} pertence a um grupo com plano declarado e o artigo novo não tem Assunto: dentro de grupo com plano nada vira artigo solto (D6). Ligue a keyword a um artigo do plano ou mude o plano no Minerador.`];
}
