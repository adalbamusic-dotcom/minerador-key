import type { ArticleDNA } from "./contracts.ts";

/**
 * RESTAURAR A CÓPIA DE TRABALHO A PARTIR DO QUE FOI APROVADO.
 *
 * `Reprocessar artigos` é INCREMENTAL: ele preserva as decisões humanas e a
 * estrutura corrente. Por isso ele não conserta um cenário contaminado — ele o
 * reproduz. E `Confirmar arquitetura` só propõe atribuições que a análise do
 * cenário sugere; sobre um drift antigo ela propõe "sem mudança" para tudo,
 * porque a working copy já concorda consigo mesma.
 *
 * A restauração é outra operação. O baseline não é a análise: é o ARTEFATO
 * APROVADO. Ela pergunta apenas "onde a keyword deveria estar, segundo o
 * ArticleDNA que foi aprovado?" e devolve a diferença.
 *
 * O que ela NÃO faz, e não pode passar a fazer:
 *
 *  - não edita ArticleDNA, não cria sucessora, não aprova nada;
 *  - não chama provider nem recalcula SERP;
 *  - não reagrupa por similaridade — o baseline são as decisões já gravadas;
 *  - não é parcial: ou as atribuições voltam todas, ou nenhuma.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

export type RestoreKeywordAssignment = {
  keywordId: string;
  label: string;
  /** Território em que a keyword está AGORA na cópia de trabalho. */
  currentTerritoryRef: string | null;
  currentTerritoryLabel: string | null;
};

export type RestoreKeywordPlan = RestoreKeywordAssignment & {
  /** Território que o ArticleDNA aprovado declara. */
  approvedTerritoryRef: string;
  approvedTerritoryLabel: string | null;
};

export type RestoreArticlePlan = {
  articleId: string;
  label: string;
  approvedVersionNumber: number;
  approvedTerritoryRef: string;
  /** Keywords do artigo que estão fora do território aprovado. */
  keywords: RestoreKeywordPlan[];
  /** Quantas das keywords aprovadas já estão no lugar certo. */
  alignedBefore: number;
  keywordCount: number;
};

export type WorkingCopyRestorePlan = {
  articles: RestoreArticlePlan[];
  /** Todas as atribuições a aplicar, achatadas — o lote é atômico. */
  assignments: RestoreKeywordPlan[];
  articlesAffected: number;
  keywordsToRestore: number;
  clean: boolean;
  summary: string;
};

const keywordsDoArtigo = (article: ArticleDNA): string[] => [
  String(article.principalKeywordId),
  ...(article.secondaryKeywordIds || []).map(String),
  ...(article.narrativeReinforcementIds || []).map(String),
];

/**
 * O que falta para a cópia de trabalho voltar a representar os aprovados.
 *
 * Artigo aprovado sem `territoryRef` fica de fora: sem território declarado
 * não há para onde restaurar, e inventar um seria decidir no lugar de alguém.
 */
