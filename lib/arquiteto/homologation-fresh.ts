/**
 * REINICIAR A RODADA DE HOMOLOGAÇÃO — sem apagar o que foi aprovado.
 *
 * "Recomeçar do zero" aqui significa limpar a CÓPIA DE TRABALHO da rodada, não
 * o acervo. Ele existe porque testar o Arquiteto repetidas vezes sobre resíduo
 * de vinte rodadas anteriores não prova nada: `Reprocessar` é incremental por
 * desenho e reproduz o cenário; `Restaurar` conserta em direção ao aprovado.
 * Nenhum dos dois recomeça — e misturar as três operações num botão só seria
 * a maneira mais rápida de perder trabalho sem perceber.
 *
 * O QUE ESTE MÓDULO NUNCA AUTORIZA APAGAR:
 *
 *  - `editorial_artifact_versions` — ArticleDNA, SiloDNA, SiloPage e
 *    InternalLinkGraph, aprovados ou propostos. Proposta redundante já deixou
 *    de ser autoridade por `canonical-version-authority`; apagá-la seria
 *    destruir histórico para limpar tela;
 *  - `minerador_keywords` — a KeywordDNA canônica não pertence a esta fase;
 *  - qualquer evidência: parecer SERP de formação, SERP territorial e revisão
 *    de IA. Evidência órfã é inofensiva, e é justamente ela que permite testar
 *    o reaproveitamento por `formationBaseHash` na rodada seguinte;
 *  - qualquer linha de outro `stage` — Radar e Planejador não são desta mesa.
 *
 * Domínio puro: sem storage, sem fetch. Quem apaga é a rota, sobre esta lista.
 */

/** O `stage` desta mesa. Linha de outro estágio nunca entra. */
export const HOMOLOGATION_FRESH_STAGE = "architect" as const;

/**
 * O que é estado de trabalho da rodada, com o porquê de cada um.
 *
 * A lista é de PERMISSÃO: subject_type fora dela é preservado por omissão. É
 * assim de propósito — o erro caro aqui é apagar demais, não de menos.
 */
export const HOMOLOGATION_FRESH_SUBJECTS: Record<string, string> = {
  keyword: "O lote importado da rodada. Sem limpá-lo, a próxima importação soma ao conjunto antigo.",
  architecture_analysis: "Marcador da análise de arquitetura da rodada; a próxima rodada refaz a sua.",
  article_formation_analysis: "Marcador da formação da rodada; os candidatos nascem de novo no reprocessamento.",
  silo_working_copy: "Cópia de trabalho do Silo. O SiloDNA aprovado continua no acervo.",
  territory: "Território de trabalho, candidato ou consolidado. O par SiloDNA/SiloPage aprovado permanece como histórico.",
};

/** Evidência e artefato: preservados por regra, não por acidente. */
export const HOMOLOGATION_FRESH_PRESERVED: Record<string, string> = {
  arquiteto_homologation_round: "Marcador de rodada: é ele que separa o histórico do estado corrente.",
  article_formation_serp_assessment: "Parecer SERP da formação: histórico, e base do reaproveitamento por formationBaseHash.",
  territorial_serp_assessment: "SERP territorial: evidência, não estado de trabalho.",
  territorial_ai_review: "Revisão territorial da IA: proposta registrada, preservada como histórico.",
};

export type FreshWorkflowRow = {
  id: string;
  subjectType: string;
  stage: string;
  state: string;
};

export type HomologationFreshPlan = {
  /** Ids que serão apagados. Só eles. */
  clearIds: string[];
  /** Quanto some, por tipo, com o motivo declarado. */
  clearing: { subjectType: string; count: number; reason: string }[];
  /** Quanto fica, por tipo, com o motivo declarado. */
  preserving: { subjectType: string; count: number; reason: string }[];
  totalCleared: number;
  totalPreserved: number;
  clean: boolean;
  summary: string;
};

/**
 * O que a rodada perde e o que ela mantém — antes de qualquer escrita.
 *
 * A tela mostra este plano no primeiro clique. Um resumo que só diga "vai
 * limpar" não permite decidir: a pessoa precisa ver o que sobrevive.
 */
export function planHomologationFresh(input: {
  rows: readonly FreshWorkflowRow[];
}): HomologationFreshPlan {
  const limpar = new Map<string, number>();
  const preservar = new Map<string, number>();
  const clearIds: string[] = [];

  for (const row of input.rows) {
    const fora = row.stage !== HOMOLOGATION_FRESH_STAGE;
    const transitorio = !fora && Object.hasOwn(HOMOLOGATION_FRESH_SUBJECTS, row.subjectType);
    if (transitorio) {
      clearIds.push(row.id);
      limpar.set(row.subjectType, (limpar.get(row.subjectType) || 0) + 1);
      continue;
    }
    const chave = fora ? `${row.subjectType} (${row.stage})` : row.subjectType;
    preservar.set(chave, (preservar.get(chave) || 0) + 1);
  }

  const motivoPreservado = (chave: string) =>
    HOMOLOGATION_FRESH_PRESERVED[chave]
      ?? (chave.includes("(") ? "Pertence a outro estágio do pipeline; esta mesa não decide por ele." : "Fora da lista de estado de trabalho: preservado por omissão.");

  const clearing = [...limpar.entries()]
    .map(([subjectType, count]) => ({ subjectType, count, reason: HOMOLOGATION_FRESH_SUBJECTS[subjectType] }))
    .sort((left, right) => left.subjectType.localeCompare(right.subjectType));
  const preserving = [...preservar.entries()]
    .map(([subjectType, count]) => ({ subjectType, count, reason: motivoPreservado(subjectType) }))
    .sort((left, right) => left.subjectType.localeCompare(right.subjectType));

  const totalCleared = clearIds.length;
  const totalPreserved = input.rows.length - totalCleared;

  return {
    clearIds,
    clearing,
    preserving,
    totalCleared,
    totalPreserved,
    clean: totalCleared === 0,
    summary: totalCleared === 0
      ? "Não há estado de trabalho a limpar nesta rodada."
      : `${totalCleared} item(ns) de trabalho serão limpos; ${totalPreserved} preservado(s). Nenhum artefato versionado é apagado.`,
  };
}

/**
 * A frase que a pessoa digita para confirmar.
 *
 * Determinística e ligada ao TAMANHO do que será apagado: se o plano mudar
 * entre o preview e a confirmação, a frase muda junto e a operação recomeça em
 * vez de apagar algo que ninguém viu.
 */
export function homologationFreshPhrase(totalCleared: number): string {
  return `REINICIAR ${totalCleared}`;
}
