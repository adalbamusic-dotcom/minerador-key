import type { ArticleKeywordReference, ArchitectKeyword, KeywordDnaProvenanceSnapshot, NormalizedSearchIntent, ArticleIntentProfile, IntentCompatibility } from "./contracts.ts";
import { ArticleIntentProfileSchema } from "./contracts.ts";

const labelKey = (value: unknown) => typeof value === "string"
  ? value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_")
  : "";

/** Normaliza somente a intenção de busca; CTA, hierarquia e formato não entram nesta decisão. */
export function normalizeSearchIntent(value: unknown): NormalizedSearchIntent {
  const key = labelKey(value);
  if (["informativo", "informacional", "informational", "informative", "info"].includes(key)) return "informational";
  if (["comercial", "investigacao_comercial", "investigacao_de_compra", "commercial_investigation", "commercial", "comparacao", "comparativo"].includes(key)) return "commercial_investigation";
  if (["transacional", "transactional", "compra", "comprar", "venda"].includes(key)) return "transactional";
  if (["navegacional", "navegacional", "navigational", "navegacao", "marca"].includes(key)) return "navigational";
  if (["local", "localizada", "local_search"].includes(key)) return "local";
  if (["misto", "mista", "mixed"].includes(key)) return "mixed";
  return "unknown";
}

export function intentCompatibility(primary: NormalizedSearchIntent, secondary: NormalizedSearchIntent, role: ArticleKeywordReference["role"]): IntentCompatibility {
  if (primary === "unknown" || secondary === "unknown") return "unknown";
  if (primary === secondary) return "aligned";
  if (primary === "informational" && secondary === "commercial_investigation") return "adjacent";
  if (primary === "commercial_investigation" && secondary === "informational") return role === "secundaria" || role === "reforco_narrativo" ? "supporting" : "adjacent";
  if (primary === "informational" && secondary === "transactional") return "outlier";
  if (primary === "transactional" && secondary === "informational") return "supporting";
  return role === "secundaria" || role === "reforco_narrativo" ? "adjacent" : "outlier";
}

function sourceIntent(keyword: ArchitectKeyword, snapshot?: KeywordDnaProvenanceSnapshot) {
  return normalizeSearchIntent(keyword.intent || (keyword.analise_semantica as Record<string, unknown> | null | undefined)?.intencao_principal || snapshot?.payload.searchIntent);
}

export function buildArticleIntentProfile(input: {
  principal: ArchitectKeyword;
  principalReference: ArticleKeywordReference;
  references: ArticleKeywordReference[];
}): ArticleIntentProfile {
  const principalSnapshot = input.principalReference.keywordDnaSnapshot;
  const semantic = input.principal.analise_semantica as Record<string, unknown> | null | undefined;
  const originalLabel = input.principal.intent || semantic?.intencao_principal;
  const primaryIntent = sourceIntent(input.principal, principalSnapshot);
  const architectureConfirmed = input.principal.keywordUrlRelation === "confirmed_primary"
    && input.principal.architectureStatus === "architecture_confirmed";
  const humanConfirmed = Boolean(principalSnapshot?.payload.humanConfirmed || input.principal.analise_semantica && (input.principal.analise_semantica as Record<string, unknown>).dna_revisao_humana === "aprovado");
  const confirmation = humanConfirmed ? "human_confirmed" : architectureConfirmed ? "inherited_from_confirmed_primary" : primaryIntent === "unknown" ? "unknown" : "inherited_from_candidate";
  const status = primaryIntent === "unknown" ? "unknown" : architectureConfirmed || humanConfirmed ? "confirmed" : "candidate";
  return ArticleIntentProfileSchema.parse({
    primaryIntent,
    originalLabel: typeof originalLabel === "string" && originalLabel.trim() ? originalLabel.trim() : undefined,
    sourceKeywordId: input.principal.id,
    sourceKeywordDnaId: principalSnapshot?.keywordId || input.principal.id,
    sourceKeywordDnaVersionId: principalSnapshot?.versionReference.versionId || input.principalReference.keywordDnaVersionId,
    confirmation,
    status,
    articlePurpose: primaryIntent,
    conversionLayer: {
      hasCommercialCta: ["commercial_investigation", "transactional", "local"].includes(primaryIntent),
      ctaPurpose: ["commercial_investigation", "transactional", "local"].includes(primaryIntent) ? "Orientar a próxima decisão compatível com a intenção principal." : undefined,
    },
    secondaryIntentSignals: input.references.filter(reference => reference.keywordId !== input.principal.id).map(reference => {
      const snapshot = reference.keywordDnaSnapshot;
      const intent = normalizeSearchIntent(snapshot?.payload.searchIntent || reference.coveredIntentions[0]);
      return { keywordId: reference.keywordId, keywordDnaId: snapshot?.keywordId || reference.keywordId, intent, compatibility: intentCompatibility(primaryIntent, intent, reference.role) };
    }),
  });
}

export function explicitEditorialFormat(keyword: ArchitectKeyword): string | undefined {
  const semantic = keyword.analise_semantica as Record<string, unknown> | null | undefined;
  const value = semantic?.formato_esperado || semantic?.tipo_editorial;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = labelKey(value);
  if (["pilar", "suporte", "reforco_narrativo", "reforco_narrativo"].includes(normalized)) return undefined;
  return value.trim();
}
