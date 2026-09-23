import { z } from "zod";
import { SerpCollectionRecordSchema } from "../../editorial/contracts.ts";
import { RadarHydrationSnapshotSchema } from "../hydration.ts";
import { RadarSerpResolutionEnvelopeSchema } from "../resolution-envelope.ts";

/**
 * O PEDIDO DA SERP CANÔNICA — SDD do Radar nas quatro lentes, R2.
 *
 * O cliente não escolhe lente, endpoint nem profundidade: o servidor consulta
 * as quatro lentes do produto, cache primeiro. `device` deixou de ser lido; um
 * cliente antigo que ainda o manda continua aceito (ver `CollectRequestSchema`).
 *
 * `recollect` é o "Recoletar agora (pago)": só ele paga uma lente presente e
 * válida no cache, e só com a confirmação explícita.
 */
export function buildRadarSerpCollectPayload(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  location: string;
  language: string;
  /** Aceito por compatibilidade e ignorado pelo servidor. */
  device?: "desktop" | "mobile";
  articleVersion?: unknown;
  resolutionEnvelope: z.infer<typeof RadarSerpResolutionEnvelopeSchema>;
  recollect?: boolean;
}) {
  const articleDnaVersionId = input.articleDnaVersionId.trim();
  if (!articleDnaVersionId) throw new Error("A versão do ArticleDNA deste item do Radar não está disponível.");
  return {
    action: "collect" as const,
    brandId: input.brandId,
    articleId: input.articleId,
    articleDnaVersionId,
    location: input.location,
    language: input.language,
    ...(input.device ? { device: input.device } : {}),
    articleVersion: input.articleVersion,
    resolutionEnvelope: input.resolutionEnvelope,
    ...(input.recollect ? { recollect: { confirmed: true as const } } : {}),
  };
}

/**
 * O que a coleta da SERP canônica respondeu, além do registro.
 *
 * `unchanged`: o conteúdo nas quatro lentes é o do snapshot gravado, e o
 * registro devolvido é ELE — nenhuma versão nova. `paidCalls` diz quantas
 * chamadas foram pagas (0 quando tudo veio do cache). Resposta de servidor
 * anterior às lentes não traz os campos: tudo fica nulo e `unchanged` falso.
 */
export type RadarSerpCollectOutcome = {
  record: z.infer<typeof SerpCollectionRecordSchema>;
  unchanged: boolean;
  unchangedBy: "cache_meta" | "content_hash" | null;
  paidCalls: number | null;
  cacheHits: number | null;
  observedLenses: number | null;
  totalLenses: number | null;
  /** O cache estava indisponível: as lentes foram pagas sem consultar o que já existia. */
  cacheReadFailed: boolean | null;
  /** Lacunas definitivas recentes copiadas do snapshot anterior, sem nova chamada. */
  reusedLensGaps: number | null;
};

export type RadarSerpCollectOptions = {
  /** "Recoletar agora (pago)", depois da confirmação com o número de chamadas. */
  recollect?: boolean;
  /** Recebe o resultado completo da coleta: sem mudança, chamadas pagas, lentes. */
  onOutcome?: (outcome: RadarSerpCollectOutcome) => void;
};

const inteiroOuNulo = (valor: unknown) => (typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : null);

export function radarSerpCollectOutcome(body: unknown, record: z.infer<typeof SerpCollectionRecordSchema>): RadarSerpCollectOutcome {
  const corpo = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const cobertura = corpo.lensCoverage && typeof corpo.lensCoverage === "object" && !Array.isArray(corpo.lensCoverage) ? corpo.lensCoverage as Record<string, unknown> : {};
  return {
    record,
    unchanged: corpo.unchanged === true,
    unchangedBy: corpo.unchangedBy === "cache_meta" || corpo.unchangedBy === "content_hash" ? corpo.unchangedBy : null,
    paidCalls: inteiroOuNulo(cobertura.paidCalls),
    cacheHits: inteiroOuNulo(cobertura.cacheHits),
    observedLenses: inteiroOuNulo(cobertura.observed),
    totalLenses: inteiroOuNulo(cobertura.total),
    cacheReadFailed: typeof cobertura.cacheReadFailed === "boolean" ? cobertura.cacheReadFailed : null,
    reusedLensGaps: inteiroOuNulo(cobertura.reusedLensGaps),
  };
}

