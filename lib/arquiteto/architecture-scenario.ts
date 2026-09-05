import { z } from "zod";
import { ContentHashSchema } from "./contracts.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";
import { contentHash } from "./versioning.ts";
import {
  TerritoryArchitecturalOriginSchema,
  TerritoryKindSchema,
  TerritoryMembershipStateSchema,
  TerritoryPublicationProtectionSchema,
  TerritoryRefSchema,
} from "./territory.ts";

/**
 * Arquitetura candidata completa — contrato comum a Lógica, SERP, IA, Humano e
 * Atual, nos DOIS níveis do Arquiteto (SDD Silo-first, Fase 1).
 *
 * Cenário é PROJEÇÃO: nenhum cenário altera estado canônico e nenhum processo
 * altera o cenário de outro. Um envelope comum, um validador, um diff — com
 * payload específico por nível, nunca um genérico que esconda invariantes.
 *
 * `level` é OBRIGATÓRIO no domínio. Payload legado sem `level` só é aceito na
 * borda nomeada `parseArchitectureScenarioWithLegacyLevel`; nenhum outro ponto
 * assume nível por omissão.
 *
 * Esta fase é domínio puro: sem storage, sem UI, sem provider.
 */

export const SCENARIO_LEVELS = ["article", "silo"] as const;
export const ScenarioLevelSchema = z.enum(SCENARIO_LEVELS);
export type ScenarioLevel = z.infer<typeof ScenarioLevelSchema>;

export const SCENARIO_TYPES = ["base", "logic", "serp", "ai", "human", "current"] as const;
export const ScenarioTypeSchema = z.enum(SCENARIO_TYPES);
export type ScenarioType = z.infer<typeof ScenarioTypeSchema>;

/**
 * `complete` particiona todo o universo declarado. `partial` representa apenas o
 * que a fonte consegue reconstruir — uma avaliação SERP histórica, por exemplo,
 * não declara destino e por isso não vira partição. Lacuna continua lacuna
 * explícita: nada é preenchido por inferência silenciosa.
 */
export const ScenarioCapabilitySchema = z.enum(["complete", "partial"]);
export type ScenarioCapability = z.infer<typeof ScenarioCapabilitySchema>;

/** Vocabulário estrutural do Arquiteto; `reviewRole` transitório não é autoridade. */
export const ScenarioStructuralRoleSchema = z.enum(["principal", "secundaria", "reforco_narrativo"]);
export type ScenarioStructuralRole = z.infer<typeof ScenarioStructuralRoleSchema>;

export const ScenarioSourceRefSchema = z.object({
  sourceType: z.enum(["engine", "serp_assessment", "ai_review", "article_dna", "working_copy", "silo_dna", "territory"]),
  entityId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  versionNumber: z.number().int().positive().optional(),
  contentHash: z.string().min(1).optional(),
}).strict();
export type ScenarioSourceRef = z.infer<typeof ScenarioSourceRefSchema>;

/**
 * Universo particionado pelo cenário. Sem ele, um cenário de 10 keywords seria
 * comparado com uma working copy de 12 como se fossem a mesma coisa.
 */
export const ScenarioUniverseSchema = z.object({
  keywordIds: z.array(z.string().min(1)),
  contentHash: ContentHashSchema,
}).strict();
export type ScenarioUniverse = z.infer<typeof ScenarioUniverseSchema>;

export const ScenarioBaseRefSchema = z.object({
  level: ScenarioLevelSchema,
  scenarioType: ScenarioTypeSchema,
  contentHash: ContentHashSchema,
  universeContentHash: ContentHashSchema,
}).strict();

export const ScenarioArticleProtectionsSchema = z.object({
  principalPolicy: z.enum(["locked", "reviewable", "unknown"]).nullable(),
  publishedUrl: z.string().min(1).nullable(),
}).strict();

export const ArticleScenarioSchema = z.object({
  /** Identidade estável do Article; nunca label, slug provisório ou índice visual. */
  articleRef: z.string().min(1),
  publishedAnchorId: z.string().min(1).nullable(),
  principalKeywordId: z.string().min(1),
  keywords: z.array(z.object({
    keywordId: z.string().min(1),
    role: ScenarioStructuralRoleSchema,
  }).strict()).min(1),
  protections: ScenarioArticleProtectionsSchema,
}).strict();
export type ArticleScenario = z.infer<typeof ArticleScenarioSchema>;

