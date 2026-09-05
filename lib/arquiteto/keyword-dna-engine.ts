import { KeywordDNASchema, type KeywordDNA } from "./contracts.ts";

export const LOGICAL_KEYWORD_DNA_MODEL = "keyword-concept-ptbr-v1";

const LOGICAL_FIELD_KEYS = [
  "dna_schema_version",
  "dna_origem",
  "dna_modelo",
  "dna_confianca",
  "dna_revisao_humana",
  "dna_campos_logicos",
  "intencao_principal",
  "intencao_ambigua",
  "intencao_secundaria",
  "tipo_editorial",
  "entidade_central",
  "modificadores",
  "publico",
  "problema_percebido",
  "resultado_desejado",
  "job_to_be_done",
  "nivel_consciencia",
  "etapa_jornada",
  "potencial_comercial",
  "potencial_afiliado",
  "urgencia_tempo",
  "intencao_local",
  "formato_esperado",
  "objecao_implicita",
  "emocao_dominante",
  "risco_canibalizacao",
  "candidato_review",
  "pesquisa_produto_necessaria",
  "evidencias_logicas",
] as const;

export type KeywordSemanticRecord = Record<string, string>;

export interface LogicalKeywordDnaInput {
  keywordId: string;
  keyword: string;
  intent?: string | null;
  niche?: string | null;
  location?: string | null;
  existingSemantic?: Record<string, unknown> | null;
}

export interface LogicalKeywordDnaResult {
  dna: KeywordDNA;
  intentLabel: string;
  semantic: KeywordSemanticRecord;
  evidence: string[];
}

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const hasAny = (text: string, terms: string[]) => terms.some(term => text.includes(term));

const tokens = (text: string) => normalize(text).split(" ").filter(Boolean);

const QUERY_TERMS = new Set([
  "a", "as", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "o", "os", "para", "por",
  "que", "qual", "quais", "como", "onde", "quando", "quanto", "quem", "porque", "melhor", "melhores", "preco", "valor",
  "perto", "mim", "guia", "tutorial", "dicas", "review", "avaliacao", "comparar", "comparacao", "comprar", "contratar",
  "instalar", "funciona", "funcionar", "reduzir", "resolver", "evitar", "usar", "fazer", "criar", "montar", "aprender",
  "escolher", "encontrar", "avaliar", "implementar", "configurar", "calcular", "e", "é",
]);

const COMMERCIAL_TERMS = ["melhor", "melhores", "comparar", "comparacao", "versus", " vs ", "review", "avaliacao", "ranking", "top ", "vale a pena", "custo beneficio", "clinica", "dentista", "advogado", "agencia", "empresa de"];
const TRANSACTIONAL_TERMS = ["comprar", "contratar", "preco", "valor", "orcamento", "cupom", "desconto", "promocao", "agendar", "consulta", "servico"];
const INFORMATIONAL_TERMS = ["como", "o que", "por que", "porque", "quando", "guia", "tutorial", "dicas", "passo a passo", "significado", "funciona", "beneficios", "sintomas"];
const LOCAL_TERMS = ["perto de mim", "proximo", "a domicilio", "em domicilio", "atendimento domiciliar", "na minha cidade", "em sao paulo", "em sp", "em rio de janeiro", "no rio", "em curitiba", "em brasilia", "em belo horizonte"];
const URGENT_TERMS = ["agora", "urgente", "24 horas", "hoje", "imediato", "rapido", "emergencia"];
const B2B_TERMS = ["empresa", "empresas", "clinica", "clinicas", "condominio", "condominios", "negocio", "negocios", "profissional", "escritorio", "ecommerce", "loja", "b2b"];
const PROBLEM_TERMS = ["problema", "erro", "dor", "sintoma", "nao funciona", "como resolver", "como evitar", "perda", "baixo", "falta", "sem "];
const PRODUCT_TERMS = ["produto", "modelo", "marca", "kit", "equipamento", "software", "ferramenta", "curso", "suplemento"];
const RELATION_MARKERS = new Set(["a", "de", "do", "da", "dos", "das", "para", "com", "sem", "em", "no", "na", "nos", "nas", "vs", "versus", "perto"]);
const MODIFIER_SIGNAL_TERMS = new Set(["preco", "valor", "melhor", "melhores", "comparar", "comparacao", "versus", "vs", "review", "avaliacao", "ranking", "comprar", "contratar", "orcamento", "cupom", "desconto", "instalar", "reduzir", "resolver", "evitar", "urgente", "agora"]);
const QUALIFIER_TERMS = new Set(["pequeno", "pequena", "pequenos", "pequenas", "grande", "grandes", "residencial", "comercial", "infantil", "profissional", "premium", "barato", "barata", "online", "presencial", "local", "urbano", "rural"]);
const AUDIENCE_TERMS = [...B2B_TERMS, "crianca", "criancas", "bebe", "idoso", "idosos", "familia", "familias", "jovem", "jovens", "adulto", "adultos", "estudante", "estudantes"];

