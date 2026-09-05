import assert from "node:assert/strict";
import test from "node:test";
import { shouldWaitForRadarBrandBootstrap } from "../lib/arquiteto/f5-integrity.ts";

test("Radar aguarda bootstrap quando o brandId canônico existe e o snapshot ainda não chegou", () => {
  assert.equal(shouldWaitForRadarBrandBootstrap({ selectedBrandId: "brand-1", profileLoading: false, pipelineLoading: false, hasSnapshot: false, error: null }), true);
});

test("Radar não inventa marca quando o bootstrap termina com erro", () => {
  assert.equal(shouldWaitForRadarBrandBootstrap({ selectedBrandId: "brand-1", profileLoading: false, pipelineLoading: false, hasSnapshot: false, error: "Marca não encontrada." }), false);
});
