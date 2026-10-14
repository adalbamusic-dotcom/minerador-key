import { readGoogleAdsEmptyVolumeResponse, readGoogleAdsLastEmptyVolumeResponse } from "../minerador/volume-eligibility.ts";
import { isValidGoogleAdsDemandMeasurement } from "../minerador/google-ads-demand.ts";

/*
 * LER ANTES DE BUSCAR — F3 da SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`
 * (item 3; decisão D4 do dono, 2026-10-13).
 *
 * Toda operação que chama IA, Google Ads ou DataForSEO lê ANTES, de graça, o
 * que já temos: o volume já medido de cada keyword (inclusive "o Google Ads não
 * tem média"), a SERP em cache, o KeywordDNA, o Assunto, o plano e a trava. Só
 * então diz "já temos X · falta Y · custa Z" e pede autorização para pagar.
 *
 * D4 — por quanto tempo o volume medido é "conhecido":
 *   - volume medido no Google Ads: SEMPRE, até "Medir de novo" explícito
 *     (no Minerador, botão "Volume" sobre as keywords marcadas);
 *   - "o Google Ads não tem média": por 30 dias a partir da resposta;
 *   - volume de outro provider (outra era, "Bruto"): não é medição do Google
 *     Ads — falta medir, e a medição custa cota (sem custo em dólar).
 *
 * Domínio puro: sem banco, sem rede, sem credencial. Quem lê do banco é
 * `lib/server/known-before-search.ts`, por id e em projeção estreita.
 */

/** "Sem média" do Google Ads vale como medido por este prazo (D4). */
export const KNOWN_NO_AVERAGE_TTL_DAYS = 30;
const DIA_MS = 24 * 60 * 60 * 1000;
/** A medição de métricas do Google Ads vai em lotes deste tamanho (`GOOGLE_ADS_VOLUME_BATCH_SIZE`). */
export const KNOWN_GOOGLE_ADS_METRICS_BATCH = 10_000;

export type KnownVolumeMissingReason = "never_measured" | "other_provider" | "no_average_expired" | "measurement_failed";

export type KnownVolume =
  | { state: "measured"; volume: number; measuredAt: string | null }
  | { state: "no_average"; measuredAt: string; validUntil: string }
  | { state: "missing"; reason: KnownVolumeMissingReason; previousVolume: number | null; previousSource: string | null; measuredAt: string | null };

/** A linha mínima que o leitor precisa (a do banco ou a projeção estreita do servidor). */
export type KnownVolumeRow = {
  volume_search?: unknown;
  volume_source?: unknown;
  analise_semantica?: Record<string, unknown> | null;
};

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const timestamp = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const texto = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * O que já sabemos do volume de UMA keyword. Nunca chama provider: lê a
 * coluna, a medição gravada e a elegibilidade que o Minerador grava.
 */
