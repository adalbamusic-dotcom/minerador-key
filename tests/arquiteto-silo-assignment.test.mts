import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  anchorDraftForExistingStructure,
  manualSiloCandidateDraft,
  planSiloAssignment,
  resolveSiloAssignmentOutcome,
} from "../lib/arquiteto/silo-assignment.ts";
import { buildTerritorialLandscape, type TerritorialLandscapeInput } from "../lib/arquiteto/territorial-landscape.ts";
import { buildTerritorialSurface } from "../lib/arquiteto/territorial-surface.ts";
import { TerritoryCandidateSchema, type TerritoryCandidate } from "../lib/arquiteto/territory.ts";

/**
 * Associação humana Keyword → Silo.
 *
 * A UI diz Silo; o domínio continua separando estrutura existente de registro
 * territorial interno. Nenhum provider, nenhuma migration, nenhum endpoint novo.
 */

const BRAND = "brand-1";
const OTHER_BRAND = "brand-2";
const REF_A = "territory:11111111-1111-4111-8111-111111111111";
const REF_B = "territory:22222222-2222-4222-8222-222222222222";
const HASH = `sha256:${"a".repeat(64)}`;

const territory = (territoryRef: string, overrides: Partial<TerritoryCandidate> = {}): TerritoryCandidate => ({
  schemaVersion: 1, territoryRef, brandId: BRAND, existingSiloRef: null,
  name: `Silo ${territoryRef.slice(-4)}`, centralEntity: "sérum facial", macroIntent: "informacional",
  boundary: { includes: ["sérum"], excludes: [] },
  narrative: { summary: "Universo.", relationToBrand: "core", editorialAngle: null },
  discovery: { origin: "manual_strategic", evidence: [], detectedAt: "2026-09-03T12:00:00.000Z" },
  territoryKind: "new", architecturalOrigin: "manual_strategic", ingestionOrigin: "ui",
  publicationProtection: "unpublished", lifecycleStatus: "candidate", decisionState: "pending",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFrom: null, mergedFrom: [], supersededBy: null },
  conflicts: [], pendingOperation: null, ...overrides,
} as TerritoryCandidate);

const siloDna = (siloId: string, name: string) => ({
  versionId: `v-${siloId}`, entityId: siloId, versionNumber: 1, previousVersionId: null,
  contentHash: HASH, origin: "human", changeReason: "seed",
  createdAt: "2026-09-03T12:00:00.000Z", createdBy: "user-1",
  payload: { siloId, name, brandId: BRAND },
});

const landscape = (input: Partial<TerritorialLandscapeInput> = {}) => buildTerritorialLandscape({
  brandId: BRAND, keywords: [], territories: [], assignments: [], ...input,
} as TerritorialLandscapeInput);

const keyword = (overrides: Partial<Parameters<typeof planSiloAssignment>[0]["keyword"]> = {}) => ({
  keywordId: "kw-1", brandId: BRAND, workflowItemId: "wf-1", expectedLock: 3,
  currentTerritoryRef: null, isPublished: false, ...overrides,
});

const plan = (input: Partial<Parameters<typeof planSiloAssignment>[0]> = {}) => planSiloAssignment({
  brandId: BRAND,
  landscape: landscape(),
  keyword: keyword(),
  target: { kind: "unassigned" },
  reason: "Decisão humana.",
  decidedAt: "2026-09-03T12:00:00.000Z",
  ...input,
} as Parameters<typeof planSiloAssignment>[0]);

test("keyword vai para um silo interno existente com decisão humana", () => {
  const resultado = plan({
    landscape: landscape({ keywords: [{ id: "kw-1", brand_id: BRAND }], territories: [territory(REF_A)] }),
    target: { kind: "territory", territoryRef: REF_A },
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.steps.length, 1, "silo interno já existe: nenhuma ancoragem");
  const step = resultado.steps[0];
  assert.equal(step.kind, "assign_keyword");
  assert.equal(step.territoryRef, REF_A);
  assert.equal(step.expectedLock, 3, "o lock vigente viaja para o writer");
  assert.equal(step.decision.source, "human");
  assert.equal(step.decision.state, "existing_silo_match");
  assert.ok(step.decision.reason.trim());
});

test("estrutura existente ganha registro interno ancorado, sem duplicar SiloDNA", () => {
  const paisagem = landscape({
    keywords: [{ id: "kw-1", brand_id: BRAND }],
    siloDnas: [siloDna("silo-1", "Skincare")] as never,
  });
  const resultado = plan({ landscape: paisagem, target: { kind: "existing_structure", siloId: "silo-1" } });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.steps.length, 2, "ancorar e só então associar");
  const [ancora, associacao] = resultado.steps;
  assert.equal(ancora.kind, "anchor_structure");
  assert.equal(associacao.kind, "assign_keyword");
  assert.equal(associacao.territoryRefFromAnchor, true, "o destino só existe depois do servidor emitir");
  assert.equal(associacao.territoryRef, null);

  // O registro aponta para o SiloDNA que já existe; nada é recriado.
  const draft = ancora.draft as Record<string, any>;
  assert.equal(draft.existingSiloRef.siloId, "silo-1");
  assert.equal(draft.existingSiloRef.siloDnaVersionRef.versionId, "v-silo-1");
  assert.equal(draft.existingSiloRef.siloDnaVersionRef.contentHash, HASH);
  assert.equal(draft.architecturalOrigin, "existing");
  assert.equal(draft.territoryKind, "existing");
});

