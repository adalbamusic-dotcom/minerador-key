import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE,
  brandVoiceAppliedInPresentation,
  buildKeywordContextualPresentation,
  contextualPresentationVersionLabel,
  parseKeywordContextualPresentation,
} from "../lib/minerador/keyword-contextual-presentation.ts";
import {
  KEYWORD_CONTEXTUAL_PRESENTATION_ORIGIN,
  KEYWORD_CONTEXTUAL_PRESENTATION_STATUS,
  buildKeywordContextualPresentationRow,
  classifyArtifactPersistenceError,
} from "../lib/minerador/keyword-contextual-presentation-row.ts";
import {
  contextualPresentationDecisionLabel,
  contextualPresentationIsPersisted,
  contextualPresentationProcessState,
  deriveContextualPresentationUiState,
} from "../lib/minerador/contextual-presentation-ui-state.ts";
import { canCompleteHumanReview, completeHumanReview } from "../lib/minerador/human-review.ts";
import { evaluateMineradorArquitetoHandoff } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { calculateKgrFromMetrics, deriveKgrVisualState } from "../lib/minerador/kgr-applicability.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { buildMineradorArquitetoHandoffPlan, readMineradorHandoffPresentationRef } from "../lib/arquiteto/minerador-handoff.ts";

/**
 * Persistência canônica da Apresentação Contextual.
 *
 * Artifact keyword-scoped `keyword_contextual_presentation`, versionado no
 * mesmo store da Qualificação Semântica. Persistir não amplia autoridade.
 * REAL_DEEPSEEK_CALLS_IN_TESTS = 0 · REAL_DATAFORSEO_CALLS_IN_TESTS = 0.
 */

const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/server/keyword-contextual-presentation-store.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260828235500_keyword_contextual_presentation_artifact.sql", import.meta.url), "utf8");

const BRAND = "11111111-1111-4111-8111-111111111111";
const KEYWORD = "22222222-2222-4222-8222-222222222222";
const ACTOR = "44444444-4444-4444-8444-444444444444";

const generated = {
  text: "Apresente a rotina noturna com a voz calma e técnica da Marca, sem promessas.",
  generatedAt: "2026-08-28T19:00:00.000Z",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  inputKeywordDnaRef: { entityId: KEYWORD, versionId: "keyword-dna:v3", contentHash: "sha256:dna" },
  appliedSkillRefs: [
    { definitionKey: "brand_voice", versionId: "brand_skill:voice:v2", versionNumber: 2, contentHash: "sha256:voice", lifecycleStatus: "active" },
  ],
};

const presentationOf = (previous = null as Awaited<ReturnType<typeof buildKeywordContextualPresentation>> | null, text = generated.text) =>
  buildKeywordContextualPresentation({
    brandId: BRAND,
    keywordId: KEYWORD,
    keyword: "skin care noturno",
    presentation: { ...generated, text },
    operationRequestId: "55555555-5555-4555-8555-555555555555",
    executionRequestId: "66666666-6666-4666-8666-666666666666",
    actorUserId: ACTOR,
    previous,
  });

const roundTrip = (value: unknown) => parseKeywordContextualPresentation(JSON.parse(JSON.stringify(value)));

test("A/B · geração persistida vira artifact v1 e volta idêntica na leitura", async () => {
  const artifact = await presentationOf();
  const row = buildKeywordContextualPresentationRow({ presentation: artifact, changeReason: "Apresentação gerada pela IA." });
  assert.equal(row.artifact_type, KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE);
  assert.equal(row.entity_id, KEYWORD);
  assert.equal(row.marca_id, BRAND);
  assert.equal(row.version_number, 1);
  assert.equal(row.previous_version_id, null);
  assert.equal(row.status, KEYWORD_CONTEXTUAL_PRESENTATION_STATUS);
  assert.equal(row.origin, KEYWORD_CONTEXTUAL_PRESENTATION_ORIGIN);
  for (const column of ["version_id", "entity_id", "marca_id", "artifact_type", "version_number", "status", "content_hash", "payload", "origin", "change_reason", "created_by"]) {
    assert.ok(row[column as keyof typeof row] !== null && row[column as keyof typeof row] !== undefined, `${column} é NOT NULL`);
  }

  const readBack = roundTrip(artifact)!;
  assert.equal(readBack.output.text, generated.text);
  assert.equal(readBack.provenance.provider, "deepseek");
  assert.equal(readBack.provenance.model, "deepseek-v4-pro");
  assert.equal(readBack.provenance.operationRequestId, "55555555-5555-4555-8555-555555555555");
  assert.equal(readBack.provenance.actorUserId, ACTOR);
  assert.match(readBack.lifecycle.contentHash, /^sha256:/);
  assert.equal(contextualPresentationVersionLabel(readBack), "Apresentação persistida · v1");
});

