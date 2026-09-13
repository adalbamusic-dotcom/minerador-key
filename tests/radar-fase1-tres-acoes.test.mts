import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarPhase1Action, radarPhase1NextAction } from "../lib/radar/serp-phase1.ts";
import { autoDecideRadarReference, buildRadarAutomaticResearchCuration, radarExecutedQueriesFromRecord } from "../lib/radar/research-auto-selection.ts";
import { radarExtractionFailureIsRecoverable, radarExtractionRetryQueue, radarExtractionLimitation, RADAR_EXTRACTION_MAX_ATTEMPTS } from "../lib/radar/extraction-retry.ts";
import { radarResearchDecisionIsAnalyzable } from "../lib/radar/research-curation.ts";
import { radarNormalizedUrl } from "../lib/radar/research-reference.ts";
import type { RadarDeepResearchRecord } from "../lib/radar/deep-research.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarResearchReference } from "../lib/radar/research-reference.ts";

/*
 * ==============  FASE 1 · TRÊS AÇÕES, E NADA DE FLUXO INTERNO  ===========
 *
 *   1. Iniciar pesquisa
 *   2. Analisar concorrência
 *   3. Finalizar pesquisa
 *
 * O resto — coletar, curar, classificar, confirmar, reanalisar — continua
 * acontecendo, por conta do sistema. "Analisar páginas pendentes (1)" sai da
 * experiência: é contagem interna, não decisão de quem opera.
 */

const base = {
  contextReady: true,
  hasPrimaryQuery: true,
  running: false,
  selected: 18,
  pending: 0,
  failed: 0,
  analyzed: 16,
};

/* --------------------------- as três ações ------------------------------ */

test("G, H, I · cada etapa oferece exatamente uma ação, e ela tem nome de negócio", () => {
  const iniciar = radarPhase1Action({ ...base, state: "NOT_STARTED", selected: 0, analyzed: 0 });
  assert.equal(iniciar.id, "START_RESEARCH");
  /*
   * RADAR 18.8 · §8 — o rótulo passou a dizer ONDE.
   *
   * Fora da área Pesquisa, "Iniciar pesquisa" não dizia que o destino era o
   * Google nem que existiam outros destinos. O modo já estava resolvido na
   * autoridade; ele só não chegava ao texto. O id e o handler não mudaram.
   */
  assert.equal(iniciar.label, "Iniciar Pesquisa Google");
  assert.equal(radarPhase1Action({ ...base, state: "NOT_STARTED", selected: 0, analyzed: 0, mode: "YOUTUBE" }).label, "Iniciar Pesquisa YouTube");
  assert.equal(iniciar.enabled, true);

  const analisar = radarPhase1Action({ ...base, state: "AWAITING_REVIEW", pending: 12, analyzed: 6 });
  assert.equal(analisar.id, "ANALYZE_COMPETITION");
  assert.equal(analisar.label, "Analisar concorrência");
  assert.equal(/pendente/i.test(analisar.label), false, "o rótulo não fala de pendências");
  assert.equal(/\(\d+\)/.test(analisar.label), false, "nem carrega contador interno");

  const finalizar = radarPhase1Action({ ...base, state: "AWAITING_REVIEW" });
  assert.equal(finalizar.id, "FINALIZE_SERP");
  assert.equal(finalizar.label, "Finalizar pesquisa");
  assert.equal(finalizar.enabled, true);

  const finalizada = radarPhase1Action({ ...base, state: "FINALIZED" });
  assert.equal(finalizada.id, "NONE");
  assert.equal(finalizada.enabled, false);
});