/**
 * Entrada territorial do cenário de nível Silo. Carrega `keywordRefs` porque um
 * cenário é SNAPSHOT IMUTÁVEL — fotografia da projeção num instante, nunca
 * estado editável. A pergunta "onde a keyword está agora" tem um caminho só: o
 * item de workflow da keyword.
 */
export const TerritoryScenarioEntrySchema = z.object({
  territoryRef: TerritoryRefSchema,
  name: z.string().min(1).nullable(),
  centralEntity: z.string(),
  macroIntent: z.string(),
  boundary: z.object({
    includes: z.array(z.string().min(1)),
    excludes: z.array(z.string().min(1)),
  }).strict(),
  keywordRefs: z.array(z.string().min(1)),
  territoryKind: TerritoryKindSchema,
  architecturalOrigin: TerritoryArchitecturalOriginSchema,
  publicationProtection: TerritoryPublicationProtectionSchema,
  slugProposal: z.string().min(1).nullable(),
  existingSiloId: z.string().min(1).nullable(),
  conflictCodes: z.array(z.string().min(1)),
}).strict();
export type TerritoryScenarioEntry = z.infer<typeof TerritoryScenarioEntrySchema>;

export const UnassignedKeywordEntrySchema = z.object({
  keywordId: z.string().min(1),
  state: TerritoryMembershipStateSchema,
  reason: z.string().min(1),
}).strict();
export type UnassignedKeywordEntry = z.infer<typeof UnassignedKeywordEntrySchema>;

/**
 * Proveniência preserva "SERP + 3 ajustes humanos" sem reduzir o resultado ao
 * rótulo "SERP". `scenarioType: "current"` existe no read-model; storage de
 * CURRENT continua NÃO autorizado.
 */
export const ScenarioProvenanceSchema = z.object({
  producedBy: z.enum(["engine", "serp", "ai", "human", "confirmation"]),
  adoptedFromScenarioType: ScenarioTypeSchema.nullable(),
  humanAdjustmentCount: z.number().int().nonnegative(),
  note: z.string().min(1).nullable(),
}).strict();
export type ScenarioProvenance = z.infer<typeof ScenarioProvenanceSchema>;

const envelopeShape = {
  schemaVersion: z.literal(1),
  scenarioId: z.string().min(1),
  brandId: z.string().min(1),
  scenarioType: ScenarioTypeSchema,
  capability: ScenarioCapabilitySchema,
  universe: ScenarioUniverseSchema,
  baseRef: ScenarioBaseRefSchema.nullable(),
  sourceRefs: z.array(ScenarioSourceRefSchema),
  provenance: ScenarioProvenanceSchema,
};

export const ArticleArchitectureScenarioSchema = z.object({
  ...envelopeShape,
  level: z.literal("article"),
  /** Escopo territorial do fluxo novo; ausente nos cenários legados da Brand inteira. */
  confirmedTerritoryRef: TerritoryRefSchema.nullable().optional(),
  articles: z.array(ArticleScenarioSchema),
  ungroupedKeywordIds: z.array(z.string().min(1)),
}).strict();
export type ArticleArchitectureScenario = z.infer<typeof ArticleArchitectureScenarioSchema>;

export const SiloArchitectureScenarioSchema = z.object({
  ...envelopeShape,
  level: z.literal("silo"),
  territories: z.array(TerritoryScenarioEntrySchema),
  unassignedKeywords: z.array(UnassignedKeywordEntrySchema),
}).strict();
export type SiloArchitectureScenario = z.infer<typeof SiloArchitectureScenarioSchema>;

export const ArchitectureScenarioSchema = z.discriminatedUnion("level", [
  ArticleArchitectureScenarioSchema,
  SiloArchitectureScenarioSchema,
]);
export type ArchitectureScenario = z.infer<typeof ArchitectureScenarioSchema>;

export const isArticleScenarioLevel = (scenario: ArchitectureScenario): scenario is ArticleArchitectureScenario =>
  scenario.level === "article";
export const isSiloScenarioLevel = (scenario: ArchitectureScenario): scenario is SiloArchitectureScenario =>
  scenario.level === "silo";

