import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linkMeshPreviewCanConfirm, linkMeshPreviewFingerprint, siloLinkBasisBlocker } from "../lib/arquiteto/silo-link-mesh.ts";

test("Links só usa o par e artigos aprovados nas versões exatas da mesma marca", () => {
  const input = { brandId: "marca", silo: { brandId: "marca", siloId: "silo", entityId: "silo", versionId: "sv1", contentHash: "sh1", status: "approved" }, page: { brandId: "marca", siloId: "silo", status: "approved", siloDnaRef: { entityId: "silo", versionId: "sv1", contentHash: "sh1" } }, articles: [{ expectedVersionId: "av1", expectedContentHash: "ah1", brandId: "marca", versionId: "av1", contentHash: "ah1", status: "approved" }] };
  assert.equal(siloLinkBasisBlocker(input), null);
  assert.match(siloLinkBasisBlocker({ ...input, page: { ...input.page, status: "draft" } })!, /aprovadas/);
  assert.match(siloLinkBasisBlocker({ ...input, page: { ...input.page, siloDnaRef: { ...input.page.siloDnaRef, versionId: "sv0" } } })!, /não corresponde/);
  assert.match(siloLinkBasisBlocker({ ...input, articles: [{ ...input.articles[0], contentHash: "mudou" }] })!, /artigo/);
  assert.match(siloLinkBasisBlocker({ ...input, articles: [{ ...input.articles[0], status: "rejected" }] })!, /artigo/);
  assert.match(siloLinkBasisBlocker({ ...input, articles: [] })!, /não contém artigos/);
  assert.match(siloLinkBasisBlocker({ ...input, silo: { ...input.silo, brandId: "outra" } })!, /marca ativa/);
});

test("a confirmação de Processar links exige a mesma seleção, marca, composição e custo apresentado", () => {
  const base = { brandId: "marca", selectedArticleIds: ["a", "b"], selectedSiloId: "azul", basis: { versao: "v1", arestas: [] } };
  const fingerprint = linkMeshPreviewFingerprint(base);
  const silos = [{ preview: { cost: { calls: 1 } }, blocker: null }];
  const accepts = (currentFingerprint: string) => linkMeshPreviewCanConfirm({ fingerprint, currentFingerprint, silos });
  assert.equal(accepts(linkMeshPreviewFingerprint({ ...base, selectedArticleIds: ["b", "a"] })), true);
  assert.equal(accepts(linkMeshPreviewFingerprint({ ...base, selectedArticleIds: ["a", "c"] })), false);
  assert.equal(accepts(linkMeshPreviewFingerprint({ ...base, brandId: "outra" })), false);
  assert.equal(accepts(linkMeshPreviewFingerprint({ ...base, basis: { versao: "v2", arestas: [] } })), false);
  assert.equal(linkMeshPreviewCanConfirm({ fingerprint, currentFingerprint: fingerprint, silos: [...silos, { preview: null, blocker: "Silo incompleto" }] }), false);
  assert.equal(linkMeshPreviewCanConfirm({ fingerprint, currentFingerprint: fingerprint, silos: [...silos, { preview: { cost: { calls: 0 } }, blocker: null, estimate: true }] }), false, "uma estimativa de outro Silo não autoriza custo que não foi lido");
});

test("o acionador existente verifica a prévia antes de chamar o processamento", () => {
  const source = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("const confirmarPreviaDosLinks ="), source.indexOf("const handleDeleteLinkEdge ="));
  assert.ok(handler.indexOf("linkMeshPreviewCanConfirm") >= 0);
  assert.ok(handler.indexOf("linkMeshPreviewCanConfirm") < handler.indexOf("void processarLinks()"));
  assert.match(source, /<LinksMeshPreviewConfirm preview=\{linksMeshPreview\}/);
  const process = source.slice(source.indexOf("const processarLinks ="), source.indexOf("const handleApproveLinks ="));
  assert.match(process, /if \(comAncoras\) processados \+= 1/);
  assert.match(process, /processados === alvos\.length \? "success" : "warning"/);
});

test("a base de Links não interpreta uma composição planejada como Silo sem artigos", () => {
  const source = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const basis = source.slice(source.indexOf("const linksBasisFor ="), source.indexOf("const buildInitialLinksWorkingCopy ="));
  assert.match(basis, /siloLinkBasisBlocker\(/);
  assert.ok(basis.indexOf("siloLinkBasisBlocker(") < basis.indexOf("const nodes:"));
  assert.match(basis, /silo\.compositionBasis === "planned_members"/);
  assert.ok(basis.indexOf('silo.compositionBasis === "planned_members"') < basis.indexOf("silo.articleReferences"));
  assert.match(basis, /throw new Error\("Os artigos desta estrutura planejada/);
  const open = source.slice(source.indexOf("const abrirCopiaVigente ="), source.indexOf("const processarLinks ="));
  assert.ok(open.indexOf("linksBasisFor(context)") < open.indexOf("persistLinksWorkingCopy("));
});
