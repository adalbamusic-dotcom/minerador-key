import assert from "node:assert/strict";
import test from "node:test";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload, deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies, siloWorkingCopyIssues } from "../lib/arquiteto/silo-formation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const keyword = (id: string, value: string, overrides: Record<string, unknown> = {}) => ({
  id,
  keyword: value,
  intent: "Informativo",
  volume_search: 100,
  results_allintitle: null,
  kgr_score: null,
  lista_id: null,
  siloName: null,
  status: "aprovado",
  analise_semantica: { entidade_central: "manicure", publico: "clientes", problema_percebido: "duvida" },
  ...overrides,
});

async function article(id: string, value: string, overrides: Record<string, unknown> = {}) {
  const group = buildProvisionalGroups([keyword(`${id}-kw`, value, overrides)])[0];
  const payload = deterministicArticleDnaPayload(group, "brand-1");
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload });
}

test("forma working copy nova sem perder refs individuais e separa SiloPage do Pilar", async () => {
  const first = await article("a1", "manicure profissional", { volume_search: 900 });
  const second = await article("a2", "manicure para iniciantes", { volume_search: 300 });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second], reservedCandidates: [{ id: "candidate-1", keyword: "manicure", siloCandidate: { status: "candidate" } }] });
  assert.equal(result.workingCopies.length, 1);
  const copy = result.workingCopies[0];
  assert.equal(copy.source, "new_candidate");
  assert.equal(copy.articleReferences.length, 2);
  // 2C.4: a formação NÃO elege Pilar. Nenhum papel estrutural nasce da heurística.
  assert.equal(copy.pillarCandidateArticleId, null);
  assert.equal(copy.articleReferences.filter(reference => reference.role === "pillar_candidate").length, 0);
  assert.deepEqual(copy.supportArticleIds, [], "suportes não são presumidos antes da escolha do Pilar");
  assert.equal(copy.siloPage.pillarArticleId, null);
  assert.equal(copy.siloPage.distinctFromPillar, true);
  assert.deepEqual(copy.reservedCandidateIds, ["candidate-1"]);
  assert.equal(copy.articleReferences.every(reference => reference.articleDnaVersionId && reference.articleDnaContentHash), true);
  // A pendência é a decisão humana, e é isso que os issues dizem.
  assert.match(siloWorkingCopyIssues(copy).join(" "), /decisão humana/i);

  // Depois da escolha humana, a estrutura fecha e os issues somem.
  const decidido = chooseSiloWorkingCopyPillar(copy, first.payload.articleId);
  assert.equal(decidido.pillarCandidateArticleId, first.payload.articleId);
  assert.deepEqual(decidido.supportArticleIds, [second.payload.articleId]);
  assert.equal(siloWorkingCopyIssues(decidido).length, 0);
});

test("volume alto sozinho não cria novo Silo e keyword específica permanece rastreada", async () => {
  const specific = await article("specific", "manicure perto de mim", { volume_search: 5000 });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [specific] });
  assert.equal(result.workingCopies.length, 1);
  assert.equal(result.workingCopies[0].source, "insufficient_architecture");
  assert.deepEqual(result.workingCopies[0].articleReferences.map(reference => reference.articleId), [specific.payload.articleId]);
  assert.match(result.workingCopies[0].conflicts.join(" "), /arquitetura insuficiente/i);
});

test("Silo semanticamente equivalente é fortalecido em vez de duplicado", async () => {
  const first = await article("existing", "manicure profissional", { volume_search: 700 });
  const second = await article("existing-2", "manicure para iniciantes", { volume_search: 200 });
  const siloPayload = deterministicSiloDnaPayload("silo-manicure", "Manicure", [first], { brandId: "brand-1", centralEntity: "manicure" });
  const silo = await createVersionEnvelope({ entityId: siloPayload.siloId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload: siloPayload });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second], existingSiloVersions: [silo] });
  assert.equal(result.workingCopies.length, 1);
  assert.equal(result.workingCopies[0].source, "existing");
  assert.equal(result.workingCopies[0].existingSiloId, "silo-manicure");
  assert.match(result.workingCopies[0].reasons.join(" "), /fortalecer/i);
});

test("nenhum sinal automático vira Pilar e métrica ausente continua desconhecida", async () => {
  const broad = await article("broad", "manicure", { volume_search: 1000 });
  const kgr = await article("kgr", "manicure com esmaltação em gel", { volume_search: 100, kgr_score: 0.05 });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [broad, kgr] });
  const copy = result.workingCopies[0];
  // 2C.4: antes, o maior volume virava Pilar — a versão anterior deste teste
  // provava só que o KGR não escolhia, e deixava o volume escolher. Agora nada
  // escolhe: nem volume, nem KGR, nem centralidade, nem ordem.
  assert.equal(copy.pillarCandidateArticleId, null);
  assert.equal(copy.pillarScores.length, 2, "a heurística continua ranqueando candidatos");
  assert.ok(copy.pillarScores[0].total >= copy.pillarScores[1].total, "o ranking existe, mas é sugestão");
  assert.notEqual(copy.pillarScores[0].articleId, copy.pillarCandidateArticleId);
  const kgrScore = copy.pillarScores.find(score => score.articleId === kgr.payload.articleId);
  assert.equal(kgrScore?.kgrConsidered, true);
  assert.match(kgrScore?.reasons.join(" ") || "", /não promove Pilar/i);
  const unknown = await article("unknown", "manicure sem volume", { volume_search: null });
  const unknownResult = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [broad, unknown] });
  assert.equal(unknownResult.workingCopies[0].pillarScores.find(score => score.articleId === unknown.payload.articleId)?.volume, null);
});

