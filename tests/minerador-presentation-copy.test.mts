import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importBrandSkill } from "../lib/marca/brand-skill-domain.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { buildBrandAIContextForPresentation } from "../lib/marca/brand-ai-context.ts";
import { buildContextualPresentationPrompt, buildKeywordDnaPresentationContext, CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT } from "../lib/minerador/presentation-brief.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

/**
 * Semântica de lifecycle na apresentação: disponível para uso não é o mesmo
 * que aprovada. Nenhum teste chama provider.
 */

const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const now = "2026-08-28T12:00:00.000Z";
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const presentationBlock = panel.slice(
  panel.indexOf("<section data-keyword-contextual-presentation"),
  panel.indexOf('<section aria-label="Fatos medidos somente leitura"'),
);

async function voice(status: "draft" | "pending_approval" | "active") {
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
    status,
    versionId: "75d25e69-0e15-424a-8c79-37952adb6605",
  };
}

async function promptFor(status: "draft" | "pending_approval" | "active") {
  const pack = getBrandContextPack({ brandId, module: "minerador", purpose: "keyword-contextual-presentation", skills: [await voice(status)], now });
  const brandContext = buildBrandAIContextForPresentation(pack);
  const prompt = buildContextualPresentationPrompt({
    keywordDna: buildKeywordDnaPresentationContext({
      id: "77777777-7777-4777-8777-777777777777",
      brand_id: brandId,
      keyword: "skin care noturno",
      analise_semantica: { dna_origem: "logico_deterministico" },
    }),
    brandContext,
  });
  return { prompt, brandContext };
}

test("A · Skill draft aplicada não é apresentada como aprovada", async () => {
  const { prompt, brandContext } = await promptFor("draft");
  assert.equal(brandContext.appliedSkillRefs[0]?.lifecycleStatus, "draft");
  assert.doesNotMatch(prompt, /Voz da Marca aprovada/);
  assert.doesNotMatch(prompt, /CONTEXTO DE MARCA APROVADO/);
  assert.match(prompt, /## CONTEXTO DISPONÍVEL DA MARCA/);
});

test("B · Skill pending_approval aplicada não é apresentada como aprovada", async () => {
  const { prompt, brandContext } = await promptFor("pending_approval");
  assert.equal(brandContext.appliedSkillRefs[0]?.lifecycleStatus, "pending_approval");
  assert.doesNotMatch(prompt, /Voz da Marca aprovada/);
});

test("C · com Skill active o lifecycle real fica na proveniência e a formulação segue neutra", async () => {
  const { prompt, brandContext } = await promptFor("active");
  assert.equal(brandContext.appliedSkillRefs[0]?.lifecycleStatus, "active");
  assert.match(brandContext.brandContext, /lifecycleStatus: active/);
  assert.doesNotMatch(prompt, /Voz da Marca aprovada/);
  assert.match(CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT, /Voz da Marca disponível/);
  assert.match(CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT, /disponível para uso não significa aprovada/);
});

test("D · o rodapé não implica que dados operacionais da keyword alimentaram o texto", () => {
  assert.ok(!presentationBlock.includes("dados atuais da keyword"));
  assert.ok(!presentationBlock.includes("contexto aprovado da Marca"));
});

test("E · o rodapé afirma tema da keyword + contexto disponível da Marca", () => {
  assert.match(presentationBlock, /Baseada no tema da keyword e no contexto disponível da Marca\. O KeywordDNA permanece inalterado\./);
  assert.match(presentationBlock, /Voz da Marca aplicada/);
  assert.ok(!presentationBlock.includes("Voz da Marca aprovada"));
});
