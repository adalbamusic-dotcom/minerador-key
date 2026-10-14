import { DECLARED_PLAN_ROLES, type DeclaredPlanLockChoice, type DeclaredPlanRole } from "./declared-plan.ts";
import { KEYWORD_SUBJECT_AT_KEY, KEYWORD_SUBJECT_HISTORY_KEY, KEYWORD_SUBJECT_ORIGIN_KEY, resolveKeywordSubject } from "./keyword-subject.ts";

/**
 * ===== O ASSUNTO RECUPERADO DO HISTÓRICO (2026-10-13) =====
 *
 * Ordem do dono: "não podem perder o assunto de jeito nenhum". Caso real: as 7
 * keywords do grupo azul da WifiConecta perderam o Assunto pelo antigo
 * "Vínculo → Assunto: Não" (e uma pela Revisão Humana). O histórico append-only
 * do Assunto (`keyword_subject_history`) guardou a última declaração com o
 * título (`entryTitle`) e o resumo do plano (grupo, ordem, papel, keyword).
 *
 * Este módulo LÊ esse histórico e devolve a linha do card "Cadastrar Assuntos →
 * Silo existente" já preenchida, para o dono restaurar sem redigitar. Gravar é
 * o MESMO núcleo do cadastro (`importDeclaredPlanWithCore`): prévia → aplicar →
 * releitura. Os detalhes (escopo) só voltam quando o histórico os tem (linhas
 * gravadas desde 2026-10-13); antes disso vêm vazios e o dono cola o plano.
 *
 * Quando NÃO recupera (de propósito):
 *   - o Assunto continua num plano (nada se perdeu);
 *   - a última linha do histórico que mexeu no plano o RETIROU ("Tirar do
 *     plano": `plan: null`, ou com o marcador de liberação);
 *   - o plano era de outro grupo;
 *   - o formato anterior (Assunto numa linha, principal em outra): a keyword
 *     não carregava o próprio Assunto, e reescrever isso não é recuperação.
 *
 * Domínio puro. Não grava, não busca.
 */

type Semantic = Record<string, unknown> | null | undefined;

export const SUBJECT_RECOVERED_LABEL = "Recuperado do histórico — confira os detalhes" as const;

export const SUBJECT_LOSS_ORIGIN_LABELS: Record<string, string> = {
  batch: "Vínculo em lote",
  review: "Revisão Humana",
  import: "cadastro",
};

export type SubjectLoss = {
  /** Quando o Assunto saiu (ISO), se o histórico registrou. */
  at: string | null;
  /** Por onde saiu: "batch" | "review" | "import" | outro texto gravado. */
  origin: string | null;
};

export type RecoveredSubjectRow = {
  keywordId: string;
  keyword: string;
  groupId: string;
  order: number;
  role: DeclaredPlanRole;
  title: string;
  /** O escopo, quando o histórico o guardou; senão "" (o dono cola o plano). */
  details: string;
  lock: DeclaredPlanLockChoice;
  /** A linha do histórico de onde a recuperação saiu. */
  fromHistoryAt: string | null;
  loss: SubjectLoss;
};

type HistoryLine = Record<string, unknown>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function historyOf(semantic: Semantic): HistoryLine[] {
  const value = semantic?.[KEYWORD_SUBJECT_HISTORY_KEY];
  return Array.isArray(value) ? value.map(asRecord).filter((line): line is HistoryLine => Boolean(line)) : [];
}

type PlanSummary = { groupId: string; order: number; role: DeclaredPlanRole; declaredPrincipalKeywordId: string | null; lock: string | null; scope: string | null };

function readPlanSummary(value: unknown): PlanSummary | null {
  const plan = asRecord(value);
  if (!plan) return null;
  const groupId = text(plan.groupId);
  const order = typeof plan.order === "number" && Number.isInteger(plan.order) && plan.order > 0 ? plan.order : null;
  const role = (DECLARED_PLAN_ROLES as readonly string[]).includes(String(plan.role)) ? plan.role as DeclaredPlanRole : null;
  if (!groupId || !order || !role) return null;
  return { groupId, order, role, declaredPrincipalKeywordId: text(plan.declaredPrincipalKeywordId), lock: text(plan.lock), scope: text(plan.scope) };
}

