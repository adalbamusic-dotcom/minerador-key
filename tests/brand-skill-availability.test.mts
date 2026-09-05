import assert from "node:assert/strict";
import test from "node:test";
import { buildBrandAIContextForPresentation } from "../lib/marca/brand-ai-context.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { importBrandSkill, replaceBrandSkillMarkdown, selectAvailableSkills } from "../lib/marca/brand-skill-domain.ts";
import type { SkillDefinitionModule } from "../lib/marca/skill-definitions.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const now = "2026-08-28T12:00:00.000Z";
const modules: SkillDefinitionModule[] = ["minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"];

async function draftVoice(inputBrandId = brandId) {
  return importBrandSkill({
    brandId: inputBrandId,
    definitionKey: "brand_voice",
    name: "Care Glow",
    filename: careGlowSkillFile.filename,
    markdown: careGlowSkillFile.content,
    byteSize: careGlowSkillFile.byteSize,
    mimeType: careGlowSkillFile.mimeType,
    importedBy: "actor-a",
    now,
  });
}

function pack(module: SkillDefinitionModule, skills: Awaited<ReturnType<typeof draftVoice>>[]) {
  return getBrandContextPack({ brandId, module, purpose: "keyword-contextual-presentation", skills, now });
}

test("draft, pending_approval e active correntes estão disponíveis em todas as áreas", async () => {
  const draft = await draftVoice();
  for (const status of ["draft", "pending_approval", "active"] as const) {
    const skill = { ...draft, status };
    for (const module of modules) {
      const contextPack = pack(module, [skill]);
      assert.equal(contextPack.skills.length, 1, `${status} deve estar disponível para ${module}`);
      assert.equal(contextPack.skills[0]?.lifecycleStatus, status);
      assert.equal(contextPack.skills[0]?.applied, false);
    }
  }
});

test("archived e versão corrente superseded projetada como archived não ficam disponíveis", async () => {
  const v1 = { ...(await draftVoice()), status: "active" as const };
  const changed = await replaceBrandSkillMarkdown({
    brandId,
    definitionKey: "brand_voice",
    name: "Care Glow v2",
    filename: careGlowSkillFile.filename,
    markdown: `${careGlowSkillFile.content}\n\n## Atualização\nVersão atual.`,
    byteSize: careGlowSkillFile.byteSize + 40,
    mimeType: careGlowSkillFile.mimeType,
    importedBy: "actor-a",
    now,
    previous: v1,
  });
  const currentArchived = { ...changed.skill, status: "archived" as const };
  assert.deepEqual(selectAvailableSkills({ skills: [v1, currentArchived], brandId, module: "minerador" }), []);
  assert.deepEqual(pack("minerador", [currentArchived]).skills, []);
});

test("somente a versão corrente aplicável de uma definitionKey entra no contexto", async () => {
  const v1 = { ...(await draftVoice()), status: "active" as const, versionId: "11111111-1111-4111-8111-111111111111" };
  const changed = await replaceBrandSkillMarkdown({
    brandId,
    definitionKey: "brand_voice",
    name: "Care Glow v2",
    filename: careGlowSkillFile.filename,
    markdown: `${careGlowSkillFile.content}\n\n## Atualização\nVersão atual.`,
    byteSize: careGlowSkillFile.byteSize + 40,
    mimeType: careGlowSkillFile.mimeType,
    importedBy: "actor-a",
    now,
    previous: v1,
  });
  const v2 = { ...changed.skill, status: "draft" as const, versionId: "22222222-2222-4222-8222-222222222222" };
  const contextPack = pack("minerador", [v1, v2]);
  assert.equal(contextPack.skills.length, 1);
  assert.equal(contextPack.skills[0]?.version, 2);
  assert.equal(contextPack.skills[0]?.lifecycleStatus, "draft");
});

test("Brand A nunca recebe a Skill persistida da Brand B", async () => {
  const foreign = await draftVoice("11111111-1111-4111-8111-111111111111");
  assert.deepEqual(pack("minerador", [foreign]).skills, []);
});

test("available não implica applied; a apresentação contextual aplica somente ao injetar no prompt", async () => {
  const draft = { ...(await draftVoice()), versionId: "33333333-3333-4333-8333-333333333333" };
  const contextPack = pack("minerador", [draft]);
  assert.equal(contextPack.skills[0]?.applied, false);
  const presentation = buildBrandAIContextForPresentation(contextPack);
  assert.deepEqual(presentation.appliedSkillRefs, [{
    definitionKey: "brand_voice",
    versionId: "33333333-3333-4333-8333-333333333333",
    versionNumber: 1,
    contentHash: draft.contentHash,
    lifecycleStatus: "draft",
  }]);
  assert.match(presentation.brandContext, /Perfil de Voz aprovado/);
  assert.match(presentation.brandContext, /lifecycleStatus: draft/);
});

test("BrandDNA ausente não bloqueia a brand_voice corrente", async () => {
  const draft = await draftVoice();
  const contextPack = pack("minerador", [draft]);
  assert.equal(contextPack.brandDna, null);
  assert.equal(contextPack.skills.length, 1);
  assert.ok(contextPack.missing.some(item => item.includes("BrandDNA")));
  const presentation = buildBrandAIContextForPresentation(contextPack);
  assert.equal(presentation.appliedSkillRefs[0]?.definitionKey, "brand_voice");
});

test("a operação factual de KGR não recebe Brand Skills automaticamente", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../lib/minerador/presentation-brief.ts", import.meta.url), "utf8"));
  assert.ok(!source.includes("getBrandContextPack"));
  assert.ok(!source.includes("selectAvailableSkills"));
});