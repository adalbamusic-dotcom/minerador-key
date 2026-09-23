import { z } from "zod";
import {
  SERP_CACHE_DEFAULT_MAX_AGE_MS,
  SERP_CACHE_LENSES,
  SERP_CACHE_OBSERVATION_DEPTH,
  SerpCacheCollectorSchema,
  SerpCacheObservationSchema,
  serpCacheLensLabel,
  type SerpCacheLens,
  type SerpCacheMeta,
  type SerpCacheObservation,
} from "../../editorial/serp-cache.ts";

/**
 * AS QUATRO LENTES DA SERP DO RADAR — o contrato copiado para o snapshot.
 *
 * SDD do Radar nas quatro lentes (docs/05-radar/propostas/sdd-radar-quatro-
 * lentes-cache-2026-09-23.md), R2. O Radar lia a SERP canônica do artigo numa
 * lente só, `desktop` sem sistema, no endpoint `regular`, que anuncia PAA e AI
 * Overview e não os entrega. Agora as lentes são decididas no SERVIDOR: as
 * quatro do produto (`SERP_CACHE_LENSES`), endpoint `advanced`, cache primeiro.
 *
 * O snapshot guarda uma CÓPIA do que cada lente observou — nunca um ponteiro
 * para a entrada de cache (invariante 30): a entrada pode ser regravada ou
 * vencer, e o snapshot continua dizendo o que foi lido.
 *
 * A cópia leva a observação compacta (~0,93 KB por lente) e NUNCA o digest
 * orgânico (~5 KB): o Radar não o lê, e copiá-lo quadruplicaria o snapshot.
 *
 * Domínio puro: sem rede, sem storage, sem provider. Roda no cliente também —
 * o registro da coleta é validado no navegador.
 */

export const RADAR_SERP_LENS_SET_VERSION = "radar-lens-set-v1" as const;

/** Os rótulos na ordem de `SERP_CACHE_LENSES`. A canônica é a primeira. */
export const RADAR_SERP_LENS_LABELS = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"] as const;
export type RadarSerpLensLabel = (typeof RADAR_SERP_LENS_LABELS)[number];
export const RadarSerpLensLabelSchema = z.enum(RADAR_SERP_LENS_LABELS);

/**
 * A janela do snapshot: o top 10, venha a SERP de uma coleta de 10 ou de 20.
 *
 * Medido em 2026-09-23 sobre a fixture advanced desktop-windows: o mesmo corpo
 * em profundidade 20 e recortado a 10 dá hashes diferentes (só
 * `rawItemTypeCounts` muda). Sem janela fixa, um acerto de cache e uma coleta
 * nova do mesmo corpo abririam versões diferentes.
 */
export const RADAR_SERP_SNAPSHOT_DEPTH = SERP_CACHE_OBSERVATION_DEPTH;

/**
 * A canônica é PAGA em 20: é a profundidade da CALL 3 do Minerador, e a escrita
 * do cache troca uma entrada mais rasa. Pagar 10 aqui obrigaria o Minerador a
 * pagar de novo a mesma lente.
 */
export const RADAR_SERP_CANONICAL_COLLECTION_DEPTH = 20;

/** As extras pagam 10, sem corpo: nenhum leitor delas pede mais que o top 10. */
export const RADAR_SERP_EXTRA_LENS_DEPTH = SERP_CACHE_OBSERVATION_DEPTH;

/** D4 (pendente): o teto de idade da SERP do Radar. Até a decisão, o padrão do cache. */
export const RADAR_SERP_MAX_AGE_MS = SERP_CACHE_DEFAULT_MAX_AGE_MS;

/** D4: diferença de datas entre lentes que passa a ser MARCADA — nunca recoletada sozinha. */
export const RADAR_SERP_LENS_DATE_SPREAD_FLAG_DAYS = 7;

/** D5 (recomendado): "Recoletar agora (pago)" paga as quatro lentes, para manter as datas alinhadas. */
export const RADAR_SERP_RECOLLECT_CALLS = SERP_CACHE_LENSES.length;

