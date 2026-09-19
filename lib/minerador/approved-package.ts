import { canonicalJson, contentHash } from "../arquiteto/versioning.ts";
import { deriveProcessorRevalidation } from "./processor-revalidation.ts";
import { hasCompleteLogicalOutputContract } from "./logical-processor.ts";
import { readKgrApplicability } from "./kgr-applicability.ts";

/**
 * Pacote aprovado da keyword — o retrato que o Arquiteto consome.
 *
 * A entrega ao Arquiteto deixou de ser "leia a linha viva do Minerador". O que
 * viaja é o que o humano aprovou, e só muda quando ele aprova de novo. Três
 * peças moram aqui:
 *
 *   PORTÃO      o que a aprovação exige (processos executados, não conclusões)
 *   PACOTE      o KeywordDNA inteiro, congelado no ato da aprovação
 *   HASH        o que distingue "mexeram nela" de "reexecutaram e deu igual"
 *
 * O hash é o que permite derivar `em_revisao` em vez de depender de cada
 * writer lembrar de rebaixar o status. Writer esquece; hash não.
 */

type Semantic = Record<string, unknown>;

export type ApprovalRequirement = "logic" | "volume" | "results" | "kgr";

export type ApprovalReadiness = {
  ok: boolean;
  missing: ApprovalRequirement[];
  reason: string | null;
};

const REQUIREMENT_LABELS: Record<ApprovalRequirement, string> = {
  logic: "Lógica",
  volume: "Volume",
  results: "Resultados",
  kgr: "aplicabilidade do KGR",
};

export function approvalRequirementLabel(requirement: ApprovalRequirement): string {
  return REQUIREMENT_LABELS[requirement];
}

function asRecord(value: unknown): Semantic | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : null;
}

/**
 * Aprovar exige **processo executado**, nunca **conclusão alcançada**.
 *
 * Intenção e Funil não consolidados não entram aqui de propósito: SERP mista é
 * resultado legítimo da análise. Exigir conclusão tornaria impossível aprovar
 * uma keyword cuja evidência está genuinamente dividida — e o humano perderia
 * a decisão que é dele.
 */
export function resolveApprovalReadiness(input: {
  semantic?: Semantic | null;
  intent?: unknown;
  volumeSearch?: unknown;
  resultsAllintitle?: unknown;
}): ApprovalReadiness {
  const semantic = input.semantic || {};
  const processor = deriveProcessorRevalidation({
    semantic,
    volumeSearch: input.volumeSearch,
    resultsAllintitle: input.resultsAllintitle,
  });
  const missing: ApprovalRequirement[] = [];

  if (semantic.dna_origem !== "logico_deterministico" || !hasCompleteLogicalOutputContract({ semantic, intent: input.intent })) missing.push("logic");
  if (!processor.volume.validated) missing.push("volume");
  if (!processor.results.validated) missing.push("results");
  // O KGR só é obrigação quando as duas medições o tornam calculável.
  if (processor.kgr.ready && readKgrApplicability(semantic) === "pending") missing.push("kgr");

  if (missing.length === 0) return { ok: true, missing, reason: null };
  const labels = missing.map(approvalRequirementLabel);
  const lista = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
  return {
    ok: false,
    missing,
    reason: `Aprovar exige ${lista}. O Arquiteto recebe o pacote fechado: nada pode chegar lá pela metade.`,
  };
}

/** O KeywordDNA inteiro, do jeito que o Arquiteto vai consumir. */
export type ApprovedKeywordPackage = {
  schemaVersion: "v1";
  keywordId: string;
  brandId: string;
  keyword: string;
  intent: string | null;
  volumeSearch: number | null;
  resultsAllintitle: number | null;
  kgrScore: number | null;
  listaId: string | null;
  /** `analise_semantica` integral: o Arquiteto não pode ignorar nada do DNA. */
  analiseSemantica: Semantic;
  approvedAt: string;
  approvedBy: string;
  version: number;
  contentHash: string;
};

