/**
 * SMOKE DA MATRIZ DE LENTES — a divergência entre dispositivos é real?
 *
 * Todo o desenho da eleição por SERP assume uma coisa que precisa ser
 * verificada com dado real, não com fixture: que o Google devolve universos
 * diferentes por dispositivo e sistema. Se as quatro lentes devolverem sempre o
 * mesmo top, a divergência é zero por natureza e o crédito de robustez nunca
 * dispara — e isso precisa ser sabido ANTES de calibrar limiar.
 *
 * O que ele faz: uma consulta real por lente, para a mesma keyword, e imprime
 * os domínios de cada uma, a divergência medida e o veredito.
 *
 * ATENÇÃO: são 4 chamadas PAGAS ao provider por execução. Nada é persistido e
 * nada é decidido — é leitura.
 *
 * Uso:
 *   npm run arquiteto:lentes-smoke -- "skincare facial"
 */

import { readDataForSeoSerpConfig } from "../lib/minerador/dataforseo-serp-core.ts";
import { executeDataForSeoSerpOperation } from "../lib/server/dataforseo-serp-operation.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { observationFromSnapshot, serpLensOf } from "../lib/arquiteto/serp-competitive-evidence.ts";
import { lensDivergenceOf, DEFAULT_SILO_STRENGTH } from "../lib/arquiteto/silo-primary-keyword.ts";
import { DEFAULT_SERP_LENSES } from "../lib/arquiteto/keyword-serp-record.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";

const keyword = process.argv.slice(2).join(" ").trim() || "skincare facial";
const operationRequestId = crypto.randomUUID();

/**
 * `DEPTH=advanced` pede o payload completo; `LENS=desktop-windows` reduz a
 * uma lente. Existem para comparar endpoints sem gastar as quatro chamadas.
 */
const payloadDepth = process.env.DEPTH === "advanced" ? "advanced" as const : "regular" as const;
const lentes = process.env.LENS
  ? DEFAULT_SERP_LENSES.filter(lens => serpLensOf(lens) === process.env.LENS)
  : DEFAULT_SERP_LENSES;

async function main() {
  const config = readDataForSeoSerpConfig(process.env);
  console.log(`keyword: "${keyword}"`);
  console.log(`localidade ${config.locationCode} · idioma ${config.languageCode}`);
  console.log(`lentes: ${lentes.map(serpLensOf).join(", ")} · payload ${payloadDepth}`);
  console.log("");

  const observacoes = [];
  for (const lens of lentes) {
    const entrada = {
      brandId: "smoke",
      articleId: "smoke",
      articleDnaVersionId: "smoke",
      keywordId: "kw-smoke",
      keywordDnaVersionId: "smoke",
      keyword,
      location: "Brasil",
      language: config.languageCode,
      device: lens.device,
      operatingSystem: lens.operatingSystem,
      expectedIntent: "",
      expectedFormat: "",
      requiredTopics: [keyword],
      articleEntities: [],
      resultLimit: 10,
      version: 1,
      previousSnapshotId: null,
    } as unknown as SerpSearchInput;

    const resultado = await executeDataForSeoSerpOperation({
      keyword,
      locationCode: config.locationCode,
      languageCode: config.languageCode,
      device: lens.device,
      operatingSystem: lens.operatingSystem,
      resultLimit: 10,
      operationRequestId,
      payloadDepth,
    }, { config });

    const snapshot = normalizeDataForSeoSerpResponse(resultado.body, entrada, config, new Date().toISOString(), resultado.providerRequestId);
    const observacao = observationFromSnapshot(snapshot);
    observacoes.push(observacao);

    console.log(`[${observacao.lens}] ${observacao.organicCount} orgânicos · ${observacao.competitorDomains.length} domínios`);
    console.log(`  ${observacao.competitorDomains.slice(0, 8).join(", ")}`);
    console.log(`  blocos: ${observacao.itemTypes.slice(0, 8).join(", ") || "nenhum declarado"}`);
    console.log(`  perguntas PAA: ${observacao.questions.length}`);
    console.log("");
  }

  const divergencia = lensDivergenceOf(observacoes);
  console.log(`divergência entre as lentes: ${divergencia.toFixed(3)}`);
  console.log(`limiar para creditar robustez: ${DEFAULT_SILO_STRENGTH.minLensDivergenceToCount}`);
  console.log(divergencia >= DEFAULT_SILO_STRENGTH.minLensDivergenceToCount
    ? "VEREDITO: o universo MUDA entre dispositivos — o crédito de robustez tem base real."
    : "VEREDITO: as lentes devolvem praticamente o mesmo universo para esta keyword.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
