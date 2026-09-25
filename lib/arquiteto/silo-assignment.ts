import { emptyTerritoryDiscovery, emptyTerritoryLineage } from "./territory.ts";
import { emptyTerritoryNarrative } from "./territory-narrative.ts";
import type { KeywordTerritoryDecision, TerritoryPrimaryKeyword } from "./territory.ts";
import type { TerritorialLandscape } from "./territorial-landscape.ts";

/**
 * Associação humana de uma keyword a um Silo.
 *
 * Função pura de planejamento: NÃO busca, NÃO grava e NÃO decide sozinha. Traduz
 * uma decisão humana explícita nos passos do writer canônico já existente
 * (`PATCH /api/arquiteto/workspace`), sem contrato novo.
 *
 * Duas distinções que o domínio mantém e a UI não mostra:
 *  - Silo existente (SiloDNA/SiloPage/cadastro/publicado) != registro territorial
 *    interno. Associar keyword a um Silo existente pode exigir ancorar primeiro.
 *  - `siloId` NUNCA é gravado em `territoryRef`. O ref é emitido pelo servidor.
 */

/** Para onde o humano quer levar a keyword. */
export type SiloAssignmentTarget =
  /** Registro territorial interno que já existe. */
  | { kind: "territory"; territoryRef: string }
  /** Estrutura existente ainda sem registro interno: exige ancoragem antes. */
  | { kind: "existing_structure"; siloId: string }
  /** Decisão explícita de deixar a keyword fora de qualquer Silo. */
  | { kind: "unassigned" };

export const SILO_ASSIGNMENT_REFUSAL_CODES = [
  "REASON_REQUIRED",
  "KEYWORD_NOT_IN_SCOPE",
  "KEYWORD_CROSS_BRAND",
  "ALREADY_IN_TARGET",
  "TERRITORY_NOT_FOUND",
  "TERRITORY_NOT_ASSIGNABLE",
  "STRUCTURE_NOT_FOUND",
  "STRUCTURE_ALREADY_ANCHORED",
  "STRUCTURE_WITHOUT_CANONICAL_VERSION",
  "PUBLISHED_KEYWORD_PROTECTED",
] as const;
export type SiloAssignmentRefusalCode = (typeof SILO_ASSIGNMENT_REFUSAL_CODES)[number];

/** Passo 1 (só no caso B): cria o registro interno ancorado no Silo existente. */
export type AnchorStructureStep = {
  kind: "anchor_structure";
  siloId: string;
  /** Draft SEM `territoryRef` e SEM `brandId`: o servidor impõe os dois. */
  draft: Record<string, unknown>;
};

/** Passo 2: grava a membership no item de workflow da keyword. */
export type AssignKeywordStep = {
  kind: "assign_keyword";
  keywordId: string;
  workflowItemId: string;
  expectedLock: number;
  /** `null` = decisão explícita de ficar sem Silo. */
  territoryRef: string | null;
  /** Preenchido com o ref emitido pelo servidor quando vem de `anchor_structure`. */
  territoryRefFromAnchor: boolean;
  decision: KeywordTerritoryDecision;
};

export type SiloAssignmentStep = AnchorStructureStep | AssignKeywordStep;

export type SiloAssignmentPlan =
  | { ok: true; steps: SiloAssignmentStep[] }
  | { ok: false; refusals: Array<{ code: SiloAssignmentRefusalCode; detail: string }> };

/** Lifecycles que aceitam keyword. Consolidado e arquivado não recebem membership. */
const ASSIGNABLE_LIFECYCLES = new Set(["candidate", "confirmed"]);

export type SiloAssignmentKeyword = {
  keywordId: string;
  brandId: string;
  workflowItemId: string;
  expectedLock: number;
  /** Membership vigente, lida da fonte canônica. */
  currentTerritoryRef: string | null;
  isPublished: boolean;
  /**
   * O Silo que o PRÓPRIO SITE declara para a publicada: a cabeça do Silo
   * publicado, ou o artigo cuja URL está sob a URL do Silo. Só para esse
   * destino a publicada pode ganhar membership — é revalidar o que está no
   * ar, não remanejar. Membership não é identidade: URL, slug e canonical
   * continuam intocados. Ausente, a publicada segue protegida como antes.
   */
  declaredTerritoryRef?: string | null;
};

