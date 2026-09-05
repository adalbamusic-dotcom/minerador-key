import {
  buildScenarioUniverse,
  type SiloArchitectureScenario,
  type TerritoryScenarioEntry,
} from "./architecture-scenario.ts";
import {
  resolveKeywordTerritoryState,
  type KeywordTerritoryAssignment,
  type TerritoryMembershipState,
} from "./territory.ts";
import type { TerritorialLandscape } from "./territorial-landscape.ts";
import { qualifiesAsNewSiloHead, type KeywordUniverse } from "./keyword-universe.ts";

/**
 * Lógica territorial — hipótese determinística, nunca decisão.
 *
 * Responde "quais universos narrativos são plausíveis para estas KeywordDNAs",
 * a partir do TerritorialLandscape. Não confirma território, não cria SiloDNA,
 * não grava membership, não chama SERP nem IA.
 *
 * INV-T6/C3: PROIBIDA qualquer regra "N keywords ⇒ novo Silo". A contagem de
 * keywords nunca entra na decisão de criar território.
 *
 * Similaridade lexical isolada não vira decisão: ela é um sinal entre outros e
 * só produz hipótese, sempre com a evidência declarada ao lado.
 */

/* ------------------------- adaptador de membership ------------------------ */

/**
 * Ponte entre a fonte canônica de membership — `payload.territoryRef` +
 * `payload.territoryAssignment` do item de workflow da keyword — e a entrada do
 * TerritorialLandscape. Estado incoerente é preservado como incoerente, nunca
 * normalizado para um dos lados.
 */
export function territorialAssignmentsFromWorkflowPayloads(input: {
  brandId: string;
  payloads: ReadonlyMap<string, unknown>;
}): { assignments: KeywordTerritoryAssignment[]; incoherentKeywordIds: string[] } {
  const assignments: KeywordTerritoryAssignment[] = [];
  const incoherentKeywordIds: string[] = [];

  for (const [keywordId, payload] of input.payloads) {
    const resolution = resolveKeywordTerritoryState(payload);
    if (resolution.state === "incoherent") {
      incoherentKeywordIds.push(keywordId);
      continue;
    }
    // Keyword ainda não endereçada não tem decisão: fica fora da lista e o
    // Landscape a projeta como pendente explícita (INV-T2).
    if (resolution.state === "unaddressed") continue;

    const decision = resolution.decision;
    assignments.push({
      keywordId,
      brandId: input.brandId,
      territoryRef: resolution.territoryRef,
      state: (decision?.state ?? (resolution.territoryRef ? "existing_silo_match" : "unassigned")) as TerritoryMembershipState,
      reason: decision?.reason || "Decisão de silo registrada sem motivo declarado.",
      source: decision?.source ?? "system",
      decidedAt: decision?.decidedAt ?? "1970-01-01T00:00:00.000Z",
    } as KeywordTerritoryAssignment);
  }

  return { assignments, incoherentKeywordIds: incoherentKeywordIds.sort() };
}

/* ---------------------------- hipótese territorial ---------------------------- */

export type TerritorialHypothesisTarget = {
  territoryRef: string | null;
  existingSiloId: string | null;
  score: number;
  reason: string;
};

export type TerritorialHypothesis = {
  keywordId: string;
  /** Vocabulário canônico de membership; a Lógica não inventa estados. */
  state: TerritoryMembershipState;
  targets: TerritorialHypothesisTarget[];
  evidence: string[];
  /**
   * Papel no universo lido. Read-model puro: não vira enum gravado nem
   * membership — `territoryRef` + `territoryAssignment` seguem sendo a verdade.
   */
  universeRole?: "narrative_head" | "context_of_new_silo" | "member" | null;
  /** Cabeceira do grupo a que esta keyword pertence, quando houver. */
  headKeywordId?: string | null;
};

export type TerritorialLogicResult = {
  brandId: string;
  hypotheses: TerritorialHypothesis[];
  /** Keywords já decididas por humano/sistema: a Lógica não as reabre. */
  alreadyAddressedKeywordIds: string[];
};

const AFFINITY_FLOOR = 0.34;
/** Dois destinos dentro desta distância são ambíguos, não um vencedor. */
const AMBIGUITY_DELTA = 0.12;

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const tokens = (value: unknown) => new Set(normalize(value).split(/[^a-z0-9]+/).filter(token => token.length > 2));

const overlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
};

const keywordText = (keyword: Record<string, unknown>) => {
  const semantic = (keyword.analise_semantica || {}) as Record<string, unknown>;
  return {
    text: tokens(keyword.keyword),
    entity: tokens(semantic.entidade_central),
    intent: normalize(keyword.intent ?? semantic.intencao_principal),
  };
};

/**
 * Hipóteses territoriais para as keywords ainda não endereçadas.
 *
 * A Lógica só propõe destino entre estruturas que JÁ existem: território
 * declarado ou Silo existente. Quando nada sustenta um destino, a hipótese é
 * `new_silo_candidate` — um sinal de que talvez exista um universo novo, sem
 * criar território nem `territoryRef` (que só o servidor emite).
 */
export function deriveTerritorialLogic(input: {
  landscape: TerritorialLandscape;
  keywords: ReadonlyArray<{ id: string; [key: string]: unknown }>;
  /**
   * Leitura do lote inteiro. Opcional por compatibilidade: sem ela a Lógica
   * mantém o comportamento anterior, keyword a keyword.
   */
  universe?: KeywordUniverse | null;
}): TerritorialLogicResult {
  const { landscape } = input;
  const addressed = new Set<string>([
    ...landscape.candidateTerritories.flatMap(territory => territory.keywordRefs),
    ...landscape.confirmedTerritories.flatMap(territory => territory.keywordRefs),
    ...landscape.otherTerritories.flatMap(territory => territory.keywordRefs),
  ]);
  const explicitlyUnassigned = new Set(landscape.unassignedKeywords
    .filter(entry => entry.state !== "unassigned" || !entry.reason.includes("ainda sem decisão"))
    .map(entry => entry.keywordId));

  const territories = [...landscape.candidateTerritories, ...landscape.confirmedTerritories];
  // A evidência é lida por humano: mostra o nome do silo, não o ref opaco.
  const siloLabel = (territoryRef: string | null) => {
    const found = territories.find(item => item.territoryRef === territoryRef);
    return found?.name || found?.centralEntity || territoryRef || "silo sem nome";
  };
  const structureLabel = (siloId: string | null) =>
    landscape.existingStructures.find(item => item.siloId === siloId)?.name || siloId || "estrutura sem nome";
  const hypotheses: TerritorialHypothesis[] = [];
  const universe = input.universe ?? null;
  const keywordById = new Map(input.keywords.map(item => [String(item.id), item]));
  const keywordLabel = (id: string) => String((keywordById.get(id) as { keyword?: unknown } | undefined)?.keyword || id);

  /**
   * Destinos de uma keyword contra as estruturas que já existem. Memoizado
   * porque a cabeceira do grupo precisa ser consultada antes da própria vez
   * dela na iteração (comparação em nível de grupo).
   */
  const targetsByKeyword = new Map<string, TerritorialHypothesisTarget[]>();
  const computeTargets = (keywordId: string): { targets: TerritorialHypothesisTarget[]; evidence: string[] } => {
    // Evidência só interessa na passagem da própria keyword; o cache guarda os
    // destinos, que é o que a consulta em nível de grupo precisa.
    const cached = targetsByKeyword.get(keywordId);
    if (cached) return { targets: cached, evidence: [] };
    const keyword = keywordById.get(keywordId);
    const facts = keywordText((keyword || {}) as Record<string, unknown>);
    const targets: TerritorialHypothesisTarget[] = [];
    const evidence: string[] = [];

    for (const territory of territories) {
      const entityAffinity = overlap(facts.entity, tokens(territory.centralEntity));
      const textAffinity = overlap(facts.text, tokens(territory.centralEntity));
      const includes = territory.boundary.includes.some(term => facts.text.has(normalize(term)) || facts.entity.has(normalize(term)));
      const excludes = territory.boundary.excludes.some(term => facts.text.has(normalize(term)));
      if (excludes) {
        evidence.push(`${siloLabel(territory.territoryRef)}: a fronteira exclui explicitamente esta keyword.`);
        continue;
      }
      const intentAffinity = facts.intent && normalize(territory.macroIntent)
        ? (facts.intent === normalize(territory.macroIntent) ? 1 : 0.5)
        : 0.5;
      // Entidade e fronteira pesam mais que o texto: similaridade lexical
      // sozinha nunca sustenta um destino.
      const score = (entityAffinity * 0.45) + (textAffinity * 0.15) + (intentAffinity * 0.2) + (includes ? 0.2 : 0);
      if (score < AFFINITY_FLOOR) continue;
      targets.push({
        territoryRef: territory.territoryRef,
        existingSiloId: territory.existingSiloRef?.siloId ?? null,
        score: Math.round(score * 100) / 100,
        reason: includes
          ? "Entidade compatível e termo dentro da fronteira declarada."
          : "Entidade e intenção compatíveis com a fronteira declarada.",
      });
    }

    for (const structure of landscape.existingStructures) {
      if (structure.anchoredByTerritoryRef) continue;
      const affinity = overlap(facts.text, tokens(structure.name || structure.siloId));
      if (affinity < AFFINITY_FLOOR) continue;
      targets.push({
        territoryRef: null,
        existingSiloId: structure.siloId,
        score: Math.round(affinity * 100) / 100,
        reason: "Afinidade com estrutura existente; pode fortalecê-la em vez de criar um silo novo.",
      });
    }

    targets.sort((left, right) => right.score - left.score || String(left.territoryRef).localeCompare(String(right.territoryRef)));
    targetsByKeyword.set(keywordId, targets);
    return { targets, evidence };
  };

  for (const keyword of input.keywords) {
    const keywordId = String(keyword.id);
    if (addressed.has(keywordId) || explicitlyUnassigned.has(keywordId)) continue;

    const computed = computeTargets(keywordId);
    const targets = computed.targets;
    const evidence = [...computed.evidence];

    const cluster = universe?.clusterOf(keywordId) ?? null;
    const headId = cluster?.headKeywordId ?? null;
    let universeRole: TerritorialHypothesis["universeRole"] = null;

    // §15 — a pergunta é sobre o GRUPO, não sobre a keyword solta: se a
    // cabeceira da narrativa já tem destino, o grupo inteiro cabe lá.
    if (!targets.length && headId && headId !== keywordId) {
      const headTargets = computeTargets(headId).targets;
      if (headTargets?.length) {
        targets.push(...headTargets.map(target => ({
          ...target,
          reason: "O grupo narrativo inteiro tem destino nesta estrutura.",
        })));
        evidence.push(`O grupo encabeçado por ${keywordLabel(headId)} já tem destino; fortalecer o existente vem antes de criar universo novo.`);
      }
    }

    let state: TerritoryMembershipState;
    if (!targets.length) {
      // Sem universo lido, mantém o comportamento anterior. Com universo, criar
      // Silo exige cabeceira relativa, coerência e profundidade vertical — não
      // contagem de keywords (INV-T6) nem volume isolado.
      const gate = universe ? qualifiesAsNewSiloHead({ universe, keywordId }) : null;
      if (!universe || gate?.qualifies) {
        state = "new_silo_candidate";
        universeRole = universe ? "narrative_head" : null;
        evidence.push(universe && gate
          ? `Cabeceira de narrativa própria: ${gate.reason}`
          : "Nenhum silo ou estrutura existente sustenta esta keyword.");
      } else {
        // Não justificar Silo próprio NÃO significa virar Article agora: a
        // keyword segue disponível, sem membership e sem decisão.
        state = "unassigned";
        universeRole = headId && headId !== keywordId ? "context_of_new_silo" : "member";
        evidence.push(headId && headId !== keywordId
          ? `Relacionada ao grupo encabeçado por ${keywordLabel(headId)}; não justifica silo próprio.`
          : gate?.reason || "Não justifica silo próprio neste lote.");
      }
    } else if (targets.length > 1 && targets[0].score - targets[1].score <= AMBIGUITY_DELTA) {
      state = "ambiguous_silo";
      evidence.push(`Mais de um destino plausível dentro de ${AMBIGUITY_DELTA} de diferença.`);
    } else if (targets[0].territoryRef) {
      state = "existing_silo_match";
      evidence.push(`Afinidade dominante com o silo ${siloLabel(targets[0].territoryRef)}.`);
    } else {
      state = "expand_existing_silo";
      evidence.push(`Pode fortalecer a estrutura existente ${structureLabel(targets[0].existingSiloId)}.`);
    }

    hypotheses.push({ keywordId, state, targets, evidence, universeRole, headKeywordId: headId });
  }

  return {
    brandId: landscape.brandId,
    hypotheses: hypotheses.sort((left, right) => left.keywordId.localeCompare(right.keywordId)),
    alreadyAddressedKeywordIds: [...addressed].sort(),
  };
}

