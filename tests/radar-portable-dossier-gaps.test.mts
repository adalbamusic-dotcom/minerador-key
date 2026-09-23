import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import { buildRadarAuthorityEvidence } from "../lib/radar/authority-evidence.ts";
import { radarPlannerHandoffReadiness, type RadarPlannerHandoffReadiness } from "../lib/radar/planner-handoff.ts";
import { radarPortableSerpSources } from "../lib/radar/portable-evidence-pack.ts";
import { RADAR_WRITING_RULES } from "../lib/radar/portable-writer-context.ts";
import { RADAR_WRITER_MAY_NOT } from "../lib/redator/writer-handoff.ts";
import {
  RADAR_PORTABLE_GAP_COLUMNS,
  RADAR_PORTABLE_GAP_LIMITS,
  RADAR_PORTABLE_THIRD_PARTY_MARK,
  RADAR_PORTABLE_WRITER_BLOCKED_LABEL,
  RADAR_PORTABLE_WRITER_READY_LABEL,
  radarPortableAuthorityRequirementsMarkdown,
  radarPortableCompetitorsStructure,
  radarPortableCompetitorsStructureJson,
  radarPortableDossierGapColumns,
  radarPortableResearchStatusMarkdown,
  radarPortableThirdPartyExcerpt,
  radarPortableWriterReadiness,
  radarWriterParityRules,
  radarWriterProhibitionsMissingFromRules,
  radarWritingRulesWithWriterParity,
  type RadarPortableResearchStatusInput,
} from "../lib/radar/portable-dossier-gaps.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarEvidenceClaim } from "../lib/radar/claim-evidence.ts";
import type { RadarFactualEvidence } from "../lib/radar/source-authority.ts";
import type { RadarCompetitiveObservedModel, RadarObservedCompetitor } from "../lib/radar/competitive-observed-model.ts";
import type { RadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";

/*
 * ===== AS LACUNAS DO DOSSIÊ PORTÁTIL — "o Redator tem, o CSV não tem" =====
 *
 * ==================== A PERGUNTA QUE ESTA SUÍTE FAZ ====================
 *
 * Quem escreve fora da plataforma recebe só o CSV. Ele carrega agora o que o
 * Redator recebe e o arquivo deixava para trás — a situação da investigação
 * (com a PRONTIDÃO), a autoridade e a descoberta por IA, a estrutura de cada
 * concorrente e as proibições do Redator?
 *
 * E carrega sem levar junto o que não pode sair: id, UUID, hash, referência de
 * snapshot ou de corrida, assinatura e endereço interno de evidência.
 *
 * A bancada é a mesma investigação real das suítes do export (12 páginas de
 * pele oleosa), com UUIDs e hashes plantados nos lugares onde eles moram, para
 * que a higiene seja provada e não presumida.
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ================= as identidades plantadas — nenhuma pode sair ================= */

const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const ARTIGO = "7c2f9e4b-1a3d-4e5f-9a8b-6c7d8e9f0a1b";
const VERSAO = "9d4e2a7c-3b5f-4c6d-8e9f-1a2b3c4d5e6f";
const OUTRA_VERSAO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e";
const HASH_DO_DNA = `sha256:${"a".repeat(64)}`;
const SNAPSHOT = `serp:${ARTIGO}:3f2c9a1e-5b7d-4c2a-9e1f-0a1b2c3d4e5f`;
const ASSINATURA = `sha256:${"b".repeat(64)}`;

const FUNDAMENTO = { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA };

/* ============================== a bancada do Google ============================== */

const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[], palavras: number): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: palavras, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
});

/* A página A11 é o outlier: 15.000 palavras numa amostra de ~1.600. */
const PAGINAS = Array.from({ length: 12 }, (_, indice) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (indice < 9) headings.push("Por que a pele fica oleosa?");
  if (indice < 8) headings.push("Rotina de cuidados para pele oleosa");
  return pagina(`A${indice}`, headings, indice === 11 ? 15000 : 1600 + indice * 10);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: VERSAO, articleDnaContentHash: HASH_DO_DNA, promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 41000, kgrScore: 0.589, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: ["informacional"], strategicContribution: null, purpose: null, overlapRisk: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU", semanticState: "QUALIFIED" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const vista = () => buildRadarDeepResearchView({
  context: contexto(),
  snapshot: { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-10T12:00:00.000Z",
});

const CONGELADO_EM = "2026-09-10T13:00:00.000Z";

/** O dossiê V3 do Google, montado pelo adapter real, com ref e assinatura plantadas. */
const dossieDoGoogle = (): RadarEvidenceBundle => buildRadarEvidenceBundle({
  observed: vista().observed,
  serp: { current: true, sufficient: true, valid: true },
  frozenAt: CONGELADO_EM,
  researchRefs: [{
    source: "WEB_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
    ref: SNAPSHOT, fingerprint: ASSINATURA, collectedAt: CONGELADO_EM, sampleSize: 12,
  }],
  editorialOutputs: [{
    output: "ARTICLE",
    objective: "Responder a dúvida de entrada com clareza.",
    reason: "A amostra trata o tema como explicação.",
    sourceSignals: ["12 de 12 páginas comparáveis explicam como identificar a pele oleosa."],
  }],
});

const PRONTO: RadarPlannerHandoffReadiness = { ready: true, headline: "Pacote para planejamento pronto", blocks: [] };

