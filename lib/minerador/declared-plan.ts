import { z } from "zod";

/**
 * ===== PLANO DECLARADO DO SILO — DOMÍNIO PURO =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §5.3 e
 * §6.1 (aprovada pelo dono em 2026-10-12), D1/D2-bis/D7/D10 da §17 e a emenda
 * D1-bis do ADR-022.
 *
 * O plano é DECLARAÇÃO HUMANA. Ele mora em dois lugares:
 *
 *   - o Silo planejado (nome, slug, objetivo) no GRUPO (`editorial_groups.plan`),
 *     fora do hash de qualquer pacote aprovado;
 *   - cada artigo do plano (ordem, papel, escopo, principal declarada) na
 *     declaração do ASSUNTO (`analise_semantica.keyword_subject.plan`), DENTRO
 *     do pacote aprovado — e a principal recebe a marca recíproca
 *     (`analise_semantica.keyword_declared_principal`).
 *
 * Este módulo não lê banco, não chama provider e não sabe quem o chama: é o
 * contrato (zod), o parser do texto que o dono cola e as recusas do plano.
 * Quem grava é `declared-plan-import-core.ts`, pelo mesmo núcleo para a tela
 * e para o MCP.
 */

/**
 * A mesma normalização de `normalizeKeyword` (`keyword-import-core.ts`), copiada
 * para este módulo não importar o núcleo do import (ciclo keyword-subject →
 * declared-plan → keyword-import-core → keyword-subject). O teste
 * `minerador-plano-declarado` confere que as duas dão o mesmo resultado.
 */
export function normalizeDeclaredPhraseKey(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ")
    : "";
}
const normalizeKeyword = normalizeDeclaredPhraseKey;

/* --------------------------------------------------------------- contrato */

export const DECLARED_PLAN_ROLES = ["Pilar", "Suporte"] as const;
export type DeclaredPlanRole = (typeof DECLARED_PLAN_ROLES)[number];

/** D10 — a descrição do escopo viaja no CSV numa linha só, até 1.200 caracteres. */
export const DECLARED_PLAN_SCOPE_MAX = 1200;
/**
 * D3 — até 30 artigos por Silo. É o mesmo teto de `SILO_ARTICLE_RANGE.max`
 * (`lib/agent/silo-plan.ts`); o teste `minerador-plano-declarado` confere que os
 * dois continuam iguais, sem o Minerador importar o módulo do agente.
 */
export const DECLARED_PLAN_ARTICLES_MAX = 30;
/** Abaixo disto o plano entra, mas o fechamento do Silo vai pedir mais artigos. */
export const DECLARED_PLAN_ARTICLES_MIN_FOR_SILO = 4;
export const DECLARED_PLAN_SILO_NAME_MAX = 120;
export const DECLARED_PLAN_OBJECTIVE_MAX = 1200;
/** 2026-10-16 · o slug do artigo do plano (um segmento). */
export const DECLARED_PLAN_ARTICLE_SLUG_MAX = 200;

const LINE_BREAK = /[\r\n\u2028\u2029]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A TRAVA DA PRINCIPAL (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`
 * §3.3; ADR-022, emenda D1-ter). Gravada só quando o humano escolhe à mão
 * (`plan.lock`); ausente = automática (pelo volume medido da keyword que carrega
 * o Assunto) ou, no plano anterior ao cadastro único, travada pela declaração.
 */
export const DECLARED_PLAN_LOCKS = ["locked", "free"] as const;
export type DeclaredPlanLock = (typeof DECLARED_PLAN_LOCKS)[number];
/** A escolha do card: "auto" não grava nada (a trava segue o volume). */
export const DECLARED_PLAN_LOCK_CHOICES = ["auto", "locked", "free"] as const;
export type DeclaredPlanLockChoice = (typeof DECLARED_PLAN_LOCK_CHOICES)[number];

/** O artigo do plano, gravado em `keyword_subject.plan` do Assunto. */
export const DeclaredArticlePlanSchema = z.object({
  /** `editorial_groups.id` no ato: proveniência da declaração (FK lógica, não do banco). */
  groupId: z.string().regex(UUID),
  /** `editorial_groups.plan_version` no ato. */
  planVersion: z.number().int().positive(),
  order: z.number().int().min(1).max(DECLARED_PLAN_ARTICLES_MAX),
  role: z.enum(DECLARED_PLAN_ROLES),
  scope: z.string().trim().min(1).max(DECLARED_PLAN_SCOPE_MAX).refine(value => !LINE_BREAK.test(value), "O escopo precisa caber numa linha só."),
  /**
   * A principal declarada (D1-bis). No cadastro único (2026-10-13) é a PRÓPRIA
   * keyword que carrega o Assunto. Fixa só quando travada (`declaredPrincipalLock`).
   * `null` = sem principal declarada.
   */
  declaredPrincipal: z.object({ keywordId: z.string().min(1), phrase: z.string().trim().min(1) }).strict().nullable(),
  /** 2026-10-13 · trava MANUAL. Ausente = automática (pelo volume) ou, no plano anterior, travada pela declaração. */
  lock: z.enum(DECLARED_PLAN_LOCKS).optional(),
  /**
   * 2026-10-16 · o SLUG DECLARADO do artigo (o último segmento, sem barras:
   * "como-escolher-plano-internet-residencial"). Opcional e aditivo: plano sem
   * slug continua válido e o Arquiteto forma o slug pela principal, como
   * sempre. O caminho inteiro sai do slug do Silo (`editorial_groups.plan`).
   * O Arquiteto usa este slug só no artigo NOVO; publicado nunca muda (AGENTS §11).
   */
  slug: z.string().max(DECLARED_PLAN_ARTICLE_SLUG_MAX).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
}).strict();
export type DeclaredArticlePlan = z.infer<typeof DeclaredArticlePlanSchema>;

/* -------------------------------------------- o Assunto dentro da keyword */

/** O título do Assunto: uma linha, até 300 caracteres (viaja até o H1/CSV). */
export const SUBJECT_ENTRY_TITLE_MAX = 300;

/**
 * O ASSUNTO CADASTRADO DENTRO DA KEYWORD (SDD 2026-10-13 §3.2): o título que o
 * dono escreveu no card, a origem do cadastro e, só no destino "artigo
 * publicado" (sem plano de Silo), os detalhes. No Silo, os detalhes moram em
 * `plan.scope` (viram a promessa do ArticleDNA). Nenhuma linha "Assunto" solta
 * nasce: o título é texto do cadastro, não keyword.
 */
export const SubjectEntrySchema = z.object({
  title: z.string().trim().min(1).max(SUBJECT_ENTRY_TITLE_MAX).refine(value => !LINE_BREAK.test(value), "O título do Assunto precisa caber numa linha só."),
  source: z.literal("cadastro"),
  details: z.string().trim().min(1).max(DECLARED_PLAN_SCOPE_MAX).refine(value => !LINE_BREAK.test(value), "Os detalhes precisam caber numa linha só.").optional(),
}).strict();
export type SubjectEntry = z.infer<typeof SubjectEntrySchema>;

export function readSubjectEntry(value: unknown): SubjectEntry | null {
  if (value === null || value === undefined) return null;
  const parsed = SubjectEntrySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function sameSubjectEntry(left: SubjectEntry | null, right: SubjectEntry | null): boolean {
  if (!left || !right) return !left && !right;
  return left.title === right.title && left.source === right.source && (left.details ?? null) === (right.details ?? null);
}

export type DeclaredPrincipalLockOrigin = "manual" | "volume" | "declared";
export type DeclaredPrincipalLockView = {
  state: DeclaredPlanLock;
  origin: DeclaredPrincipalLockOrigin;
  /** A keyword que a trava protege (a principal do plano). */
  keywordId: string;
  phrase: string;
  /** O Assunto mora na própria keyword (cadastro único). */
  carriedByKeyword: boolean;
  label: string;
};

export const DECLARED_PLAN_LOCK_ORIGIN_LABELS: Record<DeclaredPrincipalLockOrigin, string> = {
  manual: "escolhida à mão",
  volume: "pelo volume medido",
  declared: "declarada antes do cadastro único",
};

/** O volume vale para a trava automática só quando validado E maior que zero (medido 0 = sem volume). */
export function hasLockingVolume(volume: { validated: boolean; value: number | null } | null | undefined): boolean {
  return Boolean(volume?.validated) && typeof volume?.value === "number" && volume.value > 0;
}

/**
 * A TRAVA EFETIVA da principal do plano — a leitura única (Minerador e
 * Arquiteto perguntam aqui):
 *
 *   1. `plan.lock` gravado → o valor (origem `manual`);
 *   2. o Assunto mora na própria keyword (`declaredPrincipal.keywordId ===
 *      subjectKeywordId`) → travada com Volume validado > 0, livre sem
 *      (origem `volume`) — medir o volume, por clique, já trava;
 *   3. plano anterior (Assunto e principal em linhas separadas) → travada
 *      (origem `declared`): decisão humana já confirmada (AGENTS.md §9).
 *
 * Sem principal declarada, `null`. `volume` é o da principal (no cadastro
 * único, o da própria keyword); `null` = desconhecido (vale como sem volume).
 */
export function declaredPrincipalLock(
  plan: Pick<DeclaredArticlePlan, "declaredPrincipal" | "lock"> | null | undefined,
  input: { subjectKeywordId: string; volume?: { validated: boolean; value: number | null } | null },
): DeclaredPrincipalLockView | null {
  const principal = plan?.declaredPrincipal;
  if (!principal) return null;
  const carriedByKeyword = principal.keywordId === input.subjectKeywordId;
  let state: DeclaredPlanLock;
  let origin: DeclaredPrincipalLockOrigin;
  /*
   * 2026-10-18 · VOLUME DEFINIDO FIXA (D1 da linha única do Minerador, 16/10; SDD
   * `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.2-f, G11). SUBSTITUI "a
   * trava manual vence o volume": a keyword que carrega o Assunto com Volume
   * validado > 0 fica travada mesmo com "Livre" gravado à mão. Sem volume, a trava
   * gravada decide (como antes).
   */
  if (carriedByKeyword && hasLockingVolume(input.volume)) { state = "locked"; origin = "volume"; }
  else if (plan!.lock) { state = plan!.lock; origin = "manual"; }
  else if (carriedByKeyword) { state = "free"; origin = "volume"; }
  else { state = "locked"; origin = "declared"; }
  const label = state === "locked"
    ? `Travada · ${DECLARED_PLAN_LOCK_ORIGIN_LABELS[origin]}`
    : `Livre · ${origin === "manual" ? DECLARED_PLAN_LOCK_ORIGIN_LABELS.manual : "sem volume medido"}`;
  return { state, origin, keywordId: principal.keywordId, phrase: principal.phrase, carriedByKeyword, label };
}