test("o draft não declara identidade: o territoryRef é emitido pelo servidor", () => {
  const paisagem = landscape({ siloDnas: [siloDna("silo-1", "Skincare")] as never });
  const draft = anchorDraftForExistingStructure({
    structure: paisagem.existingStructures[0],
    actorReason: "Usar como silo.",
  });

  assert.equal("territoryRef" in draft, false);
  assert.equal("brandId" in draft, false);
  // E o draft completo é válido depois que o servidor impõe os dois.
  const validado = TerritoryCandidateSchema.parse({ ...draft, territoryRef: REF_A, brandId: BRAND });
  assert.equal(validado.existingSiloRef?.siloId, "silo-1");
});

test("associar keyword não inventa semântica nem confirma o silo", () => {
  const paisagem = landscape({ siloDnas: [siloDna("silo-1", "Skincare")] as never });
  const draft = anchorDraftForExistingStructure({ structure: paisagem.existingStructures[0], actorReason: "Usar como silo." });

  assert.equal(draft.centralEntity, "");
  assert.equal(draft.macroIntent, "");
  assert.deepEqual(draft.boundary, { includes: [], excludes: [] });
  assert.equal((draft.narrative as Record<string, unknown>).statement, null);
  // Continua candidato: confirmação é gate posterior.
  assert.equal(draft.lifecycleStatus, "candidate");
  assert.equal(draft.decisionState, "pending");
  assert.equal((draft.slugState as Record<string, unknown>).confirmed, null);
});

test("manter sem silo é decisão registrada, não ausência", () => {
  const resultado = plan({
    landscape: landscape({ keywords: [{ id: "kw-1", brand_id: BRAND }] }),
    target: { kind: "unassigned" },
    reason: "Fora do escopo editorial por ora.",
  });

  assert.equal(resultado.ok, true);
  const step = resultado.steps[0];
  assert.equal(step.kind, "assign_keyword");
  assert.equal(step.territoryRef, null);
  assert.equal(step.decision.state, "unassigned");
  assert.equal(step.decision.source, "human");
  assert.equal(step.decision.reason, "Fora do escopo editorial por ora.");
});

test("ausência de decisão não vira decisão explícita", () => {
  const paisagem = landscape({ keywords: [{ id: "kw-1", brand_id: BRAND }] });
  const entrada = paisagem.unassignedKeywords.find(item => item.keywordId === "kw-1");

  assert.ok(entrada);
  assert.equal(entrada.source, null, "recebimento do Minerador não é decisão");
  // E por isso "manter sem silo" continua sendo uma ação disponível.
  assert.equal(plan({ landscape: paisagem, target: { kind: "unassigned" } }).ok, true);
});

test("mover de um silo para outro é permitido; repetir o mesmo é recusado", () => {
  const paisagem = landscape({
    keywords: [{ id: "kw-1", brand_id: BRAND }],
    territories: [territory(REF_A), territory(REF_B)],
    assignments: [{
      keywordId: "kw-1", brandId: BRAND, territoryRef: REF_A, state: "existing_silo_match",
      reason: "Decisão humana.", source: "human", decidedAt: "2026-09-03T12:00:00.000Z",
    } as never],
  });

  const mover = plan({ landscape: paisagem, keyword: keyword({ currentTerritoryRef: REF_A }), target: { kind: "territory", territoryRef: REF_B } });
  assert.equal(mover.ok, true);
  const passoMover = mover.steps[0];
  assert.equal(passoMover.kind, "assign_keyword");
  assert.equal(passoMover.territoryRef, REF_B);

  const repetir = plan({ landscape: paisagem, keyword: keyword({ currentTerritoryRef: REF_A }), target: { kind: "territory", territoryRef: REF_A } });
  assert.equal(repetir.ok, false);
  assert.ok(repetir.refusals.some(item => item.code === "ALREADY_IN_TARGET"));
});

