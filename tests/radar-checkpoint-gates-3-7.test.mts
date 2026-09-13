import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import { autoDecideRadarReference, buildRadarAutomaticResearchCuration } from "../lib/radar/research-auto-selection.ts";
import { buildRadarResearchCurationView } from "../lib/radar/research-curation.ts";
import { buildRadarResearchReferences, radarNormalizedUrl } from "../lib/radar/research-reference.ts";
import { buildRadarCompetitorUniverse } from "../lib/radar/competitor-universe.ts";
import { buildRadarAnalysisMembership } from "../lib/radar/analysis-membership.ts";
import { radarExtractionFailureIsRecoverable, radarExtractionLimitation, radarExtractionRetryQueue, RADAR_EXTRACTION_MAX_ATTEMPTS } from "../lib/radar/extraction-retry.ts";
import { CompetitorExtractionError, extractCompetitorPage } from "../lib/radar/competitor-extractor.ts";
import type { RadarDeepResearchRecord } from "../lib/radar/deep-research.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarAnalysisVersion } from "../lib/radar/analysis-contracts.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";
import { RADAR_PHASE1_HANDLER } from "../lib/radar/operational-actions.ts";

/*
 * ============  CHECKPOINT FORMAL · GATES 3 A 7  =========================
 *
 * Auditoria, não reimplementação. Cada asserção aqui prova uma exigência da
 * Fase 1 sobre o código como ele está — e onde o código NÃO cumpre, o teste
 * descreve o comportamento real e o relatório reporta BLOCKED.
 */

const page = () => readFileSync("modules/radar/radar-page.tsx", "utf8");
const workbench = () => readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8");

/*
 * ======================  GATE 3 · TRÊS AÇÕES  ===========================
 */

const acao = (patch: Partial<Parameters<typeof radarPhase1Action>[0]>) => radarPhase1Action({
  state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false,
  selected: 18, pending: 0, failed: 0, analyzed: 16, ...patch,
});

test("GATE 3 · a ação principal muda de nome conforme o estado, e são só três", () => {
  /* RADAR 18.8 · §8 — o rótulo do START passou a nomear o destino da busca. */
  assert.equal(acao({ state: "NOT_STARTED", selected: 0, analyzed: 0 }).label, "Iniciar Pesquisa Google");
  assert.equal(acao({ pending: 12, analyzed: 6 }).label, "Analisar concorrência");
  assert.equal(acao({}).label, "Finalizar pesquisa");

  const fonte = readFileSync("lib/radar/serp-phase1.ts", "utf8");
  const ids = [...new Set([...fonte.matchAll(/id: "([A-Z_]+)"/g)].map(item => item[1]))].sort();
  assert.deepEqual(ids, ["ANALYZE_COMPETITION", "FINALIZE_SERP", "NONE", "START_RESEARCH"]);
});

test("GATE 3 · nenhum passo interno é oferecido como obrigação", () => {
  const fonte = readFileSync("lib/radar/serp-phase1.ts", "utf8");
  const rotulos = [...fonte.matchAll(/label: "([^"]+)"/g)].map(item => item[1]);
  for (const rotulo of rotulos) {
    for (const proibido of ["Confirmar seleção", "Aprovar curadoria", "Reprocessar", "páginas pendentes", "Aprovar investigação", "Iniciar análise competitiva"]) {
      assert.equal(rotulo.includes(proibido), false, `"${rotulo}" oferece um passo interno`);
    }
  }

  /*
   * A confirmação manual da curadoria continua existindo — mas só aparece
   * quando a pessoa MUDA alguma coisa. Ela nunca bloqueia o fluxo automático.
   */
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.ok(painel.includes("pesquisa?.dirtyCount ?"), "a confirmação depende de alteração humana");
});

