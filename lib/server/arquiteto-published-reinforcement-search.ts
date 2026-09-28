import "server-only";

import { z } from "zod";
import { contentHash } from "@/lib/arquiteto/versioning";
import { buildSerpSubjectIndex } from "@/lib/arquiteto/serp-subject-overlap";
import { DIFFERENTIATION_RUNNING_STALE_MS, detectPublishedCannibalization, type DifferentiationPage, type DifferentiationRowState } from "@/lib/arquiteto/published-differentiation";
import type { DifferentiationRunPorts } from "@/lib/arquiteto/published-differentiation-run";
import {
  REINFORCEMENT_MAX_COST_USD,
  REINFORCEMENT_SEARCH_CONTRACT_VERSION,
  REINFORCEMENT_SEARCH_MAX_PAGES,
  REINFORCEMENT_SEARCH_SUBJECT_TYPE,
  authorizeReinforcementSearchPlan,
  buildReinforcementSearchPlan,
  describeReinforcementSearchResult,
  partitionReinforcementPages,
  reinforcementPagesFingerprint,
  reinforcementSearchId,
  runReinforcementSearch,
  verifyReinforcementSearchPlanHash,
  type ReinforcementSearchPlan,
  type ReinforcementSearchResult,
} from "@/lib/arquiteto/published-reinforcement-search";
import {
  DifferentiationConflictError,
  readDifferentiationArticleIndex,
  readDifferentiationBrandKeywords,
  readDifferentiationProposal,
  readPublishedFootprints,
  writeDifferentiationProposal,
  type DifferentiationRow,
  type DifferentiationStoreContext,
} from "@/lib/server/arquiteto-differentiation-store";

/**
 * REFORÇAR PUBLICADOS — A BUSCA EM LOTE NO SERVIDOR (SDD 2026-09-28 §4).
 *
 *   plan   grátis: separa as páginas pedidas pelos dois modos (as que disputam
 *          o mesmo assunto com outro publicado vão ao painel da diferenciação),
 *          monta o plano com a faixa de custo, o teto de US$ 1,00 e o hash, e
 *          grava a prévia (`state = planned`). Rodada paga já gravada não é
 *          apagada sem `replaceResult` (a anterior vai ao histórico).
 *   run    pago: a prévia vale UMA rodada. Exige o hash e o custo autorizado,
 *          confere o teto no servidor, relê os publicados (mudou → nada é pago)
 *          e RESERVA a proposta (`planned` → `running`, trava por
 *          `lock_version`) antes de abrir o provider. A MESMA rodada repetida
 *          devolve o resultado gravado, sem pagar.
 *
 * O MESMO desenho e as MESMAS portas da diferenciação (`arquiteto-differentiation.ts`):
 * só o tipo da proposta (`published_reinforcement_search`) e a avaliação mudam.
 */

const BrandIdSchema = z.string().min(1).max(80);
const SearchIdSchema = z.string().regex(/^rs-[0-9a-f]{16}$/, "Busca inválida.");

export const ReinforcementSearchPlanRequestSchema = z.object({
  brandId: BrandIdSchema,
  /** Os publicados "sem par no lote", como a mesa os mostra. */
  pageKeywordIds: z.array(z.string().min(1).max(80)).min(1).max(REINFORCEMENT_SEARCH_MAX_PAGES),
  /** Relê a prévia e o resultado gravados, sem regravar (grátis). */
  resume: z.boolean().optional(),
  /** Pedido explícito da tela: nova prévia sobre um resultado já pago (vai ao histórico). */
  replaceResult: z.boolean().optional(),
}).strict();

export const ReinforcementSearchRunRequestSchema = z.object({
  brandId: BrandIdSchema,
  searchId: SearchIdSchema,
  operationRequestId: z.string().uuid(),
  authorizedPlan: z.object({
    planHash: z.string().min(1).max(200),
    maxCostUsd: z.number().positive().max(REINFORCEMENT_MAX_COST_USD),
  }).strict(),
}).strict();

export type ReinforcementSearchDeps = {
  store: DifferentiationStoreContext;
  now: () => Date;
  openRunPorts?: (operationRequestId: string) => Promise<Omit<DifferentiationRunPorts, "now">>;
};

