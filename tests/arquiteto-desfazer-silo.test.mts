import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TERRITORY_UNDO_KEYWORD_REASON,
  planTerritoryUndo,
  resolveTerritoryUndoOutcome,
  territoryHasPublishedAddress,
  territoryUndoRefusals,
} from "../lib/arquiteto/territory-undo.ts";
import { humanSiloDecision, manualSiloCandidateDraft, publishedSiloCandidateDraft } from "../lib/arquiteto/silo-assignment.ts";
import { TerritoryCandidateSchema, type TerritoryCandidate } from "../lib/arquiteto/territory.ts";
import { buildTerritorialLandscape } from "../lib/arquiteto/territorial-landscape.ts";
import { buildTerritorialSurface } from "../lib/arquiteto/territorial-surface.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";

/**
 * DESFAZER SILO SUGERIDO — domínio, mesa e fiação da tela.
 *
 * O servidor (banco simulado, recusas antes da escrita) está em
 * `arquiteto-desfazer-silo-servidor.test.mts`.
 */

const BRAND = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const REF = "territory:33333333-3333-4333-8333-333333333333";
const REF_PUB = "territory:44444444-4444-4444-8444-444444444444";
const ATOR = "11111111-1111-4111-8111-111111111111";

const sugerido = (extra: Partial<TerritoryCandidate> = {}): TerritoryCandidate => TerritoryCandidateSchema.parse({
  ...manualSiloCandidateDraft({ name: "botox para o rosto", slug: "botox-rosto" }),
  territoryRef: REF, brandId: BRAND, lifecycleStatus: "confirmed", decisionState: "confirmed", ...extra,
});

const publicado = (): TerritoryCandidate => TerritoryCandidateSchema.parse({
  ...publishedSiloCandidateDraft({ name: "Captação de Pacientes", publishedSlug: "/captacao-de-pacientes", publishedCanonical: null, publishedUrl: null }),
  territoryRef: REF_PUB, brandId: BRAND, lifecycleStatus: "confirmed", decisionState: "confirmed",
});

const membros = [
  { keywordId: "kw-1", label: "botox rosto", isPublished: false },
  { keywordId: "kw-2", label: "botox testa", isPublished: false },
];
const vazio = { approvedArticles: [], siloArtifacts: [] };

/* ---------------------------------- domínio --------------------------------- */

test("Silo sugerido sem endereço publicado pode ser desfeito", () => {
  assert.equal(territoryHasPublishedAddress(sugerido()), false);
  assert.deepEqual(territoryUndoRefusals({ territory: sugerido(), members: membros, ...vazio }), []);
  // Candidato também: a transição candidate → rejected é a do domínio.
  assert.deepEqual(territoryUndoRefusals({ territory: sugerido({ lifecycleStatus: "candidate", decisionState: "pending" }), members: [], ...vazio }), []);
});

test("Silo publicado nunca é desfeito: slug publicado, proteção ou página do site", () => {
  const recusas = territoryUndoRefusals({ territory: publicado(), members: [], ...vazio });
  assert.equal(territoryHasPublishedAddress(publicado()), true);
  assert.deepEqual(recusas.map(item => item.code), ["PUBLISHED_ADDRESS"]);
  assert.match(recusas[0].message, /endereço publicado \(\/captacao-de-pacientes\)/);
  const soCanonical = sugerido({ slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: "https://x.com/a" } });
  assert.equal(territoryHasPublishedAddress(soCanonical), true);
});

