import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarAnalysisMembership, radarMembershipLabel } from "../lib/radar/analysis-membership.ts";
import { buildRadarResetPayload } from "../lib/radar/radar-reset.ts";
import { radarNormalizedUrl } from "../lib/radar/research-reference.ts";
import type { RadarAnalysisVersion } from "../lib/radar/analysis-contracts.ts";
import type { RadarSerpView } from "../lib/radar/snapshot-view.ts";

/*
 * ============  FASE 1 · §1 — A CONTA PRECISA FECHAR  ====================
 *
 * O smoke real disse:
 *
 *   18 selecionadas · 6 reutilizadas · 10 analisadas agora · 3 não processadas
 *   6 + 10 + 3 = 19
 *
 * Três causas, e este arquivo cobre as três:
 *
 *   A. a aba Análise recalculava o pertencimento SEM a curadoria da pesquisa,
 *      e por isso mostrava 7 (a SERP canônica) enquanto a investigação
 *      trabalhava com 18;
 *   B. as duas curadorias endereçam a mesma URL por identidades diferentes
 *      (`organic:<posição>` e `referenceId`), e a mesma página entrava duas
 *      vezes na fila — 13 tentativas para 12 pendentes;
 *   C. uma falha nunca virava extração, então voltava para "pendente" em toda
 *      rodada e a tela dizia "1 pendente" para sempre.
 *
 * INVARIANTE: SELECTED = REUSED + FAILED + PENDING, sem overlap.
 */

const brandId = "b-fase1";
const articleId = "article-fase1";
const articleDnaVersionId = "dna-fase1";
const snapshotId = "serp-fase1";
const snapshotHash = "c".repeat(64);
const scope = { brandId, articleId, articleDnaVersionId };

const canonica = ["https://a.com.br/p1", "https://b.com.br/p2", "https://c.com.br/p3"];
const auxiliares = ["https://d.com.br/p4", "https://e.com.br/p5"];

const resultado = (position: number, url: string) => ({
  position, url, title: `Página ${position}`, domain: new URL(url).hostname,
  snippet: "trecho", inferredType: "article", isOwnDomain: false,
});

const view = (): RadarSerpView => ({
  record: { id: snapshotId }, version: 1, provider: "dataforseo", hash: snapshotHash,
  capturedAt: "2026-09-09T10:00:00.000Z", source: "merged", partial: false,
  organicResults: canonica.map((url, index) => resultado(index + 1, url)),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], possibleConflicts: [], limitations: [], questions: [], opportunities: [], recurringTitlePatterns: [] },
} as unknown as RadarSerpView);

const analysis = (input: { extraidas?: string[]; falhas?: string[] } = {}): RadarAnalysisVersion => ({
  versionId: "analysis-fase1", entityId: `radar-analysis:${articleId}`, versionNumber: 2, previousVersionId: null,
  contentHash: "sha256:" + "b".repeat(64), origin: "human", changeReason: "fixture",
  createdAt: "2026-09-09T10:05:00.000Z", createdBy: "humano",
  payload: {
    schemaVersion: 1, brandId, articleId, articleDnaVersionId,
    serpSnapshotId: snapshotId, serpSnapshotVersion: 1, serpSnapshotHash: snapshotHash,
    mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "",
    serpDecisions: canonica.map((url, index) => ({ key: `organic:${index + 1}`, itemType: "organic" as const, decision: "included" as const, reason: "", note: "", ownDomain: false, url })),
    selectedCompetitorIds: canonica.map((_, index) => `organic:${index + 1}`),
    extractionIds: [],
    extractions: (input.extraidas || []).map((url, index) => ({ id: `page-${index}`, url, status: "success" })),
    extractionFailures: (input.falhas || []).map((url, index) => ({ key: `falha-${index}`, url, code: "blocked", message: "403", status: 403, observedAt: "2026-09-09T11:00:00.000Z" })),
    deepResearch: null, benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null,
    keywordDecisions: [], competitiveReport: null, plannerPackage: null, plannerTransfer: null,
    status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  },
} as unknown as RadarAnalysisVersion);

const membership = (input: { extraidas?: string[]; falhas?: string[]; pesquisa?: string[] } = {}) =>
  buildRadarAnalysisMembership({
    view: view(), analysis: analysis(input), scope,
    researchSelectedUrls: input.pesquisa ?? auxiliares,
  });

