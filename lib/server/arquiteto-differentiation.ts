import "server-only";

import { z } from "zod";
import type { ArticleDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { contentHash, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { buildSerpSubjectIndex, type KeywordSerpFootprint } from "@/lib/arquiteto/serp-subject-overlap";
import {
  DIFFERENTIATION_AI_SYSTEM_PROMPT,
  DIFFERENTIATION_CONTRACT_VERSION,
  DIFFERENTIATION_RUNNING_STALE_MS,
  buildDifferentiationAiPrompt,
  compactDifferentiationGroup,
  detectPublishedCannibalization,
  proposeDifferentiationAngles,
  readPageRanking,
  validateDifferentiationAiAngles,
  type DifferentiationAngle,
  type DifferentiationAiRejection,
  type DifferentiationDetection,
  type DifferentiationGroup,
  type DifferentiationPage,
  type DifferentiationProposalSummary,
  type DifferentiationRanking,
  type DifferentiationRowState,
} from "@/lib/arquiteto/published-differentiation";
import {
  DIFFERENTIATION_MAX_COST_USD,
  authorizeDifferentiationPlan,
  buildDifferentiationPlan,
  runPublishedDifferentiation,
  verifyDifferentiationPlanHash,
  type DifferentiationPlan,
  type DifferentiationRunPorts,
  type DifferentiationRunResult,
} from "@/lib/arquiteto/published-differentiation-run";
import {
  differentiationReadbackConfirms,
  planDifferentiationApply,
  type DifferentiationApplyArticle,
} from "@/lib/arquiteto/published-differentiation-apply";
import {
  DifferentiationConflictError,
  readDifferentiationArticleIndex,
  readDifferentiationBrandKeywords,
  readDifferentiationProposal,
  readDifferentiationProposalSummaries,
  readFreshPublishedPosts,
  readLatestArticleDnaVersion,
  readPublishedFootprints,
  writeDifferentiationProposal,
  type DifferentiationRow,
  type DifferentiationStoreContext,
} from "@/lib/server/arquiteto-differentiation-store";

/**
 * DIFERENCIAR PUBLICADOS — OS TRÊS PASSOS DO SERVIDOR (SDD §6).
 *
 *   plan   grátis: detecta pelo cache; com `groupId`, monta os ângulos (IA só
 *          com `ai: true`), o plano com a faixa de custo e o hash, e grava a
 *          prévia na proposta (`state = planned`). Nunca apaga uma avaliação
 *          paga nem desfaz "Manter como está": com avaliação gravada, só com
 *          `replaceEvaluation` (pedido na tela; a anterior vai ao histórico);
 *          grupo mantido com a mesma SERP é recusado. `resume` relê a prévia e
 *          a avaliação gravadas sem regravar nada (grátis).
 *   run    pago: a prévia vale UMA rodada. Exige o hash e o custo autorizado,
 *          confere o teto, relê os publicados e a SERP do grupo (mudou → nada
 *          é pago) e RESERVA a proposta (`planned` → `running`, trava por
 *          `lock_version`) ANTES de abrir o provider: outra aba ou outro
 *          membro, com outro `operationRequestId`, recebe 409 sem pagar. A
 *          MESMA rodada repetida (resposta perdida) devolve o resultado gravado.
 *   apply  humano: "Aceitar grupo" (exige o hash da avaliação) grava a nova
 *          versão de cada ArticleDNA pelo writer canônico, com readback;
 *          "Manter como está" registra a decisão até haver SERP nova.
 *
 * `brandId` e ator vêm do contexto resolvido no servidor. As portas pagas e o
 * gravador de versão são injetados: a rota monta os reais, o teste monta
 * dublês — nenhuma chamada paga em teste.
 */

const BrandIdSchema = z.string().min(1).max(80);
const GroupIdSchema = z.string().regex(/^dg-[0-9a-f]{16}$/, "Grupo inválido.");

/** Reexportado: a forma compacta do grupo mora no domínio (a tela e o MCP leem a mesma). */
export { compactDifferentiationGroup };

export const DifferentiationPlanRequestSchema = z.object({
  brandId: BrandIdSchema,
  groupId: GroupIdSchema.optional(),
  ai: z.boolean().default(false),
  /** Relê a prévia e a avaliação gravadas, sem regravar (grátis). */
  resume: z.boolean().optional(),
  /** Pedido explícito da tela: nova prévia sobre uma avaliação já paga (ela vai ao histórico). */
  replaceEvaluation: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if ((value.resume || value.replaceEvaluation) && !value.groupId) context.addIssue({ code: "custom", path: ["groupId"], message: "Informe o grupo." });
  if (value.resume && value.replaceEvaluation) context.addIssue({ code: "custom", path: ["resume"], message: "Reler ou planejar de novo, não os dois." });
});

export const DifferentiationRunRequestSchema = z.object({
  brandId: BrandIdSchema,
  groupId: GroupIdSchema,
  operationRequestId: z.string().uuid(),
  authorizedPlan: z.object({
    planHash: z.string().min(1).max(200),
    maxCostUsd: z.number().positive().max(DIFFERENTIATION_MAX_COST_USD),
  }).strict(),
}).strict();

export const DifferentiationApplyRequestSchema = z.object({
  brandId: BrandIdSchema,
  groupId: GroupIdSchema,
  decision: z.enum(["accept", "keep"]),
  evaluationHash: z.string().min(1).max(200).optional(),
  pageKeywordIds: z.array(z.string().min(1).max(80)).min(1).max(12).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "accept" && !value.evaluationHash) context.addIssue({ code: "custom", path: ["evaluationHash"], message: "Aceitar exige o hash da prévia avaliada." });
});

export type DifferentiationHandlerDeps = {
  store: DifferentiationStoreContext;
  now: () => Date;
  /** IA opcional: devolve o JSON cru; o domínio confere (ids, sementes, tamanho). */
  proposeAiAngles?: (prompt: { system: string; user: string }) => Promise<unknown>;
  /** Abre as portas pagas (credenciais só aqui). */
  openRunPorts?: (operationRequestId: string) => Promise<Omit<DifferentiationRunPorts, "now">>;
  /** Grava uma versão nova do ArticleDNA pelo writer canônico do Arquiteto. */
  persistArticleVersion?: (version: VersionEnvelope<ArticleDNA>) => Promise<{ status: "PERSISTED" | "UNCHANGED"; versionId: string }>;
};

export type DifferentiationHandlerOutcome = { status: number; body: Record<string, unknown> };

const falhou = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): DifferentiationHandlerOutcome => ({ status, body: { success: false, code, error: message, ...extra } });