type KeywordStructure = {
  entity: string;
  entityTokens: string[];
  modifiers: string[];
  relationGroups: string[];
  relationMarkers: string[];
  audienceContext: string | null;
  leadingSignals: string[];
};

function isContentToken(value: string) {
  return value.length > 1 && !QUERY_TERMS.has(value) && !RELATION_MARKERS.has(value);
}

function significantPhrase(tokensToRead: string[]) {
  return tokensToRead.filter(token => isContentToken(token)).join(" ").trim();
}

function hasAudienceSignal(value: string) {
  return AUDIENCE_TERMS.some(term => value.includes(term));
}

function decomposeKeyword(keyword: string): KeywordStructure {
  const sourceTokens = tokens(keyword);
  const leadingSignals: string[] = [];
  let start = 0;

  while (start < sourceTokens.length) {
    const token = sourceTokens[start];
    if (QUERY_TERMS.has(token) || RELATION_MARKERS.has(token)) {
      if (MODIFIER_SIGNAL_TERMS.has(token)) leadingSignals.push(token);
      start += 1;
      continue;
    }
    break;
  }

  const remaining = sourceTokens.slice(start);
  const boundaryIndex = remaining.findIndex(token => RELATION_MARKERS.has(token));
  const coreTokens = (boundaryIndex >= 0 ? remaining.slice(0, boundaryIndex) : remaining)
    .filter(token => isContentToken(token) && !MODIFIER_SIGNAL_TERMS.has(token));
  const fallbackEntityTokens = sourceTokens.filter(token => isContentToken(token) && !MODIFIER_SIGNAL_TERMS.has(token));
  const entityTokens = coreTokens.length > 0 ? [...coreTokens] : fallbackEntityTokens.slice(0, 5);
  const trailingModifiers: string[] = [];

  while (entityTokens.length > 2 && QUALIFIER_TERMS.has(entityTokens[entityTokens.length - 1])) {
    trailingModifiers.unshift(entityTokens.pop() as string);
  }

  const relationGroups: string[] = [];
  const relationMarkers: string[] = [];
  let audienceContext: string | null = null;
  let cursor = boundaryIndex >= 0 ? boundaryIndex : remaining.findIndex(token => RELATION_MARKERS.has(token));

  while (cursor >= 0 && cursor < remaining.length) {
    const marker = remaining[cursor];
    const nearbyPhrase = marker === "perto" && remaining[cursor + 1] === "de" && remaining[cursor + 2] === "mim";
    const nextBoundary = nearbyPhrase
      ? remaining.slice(cursor + 3).findIndex(token => RELATION_MARKERS.has(token))
      : remaining.slice(cursor + 1).findIndex(token => RELATION_MARKERS.has(token));
    const end = nextBoundary >= 0
      ? nearbyPhrase ? cursor + 3 + nextBoundary : cursor + 1 + nextBoundary
      : remaining.length;
    const rawGroupTokens = remaining.slice(cursor, end);
    const content = significantPhrase(rawGroupTokens.slice(1));
    const localPhrase = marker === "perto" && rawGroupTokens.includes("mim");
    if (content || localPhrase) {
      relationMarkers.push(marker);
      relationGroups.push(rawGroupTokens.join(" "));
      if (!audienceContext && marker === "para" && hasAudienceSignal(content)) audienceContext = content;
    }
    cursor = nextBoundary >= 0 ? end : -1;
  }

  const modifiers = [...new Set([
    ...leadingSignals,
    ...relationGroups,
    ...trailingModifiers,
  ])].filter(value => MODIFIER_SIGNAL_TERMS.has(value) || value === "perto de mim" || significantPhrase(tokens(value)).length > 0);

  const entity = entityTokens.join(" ") || normalize(keyword) || keyword.trim();
  return { entity, entityTokens, modifiers, relationGroups, relationMarkers, audienceContext, leadingSignals };
}