/**
 * Por que a lente faltou:
 *   provider_refused  a task voltou recusada pelo provider (40xxx) — definitiva;
 *   no_organic        a SERP voltou sem nenhum orgânico — definitiva;
 *   request_failed    rede, HTTP ou erro 50xxx — transitória;
 *   not_observed      nenhuma tentativa chegou a esta lente.
 *
 * Lacuna DEFINITIVA não é paga de novo a cada clique. Ela não entra no cache
 * (o cache não grava recusa nem SERP vazia), e "sem mudança" devolve o
 * snapshot anterior sem gravar nada — então não há onde guardar uma janela de
 * nova tentativa: uma janela contada da tentativa gravada venceria e, dali em
 * diante, cada clique pagaria a lente outra vez. A lacuna do snapshot anterior
 * comparável é copiada enquanto o cache não tiver a lente; ela é tentada de
 * novo com "Recoletar agora (pago)", quando outro módulo grava a lente no
 * cache, ou quando a pergunta muda (outra versão do ArticleDNA ou do
 * KeywordDNA). Falha transitória é sempre tentada de novo.
 */
export const RADAR_SERP_LENS_MISSING_KINDS = ["provider_refused", "no_organic", "request_failed", "not_observed"] as const;
export type RadarSerpLensMissingKind = (typeof RADAR_SERP_LENS_MISSING_KINDS)[number];
const LACUNAS_DEFINITIVAS: ReadonlySet<RadarSerpLensMissingKind> = new Set(["provider_refused", "no_organic"]);

/** O texto que o próprio núcleo escreve para a SERP vazia — usado só para ler lacuna gravada sem `missingKind`. */
export const RADAR_SERP_NO_ORGANIC_REASON = "A lente voltou sem nenhum resultado orgânico. Pode ser resposta vazia transitória, e ela não foi guardada no cache.";

export const radarSerpLensLabel = (lens: SerpCacheLens) => serpCacheLensLabel(lens) as RadarSerpLensLabel;

/**
 * Instante em ISO com `Z`.
 *
 * O PostgREST devolve `timestamptz` com `+00:00`, e `z.string().datetime()`
 * recusa deslocamento. A data do snapshot sai sempre por aqui.
 */
export function normalizeRadarSerpInstant(value: string): string {
  const instante = new Date(value);
  if (Number.isNaN(instante.getTime())) throw new Error(`Data de coleta ilegível: ${value}`);
  return instante.toISOString();
}

const Instante = z.string().datetime({ offset: true });

export const RadarSerpLensSourceSchema = z.enum(["cache", "paid"]);
export type RadarSerpLensSource = z.infer<typeof RadarSerpLensSourceSchema>;

export const RadarSerpLensEntrySchema = z.object({
  lens: RadarSerpLensLabelSchema,
  status: z.enum(["observed", "missing"]),
  /** Só na lente faltante: por que ela não entrou. */
  missingReason: z.string().min(1).nullable(),
  /** `cache`: entrada válida reaproveitada; `paid`: paga nesta coleta. */
  source: RadarSerpLensSourceSchema.nullable(),
  /** Quem pagou a entrada — Minerador, Arquiteto ou o próprio Radar. */
  collectedBy: SerpCacheCollectorSchema.nullable(),
  /** Quando o provider observou esta lente. É a idade que a tela mostra. */
  collectedAt: Instante.nullable(),
  /** Profundidade da entrada usada (20 na canônica paga pelo Minerador ou pelo Radar). */
  depth: z.number().int().positive().max(100).nullable(),
  providerRequestId: z.string().min(1).nullable(),
  /** A observação compacta COPIADA — sem digest. Ausente na lente faltante. */
  observation: SerpCacheObservationSchema.optional(),
  /** Só na lente faltante, opcional (lacunas gravadas antes não têm): o tipo da falta. */
  missingKind: z.enum(RADAR_SERP_LENS_MISSING_KINDS).optional(),
  /** Só na lente faltante, opcional: quando a tentativa que faltou foi feita. */
  attemptedAt: Instante.optional(),
}).strict().superRefine((entrada, ctx) => {
  if (entrada.status === "observed") {
    if (entrada.missingKind !== undefined || entrada.attemptedAt !== undefined) {
      ctx.addIssue({ code: "custom", message: "Lente observada não tem tipo de falta nem tentativa.", path: ["missingKind"] });
    }
    if (!entrada.observation) ctx.addIssue({ code: "custom", message: "Lente observada sem observação copiada.", path: ["observation"] });
    if (!entrada.source || !entrada.collectedBy || !entrada.collectedAt || !entrada.depth) {
      ctx.addIssue({ code: "custom", message: "Lente observada sem proveniência completa.", path: ["source"] });
    }
    if (entrada.missingReason !== null) ctx.addIssue({ code: "custom", message: "Lente observada não tem motivo de falta.", path: ["missingReason"] });
    if (entrada.observation && entrada.observation.lens !== entrada.lens) {
      ctx.addIssue({ code: "custom", message: "A observação copiada é de outra lente.", path: ["observation", "lens"] });
    }
    return;
  }
  if (entrada.observation) ctx.addIssue({ code: "custom", message: "Lente faltante não carrega observação.", path: ["observation"] });
  if (!entrada.missingReason) ctx.addIssue({ code: "custom", message: "Lente faltante precisa declarar o motivo.", path: ["missingReason"] });
});
export type RadarSerpLensEntry = z.infer<typeof RadarSerpLensEntrySchema>;

