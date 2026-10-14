import "server-only";
import { PLATFORM_STAGES, type PlatformStage } from "@/lib/agent/platform-catalog";
import type { PlatformStateSnapshot } from "@/lib/agent/platform-state-model";
import type { TopicCandidate } from "@/lib/agent/topic-match";
import { resolveEditorialKeywordStatus } from "@/lib/minerador/editorial-status";
import { convertedTitleIndex } from "@/lib/minerador/subject-conversion";
import { radarFrozenObservedAtOfAnalysis } from "@/lib/radar/evidence-bundle-runtime";
import { radarArchitectLinksUpdateLabel, radarArchitectUpdateLabel } from "@/lib/radar/architect-update";
import { buildTenantPath } from "@/lib/tenant-routing";
import { editorialGroupFilterMatches } from "@/lib/editorial/editorial-groups";
import type { EditorialGroupMcpScope } from "@/lib/editorial/editorial-group-scope";
import { readArticleGroupMemberships } from "@/lib/editorial/article-groups-store";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";

/**
 * 2026-10-12 · F6 (SDD do plano declarado e grupos, §6.5 e §8) · o recorte por
 * grupo do retrato. Sem ele, as MESMAS consultas e o mesmo retrato de antes.
 * Com ele: keywords e Assuntos pelo `group_id`; artigos, Silos (os que têm
 * algum artigo do grupo), itens do Radar e documentos pelo grupo EFETIVO do
 * artigo (`readArticleGroupMemberships`, o ponto único da rota de grupos).
 */
export type PlatformStateGroupScope = Exclude<EditorialGroupMcpScope, { kind: "all" }>;

function filtroDoRecorte(scope: PlatformStateGroupScope) {
  return scope.kind === "none" ? { kind: "none" as const } : { kind: "groups" as const, color: scope.color, groupIds: scope.groupIds };
}
import { readMcpRuntimeConfig } from "./mcp-runtime-config";

/**
 * ===== O RETRATO DA MARCA, LIDO ESTREITO =====
 *
 * SDD: `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md` §3.3.
 *
 * Cada consulta pede só as colunas e os caminhos jsonb que o retrato usa. A
 * SDD de egress mediu documento de 4,5 MB e workspace de 6 MB: ler payload
 * inteiro aqui faria cada "o que a marca tem?" custar megabytes.
 *
 * Toda leitura filtra pela Marca. O cliente é o de serviço (ignora RLS), então
 * o filtro por `marca_id`/`brand_id` é a barreira — e quem chega aqui já passou
 * pelo grant, pela agência e pela permissão editorial no invólucro do MCP.
 */

const PAGINA = 1000;
/** Teto do que o retrato carrega por lista. O que passar disso vai em `truncated`. */
const TETO = {
  keywordsLidas: 20_000,
  assuntos: 200,
  artigos: 300,
  silos: 100,
  documentos: 200,
  publicadosListados: 150,
  publicadosSlugs: 5_000,
} as const;

type Row = Record<string, unknown>;
const texto = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

async function paginar(consulta: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, teto: number): Promise<{ rows: Row[]; cortado: boolean }> {
  const rows: Row[] = [];
  for (let from = 0; from < teto; from += PAGINA) {
    const { data, error } = await consulta(from, Math.min(from + PAGINA, teto) - 1);
    if (error) mapPersistenceError(error as never);
    const pagina = (data || []) as Row[];
    rows.push(...pagina);
    if (pagina.length < PAGINA) return { rows, cortado: false };
  }
  return { rows, cortado: true };
}

function screensFor(brandId: string, brandName: string): Record<PlatformStage, string> {
  const base = readMcpRuntimeConfig().publicBaseUrl || "";
  const entradas = PLATFORM_STAGES.map(stage => {
    let caminho: string;
    try {
      caminho = buildTenantPath({ brandId, brandName, module: stage });
    } catch {
      caminho = `/${stage}`;
    }
    return [stage, `${base}${caminho}`] as const;
  });
  return Object.fromEntries(entradas) as Record<PlatformStage, string>;
}

