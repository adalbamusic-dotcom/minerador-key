import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  EXPERT_CONTRIBUTION_FIXTURE,
  EXPERT_CONTRIBUTION_STATUS_LABEL,
  countSelectedExpertEvidence,
  moveExpertQuestion,
  resetExpertQuestions,
} from "../modules/radar/expert-contribution-fixture.ts";

test("fixture do especialista é local, reconhecível e ligada ao contexto editorial", () => {
  assert.match(EXPERT_CONTRIBUTION_FIXTURE.expert.id, /^expert-fixture-/);
  assert.equal(EXPERT_CONTRIBUTION_FIXTURE.questions.length, 4);
  assert.equal(EXPERT_CONTRIBUTION_FIXTURE.contributions.length, 5);
  assert.equal(EXPERT_CONTRIBUTION_FIXTURE.evidence.every(item => item.id.startsWith("expert-evidence-fixture-")), true);
  assert.equal(EXPERT_CONTRIBUTION_FIXTURE.transcript.source, "Áudio 1");
});

test("perguntas podem ser reordenadas e restauradas sem mutar a fixture", () => {
  const original = resetExpertQuestions();
  const moved = moveExpertQuestion(original, original[1].id, -1);
  assert.equal(moved[0].id, original[1].id);
  assert.equal(moved[1].id, original[0].id);
  assert.equal(original[0].id, EXPERT_CONTRIBUTION_FIXTURE.questions[0].id);
  assert.deepEqual(resetExpertQuestions(), EXPERT_CONTRIBUTION_FIXTURE.questions);
});

test("decisões locais contam apenas evidências selecionadas e preservam pendências", () => {
  assert.equal(countSelectedExpertEvidence({ first: "main", second: "support", third: "quote", fourth: "exclude", fifth: "pending" }), 3);
  assert.equal(EXPERT_CONTRIBUTION_STATUS_LABEL.awaiting_review, "Aguardando revisão");
});

test("o painel explicita as camadas original, transcrição, organização e simulação", async () => {
  const source = await readFile(new URL("../modules/radar/expert-contribution-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /Transcrição fiel/);
  assert.match(source, /Organização da contribuição/);
  assert.match(source, /Fala original/);
  assert.match(source, /Envio simulado/);
  assert.match(source, /Nenhuma mensagem externa foi enviada/);
  assert.match(source, /Trecho literal/);
  assert.doesNotMatch(source, /fetch\(/);
});
