import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("context APIs are private and server-authoritative", async () => {
  const route = await read("app/api/contexts/route.ts");
  const authorization = await read("lib/server/canonical-authorization.ts");
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(route, /listCanonicalAccessibleBrands\("marca"\)/);
  assert.match(route, /listCanonicalAccessibleAgencies/);
  assert.doesNotMatch(route, /localStorage|indexedDB/i);
  assert.match(authorization, /requireSupabaseUser\(\)/);
  assert.match(authorization, /member_user_id/);
  assert.match(authorization, /owner_user_id/);
  assert.doesNotMatch(authorization, /localStorage|indexedDB|agency_brands.*editorial/i);
});

test("agency access does not imply brand access", () => {
  const contextForActor = (hasBrandOwnerOrMembership: boolean) => ({
    agencies: 1,
    brands: hasBrandOwnerOrMembership ? 1 : 0,
  });
  assert.deepEqual(contextForActor(false), { agencies: 1, brands: 0 });
});

test("client context state is invalidated when the Supabase actor changes", async () => {
  const brandContext = await read("components/brand-context.tsx");
  const shell = await read("components/product-shell.tsx");
  const visualContext = await read("components/shell-visual-context.tsx");
  const providers = await read("components/providers.tsx");
  const selector = await read("app/selecionar-marca/select-brand-client.tsx");
  assert.match(brandContext, /refreshGeneration/);
  assert.match(brandContext, /setBrands\(\[\]\)/);
  assert.match(brandContext, /fetch\("\/api\/marcas\?scope=operational", \{ cache: "no-store" \}\)/);
  assert.match(brandContext, /\[sessionStatus, session\?\.user\?\.id\]/);
  assert.match(shell, /fetch\("\/api\/contexts", \{ cache: "no-store" \}\)/);
  assert.match(shell, /\[actorUserId\]/);
  assert.match(shell, /useShellVisual/);
  assert.match(visualContext, /readShellExpandedPreference/);
  assert.match(visualContext, /writeShellExpandedPreference/);
  assert.match(providers, /ShellVisualProvider/);
  assert.match(selector, /fetch\("\/api\/contexts", \{ cache: "no-store" \}\)/);
  assert.match(selector, /\[session\?\.user\.id\]/);
  assert.doesNotMatch(selector, /localStorage|indexedDB/i);
});

test("context labels use UTF-8 text rather than literal unicode escapes", async () => {
  const selector = await read("app/selecionar-marca/select-brand-client.tsx");
  const cards = await read("components/brand-context-cards.tsx");
  const agencyWorkspace = await read("modules/conta/agency-workspace-page.tsx");
  assert.doesNotMatch(selector, /\\u00/);
  assert.doesNotMatch(cards, /\\u00/);
  assert.doesNotMatch(agencyWorkspace, /\\u00/);
});

test("session identity changes invalidate client state and keep local recovery actor-scoped", async () => {
  const sessionContext = await read("components/auth/supabase-session-context.tsx");
  const pipeline = await read("components/editorial-pipeline-context.tsx");
  const contracts = await read("lib/editorial/persistence-contracts.ts");
  const writer = await read("components/editorial/professional-writer.tsx");
  assert.match(sessionContext, /sessionEpoch/);
  assert.match(sessionContext, /actorUserId/);
  assert.match(sessionContext, /setSession\(null\)/);
  assert.match(pipeline, /workspaceKey/);
  assert.match(pipeline, /workflowRecoveryStorageKey\(actorUserId, selectedBrandId\)/);
  assert.match(contracts, /workflow-recovery:\$\{actorUserId\}:\$\{brandId\}/);
  assert.match(writer, /document-recovery:\$\{actorUserId\}:\$\{selectedBrandId\}/);
  assert.doesNotMatch(pipeline, /workflowRecoveryStorageKey\(selectedBrandId\)/);
});

test("session slots use host isolation and never carry an identity", async () => {
  const slots = await read("lib/auth/session-slot.ts");
  const route = await read("app/auth/new-slot/route.ts");
  const browser = await read("lib/supabase/browser-client.ts");
  assert.match(slots, /SLOT_PREFIX\}\$\{slotId\}\.localhost/);
  assert.match(slots, /SESSION_SLOT_ROOT_DOMAIN/);
  assert.match(route, /safeAuthRedirect/);
  assert.doesNotMatch(route, /cookie|token|userId|localStorage|indexedDB/i);
  assert.doesNotMatch(browser, /domain\s*:/i);
});