const statusDoGoogle = (patch: Partial<RadarPortableResearchStatusInput> = {}): RadarPortableResearchStatusInput => ({
  frozenObservedAt: CONGELADO_EM,
  bundle: dossieDoGoogle(),
  readiness: PRONTO,
  articleDnaIdentityComplete: true,
  serpStandingFrozen: true,
  exportedAt: "2026-09-23T12:00:00.000Z",
  ...patch,
});

/* ============================ a bancada do YouTube ============================ */

const analiseDoYoutube = () => ({
  youtubeFrozenInvestigation: {
    frozenVersion: 1,
    finalizedAt: "2026-09-14T10:00:00.000Z",
    finalizedBy: MARCA,
    runRef: {
      runId: `run:${ARTIGO}`, runVersion: 1, runFingerprint: ASSINATURA,
      collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo",
      endpoint: "/v3/serp/youtube/organic/live/advanced",
      queriesExecuted: 3, universeSize: 38, selectedVideoIds: ["v1", "v2"],
    },
    run: null,
    multimodal: {
      blueprint: {
        observed: {
          crossSerpVideos: [{ signal: "CROSS_PLATFORM" }, { signal: "CROSS_PLATFORM" }, { signal: "YOUTUBE_ONLY" }],
          sources: ["GOOGLE_SERP", "YOUTUBE_SERP"],
        },
        /* Sem razão escrita: o runtime usa o marcador técnico como origem. */
        recommended: { editorialOutput: "ARTICLE_WITH_VIDEO", rationale: [] },
      },
    },
    limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
  },
  supportResearch: { serpSnapshotId: SNAPSHOT, keyword: "skin care noturno", collectedAt: "2026-09-14T09:30:00.000Z" },
});

const dossieDoYoutube = (): RadarEvidenceBundle => {
  const resultado = buildRadarEvidenceBundleFromAnalysis({
    payload: analiseDoYoutube(), article: FUNDAMENTO, competitiveBlueprint: null, observedAt: "2026-09-14T10:00:00.000Z",
  });
  assert.ok(resultado.ok, "a bancada do YouTube precisa montar um dossiê V3 real");
  return resultado.bundle;
};

const dossieDaAmazon = (): RadarEvidenceBundle => {
  const resultado = buildRadarEvidenceBundleFromAnalysis({
    payload: {
      amazonFrozenInvestigation: {
        finalizedAt: "2026-09-15T14:00:00.000Z",
        runRef: { runId: `run:${ARTIGO}`, runFingerprint: ASSINATURA, collectedAt: "2026-09-15T12:00:00.000Z", queriesExecuted: 4, universeSize: 59 },
        observedSummary: { products: 59 },
        supportRefs: [{ snapshotId: SNAPSHOT, keyword: "skin care nivea", collectedAt: "2026-09-15T12:00:08.000Z" }],
        limitations: ["A coleta da prateleira não traz texto de avaliação."],
      },
    },
    article: FUNDAMENTO, competitiveBlueprint: null, observedAt: "2026-09-15T14:00:00.000Z",
  });
  assert.ok(resultado.ok, "a bancada da Amazon precisa montar um dossiê V3 real");
  return resultado.bundle;
};

/* ======================= a autoridade que pede prova ======================= */

const RESUMO_LONGO = `Revisão de 2024 conclui que ${"o ácido salicílico reduz a oleosidade em uso contínuo, com evidência moderada, ".repeat(8)}e recomenda acompanhamento.`;

const afirmacao = (indice: number): RadarEvidenceClaim => ({
  claimId: `claim:${String(indice).padStart(8, "0")}`,
  canonicalClaim: `Afirmação sensível ${indice} sobre tratamento da oleosidade`,
  conceptId: `concept:cause:${String(indice).padStart(8, "c")}`,
  claimType: "RECOMMENDATION",
  ymyl: {
    relevance: indice % 2 ? "MATERIAL" : "HIGH", claimType: "RECOMMENDATION",
    signals: ["decisão sobre saúde ou corpo"], reason: "Recomendação em decisão sobre saúde ou corpo: a afirmação orienta conduta.",
    confidence: "HIGH", sensitivePopulation: false,
  },
  market: {
    competitors: 12 - (indice % 5), sampleSize: 12, recurrence: "STRONG", queryCoverage: 1,
    supportingCompetitors: [{ pageId: "page:A1", url: PAGINAS[1].url, heading: "Por que a pele fica oleosa?" }],
    statement: `${12 - (indice % 5)} de 12 concorrentes tratam de "Afirmação sensível ${indice}".`,
  },
  observedSourceDomains: ["aad.org"],
  confidence: "HIGH",
  provenance: `Conceito concept:cause:${String(indice).padStart(8, "c")} observado em page:A1.`,
});

const evidencia = (claimId: string, supportType: RadarFactualEvidence["supportType"], resumo: string): RadarFactualEvidence => ({
  claimId, sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/", sourceDomain: "pubmed.ncbi.nlm.nih.gov",
  sourceType: "PRIMARY_SCIENTIFIC", supportType, evidenceSummary: resumo, sourceTitle: "Estudo sobre oleosidade",
  author: null, hasDates: true, confidence: "HIGH", provenance: `Verificada para ${claimId} (${SNAPSHOT}).`, limitations: [],
});

const AFIRMACOES = Array.from({ length: 14 }, (_, indice) => afirmacao(indice));

