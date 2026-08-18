import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("layouts resolvem acesso no servidor sem tela cheia intermediária", async () => {
  const [admin, agency, brand, agencyLoading, brandLoading] = await Promise.all([
    read("app/(admin)/layout.tsx"),
    read("app/(agency)/agencias/[agencyRef]/layout.tsx"),
    read("app/(brand)/[brandRef]/layout.tsx"),
    read("app/(agency)/agencias/[agencyRef]/loading.tsx"),
    read("app/(brand)/[brandRef]/loading.tsx"),
  ]);
  assert.match(admin, /requireCanonicalPlatformAdmin/);
  assert.match(agency, /getAgencyWorkspaceData/);
  assert.match(brand, /resolveCanonicalBrandTenantContext\(brandRef\)/);
  assert.doesNotMatch(admin, /Suspense|status="loading"|Confirmando administra/);
  assert.doesNotMatch(agencyLoading, /min-h-screen|CanonicalAccessState/);
  assert.doesNotMatch(brandLoading, /min-h-screen|CanonicalAccessState/);
});

test("Admin estrutural e Agência editorial usam responsabilidades separadas", async () => {
  const [adminBrands, agencyWorkspace, agencyManagement, authorization, cards, brandsRoute] = await Promise.all([
    read("modules/admin/brands-admin-panel.tsx"),
    read("modules/conta/agency-workspace-page.tsx"),
    read("modules/conta/agency-brands-management.tsx"),
    read("lib/server/canonical-authorization.ts"),
    read("components/brand-context-cards.tsx"),
    read("app/api/marcas/route.ts"),
  ]);
  assert.match(adminBrands, /Marcas cadastradas/);
  assert.match(agencyWorkspace, /AgencyBrandsManagement/);
  assert.match(agencyManagement, /AgencyBrandCard/);
  assert.match(agencyManagement, /authorizedForEditorial/);
  assert.match(agencyManagement, /buildTenantPath/);
  assert.match(authorization, /membershipCountByBrandId/);
  assert.match(authorization, /authorizedForEditorial: accessibleIds\.has\(brand\.id\)/);
  assert.match(cards, /Agência vinculada/);
  assert.match(cards, /Entrar na Marca/);
  assert.match(brandsRoute, /agencyNameById/);
});

test("nenhuma nova autorização visual usa estado local ou concede editorial por agência", async () => {
  const [agencyWorkspace, authorization, frame] = await Promise.all([
    read("modules/conta/agency-workspace-page.tsx"),
    read("lib/server/canonical-authorization.ts"),
    read("components/workspace-frame.tsx"),
  ]);
  assert.doesNotMatch(agencyWorkspace, /localStorage|router\.|setSelectedBrandId/);
  assert.doesNotMatch(authorization, /ADMIN_EMAIL|user_key|first agency/i);
  assert.match(authorization, /destination_email/);
  assert.match(frame, /Minha Agência/);
  assert.doesNotMatch(frame, /Agências autorizadas|Marcas autorizadas/);
});
