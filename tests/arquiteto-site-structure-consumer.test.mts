import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSiteStructureReading,
  matchesKnownStructure,
  resolveSiteStructuralRelevance,
  siteEvidenceFromCatalogEntry,
  type SiteCatalogEntryLike,
} from "../lib/arquiteto/site-structure-evidence.ts";
import { buildTerritorialLandscape, type TerritorialLandscapeInput } from "../lib/arquiteto/territorial-landscape.ts";
import { planSiteStructurePromotion } from "../lib/arquiteto/silo-assignment.ts";
import { TerritoryCandidateSchema } from "../lib/arquiteto/territory.ts";
import { buildTerritorialSurface } from "../lib/arquiteto/territorial-surface.ts";
import { deriveTerritorialLogic } from "../lib/arquiteto/territorial-logic.ts";

/**
 * Site/Sitemap → Arquiteto.
 *
 * O site fornece EVIDÊNCIA ESTRUTURAL. Página observada não é Silo, não é
 * SiloPage e não é ArticleDNA — e nada é atribuído a keyword automaticamente.
 */

/** Só o código: comentários explicam justamente o que o módulo NÃO faz. */
const semComentarios = (file: string) => readFileSync(file, "utf8").split("\n").filter(line => {
  const trimmed = line.trimStart();
  return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
}).join("\n");

const BRAND = "brand-1";
const OTHER = "brand-2";
const HASH = `sha256:${"a".repeat(64)}`;

const entry = (path: string, overrides: Partial<SiteCatalogEntryLike> = {}): SiteCatalogEntryLike => ({
  normalizedUrl: `marca.com.br${path}`,
  discoveredUrl: `https://marca.com.br${path}`,
  resolvedUrl: null,
  declaredCanonicalUrl: null,
  normalizedCanonicalUrl: null,
  title: null,
  h1: null,
  pageType: "page",
  verificationStatus: "discovered",
  presenceState: "present",
  sourceSitemapId: "sm-1",
  lastSeenAt: "2026-09-03T12:00:00.000Z",
  ...overrides,
});

const snapshot = (catalog: SiteCatalogEntryLike[], lastGood: boolean = true) => ({
  brandId: BRAND,
  catalog,
  lastSuccessfulRun: lastGood ? { id: "run-good" } : null,
});

const reading = (catalog: SiteCatalogEntryLike[], lastGood = true) =>
  buildSiteStructureReading({ brandId: BRAND, snapshot: snapshot(catalog, lastGood) });

const siloPage = (siloId: string, slug: string, publishedUrl: string | null = null) => ({
  versionId: `vp-${siloId}`, entityId: `silo-page:${siloId}`, versionNumber: 1, previousVersionId: null,
  contentHash: HASH, origin: "human", changeReason: "seed",
  createdAt: "2026-09-03T12:00:00.000Z", createdBy: "user-1",
  payload: { siloPageId: `silo-page:${siloId}`, siloId, brandId: BRAND, slug, publishedUrl, canonical: null },
});

const siloDna = (siloId: string, name: string) => ({
  versionId: `v-${siloId}`, entityId: siloId, versionNumber: 1, previousVersionId: null,
  contentHash: HASH, origin: "human", changeReason: "seed",
  createdAt: "2026-09-03T12:00:00.000Z", createdBy: "user-1",
  payload: { siloId, name, brandId: BRAND },
});

const landscape = (input: Partial<TerritorialLandscapeInput> = {}) => buildTerritorialLandscape({
  brandId: BRAND, keywords: [], territories: [], assignments: [], ...input,
} as TerritorialLandscapeInput);

/* ------------------------------ classificação ---------------------------- */

test("página de organização entra como estrutura; técnica não entra", () => {
  const resultado = reading([
    entry("/cuidados-faciais", { pageType: "page" }),
    entry("/autor/fulano", { pageType: "author" }),
    entry("/tag/pele", { pageType: "page" }),
  ]);

  assert.deepEqual(resultado.structures.map(item => item.path), ["/cuidados-faciais"]);
  assert.equal(resultado.counts.technical, 2, "autor e tag são superfície técnica");
  assert.equal(resultado.counts.structural, 1);
});

