import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractIntentNicheClassification } from "../lib/minerador/intent-niche-response.ts";

test("aceita o contrato canônico de intenção e nicho", () => {
  assert.deepEqual(extractIntentNicheClassification({ intent: "Vendas", nicho: "Marketing" }), { intent: "Vendas", nicho: "Marketing" });
});

test("normaliza aliases e objeto de classificação sem inventar valores", () => {
  assert.deepEqual(extractIntentNicheClassification({ classification: { intencao: "Comercial", niche: "Saúde" } }), { intent: "Comercial", nicho: "Saúde" });
});

test("rejeita resposta sem os dois valores utilizáveis", () => {
  assert.equal(extractIntentNicheClassification({ intent: "Informativo" }), null);
});

test("endpoint e interface preservam a operação legada sem confundi-la com a revisão R5", async () => {
  const route = await readFile(new URL("../app/api/process-intent-niche/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(route, /extractIntentNicheClassification/);
  assert.match(workspace, /const handleBatchSemanticReview = async \(\) =>/);
  assert.match(workspace, /resolveSemanticReviewNotice/);
  assert.match(workspace, /mode: "semantic_review"/);
  assert.match(workspace, /fetch\("\/api\/analyze"/);
});
