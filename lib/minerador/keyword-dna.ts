import { z } from "zod";
import { resolveCanonicalKeywordSnapshot, type CanonicalKeywordSnapshotInput } from "./canonical-keyword-snapshot.ts";
import type { CanonicalFieldResolution, CanonicalFieldSource } from "./logical-read-model.ts";
import { readSerpEvidenceRecord } from "./serp-evidence-record.ts";
import { isFullyConsolidatedQualification, qualificationConsolidatedAxes, type KeywordSemanticQualification } from "./keyword-semantic-qualification.ts";
import { approvedPackageSignature, type ApprovedKeywordPackage } from "./approved-package.ts";

/**
 * KEYWORDDNA FECHADO — o contrato que o Minerador exporta.
 *
 * Até aqui o "KeywordDNA" era um saco de chaves soltas em `analise_semantica`
 * mais quatro colunas, e quem consumia precisava conhecer os nomes internos:
 * `intencao_principal`, `modificadores`, `dna_confianca`, `problema_percebido`.
 * Treze deles são lidos pelo Arquiteto hoje, com normalização própria. Isso é
 * o Minerador vazando por dentro de outro módulo.
 *
 * Este arquivo é a única fronteira. Ele conhece os nomes internos; ninguém
 * mais precisa. E resolve a pergunta que hoje tem duas respostas — a tabela
 * mostra a Lógica, o Arquiteto prefere a SERP — em uma só, com a fonte
 * declarada.
 *
 * Autoridade (SDD 2026-08-27, adendo A.2): SERP conclusiva fecha a dimensão
 * que evidencia; decisão humana não a substitui arbitrariamente; a Lógica é
 * hipótese inicial. Sem evidência suficiente o valor é indeterminado — nunca
 * "Pendente" apresentado como valor.
 *
 * Domínio puro. Não persiste, não busca, não chama provider.
 */

export const KEYWORD_DNA_SCHEMA_VERSION = "keyword-dna-v1" as const;

const AxisSourceSchema = z.enum(["serp", "human", "logic"]).nullable();
const AxisStateSchema = z.enum(["resolved", "confirmed_unknown", "unresolved"]);

export const KeywordDnaAxisSchema = z.object({
  value: z.string().nullable(),
  label: z.string(),
  state: AxisStateSchema,
  /** Quem fechou o valor. `null` quando não há valor. */
  source: AxisSourceSchema,
}).strict();

const StrengthSchema = z.enum(["conclusive", "mixed", "weak", "insufficient"]).nullable();

export const KeywordDnaSchema = z.object({
  schemaVersion: z.literal(KEYWORD_DNA_SCHEMA_VERSION),
  identity: z.object({
    keywordId: z.string().min(1),
    brandId: z.string().nullable(),
    keyword: z.string().min(1),
  }).strict(),
  axes: z.object({
    intent: KeywordDnaAxisSchema,
    funnel: KeywordDnaAxisSchema,
    /** Nicho não tem evidência SERP: fonte é humano ou Lógica. */
    niche: KeywordDnaAxisSchema,
  }).strict(),
  serp: z.object({
    state: z.enum(["conclusive", "non_conclusive", "not_collected"]),
    intentStrength: StrengthSchema,
    funnelStrength: StrengthSchema,
    versionId: z.string().nullable(),
    contentHash: z.string().nullable(),
    collectedAt: z.string().nullable(),
  }).strict(),
  logical: z.object({
    origin: z.string().nullable(),
    model: z.string().nullable(),
    /** 0..1. `null` quando o motor não informou. */
    confidence: z.number().min(0).max(1).nullable(),
    centralEntity: z.string().nullable(),
    modifiers: z.array(z.string()),
    secondaryIntent: z.string().nullable(),
    localIntent: z.string().nullable(),
    urgency: z.string().nullable(),
    perceivedProblem: z.string().nullable(),
    audience: z.string().nullable(),
    desiredResult: z.string().nullable(),
    editorialType: z.string().nullable(),
    awarenessLevel: z.string().nullable(),
    journeyStage: z.string().nullable(),
    cannibalizationNote: z.string().nullable(),
    externalIntent: z.string().nullable(),
  }).strict(),
  metrics: z.object({
    volume: z.object({ value: z.number().nullable(), validated: z.boolean(), measuredAt: z.string().nullable() }).strict(),
    results: z.object({ value: z.number().nullable(), validated: z.boolean(), measuredAt: z.string().nullable() }).strict(),
    kgr: z.object({
      score: z.number().nullable(),
      ready: z.boolean(),
      applicability: z.enum(["pending", "applicable", "not_applicable"]),
    }).strict(),
  }).strict(),
  humanReview: z.object({
    completed: z.boolean(),
    kgrDecisionReviewed: z.boolean(),
  }).strict(),
  maturity: z.enum(["INSUFICIENTE", "PARCIAL", "COMPLETA PARA REVISÃO", "CONFIRMADA"]),
  status: z.object({
    effective: z.enum(["bruto", "em_revisao", "aprovado", "rejeitado"]).nullable(),
    label: z.string(),
    divergedFromApproval: z.boolean(),
  }).strict(),
  approval: z.object({
    version: z.number().int().positive(),
    contentHash: z.string(),
    approvedAt: z.string(),
    approvedBy: z.string(),
  }).strict().nullable(),
}).strict();

