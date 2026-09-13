/**
 * A RETOMADA DA PESQUISA — IDENTIDADE POR CONSULTA, NÃO "ALGUMA SERP EXISTE".
 *
 * O Gate 18.8 devolveu à tela uma SERP canônica que já estava paga e gravada.
 * Devolveu só isso: o registro da investigação vive no payload da versão de
 * análise, e sem ele `radarDeepResearchState` responde `NOT_STARTED` — a
 * contradição que o USER viu (snapshot v8 recuperado, card "Não iniciado").
 *
 * Materializar o snapshot resolve metade. A outra metade é saber O QUE FALTA:
 * o plano deste artigo tem uma consulta canônica e três auxiliares, e tratar
 * "existe SERP" como "o START rodou" faria a tela prometer um universo
 * competitivo que nunca foi montado.
 *
 * Por isso esta autoridade responde por CONSULTA, e distingue três coisas que
 * um booleano colapsaria:
 *
 *   PENDENTE   nunca tentada — `PLANNED`
 *   FALHADA    tentada e sem evidência — `NOT_EXECUTED` com disposição EXECUTE
 *   DISPENSADA decidida fora da coleta — disposição ≠ EXECUTE (contexto,
 *              reaproveitamento da SERP de formação, não executável)
 *
 * A diferença entre as duas primeiras não é acadêmica: se "falhada" contasse
 * como pendente, uma keyword que o provider recusa por motivo permanente
 * manteria o botão preso em "Completar pesquisa" para sempre. E se ela não
 * pudesse ser recoletada, um erro de rede apagaria a consulta em silêncio.
 * Então: a retomada COLETA as duas; o CTA só é governado pelas pendentes.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarDeepResearchQuery, RadarDeepResearchRecord } from "./deep-research.ts";

export type RadarResearchResumptionState =
  /** Nenhum registro: a pesquisa nunca começou. */
  | "NO_RECORD"
  /** Há registro, mas a SERP do artigo não tem evidência. */
  | "CANONICAL_MISSING"
  /** A canônica está pronta e ainda há auxiliar a coletar. */
  | "AUXILIARY_PENDING"
  /** Nada a coletar: o que existe é o que a pesquisa conseguiu. */
  | "ALL_QUERIES_SETTLED";

export type RadarResearchResumption = {
  state: RadarResearchResumptionState;
  /** A canônica tem evidência gravada? `EXECUTED` sem evidência não conta. */
  canonicalComplete: boolean;
  canonicalQuery: RadarDeepResearchQuery | null;
  /** O snapshot que responde pela canônica, quando existe. */
  canonicalSnapshotId: string | null;
  /** Todas as auxiliares que o plano mandou executar. */
  auxiliaryTotal: number;
  /** Auxiliares com evidência gravada. */
  auxiliaryExecuted: number;
  /** Nunca tentadas. São elas que governam o CTA. */
  auxiliaryPending: RadarDeepResearchQuery[];
  /** Tentadas e sem evidência. Aparecem no motivo; não prendem o CTA. */
  auxiliaryFailed: RadarDeepResearchQuery[];
  /** O que a retomada deve coletar: pendentes primeiro, falhadas depois. */
  auxiliaryToCollect: RadarDeepResearchQuery[];
};

const SEM_REGISTRO: RadarResearchResumption = {
  state: "NO_RECORD",
  canonicalComplete: false,
  canonicalQuery: null,
  canonicalSnapshotId: null,
  auxiliaryTotal: 0,
  auxiliaryExecuted: 0,
  auxiliaryPending: [],
  auxiliaryFailed: [],
  auxiliaryToCollect: [],
};

