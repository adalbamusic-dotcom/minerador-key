import type { SiloDNA, SiloPage } from "./contracts.ts";
import type { TerritoryNarrative } from "./territory-narrative.ts";
import type { SiloPageApprovalReadiness } from "./silo-page-approval.ts";
import type { SiloWorkingCopyState } from "./silo-working-copy-record.ts";
import type {
  SiloArticleExclusion,
  TerritorialSiloArticle,
  TerritorialSiloComposition,
} from "./silo-consolidation-territorial.ts";

/**
 * BINDING SEMÂNTICO — o SiloDNA/SiloPage recebido precisa ser a materialização
 * da arquitetura JÁ DECIDIDA na working copy remota.
 *
 * Sem isto, proveniência correta (`workingCopyRef` + `workingCopyLockVersion`)
 * autorizava qualquer composição: outro Pilar, outros Suportes, artigo excluído
 * de volta como Suporte. Os dois valores são legíveis pelo GET do workspace.
 *
 * Este módulo NÃO recalcula arquitetura, não usa IA e não escolhe Pilar. Ele
 * DERIVA a expectativa canônica da decisão que já existe e compara. Divergência
 * recusa; nada é corrigido no envelope recebido.
 */

export const SILO_DNA_BINDING_REFUSALS = [
  "SILO_DNA_WORKING_COPY_MISMATCH",
  "PILLAR_DECISION_STALE",
  "PILLAR_NOT_HUMAN_DECIDED",
  "ARTICLE_COVERAGE_GAP",
  "ARTICLE_VERSION_MISMATCH",
  "ARTICLE_TERRITORY_MISMATCH",
  "ARTICLE_BRAND_MISMATCH",
  "SILO_PAGE_STRUCTURAL_MISMATCH",
  "PUBLISHED_IDENTITY_MUTATED",
  "PUBLISHED_IDENTITY_DECISION_REQUIRED",
  "SILO_DNA_APPROVAL_WITHOUT_HUMAN_DECISION",
  "SILO_PAGE_APPROVAL_GATE_MISSING",
  "TERRITORY_STRUCTURE_MISMATCH",
  "TERRITORY_NARRATIVE_MISSING",
] as const;
export type SiloDnaBindingRefusal = (typeof SILO_DNA_BINDING_REFUSALS)[number];

export type BindingRefusal = { code: SiloDnaBindingRefusal; detail: string };

const sameSet = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());

/**
 * Igualdade de narrativa: cópia fiel, campo a campo, `rationale` na ordem.
 * Sem trim, sem normalização — o snapshot é o texto que o Território guardou.
 */
const sameNarrative = (left: TerritoryNarrative, right: TerritoryNarrative) =>
  left.statement === right.statement &&
  left.continuity === right.continuity &&
  left.brandAlignment === right.brandAlignment &&
  left.rationale.length === right.rationale.length &&
  left.rationale.every((reason, index) => reason === right.rationale[index]);

/**
 * Composição canônica derivada da working copy REMOTA.
 *
 * A fonte é `pillarSelection` (decisão humana), `supportArticleIds` e
 * `exclusions`. `pillarSuggestionArticleId`, `pillarScores`, volume, KGR,
 * posição, ordem, IA e SERP NÃO participam — nenhum deles é seleção estrutural.
 */
export function deriveExpectedCompositionFromWorkingCopy(
  workingCopy: SiloWorkingCopyState,
): TerritorialSiloComposition {
  return {
    territoryRef: workingCopy.territoryRef,
    brandId: workingCopy.brandId,
    pillarArticleId: workingCopy.pillarSelection?.articleId ?? null,
    supportArticleIds: [...workingCopy.supportArticleIds],
    exclusions: workingCopy.exclusions.map((exclusion): SiloArticleExclusion => ({ ...exclusion })),
  };
}

/** Articles do território, montados a partir das referências versionadas da WC. */
export function deriveTerritorialArticlesFromWorkingCopy(
  workingCopy: SiloWorkingCopyState,
  loaded: ReadonlyMap<string, { brandId: string; territoryRef: string | null; contentHash: string }>,
): TerritorialSiloArticle[] {
  return workingCopy.articleRefs.map(reference => {
    const remote = loaded.get(reference.articleDnaVersionId);
    return {
      articleId: reference.articleId,
      brandId: remote?.brandId ?? workingCopy.brandId,
      territoryRef: (remote?.territoryRef ?? null) as TerritorialSiloArticle["territoryRef"],
      articleDnaVersionId: reference.articleDnaVersionId,
      articleDnaContentHash: reference.articleDnaContentHash,
      isConsolidated: Boolean(remote),
      isHumanApproved: Boolean(remote),
    };
  });
}

