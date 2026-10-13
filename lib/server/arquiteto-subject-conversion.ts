import "server-only";
import { createHash } from "node:crypto";
import { canonicalJson, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { buildCanonicalWorkflowWorkspaceItems } from "@/lib/arquiteto/canonical-workspace";
import { articleApprovalRevalidationIssues } from "@/lib/arquiteto/article-approval-revalidation";
import { pendingSubjectConversions, type PendingSubjectConversion } from "@/lib/arquiteto/subject-conversion";
import { appendArquitetoArtifact } from "./arquiteto-persistence";
import { loadCanonicalArquitetoWorkspace } from "./arquiteto-workspace";
import { resolvePipelineContext, type PipelineContext } from "./pipeline-runtime";

/**
 * ===== "ATUALIZAR O ASSUNTO DO ARTIGO" — O SERVIDOR (tela, rota e MCP) =====
 *
 * SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §7.
 *
 * `preview` lê a mesa (a mesma leitura do Arquiteto) e devolve, por artigo, a
 * troca do Assunto (linha-título → keyword que agora o carrega) e o
 * `decisionHash`. `apply` só grava com o MESMO `decisionHash` (a decisão humana
 * foi tomada sobre aquela prévia): para cada artigo, uma versão nova do
 * ArticleDNA pelo writer de sempre (`appendArquitetoArtifact`, com a guarda do
 * Assunto e a de retrabalho), aprovada, e a releitura confere o `subject`.
 * Versões anteriores intocadas. Nada pago. URL, slug e canonical não mudam
 * (a principal não muda).
 */

export const SUBJECT_CONVERSION_CHANGE_REASON = "Conversão do Assunto para o formato novo" as const;

export type ArticleSubjectConversionRequest = { mode: "preview" | "apply"; articleIds?: readonly string[] | null; decisionHash?: string | null };

export type ArticleSubjectConversionItem = Omit<PendingSubjectConversion, "next"> & { outcome?: "converted" | "unchanged" | "failed"; versionId?: string | null };

export type ArticleSubjectConversionResult =
  | { state: "PREVIEW"; items: ArticleSubjectConversionItem[]; ready: number; blocked: number; decisionHash: string }
  | { state: "APPLIED"; items: ArticleSubjectConversionItem[]; converted: number; failed: number; decisionHash: string }
  | { state: "REFUSED"; code: "NOTHING_TO_CONVERT" | "STALE_DECISION" | "DECISION_REQUIRED"; message: string };

type Row = Record<string, unknown> & { id: string };

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(JSON.parse(JSON.stringify(value ?? null)))).digest("hex");
}

function project(item: PendingSubjectConversion): ArticleSubjectConversionItem {
  const { next: _next, ...rest } = item;
  void _next;
  return rest;
}

/** O que a decisão cobre: por artigo, a versão vigente, a troca e o estado. */
export function articleSubjectConversionDecisionHash(brandId: string, items: readonly PendingSubjectConversion[]): string {
  return hash({ brandId, items: items.map(item => ({ articleId: item.articleId, versionId: item.versionId, contentHash: item.contentHash, from: item.fromKeywordId, to: item.toKeywordId, state: item.state, next: item.next ? hash(item.next) : null })) });
}

async function readPending(context: PipelineContext, articleIds: readonly string[] | null | undefined, now: string) {
  const workspace = await loadCanonicalArquitetoWorkspace(context, { keywordDetail: "full" });
  const rows = buildCanonicalWorkflowWorkspaceItems(workspace.workflowItems, workspace.keywords, context.brandId) as unknown as Row[];
  const pedidos = articleIds?.length ? new Set(articleIds) : null;
  const pending = pendingSubjectConversions({
    brandId: context.brandId,
    actorUserId: context.actorUserId,
    attachedAt: now,
    articles: workspace.articleDnas.map(version => ({ entityId: version.entityId, versionId: version.versionId, versionNumber: version.versionNumber, contentHash: version.contentHash, payload: version.payload })),
    keywords: rows,
  }).filter(item => !pedidos || pedidos.has(item.articleId));
  return { pending };
}

