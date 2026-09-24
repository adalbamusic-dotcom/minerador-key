import { resolveApprovalReadiness } from "./approved-package.ts";
import { KEYWORD_PAGE_TYPES, keywordPageTypeLabel, type KeywordPageType } from "./keyword-page-type.ts";
import {
  KEYWORD_SUBJECT_ACTOR_KEY,
  KEYWORD_SUBJECT_AT_KEY,
  KEYWORD_SUBJECT_HISTORY_KEY,
  KEYWORD_SUBJECT_KEY,
  KEYWORD_SUBJECT_ORIGIN_KEY,
} from "./keyword-subject.ts";
import { primaryPostLabel } from "./primary-keyword-policy.ts";
import { SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE } from "./subject-destination.ts";
import {
  vinculoBatchReadbackMatches,
  type VinculoBatchAction,
  type VinculoBatchPlan,
  type VinculoBatchReadbackRow,
  type VinculoBatchUpdate,
} from "./vinculo-batch.ts";

/**
 * O QUE A TELA DO PROCESSADOR PRECISA DIZER SOBRE O VÍNCULO
 * (SDD 2026-09-24, F1.4, F1.5, F1.6 e F1.7b).
 *
 * O plano do lote (`vinculo-batch.ts`) decide o que gravar. Este módulo só
 * traduz esse plano para a tela: as escolhas do select "Vínculo", o texto da
 * confirmação, os avisos de rebaixamento, a conferência do readback estreito e
 * quais keywords ainda precisam da Lógica automática.
 *
 * Domínio puro. Não grava, não busca, não chama provider.
 */

type Semantic = Record<string, unknown>;

export type VinculoBatchChoiceGroupKey = "subject" | "page_type" | "post";

export type VinculoBatchChoice = { value: string; label: string };

export type VinculoBatchChoiceGroup = {
  key: VinculoBatchChoiceGroupKey;
  label: string;
  options: readonly VinculoBatchChoice[];
};

const SUBJECT_DECLARE_CHOICE = "subject:declare";
const SUBJECT_WITHDRAW_CHOICE = "subject:withdraw";
const PAGE_TYPE_CHOICE_PREFIX = "page_type:";
const POST_LOCKED_CHOICE = "post:locked";
const POST_FREE_CHOICE = "post:reviewable";

/**
 * As três escolhas em grupo do rodapé (F1.6). Ficam FORA, por decisão do dono
 * (Q5): reabrir a revisão, conferir por link e confirmar publicada/desvincular.
 * Nota e destino não são escolha: o "Declarar" os pede, opcionais e iguais
 * para o lote.
 */
export const VINCULO_BATCH_CHOICE_GROUPS: readonly VinculoBatchChoiceGroup[] = [
  {
    key: "subject",
    label: "Assunto",
    options: [
      { value: SUBJECT_DECLARE_CHOICE, label: "Declarar Assunto" },
      { value: SUBJECT_WITHDRAW_CHOICE, label: "Retirar Assunto" },
    ],
  },
  {
    key: "page_type",
    label: "Tipo de página",
    options: KEYWORD_PAGE_TYPES.map(pageType => ({ value: `${PAGE_TYPE_CHOICE_PREFIX}${pageType}`, label: keywordPageTypeLabel(pageType) })),
  },
  {
    key: "post",
    label: "Posto (só publicadas)",
    options: [
      { value: POST_LOCKED_CHOICE, label: primaryPostLabel("locked") },
      { value: POST_FREE_CHOICE, label: primaryPostLabel("free") },
    ],
  },
];

export function isSubjectDeclareChoice(choice: string | null | undefined): boolean {
  return choice === SUBJECT_DECLARE_CHOICE;
}

