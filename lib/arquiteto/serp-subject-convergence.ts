/**
 * A CONVERGÊNCIA COM UMA ÂNCORA — A SERP PRIMEIRO, AS PALAVRAS DEPOIS (D2.2).
 *
 * Uma livre reforça um publicado, sustenta um Assunto ou é proposta a outro
 * Silo quando trata do MESMO assunto que a âncora. A medida principal é a
 * SERP (`serp-subject-overlap.ts`); as palavras (`sameArticleAffinity`) e o
 * DNA são apoio e desempate. A contradição de DNA (intenção, funil, SERP
 * conclusiva divergente) continua barrando (D5) — mesmo com páginas em comum.
 *
 *   SERP forte (3+ páginas)      entra, mesmo com poucas palavras em comum;
 *   SERP de apoio (2 páginas)    entra só se as palavras também convergem;
 *   SERP fraca ou nenhuma        NÃO entra, mesmo com palavras parecidas:
 *                                o Google disse que é outro assunto;
 *   sem SERP no cache            volta à regra das palavras, dizendo isso.
 *
 * SEM ÍNDICE, NADA MUDA: `measureAnchorConvergence` sem `serp` devolve
 * exatamente a afinidade e o piso de antes — a mesa que ainda não leu o
 * cache forma como formava.
 *
 * A ORDEM (score): SERP forte > SERP de apoio com palavras > palavras sem
 * SERP. Dentro da SERP forte, o VOLUME vem primeiro (D1.3: a livre vai para
 * onde agrega mais — mesma intenção, mesmo assunto, maior volume); depois,
 * mais páginas em comum; as palavras só desempatam.
 *
 * Por que o volume antes das páginas: 3+ páginas já é "o Google trata como o
 * mesmo assunto". Entre as que passam, 4 páginas contra 3 não é assunto mais
 * igual — é ruído do top 10. O volume é o que o artigo ganha. Na AdalbaPro,
 * ordenar só por páginas enchia "marketing digital para dentistas" com quatro
 * keywords de volume 10 (4 páginas) e deixava de fora "marketing para
 * dentistas" (volume 210, 3 páginas) — justo a que o Posto Livre pede como
 * substituta da principal.
 *
 * D2.3 — A INTENÇÃO QUE BARRA É A DA SERP (2026-09-27). Com a SERP da mesa,
 * só a intenção e o funil OBSERVADOS na SERP (`evidencia_serp` conclusiva do
 * pacote) separam duas keywords. A intenção e o funil da Lógica, quando
 * divergem, viram AVISO (`warnings`), não barreira. Na AdalbaPro, "como
 * atrair pacientes" (Informativa na Lógica) divide 7 páginas do top 10 com o
 * publicado "como atrair pacientes para clínica" (Comercial na Lógica) e
 * ficava de fora pela Lógica — o Google diz que é o mesmo assunto.
 * Sem SERP para medir o par (sem índice, ou sem páginas de um dos dois), a
 * Lógica continua sendo o único sinal de intenção e segura a entrada
 * automática, como antes.
 *
 * Domínio puro.
 */
import {
  AFFINITY_FLOOR,
  formationDnaContradiction,
  sameArticleAffinity,
  type ArticleFormationKeyword,
} from "./article-formation.ts";
import type { SerpSubjectIndex, SerpSubjectOverlap } from "./serp-subject-overlap.ts";
import { intentComparisonKey } from "./keyword-dna-signals.ts";

/* ------------------------- D2.3 — quem barra é a SERP ------------------------- */

const etapaDoFunil = (value: string | null | undefined): "TOP" | "MIDDLE" | "BOTTOM" | null => {
  const texto = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!texto) return null;
  if (/^tofu|topo|^top|awareness|descoberta/.test(texto)) return "TOP";
  if (/^mofu|meio|middle|considera/.test(texto)) return "MIDDLE";
  if (/^bofu|fundo|bottom|decis|convers/.test(texto)) return "BOTTOM";
  return null;
};

/** A intenção ou o funil OBSERVADOS na SERP (evidencia_serp conclusiva) separam as duas. */
export function serpObservedDnaContradiction(left: ArticleFormationKeyword, right: ArticleFormationKeyword): string | null {
  const esquerda = intentComparisonKey(left.observedIntent ?? null);
  const direita = intentComparisonKey(right.observedIntent ?? null);
  if (esquerda && direita && esquerda !== direita) return "o Google mostrou, de forma conclusiva, intenções diferentes para as duas buscas";
  const funilEsquerda = etapaDoFunil(left.observedFunnel);
  const funilDireita = etapaDoFunil(right.observedFunnel);
  if (funilEsquerda && funilDireita && funilEsquerda !== funilDireita) return "o Google mostrou estágios de funil diferentes para as duas buscas";
  return null;
}