test("article é patrimônio, não estrutura promovida automaticamente", () => {
  const resultado = reading([entry("/creme-para-pele-oleosa", { pageType: "article" })]);

  assert.deepEqual(resultado.structures, []);
  assert.equal(resultado.counts.unresolved, 1, "fica auditável, não é descartado");
  assert.match(resultado.evidence[0].notes[0], /Patrimônio editorial publicado/);
});

test("product e unknown não viram Silo, mas continuam contados", () => {
  const resultado = reading([
    entry("/produto/serum", { pageType: "product" }),
    entry("/algo", { pageType: "unknown" }),
  ]);

  assert.deepEqual(resultado.structures, []);
  assert.equal(resultado.counts.unresolved, 2);
  assert.equal(resultado.counts.observedUrls, 2);
});

test("category e service entram como evidência estrutural", () => {
  const resultado = reading([
    entry("/categoria-skincare", { pageType: "category" }),
    entry("/limpeza-de-pele", { pageType: "service" }),
  ]);

  assert.equal(resultado.structures.length, 2);
  assert.equal(resultado.counts.structural, 2);
  // Nenhum siloId ou territoryRef é inventado.
  for (const item of resultado.structures) {
    assert.ok(!("siloId" in item));
    assert.ok(!("territoryRef" in item));
  }
});

test("a classificação não codifica category = Silo", () => {
  const source = semComentarios("lib/arquiteto/site-structure-evidence.ts");

  assert.doesNotMatch(source, /siloId|territoryRef|SiloDNA|SiloPage/);
  assert.doesNotMatch(source, /slice\(0,\s*\d+\)|\.length > \d+\s*\?/, "sem limite arbitrário de quantidade");
});

/* -------------------------------- canonical ------------------------------ */

test("canonical não verificado permanece ausente, não vira canonical_missing", () => {
  const evidencia = siteEvidenceFromCatalogEntry({
    brandId: BRAND,
    entry: entry("/cuidados", { verificationStatus: "discovered", declaredCanonicalUrl: "https://marca.com.br/cuidados" }),
  });

  assert.equal(evidencia.canonical, null, "o sync de sitemap não verifica página");
  assert.equal(evidencia.normalizedCanonical, null);

  const verificado = siteEvidenceFromCatalogEntry({
    brandId: BRAND,
    entry: entry("/cuidados", { verificationStatus: "canonical_confirmed", declaredCanonicalUrl: "https://marca.com.br/cuidados", normalizedCanonicalUrl: "marca.com.br/cuidados" }),
  });
  assert.equal(verificado.canonical, "https://marca.com.br/cuidados");
});

/* ------------------------------ last known good -------------------------- */

test("sem execução íntegra não há estrutura projetada", () => {
  const resultado = reading([entry("/cuidados-faciais")], false);

  assert.deepEqual(resultado.structures, []);
  assert.equal(resultado.counts.observedUrls, 0, "coleta parcial não vira estrutura");
});

test("URL ausente do site não é estrutura vigente", () => {
  const resultado = reading([
    entry("/cuidados-faciais"),
    entry("/pagina-removida", { presenceState: "missing" }),
  ]);

  assert.deepEqual(resultado.structures.map(item => item.path), ["/cuidados-faciais"]);
  assert.equal(resultado.counts.observedUrls, 1);
});

test("Brand sem snapshot mantém o Arquiteto funcional", () => {
  const vazio = buildSiteStructureReading({ brandId: BRAND, snapshot: null });

  assert.deepEqual(vazio.structures, []);
  assert.deepEqual(vazio.counts, { observedUrls: 0, structural: 0, technical: 0, unresolved: 0 });
  assert.equal(landscape({ siteStructures: vazio.structures }).consistency.consistent, true);
});

test("cross-brand não atravessa a leitura do site", () => {
  const outro = buildSiteStructureReading({
    brandId: BRAND,
    snapshot: { brandId: OTHER, catalog: [entry("/cuidados-faciais")], lastSuccessfulRun: { id: "run" } },
  });

  assert.deepEqual(outro.structures, []);
});

