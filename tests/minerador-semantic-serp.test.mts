import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveSerpSemanticEvidence,
  isConclusiveSerpEvidence,
  serpEvidenceStrengthPresentation,
  serpCollectionLabel,
  serpCollectionUiState,
} from "../lib/minerador/serp-semantic-evidence.ts";
import { applySerpSemanticEvidence, createSemanticConsolidationDraft, resolveSemanticAxis } from "../lib/minerador/semantic-consolidation-draft.ts";
import { calculateKgrFromMetrics } from "../lib/minerador/kgr-applicability.ts";

/**
 * SERP natural da Qualificação Semântica: terceira chamada do processo
 * Resultados. Nenhum teste chama provider — REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

function serpBody(keyword: string, items: Array<{ title: string; description?: string; url?: string; domain?: string }>) {
  return {
    tasks: [{
      id: "task-serp-1",
      status_code: 20000,
      cost: 0.002,
      result: [{
        keyword,
        location_code: 2076,
        language_code: "pt",
        items_count: items.length,
        items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: item.domain || `site${index + 1}.com.br`, ...item })),
      }],
    }],
  };
}

const evidenceInput = {
  keyword: "skin care noturno",
  locationCode: 2076,
  languageCode: "pt",
  providerRequestId: "task-serp-1",
  operationRequestId: "11111111-1111-4111-8111-111111111111",
  collectedAt: "2026-08-28T18:00:00.000Z",
};

const informational = Array.from({ length: 8 }, (_, index) => ({
  title: `O que é rotina noturna de skin care ${index + 1}`,
  description: "Guia passo a passo para entender a rotina.",
  url: "https://exemplo.com.br/guia",
}));

test("A/D/E · a terceira chamada usa a keyword natural e a primeira segue com allintitle", () => {
  assert.ok(route.includes("const serp = await executeDataForSeoSerpOperation({"), "a CALL 3 usa a operação SERP compartilhada");
  assert.ok(route.includes("collectSemanticSerp({ keyword: target.keyword,"), "a CALL 3 recebe a keyword natural do alvo");
  assert.match(route, /measureDataForSeoAllintitle\(\{ keyword: target\.keyword/);
  // A evidência só aceita a resposta da própria keyword natural.
  const wrongQuery = deriveSerpSemanticEvidence({ ...evidenceInput, body: serpBody('allintitle:"skin care noturno"', informational) });
  assert.equal(wrongQuery, null, "a SERP da consulta allintitle nunca vira evidência semântica");
  const right = deriveSerpSemanticEvidence({ ...evidenceInput, body: serpBody("skin care noturno", informational) });
  assert.ok(right);
});

test("F · evidência conclusiva fecha Intenção e Funil por eixos próprios", () => {
  const evidence = deriveSerpSemanticEvidence({ ...evidenceInput, body: serpBody("skin care noturno", informational) })!;
  assert.equal(evidence.intent.strength, "conclusive");
  assert.equal(evidence.intent.value, "Informativa");
  assert.equal(evidence.funnel.strength, "conclusive");
  assert.equal(evidence.funnel.value, "TOFU");
  assert.equal(isConclusiveSerpEvidence(evidence.intent), true);

  const draft = applySerpSemanticEvidence(createSemanticConsolidationDraft({ keywordId: "k1", brandId: "brand-a", intent: { logic: "Comercial", ai: null }, funnel: { logic: "MOFU", ai: null } }), evidence);
  assert.equal(draft.intent.serp, "Informativa");
  assert.equal(draft.intent.serpStrength, "conclusive");
  assert.equal(draft.serpSnapshotRef?.source, "dataforseo_organic");
  // Evidência conclusiva vence a hipótese lógica.
  assert.equal(resolveSemanticAxis(draft.intent).status, "serp_consolidated");
  assert.equal(resolveSemanticAxis(draft.intent).value, "Informativa");
});

test("os eixos são independentes: Funil não é herdado da Intenção", () => {
  // Intenção informacional dominante, mas sinais de funil espalhados.
  const mixedFunnel = [
    { title: "O que é sérum noturno", description: "guia" },
    { title: "Como aplicar sérum noturno", description: "passo a passo" },
    { title: "Comprar sérum noturno", description: "preco e frete" },
    { title: "Melhor sérum noturno", description: "comparativo" },
    { title: "O que é retinol", description: "guia" },
    { title: "Orcamento de tratamento", description: "agendar" },
  ];
  const evidence = deriveSerpSemanticEvidence({ ...evidenceInput, body: serpBody("skin care noturno", mixedFunnel) })!;
  assert.ok(evidence.intent.distribution.length >= 2, "a intenção conta os próprios sinais");
  assert.notDeepEqual(evidence.intent.distribution, evidence.funnel.distribution, "cada eixo conta seus próprios sinais");
  assert.ok(evidence.funnel.distribution.length >= 2, "o funil conta os próprios sinais");
});

test("G · evidência não conclusiva não consolida nada", () => {
  const mixed = [
    { title: "Comprar sérum noturno", description: "preco" },
    { title: "Melhor sérum noturno", description: "comparativo" },
    { title: "O que é sérum noturno", description: "guia" },
    { title: "Clinica perto de mim", description: "agendar" },
    { title: "Kit noturno com desconto", description: "cupom" },
  ];
  const evidence = deriveSerpSemanticEvidence({ ...evidenceInput, body: serpBody("skin care noturno", mixed) })!;
  assert.notEqual(evidence.intent.strength, "conclusive");
  assert.equal(evidence.intent.value, null);
  // O funil pode concluir sozinho: os eixos não se herdam.
  assert.equal(serpEvidenceStrengthPresentation(evidence.intent.strength).label, evidence.intent.strength === "mixed" ? "Evidência mista" : "Evidência fraca");
  // Sem nenhum eixo conclusivo, o estado é "analisada · evidência insuficiente".
  const withoutAxis = { ...evidence, intent: { ...evidence.intent, strength: "mixed" as const, value: null }, funnel: { ...evidence.funnel, strength: "mixed" as const, value: null } };
  assert.equal(serpCollectionLabel(serpCollectionUiState({ evidence: withoutAxis })), "SERP · Analisada · sem consolidação");
});

test("poucos resultados observados são evidência insuficiente, não conclusão", () => {
  const evidence = deriveSerpSemanticEvidence({ ...evidenceInput, body: serpBody("skin care noturno", informational.slice(0, 3)) })!;
  assert.equal(evidence.intent.strength, "insufficient");
  assert.equal(evidence.intent.value, null);
});

test("H/I · SERP e medições são artefatos independentes", () => {
  // A rota trata a falha da SERP sem derrubar a medição já obtida.
  assert.ok(route.includes("return { evidence: null, error: { code: mapped.code, message: mapped.message, providerRequestId: mapped.providerRequestId }"), "a falha da SERP vira erro isolado");
  assert.ok(route.includes("const serpError = semanticSerp.error;"));
  assert.match(route, /serpEvidence, serpError \}\);/);
  assert.ok(route.indexOf("await persistSuccess(") > route.indexOf("const semanticSerp = await collectSemanticSerp"), "a persistência da medição acontece mesmo com SERP falha");
  // KGR continua função de Volume + Resultado.
  assert.equal(calculateKgrFromMetrics(1900, 320), 0.1684);
  assert.ok(!readFileSync(new URL("../lib/minerador/serp-semantic-evidence.ts", import.meta.url), "utf8").includes("kgr"));
});

test("B/C/K · a coleta só acontece pelo processo Resultados", () => {
  assert.ok(!route.includes("export async function GET"));
  const resultsHandler = workspace.slice(workspace.indexOf("const handleBatchAllintitle"), workspace.indexOf("const handleBatchQualify"));
  assert.match(resultsHandler, /dataforseo\/allintitle/);
  assert.ok(!workspace.includes("useEffect(() => { void handleBatchAllintitle"));
  for (const forbidden of ["Analisar SERP", "Validar na SERP", "Coletar SERP"]) {
    assert.ok(!panel.includes(forbidden) && !workspace.includes(forbidden), `não pode existir botão "${forbidden}"`);
  }
  // Lote sequencial e sem mexer na tela.
  assert.ok(!resultsHandler.includes("setExpandedRowId"));
  assert.ok(!resultsHandler.includes("scrollIntoView"));
});

test("J · o sinal do DataForSEO Labs não é evidência SERP nem intenção canônica", () => {
  const evidenceModule = readFileSync(new URL("../lib/minerador/serp-semantic-evidence.ts", import.meta.url), "utf8");
  const code = evidenceModule.split("*/").slice(1).join("*/");
  assert.ok(!code.includes("main_intent"), "a evidência semântica não lê o sinal Labs");
  assert.ok(!code.includes("search_intent_info"));
});

