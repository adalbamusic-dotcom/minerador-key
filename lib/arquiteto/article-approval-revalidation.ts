import type { ArticleDNA, VersionEnvelope } from "./contracts.ts";

/**
 * A APROVAÇÃO REVALIDADA NO SERVIDOR.
 *
 * Botão habilitado e evento enviado pelo cliente não bastam. A rota de
 * artefatos hoje confere contrato e autorização de marca, mas aceita
 * `status: "approved"` para qualquer ArticleDNA que passe no schema — ou seja,
 * a única coisa que impede aprovar um artigo incoerente é a tela que o
 * enviou. Quem grava precisa conferir de novo, contra o contexto autorizado.
 *
 * As regras aqui são as MESMAS de `article-closing-service`, do lado de lá da
 * rede. Elas não substituem o portão do cliente: elas existem para o caso em
 * que o portão do cliente não foi executado.
 *
 * Domínio puro: sem fetch, sem storage. A rota traz a marca autorizada.
 */

export type ArticleApprovalRevalidationIssue = {
  code:
    | "BRAND_MISMATCH"
    | "NO_PRINCIPAL"
    | "MULTIPLE_PRINCIPALS"
    | "PRINCIPAL_NOT_IN_REFERENCES"
    | "ARCHITECTURE_NOT_CONFIRMED"
    | "SERP_EVIDENCE_MISSING";
  detail: string;
};

/**
 * Este ArticleDNA pode ser gravado como aprovado sob esta marca?
 *
 * Lista vazia significa que sim. A marca vem do contexto autorizado, nunca do
 * corpo da requisição: é o isolamento entre marcas que depende disso.
 */
export function articleApprovalRevalidationIssues(input: {
  version: VersionEnvelope<ArticleDNA>;
  authorizedBrandId: string;
}): ArticleApprovalRevalidationIssue[] {
  const payload = input.version.payload;
  const issues: ArticleApprovalRevalidationIssue[] = [];

  if (payload.brandId !== input.authorizedBrandId) {
    issues.push({
      code: "BRAND_MISMATCH",
      detail: "O ArticleDNA declara uma marca diferente da autorizada nesta sessão.",
    });
  }

  const principais = payload.keywordReferences.filter(reference => reference.role === "principal");
  if (principais.length === 0) {
    issues.push({ code: "NO_PRINCIPAL", detail: "Nenhuma busca marcada como Principal." });
  }
  if (principais.length > 1) {
    issues.push({
      code: "MULTIPLE_PRINCIPALS",
      detail: `${principais.length} buscas marcadas como Principal: ${principais.map(reference => reference.keywordId).join(", ")}.`,
    });
  }
  // Uma Principal declarada no campo e outra nas referências é a mesma
  // pergunta com duas respostas — e quem lê depois escolhe a errada.
  if (principais.length === 1 && principais[0].keywordId !== payload.principalKeywordId) {
    issues.push({
      code: "PRINCIPAL_NOT_IN_REFERENCES",
      detail: "A Principal declarada não é a mesma marcada nas referências de keyword.",
    });
  }

  if (payload.architectureStatus !== "architecture_confirmed") {
    issues.push({
      code: "ARCHITECTURE_NOT_CONFIRMED",
      detail: "A arquitetura do artigo não foi confirmada; aprovar aqui pularia a revisão humana.",
    });
  }

  /*
   * A SERP é obrigatória na fase Artigos.
   *
   * `serpAssessmentRef` preenchida prova COLETA, não validade — a validade
   * depende da base, e o gate do cliente é quem sabe compará-la. O que o
   * servidor consegue afirmar sozinho é o mínimo: sem referência nenhuma, a
   * hipótese da lógica nunca foi ao mercado.
   */
  if (!payload.serpAssessmentRef) {
    issues.push({
      code: "SERP_EVIDENCE_MISSING",
      detail: "O artigo não carrega referência de evidência SERP.",
    });
  }

  return issues;
}
