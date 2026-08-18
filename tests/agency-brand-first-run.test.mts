import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("cadastro da Agência usa somente campos operacionais", async () => {
  const [form, controls, route, helper] = await Promise.all([
    read("modules/conta/agency-brand-create-modal.tsx"),
    read("modules/conta/agency-workspace-controls.tsx"),
    read("app/api/agencies/[agencyRef]/brands/route.ts"),
    read("lib/server/admin-brand-creation.ts"),
  ]);
  for (const field of ["new-brand-name", "new-brand-site", "new-brand-niche", "new-brand-location"]) assert.match(form, new RegExp(field));
  assert.doesNotMatch(form, /dna_diretrizes|silos_existentes/);
  assert.match(form, /role="dialog"/);
  assert.doesNotMatch(controls, /AgencyBrandCreateForm|new-brand-name/);
  assert.match(route, /createAgencyBrand/);
  assert.match(helper, /owner_user_id: ownerUserId/);
  assert.match(helper, /site_url: siteUrl/);
  assert.match(helper, /nicho/);
  assert.match(helper, /localizacao/);
});

test("cadastro não cria membership artificial nem inicia BrandDNA", async () => {
  const [helper, route] = await Promise.all([
    read("lib/server/admin-brand-creation.ts"),
    read("app/api/agencies/[agencyRef]/brands/route.ts"),
  ]);
  assert.doesNotMatch(helper, /brand_memberships|editorial_artifact_versions|brand-dna/);
  assert.doesNotMatch(route, /BrandDna|brand-dna|brand_memberships/);
});

test("home da Marca nova não depende de snapshot editorial", async () => {
  const source = await read("modules/marca/brand-page.tsx");
  assert.match(source, /OperationalBrandHome/);
  assert.match(source, /!pipeline\.snapshot/);
  assert.match(source, /\?secao=dna/);
  assert.match(source, /Não informado|Não foi possível confirmar/);
});

test("listagem e shell usam linguagem operacional da Agência", async () => {
  const [workspace, management, card, shell] = await Promise.all([
    read("modules/conta/agency-workspace-page.tsx"),
    read("modules/conta/agency-brands-management.tsx"),
    read("components/brand-context-cards.tsx"),
    read("components/product-shell.tsx"),
  ]);
  assert.match(workspace, /AgencyBrandsManagement/);
  assert.match(management, /Cadastrar primeira Marca/);
  assert.match(management, /AgencyBrandCreateModal/);
  assert.match(card, /Editar cadastro/);
  assert.match(card, /Administrar colaboradores/);
  assert.doesNotMatch(card, /Excluir Marca|Colocar em standby|Arquivar/);
  assert.match(management, /Marcas da Agência/);
  assert.match(shell, /Minha Agência/);
  assert.doesNotMatch(shell, /Agências autorizadas/);
});

test("lifecycle da Marca não inventa standby ou arquivamento", async () => {
  const [migration, card] = await Promise.all([
    read("supabase/migrations/0005_tenant_ownership_and_rls.sql"),
    read("components/brand-context-cards.tsx"),
  ]);
  assert.match(migration, /status IN \('active','suspended','inactive'\)/);
  assert.doesNotMatch(card, /standby|archived|archive/i);
  assert.match(card, /dependem de contrato próprio/);
});

test("rotas editoriais permanecem fora da árvore da Agência", async () => {
  const [brandPage, agencyPage] = await Promise.all([
    read("app/(brand)/[brandRef]/page.tsx"),
    read("app/(agency)/agencias/[agencyRef]/marcas/page.tsx"),
  ]);
  assert.match(brandPage, /MarcaPageEntry/);
  assert.match(agencyPage, /AgencyWorkspacePage/);
  assert.doesNotMatch(agencyPage, /brandRef.*minerador|agenciaRef.*arquiteto/);
});