/** A última versão de cada entidade, a partir das linhas estreitas. */
function ultimaPorEntidade(rows: Row[]): Row[] {
  const porEntidade = new Map<string, Row>();
  for (const row of rows) {
    const id = String(row.entity_id);
    const atual = porEntidade.get(id);
    if (!atual || Number(row.version_number) > Number(atual.version_number)) porEntidade.set(id, row);
  }
  return [...porEntidade.values()];
}

export async function readPlatformState(brandId: string, options: { group?: PlatformStateGroupScope | null } = {}): Promise<PlatformStateSnapshot> {
  const db = getOperationalClient();
  const truncated: string[] = [];
  const recorte = options.group ?? null;
  const filtro = recorte ? filtroDoRecorte(recorte) : null;
  const doGrupo = (groupId: unknown) => !filtro || editorialGroupFilterMatches(filtro, typeof groupId === "string" ? groupId : null);

  /* ---- Marca ---- */
  const marca = await db.from("marcas").select("id,nome,site_url,nicho").eq("id", brandId).maybeSingle();
  if (marca.error) mapPersistenceError(marca.error);
  const brandRow = (marca.data || {}) as Row;
  const brandName = texto(brandRow.nome) || "Marca";

  /* ---- Minerador ---- */
  const keywordsLidas = await paginar((from, to) => db.from("minerador_keywords")
    .select(recorte ? "id,status,group_id" : "id,status").eq("brand_id", brandId).is("deleted_at", null).order("id").range(from, to), TETO.keywordsLidas);
  if (keywordsLidas.cortado) truncated.push(`minerador: contadas as primeiras ${TETO.keywordsLidas} keywords`);
  const keywords = recorte ? { ...keywordsLidas, rows: keywordsLidas.rows.filter(row => doGrupo(row.group_id)) } : keywordsLidas;
  const byStatus: Record<string, number> = {};
  const aprovadas: string[] = [];
  for (const row of keywords.rows) {
    const resolved = resolveEditorialKeywordStatus(row.status);
    const status = resolved.status ?? "desconhecido";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === "aprovado") aprovadas.push(String(row.id));
  }

  const assuntosBase = db.from("minerador_keywords")
    .select(recorte ? "id,keyword,status,group_id,subject:analise_semantica->keyword_subject,conv:analise_semantica->keyword_subject_conversion" : "id,keyword,status,subject:analise_semantica->keyword_subject,conv:analise_semantica->keyword_subject_conversion")
    .eq("brand_id", brandId).is("deleted_at", null)
    .filter("analise_semantica->keyword_subject->>declared", "eq", "true");
  /* Com o recorte, o filtro do grupo vai à consulta (o teto conta só os do grupo). */
  const assuntosDoRecorte = !filtro ? assuntosBase
    : filtro.kind === "none" ? assuntosBase.is("group_id", null)
      : assuntosBase.in("group_id", filtro.groupIds.length ? [...filtro.groupIds] : ["00000000-0000-0000-0000-000000000000"]);
  const assuntos = await assuntosDoRecorte.order("keyword").limit(TETO.assuntos + 1);
  if (assuntos.error) mapPersistenceError(assuntos.error);
  // 2026-10-13 · a linha-título convertida (formato anterior) não é mais Assunto: o Assunto mora na keyword que a aponta.
  const linhasDeAssunto = (assuntos.data || []) as unknown as Row[];
  const convertidas = convertedTitleIndex(linhasDeAssunto.map(row => ({ id: String(row.id), keyword: typeof row.keyword === "string" ? row.keyword : null, semantic: { keyword_subject: row.subject, keyword_subject_conversion: row.conv ?? null } })));
  const assuntoRows = linhasDeAssunto.filter(row => doGrupo(row.group_id) && !convertidas.has(String(row.id)));
  if (assuntoRows.length > TETO.assuntos) truncated.push(`minerador: listados os primeiros ${TETO.assuntos} Assuntos`);

  /* ---- Arquiteto: keywords recebidas e estado dos artigos ---- */
  const recebidas = await paginar((from, to) => db.from("editorial_workflow_items")
    .select("subject_id").eq("marca_id", brandId).eq("stage", "architect").eq("subject_type", "keyword").order("subject_id").range(from, to), TETO.keywordsLidas);
  const recebidasIds = new Set(recebidas.rows.map(row => String(row.subject_id)));

  const estadosArtigo = await db.from("editorial_workflow_items")
    .select("subject_id,state").eq("marca_id", brandId).eq("stage", "architect").eq("subject_type", "article").limit(TETO.artigos);
  if (estadosArtigo.error) mapPersistenceError(estadosArtigo.error);
  const estadoPorArtigo = new Map(((estadosArtigo.data || []) as Row[]).map(row => [String(row.subject_id), texto(row.state)]));

  /* ---- Arquiteto: DNAs, pela última versão, por caminho jsonb ---- */
  const artigosRows = await paginar((from, to) => db.from("editorial_artifact_versions")
    .select("entity_id,version_number,version_id,status,articleId:payload->>articleId,promise:payload->>promise,slug:payload->>suggestedSlug,siloId:payload->>siloId,hierarchy:payload->>hierarchy,journeyStage:payload->>journeyStage,mainIntent:payload->>mainIntent,principalKeywordId:payload->>principalKeywordId,canonical:payload->>canonical")
    .eq("marca_id", brandId).eq("artifact_type", "article_dna").order("entity_id").range(from, to), TETO.artigos * 20);
  /* 2026-10-12 · F6 · com o recorte, o grupo efetivo de cada artigo (lido uma vez por id; sem recorte, nada é lido). */
  const grupoDoArtigo = new Map<string, string | null>();
  const lerGruposDosArtigos = async (ids: readonly string[]) => {
    const faltam = [...new Set(ids)].filter(id => id && !grupoDoArtigo.has(id));
    if (!recorte || !faltam.length) return;
    const lidas = await readArticleGroupMemberships(db, brandId, { articleIds: faltam });
    for (const id of faltam) grupoDoArtigo.set(id, lidas.ok ? lidas.memberships.get(id)?.groupId ?? null : null);
  };
  const artigoDoGrupo = (id: string | null) => !recorte || (Boolean(id) && doGrupo(grupoDoArtigo.get(id as string) ?? null));
  const idDoArtigo = (row: Row) => texto(row.articleId) || String(row.entity_id);
  const ultimosArtigos = ultimaPorEntidade(artigosRows.rows);
  await lerGruposDosArtigos(ultimosArtigos.map(idDoArtigo));
  const artigos = ultimosArtigos.filter(row => artigoDoGrupo(idDoArtigo(row))).slice(0, TETO.artigos);
  if (artigos.length >= TETO.artigos) truncated.push(`arquiteto: listados os primeiros ${TETO.artigos} artigos`);

  const principalIds = [...new Set(artigos.map(row => texto(row.principalKeywordId)).filter((id): id is string => Boolean(id)))];
  const principais = new Map<string, string>();
  for (let i = 0; i < principalIds.length; i += 200) {
    const lote = await db.from("minerador_keywords").select("id,keyword").eq("brand_id", brandId).in("id", principalIds.slice(i, i + 200));
    if (lote.error) mapPersistenceError(lote.error);
    for (const row of (lote.data || []) as Row[]) principais.set(String(row.id), String(row.keyword));
  }

  const silosRows = await db.from("editorial_artifact_versions")
    .select("entity_id,version_number,siloId:payload->>siloId,name:payload->>name,pillarArticleId:payload->>pillarArticleId,supportArticleIds:payload->supportArticleIds,formationStatus:payload->>formationStatus")
    .eq("marca_id", brandId).eq("artifact_type", "silo_dna").limit(TETO.silos * 20);
  if (silosRows.error) mapPersistenceError(silosRows.error);
  const paginasRows = await db.from("editorial_artifact_versions")
    .select("entity_id,version_number,siloId:payload->>siloId,slug:payload->>slug,h1:payload->>h1,publicationStatus:payload->>publicationStatus,publishedUrl:payload->>publishedUrl")
    .eq("marca_id", brandId).eq("artifact_type", "silo_page").limit(TETO.silos * 20);
  if (paginasRows.error) mapPersistenceError(paginasRows.error);
  const paginaPorSilo = new Map(ultimaPorEntidade((paginasRows.data || []) as Row[]).map(row => [String(row.siloId), row]));

  /* ---- O papel de cada artigo no silo: quem decide é o SiloDNA ---- */
  const silosAtuais = ultimaPorEntidade((silosRows.data || []) as Row[]);
  const papelNoSilo = new Map<string, "Pilar" | "Suporte">();
  for (const silo of silosAtuais) {
    const suportes = Array.isArray(silo.supportArticleIds) ? (silo.supportArticleIds as unknown[]).map(String) : [];
    for (const id of suportes) papelNoSilo.set(id, "Suporte");
    const pilar = texto(silo.pillarArticleId);
    if (pilar) papelNoSilo.set(pilar, "Pilar");
  }

  /* ---- Radar e Redator ---- */
  /*
   * FINALIZADO É O CARIMBO DA ANÁLISE CORRENTE, não o estado da esteira.
   *
   * O fluxo vigente (START → ANALYZE → FINALIZE) deixa a linha em
   * research_pending depois de finalizada (lib/server/radar-writer-send.ts);
   * ler `state === "approved"` fazia a IA nunca oferecer o envio ao Redator
   * (auditoria 2026-09-26, J1/S1/R3). Lê só os três carimbos da última versão
   * — 553 bytes para três artigos, contra vários MB do payload.
   *
   * A última posição do array é a maior `versionNumber` (conferido no banco em
   * 2026-09-26 nos três itens da Care Glow): o array só recebe versões novas
   * no fim, e a poda preserva a corrente.
   */
  const radar = await db.from("editorial_workflow_items")
    .select("subject_id,state,transported:payload->>articleDnaVersionId,carriedGraph:payload->arquitetoInternalLinks->>graphVersionId,amz:payload->analysisVersions->-1->payload->amazonFrozenInvestigation->>finalizedAt,yt:payload->analysisVersions->-1->payload->youtubeFrozenInvestigation->>finalizedAt,gg:payload->analysisVersions->-1->payload->finalizedBundle->>frozenAt")
    .eq("marca_id", brandId).eq("stage", "radar").eq("subject_type", "article").limit(TETO.artigos);
  if (radar.error) mapPersistenceError(radar.error);
  /*
   * 2026-10-14 · LINKS NOVOS: o grafo aprovado vigente de cada grafo (a maior
   * versão aprovada, sem conflito — a régua do índice canônico), sem nós nem
   * arestas. A prévia de adopt_architect_version confere pelo Silo resolvido.
   */
  const grafosLidos = await db.from("internal_link_graphs")
    .select("graph_version_id,graph_id,version_number,workflow_status,conflicts,participating_article_dna_version_refs")
    .eq("marca_id", brandId);
  if (grafosLidos.error) mapPersistenceError(grafosLidos.error);
  const grafoPorVersao = new Map(((grafosLidos.data || []) as Row[]).map(row => [String(row.graph_version_id), row]));
  const grafoVigentePorId = new Map<string, Row>();
  for (const row of (grafosLidos.data || []) as Row[]) {
    if (texto(row.workflow_status) !== "approved") continue;
    const atual = grafoVigentePorId.get(String(row.graph_id));
    if (!atual || Number(row.version_number) > Number(atual.version_number)) grafoVigentePorId.set(String(row.graph_id), row);
  }
  const linksUpdateDe = (row: Row) => {
    const carregado = grafoPorVersao.get(texto(row.carriedGraph) || "");
    const vigente = carregado ? grafoVigentePorId.get(String(carregado.graph_id)) : undefined;
    if (!carregado || !vigente || vigente.graph_version_id === carregado.graph_version_id) return null;
    if (Array.isArray(vigente.conflicts) && vigente.conflicts.length) return null;
    const cobre = Array.isArray(vigente.participating_article_dna_version_refs)
      && (vigente.participating_article_dna_version_refs as Row[]).some(ref => texto(ref?.versionId) === texto(row.transported));
    if (!cobre) return null;
    return {
      label: radarArchitectLinksUpdateLabel(Number(carregado.version_number), Number(vigente.version_number)),
      fromGraphVersionNumber: Number(carregado.version_number), toGraphVersionNumber: Number(vigente.version_number),
      howToAdopt: "adopt_architect_version (mode=preview; kinds=['links'] aplica só os links) ou, na tela, Radar → 'Ver e adotar'",
    };
  };

  const documentosLidos = await db.from("content_documents")
    .select("id,article_id,title,status:payload->>status").eq("marca_id", brandId).order("updated_at", { ascending: false }).limit(TETO.documentos);
  if (documentosLidos.error) mapPersistenceError(documentosLidos.error);
  /* 2026-10-12 · F6 · o item do Radar e o documento herdam o grupo pelo artigo. */
  const radarLido = ((radar.data || []) as unknown as Row[]);
  /* F5 · a última APROVADA de cada artigo, pela coluna de status (a prévia de adopt_architect_version confere com o índice canônico). */
  const ultimaAprovadaPorArtigo = new Map<string, Row>();
  for (const versao of artigosRows.rows) {
    if (texto(versao.status) !== "approved") continue;
    const id = idDoArtigo(versao);
    const atual = ultimaAprovadaPorArtigo.get(id);
    if (!atual || Number(versao.version_number) > Number(atual.version_number)) ultimaAprovadaPorArtigo.set(id, versao);
  }
  await lerGruposDosArtigos([...radarLido.map(row => String(row.subject_id)), ...((documentosLidos.data || []) as Row[]).map(row => texto(row.article_id) || "")]);
  const radarDoRecorte = radarLido.filter(row => artigoDoGrupo(String(row.subject_id)));
  const documentos = { data: ((documentosLidos.data || []) as Row[]).filter(row => artigoDoGrupo(texto(row.article_id))) };
  const artigosDoRecorte = new Set(artigos.map(idDoArtigo));
  const silosDoRecorte = (silos: Row[]) => !recorte ? silos : silos.filter(silo => {
    const membros = [texto(silo.pillarArticleId), ...(Array.isArray(silo.supportArticleIds) ? (silo.supportArticleIds as unknown[]).map(String) : [])];
    return membros.some(id => id && artigosDoRecorte.has(id));
  });

  /* ---- Publicados ---- */
  const publicados = await db.from("brand_site_catalog_entries")
    .select("normalized_url,title,h1,page_type", { count: "exact" })
    .eq("marca_id", brandId).eq("presence_state", "present").is("ignored_at", null)
    .order("normalized_url").limit(TETO.publicadosListados);
  if (publicados.error) mapPersistenceError(publicados.error);
  const totalPublicados = publicados.count ?? (publicados.data || []).length;
  if (totalPublicados > TETO.publicadosListados) truncated.push(`publicados: listadas ${TETO.publicadosListados} de ${totalPublicados} páginas (a busca de tema lê todas)`);

  return {
    brand: {
      brandId,
      brandName,
      siteUrl: texto(brandRow.site_url),
      niche: texto(brandRow.nicho),
      screens: screensFor(brandId, brandName),
    },
    minerador: {
      total: keywords.rows.length,
      byStatus,
      subjects: assuntoRows.slice(0, TETO.assuntos).map(row => {
        const subject = (row.subject || {}) as Row;
        return {
          keywordId: String(row.id),
          keyword: String(row.keyword),
          note: texto(subject.note),
          destinationUrl: texto(subject.destinationUrl),
          status: resolveEditorialKeywordStatus(row.status).status ?? "desconhecido",
        };
      }),
      approvedNotSentIds: aprovadas.filter(id => !recebidasIds.has(id)),
    },
    arquiteto: {
      receivedKeywords: recebidasIds.size,
      articles: artigos.map(row => {
        const articleId = texto(row.articleId) || String(row.entity_id);
        const principalId = texto(row.principalKeywordId);
        return {
          articleId,
          promise: texto(row.promise) || articleId,
          slug: texto(row.slug),
          siloId: texto(row.siloId),
          hierarchy: texto(row.hierarchy),
          siloRole: papelNoSilo.get(articleId) ?? null,
          journeyStage: texto(row.journeyStage),
          mainIntent: texto(row.mainIntent),
          principalKeyword: principalId ? principais.get(principalId) ?? null : null,
          workflowState: estadoPorArtigo.get(articleId) ?? null,
          canonical: texto(row.canonical),
        };
      }),
      silos: silosDoRecorte(silosAtuais).slice(0, TETO.silos).map(row => {
        const siloId = texto(row.siloId) || String(row.entity_id);
        const pagina = paginaPorSilo.get(siloId);
        return {
          siloId,
          name: texto(row.name) || siloId,
          pillarArticleId: texto(row.pillarArticleId),
          supportArticleIds: Array.isArray(row.supportArticleIds) ? (row.supportArticleIds as unknown[]).map(String) : [],
          formationStatus: texto(row.formationStatus),
          page: pagina ? {
            slug: texto(pagina.slug),
            h1: texto(pagina.h1),
            publicationStatus: texto(pagina.publicationStatus),
            publishedUrl: texto(pagina.publishedUrl),
          } : null,
        };
      }),
    },
    radar: {
      // O parser tipado do supabase-js não lê o índice -1; o PostgREST lê (conferido em 2026-09-26).
      items: radarDoRecorte.map(row => {
        const articleId = String(row.subject_id);
        // A precedência Amazon > YouTube > Google é a da casa: remonta os carimbos e pergunta a ela.
        const finalizedAt = radarFrozenObservedAtOfAnalysis({
          ...(texto(row.amz) ? { amazonFrozenInvestigation: { finalizedAt: row.amz } } : {}),
          ...(texto(row.yt) ? { youtubeFrozenInvestigation: { finalizedAt: row.yt } } : {}),
          ...(texto(row.gg) ? { finalizedBundle: { frozenAt: row.gg } } : {}),
        });
        const hasDocument = ((documentos.data || []) as Row[]).some(doc => texto(doc.article_id) === articleId);
        /* 2026-10-13 · F5 (SDD acelerar-fluxo, item 14): o item atrás de uma versão aprovada mais nova do ArticleDNA. */
        const transportada = artigosRows.rows.find(versao => texto(versao.version_id) === texto(row.transported));
        const aprovada = ultimaAprovadaPorArtigo.get(articleId);
        const architectUpdate = transportada && aprovada && aprovada.version_id !== transportada.version_id && Number(aprovada.version_number) > Number(transportada.version_number)
          ? { label: radarArchitectUpdateLabel(Number(transportada.version_number), Number(aprovada.version_number)), fromVersionNumber: Number(transportada.version_number), toVersionNumber: Number(aprovada.version_number), howToAdopt: "adopt_architect_version (mode=preview) ou, na tela, Radar → 'Ver e adotar'" }
          : null;
        return { articleId, state: String(row.state), finalizedAt, hasDocument, architectUpdate, linksUpdate: linksUpdateDe(row) };
      }),
    },
    redator: {
      documents: ((documentos.data || []) as Row[]).map(row => ({
        documentId: String(row.id),
        articleId: texto(row.article_id),
        title: texto(row.title) || String(row.id),
        status: texto(row.status) || "desconhecido",
      })),
    },
    published: {
      total: totalPublicados,
      pages: ((publicados.data || []) as Row[]).map(row => ({
        url: String(row.normalized_url),
        title: texto(row.title),
        h1: texto(row.h1),
        pageType: texto(row.page_type),
      })),
    },
    truncated,
    readAt: new Date().toISOString(),
    ...(recorte ? {
      group: {
        choice: recorte.kind === "none" ? "sem-grupo" : recorte.color,
        description: recorte.description,
        groups: recorte.kind === "none" ? [] : recorte.groups.map(item => ({ groupId: item.groupId, color: item.color, colorLabel: item.colorLabel, name: item.name, text: item.text })),
      },
    } : {}),
  };
}

