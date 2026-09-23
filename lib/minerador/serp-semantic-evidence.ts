/**
 * Evidência semântica derivada da SERP orgânica da keyword natural.
 *
 * A leitura mede duas coisas separadas e nunca as confunde:
 *
 *   COBERTURA   quantos resultados observados conseguimos interpretar
 *   DOMINÂNCIA  entre os interpretados, quanto o padrão do topo domina
 *
 * Dominância alta sobre cobertura baixa **não** é evidência conclusiva — é
 * classificador cego. Por isso a força exige as duas coisas, mais os sinais
 * estruturais da SERP (preço, produto, PAA, vídeo…).
 *
 * Intenção e Funil são eixos independentes: cada um conta os próprios sinais.
 * Esta camada não conhece Volume, Resultado nem KGR, e nunca usa o
 * `main_intent` do DataForSEO Labs como conclusão. O `ai_overview` é observado
 * como feature da SERP, jamais como fonte factual ou verdade editorial.
 *
 * Derivação v4 (adendo `docs/03-minerador/propostas/adendo-derivacao-v4-
 * quatro-lentes-2026-09-23.md`, seção 2). Os limiares não mudaram; mudou o
 * que conta como leitura de UM resultado (`classifyOrganicItem`):
 *
 *   R1  termo casa só como palavra inteira
 *   R2  placar por campo — título 2, descrição/pre/extended/breadcrumb 1;
 *       URL e nome do site 0 (invariante 13), inclusive quando o breadcrumb
 *       os repete; o placar fica na amostra
 *   R4  conteúdo publicado em rede social não é perfil nem produto
 *   R5  varejista do bloco de produtos da MESMA SERP, por igualdade exata
 *   R6  título de lista ("3 passos…") é Informativa/TOFU
 *   R7  pesos novos de bloco
 *   R8  a mesma URL conta uma vez
 *
 * Nas QUATRO lentes (mesmo adendo, §3): `deriveSerpSemanticEvidenceAcrossLenses`
 * lê a canônica pelo corpo (20) e as outras três pelo digest orgânico (10),
 * une os orgânicos por URL e registra, sem transformar em força, a concordância
 * entre lentes e a divergência entre desktop e mobile.
 */

import {
  SERP_CACHE_LENSES,
  buildSerpOrganicDigest,
  serpCacheLensLabel,
  type SerpOrganicDigest,
} from "../editorial/serp-cache.ts";

export type SerpEvidenceStrength = "conclusive" | "mixed" | "weak" | "insufficient";

export type SerpSemanticSignal = {
  /** Rótulo canônico do Minerador para a leitura observada. */
  value: string | null;
  strength: SerpEvidenceStrength;
  /** Resultados que sustentam a leitura dominante. */
  supporting: number;
  /** Resultados relevantes observados (denominador da cobertura). */
  observed: number;
  /** Resultados que receberam alguma leitura (denominador da dominância). */
  classified: number;
  /** classified / observed — o quanto a SERP foi realmente interpretada. */
  coverage: number;
  /** supporting / classified — o quanto o topo domina entre os interpretados. */
  dominance: number;
  /** Contagem por rótulo, para auditoria da decisão. */
  distribution: Array<{ label: string; count: number }>;
  /** Blocos e campos da SERP que reforçaram esta leitura. */
  structuralSignals: Array<{ signal: string; label: string; weight: number }>;
};

/** Placar do texto de um resultado (R2): pontos por rótulo, em cada eixo. */
export type SerpTextScore = {
  intent: Record<string, number>;
  funnel: Record<string, number>;
};

/**
 * Um orgânico DISTINTO da amostra, com a leitura e o porquê.
 *
 * Os campos marcados v4 são aditivos: amostras gravadas até a v3 não os têm e
 * continuam válidas.
 */
export type SerpSemanticSampleItem = {
  position: number;
  domain: string;
  intent: string;
  funnel: string;
  signals: string[];
  /** v4 · Chave da R8 (host sem `www` + caminho). Ausente quando a URL não foi legível. */
  urlKey?: string;
  /** v4 · Variantes da mesma URL que a R8 deixou de contar. Só aparece quando houve. */
  duplicates?: number;
  /**
   * v4 · O placar do texto que decidiu (R2). Vazio quando o texto não pontuou:
   * a leitura, se houve, veio de um dos `signals`.
   */
  score?: SerpTextScore;
  /**
   * 4 lentes · Máscara das lentes em que a URL apareceu: o bit `i` é a lente
   * `i` de `SerpSemanticEvidence.lenses` (desktop-windows = 1, desktop-macos =
   * 2, mobile-android = 4, mobile-ios = 8). Só na evidência das quatro lentes.
   */
  lenses?: number;
};

/** Por que uma lente não entrou na derivação. */
export type SerpLensMissingReason =
  /** Não paga nesta execução: quota, cache ilegível, alvo fora do plano. */
  | "not_collected"
  /** Paga e recusada, ou o provider não respondeu. */
  | "collection_failed"
  /** A SERP da lente veio sem nenhum orgânico. */
  | "no_organic"
  /** Entrada do cache anterior ao digest: vale para a cobertura, não para a leitura. */
  | "missing_digest"
  /** O digest é de outra consulta. */
  | "other_query"
  /**
   * A evidência SERP da keyword foi invalidada por decisão humana: a lente que
   * veio do cache é da coleta recusada e não entra na leitura que responde à
   * invalidação. Lente paga nesta execução entra normalmente.
   */
  | "evidence_invalidated";

export const SERP_LENS_MISSING_REASONS: readonly SerpLensMissingReason[] = ["not_collected", "collection_failed", "no_organic", "missing_digest", "other_query", "evidence_invalidated"];

/** A leitura de um eixo em UMA lente, no top 10 dela. Valores arredondados a 3 casas. */
export type SerpLensAxisReading = {
  value: string | null;
  strength: SerpEvidenceStrength;
  /** O rótulo que lidera a distribuição, mesmo sem concluir; `null` no empate. */
  leading: string | null;
  coverage: number;
  dominance: number;
};

export type SerpLensReading = {
  lens: string;
  collectedAt: string;
  providerRequestId: string | null;
  /** Quem pagou a coleta (o Minerador pode ler entrada paga por outro módulo da marca). */
  collectedBy: string | null;
  /** Orgânicos distintos no top 10 da lente. */
  observed: number;
  intent: SerpLensAxisReading;
  funnel: SerpLensAxisReading;
};

/** Quantas lentes lideram com o mesmo rótulo do agregado. Registro, NUNCA reforço. */
export type SerpLensAgreement = { label: string | null; agreeing: number; of: number };

export type SerpLensDeviceSplit = { desktop: string; mobile: string };

export const SERP_LENS_EVIDENCE_VERSION = "serp-lens-evidence-v1" as const;
/** Lentes coletadas com mais que isto de diferença são marcadas; a recoleta é do usuário. */
export const SERP_LENS_DATE_SPREAD_MS = 7 * 24 * 60 * 60 * 1000;

export type SerpLensEvidence = {
  version: typeof SERP_LENS_EVIDENCE_VERSION;
  readings: SerpLensReading[];
  lensesMissing: Array<{ lens: string; reason: SerpLensMissingReason }>;
  agreement: { intent: SerpLensAgreement; funnel: SerpLensAgreement };
  /** Preenchido só quando o agregado desktop e o mobile lideram com rótulos diferentes. */
  deviceSplit: { intent: SerpLensDeviceSplit | null; funnel: SerpLensDeviceSplit | null };
  /** Blocos que NÃO aparecem em todas as lentes lidas, com a máscara: "Shopping só no mobile". */
  blocks: Array<{ type: string; lenses: number }>;
  /** URLs lidas com rótulos diferentes por lentes diferentes. */
  labelConflicts: { intent: number; funnel: number };
  dates: { oldest: string; newest: string; divergent: boolean };
};

