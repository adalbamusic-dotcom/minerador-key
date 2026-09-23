import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildKeywordSemanticQualification,
  parseKeywordSemanticQualification,
  type KeywordSemanticQualification,
} from "../lib/minerador/keyword-semantic-qualification.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";
import {
  QUALIFICATION_PAYLOAD_BATCH_SIZE,
  resolveCurrentKeywordSemanticQualifications,
} from "../lib/minerador/keyword-semantic-qualification-current.ts";

/**
 * E7, correção 3 — o Minerador lê só a versão vigente da Qualificação.
 *
 * Equivalência: a seleção em duas etapas devolve o mesmo Map (conteúdo e
 * ordem) que a seleção antiga, que baixava o payload de todas as versões.
 * Forma: metadados sem payload, payload por `version_id`, filtro de Marca.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0; nenhum acesso a rede.
 */

const BRAND = "11111111-1111-4111-8111-111111111111";
const OTHER_BRAND = "99999999-9999-4999-8999-999999999999";
const TYPE = "keyword_semantic_qualification";

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
const store = stripComments(readFileSync(new URL("../lib/server/keyword-semantic-qualification-store.ts", import.meta.url), "utf8"));
const resolver = stripComments(readFileSync(new URL("../lib/minerador/keyword-semantic-qualification-current.ts", import.meta.url), "utf8"));

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

function versionId(entityId: string, version: number) {
  return `${TYPE}:${BRAND}:${entityId}:v${version}`;
}

async function row(entityId: string, version: number, kind: Kind): Promise<Row> {
  const base = await baseQualification();
  const payload: Record<string, unknown> = JSON.parse(JSON.stringify({
    ...base,
    id: versionId(entityId, version),
    brandId: kind === "wrong-brand" ? OTHER_BRAND : BRAND,
    keywordId: kind === "wrong-keyword" ? "outra-keyword" : entityId,
    lifecycle: { ...base.lifecycle, version },
  }));
  if (kind === "invalid") payload.schemaVersion = "v0";
  return { version_id: versionId(entityId, version), entity_id: entityId, version_number: version, payload };
}

/** Ordem da consulta real: `order("version_number", desc)`; empate entre entidades fica na ordem recebida. */
function orderLikeQuery(rows: Row[]): Row[] {
  return rows.map((item, index) => ({ item, index }))
    .sort((left, right) => (right.item.version_number - left.item.version_number) || (left.index - right.index))
    .map(entry => entry.item);
}

/** Cópia fiel da seleção antiga (`minerador-workspace.tsx` e store antes da correção). */
function legacySelection(brandId: string, rows: readonly Row[]): Map<string, KeywordSemanticQualification> {
  const current = new Map<string, KeywordSemanticQualification>();
  for (const item of rows) {
    const entityId = typeof item.entity_id === "string" ? item.entity_id : "";
    if (!entityId || current.has(entityId)) continue;
    const parsed = parseKeywordSemanticQualification(item.payload);
    if (!parsed || parsed.brandId !== brandId || parsed.keywordId !== entityId) continue;
    current.set(entityId, parsed);
  }
  return current;
}

async function twoStepSelection(brandId: string, rows: readonly Row[], batchSize?: number) {
  const calls: string[][] = [];
  const byVersionId = new Map(rows.map(item => [item.version_id, item]));
  const metadata = rows.map(({ version_id, entity_id, version_number }) => ({ version_id, entity_id, version_number }));
  const result = await resolveCurrentKeywordSemanticQualifications({
    brandId,
    metadata,
    batchSize,
    readPayloads: async versionIds => {
      calls.push([...versionIds]);
      return versionIds.flatMap(id => {
        const found = byVersionId.get(id);
        return found ? [{ version_id: found.version_id, payload: found.payload }] : [];
      });
    },
  });
  return { result, calls };
}

async function assertEquivalent(rows: Row[], batchSize?: number) {
  const ordered = orderLikeQuery(rows);
  const legacy = legacySelection(BRAND, ordered);
  const { result, calls } = await twoStepSelection(BRAND, ordered, batchSize);
  assert.deepEqual([...result.entries()], [...legacy.entries()], "mesmo conteúdo e mesma ordem da seleção antiga");
  return { result, calls, legacy };
}

test("vigente válida: pede só a maior versão de cada entidade", async () => {
  const rows = [
    await row("kw-a", 1, "valid"), await row("kw-a", 2, "valid"), await row("kw-a", 3, "valid"),
    await row("kw-b", 1, "valid"), await row("kw-b", 2, "valid"),
    await row("kw-c", 1, "valid"),
  ];
  const { result, calls } = await assertEquivalent(rows);
  assert.equal(calls.length, 1);
  assert.deepEqual(new Set(calls[0]), new Set([versionId("kw-a", 3), versionId("kw-b", 2), versionId("kw-c", 1)]));
  assert.equal(result.get("kw-a")!.lifecycle.version, 3);
  assert.equal(result.get("kw-b")!.lifecycle.version, 2);
});

