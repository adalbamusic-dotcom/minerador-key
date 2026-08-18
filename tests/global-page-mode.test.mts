import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("R2.9 mantém o contrato compartilhado de Page Mode", async () => {
  const [topbar, controls] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("components/global-topbar-control.ts"),
  ]);

  assert.match(topbar, /GlobalTopbarPageControls/);
  assert.match(topbar, /title: "Perfil"/);
  assert.match(topbar, /data-topbar-page-tabs/);
  assert.match(topbar, /overflow-x-auto xl:overflow-visible/);
  assert.match(topbar, /model\.mode === "page" \? "pointer-events-none"/);
  assert.match(topbar, /pointer-events-auto w-fit/);
  assert.doesNotMatch(topbar, /pageTabs \|\| <span/);
  assert.match(controls, /GLOBAL_TOPBAR_PAGE_TAB/);
  assert.match(controls, /GLOBAL_TOPBAR_PAGE_TAB_ACTIVE/);
  assert.match(controls, /hover:border-module-accent/);
  assert.doesNotMatch(controls, /purple|violet|indigo/i);
});

test("Perfil preserva o conteúdo e as páginas registram as abas no shell global", async () => {
  const [personal, agencyWorkspace, brand, brandEntry, workspace, admin, adminOverview, agencies] = await Promise.all([
    read("modules/conta/personal-account-page.tsx"),
    read("modules/conta/agency-workspace-page.tsx"),
    read("modules/marca/brand-page.tsx"),
    read("modules/marca/marca-page-entry.tsx"),
    read("components/workspace-frame.tsx"),
    read("modules/admin/admin-console.tsx"),
    read("modules/admin/admin-overview-page.tsx"),
    read("modules/admin/agencies-admin-panel.tsx"),
  ]);

  assert.match(personal, /Sua identidade e seus contextos/);
  assert.doesNotMatch(personal, /Conta pessoal/);
  assert.doesNotMatch(agencyWorkspace, /<p className="text-sm font-medium text-accent">Minha Agência/);
  assert.match(brand, /GlobalTopbarPageControls/);
  assert.match(brandEntry, /GlobalTopbarPageControls/);
  for (const label of ["Visão geral", "Site e Sitemap", "BrandDNA", "Materiais", "Skills e prompts", "Equipe", "Configurações"]) {
    assert.match(`${brand}\n${brandEntry}`, new RegExp(label));
  }
  assert.doesNotMatch(brand, /ModuleHeader/);
  assert.doesNotMatch(brandEntry, /ModuleHeader/);

  assert.match(workspace, /GlobalTopbarPageControls/);
  for (const label of ["Visão geral", "Membros", "Marcas", "Configurações"]) assert.match(workspace, new RegExp(label));
  assert.doesNotMatch(workspace, /function AgencyTabs/);

  assert.match(admin, /GlobalTopbarPageControls tabs=\{pageTabs\} actions=\{pageActions\}/);
  for (const label of ["Visão geral", "Marcas", "Agências", "Usuários e acessos", "Planos", "Consumo", "Configurações", "Integrações"]) assert.match(admin, new RegExp(label));
  assert.match(admin, /tab === "visao-geral"/);
  assert.doesNotMatch(admin, /data-admin-page-tabs/);
  assert.doesNotMatch(adminOverview, /ModuleHeader/);
  assert.match(adminOverview, /Controle da plataforma/);
  assert.match(agencies, /GlobalTopbarPageControls actions=\{pageAction\}/);
});

test("R2.9 não recria abas locais estruturais nem altera backend", async () => {
  const [brand, entry, workspace, admin, account] = await Promise.all([
    read("modules/marca/brand-page.tsx"),
    read("modules/marca/marca-page-entry.tsx"),
    read("components/workspace-frame.tsx"),
    read("modules/admin/admin-console.tsx"),
    read("modules/conta/personal-account-page.tsx"),
  ]);

  assert.doesNotMatch(brand, /<nav[^>]+border-b/);
  assert.doesNotMatch(entry, /<nav[^>]+border-b/);
  assert.doesNotMatch(workspace, /border-b border-foreground/);
  assert.doesNotMatch(admin, /overflow-x-auto/);
});