const hostsDe = (pages: readonly Pick<DifferentiationPage, "url">[]) => [...new Set(pages.map(page => { try { return page.url ? new URL(page.url).hostname.replace(/^www\./, "") : null; } catch { return null; } }).filter((host): host is string => Boolean(host)))];

/* ----------------------------- leitura comum ----------------------------- */

type BrandReading = {
  detection: DifferentiationDetection;
  pages: DifferentiationPage[];
  footprints: KeywordSerpFootprint[];
  existingByNormalized: Map<string, string>;
  publishedNormalized: Set<string>;
  summaries: Map<string, DifferentiationProposalSummary>;
  egress: { queries: number; entriesRead: number; approxBytes: number; keywordRows: number };
};

/** Detecção grátis: publicados (Vínculo e Posto), artigos, SERP do cache e o resumo das propostas. */
async function readBrandDetection(deps: DifferentiationHandlerDeps): Promise<BrandReading> {
  const [keywords, artigos, propostas] = await Promise.all([
    readDifferentiationBrandKeywords(deps.store),
    readDifferentiationArticleIndex(deps.store),
    readDifferentiationProposalSummaries(deps.store),
  ]);
  const pages = keywords.pages.map(page => {
    const artigo = artigos.get(page.keywordId);
    return artigo ? { ...page, articleId: artigo.articleId, articleKeywordCount: artigo.keywordCount } : page;
  });
  const leitura = await readPublishedFootprints(deps.store, pages, deps.now());
  const indice = buildSerpSubjectIndex(leitura.footprints);
  const detection = detectPublishedCannibalization({ pages, serp: indice, brandHosts: hostsDe(pages), kept: propostas.kept });
  return {
    detection,
    pages,
    footprints: leitura.footprints,
    existingByNormalized: keywords.existingByNormalized,
    publishedNormalized: keywords.publishedNormalized,
    summaries: propostas.summaries,
    egress: { ...leitura.egress, keywordRows: keywords.rowsRead },
  };
}