/**
 * A linha decisiva do histórico: a ÚLTIMA que mexeu no plano (tem a chave
 * `plan`). As linhas escritas pelo banco ao preservar (`preservedBy`) são nota,
 * não decisão. Uma linha com marcador de liberação encerra: saiu de propósito.
 */
function lastPlanDecision(history: readonly HistoryLine[]): { index: number; line: HistoryLine; plan: PlanSummary | null; released: boolean } | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const line = history[index];
    if (line.preservedBy === "database") continue;
    if (asRecord(line.release)) return { index, line, plan: null, released: true };
    if (!("plan" in line)) continue;
    return { index, line, plan: line.next === "declared" ? readPlanSummary(line.plan) : null, released: false };
  }
  return null;
}

/**
 * A saída do Assunto depois da linha `index`: a primeira retirada registrada.
 * Sem ela: se o Assunto continua declarado (perdeu só o plano), a última
 * gravação dele; se sumiu sem deixar linha, não se sabe (`null`).
 */
function lossAfter(history: readonly HistoryLine[], index: number, semantic: Semantic): SubjectLoss {
  for (let cursor = index + 1; cursor < history.length; cursor += 1) {
    const line = history[cursor];
    if (line.next === "none") return { at: text(line.changedAt), origin: text(line.origin) };
  }
  if (!resolveKeywordSubject(semantic).declared) return { at: null, origin: null };
  return { at: text(semantic?.[KEYWORD_SUBJECT_AT_KEY]), origin: text(semantic?.[KEYWORD_SUBJECT_ORIGIN_KEY]) };
}

/** O último título que o histórico guardou até a linha `index` (inclusive). */
function titleUpTo(history: readonly HistoryLine[], index: number): string | null {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const title = text(history[cursor].entryTitle);
    if (title) return title;
  }
  return null;
}

/**
 * A linha do card recuperada do histórico desta keyword, para o grupo `groupId`;
 * `null` quando não há o que recuperar (ver o cabeçalho).
 */
export function recoverSubjectFromHistory(input: { keywordId: string; keyword: string; semantic: Semantic; groupId: string }): RecoveredSubjectRow | null {
  const atual = resolveKeywordSubject(input.semantic);
  if (atual.declared && atual.plan) return null;
  const history = historyOf(input.semantic);
  const decisao = lastPlanDecision(history);
  if (!decisao || decisao.released || !decisao.plan) return null;
  const plan = decisao.plan;
  if (plan.groupId !== input.groupId) return null;
  if (plan.declaredPrincipalKeywordId !== input.keywordId) return null;
  return {
    keywordId: input.keywordId,
    keyword: input.keyword,
    groupId: plan.groupId,
    order: plan.order,
    role: plan.role,
    title: titleUpTo(history, decisao.index) ?? input.keyword.trim(),
    details: plan.scope ?? "",
    lock: plan.lock === "locked" || plan.lock === "free" ? plan.lock : "auto",
    fromHistoryAt: text(decisao.line.changedAt),
    loss: lossAfter(history, decisao.index, input.semantic),
  };
}

/** "13/10/2026 05:35 (UTC)" — a data da tela, sem depender do fuso do navegador. */
export function subjectLossDateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]} (UTC)`;
}

export function subjectLossOriginLabel(origin: string | null): string | null {
  if (!origin) return null;
  return SUBJECT_LOSS_ORIGIN_LABELS[origin] ?? origin;
}

/**
 * O aviso do painel "Assunto deste artigo" quando a marca de principal ficou e
 * o Assunto saiu: quando, por onde e o caminho para restaurar sem redigitar.
 */
export function subjectRestoreHint(input: { loss: SubjectLoss | null; colorLabel: string | null }): string {
  const quando = subjectLossDateLabel(input.loss?.at ?? null);
  const origem = subjectLossOriginLabel(input.loss?.origin ?? null);
  const retirada = quando && origem
    ? `Assunto retirado em ${quando} por ${origem}.`
    : quando ? `Assunto retirado em ${quando}.` : "Assunto retirado desta keyword.";
  const cor = input.colorLabel ?? "a cor do grupo";
  return `${retirada} Restaurar: Cadastrar Assuntos → Silo existente → ${cor} (as linhas já vêm do histórico).`;
}