export const RadarSerpLensSetSchema = z.object({
  version: z.literal(RADAR_SERP_LENS_SET_VERSION),
  /** As quatro lentes, sempre, na ordem de `SERP_CACHE_LENSES`. Faltar é declarado, nunca omitido. */
  lenses: z.array(RadarSerpLensEntrySchema).length(RADAR_SERP_LENS_LABELS.length),
}).strict().superRefine((conjunto, ctx) => {
  conjunto.lenses.forEach((entrada, indice) => {
    if (entrada.lens !== RADAR_SERP_LENS_LABELS[indice]) {
      ctx.addIssue({ code: "custom", message: `A lente ${indice + 1} deveria ser ${RADAR_SERP_LENS_LABELS[indice]}.`, path: ["lenses", indice, "lens"] });
    }
  });
});
export type RadarSerpLensSet = z.infer<typeof RadarSerpLensSetSchema>;

/**
 * De onde veio a SERP canônica do snapshot. Cópia, sem id de entrada de cache:
 * um id seria ponteiro.
 *
 * Os campos opcionais (ausentes nos snapshots gravados antes deles) dizem o que
 * a SERP de fato consultou: `location`/`language` do snapshot guardam o texto
 * do pedido ("Brasil", "pt-BR"), mas a consulta, a chave do cache e o hash usam
 * os CÓDIGOS do alvo da keyword. `snapshotOpenedAt` é quando esta versão foi
 * aberta; `collectedAt` é quando o provider observou a SERP — com cache, pode
 * ser anterior à versão que ela substituiu.
 */
export const RadarSerpCodesSourceSchema = z.enum(["keyword_targeting", "environment"]);
export type RadarSerpCodesSource = z.infer<typeof RadarSerpCodesSourceSchema>;

export const RadarSerpCacheProvenanceSchema = z.object({
  source: RadarSerpLensSourceSchema,
  collectedBy: SerpCacheCollectorSchema,
  providerRequestId: z.string().min(1).nullable(),
  cacheCollectedAt: Instante,
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(1).optional(),
  codesSource: RadarSerpCodesSourceSchema.optional(),
  snapshotOpenedAt: Instante.optional(),
}).strict();
export type RadarSerpCacheProvenance = z.infer<typeof RadarSerpCacheProvenanceSchema>;

/* ------------------------------ montagem ------------------------------ */

export function radarSerpObservedLens(input: {
  lens: SerpCacheLens;
  source: RadarSerpLensSource;
  meta: Pick<SerpCacheMeta, "collectedBy" | "collectedAt" | "depth" | "providerRequestId">;
  observation: SerpCacheObservation;
}): RadarSerpLensEntry {
  return RadarSerpLensEntrySchema.parse({
    lens: radarSerpLensLabel(input.lens),
    status: "observed",
    missingReason: null,
    source: input.source,
    collectedBy: input.meta.collectedBy,
    collectedAt: normalizeRadarSerpInstant(input.meta.collectedAt),
    depth: input.meta.depth,
    providerRequestId: input.meta.providerRequestId,
    // Pelo schema: a ordem das chaves sai a do contrato, venha do jsonb ou da memória.
    observation: SerpCacheObservationSchema.parse(input.observation),
  });
}

