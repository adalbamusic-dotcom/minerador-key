import { approvedPackageDiverged, type ApprovedPackageInput } from "./approved-package.ts";
import { isApprovedForArchitect } from "./editorial-status.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import {
  KEYWORD_PAGE_TYPES,
  KEYWORD_PAGE_TYPE_STANCES,
  keywordPageTypeLabel,
  keywordPageTypeStanding,
  setKeywordPageType,
  type KeywordPageType,
  type KeywordPageTypeStance,
} from "./keyword-page-type.ts";
import type { DeclaredPlanLockChoice } from "./declared-plan.ts";
import { keywordLockVolume, planLockChange, resolveKeywordPlanLock } from "./keyword-plan-lock.ts";
import { isKeywordSubjectActorId } from "./keyword-subject.ts";
import { resolveKeywordVinculo } from "./keyword-vinculo.ts";
import { readPublicationLink, readSiteOrigin } from "./publication-link.ts";
import { primaryPostLabel, setPrimaryKeywordPolicy } from "./primary-keyword-policy.ts";

/**
 * VÍNCULO EM GRUPO — o plano puro do seletor Vínculo do rodapé
 * (SDD 2026-09-24, F1.6; revisto em 2026-10-13: o Assunto saiu do Vínculo).
 *
 * Dois grupos de escolha única, todos humanos (o KGR fica ao lado, com plano próprio):
 *
 *   Posto de principal    publicada: Travado ao slug · Livre
 *                         não publicada: a TRAVA do cadastro (2026-10-13) —
 *                         Travada · Livre · Automática, gravada pelo núcleo do
 *                         cadastro; sem plano, travar é recusado por item
 *   Potencial de página   os 4 tipos × potencial/declarado (enum intacto)
 *
 * O ASSUNTO NÃO É MAIS DO VÍNCULO (pedido do dono, 2026-10-13: "na planilha já
 * não vai mais existir assuntos, só keywords e dentro dessas keywords estão os
 * assuntos"). A única porta é o card "Cadastrar Assuntos" (MCP
 * `declare_silo_plan`); tirar um artigo do plano é "Tirar do plano". As ações
 * antigas `subject_declare`/`subject_withdraw` continuam no tipo só para serem
 * RECUSADAS com `SUBJECT_ENTRY_MOVED` (resposta compatível, nunca 500): o
 * "Assunto: Não" do Vínculo retirava o Assunto do cadastro da keyword e
 * deixava a marca de principal órfã.
 *
 * A keyword que carrega Assunto é tratada como qualquer keyword: o Posto e o
 * Potencial valem para ela como para as outras.
 *
 * O plano não escreve nada. Ele diz o que gravar em cada `id` (sempre com o
 * `brand_id` da marca ativa), o que pular e por quê, e quantas aprovadas vão
 * para Em revisão — a assinatura do pacote cobre `analise_semantica`, então
 * qualquer declaração nova numa aprovada a rebaixa.
 *
 * Regras de lote, conservadoras:
 *
 *  - ator = `auth.users.id`; sem ele, nada é planejado (nunca e-mail, nunca
 *    "local-user");
 *  - keyword de outra marca é pulada, nunca escrita;
 *  - o posto da publicada grava `primary_keyword_policy` aqui; o da não
 *    publicada do plano vira pedido de trava (`planLocks`) ao núcleo do
 *    cadastro; o da não publicada sem plano é recusado por item, com o motivo;
 *  - o Potencial "potencial" não vale para publicadas (o tipo delas já é
 *    declaração pela publicação): são puladas e contadas.
 *
 * Domínio puro.
 */

