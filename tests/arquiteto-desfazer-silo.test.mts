import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TERRITORY_UNDO_KEYWORD_REASON,
  TERRITORY_UNDO_WHOLE_SILO_KEYWORD_REASON,
  buildTerritoryUndoRejections,
  planTerritoryUndo,
  resolveTerritoryUndoOutcome,
  territoryHasPublishedAddress,
  territoryUndoRefusals,
  territoryUndoNotices,
  territoryUndoWholeSiloReasons,
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

/*
 * 2026-10-18 · DUAS DECISÕES DO DONO NO MESMO DIA. De manhã ("Manter em duas etapas"): o Silo consolidado, do plano, com
 * par ou com artigo aprovado sai pelo MESMO "Desfazer Silo", inteiro (Pilar incluído), com a prévia e a confirmação forte
 * — SUBSTITUÍDAS as recusas CONSOLIDATED, APPROVED_ARTICLE_DNA, APPROVED_SILO_ARTIFACT e DECLARED_PLAN_SILO. Depois, a que a
 * amplia (literal): "tem que poder apagar sim não interessa qual seja o estado … e alerta falando o que está apagando" —
 * SUBSTITUÍDAS também PUBLISHED_ADDRESS, EXISTING_SILO, PUBLISHED_KEYWORD, KEYWORD_NOT_EDITABLE, ARTICLE_OF_OTHER_SILO,
 * ARTICLE_PUBLISHED e ARTICLE_IN_DOWNSTREAM: viraram LINHAS da prévia (o alerta). Só fica "já desfeito".
 */
test("Silo publicado também se desfaz (inteiro): a prévia diz que o site não muda — nada é recusado pelo estado", () => {
  assert.equal(territoryHasPublishedAddress(publicado()), true);
  const entrada = { territory: publicado(), members: [], ...vazio };
  assert.deepEqual(territoryUndoRefusals(entrada), []);
  assert.ok(territoryUndoWholeSiloReasons(entrada).includes("published"), "publicado = o Silo inteiro, com a confirmação forte");
  assert.match(territoryUndoNotices(entrada)[0], /^Publicado: o Silo tem endereço no site \(\/captacao-de-pacientes\)\. A página no site, a URL, o slug e o canonical não mudam/);
  const soCanonical = sugerido({ slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: "https://x.com/a" } });
  assert.equal(territoryHasPublishedAddress(soCanonical), true);
});

