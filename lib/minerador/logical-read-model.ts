import { canonicalIntentLabel, externalIntentLabel, normalizeIntentKey } from "./intent-taxonomy.ts";
import { readLogicalOutputContract, type LogicalOutputFieldState } from "./logical-processor.ts";

export type LogicalReadItem = {
  intent?: string | null;
  nicho?: string | null;
  niche?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

export type CanonicalFieldResolution = "resolved" | "confirmed_unknown" | "unresolved";

export type CanonicalKeywordReadModel = {
  intent: string | null;
  intentLabel: string;
  intentState: CanonicalFieldResolution;
  niche: string | null;
  nicheLabel: string;
  nicheState: CanonicalFieldResolution;
  funnel: string | null;
  funnelLabel: string;
  funnelState: CanonicalFieldResolution;
  externalIntent: string | null;
  externalIntentLabel: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function unresolvedLabel(state: LogicalOutputFieldState | null | undefined, fallback: string, field?: "funnel"): string {
  if (state === "ambiguous") return "Ambíguo";
  if (state === "pending") return "Pendente";
  if (state === "explicit_unknown") return field === "funnel" ? "Indefinido" : "Indeterminado";
  return fallback;
}

function meaningful(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedField(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[._-]+/g, " ").replace(/\s+/g, " ")
    : "";
}

function canonicalHumanField(value: unknown): string | null {
  const key = normalizedField(value);
  if (["intent", "intencao", "intencao logica", "intencao principal"].includes(key)) return "intent";
  if (["niche", "nicho"].includes(key)) return "niche";
  if (["funnel", "funil"].includes(key)) return "funnel";
  return null;
}

function readHumanReviewRecord(semantic: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(semantic.human_review);
}

export function hasHumanFieldDecision(semantic: Record<string, unknown> | null | undefined, field: string): boolean {
  const source = semantic || {};
  const record = readHumanReviewRecord(source);
  const overrides = asRecord(record?.overrides);
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, field)) return true;
  const decisions = Array.isArray(record?.fieldDecisions) ? record.fieldDecisions : [];
  return decisions.some(value => {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return canonicalHumanField(item.canonicalField || item.field) === field;
  });
}

function readHumanSelectedValue(semantic: Record<string, unknown>, field: string): unknown {
  const record = readHumanReviewRecord(semantic);
  const overrides = asRecord(record?.overrides);
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, field) && meaningful(overrides[field])) return overrides[field];
  const decisions = Array.isArray(record?.fieldDecisions) ? record.fieldDecisions : [];
  const decision = decisions
    .filter(value => value && typeof value === "object")
    .map(value => value as Record<string, unknown>)
    .reverse()
    .find(value => canonicalHumanField(value.canonicalField || value.field) === field);
  return meaningful(decision?.selectedValue) ? decision?.selectedValue : null;
}

function humanIntentValue(semantic: Record<string, unknown>): string | null {
  const selected = readHumanSelectedValue(semantic, "intent");
  if (meaningful(selected) && normalizeIntentKey(selected) !== "unknown") return selected.trim();
  for (const value of [semantic.intencao_revisada, semantic.intencao_humana]) {
    if (meaningful(value) && normalizeIntentKey(value) !== "unknown") return value.trim();
  }
  return null;
}

function humanNicheValue(semantic: Record<string, unknown>): string | null {
  const selected = readHumanSelectedValue(semantic, "niche");
  if (meaningful(selected)) return selected.trim();
  for (const value of [semantic.nicho_humano, semantic.nicho_revisado, semantic.nicho_canonico, semantic.niche]) {
    if (meaningful(value)) return value.trim();
  }
  return null;
}

function funnelValue(value: unknown): string | null {
  if (!meaningful(value)) return null;
  const normalized = value.trim().toUpperCase();
  return ["TOFU", "MOFU", "BOFU"].includes(normalized) ? normalized : null;
}

