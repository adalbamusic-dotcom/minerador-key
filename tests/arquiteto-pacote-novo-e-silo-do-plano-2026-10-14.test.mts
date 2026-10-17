import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMineradorArquitetoHandoffPlan, mergeRefreshedHandoffPayload, type MineradorKeywordHandoffSource } from "../lib/arquiteto/minerador-handoff.ts";
import {
  ARQUITETO_IMPORT_REFRESH_LABEL,
  applyArquitetoImportGate,
  arquitetoImportLineLabel,
  classifyArquitetoImportPool,
  hasNewerMineradorPackage,
  isArquitetoImportable,
  mineradorPackageUpdatesOf,
  selectArquitetoImportColor,
  summarizeArquitetoImportColors,
  type ArquitetoImportPoolRow,
} from "../lib/arquiteto/minerador-import.ts";
import { applyApproveAndSend, previewApproveAndSend, type ApproveAndSendDeps } from "../lib/minerador/approve-and-send-core.ts";
import { applyApproval, approvedPackageDiverged } from "../lib/minerador/approved-package.ts";
import { buildPlanSheetRows } from "../lib/arquiteto/plan-article-sheet.ts";
import { choosePlanSiloTerritory, declaredPlanSiloGroupFor, declaredPlanViewOfTerritory, planRecreatePlanSiloLines } from "../lib/arquiteto/declared-plan-silo.ts";
import { territoryUndoRefusals } from "../lib/arquiteto/territory-undo.ts";
import { architectureConfirmBlocker, classifyProposalAssignment, nothingToConfirmMessage, proposalAssignmentStatusLabel } from "../lib/arquiteto/proposal-confirmability.ts";
import { humanizeOperationMessage, improvementPreviousRunLabel, improvementRunIsPrevious } from "../lib/arquiteto/article-improvement-next-step.ts";
import { AZUL, AZUL_PLANO, GRUPOS, MARCA_WIFI, cadastro, grupoDaKeyword, linha } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { VOLUME_VALIDADO } from "./arquiteto-assunto-fixtures.mts";

/*
 * BUG REAL (2026-10-14) · WifiConecta, grupo azul "Wi-Fi e fibra óptica",
 * plano declarado, 7 artigos. Lido por SELECT em 2026-10-14:
 *  - as 7 keywords `aprovado` no Minerador, com Assunto e plano, aprovadas às
 *    02:57Z; os itens do Arquiteto com `approvedDna` das 00:44Z, sem
 *    `keyword_subject` e com outro `contentHash` — a cópia velha;
 *  - o Silo do plano ("Wi-Fi e fibra óptica", `manual_strategic`, nota "Plano
 *    declarado no cadastro…") desfeito pelo lote "Desfazer os Silos
 *    sugeridos" junto com "internet barata residencial";
 *  - 3 keywords (jogos, streaming, home office) num ArticleDNA aprovado do
 *    Silo "planos de internet"; 4 sem Silo ("desfeito"/"manter sem silo");
 *  - "Confirmar propostas novas" dizia "Nada a confirmar" com a tabela
 *    mostrando "Aguardando confirmação".
 * Fixtures no formato real; sem banco, sem rede, sem custo.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n")
  .filter(linhaDeCodigo => !linhaDeCodigo.trimStart().startsWith("//"))
  .join("\n");
const ler = (caminho: string) => semComentarios(readFileSync(caminho, "utf8"));

/* ------------------------------------------------------------------ 1 */

/** A mesa como estava: os 7 itens com o pacote VELHO (sem Assunto nem plano). */
function mesaComPacoteVelho() {
  return AZUL_PLANO.map(([id, keyword, titulo, order, role, comVolume]) => {
    const novo = cadastro(id, keyword, titulo, order, role, AZUL, comVolume ? VOLUME_VALIDADO : {});
    const atual = linha(id, keyword, novo, comVolume ? { volume_search: 320, volume_source: "google_ads" } : {}) as Record<string, unknown> & { id: string };
    const workflow = atual.canonicalWorkflow as { payload: Record<string, unknown> };
    const pacoteNovo = workflow.payload.approvedDna as Record<string, unknown>;
    const pacoteVelho = { ...pacoteNovo, analiseSemantica: comVolume ? VOLUME_VALIDADO : {}, approvedAt: "2026-10-14T00:44:36.135Z", contentHash: `sha256:velho-${id}` };
    return {
      ...atual,
      territoryRef: null,
      canonicalWorkflow: { ...workflow, payload: {
        ...workflow.payload,
        approvedDna: pacoteVelho,
        manualEdit: true,
        territoryRef: null,
        territoryAssignment: { state: "unassigned", source: "human", reason: "Decisão humana: Silo sugerido desfeito; a keyword volta para sem Silo.", decidedAt: "2026-10-14T03:09:13.355Z" },
      } },
      pacoteNovo,
    };
  });
}

