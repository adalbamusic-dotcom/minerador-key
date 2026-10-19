import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readDataForSeoTargetCodes } from "../minerador/dataforseo-serp-core.ts";
import { brandSerpTargetOf, type BrandSerpLocationEntry, type BrandSerpTarget, type BrandSerpTargetCodes } from "../marca/brand-serp-location.ts";

/**
 * ===== 2026-10-18 · O RESOLVEDOR DA LOCALIDADE DA SERP, NO SERVIDOR (L1) =====
 *
 * SDD `docs/compartilhado/sdd-localidade-serp-por-marca-2026-10-18.md` §4.2.
 * UMA função para toda SERP Google orgânica da marca — a coleta e a leitura das
 * 4 lentes do Arquiteto, a SERP do território, a diferenciação de publicados, a
 * pesquisa canônica e a auxiliar do Radar, o apoio e a leitura do cache no CSV.
 *
 *   - lê `marcas.localizacao` pelo `brandId` do contexto autorizado, numa coluna
 *     estreita; NUNCA aceita localidade vinda do cliente (o `location` que o
 *     Radar e o Arquiteto mandam deixou de decidir);
 *   - o idioma continua o do ambiente ("pt");
 *   - sem localidade válida, ou com a leitura falha: os códigos do ambiente
 *     (2076 por padrão), o comportamento de antes, com `readFailed` dito.
 *
 * Isolamento: a consulta filtra pelo `brandId`; a localidade de uma marca nunca
 * muda a chave de outra.
 */

/** A coluna estreita: só o id e o campo de sempre. */
export const BRAND_SERP_LOCATION_COLUMNS = "id,localizacao" as const;

export async function resolveBrandSerpTarget(
  client: Pick<SupabaseClient, "from">,
  brandId: string,
  options: { national?: BrandSerpTargetCodes; catalog?: readonly BrandSerpLocationEntry[] } = {},
): Promise<BrandSerpTarget> {
  const national = options.national ?? readDataForSeoTargetCodes();
  try {
    const resultado = await client
      .from("marcas")
      .select(BRAND_SERP_LOCATION_COLUMNS)
      .eq("id", brandId)
      .maybeSingle();
    if (resultado.error) throw new Error(resultado.error.message || "falha na leitura da localidade da marca");
    const linha = resultado.data && typeof resultado.data === "object" ? resultado.data as Record<string, unknown> : null;
    // Linha de outra marca (ou nenhuma) não decide nada: nacional.
    const localizacao = linha && linha.id === brandId ? linha.localizacao : null;
    return brandSerpTargetOf({ brandId, localizacao, national, catalog: options.catalog });
  } catch {
    return brandSerpTargetOf({ brandId, localizacao: null, national, readFailed: true, catalog: options.catalog });
  }
}
