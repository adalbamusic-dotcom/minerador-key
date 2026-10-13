import type { SitePageType } from "../marca/site-contracts.ts";
import { readDeclaredArticlePlan, readDeclaredPrincipalMark, readSubjectEntry, sameDeclaredArticlePlan, sameSubjectEntry, type DeclaredArticlePlan, type DeclaredPrincipalMark, type SubjectEntry } from "./declared-plan.ts";

/**
 * ASSUNTO — a terceira declaração do Vínculo (SDD 2026-09-24, F1.1).
 *
 * O Assunto é uma frase que o HUMANO declara como tronco de um ou mais
 * artigos. Ela pode não ter volume de busca nenhum: quem traz o leitor são as
 * keywords de sustentação; o Assunto é para onde o artigo faz a virada.
 *
 * Mora ao lado do tipo de página, não dentro dele (P2): "SEO para clínicas"
 * pode ser Assunto e Página de serviço ao mesmo tempo. Por isso o enum de
 * `keyword-page-type.ts` não muda.
 *
 * Gravado em `analise_semantica`, no padrão de `keyword_page_type`:
 *
 *   keyword_subject          { declared, note, destinationUrl, destinationCheck } | null
 *   keyword_subject_actor    auth.users.id — nunca e-mail, nunca "local-user"
 *   keyword_subject_at       ISO 8601
 *   keyword_subject_origin   "import" | "review" | "batch"
 *   keyword_subject_history  append-only
 *
 * A IA nunca declara Assunto (P4). Este módulo não sabe quem o chama; a
 * garantia é estrutural, por lista fechada de chamadores
 * (tests/minerador-assunto-dominio.test.mts): a tela do Minerador, o plano do
 * lote do Vínculo (`vinculo-batch.ts`, chamado só pela tela) e o núcleo do
 * import (`keyword-import-core.ts`, chamado só pela rota do import).
 *
 * Domínio puro. Não persiste, não busca, não chama provider.
 */

export const KEYWORD_SUBJECT_KEY = "keyword_subject" as const;
export const KEYWORD_SUBJECT_ACTOR_KEY = "keyword_subject_actor" as const;
export const KEYWORD_SUBJECT_AT_KEY = "keyword_subject_at" as const;
export const KEYWORD_SUBJECT_ORIGIN_KEY = "keyword_subject_origin" as const;
export const KEYWORD_SUBJECT_HISTORY_KEY = "keyword_subject_history" as const;

/** Nota curta: o que é, para quem. Uma linha só. */
export const KEYWORD_SUBJECT_NOTE_MAX = 280;

export const KEYWORD_SUBJECT_ORIGINS = ["import", "review", "batch"] as const;
export type KeywordSubjectOrigin = typeof KEYWORD_SUBJECT_ORIGINS[number];

/** Rótulos que a tela mostra. Nenhuma tela escreve estes textos por conta própria. */
export const KEYWORD_SUBJECT_LABEL = "Assunto · declarado" as const;
export const KEYWORD_SUBJECT_WITHOUT_NOTE_LABEL = "Assunto sem nota" as const;

/**
 * Conferência da página de destino (F1.2). `hostMatchesBrand` é a parte
 * obrigatória; catálogo é informativo e pode ficar `null` ("fora do catálogo").
 */
export type DestinationCheck = {
  hostMatchesBrand: boolean;
  catalogPageType: SitePageType | null;
  catalogTitle: string | null;
  checkedAt: string;
};

export type KeywordSubjectDeclaration = {
  declared: true;
  note: string | null;
  destinationUrl: string | null;
  destinationCheck: DestinationCheck | null;
  /**
   * PLANO DECLARADO (SDD 2026-10-12 §5.3, F3 = Fase A). Opcional: ausente é o
   * Assunto sem plano, com parse e hash de sempre. Só o núcleo do plano
   * (`declared-plan-import-core.ts`) o grava, pelo `setKeywordSubject`.
   */
  plan?: DeclaredArticlePlan;
  /**
   * CADASTRO ÚNICO (SDD 2026-10-13 §3.2). Opcional: o Assunto (título, origem e,
   * no destino publicado, os detalhes) cadastrado DENTRO desta keyword. Ausente
   * = Assunto anterior, cuja frase é o texto da própria linha.
   */
  entry?: SubjectEntry;
};

