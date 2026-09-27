/**
 * PESQUISA POR ASSUNTO — volume primeiro (regras-serp-e-assuntos-2026-09-26,
 * D2.3; decisão do dono em 2026-09-27: "se não tem volume, não presta").
 *
 * Regra pura, sem rede nem banco, usada pelo servidor (ordem e corte das 600)
 * e pela tela (filtro "Só com volume", ordem e aviso do envio).
 *
 *   - Volume continua sendo SÓ a média mensal do Google Ads: a coluna Volume
 *     e o envio ao Processador não mudam.
 *   - A estimativa do DataForSEO Labs segue rotulada e nunca vira Volume. Ela
 *     só decide se a candidata TEM demanda: sem média do Google Ads E com a
 *     estimativa igual a zero ou vazia, a candidata está "sem volume".
 *   - A ordem é por volume: com volume antes; dentro dela, a média do Google
 *     Ads maior primeiro; depois, a estimativa maior. Empate volta 0, para
 *     quem chama decidir o desempate.
 */

export type SubjectVolumeFields = {
  googleAds: { averageMonthlySearches: number | null } | null;
  /** Opcional (aditivo): quem não guardou a estimativa conta só o Google Ads. */
  dataForSeoEstimate?: { searchVolume: number | null } | null;
};

function nonNegativeOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A média mensal do Google Ads; `null` quando não há média. */
export function subjectDiscoveryAdsVolume(candidate: Pick<SubjectVolumeFields, "googleAds">): number | null {
  return nonNegativeOrNull(candidate.googleAds?.averageMonthlySearches);
}

/** A estimativa do DataForSEO Labs; `null` quando vazia. Nunca é Volume. */
export function subjectDiscoveryEstimate(candidate: Pick<SubjectVolumeFields, "dataForSeoEstimate">): number | null {
  return nonNegativeOrNull(candidate.dataForSeoEstimate?.searchVolume);
}

/** Com volume: média do Google Ads maior que zero, ou estimativa DataForSEO maior que zero. */
export function subjectDiscoveryHasVolume(candidate: SubjectVolumeFields): boolean {
  return (subjectDiscoveryAdsVolume(candidate) ?? 0) > 0 || (subjectDiscoveryEstimate(candidate) ?? 0) > 0;
}

/** Ordem por volume (decrescente). Empate devolve 0. */
export function compareSubjectDiscoveryByVolume(a: SubjectVolumeFields, b: SubjectVolumeFields): number {
  const withVolume = Number(subjectDiscoveryHasVolume(b)) - Number(subjectDiscoveryHasVolume(a));
  if (withVolume) return withVolume;
  // Duas sem volume empatam: 0 do Google Ads e média vazia valem o mesmo.
  if (!subjectDiscoveryHasVolume(a)) return 0;
  const ads = (subjectDiscoveryAdsVolume(b) ?? -1) - (subjectDiscoveryAdsVolume(a) ?? -1);
  if (ads) return ads;
  return (subjectDiscoveryEstimate(b) ?? -1) - (subjectDiscoveryEstimate(a) ?? -1);
}
