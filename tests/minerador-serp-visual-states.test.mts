import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveSerpSemanticEvidence,
  serpCollectionLabel,
  serpCollectionUiState,
  serpEvidenceStrengthPresentation,
  type SerpEvidenceStrength,
} from "../lib/minerador/serp-semantic-evidence.ts";
import { applySerpSemanticEvidence, createSemanticConsolidationDraft, resolveSemanticAxis } from "../lib/minerador/semantic-consolidation-draft.ts";

/**
 * Estados visuais da SERP depois do smoke real com "retinol creamy antes e
 * depois": coleta executada sem consolidação não pode aparecer como "não
 * coletada", e a força da evidência tem uma única fonte de apresentação.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const consolidation = panel.slice(panel.indexOf("function SemanticConsolidationPanel"), panel.indexOf("function HumanReviewPanel"));
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

function evidenceFrom(items: Array<{ title: string; description?: string }>) {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-serp-1",
        status_code: 20000,
        result: [{
          keyword: "retinol creamy antes e depois",
          location_code: 2076,
          language_code: "pt",
          items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, ...item })),
        }],
      }],
    },
    keyword: "retinol creamy antes e depois",
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-serp-1",
    operationRequestId: "11111111-1111-4111-8111-111111111111",
    collectedAt: "2026-08-28T18:00:00.000Z",
  })!;
}

const blank = () => createSemanticConsolidationDraft({ keywordId: "k1", brandId: "brand-a", intent: { logic: "Comercial", ai: null }, funnel: { logic: "MOFU", ai: null } });

const conclusive = Array.from({ length: 8 }, (_, index) => ({ title: `O que é retinol creamy ${index + 1}`, description: "Guia passo a passo para entender o uso." }));
/** Cobertura total, mas nenhuma leitura domina: evidência fraca de verdade. */
const weak = [
  { title: "O que é sérum noturno", description: "guia" },
  { title: "Como aplicar sérum noturno", description: "passo a passo" },
  { title: "Comprar sérum noturno", description: "preco e frete" },
  { title: "Sérum noturno com cupom", description: "desconto" },
  { title: "Melhor sérum noturno", description: "comparativo" },
  { title: "Review do sérum noturno", description: "resenha" },
  { title: "Clinica perto de mim", description: "agendar" },
  { title: "Unidades e endereco", description: "atendimento em SP" },
];
/** Um único sinal em 6 resultados: cobertura baixa, nunca conclusão. */
const lowCoverage = [
  { title: "O que é retinol creamy", description: "guia" },
  { title: "Marca A", description: "linha" },
  { title: "Marca B", description: "linha" },
  { title: "Marca C", description: "linha" },
  { title: "Marca D", description: "linha" },
  { title: "Marca E", description: "linha" },
];
const scarce = conclusive.slice(0, 3);

test("A · SERP nunca executada continua sendo 'não coletada'", () => {
  const draft = blank();
  assert.equal(draft.intent.serpStrength, null);
  assert.equal(resolveSemanticAxis(draft.intent).status, "awaiting_serp");
  assert.equal(serpCollectionLabel(serpCollectionUiState({})), "SERP · Não coletada");
  // O card só diz "Não coletada" quando não existe força registrada.
  assert.ok(consolidation.includes('{!value.serpStrength ? "Não coletada"'));
});

test("B/C · coleta real sem conclusão mostra 'Sem conclusão', nunca 'não coletada'", () => {
  const weakDraft = applySerpSemanticEvidence(blank(), evidenceFrom(weak));
  const scarceDraft = applySerpSemanticEvidence(blank(), evidenceFrom(scarce));
  const lowCoverageDraft = applySerpSemanticEvidence(blank(), evidenceFrom(lowCoverage));
  assert.equal(weakDraft.intent.serpStrength, "weak");
  assert.equal(scarceDraft.intent.serpStrength, "insufficient");
  // Dominância 100% sobre cobertura 17% não vira certeza artificial.
  assert.equal(lowCoverageDraft.intent.serpStrength, "insufficient");
  for (const draft of [weakDraft, scarceDraft]) {
    assert.equal(draft.intent.serp, null, "sem valor canônico");
    assert.notEqual(draft.intent.serpStrength, null, "mas a coleta aconteceu");
    assert.equal(resolveSemanticAxis(draft.intent).status, "serp_inconclusive");
  }
  // O valor nulo do eixo não pode voltar a significar ausência de coleta.
  assert.ok(!consolidation.includes('displayValue(value.serp, "Ainda não coletada")'));
  assert.ok(consolidation.includes('"Sem conclusão"'));
  // Badges distintos por estado real.
  assert.equal(serpEvidenceStrengthPresentation("weak").label, "Evidência fraca");
  assert.equal(serpEvidenceStrengthPresentation("insufficient").label, "Evidência insuficiente");
});

