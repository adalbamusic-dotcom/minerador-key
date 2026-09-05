import { isTenantId } from "./tenant-routing.ts";

const AGENCY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ParsedAgencyRef {
  agencySlug: string;
  agencyId: string;
}

export function normalizeAgencyRefSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildAgencyRef(agencyName: string, agencyId: string): string {
  if (!isTenantId(agencyId)) throw new Error("agencyId inválido.");
  const agencySlug = normalizeAgencyRefSlug(agencyName);
  if (!AGENCY_SLUG_PATTERN.test(agencySlug)) throw new Error("Nome de agência não produz slug válido.");
  return `${agencySlug}--${agencyId}`;
}

export function parseAgencyRef(agencyRef: string): ParsedAgencyRef {
  const delimiter = agencyRef.lastIndexOf("--");
  if (delimiter <= 0) throw new Error("agencyRef inválido.");
  const agencySlug = agencyRef.slice(0, delimiter);
  const agencyId = agencyRef.slice(delimiter + 2);
  if (!AGENCY_SLUG_PATTERN.test(agencySlug) || !isTenantId(agencyId)) {
    throw new Error("agencyRef inválido.");
  }
  return { agencySlug, agencyId };
}
