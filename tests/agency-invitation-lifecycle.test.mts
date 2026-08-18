import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENCY_INVITATION_DURATION_DAYS,
  canonicalAgencyInvitationExpiry,
  classifyAgencyInvitationRenewal,
} from "../lib/server/agency-invitation-lifecycle.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const now = new Date("2026-08-10T12:00:00.000Z");

test("convite PENDING dentro da política reutiliza o mesmo invitation", () => {
  assert.equal(classifyAgencyInvitationRenewal({ status: "PENDING", expiresAt: "2026-08-13T12:00:00.000Z", now }), "REUSE_CURRENT_INVITATION");
});

test("expirado, revogado ou aceito exige sucessor", () => {
  for (const status of ["EXPIRED", "REVOKED", "ACCEPTED"]) {
    assert.equal(classifyAgencyInvitationRenewal({ status, expiresAt: "2026-08-13T12:00:00.000Z", now }), "CREATE_SUCCESSOR_INVITATION");
  }
  assert.equal(classifyAgencyInvitationRenewal({ status: "PENDING", expiresAt: "2026-08-09T12:00:00.000Z", now }), "CREATE_SUCCESSOR_INVITATION");
});

test("validade legada além de sete dias é incompatível e não é corrigida no registro antigo", () => {
  assert.equal(AGENCY_INVITATION_DURATION_DAYS, 7);
  assert.equal(classifyAgencyInvitationRenewal({ status: "PENDING", expiresAt: "2026-12-13T00:00:00.000Z", now }), "CREATE_SUCCESSOR_INVITATION");
  assert.equal(canonicalAgencyInvitationExpiry(now), "2026-08-17T12:00:00.000Z");
});

test("o contrato atual bloqueia sucessor até revisão do schema, sem apagar ou editar o legado", async () => {
  const [service, migration] = await Promise.all([
    read("lib/server/agency-onboarding.ts"),
    read("supabase/migrations/0018_agency_onboarding.sql"),
  ]);
  assert.match(service, /SCHEMA_0023_NOT_APPLIED/);
  assert.match(service, /classifyAgencyInvitationRenewal/);
  assert.match(migration, /application_id uuid UNIQUE REFERENCES public\.agency_applications/);
  assert.doesNotMatch(service, /update\(\{[^}]*expires_at[^}]*\}\).*SUCCESSOR/);
  assert.doesNotMatch(service, /delete\(\).*agency_invitations/);
});
