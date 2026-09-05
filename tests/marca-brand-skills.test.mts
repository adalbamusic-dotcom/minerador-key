import assert from "node:assert/strict";
import test from "node:test";
import { BrandSkillActionRequestSchema } from "../lib/marca/brand-skill-contracts.ts";
import { brandSkillIdentity, importBrandSkill, markdownContentHash, replaceBrandSkillMarkdown, toBrandSkillReference } from "../lib/marca/brand-skill-domain.ts";
import { normalizeAgainstDefinition, parseMarkdownSections, validateSkillMarkdown } from "../lib/marca/brand-skill-markdown.ts";
import { requireSkillDefinition } from "../lib/marca/skill-definitions.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { careGlowSkillFile, careGlowSkillMarkdown } from "./care-glow-skill.fixture.ts";

const definition = requireSkillDefinition("brand_voice");
const input = { brandId: "brand-a", definitionKey: "brand_voice", name: "Voz Care Glow", filename: careGlowSkillFile.filename, markdown: careGlowSkillFile.content, byteSize: careGlowSkillFile.byteSize, mimeType: careGlowSkillFile.mimeType, importedBy: "actor-a", now: "2026-08-28T12:00:00.000Z" };

test("definition is code-owned and has explicit file and section contract", () => { assert.deepEqual(definition.acceptedExtensions, [".md"]); assert.equal(definition.maxFileSizeBytes, 512 * 1024); assert.deepEqual(definition.expectedSections.map(section => section.key), ["tone", "vocabulary_preferred", "avoid", "reader_address", "examples"]); });
test("Care Glow aliases diagnose without rejecting the real structure", () => { const result = validateSkillMarkdown(careGlowSkillFile, definition); assert.equal(result.status, "VALID_WITH_NOTICES"); assert.equal(result.valid, true); assert.equal(result.normalized?.sectionDiagnostics.find(item => item.key === "tone")?.match, "alias_matched"); assert.equal(result.normalized?.sectionDiagnostics.find(item => item.key === "vocabulary_preferred")?.match, "alias_matched"); assert.equal(result.normalized?.sectionDiagnostics.find(item => item.key === "avoid")?.match, "alias_matched"); });
test("technical extension blocks", () => { assert.equal(validateSkillMarkdown({ ...careGlowSkillFile, filename: "voice.pdf" }, definition).status, "INVALID"); });
test("empty content blocks", () => { assert.equal(validateSkillMarkdown({ ...careGlowSkillFile, content: "   ", byteSize: 3 }, definition).status, "INVALID"); });
test("oversized content blocks", () => { assert.equal(validateSkillMarkdown({ ...careGlowSkillFile, byteSize: definition.maxFileSizeBytes + 1 }, definition).status, "INVALID"); });
test("demonstrably incompatible MIME blocks", () => { assert.equal(validateSkillMarkdown({ ...careGlowSkillFile, mimeType: "application/pdf" }, definition).status, "INVALID"); });
test("unknown/octet MIME is not a false technical rejection", () => { assert.notEqual(validateSkillMarkdown({ ...careGlowSkillFile, mimeType: "application/octet-stream" }, definition).status, "INVALID"); });
test("parser preserves original sections and unknown headings", () => { const normalized = normalizeAgainstDefinition(careGlowSkillMarkdown, definition); assert.ok(normalized.extraSections.includes("5. Adaptação por canal")); assert.equal(normalized.sections.find(section => section.heading.includes("Adaptação por canal"))?.body.includes("### Blog"), true); });
test("parse keeps Markdown title and bodies without rewriting source", () => { const parsed = parseMarkdownSections("# T\n\n## Tom\nTexto"); assert.equal(parsed.title, "T"); assert.equal(parsed.sections[0]?.body, "Texto"); });
test("same Markdown has the same canonical hash", async () => { assert.equal(await markdownContentHash(careGlowSkillMarkdown), await markdownContentHash(careGlowSkillMarkdown)); });
test("changed Markdown changes canonical hash", async () => { assert.notEqual(await markdownContentHash(careGlowSkillMarkdown), await markdownContentHash(`${careGlowSkillMarkdown}\nNovo`)); });
test("first import has logical identity and diagnostics", async () => { const skill = await importBrandSkill(input); assert.equal(brandSkillIdentity(skill), "brand-a:brand_voice"); assert.deepEqual(skill.structureDiagnostics, skill.normalizedContent.sectionDiagnostics); assert.equal(skill.version, 1); });
test("same content does not create successor", async () => { const previous = await importBrandSkill(input); const result = await replaceBrandSkillMarkdown({ ...input, previous }); assert.equal(result.changed, false); assert.equal(result.skill.version, 1); });
test("different content creates successor", async () => { const previous = await importBrandSkill(input); const result = await replaceBrandSkillMarkdown({ ...input, markdown: `${careGlowSkillMarkdown}\n\n## Exemplos\nTexto`, byteSize: careGlowSkillFile.byteSize + 20, previous }); assert.equal(result.changed, true); assert.equal(result.skill.version, 2); assert.equal(result.skill.provenance.previousContentHash, previous.contentHash); });
test("active reference carries content and remains not applied", async () => { const skill = { ...(await importBrandSkill(input)), status: "active" as const }; const reference = toBrandSkillReference(skill); assert.equal(reference.originalMarkdown, careGlowSkillMarkdown); assert.equal(reference.applied, false); assert.deepEqual(reference.consumerModules, ["minerador", "planejador", "redator"]); });
test("shared route schema accepts a save payload", () => { const parsed = BrandSkillActionRequestSchema.parse({ action: "save", brandId: "11111111-1111-4111-8111-111111111111", payload: { definitionKey: "brand_voice", name: "Voz", filename: "voice.md", markdown: "# Voz", byteSize: 5 } }); assert.equal(parsed.action, "save"); });
test("shared route schema rejects unstructured direct save fields", () => { assert.throws(() => BrandSkillActionRequestSchema.parse({ action: "save", brandId: "11111111-1111-4111-8111-111111111111", definitionKey: "brand_voice" })); });

test("context pack exposes only compatible active content without applying it", async () => {
  const active = { ...(await importBrandSkill(input)), status: "active" as const };
  const pack = getBrandContextPack({ brandId: "brand-a", module: "redator", skills: [active], now: "2026-08-28T12:00:00.000Z" });
  assert.equal(pack.skills.length, 1);
  assert.equal(pack.skills[0]?.normalizedContent.definitionKey, "brand_voice");
  assert.equal(pack.skills[0]?.applied, false);
});
