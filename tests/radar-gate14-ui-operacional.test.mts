import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildRadarArticleDnaSummary, buildRadarAuthoritySummary, buildRadarCompetitiveSummary,
  buildRadarDiscoverySummary, buildRadarInternalLinkSummary, buildRadarReportSummary,
  buildRadarResearchCardSummary, radarKeywordLines, radarOperationalStatus,
  RADAR_OPERATIONAL_STATUS_LABEL, RADAR_OPERATIONAL_STATUS_TONE,
} from "../lib/radar/operational-view.ts";
import { RADAR_R3_AREAS } from "../lib/radar/r3-workbench.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 14 · A INTERFACE QUE MOSTRA O RESULTADO  =====================
 *
 * O motor ficou sofisticado e a tela foi acompanhando: cada Gate acrescentou
 * um parágrafo explicando o que tinha construído. O resultado é que a
 * interface passou a ensinar a arquitetura em vez de mostrar a conclusão.
 *
 * O que este arquivo guarda:
 *
 *   a primeira camada responde, o detalhe fica atrás de um clique;
 *   nada é recalculado no React;
 *   abrir, trocar de aba ou recarregar não dispara pesquisa;
 *   e nada foi apagado para a tela ficar bonita.
 *
 * Nenhum teste chama rede.
 */

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const workbench = () => ler("../modules/radar/radar-r3-workbench.tsx");
const dossie = () => ler("../modules/radar/radar-r3-content-dossier.tsx");
const page = () => ler("../modules/radar/radar-page.tsx");

/* =============================== a fixture ============================== */

const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
});

const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("Riscos do ácido salicílico para pele oleosa na gravidez");
  return pagina(`A${index}`, headings);
});

const contexto = (patch: { keywords?: unknown[] } = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "b", articleId: "a", articleDnaVersionId: "dna-v14-abcdef", articleDnaContentHash: "hash-v14",
    promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Pilar",
  },
  keywords: patch.keywords ?? [
    {
      identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
      strategy: { volume: 720, kgrScore: 0.589, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU" } },
      resolution: "FULL",
    },
    {
      identity: { keywordId: "kw2", text: "skin care pele oleosa", role: "secundaria" },
      strategy: { volume: 1300, kgrScore: 0.325, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: null, semanticQualification: null },
      resolution: "FULL",
    },
    {
      identity: { keywordId: "kw3", text: "pele oleosa e acne", role: "reforco_narrativo" },
      strategy: { volume: 720, kgrScore: null, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: null, semanticQualification: null },
      resolution: "FULL",
    },
  ],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", siloDnaVersionId: "silo-v1", siloDnaContentHash: null, siloPageId: null, siloPageSlug: "/skincare", siloPageCanonical: null, siloPagePublicationStatus: null, articleRole: "PILAR", hierarchy: "Pilar" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = {
  query: "skincare para pele oleosa",
  organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `dominio-a${index}.com.br`, url: item.url })),
};

const vista = (patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) =>
  buildRadarDeepResearchView({
    context: contexto(),
    snapshot: SNAPSHOT as never,
    extractions: PAGINAS,
    selectedReferences: PAGINAS.length,
    observedAt: "2026-09-10T12:00:00.000Z",
    ...patch,
  });

/* =============  A e B · PESQUISA NO LUGAR DE SERP + AMAZON  ============= */

test("GATE 14 · A — Amazon deixou de ser um card principal", () => {
  assert.equal(RADAR_R3_AREAS.includes("amazon" as never), false, "SEPARATE_AMAZON_CARD = NO");
  assert.deepEqual(RADAR_R3_AREAS, ["pesquisa", "videos", "especialista", "relatorio"]);

  const fonte = workbench();
  assert.doesNotMatch(fonte, /areaLabel[^=]*=[^;]*Amazon/, "nenhum card rotulado Amazon");

  /*
   * O DADO NÃO SUMIU — mudou de lugar.
   *
   * A decisão registrada sobre Amazon continua acessível dentro da Pesquisa,
   * no modo a que ela pertence. Apagar seria perder; recolher é hierarquia.
   */
  assert.match(fonte, /RadarR3AmazonPanel/, "o painel continua existindo");
  assert.match(fonte, /searchMode === "AMAZON"/, "e vive dentro do modo Amazon da Pesquisa");
});

