import type { SitePageType } from "../marca/site-contracts.ts";
import { isLightKeywordSemantic, LIGHT_ROW_WRITE_REFUSAL } from "./keyword-light-list.ts";
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
 * (tests/minerador-assunto-dominio.test.mts). Desde 2026-10-13 o Vínculo (tela,
 * lote e MCP `set_keyword_vinculo`) não declara nem retira Assunto: a porta é o
 * card "Cadastrar Assuntos" (`declared-plan-import-core.ts`), e tirar do plano é
 * `declared-plan-withdraw-core.ts`.
 *
 * Domínio puro. Não persiste, não busca, não chama provider.
 */

export const KEYWORD_SUBJECT_KEY = "keyword_subject" as const;
export const KEYWORD_SUBJECT_ACTOR_KEY = "keyword_subject_actor" as const;
export const KEYWORD_SUBJECT_AT_KEY = "keyword_subject_at" as const;
export const KEYWORD_SUBJECT_ORIGIN_KEY = "keyword_subject_origin" as const;
export const KEYWORD_SUBJECT_HISTORY_KEY = "keyword_subject_history" as const;
/**
 * 2026-10-13 · "O ASSUNTO NUNCA SE PERDE" (ordem do dono: "não podem perder o
 * assunto de jeito nenhum"). O marcador de LIBERAÇÃO que a MESMA escrita traz
 * quando tira o Assunto (ou o plano, ou o título) de propósito. Sem ele, o
 * banco repõe o Assunto (gatilho `minerador_keywords_preserva_assunto`,
 * migration 20261015120000) e esta guarda recusa antes, com o motivo.
 */
export const KEYWORD_SUBJECT_RELEASE_KEY = "keyword_subject_release" as const;

/**
 * Os únicos caminhos que liberam: "Tirar do plano" e a conversão do formato
 * anterior. `excluir_cor` fica RESERVADO para "Excluir tudo da cor X" (outra
 * SDD, ainda não feita; nenhum código o grava hoje — lista fechada em
 * `tests/minerador-assunto-nunca-se-perde.test.mts`): ela grava o marcador ao
 * tirar o plano e só então exclui, na mesma operação confirmada.
 */
export const KEYWORD_SUBJECT_RELEASE_VIAS = ["tirar_do_plano", "conversao", "excluir_cor"] as const;
export type KeywordSubjectReleaseVia = typeof KEYWORD_SUBJECT_RELEASE_VIAS[number];

export type KeywordSubjectRelease = {
  /** Único por operação: o banco só aceita um marcador NOVO (diferente do gravado). */
  requestId: string;
  reason: string;
  actorId: string;
  at: string;
  via: KeywordSubjectReleaseVia;
};

/** Nota curta: o que é, para quem. Uma linha só. */
export const KEYWORD_SUBJECT_NOTE_MAX = 280;

export const KEYWORD_SUBJECT_ORIGINS = ["import", "review", "batch"] as const;
export type KeywordSubjectOrigin = typeof KEYWORD_SUBJECT_ORIGINS[number];

/** Rótulos que a tela mostra. Nenhuma tela escreve estes textos por conta própria. */
export const KEYWORD_SUBJECT_LABEL = "Assunto · declarado" as const;

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
  /**
   * Só quando a mudança envolveu o plano declarado (F4): o resumo. Desde
   * 2026-10-13 leva também o escopo (os detalhes): sem ele, o Assunto
   * recuperado do histórico voltava sem detalhes.
   */
  plan?: { groupId: string; planVersion: number; order: number; role: string; declaredPrincipalKeywordId: string | null; lock?: string | null; scope?: string; slug?: string } | null;
  /** 2026-10-13 · só quando a mudança envolveu o Assunto cadastrado na keyword: o título. */
  entryTitle?: string | null;
  /** 2026-10-13 · a retirada liberada ("Tirar do plano" ou conversão): o marcador da mesma escrita. */
  release?: KeywordSubjectRelease;
  /** 2026-10-13 · linha escrita pelo BANCO quando repôs o Assunto que uma escrita tentou apagar sem liberação. */
  preservedBy?: "database";
  attempted?: unknown;
};

