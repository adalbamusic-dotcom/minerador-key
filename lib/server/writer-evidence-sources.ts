import "server-only";

/**
 * ===== LEITOR DE EVIDÊNCIAS · AS FONTES DOS OUTROS MÓDULOS =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §3 (inventário) e §4.3 (leitura de outros módulos).
 *
 * PELA REGRA DE PARSE DO DONO, COM CONSULTA ESTREITA PRÓPRIA. Os resolvers
 * atuais baixam MB (`findByArticleHydratingVersions` ~2,5 MB; parecer de
 * formação e ArticleDNA só têm leitor da Marca inteira). Aqui cada consulta:
 *
 *   - filtra a Marca na própria consulta (`marca_id`/`brand_id`, R4) e o
 *     artigo ou a referência do documento;
 *   - pede colunas e caminhos, nunca `select("*")` nem payload de lista (R5);
 *   - valida o que volta pelo schema ou resolver do módulo dono.
 *
 * Nenhum arquivo de outro módulo é editado: só importado para ler e validar.
 * Nada aqui escreve no banco.
 */

import { z } from "zod";
import {
  ArticleDNASchema,
  BrandDNASchema,
  SiloDNASchema,
  VersionedArticleDNASchema,
  VersionedBrandDNASchema,
  VersionedSiloDNASchema,
  type VersionReference,
} from "@/lib/arquiteto/contracts";
import {
  ARTICLE_FORMATION_SERP_SUBJECT_TYPE,
  ARTICLE_FORMATION_SERP_WORKFLOW_STAGE,
  ArticleFormationSerpPayloadSchema,
} from "@/lib/arquiteto/article-serp-record";
import {
  TERRITORIAL_SERP_SUBJECT_TYPE,
  TERRITORIAL_SERP_WORKFLOW_STAGE,
  TerritorialSerpPayloadSchema,
} from "@/lib/arquiteto/territorial-serp-record";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  sameSerpCacheLens,
  serpCacheEntryServes,
  serpCacheFreshness,
  serpCacheLensLabel,
  serpCacheSubjectId,
  type SerpCacheLens,
  type SerpCacheQuery,
} from "@/lib/editorial/serp-cache";
import { BrandSkillSchema, NormalizedSkillSectionSchema } from "@/lib/marca/brand-skill-contracts";
import { effectiveBrandDnaVersionId } from "@/lib/marca/domain";
import { resolveCanonicalKeywordSnapshot } from "@/lib/minerador/canonical-keyword-snapshot";
import { KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE } from "@/lib/minerador/keyword-semantic-qualification";
import { acceptQualificationPayload } from "@/lib/minerador/keyword-semantic-qualification-current";
import { WRITER_ARTICLE_DNA_FOUNDATION_FIELDS, WRITER_BRAND_VOICE_DEFINITION_KEY, writerBrandVoiceEntityId } from "@/lib/redator/writer-evidence-catalog";
import { readSerpCacheEntries, type SerpCacheReadMode, type SerpCacheStoredEntry } from "@/lib/server/serp-cache-store";
import { parseStoredSerpSnapshotPayload } from "@/lib/server/serp-persistence-adapter";
import {
  WriterEvidenceError,
  isLegacyVersionReference,
  writerEvidenceClient,
  writerEvidenceDatabaseFailure,
  writerEvidenceTableMissing,
  type WriterEvidenceContext,
  type WriterEvidenceHead,
} from "@/lib/server/writer-evidence-document";

type Linha = Record<string, unknown>;

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const numero = (valor: unknown): number | null => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);
const registro = (valor: unknown): Linha | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Linha : null;

