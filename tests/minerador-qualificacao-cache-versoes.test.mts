import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildKeywordSemanticQualification,
  parseKeywordSemanticQualification,
  type KeywordSemanticQualification,
} from "../lib/minerador/keyword-semantic-qualification.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";
import { resolveCurrentKeywordSemanticQualifications } from "../lib/minerador/keyword-semantic-qualification-current.ts";
import {
  QUALIFICATION_VERSION_CACHE_DATABASE,
  QUALIFICATION_VERSION_CACHE_FORMAT,
  QUALIFICATION_VERSION_CACHE_ROW_LIMIT,
  createIndexedDbQualificationVersionCacheStorage,
  qualificationVersionCachePruneForListing,
  qualificationVersionCacheKey,
  qualificationVersionCacheScope,
  resolveCurrentKeywordSemanticQualificationsWithCache,
  type QualificationVersionCachePrune,
  type QualificationVersionCacheStorage,
} from "../lib/minerador/semantic-qualification-version-cache.ts";

/**
 * E8 — cache no navegador das versões imutáveis da Qualificação Semântica.
 *
 * A vigente vem sempre dos metadados do servidor; o cache só troca a leitura
 * do payload de uma versão já pedida. O conjunto final precisa ser idêntico
 * ao da leitura sem cache em qualquer estado do cache.
 * Armazenamento em memória; REAL_PROVIDER_CALLS_IN_TESTS = 0; sem rede.
 */

const BRAND = "11111111-1111-4111-8111-111111111111";
const OTHER_BRAND = "99999999-9999-4999-8999-999999999999";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TYPE = "keyword_semantic_qualification";

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
const cacheModule = stripComments(readFileSync(new URL("../lib/minerador/semantic-qualification-version-cache.ts", import.meta.url), "utf8"));

let basePromise: Promise<KeywordSemanticQualification> | null = null;
function baseQualification(): Promise<KeywordSemanticQualification> {
  basePromise ??= buildKeywordSemanticQualification({
    brandId: BRAND,
    keywordId: "base",
    createdBy: "user-1",
    evidence: deriveSerpSemanticEvidence({
      body: {
        tasks: [{
          id: "task-serp-1",
          status_code: 20000,
          result: [{
            keyword: "rotina pele oleosa",
            location_code: 2076,
            language_code: "pt",
            items: Array.from({ length: 8 }, (_, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, title: `O que é rotina para pele oleosa ${index + 1}`, description: "Guia passo a passo." })),
          }],
        }],
      },
      keyword: "rotina pele oleosa",
      locationCode: 2076,
      languageCode: "pt",
      providerRequestId: "task-serp-1",
      operationRequestId: "33333333-3333-4333-8333-333333333333",
      collectedAt: "2026-08-28T18:00:00.000Z",
    })!,
  });
  return basePromise;
}

type Kind = "valid" | "invalid" | "wrong-brand" | "wrong-keyword";
type Row = { version_id: string; entity_id: string; version_number: number; payload: unknown };

function versionId(brandId: string, entityId: string, version: number) {
  return `${TYPE}:${brandId}:${entityId}:v${version}`;
}

async function row(entityId: string, version: number, kind: Kind = "valid", brandId = BRAND): Promise<Row> {
  const base = await baseQualification();
  const payload: Record<string, unknown> = JSON.parse(JSON.stringify({
    ...base,
    id: versionId(brandId, entityId, version),
    brandId: kind === "wrong-brand" ? (brandId === BRAND ? OTHER_BRAND : BRAND) : brandId,
    keywordId: kind === "wrong-keyword" ? "outra-keyword" : entityId,
    lifecycle: { ...base.lifecycle, version },
  }));
  if (kind === "invalid") payload.schemaVersion = "v0";
  return { version_id: versionId(brandId, entityId, version), entity_id: entityId, version_number: version, payload };
}

function orderLikeQuery(rows: Row[]): Row[] {
  return rows.map((item, index) => ({ item, index }))
    .sort((left, right) => (right.item.version_number - left.item.version_number) || (left.index - right.index))
    .map(entry => entry.item);
}

/** Cópia fiel da seleção antiga, que baixava o payload de todas as versões. */
function legacySelection(brandId: string, rows: readonly Row[]): Map<string, KeywordSemanticQualification> {
  const current = new Map<string, KeywordSemanticQualification>();
  for (const item of rows) {
    if (!item.entity_id || current.has(item.entity_id)) continue;
    const parsed = parseKeywordSemanticQualification(item.payload);
    if (!parsed || parsed.brandId !== brandId || parsed.keywordId !== item.entity_id) continue;
    current.set(item.entity_id, parsed);
  }
  return current;
}

