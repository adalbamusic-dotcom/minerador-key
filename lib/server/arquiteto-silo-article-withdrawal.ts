import "server-only";

import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope, VersionStatusEvent } from "@/lib/arquiteto/contracts";
import {
  buildSiloArticleWithdrawalVersions,
  planSiloArticleWithdrawal,
  type SiloArticleWithdrawalRefusalCode,
} from "@/lib/arquiteto/silo-article-withdrawal";
import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError } from "./pipeline-runtime";
import { listArquitetoArtifacts, persistSiloPairAtomic } from "./arquiteto-persistence";
import { ArtifactRepository } from "./editorial-repositories";
import { reworkGuardPort, type ReworkGuardPort, type ReworkOperation } from "./rework-guard";
import { operationFingerprint, reworkView, type ReworkView } from "@/lib/editorial/rework-guard";
import { readArticleGroupMemberships } from "@/lib/editorial/article-groups-store";

/**
 * ===== RETIRAR ARTIGO DO SILO — SERVIDOR (F4) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §11 passo 6.
 * O plano e as recusas são de `lib/arquiteto/silo-article-withdrawal.ts`; aqui
 * só se lê, grava e relê.
 *
 * ORDEM DAS ESCRITAS. Primeiro o evento `rejected` do ArticleDNA (id
 * determinístico: repetir não duplica), depois o par SiloDNA + SiloPage pelo
 * `persistSiloPairAtomic` — o mesmo caminho transacional do par canônico. Se o
 * par falhar, repetir a ação acha o mesmo Silo, regrava o mesmo evento (sem
 * efeito) e tenta o par de novo. Na ordem inversa, uma falha no evento deixaria
 * o Silo já sem o artigo e a retirada nunca mais poderia ser refeita.
 *
 * SUCESSO SÓ DEPOIS DA RELEITURA: o par vigente é o novo, não referencia o
 * artigo, a SiloPage aponta para o SiloDNA novo e o evento está gravado.
 */

export type SiloArticleWithdrawalRequest = {
  siloId: string;
  articleId: string;
  reason: string;
  mode: "preview" | "apply";
  expectedSiloDnaVersionId?: string | null;
};

type Artifacts = {
  articleDnas: VersionEnvelope<ArticleDNA>[];
  siloDnas: VersionEnvelope<SiloDNA>[];
  siloPages: VersionEnvelope<SiloPage>[];
  statuses: Array<{ versionId: string; status: string }>;
};

export type SiloArticleWithdrawalDeps = {
  brandId: string;
  actorUserId: string;
  listArtifacts: () => Promise<Artifacts>;
  /** Etapas posteriores em que o artigo já tem item (radar, writer, publications). */
  readDownstreamStages: (articleId: string) => Promise<string[]>;
  persistPair: (
    siloDna: VersionEnvelope<SiloDNA>,
    siloPage: VersionEnvelope<SiloPage>,
    statuses: { siloDna: string; siloPage: string },
  ) => Promise<{ siloDna: VersionEnvelope<SiloDNA>; siloPage: VersionEnvelope<SiloPage> }>;
  appendRejection: (event: VersionStatusEvent) => Promise<void>;
  readRejection: (eventId: string) => Promise<{ versionId: string; status: string } | null>;
  now?: () => string;
  /** F5 — a guarda de retrabalho (linha `operation_ledger`); ausente = sem guarda. */
  rework?: ReworkGuardPort;
  /** F5 — o grupo do artigo, para o histórico do grupo (melhor esforço). */
  groupOf?: (articleId: string) => Promise<string | null>;
};

export type SiloArticleWithdrawalPreview = {
  mode: "preview";
  state: "READY";
  siloId: string;
  siloName: string;
  siloDnaVersionId: string;
  article: { articleId: string; label: string; versionId: string };
  remainingArticleIds: string[];
  changes: string[];
  warnings: string[];
  /** F5 — o que a guarda diz destes insumos (ausente = nunca feito). */
  rework?: ReworkView;
};

export type SiloArticleWithdrawalApplied = {
  mode: "apply";
  state: "APPLIED";
  persistence: "PERSISTED";
  source: "CANONICAL_REMOTE";
  siloId: string;
  siloDna: { versionId: string; versionNumber: number };
  siloPage: { versionId: string; versionNumber: number };
  rejection: { eventId: string; articleVersionId: string };
  article: { articleId: string; label: string };
  warnings: string[];
  /** 2026-10-14 · aditivo: o artigo só apontava para o Silo; o par ficou como estava (só o evento `rejected`). */
  pairUnchanged?: true;
};