/* ---------------------------------- plan ---------------------------------- */

type StoredRun = DifferentiationRunResult & { executedBy: string };

type ProposalPayload = {
  contract: typeof DIFFERENTIATION_CONTRACT_VERSION;
  groupId: string;
  group: DifferentiationGroup;
  angles: DifferentiationAngle[];
  aiRejected: DifferentiationAiRejection[];
  plan: DifferentiationPlan;
  plannedAt: string;
  plannedBy: string;
  run?: StoredRun;
  evaluationHash?: string;
  /** A rodada reservada antes de pagar (some ao terminar). */
  running?: { operationRequestId: string; actorId: string; startedAt: string };
  /** Avaliações substituídas por uma nova prévia: o que foi pago nunca some. */
  history?: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  kept?: { serpFingerprint: string; actorId: string; decidedAt: string };
};

const decisoesDe = (row: DifferentiationRow | null) => Array.isArray(row?.payload.decisions) ? row!.payload.decisions as Array<Record<string, unknown>> : [];
const historicoDe = (row: DifferentiationRow | null) => Array.isArray(row?.payload.history) ? row!.payload.history as Array<Record<string, unknown>> : [];
const HISTORICO_MAXIMO = 10;
/** O payload sem a reserva da rodada (ela só vive enquanto a rodada paga). */
const semReservaDe = <T extends object>(payload: T): T => { const copia = { ...payload } as T & { running?: unknown }; delete copia.running; return copia; };

const reservaParada = (payload: Partial<ProposalPayload>, now: Date) => {
  const inicio = payload.running?.startedAt ? Date.parse(payload.running.startedAt) : NaN;
  return !Number.isFinite(inicio) || now.getTime() - inicio > DIFFERENTIATION_RUNNING_STALE_MS;
};

/** O `data` da rodada, igual para a rodada nova e para a mesma rodada relida. */
function runData(groupId: string, resultado: DifferentiationRunResult, evaluationHash: string, extra: { proposal: { state: DifferentiationRowState; lockVersion: number } | null; persistWarning: string | null; paid: boolean; replayed: boolean }) {
  return {
    mode: "run",
    groupId,
    operationRequestId: resultado.operationRequestId,
    executedAt: resultado.executedAt,
    evaluation: resultado.evaluation,
    evaluationHash,
    costs: resultado.costs,
    serp: resultado.serp,
    labsFailures: resultado.labsFailures,
    adsVolumeFailed: resultado.adsVolumeFailed,
    refusedCount: Object.fromEntries(Object.entries(resultado.refused || {}).map(([id, lista]) => [id, lista.length])),
    ledgerRecording: resultado.ledgerRecording,
    ledgerWarning: resultado.ledgerWarning,
    notices: resultado.notices,
    ...extra,
  };
}

