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
]);

const COMMERCIAL_TERMS = ["melhor", "melhores", "comparar", "comparacao", "versus", " vs ", "review", "avaliacao", "ranking", "top ", "vale a pena", "custo beneficio", "clinica", "dentista", "advogado", "agencia", "empresa de"];
const TRANSACTIONAL_TERMS = ["comprar", "contratar", "preco", "valor", "orcamento", "cupom", "desconto", "promocao", "agendar", "consulta", "servico"];
const INFORMATIONAL_TERMS = ["como", "o que", "por que", "porque", "quando", "guia", "tutorial", "dicas", "passo a passo", "significado", "funciona", "beneficios", "sintomas"];
const LOCAL_TERMS = ["perto de mim", "proximo", "na minha cidade", "em sao paulo", "em sp", "em rio de janeiro", "no rio", "em curitiba", "em brasilia", "em belo horizonte"];
const URGENT_TERMS = ["agora", "urgente", "24 horas", "hoje", "imediato", "rapido", "emergencia"];
const B2B_TERMS = ["empresa", "empresas", "clinica", "clinicas", "negocio", "negocios", "profissional", "escritorio", "ecommerce", "loja", "b2b"];
const PROBLEM_TERMS = ["problema", "erro", "dor", "sintoma", "nao funciona", "como resolver", "como evitar", "perda", "baixo", "falta", "sem "];
const PRODUCT_TERMS = ["produto", "modelo", "marca", "kit", "equipamento", "software", "ferramenta", "curso", "suplemento"];

function detectIntent(text: string) {
  if (hasAny(text, LOCAL_TERMS)) return { value: "local" as const, label: "Local", evidence: "marcador geográfico explícito" };
  if (hasAny(text, TRANSACTIONAL_TERMS)) return { value: "transactional" as const, label: "Vendas", evidence: "verbo ou modificador de ação comercial" };
  if (hasAny(text, COMMERCIAL_TERMS)) return { value: "commercial_investigation" as const, label: "Comercial", evidence: "marcador de comparação ou avaliação" };
  if (hasAny(text, INFORMATIONAL_TERMS)) return { value: "informational" as const, label: "Informativo", evidence: "formulação de aprendizado ou pergunta" };
  return { value: "informational" as const, label: "Informativo", evidence: "ausência de marcador comercial inequívoco" };
}

function existingIntent(value: string | null | undefined) {
  const label = value?.trim();
  if (!label) return null;
  const normalized = normalize(label);
  if (normalized.includes("local")) return { value: "local" as const, label, evidence: "classificação existente preservada" };
  if (normalized.includes("venda") || normalized.includes("transac")) return { value: "transactional" as const, label, evidence: "classificação existente preservada" };
  if (normalized.includes("comercial")) return { value: "commercial_investigation" as const, label, evidence: "classificação existente preservada" };
  if (normalized.includes("navega")) return { value: "navigational" as const, label, evidence: "classificação existente preservada" };
  return { value: "informational" as const, label, evidence: "classificação existente preservada" };
}

function detectEditorialType(text: string): KeywordDNA["likelyEditorialType"] {
  const trimmed = text.trim();
  if (hasAny(text, [" versus ", " vs ", "comparar", "comparacao"])) return "comparison";
  if (hasAny(text, ["melhor", "melhores", "ranking", "top "])) return "best_list";
  if (hasAny(text, ["review", "avaliacao", "vale a pena"])) return "review";
  if (hasAny(text, ["como fazer", "passo a passo", "tutorial"])) return "tutorial";
  if (/^(o que|qual|quais|quanto|quando|onde|por que|porque)\b/.test(trimmed)) return "question";
  if (hasAny(text, PROBLEM_TERMS)) return "problem_solution";
  if (hasAny(text, PRODUCT_TERMS) && hasAny(text, ["comprar", "preco", "modelo", "marca"])) return "individual_product";
  if (hasAny(text, ["tipos de", "categoria", "servicos de"])) return "category";
  return "guide";
}

function centralEntity(keyword: string) {
  const meaningful = tokens(keyword).filter(token => !QUERY_TERMS.has(token));
  return meaningful.slice(0, 5).join(" ") || normalize(keyword) || keyword.trim();
}

function modifiers(keyword: string, entity: string) {
  const entityTokens = new Set(tokens(entity));
  return tokens(keyword).filter(token => !entityTokens.has(token) && token.length > 1);
}

function describeAudience(text: string, niche?: string | null) {
  if (hasAny(text, B2B_TERMS)) return `Responsável por ${niche && niche !== "Geral" ? niche.toLowerCase() : "um negócio ou operação profissional"}`;
  if (hasAny(text, ["para crianca", "infantil", "bebe"])) return "Responsável buscando uma solução para criança ou bebê";
  if (hasAny(text, ["para idoso", "idosos", "terceira idade"])) return "Pessoa idosa ou responsável por seus cuidados";
  return `Pessoa pesquisando diretamente sobre ${centralEntity(text)}`;
}

