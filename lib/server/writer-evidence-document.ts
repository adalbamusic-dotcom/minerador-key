import "server-only";

/**
 * ===== LEITOR DE EVIDÊNCIAS · A LINHA DO DOCUMENTO E AS FUNÇÕES SQL =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §4.1 e §6; adendo de decisões §5 (como o código degrada antes da
 * migration). Regras R4, R5 e R16 da SDD de egress.
 *
 * TUDO COMEÇA NA LINHA DO DOCUMENTO. A Marca vem do chamador (conferida
 * contra o grant, no MCP; contra a sessão, na rota) e entra na PRÓPRIA
 * consulta: `.eq("id").eq("marca_id")`. O service role ignora RLS; o filtro
 * é a única proteção. Documento de outra Marca é `document_not_found`, sem
 * revelar que o id existe.
 *
 * Ids de versão, snapshot, corrida e vídeo saem daqui — das referências do
 * documento —, nunca do cliente.
 *
 * NENHUMA LEITURA DO PAYLOAD INTEIRO. O documento GOOGLE tem 4,5 MB, 99% no
 * dossiê. O cabeçalho vem por seletor de caminho (`apelido:payload->a->b`,
 * sintaxe da E1); as seções do dossiê, em consultas de até 5 caminhos, em
 * série, cada uma conferindo o `bundleHash` — o mesmo desenho medido na
 * Fase 0 (`lib/redator/writer-document-reads.ts`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ImportedRadarContextSchema,
  RadarDocumentOriginSchema,
  RadarWriterDossierSchema,
  VersionReferenceSchema,
  type RadarDocumentOrigin,
  type VersionReference,
} from "@/lib/arquiteto/contracts";
import { type WriterSliceRow } from "@/lib/redator/writer-evidence-catalog";
import { getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";

/* ================================ erros ================================= */

export type WriterEvidenceErrorCode =
  | "document_not_found"
  | "document_incompatible"
  | "document_changed"
  | "invalid_request"
  | "source_not_in_manifest"
  | "migration_pendente"
  | "source_too_large"
  | "source_absent"
  | "count_only"
  /* Divergências (etapa B2): o alvo precisa ser referência do documento; o grant MCP é obrigatório. */
  | "target_not_in_document"
  | "divergence_requires_grant"
  | "divergence_refused";

const STATUS: Record<WriterEvidenceErrorCode, number> = {
  document_not_found: 404,
  document_incompatible: 422,
  document_changed: 409,
  invalid_request: 400,
  source_not_in_manifest: 404,
  migration_pendente: 503,
  source_too_large: 413,
  source_absent: 404,
  count_only: 409,
  target_not_in_document: 422,
  divergence_requires_grant: 403,
  divergence_refused: 422,
};