/** O valor do select vira a ação do plano. Valor desconhecido não vira ação. */
export function vinculoBatchActionFromChoice(
  choice: string | null | undefined,
  subject: { note?: string | null; destinationUrl?: string | null } = {},
): VinculoBatchAction | null {
  if (choice === SUBJECT_DECLARE_CHOICE) {
    const note = typeof subject.note === "string" && subject.note.trim() ? subject.note : null;
    const destinationUrl = typeof subject.destinationUrl === "string" && subject.destinationUrl.trim() ? subject.destinationUrl.trim() : null;
    return { kind: "subject_declare", note, destinationUrl };
  }
  if (choice === SUBJECT_WITHDRAW_CHOICE) return { kind: "subject_withdraw" };
  if (choice === POST_LOCKED_CHOICE) return { kind: "post", policy: "locked" };
  if (choice === POST_FREE_CHOICE) return { kind: "post", policy: "reviewable" };
  if (typeof choice === "string" && choice.startsWith(PAGE_TYPE_CHOICE_PREFIX)) {
    const pageType = choice.slice(PAGE_TYPE_CHOICE_PREFIX.length);
    if ((KEYWORD_PAGE_TYPES as readonly string[]).includes(pageType)) return { kind: "page_type", pageType: pageType as KeywordPageType };
  }
  return null;
}

type OkPlan = Extract<VinculoBatchPlan, { ok: true }>;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * O texto da confirmação: o que será gravado, o que será pulado e por quê, e
 * quantas aprovadas vão para Em revisão. `warning` é `null` sem aprovadas.
 */
export function describeVinculoBatchConfirmation(
  plan: OkPlan,
  options: { includeCatalogNotice?: boolean } = {},
): { summary: string; details: string[]; warning: string | null } {
  const summary = plan.counts.updates === 0
    ? `${plan.actionLabel}: nenhuma keyword da seleção muda.`
    : `${plan.actionLabel}: ${plural(plan.counts.updates, "keyword será gravada", "keywords serão gravadas")}.`;
  const details: string[] = [];
  if (plan.counts.already_declared > 0) {
    details.push(`${plural(plan.counts.already_declared, "já é Assunto e fica como está", "já são Assunto e ficam como estão")}: a nota e o destino de cada uma se trocam na Revisão Humana.`);
  }
  if (plan.counts.not_published > 0) {
    details.push(`${plural(plan.counts.not_published, "não publicada foi pulada", "não publicadas foram puladas")}: o posto só vale para publicadas.`);
  }
  if (plan.counts.unchanged > 0) {
    details.push(`${plural(plan.counts.unchanged, "já estava assim", "já estavam assim")}.`);
  }
  if (plan.counts.other_brand > 0) {
    details.push(`${plural(plan.counts.other_brand, "keyword de outra marca foi pulada", "keywords de outra marca foram puladas")}.`);
  }
  if (plan.counts.refused > 0) {
    const reason = plan.skipped.find(entry => entry.reason === "refused")?.detail;
    details.push(`${plural(plan.counts.refused, "foi recusada", "foram recusadas")}${reason ? `: ${reason}` : "."}`);
  }
  // F1.5 no plural: retirar o Assunto de aprovadas tira a dispensa da D2.
  if (plan.action.kind === "subject_withdraw" && plan.counts.approvedToReview > 0) {
    details.push(plan.counts.approvedToReview === 1 ? SUBJECT_WITHDRAW_APPROVED_BATCH_WARNING_ONE : SUBJECT_WITHDRAW_APPROVED_BATCH_WARNING_MANY);
  }
  // Na prévia o catálogo ainda não foi consultado: "fora do catálogo" seria palpite.
  const catalogNotice = plan.destinationNotice === SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE;
  if (plan.destinationNotice && (!catalogNotice || options.includeCatalogNotice !== false)) details.push(plan.destinationNotice);
  return { summary, details, warning: plan.demotionWarning };
}