/* ------------------------------ A invariante ---------------------------- */

test("§1 · SELECTED = REUSED + FAILED + PENDING, sempre", () => {
  const cenarios = [
    {},
    { extraidas: canonica },
    { falhas: [auxiliares[0]] },
    { extraidas: [canonica[0], canonica[1]], falhas: [canonica[2]] },
    { extraidas: [...canonica, ...auxiliares] },
    { pesquisa: [] },
  ];

  for (const cenario of cenarios) {
    const conta = membership(cenario);
    assert.equal(conta.selected, conta.reused + conta.failed + conta.pending, `a conta não fechou em ${JSON.stringify(cenario)}`);
    assert.equal(conta.consistent, true);
    /* Sem overlap: nenhuma URL em duas categorias ao mesmo tempo. */
    const todas = [...conta.reusedUrls, ...conta.failedUrls, ...conta.pendingUrls].map(radarNormalizedUrl);
    assert.equal(new Set(todas).size, todas.length, "uma URL apareceu em duas categorias");
  }
});

/* ------------------- A · o universo, não a SERP canônica ---------------- */

test("§1.A · a amostra soma as duas curadorias, e a aba Análise lê a mesma", () => {
  const conta = membership();
  assert.equal(conta.selected, 5, "3 canônicas + 2 da pesquisa");

  /* A aba não pode recalcular só a canônica: era daí que saía o 7. */
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /researchSelectedUrls: deepResearch\?\.curation\.confirmed/,
    "a aba Análise precisa somar a curadoria da pesquisa");
  assert.equal(/const membership = buildRadarAnalysisMembership\(\{ view, analysis, scope \}\)/.test(painel), false,
    "não pode sobrar a versão que lê só a SERP canônica");
});

/* --------------- B · uma URL, um candidato, mesmo em duas listas -------- */

test("§1.B · a mesma URL nas duas curadorias conta uma vez só", () => {
  /* A canônica e a pesquisa apontam para a mesma página, escrita diferente. */
  const conta = buildRadarAnalysisMembership({
    view: view(), analysis: analysis(), scope,
    researchSelectedUrls: ["https://www.a.com.br/p1/", ...auxiliares],
  });
  assert.equal(conta.selected, 5, "a duplicata normalizada não vira uma sexta seleção");
  assert.equal(conta.selectedUrls.filter(url => radarNormalizedUrl(url) === "a.com.br/p1").length, 1);

  /* E a fila de extração dedupe antes de gastar chamada externa. */
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(page, /const jaCobertas = new Set\(canonicos\.map\(candidate => radarNormalizedUrl\(candidate\.url\)\)\)/);
  assert.match(page, /!jaCobertas\.has\(row\.reference\.normalizedUrl\)/);
});

/* ------------------- C · falha é desfecho, não espera ------------------- */

test("§1.C · falha registrada sai de pendente e não volta na próxima rodada", () => {
  const conta = membership({ extraidas: canonica, falhas: [auxiliares[0]] });
  assert.equal(conta.reused, 3);
  assert.equal(conta.failed, 1);
  assert.equal(conta.pending, 1, "só a que nunca foi tentada continua pendente");
  assert.equal(conta.consistent, true);

  /* A mesma página não pode ser reconhecida como pendente enquanto a falha vale. */
  assert.equal(conta.pendingUrls.includes(auxiliares[0]), false);
  assert.equal(conta.failedUrls.includes(auxiliares[0]), true);

  const todasComDesfecho = membership({ extraidas: [...canonica, auxiliares[1]], falhas: [auxiliares[0]] });
  assert.equal(todasComDesfecho.pending, 0, "PERMANENT_PENDING_AFTER_ANALYSIS = NO");
  assert.match(radarMembershipLabel(todasComDesfecho), /sem acesso/);
});

/* ------------------ K e L · o reset alcança só o Radar ------------------ */

