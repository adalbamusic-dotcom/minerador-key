import { declaredPrincipalLock, type DeclaredPlanRole } from "./declared-plan.ts";
import { KEYWORD_SUBJECT_HISTORY_KEY, resolveDeclaredPrincipal, resolveKeywordSubject } from "./keyword-subject.ts";
import { readSubjectConversion } from "./subject-conversion.ts";
import { EDITORIAL_GROUP_COLOR_LABELS, isEditorialGroupColor } from "../editorial/editorial-groups.ts";
import { recoverSubjectFromHistory, subjectRestoreHint } from "./subject-recovery.ts";

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

/* 2026-10-18 · SUBSTITUÍDO "Para mudar, use Cadastrar Assuntos → Silo existente.": os campos do Assunto são editados aqui no painel (SDD 2026-10-18 §8), pelo núcleo do cadastro. */
export const SUBJECT_ARTICLE_EDIT_HINT = "Para mudar o título ou os detalhes, use “Editar Assunto” aqui no painel (prévia, gravar e releitura pelo núcleo do cadastro)." as const;
/** 2026-10-18 · a principal do formato anterior: o Assunto mora em outra linha, e é lá que se edita. */
export const SUBJECT_ARTICLE_PRINCIPAL_HINT = "O Assunto mora na linha dele: para mudar, abra o painel daquela keyword (Editar Assunto)." as const;
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
    /** 2026-10-13 · aditivo: o Assunto veio de uma linha-título do formato anterior (conversão). */
    convertedFrom?: { keywordId: string; phrase: string };
  }
  | {
    /** 2026-10-13 · esta linha é uma linha-título CONVERTIDA: o Assunto agora mora em outra keyword. */
    kind: "converted_title";
    keywordId: string;
    keyword: string | null;
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
    /** 2026-10-13 · aditivo: papel e ordem do artigo, quando a linha do Assunto foi lida (`subjectSemanticOf`). */
    role?: DeclaredPlanRole | null;
    order?: number | null;
  }
  | {
    /** A marca de principal ficou sem o Assunto (retirado pelo Vínculo antigo). */
    kind: "orphan_mark";
    lastTitle: string | null;
    groupId: string;
    group: SubjectArticleGroup;
    hint: string;
    /** 2026-10-13 · aditivo: quando e por onde o Assunto saiu (do histórico); `null` se não registrado. */
    lostAt?: string | null;
    lostOrigin?: string | null;
  };

export type SubjectArticleViewInput = {
  keywordId: string;
  keyword: string;
  semantic: Record<string, unknown> | null | undefined;
  /** Volume da própria keyword: decide a trava automática do cadastro. */
  volume?: { validated: boolean; value: number | null } | null;
  groupOf?: (groupId: string) => SubjectArticleGroup;
  keywordTextOf?: (keywordId: string) => string | null;
  /** 2026-10-13 · esta linha é uma linha-título convertida (índice da marca, `convertedTitleIndex`). */
  convertedTo?: { keywordId: string; keyword: string | null } | null;
  /**
   * 2026-10-13 · aditivo: o `analise_semantica` de outra keyword da marca pelo id.
   * Com ele, a principal do formato anterior mostra a trava, o papel e a ordem
   * REAIS do artigo (que moram na linha do Assunto). Sem ele, o de antes.
   */
  subjectSemanticOf?: (keywordId: string) => Record<string, unknown> | null | undefined;
  /** 2026-10-18 · aditivo: a keyword é a página publicada (Vínculo). Decide o rótulo do Assunto sem plano (M8). */
  published?: boolean;
};

export const SUBJECT_ARTICLE_CONVERTED_HINT = "A linha-título fica arquivada como histórico: não a exclua (a exclusão de keyword não publicada é definitiva). Para desfazer, converta de volta pela keyword que carrega o Assunto." as const;

const LOCK_REASONS = {
  volume_locked: "Com volume medido, o Arquiteto a usa como principal e só busca sustentações.",
  volume_free: "Sem volume medido, o Arquiteto pode propor outra principal pela SERP e pelo volume (decisão sua); o Assunto, o papel e a ordem continuam no artigo. Medir o Volume (por clique) a trava.",
  manual_locked: "Travada à mão no cadastro: o Arquiteto a usa como principal.",
  manual_free: "Livre à mão no cadastro: o Arquiteto pode propor outra principal (decisão sua).",
  declared: "Plano anterior ao cadastro único: a principal declarada (em outra linha) continua fixa até você mudar a trava no card.",
} as const;