function detectIntent(text: string, structure: KeywordStructure) {
  if (hasAny(text, LOCAL_TERMS)) return { value: "local" as const, label: "Local", evidence: "marcador geográfico explícito", ambiguous: false };
  if (hasAny(text, TRANSACTIONAL_TERMS)) return { value: "transactional" as const, label: "Vendas", evidence: "verbo ou modificador de ação comercial", ambiguous: false };
  if (hasAny(text, COMMERCIAL_TERMS)) return { value: "commercial_investigation" as const, label: "Comercial", evidence: "marcador de comparação ou avaliação", ambiguous: false };
  if (structure.audienceContext) return { value: "commercial_investigation" as const, label: "Comercial", evidence: "solução relacionada explicitamente a um público ou contexto", ambiguous: false };
  if (hasAny(text, INFORMATIONAL_TERMS)) return { value: "informational" as const, label: "Informativo", evidence: "formulação de aprendizado ou pergunta", ambiguous: false };
  return { value: "informational" as const, label: "Pendente", evidence: "intenção não identificável pela estrutura disponível; requer revisão", ambiguous: true };
}

function existingIntent(value: string | null | undefined) {
  const label = value?.trim();
  if (!label) return null;
  const normalized = normalize(label);
  if (["pendente", "nao classificada", "nao_classificada", "unknown", "desconhecida"].includes(normalized)) return null;
  if (normalized.includes("local")) return { value: "local" as const, label, evidence: "classificação existente preservada", ambiguous: false };
  if (normalized.includes("venda") || normalized.includes("transac")) return { value: "transactional" as const, label, evidence: "classificação existente preservada", ambiguous: false };
  if (normalized.includes("comercial")) return { value: "commercial_investigation" as const, label, evidence: "classificação existente preservada", ambiguous: false };
  if (normalized.includes("navega")) return { value: "navigational" as const, label, evidence: "classificação existente preservada", ambiguous: false };
  return { value: "informational" as const, label, evidence: "classificação existente preservada", ambiguous: false };
}

function detectEditorialType(text: string): KeywordDNA["likelyEditorialType"] {
  const trimmed = text.trim();
  if (hasAny(text, [" versus ", " vs ", "comparar", "comparacao"])) return "comparison";
  if (hasAny(text, ["melhor", "melhores", "ranking", "top "])) return "best_list";
  if (hasAny(text, ["review", "avaliacao", "vale a pena"])) return "review";
  if (hasAny(text, ["como fazer", "como instalar", "como configurar", "como usar", "passo a passo", "tutorial"])) return "tutorial";
  if (/^(o que|qual|quais|quanto|quando|onde|por que|porque)\b/.test(trimmed)) return "question";
  if (hasAny(text, PROBLEM_TERMS)) return "problem_solution";
  if (hasAny(text, PRODUCT_TERMS) && hasAny(text, ["comprar", "preco", "modelo", "marca"])) return "individual_product";
  if (hasAny(text, ["tipos de", "categoria", "servicos de"])) return "category";
  return "guide";
}

function describeAudience(text: string, structure: KeywordStructure) {
  if (structure.audienceContext) {
    if (hasAny(structure.audienceContext, ["crianca", "criancas", "bebe"])) return "Responsável buscando uma solução para criança ou bebê";
    if (hasAny(structure.audienceContext, ["idoso", "idosos", "terceira idade"])) return "Pessoa idosa ou responsável por seus cuidados";
    return `Responsável por ${structure.audienceContext}`;
  }
  if (hasAny(text, ["para crianca", "infantil", "bebe"])) return "Responsável buscando uma solução para criança ou bebê";
  if (hasAny(text, ["para idoso", "idosos", "terceira idade"])) return "Pessoa idosa ou responsável por seus cuidados";
  if (hasAny(text, B2B_TERMS)) return "Responsável por um negócio ou operação profissional";
  return null;
}

