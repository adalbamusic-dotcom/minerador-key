import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("helper legado de generateLink mantém confirmação SSR sanitizada, mas não é usado no convite novo", async () => {
  const [helper, confirm, callback, adminRoute, onboardingRoute, signup] = await Promise.all([
    read("lib/server/supabase-auth-links.ts"),
    read("app/auth/confirm/route.ts"),
    read("app/auth/callback/route.ts"),
    read("app/api/admin/agencies/route.ts"),
    read("app/api/onboarding/agency/route.ts"),
    read("app/cadastro/page.tsx"),
  ]);
  assert.match(helper, /hashed_token/);
  assert.match(confirm, /verifyOtp\(\{ token_hash: tokenHash, type \}\)/);
  assert.match(confirm, /safeAuthRedirect/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.doesNotMatch(adminRoute + onboardingRoute + signup, /generateSupabaseAuthLink|confirmationLink/);
  assert.doesNotMatch(confirm, /console\.(log|info|error)/);
});

test("callbacks não aceitam destino externo nem tipo Auth arbitrário", async () => {
  const [helper, confirm] = await Promise.all([read("lib/server/supabase-auth-links.ts"), read("app/auth/confirm/route.ts")]);
  assert.match(helper, /safeAuthRedirect\(next\)/);
  assert.match(confirm, /allowedTypes/);
  assert.match(confirm, /value as AllowedVerificationType/);
  assert.match(confirm, /safeAuthRedirect\(request\.nextUrl\.searchParams\.get\("next"\)\)/);
});
