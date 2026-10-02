import assert from "node:assert/strict";
import test from "node:test";
import { radarSeoGuidelineState } from "../lib/radar/seo-guidelines.ts";

test("o placar SEO converte as verificações em pilares e tira da média o que não se aplica", () => {
  const placar = radarSeoGuidelineState([
    { id: "research", state: "READY", detail: "SERP lida nas 4 lentes." },
    { id: "model", state: "PARTIAL", detail: "Metade dos conceitos." },
    { id: "sources", state: "PENDING", detail: "Sem fonte conferida." },
    { id: "videos", state: "NOT_REQUIRED", detail: "A SERP não pede vídeo." },
    { id: "frozen", state: "READY", detail: "Não é pilar SEO." },
  ]);
  assert.deepEqual(placar.pillars.map(pilar => [pilar.id, pilar.percent]), [["research", 100], ["model", 50], ["sources", 0], ["videos", null]]);
  assert.equal(placar.overall, 50);
  assert.match(placar.pillars[0].guideline, /Google/);
});

test("parecer do especialista aceito conta como E-E-A-T atendido, mesmo sem ponto de revisão", () => {
  const checks = [{ id: "specialist", state: "NOT_REQUIRED" as const, detail: "Nenhum ponto de revisão foi criado." }];
  assert.equal(radarSeoGuidelineState(checks).pillars[0].percent, null);
  const comParecer = radarSeoGuidelineState(checks, { specialistAccepted: 1 });
  assert.equal(comParecer.pillars[0].percent, 100);
  assert.match(comParecer.pillars[0].detail, /1 parecer\(es\) do especialista aceito/);
  assert.equal(comParecer.overall, 100);
});

test("sem pilar aplicável o placar não inventa nota", () => {
  assert.equal(radarSeoGuidelineState([{ id: "videos", state: "NOT_REQUIRED", detail: "" }]).overall, null);
  assert.equal(radarSeoGuidelineState([]).overall, null);
});