test("D · SERP conclusiva mostra o valor consolidado", () => {
  const draft = applySerpSemanticEvidence(blank(), evidenceFrom(conclusive));
  assert.equal(draft.intent.serpStrength, "conclusive");
  assert.equal(resolveSemanticAxis(draft.intent).value, "Informativa");
  assert.equal(serpEvidenceStrengthPresentation("conclusive").label, "Evidência forte");
  assert.ok(consolidation.includes("Resultado consolidado"));
});

test("E/F · fraca e insuficiente não trocam de nome entre consumidores", () => {
  const labels = new Map<SerpEvidenceStrength, string>();
  for (const strength of ["conclusive", "mixed", "weak", "insufficient"] as SerpEvidenceStrength[]) {
    labels.set(strength, serpEvidenceStrengthPresentation(strength).label);
  }
  assert.equal(new Set(labels.values()).size, 4, "cada força tem um rótulo próprio");
  // Um único vocabulário: o painel não reimplementa rótulos de força.
  for (const forbidden of ["SERP mista", "Evidência moderada", '"strong"', '"moderate"', '"absent"']) {
    assert.ok(!consolidation.includes(forbidden), `o painel não pode manter o vocabulário paralelo ${forbidden}`);
  }
  assert.ok(consolidation.includes("serpEvidenceStrengthPresentation(value)"));
  // O cabeçalho descreve a coleta e não nomeia a força de um eixo.
  const header = serpCollectionLabel(serpCollectionUiState({ evidence: { ...evidenceFrom(lowCoverage) } }));
  assert.equal(header, "SERP · Analisada · sem consolidação");
  assert.ok(!header.includes("insuficiente") && !header.includes("fraca"));
  const draftSource = readFileSync(new URL("../lib/minerador/semantic-consolidation-draft.ts", import.meta.url), "utf8");
  assert.ok(!draftSource.includes('"moderate"') && !draftSource.includes('"strong"'), "a working copy usa o enum canônico");
});

test("G · sem consolidação não existe fallback de Lógica, Labs, IA ou humano", () => {
  const weakDraft = applySerpSemanticEvidence(blank(), evidenceFrom(weak));
  const resolution = resolveSemanticAxis(weakDraft.intent);
  assert.equal(resolution.value, null);
  assert.equal(weakDraft.intent.logic, "Comercial", "a hipótese lógica continua visível, mas não vira resultado");
  assert.ok(consolidation.includes('"Não consolidado"'));
  assert.ok(!consolidation.includes("<button") && !consolidation.includes("<input"));
});

test("H · a notificação de Resultados resume o estado agregado da SERP", () => {
  const handler = workspace.slice(workspace.indexOf("const handleBatchAllintitle"), workspace.indexOf("const handleBatchQualify"));
  assert.ok(handler.includes("const serpAnalyzedCount = semanticEvidences.filter"));
  assert.ok(handler.includes("const serpConsolidatedCount = semanticEvidences.filter"));
  assert.ok(handler.includes("Resultados e Qualificação Semântica atualizados para"));
  assert.ok(handler.includes("SERP consolidada para"));
  assert.ok(handler.includes("SERP analisada, mas sem evidência suficiente para consolidar Intenção/Funil."));
  assert.ok(handler.includes("a coleta da SERP falhou para"));
  assert.ok(!handler.includes("allintitle persistidos e refletidos na tabela"), "a mensagem antiga escondia a CALL 3");
  // Uma notificação agregada por ação: os ramos são exclusivos e nenhum aviso
  // é emitido dentro do laço por keyword.
  const evidenceLoop = handler.slice(handler.indexOf("for (const projection of semanticEvidences)"), handler.indexOf("const qualificationOutcomes"));
  assert.equal((evidenceLoop.match(/showNotification\(/g) || []).length, 0);
  const outcomeBranches = handler.slice(handler.indexOf('if (data.code === "DATAFORSEO_PARTIAL_RESULTS")'), handler.indexOf("} catch"));
  assert.equal((outcomeBranches.match(/showNotification\(/g) || []).length, (outcomeBranches.match(/else/g) || []).length + 1, "um aviso por ramo exclusivo");
});

test("I · nenhuma chamada de provider nos testes", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("REAL_PROVIDER_CALL"); }) as typeof fetch;
  try {
    assert.equal(applySerpSemanticEvidence(blank(), evidenceFrom(weak)).intent.serpStrength, "weak");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
