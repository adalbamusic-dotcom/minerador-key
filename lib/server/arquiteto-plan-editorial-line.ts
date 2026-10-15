import "server-only";
import { createHash } from "node:crypto";

import { ArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "@/lib/arquiteto/contracts";
import { articleApprovalRevalidationIssues, isDeclaredPlanConsolidation } from "@/lib/arquiteto/article-approval-revalidation";
import {
  articleEditorialPending, EDITORIAL_LINE_FIELDS, EDITORIAL_LINE_LABEL, isEditorialPending, planEditorialLineChanges, planEditorialLineHashBody, planEditorialLineSentence,
  type EditorialLineChange, type EditorialLineField,
} from "@/lib/arquiteto/plan-editorial-line";

const planEditorialLineDecisionHash = (input: Parameters<typeof planEditorialLineHashBody>[0]) => createHash("sha256").update(planEditorialLineHashBody(input)).digest("hex");
import { createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { listEditorialGroupPlans, type EditorialGroupPlanRow } from "@/lib/editorial/editorial-groups-store";
import { readDeclaredSiloPlan } from "@/lib/minerador/declared-plan";
import { readPlanConsolidationInputs, type ImprovementRuntime, type PlanConsolidationInputs } from "./arquiteto-article-improvement";
import { appendArquitetoArtifact } from "./arquiteto-persistence";
import { PipelineRuntimeError, type PipelineContext } from "./pipeline-runtime";

/**
 * ETAPA 3 DA ABA ARTIGOS · "LINHA EDITORIAL" (2026-10-15, pedido do dono:
 * "fazer do assunto/tema uma linha editorial de copy").
 *
 * POST `/api/arquiteto/plan-silo/editorial-line` `{ brandId, groupId, mode,
 * decisionHash?, acceptedArticleIds?, articleId? }`:
 *  - prévia (grátis, só leitura): por artigo do plano já formado, os campos
 *    pendentes que ganham valor (Assunto, escopo do plano, BrandDNA, parecer de
 *    SERP, Pilar/objetivo do Silo do plano) — regras puras em
 *    `lib/arquiteto/plan-editorial-line.ts`. Sem IA, nada é pago.
 *  - aplicar: UM artigo por chamada, com o MESMO hash; grava o ArticleDNA v+1
 *    (decisão humana; aprovado; revalidado) e relê. Nada no Minerador, nada no
 *    Redator, nenhum Silo.
 */

const refusal = (message: string) => new PipelineRuntimeError("CONFLICT", message, 409);

export class EditorialLineStaleError extends Error {
  readonly code = "EDITORIAL_LINE_STALE";
  constructor() { super("Um artigo ou o plano mudou desde a prévia. Gere a prévia de novo; nada foi gravado por este artigo."); }
}

export type EditorialLineLine = {
  articleId: string;
  versionId: string;
  versionNumber: number;
  keywordId: string;
  keyword: string;
  title: string;
  role: "Pilar" | "Suporte";
  order: number;
  changes: EditorialLineChange[];
  pendingLeft: EditorialLineField[];
  sentence: string;
  /** A impressão digital DESTE artigo (versão de hoje + o que muda): a gravação dele a exige. */
  lineHash: string;
};

export type EditorialLinePreview = {
  groupId: string;
  siloName: string;
  brandDnaAvailable: boolean;
  lines: EditorialLineLine[];
  acceptedArticleIds: string[];
  decisionHash: string;
  summary: string;
};

type Deps = {
  groupPlans?: (context: PipelineContext) => Promise<EditorialGroupPlanRow[]>;
  inputs?: (context: PipelineContext) => Promise<PlanConsolidationInputs>;
  brandAudience?: (context: PipelineContext) => Promise<string[] | null>;
  write?: (runtime: ImprovementRuntime, version: VersionEnvelope<ArticleDNA>) => Promise<{ versionId: string; contentHash: string }>;
  now?: () => string;
};

async function lerPublico(context: PipelineContext, deps: Deps): Promise<string[] | null> {
  if (deps.brandAudience) return deps.brandAudience(context);
  try {
    const { getApprovedBrandDna } = await import("./brand-dna");
    const dna = await getApprovedBrandDna(context.brandId);
    return dna ? dna.payload.audience : null;
  } catch {
    return null;
  }
}

async function buildPreview(context: PipelineContext, groupId: string, deps: Deps) {
  const grupos = deps.groupPlans ? await deps.groupPlans(context) : await (async () => {
    const planos = await listEditorialGroupPlans(context.supabase, context.brandId);
    if (!planos.ok) throw refusal("Os grupos ainda não estão disponíveis neste banco.");
    return planos.groups;
  })();
  const grupo = grupos.find(item => item.id === groupId && item.status === "active");
  const plano = grupo ? readDeclaredSiloPlan(grupo.plan) : null;
  if (!grupo || !plano) throw refusal("Este grupo não tem plano declarado.");
  const [inputs, publico] = await Promise.all([(deps.inputs ?? readPlanConsolidationInputs)(context), lerPublico(context, deps)]);
  const doPlano = [...inputs.standings.values()].filter(standing => standing.plan?.groupId === groupId && standing.declared && standing.received && standing.approvedPackageRef && standing.brandId === context.brandId);
  const pilar = doPlano.find(standing => standing.plan?.role === "Pilar") ?? null;
  const lines: EditorialLineLine[] = [];
  for (const standing of doPlano) {
    const artigo = inputs.workspace.articleDnas.filter(version => version.payload.subject?.keywordId === standing.keywordId).sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (!artigo) continue;
    const payload = artigo.payload;
    const atual = Object.fromEntries(EDITORIAL_LINE_FIELDS.map(field => [field, typeof payload[field] === "string" ? payload[field] as string : ""])) as Record<EditorialLineField, string>;
    const principal = payload.principalKeywordId ? String(inputs.rows.get(payload.principalKeywordId)?.keyword ?? "") || null : null;
    const changes = planEditorialLineChanges({
      current: atual,
      subjectPhrase: payload.subject?.phrase ?? standing.phrase,
      principalKeyword: principal,
      scope: standing.plan!.scope,
      role: standing.plan!.role,
      siloName: plano.siloName,
      siloObjective: plano.objective ?? null,
      pillarSubject: pilar && pilar.keywordId !== standing.keywordId ? pilar.phrase : null,
      brandAudience: publico ?? [],
      serpIntent: payload.serpAssessmentRef ? payload.mainIntent ?? null : null,
    });
    const pendentes = (["angle", "cta", "problem", "audience"] as const).filter(field => isEditorialPending(atual[field]));
    lines.push({
      articleId: payload.articleId, versionId: artigo.versionId, versionNumber: artigo.versionNumber,
      keywordId: standing.keywordId, keyword: String(inputs.rows.get(standing.keywordId)?.keyword ?? standing.keywordId), title: standing.phrase,
      role: standing.plan!.role, order: standing.plan!.order,
      changes, pendingLeft: pendentes, sentence: planEditorialLineSentence(changes, pendentes),
      lineHash: planEditorialLineDecisionHash({ groupId, lines: [{ articleId: payload.articleId, versionId: artigo.versionId, changes }] }),
    });
  }
  lines.sort((a, b) => a.order - b.order);
  const aceitas = lines.filter(line => line.changes.length).map(line => line.articleId);
  return {
    preview: {
      groupId, siloName: plano.siloName, brandDnaAvailable: Boolean(publico?.length), lines,
      acceptedArticleIds: aceitas,
      decisionHash: planEditorialLineDecisionHash({ groupId, lines: lines.filter(line => aceitas.includes(line.articleId)) }),
      summary: `${aceitas.length} artigo(s) com a linha editorial para gravar (versão seguinte), ${lines.length - aceitas.length} sem mudança. Grátis, sem IA; nada no Minerador nem no Redator.${publico?.length ? "" : " Sem BrandDNA aprovado: o público fica pendente (aprove o BrandDNA em Marca)."}`,
    } satisfies EditorialLinePreview,
    inputs,
  };
}

export async function previewPlanEditorialLine(context: PipelineContext, groupId: string, deps: Deps = {}): Promise<EditorialLinePreview> {
  return (await buildPreview(context, groupId, deps)).preview;
}

/**
 * Grava a linha editorial de UM artigo aceito (v+1) e relê. A confirmação na
 * tela é uma só; cada chamada leva o `lineHash` do artigo na prévia (versão de
 * hoje + o que muda): outro artigo gravado no meio não invalida este.
 */
export async function applyPlanEditorialLine(runtime: ImprovementRuntime, input: { groupId: string; articleId: string; lineHash: string }, deps: Deps = {}): Promise<{ articleId: string; status: "written" | "kept"; versionNumber: number; message: string }> {
  const context = runtime.context;
  const { preview, inputs } = await buildPreview(context, input.groupId, deps);
  const linha = preview.lines.find(item => item.articleId === input.articleId);
  // Já gravado por esta mesma confirmação: a versão nova não tem mais o que mudar (idempotente).
  if (linha && !linha.changes.length) return { articleId: linha.articleId, status: "kept", versionNumber: linha.versionNumber, message: "Linha editorial já gravada: nada a mudar." };
  if (!linha || linha.lineHash !== input.lineHash) throw new EditorialLineStaleError();
  const atual = inputs.workspace.articleDnas.find(version => version.versionId === linha.versionId);
  if (!atual) throw new EditorialLineStaleError();
  const agora = deps.now?.() ?? new Date().toISOString();
  const payload: ArticleDNA = ArticleDNASchema.parse({ ...atual.payload, ...Object.fromEntries(linha.changes.map(change => [change.field, change.after])) });
  const version = await createVersionEnvelope({
    entityId: atual.entityId, versionNumber: atual.versionNumber + 1, previousVersionId: atual.versionId, origin: "human",
    changeReason: `${EDITORIAL_LINE_LABEL} do plano (decisão humana de ${context.actorUserId} em ${agora.slice(0, 10)}): ${linha.changes.map(change => `${change.label} ← ${change.source}`).join("; ")}. [editorial-line:${input.lineHash.slice(0, 16)}]`,
    createdBy: context.actorUserId, payload, createdAt: agora,
  });
  const issues = articleApprovalRevalidationIssues({ version, authorizedBrandId: context.brandId, declaredPlanConsolidation: isDeclaredPlanConsolidation(payload) });
  if (issues.length) throw refusal(`A aprovação não passou na revalidação: ${issues.map(issue => issue.detail).join(" ")}`);
  const gravado = deps.write ? await deps.write(runtime, version) : (await appendArquitetoArtifact(await runtime.authorize("arquiteto", "approve"), "article_dna", version, "approved")).version;
  // Releitura: a versão gravada é a vigente e não tem mais campo da linha editorial pendente com fonte.
  const relido = await buildPreview(context, input.groupId, deps);
  const depois = relido.inputs.workspace.articleDnas.find(item => item.versionId === gravado.versionId);
  if (!depois || depois.contentHash !== gravado.contentHash) throw refusal("A releitura não confirmou a versão nova do ArticleDNA. Gere a prévia de novo antes de repetir.");
  return { articleId: linha.articleId, status: "written", versionNumber: depois.versionNumber, message: `ArticleDNA v${depois.versionNumber} gravado e relido com a linha editorial (${linha.changes.map(change => change.label).join(", ")}).${articleEditorialPending(depois.payload) ? " Algum campo continua pendente sem fonte (revisão humana)." : ""}` };
}