test("J · nenhum passo intermediário aparece como obrigação do usuário", () => {
  const fonte = readFileSync("lib/radar/serp-phase1.ts", "utf8");
  /*
   * Só os RÓTULOS importam: o comentário pode citar o fluxo antigo para explicá-lo.
   *
   * RADAR 18.8: o rótulo do START passou a ser template — ele interpola o modo.
   * A varredura precisa enxergar as duas formas, senão o rótulo novo escapa da
   * proibição em silêncio, que é o oposto do que este teste existe para fazer.
   */
  const rotulos = [...fonte.matchAll(/label: [`"]([^`"]+)[`"]/g)].map(item => item[1]);
  assert.ok(rotulos.some(rotulo => rotulo.includes("${")), "o rótulo do START é composto e precisa estar nesta varredura");
  for (const rotulo of rotulos) {
    for (const proibido of ["curadoria", "Confirmar", "pendente", "Aprovar", "Revisar"]) {
      assert.equal(rotulo.includes(proibido), false, `o rótulo "${rotulo}" oferece um passo interno`);
    }
  }
  /*
   * E os três nomes de negócio são verificados no VALOR CALCULADO, não na
   * fonte: com interpolação, ler o texto do arquivo deixou de provar o rótulo.
   */
  const calculados = [
    radarPhase1Action({ ...base, state: "NOT_STARTED", selected: 0, analyzed: 0 }).label,
    radarPhase1Action({ ...base, state: "AWAITING_REVIEW", pending: 12, analyzed: 6 }).label,
    radarPhase1Action({ ...base, state: "AWAITING_REVIEW" }).label,
  ];
  assert.deepEqual(calculados, ["Iniciar Pesquisa Google", "Analisar concorrência", "Finalizar pesquisa"]);
  const ids = [...fonte.matchAll(/id: "([A-Z_]+)"/g)].map(item => item[1]);
  assert.deepEqual([...new Set(ids)].sort(), ["ANALYZE_COMPETITION", "FINALIZE_SERP", "NONE", "START_RESEARCH"]);
});

test("§9 · a planilha e o botão dizem a mesma frase", () => {
  const analisar = radarPhase1Action({ ...base, state: "AWAITING_REVIEW", pending: 5, analyzed: 3 });
  assert.equal(radarPhase1NextAction(analisar), "Analisar concorrência");

  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(page, /radarPhase1NextAction\(deepResearch\.phase1\)/,
    "a coluna Próxima ação usa a mesma autoridade do botão");
  const workbench = readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8");
  assert.match(workbench, /const acao = view\.phase1;/);
  /*
   * GATE 15.1 · quem liga a ação ao handler é o mapa canônico do domínio.
   *
   * Antes a tela repetia os ids num `if`; agora ela consulta um dado testado,
   * e as duas superfícies — botão e planilha — leem a MESMA autoridade.
   */
  assert.match(workbench, /RADAR_PHASE1_HANDLER\[acao\.id\]/);
});

test("uma falha definitiva não impede finalizar", () => {
  const comFalha = radarPhase1Action({ ...base, state: "AWAITING_REVIEW", pending: 0, failed: 2, analyzed: 16 });
  assert.equal(comFalha.id, "FINALIZE_SERP");
  assert.equal(comFalha.enabled, true);
  assert.match(comFalha.hint || "", /2 sem acesso/);

  /* Mas zero páginas analisadas não é "finalizar": é refazer, com o motivo. */
  const semAmostra = radarPhase1Action({ ...base, state: "AWAITING_REVIEW", pending: 0, failed: 3, analyzed: 0 });
  assert.equal(semAmostra.id, "START_RESEARCH");
  assert.match(semAmostra.blockedReason || "", /Nenhuma das 3 página\(s\)/);
});

/* ---------------------- seleção automática, sem teto -------------------- */

const referencia = (patch: Partial<RadarResearchReference>): RadarResearchReference => ({
  referenceId: "research:0001", normalizedUrl: "exemplo.com.br/p", url: "https://exemplo.com.br/p",
  domain: "exemplo.com.br", title: "Página", appearances: [], queryCount: 1,
  principalRank: 1, secondaryRanks: [], reinforcementRanks: [],
  classification: "EDITORIAL_COMPETITOR", classificationReason: "motivo",
  intentCompatibility: "unknown", entityCompatibility: "unknown", siloCompatibility: "external",
  formationSerpSeen: false, formationContext: null,
  ...patch,
});

