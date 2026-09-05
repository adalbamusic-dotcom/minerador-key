import { createHash } from "node:crypto";
import { z } from "zod";
import {
  SerpDiagnosticSchema,
  SerpKnowledgeGraphSchema,
  SerpOrganicResultSchema,
  SerpPeopleAlsoAskSchema,
  SerpRelatedSearchSchema,
  SerpResearchSnapshotSchema,
  type SerpConfidence,
  type SerpResearchSnapshot,
  type SerpResultKind,
  type SerpSearchInput,
} from "../radar/serp/contracts.ts";
import { DataForSeoSerpError, type DataForSeoSerpConfig } from "../minerador/dataforseo-serp-core.ts";

const ResponseSchema = z.object({ tasks: z.array(z.unknown()), status_code: z.number(), status_message: z.string().optional() }).passthrough();
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validUrl = (value: unknown) => { try { return new URL(clean(value)); } catch { return null; } };
const domainOf = (url: URL) => url.hostname.replace(/^www\./i, "");

function classifyResult(title: string, url: URL, snippet: string): { kind: SerpResultKind; confidence: SerpConfidence } {
  const text = `${title} ${url.pathname} ${snippet}`.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(url.hostname)) return { kind: "video", confidence: "high" };
  if (/reddit\.com|quora\.com|forum|fórum/.test(text)) return { kind: "forum", confidence: "high" };
  if (/compar|versus|\bvs\b/.test(text)) return { kind: "comparison", confidence: "high" };
  if (/melhores|\btop\b|lista|list\b/.test(text)) return { kind: "list", confidence: "medium" };
  if (/produto|product|shop|comprar|preço|preco|oferta/.test(text)) return { kind: "product", confidence: "medium" };
  if (/review|avaliação|avaliacao|resenha/.test(text)) return { kind: "review", confidence: "medium" };
  if (/\/servi[cç]os?|consultoria|ag[eê]ncia|or[cç]amento/.test(text)) return { kind: "service", confidence: "medium" };
  if (/\/categoria|\/category|categoria/.test(text)) return { kind: "category", confidence: "medium" };
  if (/perto|local|unidade|bairro|cidade|endere[cç]o/.test(text)) return { kind: "local", confidence: "low" };
  if (/sobre n[oó]s|institucional|empresa/.test(text)) return { kind: "institutional", confidence: "medium" };
  if (/\/blog\/|\/artigo|guia|como fazer|passo a passo|o que [eé]/.test(text)) return { kind: "article", confidence: "medium" };
  return { kind: "other", confidence: "low" };
}

function intentFor(text: string) {
  if (/comprar|preço|preco|orçamento|orcamento|contratar|oferta/.test(text)) return "transacional";
  if (/melhor|compar|review|avalia|alternativa/.test(text)) return "investigacao_comercial";
  if (/perto|local|cidade|bairro|endereço|endereco/.test(text)) return "local";
  if (/site|marca|empresa/.test(text)) return "navegacional";
  return "informacional";
}

function confidenceFor(count: number, total: number): SerpConfidence {
  if (!total) return "insufficient";
  const ratio = count / total;
  return ratio >= 0.7 ? "high" : ratio >= 0.45 ? "medium" : "low";
}