export type KeywordSubjectResolution = {
  declared: boolean;
  note: string | null;
  destinationUrl: string | null;
  destinationCheck: DestinationCheck | null;
  /** O artigo do plano declarado; `null` sem plano ou com plano malformado (nunca derruba a leitura). */
  plan: DeclaredArticlePlan | null;
  /** O Assunto cadastrado dentro da keyword (título); `null` no formato anterior ou malformado. */
  entry: SubjectEntry | null;
  /** Declarado sem nota: a coluna marca "Assunto sem nota" até o humano completar. */
  noteMissing: boolean;
  actorId: string | null;
  declaredAt: string | null;
  origin: KeywordSubjectOrigin | null;
};

export type KeywordSubjectHistoryEntry = {
  previous: "none" | "declared";
  next: "none" | "declared";
  note: string | null;
  destinationUrl: string | null;
  actorId: string;
  changedAt: string;
  origin: KeywordSubjectOrigin;
  /** Só quando a mudança envolveu o plano declarado (F4): o resumo, sem o escopo. */
  plan?: { groupId: string; planVersion: number; order: number; role: string; declaredPrincipalKeywordId: string | null; lock?: string | null } | null;
  /** 2026-10-13 · só quando a mudança envolveu o Assunto cadastrado na keyword: o título. */
  entryTitle?: string | null;
};

export type KeywordSubjectRefusalCode =
  | "ACTOR_REQUIRED"
  | "NOTE_TOO_LONG"
  | "NOTE_MULTILINE"
  | "DESTINATION_UNCHECKED"
  | "ORIGIN_INVALID"
  | "PLAN_INVALID";

export type KeywordSubjectWriteResult =
  | { ok: true; semantic: Record<string, unknown>; changed: boolean }
  | { ok: false; semantic: Record<string, unknown>; changed: false; code: KeywordSubjectRefusalCode; reason: string };

type Semantic = Record<string, unknown> | null | undefined;

/** Quebras de linha, inclusive os separadores Unicode que colam de editores. */
const LINE_BREAKS = ["\r", "\n", String.fromCharCode(0x2028), String.fromCharCode(0x2029)];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O ator é `auth.users.id`. E-mail, `"local-user"`, `"usuario"` ou texto vazio
 * não identificam ninguém de forma estável e são recusados (AGENTS.md §5).
 */
export function isKeywordSubjectActorId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readDestinationCheck(value: unknown): DestinationCheck | null {
  const record = asRecord(value);
  if (!record || typeof record.hostMatchesBrand !== "boolean") return null;
  return {
    hostMatchesBrand: record.hostMatchesBrand,
    catalogPageType: text(record.catalogPageType) as SitePageType | null,
    catalogTitle: text(record.catalogTitle),
    checkedAt: text(record.checkedAt) || "",
  };
}

function readOrigin(value: unknown): KeywordSubjectOrigin | null {
  return (KEYWORD_SUBJECT_ORIGINS as readonly string[]).includes(String(value)) ? value as KeywordSubjectOrigin : null;
}

const UNDECLARED: KeywordSubjectResolution = {
  declared: false,
  note: null,
  destinationUrl: null,
  destinationCheck: null,
  plan: null,
  entry: null,
  noteMissing: false,
  actorId: null,
  declaredAt: null,
  origin: null,
};

