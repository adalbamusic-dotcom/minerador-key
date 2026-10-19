import { pruneRadarAnalysisHistory } from "@/lib/radar/analysis-history-pruning";
import { hasInlineAnalysisRun, mergeAnalysisRun, splitAnalysisRun } from "@/lib/radar/analysis-run-storage";
import { radarGoogleResearchIsFinalized } from "@/lib/radar/google-research-write-lock";
import { compactRadarResearchForRead } from "@/lib/radar/research-read-model";
import "server-only";
import type { ArticleDNA, ContentDocument, RadarDocumentOrigin, SiloDNA, VersionEnvelope, VersionStatusEvent } from "../arquiteto/contracts";
import { VersionedArticleDNASchema, VersionedSiloDNASchema, VersionStatusEventSchema, ContentDocumentSchema, RadarDocumentOriginSchema } from "../arquiteto/contracts";
import type { BrandInvitation, OperationalPublication, RadarItem } from "../editorial/operational-flow";
import { BrandInvitationSchema, CollaboratorRoleSchema, OperationalPublicationSchema, PermissionModuleSchema, RADAR_WITHDRAWN_STATE, RadarItemSchema } from "../editorial/operational-flow";
import type { SavedGridView } from "../editorial/data-grid";
import { SavedGridViewSchema } from "../editorial/data-grid";
import { firstIssueMessage, rejectedPaths, type IncompatibleRecord } from "../editorial/partial-read.ts";
import { lightArtifactSelection } from "../editorial/workspace-read-scope.ts";
import { completeWithStoredBundle, CONTENT_DOCUMENT_LISTING_SELECT, listedContentDocumentFromListingPayload, listedContentDocumentFromRow, type PartialContentDocument } from "../editorial/content-document-listing.ts";
import { getOperationalClient, mapPersistenceError, OptimisticLockError } from "./editorial-db";
import { contentHash } from "../arquiteto/versioning";
import type { SerpCollectionRecord, SerpReviewRecord } from "../editorial/contracts";
import { PersistenceUnavailableError } from "./editorial-db";
import type { RadarAnalysisVersion } from "../radar/analysis-contracts";
import {
  buildSerpReviewPersistenceRow,
  buildSerpSnapshotPersistenceRow,
  canonicalUuidOrNull,
  markStoredSerpSnapshotAsRemote,
  parseStoredSerpReviewPayload,
  parseStoredSerpSnapshotPayload,
  type SerpReviewPersistenceRow,
  type SerpSnapshotPersistenceRow,
} from "./serp-persistence-adapter";

const client = () => getOperationalClient();

/*
 * 2026-10-12 · F2 DOS GRUPOS — LEITURA POR RECORTE.
 *
 * As listagens da mesa aceitam um recorte opcional (os artigos de um grupo,
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §8).
 * Sem recorte, a consulta é a mesma de sempre, byte a byte. Com recorte, o
 * `.in()` vai em blocos de 100 (a URL do PostgREST tem limite) e recorte vazio
 * não consulta nada.
 */
const BLOCO_DO_RECORTE = 100;
async function lerEmBlocos(ids: readonly string[], ler: (bloco: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: unknown[] | null; error: unknown }> {
  const unicos = [...new Set(ids)];
  const data: unknown[] = [];
  for (let indice = 0; indice < unicos.length; indice += BLOCO_DO_RECORTE) {
    const resposta = await ler(unicos.slice(indice, indice + BLOCO_DO_RECORTE));
    if (resposta.error) return { data: null, error: resposta.error };
    data.push(...(Array.isArray(resposta.data) ? resposta.data : []));
  }
  return { data, error: null };
}
const unwrap = <T>(data: T | null, error: unknown) => { if (error) mapPersistenceError(error); return data; };
const isoDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

type RemoteArtifactRow = {
  artifact_type: string;
  payload: unknown;
  version_id: string;
  entity_id: string;
  version_number: number;
  previous_version_id: string | null;
  content_hash: string;
  origin: string;
  change_reason: string;
  created_by: string;
  created_at: string;
};

function versionPayload<T>(row: RemoteArtifactRow, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }) {
  const storedEnvelope = schema.safeParse(row.payload);
  if (storedEnvelope.success) return storedEnvelope.data;
  return {
    versionId: row.version_id,
    entityId: row.entity_id,
    versionNumber: row.version_number,
    previousVersionId: row.previous_version_id,
    contentHash: row.content_hash,
    origin: row.origin,
    changeReason: row.change_reason,
    createdAt: isoDate(row.created_at),
    createdBy: row.created_by,
    payload: row.payload,
  } as T;
}

export class ArtifactRepository {
  async save<T>(marcaId: string, type: "article_dna" | "silo_dna", version: VersionEnvelope<T>, status: VersionStatusEvent["status"], actorId: string) {
    const row = { version_id: version.versionId, entity_id: version.entityId, marca_id: marcaId, artifact_type: type, version_number: version.versionNumber,
      previous_version_id: version.previousVersionId, content_hash: version.contentHash, origin: version.origin, change_reason: version.changeReason,
      status, payload: version, created_by: actorId, created_at: version.createdAt };
    const { error } = await client().from("editorial_artifact_versions").upsert(row, { onConflict: "version_id", ignoreDuplicates: true });
    if (error) mapPersistenceError(error);
  }

  async appendEvents(marcaId: string, events: VersionStatusEvent[], actorId: string) {
    if (!events.length) return;
    const rows = events.map(event => ({ id: event.eventId, version_id: event.versionId, status: event.status, reason: event.reason, actor_id: actorId, occurred_at: event.occurredAt }));
    const { error } = await client().from("editorial_version_status_events").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) mapPersistenceError(error);
    void marcaId;
  }

  async list(marcaId: string) {
    return this.listScoped(marcaId, null);
  }

  /** F2 · `entityIds` = só estes artefatos (leitura por grupo); `null` = a marca inteira, a leitura de sempre. */
  async listScoped(marcaId: string, entityIds: readonly string[] | null) {
    const consulta = () => client().from("editorial_artifact_versions").select("artifact_type,payload,version_id,entity_id,version_number,previous_version_id,content_hash,origin,change_reason,created_by,created_at").eq("marca_id", marcaId).in("artifact_type", ["article_dna", "silo_dna"]);
    const { data, error } = entityIds ? await lerEmBlocos(entityIds, ids => consulta().in("entity_id", ids)) : await consulta();
    unwrap(data, error);
    const { articles, silos, incompatible } = parseArtifactRows((data || []) as RemoteArtifactRow[]);
    const versionIds = [...articles, ...silos].map(version => version.versionId);
    if (!versionIds.length) return { articles, silos, events: [] as VersionStatusEvent[], incompatible };
    const lidos = await readVersionEvents(versionIds);
    return { articles, silos, events: lidos.events, incompatible: [...incompatible, ...lidos.incompatible] };
  }

  /**
   * 2026-10-14 · SDD listas leves (item 4, F2) — A MESA LEVE, RECORTADA NO BANCO.
   *
   * `detail=light` podava no Node DEPOIS de ler todas as versões (7,2 MB de
   * ArticleDNA da AdalbaPro saíam da Supabase para ficar 2,1 MB). Aqui o corte
   * acontece antes do download: (1) só os metadados de todas as versões (sem
   * `payload`, mais a chave do artefato por caminho JSON) e os eventos delas;
   * (2) a MESMA escolha de sempre (`lightArtifactSelection`: vigente, última
   * aprovada e as referenciadas); (3) o `payload` só das escolhidas, pelo
   * `version_id`. O resultado é o mesmo da poda no Node: se uma escolhida não
   * passar no contrato, o artefato dela é relido inteiro e escolhido do jeito
   * antigo (nunca some um artefato que a leitura inteira mostraria).
   */
  async listLight(marcaId: string, entityIds: readonly string[] | null, keepVersionIds: ReadonlySet<string>) {
    const metaSelect = "artifact_type,version_id,entity_id,version_number,a1:payload->>articleId,a2:payload->payload->>articleId,s1:payload->>siloId,s2:payload->payload->>siloId";
    const consultaMeta = () => client().from("editorial_artifact_versions").select(metaSelect).eq("marca_id", marcaId).in("artifact_type", ["article_dna", "silo_dna"]);
    const { data: metaData, error: metaError } = entityIds ? await lerEmBlocos(entityIds, ids => consultaMeta().in("entity_id", ids)) : await consultaMeta();
    unwrap(metaData, metaError);
    const metas = ((metaData || []) as LightArtifactMetaRow[]).map(lightMetaOf).filter((meta): meta is LightArtifactMeta => Boolean(meta));
    if (!metas.length) return { articles: [] as VersionEnvelope<ArticleDNA>[], silos: [] as VersionEnvelope<SiloDNA>[], events: [] as VersionStatusEvent[], incompatible: [] as IncompatibleRecord[], versionsRead: 0, versionsListed: 0 };
    const eventosLidos = await readVersionEvents(metas.map(meta => meta.versionId));
    const escolha = lightArtifactSelection({
      articles: metas.filter(meta => meta.type === "article_dna"),
      silos: metas.filter(meta => meta.type === "silo_dna"),
      events: eventosLidos.events,
      articleOf: meta => ({ versionId: meta.versionId, versionNumber: meta.versionNumber, entityKey: meta.entityKey }),
      siloOf: meta => ({ versionId: meta.versionId, versionNumber: meta.versionNumber, entityKey: meta.entityKey }),
      keepVersionIds,
    });
    const escolhidas = [...escolha.articles, ...escolha.silos];
    const consultaCheia = () => client().from("editorial_artifact_versions").select("artifact_type,payload,version_id,entity_id,version_number,previous_version_id,content_hash,origin,change_reason,created_by,created_at").eq("marca_id", marcaId).in("artifact_type", ["article_dna", "silo_dna"]);
    const { data, error } = await lerEmBlocos(escolhidas.map(meta => meta.versionId), ids => consultaCheia().in("version_id", ids));
    unwrap(data, error);
    const lidas = parseArtifactRows((data || []) as RemoteArtifactRow[]);
    let articles = lidas.articles; let silos = lidas.silos;
    const incompatible = [...lidas.incompatible];
    let versionsRead = escolhidas.length;
    /*
     * Uma escolhida que não passou no contrato: a leitura inteira teria
     * escolhido a próxima versão válida daquele artefato. O artefato é relido
     * inteiro (só ele) e escolhido pela regra antiga.
     */
    const recusadas = new Set(lidas.incompatible.map(registro => registro.id));
    const entidadesComFalha = [...new Set(escolhidas.filter(meta => recusadas.has(meta.versionId)).map(meta => meta.entityId))];
    if (entidadesComFalha.length) {
      const inteiro = await this.listScoped(marcaId, entidadesComFalha);
      versionsRead += metas.filter(meta => entidadesComFalha.includes(meta.entityId)).length;
      const chavesComFalha = new Set(escolhidas.filter(meta => entidadesComFalha.includes(meta.entityId)).map(meta => meta.entityKey));
      const refeita = lightArtifactSelection({
        articles: inteiro.articles,
        silos: inteiro.silos,
        events: inteiro.events,
        articleOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.articleId }),
        siloOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.siloId }),
        keepVersionIds,
      });
      articles = [...articles.filter(version => !chavesComFalha.has(version.payload.articleId)), ...refeita.articles];
      silos = [...silos.filter(version => !chavesComFalha.has(version.payload.siloId)), ...refeita.silos];
      for (const registro of inteiro.incompatible) if (!incompatible.some(atual => atual.id === registro.id && atual.kind === registro.kind)) incompatible.push(registro);
    }
    const mantidas = new Set([...articles, ...silos].map(version => version.versionId));
    return {
      articles,
      silos,
      events: eventosLidos.events.filter(event => mantidas.has(event.versionId)),
      incompatible: [...incompatible, ...eventosLidos.incompatible],
      versionsRead,
      versionsListed: metas.length,
    };
  }
}