/**
 * A COLETA AUXILIAR DE PESQUISA.
 *
 * A SERP canônica do artigo é a da principal: ela tem snapshot, revisão e
 * aprovação. As secundárias e o reforço produzem outra coisa — evidência de
 * pesquisa, que alimenta o universo competitivo e **não** vira a SERP do
 * artigo.
 *
 * A keyword viaja por ID. O texto é resolvido no servidor, a partir da
 * composição canônica do próprio ArticleDNA: nenhum texto do navegador vira
 * consulta paga.
 */
export function buildRadarSerpAuxiliaryPayload(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  keywordId: string;
  location: string;
  language: string;
  /** Aceito por compatibilidade e ignorado pelo servidor (R4): as lentes são as quatro do produto. */
  device?: "desktop" | "mobile";
  articleVersion?: unknown;
  resolutionEnvelope: z.infer<typeof RadarSerpResolutionEnvelopeSchema>;
}) {
  const articleDnaVersionId = input.articleDnaVersionId.trim();
  if (!articleDnaVersionId) throw new Error("A versão do ArticleDNA deste item do Radar não está disponível.");
  if (!input.keywordId.trim()) throw new Error("A pesquisa auxiliar exige o identificador da keyword da composição.");
  return {
    action: "collect_auxiliary" as const,
    brandId: input.brandId,
    articleId: input.articleId,
    articleDnaVersionId,
    keywordId: input.keywordId,
    location: input.location,
    language: input.language,
    ...(input.device ? { device: input.device } : {}),
    articleVersion: input.articleVersion,
    resolutionEnvelope: input.resolutionEnvelope,
  };
}

const LocalArticleContextSchema = z.object({
  // The client may carry a legacy/local recovery envelope whose ArticleDNA
  // contains fields newer than this route's request contract. Keep request
  // validation focused on the SERP operation; resolveArticle validates the
  // local ArticleDNA only when the remote canonical read is unavailable.
  articleVersion: z.unknown().optional(),
  articleDnaVersionId: z.string().min(1).optional(),
  hydration: RadarHydrationSnapshotSchema.nullable().optional(),
  resolutionEnvelope: RadarSerpResolutionEnvelopeSchema,
});

export const CollectRequestSchema = z.object({
  action: z.literal("collect"),
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  location: z.string().min(1).max(160),
  language: z.string().min(2).max(20),
  /**
   * ACEITO E IGNORADO (R2). As lentes são as quatro do produto, decididas no
   * servidor. Continua no contrato durante a transição para um cliente antigo
   * não receber 400; `device: "mobile"` não muda a lente.
   */
  device: z.enum(["desktop", "mobile"]).optional(),
  /** "Recoletar agora (pago)". Sem ele, nenhuma lente presente e válida é paga. */
  recollect: z.object({ confirmed: z.literal(true) }).strict().optional(),
  ...LocalArticleContextSchema.shape,
});

export const CollectAuxiliaryRequestSchema = z.object({
  action: z.literal("collect_auxiliary"),
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  /** A keyword da composição, por ID. O texto é do servidor, nunca do cliente. */
  keywordId: z.string().min(1),
  location: z.string().min(1).max(160),
  language: z.string().min(2).max(20),
  /** ACEITO E IGNORADO (R4), como na canônica: a auxiliar lê as quatro lentes do produto. */
  device: z.enum(["desktop", "mobile"]).optional(),
  ...LocalArticleContextSchema.shape,
});

export const ReviewRequestSchema = z.object({
  action: z.literal("review"),
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  snapshotId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(4000).default(""),
  record: SerpCollectionRecordSchema.optional(),
  ...LocalArticleContextSchema.shape,
});

export const RequestSchema = z.discriminatedUnion("action", [CollectRequestSchema, CollectAuxiliaryRequestSchema, ReviewRequestSchema]);