export type SerpSemanticEvidence = {
  query: string;
  collectedAt: string;
  provider: "dataforseo";
  providerRequestId: string | null;
  operationRequestId: string;
  locationCode: number;
  languageCode: string;
  device: "desktop" | "mobile";
  observedResults: number;
  /** Blocos de feature presentes na SERP, com contagem. */
  serpFeatures: Array<{ type: string; count: number }>;
  intent: SerpSemanticSignal;
  funnel: SerpSemanticSignal;
  /**
   * Amostra para auditoria humana; nunca o payload bruto. Desde a v4 são TODOS
   * os orgânicos distintos — o denominador inteiro —, e não só os 12 primeiros.
   */
  sample: SerpSemanticSampleItem[];
  /** 4 lentes · A matriz pedida, na ordem das máscaras. `device` continua `desktop`. */
  lenses?: string[];
  /** 4 lentes · Leitura por lente, concordância, aparelhos, faltas e datas. */
  lensEvidence?: SerpLensEvidence;
};

type JsonObject = Record<string, unknown>;

const DIACRITICS = /[̀-ͯ]/g;

function asRecord(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(DIACRITICS, "");
}

/** Sinais observáveis de intenção no texto de cada resultado. */
const INTENT_MARKERS: Array<{ label: string; terms: string[] }> = [
  { label: "Local", terms: ["perto de mim", "clinica", "endereco", "agendar", "unidades", "atendimento em", "onde comprar"] },
  { label: "Transacional", terms: ["comprar", "preco", "loja", "frete", "carrinho", "desconto", "cupom", "promocao", "assine", "kit ", "oferta"] },
  { label: "Comercial", terms: ["melhor", "melhores", "review", "resenha", "comparativo", "vale a pena", "ranking", "testamos", "vs ", "qual escolher"] },
  { label: "Informativa", terms: ["como", "o que e", "por que", "guia", "passo a passo", "para que serve", "beneficios", "dicas", "tudo sobre", "significa", "rotina", "receita", "entenda", "conceito", "definicao", "aplicacoes", "funciona", "saiba"] },
];

/** Sinais próprios do Funil. Não existe herança automática da Intenção. */
const FUNNEL_MARKERS: Array<{ label: string; terms: string[] }> = [
  { label: "BOFU", terms: ["comprar", "preco", "orcamento", "agendar", "contratar", "assine", "frete", "cupom", "fale com", "kit ", "oferta"] },
  { label: "MOFU", terms: ["melhor", "melhores", "comparativo", "review", "resenha", "vale a pena", "alternativas", "qual escolher", "diferenca entre", "antes e depois"] },
  { label: "TOFU", terms: ["o que e", "como", "por que", "guia", "passo a passo", "para que serve", "beneficios", "tipos de", "significa", "rotina", "entenda", "conceito", "definicao", "aplicacoes", "funciona", "saiba"] },
];

type CompiledMarkers = Array<{ label: string; patterns: RegExp[] }>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * R1 — palavra inteira. O termo só casa cercado de fronteira de palavra depois
 * da normalização: "melhor" não casa dentro de "melhorar", e "kit " (que levava
 * o espaço para não casar dentro de outra palavra) vira "kit" inteiro.
 */
function compileMarkers(markers: Array<{ label: string; terms: string[] }>): CompiledMarkers {
  return markers.map(marker => ({
    label: marker.label,
    // Plural simples (s/es) continua casando, como casava na v3 por substring:
    // "precos", "reviews", "ofertas". Termo que a v3 já escrevia exato, com
    // espaço no fim ("kit ", "vs "), segue exato: "kits" não vira "kit".
    patterns: marker.terms.map(term => new RegExp(`(?<![a-z0-9])${escapeRegExp(normalize(term).trim())}${term.endsWith(" ") ? "" : "(?:e?s)?"}(?![a-z0-9])`)),
  }));
}

const INTENT_PATTERNS = compileMarkers(INTENT_MARKERS);
const FUNNEL_PATTERNS = compileMarkers(FUNNEL_MARKERS);

/**
 * R2 — placar por campo, no lugar de "o primeiro marcador que casa vence".
 *
 * Cada campo vota UMA vez em cada rótulo que contém, com o peso do campo: um
 * snippet que repete o mesmo tipo de termo não compra peso extra. A URL e o
 * nome do site ficam de fora (peso 0): intenção não se promove por endereço
 * nem por marca (invariante 13). A URL continua valendo só pelos sinais
 * estruturais abaixo, cada um registrado em `signals`.
 */
const TEXT_FIELDS: ReadonlyArray<{ weight: number; read: (item: JsonObject) => string }> = [
  { weight: 2, read: item => text(item.title) },
  // A mesma leitura da v3: o snippet só entra quando não há descrição.
  { weight: 1, read: item => text(item.description) || text(item.snippet) },
  { weight: 1, read: item => text(item.pre_snippet) },
  { weight: 1, read: item => text(item.extended_snippet) },
  { weight: 1, read: breadcrumbLabels },
];

/**
 * O breadcrumb do DataForSEO no desktop é, quase sempre, o próprio endereço
 * renderizado: "https://www.site.com.br › slug-da-pagina › ordem...". Lido
 * inteiro, ele devolvia ao placar o host e o slug que a R2 zera (invariante
 * 13). Só pontuam os rótulos humanos de navegação ("Home › Rotina de Beleza").
 * Saem, na dúvida sempre para fora:
 *   - o segmento com forma de endereço ou de slug: sem espaço e com `-`, `_`,
 *     `=`, `.` ou `/` (a origem `https://www.site.com.br` inclusive);
 *   - o segmento igual a um segmento do caminho da URL do item, ou prefixo dele
 *     quando o provider o truncou com reticências.
 */
const BREADCRUMB_SEPARATOR = /\s*›\s*/;
const BREADCRUMB_TRUNCATION = /(?:\.\.\.|…)$/;
const SLUG_CHARACTER = /[-_=./]/;
const WHITESPACE = /\s/;

function urlPathSegments(url: string): string[] {
  const parsed = parseUrl(url);
  if (!parsed) return [];
  return parsed.pathname.split("/").filter(Boolean).map(segment => {
    try {
      return normalize(decodeURIComponent(segment));
    } catch {
      return normalize(segment);
    }
  });
}

function breadcrumbLabels(item: JsonObject): string {
  const raw = text(item.breadcrumb);
  if (!raw) return "";
  const pathSegments = urlPathSegments(text(item.url));
  return raw.split(BREADCRUMB_SEPARATOR).filter(segment => {
    const folded = normalize(segment).trim();
    const truncated = BREADCRUMB_TRUNCATION.test(folded);
    const stem = folded.replace(BREADCRUMB_TRUNCATION, "").trim();
    // A origem (`https://www.site.com.br`, `site.com.br`) também tem essa forma.
    if (!WHITESPACE.test(stem) && SLUG_CHARACTER.test(stem)) return false;
    return !pathSegments.some(path => truncated ? path.startsWith(stem) : path === stem);
  }).join(" › ");
}

function scoreFields(markers: CompiledMarkers, fields: Array<{ value: string; weight: number }>): Record<string, number> {
  const points: Record<string, number> = {};
  for (const marker of markers) {
    let total = 0;
    for (const field of fields) if (marker.patterns.some(pattern => pattern.test(field.value))) total += field.weight;
    if (total > 0) points[marker.label] = total;
  }
  return points;
}

