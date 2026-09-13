import "server-only";

import { runLocalWorkerOnce, type ExternalProcessingJob, type LocalWorkerProcessor, type WorkerClient } from "./runner";

/**
 * O WORKER LOCAL COMO SERVIÇO — e não como um segundo worker.
 *
 * Até aqui o Local Worker era `run-once`: uma execução, um job. Quem operava
 * precisava rodar o comando de novo para cada fonte de vídeo, e o smoke do
 * VIDEOS_2.4 parou justamente aí — job `QUEUED` esperando alguém lembrar de
 * chamar o processo outra vez.
 *
 * ESTE MÓDULO NÃO É UM RUNNER NOVO. Ele é um laço em volta do runner que já
 * existe: `runLocalWorkerOnce` continua sendo quem reivindica, processa,
 * mantém o lease, aplica writeback, encadeia follow-ups e completa. Claim,
 * lease, heartbeat, retry/backoff, roteamento por `job_kind`, service-role e
 * isolamento por marca continuam exatamente onde estavam — nenhum deles é
 * reimplementado aqui, e é por isso que o comportamento contínuo não pode
 * divergir do comportamento de uma execução.
 *
 * O que este arquivo acrescenta é apenas a decisão de CONTINUAR: quando parar,
 * quando esperar, e quando não esperar.
 *
 * Tudo o que toca tempo ou rede é injetável, para o teste dirigir o laço sem
 * relógio real e sem provider.
 */

export type LocalWorkerCycleStatus = Awaited<ReturnType<typeof runLocalWorkerOnce>>["status"];

export type LocalWorkerLoopReport = {
  cycles: number;
  processed: number;
  failed: number;
  idle: number;
  /** Por que o laço terminou. Hoje só existe uma saída: o pedido de parada. */
  stoppedBy: "SIGNAL";
};

/**
 * Quanto esperar quando NÃO há job.
 *
 * Fila vazia é o estado normal de um worker: ele passa a maior parte do tempo
 * sem nada a fazer. Voltar imediatamente ao claim transformaria "aguardar
 * trabalho" em queimar CPU contra o banco.
 */
export const LOCAL_WORKER_IDLE_DELAY_MS = 4_000;

/**
 * Quanto esperar depois de um job que falhou.
 *
 * O backoff real vive no runner: `failExternalProcessingJob` empurra
 * `available_at` para frente, e o claim seguinte simplesmente não enxerga o
 * job. Esta pausa NÃO substitui aquilo — ela é um freio contra o caso
 * patológico em que um job volta a ser reivindicável de imediato. Sem ela, um
 * defeito no backoff viraria laço apertado; com ela, vira lentidão visível.
 */
export const LOCAL_WORKER_FAILURE_DELAY_MS = 1_000;

const dormir = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function runLocalWorkerContinuously(input: {
  workerId: string;
  processor: LocalWorkerProcessor;
  client?: WorkerClient;
  /**
   * O pedido de parada. `SIGINT`/`SIGTERM` o disparam no script.
   *
   * Ele é consultado ANTES de cada claim: quem já está no meio de um job
   * termina o job. Abortar no meio devolveria a fonte ao limbo com o lease
   * ainda válido — o worker ficaria de fora e ninguém mais poderia
   * reivindicá-la até o lease expirar.
   */
  signal?: { readonly aborted: boolean };
  idleDelayMs?: number;
  failureDelayMs?: number;
  /** Injetáveis: o teste dirige o laço sem timer real e sem tocar no banco. */
  runOnce?: typeof runLocalWorkerOnce;
  sleep?: (ms: number) => Promise<void>;
  /** Um relatório por volta, para quem opera ver o serviço vivo. */
  onCycle?: (info: { status: LocalWorkerCycleStatus; job: ExternalProcessingJob | null; cycle: number }) => void;
}): Promise<LocalWorkerLoopReport> {
  const executar = input.runOnce || runLocalWorkerOnce;
  const esperar = input.sleep || dormir;
  const esperaOciosa = input.idleDelayMs ?? LOCAL_WORKER_IDLE_DELAY_MS;
  const esperaDeFalha = input.failureDelayMs ?? LOCAL_WORKER_FAILURE_DELAY_MS;

  const relatorio: LocalWorkerLoopReport = { cycles: 0, processed: 0, failed: 0, idle: 0, stoppedBy: "SIGNAL" };

  while (!input.signal?.aborted) {
    const resultado = await executar({ workerId: input.workerId, processor: input.processor, client: input.client });
    relatorio.cycles += 1;
    input.onCycle?.({ status: resultado.status, job: resultado.job, cycle: relatorio.cycles });

    if (resultado.status === "PROCESSED") relatorio.processed += 1;
    if (resultado.status === "FAILED") relatorio.failed += 1;
    if (resultado.status === "EMPTY") relatorio.idle += 1;

    /*
     * TRABALHO FEITO, PRÓXIMO IMEDIATAMENTE.
     *
     * Depois de processar um job, voltar já ao claim é o que esvazia a fila:
     * três fontes de vídeo enfileiradas são três voltas seguidas, sem espera
     * entre elas. A pausa existe só quando não há o que fazer.
     *
     * E a parada é conferida de novo aqui: quem pediu SIGINT durante o job não
     * espera o ciclo ocioso inteiro para o processo encerrar.
     */
    if (input.signal?.aborted) break;
    if (resultado.status === "EMPTY") await esperar(esperaOciosa);
    else if (resultado.status === "FAILED") await esperar(esperaDeFalha);
  }

  return relatorio;
}
