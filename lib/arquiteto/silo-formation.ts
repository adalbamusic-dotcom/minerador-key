import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "./contracts.ts";
import { intentComparisonKey } from "./keyword-dna-signals.ts";
import type { DeclaredSiloPlan } from "../minerador/declared-plan.ts";
import { applyDeclaredSiloIdentity, orderIdsByDeclaredPlan, resolveDeclaredSiloPlan, type DeclaredSiloPlanEntry } from "./silo-declared-plan.ts";

type ArticleVersion = VersionEnvelope<ArticleDNA>;
type ExistingSiloVersion = VersionEnvelope<SiloDNA>;
type ExistingSiloPageVersion = VersionEnvelope<SiloPage>;

export type ReservedSiloCandidate = {
  id: string;
  keyword: string;
  intent?: string | null;
  volume_search?: number | null;
  siloCandidate?: { status?: "candidate" | "not_candidate" } | null;
};

export type SiloWorkingCopyArticleReference = {
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string;
  keywordDnaReferences: Array<{ keywordId: string; keywordDnaVersionId: string; keywordDnaContentHash: string }>;
  role: "pillar_candidate" | "support";
  rationale: string;
};

export type SiloPillarScore = {
  articleId: string;
  total: number;
  volume: number | null;
  centrality: number | null;
  breadth: number | null;
  shortTerm: number | null;
  intent: number | null;
  competition: number | null;
  supportCapacity: number | null;
  kgrConsidered: boolean;
  reasons: string[];
};

export type SiloWorkingCopy = {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  formationStatus: "draft";
  source: "existing" | "new_candidate" | "insufficient_architecture";
  existingSiloId: string | null;
  articleReferences: SiloWorkingCopyArticleReference[];
  pillarCandidateArticleId: string | null;
  supportArticleIds: string[];
  pillarScores: SiloPillarScore[];
  reservedCandidateIds: string[];
  reasons: string[];
  conflicts: string[];
  siloPage: {
    siloPageId: string;
    slug: string;
    distinctFromPillar: true;
    pillarArticleId: null;
    supportArticleIds: string[];
    collisionReasons: string[];
  };
  publishedProtection: {
    protected: boolean;
    siloPageIds: string[];
    articleIds: string[];
    protectedFields: Array<"brand" | "url" | "slug" | "canonical">;
  };
  /**
   * F4 — o plano declarado valeu para esta cópia (SDD 2026-10-12 §6.2-6).
   * Ausente = cópia sem plano, idêntica à de antes.
   */
  declaredPlan?: {
    groupId: string;
    planVersion: number;
    pillarArticleId: string;
    orderedArticleIds: string[];
    reason: string;
    objective: string | null;
  };
};

/** O plano declarado que a formação pode receber: os Assuntos com plano e o Silo planejado de cada grupo. */
export type SiloFormationDeclaredPlanInput = {
  entries: readonly DeclaredSiloPlanEntry[];
  groupPlans?: ReadonlyMap<string, DeclaredSiloPlan>;
};

export type SiloFormationResult = {
  workingCopies: SiloWorkingCopy[];
  unassignedArticleIds: string[];
  reservedCandidateOnlyIds: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string | null | undefined) {
  return new Set(normalize(value).split(/\s+/).filter(token => token.length > 2));
}

function overlap(left: Set<string>, right: Set<string>) {
  let count = 0;
  left.forEach(token => { if (right.has(token)) count += 1; });
  return count;
}

function articleEntityTokens(article: ArticleDNA) {
  const values = [
    ...article.entities,
    ...article.keywordReferences.flatMap(reference => reference.keywordDnaSnapshot?.payload.centralEntity || []),
    article.keywordReferences.find(reference => reference.keywordId === article.principalKeywordId)?.keywordDnaSnapshot?.sourceKeywordSnapshot.keyword as string | undefined,
  ];
  return new Set(values.flatMap(value => [...tokens(value)]));
}

function articleVolume(article: ArticleDNA) {
  const direct = article.primaryKeywordMetrics?.volumeSearch;
  if (typeof direct === "number") return direct;
  const strategy = article.keywordStrategy?.principalVolume ?? article.volumeStrategy?.primaryKeywordVolume;
  if (typeof strategy === "number") return strategy;
  return article.keywordReferences.find(reference => reference.keywordId === article.principalKeywordId)?.volume ?? null;
}

