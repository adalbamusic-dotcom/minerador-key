import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { RadarR3Workbench } from "../modules/radar/radar-r3-workbench.tsx";
import { SupabaseSessionProvider } from "../components/auth/supabase-session-context.tsx";
import { GlobalNoticeProvider } from "../components/global-notice-center.tsx";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarResearchDetails, radarOperationalRow, RADAR_OPERATIONAL_STATUS_LABEL } from "../lib/radar/operational-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarR3Model } from "../lib/radar/r3-workbench.ts";

/*
 * ======  GATE 15.3 · O WORKFLOW LEGADO SAI DA SUPERFÍCIE  ===============
 *
 * O Gate 15.2 provou que os botões novos despacham. A homologação visual
 * mostrou o que faltava: o fluxo antigo não tinha sido SUBSTITUÍDO, tinha sido
 * ESCONDIDO. Dentro de "Ver concorrentes, páginas analisadas, evidências e
 * histórico" continuavam, inteiras e operantes, as seis abas do processo
 * anterior — Coleta, Concorrentes, Análise, Evidências, Revisão, Histórico —
 * com Aprovar SERP, Rejeitar SERP, Continuar para Análise, Analisar páginas
 * pendentes, checkboxes de curadoria e classificadores manuais.
 *
 * Duas autoridades de workflow na mesma tela, e a antiga com mais botões.
 *
 * O que este arquivo prova é uma ausência — e ausência é a coisa mais fácil de
 * afirmar por engano. Por isso os testes não leem string de fonte: eles MONTAM
 * a tela, ABREM os expansíveis e varrem o DOM resultante. Um controle escondido
 * por CSS continuaria aqui; um controle que não existe, não.
 *
 * REAL_PROVIDER_CALLS = 0: tudo local, com sentinela de rede no fim.
 */

/* ======================  A SENTINELA DE REDE  ========================== */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    const alvo = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    tentativasDeRede.push(alvo);
    return Promise.reject(new Error(`REDE PROIBIDA NESTE GATE: ${alvo}`));
  },
  writable: true, configurable: true,
});

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
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-3", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) };

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

function vista(patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never,
    extractions: PAGINAS, observedAt: "2026-09-10T12:00:00.000Z", ...patch,
  } as Parameters<typeof buildRadarDeepResearchView>[0];
  if (!base.record) return buildRadarDeepResearchView(base);

  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({
      referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
      decision: autoDecideRadarReference(reference).decision, reason: "",
    })),
  };
  const recordBase = base.record as ReturnType<typeof registro>;
  return buildRadarDeepResearchView({
    ...base,
    record: { ...recordBase, researchCuration: curadoria },
    selectedReferences: curadoria.references.filter(item => item.decision !== "excluded" && item.decision !== "pending").length,
  });
}

const modelo = (deepResearch?: ReturnType<typeof vista>): RadarR3Model => ({
  brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-3",
  title: "Cobrir com clareza o tema skincare para pele oleosa",
  keyword: "skincare para pele oleosa", silo: "skincare", hierarchy: "Suporte",
  articleDnaVersion: "v1", publication: "Ainda não publicado", mode: "competitive_full", article: null,
  researchContext: contexto(), deepResearch,
  serp: { provider: "dataforseo", status: "Coletada", resultCount: 12, primaryCount: 1, pendingCount: 0, needs: 0, latestCollection: "Nenhuma coleta", records: [], references: [], view: null, analysis: null, latestSnapshotId: null, reviewStatus: null, reviewNotes: null, reviewCurrentness: "current", reviewedAt: null, reviewHistory: [], capturedAt: null },
  amazon: { state: "AMAZON_NOT_APPLICABLE", note: "" },
  content: { articleDnaVersion: "v1", principal: "skincare para pele oleosa", needs: 0, evidenceCount: 0, sourceCount: 0, rows: [], technical: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-3", siloId: null, snapshotId: null, provider: null, articleDnaEntityId: null, articleDnaHash: null } },
  specialist: { expert: "Não selecionado", specialty: "", status: "Não iniciado", channel: "Telegram não consumido nesta visão", requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0, pending: 0, existingContent: "Nenhum material" },
  report: { status: "Aguardando", version: null, needs: 0, summary: "", approved: false, sentToPlanner: false, updatedAt: null },
  nextAction: "", lastActivity: null,
  provenance: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-3", siloId: null, snapshotId: null, provider: null },
} as unknown as RadarR3Model);

async function montarTela(view: ReturnType<typeof vista> | undefined) {
  const chamadas = { start: 0, analyze: 0, finalize: 0, reset: 0 };
  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(
    SupabaseSessionProvider, null,
    React.createElement(GlobalNoticeProvider, null,
      React.createElement(RadarR3Workbench, {
        model: modelo(view), refreshing: false,
        onStartDeepResearch: () => { chamadas.start += 1; },
        onAnalyzeSerpSelection: () => { chamadas.analyze += 1; },
        onFinalizeInvestigation: () => { chamadas.finalize += 1; },
        onResetInvestigation: () => { chamadas.reset += 1; },
        onSearchModeChange: () => {},
        onOpenArticle: () => {}, onOpenDetail: () => {},
      } as never)),
  )));
  return { tela, chamadas };
}

