import { z } from "zod";
import { legacyVersionReference } from "../arquiteto/versioning.ts";
import type { VersionReference } from "../arquiteto/contracts.ts";
import { readCanonicalKeywordDna, type CanonicalFieldResolution } from "./logical-read-model.ts";
import type { BrandAIContext } from "../marca/brand-ai-context.ts";
import { readLogicalOutputContract } from "./logical-processor.ts";

/** Autoridades que a IA não possui; se voltarem na resposta, são descartadas. */
export const FORBIDDEN_BRIEF_AUTHORITY_KEYS = [
  "intent", "intencao", "intencao_principal", "searchIntent", "search_intent",
  "funnel", "funil", "funnelStage", "etapa_funil",
  "serp", "serpStrength", "serpEvidence", "forcaSerp",
  "kgr", "approval", "status", "silo", "slug", "canonical",
] as const;

/**
 * Reporta qual autoridade proibida o provider tentou devolver. O parse do
 * contrato já descarta o campo; esta função existe para auditoria.
 */
export function forbiddenBriefAuthorityFields(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const keys = new Set(Object.keys(raw as Record<string, unknown>).map(key => key.trim()));
  return FORBIDDEN_BRIEF_AUTHORITY_KEYS.filter(key => keys.has(key));
}

/** Parse estrito: campos fora do contrato não entram no Brief. */


export type KeywordDnaPresentationInput = {
  id: string;
  brand_id: string;
  keyword: string;
  location?: string | null;
  intent?: string | null;
  volume_search?: unknown;
  results_allintitle?: unknown;
  kgr_score?: unknown;
  analise_semantica?: Record<string, unknown> | null;
};

type KeywordDnaPresentationCanonical = {
  intent: string | null;
  intentLabel: string;
  intentState: CanonicalFieldResolution;
  funnel: string | null;
  funnelLabel: string;
  funnelState: CanonicalFieldResolution;
  niche: string | null;
  nicheLabel: string;
  nicheState: CanonicalFieldResolution;
  centralEntity: string | null;
  modifiers: string[];
  audience: string | null;
  perceivedProblem: string | null;
  desiredResult: string | null;
  awareness: string | null;
  journey: string | null;
  likelyEditorialType: string | null;
  objections: string[];
  volumeSearch: number | null;
  resultCount: number | null;
  kgrScore: number | null;
};

export type KeywordDnaPresentationContext = {
  brandId: string;
  keywordId: string;
  keyword: string;
  location: string | null;
  inputKeywordDnaRef: VersionReference;
  canonical: KeywordDnaPresentationCanonical;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter((item): item is string => Boolean(item));
  const item = textValue(value);
  return item ? [item] : [];
}

function contractText(semantic: Record<string, unknown>, field: "centralEntity" | "audience" | "perceivedProblem" | "desiredResult" | "awareness" | "journey" | "editorialType" | "objection"): string | null {
  const contract = readLogicalOutputContract(semantic);
  const candidate = contract?.fields[field];
  return candidate?.state === "value" ? textValue(candidate.value) : null;
}