test("GATE 14 · B — a Pesquisa oferece Google, YouTube e Amazon numa escolha só", () => {
  const fonte = workbench();
  assert.match(fonte, /data-testid="radar-search-mode"/);
  assert.match(fonte, /\(\["WEB", "YOUTUBE", "AMAZON"\] as const\)/);
  assert.match(fonte, /role="radiogroup"/, "seleção única, não três lugares");
  assert.match(fonte, /Pesquisar em/);

  /* A engine ausente é dita no próprio botão, não escondida. */
  assert.match(fonte, /em construção/);
});

/* ==========  C e D · CARD COMPACTO, SEM TEXTO DE ARQUITETURA  =========== */

test("GATE 14 · C — os cards superiores são resumos, não painéis", () => {
  const fonte = workbench();
  assert.doesNotMatch(fonte, /min-h-28|min-h-32/, "TOP_CARDS_COMPACT: nenhuma altura reservada para prosa");
  assert.match(fonte, /function AreaCard/);
  assert.match(fonte, /copy\.lines\.map/, "o card mostra linhas de número, não um parágrafo");

  const resumo = buildRadarResearchCardSummary({ view: vista(), mode: "WEB" });
  assert.equal(resumo.modeLabel, "Google");
  assert.ok(resumo.counts.references > 0);
  assert.ok(["Pronto", "Parcial", "Não iniciado"].includes(resumo.model.label));
  assert.ok(RADAR_OPERATIONAL_STATUS_LABEL[resumo.status]);
});

test("GATE 14 · D — explicação de arquitetura não ocupa a primeira camada", () => {
  const fonte = workbench();

  /*
   * As frases continuam verdadeiras e continuam no produto — em proveniência.
   * O que elas não fazem mais é ocupar a tela de quem já sabe como funciona.
   */
  const proveniencia = fonte.slice(fonte.indexOf('data-testid="radar-technical-provenance"'));
  for (const frase of ["canônica do artigo", "auxiliares", "Nada é coletado por abrir a tela"]) {
    assert.ok(proveniencia.includes(frase), `"${frase}" vive na proveniência`);
  }

  const primeiraCamada = fonte.slice(0, fonte.indexOf('data-testid="radar-technical-provenance"'));
  for (const proibida of ["Pesquisa a unidade editorial inteira", "Modo congelado com esta investigação", "Quantidade, repetição e posição final", "Pronto para Silos"]) {
    assert.equal(primeiraCamada.includes(proibida), false, `"${proibida}" não é primeira camada`);
  }
  assert.equal(fonte.includes("TECHNICAL_TEXT_FIRST_LAYER"), false);
});

/* =========  E, F, G e H · O ARTIGO INVESTIGADO, EM LEITURA  ============= */

test("GATE 14 · E — o ArticleDNA tem um resumo que se lê em segundos", () => {
  const resumo = buildRadarArticleDnaSummary(contexto());

  assert.equal(resumo.principal, "skincare para pele oleosa");
  assert.equal(resumo.silo, "skincare");
  assert.equal(resumo.role, "Pilar");
  assert.equal(resumo.intent, "informacional");
  assert.equal(resumo.funnel, "Topo", "o funil vem do fundamento, traduzido para quem lê");
  assert.equal(resumo.keywordCount, 3);
  assert.equal(resumo.principalVolume, 720);
  assert.equal(resumo.aggregateVolume, 2740, "volume agregado é soma do que existe, não estimativa");
  assert.equal(resumo.complete, true);

  const fonte = dossie();
  assert.match(fonte, /data-testid="radar-article-dna-summary"/);
  assert.match(fonte, /buildRadarArticleDnaSummary/);
});

test("GATE 14 · F — as keywords continuam inteiras, em uma linha cada", () => {
  const linhas = radarKeywordLines(contexto());

  assert.equal(linhas.length, 3);
  assert.equal(linhas[0].roleLabel, "Principal", "a principal vem primeiro");
  assert.equal(linhas[0].kgr, 0.589);
  assert.equal(linhas[1].volume, 1300);
  assert.equal(linhas[2].kgr, null, "métrica ausente é null, nunca zero inventado");

  const fonte = dossie();
  assert.match(fonte, /radarKeywordLines/);
  assert.match(fonte, /Ver perfil completo/, "o perfil inteiro continua a um clique");
  assert.match(fonte, /buildRadarKeywordProfile/);
});

