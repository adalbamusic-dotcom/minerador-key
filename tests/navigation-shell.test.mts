import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const exists = async (path: string) => assert.doesNotReject(() => access(new URL(path, root)));

test("rotas canonicas obrigatorias possuem page ou route handler", async () => {
  await Promise.all([
    "app/login/page.tsx", "app/cadastro/page.tsx", "app/auth/callback/route.ts", "app/(personal)/conta/page.tsx",
    "app/(admin)/admin/page.tsx", "app/(admin)/admin/usuarios/page.tsx", "app/(admin)/admin/agencias/page.tsx", "app/(admin)/admin/marcas/page.tsx",
    "app/(agency)/agencias/[agencyRef]/page.tsx", "app/(agency)/agencias/[agencyRef]/membros/page.tsx", "app/(agency)/agencias/[agencyRef]/marcas/page.tsx", "app/(agency)/agencias/[agencyRef]/configuracoes/page.tsx",
    "app/(brand)/[brandRef]/page.tsx", "app/(brand)/[brandRef]/minerador/page.tsx", "app/(brand)/[brandRef]/arquiteto/page.tsx", "app/(brand)/[brandRef]/radar/page.tsx", "app/(brand)/[brandRef]/planejador/page.tsx", "app/(brand)/[brandRef]/redator/page.tsx", "app/(brand)/[brandRef]/publicacoes/page.tsx",
  ].map(exists));
});

test("admin subroutes reuse the guarded admin shell and the canonical tabs", async () => {
  const [layout, users, agencies, brands] = await Promise.all([
    read("app/(admin)/layout.tsx"), read("app/(admin)/admin/usuarios/page.tsx"), read("app/(admin)/admin/agencias/page.tsx"), read("app/(admin)/admin/marcas/page.tsx"),
  ]);
  assert.match(layout, /requireCanonicalPlatformAdmin/);
  assert.match(users, /buildAdminPath\("usuarios"\)/);
  assert.match(agencies, /buildAdminPath\("agencias"\)/);
  assert.match(brands, /buildAdminPath\("marcas"\)/);
});

test("brand account handoff is server-side and cannot loop", async () => {
  const handoff = await read("app/(brand)/[brandRef]/conta/page.tsx");
  assert.match(handoff, /redirect\("\/conta"\)/);
  assert.doesNotMatch(handoff, /requireTenantModule|ProductShell|router\./);
});

test("Conta pessoal nao passa pelo proxy de rotas tenant legadas", async () => {
  const [legacyRouting, personalRoute] = await Promise.all([
    read("lib/legacy-routing.ts"),
    read("app/(personal)/conta/page.tsx"),
  ]);
  assert.doesNotMatch(legacyRouting, /conta\s*:/);
  assert.match(personalRoute, /PersonalAccountPage/);
  assert.match(personalRoute, /getCanonicalPersonalAccount/);
});

