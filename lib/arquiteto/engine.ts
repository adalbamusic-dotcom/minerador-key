import type { ArchitectKeyword, ProvisionalArticleGroup, ProvisionalGroupingReason } from "./contracts.ts";
import { withLegacyKeywordDnaReference } from "./adapters.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";
import { normalizeSearchIntent } from "./intent-profile.ts";

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

const finiteNonNegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const semanticList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).flatMap(item => [...tokenize(item)])
  : typeof value === "string" ? [...tokenize(value)] : [];

const keywordResults = (keyword: ArchitectKeyword) => finiteNonNegative(keyword.results_allintitle);

const keywordVolume = (keyword: ArchitectKeyword) => finiteNonNegative(keyword.volume_search);

const commercialSecondarySignal = (keyword: ArchitectKeyword) => {
  const semantic = keyword.analise_semantica || {};
  const ads = keyword.demandEvidence?.googleAds;
  return semantic.potencial_comercial === "high"
    || semantic.potencial_comercial === "medium"
    || ads?.competitionAds != null
    || ads?.competitionIndexAds != null
    || ads?.averageCpcMicros != null;
};

const keywordSpecificity = (keyword: ArchitectKeyword) => {
  const semantic = keyword.analise_semantica || {};
  const terms = [...tokenize(keyword.keyword)];
  const editorialType = typeof semantic.tipo_editorial === "string" ? normalize(semantic.tipo_editorial) : "";
  const modifiers = semanticList(semantic.modificadores);
  const explicitSpecificity = Boolean(
    terms.length >= 5
      || modifiers.length >= 2
      || ["question", "tutorial", "problem_solution"].includes(editorialType)
      || /\b(como fazer|passo a passo|para mim|na minha|perto de mim)\b/.test(normalize(keyword.keyword)),
  );
  return explicitSpecificity;
};

type SiloCandidateAssessment = NonNullable<ArchitectKeyword["siloCandidate"]>;