test("recusa com motivo: consolidado, já rejeitado, ArticleDNA aprovado, SiloDNA/SiloPage aprovado, keyword publicada", () => {
  const codigos = (input: Parameters<typeof territoryUndoRefusals>[0]) => territoryUndoRefusals(input).map(item => item.code);
  assert.deepEqual(codigos({ territory: sugerido({ lifecycleStatus: "rejected", decisionState: "rejected" }), members: [], ...vazio }), ["NOT_UNDOABLE_STATE"]);
  assert.deepEqual(codigos({ territory: { ...sugerido(), lifecycleStatus: "consolidated" }, members: [], ...vazio }), ["CONSOLIDATED"]);
  assert.deepEqual(codigos({ territory: sugerido(), members: membros, approvedArticles: [{ articleId: "a1", label: "botox-rosto", territoryRef: null, keywordIds: ["kw-2"] }], siloArtifacts: [] }), ["APPROVED_ARTICLE_DNA"]);
  // ArticleDNA aprovado que declara o território, mesmo sem keyword membro hoje.
  assert.deepEqual(codigos({ territory: sugerido(), members: [], approvedArticles: [{ articleId: "a2", territoryRef: REF, keywordIds: ["kw-9"] }], siloArtifacts: [] }), ["APPROVED_ARTICLE_DNA"]);
  // ArticleDNA aprovado de outro Silo, sem keyword deste: não bloqueia.
  assert.deepEqual(codigos({ territory: sugerido(), members: membros, approvedArticles: [{ articleId: "a3", territoryRef: REF_PUB, keywordIds: ["kw-9"] }], siloArtifacts: [] }), []);
  assert.deepEqual(codigos({ territory: sugerido(), members: [], approvedArticles: [], siloArtifacts: [{ kind: "silo_dna", territoryRef: REF, status: "approved" }] }), ["APPROVED_SILO_ARTIFACT"]);
  assert.deepEqual(codigos({ territory: sugerido(), members: [], approvedArticles: [], siloArtifacts: [{ kind: "silo_page", territoryRef: REF, status: "proposed", published: true }] }), ["APPROVED_SILO_ARTIFACT"]);
  // SiloDNA só proposto não bloqueia: ainda não é aprovação.
  assert.deepEqual(codigos({ territory: sugerido(), members: [], approvedArticles: [], siloArtifacts: [{ kind: "silo_dna", territoryRef: REF, status: "proposed" }] }), []);
  assert.deepEqual(codigos({ territory: sugerido(), members: [{ keywordId: "kw-1", label: "botox", isPublished: true }], ...vazio }), ["PUBLISHED_KEYWORD"]);
  assert.deepEqual(codigos({ territory: sugerido(), members: [{ keywordId: "kw-1", isPublished: false, editable: false }], ...vazio }), ["KEYWORD_NOT_EDITABLE"]);
});

test("o plano: território em rejected com ator e hora, nada apagado, keyword pela mesma decisão de Silo", () => {
  const territory = sugerido();
  const plano = planTerritoryUndo({ territory, members: membros, ...vazio, actorUserId: ATOR, decidedAt: "2026-09-30T12:00:00.000Z" });
  assert.equal(plano.ok, true);
  if (!plano.ok) return;
  const draft = TerritoryCandidateSchema.parse(plano.territoryDraft);
  assert.equal(draft.lifecycleStatus, "rejected");
  assert.equal(draft.decisionState, "rejected");
  assert.equal(draft.territoryRef, REF);
  assert.equal(draft.name, territory.name);
  assert.deepEqual(draft.slugState, territory.slugState);
  assert.equal(draft.reasons.length, territory.reasons.length + 1);
  assert.match(draft.reasons.at(-1)!, /2026-09-30T12:00:00.000Z \(ator 11111111-1111-4111-8111-111111111111\)\. Nada foi apagado; 2 keyword\(s\)/);
  assert.equal(draft.provenance.humanAdjustmentCount, territory.provenance.humanAdjustmentCount + 1);
  assert.deepEqual(plano.keywordDecision, humanSiloDecision("unassigned", TERRITORY_UNDO_KEYWORD_REASON, "2026-09-30T12:00:00.000Z"));
  assert.deepEqual(plano.keywordDecision, { state: "unassigned", reason: TERRITORY_UNDO_KEYWORD_REASON, source: "human", decidedAt: "2026-09-30T12:00:00.000Z" });
  assert.deepEqual(plano.memberKeywordIds, ["kw-1", "kw-2"]);
  assert.equal(planTerritoryUndo({ territory: publicado(), members: [], ...vazio, actorUserId: ATOR, decidedAt: "x" }).ok, false);
});