function metadataOf(rows: readonly Row[]) {
  return rows.map(({ version_id, entity_id, version_number }) => ({ version_id, entity_id, version_number }));
}

function remoteReader(rows: readonly Row[]) {
  const calls: string[][] = [];
  const byVersionId = new Map(rows.map(item => [item.version_id, item]));
  return {
    calls,
    read: async (versionIds: string[]) => {
      calls.push([...versionIds]);
      return versionIds.flatMap(id => {
        const found = byVersionId.get(id);
        return found ? [{ version_id: found.version_id, payload: found.payload }] : [];
      });
    },
  };
}

function memoryStorage(initial?: Iterable<[string, unknown]>) {
  const data = new Map<string, unknown>(initial);
  const calls = { getMany: 0, putMany: 0, listKeys: 0, deleteMany: 0 };
  const storage: QualificationVersionCacheStorage = {
    async getMany(keys) {
      calls.getMany += 1;
      const found = new Map<string, unknown>();
      for (const key of keys) if (data.has(key)) found.set(key, structuredClone(data.get(key)));
      return found;
    },
    async putMany(entries) {
      calls.putMany += 1;
      for (const entry of entries) data.set(entry.key, structuredClone(entry.value));
    },
    async listKeys(prefix) {
      calls.listKeys += 1;
      return [...data.keys()].filter(key => key.startsWith(prefix));
    },
    async deleteMany(keys) {
      calls.deleteMany += 1;
      for (const key of keys) data.delete(key);
    },
  };
  return { storage, data, calls };
}

function keyFor(actor: string, brandId: string, id: string) {
  return qualificationVersionCacheKey(qualificationVersionCacheScope(actor, brandId)!, id);
}

function record(actor: string, brandId: string, source: Row, overrides: Record<string, unknown> = {}) {
  return {
    format: QUALIFICATION_VERSION_CACHE_FORMAT,
    actorUserId: actor,
    brandId,
    entityId: source.entity_id,
    versionId: source.version_id,
    payload: structuredClone(source.payload),
    ...overrides,
  };
}

async function load(input: {
  rows: Row[];
  storage: QualificationVersionCacheStorage | null;
  brandId?: string;
  actor?: string | null;
  prune?: QualificationVersionCachePrune;
  batchSize?: number;
  timeoutMs?: number;
  rowLimit?: number;
}) {
  const brandId = input.brandId ?? BRAND;
  const ordered = orderLikeQuery(input.rows);
  const remote = remoteReader(ordered);
  const { qualifications, maintenance } = await resolveCurrentKeywordSemanticQualificationsWithCache({
    brandId,
    actorUserId: input.actor === undefined ? ACTOR : input.actor,
    metadata: metadataOf(ordered),
    readRemotePayloads: remote.read,
    storage: input.storage,
    prune: input.prune ?? "brand",
    batchSize: input.batchSize,
    timeoutMs: input.timeoutMs,
    rowLimit: input.rowLimit,
  });
  const report = await maintenance;
  const withoutCache = await resolveCurrentKeywordSemanticQualifications({ brandId, metadata: metadataOf(ordered), readPayloads: remoteReader(ordered).read, batchSize: input.batchSize });
  assert.deepEqual([...qualifications.entries()], [...withoutCache.entries()], "conjunto e ordem idênticos à leitura sem cache");
  assert.deepEqual([...qualifications.entries()], [...legacySelection(brandId, ordered).entries()], "conjunto e ordem idênticos à seleção antiga");
  return { qualifications, report, remoteCalls: remote.calls, remoteIds: remote.calls.flat() };
}

async function history() {
  return [
    await row("kw-a", 1), await row("kw-a", 2), await row("kw-a", 3),
    await row("kw-b", 1), await row("kw-b", 2, "invalid"),
    await row("kw-c", 1),
  ];
}