function diagnosticFor(input: SerpSearchInput, organic: Array<z.infer<typeof SerpOrganicResultSchema>>, paa: Array<z.infer<typeof SerpPeopleAlsoAskSchema>>, related: Array<z.infer<typeof SerpRelatedSearchSchema>>) {
  const typeCounts = organic.reduce<Record<string, number>>((counts, item) => { counts[item.inferredType] = (counts[item.inferredType] || 0) + 1; return counts; }, {});
  const intentCounts = organic.reduce<Record<string, number>>((counts, item) => { const intent = intentFor(`${item.title} ${item.snippet}`.toLowerCase()); counts[intent] = (counts[intent] || 0) + 1; return counts; }, {});
  const dominantIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const dominantCount = dominantIntent ? intentCounts[dominantIntent] : 0;
  const formats = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([format]) => format);
  const combined = organic.map(item => `${item.title} ${item.snippet}`).join(" ").toLowerCase();
  const conflicts: string[] = [];
  if (input.expectedIntent && dominantIntent && !dominantIntent.includes(input.expectedIntent.toLowerCase().split("_")[0])) conflicts.push(`A intenção esperada (${input.expectedIntent}) não coincide claramente com a intenção aparente (${dominantIntent}).`);
  const missingTopics = organic.length ? input.requiredTopics.filter(topic => topic.trim() && !combined.includes(topic.toLowerCase())).slice(0, 8) : [];
  if (missingTopics.length) conflicts.push(`Tópicos sem ocorrência textual nos snippets: ${missingTopics.join(", ")}.`);
  return SerpDiagnosticSchema.parse({
    dominantIntent,
    secondaryIntents: Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).slice(1, 3).map(([intent]) => intent),
    confidence: confidenceFor(dominantCount, organic.length),
    dominantFormats: formats,
    resultTypeCounts: typeCounts,
    pageTypes: [...new Set(organic.map(item => item.inferredType))],
    recurringTitlePatterns: formats.length ? [`Resultados classificados principalmente como ${formats.join(", ")}.`] : [],
    recurringSnippetPatterns: paa.length ? ["Resultados acompanhados por perguntas relacionadas retornadas pela DataForSEO."] : [],
    frequentEntities: input.articleEntities.filter(entity => combined.includes(entity.toLowerCase())).slice(0, 12),
    frequentDomains: [...new Set(organic.map(item => item.domain))].slice(0, 12),
    localSignals: organic.filter(item => item.inferredType === "local").map(item => item.domain).slice(0, 10),
    questions: paa.map(item => item.question),
    relatedSearches: related.map(item => item.term),
    possibleConflicts: conflicts,
    opportunities: [paa.length ? "Revisar perguntas relacionadas como evidência editorial." : "Nenhuma pergunta relacionada foi retornada.", related.length ? "Avaliar pesquisas relacionadas como reforço ou pauta futura." : "Nenhuma pesquisa relacionada foi retornada."],
    limitations: ["Classificações de tipo e intenção são heurísticas determinísticas baseadas em título, URL e snippet.", "A ausência de um termo nos snippets não prova ausência no conteúdo completo.", "A ausência de resultado não é tratada como conflito estrutural."],
    verdict: !organic.length ? "informacao_insuficiente" : conflicts.length ? "possivel_conflito" : dominantCount / organic.length >= 0.6 ? "coerente" : "parcialmente_coerente",
  });
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function positiveNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function textFrom(value: unknown) {
  return clean(value);
}

function sitelinksFrom(item: Record<string, unknown>) {
  const raw = Array.isArray(item.sitelinks) ? item.sitelinks : [];
  return raw.map(link => {
    const record = recordOf(link);
    const title = textFrom(record?.title);
    const url = validUrl(record?.url);
    return title && url ? { title, url: url.toString() } : null;
  }).filter((link): link is { title: string; url: string } => Boolean(link));
}

function knowledgeGraphFrom(items: unknown[]) {
  const raw = items.map(recordOf).find(item => /knowledge_graph|knowledge_panel/.test(clean(item?.type).toLowerCase()));
  if (!raw) return null;
  const rawAttributes = recordOf(raw.attributes);
  const attributes = Object.fromEntries(Object.entries(rawAttributes || {}).filter(([, value]) => typeof value === "string").map(([key, value]) => [key, value as string]));
  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  const sources = rawSources.map(source => {
    const record = recordOf(source);
    const url = validUrl(record?.url);
    return record ? { title: textFrom(record.title) || null, url: url?.toString() || null } : null;
  }).filter((source): source is { title: string | null; url: string | null } => Boolean(source));
  return SerpKnowledgeGraphSchema.parse({
    title: textFrom(raw.title) || null,
    type: textFrom(raw.entity_type) || textFrom(raw.type) || null,
    description: textFrom(raw.description) || null,
    attributes,
    website: validUrl(raw.url || raw.website)?.toString() || null,
    sources,
  });
}

