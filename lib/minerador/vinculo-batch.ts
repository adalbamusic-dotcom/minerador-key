import { approvedPackageDiverged, type ApprovedPackageInput } from "./approved-package.ts";
import { isApprovedForArchitect } from "./editorial-status.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import { KEYWORD_PAGE_TYPES, keywordPageTypeLabel, setKeywordPageType, type KeywordPageType } from "./keyword-page-type.ts";
import {
  isKeywordSubjectActorId,
  normalizeKeywordSubjectNote,
  resolveKeywordSubject,
  setKeywordSubject,
  withdrawKeywordSubject,
  type DestinationCheck,
} from "./keyword-subject.ts";
import { resolveKeywordVinculo } from "./keyword-vinculo.ts";
import { readPublicationLink, readSiteOrigin } from "./publication-link.ts";
import { primaryPostLabel, setPrimaryKeywordPolicy } from "./primary-keyword-policy.ts";
import { validateSubjectDestination, type SubjectDestinationCatalogHit } from "./subject-destination.ts";

/**
 * VÍNCULO EM GRUPO — o plano puro do select "Vínculo" do rodapé
 * (SDD 2026-09-24, F1.6).
 *
 * Três grupos de escolha, todos humanos:
 *
 *   Assunto          Declarar (nota e destino opcionais, iguais para o lote) · Retirar
 *   Tipo de página   os 4 tipos, enum intacto
 *   Posto            Travado ao slug · Livre — só em publicadas
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
 *  - o destino é conferido UMA vez para o lote (F1.2); recusado, nada é
 *    planejado e a tela diz por quê;
 *  - declarar numa keyword que JÁ é Assunto não troca a nota nem o destino
 *    dela: a troca é por keyword, na Revisão Humana (mesma regra do import);
 *  - o posto só vale para publicadas; as demais são puladas e contadas.
 *
 * Domínio puro.
 */

export type VinculoBatchAction =
  | { kind: "subject_declare"; note?: string | null; destinationUrl?: string | null }
  | { kind: "subject_withdraw" }
  | { kind: "page_type"; pageType: KeywordPageType }
  | { kind: "post"; policy: "locked" | "reviewable" };

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

export type VinculoBatchSkipReason = "other_brand" | "unchanged" | "already_declared" | "not_published" | "refused";

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

export type VinculoBatchPlan =
  | {
    ok: true;
    action: VinculoBatchAction;
    updates: VinculoBatchUpdate[];
    skipped: VinculoBatchSkip[];
    counts: Record<VinculoBatchSkipReason, number> & { updates: number; approvedToReview: number };
    /** "12 aprovadas desta seleção vão para Em revisão" — `null` sem aprovadas. */
    demotionWarning: string | null;
    /** Aviso da página de destino (sem site cadastrado, fora do catálogo). */
    destinationNotice: string | null;
    /** Rótulo da ação para a confirmação e o progresso. */
    actionLabel: string;
  }
  | { ok: false; code: "ACTOR_REQUIRED" | "BRAND_REQUIRED" | "INVALID_ACTION" | "NOTE_TOO_LONG" | "NOTE_MULTILINE" | "INVALID_URL" | "NOT_HTTPS" | "OUTSIDE_BRAND_SITE"; reason: string };

export type PlanVinculoBatchInput = {
  keywords: readonly VinculoBatchKeyword[];
  /** Marca ativa, vinda da rota/servidor — nunca do corpo de um pedido. */
  brandId: string | null | undefined;
  action: VinculoBatchAction;
  /** `auth.users.id` da sessão. */
  actorId: string | null | undefined;
  changedAt: string;
  /** `marcas.site_url`, para conferir o destino do lote. */
  brandSiteUrl?: string | null;
  /** O que a busca no catálogo achou para o destino do lote, se buscou. */
  destinationCatalog?: SubjectDestinationCatalogHit | null;
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
  if (action.kind === "subject_declare") return "Declarar Assunto";
  if (action.kind === "subject_withdraw") return "Retirar Assunto";
  if (action.kind === "page_type") return `Tipo de página: ${keywordPageTypeLabel(action.pageType)}`;
  return `Posto: ${primaryPostLabel(action.policy)}`;
}

function demotionWarning(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? "1 aprovada desta seleção vai para Em revisão."
    : `${count} aprovadas desta seleção vão para Em revisão.`;
}

