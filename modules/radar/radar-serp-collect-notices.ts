import type { SerpCollectionRecord, SerpReviewRecord } from "@/lib/editorial/contracts";
import type { RadarSerpCollectOutcome } from "@/lib/radar/serp/request";
import type { RadarR4SerpQueueState } from "@/lib/radar/r4-queue";
import { deriveRadarR5PersistedSerpState } from "@/lib/radar/r5-sequential";
import { RADAR_SERP_RECOLLECT_CALLS } from "@/lib/radar/serp/lens-set";

/**
 * O QUE A TELA DIZ DEPOIS DE UMA COLETA DA SERP — adendo R2, §10 (achado 5).
 *
 * Desde as quatro lentes, "Atualizar SERP" é cache primeiro e pode voltar SEM
 * MUDANÇA: a rota devolve o registro já gravado e nenhuma versão é aberta. Os
 * avisos "SERP real vN coletada" e o estado "aguardando revisão" eram escritos
 * sem olhar o resultado — um clique que não pagou nada e não mudou nada
 * anunciava uma versão nova e reabria a revisão de uma SERP já revisada.
 *
 * Aqui a frase e o estado local saem do que a coleta RESPONDEU (`onOutcome`).
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarSerpCollectStatus = "WAITING_REVIEW" | "UNCHANGED" | "FAILED_RETRYABLE" | "FAILED_FINAL";

export type RadarSerpCollectReading = {
  status: "WAITING_REVIEW" | "UNCHANGED";
  unchanged: boolean;
  /** O estado da fila local da SERP depois da coleta. */
  serpState: Extract<RadarR4SerpQueueState, "WAITING_REVIEW" | "COMPLETED">;
  serpError: string | null;
  /** Chamadas pagas nesta coleta; nulo quando a resposta não informou. */
  paidCalls: number | null;
  notice: string;
};

function frasesDoCusto(outcome: RadarSerpCollectOutcome | null): string[] {
  if (!outcome || outcome.paidCalls === null) return [];
  const frases = [outcome.paidCalls === 0
    ? "Nenhuma chamada DataForSEO paga: as lentes vieram do cache."
    : `${outcome.paidCalls} chamada(s) DataForSEO paga(s).`];
  if (outcome.cacheReadFailed) frases.push("O cache estava indisponível: as lentes foram pagas sem consultar o que já existia.");
  if (outcome.reusedLensGaps) frases.push(`${outcome.reusedLensGaps} lacuna(s) definitiva(s) de lente mantida(s) sem nova chamada.`);
  return frases;
}

function lentesDaResposta(outcome: RadarSerpCollectOutcome | null): string {
  if (!outcome || outcome.observedLenses === null || outcome.totalLenses === null) return "";
  return ` · ${outcome.observedLenses} de ${outcome.totalLenses} lentes`;
}

/**
 * A leitura de UMA coleta canônica: frase, estado local e custo.
 *
 * Sem mudança, o estado volta a ser o do snapshot gravado — revisado continua
 * revisado — e a frase diz que nenhuma versão foi aberta. Resposta de servidor
 * anterior às lentes (`outcome` nulo) segue como coleta nova, que é o que ela era.
 */