test("falta: cache frio lê do servidor e guarda só as vigentes escolhidas", async () => {
  const rows = await history();
  const memory = memoryStorage();
  const { report, remoteIds } = await load({ rows, storage: memory.storage });
  assert.deepEqual(remoteIds.sort(), [versionId(BRAND, "kw-a", 3), versionId(BRAND, "kw-b", 2), versionId(BRAND, "kw-b", 1), versionId(BRAND, "kw-c", 1)].sort());
  assert.equal(report.cacheHits, 0);
  assert.equal(report.stored, 3);
  assert.deepEqual([...memory.data.keys()].sort(), [
    keyFor(ACTOR, BRAND, versionId(BRAND, "kw-a", 3)),
    keyFor(ACTOR, BRAND, versionId(BRAND, "kw-b", 1)),
    keyFor(ACTOR, BRAND, versionId(BRAND, "kw-c", 1)),
  ].sort(), "a versão inválida kw-b v2 e as superadas não entram");
  const stored = memory.data.get(keyFor(ACTOR, BRAND, versionId(BRAND, "kw-a", 3))) as Record<string, unknown>;
  assert.equal(stored.brandId, BRAND);
  assert.equal(stored.actorUserId, ACTOR);
  assert.equal(stored.entityId, "kw-a");
  assert.deepEqual(stored.payload, rows[2].payload, "guarda o payload lido do servidor, sem transformação");
});

test("acerto: cache quente não relê payload, e a inválida vigente ainda passa pelo servidor", async () => {
  const rows = await history();
  const memory = memoryStorage();
  await load({ rows, storage: memory.storage });
  const second = await load({ rows, storage: memory.storage });
  // kw-b v2 é a maior versão e é inválida: nunca vai ao cache, então é relida
  // e a anterior (v1) vem do cache.
  assert.deepEqual(second.remoteIds, [versionId(BRAND, "kw-b", 2)]);
  assert.equal(second.report.cacheHits, 3);
  assert.equal(second.report.stored, 0);
  assert.equal(second.report.pruned, 0);
});

test("acerto total: sem versão inválida, a segunda carga não pede nenhum payload", async () => {
  const rows = [await row("kw-a", 1), await row("kw-a", 2), await row("kw-c", 1)];
  const memory = memoryStorage();
  await load({ rows, storage: memory.storage });
  const second = await load({ rows, storage: memory.storage });
  assert.equal(second.remoteCalls.length, 0);
  assert.equal(second.report.cacheHits, 2);
});

test("nova versão no servidor: a vigente segue os metadados e a antiga sai do cache", async () => {
  const memory = memoryStorage();
  await load({ rows: [await row("kw-a", 1)], storage: memory.storage });
  const next = await load({ rows: [await row("kw-a", 1), await row("kw-a", 2)], storage: memory.storage });
  assert.deepEqual(next.remoteIds, [versionId(BRAND, "kw-a", 2)]);
  assert.equal(next.qualifications.get("kw-a")!.lifecycle.version, 2);
  assert.deepEqual([...memory.data.keys()], [keyFor(ACTOR, BRAND, versionId(BRAND, "kw-a", 2))]);
});

test("brandId divergente no valor do cache é ignorado e relido do servidor", async () => {
  const rows = [await row("kw-a", 1)];
  const key = keyFor(ACTOR, BRAND, rows[0].version_id);
  for (const tampered of [
    record(ACTOR, BRAND, rows[0], { brandId: OTHER_BRAND }),
    record(ACTOR, BRAND, rows[0], { actorUserId: OTHER_ACTOR }),
    record(ACTOR, BRAND, rows[0], { entityId: "kw-z" }),
    record(ACTOR, BRAND, rows[0], { versionId: versionId(BRAND, "kw-a", 9) }),
    record(ACTOR, BRAND, rows[0], { format: 0 }),
    record(ACTOR, BRAND, { ...rows[0], payload: (await row("kw-a", 1, "wrong-brand")).payload }),
  ]) {
    const memory = memoryStorage([[key, tampered]]);
    const { report, remoteIds } = await load({ rows, storage: memory.storage });
    assert.deepEqual(remoteIds, [rows[0].version_id]);
    assert.equal(report.cacheHits, 0);
    assert.equal(report.cacheInvalid, 1);
    assert.deepEqual(memory.data.get(key), record(ACTOR, BRAND, rows[0]), "a entrada é regravada com o payload do servidor");
  }
});

test("cache de outra Marca ou de outro actor nunca é servido", async () => {
  const brandRows = [await row("kw-a", 1)];
  const otherRows = [await row("kw-a", 1, "valid", OTHER_BRAND)];
  const memory = memoryStorage();
  await load({ rows: otherRows, storage: memory.storage, brandId: OTHER_BRAND });
  await load({ rows: brandRows, storage: memory.storage, actor: OTHER_ACTOR });
  const mine = await load({ rows: brandRows, storage: memory.storage });
  assert.equal(mine.report.cacheHits, 0, "entradas de outra Marca e de outro actor não valem para esta chave");
  assert.deepEqual(mine.remoteIds, [brandRows[0].version_id]);
  // Mesmo que o id da versão coincidisse, a chave separa actor e Marca.
  assert.notEqual(keyFor(ACTOR, BRAND, "v"), keyFor(ACTOR, OTHER_BRAND, "v"));
  assert.notEqual(keyFor(ACTOR, BRAND, "v"), keyFor(OTHER_ACTOR, BRAND, "v"));
});