export function readKnownVolume(row: KnownVolumeRow, now: Date): KnownVolume {
  const semantic = record(row.analise_semantica) ?? {};
  const source = texto(row.volume_source)?.toLowerCase() ?? null;
  const coluna = finite(row.volume_search);
  const medicao = record(semantic.volume_measurement);
  const medidoEm = timestamp(medicao?.measuredAt) ?? timestamp(record(semantic.volume_eligibility)?.measuredAt);
  // 1. Volume medido no Google Ads — vale sempre (D4), até "Medir de novo" explícito.
  if (source === "google_ads" && coluna !== null && coluna >= 0) return { state: "measured", volume: coluna, measuredAt: medidoEm };
  if (isValidGoogleAdsDemandMeasurement(medicao)) {
    const media = finite(medicao?.averageMonthlySearches) ?? finite(medicao?.rawVolume) ?? 0;
    return { state: "measured", volume: media, measuredAt: timestamp(medicao?.measuredAt) };
  }
  // 2. "O Google Ads não tem média": medido, por 30 dias.
  const vazio = readGoogleAdsEmptyVolumeResponse(semantic) ?? readGoogleAdsLastEmptyVolumeResponse(semantic);
  if (vazio) {
    const ate = Date.parse(vazio.measuredAt) + KNOWN_NO_AVERAGE_TTL_DAYS * DIA_MS;
    if (ate > now.getTime()) return { state: "no_average", measuredAt: vazio.measuredAt, validUntil: new Date(ate).toISOString() };
    return { state: "missing", reason: "no_average_expired", previousVolume: coluna, previousSource: source, measuredAt: vazio.measuredAt };
  }
  const elegibilidade = record(semantic.volume_eligibility);
  if (elegibilidade?.status === "measurement_failed") return { state: "missing", reason: "measurement_failed", previousVolume: coluna, previousSource: source, measuredAt: timestamp(elegibilidade.measuredAt) };
  // 3. Volume de outro provider (outra era): não é medição do Google Ads.
  if (coluna !== null) return { state: "missing", reason: "other_provider", previousVolume: coluna, previousSource: source, measuredAt: null };
  return { state: "missing", reason: "never_measured", previousVolume: null, previousSource: source, measuredAt: null };
}

/** Conhecido = não precisa ir ao Google Ads de novo. */
export const isKnownVolume = (known: KnownVolume): boolean => known.state !== "missing";

export const KNOWN_VOLUME_MISSING_LABELS: Record<KnownVolumeMissingReason, string> = {
  never_measured: "nunca medida",
  other_provider: "volume de outro provider",
  no_average_expired: "“sem média” com mais de 30 dias",
  measurement_failed: "a última medição falhou",
};

/**
 * O RESUMO DO DNA QUE A IA RECEBE (regra 4 do item 3): intenção, entidade,
 * funil, público e problema de cada keyword que ela vai ler — a IA não decide
 * no escuro. Só o que existe; nunca id, nunca texto longo.
 */
export type KeywordDnaSummary = { intencao?: string; entidade?: string; funil?: string; publico?: string; problema?: string };
const RESUMO_MAX = 80;
const curto = (value: string | null | undefined): string | undefined => {
  const plain = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!plain) return undefined;
  return plain.length > RESUMO_MAX ? `${plain.slice(0, RESUMO_MAX - 1).trimEnd()}…` : plain;
};
export function keywordDnaSummary(signals: { intent?: string | null; centralEntity?: string | null; funnel?: string | null; audience?: string | null; perceivedProblem?: string | null } | null | undefined): KeywordDnaSummary | undefined {
  if (!signals) return undefined;
  const resumo: KeywordDnaSummary = {};
  const intencao = curto(signals.intent); if (intencao) resumo.intencao = intencao;
  const entidade = curto(signals.centralEntity); if (entidade) resumo.entidade = entidade;
  const funil = curto(signals.funnel); if (funil) resumo.funil = funil;
  const publico = curto(signals.audience); if (publico) resumo.publico = publico;
  const problema = curto(signals.perceivedProblem); if (problema) resumo.problema = problema;
  return Object.keys(resumo).length ? resumo : undefined;
}

/* ------------------------------ o plano "já temos · falta · custa" ------------------------------ */

export type KnownBeforeSearchInput = {
  /** As keywords ligadas aos alvos (membros e mesmo tema), com o que já se sabe de cada uma. */
  keywords: ReadonlyArray<{ keywordId: string; keyword: string; volume: KnownVolume; serpComplete: boolean; dnaIntent: boolean }>;
  subjects: number;
  lockedPrincipals: number;
  mineradorLists: number;
  /** A execução anterior com os mesmos insumos, de onde vieram IA, medições e busca. */
  reusedRunId: string | null;
  aiReadingReused: boolean;
  /** Falta a leitura da IA (alvos sem proposta e lista com volume): `null` = não falta. */
  aiReading: { targets: number; listSize: number } | null;
  /** O passo "Validar no Google" (DataForSEO), já com o cache descontado. */
  serp: { calls: number; costUsd: { min: number; max: number } };
  /** O que esta preparação chamou com a autorização (zero na leitura grátis). */
  done?: { aiCalls: number; measuredKeywords: number; googleAdsCalls: number };
};

