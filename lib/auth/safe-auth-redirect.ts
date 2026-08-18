const DEFAULT_AUTH_REDIRECT = "/conta";

/** Accepts only a same-origin application path; never a complete or protocol-relative URL. */
export function safeAuthRedirect(value: string | null | undefined, fallback = DEFAULT_AUTH_REDIRECT): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const parsed = new URL(value, "http://minerador-key.local");
    if (parsed.origin !== "http://minerador-key.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
