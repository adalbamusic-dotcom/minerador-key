import assert from "node:assert/strict";
import test from "node:test";
import { ContentDocumentSchema } from "../lib/arquiteto/contracts.ts";
import { createMockPlanAndDocument } from "../lib/editorial/providers.ts";
import { buildImprovePrompt, buildSectionWritingPrompt, createSectionPromptContext } from "../lib/redator/prompts.ts";
import { runGuardian } from "../lib/redator/guardian.ts";

test("motor de prompts limita a proposta à seção e preserva referências", async () => {
  const { document } = await createMockPlanAndDocument("brand-1");
  const section = document.blocks.find(block => block.type === "heading");
  assert.ok(section);
  const context = createSectionPromptContext(document, section.id, "Usar linguagem clara.");
  const prompt = buildSectionWritingPrompt(context);
  assert.match(prompt, new RegExp(section.id));
  assert.match(prompt, /contentPlanRef|references/);
  assert.match(buildImprovePrompt(document, "Trecho selecionado", "Mais natural."), /Trecho selecionado/);
});

test("Guardião detecta seção sem corpo e mantém a decisão humana", async () => {
  const { document } = await createMockPlanAndDocument("brand-1");
  const heading = document.blocks.find(block => block.type === "heading");
  assert.ok(heading);
  const withEmptySection = ContentDocumentSchema.parse({ ...document, blocks: [...document.blocks, { id: "empty-section", type: "heading", level: 2, text: "Seção vazia", provenance: heading.provenance }] });
  const report = runGuardian(withEmptySection, "hash-fixture");
  assert.equal(report.origin, "rule_engine");
  assert.equal(report.humanDecisionRequired, true);
  assert.ok(report.findings.some(finding => finding.category === "completeness" && finding.severity === "blocked"));
  assert.equal(report.contentHash, "hash-fixture");
});

test("Guardião bloqueia placeholder e fonte sem URL sem apagar o documento", () => {
  const provenance = { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] };
  const base = {
    schemaVersion: 1 as const, id: "document-fixture", title: "Título", status: "escrevendo" as const,
    contentPlanRef: { entityId: "plan", versionId: "plan:v1", contentHash: "legacy:plan" },
    brandDnaRef: { entityId: "brand", versionId: "brand:v1", contentHash: "legacy:brand" },
    keywordDnaRefs: [{ entityId: "keyword", versionId: "keyword:v1", contentHash: "legacy:keyword" }],
    siloDnaRef: { entityId: "silo", versionId: "silo:v1", contentHash: "legacy:silo" }, articleDnaRef: { entityId: "article", versionId: "article:v1", contentHash: "legacy:article" },
    serpSnapshotRefs: [], evidenceRefs: [], sourceIds: [], linkMap: [], instructions: [], editorContent: null,
    metadata: { slug: "titulo", principalKeyword: "keyword", metaTitle: "Título", metaDescription: "Descrição", socialTitle: "", socialDescription: "", canonical: null, indexationStatus: "noindex" as const, plannedImages: [] },
    blocks: [
      { id: "h1", type: "heading" as const, level: 1, text: "Título", provenance },
      { id: "p1", type: "paragraph" as const, text: "Preencher este trecho", provenance },
      { id: "source", type: "external_source" as const, sourceId: "source-1", claim: "Claim técnico", url: null, provenance },
    ],
  };
  const document = ContentDocumentSchema.parse(base);
  const report = runGuardian(document, "hash-fixture");
  assert.equal(document.blocks.length, 3);
  assert.ok(report.findings.some(finding => finding.category === "completeness" && finding.severity === "blocked"));
  assert.ok(report.findings.some(finding => finding.category === "source" && finding.severity === "blocked"));
});
