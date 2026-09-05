import { z } from "zod";
import {
  TerritoryArchitecturalOriginSchema,
  TerritoryIngestionOriginSchema,
  TerritoryRefSchema,
} from "./territory.ts";

/**
 * Base Territorial da Marca — Etapa 0 do Arquiteto (SDD Silo-first, adendo
 * aprovado em 2026-09-02). Contrato de domínio puro.
 *
 * A Etapa 0 vem ANTES das KeywordDNAs. Ela responde "quais linhas editoriais
 * esta Marca já possui?" a partir de três fontes: publicações/site existentes,
 * territórios estratégicos declarados e estrutura importada explicitamente.
 *
 * Regras que este módulo materializa:
 *   SITEMAP_ENTRY     != SILO
 *   URL_DIRECTORY     != SILO
 *   CATEGORY          != SILO
 *   SITE_STRUCTURE    != SILODNA
 *   CENTRAL_ENTITY    != KEYWORDDNA
 *   Evidência NUNCA vira território por conta própria.
 *
 * Fase de contratos: sem persistência, sem rede, sem provider, sem DDL.
 */

/* ------------------------------ eixos ortogonais ------------------------- */

/**
 * QUATRO eixos independentes, deliberadamente NÃO fundidos num enum só. Misturar
 * observação, decisão, origem e publicação foi o defeito que esta arquitetura
 * corrige — e um `reconciliationState` único voltaria a cometê-lo.
 *
 *   observationState     — o que foi OBSERVADO (site × banco). Fato, não opinião.
 *   decisionState        — o que o HUMANO decidiu sobre a estrutura observada.
 *   architecturalOrigin  — de onde a estrutura vem, arquiteturalmente.
 *   ingestionOrigin      — por qual porta ela entrou. Nunca justifica arquitetura.
 *
 * `publicationState` é um quinto eixo, factual, sobre estar publicada ou não.
 */

/** Eixo de OBSERVAÇÃO: divergência entre site e banco editorial. */
export const BASE_OBSERVATION_STATES = ["matched", "site_only", "database_only", "conflicting", "unknown"] as const;
export const BaseObservationStateSchema = z.enum(BASE_OBSERVATION_STATES);
export type BaseObservationState = z.infer<typeof BaseObservationStateSchema>;

/** Eixo de DECISÃO humana. `pending` é o estado inicial honesto: ninguém decidiu. */
export const BASE_DECISION_STATES = [
  "pending",
  "confirmed_existing",
  "matched_existing_silo",
  "needs_reconciliation",
  "review_later",
  "ignored",
] as const;
export const BaseDecisionStateSchema = z.enum(BASE_DECISION_STATES);
export type BaseDecisionState = z.infer<typeof BaseDecisionStateSchema>;

export const BasePublicationStateSchema = z.enum(["published", "unpublished", "unknown"]);
export type BasePublicationState = z.infer<typeof BasePublicationStateSchema>;

/** `sitemap` é porta de entrada, não origem arquitetural — por isso vive aqui. */
export const BaseIngestionOriginSchema = TerritoryIngestionOriginSchema.or(z.literal("sitemap"));
export type BaseIngestionOrigin = z.infer<typeof BaseIngestionOriginSchema>;

/* -------------------------------- evidência ------------------------------ */

export const EVIDENCE_SOURCES = [
  "sitemap",
  "site_page",
  "publication_record",
  "silo_page",
  "silo_dna",
  "article_dna",
  "csv_import",
  "manual",
] as const;
export const EvidenceSourceSchema = z.enum(EVIDENCE_SOURCES);
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const EvidenceProvenanceSchema = z.object({
  collectedBy: z.enum(["marca_site", "publication", "architect_read_model", "csv", "manual"]),
  collectedAt: z.string().min(1).nullable(),
  sourceRef: z.string().min(1).nullable(),
}).strict();
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

/**
 * Evidência estrutural observada. É INVENTÁRIO, não arquitetura: registra o que
 * foi visto, com que proveniência e onde diverge — nunca o que deve ser feito.
 *
 * Todo campo circunstancial é genuinamente opcional (`| null`). Ausência
 * permanece ausência: uma evidência `site_only` não inventa `publicationRef`, e
 * uma `database_only` não inventa `url`.
 */
