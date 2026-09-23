import type { SerpCollectionRecord } from "../editorial/contracts.ts";
import {
  SERP_CACHE_LENSES,
  SERP_CACHE_OBSERVATION_DEPTH,
  normalizeSerpCacheKeyword,
  serpCacheLensLabel,
  type SerpCacheLens,
  type SerpCacheMeta,
  type SerpCacheObservation,
  type SerpCacheQuery,
} from "../editorial/serp-cache.ts";
import { lensDivergenceOf } from "../arquiteto/silo-primary-keyword.ts";
import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { RadarDeepResearchQuery, RadarQueryEvidence } from "./deep-research.ts";
import type { RadarResearchLayer } from "./evidence-bundle.ts";
import { latestRadarR5SerpRecord } from "./r5-sequential.ts";
import type { SerpResearchSnapshot, SerpReview, SerpResultKind } from "./serp/contracts.ts";

/**
 * ===== A SERP OBSERVADA E A SERP POR LENTE — duas colunas do export portátil =====
 *
 * ==================== POR QUE ESTE ARQUIVO EXISTE ====================
 *
 * O CSV do Radar é uma SAÍDA FINAL: quem não escreve no Redator escreve com
 * outra ferramenta ou outra IA a partir dele. E o CSV levava a SERP só
 * DIGERIDA — conceitos, perguntas das páginas, concorrentes com posição. O que
 * a página do Google mostrou (snippet, People Also Ask, buscas relacionadas,
 * AI Overview, vídeos, produtos, o diagnóstico, o dispositivo e a data) ficava
 * no banco, e quem escrevia fora da plataforma trabalhava sem ver a busca.
 *
 * Aqui saem quatro colunas, em dois pares (Markdown é o produto, JSON é apoio):
 *
 *   serp_observed_md / _json  a SERP que a INVESTIGAÇÃO analisou — o snapshot
 *                             que o próprio dossiê referencia, nunca "o mais
 *                             recente" — com a curadoria humana item a item e
 *                             as SERPs auxiliares das secundárias.
 *   serp_lenses_md / _json    a leitura do CACHE de SERP da marca para as
 *                             keywords do artigo nas quatro lentes. Não é
 *                             investigação congelada: é o que o cache sabe no
 *                             momento da exportação, com a data de cada lente.
 *
 * ==================== O QUE NUNCA ATRAVESSA — invariante 43 ====================
 *
 * Id interno, UUID, hash, `serpSnapshotId`, provider, endpoint, `isMock`,
 * payload cru, revisor, chaves posicionais `organic:N`/`paa:N`. A curadoria
 * atravessa traduzida em posição e decisão. Trecho de terceiro (snippet,
 * resposta do PAA, descrição do painel) sai cortado em 300 caracteres e
 * marcado: é referência para conferir, nunca texto para copiar.
 *
 * ==================== AUSÊNCIA É DITA, E DITA CERTO ====================
 *
 * A coleta do Radar usa o modo `regular`, que ANUNCIA blocos em `itemTypes` e
 * não entrega o conteúdo deles (medido em 2026-09-20: `people_also_ask`
 * listado e zero perguntas). Dizer "o Google não mostrou PAA" nesse caso seria
 * mentira sobre a página. A frase certa é "o Google exibiu o bloco, mas a
 * coleta não trouxe o conteúdo" — a limitação é da coleta.
 *
 * Por isso as `limitations` de `serpFeatures` NÃO são repassadas: elas foram
 * escritas a partir do conteúdo entregue ("o Google não está tratando
 * audiovisual como resposta") e afirmariam sobre a página o que é só falta da
 * coleta. As ausências são recalculadas aqui, bloco a bloco.
 *
 * ==================== TAMANHO ====================
 *
 * Uma célula de planilha tem teto (32.767 caracteres no Excel). Cada coluna é
 * montada em níveis de corte progressivos até caber em
 * `RADAR_PORTABLE_SERP_CELL_BUDGET`, e todo corte é declarado ("mais 12
 * resultados omitidos"). Nada some calado.
 *
 * Domínio puro: sem banco, sem rede, sem provider. Quem lê o banco é o
 * integrador (a rota de export), com as leituras que ela já faz.
 */

/* ================================ constantes ================================ */

/** O teto de um trecho de terceiro, com as reticências incluídas. */
export const RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT = 300;

/** A marca que acompanha todo trecho de terceiro exportado. */
export const RADAR_PORTABLE_THIRD_PARTY_NOTICE = "trecho de terceiro — referência, não copiar";

/** A regra de uso que viaja nas duas colunas. */
export const RADAR_PORTABLE_SERP_USAGE = "pesquisa: não copiar trechos nem títulos de terceiros";

/**
 * O orçamento de cada célula, em caracteres.
 *
 * Bem abaixo dos 32.767 do Excel de propósito: o CSV dobra as aspas internas
 * (o JSON tem muitas), e uma ferramenta que reescreve a célula não deveria
 * encostar no teto.
 */
export const RADAR_PORTABLE_SERP_CELL_BUDGET = 24_000;

/* ============================== texto portátil ============================== */

/** Espaço colapsado: snippet com quebra de linha quebraria a lista do Markdown. */
const limpo = (valor: unknown): string =>
  typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";

/**
 * Corta em `limite` unidades, com as reticências dentro do limite.
 *
 * Nunca parte um par substituto ao meio: um emoji cortado viraria caractere
 * inválido no CSV.
 */
function cortar(texto: string, limite: number): { texto: string; cortado: boolean } {
  if (texto.length <= limite) return { texto, cortado: false };
  let fim = Math.max(0, limite - 1);
  const codigo = texto.charCodeAt(fim - 1);
  if (codigo >= 0xd800 && codigo <= 0xdbff) fim -= 1;
  return { texto: `${texto.slice(0, fim).trimEnd()}…`, cortado: true };
}

/**
 * Um trecho de terceiro no JSON. A marca não se repete em cada item (custaria
 * um parágrafo por coluna): o nome do campo diz o que ele é, e a marca vai uma
 * vez no topo, em `thirdPartyNotice`. No Markdown, que é o que se lê, ela
 * acompanha CADA trecho.
 */
export type RadarPortableThirdPartyExcerpt = {
  thirdPartyExcerpt: string;
  truncated: boolean;
};

/**
 * TRECHO DE TERCEIRO — cortado e marcado, sempre os dois.
 *
 * O limite do nível de corte pode ser MENOR que 300 (célula apertada), nunca
 * maior: o teto é regra de uso, não de tamanho.
 */
function trechoDeTerceiro(valor: unknown, limite = RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT): RadarPortableThirdPartyExcerpt | null {
  const texto = limpo(valor);
  if (!texto) return null;
  const corte = cortar(texto, Math.min(limite, RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT));
  return { thirdPartyExcerpt: corte.texto, truncated: corte.cortado };
}

/** Texto de terceiro que não é trecho (título, termo): só cortado. */
const deTerceiro = (valor: unknown, limite: number): string | null => {
  const texto = limpo(valor);
  return texto ? cortar(texto, limite).texto : null;
};

const TIPO_EM_INGLES: Record<SerpResultKind, string> = {
  article: "artigo", service: "serviço", local: "negócio local", category: "categoria",
  product: "produto", review: "avaliação", comparison: "comparativo", list: "lista",
  video: "vídeo", forum: "fórum", institutional: "institucional", other: "outro",
};

/**
 * TEXTO NOSSO, LIMPO DE ENDEREÇO INTERNO.
 *
 * Motivo de curadoria, razão de consulta não executada e frase de diagnóstico
 * são escritos pela plataforma — e podem carregar, por acidente, uma chave
 * posicional, um id ou o nome do fornecedor da coleta. A tradução preserva o
 * sentido ("orgânico na posição 3") em vez de apagar a frase.
 *
 * NÃO é aplicado a URL, título ou trecho de terceiro: aquilo é conteúdo da
 * página, e alterá-lo seria falsificar a referência.
 */
function textoPortatil(valor: unknown, limite: number): string | null {
  const texto = limpo(valor)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, () => "(identificador interno omitido)")
    .replace(/sha256:[0-9a-f]*/gi, () => "(assinatura omitida)")
    .replace(/\b[0-9a-f]{40,}\b/gi, () => "(assinatura omitida)")
    .replace(/\borganic:(\d+)\b/g, (_, n: string) => `orgânico na posição ${n}`)
    .replace(/\bpaa:(\d+)\b/g, (_, n: string) => `pergunta ${n} do PAA`)
    .replace(/\brelated:(\d+)\b/g, (_, n: string) => `busca relacionada ${n}`)
    .replace(/\bknowledge_graph:\d+\b/g, () => "painel de conhecimento")
    .replace(/\bpel[ao] DataForSEO\b/gi, () => "pela coleta")
    .replace(/\bDataForSEO\b/gi, () => "o serviço de coleta")
    .trim();
  return texto ? cortar(texto, limite).texto : null;
}

/*
 * A FALHA DA COLETA AUXILIAR carrega a mensagem CRUA do servidor: a tela grava
 * "A coleta auxiliar desta keyword não foi concluída: <erro>", e o erro pode
 * ser "O binding ... aponta para um provider diferente" ou "O secret store ...
 * não está disponível". `textoPortatil` só troca o nome do fornecedor; o
 * vocabulário de infraestrutura atravessava até o CSV (invariante 43).
 */
const FALHA_DA_COLETA_AUXILIAR = /^A coleta auxiliar desta keyword não foi concluída\b/i;
const VOCABULARIO_DE_INFRAESTRUTURA = /\b(provider|secret|binding|credencia\w*|connection|token|api[\s_-]?key|endpoint|service[\s_-]?role|webhook|stack|timeout|ECONN\w*|HTTP\s?\d{3}|status\s?\d{3})\b/i;
const MOTIVO_NEUTRO_DA_FALHA = "A coleta auxiliar desta keyword não foi concluída nesta investigação; o detalhe técnico da falha não é exportado.";

/**
 * O motivo de uma consulta auxiliar, portátil.
 *
 * Motivo de PLANEJAMENTO (dispensada pelo plano, sem coleta por keyword) é
 * texto da plataforma e sai como está. A FALHA sai numa frase neutra — o que
 * vem depois dos dois-pontos é erro de servidor, não pesquisa. Rede de
 * segurança para outro formato de falha: consulta NÃO EXECUTADA cujo trecho
 * depois dos dois-pontos fala a língua da infraestrutura também vira a frase
 * neutra. O vocabulário só é procurado nesse trecho, para não confundir com
 * falha um motivo de planejamento que cite, por exemplo, uma entidade.
 */
function motivoDaAuxiliar(item: Pick<RadarPortableAuxiliaryQuery, "execution" | "reason">, limite: number): string | null {
  const texto = limpo(item.reason);
  if (!texto) return null;
  const depoisDosDoisPontos = texto.includes(": ") ? texto.slice(texto.indexOf(": ") + 2) : "";
  if (FALHA_DA_COLETA_AUXILIAR.test(texto)
    || (item.execution === "NOT_EXECUTED" && VOCABULARIO_DE_INFRAESTRUTURA.test(depoisDosDoisPontos))) {
    return cortar(MOTIVO_NEUTRO_DA_FALHA, limite).texto;
  }
  return textoPortatil(texto, limite);
}

/** Os padrões do diagnóstico citam o tipo em inglês ("principalmente como article"). */
const comTiposTraduzidos = (texto: string): string =>
  texto.replace(/\b(article|service|local|category|product|review|comparison|list|video|forum|institutional|other)\b/g,
    (tipo: string) => TIPO_EM_INGLES[tipo as SerpResultKind] || tipo);

