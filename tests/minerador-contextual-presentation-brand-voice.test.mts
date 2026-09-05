import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importBrandSkill } from "../lib/marca/brand-skill-domain.ts";
import type { BrandSkillRecord } from "../lib/marca/brand-skill-contracts.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { buildBrandAIContextForPresentation } from "../lib/marca/brand-ai-context.ts";
import {
  buildContextualPresentationPrompt,
  buildKeywordDnaPresentationContext,
  parseContextualPresentation,
} from "../lib/minerador/presentation-brief.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

/**
 * Primeiro consumo real da Voz da Marca pela IA do Minerador, com fixtures.
 * Nenhum teste chama provider: REAL_AI_CALLS = 0.
 */

const now = "2026-08-28T12:00:00.000Z";
const purpose = "keyword-contextual-presentation";

const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const processState = readFileSync(new URL("../lib/minerador/process-state.ts", import.meta.url), "utf8");
const humanReview = readFileSync(new URL("../lib/minerador/human-review.ts", import.meta.url), "utf8");

function skillInput(brandId: string) {
  return {
    brandId,
    definitionKey: "brand_voice",
    name: "Care Glow",
    filename: careGlowSkillFile.filename,
    markdown: careGlowSkillFile.content,
    byteSize: careGlowSkillFile.byteSize,
    mimeType: careGlowSkillFile.mimeType,
    importedBy: "actor-a",
    now,
  };
}

async function activeVoiceSkill(brandId: string, versionId = "11111111-1111-4111-8111-111111111111") {
  return { ...(await importBrandSkill(skillInput(brandId))), status: "active" as const, versionId };
}

/** Mesma composição da rota: pack da Brand → contexto de IA da Marca. */
function presentationContext(input: { brandId: string; skills: BrandSkillRecord[] }) {
  const pack = getBrandContextPack({ brandId: input.brandId, module: "minerador", purpose, skills: input.skills, now });
  return { pack, brandContext: buildBrandAIContextForPresentation(pack) };
}

const keywordRow = {
  id: "22222222-2222-4222-8222-222222222222",
  brand_id: "brand-a",
  keyword: "principia skincare",
  location: "Brasil",
  intent: "Informativa",
  volume_search: 1900,
  results_allintitle: 320,
  kgr_score: null,
  analise_semantica: { dna_origem: "logico_deterministico", nicho: "Estética", funnel: "TOFU" } as Record<string, unknown>,
};

test("1 — a Voz da Marca ativa da própria Brand entra no contexto de IA", async () => {
  const skill = await activeVoiceSkill("brand-a");
  const { pack, brandContext } = presentationContext({ brandId: "brand-a", skills: [skill] });
  assert.equal(pack.skills.length, 1);
  assert.equal(pack.skills[0].definitionKey, "brand_voice");
  assert.equal(pack.skills[0].applied, false);
  assert.ok(brandContext.appliedSkillRefs.some(ref => ref.definitionKey === "brand_voice"));
});

test("2 — Brand B nunca recebe a Skill da Brand A", async () => {
  const foreign = await activeVoiceSkill("brand-a");
  const { pack, brandContext } = presentationContext({ brandId: "brand-b", skills: [foreign] });
  assert.deepEqual(pack.skills, []);
  assert.deepEqual(brandContext.appliedSkillRefs, []);
  assert.ok(!brandContext.brandContext.includes("Care Glow"));
});

test("3 — rascunho corrente entra no contexto e arquivada não entra", async () => {
  const draft = await importBrandSkill(skillInput("brand-a"));
  const archived = { ...draft, status: "archived" as const };
  const draftContext = presentationContext({ brandId: "brand-a", skills: [draft] });
  assert.equal(draftContext.pack.skills.length, 1);
  assert.equal(draftContext.pack.skills[0]?.lifecycleStatus, "draft");
  assert.deepEqual(presentationContext({ brandId: "brand-a", skills: [archived] }).pack.skills, []);
});

