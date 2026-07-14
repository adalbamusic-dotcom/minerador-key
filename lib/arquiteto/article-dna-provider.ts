import type { ArticleDNA } from "./contracts.ts";

const recordOf = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const list = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim())
  : typeof value === "string" ? value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) : undefined;

const first = (source: Record<string, unknown>, keys: string[]) => keys.map(key => source[key]).find(value => value !== undefined);

function unwrap(value: unknown): { source: Record<string, unknown>; wrapped: boolean } {
  const root = recordOf(value) || {};
  for (const key of ["articleDna", "articleDNA", "article_dna", "dna", "payload", "result", "data"]) {
    const candidate = recordOf(root[key]);
    if (candidate) return { source: candidate, wrapped: true };
  }
  return { source: root, wrapped: false };
}

const confidence = (value: unknown) => {
  const numeric = typeof value === "string" ? Number(value.replace(",", ".").replace("%", "")) : value;
  if (typeof numeric !== "number" || Number.isNaN(numeric)) return undefined;
  return numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
};

/** Normaliza somente conteúdo editorial; identidade, organização e referências são controladas pelo servidor. */
export function normalizeArticleDnaProviderPayload(value: unknown): { payload: Partial<ArticleDNA>; warnings: string[] } {
  const { source, wrapped } = unwrap(value);
  const payload: Partial<ArticleDNA> = {};
  const assignText = (key: keyof ArticleDNA, aliases: string[]) => { const value = text(first(source, aliases)); if (value !== undefined) Object.assign(payload, { [key]: value }); };
  const assignList = (key: keyof ArticleDNA, aliases: string[]) => { const value = list(first(source, aliases)); if (value !== undefined) Object.assign(payload, { [key]: value }); };

  assignText("suggestedSlug", ["suggestedSlug", "suggested_slug", "slugSugerido", "slug_sugerido", "slug"]);
  assignText("mainIntent", ["mainIntent", "main_intent", "intencaoPrincipal", "intencao_principal"]);
  assignList("auxiliaryIntents", ["auxiliaryIntents", "auxiliary_intents", "intencoesAuxiliares", "intencoes_auxiliares"]);
  assignText("audience", ["audience", "publico", "público"]);
  assignText("problem", ["problem", "problema"]);
  assignText("desiredResult", ["desiredResult", "desired_result", "resultadoDesejado", "resultado_desejado"]);
  assignText("journeyStage", ["journeyStage", "journey_stage", "estagioJornada", "estagio_jornada", "etapaJornada", "etapa_jornada"]);
  assignText("brandObjective", ["brandObjective", "brand_objective", "objetivoMarca", "objetivo_marca"]);
  assignText("promise", ["promise", "promessa"]);
  assignText("angle", ["angle", "angulo", "ângulo"]);
  assignText("cta", ["cta", "CTA"]);
  assignList("coverage", ["coverage", "cobertura"]);
  assignList("excludedSubjects", ["excludedSubjects", "excluded_subjects", "assuntosExcluidos", "assuntos_excluidos"]);
  assignText("antiCannibalizationBoundary", ["antiCannibalizationBoundary", "anti_cannibalization_boundary", "fronteiraAntiCanibalizacao", "fronteira_anti_canibalizacao"]);
  assignList("nearbyArticleIds", ["nearbyArticleIds", "nearby_article_ids", "artigosProximos", "artigos_proximos"]);
  assignList("differentiation", ["differentiation", "diferenciacao", "diferenciação"]);
  assignList("entities", ["entities", "entidades"]);
  assignList("requiredTopics", ["requiredTopics", "required_topics", "topicosObrigatorios", "topicos_obrigatorios"]);
  assignList("questions", ["questions", "perguntas"]);
  assignList("objections", ["objections", "objecoes", "objeções"]);
  assignList("evidenceNeeded", ["evidenceNeeded", "evidence_needed", "evidenciasNecessarias", "evidencias_necessarias"]);
  assignList("sourcesNeeded", ["sourcesNeeded", "sources_needed", "fontesNecessarias", "fontes_necessarias"]);
  assignList("internalLinks", ["internalLinks", "internal_links", "linksInternos", "links_internos"]);
  assignList("alerts", ["alerts", "alertas"]);
  assignList("humanPendingDecisions", ["humanPendingDecisions", "human_pending_decisions", "humanDecisionPoints", "pendenciasHumanas", "pendencias_humanas"]);

  const normalizedConfidence = confidence(first(source, ["confidence", "confianca", "confiança"]));
  if (normalizedConfidence !== undefined) payload.confidence = normalizedConfidence;
  const canonical = first(source, ["canonical", "urlCanonical", "url_canonical"]);
  if (canonical === null || canonical === "") payload.canonical = null;
  else if (text(canonical)) payload.canonical = text(canonical)!;

  return { payload, warnings: wrapped ? ["Envelope articleDna da IA normalizado pelo servidor."] : [] };
}