test("silo consolidado não recebe keyword e keyword publicada fica protegida", () => {
  const consolidado = landscape({
    keywords: [{ id: "kw-1", brand_id: BRAND }],
    territories: [territory(REF_A, { lifecycleStatus: "consolidated" })],
  });
  const recusa = plan({ landscape: consolidado, target: { kind: "territory", territoryRef: REF_A } });
  assert.equal(recusa.ok, false);
  assert.ok(recusa.refusals.some(item => item.code === "TERRITORY_NOT_ASSIGNABLE"));

  const publicada = plan({
    landscape: landscape({ territories: [territory(REF_A)] }),
    keyword: keyword({ isPublished: true }),
    target: { kind: "territory", territoryRef: REF_A },
  });
  assert.equal(publicada.ok, false);
  assert.ok(publicada.refusals.some(item => item.code === "PUBLISHED_KEYWORD_PROTECTED"));
});

test("estrutura sem versão canônica não é ancorada com binding forjado", () => {
  const semSiloDna = landscape({
    keywords: [{ id: "kw-1", brand_id: BRAND, silo_id: "silo-legado", status: "publicado" }],
  });
  const resultado = plan({ landscape: semSiloDna, target: { kind: "existing_structure", siloId: "silo-legado" } });

  assert.equal(resultado.ok, false);
  assert.ok(resultado.refusals.some(item => item.code === "STRUCTURE_WITHOUT_CANONICAL_VERSION"));
});

test("motivo é obrigatório e cross-brand é recusado", () => {
  const semMotivo = plan({ reason: "   " });
  assert.equal(semMotivo.ok, false);
  assert.ok(semMotivo.refusals.some(item => item.code === "REASON_REQUIRED"));

  const outraMarca = plan({ keyword: keyword({ brandId: OTHER_BRAND }) });
  assert.equal(outraMarca.ok, false);
  assert.ok(outraMarca.refusals.some(item => item.code === "KEYWORD_CROSS_BRAND"));
});

test("sem readback confirmando o destino não há sucesso", () => {
  const passos = plan({
    landscape: landscape({ keywords: [{ id: "kw-1", brand_id: BRAND }], territories: [territory(REF_A)] }),
    target: { kind: "territory", territoryRef: REF_A },
  });
  assert.equal(passos.ok, true);

  const confirmado = resolveSiloAssignmentOutcome({
    steps: passos.steps,
    readbackTerritoryRefByKeyword: new Map([["kw-1", REF_A]]),
    anchoredTerritoryRef: null,
  });
  assert.equal(confirmado.outcome, "applied");

  const silencioso = resolveSiloAssignmentOutcome({
    steps: passos.steps,
    readbackTerritoryRefByKeyword: new Map([["kw-1", null]]),
    anchoredTerritoryRef: null,
  });
  assert.equal(silencioso.outcome, "refused", "remoto sem o destino não é sucesso");
  assert.deepEqual(silencioso.pending, ["kw-1"]);

  const ausente = resolveSiloAssignmentOutcome({
    steps: passos.steps,
    readbackTerritoryRefByKeyword: new Map(),
    anchoredTerritoryRef: null,
  });
  assert.equal(ausente.outcome, "refused");
});

test("ancoragem sem identidade emitida é operação incompleta, nunca sucesso", () => {
  const paisagem = landscape({ keywords: [{ id: "kw-1", brand_id: BRAND }], siloDnas: [siloDna("silo-1", "Skincare")] as never });
  const passos = plan({ landscape: paisagem, target: { kind: "existing_structure", siloId: "silo-1" } });
  assert.equal(passos.ok, true);

  const semRef = resolveSiloAssignmentOutcome({
    steps: passos.steps,
    readbackTerritoryRefByKeyword: new Map([["kw-1", null]]),
    anchoredTerritoryRef: null,
  });
  assert.equal(semRef.outcome, "refused");

  const comRef = resolveSiloAssignmentOutcome({
    steps: passos.steps,
    readbackTerritoryRefByKeyword: new Map([["kw-1", REF_A]]),
    anchoredTerritoryRef: REF_A,
  });
  assert.equal(comRef.outcome, "applied");
});

