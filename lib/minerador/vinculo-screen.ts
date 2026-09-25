import { resolveApprovalReadiness } from "./approved-package.ts";
import {
  KEYWORD_PAGE_TYPES,
  keywordPageTypeChoices,
  keywordPageTypeChoiceValue,
  keywordPageTypeStance,
  keywordPageTypeStanding,
  parseKeywordPageTypeChoice,
  type KeywordPageType,
} from "./keyword-page-type.ts";
import { resolveKeywordVinculo, type KeywordVinculo } from "./keyword-vinculo.ts";
import {
  KEYWORD_SUBJECT_ACTOR_KEY,
  KEYWORD_SUBJECT_AT_KEY,
  KEYWORD_SUBJECT_HISTORY_KEY,
  KEYWORD_SUBJECT_KEY,
  KEYWORD_SUBJECT_ORIGIN_KEY,
  resolveKeywordSubject,
} from "./keyword-subject.ts";
import { primaryPostLabel } from "./primary-keyword-policy.ts";
import { SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE } from "./subject-destination.ts";
import {
  vinculoBatchReadbackMatches,
  type VinculoBatchAction,
  type VinculoBatchChoicesPlan,
  type VinculoBatchPlan,
  type VinculoBatchReadbackRow,
  type VinculoBatchUpdate,
} from "./vinculo-batch.ts";

/**
 * O QUE A TELA DO PROCESSADOR PRECISA DIZER SOBRE O VÍNCULO
 * (SDD 2026-09-24, F1.4, F1.5, F1.6 e F1.7b).
 *
 * O plano do lote (`vinculo-batch.ts`) decide o que gravar. Este módulo só
 * traduz esse plano para a tela: as escolhas dos selects do rodapé, o texto da
 * confirmação, os avisos de rebaixamento, a conferência do readback estreito e
 * quais keywords ainda precisam da Lógica automática.
 *
 * Domínio puro. Não grava, não busca, não chama provider.
 */

type Semantic = Record<string, unknown>;

export type VinculoBatchChoiceGroupKey = "subject" | "page_type" | "post";

/** `section` agrupa a opção num `<optgroup>` (Potencial · Declarado). */
export type VinculoBatchChoice = { value: string; label: string; section?: string };

export type VinculoBatchChoiceGroup = {
  key: VinculoBatchChoiceGroupKey;
  /** Nome inteiro: "Posto de principal", "Potencial de página", "Assunto". */
  label: string;
  /** O que o select fechado mostra no rodapé, onde o espaço é curto. */
  shortLabel: string;
  ariaLabel: string;
  title: string;
  options: readonly VinculoBatchChoice[];
};

const SUBJECT_DECLARE_CHOICE = "subject:declare";
const SUBJECT_WITHDRAW_CHOICE = "subject:withdraw";
const PAGE_TYPE_CHOICE_PREFIX = "page_type:";
const POST_LOCKED_CHOICE = "post:locked";
const POST_FREE_CHOICE = "post:reviewable";

/**
 * Os três grupos do seletor "Vínculo" do rodapé (pedido do dono, 2026-09-24:
 * três selects separados poluíam o rodapé; voltou um seletor só, que abre um
 * painel com um grupo de escolha única para cada parte). Cada grupo tem
 * valores próprios e pode ficar sem escolha; "Aplicar" grava as escolhas
 * feitas de uma vez. O KGR fica ao lado, com plano próprio.
 *
 * Ficam FORA, por decisão do dono (Q5): reabrir a revisão, conferir por link
 * e confirmar publicada/desvincular. Nota e destino não são escolha: o
 * "Declarar" os pede, opcionais e iguais para o lote.
 */
