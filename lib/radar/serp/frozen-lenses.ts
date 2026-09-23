import { z } from "zod";
import { SerpCacheCollectorSchema } from "../../editorial/serp-cache.ts";
import { radarSerpLensDatesSpreadDays, radarSerpLensExclusives, radarSerpLensName } from "../serp-lens-coverage.ts";
import {
  RADAR_SERP_LENS_DATE_SPREAD_FLAG_DAYS,
  RADAR_SERP_LENS_LABELS,
  RadarSerpLensLabelSchema,
  RadarSerpLensSetSchema,
  RadarSerpLensSourceSchema,
  type RadarSerpLensLabel,
  type RadarSerpLensSet,
} from "./lens-set.ts";

/**
 * AS LENTES CONGELADAS — SDD do Radar nas quatro lentes, R3.
 *
 * O snapshot da SERP copia as quatro lentes (`lensSet`). Quando a investigação
 * é finalizada, o bundle congelado passa a carregar a SUA cópia do que cada
 * lente observou, e o dossiê entregue ao Planejador e ao Redator a lê de lá.
 *
 * CÓPIA, NUNCA PONTEIRO (invariante 30). Nada aqui guarda id de entrada de
 * cache nem lê cache: regravar ou vencer a entrada não muda o bundle, o hash
 * dele nem o que o dossiê entrega. O bloco também não leva o digest orgânico
 * nem as buscas relacionadas: só o que o consumidor lê de uma lente.
 *
 * A LENTE É REGISTRO, NÃO REFORÇO (mesma regra do Minerador). Concordância
 * entre aparelhos não fortalece conclusão; o que apareceu num aparelho só e a
 * lente que faltou viram LIMITAÇÃO ESCRITA (invariante 27). O diagnóstico e a
 * leitura competitiva continuam saindo da Desktop · Windows.
 *
 * Domínio puro: sem fetch, sem storage, sem provider. Roda no cliente também —
 * a evidência da auxiliar é montada no navegador.
 */

export const RADAR_FROZEN_SERP_LENSES_VERSION = "radar-frozen-lenses-v1" as const;

const Instante = z.string().datetime({ offset: true });
const Textos = z.array(z.string().min(1));

/** Uma lente, como o consumidor a lê. Sem digest, sem relacionadas, sem providerRequestId. */
export const RadarFrozenSerpLensSchema = z.object({
  lens: RadarSerpLensLabelSchema,
  status: z.enum(["observed", "missing"]),
  source: RadarSerpLensSourceSchema.nullable(),
  collectedBy: SerpCacheCollectorSchema.nullable(),
  collectedAt: Instante.nullable(),
  organicCount: z.number().int().nonnegative().nullable(),
  competitorDomains: Textos,
  aiOverviewDomains: Textos,
  questions: Textos,
  itemTypes: Textos,
  commercialSignals: z.boolean().nullable(),
  missingReason: z.string().min(1).nullable(),
}).strict().superRefine((lente, ctx) => {
  if (lente.status === "observed") {
    if (lente.missingReason !== null) ctx.addIssue({ code: "custom", message: "Lente observada não tem motivo de falta.", path: ["missingReason"] });
    if (lente.organicCount === null || lente.commercialSignals === null) ctx.addIssue({ code: "custom", message: "Lente observada sem a leitura copiada.", path: ["organicCount"] });
    if (!lente.source || !lente.collectedBy || !lente.collectedAt) ctx.addIssue({ code: "custom", message: "Lente observada sem proveniência.", path: ["source"] });
    return;
  }
  if (!lente.missingReason) ctx.addIssue({ code: "custom", message: "Lente faltante precisa declarar o motivo.", path: ["missingReason"] });
  if (lente.organicCount !== null || lente.commercialSignals !== null
    || lente.competitorDomains.length || lente.aiOverviewDomains.length || lente.questions.length || lente.itemTypes.length) {
    ctx.addIssue({ code: "custom", message: "Lente faltante não carrega leitura.", path: ["organicCount"] });
  }
});
export type RadarFrozenSerpLens = z.infer<typeof RadarFrozenSerpLensSchema>;