export type SiloArticleWithdrawalRefused = { state: "REFUSED"; code: SiloArticleWithdrawalRefusalCode; message: string; rework?: ReworkView };

export type SiloArticleWithdrawalResult = SiloArticleWithdrawalPreview | SiloArticleWithdrawalApplied | SiloArticleWithdrawalRefused;

function latestOf<T>(versions: readonly VersionEnvelope<T>[], match: (version: VersionEnvelope<T>) => boolean) {
  return versions.filter(match).reduce<VersionEnvelope<T> | null>((atual, version) => (!atual || version.versionNumber > atual.versionNumber ? version : atual), null);
}

export async function handleSiloArticleWithdrawal(
  deps: SiloArticleWithdrawalDeps,
  request: SiloArticleWithdrawalRequest,
): Promise<SiloArticleWithdrawalResult> {
  const artifacts = await deps.listArtifacts();
  const downstreamStages = await deps.readDownstreamStages(request.articleId);
  const plan = planSiloArticleWithdrawal({
    brandId: deps.brandId,
    siloId: request.siloId,
    articleId: request.articleId,
    reason: request.reason,
    siloDnaVersions: artifacts.siloDnas,
    siloPageVersions: artifacts.siloPages,
    articleDnaVersions: artifacts.articleDnas,
    statuses: artifacts.statuses,
    downstreamStages,
    expectedSiloDnaVersionId: request.expectedSiloDnaVersionId ?? null,
    previewOnly: request.mode === "preview",
  });

  /*
   * F5 · GUARDA DE RETRABALHO (SDD 2026-10-12 §10.1): a retirada não tem
   * registro próprio, então ganha a linha do guarda. Insumos: o Silo vigente,
   * a versão vigente do artigo e as etapas posteriores — o motivo é texto e
   * não muda o resultado. A prévia diz "já feito"/"a mesma recusa de <data>";
   * a aplicação registra o desfecho.
   */
  const operation: ReworkOperation | null = deps.rework ? {
    kind: "silo_article_withdrawal",
    fingerprint: await operationFingerprint("silo_article_withdrawal", {
      siloId: request.siloId,
      articleId: request.articleId,
      siloDnaVersionId: latestOf(artifacts.siloDnas, version => version.payload.siloId === request.siloId)?.versionId ?? null,
      articleVersionId: latestOf(artifacts.articleDnas, version => version.payload.articleId === request.articleId || version.entityId === request.articleId)?.versionId ?? null,
      downstreamStages: [...downstreamStages].sort(),
    }),
    groupId: await deps.groupOf?.(request.articleId).catch(() => null) ?? null,
    inputsSummary: `Retirar o artigo ${request.articleId} do Silo ${request.siloId}.`,
    policy: { sameInputs: "reuse", sameRefusal: "inform" },
  } : null;
  const rework = operation && deps.rework ? await deps.rework.check(operation) : null;
  const reworkField = rework && rework.verdict !== "fresh" ? { rework: reworkView(rework)! } : {};

  if (!plan.ok) {
    if (request.mode === "apply" && operation && deps.rework) await deps.rework.record(operation, { outcome: "refused", outcomeCode: plan.code, message: plan.message, resultRef: request.siloId, costUsd: 0 });
    return { state: "REFUSED", code: plan.code, message: rework?.verdict === "same_refusal" ? `${plan.message} ${rework.message}` : plan.message, ...reworkField };
  }

  if (request.mode === "preview") {
    return {
      ...reworkField,
      mode: "preview",
      state: "READY",
      siloId: plan.siloId,
      siloName: plan.siloName,
      siloDnaVersionId: plan.current.siloDna.versionId,
      article: { articleId: plan.article.articleId, label: plan.article.label, versionId: plan.article.versionId },
      remainingArticleIds: plan.remainingArticleIds,
      changes: plan.changes,
      warnings: plan.warnings,
    };
  }

  const versions = await buildSiloArticleWithdrawalVersions(plan, deps.actorUserId, deps.now?.() ?? new Date().toISOString());

  // 1. O evento `rejected` (idempotente pelo id determinístico).
  await deps.appendRejection(versions.rejection);
  // 2. O par, pelo caminho transacional do par canônico. 2026-10-14 · o artigo que só
  //    apontava para o Silo (não estava na composição) sai só pelo evento: o par fica como está.
  const gravado = plan.pairUnchanged
    ? { siloDna: plan.current.siloDna, siloPage: plan.current.siloPage }
    : await deps.persistPair(versions.siloDna, versions.siloPage, plan.statuses);

  // 3. Releitura: sem ela não há sucesso.
  const relido = await deps.listArtifacts();
  const dna = latestOf(relido.siloDnas, version => version.payload.siloId === plan.siloId);
  const page = latestOf(relido.siloPages, version => version.payload.siloId === plan.siloId);
  const evento = await deps.readRejection(versions.rejection.eventId);
  const divergencias: string[] = [];
  if (!dna || dna.versionId !== gravado.siloDna.versionId) divergencias.push(plan.pairUnchanged ? "o SiloDNA mudou durante a retirada" : "o SiloDNA vigente não é o gravado");
  if (dna && (dna.payload.supportArticleIds.includes(plan.article.articleId) || dna.payload.articleReferences.some(reference => reference.articleId === plan.article.articleId))) {
    divergencias.push("o SiloDNA vigente ainda referencia o artigo");
  }
  if (!page || page.versionId !== gravado.siloPage.versionId || page.payload.siloDnaRef.versionId !== gravado.siloDna.versionId) {
    divergencias.push(plan.pairUnchanged ? "a SiloPage mudou durante a retirada" : "a SiloPage vigente não aponta para o SiloDNA novo");
  }
  if (!evento || evento.status !== "rejected" || evento.versionId !== plan.article.versionId) divergencias.push("o evento de rejeição do ArticleDNA não voltou na releitura");
  if (divergencias.length) {
    throw new PipelineRuntimeError("QUERY_FAILURE", `A retirada não foi confirmada pela releitura: ${divergencias.join("; ")}.`, 503);
  }
  if (operation && deps.rework) {
    await deps.rework.record(operation, { outcome: "succeeded", outcomeCode: "ARTICLE_WITHDRAWN", resultRef: gravado.siloDna.versionId, costUsd: 0, message: `“${plan.article.label}” retirado do Silo (motivo: ${request.reason.trim().slice(0, 200)}).` });
  }

  return {
    mode: "apply",
    state: "APPLIED",
    persistence: "PERSISTED",
    source: "CANONICAL_REMOTE",
    siloId: plan.siloId,
    siloDna: { versionId: gravado.siloDna.versionId, versionNumber: gravado.siloDna.versionNumber },
    siloPage: { versionId: gravado.siloPage.versionId, versionNumber: gravado.siloPage.versionNumber },
    rejection: { eventId: versions.rejection.eventId, articleVersionId: plan.article.versionId },
    article: { articleId: plan.article.articleId, label: plan.article.label },
    warnings: plan.warnings,
    ...(plan.pairUnchanged ? { pairUnchanged: true as const } : {}),
  };
}

