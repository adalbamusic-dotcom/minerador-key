/**
 * ===== 2026-10-09 · O REDATOR ESCOLHE A PLANTA PELO MESMO PICK DO CSV =====
 *
 * Regra do dono (2026-10-09): o processo do piloto substitui o antigo em toda
 * operação. O artigo-modelo que o Redator lê (fundamentos, pacote da seção,
 * semeadura, fatia do MCP e o envio) é escolhido pela MESMA função do export
 * (`radarArticleBlueprintPick`, lib/radar/article-blueprint-freeze.ts), sobre as
 * mesmas versões concluídas (só APPROVED, como o CSV lê), em dois passos:
 *
 *   1. o hash exato do pacote do documento — a concluída mais nova dele;
 *   2. senão, a concluída mais nova do MESMO congelamento e do MESMO ArticleDNA,
 *      com o congelamento da Amazon do pacote quando ele é conhecido (a regra
 *      aditiva de 2026-10-09: congelamento novo da Amazon desliga a planta que o
 *      conhecia; a versão gravada antes, sem a chave, continua vinculada).
 *
 * A única diferença do CSV é a guarda do documento: a planta ANTIGA (sem a
 * referência gravada) só vale pelo relógio enquanto o congelamento do documento
 * ainda é o vigente da análise (`frozenStillCurrent`) — senão uma planta de F2
 * nasceria "depois de F1" e iria ao documento de F1. A guarda só tira versões;
 * nunca liga uma que o CSV recusaria.
 *
 * Puro: o servidor lê os metadados e passa aqui.
 */

import {
  radarArticleBlueprintPick,
  type RadarArticleBlueprintPick,
  type RadarArticleBlueprintVersionMeta,
} from "../radar/article-blueprint-freeze.ts";

/** A investigação do pacote do documento: o congelamento, o ArticleDNA e, quando conhecido, o congelamento da Amazon. */
export type WriterBlueprintPickInvestigation = {
  frozenAt: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
  /** O congelamento da Amazon do pacote (`research.amazon.frozenAt`); null = sem Amazon; ausente = não conferido. */
  amazonFrozenAt?: string | null;
};

const semReferencia = (meta: RadarArticleBlueprintVersionMeta) => meta.investigationRef === null || meta.investigationRef === undefined;

export function writerArticleBlueprintPick(
  versoes: readonly RadarArticleBlueprintVersionMeta[],
  alvo: {
    bundleHash: string | null | undefined;
    investigation: WriterBlueprintPickInvestigation | null | undefined;
    /** A vigência da versão do ArticleDNA (só a planta antiga, sem a referência, a usa). */
    articleDnaFrom?: string | null;
    articleDnaUntil?: string | null;
    /** O congelamento do documento ainda é o vigente da análise? Sem isso, a planta antiga não vale pelo relógio. */
    frozenStillCurrent?: boolean;
  },
): RadarArticleBlueprintPick | null {
  const concluidas = versoes.filter(meta => meta.state === "APPROVED");
  const exata = radarArticleBlueprintPick(concluidas, { bundleHash: alvo.bundleHash, investigation: null });
  if (exata) return exata;
  const investigacao = alvo.investigation;
  if (!investigacao) return null;
  const elegiveis = alvo.frozenStillCurrent ? concluidas : concluidas.filter(meta => !semReferencia(meta));
  return radarArticleBlueprintPick(elegiveis, {
    bundleHash: null,
    investigation: {
      frozenAt: investigacao.frozenAt,
      frozenBundleId: null,
      frozenBundleHash: null,
      articleDnaVersionId: investigacao.articleDnaVersionId,
      articleDnaContentHash: investigacao.articleDnaContentHash,
      ...(investigacao.amazonFrozenAt !== undefined ? { amazonFrozenAt: investigacao.amazonFrozenAt } : {}),
      articleDnaFrom: alvo.articleDnaFrom ?? null,
      articleDnaUntil: alvo.articleDnaUntil ?? null,
    },
  });
}

/** A planta antiga (sem a referência gravada) nascida depois do congelamento do documento: só ela pede a guarda e a vigência. */
export function writerBlueprintNeedsFreezeGuard(versoes: readonly RadarArticleBlueprintVersionMeta[], frozenAt: string): boolean {
  const congelada = Date.parse(frozenAt);
  return Number.isFinite(congelada) && versoes.some(meta => meta.state === "APPROVED" && semReferencia(meta) && Date.parse(meta.createdAt ?? "") > congelada);
}
