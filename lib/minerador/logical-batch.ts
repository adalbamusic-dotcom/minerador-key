import { autoDetectNiche, deriveLogicalKeywordDna, mergeLogicalKeywordSemantic } from "../arquiteto/keyword-dna-engine.ts";
import { canonicalIntentLabel, normalizeIntentKey } from "./intent-taxonomy.ts";
import { applyFunnelQualification, classifyKeywordFunnel } from "./keyword-qualification.ts";
import {
  buildLogicalOutputContract,
  buildLogicalProcessorMetadata,
  hasCompleteLogicalOutputContract,
  hasCurrentLogicalProcessorMetadata,
  logicalSemanticRecordsEqual,
  validateLogicalKeywordOutput,
} from "./logical-processor.ts";

export type LogicalBatchKeyword = {
  id: string;
  keyword: string;
  location?: string | null;
  intent?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

export type LogicalBatchList = { id: string; nicho?: string | null };

export type LogicalBatchUpdate = {
  id: string;
  intent: string;
  analise_semantica: Record<string, unknown>;
};

const humanSemanticMarker = (value: unknown) => ["aprovado", "aprovada", "confirmado", "confirmada", "confirmed", "human", "humano", "manual", "humana"]
  .includes(String(value || "").trim().toLocaleLowerCase("pt-BR"));

function logicalNiche(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLocaleLowerCase("pt-BR") !== "geral" ? trimmed : null;
}

function humanNicheProtected(semantic: Record<string, unknown> | null | undefined) {
  return humanSemanticMarker(semantic?.nicho_origem)
    || humanSemanticMarker(semantic?.dna_origem)
    || humanSemanticMarker(semantic?.dna_revisao_humana)
    || typeof semantic?.nicho_humano === "string";
}

function humanFunnelProtected(semantic: Record<string, unknown> | null | undefined) {
  return semantic?.funnel_human_confirmed === true
    || semantic?.funnel_human_confirmed === "true"
    || humanSemanticMarker(semantic?.funnel_source)
    || humanSemanticMarker(semantic?.funnel_decision_origin);
}

/** Mesma derivação determinística usada pelo botão Lógica do Minerador. */
export function deriveLogicalKeywordBatchItem(
  item: LogicalBatchKeyword,
  list: LogicalBatchList | null,
  processedAt: string,
): { update: LogicalBatchUpdate; changed: boolean; needsWrite: boolean; niche: string | null } {
  const semanticBefore = item.analise_semantica || {};
  const intentOrigin = String(semanticBefore.intencao_origem || semanticBefore.intent_source || "").toLowerCase();
  const semanticDnaOrigin = String(semanticBefore.dna_origem || "").toLowerCase();
  const humanIntentProtected = ["human", "humano", "manual", "humana"].includes(intentOrigin)
    || ["human", "humano", "manual", "humana"].includes(semanticDnaOrigin)
    || ["aprovado", "confirmado", "confirmed"].includes(String(semanticBefore.dna_revisao_humana || "").toLowerCase());
  const nicheProtected = humanNicheProtected(semanticBefore);
  const niche = (nicheProtected ? logicalNiche(typeof semanticBefore.nicho_override === "string" ? semanticBefore.nicho_override : null) : null)
    || logicalNiche(list?.nicho)
    || logicalNiche(autoDetectNiche(item.keyword));
  const existingIntent = item.intent || (typeof semanticBefore.intencao_principal === "string" ? semanticBefore.intencao_principal : null);
  const logical = deriveLogicalKeywordDna({
    keywordId: item.id,
    keyword: item.keyword,
    intent: humanIntentProtected ? existingIntent : null,
    niche,
    location: item.location,
    existingSemantic: semanticBefore,
  });
  const logicalSemantic = mergeLogicalKeywordSemantic(semanticBefore, logical.semantic, { forceLogical: true });
  if (niche) {
    logicalSemantic.nicho_override = niche;
    logicalSemantic.nicho = niche;
    if (!nicheProtected) logicalSemantic.nicho_origem = "logico_deterministico";
  } else if (!nicheProtected) {
    delete logicalSemantic.nicho_override;
    delete logicalSemantic.nicho;
    delete logicalSemantic.nicho_origem;
  }

  const storedIntent = humanIntentProtected && item.intent && normalizeIntentKey(item.intent) !== "unknown" ? item.intent : null;
  const semanticIntent = typeof logicalSemantic.intencao_principal === "string" && normalizeIntentKey(logicalSemantic.intencao_principal) !== "unknown"
    ? logicalSemantic.intencao_principal
    : null;
  const intent = storedIntent || semanticIntent || logical.intentLabel || canonicalIntentLabel(logical.dna.searchIntent);
  const funnelProtected = humanFunnelProtected(semanticBefore);
  if (!funnelProtected) {
    delete logicalSemantic.funnel;
    delete logicalSemantic.funnel_source;
    delete logicalSemantic.funnel_confidence;
    delete logicalSemantic.funnel_review_required;
    delete logicalSemantic.funnel_evidence;
  }
  const qualification = classifyKeywordFunnel({ keyword: item.keyword, intent, niche, location: item.location, semantic: logicalSemantic });
  const semantic = applyFunnelQualification(logicalSemantic, qualification);
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent, niche, funnel: semantic.funnel });
  const logicalOutput = validateLogicalKeywordOutput({ semantic, intent });
  if (!logicalOutput.valid || !hasCompleteLogicalOutputContract({ semantic, intent })) {
    throw new Error(`A leitura lógica não completou o contrato de saída: ${logicalOutput.missingFields.join(", ")}.`);
  }
  Object.assign(semantic, buildLogicalProcessorMetadata({ keywordId: item.id, keyword: item.keyword, location: item.location, niche }, processedAt));
  const changed = !logicalSemanticRecordsEqual(semanticBefore, semantic) || item.intent !== intent;
  const metadataCurrent = hasCurrentLogicalProcessorMetadata({ keywordId: item.id, keyword: item.keyword, location: item.location, niche, semantic });
  return { update: { id: item.id, intent, analise_semantica: semantic }, changed, needsWrite: changed || !metadataCurrent, niche };
}