test("L · appliedSkillRefs e refs de entrada são preservados", async () => {
  const readBack = roundTrip(await presentationOf())!;
  assert.deepEqual(readBack.input.appliedSkillRefs, [
    { definitionKey: "brand_voice", versionId: "brand_skill:voice:v2", versionNumber: 2, contentHash: "sha256:voice", lifecycleStatus: "active" },
  ]);
  assert.equal(brandVoiceAppliedInPresentation(readBack), true);
  assert.equal(readBack.input.inputKeywordDnaRef?.versionId, "keyword-dna:v3");
  assert.equal(readBack.input.keyword, "skin care noturno");
});

test("C/D/E/F · reidratação vem do artifact remoto, sem IA e sem DataForSEO", () => {
  const loader = workspace.slice(workspace.indexOf("const loadContextualPresentations"), workspace.indexOf("const readCanonicalKeywordRows"));
  assert.ok(loader.includes('.from("editorial_artifact_versions")'));
  assert.ok(loader.includes("KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE"));
  assert.ok(loader.includes("persisted: true"));
  for (const forbidden of ["deepseek", "brief-apresentacao", "dataforseo", "fetch("]) {
    assert.ok(!loader.includes(forbidden), `a reidratação não pode acionar ${forbidden}`);
  }
  // O carregamento normal das keywords faz a reidratação, tolerante a falha.
  assert.ok(workspace.includes("const persistedPresentations = await loadContextualPresentations(selectedBrandId, loadedKeywords.map(item => String(item.id)))"));
  assert.ok(workspace.includes("if (persistedPresentations) setPresentationBriefs(current => ({ ...current, ...persistedPresentations }))"));
  assert.ok(!workspace.includes('localStorage.setItem("presentationBriefs'));
  assert.ok(!workspace.includes('sessionStorage.setItem("presentationBriefs'));
});

test("G/H/I · versionamento, idempotência e preservação da versão anterior", async () => {
  const v1 = await presentationOf();
  const v2 = await presentationOf(v1, "Nova leitura editorial da mesma keyword.");
  assert.equal(v2.lifecycle.version, 2);
  assert.equal(v2.lifecycle.supersedesVersionId, v1.id);
  assert.notEqual(v2.lifecycle.contentHash, v1.lifecycle.contentHash);
  // Store append-only: nenhuma escrita apaga ou muta a versão anterior.
  for (const destructive of [".delete(", ".update(", ".upsert("]) {
    assert.ok(!store.includes(destructive), `o store não pode usar ${destructive}`);
  }
  assert.ok(store.includes('diagnostic.classification === "DB_UNIQUE_CONFLICT"'));
  assert.ok(store.includes("current.lifecycle.contentHash === input.presentation.lifecycle.contentHash"));
  assert.ok(store.includes("alreadyPersisted: true"));
});

test("J · write falho não declara persistência e preserva a working copy", () => {
  assert.ok(route.includes("persisted: Boolean(persistedPresentation)"));
  assert.ok(route.includes("persistenceFailure"));
  assert.ok(route.includes('console.error("[contextual-presentation] persistência rejeitada"'));
  assert.ok(workspace.includes("persisted: payload.persisted === true"));
  // Estado visual honesto para geração sem write.
  const sessionOnly = deriveContextualPresentationUiState({ hasPersistedPresentation: false, hasSessionPresentation: true });
  assert.equal(sessionOnly, "success_session_unpersisted");
  assert.equal(contextualPresentationIsPersisted(sessionOnly), false);
  assert.equal(contextualPresentationDecisionLabel(sessionOnly), "Sessão");
  assert.match(contextualPresentationProcessState(sessionOnly).reason, /não foi possível persistir/);
  assert.ok(panel.includes('presentationBrief.persisted ? `Apresentação persistida'));
});

