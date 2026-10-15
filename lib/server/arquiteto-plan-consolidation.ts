import "server-only";

import { choosePlanSiloTerritory, confirmedTerritoryDraft, declaredPlanSiloDraft, declaredPlanSiloNote } from "@/lib/arquiteto/declared-plan-silo";
import { normalizeManualSiloPageSlug } from "@/lib/arquiteto/manual-silo";
import {
  choosePlanConsolidationTerritory, planConsolidationDecisionHash, planConsolidationLines, planConsolidationSummary, planSiloPairStep, planTerritoryChoiceSentence,
  type PlanConsolidationLine, type PlanSiloPairStep, type PlanTerritoryChoice,
} from "@/lib/arquiteto/plan-consolidation";
import type { SiloDeclaredPlanResult } from "./arquiteto-silo-declared-plan";
import { EDITORIAL_GROUP_COLOR_LABELS } from "@/lib/editorial/editorial-groups";
import { linkEditorialGroupSilo, listEditorialGroupPlans, type EditorialGroupPlanRow } from "@/lib/editorial/editorial-groups-store";
import { readDeclaredSiloPlan } from "@/lib/minerador/declared-plan";
import { readPlanConsolidationInputs, writePlanArticleFromPlan, type ImprovementRuntime, type PlanConsolidationInputs } from "./arquiteto-article-improvement";
import { assignPlanGroupKeywordsToTerritory, canApprove } from "./arquiteto-declared-plan-silo";
import { createTerritoryWorkflowItem, listTerritoryWorkflowItems, updateTerritoryWorkflowItem, type TerritoryWorkflowItem } from "./arquiteto-territory-store";
import { PipelineRuntimeError, type PipelineContext } from "./pipeline-runtime";

/**
 * "CONSOLIDAR O SILO DO PLANO" (2026-10-14, noite; pedido do dono, adendo na
 * SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`).
 *
 * POST `/api/arquiteto/plan-silo/consolidate` `{ brandId, groupId, mode,
 * decisionHash?, acceptedKeywordIds?, keywordId? }`:
 *
 *  - prévia (grátis, só leitura): o Silo do plano (já existe / confirmar /
 *    criar), e por artigo do plano: gravar o ArticleDNA v1 a partir do plano,
 *    manter o já formado, ou recusar só esta linha — com os alertas (volume,
 *    SERP na etapa 2). `decisionHash` cobre o grupo, a versão do plano e a
 *    composição de cada linha aceita.
 *  - aplicar (o MESMO hash, uma linha por chamada — a tela repete a chamada
 *    para cada linha aceita, sem novo aceite): confirma/cria o Silo do plano e
 *    põe nele as keywords do grupo sem Silo (os núcleos do envio), e grava o
 *    ArticleDNA v1 da linha pelo núcleo da formação, sem SERP e sem IA. Linha
 *    já gravada por esta mesma consolidação volta como "mantida" (idempotente).
 *
 * O SiloDNA e a SiloPage (Pilar e ordem do plano) são gravados em seguida pela
 * consolidação canônica de sempre (`/api/arquiteto/silo-consolidation`), que a
 * tela chama depois das linhas. Nada aqui grava no Minerador; nada é pago.
 */

export class PlanConsolidationStaleError extends Error {
  readonly code = "PLAN_CONSOLIDATION_STALE";
  constructor() { super("O plano, o Silo ou um artigo mudou desde a prévia. Gere a prévia de novo; nada foi gravado por esta linha."); }
}

const refusal = (message: string) => new PipelineRuntimeError("CONFLICT", message, 409);

export type PlanConsolidationPreview = {
  groupId: string;
  groupLabel: string;
  planVersion: number;
  siloName: string;
  siloSlug: string | null;
  objective: string | null;
  territory: PlanTerritoryChoice & { sentence: string };
  lines: PlanConsolidationLine[];
  /** A keyword do Pilar do plano (o SiloDNA aponta o artigo dela). */
  pillarKeywordId: string | null;
  summary: string;
  /** Linhas aceitas pela confirmação: as que vão gravar. */
  acceptedKeywordIds: string[];
  decisionHash: string;
  /**
   * 2026-10-15 (caso WifiConecta) · aditivo: o par SiloDNA + SiloPage do Silo
   * do plano — falta (grava o v1 depois das linhas), em dia, ou "Corrigir a
   * página do Silo (vN+1)" pelo núcleo de "Aplicar o plano declarado ao Silo"
   * (o `decisionHash` dele vai junto; a tela grava na mesma confirmação). Só
   * a prévia lê isto; aplicar uma linha não depende dele.
   */
  siloPair?: PlanSiloPairStep;
};

