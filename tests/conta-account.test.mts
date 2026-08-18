import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  accountRoleLabel,
  canManageTeam,
  hasPermission,
  resolveAccountAccessOrigin,
  type AccountTenantAccess,
} from "../modules/conta/account-access.ts";

const access = (overrides: Partial<AccountTenantAccess> = {}): AccountTenantAccess => ({
  brandId: "11111111-1111-4111-8111-111111111111",
  brandName: "Adalba",
  actorUserId: "22222222-2222-4222-8222-222222222222",
  actorRole: "reader",
  permissions: ["minerador:view"],
  isGlobalAdmin: false,
  ...overrides,
});

test("Conta identifica owner sem transformar a propriedade em tenant", () => {
  const current = access({ actorRole: "owner", ownerUserId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(resolveAccountAccessOrigin(current), "owner");
  assert.equal(current.brandId, "11111111-1111-4111-8111-111111111111");
  assert.notEqual(current.ownerUserId, current.brandId);
});

test("Conta mostra membership e permissões parciais do ator atual", () => {
  const current = access({ actorRole: "editor", permissions: ["minerador:view", "minerador:edit"] });
  assert.equal(resolveAccountAccessOrigin(current), "membership");
  assert.equal(hasPermission(current, "minerador", "view"), true);
  assert.equal(hasPermission(current, "minerador", "edit"), true);
  assert.equal(hasPermission(current, "minerador", "approve"), false);
  assert.equal(hasPermission(current, "radar", "view"), false);
  assert.equal(canManageTeam(current), false);
});

test("Admin global recebe acesso global, mas não vira owner", () => {
  const current = access({ isGlobalAdmin: true, actorRole: "brand_admin", ownerUserId: "33333333-3333-4333-8333-333333333333", permissions: [] });
  assert.equal(resolveAccountAccessOrigin(current), "global_admin");
  assert.equal(accountRoleLabel(current), "Admin global");
  assert.equal(canManageTeam(current), true);
  assert.equal(hasPermission(current, "radar", "approve"), true);
  assert.notEqual(current.actorUserId, current.ownerUserId);
});

test("Conta só habilita gestão de equipe quando a permissão real existe", () => {
  assert.equal(canManageTeam(access({ permissions: ["marca:view", "marca:manage"] })), true);
  assert.equal(canManageTeam(access({ permissions: ["marca:view"] })), false);
});

test("Conta humaniza os papéis sem alterar seu significado", () => {
  assert.equal(accountRoleLabel(access({ actorRole: "owner" })), "Owner");
  assert.equal(accountRoleLabel(access({ actorRole: "editor" })), "Editor");
  assert.equal(accountRoleLabel(access({ actorRole: "reader" })), "Leitor");
});

test("A página não cria persistência falsa nem altera o contrato compartilhado de senha", async () => {
  const source = await readFile(new URL("../modules/conta/account-page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/(brand)/[brandRef]/conta/page.tsx", import.meta.url), "utf8");
  const personalRoute = await readFile(new URL("../app/(personal)/conta/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Perfil pessoal/);
  assert.match(source, /Senha e segurança/);
  assert.match(source, /Seu acesso nesta marca/);
  assert.match(source, /Preferências/);
  assert.match(source, /Ver permissões detalhadas/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /sticky left-0/);
  assert.doesNotMatch(source, /ponte NextAuth/);
  assert.doesNotMatch(source, /Supabase Auth/);
  assert.doesNotMatch(source, />Sim</);
  assert.doesNotMatch(source, />Não</);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /onSubmit/);
  assert.doesNotMatch(source, /ownerUserId/);
  assert.match(route, /redirect\("\/conta"\)/);
  assert.match(personalRoute, /PersonalAccountPage identity=\{account\.identity\}/);
});
