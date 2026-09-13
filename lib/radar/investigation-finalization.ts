/**
 * FINALIZAR É CONGELAR — e congelar é uma promessa.
 *
 * Até aqui, "finalizada" significava um carimbo no registro: quem clicou e
 * quando. A leitura continuava sendo recalculada a cada abertura, a partir das
 * extrações gravadas. Isso funciona enquanto o motor não muda — e o motor mudou
 * seis vezes nos últimos seis Gates.
 *
 * O problema não é teórico. Um Planejador que abre a investigação depois de uma
 * melhoria no agrupamento semântico veria OUTROS conceitos, OUTRAS lacunas e
 * OUTRO plano de links, sob o mesmo carimbo de "finalizada em 10/09". Ninguém
 * teria mentido; simplesmente não haveria como provar o que foi finalizado.
 *
 * O QUE ESTE MÓDULO GARANTE:
 *
 *   1. O QUE FOI CONGELADO TEM IDENTIDADE PRÓPRIA. `bundleHash` é o hash do
 *      CONTEÚDO congelado, não o do ArticleDNA. São perguntas diferentes: uma
 *      é "qual artigo?", a outra é "quais evidências?". Reaproveitar o hash do
 *      fundamento faria duas investigações distintas do mesmo artigo parecerem
 *      a mesma coisa.
 *
 *   2. CONGELAR NÃO É DUPLICAR. As extrações já vivem na versão da análise, que
 *      é append-only. O bundle guarda IDENTIDADES e CONCLUSÕES — o suficiente
 *      para provar o que foi finalizado sem carregar uma segunda cópia do
 *      payload bruto envelhecendo em paralelo.
 *
 *   3. INSUFICIÊNCIA CONSCIENTE É DIFERENTE DE INVESTIGAÇÃO INEXISTENTE. Quinze
 *      páginas lidas com amostra fraca são uma leitura fraca — e o USER pode
 *      encerrá-la assumindo a limitação, que fica escrita. Zero páginas lidas
 *      não são leitura nenhuma: não há o que congelar.
 *
 *   4. NADA CONGELA SOZINHO. Terminar o ANALYZE não finaliza. Só o clique.
 *
 * Domínio puro: sem fetch, sem storage, sem provider. Finalizar não pesquisa —
 * ele consolida o que o ANALYZE já produziu.
 */

import { z } from "zod";
import { assertRadarEvidenceAuthority, type RadarEvidenceResolution } from "./evidence-authority.ts";

import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import type { RadarDeepResearchRecord } from "./deep-research.ts";
import type { RadarInvestigationSufficiency } from "./investigation-sufficiency.ts";
import type { RadarPrimarySearchMode } from "./search-mode.ts";

/* ========================== a leitura de prontidão ====================== */

/**
 * TRÊS RESPOSTAS, NÃO DUAS.
 *
 * "Pode finalizar?" com sim/não esconde o caso que mais importa: a
 * investigação existe, é fraca, e a pessoa quer encerrá-la assim mesmo. Negar
 * isso obrigaria a refazer uma pesquisa que talvez não melhore — e a aceitar em
 * silêncio produziria um dossiê que parece sólido.
 */
export type RadarFinalizationReadinessState =
  | "FINALIZABLE"
  | "INSUFFICIENT_BUT_FINALIZABLE"
  | "TECHNICALLY_NOT_COMPLETED";

export type RadarFinalizationReadiness = {
  state: RadarFinalizationReadinessState;
  canFinalize: boolean;
  reason: string;
  /** A insuficiência que o USER assume ao encerrar. `null` quando não há. */
  acknowledgedInsufficiency: string | null;
};