function describeProblem(text: string, entity: string, intent: KeywordDNA["searchIntent"], structure: KeywordStructure) {
  if (hasAny(text, PROBLEM_TERMS)) return `Precisa compreender ou resolver um problema relacionado a ${entity}`;
  if (intent === "transactional") return `Precisa escolher e acessar uma solução para ${entity}`;
  if (intent === "commercial_investigation" && structure.audienceContext) return `Precisa avaliar a adequação de ${entity} ao contexto ${structure.audienceContext}`;
  if (intent === "commercial_investigation") return `Tem dificuldade para comparar alternativas de ${entity}`;
  if (intent === "local") return `Precisa encontrar uma opção confiável de ${entity} na região desejada`;
  if (hasAny(text, ["como funciona", "o que e", "o que é"])) return `Tem uma dúvida sobre o funcionamento de ${entity}`;
  return null;
}

function describeResult(entity: string, intent: KeywordDNA["searchIntent"], text: string, structure: KeywordStructure) {
  if (intent === "transactional") return `Tomar uma decisão e avançar na contratação ou compra de ${entity}`;
  if (intent === "commercial_investigation" && structure.audienceContext) return `Avaliar e escolher ${entity} adequado ao contexto ${structure.audienceContext}`;
  if (intent === "commercial_investigation") return `Comparar critérios e escolher a alternativa de ${entity} mais adequada`;
  if (intent === "local") return `Encontrar e avaliar uma opção local de ${entity}`;
  if (hasAny(text, ["como funciona", "o que e", "o que é"])) return `Entender o funcionamento de ${entity}`;
  if (hasAny(text, ["como instalar", "como configurar", "como usar", "como reduzir", "como resolver", "como evitar"])) {
    return `Saber ${text.replace(/^como\s+/, "")}`;
  }
  return null;
}

function journey(intent: KeywordDNA["searchIntent"]) {
  if (intent === "transactional" || intent === "local") return { awareness: "Consciente da solução", stage: "Decisão" };
  if (intent === "commercial_investigation") return { awareness: "Consciente das soluções", stage: "Consideração" };
  return { awareness: "Consciente do problema ou tema", stage: "Descoberta" };
}

function commercialPotential(intent: KeywordDNA["searchIntent"]): KeywordDNA["commercialPotential"] {
  if (intent === "transactional" || intent === "local") return "high";
  if (intent === "commercial_investigation") return "medium";
  return "low";
}

function secondaryIntent(intent: KeywordDNA["searchIntent"], text: string) {
  if (intent === "transactional" && hasAny(text, COMMERCIAL_TERMS)) return "Investigação comercial";
  if (intent === "commercial_investigation") return "Informativa para apoiar a comparação";
  if (intent === "local") return "Transacional local";
  return hasAny(text, TRANSACTIONAL_TERMS) ? "Transacional" : "Nenhuma intenção secundária inequívoca";
}

function confidenceFor(input: {
  entityTokenCount: number;
  modifierCount: number;
  relationCount: number;
  hasAudience: boolean;
  hasPersistedContext: boolean;
  explicitIntent: boolean;
  ambiguous: boolean;
}) {
  let score = 0.28;
  if (input.entityTokenCount > 0) score += 0.1;
  if (input.entityTokenCount > 1) score += 0.08;
  if (input.modifierCount > 0) score += 0.08;
  if (input.relationCount > 0) score += 0.1;
  if (input.hasAudience) score += 0.08;
  if (input.hasPersistedContext) score += 0.05;
  if (input.explicitIntent) score += 0.12;
  if (!input.ambiguous) score += 0.06;
  if (input.ambiguous) score -= 0.12;
  return Math.min(0.9, Math.max(0.2, Number(score.toFixed(2))));
}

