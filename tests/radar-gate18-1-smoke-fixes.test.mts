import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { radarSufficiencyLabel } from "../lib/radar/investigation-sufficiency.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import { buildRadarSourceVerificationPlan, radarSourceVerificationTargets, radarSourceId } from "../lib/radar/source-authority.ts";
import { buildRadarExternalSourceResearch } from "../lib/radar/link-and-source-research.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarEvidenceClaims } from "../lib/radar/claim-evidence.ts";
import { radarOperationalStatus } from "../lib/radar/operational-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 18.1 · O QUE O PRIMEIRO SMOKE REAL ENCONTROU  ============
 *
 * A parte cara funcionou: reset real, DataForSEO real, 1 canônica + 3
 * auxiliares, 19 observadas, 18 selecionadas, 12 analisadas, 6 sem acesso, 11
 * comparáveis, persistência e readback confirmados.
 *
 * O que quebrou foi a LEITURA daquilo, e quatro defeitos apareceram de uma vez:
 * a suficiência lia a curadoria errada, o estado usava vocabulário de um fluxo
 * extinto, a verificação de fontes pedia ao servidor ids que ele não podia
 * conhecer, e modos não executados herdavam a amostra do Google.
 *
 * Cada teste aqui reproduz um deles com os NÚMEROS REAIS do smoke. Nenhum
 * provider é chamado: sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ================= a fixture, com os números do smoke ================== */

const link = (destino: string, dominio: string): RadarObservedLink => ({
  destinationUrl: destino, destinationDomain: dominio, kind: "EXTERNAL",
  anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[], links: RadarObservedLink[] = []): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: links.length,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: links, error: null,
});

/*
 * DUAS FONTES INSTITUCIONAIS, UMA POR PÁGINA — e as duas no MESMO domínio.
 *
 * O teste G precisa que duas URLs distintas do mesmo domínio produzam sourceIds
 * distintos; sem isso, o dedupe por domínio esconderia a colisão.
 */
const FONTE_A = "https://www.aad.org/public/diseases/oily-skin";
const FONTE_B = "https://www.aad.org/public/everyday-care/skin-care-basics";

/* 18 selecionadas: 12 lidas (das quais 11 comparáveis) e 6 sem acesso. */
const LIDAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("É seguro usar ácido salicílico na gravidez?");
  const links = index < 6 ? [link(FONTE_A, "www.aad.org")] : index < 9 ? [link(FONTE_B, "www.aad.org")] : [];
  /* A décima segunda é vitrine: lida, e ainda assim não comparável — 11 de 12. */
  if (index === 11) {
    return {
      ...pagina(`A${index}`, ["Ofertas da semana"], links),
      url: "https://loja-parceira.com.br/produto/serum-pele-oleosa",
      title: "Comprar sérum para pele oleosa — melhor preço",
      h1: ["Comprar sérum para pele oleosa"],
    };
  }
  return pagina(`A${index}`, headings, links);
});

const SEM_ACESSO = Array.from({ length: 6 }, (_, index) => ({
  key: `organic:${index + 13}`,
  url: `https://bloqueado-${index}.com.br/pele-oleosa`,
  code: index % 2 ? "BLOCKED" : "TIMEOUT",
  message: index % 2 ? "403" : "sem resposta",
  status: index % 2 ? 403 : null,
  observedAt: "2026-09-10T11:00:00.000Z",
}));

const OBSERVADAS = 19;

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v18", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
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

const SNAPSHOT = {
  query: "skincare para pele oleosa",
  organicResults: Array.from({ length: OBSERVADAS }, (_, index) => ({
    position: index + 1,
    title: `Resultado ${index + 1}`,
    domain: `d${index}.com`,
    url: LIDAS[index]?.url || SEM_ACESSO[index - 12]?.url || `https://outro-${index}.com.br/x`,
  })),
};

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

/**
 * A investigação como o smoke a deixou: START executado, curadoria automática
 * gravada, ANALYZE concluído. E, de propósito, `selectedReferences` NÃO é
 * informado — porque a curadoria da SERP canônica legada não é mais alimentada.
 */
function vista(patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never,
    extractions: LIDAS, extractionFailures: SEM_ACESSO.length,
    extractionFailureUrls: SEM_ACESSO.map(item => item.url),
    observedAt: "2026-09-10T12:00:00.000Z", ...patch,
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
  return buildRadarDeepResearchView({ ...base, record: { ...recordBase, researchCuration: curadoria } });
}