export async function handleArticleSubjectConversion(context: PipelineContext, request: ArticleSubjectConversionRequest): Promise<ArticleSubjectConversionResult> {
  const now = new Date().toISOString();
  const { pending } = await readPending(context, request.articleIds, now);
  if (!pending.length) return { state: "REFUSED", code: "NOTHING_TO_CONVERT", message: "Nenhum artigo com Assunto convertido à espera de atualização. Converta no Minerador (Cadastrar Assuntos → Formato anterior) e envie as keywords ao Arquiteto." };
  // O hash não depende do instante da leitura: `attachedAt` sai da conta.
  const estavel = pending.map(item => ({ ...item, next: item.next ? { ...item.next, subject: item.next.subject ? { ...item.next.subject, attachedAt: "" } : undefined } : null })) as PendingSubjectConversion[];
  const decisionHash = articleSubjectConversionDecisionHash(context.brandId, estavel);
  if (request.mode === "preview") {
    return { state: "PREVIEW", items: pending.map(project), ready: pending.filter(item => item.state === "ready").length, blocked: pending.filter(item => item.state === "blocked").length, decisionHash };
  }
  if (!request.decisionHash) return { state: "REFUSED", code: "DECISION_REQUIRED", message: "Gere a prévia e confirme com o mesmo decisionHash." };
  if (request.decisionHash.toLowerCase() !== decisionHash) return { state: "REFUSED", code: "STALE_DECISION", message: "Os artigos mudaram desde a prévia. Gere uma nova prévia antes de aplicar." };

  const aprovar = await resolvePipelineContext({ brandId: context.brandId, module: "arquiteto", action: "approve" }, { requireActorUserId: async () => context.actorUserId });
  const items: ArticleSubjectConversionItem[] = [];
  for (const item of pending) {
    if (item.state !== "ready" || !item.next) { items.push({ ...project(item), outcome: "failed" }); continue; }
    try {
      const version = await createVersionEnvelope({
        entityId: item.articleId,
        versionNumber: item.versionNumber + 1,
        previousVersionId: item.versionId,
        origin: "human",
        changeReason: `${SUBJECT_CONVERSION_CHANGE_REASON}: “${item.fromPhrase}” → “${item.toPhrase}”.`,
        createdBy: context.actorUserId,
        payload: item.next,
      });
      const issues = articleApprovalRevalidationIssues({ version, authorizedBrandId: context.brandId });
      if (issues.length) { items.push({ ...project(item), outcome: "failed", reason: issues.map(issue => issue.detail).join(" ") }); continue; }
      const written = await appendArquitetoArtifact(aprovar, "article_dna", version, "approved");
      items.push({ ...project(item), outcome: "converted", versionId: written.version.versionId });
    } catch (error) {
      items.push({ ...project(item), outcome: "failed", reason: error instanceof Error ? error.message : "Falha ao gravar a versão nova." });
    }
  }
  // Releitura: a versão vigente de cada artigo convertido aponta para a keyword nova.
  const releitura = await loadCanonicalArquitetoWorkspace(context, { keywordDetail: "full" });
  for (const item of items) {
    if (item.outcome !== "converted") continue;
    const vigente = releitura.articleDnas.find(version => version.entityId === item.articleId);
    if (!vigente || vigente.versionId !== item.versionId || vigente.payload.subject?.keywordId !== item.toKeywordId) {
      item.outcome = "failed";
      item.reason = "A releitura não confirmou a versão nova com o Assunto na keyword nova.";
    }
  }
  return { state: "APPLIED", items, converted: items.filter(item => item.outcome === "converted").length, failed: items.filter(item => item.outcome === "failed").length, decisionHash };
}