export type PlanConsolidationApplyResult = {
  keywordId: string;
  status: "written" | "kept" | "refused";
  message: string;
  articleId: string | null;
  versionId: string | null;
  territoryRef: string | null;
  preview: PlanConsolidationPreview;
};

/** Injetáveis (testes): o relógio, a leitura dos grupos com plano, as entradas da mesa, a gravação e a prévia do plano no Silo. */
type Deps = {
  now?: () => string;
  groupPlans?: (context: PipelineContext) => Promise<EditorialGroupPlanRow[]>;
  inputs?: (context: PipelineContext) => Promise<PlanConsolidationInputs>;
  write?: typeof writePlanArticleFromPlan;
  /** 2026-10-15 · a prévia de "Aplicar o plano declarado ao Silo" (padrão: o núcleo real, só leitura). */
  siloPlanPreview?: (context: PipelineContext, siloId: string) => Promise<SiloDeclaredPlanResult>;
  /** 2026-10-15 · o vínculo do grupo com o Silo (padrão: `linkEditorialGroupSilo`, aditivo e nunca fatal). */
  linkGroup?: (context: PipelineContext, input: { groupId: string; siloId: string }) => Promise<unknown>;
};

async function readGroup(context: PipelineContext, groupId: string, deps: Deps) {
  let grupos: EditorialGroupPlanRow[];
  if (deps.groupPlans) grupos = await deps.groupPlans(context);
  else {
    const planos = await listEditorialGroupPlans(context.supabase, context.brandId);
    if (!planos.ok) throw refusal("Os grupos ainda não estão disponíveis neste banco.");
    grupos = planos.groups;
  }
  const grupo = grupos.find(item => item.id === groupId && item.status === "active");
  const plano = grupo ? readDeclaredSiloPlan(grupo.plan) : null;
  if (!grupo || !plano) throw refusal("Este grupo não tem plano declarado: não há Silo do plano para consolidar.");
  const cor = EDITORIAL_GROUP_COLOR_LABELS[grupo.color];
  return { grupo, plano, rotulo: `${cor}${grupo.name && grupo.name !== cor ? ` (${grupo.name})` : ""}` };
}

function territoryViews(territorios: readonly TerritoryWorkflowItem[]) {
  return territorios.map(item => ({
    territoryRef: item.territoryRef,
    lifecycleStatus: item.territory.lifecycleStatus,
    name: item.territory.name,
    slugs: [item.territory.slugState.publishedSlug, item.territory.slugState.confirmed, ...item.territory.slugState.proposals.map(proposal => proposal.slug)],
  }));
}

