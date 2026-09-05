import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTerritorialLandscape,
  territorialLandscapeIsEmpty,
  territorialLandscapeIsReadable,
  type TerritorialLandscapeInput,
} from "../lib/arquiteto/territorial-landscape.ts";
import type { KeywordTerritoryAssignment, TerritoryCandidate } from "../lib/arquiteto/territory.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const landscapeSource = readFileSync("lib/arquiteto/territorial-landscape.ts", "utf8");

const BRAND = "brand-1";
const OTHER_BRAND = "brand-2";

const territory = (territoryRef: string, overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate => ({
  schemaVersion: 1,
  territoryRef,
  brandId: BRAND,
  existingSiloRef: null,
  name: `Território ${territoryRef}`,
  centralEntity: "sérum facial",
  macroIntent: "informacional",
  boundary: { includes: ["sérum"], excludes: ["maquiagem"] },
  narrative: { summary: "Universo de sérum facial.", relationToBrand: "core", editorialAngle: null },
  discovery: { origin: "manual_strategic", evidence: [], detectedAt: "2026-09-02T12:00:00.000Z" },
  territoryKind: "new",
  architecturalOrigin: "manual_strategic",
  ingestionOrigin: "ui",
  publicationProtection: "unpublished",
  lifecycleStatus: "candidate",
  decisionState: "pending",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFrom: null, mergedFrom: [], supersededBy: null },
  conflicts: [],
  pendingOperation: null,
  ...overrides,
} as TerritoryCandidate);

const assignment = (
  keywordId: string,
  territoryRef: string | null,
  overrides: Partial<KeywordTerritoryAssignment> = {},
): KeywordTerritoryAssignment => ({
  keywordId,
  brandId: BRAND,
  territoryRef,
  state: territoryRef ? "assigned" : "unassigned",
  reason: territoryRef ? "Decisão humana." : "Ainda sem território.",
  source: "human",
  decidedAt: "2026-09-02T12:00:00.000Z",
  ...overrides,
} as KeywordTerritoryAssignment);

const keyword = (id: string, extra: Record<string, unknown> = {}) => ({ id, brand_id: BRAND, keyword: `kw ${id}`, ...extra });

const landscape = (input: Partial<TerritorialLandscapeInput> = {}) => buildTerritorialLandscape({
  brandId: BRAND,
  keywords: [],
  territories: [],
  assignments: [],
  ...input,
});

test("Brand sem território nem Silo tem estado vazio válido, não erro", () => {
  const vazio = landscape();

  assert.equal(territorialLandscapeIsReadable(vazio), true);
  assert.equal(territorialLandscapeIsEmpty(vazio), true);
  assert.equal(vazio.consistency.consistent, true);
  assert.deepEqual(vazio.consistency.issues, []);
  assert.equal(vazio.counts.keywordsInScope, 0);
  // Abrir Silos não depende de ArticleDNA nenhum.
  assert.deepEqual(vazio.legacyNeedsReconciliation, []);
});

test("território candidato e confirmado são projetados em coleções distintas", () => {
  const resultado = landscape({
    keywords: [keyword("kw-1"), keyword("kw-2")],
    territories: [
      territory("territory:cand"),
      territory("territory:conf", { lifecycleStatus: "confirmed", decisionState: "confirmed" }),
    ],
    assignments: [assignment("kw-1", "territory:cand"), assignment("kw-2", "territory:conf")],
  });

  assert.deepEqual(resultado.candidateTerritories.map(item => item.territoryRef), ["territory:cand"]);
  assert.deepEqual(resultado.confirmedTerritories.map(item => item.territoryRef), ["territory:conf"]);
  assert.deepEqual(resultado.candidateTerritories[0].keywordRefs, ["kw-1"]);
  assert.equal(resultado.counts.keywordsAssigned, 2);
  assert.equal(resultado.counts.keywordsUnassigned, 0);
  assert.equal(territorialLandscapeIsEmpty(resultado), false);
});

test("keyword sem território fica explicitamente pendente e nunca desaparece", () => {
  const resultado = landscape({
    keywords: [keyword("kw-1"), keyword("kw-sem-decisao")],
    territories: [territory("territory:a")],
    assignments: [assignment("kw-1", "territory:a")],
  });

  const pendente = resultado.unassignedKeywords.find(entry => entry.keywordId === "kw-sem-decisao");
  assert.ok(pendente, "INV-T2: keyword importada não some da paisagem");
  assert.equal(pendente.state, "unassigned");
  assert.match(pendente.reason, /sem decisão de silo/i);
  assert.equal(resultado.counts.keywordsInScope, 2);
  assert.equal(resultado.counts.keywordsUnassigned, 1);
});