export function radarFinalizationReadiness(input: {
  started: boolean;
  stale: boolean;
  alreadyFinalized: boolean;
  /** Selecionadas ainda sem extração e sem falha registrada. */
  pending: number;
  analyzed: number;
  failed: number;
  sufficiency: Pick<RadarInvestigationSufficiency, "level" | "headline" | "reasons">;
}): RadarFinalizationReadiness {
  const impedido = (reason: string): RadarFinalizationReadiness =>
    ({ state: "TECHNICALLY_NOT_COMPLETED", canFinalize: false, reason, acknowledgedInsufficiency: null });

  if (!input.started) return impedido("A pesquisa deste artigo ainda não foi iniciada.");
  if (input.alreadyFinalized) return impedido("Esta investigação já foi finalizada; a versão congelada não muda.");
  /*
   * FUNDAMENTO MUDADO NÃO CONGELA COMO CORRENTE.
   *
   * O bundle diria descrever uma versão do ArticleDNA que já não é a atual, e
   * quem o lesse depois planejaria um artigo que não existe mais.
   */
  if (input.stale) return impedido("O fundamento do artigo mudou depois desta investigação: refaça a pesquisa antes de congelar.");
  if (input.pending > 0) return impedido(`${input.pending} página(s) selecionada(s) ainda não foram analisadas nem falharam.`);
  /*
   * FALHA NÃO BLOQUEIA — ela vira limitação declarada.
   *
   * Quinze páginas lidas e três inacessíveis descrevem o mercado com uma perda
   * conhecida. Exigir zero falhas transformaria um site fora do ar em impedimento
   * permanente para encerrar a pesquisa.
   */
  if (!input.analyzed) {
    return impedido(input.failed
      ? `Nenhuma das ${input.failed} página(s) selecionada(s) pôde ser acessada: não existe investigação material para congelar.`
      : "Nenhuma página foi analisada: não existe investigação material para congelar.");
  }
  if (input.sufficiency.level === "BLOCKED") return impedido(input.sufficiency.headline);

  if (input.sufficiency.level === "INSUFFICIENT") {
    const motivo = input.sufficiency.reasons[0] || input.sufficiency.headline;
    return {
      state: "INSUFFICIENT_BUT_FINALIZABLE",
      canFinalize: true,
      reason: `${input.analyzed} página(s) foram lidas, e a amostra não sustenta leitura de mercado. Encerrar registra a investigação com a insuficiência declarada.`,
      acknowledgedInsufficiency: motivo,
    };
  }

  return {
    state: "FINALIZABLE",
    canFinalize: true,
    reason: `${input.analyzed} página(s) na amostra${input.failed ? ` · ${input.failed} sem acesso` : ""} · ${input.sufficiency.headline}.`,
    acknowledgedInsufficiency: null,
  };
}

/* ============================ o bundle congelado ======================== */

const FrozenQuerySchema = z.object({
  queryId: z.string().min(1),
  keywordId: z.string().nullable(),
  keyword: z.string().nullable(),
  role: z.string().min(1),
  /** Canônica é a SERP do artigo; auxiliar alimenta o universo. Nunca se trocam. */
  serpClass: z.enum(["canonical", "auxiliary"]),
  execution: z.string().min(1),
  reason: z.string(),
}).strict();

const FrozenSearchSchema = z.object({
  mode: z.string().min(1),
  canonicalQueries: z.number().int().nonnegative(),
  auxiliaryQueries: z.number().int().nonnegative(),
  queries: z.array(FrozenQuerySchema),
  uniqueReferences: z.number().int().nonnegative(),
  selectedReferences: z.number().int().nonnegative(),
  recurrentReferences: z.number().int().nonnegative(),
  auxiliaryOnlyReferences: z.number().int().nonnegative(),
}).strict();

const FrozenSampleSchema = z.object({
  analyzedSuccess: z.number().int().nonnegative(),
  comparablePages: z.number().int().nonnegative(),
  failedFinal: z.number().int().nonnegative(),
  /** As extrações continuam na versão da análise; aqui vai a referência. */
  extractionIds: z.array(z.string()),
}).strict();

const FrozenModelSchema = z.object({
  sufficiency: z.string().min(1),
  sufficiencyReasons: z.array(z.string()),
  intent: z.string().nullable(),
  dominantFormat: z.string().nullable(),
  recurrentConcepts: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  gaps: z.number().int().nonnegative(),
  differentiations: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  conceptIds: z.array(z.string()),
}).strict();