test("Pilar humano pode ser trocado sem perder ArticleDNA e publicados ficam protegidos", async () => {
  const first = await article("published", "manicure", { volume_search: 800 });
  const publishedPayload: ArticleDNA = { ...first.payload, publishedIdentityRef: {
    publicationStatus: "published_protected", publishedUrl: "https://example.com/manicure", slug: "manicure", canonical: "https://example.com/manicure", source: "manual",
  } };
  const published = await createVersionEnvelope({ entityId: first.payload.articleId, versionNumber: 2, previousVersionId: first.versionId, origin: "human", changeReason: "published fixture", createdBy: "test", payload: publishedPayload });
  const second = await article("support", "manicure para iniciantes", { volume_search: 200 });
  const siloPayload = deterministicSiloDnaPayload("silo-published", "Manicure", [published], { brandId: "brand-1", centralEntity: "manicure" });
  const silo = await createVersionEnvelope({ entityId: siloPayload.siloId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload: siloPayload });
  const pagePayload = deterministicSiloPagePayload(silo, "brand-1", "/manicure");
  const page = await createVersionEnvelope({ entityId: pagePayload.siloPageId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload: pagePayload });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [published, second], existingSiloVersions: [silo], existingSiloPageVersions: [page] });
  const copy = result.workingCopies[0];
  assert.equal(copy.publishedProtection.protected, true);
  assert.deepEqual(copy.publishedProtection.articleIds, [published.payload.articleId]);
  const selected = chooseSiloWorkingCopyPillar(copy, second.payload.articleId);
  assert.equal(selected.pillarCandidateArticleId, second.payload.articleId);
  assert.equal(selected.articleReferences.filter(reference => reference.role === "pillar_candidate").length, 1);
  assert.deepEqual(new Set(selected.articleReferences.map(reference => reference.articleId)), new Set(copy.articleReferences.map(reference => reference.articleId)));
});

test("formação mantém isolamento por Brand e não usa Silo sem brandId como fallback", async () => {
  const current = await article("current-brand", "manicure", { volume_search: 300 });
  const other = await article("other-brand", "manicure", { volume_search: 500 });
  const otherPayload: ArticleDNA = { ...other.payload, brandId: "brand-2" };
  const otherVersion = await createVersionEnvelope({ entityId: other.payload.articleId, versionNumber: 2, previousVersionId: other.versionId, origin: "system", changeReason: "other brand fixture", createdBy: "test", payload: otherPayload });
  const unscopedSiloPayload = deterministicSiloDnaPayload("unscoped", "Manicure", [], { centralEntity: "manicure" });
  const unscopedSilo = await createVersionEnvelope({ entityId: unscopedSiloPayload.siloId, versionNumber: 1, origin: "system", changeReason: "legacy fixture", createdBy: "test", payload: unscopedSiloPayload });
  const result = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [current, otherVersion], existingSiloVersions: [unscopedSilo] });
  assert.equal(result.workingCopies.length, 1);
  assert.deepEqual(result.workingCopies[0].articleReferences.map(reference => reference.articleId), [current.payload.articleId]);
  assert.equal(result.workingCopies[0].existingSiloId, null);
});

test("a semelhança agrupa dentro do Silo confirmado, nunca através dele", async () => {
  // Cenário real: dois artigos semanticamente próximos que a decisão humana
  // já separou em territórios distintos, e dois do mesmo território que a
  // semelhança não conectaria sozinha.
  const facial = await article("t1", "serum facial principia", { volume_search: 800 });
  const mascara = await article("t2", "mascara de skincare", { volume_search: 400 });
  const retinol = await article("t3", "retinol creamy antes e depois", { volume_search: 600 });
  const comTerritorio = (
    version: VersionEnvelope<ArticleDNA>,
    territoryRef: string,
  ): VersionEnvelope<ArticleDNA> => ({ ...version, payload: { ...version.payload, territoryRef } });

  const result = formSiloWorkingCopies({
    brandId: "brand-1",
    articleVersions: [
      comTerritorio(facial, "territory:skincare-facial"),
      comTerritorio(mascara, "territory:skincare-facial"),
      comTerritorio(retinol, "territory:anti-idade"),
    ],
  });

  // Um Silo confirmado, uma cópia de trabalho: a fronteira já foi decidida.
  assert.equal(result.workingCopies.length, 2);
  const porTamanho = [...result.workingCopies].sort((a, b) => b.articleReferences.length - a.articleReferences.length);
  assert.deepEqual(
    porTamanho[0].articleReferences.map(reference => reference.articleId).sort(),
    [facial.payload.articleId, mascara.payload.articleId].sort(),
    "os dois artigos do mesmo território ficam na mesma cópia",
  );
  assert.deepEqual(
    porTamanho[1].articleReferences.map(reference => reference.articleId),
    [retinol.payload.articleId],
    "artigo de outro território nunca entra na cópia alheia",
  );
  // Nenhuma cópia mistura territórios: sem território único ela não pode ser
  // persistida, e uma proposta impersistível é trabalho perdido.
  for (const copy of result.workingCopies) {
    const territorios = new Set(copy.articleReferences.map(reference => reference.articleId).map(articleId =>
      [facial, mascara].some(item => item.payload.articleId === articleId) ? "territory:skincare-facial" : "territory:anti-idade"));
    assert.equal(territorios.size, 1);
  }
});
