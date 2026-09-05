import { z } from "zod";
import type { SiloDNA, SiloPage } from "./contracts.ts";
import { TerritoryRefSchema } from "./territory-ref.ts";

/**
 * GATE PRÓPRIO DE APROVAÇÃO DA SILOPAGE — último blocker de domínio da 2C.
 *
 * SiloDNA aprovado NÃO aprova SiloPage. São artefatos distintos com decisões
 * distintas: o SiloDNA é a arquitetura (quem é Pilar, quem é Suporte, qual a
 * fronteira), a SiloPage é a página publicável (slug, canonical, H1, seções).
 * Aprovar a arquitetura não é aprovar o texto que vai ao ar, e reaproveitar a
 * decisão de consolidação para as duas coisas faria uma decisão valer por duas.
 *
 * Antes deste módulo, `siloPageStatus='approved'` era fail-closed em
 * `refuseStatusEscalation` porque não havia com o que conferir. Agora existe.
 *
 * NADA aqui é decidido por IA, e nenhum campo novo foi criado onde um contrato
 * existente já servia: a decisão reusa a forma de `HumanPillarSelection` e de
 * `SiloConsolidationDecision` (actorUserId, decidedAt, reason, e a identidade
 * sobre a qual se decidiu), e a estrutura conferida é a do `SiloPageSchema`.
 */

export const SILO_PAGE_APPROVAL_BLOCKERS = [
  "SILO_PAGE_APPROVAL_NOT_HUMAN",
  "SILO_PAGE_APPROVAL_STALE",
  "SILO_PAGE_APPROVAL_BRAND_MISMATCH",
  "SILO_PAGE_APPROVAL_TERRITORY_MISMATCH",
  "SILO_PAGE_APPROVAL_SILO_MISMATCH",
  "SILO_PAGE_APPROVAL_SILO_DNA_REF_MISMATCH",
  "SILO_PAGE_APPROVAL_STRUCTURE_INCOMPLETE",
  "SILO_PAGE_APPROVAL_SLUG_MISSING",
  "SILO_PAGE_APPROVAL_CANONICAL_MISSING",
  "SILO_PAGE_APPROVAL_PUBLISHED_URL_MISSING",
  "SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED",
  "SILO_PAGE_APPROVAL_PILLAR_MISMATCH",
  "SILO_PAGE_APPROVAL_SUPPORTS_MISMATCH",
  "SILO_PAGE_APPROVAL_PUBLISHED_IDENTITY_MUTATED",
] as const;
export type SiloPageApprovalBlockerCode = (typeof SILO_PAGE_APPROVAL_BLOCKERS)[number];

export type SiloPageApprovalBlocker = { code: SiloPageApprovalBlockerCode; detail: string };

/**
 * Decisão humana de aprovação DA PÁGINA.
 *
 * `siloPageVersionId` e `siloPageContentHash` existem para o mesmo motivo de
 * `decidedOverArticleIds` no Pilar: aprovar a versão A e persistir a versão B é
 * o defeito clássico. `siloDnaVersionId` amarra a página ao DNA que ela
 * materializa — sem isso, uma página aprovada sobre um DNA antigo continuaria
 * aprovada depois que a arquitetura mudasse.
 */
export const SiloPageApprovalDecisionSchema = z.object({
  actorUserId: z.string().min(1),
  decidedAt: z.string().min(1),
  reason: z.string().min(1),
  scope: z.literal("silo_page_approval"),
  siloPageId: z.string().min(1),
  siloPageVersionId: z.string().min(1),
  siloPageContentHash: z.string().min(1),
  siloDnaVersionId: z.string().min(1),
  territoryRef: TerritoryRefSchema,
}).strict();
export type SiloPageApprovalDecision = z.infer<typeof SiloPageApprovalDecisionSchema>;

export type SiloPageApprovalReadiness =
  | { state: "approved"; blockers: [] }
  | { state: "blocked"; blockers: SiloPageApprovalBlocker[] };

const sameSet = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());

/** Verificações que provam que a URL publicada é mesmo aquela página. */
const RESOLVED_PUBLICATION_STATUSES = ["canonical_confirmed", "accessible", "sitemap_match"] as const;

export type SiloPageApprovalInput = {
  brandId: string;
  territoryRef: string;
  siloId: string;
  siloPage: SiloPage;
  /** Envelope da página sobre a qual a decisão foi tomada. */
  siloPageVersion: { versionId: string; contentHash: string };
  siloDna: SiloDNA;
  siloDnaVersion: { versionId: string };
  /** Página publicada vigente, quando existir. Identidade é preservada. */
  publishedPage?: Pick<SiloPage, "slug" | "canonical" | "publishedUrl" | "publicationStatus"> | null;
  decision: SiloPageApprovalDecision | null | undefined;
  /** IA nunca aprova. Só `"human"` passa. */
  actor: "human" | "ai" | "system";
};

/**
 * FAIL-CLOSED: qualquer coisa que não seja uma decisão humana íntegra sobre
 * exatamente esta versão da página, coerente com a Brand, o Território, o Silo
 * e o SiloDNA pareado, bloqueia a aprovação.
 */