/**
 * A PESQUISA ABERTA COM TODOS OS EXPANSÍVEIS ABERTOS.
 *
 * Abrir cada `<details>` é o que separa "não está visível" de "não existe".
 * Nesta árvore os filhos de um `<details>` são montados mesmo fechado, então a
 * varredura já os alcançaria — abrir de verdade só torna o teste honesto sobre
 * o que a pessoa vê depois de clicar.
 */
async function abrirPesquisaInteira(tela: RadarDomScreen) {
  await tela.click("radar-r3-card-pesquisa");
  for (const elemento of [...tela.container.querySelectorAll("details")]) {
    const resumo = elemento.querySelector("summary");
    if (resumo && !(elemento as HTMLDetailsElement).open) await tela.click(resumo as HTMLElement);
  }
}

/* ======  OS CONTROLES QUE NÃO PODEM EXISTIR  ========================== */

/** §10, §7, §5 — o vocabulário do fluxo antigo, exatamente como aparecia. */
const CONTROLES_PROIBIDOS = [
  "Aprovar SERP", "Rejeitar SERP", "Continuar para Análise", "Analisar páginas pendentes",
  "Iniciar curadoria", "Confirmar seleção", "Aprovar investigação", "Aguardando decisão",
  "SERPs aguardando revisão", "Próxima pendente", "Revisão e aprovação",
];

/** §13 — estados do léxico antigo que contradizem a autoridade atual. */
const ESTADOS_PROIBIDOS = ["Reaberta", "Aguardando aprovação"];

function semControlesLegados(texto: string, onde: string) {
  for (const rotulo of CONTROLES_PROIBIDOS) {
    assert.ok(!texto.includes(rotulo), `${onde}: "${rotulo}" não pode existir na superfície da Fase 1`);
  }
}

/**
 * A varredura de controle de verdade: elementos interativos, não palavras.
 *
 * Botão de navegação de leitura (`summary`) não conta — §3 permite navegar. O
 * que não pode existir é entrada de decisão: checkbox de curadoria, seletor de
 * classificação, campo de motivo, botão que escreve.
 */
function controlesInterativos(raiz: HTMLElement) {
  return [...raiz.querySelectorAll("button, input, select, textarea")] as HTMLElement[];
}

/* ==========  §19 · O EXPANSÍVEL É CONSULTA  ========================== */