export type KeywordDna = z.infer<typeof KeywordDnaSchema>;
export type KeywordDnaAxis = z.infer<typeof KeywordDnaAxisSchema>;

// ---------------------------------------------------------------- leitura

type Semantic = Record<string, unknown>;

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Ausência declarada pelo motor não vira dado.
 *
 * "Problema não determinado pela keyword" é o motor dizendo que não apurou,
 * com a marca no MEIO da frase. Tratar isso como valor faria oito keywords
 * compartilharem o mesmo "tema". As regras são as mesmas que o Arquiteto
 * aplica hoje por conta própria — e é por isso que ele pode parar de aplicar.
 */
function semPlaceholder(value: string | null): string | null {
  return value && !/n[aã]o determinad/i.test(value) && !/^(nenhum|a confirmar|pendente)/i.test(value) ? value : null;
}

/** `modificadores` é string no registro; array também é aceito. */
function listaDeTexto(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  const bruto = texto(value);
  if (!bruto) return [];
  if (/^nenhum/i.test(bruto)) return [];
  return bruto.split(/[,;]/).map(item => item.trim()).filter(Boolean);
}

function confianca(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : null;
}

/** O que a Qualificação Semântica vira dentro do item de workflow. */
export type SerpQualificationReference = {
  intent: string | null;
  funnel: string | null;
  semanticState: "conclusive" | "non_conclusive";
  versionId: string;
  contentHash: string;
  collectedAt: string;
};

/** Evidência SERP, venha do artifact inteiro ou da referência que viaja no handoff. */
export type SerpEvidenceInput =
  | { kind: "qualification"; qualification: KeywordSemanticQualification }
  | { kind: "reference"; reference: SerpQualificationReference }
  | null;

/** A evidência gravada na linha, no formato de referência. Invalidada não conta. */
function serpFromRecord(semantic: Semantic): SerpEvidenceInput {
  const record = readSerpEvidenceRecord(semantic);
  if (!record || record.invalidada) return null;
  return {
    kind: "reference",
    reference: {
      intent: record.intent.value,
      funnel: record.funnel.value,
      semanticState: record.semanticState,
      versionId: record.versionId,
      contentHash: record.contentHash,
      collectedAt: record.collectedAt,
    },
  };
}