export type RemoteArticleVersion = {
  versionId: string;
  entityId: string;
  contentHash: string;
  brandId: string;
  territoryRef: string | null;
};

/**
 * §5 — cada Article referenciado pela working copy precisa existir remotamente
 * com a MESMA versão e o MESMO hash. A versão que passou pela decisão humana é a
 * que consolida: nada é trocado pela última versão automaticamente.
 */
export function refuseArticleVersionBinding(input: {
  workingCopy: SiloWorkingCopyState;
  remoteVersions: readonly RemoteArticleVersion[];
}): BindingRefusal[] {
  const refusals: BindingRefusal[] = [];
  const byVersionId = new Map(input.remoteVersions.map(version => [version.versionId, version]));

  for (const reference of input.workingCopy.articleRefs) {
    const remote = byVersionId.get(reference.articleDnaVersionId);
    if (!remote) {
      refusals.push({
        code: "ARTICLE_VERSION_MISMATCH",
        detail: `${reference.articleId}: versão ${reference.articleDnaVersionId} não existe nesta Brand`,
      });
      continue;
    }
    if (remote.entityId !== reference.articleId) {
      refusals.push({ code: "ARTICLE_VERSION_MISMATCH", detail: `${reference.articleId} != ${remote.entityId}` });
    }
    if (remote.contentHash !== reference.articleDnaContentHash) {
      refusals.push({ code: "ARTICLE_VERSION_MISMATCH", detail: `${reference.articleId}: contentHash divergente` });
    }
    if (remote.brandId !== input.workingCopy.brandId) {
      refusals.push({ code: "ARTICLE_BRAND_MISMATCH", detail: reference.articleId });
    }
    if (remote.territoryRef !== input.workingCopy.territoryRef) {
      refusals.push({ code: "ARTICLE_TERRITORY_MISMATCH", detail: reference.articleId });
    }
  }
  return refusals;
}

/**
 * §7 — a decisão humana precisa ser válida E ter sido tomada sobre a composição
 * vigente. `SiloDNA.pillarArticleId` ser "algum Article válido" não basta: tem de
 * ser exatamente a decisão registrada na working copy.
 */
export function refusePillarDecisionBinding(workingCopy: SiloWorkingCopyState): BindingRefusal[] {
  const selection = workingCopy.pillarSelection;
  if (!selection) {
    return [{ code: "PILLAR_NOT_HUMAN_DECIDED", detail: workingCopy.workingCopyRef }];
  }
  const refusals: BindingRefusal[] = [];
  const currentIds = workingCopy.articleRefs.map(reference => reference.articleId);
  if (!currentIds.includes(selection.articleId)) {
    refusals.push({ code: "PILLAR_DECISION_STALE", detail: `${selection.articleId} saiu da composição` });
    return refusals;
  }
  if (!sameSet(selection.decidedOverArticleIds, currentIds)) {
    refusals.push({
      code: "PILLAR_DECISION_STALE",
      detail: "a composição mudou desde a decisão humana de Pilar",
    });
  }
  return refusals;
}

/**
 * O gate de COMPOSIÇÃO. Compara o que a working copy controla: identidade,
 * Pilar, Suportes, exclusões, cobertura e referências versionadas.
 *
 * `centralEntity`, `macroIntent` e a fronteira NÃO são conferidos aqui — mas
 * também não são livres. Eles pertencem ao TERRITÓRIO confirmado, e quem os
 * confere é `assertSiloDnaMatchesConfirmedTerritory`. Os dois gates são
 * complementares: composição vem da working copy, estrutura territorial vem do
 * Território.
 */