/** Maior placar vence. Empate segue a ordem da lista: Local > Transacional > Comercial > Informativa; BOFU > MOFU > TOFU. */
function decideByScore(markers: CompiledMarkers, points: Record<string, number>): string | null {
  let best: string | null = null;
  let bestPoints = 0;
  for (const marker of markers) {
    const value = points[marker.label] || 0;
    if (value > bestPoints) {
      best = marker.label;
      bestPoints = value;
    }
  }
  return best;
}

/** Padrões de URL que denunciam página de produto/loja. */
const PRODUCT_URL = /\/(produto|produtos|p|item|comprar|loja|shop|store|catalogo)\//i;
const EDITORIAL_URL = /\/(blog|artigo|artigos|noticia|noticias|guia|guias|dicas|tutorial|conteudo|magazine|revista|post|posts)\//i;

/**
 * Editorial também mora no SUBDOMÍNIO.
 *
 * `EDITORIAL_URL` só olhava o caminho, então `blog.exemplo.com.br/cnc/` passava
 * batido enquanto `exemplo.com.br/blog/cnc/` era reconhecido. É a mesma página
 * de blog, endereçada de outro jeito.
 */
const EDITORIAL_HOST = /^https?:\/\/(?:www\.)?(?:blog|noticias|revista|magazine)\./i;

/**
 * Referência enciclopédica é informativa por definição. Não há leitura
 * comercial possível de uma entrada de dicionário ou de enciclopédia.
 */
const REFERENCE_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:wikipedia\.org|wikiwand\.com|britannica\.com|dicio\.com\.br|significados\.com\.br|michaelis\.uol\.com\.br|priberam\.org)\//i;

/**
 * Perfil em rede social é presença de marca: quem chega ali estava navegando
 * até alguém, não pesquisando uma necessidade. O eixo Funil fica de fora — um
 * perfil não coloca o leitor em etapa nenhuma da jornada.
 */
const SOCIAL_PROFILE_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:instagram\.com|facebook\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com|threads\.net|reclameaqui\.com\.br)\//i;

/**
 * R4 — conteúdo publicado DENTRO da rede social não é perfil nem página de
 * produto. `instagram.com/reel/…` e `instagram.com/p/…` são posts: o `/p/`
 * casava com a URL de produto e o resto virava "perfil". O item cai na
 * leitura de texto como qualquer outro resultado. Lista fechada de segmentos.
 */
const SOCIAL_CONTENT_SEGMENTS: ReadonlySet<string> = new Set(["reel", "reels", "p", "tv", "video", "watch", "posts", "pulse", "status", "shorts"]);

function parseUrl(url: string): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isSocialContentPath(url: string): boolean {
  const parsed = parseUrl(url);
  return Boolean(parsed && parsed.pathname.toLowerCase().split("/").some(segment => SOCIAL_CONTENT_SEGMENTS.has(segment)));
}

/**
 * Raiz de domínio ranqueando para o termo é sinal de navegação até a marca.
 * É o sinal mais fraco do conjunto e só entra quando nada mais classificou.
 */
function isRootUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return false;
  }
}

/**
 * R6 — título que COMEÇA com número seguido de substantivo de lista ("3 passos
 * para…", "7 erros que…") é conteúdo explicativo. Lista fechada: ampliar o
 * vocabulário é decisão do usuário.
 */
const LIST_TITLE = /^\d{1,2}\s+(?:passos|dicas|erros|etapas|formas|maneiras|motivos|cuidados)(?![a-z0-9])/;

/**
 * R8 — a mesma página conta uma vez.
 *
 * Chave: host sem `www` + caminho sem barra final. A query não entra —
 * `srsltid`, `utm_*` e afins mudam a cada pedido e não mudam a página.
 * Exceção fechada, por host e por caminho: no `/watch` do YouTube e do
 * Facebook, o parâmetro `v` É a página. Sem ele, dois vídeos diferentes da
 * mesma SERP viravam um só, e a leitura do segundo sumia do denominador. Em
 * qualquer outro host ou caminho, `?v=` é query como outra qualquer.
 * (Desvio do texto literal do adendo, a registrar como revisão dele.)
 */
const VIDEO_PAGE_HOST = /(?:^|\.)(?:youtube\.com|facebook\.com)$/;

export function serpResultUrlKey(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");
  const video = VIDEO_PAGE_HOST.test(host) && path === "/watch" ? parsed.searchParams.get("v") : null;
  return `${host}${path}${video ? `?v=${video}` : ""}`;
}

/**
 * R5 — varejista no bloco de produtos. Normalização FECHADA, a mesma dos dois
 * lados: minúsculas, sem acento, só letras e dígitos; texto com forma de
 * domínio (`mercadolivre.com.br`) vira o nome do domínio registrável
 * (`mercadolivre`). A comparação é IGUALDADE — nunca "contém" —, e chave com
 * menos de 3 caracteres não casa com nada.
 */
const TWO_LEVEL_PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  "com.br", "net.br", "org.br", "gov.br", "edu.br", "art.br", "blog.br", "eco.br", "ind.br", "inf.br", "app.br", "dev.br", "tec.br",
  "co.uk", "org.uk", "com.ar", "com.mx", "com.pt", "com.au", "co.jp",
]);
const HOSTNAME_SHAPE = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const MINIMUM_RETAILER_KEY = 3;

/** O nome do domínio registrável: `lista.mercadolivre.com.br` → `mercadolivre`. */
function registrableDomainName(host: string): string | null {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  const size = TWO_LEVEL_PUBLIC_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.length >= size ? labels[labels.length - size] : null;
}

function retailerKey(value: string): string {
  const folded = normalize(value).trim();
  const name = HOSTNAME_SHAPE.test(folded) ? registrableDomainName(folded) || "" : folded;
  const key = name.replace(/[^a-z0-9]/g, "");
  return key.length >= MINIMUM_RETAILER_KEY ? key : "";
}

/** Vendedores do bloco `popular_products` da SERP, por chave; o primeiro nome visto fica. */
function productSellers(blocks: JsonObject[]): Map<string, string> {
  const sellers = new Map<string, string>();
  for (const block of blocks) {
    if (text(block.type) !== "popular_products" || !Array.isArray(block.items)) continue;
    for (const entry of block.items) {
      const seller = text(asRecord(entry)?.seller);
      const key = seller ? retailerKey(seller) : "";
      if (key && !sellers.has(key)) sellers.set(key, seller);
    }
  }
  return sellers;
}

/** O vendedor que casou com o `website_name` ou com o domínio registrável do resultado. */
function matchedSeller(item: JsonObject, url: string, sellers: ReadonlyMap<string, string>): string | null {
  if (!sellers.size) return null;
  const host = text(item.domain) || parseUrl(url)?.hostname || "";
  const domainName = host ? registrableDomainName(host) : null;
  for (const key of [retailerKey(text(item.website_name)), domainName ? retailerKey(domainName) : ""]) {
    const seller = key ? sellers.get(key) : undefined;
    if (seller) return seller;
  }
  return null;
}

/** A força continua provisória: cobertura, dominância e mínimo observado. */
const CONCLUSIVE_DOMINANCE = 0.6;
const MIXED_DOMINANCE = 0.4;
const MINIMUM_OBSERVED = 5;
/** Abaixo desta cobertura, nenhuma dominância vira conclusão. */
const CONCLUSIVE_COVERAGE = 0.5;
const MINIMUM_COVERAGE = 0.3;
export const SERP_DERIVATION_VERSION = "serp-semantic-derivation-v4";

type StructuralSignal = { signal: string; label: string; weight: number };

