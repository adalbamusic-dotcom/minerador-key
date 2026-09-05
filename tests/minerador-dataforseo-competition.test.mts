import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dataForSeoCompetitionStateLabel,
  dataForSeoHistoryValue,
  dataForSeoRecordValue,
  deriveDataForSeoCompetitionState,
  hasDataForSeoAllintitleEvidence,
  isValidDataForSeoAllintitleMeasurement,
  readDataForSeoAllintitleResult,
} from "../lib/minerador/dataforseo-competition.ts";

/**
 * R3 — Concorrência allintitle do DataForSEO.
 *
 * Arquivo reconstruído em 2026-08-28 sobre o comportamento real de
 * lib/minerador/dataforseo-competition.ts e do Perfil atual, depois de o
 * original ter sido perdido em uma edição automatizada. Os nomes dos casos
 * foram preservados; a asserção do Perfil foi reescrita sobre a estrutura
 * vigente (a anterior já apontava para blocos removidos em refatorações
 * anteriores).
 */

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

const validMeasurement = {
  provider: "dataforseo",
  providerVersion: "v3",
  resultsAllintitle: 320,
  measuredAt: "2026-08-28T10:02:00.000Z",
  operationRequestId: "11111111-1111-4111-8111-111111111111",
};

test("R3 aceita resultado allintitle positivo e zero real, mas não ausência", () => {
  assert.equal(isValidDataForSeoAllintitleMeasurement(validMeasurement), true);
  assert.equal(isValidDataForSeoAllintitleMeasurement({ ...validMeasurement, resultsAllintitle: 0 }), true, "zero é um resultado medido");
  assert.equal(readDataForSeoAllintitleResult({ ...validMeasurement, resultsAllintitle: 0 }), 0);

  // Ausência nunca vira zero.
  assert.equal(isValidDataForSeoAllintitleMeasurement({ ...validMeasurement, resultsAllintitle: null }), false);
  assert.equal(isValidDataForSeoAllintitleMeasurement({ ...validMeasurement, resultsAllintitle: undefined }), false);
  assert.equal(readDataForSeoAllintitleResult(null), null);
  assert.equal(readDataForSeoAllintitleResult({}), null);

  // Números impossíveis para uma contagem de resultados não são aceitos.
  for (const impossible of [-1, 2.5, "abc", NaN]) {
    assert.equal(isValidDataForSeoAllintitleMeasurement({ ...validMeasurement, resultsAllintitle: impossible }), false, `${String(impossible)} não é contagem`);
  }

  // A proveniência precisa ser do próprio provider e ter carimbo de tempo.
  assert.equal(isValidDataForSeoAllintitleMeasurement({ ...validMeasurement, provider: "google_ads" }), false);
  assert.equal(isValidDataForSeoAllintitleMeasurement({ ...validMeasurement, measuredAt: "ontem" }), false);
});

test("R3 distingue medição válida, falha posterior e projeção sem proveniência suficiente", () => {
  assert.equal(deriveDataForSeoCompetitionState({}), "not_measured");
  assert.equal(dataForSeoCompetitionStateLabel("not_measured"), "Não medido");

  assert.equal(deriveDataForSeoCompetitionState({ measurement: validMeasurement }), "valid");
  assert.equal(dataForSeoCompetitionStateLabel("valid"), "Medição válida");

  // Falha posterior preserva a medição anterior em vez de apagá-la.
  const afterFailure = deriveDataForSeoCompetitionState({
    measurement: validMeasurement,
    lastError: { errorCode: "dataforseo_timeout", failedAt: "2026-08-28T11:00:00.000Z" },
  });
  assert.equal(afterFailure, "last_attempt_failed_preserving_previous");
  assert.equal(dataForSeoCompetitionStateLabel(afterFailure), "Medição válida · última atualização falhou");

  // Status de falha na própria medição não vira medição válida.
  assert.equal(deriveDataForSeoCompetitionState({ measurement: { ...validMeasurement, status: "failed" }, result: 320 }), "unavailable");

  // Projeção numérica persistida sem proveniência completa continua visível, mas não é medição.
  assert.equal(deriveDataForSeoCompetitionState({ result: 320 }), "unavailable");
  assert.equal(dataForSeoCompetitionStateLabel("unavailable"), "Resultado indisponível");
  assert.equal(hasDataForSeoAllintitleEvidence({ result: 320 }), true);
  assert.equal(hasDataForSeoAllintitleEvidence({}), false);
});

test("R3 lê o read-model serializado sem reconstruir query e mantém histórico como detalhe", () => {
  const serialized = JSON.stringify(validMeasurement);
  assert.deepEqual(dataForSeoRecordValue(serialized), validMeasurement);
  assert.equal(isValidDataForSeoAllintitleMeasurement(serialized), true);
  assert.equal(readDataForSeoAllintitleResult(serialized), 320);
  assert.equal(dataForSeoRecordValue("não é json"), null);
  assert.equal(dataForSeoRecordValue([1, 2]), null);

  // A leitura nunca reconstrói a consulta técnica: ela só é lida quando persistida.
  const source = readFileSync(new URL("../lib/minerador/dataforseo-competition.ts", import.meta.url), "utf8");
  assert.ok(!source.includes("allintitle:"), "o read-model não remonta a query allintitle");
  assert.ok(!source.includes("fetch("), "o read-model não chama provider");

  // Histórico é detalhe: lista tolerante, nunca fonte do estado.
  assert.equal(dataForSeoHistoryValue(JSON.stringify([validMeasurement])).length, 1);
  assert.equal(dataForSeoHistoryValue([validMeasurement, "ruído", null]).length, 1);
  assert.deepEqual(dataForSeoHistoryValue("não é json"), []);
  assert.deepEqual(dataForSeoHistoryValue(undefined), []);
});

test("Perfil apresenta somente a evidência operacional do DataForSEO", () => {
  const technicalFields = panel.slice(panel.indexOf("Request ID Google Ads"), panel.indexOf("Último erro KD"));
  for (const label of [
    "Provider DataForSEO",
    "Endpoint DataForSEO",
    "Request ID DataForSEO",
    "Query técnica",
    "KD DataForSEO",
    "Sinal DataForSEO Labs",
    "Referring Domains médios",
    "Backlinks médios",
  ]) {
    assert.ok(technicalFields.includes(label), `a proveniência técnica mostra ${label}`);
  }
  // O sinal do Labs é evidência externa rotulada como sinal, nunca como Intenção canônica.
  assert.ok(!technicalFields.includes('label: "Intenção externa"'));
  assert.ok(!panel.includes('{ label: "Intenção", value: dataForSeoOverview'));
});
