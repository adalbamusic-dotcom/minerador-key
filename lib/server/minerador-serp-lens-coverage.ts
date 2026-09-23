import "server-only";

import { DataForSeoSerpError, type DataForSeoSerpConfig } from "@/lib/minerador/dataforseo-serp-core";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  sameSerpCacheLens,
  serpCacheLensLabel,
  serpCacheSubjectId,
  type SerpCacheLens,
  type SerpCacheMeta,
  type SerpOrganicDigest,
} from "@/lib/editorial/serp-cache";
import type { SerpLensDerivationInput } from "@/lib/minerador/serp-semantic-evidence";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheRequest } from "@/lib/server/serp-cache";
import type { SerpCacheContext } from "@/lib/server/serp-cache-store";

/**
 * AS OUTRAS TRÊS LENTES DA SERP — garantidas no cache pelo Minerador.
 *
 * Decisão do usuário (2026-09-23): a SERP paga vai para o cache desde a
 * primeira vez que é acionada — no Processador (botão Resultados) ou na
 * Descoberta (Medir resultados) — e nas QUATRO lentes, não só no desktop.
 * Artigo publicado precisa posicionar em todos os sistemas e aparelhos, e nas
 * respostas de IA, que variam com eles.
 *
 * A lente canônica (desktop-windows) continua sendo a CALL 3 da rota de
 * Resultados (`collectSemanticSerp`): corpo gravado, profundidade 20. Este
 * módulo cuida das outras três. Desde o adendo das 4 lentes (§3, 2026-09-23)
 * a intenção e o funil são lidos NAS QUATRO: cada lente extra devolve o
 * DIGEST orgânico — montado do corpo em memória na coleta, lido do cache no
 * acerto — e a proveniência da entrada. Nunca corpo nem observação. Quem
 * deriva é a rota, com `deriveSerpSemanticEvidenceAcrossLenses`; este módulo
 * não toca Qualificação, `evidencia_serp` nem pacote aprovado.
 *
 * MAPA DOS LEITORES (verificado no código em 2026-09-23):
 *
 *   leitor                                   lente                          depth  modo
 *   Minerador — CALL 3 (Qualificação)        desktop-windows                20     body
 *   Arquiteto — formação de artigos          desktop-windows (a tela manda  10     meta → body
 *     app/api/arquiteto/serp                 sempre "desktop"); mobile-android
 *                                            só se alguém mandar `mobile`
 *   Arquiteto — SERP territorial             desktop-windows (a tela não    10     body
 *     app/api/arquiteto/territorial-serp     manda `device`); mobile-android
 *                                            só se alguém mandar `mobile`
 *   Arquiteto — SERP por keyword             as 4 lentes                    10     observation
 *     app/api/arquiteto/keyword-serp
 *   Minerador — intenção e funil (4 lentes)  as 3 extras                    10     digest
 *     este módulo → rota de Resultados
 *
 * Daí as duas escolhas para as três lentes:
 *
 *   PROFUNDIDADE 10 — a menor que atende todo leitor delas: todos pedem 10
 *   (`resultLimit` padrão, que nenhuma tela muda), e a observação é sempre
 *   calculada no top 10 (`SERP_CACHE_OBSERVATION_DEPTH`). Com ela o Arquiteto
 *   não paga de novo.
 *
 *   SEM CORPO — nenhum leitor em uso lê o corpo delas. A formação e a
 *   territorial ACEITAM `device: "mobile"` (mobile-android, em modo body), mas
 *   nenhuma tela o envia. Se um dia enviar, a entrada sem corpo é falta para a
 *   leitura em modo body: paga uma vez e grava a entrada completa. E a gravação
 *   sem corpo nunca troca uma entrada com corpo que ainda vale (`kept`).
 *   O que a classificação precisa delas é o DIGEST (~5 KB, `payload.digest`),
 *   gravado pela coleta de toda lente não canônica.
 *
 * Entrada extra antiga, SEM digest, continua atendendo a cobertura: ela não é
 * paga de novo só por isso. Para a derivação ela é lente faltante
 * (`missing_digest`) até a próxima coleta normal.
 */

/** Profundidade das três lentes: a menor que atende todos os leitores delas. */
export const SERP_LENS_COVERAGE_DEPTH = 10;
/** O mesmo endpoint da CALL 3 e de todos os leitores do Arquiteto. */
export const SERP_LENS_COVERAGE_ENDPOINT = "advanced" as const;
/**
 * Chamadas simultâneas das três lentes — o `CONCURRENCY` das rotas de SERP do
 * Arquiteto. Correm em paralelo com a cadeia do alvo (allintitle → KD → CALL 3):
 * no máximo 1 + 3 pedidos ao provider ao mesmo tempo, e a duração por alvo
 * continua a da cadeia, que é mais longa que uma rodada de SERP.
 */
