import { isFullyConsolidatedQualification, qualificationConsolidatedAxes, qualificationLensSummary, type KeywordSemanticQualification, type KeywordSemanticQualificationAxis } from "./keyword-semantic-qualification.ts";
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
  /**
   * Só no eixo MISTO (aditivo, adendo das 4 lentes §4): os dois rótulos que
   * lideram a distribuição e a cobertura, arredondada a 2 casas. É o que a
   * tabela precisa para dizer "Misto na SERP (A × B)" (R9) sem baixar a
   * Qualificação. Não é valor: o eixo continua sem conclusão.
   */
  rotulos?: [string, string];
  cobertura?: number;
};

/**
 * O resumo das lentes na linha: `lidas` é quantas lentes a leitura usou;
 * `intent` e `funnel` são quantas delas lideram, naquele eixo, com o rótulo do
 * agregado (a concordância). Plano e com chaves curtas por causa do teto: é a
 * mesma informação que o handoff leva como `{ observadas, concordancia }`.
 */
export type SerpEvidenceLensSummary = {
  lidas: number;
  intent: number;
  funnel: number;
};

/**
 * TETO da projeção na linha. A listagem do Minerador lê `analise_semantica`
 * de toda keyword (R8 da SDD de egress): o registro não pode crescer sem
 * limite. Fixado por teste com o pior caso.
 */
export const SERP_EVIDENCE_RECORD_MAX_BYTES = 700;

/**
 * TETO da invalidação humana (`invalidada`), que o teto da projeção não cobre:
 * ela troca o `null` por `{ por, em, motivo }`. O registro invalidado fica, no
 * pior caso, em `SERP_EVIDENCE_RECORD_MAX_BYTES + SERP_EVIDENCE_INVALIDATION_MAX_BYTES`
 * (fixado por teste). Motivo longo demais é RECUSADO, nunca truncado: é texto
 * de decisão humana (AGENTS §9).
 */
export const SERP_EVIDENCE_INVALIDATION_MAX_BYTES = 300;

const bytesDoJson = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

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
  /** Aditivo · Só quando a Qualificação foi lida nas quatro lentes. */
  lentes?: SerpEvidenceLensSummary;
};

type Semantic = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const STRENGTHS: readonly SerpEvidenceStrength[] = ["conclusive", "mixed", "weak", "insufficient"];

const contagem = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

function axisRecord(value: unknown): SerpEvidenceAxisRecord | null {
  const item = asRecord(value);
  const strength = item?.strength;
  if (!item || typeof strength !== "string" || !STRENGTHS.includes(strength as SerpEvidenceStrength)) return null;
  const rotulos = Array.isArray(item.rotulos) && item.rotulos.length === 2 ? item.rotulos.map(texto) : null;
  const cobertura = typeof item.cobertura === "number" && Number.isFinite(item.cobertura) && item.cobertura >= 0 && item.cobertura <= 1 ? item.cobertura : null;
  return {
    value: texto(item.value),
    strength: strength as SerpEvidenceStrength,
    // Os dois campos do eixo misto só voltam juntos e válidos.
    ...(strength === "mixed" && rotulos?.[0] && rotulos[1] && cobertura !== null ? { rotulos: [rotulos[0], rotulos[1]] as [string, string], cobertura } : {}),
  };
}

function lensSummary(value: unknown): SerpEvidenceLensSummary | null {
  const item = asRecord(value);
  const lidas = contagem(item?.lidas);
  const intent = contagem(item?.intent);
  const funnel = contagem(item?.funnel);
  return lidas !== null && intent !== null && funnel !== null ? { lidas, intent, funnel } : null;
}

/**
 * A cobertura na linha, com 2 casas, TRUNCADA: arredondar poderia levar 0,497
 * a 0,50 e ligar a R9 abaixo do limiar. O epsilon só absorve o erro do float.
 */
const coberturaNaLinha = (coverage: number) => Math.floor(coverage * 100 + 1e-9) / 100;

/** O eixo como vai para a linha. O misto leva os dois rótulos da frente e a cobertura (R9). */
function projectedAxis(axis: KeywordSemanticQualificationAxis, value: string | null): SerpEvidenceAxisRecord {
  const [first, second] = axis.distribution;
  const mixedLabels = axis.strength === "mixed" && first?.label && second?.label ? [first.label, second.label] as [string, string] : null;
  return {
    value: texto(value),
    strength: axis.strength,
    ...(mixedLabels ? { rotulos: mixedLabels, cobertura: coberturaNaLinha(axis.coverage) } : {}),
  };
}

/** Projeta a versão vigente da Qualificação no formato gravado na linha. */
export function serpEvidenceRecordFromQualification(qualification: KeywordSemanticQualification): SerpEvidenceRecord {
  // A mesma regra que monta a referência do handoff: eixo só leva valor
  // quando conclusivo. Mista, fraca ou insuficiente registram a força — e a
  // mista, os dois rótulos que disputam, nunca como valor.
  const axes = qualificationConsolidatedAxes(qualification);
  const resumo = qualificationLensSummary(qualification);
  const lentes = resumo ? { lidas: resumo.observadas, intent: resumo.concordancia.intent, funnel: resumo.concordancia.funnel } : null;
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
    intent: projectedAxis(qualification.intent, axes.intent),
    funnel: projectedAxis(qualification.funnel, axes.funnel),
    invalidada: null,
    ...(lentes ? { lentes } : {}),
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
  const lentes = lensSummary(item.lentes);
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
    // Aditivo: preservado na releitura e, por ela, na invalidação.
    ...(lentes ? { lentes } : {}),
  };
}

/**
 * R9 — o eixo que a SERP mostrou MISTO, com cobertura suficiente para a
 * mistura ser leitura e não cegueira: os dois rótulos que disputam. `null`
 * quando não se aplica (conclusivo, fraco, cobertura baixa, invalidada, ou
 * projeção anterior a estes campos).
 */
export function serpEvidenceMixedLabels(record: SerpEvidenceRecord | null, axis: "intent" | "funnel"): [string, string] | null {
  if (!record || record.invalidada) return null;
  const item = record[axis];
  return item.strength === "mixed" && item.rotulos && typeof item.cobertura === "number" && item.cobertura >= 0.5 ? item.rotulos : null;
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
  const invalidada = { por: input.por, em: input.em, motivo };
  if (bytesDoJson(invalidada) > SERP_EVIDENCE_INVALIDATION_MAX_BYTES) {
    throw new Error("O motivo da invalidação da evidência SERP é longo demais: resuma em uma frase.");
  }
  return {
    ...(semantic || {}),
    [SERP_EVIDENCE_RECORD_KEY]: { ...record, invalidada },
  };
}

/** O valor que a SERP fecha para o eixo, ou `null` quando ela não fecha nada. */
export function serpEvidenceAxisValue(record: SerpEvidenceRecord | null, axis: "intent" | "funnel"): string | null {
  if (!record || record.invalidada) return null;
  const item = record[axis];
  return item.strength === "conclusive" ? item.value : null;
}