const planilha = (keywords: Array<Record<string, unknown>>) => buildPlanSheetRows({
  brandId: MARCA_WIFI,
  keywords,
  groupOf: id => GRUPOS[id] ?? null,
  keywordGroupOf: grupoDaKeyword,
  articles: [],
  radarArticleIds: new Set(),
  serp: null,
  filter: { kind: "groups", color: "azul", groupIds: [AZUL] },
  now: new Date("2026-10-14T12:00:00Z"),
});

test("causa 1 confirmada: com o pacote velho no item, o Arquiteto não sabe que as 7 são do plano — a planilha 'Artigos do plano' fica vazia", () => {
  const velha = mesaComPacoteVelho().map(({ pacoteNovo: _p, ...row }) => { void _p; return row; });
  assert.equal(planilha(velha).length, 0);
});

test("a atualização troca SÓ o transporte: Silo, decisão humana e edição do Arquiteto ficam; o pacote anterior vira referência; a planilha passa a ter 7 linhas", () => {
  const mesa = mesaComPacoteVelho();
  const atualizada = mesa.map(({ pacoteNovo, ...row }) => {
    const workflow = row.canonicalWorkflow as { payload: Record<string, unknown> };
    const payload = mergeRefreshedHandoffPayload(workflow.payload, { brandId: MARCA_WIFI, keywordId: String(row.id), source: "MINERADOR", decision: "aprovado", state: "received", semanticQualification: null, approvedDna: pacoteNovo as never }, "2026-10-14T13:00:00.000Z");
    assert.equal(payload.manualEdit, true, "edição do Arquiteto preservada");
    assert.deepEqual(payload.territoryAssignment, workflow.payload.territoryAssignment, "decisão de Silo preservada");
    assert.deepEqual(payload.previousApprovedDna, { contentHash: `sha256:velho-${row.id}`, approvedAt: "2026-10-14T00:44:36.135Z", version: 1 });
    assert.equal(payload.approvedDnaRefreshedAt, "2026-10-14T13:00:00.000Z");
    return { ...row, canonicalWorkflow: { ...workflow, payload } };
  });
  const linhas = planilha(atualizada);
  assert.equal(linhas.length, 7);
  assert.deepEqual(linhas.map(item => item.order), [9, 10, 11, 12, 13, 14, 15]);
});

