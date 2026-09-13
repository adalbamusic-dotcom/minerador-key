/**
 * O QUE O BOTÃO FEZ.
 *
 * `Processar artigos` terminava com uma frase em prosa. A frase dizia bastante,
 * mas não separava as duas coisas que a homologação precisa distinguir:
 * evidência COLETADA agora e evidência REAPROVEITADA de antes. Sem essa
 * separação não dá para provar que a segunda execução reusou o que a primeira
 * coletou — que é exatamente o teste do §29.
 *
 * Isto não é um painel novo. É a leitura nomeada do que o processamento já
 * calcula, para que a pessoa confira número por número em vez de interpretar
 * um parágrafo.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export const SERP_SOURCES = ["COLLECTED", "REUSED"] as const;
export type SerpSource = (typeof SERP_SOURCES)[number];

export const SERP_VERDICTS = ["SUPPORTED", "DIVERGENCE", "INCONCLUSIVE", "NOT_RUN"] as const;
export type SerpVerdict = (typeof SERP_VERDICTS)[number];

export const SERP_SOURCE_LABELS: Record<SerpSource, string> = {
  COLLECTED: "Coletada agora",
  REUSED: "Reaproveitada",
};

export const SERP_VERDICT_LABELS: Record<SerpVerdict, string> = {
  SUPPORTED: "Sustentada",
  DIVERGENCE: "Divergente",
  INCONCLUSIVE: "Inconclusiva",
  NOT_RUN: "Sem evidência",
};

/**
 * O motor fala `COMPATIBLE`; o contrato da mesa fala `SUPPORTED`.
 *
 * Traduzir aqui, num lugar só, evita as duas palavras circulando pela tela
 * como se fossem estados diferentes.
 */
export function serpVerdictOf(
  observed: "NOT_RUN" | "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE" | null | undefined,
): SerpVerdict {
  if (observed === "COMPATIBLE") return "SUPPORTED";
  if (observed === "DIVERGENCE") return "DIVERGENCE";
  if (observed === "INCONCLUSIVE") return "INCONCLUSIVE";
  return "NOT_RUN";
}

/**
 * Coletada nesta execução ou reaproveitada de uma anterior.
 *
 * Sem evidência nenhuma o resultado é `null`: dizer "reaproveitada" para quem
 * nunca teve SERP inventaria um passado que não existe.
 */
export function serpSourceOf(input: {
  candidateRef: string;
  collectedInThisRun: ReadonlySet<string>;
  hasEvidence: boolean;
}): SerpSource | null {
  if (input.collectedInThisRun.has(input.candidateRef)) return "COLLECTED";
  return input.hasEvidence ? "REUSED" : null;
}

export type ArticleRunRow = {
  articleId: string;
  serpSource: SerpSource | null;
  serpVerdict: SerpVerdict;
  /** A frase que sustenta a decisão operacional deste artigo. */
  decisionBasis: string;
  /** A formação de agora difere da que já estava aprovada. */
  formationChanged: boolean;
  readyToConclude: boolean;
  blocked: boolean;
};

/** As chaves são as do §4, no mesmo nome, para conferência direta. */
export type ArticleRunReadout = {
  ARTICLES_PROCESSED: number;
  SERP_COLLECTED: number;
  SERP_REUSED: number;
  FORMATIONS_CHANGED: number;
  FORMATIONS_UNCHANGED: number;
  READY_TO_CONCLUDE: number;
  BLOCKED: number;
};

export function buildArticleRunReadout(rows: readonly ArticleRunRow[]): ArticleRunReadout {
  return {
    ARTICLES_PROCESSED: rows.length,
    SERP_COLLECTED: rows.filter(row => row.serpSource === "COLLECTED").length,
    SERP_REUSED: rows.filter(row => row.serpSource === "REUSED").length,
    FORMATIONS_CHANGED: rows.filter(row => row.formationChanged).length,
    FORMATIONS_UNCHANGED: rows.filter(row => !row.formationChanged).length,
    READY_TO_CONCLUDE: rows.filter(row => row.readyToConclude).length,
    BLOCKED: rows.filter(row => row.blocked).length,
  };
}

/**
 * Uma linha, na ordem do §4.
 *
 * Zero é informação: `SERP_COLLECTED = 0` na segunda execução é o resultado
 * que se quer ver. Por isso nenhum contador é omitido por ser zero.
 */