/** Falha com código estável. `details` nunca carrega payload nem segredo. */
export class WriterEvidenceError extends Error {
  readonly code: WriterEvidenceErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  constructor(code: WriterEvidenceErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "WriterEvidenceError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export type WriterEvidenceContext = {
  /** A Marca já autorizada pelo chamador. Toda consulta filtra por ela. */
  brandId: string;
  /** Injetável nos testes; no app, o cliente operacional (service role). */
  client?: SupabaseClient;
  now?: () => Date;
};

export const writerEvidenceClient = (context: WriterEvidenceContext): SupabaseClient => context.client ?? getOperationalClient();
export const writerEvidenceNow = (context: WriterEvidenceContext): Date => (context.now ? context.now() : new Date());

type ErroDoBanco = { code?: string | null; message?: string | null } | null | undefined;

/**
 * A FUNÇÃO SQL AINDA NÃO EXISTE? Detectado pelo CÓDIGO do erro, nunca pela
 * ausência de dados (padrão de `lib/radar/persistence.ts`): `PGRST202` é o
 * PostgREST sem a função no cache de schema; `42883`, o Postgres.
 */
export const writerEvidenceRpcMissing = (erro: ErroDoBanco) => erro?.code === "PGRST202" || erro?.code === "42883";
/** A tabela das divergências ainda não existe: `PGRST205` / `42P01`. */
export const writerEvidenceTableMissing = (erro: ErroDoBanco) => erro?.code === "PGRST205" || erro?.code === "42P01";

/** Erro de banco que não é "migration pendente": o padrão do repositório. */
export function writerEvidenceDatabaseFailure(erro: ErroDoBanco): never {
  mapPersistenceError(erro);
}

/* ========================= cabeçalho do documento ======================= */

const DOSSIE = "payload->importedContext->dossier";

/**
 * O CABEÇALHO: colunas e caminhos pequenos. 17 seletores, a mesma ordem de
 * grandeza da primeira consulta da semeadura (16 seletores, ~150-200 ms de
 * banco medidos em 2026-09-23 no documento GOOGLE).
 */
const CAMINHOS_DO_CABECALHO: Readonly<Record<string, string>> = Object.freeze({
  h_schemaVersion: "payload->schemaVersion",
  h_brandDnaRef: "payload->brandDnaRef",
  h_keywordDnaRefs: "payload->keywordDnaRefs",
  h_siloDnaRef: "payload->siloDnaRef",
  h_articleDnaRef: "payload->articleDnaRef",
  h_radarOrigin: "payload->radarOrigin",
  h_capturedAt: "payload->importedContext->capturedAt",
  h_pendingDecisions: "payload->importedContext->pendingDecisions",
  x_bundleId: `${DOSSIE}->bundleId`,
  x_bundleHash: `${DOSSIE}->bundleHash`,
  x_researchProfile: `${DOSSIE}->researchProfile`,
  x_keywordContext: `${DOSSIE}->keywordContext`,
  x_writerMayNot: `${DOSSIE}->writerMayNot`,
  b_observedAt: `${DOSSIE}->bundle->observedAt`,
  b_serpStanding: `${DOSSIE}->bundle->serpStanding`,
});

export const WRITER_EVIDENCE_HEAD_SELECT = [
  "id", "marca_id", "article_id", "content_hash", "status", "updated_at", "article_dna_version_id",
  ...Object.entries(CAMINHOS_DO_CABECALHO).map(([apelido, caminho]) => `${apelido}:${caminho}`),
].join(",");

const DossieSemBundleSchema = RadarWriterDossierSchema.omit({ bundle: true });
const PendenciasSchema = ImportedRadarContextSchema.shape.pendingDecisions;
const ContextoEditorialSchema = ImportedRadarContextSchema.shape.editorialContext;
const PosicaoDaSerpSchema = z.object({
  authoritative: z.boolean(),
  current: z.boolean(),
  sufficient: z.boolean(),
  valid: z.boolean(),
  reason: z.string(),
}).passthrough();

export type WriterEvidenceHead = {
  documentId: string;
  brandId: string;
  articleId: string;
  contentHash: string;
  status: string;
  updatedAt: string | null;
  articleDnaVersionColumn: string | null;
  schemaVersion: 1 | 2;
  refs: {
    brandDnaRef: VersionReference;
    keywordDnaRefs: VersionReference[];
    siloDnaRef: VersionReference;
    articleDnaRef: VersionReference;
  };
  radarOrigin: RadarDocumentOrigin | null;
  capturedAt: string | null;
  pendingDecisions: z.infer<typeof PendenciasSchema>;
  dossier: z.infer<typeof DossieSemBundleSchema> | null;
  bundleObservedAt: string | null;
  serpStanding: z.infer<typeof PosicaoDaSerpSchema> | null;
};

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);

/** Referência legada (`legacy:<entidade>:v1`): não aponta para versão real. */
export const isLegacyVersionReference = (referencia: VersionReference): boolean => referencia.versionId.startsWith("legacy:");