test("GATE 15.3 · §19 — abrir os detalhes da pesquisa não revela nenhum controle legado", async () => {
  const { tela, chamadas } = await montarTela(vista());
  await abrirPesquisaInteira(tela);

  /*
   * A VARREDURA É DO EXPANSÍVEL INTEIRO, NÃO DO COMPONENTE.
   *
   * Limitar o exame a `radar-research-details` provaria só que aquele
   * componente é limpo — e o problema original não era um componente sujo, era
   * um workflow inteiro montado ao lado. Um controle legado que voltasse como
   * IRMÃO do painel passaria despercebido. O que se examina é a superfície que
   * a pessoa vê ao clicar "Ver detalhes da pesquisa".
   */
  const disclosure = tela.get("radar-research-details-disclosure");
  const detalhes = tela.get("radar-research-details");
  const texto = disclosure.textContent || "";

  semControlesLegados(texto, "detalhes da pesquisa");
  assert.equal(tela.query("radar-serp-tab-action"), null, "LEGACY_TAB_ACTION_VISIBLE = NO");
  assert.equal(tela.query("radar-serp-collect-action"), null, "LEGACY_COLETA_TAB_VISIBLE = NO");
  assert.equal(tela.query("radar-research-curation"), null, "a curadoria manual do universo não é montada");
  assert.equal(tela.query("radar-canonical-curation"), null, "nem a da SERP canônica");

  /*
   * §5 e §6 — NENHUM CONTROLE DE CURADORIA, NEM SEQUER DESABILITADO.
   *
   * Um checkbox desabilitado ainda diz "aqui se decide". A curadoria por
   * evidência já decidiu no pipeline; refazê-la à mão, com menos informação,
   * seria pedir à pessoa que discorde de si mesma.
   */
  const interativos = controlesInterativos(disclosure);
  assert.deepEqual(interativos.map(item => item.textContent), [], "RESEARCH_DETAILS_READ_ONLY");
  assert.equal(disclosure.querySelectorAll("input[type=checkbox]").length, 0, "MANUAL_COMPETITOR_CURATION_VISIBLE = NO");
  assert.ok(detalhes.contains(tela.get("radar-research-details-competitors")), "e o painel de consulta é quem ocupa o expansível");

  /* E abrir tudo isso não executou operação nenhuma. */
  assert.deepEqual(chamadas, { start: 0, analyze: 0, finalize: 0, reset: 0 });
  tela.destroy();
});

test("GATE 15.3 · §23 — nada foi apagado: os quatro conjuntos continuam acessíveis", async () => {
  const { tela } = await montarTela(vista());
  await abrirPesquisaInteira(tela);

  /*
   * Remover workflow visual não é remover dado. Concorrentes, páginas,
   * evidências e histórico continuam alcançáveis — pelo caminho de consulta.
   */
  for (const secao of ["competitors", "pages", "evidence", "history"]) {
    assert.ok(tela.query(`radar-research-details-${secao}`), `${secao} continua acessível`);
  }
  const concorrentes = tela.all("radar-research-details-competitor");
  assert.ok(concorrentes.length > 0, "COMPETITORS_STILL_ACCESSIBLE");
  assert.match(tela.get("radar-research-details-competitors").textContent || "", /Concorrente A0/);

  /* §5 — cada linha diz título, domínio, origem, papel observado e leitura. */
  const primeira = concorrentes[0].textContent || "";
  assert.match(primeira, /d\d+\.com/i, "o domínio da referência aparece na linha");
  assert.match(primeira, /Concorrente editorial|Fonte de autoridade|Referência/, "e o papel observado");
  assert.ok(primeira.length > 40, "a linha carrega informação, não só um link");

  /* §12 — o histórico existe e não tem botão dentro. */
  const historico = tela.get("radar-research-details-history");
  assert.match(historico.textContent || "", /Pesquisa iniciada/);
  assert.deepEqual(controlesInterativos(historico), [], "HISTORY_STILL_ACCESSIBLE e READ_ONLY");
  tela.destroy();
});

/* ==========  §20 · FINALIZADO É FINALIZADO EM TODA A TELA  =========== */

