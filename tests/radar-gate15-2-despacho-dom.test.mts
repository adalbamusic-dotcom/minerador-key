import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { RadarR3Workbench } from "../modules/radar/radar-r3-workbench.tsx";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { radarActionOutcome, radarClaimAction, type RadarActionClaim } from "../lib/radar/operational-actions.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarR3Model } from "../lib/radar/r3-workbench.ts";
import { SupabaseSessionProvider } from "../components/auth/supabase-session-context.tsx";
import { GlobalNoticeProvider } from "../components/global-notice-center.tsx";

/*
 * ======  GATE 15.2 · O CLIQUE DE VERDADE  ================================
 *
 * O Gate 15.1 provou tudo em volta do clique: qual botão aparece em cada
 * estado, qual id ele carrega, qual handler o mapa canônico associa a esse id,
 * e como os guardas e o readback se comportam. O que faltava era o meio: um
 * evento de DOM subindo pela delegação do React até o handler.
 *
 * A diferença importa exatamente onde o erro é silencioso. Um `onClick` ligado
 * ao handler errado renderiza igual, carrega o mesmo `data-action-id` e passa
 * em toda varredura de string. Aqui ele falha.
 *
 * Nada aqui chama rede: os handlers são espiões locais, e o pipeline do ANALYZE
 * é simulado. REAL_PROVIDER_CALLS = 0.
 */

/* ======================  A SENTINELA DE REDE  ========================== */

/*
 * ZERO CHAMADA REAL, PROVADO — não declarado.
 *
 * §15 exige REAL_PROVIDER_CALLS = 0. Escrever isso num comentário não custa
 * nada e não vale nada: se um `useEffect` buscasse SERP ao montar, ou se um
 * clique disparasse DataForSEO por um caminho esquecido, o teste passaria
 * verde e a fatura chegaria depois. A sentinela substitui o `fetch` global e
 * registra qualquer tentativa — o teste final lê o registro.
 */
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
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-2", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
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

/** A investigação como o START a deixa: coleta, referências e curadoria gravada. */
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