function buildSignal(input: {
  /** Contagem por rótulo vinda **apenas dos itens observados**. */
  counts: Map<string, number>;
  observed: number;
  classified: number;
  /** Reforço dos blocos de SERP: desempata, mas nunca entra no denominador. */
  structural: StructuralSignal[];
  structuralByLabel: Map<string, number>;
}): SerpSemanticSignal {
  const distribution = [...input.counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
  const top = distribution[0];
  const supporting = top?.count || 0;
  const coverage = input.observed > 0 ? input.classified / input.observed : 0;
  // Dominância é proporção real entre itens: nunca pode passar de 100%.
  const dominance = input.classified > 0 ? Math.min(1, supporting / input.classified) : 0;
  const base = { supporting, observed: input.observed, classified: input.classified, coverage, dominance, distribution, structuralSignals: input.structural };

  if (input.observed < MINIMUM_OBSERVED || !top) return { value: null, strength: "insufficient", ...base };
  // Cobertura baixa nunca vira certeza: é o classificador que enxergou pouco.
  if (coverage < MINIMUM_COVERAGE) return { value: null, strength: "insufficient", ...base };
  // Empate real entre rótulos permanece misto, mesmo com reforço estrutural.
  const runnerUp = distribution[1]?.count || 0;
  const tied = runnerUp === supporting;
  const reinforcement = input.structuralByLabel.get(top.label) || 0;
  if (coverage >= CONCLUSIVE_COVERAGE && !tied) {
    if (dominance >= CONCLUSIVE_DOMINANCE) return { value: top.label, strength: "conclusive", ...base };
    // O reforço da SERP fecha o eixo só quando a dominância já é majoritária.
    if (dominance >= 0.5 && reinforcement >= 2) return { value: top.label, strength: "conclusive", ...base };
  }
  if (dominance >= MIXED_DOMINANCE) return { value: null, strength: "mixed", ...base };
  return { value: null, strength: "weak", ...base };
}

export function isConclusiveSerpEvidence(signal: SerpSemanticSignal | null | undefined): boolean {
  return Boolean(signal && signal.strength === "conclusive" && signal.value);
}

/** Peso dos blocos de feature por eixo. `ai_overview` é observado, nunca decide. */
const FEATURE_WEIGHTS: Record<string, { intent?: { label: string; weight: number }; funnel?: { label: string; weight: number }; label: string }> = {
  popular_products: { label: "Produtos populares", intent: { label: "Transacional", weight: 2 }, funnel: { label: "BOFU", weight: 2 } },
  shopping: { label: "Shopping", intent: { label: "Transacional", weight: 2 }, funnel: { label: "BOFU", weight: 2 } },
  google_flights: { label: "Reserva", intent: { label: "Transacional", weight: 1 }, funnel: { label: "BOFU", weight: 1 } },
  people_also_ask: { label: "Perguntas relacionadas", intent: { label: "Informativa", weight: 2 }, funnel: { label: "TOFU", weight: 2 } },
  featured_snippet: { label: "Featured snippet", intent: { label: "Informativa", weight: 1 }, funnel: { label: "TOFU", weight: 1 } },
  video: { label: "Vídeos", intent: { label: "Informativa", weight: 1 }, funnel: { label: "TOFU", weight: 1 } },
  local_pack: { label: "Pacote local", intent: { label: "Local", weight: 2 }, funnel: { label: "BOFU", weight: 1 } },
  map: { label: "Mapa", intent: { label: "Local", weight: 1 }, funnel: { label: "BOFU", weight: 1 } },
  // R7 (v4): blocos de conteúdo explicativo reforçam como o bloco de vídeos.
  short_videos: { label: "Vídeos curtos", intent: { label: "Informativa", weight: 1 }, funnel: { label: "TOFU", weight: 1 } },
  top_stories: { label: "Principais notícias", intent: { label: "Informativa", weight: 1 }, funnel: { label: "TOFU", weight: 1 } },
  scholarly_articles: { label: "Artigos acadêmicos", intent: { label: "Informativa", weight: 1 }, funnel: { label: "TOFU", weight: 1 } },
  ai_overview: { label: "AI overview (observado)" },
  images: { label: "Imagens" },
  related_searches: { label: "Buscas relacionadas" },
  knowledge_graph: { label: "Knowledge graph" },
  // R7 (v4): registrados com peso 0 — observados, sem decidir — até decisão do usuário.
  google_reviews: { label: "Avaliações do Google (observado)" },
  third_party_reviews: { label: "Avaliações de terceiros (observado)" },
  perspectives: { label: "Perspectivas (observado)" },
  discussions_and_forums: { label: "Discussões e fóruns (observado)" },
};

/** Contexto da SERP inteira que a leitura de um orgânico pode consultar. */
export type SerpClassificationContext = {
  /** R5: vendedores do bloco `popular_products` da MESMA SERP, por chave normalizada. */
  sellers: ReadonlyMap<string, string>;
};

export type SerpOrganicReading = {
  intent: string | null;
  funnel: string | null;
  signals: string[];
  score: SerpTextScore;
};

/** O contexto de classificação a partir dos blocos (não orgânicos) da SERP. */
export function serpClassificationContext(blocks: ReadonlyArray<Record<string, unknown>>): SerpClassificationContext {
  return { sellers: productSellers(blocks.map(asRecord).filter((block): block is JsonObject => Boolean(block))) };
}

/**
 * A leitura de UM resultado orgânico. Pura e determinística: o mesmo item no
 * mesmo contexto dá sempre a mesma leitura, venha do corpo cru ou do podado.
 *
 * Ordem: o texto decide primeiro (R1/R2). Os sinais estruturais só preenchem o
 * eixo que o texto deixou vazio, e ficam registrados mesmo quando não decidem.
 * R6 e R5 vêm por último e também só preenchem.
 */
export function classifyOrganicItem(item: Record<string, unknown>, context: SerpClassificationContext): SerpOrganicReading {
  const url = text(item.url);
  const fields = TEXT_FIELDS
    .map(field => ({ value: normalize(field.read(item)), weight: field.weight }))
    .filter(field => field.value);
  const score: SerpTextScore = { intent: scoreFields(INTENT_PATTERNS, fields), funnel: scoreFields(FUNNEL_PATTERNS, fields) };
  let intentLabel = decideByScore(INTENT_PATTERNS, score.intent);
  let funnelLabel = decideByScore(FUNNEL_PATTERNS, score.funnel);
  const price = asRecord(item.price);
  const rating = asRecord(item.rating);
  const signals: string[] = [];
  const social = SOCIAL_PROFILE_HOST.test(url);
  const socialContent = social && isSocialContentPath(url);
  const editorial = EDITORIAL_URL.test(url) || EDITORIAL_HOST.test(url);

  // Sinais estruturais do item: decidem quando o texto não diz nada.
  if (price && (typeof price.current === "number" || text(price.displayed_price))) {
    signals.push("preço");
    intentLabel = intentLabel || "Transacional";
    funnelLabel = funnelLabel || "BOFU";
  }
  // R4: post em rede social não é página de produto, mesmo com `/p/` no caminho.
  if (!socialContent && (PRODUCT_URL.test(url) || /\.html?$/.test(url) && rating)) {
    signals.push("página de produto");
    intentLabel = intentLabel || "Transacional";
    funnelLabel = funnelLabel || "BOFU";
  }
  if (rating && typeof rating.value === "number") {
    signals.push(`avaliação ${rating.value}`);
    // Avaliação sozinha indica comparação de produto, não compra imediata.
    intentLabel = intentLabel || "Comercial";
    funnelLabel = funnelLabel || "MOFU";
  }
  if (REFERENCE_HOST.test(url)) {
    signals.push("referência enciclopédica");
    intentLabel = intentLabel || "Informativa";
    funnelLabel = funnelLabel || "TOFU";
  }
  if (editorial) {
    signals.push("página editorial");
    intentLabel = intentLabel || "Informativa";
    funnelLabel = funnelLabel || "TOFU";
  }
  if (socialContent) {
    // R4: registrado para auditoria; quem lê o item é o texto.
    signals.push("conteúdo em rede social");
  } else if (social) {
    // Navegação não coloca ninguém em etapa de funil: só o eixo Intenção recebe.
    signals.push("perfil em rede social");
    intentLabel = intentLabel || "Navegacional";
  }
  if (isRootUrl(url)) {
    signals.push("raiz do domínio");
    intentLabel = intentLabel || "Navegacional";
  }
  if (item.is_featured_snippet === true) {
    signals.push("featured snippet");
    intentLabel = intentLabel || "Informativa";
    funnelLabel = funnelLabel || "TOFU";
  }
  if (Array.isArray(item.faq) && item.faq.length > 0) {
    signals.push("FAQ");
    intentLabel = intentLabel || "Informativa";
    funnelLabel = funnelLabel || "TOFU";
  }
  if (LIST_TITLE.test(normalize(text(item.title)).trim())) {
    signals.push("título de lista");
    intentLabel = intentLabel || "Informativa";
    funnelLabel = funnelLabel || "TOFU";
  }
  // R5: só o resultado que NADA leu — sem marcador de texto, sem sinal, sem
  // página editorial e sem data — pode virar varejista, e só por igualdade
  // exata com um vendedor do bloco de produtos desta mesma SERP.
  const textSilent = Object.keys(score.intent).length === 0 && Object.keys(score.funnel).length === 0;
  const dated = Boolean(text(item.timestamp) || text(item.date));
  if (!intentLabel && !funnelLabel && textSilent && !editorial && !dated) {
    const seller = matchedSeller(item, url, context.sellers);
    if (seller) {
      signals.push(`varejista no bloco de produtos: ${seller}`);
      intentLabel = "Transacional";
      funnelLabel = "BOFU";
    }
  }
  return { intent: intentLabel, funnel: funnelLabel, signals, score };
}

type DistinctOrganic = { item: JsonObject; index: number; urlKey: string | null; duplicates: number };

/** R8: a primeira ocorrência (a mais bem posicionada) fica; as variantes só são contadas. */
function distinctOrganicResults(organic: JsonObject[]): DistinctOrganic[] {
  const byKey = new Map<string, DistinctOrganic>();
  const distinct: DistinctOrganic[] = [];
  organic.forEach((item, index) => {
    const urlKey = serpResultUrlKey(text(item.url));
    const seen = urlKey ? byKey.get(urlKey) : undefined;
    if (seen) {
      seen.duplicates += 1;
      return;
    }
    const entry: DistinctOrganic = { item, index, urlKey, duplicates: 0 };
    if (urlKey) byKey.set(urlKey, entry);
    distinct.push(entry);
  });
  return distinct;
}

/** Os orgânicos e os blocos de UMA SERP. */
type SerpItems = { organic: JsonObject[]; featureBlocks: JsonObject[] };

/**
 * Os itens da resposta orgânica da DataForSEO para a keyword natural. Nunca
 * aceita a resposta de outra consulta: a keyword do resultado precisa
 * corresponder, o que impede usar a SERP da consulta allintitle como evidência
 * semântica.
 */
function serpItems(body: unknown, keyword: string): SerpItems | null {
  const root = asRecord(body);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const task = asRecord(tasks[0]);
  const results = Array.isArray(task?.result) ? task.result : [];
  const result = asRecord(results[0]);
  if (!result) return null;
  if (normalize(text(result.keyword)) !== normalize(keyword)) return null;
  const items = Array.isArray(result.items) ? result.items.map(asRecord).filter((item): item is JsonObject => Boolean(item)) : [];
  return {
    organic: items.filter(item => text(item.type) === "organic"),
    featureBlocks: items.filter(item => text(item.type) !== "organic"),
  };
}

/** O que UMA lente entrega à leitura: o bit dela, os distintos já lidos e os blocos. */
type LensMaterial = {
  bit: number;
  distinct: Array<DistinctOrganic & { reading: SerpOrganicReading }>;
  featureCounts: Map<string, number>;
};

function lensMaterial(bit: number, serp: SerpItems): LensMaterial {
  const context = serpClassificationContext(serp.featureBlocks);
  // Blocos de feature contam como sinal estrutural da SERP inteira, e não como
  // resultados observados: eles reforçam a leitura sem inflar a cobertura.
  const featureCounts = new Map<string, number>();
  for (const block of serp.featureBlocks) {
    const type = text(block.type);
    if (!type) continue;
    featureCounts.set(type, (featureCounts.get(type) || 0) + 1);
  }
  return {
    bit,
    distinct: distinctOrganicResults(serp.organic).map(organic => ({ ...organic, reading: classifyOrganicItem(organic.item, context) })),
    featureCounts,
  };
}

const bitCount = (mask: number) => {
  let total = 0;
  for (let rest = mask; rest; rest &= rest - 1) total += 1;
  return total;
};

/** O rótulo da maioria das lentes que leram a URL; no empate, o da lente que vem antes na matriz. */
function majorityLabel(labels: ReadonlyArray<string | null>): { label: string | null; conflict: boolean } {
  const votes = new Map<string, number>();
  for (const label of labels) if (label) votes.set(label, (votes.get(label) || 0) + 1);
  let label: string | null = null;
  let best = 0;
  for (const [candidate, count] of votes) {
    if (count > best) {
      label = candidate;
      best = count;
    }
  }
  return { label, conflict: votes.size > 1 };
}

type LensAggregate = {
  observed: number;
  intent: SerpSemanticSignal;
  funnel: SerpSemanticSignal;
  sample: SerpSemanticSampleItem[];
  /** Tipo de bloco → máscara das lentes em que apareceu, na ordem em que foi visto. */
  blockLenses: Map<string, number>;
  labelConflicts: { intent: number; funnel: number };
};

/**
 * A leitura de uma ou mais lentes. Com UMA lente é exatamente a derivação v4
 * de sempre; com mais, a mesma régua sobre a união:
 *
 *   - cada URL (R8) conta UMA vez no denominador, com a máscara das lentes;
 *   - o rótulo dela é a maioria entre as lentes que a leram;
 *   - um bloco só reforça se aparecer em duas lentes ou mais — o de uma lente
 *     só fica registrado com peso 0: é informação de aparelho, não força;
 *   - os limiares não mudam, e o empate continua misto.
 *
 * A concordância entre lentes NÃO entra aqui: as lentes dividem quase todo o
 * top 10 e não são amostras independentes.
 */
function aggregateLenses(materials: readonly LensMaterial[], options: { masks: boolean }): LensAggregate {
  type UrlEntry = { mask: number; reads: LensMaterial["distinct"] };
  const byKey = new Map<string, UrlEntry>();
  const entries: UrlEntry[] = [];
  for (const material of materials) {
    for (const organic of material.distinct) {
      const seen = organic.urlKey ? byKey.get(organic.urlKey) : undefined;
      if (seen) {
        seen.mask |= material.bit;
        seen.reads.push(organic);
        continue;
      }
      // Sem URL legível, nunca se funde com nada (R8).
      const entry: UrlEntry = { mask: material.bit, reads: [organic] };
      if (organic.urlKey) byKey.set(organic.urlKey, entry);
      entries.push(entry);
    }
  }

  const intentCounts = new Map<string, number>();
  const funnelCounts = new Map<string, number>();
  const labelConflicts = { intent: 0, funnel: 0 };
  const sample: SerpSemanticSampleItem[] = [];
  let intentClassified = 0;
  let funnelClassified = 0;
  const add = (counts: Map<string, number>, label: string, weight = 1) => counts.set(label, (counts.get(label) || 0) + weight);

  for (const entry of entries) {
    const intent = majorityLabel(entry.reads.map(read => read.reading.intent));
    const funnel = majorityLabel(entry.reads.map(read => read.reading.funnel));
    if (intent.conflict) labelConflicts.intent += 1;
    if (funnel.conflict) labelConflicts.funnel += 1;
    if (intent.label) { add(intentCounts, intent.label); intentClassified += 1; }
    if (funnel.label) { add(funnelCounts, funnel.label); funnelClassified += 1; }
    // O item da amostra é o da primeira lente que leu o rótulo vencedor da intenção.
    const shown = (intent.label ? entry.reads.find(read => read.reading.intent === intent.label) : undefined) || entry.reads[0];
    // A amostra é o denominador inteiro: cada distinto, com o placar que decidiu.
    sample.push({
      position: typeof shown.item.rank_group === "number" ? shown.item.rank_group : shown.index + 1,
      domain: text(shown.item.domain) || text(shown.item.url),
      intent: intent.label || "indefinido",
      funnel: funnel.label || "indefinido",
      signals: shown.reading.signals,
      ...(shown.urlKey ? { urlKey: shown.urlKey } : {}),
      ...(shown.duplicates > 0 ? { duplicates: shown.duplicates } : {}),
      score: shown.reading.score,
      ...(options.masks ? { lenses: entry.mask } : {}),
    });
  }

  const blockLenses = new Map<string, number>();
  for (const material of materials) {
    for (const type of material.featureCounts.keys()) blockLenses.set(type, (blockLenses.get(type) || 0) | material.bit);
  }
  // Com uma lente, o bloco dela reforça como sempre; com duas ou mais, só o visto em duas.
  const minimumLenses = Math.min(2, materials.length);
  const intentStructural: StructuralSignal[] = [];
  const funnelStructural: StructuralSignal[] = [];
  const intentReinforcement = new Map<string, number>();
  const funnelReinforcement = new Map<string, number>();
  for (const [type, mask] of blockLenses) {
    const weights = FEATURE_WEIGHTS[type];
    if (!weights) continue;
    const reinforces = bitCount(mask) >= minimumLenses;
    if (weights.intent) {
      // Reforço não vira contagem de item: entra só como desempate na força.
      if (reinforces) intentReinforcement.set(weights.intent.label, (intentReinforcement.get(weights.intent.label) || 0) + weights.intent.weight);
      intentStructural.push({ signal: type, label: weights.label, weight: reinforces ? weights.intent.weight : 0 });
    }
    if (weights.funnel) {
      if (reinforces) funnelReinforcement.set(weights.funnel.label, (funnelReinforcement.get(weights.funnel.label) || 0) + weights.funnel.weight);
      funnelStructural.push({ signal: type, label: weights.label, weight: reinforces ? weights.funnel.weight : 0 });
    }
    if (!weights.intent && !weights.funnel) {
      intentStructural.push({ signal: type, label: weights.label, weight: 0 });
    }
  }

  // R8: o denominador conta páginas distintas, não linhas do provider.
  const observed = entries.length;
  return {
    observed,
    intent: buildSignal({ counts: intentCounts, observed, classified: intentClassified, structural: intentStructural, structuralByLabel: intentReinforcement }),
    funnel: buildSignal({ counts: funnelCounts, observed, classified: funnelClassified, structural: funnelStructural, structuralByLabel: funnelReinforcement }),
    sample,
    blockLenses,
    labelConflicts,
  };
}

/**
 * Lê a resposta orgânica da DataForSEO para a keyword natural, em UMA lente.
 * Nunca aceita a resposta de outra consulta (ver `serpItems`).
 */
export function deriveSerpSemanticEvidence(input: {
  body: unknown;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device?: "desktop" | "mobile";
  providerRequestId: string | null;
  operationRequestId: string;
  collectedAt: string;
}): SerpSemanticEvidence | null {
  const serp = serpItems(input.body, input.keyword);
  if (!serp) return null;
  const material = lensMaterial(1, serp);
  const aggregate = aggregateLenses([material], { masks: false });
  return {
    query: input.keyword,
    collectedAt: input.collectedAt,
    provider: "dataforseo",
    providerRequestId: input.providerRequestId,
    operationRequestId: input.operationRequestId,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    device: input.device || "desktop",
    observedResults: aggregate.observed,
    serpFeatures: [...material.featureCounts.entries()].map(([type, count]) => ({ type, count })),
    intent: aggregate.intent,
    funnel: aggregate.funnel,
    sample: aggregate.sample,
  };
}

/* ------------------------------ as quatro lentes ----------------------------- */

/** De onde veio a SERP de uma lente. */
export type SerpLensSource = {
  /** `desktop-windows`, `mobile-ios`… o rótulo de `serpCacheLensLabel`. */
  lens: string;
  collectedAt: string;
  providerRequestId: string | null;
  collectedBy: string | null;
};

/** Uma lente extra: o digest dela, ou por que ela falta. */
export type SerpLensDerivationInput =
  | (SerpLensSource & { digest: SerpOrganicDigest })
  | { lens: string; missing: SerpLensMissingReason };

/**
 * O corpo que o provider teria devolvido contendo só o que o digest guarda. É
 * por aqui que a lente sem corpo é lida: pelo MESMO caminho do corpo, sem uma
 * segunda implementação do classificador. A posição dos blocos não importa à
 * leitura (contagem por tipo e vendedores da SERP inteira). Exportada para a
 * prova de equivalência: o corpo recortado no top 10 e este dão a MESMA leitura.
 */
export function serpBodyFromDigest(digest: SerpOrganicDigest): JsonObject {
  const blocks: JsonObject[] = digest.blocks.flatMap(block => Array.from({ length: block.count }, () => ({ type: block.type }) as JsonObject));
  // A R5 só lê os vendedores do bloco de produtos: todos vão no primeiro.
  const products = blocks.find(block => block.type === "popular_products");
  if (products) products.items = digest.sellers.map(seller => ({ type: "popular_products_element", seller }));
  const organic = digest.organic.map(item => {
    const { faq, ...rest } = item;
    // O digest diz só SE há FAQ; o classificador pergunta por uma lista não vazia.
    return { type: "organic", ...rest, ...(faq ? { faq: [faq] } : {}) } as JsonObject;
  });
  return { tasks: [{ result: [{ keyword: digest.keyword, items: [...organic, ...blocks] }] }] };
}

const rounded = (value: number) => Math.round(value * 1000) / 1000;

/** O rótulo que lidera a distribuição; `null` sem leitura ou no empate. */
function leadingLabel(signal: SerpSemanticSignal): string | null {
  const [top, second] = signal.distribution;
  return top && (!second || second.count < top.count) ? top.label : null;
}

function axisReading(signal: SerpSemanticSignal): SerpLensAxisReading {
  return { value: signal.value, strength: signal.strength, leading: leadingLabel(signal), coverage: rounded(signal.coverage), dominance: rounded(signal.dominance) };
}

/** A leitura de UMA lente no top 10 dela, sempre a partir do digest. */
function lensReading(source: SerpLensSource, digest: SerpOrganicDigest, keyword: string): SerpLensReading | null {
  const evidence = deriveSerpSemanticEvidence({
    body: serpBodyFromDigest(digest),
    keyword,
    locationCode: 0,
    languageCode: "",
    providerRequestId: source.providerRequestId,
    operationRequestId: "",
    collectedAt: source.collectedAt,
  });
  if (!evidence) return null;
  return {
    lens: source.lens,
    collectedAt: source.collectedAt,
    providerRequestId: source.providerRequestId,
    collectedBy: source.collectedBy,
    observed: evidence.observedResults,
    intent: axisReading(evidence.intent),
    funnel: axisReading(evidence.funnel),
  };
}

/** A leitura de uma lente a partir do digest, e só dele — o caminho da coleta e o do acerto. */
export function readSerpLensFromDigest(input: { digest: SerpOrganicDigest; keyword: string; source: SerpLensSource }): SerpLensReading | null {
  return lensReading(input.source, input.digest, input.keyword);
}

const LENS_ORDER: readonly string[] = SERP_CACHE_LENSES.map(serpCacheLensLabel);
const lensBit = (lens: string) => {
  const index = LENS_ORDER.indexOf(lens);
  return index >= 0 ? 1 << index : 0;
};
const lensDevice = (lens: string) => SERP_CACHE_LENSES[LENS_ORDER.indexOf(lens)]?.device ?? null;

/**
 * INTENÇÃO E FUNIL PELAS QUATRO LENTES (adendo, §3). Pura e determinística.
 *
 *   entrada    a canônica pelo corpo (20 resultados); cada lente extra pelo
 *              digest orgânico (top 10) — na coleta, montado do corpo em
 *              memória; no acerto, lido do cache. O mesmo digest dá a mesma
 *              leitura nos dois caminhos.
 *   por lente  o classificador v4 no top 10 de cada uma (a canônica também,
 *              pelo digest dela): valor, força, cobertura e dominância.
 *   agregado   `aggregateLenses` sobre a união: canônica com 20, extras com 10.
 *   registro   concordância (4/4, 3/4) e `deviceSplit` — nunca reforço nem
 *              força nova; lentes faltantes; datas com mais de 7 dias de
 *              diferença marcadas, sem recoleta automática (AGENTS §7).
 *
 * Só com a canônica, a leitura é a de uma lente. Sem a canônica, não há
 * evidência: `null`, como na derivação de uma lente.
 */
export function deriveSerpSemanticEvidenceAcrossLenses(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  operationRequestId: string;
  canonical: SerpLensSource & { body: unknown };
  extras: readonly SerpLensDerivationInput[];
}): SerpSemanticEvidence | null {
  const canonicalSerp = serpItems(input.canonical.body, input.keyword);
  const canonicalDigest = canonicalSerp ? buildSerpOrganicDigest(input.canonical.body) : null;
  const canonicalReading = canonicalDigest ? lensReading(input.canonical, canonicalDigest, input.keyword) : null;
  if (!canonicalSerp || !canonicalDigest || !canonicalReading || !lensBit(input.canonical.lens)) return null;

  const canonicalEntry = { source: input.canonical, material: lensMaterial(lensBit(input.canonical.lens), canonicalSerp), reading: canonicalReading };
  const read: Array<{ source: SerpLensSource; material: LensMaterial; reading: SerpLensReading }> = [canonicalEntry];
  const missing: SerpLensEvidence["lensesMissing"] = [];
  const seen = new Set([input.canonical.lens]);
  for (const extra of input.extras) {
    // Lente fora da matriz, ou repetida, não entra duas vezes.
    if (seen.has(extra.lens) || !lensBit(extra.lens)) continue;
    seen.add(extra.lens);
    if ("missing" in extra) {
      missing.push({ lens: extra.lens, reason: extra.missing });
      continue;
    }
    const serp = serpItems(serpBodyFromDigest(extra.digest), input.keyword);
    const reading = serp ? lensReading(extra, extra.digest, input.keyword) : null;
    if (!serp || !reading) {
      missing.push({ lens: extra.lens, reason: "other_query" });
      continue;
    }
    read.push({ source: extra, material: lensMaterial(lensBit(extra.lens), serp), reading });
  }
  for (const lens of LENS_ORDER) if (!seen.has(lens)) missing.push({ lens, reason: "not_collected" });
  // A ordem da matriz, não a da chegada: coleta e acerto montam o mesmo registro.
  read.sort((left, right) => left.material.bit - right.material.bit);
  missing.sort((left, right) => lensBit(left.lens) - lensBit(right.lens));

  /*
   * A MESMA JANELA para comparar lentes: as extras só têm o top 10 (digest), e
   * a canônica tem 20. Com duas lentes ou mais, a corroboração dos blocos e o
   * agregado de aparelhos usam a canônica no top 10 dela — senão um bloco
   * depois do 10º orgânico apareceria como "só no desktop Windows", e o
   * desktop leria 20 páginas contra 10 do mobile. A união das URLs continua com
   * as 20 da canônica (adendo §3), e com uma lente só nada muda.
   */
  const canonicalTop10 = read.length > 1 ? serpItems(serpBodyFromDigest(canonicalDigest), input.keyword) : null;
  const canonicalWindow = canonicalTop10 ? lensMaterial(canonicalEntry.material.bit, canonicalTop10) : null;
  const aggregate = aggregateLenses(read.map(item => canonicalWindow && item === canonicalEntry ? { ...item.material, featureCounts: canonicalWindow.featureCounts } : item.material), { masks: true });
  const allRead = read.reduce((mask, item) => mask | item.material.bit, 0);
  const windowed = (item: (typeof read)[number]) => canonicalWindow && item === canonicalEntry ? canonicalWindow : item.material;

  const agreement = (axis: "intent" | "funnel"): SerpLensAgreement => {
    const label = leadingLabel(aggregate[axis]);
    return { label, agreeing: label ? read.filter(item => item.reading[axis].leading === label).length : 0, of: read.length };
  };

  // Aparelhos: o agregado das lentes desktop contra o das mobile, no top 10 de cada. Sinal, nunca força.
  const desktop = read.filter(item => lensDevice(item.source.lens) === "desktop").map(windowed);
  const mobile = read.filter(item => lensDevice(item.source.lens) === "mobile").map(windowed);
  const devices = desktop.length && mobile.length
    ? { desktop: aggregateLenses(desktop, { masks: false }), mobile: aggregateLenses(mobile, { masks: false }) }
    : null;
  const deviceSplit = (axis: "intent" | "funnel"): SerpLensDeviceSplit | null => {
    if (!devices) return null;
    const onDesktop = leadingLabel(devices.desktop[axis]);
    const onMobile = leadingLabel(devices.mobile[axis]);
    return onDesktop && onMobile && onDesktop !== onMobile ? { desktop: onDesktop, mobile: onMobile } : null;
  };

  const instants = read
    .map(item => ({ at: item.source.collectedAt, ms: Date.parse(item.source.collectedAt) }))
    .filter(item => Number.isFinite(item.ms))
    .sort((left, right) => left.ms - right.ms);
  const oldest = instants[0];
  const newest = instants[instants.length - 1];

  return {
    query: input.keyword,
    collectedAt: input.canonical.collectedAt,
    provider: "dataforseo",
    providerRequestId: input.canonical.providerRequestId,
    operationRequestId: input.operationRequestId,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    // A consulta continua desktop: é a lente canônica. As outras vão em `lenses`.
    device: "desktop",
    observedResults: aggregate.observed,
    serpFeatures: [...canonicalEntry.material.featureCounts.entries()].map(([type, count]) => ({ type, count })),
    intent: aggregate.intent,
    funnel: aggregate.funnel,
    sample: aggregate.sample,
    lenses: [...LENS_ORDER],
    lensEvidence: {
      version: SERP_LENS_EVIDENCE_VERSION,
      readings: read.map(item => item.reading),
      lensesMissing: missing,
      agreement: { intent: agreement("intent"), funnel: agreement("funnel") },
      deviceSplit: { intent: deviceSplit("intent"), funnel: deviceSplit("funnel") },
      blocks: [...aggregate.blockLenses].filter(([, mask]) => mask !== allRead).map(([type, lenses]) => ({ type, lenses })),
      labelConflicts: aggregate.labelConflicts,
      dates: {
        oldest: oldest?.at ?? input.canonical.collectedAt,
        newest: newest?.at ?? input.canonical.collectedAt,
        divergent: Boolean(oldest && newest && newest.ms - oldest.ms > SERP_LENS_DATE_SPREAD_MS),
      },
    },
  };
}

