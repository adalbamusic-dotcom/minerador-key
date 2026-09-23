import assert from "node:assert/strict";
import test from "node:test";
import {
  WRITER_EVIDENCE_GUARDS,
  WRITER_EVIDENCE_LIMITS,
  buildWriterEvidenceManifest,
  fitWriterEvidenceEnvelope,
  fitWriterFoundations,
  parseWriterEvidenceCursor,
  parseWriterEvidenceFields,
  parseWriterEvidenceSourceKey,
  truncateWriterThirdPartyText,
  writerBundlePathReadableWithoutMigration,
  writerEvidenceBaseKey,
  writerEvidenceEnvelope,
  writerEvidenceEtag,
  writerEvidenceHierarchyOf,
  writerEvidenceJsonBytes,
  writerEvidencePageOf,
  writerSliceRowsOf,
  type WriterEvidenceFamily,
  type WriterManifestSourceRow,
} from "../lib/redator/writer-evidence-catalog.ts";
import { RADAR_WRITER_MAY_NOT } from "../lib/redator/writer-handoff.ts";

/*
 * O CATÁLOGO DO LEITOR DE EVIDÊNCIAS — puro, sem banco.
 *
 * SDD docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md §9:
 * limites, paridade das fatias com a seção, ordem estável e cursor
 * determinístico, hierarquia fora do pacote, guardas.
 */

const concatenarArray = (valor: unknown[], opcoes: { maxBytes: number; limit: number; fields?: string[]; excludeKeys?: string[] }) => {
  const juntos: unknown[] = [];
  let offset = 0;
  let paginas = 0;
  for (;;) {
    const linhas = writerSliceRowsOf(valor, { offset, ...opcoes });
    const pagina = writerEvidencePageOf(linhas, { offset, baseKey: "radar.bundle.observed.externalSources", truncate: false });
    const bytesDosValores = (pagina.data as Array<{ value: unknown }>).reduce((soma, item) => soma + writerEvidenceJsonBytes(item.value), 0);
    assert.ok(bytesDosValores <= opcoes.maxBytes, `página de ${bytesDosValores} B`);
    for (const item of pagina.data as Array<{ at: number; value: unknown }>) juntos.push(item.value);
    for (const omitido of pagina.omitted) juntos.push({ omitido: omitido.at });
    paginas += 1;
    if (pagina.next === null) break;
    assert.ok(Number(pagina.next) > offset, "o cursor sempre anda");
    offset = Number(pagina.next);
  }
  return { juntos, paginas };
};

