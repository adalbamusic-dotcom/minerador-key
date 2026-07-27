import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentDocumentSchema } from "../lib/arquiteto/contracts.ts";
import { adaptLegacyBrand, adaptLegacyKeyword } from "../lib/editorial/adapters.ts";
import { EditorialSnapshotSchema, EditorialStageSchema, SerpCollectionRecordSchema } from "../lib/editorial/contracts.ts";
import { derivePipelineStates, menuEntriesForRole } from "../lib/editorial/navigation.ts";
import { LEGACY_REDIRECTS } from "../lib/editorial/navigation.ts";
import { createMockPlanAndDocument, mockProductEvidenceProvider, mockSerpProvider } from "../lib/editorial/providers.ts";
import { createMockOperationalBundle } from "../lib/editorial/providers.ts";
import { ExternalSourceSuggestionSchema, InternalLinkAssignmentSchema, PublicationRecordSchema } from "../lib/editorial/operational-contracts.ts";
import { PipelineStateSummary } from "../lib/editorial/render-smoke.ts";
import { updateBrandWorkspace } from "../lib/editorial/workspace.ts";

const snapshot = EditorialSnapshotSchema.parse({
  brand: { id: "brand-1", nome: "Marca", site_url: "https://example.com", nicho: "Clínica", localizacao: "Curitiba",
    dna_diretrizes: "Tom técnico e claro.", silos_existentes: [], created_at: null },
  silos: [{ id: "silo-1", nome: "SEO", nicho: null, marca_id: "brand-1", created_at: null }],
  keywords: [{ id: "kw-1", keyword: "seo para clínicas", intent: null, volume_search: 10, kgr_score: 0.2, lista_id: "silo-1",
    status: "aprovado", analise_semantica: { entidade_central: "clínica" }, created_at: null }],
  briefings: [], loadedAt: new Date().toISOString(),
});

test("rotas editoriais aceitam somente as sete etapas", () => {
  for (const stage of ["marca", "keywords", "artigos", "silos", "serp", "planejamento", "documentos"]) assert.equal(EditorialStageSchema.safeParse(stage).success, true);
  assert.equal(EditorialStageSchema.safeParse("biblioteca").success, false);
});

test("menu oficial restringe Admin e não expõe Inteligência Editorial", () => {
  const client = menuEntriesForRole("cliente"); const admin = menuEntriesForRole("admin");
  assert.equal(client.some(item => item.id === "admin"), false);
  assert.equal(admin.some(item => item.id === "admin" && item.href === "/admin"), true);
  assert.equal(client.some(item => item.label.includes("Inteligência")), false);
  assert.deepEqual(client.filter(item => !["conta"].includes(item.id)).map(item => item.href), ["/marca", "/minerador", "/arquiteto", "/radar", "/planejador", "/redator", "/publicacoes"]);
});

test("estado local permanece isolado por marca", () => {
  const first = updateBrandWorkspace<Record<string, number>>({}, "brand-1", () => ({}), current => ({ ...current, article: 1 }));
  const second = updateBrandWorkspace(first, "brand-2", () => ({}), current => ({ ...current, silo: 1 }));
  assert.deepEqual(second["brand-1"], { article: 1 });
  assert.deepEqual(second["brand-2"], { silo: 1 });
});

test("estados do pipeline não contam mocks como progresso", () => {
  const states = derivePipelineStates({ hasBrand: true, legacyKeywordCount: 1, articleApproved: 0, articleProposed: 0, siloApproved: 0, conflicts: 0 });
  assert.equal(states.marca, "in_progress"); assert.equal(states.minerador, "in_progress");
  assert.equal(states.radar, "blocked"); assert.equal(states.planejador, "blocked");
});

test("rotas técnicas antigas possuem destino operacional único", () => {
  assert.deepEqual(LEGACY_REDIRECTS, { marca: "/marca", keywords: "/minerador", artigos: "/arquiteto", silos: "/arquiteto?painel=silo", serp: "/radar", planejamento: "/planejador", documentos: "/redator" });
});

test("BrandDNA legado é explícito e não vira versão aprovada", () => {
  const legacy = adaptLegacyBrand(snapshot);
  assert.equal(legacy.origin, "legacy"); assert.match(legacy.versionId, /^legacy:/);
  assert.ok(legacy.missingFields.includes("positioning"));
});

test("adaptador de KeywordDNA não inventa campos ausentes", () => {
  const legacy = adaptLegacyKeyword(snapshot.keywords[0]);
  assert.equal(legacy.intent.available, false); assert.equal(legacy.intent.value, null);
  assert.equal(legacy.centralEntity.value, "clínica");
  assert.equal(legacy.commercialPotential.available, false);
});

test("mock SERP é validado, explícito e exige revisão humana", async () => {
  const record = await mockSerpProvider.collectSnapshot({ articleId: "a1", keyword: "seo", location: "Brasil", language: "pt-BR", device: "desktop" });
  assert.equal(SerpCollectionRecordSchema.safeParse(record).success, true);
  assert.equal(record.origin, "mock"); assert.equal(record.isMock, true); assert.equal(record.humanDecisionRequired, true);
});