export function radarSerpCollectReading(input: {
  record: SerpCollectionRecord;
  outcome: RadarSerpCollectOutcome | null;
  reviews: readonly SerpReviewRecord[];
  recollect?: boolean;
}): RadarSerpCollectReading {
  const versao = input.record.research?.version || 1;
  const resultados = input.record.research?.organicResults.length || 0;
  const custo = frasesDoCusto(input.outcome);
  const lentes = lentesDaResposta(input.outcome);

  if (input.outcome?.unchanged) {
    const gravado = deriveRadarR5PersistedSerpState({ articleId: input.record.input.articleId, records: [input.record], reviews: [...input.reviews] });
    const revisada = gravado.state === "COMPLETED";
    const rejeitada = revisada && gravado.error !== null;
    return {
      status: "UNCHANGED",
      unchanged: true,
      serpState: revisada ? "COMPLETED" : "WAITING_REVIEW",
      serpError: rejeitada ? gravado.error : null,
      paidCalls: input.outcome.paidCalls,
      notice: [
        `A SERP não mudou${input.recollect ? " na recoleta paga" : ""}: continua valendo a v${versao} já gravada (${resultados} resultado(s)${lentes}). Nenhuma versão nova foi aberta.`,
        rejeitada ? "A revisão que rejeitou esta SERP continua valendo para o mesmo conteúdo." : "",
        ...custo,
      ].filter(Boolean).join(" "),
    };
  }

  return {
    status: "WAITING_REVIEW",
    unchanged: false,
    serpState: "WAITING_REVIEW",
    serpError: null,
    paidCalls: input.outcome?.paidCalls ?? null,
    notice: [
      `SERP real v${versao} coletada: ${resultados} resultado(s)${lentes}.`,
      ...custo,
      input.record.persistenceMode === "remote" ? "Persistência remota confirmada." : "Coleta concluída, mas a persistência remota não foi confirmada.",
    ].join(" "),
  };
}

/* ------------------------------- o lote ------------------------------- */

export type RadarSerpBatchMode = "default" | "explicit_refresh";

/**
 * O LOTE É CACHE PRIMEIRO — e diz isso antes de começar.
 *
 * O "refresh explícito" em lote não passa `recollect`: ele relê as quatro
 * lentes e paga só as que faltam. Pagar de novo o que está válido no cache é
 * "Recoletar agora (pago)", um artigo por vez e com confirmação.
 */
export function radarSerpBatchStartNotice(input: { mode: RadarSerpBatchMode; articles: number }): string {
  const teto = input.articles * RADAR_SERP_RECOLLECT_CALLS;
  const custo = `Cache primeiro: lente válida no cache não é paga, só as que faltam — no pior caso, até ${teto} chamada(s) DataForSEO (${RADAR_SERP_RECOLLECT_CALLS} por artigo).`;
  return input.mode === "explicit_refresh"
    ? `Atualização (cache primeiro) iniciada para ${input.articles} artigo(s). ${custo} Para pagar de novo uma SERP válida, use "Recoletar agora (pago)" na SERP do artigo.`
    : `Lote SERP iniciado para ${input.articles} artigo(s), em sequência. ${custo}`;
}

export type RadarSerpBatchTally = {
  waitingReview: number;
  unchanged: number;
  failedRetryable: number;
  failedFinal: number;
  paidCalls: number;
  /** Coletas bem-sucedidas cuja resposta não disse quantas chamadas pagou. */
  paidCallsUnknown: number;
};

export const emptyRadarSerpBatchTally = (): RadarSerpBatchTally => ({ waitingReview: 0, unchanged: 0, failedRetryable: 0, failedFinal: 0, paidCalls: 0, paidCallsUnknown: 0 });

export function tallyRadarSerpBatch(tally: RadarSerpBatchTally, status: RadarSerpCollectStatus, paidCalls: number | null): RadarSerpBatchTally {
  const proximo = { ...tally };
  if (status === "WAITING_REVIEW") proximo.waitingReview += 1;
  if (status === "UNCHANGED") proximo.unchanged += 1;
  if (status === "FAILED_RETRYABLE") proximo.failedRetryable += 1;
  if (status === "FAILED_FINAL") proximo.failedFinal += 1;
  if (status === "WAITING_REVIEW" || status === "UNCHANGED") {
    if (paidCalls === null) proximo.paidCallsUnknown += 1;
    else proximo.paidCalls += paidCalls;
  }
  return proximo;
}

/** O estado do item na fila: sem mudança não reabre revisão — fica o do snapshot gravado. */
export function radarSerpBatchQueueState(status: RadarSerpCollectStatus, unchangedState: RadarSerpCollectReading["serpState"] | null): RadarR4SerpQueueState {
  return status === "UNCHANGED" ? unchangedState || "COMPLETED" : status;
}

