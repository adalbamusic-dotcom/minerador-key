import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE,
  SEMANTIC_DERIVATION_VERSION,
  SEMANTIC_THRESHOLDS_VERSION,
  buildKeywordSemanticQualification,
  isFullyConsolidatedQualification,
  parseKeywordSemanticQualification,
  qualificationConsolidatedAxes,
  qualificationVersionLabel,
  semanticDraftFromQualification,
} from "../lib/minerador/keyword-semantic-qualification.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";
import { resolveSemanticAxis } from "../lib/minerador/semantic-consolidation-draft.ts";
import { evaluateMineradorArquitetoHandoff } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { completeHumanReview } from "../lib/minerador/human-review.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { calculateKgrFromMetrics, deriveKgrVisualState } from "../lib/minerador/kgr-applicability.ts";
import { buildMineradorArquitetoHandoffPlan } from "../lib/arquiteto/minerador-handoff.ts";

/**
 * Persistência canônica da Qualificação Semântica.
 *
 * O artifact é keyword-scoped, versionado e gravado em
 * `editorial_artifact_versions`. A working copy da sessão deixou de ser fonte.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/server/keyword-semantic-qualification-store.ts", import.meta.url), "utf8");
const serverHandoff = readFileSync(new URL("../lib/server/arquiteto-workspace.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260828234500_keyword_semantic_qualification_artifact.sql", import.meta.url), "utf8");

const BRAND = "11111111-1111-4111-8111-111111111111";
const KEYWORD = "22222222-2222-4222-8222-222222222222";

function evidenceFrom(items: Array<{ title: string; description?: string }>) {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-serp-1",
        status_code: 20000,
        result: [{
          keyword: "skin care pele oleosa",
          location_code: 2076,
          language_code: "pt",
          items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, ...item })),
        }],
      }],
    },
    keyword: "skin care pele oleosa",
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-serp-1",
    operationRequestId: "33333333-3333-4333-8333-333333333333",
    collectedAt: "2026-08-28T18:00:00.000Z",
  })!;
}

const conclusiveItems = Array.from({ length: 8 }, (_, index) => ({ title: `O que é rotina para pele oleosa ${index + 1}`, description: "Guia passo a passo para entender a rotina." }));
const weakItems = [
  { title: "O que é sérum noturno", description: "guia" },
  { title: "Como aplicar sérum noturno", description: "passo a passo" },
  { title: "Comprar sérum noturno", description: "preco e frete" },
  { title: "Sérum noturno com cupom", description: "desconto" },
  { title: "Melhor sérum noturno", description: "comparativo" },
  { title: "Review do sérum noturno", description: "resenha" },
  { title: "Clinica perto de mim", description: "agendar" },
  { title: "Unidades e endereco", description: "atendimento em SP" },
];

async function qualificationFrom(items: Array<{ title: string; description?: string }>, previous = null as Awaited<ReturnType<typeof buildKeywordSemanticQualification>> | null) {
  return buildKeywordSemanticQualification({ brandId: BRAND, keywordId: KEYWORD, evidence: evidenceFrom(items), createdBy: "user-1", previous });
}

/** Ida e volta pelo armazenamento: o payload é serializado como jsonb. */
function roundTrip(value: unknown) {
  return parseKeywordSemanticQualification(JSON.parse(JSON.stringify(value)));
}

test("A/B · SERP conclusiva persistida reidrata card e valores em qualquer sessão", async () => {
  const persisted = roundTrip(await qualificationFrom(conclusiveItems))!;
  assert.ok(persisted);
  assert.equal(persisted.brandId, BRAND);
  assert.equal(persisted.keywordId, KEYWORD);
  assert.equal(persisted.lifecycle.version, 1);
  assert.match(persisted.lifecycle.contentHash, /^sha256:/);
  assert.equal(persisted.derivation.derivationVersion, SEMANTIC_DERIVATION_VERSION);
  assert.equal(persisted.derivation.thresholdsVersion, SEMANTIC_THRESHOLDS_VERSION);
  assert.equal(persisted.derivation.thresholdsStatus, "provisional_heuristic");

  const draft = semanticDraftFromQualification(persisted, { intent: "Comercial", funnel: "MOFU" });
  assert.equal(resolveSemanticAxis(draft.intent).status, "serp_consolidated");
  assert.equal(resolveSemanticAxis(draft.intent).value, "Informativa");
  assert.equal(resolveSemanticAxis(draft.funnel).value, "TOFU");
  assert.equal(draft.localOnly, false);
  assert.equal(qualificationVersionLabel(persisted), "Qualificação persistida · v1");
  assert.deepEqual(qualificationConsolidatedAxes(persisted), { intent: "Informativa", funnel: "TOFU" });
});

