import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Conta pessoal e agencyRef estrito continuam separados do tenant editorial", async () => {
  const [personal, legacyAccount, server, workspace, cards] = await Promise.all([
    read("app/(personal)/conta/page.tsx"), read("app/(brand)/[brandRef]/conta/page.tsx"), read("lib/server/canonical-authorization.ts"), read("modules/conta/agency-workspace-page.tsx"), read("components/brand-context-cards.tsx"),
  ]);
  assert.match(personal, /getCanonicalPersonalAccount/);
  assert.match(legacyAccount, /redirect\("\/conta"\)/);
  assert.match(server, /requireSupabaseUser/);
  assert.match(server, /resolveStrictAgencyRef/);
  assert.match(cards, /Sem acesso editorial individual/);
  assert.doesNotMatch(server, /ADMIN_EMAIL|user_key|\.email|localStorage|first agency/i);
});

test("workspace lista somente contextos confirmados e não inicia provider pago", async () => {
  const [frame, layout, workspace] = await Promise.all([
    read("components/workspace-frame.tsx"), read("app/(agency)/agencias/[agencyRef]/layout.tsx"), read("modules/conta/agency-workspace-page.tsx"),
  ]);
  assert.match(frame, /Minha Agência/);
  assert.match(frame, /ProductShell/);
  assert.doesNotMatch(frame, /Marcas disponíveis/);
  assert.match(layout, /Nenhum outro contexto será escolhido automaticamente/);
  assert.doesNotMatch(workspace, /dataforseo|serper|SUPABASE_SERVICE_ROLE_KEY/i);
});
