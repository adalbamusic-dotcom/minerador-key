import "server-only";

import { createHash } from "node:crypto";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "@/lib/arquiteto/contracts";
import {
  buildSiloDeclaredPlanVersions,
  planSiloDeclaredPlanApplication,
  stableJson,
  type SiloDeclaredPlanRefusalCode,
} from "@/lib/arquiteto/silo-declared-plan-application";
import { declaredSubjectAuthorship, type DeclaredSiloPlanEntry } from "@/lib/arquiteto/silo-declared-plan";
import { declaredPlanStandings } from "@/lib/arquiteto/declared-plan-formation";
import { readArchitectSubjectStanding } from "@/lib/arquiteto/declared-subject";
import { buildCanonicalWorkflowWorkspaceItems } from "@/lib/arquiteto/canonical-workspace";
import { readDeclaredSiloPlan, type DeclaredSiloPlan } from "@/lib/minerador/declared-plan";
import { listEditorialGroupPlans } from "@/lib/editorial/editorial-groups-store";
import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError } from "./pipeline-runtime";
import { persistSiloPairAtomic } from "./arquiteto-persistence";
import { loadCanonicalArquitetoWorkspace } from "./arquiteto-workspace";
import { linkDeclaredPlanGroupToSilo, type SiloGroupLinkOutcome } from "./arquiteto-silo-group-link";
import { listTerritoryWorkflowItems, updateTerritoryWorkflowItem } from "./arquiteto-territory-store";
import { reworkGuardPort, type ReworkGuardPort, type ReworkOperation } from "./rework-guard";
import { operationFingerprint, reworkView, type ReworkView } from "@/lib/editorial/rework-guard";

/**
 * ===== APLICAR O PLANO DECLARADO AO SILO — SERVIDOR (2026-10-12) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §11 passo 7.
 * O plano e as recusas são de `lib/arquiteto/silo-declared-plan-application.ts`;
 * aqui só se lê, grava e relê — o mesmo desenho de "Retirar artigo do Silo".
 *
 * LEITURA: a mesma da mesa (`loadCanonicalArquitetoWorkspace`), que já tira os
 * ArticleDNA rejeitados e entrega as keywords com o pacote aprovado (de onde
 * sai o plano de cada Assunto); o Silo planejado vem de `editorial_groups.plan`.
 *
 * ESCRITA: o par SiloDNA + SiloPage pelo `persistSiloPairAtomic`, o caminho
 * transacional do par canônico. Sucesso só depois da releitura. Depois dela, o
 * vínculo aditivo `editorial_groups.silo_id` (`linkDeclaredPlanGroupToSilo`,
 * o mesmo da consolidação), que nunca derruba a gravação.
 *
 * A prévia devolve `decisionHash` (versões vigentes + payloads novos): a tela e
 * o MCP aplicam só com o mesmo hash — o que a pessoa aceitou é o que é gravado.
 */

export type SiloDeclaredPlanRequest = {
  siloId: string;
  mode: "preview" | "apply";
  expectedSiloDnaVersionId?: string | null;
  decisionHash?: string | null;
};

export type SiloDeclaredPlanInputs = {
  articleDnas: VersionEnvelope<ArticleDNA>[];
  siloDnas: VersionEnvelope<SiloDNA>[];
  siloPages: VersionEnvelope<SiloPage>[];
  statuses: Array<{ versionId: string; status: string }>;
  entries: DeclaredSiloPlanEntry[];
  groupPlans: Map<string, DeclaredSiloPlan>;
  /** 2026-10-15 · aditivo: a versão vigente do plano de cada grupo (a que se diz). */
  groupPlanVersions?: Map<string, number>;
};

export type SiloDeclaredPlanDeps = {
  brandId: string;
  actorUserId: string;
  readInputs: () => Promise<SiloDeclaredPlanInputs>;
  persistPair: (
    siloDna: VersionEnvelope<SiloDNA>,
    siloPage: VersionEnvelope<SiloPage>,
    statuses: { siloDna: string; siloPage: string },
  ) => Promise<{ siloDna: VersionEnvelope<SiloDNA>; siloPage: VersionEnvelope<SiloPage> }>;
  linkGroup: (input: { siloId: string; articleVersionIds: string[] }) => Promise<SiloGroupLinkOutcome>;
  /** F5 — a guarda de retrabalho (linha `operation_ledger`); ausente = sem guarda. */
  rework?: ReworkGuardPort;
  /**
   * 2026-10-15 (caso WifiConecta) · aditivo e nunca fatal: depois da releitura,
   * o tema do TERRITÓRIO acompanha o tema corrigido do SiloDNA (o território
   * guardava o de um suporte e a consolidação o copiava). Ausente = nada.
   */
  alignTerritory?: (input: { territoryRef: string; centralEntity: string }) => Promise<void>;
};