export const PublishedStructureEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  brandId: z.string().min(1),
  source: EvidenceSourceSchema,

  url: z.string().min(1).nullable(),
  normalizedUrl: z.string().min(1).nullable(),
  path: z.string().min(1).nullable(),
  slug: z.string().min(1).nullable(),
  canonical: z.string().min(1).nullable(),
  normalizedCanonical: z.string().min(1).nullable(),
  title: z.string().min(1).nullable(),
  observedAt: z.string().min(1).nullable(),

  sitemapRef: z.string().min(1).nullable(),
  publicationRef: z.string().min(1).nullable(),
  articleRef: z.string().min(1).nullable(),
  siloRef: z.string().min(1).nullable(),

  publicationState: BasePublicationStateSchema,
  observationState: BaseObservationStateSchema,
  /** Pista estrutural da URL. Nunca decide nada sozinha. */
  structuralHint: z.enum(["editorial_candidate", "technical", "unknown"]),
  provenance: EvidenceProvenanceSchema,
  notes: z.array(z.string().min(1)),
}).strict().superRefine((evidence, context) => {
  if (evidence.observationState === "site_only" && evidence.publicationRef) {
    context.addIssue({ code: "custom", path: ["publicationRef"], message: "site_only não pode declarar registro editorial interno." });
  }
  if (evidence.observationState === "database_only" && (evidence.url || evidence.sitemapRef)) {
    context.addIssue({ code: "custom", path: ["url"], message: "database_only não pode inventar URL nem referência de sitemap." });
  }
});
export type PublishedStructureEvidence = z.infer<typeof PublishedStructureEvidenceSchema>;

/* ---------------------------- pista de URL ------------------------------- */

/**
 * Segmentos que quase sempre indicam superfície técnica de CMS, não território
 * editorial. A lista é uma PISTA para ordenar revisão humana: não classifica
 * território, não cria Silo e não descarta nada. `/autor/fulano/` recebe
 * `technical`; `/pele/barreira-cutanea/` recebe `editorial_candidate`; e nenhum
 * dos dois vira território sem decisão humana.
 */
const TECHNICAL_PATH_SEGMENTS = new Set([
  "autor", "author", "autores", "tag", "tags", "etiqueta", "page", "pagina", "paginas",
  "feed", "rss", "amp", "search", "busca", "carrinho", "cart", "checkout", "conta",
  "wp-content", "wp-admin", "wp-json", "login", "politica-de-privacidade", "termos",
]);

export function classifyUrlStructuralHint(path: string | null | undefined): PublishedStructureEvidence["structuralHint"] {
  const raw = (path || "").trim();
  if (!raw) return "unknown";
  const segments = raw.split("/").map(segment => segment.trim().toLowerCase()).filter(Boolean);
  if (!segments.length) return "technical";
  if (segments.some(segment => TECHNICAL_PATH_SEGMENTS.has(segment))) return "technical";
  if (segments.every(segment => /^\d+$/.test(segment))) return "technical";
  return "editorial_candidate";
}

/* ------------------------------ entrada da base -------------------------- */

export const TerritorialBaseEntrySchema = z.object({
  entryId: z.string().min(1),
  brandId: z.string().min(1),
  label: z.string().min(1),

  architecturalOrigin: TerritoryArchitecturalOriginSchema,
  ingestionOrigin: BaseIngestionOriginSchema.nullable(),
  publicationState: BasePublicationStateSchema,
  observationState: BaseObservationStateSchema,
  decisionState: BaseDecisionStateSchema,

  existingSiloId: z.string().min(1).nullable(),
  existingSiloPageId: z.string().min(1).nullable(),
  /** Preenchido só depois que um humano promover a entrada a território. */
  territoryRef: TerritoryRefSchema.nullable(),
  evidenceIds: z.array(z.string().min(1)),
  reasons: z.array(z.string().min(1)),
}).strict();
export type TerritorialBaseEntry = z.infer<typeof TerritorialBaseEntrySchema>;

/**
 * Declaração estratégica: território que a Marca quer ter, declarado ANTES das
 * KeywordDNAs. Zero keyword é válido aqui e NÃO significa `confirmed` — continua
 * declaração, sujeita à análise posterior.
 */