/* --------------------------- cenário de nível Silo --------------------------- */

const territoryEntry = (
  territory: TerritorialLandscape["candidateTerritories"][number],
  extraKeywordIds: readonly string[],
): TerritoryScenarioEntry => ({
  territoryRef: territory.territoryRef,
  name: territory.name,
  centralEntity: territory.centralEntity,
  macroIntent: territory.macroIntent,
  boundary: { includes: [...territory.boundary.includes], excludes: [...territory.boundary.excludes] },
  keywordRefs: [...new Set([...territory.keywordRefs, ...extraKeywordIds])].sort(),
  territoryKind: territory.territoryKind,
  architecturalOrigin: territory.architecturalOrigin,
  publicationProtection: territory.publicationProtection,
  // Slug confirmado é decisão humana; sem ele, a proposta vigente, se houver.
  slugProposal: territory.slugState.confirmed ?? territory.slugState.proposals[0]?.slug ?? null,
  existingSiloId: territory.existingSiloRef?.siloId ?? null,
  conflictCodes: territory.conflicts.map(conflict => conflict.code).sort(),
});

/**
 * Cenário candidato de nível Silo produzido pela Lógica.
 *
 * Só posiciona keywords em territórios que JÁ existem. Hipótese de universo
 * novo e ambiguidade permanecem em `unassignedKeywords` com o motivo declarado:
 * criar um `territoryRef` aqui usurparia a emissão do servidor, e decidir por
 * ambiguidade usurparia o humano.
 */