export function radarResearchResumption(input: { record: RadarDeepResearchRecord | null }): RadarResearchResumption {
  const record = input.record;
  if (!record) return SEM_REGISTRO;

  const canonicalQuery = record.queries.find(query => query.serpClass === "canonical") || null;
  /*
   * EVIDÊNCIA, NÃO CARIMBO.
   *
   * `execution: "EXECUTED"` é o que a rodada escreveu; `evidence` é o que ela
   * conseguiu provar. Reaproveitar a canônica com base no carimbo faria a
   * retomada pular uma coleta que nunca produziu resultado — e seguir com um
   * universo sem a SERP do artigo dentro.
   */
  const canonicalComplete = Boolean(canonicalQuery?.evidence);

  const auxiliares = record.queries.filter(query => query.serpClass === "auxiliary");
  /* Dispensada é decisão do plano, não ausência: ela não volta para a fila. */
  const executaveis = auxiliares.filter(query => query.disposition === "EXECUTE");
  const comEvidencia = executaveis.filter(query => Boolean(query.evidence));
  const auxiliaryPending = executaveis.filter(query => !query.evidence && query.execution === "PLANNED");
  const auxiliaryFailed = executaveis.filter(query => !query.evidence && query.execution !== "PLANNED");

  const state: RadarResearchResumptionState = !canonicalComplete
    ? "CANONICAL_MISSING"
    : auxiliaryPending.length || auxiliaryFailed.length
      ? "AUXILIARY_PENDING"
      : "ALL_QUERIES_SETTLED";

  return {
    state,
    canonicalComplete,
    canonicalQuery,
    canonicalSnapshotId: canonicalQuery?.evidence?.snapshotId || null,
    auxiliaryTotal: executaveis.length,
    auxiliaryExecuted: comEvidencia.length,
    auxiliaryPending,
    auxiliaryFailed,
    auxiliaryToCollect: [...auxiliaryPending, ...auxiliaryFailed],
  };
}

/**
 * A DECISÃO QUE IMPEDE PAGAR DUAS VEZES PELA MESMA SERP — §4 e §12.
 *
 * Ela vive aqui, e não dentro do handler, porque é a única linha do fluxo que
 * separa "retomar" de "recoletar". Enterrada num `if` da tela, ela só seria
 * verificável depois da fatura; como dado de domínio, um teste a exercita sem
 * tocar em provider nenhum.
 *
 * As três condições são conjuntas de propósito:
 *
 *   canonicalComplete    a consulta central tem EVIDÊNCIA gravada
 *   hasPersistedRecord   existe registro a preservar — sem ele, reaproveitar
 *                        obrigaria a inventar um, e o novo nasceria com todas
 *                        as auxiliares PLANNED, perdendo o que já foi pago
 *   hasCanonicalSnapshot o snapshot está em mãos para virar insumo da versão
 *
 * Faltando qualquer uma, a canônica é coletada — porque o contrário seria
 * seguir com um universo competitivo sem a SERP do artigo dentro.
 */
export function radarCanonicalReusePlan(input: {
  resumption: Pick<RadarResearchResumption, "canonicalComplete">;
  hasPersistedRecord: boolean;
  hasCanonicalSnapshot: boolean;
}): { reuse: boolean; reason: string } {
  if (!input.resumption.canonicalComplete) {
    return { reuse: false, reason: "A consulta central ainda não tem evidência gravada; a SERP do artigo precisa ser coletada." };
  }
  if (!input.hasPersistedRecord) {
    return { reuse: false, reason: "Não há registro de investigação a preservar; recomeçar apagaria as auxiliares já executadas." };
  }
  if (!input.hasCanonicalSnapshot) {
    return { reuse: false, reason: "O snapshot da SERP canônica não está disponível nesta tela para alimentar a versão." };
  }
  return { reuse: true, reason: "A SERP canônica já está paga e gravada: ela é reaproveitada e o provider não é consultado para a principal." };
}

/**
 * A frase que o CTA e o card usam para dizer o que falta.
 *
 * Sem número fixo: o plano varia por artigo, e prometer "3 auxiliares" num
 * artigo que planeja 5 seria mentira com aparência de precisão.
 */
export function radarResumptionHint(resumo: RadarResearchResumption): string | null {
  if (resumo.state !== "AUXILIARY_PENDING") return null;
  const partes = ["SERP principal já coletada"];
  if (resumo.auxiliaryPending.length) partes.push(`${resumo.auxiliaryPending.length} consulta(s) auxiliar(es) ainda não executada(s)`);
  if (resumo.auxiliaryFailed.length) partes.push(`${resumo.auxiliaryFailed.length} sem resultado na tentativa anterior`);
  return partes.join(" · ");
}