test("evidência diferencia opinião de consumidor de fato técnico", async () => {
  const evidence = await mockProductEvidenceProvider.collect({ articleId: "a1", productQuery: "produto", marketplace: "teste", location: "Brasil" });
  assert.ok(evidence.sources.some(source => source.evidenceType === "consumer_opinion"));
  assert.equal(evidence.sources.some(source => source.evidenceType === "technical_fact"), false);
});

test("ContentPlan e ContentDocument simulados preservam referências e proveniência", async () => {
  const { plan, document } = await createMockPlanAndDocument("brand-1");
  assert.equal(plan.payload.keywordDnaRefs.length, 1);
  assert.equal(ContentDocumentSchema.safeParse(document).success, true);
  assert.ok(document.blocks.every(block => block.provenance.keywordDnaRefs.length > 0));
  assert.ok(document.blocks.some(block => block.type === "product_block"));
  assert.ok(document.blocks.some(block => block.type === "comparison"));
  assert.doesNotMatch(JSON.stringify(document.blocks[0].provenance), /perceivedProblem|businessObjectives/);
});

test("componente puro renderiza estado acessível no servidor", () => {
  const html = renderToStaticMarkup(React.createElement(PipelineStateSummary, { label: "Artigos", state: "pending_review" }));
  assert.match(html, /data-state="pending_review"/); assert.match(html, /aria-label="Artigos: pending_review"/);
});

test("links internos preservam origem, destino e âncoras candidatas", () => {
  const bundle = createMockOperationalBundle("brand-1", "article-a", "article-b");
  assert.equal(InternalLinkAssignmentSchema.safeParse(bundle.internalLink).success, true);
  assert.equal(bundle.internalLink.sourceArticleId, "article-a"); assert.equal(bundle.internalLink.targetArticleId, "article-b");
  assert.ok(bundle.internalLink.candidates.every(anchor => anchor.text && anchor.semanticReason));
});

test("fonte externa pode exigir pesquisa sem inventar URL", () => {
  const source = createMockOperationalBundle("brand-1").externalSource;
  assert.equal(ExternalSourceSuggestionSchema.safeParse(source).success, true);
  assert.equal(source.candidateUrl, null); assert.equal(source.status, "needs_source"); assert.ok(source.reason);
});

test("publicação simulada é tipada e identificada", () => {
  const publication = createMockOperationalBundle("brand-1").publication;
  assert.equal(PublicationRecordSchema.safeParse(publication).success, true); assert.equal(publication.origin, "mock");
});

test("rotas oficiais separam Marca, Conta, Radar, Planejador, Redator e Publicações", async () => {
  const modulePaths = [
    "../modules/marca/brand-page.tsx",
    "../modules/conta/account-page.tsx",
    "../modules/radar/radar-page.tsx",
    "../modules/planejador/planner-page.tsx",
    "../modules/redator/writer-page.tsx",
    "../modules/publicacoes/publications-page.tsx",
  ];
  for (const path of modulePaths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(source.length > 20);
  }
  const accountRoute = await readFile(new URL("../app/(brand)/[brandRef]/conta/page.tsx", import.meta.url), "utf8");
  assert.match(accountRoute, /modules\/conta/);
});

test("Minerador e Arquiteto incorporam seus DNAs sem páginas técnicas", async () => {
  const miner = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.match(miner, /KeywordDnaPanel/); assert.match(architect, /ArticleDnaSummary/); assert.match(architect, /SiloDnaSummary/);
});

test("shell oficial não contém grupo Inteligência Editorial", async () => {
  const source = await readFile(new URL("../components/product-shell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Inteligência Editorial/); assert.match(source, /menuEntriesForRole/);
});

test("layout Admin valida sessão e papel no servidor", async () => {
  const source = await readFile(new URL("../app/(admin)/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /requireSessionProfile/); assert.match(source, /profile\.isAdmin/); assert.match(source, /redirect/);
});

test("Marca preserva compatibilidade de edição do cliente legado e Conta não edita marca", async () => {
  const product = (await Promise.all([
    readFile(new URL("../modules/marca/brand-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/conta/account-page.tsx", import.meta.url), "utf8"),
  ])).join("\n");
  assert.match(product, /responsável legado/); assert.match(product, /fetch\("\/api\/marcas"/);
  assert.match(product, /Nenhuma alteração de marca pode ser realizada por esta área/);
});

test("endpoint editorial é somente leitura e autoriza marca perto da fonte", async () => {
  const source = await readFile(new URL("../app/api/inteligencia/route.ts", import.meta.url), "utf8");
  assert.match(source, /assertCanAccessMarca/);
  assert.doesNotMatch(source, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/);
  assert.doesNotMatch(source, /select\("\*"\)/);
});
