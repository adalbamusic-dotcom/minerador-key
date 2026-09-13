"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  createRadarAreaCache,
  radarAreaCacheKey,
  radarAreaPollingPlan,
  radarAreaShouldCoalesce,
  radarLiveSignalFromSubscription,
  type RadarLiveArea,
  type RadarLiveSignalState,
} from "@/lib/radar/area-live-read";

/**
 * A LEITURA VIVA DE UMA ÁREA — uma abstração, dois caminhos de sinal.
 *
 * O Realtime é a fonte PREFERIDA de sinal; o tique é o que acontece quando ele
 * não está disponível. Os dois terminam no mesmo lugar: uma releitura do
 * read-model canônico da área. A política de quando cada um roda vive em
 * `lib/radar/area-live-read.ts`, testável sem React e sem rede.
 *
 * O QUE ESTE HOOK NUNCA FAZ: montar estado editorial a partir do payload de um
 * evento, e recarregar o workspace. Ele lê UMA área, e só.
 */

/** O cache é do módulo: sobrevive a desmontagens dentro da mesma sessão. */
const cache = createRadarAreaCache<unknown>();

type EstadoDaLeitura<T> = {
  /** A chave a que este estado pertence. Estado de outra chave não é exibido. */
  key: string;
  value: T | null;
  loading: boolean;
  revalidating: boolean;
  error: string | null;
};

export type RadarAreaLiveRead<T> = {
  data: T | null;
  /** Primeira leitura desta chave, sem nada em cache para mostrar. */
  loading: boolean;
  /** Releitura com dado antigo ainda na tela. Não apaga o que já é válido. */
  revalidating: boolean;
  error: string | null;
  signal: RadarLiveSignalState;
  /** O [Atualizar] da área. Nunca recarrega nada além dela. */
  refresh: () => void;
};

