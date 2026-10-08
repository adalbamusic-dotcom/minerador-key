/*
 * 2026-10-08 · A MESA DO RADAR EM TAMANHO DE VERDADE, PARA MONTAR A TELA INTEIRA.
 *
 * Mesma receita da bancada de medição do scratchpad, em escala de teste: tudo
 * passa pelos schemas e pelas funções de produção — SERP DataForSEO real
 * normalizada (fixture gravada), plano de consultas, curadoria automática,
 * páginas extraídas no formato `RadarExtractionPage`, versões de análise com
 * `VersionedRadarAnalysisSchema`. Nenhuma rede, nenhum provider.
 *
 * `novaVersao` e `novaSelecao` produzem o que a mesa recebe quando uma versão
 * nova é gravada (outra amostra) ou quando a curadoria muda (outra seleção):
 * um RadarItem NOVO com a versão a mais — é assim que a mesa real atualiza.
 */
import { readFileSync } from "node:fs";
import { RadarAnalysisPayloadSchema, RadarExtractionPageSchema, VersionedRadarAnalysisSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarItemSchema } from "../lib/editorial/operational-flow.ts";
import { VersionedArticleDNASchema, VersionedSiloDNASchema } from "../lib/arquiteto/contracts.ts";
import { SerpCollectionRecordSchema } from "../lib/editorial/contracts.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { buildRadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { startRadarDeepResearch, settleRadarDeepResearchQuery, radarQueryEvidenceFrom } from "../lib/radar/deep-research.ts";
import { buildRadarAutomaticResearchCuration } from "../lib/radar/research-auto-selection.ts";

const uuid = (n: number) => `7c2e${String(n).padStart(4, "0")}-2c3d-4e5f-8a9b-${String(n).padStart(12, "0")}`;
const hash = (n: number) => `sha256:${n.toString(16).padStart(64, "0")}`;
export const MARCA = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const ATOR = uuid(99);
const SILO = uuid(10);
const NOME_DO_SILO = "Marketing para dentistas";
const TEMAS = ["marketing digital para dentistas", "instagram para dentistas", "google meu negócio para dentistas", "site para dentistas"];
const CORPO_DA_SERP = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));

const H2 = [
  "O que é marketing digital para dentistas?", "Por que o dentista precisa de marketing digital?", "Como montar uma estratégia de marketing odontológico",
  "Instagram para dentistas: o que postar", "Google Meu Negócio: apareça nas buscas locais", "Tráfego pago para consultórios odontológicos",
  "Site profissional para dentistas", "Marketing de conteúdo para clínicas", "O que o CFO permite na publicidade odontológica?",
  "Como medir os resultados do marketing",
];

function referencia(id: string, texto: string, papel: "principal" | "secundaria", volume: number) {
  return {
    keywordId: id, keywordDnaVersionId: `kwdna-${id}`, keywordDnaContentHash: hash(500), role: papel,
    strategicContribution: `Contribuição de ${texto}`, coveredIntentions: ["informacional"], requiredTopics: [texto], excludedTopics: [],
    classificationOrigin: "human" as const, confidence: 0.8, humanConfirmed: true, normalizedIntent: "informational" as const,
    volume, resultCount: 190, kgrScore: 0.08, incrementalVolume: papel === "principal" ? null : volume,
    contribution: papel === "principal" ? "central" as const : "incremental_volume" as const,
    purpose: "Cobrir a intenção declarada", overlapRisk: "low" as const,
  };
}