/* ==========  A, B, D · A SUFICIÊNCIA LÊ A AMOSTRA REAL  ============== */

test("GATE 18.1 · A, B e D — com páginas analisadas, a suficiência descreve a análise real", () => {
  const view = vista();

  /* A fixture precisa reproduzir o smoke, ou o teste não prova nada. */
  assert.ok(view.observed.sample.analyzedSuccess >= 12, `analisadas: ${view.observed.sample.analyzedSuccess}`);
  assert.ok(view.observed.sample.comparablePages >= 11, `comparáveis: ${view.observed.sample.comparablePages}`);
  assert.ok(view.curation.selectedCount > 0, `selecionadas pela curadoria da pesquisa: ${view.curation.selectedCount}`);

  /*
   * O DEFEITO: a suficiência recebia `selectedReferences` da curadoria da SERP
   * canônica — que ninguém confirma desde que a seleção virou automática — e
   * devolvia BLOCKED. Aqui `selectedReferences` nem é informado, exatamente
   * como na página real.
   */
  assert.notEqual(view.sufficiency.level, "BLOCKED", "FALSE_NOT_STARTED_STATUS = NO");
  assert.notEqual(radarSufficiencyLabel(view.sufficiency.level), "Análise não iniciada");
  assert.notEqual(view.sufficiency.headline, "Investigação sem amostra", "FALSE_NO_SAMPLE_STATUS = NO");

  /* E a leitura passa a concordar com o card, que já dizia Pronto/Parcial. */
  assert.ok(view.sufficiency.canBuildCompetitiveModel, "com 11 comparáveis, o modelo pode ser construído");
  assert.ok(["SUFFICIENT", "PARTIAL_BUT_USABLE"].includes(view.sufficiency.level), `nível: ${view.sufficiency.level}`);
});

test("GATE 18.1 · A e B — sem curadoria da pesquisa, o comportamento antigo continua valendo", () => {
  /*
   * A correção não pode inverter o caso legítimo: uma linha sem investigação
   * multi-query continua respondendo pelos parâmetros informados. Bloqueado por
   * falta de amostra ainda é uma resposta correta — quando é verdade.
   */
  const semNada = buildRadarDeepResearchView({
    context: contexto(), record: null, snapshot: SNAPSHOT as never,
    extractions: [], selectedReferences: 0, curationConfirmed: false,
    observedAt: "2026-09-10T12:00:00.000Z",
  });
  assert.equal(semNada.sufficiency.level, "BLOCKED");
  assert.equal(semNada.sufficiency.headline, "Investigação sem amostra");
});

/* ==========  C · O VOCABULÁRIO DA REVISÃO LEGADA  =================== */

test("GATE 18.1 · C — a Fase 1 não mostra Aguardando revisão humana", () => {
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");

  /*
   * O estado interno continua o mesmo — a análise terminou e a investigação não
   * foi finalizada. O que sai é o RÓTULO, que reintroduzia na tela a etapa de
   * revisão da SERP que o Gate 15.3 removeu.
   */
  /* A frase não pode ser RENDERIZADA; citá-la no comentário que explica a remoção é o oposto de reintroduzi-la. */
  assert.ok(!/AWAITING_REVIEW: "Aguardando revisão humana"/.test(workbench), "LEGACY_HUMAN_REVIEW_STATUS_VISIBLE = NO");
  assert.match(workbench, /AWAITING_REVIEW: "Analisada"/);

  const view = vista();
  assert.equal(view.state, "AWAITING_REVIEW", "o estado interno não mudou");
  assert.equal(radarOperationalStatus({ view }).status !== "NOT_STARTED", true, "e a leitura operacional já era coerente");
});

/* ==========  E e N · FALHA FINAL NÃO É PENDÊNCIA  =================== */

test("GATE 18.1 · E e N — 6 sem acesso são limitação, e FINALIZE continua disponível", () => {
  const view = vista();

  assert.equal(view.observed.sample.failedFinal, SEM_ACESSO.length, "FAILED_FINAL_PRESERVED");

  /* PENDING = 0: nada ficou por analisar, e o que falhou não volta para a fila. */
  const acao = radarPhase1Action({
    state: view.state, contextReady: true, hasPrimaryQuery: true, running: false, mode: "WEB",
    selected: view.curation.selectedCount, pending: 0, failed: SEM_ACESSO.length,
    analyzed: view.observed.sample.analyzedSuccess, sufficiency: view.sufficiency,
  });
  assert.equal(acao.id, "FINALIZE_SERP", "FINALIZE_AVAILABLE");
  assert.equal(acao.enabled, true);
  assert.equal(acao.label, "Finalizar pesquisa", "FINAL_ACTION_LABEL");
});