/** As quatro, na ordem de `SERP_CACHE_LENSES`. Faltar é declarado, nunca omitido. */
export const RadarFrozenSerpLensListSchema = z.array(RadarFrozenSerpLensSchema).length(RADAR_SERP_LENS_LABELS.length).superRefine((lentes, ctx) => {
  lentes.forEach((lente, indice) => {
    if (lente.lens !== RADAR_SERP_LENS_LABELS[indice]) {
      ctx.addIssue({ code: "custom", message: `A lente ${indice + 1} deveria ser ${RADAR_SERP_LENS_LABELS[indice]}.`, path: [indice, "lens"] });
    }
  });
});

export const RadarFrozenAuxiliaryLensesSchema = z.object({
  queryId: z.string().min(1),
  keywordId: z.string().nullable(),
  keyword: z.string().nullable(),
  /** O `contentHash` da SERP auxiliar — a fórmula com lentes já cobre as quatro. */
  snapshotHash: z.string().min(1),
  lensesObserved: z.number().int().min(0).max(RADAR_SERP_LENS_LABELS.length),
  missingLenses: z.array(RadarSerpLensLabelSchema),
  /**
   * De onde a cópia saiu. A auxiliar não tem snapshot: a cópia é a da
   * evidência GRAVADA na análise, conferida com a que o FINALIZE carrega — a
   * mesma confiança dos `results` dela, não a de um snapshot relido.
   * Opcional para que um bloco montado antes deste campo continue legível.
   */
  source: z.literal("stored_analysis_evidence").optional(),
}).strict();
export type RadarFrozenAuxiliaryLenses = z.infer<typeof RadarFrozenAuxiliaryLensesSchema>;

export const RadarFrozenSerpLensBlockSchema = z.object({
  version: z.literal(RADAR_FROZEN_SERP_LENSES_VERSION),
  /** A SERP canônica que a análise congelada leu. Nulos quando ela é anterior às lentes. */
  canonicalSnapshotId: z.string().min(1).nullable(),
  canonicalSnapshotHash: z.string().min(1).nullable(),
  /** Identidade do CONTEÚDO das quatro lentes copiadas, recalculável a partir delas. */
  lensSetHash: z.string().min(1).nullable(),
  lenses: z.array(RadarFrozenSerpLensSchema),
  auxiliary: z.array(RadarFrozenAuxiliaryLensesSchema),
  datesSpreadDays: z.number().int().nonnegative().nullable(),
  /** Lacunas e divergências entre aparelhos, escritas — nunca resolvidas em silêncio. */
  limitations: z.array(z.string().min(1)),
}).strict().superRefine((bloco, ctx) => {
  const comCanonica = bloco.canonicalSnapshotId !== null;
  if (comCanonica !== (bloco.canonicalSnapshotHash !== null) || comCanonica !== (bloco.lensSetHash !== null)) {
    ctx.addIssue({ code: "custom", message: "A identidade da canônica vem inteira ou não vem.", path: ["canonicalSnapshotId"] });
  }
  if (comCanonica && !RadarFrozenSerpLensListSchema.safeParse(bloco.lenses).success) {
    ctx.addIssue({ code: "custom", message: "A canônica congelada precisa das quatro lentes na ordem.", path: ["lenses"] });
  }
  if (!comCanonica && bloco.lenses.length) ctx.addIssue({ code: "custom", message: "Lente sem SERP canônica congelada.", path: ["lenses"] });
  if (!comCanonica && !bloco.auxiliary.length) ctx.addIssue({ code: "custom", message: "Bloco de lentes vazio não é gravado: a chave fica ausente.", path: ["auxiliary"] });
  if (bloco.lensSetHash !== null && bloco.lensSetHash !== radarFrozenLensSetHash(bloco.lenses)) {
    ctx.addIssue({ code: "custom", message: "O hash das lentes não confere com as lentes copiadas.", path: ["lensSetHash"] });
  }
});
export type RadarFrozenSerpLensBlock = z.infer<typeof RadarFrozenSerpLensBlockSchema>;