test("estado visual: artifact remoto vence working copy e estado vazio", () => {
  const persisted = deriveContextualPresentationUiState({ hasPersistedPresentation: true, hasSessionPresentation: true });
  assert.equal(persisted, "success_persisted");
  assert.equal(contextualPresentationDecisionLabel(persisted), "Persistida");
  assert.equal(contextualPresentationProcessState(persisted).artifactState, "current_valid");
  assert.equal(contextualPresentationProcessState(persisted).complete, true);

  const failedAfterPersisted = deriveContextualPresentationUiState({ hasPersistedPresentation: true, hasSessionPresentation: false, lastAttemptFailed: true });
  assert.equal(failedAfterPersisted, "failed_with_previous_persisted");
  assert.equal(contextualPresentationProcessState(failedAfterPersisted).complete, true, "a versão anterior continua válida");

  assert.equal(deriveContextualPresentationUiState({ hasSessionPresentation: false }), "not_executed");
  assert.equal(deriveContextualPresentationUiState({ hasSessionPresentation: false, running: true }), "running");
  assert.equal(deriveContextualPresentationUiState({ hasSessionPresentation: false, lastAttemptFailed: true }), "failed_without_result");
  assert.ok(panel.includes("hasPersistedPresentation: Boolean(presentationBrief?.persisted)"));
});

test("K · leitura é por brandId + keywordId, sem cross-brand", () => {
  assert.ok(store.includes('.eq("marca_id", input.brandId)'));
  assert.ok(store.includes("parsed.brandId !== input.brandId || parsed.keywordId !== entityId"));
  assert.ok(store.includes("A Apresentação Contextual não pertence à Marca/keyword do write."));
  const loader = workspace.slice(workspace.indexOf("const loadContextualPresentations"), workspace.indexOf("const readCanonicalKeywordRows"));
  assert.ok(loader.includes('.eq("marca_id", brandId)'));
  assert.ok(loader.includes("parsed.brandId !== brandId || parsed.keywordId !== keywordId"));
  for (const forbidden of ["slug", "owner", "ilike"]) {
    assert.ok(!loader.includes(forbidden), `resolver por ${forbidden} é proibido`);
  }
});

test("M/N · IA persistida continua opcional para revisão, aprovação e handoff", () => {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    funnel: "TOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-28T10:01:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-28T10:02:00.000Z" },
    kgr_aplicabilidade: "applicable",
    logical_output_contract: buildLogicalOutputContract({ semantic: { intencao_principal: "Informativa", funnel: "TOFU" }, intent: "Informativa", funnel: "TOFU" }),
  };
  assert.equal(canCompleteHumanReview(semantic, { intent: "Informativa" }).ok, true);
  const completed = completeHumanReview({ semantic, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-28T15:05:00.000Z" });
  const gate = evaluateMineradorArquitetoHandoff({ id: KEYWORD, keyword: "skin care noturno", brand_id: BRAND, status: "aprovado", volume_search: 90, results_allintitle: 12, analise_semantica: completed }, BRAND, null);
  assert.equal(gate.aiCompleted, false);
  assert.doesNotMatch(gate.reason || "", /apresenta(ção|cao)/i, "o bloqueio nunca é da IA");
  const gates = readFileSync(new URL("../lib/minerador/arquiteto-handoff-gates.ts", import.meta.url), "utf8");
  assert.ok(!gates.includes("contextualPresentation"), "a IA não entra no gate");
  assert.ok(!gates.includes("if (!input.aiCompleted)"));
});

test("O · o R5 legado não participa do read, do write nem da UI", () => {
  const contract = readFileSync(new URL("../lib/minerador/keyword-contextual-presentation.ts", import.meta.url), "utf8");
  const contractCode = contract.split("*/").slice(1).join("*/");
  const storeCode = store.split("*/").slice(1).join("*/");
  for (const legacy of ["ai_review", "semantic_review", "ia_revisao", "revisao_ia"]) {
    assert.ok(!contractCode.includes(legacy), `o contrato não pode ler ${legacy}`);
    assert.ok(!storeCode.includes(legacy), `o store não pode ler ${legacy}`);
  }
  const uiState = readFileSync(new URL("../lib/minerador/contextual-presentation-ui-state.ts", import.meta.url), "utf8");
  const uiCode = uiState.split("*/").slice(1).join("*/");
  assert.ok(!uiCode.includes("ai_review"));
  assert.ok(!uiCode.includes("isCompletedSemanticReview"));
});