function articleResultCount(article: ArticleDNA) {
  const direct = article.primaryKeywordMetrics?.resultCount;
  if (typeof direct === "number") return direct;
  return article.keywordReferences.find(reference => reference.keywordId === article.principalKeywordId)?.resultCount ?? null;
}

function principalText(article: ArticleDNA) {
  const reference = article.keywordReferences.find(item => item.keywordId === article.principalKeywordId);
  const snapshot = reference?.keywordDnaSnapshot?.sourceKeywordSnapshot.keyword;
  return typeof snapshot === "string" && snapshot.trim() ? snapshot : article.suggestedSlug.replace(/[/-]+/g, " ");
}

function shortSiloName(article: ArticleDNA, reserved: ReservedSiloCandidate[]) {
  const entity = article.entities.find(value => value.trim()) || reserved[0]?.keyword || principalText(article);
  const words = entity.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return words.join(" ") || "Silo provisório";
}

export function shortSiloSlug(name: string) {
  const normalized = normalize(name).split(/\s+/).filter(Boolean);
  const unique = normalized.filter((word, index) => normalized.indexOf(word) === index).slice(0, 2);
  return unique.join("-") || "silo-provisorio";
}

function intentKey(article: ArticleDNA) {
  // 2026-10-19 · o normalizador único da intenção ("Informativo" = "Informativa").
  return intentComparisonKey(String(article.intentProfile?.primaryIntent || article.mainIntent || "")) ?? "";
}

function articleSimilarity(left: ArticleDNA, right: ArticleDNA) {
  const sameIntent = intentKey(left) && intentKey(left) === intentKey(right);
  const entities = overlap(articleEntityTokens(left), articleEntityTokens(right));
  const coverage = overlap(new Set(left.coverage.flatMap(value => [...tokens(value)])), new Set(right.coverage.flatMap(value => [...tokens(value)])));
  return sameIntent && (entities > 0 || coverage > 0);
}

function existingSiloMatches(article: ArticleDNA, silo: SiloDNA) {
  const entityMatch = overlap(articleEntityTokens(article), tokens(`${silo.centralEntity} ${silo.name || ""}`)) > 0;
  const siloIntent = intentComparisonKey(String(silo.dominantIntent ?? "")) ?? "";
  const articleIntentValue = intentKey(article);
  const intentMatch = !siloIntent || !articleIntentValue || siloIntent === articleIntentValue || siloIntent.includes(articleIntentValue) || articleIntentValue.includes(siloIntent);
  return entityMatch && intentMatch;
}

function uniqueVolumes(articles: ArticleDNA[]) {
  return articles.map(articleVolume).filter((value): value is number => typeof value === "number");
}