test("mais nova inválida cai para a anterior, buscada sob demanda", async () => {
  const rows = [
    await row("kw-a", 1, "valid"), await row("kw-a", 2, "invalid"), await row("kw-a", 3, "invalid"),
    await row("kw-b", 1, "valid"), await row("kw-b", 2, "valid"),
  ];
  const { result, calls } = await assertEquivalent(rows);
  assert.equal(result.get("kw-a")!.lifecycle.version, 1);
  assert.deepEqual(calls, [
    [versionId("kw-a", 3), versionId("kw-b", 2)],
    [versionId("kw-a", 2)],
    [versionId("kw-a", 1)],
  ]);
});

test("brandId ou keywordId errados no payload são recusados como hoje", async () => {
  const rows = [
    await row("kw-a", 1, "valid"), await row("kw-a", 2, "wrong-brand"),
    await row("kw-b", 1, "wrong-keyword"),
    await row("kw-c", 1, "wrong-brand"), await row("kw-c", 2, "wrong-keyword"),
  ];
  const { result } = await assertEquivalent(rows);
  assert.equal(result.get("kw-a")!.lifecycle.version, 1);
  assert.equal(result.has("kw-b"), false);
  assert.equal(result.has("kw-c"), false);
  // Outra Marca pedindo as mesmas linhas não recebe nada.
  const ordered = orderLikeQuery(rows);
  const foreign = await twoStepSelection(OTHER_BRAND, ordered);
  assert.deepEqual([...foreign.result.entries()], [...legacySelection(OTHER_BRAND, ordered).entries()]);
});

test("entidade sem versão não aparece e não gera leitura de payload", async () => {
  const { result, calls } = await assertEquivalent([await row("kw-a", 1, "valid")]);
  assert.equal(result.has("kw-sem-versao"), false);
  assert.deepEqual(calls, [[versionId("kw-a", 1)]]);
  const orphan = { ...(await row("kw-a", 1, "valid")), entity_id: "", version_id: "sem-entidade" };
  const withOrphan = await assertEquivalent([orphan, await row("kw-a", 1, "valid")]);
  assert.deepEqual(withOrphan.calls, [[versionId("kw-a", 1)]], "linha sem entity_id não gera leitura de payload");
  const empty = await assertEquivalent([]);
  assert.equal(empty.result.size, 0);
  assert.equal(empty.calls.length, 0, "sem metadados, nenhuma leitura de payload");
});

test("mais entidades que o lote: payloads em lotes, sem passar do tamanho", async () => {
  const rows: Row[] = [];
  for (let index = 0; index < 120; index += 1) {
    const entityId = `kw-${String(index).padStart(3, "0")}`;
    rows.push(await row(entityId, 1, "valid"));
    if (index % 3 === 0) rows.push(await row(entityId, 2, index % 9 === 0 ? "invalid" : "valid"));
  }
  const standard = await assertEquivalent(rows);
  assert.deepEqual(standard.calls.slice(0, 3).map(batch => batch.length), [50, 50, 20]);
  assert.ok(standard.calls.every(batch => batch.length <= QUALIFICATION_PAYLOAD_BATCH_SIZE));
  assert.ok(QUALIFICATION_PAYLOAD_BATCH_SIZE <= 100);
  const wide = await assertEquivalent(rows, 100);
  assert.deepEqual(wide.calls[0].length, 100);
  assert.deepEqual(wide.calls[1].length, 20);
  assert.equal(standard.result.size, 120);
});

test("equivalência em entradas aleatórias, inclusive empates de versão entre entidades", async () => {
  let seed = 20260923;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const kinds: Kind[] = ["valid", "valid", "valid", "invalid", "wrong-brand", "wrong-keyword"];
  for (let round = 0; round < 150; round += 1) {
    const rows: Row[] = [];
    const entities = Math.floor(random() * 12);
    for (let index = 0; index < entities; index += 1) {
      const versions = Math.floor(random() * 6);
      for (let version = 1; version <= versions; version += 1) {
        rows.push(await row(`kw-${round}-${index}`, version, kinds[Math.floor(random() * kinds.length)]));
      }
    }
    // Embaralha para que empates entre entidades venham em ordens variadas.
    for (let index = rows.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [rows[index], rows[swap]] = [rows[swap], rows[index]];
    }
    await assertEquivalent(rows, 1 + Math.floor(random() * 4));
  }
});