export const StrategicDeclarationSchema = z.object({
  declarationId: z.string().min(1),
  brandId: z.string().min(1),
  label: z.string().min(1),
  centralEntity: z.string().min(1),
  macroIntent: z.string().min(1).nullable(),
  rationale: z.string().min(1),
  declaredBy: z.string().min(1),
  declaredAt: z.string().min(1),
  ingestionOrigin: BaseIngestionOriginSchema,
  /** Referências de KeywordDNA já reservadas. Lista vazia é estado legítimo. */
  keywordDnaIds: z.array(z.string().min(1)),
  territoryRef: TerritoryRefSchema.nullable(),
}).strict();
export type StrategicDeclaration = z.infer<typeof StrategicDeclarationSchema>;

export const BASE_ISSUE_CODES = [
  "PUBLISHED_UNRESOLVED",
  "DATABASE_ONLY",
  "CANONICAL_CONFLICT",
  "DUPLICATE_EVIDENCE_URL",
  "CROSS_BRAND_EVIDENCE",
  "LEGACY_NEEDS_RECONCILIATION",
  "EVIDENCE_WITHOUT_SOURCE",
] as const;
export type BaseIssueCode = (typeof BASE_ISSUE_CODES)[number];

export type BaseIssue = { code: BaseIssueCode; entryId?: string; evidenceId?: string; detail?: string };

/**
 * Read-model da Base Territorial. Derivado, somente leitura, sem tabela própria.
 * Os quatro recortes são particionamento: cada entrada cai em exatamente um.
 */
export type TerritorialBase = {
  brandId: string;
  publishedConfirmed: TerritorialBaseEntry[];
  strategicDeclared: TerritorialBaseEntry[];
  importedReconciliation: TerritorialBaseEntry[];
  publishedUnresolved: TerritorialBaseEntry[];
  evidence: PublishedStructureEvidence[];
  issues: BaseIssue[];
};

type BaseBucket = keyof Omit<TerritorialBase, "brandId" | "evidence" | "issues">;

/**
 * Precedência declarada e total — o recorte é DERIVADO dos eixos, nunca lido de
 * um campo único. Ordem: presença sem correspondência interna primeiro, depois
 * decisão humana, depois origem, e por fim o resto vai para reconciliação.
 */
export function resolveBaseBucket(entry: TerritorialBaseEntry): BaseBucket {
  if (entry.observationState === "site_only" && entry.publicationState !== "unpublished") return "publishedUnresolved";
  if (entry.decisionState === "needs_reconciliation" || entry.decisionState === "review_later" || entry.decisionState === "ignored") {
    return "importedReconciliation";
  }
  if (entry.decisionState === "confirmed_existing" || entry.decisionState === "matched_existing_silo") return "publishedConfirmed";
  if (entry.architecturalOrigin === "manual_strategic") return "strategicDeclared";
  return "importedReconciliation";
}

export const emptyTerritorialBase = (brandId: string): TerritorialBase => ({
  brandId,
  publishedConfirmed: [],
  strategicDeclared: [],
  importedReconciliation: [],
  publishedUnresolved: [],
  evidence: [],
  issues: [],
});

/**
 * Monta a Base a partir de entradas e evidências já resolvidas por quem tem
 * acesso às fontes. Função pura: não busca, não persiste, não decide.
 *
 * Uma Brand sem site, sem Silo e sem publicação produz uma Base VÁLIDA e vazia —
 * ausência de estrutura não é erro nem bloqueio.
 */