export async function handleDifferentiationPlan(deps: DifferentiationHandlerDeps, body: z.infer<typeof DifferentiationPlanRequestSchema>): Promise<DifferentiationHandlerOutcome> {
  const leitura = await readBrandDetection(deps);
  if (!body.groupId) {
    return {
      status: 200,
      body: {
        success: true,
        data: {
          mode: "detect",
          groups: leitura.detection.groups.map(group => compactDifferentiationGroup(group, leitura.summaries.get(group.groupId) ?? null)),
          withoutSerp: leitura.detection.withoutSerp,
          pagesMeasured: leitura.detection.pagesMeasured,
          publishedCount: leitura.pages.length,
          egress: leitura.egress,
          paid: false,
        },
      },
    };
  }
  const group = leitura.detection.groups.find(item => item.groupId === body.groupId);
  if (!group) return falhou(404, "DIFFERENTIATION_GROUP_NOT_FOUND", "Este grupo não aparece mais na SERP do cache (os publicados mudaram ou a SERP mudou). Releia o painel.");
  const atual = await readDifferentiationProposal(deps.store, group.groupId);
  const anterior = (atual?.payload || {}) as Partial<ProposalPayload>;

  // Reler: a prévia e a avaliação gravadas, sem regravar nada.
  if (body.resume) {
    if (!atual || !anterior.plan || !anterior.angles) return falhou(404, "DIFFERENTIATION_PLAN_REQUIRED", "Este grupo ainda não tem prévia gravada. Planeje-o.");
    const run = anterior.run && anterior.evaluationHash
      ? runData(group.groupId, anterior.run, anterior.evaluationHash, { proposal: { state: atual.state, lockVersion: atual.lockVersion }, persistWarning: null, paid: false, replayed: true })
      : null;
    return {
      status: 200,
      body: {
        success: true,
        data: {
          mode: "plan",
          group: compactDifferentiationGroup(group, leitura.summaries.get(group.groupId) ?? null),
          angles: anterior.angles,
          aiRejected: anterior.aiRejected || [],
          plan: anterior.plan,
          proposal: { state: atual.state, lockVersion: atual.lockVersion },
          run,
          stale: anterior.plan.serpFingerprint !== group.serpFingerprint,
          resumed: true,
          paid: false,
        },
      },
    };
  }

  // "Manter como está" é decisão humana: a prévia não a desfaz enquanto a SERP for a mesma.
  if (group.kept) return falhou(409, "DIFFERENTIATION_GROUP_KEPT", "Este grupo foi mantido como está para esta SERP. Ele volta ao painel quando a SERP mudar; nada foi gravado.");
  if (atual?.state === "running" && !reservaParada(anterior, deps.now())) {
    return falhou(409, "OPERATION_IN_PROGRESS", "Uma rodada deste grupo está em andamento. Aguarde o resultado; nada foi gravado.");
  }
  const temAvaliacao = Boolean(anterior.run) || atual?.state === "running";
  if (temAvaliacao && !body.replaceEvaluation) {
    return falhou(409, "DIFFERENTIATION_EVALUATION_PENDING", "Este grupo já tem uma rodada paga gravada. Reabra o resultado ou peça uma nova rodada na tela; nada foi apagado.");
  }

  let ai: ReturnType<typeof validateDifferentiationAiAngles> = { accepted: [], rejected: [] };
  const semIa = proposeDifferentiationAngles({ group });
  if (body.ai) {
    if (!deps.proposeAiAngles) {
      ai.rejected.push({ keywordId: null, reason: "A IA não está disponível aqui: o plano segue sem ela." });
    } else {
      try {
        const bruto = await deps.proposeAiAngles({ system: DIFFERENTIATION_AI_SYSTEM_PROMPT, user: buildDifferentiationAiPrompt(group, semIa) });
        ai = validateDifferentiationAiAngles(bruto, group);
      } catch {
        ai = { accepted: [], rejected: [{ keywordId: null, reason: "A IA não respondeu: o plano segue sem ela." }] };
      }
    }
  }
  const angles = ai.accepted.length ? proposeDifferentiationAngles({ group, ai: ai.accepted }) : semIa;
  const plan = await buildDifferentiationPlan({ brandId: deps.store.brandId, group, angles, aiUsed: ai.accepted.length > 0 });

  const agora = deps.now().toISOString();
  const arquivada = temAvaliacao
    ? [{
      replacedAt: agora,
      replacedBy: deps.store.actorUserId,
      planHash: anterior.plan?.planHash ?? null,
      operationRequestId: anterior.run?.operationRequestId ?? anterior.running?.operationRequestId ?? null,
      executedAt: anterior.run?.executedAt ?? null,
      evaluationHash: anterior.evaluationHash ?? null,
      evaluation: anterior.run ? { state: anterior.run.evaluation.state, reason: anterior.run.evaluation.reason, before: anterior.run.evaluation.before, after: anterior.run.evaluation.after, pages: anterior.run.evaluation.pages.map(pagina => ({ ...pagina, measured: [] })) } : null,
      costs: anterior.run?.costs ?? null,
      interrupted: !anterior.run,
    }]
    : [];
  const payload: ProposalPayload = {
    contract: DIFFERENTIATION_CONTRACT_VERSION,
    groupId: group.groupId,
    group,
    angles,
    aiRejected: ai.rejected,
    plan,
    plannedAt: agora,
    plannedBy: deps.store.actorUserId,
    history: [...historicoDe(atual), ...arquivada].slice(-HISTORICO_MAXIMO),
    decisions: decisoesDe(atual),
    // A decisão "Manter" de uma SERP anterior fica como histórico.
    ...(anterior.kept ? { kept: anterior.kept } : {}),
  };
  const gravada = await writeDifferentiationProposal(deps.store, { groupId: group.groupId, state: "planned", payload: payload as unknown as Record<string, unknown>, expected: atual });
  return {
    status: 200,
    body: {
      success: true,
      data: {
        mode: "plan",
        group: compactDifferentiationGroup(group, { state: gravada.state, hasRun: false, executedAt: null, runningSince: null }),
        angles,
        aiRejected: ai.rejected,
        plan,
        proposal: { state: gravada.state, lockVersion: gravada.lockVersion },
        run: null,
        stale: false,
        resumed: false,
        paid: false,
      },
    },
  };
}

