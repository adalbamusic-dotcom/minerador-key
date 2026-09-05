import assert from "node:assert/strict";
import test from "node:test";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { buildBrandAIContext } from "../lib/marca/brand-ai-context.ts";
import { importBrandSkill } from "../lib/marca/brand-skill-domain.ts";
import { buildPlannerAIContext, toPlannerAppliedSkillSources } from "../lib/planejador/brand-ai-context.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

async function activeSkill(brandId = "brand-a") {
  return { ...(await importBrandSkill({ brandId, definitionKey: "brand_voice", name: "Care Glow", filename: careGlowSkillFile.filename, markdown: careGlowSkillFile.content, byteSize: careGlowSkillFile.byteSize, mimeType: careGlowSkillFile.mimeType, importedBy: "actor", now: "2026-08-28T12:00:00.000Z" })), status: "active" as const, versionId: "11111111-1111-4111-8111-111111111111" };
}
function pack(input: Parameters<typeof getBrandContextPack>[0]) { return getBrandContextPack(input); }

test("draft and pending_approval current versions are available to Planner", async () => {
  for (const status of ["draft", "pending_approval"] as const) {
    const version = { ...(await activeSkill()), status };
    const resolved = pack({ brandId: "brand-a", module: "planejador", purpose: "content-plan", skills: [version] });
    assert.equal(resolved.skills.length, 1, `${status} deve ficar disponível`);
    assert.equal(resolved.skills[0]?.lifecycleStatus, status);
    assert.equal(resolved.skills[0]?.applied, false);
  }
});
test("archived current version stays out of the context", async () => {
  const archived = { ...(await activeSkill()), status: "archived" as const };
  assert.equal(pack({ brandId: "brand-a", module: "planejador", purpose: "content-plan", skills: [archived] }).skills.length, 0);
});
test("active brand_voice is available to Planner and only builder marks applied", async () => {
  const context = buildPlannerAIContext(pack({ brandId: "brand-a", module: "planejador", purpose: "content-plan", skills: [await activeSkill()] }));
  assert.equal(context.appliedSkillRefs.length, 1);
  assert.match(context.brandContext, /BRAND SKILL/);
  assert.match(context.brandContext, /definitionKey: brand_voice/);
});
test("brand_voice is available to Radar: consumerModules is recommendation, not authorization", async () => {
  assert.equal(pack({ brandId: "brand-a", module: "radar", purpose: "serp-review", skills: [await activeSkill()] }).skills.length, 1);
});
test("cross-brand Skills are excluded", async () => {
  assert.equal(pack({ brandId: "brand-a", module: "planejador", purpose: "content-plan", skills: [await activeSkill("brand-b")] }).skills.length, 0);
});
test("purpose is mandatory and Planner purpose is constrained", async () => {
  assert.throws(() => buildBrandAIContext(pack({ brandId: "brand-a", module: "planejador", skills: [] })));
  assert.throws(() => buildPlannerAIContext(pack({ brandId: "brand-a", module: "planejador", purpose: "other", skills: [] })));
});
test("applied ContentPlan refs keep provenance without full Markdown", async () => {
  const context = buildPlannerAIContext(pack({ brandId: "brand-a", module: "planejador", purpose: "content-plan", skills: [await activeSkill()] }));
  const refs = toPlannerAppliedSkillSources({ brandId: "brand-a", refs: context.appliedSkillRefs });
  assert.equal(refs[0]?.definitionKey, "brand_voice");
  assert.equal(refs[0]?.versionNumber, 1);
  assert.equal("originalMarkdown" in (refs[0] || {}), false);
});
test("renaming does not affect resolution and successor uses active version", async () => {
  const renamed = { ...(await activeSkill()), name: "Novo nome" };
  const successor = { ...renamed, version: 2, contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", versionId: "22222222-2222-4222-8222-222222222222" };
  const resolved = pack({ brandId: "brand-a", module: "planejador", purpose: "content-plan", skills: [successor] });
  assert.equal(resolved.skills[0]?.definitionKey, "brand_voice");
  assert.equal(resolved.skills[0]?.version, 2);
});

test("brand_voice remains available to Redator by definition", async () => {
  assert.equal(pack({ brandId: "brand-a", module: "redator", purpose: "article-writing", skills: [await activeSkill()] }).skills.length, 1);
});