/**
 * Todas as páginas publicadas — só URL e títulos —, para a busca de tema e a
 * colisão de slug olharem o site inteiro e não só a amostra do retrato.
 */
export async function readPublishedPagesForMatching(brandId: string): Promise<Array<{ url: string; title: string | null; h1: string | null }>> {
  const db = getOperationalClient();
  const { rows } = await paginar((from, to) => db.from("brand_site_catalog_entries")
    .select("normalized_url,title,h1").eq("marca_id", brandId).eq("presence_state", "present").is("ignored_at", null)
    .order("normalized_url").range(from, to), TETO.publicadosSlugs);
  return rows.map(row => ({ url: String(row.normalized_url), title: texto(row.title), h1: texto(row.h1) }));
}

/** Os candidatos da busca de tema, montados do retrato e do site inteiro. */
export function topicCandidatesFrom(state: PlatformStateSnapshot, published: ReadonlyArray<{ url: string; title: string | null; h1: string | null }>): TopicCandidate[] {
  const candidatos: TopicCandidate[] = [];
  for (const subject of state.minerador.subjects) {
    candidatos.push({ kind: "subject", id: subject.keywordId, text: subject.keyword, where: `Minerador · Assunto · ${subject.status}`, extra: { note: subject.note } });
  }
  const siloDoArtigo = new Map<string, string>();
  for (const silo of state.arquiteto.silos) {
    candidatos.push({ kind: "silo", id: silo.siloId, text: silo.name, where: `Arquiteto · Silo · ${silo.formationStatus ?? "sem status"}`, extra: { pillarArticleId: silo.pillarArticleId, articles: 1 + silo.supportArticleIds.length } });
    if (silo.page?.h1 || silo.page?.slug) {
      candidatos.push({ kind: "silo_page", id: silo.siloId, text: silo.page.h1 || (silo.page.slug ?? "").replace(/-/g, " "), where: `Arquiteto · Página do silo "${silo.name}"`, extra: { slug: silo.page.slug } });
    }
    for (const id of [silo.pillarArticleId, ...silo.supportArticleIds]) if (id) siloDoArtigo.set(id, silo.name);
  }
  for (const article of state.arquiteto.articles) {
    const silo = siloDoArtigo.get(article.articleId);
    candidatos.push({
      kind: "article", id: article.articleId,
      text: [article.promise, article.principalKeyword].filter(Boolean).join(" · "),
      where: [
        `Arquiteto · ${article.siloRole ?? article.hierarchy ?? "artigo"}${silo ? ` do silo "${silo}"` : ""}`,
        article.siloRole && article.hierarchy && article.siloRole !== article.hierarchy ? `(o ArticleDNA diz ${article.hierarchy})` : null,
        article.workflowState ?? "sem status",
      ].filter(Boolean).join(" · "),
      extra: { slug: article.slug, principalKeyword: article.principalKeyword },
    });
  }
  for (const page of published) {
    const text = [page.title, page.h1].filter(Boolean).join(" · ");
    if (text) candidatos.push({ kind: "published_page", id: page.url, text, where: "Publicado no site", extra: { url: page.url } });
  }
  return candidatos;
}