/** A principal FIXA do plano: só quando travada. Livre (ou sem principal) = `null`. */
export function lockedDeclaredPrincipal(lock: DeclaredPrincipalLockView | null | undefined): { keywordId: string; phrase: string } | null {
  return lock && lock.state === "locked" ? { keywordId: lock.keywordId, phrase: lock.phrase } : null;
}

/** A marca recíproca, gravada em `keyword_declared_principal` da principal. */
export const DeclaredPrincipalMarkSchema = z.object({
  subjectKeywordId: z.string().min(1),
  groupId: z.string().regex(UUID),
  planVersion: z.number().int().positive(),
}).strict();
export type DeclaredPrincipalMark = z.infer<typeof DeclaredPrincipalMarkSchema>;

/** O Silo planejado, gravado em `editorial_groups.plan` (fora do hash do pacote). */
export const DeclaredSiloPlanSchema = z.object({
  siloName: z.string().trim().min(1).max(DECLARED_PLAN_SILO_NAME_MAX),
  /** Sem barras: "planos-de-internet". `null` quando o texto não trouxe slug. */
  siloSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
  objective: z.string().trim().max(DECLARED_PLAN_OBJECTIVE_MAX).nullable(),
  articleCount: z.number().int().min(1).max(DECLARED_PLAN_ARTICLES_MAX),
}).strict();
export type DeclaredSiloPlan = z.infer<typeof DeclaredSiloPlanSchema>;