test("payload inválido no cache é ignorado e relido do servidor", async () => {
  const rows = [await row("kw-a", 1), await row("kw-a", 2)];
  const key = keyFor(ACTOR, BRAND, rows[1].version_id);
  // Inclui o payload válido da v1 guardado na chave da v2: o `id` não bate.
  for (const payload of [(await row("kw-a", 2, "invalid")).payload, (await row("kw-a", 2, "wrong-keyword")).payload, rows[0].payload, null, "texto", { schemaVersion: "v1" }]) {
    const memory = memoryStorage([[key, record(ACTOR, BRAND, rows[1], { payload })]]);
    const { report, remoteIds, qualifications } = await load({ rows, storage: memory.storage });
    assert.deepEqual(remoteIds, [rows[1].version_id], "a vigente continua a v2, relida do servidor");
    assert.equal(qualifications.get("kw-a")!.lifecycle.version, 2);
    assert.equal(report.cacheInvalid, 1);
    assert.deepEqual((memory.data.get(key) as { payload: unknown }).payload, rows[1].payload);
  }
});

test("vigente cujo id não é o version_id vale na tela, mas não entra no cache", async () => {
  // Hoje não há caso (MEDIDO: 0 de 353 versões); a próxima leitura recusaria a entrada.
  const source = await row("kw-a", 1);
  const divergent: Row = { ...source, payload: { ...(source.payload as Record<string, unknown>), id: versionId(BRAND, "kw-a", 7) } };
  const memory = memoryStorage();
  const first = await load({ rows: [divergent], storage: memory.storage });
  assert.equal(first.qualifications.size, 1, "a Qualificação continua na tela, como sem cache");
  assert.equal(first.report.stored, 0);
  assert.equal(memory.data.size, 0);
});

test("erro do armazenamento cai para a leitura remota", async () => {
  const rows = await history();
  const failing = (name: keyof QualificationVersionCacheStorage) => {
    const memory = memoryStorage();
    const storage = { ...memory.storage, [name]: async () => { throw new Error(`QuotaExceededError em ${name}`); } } as QualificationVersionCacheStorage;
    return { memory, storage };
  };

  const readFails = failing("getMany");
  const read = await load({ rows, storage: readFails.storage });
  assert.equal(read.report.cacheHits, 0);
  assert.equal(read.report.cacheErrors.length, 1);
  assert.equal(readFails.memory.calls.putMany + readFails.memory.calls.listKeys + readFails.memory.calls.deleteMany, 0, "cache indisponível: sem gravação e sem poda");

  const writeFails = failing("putMany");
  const write = await load({ rows, storage: writeFails.storage });
  assert.equal(write.report.stored, 0);
  assert.match(write.report.cacheErrors.join(" "), /gravação/);

  const pruneFails = failing("deleteMany");
  pruneFails.memory.data.set(keyFor(ACTOR, BRAND, versionId(BRAND, "kw-a", 1)), record(ACTOR, BRAND, rows[0]));
  const prune = await load({ rows, storage: pruneFails.storage });
  assert.match(prune.report.cacheErrors.join(" "), /poda/);

  const syncThrow = { ...memoryStorage().storage, getMany: () => { throw new Error("SecurityError"); } } as unknown as QualificationVersionCacheStorage;
  const sync = await load({ rows, storage: syncThrow });
  assert.equal(sync.report.cacheHits, 0);

  const hanging = { ...memoryStorage().storage, getMany: () => new Promise<never>(() => undefined) } as QualificationVersionCacheStorage;
  const slow = await load({ rows, storage: hanging, timeoutMs: 15 });
  assert.match(slow.report.cacheErrors.join(" "), /demorou/);

  // Node não tem IndexedDB: o adaptador real falha e a carga segue pelo servidor.
  const indexedDbAbsent = await load({ rows, storage: createIndexedDbQualificationVersionCacheStorage() });
  assert.equal(indexedDbAbsent.report.cacheHits, 0);
  assert.match(indexedDbAbsent.report.cacheErrors.join(" "), /IndexedDB/);
});

