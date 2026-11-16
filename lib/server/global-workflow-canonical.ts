import { ArticleDNASchema, SiloDNASchema, SiloPageSchema } from "../arquiteto/contracts";
import { effectiveVersionStatus } from "../editorial/operational-flow";
import { getOperationalClient } from "./editorial-db";
import type { CanonicalApprovalIndex } from "../arquiteto/operational-status";
type Db = ReturnType<typeof getOperationalClient>;
export async function buildCanonicalIndex(db: Db, brandId: string): Promise<CanonicalApprovalIndex> {
  /*
   * A AUTORIDADE DO STATUS É A COLUNA DA VERSÃO — a mesma que a mesa lê.
   *
   * Este índice derivava "aprovado" só de `editorial_version_status_events`.
   * Mas o writer do Arquiteto (`ArtifactVersionRepository.append`) grava o
   * status NA LINHA da versão e nunca emite evento: o loader canônico devolve
   * `statuses` a partir de `row.status`, e é isso que a tela mostra.
   *
   * Resultado: para todo artefato do Arquiteto o índice via `null`, nenhuma
   * versão entrava em `vigentePorEntidade`, e o portão recusava ArticleDNA,
   * SiloDNA e SiloPage EM BLOCO — três recusas com uma causa só. Foi
   * exatamente o que a homologação encontrou nos cinco artigos.
   *
   * Duas definições de "canônico aprovado" para a mesma pergunta. Agora é uma:
   * a linha manda, e um evento POSTERIOR refina — porque evento é decisão mais
   * nova, e outros módulos do editorial escrevem por lá.
   */
  const rows: Array<{
    version_id: string; entity_id: string; artifact_type: string;
    version_number: number; status: string | null; payload: Record<string, unknown> | null;
  }> = [];
  const seenVersions = new Set<string>();
  for (let offset = 0; ;) {
    const result = await db.from("editorial_artifact_versions")
      .select("version_id,entity_id,artifact_type,version_number,status,payload", { count: "exact" })
      .eq("marca_id", brandId).in("artifact_type", ["article_dna", "silo_dna", "silo_page"])
      .order("version_id", { ascending: true }).range(offset, offset + 999);
    if (result.error) throw result.error;
    if (typeof result.count !== "number") throw new Error("Não foi possível confirmar a contagem das versões editoriais.");
    const page = (result.data || []) as typeof rows;
    for (const row of page) {
      if (!row.version_id || seenVersions.has(row.version_id)) throw new Error("A leitura das versões editoriais retornou itens repetidos.");
      seenVersions.add(row.version_id);
      rows.push(row);
    }
    offset += page.length;
    if (!page.length && offset < result.count) throw new Error("A leitura das versões editoriais ficou incompleta.");
    if (offset >= result.count) break;
  }

  const events: Array<Record<string, unknown>> = [];
  const versionIds = rows.map(row => row.version_id);
  for (let start = 0; start < versionIds.length; start += 100) {
    const ids = versionIds.slice(start, start + 100);
    const seenEvents = new Set<string>();
    for (let offset = 0; ;) {
      const result = await db.from("editorial_version_status_events")
        .select("event_id:id,version_id,status,occurred_at,actor_id,reason", { count: "exact" })
        .in("version_id", ids).order("occurred_at", { ascending: true }).order("id", { ascending: true })
        .range(offset, offset + 999);
      if (result.error) throw result.error;
      if (typeof result.count !== "number") throw new Error("Não foi possível confirmar a contagem das decisões editoriais.");
      const page = (result.data || []) as Array<Record<string, unknown>>;
      for (const event of page) {
        if (typeof event.event_id !== "string" || seenEvents.has(event.event_id)) throw new Error("A leitura das decisões editoriais retornou itens repetidos.");
        seenEvents.add(event.event_id);
        events.push(event);
      }
      offset += page.length;
      if (!page.length && offset < result.count) throw new Error("A leitura das decisões editoriais ficou incompleta.");
      if (offset >= result.count) break;
    }
  }
  const eventList = events.map(event => ({
    eventId: String(event.event_id ?? ""),
    versionId: String(event.version_id ?? ""),
    status: String(event.status ?? ""),
    occurredAt: String(event.occurred_at ?? ""),
    actorId: String(event.actor_id ?? ""),
    reason: String(event.reason ?? ""),
  })) as never[];

  const vigentePorEntidade = new Map<string, { versionId: string; versionNumber: number }>();
  const articleIdByVersion = new Map<string, string>();
  for (const row of rows) {
    if (row.artifact_type === "article_dna") {
      const body = row.payload?.payload && typeof row.payload.payload === "object" ? row.payload.payload as Record<string, unknown> : row.payload;
      const articleId = body && typeof body.articleId === "string" ? body.articleId : null;
      if (articleId) articleIdByVersion.set(row.version_id, articleId);
    }
    /*
     * Evento posterior vence; sem evento, vale o status da linha.
     *
     * Nunca o contrário: um evento de rejeição depois da gravação é decisão
     * mais nova, e deixar a linha sobrepô-lo faria um artefato recusado
     * continuar elegível.
     */
    const statusVigente = effectiveVersionStatus(row.version_id, eventList) ?? row.status;
    if (statusVigente !== "approved") continue;
    const chave = `${row.artifact_type}:${row.entity_id}`;
    const atual = vigentePorEntidade.get(chave);
    if (!atual || row.version_number > atual.versionNumber) {
      vigentePorEntidade.set(chave, { versionId: row.version_id, versionNumber: row.version_number });
    }
  }

  const validVersions = new Set(rows.filter(row => {
    const body = row.payload?.payload && typeof row.payload.payload === "object" ? row.payload.payload : row.payload;
    if (row.artifact_type === "article_dna") {
      const parsed = ArticleDNASchema.safeParse(body);
      if (!parsed.success) return false;
      const article = parsed.data;
      const principals = article.keywordReferences.filter(ref => ref.role === "principal");
      /*
       * `architectureStatus` É OPCIONAL NO CONTRATO.
       *
       * Exigi-lo igual a `architecture_confirmed` transformava um campo que o
       * schema declara opcional em obrigatório — e o fechamento canônico do
       * Silo não o preenche: ele monta o grupo sem `architectureStatus`, e o
       * valor só aparece quando a keyword principal já o trazia.
       *
       * Isso é a segunda definição de "confirmado" que o produto proíbe: quem
       * confirma a arquitetura é o ato humano da fase, registrado no status da
       * versão. Ausência não contradiz nada; valor DIFERENTE contradiz, e
       * continua barrando.
       */
      const arquiteturaNaoContradiz = article.architectureStatus === undefined
        || article.architectureStatus === "architecture_confirmed";
      return article.brandId === brandId && arquiteturaNaoContradiz
        && principals.length === 1 && principals[0].keywordId === article.principalKeywordId
        && article.humanPendingDecisions.length === 0;
    }
    if (row.artifact_type === "silo_dna") {
      const parsed = SiloDNASchema.safeParse(body);
      return parsed.success && (!parsed.data.brandId || parsed.data.brandId === brandId)
        && parsed.data.formationStatus === "formed" && parsed.data.humanPendingDecisions.length === 0;
    }
    const parsed = SiloPageSchema.safeParse(body);
    return parsed.success && parsed.data.brandId === brandId;
  }).map(row => row.version_id));
  const approvedArticleVersions = new Set<string>();
  const approvedSiloVersions = new Set<string>();
  const approvedSiloPageVersions = new Set<string>();
  for (const [chave, vigente] of vigentePorEntidade) {
    if (!validVersions.has(vigente.versionId)) continue;
    if (chave.startsWith("article_dna:")) approvedArticleVersions.add(vigente.versionId);
    else if (chave.startsWith("silo_page:")) approvedSiloPageVersions.add(vigente.versionId);
    else approvedSiloVersions.add(vigente.versionId);
  }

  const graphRows: Array<{ graph_version_id: string; graph_id: string; version_number: number; workflow_status: string; base_silo_dna_version_id: string; base_silo_page_version_id: string; participating_article_dna_version_refs: unknown; conflicts: unknown }> = [];
  const seenGraphs = new Set<string>();
  for (let offset = 0; ;) {
    const result = await db.from("internal_link_graphs")
      .select("graph_version_id,graph_id,version_number,workflow_status,base_silo_dna_version_id,base_silo_page_version_id,participating_article_dna_version_refs,conflicts", { count: "exact" })
      .eq("marca_id", brandId).order("graph_version_id", { ascending: true }).range(offset, offset + 999);
    if (result.error) throw result.error;
    if (typeof result.count !== "number") throw new Error("Não foi possível confirmar a contagem dos grafos editoriais.");
    const page = (result.data || []) as typeof graphRows;
    for (const row of page) {
      if (!row.graph_version_id || seenGraphs.has(row.graph_version_id)) throw new Error("A leitura dos grafos editoriais retornou itens repetidos.");
      seenGraphs.add(row.graph_version_id);
      graphRows.push(row);
    }
    offset += page.length;
    if (!page.length && offset < result.count) throw new Error("A leitura dos grafos editoriais ficou incompleta.");
    if (offset >= result.count) break;
  }
  const vigentePorGrafo = new Map<string, { versionId: string; versionNumber: number }>();
  for (const row of graphRows) {
    if (row.workflow_status !== "approved") continue;
    const atual = vigentePorGrafo.get(row.graph_id);
    if (!atual || row.version_number > atual.versionNumber) {
      vigentePorGrafo.set(row.graph_id, { versionId: row.graph_version_id, versionNumber: row.version_number });
    }
  }
  const conflictFree = new Set(graphRows.filter(row => row.workflow_status === "approved" && Array.isArray(row.conflicts) && row.conflicts.length === 0).map(row => row.graph_version_id));
  const approvedGraphVersions = new Set([...vigentePorGrafo.values()].map(item => item.versionId).filter(id => conflictFree.has(id)));

  const graphBases = new Map<string, {siloDnaVersionId:string;siloPageVersionId:string;articleVersionIds:readonly string[]}>();
  for (const row of graphRows) {
    const refs = Array.isArray(row.participating_article_dna_version_refs) ? row.participating_article_dna_version_refs : [];
    graphBases.set(row.graph_version_id, {siloDnaVersionId:row.base_silo_dna_version_id,siloPageVersionId:row.base_silo_page_version_id,articleVersionIds:refs.map((ref: {versionId?:string}) => ref.versionId || "")});
  }
  return { graphBases, approvedArticleVersions, approvedSiloVersions, approvedSiloPageVersions, approvedGraphVersions, articleIdByVersion };
}

