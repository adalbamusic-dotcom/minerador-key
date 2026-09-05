import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSitemapView, sitemapPathOf } from "../lib/arquiteto/sitemap-view.ts";
import {
  ARTICLE_PIPELINE_SECTION_ORDER,
  articlePipelineStateOf,
  buildArticlePipelineRows,
} from "../lib/arquiteto/article-pipeline.ts";

const REF_CONF = "territory:11111111-1111-4111-8111-111111111111";
const REF_CAND = "territory:22222222-2222-4222-8222-222222222222";

const workspaceSource = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const entry = (normalizedUrl: string, extra: Record<string, unknown> = {}) => ({
  normalizedUrl,
  discoveredUrl: `https://${normalizedUrl}`,
  resolvedUrl: `https://${normalizedUrl}`,
  declaredCanonicalUrl: `https://${normalizedUrl}`,
  normalizedCanonicalUrl: normalizedUrl,
  title: null,
  h1: null,
  pageType: "page",
  verificationStatus: "canonical_confirmed",
  presenceState: "present",
  ...extra,
});

/* ───────────────────────────────── Parte A · visão Sitemap ─────────────── */

test("catálogo vazio tem motivo legível, não erro nem lista fantasma", () => {
  const view = buildSitemapView({ catalog: [] });

  assert.deepEqual(view.rows, []);
  assert.match(view.emptyReason!, /Sincronize o sitemap/);
  assert.equal(view.counts.pages, 0);
});

test("a hierarquia vem do caminho observado, com pai antes dos filhos", () => {
  const view = buildSitemapView({
    catalog: [
      entry("site.com.br/anti-idade/filho-b"),
      entry("site.com.br/anti-idade"),
      entry("site.com.br/anti-idade/filho-a"),
      entry("site.com.br/barreira"),
    ],
  });

  assert.deepEqual(view.rows.map(row => row.path), [
    "/anti-idade", "/anti-idade/filho-a", "/anti-idade/filho-b", "/barreira",
  ]);
  const pai = view.rows[0];
  assert.equal(pai.depth, 0);
  assert.equal(pai.childCount, 2);
  assert.equal(view.rows[1].depth, 1);
  assert.equal(view.rows[3].childCount, 0);
});

test("o rótulo prefere o H1 observado e nunca inventa texto", () => {
  const view = buildSitemapView({
    catalog: [
      entry("site.com.br/a", { h1: "Anti-idade e Retinol" }),
      entry("site.com.br/b", { title: "Só título" }),
      entry("site.com.br/c"),
    ],
  });

  assert.equal(view.rows[0].label, "Anti-idade e Retinol");
  assert.equal(view.rows[1].label, "Só título");
  assert.equal(view.rows[2].label, "c");
  assert.equal(view.rows[2].h1, null, "sem H1 observado a coluna fica vazia, não preenchida");
});

test("a relação com Silo sai do read-model real, com os cinco estados", () => {
  const view = buildSitemapView({
    catalog: [
      entry("site.com.br/confirmado"),
      entry("site.com.br/candidato"),
      entry("site.com.br/legado"),
      entry("site.com.br/estrutura"),
      entry("site.com.br/solta"),
    ],
    structures: [
      { normalizedUrl: "site.com.br/confirmado", reconciledSiloId: null, promotedTerritoryRef: REF_CONF },
      { normalizedUrl: "site.com.br/candidato", reconciledSiloId: null, promotedTerritoryRef: REF_CAND },
      { normalizedUrl: "site.com.br/legado", reconciledSiloId: "silo-legado", promotedTerritoryRef: null },
      { normalizedUrl: "site.com.br/estrutura", reconciledSiloId: null, promotedTerritoryRef: null },
    ],
    territories: [
      { territoryRef: REF_CONF, name: "Anti-idade", centralEntity: "retinol", lifecycleStatus: "confirmed" },
      { territoryRef: REF_CAND, name: "Barreira", centralEntity: "barreira", lifecycleStatus: "candidate" },
    ],
    existingStructures: [{ siloId: "silo-legado", name: "Skin care" }],
  });

  const por = (path: string) => view.rows.find(row => row.path === path)!;
  assert.equal(por("/confirmado").relation.kind, "silo_confirmed");
  assert.equal(por("/confirmado").relation.label, "Anti-idade");
  assert.equal(por("/candidato").relation.kind, "silo_candidate");
  assert.equal(por("/legado").relation.kind, "already_silo");
  assert.equal(por("/legado").relation.label, "Skin care");
  assert.equal(por("/estrutura").relation.kind, "existing_structure");
  assert.equal(por("/solta").relation.kind, "unevaluated");
});