test("cross-brand é isolado, nunca projetado", () => {
  const resultado = landscape({
    keywords: [keyword("kw-1"), { id: "kw-outra", brand_id: OTHER_BRAND, keyword: "de outra brand" }],
    territories: [territory("territory:a"), territory("territory:outra", { brandId: OTHER_BRAND })],
    assignments: [assignment("kw-1", "territory:a"), assignment("kw-outra", "territory:outra", { brandId: OTHER_BRAND })],
  });

  assert.deepEqual(resultado.candidateTerritories.map(item => item.territoryRef), ["territory:a"]);
  assert.equal(resultado.counts.keywordsInScope, 1);
  assert.equal(resultado.unassignedKeywords.some(entry => entry.keywordId === "kw-outra"), false);
  assert.equal(resultado.consistency.consistent, true, "o de outra Brand é isolado, não vira inconsistência daqui");
});

test("referência quebrada é classificada como inconsistência estrutural", () => {
  const resultado = landscape({
    keywords: [keyword("kw-1")],
    territories: [territory("territory:a")],
    assignments: [assignment("kw-1", "territory:inexistente")],
  });

  assert.equal(resultado.consistency.consistent, false);
  assert.ok(resultado.consistency.issues.some(issue => issue.code === "ORPHAN_TERRITORY_REF"));
});

test("incerteza editorial da KeywordDNA não vira inconsistência", () => {
  const cru = keyword("kw-1", {
    intent: null,
    funil: null,
    kgr_score: null,
    kgr_aplicabilidade: null,
    analise_semantica: { confianca: null, ambiguidade: "alta", semantic_state: "non_conclusive" },
    serpState: "mista",
    aiReview: null,
  });

  const resultado = landscape({
    keywords: [cru],
    territories: [territory("territory:a")],
    assignments: [assignment("kw-1", "territory:a")],
  });

  assert.equal(resultado.consistency.consistent, true);
  assert.deepEqual(resultado.consistency.issues, []);
  // O Arquiteto não requalifica o Minerador: o dado cru atravessa intacto.
  assert.equal(resultado.counts.keywordsAssigned, 1);
});

test("Silo existente entra como âncora de leitura, não como território", () => {
  const resultado = landscape({
    keywords: [keyword("kw-1", { silo_id: "silo-legado", status: "publicado" })],
    territories: [],
    assignments: [],
    siloDnas: [{
      versionId: "v1", entityId: "silo-legado", versionNumber: 1, previousVersionId: null,
      contentHash: `sha256:${"a".repeat(64)}`, origin: "human", changeReason: "seed",
      createdAt: "2026-09-02T12:00:00.000Z", createdBy: "user-1",
      payload: { siloId: "silo-legado", name: "Sérum facial", brandId: BRAND },
    } as never],
  });

  assert.equal(resultado.existingStructures.length, 1);
  const estrutura = resultado.existingStructures[0];
  assert.equal(estrutura.siloId, "silo-legado");
  assert.equal(estrutura.sourceKind, "silo_dna");
  assert.equal(estrutura.anchoredByTerritoryRef, null, "âncora sem território declarado");
  assert.deepEqual(estrutura.keywordRefs, ["kw-1"]);
  // Território != SiloDNA: a estrutura existente não vira território sozinha.
  assert.equal(resultado.candidateTerritories.length, 0);
  assert.equal(resultado.confirmedTerritories.length, 0);
  // E a keyword continua sem membership declarada.
  assert.equal(resultado.unassignedKeywords[0].keywordId, "kw-1");
});

test("keyword publicada sem SiloDNA vigente declara a origem real da evidência", () => {
  const resultado = landscape({
    keywords: [keyword("kw-1", { lista_id: "lista-antiga", status: "publicado" })],
  });

  const estrutura = resultado.existingStructures[0];
  assert.equal(estrutura.sourceKind, "published_keyword");
  assert.equal(estrutura.versionId, null, "sem SiloDNA não se inventa versão");
  assert.equal(estrutura.isPublished, true);
});

test("cada fonte declara presença e contagem; ausente é registrada como ausente", () => {
  const resultado = landscape({ keywords: [keyword("kw-1")] });

  const porFonte = new Map(resultado.sources.map(source => [source.sourceKind, source]));
  assert.equal(porFonte.get("territory_record")?.present, false);
  assert.equal(porFonte.get("silo_dna")?.present, false);
  assert.equal(porFonte.get("brand_registry")?.present, false, "marcas.silos_existentes não é lido hoje");
  assert.equal(porFonte.size, 7);
  assert.equal(porFonte.get("site_catalog")?.present, false, "site sem snapshot é declarado ausente");
  // Nenhum fallback completa a lista.
  assert.equal(resultado.sources.every(source => source.present || source.recordCount === 0), true);
});

test("o read-model é determinístico e não muta a entrada", () => {
  const entrada: TerritorialLandscapeInput = {
    brandId: BRAND,
    keywords: [keyword("kw-2"), keyword("kw-1")],
    territories: [territory("territory:b"), territory("territory:a")],
    assignments: [assignment("kw-1", "territory:a"), assignment("kw-2", "territory:b")],
  };
  const congelado = JSON.stringify(entrada);

  const primeira = buildTerritorialLandscape(entrada);
  const segunda = buildTerritorialLandscape(entrada);

  assert.deepEqual(primeira.candidateTerritories.map(item => item.territoryRef), ["territory:a", "territory:b"]);
  assert.deepEqual(JSON.parse(JSON.stringify(primeira)), JSON.parse(JSON.stringify(segunda)));
  assert.equal(JSON.stringify(entrada), congelado, "a entrada não é mutada");
});

