const SLOT_PREFIX = "s-";
const SLOT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function configuredRootDomain(): string | null {
  const value = process.env.SESSION_SLOT_ROOT_DOMAIN || process.env.NEXT_PUBLIC_SESSION_SLOT_ROOT_DOMAIN;
  const domain = value ? normalizeHostname(value) : "";
  return domain && !domain.includes("/") && !domain.includes(":") ? domain : null;
}

export function isValidSessionSlotId(value: string): boolean {
  return SLOT_ID_PATTERN.test(value);
}

export function parseSessionSlotHost(hostname: string): string | null {
  const host = normalizeHostname(hostname);
  const suffixes = [".localhost", ...(configuredRootDomain() ? [`.${configuredRootDomain()}`] : [])];
  const suffix = suffixes.find(candidate => host.endsWith(candidate));
  if (!suffix) return null;
  const label = host.slice(0, -suffix.length);
  if (!label.startsWith(SLOT_PREFIX)) return null;
  const slot = label.slice(SLOT_PREFIX.length);
  return isValidSessionSlotId(slot) ? slot : null;
}

export function sessionSlotBaseHostname(hostname: string): string {
  const host = normalizeHostname(hostname);
  const slot = parseSessionSlotHost(host);
  if (!slot) return host;
  return host.endsWith(".localhost") ? "localhost" : configuredRootDomain() || host;
}

export function buildSessionSlotOrigin(requestUrl: string, slotId: string): string {
  if (!isValidSessionSlotId(slotId)) throw new Error("Identificador de slot inválido.");
  const current = new URL(requestUrl);
  const baseHostname = sessionSlotBaseHostname(current.hostname);
  if (baseHostname === "localhost") {
    current.hostname = `${SLOT_PREFIX}${slotId}.localhost`;
  } else {
    const root = configuredRootDomain();
    if (!root || baseHostname !== root) throw new Error("Host não configurado para slots de sessão.");
    current.hostname = `${SLOT_PREFIX}${slotId}.${root}`;
  }
  current.pathname = "/";
  current.search = "";
  current.hash = "";
  return current.origin;
}

export function createSessionSlotId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}
