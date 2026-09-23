/**
 * SERP da etapa Silos — evidência externa para DÚVIDA ARQUITETURAL.
 *
 * Duas regras governam este módulo:
 *
 * 1. `evidence-on-demand`: não se consulta a SERP indiscriminadamente. Só vira
 *    consulta o que é uma pergunta de arquitetura em aberto. Silo confirmado,
 *    sem conflito e com evidência interna suficiente NÃO gera pergunta.
 * 2. `evidence-only`: o resultado nunca move membership, nunca funde silo,
 *    nunca troca cabeceira. Ele recomenda; quem decide é humano.
 *
 * Domínio puro: sem provider, sem fetch, sem storage, sem UI. A rota é que
 * fala com o provider; aqui só entram snapshots já normalizados.
 */

import { z } from "zod";
import type { SerpResearchSnapshot } from "../radar/serp/contracts.ts";
import {
  SERP_LENS_DATES_DIVERGE_DAYS,
  SERP_LENS_DIGEST_NOTE,
  SerpLensesMarkerSchema,
  collectedAtSpreadDays,
  lensAgreementLabel,
  type SerpLensesMarker,
} from "./serp-lens-plan.ts";

/* ------------------------------- perguntas ------------------------------- */

export const TerritorialSerpQuestionKindSchema = z.enum([
  /** A cabeceira sustenta um universo ou é assunto de um artigo só? */
  "head_candidate",
  /** O silo novo é território próprio ou o mesmo universo de um existente? */
  "new_vs_existing",
  /** Silo criado à mão: entidade, intenção e risco de colisão. */
  "manual_silo",
  /** Página publicada promovida: é raiz de universo ou artigo específico? */
  "site_silo",
]);
export type TerritorialSerpQuestionKind = z.infer<typeof TerritorialSerpQuestionKindSchema>;

export type TerritorialSerpQuestion = {
  /** Identidade da pergunta; derivada, nunca aleatória. */
  questionId: string;
  kind: TerritorialSerpQuestionKind;
  territoryRef: string | null;
  /** O que será consultado. A primeira é a consulta principal. */
  queries: { keywordId: string; keyword: string; role: "primary" | "comparison" }[];
  /** Território comparado, quando a pergunta é de sobreposição. */
  comparedTerritoryRef: string | null;
  /** Por que esta consulta se justifica — aparece na UI. */
  reason: string;
};

/* ------------------------------- resultado ------------------------------- */

export const TerritorialSerpCompatibilitySchema = z.enum([
  "coerente",
  "parcialmente_coerente",
  "incompativel",
  "insuficiente",
]);

export const TerritorialSerpRecommendationSchema = z.enum([
  "manter_silo",
  "usar_silo_existente",
  "revisar_cabeceira",
  "sem_profundidade",
  "evidencia_insuficiente",
]);

export const TerritorialSerpAssessmentSchema = z.object({
  questionId: z.string().min(1),
  kind: TerritorialSerpQuestionKindSchema,
  territoryRef: z.string().nullable(),
  comparedTerritoryRef: z.string().nullable(),
  compatibility: TerritorialSerpCompatibilitySchema,
  /** Intenção dominante observada na SERP, não a declarada pelo humano. */
  observedIntent: z.string().nullable(),
  /** Tipo de página que domina os resultados. */
  dominantType: z.string().nullable(),
  /** Quanto as duas SERPs compartilham; `null` quando não há comparação. */
  overlap: z.enum(["low", "medium", "high", "unknown"]).nullable(),
  /** Sinal de universo: várias intenções e perguntas distintas. */
  breadth: z.enum(["broad", "narrow", "unknown"]),
  competition: z.enum(["high", "medium", "low", "unknown"]),
  conflicts: z.array(z.string()),
  recommendation: TerritorialSerpRecommendationSchema,
  reason: z.string().min(1),
  /** Snapshots que sustentam o parecer; a evidência fica rastreável. */
  snapshotIds: z.array(z.string()),
  collectedAt: z.string().min(1),
  /**
   * O marcador das quatro lentes (adendo A5): pedidas, observadas, faltantes,
   * a sobreposição e os blocos por lente, a concordância e o portão de datas.
   * Opcional: parecer gravado antes das quatro lentes continua válido.
   */
  lenses: SerpLensesMarkerSchema.optional(),
}).strict();
export type TerritorialSerpAssessment = z.infer<typeof TerritorialSerpAssessmentSchema>;