test("K · o reset descarta o estado Radar inteiro desta linha", () => {
  const cheia = analysis({ extraidas: canonica, falhas: [auxiliares[0]] });
  const zerada = buildRadarResetPayload({
    ...cheia.payload,
    selectedCompetitorIds: ["organic:1"],
    benchmark: { mode: "kgr_light", analyzedPageCount: 3, validPageCount: 3, metrics: {}, distributions: {}, outliers: [], recommendations: [] },
    status: "approved", approvedBy: "humano", approvedAt: "2026-09-09T12:00:00.000Z",
  } as unknown as typeof cheia.payload);

  assert.deepEqual(zerada.extractions, []);
  assert.deepEqual(zerada.extractionFailures, []);
  assert.deepEqual(zerada.selectedCompetitorIds, []);
  assert.equal(zerada.deepResearch, null);
  assert.equal(zerada.benchmark, null);
  assert.equal(zerada.competitiveReport, null);
  assert.equal(zerada.plannerPackage, null);
  assert.equal(zerada.plannerTransfer, null);
  assert.equal(zerada.status, "draft");
  assert.equal(zerada.approvedAt, null);
  assert.equal(zerada.approvedBy, null);

  /* As decisões voltam a pendente em vez de sumirem: o snapshot ainda tem itens. */
  assert.equal(zerada.serpDecisions.length, cheia.payload.serpDecisions.length);
  assert.ok(zerada.serpDecisions.every(decision => decision.decision === "pending"));

  const conta = buildRadarAnalysisMembership({ view: view(), analysis: { ...cheia, payload: zerada }, scope, researchSelectedUrls: [] });
  assert.equal(conta.selected, 0, "depois do reset não há amostra");
  assert.equal(conta.pending, 0);
  assert.equal(conta.consistent, true);
});

test("L · o reset não tem como alterar ArticleDNA, SiloDNA ou keyword upstream", () => {
  /*
   * A prova é de alcance, não de intenção: a função recebe e devolve APENAS o
   * payload da análise do Radar. Os fundamentos não passam por ela.
   */
  const fonte = readFileSync("lib/radar/radar-reset.ts", "utf8");
  assert.match(fonte, /export function buildRadarResetPayload\(payload: RadarAnalysisPayload\): RadarAnalysisPayload/);
  for (const proibido of ["ArticleDNA", "SiloDNA", "SiloPage", "InternalLinkGraph", "minerador_keywords", "editorial_artifact_versions"]) {
    assert.equal(new RegExp(`import[^;]*${proibido}`).test(fonte), false, `o reset não importa ${proibido}`);
  }
  /* Domínio puro: nada assíncrono, e o único import é o tipo do próprio payload. */
  assert.equal(/\basync\b|\bawait\b/.test(fonte), false, "o reset não faz I/O");
  const imports = [...fonte.matchAll(/^import .*from "(.+)";$/gm)].map(linha => linha[1]);
  assert.deepEqual(imports, ["./analysis-contracts.ts"], "o reset só conhece o payload da análise do Radar");

  /* E a identidade da linha permanece: o reset zera a investigação, não o vínculo. */
  const zerada = buildRadarResetPayload(analysis().payload);
  assert.equal(zerada.brandId, brandId);
  assert.equal(zerada.articleId, articleId);
  assert.equal(zerada.articleDnaVersionId, articleDnaVersionId);

  /* Na tela, zerar é ação humana e nasce de uma versão nova — não de um DELETE. */
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(page, /const resetRadarInvestigation = async/);
  assert.match(page, /createRadarAnalysisSuccessor\(\s*data\.analysis,\s*buildRadarResetPayload\(data\.analysis\.payload\)/);
  const workbench = readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8");
  assert.match(workbench, /data-testid="radar-reset-investigation"/);
});

test("§0 · a pesquisa sempre recoleta a SERP canônica depois do reset", () => {
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const corpo = page.slice(page.indexOf("const startDeepResearch = async"), page.indexOf("const finalizeInvestigation = async"));
  assert.match(corpo, /const status = await collect\(target\);/);
  assert.equal(/data\.view\?\.record\.research \|\| null/.test(corpo), false,
    "não pode voltar a reaproveitar o snapshot anterior");
  assert.match(corpo, /curationVersionFor\(target, data\.article, research, registro\)/,
    "a versão nasce sobre o snapshot que acabou de chegar");
});

/* ------------------------ a frase que o usuário lê ---------------------- */

test("§1 · a frase do aviso mostra a sobra em vez de escondê-la", () => {
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.ok(page.includes("membership.selected - (membership.reused + pages.length + falhas.length)"),
    "a sobra é calculada a partir da própria conta");
  assert.ok(page.includes("sem desfecho nesta rodada"), "e é dita quando existe");
});
