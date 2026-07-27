import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { consumeExtensionRateLimit, extensionRateLimitConfig } from "../lib/server/extension-rate-limit.ts";

test("rate limit local limita por usuário sem afetar outro usuário", () => {
  const now = Date.now();
  for (let i = 0; i < extensionRateLimitConfig.maxRequests; i += 1) {
    assert.equal(consumeExtensionRateLimit(`fixture-user-${i}`, now).allowed, true);
  }
  const user = "fixture-rate-limited-user";
  for (let i = 0; i < extensionRateLimitConfig.maxRequests; i += 1) assert.equal(consumeExtensionRateLimit(user, now).allowed, true);
  const blocked = consumeExtensionRateLimit(user, now);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(consumeExtensionRateLimit("fixture-other-user", now).allowed, true);
  assert.equal(consumeExtensionRateLimit(user, now + extensionRateLimitConfig.windowMs + 1).allowed, true);
});

test("popup não consulta diretamente marcas ou listas e não usa papel como escopo", async () => {
  const popup = await readFile(new URL("../minerador-extensao/popup.js", import.meta.url), "utf8");
  assert.equal(popup.includes("/rest/v1/marcas"), false);
  assert.equal(popup.includes("/rest/v1/listas_kgr"), false);
  assert.equal(popup.includes("profile.role === 'admin'"), false);
  assert.match(popup, /\/api\/extensao\/marcas/);
  assert.match(popup, /minerador_extension_preferences/);
});

test("endpoints preservam erros estruturados e não expõem token", async () => {
  const auth = await readFile(new URL("../lib/server/extension-auth.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("../lib/server/extension-api.ts", import.meta.url), "utf8");
  assert.match(auth, /authorization/);
  assert.match(auth, /auth\.getUser\(token\)/);
  assert.match(auth, /identity_not_linked/);
  assert.match(auth, /jwt\.\*expired/);
  assert.doesNotMatch(auth, /candidate\.status === 401/);
  assert.match(api, /requestId/);
  assert.match(api, /internal_error/);
  assert.match(api, /ok: false/);
  assert.match(api, /message/);
  assert.equal(api.includes("Authorization"), false);
  assert.equal(api.includes("access_token"), false);
});

test("mineração envia somente o tenant canônico confirmado", async () => {
  const background = await readFile(new URL("../minerador-extensao/background.js", import.meta.url), "utf8");
  assert.match(background, /item\.brand_id = marcaId/);
  assert.equal(background.includes("item.marca_id = marcaId"), false);
  assert.match(background, /lista_id=eq\.\$\{encodeURIComponent\(listaId\)\}&brand_id=eq/);
});
