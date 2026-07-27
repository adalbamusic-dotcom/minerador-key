import type { ArchitectKeyword, ProvisionalArticleGroup } from "./contracts.ts";
import { withLegacyKeywordDnaReference } from "./adapters.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
  "e", "em", "na", "nas", "no", "nos", "o", "os", "para", "por", "que",
  "se", "sem", "sob", "sobre", "um", "uma",
]);

const normalize = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const tokenize = (value: string) => new Set(
  normalize(value).split(" ").filter(token => token.length > 1 && !STOP_WORDS.has(token)),
);

const setOverlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / Math.min(a.size, b.size);
};

const normalizedIntent = (intent?: string | null) => {
  const value = normalize(intent || "");
  if (/venda|transacion/.test(value)) return "transacional";
  if (/comercial|investig/.test(value)) return "comercial";
  if (/local/.test(value)) return "local";
  if (/inform|educa/.test(value)) return "informacional";
  return value || "desconhecida";
};

const intentCompatibility = (a?: string | null, b?: string | null) => {
  const first = normalizedIntent(a);
  const second = normalizedIntent(b);
  if (first === second) return 1;
  if (first === "desconhecida" || second === "desconhecida") return 0.5;
  if (new Set([first, second]).has("transacional") && new Set([first, second]).has("informacional")) return 0;
  if (new Set([first, second]).has("comercial") && new Set([first, second]).has("informacional")) return 0.35;
  return 0.55;
};

const semanticEntities = (keyword: ArchitectKeyword) => {
  const semantic = keyword.analise_semantica || {};
  const candidates = [semantic.entidade_central, semantic.entidades, semantic.nicho_override]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string");
  return new Set(candidates.flatMap(value => [...tokenize(value)]));
};

export const compareKeywords = (a: ArchitectKeyword, b: ArchitectKeyword) => {
  const lexical = setOverlap(tokenize(a.keyword), tokenize(b.keyword));
  const intent = intentCompatibility(a.intent, b.intent);
  const entitiesA = semanticEntities(a);
  const entitiesB = semanticEntities(b);
  const entities = entitiesA.size && entitiesB.size ? setOverlap(entitiesA, entitiesB) : 0.5;
  const siloA = a.lista_id || a.silo_id;
  const siloB = b.lista_id || b.silo_id;
  const silo = siloA && siloB ? (siloA === siloB ? 1 : 0) : 0.5;
  const combined = lexical * 0.5 + intent * 0.2 + entities * 0.2 + silo * 0.1;
  return { lexical, intent, entities, silo, combined };
};

const stableHash = (input: string) => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const slugQuality = (keyword: string) => {
  const normalized = normalize(keyword).replace(/\s+/g, "-");
  if (!normalized) return 0;
  const lengthScore = normalized.length <= 60 ? 1 : Math.max(0, 1 - (normalized.length - 60) / 60);
  return Math.min(1, lengthScore * (normalized.split("-").length <= 8 ? 1 : 0.8));
};

const commercialScore = (keyword: ArchitectKeyword) => {
  const intent = normalizedIntent(keyword.intent);
  if (intent === "transacional") return 1;
  if (intent === "comercial") return 0.8;
  if (intent === "local") return 0.65;
  return 0.35;
};