/** A leitura única da declaração. Valor malformado não vira declaração. */
export function resolveKeywordSubject(semantic: Semantic): KeywordSubjectResolution {
  const record = asRecord(semantic?.[KEYWORD_SUBJECT_KEY]);
  if (!record || record.declared !== true) return { ...UNDECLARED };
  const note = text(record.note);
  return {
    declared: true,
    note,
    destinationUrl: text(record.destinationUrl),
    destinationCheck: readDestinationCheck(record.destinationCheck),
    plan: readDeclaredArticlePlan(record.plan),
    entry: readSubjectEntry(record.entry),
    noteMissing: note === null,
    actorId: text(semantic?.[KEYWORD_SUBJECT_ACTOR_KEY]),
    declaredAt: text(semantic?.[KEYWORD_SUBJECT_AT_KEY]),
    origin: readOrigin(semantic?.[KEYWORD_SUBJECT_ORIGIN_KEY]),
  };
}

/**
 * A FRASE DO ASSUNTO, a leitura única (SDD 2026-10-13 §3.2): o título
 * cadastrado dentro da keyword; no formato anterior, o texto da própria linha.
 * É o que vira `ArticleDNA.subject.phrase`.
 */
export function subjectPhraseOf(keywordText: string, resolution: Pick<KeywordSubjectResolution, "entry">): string {
  return resolution.entry?.title || keywordText.trim();
}

/** `"Assunto · declarado"`, `"Assunto sem nota"` ou `null`. */
export function keywordSubjectLabel(resolution: KeywordSubjectResolution): string | null {
  if (!resolution.declared) return null;
  return resolution.noteMissing ? KEYWORD_SUBJECT_WITHOUT_NOTE_LABEL : KEYWORD_SUBJECT_LABEL;
}

/**
 * Nota: aparada; vazia vira `null`. Quebra de linha e mais de 280 caracteres
 * são recusados — a nota viaja até o CSV "Para escrever" numa linha só.
 */
export function normalizeKeywordSubjectNote(raw: unknown):
  | { ok: true; note: string | null }
  | { ok: false; code: "NOTE_TOO_LONG" | "NOTE_MULTILINE"; reason: string } {
  if (raw === null || raw === undefined) return { ok: true, note: null };
  const value = String(raw).trim();
  if (!value) return { ok: true, note: null };
  if (LINE_BREAKS.some(mark => value.includes(mark))) {
    return { ok: false, code: "NOTE_MULTILINE", reason: "A nota do Assunto precisa caber numa linha só." };
  }
  if (value.length > KEYWORD_SUBJECT_NOTE_MAX) {
    return { ok: false, code: "NOTE_TOO_LONG", reason: `A nota do Assunto tem ${value.length} caracteres; o limite é ${KEYWORD_SUBJECT_NOTE_MAX}.` };
  }
  return { ok: true, note: value };
}

function readHistory(value: unknown): KeywordSubjectHistoryEntry[] {
  return Array.isArray(value) ? value.filter(entry => entry && typeof entry === "object") as KeywordSubjectHistoryEntry[] : [];
}

function refuse(semantic: Record<string, unknown>, code: KeywordSubjectRefusalCode, reason: string): KeywordSubjectWriteResult {
  return { ok: false, semantic, changed: false, code, reason };
}

function checkActorAndOrigin(current: Record<string, unknown>, actorId: unknown, origin: unknown): KeywordSubjectWriteResult | null {
  if (!isKeywordSubjectActorId(actorId)) {
    return refuse(current, "ACTOR_REQUIRED", "Declarar ou retirar o Assunto exige o usuário autenticado (auth.users.id).");
  }
  if (!readOrigin(origin)) return refuse(current, "ORIGIN_INVALID", "Origem da declaração do Assunto desconhecida.");
  return null;
}