const autoridadeQuePedeProva = () => {
  const camada = buildRadarAuthorityEvidence({
    ymyl: {
      relevance: "HIGH", signals: ["saúde ou bem-estar físico"],
      reason: "O tema orienta decisões sobre o corpo.",
      evidenceRequirements: ["Fonte primária para toda afirmação de conduta."],
      specialistReviewRequired: true,
    },
    claims: AFIRMACOES,
    pages: PAGINAS,
    factualEvidence: [
      evidencia(AFIRMACOES[0].claimId, "CONTRADICTS", RESUMO_LONGO),
      evidencia(AFIRMACOES[1].claimId, "SUPPORTS", "A fonte sustenta a afirmação."),
    ],
    serp: { current: true, sufficient: true, valid: true },
  });
  /* Uma limitação com endereço interno no meio da frase — a rede de segurança precisa pegar. */
  return { ...camada, limitations: [...camada.limitations, "Leitura apoiada em question:c580aef1 da page:A1."] };
};

const observadoComAutoridade = (): RadarCompetitiveObservedModel => ({ ...vista().observed, authorityEvidence: autoridadeQuePedeProva() });

/* ============================== a higiene ============================== */

const ENDERECOS_INTERNOS = [
  /section:[0-9a-f]{6,}/,
  /concept:[a-z]+:[0-9a-z]{6,}/,
  /question:[0-9a-f]{6,}/,
  /answer:[0-9a-f]{6,}/,
  /claim:[0-9a-f]{6,}/,
  /specialist:[0-9a-f]{6,}/,
  /research:[0-9a-f]{6,}/,
  /need:[0-9a-f]{6,}/,
  /page:[A-Za-z0-9]+/,
  /\bytq:\d+/,
  /\bamzq:\d+/,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/,
  /sha256:/,
];

const TECNICOS = /serpSnapshotId|snapshotId|runId|fingerprint|referenceId|pageId|claimId|requirementId|unitIds|provider|endpoint|isMock|reviewedBy|created_by|organic:\d|paa:\d|dataforseo|run-yt|assinatura-/i;

const semEnderecoInterno = (coluna: string, valor: string) => {
  for (const padrao of ENDERECOS_INTERNOS) {
    const encontro = valor.match(padrao);
    assert.equal(encontro, null, `invariante 43 · endereço interno em ${coluna}: ${encontro?.[0]}`);
  }
  const tecnico = valor.match(TECNICOS);
  assert.equal(tecnico, null, `invariante 43 · campo técnico em ${coluna}: ${tecnico?.[0]}`);
};

/* ================================ 1 · a situação ================================ */