test("Fase 2 é somente leitura: sem provider, sem storage, sem writer", () => {
  assert.doesNotMatch(landscapeSource, /fetch\(|supabase|persist|localStorage|IndexedDB|migration/i);
  assert.doesNotMatch(landscapeSource, /revalidate-structure|dataforseo|deepseek/i);
  // territoryRef nunca é derivado de lista_id nem de siloId (INV-T16).
  assert.doesNotMatch(landscapeSource, /territoryRef\s*[:=]\s*[^n]*(lista_id|siloId)/);
});

test("o trilho visual passou a ser Silos → Artigos → Links internos", () => {
  assert.match(workspace, /\["silos", "articles", "links"\] as const/);
  assert.doesNotMatch(workspace, /\["articles", "silos", "links"\] as const/);
  // Silos passou a ser o default; a URL explícita continua vencendo o fallback.
  assert.match(workspace, /readArchitectAreaFromLocation\([^)]*\), "silos"\)/);
  assert.doesNotMatch(workspace, /readArchitectAreaFromLocation\([^)]*\), "articles"\)/);
});

test("a aba Silos tem cabeçalho próprio na mesma mesa", () => {
  // O cabeçalho da aba Silos depende da PROJEÇÃO escolhida: Sitemap é outra
  // leitura da mesma aba, não uma aba nova.
  assert.match(workspace, /siloView === "sitemap" \? <SitemapViewHeader \/> : <TerritorialWorkspaceHeader \/>/);
  // Uma tabela só: Artigos e Links continuam com os cabeçalhos deles.
  assert.equal((workspace.match(/<thead/g) || []).length, 1);

  const rows = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");
  // Colunas condensadas: hipótese e evidência longas foram para a expansão da
  // linha, não sumiram da mesa.
  for (const column of ["Unidade", "Origem", "Página / Slug", "Estado", "Processamento", "Decisão", "Status"]) {
    assert.ok(rows.includes(column), `coluna territorial ausente: ${column}`);
  }
  // Semântica de Article não atravessa para a aba territorial.
  assert.doesNotMatch(rows, /Keyword principal|Definição do artigo|Revisão IA/);
});

test("o vazio de Article não apaga a mesa territorial", () => {
  assert.match(workspace, /workspaceMode !== "silos" && filteredArticles\.length === 0/);
});

test("a bancada da aba Silos conta a estrutura de silos, não só SiloDNA", () => {
  // Resumo condensado: o detalhe por silo passou a viver na coluna
  // Processamento da própria mesa, em vez de uma linha longa no topo.
  assert.match(workspace, /Silos`/);
  assert.match(workspace, /estruturas`/);
  assert.match(workspace, /keywords sem Silo`/);
  assert.match(workspace, /Processamento: SERP /);
});

test("a instrução de ação humana descreve a unidade da aba", () => {
  assert.match(workspace, /Selecione uma keyword, silo ou estrutura para revisar a relação com o silo\./);
});

test("o canvas do modo Silos não projeta cenário de Article nem fabrica territoryRef", () => {
  // O id do território entra verbatim; nada é derivado de nome, slug ou siloId.
  assert.match(workspace, /id: territory\.territoryRef,/);
  assert.doesNotMatch(workspace, /territoryRef: `territory:\$\{/);
  assert.match(workspace, /return \{ current: territorialCurrent, logic: territorialLogicSnapshot, serp: territorialCurrent, ai: territorialCurrent \};/);
  // Território não tem pilar nem apoio: os campos de Article ficam vazios.
  assert.match(workspace, /pillarArticleId: null,\n        supportArticleIds: \[\],\n        articleIds: \[\],/);
});

test("o contador da mesa acompanha a unidade do modo", () => {
  assert.match(workspace, /aria-label="Keywords na estrutura de silos"/);
  // Artigos passou a dizer também o que ficou aguardando Silo, para não
  // parecer que as outras keywords sumiram ao trocar de aba.
  assert.match(workspace, /aria-label="Artigos e keywords aguardando decisão de silo"/);
  assert.match(workspace, /aguardando/);
});

test("a SERP de silo existe e é own, nunca a SERP de Article reaproveitada", () => {
  // A aba Silos tem caminho próprio: pergunta arquitetural, não grupo de Article.
  assert.match(workspace, /validateTerritorialSerp/);
  assert.match(workspace, /buildTerritorialSerpQuestions/);
  // A SERP de Article continua sendo dela: nada de reaproveitar o handler.
  assert.doesNotMatch(workspace, /workspaceMode === "silos" \? handleValidateSerp/);
  // Bloqueio, quando existir, precisa dizer o motivo funcional.
  assert.match(workspace, /territorialSerpBlockedReason/);
});