function humanFunnelValue(semantic: Record<string, unknown>): string | null {
  const selected = funnelValue(readHumanSelectedValue(semantic, "funnel"));
  if (selected) return selected;
  for (const value of [semantic.funnel_humano, semantic.funnel_revisado, semantic.funnel_canonico, semantic.funnel_human]) {
    const normalized = funnelValue(value);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * The table, profile, decision card and filters all consume this projection.
 * Provider intent is deliberately excluded from the canonical intent path.
 */
export function readCanonicalKeywordDna(
  item: LogicalReadItem,
  options: { includeHumanDecisions?: boolean } = {},
): CanonicalKeywordReadModel {
  const semantic = item.analise_semantica || {};
  const includeHumanDecisions = options.includeHumanDecisions !== false;
  const logicalContract = readLogicalOutputContract(semantic);
  const contractIntent = logicalContract?.fields.intent;
  const contractNiche = logicalContract?.fields.niche;
  const contractFunnel = logicalContract?.fields.funnel;
  const logicalIntent = contractIntent
    ? contractIntent.state === "value" ? contractIntent.value : null
    : meaningful(semantic.intencao_principal) && normalizeIntentKey(semantic.intencao_principal) !== "unknown"
    ? semantic.intencao_principal.trim()
    : meaningful(item.intent) && normalizeIntentKey(item.intent) !== "unknown"
      ? item.intent.trim()
      : null;
  const intentHasHumanDecision = includeHumanDecisions && hasHumanFieldDecision(semantic, "intent");
  const intent = intentHasHumanDecision
    ? humanIntentValue(semantic)
    : includeHumanDecisions
      ? humanIntentValue(semantic) || logicalIntent
      : logicalIntent;
  const intentState: CanonicalFieldResolution = intent
    ? "resolved"
    : intentHasHumanDecision
      ? "confirmed_unknown"
      : "unresolved";
  const logicalNiche = contractNiche
    ? contractNiche.state === "value" ? contractNiche.value : null
    : [semantic.nicho_override, semantic.nicho, item.nicho, item.niche]
      .find(value => meaningful(value) && value.trim().toLocaleLowerCase("pt-BR") !== "geral");
  const nicheHasHumanDecision = includeHumanDecisions && hasHumanFieldDecision(semantic, "niche");
  const niche = nicheHasHumanDecision
    ? humanNicheValue(semantic)
    : includeHumanDecisions
      ? humanNicheValue(semantic) || (meaningful(logicalNiche) ? logicalNiche.trim() : null)
      : meaningful(logicalNiche)
        ? logicalNiche.trim()
        : null;
  const nicheState: CanonicalFieldResolution = niche
    ? "resolved"
    : nicheHasHumanDecision
      ? "confirmed_unknown"
      : "unresolved";
  const funnelHasHumanDecision = includeHumanDecisions && hasHumanFieldDecision(semantic, "funnel");
  const funnel = funnelHasHumanDecision
    ? humanFunnelValue(semantic)
    : includeHumanDecisions
      ? humanFunnelValue(semantic) || (contractFunnel
        ? contractFunnel.state === "value" ? contractFunnel.value : null
        : funnelValue(semantic.funnel))
      : contractFunnel
        ? contractFunnel.state === "value" ? contractFunnel.value : null
        : funnelValue(semantic.funnel);
  const funnelExplicitUnknown = !funnel
    && !funnelHasHumanDecision
    && contractFunnel?.state === "explicit_unknown";
  const canonicalFunnel = funnelExplicitUnknown ? "Não classificável" : funnel;
  const funnelState: CanonicalFieldResolution = canonicalFunnel
    ? "resolved"
    : funnelHasHumanDecision
      ? "confirmed_unknown"
      : "unresolved";
  const rawExternalIntent = [
    semantic.dataforseo_keyword_overview,
    semantic.dataforseo_keyword_overview_measurement,
    semantic.keyword_overview_measurement,
  ]
    .map(asRecord)
    .find(Boolean);
  const externalIntent = rawExternalIntent
    ? [rawExternalIntent.externalIntent, rawExternalIntent.external_intent, rawExternalIntent.mainIntent, rawExternalIntent.main_intent]
      .find(meaningful) || null
    : null;

  return {
    intent,
    intentLabel: intentState === "confirmed_unknown"
      ? "Indeterminado"
      : intent
        ? canonicalIntentLabel(intent)
        : unresolvedLabel(contractIntent?.state, canonicalIntentLabel(intent)),
    intentState,
    niche,
    nicheLabel: nicheState === "confirmed_unknown"
      ? "Indeterminado"
      : niche || unresolvedLabel(contractNiche?.state, "Não informado"),
    nicheState,
    funnel: canonicalFunnel,
    funnelLabel: funnelState === "confirmed_unknown"
      ? "Indeterminado"
      : funnelExplicitUnknown
        ? "Indefinido"
      : canonicalFunnel || unresolvedLabel(contractFunnel?.state, "—", "funnel"),
    funnelState,
    externalIntent,
    externalIntentLabel: externalIntentLabel(externalIntent),
  };
}

export function readLogicalIntent(item: LogicalReadItem): string | null {
  return readCanonicalKeywordDna(item).intent;
}

export function readLogicalIntentLabel(item: LogicalReadItem): string {
  return readCanonicalKeywordDna(item).intentLabel;
}

export function readLogicalNiche(item: LogicalReadItem): string | null {
  return readCanonicalKeywordDna(item).niche;
}

export function readLogicalFunnel(item: LogicalReadItem): string | null {
  return readCanonicalKeywordDna(item).funnel;
}

export function readExternalIntent(item: LogicalReadItem): string | null {
  return readCanonicalKeywordDna(item).externalIntent;
}

export function readExternalIntentLabel(item: LogicalReadItem): string | null {
  return readCanonicalKeywordDna(item).externalIntentLabel;
}

/** Backwards-compatible name for consumers that already called this projection. */
export function logicalReadModel(item: LogicalReadItem): CanonicalKeywordReadModel {
  return readCanonicalKeywordDna(item);
}