export type KnownBeforeSearchPlan = {
  version: 1;
  known: {
    keywords: number;
    volumeMeasured: number;
    noAverageRecent: number;
    serpComplete: number;
    dnaWithIntent: number;
    subjects: number;
    lockedPrincipals: number;
    mineradorLists: number;
    reusedRunId: string | null;
    aiReadingReused: boolean;
  };
  missing: {
    volumeToMeasure: number;
    /** Até 20, para a tela e o MCP dizerem quais. */
    volumeToMeasureSample: Array<{ keywordId: string; keyword: string; reason: KnownVolumeMissingReason }>;
    aiReading: { targets: number; listSize: number } | null;
    serpQueries: number;
  };
  plan: {
    googleAds: { keywords: number; calls: number; moneyUsd: 0; quota: true };
    /** O custo da IA (OpenRouter) é cobrado por uso de tokens: não há valor fixo para mostrar. */
    ai: { calls: number; costUsd: null; provider: "OpenRouter" };
    dataForSeo: { calls: number; costUsd: { min: number; max: number } };
  };
  /** Nada a pagar: nem cota, nem IA, nem DataForSEO. Só então o botão pode dizer "grátis". */
  free: boolean;
  /** Falta algo que a leitura paga (IA e medição) resolve, antes do "Validar no Google". */
  needsPaidReading: boolean;
  done: { aiCalls: number; measuredKeywords: number; googleAdsCalls: number };
};

export function buildKnownBeforeSearchPlan(input: KnownBeforeSearchInput): KnownBeforeSearchPlan {
  const porId = new Map(input.keywords.map(item => [item.keywordId, item]));
  const lista = [...porId.values()];
  const faltam = lista.filter(item => item.volume.state === "missing");
  const medir = faltam.length;
  const aiCalls = input.aiReading && input.aiReading.targets > 0 && input.aiReading.listSize > 0 ? 1 : 0;
  const googleAdsCalls = medir ? Math.ceil(medir / KNOWN_GOOGLE_ADS_METRICS_BATCH) : 0;
  const serpCalls = Math.max(0, Math.floor(input.serp.calls));
  return {
    version: 1,
    known: {
      keywords: lista.length,
      volumeMeasured: lista.filter(item => item.volume.state === "measured").length,
      noAverageRecent: lista.filter(item => item.volume.state === "no_average").length,
      serpComplete: lista.filter(item => item.serpComplete).length,
      dnaWithIntent: lista.filter(item => item.dnaIntent).length,
      subjects: input.subjects,
      lockedPrincipals: input.lockedPrincipals,
      mineradorLists: input.mineradorLists,
      reusedRunId: input.reusedRunId,
      aiReadingReused: input.aiReadingReused,
    },
    missing: {
      volumeToMeasure: medir,
      volumeToMeasureSample: faltam.slice(0, 20).map(item => ({ keywordId: item.keywordId, keyword: item.keyword, reason: (item.volume as Extract<KnownVolume, { state: "missing" }>).reason })),
      aiReading: aiCalls ? input.aiReading : null,
      serpQueries: serpCalls,
    },
    plan: {
      googleAds: { keywords: medir, calls: googleAdsCalls, moneyUsd: 0, quota: true },
      ai: { calls: aiCalls, costUsd: null, provider: "OpenRouter" },
      dataForSeo: { calls: serpCalls, costUsd: { min: input.serp.costUsd.min, max: input.serp.costUsd.max } },
    },
    free: googleAdsCalls === 0 && aiCalls === 0 && serpCalls === 0,
    needsPaidReading: googleAdsCalls > 0 || aiCalls > 0,
    done: input.done ?? { aiCalls: 0, measuredKeywords: 0, googleAdsCalls: 0 },
  };
}

