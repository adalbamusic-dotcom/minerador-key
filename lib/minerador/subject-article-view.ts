import { declaredPrincipalLock, type DeclaredPlanRole } from "./declared-plan.ts";
import { KEYWORD_SUBJECT_HISTORY_KEY, resolveDeclaredPrincipal, resolveKeywordSubject } from "./keyword-subject.ts";

/**
 * "ASSUNTO DESTE ARTIGO" — o bloco SÓ LEITURA do painel da keyword
 * (pedido do dono, 2026-10-13: "na planilha já não vai mais existir assuntos,
 * só keywords e dentro dessas keywords estão os assuntos").
 *
 * O Assunto saiu do Vínculo (nada de select "Assunto", nota ou página de
 * destino ali). A única porta de escrita é o card "Cadastrar Assuntos"
 * (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`); o painel só mostra o
 * que a keyword carrega: título, detalhes, papel/posição, grupo (cor) e trava.
 *
 * Lê os dois formatos: o cadastro único (Assunto dentro da keyword) e o
 * anterior (Assunto como keyword própria, com ou sem principal em outra linha).
 * E diz quando a marca de principal ficou órfã (Assunto retirado da keyword
 * pelo Vínculo antigo), com o último título que o histórico guardou.
 *
 * Domínio puro. Não grava, não busca.
 */

export const SUBJECT_ARTICLE_EDIT_HINT = "Para mudar, use Cadastrar Assuntos → Silo existente." as const;
export const SUBJECT_ARTICLE_ORPHAN_HINT = "Para recuperar, cadastre o artigo de novo em Cadastrar Assuntos → Silo existente (a keyword já está no grupo)." as const;

export type SubjectArticleGroup = { color: string; name: string } | null;

export type SubjectArticleLock = {
  state: "locked" | "free" | "protected";
  /** "Travada · pelo volume medido", "Livre · sem volume medido", "Protegida pela página publicada". */
  label: string;
  /** Por quê, numa frase. */
  reason: string;
};

export type SubjectArticleView =
  | {
    kind: "subject";
    /** `cadastro`: o Assunto mora nesta keyword. `anterior`: o Assunto é a própria frase desta linha. */
    format: "cadastro" | "anterior";
    title: string;
    details: string | null;
    role: DeclaredPlanRole | null;
    order: number | null;
    groupId: string | null;
    group: SubjectArticleGroup;
    lock: SubjectArticleLock | null;
    /** Formato anterior: a principal declarada mora em outra linha. */
    principalElsewhere: { keywordId: string; phrase: string } | null;
    /** Sem plano de Silo (Assunto anterior solto, ou Assunto de página publicada). */
    withoutPlan: boolean;
    hint: string;
  }
  | {
    /** Formato anterior: esta keyword é a principal declarada de um Assunto em outra linha. */
    kind: "principal_of_subject";
    subjectKeywordId: string;
    subjectTitle: string | null;
    groupId: string;
    group: SubjectArticleGroup;
    lock: SubjectArticleLock;
    hint: string;
  }
  | {
    /** A marca de principal ficou sem o Assunto (retirado pelo Vínculo antigo). */
    kind: "orphan_mark";
    lastTitle: string | null;
    groupId: string;
    group: SubjectArticleGroup;
    hint: string;
  };

export type SubjectArticleViewInput = {
  keywordId: string;
  keyword: string;
  semantic: Record<string, unknown> | null | undefined;
  /** Volume da própria keyword: decide a trava automática do cadastro. */
  volume?: { validated: boolean; value: number | null } | null;
  groupOf?: (groupId: string) => SubjectArticleGroup;
  keywordTextOf?: (keywordId: string) => string | null;
};

const LOCK_REASONS = {
  volume_locked: "Com volume medido, o Arquiteto a usa como principal e só busca sustentações.",
  volume_free: "Sem volume medido, o Arquiteto pode propor outra principal pela SERP e pelo volume (decisão sua); o Assunto, o papel e a ordem continuam no artigo. Medir o Volume (por clique) a trava.",
  manual_locked: "Travada à mão no cadastro: o Arquiteto a usa como principal.",
  manual_free: "Livre à mão no cadastro: o Arquiteto pode propor outra principal (decisão sua).",
  declared: "Plano anterior ao cadastro único: a principal declarada (em outra linha) continua fixa até você mudar a trava no card.",
} as const;

