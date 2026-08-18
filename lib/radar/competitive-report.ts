import { contentHash } from "../arquiteto/versioning.ts";
import type { ArticleDNA } from "../arquiteto/contracts.ts";
import type { SerpResearchSnapshot } from "./serp/contracts.ts";
import type { RadarAnalysisPayload } from "./analysis-contracts.ts";
import { classifyRadarExtractionFormat, extractionFormatLabel, isComparableRadarExtraction, isPrimaryRadarSemanticTerm } from "./analysis-insights.ts";
import { z } from "zod";

const DecisionSchema = z.enum(["use", "counterpoint", "ignore", "duplicate", "outside_intent", "pending"]);
const NeedDecisionSchema = z.enum(["send_planner", "opportunity", "evidence_only", "ignore", "review_architect", "pending"]);
const ConfidenceSchema = z.enum(["low", "medium", "high"]);

export const RadarCompetitiveWorkflowStepSchema = z.object({
  key: z.enum(["identity", "answers", "competitors", "patterns", "needs", "approval", "planner"]),
  label: z.string().min(1),
  state: z.enum(["pending", "reviewed", "approved", "blocked"]),
  count: z.number().int().nonnegative(),
  explanation: z.string().min(1),
  nextAction: z.string().min(1),
}).strict();

const ResponseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  synthesis: z.string().min(1).max(500),
  source: z.enum(["people_also_ask", "snippet", "heading", "competitor_list", "comment", "related_search"]),
  sourceUrl: z.string().url().nullable(),
  competitorId: z.string().nullable(),
  position: z.number().int().positive().nullable(),
  evidenceType: z.enum(["paa", "snippet", "heading", "competitor_result", "related_search", "comment"]),
  recurrence: z.number().int().positive(),
  intentCompatibility: z.enum(["aligned", "partial", "conflict", "unknown"]),
  siloCompatibility: z.enum(["aligned", "partial", "conflict", "unknown"]),
  confidence: ConfidenceSchema,
  automaticRecommendation: DecisionSchema,
  humanDecision: DecisionSchema,
  note: z.string().max(2000),
  limitation: z.string().nullable(),
}).strict();

const QuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source: z.enum(["people_also_ask", "snippet", "heading", "competitor_list", "comment", "related_search"]),
  sourceUrl: z.string().url().nullable(),
  recurrence: z.number().int().positive(),
  decision: DecisionSchema,
  note: z.string().max(2000),
}).strict();

const CompetitorSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string(),
  domain: z.string().min(1),
  serpPosition: z.number().int().positive(),
  classification: z.enum(["direct", "partial", "format", "own_domain", "unknown"]),
  format: z.string().min(1),
  extractionId: z.string().nullable(),
  extractionStatus: z.string().nullable(),
  includedInBenchmark: z.boolean(),
  observedStrengths: z.array(z.string()),
  observedLimitations: z.array(z.string()),
  note: z.string().max(2000),
}).strict();

const NeedSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["title", "description", "structure", "semantics", "question", "source", "visual", "cannibalization", "format", "other"]),
  title: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]),
  evidenceIds: z.array(z.string().min(1)),
  competitorIds: z.array(z.string().min(1)),
  responseIds: z.array(z.string().min(1)),
  topics: z.array(z.string()),
  articleDnaRelation: z.string().min(1),
  siloDnaRelation: z.string().min(1),
  cannibalizationRisk: z.enum(["low", "medium", "high", "unknown"]),
  confidence: ConfidenceSchema,
  humanDecision: NeedDecisionSchema,
  note: z.string().max(2000),
  limitation: z.string().nullable(),
}).strict();

const MetricSchema = z.object({
  label: z.string().min(1),
  unit: z.enum(["count", "words", "ratio"]),
  mean: z.number().nonnegative(),
  median: z.number().nonnegative(),
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  typicalRange: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  sampleSize: z.number().int().nonnegative(),
}).strict();