export type SiloDeclaredPlanPreview = {
  mode: "preview";
  state: "READY" | "UNCHANGED";
  siloId: string;
  siloName: string;
  siloDnaVersionId: string;
  decisionHash: string;
  pillar: { from: { articleId: string; label: string } | null; to: { articleId: string; label: string } };
  narrativeOrder: Array<{ articleId: string; label: string }>;
  changes: string[];
  warnings: string[];
  /** F5 — o que a guarda diz destes insumos (ausente = nunca feito). */
  rework?: ReworkView;
};

export type SiloDeclaredPlanApplied = {
  mode: "apply";
  state: "APPLIED";
  persistence: "PERSISTED";
  source: "CANONICAL_REMOTE";
  siloId: string;
  siloDna: { versionId: string; versionNumber: number };
  siloPage: { versionId: string; versionNumber: number };
  pillar: { articleId: string; label: string };
  groupLink: SiloGroupLinkOutcome;
  warnings: string[];
};

export type SiloDeclaredPlanUnchanged = { mode: "apply"; state: "UNCHANGED"; siloId: string; message: string };
export type SiloDeclaredPlanRefused = { state: "REFUSED"; code: SiloDeclaredPlanRefusalCode | "STALE_DECISION"; message: string; rework?: ReworkView;
  /** SDD acelerar 2026-10-13, item 10 (aditivo): os artigos fora do plano (NON_PLAN_ARTICLES). */
  articleIds?: string[] };
export type SiloDeclaredPlanResult = SiloDeclaredPlanPreview | SiloDeclaredPlanApplied | SiloDeclaredPlanUnchanged | SiloDeclaredPlanRefused;

const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");

function latestOf<T>(versions: readonly VersionEnvelope<T>[], match: (version: VersionEnvelope<T>) => boolean) {
  return versions.filter(match).reduce<VersionEnvelope<T> | null>((atual, version) => (!atual || version.versionNumber > atual.versionNumber ? version : atual), null);
}

