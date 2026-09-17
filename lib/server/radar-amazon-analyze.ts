/**
 * ===== A ANÁLISE E O CONGELAMENTO DA AMAZON — AMAZON_SEARCH_2 · §2 e §23 =====
 *
 * ========================= ZERO PROVIDER CALLS =========================
 *
 * Nada aqui fala com DataForSEO, com a Amazon nem com o Google. As duas
 * funções leem o que JÁ foi coletado e pago, derivam e gravam.
 *
 * Ler o snapshot do apoio no armazenamento NÃO é chamada de provider: é o
 * mesmo dado que a coleta gravou, buscado onde ele mora. A alternativa —
 * copiar o snapshot inteiro para dentro da análise só para poder lê-lo aqui —
 * repetiria a duplicação que custou 88% de uma fotografia de YouTube.
 *
 * ==================== ANALISAR NÃO É COLETAR DE NOVO ====================
 *
 * A análise nunca recoleta. Se o apoio faltou, ela declara `SUPPORT_MISSING` e
 * segue com o que a Amazon sustenta — porque jogar fora uma coleta paga por
 * causa de uma leitura de apoio ausente seria cobrar duas vezes pelo mesmo
 * artigo.
 */

import { z } from "zod";
import { createRadarAnalysisSuccessor } from "../radar/analysis-contracts.ts";
import { RadarAmazonSearchRunSchema, type RadarAmazonSearchRun } from "../radar/amazon-search-run.ts";
import { RadarResearchPackageRecordSchema } from "../radar/research-package.ts";
import { amazonCompetitiveBlueprintOfAnalysis } from "../radar/amazon-editorial.ts";
import { buildRadarAmazonGoogleSupport, type RadarAmazonGoogleSupport } from "../radar/amazon-google-support.ts";
import { radarAmazonEligibleCandidates } from "../radar/amazon-eligibility.ts";
import {
  freezeRadarAmazonInvestigation,
  resolveRadarAmazonFrozenRun,
  RadarAmazonFinalizeError,
  RadarAmazonFrozenInvestigationSchema,
} from "../radar/amazon-evidence.ts";
import { RadarCompetitiveBlueprintSchema, type RadarAmazonBlueprint, type RadarResearchRef } from "../radar/competitive-blueprint.ts";
import { radarDeclaredArticleIntent } from "../radar/editorial-identity.ts";
import { ArtifactRepository, SerpSnapshotRepository } from "./editorial-repositories.ts";
import { RadarStartError, radarStartPorts } from "./radar-youtube-start.ts";

export class RadarAmazonAnalyzeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "RadarAmazonAnalyzeError";
    this.code = code;
    this.status = status;
  }
}

/* ===================== a leitura da versão corrente ===================== */

async function lerCorrente(entrada: { brandId: string; articleId: string }) {
  const estado = await radarStartPorts.loadRadarState(entrada);
  const corrente = estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
  if (!estado || !corrente) {
    throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para este artigo.", 404);
  }
  return { estado, corrente };
}

/**
 * ============ §2 · O APOIO É LIDO, NUNCA RECOLETADO ============
 *
 * O snapshot já existe: a coleta do 1.1 o gravou no mesmo clique da primária.
 * Aqui ele é apenas encontrado pelo id que o pacote guardou e destilado.
 *
 * Não achar o snapshot NÃO é erro: é análise parcial, declarada em
 * `SUPPORT_MISSING`. Falhar aqui bloquearia uma investigação inteira por causa
 * de uma leitura de apoio, que é justamente a que pode faltar.
 */
export async function loadRadarAmazonSupport(entrada: {
  brandId: string;
  articleId: string;
  snapshotId: string | null;
}): Promise<RadarAmazonGoogleSupport | null> {
  if (!entrada.snapshotId) return null;

  const historico = await new SerpSnapshotRepository().list(entrada.brandId, entrada.articleId);
  const registro = historico.records.find(item => item.research?.id === entrada.snapshotId);
  if (!registro?.research) return null;

  return buildRadarAmazonGoogleSupport({ snapshotId: entrada.snapshotId, snapshot: registro.research });
}

/* ============================== a análise ============================== */