export const VINCULO_BATCH_CHOICE_GROUPS: readonly VinculoBatchChoiceGroup[] = [
  {
    key: "post",
    label: "Posto de principal",
    shortLabel: "Posto",
    ariaLabel: "Posto de principal das selecionadas",
    title: "Posto de principal das selecionadas: Travado ao slug ou Livre. Só vale para publicadas; keyword com Assunto declarado é pulada.",
    options: [
      { value: POST_LOCKED_CHOICE, label: primaryPostLabel("locked") },
      { value: POST_FREE_CHOICE, label: primaryPostLabel("free") },
    ],
  },
  {
    key: "page_type",
    label: "Potencial de página",
    shortLabel: "Potencial",
    ariaLabel: "Potencial de página das selecionadas",
    title: "Potencial de página das selecionadas: potencial (pode ser) ou declarado (vai ser, travado). Vale também para Assunto.",
    options: keywordPageTypeChoices().map(choice => ({
      value: `${PAGE_TYPE_CHOICE_PREFIX}${choice.value}`,
      label: choice.label,
      section: choice.stance === "declared" ? "Declarado" : "Potencial",
    })),
  },
  {
    key: "subject",
    label: "Assunto",
    shortLabel: "Assunto",
    ariaLabel: "Assunto das selecionadas",
    title: "Declarar ou retirar o Assunto das selecionadas. Com Assunto, o KGR e o Posto não se aplicam; o Potencial de página continua valendo.",
    options: [
      { value: SUBJECT_DECLARE_CHOICE, label: "Declarado" },
      { value: SUBJECT_WITHDRAW_CHOICE, label: "Não" },
    ],
  },
];

/** As opções de um select em blocos: sem `section`, um bloco só, sem rótulo. */
export function vinculoBatchChoiceSections(group: VinculoBatchChoiceGroup): { label: string | null; options: VinculoBatchChoice[] }[] {
  const sections: { label: string | null; options: VinculoBatchChoice[] }[] = [];
  for (const option of group.options) {
    const label = option.section ?? null;
    const last = sections[sections.length - 1];
    if (last && last.label === label) last.options.push(option);
    else sections.push({ label, options: [option] });
  }
  return sections;
}

export function isSubjectDeclareChoice(choice: string | null | undefined): boolean {
  return choice === SUBJECT_DECLARE_CHOICE;
}

/** A escolha de cada grupo do painel; `""` = sem escolha (não muda). */
export type VinculoBatchChoices = Record<VinculoBatchChoiceGroupKey, string>;

export const EMPTY_VINCULO_BATCH_CHOICES: VinculoBatchChoices = Object.freeze({ post: "", page_type: "", subject: "" });

/** Por que o Posto fica desligado quando o Assunto mostrado é Declarado. */
export const VINCULO_BATCH_POST_DISABLED_BY_SUBJECT = "Com Assunto Declarado, o Posto de principal não se aplica." as const;

/** O grupo está desligado? Só o Posto, quando o Assunto marcado é "Declarar". */
export function vinculoBatchGroupDisabled(key: VinculoBatchChoiceGroupKey, choices: Partial<VinculoBatchChoices>): boolean {
  return key === "post" && isSubjectDeclareChoice(choices.subject);
}

/** Marca a escolha de um grupo; "Declarar Assunto" limpa o Posto, que deixa de valer. */
export function applyVinculoBatchChoice<T extends VinculoBatchChoices>(choices: T, key: VinculoBatchChoiceGroupKey, value: string): T {
  const next: T = { ...choices };
  const groups: VinculoBatchChoices = next;
  groups[key] = value;
  if (key === "subject" && isSubjectDeclareChoice(value)) groups.post = "";
  return next;
}

/**
 * OS TRÊS SELECTS DO VÍNCULO, UM VOCABULÁRIO SÓ (pedido do dono, 2026-09-24).
 *
 * O card REVISÃO HUMANA e o painel "Vínculo das selecionadas" do rodapé
 * mostram os mesmos três selects, com os mesmos rótulos e valores: Posto de
 * principal (Livre · Travado ao slug), Potencial de página (8 escolhas; na
 * publicada, as 4 declaradas) e Assunto (Não · Declarado). Não existe "Não
 * mudar": em grupo, cada select mostra o valor comum das selecionadas e, se
 * elas divergem, o marcador desabilitado "Valores diferentes", que não é
 * valor gravável. Só o select que o humano mudou vira ação do plano.
 */
