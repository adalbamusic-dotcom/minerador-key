import { resolveLoadState, type IncompatibleRecord, type WorkspaceLoadState } from "@/lib/editorial/partial-read";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ArtifactRepository, ContentDocumentRepository, InvitationRepository, PublicationRepository, SerpSnapshotRepository, ViewPreferenceRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { getOperationalClient, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { articleIdsInGroupFilter, groupScopeId, parseGroupIdQuery } from "@/lib/editorial/article-groups";
import { readArticleGroupMemberships, readSiloIdsForArticles } from "@/lib/editorial/article-groups-store";
import { GROUPS_NOT_AVAILABLE } from "@/lib/editorial/editorial-groups";
import { PersistedEditorialWorkspaceSchema } from "@/lib/editorial/persistence-contracts";
import type { RadarItem } from "@/lib/editorial/operational-flow";
import { radarPortableExportStreamResponse } from "@/lib/radar/portable-export-response";
import { lightArtifactSelection } from "@/lib/editorial/workspace-read-scope";
import type { ArticleDNA, SiloDNA, VersionEnvelope, VersionStatusEvent } from "@/lib/arquiteto/contracts";

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

    /*
     * 2026-10-12 · F2 DOS GRUPOS — `groupId` OPCIONAL (SDD §8).
     *
     * Sem o parâmetro, nada abaixo muda: as mesmas oito leituras de sempre e o
     * mesmo corpo. Com ele (`uuid` ou `sem-grupo`), o servidor resolve os
     * artigos do recorte pelo grupo EFETIVO (etiqueta gravada ou herança das
     * keywords) e lê só eles: itens do Radar, ArticleDNA/SiloDNA (os Silos que
     * têm esses artigos), documentos, publicações e SERP. Convites e
     * preferências são da marca e continuam inteiros. A resposta ganha
     * `groupScope`: quem a recebe sabe que é PARCIAL e não pode trocar a lista
     * inteira por ela.
     */
    const grupo = parseGroupIdQuery(request.nextUrl.searchParams.get("groupId"));
    if (!grupo.ok) return NextResponse.json({ requestId, code: "invalid_group_id", error: "Grupo inválido." }, { status: 400 });
    let recorte: { groupId: string; articleIds: string[]; entityIds: string[] } | null = null;
    if (grupo.filter.kind !== "all") {
      const operacional = getOperationalClient();
      const leitura = await readArticleGroupMemberships(operacional, marcaId);
      if (!leitura.ok) return NextResponse.json({ requestId, code: GROUPS_NOT_AVAILABLE, error: "Os grupos ainda não estão disponíveis neste banco." }, { status: 409 });
      const articleIds = [...(articleIdsInGroupFilter(grupo.filter, leitura.memberships.values()) || [])];
      const siloIds = await readSiloIdsForArticles(operacional, marcaId, articleIds);
      recorte = { groupId: groupScopeId(grupo.filter) || "", articleIds, entityIds: [...articleIds, ...siloIds] };
    }
    const doRecorte = recorte ? { articleIds: recorte.articleIds } : {};

    const settled = await Promise.allSettled([
      new WorkflowRepository().list(marcaId, doRecorte),
      recorte ? new ArtifactRepository().listScoped(marcaId, recorte.entityIds) : new ArtifactRepository().list(marcaId),
      new ContentDocumentRepository().list(marcaId, profile.userId),
      new PublicationRepository().list(marcaId, doRecorte),
      new InvitationRepository().list(marcaId),
      new ViewPreferenceRepository().list(marcaId, profile.userId),
      new SerpSnapshotRepository().list(marcaId, undefined, recorte?.articleIds),
      new SerpSnapshotRepository().listReviews(marcaId, undefined, recorte?.articleIds),
    ]);

    const falhas: FalhaDeSecao[] = [];
    const valor = <T,>(indice: number, vazio: T): T => {
      const resultado = settled[indice];
      if (resultado.status === "fulfilled") return resultado.value as T;
      falhas.push({ secao: SECOES[indice], message: mensagemDe(resultado.reason) });
      return vazio;
    };

    const workflow = valor(0, { radar: [] as RadarItem[], incompatible: [] as IncompatibleRecord[] });
    const artifactsLidos = valor(1, { articles: [] as VersionEnvelope<ArticleDNA>[], silos: [] as VersionEnvelope<SiloDNA>[], events: [] as VersionStatusEvent[], incompatible: [] as IncompatibleRecord[] });
    /*
     * 2026-10-13 · `detail=light` (SDD acelerar-fluxo, item 6; SDD 2026-10-12 §8).
     * Sem o parâmetro, nada muda. Com ele, de cada ArticleDNA/SiloDNA só a
     * vigente e a última aprovada (com os eventos delas), mais as versões que um
     * item do Radar ou um documento referenciam. O histórico inteiro de um
     * artefato sai por `GET /api/editorial/workspace/versions`.
     */
    const leve = request.nextUrl.searchParams.get("detail") === "light";
    const documentosParaReferencia = leve ? (settled[2].status === "fulfilled" ? settled[2].value as unknown[] : []) : [];
    const artifacts = leve ? (() => {
      const referenciadas = new Set<string>([
        ...workflow.radar.map(item => item.articleDnaVersionId),
        ...documentosParaReferencia.flatMap(registro => {
          const ref = (registro as { document?: { articleDnaRef?: { versionId?: unknown }; siloDnaRef?: { versionId?: unknown } } }).document;
          return [ref?.articleDnaRef?.versionId, ref?.siloDnaRef?.versionId].filter((id): id is string => typeof id === "string");
        }),
      ]);
      const escolhidos = lightArtifactSelection({
        articles: artifactsLidos.articles,
        silos: artifactsLidos.silos,
        events: artifactsLidos.events,
        articleOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.articleId }),
        siloOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.siloId }),
        keepVersionIds: referenciadas,
      });
      return { ...artifactsLidos, articles: escolhidos.articles, silos: escolhidos.silos, events: escolhidos.events };
    })() : artifactsLidos;
    /* A listagem dos documentos é a função de banco de sempre (leve); o recorte filtra o que ela devolveu, pelo artigo do documento. */
    const artigosDoRecorte = recorte ? new Set(recorte.articleIds) : null;
    const documentosLidos = valor(2, [] as never[]);
    const documents = artigosDoRecorte
      ? documentosLidos.filter(registro => artigosDoRecorte.has(String((registro as { document?: { articleDnaRef?: { entityId?: unknown } } }).document?.articleDnaRef?.entityId ?? "")))
      : documentosLidos;
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
        loadedCount: workflow.radar.length + artifacts.articles.length + artifacts.silos.length,
        incompatibleCount: incompatible.length + falhas.length,
      });

    const montado = {
      mode: "server", radarItems: workflow.radar,
      articleVersions: artifacts.articles, siloVersions: artifacts.silos, versionEvents: artifacts.events,
      serpRecords: serp.records, serpReviews: reviews.reviews,
      serpPersistenceMode: serp.available && reviews.available ? "server" : "local_fallback",
      documents, publications, invitations, views, loadedAt: new Date().toISOString(),
      loadDiagnostics: {
        state: estado,
        loadedCount: workflow.radar.length,
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
        radar: workflow.radar.length,
        articles: artifacts.articles.length, silos: artifacts.silos.length,
        events: artifacts.events.length, serpSnapshots: serp.records.length, serpReviews: reviews.reviews.length,
      },
      incompatible: incompatible.length,
      failedSections: falhas.map(falha => falha.secao),
      radarArticleIds: workflow.radar.map(item => item.articleId),
      groupScope: recorte ? { groupId: recorte.groupId, articles: recorte.articleIds.length } : null,
    });

    /*
     * 2026-10-09 · A MESA SAI EM FLUXO, PELO MESMO CAMINHO DO EXPORT.
     *
     * Medido em produção nesta data (leitura só de dados, marca adalbapro): o
     * corpo desta resposta tinha 10,95 MB — 4,17 MB de itens do Radar e 6,55 MB
     * de versões de ArticleDNA. A função da Vercel recusa corpo acima de 4,5 MB
     * (413 FUNCTION_PAYLOAD_TOO_LARGE). A leitura falhava, a planilha ficava com
     * a cópia local do navegador (só o artigo piloto) e não dizia nada.
     *
     * O export já tinha passado por isso e sai em fluxo
     * (`radarPortableExportStreamResponse`); a mesa usa o MESMO helper. É o
     * mesmo JSON: `resposta.json()` junta os pedaços e nenhum consumidor muda.
     * Os erros acima continuam em `NextResponse.json`: são pequenos.
     */
    if (recorte) {
      return radarPortableExportStreamResponse({ requestId, data: parsed.data, groupScope: { groupId: recorte.groupId, articleIds: recorte.articleIds, partial: true } });
    }
    return radarPortableExportStreamResponse({ requestId, data: parsed.data });
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      /* O erro do driver já vinha preservado no objeto e nunca era lido. */
      console.error("[workspace:read]", requestId, error.reason, error.driver?.code || "", error.driver?.message || "");
      return NextResponse.json({ requestId, code: error.code, error: error.message, details: { reason: error.reason, driver: error.driver } }, { status: 503 });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ requestId, error: mapped.message }, { status: mapped.status });
  }
}