export function assertSiloDnaMatchesConfirmedWorkingCopy(input: {
  workingCopy: SiloWorkingCopyState;
  workingCopyLockVersion: number;
  siloDna: SiloDNA;
}): BindingRefusal[] {
  const refusals: BindingRefusal[] = [];
  const { workingCopy, siloDna } = input;
  const expected = deriveExpectedCompositionFromWorkingCopy(workingCopy);

  if (siloDna.brandId !== workingCopy.brandId) {
    refusals.push({ code: "SILO_DNA_WORKING_COPY_MISMATCH", detail: `brandId: ${siloDna.brandId}` });
  }
  if (siloDna.territoryRef !== workingCopy.territoryRef) {
    refusals.push({ code: "SILO_DNA_WORKING_COPY_MISMATCH", detail: `territoryRef: ${siloDna.territoryRef}` });
  }
  if (siloDna.workingCopyRef !== workingCopy.workingCopyRef) {
    refusals.push({ code: "SILO_DNA_WORKING_COPY_MISMATCH", detail: `workingCopyRef: ${siloDna.workingCopyRef}` });
  }
  if (siloDna.workingCopyLockVersion !== input.workingCopyLockVersion) {
    refusals.push({
      code: "SILO_DNA_WORKING_COPY_MISMATCH",
      detail: `workingCopyLockVersion: ${siloDna.workingCopyLockVersion} != ${input.workingCopyLockVersion}`,
    });
  }
  // Âncora de Silo existente é decisão territorial, não do caller.
  if (workingCopy.existingSiloId && siloDna.siloId !== workingCopy.existingSiloId) {
    refusals.push({ code: "SILO_DNA_WORKING_COPY_MISMATCH", detail: `siloId: ${siloDna.siloId}` });
  }

  // Pilar: exatamente a decisão humana.
  if (siloDna.pillarArticleId !== expected.pillarArticleId) {
    refusals.push({
      code: "SILO_DNA_WORKING_COPY_MISMATCH",
      detail: `pillarArticleId: ${siloDna.pillarArticleId} != ${expected.pillarArticleId}`,
    });
  }
  // Suportes: mesmo CONJUNTO, porque a ordem não carrega semântica aqui.
  if (!sameSet(siloDna.supportArticleIds, expected.supportArticleIds)) {
    refusals.push({ code: "SILO_DNA_WORKING_COPY_MISMATCH", detail: "supportArticleIds divergentes" });
  }

  const excluded = new Set(expected.exclusions.map(exclusion => exclusion.articleId));
  const structural = [expected.pillarArticleId, ...expected.supportArticleIds]
    .filter((id): id is string => Boolean(id));

  // Excluído não volta como Suporte nem como Pilar.
  const revived = [siloDna.pillarArticleId, ...siloDna.supportArticleIds]
    .filter((id): id is string => Boolean(id))
    .filter(id => excluded.has(id));
  if (revived.length) {
    refusals.push({
      code: "SILO_DNA_WORKING_COPY_MISMATCH",
      detail: `artigo excluído reaparece na composição: ${[...new Set(revived)].sort().join(", ")}`,
    });
  }

  // Cobertura: Pilar + Suportes + excluídos cobrem exatamente a working copy.
  const covered = new Set([...structural, ...excluded]);
  const missing = workingCopy.articleRefs
    .map(reference => reference.articleId)
    .filter(articleId => !covered.has(articleId));
  if (missing.length) {
    refusals.push({ code: "ARTICLE_COVERAGE_GAP", detail: missing.sort().join(", ") });
  }

  // Referências versionadas: exatamente as da composição estrutural, com as
  // mesmas versões e hashes que a working copy registrou.
  const referenceById = new Map(workingCopy.articleRefs.map(reference => [reference.articleId, reference]));
  if (!sameSet(siloDna.articleReferences.map(reference => reference.articleId), structural)) {
    refusals.push({ code: "SILO_DNA_WORKING_COPY_MISMATCH", detail: "articleReferences não cobrem a composição" });
  }
  for (const reference of siloDna.articleReferences) {
    const expectedRef = referenceById.get(reference.articleId);
    if (!expectedRef) continue;
    if (reference.articleDnaVersionId !== expectedRef.articleDnaVersionId
      || reference.articleDnaContentHash !== expectedRef.articleDnaContentHash) {
      refusals.push({ code: "ARTICLE_VERSION_MISMATCH", detail: reference.articleId });
    }
    const expectedRole = reference.articleId === expected.pillarArticleId ? "Pilar" : "Suporte";
    if (reference.role !== expectedRole) {
      refusals.push({
        code: "SILO_DNA_WORKING_COPY_MISMATCH",
        detail: `role de ${reference.articleId}: ${reference.role} != ${expectedRole}`,
      });
    }
  }

  // articleRoles, quando presente, precisa concordar com a mesma composição.
  for (const role of siloDna.articleRoles) {
    if (!covered.has(role.articleId)) {
      refusals.push({ code: "SILO_DNA_WORKING_COPY_MISMATCH", detail: `articleRoles cita ${role.articleId}` });
    }
  }

  return refusals;
}

/**
 * §14 e §15 — a SiloPage acompanha a mesma composição, e identidade publicada
 * não muda por vontade do caller.
 */
