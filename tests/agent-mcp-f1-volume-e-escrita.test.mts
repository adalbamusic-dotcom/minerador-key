import assert from "node:assert/strict";
import test from "node:test";
import { projectVolumeResultForAgent, sliceWritingCsv, VOLUME_MEASURE_MAX_KEYWORDS } from "../lib/agent/platform-tool-projections.ts";

/*
 * SDD MCP ponta a ponta · F1 (2026-09-30): Volume e "Para escrever" pelo MCP.
 * O núcleo do Volume (lib/server/minerador-volume-measure.ts) é exercido com o
 * Google Ads e o banco simulados em tests/agent-mcp-f1-volume-nucleo.test.mts.
 */

test("recorte do Volume: falhas primeiro, sem média depois, medidas por último; o que não cabe vai em trimmed", () => {
  const outcomes = [
    { keywordId: "a", keyword: "como captar clientes", outcome: "confirmed" as const, volume: 390 },
    { keywordId: "b", keyword: "captação sem volume", outcome: "empty" as const, volume: null, reason: "sem média" },
    { keywordId: "c", keyword: "falhou", outcome: "failed" as const, volume: null, reason: "O limite temporário da Google Ads API foi atingido." },
  ];
  const cheio = projectVolumeResultForAgent({ requested: 3, measured: 1, withoutAverage: 1, failed: 1, quotaReached: true, stoppedReason: "cota", outcomes }, 32_000);
  assert.deepEqual(cheio.keywords.map(k => k.outcome), ["falhou", "sem_media", "medida"]);
  assert.equal((cheio.keywords[2] as { volume?: number }).volume, 390);
  assert.equal("trimmed" in cheio, false);
  const muitas = Array.from({ length: VOLUME_MEASURE_MAX_KEYWORDS }, (_, i) => ({ keywordId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, keyword: `keyword longa de teste número ${i}`, outcome: "confirmed" as const, volume: i }));
  const cortado = projectVolumeResultForAgent({ requested: muitas.length, measured: muitas.length, withoutAverage: 0, failed: 0, quotaReached: false, stoppedReason: null, outcomes: muitas }, 8_000);
  assert.ok(new TextEncoder().encode(JSON.stringify(cortado)).length <= 8_000);
  assert.ok(cortado.trimmed && cortado.trimmed.dropped > 0 && cortado.trimmed.kept + cortado.trimmed.dropped === muitas.length);
});

test("CSV 'Para escrever' em partes: juntas na ordem, voltam byte a byte", () => {
  const csv = Array.from({ length: 3000 }, (_, i) => `"linha ${i}","SERP; lente desktop-windows","ção"`).join("\r\n");
  const primeira = sliceWritingCsv(csv, 1, 12_000);
  assert.ok(primeira.parts > 1);
  let junto = "";
  for (let part = 1; part <= primeira.parts; part++) {
    const fatia = sliceWritingCsv(csv, part, 12_000);
    assert.equal(fatia.complete, part === primeira.parts);
    junto += fatia.csv;
  }
  assert.equal(junto, csv);
  assert.equal(sliceWritingCsv(csv, 999, 12_000).part, primeira.parts, "parte além do fim volta a última");
  assert.equal(sliceWritingCsv("", 1, 12_000).parts, 1);
});