test("o desfecho vem da releitura: aplicado, pela metade ou recusado", () => {
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "rejected", expectedMemberIds: ["a", "b"], readbackMemberIds: [] }).outcome, "applied");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "confirmed", expectedMemberIds: ["a", "b"], readbackMemberIds: ["b"] }).outcome, "partial");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "rejected", expectedMemberIds: ["a"], readbackMemberIds: ["a"] }).outcome, "partial");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "confirmed", expectedMemberIds: ["a", "b"], readbackMemberIds: ["a", "b"] }).outcome, "refused");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "confirmed", expectedMemberIds: [], readbackMemberIds: [] }).outcome, "refused");
});

/* ------------------------------------ mesa ----------------------------------- */

const keyword = (id: string) => ({ id, brand_id: BRAND, keyword: id, intent: "informacional", analise_semantica: { entidade_central: "botox" } });
const membership = (keywordId: string, territoryRef: string | null) => ({
  keywordId, brandId: BRAND, territoryRef, state: territoryRef ? "existing_silo_match" : "unassigned",
  reason: territoryRef ? "Decisão humana." : TERRITORY_UNDO_KEYWORD_REASON, source: "human", decidedAt: "2026-09-30T12:00:00.000Z",
}) as never;

test("Silo desfeito e vazio some da mesa e das contagens; as keywords ficam em Sem silo", () => {
  const desfeito = sugerido({ lifecycleStatus: "rejected", decisionState: "rejected" });
  const landscape = buildTerritorialLandscape({
    brandId: BRAND, keywords: [keyword("kw-1"), keyword("kw-2")], territories: [desfeito, publicado()],
    assignments: [membership("kw-1", null), membership("kw-2", null)],
  });
  const surface = buildTerritorialSurface({ landscape, logic: null });
  const refs = surface.groups.filter(group => group.kind === "territories").map(group => group.header?.ref);
  assert.deepEqual(refs, [REF_PUB]);
  assert.equal(surface.counts.territories, 1);
  const semSilo = surface.groups.find(group => group.kind === "unassigned");
  assert.deepEqual(semSilo?.rows.map(row => row.keywordId).sort(), ["kw-1", "kw-2"]);
  // A formação só lê Silo confirmado: rejeitado não entra.
  assert.equal(landscape.confirmedTerritories.some(item => item.territoryRef === REF), false);
  assert.equal(landscape.candidateTerritories.some(item => item.territoryRef === REF), false);
});

test("rejeitado que ainda segura keyword continua na mesa: keyword nenhuma some", () => {
  const desfeito = sugerido({ lifecycleStatus: "rejected", decisionState: "rejected" });
  const landscape = buildTerritorialLandscape({
    brandId: BRAND, keywords: [keyword("kw-1")], territories: [desfeito], assignments: [membership("kw-1", REF)],
  });
  const surface = buildTerritorialSurface({ landscape, logic: null });
  const grupo = surface.groups.find(group => group.kind === "territories" && group.header?.ref === REF);
  assert.ok(grupo, "o Silo rejeitado com keyword continua visível");
  assert.equal(grupo!.header?.lifecycleStatus, "rejected");
  assert.equal(surface.counts.territories, 1);
});

/* ------------------------------ fiação da tela ------------------------------- */

const semComentarios = (codigo: string) => codigo
  .split("\n")
  .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("/*") && !line.trimStart().startsWith("//"))
  .join("\n");
