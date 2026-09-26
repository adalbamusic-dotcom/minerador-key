import "server-only";
import { PLATFORM_STAGES, type PlatformStage } from "@/lib/agent/platform-catalog";
import type { PlatformStateSnapshot } from "@/lib/agent/platform-state-model";
import type { TopicCandidate } from "@/lib/agent/topic-match";
import { resolveEditorialKeywordStatus } from "@/lib/minerador/editorial-status";
import { buildTenantPath } from "@/lib/tenant-routing";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
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

export async function readPlatformState(brandId: string): Promise<PlatformStateSnapshot> {
  const db = getOperationalClient();
  const truncated: string[] = [];

  /* ---- Marca ---- */
  const marca = await db.from("marcas").select("id,nome,site_url,nicho").eq("id", brandId).maybeSingle();
  if (marca.error) mapPersistenceError(marca.error);
  const brandRow = (marca.data || {}) as Row;
  const brandName = texto(brandRow.nome) || "Marca";

  /* ---- Minerador ---- */
  const keywords = await paginar((from, to) => db.from("minerador_keywords")
    .select("id,status").eq("brand_id", brandId).is("deleted_at", null).order("id").range(from, to), TETO.keywordsLidas);
  if (keywords.cortado) truncated.push(`minerador: contadas as primeiras ${TETO.keywordsLidas} keywords`);
  const byStatus: Record<string, number> = {};
  const aprovadas: string[] = [];
  for (const row of keywords.rows) {
    const resolved = resolveEditorialKeywordStatus(row.status);
    const status = resolved.status ?? "desconhecido";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === "aprovado") aprovadas.push(String(row.id));
  }

  const assuntos = await db.from("minerador_keywords")
    .select("id,keyword,status,subject:analise_semantica->keyword_subject")
    .eq("brand_id", brandId).is("deleted_at", null)
    .filter("analise_semantica->keyword_subject->>declared", "eq", "true")
    .order("keyword").limit(TETO.assuntos + 1);
  if (assuntos.error) mapPersistenceError(assuntos.error);
  const assuntoRows = (assuntos.data || []) as Row[];
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
    .select("entity_id,version_number,articleId:payload->>articleId,promise:payload->>promise,slug:payload->>suggestedSlug,siloId:payload->>siloId,hierarchy:payload->>hierarchy,journeyStage:payload->>journeyStage,mainIntent:payload->>mainIntent,principalKeywordId:payload->>principalKeywordId,canonical:payload->>canonical")
    .eq("marca_id", brandId).eq("artifact_type", "article_dna").order("entity_id").range(from, to), TETO.artigos * 20);
  const artigos = ultimaPorEntidade(artigosRows.rows).slice(0, TETO.artigos);
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
  const radar = await db.from("editorial_workflow_items")
    .select("subject_id,state").eq("marca_id", brandId).eq("stage", "radar").eq("subject_type", "article").limit(TETO.artigos);
  if (radar.error) mapPersistenceError(radar.error);

  const documentos = await db.from("content_documents")
    .select("id,article_id,title,status:payload->>status").eq("marca_id", brandId).order("updated_at", { ascending: false }).limit(TETO.documentos);
  if (documentos.error) mapPersistenceError(documentos.error);

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
      silos: silosAtuais.slice(0, TETO.silos).map(row => {
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
      items: ((radar.data || []) as Row[]).map(row => ({ articleId: String(row.subject_id), state: String(row.state) })),
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
