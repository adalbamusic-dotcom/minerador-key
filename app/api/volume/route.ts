import { NextResponse } from "next/server";
import { requireSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { normalizeSeoKeywordResearchResponse, type VolumeLookupResult } from "@/lib/minerador/volume-provider";

const SEO_KEYWORD_RESEARCH_HOST = "seo-keyword-research8.p.rapidapi.com";
const SEO_KEYWORD_RESEARCH_URL = `https://${SEO_KEYWORD_RESEARCH_HOST}/keyword-research`;
const SEO_KEYWORD_RESEARCH_COUNTRY = "br";

function configurationError(message: string, status = 503) {
  return NextResponse.json(
    { success: false, code: "VOLUME_PROVIDER_CONFIGURATION", error: message },
    { status },
  );
}

function normalizeHost(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "").trim();
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function providerErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const value = payload.trim();
    return value ? value.slice(0, 300) : null;
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail", "reason"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
  }
  if (record.data && typeof record.data === "object") return providerErrorMessage(record.data);
  return null;
}

function buildLookupUrl(baseUrl: string, keyword: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("country", SEO_KEYWORD_RESEARCH_COUNTRY);
  return url.toString();
}

export async function POST(request: Request) {
  try {
    await requireSessionProfile();

    const body: unknown = await request.json();
    const rawKeywords = body && typeof body === "object" && "keywords" in body
      ? (body as { keywords?: unknown }).keywords
      : null;
    const keywords: string[] = Array.isArray(rawKeywords)
      ? rawKeywords.filter((keyword: unknown): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
      : [];

    if (keywords.length === 0) {
      return NextResponse.json(
        { success: false, code: "INVALID_VOLUME_REQUEST", error: "Nenhuma palavra-chave fornecida." },
        { status: 400 },
      );
    }

    const apiKey = process.env.RAPIDAPI_KEY?.trim();
    if (!apiKey) return configurationError("RAPIDAPI_KEY não está configurada.");

    const host = normalizeHost(process.env.RAPIDAPI_HOST || SEO_KEYWORD_RESEARCH_HOST);
    const configuredUrl = (process.env.RAPIDAPI_URL || SEO_KEYWORD_RESEARCH_URL).trim();
    let baseUrl: URL;
    try {
      baseUrl = new URL(configuredUrl);
    } catch {
      return configurationError("RAPIDAPI_URL não é uma URL válida.");
    }

    if (host !== SEO_KEYWORD_RESEARCH_HOST || baseUrl.hostname !== SEO_KEYWORD_RESEARCH_HOST || baseUrl.pathname.replace(/\/+$/, "") !== "/keyword-research") {
      return configurationError(
        `Configure o provedor SEO Keyword Research com host ${SEO_KEYWORD_RESEARCH_HOST} e endpoint GET /keyword-research. Nenhuma keyword foi alterada.`,
        422,
      );
    }

    const results: VolumeLookupResult[] = [];
    for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex += 1) {
      const keyword = keywords[keywordIndex];
      const lookupUrl = buildLookupUrl(baseUrl.toString(), keyword);
      try {
        const response = await fetch(lookupUrl, {
          method: "GET",
          headers: {
            "x-rapidapi-key": apiKey,
            "x-rapidapi-host": host,
            Accept: "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });

        const responseText = await response.text();
        const responseJson = parseJson(responseText);
        if (response.status === 429) {
          const measuredAt = new Date().toISOString();
          const notProcessed = keywords.slice(keywordIndex + 1).map((remainingKeyword): VolumeLookupResult => ({
            keyword: remainingKeyword,
            status: "not_processed",
            error: "Não processado.",
            errorCode: "not_processed_quota_exceeded",
            source: "seo-keyword-research8",
            measuredAt,
            match: "none",
          }));
          return NextResponse.json(
            {
              success: false,
              code: "provider_quota_exceeded",
              error: "Não foi possível coletar volume.",
              provider: "seo-keyword-research8",
              data: [
                ...results,
                { keyword, status: "error", error: "Não foi possível coletar volume.", errorCode: "provider_quota_exceeded", source: "seo-keyword-research8", measuredAt, match: "none" },
                ...notProcessed,
              ],
            },
            { status: 429 },
          );
        }
        if (!response.ok) {
          const providerMessage = providerErrorMessage(responseJson);
          results.push({ keyword, status: "error", error: `RapidAPI respondeu HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : "."}` });
          continue;
        }

        const normalized = normalizeSeoKeywordResearchResponse(responseJson, keyword);
        const measurementContext = {
          source: "seo-keyword-research8",
          measuredAt: new Date().toISOString(),
        };
        results.push(normalized.status === "success"
          ? { ...normalized, ...measurementContext, match: "exact" }
          : normalized.status === "not_found"
            ? { ...normalized, ...measurementContext, match: "not_found" }
            : { ...normalized, ...measurementContext, match: "none" });
      } catch (error) {
        const providerMessage = error instanceof Error && error.message ? error.message.slice(0, 300) : null;
        results.push({ keyword, status: "error", error: `Falha de conexão com o provedor de volume${providerMessage ? `: ${providerMessage}` : "."}` });
      }
    }

    return NextResponse.json({ success: true, provider: "seo-keyword-research8", data: results });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    if (mapped.status === 500) console.error("Erro na rota de volume:", error);
    return NextResponse.json(
      { success: false, code: "VOLUME_PROVIDER_REQUEST_FAILED", error: mapped.message || "Erro interno ao processar os volumes." },
      { status: mapped.status },
    );
  }
}