const workspace = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));
const linhas = semComentarios(readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8"));
const cliente = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");
const rota = semComentarios(readFileSync("lib/server/arquiteto-workspace-http.ts", "utf8"));

test("a tela usa o PATCH canônico do workspace e confere na releitura antes de anunciar", () => {
  const writer = cliente.slice(cliente.indexOf("export async function undoRemoteSiloCandidate"));
  assert.match(writer.slice(0, 1500), /fetch\("\/api\/arquiteto\/workspace"[\s\S]*method: "PATCH"[\s\S]*territoryUndos: \[\{ territoryRef: input\.territoryRef, expectedLock: input\.expectedLock \}\]/);
  assert.match(writer.slice(0, 1500), /lifecycleStatus !== "rejected"/);
  const handler = workspace.slice(workspace.indexOf("const undoSuggestedSilos = async"));
  assert.match(handler.slice(0, 4000), /undoRemoteSiloCandidate\(\{ brandId: selectedBrandId, territoryRef: ref, expectedLock: remote\.lockVersion \}\)/);
  assert.match(handler.slice(0, 4000), /loadCanonicalArquitetoWorkspace\(selectedBrandId\)[\s\S]*resolveTerritoryUndoOutcome/);
  // Só o que a releitura confirmou vira sucesso.
  assert.match(handler.slice(0, 4000), /veredito\.outcome === "applied"\) desfeitos\.push/);
});

test("botão por Silo sugerido, botão em lote e uma confirmação que diz o que acontece", () => {
  assert.match(linhas, /header\.kind === "territory" && undoControls\?\.byRef\.has\(header\.ref\)/);
  assert.match(linhas, />\s*Desfazer Silo\s*</);
  assert.match(linhas, /`Desfazer os Silos sugeridos \(\$\{undoAll\.count\}\)`/);
  assert.match(workspace, /if \(territoryHasPublishedAddress\(territory\)\) continue;/);
  assert.match(workspace, /onUndoAll: \(\) => setSiloUndoPrompt\(siloUndoEligibleRefs\)/);
  assert.match(workspace, /O Silo sai da aba Silos \(fica guardado como rejeitado; nada é apagado\)\. As keywords dele voltam para “sem Silo” e continuam na mesa\./);
  assert.match(workspace, /Não pode ser desfeito: \$\{leitura!\.refusals\.join\(" "\)\}/);
});

test("o diálogo fica aberto com o andamento, fecha com Esc e abre com o foco no Cancelar", () => {
  const handler = workspace.slice(workspace.indexOf("const undoSuggestedSilos = async"));
  const corpo = handler.slice(0, handler.indexOf("\n  };\n"));
  // O diálogo só fecha no fim (finally), depois da releitura; durante o lote diz "Desfazendo i de N…".
  assert.match(corpo, /setSiloUndoProgress\(\{ done: indice \+ 1, total: refs\.length \}\)/);
  assert.ok(corpo.indexOf("setSiloUndoPrompt(null)") > corpo.indexOf("finally"), "o diálogo fecha só no finally");
  assert.match(workspace, /`Desfazendo \$\{siloUndoProgress\.done\} de \$\{siloUndoProgress\.total\}…/);
  assert.match(workspace, /event\.key === "Escape" && !siloUndoBusy\) setSiloUndoPrompt\(null\)/);
  assert.match(workspace, /if \(siloUndoPrompt\) siloUndoCancelRef\.current\?\.focus\(\)/);
  assert.match(workspace, /ref=\{siloUndoCancelRef\} disabled=\{siloUndoBusy\}/);
  // Pela metade sem keyword restante: a frase diz o que falta, não "0 keyword(s)".
  assert.match(corpo, /falta marcar o Silo como desfeito/);
});

test("a rota: plano antes da escrita, keywords pelo writer da decisão de Silo, território por último", () => {
  const bloco = rota.slice(rota.indexOf("for (const undo of parsed.territoryUndos || [])"));
  const plano = bloco.indexOf("planTerritoryUndoForBrand(context, undo.territoryRef, undo.expectedLock)");
  const keywords = bloco.indexOf("updated.push(await applyKeywordUpdate(update, undoKeywordById))");
  const territorio = bloco.indexOf("updateTerritoryWorkflowItem(context, undo.territoryRef, undo.expectedLock, plano.territoryDraft)");
  assert.ok(plano >= 0 && keywords > plano && territorio > keywords, "ordem: plano → keywords → território");
  assert.match(rota, /for \(const update of parsed\.updates \|\| \[\]\) updated\.push\(await applyKeywordUpdate\(update, keywordById\)\);/);
});

test("o catálogo registra Desfazer Silo como ação de tela humana, sem ferramenta MCP", () => {
  const operacao = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.undo_suggested_silo");
  assert.ok(operacao);
  assert.equal(operacao!.access, "ui");
  assert.equal(operacao!.decision, "human");
  assert.equal(operacao!.cost, "free");
  assert.equal(operacao!.tools, undefined);
  assert.equal(operacao!.chatConfirmationRequired, undefined);
  assert.match(operacao!.howOnScreen, /Desfazer Silo/);
  assert.match(operacao!.howOnScreen, /Desfazer os Silos sugeridos \(N\)/);
  assert.equal(readFileSync("lib/server/platform-mcp-tools.ts", "utf8").includes("territoryUndos"), false);
});