test("C/D · SERP fraca ou insuficiente persiste e não volta para 'não coletada'", async () => {
  const weak = roundTrip(await qualificationFrom(weakItems))!;
  assert.equal(weak.intent.strength, "weak");
  const weakDraft = semanticDraftFromQualification(weak);
  assert.equal(weakDraft.intent.serpStrength, "weak");
  assert.equal(resolveSemanticAxis(weakDraft.intent).status, "serp_inconclusive");
  assert.notEqual(resolveSemanticAxis(weakDraft.intent).status, "awaiting_serp");

  const scarce = roundTrip(await qualificationFrom(conclusiveItems.slice(0, 3)))!;
  assert.equal(scarce.intent.strength, "insufficient");
  assert.equal(semanticDraftFromQualification(scarce).intent.serpStrength, "insufficient");
  assert.equal(isFullyConsolidatedQualification(scarce), false);
  // Persistir evidência não conclusiva é obrigatório: a rota grava toda coleta.
  assert.ok(route.includes("if (serpEvidence) await persistQualification(target, serpEvidence);"));
  assert.ok(!route.includes("if (serpEvidence && isConclusive"), "não existe filtro de conclusividade na escrita");
});

test("E · nova coleta com falha preserva a última versão válida", async () => {
  const v1 = await qualificationFrom(conclusiveItems);
  const v2 = await qualificationFrom(weakItems, v1);
  assert.equal(v2.lifecycle.version, 2);
  assert.equal(v2.lifecycle.supersedesVersionId, v1.id);
  // O armazenamento é append-only: nenhuma escrita apaga ou muta versão anterior.
  for (const destructive of [".delete(", ".update(", ".upsert("]) {
    assert.ok(!store.includes(destructive), `o store não pode usar ${destructive}`);
  }
  // Falha de coleta nem chega a montar versão nova.
  assert.ok(route.includes("if (semanticSerpAfterFailure.evidence) {"));
  assert.ok(route.includes("// Write não confirmado nunca vira sucesso: a versão anterior permanece."));
});

test("F · persistência falha não declara Qualificação salva", () => {
  assert.ok(route.includes("persisted: false,") && route.includes("error: diagnostic.classification"), "a falha do write é reportada com a classificação real");
  assert.ok(route.includes("semanticQualificationFailedCount"));
  const handler = workspace.slice(workspace.indexOf("const handleBatchAllintitle"), workspace.indexOf("const handleBatchQualify"));
  assert.ok(handler.includes("não foi possível persistir a Qualificação Semântica de"));
  assert.ok(handler.includes("Resultados e Qualificação Semântica atualizados para"));
  // O read-model só avança com os ids realmente persistidos.
  assert.ok(handler.includes("const persistedQualificationIds = qualificationOutcomes.filter(item => item?.persisted)"));
  assert.ok(!handler.includes("applySerpSemanticEvidence("), "a working copy não substitui o artifact persistido");
});

test("G/H · leitura e F5 não chamam provider", () => {
  const loader = workspace.slice(workspace.indexOf("const loadSemanticQualifications"), workspace.indexOf("const readCanonicalKeywordRows"));
  assert.ok(loader.includes('.from("editorial_artifact_versions")'));
  assert.ok(loader.includes("KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE"));
  for (const forbidden of ["dataforseo", "/api/minerador", "fetch("]) {
    assert.ok(!loader.includes(forbidden), `a reidratação não pode acionar ${forbidden}`);
  }
  // O carregamento do Perfil reidrata a partir do artifact, não da sessão.
  assert.ok(workspace.includes("const persistedQualifications = await loadSemanticQualifications(selectedBrandId, loadedKeywords.map(item => String(item.id)))"));
  assert.ok(!workspace.includes('localStorage.setItem("semanticQualifications'));
  assert.ok(!workspace.includes('sessionStorage.setItem("semanticQualifications'));
});