test("1 · research_status_md · pronto quando a prontidão canônica aprova, com datas, camadas e situação da SERP", () => {
  const md = radarPortableResearchStatusMarkdown(statusDoGoogle());

  assert.match(md, /^# Situação da investigação/);
  assert.ok(md.includes(`**${RADAR_PORTABLE_WRITER_READY_LABEL}.**`), "a prontidão aprovada precisa ser dita");
  assert.equal(md.includes(RADAR_PORTABLE_WRITER_BLOCKED_LABEL), false);

  /* As datas do congelamento e da coleta — o que o CSV não dizia. */
  assert.ok(md.includes(`Investigação congelada em: ${CONGELADO_EM}.`));
  assert.ok(md.includes("Exportado em: 2026-09-23T12:00:00.000Z."));
  assert.match(md, /SERP do Google — camada primária: coleta congelada em 2026-09-10T13:00:00\.000Z · \d+ consulta\(s\) · \d+ página\(s\) comparável\(is\)\./);
  assert.ok(md.includes("Não investigadas neste artigo: SERP do YouTube · SERP da Amazon."), "a camada ausente precisa ser nomeada");

  /* A situação da SERP, com a origem da avaliação. */
  assert.ok(md.includes("Tem precedência sobre o terreno competitivo: sim."));
  assert.ok(md.includes("Vigente: sim · suficiente: sim · válida: sim."));
  assert.ok(md.includes("Origem: avaliada e gravada no congelamento da investigação."));

  /* O sinal cruzado não se aplica ao Google — e isso é dito. */
  assert.ok(md.includes("Não se aplica: o cruzamento entre buscas existe só na investigação de vídeo."));

  /* A saída recomendada, com a origem em palavras. */
  assert.ok(md.includes("Artigo — objetivo: Responder a dúvida de entrada com clareza."));
  assert.ok(md.includes("Origem: 12 de 12 páginas comparáveis explicam como identificar a pele oleosa."));
  assert.ok(md.includes("Nenhuma divergência entre fontes foi registrada no nível do dossiê."));

  /* Frase alheia colada na nossa não vira "..". */
  assert.equal(/[^.]\.\.(?!\.)/.test(md), false, "pontuação dobrada");

  semEnderecoInterno("research_status_md", md);
});

test("1 · research_status_md · o artigo que o Redator recusaria sai ROTULADO, com o motivo em português", () => {
  const bundle = dossieDoGoogle();

  /* A prontidão REAL: perfil Google sem o congelado daquele pipeline. */
  const recusada = radarPlannerHandoffReadiness({ article: FUNDAMENTO, frozen: null, dossier: bundle });
  assert.equal(recusada.ready, false, "a bancada precisa produzir uma prontidão recusada");

  const md = radarPortableResearchStatusMarkdown(statusDoGoogle({ bundle, readiness: recusada }));
  assert.ok(md.includes(`**${RADAR_PORTABLE_WRITER_BLOCKED_LABEL}.**`), "o artigo bloqueado saiu com cara de pronto");
  assert.ok(md.includes("o Redator da plataforma recusaria importá-lo agora"));
  assert.ok(md.includes("- Motivo: a investigação não tem o congelamento que o Redator exige"));
  assert.ok(md.includes("- O que fazer: finalize a pesquisa no Radar."));
  /* O artigo continua saindo — rotulado, não escondido. */
  assert.ok(md.includes("## Camadas de pesquisa"));

  /*
   * A MESMA REGRA DO REDATOR.
   *
   * `resolveRadarImportEligibility` recusa quando `readiness.ready` é falso e
   * quando falta versão ou impressão do ArticleDNA. O rótulo segue as duas.
   */
  assert.equal(radarPortableWriterReadiness({ readiness: PRONTO }).state, "READY");
  assert.equal(radarPortableWriterReadiness({ readiness: recusada }).state, "BLOCKED");
  const semIdentidade = radarPortableWriterReadiness({ readiness: PRONTO, articleDnaIdentityComplete: false });
  assert.equal(semIdentidade.state, "BLOCKED");
  assert.ok(semIdentidade.reasons.some(motivo => motivo.includes("versão e a impressão de conteúdo do ArticleDNA")));

  /* Prontidão recusada sem bloqueio nomeado continua recusada — e diz isso. */
  const muda = radarPortableWriterReadiness({ readiness: { ready: false, blocks: [] } });
  assert.equal(muda.state, "BLOCKED");
  assert.deepEqual(muda.reasons, ["a prontidão recusou o pacote sem nomear o motivo"]);
});

test("1 · research_status_md · YouTube: sinal cruzado, apoio do Google e bloqueio sem o detalhe que carrega ids", () => {
  const bundle = dossieDoYoutube();

  /* A prontidão REAL de um fundamento que mudou de versão: o `detail` cita as duas versões. */
  const recusada = radarPlannerHandoffReadiness({ article: { ...FUNDAMENTO, articleDnaVersionId: OUTRA_VERSAO }, frozen: null, dossier: bundle });
  assert.ok(recusada.blocks.some(bloco => bloco.code === "ARTICLE_VERSION_MISMATCH" && bloco.detail.includes(VERSAO)),
    "a bancada precisa exercitar um detalhe com id");

  const md = radarPortableResearchStatusMarkdown({
    frozenObservedAt: "2026-09-14T10:00:00.000Z",
    bundle,
    readiness: recusada,
    serpStandingFrozen: false,
  });

  assert.ok(md.includes("- Motivo: a investigação foi feita sobre outra versão do ArticleDNA."));
  assert.ok(md.includes("SERP do YouTube — camada primária: congelada em 2026-09-14T10:00:00.000Z · coletada em 2026-09-14T09:00:00.000Z · 3 consulta(s) · 38 vídeo(s) no universo."));
  assert.ok(md.includes("SERP do Google — camada de apoio: coleta congelada em 2026-09-14T09:30:00.000Z · consulta de apoio sobre a keyword principal"));
  assert.ok(md.includes("Limitação: O gancho interno dos vídeos não foi observado"));

  /* §8 do dossiê · o sinal cruzado, com o nome dele. */
  assert.ok(md.includes("- 2 vídeo(s) aparecem nas duas buscas, YouTube e Google."));
  assert.ok(md.includes("- 1 vídeo(s) aparecem só na busca do YouTube."));
  assert.ok(md.includes("Buscas cruzadas: SERP do Google · SERP do YouTube."));
  assert.ok(md.includes("Sinal competitivo, não factual"));

  /* A saída recomendada, com o marcador técnico traduzido. */
  assert.ok(md.includes("Artigo com vídeo — objetivo:"));
  assert.ok(md.includes("Origem: leitura cruzada das buscas do YouTube e do Google."));
  assert.equal(md.includes("multimodal:cross-serp"), false, "marcador técnico como origem");

  /* A situação da SERP de um perfil que não a avalia — o padrão não vira veredito. */
  assert.ok(md.includes("a investigação de vídeo e a de produto não avaliam a situação da SERP do Google"));

  semEnderecoInterno("research_status_md (YouTube)", md);

  /* E a Amazon conta produtos, não páginas. */
  const amazon = radarPortableResearchStatusMarkdown({ frozenObservedAt: "2026-09-15T14:00:00.000Z", bundle: dossieDaAmazon(), readiness: PRONTO });
  assert.ok(amazon.includes("SERP da Amazon — camada primária: congelada em 2026-09-15T14:00:00.000Z · coletada em 2026-09-15T12:00:00.000Z · 4 consulta(s) · 59 produto(s) observado(s)."));
  assert.ok(amazon.includes("Nenhuma saída editorial foi recomendada nesta investigação."));
  assert.ok(amazon.includes("Origem: não informada ao export"), "origem da situação da SERP não informada precisa ser dita");
  semEnderecoInterno("research_status_md (Amazon)", amazon);
});

test("1 · research_status_md · congelamento não gravado e carimbo que não é data são ditos, não inventados", () => {
  const google = dossieDoGoogle();
  const md = radarPortableResearchStatusMarkdown({
    frozenObservedAt: null,
    bundle: {
      ...google,
      /* A assinatura da rodada como carimbo — o caso real de produção. */
      research: { ...google.research, google: { ...google.research.google!, frozenAt: "fp:abc|v1", refs: [{ collectedAt: null }] } },
    },
    readiness: PRONTO,
  });

  assert.ok(md.includes("Investigação congelada em: não gravado."));
  assert.ok(md.includes("instante de congelamento não gravado · data da coleta não gravada"));
  assert.equal(md.includes("fp:abc"), false, "carimbo técnico saiu como data");
  assert.equal(md.includes("Exportado em"), false, "instante do export inventado");
});

test("1 · research_status_md · a célula tem teto, e o corte é declarado", () => {
  const google = dossieDoGoogle();
  const md = radarPortableResearchStatusMarkdown({
    frozenObservedAt: CONGELADO_EM,
    bundle: { ...google, serpStanding: { ...google.serpStanding, reason: `Frase longa. ${"palavra ".repeat(4000)}` } },
    readiness: PRONTO,
  });
  assert.ok(md.length <= RADAR_PORTABLE_GAP_LIMITS.cellChars, `célula com ${md.length} caracteres`);
  assert.match(md, /Célula encurtada: \d+ caracteres excediam o limite de 16000/);
});

/* ============================ 2 · autoridade e descoberta ============================ */

test("2 · authority_requirements_md · YMYL, afirmações que pedem prova com teto, conflito e especialista", () => {
  const md = radarPortableAuthorityRequirementsMarkdown({ profile: "GOOGLE", observed: observadoComAutoridade() });

  assert.match(md, /^# Autoridade e descoberta por IA/);
  assert.ok(md.includes("- Relevância: alta. O tema orienta decisões sobre o corpo."));
  assert.ok(md.includes("- Exigência: Fonte primária para toda afirmação de conduta."));
  assert.ok(md.includes("- Revisão profissional antes do texto final: exigida."));

  /* O resumo da camada e as afirmações, com a contagem do que não coube. */
  assert.ok(md.includes("- Resumo: 14 afirmação(ões) de relevância material ou alta · 1 com fonte · 13 sem fonte adequada."));
  assert.ok(md.includes(`(${RADAR_PORTABLE_GAP_LIMITS.claims} de 14 mostrados)`), "o teto das afirmações não foi declarado");
  assert.ok(md.includes("Situação: em conflito com a evidência factual"));
  assert.ok(md.includes("Situação: sustentada por fonte verificada: pubmed.ncbi.nlm.nih.gov (Literatura científica primária)."));
  assert.ok(md.includes("Situação: sem fonte adequada nesta investigação — não afirmar como fato sem fonte."));
  assert.ok(md.includes("Fontes que os concorrentes citam (candidatas, não verificadas): aad.org."));

  /* As de relevância alta vêm primeiro: com teto, o que fica de fora é o menos sensível. */
  const secao = md.split("## Afirmações que pedem prova")[1].split("## Mercado")[0];
  const relevancias = [...secao.matchAll(/relevância (alta|material);/g)].map(item => item[1]);
  assert.deepEqual(relevancias.slice(0, 7), Array(7).fill("alta"));

  /* O conflito mercado × fato, com o trecho de terceiro curto e marcado. */
  const conflito = md.split("## Mercado × evidência factual")[1].split("##")[0];
  assert.ok(conflito.includes(RADAR_PORTABLE_THIRD_PARTY_MARK), "trecho de terceiro sem a marca");
  const trecho = conflito.match(/A evidência factual diz: "([^"]*)"/)?.[1] || "";
  assert.ok(trecho.length > 0 && trecho.length <= RADAR_PORTABLE_GAP_LIMITS.thirdPartyExcerpt, `trecho com ${trecho.length} caracteres`);
  assert.equal(md.includes(RESUMO_LONGO), false, "resumo de terceiro saiu inteiro");

  /* E-E-A-T sem nota e sem a procedência que carrega ids de página. */
  assert.ok(md.includes("Sinais observados, sem nota"));
  assert.ok(md.includes("Experiência · Relato de uso, teste ou prática: declarado pela página, não conferido."));

  /* O especialista, por prioridade, com teto. */
  assert.ok(md.includes(`(${RADAR_PORTABLE_GAP_LIMITS.specialistPoints} de 14 mostrados)`), "o teto dos pontos do especialista não foi declarado");
  const pontos = md.split("## Pontos para revisão profissional")[1].split("##")[0];
  assert.match(pontos, /^\s*- Prioridade alta · /);
  assert.ok(pontos.includes("resolver conflito entre mercado e evidência"));
  assert.ok(pontos.includes("Pergunta preparada:"));
  /* A pergunta de conflito embute o resumo da fonte: ele sai curto e marcado ali também. */
  assert.ok(pontos.includes(`(${RADAR_PORTABLE_THIRD_PARTY_MARK}) Na sua prática`));
  /* E o enum cru que a camada escreve no motivo não atravessa. */
  assert.ok(pontos.includes("relevância alta com recorrência forte"));
  assert.equal(/relevância high|recorrência strong/.test(pontos), false);

  /* A rede de segurança pegou o endereço plantado no texto livre. */
  assert.ok(md.includes("Leitura apoiada em [referência interna omitida] da [referência interna omitida]."));

  semEnderecoInterno("authority_requirements_md", md);
});

test("2 · authority_requirements_md · a descoberta por IA sai resumida, com teto declarado", () => {
  const observado = vista().observed;
  const md = radarPortableAuthorityRequirementsMarkdown({ profile: "GOOGLE", observed: observado });
  const descoberta = observado.aiDiscovery;

  assert.ok(md.includes("- Aplicabilidade: obrigatória neste estágio de funil."));
  assert.ok(md.includes("- Funil declarado pelo fundamento: TOFU."));
  assert.ok(md.includes("### Necessidades que o artigo precisa responder"));
  assert.ok(md.includes("Como identificar a pele oleosa? — central;"));
  assert.ok(md.includes("### Perguntas a cobrir"));
  assert.ok(md.includes("### Trechos que precisam se sustentar sozinhos"));
  assert.ok(md.includes("Resposta direta · Como identificar a pele oleosa?:"));

  /* A amostra real tem mais requisitos de recuperabilidade do que o teto. */
  assert.ok(descoberta.retrievabilityRequirements.length > RADAR_PORTABLE_GAP_LIMITS.retrievability, "a bancada precisa exceder o teto");
  assert.ok(md.includes(`(${RADAR_PORTABLE_GAP_LIMITS.retrievability} de ${descoberta.retrievabilityRequirements.length} mostrados)`));

  assert.equal(/[^.]\.\.(?!\.)/.test(md), false, "pontuação dobrada");

  /* Ausência dita: sem afirmação sensível na amostra real. */
  assert.ok(md.includes("Nenhuma afirmação desta investigação foi classificada como de relevância material ou alta."));
  assert.ok(md.includes("Nenhum ponto desta investigação exige revisão profissional."));
  assert.ok(md.includes("## Limitações destas camadas"));

  /* A evidência bruta — semântica e estrutural — não vem junto. */
  assert.ok(md.length < 16000, `a célula passou de 16 kB: ${md.length}`);
  semEnderecoInterno("authority_requirements_md (descoberta)", md);
});

test("2 · authority_requirements_md · YouTube e Amazon declaram a ausência da camada", () => {
  for (const profile of ["YOUTUBE", "AMAZON"] as const) {
    const md = radarPortableAuthorityRequirementsMarkdown({ profile, observed: null });
    assert.ok(md.includes("são produzidas só pela investigação de páginas do Google, e não existem neste dossiê"), `${profile} sem a ausência declarada`);
    assert.ok(md.includes("afirmação sensível continua pedindo fonte"));
  }
});

/* ============================ 3 · a estrutura dos concorrentes ============================ */

test("3 · competitors_structure_json · melhor posição, posições, recorrência, classificação e estrutura medida", () => {
  const observado = vista().observed;
  const texto = radarPortableCompetitorsStructureJson({ profile: "GOOGLE", observed: observado });
  const coluna = JSON.parse(texto);

  assert.equal(coluna.total, observado.competitors.length);
  assert.equal(coluna.listed, observado.competitors.length);
  assert.equal(coluna.omitted, null);
  assert.equal(coluna.measuresAvailable, true);
  assert.equal(coluna.absence, null);
  assert.match(coluna.usage, /nunca molde a copiar/);

  const primeiro = coluna.competitors[0];
  assert.equal(primeiro.bestPosition, 1);
  assert.deepEqual(primeiro.positions, [{ query: "skincare para pele oleosa", keywordRole: "principal", position: 1 }]);
  assert.equal(primeiro.queryRecurrence, 1);
  assert.equal(primeiro.classification, "Concorrente editorial");
  assert.equal(primeiro.origin, "consulta canônica do artigo");
  assert.equal(primeiro.format, "Artigo editorial");
  assert.equal(primeiro.extraction, "página lida");
  assert.deepEqual(primeiro.structure, { words: 1600, h2: 3, h3: 0, paragraphs: 12, images: 2, lists: 1 });
  assert.ok(primeiro.conceptsCovered > 0);

  /* A medida por página, ligada pela URL, contra a régua da amostra — e o outlier nomeado. */
  assert.equal(primeiro.measures.Palavras, 1600);
  assert.equal(primeiro.measures["Trechos em destaque"], 3, "eixo medido que a estrutura resumida não tem");
  assert.deepEqual(primeiro.outsideCentralRange, []);
  const regua = coluna.sampleMeasures.find((medida: { label: string }) => medida.label === "Palavras");
  assert.equal(regua.pages, 12);
  assert.ok(regua.median > 1500 && regua.median < 1800, `mediana ${regua.median}`);
  assert.ok(regua.centralRange[1] < 15000, "o outlier poluiu a faixa central");
  const outlier = coluna.competitors.find((item: { url: string }) => item.url === PAGINAS[11].url);
  assert.equal(outlier.measures.Palavras, 15000);
  assert.deepEqual(outlier.outsideCentralRange, ["Palavras"], "o outlier não foi marcado");
  assert.ok(primeiro.presencesObserved.includes("Usa listas"));
  assert.equal(primeiro.presencesObserved.includes("Usa tabelas"), false, "presença que ninguém observou");

  /* O papel é o mesmo de serp_sources_json: as duas colunas se cruzam pela URL. */
  const fontes = new Map(radarPortableSerpSources(observado).map(item => [item.url, item.role]));
  for (const item of coluna.competitors) assert.equal(item.role, fontes.get(item.url), `papel divergente em ${item.url}`);

  semEnderecoInterno("competitors_structure_json", texto);
});

const concorrente = (indice: number, ranks: RadarObservedCompetitor["ranks"]): RadarObservedCompetitor => ({
  referenceId: `research:${String(indice).padStart(16, "0")}`,
  url: `https://site-${indice}.com.br/pele-oleosa`, domain: `site-${indice}.com.br`, title: `Página ${indice}`,
  classification: "EDITORIAL_COMPETITOR", origin: "CANONICAL_AND_AUXILIARY",
  queries: ranks.map(item => item.keyword || ""), queryRecurrence: ranks.length, ranks,
  extractionStatus: "not_extracted", format: null, comparable: false, structure: null,
  conceptsCovered: [], questionsCovered: [], limitations: ["Selecionada, mas sem extração nesta versão."],
});

test("3 · competitors_structure_json · a MELHOR posição, não a da primeira aparição", () => {
  const coluna = radarPortableCompetitorsStructure({
    profile: "GOOGLE",
    observed: {
      competitors: [concorrente(1, [
        { keyword: "cuidados pele oleosa", role: "secundaria", rank: 7 },
        { keyword: "skincare para pele oleosa", role: "principal", rank: 2 },
      ])],
      structure: { measures: [], presences: [], patterns: [] },
    },
  });

  const item = coluna.competitors[0];
  assert.equal(item.bestPosition, 2, "a posição saiu da primeira aparição");
  assert.deepEqual(item.positions.map(posicao => posicao.position), [2, 7]);
  assert.deepEqual(item.positions.map(posicao => posicao.keywordRole), ["principal", "secundária"]);
  assert.equal(item.queryRecurrence, 2);
  assert.equal(item.origin, "consulta canônica e auxiliar");
  assert.equal(item.extraction, "página não lida nesta investigação");
  assert.equal(item.structure, null);
  assert.equal(coluna.measuresAvailable, false);
  assert.match(coluna.absence || "", /não carrega medidas estruturais por página/);
  assert.equal("referenceId" in item, false);

  /* O papel segue a regra de serp_sources_json também para a página só da pesquisa auxiliar. */
  const auxiliar = { ...concorrente(2, [{ keyword: "cuidados pele oleosa", role: "secundaria", rank: 4 }]), origin: "AUXILIARY" as const };
  const observado = { competitors: [auxiliar], structure: { measures: [], presences: [], patterns: [] } };
  const papel = radarPortableCompetitorsStructure({ profile: "GOOGLE", observed: observado }).competitors[0].role;
  assert.equal(papel, "SUPPORT");
  assert.equal(papel, radarPortableSerpSources(observado as never)[0].role);
});

test("3 · competitors_structure_json · vinte concorrentes medidos cabem na célula; o resto é contado", () => {
  /* Uma amostra real maior que o teto: 22 páginas lidas e medidas. */
  const paginas = Array.from({ length: 22 }, (_, indice) => pagina(`B${indice}`, ["Como identificar a pele oleosa?", "Por que a pele fica oleosa?"], 1500 + indice * 20));
  const grande = buildRadarDeepResearchView({
    context: contexto(),
    snapshot: { query: "skincare para pele oleosa", organicResults: paginas.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `e${indice}.com`, url: item.url })) } as never,
    extractions: paginas,
    selectedReferences: paginas.length,
    observedAt: "2026-09-10T12:00:00.000Z",
  }).observed;

  const texto = radarPortableCompetitorsStructureJson({ profile: "GOOGLE", observed: grande });
  const coluna = JSON.parse(texto);
  assert.equal(coluna.total, 22);
  assert.equal(coluna.listed, RADAR_PORTABLE_GAP_LIMITS.competitors, "a célula cortou concorrentes que cabiam no teto de itens");
  assert.match(coluna.omitted, /2 concorrente\(s\) de pior posição ficaram fora desta coluna \(20 de 22\)/);
  assert.ok(texto.length <= RADAR_PORTABLE_GAP_LIMITS.jsonCellChars, `célula com ${texto.length} caracteres`);
  assert.ok(coluna.competitors.every((item: { measures: Record<string, number> }) => Object.keys(item.measures).length > 0), "concorrente medido sem medida");
});