function serpFrom(input: SerpEvidenceInput): KeywordDna["serp"] & { intentValue: string | null; funnelValue: string | null } {
  if (!input) {
    return { state: "not_collected", intentStrength: null, funnelStrength: null, versionId: null, contentHash: null, collectedAt: null, intentValue: null, funnelValue: null };
  }
  if (input.kind === "qualification") {
    const q = input.qualification;
    // A mesma regra que monta a referência do handoff: eixo só viaja
    // preenchido quando conclusivo.
    const axes = qualificationConsolidatedAxes(q);
    const intentValue = texto(axes.intent);
    const funnelValue = texto(axes.funnel);
    return {
      state: isFullyConsolidatedQualification(q) ? "conclusive" : "non_conclusive",
      intentStrength: q.intent.strength,
      funnelStrength: q.funnel.strength,
      versionId: q.id,
      contentHash: q.lifecycle.contentHash,
      collectedAt: q.source.collectedAt,
      intentValue,
      funnelValue,
    };
  }
  const r = input.reference;
  // A referência do handoff só carrega força agregada; por eixo fica nulo,
  // e nulo é "não informado", nunca "insuficiente".
  return {
    state: r.semanticState,
    intentStrength: null,
    funnelStrength: null,
    versionId: r.versionId,
    contentHash: r.contentHash,
    collectedAt: r.collectedAt,
    intentValue: texto(r.intent),
    funnelValue: texto(r.funnel),
  };
}

function axis(input: {
  /** Evidência SERP passada explicitamente (artifact ou referência do handoff). */
  serpValue: string | null;
  canonical: string | null;
  canonicalLabel: string;
  canonicalState: CanonicalFieldResolution;
  canonicalSource: CanonicalFieldSource;
}): KeywordDnaAxis {
  // SERP conclusiva fecha a dimensão; nem a decisão humana a substitui. A
  // evidência explícita vence a gravada na linha porque é mais específica —
  // é a versão que o consumidor declarou ter lido.
  if (input.serpValue) return { value: input.serpValue, label: input.serpValue, state: "resolved", source: "serp" };
  return { value: input.canonical, label: input.canonicalLabel, state: input.canonicalState, source: input.canonical ? input.canonicalSource : null };
}

export type KeywordDnaRowInput = CanonicalKeywordSnapshotInput & {
  id: string;
  keyword: string;
  lista_id?: string | null;
  serp?: SerpEvidenceInput;
};

/** Constrói o KeywordDNA fechado a partir da linha do Minerador. */
export function keywordDnaFromRow(input: KeywordDnaRowInput): KeywordDna {
  const semantic: Semantic = input.analise_semantica || {};
  const snapshot = resolveCanonicalKeywordSnapshot(input);
  const canonical = snapshot.semantic;
  // Sem evidência explícita, a gravada na própria linha responde.
  const serp = serpFrom(input.serp ?? serpFromRecord(semantic));

  const dna: KeywordDna = {
    schemaVersion: KEYWORD_DNA_SCHEMA_VERSION,
    identity: {
      keywordId: input.id,
      brandId: typeof input.brand_id === "string" ? input.brand_id : null,
      keyword: input.keyword,
    },
    axes: {
      intent: axis({
        serpValue: serp.intentValue,
        canonical: canonical.intent,
        canonicalLabel: canonical.intentLabel,
        canonicalState: canonical.intentState,
        canonicalSource: canonical.intentSource,
      }),
      funnel: axis({
        serpValue: serp.funnelValue,
        canonical: canonical.funnel,
        canonicalLabel: canonical.funnelLabel,
        canonicalState: canonical.funnelState,
        canonicalSource: canonical.funnelSource,
      }),
      niche: axis({
        serpValue: null,
        canonical: canonical.niche,
        canonicalLabel: canonical.nicheLabel,
        canonicalState: canonical.nicheState,
        canonicalSource: canonical.nicheSource,
      }),
    },
    serp: {
      state: serp.state,
      intentStrength: serp.intentStrength,
      funnelStrength: serp.funnelStrength,
      versionId: serp.versionId,
      contentHash: serp.contentHash,
      collectedAt: serp.collectedAt,
    },
    logical: {
      origin: texto(semantic.dna_origem),
      model: texto(semantic.dna_modelo),
      confidence: confianca(semantic.dna_confianca),
      centralEntity: texto(semantic.entidade_central),
      modifiers: listaDeTexto(semantic.modificadores),
      secondaryIntent: semPlaceholder(texto(semantic.intencao_secundaria)),
      localIntent: semPlaceholder(texto(semantic.intencao_local)),
      urgency: semPlaceholder(texto(semantic.urgencia_tempo)),
      perceivedProblem: semPlaceholder(texto(semantic.problema_percebido)),
      audience: semPlaceholder(texto(semantic.publico)),
      desiredResult: semPlaceholder(texto(semantic.resultado_desejado)),
      editorialType: semPlaceholder(texto(semantic.tipo_editorial) || texto(semantic.formato_esperado)),
      awarenessLevel: semPlaceholder(texto(semantic.nivel_consciencia)),
      journeyStage: semPlaceholder(texto(semantic.etapa_jornada)),
      cannibalizationNote: semPlaceholder(texto(semantic.risco_canibalizacao)),
      externalIntent: canonical.externalIntent,
    },
    metrics: {
      volume: { value: snapshot.metrics.volume.value, validated: snapshot.metrics.volume.validated, measuredAt: snapshot.metrics.volume.measuredAt },
      results: { value: snapshot.metrics.result.value, validated: snapshot.metrics.result.validated, measuredAt: snapshot.metrics.result.measuredAt },
      kgr: { score: snapshot.metrics.kgr.score, ready: snapshot.metrics.kgr.ready, applicability: snapshot.metrics.kgr.applicability },
    },
    humanReview: {
      completed: snapshot.humanReview.completed,
      kgrDecisionReviewed: snapshot.humanReview.record.kgrDecisionReviewed === true,
    },
    maturity: snapshot.maturity,
    status: {
      effective: snapshot.status.status,
      label: snapshot.status.label,
      divergedFromApproval: snapshot.status.divergedFromApproval,
    },
    approval: snapshot.approval
      ? { version: snapshot.approval.version, contentHash: snapshot.approval.contentHash, approvedAt: snapshot.approval.approvedAt, approvedBy: snapshot.approval.approvedBy }
      : null,
  };
  return KeywordDnaSchema.parse(dna);
}