export const RadarCompetitiveReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportType: z.literal("radar_competitive_report"),
  id: z.string().min(1),
  brandId: z.string().min(1),
  radarItemId: z.string().min(1),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  siloDnaVersionId: z.string().nullable(),
  serp: z.object({ snapshotId: z.string().min(1), version: z.number().int().positive(), hash: z.string().min(1), query: z.string().min(1), capturedAt: z.string().datetime() }).strict(),
  analysis: z.object({ versionId: z.string().min(1), versionNumber: z.number().int().positive() }).strict(),
  status: z.enum(["draft", "approved", "superseded"]),
  version: z.number().int().positive(),
  previousReportId: z.string().nullable(),
  workflow: z.array(RadarCompetitiveWorkflowStepSchema).length(7),
  observedResponses: z.array(ResponseSchema),
  usefulResponses: z.array(z.object({ responseId: z.string().min(1), rank: z.number().int().positive(), reason: z.string().min(1) }).strict()),
  questions: z.array(QuestionSchema),
  competitors: z.array(CompetitorSchema),
  profile: z.object({ comparablePageIds: z.array(z.string()), excludedPageIds: z.array(z.string()), comparableCount: z.number().int().nonnegative(), excludedCount: z.number().int().nonnegative(), metrics: z.record(z.string(), MetricSchema), smallSample: z.boolean(), limitations: z.array(z.string()) }).strict(),
  keywordObservations: z.array(z.object({ term: z.string().min(1), pageId: z.string().min(1), frequency: z.number().int().nonnegative(), perThousandWords: z.number().nonnegative(), source: z.literal("body_observed"), sourceCoverage: z.literal("body_only"), note: z.string().min(1) }).strict()),
  semantics: z.object({ entities: z.array(z.string()), topics: z.array(z.string()), noise: z.array(z.object({ term: z.string().min(1), category: z.enum(["navigation", "legal", "platform", "other"]), reason: z.string().min(1) }).strict()) }).strict(),
  linksObserved: z.object({ internal: MetricSchema.nullable(), external: MetricSchema.nullable(), limitation: z.string().min(1) }).strict(),
  visualsObserved: z.object({ images: MetricSchema.nullable(), lists: MetricSchema.nullable(), tables: MetricSchema.nullable(), blockquotes: MetricSchema.nullable(), limitation: z.string().min(1) }).strict(),
  visualNeeds: z.array(z.object({ id: z.string().min(1), observation: z.string().min(1), evidenceIds: z.array(z.string()), plannerDecisionRequired: z.literal(true) }).strict()),
  needs: z.array(NeedSchema),
  dnaComparison: z.object({ expectedIntent: z.string().min(1), observedIntent: z.string().nullable(), intentStatus: z.enum(["aligned", "partial", "conflict", "unknown"]), expectedTopics: z.array(z.string()), observedTopics: z.array(z.string()), notes: z.array(z.string()) }).strict(),
  summary: z.object({ text: z.string().min(1), confidence: ConfidenceSchema, limitations: z.array(z.string()) }).strict(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  provenance: z.object({ source: z.literal("radar"), generatedAt: z.string().datetime(), generatedBy: z.string().min(1), sourceAnalysisVersionId: z.string().min(1), sourceSerpSnapshotHash: z.string().min(1) }).strict(),
}).strict();
export type RadarCompetitiveReport = z.infer<typeof RadarCompetitiveReportSchema>;

function clean(value: string | null | undefined, fallback: string) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 500) : fallback;
}

function sourceDecision(payload: RadarAnalysisPayload, key: string): RadarCompetitiveReport["observedResponses"][number]["humanDecision"] {
  const decision = payload.serpDecisions.find(item => item.key === key)?.decision;
  return decision === "included" ? "use" : decision === "excluded" ? "ignore" : "pending";
}

