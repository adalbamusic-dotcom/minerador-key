import { isLegacyPublishedStatus } from "./editorial-status.ts";

export type PublicationLinkState = "free" | "candidate" | "verified" | "published" | "legacy_unverified";

export type PublicationLinkAction = "confirm" | "correct_legacy" | "unlink";

export type PublicationLinkEvidence = Record<string, unknown> & {
  brandId?: string | null;
  catalogEntryId?: string | null;
  sourceUrl?: string | null;
  resolvedUrl?: string | null;
  declaredCanonicalUrl?: string | null;
  urlSituation?: string | null;
  publicationStatus?: string | null;
  keywordUrlRelation?: string | null;
  relationConfirmedBy?: string | null;
  relationConfirmedAt?: string | null;
  lastCheckedAt?: string | null;
  publicationConfirmedBy?: string | null;
  publicationConfirmedAt?: string | null;
  publicationCorrectedBy?: string | null;
  publicationCorrectedAt?: string | null;
  publicationUnlinkedBy?: string | null;
  publicationUnlinkedAt?: string | null;
};

export type PublicationLinkView = {
  state: PublicationLinkState;
  label: string;
  url: string | null;
  relation: string | null;
  technicalVerification: boolean;
  action: Extract<PublicationLinkAction, "confirm" | "correct_legacy" | "unlink"> | null;
};