test("página que já é Silo não oferece promoção de novo", () => {
  const view = buildSitemapView({
    catalog: [entry("site.com.br/ja-silo"), entry("site.com.br/livre")],
    structures: [{ normalizedUrl: "site.com.br/ja-silo", reconciledSiloId: null, promotedTerritoryRef: REF_CAND }],
    territories: [{ territoryRef: REF_CAND, name: "Barreira", centralEntity: "barreira", lifecycleStatus: "candidate" }],
  });

  assert.equal(view.rows.find(row => row.path === "/ja-silo")!.canPromote, false);
  assert.equal(view.rows.find(row => row.path === "/livre")!.canPromote, true);
  assert.equal(view.counts.linked, 1);
  assert.equal(view.counts.promotable, 1);
});

test("a visão não lê nada além do snapshot recebido", () => {
  const source = readFileSync("lib/arquiteto/sitemap-view.ts", "utf8")
    .split("\n").filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//")).join("\n");

  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(source, /fetch\(|supabase/i);
});

test("sitemapPathOf normaliza host e barra final", () => {
  assert.equal(sitemapPathOf("site.com.br/a/b/"), "/a/b");
  assert.equal(sitemapPathOf("https://site.com.br/a"), "/a");
  assert.equal(sitemapPathOf("site.com.br"), "/");
});

/* ──────────────────────── Parte B · continuidade na aba Artigos ────────── */

const kw = (id: string, extra: Record<string, unknown> = {}) => ({ id, keyword: `kw ${id}`, ...extra });

const projecao = (
  keywords: ReturnType<typeof kw>[],
  emArtigos: string[] = [],
  reservadas: string[] = [],
) => buildArticlePipelineRows({
  keywords,
  confirmedTerritoryRefs: new Set([REF_CONF]),
  reservedHeadKeywordIds: new Set(reservadas),
  keywordIdsInArticles: new Set(emArtigos),
  territoryNames: new Map([[REF_CONF, "Anti-idade"], [REF_CAND, "Barreira"]]),
});

test("toda keyword continua rastreável ao trocar de aba", () => {
  const keywords = [
    kw("k1", { territoryRef: REF_CONF }),
    kw("k2", { territoryRef: REF_CONF }),
    kw("k3", { territoryRef: REF_CAND }),
    kw("k4"),
    kw("k5", { territoryRef: REF_CONF }),
  ];

  const { rows, counts } = projecao(keywords, ["k1", "k2"], ["k5"]);

  // 5 KeywordDNAs: 2 viraram artigo, 3 continuam visíveis como pipeline.
  assert.equal(counts.article_working, 2);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.keywordId), ["k3", "k4", "k5"]);
  const total = Object.values(counts).reduce((soma, valor) => soma + valor, 0);
  assert.equal(total, keywords.length, "nenhuma keyword pode sumir da contagem");
});

test("os quatro estados bloqueados têm motivo próprio", () => {
  const { rows } = projecao(
    [kw("k1", { territoryRef: REF_CAND }), kw("k2"), kw("k3", { territoryRef: REF_CONF })],
    [],
    ["k3"],
  );

  const por = (id: string) => rows.find(row => row.keywordId === id)!;
  assert.equal(por("k1").state, "awaiting_silo_confirmation");
  assert.match(por("k1").reason, /Aguardando confirmação do Silo/);
  assert.equal(por("k1").siloName, "Barreira", "a linha cita o silo real do vínculo");
  assert.equal(por("k2").state, "awaiting_silo");
  assert.match(por("k2").reason, /Aguardando definição de Silo/);
  assert.equal(por("k2").siloName, null, "sem vínculo não há nome inventado");
  assert.equal(por("k3").state, "reserved_silo_head");
  assert.match(por("k3").reason, /Reservada para a página do Silo/);
});