/** Remonta e valida o cabeçalho pelos schemas do dono. `null` = fora do contrato. */
export function writerEvidenceHeadFromRow(linha: Record<string, unknown>, brandId: string): WriterEvidenceHead | null {
  if (typeof linha.id !== "string" || linha.marca_id !== brandId || typeof linha.article_id !== "string") return null;
  if (typeof linha.content_hash !== "string") return null;
  const versao = linha.h_schemaVersion;
  if (versao !== 1 && versao !== 2) return null;
  const refs = z.object({
    brandDnaRef: VersionReferenceSchema,
    keywordDnaRefs: z.array(VersionReferenceSchema).min(1),
    siloDnaRef: VersionReferenceSchema,
    articleDnaRef: VersionReferenceSchema,
  }).safeParse({
    brandDnaRef: linha.h_brandDnaRef, keywordDnaRefs: linha.h_keywordDnaRefs,
    siloDnaRef: linha.h_siloDnaRef, articleDnaRef: linha.h_articleDnaRef,
  });
  if (!refs.success) return null;

  let radarOrigin: RadarDocumentOrigin | null = null;
  if (versao === 2) {
    const origem = RadarDocumentOriginSchema.safeParse(linha.h_radarOrigin);
    if (!origem.success) return null;
    radarOrigin = origem.data;
  }

  const camposDoDossie = {
    bundleId: linha.x_bundleId, bundleHash: linha.x_bundleHash, researchProfile: linha.x_researchProfile,
    keywordContext: linha.x_keywordContext, writerMayNot: linha.x_writerMayNot,
  };
  const temDossie = Object.values(camposDoDossie).some(valor => valor !== null && valor !== undefined);
  let dossier: WriterEvidenceHead["dossier"] = null;
  if (versao === 2 && temDossie) {
    const dossie = DossieSemBundleSchema.safeParse(camposDoDossie);
    if (!dossie.success) return null;
    dossier = dossie.data;
  }

  const pendencias = PendenciasSchema.safeParse(linha.h_pendingDecisions ?? undefined);
  if (!pendencias.success) return null;
  const posicao = linha.b_serpStanding === null || linha.b_serpStanding === undefined ? null : PosicaoDaSerpSchema.safeParse(linha.b_serpStanding);
  if (posicao && !posicao.success) return null;

  return {
    documentId: linha.id,
    brandId,
    articleId: linha.article_id,
    contentHash: linha.content_hash,
    status: typeof linha.status === "string" ? linha.status : "",
    updatedAt: texto(linha.updated_at),
    articleDnaVersionColumn: texto(linha.article_dna_version_id),
    schemaVersion: versao,
    refs: refs.data,
    radarOrigin,
    capturedAt: texto(linha.h_capturedAt),
    pendingDecisions: pendencias.data,
    dossier,
    bundleObservedAt: dossier ? texto(linha.b_observedAt) : null,
    serpStanding: dossier && posicao?.success ? posicao.data : null,
  };
}

export async function readWriterEvidenceHead(context: WriterEvidenceContext, documentId: string): Promise<WriterEvidenceHead> {
  if (typeof documentId !== "string" || !documentId.trim() || documentId.length > 300) {
    throw new WriterEvidenceError("invalid_request", "documentId inválido.");
  }
  const { data, error } = await writerEvidenceClient(context).from("content_documents")
    .select(WRITER_EVIDENCE_HEAD_SELECT)
    .eq("id", documentId).eq("marca_id", context.brandId).maybeSingle();
  if (error) writerEvidenceDatabaseFailure(error);
  if (!data) throw new WriterEvidenceError("document_not_found", "Documento não encontrado nesta Marca.");
  const head = writerEvidenceHeadFromRow(data as unknown as Record<string, unknown>, context.brandId);
  if (!head) {
    throw new WriterEvidenceError("document_incompatible",
      "O documento está gravado fora do contrato atual; as evidências não são servidas sobre ele.");
  }
  return head;
}

/* ================== as linhas da virada (SDD do Assunto) ================== */

/**
 * AS LINHAS DA VIRADA que o envio grava com Assunto em
 * `importedContext.editorialContext` (SDD do Assunto, F4.1; adendo F4.4):
 * tronco, onde virar, seção da virada, direção do H1, destino e alerta.
 * Fora do dossiê (invariante 78): o artigo-modelo não viaja no bundle.
 *
 * NÃO estão no cabeçalho comum: manifesto, fatias do `read_writer_evidence` e
 * divergências leem o cabeçalho e não usam as linhas. Só quem as ENTREGA ao
 * redator (fundamentos e material por seção) chama esta leitura, e só quando
 * o ArticleDNA fixado tem Assunto — sem Assunto, nenhuma consulta a mais.
 * Um caminho, na Marca do contexto: `[]` (2 B) em documento enviado antes, e
 * < 2 kB com Assunto (nota de 280 caracteres e destino longo).
 */