test("GATE 14 · G e H — Silo, hierarquia e links internos continuam acessíveis", () => {
  const fonte = dossie();
  assert.match(fonte, /Ver Silo, hierarquia, links internos, SERP de formação e qualificação semântica/);
  assert.match(fonte, /buildRadarFoundationSections/, "a mesma projeção do motor alimenta o expansível");

  /* O grafo aprovado continua sendo lido no resumo de links do Workbench. */
  const wb = workbench();
  assert.match(wb, /buildRadarInternalLinkSummary/);
  assert.match(wb, /testId="radar-summary-links"/);
});

/* ================  I · PROVENIÊNCIA EM UM LUGAR SÓ  ==================== */

test("GATE 14 · I — proveniência técnica existe, e sempre recolhida", () => {
  for (const fonte of [workbench(), dossie()]) {
    assert.match(fonte, /Proveniência e detalhes técnicos/);
    assert.doesNotMatch(fonte, /<details[^>]*\sopen/, "TECHNICAL_PROVENANCE_COLLAPSED");
  }
  const wb = workbench();
  assert.match(wb, /data-testid="radar-technical-provenance"/);
  /* Versões, hashes e ids continuam disponíveis — atrás do resumo. */
  for (const campo of ["articleDnaVersionId", "siloDnaVersionId", "formationAssessmentId", "internalLinkGraphVersionId"]) {
    assert.ok(wb.includes(campo), campo);
  }
});

/* ======  J, K, L, M e N · RESUMO + DETALHE EM CADA CAMADA  ============== */

test("GATE 14 · J e K — o modelo competitivo tem resumo, e a semântica continua atrás dele", () => {
  const view = vista();
  const resumo = buildRadarCompetitiveSummary(view.observed);

  assert.equal(resumo.comparablePages, 12);
  assert.ok(resumo.recurrentConcepts > 0);
  assert.ok(resumo.coreQuestions > 0);
  assert.ok(resumo.sufficiency.length > 5, "a suficiência é frase, não sigla");

  const fonte = workbench();
  assert.match(fonte, /testId="radar-summary-model"/);
  assert.match(fonte, /buildRadarCompetitiveSummary/);
  /* A leitura humana do Gate 9 é o detalhe — sem segundo cálculo na tela. */
  assert.match(fonte, /view\.narrative\.map/);
  assert.doesNotMatch(fonte, /semanticConceptId|queryCoverage/, "a primeira camada não mostra campo técnico");
});

test("GATE 14 · L — o plano de links tem resumo, detalhe e a relação sem aplicação nomeada", () => {
  const view = vista();
  const resumo = buildRadarInternalLinkSummary(view.observed);

  assert.equal(typeof resumo.relatedDestinations, "number");
  assert.equal(typeof resumo.recommendedOccurrences, "number");
  if (resumo.unresolvedRelations) {
    assert.match(resumo.unresolvedNote || "", /A relação permanece/, "relação sem contexto não é erro");
  }

  const fonte = workbench();
  assert.match(fonte, /Ver detalhe/);
  assert.match(fonte, /Âncora/);
  assert.match(fonte, /recommendedOccurrences/);
  assert.match(fonte, /data-testid="radar-links-unresolved"/);
});

test("GATE 14 · M — fontes e autoridade têm resumo antes do detalhe", () => {
  const view = vista();
  const resumo = buildRadarAuthoritySummary(view.observed);

  assert.equal(resumo.sampleSize, 12);
  assert.ok(resumo.citingCompetitors >= 0);
  assert.ok(["Não sensível", "Baixa", "Material", "Alta"].includes(resumo.ymylLabel), "YMYL em português, não enum");
  assert.equal(typeof resumo.specialistPoints, "number");

  const fonte = workbench();
  assert.match(fonte, /testId="radar-summary-authority"/);
  assert.match(fonte, /buildRadarAuthoritySummary/);
});

test("GATE 14 · N — busca e compreensão têm resumo, sem vocabulário de vitrine", () => {
  const view = vista();
  const resumo = buildRadarDiscoverySummary(view.observed.aiDiscovery);

  assert.equal(typeof resumo.coreQuestions, "number");
  assert.equal(typeof resumo.definitions, "number");
  assert.equal(typeof resumo.unitsDependingOnSpecialist, "number");

  const fonte = workbench();
  assert.match(fonte, /testId="radar-summary-discovery"/);
  assert.equal(/GEO|AIO|SEO para IA|score/i.test(fonte), false, "nenhuma promessa de vitrine na tela");

  const projecao = ler("../lib/radar/operational-view.ts");
  assert.equal(/\bscore\b/i.test(projecao), false, "nem na projeção");
});

