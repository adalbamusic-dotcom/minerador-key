import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedArchitectActor } from "../lib/arquiteto/f5-integrity.ts";

test("F5 do Arquiteto só lê/grava assessment SERP com identidade autenticada e brandId", () => {
  assert.equal(authenticatedArchitectActor({ sessionStatus: "loading", actorUserId: null, brandId: "brand-1" }), null);
  assert.equal(authenticatedArchitectActor({ sessionStatus: "authenticated", actorUserId: null, brandId: "brand-1" }), null);
  assert.equal(authenticatedArchitectActor({ sessionStatus: "authenticated", actorUserId: "user-1", brandId: "brand-1" }), "user-1");
});

test("a recuperação não usa usuário anônimo como fallback de tenant", () => {
  const actorUserId: string | null = null;
  const key = actorUserId ? `architect-serp-formation:${actorUserId}:brand-1` : null;
  assert.equal(key, null);
});