/* ------------------------------ a identidade ------------------------------ */

function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * O hash do que as lentes OBSERVARAM. Proveniência (origem, quem pagou, data)
 * fica fora, como fica no hash do snapshot: a mesma SERP relida não é
 * conteúdo novo.
 */
export function radarFrozenLensSetHash(lentes: readonly RadarFrozenSerpLens[]): string {
  const conteudo = lentes.map(lente => [
    lente.lens, lente.status, lente.organicCount, lente.competitorDomains, lente.aiOverviewDomains,
    lente.questions, lente.itemTypes, lente.commercialSignals,
  ]);
  return `lenses:${assinatura(JSON.stringify(conteudo))}`;
}

/* ------------------------------ a cópia ------------------------------ */

/** As quatro lentes de um `lensSet`, copiadas na forma que o consumidor lê. */
export function radarFrozenSerpLensesFromLensSet(lensSet: RadarSerpLensSet): RadarFrozenSerpLens[] {
  const conjunto = RadarSerpLensSetSchema.parse(lensSet);
  return RadarFrozenSerpLensListSchema.parse(conjunto.lenses.map(entrada => {
    const observacao = entrada.status === "observed" ? entrada.observation : undefined;
    return {
      lens: entrada.lens,
      status: entrada.status,
      source: entrada.source,
      collectedBy: entrada.collectedBy,
      collectedAt: entrada.collectedAt,
      organicCount: observacao ? observacao.organicCount : null,
      competitorDomains: observacao ? [...observacao.competitorDomains] : [],
      aiOverviewDomains: observacao ? [...observacao.aiOverviewDomains] : [],
      questions: observacao ? [...observacao.questions] : [],
      itemTypes: observacao ? [...observacao.itemTypes] : [],
      commercialSignals: observacao ? observacao.commercialSignals : null,
      missingReason: entrada.status === "missing" ? entrada.missingReason : null,
    };
  }));
}

const LIMITE_NA_FRASE = 5;
const listar = (itens: readonly string[], aspas = false) => {
  const mostrados = itens.slice(0, LIMITE_NA_FRASE).map(item => (aspas ? `"${item}"` : item));
  return `${mostrados.join(", ")}${itens.length > LIMITE_NA_FRASE ? ` e mais ${itens.length - LIMITE_NA_FRASE}` : ""}`;
};

/**
 * O BLOCO CONGELADO — montado UMA vez, na escrita do FINALIZE.
 *
 * `canonical` é o snapshot que a análise congelada leu, e só entra quando ele
 * tem `lensSet`. `auxiliary` são as consultas auxiliares executadas com a
 * cópia das lentes na evidência. Sem nenhuma das duas, devolve `null` — e a
 * chave fica AUSENTE no bundle, para o hash de bundles sem lentes não mudar.
 */