/**
 * O INSTANTE, E SÓ QUANDO ELE É UM INSTANTE — a mesma regra do evidence pack.
 *
 * PostgREST devolve `+00:00`; a saída é sempre ISO em UTC, e o que não é data
 * (uma impressão digital usada como carimbo) vira `null`.
 */
function instante(valor: unknown): string | null {
  const texto = limpo(valor);
  if (!texto) return null;
  const ms = Date.parse(texto);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** A data para quem lê: "2026-09-23 12:00 UTC". */
const dataLegivel = (iso: string | null): string =>
  iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "data não registrada";

function recorte<T>(itens: readonly T[], limite: number): { itens: T[]; omitidos: number } {
  const teto = Math.max(0, limite);
  return { itens: itens.slice(0, teto), omitidos: Math.max(0, itens.length - teto) };
}

const unicos = (valores: readonly string[]): string[] => [...new Set(valores.filter(Boolean))];

/* ================================== rótulos ================================== */

const CONFIANCA: Record<string, string> = { high: "alta", medium: "média", low: "baixa", insufficient: "insuficiente" };

const VEREDITO: Record<string, string> = {
  coerente: "coerente",
  parcialmente_coerente: "parcialmente coerente",
  possivel_conflito: "possível conflito",
  informacao_insuficiente: "informação insuficiente",
};

const INTENCAO: Record<string, string> = {
  informacional: "informacional",
  transacional: "transacional",
  investigacao_comercial: "investigação comercial",
  local: "local",
  navegacional: "navegacional",
};

const DECISAO: Record<string, string> = { included: "incluída", excluded: "excluída", pending: "pendente" };
const SEM_DECISAO = "sem decisão registrada";

const DISPOSITIVO: Record<string, string> = { desktop: "desktop", mobile: "celular" };
const SISTEMA: Record<string, string> = { windows: "Windows", macos: "macOS", android: "Android", ios: "iOS" };

const PAPEL_DA_KEYWORD: Record<string, string> = {
  principal: "principal",
  secundaria: "secundária",
  reforco_narrativo: "reforço narrativo",
};

const EXECUCAO: Record<string, string> = {
  PLANNED: "planejada, não executada",
  EXECUTED: "executada",
  NOT_EXECUTED: "não executada",
  REUSED_FORMATION_EVIDENCE: "reaproveitou a evidência da formação no Arquiteto",
};

const PLATAFORMA: Record<string, string> = { YOUTUBE: "YouTube", INSTAGRAM: "Instagram", TIKTOK: "TikTok", OUTRA: "outra plataforma" };

const ORIGEM_DA_EXPANSAO: Record<string, string> = {
  PEOPLE_ALSO_SEARCH: "Outras pessoas pesquisaram",
  REFINEMENT_CHIP: "refinamento da busca",
  RELATED_IMAGE_SEARCH: "busca de imagens relacionada",
};

/**
 * OS BLOCOS DA PÁGINA, EM PORTUGUÊS.
 *
 * `itemTypes` é vocabulário do fornecedor da coleta e não sai cru. Bloco fora
 * do catálogo sai com o nome legível ("bloco não catalogado: top sights"),
 * porque omiti-lo esconderia que a página tinha mais do que listamos.
 */
const BLOCO: Record<string, string> = {
  organic: "resultados orgânicos",
  ai_overview: "AI Overview (resposta de IA do Google)",
  people_also_ask: "Pessoas também perguntam",
  related_searches: "buscas relacionadas",
  people_also_search: "Outras pessoas pesquisaram",
  images: "imagens",
  video: "vídeos",
  short_videos: "vídeos curtos (Shorts)",
  popular_products: "produtos populares",
  local_pack: "pacote local (mapa e empresas)",
  map: "mapa",
  knowledge_graph: "painel de conhecimento",
  featured_snippet: "trecho em destaque",
  answer_box: "caixa de resposta",
  top_stories: "principais notícias",
  paid: "anúncios",
  discussions_and_forums: "discussões e fóruns",
  perspectives: "perspectivas",
  twitter: "posts do X (Twitter)",
  carousel: "carrossel",
  multi_carousel: "carrossel múltiplo",
  shopping: "compras",
  google_reviews: "avaliações do Google",
  third_party_reviews: "avaliações de terceiros",
  questions_and_answers: "perguntas e respostas",
  top_sights: "principais atrações",
  events: "eventos",
  event: "evento",
  jobs: "vagas de emprego",
  recipes: "receitas",
  podcasts: "podcasts",
  scholarly_articles: "artigos acadêmicos",
  find_results_on: "resultados em outros sites",
  refine_products: "refinar produtos",
  explore_brands: "explorar marcas",
  commercial_units: "unidades comerciais",
  visual_stories: "histórias visuais",
  mention_carousel: "carrossel de menções",
  found_on_web: "encontrado na web",
  hotels_pack: "hotéis",
  local_services: "serviços locais",
  google_posts: "posts do Google",
  compare_sites: "comparar sites",
  app: "aplicativos",
  courses: "cursos",
  math_solver: "calculadora",
  currency_box: "conversor de moeda",
  stocks_box: "cotações",
  google_flights: "voos",
};

export const radarPortableSerpBlockLabel = (tipo: string): string =>
  BLOCO[tipo] || `bloco não catalogado: ${limpo(tipo).replace(/_/g, " ") || "sem nome"}`;

const tipoDeResultado = (tipo: string | null | undefined): string =>
  tipo ? TIPO_EM_INGLES[tipo as SerpResultKind] || limpo(tipo).replace(/_/g, " ") : "não classificado";

const intencao = (valor: string | null | undefined): string | null =>
  valor ? INTENCAO[valor] || limpo(valor).replace(/_/g, " ") : null;

/** O rótulo humano da lente, ao lado do técnico de `serpCacheLensLabel`. */
export const radarPortableLensLabel = (lens: SerpCacheLens): string =>
  `${DISPOSITIVO[lens.device] || lens.device} · ${SISTEMA[lens.operatingSystem] || lens.operatingSystem}`;

/** A localidade: o código 2076 é o Brasil na coleta, e o número sozinho não diz isso. */
const localidade = (valor: unknown): string | null => {
  const texto = limpo(valor);
  if (!texto) return null;
  if (texto === "2076") return "Brasil (código de localidade 2076)";
  return /^\d+$/.test(texto) ? `código de localidade ${texto}` : texto;
};

/* ======================== o que o integrador entrega ======================== */

/** O recorte do snapshot que esta coluna lê. Estrutural: id, hash e provider nem entram. */
export type RadarPortableSerpSnapshot = Pick<SerpResearchSnapshot,
  | "query" | "country" | "language" | "location" | "device" | "collectedAt" | "status"
  | "organicResults" | "peopleAlsoAsk" | "relatedSearches" | "knowledgeGraph" | "diagnostic"
> & Partial<Pick<SerpResearchSnapshot, "operatingSystem" | "serpFeatures">>;

type DecisaoGravada = RadarAnalysisVersion["payload"]["serpDecisions"][number];

/** A decisão humana por item, como a versão da análise a guarda. */
export type RadarPortableSerpDecision = Pick<DecisaoGravada, "key" | "decision" | "reason">
  & Partial<Pick<DecisaoGravada, "itemType" | "note" | "url" | "ownDomain">>;

/** Uma consulta da investigação profunda, com a SERP auxiliar que ela observou. */
export type RadarPortableAuxiliaryQuery = Pick<RadarDeepResearchQuery, "keyword" | "role" | "execution" | "serpClass" | "reason"> & {
  evidence: Pick<RadarQueryEvidence, "collectedAt" | "resultCount" | "observedIntent" | "results"> | null;
};

export type RadarPortableSerpObservedInput = {
  /** O snapshot que o dossiê referencia (`radarPortableLinkedSerpRecord`). `null` quando não há. */
  snapshot: RadarPortableSerpSnapshot | null;
  /** Por que não há snapshot, já legível. Sem ele, a frase padrão. */
  unavailableReason?: string | null;
  /** O papel da camada do Google no dossiê: principal (perfil Google) ou apoio (YouTube/Amazon). */
  serpRole?: RadarResearchLayer["role"] | null;
  /** Quando a investigação foi congelada (`research.google.frozenAt` do dossiê). */
  frozenAt?: string | null;
  /** A última revisão humana DESTE snapshot (`latestRadarR5SerpReview`). O revisor não entra. */
  review?: Pick<SerpReview, "status" | "reviewedAt"> | null;
  /** `false` quando a leitura das revisões falhou: a situação é "não lida", nunca "aguardando". */
  reviewReadable?: boolean;
  /** `serpDecisions` da versão da análise que congelou a investigação. */
  serpDecisions?: readonly RadarPortableSerpDecision[];
  /** `deepResearch.queries` da mesma versão. Só as auxiliares viram SERP auxiliar. */
  deepResearchQueries?: readonly RadarPortableAuxiliaryQuery[];
  /** A coleta mais recente do artigo quando ela NÃO é a vinculada (`radarPortableNewerSerpCollection`). */
  newerCollection?: { collectedAt: string | null } | null;
};

/* ==================== as pontes do integrador, puras ==================== */

/**
 * O REGISTRO QUE O DOSSIÊ REFERENCIA — nunca "o mais recente".
 *
 * O `observed` do Google é montado sobre o snapshot mais recente; o dossiê
 * congelado referencia o da análise (`research.google.refs`). Depois de um
 * "Atualizar SERP" os dois divergem, e a coluna precisa descrever a SERP que
 * a investigação analisou. A assinatura, quando existe, é conferida: registro
 * com o mesmo id e outro conteúdo não é a mesma SERP.
 *
 * `issue` é frase pronta para o CSV — sem id, sem hash.
 */
export function radarPortableLinkedSerpRecord<T extends Pick<SerpCollectionRecord, "id" | "research">>(
  records: readonly T[],
  layer: Pick<RadarResearchLayer, "refs"> | null | undefined,
): { record: T | null; issue: string | null } {
  const referencia = (layer?.refs || []).find(ref => ref.source === "WEB_SERP");
  if (!referencia) return { record: null, issue: "A investigação não referencia uma coleta de SERP do Google." };
  const registro = records.find(item => item.id === referencia.ref || item.research?.id === referencia.ref) || null;
  if (!registro) return { record: null, issue: "A coleta de SERP que a investigação referencia não está entre as coletas gravadas da marca." };
  if (!registro.research) return { record: null, issue: "A coleta referenciada é um resumo antigo, sem a SERP normalizada: não há o que detalhar." };
  if (referencia.fingerprint && registro.research.contentHash !== referencia.fingerprint) {
    return { record: null, issue: "A coleta encontrada não confere com a assinatura congelada na investigação; nada foi exportado para não descrever outra SERP." };
  }
  return { record: registro, issue: null };
}

/**
 * HÁ COLETA POSTERIOR À INVESTIGAÇÃO?
 *
 * A mesma regra de "mais recente" que o `observed` usa (`latestRadarR5SerpRecord`).
 * Quando ela aponta para outro registro, a SERP da coluna é a da investigação,
 * e quem lê precisa saber que existe uma mais nova que não foi usada.
 */
export function radarPortableNewerSerpCollection(
  records: readonly SerpCollectionRecord[],
  articleId: string,
  linked: Pick<SerpCollectionRecord, "id"> | null,
): { collectedAt: string | null } | null {
  if (!linked) return null;
  const maisRecente = latestRadarR5SerpRecord([...records], articleId);
  if (!maisRecente || maisRecente.id === linked.id) return null;
  return { collectedAt: instante(maisRecente.research?.collectedAt) || instante(maisRecente.snapshot?.capturedAt) };
}

/* ============================ a SERP observada ============================ */

export type RadarPortableSerpObserved = {
  available: boolean;
  unavailableReason: string | null;
  query: string | null;
  role: string | null;
  country: string | null;
  language: string | null;
  location: string | null;
  device: string | null;
  operatingSystem: string | null;
  collectedAt: string | null;
  frozenAt: string | null;
  review: { status: string; at: string | null };
  curation: string;
  organic: Array<{
    position: number;
    title: string | null;
    url: string;
    domain: string;
    type: string;
    typeSource: "inferido" | "definido na revisão";
    date: string | null;
    snippet: RadarPortableThirdPartyExcerpt | null;
    sitelinks: Array<{ title: string | null; url: string }>;
    omittedSitelinks: number;
    ownDomain: boolean;
    humanDecision: string | null;
    reason: string | null;
  }>;
  peopleAlsoAsk: Array<{
    position: number;
    question: string | null;
    sourceTitle: string | null;
    sourceUrl: string | null;
    answer: RadarPortableThirdPartyExcerpt | null;
    humanDecision: string | null;
    reason: string | null;
  }>;
  relatedSearches: Array<{ term: string | null; humanDecision: string | null; reason: string | null }>;
  knowledgeGraph: {
    title: string | null;
    type: string | null;
    description: RadarPortableThirdPartyExcerpt | null;
    attributes: Array<{ name: string; value: string | null }>;
    omittedAttributes: number;
    website: string | null;
    sources: Array<{ title: string | null; url: string }>;
    omittedSources: number;
    humanDecision: string | null;
    reason: string | null;
  } | null;
  features: {
    aiOverview: { shown: boolean; collected: boolean; citedSources: Array<{ domain: string; title: string | null; url: string | null }>; omittedCitedSources: number };
    videos: Array<{ title: string | null; format: string; platform: string; url: string; domain: string | null }>;
    images: Array<{ alt: string | null; domain: string | null }>;
    products: Array<{ title: string | null; seller: string | null; price: string | null; rating: number | null; reviews: number | null }>;
    expansions: Array<{ text: string | null; origin: string }>;
    formatsShown: string[];
    collectedItemsByBlock: Array<{ block: string; count: number }>;
    intentSignals: string[];
  } | null;
  diagnostic: {
    dominantIntent: string | null;
    secondaryIntents: string[];
    confidence: string;
    dominantFormats: string[];
    pageTypes: string[];
    resultTypes: Array<{ type: string; count: number }>;
    titlePatterns: string[];
    snippetPatterns: string[];
    frequentEntities: string[];
    frequentDomains: string[];
    localSignals: string[];
    possibleConflicts: string[];
    opportunities: string[];
    limitations: string[];
    verdict: string;
  } | null;
  auxiliaryQueries: Array<{
    query: string | null;
    role: string;
    execution: string;
    collectedAt: string | null;
    observedIntent: string | null;
    resultCount: number | null;
    results: Array<{ position: number; title: string | null; domain: string | null; url: string | null; type: string }>;
    omittedResults: number;
    reason: string | null;
  }>;
  /** Quantos itens de cada lista ficaram fora desta célula. Zero não aparece. */
  omitted: Record<string, number>;
  absent: string[];
  newerCollectionNotUsed: { collectedAt: string | null; statement: string } | null;
  cellLimitNotice: string | null;
  /** Vale para todo campo `thirdPartyExcerpt` desta coluna. */
  thirdPartyNotice: string;
  usage: typeof RADAR_PORTABLE_SERP_USAGE;
};

const AVISO_DE_TERCEIRO = `${RADAR_PORTABLE_THIRD_PARTY_NOTICE}; cada trecho está cortado em até ${RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT} caracteres`;

/** Os tetos de um nível de corte. O nível 0 é o normal; os outros só entram se a célula estourar. */
type LimitesDaSerp = {
  organicos: number; sitelinks: number; paa: number; relacionadas: number;
  atributos: number; fontesDoPainel: number; citacoes: number; videos: number; imagens: number;
  produtos: number; expansoes: number; listasDoDiagnostico: number;
  auxiliares: number; resultadosAuxiliares: number; urlsAuxiliares: boolean;
  trecho: number; texto: number; titulo: number;
};

/*
 * A ORDEM DO SACRIFÍCIO: primeiro o periférico (produtos, imagens, expansões,
 * sitelinks), depois a profundidade da SERP. O top 10 orgânico é o último a
 * encolher — é a parte estável da SERP e a que mais sustenta a escrita — e só
 * o nível de emergência abre mão dos trechos.
 */
const NIVEIS_DA_SERP: readonly LimitesDaSerp[] = [
  { organicos: 20, sitelinks: 4, paa: 10, relacionadas: 20, atributos: 12, fontesDoPainel: 5, citacoes: 10, videos: 10, imagens: 10, produtos: 10, expansoes: 15, listasDoDiagnostico: 10, auxiliares: 8, resultadosAuxiliares: 10, urlsAuxiliares: true, trecho: 300, texto: 300, titulo: 200 },
  { organicos: 20, sitelinks: 2, paa: 10, relacionadas: 15, atributos: 8, fontesDoPainel: 3, citacoes: 8, videos: 6, imagens: 5, produtos: 5, expansoes: 8, listasDoDiagnostico: 6, auxiliares: 8, resultadosAuxiliares: 5, urlsAuxiliares: true, trecho: 300, texto: 200, titulo: 160 },
  { organicos: 10, sitelinks: 2, paa: 6, relacionadas: 10, atributos: 6, fontesDoPainel: 3, citacoes: 6, videos: 5, imagens: 5, produtos: 5, expansoes: 8, listasDoDiagnostico: 6, auxiliares: 6, resultadosAuxiliares: 5, urlsAuxiliares: true, trecho: 300, texto: 200, titulo: 160 },
  { organicos: 10, sitelinks: 0, paa: 4, relacionadas: 6, atributos: 3, fontesDoPainel: 0, citacoes: 3, videos: 3, imagens: 3, produtos: 3, expansoes: 4, listasDoDiagnostico: 3, auxiliares: 4, resultadosAuxiliares: 3, urlsAuxiliares: false, trecho: 150, texto: 120, titulo: 120 },
  { organicos: 10, sitelinks: 0, paa: 3, relacionadas: 3, atributos: 0, fontesDoPainel: 0, citacoes: 3, videos: 0, imagens: 0, produtos: 0, expansoes: 0, listasDoDiagnostico: 2, auxiliares: 3, resultadosAuxiliares: 3, urlsAuxiliares: false, trecho: 0, texto: 100, titulo: 100 },
];

/**
 * O CATÁLOGO DO QUE A COLETA GUARDA DE CADA BLOCO.
 *
 * `quantos` responde "a coleta trouxe o conteúdo?". Bloco fora deste catálogo
 * é bloco cujo conteúdo a normalização não grava por desenho (pacote local,
 * trecho em destaque…) — e isso também é dito.
 */
type Captura = { tipo: string; ausente: string; quantos: (snapshot: RadarPortableSerpSnapshot) => number };

const CAPTURAS: readonly Captura[] = [
  { tipo: "people_also_ask", ausente: "Não há Pessoas também perguntam gravado nesta coleta.", quantos: s => s.peopleAlsoAsk.length },
  { tipo: "ai_overview", ausente: "Não há AI Overview gravado nesta coleta.", quantos: s => (s.serpFeatures?.aiOverview.present ? 1 : 0) },
  { tipo: "related_searches", ausente: "Não há buscas relacionadas gravadas nesta coleta.", quantos: s => s.relatedSearches.length },
  { tipo: "knowledge_graph", ausente: "Não há painel de conhecimento gravado nesta coleta.", quantos: s => (s.knowledgeGraph ? 1 : 0) },
  { tipo: "video", ausente: "Não há bloco de vídeos gravado nesta coleta.", quantos: s => (s.serpFeatures?.videos || []).filter(item => item.block === "VIDEO").length },
  { tipo: "short_videos", ausente: "Não há bloco de vídeos curtos gravado nesta coleta.", quantos: s => (s.serpFeatures?.videos || []).filter(item => item.block === "SHORT_VIDEOS").length },
  { tipo: "images", ausente: "Não há bloco de imagens gravado nesta coleta.", quantos: s => (s.serpFeatures?.visualOpportunities || []).length },
  { tipo: "popular_products", ausente: "Não há produtos gravados nesta coleta.", quantos: s => (s.serpFeatures?.commercialSignals.products || []).length },
  {
    tipo: "people_also_search",
    ausente: "Não há bloco Outras pessoas pesquisaram gravado nesta coleta.",
    quantos: s => [...(s.serpFeatures?.questionMap || []), ...(s.serpFeatures?.entityMap || [])].filter(item => item.source === "PEOPLE_ALSO_SEARCH").length,
  },
  { tipo: "organic", ausente: "Não há resultados orgânicos gravados nesta coleta.", quantos: s => s.organicResults.length },
];

/**
 * AS AUSÊNCIAS, BLOCO A BLOCO — e com o sujeito certo em cada frase.
 *
 *   anunciado e sem conteúdo  → limitação da COLETA ("a coleta não trouxe")
 *   anunciado e não gravável  → limitação do CONTRATO da coleta
 *   não anunciado             → "não há X gravado nesta coleta"
 *   coleta sem `itemTypes`    → não dá para afirmar nada sobre a página
 */
function ausenciasDe(snapshot: RadarPortableSerpSnapshot): string[] {
  const frases: string[] = [];
  const anunciados = snapshot.serpFeatures ? unicos(snapshot.serpFeatures.itemTypes.map(limpo)) : null;
  const catalogados = new Set(CAPTURAS.map(item => item.tipo));

  if (!anunciados) {
    frases.push("Esta coleta não registrou quais blocos a página do Google exibia: a falta de AI Overview, Pessoas também perguntam, vídeos, imagens ou produtos nesta coluna não prova que o Google não os mostrou.");
    for (const captura of CAPTURAS) {
      if (!captura.quantos(snapshot) && ["people_also_ask", "related_searches", "knowledge_graph", "organic"].includes(captura.tipo)) frases.push(captura.ausente);
    }
  } else {
    for (const captura of CAPTURAS) {
      if (captura.quantos(snapshot)) continue;
      frases.push(anunciados.includes(captura.tipo)
        ? `O Google exibiu o bloco "${radarPortableSerpBlockLabel(captura.tipo)}", mas a coleta não trouxe o conteúdo dele: a limitação é da coleta, não da página.`
        : captura.ausente);
    }
    for (const tipo of anunciados) {
      if (catalogados.has(tipo)) continue;
      frases.push(`O Google exibiu o bloco "${radarPortableSerpBlockLabel(tipo)}"; o conteúdo deste bloco não é gravado pela coleta.`);
    }
  }

  const aio = snapshot.serpFeatures?.aiOverview;
  if (aio?.present && !aio.references.length) frases.push("O AI Overview apareceu, mas a coleta não trouxe as fontes que ele cita.");
  if (aio?.present) frases.push("O texto do AI Overview não é gravado pela coleta: só a presença e as fontes citadas.");
  if (snapshot.organicResults.length && snapshot.organicResults.every(item => !limpo(item.snippet))) {
    frases.push("Os resultados orgânicos vieram sem snippet nesta coleta.");
  }
  return unicos(frases);
}

const PAPEL_DA_SERP: Record<RadarResearchLayer["role"], string> = {
  PRIMARY: "SERP principal da investigação (perfil Google)",
  SUPPORT: "SERP de apoio de SEO (a investigação principal é de outro perfil)",
};

function revisaoDe(input: RadarPortableSerpObservedInput, snapshot: RadarPortableSerpSnapshot): { status: string; at: string | null } {
  if (input.reviewReadable === false) return { status: "não lida nesta exportação", at: null };
  if (input.review) return { status: input.review.status === "approved" ? "aprovada" : "rejeitada", at: instante(input.review.reviewedAt) };
  const porStatus: Record<string, string> = {
    approved: "aprovada",
    rejected: "rejeitada",
    superseded: "substituída por coleta posterior",
    error: "coleta com erro",
    needs_review: "aguardando revisão humana",
  };
  /*
   * A SERP DE APOIO NÃO ESPERA REVISÃO: no desenho do Radar, a leitura de
   * apoio do YouTube e da Amazon não passa pela revisão humana da SERP. O
   * status padrão do snapshot ("needs_review") dizia "aguardando revisão
   * humana" de uma revisão que nunca vai existir. Revisão gravada, quando
   * houver, continua valendo acima.
   */
  if (input.serpRole === "SUPPORT" && (!porStatus[snapshot.status] || snapshot.status === "needs_review")) {
    return { status: "não se aplica (SERP de apoio, sem revisão humana no fluxo do Radar)", at: null };
  }
  return { status: porStatus[snapshot.status] || "aguardando revisão humana", at: null };
}

/** A decisão de um item, traduzida — e só quando ela descreve O MESMO item. */
function decisaoDe(
  mapa: ReadonlyMap<string, RadarPortableSerpDecision> | null,
  chave: string,
  limite: number,
  url?: string,
): { humanDecision: string | null; reason: string | null; ownDomain: boolean } {
  if (!mapa) return { humanDecision: null, reason: null, ownDomain: false };
  const decisao = mapa.get(chave);
  if (!decisao) return { humanDecision: SEM_DECISAO, reason: null, ownDomain: false };
  /*
   * A chave é posicional. Uma decisão gravada para outra URL na mesma posição
   * não vale para este resultado: aplicar seria dizer que alguém aprovou uma
   * página que ninguém viu.
   */
  if (url && decisao.url && limpo(decisao.url) !== limpo(url)) {
    return { humanDecision: "decisão registrada para outra página nesta posição; não aplicada", reason: null, ownDomain: false };
  }
  return {
    humanDecision: DECISAO[decisao.decision] || SEM_DECISAO,
    reason: textoPortatil(decisao.reason, limite) || textoPortatil(decisao.note, limite),
    ownDomain: Boolean(decisao.ownDomain),
  };
}

const SEM_SERP = "A investigação não referencia uma coleta de SERP do Google gravada; não há SERP observada a exportar.";

/**
 * Monta a SERP observada num nível de corte. Exportada para o teste e para
 * quem quiser o objeto; a coluna usa `radarPortableSerpObservedColumns`.
 */
export function radarPortableSerpObserved(input: RadarPortableSerpObservedInput, nivel = 0): RadarPortableSerpObserved {
  const l = NIVEIS_DA_SERP[Math.min(Math.max(0, nivel), NIVEIS_DA_SERP.length - 1)];
  const omitted: Record<string, number> = {};
  const contar = (chave: string, n: number) => { if (n > 0) omitted[chave] = (omitted[chave] || 0) + n; };
  const posterior = input.newerCollection
    ? {
      collectedAt: instante(input.newerCollection.collectedAt),
      statement: `Há coleta posterior à investigação (${dataLegivel(instante(input.newerCollection.collectedAt))}), não usada. Esta coluna descreve a SERP que a investigação analisou.`,
    }
    : null;

  const s = input.snapshot;
  if (!s) {
    return {
      available: false, unavailableReason: textoPortatil(input.unavailableReason, 400) || SEM_SERP,
      query: null, role: input.serpRole ? PAPEL_DA_SERP[input.serpRole] : null,
      country: null, language: null, location: null, device: null, operatingSystem: null,
      collectedAt: null, frozenAt: instante(input.frozenAt),
      review: { status: "sem SERP vinculada", at: null }, curation: "não se aplica",
      organic: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, features: null, diagnostic: null,
      auxiliaryQueries: [], omitted, absent: [], newerCollectionNotUsed: posterior, cellLimitNotice: null,
      thirdPartyNotice: AVISO_DE_TERCEIRO,
      usage: RADAR_PORTABLE_SERP_USAGE,
    };
  }

  const decisoes = input.serpDecisions?.length ? new Map(input.serpDecisions.map(item => [item.key, item])) : null;

  /* ---------------- orgânicos ---------------- */
  const ordenados = [...s.organicResults].sort((a, b) => a.position - b.position);
  const organicos = recorte(ordenados, l.organicos);
  contar("organic", organicos.omitidos);
  const organic = organicos.itens.map(item => {
    const decisao = decisaoDe(decisoes, `organic:${item.position}`, l.texto, item.url);
    const sitelinks = recorte(item.sitelinks, l.sitelinks);
    return {
      position: item.position,
      title: deTerceiro(item.title, l.titulo),
      url: item.url,
      domain: item.domain,
      type: tipoDeResultado(item.manualType || item.inferredType),
      typeSource: item.manualType ? "definido na revisão" as const : "inferido" as const,
      date: limpo(item.date) || null,
      snippet: l.trecho ? trechoDeTerceiro(item.snippet, l.trecho) : null,
      sitelinks: sitelinks.itens.map(link => ({ title: deTerceiro(link.title, l.titulo), url: link.url })),
      omittedSitelinks: sitelinks.omitidos,
      ownDomain: decisao.ownDomain,
      humanDecision: decisao.humanDecision,
      reason: decisao.reason,
    };
  });

  /* ---------------- Pessoas também perguntam ---------------- */
  const perguntas = recorte(s.peopleAlsoAsk, l.paa);
  contar("peopleAlsoAsk", perguntas.omitidos);
  const peopleAlsoAsk = perguntas.itens.map(item => {
    const decisao = decisaoDe(decisoes, `paa:${item.position}`, l.texto);
    const pergunta = deTerceiro(item.question, l.titulo);
    const titulo = deTerceiro(item.sourceTitle, l.titulo);
    return {
      position: item.position,
      question: pergunta,
      /* No PAA o título da fonte costuma ser a própria pergunta: repetir não informa. */
      sourceTitle: titulo && titulo !== pergunta ? titulo : null,
      sourceUrl: item.sourceUrl,
      answer: l.trecho ? trechoDeTerceiro(item.answer, l.trecho) : null,
      humanDecision: decisao.humanDecision,
      reason: decisao.reason,
    };
  });

  /* ---------------- buscas relacionadas: a chave é o índice ORIGINAL ---------------- */
  const relacionadas = recorte(s.relatedSearches.map((item, indice) => ({ item, chave: `related:${indice + 1}` })), l.relacionadas);
  contar("relatedSearches", relacionadas.omitidos);
  const relatedSearches = relacionadas.itens.map(({ item, chave }) => {
    const decisao = decisaoDe(decisoes, chave, l.texto);
    return { term: deTerceiro(item.term, l.titulo), humanDecision: decisao.humanDecision, reason: decisao.reason };
  });

  /* ---------------- painel de conhecimento ---------------- */
  let knowledgeGraph: RadarPortableSerpObserved["knowledgeGraph"] = null;
  if (s.knowledgeGraph) {
    const kg = s.knowledgeGraph;
    const atributos = recorte(Object.entries(kg.attributes), l.atributos);
    const fontes = recorte(kg.sources, l.fontesDoPainel);
    contar("knowledgeGraphAttributes", atributos.omitidos);
    contar("knowledgeGraphSources", fontes.omitidos);
    const decisao = decisaoDe(decisoes, "knowledge_graph:1", l.texto);
    knowledgeGraph = {
      title: deTerceiro(kg.title, l.titulo),
      type: deTerceiro(kg.type, l.titulo),
      description: l.trecho ? trechoDeTerceiro(kg.description, l.trecho) : null,
      attributes: atributos.itens.map(([nome, valor]) => ({ name: limpo(nome).replace(/_/g, " "), value: deTerceiro(valor, l.titulo) })),
      omittedAttributes: atributos.omitidos,
      website: kg.website,
      sources: fontes.itens.map(fonte => ({ title: deTerceiro(fonte.title, l.titulo), url: fonte.url })),
      omittedSources: fontes.omitidos,
      humanDecision: decisao.humanDecision,
      reason: decisao.reason,
    };
  }

  /* ---------------- blocos da página ---------------- */
  let features: RadarPortableSerpObserved["features"] = null;
  const f = s.serpFeatures;
  if (f) {
    const citacoes = recorte(f.aiOverview.references, l.citacoes);
    const videos = recorte(f.videos, l.videos);
    const imagens = recorte(f.visualOpportunities, l.imagens);
    const produtos = recorte(f.commercialSignals.products, l.produtos);
    const expansoes = recorte([
      ...f.questionMap.filter(item => item.source !== "PEOPLE_ALSO_ASK").map(item => ({ texto: item.question, origem: item.source })),
      ...f.entityMap.map(item => ({ texto: item.term, origem: item.source })),
    ], l.expansoes);
    contar("aiOverviewCitedSources", citacoes.omitidos);
    contar("videos", videos.omitidos);
    contar("images", imagens.omitidos);
    contar("products", produtos.omitidos);
    contar("expansions", expansoes.omitidos);
    features = {
      aiOverview: {
        shown: f.aiOverview.present || f.itemTypes.includes("ai_overview"),
        collected: f.aiOverview.present,
        citedSources: citacoes.itens.map(ref => ({ domain: ref.domain, title: deTerceiro(ref.title, l.titulo), url: ref.url })),
        omittedCitedSources: citacoes.omitidos,
      },
      videos: videos.itens.map(item => ({
        title: deTerceiro(item.title, l.titulo),
        format: item.block === "SHORT_VIDEOS" ? "vídeo curto" : "vídeo",
        platform: PLATAFORMA[item.platform] || "outra plataforma",
        url: item.url,
        domain: item.domain,
      })),
      images: imagens.itens.map(item => ({ alt: deTerceiro(item.alt, l.titulo), domain: item.sourceDomain })),
      products: produtos.itens.map(item => ({ title: deTerceiro(item.title, l.titulo), seller: item.seller, price: item.price, rating: item.rating, reviews: item.reviews })),
      expansions: expansoes.itens.map(item => ({ text: deTerceiro(item.texto, l.titulo), origin: ORIGEM_DA_EXPANSAO[item.origem] || "expansão da busca" })),
      formatsShown: unicos(f.itemTypes.map(limpo)).map(radarPortableSerpBlockLabel),
      collectedItemsByBlock: Object.entries(s.diagnostic.rawItemTypeCounts || {})
        .map(([tipo, quantidade]) => ({ block: radarPortableSerpBlockLabel(tipo), count: quantidade })),
      intentSignals: f.observedIntentSignals.map(item => textoPortatil(item, l.texto)).filter((item): item is string => Boolean(item)),
    };
  }

  /* ---------------- diagnóstico ---------------- */
  const d = s.diagnostic;
  const listaDoDiagnostico = (chave: string, itens: readonly string[], traduzir: (texto: string) => string | null = item => textoPortatil(item, l.texto)) => {
    const corte = recorte(itens.map(traduzir).filter((item): item is string => Boolean(item)), l.listasDoDiagnostico);
    contar(`diagnostic.${chave}`, corte.omitidos);
    return corte.itens;
  };
  const diagnostic: RadarPortableSerpObserved["diagnostic"] = {
    dominantIntent: intencao(d.dominantIntent),
    secondaryIntents: listaDoDiagnostico("secondaryIntents", d.secondaryIntents, item => intencao(item)),
    confidence: CONFIANCA[d.confidence] || d.confidence,
    dominantFormats: listaDoDiagnostico("dominantFormats", d.dominantFormats, item => tipoDeResultado(item)),
    pageTypes: listaDoDiagnostico("pageTypes", d.pageTypes, item => tipoDeResultado(item)),
    resultTypes: Object.entries(d.resultTypeCounts).map(([tipo, quantidade]) => ({ type: tipoDeResultado(tipo), count: quantidade })),
    titlePatterns: listaDoDiagnostico("titlePatterns", d.recurringTitlePatterns, item => textoPortatil(comTiposTraduzidos(item), l.texto)),
    snippetPatterns: listaDoDiagnostico("snippetPatterns", d.recurringSnippetPatterns),
    frequentEntities: listaDoDiagnostico("frequentEntities", d.frequentEntities),
    frequentDomains: listaDoDiagnostico("frequentDomains", d.frequentDomains),
    localSignals: listaDoDiagnostico("localSignals", d.localSignals),
    possibleConflicts: listaDoDiagnostico("possibleConflicts", d.possibleConflicts),
    opportunities: listaDoDiagnostico("opportunities", d.opportunities),
    limitations: listaDoDiagnostico("limitations", d.limitations),
    verdict: VEREDITO[d.verdict] || d.verdict,
  };

  /* ---------------- SERPs auxiliares: as das secundárias e reforços ---------------- */
  const auxiliares = recorte((input.deepResearchQueries || []).filter(item => item.serpClass === "auxiliary"), l.auxiliares);
  contar("auxiliaryQueries", auxiliares.omitidos);
  const auxiliaryQueries = auxiliares.itens.map(item => {
    const evidencia = item.evidence;
    const resultados = recorte([...(evidencia?.results || [])].sort((a, b) => a.position - b.position), l.resultadosAuxiliares);
    return {
      query: limpo(item.keyword) || null,
      role: PAPEL_DA_KEYWORD[item.role] || "auxiliar",
      execution: EXECUCAO[item.execution] || "situação não registrada",
      collectedAt: instante(evidencia?.collectedAt),
      observedIntent: intencao(evidencia?.observedIntent),
      resultCount: evidencia ? evidencia.resultCount : null,
      results: resultados.itens.map(resultado => ({
        position: resultado.position,
        title: deTerceiro(resultado.title, l.titulo),
        domain: limpo(resultado.domain) || null,
        url: l.urlsAuxiliares ? resultado.url : null,
        type: tipoDeResultado(resultado.inferredType),
      })),
      omittedResults: resultados.omitidos,
      reason: motivoDaAuxiliar(item, l.texto),
    };
  });

  const revisao = revisaoDe(input, s);
  return {
    available: true,
    unavailableReason: null,
    query: limpo(s.query) || null,
    role: input.serpRole ? PAPEL_DA_SERP[input.serpRole] : "SERP do Google vinculada à investigação",
    country: limpo(s.country).toUpperCase() || null,
    language: limpo(s.language) || null,
    location: localidade(s.location),
    device: DISPOSITIVO[s.device] || s.device,
    operatingSystem: s.operatingSystem ? SISTEMA[s.operatingSystem] || s.operatingSystem : null,
    collectedAt: instante(s.collectedAt),
    frozenAt: instante(input.frozenAt),
    review: revisao,
    /*
     * "Registrada" só quando alguém DECIDIU algo. Uma análise recém-criada
     * grava todos os itens como `pending`, e a ficha dizia "registrada" ao
     * lado de itens que diziam, um a um, "pendente".
     */
    curation: !decisoes
      ? "não registrada para esta SERP"
      : [...decisoes.values()].some(item => item.decision !== "pending")
        ? "registrada"
        : "iniciada, com todos os itens ainda pendentes",
    organic, peopleAlsoAsk, relatedSearches, knowledgeGraph, features, diagnostic, auxiliaryQueries,
    omitted,
    absent: ausenciasDe(s),
    newerCollectionNotUsed: posterior,
    cellLimitNotice: nivel > 0
      ? [
        "Listas reduzidas para caber numa célula de planilha; cada corte está declarado.",
        l.trecho ? "" : "Os trechos de terceiros (snippets, respostas e descrições) foram omitidos nesta célula.",
        l.urlsAuxiliares ? "" : "As URLs das SERPs auxiliares foram omitidas nesta célula; ficam o título e o domínio.",
      ].filter(Boolean).join(" ")
      : null,
    thirdPartyNotice: AVISO_DE_TERCEIRO,
    usage: RADAR_PORTABLE_SERP_USAGE,
  };
}

/* ------------------------------ o Markdown ------------------------------ */

const listaMd = (itens: readonly string[]): string[] => itens.filter(Boolean).map(item => `- ${item}`);

/* Uma subseção já abre com linha em branco: a seção não soma outra. */
const secao = (titulo: string, linhas: readonly string[]): string[] =>
  linhas.length ? ["", `## ${titulo}`, ...(linhas[0] === "" ? linhas : ["", ...linhas])] : [];

const subsecao = (titulo: string, linhas: readonly string[]): string[] =>
  linhas.length ? ["", `### ${titulo}`, "", ...linhas] : [];

const omitidosMd = (n: number, rotulo: string): string[] =>
  n > 0 ? [`- Mais ${n} ${rotulo} omitido(s) nesta célula.`] : [];

/* No Markdown a marca acompanha CADA trecho: é aqui que alguém lê e copia. */
const trechoMd = (trecho: RadarPortableThirdPartyExcerpt | null, rotulo = "Trecho"): string[] =>
  trecho ? [`  - ${rotulo} (${RADAR_PORTABLE_THIRD_PARTY_NOTICE}): "${trecho.thirdPartyExcerpt}"`] : [];

/*
 * "Sem decisão registrada" em cada linha repetiria a mesma frase vinte vezes.
 * No Markdown ela vira UMA contagem por lista; o JSON mantém item a item.
 */
const decisaoMd = (humanDecision: string | null, reason: string | null): string[] =>
  humanDecision && humanDecision !== SEM_DECISAO ? [`  - Curadoria: ${humanDecision}${reason ? ` — ${reason}` : ""}`] : [];

const semDecisaoMd = (itens: readonly { humanDecision: string | null }[], rotulo: string): string[] => {
  const n = itens.filter(item => item.humanDecision === SEM_DECISAO).length;
  return n ? [`- Sem decisão de curadoria registrada em ${n} ${rotulo} desta lista.`] : [];
};

export function radarPortableSerpObservedMarkdown(serp: RadarPortableSerpObserved): string {
  const cabecalho = [
    "# SERP observada na investigação",
    "",
    `Somente para pesquisa: não copiar trechos nem títulos de terceiros. Cada trecho marcado "${RADAR_PORTABLE_THIRD_PARTY_NOTICE}" está cortado em até ${RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT} caracteres.`,
  ];
  const aviso = serp.newerCollectionNotUsed ? ["", `> ${serp.newerCollectionNotUsed.statement}`] : [];
  const limite = serp.cellLimitNotice ? ["", `> ${serp.cellLimitNotice}`] : [];

  if (!serp.available) {
    return [...cabecalho, "", serp.unavailableReason || SEM_SERP, ...aviso].join("\n").trim();
  }

  const ficha = listaMd([
    `Consulta: ${serp.query || "não registrada"}`,
    serp.role ? `Papel: ${serp.role}` : "",
    `País: ${serp.country || "não registrado"} · Idioma: ${serp.language || "não registrado"} · Local: ${serp.location || "não registrado"}`,
    `Dispositivo: ${serp.device || "não registrado"} · Sistema: ${serp.operatingSystem || "não registrado nesta coleta"}`,
    `Coleta: ${dataLegivel(serp.collectedAt)}`,
    `Congelamento da investigação: ${serp.frozenAt ? dataLegivel(serp.frozenAt) : "não registrado"}`,
    `Revisão humana da SERP: ${serp.review.status}${serp.review.at ? ` em ${dataLegivel(serp.review.at)}` : ""}`,
    `Curadoria humana item a item: ${serp.curation}`,
  ]);

  const organicos = [
    ...serp.organic.flatMap(item => [
      `- #${item.position} · ${item.title || "sem título"} — ${item.domain} · tipo: ${item.type} (${item.typeSource})${item.date ? ` · data: ${item.date}` : ""}${item.ownDomain ? " · domínio da própria marca" : ""}`,
      `  - URL: ${item.url}`,
      ...(item.sitelinks.length
        ? [`  - Sitelinks: ${item.sitelinks.map(link => link.title || link.url).join(" · ")}${item.omittedSitelinks ? ` (mais ${item.omittedSitelinks} omitido(s) nesta célula)` : ""}`]
        : item.omittedSitelinks ? [`  - Sitelinks: ${item.omittedSitelinks} omitido(s) nesta célula`] : []),
      ...decisaoMd(item.humanDecision, item.reason),
      ...trechoMd(item.snippet),
    ]),
    ...semDecisaoMd(serp.organic, "resultado(s)"),
    ...omitidosMd(serp.omitted.organic || 0, "resultado(s) orgânico(s)"),
  ];

  const paa = [
    ...serp.peopleAlsoAsk.flatMap(item => [
      `- ${item.question || "pergunta sem texto"}`,
      ...(item.sourceTitle || item.sourceUrl ? [`  - Fonte: ${[item.sourceTitle, item.sourceUrl].filter(Boolean).join(" — ")}`] : []),
      ...decisaoMd(item.humanDecision, item.reason),
      ...trechoMd(item.answer, "Resposta"),
    ]),
    ...semDecisaoMd(serp.peopleAlsoAsk, "pergunta(s)"),
    ...omitidosMd(serp.omitted.peopleAlsoAsk || 0, "pergunta(s)"),
  ];

  const relacionadas = [
    ...serp.relatedSearches.map(item => `- ${item.term || "termo sem texto"}${item.humanDecision && item.humanDecision !== SEM_DECISAO ? ` · curadoria: ${item.humanDecision}${item.reason ? ` — ${item.reason}` : ""}` : ""}`),
    ...semDecisaoMd(serp.relatedSearches, "busca(s)"),
    ...omitidosMd(serp.omitted.relatedSearches || 0, "busca(s) relacionada(s)"),
  ];

  const kg = serp.knowledgeGraph;
  const painel = kg ? [
    `- ${kg.title || "entidade sem título"}${kg.type ? ` (${kg.type})` : ""}`,
    ...(kg.website ? [`  - Site: ${kg.website}`] : []),
    ...trechoMd(kg.description, "Descrição"),
    ...kg.attributes.map(item => `  - ${item.name}: ${item.value || "sem valor"}`),
    ...(kg.omittedAttributes ? [`  - Mais ${kg.omittedAttributes} atributo(s) omitido(s) nesta célula.`] : []),
    ...kg.sources.map(fonte => `  - Fonte: ${[fonte.title, fonte.url].filter(Boolean).join(" — ")}`),
    ...(kg.omittedSources ? [`  - Mais ${kg.omittedSources} fonte(s) omitida(s) nesta célula.`] : []),
    ...decisaoMd(kg.humanDecision, kg.reason),
  ] : [];

  const f = serp.features;
  const blocos = f ? [
    ...subsecao("AI Overview", [
      `- ${f.aiOverview.shown ? (f.aiOverview.collected ? "Apareceu nesta SERP." : "O Google exibiu, mas a coleta não trouxe o conteúdo.") : "Não gravado nesta coleta."}`,
      ...f.aiOverview.citedSources.map(ref => `- Cita: ${ref.domain}${ref.title ? ` — ${ref.title}` : ""}${ref.url ? ` — ${ref.url}` : ""}`),
      ...omitidosMd(f.aiOverview.omittedCitedSources, "fonte(s) citada(s)"),
    ]),
    ...subsecao("Vídeos", [
      ...f.videos.map(item => `- ${item.title || "sem título"} · ${item.format} · ${item.platform} — ${item.url}`),
      ...omitidosMd(serp.omitted.videos || 0, "vídeo(s)"),
    ]),
    ...subsecao("Imagens", [
      ...f.images.map(item => `- ${item.alt || "sem texto alternativo"}${item.domain ? ` — ${item.domain}` : ""}`),
      ...omitidosMd(serp.omitted.images || 0, "imagem(ns)"),
    ]),
    ...subsecao("Produtos", [
      ...f.products.map(item => `- ${[item.title || "produto sem título", item.seller, item.price, item.rating !== null ? `nota ${item.rating}` : null, item.reviews !== null ? `${item.reviews} avaliação(ões)` : null].filter(Boolean).join(" · ")}`),
      ...omitidosMd(serp.omitted.products || 0, "produto(s)"),
    ]),
    ...subsecao("Refinamentos e expansões da busca", [
      ...f.expansions.map(item => `- ${item.text || "sem texto"} (${item.origin})`),
      ...omitidosMd(serp.omitted.expansions || 0, "expansão(ões)"),
    ]),
    ...subsecao("Formatos que a página exibiu", listaMd(f.formatsShown)),
    ...subsecao("Itens que a coleta trouxe, por bloco", listaMd(f.collectedItemsByBlock.map(item => `${item.block}: ${item.count}`))),
    ...subsecao("Sinais de intenção", listaMd(f.intentSignals)),
  ] : ["", "A coleta não registrou os blocos da página (AI Overview, vídeos, imagens, produtos)."];

  const d = serp.diagnostic;
  const juntar = (itens: readonly string[]) => itens.length ? itens.join(" · ") : "";
  const diagnostico = d ? listaMd([
    `Intenção dominante: ${d.dominantIntent || "não identificada"}${d.secondaryIntents.length ? ` · secundárias: ${juntar(d.secondaryIntents)}` : ""} · confiança ${d.confidence}`,
    `Veredito: ${d.verdict}`,
    d.dominantFormats.length ? `Formatos dominantes: ${juntar(d.dominantFormats)}` : "",
    d.pageTypes.length ? `Tipos de página: ${juntar(d.pageTypes)}` : "",
    d.resultTypes.length ? `Resultados por tipo: ${d.resultTypes.map(item => `${item.type} ${item.count}`).join(" · ")}` : "",
    d.titlePatterns.length ? `Padrões de título: ${juntar(d.titlePatterns)}` : "",
    d.snippetPatterns.length ? `Padrões de snippet: ${juntar(d.snippetPatterns)}` : "",
    d.frequentEntities.length ? `Entidades frequentes: ${juntar(d.frequentEntities)}` : "",
    d.frequentDomains.length ? `Domínios frequentes: ${juntar(d.frequentDomains)}` : "",
    d.localSignals.length ? `Sinais locais: ${juntar(d.localSignals)}` : "",
    d.possibleConflicts.length ? `Conflitos possíveis: ${juntar(d.possibleConflicts)}` : "",
    d.opportunities.length ? `Oportunidades: ${juntar(d.opportunities)}` : "",
    d.limitations.length ? `Limitações do diagnóstico: ${juntar(d.limitations)}` : "",
  ]) : [];

  const auxiliares = [
    ...serp.auxiliaryQueries.flatMap(item => [
      "",
      `### ${item.query || "consulta sem texto resolvido"} (${item.role})`,
      "",
      `- Situação: ${item.execution}${item.collectedAt ? ` · coleta: ${dataLegivel(item.collectedAt)}` : ""}${item.observedIntent ? ` · intenção observada: ${item.observedIntent}` : ""}${item.resultCount !== null ? ` · ${item.resultCount} resultado(s)` : ""}`,
      ...(item.reason ? [`- Motivo: ${item.reason}`] : []),
      ...item.results.map(resultado => `- #${resultado.position} · ${resultado.title || "sem título"} — ${resultado.domain || "domínio não registrado"} · ${resultado.type}${resultado.url ? ` — ${resultado.url}` : ""}`),
      ...omitidosMd(item.omittedResults, "resultado(s)"),
    ]),
    ...(serp.omitted.auxiliaryQueries ? ["", `- Mais ${serp.omitted.auxiliaryQueries} consulta(s) auxiliar(es) omitida(s) nesta célula.`] : []),
  ];

  return [
    ...cabecalho,
    ...aviso,
    ...limite,
    "",
    ...ficha,
    ...secao(`Resultados orgânicos (${serp.organic.length + (serp.omitted.organic || 0)})`, organicos),
    ...secao(`Pessoas também perguntam (${serp.peopleAlsoAsk.length + (serp.omitted.peopleAlsoAsk || 0)})`, paa),
    ...secao(`Buscas relacionadas (${serp.relatedSearches.length + (serp.omitted.relatedSearches || 0)})`, relacionadas),
    ...secao("Painel de conhecimento", painel),
    ...secao("Blocos da página", blocos),
    ...secao("Diagnóstico da SERP", diagnostico),
    ...(auxiliares.length ? ["", "## SERPs das consultas auxiliares (secundárias e reforços)", ...auxiliares] : ["", "## SERPs das consultas auxiliares (secundárias e reforços)", "", "Nenhuma consulta auxiliar registrada na investigação."]),
    ...secao("O que esta coleta não traz", listaMd(serp.absent)),
  ].join("\n").trim();
}

/* ======================= o resumo do contexto completo ======================= */

/** Quantos itens de cada lista o resumo mostra. O detalhe fica em `serp_observed_md`. */
const TETO_DO_RESUMO = { organicos: 10, perguntas: 10, relacionadas: 10, citados: 10 } as const;

/**
 * ===== A SERP EM RESUMO, PARA O CONTEXTO COMPLETO (writer_context_md) =====
 *
 * `writer_context_md` é a célula que se cola inteira em outra IA. Ela já traz
 * a leitura das páginas extraídas, mas não a busca como o Google a mostrou.
 * Aqui entra o mínimo que orienta a escrita — quem ocupa o top 10, o que as
 * pessoas perguntam, o que se busca ao lado, quem o AI Overview cita — SEM
 * trecho de terceiro nem curadoria item a item: o contexto completo não pode
 * virar uma segunda cópia de `serp_observed_md`, e um snippet colado numa IA
 * é o primeiro passo para ele aparecer no texto.
 *
 * Ausência continua dita: sem SERP vinculada, sai a razão; sem perguntas, sai
 * que a coleta não as trouxe — nunca que o Google não as mostrou.
 */
export function radarPortableSerpObservedBriefMarkdown(serp: RadarPortableSerpObserved): string {
  const cabecalho = "# SERP observada";
  if (!serp.available) return [cabecalho, "", serp.unavailableReason || SEM_SERP].join("\n");

  const perguntas = unicos(serp.peopleAlsoAsk.map(item => item.question || ""));
  const relacionadas = unicos(serp.relatedSearches.map(item => item.term || ""));
  const citados = unicos((serp.features?.aiOverview.citedSources || []).map(ref => ref.domain));
  const aio = serp.features?.aiOverview;
  const mais = (total: number, teto: number) => (total > teto ? ` (mais ${total - teto} em serp_observed_md)` : "");

  return [
    cabecalho,
    "",
    `Consulta: ${serp.query || "não registrada"} · ${serp.device || "dispositivo não registrado"}${serp.operatingSystem ? ` · ${serp.operatingSystem}` : ""} · coleta ${dataLegivel(serp.collectedAt)}.`,
    `Somente para pesquisa: não copiar títulos nem termos de terceiros como texto do artigo. Trechos, curadoria, blocos da página, SERPs auxiliares e ausências estão em serp_observed_md.`,
    ...(serp.newerCollectionNotUsed ? ["", `> ${serp.newerCollectionNotUsed.statement}`] : []),
    "",
    "Top 10 orgânico:",
    ...(serp.organic.length
      ? serp.organic.slice(0, TETO_DO_RESUMO.organicos).map(item => `${item.position}. ${item.title || "sem título"} · ${item.domain} · ${item.url}`)
      : ["- Não há resultados orgânicos gravados nesta coleta."]),
    "",
    perguntas.length
      ? `Pessoas também perguntam: ${perguntas.slice(0, TETO_DO_RESUMO.perguntas).join(" · ")}${mais(perguntas.length, TETO_DO_RESUMO.perguntas)}`
      : "Pessoas também perguntam: nenhuma pergunta gravada nesta coleta (serp_observed_md diz se o bloco foi exibido e a coleta não o trouxe).",
    relacionadas.length
      ? `Buscas relacionadas: ${relacionadas.slice(0, TETO_DO_RESUMO.relacionadas).join(" · ")}${mais(relacionadas.length, TETO_DO_RESUMO.relacionadas)}`
      : "Buscas relacionadas: nenhuma gravada nesta coleta.",
    citados.length
      ? `Citados no AI Overview: ${citados.slice(0, TETO_DO_RESUMO.citados).join(" · ")}${mais(citados.length, TETO_DO_RESUMO.citados)}`
      : aio?.shown
        ? "Citados no AI Overview: o AI Overview apareceu, mas a coleta não trouxe as fontes que ele cita."
        : "Citados no AI Overview: não há AI Overview gravado nesta coleta.",
  ].join("\n").trim();
}

/* =============================== o ajuste à célula =============================== */

/**
 * O ÚLTIMO RECURSO DO MARKDOWN: cortar e dizer onde.
 *
 * Só é alcançado se nem o nível mais enxuto couber — com os tetos atuais, é
 * teórico. Ainda assim, uma célula estourada é pior que uma cortada com aviso.
 */
function cortarMarkdown(md: string, orcamento: number): string {
  if (md.length <= orcamento) return md;
  const aviso = (n: number) => `\n\n> Célula cortada aqui para caber no limite de uma célula de planilha: ${n} caractere(s) omitido(s).`;
  const reserva = aviso(md.length).length + 1;
  const corpo = md.slice(0, Math.max(0, orcamento - reserva));
  const quebra = corpo.lastIndexOf("\n");
  const mantido = quebra > 0 ? corpo.slice(0, quebra) : corpo;
  return `${mantido}${aviso(md.length - mantido.length)}`;
}

export type RadarPortableSerpObservedColumns = { serp_observed_md: string; serp_observed_json: string };

/**
 * AS DUAS COLUNAS DA SERP OBSERVADA, já ajustadas à célula.
 *
 * Tenta o nível 0; só desce de nível se o Markdown OU o JSON passar do
 * orçamento. Os dois saem do MESMO nível: o JSON nunca tem item que o
 * Markdown não tem.
 */
export function radarPortableSerpObservedColumns(
  input: RadarPortableSerpObservedInput,
  orcamento = RADAR_PORTABLE_SERP_CELL_BUDGET,
): RadarPortableSerpObservedColumns {
  let ultimo: RadarPortableSerpObservedColumns | null = null;
  for (let nivel = 0; nivel < NIVEIS_DA_SERP.length; nivel += 1) {
    const serp = radarPortableSerpObserved(input, nivel);
    const colunas = { serp_observed_md: radarPortableSerpObservedMarkdown(serp), serp_observed_json: JSON.stringify(serp) };
    if (colunas.serp_observed_md.length <= orcamento && colunas.serp_observed_json.length <= orcamento) return colunas;
    ultimo = colunas;
  }
  /*
   * Nem o nível mais enxuto coube. O JSON não pode ser cortado no meio (deixaria
   * de ser JSON): sai o esqueleto com o aviso, e o Markdown sai cortado com o
   * aviso no ponto do corte.
   */
  const enxuto = radarPortableSerpObserved(input, NIVEIS_DA_SERP.length - 1);
  const esqueleto = {
    available: enxuto.available, query: enxuto.query, collectedAt: enxuto.collectedAt, frozenAt: enxuto.frozenAt,
    device: enxuto.device, operatingSystem: enxuto.operatingSystem, review: enxuto.review,
    organic: enxuto.organic.map(item => ({ position: item.position, domain: item.domain, url: item.url })),
    absent: enxuto.absent.slice(0, 5),
    newerCollectionNotUsed: enxuto.newerCollectionNotUsed,
    cellLimitNotice: "A SERP não coube numa célula de planilha nem reduzida: saem só a ficha e os endereços dos orgânicos. O Markdown ao lado traz o restante até o ponto do corte.",
    usage: RADAR_PORTABLE_SERP_USAGE,
  };
  const json = JSON.stringify(esqueleto);
  return {
    serp_observed_md: cortarMarkdown(ultimo?.serp_observed_md || radarPortableSerpObservedMarkdown(enxuto), orcamento),
    serp_observed_json: json.length <= orcamento ? json : JSON.stringify({ cellLimitNotice: esqueleto.cellLimitNotice, usage: RADAR_PORTABLE_SERP_USAGE }),
  };
}

/* ============================ a SERP por lente ============================ */

export type RadarPortableSerpLensKeyword = {
  keyword: string;
  role: "principal" | "secundaria" | "reforco_narrativo";
  /** Só para o pedido ao cache; nunca é exportado. */
  keywordId?: string | null;
};

/** O pedido ao cache, na forma exata de `SerpCacheRequest` (lib/server/serp-cache.ts). */
export type RadarPortableSerpLensRequest = { query: SerpCacheQuery; depth: number; keywordId: string | null };

/**
 * OS PEDIDOS AO CACHE — keyword × lente, no mesmo formato da SERP por keyword
 * do Arquiteto.
 *
 * `advanced` e profundidade 10 porque é o que todo gravador serve: a CALL 3 do
 * Minerador grava 20 no `advanced`, as três lentes extras gravam 10 no
 * `advanced`, e a SERP por keyword do Arquiteto também. Um pedido `regular`
 * nunca acertaria entrada nenhuma. Leitura em modo `observation` (R8 da SDD
 * de egress): ~1 KB por entrada, sem corpo.
 *
 * ==================== OS CÓDIGOS SÃO OS DO ALVO DA KEYWORD (A8) ====================
 *
 * A chave do cache inclui localidade e idioma, e o Minerador grava com os
 * códigos do ALVO da keyword (o targeting da medição), não com os do
 * ambiente. `codesFor` devolve os códigos de cada keyword pela mesma regra
 * (`serpTargetCodesFor` do Arquiteto); `locationCode`/`languageCode` são os
 * do ambiente, para quem não tem alvo resolvido. Sem `codesFor`, todo pedido
 * usa os do ambiente — o comportamento anterior. A mesma keyword pedida por
 * dois artigos vale um pedido: os códigos do primeiro.
 */
export function radarPortableSerpLensRequests(input: {
  keywords: readonly RadarPortableSerpLensKeyword[];
  locationCode: number;
  languageCode: string;
  lenses?: readonly SerpCacheLens[];
  codesFor?: (keywordId: string | null) => { locationCode: number; languageCode: string };
}): RadarPortableSerpLensRequest[] {
  const lentes = input.lenses || SERP_CACHE_LENSES;
  const vistas = new Set<string>();
  const pedidos: RadarPortableSerpLensRequest[] = [];
  for (const item of input.keywords) {
    const texto = limpo(item.keyword);
    const chave = normalizeSerpCacheKeyword(texto);
    if (!texto || vistas.has(chave)) continue;
    vistas.add(chave);
    const codigos = input.codesFor
      ? input.codesFor(item.keywordId ?? null)
      : { locationCode: input.locationCode, languageCode: input.languageCode };
    for (const lens of lentes) {
      pedidos.push({
        query: { keyword: texto, locationCode: codigos.locationCode, languageCode: codigos.languageCode, lens, endpoint: "advanced" },
        depth: SERP_CACHE_OBSERVATION_DEPTH,
        keywordId: item.keywordId ?? null,
      });
    }
  }
  return pedidos;
}

/**
 * O resultado de `lookupSerpCache`, no recorte que esta coluna lê.
 * `providerRequestId`, `keywordId` e `collectedBy` de `meta` nem entram no tipo.
 */
export type RadarPortableSerpLensLookup = {
  request: { query: Pick<SerpCacheQuery, "keyword" | "lens"> };
  hit: { meta: Pick<SerpCacheMeta, "collectedAt">; observation?: SerpCacheObservation } | null;
  missReason: string | null;
};

export type RadarPortableSerpLensesInput = {
  keywords: readonly RadarPortableSerpLensKeyword[];
  lookups: readonly RadarPortableSerpLensLookup[];
  /** A leitura do cache falhou: toda lente vira "não lida", nunca "sem coleta". */
  readFailed?: boolean;
  lenses?: readonly SerpCacheLens[];
};

export type RadarPortableSerpLensReading = {
  lens: string;
  label: string;
  observed: boolean;
  collectedAt: string | null;
  organicCount: number | null;
  competitorDomains: string[];
  omittedCompetitorDomains: number;
  questions: string[];
  omittedQuestions: number;
  relatedSearches: string[];
  omittedRelatedSearches: number;
  aiOverviewDomains: string[];
  omittedAiOverviewDomains: number;
  commercialSignals: boolean | null;
  blocks: string[];
  missing: string | null;
};

export type RadarPortableSerpLenses = {
  source: string;
  note: string;
  lenses: string[];
  keywords: Array<{
    keyword: string;
    role: string;
    readings: RadarPortableSerpLensReading[];
    divergence: {
      observedLenses: number;
      averageDistance: number | null;
      sharedByAllLenses: string[];
      omittedSharedByAllLenses: number;
      onlyInOneLens: Array<{ lens: string; domains: string[]; omitted: number }>;
      blocksOnlyInOneLens: Array<{ lens: string; blocks: string[] }>;
      statement: string;
    };
  }>;
  omittedKeywords: number;
  limitations: string[];
  cellLimitNotice: string | null;
  usage: typeof RADAR_PORTABLE_SERP_USAGE;
};

type LimitesDasLentes = { keywords: number; dominios: number; perguntas: number; relacionadas: number; citados: number; exclusivos: number; texto: number };

const NIVEIS_DAS_LENTES: readonly LimitesDasLentes[] = [
  { keywords: 8, dominios: 10, perguntas: 8, relacionadas: 8, citados: 10, exclusivos: 10, texto: 200 },
  { keywords: 8, dominios: 10, perguntas: 5, relacionadas: 5, citados: 5, exclusivos: 6, texto: 150 },
  { keywords: 6, dominios: 6, perguntas: 3, relacionadas: 3, citados: 3, exclusivos: 4, texto: 120 },
  { keywords: 6, dominios: 3, perguntas: 0, relacionadas: 0, citados: 0, exclusivos: 2, texto: 100 },
];

/**
 * POR QUE A LENTE NÃO TEM OBSERVAÇÃO — dito em português, sem jargão de chave.
 *
 * As frases de origem são as de `serpCacheEntryServes` e `lookupSerpCache`.
 */
function motivoDaFalta(motivo: string | null, leituraFalhou: boolean): string {
  if (leituraFalhou) return "sem observação válida no cache: a leitura do cache falhou nesta exportação";
  const texto = limpo(motivo);
  const traducao: Record<string, string> = {
    "sem entrada": "nenhuma coleta desta lente no cache",
    "validade vencida": "a observação gravada venceu a validade do cache",
    "data de coleta ilegível": "a observação gravada tem data de coleta ilegível",
    "data de coleta no futuro": "a observação gravada tem data de coleta no futuro",
    "outra keyword na mesma chave": "a entrada encontrada é de outra consulta",
    "outra localidade": "a entrada encontrada é de outra localidade",
    "outro idioma": "a entrada encontrada é de outro idioma",
    "outra lente": "a entrada encontrada é de outra lente",
    "outro endpoint": "a entrada encontrada é de outro modo de coleta",
    "recoleta pedida": "a leitura foi dispensada",
  };
  if (!texto) return "sem observação válida no cache";
  if (/^coletada com/.test(texto)) return "sem observação válida no cache: a entrada gravada tem menos resultados que o necessário";
  return `sem observação válida no cache: ${traducao[texto] || textoPortatil(texto, 120) || "motivo não registrado"}`;
}

export function radarPortableSerpLenses(input: RadarPortableSerpLensesInput, nivel = 0): RadarPortableSerpLenses {
  const l = NIVEIS_DAS_LENTES[Math.min(Math.max(0, nivel), NIVEIS_DAS_LENTES.length - 1)];
  const lentes = input.lenses || SERP_CACHE_LENSES;
  const limitations: string[] = [];

  /* A mesma consulta pedida duas vezes vale uma: a primeira com observação vence. */
  const leituras = new Map<string, RadarPortableSerpLensLookup>();
  for (const consulta of input.lookups) {
    const chave = `${normalizeSerpCacheKeyword(consulta.request.query.keyword)}|${serpCacheLensLabel(consulta.request.query.lens)}`;
    const atual = leituras.get(chave);
    if (!atual || (!atual.hit?.observation && consulta.hit?.observation)) leituras.set(chave, consulta);
  }

  const vistas = new Set<string>();
  const keywordsValidas = input.keywords.filter(item => {
    const chave = normalizeSerpCacheKeyword(limpo(item.keyword));
    if (!chave) {
      limitations.push("Uma keyword do artigo não tem texto resolvido e não foi consultada no cache.");
      return false;
    }
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  const corteDeKeywords = recorte(keywordsValidas, l.keywords);

  const keywords = corteDeKeywords.itens.map(item => {
    const texto = limpo(item.keyword);
    const readings: RadarPortableSerpLensReading[] = lentes.map(lens => {
      const tecnico = serpCacheLensLabel(lens);
      const consulta = leituras.get(`${normalizeSerpCacheKeyword(texto)}|${tecnico}`);
      const obs = consulta?.hit?.observation;
      if (!consulta || !obs || input.readFailed) {
        return {
          lens: tecnico, label: radarPortableLensLabel(lens), observed: false, collectedAt: null, organicCount: null,
          competitorDomains: [], omittedCompetitorDomains: 0, questions: [], omittedQuestions: 0,
          relatedSearches: [], omittedRelatedSearches: 0, aiOverviewDomains: [], omittedAiOverviewDomains: 0,
          commercialSignals: null, blocks: [],
          missing: consulta?.hit && !obs && !input.readFailed
            ? "sem observação válida no cache: a entrada não traz a observação compacta"
            : motivoDaFalta(consulta ? consulta.missReason : "sem entrada", Boolean(input.readFailed)),
        };
      }
      const dominios = recorte(unicos(obs.competitorDomains), l.dominios);
      const perguntas = recorte(unicos(obs.questions), l.perguntas);
      const relacionadas = recorte(unicos(obs.relatedSearches), l.relacionadas);
      const citados = recorte(unicos(obs.aiOverviewDomains), l.citados);
      return {
        lens: tecnico,
        label: radarPortableLensLabel(lens),
        observed: true,
        collectedAt: instante(consulta.hit?.meta.collectedAt),
        organicCount: obs.organicCount,
        competitorDomains: dominios.itens,
        omittedCompetitorDomains: dominios.omitidos,
        questions: perguntas.itens.map(pergunta => deTerceiro(pergunta, l.texto) || pergunta),
        omittedQuestions: perguntas.omitidos,
        relatedSearches: relacionadas.itens.map(termo => deTerceiro(termo, l.texto) || termo),
        omittedRelatedSearches: relacionadas.omitidos,
        aiOverviewDomains: citados.itens,
        omittedAiOverviewDomains: citados.omitidos,
        commercialSignals: obs.commercialSignals,
        blocks: unicos(obs.itemTypes.map(limpo)).map(radarPortableSerpBlockLabel),
        missing: null,
      };
    });

    /*
     * A DIVERGÊNCIA É CALCULADA SOBRE AS LISTAS INTEIRAS, não sobre o recorte
     * da célula: cortar o top 10 para caber não pode inventar um domínio
     * "exclusivo" de uma lente.
     */
    const observadas = lentes.flatMap(lens => {
      const obs = leituras.get(`${normalizeSerpCacheKeyword(texto)}|${serpCacheLensLabel(lens)}`)?.hit?.observation;
      return obs && !input.readFailed ? [{ lens, obs }] : [];
    });
    const conjuntos = observadas.map(item => ({ lens: item.lens, dominios: unicos(item.obs.competitorDomains), blocos: unicos(item.obs.itemTypes.map(limpo)) }));
    const emTodas = recorte(
      conjuntos.length > 1 ? conjuntos[0].dominios.filter(dominio => conjuntos.every(outra => outra.dominios.includes(dominio))) : [],
      l.dominios,
    );
    const soNumaLente = conjuntos.length > 1
      ? conjuntos.map(atual => {
        const exclusivos = atual.dominios.filter(dominio => conjuntos.every(outra => outra === atual || !outra.dominios.includes(dominio)));
        const corte = recorte(exclusivos, l.exclusivos);
        return { lens: serpCacheLensLabel(atual.lens), domains: corte.itens, omitted: corte.omitidos, total: exclusivos.length };
      }).filter(item => item.total > 0)
      : [];
    const blocosSoNumaLente = conjuntos.length > 1
      ? conjuntos.map(atual => ({
        lens: serpCacheLensLabel(atual.lens),
        blocks: atual.blocos.filter(bloco => conjuntos.every(outra => outra === atual || !outra.blocos.includes(bloco))).map(radarPortableSerpBlockLabel),
      })).filter(item => item.blocks.length)
      : [];
    const distancia = conjuntos.length > 1
      ? Math.round(lensDivergenceOf(conjuntos.map(item => ({
        keywordId: texto, lens: serpCacheLensLabel(item.lens), competitorDomains: item.dominios,
        organicCount: 0, itemTypes: item.blocos, questions: [], commercialSignals: false,
      }))) * 100) / 100
      : null;

    const statement = conjuntos.length === 0
      ? "Nenhuma lente tem observação válida no cache para esta keyword: não há divergência a medir."
      : conjuntos.length === 1
        ? `Só a lente ${serpCacheLensLabel(conjuntos[0].lens)} tem observação válida: não há divergência a medir.`
        : soNumaLente.length
          ? `${conjuntos.length} de ${lentes.length} lentes observadas. ${soNumaLente.reduce((total, item) => total + item.total, 0)} domínio(s) aparecem só numa lente; distância média entre lentes ${String(distancia).replace(".", ",")} (0 = mesmo universo de domínios; 1 = nenhum em comum).`
          : `${conjuntos.length} de ${lentes.length} lentes observadas, e todas devolvem o mesmo universo de domínios.`;

    return {
      keyword: texto,
      role: PAPEL_DA_KEYWORD[item.role] || "keyword do artigo",
      readings,
      divergence: {
        observedLenses: conjuntos.length,
        averageDistance: distancia,
        sharedByAllLenses: emTodas.itens,
        omittedSharedByAllLenses: emTodas.omitidos,
        onlyInOneLens: soNumaLente.map(({ lens, domains, omitted }) => ({ lens, domains, omitted })),
        blocksOnlyInOneLens: blocosSoNumaLente,
        statement,
      },
    };
  });

  if (input.readFailed) limitations.push("A leitura do cache de SERP falhou nesta exportação: nenhuma lente foi lida, o que não quer dizer que não haja coleta.");
  if (!keywordsValidas.length) limitations.push("O artigo não tem keyword com texto resolvido para consultar no cache.");

  return {
    source: "cache de SERP da marca",
    note: "Leitura do cache de SERP da marca no momento da exportação, só com observações dentro da validade. Não faz parte da investigação congelada: cada lente tem a própria data de coleta, que pode ser anterior ou posterior à investigação.",
    lenses: lentes.map(serpCacheLensLabel),
    keywords,
    omittedKeywords: corteDeKeywords.omitidos,
    limitations: unicos(limitations),
    cellLimitNotice: nivel > 0 ? "Listas reduzidas para caber numa célula de planilha; cada corte está declarado." : null,
    usage: RADAR_PORTABLE_SERP_USAGE,
  };
}

const listaCurtaMd = (rotulo: string, itens: readonly string[], omitidos: number): string =>
  itens.length
    ? `- ${rotulo}: ${itens.join(" · ")}${omitidos ? ` (mais ${omitidos} omitido(s) nesta célula)` : ""}`
    : `- ${rotulo}: ${omitidos ? `${omitidos} omitido(s) nesta célula` : "nenhum(a)"}`;

export function radarPortableSerpLensesMarkdown(lentes: RadarPortableSerpLenses): string {
  return [
    "# SERP por lente (cache da marca)",
    "",
    lentes.note,
    "",
    `Lentes: ${lentes.lenses.join(" · ")}. Somente para pesquisa: não copiar títulos nem termos como texto do artigo.`,
    ...(lentes.cellLimitNotice ? ["", `> ${lentes.cellLimitNotice}`] : []),
    ...(lentes.keywords.length ? [] : ["", "Nenhuma keyword do artigo foi consultada no cache."]),
    ...lentes.keywords.flatMap(item => [
      "",
      `## ${item.keyword} (${item.role})`,
      ...item.readings.flatMap(leitura => leitura.observed
        ? [
          "",
          `### ${leitura.lens} (${leitura.label}) — coletada em ${dataLegivel(leitura.collectedAt)}`,
          "",
          listaCurtaMd("Domínios concorrentes (top 10 orgânico e citados pela IA)", leitura.competitorDomains, leitura.omittedCompetitorDomains),
          listaCurtaMd("Perguntas (PAA e expansões)", leitura.questions, leitura.omittedQuestions),
          listaCurtaMd("Buscas relacionadas", leitura.relatedSearches, leitura.omittedRelatedSearches),
          listaCurtaMd("Citados no AI Overview", leitura.aiOverviewDomains, leitura.omittedAiOverviewDomains),
          `- Sinais comerciais: ${leitura.commercialSignals ? "sim" : "não"}`,
          `- Blocos da página: ${leitura.blocks.length ? leitura.blocks.join(" · ") : "não registrados"}`,
        ]
        : ["", `### ${leitura.lens} (${leitura.label}) — ${leitura.missing}`]),
      "",
      "### Divergência entre lentes",
      "",
      `- ${item.divergence.statement}`,
      ...(item.divergence.sharedByAllLenses.length ? [`- Em todas as lentes observadas: ${item.divergence.sharedByAllLenses.join(" · ")}${item.divergence.omittedSharedByAllLenses ? ` (mais ${item.divergence.omittedSharedByAllLenses} omitido(s) nesta célula)` : ""}`] : []),
      ...item.divergence.onlyInOneLens.map(exclusivo => `- Só em ${exclusivo.lens}: ${exclusivo.domains.join(" · ")}${exclusivo.omitted ? ` (mais ${exclusivo.omitted} omitido(s) nesta célula)` : ""}`),
      ...item.divergence.blocksOnlyInOneLens.map(exclusivo => `- Blocos só em ${exclusivo.lens}: ${exclusivo.blocks.join(" · ")}`),
    ]),
    ...(lentes.omittedKeywords ? ["", `- Mais ${lentes.omittedKeywords} keyword(s) omitida(s) nesta célula.`] : []),
    ...(lentes.limitations.length ? ["", "## Limitações", "", ...listaMd(lentes.limitations)] : []),
  ].join("\n").trim();
}

export type RadarPortableSerpLensesColumns = { serp_lenses_md: string; serp_lenses_json: string };

/** As duas colunas das lentes, do mesmo nível de corte e já ajustadas à célula. */
export function radarPortableSerpLensesColumns(
  input: RadarPortableSerpLensesInput,
  orcamento = RADAR_PORTABLE_SERP_CELL_BUDGET,
): RadarPortableSerpLensesColumns {
  let ultimo: RadarPortableSerpLensesColumns | null = null;
  for (let nivel = 0; nivel < NIVEIS_DAS_LENTES.length; nivel += 1) {
    const lentes = radarPortableSerpLenses(input, nivel);
    const colunas = { serp_lenses_md: radarPortableSerpLensesMarkdown(lentes), serp_lenses_json: JSON.stringify(lentes) };
    if (colunas.serp_lenses_md.length <= orcamento && colunas.serp_lenses_json.length <= orcamento) return colunas;
    ultimo = colunas;
  }
  const enxuto = radarPortableSerpLenses(input, NIVEIS_DAS_LENTES.length - 1);
  const esqueleto = {
    source: enxuto.source,
    lenses: enxuto.lenses,
    keywords: enxuto.keywords.map(item => ({ keyword: item.keyword, role: item.role, statement: item.divergence.statement })),
    cellLimitNotice: "As lentes não couberam numa célula de planilha nem reduzidas: saem só as keywords e a síntese da divergência. O Markdown ao lado traz o restante até o ponto do corte.",
    usage: RADAR_PORTABLE_SERP_USAGE,
  };
  const json = JSON.stringify(esqueleto);
  return {
    serp_lenses_md: cortarMarkdown(ultimo?.serp_lenses_md || radarPortableSerpLensesMarkdown(enxuto), orcamento),
    serp_lenses_json: json.length <= orcamento ? json : JSON.stringify({ cellLimitNotice: esqueleto.cellLimitNotice, usage: RADAR_PORTABLE_SERP_USAGE }),
  };
}