test("GATE 3 · nenhuma ação operacional nasce de efeito, montagem ou troca de aba", () => {
  const fonte = page();
  for (const handler of ["startDeepResearch", "analyzeSerpSelection", "finalizeInvestigation", "resetRadarInvestigation", "collect"]) {
    assert.equal(new RegExp(`useEffect\\([^)]*${handler}`).test(fonte), false, `${handler} não pode ser disparado por useEffect`);
  }
  /* E cada um só existe atrás de um handler de clique. */
  assert.match(fonte, /onStartDeepResearch=\{\(\) => void startDeepResearch\(\)\}/);
  assert.match(fonte, /onAnalyzeSerpSelection=\{\(\) => void analyzeSerpSelection\(\)\}/);
  assert.match(fonte, /onFinalizeInvestigation=\{\(\) => void finalizeInvestigation\(\)\}/);

  /*
   * GATE 15.1 · a ligação ação→handler virou dado, e o dado é testado.
   *
   * A cadeia de `if` dentro do componente era onde "Finalizar" podia passar a
   * chamar a análise sem que nada quebrasse visivelmente. O mapa canônico vive
   * no domínio; a tela apenas o consulta.
   */
  const painel = workbench();
  assert.ok(painel.includes("RADAR_PHASE1_HANDLER[acao.id]"), "a tela consulta o mapa canônico");
  assert.equal(RADAR_PHASE1_HANDLER.START_RESEARCH, "START", "o clique é quem chama iniciar");
  assert.equal(RADAR_PHASE1_HANDLER.ANALYZE_COMPETITION, "ANALYZE", "o clique é quem chama analisar");
  assert.equal(RADAR_PHASE1_HANDLER.FINALIZE_SERP, "FINALIZE", "o clique é quem chama finalizar");
  /*
   * RADAR 18.8 · a corrente ficou com dois elos, e os dois são verificados.
   *
   * O botão saiu de dois `<button>` copiados para um `Phase1Button` só, porque
   * fora da área Pesquisa o rótulo e o ⓘ divergiam do de dentro. A garantia é a
   * mesma e agora é dita inteira: `disparar` chega ao componente como
   * `onTrigger`, e é `onTrigger` — nada mais — que vira o `onClick`.
   */
  assert.ok(painel.includes("onTrigger={disparar}"), "o despacho chega ao botão pelo clique");
  assert.ok(painel.includes("onClick={onTrigger}"), "e nada além do clique dispara");
  assert.equal(/onClick=\{\s*\(\)\s*=>\s*on(Start|Analyze|Finalize)/.test(painel), false, "nenhum atalho contorna o mapa canônico");
});

/*
 * ==================  GATE 4 · INICIAR PESQUISA  =========================
 */

test("GATE 4 · o START executa os catorze passos, na ordem, sem clique no meio", () => {
  const fonte = page();
  /*
   * O CORPO É O DO START — RADAR 18.9.
   *
   * A recuperação da SERP já paga é um caminho lateral com escrita própria, e
   * ela passou a viver entre a rodada e a finalização. Mantê-la dentro da
   * fatia faria "uma escrita ao final" contar duas e, pior, deixaria uma marca
   * da recuperação satisfazer um passo do START.
   */
  const corpo = fonte.slice(fonte.indexOf("const startDeepResearch = async"), fonte.indexOf("const recuperarPesquisaPaga = async"));

  /* A ordem importa: cada marca precisa vir depois da anterior. */
  const sequencia = [
    "const investigacao = data.deepResearch",      // 1 · contexto resolvido
    "const modoDaPesquisa =",                     // modo escolhido antes
    "startRadarDeepResearch({",                   // 2 e 3 · fundamento congelado + QueryPlan
    "await collect(target)",                      // 7 · SERP canônica
    "serpClass: \"canonical\"",                   // canônica separada
    "pipeline.collectAuxiliarySerp",              // 8 · auxiliares
    "serpClass: \"auxiliary\"",                   // auxiliar separada
    "buildRadarAutomaticResearchCuration",        // 11–14 · universo e seleção
  ];
  /*
   * A BUSCA É SEQUENCIAL — RADAR 18.9.
   *
   * `indexOf` a partir do zero devolvia a PRIMEIRA ocorrência do arquivo, não
   * a próxima na sequência: uma marca que aparecesse antes num caminho lateral
   * satisfazia o passo errado, e uma ausência real podia passar verde. Cada
   * marca agora é procurada depois da anterior, que é o que "vir na ordem"
   * quer dizer.
   */
  let anterior = -1;
  for (const marca of sequencia) {
    const posicao = corpo.indexOf(marca, anterior + 1);
    assert.notEqual(posicao, -1, `"${marca}" não existe depois da marca anterior`);
    assert.ok(posicao > anterior, `"${marca}" precisa existir e vir na ordem`);
    anterior = posicao;
  }

  /* Um clique só: uma escrita ao final, nenhuma pausa pedindo confirmação. */
  assert.equal((corpo.match(/await persistSerpAnalysis/g) || []).length, 1);
  assert.equal(/window\.confirm|setPendingConfirmation/.test(corpo), false);

  /* Secundárias e reforços entram pelo plano, com disposição declarada. */
  const plano = readFileSync("lib/radar/research-query-plan.ts", "utf8");
  for (const disposicao of ["EXECUTE", "CONTEXT_ONLY", "REUSE_FORMATION_EVIDENCE", "NOT_EXECUTABLE"]) {
    assert.ok(plano.includes(`"${disposicao}"`), `a disposição ${disposicao} precisa existir`);
  }
  assert.ok(plano.includes("reforco_narrativo"), "reforços são considerados");

  /* Deduplicação e recorrência vivem no universo, por URL normalizada. */
  const universo = readFileSync("lib/radar/competitor-universe.ts", "utf8");
  assert.ok(universo.includes("const chave = radarNormalizedUrl(resultado.url)"), "dedução por URL normalizada");
  assert.ok(universo.includes("atual.queryCount += 1"), "recorrência medida entre consultas");
});

test("GATE 4 · a auxiliar nunca vira snapshot canônico do artigo", () => {
  const rota = readFileSync("app/api/editorial/serp/route.ts", "utf8");
  const inicio = rota.indexOf('if (input.action === "collect_auxiliary")');
  const bloco = rota.slice(inicio, rota.indexOf("const repository = new SerpSnapshotRepository(); const history", inicio));
  assert.ok(inicio > 0, "a rota precisa ter o caminho auxiliar");
  assert.equal(/repository\.save|SerpCollectionRecordSchema/.test(bloco), false, "auxiliar não é gravada como snapshot");
  assert.ok(bloco.includes("not_persisted_as_article_snapshot"));
  assert.ok(bloco.includes("version: 1, previousSnapshotId: null"), "a cadeia de versões é da canônica");

  const pipeline = readFileSync("components/editorial-pipeline-context.tsx", "utf8");
  const transporte = pipeline.slice(pipeline.indexOf("collectAuxiliarySerp: async"), pipeline.indexOf("saveRadarAnalysis: async"));
  assert.equal(/updateWorkspace|saveLocalSerpRecovery/.test(transporte), false, "a auxiliar não entra na cadeia local");
});

/*
 * ================  GATE 5 · SELEÇÃO AUTOMÁTICA  =========================
 */

const contexto = () => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [], editorialTopics: [], resolvedKeywordTexts: [],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

/** 18 URLs editoriais: 5 na canônica, 13 só nas auxiliares. */
const URLS_18 = Array.from({ length: 18 }, (_, index) => `https://editorial-${index + 1}.com.br/artigo`);

const registro18 = (): RadarDeepResearchRecord => ({
  startedAt: "2026-09-09T10:00:00.000Z", startedBy: "humano", primarySearchMode: "WEB",
  fingerprint: { articleDnaVersionId: "dna", articleDnaContentHash: null, keywordRefs: [], siloDnaVersionId: null, siloPageId: null, formationAssessmentId: null, formationBaseHash: null, internalLinkGraphVersionId: null, value: "fx" },
  queries: [
    {
      queryId: "q:principal", keywordId: "kw1", keyword: "principal", role: "principal",
      disposition: "EXECUTE", execution: "EXECUTED", serpClass: "canonical", reason: "central",
      evidence: {
        serpClass: "canonical", snapshotId: "s1", collectedAt: "2026-09-09T10:00:00.000Z", contentHash: "a".repeat(64),
        resultCount: 5, observedIntent: "informacional",
        results: URLS_18.slice(0, 5).map((url, index) => ({ position: index + 1, url, title: `P${index}`, domain: new URL(url).hostname, inferredType: "article" })),
      },
    },
    {
      queryId: "q:sec", keywordId: "kw2", keyword: "secundária", role: "secundaria",
      disposition: "EXECUTE", execution: "EXECUTED", serpClass: "auxiliary", reason: "amplia",
      evidence: {
        serpClass: "auxiliary", snapshotId: "s2", collectedAt: "2026-09-09T10:05:00.000Z", contentHash: "b".repeat(64),
        resultCount: 13, observedIntent: "informacional",
        results: URLS_18.slice(5).map((url, index) => ({ position: index + 1, url, title: `A${index}`, domain: new URL(url).hostname, inferredType: "article" })),
      },
    },
  ],
  summary: null, researchCuration: null, finalizedAt: null, finalizedBy: null, conclusion: null,
} as unknown as RadarDeepResearchRecord);

test("GATE 5 · não existe teto: as dezoito permanecem no universo e todas recebem decisão", () => {
  const resultado = buildRadarAutomaticResearchCuration({ record: registro18(), context: contexto(), confirmedBy: "sistema" });

  assert.equal(resultado.references.length, 18, "o universo preserva as dezoito");
  assert.notEqual(resultado.references.length, 7, "nenhuma truncagem em sete");

  /* Toda referência recebe decisão E motivo — inclusive as excluídas. */
  assert.equal(resultado.reasons.length, 18);
  assert.ok(resultado.reasons.every(item => item.reason.length > 10));
  assert.equal(resultado.selected + resultado.excluded, 18, "decidida é decidida: nada fica sem desfecho");
});

/*
 * TESTE INVERTIDO — ele provava o defeito, agora guarda a correção.
 *
 * O gate exige "auxiliary-only editorial competitor → selectable automatically"
 * e "18 úteis → 18 podem entrar". A regra antiga promovia a concorrente apenas
 * quem estava na principal ou recorria, e uma página que só a secundária
 * encontrou virava `NOT_RELEVANT`. A promoção passou a olhar o PAPEL de quem
 * descobriu — e é isso que este teste protege.
 */
test("GATE 5 · a secundária descobre concorrente sozinha: 18 úteis → 18 selecionadas", () => {
  const resultado = buildRadarAutomaticResearchCuration({ record: registro18(), context: contexto(), confirmedBy: "sistema" });

  const somenteAuxiliares = resultado.references.filter(reference => reference.principalRank === null);
  assert.equal(somenteAuxiliares.length, 13, "treze só apareceram na secundária");
  assert.ok(somenteAuxiliares.every(reference => reference.queryCount === 1), "e nenhuma recorre");

  /* AUXILIARY_ONLY_SECONDARY_COMPETITOR_SUPPORTED = YES */
  assert.ok(somenteAuxiliares.every(reference => reference.classification === "EDITORIAL_COMPETITOR"),
    "página editorial vinda de secundária compatível é concorrente");
  assert.equal(resultado.selected, 18, "AUTO_SELECTED = 18");
  assert.equal(resultado.excluded, 0, "EXCLUDED = 0");

  const decisoes = new Map(resultado.reasons.map(item => [item.referenceId, item]));
  const promovida = decisoes.get(somenteAuxiliares[0].referenceId);
  assert.equal(promovida?.decision, "primary");
  assert.match(somenteAuxiliares[0].classificationReason, /Encontrado por keyword secundária/);
});

test("GATE 5 · reforço sozinho NÃO é promovido, e a hierarquia dos papéis é preservada", () => {
  const soReforco = {
    ...registro18(),
    queries: [{
      queryId: "q:reforco", keywordId: "kw3", keyword: "reforço", role: "reforco_narrativo" as const,
      disposition: "EXECUTE" as const, execution: "EXECUTED" as const, serpClass: "auxiliary" as const, reason: "entidade própria",
      evidence: {
        serpClass: "auxiliary" as const, snapshotId: "s3", collectedAt: "2026-09-09T10:00:00.000Z", contentHash: "e".repeat(64),
        resultCount: 1, observedIntent: "informacional",
        results: [{ position: 1, url: "https://lateral.com.br/assunto-vizinho", title: "Assunto vizinho", domain: "lateral.com.br", inferredType: "article" }],
      },
    }],
  } as unknown as RadarDeepResearchRecord;

  const resultado = buildRadarAutomaticResearchCuration({ record: soReforco, context: contexto(), confirmedBy: "sistema" });
  assert.equal(resultado.references[0].classification, "LATERAL_REFERENCE",
    "REINFORCEMENT_ONLY_AUTO_PROMOTED = NO");
  assert.notEqual(resultado.references[0].classification, "EDITORIAL_COMPETITOR");
  assert.equal(resultado.selected, 0, "aparecer uma vez em reforço não coloca na amostra");
});

test("GATE 5 · a promoção exige compatibilidade — não seleciona lixo para engrossar número", () => {
  /*
   * ATUALIZADO PELO GATE 8.1 — a asserção mudou de lugar, não de exigência.
   *
   * Antes, este teste provava que ausência de match léxico (`absent`) barrava
   * a promoção. O 8.1 mostrou que isso descartava evidência boa: a página
   * nunca era extraída e a dúvida nunca era resolvida. Quem barra agora é
   * `divergent` — evidência POSITIVA de outro assunto. O teste continua
   * provando que existe barreira; ele passou a provar a barreira certa.
   *
   * A prova de que o não-saber preserva vive em radar-gate8-1-entidade.
   */
  const comEntidade = {
    ...contexto(),
    keywords: [{ strategy: { keywordDnaSnapshot: { payload: { centralEntity: "protetor solar" } }, semanticQualification: { intent: "informacional" }, normalizedIntent: "informacional" } }],
  } as unknown as RadarArticleResearchContext;

  /* Consulta informacional devolvendo ficha de produto: contradição observada. */
  const base = registro18().queries[1];
  const evidencia = base.evidence!;
  const foraDoAssunto = {
    ...registro18(),
    queries: [{
      ...base,
      evidence: { ...evidencia, results: evidencia.results.map(item => ({ ...item, inferredType: "product" })) },
    }],
  } as unknown as RadarDeepResearchRecord;

  const resultado = buildRadarAutomaticResearchCuration({ record: foraDoAssunto, context: comEntidade, confirmedBy: "sistema" });
  assert.ok(resultado.references.every(reference => reference.entityCompatibility === "divergent"),
    "há evidência positiva de outro assunto, não apenas silêncio léxico");
  assert.ok(resultado.references.every(reference => reference.classification !== "EDITORIAL_COMPETITOR"),
    "e por isso nenhuma é promovida a concorrente editorial");

  const universo = readFileSync("lib/radar/competitor-universe.ts", "utf8");
  assert.ok(universo.includes("const daSecundaria = candidato.rolesSeen.includes(\"secundaria\")"));
  assert.ok(universo.includes('candidato.intentCompatibility !== "divergent" && radarEntityReadingAllows(candidato.entityCompatibility)'),
    "intenção divergente ou entidade divergente barram a promoção");

  /* E as exclusões corretas continuam valendo, antes de qualquer promoção. */
  for (const anterior of ["SERP_FEATURE", "FORMAT_REFERENCE", "AUTHORITY_SOURCE", "PRODUCT_REFERENCE", "LATERAL_REFERENCE"]) {
    assert.ok(universo.includes(`"${anterior}"`), `${anterior} continua sendo decidido antes`);
  }
  const auto = readFileSync("lib/radar/research-auto-selection.ts", "utf8");
  assert.ok(auto.includes('siloCompatibility === "own_domain"'), "domínio próprio continua fora");
});

test("GATE 5 · recorrência é sinal, não aprovação — e a confirmação humana não é exigida", () => {
  const queries = [{
    queryId: "q1", keyword: "k", role: "principal" as const, serpClass: "canonical" as const,
    results: [{ position: 1, url: "https://loja.com.br/produto/x", title: "Comprar produto", domain: "loja.com.br", inferredType: "product" }],
  }];
  const universe = buildRadarCompetitorUniverse({ queries, context: contexto() });
  const references = buildRadarResearchReferences({ queries, universe, context: contexto() });

  /*
   * Sem decisão gravada, a curadoria mostra a SUGESTÃO e mantém `pending`.
   * Recorrer muito não aprova nada sozinho: quem aprova é a rodada automática
   * (que grava a decisão) ou a pessoa.
   */
  const semDecisao = buildRadarResearchCurationView({ references });
  assert.equal(semDecisao.rows[0].decision, "pending");
  assert.ok(semDecisao.rows[0].suggestedDecision);
  assert.equal(semDecisao.selectedCount, 0);

  /* E a decisão automática de uma página comercial é apoio, não concorrente. */
  assert.equal(autoDecideRadarReference(references[0]).decision, "support");
});

/*
 * ===================  GATE 6 · CONTABILIDADE  ===========================
 */

const view18 = (): RadarSerpView => ({
  record: { id: "s1" }, version: 1, provider: "dataforseo", hash: "c".repeat(64),
  capturedAt: "2026-09-09T10:00:00.000Z", source: "merged", partial: false,
  /* A SERP canônica tem SETE resultados — e isso é normal. */
  organicResults: URLS_18.slice(0, 7).map((url, index) => ({
    position: index + 1, url, title: `P${index}`, domain: new URL(url).hostname,
    snippet: "", inferredType: "article", isOwnDomain: false,
  })),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], possibleConflicts: [], limitations: [], questions: [], opportunities: [], recurringTitlePatterns: [] },
} as unknown as RadarSerpView);