export function radarSerpBatchSummary(tally: RadarSerpBatchTally): string {
  const custo = tally.paidCallsUnknown
    ? `Chamadas DataForSEO pagas: ${tally.paidCalls} informada(s); ${tally.paidCallsUnknown} coleta(s) não informaram o número.`
    : `Chamadas DataForSEO pagas: ${tally.paidCalls}.`;
  return `Lote SERP concluído: ${tally.waitingReview} com versão nova aguardando revisão, ${tally.unchanged} sem mudança (nenhuma versão nova), ${tally.failedRetryable} retry disponível e ${tally.failedFinal} falha(s) final(is). ${custo}`;
}

/**
 * O TETO VAI NO PRÓPRIO BOTÃO DO LOTE — AGENTS §7: o número de chamadas antes.
 *
 * O aviso de início sai no mesmo clique que já começa a pagar; quem decide
 * precisa ver o pior caso ANTES de clicar.
 */
export function radarSerpBatchButtonLabel(label: string, articles: number): string {
  return `${label} (${articles} · até ${articles * RADAR_SERP_RECOLLECT_CALLS} chamadas)`;
}

/**
 * O START SOBRE UMA SERP QUE A REVISÃO REJEITOU — adendo R2, risco 2.
 *
 * "Sem mudança" devolve o snapshot gravado, inclusive rejeitado. A investigação
 * pode seguir sobre ele, mas não em silêncio: a frase acompanha o aviso final.
 */
export function radarStartOnRejectedSerpWarning(reading: RadarSerpCollectReading | null | undefined): string | null {
  return reading?.unchanged && reading.serpError
    ? "Atenção: a SERP canônica não mudou e continua rejeitada na revisão — esta investigação usou o mesmo conteúdo rejeitado. Revise a SERP de novo ou use \"Recoletar agora (pago)\" na SERP do artigo."
    : null;
}

/* ----------------------------- o FINALIZE ----------------------------- */

/**
 * O HASH DA MENSAGEM DO FINALIZE É O GRAVADO — adendo R1, risco 1; R3, risco 4.
 *
 * O servidor carimba o standing (R1) e as lentes (R3) no bundle ao congelar e
 * recalcula o `bundleHash`. O hash que o navegador calculou antes de gravar
 * descreve um bundle que NÃO existe no banco. A frase espera o readback — a
 * versão relida que o save põe no workspace — e lê o hash dela.
 */
export type RadarFinalizeReadbackWatch = { articleId: string; versionId: string; sufficiencyLabel: string };

type BundleGravado = { bundleId: string; bundleHash: string } | null | undefined;

export function radarFinalizeSuccessMessage(input: { sufficiencyLabel: string; stored: BundleGravado }): string {
  return input.stored
    ? `Investigação finalizada e congelada: ${input.sufficiencyLabel}. Evidências ${input.stored.bundleId} · hash ${input.stored.bundleHash} (o gravado no servidor). Persistência remota e readback confirmados.`
    : `Investigação finalizada e congelada: ${input.sufficiencyLabel}. Persistência remota e readback confirmados.`;
}

/**
 * A frase com o hash do READBACK, quando a versão relida já está no workspace.
 * Nulo enquanto ela não chegou — quem chama continua esperando.
 */
export function radarFinalizeReadbackNotice(
  watch: RadarFinalizeReadbackWatch,
  radarItems: ReadonlyArray<{ articleId: string; analysisVersions: ReadonlyArray<{ versionId: string; payload: { finalizedBundle?: BundleGravado } }> }>,
): string | null {
  const versao = radarItems
    .find(item => item.articleId === watch.articleId)
    ?.analysisVersions.find(item => item.versionId === watch.versionId);
  if (!versao) return null;
  const gravado = versao.payload.finalizedBundle;
  return gravado
    ? radarFinalizeSuccessMessage({ sufficiencyLabel: watch.sufficiencyLabel, stored: gravado })
    : `Investigação finalizada: ${watch.sufficiencyLabel}. Persistência remota e readback confirmados, mas a versão relida não trouxe o pacote congelado — confira em "Proveniência e detalhes técnicos".`;
}
