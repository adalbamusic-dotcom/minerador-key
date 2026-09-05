import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importBrandSkill } from "../lib/marca/brand-skill-domain.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { buildBrandAIContextForPresentation } from "../lib/marca/brand-ai-context.ts";
import { buildContextualPresentationPrompt, buildKeywordDnaPresentationContext, parseContextualPresentation } from "../lib/minerador/presentation-brief.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

/**
 * Contrato final da Apresentação Contextual: o provider responde em texto puro
 * e a aplicação monta { text }. Nenhum teste chama provider.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const now = "2026-08-28T12:00:00.000Z";
const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts", import.meta.url), "utf8");
const structuredAi = readFileSync(new URL("../lib/server/structured-ai.ts", import.meta.url), "utf8");

async function voiceSkill(inputBrandId = brandId, status: "draft" | "pending_approval" | "active" = "draft") {
  return {
    ...(await importBrandSkill({
      brandId: inputBrandId,
      definitionKey: "brand_voice",
      name: "Care Glow",
      filename: careGlowSkillFile.filename,
      markdown: careGlowSkillFile.content,
      byteSize: careGlowSkillFile.byteSize,
      mimeType: careGlowSkillFile.mimeType,
      importedBy: "actor-a",
      now,
    })),
    status,
    versionId: "75d25e69-0e15-424a-8c79-37952adb6605",
  };
}

const keywordRow = {
  id: "66666666-6666-4666-8666-666666666666",
  brand_id: brandId,
  keyword: "skin care para peles oleosas",
  location: "Brasil",
  intent: "Informativa",
  volume_search: 720,
  results_allintitle: 388,
  kgr_score: 0.44,
  analise_semantica: { dna_origem: "logico_deterministico", nicho: "Estética", publico: "pessoas com pele oleosa" } as Record<string, unknown>,
};

function presentationContext(skills: Awaited<ReturnType<typeof voiceSkill>>[], packBrandId = brandId) {
  const pack = getBrandContextPack({ brandId: packBrandId, module: "minerador", purpose: "keyword-contextual-presentation", skills, now });
  return { pack, brandContext: buildBrandAIContextForPresentation(pack) };
}

test("A · a Voz corrente da própria Brand entra no contexto do Minerador mesmo em draft", async () => {
  const { pack, brandContext } = presentationContext([await voiceSkill()]);
  assert.equal(pack.skills.length, 1);
  assert.equal(pack.skills[0]?.definitionKey, "brand_voice");
  assert.equal(brandContext.appliedSkillRefs[0]?.definitionKey, "brand_voice");
  assert.equal(brandContext.appliedSkillRefs[0]?.versionId, "75d25e69-0e15-424a-8c79-37952adb6605");
});

test("B · Brand B nunca recebe a Skill da Brand A", async () => {
  const foreign = await voiceSkill("11111111-1111-4111-8111-111111111111", "active");
  const { pack, brandContext } = presentationContext([foreign]);
  assert.deepEqual(pack.skills, []);
  assert.deepEqual(brandContext.appliedSkillRefs, []);
  assert.ok(!brandContext.brandContext.includes("Care Glow"));
});

test("C · BrandDNA ausente não impede a Voz da Marca", async () => {
  const { pack, brandContext } = presentationContext([await voiceSkill()]);
  assert.equal(pack.brandDna, null);
  assert.ok(pack.missing.some(item => item.includes("BrandDNA")));
  assert.equal(brandContext.appliedSkillRefs.length, 1);
  assert.match(brandContext.brandContext, /use a Voz da Marca abaixo como fonte de voz/);
});

test("D+E · o prompt carrega o Markdown canônico e nenhum dado operacional de SEO", async () => {
  const { brandContext } = presentationContext([await voiceSkill()]);
  const prompt = buildContextualPresentationPrompt({
    keywordDna: buildKeywordDnaPresentationContext(keywordRow),
    brandContext,
  });
  assert.match(prompt, /skin care para peles oleosas/);
  assert.match(prompt, /Perfil de Voz aprovado/);
  assert.match(prompt, /contentHash: /);
  const facts = prompt.slice(prompt.indexOf("## TEMA E CONTEXTO EDITORIAL"), prompt.indexOf("## CONTEXTO DISPONÍVEL DA MARCA"));
  for (const seo of [/Volume/, /Resultados/, /KGR/, /KD/, /Intenção/, /Funil/, /SERP/, /720/, /388/, /0[.,]44/]) {
    assert.doesNotMatch(facts, seo);
  }
});

test("F · o provider responde em texto puro e a aplicação monta { text }", () => {
  // Transporte: o envelope JSON continua padrão e o modo texto é opt-in por operação.
  // (deepseek-provider usa aliases "@/..." e não é importável no runner; auditado na fonte.)
  const providerSource = readFileSync(new URL("../lib/server/deepseek-provider.ts", import.meta.url), "utf8");
  assert.match(providerSource, /responseFormat?: "json_object" | "text";/);
  assert.ok(providerSource.includes('if ((input.responseFormat ?? "json_object") === "json_object") body.response_format = { type: "json_object" };'));
  assert.match(route, /generatePlainTextAI\(\{/);
  assert.ok(!route.includes("generateStructuredAI"));
  assert.match(route, /parseContextualPresentation\(\{ text: generated \}\)/);
  assert.match(structuredAi, /export async function generatePlainTextAI/);
  assert.match(structuredAi, /responseFormat: "text"/);

  const { presentation } = parseContextualPresentation({ text: "Orientação editorial em texto puro." });
  assert.deepEqual(Object.keys(presentation), ["text"]);
});

test("K · uma execução registra um único usage event", () => {
  assert.equal((route.match(/recordIntegrationUsageForResource\(/g) || []).length, 1);
  assert.match(route, /idempotencyKey: `minerador:contextual-presentation:\$\{operationRequestId\}`/);
  assert.match(route, /if \(!providerRequestStarted \|\| !canonicalAI \|\| !canonicalClient\) return;/);
});

test("M · a proveniência reflete a versão realmente usada", async () => {
  const skill = await voiceSkill();
  const { brandContext } = presentationContext([skill]);
  const ref = brandContext.appliedSkillRefs[0];
  assert.equal(ref?.versionNumber, skill.version);
  assert.equal(ref?.contentHash, skill.contentHash);
  assert.match(route, /appliedSkillRefs: brandContext\.appliedSkillRefs/);
  assert.match(route, /brandVoiceApplied/);
});
