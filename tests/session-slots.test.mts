import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSessionSlotOrigin, parseSessionSlotHost, sessionSlotBaseHostname } from "../lib/auth/session-slot.ts";

test("local session slots have independent host origins", () => {
  assert.equal(parseSessionSlotHost("s-account-a.localhost"), "account-a");
  assert.equal(sessionSlotBaseHostname("s-account-a.localhost"), "localhost");
  assert.equal(buildSessionSlotOrigin("http://localhost:3000/login", "account-b"), "http://s-account-b.localhost:3000");
  assert.equal(parseSessionSlotHost("localhost"), null);
});

test("session slot identifiers reject unsafe host labels", () => {
  assert.throws(() => buildSessionSlotOrigin("http://localhost:3000", "../other"));
  assert.throws(() => buildSessionSlotOrigin("http://localhost:3000", "A B"));
});
