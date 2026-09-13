import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RADAR_R3_AREAS } from "../lib/radar/r3-workbench.ts";
import { buildRadarReportSummary } from "../lib/radar/operational-view.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 14.1 · QUATRO ÁREAS, QUATRO DONOS  =========================
 *
 * O Gate 14 encolheu a tela, e a homologação mostrou o que ele não tinha
 * resolvido: a investigação era montada FORA do switch de áreas e reaparecia
 * nas quatro. Quem abria o Especialista via o seletor Google/YouTube/Amazon e o
 * modelo competitivo inteiro embaixo — e a Pesquisa "Finalizada" ainda oferecia
 * "Analisar páginas pendentes".
 *
 * O que este arquivo guarda:
 *
 *   cada painel operacional vive dentro da própria área;
 *   fundamento é contexto global, não uma das quatro áreas;
 *   registrar vídeo não é falar com especialista;
 *   e o especialista recebe perguntas, não vocabulário do parser.
 *
 * Nenhum teste chama rede.
 */

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const workbench = () => ler("../modules/radar/radar-r3-workbench.tsx");
const especialista = () => ler("../modules/radar/radar-r3-specialist-panel.tsx");
const videos = () => ler("../modules/radar/radar-r3-videos-panel.tsx");
const page = () => ler("../modules/radar/radar-page.tsx");