export const SERP_LENS_COVERAGE_CONCURRENCY = 3;

/** As quatro lentes do produto menos a canônica, que é a CALL 3. */
export const SERP_LENS_COVERAGE_LENSES: readonly SerpCacheLens[] = SERP_CACHE_LENSES.filter(lens => !sameSerpCacheLens(lens, SERP_CACHE_CANONICAL_LENS));

/** De onde veio a SERP de uma lente: a entrada do cache, e quem a pagou. */
export type SerpLensProvenance = {
  collectedAt: string;
  providerRequestId: string | null;
  collectedBy: SerpCacheMeta["collectedBy"];
};

const proveniencia = (meta: SerpCacheMeta): SerpLensProvenance => ({
  collectedAt: meta.collectedAt,
  providerRequestId: meta.providerRequestId,
  collectedBy: meta.collectedBy,
});

export type SerpLensCoverageTarget = {
  targetId: string;
  /** A keyword natural — a mesma que a CALL 3 consulta. */
  keyword: string;
  /** Candidata da Descoberta sem keyword oficial entra com null, como na CALL 3. */
  keywordId: string | null;
  /** Os códigos do targeting do alvo: os mesmos que vão ao provider. */
  locationCode: number;
  languageCode: string;
};

type LensSlot = {
  lens: SerpCacheLens;
  label: string;
  request: SerpCacheRequest;
  subjectId: string;
  /** A entrada gravada atende: existe, vale, tem profundidade suficiente. */
  cached: boolean;
  /** A entrada que atende, lida em modo `digest`: proveniência e o digest, se gravado. */
  hit: { provenance: SerpLensProvenance; digest: SerpOrganicDigest | null } | null;
};

export type SerpLensCoveragePlan = {
  readonly targets: ReadonlyMap<string, { target: SerpLensCoverageTarget; slots: readonly LensSlot[] }>;
  /** Consultas DISTINTAS que faltam: é o que entra na quota. */
  readonly missingQueries: number;
  /** A leitura do cache falhou: nada é pago, cada lente vira lacuna com este motivo. */
  readonly readFailed: string | null;
};

export function serpLensCoverageRequest(target: SerpLensCoverageTarget, lens: SerpCacheLens): SerpCacheRequest {
  return {
    query: {
      keyword: target.keyword,
      locationCode: target.locationCode,
      languageCode: target.languageCode,
      lens,
      endpoint: SERP_LENS_COVERAGE_ENDPOINT,
    },
    depth: SERP_LENS_COVERAGE_DEPTH,
    keywordId: target.keywordId,
  };
}

/**
 * Separa acertos de faltas das três lentes de cada alvo, ANTES de credencial e
 * quota. Lê em modo `digest` (R8): existência, validade e o digest que a
 * classificação usa — nunca observação nem corpo. Uma leitura só: a mesma que
 * decide o que pagar entrega, no acerto, a entrada da derivação.
 *
 * Nunca lança. Banco fora vira `readFailed`: a rota não paga lentes cujo único
 * destino é um cache que ela não consegue ler.
 */
export async function planSerpLensCoverage(
  context: SerpCacheContext,
  targets: readonly SerpLensCoverageTarget[],
  options: { now: Date },
): Promise<SerpLensCoveragePlan> {
  const porAlvo = new Map<string, { target: SerpLensCoverageTarget; slots: LensSlot[] }>();
  for (const target of targets) {
    porAlvo.set(target.targetId, {
      target,
      slots: SERP_LENS_COVERAGE_LENSES.map(lens => {
        const request = serpLensCoverageRequest(target, lens);
        return { lens, label: serpCacheLensLabel(lens), request, subjectId: serpCacheSubjectId(request.query), cached: false, hit: null };
      }),
    });
  }
  const todos = [...porAlvo.values()].flatMap(item => item.slots);
  if (!todos.length) return { targets: porAlvo, missingQueries: 0, readFailed: null };

  try {
    const consultas = await lookupSerpCache(context, todos.map(slot => slot.request), { mode: "digest", now: options.now });
    consultas.forEach((consulta, indice) => {
      todos[indice].cached = Boolean(consulta.hit);
      todos[indice].hit = consulta.hit ? { provenance: proveniencia(consulta.hit.meta), digest: consulta.hit.digest ?? null } : null;
    });
  } catch (error) {
    return { targets: porAlvo, missingQueries: 0, readFailed: error instanceof Error ? error.message.slice(0, 240) : "falha desconhecida" };
  }
  // A mesma consulta em dois alvos (keyword e candidata de mesmo texto) é paga uma vez só.
  const faltantes = new Set(todos.filter(slot => !slot.cached).map(slot => slot.subjectId)).size;
  return { targets: porAlvo, missingQueries: faltantes, readFailed: null };
}