/** A mensagem depois da gravação, com o que o readback confirmou. */
export function describeVinculoBatchResult(plan: OkPlan, confirmed: number): string {
  const skipped = plan.skipped.length;
  const base = `${plan.actionLabel}: ${plural(confirmed, "keyword gravada e conferida", "keywords gravadas e conferidas")}.`;
  const withSkipped = skipped > 0 ? `${base} ${plural(skipped, "foi pulada", "foram puladas")}.` : base;
  return plan.destinationNotice ? `${withSkipped} ${plan.destinationNotice}` : withSkipped;
}

/**
 * Conferência do readback estreito. O núcleo (`vinculoBatchReadbackMatches`)
 * já compara sem depender da ordem das chaves que o JSONB devolve; esta
 * função só existe para a tela ler uma porta com nome próprio.
 */
export function vinculoReadbackConfirmed(update: VinculoBatchUpdate, row: VinculoBatchReadbackRow | null | undefined): boolean {
  return vinculoBatchReadbackMatches(update, row);
}

/**
 * Lógica automática (F1.7b): quem, entre as keywords recém-declaradas, ainda
 * não tem a Lógica que a aprovação exige. O critério é o da própria trava
 * (`resolveApprovalReadiness`), para a tela e a aprovação não discordarem.
 */
export function keywordsWithoutLogic<T extends { intent?: string | null; analise_semantica?: Semantic | null }>(items: readonly T[]): T[] {
  return items.filter(item => resolveApprovalReadiness({ semantic: item.analise_semantica || {}, intent: item.intent }).missing.includes("logic"));
}

/**
 * As cinco chaves do Assunto de um `analise_semantica`. Serve para levar uma
 * declaração recém-gravada para a cópia de uma revisão aberta, que de outro
 * modo a apagaria ao concluir.
 */
export function pickKeywordSubjectKeys(semantic: Semantic | null | undefined): Semantic {
  const source = semantic || {};
  const keys = [KEYWORD_SUBJECT_KEY, KEYWORD_SUBJECT_ACTOR_KEY, KEYWORD_SUBJECT_AT_KEY, KEYWORD_SUBJECT_ORIGIN_KEY, KEYWORD_SUBJECT_HISTORY_KEY];
  return Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
}

/** F1.5: retirar o Assunto de uma aprovada. */
export const SUBJECT_WITHDRAW_APPROVED_WARNING =
  "Esta keyword foi aprovada como Assunto. Sem a declaração, aprovar exige Volume, Resultados e KGR, e o Arquiteto seguirá vendo o Assunto até lá." as const;

/** F1.5 em grupo: retirar o Assunto de aprovadas da seleção. */
export const SUBJECT_WITHDRAW_APPROVED_BATCH_WARNING_ONE =
  "A aprovada desta seleção foi aprovada como Assunto. Sem a declaração, aprovar exige Volume, Resultados e KGR, e o Arquiteto seguirá vendo o Assunto até lá." as const;
export const SUBJECT_WITHDRAW_APPROVED_BATCH_WARNING_MANY =
  "As aprovadas desta seleção foram aprovadas como Assunto. Sem a declaração, aprovar exige Volume, Resultados e KGR, e o Arquiteto seguirá vendo o Assunto até lá." as const;

/** F1.5: declarar (ou trocar nota e destino) numa aprovada. */
export const SUBJECT_DECLARE_APPROVED_WARNING =
  "Esta keyword está aprovada. Gravar o Assunto a leva para Em revisão; a reaprovação só exige a Lógica, e o Arquiteto segue com o pacote aprovado até lá." as const;

/** O aviso que a Revisão Humana mostra antes de confirmar; `null` quando não há o que avisar. */
export function subjectReviewWarning(input: { approved: boolean; currentlyDeclared: boolean; nextDeclared: boolean }): string | null {
  if (!input.approved) return null;
  if (input.currentlyDeclared && !input.nextDeclared) return SUBJECT_WITHDRAW_APPROVED_WARNING;
  if (input.nextDeclared) return SUBJECT_DECLARE_APPROVED_WARNING;
  return null;
}