export function deriveLogicalKeywordDna(input: LogicalKeywordDnaInput): LogicalKeywordDnaResult {
  const text = normalize(input.keyword);
  const structure = decomposeKeyword(input.keyword);
  const intent = existingIntent(input.intent) || detectIntent(text, structure);
  const editorialType = detectEditorialType(` ${text} `);
  const entity = structure.entity;
  const keywordModifiers = structure.modifiers;
  const path = journey(intent.value);
  const productResearchRequired = hasAny(text, PRODUCT_TERMS) && ["review", "comparison", "best_list", "individual_product"].includes(editorialType);
  const reviewCandidate = editorialType === "review" || text.includes("vale a pena");
  const locality = hasAny(text, LOCAL_TERMS) ? "Localidade explícita na busca" : input.location?.trim() || "Sem localidade explícita";
  const urgency = hasAny(text, URGENT_TERMS) ? "Alta e explícita" : intent.value === "transactional" ? "Moderada" : "Não explícita";
  const evidence = [intent.evidence, `entidade central identificada: ${entity}`];
  if (keywordModifiers.length) evidence.push(`modificadores significativos: ${keywordModifiers.join(", ")}`);
  if (structure.relationGroups.length) evidence.push(`relações semânticas: ${structure.relationGroups.join("; ")}`);
  if (structure.audienceContext) evidence.push(`público/contexto explícito: ${structure.audienceContext}`);
  if (input.niche?.trim() && input.niche.trim().toLocaleLowerCase("pt-BR") !== "geral") evidence.push(`contexto de nicho disponível: ${input.niche.trim()}`);
  if (input.location?.trim()) evidence.push(`contexto de localização disponível: ${input.location.trim()}`);
  if (editorialType !== "guide") evidence.push(`formato editorial: ${editorialType}`);
  if (intent.ambiguous) evidence.push("ambiguidade residual: termo ou intenção sem contexto suficiente");
  const audience = describeAudience(text, structure);
  const problem = describeProblem(text, entity, intent.value, structure);
  const result = describeResult(entity, intent.value, text, structure);
  const confidence = confidenceFor({
    entityTokenCount: structure.entityTokens.length,
    modifierCount: keywordModifiers.length,
    relationCount: structure.relationGroups.length,
    hasAudience: Boolean(audience),
    hasPersistedContext: Boolean((input.niche?.trim() && input.niche.trim().toLocaleLowerCase("pt-BR") !== "geral") || input.location?.trim()),
    explicitIntent: !intent.ambiguous,
    ambiguous: intent.ambiguous,
  });
  const commercial = commercialPotential(intent.value);
  const affiliate = productResearchRequired ? (commercial === "high" ? "high" : "medium") : "none";
  const objection = intent.value === "transactional"
    ? "Custo, confiança e adequação da solução"
    : intent.value === "commercial_investigation"
      ? "Dúvida sobre qual alternativa realmente atende ao caso"
      : "Receio de aplicar informação incompleta ou inadequada";
  const emotion = hasAny(text, ["dor", "urgente", "emergencia", "problema", "erro"]) ? "Preocupação" : intent.value === "transactional" ? "Expectativa" : "Curiosidade";

  const dna = KeywordDNASchema.parse({
    schemaVersion: 1,
    keywordId: input.keywordId,
    searchIntent: intent.value,
    likelyEditorialType: editorialType,
    centralEntity: entity,
    modifiers: keywordModifiers,
    audience: audience || "Audiência não determinada pela keyword",
    perceivedProblem: problem || "Problema não determinado pela keyword",
    desiredResult: result || "Resultado não determinado pela keyword",
    awarenessLevel: path.awareness,
    journeyStage: path.stage,
    objections: [objection],
    dominantEmotion: emotion,
    commercialPotential: commercial,
    affiliatePotential: affiliate,
    reviewCandidate,
    productResearchRequired,
    stampOrigin: "system",
    confidence,
    humanConfirmed: false,
  });

  const semantic: KeywordSemanticRecord = {
    dna_schema_version: "1",
    dna_origem: "logico_deterministico",
    dna_modelo: LOGICAL_KEYWORD_DNA_MODEL,
    dna_confianca: String(confidence),
    dna_revisao_humana: "pendente",
    dna_campos_logicos: "",
    intencao_principal: intent.label,
    entidade_central: entity,
    modificadores: keywordModifiers.join(", ") || "Nenhum modificador explícito",
    urgencia_tempo: urgency,
    intencao_local: locality,
    evidencias_logicas: evidence.join("; "),
  };

  if (intent.ambiguous) semantic.intencao_ambigua = "sim";
  if (!intent.ambiguous || audience || problem || result) {
    semantic.intencao_secundaria = secondaryIntent(intent.value, text);
    semantic.tipo_editorial = editorialType;
    semantic.formato_esperado = editorialType;
    semantic.potencial_comercial = commercial;
    semantic.potencial_afiliado = affiliate;
    semantic.objecao_implicita = objection;
    semantic.emocao_dominante = emotion;
    semantic.risco_canibalizacao = text.split(" ").length <= 2 ? "Moderado: termo amplo; revisar contra keywords próximas" : "Baixo no nível lexical; validar no agrupamento";
    semantic.candidato_review = reviewCandidate ? "sim" : "não";
    semantic.pesquisa_produto_necessaria = productResearchRequired ? "sim" : "não";
  }
  if (audience) semantic.publico = audience;
  if (problem) semantic.problema_percebido = problem;
  if (result) {
    semantic.resultado_desejado = result;
    semantic.job_to_be_done = `Quando pesquisa “${input.keyword.trim()}”, a pessoa quer ${result.toLowerCase()}.`;
  }
  if (!intent.ambiguous || problem || result) {
    semantic.nivel_consciencia = path.awareness;
    semantic.etapa_jornada = path.stage;
  }

  return { dna, intentLabel: intent.label, semantic, evidence };
}

