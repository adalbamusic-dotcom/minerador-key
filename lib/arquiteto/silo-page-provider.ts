import type { SiloPage } from "./contracts.ts";

const recordOf = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const list = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim())
  : typeof value === "string" ? value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) : undefined;

const first = (source: Record<string, unknown>, keys: string[]) => keys.map(key => source[key]).find(value => value !== undefined);

function unwrap(value: unknown): { source: Record<string, unknown>; wrapped: boolean } {
  const root = recordOf(value) || {};
  for (const key of ["siloPage", "silo_page", "page", "dna", "payload", "result", "data"]) {
    const candidate = recordOf(root[key]);
    if (candidate) return { source: candidate, wrapped: true };
  }
  return { source: root, wrapped: false };
}

const confidence = (value: unknown) => {
  const numeric = typeof value === "string" ? Number(value.replace(",", ".").replace("%", "")) : value;
  if (typeof numeric !== "number" || Number.isNaN(numeric)) return undefined;
  return numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
};

type SiloPageSectionInput = { id: string; heading: string; objective: string; linkedArticleIds: string[] };
type SiloPageBreadcrumbInput = { label: string; slug: string };

function sections(value: unknown): SiloPageSectionInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: SiloPageSectionInput[] = [];
  for (const item of value) {
    const record = recordOf(item);
    if (!record) continue;
    const id = text(first(record, ["id", "sectionId", "section_id"])) || `section:${parsed.length + 1}`;
    const heading = text(first(record, ["heading", "h2", "titulo", "title"]));
    const objective = text(first(record, ["objective", "objetivo"]));
    const linkedArticleIds = list(first(record, ["linkedArticleIds", "linked_article_ids", "artigos", "articles"])) || [];
    if (heading) parsed.push({ id, heading, objective: objective || `Cobrir ${heading}`, linkedArticleIds });
  }
  return parsed.length ? parsed : undefined;
}

function breadcrumbs(value: unknown): SiloPageBreadcrumbInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: SiloPageBreadcrumbInput[] = [];
  for (const item of value) {
    const record = recordOf(item);
    if (!record) continue;
    const label = text(first(record, ["label", "nome", "name"]));
    const slug = text(first(record, ["slug", "url"]));
    if (label && slug !== undefined) parsed.push({ label, slug: slug || "" });
  }
  return parsed.length ? parsed : undefined;
}

export function normalizeSiloPageProviderPayload(value: unknown): { payload: Partial<SiloPage>; warnings: string[] } {
  const { source, wrapped } = unwrap(value);
  const payload: Partial<SiloPage> = {};
  const assignText = (key: keyof SiloPage, aliases: string[]) => { const value = text(first(source, aliases)); if (value !== undefined) Object.assign(payload, { [key]: value }); };
  const assignList = (key: keyof SiloPage, aliases: string[]) => { const value = list(first(source, aliases)); if (value !== undefined) Object.assign(payload, { [key]: value }); };

  assignText("slug", ["slug", "slug_sugerido"]);
  assignText("h1", ["h1", "heading", "titulo", "title"]);
  assignText("seoTitle", ["seoTitle", "seo_title", "tituloSeo", "titulo_seo", "metaTitle", "meta_title"]);
  assignText("metaDescription", ["metaDescription", "meta_description", "metaDescricao", "meta_descricao"]);
  assignText("intro", ["intro", "introducao", "introduction", "textoIntro", "texto_intro"]);
  assignText("cta", ["cta", "chamadaParaAcao", "chamada_para_acao"]);
  assignText("coverImageBrief", ["coverImageBrief", "cover_image_brief", "imagemCapa", "imagem_capa"]);
  assignText("visualBriefing", ["visualBriefing", "visual_briefing", "briefingVisual", "briefing_visual"]);

  const secs = sections(first(source, ["sections", "secoes", "secao"]));
  if (secs) payload.sections = secs;
  const crumbs = breadcrumbs(first(source, ["breadcrumbs", "migalhas", "breadcrumb"]));
  if (crumbs) payload.breadcrumbs = crumbs;

  assignList("supportArticleIds", ["supportArticleIds", "support_article_ids", "suportes", "suporte"]);
  assignList("humanPendingDecisions", ["humanPendingDecisions", "human_pending_decisions", "humanDecisionPoints", "pendenciasHumanas"]);

  const canonical = first(source, ["canonical", "urlCanonical", "url_canonical"]);
  if (canonical === null || canonical === "") payload.canonical = null;
  else if (text(canonical)) payload.canonical = text(canonical)!;

  const indexation = text(first(source, ["indexationStatus", "indexation_status", "indexacao"]));
  if (indexation === "noindex" || indexation === "index") payload.indexationStatus = indexation as "noindex" | "index";

  const normalizedConfidence = confidence(first(source, ["confidence", "confianca"]));
  if (normalizedConfidence !== undefined) payload.confidence = normalizedConfidence;

  return { payload, warnings: wrapped ? ["Envelope siloPage da IA normalizado pelo servidor."] : [] };
}