export type VinculoSelectValues = Record<VinculoBatchChoiceGroupKey, string>;

/** O marcador de "Valores diferentes": valor do `<select>`, nunca escolha. */
export const VINCULO_MIXED_VALUE = "__mixed__" as const;
export const VINCULO_MIXED_LABEL = "Valores diferentes" as const;

export const VINCULO_POST_SELECT_OPTIONS: readonly { value: "reviewable" | "locked"; label: string }[] = [
  { value: "reviewable", label: primaryPostLabel("free") },
  { value: "locked", label: primaryPostLabel("locked") },
];

export const VINCULO_SUBJECT_SELECT_OPTIONS: readonly { value: "none" | "declared"; label: string }[] = [
  { value: "none", label: "Não" },
  { value: "declared", label: "Declarado" },
];

/** Os valores que os três selects mostram para uma keyword, lidos do resolvedor. */
export function vinculoSelectValues(vinculo: KeywordVinculo): VinculoSelectValues {
  return {
    post: vinculo.postSelectValue,
    page_type: keywordPageTypeChoiceValue(vinculo.pageType.type, keywordPageTypeStance(vinculo.pageType)),
    subject: vinculo.subject?.declared ? "declared" : "none",
  };
}

/**
 * Na publicada, o Potencial oferece só os 4 declarados. A publicada sem tipo
 * determinado (ninguém declarou e a página não disse se é Silo ou Artigo)
 * resolve como "Artigo · potencial", que não está entre eles: sem esta opção,
 * o navegador marcaria a primeira declarada, e o select diria "Artigo ·
 * declarado" enquanto a coluna diz "Artigo · potencial". O valor atual entra
 * como opção própria, com o rótulo da coluna, e escolher uma declarada passa
 * a ser mudança de verdade. `null` quando o valor já está entre as opções.
 */
export function vinculoPublishedCurrentPageTypeOption(currentValue: string | null | undefined, published: boolean): { value: string; label: string } | null {
  if (!published || !currentValue) return null;
  const parsed = parseKeywordPageTypeChoice(currentValue);
  if (!parsed || parsed.stance === "declared") return null;
  return { value: currentValue, label: keywordPageTypeStanding(parsed.pageType, { declared: false }) };
}

/** Valor comum das selecionadas em cada select; `null` quando divergem. */
export type VinculoBatchCommonValues = Record<VinculoBatchChoiceGroupKey, string | null> & {
  /** Todas publicadas: o Potencial mostra só os 4 declarados, como na Revisão. */
  publishedOnly: boolean;
};

export function commonVinculoSelectValues(
  items: readonly { status?: string | null; analise_semantica?: Semantic | null }[],
): VinculoBatchCommonValues {
  const common: VinculoBatchCommonValues = { post: null, page_type: null, subject: null, publishedOnly: items.length > 0 };
  items.forEach((item, index) => {
    const vinculo = resolveKeywordVinculo({ status: item.status, semantic: item.analise_semantica });
    if (!vinculo.publicationDeclared) common.publishedOnly = false;
    const values = vinculoSelectValues(vinculo);
    for (const group of VINCULO_BATCH_CHOICE_GROUPS) {
      if (index === 0) common[group.key] = values[group.key];
      else if (common[group.key] !== values[group.key]) common[group.key] = null;
    }
  });
  return common;
}

/** O valor do select vira a escolha do plano; o marcador e valor desconhecido viram `""`. */
export function vinculoSelectToBatchChoice(key: VinculoBatchChoiceGroupKey, value: string): string {
  if (key === "post") return value === "locked" ? POST_LOCKED_CHOICE : value === "reviewable" ? POST_FREE_CHOICE : "";
  if (key === "subject") return value === "declared" ? SUBJECT_DECLARE_CHOICE : value === "none" ? SUBJECT_WITHDRAW_CHOICE : "";
  return parseKeywordPageTypeChoice(value) ? `${PAGE_TYPE_CHOICE_PREFIX}${value}` : "";
}