type LightArtifactMetaRow = { artifact_type?: unknown; version_id?: unknown; entity_id?: unknown; version_number?: unknown; a1?: unknown; a2?: unknown; s1?: unknown; s2?: unknown };
type LightArtifactMeta = { type: "article_dna" | "silo_dna"; versionId: string; entityId: string; versionNumber: number; entityKey: string };

/**
 * A chave do artefato como a leitura inteira a calcula (`payload.articleId`
 * depois de `versionPayload`): o payload gravado é o ArticleDNA cru (chave em
 * `payload.articleId`) ou o envelope antigo (chave em `payload.payload.articleId`).
 */
function lightMetaOf(row: LightArtifactMetaRow): LightArtifactMeta | null {
  const type = row.artifact_type === "article_dna" || row.artifact_type === "silo_dna" ? row.artifact_type : null;
  if (!type) return null;
  const texto = (valor: unknown) => (typeof valor === "string" && valor ? valor : null);
  const versionId = texto(row.version_id);
  const entityId = texto(row.entity_id);
  if (!versionId || !entityId) return null;
  const entityKey = type === "article_dna" ? texto(row.a2) ?? texto(row.a1) : texto(row.s2) ?? texto(row.s1);
  return { type, versionId, entityId, versionNumber: Number(row.version_number), entityKey: entityKey ?? entityId };
}

/** O laço de sempre: cada linha vira envelope ou fica registrada como incompatível. */
function parseArtifactRows(rows: readonly RemoteArtifactRow[]) {
  const articles: VersionEnvelope<ArticleDNA>[] = []; const silos: VersionEnvelope<SiloDNA>[] = [];
  const incompatible: IncompatibleRecord[] = [];
  for (const row of rows) {
    /*
     * Mesmo isolamento. A reconstrução do envelope (`versionPayload`) entra
     * na proteção: ela já tolera payload legado, mas o schema final ainda
     * podia lançar e derrubar todos os artefatos da marca.
     */
    const artefato = row.artifact_type === "article_dna" ? { schema: VersionedArticleDNASchema, destino: articles }
      : row.artifact_type === "silo_dna" ? { schema: VersionedSiloDNASchema, destino: silos }
      : null;
    if (!artefato) continue;
    const parsedArtifact = artefato.schema.safeParse(versionPayload(row, artefato.schema as never));
    if (!parsedArtifact.success) {
      incompatible.push({
        kind: "artifact_version",
        id: String(row.version_id),
        articleId: row.entity_id ? String(row.entity_id) : null,
        stage: String(row.artifact_type),
        paths: rejectedPaths(parsedArtifact.error.issues),
        message: firstIssueMessage(parsedArtifact.error.issues, "O artefato não corresponde ao contrato vigente."),
      });
      continue;
    }
    (artefato.destino as unknown[]).push(parsedArtifact.data);
  }
  return { articles, silos, incompatible };
}

/** Os eventos de status das versões pedidas, na ordem de `occurred_at` (a mesma consulta de sempre). */
async function readVersionEvents(versionIds: readonly string[]) {
  const incompatible: IncompatibleRecord[] = [];
  const events: VersionStatusEvent[] = [];
  if (!versionIds.length) return { events, incompatible };
  const { data: eventRows, error: eventError } = await client().from("editorial_version_status_events").select("id,version_id,status,reason,actor_id,occurred_at").in("version_id", [...versionIds]).order("occurred_at");
  unwrap(eventRows, eventError);
  // Evento inválido não pode derrubar os artefatos que já foram lidos.
  for (const row of eventRows || []) {
    const parsedEvent = VersionStatusEventSchema.safeParse({ eventId: row.id, versionId: row.version_id, status: row.status, reason: row.reason, actorId: row.actor_id, occurredAt: isoDate(row.occurred_at) });
    if (!parsedEvent.success) {
      incompatible.push({
        kind: "version_status_event",
        id: String(row.id),
        articleId: row.version_id ? String(row.version_id) : null,
        stage: null,
        paths: rejectedPaths(parsedEvent.error.issues),
        message: firstIssueMessage(parsedEvent.error.issues, "O evento de status não corresponde ao contrato vigente."),
      });
      continue;
    }
    events.push(parsedEvent.data);
  }
  return { events, incompatible };
}

/* O estágio `planner` saiu com o Planejador (M1 em 2026-09-18; aposentadoria em 2026-10-01). */
type WorkflowStage = "radar";

const WORKFLOW_TABELA = "editorial_workflow_items";
const WORKFLOW_VIEW_LISTAGEM = "editorial_workflow_items_listagem";

/**
 * De onde a LISTAGEM le: a view sem as corridas historicas.
 *
 * O recuo para a tabela existe porque codigo e banco nao sobem juntos aqui —
 * as migrations sao aplicadas a mao. Sem ele, publicar antes de aplicar a
 * migration deixaria o workspace editorial inteiro sem leitura. E definitivo
 * na vida do processo: uma vez que a view falte, nao se insiste a cada carga.
 */
/*
 * 2026-10-11 · A LISTAGEM LÊ A TABELA. Medido em produção (marca adalbapro, 9
 * itens do Radar): a view devolvia os MESMOS bytes da tabela (4,4 MB nos dois) e
 * custava 543 ms de banco contra 48 ms da tabela — a função jsonb por linha não
 * economizava nada e gastava CPU que, junto da listagem dos documentos, levava a
 * seção "workflow" ao statement_timeout. A poda em TypeScript, abaixo, continua
 * sendo a autoridade do que sai. A view fica no banco, sem uso.
 */
let fonteDaListagemWorkflow: string = WORKFLOW_TABELA;
void WORKFLOW_VIEW_LISTAGEM;

/** A função de listagem dos documentos ainda não existe no banco (migration 20261011120000 não aplicada). */
function funcaoDeListagemAusente(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  return code === "PGRST202" || code === "42883" || String(error.message || "").includes("editorial_content_documents_listing");
}

/** A função de gravação do documento do Radar ainda não existe no banco (migration 20261019120000 não aplicada). */
function funcaoDeGravacaoDoDocumentoAusente(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  return code === "PGRST202" || code === "42883" || (/editorial_content_document_create_from_radar/.test(String(error.message || "")) && /could not find|does not exist|schema cache/i.test(String(error.message || "")));
}

function viewDeWorkflowAusente(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  return code === "42P01" || code === "PGRST205" || String(error.message || "").includes(WORKFLOW_VIEW_LISTAGEM);
}