/* ------------------------------ que perguntar ---------------------------- */

type TerritoryForSerp = {
  territoryRef: string;
  name: string | null;
  centralEntity: string;
  lifecycleStatus: string;
  architecturalOrigin: string;
  publishedStructureRef: unknown;
  conflicts: readonly unknown[];
};

type UniverseHeadForSerp = {
  keywordId: string;
  keyword: string;
  /** Cabeceira ambígua é justamente a que precisa de evidência externa. */
  ambiguous: boolean;
  coherence: number;
};

const HEAD_COHERENCE_DOUBT = 0.55;

const keywordTextOf = (keywords: ReadonlyMap<string, string>, keywordId: string) =>
  keywords.get(keywordId) || null;

/**
 * Monta as perguntas arquiteturais que merecem SERP.
 *
 * Silo confirmado, sem conflito aberto e sem comparação pendente não entra:
 * gastar consulta onde não há dúvida é ruído, não evidência.
 */
export function buildTerritorialSerpQuestions(input: {
  territories: readonly TerritoryForSerp[];
  /** Texto por keywordId — a consulta é o texto real, nunca o id. */
  keywordTexts: ReadonlyMap<string, string>;
  /** Cabeceiras vindas do KeywordUniverse. */
  heads?: readonly UniverseHeadForSerp[];
  /** Restringe às seleções humanas; vazio = todo o universo atual. */
  selectedTerritoryRefs?: ReadonlySet<string>;
  selectedKeywordIds?: ReadonlySet<string>;
}): TerritorialSerpQuestion[] {
  const questions: TerritorialSerpQuestion[] = [];
  const selecionouTerritorio = Boolean(input.selectedTerritoryRefs?.size);
  const selecionouKeyword = Boolean(input.selectedKeywordIds?.size);

  const confirmados = input.territories.filter(territory => territory.lifecycleStatus === "confirmed");

  for (const territory of input.territories) {
    if (selecionouTerritorio && !input.selectedTerritoryRefs!.has(territory.territoryRef)) continue;
    if (territory.lifecycleStatus === "consolidated" || territory.lifecycleStatus === "archived") continue;

    const temConflito = territory.conflicts.length > 0;
    // Confirmado e sem conflito já respondeu à própria pergunta.
    if (territory.lifecycleStatus === "confirmed" && !temConflito) continue;

    const consulta = territory.centralEntity.trim() || territory.name?.trim() || "";
    if (!consulta) continue;

    const origemSite = Boolean(territory.publishedStructureRef);
    const kind: TerritorialSerpQuestionKind = origemSite
      ? "site_silo"
      : territory.architecturalOrigin === "manual_strategic" ? "manual_silo" : "new_vs_existing";

    // Sobreposição só se pergunta contra um silo confirmado DIFERENTE.
    const comparado = kind === "new_vs_existing"
      ? confirmados.find(outro => outro.territoryRef !== territory.territoryRef) ?? null
      : null;

    const queries: TerritorialSerpQuestion["queries"] = [
      { keywordId: `territory:${territory.territoryRef}`, keyword: consulta, role: "primary" },
    ];
    if (comparado) {
      const textoComparado = comparado.centralEntity.trim() || comparado.name?.trim() || "";
      if (textoComparado) {
        queries.push({ keywordId: `territory:${comparado.territoryRef}`, keyword: textoComparado, role: "comparison" });
      }
    }

    questions.push({
      questionId: `serp:${kind}:${territory.territoryRef}`,
      kind,
      territoryRef: territory.territoryRef,
      queries,
      comparedTerritoryRef: comparado?.territoryRef ?? null,
      reason: origemSite
        ? "Página publicada promovida a silo: confirmar se a SERP trata o tema como universo, não como artigo."
        : kind === "manual_silo"
          ? "Silo criado à mão: confirmar entidade, intenção macro e risco de colisão."
          : "Silo novo: confirmar se o universo é próprio ou já pertence a um silo existente.",
    });
  }

  for (const head of input.heads || []) {
    if (selecionouKeyword && !input.selectedKeywordIds!.has(head.keywordId)) continue;
    // Cabeceira clara e coerente não precisa de evidência externa.
    if (!head.ambiguous && head.coherence >= HEAD_COHERENCE_DOUBT) continue;
    const texto = head.keyword || keywordTextOf(input.keywordTexts, head.keywordId);
    if (!texto) continue;
    questions.push({
      questionId: `serp:head_candidate:${head.keywordId}`,
      kind: "head_candidate",
      territoryRef: null,
      queries: [{ keywordId: head.keywordId, keyword: texto, role: "primary" }],
      comparedTerritoryRef: null,
      reason: head.ambiguous
        ? "Há mais de uma cabeceira plausível: a SERP diz se o tema é hub ou artigo específico."
        : "Coerência interna baixa: a SERP diz se o grupo sustenta um universo.",
    });
  }

  return questions;
}