async function linhas(consulta: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<Linha[]> {
  const { data, error } = await consulta;
  if (error) writerEvidenceDatabaseFailure(error);
  return Array.isArray(data) ? data as Linha[] : data ? [data as Linha] : [];
}

/* =========================== versões de artefato ========================= */

export type WriterArtifactVersionMeta = {
  versionId: string;
  entityId: string;
  artifactType: string;
  versionNumber: number | null;
  status: string | null;
  contentHash: string | null;
  createdAt: string | null;
};

const METADADOS_DE_VERSAO = "version_id,entity_id,artifact_type,version_number,status,content_hash,created_at";

const metaDeVersao = (linha: Linha): WriterArtifactVersionMeta | null => {
  const versionId = texto(linha.version_id);
  const entityId = texto(linha.entity_id);
  const artifactType = texto(linha.artifact_type);
  if (!versionId || !entityId || !artifactType) return null;
  return {
    versionId, entityId, artifactType,
    versionNumber: numero(linha.version_number), status: texto(linha.status),
    contentHash: texto(linha.content_hash), createdAt: texto(linha.created_at),
  };
};

/** Metadados das versões pedidas, só da Marca. Sem payload. */
export async function readWriterArtifactVersionMeta(context: WriterEvidenceContext, versionIds: readonly string[]): Promise<Map<string, WriterArtifactVersionMeta>> {
  const ids = [...new Set(versionIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const achadas = await linhas(writerEvidenceClient(context).from("editorial_artifact_versions")
    .select(METADADOS_DE_VERSAO).eq("marca_id", context.brandId).in("version_id", ids));
  const mapa = new Map<string, WriterArtifactVersionMeta>();
  for (const linha of achadas) {
    const meta = metaDeVersao(linha);
    if (meta && ids.includes(meta.versionId)) mapa.set(meta.versionId, meta);
  }
  return mapa;
}

/**
 * A maior versão existente de cada entidade, para o rótulo "há versão mais
 * nova". Só `entity_id` e `version_number`; a versão nova NÃO é servida:
 * mudar a base é decisão do dono, com reenvio (invariantes 30 e 51).
 */
export async function readWriterLatestVersionNumbers(context: WriterEvidenceContext, artifactType: string, entityIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(entityIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const achadas = await linhas(writerEvidenceClient(context).from("editorial_artifact_versions")
    .select("entity_id,version_number").eq("marca_id", context.brandId).eq("artifact_type", artifactType).in("entity_id", ids));
  const maior = new Map<string, number>();
  for (const linha of achadas) {
    const entidade = texto(linha.entity_id);
    const versao = numero(linha.version_number);
    if (!entidade || versao === null) continue;
    maior.set(entidade, Math.max(maior.get(entidade) ?? 0, versao));
  }
  return maior;
}

export type WriterDnaPayload = { meta: WriterArtifactVersionMeta; data: Linha };

/**
 * Lê UMA versão inteira e valida pelo schema do dono. Só para DNAs, cujo
 * tamanho é limitado pelo contrato — medido em 2026-09-23 (agregado):
 * Qualificação ≤ 4,3 kB, SiloDNA 10 kB, Skill da Marca 44,5 kB, ArticleDNA
 * ≤ 73 kB. É a troca consciente do leitor: ler a versão validada inteira
 * (≤ 73 kB) em vez de servir um pedaço que nenhum schema conferiu.
 */
export async function readWriterDnaVersion(context: WriterEvidenceContext, input: {
  versionId: string;
  expectedTypes: readonly string[];
  entityId?: string | null;
}): Promise<WriterDnaPayload> {
  const [linha] = await linhas(writerEvidenceClient(context).from("editorial_artifact_versions")
    .select(`${METADADOS_DE_VERSAO},payload`).eq("marca_id", context.brandId).eq("version_id", input.versionId).limit(1));
  const meta = linha ? metaDeVersao(linha) : null;
  if (!linha || !meta || !input.expectedTypes.includes(meta.artifactType)) {
    throw new WriterEvidenceError("source_absent", "A versão referenciada pelo documento não existe nesta Marca.");
  }
  if (input.entityId && meta.entityId !== input.entityId) {
    throw new WriterEvidenceError("document_incompatible", "A versão referenciada pertence a outra entidade.");
  }
  const data = parseDnaPayload(context.brandId, meta, linha.payload);
  if (!data) throw new WriterEvidenceError("document_incompatible", "A versão referenciada está fora do contrato do módulo dono.");
  return { meta, data };
}

/** O parse de cada dono. Envelope gravado ou payload cru: os dois existem no banco. */
function parseDnaPayload(brandId: string, meta: WriterArtifactVersionMeta, payload: unknown): Linha | null {
  const objeto = registro(payload);
  if (!objeto) return null;
  const envelope = "payload" in objeto && "versionId" in objeto;
  switch (meta.artifactType) {
    case KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE: {
      const qualificacao = acceptQualificationPayload({ brandId, entityId: meta.entityId, payload });
      return qualificacao ? qualificacao as unknown as Linha : null;
    }
    case "article_dna": {
      const lido = envelope ? VersionedArticleDNASchema.safeParse(payload) : ArticleDNASchema.safeParse(payload);
      if (!lido.success) return null;
      const dna = (envelope ? (lido.data as { payload: Linha }).payload : lido.data) as Linha;
      return dna.brandId === brandId ? dna : null;
    }
    case "silo_dna": {
      const lido = envelope ? VersionedSiloDNASchema.safeParse(payload) : SiloDNASchema.safeParse(payload);
      if (!lido.success) return null;
      return (envelope ? (lido.data as { payload: Linha }).payload : lido.data) as Linha;
    }
    case "brand_dna": {
      const lido = envelope ? VersionedBrandDNASchema.safeParse(payload) : BrandDNASchema.safeParse(payload);
      if (!lido.success) return null;
      const dna = (envelope ? (lido.data as { payload: Linha }).payload : lido.data) as Linha;
      return dna.brandId === brandId ? dna : null;
    }
    case "brand_skill": {
      const lido = BrandSkillSchema.safeParse(payload);
      if (!lido.success || lido.data.brandId !== brandId) return null;
      /* O Markdown original repete as seções normalizadas: sai só a forma normalizada. */
      return {
        definitionKey: lido.data.definitionKey,
        name: lido.data.name,
        version: lido.data.version,
        title: lido.data.normalizedContent.title,
        sections: lido.data.normalizedContent.sections,
        extraSections: lido.data.normalizedContent.extraSections,
      };
    }
    default:
      return null;
  }
}

/* ====================== ArticleDNA: projeção editorial ==================== */

export type WriterArticleProjection = {
  meta: WriterArtifactVersionMeta;
  fields: Linha;
  invalidFields: string[];
};

const formaDoArticleDna = ArticleDNASchema.shape as unknown as Record<string, z.ZodType>;

/**
 * A PROJEÇÃO DO ArticleDNA POR CAMINHO: os campos editoriais, cada um
 * validado pelo schema do campo no contrato do Arquiteto. Duas formas de
 * gravação convivem (payload cru, medido em 2026-09-23: 5 de 5; envelope,
 * escrito por `ArtifactRepository.save`), e as duas são pedidas.
 *
 * Só a referência ao ArticleDNA é usada do cabeçalho: o Guardião (SDD do
 * Assunto, F4.2) chama com a referência lida da própria linha do documento e
 * `campos = ["subject"]` — um caminho, < 1 kB.
 *
 * O `subject` é validado INTEIRO pelo schema do Arquiteto e sai REDUZIDO ao
 * que a escrita usa: frase, nota e destino. `keywordId`, `approvedPackageRef`
 * e `attachedBy` (um `auth.users.id`) não vão ao cliente MCP nem ao pacote
 * da IA; o objeto completo continua na fatia `dna.article/<versionId>`.
 */
const assuntoParaAEscrita = (valor: unknown): Linha => {
  const assunto = valor as { phrase: string; note: string | null; destinationUrl: string | null };
  return { phrase: assunto.phrase, note: assunto.note, destinationUrl: assunto.destinationUrl };
};

export async function readWriterArticleProjection(
  context: WriterEvidenceContext,
  head: { refs: Pick<WriterEvidenceHead["refs"], "articleDnaRef"> },
  campos: readonly string[] = WRITER_ARTICLE_DNA_FOUNDATION_FIELDS,
): Promise<WriterArticleProjection | null> {
  const versionId = head.refs.articleDnaRef.versionId;
  if (isLegacyVersionReference(head.refs.articleDnaRef)) return null;
  const pedidos = campos.filter(campo => campo in formaDoArticleDna);
  const select = [
    METADADOS_DE_VERSAO,
    ...pedidos.map(campo => `a_${campo}:payload->${campo}`),
    ...pedidos.map(campo => `e_${campo}:payload->payload->${campo}`),
    "e_brandId:payload->payload->brandId", "a_brandId:payload->brandId",
  ].join(",");
  const [linha] = await linhas(writerEvidenceClient(context).from("editorial_artifact_versions")
    .select(select).eq("marca_id", context.brandId).eq("version_id", versionId).eq("artifact_type", "article_dna").limit(1));
  const meta = linha ? metaDeVersao(linha) : null;
  if (!linha || !meta) return null;
  const envelope = linha.e_brandId !== null && linha.e_brandId !== undefined;
  const prefixo = envelope ? "e_" : "a_";
  if (linha[`${prefixo}brandId`] !== context.brandId) return null;
  const fields: Linha = {};
  const invalidFields: string[] = [];
  for (const campo of pedidos) {
    const valor = linha[`${prefixo}${campo}`];
    if (valor === null || valor === undefined) continue;
    const lido = formaDoArticleDna[campo]?.safeParse(valor);
    if (lido?.success) fields[campo] = campo === "subject" ? assuntoParaAEscrita(lido.data) : lido.data;
    else invalidFields.push(campo);
  }
  return { meta, fields, invalidFields };
}

/* =========================== métricas do Minerador ======================== */

const COLUNAS_DA_KEYWORD = "id,brand_id,keyword,status,intent,results_allintitle,volume_search,kgr_score,volume_source,analise_semantica";

export type WriterKeywordMetrics = {
  keywordId: string;
  keyword: string | null;
  status: string | null;
  metrics: unknown;
  semantic: { intent: string | null; niche: string | null; funnel: string | null };
};

/**
 * AS MÉTRICAS PELO RESOLVER DO MINERADOR (`resolveCanonicalKeywordSnapshot`),
 * nunca por leitor paralelo: é ele que decide volume validado, KGR aplicável,
 * CPC e KD. Só as keywords do documento, só da Marca, só vivas.
 */
export async function readWriterKeywordMetrics(context: WriterEvidenceContext, keywordIds: readonly string[]): Promise<WriterKeywordMetrics[]> {
  const ids = [...new Set(keywordIds.filter(Boolean))];
  if (!ids.length) return [];
  const achadas = await linhas(writerEvidenceClient(context).from("minerador_keywords")
    .select(COLUNAS_DA_KEYWORD).eq("brand_id", context.brandId).in("id", ids).is("deleted_at", null));
  return achadas
    .filter(linha => linha.brand_id === context.brandId && typeof linha.id === "string" && ids.includes(linha.id))
    .sort((a, b) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)))
    .map(linha => {
      const snapshot = resolveCanonicalKeywordSnapshot(linha as Parameters<typeof resolveCanonicalKeywordSnapshot>[0]);
      return {
        keywordId: String(linha.id),
        keyword: snapshot.identity.keyword,
        status: snapshot.status.status,
        metrics: snapshot.metrics,
        semantic: { intent: snapshot.semantic.intent, niche: snapshot.semantic.niche, funnel: snapshot.semantic.funnel },
      };
    });
}

/* ============================== cache de SERP ============================= */

export type WriterSerpCacheLensEntry = {
  lens: string;
  subjectId: string;
  entry: SerpCacheStoredEntry | null;
  /** `null` quando a entrada atende; senão, por que não serve. */
  missReason: string | null;
  stale: boolean;
};

export type WriterSerpCacheKeyword = {
  keywordId: string;
  qualificationVersionId: string;
  query: { keyword: string; locationCode: number; languageCode: string } | null;
  lenses: WriterSerpCacheLensEntry[];
};

const ConsultaDaQualificacaoSchema = z.object({
  keyword: z.string().min(1),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(1),
}).passthrough();

/** A lente pelo rótulo (`desktop-windows`…). */
export const writerSerpCacheLensOf = (rotulo: string): SerpCacheLens | null =>
  SERP_CACHE_LENSES.find(lente => serpCacheLensLabel(lente) === rotulo) ?? null;

/**
 * O CACHE DE SERP DAS KEYWORDS DO DOCUMENTO, NAS 4 LENTES.
 *
 * A chave é determinística (`serpCacheSubjectId`) a partir da CONSULTA da
 * Qualificação fixada no documento — lida por caminho (`payload->query`,
 * < 0,3 kB), não a vigente. `advanced` é o endpoint das 4 lentes
 * (Minerador e Arquiteto). A entrada que não atende a consulta inteira
 * (colisão de hash) é ausência. Vencida continua legível, rotulada.
 *
 * O Redator nunca coleta (invariante 50): ausente é ausente.
 */
export async function readWriterSerpCache(context: WriterEvidenceContext, head: WriterEvidenceHead, input: {
  keywordIds?: readonly string[];
  mode: SerpCacheReadMode;
  lenses?: readonly SerpCacheLens[];
}): Promise<WriterSerpCacheKeyword[]> {
  const referencias = head.refs.keywordDnaRefs
    .filter(referencia => !isLegacyVersionReference(referencia))
    .filter(referencia => !input.keywordIds || input.keywordIds.includes(referencia.entityId));
  if (!referencias.length) return [];
  const consultas = await linhas(writerEvidenceClient(context).from("editorial_artifact_versions")
    .select("version_id,entity_id,q:payload->query")
    .eq("marca_id", context.brandId).eq("artifact_type", KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE)
    .in("version_id", referencias.map(referencia => referencia.versionId)));
  const porVersao = new Map(consultas.map(linha => [String(linha.version_id), linha]));
  const lentes = input.lenses?.length ? input.lenses : SERP_CACHE_LENSES;
  const agora = context.now ? context.now() : new Date();

  const pedidos = referencias.map(referencia => {
    const linha = porVersao.get(referencia.versionId);
    const consulta = linha && linha.entity_id === referencia.entityId ? ConsultaDaQualificacaoSchema.safeParse(linha.q) : null;
    const query = consulta?.success ? { keyword: consulta.data.keyword, locationCode: consulta.data.locationCode, languageCode: consulta.data.languageCode } : null;
    const porLente = lentes.map(lens => {
      const pedido: SerpCacheQuery | null = query ? { ...query, lens, endpoint: "advanced" } : null;
      return { lens, pedido, subjectId: pedido ? serpCacheSubjectId(pedido) : "" };
    });
    return { referencia, query, porLente };
  });

  const ids = pedidos.flatMap(pedido => pedido.porLente.map(item => item.subjectId)).filter(Boolean);
  /* `actorUserId` só serve à escrita, que este leitor nunca faz. */
  const gravadas = ids.length
    ? await readSerpCacheEntries({ supabase: writerEvidenceClient(context), brandId: context.brandId, actorUserId: "" }, ids, input.mode)
    : new Map<string, SerpCacheStoredEntry>();

  return pedidos.map(({ referencia, query, porLente }) => ({
    keywordId: referencia.entityId,
    qualificationVersionId: referencia.versionId,
    query,
    lenses: porLente.map(({ lens, pedido, subjectId }) => {
      const gravada = subjectId ? gravadas.get(subjectId) ?? null : null;
      if (!pedido || !gravada) return { lens: serpCacheLensLabel(lens), subjectId, entry: null, missReason: pedido ? "não coletada" : "consulta da Qualificação ilegível", stale: false };
      const atende = serpCacheEntryServes(gravada.meta, { query: pedido, depth: 1, now: agora, maxAgeMs: Number.MAX_SAFE_INTEGER });
      if (!atende.serves) return { lens: serpCacheLensLabel(lens), subjectId, entry: null, missReason: atende.reason, stale: false };
      const frescor = serpCacheFreshness(gravada.meta, { now: agora });
      return { lens: serpCacheLensLabel(lens), subjectId, entry: gravada, missReason: null, stale: !frescor.fresh };
    }),
  }));
}

export const writerSerpCacheCanonicalLens = serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS);
/** A lente canônica: a única que guarda corpo (as outras guardam observação e digest). */
export const WRITER_SERP_CACHE_CANONICAL_LENS: SerpCacheLens = SERP_CACHE_CANONICAL_LENS;
export const writerSerpCacheIsCanonical = (lens: SerpCacheLens) => sameSerpCacheLens(lens, SERP_CACHE_CANONICAL_LENS);

/* ============================== snapshots SERP ============================ */

export type WriterSerpSnapshotMeta = {
  id: string;
  snapshotVersion: number | null;
  contentHash: string | null;
  status: string | null;
  createdAt: string | null;
  reviewStatus: string | null;
};

const METADADOS_DO_SNAPSHOT = "id,snapshot_version,content_hash,status,created_at";

async function revisaoDoSnapshot(context: WriterEvidenceContext, head: WriterEvidenceHead, snapshotId: string): Promise<string | null> {
  const [revisao] = await linhas(writerEvidenceClient(context).from("editorial_serp_reviews")
    .select("status,created_at").eq("marca_id", context.brandId).eq("article_id", head.articleId).eq("snapshot_id", snapshotId)
    .order("created_at", { ascending: false }).limit(1));
  return revisao ? texto(revisao.status) : null;
}

const metaDoSnapshot = (linha: Linha, revisao: string | null): WriterSerpSnapshotMeta => ({
  id: String(linha.id), snapshotVersion: numero(linha.snapshot_version), contentHash: texto(linha.content_hash),
  status: texto(linha.status), createdAt: texto(linha.created_at), reviewStatus: revisao,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O snapshot pela referência que a versão de análise guarda.
 *
 * O `serpSnapshotId` entregue NÃO é o uuid da linha: é o id do registro no
 * payload (`payload.id` ou `payload.research.id`). Medido em 2026-09-23,
 * agregado: 2 de 2 versões entregues com id não-uuid, 1 de 1 casando pelo
 * payload em cada artigo. É a regra do Radar
 * (`SerpSnapshotRepository.findRemoteSnapshot`). Só metadados voltam.
 */
export async function readWriterSerpSnapshotMeta(context: WriterEvidenceContext, head: WriterEvidenceHead, referencia: string): Promise<WriterSerpSnapshotMeta | null> {
  const porFiltro = (coluna: string) => linhas(writerEvidenceClient(context).from("editorial_serp_snapshots")
    .select(METADADOS_DO_SNAPSHOT).eq("marca_id", context.brandId).eq("article_id", head.articleId).eq(coluna, referencia)
    .order("snapshot_version", { ascending: false }).limit(1));
  for (const coluna of UUID.test(referencia) ? ["id", "payload->>id", "payload->research->>id"] : ["payload->>id", "payload->research->>id"]) {
    const [linha] = await porFiltro(coluna);
    if (linha) return metaDoSnapshot(linha, await revisaoDoSnapshot(context, head, String(linha.id)));
  }
  return null;
}

/** O snapshot mais recente do artigo. Posterior ao pacote quando é outro. */
export async function readWriterLatestSerpSnapshotMeta(context: WriterEvidenceContext, head: WriterEvidenceHead): Promise<WriterSerpSnapshotMeta | null> {
  const [linha] = await linhas(writerEvidenceClient(context).from("editorial_serp_snapshots")
    .select(METADADOS_DO_SNAPSHOT).eq("marca_id", context.brandId).eq("article_id", head.articleId)
    .order("snapshot_version", { ascending: false }).limit(1));
  return linha ? metaDoSnapshot(linha, await revisaoDoSnapshot(context, head, String(linha.id))) : null;
}

/**
 * O snapshot inteiro (≤ 12,6 kB medidos), pelo parse do Radar
 * (`parseStoredSerpSnapshotPayload`). O `diagnostic` da pesquisa sai só a
 * pedido: ele depende de quem perguntou.
 */
export async function readWriterSerpSnapshotRecord(context: WriterEvidenceContext, head: WriterEvidenceHead, snapshotId: string): Promise<Linha> {
  const [linha] = await linhas(writerEvidenceClient(context).from("editorial_serp_snapshots")
    .select("id,source_version_id,payload").eq("marca_id", context.brandId).eq("article_id", head.articleId).eq("id", snapshotId).limit(1));
  if (!linha) throw new WriterEvidenceError("source_absent", "Snapshot SERP não encontrado para este artigo.");
  try {
    const registroLido = parseStoredSerpSnapshotPayload(linha.payload, texto(linha.source_version_id));
    if (registroLido.research && registroLido.research.brandId !== context.brandId) throw new Error("outra marca");
    return registroLido as unknown as Linha;
  } catch {
    throw new WriterEvidenceError("document_incompatible", "O snapshot SERP está fora do contrato do Radar.");
  }
}

/* ======================= pareceres SERP do Arquiteto ====================== */

const CamposDaFormacao = ArticleFormationSerpPayloadSchema.omit({ assessment: true });
const CHAVES_DA_FORMACAO = Object.keys(CamposDaFormacao.shape);

export type WriterFormation = {
  workflowItemId: string;
  candidateRef: string;
  state: string | null;
  updatedAt: string | null;
  /** O `contentHash` gravado bate com o da referência do ArticleDNA? */
  hashMatches: boolean;
  data: Linha;
};

/**
 * A IDENTIDADE DO PARECER. `serpAssessmentRef.entityId` é o id do PARECER
 * (`payload.assessment.id`), não o `subject_id` da linha (o candidateRef).
 * Medido em 2026-09-23, agregado: nos 2 documentos, 0 casando por
 * `subject_id` e 1 casando por `payload.assessment.id` (e pelo hash).
 * Parecer refeito troca o id: a referência antiga não casa mais, e a ausência
 * é declarada em vez de servir o parecer novo como se fosse o fixado.
 */
const FILTRO_DO_PARECER = "payload->assessment->>id";

export type WriterFormationRef = { entityId: string; contentHash: string | null };

const consultaDoParecer = (context: WriterEvidenceContext, select: string, referencia: WriterFormationRef) =>
  writerEvidenceClient(context).from("editorial_workflow_items")
    .select(select).eq("marca_id", context.brandId).eq("subject_type", ARTICLE_FORMATION_SERP_SUBJECT_TYPE)
    .eq("stage", ARTICLE_FORMATION_SERP_WORKFLOW_STAGE).eq(FILTRO_DO_PARECER, referencia.entityId)
    .order("updated_at", { ascending: false }).limit(1);

/**
 * O PARECER SERP DE FORMAÇÃO, sem o `assessment` bruto (22-92 kB medidos):
 * por caminho, validado pelo contrato do registro do Arquiteto.
 */
export async function readWriterFormation(context: WriterEvidenceContext, referencia: WriterFormationRef): Promise<WriterFormation | null> {
  const select = ["id", "subject_id", "state", "updated_at", "a_hash:payload->assessment->>contentHash",
    ...CHAVES_DA_FORMACAO.map(chave => `f_${chave}:payload->${chave}`)].join(",");
  const [linha] = await linhas(consultaDoParecer(context, select, referencia));
  if (!linha) return null;
  const campos = Object.fromEntries(CHAVES_DA_FORMACAO
    .map(chave => [chave, linha[`f_${chave}`]] as const)
    .filter(([, valor]) => valor !== null && valor !== undefined));
  const lido = CamposDaFormacao.safeParse(campos);
  if (!lido.success || lido.data.candidateRef !== linha.subject_id) {
    throw new WriterEvidenceError("document_incompatible", "O parecer SERP de formação está fora do contrato do Arquiteto.");
  }
  return {
    workflowItemId: String(linha.id), candidateRef: lido.data.candidateRef, state: texto(linha.state), updatedAt: texto(linha.updated_at),
    hashMatches: !referencia.contentHash || linha.a_hash === referencia.contentHash, data: lido.data as Linha,
  };
}

/** Só a existência e o estado do parecer, para o manifesto. */
export async function readWriterFormationMeta(context: WriterEvidenceContext, referencia: WriterFormationRef): Promise<{ workflowItemId: string; state: string | null; updatedAt: string | null; hashMatches: boolean } | null> {
  const [linha] = await linhas(consultaDoParecer(context, "id,subject_id,state,updated_at,a_hash:payload->assessment->>contentHash", referencia));
  return linha ? {
    workflowItemId: String(linha.id), state: texto(linha.state), updatedAt: texto(linha.updated_at),
    hashMatches: !referencia.contentHash || linha.a_hash === referencia.contentHash,
  } : null;
}

/** O `assessment` bruto do parecer, por caminho — só quando a IA desce nele. */
export async function readWriterFormationAssessment(context: WriterEvidenceContext, referencia: WriterFormationRef): Promise<unknown> {
  const [linha] = await linhas(consultaDoParecer(context, "id,assessment:payload->assessment", referencia));
  return linha ? linha.assessment : undefined;
}

export type WriterTerritorial = { workflowItemId: string; questionId: string; state: string | null; updatedAt: string | null; data: Linha };

const consultaTerritorial = (context: WriterEvidenceContext, select: string, territoryRef: string) =>
  writerEvidenceClient(context).from("editorial_workflow_items")
    .select(select).eq("marca_id", context.brandId).eq("subject_type", TERRITORIAL_SERP_SUBJECT_TYPE)
    .eq("stage", TERRITORIAL_SERP_WORKFLOW_STAGE).eq("payload->base->>territoryRef", territoryRef)
    .order("updated_at", { ascending: false }).limit(5);

/** Só quantos pareceres territoriais há e quando mudaram, para o manifesto: sem payload. */
export async function readWriterTerritorialMeta(context: WriterEvidenceContext, territoryRef: string): Promise<Array<{ workflowItemId: string; updatedAt: string | null }>> {
  const achadas = await linhas(consultaTerritorial(context, "id,subject_id,state,updated_at", territoryRef));
  return achadas.map(linha => ({ workflowItemId: String(linha.id), updatedAt: texto(linha.updated_at) }));
}

/** A SERP territorial do território do ArticleDNA (≤ 5 pareceres de ~1,1 kB). */
export async function readWriterTerritorial(context: WriterEvidenceContext, territoryRef: string): Promise<WriterTerritorial[]> {
  const achadas = await linhas(consultaTerritorial(context, "id,subject_id,state,updated_at,payload", territoryRef));
  const lidas: WriterTerritorial[] = [];
  for (const linha of achadas) {
    const lido = TerritorialSerpPayloadSchema.safeParse(linha.payload);
    if (!lido.success || lido.data.base.territoryRef !== territoryRef) continue;
    lidas.push({ workflowItemId: String(linha.id), questionId: String(linha.subject_id), state: texto(linha.state), updatedAt: texto(linha.updated_at), data: lido.data as unknown as Linha });
  }
  return lidas;
}

/* ============================ InternalLinkGraph =========================== */

export type WriterGraphMeta = {
  graphVersionId: string;
  graphId: string;
  versionNumber: number | null;
  workflowStatus: string | null;
  contentHash: string | null;
  createdAt: string | null;
  latest: { graphVersionId: string; versionNumber: number | null; workflowStatus: string | null; createdAt: string | null } | null;
};

/** A versão do grafo que o Radar congelou, e a mais nova do mesmo grafo (só o rótulo). */
export async function readWriterGraphMeta(context: WriterEvidenceContext, graphVersionId: string): Promise<WriterGraphMeta | null> {
  const [linha] = await linhas(writerEvidenceClient(context).from("internal_link_graphs")
    .select("graph_version_id,graph_id,version_number,workflow_status,content_hash,created_at")
    .eq("marca_id", context.brandId).eq("graph_version_id", graphVersionId).limit(1));
  if (!linha || typeof linha.graph_id !== "string") return null;
  const [maisNova] = await linhas(writerEvidenceClient(context).from("internal_link_graphs")
    .select("graph_version_id,version_number,workflow_status,created_at")
    .eq("marca_id", context.brandId).eq("graph_id", linha.graph_id).order("version_number", { ascending: false }).limit(1));
  return {
    graphVersionId, graphId: linha.graph_id, versionNumber: numero(linha.version_number), workflowStatus: texto(linha.workflow_status),
    contentHash: texto(linha.content_hash), createdAt: texto(linha.created_at),
    latest: maisNova && maisNova.graph_version_id !== graphVersionId
      ? { graphVersionId: String(maisNova.graph_version_id), versionNumber: numero(maisNova.version_number), workflowStatus: texto(maisNova.workflow_status), createdAt: texto(maisNova.created_at) }
      : null,
  };
}

const COLUNAS_DO_NO = "node_id,node_type,article_dna_version_id,silo_page_version_id,architectural_role,snapshot";
const COLUNAS_DA_ARESTA = "edge_id,source_node_id,target_node_id,relation_type,reason,priority,anchor_concepts";

/**
 * AS ARESTAS DE ENTRADA E SAÍDA DO ARTIGO na versão congelada. O nó do
 * artigo é o da versão do ArticleDNA fixada no documento.
 */
export async function readWriterGraphEdges(context: WriterEvidenceContext, graphVersionId: string, articleDnaVersionId: string): Promise<Linha> {
  const cliente = writerEvidenceClient(context);
  const nosDoArtigo = await linhas(cliente.from("internal_link_graph_nodes").select(COLUNAS_DO_NO)
    .eq("marca_id", context.brandId).eq("graph_version_id", graphVersionId).eq("article_dna_version_id", articleDnaVersionId));
  const ids = nosDoArtigo.map(no => String(no.node_id));
  if (!ids.length) return { articleNodes: [], outbound: [], inbound: [], relatedNodes: [] };
  const saida = await linhas(cliente.from("internal_link_graph_edges").select(COLUNAS_DA_ARESTA)
    .eq("marca_id", context.brandId).eq("graph_version_id", graphVersionId).in("source_node_id", ids).order("edge_id", { ascending: true }));
  const entrada = await linhas(cliente.from("internal_link_graph_edges").select(COLUNAS_DA_ARESTA)
    .eq("marca_id", context.brandId).eq("graph_version_id", graphVersionId).in("target_node_id", ids).order("edge_id", { ascending: true }));
  const outros = [...new Set([...saida.map(aresta => String(aresta.target_node_id)), ...entrada.map(aresta => String(aresta.source_node_id))])]
    .filter(id => !ids.includes(id));
  const relacionados = outros.length
    ? await linhas(cliente.from("internal_link_graph_nodes").select(COLUNAS_DO_NO)
      .eq("marca_id", context.brandId).eq("graph_version_id", graphVersionId).in("node_id", outros).order("node_id", { ascending: true }))
    : [];
  return { articleNodes: nosDoArtigo, outbound: saida, inbound: entrada, relatedNodes: relacionados };
}

/* ======================== catálogo do site e publicações ================== */

const COLUNAS_DO_CATALOGO = "normalized_url,normalized_canonical_url,title,h1,page_type,indexability,verification_status,presence_state,last_seen_at";
const COLUNAS_DA_PUBLICACAO = "id,article_id,document_id,status,slug,canonical,published_url,content_hash,updated_at";

type Pagina = { rows: Linha[]; total: number | null };

async function paginaComContagem(consulta: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null; count: number | null }>): Promise<Pagina> {
  const { data, error, count } = await consulta;
  if (error) writerEvidenceDatabaseFailure(error);
  return { rows: Array.isArray(data) ? data as Linha[] : [], total: typeof count === "number" ? count : null };
}

/** Uma página do catálogo do site da Marca, em ordem de URL. Só colunas de identidade da página. */
export function readWriterSiteCatalogPage(context: WriterEvidenceContext, offset: number, limit: number): Promise<Pagina> {
  return paginaComContagem(writerEvidenceClient(context).from("brand_site_catalog_entries")
    .select(COLUNAS_DO_CATALOGO, { count: "exact" }).eq("marca_id", context.brandId)
    .order("normalized_url", { ascending: true }).range(offset, offset + limit - 1));
}

export async function countWriterSiteCatalog(context: WriterEvidenceContext): Promise<number | null> {
  const { error, count } = await writerEvidenceClient(context).from("brand_site_catalog_entries")
    .select("id", { count: "exact", head: true }).eq("marca_id", context.brandId);
  if (error) writerEvidenceDatabaseFailure(error);
  return typeof count === "number" ? count : null;
}

/** O registro de publicação do PRÓPRIO artigo (travado ou revisável). */
export async function readWriterOwnPublication(context: WriterEvidenceContext, head: WriterEvidenceHead): Promise<Linha | null> {
  const [linha] = await linhas(writerEvidenceClient(context).from("publication_records")
    .select(COLUNAS_DA_PUBLICACAO).eq("marca_id", context.brandId).eq("article_id", head.articleId).limit(1));
  return linha ?? null;
}

/** Uma página dos registros de publicação da Marca, do mais recente. */
export function readWriterBrandPublicationsPage(context: WriterEvidenceContext, offset: number, limit: number): Promise<Pagina> {
  return paginaComContagem(writerEvidenceClient(context).from("publication_records")
    .select(COLUNAS_DA_PUBLICACAO, { count: "exact" }).eq("marca_id", context.brandId)
    .order("updated_at", { ascending: false }).order("id", { ascending: true }).range(offset, offset + limit - 1));
}

export async function countWriterBrandPublications(context: WriterEvidenceContext): Promise<number | null> {
  const { error, count } = await writerEvidenceClient(context).from("publication_records")
    .select("id", { count: "exact", head: true }).eq("marca_id", context.brandId);
  if (error) writerEvidenceDatabaseFailure(error);
  return typeof count === "number" ? count : null;
}

/* ================================ vídeos =================================== */

export type WriterVideoSource = { videoSourceId: string; processingVersion: number | null; displayName: string | null; languageCode: string | null };

export type WriterVideoStatus = WriterVideoSource & {
  situation: "available" | "removed_after_delivery" | "text_version_missing" | "not_selected" | "invalid_reference";
  textHash: string | null;
  textCreatedAt: string | null;
};

/** As fontes de vídeo do dossiê congelado, validadas. */
export function writerVideoSourcesOf(valor: unknown): WriterVideoSource[] {
  if (!Array.isArray(valor)) return [];
  return valor.map(registro).filter((item): item is Linha => Boolean(item)).map(item => ({
    videoSourceId: String(item.videoSourceId ?? ""),
    processingVersion: typeof item.processingVersion === "number" && Number.isInteger(item.processingVersion) ? item.processingVersion : null,
    displayName: texto(item.displayName),
    languageCode: texto(item.languageCode),
  }));
}

/**
 * A SITUAÇÃO DE CADA TRANSCRIÇÃO — sem ler texto. Só conta a transcrição da
 * MESMA versão de texto que sustentou o bundle, e só com vínculo `ACTIVE` ao
 * artigo: vídeo removido por uma pessoa depois do envio não reaparece em
 * silêncio (AGENTS.md §9), e texto reprocessado não substitui o do pacote
 * (invariante 30).
 */
export async function readWriterVideoStatuses(context: WriterEvidenceContext, head: WriterEvidenceHead, fontes: readonly WriterVideoSource[]): Promise<WriterVideoStatus[]> {
  const validos = fontes.filter(fonte => UUID.test(fonte.videoSourceId) && fonte.processingVersion !== null).map(fonte => fonte.videoSourceId.toLowerCase());
  const vinculos = validos.length
    ? await linhas(writerEvidenceClient(context).from("radar_article_video_sources").select("video_source_id,status")
      .eq("brand_id", context.brandId).eq("article_id", head.articleId).in("video_source_id", validos))
    : [];
  const textos = validos.length
    ? await linhas(writerEvidenceClient(context).from("radar_video_source_texts").select("video_source_id,processing_version,content_hash,language_code,created_at")
      .eq("brand_id", context.brandId).eq("content_kind", "ORIGINAL_TRANSCRIPT").in("video_source_id", validos))
    : [];
  return fontes.map(fonte => {
    const id = fonte.videoSourceId.toLowerCase();
    if (!UUID.test(id) || fonte.processingVersion === null) return { ...fonte, situation: "invalid_reference", textHash: null, textCreatedAt: null };
    const vinculo = vinculos.find(item => String(item.video_source_id).toLowerCase() === id);
    if (!vinculo) return { ...fonte, situation: "not_selected", textHash: null, textCreatedAt: null };
    if (vinculo.status !== "ACTIVE") return { ...fonte, situation: "removed_after_delivery", textHash: null, textCreatedAt: null };
    const textoDaVersao = textos.find(item => String(item.video_source_id).toLowerCase() === id && numero(item.processing_version) === fonte.processingVersion);
    if (!textoDaVersao) return { ...fonte, situation: "text_version_missing", textHash: null, textCreatedAt: null };
    return { ...fonte, situation: "available", textHash: texto(textoDaVersao.content_hash), textCreatedAt: texto(textoDaVersao.created_at) };
  });
}

/* ========================= especialista posterior ========================= */

/**
 * SÓ A CONTAGEM (adendo D7). Contribuições recebidas para as pautas do
 * artigo depois do congelamento. O conteúdo não é lido: entregá-lo abriria
 * um segundo canal Radar → Redator (invariante 51). Reenvio é pelo Radar.
 */
export async function countWriterPosteriorSpecialist(context: WriterEvidenceContext, head: WriterEvidenceHead, depoisDe: string | null): Promise<number | null> {
  if (!depoisDe) return null;
  const pautas = await linhas(writerEvidenceClient(context).from("expert_briefs").select("id")
    .eq("brand_id", context.brandId).eq("article_id", head.articleId));
  const ids = pautas.map(pauta => String(pauta.id)).filter(id => UUID.test(id));
  if (!ids.length) return 0;
  const { error, count } = await writerEvidenceClient(context).from("expert_contributions")
    .select("id", { count: "exact", head: true }).eq("brand_id", context.brandId).in("brief_id", ids).gt("received_at", depoisDe);
  if (error) writerEvidenceDatabaseFailure(error);
  return typeof count === "number" ? count : null;
}

/* ============================== contexto da Marca ========================= */

export type WriterBrandContextVersions = {
  brandDna: WriterArtifactVersionMeta | null;
  skills: Array<WriterArtifactVersionMeta & { lifecycle: string }>;
  /** O teto de versões lidas foi atingido: o que ficou além dele não foi visto, e o manifesto declara. */
  truncated: { brandDna: boolean; skills: boolean };
};

/** Teto de versões lidas por tipo (só metadados, ~0,2 kB cada). Passar dele é declarado, nunca cortado em silêncio. */
export const WRITER_BRAND_CONTEXT_MAX_VERSIONS = 100;

/** Estados técnicos que o dono projeta como `archived` (`uiStatus` em lib/server/brand-skills.ts). */
const SKILL_ARQUIVADA = new Set(["rejected", "superseded"]);

async function ultimoEventoDe(context: WriterEvidenceContext, ids: readonly string[]): Promise<Map<string, string>> {
  const ultimo = new Map<string, string>();
  if (!ids.length) return ultimo;
  const eventos = await linhas(writerEvidenceClient(context).from("editorial_version_status_events")
    .select("version_id,status,occurred_at").in("version_id", [...ids]).order("occurred_at", { ascending: true }));
  for (const evento of eventos) if (typeof evento.version_id === "string" && typeof evento.status === "string") ultimo.set(evento.version_id, evento.status);
  return ultimo;
}

/**
 * O CONTEXTO DA MARCA NA VERSÃO VIGENTE, "não fixada no documento" (adendo
 * D6), pela regra de cada dono. Só metadados; o conteúdo vem na fatia.
 *
 *   - BrandDNA: a versão aprovada pelos eventos de status, na ordem de
 *     versão (`effectiveBrandDnaVersionId`, lib/marca/domain.ts).
 *   - Skills: PRIMEIRO a maior versão de cada definição, DEPOIS o filtro de
 *     arquivada (`selectAvailableSkills`, lib/marca/brand-skill-domain.ts).
 *     Se a v2 foi recusada, a Skill não é oferecida — a v1 não volta a ser a
 *     voz da Marca.
 *
 * Uma consulta por tipo, cada uma com teto próprio: BrandDNA e Skills não
 * disputam o mesmo corte. Atingido o teto, `truncated` diz, e o manifesto
 * declara a ausência.
 *
 * Medido em 2026-09-23: nenhuma linha `brand_dna` no remoto; uma `brand_skill`
 * de 44,5 kB — é ela o "BrandDNA de 44 kB" da SDD.
 */
export async function readWriterBrandContextVersions(context: WriterEvidenceContext): Promise<WriterBrandContextVersions> {
  const cliente = writerEvidenceClient(context);
  const teto = WRITER_BRAND_CONTEXT_MAX_VERSIONS;
  const [dnasLidas, skillsLidas] = await Promise.all([
    linhas(cliente.from("editorial_artifact_versions").select(METADADOS_DE_VERSAO)
      .eq("marca_id", context.brandId).eq("artifact_type", "brand_dna")
      .order("version_number", { ascending: false }).limit(teto + 1)),
    linhas(cliente.from("editorial_artifact_versions").select(METADADOS_DE_VERSAO)
      .eq("marca_id", context.brandId).eq("artifact_type", "brand_skill")
      .order("entity_id", { ascending: true }).order("version_number", { ascending: false }).limit(teto + 1)),
  ]);
  const metasDe = (lidas: Linha[], tipo: string) => lidas.slice(0, teto).map(metaDeVersao)
    .filter((meta): meta is WriterArtifactVersionMeta => Boolean(meta) && meta!.artifactType === tipo);

  const dnas = metasDe(dnasLidas, "brand_dna").sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0));
  const eventosDoDna = await ultimoEventoDe(context, dnas.map(meta => meta.versionId));
  const aprovado = effectiveBrandDnaVersionId(dnas.map(meta => meta.versionId), [...eventosDoDna].map(([versionId, status]) => ({ versionId, status })));
  const brandDna = dnas.find(meta => meta.versionId === aprovado) ?? null;

  const maiorPorDefinicao = new Map<string, WriterArtifactVersionMeta>();
  for (const meta of metasDe(skillsLidas, "brand_skill")) {
    const atual = maiorPorDefinicao.get(meta.entityId);
    if (!atual || (meta.versionNumber ?? 0) > (atual.versionNumber ?? 0)) maiorPorDefinicao.set(meta.entityId, meta);
  }
  const correntes = [...maiorPorDefinicao.values()];
  const eventosDasSkills = await ultimoEventoDe(context, correntes.map(meta => meta.versionId));
  const skills = correntes
    .map(meta => ({ ...meta, lifecycle: eventosDasSkills.get(meta.versionId) ?? meta.status ?? "draft" }))
    .filter(meta => !SKILL_ARQUIVADA.has(meta.lifecycle))
    .sort((a, b) => a.entityId.localeCompare(b.entityId));
  return { brandDna, skills, truncated: { brandDna: dnasLidas.length > teto, skills: skillsLidas.length > teto } };
}

