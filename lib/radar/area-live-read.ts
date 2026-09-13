/**
 * A LEITURA VIVA DE UMA ÁREA DO RADAR — a política, sem React e sem rede.
 *
 * ========================= O PROBLEMA QUE RESOLVE =========================
 *
 * Uma resposta que chega pelo Telegram precisa aparecer na tela aberta. O jeito
 * errado é o óbvio: assinar `postgres_changes` e montar o objeto editorial a
 * partir do payload do evento. Isso faria o Realtime virar autoridade sobre o
 * que o artigo diz — e um INSERT bruto não sabe de projeção, de permissão, nem
 * das regras que o read-model aplica.
 *
 * AQUI O EVENTO É SÓ UM SINAL:
 *
 *   evento (realtime ou tique do fallback)
 *     → coalescing
 *     → refetch do read-model canônico
 *     → a UI troca de dado
 *
 * A autoridade continua sendo o read-model remoto, exatamente como no F5.
 *
 * ===================== POR QUE FALLBACK, E NÃO CERTEZA =====================
 *
 * Não dá para saber por leitura se uma tabela está na publication
 * `supabase_realtime`: o PostgREST não expõe metadados do Postgres. Em vez de
 * travar o produto esperando alguém confirmar, a assinatura é TENTADA e o seu
 * resultado observado — `CHANNEL_ERROR`, `TIMED_OUT` ou silêncio viram o mesmo
 * veredito: esta área não tem sinal vivo, então ela se atualiza por tique.
 *
 * O polling é SEMPRE da área, nunca do workspace: recarregar 6 MB de contexto
 * a cada poucos segundos trocaria um problema de atualização por um de custo.
 *
 * Domínio puro: sem fetch, sem storage, sem React, sem provider.
 */

/* ============================== as áreas ============================== */

export const RADAR_LIVE_AREAS = ["research", "videos", "specialist", "report"] as const;
export type RadarLiveArea = typeof RADAR_LIVE_AREAS[number];

/**
 * A CHAVE DE CACHE INCLUI A VERSÃO DO ArticleDNA — e isso não é detalhe.
 *
 * Sem ela, aprovar uma versão nova mostraria o read-model da anterior como se
 * fosse o atual: mesmo artigo, outro contrato editorial. O gate é explícito —
 * "nunca exibir dados do artigo anterior como se fossem do novo" — e a versão é
 * a metade da identidade que muda sem o artigo mudar.
 */
export function radarAreaCacheKey(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  area: RadarLiveArea;
}): string {
  return [input.brandId, input.articleId, input.articleDnaVersionId, input.area].join(":");
}

/* ========================= o estado do sinal ========================= */

export const RADAR_LIVE_SIGNAL_STATES = ["CONNECTING", "LIVE", "UNAVAILABLE"] as const;
export type RadarLiveSignalState = typeof RADAR_LIVE_SIGNAL_STATES[number];

/**
 * O QUE O SUPABASE DIZ, TRADUZIDO PARA O QUE IMPORTA.
 *
 * `CLOSED` merece atenção: ele acontece tanto num encerramento normal quanto
 * numa queda. Tratá-lo como indisponível é a leitura segura — uma área que se
 * atualiza por tique funciona; uma que acha que tem sinal vivo e não tem fica
 * parada, e o operador só descobre quando percebe que nada mudou.
 */
export function radarLiveSignalFromSubscription(status: string): RadarLiveSignalState {
  if (status === "SUBSCRIBED") return "LIVE";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") return "UNAVAILABLE";
  return "CONNECTING";
}

/* ========================= a política de tique ======================== */

/** Trabalho que a UI espera terminar: enquanto houver, vale olhar mais de perto. */
export type RadarAreaActivity = {
  /** A área está expandida na tela. */
  open: boolean;
  /** Há algo em curso — envio aguardando resposta, job na fila, worker rodando. */
  pending: boolean;
};

export type RadarAreaPollingPlan = {
  shouldPoll: boolean;
  intervalMs: number;
  reason: "LIVE_SIGNAL" | "HIDDEN" | "IDLE" | "PENDING_WORK" | "AREA_OPEN";
};

/**
 * ~3 s enquanto há trabalho em curso; ~10 s quando a área só está aberta.
 *
 * O gate pede 3–5 s, e é o que vale para o caso que alguém está esperando: uma
 * resposta que chega, um transcript que fica pronto. Manter esse ritmo para uma
 * área aberta e estável seria pagar vinte leituras por minuto para descobrir
 * que nada mudou.
 */
export const RADAR_AREA_POLL_PENDING_MS = 3_000;
export const RADAR_AREA_POLL_OPEN_MS = 10_000;