test("GATE 15.3 · §20 — com bundle congelado, a tela inteira diz Finalizado e nada mais", async () => {
  const base = vista();
  const congelamento = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: base.observed.sample.analyzedSuccess, failed: 0, sufficiency: base.sufficiency,
    }),
    observed: base.observed, record: registro(), mode: "WEB", sufficiency: base.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  const finalizada = vista({
    record: { ...registro(), finalizedAt: "2026-09-10T13:00:00.000Z", finalizedBy: "ator", conclusion: "SUFFICIENT" } as never,
    finalizedBundle: congelamento.bundle,
  });
  const { tela, chamadas } = await montarTela(finalizada);
  await abrirPesquisaInteira(tela);

  const tudo = tela.text();
  assert.match(tudo, new RegExp(RADAR_OPERATIONAL_STATUS_LABEL.FINALIZED));
  semControlesLegados(tudo, "tela finalizada");
  for (const estado of ESTADOS_PROIBIDOS) {
    assert.ok(!tudo.includes(estado), `"${estado}" contradiz a autoridade atual`);
  }

  /* §11 — não existe aprovação extra entre ANALYZE e FINALIZE. */
  assert.equal(tela.query("radar-deep-research-button"), null, "congelado não oferece ação primária");

  /*
   * §14 — O CONGELADO É A AUTORIDADE DO DETALHE.
   *
   * Os números do expansível vêm do bundle, não da leitura viva. É isso que
   * impede o detalhe de mostrar pendências de uma rodada já encerrada.
   */
  const detalhes = tela.get("radar-research-details");
  assert.equal(detalhes.getAttribute("data-source"), "FROZEN");
  assert.match(detalhes.textContent || "", new RegExp(congelamento.bundle.bundleHash));
  assert.deepEqual(controlesInterativos(detalhes), [], "e continua read-only depois de congelado");

  assert.deepEqual(chamadas, { start: 0, analyze: 0, finalize: 0, reset: 0 });
  tela.destroy();
});

/* ==========  §21 e §22 · UM ACIONADOR, UM SÓ  ======================== */

test("GATE 15.3 · §21 — pré-análise oferece Analisar concorrência e nenhum botão legado", async () => {
  const { tela } = await montarTela(vista({ extractions: PAGINAS.slice(0, 6) }));
  await abrirPesquisaInteira(tela);

  const botao = tela.get("radar-deep-research-button");
  assert.equal(botao.getAttribute("data-action-id"), "ANALYZE_COMPETITION");
  assert.match(botao.textContent || "", /Analisar concorrência/);
  assert.equal(tela.all("radar-deep-research-button").length, 1, "ÚNICO acionador principal");

  semControlesLegados(tela.text(), "pré-análise");
  tela.destroy();
});

test("GATE 15.3 · §22 — pré-finalização oferece Finalizar e não Aprovar SERP", async () => {
  const { tela } = await montarTela(vista());
  await abrirPesquisaInteira(tela);

  const botao = tela.get("radar-deep-research-button");
  assert.equal(botao.getAttribute("data-action-id"), "FINALIZE_SERP");
  assert.match(botao.textContent || "", /Finalizar/);
  assert.equal(tela.all("radar-deep-research-button").length, 1, "ÚNICO acionador principal");

  semControlesLegados(tela.text(), "pré-finalização");

  /* §1 — RESET é a única ação secundária, e é explícita. */
  assert.ok(tela.query("radar-reset-investigation"), "zerar continua disponível, nomeado");
  tela.destroy();
});

/* ==========  §8 · FALHA NÃO VIRA FILA  =============================== */

test("GATE 15.3 · §8 — página não analisada é limitação declarada, nunca pendência acionável", () => {
  const detalhes = buildRadarResearchDetails({
    view: vista({ extractions: PAGINAS.slice(0, 10) }),
    extractionFailures: [
      { url: "https://bloqueado.com/a", code: "BLOCKED", message: "403", status: 403 },
      { url: "https://lento.com/b", code: "TIMEOUT", message: "sem resposta", status: null },
    ],
  });

  assert.match(String(detalhes.pages.failureHeadline), /não puderam ser analisadas/);
  assert.equal(detalhes.pages.failures.length, 2, "o detalhe por página continua disponível");
  assert.match(detalhes.pages.failures[0].reason, /BLOCKED · HTTP 403/);

  /* A frase termina em si mesma: não há verbo de ação em lugar nenhum dela. */
  for (const proibido of ["Analisar", "analisar", "Tentar novamente", "Reprocessar"]) {
    assert.ok(!String(detalhes.pages.failureHeadline).includes(proibido), `sem convite a "${proibido}"`);
  }
});

/* ==========  §15 e §16 · PLANILHA E CARD, UMA AUTORIDADE  ============ */