export type KeywordSubjectRefusalCode =
  | "ACTOR_REQUIRED"
  | "NOTE_TOO_LONG"
  | "NOTE_MULTILINE"
  | "DESTINATION_UNCHECKED"
  | "ORIGIN_INVALID"
  | "PLAN_INVALID"
  /** 2026-10-13 · tirar o Assunto, o plano ou o título sem o marcador de liberação ("Tirar do plano"/conversão). */
  | "SUBJECT_RELEASE_REQUIRED";

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

/**
 * `"Assunto · declarado"` ou `null`. Desde 2026-10-13 a nota não é mais
 * editável (o Assunto saiu do Vínculo; os detalhes vêm do card "Cadastrar
 * Assuntos"), então a falta dela não vira mais "Assunto sem nota".
 */
export function keywordSubjectLabel(resolution: KeywordSubjectResolution): string | null {
  return resolution.declared ? KEYWORD_SUBJECT_LABEL : null;
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
  /**
   * 2026-10-13 · obrigatório quando esta escrita TIRA o plano (`plan: null`) ou o
   * título (`entry: null`) de um Assunto que os tinha. Só "Tirar do plano" e a
   * conversão passam; sem ele, `SUBJECT_RELEASE_REQUIRED` (e o banco repõe).
   */
  release?: KeywordSubjectRelease | null;
};

function planSummary(plan: DeclaredArticlePlan | null): KeywordSubjectHistoryEntry["plan"] {
  return plan ? { groupId: plan.groupId, planVersion: plan.planVersion, order: plan.order, role: plan.role, declaredPrincipalKeywordId: plan.declaredPrincipal?.keywordId ?? null, ...(plan.lock ? { lock: plan.lock } : {}), scope: plan.scope, ...(plan.slug ? { slug: plan.slug } : {}) } : null;
}

/* ========================================================================== */
/* O ASSUNTO NUNCA SE PERDE (2026-10-13)                                       */
/* ========================================================================== */