export type SerpEvidenceStrengthPresentation = {
  label: string;
  tone: "success" | "warning" | "pending";
  description: string;
};

/**
 * Fonte única de apresentação da força da evidência. Todos os consumidores
 * leem daqui: `weak` e `insufficient` nunca podem virar o mesmo rótulo, nem
 * trocar de nome entre o cabeçalho e o card do eixo.
 */
export function serpEvidenceStrengthPresentation(strength: SerpEvidenceStrength): SerpEvidenceStrengthPresentation {
  return {
    conclusive: { label: "Evidência forte", tone: "success" as const, description: "Cobertura e dominância suficientes: a leitura observada fecha o eixo." },
    mixed: { label: "Evidência mista", tone: "warning" as const, description: "Os resultados interpretados mostram necessidades diferentes e não forçam uma classificação." },
    weak: { label: "Evidência fraca", tone: "warning" as const, description: "Há sinal na SERP, mas nenhuma leitura domina o suficiente para fechar o eixo." },
    insufficient: { label: "Evidência insuficiente", tone: "pending" as const, description: "A SERP foi analisada, mas resultados de menos ou cobertura baixa demais para concluir." },
  }[strength];
}

/** Explica em uma linha por que a força ficou nesse patamar. */
export function serpEvidenceRationale(signal: SerpSemanticSignal): string {
  const coverage = `${Math.round(signal.coverage * 100)}% de cobertura (${signal.classified}/${signal.observed})`;
  const dominance = signal.classified > 0 ? `${Math.round(signal.dominance * 100)}% de dominância` : "sem leitura dominante";
  const structural = signal.structuralSignals.filter(item => item.weight > 0).map(item => item.label);
  const suffix = structural.length ? ` · reforço: ${structural.join(", ")}` : "";
  return `${coverage} · ${dominance}${suffix}`;
}