const usd = (value: number) => `US$ ${value.toFixed(2).replace(".", ",")}`;

/** As três frases, as MESMAS na tela e no MCP. */
export function knownBeforeSearchSentences(plan: KnownBeforeSearchPlan): { known: string; missing: string; cost: string; done: string | null } {
  const k = plan.known;
  const partes = [
    `volume medido de ${k.volumeMeasured} de ${k.keywords} keyword(s) ligadas aos alvos${k.noAverageRecent ? ` (+${k.noAverageRecent} “sem média” no Google Ads há menos de ${KNOWN_NO_AVERAGE_TTL_DAYS} dias, que não são medidas de novo)` : ""}`,
    `SERP das 4 lentes em cache de ${k.serpComplete}`,
    `DNA com intenção de ${k.dnaWithIntent}`,
    k.subjects ? `${k.subjects} Assunto(s)${k.lockedPrincipals ? `, ${k.lockedPrincipals} com principal travada` : ""}` : null,
    k.mineradorLists ? `${k.mineradorLists} lista(s) da Pesquisa por Assunto` : null,
    k.aiReadingReused ? "a leitura da IA da preparação anterior com os mesmos insumos" : null,
  ].filter((parte): parte is string => Boolean(parte));
  const m = plan.missing;
  const falta = [
    m.volumeToMeasure ? `medir ${m.volumeToMeasure} keyword(s) no Google Ads` : null,
    m.aiReading ? `1 leitura da IA (${m.aiReading.targets} alvo(s) sem proposta, lista de ${m.aiReading.listSize})` : null,
    m.serpQueries ? `${m.serpQueries} consulta(s) de SERP no passo “Validar no Google”` : null,
  ].filter((parte): parte is string => Boolean(parte));
  const p = plan.plan;
  const custo = [
    p.googleAds.calls ? `Google Ads: ${p.googleAds.calls} consulta(s) de métricas para ${p.googleAds.keywords} keyword(s) — sem custo em dólar, usa a cota da marca` : null,
    p.ai.calls ? `IA: ${p.ai.calls} chamada (${p.ai.provider}, cobrada pelo uso)` : null,
    p.dataForSeo.calls ? `DataForSEO: ${p.dataForSeo.calls} consulta(s), ${usd(p.dataForSeo.costUsd.min)} a ${usd(p.dataForSeo.costUsd.max)} (só no “Validar no Google”, com o seu aceite)` : null,
  ].filter((parte): parte is string => Boolean(parte));
  const d = plan.done;
  const feito = d.aiCalls || d.measuredKeywords
    ? `Chamado agora, com a sua autorização: ${[d.measuredKeywords ? `${d.measuredKeywords} keyword(s) medida(s) no Google Ads (${d.googleAdsCalls} consulta(s))` : null, d.aiCalls ? `${d.aiCalls} leitura da IA` : null].filter(Boolean).join(" e ")}.`
    : null;
  return {
    known: `Já temos: ${partes.join("; ")}.`,
    missing: falta.length ? `Falta: ${falta.join("; ")}.` : "Falta: nada — tudo o que esta análise precisa já está lido.",
    cost: custo.length ? `Custa: ${custo.join("; ")}.` : "Custa: nada (grátis).",
    done: feito,
  };
}

/** O botão da leitura paga diz o que chama e o que custa. Sem nada a pagar, não há botão. */
export function knownBeforeSearchAuthorizeLabel(plan: KnownBeforeSearchPlan): string | null {
  const medir = plan.plan.googleAds.keywords, ia = plan.plan.ai.calls;
  if (!medir && !ia) return null;
  if (medir && ia) return `Ler com IA e medir · 1 chamada de IA + ${medir} keyword(s) no Google Ads (cota)`;
  if (ia) return "Ler com IA · 1 chamada de IA (OpenRouter)";
  return `Medir ${medir} keyword(s) no Google Ads · cota, sem custo em dólar`;
}