/* ================ artigo-modelo aprovado e voz da marca (2026-10-02) ================ */

/*
 * SDD docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md, Adendos A
 * (D5: "só o aprovado vai ao CSV e ao Redator") e C (voz da marca). Os dois são
 * lidos AO VIVO, por Marca e artigo, como `dna.brand/current`: nada disso é
 * gravado no documento — gravar mudaria o hash e a idempotência do envio, e o
 * MCP não reescreve `importedContext`. Tabela do Radar e Skill da Marca são só
 * LIDAS; a projeção compacta é do catálogo puro (`writer-evidence-catalog.ts`).
 */

const MIGRATION_DO_ARTIGO_MODELO = "20261002120000_radar_artigo_modelo_e_uso_de_videos";

/** O artigo e o pacote congelado do documento: é a eles que o artigo-modelo se prende. */
export type WriterBlueprintTarget = { articleId: string; bundleHash: string | null };

export type WriterApprovedBlueprintMeta = { id: string; versionNumber: number | null; bundleHash: string; approvedAt: string | null };

export type WriterApprovedBlueprintRead =
  | { kind: "approved"; meta: WriterApprovedBlueprintMeta; content: { blueprint: unknown; plan: unknown; linkCandidates: unknown; brandVoice: unknown } | null }
  | { kind: "no_bundle" | "none" | "other_bundle" | "table_missing" | "read_failed"; reason: string };