export function buildTerritorialBase(input: {
  brandId: string;
  entries: readonly TerritorialBaseEntry[];
  evidence: readonly PublishedStructureEvidence[];
}): TerritorialBase {
  const base = emptyTerritorialBase(input.brandId);
  const issues: BaseIssue[] = [];

  const seenUrls = new Map<string, string[]>();
  for (const evidence of input.evidence) {
    if (evidence.brandId !== input.brandId) {
      issues.push({ code: "CROSS_BRAND_EVIDENCE", evidenceId: evidence.evidenceId, detail: evidence.brandId });
      continue;
    }
    base.evidence.push(evidence);
    // Chave de deduplicação por identidade normalizada, nunca por substring.
    const key = (evidence.normalizedCanonical || evidence.normalizedUrl || evidence.path || "").trim().toLowerCase();
    if (key) seenUrls.set(key, [...(seenUrls.get(key) || []), evidence.evidenceId]);
    if (evidence.observationState === "conflicting") {
      issues.push({ code: "CANONICAL_CONFLICT", evidenceId: evidence.evidenceId, detail: evidence.normalizedCanonical || evidence.normalizedUrl || "" });
    }
    if (evidence.observationState === "database_only") {
      issues.push({ code: "DATABASE_ONLY", evidenceId: evidence.evidenceId, detail: evidence.publicationRef || "" });
    }
  }
  for (const [url, evidenceIds] of seenUrls) {
    if (evidenceIds.length > 1) issues.push({ code: "DUPLICATE_EVIDENCE_URL", detail: `${url}: ${evidenceIds.join(", ")}` });
  }

  const evidenceById = new Map(base.evidence.map(item => [item.evidenceId, item]));
  for (const entry of input.entries) {
    if (entry.brandId !== input.brandId) {
      issues.push({ code: "CROSS_BRAND_EVIDENCE", entryId: entry.entryId, detail: entry.brandId });
      continue;
    }
    if (entry.evidenceIds.some(evidenceId => !evidenceById.has(evidenceId))) {
      issues.push({ code: "EVIDENCE_WITHOUT_SOURCE", entryId: entry.entryId });
    }
    const bucket = resolveBaseBucket(entry);
    if (bucket === "publishedUnresolved") issues.push({ code: "PUBLISHED_UNRESOLVED", entryId: entry.entryId });
    if (entry.decisionState === "needs_reconciliation") {
      issues.push({ code: "LEGACY_NEEDS_RECONCILIATION", entryId: entry.entryId });
    }
    base[bucket].push(entry);
  }

  base.issues = issues;
  return base;
}

/** Projeta uma declaração estratégica como entrada da Base, sem decidir nada. */
export function strategicDeclarationAsBaseEntry(declaration: StrategicDeclaration): TerritorialBaseEntry {
  return TerritorialBaseEntrySchema.parse({
    entryId: declaration.declarationId,
    brandId: declaration.brandId,
    label: declaration.label,
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: declaration.ingestionOrigin,
    publicationState: "unpublished",
    observationState: "unknown",
    decisionState: "pending",
    existingSiloId: null,
    existingSiloPageId: null,
    territoryRef: declaration.territoryRef,
    evidenceIds: [],
    reasons: [declaration.rationale],
  });
}

/* ------------------- promoção a território é ato humano ------------------ */

export const PROMOTION_REFUSAL_CODES = [
  "PROMOTION_REQUIRES_HUMAN_DECISION",
  "PROMOTION_OF_IGNORED_ENTRY",
  "PROMOTION_ALREADY_DONE",
  "PROMOTION_CROSS_BRAND",
] as const;
export type PromotionRefusalCode = (typeof PROMOTION_REFUSAL_CODES)[number];

export type TerritoryPromotionDecision = {
  actorUserId: string;
  decidedAt: string;
  /** Confirmação explícita; ausência é recusa, nunca consentimento presumido. */
  confirmed: boolean;
  reason: string;
};

export type TerritoryPromotionResult =
  | { ok: true; entryId: string; architecturalOrigin: TerritorialBaseEntry["architecturalOrigin"]; existingSiloId: string | null; reason: string }
  | { ok: false; refusals: Array<{ code: PromotionRefusalCode; detail: string }> };

/**
 * Nenhuma URL, entrada de sitemap, categoria ou diretório vira território por
 * inferência. A promoção exige decisão humana declarada — sem ela, esta função
 * recusa em vez de escolher.
 */
export function planTerritoryPromotion(input: {
  brandId: string;
  entry: TerritorialBaseEntry;
  decision: TerritoryPromotionDecision | null;
}): TerritoryPromotionResult {
  const refusals: Array<{ code: PromotionRefusalCode; detail: string }> = [];
  if (input.entry.brandId !== input.brandId) {
    refusals.push({ code: "PROMOTION_CROSS_BRAND", detail: input.entry.brandId });
  }
  if (!input.decision?.confirmed || !input.decision.actorUserId.trim()) {
    refusals.push({ code: "PROMOTION_REQUIRES_HUMAN_DECISION", detail: input.entry.entryId });
  }
  if (input.entry.decisionState === "ignored") {
    refusals.push({ code: "PROMOTION_OF_IGNORED_ENTRY", detail: input.entry.entryId });
  }
  if (input.entry.territoryRef) {
    refusals.push({ code: "PROMOTION_ALREADY_DONE", detail: input.entry.territoryRef });
  }
  if (refusals.length) return { ok: false, refusals };

  return {
    ok: true,
    entryId: input.entry.entryId,
    architecturalOrigin: input.entry.architecturalOrigin,
    existingSiloId: input.entry.existingSiloId,
    reason: input.decision!.reason,
  };
}

