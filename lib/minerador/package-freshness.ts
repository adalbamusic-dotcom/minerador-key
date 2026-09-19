import { approvedPackageDiverged, readApprovalRecord, type ApprovedPackageInput } from "./approved-package.ts";
import { resolveEffectiveKeywordStatus } from "./editorial-status.ts";

/**
 * Frescor do insumo: o consumidor a jusante está lendo a versão vigente?
 *
 * Quem sabe responder isto é o Minerador, porque é ele que define o que é um
 * pacote aprovado. O Arquiteto grava a referência no momento em que forma o
 * artefato e pergunta aqui depois — não reimplementa a comparação.
 *
 * O vocabulário de saída é deliberadamente o de `canonicalRevisionState` do
 * Arquiteto: `staleReasons` é uma lista de motivos declarados, e a ausência de
 * motivo é o que mantém a versão aprovada consumível a jusante. Nada aqui
 * bloqueia trabalho; declara estado.
 */

/** O que o consumidor gravou quando formou o artefato. */
export type KeywordPackageReference = {
  keywordId: string;
  /** Versão do pacote aprovado que sustentou a formação. */
  approvedVersion: number | null;
  /** `contentHash` do pacote aprovado, o mesmo que viaja no handoff. */
  contentHash: string | null;
};

export type PackageFreshnessState = "fresh" | "stale" | "in_review" | "never_approved" | "unknown";

export type PackageFreshness = {
  keywordId: string;
  state: PackageFreshnessState;
  /** Frase declarada; `null` quando não há nada a declarar. */
  reason: string | null;
  /** Versão vigente do pacote, quando existe. */
  currentVersion: number | null;
  /** Versão que o consumidor leu, quando declarada. */
  consumedVersion: number | null;
};

/** O estado atual da keyword no Minerador, do jeito que o consumidor recebe. */
export type KeywordPackageState = ApprovedPackageInput & { status?: unknown };

/**
 * Compara o que foi consumido com o que está aprovado agora.
 *
 * Os quatro estados existem porque significam coisas diferentes para quem
 * consome, e colapsá-los esconderia a distinção que importa:
 *
 *   fresh           consumiu a versão vigente
 *   stale           existe pacote aprovado mais novo
 *   in_review       a keyword está sendo mexida; a versão aprovada continua válida
 *   never_approved  não há pacote; o consumidor leu dado vivo
 */
export function resolvePackageFreshness(input: {
  keyword: KeywordPackageState;
  reference?: KeywordPackageReference | null;
}): PackageFreshness {
  const keywordId = input.keyword.keywordId;
  const record = readApprovalRecord(input.keyword.semantic);
  const consumedVersion = input.reference?.approvedVersion ?? null;

  if (!record) {
    return {
      keywordId,
      state: "never_approved",
      reason: "Formado sobre keyword sem pacote aprovado: o insumo veio do registro vivo.",
      currentVersion: null,
      consumedVersion,
    };
  }

  const effective = resolveEffectiveKeywordStatus({
    status: input.keyword.status,
    diverged: approvedPackageDiverged(input.keyword),
  });

  // Keyword mexida depois da aprovação NÃO invalida o que foi consumido: a
  // versão aprovada continua sendo a verdade até que outra seja aprovada.
  if (effective.divergedFromApproval) {
    const consumiuVigente = !input.reference?.contentHash || input.reference.contentHash === record.contentHash;
    return {
      keywordId,
      state: consumiuVigente ? "in_review" : "stale",
      reason: consumiuVigente
        ? `A keyword está em revisão no Minerador. O insumo continua sendo a v${record.version} aprovada.`
        : `Existe pacote aprovado mais novo (v${record.version}) e a keyword está em revisão.`,
      currentVersion: record.version,
      consumedVersion,
    };
  }

  if (!input.reference?.contentHash) {
    return {
      keywordId,
      state: "unknown",
      reason: "O artefato não declarou sobre qual pacote foi formado.",
      currentVersion: record.version,
      consumedVersion,
    };
  }

  if (input.reference.contentHash === record.contentHash) {
    return { keywordId, state: "fresh", reason: null, currentVersion: record.version, consumedVersion };
  }

  return {
    keywordId,
    state: "stale",
    reason: `Formado sobre a v${consumedVersion ?? "?"} do pacote; a aprovada agora é a v${record.version}.`,
    currentVersion: record.version,
    consumedVersion,
  };
}

/** Só o que precisa ser declarado. `fresh` não gera motivo. */
export function packageStaleReasons(entries: readonly PackageFreshness[]): string[] {
  return entries
    .filter(entry => entry.state !== "fresh" && entry.reason)
    .map(entry => entry.reason as string);
}

/**
 * Resumo para um artefato inteiro — um artigo, um Silo.
 *
 * `usableDownstream` responde a pergunta do consumidor: dá para trabalhar em
 * cima disto? Insumo em revisão **não** impede; insumo defasado impede, porque
 * significa que existe decisão aprovada que o artefato não conhece.
 */
export function summarizePackageFreshness(entries: readonly PackageFreshness[]): {
  stale: PackageFreshness[];
  inReview: PackageFreshness[];
  neverApproved: PackageFreshness[];
  staleReasons: string[];
  usableDownstream: boolean;
} {
  const stale = entries.filter(entry => entry.state === "stale");
  const inReview = entries.filter(entry => entry.state === "in_review");
  const neverApproved = entries.filter(entry => entry.state === "never_approved");
  return {
    stale,
    inReview,
    neverApproved,
    staleReasons: packageStaleReasons(entries),
    usableDownstream: stale.length === 0,
  };
}