/**
 * A Lógica (intenção ou funil do DNA, fora da SERP observada) diverge. Com a
 * SERP medindo o par, isto é só aviso (D2.3).
 */
export function logicDnaDivergence(left: ArticleFormationKeyword, right: ArticleFormationKeyword): string | null {
  const esquerda = intentComparisonKey(left.intent);
  const direita = intentComparisonKey(right.intent);
  if (esquerda && direita && esquerda !== direita) return `intenção da Lógica diferente (${left.intent} × ${right.intent})`;
  const ambosObservados = Boolean(etapaDoFunil(left.observedFunnel) && etapaDoFunil(right.observedFunnel));
  const funilEsquerda = etapaDoFunil(left.observedFunnel ?? left.funnel);
  const funilDireita = etapaDoFunil(right.observedFunnel ?? right.funnel);
  if (!ambosObservados && funilEsquerda && funilDireita && funilEsquerda !== funilDireita) {
    return `funil da Lógica diferente (${left.observedFunnel ?? left.funnel} × ${right.observedFunnel ?? right.funnel})`;
  }
  return null;
}

/**
 * A barreira de DNA entre duas keywords, com a regra D2.3.
 *
 * Sem índice de SERP: a regra anterior (`formationDnaContradiction`), byte a
 * byte. Com índice: barra a SERP observada; a Lógica só barra quando a SERP
 * não mede o par (sem páginas de um dos dois no cache).
 */
export function serpAwareDnaBarrier(left: ArticleFormationKeyword, right: ArticleFormationKeyword, serp?: SerpSubjectIndex | null): string | null {
  if (!serp) return formationDnaContradiction(left, right);
  const observada = serpObservedDnaContradiction(left, right);
  if (observada) return observada;
  if (!logicDnaDivergence(left, right)) return formationDnaContradiction(left, right);
  return serp.overlap(left.keywordId, right.keywordId).strength === "unknown" ? formationDnaContradiction(left, right) : null;
}

/** A linha sem a Lógica de intenção e funil: a afinidade por palavras sem a barreira que virou aviso. */
const semLogica = (keyword: ArticleFormationKeyword): ArticleFormationKeyword => ({ ...keyword, intent: null, funnel: null, observedFunnel: null });

/** O aviso da Lógica, dito igual em toda a mesa. */
export const logicWarningText = (divergencia: string) => `Aviso: ${divergencia}; quem barra é a intenção da SERP, e ela não separa as duas.`;

/**
 * `serp`               a SERP forte decidiu;
 * `serp_and_words`     SERP de apoio (2 páginas) confirmada pelas palavras;
 * `words_without_serp` sem SERP no cache de uma das duas: só palavras;
 * `words`              sem índice de SERP (regra anterior);
 * `serp_refuses`       o Google diz que é outro assunto;
 * `dna_contradiction`  o DNA separa as duas (D5);
 * `below_floor`        nem SERP nem palavras bastam.
 */
export type AnchorConvergenceBasis =
  | "serp"
  | "serp_and_words"
  | "words_without_serp"
  | "words"
  | "serp_refuses"
  | "dna_contradiction"
  | "below_floor";

export type AnchorConvergence = {
  eligible: boolean;
  /** Ordena candidatas: SERP forte > SERP de apoio com palavras > palavras. */
  score: number;
  basis: AnchorConvergenceBasis;
  /** A afinidade por palavras, sempre calculada (apoio e desempate). */
  lexicalAffinity: number;
  /** A medida da SERP, quando havia índice. */
  overlap: SerpSubjectOverlap | null;
  /** Os motivos, a SERP primeiro. */
  reasons: string[];
  /** Com qual keyword da âncora a medida foi feita (principal ou Assunto). */
  measuredAgainstKeywordId: string;
  /** D2.3 (aditivo) — a Lógica diverge, mas a SERP mede e não separa: só aviso. */
  warnings?: string[];
};

/** Palavras sem SERP nunca passam na frente de uma SERP que confirma. */
const PESO_SEM_SERP = 0.8;

/**
 * O volume dentro da SERP forte, em [0, 0,5): escala logarítmica, saturando
 * em 100 mil buscas. Sem volume, zero. Nunca tira a candidata da faixa forte
 * (score de 1 a 2), só a ordena dentro dela.
 */
export function strongSerpVolumeWeight(volume: number | null | undefined): number {
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume <= 0) return 0;
  return Math.min(Math.log10(volume + 1) / 5, 0.999) * 0.5;
}

