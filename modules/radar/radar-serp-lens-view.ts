import { radarFrozenSerpLensesOf } from "@/lib/radar/investigation-finalization";
import { radarSerpLensName, type RadarSerpLensCoverage } from "@/lib/radar/serp-lens-coverage";
import { RADAR_SERP_LENS_LABELS } from "@/lib/radar/serp/lens-set";
import type { RadarFrozenSerpLens } from "@/lib/radar/serp/frozen-lenses";

/**
 * AS LENTES QUE A TELA MOSTRA FORA DA SERP VIVA — adendos R3 e R4.
 *
 * Três leituras, todas de dado já gravado:
 * - a CÓPIA congelada no FINALIZE (`finalizedBundle.search.lenses`), que é o
 *   que o dossiê entrega e não muda mais (invariante 30);
 * - o bundle congelado SEM essa cópia — legado ou sem SERP conferida —, dito
 *   em uma linha, sem inventar lente;
 * - a evidência de cada pesquisa auxiliar (`evidence.lenses`).
 *
 * A lente é registro, não reforço: a tela conta e nomeia, não conclui.
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/** O dia em que o FINALIZE passou a copiar as lentes (adendo R3). */
export const RADAR_FROZEN_LENSES_SINCE = "2026-09-23";

const TOTAL = RADAR_SERP_LENS_LABELS.length;
const QUEM_PAGOU: Record<string, string> = { minerador: "Minerador", arquiteto: "Arquiteto", radar: "Radar" };

export type RadarFrozenLensRow = { lens: string; name: string; observed: boolean; detail: string };

export type RadarFrozenLensView = {
  /** `frozen`: há cópia; `legacy`: finalizada antes das lentes; `absent`: depois, sem SERP conferida. */
  state: "frozen" | "legacy" | "absent";
  label: string;
  /** A versão curta, para um campo de card. */
  shortLabel: string;
  rows: RadarFrozenLensRow[];
  auxiliary: Array<{ queryId: string; keyword: string; label: string }>;
  notes: string[];
};

function detalheCongelado(lente: RadarFrozenSerpLens): string {
  if (lente.status === "missing") return `Faltou: ${lente.missingReason || "lente não observada"}`;
  const quem = lente.collectedBy ? QUEM_PAGOU[lente.collectedBy] || lente.collectedBy : "origem não declarada";
  const origem = lente.source === "paid" ? `Pago na coleta · ${quem}` : `Cache · pago pelo ${quem}`;
  return `${origem} · ${lente.organicCount ?? 0} orgânico(s)`;
}

function nomeDaLente(lens: string): string {
  return (RADAR_SERP_LENS_LABELS as readonly string[]).includes(lens) ? radarSerpLensName(lens as (typeof RADAR_SERP_LENS_LABELS)[number]) : lens;
}

/** "3 de 4 lentes · faltou Celular · iOS". Nulo quando a evidência é anterior às lentes. */
export function radarAuxiliaryLensLabel(lenses: readonly Pick<RadarFrozenSerpLens, "lens" | "status">[] | null | undefined): string | null {
  if (!lenses || !lenses.length) return null;
  const observadas = lenses.filter(lente => lente.status === "observed").length;
  const faltantes = lenses.filter(lente => lente.status !== "observed").map(lente => nomeDaLente(lente.lens));
  return `${observadas} de ${TOTAL} lentes${faltantes.length ? ` · faltou ${faltantes.join(", ")}` : ""}`;
}

/** O rótulo curto da canônica viva para uma coluna: sem o prefixo "SERP · ". */
export function radarCanonicalLensLabel(coverage: Pick<RadarSerpLensCoverage, "state" | "observed" | "total">): string | null {
  if (coverage.state === "lensed") return `${coverage.observed} de ${coverage.total} lentes`;
  if (coverage.state === "single_lens") return "1 lente (anterior às quatro lentes)";
  return null;
}

function finalizadaAntesDasLentes(frozenAt: string | null | undefined): boolean {
  const instante = Date.parse(frozenAt || "");
  return Number.isFinite(instante) && instante < Date.parse(`${RADAR_FROZEN_LENSES_SINCE}T00:00:00.000Z`);
}

/**
 * O que o bundle congelado diz das lentes. Nulo sem bundle (investigação aberta).
 *
 * Lê SÓ a cópia do bundle (`radarFrozenSerpLensesOf`), nunca o snapshot vivo
 * nem o cache: depois do FINALIZE, a SERP viva pode ter outra versão, e a tela
 * da investigação congelada descreve a fotografia, não o presente.
 */
export function radarFrozenLensView(bundle: { frozenAt?: string | null } | null | undefined): RadarFrozenLensView | null {
  if (!bundle) return null;
  const bloco = radarFrozenSerpLensesOf(bundle);
  if (!bloco) {
    return finalizadaAntesDasLentes(bundle.frozenAt)
      ? {
        state: "legacy",
        label: `Lentes não congeladas (investigação finalizada antes de ${RADAR_FROZEN_LENSES_SINCE}).`,
        shortLabel: `Não congeladas (finalizada antes de ${RADAR_FROZEN_LENSES_SINCE})`,
        rows: [], auxiliary: [], notes: [],
      }
      : {
        state: "absent",
        label: "Lentes não congeladas nesta investigação: a SERP que ela leu não trazia as quatro lentes conferidas no FINALIZE.",
        shortLabel: "Não congeladas",
        rows: [], auxiliary: [], notes: [],
      };
  }
  const observadas = bloco.lenses.filter(lente => lente.status === "observed").length;
  const comCanonica = bloco.canonicalSnapshotId !== null;
  return {
    state: "frozen",
    label: comCanonica
      ? `Lentes congeladas no FINALIZE · ${observadas} de ${TOTAL}`
      : "Lentes congeladas só nas pesquisas auxiliares: a SERP canônica lida é anterior às quatro lentes.",
    shortLabel: comCanonica ? `${observadas} de ${TOTAL} congeladas` : "Só nas auxiliares",
    rows: bloco.lenses.map(lente => ({ lens: lente.lens, name: nomeDaLente(lente.lens), observed: lente.status === "observed", detail: detalheCongelado(lente) })),
    auxiliary: bloco.auxiliary.map(item => ({
      queryId: item.queryId,
      keyword: item.keyword || item.queryId,
      label: `${item.lensesObserved} de ${TOTAL} lentes${item.missingLenses.length ? ` · faltou ${item.missingLenses.map(nomeDaLente).join(", ")}` : ""}`,
    })),
    notes: bloco.limitations,
  };
}