/** O marcador de liberação, ou `null` se ausente/malformado. */
export function readKeywordSubjectRelease(value: unknown): KeywordSubjectRelease | null {
  const record = asRecord(value);
  if (!record) return null;
  const via = String(record.via);
  if (!(KEYWORD_SUBJECT_RELEASE_VIAS as readonly string[]).includes(via)) return null;
  const requestId = text(record.requestId);
  const reason = text(record.reason);
  const actorId = text(record.actorId);
  const at = text(record.at);
  if (!requestId || !reason || !actorId || !at || !isKeywordSubjectActorId(actorId)) return null;
  return { requestId, reason, actorId, at, via: via as KeywordSubjectReleaseVia };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const sameRelease = (left: KeywordSubjectRelease | null, right: KeywordSubjectRelease | null) =>
  (!left && !right) || Boolean(left && right && left.requestId === right.requestId && left.via === right.via && left.at === right.at && left.actorId === right.actorId);

/**
 * O Assunto que a escrita não pode perder: declarado (com ou sem plano/título).
 * Espelho exato do gatilho `minerador_keywords_preserva_assunto`.
 */
function protectedSubjectOf(semantic: Semantic): Record<string, unknown> | null {
  const record = asRecord(semantic?.[KEYWORD_SUBJECT_KEY]);
  return record && record.declared === true ? record : null;
}

/** A escrita tira o Assunto, desdeclara, ou perde o plano/título que ele tinha? */
export function keywordSubjectRemovedBy(previous: Semantic, next: Semantic): boolean {
  const antes = protectedSubjectOf(previous);
  if (!antes) return false;
  const depois = asRecord(next?.[KEYWORD_SUBJECT_KEY]);
  if (!depois || depois.declared !== true) return true;
  if (asRecord(antes.plan) && !asRecord(depois.plan)) return true;
  if (asRecord(antes.entry) && !asRecord(depois.entry)) return true;
  return false;
}

/** A escrita traz um marcador de liberação NOVO (diferente do gravado)? */
export function keywordSubjectReleasedBy(previous: Semantic, next: Semantic): boolean {
  const nova = readKeywordSubjectRelease(next?.[KEYWORD_SUBJECT_RELEASE_KEY]);
  if (!nova) return false;
  return !sameRelease(readKeywordSubjectRelease(previous?.[KEYWORD_SUBJECT_RELEASE_KEY]), nova);
}

export const KEYWORD_SUBJECT_RELEASE_REFUSAL =
  "O Assunto desta keyword não sai por esta tela: só “Tirar do plano” (card Cadastrar Assuntos → Silo existente) o libera. Nada foi gravado." as const;

export type KeywordSemanticWriteGuard =
  | { ok: true; semantic: Record<string, unknown>; carried: boolean }
  | { ok: false; code: "SUBJECT_RELEASE_REQUIRED"; reason: string; title: string | null }
  // F6 (lista leve): a linha leve da planilha nunca é gravada de volta.
  | { ok: false; code: "LIGHT_ROW_WRITE"; reason: string; title: null };

const SUBJECT_KEYS = [KEYWORD_SUBJECT_KEY, KEYWORD_SUBJECT_ACTOR_KEY, KEYWORD_SUBJECT_AT_KEY, KEYWORD_SUBJECT_ORIGIN_KEY] as const;

/**
 * A GUARDA NO CÓDIGO, antes do banco, para TODO escritor de `analise_semantica`.
 *
 * - Escrita que nem traz a chave `keyword_subject` (cópia montada sem ela) não
 *   apaga nada: o Assunto gravado é LEVADO para a escrita (merge, não replace).
 * - Escrita que o traz nulo, desdeclarado, ou sem o plano/título que tinha, sem
 *   um marcador de liberação NOVO, é RECUSADA com o motivo (a tela mostra).
 * - O histórico do Assunto é append-only: as linhas gravadas nunca saem.
 *
 * `previous` é o que o escritor leu (do banco ou da tela). Se a cópia da tela
 * estiver velha (sem o Assunto que o banco já tem), quem garante é o gatilho.
 */
export function guardKeywordSemanticWrite(previous: Semantic, next: Record<string, unknown>): KeywordSemanticWriteGuard {
  // F6: a marca da lista leve viaja em qualquer spread; gravar a partir dela apagaria os blocos podados.
  if (isLightKeywordSemantic(previous) || isLightKeywordSemantic(next)) return { ok: false, code: "LIGHT_ROW_WRITE", reason: LIGHT_ROW_WRITE_REFUSAL, title: null };
  const antes = protectedSubjectOf(previous);
  let semantic = next;
  let carried = false;
  if (antes) {
    if (!(KEYWORD_SUBJECT_KEY in next)) {
      semantic = { ...next };
      for (const key of SUBJECT_KEYS) if (previous && key in previous) semantic[key] = previous[key];
      carried = true;
    } else if (keywordSubjectRemovedBy(previous, next) && !keywordSubjectReleasedBy(previous, next)) {
      const entry = asRecord(antes.entry);
      return { ok: false, code: "SUBJECT_RELEASE_REQUIRED", reason: KEYWORD_SUBJECT_RELEASE_REFUSAL, title: text(entry?.title) };
    }
  }
  const historicoAntes = readHistory(previous?.[KEYWORD_SUBJECT_HISTORY_KEY]);
  if (historicoAntes.length) {
    const historicoDepois = readHistory(semantic[KEYWORD_SUBJECT_HISTORY_KEY]);
    // O JSONB reordena as chaves: compara pelo texto canônico (chaves ordenadas).
    const chave = (entry: unknown) => stableJson(entry);
    const depois = new Set(historicoDepois.map(chave));
    if (historicoAntes.some(entry => !depois.has(chave(entry)))) {
      const antesChaves = new Set(historicoAntes.map(chave));
      semantic = { ...semantic, [KEYWORD_SUBJECT_HISTORY_KEY]: [...historicoAntes, ...historicoDepois.filter(entry => !antesChaves.has(chave(entry)))] };
      carried = true;
    }
  }
  return { ok: true, semantic, carried };
}

/**
 * Para os escritores que gravam em lote pela tela: devolve o objeto a gravar ou
 * LANÇA o motivo (o lote marca só aquela keyword como falha, com o texto).
 */
export function semanticForKeywordWrite(previous: Semantic, next: Record<string, unknown>): Record<string, unknown> {
  const guard = guardKeywordSemanticWrite(previous, next);
  if (!guard.ok) throw new Error(guard.title ? `${guard.reason} (Assunto “${guard.title}”)` : guard.reason);
  return guard.semantic;
}

/**
 * A exclusão que o banco recusa (gatilho `minerador_keywords_recusa_exclusao_com_assunto`):
 * Assunto declarado com plano, ou com título cadastrado ainda não liberado por "Tirar do plano".
 */
export function keywordSubjectBlocksDeletion(semantic: Semantic): boolean {
  const assunto = protectedSubjectOf(semantic);
  if (!assunto) return false;
  if (asRecord(assunto.plan)) return true;
  if (!asRecord(assunto.entry)) return false;
  // Espelho do gatilho: na exclusão o banco confere só a `via` do marcador já gravado.
  const via = asRecord(semantic?.[KEYWORD_SUBJECT_RELEASE_KEY])?.via;
  return via !== "tirar_do_plano" && via !== "excluir_cor";
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
  // 2026-10-13 · tirar o plano ou o título só com o marcador de liberação ("Tirar do plano"/conversão).
  const tira = previous.declared && ((previous.plan && !plan) || (previous.entry && !entry));
  const release = tira ? readKeywordSubjectRelease(input.release) : null;
  if (tira && !release) return refuse(current, "SUBJECT_RELEASE_REQUIRED", KEYWORD_SUBJECT_RELEASE_REFUSAL);

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
    ...(release ? { release } : {}),
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
      ...(release ? { [KEYWORD_SUBJECT_RELEASE_KEY]: release } : {}),
    },
  };
}