export function formatArticleRunReadout(readout: ArticleRunReadout): string {
  return [
    `ARTICLES_PROCESSED = ${readout.ARTICLES_PROCESSED}`,
    `SERP_COLLECTED = ${readout.SERP_COLLECTED}`,
    `SERP_REUSED = ${readout.SERP_REUSED}`,
    `FORMATIONS_CHANGED = ${readout.FORMATIONS_CHANGED}`,
    `FORMATIONS_UNCHANGED = ${readout.FORMATIONS_UNCHANGED}`,
    `READY_TO_CONCLUDE = ${readout.READY_TO_CONCLUDE}`,
    `BLOCKED = ${readout.BLOCKED}`,
  ].join(" · ");
}

/**
 * §10 — `BLOCKED = 5` não explica nada.
 *
 * O contador diz quantos, e a pessoa fica sem saber o quê. Cada linha já
 * carrega `decisionBasis` — a frase que o próprio gate formulou — e ela estava
 * sendo descartada na hora de montar a mensagem.
 *
 * O rótulo vem de fora porque este módulo não conhece keyword nem Article: ele
 * conhece `candidateRef`, e identificador cru não é linguagem de tela.
 */
export function formatArticleRunBlockers(
  rows: readonly ArticleRunRow[],
  labelOf: (articleId: string) => string = articleId => articleId,
): string {
  const bloqueados = rows.filter(row => row.blocked);
  if (!bloqueados.length) return "";
  return bloqueados
    .map(row => `${labelOf(row.articleId)}: ${row.decisionBasis}`)
    .join(" · ");
}

/**
 * O estado do gate da SERP, traduzido para os dois campos do §4.
 *
 * `stale` conta como SEM evidência de propósito: a evidência existe, mas é de
 * uma composição que não é mais esta. Chamá-la de reaproveitada faria a mesa
 * exibir `SERP_REUSED` para um artigo que ainda vai precisar coletar.
 */
function leituraDoEstado(state: string): { verdict: SerpVerdict; hasEvidence: boolean } {
  if (state === "current_supported") return { verdict: "SUPPORTED", hasEvidence: true };
  if (state.startsWith("current_divergent")) return { verdict: "DIVERGENCE", hasEvidence: true };
  if (state.startsWith("current_inconclusive")) return { verdict: "INCONCLUSIVE", hasEvidence: true };
  return { verdict: "NOT_RUN", hasEvidence: false };
}

export type ArticleGateReading = {
  candidateRef: string;
  state: string;
  blocksConclusion: boolean;
  /** A frase que o gate já formula para esta composição. */
  reason?: string | null;
};

/**
 * Monta as linhas da execução a partir do que o gate já sabe.
 *
 * `FORMATIONS_CHANGED` conta o que a execução propõe DIFERENTE do que já está
 * fechado: candidato sem ArticleDNA aprovado equivalente. Não é um diff de
 * conteúdo — é a contagem de quantos artigos, se concluídos agora, criariam
 * versão. O nome do contador não promete mais do que isso.
 */
export function articleRunRowsFromGates(input: {
  gates: readonly ArticleGateReading[];
  collectedInThisRun: ReadonlySet<string>;
  closedCandidateRefs: ReadonlySet<string>;
}): ArticleRunRow[] {
  return input.gates.map(gate => {
    const { verdict, hasEvidence } = leituraDoEstado(gate.state);
    return {
      articleId: gate.candidateRef,
      serpSource: serpSourceOf({
        candidateRef: gate.candidateRef,
        collectedInThisRun: input.collectedInThisRun,
        hasEvidence,
      }),
      serpVerdict: verdict,
      decisionBasis: gate.reason || SERP_VERDICT_LABELS[verdict],
      formationChanged: !input.closedCandidateRefs.has(gate.candidateRef),
      readyToConclude: !gate.blocksConclusion,
      blocked: gate.blocksConclusion,
    };
  });
}

/** A leitura por artigo, do §4: fonte, veredito e base da decisão. */
export function formatArticleSerpReadout(row: Pick<ArticleRunRow, "serpSource" | "serpVerdict" | "decisionBasis">): string {
  const source = row.serpSource ? SERP_SOURCE_LABELS[row.serpSource] : "Sem evidência";
  return `SERP_SOURCE = ${row.serpSource ?? "NONE"} (${source}) · SERP_VERDICT = ${row.serpVerdict} · DECISION_BASIS = ${row.decisionBasis}`;
}
