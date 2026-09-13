import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyRadarTopic, classifyRadarTopics, radarTopicIsNoise, radarTopicsOfClass } from "../lib/radar/topic-classification.ts";
import { RadarCompetitiveModelSchema, buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarSerpSynthesis } from "../lib/radar/serp-synthesis.ts";
import { radarExtractionBatches } from "../lib/radar/extraction-request.ts";
import { RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";

/*
 * ESCOLHER SETE REFERÊNCIAS NÃO SÃO SETE DECISÕES EDITORIAIS.
 *
 * Cada clique em Concorrente/Apoio/Ignorar criava uma versão remota, reabria a
 * análise e devolvia o mesmo aviso: "Curadoria atualizada; a análise derivada
 * foi reaberta". No fim, a saída recomendava "cobrir Buscar produtos com
 * profundidade" — vitrine promovida a estratégia.
 *
 * Estes testes fixam as duas correções: a curadoria vira rascunho até a
 * confirmação, e "apareceu uma vez" deixa de virar lacuna por aritmética.
 */
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const painel = () => ler("../modules/radar/radar-r3-serp-panel.tsx");
const page = () => ler("../modules/radar/radar-page.tsx");

/* ------------------------------- A, B e C -------------------------------- */

test("A · classificar não escreve: marcar sete referências não produz write nenhum", () => {
  const fonte = painel();
  // O clique alimenta o rascunho local; nada além disso.
  assert.ok(fonte.includes("const changeDecision = (key: string, role: SerpCurationRole) =>"));
  assert.ok(fonte.includes("setDraft(current => ({ ...current, [key]: { role"));
  assert.doesNotMatch(fonte, /onDecisionChange/);
  assert.doesNotMatch(fonte, /onDecisionReasonChange/);

  const fontePage = page();
  assert.doesNotMatch(fontePage, /const persistSerpDecision/);
  assert.doesNotMatch(fontePage, /Curadoria atualizada; a análise derivada foi reaberta/);
});

test("B · confirmar a seleção é uma escrita, um readback e um aviso", () => {
  const fonte = page();
  const inicio = fonte.indexOf("const confirmSerpCuration = async");
  const fim = fonte.indexOf("const startSerpAnalysis = async") > inicio
    ? fonte.indexOf("const startSerpAnalysis = async")
    : fonte.indexOf("const analyzeSerpSelection = async");
  const corpo = fonte.slice(inicio, fim > inicio ? fim : inicio + 4000);

  assert.ok(inicio > 0, "a confirmação existe");
  assert.equal((corpo.match(/createRadarAnalysisSuccessor/g) || []).length, 1, "uma sucessora");
  assert.equal((corpo.match(/persistSerpAnalysis/g) || []).length, 1, "uma persistência");
  assert.ok(corpo.includes("Seleção confirmada:"), "um aviso, com o número confirmado");
  // O readback é quem decide, e ele vive no persistSerpAnalysis compartilhado.
  assert.match(fonte, /saved\.persistenceMode === "remote" && saved\.readbackConfirmed/);
});

test("C · confirmar sem alteração não escreve nada", () => {
  const fonte = page();
  const inicio = fonte.indexOf("const confirmSerpCuration = async");
  const corpo = fonte.slice(inicio, inicio + 4000);
  const saida = corpo.indexOf("if (!changes.length)");
  assert.ok(saida > 0, "a saída antecipada existe");
  for (const escrita of ["createRadarAnalysisSuccessor", "claimSerpAction", "persistSerpAnalysis"]) {
    const posicao = corpo.indexOf(escrita);
    assert.ok(posicao > saida, `${escrita} só acontece depois da saída sem alteração`);
  }

  // A tela também não oferece o botão quando não há o que confirmar.
  assert.ok(painel().includes("const confirmacao: RadarSerpTabAction | null = alteracoes.length ?"));
});

/* ------------------------------- D, E e F -------------------------------- */

test("D · sete selecionadas produzem uma análise lógica, em lotes invisíveis", () => {
  assert.deepEqual(radarExtractionBatches(Array.from({ length: 7 }, (_, index) => index)).map(lote => lote.length), [5, 2]);

  /*
   * O QUE ESTE TESTE SEMPRE PROTEGEU: LOTE NÃO É VERSÃO.
   *
   * Sete selecionadas viram dois lotes de rede, e isso é detalhe de transporte:
   * o histórico não pode ganhar uma versão por lote, nem a tela piscar entre
   * eles. A garantia real é que NADA é gravado dentro do laço — e é isso que se
   * verifica aqui, em vez de contar escritas na função inteira.
   *
   * O GATE 18.1 mudou a contagem, não a garantia. O ANALYZE passou a ter dois
   * marcos gravados, ambos DEPOIS do laço fechar: a AMOSTRA (as páginas lidas)
   * e a EVIDÊNCIA (fontes verificadas e relatório). A amostra precisa estar
   * persistida antes da verificação porque o servidor resolve cada `sourceId` a
   * partir do que está gravado — sem isso, as fontes descobertas na rodada
   * viram SOURCE_UNKNOWN, que foi exatamente o que o primeiro smoke real viu.
   */
  const fonte = page();
  const inicio = fonte.indexOf("const analyzeSerpSelection = async");
  const corpo = fonte.slice(inicio, fonte.indexOf("const reviewSerpForArticle = async"));

  /*
   * AS DUAS ÂNCORAS SÃO EXIGIDAS ANTES DO CORTE — RADAR 18.10.1.
   *
   * `indexOf` devolve -1 quando não acha, e `slice(inicio, -1)` recorta até o
   * fim do arquivo menos um caractere: a fatia engoliria a função inteira e o
   * teste reprovaria por um motivo que não é o seu. Foi o que aconteceu quando
   * a guarda virou `!pages.length && !retomandoConsolidacao`.
   */
  const inicioDoLaco = corpo.indexOf("let fila = retomandoConsolidacao");
  const fimDoLaco = corpo.indexOf("if (!pages.length && !retomandoConsolidacao) throw new Error");
  assert.notEqual(inicioDoLaco, -1, "âncora inicial do laço");
  assert.notEqual(fimDoLaco, -1, "âncora final do laço");
  const laco = corpo.slice(inicioDoLaco, fimDoLaco);
  assert.ok(laco.length > 200, "o laço de lotes existe");
  for (const escrita of ["createRadarAnalysisSuccessor", "saveRadarAnalysis", "persistSerpAnalysis"]) {
    assert.ok(!laco.includes(escrita), `${escrita} não pode acontecer dentro do laço de lotes`);
  }

  /* Depois do laço: dois marcos nomeados, e nenhum a mais. */
  assert.equal((corpo.match(/createRadarAnalysisSuccessor/g) || []).length, 2, "a amostra e a evidência");
  /*
   * GATE 18.10.1 · a amostra pode já existir no servidor.
   *
   * Numa rodada nova ela é criada aqui; numa retomada, a versão remota já é a
   * amostra (as páginas gravadas) e criar outra idêntica só para reconquistar
   * um readback que ela já tem seria trabalho por trabalho. Os dois marcos
   * continuam sendo dois, e continuam fora do laço.
   */
  assert.match(corpo, /let versaoDaAmostra: RadarAnalysisVersion;/);
  assert.match(corpo, /versaoDaAmostra = await createRadarAnalysisSuccessor\(data\.analysis, amostraPayload,/, "na rodada normal a amostra nasce da versão corrente");
  assert.match(corpo, /createRadarAnalysisSuccessor\(versaoDaAmostra, \{ \.\.\.candidatePayload/);
});

test("E · lote parcial não promove modelo, relatório nem necessidades", () => {
  const fonte = page();
  const fimDoLoop = fonte.indexOf("if (!pages.length && !retomandoConsolidacao) throw new Error");
  assert.ok(fimDoLoop > 0);
  // Tudo que vira resultado corrente é construído DEPOIS do último lote.
  for (const marco of ["const benchmark = buildRadarBenchmark", "buildRadarCompetitiveReport({", "createRadarAnalysisSuccessor(versaoDaAmostra, { ...candidatePayload"]) {
    assert.ok(fonte.indexOf(marco) > fimDoLoop, `${marco} só acontece com a amostra fechada`);
  }
  /*
   * E a gravação da amostra também é posterior ao último lote: ela fecha a
   * leitura das páginas, não promove resultado parcial. Modelo, relatório e
   * necessidades continuam vindo depois dela.
   */
  const gravaAmostra = fonte.indexOf("let versaoDaAmostra: RadarAnalysisVersion;");
  assert.ok(gravaAmostra > fimDoLoop, "a amostra é gravada com o laço fechado");
  assert.ok(fonte.indexOf("const benchmark = buildRadarBenchmark") > gravaAmostra, "e o modelo vem depois dela");
  // O progresso é visível sem virar conclusão.
  assert.ok(fonte.includes("Analisando páginas ${processadas} de ${candidates.length}"));
});

test("F · o resultado final usa o conjunto completo, e a falha parcial é dita", () => {
  const fonte = page();
  assert.ok(fonte.includes("const pages: RadarExtractionPage[] = [];"), "as páginas acumulam entre lotes");
  assert.ok(fonte.includes("pages.push(parsed.data)"));
  /*
   * A frase virou uma lista montada, para a sobra aparecer em vez de sumir na
   * diferença entre dois números. As contas separadas continuam obrigatórias.
   */
  for (const conta of [
    "${membership.selected} selecionada(s)",
    "${membership.reused} reutilizada(s)",
    "${pages.length} analisada(s) agora",
    "${falhas.length} sem acesso",
    "${semDesfecho} sem desfecho nesta rodada",
  ]) assert.ok(fonte.includes(conta), `a conta "${conta}" precisa aparecer separada`);
  assert.ok(fonte.includes("membership.selected - (membership.reused + pages.length + falhas.length)"), "a sobra é calculada, não presumida");
  assert.ok(fonte.includes("página(s) pendente(s) pôde ser analisada"), "pendente nunca é chamado de selecionada");
});

/* -------------------------------- G e H ---------------------------------- */

test("G · editar a curadoria depois não muda a análise até uma nova confirmação", () => {
  const fonte = painel();
  // O rascunho só some quando a versão da análise muda — ou seja, no readback.
  assert.ok(fonte.includes("if (draftVersion !== (analysis?.versionId ?? null)) { setDraftVersion(analysis?.versionId ?? null); setDraft({}); }"));
  assert.ok(fonte.includes("alteração(ões) ainda não confirmada(s). Nada foi gravado até você confirmar."));
  // Enquanto houver rascunho, a ação de qualquer outra aba aponta para confirmar.
  assert.ok(fonte.includes('confirmacao && activeTab !== "competitors"'));
});

test("H · confirmar nova seleção invalida a análise anterior", () => {
  const fonte = page();
  const inicio = fonte.indexOf("const confirmSerpCuration = async");
  const corpo = fonte.slice(inicio, inicio + 4000);
  for (const campo of ["benchmark: null", "semanticTerms: []", "competitiveReport: null", "plannerPackage: null"]) {
    assert.ok(corpo.includes(campo), `${campo} zera a leitura derivada da seleção anterior`);
  }
  assert.ok(corpo.includes("const retainedExtractions = data.analysis.payload.extractions.filter(page => selectedUrls.has(page.url))"),
    "extração de página removida da seleção não sobrevive");
});

/* -------------------------------- I e J ---------------------------------- */

const ocorrencia = (url: string) => [{ pageId: "p1", url, title: "Página", level: 2 as const }];

test("I · bloco de vitrine em 1 de 7 páginas não vira lacuna competitiva", () => {
  const contexto = { query: "serum facial principia", principal: "serum facial principia" };
  const vitrine = ["Buscar produtos", "Disponível nos kits", "Descrição do produto", "Aproveite também", "Adicione ao carrinho"];

  for (const topico of vitrine) {
    const item = classifyRadarTopic({ topic: topico, pages: 1, sampleSize: 7, occurrences: ocorrencia("https://loja.com.br/p"), context: contexto });
    assert.notEqual(item.classification, "COMPETITIVE_GAP", `${topico} não é lacuna`);
    assert.equal(radarTopicIsNoise(topico), true);
  }

  // Ficha de produto — volume, percentual e código — também é vitrine.
  const ficha = classifyRadarTopic({ topic: "Sérum Facial Ah-2 Ácido Hialurônico 30ml", pages: 1, sampleSize: 7, context: contexto });
  assert.equal(ficha.classification, "PAGE_SPECIFIC_NOISE");

  // Tema sem relação nenhuma fica isolado — não é ruído, mas também não é lacuna.
  const isolado = classifyRadarTopic({ topic: "Receita de bolo de cenoura", pages: 1, sampleSize: 7, context: contexto });
  assert.equal(isolado.classification, "ISOLATED_TOPIC");
  assert.equal(isolado.relevance.query, false);
});

test("J · tema relacionado e pouco coberto vira lacuna, com o motivo e a proveniência", () => {
  const item = classifyRadarTopic({
    topic: "Como aplicar o sérum na rotina noturna",
    pages: 1,
    sampleSize: 7,
    occurrences: ocorrencia("https://exemplo.com.br/rotina"),
    context: { query: "serum facial principia", principal: "serum facial principia" },
  });
  assert.equal(item.classification, "COMPETITIVE_GAP");
  assert.equal(item.relevance.query, true);
  assert.match(item.reason, /coberto por apenas 1 de 7/);
  assert.equal(item.occurrences[0].url, "https://exemplo.com.br/rotina");

  // Contexto editorial declarado também sustenta a promoção.
  const porContexto = classifyRadarTopic({
    topic: "Camadas de hidratação",
    pages: 1,
    sampleSize: 7,
    context: { query: "serum facial", editorialTopics: ["hidratação da pele"] },
  });
  assert.equal(porContexto.classification, "COMPETITIVE_GAP");
  assert.equal(porContexto.relevance.editorial, true);
});

test("o que se repete na maioria é padrão, não lacuna", () => {
  const classificados = classifyRadarTopics([
    { topic: "Benefícios do sérum facial", pages: 5, sampleSize: 7 },
    { topic: "Buscar produtos", pages: 1, sampleSize: 7 },
    { topic: "Como usar o sérum", pages: 1, sampleSize: 7 },
  ], { query: "serum facial principia" });

  assert.deepEqual(radarTopicsOfClass(classificados, "RECURRENT_TOPIC").map(item => item.topic), ["Benefícios do sérum facial"]);
  assert.deepEqual(radarTopicsOfClass(classificados, "PAGE_SPECIFIC_NOISE").map(item => item.topic), ["Buscar produtos"]);
  assert.deepEqual(radarTopicsOfClass(classificados, "COMPETITIVE_GAP").map(item => item.topic), ["Como usar o sérum"]);
});

/* ------------------------- síntese antes dos números ---------------------- */

const pagina = (position: number, headings: Array<{ level: 1 | 2 | 3; text: string }>) => RadarExtractionPageSchema.parse({
  id: `page-${position}`, url: `https://exemplo-${position}.com.br/pagina`, status: "success",
  fetchedAt: "2026-09-07T16:00:00.000Z", title: `Página ${position}`, metaDescription: "", canonical: null,
  h1: ["Sérum facial"], h2: headings.filter(item => item.level === 2).map(item => item.text), h3: [],
  wordCount: 1200 + position * 20, internalLinkCount: 5, externalLinkCount: 2, listCount: 3, tableCount: 0,
  faqCount: 0, imageCount: 4, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
  structuredDataTypes: ["Article"], recurringTerms: [], boldCount: 10, italicCount: 0, error: "",
  headingOutline: headings, paragraphCount: 12, paragraphWordCounts: [80, 60], introWordCount: 80,
  closingWordCount: 60, hasClosing: true,
});

test("a síntese fala em frases, e a vitrine sai da leitura editorial", () => {
  const comuns = [{ level: 2 as const, text: "Benefícios do sérum facial" }];
  const pages = [1, 2, 3].map(position => pagina(position, position === 3
    ? [...comuns, { level: 2 as const, text: "Buscar produtos" }]
    : comuns));

  const model = buildRadarCompetitiveModel({ pages, query: "serum facial principia", observedIntent: "informacional", principal: "serum facial principia" });
  const resumo = buildRadarSerpSynthesis(model);

  assert.equal(resumo.sample.analyzed, 3);
  assert.ok(resumo.recurringTopics.some(item => item.startsWith("Benefícios do sérum facial")));
  assert.ok(resumo.setAside.includes("Buscar produtos"), "a vitrine aparece nomeada, fora da pauta");
  assert.equal(resumo.underCovered.some(item => item.startsWith("Buscar produtos")), false);
  assert.equal(model.gaps.some(gap => gap.description.includes("Buscar produtos")), false);
  assert.equal(model.opportunities.some(item => item.description.includes("Buscar produtos")), false);

  // A fronteira continua: a síntese descreve a amostra, não prescreve o artigo.
  const texto = JSON.stringify(resumo);
  for (const proibido of ["nosso artigo", "deve ter", "requiredH2Count", "requiredWordCount"]) {
    assert.equal(texto.includes(proibido), false, `a síntese não pode dizer ${proibido}`);
  }
});

test("o resumo vem antes dos dados técnicos, e os técnicos ficam recolhidos", () => {
  const fonte = painel();
  assert.ok(fonte.includes('data-testid="radar-serp-summary"'));
  assert.ok(fonte.includes("Ver dados técnicos da amostra"));
  assert.ok(fonte.indexOf("<SerpSummary model={modeloCompetitivo} />") < fonte.indexOf("Ver dados técnicos da amostra"));
  assert.ok(fonte.indexOf("Ver dados técnicos da amostra") < fonte.indexOf("<CompetitiveModel model={modeloCompetitivo} />"));
});

/* ----------------------- o campo novo é aditivo -------------------------- */

test("modelo gravado antes da classificação continua parseando", () => {
  const comuns = [{ level: 2 as const, text: "Benefícios do sérum facial" }];
  const model = buildRadarCompetitiveModel({ pages: [1, 2].map(position => pagina(position, comuns)), query: "serum facial principia" });

  /*
   * O modelo persistido nas versões 8 e 9 do smoke não tinha `classifiedTopics`
   * — o campo nasceu depois. Sem `.default([])`, a versão inteira da análise
   * virava registro incompatível e a recuperação recusava a linha.
   */
  const { classifiedTopics: _ignorado, ...gravadoAntes } = model;
  const relido = RadarCompetitiveModelSchema.parse(gravadoAntes);
  assert.deepEqual(relido.classifiedTopics, []);
  assert.equal(relido.sample.analyzed, 2);

  // O que existe hoje continua sobrevivendo ao round-trip inteiro.
  assert.deepEqual(RadarCompetitiveModelSchema.parse(model), model);
});
