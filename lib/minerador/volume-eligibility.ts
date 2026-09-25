export const MINIMUM_OFFICIAL_MONTHLY_VOLUME = 120;

export type VolumeEligibilityStatus =
  | "pending"
  | "eligible"
  | "below_threshold"
  | "unavailable"
  | "measurement_failed";

type VolumeEligibilitySemantic = Record<string, unknown> & {
  volume_eligibility?: Record<string, unknown>;
};

export type VolumeEligibilityRow = {
  status: string;
  volume_search: number | null;
  analise_semantica?: VolumeEligibilitySemantic | null;
};

const knownStatuses = new Set<VolumeEligibilityStatus>([
  "pending", "eligible", "below_threshold", "unavailable", "measurement_failed",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readVolumeEligibility(row: VolumeEligibilityRow): VolumeEligibilityStatus {
  if (row.status === "publicado") return "eligible";
  const eligibility = record(row.analise_semantica?.volume_eligibility);
  const explicit = eligibility?.status;
  if (typeof explicit === "string" && knownStatuses.has(explicit as VolumeEligibilityStatus)) return explicit as VolumeEligibilityStatus;
  return "pending";
}

export function volumeEligibilityLabel(status: VolumeEligibilityStatus): string {
  return ({
    pending: "Pendente de medição",
    eligible: "Elegível por volume",
    below_threshold: "Inelegível · abaixo do corte",
    unavailable: "Inelegível · sem volume oficial",
    measurement_failed: "Medição falhou",
  } as const)[status];
}

export function volumeEligibilityFromOfficialMeasurement(averageMonthlySearches: number | null): VolumeEligibilityStatus {
  if (averageMonthlySearches === null) return "unavailable";
  return averageMonthlySearches >= MINIMUM_OFFICIAL_MONTHLY_VOLUME ? "eligible" : "below_threshold";
}

export function setVolumeEligibility(
  semantic: VolumeEligibilitySemantic | null | undefined,
  input: {
    status: VolumeEligibilityStatus;
    measuredAt: string;
    provider: "google_ads";
    providerVersion: "v25";
    averageMonthlySearches: number | null;
    googleAdsRequestId: string | null;
    /** Só na resposta sem média: devolvida sem média ou não devolvida no lote. */
    emptyResponseKind?: GoogleAdsEmptyVolumeResponseKind;
  },
): VolumeEligibilitySemantic {
  return {
    ...(semantic || {}),
    volume_eligibility: {
      status: input.status,
      threshold: MINIMUM_OFFICIAL_MONTHLY_VOLUME,
      provider: input.provider,
      providerVersion: input.providerVersion,
      measuredAt: input.measuredAt,
      averageMonthlySearches: input.averageMonthlySearches,
      googleAdsRequestId: input.googleAdsRequestId,
      ...(input.emptyResponseKind ? { emptyResponseKind: input.emptyResponseKind } : {}),
    },
  };
}

/**
 * RESPOSTA DO GOOGLE ADS SEM MÉDIA (decisão do dono, 2026-09-25).
 *
 * O Google Ads respondeu à consulta da keyword e não trouxe média mensal. É
 * processo executado, não falha: a rota grava `volume_eligibility` com
 * `status: "unavailable"`, `provider: "google_ads"` e o `measuredAt` da
 * resposta, e o volume continua `null` (ADR-020: ausência nunca vira zero).
 *
 * `null` quando não há esse registro — inclusive quando o registro é de
 * outro provider, não tem data legível ou traz um número.
 */
export type GoogleAdsEmptyVolumeResponse = { measuredAt: string; googleAdsRequestId: string | null };

/**
 * Por que a resposta veio sem média — para o diagnóstico separar ausência real
 * de defeito de casamento (normalizador):
 *   returned_without_average  o Google Ads devolveu a keyword sem média;
 *   not_returned              o Google Ads respondeu ao lote e não devolveu a
 *                             keyword (ou o casamento não a achou).
 * Registros anteriores a 2026-09-25 não têm o campo.
 */
export type GoogleAdsEmptyVolumeResponseKind = "returned_without_average" | "not_returned";

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function emptyResponseFrom(value: unknown): GoogleAdsEmptyVolumeResponse | null {
  const item = record(value);
  if (!item || item.provider !== "google_ads" || !validTimestamp(item.measuredAt)) return null;
  if (item.averageMonthlySearches !== null && item.averageMonthlySearches !== undefined) return null;
  return { measuredAt: item.measuredAt, googleAdsRequestId: typeof item.googleAdsRequestId === "string" ? item.googleAdsRequestId : null };
}

export function readGoogleAdsEmptyVolumeResponse(semantic: Record<string, unknown> | null | undefined): GoogleAdsEmptyVolumeResponse | null {
  const eligibility = record(semantic?.volume_eligibility);
  if (eligibility?.status !== "unavailable") return null;
  return emptyResponseFrom(eligibility);
}

/**
 * Resposta sem média que chegou DEPOIS de um número válido. O número fica
 * (resposta vazia não apaga dado), e a data da resposta vazia fica aqui, em
 * `volume_eligibility.lastEmptyResponse`.
 */
export function readGoogleAdsLastEmptyVolumeResponse(semantic: Record<string, unknown> | null | undefined): GoogleAdsEmptyVolumeResponse | null {
  return emptyResponseFrom(record(semantic?.volume_eligibility)?.lastEmptyResponse);
}

export function isOperationallyEligible(row: VolumeEligibilityRow): boolean {
  return row.status === "publicado" || readVolumeEligibility(row) === "eligible";
}

export type VolumeReadbackOutcome = "confirmed" | "confirmed_empty" | "empty" | "failed";

/**
 * Como a tela classifica cada keyword depois da rota responder e do readback.
 *
 *   confirmed        número novo lido de volta com a data da resposta
 *   confirmed_empty  resposta sem média lida de volta com a data da resposta
 *   empty            o Google Ads não devolveu a keyword (sem média), e a
 *                    releitura não trouxe o registro; continua sem dado,
 *                    nunca "falha"
 *   failed           recebida, mas a releitura não confirmou — erro de verdade
 *
 * Erro de rede, 4xx/5xx e releitura que falhou a leitura são tratados antes,
 * pela tela, e continuam "Erro".
 */
export function classifyVolumeReadback(input: {
  projection?: { volumeSearch?: number | null; measuredAt?: string | null } | null;
  unmatched: boolean;
  row?: { analise_semantica?: Record<string, unknown> | null } | null;
  /** O processo Volume está completo na linha relida (`resolveMineradorProcessState`). */
  volumeComplete: boolean;
}): VolumeReadbackOutcome {
  const measuredAt = input.projection?.measuredAt;
  const semantic = input.row?.analise_semantica || null;
  if (input.projection && typeof measuredAt === "string" && semantic) {
    const measurement = semantic.volume_measurement;
    const measurementAt = measurement && typeof measurement === "object" ? (measurement as Record<string, unknown>).measuredAt : null;
    if (input.volumeComplete && measurementAt === measuredAt) return "confirmed";
    if (input.projection.volumeSearch === null || input.projection.volumeSearch === undefined) {
      const empty = readGoogleAdsEmptyVolumeResponse(semantic);
      const lastEmpty = readGoogleAdsLastEmptyVolumeResponse(semantic);
      if (empty?.measuredAt === measuredAt || lastEmpty?.measuredAt === measuredAt) return "confirmed_empty";
    }
  }
  if (input.unmatched) return "empty";
  return "failed";
}