export type ApprovalRecord = {
  contentHash: string;
  /** Assinatura síncrona usada para detectar mudança material. */
  signature: string;
  approvedAt: string;
  approvedBy: string;
  version: number;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Conteúdo que define a identidade do pacote.
 *
 * `aprovacao` fica de fora: o registro da aprovação não pode participar do
 * próprio hash, senão aprovar mudaria o hash e a keyword nasceria divergente.
 */
export type ApprovedPackageInput = {
  keywordId: string;
  brandId?: string | null;
  keyword: string;
  intent?: unknown;
  volumeSearch?: unknown;
  resultsAllintitle?: unknown;
  kgrScore?: unknown;
  listaId?: unknown;
  semantic?: Semantic | null;
};

export function approvedPackageContent(input: ApprovedPackageInput): Record<string, unknown> {
  const semantic = { ...(input.semantic || {}) };
  delete semantic.aprovacao;
  return {
    keywordId: input.keywordId,
    brandId: textOrNull(input.brandId),
    keyword: input.keyword,
    intent: textOrNull(input.intent),
    volumeSearch: numberOrNull(input.volumeSearch),
    resultsAllintitle: numberOrNull(input.resultsAllintitle),
    kgrScore: numberOrNull(input.kgrScore),
    listaId: textOrNull(input.listaId),
    analiseSemantica: semantic,
  };
}

/**
 * O que a assinatura cobre: o DNA em si.
 *
 * `brandId` fica de fora porque `keywordId` já o determina, e `listaId`
 * porque mover a keyword de Silo é organização do Minerador, não mudança do
 * DNA — rebaixar a aprovação por isso seria ruído. Os dois continuam viajando
 * no pacote; só não participam da comparação.
 *
 * Igualmente importante: todo consumidor precisa conseguir reproduzir este
 * conteúdo. Um campo que a tabela não conhece faria a keyword parecer
 * divergente só porque quem perguntou sabia menos.
 */
function signatureContent(input: ApprovedPackageInput): Record<string, unknown> {
  const content = approvedPackageContent(input);
  delete content.brandId;
  delete content.listaId;
  return content;
}

export async function approvedPackageHash(input: ApprovedPackageInput): Promise<string> {
  return contentHash(signatureContent(input));
}

/**
 * Assinatura síncrona do mesmo conteúdo.
 *
 * O `contentHash` é SHA-256 e portanto assíncrono — não serve para decidir cor
 * de célula durante o render. A divergência que rebaixa para `em_revisao` é
 * decidida por esta assinatura, calculada no mesmo objeto canônico, e o
 * SHA-256 continua sendo a identidade do pacote para o Arquiteto.
 */
export function approvedPackageSignature(input: ApprovedPackageInput): string {
  const serialized = canonicalJson(signatureContent(input));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(36)}`;
}

/** Leitura defensiva do registro de aprovação gravado em `analise_semantica`. */
export function readApprovalRecord(semantic: Semantic | null | undefined): ApprovalRecord | null {
  const item = asRecord(semantic?.aprovacao);
  const hash = textOrNull(item?.contentHash);
  const signature = textOrNull(item?.signature);
  const approvedAt = textOrNull(item?.approvedAt);
  if (!item || !hash || !signature || !approvedAt) return null;
  return {
    contentHash: hash,
    signature,
    approvedAt,
    approvedBy: textOrNull(item.approvedBy) || "desconhecido",
    version: typeof item.version === "number" && item.version > 0 ? item.version : 1,
  };
}

/**
 * A keyword foi mexida depois da aprovação?
 *
 * `null` quando não há aprovação registrada — ausência de aprovação não é
 * divergência, é outro estado.
 */
export function approvedPackageDiverged(input: ApprovedPackageInput): boolean | null {
  const record = readApprovalRecord(input.semantic);
  if (!record) return null;
  return record.signature !== approvedPackageSignature(input);
}

/**
 * Monta o pacote a partir do estado atual e do registro de aprovação.
 * Sem registro não existe pacote: nada viaja como aprovado por acidente.
 */
export function buildApprovedPackage(input: ApprovedPackageInput): ApprovedKeywordPackage | null {
  const record = readApprovalRecord(input.semantic);
  if (!record) return null;
  const content = approvedPackageContent(input);
  return {
    schemaVersion: "v1",
    keywordId: input.keywordId,
    brandId: textOrNull(input.brandId) || "",
    keyword: input.keyword,
    intent: content.intent as string | null,
    volumeSearch: content.volumeSearch as number | null,
    resultsAllintitle: content.resultsAllintitle as number | null,
    kgrScore: content.kgrScore as number | null,
    listaId: content.listaId as string | null,
    analiseSemantica: content.analiseSemantica as Semantic,
    approvedAt: record.approvedAt,
    approvedBy: record.approvedBy,
    version: record.version,
    contentHash: record.contentHash,
  };
}

/**
 * Grava o registro de aprovação sobre o estado atual da keyword.
 *
 * O hash e a assinatura saem do MESMO conteúdo que o pacote transporta, e o
 * `aprovacao` anterior é descartado do cálculo — senão aprovar mudaria o
 * conteúdo e a keyword nasceria divergente de si mesma.
 */
export async function applyApproval(input: ApprovedPackageInput & {
  approvedAt: string;
  approvedBy: string;
}): Promise<Semantic> {
  const previous = readApprovalRecord(input.semantic);
  return {
    ...(input.semantic || {}),
    aprovacao: {
      contentHash: await approvedPackageHash(input),
      signature: approvedPackageSignature(input),
      approvedAt: input.approvedAt,
      approvedBy: input.approvedBy,
      version: (previous?.version || 0) + 1,
    } satisfies ApprovalRecord,
  };
}
