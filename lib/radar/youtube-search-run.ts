import { z } from "zod";
import { RadarYoutubeSearchResultSchema, RadarYoutubeUniverseEntrySchema, radarYoutubeUniverseCounts, type RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";

/**
 * A INVESTIGAÇÃO DE YOUTUBE — YOUTUBE_SEARCH_1 · §1, §8, §9, §10 e §11.
 *
 * ==================== POR QUE ELA TEM IDENTIDADE PRÓPRIA ====================
 *
 * O §1 é explícito: nada do Google é sobrescrito. A pesquisa de YouTube não é
 * um modo do registro do Google — é uma investigação paralela, com a sua
 * própria corrida, o seu fingerprint e a sua proveniência de provider.
 *
 * Enfiá-la dentro de `deepResearch` obrigaria a escolher entre dois universos
 * no mesmo lugar: rodar YouTube apagaria o resultado do Google, e um reset de
 * um alcançaria o outro. São perguntas diferentes sobre o mesmo artigo, e cada
 * uma guarda a sua resposta.
 *
 * ========================= O QUE ESTE GATE FECHA =========================
 *
 * START + coleta + normalização + universo + curadoria + readback. ANALYZE,
 * blueprint competitivo e FINALIZE são o YOUTUBE_SEARCH_2 — e por isso não há
 * campo nenhum aqui para eles: um campo vazio esperando o próximo gate seria
 * um convite a preenchê-lo antes da hora.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/* ===================== a política da coleta, no domínio ==================== */

/**
 * O ENDEREÇO DO PROVIDER E A PROFUNDIDADE PADRÃO — 1.1 · §2, 1.3 · §4.
 *
 * Eles moram aqui, e não no adaptador, porque a TELA grava a corrida antes da
 * chamada (§4) e precisa declarar com que política ela começou. Importar o
 * módulo de servidor para isso arrastaria credencial e cliente HTTP para o
 * bundle do navegador.
 *
 * Vinte, não cem: a coleta real com `block_depth=100` devolveu 114 itens cuja
 * cauda era derivação lateral do assunto. Expandir é ação explícita de um gate
 * futuro, nunca automática.
 */
export const RADAR_YOUTUBE_PROVIDER_ENDPOINT = "/v3/serp/youtube/organic/live/advanced" as const;
export const RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH = 20;
export const RADAR_YOUTUBE_MAX_BLOCK_DEPTH = 40;

/* ============================== a identidade ============================= */

/**
 * O QUE A CORRIDA DESCREVE, E CONTRA O QUE ELA PODE SER COMPARADA.
 *
 * O fingerprint é do que ENTROU: artigo, versão do ArticleDNA e as consultas
 * executadas. Duas coletas com o mesmo fingerprint descrevem a mesma pergunta —
 * e a diferença entre elas é o YouTube, não a nossa estratégia.
 */
export const RadarYoutubeRunFingerprintSchema = z.object({
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  articleDnaContentHash: z.string().nullable().default(null),
  /** Os ids das consultas, ordenados. A ordem de execução não muda a pergunta. */
  queryIds: z.array(z.string().min(1)),
  signature: z.string().min(1),
}).strict();
export type RadarYoutubeRunFingerprint = z.infer<typeof RadarYoutubeRunFingerprintSchema>;

function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let indice = 0; indice < valor.length; indice += 1) {
    hash ^= valor.charCodeAt(indice);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildRadarYoutubeRunFingerprint(input: {
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash?: string | null;
  queryIds: readonly string[];
}): RadarYoutubeRunFingerprint {
  const ordenados = [...input.queryIds].sort();
  const canonico = [
    `article:${input.articleId}`,
    `dna:${input.articleDnaVersionId}`,
    `hash:${input.articleDnaContentHash ?? "null"}`,
    `queries:${ordenados.join(",")}`,
  ].join("\n");
  return RadarYoutubeRunFingerprintSchema.parse({
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    articleDnaContentHash: input.articleDnaContentHash ?? null,
    queryIds: ordenados,
    signature: `ytrun:${assinatura(canonico)}`,
  });
}

/* ========================= a proveniência da coleta ======================= */

/**
 * DE ONDE O DADO VEIO — e quanto dele veio.
 *
 * Sem isto, um universo pequeno é indistinguível de uma coleta que falhou pela
 * metade. `queriesFailed` existe para que "18 vídeos" nunca seja lido como o
 * que o YouTube tem, quando na verdade é o que conseguimos ler.
 */
export const RadarYoutubeProviderProvenanceSchema = z.object({
  provider: z.literal("dataforseo"),
  endpoint: z.string().min(1),
  locationCode: z.number().int().nullable().default(null),
  languageCode: z.string().nullable().default(null),
  /**
   * COM QUE PROFUNDIDADE E EM QUE APARELHO — §2 e §3.
   *
   * A SERP do YouTube difere entre mobile e desktop, e 20 itens por consulta
   * não é o mesmo universo que 100. Sem isso gravado, duas coletas do mesmo
   * artigo pareceriam contraditórias quando só foram feitas diferente.
   */
  blockDepth: z.number().int().positive().nullable().default(null),
  device: z.string().nullable().default(null),
  os: z.string().nullable().default(null),
  queriesRequested: z.number().int().nonnegative(),
  queriesSucceeded: z.number().int().nonnegative(),
  queriesFailed: z.number().int().nonnegative(),
  /** Uma linha por consulta que falhou. Falha silenciosa não existe aqui. */
  failures: z.array(z.object({ queryId: z.string().min(1), reason: z.string().min(1) }).strict()).default([]),
  /**
   * ====== §13 · QUANTOS SHORTS O PROVIDER MARCOU, SOMADOS ======
   *
   * Uma coleta real trouxe 47 vídeos e 0 Shorts, e a mesma busca à mão estava
   * cheia deles. "0 Short(s)" na tela cobre duas histórias opostas — o provider
   * não marcou nenhum, ou marcou e a gente perdeu no caminho —, e elas pedem
   * ações contrárias: conferir parâmetros de coleta, ou consertar o adapter.
   *
   * `null` numa corrida gravada antes deste gate significa "não foi medido", e
   * é diferente de zero. Zerar o campo antigo afirmaria uma medição que ninguém
   * fez.
   */
  providerShortsCount: z.number().int().nonnegative().nullable().default(null),
  normalizedShortsCount: z.number().int().nonnegative().nullable().default(null),
  collectedAt: z.string().min(1),
}).strict();
export type RadarYoutubeProviderProvenance = z.infer<typeof RadarYoutubeProviderProvenanceSchema>;

/* =============================== a corrida =============================== */

export const RadarYoutubeQueryRecordSchema = z.object({
  queryId: z.string().min(1),
  text: z.string().min(1),
  origin: z.string().min(1),
  sourceRef: z.string().nullable().default(null),
  reason: z.string().min(1),
  /** Quantos itens esta consulta trouxe. `0` com sucesso é resposta. */
  resultCount: z.number().int().nonnegative().default(0),
  executed: z.boolean().default(false),
  failureReason: z.string().nullable().default(null),
  /**
   * O ENDEREÇO PARA CONFERIR ESTA CONSULTA À MÃO — §3.
   *
   * `checkUrl` é a busca no YouTube como o provider a executou. É o que
   * transforma "confie no número" em "abra e veja".
   *
   * `seResultsCount` é quantos resultados o YouTube declara ter para a busca.
   * Ele existe para a tela nunca deixar 20 itens parecerem o universo inteiro.
   */
  checkUrl: z.string().nullable().default(null),
  seResultsCount: z.number().int().nonnegative().nullable().default(null),
  itemsCount: z.number().int().nonnegative().nullable().default(null),
}).strict();
export type RadarYoutubeQueryRecord = z.infer<typeof RadarYoutubeQueryRecordSchema>;

/**
 * OS TRÊS ESTADOS — e `COLLECTING` existe por causa do 1.3 · §4 e §10.
 *
 * A corrida é gravada ANTES da chamada ao provider. Sem isso, um START que
 * morresse no meio — rede caindo, aba fechando, 503 do provider — deixava o
 * artigo sem corrida nenhuma: o compromisso com YOUTUBE não chegava a existir,
 * e a tela voltava a oferecer os três modos como se nada tivesse acontecido.
 *
 * Com `COLLECTING` persistido, o artigo já é de YouTube quando a chamada sai. A
 * falha vira `COLLECTION_FAILED` e continua sendo de YouTube — o §10 é
 * explícito: não converter para WEB, não exigir Google, não apagar a corrida.
 */
export const RADAR_YOUTUBE_RUN_STATES = ["COLLECTING", "COLLECTED", "COLLECTION_FAILED"] as const;

/**
 * A CORRIDA PERSISTIDA.
 *
 * `selectedVideoIds` é decisão humana e vive AQUI, junto do universo que ela
 * decide — não num estado de tela. É o que faz o F5 e o outro navegador lerem a
 * mesma seleção (§10).
 */
export const RadarYoutubeSearchRunSchema = z.object({
  researchMode: z.literal("YOUTUBE"),
  runId: z.string().min(1),
  /** Sobe a cada nova coleta do mesmo artigo. A anterior não é reescrita: é sucedida. */
  runVersion: z.number().int().positive(),
  startedAt: z.string().min(1),
  startedBy: z.string().min(1),
  state: z.enum(RADAR_YOUTUBE_RUN_STATES),
  fingerprint: RadarYoutubeRunFingerprintSchema,
  provenance: RadarYoutubeProviderProvenanceSchema,
  queries: z.array(RadarYoutubeQueryRecordSchema),
  /** Os itens crus normalizados, com a consulta que os trouxe. */
  results: z.array(RadarYoutubeSearchResultSchema),
  universe: z.array(RadarYoutubeUniverseEntrySchema),
  selectedVideoIds: z.array(z.string().min(1)).default([]),
  limitations: z.array(z.string()).default([]),
}).strict();
export type RadarYoutubeSearchRun = z.infer<typeof RadarYoutubeSearchRunSchema>;

/* =============================== o resumo =============================== */

/**
 * O RESUMO DA ABA — §9, e nada de hash nem debug.
 *
 * "4 consultas · 18 vídeos · 11 comparáveis · 3 selecionados". Quem opera não
 * precisa do fingerprint para decidir; ele continua no dado, para conferência.
 */
export type RadarYoutubeRunSummary = {
  queries: number;
  queriesExecuted: number;
  rawResults: number;
  uniqueVideos: number;
  /** Long-form e Shorts somados — e os dois continuam visíveis separados. */
  comparable: number;
  longForm: number;
  shorts: number;
  partial: number;
  notRelevant: number;
  selected: number;
  stateLabel: string;
  /**
   * §13 · O QUE O PROVIDER DISSE SOBRE SHORTS — e `null` quando não foi medido.
   *
   * Zero Shorts no universo com o provider tendo marcado vários é defeito
   * nosso; zero dos dois lados é resposta dele. A frase muda de acordo, porque
   * as duas pedem ações opostas de quem opera.
   */
  shortsNotice: string | null;
  /** A linha pronta, para a aba não montar texto por conta própria. */
  headline: string;
};

/**
 * ============ §13 · A AUDITORIA DE SHORTS, EM UMA FRASE ============
 *
 * Três números, três histórias:
 *
 *   provider 0, universo 0   o YouTube não entregou Short para esta busca.
 *   provider N, universo 0   nós perdemos no caminho. Isso é defeito, e a tela
 *                            precisa dizer em vez de mostrar um zero tranquilo.
 *   provider N, universo N   nada a declarar.
 *
 * Corrida gravada antes deste gate não tem a medição, e `null` diz isso — não
 * "zero". Afirmar zero para o passado inventaria uma auditoria que não houve.
 */
export function radarYoutubeShortsNotice(run: RadarYoutubeSearchRun): string | null {
  const doProvider = run.provenance.providerShortsCount;
  if (doProvider === null) return null;
  const noUniverso = run.universe.filter(item => item.universeClass === "COMPARABLE_SHORT").length;
  if (doProvider === 0 && noUniverso === 0) return "O YouTube não marcou nenhum resultado como Short nesta busca.";
  if (doProvider > 0 && noUniverso === 0) return `O YouTube marcou ${doProvider} Short(s) e nenhum chegou ao universo: a leitura da coleta está perdendo o formato.`;
  return null;
}

export function radarYoutubeRunSummary(run: RadarYoutubeSearchRun | null): RadarYoutubeRunSummary | null {
  if (!run) return null;
  const contagem = radarYoutubeUniverseCounts(run.universe);
  const executadas = run.queries.filter(item => item.executed).length;
  const stateLabel = run.state === "COLLECTED" ? "Coleta concluída"
    : run.state === "COLLECTING" ? "Coletando…"
      : "Coleta falhou";

  return {
    queries: run.queries.length,
    queriesExecuted: executadas,
    rawResults: run.results.length,
    uniqueVideos: contagem.total,
    comparable: contagem.comparable,
    longForm: contagem.COMPARABLE_LONG_FORM,
    shorts: contagem.COMPARABLE_SHORT,
    partial: contagem.PARTIAL,
    notRelevant: contagem.NOT_RELEVANT,
    selected: run.selectedVideoIds.length,
    stateLabel,
    shortsNotice: radarYoutubeShortsNotice(run),
    /*
     * OS DOIS FORMATOS APARECEM SEPARADOS JÁ NO RESUMO — §4.
     *
     * "41 comparáveis" esconderia que 39 deles são Shorts; a pessoa abriria a
     * aba esperando tutoriais e encontraria microestrutura.
     */
    headline: [
      `${executadas} consulta(s)`,
      `${contagem.total} vídeo(s)`,
      `${contagem.COMPARABLE_LONG_FORM} long-form`,
      `${contagem.COMPARABLE_SHORT} Short(s)`,
      `${run.selectedVideoIds.length} selecionado(s)`,
      stateLabel,
    ].join(" · "),
  };
}

/* ============================== a curadoria ============================= */

/**
 * A SELEÇÃO HUMANA — §8, e ela só alcança o que existe no universo.
 *
 * Um id que não está no universo seria uma decisão sobre um vídeo que esta
 * coleta não viu: ao próximo readback ele sumiria da tela e continuaria contado
 * como selecionado. A função recusa em silêncio o que não conhece, e devolve a
 * lista na ordem do universo — para dois navegadores lerem igual.
 */
export function radarYoutubeApplySelection(input: {
  universe: readonly RadarYoutubeUniverseEntry[];
  selectedVideoIds: readonly string[];
}): string[] {
  const existentes = new Set(input.universe.map(item => item.videoId));
  const pedidos = new Set(input.selectedVideoIds.filter(id => existentes.has(id)));
  return input.universe.filter(item => pedidos.has(item.videoId)).map(item => item.videoId);
}

/* ================================ o reset =============================== */

/**
 * O RESET ALCANÇA SÓ O YOUTUBE — §11.
 *
 * Ele devolve `null` para a investigação de YouTube e NADA MAIS. Google,
 * Amazon, ArticleDNA, Vídeos e Especialista não passam por aqui, e é por isso
 * que esta função recebe e devolve apenas este campo: o que ela não pode tocar,
 * ela não conhece.
 */
export const RADAR_YOUTUBE_RESET_KEEPS = [
  "deepResearch",
  "serpDecisions",
  "extractions",
  "benchmark",
  "competitiveReport",
  "finalizedBundle",
  "plannerPackage",
] as const;

export function radarYoutubeResetPatch(): { youtubeSearch: null; youtubeFrozenInvestigation: null } {
  /*
   * O CONGELAMENTO É PARTE DA INVESTIGAÇÃO DE YOUTUBE — YOUTUBE_SEARCH_2 · §12.
   *
   * Zerar a coleta e deixar o blueprint congelado de pé faria a tela mostrar
   * uma leitura competitiva de uma amostra que não existe mais — e ela seguiria
   * para o Planejador com proveniência apontando para uma corrida apagada.
   *
   * Continuam sendo campos DA PESQUISA DE YOUTUBE, e nenhum outro: Google,
   * Amazon, ArticleDNA, Vídeos e Especialista não passam por aqui.
   */
  return { youtubeSearch: null, youtubeFrozenInvestigation: null };
}

/* ============================== a montagem ============================= */

/**
 * A CORRIDA, GRAVADA ANTES DA CHAMADA — 1.3 · §4, passos 5 e 6.
 *
 * É ESTE registro que compromete o artigo com YOUTUBE. Ele não tem resultado
 * nenhum, e não deveria ter: o compromisso é anterior à resposta do provider,
 * e é isso que faz a falha do §10 ser recuperável em vez de invisível.
 *
 * `collectedAt` recebe o instante do START — é quando a corrida passou a
 * existir. Deixá-lo vazio exigiria um campo opcional que só esta fase usaria.
 */
export function buildRadarYoutubeStartedRun(input: {
  runId: string;
  runVersion: number;
  startedAt: string;
  startedBy: string;
  fingerprint: RadarYoutubeRunFingerprint;
  queries: readonly z.input<typeof RadarYoutubeQueryRecordSchema>[];
  limitations?: readonly string[];
}): RadarYoutubeSearchRun {
  return RadarYoutubeSearchRunSchema.parse({
    researchMode: "YOUTUBE",
    runId: input.runId,
    runVersion: input.runVersion,
    startedAt: input.startedAt,
    startedBy: input.startedBy,
    state: "COLLECTING",
    fingerprint: input.fingerprint,
    provenance: {
      provider: "dataforseo",
      /*
       * O ENDEREÇO E A PROFUNDIDADE SÃO POLÍTICA, NÃO TRANSPORTE.
       *
       * Eles vivem no domínio para a tela poder gravar a corrida sem importar
       * o módulo de servidor — que carrega credencial, `Buffer` e o cliente
       * HTTP. O adaptador do provider LÊ estas constantes; ele não as define.
       */
      endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT,
      blockDepth: RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
      queriesRequested: input.queries.length,
      /* Nada respondeu ainda — e zero aqui é o número honesto, não uma falha. */
      queriesSucceeded: 0,
      queriesFailed: 0,
      failures: [],
      collectedAt: input.startedAt,
    },
    queries: [...input.queries],
    results: [],
    universe: [],
    selectedVideoIds: [],
    limitations: [...(input.limitations || [])],
  });
}

/**
 * A CORRIDA, MONTADA DEPOIS DA COLETA.
 *
 * Ela não coleta: recebe o que o provider devolveu e amarra. Separar assim é o
 * que permite provar universo, dedupe e resumo sem nenhuma chamada real — que é
 * o que o §14 exige.
 */
export function buildRadarYoutubeSearchRun(input: {
  runId: string;
  runVersion: number;
  startedAt: string;
  startedBy: string;
  fingerprint: RadarYoutubeRunFingerprint;
  /*
   * A ENTRADA É O QUE SE ESCREVE, NÃO O QUE SE LÊ.
   *
   * Os campos com `.default()` existem para o chamador poder omiti-los; exigir
   * a forma JÁ PARSEADA obrigaria toda chamada a repetir `checkUrl: null` e
   * transformaria cada campo novo do provider numa quebra em cascata.
   */
  provenance: z.input<typeof RadarYoutubeProviderProvenanceSchema>;
  queries: readonly z.input<typeof RadarYoutubeQueryRecordSchema>[];
  results: readonly z.input<typeof RadarYoutubeSearchResultSchema>[];
  universe: readonly RadarYoutubeUniverseEntry[];
  selectedVideoIds?: readonly string[];
  limitations?: readonly string[];
}): RadarYoutubeSearchRun {
  /*
   * UMA COLETA SEM NENHUMA CONSULTA BEM-SUCEDIDA NÃO É UMA COLETA VAZIA.
   *
   * As duas terminam com universo zerado, e a tela precisa dizer coisas
   * diferentes: "o YouTube não devolveu nada para estas consultas" e "não
   * conseguimos perguntar" pedem ações opostas de quem opera.
   */
  const state = input.provenance.queriesSucceeded > 0 ? "COLLECTED" : "COLLECTION_FAILED";

  return RadarYoutubeSearchRunSchema.parse({
    researchMode: "YOUTUBE",
    runId: input.runId,
    runVersion: input.runVersion,
    startedAt: input.startedAt,
    startedBy: input.startedBy,
    state,
    fingerprint: input.fingerprint,
    provenance: input.provenance,
    queries: [...input.queries],
    results: [...input.results],
    universe: [...input.universe],
    selectedVideoIds: radarYoutubeApplySelection({ universe: input.universe, selectedVideoIds: input.selectedVideoIds || [] }),
    limitations: [...(input.limitations || [])],
  });
}
