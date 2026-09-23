import type { SerpResearchSnapshot } from "./serp/contracts.ts";
import {
  RADAR_SERP_LENS_DATE_SPREAD_FLAG_DAYS,
  RADAR_SERP_LENS_LABELS,
  RADAR_SERP_RECOLLECT_CALLS,
  radarSerpReusableLensGap,
  type RadarSerpLensEntry,
  type RadarSerpLensLabel,
} from "./serp/lens-set.ts";

/**
 * O QUE A TELA DO RADAR DIZ SOBRE AS LENTES DE UM SNAPSHOT — SDD do Radar, R2.
 *
 * "SERP · K de 4 lentes", a origem e a idade de cada lente, e o que apareceu
 * SÓ num aparelho. Tudo sai do `lensSet` copiado no snapshot: a tela não lê o
 * cache nem chama provider.
 *
 * A lente é REGISTRO, não reforço (mesma regra do Minerador): concordância
 * entre aparelhos não fortalece conclusão, e divisão vira limitação escrita.
 * O diagnóstico e a leitura competitiva continuam saindo da canônica.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

const NOME_DA_LENTE: Record<RadarSerpLensLabel, string> = {
  "desktop-windows": "Desktop · Windows",
  "desktop-macos": "Desktop · macOS",
  "mobile-android": "Celular · Android",
  "mobile-ios": "Celular · iOS",
};

const QUEM_PAGOU: Record<string, string> = { minerador: "Minerador", arquiteto: "Arquiteto", radar: "Radar" };

const DIA_MS = 24 * 60 * 60 * 1000;

export const radarSerpLensName = (lens: RadarSerpLensLabel) => NOME_DA_LENTE[lens];

export type RadarSerpLensCoverageRow = {
  lens: RadarSerpLensLabel;
  name: string;
  observed: boolean;
  /** "Cache · pago pelo Minerador", "Pago nesta coleta · Radar" ou o motivo da falta. */
  detail: string;
  collectedAt: string | null;
  missingReason: string | null;
};

export type RadarSerpLensExclusive = {
  lens: RadarSerpLensLabel;
  name: string;
  domains: string[];
  questions: string[];
  aiOverviewDomains: string[];
};

export type RadarSerpLensCoverage = {
  /** `lensed`: snapshot nas quatro lentes; `single_lens`: coleta anterior às lentes; `none`: sem snapshot. */
  state: "lensed" | "single_lens" | "none";
  observed: number;
  total: number;
  /** O rótulo curto: "SERP · 3 de 4 lentes". */
  label: string;
  rows: RadarSerpLensCoverageRow[];
  /** O que apareceu em UMA lente só, entre as observadas. Vazio com menos de duas observadas. */
  exclusive: RadarSerpLensExclusive[];
  /** Maior diferença entre as datas das lentes observadas, em dias inteiros. */
  datesSpreadDays: number | null;
  /** Diferença acima de 7 dias: marcada, nunca recoletada sozinha. */
  datesSpreadFlagged: boolean;
  /** Frases de limitação, para escrever — não para decidir. */
  notes: string[];
  /**
   * Quando o provider observou a SERP canônica (`research.collectedAt`). É a
   * idade do CONTEÚDO — rotular como "SERP observada em", não como data da
   * versão: com cache, uma versão nova pode trazer SERP mais velha que a anterior.
   */
  serpObservedAt: string | null;
  /** Quando esta versão foi aberta. Nulo em snapshot gravado antes do campo. */
  versionOpenedAt: string | null;
};

function detalhe(entrada: RadarSerpLensEntry): string {
  if (entrada.status === "missing") return `Faltou: ${entrada.missingReason || "lente não observada"}`;
  const quem = entrada.collectedBy ? QUEM_PAGOU[entrada.collectedBy] || entrada.collectedBy : "origem não declarada";
  return entrada.source === "paid" ? `Pago nesta coleta · ${quem}` : `Cache · pago pelo ${quem}`;
}

function exclusivos(observadas: RadarSerpLensEntry[], campo: "competitorDomains" | "questions" | "aiOverviewDomains") {
  const presenca = new Map<string, Set<RadarSerpLensLabel>>();
  for (const entrada of observadas) {
    for (const valor of new Set(entrada.observation?.[campo] || [])) {
      const chave = valor.trim().toLocaleLowerCase("pt-BR");
      if (!chave) continue;
      if (!presenca.has(chave)) presenca.set(chave, new Set());
      presenca.get(chave)!.add(entrada.lens);
    }
  }
  const porLente = new Map<RadarSerpLensLabel, string[]>();
  for (const entrada of observadas) {
    const unicos = (entrada.observation?.[campo] || []).filter((valor, indice, lista) => {
      const chave = valor.trim().toLocaleLowerCase("pt-BR");
      return chave && presenca.get(chave)?.size === 1 && lista.findIndex(outro => outro.trim().toLocaleLowerCase("pt-BR") === chave) === indice;
    });
    porLente.set(entrada.lens, unicos);
  }
  return porLente;
}

/**
 * O que apareceu em UMA lente só, entre as observadas. A mesma regra serve à
 * tela e ao bloco de lentes congelado (R3): duas cópias dela divergiriam.
 */