/*
 * 2026-10-16 · F1 da linha única do Minerador (SDD
 * `sdd-linha-unica-do-minerador-2026-10-16.md`, A10, decisão D4): a retirada do
 * Assunto inteiro (`keyword_subject: null`) saiu — não tinha chamador desde
 * 2026-10-13. Tirar o plano é `setKeywordSubject` com `plan: null` e o marcador
 * de liberação ("Tirar do plano", "Substituir o plano"); o formato anterior se
 * resolve pela conversão.
 */

/**
 * 2026-10-13 · SUBSTITUIR O PLANO (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`
 * §5.2, F1). A keyword que PERDEU o Assunto antes (sem liberação — o caso do
 * Silo azul) e que o dono deixou FORA do plano novo: nada é declarado nem
 * apagado; só o histórico append-only ganha a linha da liberação (o mesmo
 * marcador de "Tirar do plano"), para a recuperação do histórico não a oferecer
 * de novo como "Recuperado do histórico". Assunto declarado não passa por aqui
 * (é `setKeywordSubject` com `plan: null` e o marcador).
 */
export function recordKeywordSubjectRelease(
  semantic: Semantic,
  input: { actorId: string; changedAt: string; release: KeywordSubjectRelease },
): KeywordSubjectWriteResult {
  const current = { ...(semantic || {}) };
  const guard = checkActorAndOrigin(current, input.actorId, "review");
  if (guard) return guard;
  if (resolveKeywordSubject(current).declared) return refuse(current, "SUBJECT_RELEASE_REQUIRED", "O Assunto desta keyword está declarado: a liberação é pelo “Tirar do plano”.");
  const release = readKeywordSubjectRelease(input.release);
  if (!release) return refuse(current, "SUBJECT_RELEASE_REQUIRED", KEYWORD_SUBJECT_RELEASE_REFUSAL);
  const history = readHistory(current[KEYWORD_SUBJECT_HISTORY_KEY]);
  history.push({
    previous: "none",
    next: "none",
    note: null,
    destinationUrl: null,
    actorId: input.actorId.trim(),
    changedAt: input.changedAt,
    origin: "review",
    plan: null,
    release,
  });
  return { ok: true, changed: true, semantic: { ...current, [KEYWORD_SUBJECT_RELEASE_KEY]: release, [KEYWORD_SUBJECT_HISTORY_KEY]: history } };
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
