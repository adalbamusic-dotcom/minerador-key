import { isLegacyPublishedStatus } from "./editorial-status.ts";

/**
 * Registro das tentativas de sobrescrever o endereco de uma publicada.
 *
 * Gravado pelo gatilho `minerador_keywords_trava_identidade_publicada`
 * (20260921050000), que congela slug e URLs da keyword publicada e anota o
 * que se tentou escrever. Fica FORA da assinatura do pacote aprovado: numa
 * tentativa bloqueada nada mudou, e derrubar a aprovacao por causa dela
 * repetiria o problema que o esquema v3 existe para resolver.
 */
export const PUBLICATION_IDENTITY_LOCK_HISTORY_KEY = "publication_identity_lock_history" as const;

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
  siteRole?: string | null;
  siloPath?: string | null;
  /**
   * URL congelada como canônica no ato da declaração de publicação.
   *
   * O canonical lido da página pode mudar depois; o que a marca declarou
   * como endereço desta keyword, não. Só é gravado ao confirmar.
   */
  canonicalUrl?: string | null;
};

export type PublicationLinkView = {
  state: PublicationLinkState;
  label: string;
  url: string | null;
  relation: string | null;
  technicalVerification: boolean;
  action: Extract<PublicationLinkAction, "confirm" | "correct_legacy" | "unlink"> | null;
  /** `silo` | `article` | … quando a conferência derivou o papel da página. */
  siteRole: string | null;
  siloPath: string | null;
  /** Canônico declarado na confirmação; `null` enquanto não há publicação. */
  canonicalUrl: string | null;
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

/**
 * Lê a evidência de publicação tolerando o formato serializado.
 *
 * Em 2026-09-21 descobriu-se que "Processar lógica" gravava `site_origin`
 * como **string JSON**. Esta função devolvia `null`, e com ela caíam a
 * publicação na tela, o canônico e — o que importa de verdade — a proteção
 * contra exclusão, que pergunta por aqui se a keyword está publicada.
 *
 * O motor foi corrigido e há script de reparo, mas a leitura passa a aceitar
 * as duas formas de propósito: **uma trava que se desliga porque o dado
 * mudou de forma não é trava.** Ler não repara nada no banco; só se recusa a
 * confundir "ilegível" com "não existe".
 */
export function readSiteOrigin(semantic: Record<string, unknown> | null | undefined): PublicationLinkEvidence | null {
  const origin = semantic?.site_origin;
  if (origin && typeof origin === "object" && !Array.isArray(origin)) return origin as PublicationLinkEvidence;
  if (typeof origin === "string" && origin.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(origin);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as PublicationLinkEvidence;
    } catch {
      // Texto que não volta a ser objeto não vira evidência inventada.
    }
  }
  return null;
}

/**
 * Rótulo da relação entre a keyword e a URL publicada.
 *
 * `"undefined"` é valor LEGÍTIMO do contrato (`KeywordUrlRelationshipSchema`):
 * quer dizer "relação não definida", e o Arquiteto o consome assim. Não é
 * vazamento de `undefined` do JavaScript, e trocá-lo por `null` na gravação
 * mudaria o que o Arquiteto recebe.
 *
 * O que não pode é chegar à tela como está. Em 2026-09-21 o Perfil mostrava
 * "Papel atual: undefined" para as duas publicadas, porque interpolava o
 * valor de fio. Sem rótulo, devolve `null` e o campo simplesmente não
 * aparece — que é o certo quando não há relação a declarar.
 */
export function keywordUrlRelationLabel(relation: string | null | undefined): string | null {
  switch (relation) {
    case "confirmed_primary": return "Principal confirmada";
    case "confirmed_secondary": return "Secundária confirmada";
    case "candidate_primary": return "Principal candidata";
    case "likely_support": return "Apoio provável";
    case "mentioned_in_content": return "Mencionada no conteúdo";
    default: return null;
  }
}

export function readPublicationLink(input: { status?: string | null; evidence?: PublicationLinkEvidence | null }): PublicationLinkView {
  const evidence = input.evidence || null;
  return {
    ...readPublicationLinkBase(input),
    siteRole: text(evidence?.siteRole),
    siloPath: text(evidence?.siloPath),
    canonicalUrl: text(evidence?.canonicalUrl),
  };
}

function readPublicationLinkBase(input: { status?: string | null; evidence?: PublicationLinkEvidence | null }): Omit<PublicationLinkView, "siteRole" | "siloPath" | "canonicalUrl"> {
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
      ? { publicationConfirmedBy: input.actorId, publicationConfirmedAt: input.changedAt, relationConfirmedBy: input.actorId, relationConfirmedAt: input.changedAt, canonicalUrl: actualUrl(origin) }
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