export function useRadarAreaLiveRead<T>(input: {
  area: RadarLiveArea;
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  /** As tabelas cujo INSERT/UPDATE significa "esta área mudou". */
  tables: readonly string[];
  /** O read-model canônico. É ele que decide o que a área diz. */
  load: (signal: AbortSignal) => Promise<T>;
  /** A área está expandida. */
  open: boolean;
  /**
   * Há operação em curso que a tela espera terminar.
   *
   * É uma FUNÇÃO porque quem sabe a resposta é a própria área — e ela só
   * descobre depois de ler. Recebida como valor, criaria a dependência
   * circular leitura → estado → leitura; lida aqui dentro, no momento de
   * agendar o tique, o ciclo não existe.
   */
  pending: () => boolean;
  enabled?: boolean;
}): RadarAreaLiveRead<T> {
  const { area, brandId, articleId, articleDnaVersionId, load, open, pending } = input;
  const enabled = input.enabled !== false && Boolean(brandId && articleId && articleDnaVersionId);
  const key = useMemo(
    () => radarAreaCacheKey({ brandId, articleId, articleDnaVersionId, area }),
    [area, articleDnaVersionId, articleId, brandId],
  );
  const tabelas = useMemo(() => [...input.tables].sort().join(","), [input.tables]);

  const [estado, setEstado] = useState<EstadoDaLeitura<T>>({ key: "", value: null, loading: false, revalidating: false, error: null });
  const [signal, setSignal] = useState<RadarLiveSignalState>("CONNECTING");
  const [visible, setVisible] = useState(true);

  /*
   * O QUE A TELA MOSTRA É DERIVADO, NÃO COPIADO POR EFEITO.
   *
   * Guardar o valor do cache com `setState` dentro de um efeito produziria um
   * render a mais e uma janela em que a chave já mudou mas o valor exibido ainda
   * é do artigo anterior. Derivando aqui, trocar de artigo troca o que aparece
   * no MESMO render — e nunca se vê o read-model errado, nem por um quadro.
   */
  /*
   * ESTA LINHA PROTEGE UM FRAME QUE O TESTE NÃO ENXERGA — não a remova.
   *
   * `buscar` também lê o cache, então apagá-la não quebra nenhuma asserção: sob
   * `React.act` tudo assenta antes da verificação, e o resultado final é igual.
   * No navegador não é: entre o render da troca de artigo e o efeito que dispara
   * a leitura existe um quadro, e sem isto ele mostra "Carregando…" para uma
   * área que já está em cache — exatamente o flash que o cache existe para
   * evitar.
   *
   * A bateria de mutação registra este caso como sobrevivente conhecido, e é
   * assim mesmo: a alternativa seria um teste que mede o indistinguível.
   */
  const guardado = enabled ? cache.get(key) : null;
  const doEstadoAtual = estado.key === key;
  const data = doEstadoAtual ? estado.value : ((guardado?.value as T) ?? null);
  const loading = doEstadoAtual ? estado.loading : enabled && !guardado;
  const revalidating = doEstadoAtual ? estado.revalidating : false;
  const error = doEstadoAtual ? estado.error : null;

  /*
   * `load` é uma função nova a cada render. Guardá-la numa ref, dentro de um
   * efeito, é o que impede a assinatura Realtime de se remontar a cada pintura —
   * e um canal que se reinscreve sem parar nunca chega a receber um evento.
   */
  const carregar = useRef(load);
  const chaveAtual = useRef(key);
  useEffect(() => { carregar.current = load; });
  useEffect(() => { chaveAtual.current = key; }, [key]);

  const ultimoSinal = useRef(0);
  const emVoo = useRef<AbortController | null>(null);

  const buscar = useCallback(async (chave: string, motivo: "first" | "revalidate") => {
    emVoo.current?.abort();
    const controller = new AbortController();
    emVoo.current = controller;

    setEstado(atual => ({
      key: chave,
      value: atual.key === chave ? atual.value : ((cache.get(chave)?.value as T) ?? null),
      loading: motivo === "first",
      revalidating: motivo === "revalidate",
      error: atual.key === chave ? atual.error : null,
    }));
    cache.markRevalidating(chave, motivo === "revalidate");

    try {
      const valor = await carregar.current(controller.signal);
      /*
       * A CHAVE PODE TER MUDADO NO MEIO DO CAMINHO.
       *
       * Trocar de artigo durante uma leitura e aplicar o resultado assim mesmo
       * mostraria o read-model do artigo anterior como se fosse o novo — que é
       * exatamente o que o gate proíbe.
       */
      if (controller.signal.aborted || chaveAtual.current !== chave) return;
      cache.set(chave, valor, Date.now());
      setEstado({ key: chave, value: valor, loading: false, revalidating: false, error: null });
    } catch (falha) {
      if (controller.signal.aborted || chaveAtual.current !== chave) return;
      /* O dado antigo continua na tela: uma falha de rede não apaga o que era válido. */
      setEstado(atual => ({
        ...atual,
        key: chave,
        loading: false,
        revalidating: false,
        error: falha instanceof Error ? falha.message : "Não foi possível atualizar esta área.",
      }));
    } finally {
      cache.markRevalidating(chave, false);
    }
  }, []);

  /**
   * UM SINAL VIRA NO MÁXIMO UMA LEITURA POR JANELA — venha de onde vier.
   *
   * Vale para o evento do Realtime, para o tique e para o [Atualizar]. Uma
   * contribuição de áudio produz três eventos em sequência — a contribuição
   * entra, a pauta muda de estado, o job é enfileirado — e dois cliques no
   * botão são um só gesto. Nos dois casos, o que se quer é uma leitura.
   *
   * Engolir um clique que chega logo depois de uma leitura não custa nada: a
   * área ACABOU de ser atualizada, e é isso que o botão pedia.
   */
  const sinalizar = useCallback(() => {
    const agora = Date.now();
    if (radarAreaShouldCoalesce({ lastSignalAt: ultimoSinal.current, now: agora })) return;
    ultimoSinal.current = agora;
    void buscar(chaveAtual.current, "revalidate");
  }, [buscar]);

  /* ---- a primeira leitura, e a troca de artigo/versão ---- */
  useEffect(() => {
    if (!enabled) return;
    /* Com cache, confere por trás; sem cache, é a primeira leitura mesmo. */
    void buscar(key, cache.get(key) ? "revalidate" : "first");
  }, [buscar, enabled, key]);

  /* ---- o sinal preferido: Realtime ---- */
  useEffect(() => {
    if (!enabled) return;
    const listaDeTabelas = tabelas.split(",").filter(Boolean);
    if (!listaDeTabelas.length) return;

    let ativo = true;
    let canal: { unsubscribe: () => unknown } | null = null;

    try {
      const client = getBrowserSupabaseClient();
      const novo = client.channel(`radar:${area}:${articleId}:${articleDnaVersionId}`);
      for (const tabela of listaDeTabelas) {
        /*
         * O FILTRO É POR MARCA, e o resto é decidido pelo read-model.
         *
         * `postgres_changes` filtra por uma coluna só, e nem toda tabela do
         * fluxo tem `article_id` — `expert_contributions` referencia a pauta.
         * Filtrar pela marca corta o ruído de outros tenants; o que sobra é um
         * sinal a mais, que custa uma releitura da área, não um dado errado.
         */
        novo.on("postgres_changes", { event: "*", schema: "public", table: tabela, filter: `brand_id=eq.${brandId}` }, () => {
          if (ativo) sinalizar();
        });
      }
      novo.subscribe(status => {
        if (ativo) setSignal(radarLiveSignalFromSubscription(String(status)));
      });
      canal = novo;
    } catch {
      /* Sem cliente, sem canal: a área passa a viver do tique. */
      queueMicrotask(() => { if (ativo) setSignal("UNAVAILABLE"); });
    }

    return () => {
      ativo = false;
      void canal?.unsubscribe();
    };
  }, [area, articleDnaVersionId, articleId, brandId, enabled, sinalizar, tabelas]);

  /* ---- a aba escondida não vale tique; voltar a ela vale uma leitura ---- */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const aoMudar = () => {
      const agoraVisivel = document.visibilityState !== "hidden";
      setVisible(agoraVisivel);
      if (agoraVisivel && cache.get(chaveAtual.current)) void buscar(chaveAtual.current, "revalidate");
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, [buscar]);

  /* ---- o fallback: só desta área, e só quando vale ---- */
  const estaPendente = useRef(pending);
  useEffect(() => { estaPendente.current = pending; });

  useEffect(() => {
    if (!enabled) return;
    /*
     * O PLANO É DECIDIDO AQUI, não no render.
     *
     * `pending` é a resposta de uma leitura que ainda não aconteceu quando o
     * componente pinta. Consultá-lo no agendamento — e a cada tique — mantém
     * o ritmo correto sem fazer o render depender do que a leitura devolveu.
     */
    const planoInicial = radarAreaPollingPlan({ signal, activity: { open, pending: estaPendente.current() }, visible });
    if (!planoInicial.shouldPoll) return;

    const timer = window.setInterval(() => {
      const agora = radarAreaPollingPlan({ signal, activity: { open, pending: estaPendente.current() }, visible });
      /* O estado ficou estável no meio do caminho: o tique para de valer. */
      if (!agora.shouldPoll) return;
      sinalizar();
    }, planoInicial.intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, open, signal, sinalizar, visible]);

  const refresh = sinalizar;

  return { data, loading, revalidating, error, signal, refresh };
}

/** Descarta o que era de outro artigo ou de outra versão do ArticleDNA. */
export function invalidateRadarArea(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  area: RadarLiveArea;
}): void {
  cache.invalidate(radarAreaCacheKey(input));
}
