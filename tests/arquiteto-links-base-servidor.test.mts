import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assertWorkingCopyArtifactReferences } from "../lib/server/internal-link-graph-persistence.ts";
import { manualSiloDnaDraftPayload, deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";

const brandId = "marca", hash = `sha256:${"a".repeat(64)}`;
const ref = (entityId: string, versionId: string) => ({ entityId, versionId, contentHash: hash });
const siloRef = ref("silo", "s1"), pageRef = ref("silo-page:silo", "p1"), articleRef = ref("artigo", "a1");
const silo = { ...manualSiloDnaDraftPayload("silo", "Internet", brandId), formationStatus: "formed", centralEntity: "Internet", objective: "Orientar", audience: "Leitores", macroProblem: "Dúvidas", dominantIntent: "Informar", boundary: "Internet", pillarArticleId: "artigo", articleReferences: [{ articleId: "artigo", articleDnaVersionId: "a1", articleDnaContentHash: hash, role: "Pilar" }], humanPendingDecisions: [] };
const page = deterministicSiloPagePayload({ ...siloRef, versionNumber: 1, previousVersionId: null, origin: "human", changeReason: "teste", createdAt: "2026-11-13T00:00:00.000Z", createdBy: "humano", payload: silo } as never, brandId, "internet");
const row = (reference: typeof siloRef, artifactType: string, payload: unknown, sourceVersionId: string | null = null) => ({ version_id: reference.versionId, entity_id: reference.entityId, marca_id: brandId, artifact_type: artifactType, version_number: 1, status: "approved", payload, content_hash: hash, source_version_id: sourceVersionId });
const baseRows = [row(siloRef, "silo_dna", silo), row(pageRef, "silo_page", page, "s1"), row(articleRef, "article_dna", { brandId, hierarchy: "Pilar" })];
const copy = { brandId, siloId: "silo", baseSiloDnaVersionRef: siloRef, baseSiloPageVersionRef: pageRef, participatingArticleDnaVersionRefs: [articleRef], nodes: [] };

function context(input: { rows?: typeof baseRows; events?: object[]; latest?: object[]; pageCap?: number } = {}) {
  const rows = input.rows ?? baseRows;
  const latest = input.latest ?? rows.map(item => ({ version_id: item.version_id, entity_id: item.entity_id, artifact_type: item.artifact_type, version_number: item.version_number }));
  return { brandId, supabase: { from(table: string) {
    let columns = "", start = 0, ranged = false;
    const query = { select(value: string) { columns = value; return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, range(offset: number) { start = offset; ranged = true; return query; }, then(resolve: (value: unknown) => void) { const data = table === "editorial_version_status_events" ? input.events ?? [] : columns.includes("payload") ? rows : latest; resolve({ data: ranged ? data.slice(start, start + (input.pageCap ?? 1000)) : data, count: data.length, error: null }); } };
    return query;
  } } };
}

test("servidor valida as versões e aprovações antes de salvar a cópia de links", async () => {
  await assert.doesNotReject(assertWorkingCopyArtifactReferences(context() as never, copy as never));
  await assert.doesNotReject(assertWorkingCopyArtifactReferences(context({ pageCap: 1 }) as never, copy as never));
  await assert.doesNotReject(assertWorkingCopyArtifactReferences(context({ rows: baseRows.map(item => item.version_id === "a1" ? { ...item, payload: { brandId, hierarchy: "Suporte" } } : item) }) as never, copy as never), "no legado, o Silo aprovado determina o papel no grafo");
  await assert.rejects(assertWorkingCopyArtifactReferences(context({ events: [{ version_id: "a1", status: "rejected" }] }) as never, copy as never), /artigo sem aprovação/);
  await assert.rejects(assertWorkingCopyArtifactReferences(context({ latest: [...baseRows.map(item => ({ version_id: item.version_id, entity_id: item.entity_id, artifact_type: item.artifact_type, version_number: 1 })), { version_id: "a2", entity_id: "artigo", artifact_type: "article_dna", version_number: 2 }] }) as never, copy as never), /mudou/);
  await assert.rejects(assertWorkingCopyArtifactReferences(context() as never, { ...copy, participatingArticleDnaVersionRefs: [] } as never), /não cobre exatamente/);
  await assert.rejects(assertWorkingCopyArtifactReferences(context({ rows: baseRows.map(item => item.version_id === "a1" ? { ...item, payload: { brandId: "outra" } } : item) }) as never, copy as never), /artigo sem aprovação/);
  await assert.rejects(assertWorkingCopyArtifactReferences(context() as never, { ...copy, nodes: [{ brandId, nodeType: "ARTICLE_DNA", articleDnaVersionRef: articleRef, architecturalRole: "SUPORTE" }] } as never), /papel de um artigo/);
});

test("a confirmação do grafo também relê a base antes da gravação", () => {
  const source = readFileSync(new URL("../lib/server/internal-link-graph-persistence.ts", import.meta.url), "utf8");
  const writer = source.slice(source.indexOf("export async function persistInternalLinkGraph("), source.indexOf("export async function readInternalLinkGraphWorkingCopy("));
  assert.ok(writer.indexOf("await assertWorkingCopyArtifactReferences(context, parsed)") >= 0);
  assert.ok(writer.indexOf("await assertWorkingCopyArtifactReferences(context, parsed)") < writer.indexOf('.rpc("persist_internal_link_graph"'));
});
