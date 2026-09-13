import { createHash } from "node:crypto";
import { z } from "zod";
import { radarIntentConflict } from "./editorial-identity.ts";
import { SerpDiagnosticSchema, SerpKnowledgeGraphSchema, SerpOrganicResultSchema, SerpPeopleAlsoAskSchema, SerpRelatedSearchSchema, SerpResearchSnapshotSchema, type SerpConfidence, type SerpResultKind, type SerpResearchSnapshot, type SerpSearchInput } from "./serp/contracts.ts";

const SerperResponseSchema = z.object({
  organic: z.array(z.unknown()).optional(),
  peopleAlsoAsk: z.array(z.unknown()).optional(),
  relatedSearches: z.array(z.unknown()).optional(),
  knowledgeGraph: z.unknown().optional(),
}).passthrough();

export class SerperProviderError extends Error {
  readonly code: "not_configured" | "unsupported_provider" | "timeout" | "provider_http" | "invalid_response";
  readonly status: number;
  constructor(code: "not_configured" | "unsupported_provider" | "timeout" | "provider_http" | "invalid_response", message: string, status = 502) {
    super(message); this.name = "SerperProviderError"; this.code = code; this.status = status;
  }
}

type SerperConfig = { baseUrl: string; apiKey: string; country: string; language: string; results: number; timeoutMs: number };

function readConfig(): SerperConfig {
  const provider = (process.env.SERP_PROVIDER || "").trim().toLowerCase();
  if (!provider) throw new SerperProviderError("not_configured", "O provedor SERP não está configurado.", 503);
  if (provider !== "serper") throw new SerperProviderError("unsupported_provider", `O provedor SERP "${provider}" não é suportado.`, 503);
  const apiKey = process.env.SERPER_API_KEY?.trim(); const rawBaseUrl = process.env.SERPER_API_BASE_URL?.trim();
  if (!apiKey || !rawBaseUrl) throw new SerperProviderError("not_configured", "A chave ou a URL-base da Serper não está configurada.", 503);
  let baseUrl: URL;
  try { baseUrl = new URL(rawBaseUrl); } catch { throw new SerperProviderError("not_configured", "A URL-base da Serper é inválida.", 503); }
  const results = Math.min(100, Math.max(1, Number.parseInt(process.env.SERP_DEFAULT_RESULTS || "10", 10) || 10));
  const timeoutMs = Math.min(120_000, Math.max(1_000, Number.parseInt(process.env.SERP_TIMEOUT_MS || "30000", 10) || 30_000));
  return { baseUrl: `${baseUrl.toString().replace(/\/$/, "")}/search`, apiKey, country: process.env.SERP_DEFAULT_COUNTRY?.trim() || "br", language: process.env.SERP_DEFAULT_LANGUAGE?.trim() || "pt-br", results, timeoutMs };
}

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validUrl = (value: unknown) => { try { return new URL(clean(value)); } catch { return null; } };
const domainOf = (url: URL) => url.hostname.replace(/^www\./i, "");

function classifyResult(title: string, url: URL, snippet: string): { kind: SerpResultKind; confidence: SerpConfidence; format: string } {
  const text = `${title} ${url.pathname} ${snippet}`.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(url.hostname)) return { kind: "video", confidence: "high", format: "vídeo" };
  if (/reddit\.com|quora\.com|forum|fórum/.test(text)) return { kind: "forum", confidence: "high", format: "fórum" };
  if (/compar|versus|\bvs\b/.test(text)) return { kind: "comparison", confidence: "high", format: "comparativo" };
  if (/melhores|\btop\b|lista|list\b/.test(text)) return { kind: "list", confidence: "medium", format: "lista" };
  if (/produto|product|shop|comprar|preço|preco|oferta/.test(text)) return { kind: "product", confidence: "medium", format: "produto" };
  if (/review|avaliação|avaliacao|resenha/.test(text)) return { kind: "review", confidence: "medium", format: "review" };
  if (/\/servi[cç]os?\/|consultoria|ag[eê]ncia|or[cç]amento/.test(text)) return { kind: "service", confidence: "medium", format: "serviço" };
  if (/\/categoria|\/category|categoria/.test(text)) return { kind: "category", confidence: "medium", format: "categoria" };
  if (/perto|local|unidade|bairro|cidade|endere[cç]o/.test(text)) return { kind: "local", confidence: "low", format: "página local" };
  if (/sobre n[oó]s|institucional|empresa/.test(text)) return { kind: "institutional", confidence: "medium", format: "institucional" };
  if (/\/blog\/|\/artigo|guia|como fazer|passo a passo|o que [eé]/.test(text)) return { kind: "article", confidence: "medium", format: "artigo" };
  return { kind: "other", confidence: "low", format: "página web" };
}