/* ------------------------------ borda legada ----------------------------- */

export type ScenarioParseResult =
  | { ok: true; scenario: ArchitectureScenario }
  | { ok: false; code: "LEVEL_REQUIRED" | "INVALID_SCENARIO"; issues: z.ZodIssue[] };

/**
 * Porta canônica do domínio: `level` ausente ou desconhecido é recusado com
 * `LEVEL_REQUIRED`. Nenhum default é assumido aqui.
 */
export function safeParseArchitectureScenario(value: unknown): ScenarioParseResult {
  const level = (value as { level?: unknown } | null | undefined)?.level;
  if (!ScenarioLevelSchema.safeParse(level).success) {
    return { ok: false, code: "LEVEL_REQUIRED", issues: [] };
  }
  const parsed = ArchitectureScenarioSchema.safeParse(value);
  return parsed.success
    ? { ok: true, scenario: parsed.data }
    : { ok: false, code: "INVALID_SCENARIO", issues: parsed.error.issues };
}

/**
 * BORDA DE COMPATIBILIDADE — o único ponto do sistema autorizado a assumir
 * nível por omissão. Payload gravado antes do nível existir é, por definição,
 * de Article. O default vive aqui e não se propaga: todo o resto do domínio
 * exige `level` explícito.
 */
export function parseArchitectureScenarioWithLegacyLevel(value: unknown): ScenarioParseResult {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!candidate) return { ok: false, code: "INVALID_SCENARIO", issues: [] };
  return safeParseArchitectureScenario("level" in candidate ? candidate : { ...candidate, level: "article" });
}

/* ------------------------------- universo ------------------------------- */

const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort();

/** IDs ordenados e sem duplicata antes do hash: mesmo conjunto, mesmo hash. */
export async function buildScenarioUniverse(keywordIds: readonly string[]): Promise<ScenarioUniverse> {
  const ids = sortedUnique(keywordIds.map(String));
  return { keywordIds: ids, contentHash: await contentHash({ keywordIds: ids }) };
}

export function sameScenarioUniverse(left: ScenarioUniverse, right: ScenarioUniverse): boolean {
  return left.contentHash === right.contentHash;
}

/**
 * Só para o relatório de um diff JÁ recusado por nível: o campo `universeMatch`
 * é informativo ali, e um universo ausente não pode transformar a recusa por
 * nível em exceção.
 */
function sameScenarioUniverseSafe(
  left: { universe?: ScenarioUniverse },
  right: { universe?: ScenarioUniverse },
): boolean {
  return Boolean(left.universe && right.universe && sameScenarioUniverse(left.universe, right.universe));
}

/* ----------------------------- normalização ----------------------------- */

/**
 * Ordena para comparação determinística e nada mais. Não conserta arquitetura
 * inválida: normalizar nunca transforma erro estrutural em sucesso — quem
 * detecta erro é o validador.
 */
export function normalizeArchitectureScenario<T extends ArchitectureScenario>(scenario: T): T {
  const shared = {
    universe: {
      keywordIds: sortedUnique(scenario.universe.keywordIds),
      contentHash: scenario.universe.contentHash,
    },
    sourceRefs: [...scenario.sourceRefs].sort((left, right) =>
      left.sourceType.localeCompare(right.sourceType) || left.entityId.localeCompare(right.entityId)),
  };

  if (scenario.level === "silo") {
    return {
      ...scenario,
      ...shared,
      territories: [...scenario.territories]
        .map(territory => ({ ...territory, keywordRefs: sortedUnique(territory.keywordRefs) }))
        .sort((left, right) => left.territoryRef.localeCompare(right.territoryRef)),
      unassignedKeywords: [...scenario.unassignedKeywords]
        .sort((left, right) => left.keywordId.localeCompare(right.keywordId)),
    } as T;
  }

  return {
    ...scenario,
    ...shared,
    articles: [...scenario.articles]
      .map(article => ({
        ...article,
        keywords: [...article.keywords].sort((left, right) => left.keywordId.localeCompare(right.keywordId)),
      }))
      .sort((left, right) => left.articleRef.localeCompare(right.articleRef)),
    ungroupedKeywordIds: sortedUnique(scenario.ungroupedKeywordIds),
  } as T;
}

/* ------------------------------- validação ------------------------------- */