/* ----------------------------- reconciliação ----------------------------- */

test("match exato com SiloPage não duplica a estrutura", () => {
  const site = reading([entry("/cuidados-faciais")]).structures;
  const resultado = landscape({
    siloDnas: [siloDna("silo-1", "Cuidados faciais")] as never,
    siloPages: [siloPage("silo-1", "/cuidados-faciais")] as never,
    siteStructures: site,
  });

  assert.equal(resultado.observedSiteStructures.length, 1);
  assert.equal(resultado.observedSiteStructures[0].reconciledSiloId, "silo-1");

  // Uma estrutura só na mesa, com as duas proveniências somadas.
  const surface = buildTerritorialSurface({ landscape: resultado, logic: null });
  const grupos = surface.groups.filter(group => group.kind === "existing_structures");
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].header?.origin, "silo_dna+site_catalog");
});

test("match incerto permanece separado, sem fusão por nome aproximado", () => {
  const site = reading([entry("/tratamentos-faciais")]).structures;
  const resultado = landscape({
    siloDnas: [siloDna("silo-1", "Cuidados faciais")] as never,
    siloPages: [siloPage("silo-1", "/cuidados-faciais")] as never,
    siteStructures: site,
  });

  assert.equal(resultado.observedSiteStructures[0].reconciledSiloId, null);
  const surface = buildTerritorialSurface({ landscape: resultado, logic: null });
  assert.equal(surface.groups.filter(group => group.kind === "existing_structures").length, 2);
});

test("a reconciliação só une por identidade determinística", () => {
  const structure = reading([entry("/cuidados-faciais")]).structures[0];

  assert.equal(matchesKnownStructure({ structure, knownSlug: "/cuidados-faciais", knownPublishedUrl: null, knownCanonical: null }), true);
  assert.equal(matchesKnownStructure({ structure, knownSlug: null, knownPublishedUrl: "https://marca.com.br/cuidados-faciais/", knownCanonical: null }), true);
  // Nome parecido não é identidade.
  assert.equal(matchesKnownStructure({ structure, knownSlug: "/cuidados", knownPublishedUrl: null, knownCanonical: null }), false);
});

/* --------------------------- landscape e lógica -------------------------- */

test("estrutura do site aparece na paisagem e é auditável na fonte", () => {
  const site = reading([entry("/cuidados-faciais"), entry("/autor/x", { pageType: "author" })]).structures;
  const resultado = landscape({ siteStructures: site });

  assert.equal(resultado.observedSiteStructures.length, 1);
  assert.equal(resultado.counts.observedSiteStructures, 1);
  const fonte = resultado.sources.find(item => item.sourceKind === "site_catalog");
  assert.equal(fonte?.present, true);
  assert.equal(fonte?.recordCount, 1);
  // Nenhum Territory foi criado.
  assert.deepEqual(resultado.candidateTerritories, []);
});

test("keyword não é atribuída automaticamente à estrutura do site", () => {
  const site = reading([entry("/skincare")]).structures;
  const keywords = [{ id: "kw-1", brand_id: BRAND, keyword: "skincare", analise_semantica: { entidade_central: "skincare" } }];
  const resultado = landscape({ keywords, siteStructures: site });

  assert.equal(resultado.unassignedKeywords[0]?.keywordId, "kw-1");
  assert.equal(resultado.unassignedKeywords[0]?.source, null, "hipótese não é decisão");
  const logic = deriveTerritorialLogic({ landscape: resultado, keywords });
  assert.equal(logic.hypotheses.every(item => item.targets.every(target => target.territoryRef === null)), true);
});