/** A escolha do plano vira o valor do select; sem escolha, `null`. */
export function vinculoBatchChoiceToSelect(key: VinculoBatchChoiceGroupKey, choice: string): string | null {
  if (!choice) return null;
  if (key === "post") return choice === POST_LOCKED_CHOICE ? "locked" : choice === POST_FREE_CHOICE ? "reviewable" : null;
  if (key === "subject") return choice === SUBJECT_DECLARE_CHOICE ? "declared" : choice === SUBJECT_WITHDRAW_CHOICE ? "none" : null;
  return choice.startsWith(PAGE_TYPE_CHOICE_PREFIX) ? choice.slice(PAGE_TYPE_CHOICE_PREFIX.length) : null;
}

/** O que o select do painel mostra: a mudança do humano, senão o valor comum, senão "Valores diferentes". */
export function vinculoBatchSelectValue(key: VinculoBatchChoiceGroupKey, choices: Partial<VinculoBatchChoices>, common: VinculoBatchCommonValues): string {
  return vinculoBatchChoiceToSelect(key, choices[key] ?? "") ?? common[key] ?? VINCULO_MIXED_VALUE;
}

/**
 * O Posto fica desligado quando o Assunto que o painel mostra é Declarado —
 * escolhido agora ou comum a todas —, como na Revisão Humana.
 */
export function vinculoBatchPostDisabled(choices: Partial<VinculoBatchChoices>, common: VinculoBatchCommonValues): boolean {
  return vinculoBatchSelectValue("subject", choices, common) === "declared";
}

/**
 * O humano mudou um select do painel. Voltar ao valor comum desfaz a mudança
 * (nada a gravar nesse select, como na Revisão, onde o mesmo valor não
 * dispara gravação); o marcador nunca é escolha; e, se o Assunto mostrado
 * passa a ser Declarado, o Posto volta a não ter escolha.
 */
export function chooseVinculoBatchSelect<T extends VinculoBatchChoices>(
  choices: T,
  key: VinculoBatchChoiceGroupKey,
  value: string,
  common: VinculoBatchCommonValues,
): T {
  if (value === VINCULO_MIXED_VALUE) return choices;
  const choice = value === common[key] ? "" : vinculoSelectToBatchChoice(key, value);
  const next = applyVinculoBatchChoice(choices, key, choice);
  const groups: VinculoBatchChoices = next;
  if (vinculoBatchPostDisabled(next, common)) groups.post = "";
  return next;
}

/**
 * As escolhas do painel viram as ações do plano, na ordem dos grupos. Grupo
 * sem escolha não vira ação; o Posto desligado pelo Assunto é ignorado; valor
 * desconhecido invalida tudo (`null`), para nada ser gravado pela metade.
 */
