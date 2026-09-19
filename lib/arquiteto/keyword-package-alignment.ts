/**
 * O ALINHAMENTO ENTRE O ARTICLEDNA E O PACOTE APROVADO DA KEYWORD.
 *
 * O Minerador passou a entregar o KeywordDNA congelado no ato da aprovação, e
 * só o troca com nova aprovação. Antes disso, o Arquiteto lia a linha viva e
 * copiava "o retrato do dia em que fechei" — desalinhado de forma invisível,
 * porque as duas leituras vinham da mesma fonte mutável.
 *
 * Com o pacote versionado a divergência fica VISÍVEL: dá para responder
 * "este artigo foi formado sobre qual versão da keyword?". O que faltava não
 * era armazenamento — era comparação. Este módulo é a comparação.
 *
 * O que ele NÃO faz, de propósito:
 *   - não bloqueia trabalho em andamento: keyword em revisão é uma
 *     `staleReason`, não um impedimento de formar artigo;
 *   - não recalcula nada do artigo: só lê refs gravadas e refs atuais;
 *   - não adivinha: artefato sem `approvedPackageRef` é DESCONHECIDO, nunca
 *     "alinhado" nem "desatualizado" por palpite.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import type { ApprovedPackageRef, ArticleDNA } from "./contracts.ts";

/** O que o handoff gravou no item de workflow da keyword. */
export type KeywordPackageState = {
  keywordId: string;
  /** `null` = o Minerador não entregou pacote (em revisão ou nunca aprovada). */
  current: ApprovedPackageRef | null;
};

export const KEYWORD_ALIGNMENT_STATES = [
  /** Artigo formado sobre a mesma versão que vale hoje. */
  "ALIGNED",
  /** O humano aprovou de novo depois que o artigo nasceu. */
  "PACKAGE_NEWER",
  /** A keyword está em revisão: não há pacote vigente para comparar. */
  "IN_REVIEW",
  /** Artefato anterior ao pacote versionado: nada a comparar, nada a fingir. */
  "UNKNOWN",
] as const;
export type KeywordAlignmentState = (typeof KEYWORD_ALIGNMENT_STATES)[number];

export type KeywordAlignment = {
  keywordId: string;
  state: KeywordAlignmentState;
  recorded: ApprovedPackageRef | null;
  current: ApprovedPackageRef | null;
  reason: string;
};

export type ArticleKeywordAlignment = {
  articleId: string;
  keywords: KeywordAlignment[];
  /** Só o que invalida a versão aprovada: alimenta `canonicalRevisionState`. */
  staleReasons: string[];
  /** Há keyword em revisão no artigo? Informa; não bloqueia. */
  inReview: boolean;
  /** O artigo é anterior ao pacote versionado em pelo menos uma keyword? */
  provenanceIncomplete: boolean;
};

/**
 * Lê o `approvedDna` gravado no payload do item de workflow da keyword.
 *
 * A única fonte é o que o handoff persistiu; nada é reconstruído da linha
 * viva do Minerador — essa é justamente a leitura que o pacote substitui.
 */
export function readApprovedPackageRef(payload: unknown): ApprovedPackageRef | null {
  if (!payload || typeof payload !== "object") return null;
  const approved = (payload as Record<string, unknown>).approvedDna;
  if (!approved || typeof approved !== "object") return null;
  const item = approved as Record<string, unknown>;
  const version = typeof item.version === "number" && Number.isInteger(item.version) && item.version > 0 ? item.version : null;
  const contentHash = typeof item.contentHash === "string" && item.contentHash.trim() ? item.contentHash : null;
  const approvedAt = typeof item.approvedAt === "string" && item.approvedAt.trim() ? item.approvedAt : null;
  if (!version || !contentHash || !approvedAt) return null;
  return { version, contentHash, approvedAt };
}

const rotulo = (labels: ReadonlyMap<string, string> | undefined, keywordId: string) =>
  labels?.get(keywordId) || keywordId;