export async function buildLogicSiloScenario(input: {
  landscape: TerritorialLandscape;
  logic: TerritorialLogicResult;
  scenarioId?: string;
}): Promise<SiloArchitectureScenario> {
  const { landscape, logic } = input;
  const proposedByTerritory = new Map<string, string[]>();
  const unassigned: SiloArchitectureScenario["unassignedKeywords"] = [];

  for (const hypothesis of logic.hypotheses) {
    const winner = hypothesis.state === "existing_silo_match" ? hypothesis.targets[0] : null;
    if (winner?.territoryRef) {
      proposedByTerritory.set(winner.territoryRef, [...(proposedByTerritory.get(winner.territoryRef) || []), hypothesis.keywordId]);
      continue;
    }
    unassigned.push({
      keywordId: hypothesis.keywordId,
      state: hypothesis.state,
      reason: hypothesis.evidence[0] || "Hipótese sem destino aplicável.",
    });
  }

  // Keywords já endereçadas que estão fora de território seguem como estavam.
  for (const entry of landscape.unassignedKeywords) {
    if (logic.hypotheses.some(hypothesis => hypothesis.keywordId === entry.keywordId)) continue;
    unassigned.push({ keywordId: entry.keywordId, state: entry.state, reason: entry.reason });
  }

  const territories = [...landscape.candidateTerritories, ...landscape.confirmedTerritories]
    .map(territory => territoryEntry(territory, proposedByTerritory.get(territory.territoryRef) || []))
    .sort((left, right) => left.territoryRef.localeCompare(right.territoryRef));

  const universeKeywordIds = [
    ...territories.flatMap(territory => territory.keywordRefs),
    ...unassigned.map(entry => entry.keywordId),
  ];

  return {
    schemaVersion: 1,
    level: "silo",
    scenarioId: input.scenarioId || `scenario:silo:logic:${landscape.brandId}`,
    brandId: landscape.brandId,
    scenarioType: "logic",
    capability: "complete",
    universe: await buildScenarioUniverse(universeKeywordIds),
    baseRef: null,
    sourceRefs: [{ sourceType: "engine", entityId: landscape.brandId }],
    territories,
    unassignedKeywords: unassigned.sort((left, right) => left.keywordId.localeCompare(right.keywordId)),
    provenance: { producedBy: "engine", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
  };
}