const COLUNAS_DO_ARTIGO_MODELO = "id,article_id,bundle_hash,version_number,approved_at";
/**
 * Só os caminhos que a projeção usa (planta, medidas do plano, candidatos a
 * link e a versão da voz). `evidence` e `sources`, a maior parte do payload,
 * ficam para a fatia `radar.blueprint/<id>`. Nunca `payload` nu.
 */
const CAMINHOS_DO_ARTIGO_MODELO = "bp:payload->blueprint,pl:payload->measures->plan,lc:payload->linkCandidates,bv:payload->brandVoice";

type ErroDoBanco = { code?: string; message?: string } | null;

/**
 * Tabela ausente é ausência declarada (migration pendente), nunca 500. Outra
 * falha: na leitura estrita (a fatia pedida), o padrão do repositório; nos
 * fundamentos, no manifesto e na semeadura, a planta é contexto, não condição
 * — a ausência é declarada com o código e a escrita segue.
 */
function falhaDoArtigoModelo(error: ErroDoBanco, estrito: boolean): WriterApprovedBlueprintRead | null {
  if (!error) return null;
  if (writerEvidenceTableMissing(error)) {
    return { kind: "table_missing", reason: `a tabela do artigo-modelo ainda não existe (migration ${MIGRATION_DO_ARTIGO_MODELO} pendente)` };
  }
  if (estrito) writerEvidenceDatabaseFailure(error);
  console.warn("[writer-evidence] artigo_modelo_nao_lido", { code: error.code ?? null });
  return { kind: "read_failed", reason: `a leitura do artigo-modelo falhou agora (${error.code || "sem código"}); tente de novo` };
}