const analise = (extraidas: string[], falhas: string[]): RadarAnalysisVersion => ({
  versionId: "an", entityId: "radar-analysis:a", versionNumber: 2, previousVersionId: null,
  contentHash: "sha256:" + "d".repeat(64), origin: "human", changeReason: "fx",
  createdAt: "2026-09-09T11:00:00.000Z", createdBy: "humano",
  payload: {
    schemaVersion: 1, brandId: "b", articleId: "a", articleDnaVersionId: "dna",
    serpSnapshotId: "s1", serpSnapshotVersion: 1, serpSnapshotHash: "c".repeat(64),
    mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fx"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "",
    /* Nenhuma decisão canônica incluída: a amostra vem da curadoria da pesquisa. */
    serpDecisions: URLS_18.slice(0, 7).map((url, index) => ({ key: `organic:${index + 1}`, itemType: "organic" as const, decision: "pending" as const, reason: "", note: "", ownDomain: false, url })),
    selectedCompetitorIds: [],
    extractionIds: [], extractions: extraidas.map((url, index) => ({ id: `p${index}`, url, status: "success" })),
    extractionFailures: falhas.map((url, index) => ({ key: `f${index}`, url, code: "invalid_html", message: "sem HTML", status: 422, observedAt: "2026-09-09T12:00:00.000Z" })),
    deepResearch: null, benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null,
    keywordDecisions: [], competitiveReport: null, plannerPackage: null, plannerTransfer: null,
    status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  },
} as unknown as RadarAnalysisVersion);