export async function analyzeRadarAmazonInvestigation(entrada: {
  brandId: string;
  articleId: string;
  actorId: string;
  analyzedAt: string;
}): Promise<{ blueprint: RadarAmazonBlueprint; analysisVersionId: string; supportApplied: boolean }> {
  const { estado, corrente } = await lerCorrente(entrada);
  const payload = corrente.payload;

  const pacote = payload.researchPackage ? RadarResearchPackageRecordSchema.parse(payload.researchPackage) : null;
  const corrida = payload.amazonSearch ? RadarAmazonSearchRunSchema.parse(payload.amazonSearch) : null;

  /*
   * §23 · A PRÉ-CONDIÇÃO É A PESQUISA PRONTA — e "pronta" é do pacote.
   *
   * Analisar uma coleta em curso produziria um blueprint sobre metade de uma
   * prateleira, e ele ficaria gravado com a mesma aparência de um completo.
   */
  if (!pacote || !corrida) {
    throw new RadarAmazonAnalyzeError(
      "amazon_research_missing",
      "Não há pesquisa Amazon gravada neste artigo para analisar.",
    );
  }
  if (pacote.primaryResearch.status !== "COLLECTED" || corrida.state !== "COLLECTED") {
    throw new RadarAmazonAnalyzeError(
      "amazon_research_not_ready",
      "A pesquisa Amazon ainda não está concluída: não há o que analisar.",
    );
  }
  if (!corrida.universe.length) {
    throw new RadarAmazonAnalyzeError(
      "amazon_universe_empty",
      "A coleta não devolveu produtos: não há amostra competitiva para analisar.",
    );
  }
  /*
   * ===== 1.2 · §5 · RANKING SEM CANDIDATO COMPATÍVEL NÃO ANALISA =====
   *
   * A coleta trouxe 59 produtos e o alvo é "sérum Nivea": se NENHUM deles
   * mencionar as duas coisas, não existe um Top N a construir. Analisar mesmo
   * assim gravaria um blueprint de ranking com lista vazia — e ele ficaria com
   * a mesma aparência de um completo.
   *
   * A recusa é do SERVIDOR porque é ela que impede a gravação. O botão
   * desabilitado é conforto de tela; o que protege o dado é isto.
   *
   * As formas que não prometem ranking passam: um guia de compra mapeia
   * critérios de uma categoria e não depende de shortlist.
   */
  const configuracao = payload.amazonEditorialSetup;
  if (configuracao) {
    const intencao = configuracao.intent.type;
    const exigeRanking = intencao === "TOP_BEST" || intencao === "TOP_VALUE" || intencao === "BEST_FOR_USE_CASE";
    if (exigeRanking) {
      const compativeis = radarAmazonEligibleCandidates({
        intent: configuracao.intent,
        target: configuracao.target,
        universe: corrida.universe,
      });
      if (!compativeis.eligible.length) {
        throw new RadarAmazonAnalyzeError(
          "amazon_no_eligible_candidates",
          `Nenhum dos ${compativeis.rawCount} produtos observados é compatível com o alvo declarado; não há ranking a construir. Revise o tipo de produto e o filtro de marca antes de analisar.`,
        );
      }
    }
  }

  if (payload.amazonFrozenInvestigation) {
    /*
     * §27 · DEPOIS DO FREEZE, ANALISAR DE NOVO REESCREVERIA O ASSINADO.
     *
     * Reabrir continua possível — e é explícito, com a consequência declarada.
     */
    throw new RadarAmazonAnalyzeError(
      "amazon_already_finalized",
      "Esta investigação está finalizada. Reabra antes de analisar novamente.",
    );
  }

  const apoio = await loadRadarAmazonSupport({
    brandId: entrada.brandId,
    articleId: entrada.articleId,
    snapshotId: pacote.supportResearch?.status === "COLLECTED" ? pacote.supportResearch.snapshotId : null,
  });

  /* O fundamento do artigo: intenção declarada e keyword. Nunca observação. */
  const artefatos = await new ArtifactRepository().list(entrada.brandId);
  const article = artefatos.articles.find(version =>
    version.payload.articleId === entrada.articleId && version.payload.brandId === entrada.brandId);

  const referencias: RadarResearchRef[] = [{
    source: "AMAZON_SERP",
    role: "PRIMARY_COMPETITIVE_RESEARCH",
    ref: corrida.runId,
    fingerprint: corrida.fingerprint.signature,
    collectedAt: corrida.provenance.collectedAt,
    sampleSize: corrida.universe.length,
  }];
  if (apoio) {
    referencias.push({
      source: "WEB_SERP",
      role: "SEO_COMMERCIAL_SUPPORT",
      ref: apoio.snapshotId,
      fingerprint: null,
      collectedAt: apoio.collectedAt,
      sampleSize: 0,
    });
  }

  const blueprint = amazonCompetitiveBlueprintOfAnalysis({
    articleId: entrada.articleId,
    articleDnaVersionId: payload.articleDnaVersionId,
    articleDnaContentHash: payload.finalizedBundle?.binding.articleDnaContentHash ?? null,
    run: corrida,
    support: apoio,
    primaryKeyword: pacote.supportResearch?.keyword
      || corrida.queries.find(consulta => consulta.origin === "PRIMARY_KEYWORD")?.text
      || null,
    declaredIntent: article ? radarDeclaredArticleIntent(article.payload) : null,
    researchRefs: referencias,
    generatedAt: entrada.analyzedAt,
    frozenAt: null,
  });

  const proxima = await createRadarAnalysisSuccessor(corrente, { amazonBlueprint: blueprint }, entrada.actorId);
  await radarStartPorts.appendAnalysis({
    brandId: entrada.brandId, articleId: entrada.articleId,
    expectedLock: estado.lockVersion, analysis: proxima,
  });

  return { blueprint, analysisVersionId: proxima.versionId, supportApplied: Boolean(apoio) };
}