test("M · a terceira chamada entra no consumo real registrado", () => {
  assert.match(route, /const costs = \[measurement\.cost, keywordOverview\?\.cost \?\? null, serpCost\]/);
  assert.match(route, /const providerReference = \[measurement\.providerRequestId, keywordOverview\?\.providerRequestId, serpProviderRequestId\]/);
  assert.equal((route.match(/recordTargetUsage\(\{/g) || []).length, 2, "um evento por alvo: sucesso ou falha");
});

test("estados honestos da coleta na Qualificação Semântica", () => {
  assert.equal(serpCollectionLabel(serpCollectionUiState({})), "SERP · Não coletada");
  assert.equal(serpCollectionLabel(serpCollectionUiState({ collecting: true })), "SERP · Coletando");
  assert.equal(serpCollectionLabel(serpCollectionUiState({ failed: true })), "SERP · Falha na coleta");
  assert.ok(!panel.includes("SERP · Ainda não coletada"));
  assert.ok(!panel.includes("Aguardando evidência externa"));
  assert.match(panel, /serpCollectionLabel\(serpState\)/);
});

test("A/B/C · depois do preflight as três finalidades são independentes", () => {
  // CALL 1 falhou: a SERP natural continua sendo coletada para o mesmo alvo.
  const afterAllintitleFailure = route.slice(
    route.indexOf("measurement = await measureDataForSeoAllintitle"),
    route.indexOf("let keywordOverview"),
  );
  assert.ok(afterAllintitleFailure.includes("collectSemanticSerp({ keyword: target.keyword,"), "a falha do allintitle não impede a CALL 3");
  assert.ok(afterAllintitleFailure.includes("semanticEvidences.push({"), "a evidência coletada é devolvida mesmo sem medição");
  assert.ok(afterAllintitleFailure.includes('resultStatus: "failed"'));
  assert.ok(afterAllintitleFailure.includes("costAmount: semanticSerpAfterFailure.cost"), "o custo real da CALL 3 é contabilizado no alvo que falhou");

  // CALL 2 falhou: só o erro do overview é guardado; a medição e a SERP seguem.
  assert.ok(route.includes("keywordOverviewError = { code: mapped.code"));
  assert.ok(route.indexOf("const semanticSerp = await collectSemanticSerp") > route.indexOf("keywordOverviewError = { code: mapped.code"));

  // CALL 3 falhou: Resultado, KD e persistência seguem intactos.
  assert.ok(route.indexOf("await persistSuccess(") > route.indexOf("const serpError = semanticSerp.error;"));
  assert.ok(route.includes("keywordDifficulty: keywordOverview?.keywordDifficulty ?? null"));

  // Teto de três chamadas técnicas por keyword: um ponto de coleta por caminho.
  const count = (needle: string) => route.split(needle).length - 1;
  assert.equal(count("collectSemanticSerp({"), 2, "uma coleta por caminho, nunca duas no mesmo alvo");
  assert.equal(count("executeDataForSeoSerpOperation({"), 1);
  assert.equal(count("await measureDataForSeoAllintitle("), 1);
  assert.equal(count("await measureDataForSeoKeywordOverview("), 1);
});

test("D · o sinal do Labs é rotulado como sinal, não como Intenção", () => {
  const summary = readFileSync(new URL("../lib/minerador/keyword-decision-summary.ts", import.meta.url), "utf8");
  assert.ok(summary.includes('addMetric("externalIntent", "Sinal DataForSEO Labs"'));
  assert.ok(panel.includes('{ label: "Sinal DataForSEO Labs", value:'));
  assert.ok(!summary.includes('"Intenção externa"'), "o rótulo antigo não pode sobreviver");
  assert.ok(!panel.includes('"Intenção externa"'));
});

test("E · a SERP em working copy não sustenta aprovação persistida nem handoff", () => {
  // O bloqueio propriamente dito vive em tests/minerador-serp-canonical-gate.
  // Aqui provamos apenas a origem do dado: gates e revisão humana leem o
  // artefato persistido, nunca a working copy da sessão.
  const gates = readFileSync(new URL("../lib/minerador/arquiteto-handoff-gates.ts", import.meta.url), "utf8");
  const humanReview = readFileSync(new URL("../lib/minerador/human-review.ts", import.meta.url), "utf8");
  for (const sessionOnly of ["serpSnapshotRef", "semanticConsolidation", "SemanticConsolidationDraft", "localOnly"]) {
    assert.ok(!gates.includes(sessionOnly), `o handoff não pode depender de ${sessionOnly}`);
    assert.ok(!humanReview.includes(sessionOnly), `a revisão humana não pode depender de ${sessionOnly}`);
  }
  assert.ok(gates.includes("isFullyConsolidatedQualification(qualification)"), "o read-model consulta a Qualificação persistida");
  // O status editorial é decisão humana: não lê working copy nem artifact.
  const statusHandler = workspace.slice(workspace.indexOf("const handleUpdateStatus"), workspace.indexOf("const handleBatchStatus"));
  for (const sessionOnly of ["semanticConsolidationDrafts", "applySerpSemanticEvidence", "semanticQualifications"]) {
    assert.ok(!statusHandler.includes(sessionOnly), `a mudança de status não pode ler ${sessionOnly}`);
  }
  // A working copy vive só na memória da sessão: não existe rota que a persista.
  assert.ok(!route.includes("semantic_consolidation"));
  assert.ok(!workspace.includes("semanticConsolidationDrafts)"), "a working copy não é enviada em nenhum corpo de request");
});

test("F · a derivação é pura: nenhuma chamada real de provider nos testes", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("REAL_PROVIDER_CALL"); }) as typeof fetch;
  try {
    const evidence = deriveSerpSemanticEvidence({ ...evidenceInput, body: serpBody("skin care noturno", informational) });
    assert.ok(evidence);
    assert.equal(serpCollectionLabel(serpCollectionUiState({ evidence })), "SERP · Analisada");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
