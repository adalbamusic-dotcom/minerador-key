import assert from "node:assert/strict";
import test from "node:test";
import { BrandDNASchema } from "../lib/arquiteto/contracts.ts";
import { createBrandDnaDraft, createBrandDnaVersion, effectiveBrandDnaVersionId, splitLines } from "../lib/marca/domain.ts";

const payload = createBrandDnaDraft({ brandId: "brand-1", positioning: "Clínica de estética com cuidado responsável.", audience: ["Pacientes adultos"], voice: ["Clara", "Técnica"], businessObjectives: ["Atrair demanda orgânica"], differentiators: [], prohibitedClaims: [], editorialPrinciples: ["Não prometer resultado."] });

test("BrandDNA estruturado exige os campos estratégicos mínimos", () => {
  assert.equal(BrandDNASchema.safeParse(payload).success, true);
  assert.equal(BrandDNASchema.safeParse({ ...payload, audience: [] }).success, false);
});

test("BrandDNA cria sucessora imutável com predecessor e hash", async () => {
  const version = await createBrandDnaVersion({ brandId: "brand-1", versionNumber: 2, previousVersionId: "previous:v1", payload, createdBy: "user-1", changeReason: "Revisão humana" });
  assert.equal(version.entityId, "brand:brand-1");
  assert.equal(version.previousVersionId, "previous:v1");
  assert.match(version.contentHash, /^sha256:/);
  assert.equal(version.origin, "human");
});

test("BrandDNA rejeita payload de outra marca e normaliza listas", async () => {
  await assert.rejects(() => createBrandDnaVersion({ brandId: "brand-2", versionNumber: 1, payload, createdBy: "user-1", changeReason: "Tentativa" }));
  assert.deepEqual(splitLines(" técnica,\n clara \n"), ["técnica", "clara"]);
});

test("somente o evento aprovado define a versão ativa", () => {
  assert.equal(effectiveBrandDnaVersionId(["v2", "v1"], [{ versionId: "v1", status: "approved" }, { versionId: "v2", status: "draft" }]), "v1");
  assert.equal(effectiveBrandDnaVersionId(["v2", "v1"], [{ versionId: "v1", status: "superseded" }]), null);
});