const linhasDaResposta = (data: unknown): Linha[] => (Array.isArray(data) ? data as Linha[] : data ? [data as Linha] : []);

/**
 * O ARTIGO-MODELO APROVADO DO PACOTE ENTREGUE.
 *
 * Primeiro o aprovado do MESMO `bundleHash` do documento (o mais novo, se o
 * dono aprovou mais de um). Sem ele, uma consulta só de metadados diz se há
 * aprovado de OUTRO congelamento — que não vale para este documento e não é
 * servido como se valesse (invariante 30): o caminho é aprovar sobre o pacote
 * entregue ou o Radar reenviar o pacote atual.
 */
export async function readWriterApprovedArticleBlueprint(
  context: WriterEvidenceContext,
  alvo: WriterBlueprintTarget,
  opcoes: { content: boolean; strict?: boolean },
): Promise<WriterApprovedBlueprintRead> {
  if (!alvo.bundleHash) return { kind: "no_bundle", reason: "documento sem dossiê do Radar: o artigo-modelo se prende ao pacote congelado" };
  const cliente = writerEvidenceClient(context);
  const estrito = opcoes.strict === true;
  const doPacote = await cliente.from("radar_article_blueprints")
    .select(opcoes.content ? `${COLUNAS_DO_ARTIGO_MODELO},${CAMINHOS_DO_ARTIGO_MODELO}` : COLUNAS_DO_ARTIGO_MODELO)
    .eq("brand_id", context.brandId).eq("article_id", alvo.articleId).eq("bundle_hash", alvo.bundleHash).eq("state", "APPROVED")
    .order("version_number", { ascending: false }).limit(1);
  const falhou = falhaDoArtigoModelo(doPacote.error, estrito);
  if (falhou) return falhou;
  const [linha] = linhasDaResposta(doPacote.data);
  if (linha && typeof linha.id === "string" && linha.article_id === alvo.articleId && linha.bundle_hash === alvo.bundleHash) {
    return {
      kind: "approved",
      meta: { id: linha.id, versionNumber: numero(linha.version_number), bundleHash: alvo.bundleHash, approvedAt: texto(linha.approved_at) },
      content: opcoes.content ? { blueprint: linha.bp, plan: linha.pl, linkCandidates: linha.lc, brandVoice: linha.bv } : null,
    };
  }
  const deOutroPacote = await cliente.from("radar_article_blueprints").select(COLUNAS_DO_ARTIGO_MODELO)
    .eq("brand_id", context.brandId).eq("article_id", alvo.articleId).eq("state", "APPROVED")
    .order("version_number", { ascending: false }).limit(1);
  const falhouDeNovo = falhaDoArtigoModelo(deOutroPacote.error, estrito);
  if (falhouDeNovo) return falhouDeNovo;
  const [outra] = linhasDaResposta(deOutroPacote.data);
  if (outra && outra.article_id === alvo.articleId) {
    return {
      kind: "other_bundle",
      reason: `o artigo-modelo aprovado (v${numero(outra.version_number) ?? "?"}) é de outro congelamento da investigação e não vale para este documento: aprove no Radar um artigo-modelo sobre o pacote entregue, ou o Radar reenvia o pacote atual ao Redator`,
    };
  }
  return { kind: "none", reason: "nenhum artigo-modelo aprovado para este pacote: a estrutura fica por conta de quem escreve" };
}