export type SetKeywordSubjectInput = {
  note?: string | null;
  /**
   * Página de destino já conferida por `validateSubjectDestination`
   * (`subject-destination.ts`). URL sem conferência com `hostMatchesBrand`
   * verdadeiro é recusada: o domínio da marca é a regra, não uma sugestão.
   */
  destinationUrl?: string | null;
  destinationCheck?: DestinationCheck | null;
  actorId: string;
  changedAt: string;
  origin: KeywordSubjectOrigin;
  /**
   * Plano declarado (F4). `undefined` preserva o plano gravado (os writers de
   * sempre não o apagam); `null` retira; um valor grava. Só o núcleo do plano
   * passa este campo.
   */
  plan?: DeclaredArticlePlan | null;
  /**
   * 2026-10-13 · o Assunto cadastrado na keyword (título, origem, detalhes).
   * Mesma regra do `plan`: `undefined` preserva, `null` retira, valor grava.
   * Só o núcleo do cadastro (`declared-plan-import-core.ts`) passa este campo.
   */
  entry?: SubjectEntry | null;
};

function planSummary(plan: DeclaredArticlePlan | null): KeywordSubjectHistoryEntry["plan"] {
  return plan ? { groupId: plan.groupId, planVersion: plan.planVersion, order: plan.order, role: plan.role, declaredPrincipalKeywordId: plan.declaredPrincipal?.keywordId ?? null, ...(plan.lock ? { lock: plan.lock } : {}) } : null;
}

/**
 * Declara o Assunto, ou troca nota e destino de uma declaração existente.
 *
 * `changed: false` quando a declaração já existe com a mesma nota, o mesmo
 * destino e o mesmo plano — reimportar ou repetir o lote não regrava nada.
 * Uma nova conferência do catálogo, sozinha, não é mudança.
 */
export function setKeywordSubject(semantic: Semantic, input: SetKeywordSubjectInput): KeywordSubjectWriteResult {
  const current = { ...(semantic || {}) };
  const guard = checkActorAndOrigin(current, input.actorId, input.origin);
  if (guard) return guard;

  const note = normalizeKeywordSubjectNote(input.note);
  if (!note.ok) return refuse(current, note.code, note.reason);

  const destinationUrl = text(input.destinationUrl);
  const destinationCheck = destinationUrl ? input.destinationCheck ?? null : null;
  if (destinationUrl && destinationCheck?.hostMatchesBrand !== true) {
    return refuse(current, "DESTINATION_UNCHECKED", "A página de destino precisa ser conferida no domínio da marca antes de ser gravada.");
  }

  const previous = resolveKeywordSubject(current);
  let plan: DeclaredArticlePlan | null = previous.plan;
  if (input.plan !== undefined) {
    plan = input.plan === null ? null : readDeclaredArticlePlan(input.plan);
    if (input.plan !== null && !plan) return refuse(current, "PLAN_INVALID", "O plano declarado do Assunto não fecha o contrato (ordem, papel, escopo de até 1.200 caracteres numa linha, principal).");
  }
  let entry: SubjectEntry | null = previous.entry;
  if (input.entry !== undefined) {
    entry = input.entry === null ? null : readSubjectEntry(input.entry);
    if (input.entry !== null && !entry) return refuse(current, "PLAN_INVALID", "O Assunto cadastrado na keyword não fecha o contrato (título de até 300 caracteres numa linha; detalhes de até 1.200).");
  }
  if (previous.declared && previous.note === note.note && previous.destinationUrl === destinationUrl && sameDeclaredArticlePlan(previous.plan, plan) && sameSubjectEntry(previous.entry, entry)) {
    return { ok: true, semantic: current, changed: false };
  }

  const history = readHistory(current[KEYWORD_SUBJECT_HISTORY_KEY]);
  history.push({
    previous: previous.declared ? "declared" : "none",
    next: "declared",
    note: note.note,
    destinationUrl,
    actorId: input.actorId.trim(),
    changedAt: input.changedAt,
    origin: input.origin,
    ...(input.plan !== undefined || !sameDeclaredArticlePlan(previous.plan, plan) ? { plan: planSummary(plan) } : {}),
    ...(!sameSubjectEntry(previous.entry, entry) ? { entryTitle: entry?.title ?? null } : {}),
  });
  const declaration: KeywordSubjectDeclaration = {
    declared: true,
    note: note.note,
    destinationUrl,
    destinationCheck,
    ...(plan ? { plan } : {}),
    ...(entry ? { entry } : {}),
  };
  return {
    ok: true,
    changed: true,
    semantic: {
      ...current,
      [KEYWORD_SUBJECT_KEY]: declaration,
      [KEYWORD_SUBJECT_ACTOR_KEY]: input.actorId.trim(),
      [KEYWORD_SUBJECT_AT_KEY]: input.changedAt,
      [KEYWORD_SUBJECT_ORIGIN_KEY]: input.origin,
      [KEYWORD_SUBJECT_HISTORY_KEY]: history,
    },
  };
}