/**
 * Monta o draft do registro interno de um Silo que já existe.
 *
 * NÃO inventa `centralEntity`, `macroIntent`, fronteira nem narrativa: sem
 * decisão ou evidência esses campos ficam vazios e o Silo permanece
 * `candidate`. Quem decide se pode ser confirmado é
 * `resolveTerritoryConfirmationReadiness`, depois — associar keyword não é
 * confirmar Silo.
 */
export function anchorDraftForExistingStructure(input: {
  structure: TerritorialLandscape["existingStructures"][number];
  actorReason: string;
}): Record<string, unknown> {
  const { structure } = input;
  return {
    schemaVersion: 1,
    existingSiloRef: {
      siloId: structure.siloId,
      siloDnaVersionRef: {
        entityId: structure.sourceEntityId,
        versionId: structure.versionId,
        contentHash: structure.contentHash,
      },
      siloPageVersionRef: null,
    },
    name: structure.name,
    centralEntity: "",
    macroIntent: "",
    boundary: { includes: [], excludes: [] },
    narrative: emptyTerritoryNarrative(),
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "existing",
    architecturalOrigin: "existing",
    ingestionOrigin: "ui",
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: structure.isPublished ? "protected" : "unpublished",
    slugState: {
      proposals: [],
      // Slug confirmado é decisão humana à parte; a página existente entra como
      // slug publicado quando houver, nunca como confirmação.
      confirmed: null,
      publishedSlug: structure.isPublished ? structure.slug : null,
      publishedCanonical: null,
    },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: [input.actorReason],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: null },
  };
}

/**
 * Planeja a associação. Toda decisão aqui é humana: `source` é sempre `human` e
 * o motivo é obrigatório — inclusive para sair do Silo.
 */
export function planSiloAssignment(input: {
  brandId: string;
  landscape: TerritorialLandscape;
  keyword: SiloAssignmentKeyword;
  target: SiloAssignmentTarget;
  reason: string;
  decidedAt: string;
}): SiloAssignmentPlan {
  const refusals: Array<{ code: SiloAssignmentRefusalCode; detail: string }> = [];
  const { keyword, landscape, target } = input;
  const reason = input.reason.trim();

  if (!reason) {
    refusals.push({ code: "REASON_REQUIRED", detail: "Toda decisão de silo declara o motivo, inclusive manter sem silo." });
  }
  if (keyword.brandId !== input.brandId) {
    refusals.push({ code: "KEYWORD_CROSS_BRAND", detail: keyword.brandId });
  }
  if (!keyword.workflowItemId.trim()) {
    refusals.push({ code: "KEYWORD_NOT_IN_SCOPE", detail: keyword.keywordId });
  }
  // Identidade publicada continua protegida contra remanejo manual. As duas
  // exceções não remanejam nada: entrar no Silo que o site declara, e ficar
  // fora de Silo quando já está fora (nada a gravar).
  const destinoDeclaradoPeloSite = keyword.isPublished
    && target.kind === "territory"
    && Boolean(keyword.declaredTerritoryRef)
    && target.territoryRef === keyword.declaredTerritoryRef;
  const publicadaJaForaDeSilo = keyword.isPublished && target.kind === "unassigned" && keyword.currentTerritoryRef === null;
  if (publicadaJaForaDeSilo) {
    refusals.push({ code: "ALREADY_IN_TARGET", detail: "A keyword publicada já está fora de Silo; nada a gravar." });
  } else if (keyword.isPublished && !destinoDeclaradoPeloSite) {
    refusals.push({ code: "PUBLISHED_KEYWORD_PROTECTED", detail: keyword.keywordId });
  }

  const steps: SiloAssignmentStep[] = [];
  let territoryRef: string | null = null;
  let fromAnchor = false;
  let state: KeywordTerritoryDecision["state"] = "unassigned";

  if (target.kind === "territory") {
    const territory = [...landscape.candidateTerritories, ...landscape.confirmedTerritories, ...landscape.otherTerritories]
      .find(item => item.territoryRef === target.territoryRef);
    if (!territory) {
      refusals.push({ code: "TERRITORY_NOT_FOUND", detail: target.territoryRef });
    } else if (!ASSIGNABLE_LIFECYCLES.has(territory.lifecycleStatus)) {
      refusals.push({ code: "TERRITORY_NOT_ASSIGNABLE", detail: `${territory.territoryRef}: ${territory.lifecycleStatus}` });
    } else if (keyword.currentTerritoryRef === territory.territoryRef) {
      refusals.push({ code: "ALREADY_IN_TARGET", detail: territory.territoryRef });
    }
    territoryRef = target.territoryRef;
    state = "existing_silo_match";
  }

  if (target.kind === "existing_structure") {
    const structure = landscape.existingStructures.find(item => item.siloId === target.siloId);
    if (!structure) {
      refusals.push({ code: "STRUCTURE_NOT_FOUND", detail: target.siloId });
    } else if (structure.anchoredByTerritoryRef) {
      // Já existe registro interno: a associação é o caso A, não ancoragem nova.
      refusals.push({ code: "STRUCTURE_ALREADY_ANCHORED", detail: structure.anchoredByTerritoryRef });
    } else if (!structure.versionId || !structure.contentHash) {
      // Sem SiloDNA vigente não há referência de versão para ancorar, e forjar
      // uma criaria binding falso entre território e Silo canônico.
      refusals.push({ code: "STRUCTURE_WITHOUT_CANONICAL_VERSION", detail: target.siloId });
    } else {
      steps.push({ kind: "anchor_structure", siloId: structure.siloId, draft: anchorDraftForExistingStructure({ structure, actorReason: reason }) });
    }
    fromAnchor = true;
    state = "existing_silo_match";
  }

  if (target.kind === "unassigned") {
    if (keyword.currentTerritoryRef === null && landscape.unassignedKeywords
      .find(entry => entry.keywordId === keyword.keywordId)?.source === "human") {
      refusals.push({ code: "ALREADY_IN_TARGET", detail: "A keyword já está mantida sem silo por decisão humana." });
    }
    territoryRef = null;
    state = "unassigned";
  }

  if (refusals.length) return { ok: false, refusals };

  steps.push({
    kind: "assign_keyword",
    keywordId: keyword.keywordId,
    workflowItemId: keyword.workflowItemId,
    expectedLock: keyword.expectedLock,
    territoryRef,
    territoryRefFromAnchor: fromAnchor,
    decision: { state, reason, source: "human", decidedAt: input.decidedAt },
  });

  return { ok: true, steps };
}