async function buildPreview(context: PipelineContext, groupId: string, deps: Deps, accepted?: readonly string[]): Promise<{ preview: PlanConsolidationPreview; inputs: PlanConsolidationInputs; territories: TerritoryWorkflowItem[]; plano: NonNullable<ReturnType<typeof readDeclaredSiloPlan>>; rotulo: string; linkedSiloId: string | null }> {
  const { grupo, plano, rotulo } = await readGroup(context, groupId, deps);
  const [inputs, territorios] = await Promise.all([(deps.inputs ?? readPlanConsolidationInputs)(context), listTerritoryWorkflowItems(context)]);
  const vistas = territoryViews(territorios);
  const doPlano = [...inputs.standings.values()].filter(standing => standing.plan?.groupId === groupId && standing.declared && standing.received);
  const escolhaDoEnvio = choosePlanSiloTerritory({ plan: plano, linkedTerritoryRef: grupo.siloId, territories: vistas, slugOf: normalizeManualSiloPageSlug });
  const escolha = choosePlanConsolidationTerritory({
    rowTerritoryRefs: doPlano.map(standing => {
      const ref = inputs.rows.get(standing.keywordId)?.territoryRef;
      return typeof ref === "string" && ref ? ref : null;
    }),
    territories: vistas,
    fallback: escolhaDoEnvio.kind === "linked" || escolhaDoEnvio.kind === "slug" ? { kind: escolhaDoEnvio.kind, territoryRef: escolhaDoEnvio.territoryRef } : escolhaDoEnvio,
  });
  const territoryRef = "territoryRef" in escolha ? escolha.territoryRef : null;
  const dono = new Map<string, string>();
  for (const article of inputs.workspace.articleDnas) for (const reference of article.payload.keywordReferences) dono.set(reference.keywordId, article.payload.subject?.keywordId ?? article.payload.articleId);
  const articles = inputs.workspace.articleDnas.map(version => ({
    articleId: version.payload.articleId,
    versionNumber: version.versionNumber,
    subjectKeywordId: version.payload.subject?.keywordId ?? null,
    principalKeywordId: version.payload.principalKeywordId ?? null,
    keywordIds: version.payload.keywordReferences.map(reference => reference.keywordId),
    slug: version.payload.suggestedSlug ?? null,
    siloRef: version.payload.siloId ?? version.payload.territoryRef ?? null,
    siloLabel: territorios.find(item => item.territoryRef === (version.payload.territoryRef ?? version.payload.siloId))?.territory.name ?? null,
    subjectPhrase: version.payload.subject?.phrase ?? null,
    serpAssessed: Boolean(version.payload.serpAssessmentRef),
  }));
  const lines = planConsolidationLines({
    brandId: context.brandId,
    groupId,
    rows: inputs.rows as unknown as ReadonlyMap<string, Record<string, unknown>>,
    standings: inputs.standings,
    articles,
    ownerOf: keywordId => { const quem = dono.get(keywordId); return quem && quem !== keywordId ? quem : null; },
    hasIntent: inputs.hasIntent,
    territoryRef,
    now: new Date(deps.now?.() ?? Date.now()),
  });
  const aceitas = accepted ? [...accepted] : lines.filter(line => line.action === "write").map(line => line.keywordId);
  const preview: PlanConsolidationPreview = {
    groupId,
    groupLabel: rotulo,
    planVersion: grupo.planVersion,
    siloName: plano.siloName,
    siloSlug: plano.siloSlug ?? null,
    objective: plano.objective ?? null,
    territory: { ...escolha, sentence: planTerritoryChoiceSentence(escolha, plano.siloName) },
    lines,
    pillarKeywordId: lines.find(line => line.role === "Pilar")?.keywordId ?? null,
    summary: planConsolidationSummary(lines),
    acceptedKeywordIds: aceitas,
    decisionHash: planConsolidationDecisionHash({ groupId, planVersion: grupo.planVersion, lines, acceptedKeywordIds: aceitas }),
  };
  return { preview, inputs, territories: territorios, plano, rotulo, linkedSiloId: grupo.siloId };
}

export async function previewPlanConsolidation(context: PipelineContext, groupId: string, deps: Deps = {}): Promise<PlanConsolidationPreview> {
  const lido = await buildPreview(context, groupId, deps);
  // 2026-10-15 · o par do Silo do plano: falta, em dia, ou "Corrigir a página do Silo (vN+1)" (o núcleo de "Aplicar o plano declarado ao Silo").
  const territoryRef = "territoryRef" in lido.preview.territory ? lido.preview.territory.territoryRef : null;
  const siloDna = territoryRef
    ? lido.inputs.workspace.siloDnas
      .filter(version => version.payload.territoryRef === territoryRef || version.payload.siloId === territoryRef)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
    : null;
  let previa: SiloDeclaredPlanResult | null = null;
  if (siloDna) {
    // Import tardio: só a prévia precisa do núcleo do plano no Silo (e a gravação do par não entra no grafo de quem só aplica linhas).
    const padrao = async (ctx: PipelineContext, siloId: string) => {
      const { handleSiloDeclaredPlan, siloDeclaredPlanRuntime } = await import("./arquiteto-silo-declared-plan");
      return handleSiloDeclaredPlan(siloDeclaredPlanRuntime(ctx), { siloId, mode: "preview" });
    };
    try { previa = await (deps.siloPlanPreview ?? padrao)(context, siloDna.payload.siloId); }
    catch { previa = null; }
  }
  const siloPair = planSiloPairStep({
    siloId: siloDna?.payload.siloId ?? null,
    currentVersion: siloDna?.versionNumber ?? null,
    declaredPlan: previa === null ? null
      : previa.state === "REFUSED" ? { state: "REFUSED", message: previa.message }
      : previa.mode === "preview" ? { state: previa.state, changes: previa.changes, decisionHash: previa.decisionHash, siloDnaVersionId: previa.siloDnaVersionId }
      : null,
  });
  return { ...lido.preview, siloPair };
}

