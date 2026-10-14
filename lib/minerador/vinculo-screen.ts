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
import { resolveKeywordVinculo, type KeywordVinculo, type KeywordVinculoInput } from "./keyword-vinculo.ts";
import type { DeclaredPlanLockChoice } from "./declared-plan.ts";
import { PLAN_LOCK_ARCHITECT_HINT, PLAN_LOCK_CADASTRO_REFUSAL, PLAN_LOCK_CHOICE_LABELS, PLAN_LOCK_CHOICE_ORDER } from "./keyword-plan-lock.ts";
import {
  KEYWORD_SUBJECT_ACTOR_KEY,
  KEYWORD_SUBJECT_AT_KEY,
  KEYWORD_SUBJECT_HISTORY_KEY,
  KEYWORD_SUBJECT_KEY,
  KEYWORD_SUBJECT_ORIGIN_KEY,
} from "./keyword-subject.ts";
import { primaryPostLabel } from "./primary-keyword-policy.ts";
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
 * (SDD 2026-09-24, F1.4–F1.7b; revisto em 2026-10-13).
 *
 * O plano do lote (`vinculo-batch.ts`) decide o que gravar. Este módulo só
 * traduz esse plano para a tela: as escolhas dos selects, o texto da
 * confirmação, os avisos de rebaixamento e a conferência do readback estreito.
 *
 * 2026-10-13 (pedido do dono): o Vínculo tem DUAS escolhas — Posto de principal
 * e Potencial de página. O Assunto saiu da coluna, dos selects e do resumo: ele
 * mora dentro da keyword e entra só por "Cadastrar Assuntos"; o painel da
 * keyword o mostra só leitura (`subject-article-view.ts`).
 *
 * Domínio puro. Não grava, não busca, não chama provider.
 */

type Semantic = Record<string, unknown>;

export type VinculoBatchChoiceGroupKey = "page_type" | "post";

/** `section` agrupa a opção num `<optgroup>` (Potencial · Declarado). */
export type VinculoBatchChoice = { value: string; label: string; section?: string };

export type VinculoBatchChoiceGroup = {
  key: VinculoBatchChoiceGroupKey;
  /** Nome inteiro: "Posto de principal", "Potencial de página". */
  label: string;
  /** O que o select fechado mostra no rodapé, onde o espaço é curto. */
  shortLabel: string;
  ariaLabel: string;
  title: string;
  options: readonly VinculoBatchChoice[];
};

const PAGE_TYPE_CHOICE_PREFIX = "page_type:";
const POST_LOCKED_CHOICE = "post:locked";
const POST_FREE_CHOICE = "post:reviewable";
/** 2026-10-13 · "Automática (pelo volume)": a trava do cadastro volta a seguir o volume (só keyword do plano). */
const POST_AUTO_CHOICE = "post:auto";

/**
 * Os dois grupos do seletor "Vínculo" do rodapé. Cada grupo tem valores
 * próprios e pode ficar sem escolha; "Aplicar" grava as escolhas feitas de
 * uma vez. O KGR fica ao lado, com plano próprio.
 *
 * Ficam FORA, por decisão do dono (Q5): reabrir a revisão, conferir por link
 * e confirmar publicada/desvincular. E, desde 2026-10-13, o Assunto.
 */