/**
 * Retira a declaração (F1.5): grava `keyword_subject: null` e acrescenta ao
 * histórico. O histórico nunca é apagado. Sem declaração, `changed: false`.
 */
export function withdrawKeywordSubject(
  semantic: Semantic,
  input: { actorId: string; changedAt: string; origin: KeywordSubjectOrigin },
): KeywordSubjectWriteResult {
  const current = { ...(semantic || {}) };
  const guard = checkActorAndOrigin(current, input.actorId, input.origin);
  if (guard) return guard;
  if (!resolveKeywordSubject(current).declared) return { ok: true, semantic: current, changed: false };

  const history = readHistory(current[KEYWORD_SUBJECT_HISTORY_KEY]);
  history.push({
    previous: "declared",
    next: "none",
    note: null,
    destinationUrl: null,
    actorId: input.actorId.trim(),
    changedAt: input.changedAt,
    origin: input.origin,
  });
  return {
    ok: true,
    changed: true,
    semantic: {
      ...current,
      [KEYWORD_SUBJECT_KEY]: null,
      [KEYWORD_SUBJECT_ACTOR_KEY]: input.actorId.trim(),
      [KEYWORD_SUBJECT_AT_KEY]: input.changedAt,
      [KEYWORD_SUBJECT_ORIGIN_KEY]: input.origin,
      [KEYWORD_SUBJECT_HISTORY_KEY]: history,
    },
  };
}

/* ========================================================================== */
/* PRINCIPAL DECLARADA NO PLANO (SDD 2026-10-12 §5.3; ADR-022, emenda D1-bis) */
/* ========================================================================== */

/**
 * A marca recíproca da principal declarada, no padrão de chaves do Assunto:
 *
 *   keyword_declared_principal          { subjectKeywordId, groupId, planVersion } | null
 *   keyword_declared_principal_actor    auth.users.id
 *   keyword_declared_principal_at       ISO 8601
 *   keyword_declared_principal_history  append-only
 *
 * O Assunto aponta para a principal (`keyword_subject.plan.declaredPrincipal`)
 * e a principal aponta de volta, gravados pelo MESMO núcleo na mesma operação.
 * Divergência vira conflito visível ("principal declarada sem reciprocidade"),
 * nunca correção silenciosa. Entra no hash do pacote aprovado (é significado).
 */
export const KEYWORD_DECLARED_PRINCIPAL_KEY = "keyword_declared_principal" as const;
export const KEYWORD_DECLARED_PRINCIPAL_ACTOR_KEY = "keyword_declared_principal_actor" as const;
export const KEYWORD_DECLARED_PRINCIPAL_AT_KEY = "keyword_declared_principal_at" as const;
export const KEYWORD_DECLARED_PRINCIPAL_HISTORY_KEY = "keyword_declared_principal_history" as const;

export const KEYWORD_DECLARED_PRINCIPAL_LABEL = "Principal declarada" as const;

export type DeclaredPrincipalResolution = {
  mark: DeclaredPrincipalMark | null;
  actorId: string | null;
  declaredAt: string | null;
};

