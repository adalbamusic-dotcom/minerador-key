import { SitePageTypeSchema, type SiteKeywordSourceField, type SiteKeywordSuggestedRole, type SiteKeywordSlugCoherence, type SitePageType } from "./site-contracts.ts";

export interface ParsedSitemap {
  kind: "urlset" | "sitemapindex";
  items: Array<{ url: string; lastmod: string | null }>;
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export function parseSitemapXml(xml: string): ParsedSitemap {
  const root = xml.match(/<\s*(?:[\w-]+:)?(urlset|sitemapindex)\b/i)?.[1]?.toLowerCase();
  if (!root) throw new Error("XML sem raiz urlset ou sitemapindex.");
  const closingRoot = new RegExp(`<\\s*\\/\\s*(?:[\\w-]+:)?${root}\\s*>`, "i");
  if (!closingRoot.test(xml)) throw new Error("XML de sitemap incompleto.");
  const tag = root === "urlset" ? "url" : "sitemap";
  const items: ParsedSitemap["items"] = [];
  const blockPattern = new RegExp(`<\\s*(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*(?:[\\w-]+:)?${tag}\\s*>`, "gi");
  for (const match of xml.matchAll(blockPattern)) {
    const loc = match[1].match(/<\s*(?:[\w-]+:)?loc\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[\w-]+:)?loc\s*>/i)?.[1];
    if (!loc) continue;
    const lastmod = match[1].match(/<\s*(?:[\w-]+:)?lastmod\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[\w-]+:)?lastmod\s*>/i)?.[1] || null;
    items.push({ url: decodeXml(loc), lastmod: lastmod ? decodeXml(lastmod) : null });
  }
  return { kind: root as ParsedSitemap["kind"], items };
}

export interface ExtractedPageData {
  title: string | null; h1: string | null; metaDescription: string | null; canonical: string | null; robots: string | null; headings: string[]; pageType: SitePageType; indexability: "unknown" | "indexable" | "noindex" | "blocked";
}

function firstTag(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<\\s*${tag}\\b[^>]*>([\\s\\S]*?)<\\s*\\/${tag}\\s*>`, "i"));
  return match?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function metaContent(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<meta\\b[^>]*(?:name|property)\\s*=\\s*["']?${name}["']?[^>]*content\\s*=\\s*["']?([^"' >]*)["']?[^>]*>|<meta\\b[^>]*content\\s*=\\s*["']?([^"' >]*)["']?[^>]*(?:name|property)\\s*=\\s*["']?${name}["']?[^>]*>`, "i"));
  return (match?.[1] || match?.[2] || "").trim() || null;
}