function validAction(action: VinculoBatchAction): boolean {
  if (action.kind === "subject_declare" || action.kind === "subject_withdraw") return true;
  if (action.kind === "page_type") return (KEYWORD_PAGE_TYPES as readonly string[]).includes(action.pageType);
  if (action.kind === "post") return action.policy === "locked" || action.policy === "reviewable";
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
  if (!action || !validAction(action)) return { ok: false, code: "INVALID_ACTION", reason: "Escolha uma ação do Vínculo." };

  // Nota e destino do lote: conferidos uma vez, antes de qualquer keyword.
  let note: string | null = null;
  let destinationUrl: string | null = null;
  let destinationCheck: DestinationCheck | null = null;
  let destinationNotice: string | null = null;
  if (action.kind === "subject_declare") {
    const normalized = normalizeKeywordSubjectNote(action.note);
    if (!normalized.ok) return { ok: false, code: normalized.code, reason: normalized.reason };
    note = normalized.note;
    const destination = validateSubjectDestination({
      rawUrl: action.destinationUrl,
      brandSiteUrl: input.brandSiteUrl,
      checkedAt: input.changedAt,
      catalog: input.destinationCatalog ?? null,
    });
    if (!destination.ok) return { ok: false, code: destination.code, reason: destination.reason };
    destinationUrl = destination.destinationUrl;
    destinationCheck = destination.destinationCheck;
    destinationNotice = destination.notice;
  }

  const updates: VinculoBatchUpdate[] = [];
  const skipped: VinculoBatchSkip[] = [];
  const skip = (keyword: VinculoBatchKeyword, reason: VinculoBatchSkipReason, detail?: string) => {
    skipped.push({ id: keyword.id, keyword: keyword.keyword, reason, ...(detail ? { detail } : {}) });
  };

  for (const keyword of input.keywords) {
    if (keyword.brand_id !== brandId) {
      skip(keyword, "other_brand");
      continue;
    }
    const current = keyword.analise_semantica || null;
    let next: Record<string, unknown> | null = null;

    if (action.kind === "subject_declare") {
      if (resolveKeywordSubject(current).declared) {
        skip(keyword, "already_declared");
        continue;
      }
      const result = setKeywordSubject(current, { note, destinationUrl, destinationCheck, actorId, changedAt: input.changedAt, origin: "batch" });
      if (!result.ok) {
        skip(keyword, "refused", result.reason);
        continue;
      }
      next = result.changed ? result.semantic : null;
    } else if (action.kind === "subject_withdraw") {
      const result = withdrawKeywordSubject(current, { actorId, changedAt: input.changedAt, origin: "batch" });
      if (!result.ok) {
        skip(keyword, "refused", result.reason);
        continue;
      }
      next = result.changed ? result.semantic : null;
    } else if (action.kind === "page_type") {
      const evidence = readSiteOrigin(current);
      const result = setKeywordPageType(current, {
        pageType: action.pageType,
        actorId,
        changedAt: input.changedAt,
        siteRole: evidence?.siteRole,
        published: readPublicationLink({ status: keyword.status, evidence }).state === "published",
      });
      next = result.changed ? result.semantic : null;
    } else {
      // Posto: só publicadas, como o handler individual.
      if (!isKeywordPublished({ status: keyword.status, semantic: current })) {
        skip(keyword, "not_published");
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
    approvedToReview: updates.filter(update => update.demotesApproval).length,
    other_brand: 0,
    unchanged: 0,
    already_declared: 0,
    not_published: 0,
    refused: 0,
  };
  for (const entry of skipped) counts[entry.reason] += 1;

  return {
    ok: true,
    action,
    updates,
    skipped,
    counts,
    demotionWarning: demotionWarning(counts.approvedToReview),
    destinationNotice,
    actionLabel: vinculoBatchActionLabel(action),
  };
}

/**
 * Colunas do readback estreito do lote (F1.6): só as três declarações, em vez
 * de `select("*")` (~0,5 kB contra ~9,5 kB por linha). A leitura filtra
 * `id` + `brand_id` + `deleted_at is null`; quem a executa é a tela.
 */
export const VINCULO_BATCH_READBACK_COLUMNS =
  "id,brand_id,analise_semantica->keyword_subject,analise_semantica->keyword_page_type,analise_semantica->primary_keyword_policy" as const;

export type VinculoBatchReadbackRow = {
  id?: unknown;
  brand_id?: unknown;
  keyword_subject?: unknown;
  keyword_page_type?: unknown;
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
 * O readback confirma a escrita: mesma marca e as três chaves iguais ao que
 * foi gravado, sem depender da ordem das chaves que o JSONB devolve. Não
 * percebe chave alheia perdida por escrita concorrente — o limite da SDD
 * (F1.6), que só `row_version` fecha.
 */
export function vinculoBatchReadbackMatches(update: VinculoBatchUpdate, row: VinculoBatchReadbackRow | null | undefined): boolean {
  if (!row || String(row.id) !== update.id || row.brand_id !== update.brandId) return false;
  return sameJson(row.keyword_subject, update.semantic.keyword_subject)
    && sameJson(row.keyword_page_type, update.semantic.keyword_page_type)
    && sameJson(row.primary_keyword_policy, update.semantic.primary_keyword_policy);
}