function readTextField(
  semantic: Record<string, unknown>,
  field: Parameters<typeof contractText>[1],
  aliases: string[],
): string | null {
  return contractText(semantic, field) || aliases.map(alias => textValue(semantic[alias])).find(Boolean) || null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

/**
 * Builds a read-only, compact projection of the current KeywordDNA. The
 * legacy row is used only as the current source because it is the persistence
 * boundary in this checkout; this function does not promote or mutate it.
 */
export function buildKeywordDnaPresentationContext(input: KeywordDnaPresentationInput): KeywordDnaPresentationContext {
  if (!input.id.trim() || !input.brand_id.trim() || !input.keyword.trim()) {
    throw new Error("KeywordDNA incompleto para apresentação contextual.");
  }
  const semantic = input.analise_semantica || {};
  const canonical = readCanonicalKeywordDna(input);
  const inputPayload = {
    keywordId: input.id,
    brandId: input.brand_id,
    keyword: input.keyword,
    location: input.location || null,
    intent: input.intent || null,
    volume_search: input.volume_search ?? null,
    results_allintitle: input.results_allintitle ?? null,
    kgr_score: input.kgr_score ?? null,
    analise_semantica: semantic,
  };
  return {
    brandId: input.brand_id,
    keywordId: input.id,
    keyword: input.keyword.trim(),
    location: textValue(input.location),
    inputKeywordDnaRef: legacyVersionReference(input.id, inputPayload),
    canonical: {
      intent: canonical.intent,
      intentLabel: canonical.intentLabel,
      intentState: canonical.intentState,
      funnel: canonical.funnel,
      funnelLabel: canonical.funnelLabel,
      funnelState: canonical.funnelState,
      niche: canonical.niche,
      nicheLabel: canonical.nicheLabel,
      nicheState: canonical.nicheState,
      centralEntity: readTextField(semantic, "centralEntity", ["entidade_central"]),
      modifiers: stringList(semantic.modificadores),
      audience: readTextField(semantic, "audience", ["publico", "perfil_b2b"]),
      perceivedProblem: readTextField(semantic, "perceivedProblem", ["problema_percebido"]),
      desiredResult: readTextField(semantic, "desiredResult", ["resultado_desejado"]),
      awareness: readTextField(semantic, "awareness", ["nivel_consciencia"]),
      journey: readTextField(semantic, "journey", ["etapa_jornada"]),
      likelyEditorialType: readTextField(semantic, "editorialType", ["tipo_editorial", "formato_esperado"]),
      objections: uniqueStrings([
        ...stringList(semantic.objecoes),
        ...stringList(semantic.objecao_implicita),
      ]),
      volumeSearch: numberValue(input.volume_search),
      resultCount: numberValue(input.results_allintitle),
      kgrScore: numberValue(input.kgr_score),
    },
  };
}

function presentationFact(value: string | number | string[] | null): string {
  if (Array.isArray(value)) return value.length ? value.join(" · ") : "não informado";
  return value === null ? "não informado" : String(value);
}

// A leitura canônica de Intenção/Funil/Nicho permanece disponível no contexto do
// KeywordDNA, mas não é enviada à Apresentação Contextual: esta camada trata de
// como a Marca apresenta o tema, não de classificação de busca.
void ((value: string | null, state: CanonicalFieldResolution) => presentationFact(value) + state);

export const CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT = [
  "Você produz uma Apresentação Contextual curta para um tema de uma Marca.",
  "A saída é uma orientação editorial de apoio, não um novo KeywordDNA.",
  "Use somente fatos presentes no contexto recebido.",
  "Esta camada não trata de SEO: não classifique intenção de busca, funil, nicho ou SERP e não comente volume,",
  "concorrência, KGR ou dificuldade — esses contratos pertencem a outras etapas e não foram enviados.",
  "Nunca invente público, oferta, promessa clínica, prova, número ou claim.",
  "A BrandDNA aprovada, quando existir, e a Voz da Marca disponível orientam voz, vocabulário, prudência e forma de explicar.",
  "Se a BrandDNA aprovada não existir mas houver Voz da Marca disponível, use a Voz da Marca e apenas registre",
  "a lacuna de identidade; nunca conclua que falta base para definir a voz.",
  "Refira-se à Voz da Marca como aplicada ou disponível; disponível para uso não significa aprovada.",
  "Não crie artigo, ContentPlan, agrupamento, slug, canonical ou decisão de aprovação.",
  "Responda em texto puro, sem JSON, sem títulos, sem marcadores e sem aspas de citação.",
  "",
  "A pergunta que você responde é: como esta Marca deve apresentar este tema para a audiência dela?",
  "Percorra internamente, e só quando houver suporte no contexto recebido: objetivo da Marca com o tema,",
  "lente da audiência conhecida, enquadramento, mensagem principal, o que explicar primeiro, o que enfatizar,",
  "objeções ou mal-entendidos, provas disponíveis, vocabulário e claims permitidos ou proibidos,",
  "e o que permanece em aberto. Não devolva esses itens como títulos nem como lista: entregue orientação corrida.",
  "O resultado é um plano de apresentação, nunca o conteúdo final, um post ou um roteiro pronto.",
  "Escreva de 1 a 3 parágrafos curtos em português do Brasil.",
].join("\n");

export function buildContextualPresentationPrompt(input: {
  keywordDna: KeywordDnaPresentationContext;
  brandContext: BrandAIContext;
}): string {
  const keyword = input.keywordDna;
  const c = keyword.canonical;
  return [
    "# APRESENTAÇÃO CONTEXTUAL",
    "Esta camada é não canônica e somente informativa. Não altere o KeywordDNA.",
    "",
    "## TEMA E CONTEXTO EDITORIAL · somente leitura",
    "keywordId: " + keyword.keywordId,
    "tema: " + keyword.keyword,
    "location: " + presentationFact(keyword.location),
    "inputKeywordDnaRef: " + keyword.inputKeywordDnaRef.versionId,
    "inputKeywordDnaHash: " + keyword.inputKeywordDnaRef.contentHash,
    "Entidade central: " + presentationFact(c.centralEntity),
    "Modificadores: " + presentationFact(c.modifiers),
    "Audiência registrada: " + presentationFact(c.audience),
    "Problema percebido registrado: " + presentationFact(c.perceivedProblem),
    "Resultado desejado registrado: " + presentationFact(c.desiredResult),
    "Nível de consciência registrado: " + presentationFact(c.awareness),
    "Etapa de jornada registrada: " + presentationFact(c.journey),
    "Objeções registradas: " + presentationFact(c.objections),
    "",
    "## CONTEXTO DISPONÍVEL DA MARCA",
    input.brandContext.brandContext,
    "",
    "## TAREFA",
    "Explique como esta Marca deve apresentar este tema para a audiência dela, de modo útil e prudente.",
    "Diga concretamente o que enfatizar, o que explicar primeiro, o que evitar e qual ângulo é desta Marca.",
    "Relacione a explicação somente aos dados registrados acima e ao contexto disponível da Marca.",
    "Quando um dado estiver não informado, diga que ele não está disponível; não o complete.",
    "Não fale de intenção de busca, funil, nicho, SERP, volume, concorrência, KGR ou status editorial.",
    "Responda apenas com o texto da orientação.",
  ].join("\n");
}

export const ContextualPresentationModelSchema = z.object({
  // Medição real (2026-08-29): sem raciocínio o modelo escreve mais denso —
  // 2.457 e 2.862 caracteres em execuções válidas. O teto anterior de 2.200
  // rejeitava apresentação boa. Continua sendo texto compacto, com folga.
  text: z.string().trim().min(1).max(3200),
});
export type ContextualPresentationModel = z.infer<typeof ContextualPresentationModelSchema>;

export type ContextualPresentation = {
  text: string;
  generatedAt: string;
  provider: "deepseek";
  model: string;
  status: "generated" | "failed" | "stale";
  inputKeywordDnaRef: VersionReference;
  appliedSkillRefs: Array<{
    definitionKey: string;
    versionId: string | null;
    versionNumber: number;
    contentHash: string;
  }>;
};

export function parseContextualPresentation(raw: unknown): {
  presentation: ContextualPresentationModel;
  discardedAuthorityFields: string[];
} {
  return {
    presentation: ContextualPresentationModelSchema.parse(raw),
    discardedAuthorityFields: forbiddenBriefAuthorityFields(raw),
  };
}
