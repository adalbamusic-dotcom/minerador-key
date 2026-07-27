import assert from "node:assert/strict";
import test from "node:test";
import { SerpCollectionRecordSchema } from "../lib/editorial/contracts.ts";
import { persistenceReasonFromError, persistenceUnavailableMessage } from "../lib/radar/persistence.ts";
import { canonicalUuidCandidates, isCanonicalUuid, parsePublishedKeywordAlias } from "../lib/radar/identifiers.ts";

test("classifica tabela/migration ausente sem usar mensagem genérica", () => {
  const reason = persistenceReasonFromError("PGRST205", "Could not find the table");
  assert.equal(reason, "migration_missing");
  assert.match(persistenceUnavailableMessage(reason), /migration/);
});

test("classifica configuração e conexão separadamente", () => {
  const configuration = persistenceUnavailableMessage("configuration_missing");
  const connection = persistenceUnavailableMessage("connection_unavailable");
  assert.equal(persistenceReasonFromError("", "Configuração server-side ausente"), "repository_unavailable");
  assert.equal(persistenceReasonFromError("", "fetch failed: connection refused"), "connection_unavailable");
  assert.notEqual(configuration, connection);
});

test("resultado real com persistência local permanece real e revisável", () => {
  const record = SerpCollectionRecordSchema.parse({
    id: "serp-real-local-1", input: { keyword: "captação de pacientes sem tráfego pago", articleId: "pub-b-artigo", location: "Brasil", language: "pt-BR", device: "desktop" },
    status: "needs_review", provider: "serper", origin: "real", isMock: false, snapshot: null, cost: null, error: null,
    dnaIntent: "informacional", conflictReason: null, humanDecisionRequired: true, research: null, persistenceMode: "local",
  });
  assert.equal(record.origin, "real");
  assert.equal(record.isMock, false);
  assert.equal(record.status, "needs_review");
  assert.equal(record.persistenceMode, "local");
});

test("alias publicado nunca entra em candidatos de coluna UUID", () => {
  const alias = "pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc";
  assert.equal(isCanonicalUuid(alias), false);
  assert.deepEqual(parsePublishedKeywordAlias(alias), { alias, sourceId: "ddf1581f-60d6-4131-a8a6-90c6365f5acc", canonicalUuid: "ddf1581f-60d6-4131-a8a6-90c6365f5acc" });
  assert.deepEqual(canonicalUuidCandidates([alias, "ddf1581f-60d6-4131-a8a6-90c6365f5acc", "pub-b-article"]), ["ddf1581f-60d6-4131-a8a6-90c6365f5acc"]);
});
