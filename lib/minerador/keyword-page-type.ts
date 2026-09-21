/**
 * TIPO DE PÁGINA DA KEYWORD — a segunda declaração do Vínculo.
 *
 * A primeira é o posto (`primary-keyword-policy`): esta keyword pode perder a
 * vaga de primária? A segunda é esta: **que página ela é, ou viria a ser?**
 *
 * As duas perguntas mudam de sentido conforme exista publicação, sem mudar de
 * valor:
 *
 *   sem publicação   "tem potencial de virar um Silo ou um Artigo"
 *   com publicação   "o que está no ar É um Silo, um Artigo, uma Landing
 *                     page ou uma Página de serviço"
 *
 * Por isso é um enum só, com rótulo dependente do contexto. Inventar dois
 * campos faria a declaração se perder no dia em que a keyword for publicada.
 *
 * **Potencial só existe enquanto a keyword é nova.** Declarada a publicação,
 * o tipo deixa de ser aposta: vira DECLARAÇÃO, e é assim que a tela o
 * apresenta. O que muda é o peso da palavra, não o direito de escolher: a
 * seleção continua livre em toda a vida da keyword, porque quem sabe o que a
 * página é continua sendo o humano — inclusive para corrigir.
 *
 * O padrão é `article`: é o que a esmagadora maioria das keywords vira, e
 * declarar Silo é a exceção que o humano marca. A declaração **nunca é
 * obrigatória** — ela informa o Arquiteto, não trava o Minerador.
 *
 * Domínio puro.
 */

export const KEYWORD_PAGE_TYPES = ["article", "silo", "landing_page", "service_page"] as const;
export type KeywordPageType = typeof KEYWORD_PAGE_TYPES[number];

export const KEYWORD_PAGE_TYPE_KEY = "keyword_page_type" as const;

type Semantic = Record<string, unknown> | null | undefined;

const LABELS: Record<KeywordPageType, string> = {
  article: "Artigo",
  silo: "Silo",
  landing_page: "Landing page",
  service_page: "Página de serviço",
};

export function keywordPageTypeLabel(type: KeywordPageType): string {
  return LABELS[type];
}

/**
 * Rótulo com o sentido explícito. Sem publicação é aposta; com publicação é
 * fato observado — e a tela não pode deixar os dois parecerem a mesma coisa.
 */
export function keywordPageTypeStatement(type: KeywordPageType, options: { published?: boolean } = {}): string {
  return options.published ? LABELS[type] : `Potencial: ${LABELS[type]}`;
}

/**
 * Como a tela nomeia o valor: `Artigo · potencial` enquanto a keyword é
 * nova, `Artigo · declarado` depois que a publicação existe.
 */
export function keywordPageTypeStanding(type: KeywordPageType, options: { declared?: boolean } = {}): string {
  return `${LABELS[type]} · ${options.declared ? "declarado" : "potencial"}`;
}

function isPageType(value: unknown): value is KeywordPageType {
  return typeof value === "string" && (KEYWORD_PAGE_TYPES as readonly string[]).includes(value);
}

/**
 * O papel observado no caminho publicado. Enquanto a publicação não é
 * declarada, ele sugere; declarada, é o fato que trava o tipo.
 */
function fromSiteRole(siteRole: unknown): KeywordPageType | null {
  return siteRole === "silo" || siteRole === "article" ? siteRole : null;
}

export type KeywordPageTypeResolution = {
  type: KeywordPageType;
  /** `human` quando alguém declarou; `site` quando veio do papel observado; `default` no resto. */
  source: "human" | "site" | "default";
  /** Há valor determinado — declarado por alguém ou observado na página. */
  determined: boolean;
  /**
   * Publicada e determinada: o tipo é **declaração**, não aposta. Muda como a
   * tela apresenta o valor; **não** desabilita a escolha.
   */
  declared: boolean;
  /** `false` enquanto a keyword é nova: aí o valor é potencial. */
  published: boolean;
};

export type KeywordPageTypeInput = { semantic?: Semantic; siteRole?: unknown; published?: boolean };

export function resolveKeywordPageType(input: KeywordPageTypeInput): KeywordPageTypeResolution {
  const published = input.published === true;
  const declared = input.semantic?.[KEYWORD_PAGE_TYPE_KEY];
  const observed = fromSiteRole(input.siteRole);
  const base = isPageType(declared)
    ? { type: declared, source: "human" as const, determined: true }
    : observed
      ? { type: observed, source: "site" as const, determined: true }
      : { type: "article" as const, source: "default" as const, determined: false };
  // Publicada e com valor determinado, o tipo é declaração: a tela para de
  // dizer "potencial". Continua editável — corrigir o que a página é tem de
  // ser possível sem desfazer a publicação.
  return { ...base, published, declared: published && base.determined };
}

export function readKeywordPageType(input: KeywordPageTypeInput): KeywordPageType {
  return resolveKeywordPageType(input).type;
}

export type KeywordPageTypeHistoryEntry = {
  previous: KeywordPageType;
  next: KeywordPageType;
  actorId: string;
  changedAt: string;
};

function readHistory(value: unknown): KeywordPageTypeHistoryEntry[] {
  return Array.isArray(value) ? value.filter(entry => entry && typeof entry === "object") as KeywordPageTypeHistoryEntry[] : [];
}

/**
 * Grava a declaração humana. Sem gate: declarar que uma keyword livre viraria
 * um Silo é justamente o que o Arquiteto precisa saber antes de formar nada.
 */
export function setKeywordPageType(
  semantic: Semantic,
  input: { pageType: KeywordPageType; actorId: string; changedAt: string; siteRole?: unknown; published?: boolean },
): { semantic: Record<string, unknown>; changed: boolean; reason?: string } {
  const current = { ...(semantic || {}) };
  const resolution = resolveKeywordPageType({ semantic: current, siteRole: input.siteRole, published: input.published });
  const previous = resolution.type;
  if (previous === input.pageType && isPageType(current[KEYWORD_PAGE_TYPE_KEY])) {
    return { semantic: current, changed: false };
  }
  const history = readHistory(current.keyword_page_type_history);
  history.push({ previous, next: input.pageType, actorId: input.actorId, changedAt: input.changedAt });
  return {
    semantic: {
      ...current,
      [KEYWORD_PAGE_TYPE_KEY]: input.pageType,
      keyword_page_type_actor: input.actorId,
      keyword_page_type_at: input.changedAt,
      keyword_page_type_history: history,
    },
    changed: true,
  };
}
