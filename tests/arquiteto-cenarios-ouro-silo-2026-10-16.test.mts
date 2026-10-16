import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { manualSiloCandidateDraft } from "../lib/arquiteto/silo-assignment.ts";
import { ATOR, AZUL, LINHAS_AZUL, MARCA_WIFI, PLANO_AZUL, SILO_ID_VELHO, TERRITORIO_AZUL } from "./arquiteto-cenarios-ouro-fixtures.mts";

/*
 * F0 DA LINHA ÚNICA DO ARQUITETO — C4 NO SERVIDOR (2026-10-16).
 *
 * SDD `docs/compartilhado/sdd-linha-unica-do-arquiteto-2026-10-16.md` §11.1, C4:
 * "C2 concluído; o Silo desfeito por alguém → 'Recriar o Silo do plano'
 * (prévia → confirmar) → mesmo nome e slug; artigos intactos; grupo religado só
 * se o Silo antigo sumiu". O núcleo real (`previewRecreatePlanSilo` /
 * `applyRecreatePlanSilo`) roda; território, mesa, grupos e o PATCH da mesa são
 * dublês em memória, e o "ligar o grupo ao Silo" é um espião (o núcleo real
 * dele, `linkEditorialGroupSilo`, decide só no banco). WifiConecta azul: o
 * Silo do plano `territory:5e689f8c…` desfeito; 3 keywords no artigo
 * `melhor-para-jogos-online` de outro Silo; o grupo com o `silo_id` velho
 * `territory:09d9b92d…`, que não existe mais.
 *
 * Nenhuma rede, nenhum banco, nenhum custo.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => { chamadasDeRede += 1; throw new Error("Rede proibida no cenário do Silo do plano."); }) as typeof fetch;

const PLANOS = "territory:9c75c3a7-15e1-4655-b627-c08e394b4606";
const ID = (ordem: number) => `c4000000-0000-4000-8000-0000000000${String(ordem).padStart(2, "0")}`;
const NO_ARTIGO = new Set([12, 13, 14]);
type Territorio = { territoryRef: string; lockVersion: number; territory: Record<string, unknown> & { lifecycleStatus: string; name: string } };
let territorios: Territorio[] = [], linhas: Array<Record<string, any>> = [], siloDoGrupo: string | null = null, ligacoes: Array<{ groupId: string; siloId: string }> = [], patches: any[] = [];

function montar(siloId: string | null) {
  siloDoGrupo = siloId; ligacoes = []; patches = [];
  // O território no formato de sempre (o rascunho do Silo manual, com a origem do plano), desfeito ou consolidado.
  const territorio = (territoryRef: string, name: string, lifecycleStatus: string, slug: string | null): Territorio => ({ territoryRef, lockVersion: 3, territory: { ...manualSiloCandidateDraft({ name, slug }), territoryRef, brandId: MARCA_WIFI, centralEntity: name, macroIntent: "Informativa", lifecycleStatus, decisionState: lifecycleStatus === "rejected" ? "rejected" : "confirmed", reasons: ["Plano declarado no cadastro."] } as unknown as Territorio["territory"] });
  territorios = [territorio(TERRITORIO_AZUL, "Wi-Fi e fibra óptica", "rejected", "wifi-e-fibra"), territorio(PLANOS, "planos de internet", "consolidated", "planos-de-internet")];
  linhas = LINHAS_AZUL.map(linha => ({
    id: ID(linha.order), keyword: linha.keyword, brand_id: MARCA_WIFI, isPublished: false,
    territoryRef: NO_ARTIGO.has(linha.order) ? PLANOS : null,
    territoryAssignment: NO_ARTIGO.has(linha.order) ? null : { state: "unassigned", source: "human", reason: "Decisão humana: Silo sugerido desfeito; a keyword volta para sem Silo.", decidedAt: "2026-10-14T03:09:13.355Z" },
    articleFormationRef: null,
    canonicalWorkflow: { id: `wf-${ID(linha.order)}`, lockVersion: 2, payload: {} },
  }));
}
const artigoDosJogos = { entityId: "9df07c7b-16ae-414e-aadc-9f460c5f537b", versionId: "9df07c7b:v1", versionNumber: 1, payload: { articleId: "9df07c7b-16ae-414e-aadc-9f460c5f537b", suggestedSlug: "melhor-para-jogos-online", keywordReferences: [12, 13, 14].map(ordem => ({ keywordId: ID(ordem), role: ordem === 13 ? "principal" : "secundaria" })) } };

mock.module("../lib/server/arquiteto-territory-store.ts", { namedExports: {
  listTerritoryWorkflowItems: async () => structuredClone(territorios),
  updateTerritoryWorkflowItem: async (_c: unknown, territoryRef: string, lockVersion: number, draft: Record<string, unknown>) => {
    const atual = territorios.find(item => item.territoryRef === territoryRef)!;
    assert.equal(atual.lockVersion, lockVersion, "trava otimista do território");
    atual.territory = { ...structuredClone(draft), territoryRef } as unknown as Territorio["territory"];
    atual.lockVersion += 1;
    return structuredClone(atual);
  },
  createTerritoryWorkflowItem: async () => { throw new Error("recriar nunca cria um segundo Silo"); },
} });
mock.module("../lib/arquiteto/canonical-workspace.ts", { namedExports: { buildCanonicalWorkflowWorkspaceItems: (_w: unknown, keywords: unknown) => keywords } });
mock.module("../lib/server/arquiteto-workspace.ts", { namedExports: { loadCanonicalArquitetoWorkspace: async () => ({ workflowItems: [], keywords: structuredClone(linhas), availableKeywords: linhas.map(linha => ({ id: linha.id, keyword: linha.keyword })), articleDnas: [structuredClone(artigoDosJogos)] }) } });
const gruposReais = await import("../lib/editorial/editorial-groups-store.ts");
mock.module("../lib/editorial/editorial-groups-store.ts", { namedExports: {
  ...gruposReais,
  listEditorialGroupPlans: async () => ({ ok: true, groups: [{ id: AZUL, name: "Wi-Fi e fibra óptica", color: "azul", origin: "declared_plan", status: "active", plan: { siloName: PLANO_AZUL.siloName, siloSlug: PLANO_AZUL.siloSlug, objective: PLANO_AZUL.objective, articleCount: PLANO_AZUL.articleCount }, planVersion: 4, planHash: "h", siloId: siloDoGrupo, lockVersion: 7 }] }),
  linkEditorialGroupSilo: async (_c: unknown, input: { groupId: string; siloId: string }) => { ligacoes.push({ groupId: input.groupId, siloId: input.siloId }); siloDoGrupo = input.siloId; return { ok: true, changed: true }; },
} });
const gruposDosArtigos = await import("../lib/editorial/article-groups-store.ts");
mock.module("../lib/editorial/article-groups-store.ts", { namedExports: { ...gruposDosArtigos, readKeywordGroupInfo: async (_c: unknown, _b: string, ids: readonly string[]) => ({ ok: true, info: new Map(ids.map(id => [id, { groupId: AZUL }])) }) } });
mock.module("../lib/server/arquiteto-declared-plan-silo.ts", { namedExports: {
  canApprove: async () => true,
  patchViaMesa: async (_c: unknown, body: { updates: Array<{ workflowItemId: string; expectedLock: number; assignment: Record<string, unknown> }> }) => {
    patches.push(structuredClone(body));
    for (const update of body.updates) { const linha = linhas.find(item => item.canonicalWorkflow.id === update.workflowItemId)!; assert.equal(update.expectedLock, linha.canonicalWorkflow.lockVersion); Object.assign(linha, update.assignment); linha.canonicalWorkflow.lockVersion += 1; }
  },
} });
const { previewRecreatePlanSilo, applyRecreatePlanSilo } = await import("../lib/server/arquiteto-plan-silo-recreate.ts");
const contexto = { brandId: MARCA_WIFI, actorUserId: ATOR, module: "arquiteto", action: "approve", supabase: {} } as never;

test("C4 · servidor · 'Recriar o Silo do plano' (prévia → confirmar): o MESMO Silo (nome e slug do plano) volta confirmado; as 4 sem artigo entram; os 3 do artigo ficam; nada é criado nem apagado; grupo sem silo_id é religado", async () => {
  montar(null);
  const previa = await previewRecreatePlanSilo(contexto, AZUL);
  assert.equal(previa.territoryRef, TERRITORIO_AZUL);
  assert.equal(previa.territoryState, "rejected");
  assert.equal(previa.siloName, "Wi-Fi e fibra óptica");
  assert.deepEqual(previa.counts, { enters: 4, already: 0, stays: 3, notReceived: 0 });
  assert.equal(patches.length, 0, "a prévia não grava");
  await assert.rejects(() => applyRecreatePlanSilo(contexto, { groupId: AZUL, decisionHash: "0".repeat(64) }), /mudaram desde a prévia/, "hash velho: nada gravado");
  const feito = await applyRecreatePlanSilo(contexto, { groupId: AZUL, decisionHash: previa.decisionHash }, { now: () => "2026-10-16T12:00:00.000Z" });
  assert.equal(feito.confirmed, true);
  assert.equal(feito.readbackConfirmed, true, `${feito.message} ${JSON.stringify(feito.notEntered)}`);
  const silo = territorios.find(item => item.territoryRef === TERRITORIO_AZUL)!;
  assert.equal(silo.territory.name, "Wi-Fi e fibra óptica", "mesmo nome");
  assert.deepEqual((silo.territory.slugState as { proposals: Array<{ slug: string }> }).proposals.map(item => item.slug), ["wifi-e-fibra"], "mesmo slug");
  assert.equal(territorios.length, 2, "nenhum Silo novo");
  assert.deepEqual(feito.entered.sort(), [9, 10, 11, 15].map(ID).sort());
  for (const ordem of NO_ARTIGO) assert.equal(linhas.find(linha => linha.id === ID(ordem))!.territoryRef, PLANOS, "keyword em artigo aprovado não é mexida");
  assert.deepEqual(ligacoes, [{ groupId: AZUL, siloId: TERRITORIO_AZUL }], "grupo sem silo_id: ligado ao Silo do plano");
  assert.equal(chamadasDeRede, 0);
});

test("C4 · servidor · grupo ligado ao MESMO Silo do plano: recriar não religa (nada a mudar)", async () => {
  montar(TERRITORIO_AZUL);
  const previa = await previewRecreatePlanSilo(contexto, AZUL);
  await applyRecreatePlanSilo(contexto, { groupId: AZUL, decisionHash: previa.decisionHash });
  assert.deepEqual(ligacoes, []);
});

test("C4 · servidor · grupo com o silo_id VELHO (o Silo antigo sumiu): recriar religa o grupo ao Silo do plano", { todo: "vermelho até a F6 (Silo: um gravador do par): applyRecreatePlanSilo só liga o grupo quando `silo_id` é nulo (`if (!lido.grupo.siloId)`); com o silo_id velho de um Silo que não existe mais (o caso real do azul, territory:09d9b92d…) nada é religado. `linkEditorialGroupSilo` já religa quando o antigo sumiu (15/10), mas a recriação não o chama." }, async () => {
  montar(SILO_ID_VELHO);
  const previa = await previewRecreatePlanSilo(contexto, AZUL);
  assert.equal(previa.territoryRef, TERRITORIO_AZUL, "o Silo do plano é achado pelo nome, apesar do silo_id velho");
  await applyRecreatePlanSilo(contexto, { groupId: AZUL, decisionHash: previa.decisionHash });
  assert.deepEqual(ligacoes, [{ groupId: AZUL, siloId: TERRITORIO_AZUL }]);
});

test("C4 · o 'Silo antigo sumiu' é decidido no banco: território, SiloDNA ou SiloPage da marca = existe; nada = sumiu (editorialGroupSiloStillExists)", async () => {
  const { editorialGroupSiloStillExists } = gruposReais;
  const tabelas: Record<string, Array<Record<string, unknown>>> = {
    editorial_workflow_items: [{ id: "t1", marca_id: MARCA_WIFI, subject_type: "territory", subject_id: TERRITORIO_AZUL }],
    editorial_artifact_versions: [],
  };
  const cliente = { from: (tabela: string) => {
    const filtros: Array<[string, "eq" | "in", unknown]> = [];
    const consulta = {
      select: () => consulta, eq: (c: string, v: unknown) => { filtros.push([c, "eq", v]); return consulta; }, in: (c: string, v: unknown[]) => { filtros.push([c, "in", v]); return consulta; },
      limit: async () => ({ data: (tabelas[tabela] ?? []).filter(linha => filtros.every(([c, tipo, v]) => tipo === "eq" ? linha[c] === v : (v as unknown[]).includes(linha[c]))), error: null }),
    };
    return consulta;
  } };
  assert.equal(await editorialGroupSiloStillExists(cliente as never, MARCA_WIFI, TERRITORIO_AZUL), true, "o Silo real existe: não se troca");
  assert.equal(await editorialGroupSiloStillExists(cliente as never, MARCA_WIFI, SILO_ID_VELHO), false, "o silo_id velho do azul: sumiu");
});