test("nada é recusado pelo estado; o alerta diz o que é publicado, adiante, de outro Silo ou fora da etapa", () => {
  const codigos = (input: Parameters<typeof territoryUndoRefusals>[0]) => territoryUndoRefusals(input).map(item => item.code);
  const inteiro = (input: Parameters<typeof territoryUndoRefusals>[0]) => territoryUndoWholeSiloReasons(input);
  assert.deepEqual(codigos({ territory: sugerido({ lifecycleStatus: "rejected", decisionState: "rejected" }), members: [], ...vazio }), ["NOT_UNDOABLE_STATE"], "só o já desfeito");
  const consolidado = { territory: { ...sugerido(), lifecycleStatus: "consolidated" as const }, members: [], ...vazio };
  assert.deepEqual(codigos(consolidado), [], "consolidado: sai inteiro");
  assert.deepEqual(inteiro(consolidado), ["consolidated"]);
  const comArtigo = { territory: sugerido(), members: membros, approvedArticles: [{ articleId: "a1", label: "botox-rosto", territoryRef: null, keywordIds: ["kw-2"] }], siloArtifacts: [] };
  assert.deepEqual(codigos(comArtigo), []);
  assert.deepEqual(inteiro(comArtigo), ["approved_articles"], "o artigo aprovado com keyword do Silo sai junto");
  // ArticleDNA aprovado que declara o território, mesmo sem keyword membro hoje: é deste Silo.
  assert.deepEqual(inteiro({ territory: sugerido(), members: [], approvedArticles: [{ articleId: "a2", territoryRef: REF, keywordIds: ["kw-9"] }], siloArtifacts: [] }), ["approved_articles"]);
  // ArticleDNA aprovado de outro Silo, sem keyword deste: não conta.
  const deOutroSemKeyword = { territory: sugerido(), members: membros, approvedArticles: [{ articleId: "a3", territoryRef: REF_PUB, keywordIds: ["kw-9"] }], siloArtifacts: [] };
  assert.deepEqual(codigos(deOutroSemKeyword), []);
  assert.deepEqual(inteiro(deOutroSemKeyword), []);
  // Artigo aprovado de OUTRO Silo que usa keyword deste: fica como está (a keyword só sai deste Silo) — dito no alerta.
  const deOutro = { territory: sugerido(), members: membros, approvedArticles: [{ articleId: "a4", label: "botox-testa", territoryRef: REF_PUB, keywordIds: ["kw-1"] }], siloArtifacts: [] };
  assert.deepEqual(codigos(deOutro), []);
  assert.match(territoryUndoNotices(deOutro).join(" "), /De outro Silo: 1 artigo\(s\) \(“botox-testa”\) usam keyword deste Silo e ficam como estão/);
  const comPar = { territory: sugerido(), members: [], approvedArticles: [], siloArtifacts: [{ kind: "silo_dna" as const, territoryRef: REF, status: "approved" }] };
  assert.deepEqual(codigos(comPar), []);
  assert.deepEqual(inteiro(comPar), ["silo_pair"]);
  const paginaPublicada = { territory: sugerido(), members: [], approvedArticles: [], siloArtifacts: [{ kind: "silo_page" as const, territoryRef: REF, status: "proposed", published: true }] };
  assert.deepEqual(codigos(paginaPublicada), []);
  assert.ok(inteiro(paginaPublicada).includes("published"));
  // SiloDNA só proposto não faz o Silo inteiro: ainda não é aprovação.
  assert.deepEqual(inteiro({ territory: sugerido(), members: [], approvedArticles: [], siloArtifacts: [{ kind: "silo_dna", territoryRef: REF, status: "proposed" }] }), []);
  // Já rejeitado (evento) não conta: nem o artigo nem o par.
  assert.deepEqual(inteiro({ territory: sugerido(), members: membros, approvedArticles: [{ articleId: "a1", territoryRef: REF, keywordIds: ["kw-2"], status: "rejected" }], siloArtifacts: [{ kind: "silo_dna", territoryRef: REF, status: "rejected" }] }), []);
  const keywordPublicada = { territory: sugerido(), members: [{ keywordId: "kw-1", label: "botox", isPublished: true }], ...vazio };
  assert.deepEqual(codigos(keywordPublicada), []);
  assert.ok(inteiro(keywordPublicada).includes("published"));
  assert.match(territoryUndoNotices(keywordPublicada).join(" "), /Publicada: 1 keyword\(s\) \(“botox”\) saem do Silo no Arquiteto; URL, slug e canonical não mudam/);
  const foraDaEtapa = { territory: sugerido(), members: [{ keywordId: "kw-1", label: "botox", isPublished: false, editable: false }], ...vazio };
  assert.deepEqual(codigos(foraDaEtapa), []);
  assert.match(territoryUndoNotices(foraDaEtapa).join(" "), /Fora da etapa do Arquiteto: 1 keyword\(s\) \(“botox”\) ficam como estão/);
  // Artigo publicado e artigo já no Radar/Redator: saem, com o alerta (o site não muda; o item sai da operação).
  const publicadoNoSilo = { ...consolidado, approvedArticles: [{ articleId: "a5", label: "botox-preco", territoryRef: REF, keywordIds: [], published: true }] };
  assert.deepEqual(codigos(publicadoNoSilo), []);
  assert.match(territoryUndoNotices(publicadoNoSilo).join(" "), /Publicado: 1 artigo\(s\) deste Silo estão no ar \(“botox-preco”\)\. No site nada muda/);
  const adiante = { ...consolidado, approvedArticles: [{ articleId: "a6", label: "botox-dor", territoryRef: REF, keywordIds: [], downstreamStages: ["radar", "writer"] }] };
  assert.deepEqual(codigos(adiante), []);
  assert.ok(inteiro(adiante).includes("downstream"));
  assert.match(territoryUndoNotices(adiante).join(" "), /Adiante: “botox-dor” está no Radar e Redator — o item sai da operação \(“retirado”\); a investigação e o documento ficam como histórico/);
});

