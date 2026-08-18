import { safeAuthRedirect } from "./safe-auth-redirect.ts";

function configuredBaseUrl() {
  const raw = process.env.APP_BASE_URL?.trim();
  if (!raw) throw new Error("APP_BASE_URL_MISSING");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("APP_BASE_URL_INVALID");
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("APP_BASE_URL_INVALID");
  }
  if (process.env.NODE_ENV === "production" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("APP_BASE_URL_LOCALHOST_IN_PRODUCTION");
  }
  return parsed.origin;
}

function safeConfiguredPath(path: string) {
  const safePath = safeAuthRedirect(path, "");
  if (!safePath) throw new Error("APP_BASE_URL_PATH_INVALID");
  return safePath;
}

/** Builds the only entry point for a transaction that must start in isolation. */
export function buildIsolatedAuthEntryUrl(continuePath: string) {
  const safeContinue = safeAuthRedirect(continuePath, "");
  if (!safeContinue) throw new Error("ISOLATED_AUTH_CONTINUE_INVALID");

  const entry = new URL("/auth/new-slot", configuredBaseUrl());
  entry.searchParams.set("next", safeContinue);
  return entry.toString();
}

/** Builds an ordinary internal application URL from the configured server base. */
export function buildConfiguredAppUrl(path: string) {
  return new URL(safeConfiguredPath(path), configuredBaseUrl()).toString();
}