test("GATE 15.3 · §15 — congelado na investigação é Finalizado também na planilha", () => {
  const base = vista();
  const congelamento = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: base.observed.sample.analyzedSuccess, failed: 0, sufficiency: base.sufficiency,
    }),
    observed: base.observed, record: registro(), mode: "WEB", sufficiency: base.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  const finalizada = vista({
    record: { ...registro(), finalizedAt: "2026-09-10T13:00:00.000Z", finalizedBy: "ator", conclusion: "SUFFICIENT" } as never,
    finalizedBundle: congelamento.bundle,
  });

  /*
   * O DEFEITO DA HOMOLOGAÇÃO, EM UM TESTE.
   *
   * A planilha lia `row.state` — o estado da esteira editorial persistida — e
   * dizia "Pesquisa pendente" na mesma linha em que o card dizia "Finalizado".
   * A frase legada chega aqui de propósito: ela é ignorada quando existe
   * investigação para descrever.
   */
  const linha = radarOperationalRow({ view: finalizada, legacyNextAction: "Colete ou recupere a SERP deste artigo." });
  assert.equal(linha.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.FINALIZED, "FINALIZED_STATE_CONSISTENT_ACROSS_TABLE");
  assert.equal(linha.status, "FINALIZED");

  /* §16 — e a próxima ação não pode ressuscitar a revisão antiga. */
  assert.doesNotMatch(linha.nextAction, /SERP|revis|aprov|Colete/i);
  assert.match(linha.nextAction, /finalizada/i);
});

test("GATE 15.3 · §16 — a próxima ação da planilha é a ação real da Fase 1", () => {
  const legado = "Revise 12 referência(s) pendente(s) na SERP.";

  const pronta = radarOperationalRow({ view: vista({ extractions: PAGINAS.slice(0, 6) }), legacyNextAction: legado });
  assert.equal(pronta.nextAction, "Analisar concorrência", "a coluna diz o que o botão faz");
  assert.equal(pronta.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.READY_TO_ANALYZE);

  const naoIniciada = radarOperationalRow({ view: vista({ record: null }), legacyNextAction: legado });
  /* RADAR 18.8 · §8 — a coluna da planilha lê a MESMA autoridade do botão. */
  assert.equal(naoIniciada.nextAction, "Iniciar Pesquisa Google");
  assert.equal(naoIniciada.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.NOT_STARTED);

  /*
   * SEM INVESTIGAÇÃO, A FRASE ANTIGA SOBREVIVE — e é correto que sobreviva.
   *
   * Um artigo que nunca entrou no Radar não tem estado de Radar para mostrar, e
   * aí não existe card dizendo outra coisa. O conflito que este gate corrige é
   * entre duas leituras da MESMA investigação.
   */
  const semView = radarOperationalRow({ view: null, legacyNextAction: legado });
  assert.equal(semView.nextAction, legado);
  assert.equal(semView.status, "NOT_STARTED");
});

/* ==========  §18 · O CONTRATO, NÃO SÓ A ÁRVORE  ====================== */