test("navigation only targets existing canonical routes and has no local authorization fallback", async () => {
  const [shell, selection, context, restore, workspace] = await Promise.all([
    read("components/product-shell.tsx"),
    read("app/selecionar-marca/select-brand-client.tsx"),
    read("lib/navigation/global-context.ts"),
    read("app/api/contexts/restore/route.ts"),
    read("components/workspace-frame.tsx"),
  ]);
  assert.doesNotMatch(shell, /\/selecionar-marca\?continuar=/);
  assert.match(shell, /\/agencias\/\$\{operationalAgency\.agencyRef\}/);
  assert.match(shell, /switchTenantPath/);
  assert.doesNotMatch(shell, /localStorage|BRAND_ACCESS_DENIED/);
  assert.match(selection, /fetch\("\/api\/contexts"/);
  assert.doesNotMatch(selection, /router\.replace|localStorage|BRAND_ACCESS_DENIED/);
  assert.match(context, /GLOBAL_NAVIGATION_STORAGE_KEY/);
  assert.match(context, /server remains authoritative|servidor permanece autoritÃ¡rio|servidor continua sendo a autoridade/i);
  assert.match(restore, /listCanonicalAccessibleBrands/);
  assert.match(restore, /listCanonicalAccessibleAgencies/);
  assert.match(restore, /switchTenantPath/);
  assert.match(workspace, /NavegaÃ§Ã£o da Agency|Navegação da Agência/);
  assert.doesNotMatch(workspace, /Marcas disponÃ­veis/);
});

test("shell global reflowa no desktop e restaura somente contexto revalidado", async () => {
  const [shell, login, restore, context] = await Promise.all([
    read("components/product-shell.tsx"),
    read("app/login/page.tsx"),
    read("app/api/contexts/restore/route.ts"),
    read("lib/navigation/global-context.ts"),
  ]);
  assert.match(shell, /lg:grid/);
  assert.match(shell, /lg:grid-cols-\[15rem_minmax\(0,1fr\)\]/);
  assert.match(shell, /brandSelectorOpen/);
  assert.match(shell, /role="listbox"/);
  assert.match(login, /restoreLastGlobalNavigationContext/);
  assert.match(restore, /input\.brandId/);
  assert.match(restore, /input\.agencyId/);
  assert.match(context, /writeGlobalNavigationContext/);
  assert.doesNotMatch(context, /removeItem|clear\(\)/);
});

test("seletor global usa somente o escopo operacional e nao vaza catalogo do Admin", async () => {
  const [brandContext, marcasRoute, shell, personalRoute, personalPage, profileEditor, selectorPage, login, globalContext] = await Promise.all([
    read("components/brand-context.tsx"),
    read("app/api/marcas/route.ts"),
    read("components/product-shell.tsx"),
    read("app/(personal)/conta/page.tsx"),
    read("modules/conta/personal-account-page.tsx"),
    read("modules/conta/profile-identity-editor.tsx"),
    read("app/selecionar-marca/page.tsx"),
    read("app/login/page.tsx"),
    read("lib/navigation/global-context.ts"),
  ]);
  assert.match(brandContext, /fetch\("\/api\/marcas\?scope=operational"/);
  assert.match(marcasRoute, /searchParams\.get\("scope"\) === "operational"/);
  assert.match(marcasRoute, /listCanonicalAccessibleBrands\(operationalScope \? "marca" : undefined\)/);
  assert.match(marcasRoute, /access\.isPlatformAdmin && !operationalScope/);
  assert.match(shell, /setExpandedPreference\(true\);\s*setBrandSelectorOpen\(true\)/);
  assert.doesNotMatch(shell, /<Link href="\/"/);
  assert.match(shell, /<GlobalTopbar \/>/);
  assert.match(shell, /text-module-accent/);
  assert.match(shell, /absolute -right-5 top-1\/2/);
  assert.match(shell, /if \(!actorUserId \|\| profileLoading\) return/);
  assert.match(shell, /setBrandSelectorOpen\(false\);[\s\S]*setExpandedPreference\(!expanded\)/);
  assert.match(shell, /setExpandedPreference/);
  assert.match(shell, /useShellVisual/);
  assert.match(brandContext, /currentRouteContext/);
  assert.match(brandContext, /selectedOperationalBrandId/);
  assert.match(globalContext, /SHELL_EXPANDED_STORAGE_KEY/);
  assert.match(login, /requestedCallbackUrl/);
  assert.match(login, /userRole === "admin" \? "\/admin" : "\/conta"/);
  assert.match(personalRoute, /isPlatformAdmin=\{account\.isPlatformAdmin\}/);
  assert.match(personalPage, /identity\.image/);
  assert.match(personalPage, /recuperar-senha\?callbackUrl=%2Fconta/);
  assert.match(profileEditor, /Admin global/);
  assert.match(selectorPage, /destination = "\/conta"/);
  assert.match(selectorPage, /redirect\(destination\)/);
  assert.doesNotMatch(selectorPage, /Escolha onde deseja trabalhar|SelectBrandClient/);
});

test("R5 usa estado inicial server-readable e nao cria shift visual do shell", async () => {
  const [layout, visualContext, globalContext, brandContext, shell, serverHint] = await Promise.all([
    read("app/layout.tsx"),
    read("components/shell-visual-context.tsx"),
    read("lib/navigation/global-context.ts"),
    read("components/brand-context.tsx"),
    read("components/product-shell.tsx"),
    read("lib/server/shell-initial-state.ts"),
  ]);
  assert.match(layout, /await cookies\(\)/);
  assert.match(layout, /readShellExpandedCookie/);
  assert.match(layout, /getServerValidatedOperationalBrand/);
  assert.match(visualContext, /initialExpanded/);
  assert.match(visualContext, /initialOperationalBrand/);
  assert.match(globalContext, /SHELL_EXPANDED_COOKIE/);
  assert.match(globalContext, /SELECTED_OPERATIONAL_BRAND_COOKIE/);
  assert.match(brandContext, /initialOperationalBrand/);
  assert.match(brandContext, /writeSelectedOperationalBrandPreference/);
  assert.match(serverHint, /listCanonicalAccessibleBrands\("marca"\)/);
  assert.doesNotMatch(shell, /Contexto autorizado/);
  assert.match(shell, /Perfil/);
  assert.match(shell, /opacity-0[\s\S]*group-hover:opacity-100[\s\S]*focus-visible:opacity-100/);
  assert.match(shell, /availableBrands/);
});
