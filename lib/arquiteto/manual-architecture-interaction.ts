import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";
import {
  articleMembers,
  createArticleFromKeyword,
  manualKeywordRoleFor,
  moveKeywordToArticle,
  promoteManualPrincipal,
  ungroupKeyword,
  type ManualArchitectureItem,
  type ManualArchitectureOutcome,
} from "./manual-architecture.ts";

/**
 * Fiação da edição estrutural humana: intenção → confirmação → mutação.
 *
 * Vive fora do componente porque a etapa que quebrou no smoke não foi o
 * helper puro, e sim a ligação entre o controle e a mutação. Aqui ela é
 * exercitável sem navegador.
 */
export type ManualArchitectureKind = "principal" | "move" | "ungroup" | "split";

export type ManualArchitectureTarget = {
  id: string;
  articleKey: string;
  label: string;
  keywordCount: number;
  isPublished: boolean;
  full: boolean;
};

export type PendingManualArchitecture = {
  kind: ManualArchitectureKind;
  articleKey: string;
  keywordId: string;
  keywordLabel: string;
  articleLabel: string;
  targetArticleKey: string | null;
  targetLabel: string | null;
  requiresNextPrincipal: boolean;
  nextPrincipalKeywordId: string | null;
  nextPrincipalOptions: Array<{ id: string; keyword: string }>;
  newClusterId: string;
  before: string;
  after: string;
  impact: string;
};

export type ManualArchitectureRequest<T extends ManualArchitectureItem> =
  | { ok: true; pending: PendingManualArchitecture }
  | { ok: false; reason: string; items?: T[] };

const roleLabel = { principal: "Principal", secundaria: "Secundária", reforco_narrativo: "Reforço narrativo" } as const;

/** Artigos que podem receber a keyword; o cheio é listado e bloqueado. */
export function manualMoveTargets<T extends ManualArchitectureItem>(input: {
  articles: ReadonlyArray<{ id: string; articleKey: string; label: string; isPublished?: boolean }>;
  items: readonly T[];
  currentArticleId: string;
  maxKeywordsPerArticle?: number;
}): ManualArchitectureTarget[] {
  const max = input.maxKeywordsPerArticle ?? MAX_KEYWORDS_PER_ARTICLE;
  return input.articles
    .filter(article => article.id !== input.currentArticleId)
    .map(article => {
      const keywordCount = articleMembers(input.items, article.articleKey).length;
      return {
        id: article.id,
        articleKey: article.articleKey,
        label: article.label,
        keywordCount,
        isPublished: Boolean(article.isPublished),
        full: keywordCount >= max,
      };
    });
}

/**
 * Traduz o clique/seleção em uma confirmação pendente. Recusa antes de
 * confirmar o que já é impossível, para o usuário não confirmar no vazio.
 */
export function requestManualArchitecture<T extends ManualArchitectureItem>(input: {
  kind: ManualArchitectureKind;
  items: readonly T[];
  articleKey: string;
  articleLabel: string;
  keywordId: string;
  isPublishedArticle?: boolean;
  target?: ManualArchitectureTarget | null;
  maxKeywordsPerArticle?: number;
}): ManualArchitectureRequest<T> {
  const max = input.maxKeywordsPerArticle ?? MAX_KEYWORDS_PER_ARTICLE;
  const members = articleMembers(input.items, input.articleKey);
  const keyword = members.find(item => String(item.id) === String(input.keywordId));
  if (!keyword) return { ok: false, reason: "A keyword não pertence a este artigo." };
  if (input.isPublishedArticle || keyword.isPublished) {
    return { ok: false, reason: "Artigo publicado: identidade, Principal e keywords estão protegidas." };
  }
  if (input.kind === "move") {
    if (!input.target) return { ok: false, reason: "Escolha o artigo de destino." };
    if (input.target.full) {
      return { ok: false, reason: `${input.target.label} já tem ${input.target.keywordCount} keywords; o máximo é ${max}.` };
    }
  }
  if (input.kind === "split" && members.length === 1) {
    return { ok: false, reason: "O artigo já é formado só por esta keyword." };
  }

  const remaining = members.filter(item => String(item.id) !== String(input.keywordId));
  const isPrincipal = manualKeywordRoleFor(keyword) === "principal";
  const requiresNextPrincipal = input.kind !== "principal" && isPrincipal && remaining.length > 0;
  const keywordLabel = String(keyword.keyword || input.keywordId);
  const sourceCount = members.length;

  const after = input.kind === "principal"
    ? `${keywordLabel} · Principal de ${input.articleLabel}`
    : input.kind === "move"
      ? `${input.articleLabel} com ${sourceCount - 1} keyword(s) · ${input.target?.label} com ${(input.target?.keywordCount ?? 0) + 1} · papel no destino: Secundária`
      : input.kind === "ungroup"
        ? `${input.articleLabel} com ${sourceCount - 1} keyword(s) · ${keywordLabel} em Keywords não agrupadas`
        : `${input.articleLabel} com ${sourceCount - 1} keyword(s) · novo artigo com ${keywordLabel} como Principal`;

  return {
    ok: true,
    pending: {
      kind: input.kind,
      articleKey: input.articleKey,
      keywordId: String(input.keywordId),
      keywordLabel,
      articleLabel: input.articleLabel,
      targetArticleKey: input.target?.articleKey ?? null,
      targetLabel: input.target?.label ?? null,
      requiresNextPrincipal,
      nextPrincipalKeywordId: requiresNextPrincipal ? String(remaining[0].id) : null,
      nextPrincipalOptions: remaining.map(item => ({ id: String(item.id), keyword: String(item.keyword || item.id) })),
      // Id estável por keyword: separar duas vezes não gera dois grupos órfãos.
      newClusterId: `manual-article-${input.keywordId}`,
      before: `${keywordLabel} · ${roleLabel[manualKeywordRoleFor(keyword)]} em ${input.articleLabel} (${sourceCount} keyword(s))`,
      after,
      impact: input.kind === "principal"
        ? "A Principal anterior passa a Secundária. A SERP e a revisão da IA desta formação viram histórico."
        : remaining.length === 0
          ? "O artigo de origem fica sem keywords e deixa de existir na cópia de trabalho."
          : "A composição do artigo muda. A SERP e a revisão da IA desta formação viram histórico.",
    },
  };
}