export type SerpCollectionUiState = "not_collected" | "collecting" | "analyzed" | "analyzed_without_consolidation" | "failed";

/** Estado honesto da coleta: "aguardando" nunca descreve algo que não está executando. */
export function serpCollectionUiState(input: {
  collecting?: boolean;
  failed?: boolean;
  evidence?: SerpSemanticEvidence | null;
}): SerpCollectionUiState {
  if (input.collecting) return "collecting";
  if (input.evidence) {
    return isConclusiveSerpEvidence(input.evidence.intent) || isConclusiveSerpEvidence(input.evidence.funnel)
      ? "analyzed"
      : "analyzed_without_consolidation";
  }
  return input.failed ? "failed" : "not_collected";
}

/**
 * O cabeçalho descreve a coleta, não a força de um eixo: nomear "insuficiente"
 * aqui contradizia cards cuja evidência era fraca ou mista.
 */
export function serpCollectionLabel(state: SerpCollectionUiState): string {
  return {
    not_collected: "SERP · Não coletada",
    collecting: "SERP · Coletando",
    analyzed: "SERP · Analisada",
    analyzed_without_consolidation: "SERP · Analisada · sem consolidação",
    failed: "SERP · Falha na coleta",
  }[state];
}

/* ------------------------ apresentação das quatro lentes ------------------------ */

