/**
 * O PROCESSADOR DO USUÁRIO ESTÁ LIGADO? — e a resposta honesta quando não dá
 * para saber.
 *
 * A arquitetura é: a Vercel serve a interface e ENFILEIRA; a máquina do usuário
 * PROCESSA. Entre as duas está o Supabase, que é a autoridade da fila. Como o
 * worker não avisa a tela que subiu, a presença dele tem de ser DEDUZIDA do que
 * a fila registra — e é aí que fica fácil mentir.
 *
 * O sinal de vida é o `heartbeat_at` de um job reivindicado: só um worker vivo
 * o atualiza. Um job em `PROCESSING` cujo heartbeat parou no tempo não prova
 * worker ligado — prova um lease que ainda não expirou, que é coisa diferente e
 * some sozinha.
 *
 * TRÊS ESTADOS, e o terceiro é o que costuma ser convertido em mentira:
 *
 *   CONNECTED            batimento recente: alguém está processando agora
 *   WAITING_FOR_WORKER   há trabalho parado e nenhum sinal de vida
 *   UNKNOWN              não há trabalho; nada permite afirmar nem negar
 *
 * Fila vazia é o estado normal de quem já terminou tudo. Dizer "desligado" ali
 * transformaria ausência de trabalho em suspeita de defeito — e dizer
 * "conectado" seria inventar um batimento que ninguém emitiu.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export const RADAR_USER_WORKER_STATES = ["CONNECTED", "WAITING_FOR_WORKER", "UNKNOWN"] as const;
export type RadarUserWorkerState = (typeof RADAR_USER_WORKER_STATES)[number];

/**
 * Quanto tempo um batimento continua valendo como sinal de vida.
 *
 * O runner bate a cada `lease/3` — com lease de 300s, a cada 100s. Duas
 * janelas de folga absorvem uma batida perdida sem declarar o worker morto na
 * primeira variação de rede.
 */
export const RADAR_USER_WORKER_HEARTBEAT_TTL_MS = 210_000;

export type RadarUserWorkerReading = {
  state: RadarUserWorkerState;
  /** A frase curta, para quem opera. */
  label: string;
  /** O que sustenta a frase. Nunca um número interno solto. */
  detail: string;
  queued: number;
  processing: number;
};

export function radarUserWorkerPresence(input: {
  /** Jobs esperando alguém reivindicar. */
  queued: number;
  /** Jobs reivindicados e em andamento. */
  processing: number;
  /** O batimento mais recente de qualquer job desta marca. */
  lastHeartbeatAt: string | null;
  now?: Date;
  heartbeatTtlMs?: number;
}): RadarUserWorkerReading {
  const agora = (input.now || new Date()).getTime();
  const ttl = input.heartbeatTtlMs ?? RADAR_USER_WORKER_HEARTBEAT_TTL_MS;
  const batimento = input.lastHeartbeatAt ? Date.parse(input.lastHeartbeatAt) : Number.NaN;
  const vivo = Number.isFinite(batimento) && agora - batimento <= ttl && agora - batimento >= -ttl;

  const fila = Math.max(0, input.queued);
  const andamento = Math.max(0, input.processing);
  const comum = { queued: fila, processing: andamento };

  if (vivo) {
    return {
      ...comum,
      state: "CONNECTED",
      label: "Worker conectado",
      detail: [
        andamento ? `${andamento} processando` : "nenhum job em andamento",
        fila ? `${fila} na fila` : "fila vazia",
      ].join(" · "),
    };
  }

  if (fila || andamento) {
    /*
     * TRABALHO PARADO NÃO É FALHA DA FONTE — §7.
     *
     * A fonte foi registrada, o texto foi pedido, o job existe. O que falta é
     * alguém do outro lado. Chamar isso de erro do vídeo mandaria a pessoa
     * mexer na fonte, que é o único lugar onde não há nada a corrigir.
     */
    return {
      ...comum,
      state: "WAITING_FOR_WORKER",
      label: "Aguardando processador do usuário",
      detail: [
        fila ? `${fila} na fila` : null,
        andamento ? `${andamento} reivindicado sem sinal de vida recente` : null,
        "inicie o worker na sua máquina com `pnpm run user-worker`",
      ].filter(Boolean).join(" · "),
    };
  }

  return {
    ...comum,
    state: "UNKNOWN",
    label: "Nenhum processamento pendente",
    detail: "Sem job na fila: não há como afirmar se o worker está ligado, e não é preciso.",
  };
}

/**
 * OS ESTADOS QUE UM WORKER AINDA PODE REIVINDICAR.
 *
 * Espelha o `WHERE` do `claim_external_processing_job`. Se um dia divergirem, a
 * tela passa a contar como "esperando worker" coisa que worker nenhum vai
 * buscar — e a pessoa fica olhando um aviso que nunca se resolve.
 */
export const RADAR_USER_WORKER_CLAIMABLE_STATUSES = ["RECEIVED", "PENDING_LOCAL_PROCESSING", "FAILED_RETRYABLE"] as const;

export type RadarUserWorkerJobRow = {
  status: string;
  attempts: number;
  maxAttempts: number;
  heartbeatAt: string | null;
};

/**
 * DE LINHAS DA FILA PARA OS TRÊS NÚMEROS QUE SUSTENTAM A FRASE.
 *
 * Duas regras, e as duas existem para não mentir:
 *
 * TENTATIVAS ESGOTADAS NÃO SÃO FILA. Um job `FAILED_RETRYABLE` que já gastou
 * `max_attempts` não é claimable: nenhum worker o buscará. Contá-lo como
 * "na fila" produziria um "aguardando processador" permanente, que ligar o
 * worker não apaga — o erro daquele job é do job, e aparece na fonte dele.
 *
 * BATIMENTO SÓ VALE DE JOB REIVINDICADO. `heartbeat_at` é zerado ao concluir e
 * ao falhar; ler o batimento de uma linha que não está em `PROCESSING` seria
 * aceitar resíduo como sinal de vida.
 */
export function radarSummarizeUserWorkerQueue(rows: RadarUserWorkerJobRow[]): { queued: number; processing: number; lastHeartbeatAt: string | null } {
  const claimaveis = new Set<string>(RADAR_USER_WORKER_CLAIMABLE_STATUSES);
  let queued = 0;
  let processing = 0;
  let batimento = Number.NEGATIVE_INFINITY;
  let ultimo: string | null = null;

  for (const linha of rows) {
    if (linha.status === "PROCESSING") {
      processing += 1;
      const instante = linha.heartbeatAt ? Date.parse(linha.heartbeatAt) : Number.NaN;
      if (Number.isFinite(instante) && instante > batimento) {
        batimento = instante;
        ultimo = linha.heartbeatAt;
      }
      continue;
    }
    if (claimaveis.has(linha.status) && linha.attempts < linha.maxAttempts) queued += 1;
  }

  return { queued, processing, lastHeartbeatAt: ultimo };
}