export function assertSiloPageMatchesSiloDna(input: {
  siloDna: SiloDNA;
  siloPage: SiloPage;
  workingCopy: SiloWorkingCopyState;
  /** SiloPage publicada vigente, quando existir. */
  publishedPage?: Pick<SiloPage, "slug" | "canonical" | "publishedUrl" | "publicationStatus" | "publicationVerification"> | null;
  publishedIdentityDecisionResolved?: boolean;
}): BindingRefusal[] {
  const refusals: BindingRefusal[] = [];
  const { siloDna, siloPage } = input;

  if (siloPage.brandId !== siloDna.brandId) {
    refusals.push({ code: "SILO_PAGE_STRUCTURAL_MISMATCH", detail: "brandId" });
  }
  if (siloPage.territoryRef !== siloDna.territoryRef) {
    refusals.push({ code: "SILO_PAGE_STRUCTURAL_MISMATCH", detail: "territoryRef" });
  }
  if (siloPage.siloId !== siloDna.siloId) {
    refusals.push({ code: "SILO_PAGE_STRUCTURAL_MISMATCH", detail: "siloId" });
  }
  if (siloPage.pillarArticleId !== siloDna.pillarArticleId) {
    refusals.push({ code: "SILO_PAGE_STRUCTURAL_MISMATCH", detail: "pillarArticleId" });
  }
  if (!sameSet(siloPage.supportArticleIds, siloDna.supportArticleIds)) {
    refusals.push({ code: "SILO_PAGE_STRUCTURAL_MISMATCH", detail: "supportArticleIds" });
  }
  // A proveniência não é duplicada na SiloPage; ela chega pelo siloDnaRef.
  if (siloPage.siloDnaRef.entityId !== siloDna.siloId) {
    refusals.push({ code: "SILO_PAGE_STRUCTURAL_MISMATCH", detail: "siloDnaRef.entityId" });
  }

  const published = input.publishedPage;
  if (published && published.publicationStatus === "published") {
    if (siloPage.slug !== published.slug
      || siloPage.canonical !== published.canonical
      || siloPage.publishedUrl !== published.publishedUrl) {
      refusals.push({
        code: "PUBLISHED_IDENTITY_MUTATED",
        detail: "slug, canonical ou publishedUrl publicados não podem mudar aqui",
      });
    }
    const verification = published.publicationVerification?.status;
    const unresolved = verification === "conflict" || verification === "canonical_mismatch" || verification === "unreachable";
    if (unresolved && !input.publishedIdentityDecisionResolved) {
      refusals.push({ code: "PUBLISHED_IDENTITY_DECISION_REQUIRED", detail: String(verification) });
    }
  }

  return refusals;
}

/**
 * §16 e §17 — status. `approved` do SiloDNA exige decisão humana de
 * consolidação. A SiloPage tem aprovação INDEPENDENTE, e desde a 2C.4.7 ela
 * tem gate server-side próprio em `silo-page-approval.ts`.
 *
 * Aqui a regra é só de composição: quem quiser escalar a página a `approved`
 * precisa entregar uma readiness JÁ RESOLVIDA por aquele gate. Ausente ou
 * bloqueada, continua fail-closed. Recalcular a readiness aqui duplicaria a
 * autoridade do gate em dois lugares que poderiam divergir.
 */
export const SILO_PAGE_APPROVAL_SERVER_GATE = "PRESENT" as const;

export function refuseStatusEscalation(input: {
  siloDnaStatus: string;
  siloPageStatus: string;
  humanConsolidationConfirmed: boolean;
  /** Resultado do gate próprio da SiloPage. Ausente = não houve decisão. */
  siloPageApproval?: SiloPageApprovalReadiness | null;
}): BindingRefusal[] {
  const refusals: BindingRefusal[] = [];
  if (input.siloDnaStatus === "approved" && !input.humanConsolidationConfirmed) {
    refusals.push({
      code: "SILO_DNA_APPROVAL_WITHOUT_HUMAN_DECISION",
      detail: "aprovar o SiloDNA exige decisão humana de consolidação",
    });
  }
  if (input.siloPageStatus === "approved") {
    const approval = input.siloPageApproval;
    if (!approval) {
      refusals.push({
        code: "SILO_PAGE_APPROVAL_GATE_MISSING",
        detail: "a SiloPage tem aprovação independente e nenhuma decisão própria foi apresentada",
      });
    } else if (approval.state !== "approved") {
      refusals.push({
        code: "SILO_PAGE_APPROVAL_GATE_MISSING",
        detail: approval.blockers.map(blocker => blocker.code).join(", "),
      });
    }
  }
  return refusals;
}