export function resolveArticleKeywordAlignment(input: {
  article: Pick<ArticleDNA, "articleId" | "keywordReferences">;
  /** Estado atual de cada keyword, pelo id. Ausente no mapa = sem handoff. */
  currentByKeywordId: ReadonlyMap<string, KeywordPackageState>;
  labels?: ReadonlyMap<string, string>;
}): ArticleKeywordAlignment {
  const keywords: KeywordAlignment[] = input.article.keywordReferences.map(reference => {
    const recorded = reference.approvedPackageRef ?? null;
    const atual = input.currentByKeywordId.get(reference.keywordId);
    const current = atual?.current ?? null;
    const nome = rotulo(input.labels, reference.keywordId);

    if (!recorded) {
      return {
        keywordId: reference.keywordId, state: "UNKNOWN", recorded, current,
        reason: `"${nome}" entrou no artigo antes do pacote versionado: não há o que comparar.`,
      };
    }
    if (atual && !current) {
      return {
        keywordId: reference.keywordId, state: "IN_REVIEW", recorded, current,
        reason: `"${nome}" está em revisão no Minerador; o artigo segue sobre a v${recorded.version} aprovada.`,
      };
    }
    if (current && current.contentHash !== recorded.contentHash) {
      return {
        keywordId: reference.keywordId, state: "PACKAGE_NEWER", recorded, current,
        reason: `"${nome}" foi reaprovada (v${recorded.version} → v${current.version}) depois que este artigo nasceu.`,
      };
    }
    return {
      keywordId: reference.keywordId, state: "ALIGNED", recorded, current,
      reason: `"${nome}" está na versão aprovada vigente (v${recorded.version}).`,
    };
  });

  return {
    articleId: input.article.articleId,
    keywords,
    /*
     * Só reaprovação invalida. Revisão em andamento não: o contrato é que o
     * Arquiteto continue produzindo sobre a última aprovada enquanto a próxima
     * é preparada — bloquear aqui seria ruído sobre trabalho que ainda não
     * mudou nada.
     */
    staleReasons: keywords.filter(item => item.state === "PACKAGE_NEWER").map(item => item.reason),
    inReview: keywords.some(item => item.state === "IN_REVIEW"),
    provenanceIncomplete: keywords.some(item => item.state === "UNKNOWN"),
  };
}

/**
 * O que impede FECHAR o Silo por causa do insumo.
 *
 * Fechar um Silo sobre keyword em revisão ou reaprovada produz um artefato que
 * nasce velho — e é mais barato impedir aqui do que propagar por três camadas
 * depois. Diferente do artigo, aqui as duas situações barram: o fechamento é
 * o ato que congela, e congelar sobre insumo em movimento é o erro caro.
 */
export function keywordPackageClosureIssues(input: {
  keywordIds: readonly string[];
  currentByKeywordId: ReadonlyMap<string, KeywordPackageState>;
  /** O que os artigos concluídos gravaram, quando gravaram. */
  recordedByKeywordId?: ReadonlyMap<string, ApprovedPackageRef>;
  labels?: ReadonlyMap<string, string>;
}): { keywordId: string; label: string; reason: string }[] {
  const issues: { keywordId: string; label: string; reason: string }[] = [];
  for (const keywordId of new Set(input.keywordIds)) {
    const nome = rotulo(input.labels, keywordId);
    const atual = input.currentByKeywordId.get(keywordId);
    if (atual && !atual.current) {
      issues.push({ keywordId, label: nome, reason: "está em revisão no Minerador; fechar agora congelaria um insumo em movimento." });
      continue;
    }
    const gravado = input.recordedByKeywordId?.get(keywordId);
    if (gravado && atual?.current && atual.current.contentHash !== gravado.contentHash) {
      issues.push({ keywordId, label: nome, reason: `foi reaprovada (v${gravado.version} → v${atual.current.version}) depois da formação; o Silo fecharia sobre a versão antiga.` });
    }
  }
  return issues;
}