export const WRITER_EDITORIAL_CONTEXT_SELECT = "c_editorialContext:payload->importedContext->editorialContext";

export async function readWriterEditorialContext(context: WriterEvidenceContext, head: Pick<WriterEvidenceHead, "documentId" | "schemaVersion">): Promise<z.infer<typeof ContextoEditorialSchema>> {
  if (head.schemaVersion !== 2) return [];
  const { data, error } = await writerEvidenceClient(context).from("content_documents")
    .select(WRITER_EDITORIAL_CONTEXT_SELECT)
    .eq("id", head.documentId).eq("marca_id", context.brandId).maybeSingle();
  if (error) writerEvidenceDatabaseFailure(error);
  if (!data) throw new WriterEvidenceError("document_not_found", "Documento não encontrado nesta Marca.");
  const lido = ContextoEditorialSchema.safeParse((data as unknown as Record<string, unknown>).c_editorialContext ?? undefined);
  if (!lido.success) {
    throw new WriterEvidenceError("document_incompatible",
      "O documento está gravado fora do contrato atual; as evidências não são servidas sobre ele.");
  }
  return lido.data;
}

/* ======================= seções do dossiê por caminho ==================== */

/** Até 5 caminhos do dossiê por consulta — o que a Fase 0 mediu como linear. */
export const WRITER_EVIDENCE_BUNDLE_PATHS_PER_QUERY = 5;

const CHAVE = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * Lê seções do dossiê por caminho, em série, com o `bundleHash` em cada
 * consulta. Pacote trocado entre consultas é `document_changed`: juntar
 * partes de pacotes diferentes produziria evidência que nenhuma investigação
 * sustenta.
 */
export async function readWriterBundlePaths(
  context: WriterEvidenceContext,
  head: WriterEvidenceHead,
  caminhos: ReadonlyArray<readonly string[]>,
): Promise<Map<string, unknown>> {
  if (!head.dossier) return new Map();
  for (const caminho of caminhos) {
    if (!caminho.length || !caminho.every(parte => CHAVE.test(parte))) throw new WriterEvidenceError("invalid_request", "Caminho do dossiê inválido.");
  }
  const lidos = new Map<string, unknown>();
  for (let inicio = 0; inicio < caminhos.length; inicio += WRITER_EVIDENCE_BUNDLE_PATHS_PER_QUERY) {
    const fatia = caminhos.slice(inicio, inicio + WRITER_EVIDENCE_BUNDLE_PATHS_PER_QUERY);
    const select = [
      "id", `x_bundleHash:${DOSSIE}->bundleHash`,
      ...fatia.map((caminho, indice) => `p_${indice}:${DOSSIE}->bundle->${caminho.join("->")}`),
    ].join(",");
    const { data, error } = await writerEvidenceClient(context).from("content_documents")
      .select(select).eq("id", head.documentId).eq("marca_id", context.brandId).maybeSingle();
    if (error) writerEvidenceDatabaseFailure(error);
    if (!data) throw new WriterEvidenceError("document_not_found", "Documento não encontrado nesta Marca.");
    const linha = data as unknown as Record<string, unknown>;
    if (linha.x_bundleHash !== head.dossier.bundleHash) {
      throw new WriterEvidenceError("document_changed", "O pacote do Radar deste documento mudou durante a leitura. Tente de novo.");
    }
    fatia.forEach((caminho, indice) => {
      const valor = linha[`p_${indice}`];
      if (valor !== null && valor !== undefined) lidos.set(caminho.join("."), valor);
    });
  }
  return lidos;
}

/* ============================== funções SQL ============================= */