export type SerpLensOutcome = {
  lens: string;
  subjectId: string;
  /**
   * `cache`: o banco já atendia (ou outra coleta desta mesma requisição);
   * `collected`: paga agora; `failed`: o provider não devolveu SERP;
   * `skipped`: não tentada — quota, cache ilegível ou alvo fora do plano.
   */
  source: "cache" | "collected" | "failed" | "skipped";
  /** Pedido enviado ao provider POR ESTE ALVO: é o que entra no uso. */
  paid: boolean;
  /** A lente ficou no cache depois desta requisição. `false` é lacuna. */
  stored: boolean;
  providerRequestId: string | null;
  cost: number | null;
  reason: string | null;
  /**
   * A entrada da classificação da lente (adendo das 4 lentes, §3): o digest
   * montado do corpo em memória quando ela foi paga agora, ou o gravado no
   * cache quando já estava lá. `null` quando não há SERP legível da lente —
   * falha, lacuna, SERP sem orgânico ou entrada antiga sem digest.
   */
  digest: SerpOrganicDigest | null;
  /** De qual coleta a lente veio. `null` quando nenhuma SERP da lente existe. */
  provenance: SerpLensProvenance | null;
};

type Coleta = {
  ok: boolean;
  started: boolean;
  stored: boolean;
  providerRequestId: string | null;
  cost: number | null;
  reason: string | null;
  digest: SerpOrganicDigest | null;
  provenance: SerpLensProvenance | null;
};

function custoDa(body: unknown): number | null {
  const tarefas = body && typeof body === "object" && !Array.isArray(body) ? (body as { tasks?: unknown }).tasks : null;
  const tarefa = Array.isArray(tarefas) ? tarefas[0] as { cost?: unknown } | undefined : undefined;
  return tarefa && typeof tarefa.cost === "number" && Number.isFinite(tarefa.cost) ? tarefa.cost : null;
}

/** Limite de pedidos simultâneos; a vaga passa direto para quem espera. */
function limitador(limite: number) {
  let ativos = 0;
  const fila: Array<() => void> = [];
  return async <T>(tarefa: () => Promise<T>): Promise<T> => {
    if (ativos < limite) ativos += 1;
    else await new Promise<void>(resolve => fila.push(resolve));
    try {
      return await tarefa();
    } finally {
      const proximo = fila.shift();
      if (proximo) proximo();
      else ativos -= 1;
    }
  };
}

/**
 * Paga as lentes que faltaram, sem corpo, e diz o que aconteceu com cada uma.
 *
 * `ensure` NUNCA rejeita: a falha de uma lente é lacuna declarada e jamais
 * derruba Resultado, KD ou a Qualificação do alvo.
 */