export type ReinforcementSearchOutcomeBody = { status: number; body: Record<string, unknown> };

type StoredRun = ReinforcementSearchResult & { executedBy: string };

type SearchPayload = {
  contract: typeof REINFORCEMENT_SEARCH_CONTRACT_VERSION;
  searchId: string;
  pageKeywordIds: string[];
  plan: ReinforcementSearchPlan;
  plannedAt: string;
  plannedBy: string;
  run?: StoredRun;
  resultHash?: string;
  running?: { operationRequestId: string; actorId: string; startedAt: string };
  /** Tentativa paga que parou no meio: esta prévia não paga de novo (o teto vale por rodada). */
  interrupted?: { operationRequestId: string; actorId: string; startedAt: string };
  history?: Array<Record<string, unknown>>;
};

const falhou = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): ReinforcementSearchOutcomeBody => ({ status, body: { success: false, code, error: message, ...extra } });
const HISTORICO_MAXIMO = 10;
const semReservaDe = (payload: SearchPayload): SearchPayload => { const copia = { ...payload }; delete copia.running; return copia; };
const reservaParada = (payload: Partial<SearchPayload>, now: Date) => {
  const inicio = payload.running?.startedAt ? Date.parse(payload.running.startedAt) : NaN;
  return !Number.isFinite(inicio) || now.getTime() - inicio > DIFFERENTIATION_RUNNING_STALE_MS;
};
const hostsDe = (pages: readonly Pick<DifferentiationPage, "url">[]) => [...new Set(pages.map(page => { try { return page.url ? new URL(page.url).hostname.replace(/^www\./, "") : null; } catch { return null; } }).filter((host): host is string => Boolean(host)))];

function runData(resultado: ReinforcementSearchResult, resultHash: string, extra: { proposal: { state: DifferentiationRowState; lockVersion: number } | null; persistWarning: string | null; paid: boolean; replayed: boolean }) {
  return {
    mode: "run",
    searchId: resultado.searchId,
    operationRequestId: resultado.operationRequestId,
    executedAt: resultado.executedAt,
    pages: resultado.pages,
    resultHash,
    costs: resultado.costs,
    serp: resultado.serp,
    adsFailures: resultado.adsFailures,
    adsVolumeFailed: resultado.adsVolumeFailed,
    refusedCount: resultado.refusedCount,
    ledgerRecording: resultado.ledgerRecording,
    ledgerWarning: resultado.ledgerWarning,
    notices: resultado.notices,
    message: describeReinforcementSearchResult(resultado),
    ...extra,
  };
}

/** As páginas pedidas, relidas, com as vagas do artigo, e a detecção de canibalização (cache, grátis). */
async function readRequestedPages(deps: ReinforcementSearchDeps, pageKeywordIds: readonly string[]) {
  const [marca, artigos] = await Promise.all([readDifferentiationBrandKeywords(deps.store), readDifferentiationArticleIndex(deps.store)]);
  const pages = marca.pages.map(page => {
    const artigo = artigos.get(page.keywordId);
    return artigo ? { ...page, articleId: artigo.articleId, articleKeywordCount: artigo.keywordCount } : page;
  });
  const leitura = await readPublishedFootprints(deps.store, pages, deps.now());
  const indice = buildSerpSubjectIndex(leitura.footprints);
  const deteccao = detectPublishedCannibalization({ pages, serp: indice, brandHosts: hostsDe(pages) });
  const particao = partitionReinforcementPages({ requestedKeywordIds: pageKeywordIds, pages, groups: deteccao.groups });
  return { marca, pages, footprints: leitura.footprints, particao };
}