/** A leitura única da marca. Valor malformado não vira principal declarada. */
export function resolveDeclaredPrincipal(semantic: Semantic): DeclaredPrincipalResolution {
  const mark = readDeclaredPrincipalMark(semantic?.[KEYWORD_DECLARED_PRINCIPAL_KEY]);
  return mark
    ? { mark, actorId: text(semantic?.[KEYWORD_DECLARED_PRINCIPAL_ACTOR_KEY]), declaredAt: text(semantic?.[KEYWORD_DECLARED_PRINCIPAL_AT_KEY]) }
    : { mark: null, actorId: null, declaredAt: null };
}

type DeclaredPrincipalHistoryEntry = { previous: DeclaredPrincipalMark | null; next: DeclaredPrincipalMark | null; actorId: string; changedAt: string };

const samePrincipalMark = (left: DeclaredPrincipalMark | null, right: DeclaredPrincipalMark | null) =>
  (!left && !right) || Boolean(left && right && left.subjectKeywordId === right.subjectKeywordId && left.groupId === right.groupId && left.planVersion === right.planVersion);

/**
 * Grava (ou retira, com `mark: null`) a marca de principal declarada. Mesma
 * marca = `changed: false`. O ator é `auth.users.id`; a IA nunca declara.
 */
export function setDeclaredPrincipal(
  semantic: Semantic,
  input: { mark: DeclaredPrincipalMark | null; actorId: string; changedAt: string },
): KeywordSubjectWriteResult {
  const current = { ...(semantic || {}) };
  if (!isKeywordSubjectActorId(input.actorId)) {
    return refuse(current, "ACTOR_REQUIRED", "Declarar a principal do plano exige o usuário autenticado (auth.users.id).");
  }
  const next = input.mark === null ? null : readDeclaredPrincipalMark(input.mark);
  if (input.mark !== null && !next) return refuse(current, "PLAN_INVALID", "A marca de principal declarada não fecha o contrato (Assunto, grupo e versão do plano).");
  const previous = resolveDeclaredPrincipal(current).mark;
  if (samePrincipalMark(previous, next)) return { ok: true, semantic: current, changed: false };
  const history = Array.isArray(current[KEYWORD_DECLARED_PRINCIPAL_HISTORY_KEY])
    ? [...(current[KEYWORD_DECLARED_PRINCIPAL_HISTORY_KEY] as DeclaredPrincipalHistoryEntry[])]
    : [];
  history.push({ previous, next, actorId: input.actorId.trim(), changedAt: input.changedAt });
  return {
    ok: true,
    changed: true,
    semantic: {
      ...current,
      [KEYWORD_DECLARED_PRINCIPAL_KEY]: next,
      [KEYWORD_DECLARED_PRINCIPAL_ACTOR_KEY]: input.actorId.trim(),
      [KEYWORD_DECLARED_PRINCIPAL_AT_KEY]: input.changedAt,
      [KEYWORD_DECLARED_PRINCIPAL_HISTORY_KEY]: history,
    },
  };
}

/**
 * A reciprocidade conferida na releitura: o plano do Assunto aponta para a
 * principal e a principal aponta de volta para o Assunto, no mesmo grupo e na
 * mesma versão do plano.
 */
export function declaredPrincipalReciprocity(input: {
  subjectKeywordId: string;
  subjectSemantic: Semantic;
  principalKeywordId: string;
  principalSemantic: Semantic;
}): { ok: true } | { ok: false; reason: string } {
  const plan = resolveKeywordSubject(input.subjectSemantic).plan;
  const mark = resolveDeclaredPrincipal(input.principalSemantic).mark;
  if (!plan || plan.declaredPrincipal?.keywordId !== input.principalKeywordId) {
    return { ok: false, reason: "O Assunto não aponta para esta principal declarada." };
  }
  if (!mark || mark.subjectKeywordId !== input.subjectKeywordId || mark.groupId !== plan.groupId || mark.planVersion !== plan.planVersion) {
    return { ok: false, reason: "Principal declarada sem reciprocidade: a principal não aponta de volta para o Assunto deste plano." };
  }
  return { ok: true };
}