export type WriterManifestRpcRow = {
  source: string;
  refId: string | null;
  kind: string | null;
  jsonPath: string[];
  valueType: string | null;
  bytes: number | null;
  items: number | null;
  contentHash: string | null;
  versionNumber: number | null;
  observedAt: string | null;
  status: string | null;
  note: string | null;
};

const numeroOuNulo = (valor: unknown): number | null => {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && /^-?\d+$/.test(valor)) return Number(valor);
  return null;
};

/**
 * `writer_evidence_manifest(p_brand_id, p_document_id)`. `null` = a migration
 * ainda não foi aplicada: o manifesto declara "tamanho desconhecido" e nunca
 * baixa para medir.
 */
export async function callWriterEvidenceManifestRpc(context: WriterEvidenceContext, documentId: string): Promise<WriterManifestRpcRow[] | null> {
  const { data, error } = await writerEvidenceClient(context).rpc("writer_evidence_manifest", {
    p_brand_id: context.brandId, p_document_id: documentId,
  });
  if (error) {
    if (writerEvidenceRpcMissing(error)) return null;
    writerEvidenceDatabaseFailure(error);
  }
  return ((data || []) as Array<Record<string, unknown>>).map(linha => ({
    source: String(linha.source ?? ""),
    refId: texto(linha.ref_id),
    kind: texto(linha.kind),
    jsonPath: Array.isArray(linha.json_path) ? linha.json_path.map(String) : [],
    valueType: texto(linha.value_type),
    bytes: numeroOuNulo(linha.bytes),
    items: numeroOuNulo(linha.items),
    contentHash: texto(linha.content_hash),
    versionNumber: numeroOuNulo(linha.version_number),
    observedAt: texto(linha.observed_at),
    status: texto(linha.status),
    note: texto(linha.note),
  }));
}

export type WriterSliceRpcSource = "document" | "analysis_version" | "radar_run" | "artifact_version" | "video_text";

const CONTAINERS = new Set(["array", "object", "string", "number", "boolean", "null", "absent"]);

/**
 * `writer_evidence_slice(...)`. `null` = migration pendente. Os ids de item,
 * versão e corrida são resolvidos DENTRO da função a partir do documento;
 * `p_ref` só existe para versão de DNA e vídeo, e a função o recusa se não
 * for referência do próprio documento.
 */
export async function callWriterEvidenceSliceRpc(context: WriterEvidenceContext, input: {
  documentId: string;
  source: WriterSliceRpcSource;
  path: readonly string[];
  ref?: string | null;
  offset: number;
  limit: number;
  maxBytes: number;
  fields?: readonly string[] | null;
  excludeKeys?: readonly string[] | null;
}): Promise<WriterSliceRow[] | null> {
  const { data, error } = await writerEvidenceClient(context).rpc("writer_evidence_slice", {
    p_brand_id: context.brandId,
    p_document_id: input.documentId,
    p_source: input.source,
    p_path: [...input.path],
    p_ref: input.ref ?? null,
    p_offset: input.offset,
    p_limit: input.limit,
    p_max_bytes: input.maxBytes,
    p_fields: input.fields?.length ? [...input.fields] : null,
    p_exclude_keys: input.excludeKeys?.length ? [...input.excludeKeys] : null,
  });
  if (error) {
    if (writerEvidenceRpcMissing(error)) return null;
    writerEvidenceDatabaseFailure(error);
  }
  return ((data || []) as Array<Record<string, unknown>>).map(linha => {
    const container = String(linha.container_type ?? "absent");
    return {
      containerType: (CONTAINERS.has(container) ? container : "absent") as WriterSliceRow["containerType"],
      total: numeroOuNulo(linha.total) ?? 0,
      ordinal: numeroOuNulo(linha.ordinal) ?? 0,
      span: numeroOuNulo(linha.span) ?? 0,
      itemKey: typeof linha.item_key === "string" ? linha.item_key : null,
      valueType: texto(linha.value_type),
      bytes: numeroOuNulo(linha.bytes) ?? 0,
      omitted: linha.omitted === true,
      value: linha.value === undefined ? null : linha.value,
    };
  });
}