test("GATE 18.1 · §15 — o vocabulário da ação é pesquisa, e a autoridade não mudou", () => {
  const fonte = readFileSync(new URL("../lib/radar/serp-phase1.ts", import.meta.url), "utf8");
  assert.ok(!/label: "Finalizar SERP"/.test(fonte));
  assert.ok(!/label: "Iniciar pesquisa SERP"/.test(fonte));
  assert.ok(!/label: "Refazer pesquisa SERP"/.test(fonte));
  /* O id continua o mesmo: nenhum handler novo foi criado. */
  assert.match(fonte, /id: "FINALIZE_SERP"/);
  assert.match(fonte, /id: "START_RESEARCH"/);
});

/* ==========  F, G, H, I, J · A VERIFICAÇÃO DE FONTES  ============== */

/** O plano montado exatamente como as duas pontas o montam. */
function planoDe(pages: readonly RadarExtractionPage[]) {
  const semantic = buildRadarSemanticConceptModel({
    pages, keywordTexts: contexto().resolvedKeywordTexts, centralEntities: ["pele oleosa"],
  });
  return buildRadarSourceVerificationPlan({
    candidates: buildRadarExternalSourceResearch({ pages, semantic }).evidenceCandidates,
    claims: buildRadarEvidenceClaims({ semantic }),
  });
}

test("GATE 18.1 · F — o plano das páginas gravadas resolve os próprios sourceIds", () => {
  /*
   * A CAUSA RAIZ DO SOURCE_UNKNOWN, EM UM TESTE.
   *
   * O cliente montava o plano sobre [páginas persistidas + páginas recém-lidas
   * em memória]; a rota reconstruía o plano lendo as extrações da versão
   * informada — a ANTERIOR, sem nenhuma das 12 páginas da rodada. As fontes
   * descobertas nelas não existiam para o servidor.
   */
  const versaoAnterior: RadarExtractionPage[] = [];
  const paginasDaRodada = LIDAS;

  const planoDoCliente = planoDe([...versaoAnterior, ...paginasDaRodada]);
  assert.ok(planoDoCliente.length >= 2, `a fixture precisa de fontes: ${planoDoCliente.length}`);

  /* Como era: o servidor lê a versão anterior e não reconhece nada. */
  const comoEra = radarSourceVerificationTargets({
    plan: planoDe(versaoAnterior),
    requestedSourceIds: planoDoCliente.map(item => item.sourceId),
  });
  assert.equal(comoEra.targets.length, 0);
  assert.equal(comoEra.refused.length, planoDoCliente.length, "era exatamente isto que o smoke viu");
  assert.ok(comoEra.refused.every(item => item.code === "SOURCE_UNKNOWN"));

  /* Como ficou: a amostra é gravada primeiro, e os dois lados leem o mesmo. */
  const comoFicou = radarSourceVerificationTargets({
    plan: planoDe(paginasDaRodada),
    requestedSourceIds: planoDoCliente.map(item => item.sourceId),
  });
  assert.deepEqual(comoFicou.refused, [], "CURRENT_PIPELINE_SOURCE_IDS_RESOLVE");
  assert.equal(comoFicou.targets.length, planoDoCliente.length);
});

test("GATE 18.1 · G — duas URLs do mesmo domínio continuam sourceIds distintos", () => {
  assert.notEqual(radarSourceId(FONTE_A), radarSourceId(FONTE_B));

  const plano = planoDe(LIDAS);
  const ids = plano.map(item => item.sourceId);
  assert.equal(new Set(ids).size, ids.length, "nenhum id colide");

  /* E as duas URLs do mesmo domínio realmente entraram no plano. */
  const urls = plano.map(item => item.candidateUrl);
  assert.ok(urls.includes(FONTE_A) && urls.includes(FONTE_B), `plano: ${urls.join(" | ")}`);
});

