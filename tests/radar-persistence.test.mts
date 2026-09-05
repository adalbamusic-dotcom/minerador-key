import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SerpCollectionRecordSchema } from "../lib/editorial/contracts.ts";
import { persistenceReasonFromError, persistenceUnavailableMessage } from "../lib/radar/persistence.ts";
import { canonicalUuidCandidates, isCanonicalUuid, parsePublishedKeywordAlias } from "../lib/radar/identifiers.ts";
import {
  buildSerpReviewPersistenceRow,
  buildSerpSnapshotPersistenceRow,
  markStoredSerpSnapshotAsRemote,
  parseStoredSerpSnapshotPayload,
} from "../lib/server/serp-persistence-adapter.ts";

const brandId = "550e8400-e29b-41d4-a716-446655440000";
const actorId = "550e8400-e29b-41d4-a716-446655440001";
const articleDnaVersionId = "article-dna-version-2";
const previousUuid = "550e8400-e29b-41d4-a716-446655440002";

function research(overrides: Record<string, unknown> = {}) {
  return {
    id: "serp:article-1:generated",
    brandId,
    articleId: "article-1",
    articleDnaVersionId,
    keywordId: "keyword-1",
    keywordDnaVersionId: "keyword-dna-1",
    query: "keyword principal",
    country: "br",
    language: "pt-br",
    location: "Brasil",
    device: "desktop",
    resultLimit: 10,
    provider: "dataforseo",
    providerEndpoint: "/search",
    origin: "real",
    isMock: false,
    collectedAt: "2026-08-25T15:00:00.000Z",
    version: 2,
    previousSnapshotId: null,
    contentHash: "a".repeat(64),
    persistenceMode: "local",
    resolutionMode: "remote_canonical",
    canonicalRemoteVerified: true,
    status: "needs_review",
    organicResults: [],
    peopleAlsoAsk: [],
    relatedSearches: [],
    knowledgeGraph: null,
    diagnostic: {
      dominantIntent: "informacional",
      secondaryIntents: [],
      confidence: "high",
      dominantFormats: [],
      resultTypeCounts: {},
      pageTypes: [],
      recurringTitlePatterns: [],
      recurringSnippetPatterns: [],
      frequentEntities: [],
      frequentDomains: [],
      localSignals: [],
      questions: [],
      relatedSearches: [],
      possibleConflicts: [],
      opportunities: [],
      limitations: [],
      verdict: "coerente",
    },
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return SerpCollectionRecordSchema.parse({
    id: "serp:article-1:generated",
    input: { keyword: "keyword principal", articleId: "article-1", location: "Brasil", language: "pt-br", device: "desktop" },
    status: "needs_review",
    provider: "dataforseo",
    origin: "real",
    isMock: false,
    snapshot: null,
    cost: null,
    error: null,
    dnaIntent: "informacional",
    conflictReason: null,
    humanDecisionRequired: true,
    research: research(),
    persistenceMode: "local",
    resolutionMode: "remote_canonical",
    canonicalRemoteVerified: true,
    ...overrides,
  });
}

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

test("adapter cria UUID puro, preserva Brand/provider e grava ArticleDNA como source_version_id", () => {
  const prepared = buildSerpSnapshotPersistenceRow({ brandId, record: record(), actorId });
  assert.equal(isCanonicalUuid(prepared.row.id), true);
  assert.doesNotMatch(prepared.row.id, /^serp:/);
  assert.equal(prepared.row.marca_id, brandId);
  assert.equal(prepared.row.source_version_id, articleDnaVersionId);
  assert.equal(prepared.row.payload.provider, "dataforseo");
  assert.equal(prepared.row.payload.research?.articleDnaVersionId, articleDnaVersionId);
  assert.equal(prepared.row.created_at, "2026-08-25T15:00:00.000Z");
});

test("adapter só envia previous_snapshot_id quando o UUID é canônico", () => {
  const withoutPrevious = buildSerpSnapshotPersistenceRow({ brandId, record: record(), actorId });
  assert.equal(withoutPrevious.row.previous_snapshot_id, null);

  const withPrevious = buildSerpSnapshotPersistenceRow({ brandId, record: record(), actorId, previousSnapshotId: previousUuid });
  assert.equal(withPrevious.row.previous_snapshot_id, previousUuid);

  const withLegacyPrevious = buildSerpSnapshotPersistenceRow({ brandId, record: record(), actorId, previousSnapshotId: "serp:legacy-snapshot" });
  assert.equal(withLegacyPrevious.row.previous_snapshot_id, null);
});

test("adapter cria UUID puro para revisão e normaliza timestamp", () => {
  const row = buildSerpReviewPersistenceRow({
    brandId,
    review: {
      id: "serp-review:generated",
      brandId,
      articleId: "article-1",
      snapshotId: "serp:article-1:generated",
      status: "approved",
      notes: "revisado",
      reviewedBy: actorId,
      reviewedAt: "2026-08-25T12:30:00-03:00",
    },
    snapshotId: previousUuid,
    sourceVersionId: articleDnaVersionId,
  });
  assert.equal(isCanonicalUuid(row.id), true);
  assert.doesNotMatch(row.id, /^serp-review:/);
  assert.equal(row.snapshot_id, previousUuid);
  assert.equal(row.source_version_id, articleDnaVersionId);
  assert.equal(row.created_at, "2026-08-25T15:30:00.000Z");
  assert.equal(row.payload.snapshotId, "serp:article-1:generated");
});

test("leitura preserva envelope histórico Serper e seus IDs textuais", () => {
  const historical = record({
    id: "serp:article-1:serper-v1",
    provider: "serper",
    research: research({ id: "serp:article-1:serper-v1", provider: "serper", previousSnapshotId: "serp:article-1:serper-v0" }),
  });
  const parsed = parseStoredSerpSnapshotPayload(historical, articleDnaVersionId);
  assert.equal(parsed.provider, "serper");
  assert.equal(parsed.id, "serp:article-1:serper-v1");
  assert.equal(parsed.research?.id, "serp:article-1:serper-v1");
  assert.equal(parsed.research?.previousSnapshotId, "serp:article-1:serper-v0");
});

test("readback remoto marca o envelope e a pesquisa como remotos sem reescrever o payload", () => {
  const parsed = markStoredSerpSnapshotAsRemote(record());
  assert.equal(parsed.persistenceMode, "remote");
  assert.equal(parsed.research?.persistenceMode, "remote");
  assert.equal(parsed.id, "serp:article-1:generated");
  assert.equal(parsed.research?.provider, "dataforseo");
});

test("adapter não depende da migration 0003 nem faz chamada externa", () => {
  const source = readFileSync(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /0003_radar_serp_snapshots/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("alias publicado nunca entra em candidatos de coluna UUID", () => {
  const alias = "pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc";
  assert.equal(isCanonicalUuid(alias), false);
  assert.deepEqual(parsePublishedKeywordAlias(alias), { alias, sourceId: "ddf1581f-60d6-4131-a8a6-90c6365f5acc", canonicalUuid: "ddf1581f-60d6-4131-a8a6-90c6365f5acc" });
  assert.deepEqual(canonicalUuidCandidates([alias, "ddf1581f-60d6-4131-a8a6-90c6365f5acc", "pub-b-article"]), ["ddf1581f-60d6-4131-a8a6-90c6365f5acc"]);
});