export type VinculoBatchAction =
  /** Recusada desde 2026-10-13 (`SUBJECT_ENTRY_MOVED`): o Assunto só entra por "Cadastrar Assuntos". */
  | { kind: "subject_declare"; note?: string | null; destinationUrl?: string | null }
  /** Recusada desde 2026-10-13 (`SUBJECT_ENTRY_MOVED`): tirar do plano é "Tirar do plano". */
  | { kind: "subject_withdraw" }
  | { kind: "page_type"; pageType: KeywordPageType; stance?: KeywordPageTypeStance }
  /**
   * O Posto de principal. Na PUBLICADA: `locked` = Travado ao slug,
   * `reviewable` = Livre. Na NÃO PUBLICADA (2026-10-13): é a trava do cadastro —
   * `locked` = Travada, `reviewable` = Livre, `auto` = Automática (pelo volume);
   * a gravação vai pelo núcleo do cadastro (`planLocks`), não por aqui.
   */
  | { kind: "post"; policy: "locked" | "reviewable" | "auto" };

/** A linha como a tabela a tem. Colunas do pacote aprovado entram para contar o rebaixamento. */
export type VinculoBatchKeyword = {
  id: string;
  brand_id?: string | null;
  keyword: string;
  status?: string | null;
  intent?: string | null;
  volume_search?: number | null;
  results_allintitle?: number | null;
  kgr_score?: number | null;
  lista_id?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

/**
 * `not_published` não é mais produzido (2026-10-13: na não publicada o posto é a
 * trava do cadastro); fica no tipo para leitores antigos. `no_plan`: travar uma
 * keyword sem plano é recusado com a frase do cadastro. `published_auto`:
 * "Automática" só vale para a keyword do plano. `same_article`: duas keywords
 * do mesmo artigo do plano (formato anterior) — a trava é gravada uma vez.
 */
export type VinculoBatchSkipReason = "other_brand" | "unchanged" | "not_published" | "published_potential" | "no_plan" | "published_auto" | "same_article";

/**
 * A trava do cadastro a gravar, por keyword NÃO publicada do plano. Quem grava é
 * o núcleo do cadastro (rota `POST …/plans/lock`, `setKeywordPlanLockWithCore`):
 * nova versão do plano, releitura. O plano do lote só diz o que pedir.
 */
export type VinculoBatchPlanLock = {
  id: string;
  keyword: string;
  lock: DeclaredPlanLockChoice;
  subjectKeywordId: string;
  groupId: string;
  /** "Travada · pelo volume medido" hoje. */
  fromLabel: string;
  /** A keyword está aprovada hoje e volta a "Em revisão" (a trava entra no pacote). */
  demotesApproval: boolean;
};

export type VinculoBatchUpdate = {
  id: string;
  brandId: string;
  keyword: string;
  /** `analise_semantica` inteiro a gravar (mesmo contrato do lote de KGR). */
  semantic: Record<string, unknown>;
  /** Aprovada hoje que vai para Em revisão com esta escrita. */
  demotesApproval: boolean;
};

export type VinculoBatchSkip = { id: string; keyword: string; reason: VinculoBatchSkipReason; detail?: string };

/** O Assunto saiu do Vínculo: a mensagem aponta a porta única. */
export const VINCULO_SUBJECT_ENTRY_MOVED_REASON =
  "O Assunto não é mais do Vínculo: ele mora dentro da keyword e entra só por \"Cadastrar Assuntos\" (no MCP, declare_silo_plan). Para tirar um artigo do plano, use \"Tirar do plano\"." as const;

export type VinculoBatchPlan =
  | {
    ok: true;
    action: VinculoBatchAction;
    updates: VinculoBatchUpdate[];
    /** 2026-10-13 · a trava do cadastro das não publicadas do plano (gravada pelo núcleo do cadastro). */
    planLocks: VinculoBatchPlanLock[];
    skipped: VinculoBatchSkip[];
    counts: Record<VinculoBatchSkipReason, number> & { updates: number; approvedToReview: number; planLocks: number };
    /** "12 aprovadas desta seleção vão para Em revisão" — `null` sem aprovadas. */
    demotionWarning: string | null;
    /** Rótulo da ação para a confirmação e o progresso. */
    actionLabel: string;
  }
  | { ok: false; code: "ACTOR_REQUIRED" | "BRAND_REQUIRED" | "INVALID_ACTION" | "SUBJECT_ENTRY_MOVED"; reason: string };

export type PlanVinculoBatchInput = {
  keywords: readonly VinculoBatchKeyword[];
  /** Marca ativa, vinda da rota/servidor — nunca do corpo de um pedido. */
  brandId: string | null | undefined;
  action: VinculoBatchAction;
  /** `auth.users.id` da sessão. */
  actorId: string | null | undefined;
  changedAt: string;
  /**
   * 2026-10-13 · as outras linhas da marca pelo id (a tela já as tem): a
   * principal do formato anterior lê a trava na linha do Assunto. Sem ela, a
   * principal do formato anterior é recusada com o motivo, nunca pulada calada.
   */
  keywordOf?: (id: string) => VinculoBatchKeyword | null | undefined;
};

function packageInput(keyword: VinculoBatchKeyword, semantic: Record<string, unknown> | null): ApprovedPackageInput {
  return {
    keywordId: keyword.id,
    brandId: keyword.brand_id ?? null,
    keyword: keyword.keyword,
    intent: keyword.intent,
    volumeSearch: keyword.volume_search,
    resultsAllintitle: keyword.results_allintitle,
    kgrScore: keyword.kgr_score,
    listaId: keyword.lista_id,
    semantic,
  };
}

function effectivelyApproved(keyword: VinculoBatchKeyword, semantic: Record<string, unknown> | null): boolean {
  return isApprovedForArchitect({ status: keyword.status, diverged: approvedPackageDiverged(packageInput(keyword, semantic)) });
}

export function vinculoBatchActionLabel(action: VinculoBatchAction): string {
  if (action.kind === "subject_declare" || action.kind === "subject_withdraw") return "Assunto (fora do Vínculo)";
  if (action.kind === "page_type") {
    return action.stance
      ? `Potencial de página: ${keywordPageTypeStanding(action.pageType, { declared: action.stance === "declared" })}`
      : `Tipo de página: ${keywordPageTypeLabel(action.pageType)}`;
  }
  // 2026-10-13 · um rótulo para os dois mundos: travado (ao slug na publicada; no artigo na do plano), livre, automática.
  return `Posto: ${action.policy === "auto" ? "Automática (pelo volume)" : action.policy === "locked" ? "Travada" : primaryPostLabel(action.policy)}`;
}

/** O posto do lote vira a escolha da trava do cadastro na não publicada. */
export function planLockChoiceOfPost(policy: "locked" | "reviewable" | "auto"): DeclaredPlanLockChoice {
  return policy === "reviewable" ? "free" : policy;
}

function demotionWarning(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? "1 aprovada desta seleção vai para Em revisão."
    : `${count} aprovadas desta seleção vão para Em revisão.`;
}

function isSubjectAction(action: VinculoBatchAction): boolean {
  return action.kind === "subject_declare" || action.kind === "subject_withdraw";
}

function validAction(action: VinculoBatchAction): boolean {
  if (action.kind === "page_type") {
    return (KEYWORD_PAGE_TYPES as readonly string[]).includes(action.pageType)
      && (action.stance === undefined || (KEYWORD_PAGE_TYPE_STANCES as readonly string[]).includes(action.stance));
  }
  if (action.kind === "post") return action.policy === "locked" || action.policy === "reviewable" || action.policy === "auto";
  return false;
}

export function planVinculoBatch(input: PlanVinculoBatchInput): VinculoBatchPlan {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para aplicar o Vínculo." };
  if (!isKeywordSubjectActorId(input.actorId)) {
    return { ok: false, code: "ACTOR_REQUIRED", reason: "Aplicar o Vínculo em grupo exige o usuário autenticado (auth.users.id)." };
  }
  const actorId = input.actorId.trim();
  const action = input.action;
  if (action && isSubjectAction(action)) return { ok: false, code: "SUBJECT_ENTRY_MOVED", reason: VINCULO_SUBJECT_ENTRY_MOVED_REASON };
  if (!action || !validAction(action)) return { ok: false, code: "INVALID_ACTION", reason: "Escolha uma ação do Vínculo." };

  const updates: VinculoBatchUpdate[] = [];
  const planLocks: VinculoBatchPlanLock[] = [];
  const lockedSubjects = new Map<string, string>();
  const skipped: VinculoBatchSkip[] = [];
  const skip = (keyword: VinculoBatchKeyword, reason: VinculoBatchSkipReason, detail?: string) => {
    skipped.push({ id: keyword.id, keyword: keyword.keyword, reason, ...(detail ? { detail } : {}) });
  };
  const semanticOf = (id: string) => {
    const own = input.keywords.find(keyword => keyword.id === id) ?? input.keywordOf?.(id) ?? null;
    return own && own.brand_id === brandId ? own.analise_semantica ?? null : null;
  };

  for (const keyword of input.keywords) {
    if (keyword.brand_id !== brandId) {
      skip(keyword, "other_brand");
      continue;
    }
    const current = keyword.analise_semantica || null;
    let next: Record<string, unknown> | null = null;

    if (action.kind === "page_type") {
      const evidence = readSiteOrigin(current);
      const published = readPublicationLink({ status: keyword.status, evidence }).state === "published";
      // Na publicada o tipo já é declaração pela publicação: a tela individual
      // só oferece os 4 declarados. "Potencial" em grupo pula e conta a publicada.
      if (published && action.stance === "potential") {
        skip(keyword, "published_potential");
        continue;
      }
      const result = setKeywordPageType(current, {
        pageType: action.pageType,
        ...(action.stance ? { stance: action.stance } : {}),
        actorId,
        changedAt: input.changedAt,
        siteRole: evidence?.siteRole,
        published,
      });
      next = result.changed ? result.semantic : null;
    } else if (action.kind === "post") {
      // 2026-10-13 · NÃO PUBLICADA: o posto é a TRAVA do cadastro (por item,
      // nunca pulada em silêncio). Com plano, vira pedido ao núcleo do
      // cadastro; sem plano, travar é recusado com a frase do cadastro.
      if (!isKeywordPublished({ status: keyword.status, semantic: current })) {
        const trava = resolveKeywordPlanLock({
          keywordId: keyword.id,
          keyword: keyword.keyword,
          status: keyword.status,
          semantic: current,
          volume: keywordLockVolume({ semantic: current, volumeSearch: keyword.volume_search, resultsAllintitle: keyword.results_allintitle }),
          subjectSemanticOf: semanticOf,
          keywordTextOf: id => input.keywordOf?.(id)?.keyword ?? null,
        });
        if (!trava) { skip(keyword, "unchanged"); continue; }
        const pedido = planLockChange(trava, planLockChoiceOfPost(action.policy));
        if (!pedido.ok) { skip(keyword, "no_plan", pedido.reason); continue; }
        if (!pedido.changed || trava.kind !== "plan") { skip(keyword, "unchanged"); continue; }
        const mesmo = lockedSubjects.get(trava.subjectKeywordId);
        if (mesmo) { skip(keyword, "same_article", `mesmo artigo de "${mesmo}"`); continue; }
        lockedSubjects.set(trava.subjectKeywordId, keyword.keyword);
        planLocks.push({
          id: keyword.id,
          keyword: keyword.keyword,
          lock: pedido.to,
          subjectKeywordId: trava.subjectKeywordId,
          groupId: trava.groupId,
          fromLabel: trava.label,
          demotesApproval: effectivelyApproved(keyword, current),
        });
        continue;
      }
      if (action.policy === "auto") {
        skip(keyword, "published_auto");
        continue;
      }
      const vinculo = resolveKeywordVinculo({ status: keyword.status, semantic: current });
      if (vinculo.postSelectValue === action.policy) {
        skip(keyword, "unchanged");
        continue;
      }
      next = setPrimaryKeywordPolicy(current, {
        status: keyword.status || "",
        publicationConfirmed: vinculo.publicationDeclared,
        keyword: keyword.keyword,
        policy: action.policy,
        actorId,
        changedAt: input.changedAt,
      });
      if (next === current || JSON.stringify(next) === JSON.stringify(current || {})) next = null;
    }

    if (!next) {
      skip(keyword, "unchanged");
      continue;
    }
    const demotesApproval = effectivelyApproved(keyword, current) && !effectivelyApproved(keyword, next);
    updates.push({ id: keyword.id, brandId, keyword: keyword.keyword, semantic: next, demotesApproval });
  }

  const counts = {
    updates: updates.length,
    planLocks: planLocks.length,
    approvedToReview: updates.filter(update => update.demotesApproval).length + planLocks.filter(entry => entry.demotesApproval).length,
    other_brand: 0,
    unchanged: 0,
    not_published: 0,
    published_potential: 0,
    no_plan: 0,
    published_auto: 0,
    same_article: 0,
  };
  for (const entry of skipped) counts[entry.reason] += 1;

  return {
    ok: true,
    action,
    updates,
    planLocks,
    skipped,
    counts,
    demotionWarning: demotionWarning(counts.approvedToReview),
    actionLabel: vinculoBatchActionLabel(action),
  };
}

/**
 * VÍNCULO EM GRUPO COM AS ESCOLHAS DE UMA VEZ (pedido do dono, 2026-09-24: um
 * seletor "Vínculo" só, com um grupo de escolha única para cada parte).
 *
 * Cada grupo pode ficar sem escolha; no máximo uma ação por grupo. A ordem de
 * aplicação é fixa — Potencial de página → Posto. Ação de Assunto é recusada
 * (`SUBJECT_ENTRY_MOVED`), antes de qualquer gravação.
 *
 * Cada passo é o mesmo `planVinculoBatch`, sobre o `analise_semantica` que o
 * passo anterior deixou. O resultado junta tudo numa gravação por keyword:
 * o `semantic` final, e o rebaixamento medido do estado de hoje ao final.
 * Domínio puro.
 */
export type VinculoBatchChoicesPlan =
  | {
    ok: true;
    steps: Extract<VinculoBatchPlan, { ok: true }>[];
    updates: VinculoBatchUpdate[];
    /** 2026-10-13 · a trava do cadastro das não publicadas do plano (do passo do Posto). */
    planLocks: VinculoBatchPlanLock[];
    counts: { updates: number; approvedToReview: number; planLocks: number };
    demotionWarning: string | null;
    actionLabel: string;
  }
  | { ok: false; code: Extract<VinculoBatchPlan, { ok: false }>["code"] | "NO_CHOICE" | "DUPLICATE_GROUP"; reason: string };

export type PlanVinculoBatchChoicesInput = Omit<PlanVinculoBatchInput, "action"> & { actions: readonly VinculoBatchAction[] };

function actionGroup(action: VinculoBatchAction): "subject" | "page_type" | "post" {
  if (isSubjectAction(action)) return "subject";
  return action.kind as "page_type" | "post";
}

const CHOICE_ORDER = { subject: 0, page_type: 1, post: 2 } as const;

export function planVinculoBatchChoices(input: PlanVinculoBatchChoicesInput): VinculoBatchChoicesPlan {
  const actions = Array.isArray(input.actions) ? input.actions.filter(Boolean) : [];
  if (actions.length === 0) return { ok: false, code: "NO_CHOICE", reason: "Escolha ao menos uma opção do Vínculo." };
  if (actions.some(isSubjectAction)) return { ok: false, code: "SUBJECT_ENTRY_MOVED", reason: VINCULO_SUBJECT_ENTRY_MOVED_REASON };
  const groups = actions.map(actionGroup);
  if (new Set(groups).size !== groups.length) {
    return { ok: false, code: "DUPLICATE_GROUP", reason: "Cada grupo do Vínculo aceita uma escolha só." };
  }
  const ordered = [...actions].sort((left, right) => CHOICE_ORDER[actionGroup(left)] - CHOICE_ORDER[actionGroup(right)]);

  const original = new Map(input.keywords.map(keyword => [keyword.id, keyword]));
  let working: VinculoBatchKeyword[] = input.keywords.map(keyword => ({ ...keyword }));
  const finalSemantic = new Map<string, Record<string, unknown>>();
  const steps: Extract<VinculoBatchPlan, { ok: true }>[] = [];
  for (const action of ordered) {
    const plan = planVinculoBatch({ ...input, keywords: working, action });
    if (!plan.ok) return plan;
    steps.push(plan);
    const written = new Map(plan.updates.map(update => [update.id, update.semantic]));
    for (const [id, semantic] of written) finalSemantic.set(id, semantic);
    working = working.map(keyword => written.has(keyword.id) ? { ...keyword, analise_semantica: written.get(keyword.id) } : keyword);
  }

  const brandId = String(input.brandId).trim();
  const updates: VinculoBatchUpdate[] = [];
  for (const keyword of input.keywords) {
    const semantic = finalSemantic.get(keyword.id);
    if (!semantic) continue;
    const before = original.get(keyword.id)!;
    const current = before.analise_semantica || null;
    const demotesApproval = effectivelyApproved(before, current) && !effectivelyApproved(before, semantic);
    updates.push({ id: keyword.id, brandId, keyword: keyword.keyword, semantic, demotesApproval });
  }
  const planLocks = steps.flatMap(step => step.planLocks);
  const updatedIds = new Set(updates.filter(update => update.demotesApproval).map(update => update.id));
  const approvedToReview = updatedIds.size + planLocks.filter(entry => entry.demotesApproval && !updatedIds.has(entry.id)).length;
  return {
    ok: true,
    steps,
    updates,
    planLocks,
    counts: { updates: updates.length, approvedToReview, planLocks: planLocks.length },
    demotionWarning: demotionWarning(approvedToReview),
    actionLabel: steps.map(step => step.actionLabel).join(" · "),
  };
}

/**
 * Colunas do readback estreito do lote (F1.6): só as declarações (Assunto,
 * tipo de página com o peso potencial/declarado, posto), em vez
 * de `select("*")` (~0,5 kB contra ~9,5 kB por linha). A leitura filtra
 * `id` + `brand_id` + `deleted_at is null`; quem a executa é a tela. O Assunto
 * continua conferido: o Vínculo não o escreve, e a releitura prova que ele
 * ficou como estava.
 */
export const VINCULO_BATCH_READBACK_COLUMNS =
  "id,brand_id,analise_semantica->keyword_subject,analise_semantica->keyword_page_type,analise_semantica->keyword_page_type_stance,analise_semantica->primary_keyword_policy" as const;

export type VinculoBatchReadbackRow = {
  id?: unknown;
  brand_id?: unknown;
  keyword_subject?: unknown;
  keyword_page_type?: unknown;
  keyword_page_type_stance?: unknown;
  primary_keyword_policy?: unknown;
};

/**
 * Ordena as chaves de objetos em profundidade. O JSONB do Postgres não guarda
 * a ordem das chaves: devolve `{"note", "declared", "destinationUrl", ...}`
 * (por tamanho da chave) para o `{"declared", "note", ...}` gravado. Sem
 * ordenar, toda declaração salva seria acusada de divergente.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, sortKeysDeep(record[key])]));
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortKeysDeep(left ?? null)) === JSON.stringify(sortKeysDeep(right ?? null));
}

/**
 * O readback confirma a escrita: mesma marca e as chaves iguais ao que
 * foi gravado, sem depender da ordem das chaves que o JSONB devolve. Não
 * percebe chave alheia perdida por escrita concorrente — o limite da SDD
 * (F1.6), que só `row_version` fecha.
 */
export function vinculoBatchReadbackMatches(update: VinculoBatchUpdate, row: VinculoBatchReadbackRow | null | undefined): boolean {
  if (!row || String(row.id) !== update.id || row.brand_id !== update.brandId) return false;
  return sameJson(row.keyword_subject, update.semantic.keyword_subject)
    && sameJson(row.keyword_page_type, update.semantic.keyword_page_type)
    && sameJson(row.keyword_page_type_stance, update.semantic.keyword_page_type_stance)
    && sameJson(row.primary_keyword_policy, update.semantic.primary_keyword_policy);
}