/** O Silo do plano: confirmar o candidato, criar quando não existe, pôr nele as keywords do grupo sem Silo. Idempotente. */
async function ensurePlanTerritory(context: PipelineContext, input: Awaited<ReturnType<typeof buildPreview>>, agora: string, deps: Deps = {}): Promise<string> {
  const escolha = input.preview.territory;
  if (escolha.kind === "split" || escolha.kind === "rejected") throw refusal(escolha.sentence);
  let territorios = input.territories;
  let territorio: TerritoryWorkflowItem;
  if (escolha.kind === "create") {
    territorio = await createTerritoryWorkflowItem(context, declaredPlanSiloDraft({
      plan: input.plano,
      slugOf: normalizeManualSiloPageSlug,
      note: declaredPlanSiloNote({ groupLabel: input.rotulo, planVersion: input.preview.planVersion, actorUserId: context.actorUserId, at: agora }),
    }));
    territorios = [...territorios, territorio];
  } else {
    const achado = territorios.find(item => item.territoryRef === escolha.territoryRef);
    if (!achado) throw new PlanConsolidationStaleError();
    territorio = achado;
  }
  if (territorio.territory.lifecycleStatus === "candidate") {
    if (!(await canApprove(context))) throw refusal("Confirmar o Silo do plano exige a permissão de aprovar no Arquiteto.");
    territorio = await updateTerritoryWorkflowItem(context, territorio.territoryRef, territorio.lockVersion, confirmedTerritoryDraft(territorio.territory as unknown as Record<string, unknown>));
    territorios = territorios.map(item => item.territoryRef === territorio.territoryRef ? territorio : item);
  }
  await assignPlanGroupKeywordsToTerritory(context, { groupId: input.preview.groupId, territoryRef: territorio.territoryRef, territories: territorios, decidedAt: agora });
  // O grupo passa a apontar para o Silo do plano (aditivo; nunca derruba). 2026-10-15: também quando o
  // vínculo aponta para um Silo que não existe mais — a store religa só nesse caso e recusa trocar Silo vivo.
  if (input.linkedSiloId !== territorio.territoryRef) {
    const ligar = deps.linkGroup ?? ((ctx: PipelineContext, item: { groupId: string; siloId: string }) => linkEditorialGroupSilo(ctx.supabase, { brandId: ctx.brandId, actorUserId: ctx.actorUserId, groupId: item.groupId, siloId: item.siloId }));
    await Promise.resolve().then(() => ligar(context, { groupId: input.preview.groupId, siloId: territorio.territoryRef })).catch(() => null);
  }
  return territorio.territoryRef;
}

/**
 * Aplica a consolidação para UMA linha aceita (a tela chama uma vez por linha,
 * com o mesmo hash da prévia). A primeira chamada também confirma/cria o Silo.
 */
export async function applyPlanConsolidationLine(runtime: ImprovementRuntime, input: { groupId: string; decisionHash: string; acceptedKeywordIds: readonly string[]; keywordId: string }, deps: Deps = {}): Promise<PlanConsolidationApplyResult> {
  const context = runtime.context;
  if (!input.acceptedKeywordIds.includes(input.keywordId)) throw refusal("Esta linha não foi aceita na prévia.");
  const lido = await buildPreview(context, input.groupId, deps, input.acceptedKeywordIds);
  if (lido.preview.decisionHash !== input.decisionHash) throw new PlanConsolidationStaleError();
  const agora = deps.now?.() ?? new Date().toISOString();
  const territoryRef = await ensurePlanTerritory(context, lido, agora, deps);
  // Relido depois do Silo: a linha agora tem o território do plano.
  const relido = await buildPreview(context, input.groupId, deps, input.acceptedKeywordIds);
  if (relido.preview.decisionHash !== input.decisionHash) throw new PlanConsolidationStaleError();
  const line = relido.preview.lines.find(item => item.keywordId === input.keywordId);
  if (!line) throw new PlanConsolidationStaleError();
  if (line.action === "keep") return { keywordId: line.keywordId, status: "kept", message: line.sentence, articleId: line.articleId, versionId: null, territoryRef, preview: relido.preview };
  if (line.action === "refused") return { keywordId: line.keywordId, status: "refused", message: line.sentence, articleId: null, versionId: null, territoryRef, preview: relido.preview };
  const gravado = await (deps.write ?? writePlanArticleFromPlan)(runtime, relido.inputs, {
    subjectKeywordId: line.keywordId,
    principalId: line.principalId!,
    memberIds: line.memberIds,
    decisionRef: input.decisionHash.slice(0, 16),
    reason: `Consolidado do plano do Minerador: ${line.role} · ${line.order}º, principal do plano, escopo como promessa.${line.alerts.length ? ` Alertas: ${line.alerts.join("; ")}.` : ""}`,
  });
  const depois = await buildPreview(context, input.groupId, deps, input.acceptedKeywordIds);
  return { keywordId: line.keywordId, status: "written", message: `ArticleDNA v${gravado.versionNumber} gravado e relido (consolidado do plano, sem SERP).${line.alerts.length ? ` Alertas: ${line.alerts.join("; ")}.` : ""}`, articleId: gravado.articleId, versionId: gravado.versionId, territoryRef, preview: depois.preview };
}