test("GATE 6 · 18 = 6 reutilizadas + 9 analisadas agora + 3 finais, e PENDING = 0", () => {
  /* O cenário exato do lote: seis já existiam, nove chegaram agora, três falharam. */
  const reutilizadas = URLS_18.slice(0, 6);
  const agora = URLS_18.slice(6, 15);
  const falhas = URLS_18.slice(15);

  const conta = buildRadarAnalysisMembership({
    view: view18(),
    analysis: analise([...reutilizadas, ...agora], falhas),
    scope: { brandId: "b", articleId: "a", articleDnaVersionId: "dna" },
    researchSelectedUrls: URLS_18,
  });

  assert.equal(conta.selected, 18);
  assert.equal(conta.reused, 15, "as quinze com extração — seis antigas mais nove novas");
  assert.equal(conta.failed, 3);
  assert.equal(conta.pending, 0, "PENDING = 0 depois da rodada final");
  assert.equal(conta.selected, conta.reused + conta.failed + conta.pending, "a conta fecha");
  assert.equal(conta.consistent, true);

  /* Sem overlap: nenhuma URL em duas categorias. */
  const todas = [...conta.reusedUrls, ...conta.failedUrls, ...conta.pendingUrls].map(radarNormalizedUrl);
  assert.equal(new Set(todas).size, todas.length);

  /* E o 19 não volta: o total das categorias é exatamente a seleção. */
  assert.notEqual(conta.reused + conta.failed + conta.pending, 19);
});

