import {
  declaredPrincipalLock,
  type DeclaredArticlePlan,
  type DeclaredPlanLock,
  type DeclaredPlanLockChoice,
  type DeclaredPlanRole,
  type DeclaredPrincipalLockOrigin,
} from "./declared-plan.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import { resolveDeclaredPrincipal, resolveKeywordSubject } from "./keyword-subject.ts";
import { deriveProcessorRevalidation } from "./processor-revalidation.ts";
import { describeDeclaredPrincipalLock } from "./subject-article-view.ts";

/**
 * O POSTO DE PRINCIPAL DA KEYWORD NÃO PUBLICADA = A TRAVA DO CADASTRO
 * (pedido do dono, 2026-10-13: "no minerador eu coloco como [Travado ao slug] e
 * ele não aceita").
 *
 * Havia dois conceitos com o mesmo papel: o "Posto de principal" (Livre ·
 * Travado ao slug), que só vale para PUBLICADAS, e a trava do cadastro
 * (`keyword_subject.plan.lock`, SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`
 * §3.3), que diz se a keyword do plano é a principal fixa do artigo. A
 * unificação:
 *
 *   - PUBLICADA: o posto continua o de sempre (Travado ao slug · Livre);
 *     este módulo devolve `null`;
 *   - NÃO PUBLICADA que carrega o plano (o Assunto na própria keyword, ou a
 *     principal do formato anterior pela marca recíproca): o select é a TRAVA —
 *     Travada · Livre · Automática (pelo volume), com o valor efetivo e o porquê,
 *     lidos por `declaredPrincipalLock` (a mesma leitura do Arquiteto);
 *   - NÃO PUBLICADA sem plano: livre, e travar é recusado com a frase clara
 *     "Para travar, cadastre o artigo em Cadastrar Assuntos." — nunca em
 *     silêncio.
 *
 * Gravar a trava é do núcleo do cadastro (`setKeywordPlanLockWithCore`, que
 * passa por `importDeclaredPlanWithCore`): nova versão do plano quando muda,
 * releitura. Este módulo é domínio puro: não grava, não busca.
 */

type Semantic = Record<string, unknown>;

export const PLAN_LOCK_CADASTRO_REFUSAL = "Para travar, cadastre o artigo em Cadastrar Assuntos." as const;
export const PLAN_LOCK_ORPHAN_REFUSAL = "O Assunto foi retirado desta keyword e a marca de principal ficou sem o artigo. Para travar, cadastre o artigo de novo em Cadastrar Assuntos → Silo existente (a keyword já está no grupo)." as const;
export const PLAN_LOCK_NO_PRINCIPAL_REFUSAL = "Este artigo do plano não tem keyword principal declarada. Para travar, cadastre a keyword do artigo em Cadastrar Assuntos → Silo existente." as const;
export const PLAN_LOCK_SUBJECT_MISSING_REFUSAL = "O Assunto deste artigo mora em outra linha que não foi encontrada nesta marca. Para travar, cadastre o artigo em Cadastrar Assuntos → Silo existente." as const;
export const PLAN_LOCK_PUBLISHED_REFUSAL = "Keyword publicada: o posto dela é o da publicação (Travado ao slug ou Livre), não a trava do plano." as const;
/** O que muda no Arquiteto e o que o dono faz para ele ver (a trava mora no pacote aprovado). */
export const PLAN_LOCK_ARCHITECT_HINT = "A trava entra no pacote aprovado: a keyword aprovada volta a \"Em revisão\". Para o Arquiteto ver a trava nova, reaprove (só pede a Lógica) e envie de novo ao Arquiteto." as const;

/** As escolhas do select, na ordem da tela. "Automática" não grava trava: segue o volume medido. */
export const PLAN_LOCK_CHOICE_LABELS: Record<DeclaredPlanLockChoice, string> = {
  locked: "Travada (principal fixa no artigo)",
  free: "Livre (o Arquiteto pode trocar)",
  auto: "Automática (pelo volume)",
};
export const PLAN_LOCK_CHOICE_ORDER: readonly DeclaredPlanLockChoice[] = ["locked", "free", "auto"];

export type KeywordPlanLock =
  | {
    kind: "plan";
    keywordId: string;
    /** A linha onde o plano mora: a própria keyword (cadastro único) ou a do Assunto (formato anterior). */
    subjectKeywordId: string;
    /** A keyword que a trava protege (a principal declarada do artigo). */
    principalKeywordId: string;
    groupId: string;
    order: number;
    role: DeclaredPlanRole;
    /** O título do artigo, quando a leitura o tem. */
    title: string | null;
    /** O valor do select: o `plan.lock` gravado, ou "auto". */
    choice: DeclaredPlanLockChoice;
    state: DeclaredPlanLock;
    origin: DeclaredPrincipalLockOrigin;
    /** "Travada · pelo volume medido". */
    label: string;
    /** "Travada" ou "Livre": a coluna Vínculo. */
    shortLabel: "Travada" | "Livre";
    /** Por quê, numa frase. */
    reason: string;
  }
  | {
    kind: "no_plan";
    keywordId: string;
    /** A marca de principal ficou sem o Assunto (o "Assunto: Não" antigo). */
    orphan: boolean;
    /** A recusa, se alguém tentar travar. */
    reason: string;
  };

