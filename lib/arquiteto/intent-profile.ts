import type { ArticleKeywordReference, ArchitectKeyword, KeywordDnaProvenanceSnapshot, NormalizedSearchIntent, ArticleIntentProfile, IntentCompatibility } from "./contracts.ts";
import { ArticleIntentProfileSchema } from "./contracts.ts";
import { normalizeIntentKey } from "../minerador/intent-taxonomy.ts";

const labelKey = (value: unknown) => typeof value === "string"
  ? value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_")
  : "";

/**
 * Normaliza somente a intenção de busca; CTA, hierarquia e formato não entram nesta decisão.
 *
 * UMA TAXONOMIA SÓ: a do Minerador (`normalizeIntentKey`). A lista própria
 * daqui não conhecia "Informativa" — o rótulo canônico que o Minerador grava
 * — nem "Comercial investigativa" e "Vendas": o ArticleDNA nascia com
 * intenção "unknown" em quase todo artigo informativo (achado em 2026-09-30).
 */
export function normalizeSearchIntent(value: unknown): NormalizedSearchIntent {
  return normalizeIntentKey(value);
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

/**
 * O PRIMEIRO RÓTULO QUE É INTENÇÃO DE VERDADE.
 *
 * A coluna `intent` do Minerador vem "Pendente" enquanto a revisão não roda;
 * "Pendente" é texto não vazio, então o `||` parava nele e o ArticleDNA
 * nascia com intenção "unknown" mesmo quando a análise semântica ou o
 * KeywordDNA aprovado já diziam "Informativa". Rótulo que não normaliza para
 * uma intenção conhecida é ausência, não resposta.
 */
export function firstKnownIntentLabel(...labels: unknown[]): string | undefined {
  for (const label of labels) {
    if (typeof label === "string" && label.trim() && normalizeSearchIntent(label) !== "unknown") return label.trim();
  }
  return undefined;
}

/** Os rótulos de intenção de uma keyword, na ordem de autoridade: KeywordDNA aprovado, análise, coluna. */
export function keywordIntentLabels(keyword: Pick<ArchitectKeyword, "intent" | "analise_semantica">, snapshot?: KeywordDnaProvenanceSnapshot): unknown[] {
  const workflow = (keyword as { canonicalWorkflow?: { payload?: Record<string, unknown> } }).canonicalWorkflow?.payload;
  const qualification = workflow?.semanticQualification as Record<string, unknown> | undefined;
  const approved = (workflow?.approvedDna as Record<string, unknown> | undefined)?.analiseSemantica as Record<string, unknown> | undefined;
  return [
    qualification?.intent,
    approved?.intencao_principal,
    keyword.intent,
    (keyword.analise_semantica as Record<string, unknown> | null | undefined)?.intencao_principal,
    // O retrato "legacy:" é montado da própria linha e cai em "informational"
    // quando não há intenção: ler dele seria inventar a resposta.
    snapshot && !snapshot.versionReference.versionId.startsWith("legacy:") ? snapshot.payload.searchIntent : undefined,
  ];
}

function sourceIntent(keyword: ArchitectKeyword, snapshot?: KeywordDnaProvenanceSnapshot) {
  return normalizeSearchIntent(firstKnownIntentLabel(...keywordIntentLabels(keyword, snapshot)));
}

export function buildArticleIntentProfile(input: {
  principal: ArchitectKeyword;
  principalReference: ArticleKeywordReference;
  references: ArticleKeywordReference[];
}): ArticleIntentProfile {
  const principalSnapshot = input.principalReference.keywordDnaSnapshot;
  const semantic = input.principal.analise_semantica as Record<string, unknown> | null | undefined;
  const originalLabel = firstKnownIntentLabel(...keywordIntentLabels(input.principal, principalSnapshot)) ?? (input.principal.intent || semantic?.intencao_principal);
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