export const SCENARIO_ISSUE_CODES = [
  "DUPLICATE_KEYWORD",
  "KEYWORD_MISSING_FROM_COMPLETE_SCENARIO",
  "KEYWORD_BOTH_GROUPED_AND_UNGROUPED",
  "KEYWORD_OUTSIDE_UNIVERSE",
  "ARTICLE_WITHOUT_PRINCIPAL",
  "MULTIPLE_PRINCIPALS",
  "PRINCIPAL_NOT_MEMBER",
  "ARTICLE_OVER_KEYWORD_LIMIT",
  "DUPLICATE_ARTICLE_KEY",
  "DUPLICATE_TERRITORY_KEY",
  "CROSS_BRAND",
  "UNIVERSE_HASH_MISMATCH",
  "LEVEL_MISMATCH",
] as const;
export type ScenarioIssueCode = (typeof SCENARIO_ISSUE_CODES)[number];

export type ScenarioIssue = {
  code: ScenarioIssueCode;
  articleRef?: string;
  territoryRef?: string;
  keywordId?: string;
  detail?: string;
};

export type ScenarioValidation = { valid: boolean; issues: ScenarioIssue[] };

type Placement = { containerRef: string | null; role: ScenarioStructuralRole | null };

/** Membership do cenário, indiferente ao nível: container = Article ou Território. */
function placementIndex(scenario: ArchitectureScenario): Map<string, Placement> {
  const index = new Map<string, Placement>();
  if (scenario.level === "silo") {
    for (const territory of scenario.territories) {
      for (const keywordId of territory.keywordRefs) index.set(keywordId, { containerRef: territory.territoryRef, role: null });
    }
    for (const entry of scenario.unassignedKeywords) {
      if (!index.has(entry.keywordId)) index.set(entry.keywordId, { containerRef: null, role: null });
    }
    return index;
  }
  for (const article of scenario.articles) {
    for (const keyword of article.keywords) index.set(keyword.keywordId, { containerRef: article.articleRef, role: keyword.role });
  }
  for (const keywordId of scenario.ungroupedKeywordIds) {
    if (!index.has(keywordId)) index.set(keywordId, { containerRef: null, role: null });
  }
  return index;
}

/**
 * Resultado estruturado, nunca boolean: quem consome precisa saber qual
 * invariante caiu e sobre qual entidade. Códigos são de domínio, não de UI.
 */