export class WorkflowRepository {
  /** F2 · `scope.articleIds` = só os artigos do recorte (grupo); sem recorte, a leitura de sempre. */
  async list(marcaId: string, scope: { articleIds?: readonly string[] } = {}) {
    /*
     * A CONSULTA E QUE PRECISA CORTAR — nao a poda logo abaixo.
     *
     * Medido em 2026-09-21: 10 MB em 3 linhas de estagio 'radar', 98,7% em
     * `analysisVersions`. A poda e a compactacao que este metodo aplica rodam
     * no SERVIDOR, depois do download: economizavam banda do navegador, nao
     * egresso da Supabase. Os 10 MB ja tinham saido.
     *
     * A view esvazia os quatro campos pesados das versoes historicas com a
     * mesma semantica da poda em TS, e preserva um SUPERCONJUNTO do que ela
     * preservaria — a poda abaixo continua sendo a autoridade e estreita o
     * resultado. Por isso ela permanece rodando: nao e redundancia, e quem
     * decide.
     */
    const consultaDe = (fonte: string) => client()
      .from(fonte)
      .select("id,marca_id,article_id,stage,state,payload,lock_version,created_at,updated_at")
      .eq("marca_id", marcaId)
      // F5 (SDD 2026-10-12 §6.3): só artigos. A linha do guarda (`operation_ledger`) nunca entra na mesa do Radar.
      .eq("subject_type", "article")
      .eq("stage", "radar");
    const lerDe = async (fonte: string) => scope.articleIds
      ? await lerEmBlocos(scope.articleIds, ids => consultaDe(fonte).in("article_id", ids)) as unknown as Awaited<ReturnType<typeof consultaDe>>
      : await consultaDe(fonte);

    let { data, error } = await lerDe(fonteDaListagemWorkflow);
    if (error && fonteDaListagemWorkflow !== WORKFLOW_TABELA && viewDeWorkflowAusente(error)) {
      // Migration ainda nao aplicada: a tela funciona, so sem a economia.
      fonteDaListagemWorkflow = WORKFLOW_TABELA;
      ({ data, error } = await lerDe(WORKFLOW_TABELA));
    }
    unwrap(data, error); const radar: RadarItem[] = []; const incompatible: IncompatibleRecord[] = [];
    for (const row of data || []) {
      // 2026-10-18 · o item retirado da operação (Silo/artigo desmontado) fica como histórico: a mesa do Radar não o lista.
      if (row.state === RADAR_WITHDRAWN_STATE) continue;
      /*
       * safeParse POR LINHA. Antes, `.parse()` dentro do laço derrubava a
       * consulta inteira por causa de um registro em formato anterior — e
       * junto iam os artigos bons da mesma marca.
       *
       * O schema NÃO foi afrouxado: o registro incompatível continua fora da
       * lista de itens. Ele passa a ser NOMEADO em vez de sumir.
       */
      /*
       * O HISTÓRICO ENTRA PODADO — RADAR_LIVE_UX_1 · §14.
       *
       * Medido em produção: 6,0 MB de workspace, 5,98 MB em `analysisVersions`.
       * A poda corta 63% preservando a versão corrente e a última aprovada, que
       * são as únicas cujo conteúdo pesado a tela abre.
       *
       * Aqui, e não na rota, porque é a leitura do repositório que todo mundo
       * usa: podar só num consumidor deixaria os outros carregando 6 MB.
       */
      const bruto = row.payload as Record<string, unknown>;
      const historico = Array.isArray(bruto?.analysisVersions) ? bruto.analysisVersions : null;
      /*
       * ============ RADAR_FINAL_2.1 · §2 · A CÓPIA DE LEITURA ============
       *
       * A poda já tirava a matéria-prima das versões HISTÓRICAS. O que sobrava
       * era a corrida da versão CORRENTE — 129,7 KB numa investigação Amazon —
       * atravessando a rede para alimentar um disclosure fechado.
       *
       * A compactação só alcança investigação CONGELADA: antes do freeze o
       * universo é a superfície de trabalho, e tirá-lo dali quebraria a
       * curadoria para economizar bytes que a pessoa está olhando.
       *
       * Esta é a leitura da LISTAGEM. O readback por artigo continua devolvendo
       * a versão corrente inteira — é dele que toda escrita nasce (§9).
       */
      const podado = historico
        ? pruneRadarAnalysisHistory(historico as Parameters<typeof pruneRadarAnalysisHistory>[0])
        : null;
      const payload = podado
        ? {
          ...bruto,
          analysisVersions: podado.map(versao => ({
            ...versao,
            payload: compactRadarResearchForRead(versao.payload as Record<string, unknown>),
          })),
        }
        : bruto;
      const base = { ...(payload as object), id: row.id, brandId: row.marca_id, articleId: row.article_id, state: row.state, lockVersion: row.lock_version, importedAt: isoDate(row.created_at), updatedAt: isoDate(row.updated_at), origin: "real" };
      const parsed = RadarItemSchema.safeParse(base);
      if (!parsed.success) {
        incompatible.push({
          kind: "workflow_item",
          id: String(row.id),
          articleId: row.article_id ? String(row.article_id) : null,
          stage: String(row.stage),
          paths: rejectedPaths(parsed.error.issues),
          message: firstIssueMessage(parsed.error.issues, "O registro não corresponde ao contrato vigente."),
        });
        continue;
      }
      radar.push(parsed.data as RadarItem);
    }
    return { radar, incompatible };
  }

  /*
   * ===== AS CORRIDAS MORAM FORA DA LINHA =====
   *
   * Os quatro campos pesados de cada versao vivem em `radar_analysis_runs`
   * (20260921080000). A troca acontece AQUI, na fronteira do repositorio: os
   * ~20 modulos que leem `amazonSearch` e companhia recebem a versao inteira,
   * como sempre receberam, e nao sabem da tabela.
   *
   * A reidratacao e de TODAS as versoes, de proposito. E o comportamento de
   * hoje, sem economia nesta rota -- o ganho desta etapa esta na ESCRITA, que
   * deixa de reler e regravar ~8 MB para acrescentar uma versao. Hidratar so
   * a versao pedida e etapa propria, rota a rota, porque exige saber qual e.
   */
  private async corridasDoItem(itemId: string): Promise<Map<string, Record<string, unknown>>> {
    const { data, error } = await client().from("radar_analysis_runs").select("version_id,payload").eq("workflow_item_id", itemId);
    if (error) mapPersistenceError(error);
    return new Map((data || []).map(linha => [String((linha as { version_id: unknown }).version_id), ((linha as { payload: unknown }).payload || {}) as Record<string, unknown>]));
  }

  private async reidratarCorridas<T>(linha: T): Promise<T> {
    const registro = linha && typeof linha === "object" ? linha as Record<string, unknown> : null;
    const payload = registro?.payload && typeof registro.payload === "object" && !Array.isArray(registro.payload)
      ? registro.payload as Record<string, unknown>
      : null;
    const versoes = Array.isArray(payload?.analysisVersions) ? payload.analysisVersions as Record<string, unknown>[] : null;
    if (!registro || !payload || !versoes || versoes.length === 0) return linha;

    const corridas = await this.corridasDoItem(String(registro.id));
    if (corridas.size === 0) return linha;

    return {
      ...registro,
      payload: {
        ...payload,
        analysisVersions: versoes.map(versao => {
          const versionId = typeof versao.versionId === "string" ? versao.versionId : null;
          const corrida = versionId ? corridas.get(versionId) : undefined;
          return corrida ? mergeAnalysisRun(versao, corrida) : versao;
        }),
      },
    } as T;
  }

  /**
   * Guarda as corridas das versoes e devolve as versoes leves.
   *
   * A corrida vai PRIMEIRO. Se a gravacao do payload falhar depois (trava
   * otimista), sobra uma corrida sem versao correspondente -- inofensiva, a
   * fusao so alcanca versao presente, e a cascata a leva junto com o item. A
   * ordem inversa e que seria perda: payload leve gravado sem a corrida ter
   * chegado.
   */
  private async guardarCorridas(input: { itemId: string; marcaId: string; articleId: string | null; versoes: Record<string, unknown>[]; actorId: string }): Promise<Record<string, unknown>[]> {
    const linhas: Array<Record<string, unknown>> = [];
    const leves = input.versoes.map(versao => {
      const versionId = typeof versao.versionId === "string" ? versao.versionId : null;
      if (!versionId || !hasInlineAnalysisRun(versao)) return versao;
      const { light, run, hasRun } = splitAnalysisRun(versao);
      if (!hasRun) return versao;
      linhas.push({ workflow_item_id: input.itemId, version_id: versionId, marca_id: input.marcaId, article_id: input.articleId, payload: run, updated_by: input.actorId, updated_at: new Date().toISOString() });
      return light;
    });
    if (linhas.length === 0) return input.versoes;

    const { error } = await client().from("radar_analysis_runs").upsert(linhas, { onConflict: "workflow_item_id,version_id" });
    if (error) mapPersistenceError(error);
    return leves;
  }

  async find(id: string) {
    const { data, error } = await client().from("editorial_workflow_items").select("*").eq("id", id).maybeSingle();
    return this.reidratarCorridas(unwrap(data, error));
  }

  /** Leitura CRUA, sem reidratar: para quem so precisa acrescentar. */
  private async findByArticleRaw(marcaId: string, articleId: string, stage: WorkflowStage) {
    const { data, error } = await client().from("editorial_workflow_items").select("*").eq("marca_id", marcaId).eq("article_id", articleId).eq("stage", stage).maybeSingle();
    return unwrap(data, error);
  }

  async findByArticle(marcaId: string, articleId: string, stage: WorkflowStage = "radar") {
    return this.reidratarCorridas(await this.findByArticleRaw(marcaId, articleId, stage));
  }

  /*
   * ===== LEITURA SEM AS CORRIDAS — so para quem PROVA que nao as le =====
   *
   * A linha como esta gravada: as versoes vem LEVES, com `extractions: []` e
   * `competitiveReport`, `youtubeSearch` e `amazonSearch` nulos (os campos de
   * ANALYSIS_RUN_FIELDS). O nome diz o que falta de proposito: um consumidor
   * que precisasse de um desses campos leria vazio sem perceber, e vazio aqui
   * nao e "nao coletou", e "nao foi buscado".
   *
   * Existe porque a area Videos le so `finalizedBundle`, que nunca sai da
   * linha, e pagava a reidratacao inteira para descarta-la. Medido em
   * 2026-09-23 no item mais pesado: 0,90 MB da linha mais 7,32 MB de corridas
   * por chamada, para usar ate 3,8 kB de `videoBriefSnapshots`.
   *
   * `findByArticleRaw` continua privado: a escrita (appendRadarAnalysis) o usa
   * verbatim, e este metodo e so um nome publico e honesto para a leitura.
   */
  async findByArticleWithoutRuns(marcaId: string, articleId: string, stage: WorkflowStage = "radar") {
    return this.findByArticleRaw(marcaId, articleId, stage);
  }

