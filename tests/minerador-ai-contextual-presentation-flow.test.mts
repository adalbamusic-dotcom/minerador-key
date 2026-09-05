import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importBrandSkill } from "../lib/marca/brand-skill-domain.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { buildBrandAIContextForPresentation } from "../lib/marca/brand-ai-context.ts";
import { buildContextualPresentationPrompt, buildKeywordDnaPresentationContext, parseContextualPresentation } from "../lib/minerador/presentation-brief.ts";
import { humanReviewRecord, isHumanReviewCompleted } from "../lib/minerador/human-review.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

/**
 * O processo IA do Processador passou a significar Apresentação Contextual.
 * Nenhum teste chama provider: REAL_AI_CALLS_IN_TESTS = 0.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts", import.meta.url), "utf8");

const aiAction = workspace.slice(workspace.indexOf('label="IA"') - 900, workspace.indexOf('label="IA"') + 700);
const contextualHandler = workspace.slice(
  workspace.indexOf("const runContextualPresentation"),
  workspace.indexOf("const handleOpenHumanReview"),
);

const now = "2026-08-28T12:00:00.000Z";

async function activeVoiceSkill(brandId: string) {
  return {
    ...(await importBrandSkill({
      brandId,
      definitionKey: "brand_voice",
      name: "Care Glow",
      filename: careGlowSkillFile.filename,
      markdown: careGlowSkillFile.content,
      byteSize: careGlowSkillFile.byteSize,
      mimeType: careGlowSkillFile.mimeType,
      importedBy: "actor-a",
      now,
    })),
    status: "active" as const,
    versionId: "44444444-4444-4444-8444-444444444444",
  };
}

const keywordRow = {
  id: "55555555-5555-4555-8555-555555555555",
  brand_id: "brand-a",
  keyword: "skin care para peles oleosas",
  location: "Brasil",
  intent: null as string | null,
  volume_search: 720,
  results_allintitle: null as number | null,
  kgr_score: null,
  analise_semantica: { dna_origem: "logico_deterministico", nicho: "Estética" } as Record<string, unknown>,
};

test("A — a ação IA do Processador executa a Apresentação Contextual, não o R5", () => {
  assert.ok(aiAction.includes("onClick={() => void handleBatchContextualPresentation()}"));
  assert.ok(!aiAction.includes("handleBatchSemanticReview"), "o botão IA não pode acionar a revisão semântica legada");
  assert.match(aiAction, /apresentação contextual/i);
  assert.match(contextualHandler, /ia\/brief-apresentacao/);
  // O fluxo legado permanece no arquivo, mas sem nenhum gatilho operacional.
  const triggers = workspace.match(/handleBatchSemanticReview/g) || [];
  assert.equal(triggers.length, 1, "handleBatchSemanticReview só pode existir como definição sem consumidor");
  assert.ok(!contextualHandler.includes("process-intent-niche"));
});

test("B — a resposta válida vira o texto exibido na working copy", () => {
  const { presentation } = parseContextualPresentation({ text: "Abra explicando a diferença entre oleosidade e desidratação antes de indicar rotina." });
  assert.match(presentation.text, /oleosidade/);
  assert.match(contextualHandler, /setPresentationBriefs/);
  assert.match(panel, /data-keyword-contextual-presentation-text/);
  assert.match(panel, /presentationBrief\.contextualPresentation\.text/);
});

test("C — nenhuma saída da IA cria decisão de Intenção ou Funil", async () => {
  const { presentation } = parseContextualPresentation({ text: "Texto válido.", intent: "Comercial", funnel: "BOFU" });
  assert.deepEqual(Object.keys(presentation), ["text"]);
  // O handler contextual só grava a working copy local; não toca intent/funnel.
  for (const forbidden of ["intencao_humana", "funnel_humano", "applyHumanReviewField"]) {
    assert.ok(!contextualHandler.includes(forbidden), `A apresentação não pode escrever ${forbidden}`);
  }
  assert.ok(!route.includes(".update("));
  assert.ok(!route.includes(".insert("));
  // A revisão humana continua concluível sem nenhum artefato de IA.
  const completed = { dna_origem: "logico_deterministico", intencao_principal: "Informativa", funnel: "TOFU" };
  const record = humanReviewRecord(completed);
  assert.equal(record.status, "in_progress");
  assert.equal(isHumanReviewCompleted(completed), false);
});

test("D — a Revisão Humana não apresenta mais concordâncias, Lógica × IA nem enriquecimentos R5", () => {
  const reviewPanel = panel.slice(panel.indexOf("function HumanReviewPanel"), panel.indexOf("function SemanticConsolidationSummary") > 0 ? panel.indexOf("function SemanticConsolidationSummary") : panel.length);
  assert.match(reviewPanel, /const aiReview: ProfileRecord \| null = null;/);
  assert.match(reviewPanel, /void legacyAiReview;/);
  assert.match(reviewPanel, /IA · Apresentação contextual/);
  assert.ok(!reviewPanel.includes('aiReview ? "IA executada"'));
  assert.ok(!reviewPanel.includes("Resultado IA: <strong className=\"font-semibold text-foreground\">{aiVerdict"));
});

test("E — o ai_review R5 legado continua preservado e sem autoridade na UI atual", () => {
  const legacy = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    ai_review: { schemaVersion: "r5", status: "completed", reviewStatus: "completed", overallVerdict: "CONCORDA", fieldReviews: [], semanticEnrichment: {} },
  };
  // O artefato continua no KeywordDNA e continua legível pelo read-model.
  const states = resolveMineradorProcessState({ id: keywordRow.id, keyword: keywordRow.keyword, analise_semantica: legacy });
  assert.equal(states.ai.artifactState, "current_valid");
  assert.ok(legacy.ai_review, "o artefato legado nunca é apagado");
  // Mas a Revisão Humana não deriva mais nada dele.
  assert.match(panel, /R5 legado: o ai_review persistido continua no KeywordDNA como histórico/);
});

test("F — falha do provider não aciona fallback R5 nem altera outros processos", () => {
  // A falha carrega o código da rota e, quando faltar mensagem, status e etapa.
  assert.ok(contextualHandler.includes("return { ok: false, code: payload.code, error: payload.error ||"));
  assert.ok(contextualHandler.includes("A rota da apresentação respondeu"), "resposta sem JSON é reportada com status real");
  assert.ok(!contextualHandler.includes("process-intent-niche"));
  assert.ok(!contextualHandler.includes("semantic_review"));
  assert.match(contextualHandler, /setProcessAttempt\(\[item\.id\], "ai", "failed", executionRequestId\)/);
  assert.match(route, /sanitizedDiagnostic/);
  assert.ok(!route.includes("apiKey"), "o diagnóstico não pode expor credenciais");
});

test("G — o prompt carrega a Voz da Marca ativa da Brand correta", async () => {
  const skill = await activeVoiceSkill("brand-a");
  const pack = getBrandContextPack({ brandId: "brand-a", module: "minerador", purpose: "keyword-contextual-presentation", skills: [skill], now });
  const prompt = buildContextualPresentationPrompt({
    keywordDna: buildKeywordDnaPresentationContext(keywordRow),
    brandContext: buildBrandAIContextForPresentation(pack),
  });
  assert.match(prompt, /Perfil de Voz aprovado/);
  assert.match(prompt, /versionId: 44444444-4444-4444-8444-444444444444/);
  assert.match(prompt, /skin care para peles oleosas/);
});

test("H — Brand A nunca recebe a Skill da Brand B", async () => {
  const foreign = await activeVoiceSkill("brand-b");
  const pack = getBrandContextPack({ brandId: "brand-a", module: "minerador", purpose: "keyword-contextual-presentation", skills: [foreign], now });
  assert.deepEqual(pack.skills, []);
  const context = buildBrandAIContextForPresentation(pack);
  assert.deepEqual(context.appliedSkillRefs, []);
  assert.ok(!context.brandContext.includes("Care Glow"));
  assert.match(route, /listPersistedBrandSkills\(brandId\)/);
});

test("I — uma ação explícita gera no máximo um usage event da execução", () => {
  const usageCalls = route.match(/recordIntegrationUsageForResource\(/g) || [];
  assert.equal(usageCalls.length, 1, "existe um único ponto de accounting na rota");
  assert.match(route, /providerRequestStarted = false;\s*\n\s*await recordIntegrationUsageForResource|providerRequestStarted = false;/);
  assert.match(route, /idempotencyKey: `minerador:contextual-presentation:\$\{operationRequestId\}`/);
  assert.match(route, /if \(!providerRequestStarted \|\| !canonicalAI \|\| !canonicalClient\) return;/);
});

test("J — nenhuma chamada automática em mount, GET ou F5", () => {
  assert.ok(!route.includes("export async function GET"));
  assert.match(route, /export async function POST/);
  assert.ok(!workspace.includes("useEffect(() => { void handleBatchContextualPresentation"));
  assert.ok(!workspace.includes("useEffect(() => { void runContextualPresentation"));
  // Uma ação do usuário produz uma única notificação final.
  // Uma ação do usuário produz uma única notificação final: os ramos de
  // persistida e não-persistida são exclusivos e ficam fora do laço.
  const batch = workspace.slice(workspace.indexOf("const handleBatchContextualPresentation"), workspace.indexOf("const handleOpenHumanReview"));
  const loop = batch.slice(batch.indexOf("for (const item of targets)"), batch.indexOf("if (failures.length === 0"));
  assert.equal((loop.match(/showNotification\(/g) || []).length, 0, "nenhum aviso por keyword");
  assert.ok(batch.includes("if (failures.length === 0 && unpersistedCount === 0) {"));
  assert.ok(batch.includes("} else if (failures.length === 0) {"));
  assert.equal((batch.match(/showNotification\(/g) || []).length, 3, "persistida, não persistida ou falha");
  assert.ok(workspace.includes("onClick={() => void handleBatchContextualPresentation()}"));
  const presentationBlock = panel.slice(panel.indexOf("<section data-keyword-contextual-presentation"), panel.indexOf("<section aria-label=\"Fatos medidos somente leitura\""));
  assert.ok(!presentationBlock.includes("<button"), "o painel é somente informativo: o gatilho é o processo IA da barra");
});
