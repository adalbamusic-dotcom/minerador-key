import type { GoogleAdsServerConfig } from "./config.ts";
import { GoogleAdsError } from "./errors.ts";

type AccessToken = { accessToken: string; expiresAt: number };
type FetchLike = typeof fetch;

const cachedTokens = new Map<GoogleAdsServerConfig, AccessToken>();
const tokenRefreshesInFlight = new Map<GoogleAdsServerConfig, Promise<AccessToken>>();
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

function usable(token: AccessToken | null, now: number) {
  return Boolean(token && token.expiresAt - TOKEN_EXPIRY_MARGIN_MS > now);
}

async function refreshAccessToken(config: GoogleAdsServerConfig, fetchFn: FetchLike): Promise<AccessToken> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });
  let response: Response;
  try {
    response = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new GoogleAdsError("google_ads_timeout", { cause: error, endpoint: "https://oauth2.googleapis.com/token", providerResponseReceived: false, failureType: "OAUTH_TOKEN_ERROR", internalStage: "oauth_token" });
    throw new GoogleAdsError("google_ads_oauth", { cause: error, endpoint: "https://oauth2.googleapis.com/token", providerResponseReceived: false, failureType: "OAUTH_TOKEN_ERROR", internalStage: "oauth_token" });
  }

  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* mapped below */ }
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new GoogleAdsError("google_ads_oauth", { status: response.status || 502, providerHttpStatus: response.status || null, endpoint: "https://oauth2.googleapis.com/token", providerResponseReceived: true, failureType: "OAUTH_TOKEN_ERROR", internalStage: "oauth_token" });
  }
  const accessToken = (payload as { access_token?: unknown }).access_token;
  const expiresIn = (payload as { expires_in?: unknown }).expires_in;
  if (typeof accessToken !== "string" || !accessToken || typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new GoogleAdsError("google_ads_oauth", { status: 502, endpoint: "https://oauth2.googleapis.com/token", providerResponseReceived: true, failureType: "OAUTH_TOKEN_ERROR", internalStage: "oauth_token" });
  }
  return { accessToken, expiresAt: Date.now() + expiresIn * 1_000 };
}

export async function getGoogleAdsAccessToken(options: { config: GoogleAdsServerConfig; fetchFn?: FetchLike; now?: () => number }) {
  const config = options.config;
  const now = options.now || Date.now;
  const cachedToken = cachedTokens.get(config) || null;
  if (cachedToken && usable(cachedToken, now())) return cachedToken.accessToken;
  let refreshInFlight = tokenRefreshesInFlight.get(config);
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(config, options.fetchFn || fetch)
      .then((token) => {
        cachedTokens.set(config, token);
        return token;
      })
      .finally(() => { tokenRefreshesInFlight.delete(config); });
    tokenRefreshesInFlight.set(config, refreshInFlight);
  }
  return (await refreshInFlight).accessToken;
}

export function resetGoogleAdsAccessTokenCacheForTests() {
  cachedTokens.clear();
  tokenRefreshesInFlight.clear();
}
