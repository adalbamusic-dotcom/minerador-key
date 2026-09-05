import assert from "node:assert/strict";
import test from "node:test";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload, deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies, type SiloWorkingCopy } from "../lib/arquiteto/silo-formation.ts";
import {
  SiloReviewProposalSchema,
  applySiloAiProposal,
  buildConsolidatedSiloDnaPayload,
  buildConsolidatedSiloPagePayload,
  collectSiloSerpGuidelines,
  siloConsolidationIssues,
  siloDnaReadbackIssues,
  siloPageReadbackIssues,
} from "../lib/arquiteto/silo-consolidation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const keyword = (id: string, value: string, volume_search: number | null = 100) => ({
  id, keyword: value, intent: "Informativo", volume_search, results_allintitle: null, kgr_score: null, lista_id: null,
  siloName: null, status: "aprovado", analise_semantica: { entidade_central: "manicure", publico: "clientes", problema_percebido: "duvida" },
});

async function article(id: string, value: string, volume = 100) {
  const group = buildProvisionalGroups([keyword(`${id}-kw`, value, volume)])[0];
  const payload = deterministicArticleDnaPayload(group, "brand-1");
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload });
}

async function fixture() {
  const first = await article("a1", "manicure profissional", 900);
  const second = await article("a2", "manicure para iniciantes", 300);
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second] });
  // 2C.4: a formação não elege Pilar. Consolidar só acontece DEPOIS da escolha
  // humana, então a fixture das provas de consolidação faz essa escolha
  // explicitamente — antes ela vinha de graça, do Pilar automático.
  const copy = chooseSiloWorkingCopyPillar(result.workingCopies[0], first.payload.articleId);
  return { first, second, copy };
}

test("consolidação gera SiloDNA formado com um Pilar, refs individuais e SiloPage distinta", async () => {
  const { first, second, copy } = await fixture();
  const selected = chooseSiloWorkingCopyPillar(copy, first.payload.articleId);
  const input = { copy: selected, articleVersions: [first, second], articleStatuses: { [first.payload.articleId]: "approved", [second.payload.articleId]: "approved" } };
  assert.equal(siloConsolidationIssues(input).length, 0);
  const dna = buildConsolidatedSiloDnaPayload(input);
  assert.equal(dna.formationStatus, "formed");
  assert.equal(dna.pillarArticleId, first.payload.articleId);
  assert.deepEqual(dna.supportArticleIds, [second.payload.articleId]);
  assert.deepEqual(dna.articleReferences.map(reference => reference.articleId).sort(), [first.payload.articleId, second.payload.articleId].sort());
  const dnaVersion = await createVersionEnvelope({ entityId: dna.siloId, versionNumber: 1, origin: "human", changeReason: "test", createdBy: "test", payload: dna });
  const page = buildConsolidatedSiloPagePayload(dnaVersion, input);
  assert.equal(page.formationStatus, "formed");
  assert.equal(page.pillarArticleId, first.payload.articleId);
  assert.equal(page.siloDnaRef.versionId, dnaVersion.versionId);
  assert.notEqual(page.pillarArticleId, page.siloId);
});

test("gate bloqueia conflito, ArticleDNA não aprovado, Silo raso e decisão de IA pendente", async () => {
  const { first, second, copy } = await fixture();
  const invalid = { ...copy, conflicts: ["conflito SERP"], source: "insufficient_architecture" as const };
  const issues = siloConsolidationIssues({ copy: invalid, articleVersions: [first, second], articleStatuses: { [first.payload.articleId]: "proposed", [second.payload.articleId]: "approved" }, pendingAiOperations: 1 });
  assert.match(issues.join(" "), /conflitos|insuficiente|aguardando|não está aprovado/i);
});

test("diretriz SERP reaproveita ref do ArticleDNA e não dispara consulta nova", async () => {
  const first = await article("serp", "manicure profissional", 900);
  const ref = { entityId: "assessment-1", versionId: "assessment-1:v1", contentHash: "legacy:abc123" } as const;
  const withRefPayload: ArticleDNA = { ...first.payload, serpAssessmentRef: ref };
  const withRef = await createVersionEnvelope({ entityId: first.payload.articleId, versionNumber: 2, previousVersionId: first.versionId, origin: "human", changeReason: "fixture", createdBy: "test", payload: withRefPayload });
  const guidelines = collectSiloSerpGuidelines([withRef]);
  assert.equal(guidelines.length, 1);
  assert.deepEqual(guidelines[0].reference, ref);
  assert.match(guidelines[0].guideline, /Nenhuma diretriz SERP nova|preservar/i);
});