function pagina(artigo: number, indice: number, url: string, keyword: string) {
  const h2 = H2.slice(0, 6 + ((artigo + indice) % 4));
  return RadarExtractionPageSchema.parse({
    id: `competitor:${artigo}-${indice}`, url, status: "success", fetchedAt: "2026-10-08T10:00:00.000Z",
    title: `${keyword} · guia ${indice}`, metaDescription: `Página ${indice} sobre ${keyword}.`, canonical: null,
    h1: [`${keyword}: guia completo ${indice}`], h2, h3: [], wordCount: 1800 + indice * 37,
    internalLinkCount: 4, externalLinkCount: 2, listCount: 5, tableCount: indice % 2, faqCount: 1, imageCount: 6,
    blockquoteCount: 0, comparisonCount: 1, hasDates: true, author: "Equipe", structuredDataTypes: ["Article"],
    recurringTerms: Array.from({ length: 8 }, (_, k) => ({ term: `termo ${k} ${keyword.split(" ")[k % 3] || "x"}`, frequency: 3 + (k % 5), pageCount: 1, sources: ["h2"], pageIds: [`competitor:${artigo}-${indice}`] })),
    boldCount: 9, italicCount: 2, paragraphCount: 30, paragraphWordCounts: Array.from({ length: 30 }, (_, k) => 30 + (k * 7) % 60),
    headingOutline: [{ level: 1, text: `${keyword}: guia completo ${indice}` }, ...h2.map(texto => ({ level: 2 as const, text: texto }))],
    introWordCount: 90, introText: `Introdução sobre ${keyword}.`, closingWordCount: 60, closingText: `Conclusão sobre ${keyword}.`, hasClosing: true,
    emphasizedTerms: [`destaque ${keyword}`],
    observedLinks: Array.from({ length: 6 }, (_, j) => ({
      destinationUrl: j % 2 ? `https://fonte-${j}.org/artigo-${j}` : `https://dominio-${indice}.com.br/blog/post-${j}`,
      destinationDomain: j % 2 ? `fonte-${j}.org` : `dominio-${indice}.com.br`, kind: j % 2 ? "EXTERNAL" : "INTERNAL",
      anchorText: `âncora ${j} sobre marketing para consultórios`, surroundingText: `Parágrafo ${j}.`, sectionHeading: h2[j % h2.length], rel: [], target: null, order: j,
    })),
    keywordPlacement: { keyword, title: true, h1: true, h2: true, h3: false, intro: true, body: true, occurrences: 7 },
    error: null,
  });
}

function evidenciaAuxiliar(artigo: number, consulta: number, canonicas: Array<{ url: string; title: string; domain: string }>) {
  const repetidas = canonicas.slice(consulta, consulta + 5);
  const novas = Array.from({ length: 3 }, (_, k) => ({ url: `https://novo-${artigo}-${consulta}-${k}.com.br/marketing-consultorio`, title: `Resultado novo ${consulta}.${k}`, domain: `novo-${artigo}-${consulta}-${k}.com.br` }));
  const resultados = [...repetidas, ...novas].map((r, k) => ({ ...r, position: k + 1, inferredType: "article" }));
  return radarQueryEvidenceFrom({
    serpClass: "auxiliary",
    research: { id: `aux-${artigo}-${consulta}`, collectedAt: "2026-10-08T09:00:00.000Z", contentHash: hash(9000 + artigo * 10 + consulta), organicResults: resultados, diagnostic: { dominantIntent: "informacional" } },
  });
}

type Versao = ReturnType<typeof VersionedRadarAnalysisSchema.parse>;

function versaoDeAnalise(input: { artigo: number; articleId: string; dnaVersion: string; serpId: string; serpVersion: number; serpHash: string | null; registro: unknown; urls: string[]; extraidas: number; falhas: number; numero: number; tema: string }): Versao {
  const extraidas = input.urls.slice(0, input.extraidas).map((url, k) => pagina(input.artigo, k, url, input.tema));
  const falhas = input.urls.slice(input.extraidas, input.extraidas + input.falhas).map((url, k) => ({ key: `fail-${k}`, url, code: "blocked", message: "Acesso negado (403)", status: 403, observedAt: "2026-10-08T10:00:00.000Z" }));
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: MARCA, articleId: input.articleId, articleDnaVersionId: input.dnaVersion,
    serpSnapshotId: input.serpId, serpSnapshotVersion: input.serpVersion, serpSnapshotHash: input.serpHash,
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: extraidas.map(p => p.id), extractions: extraidas, extractionFailures: falhas,
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: input.registro, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null, amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null, researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["bancada"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
    analysisCompletedAt: extraidas.length ? "2026-10-08T11:00:00.000Z" : null,
  });
  return VersionedRadarAnalysisSchema.parse({
    versionId: `${input.articleId}-v${input.numero}`, entityId: `radar-analysis:${input.articleId}`, versionNumber: input.numero,
    previousVersionId: input.numero > 1 ? `${input.articleId}-v${input.numero - 1}` : null,
    contentHash: hash(7000 + input.artigo * 10 + input.numero), origin: "human", changeReason: `bancada v${input.numero}`,
    createdAt: `2026-10-08T1${input.numero % 10}:00:00.000Z`, createdBy: ATOR, payload,
  });
}

