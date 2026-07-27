export const MINERADOR_EXTENSION_PROTOCOL_VERSION = 2;
export const MINERADOR_LEGACY_EXTENSION_PROTOCOL_VERSION = 1;

const BRAND_REF_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*--[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MineradorPanelConnection = {
  tabId: number;
  origin: string;
  pathname: string;
  module: "minerador";
  protocolVersion: typeof MINERADOR_EXTENSION_PROTOCOL_VERSION;
  extensionVersion?: string;
  actorUserId: string;
  brandId: string;
  brandRef: string;
  brandName: string;
  confirmedAt: string;
  lastPingAt: string;
};

/** Extrai o segmento opaco da rota; nunca converte brandRef em brandId. */
export function extractMineradorBrandRef(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/^\/([^/]+)\/minerador\/?$/i);
    if (!match || !BRAND_REF_PATTERN.test(match[1])) return null;
    return match[1];
  } catch {
    return null;
  }
}

export function isAllowedMineradorPanelUrl(rawUrl: string, configuredPanelUrl?: string): boolean {
  try {
    const url = new URL(rawUrl);
    const localOrigins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
    if (configuredPanelUrl) localOrigins.add(new URL(configuredPanelUrl).origin);
    return localOrigins.has(url.origin) && extractMineradorBrandRef(rawUrl) !== null;
  } catch {
    return false;
  }
}

export function isValidMineradorHandshakeAck(value: unknown, expected: { requestId: string; origin: string; pathname?: string; selectedBrandId: string; selectedBrandRef: string }): value is {
  requestId: string;
  origin: string;
  pathname: string;
  module: "minerador";
  protocolVersion: typeof MINERADOR_EXTENSION_PROTOCOL_VERSION;
  actorUserId: string;
  activeBrandId: string;
  activeBrandRef: string;
  activeBrandName: string;
  authenticated: true;
  accessConfirmed: true;
  timestamp: string;
} {
  if (!value || typeof value !== "object") return false;
  const ack = value as Record<string, unknown>;
  return ack.requestId === expected.requestId
    && ack.origin === expected.origin
    && typeof ack.pathname === "string"
    && (!expected.pathname || ack.pathname === expected.pathname)
    && ack.module === "minerador"
    && ack.protocolVersion === MINERADOR_EXTENSION_PROTOCOL_VERSION
    && ack.ack === true
    && ack.authenticated === true
    && ack.accessConfirmed === true
    && typeof ack.actorUserId === "string"
    && ack.activeBrandId === expected.selectedBrandId
    && ack.activeBrandRef === expected.selectedBrandRef
    && typeof ack.activeBrandName === "string"
    && typeof ack.timestamp === "string"
}
