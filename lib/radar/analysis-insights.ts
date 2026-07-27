import type { RadarExtractionPage, RadarSemanticTerm } from "./analysis-contracts.ts";

export type RadarExtractionFormat = "article_editorial" | "service_page" | "category" | "video" | "social" | "directory" | "marketplace" | "other";
export type RadarSemanticGroup = "content" | "navigation" | "legal" | "platform";

const normalize = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function classifyRadarExtractionFormat(page: Pick<RadarExtractionPage, "url" | "title" | "h1" | "structuredDataTypes">): RadarExtractionFormat {
  let url: URL | null = null;
  try { url = new URL(page.url); } catch { /* schema validation handles malformed URLs */ }
  const host = normalize(url?.hostname || "");
  const path = normalize(url?.pathname || "");
  const text = normalize([page.title, ...page.h1, ...page.structuredDataTypes].join(" "));
  if (/youtube|youtu\.be|vimeo|tiktok/.test(host) || /video|videoobject/.test(text)) return "video";
  if (/instagram|facebook|linkedin|pinterest|x\.com|twitter/.test(host)) return "social";
  if (/mercadolivre|amazon|shopee|magalu|shopify/.test(host) || /comprar|produto|preco|oferta/.test(text)) return "marketplace";
  if (/diretorio|directory|guias-locais|listagem/.test(path) || /diretorio|directory/.test(text)) return "directory";
  if (/categoria|category|tag\//.test(path)) return "category";
  if (/servico|services|consultoria|orcamento/.test(path) || /service|servicepage|consultoria/.test(text)) return "service_page";
  if (/article|blogposting|newsarticle/.test(text) || /blog|artigo|post|guia|tutorial/.test(path)) return "article_editorial";
  return page.h1.length ? "article_editorial" : "other";
}

export function isComparableRadarExtraction(page: RadarExtractionPage) {
  return page.status === "success" && classifyRadarExtractionFormat(page) === "article_editorial";
}

export function summarizeRadarExtractionFormats(pages: RadarExtractionPage[]) {
  const counts = pages.reduce<Record<RadarExtractionFormat, number>>((result, page) => {
    const format = classifyRadarExtractionFormat(page);
    result[format] = (result[format] || 0) + 1;
    return result;
  }, { article_editorial: 0, service_page: 0, category: 0, video: 0, social: 0, directory: 0, marketplace: 0, other: 0 });
  return {
    counts,
    comparable: pages.filter(isComparableRadarExtraction).length,
    partial: pages.filter(page => page.status === "partial").length,
    failed: pages.filter(page => ["blocked", "timeout", "invalid_html", "unsupported", "failed"].includes(page.status)).length,
  };
}

const legalTerms = new Set(["privacidade", "privacidade", "direitos", "autorais", "copyright", "politica", "termos", "contato", "seguranca", "cookies", "lgpd"]);
const navigationTerms = new Set(["menu", "inicio", "home", "buscar", "pesquisar", "navegacao", "proximo", "anterior", "categoria", "categorias", "sitemap", "entrar", "login", "voltar"]);
const platformTerms = new Set(["youtube", "inscreva", "inscrever", "canal", "comentarios", "compartilhar", "instagram", "facebook", "video", "videos", "publicidade", "anuncio", "desenvolvedores", "playback"]);

export function classifyRadarSemanticTerm(term: Pick<RadarSemanticTerm, "term" | "sources">): RadarSemanticGroup {
  const normalized = normalize(term.term).trim();
  if (platformTerms.has(normalized) || /youtube|instagram|facebook|widget|embed|player/.test(normalized)) return "platform";
  if (legalTerms.has(normalized) || /privacidade|direito|autor|politica|termo|cookie|seguranca|contato/.test(normalized)) return "legal";
  if (navigationTerms.has(normalized) || /menu|naveg|buscar|login|sitemap|rodape|cabecalho/.test(normalized)) return "navigation";
  return "content";
}

export function isPrimaryRadarSemanticTerm(term: RadarSemanticTerm) {
  return term.decision === "include_topic" || term.decision === "support_term" || (term.decision !== "ignore" && classifyRadarSemanticTerm(term) === "content");
}

export function summarizeRadarSemantics(terms: RadarSemanticTerm[]) {
  const summary = { relevant: 0, navigation: 0, legal: 0, platform: 0, otherIgnored: 0 };
  for (const term of terms) {
    const group = classifyRadarSemanticTerm(term);
    if (isPrimaryRadarSemanticTerm(term)) summary.relevant += 1;
    else if (group === "navigation") summary.navigation += 1;
    else if (group === "legal") summary.legal += 1;
    else if (group === "platform") summary.platform += 1;
    else summary.otherIgnored += 1;
  }
  return summary;
}

export function semanticGroupLabel(group: RadarSemanticGroup) {
  return group === "content" ? "Conteúdo principal" : group === "navigation" ? "Navegação/interface" : group === "legal" ? "Rodapé/legal" : "Ruído de plataforma";
}

export function extractionFormatLabel(format: RadarExtractionFormat) {
  return ({ article_editorial: "Artigo editorial", service_page: "Página de serviço", category: "Categoria", video: "Vídeo", social: "Rede social", directory: "Diretório", marketplace: "Marketplace", other: "Outro" } as const)[format];
}
