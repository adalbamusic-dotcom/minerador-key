import type { OperationalPublication, RadarItem } from "../editorial/operational-flow.ts";
import type { PublicationRecord } from "../editorial/operational-contracts.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { RadarHydrationSnapshot } from "./hydration.ts";

export type RadarPublicationView = {
  published: boolean;
  updateAvailable: boolean;
  label: "Publicado e protegido" | "Atualização disponível" | "Ainda não publicado";
  destinationUrl: string | null;
  publishedAt: string | null;
};

export type RadarEditorialIdentity = {
  brandName: string;
  title: string;
  principalKeyword: string | null;
  slug: string;
  canonical: string | null;
  siloName: string | null;
  hierarchy: ArticleDNA["hierarchy"];
  articleDna: VersionEnvelope<ArticleDNA>;
  siloDna: VersionEnvelope<SiloDNA> | null;
  siloPage: VersionEnvelope<SiloPage> | null;
  radarItem: RadarItem;
  hydration: RadarHydrationSnapshot | null;
  publication: RadarPublicationView;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function normalizeIntent(value: string | null | undefined) {
  const normalized = normalize(value || "");
  if (["informativo", "informacional", "informativa"].includes(normalized)) return "Informativa";
  if (["comercial", "transacional"].includes(normalized)) return "Comercial";
  if (["navegacional", "navegacao"].includes(normalized)) return "Navegacional";
  return value?.trim() || "Não informada";
}

function urlOrNull(value: string | null | undefined) {
  if (!value) return null;
  try { return new URL(value).toString(); } catch { return null; }
}

export function resolveRadarPublication(input: {
  legacy?: PublicationRecord | null;
  operational?: OperationalPublication | null;
  keywordPublished?: boolean;
}): RadarPublicationView {
  const published = Boolean(input.keywordPublished || input.legacy?.status === "published" || input.operational?.state === "published");
  const updateAvailable = input.legacy?.status === "update_due" || Boolean(input.operational?.state === "published" && input.operational.updateRequested);
  return {
    published,
    updateAvailable,
    label: updateAvailable ? "Atualização disponível" : published ? "Publicado e protegido" : "Ainda não publicado",
    destinationUrl: published ? urlOrNull(input.operational?.destinationUrl) || urlOrNull(input.legacy?.destination) : null,
    publishedAt: input.operational?.publishedAt || input.legacy?.publishedAt || null,
  };
}

export type RadarComparisonStatus = "Alinhado" | "Parcialmente alinhado" | "Atenção" | "Evidência insuficiente";
export type RadarComparison = {
  intent: { expected: string; observed: string; status: RadarComparisonStatus };
  topics: { expected: string[]; observed: string[]; missing: string[]; status: RadarComparisonStatus };
  overall: RadarComparisonStatus;
};

export function compareStrategyWithSerp(input: {
  expectedIntent: string | null | undefined;
  observedIntent: string | null | undefined;
  expectedTopics: string[];
  observedTopics: string[];
  hasOrganicEvidence: boolean;
}): RadarComparison {
  const expectedIntent = normalizeIntent(input.expectedIntent);
  const observedIntent = input.observedIntent ? normalizeIntent(input.observedIntent) : "Não observada";
  const intentStatus: RadarComparisonStatus = !input.hasOrganicEvidence || observedIntent === "Não observada"
    ? "Evidência insuficiente"
    : expectedIntent === observedIntent ? "Alinhado" : "Atenção";
  const observed = input.observedTopics.map(normalize).filter(Boolean);
  const expected = input.expectedTopics.map(topic => topic.trim()).filter(Boolean);
  const missing = expected.filter(topic => !observed.includes(normalize(topic)));
  const topicsStatus: RadarComparisonStatus = !input.hasOrganicEvidence
    ? "Evidência insuficiente"
    : !expected.length || !observed.length ? "Evidência insuficiente"
      : missing.length === 0 ? "Alinhado" : missing.length < expected.length ? "Parcialmente alinhado" : "Evidência insuficiente";
  const overall: RadarComparisonStatus = intentStatus === "Atenção" ? "Atenção" : intentStatus === "Evidência insuficiente" && topicsStatus === "Evidência insuficiente" ? "Evidência insuficiente" : intentStatus === "Alinhado" && topicsStatus === "Alinhado" ? "Alinhado" : "Parcialmente alinhado";
  return { intent: { expected: expectedIntent, observed: observedIntent, status: intentStatus }, topics: { expected, observed: input.observedTopics, missing, status: topicsStatus }, overall };
}