  /*
   * ===== REIDRATAR SO AS VERSOES QUE A LEITURA VAI USAR =====
   *
   * `findByArticle` reidrata TODAS as versoes (ver o comentario de
   * `corridasDoItem`). As rotas de leitura do Radar usam uma ou duas e
   * descartavam o resto: medido em 2026-09-23, a montagem do Radar lia
   * ~10,8 MB e a propria rota jogava fora ~7,4 MB na poda do historico.
   *
   * QUEM ESCOLHE AS VERSOES E A ROTA, nao este metodo. As regras de "versao
   * corrente" divergem entre rotas (ultima do array num lugar, maior
   * versionNumber no outro), e um criterio escondido aqui reidrataria uma
   * versao e deixaria a rota devolver outra, vazia, sem erro nenhum.
   *
   * `pick` recebe as versoes LEVES. Isso basta para escolher: versionId,
   * versionNumber e status continuam na parte leve, porque splitAnalysisRun
   * so move os quatro campos de corrida.
   *
   * Sem id escolhido, nao ha consulta a `radar_analysis_runs`. E a fusao e a
   * mesma de `reidratarCorridas` (mergeAnalysisRun por versionId): para as
   * versoes escolhidas o resultado e identico; as demais saem leves.
   *
   * SO PARA LEITURA. A escrita continua em findByArticleRaw/findByArticle.
   */
  async findByArticleHydratingVersions(
    marcaId: string,
    articleId: string,
    stage: WorkflowStage,
    pick: (versoesLeves: ReadonlyArray<Record<string, unknown>>) => Iterable<string | null | undefined>,
  ) {
    const linha = await this.findByArticleRaw(marcaId, articleId, stage);
    const registro = linha && typeof linha === "object" ? linha as Record<string, unknown> : null;
    const payload = registro?.payload && typeof registro.payload === "object" && !Array.isArray(registro.payload)
      ? registro.payload as Record<string, unknown>
      : null;
    const versoes = Array.isArray(payload?.analysisVersions) ? payload.analysisVersions as Record<string, unknown>[] : null;
    if (!registro || !payload || !versoes || versoes.length === 0) return linha;

    /*
     * So entram ids de versoes que a PROPRIA linha tem.
     *
     * O `pick` pode devolver o versionId que veio na requisicao, e ele ia
     * direto para `.in("version_id", ...)`. O postgrest-js so poe aspas em
     * valor com `,`, `(` ou `)` e nunca escapa `"` embutida: um id como
     * `a"b(` virava filtro malformado, o PostgREST recusava com PGRST100 e a
     * rota respondia 500 onde antes respondia 404. Nao vazava entre itens —
     * `workflow_item_id` continua filtrando —, mas era texto do usuario
     * chegando cru a um filtro.
     *
     * Restringir aqui nao muda resultado nenhum: um id que a linha nao tem
     * nunca casaria com corrida, porque a fusao so alcanca versao presente.
     */
    const existentes = new Set(versoes.map(versao => versao.versionId).filter((id): id is string => typeof id === "string"));
    const ids = [...new Set([...pick(versoes)].filter((id): id is string => typeof id === "string" && id.length > 0 && existentes.has(id)))];
    if (ids.length === 0) return linha;

    const { data, error } = await client().from("radar_analysis_runs").select("version_id,payload").eq("workflow_item_id", String(registro.id)).in("version_id", ids);
    if (error) mapPersistenceError(error);
    const corridas = new Map((data || []).map(corrida => [String((corrida as { version_id: unknown }).version_id), ((corrida as { payload: unknown }).payload || {}) as Record<string, unknown>]));
    if (corridas.size === 0) return linha;

    return {
      ...registro,
      payload: {
        ...payload,
        analysisVersions: versoes.map(versao => {
          const versionId = typeof versao.versionId === "string" ? versao.versionId : null;
          const corrida = versionId ? corridas.get(versionId) : undefined;
          return corrida ? mergeAnalysisRun(versao, corrida) : versao;
        }),
      },
    } as typeof linha;
  }

  /*
   * ===== A VERSAO CORRENTE PARA A TRAVA DE ESCRITA — e SO ela =====
   *
   * A gravacao do Radar (POST radar-analysis) consulta a trava da pesquisa
   * Google ANTES de acrescentar. A trava so olha a versao CORRENTE, a ultima
   * do array `analysisVersions`, e a rota lia a linha com `findByArticle`,
   * que reidrata TODAS as corridas. Medido em 2026-09-23 no item mais pesado:
   * 0,90 MB da linha + 7,32 MB de corridas = 8,22 MB por gravacao, dos quais
   * 5,72 MB eram corridas de versoes antigas jogadas fora. Com este metodo:
   * 2,50 MB (linha + corrida da corrente, 1,60 MB) quando a investigacao esta
   * finalizada, 0,90 MB quando nao esta.
   *
   * DEVOLVE A VERSAO, NUNCA A LINHA. Uma linha com uma versao reidratada e as
   * outras leves pareceria completa; quem a regravasse (transition) perderia
   * dado sem erro nenhum. Uma versao solta nao serve de base para isso.
   *
   * A ordem e a da propria trava (google-research-write-lock.ts):
   * 1. le a linha CRUA (o repositorio, nunca o DTO do navegador; nada e
   *    compactado aqui) e pega a ultima versao do array;
   * 2. se a corrente NAO esta finalizada, a trava responde OPEN antes de
   *    comparar qualquer campo competitivo, e a rota so expoe esses campos na
   *    recusa. `finalizedBundle` mora na parte leve (splitAnalysisRun so move
   *    os quatro campos de corrida), entao a decisao sai igual sem buscar
   *    corrida nenhuma. Neste caso a versao volta LEVE: extractions [] e os
   *    outros tres nulos querem dizer "nao foi buscado";
   * 3. finalizada, a trava compara `extractions`, que e campo de corrida: a
   *    corrida DESTA versao e reidratada inteira (mergeAnalysisRun, a mesma
   *    fusao de `reidratarCorridas`), e o resultado e identico ao da versao
   *    que `findByArticle` devolveria.
   *
   * SO PARA A TRAVA. A escrita (appendRadarAnalysis) continua lendo a linha
   * crua por conta propria, e `findByArticle` nao muda.
   */
  async findCurrentRadarAnalysisForWriteLock(marcaId: string, articleId: string): Promise<Record<string, unknown> | null> {
    const linha = await this.findByArticleRaw(marcaId, articleId, "radar");
    const registro = linha && typeof linha === "object" ? linha as Record<string, unknown> : null;
    const payload = registro?.payload && typeof registro.payload === "object" && !Array.isArray(registro.payload)
      ? registro.payload as Record<string, unknown>
      : null;
    const versoes = Array.isArray(payload?.analysisVersions) ? payload.analysisVersions as Record<string, unknown>[] : null;
    if (!registro || !versoes || versoes.length === 0) return null;

    const corrente = versoes[versoes.length - 1];
    if (!corrente || typeof corrente !== "object" || Array.isArray(corrente)) return corrente ?? null;
    if (!radarGoogleResearchIsFinalized(corrente.payload)) return corrente;

    const versionId = typeof corrente.versionId === "string" && corrente.versionId.length > 0 ? corrente.versionId : null;
    if (!versionId) return corrente;

    const { data, error } = await client().from("radar_analysis_runs").select("version_id,payload").eq("workflow_item_id", String(registro.id)).eq("version_id", versionId);
    if (error) mapPersistenceError(error);
    const corrida = (data || []).find(item => String((item as { version_id: unknown }).version_id) === versionId) as { payload?: unknown } | undefined;
    return corrida ? mergeAnalysisRun(corrente, (corrida.payload || {}) as Record<string, unknown>) : corrente;
  }

  async importItem(input: { marcaId: string; articleId: string; stage: WorkflowStage; state: string; sourceEntityId: string; sourceVersionId: string | null; sourceContentHash: string | null; payload: object; actorId: string }) {
    const { data, error } = await client().from("editorial_workflow_items").upsert({ marca_id: input.marcaId, subject_type: "article", subject_id: input.articleId, article_id: input.articleId, stage: input.stage, state: input.state,
      source_entity_id: input.sourceEntityId, source_version_id: input.sourceVersionId, source_content_hash: input.sourceContentHash, payload: input.payload,
      created_by: input.actorId, updated_by: input.actorId }, { onConflict: "marca_id,subject_type,subject_id,stage", ignoreDuplicates: true }).select("*").maybeSingle();
    if (error) mapPersistenceError(error);
    if (data) return data;
    const { data: existing, error: existingError } = await client().from("editorial_workflow_items").select("*").eq("marca_id", input.marcaId).eq("article_id", input.articleId).eq("stage", input.stage).single();
    return unwrap(existing, existingError);
  }

  /**
   * ===== A TRANSIÇÃO QUE NÃO REESCREVE O HISTÓRICO — §5 =====
   *
   * `transition` manda o payload de volta na mesma instrução. Para a linha do
   * Radar isso significa subir ~9,77 MB de `analysisVersions` só para trocar
   * uma palavra na coluna `state` — e foi essa escrita que o Postgres cancelou
   * com 57014.
   *
   * Aqui só o estado viaja. O payload não muda, então não precisa ir: a trava
   * otimista continua sendo a mesma, e o que se grava é o que se quis gravar.
   */
  async transitionState(id: string, expectedLock: number, state: string, actorId: string) {
    const { data, error } = await client().from("editorial_workflow_items").update({ state, updated_by: actorId }).eq("id", id).eq("lock_version", expectedLock).select("id,state,lock_version").maybeSingle();
    if (error) mapPersistenceError(error); if (!data) throw new OptimisticLockError(); return data;
  }

  async transition(id: string, expectedLock: number, state: string, payload: object, actorId: string) {
    /*
     * O payload que chega pode vir REIDRATADO -- veio de `find` ou
     * `findByArticle`, que repoem as corridas. Grava-lo como esta devolveria
     * as corridas para dentro da linha e desfaria a arrumacao em silencio, uma
     * transicao de cada vez.
     */
    const aGravar = await this.desidratarPayload(id, payload, actorId);
    const { data, error } = await client().from("editorial_workflow_items").update({ state, payload: aGravar, updated_by: actorId }).eq("id", id).eq("lock_version", expectedLock).select("*").maybeSingle();
    if (error) mapPersistenceError(error); if (!data) throw new OptimisticLockError(); return data;
  }

  private async desidratarPayload(itemId: string, payload: object, actorId: string): Promise<object> {
    const registro = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    const versoes = Array.isArray(registro?.analysisVersions) ? registro.analysisVersions as Record<string, unknown>[] : null;
    if (!registro || !versoes || !versoes.some(versao => hasInlineAnalysisRun(versao))) return payload;

    // A corrida precisa da marca; sao duas colunas, nao a linha.
    const { data, error } = await client().from("editorial_workflow_items").select("marca_id,article_id").eq("id", itemId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) return payload;

    const leves = await this.guardarCorridas({
      itemId,
      marcaId: String((data as { marca_id: unknown }).marca_id),
      articleId: (data as { article_id: unknown }).article_id === null ? null : String((data as { article_id: unknown }).article_id),
      versoes,
      actorId,
    });
    return { ...registro, analysisVersions: leves };
  }

