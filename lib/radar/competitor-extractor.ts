import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { RadarExtractionPageSchema, type RadarExtractionPage } from "./analysis-contracts.ts";

const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const STOP_WORDS = new Set("a ao aos as com como da das de do dos e em para por que se sem no na nos nas um uma uns umas o os ou este esta isso e sao seu sua seus suas pela pelas pelo pelos nao mais menos muito cada entre sobre ate tambem ja foi ser artigo conteudo guia fazer onde quando porque".split(/\s+/));

export class CompetitorExtractionError extends Error {
  readonly code: "invalid_url" | "private_destination" | "redirect_limit" | "timeout" | "invalid_content_type" | "invalid_html" | "fetch_failed";
  readonly status: number;
  constructor(code: CompetitorExtractionError["code"], message: string, status = 422) {
    super(message);
    this.name = "CompetitorExtractionError";
    this.code = code;
    this.status = status;
  }
}

function privateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function privateIpv6(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

export function validateExternalUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CompetitorExtractionError("invalid_url", "A URL do concorrente e invalida.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new CompetitorExtractionError("invalid_url", "Somente URLs HTTP e HTTPS podem ser extraidas.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "local" || hostname.endsWith(".local") || hostname === "metadata.google.internal") throw new CompetitorExtractionError("private_destination", "A URL aponta para um destino local ou reservado.");
  const kind = isIP(hostname);
  if ((kind === 4 && privateIpv4(hostname)) || (kind === 6 && privateIpv6(hostname))) throw new CompetitorExtractionError("private_destination", "IPs privados, loopback e reservados nao podem ser extraidos.");
  url.username = "";
  url.password = "";
  return url;
}

async function assertResolvedDestination(url: URL, lookupImpl: typeof lookup) {
  if (isIP(url.hostname)) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookupImpl(url.hostname, { all: true }) as Array<{ address: string }>;
  } catch {
    throw new CompetitorExtractionError("private_destination", "Nao foi possivel validar o destino DNS do concorrente.");
  }
  if (addresses.some(entry => (isIP(entry.address) === 4 && privateIpv4(entry.address)) || (isIP(entry.address) === 6 && privateIpv6(entry.address)))) throw new CompetitorExtractionError("private_destination", "O dominio resolve para um IP privado ou reservado.");
}

function attr(tag: string, name: string) {
  const found = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return found?.[1]?.trim() || "";
}

function stripMarkup(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--([\s\S]*?)-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

function tags(html: string, name: string) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi"))].map(match => stripMarkup(match[1] || "")).filter(Boolean);
}

function canonicalUrl(html: string, base: URL) {
  const tag = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i);
  if (!tag) return null;
  try {
    return new URL(attr(tag[0], "href"), base).toString();
  } catch {
    return null;
  }
}

function extractTerms(pageId: string, body: string) {
  const counts = new Map<string, number>();
  const words = body.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-zà-ÿ]{4,}/gi) || [];
  for (const word of words) {
    const term = word.toLocaleLowerCase("pt-BR");
    if (!STOP_WORDS.has(term)) counts.set(term, (counts.get(term) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([term, frequency]) => ({ term, frequency, pageCount: 1, sources: ["body" as const], pageIds: [pageId] }));
}

function parseStructuredData(html: string) {
  return [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
    try {
      const parsed = JSON.parse(match[1] || "{}");
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }).flatMap(item => typeof item === "object" && item ? [String((item as Record<string, unknown>)["@type"] || "").trim()] : []).filter(Boolean);
}

async function readBody(response: Response) {
  const reader = response.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_HTML_BYTES) throw new CompetitorExtractionError("invalid_html", "A pagina excedeu o tamanho maximo permitido.");
      chunks.push(part.value);
    }
  } else {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_HTML_BYTES) throw new CompetitorExtractionError("invalid_html", "A pagina excedeu o tamanho maximo permitido.");
    chunks.push(buffer);
  }
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

export async function extractCompetitorPage(rawUrl: string, options: { fetchImpl?: typeof fetch; lookupImpl?: typeof lookup; timeoutMs?: number; now?: string } = {}): Promise<RadarExtractionPage> {
  const fetchImpl = options.fetchImpl || fetch;
  const lookupImpl = options.lookupImpl || lookup;
  let current = validateExternalUrl(rawUrl);
  let response: Response | null = null;
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertResolvedDestination(current, lookupImpl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
      try {
        response = await fetchImpl(current, { method: "GET", redirect: "manual", headers: { Accept: "text/html,application/xhtml+xml" }, signal: controller.signal, cache: "no-store" });
      } catch {
        if (controller.signal.aborted) throw new CompetitorExtractionError("timeout", "A pagina concorrente excedeu o timeout.", 504);
        throw new CompetitorExtractionError("fetch_failed", "Nao foi possivel buscar a pagina concorrente.", 502);
      } finally {
        clearTimeout(timer);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) throw new CompetitorExtractionError("redirect_limit", "A pagina excedeu o limite de redirects permitido.");
        current = validateExternalUrl(new URL(location, current).toString());
        continue;
      }
      break;
    }
    if (!response) throw new CompetitorExtractionError("fetch_failed", "Nenhuma resposta foi recebida.", 502);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new CompetitorExtractionError("invalid_content_type", "A resposta nao e HTML compativel.");
    const html = await readBody(response);
    if (!/<html\b|<body\b/i.test(html)) throw new CompetitorExtractionError("invalid_html", "A resposta nao contem HTML reconhecivel.");
    const body = stripMarkup(html);
    const pageId = `competitor:${Buffer.from(current.toString()).toString("base64url").slice(0, 32)}`;
    const h1 = tags(html, "h1");
    const h2 = tags(html, "h2");
    const h3 = tags(html, "h3");
    const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].flatMap(match => {
      try {
        const url = new URL(match[1], current);
        return ["http:", "https:"].includes(url.protocol) ? [url] : [];
      } catch {
        return [];
      }
    });
    const internalLinkCount = links.filter(url => url.hostname === current.hostname).length;
    return RadarExtractionPageSchema.parse({
      id: pageId,
      url: current.toString(),
      status: h1.length && body.length > 200 ? "success" : "partial",
      fetchedAt: options.now || new Date().toISOString(),
      title: tags(html, "title")[0] || "",
      metaDescription: attr(html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i)?.[0] || "", "content"),
      canonical: canonicalUrl(html, current),
      h1, h2, h3,
      wordCount: body.split(/\s+/).filter(Boolean).length,
      internalLinkCount,
      externalLinkCount: links.length - internalLinkCount,
      listCount: tags(html, "ul").length + tags(html, "ol").length,
      tableCount: tags(html, "table").length,
      faqCount: tags(html, "details").length + (body.match(/\?/g) || []).length,
      imageCount: [...html.matchAll(/<img\b/gi)].length,
      blockquoteCount: tags(html, "blockquote").length,
      comparisonCount: (body.match(/compar|versus|\bvs\b/gi) || []).length,
      hasDates: /\b20\d{2}\b|\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/.test(body),
      author: attr(html.match(/<meta\b[^>]*name\s*=\s*["']author["'][^>]*>/i)?.[0] || "", "content") || null,
      structuredDataTypes: parseStructuredData(html),
      recurringTerms: extractTerms(pageId, body),
      boldCount: tags(html, "strong").length + tags(html, "b").length,
      italicCount: tags(html, "em").length + tags(html, "i").length,
      error: null,
    });
  } catch (error) {
    if (error instanceof CompetitorExtractionError) throw error;
    throw new CompetitorExtractionError("fetch_failed", "Falha nao classificada na extracao.", 502);
  }
}