/** Leitura defensiva: valor malformado não vira plano (e nunca derruba a leitura do Assunto). */
export function readDeclaredArticlePlan(value: unknown): DeclaredArticlePlan | null {
  if (value === null || value === undefined) return null;
  const parsed = DeclaredArticlePlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readDeclaredPrincipalMark(value: unknown): DeclaredPrincipalMark | null {
  if (value === null || value === undefined) return null;
  const parsed = DeclaredPrincipalMarkSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readDeclaredSiloPlan(value: unknown): DeclaredSiloPlan | null {
  if (value === null || value === undefined) return null;
  const parsed = DeclaredSiloPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function sameDeclaredArticlePlan(left: DeclaredArticlePlan | null, right: DeclaredArticlePlan | null): boolean {
  if (!left || !right) return !left && !right;
  return left.groupId === right.groupId && left.planVersion === right.planVersion && sameDeclaredArticleContent(left, right);
}

/**
 * O mesmo artigo do plano, sem olhar a versão: ordem, papel, escopo, principal e
 * trava. É o que o cadastro usa para não regravar (nem mandar de volta a "Em
 * revisão") a linha que não mudou ao acrescentar artigos num Silo existente.
 */
export function sameDeclaredArticleContent(left: Omit<DeclaredArticlePlan, "groupId" | "planVersion">, right: Omit<DeclaredArticlePlan, "groupId" | "planVersion">): boolean {
  return left.order === right.order && left.role === right.role && left.scope === right.scope
    && (left.declaredPrincipal?.keywordId ?? null) === (right.declaredPrincipal?.keywordId ?? null)
    && (left.declaredPrincipal?.phrase ?? null) === (right.declaredPrincipal?.phrase ?? null)
    && (left.lock ?? null) === (right.lock ?? null)
    && (left.slug ?? null) === (right.slug ?? null);
}

/* ------------------------------------------------------------- o texto colado */

export type ParsedPlanArticle = {
  order: number;
  /** A frase do Assunto (o título do artigo). */
  subject: string;
  /** A principal declarada, limpa do rótulo. `null` quando a linha não veio. */
  principal: string | null;
  role: DeclaredPlanRole;
  /** A descrição numa linha só (as linhas coladas são unidas com espaço). */
  scope: string;
  /** Linha do título no texto (1-based), para a prévia apontar. */
  line: number;
  /** 2026-10-13 · a trava escolhida ("Trava: travada|livre|automática"); ausente = automática. */
  lock?: DeclaredPlanLockChoice;
  /**
   * 2026-10-16 · O SLUG DO ARTIGO. `rawSlug` é como veio ("/planos-de-internet/x/",
   * "https://site.com/planos-de-internet/x/" ou "x"); `slug` é o último segmento
   * normalizado (`null` = veio inválido, e a prévia recusa com o motivo);
   * `slugPath` é o caminho inteiro normalizado ("planos-de-internet/x"), para
   * conferir com o slug do Silo. `rawSlug` AUSENTE = o texto não trouxe slug (o
   * gravado fica); `null` = tirar o slug (o card manda quando o campo foi limpo).
   */
  rawSlug?: string | null;
  slug?: string | null;
  slugPath?: string | null;
};

/**
 * 2026-10-16 · o formato que o leitor reconheceu: `lista` (artigos numerados,
 * "1. Título"), `blocos` (blocos separados por linha em branco com o papel na
 * 1ª linha: "Silo", "Pilar", "Suporte"), `tabela` (markdown com "|"),
 * `planilha` (colada com TAB) ou `csv` (com cabeçalho).
 */
export type DeclaredPlanTextFormat = "lista" | "blocos" | "tabela" | "planilha" | "csv";

export type DeclaredPlanRefusalCode =
  | "NO_ARTICLES"
  | "TOO_MANY_ARTICLES"
  | "SILO_NAME_MISSING"
  | "SILO_SLUG_INVALID"
  | "PILLAR_MISSING"
  | "PILLAR_REPEATED"
  | "ORDER_REPEATED"
  | "SUBJECT_REPEATED"
  | "PRINCIPAL_REPEATED"
  | "SCOPE_MISSING"
  | "SCOPE_TOO_LONG"
  | "OBJECTIVE_TOO_LONG"
  | "TITLE_TOO_LONG"
  | "ORDER_OUT_OF_RANGE"
  /** 2026-10-16 · o slug do artigo não forma um endereço válido. */
  | "ARTICLE_SLUG_INVALID"
  /** 2026-10-16 · dois artigos com o mesmo slug (ou o slug do próprio Silo). */
  | "ARTICLE_SLUG_REPEATED"
  /**
   * 2026-10-16 · o texto traz mais de um Silo e nenhum foi escolhido (`siloName`):
   * um Silo por cadastro. A mensagem lista os Silos com a contagem; o leitor
   * agrupa os artigos por Silo e devolve a lista em `silos`.
   */
  | "SILO_REPEATED"
  /** 2026-10-16 · o Silo escolhido (`siloName`) não está no texto. */
  | "SILO_NOT_IN_TEXT";

export type DeclaredPlanRefusal = { code: DeclaredPlanRefusalCode; message: string; order?: number };

/** 2026-10-16 · um Silo do texto colado (o arquivo pode trazer vários): para a escolha do card e a recusa do MCP. */
export type DeclaredPlanTextSilo = {
  name: string | null;
  slug: string | null;
  rawSlug: string | null;
  /** O slug veio do começo comum dos slugs dos artigos (o texto não trouxe o do Silo). */
  slugDerived: boolean;
  articleCount: number;
  pillarCount: number;
};

export type ParsedDeclaredPlan = {
  silo: {
    /** "Silo 1 — Planos de internet, preços e contratação" sem o prefixo. */
    heading: string | null;
    name: string | null;
    /** Já normalizado, sem barras; `null` sem slug ou com slug inválido. */
    slug: string | null;
    /** Como veio no texto, para a prévia mostrar. */
    rawSlug: string | null;
    objective: string | null;
    /** 2026-10-16 · o slug saiu do começo comum dos slugs dos artigos (o texto não trouxe o do Silo). */
    slugDerived?: boolean;
  };
  articles: ParsedPlanArticle[];
  /** O que o parser não entendeu: aparece na prévia, nunca é adivinhado. */
  unparsed: Array<{ line: number; text: string; reason: string }>;
  refusals: DeclaredPlanRefusal[];
  notices: string[];
  /** 2026-10-16 · o formato reconhecido no texto colado (ausente no plano estruturado). */
  format?: DeclaredPlanTextFormat;
  /** 2026-10-16 · só quando o texto traz MAIS DE UM Silo: todos, na ordem do texto, com a contagem. */
  silos?: DeclaredPlanTextSilo[];
  /** 2026-10-16 · o Silo escolhido entre os do texto (`siloName`), quando havia mais de um. */
  chosenSilo?: string | null;
  /** 2026-10-16 · as colunas do cabeçalho (tabela, planilha, CSV) que o plano não usa: uma linha informativa, nunca recusa. */
  ignoredColumns?: string[];
};

/** 2026-10-16 · a escolha do Silo quando o texto traz vários (o nome, como o card e o MCP mostram). */
export type DeclaredPlanTextOptions = { siloName?: string | null };

/** Rótulos que o dono costuma colar junto da frase. Nunca viram keyword. */
export const DECLARED_PLAN_PASTED_LABELS = ["palavra-chave", "palavra chave", "keyword principal", "keyword", "principal", "assunto", "artigo pilar", "pilar", "nome", "slug", "objetivo", "descrição", "descricao", "papel"] as const;

const LABEL_PREFIX = /^\s*(?:palavra[\s-]?chave|keyword(?:\s+principal)?|principal|assunto)\s*[:：]\s*/i;
const SILO_HEADING = /^\s*silo\s*\d*\s*[—–\-:|]\s*(.+?)\s*$/i;
/** 2026-10-16 · "Silo 2 — Nome": com o número, abre o Silo seguinte mesmo colado no fim do artigo anterior. */
const SILO_NUMBERED_HEADING = /^\s*silo\s*\d+\s*[—–\-:|]\s*\S/i;
const NAME_LINE = /^\s*nome(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;
const SLUG_LINE = /^\s*slug(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;
const OBJECTIVE_LINE = /^\s*objetivo(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;
const ARTICLE_START = /^\s*(?:artigo\s*)?(\d{1,2})\s*(?:[.)ºª:]|\s[—–-])\s*(.+?)\s*$/i;
/** "Artigo pilar • Palavra-chave: X", "Pilar | Palavra-chave: X", "Palavra-chave: X". */
const PRINCIPAL_LINE = /^\s*(?:(.*?)\s*[•·|\-–—]\s*)?(?:palavra[\s-]?chave|keyword(?:\s+principal)?|principal)\s*[:：]\s*(.+?)\s*$/i;
const ROLE_ONLY_LINE = /^\s*(?:papel\s*[:：]\s*)?(?:artigo\s+(?:de\s+)?)?(pilar|suporte)\s*\.?\s*$/i;
const ROLE_LINE = /^\s*papel\s*[:：]\s*(?:artigo\s+(?:de\s+)?)?(pilar|suporte)\b/i;
/** 2026-10-13 · "Trava: travada", "Trava: livre", "Trava: automática". */
const LOCK_LINE = /^\s*trava\s*[:：]\s*(travad[ao]|livre|autom[aá]tic[ao])\s*\.?\s*$/i;

/*
 * 2026-10-16 · O LEITOR TOLERANTE (pedido do dono: "ele tem que poder reconhecer
 * todo tipo de organização desses dados"). Os rótulos e as formas abaixo são do
 * MESMO leitor (`parseDeclaredPlanText`): blocos com o papel na 1ª linha, linhas
 * sem rótulo classificadas pela forma, planilha (TAB), CSV e tabela com cabeçalho.
 */
/** "Pilar", "Suporte", "Artigo pilar", "Artigo de suporte" (qualquer caixa), sozinho ou com o resto depois de ":"/"—"/"|". */
const ROLE_BLOCK_LINE = /^\s*(?:artigo\s+(?:de\s+)?)?(pilar|suporte)(?:\s*#?\s*\d{1,2})?\s*(?:[:：—–|-]\s*(.*?))?\s*\.?\s*$/i;
/** "Silo", "Silo:", "Silo 2" sozinho na linha: abre o bloco do Silo. */
const SILO_BLOCK_LINE = /^\s*silo\s*\d{0,2}\s*[.:：]?\s*$/i;
/** "Artigo 3" ou "3." sozinho na linha: artigo numerado sem o título na mesma linha. */
const ARTICLE_NUMBER_ONLY = /^\s*(?:artigo\s*(\d{1,2})\s*[.)ºª:]?|(\d{1,2})\s*[.)ºª:])\s*$/i;
const TITLE_LINE = /^\s*(?:t[íi]tulo|assunto|tema|h1)(?:\s+do\s+artigo)?\s*[:：]\s*(.+?)\s*$/i;
const ARTICLE_SLUG_LINE = /^\s*(?:slug|url|canonical|can[ôo]nica|endere[çc]o|caminho|link)(?:\s+do\s+artigo)?\s*[:：]\s*(.+?)\s*$/i;
const SCOPE_LINE = /^\s*(?:descri[çc][ãa]o|detalhes?|escopo|resumo|objetivo(?:\s+do\s+artigo)?)\s*[:：]\s*(.+?)\s*$/i;
const ORDER_LINE = /^\s*(?:ordem|posi[çc][ãa]o)\s*[:：]\s*(\d{1,2})\s*\.?\s*$/i;
/** No bloco do Silo: o nome vem de "Keyword:", "Nome:", "Silo:", "Título:"… */
const SILO_NAME_LINE = /^\s*(?:nome(?:\s+do\s+silo)?|silo|keyword(?:\s+do\s+silo)?|palavra[\s-]?chave(?:\s+do\s+silo)?|t[íi]tulo|assunto)\s*[:：]\s*(.+?)\s*$/i;
const SILO_SLUG_LINE = /^\s*(?:slug|url|canonical|endere[çc]o|caminho)(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;
const SILO_OBJECTIVE_LINE = /^\s*(?:objetivo|descri[çc][ãa]o|detalhes?|escopo)(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;

/** "travada" → locked; "livre" → free; "automática" → auto. Outro texto = `null`. */
export function readDeclaredPlanLockChoice(value: unknown): DeclaredPlanLockChoice | null {
  const texto = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^(travad[ao]|locked)$/.test(texto)) return "locked";
  if (/^(livre|free)$/.test(texto)) return "free";
  if (/^(autom[aá]tic[ao]|auto)$/.test(texto)) return "auto";
  return null;
}

/** Tira o rótulo colado ("Palavra-chave: x" → "x"), aspas e pontuação final solta. */
export function cleanDeclaredPhrase(value: string): string {
  let out = value.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3 && LABEL_PREFIX.test(out); i += 1) out = out.replace(LABEL_PREFIX, "").trim();
  out = out.replace(/[.;,]+$/, "").trim();
  out = out.replace(/^["“”'‘’«»]+|["“”'‘’«»]+$/g, "").trim();
  return out.replace(/[.;,]+$/, "").trim();
}

/** "/planos-de-internet/" → "planos-de-internet"; inválido → `null`. Mesma regra do slug manual da SiloPage. */
export function normalizeDeclaredSiloSlug(raw: string | null | undefined): string | null {
  const input = (raw || "").trim();
  if (!input || /^https?:\/\//i.test(input)) return null;
  const body = input
    .replace(/^\/+|\/+$/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body) ? body : null;
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{2,}/.test(line) && /^[\s|:\-]+$/.test(line);
}

/**
 * 2026-10-16 · O SLUG DO ARTIGO: "/planos-de-internet/x/",
 * "https://site.com/planos-de-internet/x/", "site.com/planos-de-internet/x" ou
 * "x" → `{ slug: "x", path: "planos-de-internet/x" }`. Cada segmento passa pela
 * MESMA regra do slug do Silo (`normalizeDeclaredSiloSlug`); segmento que não
 * forma slug, ou endereço sem caminho, → `null` (a prévia recusa com o motivo).
 */
export function normalizeDeclaredArticleSlug(raw: string | null | undefined): { slug: string; path: string } | null {
  let input = (raw || "").trim();
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) {
    try {
      input = new URL(input).pathname;
    } catch {
      return null;
    }
  } else if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i.test(input)) {
    input = input.slice(input.indexOf("/"));
  }
  input = input.replace(/[?#].*$/, "");
  try {
    input = decodeURIComponent(input);
  } catch {
    // Fica como veio: a normalização abaixo decide.
  }
  const brutos = input.split("/").map(segmento => segmento.trim()).filter(Boolean);
  if (!brutos.length) return null;
  const segmentos: string[] = [];
  for (const bruto of brutos) {
    const segmento = normalizeDeclaredSiloSlug(bruto);
    if (!segmento || segmento.length > DECLARED_PLAN_ARTICLE_SLUG_MAX) return null;
    segmentos.push(segmento);
  }
  return { slug: segmentos[segmentos.length - 1], path: segmentos.join("/") };
}

/* ------------------------------------------ o leitor tolerante (2026-10-16) */

/** Espaço inquebrável (colado de planilha/Docs) e TAB, sem escape no fonte. */
const NBSP = new RegExp(String.fromCharCode(160), "g");
/** 2026-10-16 · a marca de ordem de bytes (BOM) que o Excel põe no começo do CSV em UTF-8. */
const BOM = new RegExp(String.fromCharCode(0xfeff), "g");
const TAB = String.fromCharCode(9);
const QUEBRA = String.fromCharCode(10);
const ASPAS = '"';
const PONTUACAO = /[.,;:!?()[\]{}"“”«»]/;
const semDecimais = (texto: string) => texto.replace(/(\d)[.,](\d)/g, "$1$2");

/** A forma do endereço: caminho com barra ou URL, sem espaço ("/silo/artigo/", "https://site.com/silo/artigo/"). */
export function isDeclaredPlanAddressLine(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t) || t.startsWith("/")) return true;
  return /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i.test(t) || /^[a-z0-9-]+(?:\/[a-z0-9-]+)+\/?$/i.test(t);
}

/** A forma da keyword: frase curta, toda em minúsculas, sem pontuação ("internet residencial barata"). */
export function isKeywordShapedLine(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || t.length > 100 || isDeclaredPlanAddressLine(t)) return false;
  if (t !== t.toLocaleLowerCase("pt-BR")) return false;
  if (PONTUACAO.test(semDecimais(t))) return false;
  return t.split(/\s+/).length <= 12;
}

/** A forma frouxa ("Wi-Fi lento"): só vale logo depois do título e com mais linhas no bloco. */
function isLooseKeywordLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 80 || isDeclaredPlanAddressLine(t)) return false;
  if (PONTUACAO.test(semDecimais(t))) return false;
  return t.split(/\s+/).length <= 8;
}

/** A forma do título: pergunta ("?") ou "Algo: o resto". */
function isTitleShapedLine(text: string): boolean {
  return /\?/.test(text) || /\S\s*[:：]\s+\S/.test(text);
}

type PlanBodyLine = { line: number; text: string; kind: "loose" | "scope" };

type PlanSilo = ParsedDeclaredPlan["silo"];

/** Um artigo em leitura (de qualquer formato), antes de virar `ParsedPlanArticle`. */
type PlanDraft = {
  /** 2026-10-16 · o Silo do artigo (o corrente quando o artigo começou): o texto pode trazer vários. */
  silo: PlanSilo;
  /** `null` = sem número: a ordem é a sequência. */
  order: number | null;
  subject: string | null;
  principal: string | null;
  pillar: boolean;
  /** O papel veio escrito (bloco "Pilar"/"Suporte", "Papel:", célula). */
  roleStated: boolean;
  rawSlug: string | null;
  lock?: DeclaredPlanLockChoice;
  line: number;
  /** As linhas do artigo: com rótulo de descrição (`scope`) ou sem rótulo (`loose`, classificadas pela forma no fim). */
  body: PlanBodyLine[];
  origin: DeclaredPlanTextFormat;
};

type PlanReading = {
  /** O Silo CORRENTE: o artigo que começa agora é dele. */
  silo: PlanSilo;
  /** 2026-10-16 · todos os Silos do texto, na ordem em que aparecem (o 1º é o do cabeçalho de sempre). */
  silos: PlanSilo[];
  drafts: PlanDraft[];
  unparsed: ParsedDeclaredPlan["unparsed"];
  refusals: DeclaredPlanRefusal[];
  notices: string[];
  siloBlocks: number;
  /** 2026-10-16 · colunas do cabeçalho que o plano não usa (ditas numa linha só). */
  ignoredColumns: string[];
};

const siloVazio = (): PlanSilo => ({ heading: null, name: null, slug: null, rawSlug: null, objective: null });

/** 2026-10-16 · outro Silo começa no texto: os artigos daqui para baixo são dele. */
function abrirNovoSilo(leitura: PlanReading): PlanSilo {
  const novo = siloVazio();
  leitura.silos.push(novo);
  leitura.silo = novo;
  return novo;
}

const siloTemArtigos = (leitura: PlanReading, silo: PlanSilo) => leitura.drafts.some(draft => draft.silo === silo);

const novoRascunho = (leitura: PlanReading, input: Pick<PlanDraft, "line" | "origin"> & Partial<PlanDraft>): PlanDraft => ({
  silo: leitura.silo, order: null, subject: null, principal: null, pillar: false, roleStated: false, rawSlug: null, body: [], ...input,
});

const rotuloDoRascunho = (draft: PlanDraft) => draft.order !== null ? `O artigo ${draft.order}` : `O bloco da linha ${draft.line}`;

/* ----------------------------------- as colunas (tabela, planilha e CSV) */

type PlanColumn = "order" | "role" | "subject" | "principal" | "slug" | "scope" | "lock" | "silo" | "siloSlug";
type PlanColumns = Partial<Record<PlanColumn, number>>;

/** Os nomes de coluna aceitos (sem acento, minúsculos), em qualquer ordem. */
const PLAN_COLUMN_ALIASES: Record<PlanColumn, readonly string[]> = {
  order: ["#", "n", "no", "nº", "n°", "num", "numero", "ordem", "posicao", "pos"],
  role: ["papel", "tipo", "funcao", "papel no silo", "tipo de artigo"],
  subject: ["assunto", "titulo", "title", "assunto (titulo)", "titulo (assunto)", "titulo do artigo", "titulo do post", "tema", "h1", "artigo", "pauta"],
  principal: ["keyword", "palavra-chave", "palavra chave", "keyword principal", "palavra-chave principal", "palavra chave principal", "principal", "kw", "keyword alvo", "palavra-chave alvo"],
  slug: ["slug", "url", "canonical", "canonica", "endereco", "caminho", "link", "slug/url", "url/slug", "slug do artigo"],
  scope: ["descricao", "detalhes", "detalhe", "escopo", "description", "resumo", "observacoes", "descricao/detalhes"],
  lock: ["trava"],
  silo: ["silo", "nome do silo"],
  siloSlug: ["slug do silo"],
};

/*
 * 2026-10-16 · O CABEÇALHO POR SINÔNIMO E POR TOKEN (pedido do dono: "pode
 * reconhecer este tipo de CSV também, reconhecer os campos e preencher"): os
 * nomes de planilha de planejamento — "numero", "silo", "hierarquia",
 * "titulo_h1_sugerido", "keyword_hipotese_a_validar", "slug_proposto",
 * "intencao_exclusiva" —, em qualquer ordem, com "_", acento e caixa. A 1ª
 * regra que casa decide; a coluna que o plano não usa (fora do escopo, CTA,
 * página comercial, links, ou desconhecida) vai para `ignoredColumns`, dita
 * numa linha só — nunca some calada, nunca é recusa.
 */
const PLAN_COLUMN_TOKENS: ReadonlyArray<readonly [PlanColumn | null, RegExp]> = [
  // O que o plano não usa (antes de "escopo", "keyword" e "link", que estão dentro destes nomes).
  [null, /\bfora do escopo\b|\bnao (?:abordar|cobrir)\b|\bcta\b|\bchamada\b|\bpagina comercial\b|\bpagina de destino\b|\blinks\b|\bdirecionais\b/],
  [null, /\b(?:keywords?|palavras?[- ]chave) (?:secundaria|secundarias|de apoio|relacionada|relacionadas|lsi|de reforco|de suporte|de sustentacao)\b/],
  ["siloSlug", /\b(?:slug|url|endereco|caminho) do silo\b/],
  ["silo", /\bsilo\b|\bcluster\b/],
  ["order", /^(?:numero|ordem|posicao)(?: (?:do|da|de|no|na) (?:artigo|silo|plano|post|pauta))?$/],
  ["role", /\b(?:hierarquia|papel|role|funcao)\b|^tipo de (?:artigo|pagina)$/],
  ["principal", /\b(?:keyword|kw|palavra-chave|palavra chave|principal)\b/],
  ["subject", /\b(?:titulo|title|h1|assunto|tema|pauta|headline)\b/],
  ["slug", /\b(?:slug|url|canonical|canonica|endereco|caminho|link)\b/],
  ["scope", /\b(?:intencao|escopo|detalhes?|descricao|description|resumo|briefing)\b|\bobservac/],
  ["lock", /\btrava\b/],
];

const chaveDeCabecalho = (cell: string) => normalizeDeclaredPhraseKey(String(cell || "").replace(BOM, "").replace(/[*`]/g, "").replace(/_+/g, " ")).replace(/[:：]$/, "").trim();

/** A coluna de um nome de cabeçalho: o nome exato de sempre (com ou sem parênteses), senão pelo token. `null` = o plano não usa. */
function colunaDoCabecalho(chave: string): PlanColumn | null {
  const semParenteses = chave.replace(/\s*\(.*\)\s*$/, "").trim();
  for (const [coluna, nomes] of Object.entries(PLAN_COLUMN_ALIASES) as Array<[PlanColumn, readonly string[]]>) {
    if (nomes.includes(chave) || nomes.includes(semParenteses)) return coluna;
  }
  for (const [coluna, regra] of PLAN_COLUMN_TOKENS) if (regra.test(chave)) return coluna;
  return null;
}

type PlanHeader = { colunas: PlanColumns; ignoradas: string[] };

/** A linha é cabeçalho quando ≥ 2 colunas são conhecidas e há o Assunto (ou a keyword com o papel). */
function planHeaderOf(cells: readonly string[]): PlanHeader | null {
  const colunas: PlanColumns = {};
  const ignoradas: string[] = [];
  cells.forEach((cell, index) => {
    const chave = chaveDeCabecalho(cell);
    if (!chave) return;
    const coluna = colunaDoCabecalho(chave);
    if (coluna && colunas[coluna] === undefined) {
      colunas[coluna] = index;
      return;
    }
    ignoradas.push(String(cell).replace(BOM, "").replace(NBSP, " ").trim());
  });
  const total = Object.keys(colunas).length;
  return total >= 2 && (colunas.subject !== undefined || (colunas.principal !== undefined && colunas.role !== undefined)) ? { colunas, ignoradas } : null;
}

function anotarColunasIgnoradas(leitura: PlanReading, ignoradas: readonly string[]) {
  for (const nome of ignoradas) if (nome && !leitura.ignoredColumns.includes(nome)) leitura.ignoredColumns.push(nome);
}

/** "Pilar"/"Artigo pilar" → true; "Suporte"/"Artigo de suporte" → false; outro texto → null. */
function roleOfCell(text: string): boolean | null {
  const papel = String(text || "").trim().match(ROLE_ONLY_LINE);
  return papel ? papel[1].toLowerCase() === "pilar" : null;
}

/**
 * O nome do Silo CORRENTE (bloco "Silo", "Nome:", cabeçalho "Silo N — …"). Um
 * segundo nome diferente no MESMO bloco não é usado (vai para "não entendidas");
 * outro Silo começa com outro bloco "Silo" ou outro "Silo N — …".
 */
function definirNomeDoSilo(leitura: PlanReading, nome: string, line: number) {
  const limpo = cleanDeclaredPhrase(nome);
  if (!limpo) return;
  if (!leitura.silo.name) {
    leitura.silo.name = limpo;
    return;
  }
  if (normalizeDeclaredPhraseKey(leitura.silo.name) !== normalizeDeclaredPhraseKey(limpo)) {
    leitura.unparsed.push({ line, text: limpo, reason: `O Silo já tem o nome "${leitura.silo.name}"; este segundo nome não foi usado (outro Silo começa com outro bloco “Silo” ou “Silo 2 — …”).` });
  }
}

/**
 * 2026-10-16 · A COLUNA "Silo" DA TABELA/PLANILHA/CSV: o artigo vai para o
 * Silo daquele nome (o arquivo pode trazer vários). O mesmo nome volta ao Silo
 * já visto; o Silo corrente sem nome ganha o nome; outro nome abre outro Silo.
 */
function escolherSiloPeloNome(leitura: PlanReading, nome: string): void {
  const limpo = cleanDeclaredPhrase(nome);
  if (!limpo) return;
  const chave = normalizeDeclaredPhraseKey(limpo);
  const visto = leitura.silos.find(silo => [silo.name, silo.heading].some(valor => valor && normalizeDeclaredPhraseKey(valor) === chave));
  if (visto) {
    leitura.silo = visto;
    return;
  }
  if (!leitura.silo.name) {
    leitura.silo.name = limpo;
    return;
  }
  abrirNovoSilo(leitura).name = limpo;
}

function definirSlugDoSilo(leitura: PlanReading, bruto: string, line: number) {
  const raw = String(bruto || "").trim();
  if (!raw) return;
  if (leitura.silo.rawSlug && normalizeDeclaredSiloSlug(raw) !== leitura.silo.slug) {
    leitura.unparsed.push({ line, text: raw, reason: `O Silo já tem o slug "${leitura.silo.rawSlug}"; este segundo não foi usado.` });
    return;
  }
  leitura.silo.rawSlug = raw;
  leitura.silo.slug = normalizeDeclaredSiloSlug(raw);
}

/** Uma linha de tabela/planilha/CSV com cabeçalho: cada célula pelo nome da coluna. */
function rascunhoDasColunas(cells: readonly string[], colunas: PlanColumns, line: number, origin: DeclaredPlanTextFormat, leitura: PlanReading): void {
  const celula = (coluna: PlanColumn) => {
    const indice = colunas[coluna];
    return indice === undefined ? "" : String(cells[indice] ?? "").replace(NBSP, " ").trim();
  };
  if (!cells.some(cell => String(cell ?? "").trim())) return;
  // 2026-10-16 · a coluna "Silo" diz de que Silo é a linha (o arquivo pode trazer vários).
  const nomeDoSilo = celula("silo");
  if (nomeDoSilo) escolherSiloPeloNome(leitura, nomeDoSilo);
  const slugDoSilo = celula("siloSlug");
  if (slugDoSilo) definirSlugDoSilo(leitura, slugDoSilo, line);
  const papel = celula("role");
  if (SILO_BLOCK_LINE.test(papel)) {
    // A linha do Silo na tabela: nome, slug e objetivo.
    const nome = celula("subject") || celula("principal");
    if (nome) escolherSiloPeloNome(leitura, nome);
    const slug = celula("slug");
    if (slug) definirSlugDoSilo(leitura, slug, line);
    const objetivo = celula("scope");
    if (objetivo) leitura.silo.objective = leitura.silo.objective ? `${leitura.silo.objective} ${objetivo}` : objetivo;
    return;
  }
  const draft = novoRascunho(leitura, { line, origin });
  const ordem = celula("order");
  if (/^\d{1,3}$/.test(ordem)) draft.order = Number(ordem);
  else if (ordem) leitura.notices.push(`Linha ${line}: a ordem "${ordem}" não é número; o artigo entra na sequência.`);
  if (papel) {
    const pilar = roleOfCell(papel);
    if (pilar === null) leitura.notices.push(`Linha ${line}: papel "${papel}" não reconhecido (use Pilar ou Suporte); o artigo entra como Suporte.`);
    else {
      draft.pillar = pilar;
      draft.roleStated = true;
    }
  }
  const assunto = celula("subject");
  if (assunto) draft.subject = assunto;
  const keyword = celula("principal");
  if (keyword) draft.principal = keyword;
  const slug = celula("slug");
  if (slug) draft.rawSlug = slug;
  const escopo = celula("scope");
  if (escopo) draft.body.push({ line, text: escopo, kind: "scope" });
  const trava = celula("lock");
  if (trava) {
    const escolha = readDeclaredPlanLockChoice(trava);
    if (escolha) draft.lock = escolha;
    else leitura.notices.push(`Linha ${line}: trava "${trava}" não reconhecida (travada, livre ou automática); fica a automática.`);
  }
  leitura.drafts.push(draft);
}

/** Uma linha de tabela/planilha SEM cabeçalho: cada célula pela forma, como as linhas de um bloco. */
function rascunhoPelaForma(cells: readonly string[], line: number, origin: DeclaredPlanTextFormat, leitura: PlanReading): void {
  const valores = cells.map(cell => String(cell ?? "").replace(NBSP, " ").trim()).filter(Boolean);
  if (!valores.length) return;
  if (valores.some(valor => SILO_BLOCK_LINE.test(valor))) {
    // 2026-10-16 · outra linha "Silo" depois de um Silo já começado abre o Silo seguinte.
    if (leitura.silo.name || leitura.silo.rawSlug || siloTemArtigos(leitura, leitura.silo)) abrirNovoSilo(leitura);
    for (const valor of valores.filter(item => !SILO_BLOCK_LINE.test(item))) {
      if (isDeclaredPlanAddressLine(valor)) definirSlugDoSilo(leitura, valor, line);
      else if (!leitura.silo.name) definirNomeDoSilo(leitura, valor, line);
      else leitura.silo.objective = leitura.silo.objective ? `${leitura.silo.objective} ${valor}` : valor;
    }
    return;
  }
  const draft = novoRascunho(leitura, { line, origin });
  valores.forEach((valor, indice) => {
    const pilar = roleOfCell(valor);
    if (pilar !== null && !draft.roleStated) {
      draft.pillar = pilar;
      draft.roleStated = true;
      return;
    }
    if (indice === 0 && /^\d{1,2}$/.test(valor)) {
      draft.order = Number(valor);
      return;
    }
    lerLinhaDoCorpo(draft, valor, line, leitura);
  });
  leitura.drafts.push(draft);
}

/** Uma linha dentro de um artigo: o rótulo manda; sem rótulo, fica para a forma decidir no fim. */
function lerLinhaDoCorpo(draft: PlanDraft, linha: string, line: number, leitura: PlanReading): void {
  const principal = linha.match(PRINCIPAL_LINE);
  if (principal) {
    if (draft.principal) {
      leitura.unparsed.push({ line, text: linha, reason: `${rotuloDoRascunho(draft)} já tem a principal "${draft.principal}"; esta segunda linha não foi usada.` });
      return;
    }
    draft.principal = cleanDeclaredPhrase(principal[2]) || null;
    if (principal[1] && /\bpilar\b/i.test(principal[1])) {
      draft.pillar = true;
      draft.roleStated = true;
    }
    return;
  }
  const trava = linha.match(LOCK_LINE);
  if (trava) {
    const escolha = readDeclaredPlanLockChoice(trava[1]);
    if (escolha) draft.lock = escolha;
    return;
  }
  const papel = linha.match(ROLE_LINE) || linha.match(ROLE_ONLY_LINE);
  if (papel) {
    if (papel[1].toLowerCase() === "pilar") draft.pillar = true;
    draft.roleStated = true;
    return;
  }
  const titulo = linha.match(TITLE_LINE);
  if (titulo) {
    if (draft.subject) leitura.unparsed.push({ line, text: linha, reason: `${rotuloDoRascunho(draft)} já tem o título "${draft.subject}"; esta segunda linha não foi usada.` });
    else draft.subject = cleanDeclaredPhrase(titulo[1]) || null;
    return;
  }
  const slug = linha.match(ARTICLE_SLUG_LINE);
  if (slug) {
    if (draft.rawSlug) leitura.unparsed.push({ line, text: linha, reason: `${rotuloDoRascunho(draft)} já tem o slug "${draft.rawSlug}"; esta segunda linha não foi usada.` });
    else draft.rawSlug = slug[1].trim();
    return;
  }
  const ordem = linha.match(ORDER_LINE);
  if (ordem) {
    const numero = Number(ordem[1]);
    if (draft.order !== null && draft.order !== numero) leitura.unparsed.push({ line, text: linha, reason: `${rotuloDoRascunho(draft)} já tem a ordem ${draft.order}; esta linha não foi usada.` });
    else draft.order = numero;
    return;
  }
  const escopo = linha.match(SCOPE_LINE);
  if (escopo) {
    draft.body.push({ line, text: escopo[1].trim(), kind: "scope" });
    return;
  }
  draft.body.push({ line, text: linha, kind: "loose" });
}

/**
 * As linhas SEM rótulo, pela forma (fim do artigo):
 *   - endereço ("/silo/artigo/", URL) = slug/canonical;
 *   - frase curta em minúsculas sem pontuação = keyword (a 1ª linha, quando a
 *     de baixo não é keyword; senão a linha logo depois do título);
 *   - a 1ª linha textual = Assunto/título;
 *   - o resto = detalhes.
 * Segundo endereço vai para "não entendidas", com o motivo.
 */
function resolverCorpo(draft: PlanDraft, leitura: PlanReading): string[] {
  const textuais: PlanBodyLine[] = [];
  for (const item of draft.body) {
    if (item.kind === "loose" && isDeclaredPlanAddressLine(item.text)) {
      if (!draft.rawSlug) draft.rawSlug = item.text.trim();
      else leitura.unparsed.push({ line: item.line, text: item.text, reason: `${rotuloDoRascunho(draft)} já tem o slug "${draft.rawSlug}"; este segundo endereço não foi usado.` });
      continue;
    }
    textuais.push(item);
  }
  const soltas = textuais.filter(item => item.kind === "loose");
  const usadas = new Set<PlanBodyLine>();
  const usar = (item: PlanBodyLine) => {
    usadas.add(item);
    return item.text;
  };
  if (!draft.subject && !draft.principal) {
    const [a, b] = soltas;
    if (a && b && isKeywordShapedLine(a.text) && !isKeywordShapedLine(b.text)) {
      draft.principal = usar(a);
      // Com só duas linhas, a de baixo só é título quando tem a forma dele; senão são os detalhes.
      if (soltas.length >= 3 || isTitleShapedLine(b.text)) draft.subject = usar(b);
    } else if (a) {
      draft.subject = usar(a);
    }
  } else if (!draft.subject && soltas[0]) {
    draft.subject = usar(soltas[0]);
  }
  if (!draft.principal) {
    const resto = soltas.filter(item => !usadas.has(item));
    const proxima = resto[0];
    if (proxima && (isKeywordShapedLine(proxima.text) || (resto.length >= 2 && isLooseKeywordLine(proxima.text)))) draft.principal = usar(proxima);
  }
  return textuais.filter(item => !usadas.has(item)).map(item => item.text);
}

/** Uma linha do bloco do Silo: "Keyword:"/"Nome:"/"Silo:" ou a 1ª linha = nome; "Slug:" ou endereço = slug; "Objetivo:"/"Descrição:" = objetivo. */
function lerLinhaDoSilo(linha: string, line: number, leitura: PlanReading, estado: { ultimoCampo: "objective" | null }): void {
  const nome = linha.match(SILO_NAME_LINE);
  if (nome) {
    definirNomeDoSilo(leitura, nome[1], line);
    estado.ultimoCampo = null;
    return;
  }
  const slug = linha.match(SILO_SLUG_LINE);
  if (slug) {
    definirSlugDoSilo(leitura, slug[1], line);
    estado.ultimoCampo = null;
    return;
  }
  const objetivo = linha.match(SILO_OBJECTIVE_LINE);
  if (objetivo) {
    leitura.silo.objective = leitura.silo.objective ? `${leitura.silo.objective} ${objetivo[1].trim()}` : objetivo[1].trim();
    estado.ultimoCampo = "objective";
    return;
  }
  if (isDeclaredPlanAddressLine(linha)) {
    definirSlugDoSilo(leitura, linha, line);
    estado.ultimoCampo = null;
    return;
  }
  if (estado.ultimoCampo === "objective" && leitura.silo.objective) {
    leitura.silo.objective = `${leitura.silo.objective} ${linha}`;
    return;
  }
  if (!leitura.silo.name && !leitura.silo.heading) {
    definirNomeDoSilo(leitura, linha, line);
    return;
  }
  leitura.unparsed.push({ line, text: linha, reason: "Linha do bloco do Silo sem rótulo depois do nome: para o objetivo, escreva “Objetivo: …”." });
}

/** O leitor de linhas: lista numerada, blocos com o papel na 1ª linha e tabela com "|". */
function lerLinhas(linhas: readonly string[], leitura: PlanReading, primeiraLinha: number): void {
  let atual: PlanDraft | null = null;
  let noSilo = false;
  let anteriorEmBranco = true;
  let papelPendente: boolean | null = null;
  let colunas: PlanColumns | null = null;
  const estado: { ultimoCampo: "objective" | null } = { ultimoCampo: null };
  const fechar = () => {
    if (atual) leitura.drafts.push(atual);
    atual = null;
  };
  const proximaNaoVazia = (indice: number): string | null => {
    for (let j = indice + 1; j < linhas.length; j += 1) {
      const texto = linhas[j].replace(NBSP, " ").trim();
      if (texto) return texto;
    }
    return null;
  };
  const abrirSilo = (_line: number, heading: string | null) => {
    fechar();
    papelPendente = null;
    // 2026-10-16 · outro Silo no mesmo texto: os artigos daqui para baixo são dele (antes era recusa).
    if (leitura.siloBlocks > 0 || siloTemArtigos(leitura, leitura.silo)) abrirNovoSilo(leitura);
    leitura.siloBlocks += 1;
    if (heading && !leitura.silo.heading) leitura.silo.heading = heading;
    noSilo = true;
    estado.ultimoCampo = null;
  };

  linhas.forEach((bruta, indice) => {
    const line = primeiraLinha + indice;
    const linha = bruta.replace(NBSP, " ").trim();
    if (!linha) {
      anteriorEmBranco = true;
      noSilo = false;
      return;
    }
    const inicioDeBloco = anteriorEmBranco;
    anteriorEmBranco = false;
    const corrente = atual as PlanDraft | null;

    // Tabela colada com "|": uma linha por artigo; o cabeçalho, quando vem, diz as colunas.
    if ((linha.match(/\|/g) || []).length >= 3) {
      if (isTableSeparator(linha)) return;
      const cells = linha.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
      const cabecalho = planHeaderOf(cells);
      fechar();
      noSilo = false;
      if (cabecalho) {
        colunas = cabecalho.colunas;
        anotarColunasIgnoradas(leitura, cabecalho.ignoradas);
        return;
      }
      const numerada = cells.length >= 4 && /^\d{1,2}$/.test(cells[0]);
      if (colunas && (colunas.subject !== undefined || !numerada)) {
        rascunhoDasColunas(cells, colunas, line, "tabela", leitura);
        return;
      }
      if (numerada) {
        const escopo = cells.slice(4).join(" ").trim();
        leitura.drafts.push(novoRascunho(leitura, {
          line,
          origin: "tabela",
          order: Number(cells[0]),
          subject: cleanDeclaredPhrase(cells[1] || "") || null,
          principal: cells[2] ? cleanDeclaredPhrase(cells[2]) || null : null,
          pillar: /\bpilar\b/i.test(cells[3] || ""),
          roleStated: Boolean((cells[3] || "").trim()),
          body: escopo ? [{ line, text: escopo, kind: "scope" }] : [],
        }));
        return;
      }
      if (cells.some(cell => roleOfCell(cell) !== null || SILO_BLOCK_LINE.test(cell))) {
        rascunhoPelaForma(cells, line, "tabela", leitura);
        return;
      }
      leitura.unparsed.push({ line, text: linha, reason: "Linha de tabela sem número de ordem, sem cabeçalho (Papel, Assunto, Keyword, Slug, Descrição) e sem o papel numa célula." });
      return;
    }

    // O cabeçalho do Silo: "Silo 2 — Nome", "Silo: Nome". Com o número, vale em qualquer ponto (abre o Silo seguinte).
    const heading = linha.match(SILO_HEADING);
    if (heading && (!corrente || inicioDeBloco || corrente.origin === "blocos" || SILO_NUMBERED_HEADING.test(linha)) && !PRINCIPAL_LINE.test(linha)) {
      if (noSilo && !leitura.silo.heading && !leitura.silo.name && !siloTemArtigos(leitura, leitura.silo)) {
        leitura.silo.heading = heading[1].trim();
        return;
      }
      abrirSilo(line, heading[1].trim());
      return;
    }

    // "Silo" sozinho na linha: o bloco do Silo.
    if (SILO_BLOCK_LINE.test(linha) && (!corrente || inicioDeBloco || corrente.origin === "blocos")) {
      abrirSilo(line, null);
      return;
    }

    // O artigo numerado: "1. Título", "Artigo 2: Título", "3 - Título", "Artigo 4".
    const inicio = linha.match(ARTICLE_START);
    const soNumero = inicio ? null : linha.match(ARTICLE_NUMBER_ONLY);
    if ((inicio || soNumero) && !(corrente && PRINCIPAL_LINE.test(linha))) {
      fechar();
      noSilo = false;
      estado.ultimoCampo = null;
      const numerado = novoRascunho(leitura, {
        line,
        origin: "lista",
        order: Number(inicio ? inicio[1] : (soNumero![1] ?? soNumero![2])),
        subject: inicio ? cleanDeclaredPhrase(inicio[2]) || null : null,
      });
      if (papelPendente !== null) {
        numerado.pillar = papelPendente;
        numerado.roleStated = true;
        papelPendente = null;
      }
      atual = numerado;
      return;
    }

    // O papel na 1ª linha do bloco: "Pilar", "Suporte", "Artigo de suporte", "Pilar: Título".
    const papel = linha.match(ROLE_BLOCK_LINE);
    if (papel && (!corrente || inicioDeBloco || (corrente.origin === "blocos" && corrente.roleStated)) && !(corrente && !inicioDeBloco && PRINCIPAL_LINE.test(linha))) {
      const pilar = papel[1].toLowerCase() === "pilar";
      const resto = (papel[2] || "").trim();
      noSilo = false;
      estado.ultimoCampo = null;
      // "1. Título", linha em branco e o papel: é o papel do artigo numerado que ainda não tem corpo.
      if (corrente && corrente.origin === "lista" && inicioDeBloco && !corrente.body.length && !corrente.principal && !corrente.roleStated) {
        corrente.pillar = pilar;
        corrente.roleStated = true;
        if (resto) lerLinhaDoCorpo(corrente, resto, line, leitura);
        return;
      }
      // "Pilar" e, na linha de baixo, "1. Título": o papel é do artigo numerado.
      if (!resto) {
        const proxima = proximaNaoVazia(indice);
        if (proxima && (ARTICLE_START.test(proxima) || ARTICLE_NUMBER_ONLY.test(proxima))) {
          fechar();
          papelPendente = pilar;
          return;
        }
      }
      fechar();
      const bloco = novoRascunho(leitura, { line, origin: "blocos", pillar: pilar, roleStated: true });
      atual = bloco;
      if (resto) lerLinhaDoCorpo(bloco, resto, line, leitura);
      return;
    }

    if (noSilo) {
      lerLinhaDoSilo(linha, line, leitura, estado);
      return;
    }

    if (!corrente) {
      // Antes do primeiro artigo: o cabeçalho de sempre (Nome, Slug, Objetivo).
      const nome = linha.match(NAME_LINE);
      if (nome) { leitura.silo.name = nome[1].trim(); estado.ultimoCampo = null; return; }
      const slug = linha.match(SLUG_LINE);
      if (slug) { leitura.silo.rawSlug = slug[1].trim(); leitura.silo.slug = normalizeDeclaredSiloSlug(slug[1]); estado.ultimoCampo = null; return; }
      const objetivo = linha.match(OBJECTIVE_LINE);
      if (objetivo) { leitura.silo.objective = objetivo[1].trim(); estado.ultimoCampo = "objective"; return; }
      if (estado.ultimoCampo === "objective" && leitura.silo.objective) { leitura.silo.objective = `${leitura.silo.objective} ${linha}`; return; }
      leitura.unparsed.push({ line, text: linha, reason: "Fora do formato do cabeçalho do Silo (Nome, Slug, Objetivo) e antes do primeiro artigo (“1. Título” ou o bloco “Pilar”/“Suporte”)." });
      return;
    }

    lerLinhaDoCorpo(corrente, linha, line, leitura);
  });
  fechar();
}

/**
 * Planilha (TAB) ou CSV: os registros, com aspas (célula com quebra de linha,
 * separador ou aspas dobradas dentro).
 */
function registrosDelimitados(texto: string, separador: string): Array<{ cells: string[]; line: number }> {
  const registros: Array<{ cells: string[]; line: number }> = [];
  let celulas: string[] = [];
  let celula = "";
  let aspas = false;
  let linha = 1;
  let inicio = 1;
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    if (aspas) {
      if (ch === ASPAS) {
        if (texto[i + 1] === ASPAS) {
          celula += ASPAS;
          i += 1;
        } else {
          aspas = false;
        }
        continue;
      }
      if (ch === QUEBRA) linha += 1;
      celula += ch;
      continue;
    }
    if (ch === ASPAS && !celula.trim()) {
      aspas = true;
      celula = "";
      continue;
    }
    if (ch === separador) {
      celulas.push(celula);
      celula = "";
      continue;
    }
    if (ch === QUEBRA) {
      celulas.push(celula);
      registros.push({ cells: celulas, line: inicio });
      celulas = [];
      celula = "";
      linha += 1;
      inicio = linha;
      continue;
    }
    celula += ch;
  }
  if (celula || celulas.length) {
    celulas.push(celula);
    registros.push({ cells: celulas, line: inicio });
  }
  return registros.filter(registro => registro.cells.some(cell => cell.trim()));
}

/**
 * Planilha colada (TAB) ou CSV com cabeçalho (Papel, Assunto/Título,
 * Keyword/Palavra-chave, Slug/URL, Descrição/Detalhes, Ordem — em qualquer
 * ordem). Planilha sem cabeçalho só com o papel numa célula (senão é lista de
 * keyword com métricas). `null` = não é tabela: o leitor de linhas segue.
 */
function lerPlanilha(linhas: readonly string[], leitura: PlanReading): DeclaredPlanTextFormat | null {
  const naoVazias = linhas.map((linha, indice) => ({ linha: linha.replace(NBSP, " "), indice })).filter(item => item.linha.trim());
  for (const { linha, indice } of naoVazias.slice(0, 8)) {
    const separador = linha.includes(TAB) ? TAB : [";", ","].find(sep => planHeaderOf(linha.split(sep)));
    if (!separador) continue;
    const cabecalho = planHeaderOf(linha.split(separador));
    if (!cabecalho) continue;
    const formato: DeclaredPlanTextFormat = separador === TAB ? "planilha" : "csv";
    if (indice > 0) lerLinhas(linhas.slice(0, indice), leitura, 1);
    anotarColunasIgnoradas(leitura, cabecalho.ignoradas);
    for (const registro of registrosDelimitados(linhas.slice(indice + 1).join(QUEBRA), separador)) {
      rascunhoDasColunas(registro.cells, cabecalho.colunas, indice + 1 + registro.line, formato, leitura);
    }
    return formato;
  }
  const comTab = naoVazias.filter(item => item.linha.includes(TAB));
  if (comTab.length && comTab.some(item => item.linha.split(TAB).some(cell => roleOfCell(cell) !== null || SILO_BLOCK_LINE.test(cell.trim())))) {
    const primeira = comTab[0].indice;
    if (primeira > 0) lerLinhas(linhas.slice(0, primeira), leitura, 1);
    for (const registro of registrosDelimitados(linhas.slice(primeira).join(QUEBRA), TAB)) {
      rascunhoPelaForma(registro.cells, primeira + registro.line, "planilha", leitura);
    }
    return "planilha";
  }
  return null;
}

/**
 * 2026-10-16 · O SLUG DO SILO PELO COMEÇO COMUM DOS ENDEREÇOS DOS ARTIGOS: sem
 * "Slug:" do Silo e com todos os artigos de slug no mesmo caminho
 * ("/planos-de-internet/x/", "/planos-de-internet/y/"), o Silo fica com
 * "/planos-de-internet/" — o trecho logo acima do artigo, a mesma conferência
 * de "fica dentro do slug do Silo". Caminhos diferentes = nada é derivado.
 */
function derivarSlugDoSilo(silo: PlanSilo, articles: readonly ParsedPlanArticle[]): boolean {
  if (silo.rawSlug) return false;
  const pais = articles.filter(article => article.slugPath).map(article => {
    const segmentos = article.slugPath!.split("/");
    return segmentos.length >= 2 ? segmentos[segmentos.length - 2] : null;
  });
  if (!pais.length || pais.some(pai => !pai) || new Set(pais).size !== 1) return false;
  const slug = normalizeDeclaredSiloSlug(pais[0]);
  if (!slug) return false;
  silo.rawSlug = `/${slug}/`;
  silo.slug = slug;
  silo.slugDerived = true;
  return true;
}

const resumoDoSilo = (item: { silo: PlanSilo; articles: readonly ParsedPlanArticle[] }) => `${item.silo.name || "Silo sem nome"} (${item.articles.length})`;

function fecharLeitura(leitura: PlanReading, planilha: DeclaredPlanTextFormat | null, opcoes: DeclaredPlanTextOptions): ParsedDeclaredPlan {
  const todos: ParsedPlanArticle[] = [];
  const porSilo = new Map<PlanSilo, ParsedPlanArticle[]>();
  const ultimaOrdem = new Map<PlanSilo, number>();
  for (const draft of leitura.drafts) {
    const partes = resolverCorpo(draft, leitura);
    if (!draft.subject && !draft.principal && !draft.rawSlug && !partes.length) {
      leitura.unparsed.push({ line: draft.line, text: draft.order !== null ? `${draft.order}.` : draft.pillar ? "Pilar" : "Suporte", reason: "Bloco sem título, keyword, slug nem detalhes: ficou de fora." });
      continue;
    }
    // Sem número, a ordem é a sequência (depois do anterior DO MESMO Silo).
    const order = draft.order ?? (ultimaOrdem.get(draft.silo) ?? 0) + 1;
    ultimaOrdem.set(draft.silo, order);
    const endereco = draft.rawSlug ? normalizeDeclaredArticleSlug(draft.rawSlug) : null;
    const article: ParsedPlanArticle = {
      order,
      subject: draft.subject ? cleanDeclaredPhrase(draft.subject) : "",
      principal: draft.principal ? cleanDeclaredPhrase(draft.principal) || null : null,
      role: draft.pillar ? "Pilar" : "Suporte",
      scope: partes.join(" ").replace(/\s+/g, " ").trim(),
      line: draft.line,
      ...(draft.lock ? { lock: draft.lock } : {}),
      ...(draft.rawSlug ? { rawSlug: draft.rawSlug, slug: endereco?.slug ?? null, slugPath: endereco?.path ?? null } : {}),
    };
    todos.push(article);
    porSilo.set(draft.silo, [...(porSilo.get(draft.silo) ?? []), article]);
  }
  for (const silo of leitura.silos) if (!silo.name && silo.heading) silo.name = silo.heading;
  // Os Silos do texto: os que têm artigo (o cabeçalho sem artigo não conta), ou o primeiro.
  const comArtigos = leitura.silos.filter(silo => porSilo.has(silo)).map(silo => ({ silo, articles: porSilo.get(silo)! }));
  const silos = comArtigos.length ? comArtigos : [{ silo: leitura.silos[0], articles: [] as ParsedPlanArticle[] }];
  const derivados = new Set(silos.filter(item => derivarSlugDoSilo(item.silo, item.articles)).map(item => item.silo));

  const extras: DeclaredPlanRefusal[] = [];
  const pedido = typeof opcoes.siloName === "string" ? opcoes.siloName.trim() : "";
  const chavePedida = normalizeDeclaredPhraseKey(cleanDeclaredPhrase(pedido));
  const casa = (silo: PlanSilo) => Boolean(chavePedida) && [silo.name, silo.heading].some(valor => valor && normalizeDeclaredPhraseKey(valor) === chavePedida);
  let escolhido = silos[0];
  let semEscolha = false;
  const lista = silos.map(resumoDoSilo).join(" · ");
  if (silos.length > 1) {
    const achado = silos.find(item => casa(item.silo));
    if (achado) escolhido = achado;
    else {
      semEscolha = true;
      extras.push(pedido
        ? { code: "SILO_NOT_IN_TEXT", message: `O Silo "${pedido}" não está no texto. O texto tem ${silos.length} Silos: ${lista} — escolha um deles.` }
        : { code: "SILO_REPEATED", message: `Este texto tem ${silos.length} Silos: ${lista} — escolha qual cadastrar agora (um Silo por cadastro).` });
    }
  } else if (pedido && escolhido.silo.name && !casa(escolhido.silo)) {
    extras.push({ code: "SILO_NOT_IN_TEXT", message: `O Silo "${pedido}" não está no texto: o texto traz só o Silo ${lista}.` });
  }

  const silo = escolhido.silo;
  // Sem escolha entre vários, os artigos vão todos (na ordem do texto) e só a recusa da escolha fala.
  const articles = semEscolha ? todos : escolhido.articles;
  const origens = new Set(leitura.drafts.map(draft => draft.origin));
  const format: DeclaredPlanTextFormat = planilha ?? (origens.has("blocos") ? "blocos" : origens.has("tabela") ? "tabela" : "lista");
  const { refusals, notices } = semEscolha ? { refusals: [] as DeclaredPlanRefusal[], notices: [] as string[] } : validateParsedDeclaredPlan({ silo, articles });
  const avisos = [...leitura.notices];
  if (!semEscolha && derivados.has(silo)) avisos.push(`O texto não trouxe o slug do Silo: ${silo.rawSlug} saiu do começo comum dos slugs dos artigos.`);
  if (leitura.ignoredColumns.length) avisos.push(`Colunas ignoradas: ${leitura.ignoredColumns.join(", ")}.`);
  return {
    silo,
    articles,
    unparsed: [...leitura.unparsed].sort((left, right) => left.line - right.line),
    refusals: [...leitura.refusals, ...extras, ...refusals],
    notices: [...avisos, ...notices],
    format,
    ...(silos.length > 1 ? {
      silos: silos.map(item => ({
        name: item.silo.name,
        slug: item.silo.slug,
        rawSlug: item.silo.rawSlug,
        slugDerived: derivados.has(item.silo),
        articleCount: item.articles.length,
        pillarCount: item.articles.filter(article => article.role === "Pilar").length,
      })),
      chosenSilo: semEscolha ? null : silo.name,
    } : {}),
    ...(leitura.ignoredColumns.length ? { ignoredColumns: [...leitura.ignoredColumns] } : {}),
  };
}

/**
 * Lê o plano que o dono cola — O LEITOR ÚNICO (card, detector, rota e MCP).
 * Aceita, sem perder nenhum formato anterior:
 *
 *   - LISTA: cabeçalho "Silo N — …", "Nome:", "Slug:", "Objetivo:", depois
 *     "1. Título", "Artigo pilar • Palavra-chave: x" ou "Palavra-chave: x" e a
 *     descrição; "Papel:", "Trava:"; e, desde 2026-10-16, numerado SEM
 *     "Palavra-chave:" (a keyword na linha de baixo, pela forma);
 *   - BLOCOS (2026-10-16): blocos separados por linha em branco, com o papel
 *     sozinho na 1ª linha ("Silo", "Pilar", "Suporte", "Artigo pilar",
 *     "Artigo de suporte", qualquer caixa); a ordem é a sequência dos blocos.
 *     No bloco do Silo, "Keyword:"/"Nome:"/"Silo:" ou a 1ª linha = nome,
 *     "Slug:" = slug, "Objetivo:"/"Descrição:" = objetivo. No bloco do
 *     artigo, o rótulo manda ("Título:", "Assunto:", "Keyword:",
 *     "Palavra-chave:", "Slug:", "URL:", "Canonical:", "Descrição:",
 *     "Detalhes:", "Escopo:", "Papel:", "Trava:", "Ordem:"); sem rótulo, a
 *     forma decide (endereço = slug; frase curta em minúsculas = keyword; a
 *     1ª linha = título; o resto = detalhes);
 *   - TABELA com "|" (`# | Assunto | Keyword principal | Papel | Descrição`,
 *     ou com cabeçalho em qualquer ordem, ou o papel numa célula);
 *   - PLANILHA colada (TAB) e CSV com cabeçalho (Papel, Assunto/Título,
 *     Keyword/Palavra-chave, Slug/URL, Descrição/Detalhes, Ordem), em
 *     qualquer ordem; sem coluna de ordem = sequência. Desde 2026-10-16 o
 *     cabeçalho é lido por sinônimo e por token (o CSV de planejamento:
 *     "numero", "silo", "hierarquia", "titulo_h1_sugerido",
 *     "keyword_hipotese_a_validar", "slug_proposto", "intencao_exclusiva"),
 *     com BOM, "_", acento e caixa; a coluna que o plano não usa vai para
 *     `ignoredColumns` (uma linha de aviso).
 *
 * 2026-10-16 · VÁRIOS SILOS NO MESMO TEXTO: os artigos são agrupados pelo
 * Silo (coluna "Silo", outro bloco "Silo" ou outro "Silo N — …"); `silos`
 * lista todos com a contagem. Sem `siloName`, a recusa SILO_REPEATED diz os
 * Silos e pede a escolha; com ele, o resultado é o daquele Silo (um cadastro =
 * um Silo, como sempre). Sem "Slug:" do Silo, o slug sai do começo comum dos
 * slugs dos artigos (`silo.slugDerived`).
 *
 * O que não entende vai para `unparsed`, com a linha e o motivo. Nada é adivinhado em silêncio.
 */
export function parseDeclaredPlanText(text: string, options: DeclaredPlanTextOptions = {}): ParsedDeclaredPlan {
  const primeiro = siloVazio();
  const leitura: PlanReading = {
    silo: primeiro,
    silos: [primeiro],
    drafts: [],
    unparsed: [],
    refusals: [],
    notices: [],
    siloBlocks: 0,
    ignoredColumns: [],
  };
  const linhas = String(text || "").replace(BOM, "").replace(/\r\n?/g, QUEBRA).split(QUEBRA);
  const planilha = lerPlanilha(linhas, leitura);
  if (!planilha) lerLinhas(linhas, leitura, 1);
  return fecharLeitura(leitura, planilha, options);
}

/* ------------------------------------- o arquivo .csv aberto no card (2026-10-16) */

export type DeclaredPlanFileEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252";

/** Os caracteres que o UTF-8 lido como Windows-1252 produz ("Ã§", "Ã£", "Ã©"…): o sinal do acento quebrado. */
const MOJIBAKE = new RegExp(`[${String.fromCharCode(0xc2)}${String.fromCharCode(0xc3)}][${String.fromCharCode(0x80)}-${String.fromCharCode(0xbf)}${String.fromCharCode(0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122)}]`);

/** O texto que foi UTF-8 lido como Windows-1252 e regravado: volta aos bytes e relê como UTF-8. `null` = não era isso. */
function desfazerMojibake(texto: string): string | null {
  if (!MOJIBAKE.test(texto)) return null;
  const especiais = new Map<string, number>();
  const tabela = new TextDecoder("windows-1252").decode(Uint8Array.from({ length: 32 }, (_, indice) => 0x80 + indice));
  for (let indice = 0; indice < tabela.length; indice += 1) especiais.set(tabela[indice], 0x80 + indice);
  const bytes: number[] = [];
  for (const caractere of texto) {
    const codigo = caractere.charCodeAt(0);
    if (codigo <= 0xff && !(codigo >= 0x80 && codigo <= 0x9f)) bytes.push(codigo);
    else if (especiais.has(caractere)) bytes.push(especiais.get(caractere)!);
    else return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

/**
 * 2026-10-16 · O .CSV ABERTO OU ARRASTADO NO CARD ("Colar plano em texto"):
 * os bytes viram o texto do MESMO campo, para o MESMO leitor. UTF-8 (com ou
 * sem BOM), UTF-16 com BOM e Windows-1252 (o "Salvar como CSV" do Excel em
 * português); o UTF-8 que já chegou com o acento quebrado ("Ã§") é desfeito.
 * Nada é gravado: só lê.
 */
export function decodeDeclaredPlanFile(input: ArrayBuffer | Uint8Array): { text: string; encoding: DeclaredPlanFileEncoding; repaired: boolean } {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const texto = new TextDecoder("utf-8").decode(bytes.subarray(3));
    const desfeito = desfazerMojibake(texto);
    return { text: desfeito ?? texto, encoding: "utf-8-bom", repaired: desfeito !== null };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le", repaired: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be", repaired: false };
  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const desfeito = desfazerMojibake(texto);
    return { text: desfeito ?? texto, encoding: "utf-8", repaired: desfeito !== null };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252", repaired: false };
  }
}

/** As recusas e os avisos do plano lido. Recusa = nada é gravado; aviso = a prévia fala. */
export function validateParsedDeclaredPlan(plan: Pick<ParsedDeclaredPlan, "silo" | "articles">): { refusals: DeclaredPlanRefusal[]; notices: string[] } {
  const refusals: DeclaredPlanRefusal[] = [];
  const notices: string[] = [];
  const { silo, articles } = plan;
  if (!articles.length) refusals.push({ code: "NO_ARTICLES", message: "Nenhum artigo encontrado. Cada artigo começa com o número (“1. Título”) ou com o papel numa linha própria (“Pilar”, “Suporte”)." });
  if (articles.length > DECLARED_PLAN_ARTICLES_MAX) refusals.push({ code: "TOO_MANY_ARTICLES", message: `O plano tem ${articles.length} artigos; o Silo aceita até ${DECLARED_PLAN_ARTICLES_MAX}.` });
  if (articles.length && articles.length < DECLARED_PLAN_ARTICLES_MIN_FOR_SILO) notices.push(`O plano tem ${articles.length} artigo(s): o Silo pede de ${DECLARED_PLAN_ARTICLES_MIN_FOR_SILO} a ${DECLARED_PLAN_ARTICLES_MAX} para fechar.`);
  if (!silo.name || !silo.name.trim()) refusals.push({ code: "SILO_NAME_MISSING", message: "Falta o nome do Silo (“Nome: …”, o cabeçalho “Silo 1 — …” ou o bloco “Silo” com “Keyword: …”)." });
  else if (silo.name.length > DECLARED_PLAN_SILO_NAME_MAX) refusals.push({ code: "SILO_NAME_MISSING", message: `O nome do Silo passa de ${DECLARED_PLAN_SILO_NAME_MAX} caracteres.` });
  if (silo.rawSlug && !silo.slug) refusals.push({ code: "SILO_SLUG_INVALID", message: `O slug "${silo.rawSlug}" não é válido: use só letras, números e hífen (ex.: /planos-de-internet/).` });
  if (!silo.rawSlug) notices.push("Sem “Slug:”: o Silo mantém o endereço que já tem (ou o Arquiteto propõe um).");
  if (silo.objective && silo.objective.length > DECLARED_PLAN_OBJECTIVE_MAX) refusals.push({ code: "OBJECTIVE_TOO_LONG", message: `O objetivo passa de ${DECLARED_PLAN_OBJECTIVE_MAX} caracteres.` });

  const pilares = articles.filter(article => article.role === "Pilar");
  if (articles.length && !pilares.length) refusals.push({ code: "PILLAR_MISSING", message: "Nenhum artigo marcado como Pilar. Escreva “Artigo pilar • Palavra-chave: …” (ou o bloco “Pilar”) no artigo que lidera o Silo." });
  if (pilares.length > 1) refusals.push({ code: "PILLAR_REPEATED", message: `${pilares.length} artigos marcados como Pilar (${pilares.map(article => article.order).join(", ")}): o Silo tem um Pilar só.` });

  const vistos = new Map<number, number>();
  for (const article of articles) vistos.set(article.order, (vistos.get(article.order) || 0) + 1);
  for (const [order, total] of vistos) if (total > 1) refusals.push({ code: "ORDER_REPEATED", message: `A ordem ${order} aparece ${total} vezes.`, order });
  const ordens = [...vistos.keys()].sort((a, b) => a - b);
  if (ordens.length && ordens.some((order, index) => order !== index + 1)) notices.push(`A numeração não é sequencial (${ordens.join(", ")}): a ordem do plano segue os números como estão.`);

  const assuntos = new Map<string, number[]>();
  const principais = new Map<string, number[]>();
  const slugs = new Map<string, number[]>();
  for (const article of articles) {
    const chaveAssunto = normalizeKeyword(article.subject);
    if (chaveAssunto) assuntos.set(chaveAssunto, [...(assuntos.get(chaveAssunto) || []), article.order]);
    if (article.principal) {
      const chave = normalizeKeyword(article.principal);
      if (chave) principais.set(chave, [...(principais.get(chave) || []), article.order]);
    } else {
      notices.push(`Artigo ${article.order} sem "Palavra-chave:": entra sem principal declarada e o Arquiteto escolhe pela regra de sempre.`);
    }
    if (article.subject.length > SUBJECT_ENTRY_TITLE_MAX) refusals.push({ code: "TITLE_TOO_LONG", message: `O título do artigo ${article.order} tem ${article.subject.length} caracteres; o limite é ${SUBJECT_ENTRY_TITLE_MAX}.`, order: article.order });
    if (!Number.isInteger(article.order) || article.order < 1 || article.order > DECLARED_PLAN_ARTICLES_MAX) refusals.push({ code: "ORDER_OUT_OF_RANGE", message: `A ordem ${article.order} está fora de 1 a ${DECLARED_PLAN_ARTICLES_MAX}.`, order: article.order });
    if (!article.scope) refusals.push({ code: "SCOPE_MISSING", message: `Artigo ${article.order} sem descrição: escreva o escopo na linha de baixo.`, order: article.order });
    else if (article.scope.length > DECLARED_PLAN_SCOPE_MAX) refusals.push({ code: "SCOPE_TOO_LONG", message: `A descrição do artigo ${article.order} tem ${article.scope.length} caracteres; o limite é ${DECLARED_PLAN_SCOPE_MAX}.`, order: article.order });
    // 2026-10-16 · o slug do artigo: válido, um por artigo, nunca o do Silo; fora do caminho do Silo = aviso.
    if (typeof article.rawSlug === "string" && article.rawSlug.trim() && !article.slug) {
      refusals.push({ code: "ARTICLE_SLUG_INVALID", message: `O slug do artigo ${article.order} ("${article.rawSlug}") não é válido: use letras, números e hífen (ex.: /planos-de-internet/como-escolher/).`, order: article.order });
    }
    if (article.slug) {
      slugs.set(article.slug, [...(slugs.get(article.slug) || []), article.order]);
      if (silo.slug && article.slug === silo.slug) refusals.push({ code: "ARTICLE_SLUG_REPEATED", message: `O slug do artigo ${article.order} (/${article.slug}/) é o do próprio Silo: cada artigo tem o seu endereço.`, order: article.order });
      const segmentos = article.slugPath ? article.slugPath.split("/") : [];
      const pai = segmentos.length >= 2 ? segmentos[segmentos.length - 2] : null;
      if (pai && silo.slug && pai !== silo.slug) notices.push(`O slug do artigo ${article.order} (/${article.slugPath}/) não fica dentro do slug do Silo (/${silo.slug}/): confira o endereço (vale o último trecho, "${article.slug}").`);
    }
  }
  for (const [, orders] of assuntos) if (orders.length > 1) refusals.push({ code: "SUBJECT_REPEATED", message: `O mesmo Assunto aparece nos artigos ${orders.join(", ")}.`, order: orders[0] });
  for (const [, orders] of principais) if (orders.length > 1) refusals.push({ code: "PRINCIPAL_REPEATED", message: `A mesma principal aparece nos artigos ${orders.join(", ")}: cada artigo tem a sua.`, order: orders[0] });
  for (const [slug, orders] of slugs) if (orders.length > 1) refusals.push({ code: "ARTICLE_SLUG_REPEATED", message: `O slug "${slug}" aparece nos artigos ${orders.join(", ")}: cada artigo tem o seu endereço.`, order: orders[0] });
  return { refusals, notices };
}

/* ------------------------------------------------------------------ sobras */

export type DeclaredPlanLeftoverReason = "silo_name" | "pasted_label";

/**
 * Uma keyword JÁ GRAVADA na marca que parece sobra de um import anterior do
 * plano: o nome do Silo colado como keyword ("Planos e contratação") ou uma
 * frase com o rótulo colado ("Palavra-chave: internet disponível no meu CEP").
 * A prévia mostra como "não faz parte do plano"; nada é apagado aqui (D9:
 * excluir é ato do dono — e, para keyword não publicada, apaga de vez).
 */
export function declaredPlanLeftoverReason(keyword: string, plan: Pick<ParsedDeclaredPlan, "silo">): DeclaredPlanLeftoverReason | null {
  const chave = normalizeKeyword(keyword);
  if (!chave) return null;
  const nomes = [plan.silo.name, plan.silo.heading].map(value => normalizeKeyword(value || "")).filter(Boolean);
  if (nomes.includes(chave)) return "silo_name";
  if (LABEL_PREFIX.test(keyword) || /^\s*(?:artigo\s+)?pilar\s*[•·|\-–—]/i.test(keyword) || NAME_LINE.test(keyword) || SLUG_LINE.test(keyword) || OBJECTIVE_LINE.test(keyword)) return "pasted_label";
  return null;
}

export const DECLARED_PLAN_LEFTOVER_LABELS: Record<DeclaredPlanLeftoverReason, string> = {
  silo_name: "Nome do Silo colado como keyword: não faz parte do plano.",
  pasted_label: "Rótulo colado junto da frase: não faz parte do plano.",
};

/** O Silo planejado, pronto para `editorial_groups.plan`. */
export function declaredSiloPlanOf(parsed: Pick<ParsedDeclaredPlan, "silo" | "articles">): DeclaredSiloPlan | null {
  const candidate = {
    siloName: (parsed.silo.name || "").trim(),
    siloSlug: parsed.silo.slug,
    objective: parsed.silo.objective ? parsed.silo.objective.trim() : null,
    articleCount: parsed.articles.length,
  };
  const ok = DeclaredSiloPlanSchema.safeParse(candidate);
  return ok.success ? ok.data : null;
}
