import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("login encaminha o callback tokenizado para o cadastro de convite", async () => {
  const login = await read("app/login/page.tsx");
  const cadastro = await read("app/cadastro/page.tsx");
  assert.match(login, /agencyInviteTokenFromPath\(callbackUrl\)/);
  assert.match(login, /inviteToken=\$\{encodeURIComponent\(inviteToken\)\}/);
  assert.match(login, /Criar conta para aceitar convite/);
  assert.match(cadastro, /callbackInviteToken = agencyInviteTokenFromPath\(callbackUrl\)/);
  assert.match(cadastro, /const inviteToken = explicitInviteToken \|\| callbackInviteToken \|\| ""/);
  assert.match(cadastro, /Este e-mail pertence ao convite e não pode ser alterado/);
  assert.match(cadastro, /invited-signup/);
});