/**
 * A trava efetiva em rótulo + porquê. Uma leitura só: o bloco "Assunto deste
 * artigo", o select "Posto de principal" da keyword do plano
 * (`keyword-plan-lock.ts`) e o cabeçalho do Perfil dizem a mesma frase.
 */
export function describeDeclaredPrincipalLock(view: NonNullable<ReturnType<typeof declaredPrincipalLock>>): SubjectArticleLock {
  return lockOf(view);
}

function lockOf(view: NonNullable<ReturnType<typeof declaredPrincipalLock>>): SubjectArticleLock {
  const reason = view.origin === "declared"
    ? LOCK_REASONS.declared
    : view.origin === "manual"
      ? (view.state === "locked" ? LOCK_REASONS.manual_locked : LOCK_REASONS.manual_free)
      : (view.state === "locked" ? LOCK_REASONS.volume_locked : LOCK_REASONS.volume_free);
  return { state: view.state, label: view.label, reason };
}

/*
 * 2026-10-18 · SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.2-g (M8).
 * SUBSTITUI "Protegida pela página publicada · a keyword da página publicada não é
 * trocada": o rótulo valia também para keyword NÃO publicada, e o publicado de
 * volume 0 agora pode trocar de principal (decisão do dono na prévia do Arquiteto).
 */
const PUBLISHED_PAGE_LOCK: SubjectArticleLock = {
  state: "protected",
  label: "Página publicada · URL, slug e canonical ficam; a principal segue o volume",
  reason: "URL, slug e canonical da página nunca mudam. Volume 0: a principal fica livre para uma com volume (decisão sua no Arquiteto); volume definido: fica.",
};
const KEYWORD_SUBJECT_LOCK: SubjectArticleLock = {
  state: "free",
  label: "Assunto na própria keyword (sem Silo) · a principal segue o volume",
  reason: "Sem plano de Silo: volume 0 deixa a principal livre para uma com volume (decisão sua no Arquiteto); volume definido a mantém.",
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

  // 2026-10-13 · a linha-título convertida não é mais Assunto: diz para onde ele foi.
  if (input.convertedTo && subject.declared && !subject.entry) {
    return { kind: "converted_title", keywordId: input.convertedTo.keywordId, keyword: input.convertedTo.keyword, hint: SUBJECT_ARTICLE_CONVERTED_HINT };
  }
  if (subject.declared) {
    const plan = subject.plan;
    const conversao = readSubjectConversion(input.semantic);
    const principal = plan?.declaredPrincipal ?? null;
    const carried = Boolean(principal && principal.keywordId === input.keywordId);
    const format: "cadastro" | "anterior" = subject.entry || carried ? "cadastro" : "anterior";
    const lockView = plan ? declaredPrincipalLock(plan, { subjectKeywordId: input.keywordId, volume: input.volume ?? null }) : null;
    const lock = lockView ? lockOf(lockView) : subject.entry && !plan ? (input.published ? PUBLISHED_PAGE_LOCK : KEYWORD_SUBJECT_LOCK) : null;
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
      ...(conversao && subject.entry ? { convertedFrom: { keywordId: conversao.fromKeywordId, phrase: conversao.fromPhrase } } : {}),
    };
  }

  const mark = resolveDeclaredPrincipal(input.semantic).mark;
  if (!mark) return null;
  if (mark.subjectKeywordId === input.keywordId) {
    // 2026-10-13 · "o Assunto nunca se perde": quando saiu, por onde, e o caminho de volta (as linhas vêm do histórico).
    const group = groupOf(mark.groupId);
    const loss = recoverSubjectFromHistory({ keywordId: input.keywordId, keyword: input.keyword, semantic: input.semantic, groupId: mark.groupId })?.loss ?? null;
    const colorLabel = group && isEditorialGroupColor(group.color) ? EDITORIAL_GROUP_COLOR_LABELS[group.color] : group?.name ?? null;
    return {
      kind: "orphan_mark",
      lastTitle: lastHistoryTitle(input.semantic),
      groupId: mark.groupId,
      group,
      hint: subjectRestoreHint({ loss, colorLabel }),
      lostAt: loss?.at ?? null,
      lostOrigin: loss?.origin ?? null,
    };
  }
  // 2026-10-13 · com a linha do Assunto em mãos, a trava, o papel e a ordem são os do artigo (a mesma leitura do Arquiteto).
  const subjectSemantic = input.subjectSemanticOf ? input.subjectSemanticOf(mark.subjectKeywordId) : null;
  const ofSubject = subjectSemantic ? resolveKeywordSubject(subjectSemantic) : null;
  const subjectPlan = ofSubject?.declared && ofSubject.plan && ofSubject.plan.declaredPrincipal?.keywordId === input.keywordId ? ofSubject.plan : null;
  const subjectLock = subjectPlan ? declaredPrincipalLock(subjectPlan, { subjectKeywordId: mark.subjectKeywordId, volume: null }) : null;
  return {
    kind: "principal_of_subject",
    subjectKeywordId: mark.subjectKeywordId,
    subjectTitle: ofSubject?.entry?.title || (input.keywordTextOf ? input.keywordTextOf(mark.subjectKeywordId) : null),
    groupId: mark.groupId,
    group: groupOf(mark.groupId),
    lock: subjectLock
      ? lockOf(subjectLock)
      : { state: "locked", label: "Principal declarada · plano anterior", reason: "A trava é a do Assunto, na linha dele; no plano anterior ao cadastro único ela fica fixa até você mudar no card." },
    hint: SUBJECT_ARTICLE_PRINCIPAL_HINT,
    ...(subjectPlan ? { role: subjectPlan.role, order: subjectPlan.order } : {}),
  };
}

