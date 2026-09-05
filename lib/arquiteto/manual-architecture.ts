export type ManualKeywordRole = "principal" | "secundaria" | "reforco_narrativo";

type ManualRoleItem = {
  id: string;
  clusterId?: string | number | null;
  reviewRole?: ManualKeywordRole | null;
};

/**
 * Applies a human role decision to the working copy of one provisional article.
 * Selecting a new principal demotes the previous principal instead of creating
 * two principals. Other clusters and all unknown fields remain untouched.
 */
export function applyManualKeywordRole<T extends ManualRoleItem>(
  items: readonly T[],
  input: { clusterId: string | number; keywordId: string; role: ManualKeywordRole },
): T[] {
  const clusterKey = String(input.clusterId);
  const target = items.find(item => item.id === input.keywordId && String(item.clusterId) === clusterKey);
  if (!target) return [...items];
  const hasAnotherPrincipal = input.role === "principal"
    && items.some(item => String(item.clusterId) === clusterKey && item.id !== input.keywordId && item.reviewRole === "principal");
  if (target.reviewRole === input.role && !hasAnotherPrincipal) return [...items];

  return items.map(item => {
    if (String(item.clusterId) !== clusterKey) return item;
    if (item.id === input.keywordId) return { ...item, reviewRole: input.role };
    if (input.role === "principal" && item.reviewRole === "principal") {
      return { ...item, reviewRole: "secundaria" };
    }
    return item;
  });
}

export function manualKeywordRoleFor(item: ManualRoleItem): ManualKeywordRole {
  return item.reviewRole === "principal" || item.reviewRole === "reforco_narrativo"
    ? item.reviewRole
    : "secundaria";
}

/* ------------------------------------------------------------------ *
 * Edição estrutural humana da working copy do Article.
 *
 * A Revisão Humana é a autoridade final: Lógica propõe, SERP observa, IA
 * sugere. Estas funções são as ÚNICAS mutações estruturais — aplicar uma
 * proposta da IA e resolver uma divergência da SERP passam por aqui, sem
 * caminho paralelo.
 *
 * Nada aqui toca KeywordDNA: apenas pertencimento, papel e composição.
 * ------------------------------------------------------------------ */

export type ManualArchitectureItem = ManualRoleItem & {
  keyword?: string;
  provisionalGroupId?: string | null;
  isPublished?: boolean;
  primaryKeywordPolicy?: string | null;
};

export type ManualArchitectureOutcome<T> =
  | { ok: true; items: T[]; summary: string }
  | { ok: false; reason: string };

/**
 * Identidade do Article na cópia de trabalho, na mesma regra de
 * `describeAssignedGroups`. `clusterId` sozinho não serve: dois Articles podem
 * compartilhar o mesmo cluster herdado da importação.
 */
export function articleKeyOf(item: ManualArchitectureItem): string {
  return String(item.provisionalGroupId || item.clusterId || item.id || "");
}

/** Aplica um papel dentro do Article endereçado pela identidade canônica. */
function withArticleRole<T extends ManualArchitectureItem>(items: readonly T[], articleKey: string | number, keywordId: string, role: ManualKeywordRole): T[] {
  return items.map(item => (articleKeyOf(item) === String(articleKey) && item.id === keywordId ? { ...item, reviewRole: role } : item));
}

/** Keywords que compõem o Article na cópia de trabalho. */
export function articleMembers<T extends ManualArchitectureItem>(items: readonly T[], articleKey: string | number): T[] {
  return items.filter(item => articleKeyOf(item) === String(articleKey));
}

/**
 * Invariante da working copy: exatamente uma Principal efetiva por Article.
 * O hash da base já é imune a papéis transitórios; a cópia de trabalho também
 * não pode continuar exibindo duas Principais.
 */
export function effectivePrincipalCount(items: readonly ManualArchitectureItem[], articleKey: string | number): number {
  return articleMembers(items, articleKey).filter(item => item.reviewRole === "principal").length;
}

/**
 * Garante uma única Principal no Article. Quando a atual saiu do grupo, a
 * escolha é explícita via `preferredPrincipalId`; sem ela a primeira keyword
 * remanescente assume, para nunca deixar um Article sem Principal.
 */
