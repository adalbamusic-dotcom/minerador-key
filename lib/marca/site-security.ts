const PRIVATE_IPV4_RANGES = [
  /^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^0\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

export function isBlockedExternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (host.startsWith("::ffff:")) return isBlockedExternalHost(host.slice(7));
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") return true;
  if (PRIVATE_IPV4_RANGES.some(pattern => pattern.test(host))) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return false;
}

export function isAuthorizedSiteHost(hostname: string, primaryHost: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const primary = primaryHost.toLowerCase().replace(/^www\./, "");
  return host === primary;
}

export function assertAllowedExternalUrl(raw: string, primaryHost: string): URL {
  const url = new URL(raw);
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("Apenas URLs HTTP e HTTPS são permitidas.");
  if (url.username || url.password) throw new Error("URLs com credenciais não são permitidas.");
  if (isBlockedExternalHost(url.hostname)) throw new Error("O endereço aponta para uma rede local ou reservada.");
  if (!isAuthorizedSiteHost(url.hostname, primaryHost)) throw new Error("O endereço não pertence ao domínio principal da marca.");
  return url;
}
