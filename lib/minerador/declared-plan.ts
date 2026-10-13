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
  if (plan!.lock) { state = plan!.lock; origin = "manual"; }
  else if (carriedByKeyword) { state = hasLockingVolume(input.volume) ? "locked" : "free"; origin = "volume"; }
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
    && (left.lock ?? null) === (right.lock ?? null);
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
};

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
  | "ORDER_OUT_OF_RANGE";

export type DeclaredPlanRefusal = { code: DeclaredPlanRefusalCode; message: string; order?: number };

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
  };
  articles: ParsedPlanArticle[];
  /** O que o parser não entendeu: aparece na prévia, nunca é adivinhado. */
  unparsed: Array<{ line: number; text: string; reason: string }>;
  refusals: DeclaredPlanRefusal[];
  notices: string[];
};

/** Rótulos que o dono costuma colar junto da frase. Nunca viram keyword. */
export const DECLARED_PLAN_PASTED_LABELS = ["palavra-chave", "palavra chave", "keyword principal", "keyword", "principal", "assunto", "artigo pilar", "pilar", "nome", "slug", "objetivo", "descrição", "descricao", "papel"] as const;

const LABEL_PREFIX = /^\s*(?:palavra[\s-]?chave|keyword(?:\s+principal)?|principal|assunto)\s*[:：]\s*/i;
const SILO_HEADING = /^\s*silo\s*\d*\s*[—–\-:|]\s*(.+?)\s*$/i;
const NAME_LINE = /^\s*nome(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;
const SLUG_LINE = /^\s*slug(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;
const OBJECTIVE_LINE = /^\s*objetivo(?:\s+do\s+silo)?\s*[:：]\s*(.+?)\s*$/i;
const ARTICLE_START = /^\s*(?:artigo\s*)?(\d{1,2})\s*(?:[.)ºª:]|\s[—–-])\s*(.+?)\s*$/i;
/** "Artigo pilar • Palavra-chave: X", "Pilar | Palavra-chave: X", "Palavra-chave: X". */
const PRINCIPAL_LINE = /^\s*(?:(.*?)\s*[•·|\-–—]\s*)?(?:palavra[\s-]?chave|keyword(?:\s+principal)?|principal)\s*[:：]\s*(.+?)\s*$/i;
const ROLE_ONLY_LINE = /^\s*(?:papel\s*[:：]\s*)?(?:artigo\s+)?(pilar|suporte)\s*\.?\s*$/i;
const ROLE_LINE = /^\s*papel\s*[:：]\s*(pilar|suporte)\b/i;
/** 2026-10-13 · "Trava: travada", "Trava: livre", "Trava: automática". */
const LOCK_LINE = /^\s*trava\s*[:：]\s*(travad[ao]|livre|autom[aá]tic[ao])\s*\.?\s*$/i;

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
 * Lê o plano que o dono cola. Aceita:
 *
 *   - o formato de lista (cabeçalho "Silo N — …", "Nome:", "Slug:", "Objetivo:",
 *     depois "1. Título", a linha "Artigo pilar • Palavra-chave: x" ou
 *     "Palavra-chave: x" e a descrição);
 *   - a tabela do §6.1 (`# | Assunto | Keyword principal | Papel | Descrição`).
 *
 * O que não entende vai para `unparsed`, com a linha. Nada é adivinhado.
 */
export function parseDeclaredPlanText(text: string): ParsedDeclaredPlan {
  const silo: ParsedDeclaredPlan["silo"] = { heading: null, name: null, slug: null, rawSlug: null, objective: null };
  const articles: ParsedPlanArticle[] = [];
  const unparsed: ParsedDeclaredPlan["unparsed"] = [];
  type Draft = { order: number; subject: string; principal: string | null; pillar: boolean; scope: string[]; line: number; lock?: DeclaredPlanLockChoice };
  let atual: Draft | null = null;
  let ultimoCampo: "objective" | null = null;
  const drafts: Draft[] = [];

  const fechar = () => { if (atual) drafts.push(atual); atual = null; };
  const linhas = String(text || "").replace(/\r\n?/g, "\n").split("\n");

  linhas.forEach((bruta, index) => {
    const line = index + 1;
    const linha = bruta.replace(/\u00a0/g, " ").trim();
    if (!linha) return;

    // Tabela colada: uma linha por artigo.
    if ((linha.match(/\|/g) || []).length >= 3) {
      if (isTableSeparator(linha)) return;
      const cells = linha.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
      if (cells.length >= 4 && /^\d{1,2}$/.test(cells[0])) {
        fechar();
        drafts.push({
          order: Number(cells[0]),
          subject: cleanDeclaredPhrase(cells[1] || ""),
          principal: cells[2] ? cleanDeclaredPhrase(cells[2]) || null : null,
          pillar: /\bpilar\b/i.test(cells[3] || ""),
          scope: cells.slice(4).join(" ").trim() ? [cells.slice(4).join(" ").trim()] : [],
          line,
        });
        return;
      }
      if (/assunto/i.test(linha) && /principal|palavra/i.test(linha)) return; // cabeçalho da tabela
      unparsed.push({ line, text: linha, reason: "Linha de tabela sem número de ordem na primeira coluna." });
      return;
    }

    const inicio = linha.match(ARTICLE_START);
    if (inicio && !(atual && PRINCIPAL_LINE.test(linha))) {
      fechar();
      ultimoCampo = null;
      atual = { order: Number(inicio[1]), subject: cleanDeclaredPhrase(inicio[2]), principal: null, pillar: false, scope: [], line };
      return;
    }

    if (!atual) {
      const heading = linha.match(SILO_HEADING);
      if (heading && !silo.heading) { silo.heading = heading[1].trim(); ultimoCampo = null; return; }
      const nome = linha.match(NAME_LINE);
      if (nome) { silo.name = nome[1].trim(); ultimoCampo = null; return; }
      const slug = linha.match(SLUG_LINE);
      if (slug) { silo.rawSlug = slug[1].trim(); silo.slug = normalizeDeclaredSiloSlug(slug[1]); ultimoCampo = null; return; }
      const objetivo = linha.match(OBJECTIVE_LINE);
      if (objetivo) { silo.objective = objetivo[1].trim(); ultimoCampo = "objective"; return; }
      if (ultimoCampo === "objective" && silo.objective) { silo.objective = `${silo.objective} ${linha}`; return; }
      unparsed.push({ line, text: linha, reason: "Fora do formato do cabeçalho do Silo (Nome, Slug, Objetivo) e antes do primeiro artigo." });
      return;
    }

    const draft: Draft = atual;
    const principal = linha.match(PRINCIPAL_LINE);
    if (principal) {
      if (draft.principal) {
        unparsed.push({ line, text: linha, reason: `O artigo ${draft.order} já tem a principal "${draft.principal}"; esta segunda linha não foi usada.` });
        return;
      }
      draft.principal = cleanDeclaredPhrase(principal[2]) || null;
      if (principal[1] && /\bpilar\b/i.test(principal[1])) draft.pillar = true;
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
      return;
    }
    draft.scope.push(linha);
  });
  fechar();

  for (const draft of drafts) {
    articles.push({
      order: draft.order,
      subject: draft.subject,
      principal: draft.principal,
      role: draft.pillar ? "Pilar" : "Suporte",
      scope: draft.scope.join(" ").replace(/\s+/g, " ").trim(),
      line: draft.line,
      ...(draft.lock ? { lock: draft.lock } : {}),
    });
  }
  if (!silo.name && silo.heading) silo.name = silo.heading;

  const { refusals, notices } = validateParsedDeclaredPlan({ silo, articles });
  return { silo, articles, unparsed, refusals, notices };
}

/** As recusas e os avisos do plano lido. Recusa = nada é gravado; aviso = a prévia fala. */
export function validateParsedDeclaredPlan(plan: Pick<ParsedDeclaredPlan, "silo" | "articles">): { refusals: DeclaredPlanRefusal[]; notices: string[] } {
  const refusals: DeclaredPlanRefusal[] = [];
  const notices: string[] = [];
  const { silo, articles } = plan;
  if (!articles.length) refusals.push({ code: "NO_ARTICLES", message: "Nenhum artigo encontrado. Cada artigo começa com o número (\"1. Título\")." });
  if (articles.length > DECLARED_PLAN_ARTICLES_MAX) refusals.push({ code: "TOO_MANY_ARTICLES", message: `O plano tem ${articles.length} artigos; o Silo aceita até ${DECLARED_PLAN_ARTICLES_MAX}.` });
  if (articles.length && articles.length < DECLARED_PLAN_ARTICLES_MIN_FOR_SILO) notices.push(`O plano tem ${articles.length} artigo(s): o Silo pede de ${DECLARED_PLAN_ARTICLES_MIN_FOR_SILO} a ${DECLARED_PLAN_ARTICLES_MAX} para fechar.`);
  if (!silo.name || !silo.name.trim()) refusals.push({ code: "SILO_NAME_MISSING", message: "Falta o nome do Silo (\"Nome: …\" ou o cabeçalho \"Silo 1 — …\")." });
  else if (silo.name.length > DECLARED_PLAN_SILO_NAME_MAX) refusals.push({ code: "SILO_NAME_MISSING", message: `O nome do Silo passa de ${DECLARED_PLAN_SILO_NAME_MAX} caracteres.` });
  if (silo.rawSlug && !silo.slug) refusals.push({ code: "SILO_SLUG_INVALID", message: `O slug "${silo.rawSlug}" não é válido: use só letras, números e hífen (ex.: /planos-de-internet/).` });
  if (!silo.rawSlug) notices.push("Sem \"Slug:\": o Silo mantém o endereço que já tem (ou o Arquiteto propõe um).");
  if (silo.objective && silo.objective.length > DECLARED_PLAN_OBJECTIVE_MAX) refusals.push({ code: "OBJECTIVE_TOO_LONG", message: `O objetivo passa de ${DECLARED_PLAN_OBJECTIVE_MAX} caracteres.` });

  const pilares = articles.filter(article => article.role === "Pilar");
  if (articles.length && !pilares.length) refusals.push({ code: "PILLAR_MISSING", message: "Nenhum artigo marcado como Pilar. Escreva \"Artigo pilar • Palavra-chave: …\" no artigo que lidera o Silo." });
  if (pilares.length > 1) refusals.push({ code: "PILLAR_REPEATED", message: `${pilares.length} artigos marcados como Pilar (${pilares.map(article => article.order).join(", ")}): o Silo tem um Pilar só.` });

  const vistos = new Map<number, number>();
  for (const article of articles) vistos.set(article.order, (vistos.get(article.order) || 0) + 1);
  for (const [order, total] of vistos) if (total > 1) refusals.push({ code: "ORDER_REPEATED", message: `A ordem ${order} aparece ${total} vezes.`, order });
  const ordens = [...vistos.keys()].sort((a, b) => a - b);
  if (ordens.length && ordens.some((order, index) => order !== index + 1)) notices.push(`A numeração não é sequencial (${ordens.join(", ")}): a ordem do plano segue os números como estão.`);

  const assuntos = new Map<string, number[]>();
  const principais = new Map<string, number[]>();
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
  }
  for (const [, orders] of assuntos) if (orders.length > 1) refusals.push({ code: "SUBJECT_REPEATED", message: `O mesmo Assunto aparece nos artigos ${orders.join(", ")}.`, order: orders[0] });
  for (const [, orders] of principais) if (orders.length > 1) refusals.push({ code: "PRINCIPAL_REPEATED", message: `A mesma principal aparece nos artigos ${orders.join(", ")}: cada artigo tem a sua.`, order: orders[0] });
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
