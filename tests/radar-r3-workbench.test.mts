import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RadarItem } from "../lib/editorial/operational-flow.ts";
import { buildRadarR3Model, deriveRadarR3NextAction, RADAR_R3_AREAS } from "../lib/radar/r3-workbench.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";
import type { RadarWorkbenchReferenceCounts } from "../lib/radar/workbench.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const counts: RadarWorkbenchReferenceCounts = { total: 2, primary: 1, support: 0, format: 0, pending: 1, excluded: 0, own: 0 };
const row = { brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-dna-v1", siloId: "silo-1", title: "Artigo do Radar", hierarchy: "pillar", intent: "informacional", updatedAt: "2026-08-25T12:00:00.000Z" } as RadarItem;
type TestArticleEnvelope = NonNullable<Parameters<typeof buildRadarR3Model>[0]["article"]>;
const article = { versionNumber: 1, payload: { promise: "Artigo do Radar", mainIntent: "informacional", keywordReferences: [] } } as unknown as TestArticleEnvelope;
const view = { provider: "dataforseo", capturedAt: "2026-08-25T12:00:00.000Z", organicResults: [{ position: 1, title: "Resultado", domain: "example.com", url: "https://example.com/artigo" }], peopleAlsoAsk: [], relatedSearches: [], diagnostic: null, record: { id: "snapshot-1" } } as unknown as RadarSerpView;

test("R3 mantém as quatro áreas centrais na ordem operacional", () => {
  /*
   * GATE 14 · Amazon deixou de ser um lugar e virou um destino da Pesquisa.
   *
   * Enquanto havia um card por destino, a tela descrevia a implementação: quem
   * opera pesquisa uma vez, no modo que escolheu. O Relatório entrou porque é
   * uma pergunta feita todos os dias e vivia solta no fim da tela.
   */
  assert.deepEqual(RADAR_R3_AREAS, ["pesquisa", "videos", "especialista", "relatorio"]);
});

test("R3 usa os dados reais disponíveis da SERP no Workbench, tabela e perfil", () => {
  const model = buildRadarR3Model({ row, article, keyword: "keyword principal", silo: "Silo principal", publication: "Ainda não publicado", view, records: [], analysis: null, referenceCounts: counts, references: [{ key: "organic:1:https://example.com/artigo", position: 1, title: "Resultado", domain: "example.com", url: "https://example.com/artigo", role: "primary", state: "included" }], analysisQueue: 0, pagesAnalyzed: 0, reportGenerated: false, reportApproved: false, sentToPlanner: false, serpStatus: "Coletada" });
  assert.equal(model.serp.provider, "dataforseo");
  assert.equal(model.serp.resultCount, 1);
  assert.equal(model.serp.references[0].role, "primary");
  assert.equal(model.provenance.brandId, "brand-1");
  assert.equal(model.provenance.articleDnaVersionId, "article-dna-v1");
  assert.equal(model.content.rows.find(item => item.area === "SERP")?.state, "observado");
  assert.match(model.nextAction, /referência/i);
});

test("próxima ação R3 respeita a sequência e não bloqueia por Amazon ou especialista opcionais", () => {
  const input = { identityReady: true, serpCollected: true, referencesPending: 0, analysisStarted: true, analysisQueue: 0, pagesAnalyzed: 2, amazonStatus: "not_applicable" as const, amazonNeedsReview: false, specialistSelected: false, specialistPending: 0, reportGenerated: true, reportApproved: false, sentToPlanner: false };
  // R9.4B: o verbo final passou a nomear a investigação, não o objeto relatório.
  assert.match(deriveRadarR3NextAction(input), /aprove a investigação/i);
  assert.match(deriveRadarR3NextAction({ ...input, reportGenerated: false }), /Gere o relatório competitivo/i);
  assert.match(deriveRadarR3NextAction({ ...input, serpCollected: false }), /Colete/i);
  assert.match(deriveRadarR3NextAction({ ...input, reportApproved: true }), /Planejador/i);
});

test("R3 expande uma área por vez e mantém Amazon sem API/ProductEvidence", () => {
  const workbench = read("../modules/radar/radar-r3-workbench.tsx");
  const amazon = read("../modules/radar/radar-r3-amazon-panel.tsx");
  assert.match(workbench, /useState<RadarR3Area \| null>\(null\)/);
  assert.match(workbench, /current === area \? null : area/);
  assert.match(workbench, /aria-expanded=\{expanded\}/);
  /* GATE 15.3: a Pesquisa abre CONSULTA, não o workflow de seis abas. */
  assert.doesNotMatch(workbench, /RadarR3SerpPanel/);
  assert.match(workbench, /RadarR3ResearchDetails/);
  assert.match(workbench, /RadarR3AmazonPanel/);
  assert.match(workbench, /RadarR3ContentDossier/);
  assert.match(workbench, /RadarR3SpecialistPanel/);
  assert.doesNotMatch(workbench, /ReportBlock/);
  assert.doesNotMatch(workbench, /RadarActivitySummary/);
  assert.doesNotMatch(amazon, /fetch\(/);
  assert.match(amazon, /Não aplicável/);
  assert.match(amazon, /fixture demonstrativa local/i);
});

test("R3.1 remove o detalhe global e a faixa Área ativa sem remover os handlers de compatibilidade", () => {
  const workbench = read("../modules/radar/radar-r3-workbench.tsx");
  const profile = read("../modules/radar/radar-r3-profile-mirror.tsx");
  const page = read("../modules/radar/radar-page.tsx");
  assert.doesNotMatch(workbench, /Detalhe compatível/);
  assert.doesNotMatch(workbench, /Área ativa/);
  assert.doesNotMatch(workbench, /Próxima ação: \{model\.nextAction\}/);
  assert.doesNotMatch(profile, /Detalhe compatível/);
  assert.match(page, /buildRadarArticleHref/);
  assert.match(page, /onOpenDetail=\{openDetail\}/);
});

test("R3.1 apresenta semântica editorial no Conteúdo e recolhe IDs na proveniência", () => {
  const model = buildRadarR3Model({ row, article, keyword: "keyword principal", silo: "Manicure", publication: "Ainda não publicado", view, records: [], analysis: null, referenceCounts: counts, references: [{ key: "organic:1:https://example.com/artigo", position: 1, title: "Resultado", domain: "example.com", url: "https://example.com/artigo", role: "primary", state: "included" }], analysisQueue: 0, pagesAnalyzed: 0, reportGenerated: false, reportApproved: false, sentToPlanner: false, serpStatus: "Coletada" });
  assert.equal(model.content.rows.find(item => item.data === "Silo")?.value, "Manicure");
  assert.equal(model.content.rows.find(item => item.data === "SiloDNA")?.value, "Preservado");
  assert.equal(model.content.technical.siloId, "silo-1");
  const content = read("../modules/radar/radar-r3-content-dossier.tsx");
  assert.match(content, /Proveniência e detalhes técnicos/);
  assert.match(content, /model\.technical\.siloId/);
  assert.doesNotMatch(content, /data: "SiloDNA", value: input\.row\.siloId/);
});

test("R3.2 mantém a CAMADA DO ARTIGO vazia até existir artigo selecionado", () => {
  const workbench = read("../modules/radar/radar-r3-workbench.tsx");
  const page = read("../modules/radar/radar-page.tsx");

  /*
   * A PREMISSA MUDOU NO §2.3.2 — e mudou de propósito.
   *
   * "Workbench vazio sem artigo" valia quando as quatro áreas eram do artigo.
   * Vídeos deixou de ser: a biblioteca é da MARCA, e trancá-la atrás de uma
   * seleção de artigo foi o defeito que o USER relatou. O que este teste
   * protege continua valendo para as TRÊS áreas que dependem mesmo de artigo.
   */
  assert.match(workbench, /Selecione um artigo para trabalhar/);
  assert.match(workbench, /disabled aria-disabled="true"/);
  assert.match(workbench, /radar-r3-card-\$\{area\}-disabled/);
  assert.doesNotMatch(workbench, /Aguardando artigo selecionado/);
  assert.doesNotMatch(workbench, /Expandir no Workbench/);

  /* Só Vídeos escapa do desabilitado, e está escrito assim. */
  assert.match(workbench, /area === "videos"\s*\r?\n\s*\? <AreaCard[^\n]*copy=\{copyDeVideos\}/);
  assert.match(workbench, /: <DisabledAreaCard key=\{area\} area=\{area\} \/>\)\}/);

  /*
   * E A KEY SAIU DA PÁGINA. Ela remontava o Workbench inteiro a cada troca de
   * artigo — inclusive a biblioteca da marca, que não tem nada com isso. A
   * remontagem ficou nos painéis do artigo, onde o rascunho é de um só.
   */
  assert.doesNotMatch(page, /<RadarWorkbench key=/);
  assert.match(workbench, /\{expandedArea === "pesquisa" && <div key=\{model\.articleId\}/);
  assert.match(workbench, /\{expandedArea === "especialista" && <div key=\{model\.articleId\}/);
  assert.match(workbench, /\{expandedArea === "relatorio" && <div key=\{model\.articleId\}/);

  assert.doesNotMatch(page, /fallbackId: pipeline\.radarItems\[0\]/);
});

test("R4 mantém identidade, quatro cards fixas e relatório fora do estado fechado", () => {
  const workbench = read("../modules/radar/radar-r3-workbench.tsx");
  const page = read("../modules/radar/radar-page.tsx");
  assert.match(workbench, /data-testid=\{`radar-r3-card-\$\{area\}`\}/);
  /*
   * GATE 14 · o card é SUMMARY, não painel.
   *
   * A altura mínima de oito linhas existia para caber uma frase explicativa
   * que ninguém lê duas vezes. Agora a altura é a do conteúdo — e o piso é o
   * guard que impede a frase de voltar.
   */
  assert.doesNotMatch(workbench, /min-h-28|min-h-32/, "o card não reserva altura para texto explicativo");
  assert.doesNotMatch(workbench, /Prévia consolidada/);
  assert.match(workbench, /StatusMark/);
  /*
   * GATE 14.1 · o fundamento voltou ao cabeçalho — em uma linha, não em grade.
   *
   * O guard antigo proibia keyword/silo/hierarquia no Workbench porque eles
   * vinham como a grade de seis colunas do layout legado. A faixa de contexto é
   * o oposto disso: uma linha, sem `<dl>`, sem card, e sem nenhum handler.
   */
  assert.match(workbench, /data-testid="radar-article-context-band"/);
  assert.doesNotMatch(workbench, /<ContextValue/, "a grade de contexto legada não volta");
  const faixa = workbench.slice(workbench.indexOf("function ArticleContextBand"), workbench.indexOf("O RELATÓRIO RESPONDE PERGUNTAS"));
  assert.doesNotMatch(faixa, /onClick|onChange|onToggle/, "ARTICLE_DNA_READ_ONLY: a faixa não recebe handler");
  assert.match(page, /activeArticleId/);
  assert.match(page, /selectedArticleIds/);
  assert.match(page, /bulkSelectedRowIds=\{bulkSelectedRowIds\}/);
  assert.match(page, /onBulkSelectionChange=\{handleBulkSelectionChange\}/);
  assert.match(page, /activeRowId=\{activeRadarRowId\}/);
  assert.match(page, /onRowActivate=\{handleRowActivate\}/);
  assert.match(page, /renderBulkBar=/);
  assert.match(page, /min-h-0 flex-1 flex-col/);
});

test("R3.2 deriva contexto independente para artigos com estágios diferentes", () => {
  const makeModel = (id: string, keyword: string, silo: string, resultCount: number, reportGenerated: boolean) => buildRadarR3Model({
    row: { ...row, id, articleId: id, articleDnaVersionId: `${id}-version` } as RadarItem,
    article: { ...article, entityId: `${id}-entity`, payload: { ...article.payload, promise: `Artigo ${id}` } } as never,
    keyword,
    silo,
    publication: "Ainda não publicado",
    view: resultCount ? { ...view, organicResults: Array.from({ length: resultCount }, (_, index) => ({ position: index + 1, title: `${id} resultado`, domain: "example.com", url: `https://example.com/${id}/${index + 1}` })) } as unknown as RadarSerpView : null,
    records: [],
    analysis: null,
    referenceCounts: { ...counts, total: resultCount },
    references: [],
    analysisQueue: 0,
    pagesAnalyzed: 0,
    reportGenerated,
    reportApproved: false,
    sentToPlanner: false,
    serpStatus: resultCount ? "Coletada" : "Não coletada",
  });
  const modelA = makeModel("article-a", "keyword A", "Silo A", 2, false);
  const modelB = makeModel("article-b", "keyword B", "Silo B", 8, true);
  const modelC = makeModel("article-c", "keyword C", "Silo C", 0, false);
  assert.equal(modelA.articleId, "article-a");
  assert.equal(modelA.serp.resultCount, 2);
  assert.equal(modelB.articleId, "article-b");
  assert.equal(modelB.serp.resultCount, 8);
  assert.equal(modelC.articleId, "article-c");
  assert.equal(modelC.serp.resultCount, 0);
  assert.notEqual(modelA.keyword, modelB.keyword);
  assert.notEqual(modelB.silo, modelC.silo);
});

test("R3 mantém a tabela utilizável abaixo do Workbench expandido", () => {
  const page = read("../modules/radar/radar-page.tsx");
  assert.match(page, /flex min-h-screen flex-col bg-background/);
  assert.match(page, /flex min-h-0 flex-1 flex-col/);
});

test("R3 mantém o material da marca separado do dossiê do Article", () => {
  const page = read("../modules/radar/radar-page.tsx");
  const specialist = read("../modules/radar/radar-r3-specialist-panel.tsx");
  const videos = read("../modules/radar/radar-r3-videos-panel.tsx");
  const content = read("../modules/radar/radar-r3-content-dossier.tsx");
  assert.match(page, /model=\{activeWorkbenchData\?\.r3 \|\| null\}/);
  assert.match(page, /r3=\{rowWorkbenchData\(row\)\.r3\}/);

  /*
   * GATE 14.1 · registrar um vídeo não é falar com um profissional.
   *
   * O formulário de material vivia dentro do Especialista, que passava a
   * carregar um processo que não é dele. Ele mudou para Vídeos inteiro —
   * mesmos handlers, mesmo estado.
   */
  assert.match(videos, /YouTube/);
  assert.equal(/YouTube/.test(specialist), false, "o Especialista não registra material");
  assert.match(specialist, /Telegram real/, "e continua dono do canal com a pessoa");

  assert.match(content, /ArticleDNA/);
  assert.match(content, /model\.rows/);
  assert.match(content, /não altera ArticleDNA/);
});

test("Radar não confunde identidade técnica da linha com identidade editorial do artigo", () => {
  const page = read("../modules/radar/radar-page.tsx");
  assert.match(page, /const localState = localStateFor\(row\.articleId\)/);
  assert.match(page, /return \{ articleId: row\.articleId,/);
  assert.match(page, /const radarItemForArticleId = \(articleId: string\) => pipeline\.radarItems\.find\(row => row\.articleId === articleId\)/);
  assert.match(page, /const rows = ids\.map\(id => radarItemForArticleId\(id\)\)/);
  assert.match(page, /pipeline\.collectSerp\(row\.articleId, [\s\S]*row\.articleDnaVersionId\)/);
  assert.match(page, /topicSuggestionsToRadarTopics\(row\.articleId, suggestions\)/);
  assert.match(page, /canUndoTopics=\{Boolean\(activeRadarItem && topicHistoryByArticle\[activeRadarItem\.articleId\]/);
});

test("R3 não chama providers ao renderizar e preserva os handlers contextuais", () => {
  const files = ["../modules/radar/radar-r3-workbench.tsx", "../modules/radar/radar-r3-serp-panel.tsx", "../modules/radar/radar-r3-amazon-panel.tsx", "../modules/radar/radar-r3-content-dossier.tsx", "../modules/radar/radar-r3-specialist-panel.tsx", "../modules/radar/radar-r3-profile-mirror.tsx"].map(read).join("\n");
  const page = read("../modules/radar/radar-page.tsx");
  assert.doesNotMatch(files, /fetch\(/);
  assert.doesNotMatch(files, /useEffect\(/);
  assert.match(page, /onOpenDetail=\{openDetail\}/);
  assert.match(page, /onOpenDetail=\{openDetail\}/);
});