test("gramática · chaves do manifesto são lidas; chaves inventadas ou fora da forma são recusadas", () => {
  const validas: Array<[string, WriterEvidenceFamily, string | null, string[], string[]]> = [
    ["radar.bundle.observed.questions", "radar.bundle", null, ["observed", "questions"], []],
    ["radar.bundle.observed.structure#measures.0", "radar.bundle", null, ["observed", "structure"], ["measures", "0"]],
    ["run.extractions#3", "run", null, ["extractions"], ["3"]],
    ["run.youtube.universe", "run", null, ["youtubeSearch", "universe"], []],
    ["run.amazon.products", "run", null, ["amazonSearch", "universe"], []],
    ["dna.article/article-dna-v2#requiredTopics", "dna.article", "article-dna-v2", [], ["requiredTopics"]],
    ["dna.keyword/kw-1", "dna.keyword", "kw-1", [], []],
    ["dna.keyword.metrics", "dna.keyword.metrics", null, [], []],
    ["dna.brand/current", "dna.brand", "current", [], []],
    ["video.transcript/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "video.transcript", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [], []],
    ["serp.radar.snapshot", "serp.radar.snapshot", null, [], []],
    ["serp.radar.snapshot.latest", "serp.radar.snapshot.latest", null, [], []],
    ["serp.cache/kw-1#desktop-windows", "serp.cache", "kw-1", ["desktop-windows"], []],
    ["serp.cache/mobile-ios/kw-1", "serp.cache", "kw-1", ["mobile-ios"], []],
    ["serp.cache/kw-1#body", "serp.cache", "kw-1", ["body"], []],
    ["graph.article/graph-v4", "graph.article", "graph-v4", [], []],
    ["brand.site.catalog", "brand.site.catalog", null, [], []],
    ["publication.self", "publication.self", null, [], []],
    ["serp.architect.formation#assessment.snapshots", "serp.architect.formation", null, [], ["assessment", "snapshots"]],
  ];
  for (const [chave, familia, ref, base, descida] of validas) {
    const lida = parseWriterEvidenceSourceKey(chave);
    assert.ok(lida, `${chave} deveria ser lida`);
    assert.equal(lida.family, familia, chave);
    assert.equal(lida.ref, ref, chave);
    assert.deepEqual([...lida.basePath], base, chave);
    assert.deepEqual([...lida.path], descida, chave);
  }
  assert.equal(writerEvidenceBaseKey(parseWriterEvidenceSourceKey("serp.cache/mobile-ios/kw-1")!), "serp.cache/kw-1");
  assert.equal(writerEvidenceBaseKey(parseWriterEvidenceSourceKey("run.youtube.universe#2")!), "run.youtube.universe");

  const invalidas = [
    "", "   ", "radar.bundle", "radar.bundle.", "radar.bundle.observed..questions", "run.inexistente", "run.",
    "dna.article", "dna.article/", "dna.keyword.metrics/kw-1", "dna.keyword/kw 1", "serp.radar.snapshot/abc",
    "brand.site.catalog/abc", "qualquer.coisa", "dna.article/a#b#c", "dna.article/a/b", "serp.cache/a/b/c",
    "radar.bundle.a.b.c.d.e.f.g.h.i.j.k", `dna.article/${"x".repeat(401)}`, "radar.bundle.observed;drop",
  ];
  for (const chave of invalidas) assert.equal(parseWriterEvidenceSourceKey(chave), null, `${JSON.stringify(chave)} deveria ser recusada`);
  assert.equal(parseWriterEvidenceSourceKey(42), null);
});

test("cursor, campos e tetos · só o que a SDD permite", () => {
  assert.equal(parseWriterEvidenceCursor(undefined), 0);
  assert.equal(parseWriterEvidenceCursor("17"), 17);
  for (const ruim of ["-1", "1.5", "abc", "1e3", "9999999999", 3]) assert.equal(parseWriterEvidenceCursor(ruim), null, String(ruim));
  assert.deepEqual(parseWriterEvidenceFields(["url", "title", "url"]), ["url", "title"]);
  assert.equal(parseWriterEvidenceFields(undefined), undefined);
  assert.equal(parseWriterEvidenceFields(["a.b"]), null);
  assert.equal(parseWriterEvidenceFields(Array.from({ length: 31 }, (_, indice) => `c${indice}`)), null);
  assert.equal(parseWriterEvidenceFields("url"), null);
});

test("paginação de array · páginas ≤ teto, ordem estável, cursor determinístico e concatenação = seção", () => {
  const secao = Array.from({ length: 173 }, (_, indice) => ({ url: `https://fonte.test/${indice}`, anchor: `âncora ${indice}`, trecho: "ç".repeat(indice * 7), rank: indice }));
  for (const maxBytes of [4_096, 16_384, 32_768]) {
    const { juntos } = concatenarArray(secao, { maxBytes, limit: 50 });
    assert.deepEqual(juntos, secao, `paridade com teto ${maxBytes}`);
    assert.deepEqual(concatenarArray(secao, { maxBytes, limit: 50 }).juntos, juntos, "mesma leitura, mesmo resultado");
  }
  const projetado = concatenarArray(secao, { maxBytes: 16_384, limit: 200, fields: ["url", "rank"] }).juntos;
  assert.deepEqual(projetado, secao.map(item => ({ url: item.url, rank: item.rank })));
  const semTrecho = concatenarArray(secao, { maxBytes: 16_384, limit: 200, excludeKeys: ["trecho"] }).juntos;
  assert.deepEqual(semTrecho, secao.map(({ trecho: _trecho, ...resto }) => resto));
});

test("paginação · item maior que a página sai como omitido, com o caminho para descer, e o cursor segue", () => {
  const secao = [{ corpo: "x".repeat(40_000) }, { corpo: "pequeno" }];
  const linhas = writerSliceRowsOf(secao, { offset: 0, limit: 20, maxBytes: 16_384 });
  const pagina = writerEvidencePageOf(linhas, { offset: 0, baseKey: "run.extractions", truncate: false });
  assert.deepEqual(pagina.data, []);
  assert.equal(pagina.omitted.length, 1);
  assert.equal(pagina.omitted[0].descend, "run.extractions#0");
  assert.equal(pagina.next, "1");
  const descida = writerEvidencePageOf(writerSliceRowsOf(secao[0], { offset: 0, limit: 20, maxBytes: 16_384 }), { offset: 0, baseKey: "run.extractions#0", truncate: false });
  assert.equal(descida.container, "object");
  assert.equal(descida.omitted[0].descend, "run.extractions#0.corpo");
});

test("paginação de objeto e de texto · chaves em ordem C; texto por caracteres; concatenação = original", () => {
  const objeto = Object.fromEntries(["zeta", "Alfa", "beta", "_meio", "alfa"].map((chave, indice) => [chave, "y".repeat(3_000 + indice)]));
  const chaves: string[] = [];
  let offset = 0;
  for (;;) {
    const pagina = writerEvidencePageOf(writerSliceRowsOf(objeto, { offset, limit: 20, maxBytes: 4_096 }), { offset, baseKey: "dna.article/v#x", truncate: false });
    chaves.push(...Object.keys(pagina.data as object));
    if (!pagina.next) break;
    offset = Number(pagina.next);
  }
  assert.deepEqual(chaves, ["Alfa", "_meio", "alfa", "beta", "zeta"]);

  const textoOriginal = "Transcrição com acentuação — é, ç, ã — e emoji 🎬. ".repeat(900);
  let pedacos = "";
  offset = 0;
  for (;;) {
    const linhas = writerSliceRowsOf(textoOriginal, { offset, limit: 1, maxBytes: 1_024 });
    assert.ok(writerEvidenceJsonBytes(linhas[0].value) <= 1_024);
    const pagina = writerEvidencePageOf(linhas, { offset, baseKey: "video.transcript/x", truncate: false });
    pedacos += pagina.data as string;
    if (!pagina.next) break;
    offset = Number(pagina.next);
  }
  assert.equal(pedacos, textoOriginal);
  const ausente = writerEvidencePageOf(writerSliceRowsOf(undefined, { offset: 0, limit: 1, maxBytes: 1_024 }), { offset: 0, baseKey: "x", truncate: false });
  assert.equal(ausente.container, "absent");
});

test("hierarquia · fora do pacote congelado nunca é CURRENT_SUFFICIENT_SERP", () => {
  assert.equal(writerEvidenceHierarchyOf({ family: "radar.bundle", bundlePath: ["specialist"] }).level, "QUALIFIED_SPECIALIST");
  assert.equal(writerEvidenceHierarchyOf({ family: "radar.bundle", bundlePath: ["observed", "questions"], serpAuthoritative: true }).level, "CURRENT_SUFFICIENT_SERP");
  assert.equal(writerEvidenceHierarchyOf({ family: "radar.bundle", bundlePath: ["observed", "questions"], serpAuthoritative: false }).level, "OTHER_RADAR_EVIDENCE");
  assert.equal(writerEvidenceHierarchyOf({ family: "radar.bundle", bundlePath: ["limitations"], serpAuthoritative: true }).level, "OTHER_RADAR_EVIDENCE");
  const externas: WriterEvidenceFamily[] = ["serp.cache", "serp.radar.snapshot", "serp.radar.snapshot.latest", "run", "serp.architect.formation",
    "serp.architect.territorial", "video.transcript", "graph.article", "brand.site.catalog", "publication.self", "publication.brand", "dna.keyword.metrics"];
  for (const family of externas) {
    const nivel = writerEvidenceHierarchyOf({ family, serpAuthoritative: true });
    assert.equal(nivel.level, "OTHER_RADAR_EVIDENCE", family);
    assert.match(nivel.note ?? "", /não revisada pelo Radar/, family);
    const forcado = writerEvidenceEnvelope({
      sourceKey: family, family, origin: { entityId: null, versionId: null, contentHash: null, collectedAt: null, status: null },
      posteriorAoPacote: true, hierarchy: { level: "CURRENT_SUFFICIENT_SERP", note: "forçado" }, etag: "e", page: null, data: {},
    });
    assert.equal(forcado.hierarchyLevel, "OTHER_RADAR_EVIDENCE", `${family} não sobe a SERP vigente nem se pedido`);
    assert.equal(forcado.supersedes, false);
    assert.equal(forcado.posteriorAoPacote, true);
  }
  for (const family of ["dna.article", "dna.silo", "dna.keyword", "dna.brand", "brand.skill"] as WriterEvidenceFamily[]) {
    assert.equal(writerEvidenceHierarchyOf({ family }).level, "ARTICLE_DNA_HYPOTHESIS", family);
  }
});

test("envelope · origem, uso de pesquisa, o que o Redator não pode, guardas de FAQ e de terceiros", () => {
  const envelope = writerEvidenceEnvelope({
    sourceKey: "radar.bundle.observed.questions", family: "radar.bundle",
    origin: { entityId: "bundle:1", versionId: "bundle:1", contentHash: "bundle-hash:1", collectedAt: "2026-09-14T23:49:44+00:00", status: "frozen" },
    posteriorAoPacote: true, hierarchy: { level: "OTHER_RADAR_EVIDENCE", note: null }, etag: writerEvidenceEtag(["a"]),
    writerMayNot: null, page: null, data: [1, 2],
  });
  assert.equal(envelope.origin.module, "radar");
  assert.equal(envelope.frozen, true);
  assert.equal(envelope.posteriorAoPacote, false, "o próprio pacote nunca é posterior a si mesmo");
  assert.equal(envelope.supersedes, false);
  assert.equal(envelope.usage, "research_only");
  assert.deepEqual([...envelope.writerMayNot], [...RADAR_WRITER_MAY_NOT]);
  assert.ok(envelope.guards.some(guarda => /FAQ/.test(guarda) && /Não gerar nem sugerir/.test(guarda)));
  assert.ok(envelope.guards.some(guarda => /terceiros/.test(guarda) && /não copiar/.test(guarda)));
  assert.deepEqual([...WRITER_EVIDENCE_GUARDS], [...envelope.guards]);
  assert.equal(writerEvidenceEtag(["x", 1]), writerEvidenceEtag(["x", 1]));
  assert.notEqual(writerEvidenceEtag(["x", 1]), writerEvidenceEtag(["x", 2]));
});

test("teto da resposta · o envelope nunca passa de 32 kB; o cursor recua para o primeiro item que saiu", () => {
  const itens = Array.from({ length: 60 }, (_, indice) => ({ at: indice, value: { texto: "w".repeat(900) } }));
  const envelope = writerEvidenceEnvelope({
    sourceKey: "run.extractions", family: "run", origin: { entityId: null, versionId: null, contentHash: null, collectedAt: null, status: null },
    posteriorAoPacote: false, hierarchy: { level: "OTHER_RADAR_EVIDENCE", note: null }, etag: "e",
    page: { container: "array", cursor: "0", next: "60", total: 200, data: itens, omitted: [], truncatedStrings: 0 },
  });
  assert.ok(writerEvidenceJsonBytes(envelope) > WRITER_EVIDENCE_LIMITS.sliceMaxBytes);
  const cabe = fitWriterEvidenceEnvelope(envelope)!;
  assert.ok(writerEvidenceJsonBytes(cabe) <= WRITER_EVIDENCE_LIMITS.sliceMaxBytes);
  const mantidos = cabe.data as Array<{ at: number }>;
  assert.equal(cabe.page?.next, String(mantidos.length));
  assert.ok(mantidos.length > 10);
  const texto = writerEvidenceEnvelope({
    sourceKey: "video.transcript/x", family: "video.transcript", origin: { entityId: null, versionId: null, contentHash: null, collectedAt: null, status: null },
    posteriorAoPacote: false, hierarchy: { level: "OTHER_RADAR_EVIDENCE", note: null }, etag: "e",
    page: { container: "string", cursor: "100", next: null, total: 90_000, data: "t".repeat(40_000), omitted: [], truncatedStrings: 0 },
  });
  const textoCabe = fitWriterEvidenceEnvelope(texto)!;
  assert.ok(writerEvidenceJsonBytes(textoCabe) <= WRITER_EVIDENCE_LIMITS.sliceMaxBytes);
  assert.equal(textoCabe.page?.next, String(100 + (textoCabe.data as string).length));
});

test("listagem de terceiros · trechos longos cortados em 300 caracteres, integral fica na página do item", () => {
  const { value, truncated } = truncateWriterThirdPartyText([{ titulo: "curto", trecho: "á".repeat(301), aninhado: { mais: "b".repeat(1_000) } }]);
  const [item] = value as Array<{ titulo: string; trecho: string; aninhado: { mais: string } }>;
  assert.equal(truncated, 2);
  assert.equal(item.titulo, "curto");
  assert.equal([...item.trecho].length, 301);
  assert.ok(item.trecho.endsWith("…"));
  assert.equal(item.aninhado.mais.length, 301);
  const linhas = writerSliceRowsOf([{ trecho: "c".repeat(500) }], { offset: 0, limit: 5, maxBytes: 16_384 });
  const listagem = writerEvidencePageOf(linhas, { offset: 0, baseKey: "run.youtube.universe", truncate: true });
  assert.equal(listagem.truncatedStrings, 1);
});

const fonte = (indice: number): WriterManifestSourceRow => ({
  sourceKey: `dna.keyword/00000000-0000-4000-8000-${String(indice).padStart(12, "0")}`, owner: "minerador", status: "fixed",
  level: "ARTICLE_DNA_HYPOTHESIS", bytes: 3_800, items: null, etag: writerEvidenceEtag([indice]), observedAt: "2026-09-20T10:00:00+00:00",
  posteriorAoPacote: false, note: `v${indice}; há v${indice + 1} mais nova (não substitui a fixada)`,
});

test("manifesto · ≤ 8 kB; cede primeiro a profundidade do dossiê, nunca uma fonte externa nem uma ausência", () => {
  const nivel3 = Array.from({ length: 60 }, (_, indice) => ({ path: ["observed", "evidence", `chave${indice}`], bytes: 1_000 + indice, items: 3, depth: 3 }));
  const nivel2 = Array.from({ length: 40 }, (_, indice) => ({ path: ["observed", `secao${indice}`], bytes: 20_000 + indice, items: 10, depth: 2 }));
  const nivel1 = ["research", "competitiveBlueprint", "observed", "video", "specialist", "limitations"].map(chave => ({ path: [chave], bytes: 2_000, items: 4, depth: 1 }));
  const fontes = Array.from({ length: 30 }, (_, indice) => fonte(indice));
  const ausentes = Array.from({ length: 6 }, (_, indice) => ({ sourceKey: `dna.keyword.presentation/kw-${indice}`, owner: "minerador" as const, reason: "sem vínculo determinístico" }));
  const manifesto = buildWriterEvidenceManifest({
    documentId: "writer:doc", articleId: "artigo", brandId: "marca", generatedAt: "2026-09-23T12:00:00+00:00", sizes: "measured",
    bundle: { bundleId: "bundle:1", bundleHash: "bundle-hash:1", profile: "GOOGLE", observedAt: null, level: "OTHER_RADAR_EVIDENCE", levelOverrides: {}, etag: "e", rows: [...nivel3, ...nivel2, ...nivel1] },
    sources: fontes, absent: ausentes, notices: ["aviso"],
  });
  assert.ok(manifesto, "coube");
  assert.ok(writerEvidenceJsonBytes(manifesto) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes, `${writerEvidenceJsonBytes(manifesto)} B`);
  assert.equal(manifesto.sources.length, 30);
  assert.equal(manifesto.absent.length, 6);
  assert.ok(manifesto.omittedBundleDepth !== null && manifesto.omittedBundleDepth <= 3);
  assert.equal(manifesto.bundle!.keyPrefix, "radar.bundle.");
  assert.ok(manifesto.bundle!.entries.every(([caminho]) => caminho.split(".").length < manifesto.omittedBundleDepth!));
  assert.deepEqual(manifesto.sources.map(linha => linha[0]), [...manifesto.sources.map(linha => linha[0])].sort());
  const pequeno = buildWriterEvidenceManifest({
    documentId: "d", articleId: "a", brandId: "b", generatedAt: "g", sizes: "unknown_migration_pending",
    bundle: null, sources: fontes.slice(0, 2), absent: [], notices: [],
  })!;
  assert.equal(pequeno.omittedBundleDepth, null);
  assert.equal(pequeno.sources[0][6], 1, "páginas estimadas por 16 kB");
  const impossivel = buildWriterEvidenceManifest({
    documentId: "d", articleId: "a", brandId: "b", generatedAt: "g", sizes: "measured", bundle: null,
    sources: Array.from({ length: 200 }, (_, indice) => fonte(indice)), absent: [], notices: [],
  });
  assert.equal(impossivel, null, "o manifesto recusa passar do teto em vez de cortar fonte em silêncio");
});

test("manifesto · com a forma medida no documento GOOGLE (18/56/108 chaves) o 2º nível do dossiê cabe", () => {
  const nivel1 = Array.from({ length: 18 }, (_, indice) => ({ path: [`secaoDoPacote${indice}`], bytes: 4_000_000 + indice, items: 20, depth: 1 }));
  const nivel2 = Array.from({ length: 56 }, (_, indice) => ({ path: ["observed", `secaoObservada${indice}`], bytes: 1_400_000 + indice, items: 300, depth: 2 }));
  const nivel3 = Array.from({ length: 108 }, (_, indice) => ({ path: ["observed", "evidence", `chave${indice}`], bytes: 900_000 + indice, items: 40, depth: 3 }));
  const uuid = (indice: number) => `00000000-0000-4000-8000-${String(indice).padStart(12, "0")}`;
  const linha = (sourceKey: string, owner: WriterManifestSourceRow["owner"], note: string, bytes: number | null = 40_000): WriterManifestSourceRow => ({
    sourceKey, owner, status: "fixed", level: "OTHER_RADAR_EVIDENCE", bytes, items: 12, etag: writerEvidenceEtag([sourceKey]),
    observedAt: "2026-09-20T10:00:00+00:00", posteriorAoPacote: false, note,
  });
  const fontes = [
    linha(`dna.article/${uuid(1)}`, "arquiteto", "v2; há v3 mais nova (não substitui a fixada)", 73_181),
    ...[2, 3, 4, 5].map(indice => linha(`dna.keyword/${uuid(indice)}`, "minerador", "v2; há v3 mais nova (não substitui a fixada)", 4_118)),
    linha("dna.keyword.metrics", "minerador", "volume, KGR, allintitle, CPC e KD pelo snapshot canônico do Minerador; vigentes, não fixados no documento", null),
    ...[6, 7, 8].map(indice => linha(`video.transcript/${uuid(indice)}`, "radar", "Canal de dermatologia; texto v2 (pt)", 43_184)),
    linha("serp.radar.snapshot", "radar", "snapshot da versão de análise entregue; revisão humana: nenhuma", 10_516),
    linha("run.extractions", "radar", "corrida da versão entregue; pesquisa, não matéria-prima", 846_445),
    linha("run.competitiveReport", "radar", "corrida da versão entregue; pesquisa, não matéria-prima", 741_028),
    linha("serp.architect.formation", "arquiteto", "parecer SERP de formação sem o assessment bruto (assessment: 91897 B em #assessment)", 1_537),
    linha(`graph.article/graph:${uuid(9)}:v2`, "arquiteto", "versão congelada pelo Radar; arestas de entrada e saída do artigo", null),
    linha(`brand.skill/${uuid(10)}`, "marca", `Skill da Marca skill:${uuid(10)} v1; não fixada no documento`, 44_510),
    linha("brand.site.catalog", "marca", "páginas do site da Marca: url, título, h1, tipo; paginado", null),
  ];
  const ausentes = ["dna.silo", "dna.siloPage", "dna.keyword.presentation/*", "serp.cache/*", "serp.architect.territorial", "publication.self", "dna.brand/current"]
    .map(sourceKey => ({ sourceKey, owner: "arquiteto" as const, reason: "sem vínculo determinístico com o artigo; ausência declarada" }));
  const manifesto = buildWriterEvidenceManifest({
    documentId: "writer:0e9f3b1c-8a3d-4a8e-9d44-6d4a1f0b2c7e", articleId: "article:0e9f3b1c-8a3d-4a8e-9d44-6d4a1f0b2c7e", brandId: "00000000-0000-4000-8000-000000000001",
    generatedAt: "2026-09-23T12:00:00.000Z", sizes: "measured",
    bundle: { bundleId: "bundle:1a2b3c4d5e6f", bundleHash: "bundle-hash:1a2b3c4d5e6f", profile: "GOOGLE", observedAt: "2026-09-14T23:49:44.887Z", level: "CURRENT_SUFFICIENT_SERP", levelOverrides: { "radar.bundle.specialist": "QUALIFIED_SPECIALIST" }, etag: "e", rows: [...nivel1, ...nivel2, ...nivel3] },
    sources: fontes, absent: ausentes, notices: ["migration_pendente: aviso longo o bastante para ocupar espaço real no manifesto."],
  });
  assert.ok(manifesto);
  assert.ok(writerEvidenceJsonBytes(manifesto) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes);
  assert.equal(fontes.length, 16);
  assert.equal(manifesto.omittedBundleDepth, 3, "cai o 3º nível; o 2º fica");
  assert.equal(manifesto.bundle!.entries.length, 18 + 56);
  assert.deepEqual(manifesto.levels.slice(0, 4), ["ARTICLE_INVARIANT", "PRIMARY_FACTUAL_EVIDENCE", "QUALIFIED_SPECIALIST", "CURRENT_SUFFICIENT_SERP"]);
  assert.ok(manifesto.sources.every(item => manifesto.levels[item[3] - 1] === "OTHER_RADAR_EVIDENCE"));
  const pesado = buildWriterEvidenceManifest({
    documentId: "d", articleId: "a", brandId: "b", generatedAt: "g", sizes: "measured",
    bundle: { bundleId: "b", bundleHash: "h", profile: "GOOGLE", observedAt: null, level: "OTHER_RADAR_EVIDENCE", levelOverrides: {}, etag: "e", rows: [...nivel1, ...nivel2, ...nivel3] },
    sources: Array.from({ length: 30 }, (_, indice) => fonte(indice)), absent: ausentes, notices: [],
  });
  assert.ok(pesado && writerEvidenceJsonBytes(pesado) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes, "com 30 fontes cede nível e nota, mas cabe");
  assert.equal(pesado.sources.length, 30, "nenhuma fonte cortada");
});

test("fundamentos · ≤ 24 kB, cortando listas pela metade e dizendo onde ler o resto", () => {
  const fundamentos = {
    fixo: "x".repeat(2_000),
    competitors: Array.from({ length: 200 }, (_, indice) => ({ url: `https://c.test/${indice}`, title: "t".repeat(120) })),
    questions: Array.from({ length: 150 }, (_, indice) => ({ question: `pergunta ${indice} ${"q".repeat(80)}` })),
    video: { results: Array.from({ length: 30 }, () => ({ topic: "v".repeat(100) })) },
  };
  const ondeLer = { competitors: "a", questions: "b", "video.results": "c", conflicts: "d", limitations: "e", "specialist.items": "f", pendingDecisions: "g" };
  const cabe = fitWriterFoundations(fundamentos, ondeLer)!;
  assert.ok(writerEvidenceJsonBytes(cabe) <= WRITER_EVIDENCE_LIMITS.foundationsMaxBytes);
  const cortes = cabe.trimmed;
  assert.equal(cortes[0].field, "competitors");
  assert.equal(cortes[0].total, 200);
  assert.equal(cortes[0].kept, (cabe.competitors as unknown[]).length);
  assert.equal(cortes[0].readAt, "a");
  assert.equal(cabe.fixo, fundamentos.fixo);
  assert.equal(fitWriterFoundations({ fixo: "x".repeat(30_000) }, ondeLer), null);
});

test("lista fechada sem migration · só seções medidas com folga; as grandes exigem a função SQL", () => {
  for (const caminho of [["observed", "questions"], ["observed", "competitors"], ["video"], ["specialist"], ["limitations"], ["observed", "gaps"]]) {
    assert.ok(writerBundlePathReadableWithoutMigration(caminho), caminho.join("."));
  }
  for (const caminho of [["observed", "externalSources"], ["observed", "evidence"], ["observed", "structure"], ["observed", "differentiations"],
    ["competitiveBlueprint"], ["observed", "authorityEvidence"], ["observed", "concepts"], ["observed"], ["observed", "questions", "0"], ["inventado"]]) {
    assert.equal(writerBundlePathReadableWithoutMigration(caminho), false, caminho.join("."));
  }
});