function metricFrom(payload: RadarAnalysisPayload, key: string) {
  return payload.benchmark?.metrics[key] || null;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function buildRadarCompetitiveReport(input: {
  payload: RadarAnalysisPayload;
  article: ArticleDNA;
  research: SerpResearchSnapshot;
  radarItemId: string;
  analysisVersionId: string;
  analysisVersionNumber: number;
  generatedBy: string;
  siloDnaVersionId?: string | null;
  previousReport?: RadarCompetitiveReport | null;
  now?: string;
  status?: "draft" | "approved" | "superseded";
  approvedAt?: string | null;
  approvedBy?: string | null;
}) : Promise<RadarCompetitiveReport> {
  const now = input.now || new Date().toISOString();
  const payload = input.payload;
  const pages = payload.extractions;
  const organic = input.research.organicResults;
  const selected = new Set(payload.selectedCompetitorIds);
  const isSupportOrFormat = (result: typeof organic[number]) => {
    const decision = payload.serpDecisions.find(item => item.key === `organic:${result.position}`);
    return /apoio|complementar|formato|vídeo|video|social/i.test(decision?.reason || "");
  };
  const primaryUrls = new Set(organic.filter(result => {
    const decision = payload.serpDecisions.find(item => item.key === `organic:${result.position}`);
    return !decision?.ownDomain && !isSupportOrFormat(result) && (selected.has(`organic:${result.position}`) || decision?.decision === "included");
  }).map(result => result.url));
  const comparable = pages.filter(page => isComparableRadarExtraction(page) && primaryUrls.has(page.url));
  const excluded = pages.filter(page => !comparable.some(item => item.id === page.id));
  const extractionsByUrl = new Map(pages.map(page => [page.url, page]));
  const competitors = organic.map(result => {
    const extraction = extractionsByUrl.get(result.url) || pages.find(page => new URL(page.url).hostname === new URL(result.url).hostname);
    const format = extraction ? extractionFormatLabel(classifyRadarExtractionFormat(extraction)) : "Não extraído";
    const own = payload.serpDecisions.find(decision => decision.key === `organic:${result.position}`)?.ownDomain;
    const comparablePage = Boolean(extraction && isComparableRadarExtraction(extraction));
    const classification = own ? "own_domain" as const : extraction?.status === "partial" ? "partial" as const : extraction && !comparablePage ? "format" as const : extraction ? "direct" as const : "unknown" as const;
    return {
      id: `competitor:${result.position}`,
      url: result.url,
      title: result.title,
      domain: result.domain,
      serpPosition: result.position,
      classification,
      format,
      extractionId: extraction?.id || null,
      extractionStatus: extraction?.status || null,
      includedInBenchmark: Boolean(extraction && comparablePage && primaryUrls.has(result.url)),
      observedStrengths: extraction ? [extraction.h2.length ? `${extraction.h2.length} H2 observados.` : "Título/H1 observados.", extraction.wordCount ? `${extraction.wordCount} palavras observadas.` : ""] .filter(Boolean) : [],
      observedLimitations: extraction && !comparablePage ? ["Formato ou estado não comparável ao benchmark editorial."] : extraction ? [] : ["Página ainda não extraída; não há evidência estrutural individual."],
      note: result.snippet || "",
    };
  });
  const responses = input.research.peopleAlsoAsk.map(item => {
    const key = `paa:${item.position}`;
    const humanDecision = sourceDecision(payload, key);
    return {
      id: `response:${key}`,
      question: item.question,
      synthesis: clean(item.answer, "A resposta resumida não foi retornada no snapshot."),
      source: "people_also_ask" as const,
      sourceUrl: item.sourceUrl,
      competitorId: item.sourceUrl ? competitors.find(competitor => competitor.url === item.sourceUrl)?.id || null : null,
      position: item.position,
      evidenceType: "paa" as const,
      recurrence: 1,
      intentCompatibility: "unknown" as const,
      siloCompatibility: "unknown" as const,
      confidence: item.answer ? "medium" as const : "low" as const,
      automaticRecommendation: humanDecision === "use" ? "use" as const : humanDecision === "ignore" ? "ignore" as const : "pending" as const,
      humanDecision,
      note: payload.serpDecisions.find(decision => decision.key === key)?.note || "",
      limitation: item.answer ? null : "O snapshot não trouxe resposta textual; a pergunta continua sendo evidência de demanda, não resposta pronta.",
    };
  });
  const relatedResponses = input.research.relatedSearches.map((item, index) => {
    const key = `related:${index + 1}`;
    const humanDecision = sourceDecision(payload, key);
    return {
      id: `response:${key}`,
      question: item.term,
      synthesis: "Pesquisa relacionada observada na SERP; não há resposta textual associada.",
      source: "related_search" as const,
      sourceUrl: null,
      competitorId: null,
      position: index + 1,
      evidenceType: "related_search" as const,
      recurrence: 1,
      intentCompatibility: "unknown" as const,
      siloCompatibility: "unknown" as const,
      confidence: "low" as const,
      automaticRecommendation: humanDecision === "use" ? "use" as const : humanDecision === "ignore" ? "ignore" as const : "pending" as const,
      humanDecision,
      note: payload.serpDecisions.find(decision => decision.key === key)?.note || "",
      limitation: "Pesquisa relacionada não substitui validação de intenção nem autoriza uma seção automaticamente.",
    };
  });
  const observedResponses = [...responses, ...relatedResponses];
  const usefulResponses = observedResponses.filter(item => item.humanDecision === "use").sort((a, b) => b.confidence.localeCompare(a.confidence)).map((item, index) => ({ responseId: item.id, rank: index + 1, reason: "Decisão humana de uso, com rastreabilidade ao snapshot SERP." }));
  const questions = observedResponses.map(item => ({ id: item.id, text: item.question, source: item.source, sourceUrl: item.sourceUrl, recurrence: item.recurrence, decision: item.humanDecision, note: item.note }));
  const metrics = Object.fromEntries(Object.entries(payload.benchmark?.metrics || {}).map(([key, metric]) => [key, metric])) as Record<string, z.infer<typeof MetricSchema>>;
  const excludedReasons = excluded.map(page => `${page.id}: ${classifyRadarExtractionFormat(page)} / ${page.status}`);
  const profileLimitations = comparable.length < 3 ? ["A amostra editorial comparável é pequena; média, mediana e faixa não representam todo o mercado."] : [];
  if (excluded.length) profileLimitations.push("Formatos parciais ou não editoriais permanecem visíveis, mas não entram no benchmark.");
  const keywordTerms = new Set([input.article.promise, ...input.article.keywordReferences.map(reference => reference.keywordId), ...input.article.requiredTopics].map(normalize));
  const keywordObservations = comparable.flatMap(page => page.recurringTerms.filter(term => keywordTerms.has(normalize(term.term))).map(term => ({ term: term.term, pageId: page.id, frequency: term.frequency, perThousandWords: page.wordCount ? Number((term.frequency / page.wordCount * 1000).toFixed(2)) : 0, source: "body_observed" as const, sourceCoverage: "body_only" as const, note: "Ocorrência observada no corpo extraído; posição em title/H1/intro/headings não foi capturada nesta versão." })));
  const noise = payload.semanticTerms.filter(term => !isPrimaryRadarSemanticTerm(term)).map(term => ({ term: term.term, category: "other" as const, reason: term.relation || "Termo fora da evidência semântica principal." }));
  const observedTopics = [...new Set(payload.semanticTerms.filter(isPrimaryRadarSemanticTerm).map(term => term.term))];
  const expectedTopics = [...new Set([...input.article.requiredTopics, ...input.article.entities])];
  const observedIntent = input.research.diagnostic.dominantIntent || null;
  const expectedIntent = input.article.mainIntent;
  const intentStatus = !observedIntent ? "unknown" as const : normalize(observedIntent) === normalize(expectedIntent) ? "aligned" as const : "partial" as const;
  const visualNeeds = comparable.length ? [{ id: "visual:sample", observation: `${comparable.length} página(s) editorial(is) apresentaram elementos visuais observáveis; posição, briefing e prompt final permanecem decisão do Planejador.`, evidenceIds: comparable.map(page => page.id), plannerDecisionRequired: true as const }] : [];
  const needs = [
    ...(observedResponses.filter(response => response.humanDecision === "use").length ? [{ id: "need:questions", category: "question" as const, title: "Perguntas úteis para revisar no Planejador", priority: "medium" as const, evidenceIds: usefulResponses.map(item => item.responseId), competitorIds: [], responseIds: usefulResponses.map(item => item.responseId), topics: usefulResponses.map(item => observedResponses.find(response => response.id === item.responseId)?.question || ""), articleDnaRelation: "Complementa as perguntas recebidas sem alterar o ArticleDNA.", siloDnaRelation: "Compatibilidade com o SiloDNA deve ser confirmada no Planejador.", cannibalizationRisk: "unknown" as const, confidence: "medium" as const, humanDecision: "send_planner" as const, note: "Enviado como contexto observado; não significa copiar a resposta nem criar FAQ automaticamente.", limitation: null }] : []),
    ...(observedTopics.length ? [{ id: "need:semantics", category: "semantics" as const, title: "Tópicos e entidades recorrentes", priority: "medium" as const, evidenceIds: payload.semanticTerms.filter(isPrimaryRadarSemanticTerm).map(term => term.term), competitorIds: [], responseIds: [], topics: observedTopics, articleDnaRelation: "Confronta a cobertura recebida pelo ArticleDNA; o Radar não a reescreve.", siloDnaRelation: "Relaciona-se ao silo recebido, sem redefinir a sua arquitetura.", cannibalizationRisk: "unknown" as const, confidence: "medium" as const, humanDecision: "send_planner" as const, note: "O Planejador decide se há utilidade editorial e onde aplicar.", limitation: null }] : []),
    ...(payload.benchmark ? [{ id: "need:structure", category: "structure" as const, title: "Padrões estruturais observados", priority: "low" as const, evidenceIds: comparable.map(page => page.id), competitorIds: competitors.filter(competitor => competitor.includedInBenchmark).map(competitor => competitor.id), responseIds: [], topics: [], articleDnaRelation: "Não altera estrutura do artigo recebido.", siloDnaRelation: "Não altera a hierarquia do silo.", cannibalizationRisk: "unknown" as const, confidence: comparable.length >= 3 ? "medium" as const : "low" as const, humanDecision: "evidence_only" as const, note: "Evidência para o Planejador, não meta de palavras, headings ou densidade.", limitation: comparable.length < 3 ? "Amostra pequena para generalização." : null }] : []),
  ];
  const limitations = ["O relatório resume observações e não contém copy para reutilização.", "Frequência por posição, comentários, autoridade e fontes não presentes no payload permanecem indisponíveis.", ...profileLimitations];
  const base = {
    schemaVersion: 1 as const, reportType: "radar_competitive_report" as const, id: `radar-competitive-report:${input.analysisVersionId}`, brandId: payload.brandId, radarItemId: input.radarItemId, articleId: payload.articleId, articleDnaVersionId: payload.articleDnaVersionId, siloDnaVersionId: input.siloDnaVersionId || null,
    serp: { snapshotId: input.research.id, version: input.research.version, hash: input.research.contentHash, query: input.research.query, capturedAt: input.research.collectedAt }, analysis: { versionId: input.analysisVersionId, versionNumber: input.analysisVersionNumber }, status: input.status || "draft", version: input.analysisVersionNumber, previousReportId: input.previousReport?.id || null,
    workflow: [
      { key: "identity" as const, label: "Identidade e DNA", state: "reviewed" as const, count: 1, explanation: "ArticleDNA e referências do silo foram recebidos antes da análise.", nextAction: "Conferir a identidade recebida." },
      { key: "answers" as const, label: "Respostas observadas", state: observedResponses.every(item => item.humanDecision !== "pending") ? "reviewed" as const : "pending" as const, count: observedResponses.length, explanation: "Perguntas e respostas foram resumidas a partir da SERP, sem copiar texto para o plano.", nextAction: observedResponses.some(item => item.humanDecision === "pending") ? "Decidir os itens pendentes na Curadoria." : "Revisar as decisões registradas." },
      { key: "competitors" as const, label: "Concorrentes diretos", state: competitors.length && competitors.every(item => !selected.has(`organic:${item.serpPosition}`) || item.extractionStatus !== "pending") ? "reviewed" as const : "pending" as const, count: competitors.length, explanation: "A classificação separa concorrentes editoriais comparáveis de formatos e páginas parciais.", nextAction: "Confirmar quais páginas entram no benchmark." },
      { key: "patterns" as const, label: "Padrões observados", state: payload.benchmark || observedTopics.length ? "reviewed" as const : "pending" as const, count: comparable.length, explanation: "Métricas e padrões são descritivos; não viram metas automáticas.", nextAction: "Ler mediana, faixa e limitações da amostra." },
      { key: "needs" as const, label: "Necessidades competitivas", state: needs.length ? "reviewed" as const : "pending" as const, count: needs.length, explanation: "Necessidades preservam a relação com ArticleDNA/SiloDNA e delegam a decisão final ao Planejador.", nextAction: "Revisar o destino de cada necessidade." },
      { key: "approval" as const, label: "Aprovação humana", state: input.status === "approved" ? "approved" as const : "pending" as const, count: input.status === "approved" ? 1 : 0, explanation: "A aprovação consolida o relatório e o pacote de evidências da mesma versão.", nextAction: input.status === "approved" ? "Nenhuma alteração nesta versão; crie uma sucessora." : "Revisar e aprovar as evidências." },
      { key: "planner" as const, label: "Envio ao Planejador", state: input.status === "approved" ? "approved" as const : "pending" as const, count: input.status === "approved" ? 1 : 0, explanation: "O Planejador recebe contexto observado e mantém as decisões finais sob sua responsabilidade.", nextAction: input.status === "approved" ? "Importar o pacote aprovado no Planejador." : "A aprovação do Radar é pré-requisito." },
    ],
    observedResponses, usefulResponses, questions, competitors,
    profile: { comparablePageIds: comparable.map(page => page.id), excludedPageIds: excluded.map(page => page.id), comparableCount: comparable.length, excludedCount: excluded.length, metrics, smallSample: comparable.length < 3, limitations: [...profileLimitations, ...excludedReasons] },
    keywordObservations, semantics: { entities: input.research.diagnostic.frequentEntities, topics: observedTopics, noise },
    linksObserved: { internal: metricFrom(payload, "internalLinks"), external: metricFrom(payload, "externalLinks"), limitation: "A extração informa contagens; não classifica âncoras nem decide links internos finais." },
    visualsObserved: { images: metricFrom(payload, "images"), lists: metricFrom(payload, "lists"), tables: metricFrom(payload, "tables"), blockquotes: metricFrom(payload, "blockquotes"), limitation: "Elementos visuais observados não definem estilo, posição ou prompt final." },
    visualNeeds, needs, dnaComparison: { expectedIntent, observedIntent, intentStatus, expectedTopics, observedTopics, notes: ["O Radar confronta o cenário observado com o DNA recebido e preserva conflitos para decisão humana."] },
    summary: { text: comparable.length ? `Relatório competitivo com ${comparable.length} página(s) editorial(is) comparável(is), ${observedResponses.length} resposta(s)/pesquisa(s) observada(s) e ${needs.length} necessidade(s) contextualizada(s).` : "Relatório competitivo iniciado, mas ainda sem página editorial comparável extraída.", confidence: comparable.length >= 3 ? "medium" as const : "low" as const, limitations },
    approvedAt: input.status === "approved" ? input.approvedAt || now : null, approvedBy: input.status === "approved" ? input.approvedBy || input.generatedBy : null,
    provenance: { source: "radar" as const, generatedAt: now, generatedBy: input.generatedBy, sourceAnalysisVersionId: input.analysisVersionId, sourceSerpSnapshotHash: input.research.contentHash },
  };
  const hash = await contentHash(base);
  return RadarCompetitiveReportSchema.parse({ ...base, contentHash: hash });
}

export function competitiveReportApprovalIssues(report: RadarCompetitiveReport | null | undefined) {
  if (!report) return ["O relatório competitivo ainda não foi consolidado."];
  return report.observedResponses.filter(item => item.humanDecision === "pending").map(item => `A resposta observada ainda está pendente: ${item.question}`);
}