function describeProblem(text: string, entity: string, intent: KeywordDNA["searchIntent"]) {
  if (hasAny(text, PROBLEM_TERMS)) return `Precisa compreender ou resolver um problema relacionado a ${entity}`;
  if (intent === "transactional") return `Precisa escolher e acessar uma solução para ${entity}`;
  if (intent === "commercial_investigation") return `Tem dificuldade para comparar alternativas de ${entity}`;
  if (intent === "local") return `Precisa encontrar uma opção confiável de ${entity} na região desejada`;
  return `Tem uma dúvida ou lacuna de conhecimento sobre ${entity}`;
}

function describeResult(entity: string, intent: KeywordDNA["searchIntent"]) {
  if (intent === "transactional") return `Tomar uma decisão e avançar na contratação ou compra de ${entity}`;
  if (intent === "commercial_investigation") return `Comparar critérios e escolher a alternativa de ${entity} mais adequada`;
  if (intent === "local") return `Encontrar e avaliar uma opção local de ${entity}`;
  return `Entender ${entity} e saber qual próximo passo faz sentido`;
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

function confidenceFor(text: string, evidenceCount: number) {
  const explicitSignals = [...LOCAL_TERMS, ...TRANSACTIONAL_TERMS, ...COMMERCIAL_TERMS, ...INFORMATIONAL_TERMS].filter(term => text.includes(term)).length;
  return Math.min(0.92, Number((0.48 + explicitSignals * 0.08 + Math.min(evidenceCount, 3) * 0.04).toFixed(2)));
}

export function deriveLogicalKeywordDna(input: LogicalKeywordDnaInput): LogicalKeywordDnaResult {
  const text = normalize(input.keyword);
  const intent = existingIntent(input.intent) || detectIntent(text);
  const editorialType = detectEditorialType(` ${text} `);
  const entity = centralEntity(input.keyword);
  const keywordModifiers = modifiers(input.keyword, entity);
  const path = journey(intent.value);
  const productResearchRequired = hasAny(text, PRODUCT_TERMS) && ["review", "comparison", "best_list", "individual_product"].includes(editorialType);
  const reviewCandidate = editorialType === "review" || text.includes("vale a pena");
  const locality = hasAny(text, LOCAL_TERMS) ? "Localidade explícita na busca" : input.location?.trim() || "Sem localidade explícita";
  const urgency = hasAny(text, URGENT_TERMS) ? "Alta e explícita" : intent.value === "transactional" ? "Moderada" : "Não explícita";
  const evidence = [intent.evidence, `formato ${editorialType} inferido pela construção da busca`];
  if (keywordModifiers.length) evidence.push(`modificadores detectados: ${keywordModifiers.join(", ")}`);
  const confidence = confidenceFor(text, evidence.length);
  const audience = describeAudience(text, input.niche);
  const problem = describeProblem(text, entity, intent.value);
  const result = describeResult(entity, intent.value);
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
    audience,
    perceivedProblem: problem,
    desiredResult: result,
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
    intencao_secundaria: secondaryIntent(intent.value, text),
    tipo_editorial: editorialType,
    entidade_central: entity,
    modificadores: keywordModifiers.join(", ") || "Nenhum modificador explícito",
    publico: audience,
    problema_percebido: problem,
    resultado_desejado: result,
    job_to_be_done: `Quando pesquisa “${input.keyword.trim()}”, a pessoa quer ${result.toLowerCase()}.`,
    nivel_consciencia: path.awareness,
    etapa_jornada: path.stage,
    potencial_comercial: commercial,
    potencial_afiliado: affiliate,
    urgencia_tempo: urgency,
    intencao_local: locality,
    formato_esperado: editorialType,
    objecao_implicita: objection,
    emocao_dominante: emotion,
    risco_canibalizacao: text.split(" ").length <= 2 ? "Moderado: termo amplo; revisar contra keywords próximas" : "Baixo no nível lexical; validar no agrupamento",
    candidato_review: reviewCandidate ? "sim" : "não",
    pesquisa_produto_necessaria: productResearchRequired ? "sim" : "não",
    evidencias_logicas: evidence.join("; "),
  };

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
): KeywordSemanticRecord {
  const current = { ...(existing || {}) };
  const previouslyOwned = new Set(
    typeof current.dna_campos_logicos === "string"
      ? current.dna_campos_logicos.split(",").map(key => key.trim()).filter(Boolean)
      : [],
  );
  const owned = new Set(previouslyOwned);

  for (const key of LOGICAL_FIELD_KEYS) {
    if (key === "dna_campos_logicos") continue;
    if (previouslyOwned.has(key) || !isPresent(current[key])) {
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
  if (hasAny(text, ["cabelo", "unha", "depilacao", "massagem", "maquiagem", "estetica", "sobrancelha", "cilios", "harmonizacao"])) return "Estética";
  if (hasAny(text, ["treino", "academia", "dieta", "personal", "whey", "emagrecer", "crossfit"])) return "Fitness";
  if (hasAny(text, ["encanador", "eletricista", "pintor", "reforma", "construcao", "ar condicionado", "limpeza", "chaveiro", "desentupidora"])) return "Serviços";
  if (hasAny(text, ["seo", "marketing", "site", "trafego", "leads", "anuncio", "vendas online"])) return "Marketing";
  return "Geral";
}
