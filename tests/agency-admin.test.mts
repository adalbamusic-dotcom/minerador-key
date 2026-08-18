import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminPath } from "../lib/admin-routing.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Admin global acompanha agências e inicia convite, sem criação operacional direta", async () => {
  const [routing, consoleSource, agencies, brands, agencyRoute, brandRoute] = await Promise.all([
    read("lib/admin-routing.ts"), read("modules/admin/admin-console.tsx"), read("modules/admin/agencies-admin-panel.tsx"), read("modules/admin/brands-admin-panel.tsx"), read("app/api/admin/agencies/route.ts"), read("app/api/marcas/route.ts"),
  ]);
  assert.equal(buildAdminPath("agencias"), "/admin?tab=agencias");
  assert.match(routing, /"agencias"/);
  assert.match(consoleSource, /AgenciesAdminPanel/);
  assert.match(agencies, /Convidar agência/);
  assert.doesNotMatch(agencies, /Nova agência/);
  assert.doesNotMatch(brands, /Nova marca/);
  assert.match(agencyRoute, /AGENCY_DIRECT_CREATE_RETIRED/);
  assert.doesNotMatch(agencyRoute, /createAdminAgency/);
  assert.match(agencies, /Criar convite/);
  assert.match(brandRoute, /BRAND_DIRECT_CREATE_RETIRED/);
});

test("convite é criado exclusivamente pelo Admin canônico e a entrega permanece não configurada", async () => {
  const [route, service, migration, messages, communication] = await Promise.all([
    read("app/api/admin/agency-invitations/route.ts"), read("lib/server/agency-onboarding.ts"), read("supabase/migrations/0018_agency_onboarding.sql"), read("lib/server/communication/messages.ts"), read("lib/server/communication/service.ts"),
  ]);
  assert.match(route, /requireCanonicalPlatformAdmin/);
  assert.match(messages, /enqueue_communication_message/);
  assert.match(communication, /NOT_CONFIGURED/);
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /token text NOT NULL/);
});

test("onboarding não cria membership nem acesso editorial implícitos", async () => {
  const migration = await read("supabase/migrations/0018_agency_onboarding.sql");
  const functionBody = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.complete_agency_onboarding"));
  assert.match(functionBody, /owner_user_id/);
  assert.match(functionBody, /INSERT INTO public\.agencies/);
  assert.doesNotMatch(functionBody, /agency_memberships/);
  assert.doesNotMatch(functionBody, /brand_memberships/);
  assert.doesNotMatch(functionBody, /perfis/);
});

test("painel classifica solicitações, convites, ativações e acesso por seus contratos", async () => {
  const [panel, server] = await Promise.all([read("modules/admin/agencies-admin-panel.tsx"), read("lib/server/agency-admin.ts")]);
  assert.match(panel, /applications\.filter\(\(item\) => item\.status === "PENDING"\)/);
  assert.doesNotMatch(panel, /const pendingApplications = applications\.filter\([^\n]*APPROVED/);
  assert.match(panel, /invitation\.status !== "PENDING"/);
  assert.match(panel, /isFutureDate\(invitation\.expires_at\)/);
  assert.match(panel, /invitation\.source !== "ADMIN_INVITE" \|\| isFutureDate\(invitation\.access_expires_at\)/);
  assert.match(panel, /Ativação · \$\{invitation\.status\}/);
  assert.match(panel, /Convite administrativo · \$\{invitation\.status\}/);
  assert.doesNotMatch(panel, /Convite · \$\{item\.status\}/);
  assert.match(panel, /accessPeriodSummary\(agency\.accessPeriod\)/);
  assert.match(panel, /Válido até/);
  assert.match(server, /from\("agency_access_periods"\)/);
  assert.match(server, /accessPeriod: accessPeriodsByAgency\.get\(row\.id\) \|\| null/);
});