function lockOf(view: NonNullable<ReturnType<typeof declaredPrincipalLock>>): SubjectArticleLock {
  const reason = view.origin === "declared"
    ? LOCK_REASONS.declared
    : view.origin === "manual"
      ? (view.state === "locked" ? LOCK_REASONS.manual_locked : LOCK_REASONS.manual_free)
      : (view.state === "locked" ? LOCK_REASONS.volume_locked : LOCK_REASONS.volume_free);
  return { state: view.state, label: view.label, reason };
}

const PROTECTED_LOCK: SubjectArticleLock = {
  state: "protected",
  label: "Protegida pela página publicada",
  reason: "A keyword da página publicada não é trocada: URL, slug e canonical ficam como estão.",
};

function lastHistoryTitle(semantic: Record<string, unknown> | null | undefined): string | null {
  const history = semantic?.[KEYWORD_SUBJECT_HISTORY_KEY];
  if (!Array.isArray(history)) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index] as { entryTitle?: unknown } | null;
    if (entry && typeof entry.entryTitle === "string" && entry.entryTitle.trim()) return entry.entryTitle.trim();
  }
  return null;
}

/** O que o painel mostra sobre o Assunto desta keyword; `null` = nada a mostrar. */
export function resolveSubjectArticleView(input: SubjectArticleViewInput): SubjectArticleView | null {
  const subject = resolveKeywordSubject(input.semantic);
  const groupOf = (groupId: string | null): SubjectArticleGroup => (groupId && input.groupOf ? input.groupOf(groupId) : null);

  if (subject.declared) {
    const plan = subject.plan;
    const principal = plan?.declaredPrincipal ?? null;
    const carried = Boolean(principal && principal.keywordId === input.keywordId);
    const format: "cadastro" | "anterior" = subject.entry || carried ? "cadastro" : "anterior";
    const lockView = plan ? declaredPrincipalLock(plan, { subjectKeywordId: input.keywordId, volume: input.volume ?? null }) : null;
    const lock = lockView ? lockOf(lockView) : subject.entry && !plan ? PROTECTED_LOCK : null;
    return {
      kind: "subject",
      format,
      title: subject.entry?.title || input.keyword.trim(),
      details: plan?.scope ?? subject.entry?.details ?? subject.note ?? null,
      role: plan?.role ?? null,
      order: plan?.order ?? null,
      groupId: plan?.groupId ?? null,
      group: groupOf(plan?.groupId ?? null),
      lock,
      principalElsewhere: principal && !carried ? { keywordId: principal.keywordId, phrase: principal.phrase } : null,
      withoutPlan: !plan,
      hint: SUBJECT_ARTICLE_EDIT_HINT,
    };
  }

  const mark = resolveDeclaredPrincipal(input.semantic).mark;
  if (!mark) return null;
  if (mark.subjectKeywordId === input.keywordId) {
    return { kind: "orphan_mark", lastTitle: lastHistoryTitle(input.semantic), groupId: mark.groupId, group: groupOf(mark.groupId), hint: SUBJECT_ARTICLE_ORPHAN_HINT };
  }
  return {
    kind: "principal_of_subject",
    subjectKeywordId: mark.subjectKeywordId,
    subjectTitle: input.keywordTextOf ? input.keywordTextOf(mark.subjectKeywordId) : null,
    groupId: mark.groupId,
    group: groupOf(mark.groupId),
    lock: { state: "locked", label: "Principal declarada · plano anterior", reason: "A trava é a do Assunto, na linha dele; no plano anterior ao cadastro único ela fica fixa até você mudar no card." },
    hint: SUBJECT_ARTICLE_EDIT_HINT,
  };
}

/** "Pilar · artigo 1", "Suporte · artigo 4", ou `null` sem plano. */
export function subjectArticlePositionLabel(view: { role: DeclaredPlanRole | null; order: number | null }): string | null {
  if (!view.role && !view.order) return null;
  return [view.role, view.order ? `artigo ${view.order}` : null].filter(Boolean).join(" · ");
}
