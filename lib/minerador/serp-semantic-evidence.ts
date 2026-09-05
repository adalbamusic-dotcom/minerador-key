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
 */

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
  /** Amostra compacta para auditoria humana; nunca o payload bruto. */
  sample: Array<{ position: number; domain: string; intent: string; funnel: string; signals: string[] }>;
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
  { label: "Informativa", terms: ["como", "o que e", "por que", "guia", "passo a passo", "para que serve", "beneficios", "dicas", "tudo sobre", "significa", "rotina", "receita"] },
];

/** Sinais próprios do Funil. Não existe herança automática da Intenção. */
const FUNNEL_MARKERS: Array<{ label: string; terms: string[] }> = [
  { label: "BOFU", terms: ["comprar", "preco", "orcamento", "agendar", "contratar", "assine", "frete", "cupom", "fale com", "kit ", "oferta"] },
  { label: "MOFU", terms: ["melhor", "melhores", "comparativo", "review", "resenha", "vale a pena", "alternativas", "qual escolher", "diferenca entre", "antes e depois"] },
  { label: "TOFU", terms: ["o que e", "como", "por que", "guia", "passo a passo", "para que serve", "beneficios", "tipos de", "significa", "rotina"] },
];

function classify(markers: Array<{ label: string; terms: string[] }>, haystack: string): string | null {
  const value = normalize(haystack);
  return markers.find(marker => marker.terms.some(term => value.includes(normalize(term))))?.label || null;
}

/** Padrões de URL que denunciam página de produto/loja. */
const PRODUCT_URL = /\/(produto|produtos|p|item|comprar|loja|shop|store|catalogo)\//i;
const EDITORIAL_URL = /\/(blog|artigo|artigos|guia|guias|dicas|conteudo|magazine|revista)\//i;

/** A força continua provisória: cobertura, dominância e mínimo observado. */
const CONCLUSIVE_DOMINANCE = 0.6;
const MIXED_DOMINANCE = 0.4;
const MINIMUM_OBSERVED = 5;
/** Abaixo desta cobertura, nenhuma dominância vira conclusão. */
const CONCLUSIVE_COVERAGE = 0.5;
const MINIMUM_COVERAGE = 0.3;
export const SERP_DERIVATION_VERSION = "serp-semantic-derivation-v2";

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
  ai_overview: { label: "AI overview (observado)" },
  images: { label: "Imagens" },
  related_searches: { label: "Buscas relacionadas" },
  knowledge_graph: { label: "Knowledge graph" },
};

/**
 * Lê a resposta orgânica da DataForSEO para a keyword natural. Nunca aceita a
 * resposta de outra consulta: a keyword do resultado precisa corresponder, o
 * que impede usar a SERP da consulta allintitle como evidência semântica.
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
  const root = asRecord(input.body);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const task = asRecord(tasks[0]);
  const results = Array.isArray(task?.result) ? task.result : [];
  const result = asRecord(results[0]);
  if (!result) return null;
  if (normalize(text(result.keyword)) !== normalize(input.keyword)) return null;

  const items = Array.isArray(result.items) ? result.items.map(asRecord).filter((item): item is JsonObject => Boolean(item)) : [];
  const organic = items.filter(item => text(item.type) === "organic");
  const featureBlocks = items.filter(item => text(item.type) !== "organic");

  const intentCounts = new Map<string, number>();
  const funnelCounts = new Map<string, number>();
  const intentStructural: StructuralSignal[] = [];
  const funnelStructural: StructuralSignal[] = [];
  const intentReinforcement = new Map<string, number>();
  const funnelReinforcement = new Map<string, number>();
  const sample: SerpSemanticEvidence["sample"] = [];
  let intentClassified = 0;
  let funnelClassified = 0;

  const add = (counts: Map<string, number>, label: string, weight = 1) => counts.set(label, (counts.get(label) || 0) + weight);

  organic.forEach((item, index) => {
    const url = text(item.url);
    const haystack = [
      text(item.title),
      text(item.description) || text(item.snippet),
      text(item.extended_snippet),
      text(item.pre_snippet),
      url,
      text(item.breadcrumb),
      text(item.website_name),
    ].join(" ");
    const price = asRecord(item.price);
    const rating = asRecord(item.rating);
    const signals: string[] = [];

    let intentLabel = classify(INTENT_MARKERS, haystack);
    let funnelLabel = classify(FUNNEL_MARKERS, haystack);

    // Sinais estruturais do item: decidem quando o texto não diz nada.
    if (price && (typeof price.current === "number" || text(price.displayed_price))) {
      signals.push("preço");
      intentLabel = intentLabel || "Transacional";
      funnelLabel = funnelLabel || "BOFU";
    }
    if (PRODUCT_URL.test(url) || /\.html?$/.test(url) && rating) {
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
    if (EDITORIAL_URL.test(url)) {
      signals.push("página editorial");
      intentLabel = intentLabel || "Informativa";
      funnelLabel = funnelLabel || "TOFU";
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

    if (intentLabel) { add(intentCounts, intentLabel); intentClassified += 1; }
    if (funnelLabel) { add(funnelCounts, funnelLabel); funnelClassified += 1; }
    if (sample.length < 12) {
      sample.push({
        position: typeof item.rank_group === "number" ? item.rank_group : index + 1,
        domain: text(item.domain) || url,
        intent: intentLabel || "indefinido",
        funnel: funnelLabel || "indefinido",
        signals,
      });
    }
  });

  // Blocos de feature contam como sinal estrutural da SERP inteira, e não como
  // resultados observados: eles reforçam a leitura sem inflar a cobertura.
  const featureCounts = new Map<string, number>();
  for (const block of featureBlocks) {
    const type = text(block.type);
    if (!type) continue;
    featureCounts.set(type, (featureCounts.get(type) || 0) + 1);
  }
  for (const type of featureCounts.keys()) {
    const weights = FEATURE_WEIGHTS[type];
    if (!weights) continue;
    if (weights.intent) {
      // Reforço não vira contagem de item: entra só como desempate na força.
      intentReinforcement.set(weights.intent.label, (intentReinforcement.get(weights.intent.label) || 0) + weights.intent.weight);
      intentStructural.push({ signal: type, label: weights.label, weight: weights.intent.weight });
    }
    if (weights.funnel) {
      funnelReinforcement.set(weights.funnel.label, (funnelReinforcement.get(weights.funnel.label) || 0) + weights.funnel.weight);
      funnelStructural.push({ signal: type, label: weights.label, weight: weights.funnel.weight });
    }
    if (!weights.intent && !weights.funnel) {
      intentStructural.push({ signal: type, label: weights.label, weight: 0 });
    }
  }

  const observed = organic.length;
  return {
    query: input.keyword,
    collectedAt: input.collectedAt,
    provider: "dataforseo",
    providerRequestId: input.providerRequestId,
    operationRequestId: input.operationRequestId,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    device: input.device || "desktop",
    observedResults: observed,
    serpFeatures: [...featureCounts.entries()].map(([type, count]) => ({ type, count })),
    intent: buildSignal({ counts: intentCounts, observed, classified: intentClassified, structural: intentStructural, structuralByLabel: intentReinforcement }),
    funnel: buildSignal({ counts: funnelCounts, observed, classified: funnelClassified, structural: funnelStructural, structuralByLabel: funnelReinforcement }),
    sample,
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
