import test from "node:test";
import assert from "node:assert/strict";
import { buildBrandRef, buildTenantPath, isTenantId, parseBrandRef, switchTenantPath, tenantModuleFromPathname } from "../lib/tenant-routing.ts";
import { legacyTargetFromPathname, isLegacyTenantTarget } from "../lib/legacy-routing.ts";
import { buildAdminPath } from "../lib/admin-routing.ts";

const tenant = "9f7b1d84-54a5-4bd2-aee0-1136d4a7f64f";
const ref = buildBrandRef("Adalba Pro", tenant);

test("brandRef preserves the canonical tenant and derives a readable slug", () => {
  assert.equal(isTenantId(tenant), true);
  assert.equal(ref, `adalba-pro--${tenant}`);
  assert.deepEqual(parseBrandRef(ref), { brandSlug: "adalba-pro", brandId: tenant });
  assert.equal(buildTenantPath({ brandId: tenant, brandName: "Adalba Pro", module: "radar" }), `/${ref}/radar`);
});

test("brandRef rejects malformed identity and keeps safe query behavior", () => {
  assert.throws(() => parseBrandRef("adalba-pro"));
  assert.throws(() => buildBrandRef("Adalba", "not-a-tenant"), /Tenant inválido/);
});

test("brand switching retains module, drops entity query and falls back to brand root", () => {
  assert.equal(tenantModuleFromPathname(`/${ref}/arquiteto`), "arquiteto");
  assert.equal(switchTenantPath({ targetBrand: { brandId: tenant, brandName: "Adalba Pro" }, pathname: `/${ref}/arquiteto`, search: "articleId=a1&painel=silo&filter=pendente" }), `/${ref}/arquiteto?painel=silo&filter=pendente`);
  assert.equal(switchTenantPath({ targetBrand: { brandId: tenant, brandName: "Adalba Pro" }, pathname: `/${ref}/arquiteto`, search: "documentId=d1", allowedModules: ["marca"] }), `/${ref}`);
});

test("all legacy module paths remain recognized as redirect targets", () => {
  for (const [path, target] of Object.entries({ marca: "/", conta: "/conta", minerador: "/minerador", arquiteto: "/arquiteto", radar: "/radar", planejador: "/planejador", redator: "/redator", publicacoes: "/publicacoes" })) {
    assert.equal(legacyTargetFromPathname(`/${path}`), target);
    assert.equal(isLegacyTenantTarget(target), true);
  }
  assert.equal(legacyTargetFromPathname("/admin"), null);
});

test("admin tabs have a single canonical path", () => {
  assert.equal(buildAdminPath(), "/admin");
  assert.equal(buildAdminPath("marcas"), "/admin?tab=marcas");
});