test("erro do servidor continua erro, mesmo com parte no cache", async () => {
  const rows = [await row("kw-a", 1), await row("kw-c", 1)];
  const memory = memoryStorage([[keyFor(ACTOR, BRAND, rows[0].version_id), record(ACTOR, BRAND, rows[0])]]);
  await assert.rejects(resolveCurrentKeywordSemanticQualificationsWithCache({
    brandId: BRAND,
    actorUserId: ACTOR,
    metadata: metadataOf(rows),
    readRemotePayloads: async () => { throw new Error("PGRST falhou"); },
    storage: memory.storage,
    prune: "brand",
  }), /PGRST falhou/);
  assert.equal(memory.calls.listKeys + memory.calls.deleteMany + memory.calls.putMany, 0, "carga falha não poda nem grava");
});

test("cache vazio nunca vira Marca vazia, e cache cheio nunca cria Qualificação", async () => {
  const rows = await history();
  const cold = await load({ rows, storage: memoryStorage().storage });
  assert.equal(cold.qualifications.size, 3);

  const memory = memoryStorage();
  await load({ rows, storage: memory.storage });
  const serverSaysNothing = await load({ rows: [], storage: memory.storage });
  assert.equal(serverSaysNothing.qualifications.size, 0, "sem metadados do servidor não há Qualificação, haja o que houver no cache");
  assert.equal(memory.calls.getMany, 2, "sem metadados, o cache nem é consultado");
});

test("sem actorUserId não há cache", async () => {
  const rows = await history();
  for (const actor of [null, "", "   "]) {
    const memory = memoryStorage();
    const { report } = await load({ rows, storage: memory.storage, actor });
    assert.equal(report.cacheEnabled, false);
    assert.deepEqual(memory.calls, { getMany: 0, putMany: 0, listKeys: 0, deleteMany: 0 });
  }
});

test("poda só do próprio actor+Marca", async () => {
  const rows = [await row("kw-a", 1), await row("kw-a", 2), await row("kw-c", 1)];
  const staleSameScope = keyFor(ACTOR, BRAND, rows[0].version_id);
  const orphanSameScope = keyFor(ACTOR, BRAND, versionId(BRAND, "kw-apagada", 1));
  const otherActor = keyFor(OTHER_ACTOR, BRAND, rows[0].version_id);
  const otherBrand = keyFor(ACTOR, OTHER_BRAND, versionId(OTHER_BRAND, "kw-a", 1));
  const foreign = "outra-coisa|qualquer";
  const seeded = (): Array<[string, unknown]> => [
    [staleSameScope, record(ACTOR, BRAND, rows[0])],
    [orphanSameScope, { format: 1 }],
    [otherActor, record(OTHER_ACTOR, BRAND, rows[0])],
    [otherBrand, { format: 1 }],
    [foreign, "intocado"],
  ];

  const brandWide = memoryStorage(seeded());
  const full = await load({ rows, storage: brandWide.storage, prune: "brand" });
  assert.equal(full.report.pruned, 2);
  assert.ok(!brandWide.data.has(staleSameScope), "versão superada sai");
  assert.ok(!brandWide.data.has(orphanSameScope), "keyword fora da carga completa sai");
  for (const kept of [otherActor, otherBrand, foreign]) assert.ok(brandWide.data.has(kept), `${kept} fica`);
  assert.ok(brandWide.data.has(keyFor(ACTOR, BRAND, rows[1].version_id)));
  assert.ok(brandWide.data.has(keyFor(ACTOR, BRAND, rows[2].version_id)));

  const partial = memoryStorage(seeded());
  const refresh = await load({ rows: [rows[0], rows[1]], storage: partial.storage, prune: "loaded-entities" });
  assert.equal(refresh.report.pruned, 1);
  assert.ok(!partial.data.has(staleSameScope), "versão superada da keyword recarregada sai");
  assert.ok(partial.data.has(orphanSameScope), "carga parcial não mexe em keyword que não carregou");
  for (const kept of [otherActor, otherBrand, foreign]) assert.ok(partial.data.has(kept), `${kept} fica`);
});