test("P · gerar IA não invalida nenhum outro processo", () => {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    funnel: "TOFU",
    logical_output_contract: buildLogicalOutputContract({ semantic: { intencao_principal: "Informativa", funnel: "TOFU" }, intent: "Informativa", funnel: "TOFU" }),
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-28T10:01:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-28T10:02:00.000Z" },
    human_review: { schemaVersion: "r6", status: "completed", decision: "completed", fieldDecisions: [], completedAt: "2026-08-28T15:05:00.000Z", completedBy: "human-1" },
    dna_revisao_humana: "aprovado",
  };
  const state = resolveMineradorProcessState({ id: KEYWORD, keyword: "skin care noturno", volume_search: 90, results_allintitle: 12, analise_semantica: semantic });
  assert.equal(state.review.complete, true);
  assert.notEqual(state.review.artifactState, "stale");
  const processState = readFileSync(new URL("../lib/minerador/process-state.ts", import.meta.url), "utf8");
  assert.ok(!processState.includes("contextualPresentation"), "a apresentação não cria invalidação cross-process");
  // KGR intocado.
  assert.equal(calculateKgrFromMetrics(720, 388), 0.5389);
  assert.equal(deriveKgrVisualState(0.249).favorable, true);
  assert.equal(deriveKgrVisualState(0.25).favorable, false);
});

test("erros de persistência são classificados e a migration é aditiva", () => {
  assert.equal(classifyArtifactPersistenceError({ code: "23514" }).classification, "DB_CONSTRAINT_VIOLATION");
  assert.equal(classifyArtifactPersistenceError({ code: "23502" }).classification, "DB_INVALID_PAYLOAD");
  assert.equal(classifyArtifactPersistenceError({ code: "23505" }).classification, "DB_UNIQUE_CONFLICT");
  assert.ok(migration.includes("keyword_contextual_presentation"));
  assert.ok(migration.includes("keyword_semantic_qualification"), "preserva o tipo já material");
  const migrationSql = migration.split(String.fromCharCode(10)).filter(line => !line.trim().startsWith("--")).join(String.fromCharCode(10)).toLowerCase();
  for (const forbidden of ["create table", "drop table", "delete from"]) {
    assert.ok(!migrationSql.includes(forbidden), `a migration não pode conter ${forbidden}`);
  }
});