test("GATE 18.1 · H e I — id externo continua recusado, e o cliente não escolhe URL", () => {
  const plano = planoDe(LIDAS);

  /* H — um id que não saiu deste plano continua sendo recusado. */
  const forjado = radarSourceVerificationTargets({
    plan: plano,
    requestedSourceIds: [radarSourceId("https://site-que-o-cliente-inventou.com/x")],
  });
  assert.equal(forjado.targets.length, 0);
  assert.deepEqual(forjado.refused.map(item => item.code), ["SOURCE_UNKNOWN"]);

  /*
   * I — A CORREÇÃO NÃO ENFRAQUECEU NADA.
   *
   * `radarSourceVerificationTargets` só aceita ids e resolve o endereço a
   * partir do plano persistido: não existe campo por onde uma URL do cliente
   * entrasse. A rota, do seu lado, continua reconstruindo o plano das páginas
   * gravadas — o que mudou foi QUAIS páginas já estão gravadas na hora.
   */
  const rota = readFileSync(new URL("../app/api/editorial/radar-analysis/verify-sources/route.ts", import.meta.url), "utf8");
  assert.match(rota, /const pages = persistida\.payload\.extractions;/, "o plano nasce do que está gravado");
  assert.ok(!/body\.(url|candidateUrl|targetUrl)/.test(rota), "CLIENT_URL_ACCEPTED = NO");

  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const corpoDaChamada = pagina.slice(pagina.indexOf("verify-sources"), pagina.indexOf("verify-sources") + 1200);
  assert.ok(!/candidateUrl|\burl:/.test(corpoDaChamada), "a chamada manda sourceId, nunca endereço");
});

test("GATE 18.1 · J — fonte conhecida que falha no fetch é limitação, não defeito", () => {
  const plano = planoDe(LIDAS);
  const conhecido = plano[0].sourceId;

  /*
   * §8 distingue os dois casos, e só o segundo é defeito:
   *   A. fonte conhecida, fetch falhou → limitação normal;
   *   B. id selecionado pelo pipeline não existe no plano → wiring quebrado.
   */
  const resolucao = radarSourceVerificationTargets({ plan: plano, requestedSourceIds: [conhecido] });
  assert.equal(resolucao.targets.length, 1, "o id é reconhecido");
  assert.deepEqual(resolucao.refused, [], "EXPECTED_SOURCE_FAILURE_IS_LIMITATION: não é recusa de identidade");
  assert.equal(resolucao.targets[0].candidateUrl, plano[0].candidateUrl, "e o endereço vem do plano, não do pedido");
});

