import type { SiloDNA } from "./contracts.ts";

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
  for (const key of ["siloDna", "siloDNA", "silo_dna", "dna", "payload", "result", "data"]) {
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

type SiloArticleRole = { articleId: string; role: string; reason: string };
type SiloLinkMapEntry = { fromArticleId: string; toArticleId: string; reason: string };

function articleRoles(value: unknown): SiloArticleRole[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: SiloArticleRole[] = [];
  for (const item of value) {
    const record = recordOf(item);
    if (!record) continue;
    const articleId = text(first(record, ["articleId", "article_id", "artigoId", "artigo_id"]));
    const role = text(first(record, ["role", "papel"]));
    const reason = text(first(record, ["reason", "reason", "motivo", "justificativa"]));
    if (articleId && role && reason) parsed.push({ articleId, role, reason });
  }
  return parsed.length ? parsed : undefined;
}

function linkMap(value: unknown): SiloLinkMapEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: SiloLinkMapEntry[] = [];
  for (const item of value) {
    const record = recordOf(item);
    if (!record) continue;
    const fromArticleId = text(first(record, ["fromArticleId", "from_article_id", "origem", "artigoOrigem"]));
    const toArticleId = text(first(record, ["toArticleId", "to_article_id", "destino", "artigoDestino"]));
    const reason = text(first(record, ["reason", "motivo", "justificativa"]));
    if (fromArticleId && toArticleId && reason) parsed.push({ fromArticleId, toArticleId, reason });
  }
  return parsed.length ? parsed : undefined;
}

/** Normaliza somente conteudo editorial do silo; identidade, organizacao e referencias sao controladas pelo servidor. */
export function normalizeSiloDnaProviderPayload(value: unknown): { payload: Partial<SiloDNA>; warnings: string[] } {
  const { source, wrapped } = unwrap(value);
  const payload: Partial<SiloDNA> = {};
  const assignText = (key: keyof SiloDNA, aliases: string[]) => { const value = text(first(source, aliases)); if (value !== undefined) Object.assign(payload, { [key]: value }); };
  const assignList = (key: keyof SiloDNA, aliases: string[]) => { const value = list(first(source, aliases)); if (value !== undefined) Object.assign(payload, { [key]: value }); };

  assignText("centralEntity", ["centralEntity", "central_entity", "entidadeCentral", "entidade_central"]);
  assignText("objective", ["objective", "objetivo"]);
  assignText("audience", ["audience", "publico", "público"]);
  assignText("macroProblem", ["macroProblem", "macro_problem", "problemaMacro", "problema_macro"]);
  assignText("dominantIntent", ["dominantIntent", "dominant_intent", "intencaoDominante", "intencao_dominante"]);
  assignText("boundary", ["boundary", "fronteira"]);
  assignList("includedTopics", ["includedTopics", "included_topics", "topicosIncluidos", "topicos_incluidos"]);
  assignList("excludedTopics", ["excludedTopics", "excluded_topics", "topicosExcluidos", "topicos_excluidos"]);
  assignList("nearbySiloIds", ["nearbySiloIds", "nearby_silo_ids", "silosProximos", "silos_proximos"]);
  assignList("possibleConflicts", ["possibleConflicts", "possible_conflicts", "conflitosPossiveis", "conflitos_possiveis"]);
  assignList("gaps", ["gaps", "lacunas"]);
  assignList("nextContents", ["nextContents", "next_contents", "proximosConteudos", "proximos_conteudos"]);
  assignList("humanPendingDecisions", ["humanPendingDecisions", "human_pending_decisions", "humanDecisionPoints", "pendenciasHumanas", "pendencias_humanas"]);

  const roles = articleRoles(first(source, ["articleRoles", "article_roles", "papeisArtigos", "papeis_artigos"]));
  if (roles) payload.articleRoles = roles;
  const links = linkMap(first(source, ["linkMap", "link_map", "mapaLinks", "mapa_links"]));
  if (links) payload.linkMap = links;
  const narrativeOrder = list(first(source, ["narrativeOrder", "narrative_order", "ordemNarrativa", "ordem_narrativa"]));
  if (narrativeOrder) payload.narrativeOrder = narrativeOrder;

  const normalizedConfidence = confidence(first(source, ["confidence", "confianca", "confiança"]));
  if (normalizedConfidence !== undefined) payload.confidence = normalizedConfidence;

  return { payload, warnings: wrapped ? ["Envelope siloDna da IA normalizado pelo servidor."] : [] };
}
