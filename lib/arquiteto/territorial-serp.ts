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

const overlapOf = (primary: SerpResearchSnapshot, comparison: SerpResearchSnapshot | null) => {
  if (!comparison) return null;
  const urls = new Set(primary.organicResults.map(result => result.url));
  if (!urls.size || !comparison.organicResults.length) return "unknown" as const;
  const compartilhados = comparison.organicResults.filter(result => urls.has(result.url)).length;
  const proporcao = compartilhados / Math.min(urls.size, comparison.organicResults.length);
  if (proporcao >= 0.5) return "high" as const;
  if (proporcao >= 0.2) return "medium" as const;
  return "low" as const;
};

/**
 * Converte snapshots em parecer arquitetural.
 *
 * Nenhum caminho aqui altera silo: o retorno é leitura. Sem resultado
 * suficiente, o parecer diz `evidencia_insuficiente` em vez de arriscar.
 */
export function assessTerritorialSerp(input: {
  question: TerritorialSerpQuestion;
  snapshots: readonly SerpResearchSnapshot[];
  collectedAt?: string;
}): TerritorialSerpAssessment {
  const { question } = input;
  const primary = input.snapshots[0] ?? null;
  const comparison = input.snapshots[1] ?? null;
  const collectedAt = input.collectedAt || primary?.collectedAt || new Date().toISOString();
  const base = {
    questionId: question.questionId,
    kind: question.kind,
    territoryRef: question.territoryRef,
    comparedTerritoryRef: question.comparedTerritoryRef,
    snapshotIds: input.snapshots.map(snapshot => snapshot.id),
    collectedAt,
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
  const overlap = overlapOf(primary, comparison);
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
      reason: "Forte sobreposição com o silo comparado: a evidência aponta para um único universo. A decisão continua humana.",
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