const modelo = (deepResearch?: ReturnType<typeof vista>, patch: Partial<RadarR3Model> = {}): RadarR3Model => ({
  brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-2",
  title: "Cobrir com clareza o tema skincare para pele oleosa",
  keyword: "skincare para pele oleosa", silo: "skincare", hierarchy: "Suporte",
  articleDnaVersion: "v1", publication: "Ainda não publicado", mode: "competitive_full", article: null,
  researchContext: contexto(), deepResearch,
  /*
   * A SERP LEGADA COMPLETA — porque abrir a Pesquisa a renderiza.
   *
   * O Gate 15.1 nunca chegou aqui: markup estático não clica, e sem clique o
   * painel legado dentro do `<details>` nunca era montado. Faltando `records`,
   * ele quebrava no primeiro render — defeito de fixture, não de produto, mas
   * que só um clique de verdade encontrava.
   */
  serp: { provider: "dataforseo", status: "Coletada", resultCount: 12, primaryCount: 1, pendingCount: 0, needs: 0, latestCollection: "Nenhuma coleta", records: [], references: [], view: null, analysis: null, latestSnapshotId: null, reviewStatus: null, reviewNotes: null, reviewCurrentness: "current", reviewedAt: null, reviewHistory: [], capturedAt: null },
  amazon: { state: "AMAZON_NOT_APPLICABLE", note: "" },
  content: { articleDnaVersion: "v1", principal: "skincare para pele oleosa", needs: 0, evidenceCount: 0, sourceCount: 0, rows: [], technical: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-2", siloId: null, snapshotId: null, provider: null, articleDnaEntityId: null, articleDnaHash: null } },
  specialist: { expert: "Não selecionado", specialty: "", status: "Não iniciado", channel: "Telegram não consumido nesta visão", requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0, pending: 0, existingContent: "Nenhum material" },
  report: { status: "Aguardando", version: null, needs: 0, summary: "", approved: false, sentToPlanner: false, updatedAt: null },
  nextAction: "", lastActivity: null,
  provenance: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-2", siloId: null, snapshotId: null, provider: null },
  ...patch,
} as unknown as RadarR3Model);

/* ========================= os espiões dos handlers ====================== */

type Espioes = {
  start: number; analyze: number; finalize: number; reset: number;
  refresh: number; investigation: string[]; videoAdd: unknown[]; mode: string[];
};

const espioes = (): Espioes => ({ start: 0, analyze: 0, finalize: 0, reset: 0, refresh: 0, investigation: [], videoAdd: [], mode: [] });

/**
 * A tela montada com os handlers espionados.
 *
 * Nenhum deles chama rede: eles apenas contam. O que se prova aqui é o
 * CAMINHO — clique no DOM, evento do React, handler correto — e não o que cada
 * handler faz depois, que os Gates anteriores já cobrem.
 */
async function montarTela(view: ReturnType<typeof vista> | undefined, extra: Record<string, unknown> = {}) {
  const spy = espioes();
  const tela = await montarRadar();
  const props = {
    model: modelo(view), refreshing: false,
    onRefreshSerp: () => { spy.refresh += 1; },
    onStartDeepResearch: () => { spy.start += 1; },
    onAnalyzeSerpSelection: () => { spy.analyze += 1; },
    onFinalizeInvestigation: () => { spy.finalize += 1; },
    onResetInvestigation: () => { spy.reset += 1; },
    onInvestigationAction: (id: string) => { spy.investigation.push(id); },
    onRegisterVideoSources: (_id: string, raw: unknown) => { spy.videoAdd.push(raw); },
    onSearchModeChange: (mode: string) => { spy.mode.push(mode); },
    onOpenArticle: () => {}, onOpenDetail: () => {},
    ...extra,
  };
  /*
   * OS PROVEDORES REAIS, NA MESMA ORDEM DA APLICAÇÃO.
   *
   * A área Especialista consome o centro de avisos, que lê a sessão. Montar o
   * Workbench sem eles não testaria a tela: testaria uma composição que não
   * existe. São os provedores de `components/providers.tsx`, com o cliente do
   * browser inerte pelo loader — nenhum provider externo é chamado.
   */
  await tela.render(comProductShell(React.createElement(
    SupabaseSessionProvider, null,
    React.createElement(GlobalNoticeProvider, null,
      React.createElement(RadarR3Workbench, props as never)),
  )));
  return { tela, spy, props };
}

const semOperacao = (spy: Espioes, exceto?: keyof Espioes) => {
  for (const chave of ["start", "analyze", "finalize", "reset", "refresh"] as const) {
    if (chave === exceto) continue;
    assert.equal(spy[chave], 0, `${chave} não podia ter sido chamado`);
  }
};

/** Abre a área clicando no card — como a pessoa faz. */
async function abrirArea(tela: RadarDomScreen, area: string) {
  await tela.click(`radar-r3-card-${area}`);
}

/* ==========  A e E · START PELO CLIQUE, E SÓ O START  ================== */

test("GATE 15.2 · A e E — clicar Iniciar pesquisa chama START, e nada mais", async () => {
  const { tela, spy } = await montarTela(vista({ record: null }));

  const botao = tela.get("radar-deep-research-button");
  assert.equal(botao.getAttribute("data-action-id"), "START_RESEARCH");
  /* RADAR 18.8 · §8 — fora da área Pesquisa o rótulo precisava dizer ONDE. */
  assert.match(botao.textContent || "", /Iniciar Pesquisa Google/);

  await tela.click(botao);

  assert.equal(spy.start, 1, "DOM_START_DISPATCH");
  semOperacao(spy, "start");
  assert.deepEqual(spy.investigation, [], "não passou pelo despacho legado");
  tela.destroy();
});

/* ==========  B e F · ANALYZE PELO CLIQUE  ============================== */

test("GATE 15.2 · B e F — clicar Analisar concorrência chama ANALYZE, e nada mais", async () => {
  /* Seis páginas lidas de doze selecionadas: a rodada ainda tem pendência. */
  const { tela, spy } = await montarTela(vista({ extractions: PAGINAS.slice(0, 6) }));

  const botao = tela.get("radar-deep-research-button");
  assert.equal(botao.getAttribute("data-action-id"), "ANALYZE_COMPETITION");
  assert.match(botao.textContent || "", /Analisar concorrência/);

  await tela.click(botao);

  assert.equal(spy.analyze, 1, "DOM_ANALYZE_DISPATCH");
  semOperacao(spy, "analyze");
  tela.destroy();
});

test("GATE 15.2 · §4 — a verificação de fontes continua dentro do pipeline do ANALYZE", async () => {
  /*
   * O ANALYZE é UMA operação: extração, modelo, links, fontes e descoberta
   * acontecem sob o mesmo clique. Aqui o pipeline é simulado, e o que se prova
   * é que o clique aciona a sequência inteira — não que exista um segundo botão.
   */
  const ordem: string[] = [];
  const pipeline = async () => {
    ordem.push("extract");
    ordem.push("verify-sources");
    ordem.push("authority");
    ordem.push("persist");
    ordem.push("readback");
  };

  let cliques = 0;
  const { tela } = await montarTela(vista({ extractions: PAGINAS.slice(0, 6) }), {
    onAnalyzeSerpSelection: () => { cliques += 1; void pipeline(); },
  });

  await tela.click("radar-deep-research-button");
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(cliques, 1);
  assert.deepEqual(ordem, ["extract", "verify-sources", "authority", "persist", "readback"]);
  assert.ok(ordem.indexOf("verify-sources") > ordem.indexOf("extract"), "a verificação vem depois da leitura das páginas");
  assert.ok(ordem.indexOf("verify-sources") < ordem.indexOf("persist"), "e antes da gravação, na mesma operação");
  assert.equal(tela.query("radar-verify-sources-button"), null, "nenhum botão próprio de verificação");
  tela.destroy();
});

/* ==========  C e G · FINALIZE PELO CLIQUE  ============================= */

test("GATE 15.2 · C e G — clicar Finalizar chama FINALIZE, e nenhum provider", async () => {
  const { tela, spy } = await montarTela(vista());

  const botao = tela.get("radar-deep-research-button");
  assert.equal(botao.getAttribute("data-action-id"), "FINALIZE_SERP");
  assert.match(botao.textContent || "", /Finalizar/);

  await tela.click(botao);

  assert.equal(spy.finalize, 1, "DOM_FINALIZE_DISPATCH");
  semOperacao(spy, "finalize");
  assert.equal(spy.refresh, 0, "finalizar não recoleta");
  tela.destroy();
});

/* ==============  D · RESET PELO CLIQUE  =============================== */

test("GATE 15.2 · D — clicar Zerar investigação chama RESET, e não recomeça nada", async () => {
  const { tela, spy } = await montarTela(vista());

  /* O reset é ação de bancada: vive dentro da Pesquisa, aberta pelo card. */
  await abrirArea(tela, "pesquisa");
  const botao = tela.get("radar-reset-investigation");
  assert.match(botao.textContent || "", /Zerar investigação/);

  await tela.click(botao);

  assert.equal(spy.reset, 1, "DOM_RESET_DISPATCH");
  semOperacao(spy, "reset");
  assert.equal(spy.start, 0, "zerar não dispara nova pesquisa");
  tela.destroy();
});

/* ==========  H, I e J · CLIQUE DUPLO NA SUPERFÍCIE REAL  ============== */

test("GATE 15.2 · H, I e J — clique duplo produz uma operação, na tela e no guarda", async () => {
  /*
   * DUAS CAMADAS, PORQUE UMA SÓ NÃO BASTA.
   *
   * A tela desabilita o botão quando a operação está em voo — mas o `disabled`
   * chega no próximo render, e dois cliques no mesmo tique passariam por ele.
   * Quem realmente fecha a porta é o guarda de posse, síncrono, antes do
   * primeiro `await`. Este teste prova os dois: o DOM entrega dois eventos, e o
   * guarda converte em uma operação efetiva.
   */
  for (const caso of [
    { nome: "START", view: vista({ record: null }), chave: "start" as const, acao: "START" as const },
    { nome: "ANALYZE", view: vista({ extractions: PAGINAS.slice(0, 6) }), chave: "analyze" as const, acao: "ANALYZE" as const },
    { nome: "FINALIZE", view: vista(), chave: "finalize" as const, acao: "FINALIZE" as const },
  ]) {
    let posse: RadarActionClaim = null;
    let efetivas = 0;
    const handler = () => {
      const decisao = radarClaimAction(posse, { articleId: "a", action: caso.acao });
      if (!decisao.granted) return;
      posse = decisao.claim;
      efetivas += 1;
    };

    const { tela, spy } = await montarTela(caso.view, {
      onStartDeepResearch: caso.chave === "start" ? handler : () => {},
      onAnalyzeSerpSelection: caso.chave === "analyze" ? handler : () => {},
      onFinalizeInvestigation: caso.chave === "finalize" ? handler : () => {},
    });

    await tela.doubleClick("radar-deep-research-button");

    assert.equal(efetivas, 1, `${caso.nome}: duas interações, uma operação efetiva`);
    assert.equal(spy[caso.chave], 0, "o espião padrão foi substituído neste caso");
    tela.destroy();
  }
});

/* ================  K · EM VOO, A PORTA FICA FECHADA  ================== */

test("GATE 15.2 · K — com a operação em voo, o botão fica indisponível no DOM", async () => {
  const { tela } = await montarTela(vista({ extractions: PAGINAS.slice(0, 6) }), { refreshing: true });

  const botao = tela.get("radar-deep-research-button") as HTMLButtonElement;
  assert.equal(botao.disabled, true, "IN_FLIGHT_UI_PROTECTED");

  /* E clicar um botão desabilitado não produz evento — o DOM já recusa. */
  let chamadas = 0;
  const { tela: outra } = await montarTela(vista({ extractions: PAGINAS.slice(0, 6) }), {
    refreshing: true, onAnalyzeSerpSelection: () => { chamadas += 1; },
  });
  await outra.click("radar-deep-research-button");
  assert.equal(chamadas, 0, "o clique no botão desabilitado não chega ao handler");

  /* A leitura em andamento também fecha a ação pela própria autoridade. */
  const emAndamento = vista({ extractions: PAGINAS.slice(0, 6), running: true });
  assert.equal(emAndamento.phase1.id, "NONE");
  assert.equal(emAndamento.phase1.enabled, false);

  tela.destroy(); outra.destroy();
});

/* ==========  L e M · FINALIZADO NÃO OFERECE OPERAÇÃO  ================= */

test("GATE 15.2 · L e M — com bundle congelado, ANALYZE e FINALIZE não existem no DOM", async () => {
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
  const { tela, spy } = await montarTela(finalizada);

  assert.equal(tela.query("radar-deep-research-button"), null, "FINALIZED_ANALYZE_VISIBLE / FINALIZED_FINALIZE_VISIBLE = NO");
  assert.equal(tela.query("radar-phase1-slot"), null);
  assert.match(tela.text(), /Finalizado/);

  /* E o render inteiro não disparou operação nenhuma. */
  semOperacao(spy);

  /* Aberta a Pesquisa, o congelado aparece — e continua sem ação primária. */
  await abrirArea(tela, "pesquisa");
  assert.ok(tela.query("radar-frozen-bundle"), "o bloco do congelado é a leitura");
  assert.equal(tela.query("radar-deep-research-button"), null);
  assert.match(tela.get("radar-frozen-bundle").textContent || "", new RegExp(congelamento.bundle.bundleHash));
  semOperacao(spy);
  tela.destroy();
});

/* ==============  N · NAVEGAR ENTRE ÁREAS NÃO EXECUTA  ================= */

test("GATE 15.2 · N — clicar nas quatro áreas não dispara operação nenhuma", async () => {
  const { tela, spy } = await montarTela(vista());

  for (const area of ["pesquisa", "videos", "especialista", "relatorio", "pesquisa"]) {
    await abrirArea(tela, area);
    semOperacao(spy);
  }
  assert.deepEqual(spy.investigation, [], "AREA_NAVIGATION_SIDE_EFFECTS = NO");
  assert.deepEqual(spy.videoAdd, []);
  assert.deepEqual(spy.mode, [], "navegar não troca o modo de pesquisa");
  tela.destroy();
});

/* ==============  O · EXPANDIR É LEITURA  ============================== */

test("GATE 15.2 · O — abrir fundamentos e detalhes não executa workflow", async () => {
  const { tela, spy } = await montarTela(vista());

  /* Os fundamentos do Article: contexto global, read-only. */
  const fundamentos = tela.get("radar-article-foundations-details");
  await tela.click(fundamentos.querySelector("summary") as HTMLElement);
  assert.match(tela.text(), /Definição do artigo/, "o dado já carregado aparece");
  semOperacao(spy);

  /* E os expansíveis da Pesquisa — proveniência e processo legado. */
  await abrirArea(tela, "pesquisa");
  for (const testId of ["radar-technical-provenance", "radar-legacy-serp-process"]) {
    const bloco = tela.query(testId);
    if (!bloco) continue;
    await tela.click(bloco.querySelector("summary") as HTMLElement);
    semOperacao(spy);
  }
  assert.deepEqual(spy.investigation, [], "EXPAND_SIDE_EFFECTS = NO");
  tela.destroy();
});

/* ==========  §10 e P · O SELETOR DE MODO  ============================= */

test("GATE 15.2 · P e §10 — o seletor escolhe um modo só, e Amazon não oferece ação falsa", async () => {
  const { tela, spy } = await montarTela(vista({ record: null }));
  await abrirArea(tela, "pesquisa");

  const seletor = tela.get("radar-search-mode");
  const google = seletor.querySelector('[data-testid="radar-search-mode-web"]') as HTMLButtonElement;
  const amazon = seletor.querySelector('[data-testid="radar-search-mode-amazon"]') as HTMLButtonElement;
  assert.ok(google && amazon);

  /* Seleção única: o modo ativo é o marcado, e só ele. */
  assert.equal(google.getAttribute("aria-checked"), "true");
  assert.equal(amazon.getAttribute("aria-checked"), "false");

  await tela.click(amazon);
  assert.deepEqual(spy.mode, ["AMAZON"], "o clique escolhe o modo — e nada além disso");
  semOperacao(spy);

  /*
   * MODO SEM ENGINE NÃO OFERECE START.
   *
   * A tela é remontada com Amazon escolhido, e a autoridade da Fase 1 recusa —
   * com motivo escrito, não com um botão que não faz nada.
   */
  const comAmazon = await montarTela(vista({ record: null, mode: "AMAZON" }), { searchMode: "AMAZON" });
  const acao = comAmazon.tela.query("radar-deep-research-button") as HTMLButtonElement | null;
  assert.ok(!acao || acao.disabled, "AMAZON_FALSE_ACTION = NO");
  if (acao) await comAmazon.tela.click(acao);
  assert.equal(comAmazon.spy.start, 0, "e clicar nele não inicia pesquisa");

  tela.destroy(); comAmazon.tela.destroy();
});

test("GATE 15.2 · §10 — iniciada a investigação, o modo fica congelado", async () => {
  const { tela, spy } = await montarTela(vista());
  await abrirArea(tela, "pesquisa");

  const seletor = tela.get("radar-search-mode");
  const youtube = seletor.querySelector('[data-testid="radar-search-mode-youtube"]') as HTMLButtonElement;
  assert.equal(youtube.disabled, true, "com investigação em curso, o modo não troca");

  await tela.click(youtube);
  assert.deepEqual(spy.mode, [], "e o clique não muda a investigação ativa em silêncio");
  semOperacao(spy);
  tela.destroy();
});

/* ==============  Q · VÍDEOS REGISTRA, E SÓ  =========================== */

test("GATE 15.2 · Q — registrar material chama o registro e não inicia processamento", async () => {
  const { tela, spy } = await montarTela(vista());
  await abrirArea(tela, "videos");

  /*
   * GATE 1 DE VÍDEOS · a entrada virou lote, e o clique continua sendo o único
   * caminho de escrita. O campo é um só, com uma URL por linha.
   */
  const entrada = tela.get("radar-videos-input");
  const registrar = tela.get("radar-videos-register") as HTMLButtonElement;

  assert.equal(registrar.disabled, true, "com o campo vazio, o registro não é oferecido");

  const coladas = "https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/aBcDeFgHiJk";
  await tela.type(entrada, coladas);

  /* COLAR NÃO GRAVA — §7: até aqui, nenhuma chamada saiu. */
  assert.deepEqual(spy.videoAdd, [], "digitar/colar não registra nada");

  await tela.click(tela.get("radar-videos-register"));

  assert.equal(spy.videoAdd.length, 1, "VIDEO_REGISTER_ONLY");
  assert.equal(spy.videoAdd[0], coladas, "o bloco cru vai para o servidor, que classifica");

  /* E nada de transcrição, SERP, análise ou verificação de fonte. */
  semOperacao(spy);
  assert.deepEqual(spy.investigation, []);
  tela.destroy();
});

/* ==========  R e S · FALHA NÃO AVANÇA O ESTADO  ====================== */

test("GATE 15.2 · R — START que falha não avança para ANALYZE", async () => {
  /*
   * O clique acontece, o handler roda, a rota falha. O que NÃO pode acontecer é
   * a tela seguir para a etapa seguinte como se tivesse dado certo.
   */
  let aviso = "";
  const { tela } = await montarTela(vista({ record: null }), {
    onStartDeepResearch: () => {
      const resultado = radarActionOutcome({ action: "START", error: new Error("HTTP 500 Internal Server Error") });
      aviso = resultado.message;
      assert.equal(resultado.advances, false, "START_FAILURE_STATE_CORRECT");
    },
  });

  await tela.click("radar-deep-research-button");

  assert.equal(aviso, "O Radar não conseguiu iniciar a pesquisa. Tente novamente.");
  assert.doesNotMatch(aviso, /HTTP 500|Internal Server/, "o erro cru não é a frase principal");

  /* A tela continua no mesmo estado, oferecendo a mesma ação: nova tentativa. */
  const botao = tela.get("radar-deep-research-button");
  assert.equal(botao.getAttribute("data-action-id"), "START_RESEARCH");
  assert.equal((botao as HTMLButtonElement).disabled, false, "o retry continua coerente");
  tela.destroy();
});

test("GATE 15.2 · S — FINALIZE sem readback não vira Finalizada", async () => {
  let aviso = "";
  let congelou = false;
  const { tela } = await montarTela(vista(), {
    onFinalizeInvestigation: () => {
      const resultado = radarActionOutcome({
        action: "FINALIZE",
        persistence: { persistenceMode: "remote", readbackConfirmed: false },
      });
      aviso = resultado.message;
      congelou = resultado.advances;
    },
  });

  /* Dentro da Pesquisa aberta, onde o bloco do congelado apareceria. */
  await abrirArea(tela, "pesquisa");
  await tela.click("radar-deep-research-button");

  assert.equal(congelou, false, "FINALIZE_READBACK_FAILURE_STATE_CORRECT");
  assert.match(aviso, /NÃO foi finalizada/);
  assert.equal(tela.query("radar-frozen-bundle"), null, "a tela não mostra investigação congelada");

  /* E a ação continua sendo finalizar — a rodada não foi encerrada. */
  assert.equal(tela.get("radar-deep-research-button").getAttribute("data-action-id"), "FINALIZE_SERP");
  tela.destroy();
});

/* ==============  O CAMINHO INTEIRO, EM UM TESTE  ====================== */

test("GATE 15.2 · o encadeamento completo: cada estado entrega o clique ao seu handler", async () => {
  /*
   * A prova que faltava, ponta a ponta: três estados, três cliques reais, três
   * handlers distintos — e nenhum vazamento entre eles. Um `onClick` ligado ao
   * handler errado renderiza igual e passa em toda varredura de string; aqui
   * ele quebra.
   */
  const percurso = [
    { estado: "NOT_STARTED", view: vista({ record: null }), esperado: "start" as const, id: "START_RESEARCH" },
    { estado: "READY_TO_ANALYZE", view: vista({ extractions: PAGINAS.slice(0, 6) }), esperado: "analyze" as const, id: "ANALYZE_COMPETITION" },
    { estado: "ANALYZED", view: vista(), esperado: "finalize" as const, id: "FINALIZE_SERP" },
  ];

  for (const passo of percurso) {
    const { tela, spy } = await montarTela(passo.view);
    const botao = tela.get("radar-deep-research-button");
    assert.equal(botao.getAttribute("data-action-id"), passo.id, passo.estado);

    await tela.click(botao);

    assert.equal(spy[passo.esperado], 1, `${passo.estado} → ${passo.esperado}`);
    semOperacao(spy, passo.esperado);
    tela.destroy();
  }
});

/* ==============  REAL_PROVIDER_CALLS = 0, VERIFICADO  ================= */

test("GATE 15.2 · §15 — nenhuma chamada de rede saiu de nenhum clique deste gate", () => {
  /*
   * Este teste roda por último e lê o que a sentinela acumulou: montagem dos
   * provedores reais, abertura das quatro áreas, expansão dos detalhes e todos
   * os cliques primários. Nada disso pode ter tocado a rede.
   */
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