test("a reserva da cabeceira vence o silo confirmado", () => {
  const state = articlePipelineStateOf({
    keyword: kw("k1", { territoryRef: REF_CONF }),
    confirmedTerritoryRefs: new Set([REF_CONF]),
    reservedHeadKeywordIds: new Set(["k1"]),
    keywordIdsInArticles: new Set(),
  });

  assert.equal(state, "reserved_silo_head");
});

test("confirmar o Silo destrava a keyword sem nova importação", () => {
  const keyword = kw("k1", { territoryRef: REF_CAND });
  const comum = { keyword, reservedHeadKeywordIds: new Set<string>(), keywordIdsInArticles: new Set<string>() };

  const antes = articlePipelineStateOf({ ...comum, confirmedTerritoryRefs: new Set() });
  const depois = articlePipelineStateOf({ ...comum, confirmedTerritoryRefs: new Set([REF_CAND]) });

  assert.equal(antes, "awaiting_silo_confirmation");
  assert.equal(depois, "eligible");
});

test("patrimônio publicado e silo legado não ficam esperando decisão", () => {
  const { rows } = projecao([kw("k1", { isPublished: true }), kw("k2", { siloId: "silo-legado", siloName: "Skin care" })]);

  assert.deepEqual(rows.map(row => row.state), ["eligible", "eligible"]);
  assert.equal(rows[1].siloName, "Skin care");
});

test("a linha de pipeline não fabrica identidade de Article", () => {
  const source = readFileSync("lib/arquiteto/article-pipeline.ts", "utf8")
    .split("\n").filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//")).join("\n");

  assert.doesNotMatch(source, /articleId|workingArticleId|ArticleDNA/);
  assert.doesNotMatch(source, /localStorage|fetch\(/);
  // A identidade é a da keyword, e é isso que a projeção devolve.
  assert.match(source, /keywordId: String\(keyword\.id\)/);
});

test("a ordem das seções vai do que já pode formar ao que está reservado", () => {
  assert.deepEqual([...ARTICLE_PIPELINE_SECTION_ORDER], [
    "eligible", "awaiting_silo_confirmation", "awaiting_silo", "reserved_silo_head",
  ]);
});

/* ─────────────────────── continuidade dentro do workspace ──────────────── */

test("a aba Artigos monta as linhas de pipeline no MESMO shell da mesa", () => {
  assert.match(workspaceSource, /buildArticlePipelineRows/);
  assert.match(workspaceSource, /ArticlePipelineRows/);
  // Nenhuma segunda tabela: a mesa continua sendo uma só.
  const tabelas = workspaceSource.match(/<table data-architect-table=/g) || [];
  assert.equal(tabelas.length, 1, "uma mesa só entre Silos, Artigos e Links");
});

test("a visão Sitemap é projeção da aba Silos, não rota nem aba nova", () => {
  assert.match(workspaceSource, /siloView/);
  assert.match(workspaceSource, /buildSitemapView/);
  // Continuam existindo exatamente três abas de trabalho.
  assert.doesNotMatch(workspaceSource, /workspaceMode === "sitemap"/);
});

test("a busca alcança keyword bloqueada, sem depender de artigo", () => {
  const inicio = workspaceSource.indexOf("const visiblePipelineRows");
  assert.ok(inicio > 0, "as linhas de pipeline precisam passar pelo filtro de busca");
  const trecho = workspaceSource.slice(inicio, inicio + 620);
  assert.match(trecho, /searchTerm|search/i);
  assert.doesNotMatch(trecho, /workingArticleId/);
});