export const VINCULO_BATCH_CHOICE_GROUPS: readonly VinculoBatchChoiceGroup[] = [
  {
    key: "post",
    label: "Posto de principal",
    shortLabel: "Posto",
    ariaLabel: "Posto de principal das selecionadas",
    title: "Posto de principal das selecionadas: na publicada, Travado ao slug ou Livre; na não publicada do plano, a trava do cadastro (Travada, Livre ou Automática). Sem plano, travar é recusado por item.",
    options: [
      { value: POST_LOCKED_CHOICE, label: primaryPostLabel("locked") },
      { value: POST_FREE_CHOICE, label: primaryPostLabel("free") },
      { value: POST_AUTO_CHOICE, label: PLAN_LOCK_CHOICE_LABELS.auto },
    ],
  },
  {
    key: "page_type",
    label: "Potencial de página",
    shortLabel: "Potencial",
    ariaLabel: "Potencial de página das selecionadas",
    title: "Potencial de página das selecionadas: potencial (pode ser) ou declarado (vai ser, travado).",
    options: keywordPageTypeChoices().map(choice => ({
      value: `${PAGE_TYPE_CHOICE_PREFIX}${choice.value}`,
      label: choice.label,
      section: choice.stance === "declared" ? "Declarado" : "Potencial",
    })),
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

/** A escolha de cada grupo do painel; `""` = sem escolha (não muda). */
export type VinculoBatchChoices = Record<VinculoBatchChoiceGroupKey, string>;

export const EMPTY_VINCULO_BATCH_CHOICES: VinculoBatchChoices = Object.freeze({ post: "", page_type: "" });

/** Marca a escolha de um grupo. */
export function applyVinculoBatchChoice<T extends VinculoBatchChoices>(choices: T, key: VinculoBatchChoiceGroupKey, value: string): T {
  const next: T = { ...choices };
  const groups: VinculoBatchChoices = next;
  groups[key] = value;
  return next;
}

/**
 * OS SELECTS DO VÍNCULO, UM VOCABULÁRIO SÓ (pedido do dono, 2026-09-24).
 *
 * O card REVISÃO HUMANA e o painel "Vínculo das selecionadas" do rodapé
 * mostram os mesmos selects, com os mesmos rótulos e valores: Posto de
 * principal (Livre · Travado ao slug) e Potencial de página (8 escolhas; na
 * publicada, as 4 declaradas). Não existe "Não mudar": em grupo, cada select
 * mostra o valor comum das selecionadas e, se elas divergem, o marcador
 * desabilitado "Valores diferentes", que não é valor gravável. Só o select
 * que o humano mudou vira ação do plano.
 */
export type VinculoSelectValues = Record<VinculoBatchChoiceGroupKey, string>;

/** O marcador de "Valores diferentes": valor do `<select>`, nunca escolha. */
export const VINCULO_MIXED_VALUE = "__mixed__" as const;
export const VINCULO_MIXED_LABEL = "Valores diferentes" as const;

export const VINCULO_POST_SELECT_OPTIONS: readonly { value: "reviewable" | "locked"; label: string }[] = [
  { value: "reviewable", label: primaryPostLabel("free") },
  { value: "locked", label: primaryPostLabel("locked") },
];

/**
 * 2026-10-13 · O POSTO DA NÃO PUBLICADA É A TRAVA DO CADASTRO (pedido do dono).
 * Os mesmos valores do select do posto (`locked`, `reviewable` = Livre) e mais
 * `auto`; os rótulos dizem o que a trava faz no artigo.
 */
export const VINCULO_PLAN_LOCK_SELECT_OPTIONS: readonly { value: "locked" | "reviewable" | "auto"; label: string }[] = PLAN_LOCK_CHOICE_ORDER.map(choice => ({
  value: postValueOfPlanLockChoice(choice),
  label: PLAN_LOCK_CHOICE_LABELS[choice],
}));

/** Em grupo, publicadas e não publicadas juntas: o mesmo valor serve aos dois postos. */
export const VINCULO_MIXED_POST_SELECT_OPTIONS: readonly { value: "locked" | "reviewable" | "auto"; label: string }[] = [
  { value: "locked", label: "Travada (ao slug na publicada; no artigo na do plano)" },
  { value: "reviewable", label: "Livre" },
  { value: "auto", label: `${PLAN_LOCK_CHOICE_LABELS.auto} · só keyword do plano` },
];

/** A escolha da trava vira o valor do select do posto. */
export function postValueOfPlanLockChoice(choice: DeclaredPlanLockChoice): "locked" | "reviewable" | "auto" {
  return choice === "free" ? "reviewable" : choice;
}

/** O valor do select do posto vira a escolha da trava (só na não publicada). */
export function planLockChoiceOfPostValue(value: string): DeclaredPlanLockChoice | null {
  return value === "locked" ? "locked" : value === "reviewable" ? "free" : value === "auto" ? "auto" : null;
}

/** Que select do posto a keyword (ou o grupo) mostra: o da publicação, a trava do plano, ou os dois juntos. */
export type VinculoPostMode = "slug" | "plan" | "mixed";

/** Os valores que os selects mostram para uma keyword, lidos do resolvedor. */
export function vinculoSelectValues(vinculo: KeywordVinculo): VinculoSelectValues {
  return {
    // Na não publicada (com contexto do plano), o posto é a trava: sem plano, Livre.
    post: vinculo.planLock
      ? vinculo.planLock.kind === "plan" ? postValueOfPlanLockChoice(vinculo.planLock.choice) : "reviewable"
      : vinculo.postSelectValue,
    page_type: keywordPageTypeChoiceValue(vinculo.pageType.type, keywordPageTypeStance(vinculo.pageType)),
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
  /** 2026-10-13 · com o contexto do plano: que select do posto o painel mostra. */
  postMode?: VinculoPostMode;
};

export function commonVinculoSelectValues(
  items: readonly { id?: string; status?: string | null; analise_semantica?: Semantic | null }[],
  /** 2026-10-13 · o contexto da trava do cadastro de cada linha (a tela do Minerador). Sem ele, o de antes. */
  planOf?: (item: { id?: string; status?: string | null; analise_semantica?: Semantic | null }) => KeywordVinculoInput["plan"],
): VinculoBatchCommonValues {
  const common: VinculoBatchCommonValues = { post: null, page_type: null, publishedOnly: items.length > 0 };
  let slug = 0;
  let plan = 0;
  items.forEach((item, index) => {
    const vinculo = resolveKeywordVinculo({ status: item.status, semantic: item.analise_semantica, ...(planOf ? { plan: planOf(item) } : {}) });
    if (!vinculo.publicationDeclared) common.publishedOnly = false;
    if (vinculo.planLock) plan += 1; else slug += 1;
    const values = vinculoSelectValues(vinculo);
    for (const group of VINCULO_BATCH_CHOICE_GROUPS) {
      if (index === 0) common[group.key] = values[group.key];
      else if (common[group.key] !== values[group.key]) common[group.key] = null;
    }
  });
  if (planOf) common.postMode = plan && slug ? "mixed" : plan ? "plan" : "slug";
  return common;
}

/** O valor do select vira a escolha do plano; o marcador e valor desconhecido viram `""`. */
export function vinculoSelectToBatchChoice(key: VinculoBatchChoiceGroupKey, value: string): string {
  if (key === "post") return value === "locked" ? POST_LOCKED_CHOICE : value === "reviewable" ? POST_FREE_CHOICE : value === "auto" ? POST_AUTO_CHOICE : "";
  return parseKeywordPageTypeChoice(value) ? `${PAGE_TYPE_CHOICE_PREFIX}${value}` : "";
}

/** A escolha do plano vira o valor do select; sem escolha, `null`. */
export function vinculoBatchChoiceToSelect(key: VinculoBatchChoiceGroupKey, choice: string): string | null {
  if (!choice) return null;
  if (key === "post") return choice === POST_LOCKED_CHOICE ? "locked" : choice === POST_FREE_CHOICE ? "reviewable" : choice === POST_AUTO_CHOICE ? "auto" : null;
  return choice.startsWith(PAGE_TYPE_CHOICE_PREFIX) ? choice.slice(PAGE_TYPE_CHOICE_PREFIX.length) : null;
}

/** O que o select do painel mostra: a mudança do humano, senão o valor comum, senão "Valores diferentes". */
export function vinculoBatchSelectValue(key: VinculoBatchChoiceGroupKey, choices: Partial<VinculoBatchChoices>, common: VinculoBatchCommonValues): string {
  return vinculoBatchChoiceToSelect(key, choices[key] ?? "") ?? common[key] ?? VINCULO_MIXED_VALUE;
}

/**
 * O humano mudou um select do painel. Voltar ao valor comum desfaz a mudança
 * (nada a gravar nesse select, como na Revisão, onde o mesmo valor não
 * dispara gravação); o marcador nunca é escolha.
 */
export function chooseVinculoBatchSelect<T extends VinculoBatchChoices>(
  choices: T,
  key: VinculoBatchChoiceGroupKey,
  value: string,
  common: VinculoBatchCommonValues,
): T {
  if (value === VINCULO_MIXED_VALUE) return choices;
  const choice = value === common[key] ? "" : vinculoSelectToBatchChoice(key, value);
  return applyVinculoBatchChoice(choices, key, choice);
}

/**
 * As escolhas do painel viram as ações do plano, na ordem dos grupos. Grupo
 * sem escolha não vira ação; valor desconhecido invalida tudo (`null`), para
 * nada ser gravado pela metade.
 */
export function vinculoBatchActionsFromChoices(choices: Partial<VinculoBatchChoices>): VinculoBatchAction[] | null {
  const actions: VinculoBatchAction[] = [];
  for (const group of VINCULO_BATCH_CHOICE_GROUPS) {
    const value = choices[group.key] ?? "";
    if (!value) continue;
    if (!group.options.some(option => option.value === value)) return null;
    const action = vinculoBatchActionFromChoice(value);
    if (!action) return null;
    actions.push(action);
  }
  return actions;
}

/** O valor do select vira a ação do plano. Valor desconhecido (inclusive o antigo "subject:…") não vira ação. */
export function vinculoBatchActionFromChoice(choice: string | null | undefined): VinculoBatchAction | null {
  if (choice === POST_LOCKED_CHOICE) return { kind: "post", policy: "locked" };
  if (choice === POST_FREE_CHOICE) return { kind: "post", policy: "reviewable" };
  if (choice === POST_AUTO_CHOICE) return { kind: "post", policy: "auto" };
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
export function describeVinculoBatchConfirmation(plan: OkPlan): { summary: string; details: string[]; warning: string | null } {
  const writes = plan.counts.updates + (plan.counts.planLocks ?? 0);
  const summary = writes === 0
    ? `${plan.actionLabel}: nenhuma keyword da seleção muda.`
    : `${plan.actionLabel}: ${plural(writes, "keyword será gravada", "keywords serão gravadas")}.`;
  const details: string[] = [];
  // 2026-10-13 · na não publicada do plano, o posto é a trava do cadastro: grava pelo núcleo do cadastro.
  if ((plan.planLocks ?? []).length > 0) {
    const names = plan.planLocks.map(entry => `"${entry.keyword}" (${entry.fromLabel})`).join(", ");
    details.push(`${plural(plan.planLocks.length, "keyword do plano muda de trava", "keywords do plano mudam de trava")} pelo cadastro (nova versão do plano): ${names}. ${PLAN_LOCK_ARCHITECT_HINT}`);
  }
  // Recusa por item, com o nome e o motivo — nunca pulada em silêncio.
  const refused = plan.skipped.filter(entry => entry.reason === "no_plan");
  if (refused.length > 0) {
    const byReason = new Map<string, string[]>();
    for (const entry of refused) byReason.set(entry.detail ?? PLAN_LOCK_CADASTRO_REFUSAL, [...(byReason.get(entry.detail ?? PLAN_LOCK_CADASTRO_REFUSAL) ?? []), `"${entry.keyword}"`]);
    for (const [reason, names] of byReason) {
      details.push(`${plural(names.length, "recusada", "recusadas")} (${names.join(", ")}): ${reason}`);
    }
  }
  if (plan.counts.published_auto > 0) {
    details.push(`${plural(plan.counts.published_auto, "publicada foi pulada", "publicadas foram puladas")}: "Automática" vale só para a keyword do plano; na publicada escolha Travado ao slug ou Livre.`);
  }
  if (plan.counts.same_article > 0) {
    details.push(`${plural(plan.counts.same_article, "keyword é do mesmo artigo", "keywords são do mesmo artigo")} de outra selecionada: a trava é gravada uma vez.`);
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
  return { summary, details, warning: plan.demotionWarning };
}

/**
 * A confirmação das escolhas juntas: quantas keywords serão gravadas (uma
 * gravação por keyword), e o que cada escolha faz, pula e por quê. O aviso de
 * rebaixamento é o do conjunto, medido do estado de hoje ao final.
 */
export function describeVinculoBatchChoicesConfirmation(
  plan: Extract<VinculoBatchChoicesPlan, { ok: true }>,
): { summary: string; steps: { summary: string; details: string[] }[]; warning: string | null } {
  const writes = plan.counts.updates + (plan.counts.planLocks ?? 0);
  const summary = writes === 0
    ? "Nenhuma keyword da seleção muda."
    : `${plural(writes, "keyword será gravada", "keywords serão gravadas")}.`;
  const steps = plan.steps.map(step => {
    const text = describeVinculoBatchConfirmation(step);
    return { summary: text.summary, details: text.details };
  });
  return { summary, steps, warning: plan.demotionWarning };
}

/** A mensagem depois da gravação das escolhas juntas, com o que o readback confirmou. */
export function describeVinculoBatchChoicesResult(plan: Extract<VinculoBatchChoicesPlan, { ok: true }>, confirmed: number): string {
  return `${plan.actionLabel}: ${plural(confirmed, "keyword gravada e conferida", "keywords gravadas e conferidas")}.`;
}

/** A mensagem depois da gravação, com o que o readback confirmou. */
export function describeVinculoBatchResult(plan: OkPlan, confirmed: number): string {
  const skipped = plan.skipped.length;
  const base = `${plan.actionLabel}: ${plural(confirmed, "keyword gravada e conferida", "keywords gravadas e conferidas")}.`;
  return skipped > 0 ? `${base} ${plural(skipped, "foi pulada", "foram puladas")}.` : base;
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
 * Lógica automática (F1.7b): quem, entre as keywords recém-cadastradas, ainda
 * não tem a Lógica que a aprovação exige. O critério é o da própria trava
 * (`resolveApprovalReadiness`), para a tela e a aprovação não discordarem.
 */
export function keywordsWithoutLogic<T extends { intent?: string | null; analise_semantica?: Semantic | null }>(items: readonly T[]): T[] {
  return items.filter(item => resolveApprovalReadiness({ semantic: item.analise_semantica || {}, intent: item.intent }).missing.includes("logic"));
}

/**
 * As cinco chaves do Assunto de um `analise_semantica`. Serve para levar o
 * Assunto gravado para a cópia de uma revisão aberta, que de outro modo o
 * apagaria ao concluir.
 */
export function pickKeywordSubjectKeys(semantic: Semantic | null | undefined): Semantic {
  const source = semantic || {};
  const keys = [KEYWORD_SUBJECT_KEY, KEYWORD_SUBJECT_ACTOR_KEY, KEYWORD_SUBJECT_AT_KEY, KEYWORD_SUBJECT_ORIGIN_KEY, KEYWORD_SUBJECT_HISTORY_KEY];
  return Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
}
