import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("PasswordField alterna visibilidade sem submeter o formulario", async () => {
  const source = await read("components/auth/password-field.tsx");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /type=\{visible \? "text" : "password"\}/);
  assert.match(source, /type="button"/);
  assert.match(source, /aria-pressed=\{visible\}/);
  assert.match(source, /aria-label=\{visible \? "Ocultar senha" : "Mostrar senha"\}/);
  assert.match(source, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(source, /focus-visible:ring/);
  assert.match(source, /disabled=\{disabled\}/);
  assert.match(source, /EyeOff/);
  assert.match(source, /Eye/);
});

test("login e cadastro usam controles independentes com autocomplete correto", async () => {
  const login = await read("app/login/page.tsx");
  const signup = await read("app/cadastro/page.tsx");
  assert.match(login, /<PasswordField/);
  assert.match(login, /autoComplete="current-password"/);
  assert.doesNotMatch(login, /<input[\s\S]{0,120}type="password"/);
  assert.equal((signup.match(/<PasswordField/g) || []).length, 2);
  assert.match(signup, /id="signup-password"/);
  assert.match(signup, /id="signup-password-confirmation"/);
  assert.equal((signup.match(/autoComplete="new-password"/g) || []).length, 2);
  assert.doesNotMatch(signup, /<input[\s\S]{0,120}type="password"/);
});

test("fluxo de cadastro continua separado de tenant e membership", async () => {
  const route = await read("app/api/auth/signup/route.ts");
  const docs = await read("docs/compartilhado/autenticacao-manual.md");
  assert.doesNotMatch(route, /brand_memberships|marcas|perfis/);
  assert.match(route, /auth\/v1\/signup/);
  assert.match(docs, /cria somente a identidade Auth/);
  assert.match(docs, /não cria marca, membership/);
  assert.match(docs, /login Google está suspenso/);
});