export function vinculoBatchActionsFromChoices(
  choices: Partial<VinculoBatchChoices>,
  subject: { note?: string | null; destinationUrl?: string | null } = {},
): VinculoBatchAction[] | null {
  const actions: VinculoBatchAction[] = [];
  for (const group of VINCULO_BATCH_CHOICE_GROUPS) {
    const value = choices[group.key] ?? "";
    if (!value || vinculoBatchGroupDisabled(group.key, choices)) continue;
    if (!group.options.some(option => option.value === value)) return null;
    const action = vinculoBatchActionFromChoice(value, subject);
    if (!action) return null;
    actions.push(action);
  }
  return actions;
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
    const rest = choice.slice(PAGE_TYPE_CHOICE_PREFIX.length);
    // `page_type:silo` (contrato anterior) continua sendo o tipo sem peso.
    if ((KEYWORD_PAGE_TYPES as readonly string[]).includes(rest)) return { kind: "page_type", pageType: rest as KeywordPageType };
    const parsed = parseKeywordPageTypeChoice(rest);
    if (parsed) return { kind: "page_type", pageType: parsed.pageType, stance: parsed.stance };
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
  if (plan.counts.subject_declared > 0) {
    details.push(`${plural(plan.counts.subject_declared, "keyword é Assunto e foi pulada", "keywords são Assunto e foram puladas")}: o posto não se aplica a Assunto.`);
  }
  if (plan.counts.not_published > 0) {
    details.push(`${plural(plan.counts.not_published, "não publicada foi pulada", "não publicadas foram puladas")}: o posto só vale para publicadas.`);
  }
  if (plan.counts.published_potential > 0) {
    details.push(`${plural(plan.counts.published_potential, "publicada foi pulada", "publicadas foram puladas")}: na publicada o tipo já é declarado pela publicação; use a opção declarada.`);
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

/**
 * A confirmação das escolhas juntas: quantas keywords serão gravadas (uma
 * gravação por keyword), e o que cada escolha faz, pula e por quê. O aviso de
 * rebaixamento é o do conjunto, medido do estado de hoje ao final.
 */
export function describeVinculoBatchChoicesConfirmation(
  plan: Extract<VinculoBatchChoicesPlan, { ok: true }>,
  options: { includeCatalogNotice?: boolean } = {},
): { summary: string; steps: { summary: string; details: string[] }[]; warning: string | null } {
  const summary = plan.counts.updates === 0
    ? "Nenhuma keyword da seleção muda."
    : `${plural(plan.counts.updates, "keyword será gravada", "keywords serão gravadas")}.`;
  const steps = plan.steps.map(step => {
    const text = describeVinculoBatchConfirmation(step, options);
    return { summary: text.summary, details: text.details };
  });
  return { summary, steps, warning: plan.demotionWarning };
}

/** A mensagem depois da gravação das escolhas juntas, com o que o readback confirmou. */
export function describeVinculoBatchChoicesResult(plan: Extract<VinculoBatchChoicesPlan, { ok: true }>, confirmed: number): string {
  const base = `${plan.actionLabel}: ${plural(confirmed, "keyword gravada e conferida", "keywords gravadas e conferidas")}.`;
  return plan.destinationNotice ? `${base} ${plan.destinationNotice}` : base;
}

/** A mensagem depois da gravação, com o que o readback confirmou. */
export function describeVinculoBatchResult(plan: OkPlan, confirmed: number): string {
  const skipped = plan.skipped.length;
  const base = `${plan.actionLabel}: ${plural(confirmed, "keyword gravada e conferida", "keywords gravadas e conferidas")}.`;
  const withSkipped = skipped > 0 ? `${base} ${plural(skipped, "foi pulada", "foram puladas")}.` : base;
  return plan.destinationNotice ? `${withSkipped} ${plan.destinationNotice}` : withSkipped;
}

/**
 * KGR em grupo com Assunto na seleção: o Assunto anula o KGR (não tem busca a
 * medir), então essas keywords saem do lote antes do plano do KGR e o aviso
 * diz quantas foram puladas.
 */
export function partitionSubjectKeywords<T extends { analise_semantica?: Semantic | null }>(items: readonly T[]): { eligible: T[]; subjects: T[] } {
  const eligible: T[] = [];
  const subjects: T[] = [];
  for (const item of items) (resolveKeywordSubject(item.analise_semantica).declared ? subjects : eligible).push(item);
  return { eligible, subjects };
}

/** O aviso das puladas por serem Assunto; `null` sem nenhuma. */
export function describeSubjectSkipped(count: number, what: "KGR" | "posto"): string | null {
  if (count <= 0) return null;
  const pulada = count === 1 ? "1 keyword é Assunto e foi pulada" : `${count} keywords são Assunto e foram puladas`;
  return `${pulada}: o ${what} não se aplica a Assunto.`;
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