const isPresent = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";

/**
 * Atualiza somente campos que estavam vazios ou que pertencem a uma execução
 * lógica anterior. Campos humanos, importados ou produzidos por IA são preservados.
 */
export function mergeLogicalKeywordSemantic(
  existing: Record<string, unknown> | null | undefined,
  logical: KeywordSemanticRecord,
  options: { forceLogical?: boolean } = {},
): KeywordSemanticRecord {
  const current = { ...(existing || {}) };
  const forceLogical = options.forceLogical === true;
  const previouslyOwned = new Set(
    typeof current.dna_campos_logicos === "string"
      ? current.dna_campos_logicos.split(",").map(key => key.trim()).filter(Boolean)
      : [],
  );
  const owned = new Set(previouslyOwned);
  const humanMarkers = [
    current.dna_revisao_humana,
    current.dna_origem,
    current.intencao_origem,
    current.intent_source,
    current.nicho_origem,
    current.funnel_source,
    current.funnel_decision_origin,
  ]
    .map(value => String(value || "").toLowerCase());
  const humanProtected = humanMarkers.some(value => ["aprovado", "confirmado", "confirmed", "human", "humano", "manual", "humana"].includes(value));

  for (const key of LOGICAL_FIELD_KEYS) {
    if (key === "dna_campos_logicos") continue;
    if (!isPresent(logical[key])) {
      if (previouslyOwned.has(key) && !humanProtected) {
        delete current[key];
        owned.delete(key);
      }
      continue;
    }
    if ((!humanProtected && forceLogical) || (previouslyOwned.has(key) && !humanProtected) || !isPresent(current[key])) {
      current[key] = logical[key];
      owned.add(key);
    }
  }
  current.dna_campos_logicos = [...owned].sort().join(",");

  return Object.fromEntries(Object.entries(current).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
}

export function semanticRecordsEqual(left: Record<string, unknown> | null | undefined, right: Record<string, unknown>) {
  const normalizeRecord = (record: Record<string, unknown> | null | undefined) => Object.keys(record || {})
    .sort()
    .map(key => [key, record?.[key]]);
  return JSON.stringify(normalizeRecord(left)) === JSON.stringify(normalizeRecord(right));
}

export function autoClassifyIntent(keyword: string) {
  return deriveLogicalKeywordDna({ keywordId: `logical:${normalize(keyword)}`, keyword }).intentLabel;
}

export function autoDetectNiche(keyword: string) {
  const text = normalize(keyword);
  if (hasAny(text, ["dente", "dentista", "aparelho", "clareamento", "canal", "ortodont", "implante", "siso"])) return "Odontologia";
  if (hasAny(text, ["advogado", "processo", "lei", "direito", "pensao", "divorcio", "trabalhista", "justica"])) return "Advocacia";
  if (hasAny(text, ["medico", "consulta", "clinica", "pediatra", "dor", "terapia", "psicologo", "pilates", "fisioterapia"])) return "Saúde";
  if (hasAny(text, ["cabelo", "unha", "unhas", "manicure", "pedicure", "depilacao", "massagem", "maquiagem", "estetica", "sobrancelha", "cilios", "harmonizacao"])) return "Estética";
  if (hasAny(text, ["treino", "academia", "dieta", "personal", "whey", "emagrecer", "crossfit"])) return "Fitness";
  if (hasAny(text, ["encanador", "eletricista", "pintor", "reforma", "construcao", "ar condicionado", "limpeza", "chaveiro", "desentupidora"])) return "Serviços";
  if (hasAny(text, ["seo", "marketing", "site", "trafego", "leads", "anuncio", "vendas online"])) return "Marketing";
  return "Geral";
}
