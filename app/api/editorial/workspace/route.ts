import { resolveLoadState, type IncompatibleRecord, type WorkspaceLoadState } from "@/lib/editorial/partial-read";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ArtifactRepository, ContentDocumentRepository, InvitationRepository, PublicationRepository, SerpSnapshotRepository, ViewPreferenceRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { PersistedEditorialWorkspaceSchema } from "@/lib/editorial/persistence-contracts";
import type { PlannerItem, RadarItem } from "@/lib/editorial/operational-flow";

const QuerySchema = z.string().uuid();

/**
 * A MESA NÃO CAI INTEIRA POR CAUSA DE UMA GAVETA.
 *
 * Este GET agrega OITO repositórios. Com `Promise.all`, qualquer um que
 * lançasse derrubava a resposta inteira — falha em documentos, convites ou
 * preferências apagava os artigos do Radar que tinham sido lidos sem problema
 * nenhum. E o `parse` final era monolítico: um campo ruim invalidava o resto.
 *
 * Pior, um `ZodError` sobre DADO PERSISTIDO virava `400 "Marca inválida."` —
 * indistinguível de um `marcaId` malformado, que é erro de entrada. Quem lia a
 * mensagem procurava a marca; o problema estava no que o banco devolveu.
 *
 * Agora cada seção falha sozinha e é NOMEADA. Só a falha do próprio workflow
 * torna a mesa do Radar ilegível; as outras viram diagnóstico ao lado dos dados.
 */

const SECOES = [
  "workflow", "artifacts", "documents", "publications",
  "invitations", "views", "serpSnapshots", "serpReviews",
] as const;
type Secao = (typeof SECOES)[number];

type FalhaDeSecao = { secao: Secao; message: string };

const mensagemDe = (motivo: unknown): string =>
  motivo instanceof Error ? motivo.message : "Falha desconhecida na leitura desta seção.";

export async function GET(request: NextRequest) {
  // Identificador da requisição: o mesmo valor aparece no log e na resposta,
  // para o diagnóstico ser rastreável entre as duas sessões.
  const requestId = crypto.randomUUID();
  try {
    const profile = await requireCanonicalSessionProfile();
    // Entrada é validada SEPARADAMENTE: `marcaId` malformado é 400 de verdade.
    let marcaId: string;
    try {
      marcaId = QuerySchema.parse(request.nextUrl.searchParams.get("marcaId"));
    } catch {
      return NextResponse.json({ requestId, code: "invalid_brand_id", error: "Marca inválida." }, { status: 400 });
    }
    await assertEditorialPermission(profile, marcaId, "marca", "view");

    const settled = await Promise.allSettled([
      new WorkflowRepository().list(marcaId),
      new ArtifactRepository().list(marcaId),
      new ContentDocumentRepository().list(marcaId, profile.userId),
      new PublicationRepository().list(marcaId),
      new InvitationRepository().list(marcaId),
      new ViewPreferenceRepository().list(marcaId, profile.userId),
      new SerpSnapshotRepository().list(marcaId),
      new SerpSnapshotRepository().listReviews(marcaId),
    ]);

    const falhas: FalhaDeSecao[] = [];
    const valor = <T,>(indice: number, vazio: T): T => {
      const resultado = settled[indice];
      if (resultado.status === "fulfilled") return resultado.value as T;
      falhas.push({ secao: SECOES[indice], message: mensagemDe(resultado.reason) });
      return vazio;
    };

    const workflow = valor(0, { radar: [] as RadarItem[], planner: [] as PlannerItem[], incompatible: [] as IncompatibleRecord[] });
    const artifacts = valor(1, { articles: [], silos: [], plans: [], events: [], incompatible: [] as IncompatibleRecord[] });
    const documents = valor(2, [] as never[]);
    const publications = valor(3, [] as never[]);
    const invitations = valor(4, [] as never[]);
    const views = valor(5, [] as never[]);
    const serp = valor(6, { records: [], available: false });
    const reviews = valor(7, { reviews: [], available: false });

    // Só a queda do PRÓPRIO workflow torna a mesa do Radar ilegível. Documento,
    // convite ou preferência que falha é diagnóstico — não some com os artigos.
    const workflowCaiu = falhas.some(falha => falha.secao === "workflow");
    const incompatible = [...workflow.incompatible, ...artifacts.incompatible];
    const estado: WorkspaceLoadState = workflowCaiu
      ? "read_failure"
      : resolveLoadState({
        loadedCount: workflow.radar.length + workflow.planner.length + artifacts.articles.length + artifacts.silos.length,
        incompatibleCount: incompatible.length + falhas.length,
      });

    const montado = {
      mode: "server", radarItems: workflow.radar, plannerItems: workflow.planner,
      articleVersions: artifacts.articles, siloVersions: artifacts.silos, versionEvents: artifacts.events, contentPlans: artifacts.plans,
      serpRecords: serp.records, serpReviews: reviews.reviews,
      serpPersistenceMode: serp.available && reviews.available ? "server" : "local_fallback",
      documents, publications, invitations, views, loadedAt: new Date().toISOString(),
      loadDiagnostics: {
        state: estado,
        loadedCount: workflow.radar.length + workflow.planner.length,
        incompatible,
        message: falhas.length
          ? `Seção(ões) que não puderam ser lidas: ${falhas.map(falha => `${falha.secao} (${falha.message})`).join(" · ")}`
          : null,
      },
    };

    const parsed = PersistedEditorialWorkspaceSchema.safeParse(montado);
    if (!parsed.success) {
      // DADO PERSISTIDO inválido não é "marca inválida". A resposta nomeia as
      // seções recusadas para o defeito não custar outra investigação.
      const secoes = [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "raiz")))];
      console.error("[workspace] payload persistido recusado", {
        requestId, marcaId, actorUserId: profile.userId, secoes,
        paths: parsed.error.issues.slice(0, 20).map(issue => issue.path.join(".")),
      });
      return NextResponse.json({
        requestId,
        code: "persisted_data_invalid",
        error: `O servidor leu os registros, mas o payload não corresponde ao contrato nas seções: ${secoes.join(", ")}.`,
        sections: secoes,
      }, { status: 502 });
    }

    // Diagnóstico por operação, sem segredos: contagens e identidades, nunca
    // token, cookie ou payload editorial completo.
    console.info("[workspace] leitura", {
      requestId, marcaId, actorUserId: profile.userId, state: estado,
      counts: {
        radar: workflow.radar.length, planner: workflow.planner.length,
        articles: artifacts.articles.length, silos: artifacts.silos.length,
        events: artifacts.events.length, serpSnapshots: serp.records.length, serpReviews: reviews.reviews.length,
      },
      incompatible: incompatible.length,
      failedSections: falhas.map(falha => falha.secao),
      radarArticleIds: workflow.radar.map(item => item.articleId),
    });

    return NextResponse.json({ requestId, data: parsed.data });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ requestId, code: error.code, error: error.message }, { status: 503 });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ requestId, error: mapped.message }, { status: mapped.status });
  }
}
