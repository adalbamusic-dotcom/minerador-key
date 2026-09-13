import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractCompetitorPage, CompetitorExtractionError } from "@/lib/radar/competitor-extractor";
import { RADAR_EXTRACTION_ERROR, RadarExtractionRequestSchema, isRadarResearchCandidate, radarExtractionRefusal, radarExtractionTargets } from "@/lib/radar/extraction-request";
import { VersionedRadarAnalysisSchema } from "@/lib/radar/analysis-contracts";
import { SerpSnapshotRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";

/** As versões gravadas da linha Radar, como a rota de leitura já as lê. */
function storedRadarAnalyses(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as { analysisVersions?: unknown }).analysisVersions;
  return VersionedRadarAnalysisSchema.array().parse(Array.isArray(raw) ? raw : []);
}

/**
 * O contrato vive em `lib/radar/extraction-request.ts`, não aqui.
 *
 * Enquanto o schema morou dentro da rota, o teto de páginas por requisição era
 * invisível para quem monta o pedido: sete referências curadas saíam inteiras e
 * voltavam `too_big` em `candidates`, sob a mensagem "Solicitação de extração
 * Radar inválida." — que não dizia qual contrato havia recusado.
 *
 * O teto continua sendo do servidor e o schema continua `.strict()`. O que
 * mudou é que ele é conhecido pelo cliente, que envia em lotes.
 */

/** Recusa com código: a mensagem curta fica na tela, a causa fica no log. */
function recusa(code: string, message: string, status: number, details?: unknown) {
  console.error("[radar:extract]", code, message, details ? JSON.stringify(details) : "");
  return NextResponse.json({ code, error: message, ...(details ? { details } : {}) }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RadarExtractionRequestSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");

    /*
     * ============ A ANÁLISE QUE VALE É A PERSISTIDA, NÃO A ENVIADA ==========
     *
     * O portão sempre leu a análise que veio no corpo — e o corpo é do cliente.
     * Para uma referência da pesquisa profunda isso seria fatal: quem monta o
     * pedido também escolheria a URL, e "o servidor resolve o destino" viraria
     * texto de relatório.
     *
     * Então a rota vai buscar a versão gravada da linha Radar desta marca e
     * deste artigo, e é ELA a autoridade. O corpo continua entrando no portão
     * (para recusar seleção montada sobre outro snapshot), mas o destino do
     * fetch sai do que está no banco.
     *
     * Sem leitura remota não há referência de pesquisa: a recusa é declarada,
     * e o caminho canônico segue como sempre.
     */
    let autoridade = input;
    let remotaDisponivel = false;
    try {
      const linha = await new WorkflowRepository().findByArticle(input.brandId, input.articleId, "radar");
      if (linha && linha.marca_id === input.brandId && linha.article_id === input.articleId) {
        const versoes = storedRadarAnalyses(linha.payload);
        const persistida = versoes.find(version => version.versionId === input.analysis.versionId) || versoes.at(-1) || null;
        if (persistida) {
          autoridade = { ...input, analysis: persistida };
          remotaDisponivel = true;
        }
      }
    } catch (error) {
      if (!(error instanceof PersistenceUnavailableError)) throw error;
    }

    const referencias = input.candidates.filter(isRadarResearchCandidate);
    if (referencias.length && !remotaDisponivel) {
      return recusa(
        RADAR_EXTRACTION_ERROR.REFERENCE_UNKNOWN,
        "A curadoria de pesquisa não pôde ser lida do servidor; nenhuma referência foi extraída.",
        503,
        { referenceIds: referencias.map(candidate => candidate.referenceId) },
      );
    }

    /*
     * O portão é do domínio: artigo, snapshot, impressão digital da curadoria,
     * chaves incluídas e — agora — o par referência ↔ URL. A rota só traduz a
     * recusa em resposta HTTP.
     */
    /*
     * O snapshot persistido fecha o último vão: decisão antiga não guardava a
     * URL, e sem ela a chave era validada sozinha. Com o snapshot remoto em
     * mãos, `organic:<posição>` volta a ter destino conhecido pelo servidor.
     */
    let canonicalUrlByKey: Map<string, string> | undefined;
    try {
      const historico = await new SerpSnapshotRepository().list(input.brandId, input.articleId);
      const snapshot = historico.records.find(record => record.id === autoridade.analysis.payload.serpSnapshotId)
        || historico.records.filter(record => record.research).at(-1)
        || null;
      if (snapshot?.research) {
        canonicalUrlByKey = new Map(snapshot.research.organicResults.map(result => [`organic:${result.position}`, result.url]));
      }
    } catch (error) {
      if (!(error instanceof PersistenceUnavailableError)) throw error;
    }

    const recusado = radarExtractionRefusal(autoridade, canonicalUrlByKey);
    if (recusado) return recusa(recusado.code, recusado.message, recusado.status, recusado.details);

    /* O destino de cada busca sai da autoridade, nunca do candidato enviado. */
    const unique = [...new Map(radarExtractionTargets(autoridade, canonicalUrlByKey).map(target => [target.key, target])).values()];
    /*
     * Uma URL que falha não derruba a amostra: cada página volta como sucesso
     * ou como erro nomeado, e o benchmark decide depois o que é comparável.
     */
    const pages = await Promise.all(unique.map(async target => {
      try {
        return { key: target.key, page: await extractCompetitorPage(target.url, { keyword: input.keyword }) };
      } catch (error) {
        const extractionError = error instanceof CompetitorExtractionError ? error : new CompetitorExtractionError("fetch_failed", "Falha na extração.", 502);
        return { key: target.key, error: { code: extractionError.code, message: extractionError.message, status: extractionError.status, url: target.url } };
      }
    }));
    return NextResponse.json({ pages: pages.filter(result => "page" in result), errors: pages.filter(result => "error" in result), extractedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const excedeuLote = error.issues.some(issue => issue.code === "too_big" && issue.path.join(".") === "candidates");
      const code = excedeuLote ? RADAR_EXTRACTION_ERROR.BATCH_TOO_LARGE : RADAR_EXTRACTION_ERROR.REQUEST_INVALID;
      return recusa(code, "Solicitação de extração Radar inválida.", 400, error.issues);
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ code: error instanceof AuthzError ? "authorization_error" : "radar_extraction_error", error: mapped.message }, { status: mapped.status });
  }
}