  async appendRadarAnalysis(marcaId: string, articleId: string, expectedLock: number, analysis: RadarAnalysisVersion, actorId: string) {
    /*
     * Leitura CRUA: acrescentar nao precisa das corridas das versoes antigas.
     *
     * Era aqui que se pagava mais caro. A linha inteira descia (8032 kB na
     * maior), uma versao era acrescentada, e tudo subia de volta -- e crescia
     * a cada rodada. Sem as corridas, desce e sobe o payload leve.
     */
    const current = await this.findByArticleRaw(marcaId, articleId, "radar");
    if (!current) return null;
    if (current.marca_id !== marcaId || current.article_id !== articleId) return null;
    const radar = RadarItemSchema.parse({ ...(current.payload as object), id: current.id, brandId: current.marca_id, articleId: current.article_id, state: current.state, lockVersion: current.lock_version, importedAt: isoDate(current.created_at), updatedAt: isoDate(current.updated_at), origin: "real" });
    if (analysis.payload.brandId !== marcaId || analysis.payload.articleId !== articleId) throw new Error("A análise Radar não corresponde ao artigo ou à marca.");
    const alreadySaved = radar.analysisVersions.some(version => version.versionId === analysis.versionId);
    if (alreadySaved) return current;
    // A corrida da versao nova vai para a tabela; no payload entra a leve.
    const [leve] = await this.guardarCorridas({
      itemId: current.id as string,
      marcaId,
      articleId,
      versoes: [analysis as unknown as Record<string, unknown>],
      actorId,
    });
    const payload = { ...(current.payload as object), analysisVersions: [...radar.analysisVersions, leve] };
    /*
     * A VOLTA NÃO PRECISA DA LINHA INTEIRA.
     *
     * `select("*")` devolvia o payload recém-gravado — nesta linha, 9,77 MB
     * medidos — e quem chama usa apenas `id`, `lock_version` e o `id` de dentro
     * do payload, que já está em `current`. Era uma perna gratuita somada a uma
     * escrita que já ia no limite: a subida leva o payload inteiro porque o
     * PostgREST substitui a coluna, e a descida levava tudo de novo.
     *
     * Isto NÃO resolve o crescimento do payload — só para de pagar duas vezes
     * por ele. O crescimento é decisão de esquema, e está reportado.
     */
    const idNoPayload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) && typeof (current.payload as { id?: unknown }).id === "string"
      ? (current.payload as { id: string }).id
      : null;
    const { data, error } = await client().from("editorial_workflow_items").update({ payload, updated_by: actorId }).eq("id", current.id).eq("marca_id", marcaId).eq("lock_version", expectedLock).select("id,lock_version").maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new OptimisticLockError();
    return { ...(data as { id: string; lock_version: number }), payload: idNoPayload ? { id: idNoPayload } : null };
  }
}

function snapshotPayloadHasId(payload: unknown, candidateId: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const object = payload as { id?: unknown; research?: { id?: unknown } | null };
  return object.id === candidateId || object.research?.id === candidateId;
}

export class SerpSnapshotRepository {
  private async findRemoteSnapshot(marcaId: string, articleId: string, candidateId: string) {
    const { data, error } = await client().from("editorial_serp_snapshots")
      .select("id,source_version_id,payload")
      .eq("marca_id", marcaId)
      .eq("article_id", articleId);
    unwrap(data, error);
    const rows = (data || []) as Array<Pick<SerpSnapshotPersistenceRow, "id" | "source_version_id" | "payload">>;
    return rows.find(row => row.id === candidateId || snapshotPayloadHasId(row.payload, candidateId)) || null;
  }

  private async resolvePreviousSnapshotId(marcaId: string, articleId: string, candidateId: string | null | undefined) {
    const canonical = canonicalUuidOrNull(candidateId);
    if (canonical) return canonical;
    if (!candidateId) return null;
    const row = await this.findRemoteSnapshot(marcaId, articleId, candidateId);
    return canonicalUuidOrNull(row?.id);
  }

  /** F2 · `articleIds` = só os artigos do recorte (grupo); ausente = a leitura de sempre. */
  async list(marcaId: string, articleId?: string, articleIds?: readonly string[]) {
    try {
      const consulta = () => client().from("editorial_serp_snapshots").select("id,marca_id,article_id,source_version_id,snapshot_version,previous_snapshot_id,content_hash,status,payload,created_by,created_at").eq("marca_id", marcaId).order("snapshot_version", { ascending: true });
      let query = consulta();
      if (articleId) query = query.eq("article_id", articleId);
      const { data, error } = articleIds
        ? await lerEmBlocos(articleIds, ids => consulta().in("article_id", ids)).then(lido => ({ ...lido, data: lido.data ? [...lido.data as Array<{ snapshot_version: number }>].sort((a, b) => a.snapshot_version - b.snapshot_version) : null })) as unknown as Awaited<typeof query>
        : await query;
      unwrap(data, error);
      const records = (data || []).map(row => {
        const typedRow = row as unknown as Pick<SerpSnapshotPersistenceRow, "source_version_id" | "payload">;
        const record = markStoredSerpSnapshotAsRemote(parseStoredSerpSnapshotPayload(typedRow.payload, typedRow.source_version_id));
        if (record.research && record.research.brandId !== marcaId) throw new Error("O snapshot SERP remoto não pertence à marca solicitada.");
        return record;
      });
      return { records, available: true };
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        /*
         * ===== "available: false" NÃO PODE SER MUDO =====
         *
         * A leitura degrada em silêncio e a tela mostra "coleta local
         * disponível". Sem isto, o motivo — projeto inalcançável, timeout,
         * tabela ausente — morre aqui e nunca chega a quem corrige.
         */
        console.error("[serp-records:read]", error.reason, error.driver?.code || "", error.driver?.message || "");
        return { records: [] as SerpCollectionRecord[], available: false };
      }
      throw error;
    }
  }

  async save(marcaId: string, record: SerpCollectionRecord, actorId: string) {
    try {
      const previousSnapshotId = await this.resolvePreviousSnapshotId(marcaId, record.input.articleId, record.research?.previousSnapshotId);
      const { row } = buildSerpSnapshotPersistenceRow({ brandId: marcaId, record, actorId, previousSnapshotId });
      const { error } = await client().from("editorial_serp_snapshots").insert(row);
      if (error) mapPersistenceError(error);
      return true;
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) return false;
      throw error;
    }
  }

  async saveReview(marcaId: string, review: SerpReviewRecord) {
    try {
      const snapshot = await this.findRemoteSnapshot(marcaId, review.articleId, review.snapshotId);
      const snapshotId = canonicalUuidOrNull(snapshot?.id);
      if (!snapshotId) return false;
      const snapshotRecord = snapshot ? parseStoredSerpSnapshotPayload(snapshot.payload, snapshot.source_version_id) : null;
      const sourceVersionId = snapshot?.source_version_id || snapshotRecord?.research?.articleDnaVersionId || null;
      const row = buildSerpReviewPersistenceRow({ brandId: marcaId, review, snapshotId, sourceVersionId });
      const { data, error } = await client().from("editorial_serp_reviews").insert(row).select("id").maybeSingle();
      if (error) mapPersistenceError(error);
      if (!data) throw new Error("A revisão SERP foi enviada, mas o registro não retornou para confirmação.");
      const readback = await this.listReviews(marcaId, review.articleId);
      const confirmed = readback.available && readback.reviews.some(item => item.id === review.id || (item.snapshotId === review.snapshotId && item.status === review.status && item.reviewedBy === review.reviewedBy));
      if (!confirmed) throw new Error("A revisão SERP foi gravada, mas o readback não corresponde ao snapshot revisado.");
      return true;
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) return false;
      throw error;
    }
  }

  async listReviews(marcaId: string, articleId?: string, articleIds?: readonly string[]) {
    try {
      const consulta = () => client().from("editorial_serp_reviews").select("id,marca_id,article_id,snapshot_id,source_version_id,status,reviewed_by,payload,created_at").eq("marca_id", marcaId).order("created_at", { ascending: true });
      let query = consulta();
      if (articleId) query = query.eq("article_id", articleId);
      const { data, error } = articleIds
        ? await lerEmBlocos(articleIds, ids => consulta().in("article_id", ids)).then(lido => ({ ...lido, data: lido.data ? [...lido.data as Array<{ created_at: string }>].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) : null })) as unknown as Awaited<typeof query>
        : await query;
      unwrap(data, error);
      const reviews = (data || []).map(row => parseStoredSerpReviewPayload(row.payload, row as unknown as SerpReviewPersistenceRow));
      return { reviews, available: true };
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        console.error("[serp-reviews:read]", error.reason, error.driver?.code || "", error.driver?.message || "");
        return { reviews: [] as SerpReviewRecord[], available: false };
      }
      throw error;
    }
  }
}

export class DecisionEventRepository {
  async append(input: { marcaId: string; workflowItemId?: string | null; articleId: string; eventType: string; fromState?: string | null; toState?: string | null; sourceVersionId?: string | null; payload?: object; actorId: string }) {
    const { error } = await client().from("editorial_decision_events").insert({ marca_id: input.marcaId, workflow_item_id: input.workflowItemId || null, article_id: input.articleId,
      event_type: input.eventType, from_state: input.fromState || null, to_state: input.toState || null, source_version_id: input.sourceVersionId || null, payload: input.payload || {}, actor_id: input.actorId });
    if (error) mapPersistenceError(error);
  }
}

/**
 * A grafia do status na COLUNA, a partir da grafia do contrato.
 *
 * Existia só dentro de `save`. A finalização idempotente precisa saber qual
 * status a requisição quer deixar gravado ANTES de gravar, e duas cópias desta
 * tradução divergiriam no primeiro estado novo.
 */
