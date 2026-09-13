/**
 * NEM TODO ARTIGO PRECISA DE TODO DOSSIÊ.
 *
 * Obrigar um review de produto a fechar uma SERP editorial, ou um artigo
 * informacional a esperar por uma pesquisa de Amazon que não faz sentido para
 * ele, transforma etapa em burocracia. O TIPO do artigo decide o que é exigido.
 *
 * E quem decide o tipo não é o Radar: é o que o Arquiteto já declarou no
 * ArticleDNA e o que o Minerador qualificou em cada KeywordDNA —
 * `likelyEditorialType`, `reviewCandidate`, `productResearchRequired`,
 * `affiliatePotential`, intenção e funil. O Radar apenas LÊ e roteia.
 *
 * Um dossiê `NOT_REQUIRED` não bloqueia nada. Ele diz "aqui não se aplica", com
 * o motivo — que é diferente de "ainda não foi feito".
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarDeclaredKeywordIntent } from "./editorial-identity.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";

export type RadarDossierState = "NOT_REQUIRED" | "READY" | "IN_PROGRESS" | "COMPLETE" | "PARTIAL" | "BLOCKED";

export type RadarDossierRouting = {
  required: boolean;
  state: RadarDossierState;
  reason: string;
};

/** O tipo editorial que o roteamento reconhece. Poucos, e todos derivados. */
export type RadarArticlePurpose = "EDITORIAL" | "REVIEW_PRODUCT" | "EDITORIAL_WITH_PRODUCT" | "UNKNOWN";

export type RadarDossierPlan = {
  purpose: RadarArticlePurpose;
  purposeReason: string;
  serp: RadarDossierRouting;
  amazon: RadarDossierRouting;
  specialist: RadarDossierRouting;
};

const snapshotDe = (keyword: RadarArticleResearchContext["keywords"][number]) =>
  (keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null)?.payload || null;

const REVIEW_TYPES = new Set(["review", "comparison", "best_list", "individual_product"]);

const normalizar = (value: string | null | undefined) =>
  (value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * A finalidade do artigo, lida dos fundamentos.
 *
 * A PRINCIPAL manda: é ela que define o artigo. Uma secundária comercial num
 * artigo informacional adiciona contexto de produto, não transforma o artigo em
 * review.
 */
export function resolveRadarArticlePurpose(context: RadarArticleResearchContext): { purpose: RadarArticlePurpose; reason: string } {
  const principal = context.keywords.find(keyword => keyword.identity.role === "principal") || null;
  const snapshotPrincipal = principal ? snapshotDe(principal) : null;
  const tipoPrincipal = typeof snapshotPrincipal?.likelyEditorialType === "string" ? snapshotPrincipal.likelyEditorialType : null;

  const reviewNaPrincipal = Boolean(tipoPrincipal && REVIEW_TYPES.has(tipoPrincipal))
    || snapshotPrincipal?.reviewCandidate === true
    || snapshotPrincipal?.productResearchRequired === true;

  const comercialNaPrincipal = /transacional|transactional|commercial|comercial|compra/.test(
    normalizar(radarDeclaredKeywordIntent(principal?.strategy)),
  );

  if (reviewNaPrincipal) {
    return {
      purpose: "REVIEW_PRODUCT",
      reason: `A keyword principal foi qualificada como ${tipoPrincipal || "candidata a review"} no KeywordDNA: a pesquisa central é de produto.`,
    };
  }

  /* Produto aparece nas secundárias ou o funil é de decisão: contexto comercial. */
  const comercialNoResto = context.keywords.some(keyword => {
    if (keyword.identity.role === "principal") return false;
    const snapshot = snapshotDe(keyword);
    const tipo = typeof snapshot?.likelyEditorialType === "string" ? snapshot.likelyEditorialType : null;
    return (tipo && REVIEW_TYPES.has(tipo))
      || snapshot?.productResearchRequired === true
      || /transacional|transactional|commercial|comercial/.test(normalizar(radarDeclaredKeywordIntent(keyword.strategy)));
  });

  if (comercialNaPrincipal || comercialNoResto) {
    return {
      purpose: "EDITORIAL_WITH_PRODUCT",
      reason: comercialNaPrincipal
        ? "A principal declara intenção comercial: o artigo é editorial e toca decisão de compra."
        : "Uma keyword secundária ou de reforço trata de produto: o artigo é editorial com contexto comercial.",
    };
  }

  if (!principal) return { purpose: "UNKNOWN", reason: "A composição não declara keyword principal; o roteamento não pode ser resolvido." };
  return { purpose: "EDITORIAL", reason: "A composição é informacional: a pesquisa central é a da SERP editorial." };
}

export function resolveRadarDossierPlan(input: {
  context: RadarArticleResearchContext;
  ymylRelevance?: "NONE" | "LOW" | "MATERIAL" | "HIGH";
  /** O estado real de cada dossiê, quando já existe investigação. */
  serpState?: RadarDossierState;
  amazonState?: RadarDossierState;
  specialistState?: RadarDossierState;
}): RadarDossierPlan {
  const { purpose, reason } = resolveRadarArticlePurpose(input.context);
  const ymyl = input.ymylRelevance || "NONE";

  const serpRequerida = purpose !== "REVIEW_PRODUCT";
  const amazonRequerida = purpose === "REVIEW_PRODUCT" || purpose === "EDITORIAL_WITH_PRODUCT";
  /* O especialista é exigido quando o tema pesa: saúde, dinheiro, segurança. */
  const especialistaRequerido = ymyl === "MATERIAL" || ymyl === "HIGH";

  return {
    purpose,
    purposeReason: reason,
    serp: {
      required: serpRequerida,
      state: serpRequerida ? input.serpState || "READY" : "NOT_REQUIRED",
      reason: serpRequerida
        ? "A pesquisa da SERP é o dossiê central deste artigo."
        : "Review de produto: a pesquisa central é a da Amazon; a SERP editorial não é exigida.",
    },
    amazon: {
      required: amazonRequerida,
      state: amazonRequerida ? input.amazonState || "READY" : "NOT_REQUIRED",
      reason: purpose === "REVIEW_PRODUCT"
        ? "Review de produto: a Amazon é o dossiê principal de pesquisa."
        : amazonRequerida
          ? "O artigo toca decisão de compra: a pesquisa de produto complementa a SERP."
          : "Sem contexto comercial declarado nos fundamentos: pesquisa de produto não se aplica.",
    },
    specialist: {
      required: especialistaRequerido,
      state: especialistaRequerido ? input.specialistState || "READY" : "NOT_REQUIRED",
      reason: especialistaRequerido
        ? `Tema com relevância YMYL ${ymyl}: a validação e a assinatura de um especialista são exigidas antes do pacote final.`
        : "O tema não exige validação profissional obrigatória; a contribuição do especialista continua disponível como opção.",
    },
  };
}

export const radarDossierStateLabel = (state: RadarDossierState) => ({
  NOT_REQUIRED: "Não se aplica",
  READY: "Pronto para iniciar",
  IN_PROGRESS: "Em andamento",
  COMPLETE: "Concluído",
  PARTIAL: "Concluído com limitações",
  BLOCKED: "Bloqueado",
}[state]);

export const radarArticlePurposeLabel = (purpose: RadarArticlePurpose) => ({
  EDITORIAL: "Artigo editorial",
  REVIEW_PRODUCT: "Review / comparativo de produto",
  EDITORIAL_WITH_PRODUCT: "Editorial com contexto de produto",
  UNKNOWN: "Finalidade não resolvida",
}[purpose]);