const FrozenLinkApplicationSchema = z.object({
  nodeId: z.string().min(1),
  slug: z.string().nullable(),
  direction: z.string().min(1),
  /** A relação aprovada pelo Arquiteto. Nunca muda por falta de evidência. */
  structuralRequirement: z.string().min(1),
  /** Se esta rodada achou onde aplicá-la. Zero é resposta legítima. */
  applicationStatus: z.string().min(1),
  recommendedOccurrences: z.number().int().nonnegative(),
  anchor: z.string(),
}).strict();

const FrozenLinksSchema = z.object({
  graphVersionId: z.string().nullable(),
  graphContentHash: z.string().nullable(),
  relatedDestinations: z.number().int().nonnegative(),
  outgoing: z.array(FrozenLinkApplicationSchema),
  incoming: z.array(FrozenLinkApplicationSchema),
  totalRecommendedLinks: z.number().int().nonnegative(),
  unresolvedRelations: z.number().int().nonnegative(),
}).strict();

const FrozenAuthoritySchema = z.object({
  ymylRelevance: z.string().min(1),
  claims: z.array(z.object({
    claimId: z.string().min(1),
    canonicalClaim: z.string(),
    ymylRelevance: z.string().min(1),
    recurrence: z.string().min(1),
  }).strict()),
  verifiedSources: z.array(z.object({
    domain: z.string().min(1),
    url: z.string().nullable(),
    sourceType: z.string().min(1),
    verified: z.boolean(),
  }).strict()),
  factualEvidence: z.array(z.object({
    claimId: z.string().min(1),
    sourceDomain: z.string().min(1),
    supportType: z.string().min(1),
  }).strict()),
  marketVsFactConflicts: z.array(z.object({
    claimId: z.string().min(1),
    canonicalClaim: z.string(),
  }).strict()),
  /** Requisitos PREPARADOS. Finalizar a pesquisa não conclui o especialista. */
  specialistRequirements: z.array(z.object({
    requirementId: z.string().min(1),
    claimId: z.string().min(1),
    kind: z.string().min(1),
    priority: z.string().min(1),
    specificQuestion: z.string(),
  }).strict()),
}).strict();

/*
 * O DOSSIÊ EDITORIAL CONGELADO — §26 do Gate 18.3.
 *
 * Aqui vale a mesma disciplina do resto do bundle: o que se congela é a
 * IDENTIDADE do que foi decidido, não uma segunda cópia dos modelos. Quais
 * blocos a investigação propôs, em que ordem e com que prioridade; quais
 * pontos foram preparados para o especialista; quais tópicos ganharam pauta de
 * vídeo. Com isso é possível provar depois que um blueprint em mãos é o mesmo
 * que foi congelado — que é a única pergunta que o congelamento precisa
 * responder.
 *
 * O texto completo continua derivável da fotografia congelada, e viaja inteiro
 * no handoff. Duplicá-lo aqui criaria duas verdades envelhecendo junto.
 *
 * Aditivo com `.default(...)`: bundles gravados antes deste gate continuam
 * legíveis e simplesmente não têm blueprint.
 */
const FrozenBlueprintSchema = z.object({
  readiness: z.string().min(1),
  sections: z.array(z.object({
    id: z.string().min(1),
    workingTitle: z.string(),
    conceptId: z.string(),
    priority: z.string().min(1),
    placement: z.string().min(1),
    questionIds: z.array(z.string()),
  }).strict()),
  essentialQuestions: z.number().int().nonnegative(),
  specialistBriefIds: z.array(z.string()),
  videoBriefIds: z.array(z.string()),
  /**
   * O SNAPSHOT DAS PAUTAS DE VÍDEO — risco R2 do Gate 0 de Vídeos.
   *
   * Congelar só os ids não bastava. O id nasce de um hash do conceito e do
   * rótulo, derivados da AMOSTRA: um RESET seguido de nova ANALYZE pode
   * produzir ids diferentes, e um extrato futuro apontando para
   * `videoBriefId` resolveria para nada. A pauta precisa provar
   * "respondi a ESTA pauta, desta investigação congelada" — e para isso ela
   * precisa estar aqui inteira, não referenciada.
   *
   * ADITIVO E OPCIONAL de propósito (§17). Bundles congelados antes deste
   * gate não são reescritos: eles chegam sem o campo, o `.default([])` os
   * mantém legíveis, e `radarFrozenVideoBriefReading` declara
   * `legacyIdsOnly` em vez de fingir que o snapshot sempre existiu.
   */
  videoBriefSnapshots: z.array(z.object({
    briefId: z.string().min(1),
    topic: z.string(),
    narrativePurpose: z.string(),
    whatToLookFor: z.array(z.string()),
    relatedSectionId: z.string().nullable(),
    relatedSectionTitle: z.string().nullable(),
    questions: z.array(z.string()),
    entities: z.array(z.string()),
    evidenceNeeded: z.string(),
    priority: z.string().min(1),
    provenance: z.array(z.object({ source: z.string().min(1), detail: z.string() }).strict()),
  }).strict()).default([]),
}).strict();