// `timeout` do próprio teste: sem o limite do cache, a manutenção travaria e o
// teste falharia em vez de pendurar a suíte.
test("demora na gravação, na listagem ou na remoção da poda não trava a manutenção", { timeout: 5000 }, async () => {
  const rows = await history();
  const stale = keyFor(ACTOR, BRAND, versionId(BRAND, "kw-a", 1));
  const hangingIn = (name: "putMany" | "listKeys" | "deleteMany") => {
    const memory = memoryStorage([[stale, record(ACTOR, BRAND, rows[0])]]);
    const storage = { ...memory.storage, [name]: () => new Promise<never>(() => undefined) } as QualificationVersionCacheStorage;
    return { memory, storage };
  };

  const write = hangingIn("putMany");
  const writeLoad = await load({ rows, storage: write.storage, timeoutMs: 15 });
  assert.equal(writeLoad.qualifications.size, 3);
  assert.equal(writeLoad.report.stored, 0);
  assert.match(writeLoad.report.cacheErrors.join(" "), /gravação: .*demorou/);
  assert.equal(writeLoad.report.pruned, 1, "a poda ainda roda depois da gravação que demorou");

  const list = hangingIn("listKeys");
  const listLoad = await load({ rows, storage: list.storage, timeoutMs: 15 });
  assert.equal(listLoad.report.stored, 3, "a gravação vem antes e não depende da listagem");
  assert.equal(listLoad.report.pruned, 0);
  assert.match(listLoad.report.cacheErrors.join(" "), /poda: .*demorou/);
  assert.ok(list.memory.data.has(stale));

  const remove = hangingIn("deleteMany");
  const removeLoad = await load({ rows, storage: remove.storage, timeoutMs: 15 });
  assert.equal(removeLoad.report.pruned, 0);
  assert.match(removeLoad.report.cacheErrors.join(" "), /poda: .*demorou/);
});

test("listagem ou metadados no teto de linhas do PostgREST não podam a Marca inteira", async () => {
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.equal(Number(/^max_rows\s*=\s*(\d+)/m.exec(config)?.[1]), QUALIFICATION_VERSION_CACHE_ROW_LIMIT, "o teto acompanha o max_rows do PostgREST");
  assert.equal(qualificationVersionCachePruneForListing(0), "brand");
  assert.equal(qualificationVersionCachePruneForListing(QUALIFICATION_VERSION_CACHE_ROW_LIMIT - 1), "brand");
  assert.equal(qualificationVersionCachePruneForListing(QUALIFICATION_VERSION_CACHE_ROW_LIMIT), "loaded-entities", "listagem no teto pode ter vindo cortada");
  assert.equal(qualificationVersionCachePruneForListing(QUALIFICATION_VERSION_CACHE_ROW_LIMIT + 7), "loaded-entities");
  assert.equal(qualificationVersionCachePruneForListing(Number.NaN), "loaded-entities");
  assert.equal(qualificationVersionCachePruneForListing(3, 3), "loaded-entities");

  const rows = [await row("kw-a", 1), await row("kw-a", 2), await row("kw-c", 1)];
  const staleSameScope = keyFor(ACTOR, BRAND, rows[0].version_id);
  const outsideLoad = keyFor(ACTOR, BRAND, versionId(BRAND, "kw-fora-da-leitura", 1));
  const seeded = (): Array<[string, unknown]> => [[staleSameScope, record(ACTOR, BRAND, rows[0])], [outsideLoad, { format: 1 }]];

  // 3 linhas de metadados com teto 3: a leitura pode ter sido cortada.
  const capped = memoryStorage(seeded());
  const cappedLoad = await load({ rows, storage: capped.storage, prune: "brand", rowLimit: rows.length });
  assert.equal(cappedLoad.report.pruned, 1);
  assert.ok(!capped.data.has(staleSameScope), "versão superada vista nesta carga sai");
  assert.ok(capped.data.has(outsideLoad), "keyword que a leitura cortada não viu fica");

  const whole = memoryStorage(seeded());
  const wholeLoad = await load({ rows, storage: whole.storage, prune: "brand", rowLimit: rows.length + 1 });
  assert.equal(wholeLoad.report.pruned, 2);
  assert.ok(!whole.data.has(outsideLoad), "abaixo do teto, a poda da Marca inteira continua");
});