export type SiloAssignmentOutcome = "applied" | "partial" | "refused";

/**
 * Classifica o resultado depois do readback. Sucesso só existe quando o estado
 * remoto confirma o destino — silêncio do servidor nunca vira sucesso.
 */
export function resolveSiloAssignmentOutcome(input: {
  steps: readonly SiloAssignmentStep[];
  /** Membership relida da fonte canônica após a gravação. */
  readbackTerritoryRefByKeyword: ReadonlyMap<string, string | null>;
  /** `territoryRef` emitido pelo servidor, quando houve ancoragem. */
  anchoredTerritoryRef: string | null;
}): { outcome: SiloAssignmentOutcome; confirmed: string[]; pending: string[] } {
  const assignments = input.steps.filter((step): step is AssignKeywordStep => step.kind === "assign_keyword");
  const anchors = input.steps.filter(step => step.kind === "anchor_structure");
  const confirmed: string[] = [];
  const pending: string[] = [];

  for (const step of assignments) {
    // Âncora sem ref emitido não tem destino a confirmar. Comparar contra `null`
    // aqui faria uma keyword que ficou sem silo passar por associação aplicada.
    if (step.territoryRefFromAnchor && !input.anchoredTerritoryRef) {
      pending.push(step.keywordId);
      continue;
    }
    const expected = step.territoryRefFromAnchor ? input.anchoredTerritoryRef : step.territoryRef;
    const actual = input.readbackTerritoryRefByKeyword.has(step.keywordId)
      ? input.readbackTerritoryRefByKeyword.get(step.keywordId) ?? null
      : undefined;
    if (actual !== undefined && actual === expected) confirmed.push(step.keywordId);
    else pending.push(step.keywordId);
  }

  // Âncora sem ref emitido é operação incompleta, não sucesso silencioso.
  if (anchors.length && !input.anchoredTerritoryRef) {
    return { outcome: pending.length === assignments.length ? "refused" : "partial", confirmed, pending };
  }
  if (!pending.length && confirmed.length) return { outcome: "applied", confirmed, pending };
  if (confirmed.length) return { outcome: "partial", confirmed, pending };
  return { outcome: "refused", confirmed, pending };
}

