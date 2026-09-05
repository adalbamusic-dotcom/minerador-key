import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("canonical technical names have human-readable display labels", async () => {
  const files = await Promise.all([
    source("modules/marca/brand-page.tsx"),
    source("modules/minerador/minerador-workspace.tsx"),
    source("modules/arquiteto/arquiteto-workspace.tsx"),
    source("modules/radar/radar-page.tsx"),
    source("modules/radar/radar-analysis-page.tsx"),
    source("modules/planejador/planner-cockpit-workspace.tsx"),
    source("modules/redator/writer-page.tsx"),
    source("modules/publicacoes/publications-page.tsx"),
  ]);
  const ui = files.join("\n");

  for (const label of [
    "Identidade da marca",
    "Perfil da keyword",
    "Definição do artigo",
    "Arquitetura do silo",
    "Página do silo",
    "Análise da SERP",
    "Plano editorial",
    "Conteúdo do artigo",
    "Perfil semântico da keyword",
    "Pacote de evidências do Radar",
  ]) assert.match(ui, new RegExp(label));
});

test("known visible labels no longer expose canonical class-like names", async () => {
  const files = await Promise.all([
    source("modules/marca/brand-page.tsx"),
    source("modules/minerador/minerador-workspace.tsx"),
    source("components/editorial/dna-panels.tsx"),
    source("modules/radar/radar-page.tsx"),
    source("modules/radar/radar-analysis-page.tsx"),
    source("modules/planejador/planner-cockpit-workspace.tsx"),
    source("modules/redator/writer-page.tsx"),
    source("modules/publicacoes/publications-page.tsx"),
  ]);
  const ui = files.join("\n");

  for (const visiblePattern of [
    />\s*BrandDNA\s*</,
    />\s*KeywordDNA(?:s)?\s*</,
    />\s*ArticleDNA\s*</,
    />\s*SiloDNA\s*</,
    />\s*SiloPage\s*</,
    />\s*(?:Snapshot|DNA(?: semântico)?)(?:\s|<)/i,
    />\s*RadarEvidencePackage/,
    /label=["'](?:BrandDNA|KeywordDNA|ArticleDNA|SiloDNA|SiloPage|SerpSnapshot|ContentPlan|ContentDocument|PublicationRecord)["']/,
    /header:\s*["'](?:BrandDNA|KeywordDNA|ArticleDNA|SiloDNA|SiloPage|SerpSnapshot|ContentPlan|ContentDocument|PublicationRecord)["']/,
  ]) assert.doesNotMatch(ui, visiblePattern);
});

test("internal contracts and persisted vocabulary remain canonical", async () => {
  const [brandRoute, contracts, architect] = await Promise.all([
    source("app/api/marca/brand-dna/route.ts"),
    source("lib/arquiteto/contracts.ts"),
    source("modules/arquiteto/arquiteto-workspace.tsx"),
  ]);

  assert.match(brandRoute, /VersionedBrandDNASchema/);
  assert.match(brandRoute, /O BrandDNA não pertence à marca informada/);
  for (const identifier of ["BrandDNA", "KeywordDNA", "ArticleDNA", "SiloDNA", "SiloPage", "ContentPlan", "ContentDocument"])
    assert.match(contracts, new RegExp(identifier));
  assert.match(architect, /changeReason: "SiloDNA criado manualmente no Arquiteto\."/);
  assert.match(architect, /changeReason: "Evidência explícita de verificação da identidade da SiloPage\."/);
});

test("shared visual documentation separates canonical names from display labels", async () => {
  const visualSystem = await source("docs/compartilhado/sistema-visual.md");
  assert.match(visualSystem, /Nomes técnicos canônicos são independentes dos labels exibidos na interface\./);
});