export function normalizeArticlePrincipal<T extends ManualArchitectureItem>(
  items: readonly T[],
  articleKey: string | number,
  preferredPrincipalId?: string | null,
): T[] {
  const members = articleMembers(items, articleKey);
  if (!members.length) return [...items];
  const principals = members.filter(item => item.reviewRole === "principal");
  const chosen = members.find(item => item.id === preferredPrincipalId) || principals[0] || members[0];
  return items.map(item => {
    if (articleKeyOf(item) !== String(articleKey)) return item;
    if (item.id === chosen.id) return item.reviewRole === "principal" ? item : { ...item, reviewRole: "principal" };
    return item.reviewRole === "principal" ? { ...item, reviewRole: "secundaria" } : item;
  });
}

/** Promove uma keyword a Principal, demovendo a anterior na mesma operação. */
export function promoteManualPrincipal<T extends ManualArchitectureItem>(
  items: readonly T[],
  input: { articleKey: string | number; keywordId: string },
): ManualArchitectureOutcome<T> {
  const target = articleMembers(items, input.articleKey).find(item => item.id === input.keywordId);
  if (!target) return { ok: false, reason: "A keyword não pertence a este artigo." };
  if (target.isPublished) return { ok: false, reason: "A identidade publicada está protegida contra troca de Principal." };
  if (target.primaryKeywordPolicy === "locked") {
    return { ok: false, reason: "A política da principal está travada e não permite troca." };
  }
  const next = normalizeArticlePrincipal(
    withArticleRole(items, input.articleKey, input.keywordId, "principal"),
    input.articleKey,
    input.keywordId,
  );
  return { ok: true, items: next, summary: `${target.keyword || input.keywordId} passou a ser a Principal.` };
}

/** Troca Secundária por Reforço narrativo e vice-versa, sem criar Principal. */
export function setManualSupportRole<T extends ManualArchitectureItem>(
  items: readonly T[],
  input: { articleKey: string | number; keywordId: string; role: Exclude<ManualKeywordRole, "principal"> },
): ManualArchitectureOutcome<T> {
  const target = articleMembers(items, input.articleKey).find(item => item.id === input.keywordId);
  if (!target) return { ok: false, reason: "A keyword não pertence a este artigo." };
  if (target.isPublished) return { ok: false, reason: "As keywords de um artigo publicado permanecem protegidas." };
  if (target.reviewRole === "principal") {
    return { ok: false, reason: "Defina outra Principal antes de rebaixar a atual." };
  }
  const next = withArticleRole(items, input.articleKey, input.keywordId, input.role);
  return { ok: true, items: next, summary: `${target.keyword || input.keywordId}: papel atualizado.` };
}

/**
 * Move a keyword entre Articles da mesma working copy. Operação atômica: ou
 * sai da origem e entra no destino, ou nada muda.
 */