test("o envio (handoff) do item já recebido com pacote novo vira atualização com o payload anterior e a trava lida", () => {
  const novo = { schemaVersion: "v1", keywordId: "kw-1", brandId: MARCA_WIFI, keyword: "internet fibra óptica", intent: null, volumeSearch: 320, resultsAllintitle: null, kgrScore: null, listaId: null,
    analiseSemantica: cadastro("kw-1", "internet fibra óptica", "Internet fibra óptica", 9, "Pilar"), approvedAt: "2026-10-14T02:57:52.587Z", approvedBy: "u1", version: 2, contentHash: "sha256:novo" };
  const fonte: MineradorKeywordHandoffSource = { id: "kw-1", brandId: MARCA_WIFI, status: "aprovado", approvedDna: novo as never };
  const anterior = { brandId: MARCA_WIFI, keywordId: "kw-1", source: "MINERADOR", state: "received", approvedDna: { contentHash: "sha256:velho", approvedAt: "2026-10-14T00:44:36.135Z", version: 1 },
    territoryRef: "territory:x", articleFormationRef: "article-formation:f1", articleSubjectAnchor: { candidateRef: "c1" }, manualEdit: true };
  const plano = buildMineradorArquitetoHandoffPlan({
    brandId: MARCA_WIFI,
    keywords: [fonte],
    existingKeywordIds: new Set(["kw-1"]),
    receivedApprovedHashById: new Map([["kw-1", "sha256:velho"]]),
    receivedItemById: new Map([["kw-1", { payload: anterior, lockVersion: 3 }]]),
    refreshedAt: "2026-10-14T13:00:00.000Z",
  });
  assert.deepEqual(plano.refreshedKeywordIds, ["kw-1"]);
  assert.equal(plano.rows.length, 0, "não cria item novo");
  const [atualizacao] = plano.updates;
  assert.equal(atualizacao.expectedLock, 3);
  assert.equal((atualizacao.payload.approvedDna as { contentHash: string }).contentHash, "sha256:novo");
  for (const chave of ["territoryRef", "articleFormationRef", "articleSubjectAnchor", "manualEdit"]) assert.deepEqual(atualizacao.payload[chave], anterior[chave as keyof typeof anterior], `${chave} preservado`);
  // Mesmo hash: nada a atualizar.
  const igual = buildMineradorArquitetoHandoffPlan({ brandId: MARCA_WIFI, keywords: [fonte], existingKeywordIds: new Set(["kw-1"]), receivedApprovedHashById: new Map([["kw-1", "sha256:novo"]]) });
  assert.equal(igual.updates.length, 0);
});