export async function handleReinforcementSearchPlan(deps: ReinforcementSearchDeps, body: z.infer<typeof ReinforcementSearchPlanRequestSchema>): Promise<ReinforcementSearchOutcomeBody> {
  const leitura = await readRequestedPages(deps, body.pageKeywordIds);
  const { particao } = leitura;
  const differentiation = particao.differentiation.map(grupo => ({ ...grupo, message: `Disputam o mesmo assunto entre si: use "Diferenciar publicados" (${grupo.keywords.map(nome => `"${nome}"`).join(", ")}).` }));
  if (!particao.reinforcement.length) {
    return { status: 200, body: { success: true, data: { mode: "plan", searchId: null, plan: null, differentiation, unknown: particao.unknown, paid: false, message: differentiation.length ? "Os publicados pedidos disputam o mesmo assunto com outro publicado: seguem pela diferenciação. Nada foi gravado." : "Nenhum publicado desta marca entre os pedidos. Nada foi gravado." } } };
  }
  const searchId = reinforcementSearchId(particao.reinforcement.map(page => page.keywordId));
  const atual = await readDifferentiationProposal(deps.store, searchId, REINFORCEMENT_SEARCH_SUBJECT_TYPE);
  const anterior = (atual?.payload || {}) as Partial<SearchPayload>;
  if (body.resume) {
    if (!atual || !anterior.plan) return falhou(404, "REINFORCEMENT_PLAN_REQUIRED", "Esta busca ainda não tem prévia gravada. Monte a prévia.");
    const run = anterior.run && anterior.resultHash ? runData(anterior.run, anterior.resultHash, { proposal: { state: atual.state, lockVersion: atual.lockVersion }, persistWarning: null, paid: false, replayed: true }) : null;
    return { status: 200, body: { success: true, data: { mode: "plan", searchId, plan: anterior.plan, proposal: { state: atual.state, lockVersion: atual.lockVersion }, run, differentiation, unknown: particao.unknown, stale: anterior.plan.pagesFingerprint !== reinforcementPagesFingerprint(particao.reinforcement), resumed: true, paid: false } } };
  }
  if (atual?.state === "running" && !reservaParada(anterior, deps.now())) return falhou(409, "OPERATION_IN_PROGRESS", "Uma rodada desta busca está em andamento. Aguarde o resultado; nada foi gravado.");
  const temResultado = Boolean(anterior.run) || atual?.state === "running";
  const interrompida = Boolean(anterior.interrupted) && !anterior.run;
  if (temResultado && !body.replaceResult) return falhou(409, "REINFORCEMENT_RESULT_PENDING", "Esta busca já tem uma rodada paga gravada. Reabra o resultado ou peça uma nova rodada na tela; nada foi apagado.");

  const plan = await buildReinforcementSearchPlan({ brandId: deps.store.brandId, searchId, pages: particao.reinforcement });
  const agora = deps.now().toISOString();
  const arquivada = temResultado || interrompida ? [{ replacedAt: agora, replacedBy: deps.store.actorUserId, planHash: anterior.plan?.planHash ?? null, operationRequestId: anterior.run?.operationRequestId ?? anterior.running?.operationRequestId ?? anterior.interrupted?.operationRequestId ?? null, executedAt: anterior.run?.executedAt ?? null, resultHash: anterior.resultHash ?? null, costs: anterior.run?.costs ?? null, interrupted: !anterior.run }] : [];
  const payload: SearchPayload = {
    contract: REINFORCEMENT_SEARCH_CONTRACT_VERSION,
    searchId,
    pageKeywordIds: particao.reinforcement.map(page => page.keywordId),
    plan,
    plannedAt: agora,
    plannedBy: deps.store.actorUserId,
    history: [...(Array.isArray(anterior.history) ? anterior.history : []), ...arquivada].slice(-HISTORICO_MAXIMO),
  };
  const gravada = await writeDifferentiationProposal(deps.store, { groupId: searchId, state: "planned", payload: payload as unknown as Record<string, unknown>, expected: atual, subjectType: REINFORCEMENT_SEARCH_SUBJECT_TYPE });
  return {
    status: 200,
    body: {
      success: true,
      data: {
        mode: "plan",
        searchId,
        plan,
        proposal: { state: gravada.state, lockVersion: gravada.lockVersion },
        run: null,
        differentiation,
        unknown: particao.unknown,
        stale: false,
        resumed: false,
        paid: false,
        message: `Prévia gravada, sem custo: ${particao.reinforcement.length} publicado(s), até US$ ${plan.costRange.maxUsd.toFixed(2)} (teto de US$ ${REINFORCEMENT_MAX_COST_USD.toFixed(2)}). Nada foi pago.`,
      },
    },
  };
}

