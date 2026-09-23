/**
 * AS LENTES DA SERP POR KEYWORD — nomes do Arquiteto, autoridade do cache.
 *
 * Este arquivo já foi o registro remoto por escopo (`keyword_serp_observations`
 * em `editorial_workflow_items`): uma linha por Silo, reescrita a cada lote.
 * Desde 2026-09-23 a persistência da SERP por keyword é o cache de SERP
 * (`lib/editorial/serp-cache.ts`), uma entrada por keyword × lente, e o
 * registro por escopo deixou de ser escrito — ele duplicava o que o cache
 * guarda e obrigava a rota a reler e regravar o Silo inteiro a cada lote.
 *
 * Ficaram só os nomes que outros arquivos importam, agora como REEXPORTAÇÃO
 * do contrato do cache. Duas listas de lentes divergiriam em silêncio: a
 * chave do cache usa a lente enviada, e uma lente escrita diferente aqui
 * viraria falta de cache e chamada paga repetida.
 *
 * Mudança em relação ao registro antigo: o sistema operacional deixou de ser
 * anulável. Medido em 2026-09-23 pelo eco da DataForSEO, `desktop` sem `os`
 * é servido como `windows` — lente sem sistema rotularia uma SERP que não foi
 * a pedida.
 */

import {
  SERP_CACHE_LENSES,
  SerpCacheLensSchema,
  type SerpCacheLens,
} from "../editorial/serp-cache.ts";

export const SerpLensSchema = SerpCacheLensSchema;
export type SerpLens = SerpCacheLens;

/** As quatro lentes do produto: desktop/windows, desktop/macos, mobile/android, mobile/ios. */
export const DEFAULT_SERP_LENSES: readonly SerpLens[] = SERP_CACHE_LENSES;
