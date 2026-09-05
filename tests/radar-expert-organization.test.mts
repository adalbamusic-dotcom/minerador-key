import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarExpertOrganizationPrompt, RadarExpertOrganizationSchema, validateRadarExpertOrganization } from "../lib/radar/expert-organization.ts";

test("organização do especialista exige contrato revisável e citações presentes na transcrição", () => {
  const transcript = "Na prática, começo pela avaliação da intenção e registro uma ressalva.";
  const organization = RadarExpertOrganizationSchema.parse({ organizedText: "Avaliação da intenção antes da execução.", points: ["Avaliar intenção"], classifications: ["processo", "ressalva"], relatedQuestion: "Como você começa?", literalQuotes: ["registro uma ressalva"] });
  assert.equal(validateRadarExpertOrganization({ transcript, organization }).organizedText, "Avaliação da intenção antes da execução.");
  assert.throws(() => validateRadarExpertOrganization({ transcript, organization: { ...organization, literalQuotes: ["frase inventada"] } }), /QUOTE_NOT_FOUND/);
});

test("prompt de organização mantém a transcrição como entrada separada", () => {
  const prompt = buildRadarExpertOrganizationPrompt({ briefTitle: "Pauta", questions: [{ text: "Pergunta" }], radarContext: { principal: "tema" }, transcript: "fala original" });
  const parsed = JSON.parse(prompt) as Record<string, unknown>;
  assert.equal(parsed.transcript, "fala original");
  assert.equal(parsed.briefTitle, "Pauta");
});