test("I · leitura é por brandId + keywordId, sem cross-brand", () => {
  assert.ok(store.includes('.eq("marca_id", input.brandId)'));
  assert.ok(store.includes('.in("entity_id", ids)'));
  assert.ok(store.includes("parsed.brandId !== input.brandId || parsed.keywordId !== entityId"));
  assert.ok(store.includes("A Qualificação Semântica não pertence à Marca/keyword do write."));
  const loader = workspace.slice(workspace.indexOf("const loadSemanticQualifications"), workspace.indexOf("const readCanonicalKeywordRows"));
  assert.ok(loader.includes('.eq("marca_id", brandId)'));
  assert.ok(loader.includes("parsed.brandId !== brandId || parsed.keywordId !== keywordId"));
  for (const forbidden of ["slug", "owner", "keyword_original", "ilike"]) {
    assert.ok(!loader.includes(forbidden), `resolver por ${forbidden} é proibido`);
  }
});

test("J/K/L · Labs, IA e KGR seguem fora do artifact", async () => {
  const qualification = await qualificationFrom(conclusiveItems);
  const serialized = JSON.stringify(qualification);
  for (const forbidden of ["main_intent", "externalIntent", "ai_review", "aiSuggestion", "kgr"]) {
    assert.ok(!serialized.includes(forbidden), `o artifact não pode carregar ${forbidden}`);
  }
  const contract = readFileSync(new URL("../lib/minerador/keyword-semantic-qualification.ts", import.meta.url), "utf8");
  const contractCode = contract.split("*/").slice(1).join("*/");
  assert.ok(!contractCode.includes("main_intent") && !contractCode.includes("ai_review"), "o contrato não lê Labs nem R5");
  // KGR inalterado.
  assert.equal(calculateKgrFromMetrics(720, 388), 0.5389);
  assert.equal(deriveKgrVisualState(0.249).favorable, true);
  assert.equal(deriveKgrVisualState(0.25).favorable, false);
});

test("M/N · o artifact enriquece a decisão sem virar condição de aprovação", async () => {
  const semantic = completeHumanReview({
    semantic: {
      dna_origem: "logico_deterministico",
      intencao_principal: "Informativa",
      funnel: "TOFU",
      volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-28T10:01:00.000Z" },
      allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-28T10:02:00.000Z" },
      kgr_aplicabilidade: "applicable",
      logical_output_contract: buildLogicalOutputContract({ semantic: { intencao_principal: "Informativa", funnel: "TOFU" }, intent: "Informativa", funnel: "TOFU" }),
    },
    intent: "Informativa",
    actorId: "human-1",
    completedAt: "2026-08-28T15:05:00.000Z",
  });
  const keyword = { id: KEYWORD, keyword: "skin care pele oleosa", brand_id: BRAND, status: "aprovado", volume_search: 90, results_allintitle: 12, analise_semantica: semantic };

  // O read-model continua descrevendo o que existe; nenhum dos três estados
  // impede o envio. A decisão é do humano, sobre a keyword como ela está.
  const withoutQualification = evaluateMineradorArquitetoHandoff(keyword, BRAND, null);
  assert.equal(withoutQualification.serpEvidencePersisted, false);
  assert.equal(withoutQualification.ok, true);

  const weak = await qualificationFrom(weakItems);
  const persistedButWeak = evaluateMineradorArquitetoHandoff(keyword, BRAND, weak);
  assert.equal(persistedButWeak.serpEvidencePersisted, true);
  assert.equal(persistedButWeak.semanticAxesConsolidated, false);
  assert.equal(persistedButWeak.ok, true, "SERP mista não é impedimento");

  const consolidated = await qualificationFrom(conclusiveItems);
  const released = evaluateMineradorArquitetoHandoff(keyword, BRAND, consolidated);
  assert.equal(released.semanticAxesConsolidated, true);
  assert.equal(released.ok, true);

  // A planilha não reintroduz o gate por outro caminho.
  const statusHandler = workspace.slice(workspace.indexOf("const handleUpdateStatus"), workspace.indexOf("const handleBatchStatus"));
  for (const forbidden of ["semanticQualifications[wordId]", "isFullyConsolidatedQualification", "isHumanReviewCompleted"]) {
    assert.ok(!statusHandler.includes(forbidden), `a aprovação não pode consultar ${forbidden}`);
  }
});