/**
 * Draft de um Silo candidato criado à mão pelo humano (`+ Silo`).
 *
 * O candidato mínimo já é um estado válido: NÃO inventa entidade central,
 * intenção, fronteira nem narrativa só para preencher formulário, e NÃO
 * materializa lista, SiloDNA, SiloPage, publicação nem canonical — isso é etapa
 * posterior da cadeia. O slug entra como PROPOSTA; promover a `confirmed` é
 * outra decisão.
 *
 * Sai sem `territoryRef` e sem `brandId`: o servidor emite os dois.
 *
 * `primaryKeyword` é o único campo de semântica que pode entrar aqui, e só
 * porque não é palpite: ela vem de uma origem declarada — a página publicada
 * que o Minerador marcou como Silo, ou a eleição por SERP, ou a decisão
 * humana. Ausente, o campo não aparece, e o Silo segue sem identidade eleita.
 */
export function manualSiloCandidateDraft(input: {
  name: string;
  slug: string | null;
  primaryKeyword?: TerritoryPrimaryKeyword | null;
}): Record<string, unknown> {
  const name = input.name.trim();
  const slug = input.slug?.trim() || null;
  return {
    schemaVersion: 1,
    existingSiloRef: null,
    name,
    centralEntity: "",
    ...(input.primaryKeyword ? { primaryKeyword: input.primaryKeyword } : {}),
    macroIntent: "",
    boundary: { includes: [], excludes: [] },
    narrative: emptyTerritoryNarrative(),
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "new",
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "ui",
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: "unpublished",
    slugState: {
      proposals: slug ? [{ slug, source: "human", rationale: "Proposta declarada na criação manual do silo." }] : [],
      confirmed: null,
      publishedSlug: null,
      publishedCanonical: null,
    },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: [`Silo candidato criado manualmente: ${name}.`],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: null },
  };
}

/**
 * O Silo cuja cabeça JÁ ESTÁ PUBLICADA nasce com a identidade do site.
 *
 * Mesma porta de `manualSiloCandidateDraft`, mesma falta de semântica
 * inventada — a diferença é o endereço: a página está no ar, então o slug
 * não é PROPOSTA, é `publishedSlug` (o caminho declarado no Vínculo), com o
 * `publishedCanonical` da declaração, e a proteção nasce `protected`, como em
 * `planSiteStructurePromotion`. Nenhum slug novo, nenhuma URL nova.
 *
 * `architecturalOrigin: "discovered"` e `territoryKind: "existing"` pelo mesmo
 * motivo da promoção: não há SiloDNA para `existingSiloRef`, e a página não é
 * lista nova.
 */
export function publishedSiloCandidateDraft(input: {
  name: string;
  publishedSlug: string;
  publishedCanonical: string | null;
  publishedUrl: string | null;
  primaryKeyword?: TerritoryPrimaryKeyword | null;
}): Record<string, unknown> {
  const name = input.name.trim();
  const endereco = input.publishedCanonical || input.publishedUrl || input.publishedSlug;
  return {
    schemaVersion: 1,
    existingSiloRef: null,
    name,
    centralEntity: "",
    ...(input.primaryKeyword ? { primaryKeyword: input.primaryKeyword } : {}),
    macroIntent: "",
    boundary: { includes: [], excludes: [] },
    narrative: emptyTerritoryNarrative(),
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "existing",
    architecturalOrigin: "discovered",
    ingestionOrigin: "ui",
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: "protected",
    slugState: {
      proposals: [],
      confirmed: null,
      publishedSlug: input.publishedSlug,
      publishedCanonical: input.publishedCanonical,
    },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: [`Silo publicado declarado no Minerador: ${name}.`, `Origem: página publicada em ${endereco}; URL, slug e canonical preservados.`],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: "Silo publicado adotado com a identidade do site." },
  };
}

/* ------------------- promoção de estrutura publicada --------------------- */