/**
 * O ASSUNTO NUMA LINHA (pedido do dono, 2026-10-13: "assuntos não estão no
 * cabeçalho no painel, lá no minerador"). O cabeçalho do Perfil da keyword e a
 * linha da planilha do Processador identificam o artigo sem abrir o bloco
 * "Assunto deste artigo": o título, o papel/posição e a cor do grupo. Quando o
 * Assunto foi retirado e a marca de principal ficou, a linha diz isso, curta.
 * Lê a mesma `SubjectArticleView`; nada é recalculado.
 */
export type SubjectHeadline = {
  kind: SubjectArticleView["kind"];
  /** O título do artigo (o Assunto); `null` quando não há (marca órfã sem histórico). */
  title: string | null;
  /** "Pilar · artigo 1"; `null` sem plano. */
  position: string | null;
  group: SubjectArticleGroup;
  /** A frase da linha: "Assunto: …", "Assunto retirado desta keyword …", "Linha-título convertida → …". */
  text: string;
  /** Tom: o Assunto vivo é informação; a marca órfã e a linha convertida são aviso. */
  tone: "subject" | "warning" | "muted";
};

export function subjectHeadline(view: SubjectArticleView | null | undefined): SubjectHeadline | null {
  if (!view) return null;
  if (view.kind === "subject") {
    const position = subjectArticlePositionLabel(view);
    return { kind: view.kind, title: view.title, position, group: view.group, text: `Assunto: ${view.title}`, tone: "subject" };
  }
  if (view.kind === "principal_of_subject") {
    const position = subjectArticlePositionLabel({ role: view.role ?? null, order: view.order ?? null });
    const title = view.subjectTitle?.trim() || null;
    return { kind: view.kind, title, position, group: view.group, text: title ? `Assunto: ${title}` : "Principal declarada de um Assunto em outra linha", tone: "subject" };
  }
  if (view.kind === "orphan_mark") {
    const text = view.lastTitle
      ? `Assunto retirado desta keyword (era “${view.lastTitle}”); a marca de principal do grupo continua.`
      : "Assunto retirado desta keyword; a marca de principal do grupo continua.";
    return { kind: view.kind, title: view.lastTitle, position: null, group: view.group, text, tone: "warning" };
  }
  return { kind: view.kind, title: null, position: null, group: null, text: `Linha-título convertida → ${view.keyword ?? view.keywordId}`, tone: "muted" };
}

/** "Pilar · artigo 1", "Suporte · artigo 4", ou `null` sem plano. */
export function subjectArticlePositionLabel(view: { role: DeclaredPlanRole | null; order: number | null }): string | null {
  if (!view.role && !view.order) return null;
  return [view.role, view.order ? `artigo ${view.order}` : null].filter(Boolean).join(" · ");
}