export type KeywordPlanLockInput = {
  keywordId: string;
  keyword?: string | null;
  status?: string | null;
  semantic?: Semantic | null;
  /** Volume desta keyword (`keywordLockVolume`): decide a trava automática quando o Assunto mora nela. */
  volume?: { validated: boolean; value: number | null } | null;
  /** O `analise_semantica` de outra keyword da marca (a linha do Assunto no formato anterior). */
  subjectSemanticOf?: (keywordId: string) => Semantic | null | undefined;
  /** O texto de outra keyword da marca (o título no formato anterior). */
  keywordTextOf?: (keywordId: string) => string | null | undefined;
};

/** O volume que decide a trava automática: o mesmo do núcleo do cadastro (Volume do Processador validado). */
export function keywordLockVolume(input: { semantic?: Semantic | null; volumeSearch?: number | null; resultsAllintitle?: number | null }): { validated: boolean; value: number | null } {
  const volume = deriveProcessorRevalidation({ semantic: input.semantic || {}, volumeSearch: input.volumeSearch ?? null, resultsAllintitle: input.resultsAllintitle ?? null }).volume;
  return { validated: volume.validated, value: typeof volume.value === "number" ? volume.value : typeof input.volumeSearch === "number" ? input.volumeSearch : null };
}

function planOf(semantic: Semantic | null | undefined): { plan: DeclaredArticlePlan; title: string | null } | null {
  const subject = resolveKeywordSubject(semantic);
  return subject.declared && subject.plan ? { plan: subject.plan, title: subject.entry?.title ?? null } : null;
}

/**
 * A trava da keyword NÃO publicada. `null` = publicada (o posto é o da
 * publicação). Sem plano, `no_plan` com a recusa.
 */
export function resolveKeywordPlanLock(input: KeywordPlanLockInput): KeywordPlanLock | null {
  const keywordId = String(input.keywordId || "");
  if (isKeywordPublished({ status: input.status, semantic: input.semantic })) return null;

  let subjectKeywordId = keywordId;
  let found = planOf(input.semantic);
  let title: string | null = found?.title ?? (found ? (input.keyword?.trim() || null) : null);
  if (!found) {
    const mark = resolveDeclaredPrincipal(input.semantic).mark;
    if (!mark) return { kind: "no_plan", keywordId, orphan: false, reason: PLAN_LOCK_CADASTRO_REFUSAL };
    if (mark.subjectKeywordId === keywordId) return { kind: "no_plan", keywordId, orphan: true, reason: PLAN_LOCK_ORPHAN_REFUSAL };
    const subjectSemantic = input.subjectSemanticOf ? input.subjectSemanticOf(mark.subjectKeywordId) : null;
    const ofSubject = subjectSemantic ? planOf(subjectSemantic) : null;
    if (!ofSubject || ofSubject.plan.declaredPrincipal?.keywordId !== keywordId) {
      return { kind: "no_plan", keywordId, orphan: Boolean(subjectSemantic), reason: subjectSemantic ? PLAN_LOCK_ORPHAN_REFUSAL : PLAN_LOCK_SUBJECT_MISSING_REFUSAL };
    }
    subjectKeywordId = mark.subjectKeywordId;
    found = ofSubject;
    title = ofSubject.title ?? (input.keywordTextOf?.(mark.subjectKeywordId)?.trim() || null);
  }

  const plan = found.plan;
  const view = declaredPrincipalLock(plan, { subjectKeywordId, volume: input.volume ?? null });
  if (!view) return { kind: "no_plan", keywordId, orphan: false, reason: PLAN_LOCK_NO_PRINCIPAL_REFUSAL };
  const described = describeDeclaredPrincipalLock(view);
  return {
    kind: "plan",
    keywordId,
    subjectKeywordId,
    principalKeywordId: view.keywordId,
    groupId: plan.groupId,
    order: plan.order,
    role: plan.role,
    title,
    choice: plan.lock ?? "auto",
    state: view.state,
    origin: view.origin,
    label: view.label,
    shortLabel: view.state === "locked" ? "Travada" : "Livre",
    reason: described.reason,
  };
}

/** A frase que acompanha o select: o valor efetivo e o porquê. */
export function keywordPlanLockHint(lock: KeywordPlanLock): string {
  return lock.kind === "plan"
    ? `Agora: ${lock.label}. ${lock.reason}`
    : lock.orphan
      ? `Livre: ${lock.reason}`
      : `Fora de plano: a keyword é livre. ${lock.reason}`;
}

export type PlanLockChange =
  | { ok: true; changed: false }
  | { ok: true; changed: true; from: DeclaredPlanLockChoice; to: DeclaredPlanLockChoice }
  | { ok: false; reason: string };

/** Pedir uma escolha: o que muda, ou a recusa clara (sem plano não há trava a gravar). */
export function planLockChange(lock: KeywordPlanLock, choice: DeclaredPlanLockChoice): PlanLockChange {
  if (lock.kind === "no_plan") {
    // Fora de plano a keyword já é livre: pedir "Livre" não muda nada; travar é recusado.
    return choice === "free" ? { ok: true, changed: false } : { ok: false, reason: lock.reason };
  }
  return lock.choice === choice ? { ok: true, changed: false } : { ok: true, changed: true, from: lock.choice, to: choice };
}
