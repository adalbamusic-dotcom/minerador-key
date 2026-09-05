import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTerritorialSurface } from "../lib/arquiteto/territorial-surface.ts";
import { buildTerritorialLandscape } from "../lib/arquiteto/territorial-landscape.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { TerritoryCandidate } from "../lib/arquiteto/territory.ts";

const BRAND = "brand-1";
const REF_A = "territory:11111111-1111-4111-8111-111111111111";
const REF_B = "territory:22222222-2222-4222-8222-222222222222";

/** Fonte de componente: as provas de layout leem o código, não o DOM. */
const rowsSource = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");
const workspaceSource = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const territory = (territoryRef: string, overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate => ({
  schemaVersion: 1, territoryRef, brandId: BRAND, existingSiloRef: null,
  name: "Sérum facial", centralEntity: "sérum facial", macroIntent: "informacional",
  boundary: { includes: ["sérum"], excludes: ["maquiagem"] },
  narrative: { summary: "Universo de sérum facial da marca.", relationToBrand: "core", editorialAngle: null },
  discovery: { origin: "manual_strategic", evidence: [], detectedAt: "2026-09-02T12:00:00.000Z" },
  territoryKind: "new", architecturalOrigin: "manual_strategic", ingestionOrigin: "ui",
  publicationProtection: "unpublished", lifecycleStatus: "candidate", decisionState: "pending",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFrom: null, mergedFrom: [], supersededBy: null },
  conflicts: [], pendingOperation: null, ...overrides,
} as TerritoryCandidate);

const keyword = (id: string, extra: Record<string, unknown> = {}) => ({
  id, brand_id: BRAND, keyword: "sérum facial", intent: "informacional",
  analise_semantica: { entidade_central: "sérum facial" }, ...extra,
});

const assignment = (keywordId: string, territoryRef: string) => ({
  keywordId, brandId: BRAND, territoryRef, state: "new_silo_candidate",
  reason: "Decisão humana na mesa.", source: "human", decidedAt: "2026-09-02T12:00:00.000Z",
});

const surfaceFor = (
  keywords: ReturnType<typeof keyword>[],
  territories: TerritoryCandidate[] = [],
  siloDnas: unknown[] = [],
  assignments: ReturnType<typeof assignment>[] = [],
) => {
  const landscape = buildTerritorialLandscape({
    brandId: BRAND, keywords, territories, assignments: assignments as never, siloDnas: siloDnas as never,
  });
  return buildTerritorialSurface({ landscape, logic: null });
};

const siloDna = (siloId: string, name: string) => ({
  versionId: `${siloId}:v1`, entityId: siloId, versionNumber: 1, previousVersionId: null,
  contentHash: `sha256:${"a".repeat(64)}`, origin: "human", changeReason: "seed",
  createdAt: "2026-09-02T12:00:00.000Z", createdBy: "user-1",
  payload: { siloId, name, brandId: BRAND },
});

// ─────────────────────────────────────────────────────────── §12–§14 seções