test("E, F · a seleção é automática, com motivo, e não exige clique por referência", () => {
  const casos: Array<[Partial<RadarResearchReference>, string]> = [
    [{ classification: "EDITORIAL_COMPETITOR" }, "primary"],
    [{ classification: "COMMERCIAL_COMPETITOR" }, "support"],
    [{ classification: "PRODUCT_REFERENCE" }, "support"],
    [{ classification: "AUTHORITY_SOURCE" }, "authority"],
    [{ classification: "FORMAT_REFERENCE" }, "format"],
    [{ classification: "SERP_FEATURE" }, "excluded"],
    [{ classification: "NOT_RELEVANT" }, "excluded"],
    [{ siloCompatibility: "own_domain" }, "excluded"],
    [{ classification: "LATERAL_REFERENCE", queryCount: 2 }, "support"],
    [{ classification: "LATERAL_REFERENCE", queryCount: 1 }, "excluded"],
    [{ classification: "LATERAL_REFERENCE", queryCount: 1, entityCompatibility: "compatible" }, "support"],
  ];
  for (const [patch, esperado] of casos) {
    const decidida = autoDecideRadarReference(referencia(patch));
    assert.equal(decidida.decision, esperado, `classificação ${JSON.stringify(patch)}`);
    assert.ok(decidida.reason.length > 10, "toda decisão automática carrega o motivo");
  }

  /* Autoridade entra na amostra: fonte citada pela busca não é desperdício. */
  assert.equal(radarResearchDecisionIsAnalyzable("authority"), true);
  assert.equal(radarResearchDecisionIsAnalyzable("format"), false, "vídeo e social não rendem texto para extrair");
});

const registro = (urls: string[]): RadarDeepResearchRecord => ({
  startedAt: "2026-09-09T10:00:00.000Z", startedBy: "humano", primarySearchMode: "WEB",
  fingerprint: { articleDnaVersionId: "dna", articleDnaContentHash: null, keywordRefs: [], siloDnaVersionId: null, siloPageId: null, formationAssessmentId: null, formationBaseHash: null, internalLinkGraphVersionId: null, value: "fixture" },
  queries: [{
    queryId: "query:principal", keywordId: "kw-1", keyword: "skincare para pele oleosa",
    role: "principal", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "canonical",
    reason: "central",
    evidence: {
      serpClass: "canonical", snapshotId: "s1", collectedAt: "2026-09-09T10:00:00.000Z",
      contentHash: "a".repeat(64), resultCount: urls.length, observedIntent: "informacional",
      results: urls.map((url, index) => ({ position: index + 1, url, title: `Página ${index + 1}`, domain: new URL(url).hostname, inferredType: "article" })),
    },
  }],
  summary: null, researchCuration: null, finalizedAt: null, finalizedBy: null, conclusion: null,
} as unknown as RadarDeepResearchRecord);

const contexto = () => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna", articleDnaContentHash: null, promise: null, mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [], editorialTopics: [], resolvedKeywordTexts: [],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

test("E · sem teto: dezoito referências úteis viram dezoito selecionadas", () => {
  const urls = Array.from({ length: 18 }, (_, index) => `https://editorial-${index + 1}.com.br/artigo`);
  const resultado = buildRadarAutomaticResearchCuration({ record: registro(urls), context: contexto(), confirmedBy: "sistema" });

  assert.equal(resultado.references.length, 18);
  assert.equal(resultado.selected, 18, "nenhuma cota corta o universo");
  assert.equal(resultado.curation?.references.length, 18);
  assert.ok(resultado.reasons.every(item => item.reason.length > 0), "cada uma com o motivo gravado");

  /* E a curadoria já sai confirmada: o fluxo não para para pedir clique. */
  assert.ok(resultado.curation);
  assert.equal(resultado.curation.confirmedBy, "sistema");
});

test("as consultas do universo são reconstruídas do próprio registro", () => {
  const executadas = radarExecutedQueriesFromRecord(registro(["https://x.com.br/a"]));
  assert.equal(executadas.length, 1);
  assert.equal(executadas[0].serpClass, "canonical");
  assert.equal(executadas[0].results[0].url, "https://x.com.br/a");
});