test("equivalência aleatória: qualquer estado do cache dá o conjunto da leitura sem cache", async () => {
  let seed = 20260923;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const kinds: Kind[] = ["valid", "valid", "valid", "invalid", "wrong-brand", "wrong-keyword"];
  // Append-only: o conteúdo de um `version_id` é sorteado uma vez e nunca muda
  // entre as cargas, como no banco; o que muda é quantas versões existem.
  const kindByVersion = new Map<string, Kind>();
  const memory = memoryStorage();
  let hits = 0;
  let invalid = 0;
  for (let round = 0; round < 40; round += 1) {
    const rows: Row[] = [];
    const entities = 1 + Math.floor(random() * 12);
    for (let entity = 0; entity < entities; entity += 1) {
      const versions = 1 + Math.floor(random() * 4);
      for (let version = 1; version <= versions; version += 1) {
        const id = versionId(BRAND, `kw-${entity}`, version);
        if (!kindByVersion.has(id)) kindByVersion.set(id, kinds[Math.floor(random() * kinds.length)]);
        rows.push(await row(`kw-${entity}`, version, kindByVersion.get(id)));
      }
    }
    // Estado arbitrário do cache: entradas válidas, adulteradas e lixo.
    for (const item of rows) {
      const choice = random();
      const key = keyFor(ACTOR, BRAND, item.version_id);
      if (choice < 0.2) memory.data.set(key, record(ACTOR, BRAND, item));
      else if (choice < 0.3) memory.data.set(key, record(ACTOR, BRAND, item, { brandId: OTHER_BRAND }));
      else if (choice < 0.4) memory.data.set(key, record(ACTOR, BRAND, item, { payload: (rows[Math.floor(random() * rows.length)]).payload }));
      else if (choice < 0.45) memory.data.set(key, "lixo");
    }
    const prune: QualificationVersionCachePrune = random() < 0.5 ? "brand" : "loaded-entities";
    const { report } = await load({ rows, storage: memory.storage, prune, batchSize: 1 + Math.floor(random() * 4) });
    hits += report.cacheHits;
    invalid += report.cacheInvalid;
  }
  assert.ok(hits > 20, `o sorteio exercita acertos (${hits})`);
  assert.ok(invalid > 5, `o sorteio exercita entradas recusadas (${invalid})`);
});

/**
 * IndexedDB mínimo em memória, só com o que o adaptador usa: open com
 * upgrade, transação com get/put/delete/getAllKeys e oncomplete/onabort.
 */