test("cabeçalho de SEÇÃO é um por tipo, nunca um por registro", () => {
  // A seção nasce do agrupamento por kind; o cabeçalho do Silo é outra linha.
  const inicio = rowsSource.indexOf("const sections:");
  const secao = rowsSource.slice(inicio, rowsSource.indexOf("</>", inicio));
  assert.match(secao, /sections\.find\(section => section\.kind === group\.kind\)/,
    "grupos do mesmo tipo precisam cair na MESMA seção");
  assert.match(secao, /sections\.map\(section =>/);
  const posicaoSecao = secao.indexOf("<SectionRow");
  const posicaoGrupo = secao.indexOf("section.groups.map");
  assert.ok(posicaoSecao > 0 && posicaoSecao < posicaoGrupo,
    "SectionRow é renderizado por seção, antes de iterar os grupos");
});

test("recolher existe só para ESTRUTURAS EXISTENTES e não remove nada da mesa", () => {
  assert.match(rowsSource, /architect-section-toggle/);
  assert.match(rowsSource, /section\.kind === "existing_structures"[\s\S]{0,40}setCollapsed/);
  // Recolher é visual: nenhuma filtragem de dados acompanha o estado.
  assert.doesNotMatch(rowsSource, /collapsed[\s\S]{0,40}\.filter\(/);
});

test("a contagem da seção conta o que ela organiza", () => {
  // Silos e estruturas contam registros; grupos de estado contam keywords.
  assert.match(rowsSource, /const isStructural = section\.kind === "existing_structures" \|\| section\.kind === "territories"/);
  assert.match(rowsSource, /isStructural[\s\S]{0,20}\? section\.groups\.length/);
});

// ─────────────────────────────────────────────────── §15 semântica da linha

test("linha de keyword mostra o status DELA, não o da página do Silo", () => {
  const surface = surfaceFor([keyword("kw-1", { status: "aprovado" })], [], [siloDna("silo-legado", "Skin care")]);

  const grupo = surface.groups.find(group => group.kind === "existing_structures");
  assert.ok(grupo, "estrutura existente precisa aparecer");
  const linha = surface.groups.flatMap(item => item.rows).find(row => row.keywordId === "kw-1");
  assert.ok(linha);
  assert.equal(linha.keywordStatus, "aprovado");
  assert.notEqual(linha.keywordStatus, "publicado");
});

test("keyword publicada carrega o próprio publicado, sem herdar de ninguém", () => {
  const surface = surfaceFor([keyword("kw-1", { status: "publicado" })], [], [siloDna("silo-legado", "Skin care")]);

  const linha = surface.groups.flatMap(group => group.rows).find(row => row.keywordId === "kw-1");
  assert.equal(linha!.keywordStatus, "publicado");
});

test("associação a estrutura existente não é rotulada como decisão humana", () => {
  const surface = surfaceFor([keyword("kw-1")], [], [siloDna("silo-legado", "Skin care")]);

  const linha = surface.groups.flatMap(group => group.rows).find(row => row.keywordId === "kw-1")!;
  assert.equal(linha.decisionSource, null, "sem decisão registrada a origem é nula, não inventada");
  assert.match(rowsSource, /existing_silo_match: "Associada ao silo"/);
});

// ────────────────────────────────────────────────────────── §17 seletores

test("o seletor de Silo diz de onde cada Silo veio", () => {
  const marcador = "territory.publishedStructureRef ? \"Site\"";
  const posicao = workspaceSource.indexOf(marcador);
  assert.ok(posicao > 0, "o rótulo do seletor precisa distinguir a origem do Silo");
  const rotulo = workspaceSource.slice(posicao - 160, posicao + 160);
  assert.match(rotulo, /architecturalOrigin === "manual_strategic" \? "Manual"/);
  assert.match(rotulo, /"Existente"/);
});

// ──────────────────────────────────────────────── §23–§25 confirmar Silo

test("prontidão de confirmação é POR Silo, com bloqueios legíveis", () => {
  // Cada silo tem keyword própria: silo vazio não é confirmável e o teste
  // precisa isolar o bloqueio de conteúdo, não o de universo sem membro.
  const surface = surfaceFor(
    [keyword("kw-1"), keyword("kw-2")],
    [
      territory(REF_A),
      territory(REF_B, { name: "", centralEntity: "" } as Partial<TerritoryCandidate>),
    ],
    [],
    [assignment("kw-1", REF_A), assignment("kw-2", REF_B)],
  );

  const headers = surface.groups.filter(group => group.kind === "territories").map(group => group.header!);
  const pronto = headers.find(header => header.ref === REF_A)!;
  const travado = headers.find(header => header.ref === REF_B)!;
  assert.equal(pronto.confirmation?.ready, true);
  assert.deepEqual(pronto.confirmation?.blockers, []);
  assert.equal(travado.confirmation?.ready, false);
  assert.ok(travado.confirmation!.blockers.length > 0, "quem não pode confirmar precisa dizer o que falta");
  assert.ok(travado.confirmation!.blockers.some(blocker => blocker.code === "TERRITORY_WITHOUT_CENTRAL_ENTITY"));
  // A projeção entrega o código; a frase humana é responsabilidade da UI.
  assert.match(rowsSource, /TERRITORY_WITHOUT_CENTRAL_ENTITY: "falta definir a entidade central;"/);
  assert.match(rowsSource, /blockers\.map\(blockerLabel\)/);
});

test("estrutura observada não recebe pergunta de confirmação", () => {
  const surface = surfaceFor([keyword("kw-1")], [], [siloDna("silo-legado", "Skin care")]);

  const estrutura = surface.groups.find(group => group.kind === "existing_structures")!;
  assert.equal(estrutura.header?.confirmation, null, "estrutura observada ainda não é Silo para confirmar");
});

test("Silo já confirmado não oferece confirmar de novo", () => {
  const surface = surfaceFor(
    [keyword("kw-1")],
    [territory(REF_A, { lifecycleStatus: "confirmed", decisionState: "confirmed" } as Partial<TerritoryCandidate>)],
  );

  const header = surface.groups.find(group => group.kind === "territories")!.header!;
  assert.equal(header.confirmation, null);
});

test("o botão Confirmar Silo respeita a prontidão e escreve pelo caminho canônico", () => {
  assert.match(rowsSource, /data-testid="architect-confirm-silo"/);
  assert.match(rowsSource, /disabled=\{!header\.confirmation\.ready \|\| Boolean\(confirmControls\.busyRef\)\}/);
  assert.match(rowsSource, /architect-confirm-blockers/);
  // Confirmação é update de território com lock, não rota nova.
  assert.match(workspaceSource, /confirmRemoteSiloCandidate/);
  const canonical = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");
  const writer = canonical.slice(canonical.indexOf("export async function confirmRemoteSiloCandidate"));
  assert.match(writer, /territoryUpdates/);
  assert.match(writer, /expectedLock/);
});

// ─────────────────────────────────────── §26–§29 pool de Artigos com trava

test("Article só se forma dentro de Silo confirmado, preservando o publicado", () => {
  const inicio = workspaceSource.indexOf("masterList.forEach(kw =>");
  const projecao = workspaceSource.slice(inicio, inicio + 1400);
  assert.match(projecao, /confirmedTerritoryRefs\.has\(/);
  assert.match(projecao, /kw\.isPublished/, "patrimônio publicado não pode sumir da mesa");
  assert.match(projecao, /reservedSiloHeadIds\.has\(String\(kw\.id\)\)/, "a cabeceira do Silo continua reservada");
});

test("a lista de Silos confirmados vem do snapshot remoto, não do estado local", () => {
  const inicio = workspaceSource.indexOf("const confirmedTerritoryRefs");
  const memo = workspaceSource.slice(inicio, inicio + 420);
  assert.match(memo, /remoteTerritories/);
  // O escopo da fase inclui o Silo CONSOLIDADO: consolidar é um estado
  // posterior à confirmação, não a perda dela. Ler só `confirmed` esvaziava a
  // aba Artigos no instante em que a consolidação dava certo.
  assert.match(memo, /siloIsHumanDecided\(item\.territory\.lifecycleStatus\)/);
  assert.doesNotMatch(memo, /localStorage|sessionStorage/);
});

// ────────────────────────── §32 consolidação adota a identidade publicada

async function articleVersion(id: string, texto: string, volume: number) {
  const group = buildProvisionalGroups([{
    id: `${id}-kw`, keyword: texto, intent: "Informativo", volume_search: volume,
    results_allintitle: null, kgr_score: null, lista_id: null, siloName: null, status: "aprovado",
    analise_semantica: { entidade_central: "retinol", publico: "clientes", problema_percebido: "duvida" },
  }])[0];
  const payload = deterministicArticleDnaPayload(group, BRAND);
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload });
}

test("Silo nascido do Site adota a página publicada em vez de criar outra", async () => {
  const pilar = await articleVersion("a1", "retinol para iniciantes", 900);
  const apoio = await articleVersion("a2", "retinol e vitamina c", 300);
  const formacao = formSiloWorkingCopies({ brandId: BRAND, articleVersions: [pilar, apoio] });
  const copy = chooseSiloWorkingCopyPillar(formacao.workingCopies[0], pilar.payload.articleId);
  const input = {
    copy, articleVersions: [pilar, apoio],
    articleStatuses: { [pilar.payload.articleId]: "approved", [apoio.payload.articleId]: "approved" },
    publishedIdentity: {
      publishedSlug: "anti-idade-e-retinol",
      publishedUrl: "https://careglow.com.br/anti-idade-e-retinol",
      publishedCanonical: "https://careglow.com.br/anti-idade-e-retinol",
      publishedStructureRef: { source: "site_catalog", catalogEntryId: "entry-1", normalizedUrl: "careglow.com.br/anti-idade-e-retinol" },
    },
  };

  const dnaPayload = buildConsolidatedSiloDnaPayload(input);
  const dna = await createVersionEnvelope({ entityId: dnaPayload.siloId, versionNumber: 1, origin: "human", changeReason: "test", createdBy: "test", payload: dnaPayload });
  const page = buildConsolidatedSiloPagePayload(dna, input);

  assert.equal(page.slug, "anti-idade-e-retinol", "a consolidação não pode gerar slug novo para página que já está no ar");
  assert.equal(page.publishedUrl, "https://careglow.com.br/anti-idade-e-retinol");
  assert.equal(page.canonical, "https://careglow.com.br/anti-idade-e-retinol");
  assert.notEqual(page.publicationStatus, "new");
  assert.equal(page.publicationStatus, "published");
});

test("sem identidade publicada o caminho manual continua idêntico", async () => {
  const pilar = await articleVersion("b1", "sérum de niacinamida", 900);
  const apoio = await articleVersion("b2", "niacinamida e acne", 300);
  const formacao = formSiloWorkingCopies({ brandId: BRAND, articleVersions: [pilar, apoio] });
  const copy = chooseSiloWorkingCopyPillar(formacao.workingCopies[0], pilar.payload.articleId);
  const input = { copy, articleVersions: [pilar, apoio], articleStatuses: { [pilar.payload.articleId]: "approved", [apoio.payload.articleId]: "approved" } };

  const dnaPayload = buildConsolidatedSiloDnaPayload(input);
  const dna = await createVersionEnvelope({ entityId: dnaPayload.siloId, versionNumber: 1, origin: "human", changeReason: "test", createdBy: "test", payload: dnaPayload });
  const page = buildConsolidatedSiloPagePayload(dna, input);

  assert.equal(page.publicationStatus, "new");
  assert.equal(page.publishedUrl, null);
  assert.equal(page.canonical, null);
});