/** As chaves do payload do artigo-modelo que a fatia serve, cada uma por caminho. */
export const WRITER_BLUEPRINT_PAYLOAD_KEYS = Object.freeze(["schemaVersion", "blueprint", "measures", "linkCandidates", "sources", "evidence", "brandVoice"] as const);

/**
 * O CONTEÚDO DO APROVADO, para a fatia: só a chave de topo pedida (ou todas,
 * cada uma por caminho), com Marca, artigo, pacote, estado e id na consulta.
 */
export async function readWriterArticleBlueprintContent(
  context: WriterEvidenceContext,
  alvo: { articleId: string; bundleHash: string },
  blueprintId: string,
  topo: string | null,
): Promise<Linha> {
  const conhecidas: readonly string[] = WRITER_BLUEPRINT_PAYLOAD_KEYS;
  const chaves = topo ? (conhecidas.includes(topo) ? [topo] : []) : [...conhecidas];
  const select = ["id", "bundle_hash", ...chaves.map(chave => `k_${chave}:payload->${chave}`)].join(",");
  const [linha] = await linhas(writerEvidenceClient(context).from("radar_article_blueprints").select(select)
    .eq("brand_id", context.brandId).eq("article_id", alvo.articleId).eq("bundle_hash", alvo.bundleHash)
    .eq("state", "APPROVED").eq("id", blueprintId).limit(1));
  if (!linha || linha.bundle_hash !== alvo.bundleHash) {
    throw new WriterEvidenceError("source_absent", "O artigo-modelo aprovado não existe mais para o pacote entregue.");
  }
  return Object.fromEntries(chaves.map(chave => [chave, linha[`k_${chave}`]] as const).filter(([, valor]) => valor !== null && valor !== undefined));
}