export function planWorkingCopyRestore(input: {
  /** ArticleDNA canônicos aprovados — o baseline. */
  approvedArticles: readonly { versionNumber: number; payload: ArticleDNA }[];
  /** Território de cada keyword na cópia de trabalho de agora. */
  territoryByKeywordId: ReadonlyMap<string, string | null>;
  labelByKeywordId: ReadonlyMap<string, string>;
  labelByTerritoryRef?: ReadonlyMap<string, string>;
}): WorkingCopyRestorePlan {
  const nomeTerritorio = (ref: string | null) =>
    (ref ? input.labelByTerritoryRef?.get(ref) ?? null : null);

  const articles: RestoreArticlePlan[] = [];
  for (const versao of input.approvedArticles) {
    const article = versao.payload;
    const aprovado = article.territoryRef ? String(article.territoryRef) : null;
    if (!aprovado) continue;

    const keywordIds = keywordsDoArtigo(article);
    const foraDoLugar: RestoreKeywordPlan[] = [];
    let alinhadas = 0;

    for (const keywordId of keywordIds) {
      // Keyword que a cópia de trabalho não conhece não é drift: é ausência, e
      // devolvê-la ao território seria criar vínculo que ninguém pediu.
      if (!input.territoryByKeywordId.has(keywordId)) continue;
      const atual = input.territoryByKeywordId.get(keywordId) ?? null;
      if (atual === aprovado) { alinhadas += 1; continue; }
      foraDoLugar.push({
        keywordId,
        label: input.labelByKeywordId.get(keywordId) || keywordId,
        currentTerritoryRef: atual,
        currentTerritoryLabel: nomeTerritorio(atual),
        approvedTerritoryRef: aprovado,
        approvedTerritoryLabel: nomeTerritorio(aprovado),
      });
    }

    if (!foraDoLugar.length) continue;
    articles.push({
      articleId: String(article.articleId),
      label: input.labelByKeywordId.get(String(article.principalKeywordId)) || String(article.articleId),
      approvedVersionNumber: versao.versionNumber,
      approvedTerritoryRef: aprovado,
      keywords: foraDoLugar,
      alignedBefore: alinhadas,
      keywordCount: alinhadas + foraDoLugar.length,
    });
  }

  const assignments = articles.flatMap(item => item.keywords);
  const clean = assignments.length === 0;
  return {
    articles,
    assignments,
    articlesAffected: articles.length,
    keywordsToRestore: assignments.length,
    clean,
    summary: clean
      ? "A cópia de trabalho já representa os ArticleDNA aprovados: nada a restaurar."
      : `${articles.length} Article(s) e ${assignments.length} keyword(s) fora do território aprovado.`,
  };
}

/* ------------------------------ o resultado ------------------------------ */

export type RestoreOutcome =
  | { state: "clean"; applied: 0; message: string }
  | { state: "restored"; applied: number; message: string }
  | { state: "failed"; applied: number; failed: string[]; message: string };

/**
 * Aplica o plano — TUDO ou NADA.
 *
 * Restauração pela metade deixaria o Article divergente entre um clique e
 * outro: estado que ninguém pediu e que só existe porque o lote foi aplicado
 * em pedaços. Quando uma atribuição falha, a operação inteira é declarada
 * falha e o que já foi aplicado é desfeito pelo caminho de volta.
 */
export async function applyWorkingCopyRestore(input: {
  plan: WorkingCopyRestorePlan;
  assign: (assignment: RestoreKeywordPlan) => Promise<void>;
  /** Devolve a keyword ao território anterior quando o lote falha. */
  revert: (assignment: RestoreKeywordPlan) => Promise<void>;
}): Promise<RestoreOutcome> {
  if (input.plan.clean) {
    return { state: "clean", applied: 0, message: input.plan.summary };
  }

  const aplicadas: RestoreKeywordPlan[] = [];
  for (const assignment of input.plan.assignments) {
    try {
      await input.assign(assignment);
      aplicadas.push(assignment);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : "falha desconhecida";
      const desfeitas: string[] = [];
      for (const feita of aplicadas.reverse()) {
        try {
          await input.revert(feita);
        } catch {
          // O que não voltou precisa ser nomeado: silenciar aqui deixaria a
          // pessoa achando que o estado ficou íntegro.
          desfeitas.push(feita.label);
        }
      }
      return {
        state: "failed",
        applied: 0,
        failed: [assignment.label, ...desfeitas],
        message: `A restauração falhou em "${assignment.label}" (${motivo}) e foi desfeita.`
          + (desfeitas.length ? ` Não foi possível desfazer: ${desfeitas.join(" · ")}.` : ""),
      };
    }
  }

  return {
    state: "restored",
    applied: aplicadas.length,
    message: `${aplicadas.length} keyword(s) devolvida(s) ao território do ArticleDNA aprovado. `
      + "Rode a auditoria de drift para confirmar 8/8 antes de reprocessar.",
  };
}