test("a Lógica sugere e não decide: nada é pré-selecionado na UI", () => {
  const rows = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");

  assert.match(rows, /Sugestão da Lógica/);
  assert.match(rows, /React\.useState\(""\)/, "o controle começa sem escolha");
  assert.doesNotMatch(rows, /useState\(row\.hypothesis/);
  // Gravar exige clique explícito.
  assert.match(rows, /architect-silo-apply/);
});

test("o writer é o PATCH canônico existente, sem endpoint paralelo", () => {
  const canonical = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(canonical, /territoryCreates: \[\{ territory: input\.draft \}\]/);
  // Nenhuma rota nova para associação.
  assert.doesNotMatch(canonical, /api\/arquiteto\/(assignment|membership|silo-assign)/);
  // Lock stale recarrega em vez de sobrescrever.
  assert.match(workspace, /nunca sobrescrever/);
  assert.match(workspace, /expectedLock: step\.expectedLock/);
  // Nunca persistir keywordRefs do território.
  assert.doesNotMatch(workspace, /keywordRefs:\s*\[/);
});

test("a associação não chama provider e não abre migration", () => {
  const source = readFileSync("lib/arquiteto/silo-assignment.ts", "utf8");

  assert.doesNotMatch(source, /fetch\(|supabase|dataforseo|deepseek|migration|localStorage|IndexedDB/i);
  // Identidade nunca é forjada no cliente.
  assert.doesNotMatch(source, /territoryRef: `territory:/);
  assert.doesNotMatch(source, /randomUUID/);
});

test("a aba Artigos continua intacta", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  for (const label of ["Keyword principal", "Definição do artigo", "Revisão IA", "Quantidade de keywords"]) {
    assert.ok(workspace.includes(label), `rótulo de Artigos perdido: ${label}`);
  }
  // O controle de silo só existe na projeção territorial.
  assert.doesNotMatch(workspace, /architect-silo-choice/);
});

test("+ Silo cria só o candidato: nem lista, nem SiloDNA, nem SiloPage", () => {
  const draft = manualSiloCandidateDraft({ name: "Protetor solar", slug: "/protetor-solar" });

  assert.equal(draft.name, "Protetor solar");
  assert.equal(draft.architecturalOrigin, "manual_strategic");
  assert.equal(draft.ingestionOrigin, "ui");
  assert.equal(draft.lifecycleStatus, "candidate");
  assert.equal(draft.decisionState, "pending");
  assert.equal(draft.publicationProtection, "unpublished");
  assert.equal(draft.territoryKind, "new");
  assert.equal(draft.existingSiloRef, null, "criar candidato não é ancorar estrutura existente");
  assert.equal(draft.consolidation, null);

  // Identidade e tenant são do servidor.
  assert.equal("territoryRef" in draft, false);
  assert.equal("brandId" in draft, false);

  // Nenhuma entidade de etapa posterior é materializada. `publishedSlug` e
  // `publishedCanonical` são campos do contrato e ficam nulos — presença de
  // CHAVE de SiloDNA/SiloPage/lista é que denunciaria materialização.
  const serializado = JSON.stringify(draft);
  assert.doesNotMatch(serializado, /minerador_keyword_lists|siloDnaVersionRef|siloPageVersionRef|siloPageId|"siloId"|publishedUrl/);
  const slugState = draft.slugState as Record<string, unknown>;
  assert.equal(slugState.publishedSlug, null);
  assert.equal(slugState.publishedCanonical, null);
});

test("o slug do candidato é proposta, nunca URL publicada", () => {
  const draft = manualSiloCandidateDraft({ name: "Protetor solar", slug: "/protetor-solar" });
  const slugState = draft.slugState as Record<string, any>;

  assert.deepEqual(slugState.proposals.map((item: Record<string, unknown>) => item.slug), ["/protetor-solar"]);
  assert.equal(slugState.proposals[0].source, "human");
  assert.equal(slugState.confirmed, null, "confirmar slug é outra decisão");
  assert.equal(slugState.publishedSlug, null);
  assert.equal(slugState.publishedCanonical, null);

  // Sem slug o candidato continua válido.
  const semSlug = manualSiloCandidateDraft({ name: "Protetor solar", slug: null });
  assert.deepEqual((semSlug.slugState as Record<string, any>).proposals, []);
});

test("o candidato não inventa semântica para preencher formulário", () => {
  const draft = manualSiloCandidateDraft({ name: "Protetor solar", slug: "/protetor-solar" });

  assert.equal(draft.centralEntity, "");
  assert.equal(draft.macroIntent, "");
  assert.deepEqual(draft.boundary, { includes: [], excludes: [] });
  assert.equal((draft.narrative as Record<string, unknown>).statement, null);
  // E o servidor aceita esse mínimo.
  const validado = TerritoryCandidateSchema.parse({ ...draft, territoryRef: REF_A, brandId: BRAND });
  assert.equal(validado.lifecycleStatus, "candidate");
  assert.equal(validado.name, "Protetor solar");
});

test("a UI nova não usa mais a porta legada de criação de Silo", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const canonical = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");

  assert.doesNotMatch(workspace, /createCanonicalManualSilo/);
  assert.doesNotMatch(workspace, /api\/arquiteto\/silos/);
  assert.match(workspace, /createRemoteSiloCandidate\(/);
  // A rota legada continua existindo, congelada, para compatibilidade.
  assert.match(canonical, /createCanonicalManualSilo/);
  assert.match(canonical, /territoryCreates: \[\{ territory: input\.draft \}\]/);
});

test("criar candidato não altera RLS, grant nem abre migration", () => {
  const source = readFileSync("lib/arquiteto/silo-assignment.ts", "utf8");
  const canonical = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");

  assert.doesNotMatch(source, /GRANT|POLICY|ALTER TABLE|migration/i);
  assert.doesNotMatch(canonical, /GRANT|POLICY|ALTER TABLE/i);
  assert.doesNotMatch(source, /minerador_keyword_lists/);
});

test("silo candidato mostra Slug proposto, nunca Página", () => {
  const paisagem = landscape({
    territories: [territory(REF_A, {
      slugState: { proposals: [{ slug: "/protetor-solar", source: "human", rationale: "Proposta." }], confirmed: null, publishedSlug: null, publishedCanonical: null },
    } as Partial<TerritoryCandidate>)],
  });
  const surface = buildTerritorialSurface({ landscape: paisagem, logic: null });
  const header = surface.groups.find(group => group.kind === "territories")?.header;

  assert.ok(header);
  assert.equal(header.slug, "/protetor-solar");
  assert.equal(header.slugKind, "proposal", "sem SiloPage canônica não existe Página");

  const rows = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");
  assert.match(rows, /proposal: "Slug proposto"/);
  // O rótulo continua vindo do mapa de procedência; a linha principal mostra
  // Publicada/Proposto e a frase completa foi para a expansão.
  assert.match(rows, /const slugKind = header\.slugKind \?\? "none";/);
  assert.match(rows, /SLUG_LABELS\[slugKind\]/);
  assert.match(rows, /"Publicada" : "Proposto"/);
  // O rótulo fixo "Página:" não pode mais existir.
  assert.doesNotMatch(rows, /Página: <span/);
});

test("estrutura com SiloPage canônica continua mostrando Página", () => {
  const paisagem = landscape({
    siloDnas: [siloDna("silo-1", "Skincare")] as never,
    siloPages: [{
      versionId: "vp-1", entityId: "silo-page:silo-1", versionNumber: 1, previousVersionId: null,
      contentHash: HASH, origin: "human", changeReason: "seed",
      createdAt: "2026-09-03T12:00:00.000Z", createdBy: "user-1",
      payload: { siloPageId: "silo-page:silo-1", siloId: "silo-1", brandId: BRAND, slug: "/skincare", publishedUrl: null },
    }] as never,
  });
  const surface = buildTerritorialSurface({ landscape: paisagem, logic: null });
  const header = surface.groups.find(group => group.kind === "existing_structures")?.header;

  assert.ok(header);
  assert.equal(header.slug, "/skincare");
  assert.equal(header.slugKind, "page");
});

test("voltar de mantida-sem-silo para um Silo é permitido", () => {
  // `explicit_unassigned` não é tombstone nem estado final.
  const paisagem = landscape({
    keywords: [{ id: "kw-1", brand_id: BRAND }],
    territories: [territory(REF_A)],
    assignments: [{
      keywordId: "kw-1", brandId: BRAND, territoryRef: null, state: "unassigned",
      reason: "Decisão humana: manter a keyword sem silo.", source: "human", decidedAt: "2026-09-03T12:00:00.000Z",
    } as never],
  });

  const volta = plan({ landscape: paisagem, keyword: keyword({ currentTerritoryRef: null }), target: { kind: "territory", territoryRef: REF_A } });

  assert.equal(volta.ok, true);
  const step = volta.steps[0];
  assert.equal(step.kind, "assign_keyword");
  assert.equal(step.territoryRef, REF_A);
  assert.equal(step.decision.source, "human");
});