export function createSerpLensCoverage(
  context: SerpCacheContext,
  plan: SerpLensCoveragePlan,
  options: {
    config: DataForSeoSerpConfig;
    operationRequestId: string;
    /** O mesmo instante da requisição: validade e `collectedAt` contam dele. */
    now: Date;
    /** `false` quando a quota não cobriu TODAS as lentes faltantes. */
    quotaCovered: boolean;
    /**
     * Com `quotaCovered: false`: quantas consultas distintas das lentes ainda
     * cabem na quota restante. Pagas na ordem dos alvos; as que passam do saldo
     * viram lacuna. Ausente ou 0: nenhuma é paga.
     */
    quotaBudget?: number;
    concurrency?: number;
    provider?: { fetchImpl?: typeof fetch; onRequestStarted?: () => void };
  },
) {
  const vaga = limitador(options.concurrency ?? SERP_LENS_COVERAGE_CONCURRENCY);
  /*
   * Saldo de consultas que a quota ainda cobre. Quota inteira: sem limite aqui
   * (a rota já pediu todas as faltantes). Quota parcial: o saldo que ela deu,
   * gasto só por consulta que vai de fato ao provider — acerto e consulta já em
   * voo na requisição não gastam. A checagem e o desconto acontecem sem
   * `await` entre eles: dois slots nunca gastam a mesma unidade.
   */
  let saldo = options.quotaCovered
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(Number.isFinite(options.quotaBudget) ? options.quotaBudget ?? 0 : 0));
  // Uma coleta por consulta na requisição inteira.
  const emVoo = new Map<string, Promise<Coleta>>();

  const coletar = (slot: LensSlot) => vaga(async (): Promise<Coleta> => {
    let started = false;
    try {
      const coleta = await collectAndCacheSerp(context, slot.request, {
        config: options.config,
        operationRequestId: options.operationRequestId,
        collectedBy: "minerador",
        now: options.now,
        storeBody: false,
        provider: {
          ...(options.provider?.fetchImpl ? { fetchImpl: options.provider.fetchImpl } : {}),
          onRequestStarted: () => { started = true; options.provider?.onRequestStarted?.(); },
        },
      });
      const cost = custoDa(coleta.body);
      if (!coleta.observation) {
        // Paga e recusada: o código e a mensagem da task dizem se o defeito foi o pedido.
        const { taskStatusCode, taskStatusMessage } = coleta.diagnostic;
        const doProvider = taskStatusCode && taskStatusCode !== 20000 ? ` (provider ${taskStatusCode}${taskStatusMessage ? `: ${taskStatusMessage}` : ""})` : "";
        return { ok: false, started, stored: false, providerRequestId: coleta.providerRequestId, cost, reason: `${coleta.observationError || "A resposta do provider não é uma SERP."}${doProvider}`, digest: null, provenance: null };
      }
      const stored = coleta.write === "created" || coleta.write === "updated" || coleta.write === "concurrent" || coleta.write === "kept";
      const reason = stored
        ? null
        : coleta.write === "skipped"
          ? "SERP sem resultado orgânico: não gravada no cache."
          : `A gravação no cache falhou: ${(coleta.writeError || "motivo desconhecido").slice(0, 200)}`;
      /*
       * A classificação da lente paga agora sai do digest do corpo EM MEMÓRIA —
       * o mesmo objeto que foi ao banco. SERP sem orgânico não é gravada, então
       * também não entra na derivação: o próximo acerto não a teria.
       */
      const digest = coleta.observation.organicCount > 0 ? coleta.digest : null;
      return { ok: true, started, stored, providerRequestId: coleta.providerRequestId, cost, reason, digest, provenance: digest ? proveniencia(coleta.meta) : null };
    } catch (error) {
      return {
        ok: false,
        started,
        stored: false,
        providerRequestId: error instanceof DataForSeoSerpError ? error.providerRequestId : null,
        cost: null,
        reason: error instanceof Error ? error.message.slice(0, 240) : "Falha ao consultar a SERP.",
        digest: null,
        provenance: null,
      };
    }
  });

  const naoTentada = (slot: LensSlot, reason: string): SerpLensOutcome => ({
    lens: slot.label, subjectId: slot.subjectId, source: "skipped", paid: false, stored: false, providerRequestId: null, cost: null, reason, digest: null, provenance: null,
  });

  return {
    /**
     * As três lentes de um alvo. `codes` são os do targeting que o laço
     * resolveu: se não baterem com os do plano, a chave lida não descreve o
     * pedido, e nada é pago.
     */
    async ensure(targetId: string, codes: { locationCode: number; languageCode: string }): Promise<SerpLensOutcome[]> {
      const entrada = plan.targets.get(targetId);
      if (!entrada) {
        return SERP_LENS_COVERAGE_LENSES.map(lens => {
          const label = serpCacheLensLabel(lens);
          return { lens: label, subjectId: "", source: "skipped" as const, paid: false, stored: false, providerRequestId: null, cost: null, reason: "Alvo fora do plano de lentes: nenhuma consulta feita.", digest: null, provenance: null };
        });
      }
      const codigosBatem = entrada.target.locationCode === codes.locationCode
        && entrada.target.languageCode.trim().toLowerCase() === codes.languageCode.trim().toLowerCase();

      return Promise.all(entrada.slots.map(async (slot): Promise<SerpLensOutcome> => {
        if (slot.cached) {
          // Acerto: a classificação lê o digest GRAVADO; sem ele, a lente falta à derivação, e nada é pago.
          return { lens: slot.label, subjectId: slot.subjectId, source: "cache", paid: false, stored: true, providerRequestId: null, cost: null, reason: null, digest: slot.hit?.digest ?? null, provenance: slot.hit?.provenance ?? null };
        }
        if (plan.readFailed) return naoTentada(slot, `Cache de SERP ilegível; a lente não foi paga (${plan.readFailed}).`);
        if (!codigosBatem) return naoTentada(slot, "Localidade ou idioma do alvo divergem do plano de lentes.");

        const existente = emVoo.get(slot.subjectId);
        if (existente) {
          // Outro alvo desta requisição já pagou a mesma consulta: nada é cobrado de novo.
          const coleta = await existente;
          return { lens: slot.label, subjectId: slot.subjectId, source: coleta.ok && coleta.stored ? "cache" : "failed", paid: false, stored: coleta.stored, providerRequestId: coleta.providerRequestId, cost: null, reason: coleta.reason, digest: coleta.digest, provenance: coleta.provenance };
        }
        if (saldo <= 0) return naoTentada(slot, "A quota não cobre as lentes extras; Resultado, KD e a lente canônica seguiram.");
        saldo -= 1;
        const promessa = coletar(slot);
        emVoo.set(slot.subjectId, promessa);
        const coleta = await promessa;
        return {
          lens: slot.label,
          subjectId: slot.subjectId,
          source: coleta.ok ? "collected" : "failed",
          paid: coleta.started,
          stored: coleta.stored,
          providerRequestId: coleta.providerRequestId,
          cost: coleta.cost,
          reason: coleta.reason,
          digest: coleta.digest,
          provenance: coleta.provenance,
        };
      }));
    },
  };
}

