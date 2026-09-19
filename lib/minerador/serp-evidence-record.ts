import { isFullyConsolidatedQualification, qualificationConsolidatedAxes, type KeywordSemanticQualification } from "./keyword-semantic-qualification.ts";
import type { SerpEvidenceStrength } from "./serp-semantic-evidence.ts";

/**
 * SERP COMO EVIDÊNCIA FORTE, GRAVADA NA PRÓPRIA KEYWORD.
 *
 * A Qualificação Semântica é versionada e imutável em
 * `keyword_semantic_qualification`; até 2026-09-19 ela nunca chegava à linha,
 * e o leitor canônico da tabela mostrava a hipótese da Lógica mesmo com a SERP
 * concluída. Este registro é a projeção da versão vigente dentro de
 * `analise_semantica.evidencia_serp`: entra na assinatura do pacote aprovado
 * e é lido antes da decisão humana e da Lógica.
 *
 * A hipótese lógica não é sobrescrita: a SERP muda a resposta, a proveniência
 * de quem propôs o quê continua legível.
 *
 * Domínio puro.
 */

export const SERP_EVIDENCE_RECORD_KEY = "evidencia_serp" as const;
export const SERP_EVIDENCE_SCHEMA_VERSION = "v1" as const;

export type SerpEvidenceAxisRecord = {
  /** Preenchido só quando o eixo é conclusivo. */
  value: string | null;
  strength: SerpEvidenceStrength;
};

export type SerpEvidenceInvalidation = {
  por: string;
  em: string;
  motivo: string;
};

export type SerpEvidenceRecord = {
  schemaVersion: typeof SERP_EVIDENCE_SCHEMA_VERSION;
  peso: "forte";
  versionId: string;
  version: number;
  contentHash: string;
  collectedAt: string;
  derivationVersion: string;
  thresholdsVersion: string;
  semanticState: "conclusive" | "non_conclusive";
  intent: SerpEvidenceAxisRecord;
  funnel: SerpEvidenceAxisRecord;
  /** Decisão humana sobre a evidência (A.2): invalida, nunca substitui. */
  invalidada: SerpEvidenceInvalidation | null;
};

type Semantic = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const STRENGTHS: readonly SerpEvidenceStrength[] = ["conclusive", "mixed", "weak", "insufficient"];

function axisRecord(value: unknown): SerpEvidenceAxisRecord | null {
  const item = asRecord(value);
  const strength = item?.strength;
  if (!item || typeof strength !== "string" || !STRENGTHS.includes(strength as SerpEvidenceStrength)) return null;
  return { value: texto(item.value), strength: strength as SerpEvidenceStrength };
}

/** Projeta a versão vigente da Qualificação no formato gravado na linha. */
export function serpEvidenceRecordFromQualification(qualification: KeywordSemanticQualification): SerpEvidenceRecord {
  // A mesma regra que monta a referência do handoff: eixo só leva valor
  // quando conclusivo. Mista, fraca ou insuficiente registram a força e nada mais.
  const axes = qualificationConsolidatedAxes(qualification);
  return {
    schemaVersion: SERP_EVIDENCE_SCHEMA_VERSION,
    peso: "forte",
    versionId: qualification.id,
    version: qualification.lifecycle.version,
    contentHash: qualification.lifecycle.contentHash,
    collectedAt: qualification.source.collectedAt,
    derivationVersion: qualification.derivation.derivationVersion,
    thresholdsVersion: qualification.derivation.thresholdsVersion,
    semanticState: isFullyConsolidatedQualification(qualification) ? "conclusive" : "non_conclusive",
    intent: { value: texto(axes.intent), strength: qualification.intent.strength },
    funnel: { value: texto(axes.funnel), strength: qualification.funnel.strength },
    invalidada: null,
  };
}

export function readSerpEvidenceRecord(semantic: Semantic | null | undefined): SerpEvidenceRecord | null {
  const item = asRecord(semantic?.[SERP_EVIDENCE_RECORD_KEY]);
  if (!item) return null;
  const intent = axisRecord(item.intent);
  const funnel = axisRecord(item.funnel);
  const versionId = texto(item.versionId);
  const contentHash = texto(item.contentHash);
  const collectedAt = texto(item.collectedAt);
  if (!intent || !funnel || !versionId || !contentHash || !collectedAt) return null;
  const invalidada = asRecord(item.invalidada);
  return {
    schemaVersion: SERP_EVIDENCE_SCHEMA_VERSION,
    peso: "forte",
    versionId,
    version: typeof item.version === "number" && Number.isInteger(item.version) ? item.version : 0,
    contentHash,
    collectedAt,
    derivationVersion: texto(item.derivationVersion) || "desconhecida",
    thresholdsVersion: texto(item.thresholdsVersion) || "desconhecida",
    semanticState: item.semanticState === "conclusive" ? "conclusive" : "non_conclusive",
    intent,
    funnel,
    invalidada: invalidada && texto(invalidada.por) && texto(invalidada.em)
      ? { por: texto(invalidada.por) as string, em: texto(invalidada.em) as string, motivo: texto(invalidada.motivo) || "" }
      : null,
  };
}

/**
 * Grava a projeção na semântica. Uma nova versão da Qualificação substitui o
 * registro inteiro — inclusive uma invalidação anterior, porque ela era sobre
 * a coleta antiga, e a nova coleta é exatamente o que a invalidação pedia.
 */
export function applySerpEvidenceRecord(semantic: Semantic | null | undefined, qualification: KeywordSemanticQualification): Semantic {
  return { ...(semantic || {}), [SERP_EVIDENCE_RECORD_KEY]: serpEvidenceRecordFromQualification(qualification) };
}

/**
 * Decisão humana sobre a evidência (A.2): o humano não substitui a SERP
 * conclusiva por outro valor; ele a invalida por defeito verificável e pede
 * nova coleta. O motivo é obrigatório porque é o que vai justificar a recoleta.
 */
export function invalidateSerpEvidence(semantic: Semantic | null | undefined, input: { por: string; em: string; motivo: string }): Semantic {
  const record = readSerpEvidenceRecord(semantic);
  if (!record) throw new Error("Não há evidência SERP registrada para invalidar.");
  const motivo = texto(input.motivo);
  if (!motivo) throw new Error("Invalidar a evidência SERP exige motivo.");
  return {
    ...(semantic || {}),
    [SERP_EVIDENCE_RECORD_KEY]: { ...record, invalidada: { por: input.por, em: input.em, motivo } },
  };
}

/** O valor que a SERP fecha para o eixo, ou `null` quando ela não fecha nada. */
export function serpEvidenceAxisValue(record: SerpEvidenceRecord | null, axis: "intent" | "funnel"): string | null {
  if (!record || record.invalidada) return null;
  const item = record[axis];
  return item.strength === "conclusive" ? item.value : null;
}