export type WriterBrandVoiceRead =
  | {
    kind: "current";
    meta: WriterArtifactVersionMeta;
    /** Estado técnico pelo último evento (`approved`, `proposed`, `draft`). */
    lifecycle: string;
    name: string | null;
    title: string | null;
    sections: Array<{ heading: string; body: string }>;
  }
  | { kind: "none" | "read_failed"; reason: string };

const SecoesDaSkillSchema = z.array(NormalizedSkillSectionSchema);

/**
 * A VOZ DA MARCA CORRENTE: a Skill `brand_voice`, pela MESMA regra de
 * `readWriterBrandContextVersions` restrita a uma definição — primeiro a maior
 * versão, depois o filtro de arquivada pelo último evento. Rascunho e
 * aguardando aprovação valem (spec da Marca §24), com o estado dito; se a mais
 * nova foi recusada, a anterior não volta a ser a voz.
 *
 * Uma consulta, por caminho: nome, título e as seções normalizadas. O Markdown
 * original (que repete as seções) e os diagnósticos não saem do banco. Com
 * `content: false`, só os metadados (para conferir alcance de uma chave).
 */
export async function readWriterBrandVoice(
  context: WriterEvidenceContext,
  opcoes: { content: boolean; strict?: boolean } = { content: true },
): Promise<WriterBrandVoiceRead> {
  const entityId = writerBrandVoiceEntityId(context.brandId);
  try {
    const select = opcoes.content
      ? `${METADADOS_DE_VERSAO},b:payload->brandId,k:payload->definitionKey,n:payload->name,t:payload->normalizedContent->title,s:payload->normalizedContent->sections`
      : METADADOS_DE_VERSAO;
    const [linha] = await linhas(writerEvidenceClient(context).from("editorial_artifact_versions").select(select)
      .eq("marca_id", context.brandId).eq("artifact_type", "brand_skill").eq("entity_id", entityId)
      .order("version_number", { ascending: false }).limit(1));
    const meta = linha ? metaDeVersao(linha) : null;
    if (!linha || !meta || meta.artifactType !== "brand_skill" || meta.entityId !== entityId) {
      return { kind: "none", reason: "nenhuma Skill de voz (brand_voice) na Marca: voz, tom e CTA ficam por conta de quem escreve" };
    }
    const lifecycle = (await ultimoEventoDe(context, [meta.versionId])).get(meta.versionId) ?? meta.status ?? "draft";
    if (SKILL_ARQUIVADA.has(lifecycle)) {
      return { kind: "none", reason: "a versão mais nova da Skill de voz foi recusada ou substituída na Marca: a anterior não volta a ser a voz" };
    }
    if (!opcoes.content) return { kind: "current", meta, lifecycle, name: null, title: null, sections: [] };
    const secoes = SecoesDaSkillSchema.safeParse(linha.s);
    if (linha.b !== context.brandId || linha.k !== WRITER_BRAND_VOICE_DEFINITION_KEY || !secoes.success) {
      return { kind: "read_failed", reason: "a Skill de voz corrente está fora do contrato da Marca" };
    }
    return {
      kind: "current", meta, lifecycle, name: texto(linha.n), title: texto(linha.t),
      sections: secoes.data.map(secao => ({ heading: secao.heading, body: secao.body })),
    };
  } catch (erro) {
    if (opcoes.strict) throw erro;
    console.warn("[writer-evidence] voz_da_marca_nao_lida", { code: erro instanceof WriterEvidenceError ? erro.code : erro instanceof Error ? erro.name : null });
    return { kind: "read_failed", reason: "a leitura da Skill de voz falhou agora; tente de novo" };
  }
}

/* ============================ utilitários de ref =========================== */

export const writerKeywordRefOf = (head: WriterEvidenceHead, keywordId: string | null): VersionReference | null =>
  keywordId ? head.refs.keywordDnaRefs.find(referencia => referencia.entityId === keywordId) ?? null : null;