test("GATE 15.3 · §18 — os handlers legados não são alcançáveis a partir da Fase 1", () => {
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const detalhes = readFileSync(new URL("../modules/radar/radar-r3-research-details.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /*
   * A GARANTIA É O CONTRATO.
   *
   * Removê-los da árvore renderizada bastaria para a homologação de hoje e
   * falharia na primeira vez que alguém religasse uma prop "que já existia". O
   * Workbench não declara mais essas props, e a página não as passa: religar
   * qualquer uma exige uma decisão explícita, com nome e diff.
   */
  for (const prop of ["onReviewSerp", "onStartSerpAnalysis", "onConfirmSerpCuration", "onInvestigationAction", "onResearchDecision", "onConfirmResearchCuration", "onRefreshSerp", "onFocusAdjacent"]) {
    assert.ok(!new RegExp(`${prop}[?:=]`).test(workbench), `o Workbench não declara nem recebe ${prop}`);
    assert.ok(!new RegExp(`${prop}=\\{`).test(page), `a página não passa ${prop} ao Workbench`);
  }

  /* O painel de consulta não tem por onde receber handler nenhum. */
  assert.match(detalhes, /export function RadarR3ResearchDetails\(\{ model, view \}/, "dois dados, zero handlers");
  /* A borda de palavra evita casar com o "onFailures" de "extractionFailures". */
  assert.ok(!/\bon[A-Z]\w+\s*[?:]/.test(detalhes), "e nenhuma prop de callback no contrato dele");

  /* §17 — o código antigo continua no repositório; ele é que não é montado. */
  const painelLegado = readFileSync(new URL("../modules/radar/radar-r3-serp-panel.tsx", import.meta.url), "utf8");
  assert.match(painelLegado, /export function RadarR3SerpPanel/, "nada foi apagado");
  assert.ok(!workbench.includes("RadarR3SerpPanel") && !page.includes("RadarR3SerpPanel"), "e nada o monta");
});

/* ==============  REAL_PROVIDER_CALLS = 0, VERIFICADO  ================= */

test("GATE 15.3 · §24 — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});

/* ==========  REGRESSÃO · IDENTIDADE DE LISTA  ======================== */

test("REGRESSÃO · toda lista renderizada tem identidade única, mesmo com URL repetida", () => {
  /*
   * O DEFEITO QUE O SMOKE ENCONTROU.
   *
   * "Encountered two children with the same key" na lista de falhas: a MESMA
   * página falhou duas vezes na mesma rodada — uma como resultado da SERP
   * canônica (chave posicional) e outra como referência descoberta pela
   * pesquisa (chave `referenceId`). Duas tentativas de origens diferentes sobre
   * o mesmo endereço, as duas verdadeiras.
   *
   * A causa não foi a lista de falhas: foi a projeção achatar objetos do
   * domínio em strings de exibição e jogar fora os identificadores que já
   * existiam. Por isso este teste varre TODAS as listas que a tela usa como
   * chave, e não apenas a que quebrou.
   */
  const view = vista();
  const urlRepetida = "https://www.creamy.com.br/rotina-para-pele-oleosa-1/p";
  const detalhes = buildRadarResearchDetails({
    view,
    extractionFailures: [
      { url: urlRepetida, code: "BLOCKED", message: "403", status: 403 },
      { url: urlRepetida, code: "TIMEOUT", message: "sem resposta", status: null },
    ].map((item, indice) => ({ ...item, key: indice === 0 ? "organic:4" : "ref:abc123" })) as never,
  });

  assert.equal(detalhes.pages.failures.length, 2, "as duas tentativas continuam visíveis");
  assert.equal(detalhes.pages.failures[0].url, detalhes.pages.failures[1].url, "sobre a mesma URL");

  const unico = (nome: string, ids: string[]) => {
    const vistos = new Set(ids);
    assert.equal(vistos.size, ids.length, `${nome}: chaves duplicadas — ${ids.filter((id, i) => ids.indexOf(id) !== i).join(", ")}`);
  };

  unico("falhas", detalhes.pages.failures.map(item => item.id));
  unico("concorrentes", detalhes.competitors.map(item => item.referenceId || item.url));
  unico("fontes", detalhes.evidence.sources.map(item => item.id));
  unico("evidência factual", detalhes.evidence.factual.map(item => item.id));
  unico("observações", detalhes.evidence.observations.map(item => item.id));
  unico("conflitos", detalhes.evidence.conflicts.map(item => item.id));
  unico("necessidades", detalhes.evidence.needs.map(item => item.id));
  unico("limitações", detalhes.evidence.limitations.map(item => item.id));
  unico("histórico", detalhes.history.map(item => item.id));
});

test("REGRESSÃO · nenhuma lista da tela é chaveada por texto de exibição", () => {
  /*
   * A REGRA QUE IMPEDE A REINCIDÊNCIA.
   *
   * Texto não é identidade: dois conceitos podem ter o mesmo rótulo, duas
   * fontes o mesmo domínio, duas lacunas o mesmo assunto contra referências
   * diferentes. Enquanto a tela chavear por conteúdo, a colisão volta na
   * primeira fixture real que repetir uma frase.
   */
  const fonte = readFileSync(new URL("../modules/radar/radar-r3-research-details.tsx", import.meta.url), "utf8");
  const chaves = [...fonte.matchAll(/key=\{([^}]+)\}/g)].map(item => item[1].trim());
  assert.ok(chaves.length >= 8, "a tela tem listas para verificar");

  for (const chave of chaves) {
    assert.ok(
      /\.id\b|referenceId/.test(chave),
      `chave derivada de conteúdo: key={${chave}} — use o identificador do domínio`,
    );
  }
});