const DOWNSTREAM_STAGES = ["radar", "writer", "publications"] as const;

/** As dependências reais, sobre o contexto já autorizado da rota. */
export function siloArticleWithdrawalRuntime(context: PipelineContext): SiloArticleWithdrawalDeps {
  return {
    brandId: context.brandId,
    actorUserId: context.actorUserId,
    listArtifacts: async () => {
      const lido = await listArquitetoArtifacts(context);
      return { articleDnas: lido.articleDnas, siloDnas: lido.siloDnas, siloPages: lido.siloPages, statuses: lido.statuses };
    },
    readDownstreamStages: async articleId => {
      const result = await context.supabase
        .from("editorial_workflow_items")
        .select("stage")
        .eq("marca_id", context.brandId)
        .eq("article_id", articleId)
        .in("stage", [...DOWNSTREAM_STAGES]);
      if (result.error) throw result.error;
      return [...new Set(((result.data || []) as Array<{ stage?: unknown }>).map(row => String(row.stage ?? "")).filter(Boolean))];
    },
    persistPair: async (siloDna, siloPage, statuses) => {
      const persisted = await persistSiloPairAtomic(context, siloDna, siloPage, statuses);
      return { siloDna: persisted.siloDna, siloPage: persisted.siloPage };
    },
    appendRejection: event => new ArtifactRepository().appendEvents(context.brandId, [event], context.actorUserId),
    readRejection: async eventId => {
      const result = await context.supabase
        .from("editorial_version_status_events")
        .select("id,version_id,status")
        .eq("id", eventId)
        .maybeSingle();
      if (result.error) throw result.error;
      const row = result.data as { version_id?: unknown; status?: unknown } | null;
      return row ? { versionId: String(row.version_id ?? ""), status: String(row.status ?? "") } : null;
    },
    rework: reworkGuardPort(context),
    groupOf: async articleId => {
      try {
        const lido = await readArticleGroupMemberships(context.supabase, context.brandId, { articleIds: [articleId] });
        return lido.ok ? lido.memberships.get(articleId)?.groupId ?? null : null;
      } catch {
        return null;
      }
    },
  };
}