/**
 * Constrói o KeywordDNA fechado a partir do que viaja no item de workflow.
 *
 * É a leitura que o Arquiteto deve usar: o pacote é o retrato aprovado, e a
 * referência da qualificação é a evidência que o sustentava. Nada aqui toca
 * a linha viva do Minerador.
 */
export function keywordDnaFromPackage(input: {
  approvedDna: ApprovedKeywordPackage;
  semanticQualification?: SerpQualificationReference | null;
}): KeywordDna {
  const pkg = input.approvedDna;
  const packageInput = {
    keywordId: pkg.keywordId,
    brandId: pkg.brandId,
    keyword: pkg.keyword,
    intent: pkg.intent,
    volumeSearch: pkg.volumeSearch,
    resultsAllintitle: pkg.resultsAllintitle,
    kgrScore: pkg.kgrScore,
    listaId: pkg.listaId,
    semantic: pkg.analiseSemantica,
  };
  return keywordDnaFromRow({
    id: pkg.keywordId,
    brand_id: pkg.brandId,
    keyword: pkg.keyword,
    intent: pkg.intent,
    status: "aprovado",
    volume_search: pkg.volumeSearch,
    results_allintitle: pkg.resultsAllintitle,
    kgr_score: pkg.kgrScore,
    lista_id: pkg.listaId,
    // O pacote guarda a semântica SEM `aprovacao`; devolvemos o registro com
    // a assinatura recalculada sobre o próprio pacote, para que status,
    // divergência e proveniência saiam do mesmo lugar de sempre — e um pacote
    // fechado nunca se leia como "em revisão".
    analise_semantica: {
      ...pkg.analiseSemantica,
      aprovacao: {
        contentHash: pkg.contentHash,
        signature: approvedPackageSignature(packageInput),
        approvedAt: pkg.approvedAt,
        approvedBy: pkg.approvedBy,
        version: pkg.version,
      },
    },
    serp: input.semanticQualification ? { kind: "reference", reference: input.semanticQualification } : null,
  });
}