test("3 · competitors_structure_json · teto de concorrentes e de célula, sem quebrar o JSON", () => {
  const observado = {
    competitors: Array.from({ length: 25 }, (_, indice) => concorrente(indice, [{ keyword: "skincare para pele oleosa", role: "principal", rank: 25 - indice }])),
    structure: { measures: [], presences: [], patterns: [] },
  };

  const coluna = radarPortableCompetitorsStructure({ profile: "GOOGLE", observed: observado });
  assert.equal(coluna.total, 25);
  assert.equal(coluna.listed, RADAR_PORTABLE_GAP_LIMITS.competitors);
  assert.match(coluna.omitted || "", /5 concorrente\(s\) de pior posição ficaram fora desta coluna \(20 de 25\)\. Todos continuam em serp_sources_json\./);
  /* Os que ficaram são os de melhor posição. */
  assert.deepEqual(coluna.competitors.map(item => item.bestPosition), Array.from({ length: 20 }, (_, indice) => indice + 1));

  /* Célula apertada: saem menos concorrentes, e o JSON continua abrindo. */
  const apertada = JSON.parse(radarPortableCompetitorsStructureJson({ profile: "GOOGLE", observed: observado }, 3000));
  assert.ok(apertada.listed < 20 && apertada.listed > 0, `listados: ${apertada.listed}`);
  assert.equal(apertada.competitors.length, apertada.listed);
  assert.match(apertada.omitted, /para caber no limite da célula/);
});

