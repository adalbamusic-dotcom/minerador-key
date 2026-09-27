import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SERP_SUBJECT_READ_COLUMNS,
  SERP_SUBJECT_URL_SLOTS,
  readSerpSubjectFootprints,
} from "../lib/server/arquiteto-serp-subject-store.ts";
import { SERP_CACHE_LENSES, SERP_CACHE_STAGE, SERP_CACHE_SUBJECT_TYPE, normalizeSerpCacheKeyword, serpCacheLensLabel, serpCacheSubjectId, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import { buildSerpSubjectIndex } from "../lib/arquiteto/serp-subject-overlap.ts";
import type { SerpCacheContext } from "../lib/server/serp-cache-store.ts";

/**
 * A LEITURA ESTREITA DA SERP DA MESA (D2.2) — só cache, só as colunas da medida.
 *
 * Roda com `--conditions=react-server` e o registro de TS, como os outros
 * testes de servidor do Arquiteto. O banco é uma tabela em memória atrás de
 * um cliente com a forma do `postgrest-js`; nenhuma rede, nenhum provider.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const OTHER_BRAND = "4a737e74-e35d-4a49-8284-87b3f964e495";
const NOW = new Date("2026-09-26T12:00:00Z");

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida no teste da leitura da SERP da mesa.");
}) as typeof fetch;

type Row = Record<string, unknown>;
type Logged = { columns: string; filters: Array<{ column: string; kind: string; value: unknown }> };

/** Linha gravada como o cache real: `payload` com meta, observação, digest e (na canônica) corpo. */
function entrada(input: { brandId?: string; keyword: string; lens: SerpCacheLens; urls: string[] | null; domains?: string[]; collectedAt?: string; locationCode?: number; languageCode?: string }): Row {
  const query = { keyword: input.keyword, locationCode: input.locationCode ?? 2076, languageCode: input.languageCode ?? "pt", lens: input.lens, endpoint: "advanced" as const };
  return {
    marca_id: input.brandId ?? BRAND,
    subject_type: SERP_CACHE_SUBJECT_TYPE,
    stage: SERP_CACHE_STAGE,
    subject_id: serpCacheSubjectId(query),
    payload: {
      meta: {
        keyword: input.keyword, normalizedKeyword: normalizeSerpCacheKeyword(input.keyword), locationCode: query.locationCode, languageCode: query.languageCode,
        lens: input.lens, endpoint: "advanced", depth: 10, collectedAt: input.collectedAt ?? "2026-09-20T12:00:00+00:00",
        providerRequestId: "req", keywordId: null, collectedBy: "minerador",
      },
      observation: { competitorDomains: input.domains ?? [] },
      ...(input.urls ? { digest: { organic: input.urls.map(url => ({ url, title: "título que não deve trafegar", description: "descrição longa que não deve trafegar" })) } } : {}),
      body: { tasks: [{ result: [{ items: [{ type: "organic", url: "https://corpo.com/nao-lido" }] }] }] },
    },
  };
}

/** Resolve as colunas com apelido e caminho JSON do PostgREST, como o banco faria. */
function projetar(row: Row, columns: string): Row {
  const saida: Row = {};
  for (const coluna of columns.split(",")) {
    const [alias, caminho] = coluna.includes(":") ? coluna.split(":") : [coluna, coluna];
    const partes = caminho.split(/->>?/);
    let valor: unknown = row[partes[0]];
    for (const parte of partes.slice(1)) {
      if (valor === null || valor === undefined) break;
      valor = Array.isArray(valor) ? valor[Number(parte)] : (valor as Row)[parte];
    }
    saida[alias] = valor ?? null;
  }
  return saida;
}

function fakeContext(rows: Row[]): { context: SerpCacheContext; log: Logged[] } {
  const log: Logged[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, "editorial_workflow_items");
      const consulta: Logged = { columns: "", filters: [] };
      const builder = {
        select(columns: string) { consulta.columns = columns; return builder; },
        eq(column: string, value: unknown) { consulta.filters.push({ column, kind: "eq", value }); return builder; },
        in(column: string, value: unknown[]) { consulta.filters.push({ column, kind: "in", value }); return builder; },
        then<A>(resolve: (value: { data: Row[]; error: null }) => A) {
          log.push(consulta);
          const data = rows
            .filter(row => consulta.filters.every(filtro => filtro.kind === "eq" ? row[filtro.column] === filtro.value : (filtro.value as unknown[]).includes(row[filtro.column])))
            .map(row => projetar(row, consulta.columns));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { context: { supabase: client as unknown as SerpCacheContext["supabase"], brandId: BRAND, actorUserId: "11111111-1111-4111-8111-111111111111" }, log };
}

const [WINDOWS, MACOS, ANDROID, IOS] = SERP_CACHE_LENSES;
const alvo = (keywordId: string, keyword: string) => ({ keywordId, keyword, locationCode: 2076, languageCode: "pt" });

test("as colunas da leitura: meta, domínios e as 10 URLs — nunca o corpo nem o digest inteiro", () => {
  const colunas = SERP_SUBJECT_READ_COLUMNS.split(",");
  assert.equal(SERP_SUBJECT_URL_SLOTS, 10);
  assert.deepEqual(colunas.slice(0, 3), ["subject_id", "meta:payload->meta", "domains:payload->observation->competitorDomains"]);
  assert.deepEqual(colunas.slice(3), Array.from({ length: 10 }, (_, i) => `u${i}:payload->digest->organic->${i}->>url`));
  assert.ok(!SERP_SUBJECT_READ_COLUMNS.includes("payload->body"));
  assert.ok(!/payload->digest(,|$)/.test(SERP_SUBJECT_READ_COLUMNS));
  assert.ok(!SERP_SUBJECT_READ_COLUMNS.includes("*"));
});

test("lê a pegada nas 4 lentes, filtrada pela marca, e mede o mesmo assunto sem custo", async () => {
  const comuns = ["https://a.com.br/atrair-pacientes", "https://b.com.br/blog/pacientes", "https://c.com.br/guia"];
  const rows = [
    entrada({ keyword: "como atrair pacientes para clínica", lens: WINDOWS, urls: null, domains: ["a.com.br", "x.com.br"] }),
    entrada({ keyword: "como atrair pacientes para clínica", lens: MACOS, urls: [...comuns, "https://p.com/1"] }),
    entrada({ keyword: "como atrair pacientes para clínica", lens: ANDROID, urls: ["https://p.com/1"] }),
    entrada({ keyword: "como atrair pacientes", lens: WINDOWS, urls: null, domains: ["a.com.br"] }),
    entrada({ keyword: "como atrair pacientes", lens: IOS, urls: comuns }),
    // Outra marca com a mesma chave: nunca entra (R4).
    entrada({ brandId: OTHER_BRAND, keyword: "como atrair pacientes", lens: MACOS, urls: ["https://outra-marca.com/x"] }),
  ];
  const { context, log } = fakeContext(rows);
  const leitura = await readSerpSubjectFootprints(context, [alvo("pub", "como atrair pacientes para clínica"), alvo("livre", "como atrair pacientes"), alvo("pub", "duplicada")], { now: NOW });

  assert.equal(log.length, 1, "8 ids cabem num lote");
  assert.deepEqual(log[0].filters.filter(item => item.kind === "eq"), [
    { column: "marca_id", kind: "eq", value: BRAND },
    { column: "subject_type", kind: "eq", value: SERP_CACHE_SUBJECT_TYPE },
    { column: "stage", kind: "eq", value: SERP_CACHE_STAGE },
  ]);
  const pub = leitura.footprints.find(item => item.keywordId === "pub")!;
  assert.deepEqual(pub.lenses.map(item => item.lens), ["desktop-windows", "desktop-macos", "mobile-android"]);
  assert.equal(pub.lenses[0].urls, null, "a canônica entra pelos domínios, sem corpo");
  assert.deepEqual(pub.lenses[0].domains, ["a.com.br", "x.com.br"]);
  const livre = leitura.footprints.find(item => item.keywordId === "livre")!;
  assert.ok(!livre.lenses.some(item => (item.urls || []).some(url => url.includes("outra-marca"))));
  assert.deepEqual(leitura.missingLenses.filter(item => item.keywordId === "livre").map(item => item.lens), ["desktop-macos", "mobile-android"]);
  assert.deepEqual(leitura.withoutSerp, []);
  assert.equal(leitura.egress.queries, 1);
  assert.equal(leitura.egress.entriesRead, 5);
  assert.ok(leitura.egress.approxBytes > 0 && leitura.egress.approxBytes < 5 * 1600, `≈1,5 KB por entrada: ${leitura.egress.approxBytes}`);
  assert.ok(!JSON.stringify(leitura).includes("não deve trafegar"), "título e descrição do digest não trafegam");
  assert.ok(!JSON.stringify(leitura).includes("corpo.com"), "o corpo não trafega");

  const medida = buildSerpSubjectIndex(leitura.footprints).overlap("pub", "livre");
  assert.equal(medida.strength, "strong");
  assert.equal(medida.sharedPageCount, 3);
  assert.equal(chamadasDeRede, 0);
});

test("vencida ou sem nada: é falta com motivo, nunca SERP inventada", async () => {
  const rows = [
    entrada({ keyword: "captação de pacientes", lens: MACOS, urls: ["https://a.com/1"], collectedAt: "2026-07-01T00:00:00Z" }),
    entrada({ keyword: "captação de pacientes", lens: IOS, urls: [], domains: [] }),
  ];
  const { context } = fakeContext(rows);
  const leitura = await readSerpSubjectFootprints(context, [alvo("k", "captação de pacientes")], { now: NOW });
  assert.deepEqual(leitura.footprints[0].lenses, []);
  assert.deepEqual(leitura.withoutSerp, ["k"]);
  const motivos = new Map(leitura.missingLenses.map(item => [item.lens, item.reason]));
  assert.equal(motivos.get(serpCacheLensLabel(MACOS)), "validade vencida");
  assert.equal(motivos.get(serpCacheLensLabel(IOS)), "entrada sem URLs nem domínios");
  assert.equal(motivos.get(serpCacheLensLabel(WINDOWS)), "sem entrada no cache");
});

test("lotes de 100 ids: a mesa grande não vira uma URL gigante", async () => {
  const { context, log } = fakeContext([]);
  const alvos = Array.from({ length: 30 }, (_, i) => alvo(`k${i}`, `keyword ${i}`));
  const leitura = await readSerpSubjectFootprints(context, alvos, { now: NOW });
  assert.equal(log.length, 2, "120 ids = 2 consultas");
  assert.ok(log.every(item => ((item.filters.find(filtro => filtro.kind === "in")?.value as unknown[]) || []).length <= 100));
  assert.equal(leitura.withoutSerp.length, 30);
});

test("a rota da SERP da mesa só lê: nenhum caminho pago, nenhuma gravação", () => {
  const fonte = readFileSync(new URL("../app/api/arquiteto/serp-subject/route.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(fonte, /collectAndCacheSerp|executeDataForSeo|writeSerpCacheEntry|recordIntegrationUsage|authorizeSerpPaidPlan/);
  assert.match(fonte, /readSerpSubjectFootprints/);
  assert.match(fonte, /action: "view"/);
});
