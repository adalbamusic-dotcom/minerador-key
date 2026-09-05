import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { requireSkillDefinition } from "../lib/marca/skill-definitions.ts";
import { normalizeAgainstDefinition, summarizeStructure, validateSkillMarkdown } from "../lib/marca/brand-skill-markdown.ts";
import {
  assertSkillBelongsToBrand,
  brandSkillIdentity,
  importBrandSkill,
  renameBrandSkill,
  resolveBrandSkill,
  selectAvailableSkills,
} from "../lib/marca/brand-skill-domain.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { careGlowSkillFile, careGlowSkillMarkdown } from "./care-glow-skill.fixture.ts";

/**
 * Convergência local após o primeiro save real da Care Glow.
 *
 * Cobre o que a taxonomia única precisa garantir e que não estava coberto:
 * estado VALID, preservação do original, nome independente da identidade,
 * Context Pack ignorando rascunho e alinhamento de repository/API/front.
 */

const definition = requireSkillDefinition("brand_voice");
const now = "2026-08-28T12:00:00.000Z";
const careGlowInput = {
  brandId: "brand-a",
  definitionKey: "brand_voice",
  name: "Care Glow",
  filename: careGlowSkillFile.filename,
  markdown: careGlowSkillFile.content,
  byteSize: careGlowSkillFile.byteSize,
  mimeType: careGlowSkillFile.mimeType,
  importedBy: "actor-a",
  now,
};

const markdownFiles = {
  markdown: new URL("../lib/marca/brand-skill-markdown.ts", import.meta.url),
  definitions: new URL("../lib/marca/skill-definitions.ts", import.meta.url),
  contracts: new URL("../lib/marca/brand-skill-contracts.ts", import.meta.url),
  domain: new URL("../lib/marca/brand-skill-domain.ts", import.meta.url),
  workspace: new URL("../lib/marca/brand-skill-workspace.ts", import.meta.url),
  contextPack: new URL("../lib/marca/brand-context-pack.ts", import.meta.url),
  repository: new URL("../lib/server/brand-skills.ts", import.meta.url),
  route: new URL("../app/api/marca/skills/route.ts", import.meta.url),
  panel: new URL("../modules/marca/brand-skills-panel.tsx", import.meta.url),
  editor: new URL("../modules/marca/brand-skill-editor.tsx", import.meta.url),
};

test("VALID: documento que cobre a estrutura esperada não gera avisos", () => {
  const complete = [
    "# Voz da Marca",
    "",
    ...definition.expectedSections.flatMap(section => [`## ${section.label}`, `Conteúdo de ${section.label}.`, ""]),
  ].join("\n");
  const result = validateSkillMarkdown({ filename: "voz.md", content: complete, byteSize: Buffer.byteLength(complete, "utf8"), mimeType: "text/markdown" }, definition);
  assert.equal(result.status, "VALID");
  assert.deepEqual(result.notices, []);
  assert.deepEqual(result.errors, []);
  assert.ok(result.normalized?.sectionDiagnostics.every(item => item.match === "matched"));
});

test("VALID_WITH_NOTICES nunca bloqueia e o resumo separa reconhecidas de ausentes", () => {
  const result = validateSkillMarkdown(careGlowSkillFile, definition);
  assert.equal(result.status, "VALID_WITH_NOTICES");
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  const summary = summarizeStructure(result.normalized!);
  assert.equal(summary.recognized, 3);
  assert.equal(summary.equivalent, 3);
  assert.equal(summary.missing, 2);
  const optionalMissing = result.normalized!.sectionDiagnostics.filter(item => item.match === "not_found");
  assert.ok(optionalMissing.every(item => item.importance === "optional"), "as ausências da Care Glow são opcionais");
});