const TECHNICALLY_VERIFIED_URL_STATES = new Set([
  "accessible",
  "canonical_confirmed",
  "canonical_missing",
  "canonical_conflict",
  "noindex",
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasUrl(evidence: PublicationLinkEvidence | null | undefined): boolean {
  return Boolean(text(evidence?.resolvedUrl) || text(evidence?.sourceUrl) || text(evidence?.declaredCanonicalUrl));
}

function hasCheckedAt(evidence: PublicationLinkEvidence | null | undefined): boolean {
  return Boolean(text(evidence?.lastCheckedAt) || text(evidence?.verifiedAt) || text(evidence?.lastVerifiedAt));
}

function isTechnicalVerification(evidence: PublicationLinkEvidence | null | undefined): boolean {
  return Boolean(
    hasUrl(evidence)
      && hasCheckedAt(evidence)
      && TECHNICALLY_VERIFIED_URL_STATES.has(String(evidence?.urlSituation || "").toLowerCase()),
  );
}

function isHumanPublicationConfirmation(evidence: PublicationLinkEvidence | null | undefined): boolean {
  return Boolean(
    text(evidence?.publicationConfirmedBy)
      && text(evidence?.publicationConfirmedAt),
  );
}

function actualUrl(evidence: PublicationLinkEvidence | null | undefined): string | null {
  return text(evidence?.declaredCanonicalUrl) || text(evidence?.resolvedUrl) || text(evidence?.sourceUrl);
}

export function readSiteOrigin(semantic: Record<string, unknown> | null | undefined): PublicationLinkEvidence | null {
  const origin = semantic?.site_origin;
  return origin && typeof origin === "object" && !Array.isArray(origin)
    ? origin as PublicationLinkEvidence
    : null;
}

export function readPublicationLink(input: { status?: string | null; evidence?: PublicationLinkEvidence | null }): PublicationLinkView {
  const evidence = input.evidence || null;
  const publicationStatus = String(evidence?.publicationStatus || "").toLowerCase();
  const technicallyVerified = isTechnicalVerification(evidence);
  const publicationCorrected = Boolean(text(evidence?.publicationCorrectedAt));
  const publicationUnlinked = Boolean(text(evidence?.publicationUnlinkedAt));
  const formallyPublished = publicationStatus === "published"
    && technicallyVerified
    && !publicationCorrected
    && !publicationUnlinked
    && isHumanPublicationConfirmation(evidence);
  const publicationMarkerCleared = publicationCorrected || publicationUnlinked;
  const legacyPublishedSignal = isLegacyPublishedStatus(input.status) && !formallyPublished && !publicationMarkerCleared;

  if (formallyPublished) {
    const relation = text(evidence?.keywordUrlRelation);
    return {
      state: "published",
      label: relation === "confirmed_primary" ? "Publicada · Principal" : relation === "confirmed_secondary" ? "Publicada · Secundária" : "Publicada",
      url: actualUrl(evidence),
      relation,
      technicalVerification: true,
      action: "unlink",
    };
  }

  if (legacyPublishedSignal || (isLegacyPublishedStatus(input.status) && !evidence)) {
    return {
      state: "legacy_unverified",
      label: "Publicação não verificada",
      url: actualUrl(evidence),
      relation: text(evidence?.keywordUrlRelation),
      technicalVerification: technicallyVerified,
      action: evidence ? "correct_legacy" : null,
    };
  }

  // Uma correção legada remove a promoção indevida, mas não reaproveita a
  // antiga conferência como confirmação da nova relação. A URL permanece
  // disponível como candidata para uma nova ação explícita de Conferir site.
  if (publicationCorrected) {
    return {
      state: hasUrl(evidence) ? "candidate" : "free",
      label: hasUrl(evidence) ? "Candidata" : "Livre",
      url: actualUrl(evidence),
      relation: text(evidence?.keywordUrlRelation),
      technicalVerification: false,
      action: null,
    };
  }

  if (technicallyVerified) {
    return {
      state: "verified",
      label: "Verificada",
      url: actualUrl(evidence),
      relation: text(evidence?.keywordUrlRelation),
      technicalVerification: true,
      action: "confirm",
    };
  }

  if (hasUrl(evidence)) {
    return {
      state: "candidate",
      label: "Candidata",
      url: actualUrl(evidence),
      relation: text(evidence?.keywordUrlRelation),
      technicalVerification: false,
      action: null,
    };
  }

  return {
    state: "free",
    label: "Livre",
    url: null,
    relation: null,
    technicalVerification: false,
    action: null,
  };
}

/**
 * Protege ações estruturais quando o vínculo formal já foi confirmado ou
 * quando o status legado ainda é `publicado` e a trigger histórica continua
 * sendo a autoridade de compatibilidade do registro.
 */
export function isPublicationProtected(input: { status?: string | null; evidence?: PublicationLinkEvidence | null }): boolean {
  return isLegacyPublishedStatus(input.status)
    || readPublicationLink(input).state === "published";
}

function readPublicationHistory(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>;
}

function sameEvidence(left: PublicationLinkEvidence, right: PublicationLinkEvidence): boolean {
  return String(left.catalogEntryId || "") === String(right.catalogEntryId || "")
    && String(left.sourceUrl || "") === String(right.sourceUrl || "")
    && String(left.brandId || "") === String(right.brandId || "");
}

export function applyPublicationLinkAction(
  semantic: Record<string, unknown> | null | undefined,
  input: { action: PublicationLinkAction; actorId: string; changedAt: string; status?: string | null },
): { semantic: Record<string, unknown>; changed: boolean; reason?: string } {
  const current = { ...(semantic || {}) };
  const origin = readSiteOrigin(current);
  if (!origin) return { semantic: current, changed: false, reason: "Nenhum vínculo de site foi localizado para esta keyword." };

  const currentView = readPublicationLink({ status: input.status, evidence: origin });
  if (input.action === "confirm" && currentView.state !== "verified") {
    return { semantic: current, changed: false, reason: "A publicação só pode ser confirmada depois da verificação técnica da página." };
  }
  if (input.action === "correct_legacy" && currentView.state !== "legacy_unverified") {
    return { semantic: current, changed: false, reason: "A correção só se aplica a uma publicação legada não verificada." };
  }
  if (input.action === "unlink" && currentView.state !== "published") {
    return { semantic: current, changed: false, reason: "Somente uma publicação verificada pode ser desvinculada." };
  }

  const nextRelation = input.action === "confirm"
    ? origin.keywordUrlRelation === "candidate_primary" || origin.suggestedRole === "possible_primary"
      ? "confirmed_primary"
      : origin.keywordUrlRelation || "undefined"
    : input.action === "correct_legacy" && origin.keywordUrlRelation === "confirmed_primary"
      ? "candidate_primary"
      : origin.keywordUrlRelation || "undefined";
  const nextPublicationStatus = input.action === "confirm" ? "published" : "not_confirmed";
  const history = readPublicationHistory(origin.publication_link_history);
  history.push({
    previous: origin.publicationStatus || "not_confirmed",
    next: nextPublicationStatus,
    action: input.action,
    actorId: input.actorId,
    changedAt: input.changedAt,
  });
  const nextOrigin: PublicationLinkEvidence = {
    ...origin,
    publicationStatus: nextPublicationStatus,
    keywordUrlRelation: nextRelation,
    publication_link_history: history,
    ...(input.action === "confirm"
      ? { publicationConfirmedBy: input.actorId, publicationConfirmedAt: input.changedAt, relationConfirmedBy: input.actorId, relationConfirmedAt: input.changedAt }
      : input.action === "correct_legacy"
        ? { publicationCorrectedBy: input.actorId, publicationCorrectedAt: input.changedAt, publicationConfirmedBy: null, publicationConfirmedAt: null, relationConfirmedBy: null, relationConfirmedAt: null }
        : { publicationUnlinkedBy: input.actorId, publicationUnlinkedAt: input.changedAt, publicationConfirmedBy: null, publicationConfirmedAt: null, relationConfirmedBy: null, relationConfirmedAt: null }),
  };
  const previousOrigins = Array.isArray(current.site_origins)
    ? current.site_origins.filter(item => item && typeof item === "object" && !Array.isArray(item)) as PublicationLinkEvidence[]
    : [];
  const origins = previousOrigins.length
    ? previousOrigins.map(item => sameEvidence(item, origin) ? nextOrigin : item)
    : [nextOrigin];
  const nextSemantic = { ...current, site_origin: nextOrigin, site_origins: origins };
  return { semantic: nextSemantic, changed: JSON.stringify(current) !== JSON.stringify(nextSemantic) };
}