test("GATE 6 · a SERP canônica pode ter 7 e o universo 18 sem contaminar a análise", () => {
  const conta = buildRadarAnalysisMembership({
    view: view18(), analysis: analise([], []),
    scope: { brandId: "b", articleId: "a", articleDnaVersionId: "dna" },
    researchSelectedUrls: URLS_18,
  });
  assert.equal(view18().organicResults.length, 7, "CANONICAL_RESULTS = 7");
  assert.equal(conta.selected, 18, "RESEARCH_REFERENCES = 18");

  /* A aba Análise lê a mesma conta — o 7 não vaza para representar o universo. */
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /researchSelectedUrls: deepResearch\?\.curation\.confirmed/);
  assert.equal(/const membership = buildRadarAnalysisMembership\(\{ view, analysis, scope \}\)/.test(painel), false);
});

/*
 * ==============  GATE 7 · ANALISAR CONCORRÊNCIA  ========================
 */

test("GATE 7 · o conjunto inteiro é processado em lotes, sem clique no meio", () => {
  const fonte = page();
  const corpo = fonte.slice(fonte.indexOf("const analyzeSerpSelection = async"), fonte.indexOf("const reviewSerpForArticle = async"));

  assert.match(corpo, /radarExtractionBatches\(fila\)/, "o lote é transporte, não etapa");
  assert.equal(/window\.confirm|aguardar|setPendingBatch/.test(corpo), false, "nada pausa entre lotes");
  /* Canônicas e referências da pesquisa entram na MESMA fila. */
  assert.match(corpo, /const candidates = \[\.\.\.canonicos, \.\.\.daPesquisa\]/);
  assert.match(corpo, /source: "research" as const, referenceId: row\.reference\.referenceId/);
});