const FrozenDiscoverySchema = z.object({
  applicable: z.boolean(),
  applicability: z.string().min(1),
  required: z.boolean(),
  funnel: z.string().nullable(),
  answerableUnits: z.array(z.object({
    id: z.string().min(1),
    questionOrNeed: z.string(),
    importance: z.string().min(1),
    readiness: z.string().min(1),
    blockedBy: z.string().nullable(),
  }).strict()),
  coreQuestions: z.number().int().nonnegative(),
  definitionRequirements: z.number().int().nonnegative(),
  entityCoverageRequirements: z.number().int().nonnegative(),
  retrievabilityRequirements: z.number().int().nonnegative(),
  matrix: z.object({
    shared: z.number().int().nonnegative(),
    search: z.number().int().nonnegative(),
    aiDiscovery: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const RadarFrozenEvidenceBundleSchema = z.object({
  /** Identidade PRÓPRIA do bundle. Não é o id do artigo nem o da análise. */
  bundleId: z.string().min(1),
  /** Hash do CONTEÚDO congelado. Não é o hash do ArticleDNA. */
  bundleHash: z.string().min(1),
  frozenAt: z.string().min(1),
  frozenBy: z.string().min(1),
  conclusion: z.enum(["FINALIZABLE", "INSUFFICIENT_BUT_FINALIZABLE"]),
  /** A insuficiência que o USER assumiu ao encerrar, quando houve. */
  acknowledgedInsufficiency: z.string().nullable(),
  binding: z.object({
    brandId: z.string().min(1),
    articleId: z.string().min(1),
    articleDnaVersionId: z.string().min(1),
    articleDnaContentHash: z.string().nullable(),
  }).strict(),
  /** O fingerprint do fundamento congelado no início da investigação. */
  foundationFingerprint: z.string(),
  search: FrozenSearchSchema,
  sample: FrozenSampleSchema,
  model: FrozenModelSchema,
  links: FrozenLinksSchema,
  authority: FrozenAuthoritySchema,
  discovery: FrozenDiscoverySchema,
  /** O dossiê editorial da rodada. Aditivo: bundles antigos não o têm. */
  blueprint: FrozenBlueprintSchema.nullable().default(null),
  limitations: z.array(z.string()),
}).strict();

export type RadarFrozenEvidenceBundle = z.infer<typeof RadarFrozenEvidenceBundleSchema>;

/* ============================== a identidade ============================ */

function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Serialização estável: a mesma evidência produz sempre o mesmo texto. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([chave]) => chave !== "bundleHash")
    .sort(([esquerda], [direita]) => esquerda.localeCompare(direita));
  return `{${entradas.map(([chave, item]) => `${JSON.stringify(chave)}:${canonico(item)}`).join(",")}}`;
}

/**
 * O HASH DO QUE FOI CONGELADO — e por que ele não pode ser o do ArticleDNA.
 *
 * O hash do fundamento responde "qual artigo?". Este responde "quais
 * evidências?". Duas investigações do mesmo artigo, feitas em semanas
 * diferentes, têm o mesmo hash de fundamento e evidências completamente
 * distintas — e é exatamente essa diferença que precisa ser provável depois.
 */
export const radarFrozenBundleHash = (bundle: Omit<RadarFrozenEvidenceBundle, "bundleHash">) =>
  assinatura(canonico(bundle));

/* =============================== a montagem ============================= */

export type RadarFreezeResult =
  | { ok: true; bundle: RadarFrozenEvidenceBundle }
  | { ok: false; reason: string };

/**
 * O CONGELAMENTO, A PARTIR DO QUE JÁ FOI OBSERVADO.
 *
 * Nada é recalculado aqui e nada é buscado: as camadas dos Gates 8 a 13 chegam
 * prontas, e o que este módulo faz é escolher o que precisa sobreviver e
 * amarrar tudo a uma identidade verificável.
 */
export function freezeRadarEvidenceBundle(input: {
  readiness: RadarFinalizationReadiness;
  observed: RadarCompetitiveObservedModel;
  record: RadarDeepResearchRecord;
  mode: RadarPrimarySearchMode;
  sufficiency: Pick<RadarInvestigationSufficiency, "level" | "headline" | "reasons">;
  /** Divergências já resolvidas pela hierarquia canônica, quando houver. */
  resolutions?: readonly RadarEvidenceResolution[];
  /**
   * O dossiê editorial da MESMA rodada — §26.
   *
   * Opcional para não quebrar quem congela sem ele; quando vem, congela junto,
   * porque a pauta do especialista e a de vídeos descrevem exatamente esta
   * investigação e não podem envelhecer em ritmo diferente dela.
   */
  blueprint?: {
    readiness: { state: string };
    sections: ReadonlyArray<{ id: string; workingTitle: string; conceptId: string; priority: string; placement: string; questions: ReadonlyArray<{ id: string }> }>;
    essentialQuestions: readonly unknown[];
    specialistBriefs: ReadonlyArray<{ requirementId: string }>;
    /* A pauta INTEIRA: o snapshot congelado precisa dela, não só do id. */
    videoBriefs: ReadonlyArray<RadarVideoBriefSnapshotInput>;
  } | null;
  frozenBy: string;
  frozenAt: string;
}): RadarFreezeResult {
  if (!input.readiness.canFinalize) return { ok: false, reason: input.readiness.reason };
  if (input.readiness.state === "TECHNICALLY_NOT_COMPLETED") return { ok: false, reason: input.readiness.reason };

  const observed = input.observed;
  const identidade = observed.identity;

  /*
   * NENHUMA INVERSÃO DE AUTORIDADE VIAJA PARA O ESTADO FINAL.
   *
   * Uma resolução em que interpretação prevaleceu sobre observação é erro em
   * tempo de execução em qualquer lugar do Radar — e seria pior aqui, onde ela
   * ficaria congelada com aparência de conclusão auditada.
   */
  for (const resolucao of [...(input.resolutions || []), ...observed.aiDiscovery.conflicts]) {
    assertRadarEvidenceAuthority(resolucao);
  }

  const plano = observed.internalLinkPlan;
  const aplicacao = (item: {
    nodeId: string; slug: string | null; direction?: string; structuralRequirement: string;
    applicationStatus: string; recommendedOccurrences: number; anchor: { recommendedAnchor: string };
  }) => ({
    nodeId: item.nodeId,
    slug: item.slug,
    direction: item.direction || "outbound",
    structuralRequirement: item.structuralRequirement,
    applicationStatus: item.applicationStatus,
    recommendedOccurrences: item.recommendedOccurrences,
    anchor: item.anchor.recommendedAnchor,
  });

  const saidas = [...plano.outgoing, ...(plano.siloPage ? [plano.siloPage] : [])].map(aplicacao);
  const entradas = plano.incoming.map(item => aplicacao({
    nodeId: item.sourceNodeId, slug: null, direction: "inbound",
    structuralRequirement: item.structuralRequirement, applicationStatus: item.applicationStatus,
    recommendedOccurrences: item.recommendedOccurrences, anchor: item.anchor,
  }));

  const autoridade = observed.authorityEvidence;
  const descoberta = observed.aiDiscovery;

  const semHash: Omit<RadarFrozenEvidenceBundle, "bundleHash"> = {
    bundleId: `bundle:${assinatura(`${identidade.articleId}|${identidade.articleDnaVersionId}|${input.record.startedAt}|${input.frozenAt}`)}`,
    frozenAt: input.frozenAt,
    frozenBy: input.frozenBy,
    conclusion: input.readiness.state === "INSUFFICIENT_BUT_FINALIZABLE" ? "INSUFFICIENT_BUT_FINALIZABLE" : "FINALIZABLE",
    acknowledgedInsufficiency: input.readiness.acknowledgedInsufficiency,
    binding: {
      brandId: identidade.brandId,
      articleId: identidade.articleId,
      articleDnaVersionId: identidade.articleDnaVersionId,
      articleDnaContentHash: identidade.articleDnaContentHash,
    },
    foundationFingerprint: input.record.fingerprint.value,
    search: {
      mode: input.mode,
      canonicalQueries: observed.sample.canonicalQueries,
      auxiliaryQueries: observed.sample.auxiliaryQueries,
      queries: input.record.queries.map(query => ({
        queryId: query.queryId,
        keywordId: query.keywordId,
        keyword: query.keyword,
        role: query.role,
        serpClass: query.serpClass,
        execution: query.execution,
        reason: query.reason,
      })),
      uniqueReferences: observed.sample.uniqueReferences,
      selectedReferences: observed.sample.selectedReferences,
      recurrentReferences: observed.sample.recurrentReferences,
      auxiliaryOnlyReferences: observed.sample.auxiliaryOnlyReferences,
    },
    sample: {
      analyzedSuccess: observed.sample.analyzedSuccess,
      comparablePages: observed.sample.comparablePages,
      failedFinal: observed.sample.failedFinal,
      extractionIds: observed.competitors.filter(item => item.extractionStatus === "success").map(item => item.url),
    },
    model: {
      sufficiency: input.sufficiency.level,
      sufficiencyReasons: [...input.sufficiency.reasons],
      intent: observed.intent.observedInSerp || observed.intent.declared,
      dominantFormat: observed.formats.dominant?.label || null,
      recurrentConcepts: observed.concepts.recurrent.length + observed.concepts.confirmed.length,
      questions: observed.questions.length,
      gaps: observed.gaps.length,
      differentiations: observed.differentiations.length,
      conflicts: observed.conflicts.length,
      conceptIds: observed.concepts.all.map(item => item.id),
    },
    links: {
      graphVersionId: observed.internalLinks.graphVersionId,
      graphContentHash: observed.internalLinks.graphContentHash,
      relatedDestinations: observed.internalLinks.relatedInternalPages.length,
      outgoing: saidas,
      incoming: entradas,
      totalRecommendedLinks: plano.totalRecommendedLinks,
      unresolvedRelations: [...saidas, ...entradas].filter(item => item.applicationStatus !== "RESOLVED").length,
    },
    authority: {
      ymylRelevance: autoridade.ymylAssessment.relevance,
      claims: autoridade.claims.map(claim => ({
        claimId: claim.claimId,
        canonicalClaim: claim.canonicalClaim,
        ymylRelevance: claim.ymyl.relevance,
        recurrence: claim.market.recurrence,
      })),
      verifiedSources: autoridade.sources.map(source => ({
        domain: source.domain, url: source.url, sourceType: source.type, verified: source.verified,
      })),
      factualEvidence: autoridade.factualEvidence.map(item => ({
        claimId: item.claimId, sourceDomain: item.sourceDomain, supportType: item.supportType,
      })),
      marketVsFactConflicts: autoridade.marketVsFactConflicts.map(item => ({
        claimId: item.claimId, canonicalClaim: item.canonicalClaim,
      })),
      specialistRequirements: autoridade.specialistReviewRequirements.map(item => ({
        requirementId: item.requirementId, claimId: item.claimId, kind: item.kind,
        priority: item.priority, specificQuestion: item.specificQuestion,
      })),
    },
    discovery: {
      applicable: descoberta.applicable,
      applicability: descoberta.applicability,
      required: descoberta.required,
      funnel: descoberta.funnel.read,
      answerableUnits: descoberta.answerableUnits.map(unit => ({
        id: unit.id, questionOrNeed: unit.questionOrNeed, importance: unit.importance,
        readiness: unit.readiness, blockedBy: unit.blockedBy,
      })),
      coreQuestions: descoberta.questions.filter(item => item.classes.includes("CORE_QUESTION")).length,
      definitionRequirements: descoberta.definitionRequirements.length,
      entityCoverageRequirements: descoberta.entityCoverageRequirements.length,
      retrievabilityRequirements: descoberta.retrievabilityRequirements.length,
      /* A matriz congela os três números; a frase que os explica é da tela. */
      matrix: {
        shared: descoberta.matrix.shared,
        search: descoberta.matrix.search,
        aiDiscovery: descoberta.matrix.aiDiscovery,
      },
    },
    /* §26 — a identidade do dossiê editorial congela junto da evidência. */
    blueprint: input.blueprint
      ? {
        readiness: input.blueprint.readiness.state,
        sections: input.blueprint.sections.map(secao => ({
          id: secao.id, workingTitle: secao.workingTitle, conceptId: secao.conceptId,
          priority: secao.priority, placement: secao.placement,
          questionIds: secao.questions.map(pergunta => pergunta.id),
        })),
        essentialQuestions: input.blueprint.essentialQuestions.length,
        specialistBriefIds: input.blueprint.specialistBriefs.map(item => item.requirementId),
        videoBriefIds: input.blueprint.videoBriefs.map(item => item.id),
        /* A pauta inteira, não a referência: é o que sobrevive a um RESET. */
        videoBriefSnapshots: input.blueprint.videoBriefs.map(brief => ({
          briefId: brief.id,
          topic: brief.topic,
          narrativePurpose: brief.narrativePurpose,
          whatToLookFor: [...brief.whatToLookFor],
          relatedSectionId: brief.relatedSectionId,
          relatedSectionTitle: brief.relatedSectionTitle,
          questions: [...brief.questions],
          entities: [...brief.entities],
          evidenceNeeded: brief.evidenceNeeded,
          priority: brief.priority,
          provenance: brief.provenance.map(item => ({ source: item.source, detail: item.detail })),
        })),
      }
      : null,
    limitations: [...new Set([
      ...observed.limitations,
      ...(input.readiness.acknowledgedInsufficiency ? [input.readiness.acknowledgedInsufficiency] : []),
      ...(observed.sample.failedFinal ? [`${observed.sample.failedFinal} página(s) selecionada(s) não puderam ser acessadas e ficaram fora da amostra congelada.`] : []),
    ])],
  };

  const bundle: RadarFrozenEvidenceBundle = { ...semHash, bundleHash: radarFrozenBundleHash(semHash) };
  return { ok: true, bundle: RadarFrozenEvidenceBundleSchema.parse(bundle) };
}

/* ========================== as invariantes do congelado ================= */

/**
 * O BUNDLE FOI ALTERADO DESDE QUE FOI CONGELADO?
 *
 * O hash é recalculado sobre o conteúdo e comparado com o que veio gravado.
 * Uma edição silenciosa — um número corrigido, uma limitação removida — deixa
 * de passar despercebida e vira erro no ponto em que alguém for usá-la.
 */
export function assertRadarFrozenBundleIntegrity(bundle: RadarFrozenEvidenceBundle): void {
  if (!bundle.binding.articleId.trim()) throw new Error("RADAR_FROZEN_BUNDLE_WITHOUT_ARTICLE");
  if (!bundle.binding.articleDnaVersionId.trim()) throw new Error("RADAR_FROZEN_BUNDLE_WITHOUT_ARTICLE_DNA_VERSION");
  const { bundleHash, ...conteudo } = bundle;
  if (radarFrozenBundleHash(conteudo) !== bundleHash) throw new Error("RADAR_FROZEN_BUNDLE_MUTATED");
}

/**
 * O bundle congelado ainda descreve o artigo que se tem em mãos?
 *
 * Versão E hash: a versão diz que é o mesmo contrato, o hash diz que o conteúdo
 * dele não mudou por baixo. Uma sem a outra deixa passar o caso que interessa.
 */
export function radarFrozenBundleMatchesArticle(bundle: RadarFrozenEvidenceBundle, article: {
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
}): { matches: boolean; reason: string } {
  if (bundle.binding.articleId !== article.articleId) {
    return { matches: false, reason: "A investigação congelada pertence a outro artigo." };
  }
  if (bundle.binding.articleDnaVersionId !== article.articleDnaVersionId) {
    return { matches: false, reason: `A investigação foi congelada sobre a versão ${bundle.binding.articleDnaVersionId} do ArticleDNA, e a corrente é ${article.articleDnaVersionId}.` };
  }
  if (bundle.binding.articleDnaContentHash !== article.articleDnaContentHash) {
    return { matches: false, reason: "A versão é a mesma, mas o conteúdo do ArticleDNA mudou desde a investigação." };
  }
  return { matches: true, reason: "A investigação congelada descreve exatamente esta versão do ArticleDNA." };
}

/** O rótulo do encerramento, para a tela não reinventar o vocabulário. */
export const radarFinalizationLabel = (state: RadarFinalizationReadinessState) => ({
  FINALIZABLE: "Pronta para finalizar",
  INSUFFICIENT_BUT_FINALIZABLE: "Finalizável com insuficiência declarada",
  TECHNICALLY_NOT_COMPLETED: "Sem investigação material para finalizar",
}[state]);

/* ================ a pauta de vídeo, amarrada à investigação ============== */

/** A forma que o congelamento exige de uma pauta de vídeo. */
export type RadarVideoBriefSnapshotInput = {
  id: string;
  topic: string;
  narrativePurpose: string;
  whatToLookFor: readonly string[];
  relatedSectionId: string | null;
  relatedSectionTitle: string | null;
  questions: readonly string[];
  entities: readonly string[];
  evidenceNeeded: string;
  priority: string;
  provenance: ReadonlyArray<{ source: string; detail: string }>;
};

export type RadarFrozenVideoBriefSnapshot =
  NonNullable<RadarFrozenEvidenceBundle["blueprint"]>["videoBriefSnapshots"][number];

export type RadarFrozenVideoBriefReading = {
  /** A pauta inteira, mais o que dá significado ao id dela. */
  briefs: Array<RadarFrozenVideoBriefSnapshot & RadarFrozenVideoBriefBinding>;
  /**
   * `true` quando o bundle foi congelado antes deste contrato e só guardou ids.
   * Declarado, nunca reconstruído: fingir que o snapshot sempre existiu seria
   * inventar história.
   */
  legacyIdsOnly: boolean;
  /** Os ids sem snapshot, quando o bundle é legado. */
  idsWithoutSnapshot: string[];
};

/** O que amarra uma pauta à investigação que lhe dá significado — §16. */
export type RadarFrozenVideoBriefBinding = {
  frozenBundleId: string;
  frozenBundleHash: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
};

/**
 * A PAUTA CONGELADA, LEGÍVEL E ANCORADA.
 *
 * Um extrato futuro precisa provar "respondi a ESTA pauta, desta investigação
 * congelada". O `videoBriefId` sozinho não prova: ele é derivado da amostra e
 * pode mudar depois de um RESET. Por isso cada pauta sai daqui carregando o
 * bundle e a versão do ArticleDNA que a produziram.
 *
 * Leitura pura: não recalcula nada, não toca no blueprint vivo e não reescreve
 * bundle nenhum.
 */
export function radarFrozenVideoBriefReading(bundle: RadarFrozenEvidenceBundle): RadarFrozenVideoBriefReading {
  const blueprint = bundle.blueprint;
  if (!blueprint) return { briefs: [], legacyIdsOnly: false, idsWithoutSnapshot: [] };

  const binding: RadarFrozenVideoBriefBinding = {
    frozenBundleId: bundle.bundleId,
    frozenBundleHash: bundle.bundleHash,
    articleDnaVersionId: bundle.binding.articleDnaVersionId,
    articleDnaContentHash: bundle.binding.articleDnaContentHash,
  };

  const snapshots = blueprint.videoBriefSnapshots || [];
  const comSnapshot = new Set(snapshots.map(item => item.briefId));
  const idsWithoutSnapshot = blueprint.videoBriefIds.filter(id => !comSnapshot.has(id));

  return {
    briefs: snapshots.map(snapshot => ({ ...snapshot, ...binding })),
    /* Ids sem pauta correspondente é a assinatura do bundle antigo. */
    legacyIdsOnly: idsWithoutSnapshot.length > 0 && snapshots.length === 0,
    idsWithoutSnapshot,
  };
}