test("SiloPage publicada preserva slug, URL e canonical ao fortalecer a arquitetura", async () => {
  const { first, second } = await fixture();
  const oldDnaPayload = deterministicSiloDnaPayload("silo-published", "Manicure", [first], { brandId: "brand-1", centralEntity: "manicure" });
  const oldDna = await createVersionEnvelope({ entityId: oldDnaPayload.siloId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload: oldDnaPayload });
  const oldPageBase = deterministicSiloPagePayload(oldDna, "brand-1", "manicure");
  const oldPagePayload: SiloPage = { ...oldPageBase, formationStatus: "formed", publicationStatus: "published", publishedUrl: "https://example.com/manicure", canonical: "https://example.com/manicure", publicationVerification: { ...oldPageBase.publicationVerification, status: "canonical_confirmed", requestedUrl: "https://example.com/manicure", resolvedUrl: "https://example.com/manicure", declaredCanonical: "https://example.com/manicure" } };
  const oldPage = await createVersionEnvelope({ entityId: oldPagePayload.siloPageId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: "test", payload: oldPagePayload });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second], existingSiloVersions: [oldDna], existingSiloPageVersions: [oldPage] });
  // Pilar por decisão humana explícita: a formação não elege mais.
  const copy = chooseSiloWorkingCopyPillar(result.workingCopies[0], first.payload.articleId);
  const input = { copy, articleVersions: [first, second], existingSiloDna: oldDna, existingSiloPage: oldPage, articleStatuses: { [first.payload.articleId]: "approved", [second.payload.articleId]: "approved" } };
  assert.equal(siloConsolidationIssues(input).length, 0);
  const newDnaPayload = buildConsolidatedSiloDnaPayload(input);
  const newDna = await createVersionEnvelope({ entityId: newDnaPayload.siloId, versionNumber: 2, previousVersionId: oldDna.versionId, origin: "human", changeReason: "test", createdBy: "test", payload: newDnaPayload });
  const newPage = buildConsolidatedSiloPagePayload(newDna, input);
  assert.equal(newPage.slug, "manicure");
  assert.equal(newPage.publishedUrl, "https://example.com/manicure");
  assert.equal(newPage.canonical, "https://example.com/manicure");
  assert.equal(newPage.publicationStatus, "published");
});

test("proposta IA permite rejeição parcial, join reversível e protege Silo publicado", async () => {
  const { copy } = await fixture();
  const secondCopy = { ...copy, id: "working-silo:2", name: "Outro universo", slug: "outro-universo" };
  const proposal = SiloReviewProposalSchema.parse({
    proposalId: "proposal-1", source: "ai", approvalStatus: "pending_human", summary: "Revisão", operations: [
      { operationId: "join-1", action: "join", sourceSiloId: copy.id, targetSiloId: secondCopy.id, justification: "sobreposição", confidence: 0.8, humanDecisionRequired: true },
      { operationId: "pillar-1", action: "select_pillar", sourceSiloId: secondCopy.id, articleId: secondCopy.pillarCandidateArticleId, justification: "centralidade", confidence: 0.7, humanDecisionRequired: true },
    ],
  });
  const partial = applySiloAiProposal([copy, secondCopy], proposal, ["join-1"]);
  assert.deepEqual(partial.applied, ["pillar-1"]);
  assert.equal(partial.workingCopies.length, 2);
  const published: SiloWorkingCopy = { ...copy, publishedProtection: { ...copy.publishedProtection, protected: true } };
  const protectedProposal = SiloReviewProposalSchema.parse({ proposalId: "proposal-2", source: "ai", approvalStatus: "pending_human", summary: "Eliminar", operations: [{ operationId: "eliminate-1", action: "eliminate_shallow", sourceSiloId: published.id, targetSiloId: secondCopy.id, justification: "raso", confidence: 0.9, humanDecisionRequired: true }] });
  const blocked = applySiloAiProposal([published, secondCopy], protectedProposal);
  assert.deepEqual(blocked.applied, []);
  assert.match(blocked.rejected[0]?.reason || "", /publicado/i);
});

test("readback detecta hash, brand, refs e identidade publicada divergentes", async () => {
  const { first, second, copy } = await fixture();
  const input = { copy, articleVersions: [first, second], articleStatuses: { [first.payload.articleId]: "approved", [second.payload.articleId]: "approved" } };
  const dna = buildConsolidatedSiloDnaPayload(input);
  const dnaVersion = await createVersionEnvelope({ entityId: dna.siloId, versionNumber: 1, origin: "human", changeReason: "test", createdBy: "test", payload: dna });
  const page = buildConsolidatedSiloPagePayload(dnaVersion, input);
  const pageVersion = await createVersionEnvelope({ entityId: page.siloPageId, versionNumber: 1, origin: "human", changeReason: "test", createdBy: "test", payload: page });
  const alteredDna: VersionEnvelope<SiloDNA> = { ...dnaVersion, contentHash: "legacy:wrong" };
  const alteredPage: VersionEnvelope<SiloPage> = { ...pageVersion, payload: { ...pageVersion.payload, brandId: "brand-2" } };
  assert.match(siloDnaReadbackIssues(dnaVersion, { siloDnas: [alteredDna], siloPages: [], statuses: [{ versionId: dnaVersion.versionId, status: "approved" }] }).join(" "), /Hash/i);
  assert.match(siloPageReadbackIssues(pageVersion, { siloDnas: [], siloPages: [alteredPage], statuses: [] }).join(" "), /brandId|Hash/i);
});

test("rota de revisão IA não contém persistência direta", async () => {
  const source = await (await import("node:fs/promises")).readFile("app/api/arquiteto/silo-review/route.ts", "utf8");
  assert.equal(/\.from\(|\.insert\(|\.update\(|\.delete\(/.test(source), false);
});
