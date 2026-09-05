import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTerritorialLandscape, type TerritorialLandscapeInput } from "../lib/arquiteto/territorial-landscape.ts";
import { buildTerritorialSurface } from "../lib/arquiteto/territorial-surface.ts";

/**
 * Patrimônio de Silo já existente na Marca.
 *
 * Antes de propor um Silo novo o usuário precisa ver o que já existe. Este
 * inventário lê SÓ fonte canônica: SiloDNA, Página do Silo, keyword publicada e
 * o catálogo remoto `marcas.silos_existentes`. Sitemap não entra aqui.
 */

const BRAND = "brand-1";
const OTHER_BRAND = "brand-2";

const siloDna = (siloId: string, name: string, brandId = BRAND) => ({
  versionId: `v-${siloId}`, entityId: siloId, versionNumber: 1, previousVersionId: null,
  contentHash: `sha256:${"a".repeat(64)}`, origin: "human", changeReason: "seed",
  createdAt: "2026-09-03T12:00:00.000Z", createdBy: "user-1",
  payload: { siloId, name, brandId },
});

const siloPage = (siloId: string, slug: string, publishedUrl: string | null = null) => ({
  versionId: `vp-${siloId}`, entityId: `silo-page:${siloId}`, versionNumber: 1, previousVersionId: null,
  contentHash: `sha256:${"b".repeat(64)}`, origin: "human", changeReason: "seed",
  createdAt: "2026-09-03T12:00:00.000Z", createdBy: "user-1",
  payload: { siloPageId: `silo-page:${siloId}`, siloId, brandId: BRAND, slug, publishedUrl },
});

const landscape = (input: Partial<TerritorialLandscapeInput> = {}) => buildTerritorialLandscape({
  brandId: BRAND, keywords: [], territories: [], assignments: [], ...input,
} as TerritorialLandscapeInput);

const structureOf = (result: ReturnType<typeof landscape>, siloId: string) =>
  result.existingStructures.find(item => item.siloId === siloId);

test("SiloDNA existente aparece com a Página do Silo e o slug reais", () => {
  const resultado = landscape({
    siloDnas: [siloDna("silo-1", "Skincare")] as never,
    siloPages: [siloPage("silo-1", "/skincare")] as never,
  });

  const estrutura = structureOf(resultado, "silo-1");
  assert.ok(estrutura);
  assert.equal(estrutura.sourceKind, "silo_dna");
  assert.equal(estrutura.siloPageId, "silo-page:silo-1");
  assert.equal(estrutura.slug, "/skincare");
  assert.equal(estrutura.isPublished, false, "sem publishedUrl não se declara publicado");
});

test("estrutura publicada é projetada como protegida", () => {
  const resultado = landscape({
    siloDnas: [siloDna("silo-1", "Skincare")] as never,
    siloPages: [siloPage("silo-1", "/skincare", "https://marca.com/skincare")] as never,
  });

  assert.equal(structureOf(resultado, "silo-1")!.isPublished, true);
});

test("silo criado à mão aparece pelo catálogo da Marca, não some da aba", () => {
  const resultado = landscape({
    brandRegistrySilos: [{ id: "silo-manual", nome: "Protetor solar", slug: "/protetor-solar" }],
  });

  const estrutura = structureOf(resultado, "silo-manual");
  assert.ok(estrutura, "o catálogo remoto da Marca é fonte de estrutura existente");
  assert.equal(estrutura.sourceKind, "brand_registry");
  assert.equal(estrutura.name, "Protetor solar");
  assert.equal(estrutura.slug, "/protetor-solar");
  // Registro não é território: promover continua sendo decisão humana.
  assert.equal(estrutura.anchoredByTerritoryRef, null);
  assert.equal(resultado.candidateTerritories.length, 0);

  const fonte = resultado.sources.find(item => item.sourceKind === "brand_registry");
  assert.equal(fonte?.present, true);
  assert.equal(fonte?.recordCount, 1);
});

test("evidência mais forte vence o catálogo, sem duplicar a estrutura", () => {
  const resultado = landscape({
    siloDnas: [siloDna("silo-1", "Skincare consolidado")] as never,
    siloPages: [siloPage("silo-1", "/skincare")] as never,
    brandRegistrySilos: [{ id: "silo-1", nome: "Skincare do catálogo", slug: "/outro" }],
  });

  assert.equal(resultado.existingStructures.filter(item => item.siloId === "silo-1").length, 1);
  const estrutura = structureOf(resultado, "silo-1")!;
  assert.equal(estrutura.sourceKind, "silo_dna");
  assert.equal(estrutura.name, "Skincare consolidado");
});

test("keyword relacionada acompanha a estrutura; sem silo continua visível", () => {
  const resultado = landscape({
    keywords: [
      { id: "kw-1", brand_id: BRAND, keyword: "sérum", silo_id: "silo-1", status: "publicado" },
      { id: "kw-2", brand_id: BRAND, keyword: "creme" },
    ],
    siloDnas: [siloDna("silo-1", "Skincare")] as never,
  });

  assert.deepEqual(structureOf(resultado, "silo-1")!.keywordRefs, ["kw-1"]);
  assert.equal(resultado.unassignedKeywords.some(entry => entry.keywordId === "kw-2"), true);
});

test("Brand sem nenhuma estrutura continua legível e vazia", () => {
  const resultado = landscape({ brandRegistrySilos: [] });

  assert.deepEqual(resultado.existingStructures, []);
  assert.equal(resultado.consistency.consistent, true);
  assert.equal(resultado.sources.find(item => item.sourceKind === "brand_registry")?.present, false);
});

test("catálogo de outra Marca não entra e entrada sem id é descartada", () => {
  const resultado = landscape({
    keywords: [{ id: "kw-outra", brand_id: OTHER_BRAND, keyword: "de outra brand", silo_id: "silo-outro" }],
    brandRegistrySilos: [{ id: "", nome: "sem identidade" }, { id: "silo-ok", nome: "Válido" }],
  });

  assert.deepEqual(resultado.existingStructures.map(item => item.siloId), ["silo-ok"]);
});

test("a superfície mostra origem, página e proteção da estrutura", () => {
  const resultado = landscape({
    siloDnas: [siloDna("silo-1", "Skincare")] as never,
    siloPages: [siloPage("silo-1", "/skincare", "https://marca.com/skincare")] as never,
  });
  const surface = buildTerritorialSurface({ landscape: resultado, logic: null });

  const grupo = surface.groups.find(item => item.kind === "existing_structures");
  assert.ok(grupo?.header);
  assert.equal(grupo.header.origin, "silo_dna");
  assert.equal(grupo.header.slug, "/skincare");
  assert.equal(grupo.header.isPublished, true);

  const rows = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");
  assert.match(rows, /architect-structure-page/);
  assert.match(rows, /architect-structure-protection/);
});

test("o inventário não chama provider, sitemap nem crawler", () => {
  // Só o código: os comentários explicam justamente o que o módulo NÃO faz.
  const source = readFileSync("lib/arquiteto/territorial-landscape.ts", "utf8").split("\n").filter(line => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  }).join("\n");

  assert.doesNotMatch(source, /fetch\(|supabase|crawl|sitemap/i);
  // Estrutura existente nunca vira território sozinha.
  assert.doesNotMatch(source, /territoryRef: `territory:/);
});