test("GATE 18.1 · §6 — a amostra é gravada antes de verificar, e o readback é exigido", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  const gravaAmostra = pagina.indexOf("let versaoDaAmostra: RadarAnalysisVersion;");
  const verifica = pagina.indexOf("/api/editorial/radar-analysis/verify-sources");
  assert.ok(gravaAmostra > 0 && verifica > 0, "os dois passos existem");
  assert.ok(gravaAmostra < verifica, "a gravação da amostra vem ANTES da verificação");

  /*
   * GATE 18.10.1 · A AMOSTRA PODE JÁ ESTAR GRAVADA — a exigência é a mesma.
   *
   * A rota resolve cada `sourceId` a partir da análise PERSISTIDA. Numa rodada
   * nova, a amostra é criada e gravada aqui; numa retomada, ela já é a versão
   * remota (as 11 páginas da v24). Nos dois casos a verificação só acontece
   * sobre algo que o servidor confirmou — que é o que este teste protege.
   */
  /*
   * GATE 18.10.2 · na retomada, a base é LIDA do servidor.
   *
   * Reaproveitar `data.analysis` mandava ao endpoint um `analysisVersionId` que
   * só existia em memória — SOURCE_ANALYSIS_UNKNOWN. A versão sobre a qual as
   * fontes são verificadas passou a vir de um readback, e é provada contra o
   * snapshot e o fundamento correntes antes de qualquer fetch.
   */
  assert.match(pagina, /const remoto = await pipeline\.readRemoteRadarAnalyses\(target\.articleId\);/);
  assert.match(pagina, /const base = radarResumableRemoteAnalysis\(\{/);
  assert.match(pagina, /versaoDaAmostra = base\.version as RadarAnalysisVersion;/);
  assert.match(pagina, /const amostraSalva = retomandoConsolidacao\s*\n\s*\? \{ persistenceMode: "remote" as const, readbackConfirmed: true \}/, "a versão remota já tem readback");

  /* E a verificação aponta para a versão recém-gravada, não para a anterior. */
  assert.match(pagina, /analysisVersionId: versaoDaAmostra\.versionId/);
  assert.ok(!/analysisVersionId: data\.analysis\.versionId/.test(pagina), "a versão anterior não é mais usada");

  /* Sem readback confirmado da amostra, a verificação não acontece. */
  assert.match(pagina, /amostraSalva\.persistenceMode === "remote" && amostraSalva\.readbackConfirmed/);
});

/* ==========  K, L, M · O ISOLAMENTO POR MODO  ====================== */

test("GATE 18.1 · K e L — YouTube e Amazon não iniciados não herdam a amostra do Google", () => {
  /*
   * O SMOKE MOSTROU "1 consulta · 7 referências" ao escolher YouTube e Amazon
   * sem executar nada: a SERP canônica do Google entrava no universo sem que
   * ninguém perguntasse a que modo ela pertence.
   */
  for (const modo of ["YOUTUBE", "AMAZON"] as const) {
    const view = buildRadarDeepResearchView({
      context: contexto(), record: null, snapshot: SNAPSHOT as never,
      extractions: [], mode: modo, observedAt: "2026-09-10T12:00:00.000Z",
    });
    assert.equal(view.references.length, 0, `${modo}: referências herdadas`);
    assert.equal(view.observed.sample.queriesExecuted, 0, `${modo}: consultas herdadas`);
    assert.equal(view.observed.sample.canonicalSerpResults, 0, `${modo}: SERP canônica herdada`);
    assert.equal(view.observed.sample.comparablePages, 0, `${modo}: amostra herdada`);
    assert.equal(view.state, "NOT_STARTED");
  }
});

test("GATE 18.1 · K e L — o modo Web continua enxergando a própria SERP", () => {
  /* A correção não pode cegar o Google: o isolamento vale nos dois sentidos. */
  const web = buildRadarDeepResearchView({
    context: contexto(), record: null, snapshot: SNAPSHOT as never,
    extractions: [], mode: "WEB", observedAt: "2026-09-10T12:00:00.000Z",
  });
  assert.ok(web.references.length > 0, "a canônica do artigo pertence ao Web");
  assert.equal(web.observed.sample.canonicalQueries, 1);

  /*
   * E uma investigação GRAVADA em Web continua sendo Web, mesmo com o seletor
   * mostrando outro modo: o registro manda, não a escolha corrente.
   */
  const gravadaEmWeb = vista({ mode: "YOUTUBE" });
  assert.ok(gravadaEmWeb.references.length > 0, "a rodada gravada não é apagada pelo seletor");
  assert.equal(gravadaEmWeb.record?.primarySearchMode, "WEB");
});

test("GATE 18.1 · M — Amazon sem engine não oferece START", () => {
  const view = buildRadarDeepResearchView({
    context: contexto(), record: null, snapshot: SNAPSHOT as never,
    extractions: [], mode: "AMAZON", observedAt: "2026-09-10T12:00:00.000Z",
  });
  assert.equal(view.phase1.id, "NONE", "AMAZON_FALSE_START = NO");
  assert.equal(view.phase1.enabled, false);
  assert.ok(view.phase1.blockedReason, "e o motivo é dito, não escondido");
});

/* ==========  §13 · A CONTABILIDADE REAL NÃO É "CORRIGIDA"  ========= */

test("GATE 18.1 · §13 — 19 observadas, 12 analisadas, 6 sem acesso, 11 comparáveis", () => {
  const view = vista();
  const amostra = view.observed.sample;

  assert.equal(amostra.analyzedSuccess, 12);
  assert.equal(amostra.failedFinal, 6);
  assert.equal(amostra.comparablePages, 11, "uma página lida e não comparável é resultado legítimo");
  assert.ok(amostra.uniqueReferences >= 12, `referências: ${amostra.uniqueReferences}`);

  /* 18 = 12 + 6: o universo fecha, e uma comparável a menos não é erro. */
  assert.equal(amostra.analyzedSuccess + amostra.failedFinal, 18);
  assert.ok(amostra.comparablePages < amostra.analyzedSuccess, "vitrine lida não vira benchmark");
});

/* ==============  O e P · ZERO PROVIDER  =========================== */

test("GATE 18.1 · O e P — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS_DURING_FIX deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