const LENS_NAMES: Record<string, string> = {
  "desktop-windows": "desktop Windows",
  "desktop-macos": "desktop macOS",
  "mobile-android": "mobile Android",
  "mobile-ios": "mobile iOS",
};

/** `mobile-ios` → "mobile iOS". Rótulo fora da matriz volta como veio. */
export const serpLensName = (lens: string) => LENS_NAMES[lens] || lens;

const MISSING_REASON_LABELS: Record<SerpLensMissingReason, string> = {
  not_collected: "não coletada nesta execução",
  collection_failed: "falha na coleta",
  no_organic: "SERP sem resultado orgânico",
  missing_digest: "entrada antiga, sem digest",
  other_query: "entrada de outra consulta",
  evidence_invalidated: "evidência invalidada: a do cache não entra",
};

const COLLECTOR_NAMES: Record<string, string> = { minerador: "Minerador", arquiteto: "Arquiteto", radar: "Radar" };

/** `2026-09-23T09:00:00.000Z` → "23/09/2026", sem fuso: é a data da coleta como gravada. */
function collectedDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

const lensNamesOf = (mask: number) => LENS_ORDER.filter((_, index) => mask & (1 << index)).map(serpLensName);

export type SerpLensAxisPresentation = { agreement: string; deviceSplit: string | null };