/* ============================= o congelamento ============================= */

export async function finalizeRadarAmazonInvestigation(entrada: {
  brandId: string;
  articleId: string;
  actorId: string;
  finalizedAt: string;
}): Promise<{ analysisVersionId: string; frozen: z.infer<typeof RadarAmazonFrozenInvestigationSchema>; alreadyFrozen: boolean }> {
  const { estado, corrente } = await lerCorrente(entrada);
  const payload = corrente.payload;

  /*
   * ============ §9 DO 1.2 · FINALIZE É IDEMPOTENTE ============
   *
   * Clicar de novo sobre uma investigação congelada não pode tirar outra
   * fotografia: `finalizedAt` mudaria, nasceria uma versão nova e o Planejador
   * veria duas investigações onde houve uma.
   */
  if (payload.amazonFrozenInvestigation) {
    return {
      analysisVersionId: corrente.versionId,
      frozen: RadarAmazonFrozenInvestigationSchema.parse(payload.amazonFrozenInvestigation),
      alreadyFrozen: true,
    };
  }

  const corrida: RadarAmazonSearchRun | null = payload.amazonSearch
    ? RadarAmazonSearchRunSchema.parse(payload.amazonSearch)
    : null;
  const blueprint = payload.amazonBlueprint
    ? RadarCompetitiveBlueprintSchema.parse(payload.amazonBlueprint)
    : null;

  if (!corrida || !blueprint || blueprint.profile !== "AMAZON") {
    /*
     * §24 · CONGELAR EXIGE ANÁLISE FEITA.
     *
     * Uma fotografia sem blueprint dentro seria uma coleta carimbada de
     * "finalizada" — e chegaria ao Planejador com o peso de uma conclusão.
     */
    throw new RadarAmazonAnalyzeError(
      "amazon_blueprint_missing",
      "Não há blueprint da Amazon nesta versão: analise a pesquisa antes de finalizar.",
    );
  }

  const pacote = payload.researchPackage ? RadarResearchPackageRecordSchema.parse(payload.researchPackage) : null;
  const apoioRef = pacote?.supportResearch?.status === "COLLECTED" && pacote.supportResearch.snapshotId
    ? [{
      source: "WEB_SERP" as const,
      role: "SEO_COMMERCIAL_SUPPORT" as const,
      snapshotId: pacote.supportResearch.snapshotId,
      keyword: pacote.supportResearch.keyword,
      collectedAt: pacote.supportResearch.collectedAt,
    }]
    : [];

  const fotografia = freezeRadarAmazonInvestigation({
    run: corrida,
    blueprint,
    supportRefs: apoioRef,
    finalizedBy: entrada.actorId,
    finalizedAt: entrada.finalizedAt,
    /* §6 · a intenção original viaja com a fotografia que ela originou. */
    setup: payload.amazonEditorialSetup
      ? { intent: payload.amazonEditorialSetup.intent, target: payload.amazonEditorialSetup.target }
      : null,
  });

  /*
   * ============ §26 · A FOTOGRAFIA SUBSTITUI O BLUEPRINT VIVO ============
   *
   * Guardar os dois deixaria a mesma leitura gravada duas vezes na mesma
   * versão — que é exatamente a forma da duplicação que este gate herdou
   * corrigida. A partir daqui a autoridade é a fotografia, e ela é uma só.
   */
  const proxima = await createRadarAnalysisSuccessor(
    corrente,
    { amazonFrozenInvestigation: fotografia, amazonBlueprint: null },
    entrada.actorId,
  );
  await radarStartPorts.appendAnalysis({
    brandId: entrada.brandId, articleId: entrada.articleId,
    expectedLock: estado.lockVersion, analysis: proxima,
  });

  return { analysisVersionId: proxima.versionId, frozen: fotografia, alreadyFrozen: false };
}

/** A conferência de referência, para quem lê a fotografia. Reexportada aqui. */
export { resolveRadarAmazonFrozenRun, RadarAmazonFinalizeError };