/* ----------------------------- como interpretar -------------------------- */

/** Tipos que indicam página de organização, não conteúdo específico. */
const HUB_TYPES = new Set(["category", "list", "comparison", "service"]);

const dominantTypeOf = (snapshot: SerpResearchSnapshot): string | null => {
  const counts = new Map<string, number>();
  for (const result of snapshot.organicResults) {
    const type = result.manualType || result.inferredType;
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  let dominante: string | null = null;
  let maior = 0;
  for (const [type, count] of counts) {
    if (count > maior) { maior = count; dominante = type; }
  }
  return dominante;
};

const breadthOf = (snapshot: SerpResearchSnapshot): "broad" | "narrow" | "unknown" => {
  if (!snapshot.organicResults.length) return "unknown";
  const intencoes = snapshot.diagnostic.secondaryIntents.length;
  const perguntas = snapshot.diagnostic.questions.length;
  const tipos = new Set(snapshot.organicResults.map(result => result.manualType || result.inferredType)).size;
  // Universo aparece como variedade: várias intenções, várias necessidades.
  if (intencoes >= 2 || perguntas >= 4 || tipos >= 3) return "broad";
  return "narrow";
};

const competitionOf = (snapshot: SerpResearchSnapshot): "high" | "medium" | "low" | "unknown" => {
  if (!snapshot.organicResults.length) return "unknown";
  const dominios = new Set(snapshot.organicResults.map(result => result.domain)).size;
  const total = snapshot.organicResults.length;
  if (dominios <= Math.ceil(total / 3)) return "high";
  return dominios >= total - 1 ? "low" : "medium";
};

type OverlapLevel = "low" | "medium" | "high" | "unknown";

/** A sobreposição entre duas listas de URLs de uma MESMA lente. */
export function territorialOverlapOfUrls(primaryUrls: readonly string[], comparisonUrls: readonly string[]): OverlapLevel {
  const urls = new Set(primaryUrls);
  if (!urls.size || !comparisonUrls.length) return "unknown";
  const compartilhados = comparisonUrls.filter(url => urls.has(url)).length;
  const proporcao = compartilhados / Math.min(urls.size, comparisonUrls.length);
  if (proporcao >= 0.5) return "high";
  if (proporcao >= 0.2) return "medium";
  return "low";
}

const overlapOf = (primary: SerpResearchSnapshot, comparison: SerpResearchSnapshot | null) => {
  if (!comparison) return null;
  return territorialOverlapOfUrls(primary.organicResults.map(result => result.url), comparison.organicResults.map(result => result.url));
};

/**
 * Uma lente EXTRA da pergunta territorial (adendo das 4 lentes, A4): as URLs do
 * top 10 orgânico de cada consulta, lidas do digest. `null` = a consulta não
 * foi observada nesta lente.
 */
export type TerritorialLensReading = {
  lens: string;
  primaryUrls: readonly string[] | null;
  comparisonUrls: readonly string[] | null;
  /** Os blocos não orgânicos que a SERP desta lente mostrou (formatos por aparelho). */
  blocks?: readonly string[];
  /** Quando cada consulta desta lente foi observada. */
  collectedAt: readonly string[];
  /**
   * Quando a consulta principal e a de comparação foram observadas NESTA
   * lente. Opcionais (2026-09-23): o portão de datas compara as lentes de uma
   * MESMA consulta, nunca a principal com a comparação. Ausentes, valem as
   * posições de `collectedAt` (principal primeiro), a ordem em que a rota lê.
   */
  primaryCollectedAt?: string | null;
  comparisonCollectedAt?: string | null;
};

/** As datas desta lente, separadas por consulta. */
const datasPorConsulta = (reading: TerritorialLensReading) => ({
  primary: reading.primaryCollectedAt !== undefined ? reading.primaryCollectedAt : reading.primaryUrls ? reading.collectedAt[0] ?? null : null,
  comparison: reading.comparisonCollectedAt !== undefined
    ? reading.comparisonCollectedAt
    : reading.comparisonUrls ? reading.collectedAt[reading.primaryUrls ? 1 : 0] ?? null : null,
});

export type TerritorialLensContext = {
  primaryLens: string;
  requested: readonly string[];
  primaryBlocks?: readonly string[];
  extras: readonly TerritorialLensReading[];
  missing: SerpLensesMarker["missing"];
};

/**
 * A sobreposição agregada pelas lentes em que as DUAS consultas foram
 * observadas (A4).
 *
 *   `high`       só com `high` na MAIORIA (mais da metade) das lentes, e em
 *                pelo menos duas;
 *   fronteira    `high` em alguma lente sem ser maioria: nunca vira
 *                `usar_silo_existente` — vai para decisão humana;
 *   `medium`     em pelo menos metade das lentes;
 *   `low`        no resto.
 *
 * Com uma lente só (ou nenhuma extra com as duas consultas), vale a da lente
 * principal: o parecer de hoje.
 */
export function aggregateTerritorialOverlap(levels: readonly OverlapLevel[]): { level: OverlapLevel; frontier: { high: number; observed: number } | null } {
  const votantes = levels.filter(level => level !== "unknown");
  if (votantes.length <= 1) return { level: levels[0] ?? "unknown", frontier: null };
  const n = votantes.length;
  const altas = votantes.filter(level => level === "high").length;
  if (altas >= 2 && altas > n / 2) return { level: "high", frontier: null };
  if (altas >= 1) return { level: "medium", frontier: { high: altas, observed: n } };
  const medias = votantes.filter(level => level === "medium").length;
  return { level: medias >= n / 2 ? "medium" : "low", frontier: null };
}

/** Os blocos não orgânicos de um snapshot normalizado, na ordem das contagens. */
const blocksOf = (blocks: readonly string[] | undefined) => (blocks && blocks.length ? [...blocks] : undefined);

function territorialLensesMarker(input: {
  context: TerritorialLensContext;
  primary: SerpResearchSnapshot | null;
  comparison: SerpResearchSnapshot | null;
  primaryLevel: OverlapLevel | null;
  extraLevels: readonly { lens: string; level: OverlapLevel | null }[];
  aggregated: OverlapLevel | null;
}): SerpLensesMarker {
  const { context } = input;
  const datasPrincipal = [input.primary?.collectedAt, input.comparison?.collectedAt].filter((date): date is string => Boolean(date));
  const perLens: SerpLensesMarker["perLens"] = [
    {
      lens: context.primaryLens,
      observedQueries: [input.primary, input.comparison].filter(Boolean).length,
      oldestCollectedAt: datasPrincipal.length ? [...datasPrincipal].sort()[0] : null,
      newestCollectedAt: datasPrincipal.length ? [...datasPrincipal].sort().at(-1)! : null,
      verdict: input.primaryLevel,
      ...(blocksOf(context.primaryBlocks) ? { blocks: blocksOf(context.primaryBlocks) } : {}),
    },
    ...context.extras.map(reading => {
      const datas = [...reading.collectedAt].sort();
      return {
        lens: reading.lens,
        observedQueries: [reading.primaryUrls, reading.comparisonUrls].filter(Boolean).length,
        oldestCollectedAt: datas[0] ?? null,
        newestCollectedAt: datas.at(-1) ?? null,
        verdict: input.extraLevels.find(item => item.lens === reading.lens)?.level ?? null,
        ...(blocksOf(reading.blocks) ? { blocks: blocksOf(reading.blocks) } : {}),
      };
    }),
  ];
  const observed = perLens.filter((line, index) => index === 0 ? Boolean(input.primary) : Boolean(context.extras[index - 1]?.primaryUrls)).map(line => line.lens);
  const votos = [input.primaryLevel, ...input.extraLevels.map(item => item.level)].filter((level): level is OverlapLevel => Boolean(level) && level !== "unknown");
  const agreement = input.comparison && votos.length
    ? lensAgreementLabel(votos.filter(level => level === input.aggregated).length, votos.length)
    : "sem comparação";
  /*
   * O PORTÃO DE DATAS É POR CONSULTA, como no plano (`dateGroup` = texto da
   * consulta) e na formação (por keyword): as lentes da principal entre si, as
   * da comparação entre si, e vale a maior diferença. Um silo confirmado em
   * cache há 20 dias comparado com um silo novo pago agora NÃO é "lentes de
   * datas diferentes" quando as quatro lentes de cada um são da mesma época.
   */
  const porConsulta = context.extras.map(datasPorConsulta);
  const spread = Math.max(
    collectedAtSpreadDays([input.primary?.collectedAt, ...porConsulta.map(item => item.primary)]),
    collectedAtSpreadDays([input.comparison?.collectedAt, ...porConsulta.map(item => item.comparison)]),
  );
  return {
    requested: [...context.requested],
    observed,
    missing: [...context.missing],
    perLens,
    agreement,
    collectedAtSpreadDays: spread,
    datesDiverge: spread > SERP_LENS_DATES_DIVERGE_DAYS,
    ...(context.extras.length ? { note: SERP_LENS_DIGEST_NOTE } : {}),
  };
}

/**
 * Converte snapshots em parecer arquitetural.
 *
 * Nenhum caminho aqui altera silo: o retorno é leitura. Sem resultado
 * suficiente, o parecer diz `evidencia_insuficiente` em vez de arriscar.
 *
 * Com `lenses`, a sobreposição é votada nas quatro lentes (A4). Amplitude,
 * competição, tipo dominante e perguntas continuam saindo da lente principal:
 * o digest das extras não traz o People Also Ask.
 */
export function assessTerritorialSerp(input: {
  question: TerritorialSerpQuestion;
  snapshots: readonly SerpResearchSnapshot[];
  collectedAt?: string;
  lenses?: TerritorialLensContext;
}): TerritorialSerpAssessment {
  const { question } = input;
  const primary = input.snapshots[0] ?? null;
  const comparison = input.snapshots[1] ?? null;
  const collectedAt = input.collectedAt || primary?.collectedAt || new Date().toISOString();
  const primaryLevel = primary ? overlapOf(primary, comparison) : null;
  const extraLevels = (input.lenses?.extras || []).map(reading => ({
    lens: reading.lens,
    level: comparison && reading.primaryUrls && reading.comparisonUrls ? territorialOverlapOfUrls(reading.primaryUrls, reading.comparisonUrls) : null,
  }));
  const agregado = primaryLevel === null
    ? { level: null, frontier: null }
    : aggregateTerritorialOverlap([primaryLevel, ...extraLevels.map(item => item.level).filter((level): level is OverlapLevel => level !== null)]);
  const marcador = input.lenses
    ? territorialLensesMarker({ context: input.lenses, primary, comparison, primaryLevel, extraLevels, aggregated: agregado.level })
    : null;
  const base = {
    questionId: question.questionId,
    kind: question.kind,
    territoryRef: question.territoryRef,
    comparedTerritoryRef: question.comparedTerritoryRef,
    snapshotIds: input.snapshots.map(snapshot => snapshot.id),
    collectedAt,
    ...(marcador ? { lenses: marcador } : {}),
  };

  if (!primary || !primary.organicResults.length) {
    return TerritorialSerpAssessmentSchema.parse({
      ...base,
      compatibility: "insuficiente",
      observedIntent: null, dominantType: null, overlap: null,
      breadth: "unknown", competition: "unknown", conflicts: [],
      recommendation: "evidencia_insuficiente",
      reason: "A consulta não devolveu resultados suficientes para sustentar um parecer.",
    });
  }

  const dominantType = dominantTypeOf(primary);
  const breadth = breadthOf(primary);
  const competition = competitionOf(primary);
  // A sobreposição votada nas lentes; com uma lente só, é a de hoje.
  const overlap = agregado.level;
  const observedIntent = primary.diagnostic.dominantIntent;
  const conflicts = [...primary.diagnostic.possibleConflicts];
  const pareceHub = dominantType ? HUB_TYPES.has(dominantType) : false;

  // Sobreposição alta é o sinal mais forte: dois nomes, um universo só.
  if (overlap === "high") {
    conflicts.push("A SERP dos dois silos retorna majoritariamente as mesmas páginas.");
    return TerritorialSerpAssessmentSchema.parse({
      ...base,
      compatibility: "incompativel",
      observedIntent, dominantType, overlap, breadth, competition, conflicts,
      recommendation: "usar_silo_existente",
      reason: agregado.frontier === null && (marcador?.observed.length ?? 1) > 1
        ? "Forte sobreposição com o silo comparado na maioria das lentes: a evidência aponta para um único universo. A decisão continua humana."
        : "Forte sobreposição com o silo comparado: a evidência aponta para um único universo. A decisão continua humana.",
    });
  }

  /*
   * FRONTEIRA ENTRE LENTES (A4): sobreposição alta em alguma lente, mas não na
   * maioria. Uma lente sozinha nunca recomenda juntar os silos; a divergência
   * vira conflito dito e decisão humana.
   */
  if (agregado.frontier) {
    conflicts.push(`Sobreposição alta em ${agregado.frontier.high} de ${agregado.frontier.observed} lentes.`);
    return TerritorialSerpAssessmentSchema.parse({
      ...base,
      compatibility: "parcialmente_coerente",
      observedIntent, dominantType, overlap, breadth, competition, conflicts,
      recommendation: "manter_silo",
      reason: `A SERP dos dois silos se sobrepõe fortemente em ${agregado.frontier.high} de ${agregado.frontier.observed} lentes, sem maioria: a fronteira entre eles fica para decisão humana.`,
    });
  }

  if (question.kind === "head_candidate" || question.kind === "site_silo") {
    if (breadth === "narrow" && !pareceHub) {
      return TerritorialSerpAssessmentSchema.parse({
        ...base,
        compatibility: "parcialmente_coerente",
        observedIntent, dominantType, overlap, breadth, competition, conflicts,
        recommendation: question.kind === "head_candidate" ? "revisar_cabeceira" : "sem_profundidade",
        reason: "A SERP responde a uma necessidade específica e é dominada por conteúdo de artigo: o tema aparece como assunto, não como universo.",
      });
    }
    return TerritorialSerpAssessmentSchema.parse({
      ...base,
      compatibility: "coerente",
      observedIntent, dominantType, overlap, breadth, competition, conflicts,
      recommendation: "manter_silo",
      reason: pareceHub
        ? "A SERP é dominada por páginas de organização e cobre várias necessidades: comporta um universo."
        : "A SERP cobre várias intenções e necessidades: comporta um universo.",
    });
  }

  return TerritorialSerpAssessmentSchema.parse({
    ...base,
    compatibility: conflicts.length ? "parcialmente_coerente" : "coerente",
    observedIntent, dominantType, overlap, breadth, competition, conflicts,
    recommendation: "manter_silo",
    reason: overlap === "medium"
      ? "Há sobreposição parcial com o silo comparado; a fronteira precisa de decisão humana."
      : "A evidência externa não contradiz a hipótese interna deste silo.",
  });
}

/**
 * Motivo funcional para a SERP indisponível.
 *
 * "Bloqueado" sozinho não informa nada; a pessoa precisa saber o que fazer.
 */
export function territorialSerpBlockedReason(input: {
  questions: readonly TerritorialSerpQuestion[];
  hasBrand: boolean;
}): string | null {
  if (!input.hasBrand) return "Selecione uma marca ativa para validar a SERP.";
  if (!input.questions.length) {
    return "Nenhuma dúvida arquitetural requer SERP: os silos atuais estão confirmados ou sem conflito aberto.";
  }
  return null;
}