test("3 · competitors_structure_json · fora do Google a ausência é dita", () => {
  const coluna = JSON.parse(radarPortableCompetitorsStructureJson({ profile: "YOUTUBE", observed: null }));
  assert.deepEqual(coluna.competitors, []);
  assert.match(coluna.absence, /produzida só pela investigação de páginas do Google/);
});

/* ============================ 4 · as proibições do Redator ============================ */

test("4 · writer rules · as proibições do Redator que as regras do CSV não cobrem", () => {
  /* O CSV já cobre principal, MUST_COVER, intenção, slug e canonical. */
  assert.deepEqual(radarWriterProhibitionsMissingFromRules(RADAR_WRITING_RULES, RADAR_WRITER_MAY_NOT), [
    "reconfigurar o Silo",
    "substituir a composição de secundárias por decisão própria",
  ]);

  const novas = radarWriterParityRules();
  assert.equal(novas.length, 2);
  assert.match(novas[0], /^não reconfigurar o Silo — /);
  assert.match(novas[1], /^não substituir a composição de secundárias por decisão própria/);
  for (const regra of novas) assert.ok(regra.endsWith(";"), "a regra nova quebra a pontuação da lista");

  /* A lista completa: as novas entram antes da última, que fecha com ponto. */
  const completa = radarWritingRulesWithWriterParity();
  assert.equal(completa.length, RADAR_WRITING_RULES.length + 2);
  assert.equal(completa[completa.length - 1], RADAR_WRITING_RULES[RADAR_WRITING_RULES.length - 1]);
  assert.ok(completa.includes(novas[0]) && completa.includes(novas[1]));

  /* Idempotente: aplicar de novo não duplica. */
  assert.deepEqual(radarWriterProhibitionsMissingFromRules(completa), []);
  assert.deepEqual(radarWritingRulesWithWriterParity(completa), completa);

  /* Proibição nova do Redator entra sozinha, na redação dele. */
  assert.deepEqual(radarWriterParityRules(completa, [...RADAR_WRITER_MAY_NOT, "publicar sem revisão humana"]), ["não publicar sem revisão humana;"]);
});