export function validateArchitectureScenario(
  scenario: ArchitectureScenario,
  options: { brandId?: string; expectedUniverse?: ScenarioUniverse; expectedLevel?: ScenarioLevel } = {},
): ScenarioValidation {
  const issues: ScenarioIssue[] = [];

  if (options.brandId && options.brandId !== scenario.brandId) {
    issues.push({ code: "CROSS_BRAND", detail: `${scenario.brandId} ≠ ${options.brandId}` });
  }
  if (options.expectedLevel && options.expectedLevel !== scenario.level) {
    issues.push({ code: "LEVEL_MISMATCH", detail: `${scenario.level} ≠ ${options.expectedLevel}` });
  }
  if (options.expectedUniverse && !sameScenarioUniverse(scenario.universe, options.expectedUniverse)) {
    issues.push({ code: "UNIVERSE_HASH_MISMATCH", detail: scenario.universe.contentHash });
  }

  const groupedBy = new Map<string, string[]>();
  const seenContainerRefs = new Set<string>();

  if (scenario.level === "article") {
    for (const article of scenario.articles) {
      if (seenContainerRefs.has(article.articleRef)) {
        issues.push({ code: "DUPLICATE_ARTICLE_KEY", articleRef: article.articleRef });
      }
      seenContainerRefs.add(article.articleRef);

      if (article.keywords.length > MAX_KEYWORDS_PER_ARTICLE) {
        issues.push({ code: "ARTICLE_OVER_KEYWORD_LIMIT", articleRef: article.articleRef, detail: String(article.keywords.length) });
      }

      const principals = article.keywords.filter(keyword => keyword.role === "principal");
      if (!principals.length) issues.push({ code: "ARTICLE_WITHOUT_PRINCIPAL", articleRef: article.articleRef });
      if (principals.length > 1) {
        issues.push({ code: "MULTIPLE_PRINCIPALS", articleRef: article.articleRef, detail: String(principals.length) });
      }
      if (!article.keywords.some(keyword => keyword.keywordId === article.principalKeywordId)) {
        issues.push({ code: "PRINCIPAL_NOT_MEMBER", articleRef: article.articleRef, keywordId: article.principalKeywordId });
      }

      const seenInArticle = new Set<string>();
      for (const keyword of article.keywords) {
        if (seenInArticle.has(keyword.keywordId)) {
          issues.push({ code: "DUPLICATE_KEYWORD", articleRef: article.articleRef, keywordId: keyword.keywordId });
        }
        seenInArticle.add(keyword.keywordId);
        groupedBy.set(keyword.keywordId, [...(groupedBy.get(keyword.keywordId) || []), article.articleRef]);
      }
    }
  } else {
    for (const territory of scenario.territories) {
      if (seenContainerRefs.has(territory.territoryRef)) {
        issues.push({ code: "DUPLICATE_TERRITORY_KEY", territoryRef: territory.territoryRef });
      }
      seenContainerRefs.add(territory.territoryRef);

      const seenInTerritory = new Set<string>();
      for (const keywordId of territory.keywordRefs) {
        if (seenInTerritory.has(keywordId)) {
          issues.push({ code: "DUPLICATE_KEYWORD", territoryRef: territory.territoryRef, keywordId });
        }
        seenInTerritory.add(keywordId);
        groupedBy.set(keywordId, [...(groupedBy.get(keywordId) || []), territory.territoryRef]);
      }
    }
  }

  for (const [keywordId, refs] of groupedBy) {
    if (refs.length > 1) issues.push({ code: "DUPLICATE_KEYWORD", keywordId, detail: refs.join(", ") });
  }

  const ungrouped = new Set(scenario.level === "silo"
    ? scenario.unassignedKeywords.map(entry => entry.keywordId)
    : scenario.ungroupedKeywordIds);
  for (const keywordId of ungrouped) {
    if (groupedBy.has(keywordId)) issues.push({ code: "KEYWORD_BOTH_GROUPED_AND_UNGROUPED", keywordId });
  }

  const universe = new Set(scenario.universe.keywordIds);
  for (const keywordId of [...groupedBy.keys(), ...ungrouped]) {
    if (!universe.has(keywordId)) issues.push({ code: "KEYWORD_OUTSIDE_UNIVERSE", keywordId });
  }

  // Só a partição completa precisa cobrir o universo. `partial` declara ausência.
  if (scenario.capability === "complete") {
    for (const keywordId of universe) {
      if (!groupedBy.has(keywordId) && !ungrouped.has(keywordId)) {
        issues.push({ code: "KEYWORD_MISSING_FROM_COMPLETE_SCENARIO", keywordId });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/* --------------------------------- diff --------------------------------- */

export const SCENARIO_DIFF_TYPES = [
  "ARTICLE_CREATED",
  "ARTICLE_REMOVED",
  "ARTICLE_SPLIT",
  "ARTICLE_MERGED",
  "KEYWORD_MOVED",
  "KEYWORD_UNGROUPED",
  "KEYWORD_GROUPED",
  "PRINCIPAL_CHANGED",
  "ROLE_CHANGED",
  "TERRITORY_CREATED",
  "TERRITORY_REMOVED",
  "TERRITORY_SPLIT",
  "TERRITORY_MERGED",
  "KEYWORD_TERRITORY_MOVED",
  "KEYWORD_TERRITORY_ASSIGNED",
  "KEYWORD_TERRITORY_UNASSIGNED",
  "BOUNDARY_CHANGED",
  "SLUG_PROPOSAL_CHANGED",
] as const;
export type ScenarioDiffType = (typeof SCENARIO_DIFF_TYPES)[number];

export type ScenarioDiffEntry = {
  type: ScenarioDiffType;
  keywordId?: string;
  articleRef?: string;
  territoryRef?: string;
  fromArticleRef?: string | null;
  toArticleRef?: string | null;
  fromTerritoryRef?: string | null;
  toTerritoryRef?: string | null;
  fromRole?: ScenarioStructuralRole;
  toRole?: ScenarioStructuralRole;
  fromKeywordId?: string;
  toKeywordId?: string;
  relatedArticleRefs?: string[];
  relatedTerritoryRefs?: string[];
  detail?: string;
};

export type ScenarioDiffSummary = {
  articleCreatedCount: number;
  articleRemovedCount: number;
  splitCount: number;
  mergeCount: number;
  keywordMovedCount: number;
  keywordGroupedCount: number;
  keywordUngroupedCount: number;
  principalChangedCount: number;
  roleChangedCount: number;
  territoryCreatedCount: number;
  territoryRemovedCount: number;
  territorySplitCount: number;
  territoryMergeCount: number;
  keywordTerritoryMovedCount: number;
  keywordTerritoryAssignedCount: number;
  keywordTerritoryUnassignedCount: number;
  boundaryChangedCount: number;
  slugProposalChangedCount: number;
};

export type ScenarioDiff = {
  comparable: boolean;
  universeMatch: boolean;
  levelMatch: boolean;
  incomparableReason: "LEVEL_MISMATCH" | "UNIVERSE_HASH_MISMATCH" | null;
  entries: ScenarioDiffEntry[];
  summary: ScenarioDiffSummary;
};

/** Divisão/junção só contam a partir de duas keywords: uma keyword é MOVE. */
const MATERIAL_MEMBERSHIP = 2;

const emptySummary = (): ScenarioDiffSummary => ({
  articleCreatedCount: 0,
  articleRemovedCount: 0,
  splitCount: 0,
  mergeCount: 0,
  keywordMovedCount: 0,
  keywordGroupedCount: 0,
  keywordUngroupedCount: 0,
  principalChangedCount: 0,
  roleChangedCount: 0,
  territoryCreatedCount: 0,
  territoryRemovedCount: 0,
  territorySplitCount: 0,
  territoryMergeCount: 0,
  keywordTerritoryMovedCount: 0,
  keywordTerritoryAssignedCount: 0,
  keywordTerritoryUnassignedCount: 0,
  boundaryChangedCount: 0,
  slugProposalChangedCount: 0,
});

const SUMMARY_BY_TYPE: Record<ScenarioDiffType, keyof ScenarioDiffSummary> = {
  ARTICLE_CREATED: "articleCreatedCount",
  ARTICLE_REMOVED: "articleRemovedCount",
  ARTICLE_SPLIT: "splitCount",
  ARTICLE_MERGED: "mergeCount",
  KEYWORD_MOVED: "keywordMovedCount",
  KEYWORD_GROUPED: "keywordGroupedCount",
  KEYWORD_UNGROUPED: "keywordUngroupedCount",
  PRINCIPAL_CHANGED: "principalChangedCount",
  ROLE_CHANGED: "roleChangedCount",
  TERRITORY_CREATED: "territoryCreatedCount",
  TERRITORY_REMOVED: "territoryRemovedCount",
  TERRITORY_SPLIT: "territorySplitCount",
  TERRITORY_MERGED: "territoryMergeCount",
  KEYWORD_TERRITORY_MOVED: "keywordTerritoryMovedCount",
  KEYWORD_TERRITORY_ASSIGNED: "keywordTerritoryAssignedCount",
  KEYWORD_TERRITORY_UNASSIGNED: "keywordTerritoryUnassignedCount",
  BOUNDARY_CHANGED: "boundaryChangedCount",
  SLUG_PROPOSAL_CHANGED: "slugProposalChangedCount",
};

const summarize = (entries: readonly ScenarioDiffEntry[]): ScenarioDiffSummary => {
  const summary = emptySummary();
  for (const entry of entries) summary[SUMMARY_BY_TYPE[entry.type]] += 1;
  return summary;
};

const incomparable = (reason: ScenarioDiff["incomparableReason"], levelMatch: boolean, universeMatch: boolean): ScenarioDiff => ({
  comparable: false,
  universeMatch,
  levelMatch,
  incomparableReason: reason,
  entries: [],
  summary: emptySummary(),
});

/**
 * Membership material: um container de referência cujas keywords se distribuem
 * entre 2+ containers candidatos é SPLIT; um container candidato que concentra
 * membership material de 2+ containers de referência é MERGE. Abaixo do limiar
 * o diff devolve os eventos básicos, sem forçar classificação superior.
 */
function materialRegrouping(
  referenceMembers: Map<string, string[]>,
  candidatePlacement: Map<string, Placement>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [containerRef, keywordIds] of referenceMembers) {
    const destinations = new Map<string, number>();
    for (const keywordId of keywordIds) {
      const destination = candidatePlacement.get(keywordId)?.containerRef;
      if (!destination) continue;
      destinations.set(destination, (destinations.get(destination) || 0) + 1);
    }
    const material = [...destinations.entries()].filter(([, count]) => count >= MATERIAL_MEMBERSHIP);
    if (material.length >= 2) result.set(containerRef, material.map(([ref]) => ref).sort());
  }
  return result;
}

/**
 * Diff DERIVADO entre dois cenários. Nunca é fonte canônica.
 *
 * Níveis diferentes não são comparáveis (`LEVEL_MISMATCH`), assim como universos
 * diferentes (`UNIVERSE_HASH_MISMATCH`): em ambos os casos o diff devolve vazio
 * em vez de inventar equivalência.
 *
 * Equivalência de container é por identidade estável — `articleRef` ou
 * `territoryRef`. Renomear identidade é criar e remover, não mover, para que o
 * diff não invente continuidade onde ela não foi declarada.
 *
 * PRINCIPAL_CHANGED e ROLE_CHANGED não se sobrepõem: a troca de Principal é
 * registrada uma vez, e o papel das duas keywords envolvidas nessa troca não
 * vira ROLE_CHANGED — isso duplicaria o mesmo fato na contagem.
 */
export function deriveArchitectureScenarioDiff(
  reference: ArchitectureScenario,
  candidate: ArchitectureScenario,
): ScenarioDiff {
  // LEVEL tem precedência semântica sobre universe e é decidido SEM tocar nele:
  // comparar universos de níveis diferentes já pressupõe que a comparação faz
  // sentido, e não faz. Cenário de Silo e cenário de Article são incomparáveis
  // qualquer que seja o universo — inclusive quando um deles nem tem universo.
  if (reference.level !== candidate.level) {
    return incomparable("LEVEL_MISMATCH", false, sameScenarioUniverseSafe(reference, candidate));
  }
  const universeMatch = sameScenarioUniverse(reference.universe, candidate.universe);
  if (!universeMatch) return incomparable("UNIVERSE_HASH_MISMATCH", true, false);

  const entries: ScenarioDiffEntry[] = [];
  const referencePlacement = placementIndex(reference);
  const candidatePlacement = placementIndex(candidate);
  const isSilo = reference.level === "silo" && candidate.level === "silo";

  const referenceContainers = new Set(
    isSilo
      ? (reference as SiloArchitectureScenario).territories.map(item => item.territoryRef)
      : (reference as ArticleArchitectureScenario).articles.map(item => item.articleRef),
  );
  const candidateContainers = new Set(
    isSilo
      ? (candidate as SiloArchitectureScenario).territories.map(item => item.territoryRef)
      : (candidate as ArticleArchitectureScenario).articles.map(item => item.articleRef),
  );

  for (const ref of candidateContainers) {
    if (referenceContainers.has(ref)) continue;
    entries.push(isSilo ? { type: "TERRITORY_CREATED", territoryRef: ref } : { type: "ARTICLE_CREATED", articleRef: ref });
  }
  for (const ref of referenceContainers) {
    if (candidateContainers.has(ref)) continue;
    entries.push(isSilo ? { type: "TERRITORY_REMOVED", territoryRef: ref } : { type: "ARTICLE_REMOVED", articleRef: ref });
  }

  const principalSwaps = new Map<string, { from: string; to: string }>();
  if (!isSilo) {
    const referenceArticles = new Map((reference as ArticleArchitectureScenario).articles.map(item => [item.articleRef, item]));
    const candidateArticles = new Map((candidate as ArticleArchitectureScenario).articles.map(item => [item.articleRef, item]));
    for (const [articleRef, referenceArticle] of referenceArticles) {
      const candidateArticle = candidateArticles.get(articleRef);
      if (!candidateArticle) continue;
      if (referenceArticle.principalKeywordId !== candidateArticle.principalKeywordId) {
        principalSwaps.set(articleRef, { from: referenceArticle.principalKeywordId, to: candidateArticle.principalKeywordId });
        entries.push({
          type: "PRINCIPAL_CHANGED",
          articleRef,
          fromKeywordId: referenceArticle.principalKeywordId,
          toKeywordId: candidateArticle.principalKeywordId,
        });
      }
    }
  } else {
    const referenceTerritories = new Map((reference as SiloArchitectureScenario).territories.map(item => [item.territoryRef, item]));
    for (const territory of (candidate as SiloArchitectureScenario).territories) {
      const before = referenceTerritories.get(territory.territoryRef);
      if (!before) continue;
      const boundaryChanged = JSON.stringify([[...before.boundary.includes].sort(), [...before.boundary.excludes].sort()])
        !== JSON.stringify([[...territory.boundary.includes].sort(), [...territory.boundary.excludes].sort()]);
      if (boundaryChanged) entries.push({ type: "BOUNDARY_CHANGED", territoryRef: territory.territoryRef });
      if (before.slugProposal !== territory.slugProposal) {
        entries.push({
          type: "SLUG_PROPOSAL_CHANGED",
          territoryRef: territory.territoryRef,
          detail: `${before.slugProposal ?? "—"} → ${territory.slugProposal ?? "—"}`,
        });
      }
    }
  }

  for (const [keywordId, before] of referencePlacement) {
    const after = candidatePlacement.get(keywordId);
    if (!after) continue;
    if (before.containerRef === after.containerRef) {
      if (isSilo || !before.containerRef || !before.role || !after.role || before.role === after.role) continue;
      const swap = principalSwaps.get(before.containerRef);
      // O papel das duas pontas da troca de Principal já foi contado.
      const explainedByPrincipalSwap = Boolean(swap) && (swap!.from === keywordId || swap!.to === keywordId);
      if (!explainedByPrincipalSwap) {
        entries.push({ type: "ROLE_CHANGED", keywordId, articleRef: before.containerRef, fromRole: before.role, toRole: after.role });
      }
      continue;
    }
    if (before.containerRef && after.containerRef) {
      entries.push(isSilo
        ? { type: "KEYWORD_TERRITORY_MOVED", keywordId, fromTerritoryRef: before.containerRef, toTerritoryRef: after.containerRef }
        : { type: "KEYWORD_MOVED", keywordId, fromArticleRef: before.containerRef, toArticleRef: after.containerRef });
    } else if (before.containerRef && !after.containerRef) {
      entries.push(isSilo
        ? { type: "KEYWORD_TERRITORY_UNASSIGNED", keywordId, fromTerritoryRef: before.containerRef, toTerritoryRef: null }
        : { type: "KEYWORD_UNGROUPED", keywordId, fromArticleRef: before.containerRef, toArticleRef: null });
    } else if (!before.containerRef && after.containerRef) {
      entries.push(isSilo
        ? { type: "KEYWORD_TERRITORY_ASSIGNED", keywordId, fromTerritoryRef: null, toTerritoryRef: after.containerRef }
        : { type: "KEYWORD_GROUPED", keywordId, fromArticleRef: null, toArticleRef: after.containerRef });
    }
  }

  const membersOf = (scenario: ArchitectureScenario) => {
    const members = new Map<string, string[]>();
    if (scenario.level === "silo") {
      for (const territory of scenario.territories) members.set(territory.territoryRef, [...territory.keywordRefs]);
      return members;
    }
    for (const article of scenario.articles) members.set(article.articleRef, article.keywords.map(keyword => keyword.keywordId));
    return members;
  };

  for (const [containerRef, related] of materialRegrouping(membersOf(reference), candidatePlacement)) {
    entries.push(isSilo
      ? { type: "TERRITORY_SPLIT", territoryRef: containerRef, relatedTerritoryRefs: related }
      : { type: "ARTICLE_SPLIT", articleRef: containerRef, relatedArticleRefs: related });
  }
  for (const [containerRef, related] of materialRegrouping(membersOf(candidate), referencePlacement)) {
    entries.push(isSilo
      ? { type: "TERRITORY_MERGED", territoryRef: containerRef, relatedTerritoryRefs: related }
      : { type: "ARTICLE_MERGED", articleRef: containerRef, relatedArticleRefs: related });
  }

  return { comparable: true, universeMatch: true, levelMatch: true, incomparableReason: null, entries, summary: summarize(entries) };
}