test("o plano: território em rejected com ator e hora, nada apagado, keyword pela mesma decisão de Silo", () => {
  const territory = sugerido();
  const plano = planTerritoryUndo({ territory, members: membros, ...vazio, actorUserId: ATOR, decidedAt: "2026-09-30T12:00:00.000Z" });
  assert.equal(plano.ok, true);
  if (!plano.ok) return;
  assert.equal(plano.scope, "suggested", "o Silo sugerido: o de sempre");
  assert.equal(plano.wholeSilo, null);
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
  // 2026-10-18 · o publicado também se desfaz (inteiro); o site não muda.
  const doPublicado = planTerritoryUndo({ territory: publicado(), members: [], ...vazio, actorUserId: ATOR, decidedAt: "x" });
  assert.equal(doPublicado.ok && doPublicado.scope, "whole_silo");
});

test("o desfecho vem da releitura: aplicado, pela metade ou recusado", () => {
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "rejected", expectedMemberIds: ["a", "b"], readbackMemberIds: [] }).outcome, "applied");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "confirmed", expectedMemberIds: ["a", "b"], readbackMemberIds: ["b"] }).outcome, "partial");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "rejected", expectedMemberIds: ["a"], readbackMemberIds: ["a"] }).outcome, "partial");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "confirmed", expectedMemberIds: ["a", "b"], readbackMemberIds: ["a", "b"] }).outcome, "refused");
  assert.equal(resolveTerritoryUndoOutcome({ territoryRef: REF, readbackLifecycle: "confirmed", expectedMemberIds: [], readbackMemberIds: [] }).outcome, "refused");
});

/*
 * 2026-10-18 · O SILO INTEIRO (decisão do dono "Manter em duas etapas"): o azul da WifiConecta — Silo do plano
 * "Wi-Fi e fibra óptica", consolidado (SiloDNA/SiloPage v2), Pilar + 6 Suportes.
 */