test("payload ausente na segunda leitura cai para a anterior, sem sucesso inventado", async () => {
  const rows = orderLikeQuery([await row("kw-a", 1, "valid"), await row("kw-a", 2, "valid")]);
  const result = await resolveCurrentKeywordSemanticQualifications({
    brandId: BRAND,
    metadata: rows.map(({ version_id, entity_id, version_number }) => ({ version_id, entity_id, version_number })),
    readPayloads: async ids => rows.filter(item => ids.includes(item.version_id) && item.version_number === 1),
  });
  assert.equal(result.get("kw-a")!.lifecycle.version, 1);
});

test("version_number nulo segue o DESC NULLS FIRST da consulta, como a seleção antiga", async () => {
  // Postgres: ORDER BY version_number DESC coloca nulo antes de qualquer número.
  const nullValid: Row = { ...(await row("kw-a", 9, "valid")), version_id: `${TYPE}:${BRAND}:kw-a:vnull`, version_number: null as unknown as number };
  const legacyOrder = [nullValid, await row("kw-a", 2, "valid"), await row("kw-a", 1, "valid")];
  const legacy = legacySelection(BRAND, legacyOrder);
  const { result, calls } = await twoStepSelection(BRAND, legacyOrder);
  assert.deepEqual([...result.entries()], [...legacy.entries()]);
  assert.deepEqual(calls, [[nullValid.version_id]], "a linha nula, primeira na consulta, é a pedida");
  const nullInvalid: Row = { ...(await row("kw-b", 9, "invalid")), version_id: `${TYPE}:${BRAND}:kw-b:vnull`, version_number: null as unknown as number };
  const fallbackOrder = [nullInvalid, await row("kw-b", 2, "valid"), await row("kw-b", 1, "valid")];
  const fallback = await twoStepSelection(BRAND, fallbackOrder);
  assert.deepEqual([...fallback.result.entries()], [...legacySelection(BRAND, fallbackOrder).entries()]);
  assert.equal(fallback.result.get("kw-b")!.lifecycle.version, 2);
});

test("comentário do módulo cita o mesmo tamanho de lote da constante", () => {
  const raw = readFileSync(new URL("../lib/minerador/keyword-semantic-qualification-current.ts", import.meta.url), "utf8");
  assert.ok(!/lotes de até 100/.test(raw), "o comentário não promete lote de 100");
  assert.ok(raw.includes(`lotes de QUALIFICATION_PAYLOAD_BATCH_SIZE (${QUALIFICATION_PAYLOAD_BATCH_SIZE})`));
});

test("forma da leitura: metadados sem payload, payload por version_id e filtro de Marca", () => {
  const loader = workspace.slice(workspace.indexOf("const loadSemanticQualifications"), workspace.indexOf("const readCanonicalKeywordRows"));
  const serverRead = store.slice(store.indexOf("export async function readCurrentKeywordSemanticQualifications"), store.indexOf("export async function persistKeywordSemanticQualification"));
  for (const [name, source, brandFilter] of [["Minerador", loader, '.eq("marca_id", brandId)'], ["store", serverRead, '.eq("marca_id", input.brandId)']] as const) {
    assert.ok(source.includes('.select("version_id,entity_id,version_number")'), `${name}: metadados sem payload`);
    assert.ok(source.includes('.select("version_id,payload")'), `${name}: payload só por version_id`);
    assert.ok(source.includes('.in("version_id", versionIds)'), `${name}: payload só das versões pedidas`);
    assert.ok(source.includes('.in("entity_id", ids)'), `${name}: metadados só das keywords carregadas`);
    assert.equal(source.split(brandFilter).length - 1, 2, `${name}: as duas leituras filtram a Marca`);
    assert.equal(source.split('.eq("artifact_type", KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE)').length - 1, 2, `${name}: as duas leituras filtram o tipo`);
    assert.equal(source.split('.select(').length - 1, 2, `${name}: só duas leituras`);
    assert.ok(!/\.select\("[^"]*entity_id[^"]*payload[^"]*"\)/.test(source), `${name}: nenhuma leitura de payload de todas as versões`);
    assert.ok(!source.includes("select(\"*\")"), `${name}: sem select *`);
    // O Minerador chama a mesma seleção pelo cache de versões imutáveis (E8).
    assert.ok(/resolveCurrentKeywordSemanticQualifications(WithCache)?\(\{/.test(source), `${name}: seleção compartilhada`);
  }
  assert.ok(resolver.includes("parsed.brandId === input.brandId && parsed.keywordId === entityId"));
  assert.ok(!resolver.includes("fetch("), "a seleção não acessa rede");
  assert.ok(!resolver.includes("server-only"), "a seleção roda no navegador e no servidor");
});
