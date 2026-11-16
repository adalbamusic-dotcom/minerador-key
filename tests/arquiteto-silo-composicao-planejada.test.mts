import assert from "node:assert/strict";
import test from "node:test";
import { plannedSiloComposition, plannedSiloTerritoryMatches } from "../lib/arquiteto/planned-silo-composition.ts";

const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const group = { id: groupId, brandId: "marca-a", origin: "declared_plan", status: "active", plan: { siloName: "Tema", siloSlug: "tema", objective: null, articleCount: 2 }, planVersion: 3, planHash: "sha256:abc", lockVersion: 4 };
const article = (keywordId: string, role: "Pilar" | "Suporte", order: number) => ({ keywordId, brandId: "marca-a", phrase: `Assunto ${keywordId}`, declared: true, received: true, approvedPackageRef: { version: 1, contentHash: "hash", approvedAt: "2026-11-13" }, plan: { groupId, planVersion: 3, role, order, scope: "Escopo", declaredPrincipal: null } });
const pilar = article("k-pilar", "Pilar", 2);
const suporte = article("k-suporte", "Suporte", 1);

test("forma membros pela identidade do Assunto e ordena sem gravar", () => {
  const result = plannedSiloComposition({ brandId: "marca-a", group, subjects: [pilar, suporte] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.members.map(member => [member.anchorId, member.role, member.order]), [["k-suporte", "Suporte", 1], ["k-pilar", "Pilar", 2]]);
    assert.deepEqual(result.source, { kind: "editorial_group_plan", groupId, planVersion: 3, planHash: "sha256:abc", lockVersion: 4 });
    assert.deepEqual(result.subjectProofs.map(proof => [proof.keywordId, proof.approvedPackageRef.version, proof.approvedPackageRef.contentHash]), [["k-suporte", 1, "hash"], ["k-pilar", 1, "hash"]]);
    assert.deepEqual(result.outline.map(item => [item.heading, item.objective]), [["Assunto k-suporte", "Escopo"], ["Assunto k-pilar", "Escopo"]]);
  }
});

test("Assuntos do plano precisam do mesmo território confirmado sem duplicidade", () => {
  const composition = plannedSiloComposition({ brandId: "marca-a", group, subjects: [pilar, suporte] });
  assert.equal(composition.ok, true);
  if (!composition.ok) return;
  const input = { territoryRef: "territory:a", members: composition.members, assignments: [{ keywordId: "k-pilar", territoryRef: "territory:a" }, { keywordId: "k-suporte", territoryRef: "territory:a" }] };
  assert.equal(plannedSiloTerritoryMatches(input), true);
  assert.equal(plannedSiloTerritoryMatches({ ...input, assignments: [input.assignments[0]] }), false);
  assert.equal(plannedSiloTerritoryMatches({ ...input, assignments: [...input.assignments, input.assignments[0]] }), false);
  assert.equal(plannedSiloTerritoryMatches({ ...input, territoryRef: "territory:b" }), false);
});

test("recusa plano incompleto, duplicado, versão antiga e outra marca", () => {
  const valid = { brandId: "marca-a", group, subjects: [pilar, suporte] };
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, { ...suporte, keywordId: pilar.keywordId }] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, { ...suporte, plan: { ...suporte.plan, planVersion: 2 } }] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, { ...suporte, brandId: "marca-b" }] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, group: { ...group, brandId: "marca-b" } }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, { ...suporte, plan: { ...suporte.plan, role: "Pilar" } }] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, suporte, { ...suporte, plan: { groupId } as typeof suporte.plan }] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, { ...suporte, approvedPackageRef: null }] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, { ...suporte, received: false }] }).ok, false);
  assert.equal(plannedSiloComposition({ ...valid, subjects: [pilar, { ...suporte, declared: false }] }).ok, false);
});