/* ==============  O · A PLANILHA E OS SELECTORS CANÔNICOS  ============== */

test("GATE 14 · O — a planilha usa a grade da plataforma e os mesmos selectors", () => {
  const fonte = page();

  assert.match(fonte, /OperationalDataGrid/, "PLATFORM_TABLE_GUIDELINES_REUSED");
  assert.doesNotMatch(fonte, /className="[^"]*\btable\b[^"]*"[^>]*aria-label="Planilha/, "nenhuma tabela própria do Radar");

  /* A coluna Pesquisa e a coluna Relatório leem da mesma projeção do card. */
  assert.match(fonte, /buildRadarResearchCardSummary/, "TABLE_USES_CANONICAL_SELECTORS");
  assert.match(fonte, /buildRadarReportSummary/);
  assert.match(fonte, /buildRadarArticleDnaSummary/);
  assert.match(fonte, /id: "research", header: "Pesquisa"/);
  assert.equal(/id: "amazon", header: "Amazon"/.test(fonte), false, "a coluna que só dizia 'sem coleta externa' saiu");

  /* Piso tipográfico da plataforma: nada abaixo de 12px, nem para ganhar densidade. */
  assert.equal(/text-\[(9|10|11)px\]/.test(fonte), false, "nenhuma fonte abaixo do piso de 12px");

  /*
   * A COR DA KEYWORD PERTENCE AO VALOR DA KEYWORD.
   *
   * A célula do artigo pintava a linha inteira — silo e versão do ArticleDNA
   * junto — como se tudo fosse keyword. O papel é fixo na plataforma e vale
   * para o texto da keyword, não para o metadado ao lado dela.
   */
  assert.match(fonte, /<span className="text-keyword">\{data\.r3\.keyword\}<\/span>/);
  assert.equal(/text-keyword">\{data\.r3\.keyword\} · \{data\.r3\.silo\}/.test(fonte), false);
});

/* ========  P, Q e R · NENHUMA COLETA SEM CLIQUE DO USUÁRIO  ============ */

test("GATE 14 · P, Q e R — abrir, trocar de aba ou recarregar não pesquisa nada", () => {
  for (const caminho of ["../modules/radar/radar-r3-workbench.tsx", "../modules/radar/radar-r3-content-dossier.tsx", "../modules/radar/radar-r3-serp-panel.tsx"]) {
    const fonte = ler(caminho);
    assert.doesNotMatch(fonte, /useEffect/, `${caminho}: EXPAND_TRIGGERS_PROVIDER = NO`);
    assert.doesNotMatch(fonte, /\bfetch\(/, `${caminho}: nenhuma chamada de rede na tela`);
  }

  /*
   * EXPANDIR É setState, E MAIS NADA.
   *
   * A alternância do card não chama handler de domínio: ela troca qual painel
   * renderiza. O que renderiza é dado que já existe.
   */
  const fonte = workbench();
  assert.match(fonte, /onToggle=\{\(\) => setExpandedArea\(current => current === area \? null : area\)\}/);
  assert.doesNotMatch(fonte, /onToggle=\{\(\) => \{[^}]*on(Start|Analyze|Refresh|Reset)/);

  /* E na página, coleta e análise só existem dentro de handlers de clique. */
  const fontePagina = page();
  assert.doesNotMatch(fontePagina, /useEffect\([^)]*\)\s*=>\s*\{[^}]*collectSerp/);
});

/* ==============  S · A AÇÃO PRIMÁRIA VEM DA AUTORIDADE  =============== */

test("GATE 14 · S — a ação principal deriva da fase 1, e é uma só", () => {
  const view = vista();
  assert.ok(view.phase1.id, "a fase 1 resolve qual é a ação");
  assert.ok(["START_RESEARCH", "ANALYZE_COMPETITION", "FINALIZE_SERP", "NONE"].includes(view.phase1.id));

  const resumo = buildRadarResearchCardSummary({ view, mode: "WEB" });
  assert.equal(resumo.action.id, view.phase1.id, "o card não reinventa a ação");

  const fonte = workbench();
  assert.match(fonte, /const acao = view\.phase1;/);
  assert.match(fonte, /data-testid="radar-deep-research-button"/);
  /* Zerar é ação de bancada: sem borda de ação, e nunca ao lado como igual. */
  assert.match(fonte, /data-testid="radar-reset-investigation"/);
  const reset = fonte.slice(fonte.indexOf('data-testid="radar-reset-investigation"'), fonte.indexOf('data-testid="radar-reset-investigation"') + 400);
  assert.equal(reset.includes("primaryButton"), false, "o reset não usa o botão primário");
});

/* ==========  T · NENHUM MODELO É RECALCULADO NO REACT  ================= */

test("GATE 14 · T — a tela consome autoridades, nunca as reconstrói", () => {
  const construtores = [
    "buildRadarCompetitiveObservedModel",
    "buildRadarSemanticConceptModel",
    "buildRadarCompetitiveModel",
    "buildRadarAuthorityEvidence",
    "buildRadarAiDiscoveryContext",
    "buildRadarInternalLinkPlan",
    "buildRadarEvidenceClaims",
    "buildRadarDeepResearchView",
  ];
  for (const caminho of ["../modules/radar/radar-r3-workbench.tsx", "../modules/radar/radar-r3-content-dossier.tsx"]) {
    const fonte = ler(caminho);
    for (const construtor of construtores) {
      assert.equal(fonte.includes(construtor), false, `${caminho} não pode chamar ${construtor}`);
    }
  }

  /*
   * A PROJEÇÃO É LEITURA, NÃO CÁLCULO.
   *
   * `operational-view` recebe modelos prontos e lê deles. Se ela construísse
   * qualquer um, a planilha e o painel poderiam divergir de novo.
   */
  const projecao = ler("../lib/radar/operational-view.ts");
  for (const construtor of construtores) {
    assert.equal(projecao.includes(construtor), false, `a projeção não pode chamar ${construtor}`);
  }
  assert.doesNotMatch(projecao, /\bfetch\(|useState|useEffect/, "domínio puro, sem React e sem rede");
});

/* ============  §23, §24 e §28 · ESTADO HUMANO E RELATÓRIO  ============= */

test("GATE 14 · o estado interno vira um estado que uma pessoa reconhece", () => {
  const view = vista();
  const estado = radarOperationalStatus({ view });

  assert.ok(RADAR_OPERATIONAL_STATUS_LABEL[estado.status]);
  assert.equal(estado.label, RADAR_OPERATIONAL_STATUS_LABEL[estado.status]);
  assert.equal(estado.tone, RADAR_OPERATIONAL_STATUS_TONE[estado.status]);
  assert.ok(estado.reason.length > 3, "o estado sempre vem com o motivo");

  /* Em curso é "Analisando", não um enum de fila. */
  assert.equal(radarOperationalStatus({ view, running: true }).status, "ANALYZING");

  /* Fundamento mudado é atenção — e é o único caso que pede destaque forte. */
  const desatualizada = radarOperationalStatus({ view: { ...view, state: "STALE" } });
  assert.equal(desatualizada.status, "ATTENTION");
  assert.equal(desatualizada.tone, "warning");
  assert.match(desatualizada.reason, /fundamentos mudaram/);

  /* Cor só onde há significado: os estados calmos não pintam nada. */
  assert.equal(RADAR_OPERATIONAL_STATUS_TONE.NOT_STARTED, "neutral");
  assert.equal(RADAR_OPERATIONAL_STATUS_TONE.RESEARCHING, "info");
});

test("GATE 14 · o relatório responde perguntas em vez de exibir um contador", () => {
  const view = vista();
  const resumo = buildRadarReportSummary({ observed: view.observed, view });

  const perguntas = resumo.checks.map(item => item.question);
  assert.ok(perguntas.includes("Pesquisa pronta?"));
  assert.ok(perguntas.includes("Modelo competitivo pronto?"));
  assert.ok(perguntas.includes("Links planejados?"));
  assert.ok(perguntas.includes("Fontes verificadas?"));
  assert.ok(perguntas.includes("Especialista necessário?"));

  for (const check of resumo.checks) {
    assert.ok(["READY", "PARTIAL", "PENDING", "NOT_REQUIRED"].includes(check.state), check.id);
    assert.ok(check.detail.length > 15, `${check.id} explica o porquê`);
  }

  /*
   * "34 necessidades" sozinho não ajuda ninguém a decidir. O que está em
   * aberto é nomeado, e quem lê sabe o que falta antes de enviar.
   */
  for (const bloqueio of resumo.blockers) assert.ok(bloqueio.length > 20, bloqueio);

  const fonte = workbench();
  assert.match(fonte, /data-testid="radar-report-summary"/);
  assert.match(fonte, /data-testid="radar-report-blockers"/);
});