/**
 * O que cada lente extra entrega à derivação das quatro lentes: o digest com a
 * proveniência, ou por que ela falta. Mesmo mapeamento na coleta e no acerto.
 *
 *   com digest → lida (inclusive a consulta paga por outro alvo desta requisição
 *                cuja gravação falhou: a SERP está na mão, como a do alvo que pagou)
 *   cache      sem digest → `missing_digest` (não paga de novo)
 *   collected  sem digest → `no_organic`
 *   failed     → `collection_failed`
 *   skipped    → `not_collected` (quota, cache ilegível, fora do plano)
 *
 * `invalidatedBefore`: a evidência SERP do alvo foi invalidada por decisão
 * humana, e a canônica é recolhida (refresh). As extras não são pagas de novo
 * (seria chamada paga sem decisão do usuário); a que veio do cache com coleta
 * ANTERIOR a este instante — o início da requisição — é da SERP recusada e
 * vira `evidence_invalidated`. A paga nesta requisição, inclusive por outro
 * alvo, entra.
 */
export function serpLensDerivationInputs(outcomes: readonly SerpLensOutcome[], options: { invalidatedBefore?: string | null } = {}): SerpLensDerivationInput[] {
  const limite = options.invalidatedBefore ? Date.parse(options.invalidatedBefore) : Number.NaN;
  return outcomes.map((outcome): SerpLensDerivationInput => {
    if (outcome.source === "cache" && Number.isFinite(limite)) {
      const coletada = Date.parse(outcome.provenance?.collectedAt ?? "");
      if (!Number.isFinite(coletada) || coletada < limite) return { lens: outcome.lens, missing: "evidence_invalidated" };
    }
    if (outcome.digest && outcome.provenance) return { lens: outcome.lens, digest: outcome.digest, ...outcome.provenance };
    const missing = outcome.source === "cache"
      ? "missing_digest" as const
      : outcome.source === "collected"
        ? "no_organic" as const
        : outcome.source === "failed" ? "collection_failed" as const : "not_collected" as const;
    return { lens: outcome.lens, missing };
  });
}

export type SerpLensCounts = { paid: number; cached: number; failed: number; skipped: number };

/** Contagens por lente — aditivas na resposta da rota. */
export function countSerpLensOutcomes(outcomes: readonly SerpLensOutcome[]): Record<string, SerpLensCounts> {
  const porLente: Record<string, SerpLensCounts> = {};
  for (const lens of SERP_LENS_COVERAGE_LENSES) porLente[serpCacheLensLabel(lens)] = { paid: 0, cached: 0, failed: 0, skipped: 0 };
  for (const item of outcomes) {
    const contagem = porLente[item.lens] || (porLente[item.lens] = { paid: 0, cached: 0, failed: 0, skipped: 0 });
    if (item.paid) contagem.paid += 1;
    if (item.source === "cache") contagem.cached += 1;
    if (item.source === "skipped") contagem.skipped += 1;
    else if (!item.stored) contagem.failed += 1;
  }
  return porLente;
}