/** O trecho renderizado de uma área — o que aparece quando ela está aberta. */
function areaBlock(area: string): string {
  const fonte = workbench();
  const inicio = fonte.indexOf(`{expandedArea === "${area}"`);
  assert.ok(inicio >= 0, `a área ${area} é renderizada`);
  const proximas = ["pesquisa", "videos", "especialista", "relatorio"]
    .map(outra => fonte.indexOf(`{expandedArea === "${outra}"`, inicio + 10))
    .filter(indice => indice > inicio);
  const fim = proximas.length ? Math.min(...proximas) : fonte.indexOf("</div>\n    {/*", inicio);
  return fonte.slice(inicio, fim > inicio ? fim : undefined);
}

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
  return pagina(`A${index}`, headings);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v14-1", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, kgrScore: 0.589, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU" } },
    resolution: "FULL",
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const vista = () => buildRadarDeepResearchView({
  context: contexto(),
  snapshot: { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-10T12:00:00.000Z",
});

/* ==========  A, B, C e D · AS ÁREAS E O FUNDAMENTO GLOBAL  ============== */

test("GATE 14.1 · A e B — quatro áreas, e Conteúdo não é uma delas", () => {
  assert.deepEqual(RADAR_R3_AREAS, ["pesquisa", "videos", "especialista", "relatorio"]);
  assert.equal(RADAR_R3_AREAS.includes("conteudo" as never), false, "CONTENT_OPERATIONAL_AREA_REMOVED");

  const fonte = workbench();
  assert.doesNotMatch(fonte, /\{expandedArea === "conteudo"/, "nenhum painel operacional de Conteúdo");
  assert.match(fonte, /areaLabel: Record<RadarR3Area, string> = \{ pesquisa: "Pesquisa", videos: "Vídeos"/);
});

test("GATE 14.1 · C e D — o ArticleDNA continua acessível, e continua read-only", () => {
  const fonte = workbench();

  /* O dado não sumiu: virou faixa de contexto com os fundamentos a um clique. */
  assert.match(fonte, /data-testid="radar-article-context-band"/, "ARTICLE_FOUNDATION_GLOBAL_SUMMARY");
  assert.match(fonte, /data-testid="radar-article-foundations-details"/);
  assert.match(fonte, /Ver fundamentos do Article/);
  assert.match(fonte, /RadarR3ContentDossier/, "o dossiê inteiro continua sendo renderizado");
  assert.match(fonte, /buildRadarArticleDnaSummary/);

  /*
   * READ_ONLY POR CONSTRUÇÃO.
   *
   * A faixa não recebe nenhum handler: não há como editar o fundamento a
   * partir do Radar, nem por engano.
   */
  const faixa = fonte.slice(fonte.indexOf("function ArticleContextBand"), fonte.indexOf("O RELATÓRIO RESPONDE PERGUNTAS"));
  assert.doesNotMatch(faixa, /onClick|onChange|onSubmit|onToggle/);
  assert.doesNotMatch(faixa, /<button/);
});

/* ==========  E, F, G, H e I · A INVESTIGAÇÃO TEM UM DONO SÓ  =========== */

test("GATE 14.1 · E e F — a investigação e o seletor de modo só existem em Pesquisa", () => {
  const fonte = workbench();

  /*
   * O BLOCO ERA MONTADO DEPOIS DO SWITCH E APARECIA NAS QUATRO ÁREAS.
   *
   * Quem abria o Especialista via o seletor Google/YouTube/Amazon e o modelo
   * competitivo inteiro embaixo — informação certa, lugar errado.
   */
  assert.equal((fonte.match(/<DeepResearch view=/g) || []).length, 1, "montado uma vez só");
  const pesquisa = areaBlock("pesquisa");
  assert.match(pesquisa, /<DeepResearch view=/, "RESEARCH_PANEL_OWNER = PESQUISA");

  /* O seletor de modo vive dentro do próprio componente da investigação. */
  const investigacao = fonte.slice(fonte.indexOf("function DeepResearch"), fonte.indexOf("function Resumo"));
  assert.match(investigacao, /data-testid="radar-search-mode"/, "RESEARCH_MODE_SELECTOR_ONLY_IN_PESQUISA");
  assert.equal((fonte.match(/data-testid="radar-search-mode"/g) || []).length, 1);
});

test("GATE 14.1 · G, H e I — Especialista, Relatório e Vídeos não contêm a investigação", () => {
  for (const area of ["videos", "especialista", "relatorio"]) {
    const bloco = areaBlock(area);
    assert.doesNotMatch(bloco, /<DeepResearch/, `INVESTIGATION_VISIBLE_OUTSIDE_PESQUISA = NO (${area})`);
    assert.doesNotMatch(bloco, /radar-search-mode/, `sem seletor de modo em ${area}`);
    assert.doesNotMatch(bloco, /RadarR3SerpPanel/, `sem painel de SERP em ${area}`);
  }

  /* E nada operacional é montado depois do switch — só a ação que leva à área. */
  const fonte = workbench();
  const depois = fonte.slice(fonte.lastIndexOf("{expandedArea === \"relatorio\""));
  assert.doesNotMatch(depois.slice(depois.indexOf("</div>")), /<DeepResearch|RadarR3SerpPanel|RadarR3SpecialistPanel|RadarR3VideosPanel/);
});

/* ==============  J e K · VÍDEOS RECEBE A ENTRADA DE MATERIAL  ========== */

test("GATE 14.1 · J e K — a entrada de vídeo mudou do Especialista para Vídeos", () => {
  const areaVideos = videos();
  const areaEspecialista = especialista();

  assert.match(areaVideos, /data-testid="radar-videos-panel"/, "VIDEOS_AREA");
  assert.match(areaVideos, /data-testid="radar-videos-register"/, "VIDEO_INPUT_MOVED_FROM_SPECIALIST");
  /*
   * GATE 1 DE VÍDEOS · a entrada unitária virou lote, e a fonte virou remota.
   *
   * O campo único de URL e os estados locais `LINK_REGISTERED`/`AWAITING_FILE`
   * saíram junto com o `useState` que era a única cópia da fonte. O que esta
   * asserção protege continua sendo o mesmo: a entrada de vídeo mora AQUI.
   */
  /* No Gate 2.3 o mesmo campo passou a dizer que a fonte é da MARCA. */
  assert.match(areaVideos, /Cole uma URL do YouTube, ou várias — uma por linha\./);
  assert.match(areaVideos, /data-testid="radar-videos-input"/);
  assert.ok(!/LINK_REGISTERED|AWAITING_FILE|onExistingContentAdd/.test(areaVideos), "o caminho local não sobreviveu");

  /* O Especialista ficou sem o formulário — e sem os handlers dele. */
  assert.equal(/YouTube|Registrar conteúdo|contentReference/.test(areaEspecialista), false);
  assert.equal(/onExistingContentAdd/.test(areaEspecialista), false, "nem o handler sobrou");

  /*
   * A área Vídeos não USA SERP — a varredura é sobre consumo, não sobre a
   * palavra: o próprio comentário do módulo diz que ela não usa.
   */
  assert.doesNotMatch(areaVideos, /<DeepResearch|RadarR3SerpPanel|searchMode|deepResearch/);
  assert.doesNotMatch(areaVideos, /from "@\/lib\/radar\/(deep-research|search-mode|serp)/);
  /* §2.3.3: a declaração de escopo virou o InfoHint de "Conteúdo extraído". */
  assert.match(areaVideos, /title="Conteúdo extraído"/);
  assert.match(areaVideos, /O texto extraído é preservado no idioma ORIGINAL: nada é traduzido, resumido nem reescrito\./);
  assert.match(areaVideos, /ainda não existem/, "prometer transcrição sem entregá-la seria pior que a ausência");
});

/* ==========  L, M e N · CONGELADO NÃO OFERECE ANÁLISE  ================= */

test("GATE 14.1 · L e M — investigação congelada não mostra ANALYZE nem pendências", () => {
  const painel = ler("../modules/radar/radar-r3-serp-panel.tsx");

  /*
   * O BUG DA HOMOLOGAÇÃO: "Pesquisa Finalizada" ao lado de "Analisar páginas
   * pendentes (1)". A leitura viva continua calculando pendências, e elas
   * descrevem uma rodada que o USER encerrou.
   */
  assert.match(painel, /finalized\?: boolean;/);
  assert.match(painel, /const tabAction = finalized \? null/, "FINALIZED_RESEARCH_SHOWS_ANALYZE = NO");
  assert.match(painel, /\{finalized \? null :/, "e as confirmações também se recolhem");

  /*
   * GATE 15.3 · a garantia deixou de ser uma prop e virou ausência.
   *
   * O painel legado recebia `finalized` para se calar. Ele não é mais montado
   * pelo Workbench: não há superfície a silenciar, e portanto não há como ela
   * voltar a falar por esquecimento de uma prop.
   */
  const fonte = workbench();
  assert.doesNotMatch(fonte, /RadarR3SerpPanel/, "LEGACY_WORKFLOW_VISIBLE = NO");
  assert.match(fonte, /<RadarR3ResearchDetails/, "no lugar dele, consulta read-only");

  /*
   * E o botão da Fase 1 some quando não há ação — Gate 15 continua valendo.
   *
   * RADAR 18.8: o `<button>` copiado nos dois lugares de render virou um
   * `Phase1Button` só. A condição que o faz sumir é a mesma, e continua sendo
   * ela — não o componente — o que este teste protege.
   */
  assert.match(fonte, /acao\.id !== "NONE" && <Phase1Button acao=\{acao\}/);
  assert.equal(/data-testid="radar-deep-research-button"/.test(fonte.slice(fonte.indexOf("function Phase1Button"), fonte.indexOf("function RecoverSerpAction"))), true, "o testid vive dentro do componente único");
  assert.equal((fonte.match(/data-testid="radar-deep-research-button"/g) || []).length, 1, "um só lugar declara o botão primário");
});

test("GATE 14.1 · N — falha final é limitação declarada, nunca pendência", () => {
  const view = vista();

  /* A conta separa as três: analisadas, sem acesso e pendentes. */
  assert.equal(view.observed.sample.failedFinal >= 0, true);
  const resumo = buildRadarReportSummary({ observed: view.observed, view });
  const pesquisa = resumo.checks.find(item => item.id === "research");
  assert.ok(pesquisa);
  assert.doesNotMatch(pesquisa?.detail || "", /pendente/i, "FAILED_FINAL_RENDERED_AS_PENDING = NO");

  /* Quando há falha, ela aparece nas limitações do modelo, com o número. */
  const comFalhas = buildRadarDeepResearchView({
    context: contexto(),
    snapshot: { query: "q", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) } as never,
    extractions: PAGINAS.slice(0, 9),
    extractionFailureUrls: PAGINAS.slice(9).map(item => item.url),
    selectedReferences: PAGINAS.length,
    observedAt: "2026-09-10T12:00:00.000Z",
  });
  assert.equal(comFalhas.observed.sample.failedFinal, 3);
  assert.ok(comFalhas.observed.limitations.some(item => /não puderam ser extraídas/.test(item)));
});

/* ==============  O · O ESPECIALISTA RECEBE PERGUNTAS  ================== */

test("GATE 14.1 · O — o especialista não vê vocabulário do parser", () => {
  const fonte = page();

  /*
   * A CAPTURA MOSTRAVA `atilde`, `eacute`, `ccedil`, `oacute`.
   *
   * Eram termos recorrentes do benchmark antigo — resíduo de entidades HTML não
   * decodificadas nas páginas concorrentes — chegando como "Necessidades do
   * Radar". Um profissional abria a pauta e via trinta chips de lixo de
   * normalização onde deveria ver o que precisa da prática dele.
   */
  assert.match(fonte, /needs: data\.deepResearch\?\.observed\.authorityEvidence\.specialistReviewRequirements/, "RAW_SEMANTIC_TOKENS_FIRST_LAYER = NO");
  assert.equal(/needs: report\?\.needs\.flatMap/.test(fonte), false, "a origem antiga não volta");

  /* A origem nova é o Gate 12: pontos de revisão com pergunta contextualizada. */
  const view = vista();
  for (const requisito of view.observed.authorityEvidence.specialistReviewRequirements) {
    assert.match(requisito.requirementId, /^specialist:/);
    assert.ok(requisito.topic.length > 3);
    assert.equal(/atilde|eacute|ccedil|oacute|aacute/.test(requisito.topic), false, requisito.topic);
  }
});

/* ==========  P, Q, R, S e T · RELATÓRIO, PROVIDER E GATE 15  ========== */

test("GATE 14.1 · P — o Relatório lê o estado da Pesquisa sem renderizar o painel dela", () => {
  const bloco = areaBlock("relatorio");
  assert.match(bloco, /ReportSummaryPanel/);
  assert.match(bloco, /RadarR6ReportPanel/);
  assert.doesNotMatch(bloco, /<DeepResearch|RadarR3SerpPanel/, "REPORT_DUPLICATES_RESEARCH_PANEL = NO");

  /* Ele lê o estado pela projeção, que recebe a view — não montando o painel. */
  const view = vista();
  const resumo = buildRadarReportSummary({ observed: view.observed, view, videos: { registered: 2, transcribed: 0 } });
  assert.ok(resumo.checks.some(item => item.id === "research"));

  /* E Vídeos entra no relatório com estado próprio, sem virar exigência. */
  const comVideos = resumo.checks.find(item => item.id === "videos");
  assert.equal(comVideos?.state, "PENDING");
  assert.match(comVideos?.detail || "", /transcrição ainda não existe/);
  const semVideos = buildRadarReportSummary({ observed: view.observed, view }).checks.find(item => item.id === "videos");
  assert.equal(semVideos?.state, "NOT_REQUIRED", "Vídeos não é exigido de todo Article");
});

test("GATE 14.1 · Q, R e S — abrir, trocar de área ou renderizar não pesquisa nem recalcula", () => {
  for (const caminho of [
    "../modules/radar/radar-r3-workbench.tsx",
    "../modules/radar/radar-r3-videos-panel.tsx",
    "../modules/radar/radar-r3-specialist-panel.tsx",
  ]) {
    const fonte = ler(caminho);
    assert.doesNotMatch(fonte, /useEffect/, `${caminho}: nenhum efeito`);
    assert.doesNotMatch(fonte, /\bfetch\(/, `${caminho}: nenhuma rede`);
  }

  /* Trocar de área é setState, e mais nada. */
  assert.match(workbench(), /onToggle=\{\(\) => setExpandedArea\(current => current === area \? null : area\)\}/);

  /* E nenhum modelo de domínio é reconstruído no React. */
  for (const construtor of ["buildRadarCompetitiveObservedModel", "buildRadarSemanticConceptModel", "buildRadarAuthorityEvidence", "buildRadarAiDiscoveryContext", "buildRadarDeepResearchView"]) {
    assert.equal(workbench().includes(construtor), false, construtor);
    assert.equal(videos().includes(construtor), false, construtor);
  }
});

test("GATE 14.1 · T — o congelamento do Gate 15 continua intacto", () => {
  const view = vista();
  assert.equal(view.finalizedBundle, null, "sem congelar, não há bundle");
  assert.ok(view.finalization, "e a prontidão continua sendo lida pela autoridade do Gate 15");

  const fonte = workbench();
  assert.match(fonte, /data-testid="radar-frozen-bundle"/, "o bloco do congelado continua");
  assert.match(fonte, /view\.finalizedBundle/);

  /* O reset continua sendo a única saída explícita — e continua discreto. */
  assert.match(fonte, /data-testid="radar-reset-investigation"/);
});