test("4 — appliedSkillRefs carrega o versionId real da versão persistida", async () => {
  const skill = await activeVoiceSkill("brand-a", "33333333-3333-4333-8333-333333333333");
  const { brandContext } = presentationContext({ brandId: "brand-a", skills: [skill] });
  const ref = brandContext.appliedSkillRefs[0];
  assert.equal(ref.versionId, "33333333-3333-4333-8333-333333333333");
  assert.equal(ref.versionNumber, skill.version);
  assert.equal(ref.contentHash, skill.contentHash);
});

test("5 — sem Voz da Marca ativa não existe fallback: a lacuna é declarada", () => {
  const { pack, brandContext } = presentationContext({ brandId: "brand-a", skills: [] });
  assert.deepEqual(pack.skills, []);
  assert.deepEqual(brandContext.appliedSkillRefs, []);
  assert.ok(pack.missing.some(item => item.includes("minerador")));
  assert.ok(pack.missing.some(item => item.includes("BrandDNA")));
  assert.match(brandContext.brandContext, /BRAND DNA indisponível: não invente identidade, voz ou claims\./);
  // A rota também não pode inventar contexto a partir da coluna legada.
  assert.ok(!route.includes("dna_diretrizes"));
  assert.match(route, /getApprovedBrandDna\(brandId\)/);
});

test("6 — o prompt carrega o conteúdo canônico da Voz da Marca e sua proveniência", async () => {
  const skill = await activeVoiceSkill("brand-a");
  const { brandContext } = presentationContext({ brandId: "brand-a", skills: [skill] });
  const prompt = buildContextualPresentationPrompt({
    keywordDna: buildKeywordDnaPresentationContext(keywordRow),
    brandContext,
  });
  assert.match(prompt, /Perfil de Voz aprovado/);
  assert.match(prompt, /resultado garantido/);
  assert.match(prompt, /contentHash: /);
  assert.match(prompt, /versionId: /);
  assert.match(prompt, /principia skincare/);
});

test("7 — o prompt não delega intenção, funil, nicho nem SERP à IA", async () => {
  const skill = await activeVoiceSkill("brand-a");
  const { brandContext } = presentationContext({ brandId: "brand-a", skills: [skill] });
  const prompt = buildContextualPresentationPrompt({
    keywordDna: buildKeywordDnaPresentationContext(keywordRow),
    brandContext,
  });
  const facts = prompt.slice(prompt.indexOf("## TEMA E CONTEXTO EDITORIAL"), prompt.indexOf("## CONTEXTO DISPONÍVEL DA MARCA"));
  for (const seo of [/Intenção/, /Funil/, /SERP/, /Volume/, /KGR/]) assert.doesNotMatch(facts, seo);
  assert.match(prompt, /somente leitura/);
  assert.match(prompt, /Não fale de intenção de busca, funil, nicho, SERP, volume, concorrência, KGR ou status editorial/);
  for (const forbidden of ["Classifique a intenção", "Determine o funil", "Avalie a SERP", "Calcule o KGR"]) {
    assert.ok(!prompt.includes(forbidden), `O prompt não pode pedir: ${forbidden}`);
  }
});

test("8 — a saída válida é uma apresentação textual compacta", () => {
  const { presentation } = parseContextualPresentation({
    text: "A Care Glow deve abrir explicando o que a linha entrega antes de comparar resultados.",
  });
  assert.match(presentation.text, /Care Glow/);
  assert.throws(() => parseContextualPresentation({ text: "" }));
  assert.throws(() => parseContextualPresentation({ texto: "campo errado" }));
});

test("9 — autoridade proibida devolvida pelo modelo é descartada e auditada", () => {
  const { presentation, discardedAuthorityFields } = parseContextualPresentation({
    text: "Apresentação válida.",
    intent: "Comercial",
    funnel: "BOFU",
    serp: "forte",
    kgr: 0.4,
  });
  assert.deepEqual(Object.keys(presentation), ["text"]);
  for (const field of ["intent", "funnel", "serp", "kgr"]) assert.ok(discardedAuthorityFields.includes(field));
});

