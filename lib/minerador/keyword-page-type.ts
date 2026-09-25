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
 * O PESO DA ESCOLHA (pedido do dono, 2026-09-24): além do tipo, o humano diz
 * se ele é **potencial** ("pode ser um Artigo") ou **declarado** ("vai ser um
 * Artigo, travado"). É uma dimensão a mais, gravada ao lado do tipo em
 * `keyword_page_type_stance`: o enum dos 4 tipos fica intacto, e quem não
 * conhece a chave nova lê exatamente o que lia antes.
 *
 * Declarado vale para qualquer keyword, publicada ou não. Na publicada, o
 * tipo já era declaração pela publicação e continua sendo.
 */
export const KEYWORD_PAGE_TYPE_STANCES = ["potential", "declared"] as const;
export type KeywordPageTypeStance = typeof KEYWORD_PAGE_TYPE_STANCES[number];
export const KEYWORD_PAGE_TYPE_STANCE_KEY = "keyword_page_type_stance" as const;

function isStance(value: unknown): value is KeywordPageTypeStance {
  return value === "potential" || value === "declared";
}

export type KeywordPageTypeChoice = {
  /** Valor do `<select>`: `potential:article`, `declared:silo`. */
  value: string;
  pageType: KeywordPageType;
  stance: KeywordPageTypeStance;
  /** `Artigo · potencial` ou `Artigo · declarado`. */
  label: string;
};

export function keywordPageTypeChoiceValue(pageType: KeywordPageType, stance: KeywordPageTypeStance): string {
  return `${stance}:${pageType}`;
}

/** Valor do select vira tipo + peso; valor desconhecido não vira nada. */
export function parseKeywordPageTypeChoice(value: unknown): { pageType: KeywordPageType; stance: KeywordPageTypeStance } | null {
  if (typeof value !== "string") return null;
  const [stance, pageType, ...rest] = value.split(":");
  if (rest.length > 0 || !isStance(stance) || !isPageType(pageType)) return null;
  return { pageType, stance };
}

/**
 * As escolhas do Potencial de página: os 4 potenciais e os 4 declarados. Na
 * publicada, o tipo já é declaração pela publicação — a tela mostra só os 4
 * declarados, como antes.
 */
export function keywordPageTypeChoices(options: { published?: boolean } = {}): KeywordPageTypeChoice[] {
  const stances: readonly KeywordPageTypeStance[] = options.published ? ["declared"] : KEYWORD_PAGE_TYPE_STANCES;
  return stances.flatMap(stance => KEYWORD_PAGE_TYPES.map(pageType => ({
    value: keywordPageTypeChoiceValue(pageType, stance),
    pageType,
    stance,
    label: keywordPageTypeStanding(pageType, { declared: stance === "declared" }),
  })));
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
  /**
   * O humano escolheu o tipo como **declarado** (travado), publicada ou não.
   * Aditivo e presente só quando verdadeiro: sem a declaração, o objeto é
   * byte a byte o de antes. `declared` (acima) continua sendo só o fato da
   * publicação — é o que o Arquiteto lê como página no ar.
   */
  humanDeclared?: true;
};

/**
 * O peso que a tela mostra: `declared` quando a publicação o impõe ou o
 * humano declarou; `potential` no resto.
 */
export function keywordPageTypeStance(resolution: Pick<KeywordPageTypeResolution, "declared" | "humanDeclared">): KeywordPageTypeStance {
  return resolution.declared || resolution.humanDeclared === true ? "declared" : "potential";
}

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
  const humanDeclared = base.source === "human" && input.semantic?.[KEYWORD_PAGE_TYPE_STANCE_KEY] === "declared";
  return { ...base, published, declared: published && base.determined, ...(humanDeclared ? { humanDeclared: true as const } : {}) };
}

export function readKeywordPageType(input: KeywordPageTypeInput): KeywordPageType {
  return resolveKeywordPageType(input).type;
}

export type KeywordPageTypeHistoryEntry = {
  previous: KeywordPageType;
  next: KeywordPageType;
  actorId: string;
  changedAt: string;
  /** Presentes quando a escolha trouxe o peso (potencial/declarado). */
  previousStance?: KeywordPageTypeStance;
  nextStance?: KeywordPageTypeStance;
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
  input: {
    pageType: KeywordPageType;
    actorId: string;
    changedAt: string;
    siteRole?: unknown;
    published?: boolean;
    /** Potencial ou declarado. Ausente, o peso gravado fica como está (contrato anterior). */
    stance?: KeywordPageTypeStance;
  },
): { semantic: Record<string, unknown>; changed: boolean; reason?: string } {
  const current = { ...(semantic || {}) };
  const resolution = resolveKeywordPageType({ semantic: current, siteRole: input.siteRole, published: input.published });
  const previous = resolution.type;
  const stance = isStance(input.stance) ? input.stance : undefined;
  const previousStance: KeywordPageTypeStance = current[KEYWORD_PAGE_TYPE_STANCE_KEY] === "declared" ? "declared" : "potential";
  const sameStance = stance === undefined || stance === previousStance;
  if (previous === input.pageType && isPageType(current[KEYWORD_PAGE_TYPE_KEY]) && sameStance) {
    return { semantic: current, changed: false };
  }
  const history = readHistory(current.keyword_page_type_history);
  history.push({
    previous,
    next: input.pageType,
    actorId: input.actorId,
    changedAt: input.changedAt,
    ...(stance ? { previousStance, nextStance: stance } : {}),
  });
  return {
    semantic: {
      ...current,
      [KEYWORD_PAGE_TYPE_KEY]: input.pageType,
      ...(stance ? { [KEYWORD_PAGE_TYPE_STANCE_KEY]: stance } : {}),
      keyword_page_type_actor: input.actorId,
      keyword_page_type_at: input.changedAt,
      keyword_page_type_history: history,
    },
    changed: true,
  };
}