export function radarSerpMissingLens(
  lens: SerpCacheLens,
  reason: string,
  detail?: { kind: RadarSerpLensMissingKind; attemptedAt?: string },
): RadarSerpLensEntry {
  return RadarSerpLensEntrySchema.parse({
    lens: radarSerpLensLabel(lens),
    status: "missing",
    missingReason: reason.trim().slice(0, 500) || "Lente não observada.",
    source: null,
    collectedBy: null,
    collectedAt: null,
    depth: null,
    providerRequestId: null,
    ...(detail ? { missingKind: detail.kind } : {}),
    ...(detail?.attemptedAt ? { attemptedAt: normalizeRadarSerpInstant(detail.attemptedAt) } : {}),
  });
}

/**
 * O tipo da falta. Lacuna gravada antes de `missingKind` é lida pelo texto que
 * o próprio núcleo escreveu: "(provider 40xxx" é recusa, a frase da SERP vazia
 * é zero orgânico. Sem nenhum dos dois, é transitória — e é tentada de novo.
 */
export function radarSerpLensMissingKindOf(entrada: RadarSerpLensEntry | null | undefined): RadarSerpLensMissingKind | null {
  if (!entrada || entrada.status !== "missing") return null;
  if (entrada.missingKind) return entrada.missingKind;
  const motivo = entrada.missingReason || "";
  if (/\(provider 4\d{4}\b/.test(motivo)) return "provider_refused";
  if (motivo === RADAR_SERP_NO_ORGANIC_REASON) return "no_organic";
  return "request_failed";
}

/**
 * A lacuna do snapshot anterior pode ser copiada em vez de paga de novo?
 * Só a DEFINITIVA (recusa 40xxx do provider ou zero orgânico). Quem chama
 * garante o resto: snapshot anterior comparável, lente ausente do cache e
 * nenhuma recoleta paga pedida.
 */
export function radarSerpReusableLensGap(entrada: RadarSerpLensEntry | null | undefined): boolean {
  const tipo = radarSerpLensMissingKindOf(entrada);
  return tipo !== null && LACUNAS_DEFINITIVAS.has(tipo);
}

export function buildRadarSerpLensSet(lenses: readonly RadarSerpLensEntry[]): RadarSerpLensSet {
  return RadarSerpLensSetSchema.parse({ version: RADAR_SERP_LENS_SET_VERSION, lenses });
}

/**
 * O que das lentes entra no hash do snapshot: rótulo, estado e observação.
 *
 * Data, origem e `providerRequestId` ficam FORA — como já ficam na canônica:
 * a mesma SERP relida ou recoletada não é conteúdo novo.
 */
export function radarSerpLensHashParts(lensSet: RadarSerpLensSet) {
  return lensSet.lenses.map(entrada => ({
    lens: entrada.lens,
    status: entrada.status,
    observation: entrada.observation ? SerpCacheObservationSchema.parse(entrada.observation) : null,
  }));
}

/**
 * O cache ainda serve EXATAMENTE as entradas que o snapshot copiou?
 *
 * Só quando as quatro lentes do snapshot foram observadas e o cache devolve,
 * para cada uma, a mesma coleta (mesmo `providerRequestId` e mesma data). É o
 * atalho de "Atualizar SERP" sem mudança: nenhum corpo é lido.
 *
 * `reusableGaps[i]` (de `radarSerpReusableLensGap`) aceita uma lacuna
 * definitiva no lugar da lente observada — desde que o cache continue
 * sem entrada para ela. Se a lente apareceu no cache, ela é lida.
 */
export function radarSerpLensSetMatchesCache(
  lensSet: RadarSerpLensSet,
  hits: ReadonlyArray<Pick<SerpCacheMeta, "providerRequestId" | "collectedAt"> | null>,
  reusableGaps?: readonly boolean[],
): boolean {
  if (hits.length !== lensSet.lenses.length) return false;
  if (!lensSet.lenses.some(entrada => entrada.status === "observed")) return false;
  return lensSet.lenses.every((entrada, indice) => {
    const hit = hits[indice];
    if (entrada.status === "missing" && reusableGaps?.[indice] === true && !hit) return true;
    if (entrada.status !== "observed" || !hit || !entrada.collectedAt || !entrada.providerRequestId) return false;
    if (hit.providerRequestId !== entrada.providerRequestId) return false;
    const gravada = Date.parse(entrada.collectedAt);
    const noCache = Date.parse(hit.collectedAt);
    return Number.isFinite(gravada) && Number.isFinite(noCache) && gravada === noCache;
  });
}