test("GATE 7 · o retry classifica pelos códigos que a extração REALMENTE emite", () => {
  /*
   * Os treze códigos do extractor, conferidos na fonte. Testar códigos que ele
   * nunca emite daria falsa cobertura — foi por isso que `network_error`,
   * `blocked` e `unsupported` saíram das listas de retry.
   */
  const emitidos = [
    "invalid_url", "private_destination", "redirect_limit", "timeout", "invalid_content_type", "invalid_html", "fetch_failed",
    "not_found", "gone", "access_blocked", "too_many_requests", "http_server_error", "http_client_error",
  ];
  const retry = readFileSync("lib/radar/extraction-retry.ts", "utf8");
  for (const fantasma of ["network_error", "blocked", "unsupported"]) {
    assert.equal(retry.includes(`"${fantasma}"`), false, `${fantasma} não é emitido — não pode figurar como tratado`);
  }
  const fonte = readFileSync("lib/radar/competitor-extractor.ts", "utf8");
  const declarados = fonte.slice(fonte.indexOf("readonly code:"), fonte.indexOf(";", fonte.indexOf("readonly code:")));
  for (const codigo of emitidos) assert.ok(declarados.includes(`"${codigo}"`), `${codigo} precisa estar no contrato de erro`);

  /* Recuperáveis: o problema é do momento. */
  assert.equal(radarExtractionFailureIsRecoverable({ code: "timeout", status: 504 }), true);
  assert.equal(radarExtractionFailureIsRecoverable({ code: "fetch_failed", status: 502 }), true);

  /* Definitivos: a recusa é estável. */
  for (const codigo of ["invalid_url", "private_destination", "invalid_html", "invalid_content_type", "redirect_limit"]) {
    assert.equal(radarExtractionFailureIsRecoverable({ code: codigo, status: 422 }), false, `${codigo} não melhora com retry`);
  }

  /* O retry termina: depois do teto, a falha encerra. */
  const fila = radarExtractionRetryQueue([
    { key: "a", code: "timeout", status: 504, attempts: 1 },
    { key: "b", code: "timeout", status: 504, attempts: RADAR_EXTRACTION_MAX_ATTEMPTS },
    { key: "c", code: "invalid_html", status: 422, attempts: 1 },
  ]);
  assert.deepEqual(fila.map(item => item.key), ["a"], "só a recuperável dentro do teto volta");
});