test("o Markdown original da Care Glow é preservado byte a byte, com seções próprias", async () => {
  const skill = await importBrandSkill(careGlowInput);
  assert.equal(skill.originalMarkdown, careGlowSkillMarkdown);
  assert.equal(skill.sourceFilename, "CareGlow_SKILL.md");
  assert.equal(skill.version, 1);
  assert.equal(skill.status, "draft");
  const normalized = normalizeAgainstDefinition(careGlowSkillMarkdown, definition);
  assert.ok(normalized.extraSections.includes("5. Adaptação por canal"));
  assert.ok(normalized.extraSections.includes("6. Quality gate"));
  assert.match(skill.originalMarkdown, /### Blog/, "subtítulos próprios continuam no documento");
});

test("renomear não toca a identidade técnica, o gabarito nem o hash", async () => {
  const skill = await importBrandSkill(careGlowInput);
  const renamed = renameBrandSkill(skill, "Voz editorial Care Glow");
  assert.equal(renamed.name, "Voz editorial Care Glow");
  assert.equal(renamed.definitionKey, "brand_voice");
  assert.equal(renamed.contentHash, skill.contentHash);
  assert.equal(brandSkillIdentity(renamed), brandSkillIdentity(skill));
  assert.equal(brandSkillIdentity(renamed), "brand-a:brand_voice");
});

test("Context Pack entrega o rascunho atual da Care Glow sem aplicá-lo automaticamente", async () => {
  const draft = await importBrandSkill(careGlowInput);
  assert.equal(draft.status, "draft");
  for (const module of ["minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"] as const) {
    assert.equal(selectAvailableSkills({ skills: [draft], brandId: "brand-a", module }).length, 1);
    const pack = getBrandContextPack({ brandId: "brand-a", module, skills: [draft], now });
    assert.equal(pack.skills.length, 1);
    assert.equal(pack.skills[0]?.lifecycleStatus, "draft");
    assert.equal(pack.skills[0]?.applied, false);
  }
  assert.equal(resolveBrandSkill({ skills: [draft], brandId: "brand-a", definitionKey: "brand_voice" })?.status, "draft");
});

test("Context Pack entrega a versão corrente e nunca marca disponibilidade como aplicada", async () => {
  const active = { ...(await importBrandSkill(careGlowInput)), status: "active" as const };
  const pack = getBrandContextPack({ brandId: "brand-a", module: "redator", skills: [active], now });
  assert.equal(pack.skills.length, 1);
  assert.equal(pack.skills[0].applied, false);
  assert.deepEqual(pack.skills[0].consumerModules, ["minerador", "planejador", "redator"]);
  assert.deepEqual(pack.provenance.skillVersions, [{ definitionKey: "brand_voice", version: 1, contentHash: active.contentHash }]);
  const mineradorPack = getBrandContextPack({ brandId: "brand-a", module: "minerador", skills: [active], now });
  assert.equal(mineradorPack.skills.length, 1);
  assert.equal(mineradorPack.skills[0].definitionKey, "brand_voice");
  assert.equal(mineradorPack.skills[0].applied, false);
});

test("cross-brand continua bloqueado na leitura e na seleção", async () => {
  const foreign = { ...(await importBrandSkill(careGlowInput)), brandId: "brand-b", status: "active" as const };
  assert.throws(() => assertSkillBelongsToBrand(foreign, "brand-a"), /não pertence/);
  assert.deepEqual(selectAvailableSkills({ skills: [foreign], brandId: "brand-a", module: "redator" }), []);
  assert.deepEqual(getBrandContextPack({ brandId: "brand-a", module: "redator", skills: [foreign], now }).skills, []);
});

test("existe uma única taxonomia de validação e de diagnóstico no checkout", async () => {
  const sources = await Promise.all(Object.values(markdownFiles).map(url => readFile(url, "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /requiredSections|recommendedSections/);
    assert.doesNotMatch(source, /"valid_with_notices"|"invalid"|'valid_with_notices'/);
    assert.doesNotMatch(source, /match: "found"|match: "equivalent"|match: "missing"/);
  }
});

test("o limite de tamanho vive só no gabarito, sem constante global duplicada", async () => {
  const sources = await Promise.all(Object.values(markdownFiles).map(url => readFile(url, "utf8")));
  for (const source of sources) assert.doesNotMatch(source, /MARKDOWN_MAX_BYTES/);
  assert.equal(definition.maxFileSizeBytes, 512 * 1024);
  const markdown = await readFile(markdownFiles.markdown, "utf8");
  assert.match(markdown, /definition\.maxFileSizeBytes/);
  const editor = await readFile(markdownFiles.editor, "utf8");
  assert.match(editor, /definition\.maxFileSizeBytes/);
});

test("o hash canônico é único: nenhum consumidor recalcula por conta própria", async () => {
  const domain = await readFile(markdownFiles.domain, "utf8");
  assert.match(domain, /export function markdownContentHash/);
  for (const url of [markdownFiles.route, markdownFiles.panel, markdownFiles.editor]) {
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /createHash|subtle\.digest|contentHash\(/);
  }
});

test("repository e rota compartilham o schema canônico e só confirmam após readback", async () => {
  const repository = await readFile(markdownFiles.repository, "utf8");
  const route = await readFile(markdownFiles.route, "utf8");
  assert.match(repository, /BrandSkillSchema\.parse\(row\.payload\)/);
  assert.match(repository, /stored_skill_contract_invalid/);
  assert.match(repository, /readback_missing/);
  assert.match(repository, /listPersistedBrandSkills\(input\.brandId\)\)\.find\(item => item\.versionId === versionId\)/);
  assert.match(route, /BrandSkillActionRequestSchema\.parse/);
  assert.doesNotMatch(route, /z\.object\(\{ action: z\.literal\("save"\)/, "a rota não redefine o payload");
  assert.match(route, /artifact|listPersistedBrandSkills|savePersistedBrandSkill/);
});

test("front e projeção usam a taxonomia canônica do contrato", async () => {
  const editor = await readFile(markdownFiles.editor, "utf8");
  const panel = await readFile(markdownFiles.panel, "utf8");
  assert.match(editor, /validation\.status !== "INVALID"/);
  assert.match(editor, /matched:|alias_matched:|not_found:/);
  assert.match(editor, /row\.match === "matched"/);
  assert.match(panel, /skillVersionLabel\(skill\)/);
  assert.match(panel, /action: "save", brandId, payload:/);
  assert.doesNotMatch(panel, /localStorage/, "a lista vem do servidor, não de cópia local");
});

test("o gabarito é dono do arquivo aceito e dos consumidores", () => {
  assert.deepEqual(definition.acceptedExtensions, [".md"]);
  assert.ok(definition.acceptedMimeTypes.includes("text/markdown"));
  assert.deepEqual(definition.consumerModules, ["minerador", "planejador", "redator"]);
  assert.ok(definition.expectedSections.some(section => section.importance === "recommended"));
  assert.ok(definition.expectedSections.some(section => section.importance === "optional"));
  assert.ok(definition.expectedSections.every(section => Array.isArray(section.aliases)));
});
