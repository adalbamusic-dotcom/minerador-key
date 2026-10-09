import { buildRadarMultimodalBlueprint, type RadarMultimodalBlueprint } from "./multimodal-blueprint.ts";
import type { RadarSerpFeatureIntelligence } from "./serp-features.ts";
import { radarYoutubeRunPertinence } from "./youtube-blueprint.ts";
import type { RadarYoutubeSearchRun } from "./youtube-search-run.ts";

/**
 * ===== 2026-10-09 · O MULTIFORMATO DE UMA CORRIDA, PELA RÉGUA DO PILOTO =====
 *
 * A tela montava o multiformato (vivo, do congelamento e do reparo) só com o
 * universo da corrida: a saída SHORTS × YOUTUBE_VIDEO e as contagens long-form ×
 * Shorts saíam da amostra INTEIRA (`shorts > longForm`), e o congelamento NOVO
 * gravava essa decisão no pacote — imutável. A fotografia do YouTube, o CSV de
 * vídeo e o Redator já leem a amostra PERTINENTE e a decisão única de formato
 * (`radarVideoFormatDecision`). Aqui o multiformato passa a receber a mesma
 * conta (`radarYoutubeRunPertinence`), num lugar só, para o clique, o automático
 * e o reparo.
 *
 * O módulo existe porque `multimodal-blueprint.ts` não pode importar o
 * youtube-blueprint (o ciclo com o CSV de escrita): a conta chega pronta.
 * Congelamento já gravado não passa por aqui — é lido como foi congelado.
 */
export function radarMultimodalBlueprintOfRun(input: {
  features: RadarSerpFeatureIntelligence | null;
  run: Pick<RadarYoutubeSearchRun, "queries" | "universe" | "provenance"> | null;
  generatedAt: string;
}): RadarMultimodalBlueprint {
  const universo = input.run?.universe || [];
  return buildRadarMultimodalBlueprint({
    features: input.features,
    youtubeUniverse: universo,
    generatedAt: input.generatedAt,
    /* Sem vídeo na corrida não há amostra para julgar: a conta de antes (zero e zero). */
    youtubePertinence: input.run && universo.length ? radarYoutubeRunPertinence(input.run) : null,
  });
}