function candidateAssessmentFor(keyword: ArchitectKeyword, input: ArchitectKeyword[]): SiloCandidateAssessment {
  const volume = keywordVolume(keyword);
  const knownVolumes = input.map(keywordVolume).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const volumeRank = volume === null || !knownVolumes.length
    ? null
    : knownVolumes.filter(value => value <= volume).length / knownVolumes.length;
  const volumeHigh = volumeRank !== null && knownVolumes.length >= 2 && volumeRank >= 0.75;
  const results = keywordResults(keyword);
  const resultsPresent = results !== null && results > 0;
  const terms = [...tokenize(keyword.keyword)];
  const shortTerm = terms.length > 0 && terms.length <= 3;
  const entities = semanticEntities(keyword);
  const broadEntity = entities.size > 0 && entities.size <= 3 && !keywordSpecificity(keyword);
  const related = input.filter(other => other.id !== keyword.id && compareKeywords(keyword, other).combined >= 0.45);
  const relatedKeywordCount = related.length;
  const capacityPotential = relatedKeywordCount >= 2;
  const kgrOpportunity = volume !== null && volume >= 120 && results !== null && results < volume;
  const commercialSecondary = commercialSecondarySignal(keyword);
  const specificNeed = keywordSpecificity(keyword);
  const published = Boolean(keyword.isPublished || keyword.status?.toLocaleLowerCase("pt-BR") === "publicado");
  const evidenceCount = [resultsPresent, shortTerm, broadEntity, capacityPotential, kgrOpportunity].filter(Boolean).length;
  const profile = !published && !specificNeed && relatedKeywordCount >= 2
    && ((volumeHigh && evidenceCount >= 2) || (shortTerm && broadEntity && capacityPotential && (resultsPresent || kgrOpportunity || volumeHigh)));
  const profileScoreParts = [
    volumeRank === null ? null : volumeRank,
    resultsPresent ? 1 : results === null ? null : 0,
    shortTerm ? 1 : 0,
    broadEntity ? 1 : 0,
    capacityPotential ? Math.min(1, relatedKeywordCount / 4) : 0,
    kgrOpportunity ? 1 : results === null ? null : 0,
    commercialSecondary ? 0.5 : null,
  ].filter((value): value is number => value !== null);
  const score = profileScoreParts.length
    ? profileScoreParts.reduce((sum, value) => sum + value, 0) / profileScoreParts.length
    : null;
  const strongestRelated = related
    .map(other => ({ id: other.id, score: candidateAssessmentForBase(other, input) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
  const isLocalLeader = !strongestRelated || strongestRelated.score <= (score ?? -1) && strongestRelated.id >= keyword.id;
  const candidate = profile && isLocalLeader;
  const reasons: string[] = [];
  if (published) reasons.push("Publicado protegido não é convertido em candidata a Silo.");
  if (volumeHigh) reasons.push("Volume está entre os maiores valores conhecidos deste universo.");
  else if (volume === null) reasons.push("Volume não recebido; a ausência não invalida a keyword, mas não sustenta sozinha esta hipótese.");
  if (resultsPresent) reasons.push("Há evidência de resultados/competitividade para comparação.");
  else if (results === null) reasons.push("Resultados não recebidos; a ausência não é tratada como zero.");
  if (shortTerm) reasons.push("Termo curto e potencialmente abrangente.");
  if (broadEntity) reasons.push("Entidade central compacta e ampla no registro recebido.");
  if (capacityPotential) reasons.push(`Há ${relatedKeywordCount} keyword(s) relacionadas que podem formar cobertura ao redor do tema.`);
  if (kgrOpportunity) reasons.push("Há oportunidade KGR operacional (volume >= 120 e resultados menores que o volume); isso não aprova nem define Pilar.");
  if (commercialSecondary) reasons.push("Há sinal comercial secundário no KeywordDNA; ele não decide agrupamento nem candidatura sozinho.");
  if (specificNeed) reasons.push("A necessidade parece específica; volume alto sozinho não cria candidata a Silo.");
  if (!candidate && !specificNeed && !published && !capacityPotential) reasons.push("Volume isolado não basta sem entidade ampla e capacidade de sustentar outros artigos.");
  if (!candidate && !specificNeed && capacityPotential && !volumeHigh && !broadEntity) reasons.push("Há relação lexical, mas não há evidência suficiente de centralidade ampla para reservar o termo.");
  if (!reasons.length) reasons.push("Evidência insuficiente para reservar como candidata; keyword permanece disponível.");
  return {
    status: candidate ? "candidate" : "not_candidate",
    origin: "deterministic",
    score,
    reasons,
    signals: { volumeRank, volumeHigh, resultsPresent, shortTerm, broadEntity, capacityPotential, kgrOpportunity, commercialSecondary, specificNeed, relatedKeywordCount },
  };
}

function candidateAssessmentForBase(keyword: ArchitectKeyword, input: ArchitectKeyword[]) {
  const volume = keywordVolume(keyword);
  const knownVolumes = input.map(keywordVolume).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const volumeRank = volume === null || !knownVolumes.length ? null : knownVolumes.filter(value => value <= volume).length / knownVolumes.length;
  const results = keywordResults(keyword);
  const relatedCount = input.filter(other => other.id !== keyword.id && compareKeywords(keyword, other).combined >= 0.45).length;
  const entities = semanticEntities(keyword);
  const shortTerm = [...tokenize(keyword.keyword)].length <= 3;
  const broadEntity = entities.size > 0 && entities.size <= 3 && !keywordSpecificity(keyword);
  const kgrOpportunity = volume !== null && volume >= 120 && results !== null && results < volume;
  const commercialSecondary = commercialSecondarySignal(keyword);
  return [volumeRank, results === null ? null : results > 0 ? 1 : 0, shortTerm ? 1 : 0, broadEntity ? 1 : 0, Math.min(1, relatedCount / 4), kgrOpportunity ? 1 : results === null ? null : 0, commercialSecondary ? 0.5 : null]
    .filter((value): value is number => value !== null)
    .reduce((sum, value, _index, values) => sum + value / values.length, 0);
}

function classifySiloCandidates(input: ArchitectKeyword[]) {
  return input.map(keyword => {
    const existing = keyword.siloCandidate;
    if (existing?.origin === "human") return { ...keyword, siloCandidate: existing };
    return { ...keyword, siloCandidate: candidateAssessmentFor(keyword, input) };
  });
}

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
  const maximumVolume = Math.max(1, ...keywords.map(keyword => typeof keyword.volume_search === "number" && Number.isFinite(keyword.volume_search) ? keyword.volume_search : 0));
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
    const volume = (typeof keyword.volume_search === "number" && Number.isFinite(keyword.volume_search) ? keyword.volume_search : 0) / maximumVolume;
    const difficulty = keyword.kgr_score == null ? 0.5 : Math.max(0, Math.min(1, 1 - keyword.kgr_score));
    const slug = slugQuality(keyword.keyword);
    const anchor = keyword.id === published?.id ? 1 : 0;
    const score = published
      ? anchor
      : coverage * 0.3 + intention * 0.2 + centrality * 0.15 + brandFit * 0.1
        + commercial * 0.05 + difficulty * 0.05 + slug * 0.05;
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

const groupingReasons = (keywords: ArchitectKeyword[], evidence: ReturnType<typeof groupEvidence>): ProvisionalGroupingReason[] => {
  if (keywords.length === 1) return [{ code: "possible_separation", kind: "review", message: "Keyword isolada: não houve outra keyword comparável para confirmar competição na mesma página." }];
  const reasons: ProvisionalGroupingReason[] = [];
  if (evidence.intent >= 0.75) reasons.push({ code: "same_intent", kind: "support", message: "As keywords apresentam intenção compatível para uma mesma página." });
  if (evidence.entities >= 0.75) reasons.push({ code: "same_entity", kind: "support", message: "As entidades centrais são suficientemente próximas no KeywordDNA recebido." });
  if (evidence.combined >= 0.65) reasons.push({ code: "same_need", kind: "support", message: "A combinação de intenção, entidade, vocabulário e contexto sugere uma necessidade central compartilhada." });
  if (evidence.lexical > 0.15 && evidence.lexical < 0.9) reasons.push({ code: "semantic_variation", kind: "support", message: "Há variação semântica sem afastamento suficiente para exigir outra página automaticamente." });
  if (evidence.intent < 0.75 && evidence.intent > 0.4) reasons.push({ code: "possible_separation", kind: "review", message: "A intenção é apenas parcialmente compatível; revisar se as buscas deveriam competir na mesma página." });
  if (evidence.intent <= 0.4) reasons.push({ code: "conflict", kind: "conflict", message: "A intenção possui conflito relevante; o agrupamento permanece provisório e exige decisão humana." });
  if (keywords.some(keyword => normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal) === "unknown")) {
    reasons.push({ code: "ambiguity", kind: "review", message: "Uma ou mais intenções não estão definidas com confiança suficiente; ausência não foi convertida em outra intenção." });
  }
  return reasons.length ? reasons : [{ code: "possible_separation", kind: "review", message: "A evidência não foi suficiente para afirmar competição na mesma página; manter como hipótese revisável." }];
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
    const reasons = groupingReasons(groupKeywords, evidence);
    // A source list is not a Silo assignment. Only a published anchor may
    // carry an existing Silo through the Articles phase; new Article groups
    // wait for the explicit Silos phase to receive one.
    const siloId = String(anchor?.silo_id || (anchor ? anchor.lista_id : "") || (anchor ? placement?.siloId : null) || "") || null;
    const siloName = anchor?.siloName || (anchor ? placement?.siloName : null) || null;
    const alerts: string[] = [];
    if (evidence.intent < 0.5) alerts.push("Mistura de intencoes: revisar ou dividir o grupo.");
    if (evidence.combined < 0.65 && groupKeywords.length > 1) alerts.push("Confianca logica moderada: decisao humana obrigatoria.");
    if (placement?.overflowFromFullGroup) {
      alerts.push(`Novo artigo no silo existente: o artigo semanticamente relacionado atingiu o limite de ${MAX_KEYWORDS_PER_ARTICLE} keywords.`);
    }
    // A Principal canônica do grupo é a única autoridade. `reviewRole` é papel
    // da cópia de trabalho e pode chegar inconsistente — uma segunda keyword
    // marcada "principal" nunca pode herdar esse papel na formação.
    const structuralRole = (keyword: (typeof groupKeywords)[number]): ProvisionalArticleGroup["roles"][string] => {
      if (keyword.id === principal.id) return "principal";
      if (keyword.reviewRole === "reforco_narrativo") return "reforco_narrativo";
      if (keyword.reviewRole === "secundaria") return "secundaria";
      return anchor ? "reforco_narrativo" : "secundaria";
    };
    const roles: ProvisionalArticleGroup["roles"] = Object.fromEntries(
      groupKeywords.map(keyword => [keyword.id, structuralRole(keyword)]),
    ) as ProvisionalArticleGroup["roles"];
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
      suggestedHierarchy: anchor?.hierarquia?.toLowerCase().includes("pilar") || (!placement?.overflowFromFullGroup && broad && principal.siloCandidate?.status !== "candidate" && !principal.siloCandidate?.signals.kgrOpportunity) ? "Pilar" : "Suporte",
      groupingReasons: reasons,
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

export type DeterministicArticleArchitecture = {
  groups: ProvisionalArticleGroup[];
  siloCandidates: ArchitectKeyword[];
  ungrouped: ArchitectKeyword[];
};

/**
 * Primeira leitura do Arquiteto: reserva candidatas fortes fora dos grupos de
 * artigo e mantém cada registro disponível para decisão humana. Não consulta
 * SERP, não chama IA e não cria ArticleDNA/SiloDNA.
 */
export function buildDeterministicArticleArchitecture(input: ArchitectKeyword[]): DeterministicArticleArchitecture {
  const classified = classifySiloCandidates(input.map(keyword => ({ ...keyword })));
  const siloCandidates = classified.filter(keyword => keyword.siloCandidate?.status === "candidate" && !keyword.isPublished);
  const reservedIds = new Set(siloCandidates.map(keyword => keyword.id));
  const articleInput = classified.filter(keyword => !reservedIds.has(keyword.id));
  const groups = buildProvisionalGroups(articleInput);
  const groupedIds = new Set(groups.flatMap(group => group.keywordIds));
  const ungrouped = classified.filter(keyword => reservedIds.has(keyword.id) || !groupedIds.has(keyword.id));
  return { groups, siloCandidates, ungrouped };
}