test("10 — a IA continua opcional: a revisão humana não depende dela", () => {
  assert.ok(!humanReview.includes("Execute a revisão semântica com IA antes de concluir"));
  assert.match(humanReview, /A revisão IA é contextual|contextual enrichment, not a precondition/);
  // O rótulo vem do helper canônico, que distingue opcional de falhou.
  assert.ok(panel.includes("contextualPresentationStatePill(presentationState)"));
  const uiState = readFileSync(new URL("../lib/minerador/contextual-presentation-ui-state.ts", import.meta.url), "utf8");
  assert.ok(uiState.includes('{ label: "IA · Opcional", tone: "neutral" }'));
});

test("11 — gerar apresentação não altera nenhum processo do Processador", () => {
  assert.ok(!route.includes(".update("));
  assert.ok(!route.includes('from("minerador_keywords").update'), "o KeywordDNA continua intocado");
  assert.ok(route.includes("persisted: Boolean(persistedPresentation)"));
  assert.ok(route.includes("artifact próprio"), "a apresentação é gravada como artifact separado");
  // A projeção de processos não conhece a apresentação: nada de cross-process stale.
  assert.ok(!processState.includes("contextualPresentation"));
  assert.ok(!processState.includes("presentationBrief"));
});

test("12 — nenhuma chamada automática: só POST explícito do usuário", () => {
  assert.ok(!route.includes("export async function GET"));
  assert.match(route, /export async function POST/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /export const revalidate = 0/);
  const handler = workspace.slice(workspace.indexOf("const runContextualPresentation"), workspace.indexOf("const handleOpenHumanReview"));
  assert.match(handler, /ia\/brief-apresentacao/);
  assert.match(handler, /method: "POST"/);
  assert.ok(!workspace.includes("useEffect(() => { void handleBatchContextualPresentation"));
  assert.ok(!workspace.includes("onGeneratePresentationBrief"), "o painel não recebe gatilho próprio da IA");
});

test("13 — a rota exige sessão, permissão do tenant e keyword da própria Brand", () => {
  assert.match(route, /requireCanonicalSessionProfile\(\)/);
  assert.match(route, /requireTenantPermission\(\{ brandId, actorUserId: profile\.userId, module: "minerador", action: "edit", profile \}\)/);
  assert.match(route, /\.eq\("brand_id", brandId\)/);
  assert.match(route, /keyword\.brand_id !== brandId/);
  assert.match(route, /listPersistedBrandSkills\(brandId\)/);
  assert.match(route, /definitionKey === "brand_voice"/);
  // Segredos e provider permanecem no servidor.
  assert.ok(!route.includes("NEXT_PUBLIC_"));
  assert.match(route, /resolveDeepSeekCanonicalConfig/);
  assert.match(route, /recordIntegrationUsageForResource/);
});

test("14 — falha do provider preserva a working copy anterior no front", () => {
  const handler = workspace.slice(workspace.indexOf("const runContextualPresentation"), workspace.indexOf("const handleOpenHumanReview"));
  const failureBranch = handler.slice(handler.indexOf("if (!response.ok"), handler.indexOf("setPresentationBriefs"));
  assert.match(failureBranch, /return { ok: false/);
  assert.ok(!failureBranch.includes("setPresentationBriefs"));
  assert.match(route, /resultStatus: "failed"|recordPresentationUsage\("failed"/);
});

test("15 — persistência só é declarada depois do write confirmado", () => {
  assert.ok(route.includes("persisted: Boolean(persistedPresentation)"));
  assert.ok(route.includes("persistenceFailure"));
  assert.match(route, /contextMissing: contextPack\.missing/);
  assert.ok(panel.includes("não foi possível persistir"));
  assert.ok(workspace.includes("persisted: payload.persisted === true"));
});