export function resolveSiloPageApprovalReadiness(input: SiloPageApprovalInput): SiloPageApprovalReadiness {
  const blockers: SiloPageApprovalBlocker[] = [];
  const { siloPage, siloDna, decision } = input;

  // ------------------------------------------------------- decisão humana
  if (input.actor !== "human" || !decision) {
    blockers.push({
      code: "SILO_PAGE_APPROVAL_NOT_HUMAN",
      detail: !decision ? "sem decisão registrada" : `actor=${input.actor}`,
    });
    // Sem decisão não há o que conferir contra ela; o resto da estrutura ainda é
    // avaliado para o humano ver tudo que falta de uma vez.
  } else {
    if (decision.siloPageVersionId !== input.siloPageVersion.versionId
      || decision.siloPageContentHash !== input.siloPageVersion.contentHash) {
      blockers.push({
        code: "SILO_PAGE_APPROVAL_STALE",
        detail: `decidiu sobre ${decision.siloPageVersionId}, persistindo ${input.siloPageVersion.versionId}`,
      });
    }
    if (decision.siloDnaVersionId !== input.siloDnaVersion.versionId) {
      blockers.push({
        code: "SILO_PAGE_APPROVAL_STALE",
        detail: `SiloDNA decidido ${decision.siloDnaVersionId} != ${input.siloDnaVersion.versionId}`,
      });
    }
    if (decision.siloPageId !== siloPage.siloPageId) {
      blockers.push({ code: "SILO_PAGE_APPROVAL_STALE", detail: `siloPageId ${decision.siloPageId}` });
    }
    if (decision.territoryRef !== input.territoryRef) {
      blockers.push({ code: "SILO_PAGE_APPROVAL_TERRITORY_MISMATCH", detail: `decisão: ${decision.territoryRef}` });
    }
  }

  // ------------------------------------------------------------ identidade
  if (siloPage.brandId !== input.brandId) {
    blockers.push({ code: "SILO_PAGE_APPROVAL_BRAND_MISMATCH", detail: siloPage.brandId });
  }
  if (siloPage.territoryRef !== input.territoryRef) {
    blockers.push({
      code: "SILO_PAGE_APPROVAL_TERRITORY_MISMATCH",
      detail: `page: ${siloPage.territoryRef ?? "ausente"}`,
    });
  }
  if (siloPage.siloId !== input.siloId) {
    blockers.push({ code: "SILO_PAGE_APPROVAL_SILO_MISMATCH", detail: siloPage.siloId });
  }
  if (siloPage.siloDnaRef.versionId !== input.siloDnaVersion.versionId) {
    blockers.push({
      code: "SILO_PAGE_APPROVAL_SILO_DNA_REF_MISMATCH",
      detail: `${siloPage.siloDnaRef.versionId} != ${input.siloDnaVersion.versionId}`,
    });
  }

  // -------------------------------------------------------- composição
  // A página não redefine a arquitetura: ela a materializa.
  if (siloPage.pillarArticleId !== siloDna.pillarArticleId) {
    blockers.push({
      code: "SILO_PAGE_APPROVAL_PILLAR_MISMATCH",
      detail: `${siloPage.pillarArticleId} != ${siloDna.pillarArticleId}`,
    });
  }
  if (!sameSet(siloPage.supportArticleIds, siloDna.supportArticleIds)) {
    blockers.push({ code: "SILO_PAGE_APPROVAL_SUPPORTS_MISMATCH", detail: "supportArticleIds" });
  }

  // ------------------------------------------------- estrutura publicável
  // Rascunho não é aprovável, e a estrutura mínima é a que o próprio schema já
  // exige de uma página formada — aqui ela vira bloqueio de aprovação, não só
  // erro de parse.
  if (siloPage.formationStatus !== "formed") {
    blockers.push({ code: "SILO_PAGE_APPROVAL_STRUCTURE_INCOMPLETE", detail: "formationStatus=draft" });
  }
  const missing = (["h1", "seoTitle", "metaDescription", "intro", "cta"] as const)
    .filter(field => !siloPage[field].trim());
  if (missing.length) {
    blockers.push({ code: "SILO_PAGE_APPROVAL_STRUCTURE_INCOMPLETE", detail: missing.join(", ") });
  }
  if (!siloPage.sections.length) {
    blockers.push({ code: "SILO_PAGE_APPROVAL_STRUCTURE_INCOMPLETE", detail: "sections" });
  }
  if (!siloPage.slug.trim()) {
    blockers.push({ code: "SILO_PAGE_APPROVAL_SLUG_MISSING", detail: siloPage.siloPageId });
  }
  // Canonical é obrigatório para aprovar: sem ele a página vai ao ar sem
  // declarar qual URL é a dela, e é isso que o Radar depois cobra.
  if (!siloPage.canonical) {
    blockers.push({ code: "SILO_PAGE_APPROVAL_CANONICAL_MISSING", detail: siloPage.siloPageId });
  }

  // --------------------------------------------------- quando já publicada
  if (siloPage.publicationStatus === "published") {
    if (!siloPage.publishedUrl) {
      blockers.push({ code: "SILO_PAGE_APPROVAL_PUBLISHED_URL_MISSING", detail: siloPage.siloPageId });
    }
    const verification = siloPage.publicationVerification.status;
    if (!RESOLVED_PUBLICATION_STATUSES.includes(verification as never)) {
      blockers.push({ code: "SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED", detail: verification });
    }
  }

  // Identidade publicada é preservada: aprovar não é canal para trocar slug,
  // canonical ou URL de uma página que já está no ar.
  const published = input.publishedPage;
  if (published && published.publicationStatus === "published") {
    const mutated = (["slug", "canonical", "publishedUrl"] as const)
      .filter(field => siloPage[field] !== published[field]);
    if (mutated.length) {
      blockers.push({
        code: "SILO_PAGE_APPROVAL_PUBLISHED_IDENTITY_MUTATED",
        detail: mutated.join(", "),
      });
    }
  }

  return blockers.length ? { state: "blocked", blockers } : { state: "approved", blockers: [] };
}