export function documentStatusColumn(status: string) {
  if (status === "planejado") return "planned";
  if (status === "escrevendo") return "writing";
  if (status === "em_revisao") return "in_review";
  return "approved";
}

/** 2026-10-19 · a linha confirmada depois do upsert, sem `payload` (ver `ContentDocumentRepository.create`). */
export const CONTENT_DOCUMENT_ROW_RECEIPT_SELECT = "id,marca_id,article_id,status,content_hash,lock_version,updated_at";

/** 2026-10-19 · o recibo do documento: só os caminhos que o envio ao Redator lê (ver `findRadarReceiptByArticle`). */
export const CONTENT_DOCUMENT_RADAR_RECEIPT_SELECT = "id,schemaVersion:payload->schemaVersion,radarOrigin:payload->radarOrigin,storedBundleHash:payload->importedContext->dossier->>bundleHash";

export type ContentDocumentRadarReceipt = Pick<ContentDocument, "id" | "schemaVersion"> & {
  radarOrigin?: RadarDocumentOrigin;
  /** O `bundleHash` gravado no dossiê do documento (`null` sem dossiê). */
  storedBundleHash?: string | null;
};

/**
 * A linha estreita vira recibo. `radarOrigin` passa pelo contrato de sempre:
 * fora de forma, ele não existe — e a elegibilidade trata como pacote anterior
 * (bloqueia em vez de reconhecer a entrega), igual ao documento legado.
 */
export function contentDocumentRadarReceiptOfRow(row: Record<string, unknown>): ContentDocumentRadarReceipt | null {
  const id = typeof row.id === "string" && row.id ? row.id : null;
  if (!id) return null;
  const schemaVersion = row.schemaVersion === 2 ? 2 : 1;
  const origem = RadarDocumentOriginSchema.safeParse(row.radarOrigin);
  return {
    id,
    schemaVersion,
    ...(origem.success ? { radarOrigin: origem.data } : {}),
    storedBundleHash: typeof row.storedBundleHash === "string" && row.storedBundleHash ? row.storedBundleHash : null,
  } as ContentDocumentRadarReceipt;
}

export class ContentDocumentRepository {
  /**
   * ===== E1 · A LISTAGEM SAI SEM O PACOTE DO RADAR =====
   *
   * `payload` inteiro custava 4,50 MB por carga da mesa com 2 documentos —
   * 4,49 MB eram `importedContext.dossier.bundle` (medido em 2026-09-23).
   * A projeção pede cada campo por seletor de caminho e deixa só o bundle no
   * banco: 7,4 kB de valores para os mesmos 2 documentos.
   *
   * O documento v2 com dossiê volta na forma PARCIAL, com o marcador
   * `bundleOmitted` (ver `lib/editorial/content-document-listing.ts`). O
   * detalhe completo é `findDetail`, para o documento aberto.
   */
  async list(marcaId: string, userId: string) {
    /*
     * 2026-10-11 · UMA LEITURA POR DOCUMENTO. Os ~40 caminhos JSON do select
     * abaixo descomprimem o payload inteiro (2 a 6 MB, quase tudo bundle do Radar)
     * uma vez por caminho: 11,7 s em produção, acima do limite de 8 s. A função
     * `editorial_content_documents_listing` lê o payload uma vez e tira o bundle
     * no banco (186 ms, 6 KB). Sem a função (migration ainda não aplicada), o
     * select antigo continua valendo. O documento listado é o mesmo nos dois.
     */
    const viaFuncao = await client().rpc("editorial_content_documents_listing", { p_marca_id: marcaId });
    let rows: Array<{ id: string; content_hash: string; lock_version: number; updated_at: string; document: ReturnType<typeof listedContentDocumentFromRow> }>;
    if (!viaFuncao.error) {
      rows = ((viaFuncao.data || []) as Array<{ id: string; content_hash: string; lock_version: number; updated_at: string; payload: unknown }>)
        .map(row => ({ id: row.id, content_hash: row.content_hash, lock_version: row.lock_version, updated_at: row.updated_at, document: listedContentDocumentFromListingPayload(row.payload) }));
    } else if (funcaoDeListagemAusente(viaFuncao.error)) {
      const { data, error } = await client().from("content_documents").select(`id,content_hash,lock_version,updated_at,${CONTENT_DOCUMENT_LISTING_SELECT}`).eq("marca_id", marcaId).order("updated_at", { ascending: false });
      unwrap(data, error);
      rows = ((data || []) as unknown as Array<Record<string, unknown> & { id: string; content_hash: string; lock_version: number; updated_at: string }>)
        .map(row => ({ id: row.id, content_hash: row.content_hash, lock_version: row.lock_version, updated_at: row.updated_at, document: listedContentDocumentFromRow(row) }));
    } else {
      unwrap(viaFuncao.data, viaFuncao.error);
      rows = [];
    }
    const ids = rows.map(row => row.id);
    const states = ids.length ? await client().from("content_document_user_states").select("*").eq("user_id", userId).in("document_id", ids) : { data: [], error: null };
    unwrap(states.data, states.error); const stateMap = new Map((states.data || []).map(row => [row.document_id, row]));
    return rows.map(row => { const state = stateMap.get(row.id); return { document: row.document, contentHash: row.content_hash, lockVersion: row.lock_version, updatedAt: isoDate(row.updated_at),
      userState: state ? { cursorPosition: state.cursor_position, scrollTop: state.scroll_top, leftPanelOpen: state.left_panel_open, rightPanelOpen: state.right_panel_open, lastOpenedAt: isoDate(state.last_opened_at) } : null }; });
  }

  /**
   * E1 · O DETALHE: um documento, inteiro, da marca pedida.
   *
   * É a leitura que o Redator faz ao abrir o documento e Publicações ao
   * exportar. Filtra por marca na própria consulta (R4): o id sozinho não
   * prova de que marca o documento é.
   */
  async findDetail(marcaId: string, documentId: string) {
    const { data, error } = await client().from("content_documents").select("id,payload,content_hash,lock_version,updated_at").eq("marca_id", marcaId).eq("id", documentId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) return null;
    return { document: ContentDocumentSchema.parse(data.payload), contentHash: data.content_hash as string,
      lockVersion: data.lock_version as number, updatedAt: isoDate(data.updated_at as string) };
  }

  /**
   * E1 · A GRAVAÇÃO NÃO APAGA O BUNDLE QUE A CÓPIA NÃO TROUXE.
   *
   * Recebe a cópia PARCIAL e devolve o documento completo, com o bundle lido
   * VERBATIM da linha gravada (R10): sem reidratar, sem podar — o seletor de
   * caminho devolve o JSON como está no banco.
   *
   * A trava de concorrência continua sendo a do `save`: todo UPDATE
   * incrementa o lock (`content_documents_touch_trg`) e o `save` grava com
   * `WHERE lock_version = esperado`. Se a linha mudar entre esta leitura e a
   * gravação, o `save` não casa e nada é escrito. Não há checagem de lock
   * aqui de propósito: a finalização repetida depois de um timeout (lock já
   * avançado) precisa chegar ao reuso da rota, como chega com o documento
   * completo.
   *
   * Pacote diferente do declarado pela cópia (`bundleId`/`bundleHash`) é
   * conflito: completar um dossiê com o bundle de outro gravaria um documento
   * incoerente.
   */
  async completeWithStoredBundle(marcaId: string, documentId: string, document: PartialContentDocument) {
    const { data, error } = await client().from("content_documents")
      .select("id,bundleId:payload->importedContext->dossier->bundleId,bundleHash:payload->importedContext->dossier->bundleHash,bundle:payload->importedContext->dossier->bundle")
      .eq("marca_id", marcaId).eq("id", documentId).maybeSingle();
    if (error) mapPersistenceError(error);
    const linha = data as { bundleId?: unknown; bundleHash?: unknown; bundle?: unknown } | null;
    if (!linha) throw new OptimisticLockError();
    const completo = completeWithStoredBundle(document, { bundleId: linha.bundleId, bundleHash: linha.bundleHash, bundle: linha.bundle });
    if (!completo) throw new OptimisticLockError("O pacote do Radar gravado não corresponde ao documento enviado. Recarregue o documento antes de salvar.");
    return completo;
  }

  /**
   * ===== O DOCUMENTO NASCE DO RADAR =====
   *
   * Desde a aposentadoria do Planejador (2026-10-01) não existe plano: a
   * assinatura não recebe mais `planVersionId` e a linha não cita a coluna
   * `content_plan_version_id`, que sai na migration F7.
   *
   * O `upsert` com `ignoreDuplicates` continua sendo a idempotência: repetir a
   * entrega do mesmo artigo devolve o documento existente em vez de criar um
   * segundo, e nada do que já foi escrito é sobrescrito.
   */
  async findByArticle(marcaId: string, articleId: string): Promise<ContentDocument | null> {
    const { data, error } = await client().from("content_documents").select("payload").eq("marca_id", marcaId).eq("article_id", articleId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) return null;
    return ContentDocumentSchema.parse(data.payload);
  }