test("O · o handoff transporta a referência persistida, nunca o draft de sessão", async () => {
  const qualification = await qualificationFrom(conclusiveItems);
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId: BRAND,
    existingKeywordIds: new Set<string>(),
    keywords: [{
      id: KEYWORD,
      brandId: BRAND,
      status: "aprovado",
      semanticQualification: {
        versionId: qualification.id,
        contentHash: qualification.lifecycle.contentHash,
        intent: "Informativa",
        funnel: "TOFU",
        semanticState: "conclusive",
        collectedAt: qualification.source.collectedAt,
      },
    }],
  });
  assert.equal(plan.rows[0]?.source_version_id, qualification.id);
  assert.equal(plan.rows[0]?.source_content_hash, qualification.lifecycle.contentHash);
  assert.equal((plan.rows[0]?.payload as Record<string, unknown>).semanticQualification, plan.rows[0]?.payload && (plan.rows[0]?.payload as { semanticQualification?: unknown }).semanticQualification);
  // A rota canônica recusa antes de planejar e nunca reexecuta a SERP.
  const prepare = serverHandoff.slice(serverHandoff.indexOf("async function prepareCanonicalHandoff"), serverHandoff.indexOf("async function persistCanonicalHandoff"));
  assert.ok(prepare.includes("readCurrentKeywordSemanticQualifications("));
  assert.ok(!prepare.includes('PipelineRuntimeError("INVALID_ARTIFACT"'), "o handoff não recusa por evidência semântica");
  for (const forbidden of ["executeDataForSeoSerpOperation", "deriveSerpSemanticEvidence", "semanticConsolidationDrafts"]) {
    assert.ok(!prepare.includes(forbidden), `o handoff não pode ${forbidden}`);
  }
});

test("P/Q · lote isola cada keyword e não mexe na tela", () => {
  // Cada alvo persiste sozinho, dentro do próprio try/catch.
  const persistBlock = route.slice(route.indexOf("const persistQualification"), route.indexOf("for (const target of targets)"));
  assert.ok(persistBlock.includes("try {") && persistBlock.includes("} catch (error) {"));
  assert.ok(persistBlock.includes("currentQualifications.set(target.keywordId, qualification)"));
  const handler = workspace.slice(workspace.indexOf("const handleBatchAllintitle"), workspace.indexOf("const handleBatchQualify"));
  for (const forbidden of ["setExpandedRowId", "scrollIntoView", "setSelectedIds"]) {
    assert.ok(!handler.includes(forbidden), `o lote não pode chamar ${forbidden}`);
  }
  // A atualização do read-model é aditiva: keywords fora do lote permanecem.
  assert.ok(handler.includes("setSemanticQualifications(current => ({ ...current, ...refreshed }))"));
});

test("o card é parte estável do Perfil e mostra a versão persistida", () => {
  assert.ok(!panel.includes("semanticConsolidationEnabled &&"), "o card não é mais condicional");
  assert.ok(panel.includes('data-keyword-profile-stage="semantic-consolidation"'));
  assert.ok(panel.includes('qualification ? qualificationVersionLabel(qualification) : "Prévia local · ainda não persistida"'));
  assert.ok(panel.includes("A última qualificação válida (v${qualification.lifecycle.version}) continua em uso."));
});

test("a migration é aditiva, defensiva e não cria tabela", () => {
  assert.ok(migration.includes("keyword_semantic_qualification"));
  assert.ok(migration.includes("editorial_artifact_versions_artifact_type_check"));
  assert.ok(migration.includes("raise exception"), "falha se a constraint tiver drifted");
  for (const forbidden of ["create table", "drop table", "delete from", "update public."]) {
    assert.ok(!migration.toLowerCase().includes(forbidden), `a migration não pode conter ${forbidden}`);
  }
  assert.equal(KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE, "keyword_semantic_qualification");
});

test("R · nenhuma chamada de provider nos testes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("REAL_PROVIDER_CALL"); }) as typeof fetch;
  try {
    const qualification = await qualificationFrom(conclusiveItems);
    assert.equal(isFullyConsolidatedQualification(qualification), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