export const SITE_PROMOTION_REFUSAL_CODES = [
  "ALREADY_PROMOTED",
  "ALREADY_RECONCILED_WITH_SILO",
  "REASON_REQUIRED",
  "STRUCTURE_NOT_PUBLISHED",
] as const;
export type SitePromotionRefusalCode = (typeof SITE_PROMOTION_REFUSAL_CODES)[number];

export type SitePromotionPlan =
  | { ok: true; draft: Record<string, unknown> }
  | { ok: false; refusals: Array<{ code: SitePromotionRefusalCode; detail: string }> };

/**
 * Página publicada observada → Silo candidato.
 *
 * Cria SOMENTE o candidato. Nenhum SiloDNA, nenhuma SiloPage, nenhuma URL nova,
 * nenhum slug novo: a página já existe, e o candidato adota a identidade
 * publicada dela como protegida.
 *
 * `architecturalOrigin` fica `discovered` — não `existing`, que o contrato
 * amarra a `existingSiloRef` e portanto a um SiloDNA que esta página não tem.
 * A procedência real viaja em `publishedStructureRef`, `reasons` e `provenance`.
 */
export function planSiteStructurePromotion(input: {
  structure: {
    normalizedUrl: string;
    url: string;
    path: string | null;
    label: string;
    canonical: string | null;
    canonicalVerified: boolean;
    isPublished: boolean;
    catalogEntryId: string;
    observedAt: string | null;
    /** Preenchido quando a página já corresponde a um Silo canônico conhecido. */
    reconciledSiloId: string | null;
  };
  /** Territórios que já existem, para não criar um segundo candidato. */
  existingTerritories: ReadonlyArray<{ publishedStructureRef?: { normalizedUrl: string } | null }>;
  reason: string;
}): SitePromotionPlan {
  const refusals: Array<{ code: SitePromotionRefusalCode; detail: string }> = [];
  const { structure } = input;
  const reason = input.reason.trim();

  if (!reason) {
    refusals.push({ code: "REASON_REQUIRED", detail: "Usar uma página publicada como silo é decisão declarada." });
  }
  if (!structure.isPublished) {
    refusals.push({ code: "STRUCTURE_NOT_PUBLISHED", detail: structure.normalizedUrl });
  }
  if (structure.reconciledSiloId) {
    // Já existe Silo canônico para esta página: promover criaria paralelo.
    refusals.push({ code: "ALREADY_RECONCILED_WITH_SILO", detail: structure.reconciledSiloId });
  }
  if (input.existingTerritories.some(item => item.publishedStructureRef?.normalizedUrl === structure.normalizedUrl)) {
    refusals.push({ code: "ALREADY_PROMOTED", detail: structure.normalizedUrl });
  }
  if (refusals.length) return { ok: false, refusals };

  return {
    ok: true,
    draft: {
      schemaVersion: 1,
      existingSiloRef: null,
      publishedStructureRef: {
        source: "site_catalog",
        catalogEntryId: structure.catalogEntryId,
        normalizedUrl: structure.normalizedUrl,
        observedAt: structure.observedAt,
      },
      name: structure.label,
      // Semântica não é inventada: entidade, intenção e fronteira continuam
      // vazias até haver decisão ou evidência.
      centralEntity: "",
      macroIntent: "",
      boundary: { includes: [], excludes: [] },
      narrative: emptyTerritoryNarrative(),
      discovery: emptyTerritoryDiscovery(),
      territoryKind: "existing",
      architecturalOrigin: "discovered",
      ingestionOrigin: "system",
      lifecycleStatus: "candidate",
      decisionState: "pending",
      // A página já está no ar: a identidade dela é protegida desde o início.
      publicationProtection: "protected",
      slugState: {
        proposals: [],
        confirmed: null,
        // Identidade publicada, não proposta. O Arquiteto não a altera.
        publishedSlug: structure.path,
        publishedCanonical: structure.canonicalVerified ? structure.canonical : null,
      },
      lineage: emptyTerritoryLineage(),
      consolidation: null,
      pendingOperation: null,
      conflicts: [],
      reasons: [reason, `Origem: página publicada observada em ${structure.url}.`],
      provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: "Estrutura publicada adotada como silo candidato." },
    },
  };
}