test("o Arquiteto lê só o remoto, nunca storage local da Marca", () => {
  const workspace = semComentarios("modules/arquiteto/arquiteto-workspace.tsx");

  assert.match(workspace, /api\/marca\/site\/sitemap\?brandId=/);
  assert.match(workspace, /buildSiteStructureReading\(/);
  assert.doesNotMatch(workspace, /loadBrandSiteWorkspace|BrandSiteWorkspace|siteWorkspaceStorageKey/);
  assert.doesNotMatch(workspace, /IndexedDB/);
});

test("hierarquia de URL é evidência de seção, não decisão de Silo", () => {
  const resultado = reading([
    entry("/anti-idade", { pageType: "unknown" }),
    entry("/anti-idade/retinol", { pageType: "unknown" }),
    entry("/anti-idade/rugas", { pageType: "unknown" }),
    entry("/pagina-solta", { pageType: "unknown" }),
  ]);

  assert.deepEqual(resultado.structures.map(item => item.path), ["/anti-idade"]);
  assert.equal(resultado.structures[0].childPageCount, 2);
  // A razão cita os sinais realmente observados, sem score opaco.
  assert.match(resultado.evidence.find(item => item.path === "/anti-idade")!.notes[0], /Estrutura incluída porque: 2 página/);
  // A folha e a página solta continuam sem virar estrutura.
  assert.equal(resultado.counts.unresolved, 3);
});

test("estrutura do site tem badge próprio, distinto da página do silo", () => {
  const rows = semComentarios("modules/arquiteto/territorial-workspace-rows.tsx");

  assert.match(rows, /architect-site-structure-row/);
  assert.match(rows, /observadaNoSite \? "Estrutura" : "Silo"/);
  assert.match(rows, /Página observada no site; relação com silo ainda não definida/);
});

test("as contagens de auditoria do site ficam disponíveis", () => {
  const resultado = reading([
    entry("/secao", { pageType: "unknown" }),
    entry("/secao/filho", { pageType: "unknown" }),
    entry("/autor/x", { pageType: "author" }),
  ]);

  assert.deepEqual(resultado.counts, { observedUrls: 3, structural: 1, technical: 1, unresolved: 1 });
  const workspace = semComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(workspace, /siteStructureReading\.counts\.observedUrls/);
  // A UI não chama mais de "não resolvida": as páginas foram verificadas; o
  // que falta a elas é papel estrutural.
  assert.match(workspace, /sem papel estrutural identificado/);
  assert.doesNotMatch(workspace, /não resolvida\(s\)/);
});

test("a verificação de página enriquece a evidência e a explicação", () => {
  const verificada = entry("/rotina-skincare-facial", {
    pageType: "category",
    verificationStatus: "canonical_confirmed",
    title: "Rotina de skincare facial | Marca",
    h1: "Rotina de skincare facial",
    declaredCanonicalUrl: "https://marca.com.br/rotina-skincare-facial",
    normalizedCanonicalUrl: "marca.com.br/rotina-skincare-facial",
  });
  const resultado = reading([verificada]);

  const estrutura = resultado.structures[0];
  // H1 antes do title: o title carrega sufixo da marca.
  assert.equal(estrutura.label, "Rotina de skincare facial");
  assert.equal(estrutura.canonicalVerified, true);
  assert.equal(estrutura.canonical, "marca.com.br/rotina-skincare-facial");

  const nota = resultado.evidence[0].notes[0];
  assert.match(nota, /tipo category/);
  assert.match(nota, /canonical confirmado na página/);
  assert.match(nota, /H1 observado/);
});

test("não resolvida explica o que faltou", () => {
  const resultado = reading([entry("/pagina-solta", { pageType: "unknown", h1: null })]);

  assert.deepEqual(resultado.structures, []);
  assert.match(resultado.evidence[0].notes[0], /Não resolvida porque: sem páginas abaixo; tipo não resolvido; sem H1 útil/);
});

test("canonical verificado reconcilia com a SiloPage", () => {
  const site = reading([entry("/pagina-a", {
    verificationStatus: "canonical_confirmed",
    normalizedCanonicalUrl: "marca.com.br/cuidados-faciais",
    declaredCanonicalUrl: "https://marca.com.br/cuidados-faciais",
    pageType: "category",
  })]).structures;

  assert.equal(matchesKnownStructure({
    structure: site[0],
    knownSlug: null,
    knownPublishedUrl: null,
    knownCanonical: "https://marca.com.br/cuidados-faciais",
  }), true, "canonical verificado é identidade suficiente");
});

/* --------------- promoção: estrutura publicada → silo candidato ---------- */

const publicada = (path: string, overrides: Record<string, unknown> = {}) => ({
  normalizedUrl: `marca.com.br${path}`,
  url: `https://marca.com.br${path}`,
  path,
  label: "Skincare Facial",
  canonical: `marca.com.br${path}`,
  canonicalVerified: true,
  isPublished: true,
  catalogEntryId: "uuid-entry-1",
  observedAt: "2026-09-03T12:00:00.000Z",
  reconciledSiloId: null,
  ...overrides,
});

test("página publicada vira silo candidato preservando a identidade publicada", () => {
  const plano = planSiteStructurePromotion({
    structure: publicada("/rotina-skincare-facial"),
    existingTerritories: [],
    reason: "Usar a seção publicada como silo.",
  });

  assert.equal(plano.ok, true);
  const validado = TerritoryCandidateSchema.parse({
    ...plano.draft,
    territoryRef: "territory:11111111-1111-4111-8111-111111111111",
    brandId: BRAND,
  });

  // Identidade publicada adotada e protegida — nunca proposta.
  assert.equal(validado.slugState.publishedSlug, "/rotina-skincare-facial");
  assert.equal(validado.slugState.publishedCanonical, "marca.com.br/rotina-skincare-facial");
  assert.deepEqual(validado.slugState.proposals, []);
  assert.equal(validado.slugState.confirmed, null);
  assert.equal(validado.publicationProtection, "protected");
  // Referência estável à linha do catálogo, não a H1 nem a slug derivado.
  assert.equal(validado.publishedStructureRef?.catalogEntryId, "uuid-entry-1");
  assert.equal(validado.publishedStructureRef?.source, "site_catalog");
  // Sem SiloDNA, sem SiloPage, sem semântica inventada.
  assert.equal(validado.existingSiloRef, null);
  assert.equal(validado.consolidation, null);
  assert.equal(validado.centralEntity, "");
  assert.equal(validado.lifecycleStatus, "candidate");
});

test("promover a mesma estrutura duas vezes é recusado", () => {
  const jaPromovida = planSiteStructurePromotion({
    structure: publicada("/rotina-skincare-facial"),
    existingTerritories: [{ publishedStructureRef: { normalizedUrl: "marca.com.br/rotina-skincare-facial" } }],
    reason: "Usar de novo.",
  });

  assert.equal(jaPromovida.ok, false);
  assert.ok(jaPromovida.refusals.some(item => item.code === "ALREADY_PROMOTED"));
});

test("página já reconciliada com Silo canônico não gera candidato paralelo", () => {
  const plano = planSiteStructurePromotion({
    structure: publicada("/cuidados-faciais", { reconciledSiloId: "silo-1" }),
    existingTerritories: [],
    reason: "Usar como silo.",
  });

  assert.equal(plano.ok, false);
  assert.ok(plano.refusals.some(item => item.code === "ALREADY_RECONCILED_WITH_SILO"));
});

test("motivo é obrigatório e página não publicada é recusada", () => {
  const semMotivo = planSiteStructurePromotion({ structure: publicada("/x"), existingTerritories: [], reason: "  " });
  assert.ok(semMotivo.ok === false && semMotivo.refusals.some(item => item.code === "REASON_REQUIRED"));

  const naoPublicada = planSiteStructurePromotion({
    structure: publicada("/x", { isPublished: false }),
    existingTerritories: [],
    reason: "Usar como silo.",
  });
  assert.ok(naoPublicada.ok === false && naoPublicada.refusals.some(item => item.code === "STRUCTURE_NOT_PUBLISHED"));
});

test("canonical não verificado não vira canonical publicado do candidato", () => {
  const plano = planSiteStructurePromotion({
    structure: publicada("/x", { canonicalVerified: false, canonical: "marca.com.br/x" }),
    existingTerritories: [],
    reason: "Usar como silo.",
  });

  assert.equal(plano.ok, true);
  assert.equal((plano.draft.slugState as Record<string, unknown>).publishedCanonical, null);
  // O caminho publicado continua sendo fato observado.
  assert.equal((plano.draft.slugState as Record<string, unknown>).publishedSlug, "/x");
});

test("estrutura promovida sai do grupo de estruturas e vira o próprio Silo", () => {
  // A folha é conteúdo, não estrutura: só a seção pai entra.
  const site = reading([entry("/secao", { pageType: "unknown" }), entry("/secao/filho", { pageType: "unknown" })]).structures;
  assert.equal(site.length, 1);
  const promovido = {
    schemaVersion: 1, territoryRef: "territory:22222222-2222-4222-8222-222222222222", brandId: BRAND,
    existingSiloRef: null,
    publishedStructureRef: { source: "site_catalog", catalogEntryId: "uuid-1", normalizedUrl: site[0].normalizedUrl, observedAt: null },
    name: "Seção", centralEntity: "", macroIntent: "",
    boundary: { includes: [], excludes: [] },
    narrative: { statement: null, continuity: "unknown", brandAlignment: "unknown", rationale: [] },
    discovery: { discoveredBy: null, centralEntityInKeywordUniverse: true, keywordSuggestions: [] },
    territoryKind: "existing", architecturalOrigin: "discovered", ingestionOrigin: "system",
    lifecycleStatus: "candidate", decisionState: "pending", publicationProtection: "protected",
    slugState: { proposals: [], confirmed: null, publishedSlug: "/secao", publishedCanonical: null },
    lineage: { splitFromTerritoryRef: null, splitIntoTerritoryRefs: [], supersededByTerritoryRef: null, absorbedTerritoryRefs: [] },
    consolidation: null, pendingOperation: null, conflicts: [], reasons: ["Promovida."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: null },
  };
  const resultado = landscape({ siteStructures: site, territories: [promovido] as never });

  assert.equal(resultado.observedSiteStructures[0].promotedTerritoryRef, promovido.territoryRef);

  const surface = buildTerritorialSurface({ landscape: resultado, logic: null });
  // Uma linha só: o Silo candidato, com procedência do site.
  const estruturas = surface.groups.filter(group => group.kind === "existing_structures");
  const silos = surface.groups.filter(group => group.kind === "territories");
  assert.equal(estruturas.length, 0);
  assert.equal(silos.length, 1);
  assert.equal(silos[0].header?.origin, "site_catalog");
  assert.equal(silos[0].header?.slugKind, "published", "identidade publicada, não slug proposto");
});

test("página verificada sem papel estrutural não diz que falta coleta", () => {
  const verificada = reading([entry("/solta", { pageType: "unknown", verificationStatus: "canonical_confirmed" })]);
  assert.match(verificada.evidence[0].notes[0], /Sem papel estrutural identificado/);

  const naoVerificada = reading([entry("/solta", { pageType: "unknown", verificationStatus: "discovered" })]);
  assert.match(naoVerificada.evidence[0].notes[0], /Não resolvida porque/);
});

test("a ação Usar como Silo é explícita e não cria página nova", () => {
  const rows = semComentarios("modules/arquiteto/territorial-workspace-rows.tsx");
  const workspace = semComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  const planner = semComentarios("lib/arquiteto/silo-assignment.ts");

  assert.match(rows, /architect-use-as-silo/);
  assert.match(rows, /Usar como Silo/);
  assert.match(workspace, /planSiteStructurePromotion\(\{/);
  // A promoção usa o writer canônico já existente.
  assert.match(workspace, /createRemoteSiloCandidate\(\{ brandId: selectedBrandId, draft: plan\.draft \}\)/);
  // Nenhum SiloDNA/SiloPage/slug novo no caminho da promoção.
  const bloco = planner.slice(planner.indexOf("export function planSiteStructurePromotion"));
  assert.doesNotMatch(bloco, /SiloDNA|siloPageId|autoManualSiloPageSlug/);
});

test("a identidade publicada entra protegida no validador de slug", () => {
  const workspace = semComentarios("modules/arquiteto/arquiteto-workspace.tsx");

  assert.match(workspace, /siteStructureReading\.structures\.map\(structure => \(\{/);
  assert.match(workspace, /isPublished: true,/);
});