function fakeIndexedDb(options: { failPut?: boolean } = {}) {
  const stores = new Map<string, Map<string, unknown>>();
  const opened: string[] = [];
  let version = 0;
  let openConnections = 0;
  const later = (run: () => void) => setTimeout(run, 0);
  const factory = {
    open(name: string, requestedVersion: number) {
      opened.push(name);
      const request: Record<string, any> = {};
      later(() => {
        openConnections += 1;
        const database: Record<string, any> = {
          objectStoreNames: { contains: (storeName: string) => stores.has(storeName) },
          createObjectStore: (storeName: string) => { stores.set(storeName, new Map()); },
          close: () => { openConnections -= 1; },
          transaction(storeName: string, mode: string) {
            const data = stores.get(storeName);
            if (!data) throw new Error("NotFoundError");
            const transaction: Record<string, any> = { error: null };
            let pending = 0;
            let settled = false;
            const settle = () => later(() => {
              if (settled || pending > 0) return;
              settled = true;
              transaction.oncomplete?.();
            });
            const request = (run: () => unknown) => {
              const item: Record<string, any> = {};
              pending += 1;
              later(() => {
                if (settled) return;
                try {
                  item.result = run();
                } catch (error) {
                  settled = true;
                  transaction.error = error;
                  transaction.onabort?.();
                  return;
                }
                pending -= 1;
                item.onsuccess?.();
                settle();
              });
              return item;
            };
            transaction.objectStore = () => ({
              get: (key: string) => request(() => structuredClone(data.get(key))),
              put: (value: unknown, key: string) => {
                if (mode !== "readwrite") throw new Error("ReadOnlyError");
                return request(() => {
                  if (options.failPut) throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
                  data.set(key, structuredClone(value));
                  return key;
                });
              },
              delete: (key: string) => {
                if (mode !== "readwrite") throw new Error("ReadOnlyError");
                return request(() => { data.delete(key); });
              },
              getAllKeys: (range: { lower: string; upper: string }) => request(() => [...data.keys()].filter(key => key >= range.lower && key <= range.upper).sort()),
            });
            settle();
            return transaction;
          },
        };
        request.result = database;
        if (requestedVersion > version) {
          version = requestedVersion;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { factory: factory as unknown as IDBFactory, stores, opened, connections: () => openConnections };
}

test("adaptador IndexedDB: banco próprio, acerto, poda e cota cheia", async () => {
  const previousKeyRange = (globalThis as Record<string, unknown>).IDBKeyRange;
  (globalThis as Record<string, unknown>).IDBKeyRange = { bound: (lower: string, upper: string) => ({ lower, upper }) };
  try {
    const rows = [await row("kw-a", 1), await row("kw-a", 2), await row("kw-c", 1)];
    const fake = fakeIndexedDb();
    const storage = createIndexedDbQualificationVersionCacheStorage(fake.factory);
    const first = await load({ rows, storage });
    assert.equal(first.report.stored, 2);
    assert.deepEqual([...new Set(fake.opened)], [QUALIFICATION_VERSION_CACHE_DATABASE], "só o banco próprio é aberto");
    assert.deepEqual([...fake.stores.keys()], ["versoes"]);
    const second = await load({ rows, storage });
    assert.equal(second.remoteCalls.length, 0, "segunda carga sem payload remoto");
    assert.equal(second.report.cacheHits, 2);

    fake.stores.get("versoes")!.set(keyFor(ACTOR, BRAND, rows[0].version_id), record(ACTOR, BRAND, rows[0]));
    fake.stores.get("versoes")!.set(keyFor(OTHER_ACTOR, BRAND, rows[0].version_id), record(OTHER_ACTOR, BRAND, rows[0]));
    const third = await load({ rows, storage });
    assert.equal(third.report.pruned, 1);
    assert.ok(fake.stores.get("versoes")!.has(keyFor(OTHER_ACTOR, BRAND, rows[0].version_id)));
    assert.equal(fake.connections(), 0, "cada operação fecha a conexão");

    const full = fakeIndexedDb({ failPut: true });
    const quota = await load({ rows, storage: createIndexedDbQualificationVersionCacheStorage(full.factory) });
    assert.equal(quota.qualifications.size, 2);
    assert.equal(quota.report.stored, 0);
    assert.match(quota.report.cacheErrors.join(" "), /gravação: QuotaExceededError/);
  } finally {
    (globalThis as Record<string, unknown>).IDBKeyRange = previousKeyRange;
  }
});

test("banco próprio, sem localStorage, sem rede", () => {
  assert.equal(QUALIFICATION_VERSION_CACHE_DATABASE, "minerador-qualificacao-versoes");
  assert.notEqual(QUALIFICATION_VERSION_CACHE_DATABASE, "minerador-pro-editorial");
  assert.ok(!cacheModule.includes("minerador-pro-editorial"));
  for (const forbidden of ["localStorage", "sessionStorage", "fetch(", "server-only", "supabase", ".clear("]) {
    assert.ok(!cacheModule.includes(forbidden), `o cache não usa ${forbidden}`);
  }
  assert.ok(cacheModule.includes("acceptQualificationPayload({ brandId: input.brandId, entityId, payload })"), "o cache valida com a mesma função da seleção");
});

test("workspace: actor da sessão canônica, carga do Perfil poda a Marca, refresh poda só o que carregou", () => {
  assert.ok(workspace.includes("const { data: session, status: sessionStatus, actorUserId } = useSession();"));
  const loader = workspace.slice(workspace.indexOf("const loadSemanticQualifications"), workspace.indexOf("const readCanonicalKeywordRows"));
  assert.ok(loader.includes("resolveCurrentKeywordSemanticQualificationsWithCache({"));
  assert.ok(loader.includes("actorUserId,"));
  assert.ok(!/email/i.test(loader), "a chave do cache não usa e-mail");
  assert.ok(loader.includes('cachePrune: QualificationVersionCachePrune = "loaded-entities"'), "padrão conservador");
  assert.ok(workspace.includes("await loadSemanticQualifications(selectedBrandId, loadedKeywords.map(item => String(item.id)), qualificationVersionCachePruneForListing(loadedKeywords.length))"), "a carga do Perfil só poda a Marca inteira quando a listagem veio inteira");
  assert.ok(workspace.includes("await loadSemanticQualifications(selectedBrandId, persistedQualificationIds);"), "refresh parcial usa o padrão");
  assert.ok(workspace.includes("createIndexedDbQualificationVersionCacheStorage()"));
});

test("workspace: Qualificação lida para uma Marca não entra no estado depois da troca de Marca", () => {
  const call = workspace.indexOf("await loadSemanticQualifications(selectedBrandId, loadedKeywords");
  assert.ok(call > 0);
  const apply = workspace.indexOf("setSemanticQualifications(current =>", call);
  assert.ok(apply > call);
  assert.match(
    workspace.slice(call, apply),
    /\.catch\(\(\) => null\);\s*if \(fetchDataActiveKeyRef\.current !== fetchKey\) return;\s*if \(persistedQualifications\) \{\s*$/,
    "a guarda da carga ativa vem logo depois da leitura e antes de aplicar o resultado",
  );
});