/* --------------------------- retry e PENDING = 0 ------------------------ */

test("§10 · falha recuperável repete; falha definitiva vira limitação", () => {
  for (const recuperavel of [
    { code: "fetch_failed", status: null },
    { code: "timeout", status: null },
    { code: "desconhecido", status: 503 },
    { code: "desconhecido", status: 429 },
  ]) assert.equal(radarExtractionFailureIsRecoverable(recuperavel), true, JSON.stringify(recuperavel));

  for (const definitivo of [
    { code: "blocked", status: 403 },
    { code: "invalid_url", status: null },
    { code: "private_destination", status: null },
    { code: "unsupported", status: null },
    { code: "desconhecido", status: 404 },
    { code: "desconhecido", status: null },
  ]) assert.equal(radarExtractionFailureIsRecoverable(definitivo), false, JSON.stringify(definitivo));

  /* O retry tem fim: depois do teto, a falha encerra. */
  const fila = radarExtractionRetryQueue([
    { key: "a", code: "timeout", status: null, attempts: 1 },
    { key: "b", code: "timeout", status: null, attempts: RADAR_EXTRACTION_MAX_ATTEMPTS },
    { key: "c", code: "blocked", status: 403, attempts: 1 },
  ]);
  assert.deepEqual(fila.map(item => item.key), ["a"]);

  assert.match(radarExtractionLimitation({ url: "https://x.com/p", code: "blocked", status: 403, attempts: 2 }),
    /não pôde ser lida após 2 tentativas \(blocked · HTTP 403\)/);
});

test("§10 · a análise repete o que é temporário e não deixa pendente para sempre", () => {
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const corpo = page.slice(page.indexOf("const analyzeSerpSelection = async"), page.indexOf("const reviewSerpForArticle = async"));
  assert.match(corpo, /radarExtractionFailureIsRecoverable/);
  assert.match(corpo, /RADAR_EXTRACTION_MAX_ATTEMPTS/);
  assert.match(corpo, /while \(fila\.length\)/, "o retry é uma rodada, não uma chamada solta");
  assert.match(corpo, /Repetindo \$\{fila\.length\} página\(s\) que falharam por motivo temporário/);

  /* E o membership tira a falha de pendente — a conta fecha sem sobra eterna. */
  const membership = readFileSync("lib/radar/analysis-membership.ts", "utf8");
  assert.match(membership, /falhadas\.has\(radarNormalizedUrl\(url\)\)/);
});

/* ------------------------- a seleção vai gravada -------------------------- */

test("F · iniciar a pesquisa já grava a seleção automática, sem passo extra", () => {
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  /*
   * RADAR 18.9: a fatia é a do START. A recuperação da SERP já paga tem
   * escrita própria e vive depois da rodada — incluí-la faria "uma escrita por
   * rodada" contar duas e a garantia perderia o sentido.
   */
  const corpo = page.slice(page.indexOf("const startDeepResearch = async"), page.indexOf("const recuperarPesquisaPaga = async"));
  assert.match(corpo, /buildRadarAutomaticResearchCuration/);
  assert.match(corpo, /registro = \{ \.\.\.registro, researchCuration: selecao\.curation \}/);
  assert.match(corpo, /selecionada\(s\) automaticamente para análise/);

  /* Uma escrita por rodada: a curadoria vai junto do registro, não depois. */
  assert.equal((corpo.match(/await persistSerpAnalysis/g) || []).length, 1);
});

test("normalização de URL é a mesma em todo o caminho", () => {
  assert.equal(radarNormalizedUrl("https://www.x.com.br/artigo/"), "x.com.br/artigo");
  assert.equal(radarNormalizedUrl("http://x.com.br/artigo?utm=1"), "x.com.br/artigo");
  assert.notEqual(radarNormalizedUrl("https://x.com.br/a"), radarNormalizedUrl("https://x.com.br/b"));
});