const DNA_V2 = "dddddddd-0000-4000-8000-000000000002";
const PAGE_V2 = "eeeeeeee-0000-4000-8000-000000000002";
const HASH = `sha256:${"a".repeat(64)}`;
const consolidadoDoPlano = (): TerritoryCandidate => TerritoryCandidateSchema.parse({
  ...manualSiloCandidateDraft({ name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra-optica" }),
  territoryRef: REF, brandId: BRAND, lifecycleStatus: "consolidated", decisionState: "confirmed",
  consolidation: {
    siloId: REF,
    siloDnaVersionRef: { entityId: REF, versionId: DNA_V2, contentHash: HASH, versionNumber: 2 },
    siloPageVersionRef: { entityId: `silo-page:${REF}`, versionId: PAGE_V2, contentHash: HASH, versionNumber: 2 },
    consolidatedAt: "2026-10-17T12:00:00.000Z",
  },
});
const ARTIGOS = ["pilar", "s1", "s2", "s3", "s4", "s5", "s6"];
const artigosDoAzul = ARTIGOS.map((id, indice) => ({ articleId: `art-${id}`, label: indice === 0 ? "diferença entre internet e wi-fi" : `suporte ${indice}`, territoryRef: REF, siloId: REF, keywordIds: [`kw-${id}`], versionId: `v-${id}`, versionNumber: 2, status: "approved" }));
const parDoAzul = [
  { kind: "silo_dna" as const, territoryRef: REF, siloId: REF, status: "approved", versionId: DNA_V2, versionNumber: 2, pillarArticleId: "art-pilar", articleIds: ARTIGOS.slice(1).map(id => `art-${id}`) },
  { kind: "silo_page" as const, territoryRef: REF, siloId: REF, status: "approved", versionId: PAGE_V2, versionNumber: 2 },
];
const membrosDoAzul = ARTIGOS.map(id => ({ keywordId: `kw-${id}`, label: id, isPublished: false }));

test("Silo inteiro (consolidado, do plano, Pilar + 6): 7 ArticleDNA rejeitados, o par fora de vigência, o grafo, o território desfeito e o grupo desligado — nada apagado", async () => {
  const entrada = {
    territory: consolidadoDoPlano(), members: membrosDoAzul, approvedArticles: artigosDoAzul, siloArtifacts: parDoAzul,
    declaredPlan: { groupLabel: "Azul (Wi-Fi e fibra óptica)", siloName: "Wi-Fi e fibra óptica" },
    linkGraphs: [{ graphVersionId: "g-1", versionNumber: 1, siloId: REF }],
    linkedGroup: { groupId: "07fec332-4b0a-43cb-af19-cedfd9b24897", groupLabel: "Azul (Wi-Fi e fibra óptica)", siloId: REF },
    actorUserId: ATOR, decidedAt: "2026-10-18T12:00:00.000Z",
  };
  assert.deepEqual(territoryUndoRefusals(entrada), []);
  assert.deepEqual(territoryUndoWholeSiloReasons(entrada), ["consolidated", "declared_plan", "silo_pair", "approved_articles"]);
  const plano = planTerritoryUndo(entrada);
  assert.equal(plano.ok, true);
  if (!plano.ok) return;
  assert.equal(plano.scope, "whole_silo");
  const silo = plano.wholeSilo!;
  assert.equal(silo.articles.length, 7);
  assert.deepEqual(silo.articles[0], { articleId: "art-pilar", versionId: "v-pilar", versionNumber: 2, label: "diferença entre internet e wi-fi", role: "Pilar", published: false, downstreamStages: [] }, "o Pilar vem primeiro e sai junto");
  assert.equal(silo.articles.filter(article => article.role === "Suporte").length, 6);
  assert.deepEqual(silo.pair.map(item => [item.kind, item.versionId]), [["silo_dna", DNA_V2], ["silo_page", PAGE_V2]]);
  assert.equal(silo.confirmationName, "Wi-Fi e fibra óptica");
  assert.equal(silo.group?.groupId, "07fec332-4b0a-43cb-af19-cedfd9b24897");
  // A prévia diz exatamente o que sai, sem custo.
  assert.match(silo.lines[0], /Artigos: 7 saem do Silo \(Pilar incluído\)/);
  assert.ok(silo.lines.includes("Pilar · “diferença entre internet e wi-fi” v2"));
  assert.ok(silo.lines.some(line => /^SiloDNA v2 e SiloPage v2: deixam de valer \(status “rejeitado”\); as versões ficam como histórico\.$/.test(line)));
  assert.ok(silo.lines.some(line => /^Grafo de links internos v1 \(aprovado\): deixa de valer junto com o par/.test(line)));
  assert.ok(silo.lines.some(line => /^Território “Wi-Fi e fibra óptica”: vira desfeito \(rejeitado\).*7 keyword\(s\) voltam para “sem Silo”/.test(line)));
  assert.ok(silo.lines.some(line => /^Grupo Azul \(Wi-Fi e fibra óptica\): desligado deste Silo/.test(line)));
  assert.ok(silo.lines.includes("Custo: nenhum (nada é pago)."));
  // O território: desfeito, sem a consolidação (o contrato), com o registro de tudo; o resto fica igual.
  const draft = TerritoryCandidateSchema.parse(plano.territoryDraft);
  assert.equal(draft.lifecycleStatus, "rejected");
  assert.equal(draft.decisionState, "rejected");
  assert.equal(draft.consolidation, null);
  assert.equal(draft.name, "Wi-Fi e fibra óptica");
  assert.match(draft.reasons.at(-1)!, /^Silo inteiro desfeito por decisão humana em 2026-10-18T12:00:00\.000Z \(ator 11111111-1111-4111-8111-111111111111\): 7 artigo\(s\) retirado\(s\) .*Pilar incluído.*a consolidação registrada \(SiloDNA dddddddd-0000-4000-8000-000000000002 v2, SiloPage eeeeeeee-0000-4000-8000-000000000002 v2.*o grupo Azul \(Wi-Fi e fibra óptica\) desligado do Silo; nada de histórico foi apagado; 7 keyword\(s\) voltaram para sem Silo\.$/);
  assert.deepEqual(plano.keywordDecision, humanSiloDecision("unassigned", TERRITORY_UNDO_WHOLE_SILO_KEYWORD_REASON, "2026-10-18T12:00:00.000Z"));
  assert.equal(plano.memberKeywordIds.length, 7);
  // Os eventos: um "rejected" por ArticleDNA vigente e um por versão do par; id determinístico (repetir não duplica).
  const eventos = await buildTerritoryUndoRejections(silo, { territoryRef: REF, actorId: ATOR, occurredAt: "2026-10-18T12:00:00.000Z" });
  assert.equal(eventos.length, 9);
  assert.ok(eventos.every(evento => evento.status === "rejected" && evento.actorId === ATOR));
  assert.deepEqual(eventos.map(evento => evento.versionId).sort(), [...ARTIGOS.map(id => `v-${id}`), DNA_V2, PAGE_V2].sort());
  assert.match(eventos.find(evento => evento.versionId === "v-pilar")!.reason, /o artigo \(Pilar\) sai junto\. Nada é apagado\./);
  const deNovo = await buildTerritoryUndoRejections(silo, { territoryRef: REF, actorId: ATOR, occurredAt: "2026-10-18T13:00:00.000Z" });
  assert.deepEqual(deNovo.map(evento => evento.eventId), eventos.map(evento => evento.eventId));
});

test("Silo inteiro: o desfecho da releitura exige os artigos e o par fora da mesa", () => {
  const base = { territoryRef: REF, readbackLifecycle: "rejected", expectedMemberIds: ["a"], readbackMemberIds: [], expectedGoneArticleIds: ["art-pilar"], expectedGoneSiloIds: [REF] };
  assert.equal(resolveTerritoryUndoOutcome({ ...base, readbackArticleIds: [], readbackSiloIds: [] }).outcome, "applied");
  const metade = resolveTerritoryUndoOutcome({ ...base, readbackArticleIds: ["art-pilar"], readbackSiloIds: [] });
  assert.equal(metade.outcome, "partial");
  assert.deepEqual(metade.remainingArticles, ["art-pilar"]);
  assert.equal(resolveTerritoryUndoOutcome({ ...base, readbackArticleIds: [], readbackSiloIds: [REF] }).outcome, "partial");
  assert.equal(resolveTerritoryUndoOutcome({ ...base, readbackLifecycle: "consolidated", readbackMemberIds: ["a"], readbackArticleIds: ["art-pilar"], readbackSiloIds: [REF] }).outcome, "refused");
});

test("a mesa aplica o evento 'rejeitado' também no par do Silo: o par desfeito sai dos Silos ativos (nada apagado)", async () => {
  const { releaseRejectedSiloPairs } = await import("../lib/arquiteto/rejected-article-release.ts");
  const dna = (versionId: string, siloId: string) => ({ versionId, payload: { siloId } });
  const entrada = {
    siloDnas: [dna("dna-azul", REF), dna("dna-outro", REF_PUB)],
    siloPages: [dna("page-azul", REF), dna("page-outro", REF_PUB)],
    statuses: [{ versionId: "dna-azul", status: "approved" }, { versionId: "page-azul", status: "approved" }, { versionId: "dna-outro", status: "approved" }, { versionId: "page-outro", status: "approved" }],
  };
  const semEvento = releaseRejectedSiloPairs({ ...entrada, events: [] });
  assert.deepEqual(semEvento.siloDnas.map(item => item.versionId), ["dna-azul", "dna-outro"], "sem evento, a mesa de sempre");
  const desfeito = releaseRejectedSiloPairs({ ...entrada, events: [{ versionId: "dna-azul", status: "rejected", occurredAt: "2026-10-18T12:00:00.000Z" }] });
  assert.deepEqual(desfeito.siloDnas.map(item => item.versionId), ["dna-outro"]);
  assert.deepEqual(desfeito.siloPages.map(item => item.versionId), ["page-outro"], "a SiloPage do SiloDNA rejeitado sai junto");
  assert.deepEqual(desfeito.rejectedSiloIds, [REF]);
  const leitura = readFileSync("lib/server/arquiteto-workspace.ts", "utf8");
  assert.match(leitura, /releaseRejectedSiloPairs\(\{\s*siloDnas: siloDnasVigentes,/, "a leitura inteira aplica");
  assert.match(readFileSync("lib/server/arquiteto-workspace-sync.ts", "utf8"), /const paresAtivos = releaseRejectedSiloPairs\(/, "a releitura do que mudou aplica a MESMA regra");
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
// 2026-10-18 · o diálogo e o fluxo do Desfazer saíram do corpo da aba (o mesmo diálogo, testável na tela).
const dialogo = semComentarios(readFileSync("modules/arquiteto/silo-undo-dialog.tsx", "utf8"));
const linhas = semComentarios(readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8"));
const cliente = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");
const rota = semComentarios(readFileSync("lib/server/arquiteto-workspace-http.ts", "utf8"));

test("a tela usa o PATCH canônico do workspace e confere na releitura antes de anunciar", () => {
  const writer = cliente.slice(cliente.indexOf("export async function undoRemoteSiloCandidate"));
  assert.match(writer.slice(0, 2000), /fetch\("\/api\/arquiteto\/workspace"[\s\S]*method: "PATCH"[\s\S]*: \[\{ territoryRef: input\.territoryRef, expectedLock: input\.expectedLock \}\]/);
  // 2026-10-18 · o Silo inteiro leva a prévia (decisionHash) e o nome digitado, no MESMO PATCH.
  assert.match(writer.slice(0, 2000), /decisionHash: input\.confirmation\.decisionHash, typedName: input\.confirmation\.typedName/);
  assert.match(writer.slice(0, 2000), /lifecycleStatus !== "rejected"/);
  const previa = cliente.slice(cliente.indexOf("export async function previewRemoteSiloUndo"));
  assert.match(previa.slice(0, 1200), /method: "PATCH"[\s\S]*territoryUndos: \[\{ territoryRef: input\.territoryRef, expectedLock: input\.expectedLock, mode: "preview" \}\]/);
  const handler = dialogo.slice(dialogo.indexOf("export async function runSiloUndo"));
  assert.match(handler.slice(0, 4000), /await undo\(\{ brandId: input\.brandId, territoryRef: alvo\.ref, expectedLock: alvo\.expectedLock, confirmation: alvo\.confirmation \?\? null \}\)/);
  assert.match(handler.slice(0, 4000), /canonical = await reload\(input\.brandId\)[\s\S]*resolveTerritoryUndoOutcome/);
  // Só o que a releitura confirmou vira sucesso.
  assert.match(handler.slice(0, 4000), /if \(veredito\.outcome === "applied"\) \{\s*desfeitos\.push/);
  assert.match(workspace, /onDone=\{concludeSiloUndo\}/);
  assert.match(workspace, /<SiloUndoDialog/);
});

test("botão por Silo sugerido, botão em lote e uma confirmação que diz o que acontece", () => {
  assert.match(linhas, /header\.kind === "territory" && undoControls\?\.byRef\.has\(header\.ref\)/);
  assert.match(linhas, />\s*Desfazer Silo\s*</);
  assert.match(linhas, /`Desfazer os Silos sugeridos \(\$\{undoAll\.count\}\)`/);
  // 2026-10-18 · SUBSTITUÍDO "Silo publicado não aparece no Desfazer": ele aparece e sai inteiro (o site não muda).
  assert.doesNotMatch(workspace, /if \(territoryHasPublishedAddress\(territory\)\) continue;/);
  assert.match(workspace, /territory\.lifecycleStatus !== "consolidated"\) continue;/);
  // 2026-10-14: o lote marca que é lote (a confirmação diz quantos ficaram de fora — o Silo do plano — e por quê).
  assert.match(workspace, /onUndoAll: \(\) => \{ setSiloUndoBulk\(true\); setSiloUndoPrompt\(siloUndoEligibleRefs\); \}/);
  assert.match(workspace, /excludedNote: siloUndoExcludedNote,/);
  assert.match(dialogo, /O Silo sai da aba Silos \(fica guardado como rejeitado; nada é apagado\)\. As keywords dele voltam para “sem Silo” e continuam na mesa\./);
  assert.match(dialogo, /Não pode ser desfeito: \$\{leitura\.refusals\.join\(" "\)\}/);
  // 2026-10-18 · o Silo inteiro: prévia do servidor, o nome digitado e um por vez (nunca pelo lote).
  assert.match(dialogo, /typedConfirmationMatches\(digitado, silo\.confirmationName\)/);
  assert.match(dialogo, /disabled=\{busy \|\| !nomeConfere\}/);
  assert.match(dialogo, /const inteiro = !bulk && itens\.length === 1/);
});

test("o diálogo fica aberto com o andamento, fecha com Esc e abre com o foco no Cancelar", () => {
  const handler = dialogo.slice(dialogo.indexOf("export async function runSiloUndo"));
  const corpo = handler.slice(0, handler.indexOf("\n}\n"));
  // O diálogo só fecha no fim (finally), depois da releitura; durante o lote diz "Desfazendo i de N…".
  assert.match(corpo, /input\.onProgress\?\.\(\{ done: indice \+ 1, total: input\.targets\.length \}\)/);
  const confirmar = dialogo.slice(dialogo.indexOf("const confirmar = async"));
  assert.ok(confirmar.indexOf("onClose()") > confirmar.indexOf("finally"), "o diálogo fecha só no finally");
  assert.match(dialogo, /`Desfazendo \$\{progress\.done\} de \$\{progress\.total\}…/);
  assert.match(dialogo, /event\.key === "Escape" && !busy\) onClose\(\)/);
  assert.match(dialogo, /cancelRef\.current\?\.focus\(\)/);
  assert.match(dialogo, /ref=\{cancelRef\} disabled=\{busy\}/);
  // Pela metade sem keyword restante: a frase diz o que falta, não "0 keyword(s)".
  assert.match(corpo, /falta marcar o Silo como desfeito/);
});

test("a rota: plano antes da escrita, keywords pelo writer da decisão de Silo, território por último", () => {
  const bloco = rota.slice(rota.indexOf("for (const undo of parsed.territoryUndos || [])"));
  const plano = bloco.indexOf("planTerritoryUndoForBrand(context, undo.territoryRef, undo.expectedLock)");
  const keywords = bloco.indexOf("updated.push(await applyKeywordUpdate(update, undoKeywordById))");
  const territorio = bloco.indexOf("updateTerritoryWorkflowItem(context, undo.territoryRef, undo.expectedLock, plano.territoryDraft)");
  assert.ok(plano >= 0 && keywords > plano && territorio > keywords, "ordem: plano → keywords → território");
  // 2026-10-18 · Silo inteiro: confirmação → eventos (artigos e par) → keywords → grupo → território → releitura.
  const confirmado = bloco.indexOf("await assertWholeSiloUndoConfirmed(plano, undo, escrita)");
  const eventos = bloco.indexOf("await writeWholeSiloUndoRejections(context, undo.territoryRef, plano, escrita)");
  const grupo = bloco.indexOf("await unlinkWholeSiloGroup(context, plano)");
  const releitura = bloco.indexOf("readBackWholeSiloUndo(context, undo.territoryRef, plano, eventos)");
  assert.ok(confirmado > plano && eventos > confirmado && keywords > eventos && grupo > keywords && territorio > grupo && releitura > territorio, "ordem do Silo inteiro");
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