export async function handleSiloDeclaredPlan(deps: SiloDeclaredPlanDeps, request: SiloDeclaredPlanRequest): Promise<SiloDeclaredPlanResult> {
  const inputs = await deps.readInputs();
  const plan = planSiloDeclaredPlanApplication({
    brandId: deps.brandId,
    siloId: request.siloId,
    siloDnaVersions: inputs.siloDnas,
    siloPageVersions: inputs.siloPages,
    articleDnaVersions: inputs.articleDnas,
    statuses: inputs.statuses,
    entries: inputs.entries,
    groupPlans: inputs.groupPlans,
    ...(inputs.groupPlanVersions ? { groupPlanVersions: inputs.groupPlanVersions } : {}),
    expectedSiloDnaVersionId: request.expectedSiloDnaVersionId ?? null,
  });
  const decisionHash = plan.ok ? hash({
    siloDnaVersionId: plan.current.siloDna.versionId,
    siloPageVersionId: plan.current.siloPage.versionId,
    nextSiloDna: plan.nextSiloDna,
    nextSiloPage: { ...plan.nextSiloPage, siloDnaRef: null },
  }) : null;

  /*
   * F5 · GUARDA DE RETRABALHO (SDD 2026-10-12 §10.1). Aplicar o plano ao Silo
   * não tem registro próprio: ganha a linha do guarda. Com o plano pronto, os
   * insumos são o `decisionHash` (versões vigentes + payloads novos); recusado,
   * o código e as versões vigentes do Silo, dos artigos dele e dos planos — o
   * que muda quando a pessoa resolve a recusa (ex.: retirou o artigo de fora).
   */
  const operation: ReworkOperation | null = deps.rework ? {
    kind: "silo_declared_plan_apply",
    fingerprint: await operationFingerprint("silo_declared_plan_apply", plan.ok
      ? { siloId: request.siloId, decisionHash }
      : {
        siloId: request.siloId,
        refusal: plan.code,
        siloDnaVersionId: latestOf(inputs.siloDnas, version => version.payload.siloId === request.siloId)?.versionId ?? null,
        siloPageVersionId: latestOf(inputs.siloPages, version => version.payload.siloId === request.siloId)?.versionId ?? null,
        articleVersionIds: inputs.articleDnas.filter(version => version.payload.siloId === request.siloId).map(version => version.versionId).sort(),
        plans: inputs.entries.map(entry => [entry.subjectKeywordId, entry.plan]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
        groupPlans: [...inputs.groupPlans.entries()].sort(([left], [right]) => left.localeCompare(right)),
      }),
    groupId: inputs.entries[0]?.plan.groupId ?? null,
    inputsSummary: `Aplicar o plano declarado ao Silo ${request.siloId}.`,
    policy: { sameInputs: "reuse", sameRefusal: "inform" },
  } : null;
  const rework = operation && deps.rework ? await deps.rework.check(operation) : null;
  const reworkField = rework && rework.verdict !== "fresh" ? { rework: reworkView(rework)! } : {};

  if (!plan.ok) {
    if (request.mode === "apply" && operation && deps.rework) await deps.rework.record(operation, { outcome: "refused", outcomeCode: plan.code, message: plan.message, resultRef: request.siloId, costUsd: 0 });
    return { state: "REFUSED", code: plan.code, message: rework?.verdict === "same_refusal" ? `${plan.message} ${rework.message}` : plan.message, ...reworkField, ...(plan.articleIds ? { articleIds: plan.articleIds } : {}) };
  }

  if (request.mode === "preview") {
    return {
      ...reworkField,
      mode: "preview",
      state: plan.unchanged ? "UNCHANGED" : "READY",
      siloId: plan.siloId,
      siloName: plan.siloName,
      siloDnaVersionId: plan.current.siloDna.versionId,
      decisionHash: decisionHash!,
      pillar: plan.pillar,
      narrativeOrder: plan.narrativeOrder,
      changes: plan.changes,
      warnings: plan.warnings,
    };
  }

  if (!request.decisionHash || request.decisionHash !== decisionHash) {
    return { state: "REFUSED", code: "STALE_DECISION", message: "O Silo, os artigos ou o plano mudaram desde a prévia (ou a prévia não foi vista). Abra a prévia de novo." };
  }
  // Versão nova só com mudança real: o Silo que já segue o plano não ganha versão.
  if (plan.unchanged) return { mode: "apply", state: "UNCHANGED", siloId: plan.siloId, message: "O Silo já segue o plano declarado: nenhuma versão nova." };

  const versions = await buildSiloDeclaredPlanVersions(plan, deps.actorUserId);
  const gravado = await deps.persistPair(versions.siloDna, versions.siloPage, plan.statuses);

  // Releitura: sem ela não há sucesso.
  const relido = await deps.readInputs();
  const dna = latestOf(relido.siloDnas, version => version.payload.siloId === plan.siloId);
  const page = latestOf(relido.siloPages, version => version.payload.siloId === plan.siloId);
  const divergencias: string[] = [];
  if (!dna || dna.versionId !== gravado.siloDna.versionId || dna.contentHash !== gravado.siloDna.contentHash) divergencias.push("o SiloDNA vigente não é o gravado");
  if (dna && dna.payload.pillarArticleId !== plan.pillar.to.articleId) divergencias.push("o Pilar relido não é o do plano");
  if (!page || page.versionId !== gravado.siloPage.versionId || page.payload.siloDnaRef.versionId !== gravado.siloDna.versionId) divergencias.push("a SiloPage vigente não aponta para o SiloDNA novo");
  if (page && (page.payload.slug !== plan.nextSiloPage.slug || page.payload.canonical !== plan.current.siloPage.payload.canonical || page.payload.publishedUrl !== plan.current.siloPage.payload.publishedUrl)) divergencias.push("a identidade da SiloPage relida diverge");
  if (divergencias.length) {
    throw new PipelineRuntimeError("QUERY_FAILURE", `A aplicação do plano não foi confirmada pela releitura: ${divergencias.join("; ")}.`, 503);
  }

  // 2026-10-15 · o tema do território acompanha o tema corrigido (aditivo; nunca derruba a gravação).
  if (deps.alignTerritory && plan.nextSiloDna.territoryRef && plan.nextSiloDna.centralEntity !== plan.current.siloDna.payload.centralEntity) {
    await deps.alignTerritory({ territoryRef: plan.nextSiloDna.territoryRef, centralEntity: plan.nextSiloDna.centralEntity }).catch(() => undefined);
  }
  // Depois do readback, nunca antes: o vínculo do grupo é aditivo e nunca derruba a gravação.
  const groupLink = await deps.linkGroup({ siloId: plan.siloId, articleVersionIds: gravado.siloDna.payload.articleReferences.map(reference => reference.articleDnaVersionId) });
  if (operation && deps.rework) {
    await deps.rework.record(operation, { outcome: "succeeded", outcomeCode: "PLAN_APPLIED", resultRef: gravado.siloDna.versionId, costUsd: 0, message: `Pilar “${plan.pillar.to.label}”; SiloDNA v${gravado.siloDna.versionNumber} e SiloPage v${gravado.siloPage.versionNumber}.` });
  }

  return {
    mode: "apply",
    state: "APPLIED",
    persistence: "PERSISTED",
    source: "CANONICAL_REMOTE",
    siloId: plan.siloId,
    siloDna: { versionId: gravado.siloDna.versionId, versionNumber: gravado.siloDna.versionNumber },
    siloPage: { versionId: gravado.siloPage.versionId, versionNumber: gravado.siloPage.versionNumber },
    pillar: plan.pillar.to,
    groupLink,
    warnings: plan.warnings,
  };
}

/** As dependências reais, sobre o contexto já autorizado da rota (ou do MCP). */
export function siloDeclaredPlanRuntime(context: PipelineContext): SiloDeclaredPlanDeps {
  return {
    brandId: context.brandId,
    actorUserId: context.actorUserId,
    readInputs: async () => {
      const [workspace, planos] = await Promise.all([
        loadCanonicalArquitetoWorkspace(context),
        listEditorialGroupPlans(context.supabase, context.brandId),
      ]);
      const rows = buildCanonicalWorkflowWorkspaceItems(workspace.workflowItems, workspace.keywords, context.brandId) as unknown as Array<Record<string, unknown>>;
      const linhaPorId = new Map(rows.map(row => [String(row.id), row]));
      const standings = rows.map(row => readArchitectSubjectStanding(row));
      const entries: DeclaredSiloPlanEntry[] = declaredPlanStandings(standings, context.brandId).map(standing => ({
        subjectKeywordId: standing.keywordId,
        plan: standing.plan!,
        ...declaredSubjectAuthorship(linhaPorId.get(standing.keywordId) || {}),
      }));
      const groupPlans = new Map<string, DeclaredSiloPlan>();
      const groupPlanVersions = new Map<string, number>();
      if (planos.ok) for (const group of planos.groups) {
        const plano = readDeclaredSiloPlan(group.plan);
        if (plano) { groupPlans.set(group.id, plano); groupPlanVersions.set(group.id, group.planVersion); }
      }
      return {
        articleDnas: workspace.articleDnas,
        siloDnas: workspace.siloDnas,
        siloPages: workspace.siloPages,
        statuses: workspace.statuses,
        entries,
        groupPlans,
        groupPlanVersions,
      };
    },
    persistPair: async (siloDna, siloPage, statuses) => {
      const persisted = await persistSiloPairAtomic(context, siloDna, siloPage, statuses);
      return { siloDna: persisted.siloDna, siloPage: persisted.siloPage };
    },
    linkGroup: input => linkDeclaredPlanGroupToSilo(context, input),
    rework: reworkGuardPort(context),
    alignTerritory: async ({ territoryRef, centralEntity }) => {
      const territorio = (await listTerritoryWorkflowItems(context)).find(item => item.territoryRef === territoryRef);
      if (!territorio || territorio.territory.centralEntity === centralEntity) return;
      await updateTerritoryWorkflowItem(context, territoryRef, territorio.lockVersion, { ...(territorio.territory as unknown as Record<string, unknown>), centralEntity });
    },
  };
}
