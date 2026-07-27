import "server-only";
import { lookup } from "node:dns/promises";
import { assertAllowedExternalUrl, isBlockedExternalHost } from "./site-security.ts";
import { normalizeSiteUrl } from "./site-domain.ts";
import { parseSitemapXml, type ParsedSitemap } from "./site-parser.ts";

export class SiteFetchError extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(message: string, code = "site_fetch_error", status: number | null = null) { super(message); this.name = "SiteFetchError"; this.code = code; this.status = status; }
}

async function assertDnsSafe(hostname: string): Promise<void> {
  if (isBlockedExternalHost(hostname)) throw new SiteFetchError("O domínio resolve para uma rede local ou reservada.", "ssrf_blocked");
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(address => isBlockedExternalHost(address.address))) throw new SiteFetchError("O domínio resolve para uma rede local ou reservada.", "ssrf_blocked");
  } catch (error) {
    if (error instanceof SiteFetchError) throw error;
    throw new SiteFetchError("Não foi possível resolver o domínio autorizado.", "dns_failed");
  }
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) throw new SiteFetchError("A resposta excede o limite de segurança.", "response_too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new SiteFetchError("A resposta excede o limite de segurança.", "response_too_large"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

export async function fetchAuthorizedText(rawUrl: string, primaryHost: string, kind: "xml" | "html") {
  let current = assertAllowedExternalUrl(normalizeSiteUrl(rawUrl), primaryHost);
  const maxRedirects = 3;
  const maxBytes = kind === "xml" ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
  const acceptedTypes = kind === "xml" ? ["xml", "text/plain"] : ["text/html", "application/xhtml+xml"];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertDnsSafe(current.hostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { accept: kind === "xml" ? "application/xml,text/xml,text/plain;q=0.8" : "text/html,application/xhtml+xml;q=0.9" } });
    } catch (error) {
      if (error instanceof SiteFetchError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new SiteFetchError("A requisição excedeu o tempo limite.", "timeout");
      throw new SiteFetchError("Não foi possível acessar o endereço autorizado.", "network_error");
    } finally { clearTimeout(timeout); }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SiteFetchError("Redirect sem destino.", "redirect_invalid", response.status);
      if (redirectCount === maxRedirects) throw new SiteFetchError("Quantidade máxima de redirects excedida.", "redirect_limit", response.status);
      current = assertAllowedExternalUrl(new URL(location, current).toString(), primaryHost);
      continue;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!acceptedTypes.some(type => contentType.includes(type))) throw new SiteFetchError(`Content-Type não permitido: ${contentType || "ausente"}.`, "content_type_invalid", response.status);
    const text = await readLimitedText(response, maxBytes);
    return { response, finalUrl: current.toString(), contentType, text };
  }
  throw new SiteFetchError("Não foi possível acessar o endereço.", "redirect_limit");
}

export async function crawlAuthorizedSitemap(rootUrl: string, primaryHost: string, limits = { maxDepth: 2, maxSitemaps: 20, maxUrls: 10000 }) {
  const visited = new Set<string>();
  const urls = new Map<string, { url: string; lastmod: string | null; sourceSitemapUrl: string }>();
  const processed: Array<{ url: string; kind: ParsedSitemap["kind"]; count: number }> = [];
  const errors: Array<{ url: string; message: string }> = [];

  const visit = async (rawUrl: string, depth: number): Promise<void> => {
    const normalized = normalizeSiteUrl(rawUrl);
    if (visited.has(normalized)) return;
    if (depth > limits.maxDepth || visited.size >= limits.maxSitemaps) { errors.push({ url: normalized, message: "Limite de profundidade ou quantidade de sitemaps atingido." }); return; }
    visited.add(normalized);
    try {
      const fetched = await fetchAuthorizedText(normalized, primaryHost, "xml");
      if (!fetched.response.ok) throw new SiteFetchError(`Sitemap respondeu HTTP ${fetched.response.status}.`, "http_error", fetched.response.status);
      const parsed = parseSitemapXml(fetched.text);
      processed.push({ url: fetched.finalUrl, kind: parsed.kind, count: parsed.items.length });
      for (const item of parsed.items) {
        const itemUrl = normalizeSiteUrl(item.url);
        if (parsed.kind === "sitemapindex") await visit(itemUrl, depth + 1);
        else if (urls.size < limits.maxUrls) {
          try {
            const authorizedUrl = assertAllowedExternalUrl(itemUrl, primaryHost).toString();
            urls.set(authorizedUrl, { url: authorizedUrl, lastmod: item.lastmod, sourceSitemapUrl: fetched.finalUrl });
          } catch (error) {
            errors.push({ url: itemUrl, message: error instanceof Error ? error.message : "URL de página não autorizada." });
          }
        }
      }
    } catch (error) { errors.push({ url: normalized, message: error instanceof Error ? error.message : "Falha ao ler sitemap." }); }
  };

  await visit(rootUrl, 0);
  return { urls: [...urls.values()], processed, errors, visitedCount: visited.size };
}