/** Pure provider-response normalization shared by Arquiteto and future Radar consumers. */
export function normalizeDataForSeoSerpResponse(body: unknown, input: SerpSearchInput, config: Pick<DataForSeoSerpConfig, "locationCode" | "languageCode">, collectedAt = new Date().toISOString(), providerRequestId: string | null = null): SerpResearchSnapshot {
  const parsed = ResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.tasks.length !== 1) throw new DataForSeoSerpError("dataforseo_invalid_response", "A DataForSEO retornou uma resposta sem uma task única.", 502, providerRequestId);
  if (parsed.data.status_code !== 20000) {
    throw new DataForSeoSerpError("dataforseo_invalid_response", "A DataForSEO retornou um status de resposta inválido.", 502, providerRequestId);
  }
  const task = parsed.data.tasks[0] && typeof parsed.data.tasks[0] === "object" && !Array.isArray(parsed.data.tasks[0]) ? parsed.data.tasks[0] as Record<string, unknown> : null;
  const taskId = typeof task?.id === "string" ? task.id : providerRequestId;
  if (!task || Number(task.status_code) !== 20000) throw new DataForSeoSerpError("dataforseo_task_failed", "A task DataForSEO não foi concluída com sucesso.", 502, taskId);
  const result = Array.isArray(task.result) && task.result[0] && typeof task.result[0] === "object" && !Array.isArray(task.result[0])
    ? task.result[0] as Record<string, unknown>
    : null;
  if (!result || !Array.isArray(result.items)) {
    throw new DataForSeoSerpError("dataforseo_invalid_response", "A DataForSEO não retornou a estrutura de resultado esperada.", 502, taskId);
  }
  const rawItems = result.items;
  const organic = rawItems.map((raw, index) => {
    const item = recordOf(raw);
    const itemType = clean(item?.type).toLowerCase();
    if (!item || (itemType && itemType !== "organic" && itemType !== "video")) return null;
    const title = textFrom(item.title); const url = validUrl(item.url);
    if (!title || !url) return null;
    const snippet = textFrom(item.description) || textFrom(item.snippet);
    const classification = itemType === "video" ? { kind: "video" as const, confidence: "high" as const } : classifyResult(title, url, snippet);
    const position = positiveNumber(item.rank_absolute) || positiveNumber(item.rank_group) || index + 1;
    return SerpOrganicResultSchema.parse({ position, title, url: url.toString(), domain: domainOf(url), snippet, sitelinks: sitelinksFrom(item), date: textFrom(item.timestamp) || textFrom(item.date) || null, inferredType: classification.kind, confidence: classification.confidence, manualType: null, notes: "" });
  }).filter((item): item is z.infer<typeof SerpOrganicResultSchema> => Boolean(item)).slice(0, input.resultLimit);
  const paa = rawItems.flatMap((raw, index) => {
    const item = recordOf(raw);
    if (!item || !/people_also_ask|question/.test(clean(item.type).toLowerCase())) return [];
    const children = Array.isArray(item.items) ? item.items : [item];
    return children.map((child, childIndex) => {
      const questionItem = recordOf(child) || item;
      const question = textFrom(questionItem.question) || textFrom(questionItem.title);
      return question ? SerpPeopleAlsoAskSchema.parse({ position: index + childIndex + 1, question, answer: textFrom(questionItem.description) || null, sourceTitle: textFrom(questionItem.title) || null, sourceUrl: validUrl(questionItem.url)?.toString() || null, classification: null, notes: "" }) : null;
    }).filter((item): item is z.infer<typeof SerpPeopleAlsoAskSchema> => Boolean(item));
  });
  const related = rawItems.map(raw => {
    const item = recordOf(raw);
    const term = item && /related_search/.test(clean(item.type).toLowerCase()) ? textFrom(item.title) || textFrom(item.keyword) : "";
    return term ? SerpRelatedSearchSchema.parse({ term, classification: null, notes: "" }) : null;
  }).filter((item): item is z.infer<typeof SerpRelatedSearchSchema> => Boolean(item));
  const diagnostic = diagnosticFor(input, organic, paa, related);
  return SerpResearchSnapshotSchema.parse({ id: `serp:${input.articleId}:${crypto.randomUUID()}`, brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId, keywordId: input.keywordId, keywordDnaVersionId: input.keywordDnaVersionId, query: input.keyword, country: "br", language: input.language, location: input.location, device: input.device, resultLimit: input.resultLimit, provider: "dataforseo", providerEndpoint: "/search", origin: "real", isMock: false, collectedAt, version: input.version, previousSnapshotId: input.previousSnapshotId, contentHash: hash({ query: input.keyword, locationCode: config.locationCode, languageCode: config.languageCode, device: input.device, organic, paa, related, knowledgeGraph: knowledgeGraphFrom(rawItems), diagnostic }), persistenceMode: "local", status: "needs_review", organicResults: organic, peopleAlsoAsk: paa, relatedSearches: related, knowledgeGraph: knowledgeGraphFrom(rawItems), diagnostic });
}

/** Compatibility name retained for the Arquiteto boundary and its fixtures. */
export const normalizeDataForSeoCompatibilityResponse = normalizeDataForSeoSerpResponse;