/** Como cada artigo analisado foi montado — para gerar versões novas dele depois. */
type Receita = { artigo: number; articleId: string; dnaVersion: string; serpId: string; serpVersion: number; serpHash: string | null; registro: Record<string, unknown>; urls: string[]; tema: string };

/**
 * `analisados` artigos com SERP, pesquisa e 2 versões de análise (12 lidas +
 * 3 falhas na corrente); `soSerp` com SERP e sem análise; o resto, novos.
 */
export function montarMesa(opcoes: { total: number; analisados: number; soSerp: number }) {
  const radarItems: Record<string, unknown>[] = [];
  const serpRecords: unknown[] = [];
  const articleVersions: Record<string, unknown> = {};
  const keywords: unknown[] = [];
  const receitas = new Map<string, Receita>();

  for (let i = 0; i < opcoes.total; i += 1) {
    const tema = TEMAS[i % TEMAS.length] + (i >= TEMAS.length ? ` ${i}` : "");
    const articleId = uuid(200 + i);
    const dnaVersion = uuid(300 + i);
    const kw = [uuid(400 + i), uuid(450 + i)];
    const textos = [tema, `${tema} como fazer`];
    const refs = kw.map((id, k) => referencia(id, textos[k], k === 0 ? "principal" : "secundaria", k === 0 ? 1900 : 320));
    articleVersions[articleId] = VersionedArticleDNASchema.parse({
      versionId: dnaVersion, entityId: articleId, versionNumber: 1, previousVersionId: null,
      contentHash: hash(300 + i), origin: "human", changeReason: "bancada", createdAt: "2026-10-01T09:00:00.000Z", createdBy: ATOR,
      payload: {
        schemaVersion: 1, articleId, brandId: MARCA, principalKeywordId: kw[0], secondaryKeywordIds: kw.slice(1), narrativeReinforcementIds: [],
        keywordReferences: refs, siloId: SILO, hierarchy: i === 0 ? "Pilar" : "Suporte", suggestedSlug: `artigo-${i}`, canonical: null,
        mainIntent: "informacional", auxiliaryIntents: [], audience: "Dentistas com consultório próprio", problem: "Agenda vazia", desiredResult: "Agenda cheia",
        journeyStage: "consideracao", brandObjective: "Autoridade", promise: `Guia de ${tema}`, angle: "Prático", cta: "Conhecer",
        coverage: [tema], excludedSubjects: [], antiCannibalizationBoundary: "Sem finanças", nearbyArticleIds: [],
        differentiation: ["Passo a passo"], entities: ["consultório", "paciente"], requiredTopics: ["estratégia", "canais"],
        questions: ["por onde começar?"], objections: ["preço"], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.7, humanPendingDecisions: [],
      },
    });
    textos.forEach((texto, k) => keywords.push({ id: kw[k], keyword: texto, lista_id: SILO }));
    const snap = (k: number) => ({
      referenceKeywordId: kw[k], canonicalKeywordId: kw[k], sourceKeywordId: kw[k], originalKeywordId: kw[k], aliases: [], keywordDnaVersionId: `kwdna-${kw[k]}`,
      keyword: textos[k], role: k === 0 ? "principal" : "secundaria", brandId: MARCA, siloId: SILO, siloName: NOME_DO_SILO, isPublished: false,
    });
    const itemBase = RadarItemSchema.parse({
      id: `radar:${articleId}`, brandId: MARCA, articleId, articleDnaVersionId: dnaVersion, articleDnaContentHash: hash(300 + i),
      title: `Guia de ${tema}`, slug: `slug-${i}`, siloId: SILO, hierarchy: i === 0 ? "Pilar" : "Suporte", principalKeywordId: kw[0], format: "Artigo",
      intent: "informacional", state: "research_pending", importedAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-08T10:00:00.000Z", origin: "real", lockVersion: 3,
      hydration: {
        schemaVersion: 1, brandId: MARCA, articleId, articleDnaVersionId: dnaVersion, source: "arquiteto_import", capturedAt: "2026-10-01T10:00:00.000Z",
        principalKeywordId: kw[0], principalKeyword: snap(0), keywordSnapshots: [0, 1].map(snap),
        silo: { id: SILO, name: NOME_DO_SILO, siloDnaVersionId: uuid(20), siloDnaContentHash: hash(20), territoryRef: "t", siloPageId: null, siloPageVersionId: null, siloPageSlug: null, siloPageCanonical: null, siloPagePublicationStatus: null, articleRole: i === 0 ? "pillar" : "support" },
      },
      arquitetoKeywordDnaReferences: refs,
    });

    const analisado = i < opcoes.analisados;
    const soSerp = !analisado && i < opcoes.analisados + opcoes.soSerp;
    if (!analisado && !soSerp) { radarItems.push(itemBase); continue; }

    const pesquisa = normalizeDataForSeoSerpResponse(CORPO_DA_SERP, {
      brandId: MARCA, articleId, articleDnaVersionId: dnaVersion, keywordId: kw[0], keywordDnaVersionId: `kwdna-${kw[0]}`, keyword: tema,
      location: "2076", language: "pt", device: "desktop", operatingSystem: "windows", expectedIntent: "informacional", expectedFormat: "Suporte",
      requiredTopics: ["estratégia"], articleEntities: ["consultório"], resultLimit: 10, version: 1, previousSnapshotId: null,
    }, { locationCode: 2076, languageCode: "pt" }, "2026-10-08T08:00:00.000Z", `tarefa-${i}`);
    const serpId = uuid(600 + i);
    const record = SerpCollectionRecordSchema.parse({
      id: serpId, input: { keyword: pesquisa.query, articleId, location: pesquisa.location, language: pesquisa.language, device: pesquisa.device },
      status: "collected", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null,
      dnaIntent: null, conflictReason: null, humanDecisionRequired: false, research: { ...pesquisa, id: serpId, persistenceMode: "remote", status: "approved" },
    });
    serpRecords.push(record);
    if (!analisado) { radarItems.push(itemBase); continue; }

    const pesquisaGravada = record.research;
    if (!pesquisaGravada) throw new Error("fixture: registro SERP sem pesquisa");
    const contexto = buildRadarArticleResearchContext({ item: itemBase, article: articleVersions[articleId] as never });
    let registro = startRadarDeepResearch({ context: contexto, plan: buildRadarResearchQueryPlan(contexto), startedBy: ATOR, now: "2026-10-08T09:00:00.000Z" });
    const canonicas = (record.research?.organicResults || []).map((r: { url: string; title: string; domain: string }) => ({ url: r.url, title: r.title, domain: r.domain }));
    let auxiliar = 0;
    for (const consulta of registro.queries) {
      if (consulta.execution !== "PLANNED") continue;
      const evidencia = consulta.serpClass === "canonical" ? radarQueryEvidenceFrom({ serpClass: "canonical", research: pesquisaGravada }) : evidenciaAuxiliar(i, auxiliar++, canonicas);
      registro = settleRadarDeepResearchQuery(registro, consulta.queryId, { execution: "EXECUTED", reason: "coletada", evidence: evidencia });
    }
    const auto = buildRadarAutomaticResearchCuration({ record: registro, context: contexto, confirmedBy: ATOR, now: "2026-10-08T09:10:00.000Z" });
    registro = { ...registro, researchCuration: auto.curation };
    const selecionadas: string[] = (auto.curation?.references || []).filter((r: { decision: string }) => r.decision !== "excluded" && r.decision !== "pending").map((r: { url: string }) => r.url);
    const urls = selecionadas.length ? selecionadas : canonicas.map(c => c.url);
    const receita: Receita = { artigo: i, articleId, dnaVersion, serpId, serpVersion: record.research?.version ?? 1, serpHash: record.research?.contentHash ?? null, registro: registro as Record<string, unknown>, urls, tema };
    receitas.set(articleId, receita);
    const versoes = [1, 2].map(numero => versaoDeAnalise({ ...receita, extraidas: numero === 2 ? 12 : 0, falhas: numero === 2 ? 3 : 0, numero }));
    radarItems.push({ ...itemBase, analysisVersions: versoes });
  }

  const siloVersions = {
    [SILO]: VersionedSiloDNASchema.parse({
      versionId: uuid(20), entityId: SILO, versionNumber: 1, previousVersionId: null, contentHash: hash(20), origin: "human", changeReason: "bancada",
      createdAt: "2026-10-01T08:00:00.000Z", createdBy: ATOR,
      payload: {
        schemaVersion: 1, formationStatus: "formed", siloId: SILO, brandId: MARCA, name: NOME_DO_SILO,
        territoryNarrative: { statement: "Território.", continuity: "coherent", brandAlignment: "aligned", rationale: ["bancada"] },
        centralEntity: "consultório", objective: "Autoridade.", audience: "Dentistas.", macroProblem: "Agenda vazia.", dominantIntent: "informacional",
        pillarArticleId: uuid(200), supportArticleIds: Array.from({ length: opcoes.total - 1 }, (_, k) => uuid(201 + k)),
        articleReferences: Array.from({ length: opcoes.total }, (_, k) => ({ articleId: uuid(200 + k), articleDnaVersionId: uuid(300 + k), articleDnaContentHash: hash(300 + k), role: k === 0 ? "Pilar" : "Suporte" })),
        articleRoles: Array.from({ length: opcoes.total }, (_, k) => ({ articleId: uuid(200 + k), role: k === 0 ? "Pilar" : "Suporte", reason: "bancada" })),
        narrativeOrder: Array.from({ length: opcoes.total }, (_, k) => uuid(200 + k)),
        linkMap: [], boundary: "b", includedTopics: ["a"], excludedTopics: [], nearbySiloIds: [], possibleConflicts: [], gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [],
      },
    }),
  };

  /** Uma versão NOVA gravada para o artigo: outra amostra (lidas/falhas). */
  const novaVersao = (item: Record<string, unknown>, amostra: { extraidas: number; falhas: number }) => {
    const receita = receitas.get(item.articleId as string);
    if (!receita) throw new Error("artigo sem receita de análise");
    const versoes = item.analysisVersions as Versao[];
    return { ...item, analysisVersions: [...versoes, versaoDeAnalise({ ...receita, ...amostra, numero: versoes.length + 1 })] };
  };

  /** Uma versão NOVA com a curadoria mudada: `excluir` referências saem da seleção. */
  const novaSelecao = (item: Record<string, unknown>, excluir: (url: string, indice: number) => boolean) => {
    const receita = receitas.get(item.articleId as string);
    if (!receita) throw new Error("artigo sem receita de análise");
    const curadoria = receita.registro.researchCuration as { references: Array<{ url: string; decision: string }> } & Record<string, unknown>;
    const registro = { ...receita.registro, researchCuration: { ...curadoria, references: curadoria.references.map((ref, k) => excluir(ref.url, k) ? { ...ref, decision: "excluded" } : ref) } };
    const versoes = item.analysisVersions as Versao[];
    return { ...item, analysisVersions: [...versoes, versaoDeAnalise({ ...receita, registro, extraidas: 12, falhas: 3, numero: versoes.length + 1 })] };
  };

  return {
    radarItems, serpRecords, articleVersions, siloVersions, keywords, novaVersao, novaSelecao, receitas,
    silos: [{ id: SILO, nome: NOME_DO_SILO }],
  };
}