test("nenhuma chamada real de provider nos testes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("REAL_PROVIDER_CALL"); }) as typeof fetch;
  try {
    const artifact = await presentationOf();
    assert.equal(artifact.lifecycle.version, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("G/H/I · sucessora falha: v1 continua canônica e a tentativa fica separada", async () => {
  // Read-model: só o artifact persistido é reidratado; a tentativa é de sessão.
  const persistedState = deriveContextualPresentationUiState({ hasPersistedPresentation: true, hasSessionPresentation: true, lastAttemptFailed: true });
  assert.equal(persistedState, "failed_with_previous_persisted");
  assert.equal(contextualPresentationProcessState(persistedState).artifactState, "current_valid");
  assert.equal(contextualPresentationDecisionLabel(persistedState), "Persistida");

  // A geração sem write não sobrescreve a versão persistida no estado da sessão.
  const handler = workspace.slice(workspace.indexOf("const runContextualPresentation"), workspace.indexOf("const handleBatchContextualPresentation"));
  assert.ok(handler.includes("if (generatedBrief.persisted) {"), "só a versão persistida vira canônica");
  assert.ok(handler.includes("setPresentationAttempts(current => ({ ...current, [keywordId]: generatedBrief }))"));
  assert.ok(handler.includes("current[keywordId]?.persisted ? current :"), "a v1 persistida não é substituída");
  assert.ok(handler.includes('code: "AI_PRESENTATION_NOT_PERSISTED"'));

  // A UI declara a tentativa e aponta a versão canônica.
  assert.ok(panel.includes("Nova tentativa não persistida"));
  assert.ok(panel.includes("A versão canônica continua sendo a v"));
  assert.ok(panel.includes("um F5 descarta esta tentativa"));

  // F5 reidrata apenas o artifact: a tentativa não é persistida em lugar nenhum.
  assert.ok(!workspace.includes('localStorage.setItem("presentationAttempts'));
  assert.ok(!workspace.includes('sessionStorage.setItem("presentationAttempts'));
  const loader = workspace.slice(workspace.indexOf("const loadContextualPresentations"), workspace.indexOf("const readCanonicalKeywordRows"));
  assert.ok(loader.includes("persisted: true"));
  assert.ok(!loader.includes("presentationAttempts"));

  const v1 = await presentationOf();
  const v2 = await presentationOf(v1, "Texto da tentativa que não foi gravada.");
  assert.equal(v2.lifecycle.supersedesVersionId, v1.id, "a sucessora referencia a anterior quando gravada");
  assert.equal(v1.lifecycle.version, 1, "v1 permanece intacta no contrato");
});

test("M/N · o handoff transporta a ref quando existe e segue sem ela quando não existe", async () => {
  const artifact = await presentationOf();
  const withPresentation = buildMineradorArquitetoHandoffPlan({
    brandId: BRAND,
    existingKeywordIds: new Set<string>(),
    keywords: [{
      id: KEYWORD,
      brandId: BRAND,
      status: "aprovado",
      contextualPresentation: {
        versionId: artifact.id,
        versionNumber: artifact.lifecycle.version,
        contentHash: artifact.lifecycle.contentHash,
        generatedAt: artifact.provenance.generatedAt,
      },
    }],
  });
  const ref = readMineradorHandoffPresentationRef(withPresentation.rows[0]?.payload);
  assert.ok(ref);
  assert.equal(ref?.versionId, artifact.id);
  assert.equal(ref?.versionNumber, 1);
  assert.equal(ref?.contentHash, artifact.lifecycle.contentHash);
  assert.equal(ref?.keywordId, KEYWORD);
  assert.equal(ref?.brandId, BRAND);
  assert.equal(ref?.generatedAt, artifact.provenance.generatedAt);

  // Sem apresentação o handoff continua válido, com ref ausente.
  const withoutPresentation = buildMineradorArquitetoHandoffPlan({
    brandId: BRAND,
    existingKeywordIds: new Set<string>(),
    keywords: [{ id: KEYWORD, brandId: BRAND, status: "aprovado" }],
  });
  assert.equal(withoutPresentation.rows.length, 1, "a ausência não bloqueia o envio");
  assert.equal((withoutPresentation.rows[0]?.payload as Record<string, unknown>).contextualPresentation, null);
  assert.equal(readMineradorHandoffPresentationRef(withoutPresentation.rows[0]?.payload), null);
});

test("L/O/P/Q · a apresentação nunca bloqueia e o import não chama provider", () => {
  const server = readFileSync(new URL("../lib/server/arquiteto-workspace.ts", import.meta.url), "utf8");
  const prepare = server.slice(server.indexOf("async function prepareCanonicalHandoff"), server.indexOf("async function persistCanonicalHandoff"));
  // Leitura opcional e tolerante: falha na leitura não impede o handoff.
  assert.ok(prepare.includes("readCurrentKeywordContextualPresentations("));
  assert.ok(prepare.includes(".catch(() => new Map<string, KeywordContextualPresentation>())"));
  for (const blocker of ["withoutPresentation", "PRESENTATION_REQUIRED", "contextualPresentation)) {"]) {
    assert.ok(!prepare.includes(blocker), `a apresentação não pode virar blocker (${blocker})`);
  }
  // O import do Arquiteto não gera IA nem SERP.
  for (const forbidden of ["generatePlainTextAI", "deepseek", "executeDataForSeoSerpOperation", "dataforseo"]) {
    assert.ok(!prepare.includes(forbidden), `o import não pode acionar ${forbidden}`);
  }
  // Cross-brand: a leitura é filtrada por Marca na origem.
  const store = readFileSync(new URL("../lib/server/keyword-contextual-presentation-store.ts", import.meta.url), "utf8");
  assert.ok(store.includes('.eq("marca_id", input.brandId)'));
});

test("a notificação separa geração de persistência", () => {
  const handler = workspace.slice(workspace.indexOf("const handleBatchContextualPresentation"), workspace.indexOf("const handleOpenHumanReview"));
  // Sucesso de persistência só quando tudo foi gravado.
  assert.ok(handler.includes("if (failures.length === 0 && unpersistedCount === 0) {"));
  assert.ok(handler.includes('showNotification("success", `Apresentação contextual gerada e persistida para ${persistedCount} keyword(s).`'));
  // Geração PASS + persistência FAIL vira INFO (source workflow), nunca SUCCESS.
  assert.ok(handler.includes('showNotification("info", `Apresentação contextual gerada para ${successCount} keyword(s), mas não foi possível persistir ${unpersistedCount}.`'));
  assert.ok(handler.includes('stage: "contextual_presentation_persistence"'));
  assert.ok(!handler.includes("Working copy: nada foi gravado no KeywordDNA"), "a mensagem antiga afirmava sucesso sem persistir");
  // O mapeamento de origem continua derivando de severidade.
  assert.ok(workspace.includes('source: type === "success" ? "persistence" : "workflow"'));
  assert.ok(handler.includes('if (result.code === "AI_PRESENTATION_NOT_PERSISTED") unpersistedCount++;'));
});

test("a migration do CHECK é guardada por dados e mantém os oito tipos", () => {
  for (const type of ["article_dna", "silo_dna", "silo_page", "content_plan", "brand_dna", "brand_skill", "keyword_semantic_qualification", "keyword_contextual_presentation"]) {
    assert.ok(migration.includes(type), `o CHECK final precisa manter ${type}`);
  }
  // A guarda não depende do texto do constraint, e sim das linhas existentes.
  assert.ok(migration.includes("artifact_type not in ("));
  assert.ok(migration.includes("raise exception"));
  const sql = migration.split(String.fromCharCode(10)).filter(line => !line.trim().startsWith("--")).join(String.fromCharCode(10)).toLowerCase();
  for (const forbidden of ["create table", "add column", "create policy", "grant ", "schema_migrations"]) {
    assert.ok(!sql.includes(forbidden), `a migration não pode conter ${forbidden}`);
  }
});

test("geração e persistência são domínios de falha separados na rota", () => {
  // A persistência acontece depois do usage de geração e tem catch próprio.
  const generationIndex = route.indexOf('await recordPresentationUsage("succeeded", null)');
  const persistenceIndex = route.indexOf("let persistedPresentation");
  const responseIndex = route.indexOf("return NextResponse.json({", persistenceIndex);
  assert.ok(generationIndex > 0 && persistenceIndex > generationIndex && responseIndex > persistenceIndex);
  const persistenceBlock = route.slice(persistenceIndex, responseIndex);
  assert.ok(persistenceBlock.includes("try {") && persistenceBlock.includes("} catch (error) {"));
  assert.ok(!persistenceBlock.includes("return failure("), "falha de write nunca vira resposta de erro de geração");

  // A resposta devolve a apresentação mesmo quando o write falhou.
  const response = route.slice(responseIndex, route.indexOf("} catch (error) {", responseIndex));
  assert.ok(response.includes("contextualPresentation,"));
  assert.ok(response.includes("persisted: Boolean(persistedPresentation)"));
  assert.ok(response.includes("persistenceFailure"));

  // O catch externo só classifica etapas anteriores ao write.
  const outerCatch = route.slice(route.lastIndexOf("} catch (error) {"));
  for (const stage of ["provider_generation", "provider_configuration", "authorization_or_context"]) {
    assert.ok(outerCatch.includes(stage), `o catch externo precisa nomear a etapa ${stage}`);
  }
  assert.ok(!outerCatch.includes("contextual_presentation_persistence"), "persistência não é tratada no catch de geração");
  // request e response têm catch próprio, antes do catch externo.
  assert.ok(route.includes('stage: "request_validation"'));
  assert.ok(route.includes('stage: "response_validation"'));

  // O ledger não é caminho crítico: falha de usage não derruba a resposta.
  const usage = route.slice(route.indexOf("const recordPresentationUsage"), generationIndex);
  assert.ok(usage.includes("} catch (usageError) {"));
  assert.ok(usage.includes("[contextual-presentation] usage não registrado"));
});

test("o cliente reporta a etapa real em vez de mensagem genérica", () => {
  const handler = workspace.slice(workspace.indexOf("const runContextualPresentation"), workspace.indexOf("const handleBatchContextualPresentation"));
  // Resposta sem JSON deixa de virar "não foi possível gerar".
  assert.ok(handler.includes("await response.json().catch(() => null)"));
  assert.ok(handler.includes('code: "AI_PRESENTATION_INVALID_RESPONSE"'));
  assert.ok(handler.includes("sem JSON utilizável"));
  // Falha com JSON carrega status e etapa quando a rota informar.
  assert.ok(handler.includes("payload.stage ? ` · etapa ${payload.stage}` : \"\""));
  // Geração boa com write falho continua sendo sucesso de geração.
  assert.ok(handler.includes('return { ok: true, code: "AI_PRESENTATION_NOT_PERSISTED" }'));
});