function rankScore(value: number | null, values: number[]) {
  if (value === null || !values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return 1;
  return clamp((value - min) / (max - min));
}

function pillarScores(articles: ArticleVersion[]) {
  const payloads = articles.map(version => version.payload);
  const volumes = uniqueVolumes(payloads);
  const resultCounts = payloads.map(articleResultCount).filter((value): value is number => typeof value === "number");
  return articles.map(version => {
    const article = version.payload;
    const volume = rankScore(articleVolume(article), volumes);
    const centrality = article.hierarchyStrategy?.components.semanticCentrality ?? article.confidence ?? null;
    const breadthRaw = article.hierarchyStrategy?.components.topicalBreadth ?? null;
    const breadth = breadthRaw ?? (article.coverage.length ? clamp(article.coverage.length / 8) : null);
    const words = principalText(article).trim().split(/\s+/).filter(Boolean).length;
    const shortTerm = words ? (words <= 4 ? 1 : clamp(4 / words)) : null;
    const intent = article.mainIntent.trim() ? (article.intentProfile?.status === "conflict" ? 0 : 1) : null;
    const resultCount = articleResultCount(article);
    const competition = rankScore(resultCount, resultCounts);
    const supportCapacity = articles.length > 1 ? clamp((articles.length - 1) / 4) : 0;
    const known = [volume, centrality, breadth, shortTerm, intent, competition, supportCapacity].filter((value): value is number => typeof value === "number");
    const total = known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : 0;
    const kgrConsidered = Boolean(article.kgrIdentity || article.keywordStrategy?.principalKgrStatus);
    const reasons = [
      volume === null ? "Volume ausente; não foi convertido em zero nem usado para invalidar o artigo." : "Volume usado como sinal de demanda, sem vencer sozinho.",
      centrality === null ? "Centralidade ausente." : "Centralidade semântica considerada.",
      breadth === null ? "Amplitude editorial ausente." : "Amplitude e capacidade de verticalização consideradas.",
      competition === null ? "Competitividade ausente." : "Resultados/competitividade considerados como evidência secundária.",
      kgrConsidered ? "KGR considerado apenas como evidência secundária; não promove Pilar automaticamente." : "KGR não disponível; não foi inventado.",
    ];
    return { articleId: article.articleId, total, volume, centrality, breadth, shortTerm, intent, competition, supportCapacity, kgrConsidered, reasons };
  }).sort((left, right) => right.total - left.total || left.articleId.localeCompare(right.articleId));
}

function articleRefs(articles: ArticleVersion[], pillarArticleId: string | null): SiloWorkingCopyArticleReference[] {
  return articles.map(version => {
    const article = version.payload;
    // Sem Pilar escolhido por humano, NENHUM papel estrutural é atribuído. Antes
    // marcar todos como "support" era a outra metade do mesmo defeito: presumia
    // a estrutura só porque um deles tinha sido eleito automaticamente.
    const role = pillarArticleId && article.articleId === pillarArticleId ? "pillar_candidate" : "support";
    const rationale = !pillarArticleId
      ? "Artigo do território aguardando escolha humana de Pilar; nenhum papel estrutural foi atribuído."
      : role === "pillar_candidate"
        ? "Pilar escolhido por decisão humana; consolidação ainda pendente."
        : "Suporte definido após a escolha humana de Pilar.";
    return {
      articleId: article.articleId,
      articleDnaVersionId: version.versionId,
      articleDnaContentHash: version.contentHash,
      keywordDnaReferences: article.keywordReferences.map(reference => ({ keywordId: reference.keywordId, keywordDnaVersionId: reference.keywordDnaVersionId, keywordDnaContentHash: reference.keywordDnaContentHash })),
      role,
      rationale,
    };
  });
}

function publishedProtection(articles: ArticleVersion[], pages: ExistingSiloPageVersion[], siloId: string | null) {
  const publishedArticles = articles.filter(article => Boolean(article.payload.publishedIdentityRef)).map(article => article.payload.articleId);
  const publishedPages = pages.filter(page => page.payload.brandId && page.payload.siloId === siloId && page.payload.publicationStatus === "published").map(page => page.payload.siloPageId);
  return { protected: publishedArticles.length > 0 || publishedPages.length > 0, siloPageIds: publishedPages, articleIds: publishedArticles, protectedFields: ["brand", "url", "slug", "canonical"] as Array<"brand" | "url" | "slug" | "canonical"> };
}

function collisionReasons(slug: string, pillar: ArticleVersion | undefined, pages: ExistingSiloPageVersion[], siloId: string) {
  const reasons: string[] = [];
  if (pillar && shortSiloSlug(pillar.payload.suggestedSlug) === slug) reasons.push("A slug da SiloPage coincide com o slug do artigo candidato a Pilar.");
  for (const page of pages) {
    if (page.payload.siloId !== siloId && page.payload.slug === slug) reasons.push(`Slug já usado pela SiloPage ${page.payload.siloPageId}.`);
  }
  return [...new Set(reasons)];
}

function reservedForArticles(articles: ArticleVersion[], reserved: ReservedSiloCandidate[]) {
  const entities = new Set(articles.flatMap(version => [...articleEntityTokens(version.payload)]));
  return reserved.filter(candidate => (candidate.siloCandidate?.status || "candidate") === "candidate" && overlap(tokens(candidate.keyword), entities) > 0);
}

function buildCopy(input: {
  brandId: string;
  id: string;
  articles: ArticleVersion[];
  existing: ExistingSiloVersion | undefined;
  pages: ExistingSiloPageVersion[];
  reserved: ReservedSiloCandidate[];
  source: SiloWorkingCopy["source"];
  reasons: string[];
}): SiloWorkingCopy {
  const scores = pillarScores(input.articles);
  // `pillarScores` continua produzindo CANDIDATOS ordenados e justificados — é
  // isso que a heurística tem direito de fazer. O que ela não pode é eleger:
  // antes, `scores[0]?.articleId` virava Pilar, e volume, KGR, centralidade e
  // ordem escolhiam estrutura editorial. Pilar nasce nulo e só a decisão humana
  // (chooseSiloWorkingCopyPillar) o preenche.
  const pillar: string | null = null;
  const reserved = reservedForArticles(input.articles, input.reserved);
  const name = input.existing?.payload.name?.trim() || shortSiloName(input.articles[0].payload, reserved);
  const slug = input.existing ? (input.pages.find(page => page.payload.siloId === input.existing?.payload.siloId)?.payload.slug || shortSiloSlug(name)) : shortSiloSlug(name);
  const siloId = input.existing?.payload.siloId || input.id;
  const pillarVersion = input.articles.find(article => article.payload.articleId === pillar);
  const conflicts = input.articles.length < 2 && !input.existing ? [SHALLOW_SILO_REASON] : [];
  const page = {
    siloPageId: `silo-page:${siloId}`,
    slug,
    distinctFromPillar: true as const,
    pillarArticleId: null,
    supportArticleIds: input.articles.map(article => article.payload.articleId),
    collisionReasons: collisionReasons(slug, pillarVersion, input.pages, siloId),
  };
  return {
    id: siloId,
    brandId: input.brandId,
    name,
    slug,
    formationStatus: "draft",
    source: conflicts.length ? "insufficient_architecture" : input.source,
    existingSiloId: input.existing?.payload.siloId || null,
    articleReferences: articleRefs(input.articles, pillar),
    pillarCandidateArticleId: pillar,
    // Suportes nao sao presumidos so porque nao sao Pilar: sem Pilar escolhido,
    // nao ha estrutura decidida. Os artigos ficam em articleReferences como
    // candidatos, e pillarScores carrega a sugestao ordenada e justificada.
    supportArticleIds: pillar ? input.articles.map(article => article.payload.articleId).filter(articleId => articleId !== pillar) : [],
    pillarScores: scores,
    reservedCandidateIds: reserved.map(candidate => candidate.id),
    reasons: [...input.reasons, "A cópia é provisória; SERP/IA e decisão humana ainda podem reorganizar os artigos.", "SiloPage é universo/categoria e não é o artigo Pilar."],
    conflicts: [...conflicts, ...page.collisionReasons],
    siloPage: page,
    publishedProtection: publishedProtection(input.articles, input.pages, input.existing?.payload.siloId || null),
  };
}

export function formSiloWorkingCopies(input: {
  brandId: string;
  articleVersions: readonly ArticleVersion[];
  existingSiloVersions?: readonly ExistingSiloVersion[];
  existingSiloPageVersions?: readonly ExistingSiloPageVersion[];
  reservedCandidates?: readonly ReservedSiloCandidate[];
  /** F4 — opcional. Ausente: a saída é exatamente a de antes. */
  declaredPlan?: SiloFormationDeclaredPlanInput | null;
}): SiloFormationResult {
  const existing = [...(input.existingSiloVersions || [])].filter(version => version.payload.brandId === input.brandId);
  const pages = [...(input.existingSiloPageVersions || [])].filter(version => version.payload.brandId === input.brandId);
  const articles = [...input.articleVersions].filter(version => version.payload.brandId === input.brandId);
  const reserved = [...(input.reservedCandidates || [])];
  const assigned = new Set<string>();
  const copies: SiloWorkingCopy[] = [];
  let newIndex = 0;

  for (const silo of existing) {
    const members = articles.filter(version => version.payload.siloId === silo.payload.siloId);
    if (members.length) {
      members.forEach(version => assigned.add(version.payload.articleId));
      copies.push(buildCopy({ brandId: input.brandId, id: silo.payload.siloId, articles: members, existing: silo, pages, reserved, source: "existing", reasons: ["Silo canônico existente será fortalecido; nenhum novo Silo foi proposto."] }));
    }
  }

  const unassigned = articles.filter(version => !assigned.has(version.payload.articleId));

  /**
   * A semelhança agrupa DENTRO do Silo, nunca através dele.
   *
   * Sem esta cerca a proximidade semântica atravessava territórios já
   * confirmados por decisão humana: artigos do mesmo Silo caíam em propostas
   * diferentes e artigos de Silos diferentes caíam na mesma proposta — que
   * então não tem território único e não pode ser persistida.
   *
   * O território confirmado é decisão humana anterior a esta. Reagrupar por
   * cima dela não é sugerir: é desfazer.
   */
  const porTerritorio = new Map<string, ArticleVersion[]>();
  for (const article of unassigned) {
    const territorio = article.payload.territoryRef || "";
    porTerritorio.set(territorio, [...(porTerritorio.get(territorio) || []), article]);
  }

  const clusters: ArticleVersion[][] = [];
  for (const [, doTerritorio] of porTerritorio) {
    const locais: ArticleVersion[][] = [];
    for (const article of doTerritorio) {
      const target = locais.find(cluster => cluster.some(member => articleSimilarity(member.payload, article.payload)));
      if (target) target.push(article); else locais.push([article]);
    }
    // Um Silo confirmado é UMA cópia de trabalho: dentro dele a semelhança
    // não decide fronteira, porque a fronteira já foi decidida.
    clusters.push(...(doTerritorio[0]?.payload.territoryRef ? [doTerritorio] : locais));
  }

  for (const cluster of clusters) {
    cluster.forEach(version => assigned.add(version.payload.articleId));
    const matchingSilo = existing.find(silo => cluster.some(article => existingSiloMatches(article.payload, silo.payload)));
    if (matchingSilo) {
      copies.push(buildCopy({ brandId: input.brandId, id: matchingSilo.payload.siloId, articles: cluster, existing: matchingSilo, pages, reserved, source: "existing", reasons: ["Equivalência semântica encontrada em Silo existente; fortalecer em vez de criar outro."] }));
      continue;
    }
    newIndex += 1;
    copies.push(buildCopy({ brandId: input.brandId, id: `working-silo:${newIndex}`, articles: cluster, existing: undefined, pages, reserved, source: "new_candidate", reasons: cluster.length > 1 ? ["Grupo novo tem mais de um ArticleDNA e capacidade inicial de verticalização."] : ["Grupo mantido na working copy para não perder o ArticleDNA; não há arquitetura suficiente para propor novo Silo."] }));
  }

  const candidateOnlyIds = reserved.filter(candidate => !copies.some(copy => copy.reservedCandidateIds.includes(candidate.id))).map(candidate => candidate.id);
  const declared = input.declaredPlan;
  const finais = declared ? copies.map(copy => applyDeclaredPlanToWorkingCopy(copy, articles, declared)) : copies;
  return { workingCopies: finais, unassignedArticleIds: articles.filter(article => !assigned.has(article.payload.articleId)).map(article => article.payload.articleId), reservedCandidateOnlyIds: candidateOnlyIds };
}

/**
 * O Silo raso: um único Article, sem suporte.
 *
 * Isto barra INVENTAR um Silo novo a partir de um artigo solto. Não barra
 * consolidar um Silo que um humano já confirmou: ali não há estrutura sendo
 * inventada, há profundidade que ainda não existe — e isso é dívida da
 * próxima passada, não impedimento.
 */
export const SHALLOW_SILO_REASON = "Arquitetura insuficiente: um novo Silo precisa de capacidade real de verticalização.";

export function chooseSiloWorkingCopyPillar(copy: SiloWorkingCopy, articleId: string): SiloWorkingCopy {
  if (!copy.articleReferences.some(reference => reference.articleId === articleId)) return copy;
  return {
    ...copy,
    pillarCandidateArticleId: articleId,
    supportArticleIds: copy.articleReferences.map(reference => reference.articleId).filter(id => id !== articleId),
    articleReferences: copy.articleReferences.map(reference => ({ ...reference, role: reference.articleId === articleId ? "pillar_candidate" : "support", rationale: reference.articleId === articleId ? "Escolha humana de Pilar provisório; confirmação final pendente." : "Suporte provisório escolhido após ajuste humano." })),
    reasons: [...copy.reasons, "Pilar provisório alterado por decisão humana; nenhuma versão consolidada foi criada."],
  };
}

/**
 * F4 — O PILAR DECLARADO NO PLANO (SDD 2026-10-12 §6.2-6, D7).
 *
 * Quando todos os artigos da cópia são de Assuntos com plano do MESMO grupo e
 * exatamente um foi declarado Pilar, a cópia nasce com esse Pilar — escolhido
 * por `chooseSiloWorkingCopyPillar`, porque é decisão humana (a do plano), e não
 * heurística. `pillarScores` continua calculado, só como informação. A ordem
 * segue a do plano; nome e slug vêm do Silo planejado do grupo (slug só se a
 * SiloPage não está publicada). Qualquer outra situação: a cópia de hoje, com
 * o aviso em `reasons` (nunca em `conflicts`, que bloqueiam a consolidação).
 */
export function applyDeclaredPlanToWorkingCopy(
  copy: SiloWorkingCopy,
  articleVersions: readonly ArticleVersion[],
  declared: SiloFormationDeclaredPlanInput,
): SiloWorkingCopy {
  const ids = copy.articleReferences.map(reference => reference.articleId);
  const porId = new Map(articleVersions.map(version => [version.payload.articleId, version.payload]));
  const resolucao = resolveDeclaredSiloPlan({
    units: ids.map(articleId => {
      const article = porId.get(articleId);
      return {
        ref: articleId,
        principalKeywordId: article?.principalKeywordId ?? "",
        keywordIds: article?.keywordReferences.map(reference => reference.keywordId) ?? [],
        subjectKeywordId: article?.subject?.keywordId ?? null,
      };
    }),
    entries: declared.entries,
  });
  if (!resolucao.applies) {
    return resolucao.warnings.length ? { ...copy, reasons: [...copy.reasons, ...resolucao.warnings] } : copy;
  }
  const comPilar = orderSiloWorkingCopyByDeclaredPlan(chooseSiloWorkingCopyPillar(copy, resolucao.pillarRef), resolucao.orderedRefs);
  const ordem = comPilar.articleReferences.map(reference => reference.articleId);
  const plano = declared.groupPlans?.get(resolucao.groupId) ?? null;
  const identidade = applyDeclaredSiloIdentity(
    { name: comPilar.name, slug: comPilar.slug, protectedIdentity: false, publishedSlug: null },
    plano,
    { pagePublished: comPilar.publishedProtection.siloPageIds.length > 0 },
  );
  return {
    ...comPilar,
    name: identidade.name,
    slug: identidade.slug,
    siloPage: { ...comPilar.siloPage, slug: identidade.slug },
    reasons: [...comPilar.reasons, `${resolucao.reason}.`],
    declaredPlan: {
      groupId: resolucao.groupId,
      planVersion: resolucao.planVersion,
      pillarArticleId: resolucao.pillarRef,
      orderedArticleIds: ordem,
      reason: resolucao.reason,
      objective: plano?.objective ?? null,
    },
  };
}

/**
 * A ordem de leitura do plano aplicada à cópia: o Pilar da cópia à frente e os
 * demais na `order` declarada. Nenhum artigo entra nem sai; só a ordem muda.
 */
export function orderSiloWorkingCopyByDeclaredPlan(copy: SiloWorkingCopy, orderedRefs: readonly string[]): SiloWorkingCopy {
  const pilar = copy.pillarCandidateArticleId;
  const ordem = orderIdsByDeclaredPlan(copy.articleReferences.map(reference => reference.articleId), orderedRefs, pilar);
  const posicao = new Map(ordem.map((articleId, index) => [articleId, index]));
  return {
    ...copy,
    articleReferences: [...copy.articleReferences].sort((esquerda, direita) => (posicao.get(esquerda.articleId) ?? 0) - (posicao.get(direita.articleId) ?? 0)),
    supportArticleIds: orderIdsByDeclaredPlan(copy.supportArticleIds, orderedRefs, null),
  };
}

export function siloWorkingCopyIssues(copy: SiloWorkingCopy) {
  const issues: string[] = [];
  if (!copy.pillarCandidateArticleId) issues.push("O Pilar ainda não foi escolhido por decisão humana; heurística e IA apenas sugerem candidatos.");
  if (copy.articleReferences.filter(reference => reference.role === "pillar_candidate").length !== 1) issues.push("A working copy deve ter exatamente um Pilar escolhido por decisão humana.");
  if (copy.articleReferences.some(reference => !reference.articleDnaVersionId || !reference.articleDnaContentHash)) issues.push("Há ArticleDNA sem referência de versão/hash.");
  if (copy.siloPage.pillarArticleId !== null || !copy.siloPage.distinctFromPillar) issues.push("SiloPage deve permanecer distinta do Pilar.");
  return issues;
}