/* ================================ higiene e forma ================================ */

test("higiene · nenhuma das três colunas leva id, UUID, hash, referência ou endereço interno", () => {
  const google = radarPortableDossierGapColumns({ status: statusDoGoogle(), observed: observadoComAutoridade() });
  const youtube = radarPortableDossierGapColumns({
    status: { frozenObservedAt: "2026-09-14T10:00:00.000Z", bundle: dossieDoYoutube(), readiness: PRONTO },
    observed: null,
  });

  for (const [perfil, colunas] of [["GOOGLE", google], ["YOUTUBE", youtube]] as const) {
    assert.deepEqual(Object.keys(colunas).sort(), [...RADAR_PORTABLE_GAP_COLUMNS].sort());
    for (const [coluna, valor] of Object.entries(colunas)) {
      assert.ok(valor.trim().length > 0, `${perfil} · ${coluna} vazia sem frase`);
      semEnderecoInterno(`${perfil} · ${coluna}`, valor);
    }
  }

  /* O perfil sai do dossiê: o YouTube declara a ausência nas duas colunas do Google. */
  assert.match(youtube.authority_requirements_md, /investigado pelo perfil YouTube/);
  assert.match(JSON.parse(youtube.competitors_structure_json).absence, /investigado pelo perfil YouTube/);
});

