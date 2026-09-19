import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { newWriterDeliverable, WriterDeliverablePayloadSchema, WriterMediaBriefSchema } from "../lib/redator/multiformat-contracts.ts";

const documentId = "writer:article-1";
const hash = "sha256:source";

test("roteiro e carrossel nascem separados do ContentDocument, com a mesma origem", () => {
  const video = newWriterDeliverable("video_script", { documentId, title: "Tema", sourceDocumentHash: hash });
  const carousel = newWriterDeliverable("carousel", { documentId, title: "Tema", sourceDocumentHash: hash });
  assert.equal(video.kind, "video_script");
  assert.equal(carousel.kind, "carousel");
  assert.equal(video.sourceDocumentHash, carousel.sourceDocumentHash);
  assert.ok("scenes" in video);
  assert.ok("slides" in carousel);
});

test("cena guarda roteiro de assunto, instrução técnica, storyboard e fontes individualmente", () => {
  const base = newWriterDeliverable("video_script", { documentId, title: "Tema", sourceDocumentHash: hash });
  assert.equal(base.kind, "video_script");
  const parsed = WriterDeliverablePayloadSchema.parse({ ...base, scenes: [{
    id: "scene-1", order: 0, durationSeconds: 15, narration: "Explicação factual",
    visualDirection: "Mostrar exemplo", technicalDirection: "Corte próximo",
    storyboard: { objective: "Representar o exemplo", prompt: "Imagem de exemplo", aspectRatio: "16:9", altText: "Exemplo visual", assetId: null },
    sourceRefs: [{ sourceId: "source-1", evidenceRef: "evidence-1" }],
  }] });
  assert.equal(parsed.kind, "video_script");
  assert.equal(parsed.scenes[0].sourceRefs[0].sourceId, "source-1");
  assert.equal(parsed.scenes[0].storyboard?.prompt, "Imagem de exemplo");
});

test("slide permite mídia planejada sem alegar imagem produzida", () => {
  const base = newWriterDeliverable("carousel", { documentId, title: "Tema", sourceDocumentHash: hash });
  assert.equal(base.kind, "carousel");
  const parsed = WriterDeliverablePayloadSchema.parse({ ...base, slides: [{
    id: "slide-1", order: 0, heading: "Abertura", body: "Mensagem",
    visual: { objective: "Introdução", prompt: "Composição de abertura", aspectRatio: "4:5", altText: "Capa do carrossel", assetId: null }, sourceRefs: [],
  }] });
  assert.equal(parsed.kind, "carousel");
  assert.equal(parsed.slides[0].visual?.assetId, null);
});

test("schemas rejeitam marca inventada, tipo trocado e metadado extra", () => {
  const base = newWriterDeliverable("carousel", { documentId, title: "Tema", sourceDocumentHash: hash });
  assert.equal(WriterDeliverablePayloadSchema.safeParse({ ...base, brandId: "other-brand" }).success, false);
  assert.equal(WriterDeliverablePayloadSchema.safeParse({ ...base, kind: "video_script" }).success, false);
  assert.equal(WriterMediaBriefSchema.safeParse({ brandId: "brand", documentId, deliverableId: null,
    role: "cover", objective: "Capa", prompt: "Imagem", altText: "", aspectRatio: "16:9" }).success, false);
});

test("MCP não anuncia poderes de aprovação ou publicação", () => {
  const route = readFileSync(new URL("../app/api/mcp/redator/route.ts", import.meta.url), "utf8");
  for (const forbidden of ["approve_writer_document", "publish_document", "delete_writer_document", "update_article_dna"])
    assert.equal(route.includes(`registerTool(\"${forbidden}\"`), false);
  assert.match(route, /verifyWriterMcpBearer/);
  assert.match(route, /assertEditorialPermission/);
});