export const suggestPrincipal = (keywords: ArchitectKeyword[]) => {
  const published = keywords.find(keyword => keyword.isPublished || keyword.status?.toLowerCase() === "publicado");
  const maximumVolume = Math.max(1, ...keywords.map(keyword => keyword.volume_search || 0));
  const candidates = keywords.map(keyword => {
    const comparisons = keywords.filter(other => other.id !== keyword.id).map(other => compareKeywords(keyword, other));
    const average = (field: "lexical" | "intent" | "entities") => comparisons.length
      ? comparisons.reduce((sum, comparison) => sum + comparison[field], 0) / comparisons.length
      : 1;
    const coverage = average("lexical");
    const intention = average("intent");
    const centrality = average("entities");
    const brandFit = keyword.analise_semantica?.nicho_override ? 0.8 : 0.5;
    const commercial = commercialScore(keyword);
    const volume = (keyword.volume_search || 0) / maximumVolume;
    const difficulty = keyword.kgr_score == null ? 0.5 : Math.max(0, Math.min(1, 1 - keyword.kgr_score));
    const slug = slugQuality(keyword.keyword);
    const anchor = keyword.id === published?.id ? 1 : 0;
    const score = published
      ? anchor
      : coverage * 0.3 + intention * 0.2 + centrality * 0.15 + brandFit * 0.1
        + commercial * 0.05 + volume * 0.1 + difficulty * 0.05 + slug * 0.05;
    return {
      keywordId: keyword.id,
      score,
      breakdown: {
        cobertura: coverage,
        intencao: intention,
        centralidadeSemantica: centrality,
        aderenciaMarca: brandFit,
        potencialComercial: commercial,
        volume,
        dificuldade: difficulty,
        qualidadeSlug: slug,
        ancoraPublicada: anchor,
        serp: null,
      },
      justificativa: [
        published ? "Artigo publicado preservado como ancora." : "Tema avaliado por cobertura, intencao e centralidade.",
        `Cobertura lexical: ${Math.round(coverage * 100)}%.`,
        `Representatividade de intencao: ${Math.round(intention * 100)}%.`,
      ],
      pendencias: ["Confirmar a sugestao com a SERP antes da aprovacao definitiva."],
    };
  });
  return candidates.sort((a, b) => b.score - a.score)[0];
};

const groupEvidence = (keywords: ArchitectKeyword[]) => {
  if (keywords.length === 1) return { lexical: 1, intent: 1, entities: 1, silo: 1, combined: 1 };
  const comparisons: ReturnType<typeof compareKeywords>[] = [];
  for (let i = 0; i < keywords.length; i += 1) {
    for (let j = i + 1; j < keywords.length; j += 1) comparisons.push(compareKeywords(keywords[i], keywords[j]));
  }
  const average = (field: keyof (typeof comparisons)[number]) => comparisons.reduce((sum, item) => sum + item[field], 0) / comparisons.length;
  return { lexical: average("lexical"), intent: average("intent"), entities: average("entities"), silo: average("silo"), combined: average("combined") };
};

type AssignedArchitectKeyword = ArchitectKeyword & {
  clusterId?: string | number;
  provisionalGroupId?: string;
  computedHierarquia?: string;
  reviewRole?: "principal" | "secundaria" | "reforco_narrativo";
};

type GroupPlacement = {
  siloId: string | null;
  siloName: string | null;
  overflowFromFullGroup?: boolean;
};

export function describeProvisionalGroup(
  input: AssignedArchitectKeyword[],
  explicitId?: string,
  placement?: GroupPlacement,
): ProvisionalArticleGroup {
    const groupKeywords = input.filter(keyword => keyword.keyword.trim()).map(withLegacyKeywordDnaReference) as AssignedArchitectKeyword[];
    const ids = groupKeywords.map(keyword => keyword.id).sort();
    const principalSuggestion = suggestPrincipal(groupKeywords);
    const reviewedPrincipal = groupKeywords.find(keyword => keyword.reviewRole === "principal" && !(keyword.isPublished || keyword.status?.toLowerCase() === "publicado"));
    const anchor = groupKeywords.find(keyword => keyword.isPublished || keyword.status?.toLowerCase() === "publicado");
    if (!anchor && reviewedPrincipal) principalSuggestion.keywordId = reviewedPrincipal.id;
    const principal = groupKeywords.find(keyword => keyword.id === principalSuggestion.keywordId)!;
    const evidence = groupEvidence(groupKeywords);
    const siloId = String(anchor?.lista_id || anchor?.silo_id || placement?.siloId || principal.lista_id || principal.silo_id || "") || null;
    const siloName = anchor?.siloName || placement?.siloName || principal.siloName || null;
    const alerts: string[] = [];
    if (evidence.intent < 0.5) alerts.push("Mistura de intencoes: revisar ou dividir o grupo.");
    if (evidence.combined < 0.65 && groupKeywords.length > 1) alerts.push("Confianca logica moderada: decisao humana obrigatoria.");
    if (placement?.overflowFromFullGroup) {
      alerts.push(`Novo artigo no silo existente: o artigo semanticamente relacionado atingiu o limite de ${MAX_KEYWORDS_PER_ARTICLE} keywords.`);
    }
    const roles: ProvisionalArticleGroup["roles"] = Object.fromEntries(groupKeywords.map(keyword => [
      keyword.id,
      keyword.id === principal.id ? "principal" : keyword.reviewRole || (anchor ? "reforco_narrativo" : "secundaria"),
    ])) as ProvisionalArticleGroup["roles"];
    const broad = tokenize(principal.keyword).size <= 4 && groupKeywords.length >= 3;
    return {
      id: explicitId || `group-${stableHash(ids.join("|"))}`,
      keywordIds: ids,
      keywords: groupKeywords,
      publishedAnchorId: anchor?.id || null,
      suggestedSiloId: siloId,
      suggestedSiloName: siloName,
      evidence,
      confidence: Math.max(0, Math.min(1, evidence.combined)),
      alerts,
      principalSuggestion,
    roles,
    suggestedHierarchy: anchor?.hierarquia?.toLowerCase().includes("pilar") || (!placement?.overflowFromFullGroup && broad) ? "Pilar" : "Suporte",
      ...(anchor?.architectureStatus || principal.architectureStatus ? { architectureStatus: anchor?.architectureStatus || principal.architectureStatus } : {}),
      ...(principal.kgrIdentity || anchor?.kgrIdentity ? { kgrIdentity: principal.kgrIdentity || anchor?.kgrIdentity } : {}),
    };
}

