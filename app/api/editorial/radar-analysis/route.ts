import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analysisApprovalIssues, VersionedRadarAnalysisSchema } from "@/lib/radar/analysis-contracts";
import { WorkflowRepository } from "@/lib/server/editorial-repositories";
import { pruneRadarAnalysisHistory, radarAnalysisVersionsToPreserve } from "@/lib/radar/analysis-history-pruning";
import { radarGoogleResearchWriteLock } from "@/lib/radar/google-research-write-lock";
import { stampRadarSerpStandingAtFreeze } from "@/lib/server/radar-frozen-serp-standing";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";

const InputSchema = z.object({
  action: z.literal("save"),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  expectedLock: z.number().int().positive(),
  analysis: VersionedRadarAnalysisSchema,
}).strict();

const ReadbackQuerySchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().min(1),
  versionId: z.string().min(1).optional(),
}).strict();

function storedAnalyses(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as { analysisVersions?: unknown }).analysisVersions;
  return VersionedRadarAnalysisSchema.array().parse(Array.isArray(raw) ? raw : []);
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = ReadbackQuerySchema.parse({
      brandId: request.nextUrl.searchParams.get("brandId"),
      articleId: request.nextUrl.searchParams.get("articleId"),
      versionId: request.nextUrl.searchParams.get("versionId") || undefined,
    });
    await assertEditorialPermission(profile, input.brandId, "radar", "view");
    /*
     * ============ SÓ AS CORRIDAS QUE ESTA RESPOSTA DEVOLVE ============
     *
     * Medido em 2026-09-23: cada montagem do Radar lia ~10,8 MB (três itens,
     * todas as corridas de todas as versões), e a poda logo abaixo zerava
     * ~7,4 MB disso no próprio servidor. A banda já tinha saído da Supabase.
     *
     * Reidratam-se as versões que saem INTEIRAS daqui:
     * - a pedida por `versionId`, ou, sem ele, a última DO ARRAY (é o
     *   `analyses.at(-1)` de `selected`, que não é necessariamente a de maior
     *   versionNumber);
     * - as que a poda preserva: a de maior versionNumber e a última aprovada.
     *
     * As demais já saíam com os quatro campos de corrida vazios pela poda, e a
     * versão leve tem exatamente esses vazios — a resposta não muda um byte.
     * A escolha usa as versões LEVES: versionId, versionNumber e status não
     * saem da linha.
     */
    const current = await new WorkflowRepository().findByArticleHydratingVersions(input.brandId, input.articleId, "radar", versoes => {
      const ultima = versoes.at(-1)?.versionId;
      const pedida = input.versionId ?? (typeof ultima === "string" ? ultima : null);
      return [pedida, ...radarAnalysisVersionsToPreserve(versoes as unknown as Parameters<typeof radarAnalysisVersionsToPreserve>[0])];
    });
    if (!current) return NextResponse.json({ code: "radar_item_not_found", error: "Item Radar não encontrado." }, { status: 404 });
    if (current.marca_id !== input.brandId || current.article_id !== input.articleId) return NextResponse.json({ code: "radar_identity_mismatch", error: "O item Radar não corresponde à marca ou ao artigo solicitado." }, { status: 409 });
    const analyses = storedAnalyses(current.payload);
    const selected = input.versionId ? analyses.find(analysis => analysis.versionId === input.versionId) : analyses.at(-1);

    /*
     * ============ RADAR_FINAL_2 · §3 · O HISTÓRICO VIAJA PODADO ============
     *
     * A listagem do workspace já podava; este readback não, e ele REMONTAVA o
     * histórico inteiro no navegador a cada gravação — desfazendo a poda para
     * aquele artigo. Uma investigação Amazon carrega 129,7 KB de corrida por
     * versão; dez gravações são 1,3 MB reconstruídos por clique.
     *
     * A versão CORRENTE e a última APROVADA continuam inteiras — e é sobre a
     * corrente que toda escrita monta a sucessora. Podar a que se escreve
     * apagaria a coleta do banco na gravação seguinte; podar as outras não
     * apaga nada, porque ninguém sucede uma versão histórica.
     *
     * `selected` é devolvido ANTES da poda, inteiro: quem pede uma versão por
     * `versionId` está pedindo justamente o conteúdo dela.
     */
    const history = pruneRadarAnalysisHistory(analyses as Parameters<typeof pruneRadarAnalysisHistory>[0]);
    if (input.versionId && !selected) return NextResponse.json({ code: "radar_analysis_not_found", error: "Versão da análise Radar não encontrada para este artigo." }, { status: 404 });
    const payloadRadarItemId = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) && typeof (current.payload as { id?: unknown }).id === "string" ? (current.payload as { id: string }).id : null;
    return NextResponse.json({ persistenceMode: "remote", readbackConfirmed: true, brandId: input.brandId, articleId: input.articleId, radarItemId: current.id, workflowRowId: current.id, payloadRadarItemId, lockVersion: current.lock_version, analysis: selected || null, analyses: history });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_readback_request", error: "Readback Radar inválido.", details: error.issues }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_analysis_readback_error", error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = InputSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", input.analysis.payload.status === "approved" ? "approve" : "edit");
    if (input.analysis.payload.brandId !== input.brandId || input.analysis.payload.articleId !== input.articleId) throw new AuthzError(409, "A análise não corresponde ao item Radar selecionado.");
    if (input.analysis.payload.status === "approved") {
      const issues = analysisApprovalIssues(input.analysis);
      if (issues.length) return NextResponse.json({ code: "approval_blocked", error: "A análise ainda possui pendências.", issues }, { status: 409 });
    }
    /*
     * ============ §2 e §4 · A FRONTEIRA DO GOOGLE FINALIZED ============
     *
     * Os três caminhos que alteram a amostra competitiva — curadoria, extração
     * em lote e a tela de análise legada — convergem para ESTA gravação. A
     * trava mora aqui porque é aqui que todos passam: escondida na tela, ela
     * seria contornada por qualquer chamada direta à rota.
     *
     * A comparação é contra a versão CORRENTE lida do repositório, nunca
     * contra o que o navegador mandou: um cliente que enviasse um payload sem
     * `finalizedBundle` se destravaria sozinho.
     */
    /*
     * SÓ A VERSÃO CORRENTE, e ainda do repositório.
     *
     * A trava olha apenas a última versão do array; ler o item com
     * `findByArticle` reidratava todas as corridas para jogar fora as das
     * versões antigas. Medido em 2026-09-23 no item mais pesado: 8,22 MB por
     * gravação, contra 2,50 MB agora (0,90 MB se a investigação não está
     * finalizada — aí a trava abre sem olhar campo competitivo). O método
     * devolve a versão, não a linha: nada aqui é base de regravação, e o
     * append lê a linha crua por conta própria.
     *
     * Só a corrente passa pelo schema. Antes o parse era de TODAS as versões e
     * uma antiga inválida virava 400 aqui; ela continua sendo validada pelo
     * RadarItemSchema dentro do append, na parte leve.
     */
    const repositorio = new WorkflowRepository();
    const versaoCorrente = await repositorio.findCurrentRadarAnalysisForWriteLock(input.brandId, input.articleId);
    const correnteGravada = versaoCorrente ? VersionedRadarAnalysisSchema.parse(versaoCorrente) : null;

    const trava = radarGoogleResearchWriteLock({
      current: correnteGravada?.payload || null,
      next: input.analysis.payload,
    });
    if (!trava.allowed) {
      return NextResponse.json({
        code: trava.code,
        error: trava.message,
        /* Quem opera precisa saber O QUE a escrita tentava mudar. */
        competitiveFields: trava.competitiveFields,
      }, { status: 409 });
    }

    /*
     * ============ R1 · O STANDING DA SERP, UMA VEZ, NO CONGELAMENTO ============
     *
     * Só a escrita que CONGELA (corrente aberta, sucessora com fotografia) lê
     * a SERP gravada e grava o standing dentro do bundle. Depois disso a trava
     * acima impede que a fotografia seja trocada sem reabrir, e o dossiê só lê
     * a cópia. Nenhum efeito acontece antes desta decisão.
     */
    const congelamento = await stampRadarSerpStandingAtFreeze({
      brandId: input.brandId,
      articleId: input.articleId,
      current: correnteGravada?.payload || null,
      next: input.analysis,
    });
    if (!congelamento.ok) return NextResponse.json({ code: congelamento.code, error: congelamento.message }, { status: congelamento.status });

    const row = await repositorio.appendRadarAnalysis(input.brandId, input.articleId, input.expectedLock, congelamento.analysis, profile.userId);
    if (!row) throw new AuthzError(404, "Item Radar não encontrado para esta marca.");
    const payloadRadarItemId = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) && typeof (row.payload as { id?: unknown }).id === "string" ? (row.payload as { id: string }).id : null;
    return NextResponse.json({ persistenceMode: "remote", versionId: input.analysis.versionId, lockVersion: row.lock_version, radarItemId: row.id, workflowRowId: row.id, payloadRadarItemId });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_request", error: "Solicitação de análise Radar inválida.", details: error.issues }, { status: 400 });
    /*
     * O 503 CARREGA A CAUSA — hotfix final.
     *
     * `reason` e `driver` viajam em `details`: sem eles, "não foi possível
     * conectar" cobria timeout de statement, payload grande demais e socket
     * derrubado sob a mesma frase, e cada clique custava outra rodada de
     * adivinhação.
     */
    if (error instanceof PersistenceUnavailableError) {
      console.error("[radar-analysis:persist]", error.reason, error.driver?.code || "", error.driver?.message || "");
      return NextResponse.json({ code: error.code, error: error.message, recoverableLocally: true, details: { reason: error.reason, driver: error.driver } }, { status: 503 });
    }
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: "optimistic_conflict", error: error.message }, { status: 409 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_analysis_error", error: mapped.message }, { status: mapped.status });
  }
}
