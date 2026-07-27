const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeSiteUrl(value: string): string {
  const input = value.trim();
  if (!input) return "";

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(candidate);

  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new Error("Informe um endereço http ou https.");
  }

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  const normalized = url.toString();
  return normalized.endsWith("/") && url.pathname === "/" && !url.search ? normalized.slice(0, -1) : normalized;
}

export function validateSiteUrl(value: string): { ok: true; value: string } | { ok: false; message: string } {
  try {
    return { ok: true, value: normalizeSiteUrl(value) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Endereço de site inválido." };
  }
}