/**
 * QUANDO VALE PERGUNTAR DE NOVO — e quando é desperdício.
 *
 * A ordem das recusas é a ordem do custo. Sinal vivo dispensa tique: o servidor
 * avisa. Aba escondida não tem ninguém olhando, e o gate manda pausar. Só então
 * a pergunta real: há trabalho pendente, ou pelo menos alguém com a área aberta?
 */
export function radarAreaPollingPlan(input: {
  signal: RadarLiveSignalState;
  activity: RadarAreaActivity;
  visible: boolean;
}): RadarAreaPollingPlan {
  if (input.signal === "LIVE") return { shouldPoll: false, intervalMs: 0, reason: "LIVE_SIGNAL" };
  if (!input.visible) return { shouldPoll: false, intervalMs: 0, reason: "HIDDEN" };
  if (input.activity.pending) return { shouldPoll: true, intervalMs: RADAR_AREA_POLL_PENDING_MS, reason: "PENDING_WORK" };
  if (input.activity.open) return { shouldPoll: true, intervalMs: RADAR_AREA_POLL_OPEN_MS, reason: "AREA_OPEN" };
  return { shouldPoll: false, intervalMs: 0, reason: "IDLE" };
}

/**
 * VOLTAR PARA A ABA MERECE UMA LEITURA — uma só.
 *
 * Enquanto a aba esteve escondida o tique estava parado, e o que mudou no banco
 * não chegou. Revalidar na volta é o que impede a tela de exibir, com toda a
 * confiança, um estado de dez minutos atrás.
 */
export function radarAreaShouldRevalidateOnVisible(input: {
  becameVisible: boolean;
  hasCachedValue: boolean;
}): boolean {
  return input.becameVisible && input.hasCachedValue;
}

/* ====================== o coalescing dos sinais ====================== */

export const RADAR_AREA_SIGNAL_DEBOUNCE_MS = 250;

/**
 * MUITOS EVENTOS PRÓXIMOS VIRAM UMA LEITURA.
 *
 * Uma contribuição de áudio produz vários eventos em sequência — a contribuição
 * entra, a pauta muda de estado, o job de mídia é enfileirado. Refazer a leitura
 * a cada um deles seria três leituras para mostrar uma resposta.
 *
 * Puro de propósito: recebe os instantes e devolve a decisão, para o teste poder
 * exercer a janela sem depender de temporizador real.
 */
export function radarAreaShouldCoalesce(input: {
  lastSignalAt: number | null;
  now: number;
  debounceMs?: number;
}): boolean {
  if (input.lastSignalAt === null) return false;
  return input.now - input.lastSignalAt < (input.debounceMs ?? RADAR_AREA_SIGNAL_DEBOUNCE_MS);
}

/* ==================== o cache em memória da sessão =================== */

export type RadarAreaCacheEntry<T> = {
  value: T;
  loadedAt: number;
  /** `true` enquanto uma revalidação em segundo plano está em curso. */
  revalidating: boolean;
};

/**
 * UM MAPA, E NENHUMA BIBLIOTECA.
 *
 * O gate pede cache de sessão sem peso extra. O que se quer é: reabrir uma área
 * e ver o que já se sabia, enquanto a leitura nova acontece por trás. Isso é um
 * `Map` com uma chave bem escolhida — a chave é a parte difícil, não a estrutura.
 *
 * Sem TTL de propósito: a invalidação aqui é por EVENTO (sinal, gravação local,
 * troca de artigo), não por relógio. Um tempo de validade inventado ou expira
 * cedo demais e recarrega à toa, ou tarde demais e mostra o que já mudou.
 */
export function createRadarAreaCache<T>() {
  const entradas = new Map<string, RadarAreaCacheEntry<T>>();

  return {
    get(key: string): RadarAreaCacheEntry<T> | null {
      return entradas.get(key) || null;
    },
    set(key: string, value: T, now: number): RadarAreaCacheEntry<T> {
      const entrada = { value, loadedAt: now, revalidating: false };
      entradas.set(key, entrada);
      return entrada;
    },
    markRevalidating(key: string, revalidating: boolean): void {
      const atual = entradas.get(key);
      if (atual) entradas.set(key, { ...atual, revalidating });
    },
    invalidate(key: string): void {
      entradas.delete(key);
    },
    /**
     * Ao trocar de artigo ou de versão, o que era de outro contexto sai.
     *
     * Sem isto, a memória cresceria com todo artigo já visitado na sessão — e,
     * pior, uma chave montada errado em algum lugar futuro poderia devolver o
     * read-model do artigo anterior.
     */
    invalidatePrefix(prefix: string): void {
      for (const chave of [...entradas.keys()]) {
        if (chave.startsWith(prefix)) entradas.delete(chave);
      }
    },
    size(): number {
      return entradas.size;
    },
  };
}