test("no servidor: a gravação usa o payload mesclado, a trava do item e confere a linha; a prévia diz quem atualiza", () => {
  const servidor = ler("lib/server/arquiteto-workspace.ts");
  assert.match(servidor, /receivedItemById: new Map\(\[\.\.\.workflowByKeywordId\.entries\(\)\]/);
  assert.match(servidor, /if \(update\.expectedLock !== null\) query = query\.eq\("lock_version", update\.expectedLock\);/);
  assert.match(servidor, /nada foi sobrescrito nele\. Tente de novo\./);
  assert.match(servidor, /refreshKeywordIds: prepared\.plan\.refreshedKeywordIds/);
  assert.match(servidor, /refreshedKeywordIds: prepared\.plan\.refreshedKeywordIds,/);
  // O MCP send_keywords_to_arquiteto é o MESMO núcleo (createMineradorArquitetoHandoff): a atualização vale lá também.
  assert.match(ler("lib/server/platform-mcp-tools.ts"), /createMineradorArquitetoHandoff\(context, keywordIds\)/);
});

test("'Aprovar e enviar' e o import: a linha já no Arquiteto com pacote novo diz 'atualiza no Arquiteto' e o resultado avisa", async () => {
  const linhas = [{ id: "k9", keyword: "internet fibra óptica", status: "aprovado", analise_semantica: {} }, { id: "k1", keyword: "igual", status: "aprovado", analise_semantica: {} }];
  const enviados: string[][] = [];
  const deps: ApproveAndSendDeps<typeof linhas[number], { id: string; currentStatus: string; outcome: "unchanged"; blockers: string[]; readiness: null }> = {
    readRows: async ids => ({ rows: linhas.filter(item => ids.includes(item.id)), missingIds: [] }),
    entries: rows => rows.map(row => ({ id: row.id, currentStatus: "aprovado", outcome: "unchanged" as const, blockers: [], readiness: null })),
    approve: async () => { throw new Error("não aprova"); },
    previewSend: async ids => ({ eligibleKeywordIds: [...ids], existingKeywordIds: [...ids], refreshKeywordIds: ["k9"], refused: [] }),
    send: async ids => { enviados.push([...ids]); return { importedKeywordIds: ids, refreshedKeywordIds: ["k9"] }; },
    hash: value => JSON.stringify(value).length.toString(16).padStart(64, "0"),
  };
  const previa = await previewApproveAndSend({ brandId: MARCA_WIFI, actorId: "u1", keywordIds: ["k9", "k1"], send: true }, deps);
  assert.equal(previa.lines.find(line => line.id === "k9")?.refreshInArquiteto, true);
  assert.equal(previa.lines.find(line => line.id === "k1")?.refreshInArquiteto, undefined);
  const resultado = await applyApproveAndSend({ brandId: MARCA_WIFI, actorId: "u1", keywordIds: ["k9", "k1"], send: true, decisionHash: previa.decisionHash }, deps);
  assert.deepEqual(enviados, [["k9", "k1"]]);
  assert.match(resultado.notices.join(" "), /1 keyword\(s\) que já estavam no Arquiteto receberam o pacote aprovado novo/);
  assert.match(resultado.notices.join(" "), /artigo já formado não foi reescrito/);
  const dialogo = ler("modules/minerador/approve-and-send-dialog.tsx");
  assert.match(dialogo, /atualiza no Arquiteto \(pacote novo; as decisões do Arquiteto ficam\)/);
});

test("'Importar do Minerador': as 7 do azul deixam de ser 'já no Arquiteto' e viram 'atualiza no Arquiteto (pacote novo)', marcáveis pela cor", () => {
  const keywords: ArquitetoImportPoolRow[] = AZUL_PLANO.map(([id, keyword]) => ({ id, keyword, status: "aprovado", group_id: AZUL, approval_hash: `sha256:novo-${id}` }));
  keywords.push({ id: "igual", keyword: "já igual", status: "aprovado", group_id: AZUL, approval_hash: "sha256:mesmo" });
  keywords.push({ id: "revisao", keyword: "em revisão", status: "em_revisao", group_id: AZUL, approval_hash: "sha256:outro" });
  const estados = new Map(keywords.map(item => [item.id, "received"] as const));
  const recebidos = new Map(keywords.map(item => [item.id, item.id === "igual" ? "sha256:mesmo" : `sha256:velho-${item.id}`] as const));
  const pool = classifyArquitetoImportPool({ keywords, workflowStateByKeywordId: estados, incorporatedKeywordIds: new Set(["k12"]), receivedPackageHashByKeywordId: recebidos });
  assert.deepEqual(pool.refreshCandidateIds.sort(), AZUL_PLANO.map(([id]) => id).sort(), "só as aprovadas com hash diferente (inclusive a que está em artigo)");
  // O portão aceita seis; recusa k15 (aprovação incompleta para o envio).
  const linhasDoPortao = pool.gateIds.map(id => id === "k15"
    ? { id, action: "blocked" as const, missing: [], reasons: ["A aprovação está incompleta para o envio ao Arquiteto."], alreadyInArquiteto: true, refreshInArquiteto: false }
    : { id, action: "send_only" as const, missing: [], reasons: [], alreadyInArquiteto: true, refreshInArquiteto: true });
  const itens = applyArquitetoImportGate(pool.items, pool.gateIds, linhasDoPortao, pool.refreshCandidateIds);
  const porId = new Map(itens.map(item => [item.id, item]));
  assert.equal(porId.get("k9")?.state, "refresh");
  assert.equal(arquitetoImportLineLabel(porId.get("k9")!), ARQUITETO_IMPORT_REFRESH_LABEL);
  assert.equal(isArquitetoImportable(porId.get("k9")!), true);
  assert.equal(porId.get("k15")?.state, "in_arquiteto", "o portão recusou: continua com o pacote que já tem");
  assert.match(String(porId.get("k15")?.detail), /pacote aprovado mais novo no Minerador, mas ele não pode vir agora/);
  assert.equal(porId.get("igual")?.state, "in_arquiteto");
  assert.equal(porId.get("revisao")?.state, "in_arquiteto");
  const corDo = (groupId: string | null) => groupId === AZUL ? "azul" as const : null;
  const escolha = selectArquitetoImportColor(itens, "azul", corDo);
  assert.equal(escolha.refresh, 6);
  assert.equal(escolha.importIds.length, 6);
  assert.equal(summarizeArquitetoImportColors(itens, corDo).find(item => item.color === "azul")?.refresh, 6);
  assert.equal(hasNewerMineradorPackage({ status: "publicado", approvalHash: "a", receivedHash: null }), true);
  assert.equal(hasNewerMineradorPackage({ status: "aprovado", approvalHash: null, receivedHash: "b" }), false);
});

test("aviso 'Pacote novo no Minerador · N keywords' na mesa, sem reenviar; some depois da atualização; keyword mexida depois da aprovação não entra", async () => {
  const base = { id: "k9", keyword: "internet fibra óptica", brand_id: MARCA_WIFI, status: "aprovado", intent: null, volume_search: 320, results_allintitle: null, kgr_score: null, lista_id: null };
  const semantic = await applyApproval({ keywordId: "k9", brandId: MARCA_WIFI, keyword: base.keyword, intent: null, volumeSearch: 320, resultsAllintitle: null, kgrScore: null, listaId: null,
    semantic: cadastro("k9", base.keyword, "Internet fibra óptica", 9, "Pilar"), approvedAt: "2026-10-14T02:57:52.587Z", approvedBy: "u1" });
  const hashNovo = (semantic.aprovacao as { contentHash: string }).contentHash;
  const linhaDaMesa = (recebido: string) => ({ ...base, analise_semantica: semantic, canonicalWorkflow: { state: "received", payload: { approvedDna: { contentHash: recebido } } } });
  assert.deepEqual(mineradorPackageUpdatesOf([linhaDaMesa("sha256:velho"), linhaDaMesa("sha256:velho")]), [{ keywordId: "k9", keyword: "internet fibra óptica" }], "uma vez por keyword");
  assert.deepEqual(mineradorPackageUpdatesOf([linhaDaMesa(hashNovo)]), [], "depois da atualização, nada");
  const mexida = { ...linhaDaMesa("sha256:velho"), analise_semantica: { ...semantic, keyword_subject_note_extra: "editado depois" } };
  assert.equal(approvedPackageDiverged({ keywordId: "k9", brandId: MARCA_WIFI, keyword: base.keyword, volumeSearch: 320, semantic: mexida.analise_semantica }), true);
  assert.deepEqual(mineradorPackageUpdatesOf([mexida]), [], "em revisão no Minerador: não há pacote novo a trazer");
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /const mineradorPackageUpdates = useMemo\(\(\) => mineradorPackageUpdatesOf\(masterList/);
  assert.match(tela, /onClick=\{\(\) => \{ setKeywordImportPreselect\("refresh"\); setKeywordImportOpen\(true\); \}\}/);
  assert.match(tela, /Atualizar do Minerador/);
  const dialogo = ler("modules/arquiteto/minerador-import-dialog.tsx");
  assert.match(dialogo, /const atualizam = pool\.items\.filter\(item => item\.state === "refresh"\)\.map\(item => item\.id\);/);
  assert.match(dialogo, /if \(atualizam\.length\) void openConfirmation\(\{ kind: "selection" \}, atualizam\);/, "o MESMO núcleo do importar, com prévia");
  assert.match(dialogo, /secao\("Atualizam no Arquiteto \(pacote novo\)"/);
});

/* ------------------------------------------------------------------ 2 */

const PLANOS = [{ groupId: AZUL, groupLabel: "Azul (Wi-Fi e fibra óptica)", siloName: "Wi-Fi e fibra óptica", siloSlug: null, linkedTerritoryRef: null }];
const slug = (texto: string) => texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SILO_DO_PLANO = {
  territoryRef: "territory:09d9b92d-db4d-4409-88c7-bd7ca5e77c7e",
  lifecycleStatus: "confirmed",
  name: "Wi-Fi e fibra óptica",
  reasons: ["Silo do plano declarado: Wi-Fi e fibra óptica."],
  provenance: { note: "Plano declarado no cadastro: grupo Azul (Wi-Fi e fibra óptica), plano v1, por d67ebbad em 2026-10-14." as string | null },
  slugState: { publishedSlug: null, confirmed: null, proposals: [] },
};
const SILO_SUGERIDO = { ...SILO_DO_PLANO, territoryRef: "territory:70824f80-38d5-4bc4-a626-a659eed63f75", name: "internet barata residencial", reasons: ["Silo candidato criado manualmente: internet barata residencial."], provenance: { note: null } };

test("2a · o Silo do plano declarado NÃO entra em 'Desfazer os Silos sugeridos'; o sugerido entra", () => {
  const doPlano = declaredPlanSiloGroupFor(declaredPlanViewOfTerritory(SILO_DO_PLANO), PLANOS, slug);
  assert.deepEqual(doPlano, { groupId: AZUL, groupLabel: "Azul (Wi-Fi e fibra óptica)", siloName: "Wi-Fi e fibra óptica" });
  assert.equal(declaredPlanSiloGroupFor(declaredPlanViewOfTerritory(SILO_SUGERIDO), PLANOS, slug), null);
  // Planos ainda não lidos: a marca do plano basta (lado seguro).
  assert.ok(declaredPlanSiloGroupFor(declaredPlanViewOfTerritory(SILO_DO_PLANO), null, slug));
  // Plano limpo (F7): o Silo deixa de ser "do plano".
  assert.equal(declaredPlanSiloGroupFor(declaredPlanViewOfTerritory(SILO_DO_PLANO), [], slug), null);
  const base = { members: [], approvedArticles: [], siloArtifacts: [] };
  const territorio = (t: typeof SILO_DO_PLANO) => ({ territoryRef: t.territoryRef, name: t.name, centralEntity: t.name, lifecycleStatus: "confirmed" as const, publicationProtection: "unpublished" as const, slugState: { publishedSlug: null, publishedCanonical: null, confirmed: null, proposals: [] } as never, existingSiloRef: null, consolidation: null as never });
  const recusas = territoryUndoRefusals({ ...base, territory: territorio(SILO_DO_PLANO), declaredPlan: doPlano });
  assert.deepEqual(recusas.map(item => item.code), ["DECLARED_PLAN_SILO"]);
  assert.match(recusas[0].message, /Tirar do plano.*Substituir o plano.*Minerador/);
  assert.deepEqual(territoryUndoRefusals({ ...base, territory: territorio(SILO_SUGERIDO), declaredPlan: null }), []);
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /territoryUndoRefusals\(\{ territory, members: membros, approvedArticles: aprovados, siloArtifacts: artefatos, declaredPlan: doPlano \}\)/);
  // 2026-10-16 (noite) · teste do dono: "1 fica de fora: Silo do plano…" aparecia sem o botão do lote, sobre o Silo do plano Confirmado e visível.
  // A frase diz só o que é verdade (não entra no Desfazer; segue o cadastro do Minerador) e só acompanha o botão do lote.
  assert.match(tela, /`Não entra\$\{siloUndoPlanExcluded\.length === 1 \? "" : "m"\} no Desfazer: /, "o lote diz o que não entra nele e por quê");
  assert.match(tela, /o Silo do plano segue o cadastro do Minerador \(“Tirar do plano” ou “Substituir o plano”\)/);
  assert.doesNotMatch(tela, /de fora: \$\{siloUndoPlanExcluded/);
  assert.match(ler("modules/arquiteto/territorial-workspace-rows.tsx"), /\{undoAll && undoAll\.count > 0 && undoAll\.excludedNote && \(\s*<span className="text-sm text-text-muted" data-testid="architect-undo-all-excluded">/);
});

test("2b · o Silo do plano desfeito: o envio não o duplica nem põe keyword nele; 'Recriar o Silo do plano' traz as 4 sem artigo e deixa as 3 do artigo", () => {
  const territorios = [
    { territoryRef: SILO_DO_PLANO.territoryRef, lifecycleStatus: "rejected", slugs: [null], name: "Wi-Fi e fibra óptica" },
    { territoryRef: SILO_SUGERIDO.territoryRef, lifecycleStatus: "rejected", slugs: [null], name: "internet barata residencial" },
    { territoryRef: "territory:9c75c3a7", lifecycleStatus: "consolidated", slugs: ["planos-de-internet"], name: "planos de internet" },
  ];
  assert.deepEqual(choosePlanSiloTerritory({ plan: { siloName: "Wi-Fi e fibra óptica", siloSlug: null }, linkedTerritoryRef: null, territories: territorios, slugOf: slug }),
    { kind: "rejected_by_human", territoryRef: SILO_DO_PLANO.territoryRef }, "acha pelo nome, mesmo sem slug gravado (como no banco)");
  const keyword = (keywordId: string, nome: string, extra: Record<string, unknown> = {}) => ({ keywordId, keyword: nome, received: true, territoryRef: null as string | null, territoryLabel: null as string | null, isPublished: false, articleLabel: null as string | null, previousDecision: null as string | null, ...extra });
  const linhas = planRecreatePlanSiloLines({ territoryRef: SILO_DO_PLANO.territoryRef, keywords: [
    keyword("c66d", "internet fibra óptica", { previousDecision: "Silo sugerido desfeito; a keyword volta para sem Silo" }),
    keyword("ba71", "teste de velocidade da internet"),
    keyword("352b", "diferença entre internet e Wi-Fi"),
    keyword("923c", "Wi-Fi lento", { previousDecision: "manter a keyword sem silo" }),
    keyword("598e", "internet para streaming", { territoryRef: "territory:9c75c3a7", territoryLabel: "planos de internet", articleLabel: "melhor-para-jogos-online" }),
    keyword("d9a2", "melhor internet para jogos online", { territoryRef: "territory:9c75c3a7", territoryLabel: "planos de internet", articleLabel: "melhor-para-jogos-online" }),
    keyword("7dae", "internet para home office", { territoryRef: "territory:9c75c3a7", territoryLabel: "planos de internet", articleLabel: "melhor-para-jogos-online" }),
  ] });
  assert.deepEqual(linhas.filter(item => item.outcome === "enters").map(item => item.keyword), ["internet fibra óptica", "teste de velocidade da internet", "diferença entre internet e Wi-Fi", "Wi-Fi lento"]);
  const doArtigo = linhas.filter(item => item.outcome === "stays_in_article");
  assert.equal(doArtigo.length, 3, "keyword em artigo aprovado não é mexida (revisão do artigo)");
  assert.match(doArtigo[0].reason, /Retirar artigo do Silo/);
  assert.equal(linhas.length, 7, "nenhuma keyword some da prévia");

  const envio = ler("lib/server/arquiteto-declared-plan-silo.ts");
  assert.match(envio, /if \(escolha\.kind === "rejected_by_human"\) \{/);
  assert.match(envio, /territory: "rejected"/);
  const recriar = ler("lib/server/arquiteto-plan-silo-recreate.ts");
  assert.match(recriar, /if \(previa\.decisionHash !== input\.decisionHash\) throw new RecreatePlanSiloStaleError\(\);/);
  assert.match(recriar, /lifecycleStatus: "candidate",/, "limpa o desfeito só deste Silo");
  assert.match(recriar, /confirmedTerritoryDraft\(/);
  assert.match(recriar, /planSiloDecisionBatch\(/, "a decisão de Silo de sempre");
  assert.match(recriar, /await patchViaMesa\(/, "o writer da mesa");
  assert.match(recriar, /const relido = await readContext\(context, input\.groupId\);/, "desfecho pela releitura");
  assert.doesNotMatch(recriar, /\.delete\(|purge|keywords\/delete/);
  const rota = ler("app/api/arquiteto/plan-silo/recreate/route.ts");
  assert.match(rota, /resolvePipelineContext\(\{ brandId: input\.brandId, module: "arquiteto", action: "approve" \}\)/);
  // 2026-10-16 · restauração do fluxo de sempre: o aviso "Recriar o Silo do plano" volta a morar na tela (como em 99ec14f).
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /`Recriar o Silo do plano · \$\{/);
  assert.match(tela, /fetch\("\/api\/arquiteto\/plan-silo\/recreate"/);
});

test("2c · 'Confirmar propostas novas' confirma o que a tela mostra como confirmável — e a tela não mostra como confirmável o que o clique não grava", () => {
  // As 3 do artigo em "planos de internet" e as 2 sem Silo, todas propostas para o Silo do plano DESFEITO.
  const desfeito = classifyProposalAssignment({ destination: null, destinationRejected: true, currentTerritoryRef: "territory:9c75c3a7", fixed: true });
  assert.equal(desfeito, "rejected_silo");
  assert.equal(proposalAssignmentStatusLabel(desfeito, { declaredPlanSilo: true }), "Silo do plano desfeito · use “Recriar o Silo do plano”");
  assert.equal(classifyProposalAssignment({ destination: "t:a", destinationRejected: false, currentTerritoryRef: "t:b", fixed: true }), "fixed_in_article");
  assert.equal(classifyProposalAssignment({ destination: "t:a", destinationRejected: false, currentTerritoryRef: null, fixed: false }), "confirmable");
  assert.equal(classifyProposalAssignment({ destination: "t:a", destinationRejected: false, currentTerritoryRef: "t:a", fixed: false }), "confirmed");
  assert.equal(classifyProposalAssignment({ destination: null, destinationRejected: false, currentTerritoryRef: null, fixed: false }), "missing_silo");
  assert.equal(proposalAssignmentStatusLabel("confirmable"), "Aguardando confirmação");
  assert.equal(nothingToConfirmMessage({ rejected_silo: 5 }, { declaredPlanSilo: true }), "Nada a confirmar: 5 apontam para Silo desfeito (o Silo do plano: use “Recriar o Silo do plano”).");
  const tela = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /const pendentes = architectureProposal\.assignments\.filter\(item => proposalAssignmentStates\.get\(item\.keywordId\)\?\.state === "confirmable"\);/);
  // 2026-10-15 (noite) · a regra do "nada" virou `architectureConfirmBlocker` (botão desabilitado com o motivo; aviso informativo, nunca erro).
  assert.match(tela, /confirmableCount: architectureProposalPending\.pendentes,/);
  assert.equal(architectureConfirmBlocker({ confirmTerritoryCount: 0, assignmentCount: 0, confirmableCount: 3, skipped: [], counts: {} }), null, "não diz 'nada' com confirmável na tela");
  assert.match(tela, /const blocker = architectureConfirmBlocker\(\{/);
  assert.match(tela, /const buscasFixas = buscasFixasDaProposta;/, "o clique e a tabela usam a MESMA leitura das keywords fixas");
});

/* ------------------------------------------------------------------ 3 */

test("3 · a análise antiga da melhoria (outro recorte, ou anterior à mudança da mesa) fica recolhida; o código técnico vira frase humana", () => {
  const antiga = { state: "collecting", createdAt: "2026-10-14T01:33:53.827Z", leaseUntil: null, groupScope: null };
  assert.equal(improvementRunIsPrevious({ run: antiga, activeGroupRequested: null, mesaChangedAt: "2026-10-14T03:09:13.520Z" }), true, "a mesa mudou depois (recadastro e Silos)");
  assert.equal(improvementRunIsPrevious({ run: antiga, activeGroupRequested: "azul", mesaChangedAt: null }), true, "outro recorte");
  assert.equal(improvementRunIsPrevious({ run: antiga, activeGroupRequested: null, mesaChangedAt: "2026-10-14T01:00:00.000Z" }), false);
  assert.equal(improvementRunIsPrevious({ run: { ...antiga, state: "applying" }, activeGroupRequested: "azul", mesaChangedAt: "2026-10-15T00:00:00Z" }), false, "gravação aceita nunca some");
  assert.equal(improvementRunIsPrevious({ run: { state: "prepared" }, activeGroupRequested: null }), false, "sem data: como antes");
  assert.match(improvementPreviousRunLabel(antiga), /^Análise anterior de \d\d\/10,? \d\d:\d\d · marca inteira$/, "data no fuso de quem vê");
  assert.match(improvementPreviousRunLabel({ ...antiga, groupScope: { requested: "laranja" } }), / · cor laranja$/);
  const humano = humanizeOperationMessage("REWORK_SAME_REFUSAL: A mesma recusa aconteceu em 14/10/2026 01:35: nada mudou desde então.");
  assert.doesNotMatch(humano, /REWORK_SAME_REFUSAL/);
  assert.match(humano, /^Isto já foi tentado com os mesmos insumos e deu a mesma recusa; nada foi pago de novo\. A mesma recusa aconteceu em 14\/10\/2026/);
  assert.equal(humanizeOperationMessage("Etapa não confirmada."), "Etapa não confirmada.");
  assert.doesNotMatch(humanizeOperationMessage("CODIGO_DESCONHECIDO"), /CODIGO_DESCONHECIDO/);
  const painel = ler("modules/arquiteto/article-improvement-panel.tsx");
  assert.match(painel, /const run = previousRun \? null : runState;/);
  assert.match(painel, /data-testid="architect-improvement-previous"/);
  assert.match(painel, /Retomar esta análise/);
  assert.match(painel, /setError\(e instanceof Error \? humanizeOperationMessage\(e\.message\) : "Falha na execução\."\)/);
  assert.match(ler("modules/arquiteto/arquiteto-workspace.tsx"), /mesaChangedAt=\{mesaChangedAt\} \/>/);
});