test("higiene · o trecho de terceiro sai curto e marcado", () => {
  const trecho = radarPortableThirdPartyExcerpt(RESUMO_LONGO) || "";
  const corpo = trecho.match(/^"([^"]*)"/)?.[1] || "";
  assert.ok(corpo.length <= RADAR_PORTABLE_GAP_LIMITS.thirdPartyExcerpt);
  assert.ok(corpo.endsWith("…"), "o corte precisa ser visível");
  assert.ok(trecho.endsWith(`(${RADAR_PORTABLE_THIRD_PARTY_MARK})`));
  assert.equal(radarPortableThirdPartyExcerpt("   "), null);
  assert.equal(radarPortableThirdPartyExcerpt(`Ver ${SNAPSHOT}.`)?.includes(ARTIGO), false, "id dentro do trecho");
});

test("forma · colunas com sufixo, e nunca mais JSON do que Markdown", () => {
  for (const coluna of RADAR_PORTABLE_GAP_COLUMNS) assert.match(coluna, /_(md|json)$/);
  const markdown = RADAR_PORTABLE_GAP_COLUMNS.filter(coluna => coluna.endsWith("_md")).length;
  const json = RADAR_PORTABLE_GAP_COLUMNS.filter(coluna => coluna.endsWith("_json")).length;
  assert.ok(json <= markdown, `${json} JSON contra ${markdown} Markdown`);
});

test("pureza · o módulo projeta o dossiê: não lê banco, não chama coleta, não usa relógio", async () => {
  const fonte = (await readFile(new URL("../lib/radar/portable-dossier-gaps.ts", import.meta.url), "utf8"))
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").filter(linha => !linha.trim().startsWith("//")).join("\n");

  for (const proibido of [/\bfetch\(/, /supabase/i, /process\.env/, /server-only/, /from "\.\.\/server\//, /new Date\(/, /Date\.now\(/, /localStorage|indexedDB/]) {
    assert.equal(proibido.test(fonte), false, `o módulo puro usa ${proibido}`);
  }
});

test("sentinela · nenhuma chamada de rede nesta suíte", () => {
  assert.deepEqual(idasAoServidor, []);
});