export function measureAnchorConvergence(
  anchor: ArticleFormationKeyword,
  candidate: ArticleFormationKeyword,
  options: { siloTokens?: ReadonlySet<string>; serp?: SerpSubjectIndex | null; floor?: number } = {},
): AnchorConvergence {
  const piso = options.floor ?? AFFINITY_FLOOR;
  // D2.3 — com SERP, só a intenção observada barra; a Lógica que diverge vira aviso.
  const contradicao = options.serp ? serpAwareDnaBarrier(anchor, candidate, options.serp) : formationDnaContradiction(anchor, candidate);
  const divergenciaDaLogica = options.serp && !contradicao ? logicDnaDivergence(anchor, candidate) : null;
  const { affinity, reasons } = divergenciaDaLogica
    ? sameArticleAffinity(semLogica(anchor), semLogica(candidate), options.siloTokens || new Set())
    : sameArticleAffinity(anchor, candidate, options.siloTokens || new Set());
  const aviso = divergenciaDaLogica ? [logicWarningText(divergenciaDaLogica)] : [];
  const base = { lexicalAffinity: affinity, measuredAgainstKeywordId: anchor.keywordId, ...(aviso.length ? { warnings: aviso } : {}) };
  const overlap = options.serp ? options.serp.overlap(anchor.keywordId, candidate.keywordId) : null;

  if (contradicao) {
    return {
      ...base, eligible: false, score: 0, basis: "dna_contradiction", overlap,
      reasons: [
        overlap && (overlap.strength === "strong" || overlap.strength === "support")
          ? `${overlap.reason} Mas o DNA separa as duas: ${contradicao} — só por decisão humana.`
          : `O DNA separa as duas: ${contradicao}.`,
      ],
    };
  }
  if (!overlap) {
    // Sem índice: a regra anterior, byte a byte.
    return { ...base, eligible: affinity >= piso, score: affinity, basis: affinity >= piso ? "words" : "below_floor", overlap: null, reasons };
  }
  const apoio = reasons.length ? [`Apoio: ${reasons.join("; ")}.`] : [];
  switch (overlap.strength) {
    case "strong":
      return {
        ...base, eligible: true, basis: "serp", overlap,
        // Volume primeiro, páginas depois (≤ 0,01 por página), palavras por último.
        score: 1 + strongSerpVolumeWeight(candidate.volume) + Math.min(overlap.sharedPageCount, 10) / 1000 + affinity / 100000,
        reasons: [overlap.reason, ...apoio, ...aviso],
      };
    case "support":
      return affinity >= piso
        ? { ...base, eligible: true, basis: "serp_and_words", overlap, score: 0.9 + affinity / 100, reasons: [overlap.reason, ...apoio, ...aviso] }
        : { ...base, eligible: false, basis: "below_floor", overlap, score: 0, reasons: [`${overlap.reason} As palavras não confirmam.`] };
    case "weak":
    case "none":
      return { ...base, eligible: false, basis: "serp_refuses", overlap, score: 0, reasons: [overlap.reason] };
    default:
      return affinity >= piso
        ? {
          ...base, eligible: true, basis: "words_without_serp", overlap, score: affinity * PESO_SEM_SERP,
          reasons: [`${overlap.reason} Convergência só por palavras (apoio, não medida).`, ...reasons],
        }
        : { ...base, eligible: false, basis: "below_floor", overlap, score: 0, reasons: [overlap.reason] };
  }
}

/**
 * A melhor convergência com qualquer keyword da âncora — a principal do
 * artigo e, no Assunto, a frase declarada (que tem SERP própria quando a
 * Pesquisa por Assunto coletou). Elegível se alguma for.
 */
export function bestAnchorConvergence(
  anchors: readonly ArticleFormationKeyword[],
  candidate: ArticleFormationKeyword,
  options: { siloTokens?: ReadonlySet<string>; serp?: SerpSubjectIndex | null; floor?: number } = {},
): AnchorConvergence {
  const medidas = anchors
    .filter((anchor, index, all) => all.findIndex(item => item.keywordId === anchor.keywordId) === index)
    .map(anchor => measureAnchorConvergence(anchor, candidate, options));
  // Contradição de DNA com QUALQUER keyword da âncora barra (D5).
  const barrada = medidas.find(medida => medida.basis === "dna_contradiction");
  if (barrada) return barrada;
  return medidas.sort((left, right) => Number(right.eligible) - Number(left.eligible) || right.score - left.score)[0]
    ?? { eligible: false, score: 0, basis: "below_floor", lexicalAffinity: 0, overlap: null, reasons: [], measuredAgainstKeywordId: "" };
}

export const ANCHOR_CONVERGENCE_BASIS_LABELS: Readonly<Record<AnchorConvergenceBasis, string>> = Object.freeze({
  serp: "mesmo assunto no Google",
  serp_and_words: "vizinhança no Google, confirmada pelas palavras",
  words_without_serp: "só palavras (sem SERP no cache)",
  words: "palavras e DNA",
  serp_refuses: "o Google diz que é outro assunto",
  dna_contradiction: "o DNA separa as duas",
  below_floor: "não converge",
});