/*
 * TESTE INVERTIDO — ele provava o defeito, agora guarda a correção.
 *
 * O gate pede "404 → final" e "429 → retry". Antes, nenhum dos dois era
 * observável: o extractor não inspecionava `response.status` fora da faixa de
 * redirect, e uma página de erro com corpo HTML entrava no benchmark como se
 * fosse a do concorrente. Agora o status é lido ANTES do corpo.
 *
 * Nenhum destes testes chama rede: `fetchImpl` e `lookupImpl` são stubs.
 * PROVIDER_CALLS = 0.
 */
test("GATE 7 · o status da origem é classificado ANTES de o corpo ser lido", () => {
  const fonte = readFileSync("lib/radar/competitor-extractor.ts", "utf8");

  assert.ok(fonte.includes("export function assertResponseStatus(status: number)"), "a classificação é uma função própria");
  const chamada = fonte.indexOf("assertResponseStatus(response.status);");
  const semResposta = fonte.indexOf('if (!response) throw new CompetitorExtractionError("fetch_failed"');
  const contentType = fonte.indexOf('const contentType = response.headers.get("content-type")');
  const corpo = fonte.indexOf("const html = await readBody(response);");
  assert.ok(chamada > semResposta, "depois de garantir que houve resposta");
  assert.ok(chamada < contentType && chamada < corpo, "e antes do content-type e do corpo — o erro nunca vira conteúdo");

  /* O redirecionamento continua tratado no laço, não foi absorvido pela nova regra. */
  assert.ok(fonte.includes("response.status >= 300 && response.status < 400"));

  /* Os códigos que dependem do status agora existem no contrato. */
  const declarados = fonte.slice(fonte.indexOf("readonly code:"), fonte.indexOf(";", fonte.indexOf("readonly code:")));
  for (const codigo of ["not_found", "gone", "access_blocked", "too_many_requests", "http_server_error", "http_client_error"]) {
    assert.ok(declarados.includes(`"${codigo}"`), `${codigo} precisa estar no contrato de erro`);
  }
});

/* ---------- GATE 7 · HTTP · A a K — status da origem, sem rede ---------- */

/** Uma página de erro bem formada: se o status não fosse lido, ela passaria. */
const PAGINA_DE_ERRO = "<html><body><h1>Pagina nao encontrada</h1><h2>Tente outra busca</h2><p>O endereco pedido nao existe mais neste site, verifique o link.</p></body></html>";
const PAGINA_REAL = "<html><head><title>Guia de skincare</title></head><body><h1>Guia de skincare</h1><h2>Como aplicar</h2><p>A rotina comeca pela limpeza da pele antes de qualquer outro passo do dia.</p></body></html>";

const resposta = (status: number, html: string) => ({
  ok: status >= 200 && status < 300, status, url: "https://concorrente.com.br/artigo",
  headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
  text: async () => html,
  arrayBuffer: async () => new TextEncoder().encode(html).buffer,
}) as unknown as Response;

const buscar = (status: number, html = PAGINA_DE_ERRO) => extractCompetitorPage("https://concorrente.com.br/artigo", {
  fetchImpl: (async () => resposta(status, html)) as unknown as typeof fetch,
  lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never,
  now: "2026-09-09T10:00:00.000Z",
});