function intentFor(text: string) {
  if (/comprar|preço|preco|orçamento|orcamento|contratar|oferta/.test(text)) return "transacional";
  if (/melhor|compar|review|avalia|alternativa/.test(text)) return "investigacao_comercial";
  if (/perto|local|cidade|bairro|endereço|endereco/.test(text)) return "local";
  if (/site|marca|empresa/.test(text)) return "navegacional";
  return "informacional";
}
function confidenceFor(count: number, total: number): SerpConfidence { if (!total) return "insufficient"; const ratio = count / total; return ratio >= .7 ? "high" : ratio >= .45 ? "medium" : "low"; }

function diagnosticFor(input: SerpSearchInput, organic: Array<z.infer<typeof SerpOrganicResultSchema>>, paa: Array<z.infer<typeof SerpPeopleAlsoAskSchema>>, related: Array<z.infer<typeof SerpRelatedSearchSchema>>, kg: z.infer<typeof SerpKnowledgeGraphSchema> | null) {
  const typeCounts = organic.reduce<Record<string, number>>((counts, result) => { counts[result.inferredType] = (counts[result.inferredType] || 0) + 1; return counts; }, {});
  const intentCounts = organic.reduce<Record<string, number>>((counts, result) => { const intent = intentFor(`${result.title} ${result.snippet}`.toLowerCase()); counts[intent] = (counts[intent] || 0) + 1; return counts; }, {});
  const dominantIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const secondaryIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).slice(1, 3).map(([intent]) => intent);
  const dominantCount = dominantIntent ? intentCounts[dominantIntent] : 0;
  const formatCounts = organic.reduce<Record<string, number>>((counts, result) => { const format = result.inferredType; counts[format] = (counts[format] || 0) + 1; return counts; }, {});
  const dominantFormats = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([format]) => format);
  const domains = new Map<string, number>(); organic.forEach(result => domains.set(result.domain, (domains.get(result.domain) || 0) + 1));
  const frequentDomains = [...domains.entries()].sort((a, b) => b[1] - a[1]).filter(([, count]) => count > 1).map(([domain]) => domain);
  const combined = organic.map(result => `${result.title} ${result.snippet}`).join(" ").toLowerCase();
  const frequentEntities = input.articleEntities.filter(entity => combined.includes(entity.toLowerCase())).slice(0, 12);
  const localSignals = organic.filter(result => result.inferredType === "local").map(result => result.domain).slice(0, 10);
  const conflicts: string[] = [];
  /* A decisão de conflito é da autoridade; aqui só se registra o resultado. */
  const leituraDeIntencao = radarIntentConflict({ expected: input.expectedIntent, observed: dominantIntent });
  if (leituraDeIntencao.conflicting) conflicts.push(leituraDeIntencao.reason);
  if (input.expectedFormat && dominantFormats.length && !dominantFormats.some(format => format.includes(input.expectedFormat.toLowerCase().split("_")[0]))) conflicts.push(`O formato esperado (${input.expectedFormat}) não aparece como formato dominante.`);
  const missingTopics = input.requiredTopics.filter(topic => topic.trim() && !combined.includes(topic.toLowerCase())).slice(0, 8);
  if (missingTopics.length) conflicts.push(`Tópicos do ArticleDNA sem ocorrência textual nos snippets: ${missingTopics.join(", ")}.`);
  const opportunities = [paa.length ? "Revisar as perguntas do People Also Ask para priorização editorial." : "A Serper não retornou People Also Ask para esta consulta.", related.length ? "Avaliar pesquisas relacionadas como reforço ou pauta futura." : "A Serper não retornou pesquisas relacionadas."];
  if (kg) opportunities.push("Validar se a entidade do Knowledge Graph deve orientar a contextualização.");
  const verdict = !organic.length ? "informacao_insuficiente" : conflicts.length ? "possivel_conflito" : dominantCount / organic.length >= .6 ? "coerente" : "parcialmente_coerente";
  return SerpDiagnosticSchema.parse({ dominantIntent, secondaryIntents, confidence: confidenceFor(dominantCount, organic.length), dominantFormats, resultTypeCounts: typeCounts, pageTypes: [...new Set(organic.map(result => result.inferredType))], recurringTitlePatterns: dominantFormats.length ? [`Resultados classificados principalmente como ${dominantFormats.join(", ")}.`] : [], recurringSnippetPatterns: paa.length ? ["Snippets acompanhados por perguntas relacionadas do provedor."] : [], frequentEntities, frequentDomains, localSignals, questions: paa.map(item => item.question), relatedSearches: related.map(item => item.term), possibleConflicts: conflicts, opportunities, limitations: ["Classificações de tipo e intenção são heurísticas determinísticas baseadas em título, URL e snippet.", "A ausência de um termo nos snippets não prova ausência no conteúdo completo."], verdict });
}

function canonicalHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function collectSerperSnapshot(input: SerpSearchInput, fetchImpl: typeof fetch = fetch): Promise<SerpResearchSnapshot> {
  const config = readConfig();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    const location = input.location.trim();
    response = await fetchImpl(config.baseUrl, { method: "POST", headers: { "X-API-KEY": config.apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ q: input.keyword, gl: config.country, hl: config.language, num: Math.min(input.resultLimit, config.results), ...(location ? { location } : {}) }), cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new SerperProviderError("timeout", `A Serper não respondeu dentro do limite de ${Math.round(config.timeoutMs / 1000)} segundos.`, 504);
    throw error;
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    const status = response.status; const code = status === 429 ? "provider_http" : "provider_http";
    throw new SerperProviderError(code, status === 429 ? "Limite da Serper atingido. Tente novamente depois." : `A Serper retornou HTTP ${status}.`, status >= 500 ? 502 : status);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new SerperProviderError("invalid_response", "A resposta da Serper não é um JSON válido.", 502); }
  const parsed = SerperResponseSchema.safeParse(body); if (!parsed.success) throw new SerperProviderError("invalid_response", "A resposta da Serper não respeita o formato esperado.", 502);
  const organic = (parsed.data.organic || []).map((raw, index) => {
    const item = raw as Record<string, unknown>; const title = clean(item.title); const url = validUrl(item.link); if (!title || !url) { if (item.title || item.link) throw new SerperProviderError("invalid_response", "A resposta da Serper contém resultado orgânico inválido.", 502); return null; }
    const snippet = clean(item.snippet); const classification = classifyResult(title, url, snippet); const sitelinks = Array.isArray(item.sitelinks) ? item.sitelinks.map(link => { const candidate = link as Record<string, unknown>; const linkUrl = validUrl(candidate.link); return candidate.title && linkUrl ? { title: clean(candidate.title), url: linkUrl.toString() } : null; }).filter((link): link is { title: string; url: string } => Boolean(link)) : [];
    return SerpOrganicResultSchema.parse({ position: Number.isInteger(item.position) && Number(item.position) > 0 ? Number(item.position) : index + 1, title, url: url.toString(), domain: domainOf(url), snippet, sitelinks, date: clean(item.date) || null, inferredType: classification.kind, confidence: classification.confidence, manualType: null, notes: "" });
  }).filter((item): item is z.infer<typeof SerpOrganicResultSchema> => Boolean(item));
  const peopleAlsoAsk = (parsed.data.peopleAlsoAsk || []).map((raw, index) => { const item = raw as Record<string, unknown>; const question = clean(item.question); if (!question) return null; const sourceUrl = validUrl(item.link); return SerpPeopleAlsoAskSchema.parse({ position: index + 1, question, answer: clean(item.snippet) || clean(item.answer) || null, sourceTitle: clean(item.title) || null, sourceUrl: sourceUrl?.toString() || null, classification: null, notes: "" }); }).filter((item): item is z.infer<typeof SerpPeopleAlsoAskSchema> => Boolean(item));
  const relatedSearches = (parsed.data.relatedSearches || []).map(raw => { const term = clean((raw as Record<string, unknown>).query); return term ? SerpRelatedSearchSchema.parse({ term, classification: null, notes: "" }) : null; }).filter((item): item is z.infer<typeof SerpRelatedSearchSchema> => Boolean(item));
  let knowledgeGraph: z.infer<typeof SerpKnowledgeGraphSchema> | null = null;
  if (parsed.data.knowledgeGraph && typeof parsed.data.knowledgeGraph === "object") { const raw = parsed.data.knowledgeGraph as Record<string, unknown>; const website = validUrl(raw.website); const sources = Array.isArray(raw.sources) ? raw.sources.map(source => { const item = source as Record<string, unknown>; const url = validUrl(item.link); return url ? { title: clean(item.title) || null, url: url.toString() } : null; }).filter((item): item is { title: string | null; url: string } => Boolean(item)) : []; knowledgeGraph = SerpKnowledgeGraphSchema.parse({ title: clean(raw.title) || null, type: clean(raw.type) || null, description: clean(raw.description) || null, attributes: typeof raw.attributes === "object" && raw.attributes ? Object.fromEntries(Object.entries(raw.attributes as Record<string, unknown>).filter(([, value]) => typeof value === "string")) : {}, website: website?.toString() || null, sources }); }
  const collectedAt = new Date().toISOString();
  const diagnostic = diagnosticFor(input, organic, peopleAlsoAsk, relatedSearches, knowledgeGraph);
  const hashInput = { query: input.keyword, country: config.country, language: config.language, location: input.location, device: input.device, organicResults: organic, peopleAlsoAsk, relatedSearches, knowledgeGraph, diagnostic };
  const contentHash = canonicalHash(hashInput); const snapshot = SerpResearchSnapshotSchema.parse({ id: `serp:${input.articleId}:${crypto.randomUUID()}`, brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId, keywordId: input.keywordId, keywordDnaVersionId: input.keywordDnaVersionId, query: input.keyword, country: config.country, language: config.language, location: input.location, device: input.device, resultLimit: Math.min(input.resultLimit, config.results), provider: "serper", providerEndpoint: "/search", origin: "real", isMock: false, collectedAt, version: input.version, previousSnapshotId: input.previousSnapshotId, contentHash, persistenceMode: "local", status: "needs_review", organicResults: organic, peopleAlsoAsk, relatedSearches, knowledgeGraph, diagnostic });
  return snapshot;
}