export function radarSerpLensExclusives(entradas: readonly RadarSerpLensEntry[]): RadarSerpLensExclusive[] {
  const observadas = entradas.filter(entrada => entrada.status === "observed");
  const exclusive: RadarSerpLensExclusive[] = [];
  if (observadas.length < 2) return exclusive;
  const dominios = exclusivos(observadas, "competitorDomains");
  const perguntas = exclusivos(observadas, "questions");
  const citados = exclusivos(observadas, "aiOverviewDomains");
  for (const entrada of observadas) {
    const item = {
      lens: entrada.lens,
      name: NOME_DA_LENTE[entrada.lens],
      domains: dominios.get(entrada.lens) || [],
      questions: perguntas.get(entrada.lens) || [],
      aiOverviewDomains: citados.get(entrada.lens) || [],
    };
    if (item.domains.length || item.questions.length || item.aiOverviewDomains.length) exclusive.push(item);
  }
  return exclusive;
}

/** Maior diferença entre as datas das lentes observadas, em dias inteiros; `null` com menos de duas. */
export function radarSerpLensDatesSpreadDays(entradas: ReadonlyArray<Pick<RadarSerpLensEntry, "status" | "collectedAt">>): number | null {
  const datas = entradas
    .filter(entrada => entrada.status === "observed")
    .map(entrada => Date.parse(entrada.collectedAt || ""))
    .filter(Number.isFinite);
  return datas.length >= 2 ? Math.floor((Math.max(...datas) - Math.min(...datas)) / DIA_MS) : null;
}

export function buildRadarSerpLensCoverage(research: SerpResearchSnapshot | null | undefined): RadarSerpLensCoverage {
  const total = RADAR_SERP_LENS_LABELS.length;
  if (!research) {
    return { state: "none", observed: 0, total, label: `SERP · 0 de ${total} lentes`, rows: [], exclusive: [], datesSpreadDays: null, datesSpreadFlagged: false, notes: [], serpObservedAt: null, versionOpenedAt: null };
  }
  if (!research.lensSet) {
    const sistema = research.operatingSystem ? `${research.device}-${research.operatingSystem}` : `${research.device}, sistema não declarado`;
    return {
      state: "single_lens",
      observed: 1,
      total,
      label: "SERP · 1 lente (coleta anterior às quatro lentes)",
      rows: [],
      exclusive: [],
      datesSpreadDays: null,
      datesSpreadFlagged: false,
      notes: [`Esta coleta observou uma lente só (${sistema}) e é anterior às quatro lentes. "Atualizar SERP" lê as quatro, cache primeiro, e abre uma versão nova uma única vez.`],
      serpObservedAt: research.collectedAt,
      versionOpenedAt: null,
    };
  }

  const entradas = research.lensSet.lenses;
  const observadas = entradas.filter(entrada => entrada.status === "observed");
  const rows: RadarSerpLensCoverageRow[] = entradas.map(entrada => ({
    lens: entrada.lens,
    name: NOME_DA_LENTE[entrada.lens],
    observed: entrada.status === "observed",
    detail: detalhe(entrada),
    collectedAt: entrada.collectedAt,
    missingReason: entrada.missingReason,
  }));

  const exclusive = radarSerpLensExclusives(entradas);
  const datesSpreadDays = radarSerpLensDatesSpreadDays(entradas);
  const datesSpreadFlagged = datesSpreadDays !== null && datesSpreadDays > RADAR_SERP_LENS_DATE_SPREAD_FLAG_DAYS;

  const notes: string[] = [];
  for (const entrada of entradas) {
    if (entrada.status !== "missing") continue;
    const retentativa = radarSerpReusableLensGap(entrada)
      ? " A falta é definitiva e não é paga de novo a cada atualização: a lente volta quando outro módulo a coletar ou com \"Recoletar agora (pago)\"."
      : "";
    notes.push(`${NOME_DA_LENTE[entrada.lens]} não entrou nesta coleta: ${entrada.missingReason || "lente não observada"}.${retentativa}`);
  }
  if (datesSpreadFlagged) {
    notes.push(`As lentes foram observadas com ${datesSpreadDays} dias de diferença (acima de ${RADAR_SERP_LENS_DATE_SPREAD_FLAG_DAYS}). A diferença fica marcada; recoletar é decisão explícita.`);
  }
  if (exclusive.length) {
    notes.push("Há resultados que apareceram em um aparelho só. É registro da divergência entre lentes, não reforço de conclusão: o diagnóstico continua saindo da Desktop · Windows.");
  }

  return {
    state: "lensed",
    observed: observadas.length,
    total,
    label: `SERP · ${observadas.length} de ${total} lentes`,
    rows,
    exclusive,
    datesSpreadDays,
    datesSpreadFlagged,
    notes,
    serpObservedAt: research.collectedAt,
    versionOpenedAt: research.cacheProvenance?.snapshotOpenedAt ?? null,
  };
}

/**
 * A confirmação de "Recoletar agora (pago)". O número de chamadas é dito ANTES
 * do clique: a recoleta paga mesmo com a SERP válida no cache.
 */
export function radarSerpRecollectConfirmation() {
  return {
    calls: RADAR_SERP_RECOLLECT_CALLS,
    title: "Recoletar agora (pago)",
    message: `Isto paga até ${RADAR_SERP_RECOLLECT_CALLS} chamadas DataForSEO, uma por lente, mesmo com a SERP válida no cache. Se o conteúdo voltar igual, nenhuma versão nova é aberta.`,
    confirmLabel: `Pagar até ${RADAR_SERP_RECOLLECT_CALLS} chamadas`,
  };
}