async function falha(status: number) {
  try {
    await buscar(status);
  } catch (error) {
    assert.ok(error instanceof CompetitorExtractionError, `HTTP ${status} precisa falhar com erro tipado`);
    return error as CompetitorExtractionError;
  }
  throw new Error(`HTTP ${status} devolveu página em vez de falhar`);
}

test("GATE 7 · HTTP A — 200 com HTML real continua virando página analisada", async () => {
  const page = await buscar(200, PAGINA_REAL);
  assert.equal(page.title, "Guia de skincare");
  assert.ok(page.wordCount > 0, "o caminho feliz não foi afetado pela nova checagem");
});

test("GATE 7 · HTTP B a E — 404, 403, 410 e 400 são falhas FINAIS", async () => {
  const esperado: Array<[number, string]> = [[404, "not_found"], [403, "access_blocked"], [410, "gone"], [400, "http_client_error"]];
  for (const [status, code] of esperado) {
    const error = await falha(status);
    assert.equal(error.code, code, `HTTP ${status}`);
    assert.equal(radarExtractionFailureIsRecoverable({ code: error.code, status }), false, `HTTP ${status} não volta para a fila`);
  }
});

test("GATE 7 · HTTP F a H — 429, 500 e 503 voltam para a fila de retry", async () => {
  const esperado: Array<[number, string]> = [[429, "too_many_requests"], [500, "http_server_error"], [503, "http_server_error"]];
  for (const [status, code] of esperado) {
    const error = await falha(status);
    assert.equal(error.code, code, `HTTP ${status}`);
    assert.equal(radarExtractionFailureIsRecoverable({ code: error.code, status }), true, `HTTP ${status} merece outra tentativa`);
    assert.deepEqual(
      radarExtractionRetryQueue([{ key: "k", code: error.code, status, attempts: 1 }]).map(item => item.key),
      ["k"],
    );
  }
});

test("GATE 7 · HTTP I e J — esgotado o teto, a recuperável vira FAILED_FINAL e PENDING não sobra", async () => {
  for (const status of [429, 500]) {
    const error = await falha(status);
    const fila = radarExtractionRetryQueue([{ key: "k", code: error.code, status, attempts: RADAR_EXTRACTION_MAX_ATTEMPTS }]);
    assert.deepEqual(fila, [], `HTTP ${status} para de ser tentado no teto`);
    const limitacao = radarExtractionLimitation({ url: "https://concorrente.com.br/artigo", code: error.code, status, attempts: RADAR_EXTRACTION_MAX_ATTEMPTS });
    assert.match(limitacao, /não pôde ser lida após 3 tentativas/, "e vira limitação declarada, não pendência");
  }
});

test("GATE 7 · HTTP K — nenhum status fora de 2xx produz página analisada", async () => {
  for (const status of [400, 401, 403, 404, 410, 418, 429, 451, 500, 502, 503, 504]) {
    const error = await falha(status);
    assert.ok(error.code !== "invalid_content_type" && error.code !== "invalid_html",
      `HTTP ${status} precisa falhar pelo status, não por acidente de parsing`);
  }
  /* HTTP_ERROR_BODY_NEVER_BECOMES_COMPETITOR_CONTENT = YES */
  const soErro = await falha(404);
  assert.equal(soErro.status, 404, "o status da origem é preservado no erro, para o relatório dizer o que houve");
});

test("GATE 7 · segurança — o cliente não escolhe a URL buscada", () => {
  const contrato = readFileSync("lib/radar/extraction-request.ts", "utf8");
  const candidata = contrato.slice(contrato.indexOf("export const RadarResearchExtractionCandidateSchema"));
  assert.equal(/url: z\.string/.test(candidata.slice(0, candidata.indexOf("}).strict()"))), false,
    "a candidata da pesquisa não tem campo de URL");

  const rota = readFileSync("app/api/editorial/radar-analysis/extract/route.ts", "utf8");
  assert.match(rota, /new WorkflowRepository\(\)\.findByArticle/, "a autoridade é a análise persistida");
  assert.match(rota, /radarExtractionTargets\(autoridade, canonicalUrlByKey\)/, "o destino sai da autoridade");
  assert.match(rota, /extractCompetitorPage\(target\.url/, "e é ele que é buscado");

  /* Os guardas de SSRF continuam ativos e não foram substituídos. */
  const extractor = readFileSync("lib/radar/competitor-extractor.ts", "utf8");
  for (const guarda of ["localhost", "metadata.google.internal", "privateIpv4", "privateIpv6", "assertResolvedDestination"]) {
    assert.ok(extractor.includes(guarda), `${guarda} precisa continuar no caminho`);
  }
  assert.ok(CompetitorExtractionError, "o erro tipado continua exportado");
});