  async create(marcaId: string, document: ContentDocument, articleId: string, articleVersionId: string, slug: string, hash: string, actorId: string) {
    /*
     * §18 · O ESTADO DA LINHA SEGUE O DO DOCUMENTO.
     *
     * Estava fixo em `writing` porque o único documento que nascia aqui vinha
     * de plano aprovado — já em escrita. O documento de origem Radar nasce em
     * `planejado`: carimbá-lo como `writing` faria a fase de planejamento do
     * Redator desaparecer do banco no instante em que ela começa.
     */
    const status = document.status === "planejado" ? "planned" : document.status === "em_revisao" ? "in_review" : document.status === "aprovado" ? "approved" : "writing";
    /*
     * 2026-10-19 · A GRAVAÇÃO NÃO DEVOLVE O DOCUMENTO (envio ao Redator em lote,
     * WifiConecta). O documento de um artigo com investigação grande tem 7 a 11 MB
     * (quase tudo `importedContext.dossier.bundle.observed`), e `select("*")` no
     * upsert fazia o MESMO comando reconverter os 11 MB em JSON para a resposta:
     * medido no banco, a volta custava ~40% do comando, e os três maiores
     * passavam dos 8 s do `statement_timeout` (57014) em toda tentativa. Agora a
     * escrita volta sem corpo (return=minimal) e a confirmação é uma leitura
     * estreita, sem `payload`. Quem confere o conteúdo gravado é o readback do
     * serviço (`findRadarReceiptByArticle`). A idempotência é a mesma: upsert com
     * `ignoreDuplicates` e nada sobrescrito.
     *
     * 2026-10-19 (2) · O INSERT EM SI PASSA DOS 8 s ACIMA DE ~9 MB. Mesmo sem a
     * volta, medido em pg_stat_statements: 5,2 s em média e 7,5 s no máximo para
     * documentos de 5,3 a 8,4 MB (~0,9 s por MB). Os três que falham têm 10 a 11 MB,
     * e o pacote entra no hash: não há o que podar sem mudar o contrato. A MESMA
     * escrita passa a ir pela função `editorial_content_document_create_from_radar`
     * (migration 20261019120000), que tem `statement_timeout` próprio de 60 s só
     * para ela — o insert, o ON CONFLICT (marca_id, article_id) DO NOTHING e o
     * recibo estreito são os de sempre. Sem a função no banco (migration não
     * aplicada), o upsert antigo responde, como antes. Erro da função que não é
     * "função ausente" (inclusive 57014) sobe como está: repetir a escrita de
     * 10 MB pelo outro caminho só dobraria a carga.
     */
    const viaFuncao = await client().rpc("editorial_content_document_create_from_radar", {
      p_id: document.id, p_marca_id: marcaId, p_article_id: articleId, p_article_dna_version_id: articleVersionId,
      p_status: status, p_title: document.title, p_slug: slug, p_payload: document, p_content_hash: hash, p_actor_id: actorId,
    });
    if (!viaFuncao.error) {
      const recibo = viaFuncao.data && typeof viaFuncao.data === "object" ? viaFuncao.data as Record<string, unknown> : null;
      if (!recibo) throw new PersistenceUnavailableError("O documento do Redator não foi confirmado depois da gravação.", "repository_unavailable");
      return Object.fromEntries(CONTENT_DOCUMENT_ROW_RECEIPT_SELECT.split(",").map(coluna => [coluna, recibo[coluna] ?? null]));
    }
    if (!funcaoDeGravacaoDoDocumentoAusente(viaFuncao.error)) mapPersistenceError(viaFuncao.error);
    const { error } = await client().from("content_documents").upsert({ id: document.id, marca_id: marcaId, article_id: articleId,
      article_dna_version_id: articleVersionId, status, title: document.title, slug, payload: document, content_hash: hash, created_by: actorId, updated_by: actorId },
      { onConflict: "marca_id,article_id", ignoreDuplicates: true });
    if (error) mapPersistenceError(error);
    const { data: existing, error: existingError } = await client().from("content_documents").select(CONTENT_DOCUMENT_ROW_RECEIPT_SELECT).eq("marca_id", marcaId).eq("article_id", articleId).single();
    return unwrap(existing, existingError);
  }

  /**
   * 2026-10-19 · O RECIBO DO DOCUMENTO, SEM O DOCUMENTO.
   *
   * O envio ao Redator só precisa saber se o documento do artigo existe, com
   * que id e de que pacote (`schemaVersion` e `radarOrigin`, a mesma leitura de
   * `resolveRadarImportEligibility` e do readback). Ler o `payload` inteiro —
   * 7 a 11 MB — para isso convertia o documento todo em JSON duas vezes por
   * envio. Aqui saem só os caminhos pedidos, mais o `bundleHash` gravado no
   * dossiê, que o readback confronta com o do pacote entregue.
   */
  async findRadarReceiptByArticle(marcaId: string, articleId: string): Promise<ContentDocumentRadarReceipt | null> {
    const { data, error } = await client().from("content_documents").select(CONTENT_DOCUMENT_RADAR_RECEIPT_SELECT).eq("marca_id", marcaId).eq("article_id", articleId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) return null;
    return contentDocumentRadarReceiptOfRow(data as unknown as Record<string, unknown>);
  }

  /*
   * `marcaId` é opcional só para não quebrar quem já chamava sem ela; a rota da
   * tela passa a marca. Com ela, o UPDATE casa por id E marca (R4): o id
   * sozinho deixava gravar documento de outra marca com a permissão desta.
   */
  async save(documentId: string, expectedLock: number, document: ContentDocument, hash: string, actorId: string, marcaId?: string) {
    const status = documentStatusColumn(document.status);
    /*
     * A VOLTA DO AUTOSAVE NAO TRAZ O DOCUMENTO.
     *
     * `select("*")` devolvia a linha inteira a cada pausa de 1,2 s na
     * digitacao: medido em 2026-09-23, 4,48 MB por save no documento grande
     * (quase tudo `payload.importedContext`), para o texto escrito ter 1 kB.
     *
     * O unico chamador (app/api/editorial/documents/route.ts) le do retorno
     * apenas status, lock_version, updated_at e content_hash. O lock que volta
     * continua sendo o de depois do trigger: RETURNING reflete a linha pos
     * BEFORE UPDATE com qualquer lista de colunas. E o conflito continua vindo
     * do `data` nulo: o WHERE lock_version nao casa, zero linhas voltam.
     */
    const alvo = client().from("content_documents").update({ payload: document, content_hash: hash, status, updated_by: actorId }).eq("id", documentId).eq("lock_version", expectedLock);
    const { data, error } = await (marcaId ? alvo.eq("marca_id", marcaId) : alvo).select("id,status,content_hash,lock_version,updated_at").maybeSingle();
    if (error) mapPersistenceError(error); if (!data) throw new OptimisticLockError(); return data;
  }

  async createVersion(documentId: string, document: ContentDocument, hash: string, reason: string, actorId: string) {
    const { data: latest, error: latestError } = await client().from("content_document_versions").select("version_id,version_number").eq("document_id", documentId).order("version_number", { ascending: false }).limit(1).maybeSingle();
    if (latestError) mapPersistenceError(latestError); const versionNumber = (latest?.version_number || 0) + 1; const versionId = crypto.randomUUID();
    const { error } = await client().from("content_document_versions").insert({ version_id: versionId, document_id: documentId, version_number: versionNumber,
      previous_version_id: latest?.version_id || null, content_hash: hash, change_reason: reason, payload: document, created_by: actorId });
    if (error) mapPersistenceError(error); return { versionId, versionNumber };
  }

  /**
   * ===== CORTE 6A.4 · A VERSÃO FINALIZADA VIRA A CORRENTE =====
   *
   * `createVersion` insere a linha e para. Ninguém movia
   * `content_documents.current_version_id` — antes da M6 quem o escrevia era o
   * save do MCP, e ele o fazia na hora errada. Com o ponteiro sempre nulo, a
   * guarda `retention_successor_not_current` da RPC de retenção nunca podia
   * passar, e versão de artigo nenhuma entrava na janela de 48h.
   *
   * Isto move o ponteiro, e só ele. É escrita de coluna na mesma tabela que
   * `save` já atualiza — não é autoridade nova: o versionamento do artigo
   * sempre morou aqui, do lado TypeScript.
   */
  async promoteVersionToCurrent(marcaId: string, documentId: string, versionId: string) {
    const { data, error } = await client().from("content_documents")
      .update({ current_version_id: versionId })
      .eq("id", documentId).eq("marca_id", marcaId).select("current_version_id").maybeSingle();
    if (error) mapPersistenceError(error);
    return (data?.current_version_id as string | null) ?? null;
  }

  /**
   * Leitura de volta do que a finalização precisa conferir — com o
   * `lock_version` junto.
   *
   * O lock vem porque `promoteVersionToCurrent` é um UPDATE, e
   * `content_documents_touch_trg` incrementa o lock em QUALQUER update. Quem
   * chamou precisa devolver ao cliente o lock de DEPOIS do movimento do
   * ponteiro; devolver o de antes faria a próxima gravação do usuário bater em
   * conflito logo após finalizar.
   */
  async readFinalizationState(marcaId: string, documentId: string) {
    const { data, error } = await client().from("content_documents")
      .select("status,content_hash,current_version_id,lock_version,updated_at")
      .eq("id", documentId).eq("marca_id", marcaId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) return null;
    return { status: data.status as string, contentHash: data.content_hash as string,
      currentVersionId: (data.current_version_id as string | null) ?? null,
      lockVersion: data.lock_version as number,
      updatedAt: isoDate(data.updated_at) };
  }

  /** Identidade e hash da versão indicada, lidos do servidor. */
  async versionSummary(documentId: string, versionId: string) {
    const { data, error } = await client().from("content_document_versions")
      .select("version_id,version_number,content_hash")
      .eq("document_id", documentId).eq("version_id", versionId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) return null;
    return { versionId: data.version_id as string, versionNumber: data.version_number as number,
      contentHash: data.content_hash as string };
  }

  async saveUserState(documentId: string, userId: string, state: { cursorPosition: number | null; scrollTop: number; leftPanelOpen: boolean; rightPanelOpen: boolean }) {
    const { error } = await client().from("content_document_user_states").upsert({ document_id: documentId, user_id: userId, cursor_position: state.cursorPosition, scroll_top: state.scrollTop,
      left_panel_open: state.leftPanelOpen, right_panel_open: state.rightPanelOpen, last_opened_at: new Date().toISOString() }, { onConflict: "document_id,user_id" });
    if (error) mapPersistenceError(error);
  }
}

/** Estados do registro antes da exportação: o documento aprovado e entregue os leva a `ready_to_export`. */
export const PUBLICATION_PRE_EXPORT_STATES: readonly string[] = ["draft", "writing", "awaiting_review", "in_review", "approved"];

export class PublicationProtectionError extends Error {
  constructor(message: string) { super(message); this.name = "PublicationProtectionError"; }
}