export function moveKeywordToArticle<T extends ManualArchitectureItem>(
  items: readonly T[],
  input: {
    keywordId: string;
    fromArticleKey: string | number;
    toArticleKey: string | number;
    maxKeywordsPerArticle: number;
    /** Obrigatório quando a keyword movida é a Principal e a origem continua com keywords. */
    nextPrincipalKeywordId?: string | null;
  },
): ManualArchitectureOutcome<T> {
  if (String(input.fromArticleKey) === String(input.toArticleKey)) {
    return { ok: false, reason: "A keyword já pertence a este artigo." };
  }
  const source = articleMembers(items, input.fromArticleKey);
  const target = articleMembers(items, input.toArticleKey);
  const moved = source.find(item => item.id === input.keywordId);
  if (!moved) return { ok: false, reason: "A keyword não pertence ao artigo de origem." };
  if (!target.length) return { ok: false, reason: "O artigo de destino não existe nesta área de trabalho." };
  if (moved.isPublished) return { ok: false, reason: "As keywords de um artigo publicado permanecem protegidas." };
  if (target.length + 1 > input.maxKeywordsPerArticle) {
    return { ok: false, reason: `O artigo de destino já tem ${target.length} keywords; o máximo é ${input.maxKeywordsPerArticle}.` };
  }
  const remaining = source.filter(item => item.id !== input.keywordId);
  if (moved.reviewRole === "principal" && remaining.length && !input.nextPrincipalKeywordId) {
    return { ok: false, reason: "Escolha a nova Principal do artigo de origem antes de mover a atual." };
  }
  if (input.nextPrincipalKeywordId && !remaining.some(item => item.id === input.nextPrincipalKeywordId)) {
    return { ok: false, reason: "A nova Principal precisa ser uma keyword que permanece no artigo de origem." };
  }

  // Entra com o cluster e o grupo reais do destino, nunca com a chave abstrata.
  const targetClusterId = target[0]?.clusterId ?? input.toArticleKey;
  const targetGroupId = target[0]?.provisionalGroupId ?? String(input.toArticleKey);
  // A keyword entra como Secundária: nunca desloca a Principal do destino.
  const relocated = items.map(item => item.id === input.keywordId
    ? { ...item, clusterId: targetClusterId, provisionalGroupId: targetGroupId, reviewRole: "secundaria" as ManualKeywordRole }
    : item);
  const next = remaining.length
    ? normalizeArticlePrincipal(relocated, input.fromArticleKey, input.nextPrincipalKeywordId)
    : relocated;
  return { ok: true, items: next, summary: `${moved.keyword || input.keywordId} movida para o artigo de destino.` };
}

/**
 * Retira a keyword do Article e devolve para "Keywords não agrupadas". A
 * KeywordDNA continua existindo: importada ao Arquiteto, ela está em um
 * Article ou não agrupada, nunca desaparece.
 */
export function ungroupKeyword<T extends ManualArchitectureItem>(
  items: readonly T[],
  input: { keywordId: string; articleKey: string | number; nextPrincipalKeywordId?: string | null },
): ManualArchitectureOutcome<T> {
  const source = articleMembers(items, input.articleKey);
  const target = source.find(item => item.id === input.keywordId);
  if (!target) return { ok: false, reason: "A keyword não pertence a este artigo." };
  if (target.isPublished) return { ok: false, reason: "As keywords de um artigo publicado permanecem protegidas." };
  const remaining = source.filter(item => item.id !== input.keywordId);
  if (target.reviewRole === "principal" && remaining.length && !input.nextPrincipalKeywordId) {
    return { ok: false, reason: "Escolha a nova Principal do artigo antes de retirar a atual." };
  }
  const detached = items.map(item => item.id === input.keywordId
    ? { ...item, clusterId: null, provisionalGroupId: null, reviewRole: null }
    : item);
  const next = remaining.length
    ? normalizeArticlePrincipal(detached, input.articleKey, input.nextPrincipalKeywordId)
    : detached;
  return { ok: true, items: next, summary: `${target.keyword || input.keywordId} voltou para Keywords não agrupadas.` };
}

/** Separa a keyword em um Article novo, do qual ela vira a Principal. */
export function createArticleFromKeyword<T extends ManualArchitectureItem>(
  items: readonly T[],
  input: { keywordId: string; articleKey: string | number; newClusterId: string; nextPrincipalKeywordId?: string | null },
): ManualArchitectureOutcome<T> {
  const source = articleMembers(items, input.articleKey);
  const target = source.find(item => item.id === input.keywordId);
  if (!target) return { ok: false, reason: "A keyword não pertence a este artigo." };
  if (target.isPublished) return { ok: false, reason: "As keywords de um artigo publicado permanecem protegidas." };
  if (source.length === 1) return { ok: false, reason: "O artigo já é formado só por esta keyword." };
  if (target.reviewRole === "principal" && !input.nextPrincipalKeywordId) {
    return { ok: false, reason: "Escolha a nova Principal do artigo de origem antes de separar a atual." };
  }
  const separated = items.map(item => item.id === input.keywordId
    ? { ...item, clusterId: input.newClusterId, provisionalGroupId: input.newClusterId, reviewRole: "principal" as ManualKeywordRole }
    : item);
  const next = normalizeArticlePrincipal(separated, input.articleKey, input.nextPrincipalKeywordId);
  return { ok: true, items: next, summary: `${target.keyword || input.keywordId} passou a formar um artigo próprio.` };
}