export type SerpLensEvidencePresentation = {
  /** "SERP · 4 lentes" ou "SERP · 3 de 4 lentes". */
  headline: string;
  missing: string | null;
  /** Aviso de datas: mais de 7 dias entre as lentes. A recoleta é sempre manual. */
  dates: string | null;
  intent: SerpLensAxisPresentation;
  funnel: SerpLensAxisPresentation;
  /** Blocos que só parte das lentes viu: informação de aparelho, nunca força. */
  blocks: string | null;
  /** Uma linha por lente lida, com a leitura e a origem da coleta. */
  lenses: string[];
};

/**
 * Fonte única do texto das quatro lentes na tela. Discreto por construção:
 * concordância e divergência de aparelho são REGISTRO — nada aqui sugere que
 * elas mudam a força do eixo.
 */
export function serpLensEvidencePresentation(evidence: SerpLensEvidence, total: number = LENS_ORDER.length): SerpLensEvidencePresentation {
  const read = evidence.readings.length;
  const agreement = (value: SerpLensAgreement) => value.label
    ? `Concordância entre lentes: ${value.agreeing} de ${value.of} · ${value.label}`
    : `Concordância entre lentes: nenhum rótulo lidera (${value.of} ${value.of === 1 ? "lente" : "lentes"})`;
  const split = (value: SerpLensDeviceSplit | null) => value ? `Desktop × mobile: ${value.desktop} × ${value.mobile}` : null;
  const axisOf = (axis: SerpLensAxisReading) => `${axis.leading || "sem líder"} (${serpEvidenceStrengthPresentation(axis.strength).label.toLocaleLowerCase("pt-BR")})`;
  return {
    headline: read >= total ? `SERP · ${total} lentes` : `SERP · ${read} de ${total} lentes`,
    missing: evidence.lensesMissing.length
      ? `Fora da leitura: ${evidence.lensesMissing.map(item => `${serpLensName(item.lens)} (${MISSING_REASON_LABELS[item.reason]})`).join(", ")}.`
      : null,
    dates: evidence.dates.divergent
      ? `Lentes de datas diferentes: de ${collectedDate(evidence.dates.oldest)} a ${collectedDate(evidence.dates.newest)}. A recoleta é manual.`
      : null,
    intent: { agreement: agreement(evidence.agreement.intent), deviceSplit: split(evidence.deviceSplit.intent) },
    funnel: { agreement: agreement(evidence.agreement.funnel), deviceSplit: split(evidence.deviceSplit.funnel) },
    blocks: evidence.blocks.length
      ? `Blocos só em parte das lentes: ${evidence.blocks.map(block => `${FEATURE_WEIGHTS[block.type]?.label || block.type} (${lensNamesOf(block.lenses).join(", ")})`).join("; ")}.`
      : null,
    lenses: evidence.readings.map(reading => `${serpLensName(reading.lens)} · Intenção ${axisOf(reading.intent)} · Funil ${axisOf(reading.funnel)} · ${reading.observed} resultado(s) · coletada em ${collectedDate(reading.collectedAt)}${reading.collectedBy ? ` pelo ${COLLECTOR_NAMES[reading.collectedBy] || reading.collectedBy}` : ""}`),
  };
}