/* ----------------------------------- run ----------------------------------- */

export async function handleDifferentiationRun(deps: DifferentiationHandlerDeps, body: z.infer<typeof DifferentiationRunRequestSchema>): Promise<DifferentiationHandlerOutcome> {
  const linha = await readDifferentiationProposal(deps.store, body.groupId);
  const payload = linha?.payload as Partial<ProposalPayload> | undefined;
  if (!linha || !payload?.plan || !payload.group || !payload.angles) return falhou(404, "DIFFERENTIATION_PLAN_REQUIRED", "Monte a prévia do grupo antes de rodar. Nada foi pago.");
  const plan = payload.plan as DifferentiationPlan;
  const group = payload.group as DifferentiationGroup;
  if (plan.brandId !== deps.store.brandId || plan.groupId !== body.groupId) return falhou(409, "PLAN_TAMPERED", "A prévia não é deste grupo nesta marca. Nada foi pago.");

  // A prévia vale UMA rodada.
  if (payload.run && payload.evaluationHash) {
    if (payload.run.operationRequestId === body.operationRequestId && plan.planHash === body.authorizedPlan.planHash) {
      // A mesma rodada (a resposta se perdeu): devolve o que foi gravado, sem pagar.
      return { status: 200, body: { success: true, data: runData(group.groupId, payload.run, payload.evaluationHash, { proposal: { state: linha.state, lockVersion: linha.lockVersion }, persistWarning: null, paid: false, replayed: true }) } };
    }
    return falhou(409, "DIFFERENTIATION_ALREADY_RUN", "Esta prévia já foi usada numa rodada paga. Reabra o resultado ou planeje uma nova rodada; nada foi pago.");
  }
  if (linha.state === "running") return falhou(409, "OPERATION_IN_PROGRESS", "Uma rodada deste grupo já está em andamento. Aguarde; nada foi pago de novo.");
  if (linha.state === "kept") return falhou(409, "DIFFERENTIATION_GROUP_KEPT", "Este grupo foi mantido como está. Nada foi pago.");
  if (linha.state !== "planned") return falhou(409, "DIFFERENTIATION_PLAN_REQUIRED", "Monte uma prévia nova antes de rodar. Nada foi pago.");

  // Hash e custo antes de qualquer gravação: pedido errado não mexe na proposta.
  if (!await verifyDifferentiationPlanHash(plan)) return falhou(409, "PLAN_TAMPERED", "O plano gravado não confere com o hash dele. Monte um plano novo; nada foi pago.", { plan });
  const autorizacao = authorizeDifferentiationPlan(plan, body.authorizedPlan);
  if (!autorizacao.ok) return falhou(autorizacao.code === "DIFFERENTIATION_PLAN_ABOVE_CAP" ? 422 : 409, autorizacao.code, autorizacao.message, { plan });

  // Os membros continuam publicados e o grupo é o mesmo? Tudo relido do banco e do cache (grátis).
  const marca = await readDifferentiationBrandKeywords(deps.store);
  const publicados = new Set(marca.pages.map(page => page.keywordId));
  const saiu = group.members.find(member => !publicados.has(member.page.keywordId));
  if (saiu) return falhou(409, "PLAN_STALE", `"${saiu.page.keyword}" não é mais um publicado desta marca. Releia o painel; nada foi pago.`);
  const pegadas = await readPublishedFootprints(deps.store, group.members.map(member => member.page), deps.now());
  const indice = buildSerpSubjectIndex(pegadas.footprints);
  const deNovo = detectPublishedCannibalization({ pages: group.members.map(member => member.page), serp: indice }).groups.find(item => item.groupId === group.groupId);
  if (!deNovo || deNovo.serpFingerprint !== plan.serpFingerprint) {
    return falhou(409, "PLAN_STALE", "A SERP do grupo mudou desde a prévia. Monte a prévia de novo; nada foi pago.");
  }
  if (!deps.openRunPorts) return falhou(503, "DATAFORSEO_UNAVAILABLE", "O provider não está disponível para esta rodada. Nada foi pago.");

  // Reserva ANTES de pagar: só um pedido passa por `lock_version`.
  const semReserva = semReservaDe(payload as ProposalPayload);
  let reserva: DifferentiationRow;
  try {
    reserva = await writeDifferentiationProposal(deps.store, {
      groupId: group.groupId,
      state: "running",
      payload: { ...semReserva, running: { operationRequestId: body.operationRequestId, actorId: deps.store.actorUserId, startedAt: deps.now().toISOString() } } as unknown as Record<string, unknown>,
      expected: linha,
    });
  } catch (error) {
    if (error instanceof DifferentiationConflictError) return falhou(409, "OPERATION_IN_PROGRESS", "Outra rodada deste grupo começou antes (outra aba ou outro membro). Nada foi pago.");
    return falhou(503, "PROPOSAL_UNAVAILABLE", "A proposta não pôde ser reservada antes de pagar. Nada foi pago.");
  }
  const liberar = async () => {
    try {
      await writeDifferentiationProposal(deps.store, { groupId: group.groupId, state: "planned", payload: semReserva as unknown as Record<string, unknown>, expected: reserva });
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
  let desfecho: Awaited<ReturnType<typeof runPublishedDifferentiation>>;
  try {
    desfecho = await runPublishedDifferentiation({
      brandId: deps.store.brandId,
      plan,
      group,
      angles: payload.angles as DifferentiationAngle[],
      pageFootprints: pegadas.footprints,
      publishedNormalized: marca.publishedNormalized,
      existingByNormalized: marca.existingByNormalized,
      operationRequestId: body.operationRequestId,
      authorizedPlan: body.authorizedPlan,
    }, { ...portas, now: deps.now });
  } catch (error) {
    await liberar();
    throw error;
  }
  // Tudo o que volta sem resultado foi recusado ANTES de pagar: a prévia volta a valer.
  if (!desfecho.ok) {
    await liberar();
    return falhou(desfecho.status, desfecho.code, desfecho.message, { plan });
  }

  const resultado = desfecho.result;
  const evaluationHash = await contentHash({ groupId: resultado.groupId, operationRequestId: resultado.operationRequestId, evaluation: resultado.evaluation });
  // O que foi pago nunca se perde: falha ao gravar a proposta vira aviso, com o resultado.
  let proposta: { state: DifferentiationRowState; lockVersion: number } | null = null;
  let persistWarning: string | null = null;
  try {
    const gravada = await writeDifferentiationProposal(deps.store, {
      groupId: group.groupId,
      state: "proposed",
      payload: {
        ...(semReserva as unknown as Record<string, unknown>),
        run: { ...resultado, candidates: Object.fromEntries(Object.entries(resultado.candidates).map(([id, lista]) => [id, lista.slice(0, 20)])), executedBy: deps.store.actorUserId },
        evaluationHash,
      },
      expected: reserva,
    });
    proposta = { state: gravada.state, lockVersion: gravada.lockVersion };
  } catch (error) {
    persistWarning = error instanceof DifferentiationConflictError
      ? error.message
      : "A avaliação foi feita e paga, mas não pôde ser gravada agora. Guarde o resultado e tente gravar de novo; a SERP coletada já está no cache.";
  }
  return { status: 200, body: { success: true, data: runData(group.groupId, resultado, evaluationHash, { proposal: proposta, persistWarning, paid: true, replayed: false }) } };
}

/* ---------------------------------- apply ---------------------------------- */

export async function handleDifferentiationApply(deps: DifferentiationHandlerDeps, body: z.infer<typeof DifferentiationApplyRequestSchema>): Promise<DifferentiationHandlerOutcome> {
  const linha = await readDifferentiationProposal(deps.store, body.groupId);
  const agora = deps.now().toISOString();
  if (linha?.state === "running" && !reservaParada(linha.payload as Partial<ProposalPayload>, deps.now())) {
    return falhou(409, "OPERATION_IN_PROGRESS", "Uma rodada deste grupo está em andamento. Aguarde o resultado; nada foi gravado.");
  }

  if (body.decision === "keep") {
    // "Manter como está" vale para a SERP de AGORA: o grupo volta quando ela mudar.
    const leitura = await readBrandDetection(deps);
    const group = leitura.detection.groups.find(item => item.groupId === body.groupId);
    if (!group) return falhou(404, "DIFFERENTIATION_GROUP_NOT_FOUND", "Este grupo não aparece mais na SERP do cache. Releia o painel.");
    const anterior = (linha?.payload || {}) as Partial<ProposalPayload>;
    const semReserva = semReservaDe(anterior);
    const kept = { serpFingerprint: group.serpFingerprint, actorId: deps.store.actorUserId, decidedAt: agora };
    const gravada = await writeDifferentiationProposal(deps.store, {
      groupId: group.groupId,
      state: "kept",
      payload: {
        ...(semReserva as Record<string, unknown>),
        contract: DIFFERENTIATION_CONTRACT_VERSION,
        groupId: group.groupId,
        group,
        kept,
        decisions: [...decisoesDe(linha), { decision: "keep", actorId: deps.store.actorUserId, decidedAt: agora, serpFingerprint: group.serpFingerprint }],
      },
      expected: linha,
    });
    return { status: 200, body: { success: true, data: { mode: "apply", decision: "keep", groupId: group.groupId, kept, proposal: { state: gravada.state, lockVersion: gravada.lockVersion }, readbackConfirmed: gravada.state === "kept" } } };
  }

  const payload = linha?.payload as Partial<ProposalPayload> | undefined;
  if (!linha || !payload?.run || !payload.group || !payload.evaluationHash) return falhou(404, "DIFFERENTIATION_EVALUATION_REQUIRED", "Rode a busca do grupo antes de aceitar.");
  if (payload.evaluationHash !== body.evaluationHash) return falhou(409, "PREVIEW_CHANGED", "A proposta mudou desde a prévia que você viu. Recarregue antes de aceitar; nada foi gravado.");
  if (!deps.persistArticleVersion) return falhou(503, "ARTICLE_WRITER_UNAVAILABLE", "O gravador do ArticleDNA não está disponível. Nada foi gravado.");

  const group = payload.group as DifferentiationGroup;
  const run = payload.run as DifferentiationRunResult;
  const membros = group.members.map(member => member.page.keywordId);
  const selecionadas = body.pageKeywordIds ? new Set(body.pageKeywordIds.filter(id => membros.includes(id))) : null;
  if (selecionadas && !selecionadas.size) return falhou(400, "PAGES_NOT_IN_GROUP", "Nenhuma das páginas escolhidas é deste grupo.");
  if (!selecionadas && !run.evaluation.pages.some(pagina => pagina.state === "differentiated")) {
    return falhou(409, "NOTHING_TO_APPLY", "Nenhuma página ficou Diferenciada. Marque as páginas que devem receber só a nota do ângulo, ou mantenha o grupo como está. Nada foi gravado.");
  }

  const [postos, indiceDeArtigos, marca] = await Promise.all([
    readFreshPublishedPosts(deps.store, membros),
    readDifferentiationArticleIndex(deps.store),
    readDifferentiationBrandKeywords(deps.store),
  ]);
  // Q3 relido agora, como o Posto: página que passou a aparecer no Google não troca a principal.
  let rankings: Map<string, DifferentiationRanking> | null;
  try {
    const paginasAgora = group.members.map(member => marca.pages.find(page => page.keywordId === member.page.keywordId) ?? member.page);
    const leitura = await readPublishedFootprints(deps.store, paginasAgora, deps.now());
    const porId = new Map(leitura.footprints.map(pegada => [pegada.keywordId, pegada]));
    const hosts = hostsDe(marca.pages);
    rankings = new Map(paginasAgora.map(page => [page.keywordId, readPageRanking(page, porId.get(page.keywordId), hosts)]));
  } catch {
    rankings = null;
  }
  const articles = new Map<string, DifferentiationApplyArticle | null>();
  const versoes = new Map<string, VersionEnvelope<ArticleDNA>>();
  for (const id of membros) {
    const entrada = indiceDeArtigos.get(id);
    const versao = entrada ? await readLatestArticleDnaVersion(deps.store, entrada.articleId) : null;
    if (versao) versoes.set(id, versao);
    articles.set(id, versao ? { articleId: versao.entityId, payload: versao.payload } : null);
  }
  const plano = planDifferentiationApply({
    groupId: group.groupId,
    members: group.members,
    results: run.evaluation.pages,
    articles,
    currentPosts: postos,
    currentRankings: rankings,
    existingByNormalized: marca.existingByNormalized,
    footprints: run.footprints,
    actorId: deps.store.actorUserId,
    decidedAt: agora,
    selectedPageIds: selecionadas,
  });

  const paginas: Array<Record<string, unknown>> = [];
  for (const pagina of plano.pages) {
    const atual = versoes.get(pagina.keywordId) ?? null;
    let escrita: { versionId: string | null; readbackConfirmed: boolean; error: string | null } = { versionId: null, readbackConfirmed: false, error: null };
    if (pagina.nextPayload && atual) {
      try {
        const sucessora = await createVersionEnvelope({
          entityId: atual.entityId,
          versionNumber: atual.versionNumber + 1,
          previousVersionId: atual.versionId,
          origin: "human",
          changeReason: pagina.changeReason,
          createdBy: deps.store.actorUserId,
          payload: pagina.nextPayload,
        });
        const gravada = await deps.persistArticleVersion(sucessora as VersionEnvelope<ArticleDNA>);
        // Gravar não é sucesso: a releitura precisa trazer a nota e a mesma identidade.
        const relida = await readLatestArticleDnaVersion(deps.store, atual.entityId);
        const confirma = Boolean(relida) && differentiationReadbackConfirms({ written: pagina.nextPayload, readback: relida?.payload ?? null, previous: atual.payload });
        escrita = { versionId: relida?.versionId ?? gravada.versionId, readbackConfirmed: confirma, error: confirma ? null : "A releitura não confirmou a versão nova." };
      } catch (error) {
        escrita = { versionId: null, readbackConfirmed: false, error: error instanceof Error ? error.message.slice(0, 200) : "A gravação falhou." };
      }
    }
    paginas.push({
      keywordId: pagina.keywordId,
      keyword: pagina.keyword,
      articleId: pagina.articleId,
      written: Boolean(escrita.versionId) && escrita.readbackConfirmed,
      versionId: escrita.versionId,
      readbackConfirmed: pagina.nextPayload ? escrita.readbackConfirmed : null,
      error: escrita.error,
      swap: pagina.swap,
      formation: pagina.formation,
      ingest: pagina.ingest,
      refusal: pagina.refusal,
    });
  }

  const pendente = plano.pages.some(pagina => pagina.formation.length || pagina.ingest.length || pagina.refusal || (pagina.swap.keyword && !pagina.swap.applied));
  const falhas = paginas.some(pagina => pagina.error);
  const estado: DifferentiationRowState = !pendente && !falhas ? "applied" : "partially_applied";
  const decisao = {
    decision: "accept",
    actorId: deps.store.actorUserId,
    decidedAt: agora,
    evaluationHash: body.evaluationHash,
    selectedPageIds: selecionadas ? [...selecionadas] : null,
    pages: paginas.map(pagina => ({ keywordId: pagina.keywordId, articleId: pagina.articleId, versionId: pagina.versionId, written: pagina.written, swapApplied: (pagina.swap as { applied: boolean }).applied })),
    ingestBatches: plano.ingestBatches,
  };
  let proposta: { state: DifferentiationRowState; lockVersion: number } | null = null;
  let persistWarning: string | null = null;
  try {
    const semReserva = semReservaDe(payload);
    const gravada = await writeDifferentiationProposal(deps.store, { groupId: group.groupId, state: estado, payload: { ...(semReserva as Record<string, unknown>), decisions: [...decisoesDe(linha), decisao] }, expected: linha });
    proposta = { state: gravada.state, lockVersion: gravada.lockVersion };
  } catch (error) {
    persistWarning = error instanceof Error ? error.message : "A decisão não pôde ser registrada na proposta.";
  }
  const readbackConfirmed = paginas.every(pagina => pagina.readbackConfirmed !== false) && Boolean(proposta);
  return {
    status: 200,
    body: {
      success: true,
      data: {
        mode: "apply",
        decision: "accept",
        groupId: group.groupId,
        pages: paginas,
        ingestBatches: plano.ingestBatches.map(lote => ({ ...lote, searchId: run.operationRequestId, subjectKeywordId: null })),
        proposal: proposta,
        persistWarning,
        readbackConfirmed,
      },
    },
  };
}