/** Executa a confirmação pendente pela mutação canônica correspondente. */
export function resolveManualArchitecture<T extends ManualArchitectureItem>(
  items: readonly T[],
  pending: PendingManualArchitecture,
  maxKeywordsPerArticle = MAX_KEYWORDS_PER_ARTICLE,
): ManualArchitectureOutcome<T> {
  const nextPrincipalKeywordId = pending.requiresNextPrincipal ? pending.nextPrincipalKeywordId : null;
  if (pending.requiresNextPrincipal && !nextPrincipalKeywordId) {
    return { ok: false, reason: "Escolha a nova Principal do artigo de origem." };
  }
  if (pending.kind === "principal") {
    return promoteManualPrincipal(items, { articleKey: pending.articleKey, keywordId: pending.keywordId });
  }
  if (pending.kind === "move") {
    if (!pending.targetArticleKey) return { ok: false, reason: "Escolha o artigo de destino." };
    return moveKeywordToArticle(items, {
      keywordId: pending.keywordId,
      fromArticleKey: pending.articleKey,
      toArticleKey: pending.targetArticleKey,
      maxKeywordsPerArticle,
      nextPrincipalKeywordId,
    });
  }
  if (pending.kind === "ungroup") {
    return ungroupKeyword(items, { keywordId: pending.keywordId, articleKey: pending.articleKey, nextPrincipalKeywordId });
  }
  return createArticleFromKeyword(items, {
    keywordId: pending.keywordId,
    articleKey: pending.articleKey,
    newClusterId: pending.newClusterId,
    nextPrincipalKeywordId,
  });
}

export type ManualArchitectureCommit =
  | { status: "refused"; message: string }
  | { status: "not_persisted"; message: string }
  | { status: "applied"; message: string };

/**
 * Aplica na cópia de trabalho e só anuncia sucesso depois da persistência
 * canônica confirmar. Recusa nunca chega a tocar o estado.
 */
export async function commitManualArchitecture<T extends ManualArchitectureItem>(input: {
  previous: readonly T[];
  outcome: ManualArchitectureOutcome<T>;
  apply: (items: T[]) => void;
  persist: (changed: T[]) => Promise<boolean>;
}): Promise<ManualArchitectureCommit> {
  if (!input.outcome.ok) return { status: "refused", message: input.outcome.reason };
  const changed = input.outcome.items.filter((item, index) => item !== input.previous[index]);
  input.apply(input.outcome.items);
  const persisted = await input.persist(changed);
  if (!persisted) {
    return {
      status: "not_persisted",
      message: "A mudança foi aplicada na tela, mas a gravação canônica não confirmou. Desfaça ou tente novamente.",
    };
  }
  return {
    status: "applied",
    // Estrutura alterada: SERP e IA anteriores viram histórico da base antiga.
    message: `${input.outcome.summary} A estrutura mudou: atualize a SERP e execute a IA novamente para reavaliar a nova formação.`,
  };
}