export function buildRadarFrozenSerpLensBlock(input: {
  canonical: { snapshotId: string; snapshotHash: string; lensSet: RadarSerpLensSet } | null;
  auxiliary: ReadonlyArray<{ queryId: string; keywordId: string | null; keyword: string | null; snapshotHash: string; lenses: readonly RadarFrozenSerpLens[] }>;
  /** Consultas auxiliares executadas antes das quatro lentes (lente única). */
  singleLensAuxiliary: number;
  /** Auxiliares com lentes na evidência do pedido que não conferem com a evidência gravada. */
  unverifiedAuxiliary?: number;
}): RadarFrozenSerpLensBlock | null {
  const canonica = input.canonical ? { ...input.canonical, lensSet: RadarSerpLensSetSchema.parse(input.canonical.lensSet) } : null;
  const auxiliares = input.auxiliary.map(item => ({ ...item, lenses: RadarFrozenSerpLensListSchema.parse(item.lenses) }));
  const naoConferidas = input.unverifiedAuxiliary || 0;
  if (!canonica && !auxiliares.length) return null;

  const lentes = canonica ? radarFrozenSerpLensesFromLensSet(canonica.lensSet) : [];
  const limitations: string[] = [];

  if (!canonica) {
    limitations.push("A SERP canônica congelada é anterior às quatro lentes: ela observou um aparelho só.");
  } else {
    for (const lente of lentes) {
      if (lente.status === "missing") {
        limitations.push(`${radarSerpLensName(lente.lens)} não foi observada na SERP canônica congelada: ${lente.missingReason}`);
      }
    }
    const espalhamento = radarSerpLensDatesSpreadDays(canonica.lensSet.lenses);
    if (espalhamento !== null && espalhamento > RADAR_SERP_LENS_DATE_SPREAD_FLAG_DAYS) {
      limitations.push(`As lentes da SERP canônica congelada foram observadas com ${espalhamento} dias de diferença (acima de ${RADAR_SERP_LENS_DATE_SPREAD_FLAG_DAYS}).`);
    }
    for (const exclusivo of radarSerpLensExclusives(canonica.lensSet.lenses)) {
      const partes = [
        exclusivo.domains.length ? `domínios ${listar(exclusivo.domains)}` : "",
        exclusivo.questions.length ? `perguntas ${listar(exclusivo.questions, true)}` : "",
        exclusivo.aiOverviewDomains.length ? `citados pelo AI Overview ${listar(exclusivo.aiOverviewDomains)}` : "",
      ].filter(Boolean);
      limitations.push(`Só em ${exclusivo.name}: ${partes.join("; ")}. É registro de divergência entre aparelhos, não reforço de conclusão: o diagnóstico sai da ${radarSerpLensName("desktop-windows")}.`);
    }
  }

  for (const auxiliar of auxiliares) {
    const faltantes = auxiliar.lenses.filter(lente => lente.status === "missing").map(lente => lente.lens);
    if (faltantes.length) {
      limitations.push(`Na pesquisa auxiliar "${auxiliar.keyword || auxiliar.keywordId || auxiliar.queryId}", ${faltantes.map(radarSerpLensName).join(", ")} não foi(ram) observada(s).`);
    }
  }
  if (input.singleLensAuxiliary > 0) {
    limitations.push(`${input.singleLensAuxiliary} pesquisa(s) auxiliar(es) desta investigação são anteriores às quatro lentes: um aparelho só.`);
  }
  if (naoConferidas > 0) {
    limitations.push(`${naoConferidas} pesquisa(s) auxiliar(es) com lentes não conferem com a evidência gravada da análise e não tiveram as lentes copiadas.`);
  }

  return RadarFrozenSerpLensBlockSchema.parse({
    version: RADAR_FROZEN_SERP_LENSES_VERSION,
    canonicalSnapshotId: canonica?.snapshotId ?? null,
    canonicalSnapshotHash: canonica?.snapshotHash ?? null,
    lensSetHash: canonica ? radarFrozenLensSetHash(lentes) : null,
    lenses: lentes,
    auxiliary: auxiliares.map(auxiliar => ({
      queryId: auxiliar.queryId,
      keywordId: auxiliar.keywordId,
      keyword: auxiliar.keyword,
      snapshotHash: auxiliar.snapshotHash,
      lensesObserved: auxiliar.lenses.filter(lente => lente.status === "observed").length,
      missingLenses: auxiliar.lenses.filter(lente => lente.status === "missing").map(lente => lente.lens as RadarSerpLensLabel),
      source: "stored_analysis_evidence" as const,
    })),
    datesSpreadDays: canonica ? radarSerpLensDatesSpreadDays(canonica.lensSet.lenses) : null,
    limitations: [...new Set(limitations)],
  });
}
