import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlannedSiloMembers, type PlannedSiloArticle, type PlannedSiloMember } from "../lib/arquiteto/planned-silo-members.ts";

const marca = "marca-a";
const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const key = (id: string) => JSON.stringify([marca, "subject_keyword", id]);
const proofs = ["p", "s"].map(id => ({ keywordId: id, version: 1, contentHash: `pkg-${id}`, approvedAt: "2026-11-13" }));
const members: PlannedSiloMember[] = [
  { memberKey: key("p"), anchorKind: "subject_keyword", anchorId: "p", role: "Pilar", order: 1 },
  { memberKey: key("s"), anchorKind: "subject_keyword", anchorId: "s", role: "Suporte", order: 2 },
];
const article = (id: string, role: "Pilar" | "Suporte"): PlannedSiloArticle => ({
  versionId: `v-${id}`, contentHash: `hash-${id}`, current: true, effectiveStatus: "approved",
  payload: { brandId: marca, articleId: `art-${id}`, siloId: "silo", hierarchy: role,
    subject: { keywordId: id }, keywordReferences: [{ keywordId: id }],
    siloMembershipRef: { siloDnaVersionId: "silo-v1", siloDnaContentHash: "hash-silo", memberKey: key(id) } },
});
function base() {
  return { brandId: marca,
    silo: { versionId: "silo-v1", contentHash: "hash-silo", effectiveStatus: "approved", current: true,
      payload: { brandId: marca, siloId: "silo", compositionBasis: "planned_members", compositionSourceRef: { kind: "editorial_group_plan" as const, groupId, planVersion: 1, planHash: "hash-plan", lockVersion: 1 }, plannedMembers: members, keywordPackageRefs: structuredClone(proofs) } },
    page: { effectiveStatus: "approved", current: true, payload: { brandId: marca, siloId: "silo", compositionBasis: "planned_members", plannedMemberKeys: members.map(m => m.memberKey),
      siloDnaRef: { versionId: "silo-v1", contentHash: "hash-silo", entityId: "silo" } } },
    articles: [article("p", "Pilar"), article("s", "Suporte")],
    sourceCurrent: { brandId: marca, groupId, origin: "declared_plan", status: "active", planVersion: 1, planHash: "hash-plan", subjectProofs: structuredClone(proofs) } };
}

test("resolve apenas artigos vigentes e aprovados ligados ao par e aos membros", () => {
  const actual = resolvePlannedSiloMembers(base());
  assert.equal(actual.ok, true);
  if (actual.ok) assert.deepEqual(actual.members.map(item => item.article.payload.articleId), ["art-p", "art-s"]);
});

test("recusa par sem aprovação ou com hash, marca ou composição diferente", () => {
  for (const mutate of [
    (x: ReturnType<typeof base>) => { x.silo.effectiveStatus = "rejected"; },
    (x: ReturnType<typeof base>) => { x.page.payload.siloDnaRef.contentHash = "outro"; },
    (x: ReturnType<typeof base>) => { x.page.payload.brandId = "outra"; },
    (x: ReturnType<typeof base>) => { x.page.payload.plannedMemberKeys.reverse(); },
    (x: ReturnType<typeof base>) => { x.sourceCurrent.planVersion = 2; },
    (x: ReturnType<typeof base>) => { x.sourceCurrent.planHash = "alterado"; },
    (x: ReturnType<typeof base>) => { x.sourceCurrent.subjectProofs[0].contentHash = "alterado"; },
  ]) { const x = base(); mutate(x); assert.equal(resolvePlannedSiloMembers(x).ok, false); }
});

test("recusa ausências, duplicatas, rejeição, versão antiga e papel divergente", () => {
  for (const mutate of [
    (x: ReturnType<typeof base>) => { x.articles.pop(); },
    (x: ReturnType<typeof base>) => { x.articles.push(article("s", "Suporte")); },
    (x: ReturnType<typeof base>) => { x.articles[1].effectiveStatus = "rejected"; },
    (x: ReturnType<typeof base>) => { x.articles[1].payload.siloMembershipRef!.siloDnaVersionId = "anterior"; },
    (x: ReturnType<typeof base>) => { x.articles[1].payload.hierarchy = "Pilar"; },
    (x: ReturnType<typeof base>) => { x.articles[1].payload.subject = { keywordId: "outro" }; x.articles[1].payload.keywordReferences = []; },
    (x: ReturnType<typeof base>) => { x.articles[1].payload.subject = { keywordId: "outro" }; },
    (x: ReturnType<typeof base>) => { x.articles[1].payload.articleId = x.articles[0].payload.articleId; },
  ]) { const x = base(); mutate(x); assert.equal(resolvePlannedSiloMembers(x).ok, false); }
});

test("artigo sem Assunto usa a âncora de origem das keywords sem mudar a identidade", () => {
  const x = base(); x.articles[1].payload.subject = null;
  assert.equal(resolvePlannedSiloMembers(x).ok, true);
});

test("outra marca não satisfaz membro e uma composição malformada é recusada", () => {
  const wrongBrand = base(); wrongBrand.articles[1].payload.brandId = "outra";
  assert.equal(resolvePlannedSiloMembers(wrongBrand).ok, false);
  const bad = base(); bad.silo.payload.plannedMembers = [{ ...members[0], order: 0 }]; bad.page.payload.plannedMemberKeys = [members[0].memberKey];
  assert.equal(resolvePlannedSiloMembers(bad).ok, false);
  const unordered = base(); unordered.silo.payload.plannedMembers = [members[1], members[0]]; unordered.page.payload.plannedMemberKeys = unordered.silo.payload.plannedMembers.map(member => member.memberKey);
  assert.equal(resolvePlannedSiloMembers(unordered).ok, false);
});