export class PublicationRepository {
  /** F2 · `scope.articleIds` = só os artigos do recorte (grupo); sem recorte, a leitura de sempre. */
  async list(marcaId: string, scope: { articleIds?: readonly string[] } = {}) {
    const consulta = () => client().from("publication_records").select("payload,status,lock_version,updated_at").eq("marca_id", marcaId);
    const { data, error } = scope.articleIds ? await lerEmBlocos(scope.articleIds, ids => consulta().in("article_id", ids)) as unknown as Awaited<ReturnType<typeof consulta>> : await consulta();
    unwrap(data, error); return (data || []).map(row => OperationalPublicationSchema.parse({ ...(row.payload as object), state: row.status, lockVersion: row.lock_version, updatedAt: isoDate(row.updated_at) }));
  }
  async create(marcaId: string, publication: OperationalPublication, actorId: string) {
    const { data, error } = await client().from("publication_records").upsert({ marca_id: marcaId, article_id: publication.articleId,
      document_id: publication.documentId, status: publication.state, payload: publication, created_by: actorId, updated_by: actorId }, { onConflict: "marca_id,article_id", ignoreDuplicates: true }).select("*").maybeSingle();
    if (error) mapPersistenceError(error); return data;
  }
  async find(marcaId: string, publicationId: string) {
    const { data, error } = await client().from("publication_records").select("id,payload,status,lock_version,updated_at").eq("marca_id", marcaId);
    unwrap(data, error);
    const row = (data || []).find(candidate => (candidate.payload as { id?: string })?.id === publicationId);
    if (!row) return null;
    return {
      rowId: row.id as string,
      publication: OperationalPublicationSchema.parse({ ...(row.payload as object), state: row.status, lockVersion: row.lock_version, updatedAt: isoDate(row.updated_at) }),
    };
  }
  async updateOperational(marcaId: string, publicationId: string, expectedLock: number, publication: OperationalPublication, actorId: string) {
    const current = await this.find(marcaId, publicationId);
    if (!current) return null;
    if (current.publication.brandId !== publication.brandId || current.publication.articleId !== publication.articleId || current.publication.slug !== publication.slug ||
      current.publication.documentId !== publication.documentId || current.publication.unitType !== publication.unitType ||
      (current.publication.state === "published" && current.publication.destinationUrl !== publication.destinationUrl)) {
      throw new PublicationProtectionError("Campos estruturais de uma publicação não podem ser alterados.");
    }
    const payload = OperationalPublicationSchema.parse(publication);
    const { data, error } = await client().from("publication_records").update({ status: payload.state, payload, updated_by: actorId })
      .eq("id", current.rowId).eq("marca_id", marcaId).eq("lock_version", expectedLock).select("id,status,payload,lock_version,updated_at").maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new OptimisticLockError("A publicação foi alterada por outra sessão.");
    return OperationalPublicationSchema.parse({ ...(data.payload as object), state: data.status, lockVersion: data.lock_version, updatedAt: isoDate(data.updated_at) });
  }
  async syncDocumentStatus(documentId: string, documentStatus: ContentDocument["status"], actorId: string) {
    const { data: current, error: currentError } = await client().from("publication_records").select("id,payload,lock_version").eq("document_id", documentId).maybeSingle();
    if (currentError) mapPersistenceError(currentError); if (!current) return;
    const currentPublication = OperationalPublicationSchema.parse(current.payload);
    const target = currentPublication.state === "published" ? "published" : documentStatus === "em_revisao" ? "awaiting_review" : documentStatus === "aprovado" ? "approved" : documentStatus === "escrevendo" ? "writing" : "draft";
    const payload = OperationalPublicationSchema.parse({ ...(current.payload as object), state: target });
    const { data, error } = await client().from("publication_records").update({ status: target, payload, updated_by: actorId }).eq("id", current.id).eq("lock_version", current.lock_version).select("id").maybeSingle();
    if (error) mapPersistenceError(error); if (!data) throw new OptimisticLockError("A publicação vinculada foi alterada por outra sessão.");
  }

  /*
   * 2026-10-18 · defeito 1 do inventário: esta função existia sem chamador, e o
   * registro criado por "Enviar a Publicações" ficava em rascunho para sempre.
   * Agora é o passo IMPORTAR do próprio handoff (`sendWriterToPublications`),
   * que já validou o documento aprovado: registro ainda antes da exportação
   * (rascunho, escrita, revisão ou aprovado) passa a pronto para exportar, e o
   * "Colocar na fila" de sempre aparece. Fila, exportado e publicado não voltam.
   */
  async importApproved(articleId: string, marcaId: string, expectedLock: number, actorId: string) {
    const { data: current, error: currentError } = await client().from("publication_records").select("id,marca_id,status,payload,lock_version").eq("article_id", articleId).eq("marca_id", marcaId).maybeSingle();
    if (currentError) mapPersistenceError(currentError);
    if (!current || !PUBLICATION_PRE_EXPORT_STATES.includes(current.status as string)) return null;
    const payload = OperationalPublicationSchema.parse({ ...(current.payload as object), state: "ready_to_export", lockVersion: current.lock_version + 1, updatedAt: new Date().toISOString() });
    const { data, error } = await client().from("publication_records").update({ status: "ready_to_export", payload, updated_by: actorId }).eq("id", current.id).eq("lock_version", expectedLock).select("id").maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new OptimisticLockError("O item aprovado foi alterado por outra sessão.");
    return { id: data.id, articleId: payload.articleId };
  }
}

export class ViewPreferenceRepository {
  async list(marcaId: string, userId: string) {
    const { data, error } = await client().from("editorial_saved_views").select("id,name,module,settings,is_default,updated_at").eq("marca_id", marcaId).eq("user_id", userId);
    unwrap(data, error); return (data || []).map(row => SavedGridViewSchema.parse({ ...(row.settings as object), id: row.id, name: row.name, module: row.module, brandId: marcaId, userId, isDefault: row.is_default, updatedAt: isoDate(row.updated_at) }));
  }
  async save(view: SavedGridView, userId: string) {
    if (view.isDefault) await client().from("editorial_saved_views").update({ is_default: false }).eq("marca_id", view.brandId).eq("user_id", userId).eq("module", view.module);
    const { data, error } = await client().from("editorial_saved_views").upsert({ id: view.id, marca_id: view.brandId, user_id: userId, module: view.module, name: view.name, settings: view, is_default: view.isDefault }, { onConflict: "id" }).select("*").single();
    return unwrap(data, error);
  }
  async delete(id: string, marcaId: string, userId: string) {
    const { error } = await client().from("editorial_saved_views").delete().eq("id", id).eq("marca_id", marcaId).eq("user_id", userId);
    if (error) mapPersistenceError(error);
  }
}

export class InvitationRepository {
  async create(input: Omit<BrandInvitation, "id" | "createdAt" | "delivery" | "tokenId" | "status">, actorId: string) {
    const roleResult = await client().from("brand_roles").select("id").eq("slug", input.role).or(`marca_id.eq.${input.brandId},marca_id.is.null`).limit(1).maybeSingle();
    let role = roleResult.data;
    if (roleResult.error) mapPersistenceError(roleResult.error);
    if (!role) {
      const created = await client().from("brand_roles").insert({ marca_id: input.brandId, slug: input.role, name: input.role, description: "Preset criado pelo fluxo de convite." }).select("id").single();
      role = unwrap(created.data, created.error);
    }
    const token = crypto.randomUUID(); const tokenHash = await contentHash(token);
    const inserted = await client().from("brand_invitations").insert({ marca_id: input.brandId, email: input.email.toLowerCase(), role_id: role!.id, token_hash: tokenHash,
      status: "pending", expires_at: input.expiresAt, created_by: actorId }).select("id,created_at").single();
    const row = unwrap(inserted.data, inserted.error)!;
    const permissions = input.permissions.flatMap(permission => permission.actions.map(action => ({ invitation_id: row.id, module: permission.module, action })));
    if (permissions.length) { const { error } = await client().from("brand_invitation_permissions").insert(permissions); if (error) mapPersistenceError(error); }
    return BrandInvitationSchema.parse({ ...input, id: row.id, status: "pending", createdAt: isoDate(row.created_at), createdBy: actorId, delivery: "not_sent", tokenId: `persisted:${row.id}` });
  }

  /*
   * 2026-10-18 · defeito da Marca no inventário de botões: "Cancelar" o convite
   * só mudava a tela. Esta operação já existia (sem chamador); agora é ela que o
   * botão aciona, pelo PATCH de /api/editorial/invitations. Filtra pela MARCA
   * (isolamento) e só cancela o pendente. O banco aceita só pending, accepted,
   * expired e cancelled: suspender e revogar não têm onde ser gravados.
   */
  async updateStatus(marcaId: string, id: string, status: "cancelled" | "expired") {
    const { data, error } = await client().from("brand_invitations").update({ status, ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}) }).eq("id", id).eq("marca_id", marcaId).eq("status", "pending").select("id").maybeSingle();
    if (error) mapPersistenceError(error); return data;
  }

  async list(marcaId: string) {
    const { data, error } = await client().from("brand_invitations").select("id,marca_id,email,status,expires_at,created_at,created_by,role_id,brand_roles(slug),brand_invitation_permissions(module,action)").eq("marca_id", marcaId);
    unwrap(data, error); return (data || []).map(row => { const roleRelation = row.brand_roles as unknown as { slug?: string } | null; const permissionsRows = row.brand_invitation_permissions as unknown as Array<{ module: string; action: string }>;
      const grouped = new Map<string, string[]>(); for (const permission of (permissionsRows || []).filter(item => PermissionModuleSchema.safeParse(item.module).success)) grouped.set(permission.module, [...(grouped.get(permission.module) || []), permission.action]);
      return BrandInvitationSchema.parse({ id: row.id, brandId: row.marca_id, email: row.email, role: CollaboratorRoleSchema.safeParse(roleRelation?.slug).success ? roleRelation!.slug : "viewer", permissions: [...grouped].map(([module, actions]) => ({ module, actions })), status: row.status,
        expiresAt: isoDate(row.expires_at), createdAt: isoDate(row.created_at), createdBy: row.created_by, delivery: "not_sent", tokenId: `persisted:${row.id}` }); });
  }
}

export class MembershipRepository {}
export class PermissionRepository {}
export class DelegatedAccessRepository {}