export function describeAssignedGroups(input: AssignedArchitectKeyword[]): ProvisionalArticleGroup[] {
  const groups = new Map<string, AssignedArchitectKeyword[]>();
  input.filter(keyword => keyword.keyword.trim()).forEach(keyword => {
    const key = String(keyword.provisionalGroupId || keyword.clusterId || keyword.id);
    const current = groups.get(key) || [];
    current.push(keyword);
    groups.set(key, current);
  });
  return [...groups.entries()].map(([id, keywords]) => describeProvisionalGroup(keywords, id));
}

export function buildProvisionalGroups(input: ArchitectKeyword[]): ProvisionalArticleGroup[] {
  const keywords = input.filter(keyword => keyword.keyword.trim()).map(withLegacyKeywordDnaReference);
  const anchors = keywords.filter(keyword => keyword.isPublished || keyword.status?.toLowerCase() === "publicado");
  const fresh = keywords.filter(keyword => !anchors.includes(keyword));
  const rawGroups: Array<{ keywords: ArchitectKeyword[]; placement?: GroupPlacement }> = anchors.map(anchor => ({
    keywords: [anchor],
    placement: {
      siloId: String(anchor.lista_id || anchor.silo_id || "") || null,
      siloName: anchor.siloName || null,
    },
  }));

  for (const keyword of fresh) {
    let bestIndex = -1;
    let bestScore = 0;
    let bestFullIndex = -1;
    let bestFullScore = 0;
    for (let index = 0; index < rawGroups.length; index += 1) {
      const group = rawGroups[index];
      const isPublishedGroup = group.keywords.some(item => item.isPublished || item.status?.toLowerCase() === "publicado");
      const comparison = group.keywords
        .map(item => compareKeywords(keyword, item))
        .sort((first, second) => second.combined - first.combined)[0];
      const threshold = isPublishedGroup ? 0.52 : 0.6;
      const priorityScore = comparison.combined + (isPublishedGroup ? 0.08 : 0);
      if (comparison.intent <= 0 || comparison.combined < threshold) continue;
      if (group.keywords.length >= MAX_KEYWORDS_PER_ARTICLE) {
        if (priorityScore > bestFullScore) {
          bestFullIndex = index;
          bestFullScore = priorityScore;
        }
      } else if (priorityScore > bestScore) {
        bestIndex = index;
        bestScore = priorityScore;
      }
    }
    if (bestIndex >= 0) {
      rawGroups[bestIndex].keywords.push(keyword);
    } else if (bestFullIndex >= 0) {
      const fullGroup = rawGroups[bestFullIndex];
      const anchor = fullGroup.keywords.find(item => item.isPublished || item.status?.toLowerCase() === "publicado");
      const representative = anchor || fullGroup.keywords[0];
      rawGroups.push({
        keywords: [keyword],
        placement: {
          siloId: String(representative.lista_id || representative.silo_id || fullGroup.placement?.siloId || "") || null,
          siloName: representative.siloName || fullGroup.placement?.siloName || null,
          overflowFromFullGroup: true,
        },
      });
    } else {
      rawGroups.push({ keywords: [keyword] });
    }
  }

  return rawGroups.map(group => describeProvisionalGroup(group.keywords, undefined, group.placement));
}