/* --------------------------- afinidade territorial ----------------------- */

export const TERRITORIAL_AFFINITIES = [
  "match_existing",
  "expand_existing",
  "match_strategic",
  "ambiguous",
  "conflicting",
  "no_match",
] as const;
export const TerritorialAffinitySchema = z.enum(TERRITORIAL_AFFINITIES);
export type TerritorialAffinity = z.infer<typeof TerritorialAffinitySchema>;

/**
 * Contrato do resultado da Etapa 2. O MOTOR de classificação não pertence a esta
 * fase — aqui existe apenas a forma do resultado e a regra do resíduo.
 */
export const KeywordTerritorialAffinitySchema = z.object({
  keywordId: z.string().min(1),
  brandId: z.string().min(1),
  affinity: TerritorialAffinitySchema,
  territoryRef: TerritoryRefSchema.nullable(),
  existingSiloId: z.string().min(1).nullable(),
  reason: z.string().min(1),
  source: z.enum(["logic", "serp", "ai", "human"]),
}).strict();
export type KeywordTerritorialAffinity = z.infer<typeof KeywordTerritorialAffinitySchema>;

/**
 * Território novo é EXCEÇÃO que exige justificativa, não resultado de
 * clustering global. Só o resíduo — o que não casou, o que ficou ambíguo e o
 * que conflitou — alimenta a busca por território novo.
 */
export type TerritorialResidue = {
  residualKeywordIds: string[];
  byAffinity: Record<"no_match" | "ambiguous" | "conflicting", string[]>;
  absorbedKeywordIds: string[];
  newTerritoryJustificationRequired: boolean;
};

export function resolveTerritorialResidue(
  affinities: readonly KeywordTerritorialAffinity[],
): TerritorialResidue {
  const byAffinity = { no_match: [] as string[], ambiguous: [] as string[], conflicting: [] as string[] };
  const absorbedKeywordIds: string[] = [];
  for (const item of affinities) {
    if (item.affinity === "no_match" || item.affinity === "ambiguous" || item.affinity === "conflicting") {
      byAffinity[item.affinity].push(item.keywordId);
      continue;
    }
    absorbedKeywordIds.push(item.keywordId);
  }
  const residualKeywordIds = [...new Set([...byAffinity.no_match, ...byAffinity.ambiguous, ...byAffinity.conflicting])].sort();
  return {
    residualKeywordIds,
    byAffinity: {
      no_match: [...byAffinity.no_match].sort(),
      ambiguous: [...byAffinity.ambiguous].sort(),
      conflicting: [...byAffinity.conflicting].sort(),
    },
    absorbedKeywordIds: [...new Set(absorbedKeywordIds)].sort(),
    newTerritoryJustificationRequired: residualKeywordIds.length > 0,
  };
}

/* ----------------------- ordem operacional dos processos ----------------- */

/**
 * Ordem OPERACIONAL do nível territorial. Não é cadeia de sobrescrita: cada
 * cenário permanece independente e imutável. IA não muta o cenário da Lógica,
 * SERP não muta o da IA e o Humano não reescreve evidência histórica.
 */
export const TERRITORY_PROCESS_ORDER = ["logic", "ai", "serp", "human"] as const;
export type TerritoryProcess = (typeof TERRITORY_PROCESS_ORDER)[number];

export function nextTerritoryProcess(current: TerritoryProcess): TerritoryProcess | null {
  const index = TERRITORY_PROCESS_ORDER.indexOf(current);
  return index >= 0 && index < TERRITORY_PROCESS_ORDER.length - 1 ? TERRITORY_PROCESS_ORDER[index + 1] : null;
}

/** Um processo nunca escreve no cenário de outro. */
export function processMayMutateScenario(process: TerritoryProcess, scenarioProducedBy: TerritoryProcess): boolean {
  return process === scenarioProducedBy;
}