export function classifySitePage(url: string, title: string | null, h1: string | null): SitePageType {
  const path = new URL(url).pathname.toLowerCase();
  const text = `${path} ${title || ""} ${h1 || ""}`;
  if (/author|autor\//.test(path)) return "author";
  if (/category|categoria|tag\//.test(path)) return "category";
  if (/product|produto/.test(path)) return "product";
  if (/service|servico|servi[cç]o/.test(text)) return "service";
  if (/blog|artigo|post|noticia|notícia|\/20\d{2}\//.test(text)) return "article";
  return path === "/" || path === "" ? "page" : "unknown";
}

export function extractPageData(html: string, resolvedUrl: string): ExtractedPageData {
  const title = firstTag(html, "title");
  const h1 = firstTag(html, "h1");
  const headings = [...html.matchAll(/<\s*h[2-3]\b[^>]*>([\s\S]*?)<\s*\/\s*h[2-3]\s*>/gi)].map(match => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30);
  const canonical = html.match(/<link\b[^>]*rel\s*=\s*["']?canonical["']?[^>]*href\s*=\s*["']([^"']+)["'][^>]*>|<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']?canonical["']?[^>]*>/i);
  const canonicalUrl = canonical ? (canonical[1] || canonical[2] || null) : null;
  const robots = metaContent(html, "robots");
  const indexability = robots?.toLowerCase().includes("noindex") ? "noindex" : "indexable";
  const pageType = SitePageTypeSchema.parse(classifySitePage(resolvedUrl, title, h1));
  return { title, h1, metaDescription: metaContent(html, "description"), canonical: canonicalUrl, robots, headings, pageType, indexability };
}

export function normalizeCandidateText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

const STOP_WORDS = new Set("a o os as um uma uns umas de da do das dos e em no na nos nas para por com sem ao aos à às que como sua seu suas seus muito mais menos sobre entre até ou se é ser são do site página paginas artigo artigos clínica clinica contato menu home início inicio leia veja saiba nós nos nossa nosso".split(" "));
const GENERIC_HEADINGS = new Set(["saiba mais", "leia mais", "clique aqui", "conclusão", "conclusao", "contato", "fale conosco", "menu", "home", "início", "inicio"]);

function phraseIsUseful(value: string): boolean {
  const normalized = normalizeCandidateText(value);
  if (!normalized || GENERIC_HEADINGS.has(normalized) || normalized.length < 5 || normalized.length > 120) return false;
  if (/^https?\b/.test(normalized)) return false;
  const meaningfulWords = normalized.split(" ").filter(word => word.length >= 3 && !STOP_WORDS.has(word));
  return meaningfulWords.length >= 2;
}

export function candidateTerms(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ").replace(/\s+[|·—–-]\s+/g, " | ").trim();
  if (!normalized) return [];
  const segments = [normalized, ...normalized.split(/\s*[|:؛]\s*/).map(item => item.trim())];
  return segments.filter(phraseIsUseful).filter((term, index, all) => all.findIndex(item => normalizeCandidateText(item) === normalizeCandidateText(term)) === index).slice(0, 3);
}

export function candidateConfidence(score: number): "high" | "medium" | "low" {
  return score >= 0.85 ? "high" : score >= 0.65 ? "medium" : "low";
}

export function inferPrimaryKeywordSignal(entries: Array<{ text: string; sourceField: SiteKeywordSourceField }>): { normalizedText: string | null; confidence: "high" | "medium" | "low" } {
  const evidence = new Map<string, { text: string; fields: Set<SiteKeywordSourceField> }>();
  for (const entry of entries) {
    if (!("title h1 slug".split(" ").includes(entry.sourceField))) continue;
    const normalizedText = normalizeCandidateText(entry.text);
    const words = normalizedText.split(" ").filter(Boolean);
    if (!normalizedText || words.length < 2 || words.length > 8) continue;
    const current = evidence.get(normalizedText) || { text: entry.text, fields: new Set<SiteKeywordSourceField>() };
    current.fields.add(entry.sourceField);
    evidence.set(normalizedText, current);
  }
  const best = [...evidence.entries()].sort((a, b) => b[1].fields.size - a[1].fields.size || b[0].length - a[0].length)[0];
  const fieldCount = best?.[1].fields.size || 0;
  return { normalizedText: fieldCount >= 2 ? best[0] : null, confidence: fieldCount >= 3 ? "high" : fieldCount >= 2 ? "medium" : "low" };
}

export function candidateRole(sourceField: SiteKeywordSourceField, text: string, entry: { normalizedUrl: string }, isPrimary: boolean): SiteKeywordSuggestedRole {
  if (isPrimary && ["title", "h1", "slug"].includes(sourceField)) return "possible_primary";
  if (["title", "h1", "slug"].includes(sourceField)) return "possible_secondary";
  if (sourceField === "heading" || sourceField === "meta_description") return "supporting_keyword";
  void text; void entry;
  return "unclassified";
}

export function slugCoherenceFromFields(fields: SiteKeywordSourceField[]): SiteKeywordSlugCoherence {
  const structural = new Set(fields.filter(field => ["slug", "h1", "title"].includes(field)));
  if (structural.size >= 3) return "high";
  if (structural.size === 2) return "medium";
  if (structural.size === 1) return "low";
  return "unknown";
}