/* ----------------------- Territory -> SiloDNA ---------------------------- */

/**
 * O Território confirmado é a AUTORIDADE dos campos que a working copy não
 * decide. Eles não são livres: não pertencem ao chamador nem aos ArticleDNAs.
 *
 * Mapa de equivalência REAL entre os contratos — nada é inventado:
 *
 *   Territory.centralEntity      -> SiloDNA.centralEntity     (string, direta)
 *   Territory.macroIntent        -> SiloDNA.dominantIntent    (string, direta)
 *   Territory.boundary.includes  -> SiloDNA.includedTopics    (conjunto)
 *   Territory.boundary.excludes  -> SiloDNA.excludedTopics    (conjunto)
 *   Territory.narrative          -> SiloDNA.territoryNarrative (snapshot fiel)
 *
 * SEM equivalência canônica, portanto NÃO comparados:
 *
 *   SiloDNA.boundary é prosa livre; Territory.boundary é o par includes/excludes.
 *   `narrativeOrder` é ordem de leitura dos artigos, não narrativa territorial;
 *   igualar os dois seria inventar equivalência. A narrativa vai para o campo
 *   próprio `territoryNarrative`, comparada como snapshot exato.
 */
export const TERRITORY_TO_SILO_DNA_FIELD_MAP = {
  centralEntity: "centralEntity",
  macroIntent: "dominantIntent",
  "boundary.includes": "includedTopics",
  "boundary.excludes": "excludedTopics",
  narrative: "territoryNarrative",
} as const;

export const TERRITORY_STRUCTURE_UNMAPPED_FIELDS = ["boundaryProse"] as const;

export function assertSiloDnaMatchesConfirmedTerritory(input: {
  territory: {
    territoryRef: string;
    centralEntity: string;
    macroIntent: string;
    boundary: { includes: readonly string[]; excludes: readonly string[] };
    narrative: TerritoryNarrative;
  };
  siloDna: SiloDNA;
}): BindingRefusal[] {
  const refusals: BindingRefusal[] = [];
  const { territory, siloDna } = input;

  if (siloDna.territoryRef !== territory.territoryRef) {
    refusals.push({ code: "TERRITORY_STRUCTURE_MISMATCH", detail: `territoryRef: ${siloDna.territoryRef}` });
    return refusals;
  }
  if (siloDna.centralEntity.trim() !== territory.centralEntity.trim()) {
    refusals.push({
      code: "TERRITORY_STRUCTURE_MISMATCH",
      detail: `centralEntity: "${siloDna.centralEntity}" != "${territory.centralEntity}"`,
    });
  }
  if (siloDna.dominantIntent.trim() !== territory.macroIntent.trim()) {
    refusals.push({
      code: "TERRITORY_STRUCTURE_MISMATCH",
      detail: `dominantIntent: "${siloDna.dominantIntent}" != macroIntent "${territory.macroIntent}"`,
    });
  }
  // Fronteira: comparada por CONJUNTO — a ordem das listas não carrega semântica.
  if (!sameSet(siloDna.includedTopics, territory.boundary.includes)) {
    refusals.push({ code: "TERRITORY_STRUCTURE_MISMATCH", detail: "includedTopics != boundary.includes" });
  }
  if (!sameSet(siloDna.excludedTopics, territory.boundary.excludes)) {
    refusals.push({ code: "TERRITORY_STRUCTURE_MISMATCH", detail: "excludedTopics != boundary.excludes" });
  }

  // Narrativa: comparada como SNAPSHOT EXATO, não como conjunto. `rationale` é
  // uma sequência de razões — reordenar muda a leitura do porquê. E ausência
  // aqui não é retrocompatibilidade: o Território confirmado sempre tem
  // narrativa, então um SiloDNA novo sem ela perdeu a razão editorial no
  // caminho, e isso é um código próprio para não se confundir com divergência.
  if (siloDna.territoryNarrative === undefined) {
    refusals.push({ code: "TERRITORY_NARRATIVE_MISSING", detail: territory.territoryRef });
  } else if (!sameNarrative(siloDna.territoryNarrative, territory.narrative)) {
    refusals.push({
      code: "TERRITORY_STRUCTURE_MISMATCH",
      detail: `territoryNarrative != Territory.narrative (${territory.territoryRef})`,
    });
  }
  return refusals;
}