export async function handleReinforcementSearchRun(deps: ReinforcementSearchDeps, body: z.infer<typeof ReinforcementSearchRunRequestSchema>): Promise<ReinforcementSearchOutcomeBody> {
  const linha = await readDifferentiationProposal(deps.store, body.searchId, REINFORCEMENT_SEARCH_SUBJECT_TYPE);
  const payload = linha?.payload as Partial<SearchPayload> | undefined;
  if (!linha || !payload?.plan || !payload.pageKeywordIds) return falhou(404, "REINFORCEMENT_PLAN_REQUIRED", "Monte a prévia da busca antes de rodar. Nada foi pago.");
  const plan = payload.plan as ReinforcementSearchPlan;
  if (plan.brandId !== deps.store.brandId || plan.searchId !== body.searchId) return falhou(409, "PLAN_TAMPERED", "A prévia não é desta busca nesta marca. Nada foi pago.");

  if (payload.run && payload.resultHash) {
    if (payload.run.operationRequestId === body.operationRequestId && plan.planHash === body.authorizedPlan.planHash) {
      return { status: 200, body: { success: true, data: runData(payload.run, payload.resultHash, { proposal: { state: linha.state, lockVersion: linha.lockVersion }, persistWarning: null, paid: false, replayed: true }) } };
    }
    return falhou(409, "REINFORCEMENT_ALREADY_RUN", "Esta prévia já foi usada numa rodada paga. Reabra o resultado ou planeje uma nova rodada; nada foi pago.");
  }
  // Uma tentativa paga desta prévia parou no meio: outra tentativa com a MESMA prévia poderia
  // pagar de novo o que não entrou no cache e passar do teto da rodada. Nova rodada = nova prévia.
  if (payload.interrupted) return falhou(409, "REINFORCEMENT_ALREADY_RUN", "Esta prévia já teve uma tentativa paga que parou no meio. Monte uma nova prévia (o que já foi coletado está no cache e não é pago de novo); nada foi pago agora.");
  if (linha.state === "running") return falhou(409, "OPERATION_IN_PROGRESS", "Uma rodada desta busca já está em andamento. Aguarde; nada foi pago de novo.");
  if (linha.state !== "planned") return falhou(409, "REINFORCEMENT_PLAN_REQUIRED", "Monte uma prévia nova antes de rodar. Nada foi pago.");
  if (!await verifyReinforcementSearchPlanHash(plan)) return falhou(409, "PLAN_TAMPERED", "O plano gravado não confere com o hash dele. Monte um plano novo; nada foi pago.", { plan });
  const autorizacao = authorizeReinforcementSearchPlan(plan, body.authorizedPlan);
  if (!autorizacao.ok) return falhou(autorizacao.code === "PLAN_ABOVE_CAP" ? 422 : 409, autorizacao.code === "PLAN_ABOVE_CAP" ? "REINFORCEMENT_PLAN_ABOVE_CAP" : autorizacao.code, autorizacao.message, { plan });

  // As páginas continuam publicadas, fora de grupo de canibalização e iguais? Relido (grátis).
  const leitura = await readRequestedPages(deps, payload.pageKeywordIds);
  if (reinforcementPagesFingerprint(leitura.particao.reinforcement) !== plan.pagesFingerprint || leitura.particao.reinforcement.length !== payload.pageKeywordIds.length) {
    return falhou(409, "PLAN_STALE", "Os publicados desta busca mudaram desde a prévia (URL, publicação ou disputa entre eles). Monte a prévia de novo; nada foi pago.");
  }
  if (!deps.openRunPorts) return falhou(503, "DATAFORSEO_UNAVAILABLE", "O provider não está disponível para esta rodada. Nada foi pago.");

  const semReserva = semReservaDe(payload as SearchPayload);
  const inicio = deps.now().toISOString();
  let reserva: DifferentiationRow;
  try {
    reserva = await writeDifferentiationProposal(deps.store, {
      groupId: body.searchId,
      state: "running",
      payload: { ...semReserva, running: { operationRequestId: body.operationRequestId, actorId: deps.store.actorUserId, startedAt: inicio } } as unknown as Record<string, unknown>,
      expected: linha,
      subjectType: REINFORCEMENT_SEARCH_SUBJECT_TYPE,
    });
  } catch (error) {
    if (error instanceof DifferentiationConflictError) return falhou(409, "OPERATION_IN_PROGRESS", "Outra rodada desta busca começou antes (outra aba ou outro membro). Nada foi pago.");
    return falhou(503, "PROPOSAL_UNAVAILABLE", "A busca não pôde ser reservada antes de pagar. Nada foi pago.");
  }
  const liberar = async () => {
    try {
      await writeDifferentiationProposal(deps.store, { groupId: body.searchId, state: "planned", payload: semReserva as unknown as Record<string, unknown>, expected: reserva, subjectType: REINFORCEMENT_SEARCH_SUBJECT_TYPE });
    } catch {
      // A reserva parada vence em 30 minutos; "Planejar nova rodada" a substitui.
    }
  };
  let portas: Omit<DifferentiationRunPorts, "now">;
  try {
    portas = await deps.openRunPorts(body.operationRequestId);
  } catch {
    await liberar();
    return falhou(503, "DATAFORSEO_UNAVAILABLE", "O provider não está disponível para esta rodada. Nada foi pago.");
  }
  const pageFootprints = leitura.footprints.filter(pegada => payload.pageKeywordIds!.includes(pegada.keywordId));
  let desfecho: Awaited<ReturnType<typeof runReinforcementSearch>>;
  try {
    desfecho = await runReinforcementSearch({
      brandId: deps.store.brandId,
      plan,
      pages: leitura.particao.reinforcement,
      pageFootprints,
      publishedNormalized: leitura.marca.publishedNormalized,
      existingByNormalized: leitura.marca.existingByNormalized,
      operationRequestId: body.operationRequestId,
      authorizedPlan: body.authorizedPlan,
    }, { ...portas, now: deps.now });
  } catch (error) {
    // Parou no meio de uma rodada que pode ter pago: a prévia fica marcada e não roda de novo.
    try {
      await writeDifferentiationProposal(deps.store, { groupId: body.searchId, state: "planned", payload: { ...(semReserva as unknown as Record<string, unknown>), interrupted: { operationRequestId: body.operationRequestId, actorId: deps.store.actorUserId, startedAt: inicio } }, expected: reserva, subjectType: REINFORCEMENT_SEARCH_SUBJECT_TYPE });
    } catch {
      // A reserva parada vence em 30 minutos; "Nova busca" a substitui.
    }
    throw error;
  }
  if (!desfecho.ok) {
    await liberar();
    return falhou(desfecho.status, desfecho.code, desfecho.message, { plan });
  }
  const resultado = desfecho.result;
  const resultHash = await contentHash({ searchId: resultado.searchId, operationRequestId: resultado.operationRequestId, pages: resultado.pages });
  let proposta: { state: DifferentiationRowState; lockVersion: number } | null = null;
  let persistWarning: string | null = null;
  try {
    const gravada = await writeDifferentiationProposal(deps.store, {
      groupId: body.searchId,
      state: "proposed",
      payload: { ...(semReserva as unknown as Record<string, unknown>), run: { ...resultado, executedBy: deps.store.actorUserId }, resultHash },
      expected: reserva,
      subjectType: REINFORCEMENT_SEARCH_SUBJECT_TYPE,
    });
    proposta = { state: gravada.state, lockVersion: gravada.lockVersion };
  } catch (error) {
    persistWarning = error instanceof DifferentiationConflictError
      ? error.message
      : "A busca foi feita e paga, mas o resultado não pôde ser gravado agora. A SERP coletada já está no cache: rode de novo sem pagar outra vez pela mesma SERP.";
  }
  return { status: 200, body: { success: true, data: runData(resultado, resultHash, { proposal: proposta, persistWarning, paid: true, replayed: false }) } };
}
