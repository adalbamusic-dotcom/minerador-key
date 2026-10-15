import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPlanSheetRows, planFlowSteps, planPrincipalSwapCandidates, planRowAlerts, planStepTwoAction, readPlanRowVolume, PLAN_FLOW_LABELS, type PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";
import { choosePlanConsolidationTerritory, planConsolidationDecisionHash, planConsolidationLines } from "../lib/arquiteto/plan-consolidation.ts";
import { articleApprovalRevalidationIssues, DECLARED_PLAN_CONSOLIDATION_ALERT_PREFIX } from "../lib/arquiteto/article-approval-revalidation.ts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import { AZUL, GRUPOS, MARCA_WIFI, cadastro, grupoDaKeyword, linha, mesaWifi } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { ARTIGO_INTRUSO, AZUL_REAL, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-14 (noite) · O REDESENHO DO DONO, depois de testar com a WifiConecta
 * azul (adendo datado na SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`):
 *
 *   1. volume do DNA é volume (botão Volume OU média da Pesquisa por Assunto
 *      com recibo; também na linha que a mesa remonta do ArticleDNA);
 *   2. a regra da principal: volume definido → fixa (mesmo 10); sem volume, a
 *      trava: travada nunca muda, livre pode procurar outra (só na linha);
 *   3. chegou do Minerador com plano = consolidar, não reformar: o ArticleDNA
 *      v1 do plano sem SERP e sem IA, com alertas, e o par do Silo;
 *   4. as etapas na mesma barra (1 → 2 → 3);
 *   5. uma tabela, poucos botões; sem "Detalhes técnicos".
 *
 * Domínio puro + estrutural (comentários limpos antes de procurar). Fixtures
 * do caso real (SELECT de 14/10). Sem rede, sem banco, sem custo.
 */

const AGORA = new Date("2026-10-14T12:00:00Z");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(new URL(caminho, import.meta.url), "utf8"));

/* ------------------------------------------------------------ 1 · volume */

test("volume do DNA é volume: Minerador (Google Ads), Pesquisa por Assunto (recibo) e a linha remontada do ArticleDNA contam como medidos; outro provider não", () => {
  const minerador = readPlanRowVolume({ volume_search: 5400, volume_source: "google_ads", analise_semantica: { volume_measurement: { provider: "google_ads", averageMonthlySearches: 5400, measuredAt: "2026-10-13T05:31:48.884Z" } } }, AGORA);
  assert.deepEqual([minerador.state, minerador.value, minerador.origin], ["measured", 5400, "google_ads"]);
  assert.equal(minerador.label, "5.400 · medido em 13/10/2026 · Google Ads");
  const pesquisa = readPlanRowVolume({ volume_search: 260, volume_source: "google_ads", analise_semantica: { volume_measurement: { provider: "google_ads", averageMonthlySearches: 260, measuredAt: "2026-10-13T05:31:48.885Z", origin: "subject_search", measurementKind: "keyword_ideas", receiptRef: { operationRequestId: "op-1" } } } }, AGORA);
  assert.deepEqual([pesquisa.state, pesquisa.value, pesquisa.origin], ["measured", 260, "subject_search"]);
  assert.equal(pesquisa.label, "260 · medido em 13/10/2026 · Pesquisa por Assunto");
  // A linha que a mesa remonta da referência do ArticleDNA: volume + evidência do Google Ads, sem volume_source nem semântica (o caso "Volume de outra fonte").
  const doDna = readPlanRowVolume({ volume_search: 10, demandEvidence: { googleAds: { source: "google_ads", averageMonthlySearches: 10, measuredAt: "2026-10-13T05:31:48.884Z" } } }, AGORA);
  assert.deepEqual([doDna.state, doDna.value, doDna.label], ["measured", 10, "10 · medido em 13/10/2026 · Google Ads"]);
  const outraEra = readPlanRowVolume({ volume_search: 900, volume_source: "real" }, AGORA);
  assert.deepEqual([outraEra.state, outraEra.label], ["missing", "Sem volume medido"], "volume de outro provider não é medição — e não se diz mais 'outra fonte'");
  const semMedia = readPlanRowVolume({ volume_search: null, volume_source: "real", analise_semantica: { volume_eligibility: { provider: "google_ads", status: "unavailable", averageMonthlySearches: null, emptyResponseKind: "returned_without_average", measuredAt: "2026-10-13T05:31:48.885Z" } } }, AGORA);
  assert.equal(semMedia.state, "no_average", "'Sem média no Google Ads' continua sem volume");
  assert.match(semMedia.label, /^Sem média no Google Ads/);
});

/* --------------------------------------------- 2 · a regra da principal */

const comTrava = (id: string, lock: "locked" | "free" | undefined, volume: number | null) => {
  const [, keyword, titulo, ordem, papel] = AZUL_REAL.find(([k]) => k === id)!;
  const semantica = cadastro(id, keyword, titulo, ordem, papel, AZUL, volume !== null ? { volume_measurement: { provider: "google_ads", averageMonthlySearches: volume, measuredAt: "2026-10-13T05:31:48.884Z" } } : {});
  if (lock) (semantica.keyword_subject as any).plan.lock = lock;
  return linha(id, keyword, semantica, volume !== null ? { volume_search: volume, volume_source: "google_ads" } : {});
};
const linhaDoPlano = (row: Record<string, unknown>) => buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: [row], groupOf: id => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeyword, articles: [], radarArticleIds: new Set(), serp: null, filter: { kind: "all" }, now: AGORA })[0];

test("a regra do dono: volume definido fixa a principal (mesmo 10, mesmo Livre à mão); sem volume, a trava decide — travada nunca muda, livre pode procurar outra", () => {
  const dez = linhaDoPlano(comTrava("k12", "free", 10));
  assert.deepEqual([dez.lock.state, dez.lock.label], ["locked", "Travada · volume definido"]);
  assert.match(dez.lock.why, /Volume definido não se troca/);
  assert.equal(planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: comTrava("k12", "free", 10), rows: [comTrava("k12", "free", 10)], currentPrincipalId: "k12", now: AGORA }).ok, false);
  const livre = linhaDoPlano(comTrava("k10", undefined, null));
  assert.equal(livre.lock.state, "free");
  assert.deepEqual(planRowAlerts(livre).map(alerta => alerta.label), ["sem volume — livre, pode trocar"]);
  const travadaSemVolume = linhaDoPlano(comTrava("k10", "locked", null));
  assert.equal(travadaSemVolume.lock.state, "locked");
  assert.deepEqual(planRowAlerts(travadaSemVolume).map(alerta => alerta.label), ["sem volume — travada"]);
  assert.equal(planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: comTrava("k10", "locked", null), rows: [comTrava("k10", "locked", null)], currentPrincipalId: "k10", now: AGORA }).ok, false, "travada nunca muda");
});

/* ------------------------------------------ 3 · consolidar, não reformar */

const sempreComIntencao = () => true;
const artigo = (id: string, extra: Partial<PlanSheetArticle> = {}): PlanSheetArticle => ({ articleId: id, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], ...extra });

test("WifiConecta (estado atual): 5 formados ficam como estão; diferença (sem volume, Livre) e Wi-Fi lento (260) gravam o v1 do plano com os alertas — nada bloqueia", () => {
  const linhas = mesaWifiReal().filter(row => String(row.id).startsWith("k"));
  const rows = new Map(linhas.map(row => [String(row.id), row]));
  const lido = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: ["k9", "k12", "k13", "k14", "k15"].map(id => artigo(id)), ownerOf: () => null, hasIntent: sempreComIntencao, territoryRef: "territory:wifi-e-fibra", now: AGORA });
  assert.deepEqual(lido.map(line => [line.order, line.action]), [[9, "keep"], [10, "write"], [11, "write"], [12, "keep"], [13, "keep"], [14, "keep"], [15, "keep"]]);
  const diferenca = lido.find(line => line.keywordId === "k10")!;
  assert.equal(diferenca.principalId, "k10", "a principal é a keyword do plano: consolidar nunca troca");
  assert.deepEqual(diferenca.alerts, ["sem volume — livre, pode trocar"]);
  const lento = lido.find(line => line.keywordId === "k11")!;
  assert.deepEqual(lento.alerts, ["SERP das principais na etapa 2 (custo antes)"]);
  assert.match(lento.sentence, /Vai gravar o ArticleDNA v1 do plano: principal “Wi-Fi lento”; papel Suporte · 11º/);
  assert.equal(lido.find(line => line.keywordId === "k13")!.sentence, "Já formado · v1: fica como está (nenhuma versão nova).");
});

test("as secundárias são as sustentações já ligadas no Minerador (lista do Assunto): com volume, intenção, sem publicada e sem outro artigo — da maior para a menor", () => {
  const rows = new Map(mesaWifi().map(row => [String(row.id), row]));
  const lido = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: [], ownerOf: () => null, hasIntent: sempreComIntencao, territoryRef: "territory:wifi-e-fibra", now: AGORA });
  assert.deepEqual(lido.find(line => line.keywordId === "k10")!.memberIds, ["k10", "s2", "s1"], "s3 sem volume e s4 publicada ficam fora");
  const semIntencao = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: [], ownerOf: () => null, hasIntent: id => id !== "s2", territoryRef: "territory:wifi-e-fibra", now: AGORA });
  assert.deepEqual(semIntencao.find(line => line.keywordId === "k10")!.memberIds, ["k10", "s1"]);
  const comDono = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: [], ownerOf: id => id === "s1" ? "outro" : null, hasIntent: sempreComIntencao, territoryRef: "territory:wifi-e-fibra", now: AGORA });
  assert.deepEqual(comDono.find(line => line.keywordId === "k10")!.memberIds, ["k10", "s2"]);
});

test("recusa só a linha: keyword presa em outro artigo (com o caminho) e principal que não chegou; as outras seguem", () => {
  const rows = new Map(mesaWifiReal().map(row => [String(row.id), row]));
  const lido = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: [ARTIGO_INTRUSO], ownerOf: () => null, hasIntent: sempreComIntencao, territoryRef: null, now: AGORA });
  assert.deepEqual(lido.filter(line => line.action === "refused").map(line => line.keywordId), ["k12", "k13", "k14"]);
  assert.match(lido.find(line => line.keywordId === "k13")!.sentence, /Presa no artigo “melhor-para-jogos-online”.*Retirar artigo do Silo/);
  assert.equal(lido.filter(line => line.action === "write").length, 4);
  // A principal declarada que não chegou ao Arquiteto (formato anterior: Assunto numa linha, principal noutra).
  const semPrincipal = new Map(rows);
  const k9 = structuredClone(semPrincipal.get("k9")!) as any;
  for (const alvo of [k9.analise_semantica, k9.canonicalWorkflow.payload.approvedDna.analiseSemantica]) alvo.keyword_subject.plan.declaredPrincipal = { keywordId: "nao-chegou", phrase: "fibra óptica residencial" };
  semPrincipal.set("k9", k9);
  const espera = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows: semPrincipal, articles: [], ownerOf: () => null, hasIntent: sempreComIntencao, territoryRef: null, now: AGORA });
  assert.match(espera.find(line => line.keywordId === "k9")!.sentence, /^Aguarda a principal “fibra óptica residencial” chegar ao Arquiteto/);
});

test("o Silo do plano: primeiro onde as keywords do plano JÁ estão (o grupo da WifiConecta apontava para um território que não existe mais); senão a regra do envio", () => {
  const vivo = { territoryRef: "territory:5e689f8c", lifecycleStatus: "confirmed", name: "Wi-Fi e fibra óptica", slugs: [] };
  assert.deepEqual(choosePlanConsolidationTerritory({ rowTerritoryRefs: ["territory:5e689f8c", null, "territory:5e689f8c"], territories: [vivo], fallback: { kind: "create" } }), { kind: "rows", territoryRef: "territory:5e689f8c", lifecycleStatus: "confirmed", name: "Wi-Fi e fibra óptica" });
  assert.equal(choosePlanConsolidationTerritory({ rowTerritoryRefs: ["territory:a", "territory:b"], territories: [{ ...vivo, territoryRef: "territory:a" }, { ...vivo, territoryRef: "territory:b" }], fallback: { kind: "create" } }).kind, "split");
  assert.equal(choosePlanConsolidationTerritory({ rowTerritoryRefs: [null, null], territories: [], fallback: { kind: "create" } }).kind, "create");
  assert.equal(choosePlanConsolidationTerritory({ rowTerritoryRefs: [null], territories: [], fallback: { kind: "rejected_by_human", territoryRef: "territory:x" } }).kind, "rejected");
  assert.equal(choosePlanConsolidationTerritory({ rowTerritoryRefs: ["territory:morto"], territories: [{ ...vivo, territoryRef: "territory:morto", lifecycleStatus: "rejected" }], fallback: { kind: "linked", territoryRef: "territory:5e689f8c" } }).kind, "linked", "território desfeito não conta como o das keywords");
});

test("uma confirmação vale para as gravações em sequência: o hash não muda quando a linha aceita vira 'já formado' com a MESMA composição; muda se outra pessoa mudar a principal", () => {
  const rows = new Map(mesaWifiReal().filter(row => String(row.id).startsWith("k")).map(row => [String(row.id), row]));
  const antes = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: ["k9", "k12", "k13", "k14", "k15"].map(id => artigo(id)), ownerOf: () => null, hasIntent: sempreComIntencao, territoryRef: null, now: AGORA });
  const aceitas = antes.filter(line => line.action === "write").map(line => line.keywordId);
  const hash = planConsolidationDecisionHash({ groupId: AZUL, planVersion: 3, lines: antes, acceptedKeywordIds: aceitas });
  const depois = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: ["k9", "k10", "k12", "k13", "k14", "k15"].map(id => artigo(id)), ownerOf: () => null, hasIntent: sempreComIntencao, territoryRef: null, now: AGORA });
  assert.equal(planConsolidationDecisionHash({ groupId: AZUL, planVersion: 3, lines: depois, acceptedKeywordIds: aceitas }), hash);
  const trocada = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows, articles: [...["k9", "k12", "k13", "k14", "k15"].map(id => artigo(id)), artigo("k10", { principalKeywordId: "outra", keywordIds: ["outra"] })], ownerOf: () => null, hasIntent: sempreComIntencao, territoryRef: null, now: AGORA });
  assert.notEqual(planConsolidationDecisionHash({ groupId: AZUL, planVersion: 3, lines: trocada, acceptedKeywordIds: aceitas }), hash);
  assert.notEqual(planConsolidationDecisionHash({ groupId: AZUL, planVersion: 4, lines: antes, acceptedKeywordIds: aceitas }), hash, "plano novo = prévia nova");
});

test("a aprovação sem SERP só vale para o núcleo da consolidação, com a marca da decisão humana no DNA; a regra de sempre não muda", () => {
  const dna = (extra: Record<string, unknown>) => ({ payload: { brandId: MARCA_WIFI, principalKeywordId: "k10", keywordReferences: [{ keywordId: "k10", role: "principal" }], architectureStatus: "architecture_confirmed", alerts: [], subject: { keywordId: "k10" }, ...extra } }) as never;
  const marca = `${DECLARED_PLAN_CONSOLIDATION_ALERT_PREFIX} (decisão humana de ator em 2026-10-14): papel, ordem, principal e escopo do plano.`;
  assert.deepEqual(articleApprovalRevalidationIssues({ version: dna({ alerts: [marca] }), authorizedBrandId: MARCA_WIFI }).map(issue => issue.code), ["SERP_EVIDENCE_MISSING"], "sem a opção, a SERP continua obrigatória");
  assert.deepEqual(articleApprovalRevalidationIssues({ version: dna({ alerts: [marca] }), authorizedBrandId: MARCA_WIFI, declaredPlanConsolidation: true }), []);
  assert.deepEqual(articleApprovalRevalidationIssues({ version: dna({}), authorizedBrandId: MARCA_WIFI, declaredPlanConsolidation: true }).map(issue => issue.code), ["SERP_EVIDENCE_MISSING"], "sem a marca no DNA, a opção não basta");
  assert.deepEqual(articleApprovalRevalidationIssues({ version: dna({ alerts: [marca], subject: undefined }), authorizedBrandId: MARCA_WIFI, declaredPlanConsolidation: true }).map(issue => issue.code), ["SERP_EVIDENCE_MISSING"], "só artigo de Assunto do plano");
});

/* ---------------------------------------------------- 4 · as três etapas */

test("as etapas: 1 Consolidar (linha sem DNA ou Silo sem o par) → 2 Completar (SERP das principais; depois a formação com parecer e sustentações) → 3 Links internos; só uma em destaque", () => {
  const keywords = mesaWifiReal().filter(row => String(row.id).startsWith("k"));
  const montar = (articles: PlanSheetArticle[], lidas: Record<string, number>) => buildPlanSheetRows({ brandId: MARCA_WIFI, keywords, groupOf: id => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, articles, radarArticleIds: new Set(), serp: { state: "ready", byKeyword: new Map(Object.entries(lidas).map(([id, lentes]) => [id, { lenses: lentes, collectedAt: "2026-10-14T00:00:00Z" }])) }, filter: { kind: "all" }, now: AGORA });
  const cinco = ["k9", "k12", "k13", "k14", "k15"].map(id => artigo(id, { serpAssessed: true }));
  const estado = (passos: ReturnType<typeof planFlowSteps>) => passos.map(passo => passo.state);
  assert.deepEqual(estado(planFlowSteps({ rows: montar(cinco, {}), siloConsolidated: false })), ["current", "blocked", "blocked"]);
  assert.equal(planFlowSteps({ rows: montar(cinco, {}), siloConsolidated: false })[0].label, PLAN_FLOW_LABELS.consolidate);
  const sete = ["k9", "k10", "k11", "k12", "k13", "k14", "k15"].map(id => artigo(id, { serpAssessed: id !== "k10" && id !== "k11" }));
  assert.deepEqual(estado(planFlowSteps({ rows: montar(sete, {}), siloConsolidated: false })), ["current", "blocked", "blocked"], "todos formados mas o Silo sem o par: ainda a 1");
  const semSerp = montar(sete, { k9: 4 });
  assert.deepEqual(estado(planFlowSteps({ rows: semSerp, siloConsolidated: true })), ["done", "current", "blocked"]);
  assert.deepEqual(planStepTwoAction(semSerp)!.rows.map(row => row.keywordId), ["k11", "k12", "k13", "k14", "k15"], "primeiro a SERP das principais com volume");
  assert.equal(planStepTwoAction(semSerp)!.action, "validateSerp");
  const comSerp = montar(sete, { k9: 4, k11: 4, k12: 4, k13: 4, k14: 4, k15: 4 });
  assert.deepEqual(planStepTwoAction(comSerp), { action: "concludeFormation", rows: comSerp.filter(row => row.keywordId === "k11") }, "Wi-Fi lento, consolidado sem parecer, ganha a versão com o parecer");
  const pronto = montar(sete.map(item => ({ ...item, serpAssessed: true })), { k9: 4, k11: 4, k12: 4, k13: 4, k14: 4, k15: 4 });
  assert.deepEqual(estado(planFlowSteps({ rows: pronto, siloConsolidated: true })), ["done", "done", "current"]);
  assert.equal(planFlowSteps({ rows: pronto, siloConsolidated: true })[2].label, "Links internos");
});

/* ------------------------------------------------- 5 · estrutural da aba */

test("estrutural · a aba Artigos: uma tabela, uma barra, sem 'Detalhes técnicos', sem cartão nem planilha separada; o artigo do plano entra pela cor do PLANO", () => {
  const fonte = ler("../modules/arquiteto/arquiteto-workspace.tsx");
  const tela = fonte.slice(fonte.indexOf("<main className=\"min-w-0 flex-1 overflow-y-auto bg-background\">"), fonte.indexOf("</main>"));
  assert.equal(tela.split("<table").length - 1, 1, "um <table> só");
  assert.doesNotMatch(tela, /Detalhes técnicos|architect-articles-technical/);
  assert.equal(tela.split("<ArticlesFormationBar").length - 1, 1, "uma barra só, no lugar de sempre");
  assert.doesNotMatch(tela, /<PlanArticleSheet|architect-plan-sheet-next-step|Marcar toda a cor|Ir para “|planCandidatesInSheetSentence/);
  assert.match(fonte, /filterRowsByEditorialGroup\(porAssunto, arquitetoGroups\.filter, art => \(workspaceMode === "articles" \? planRowOfArticle\(art\)\?\.groupId : null\) \?\? articleGroupInfoFor\(art\)\.groupId\)/, "um vínculo de grupo perdido não tira o artigo do plano da tabela");
  assert.match(fonte, /for \(const art of filteredArticles\) \{ const row = planRowOfArticle\(art\); if \(row\) naTabela\.add\(row\.keywordId\); \}/, "a linha do plano só cede o lugar a um artigo que ESTÁ na tabela");
  assert.match(fonte, /consolidateSiloPair: input => planSiloPairRef\.current/);
  assert.match(fonte, /const writeSiloPairFromArticles = async/, "o par do Silo pelo mesmo caminho do fechamento canônico");
  const folha = ler("../modules/arquiteto/plan-article-sheet.tsx");
  assert.doesNotMatch(folha, /PlanArticleSheetSession|architect-plan-sheet-batch|architect-plan-sheet-select-all|data-plan-action="validateSerp"|data-plan-action="concludeFormation"/);
  const barra = ler("../modules/arquiteto/articles-formation-bar.tsx");
  assert.match(barra, /data-testid="architect-plan-stage"/);
  assert.doesNotMatch(barra, /\(\$\{[^}]*\.length\}\)/, "nenhum contador nos botões da barra");
});

test("estrutural · o núcleo da consolidação: os núcleos de sempre, sem SERP, sem IA, nada no Minerador; a exceção da SERP só nele; a rota exige aprovar", () => {
  const nucleo = ler("../lib/server/arquiteto-plan-consolidation.ts");
  assert.doesNotMatch(nucleo, /\/api\/minerador|minerador_keywords|measureKeyword|runKeywordLogic|serpOperation|handleArchitectFormationSerp|editorialAi|keyword-serp/);
  assert.match(nucleo, /assignPlanGroupKeywordsToTerritory/, "o Silo do plano pelo núcleo do envio");
  assert.match(nucleo, /writePlanArticleFromPlan/);
  const melhoria = ler("../lib/server/arquiteto-article-improvement.ts");
  const escritor = melhoria.slice(melhoria.indexOf("export async function writePlanArticleFromPlan"), melhoria.indexOf("export function improvementRuntime"));
  assert.match(escritor, /makeGroup\(target, proposal, input\.rows\)/);
  assert.match(escritor, /deterministicArticleDnaPayload\(group, context\.brandId\)/);
  assert.match(escritor, /applyDeclaredPlanToArticleDna\(/);
  assert.match(escritor, /articleApprovalRevalidationIssues\(\{ version, authorizedBrandId: context\.brandId, declaredPlanConsolidation: true \}\)/);
  assert.match(escritor, /appendArquitetoArtifact\(await runtime\.authorize\("arquiteto", "approve"\), "article_dna", version, "approved"\)/);
  assert.doesNotMatch(escritor, /serpOperation|resolveArticleFormationSerpAssessment|editorialAi|readGoogleAds/);
  assert.equal(melhoria.split("declaredPlanConsolidation: true").length - 1, 1, "a exceção da SERP é só deste escritor");
  assert.doesNotMatch(ler("../app/api/arquiteto/artifacts/route.ts"), /declaredPlanConsolidation/);
  const rota = ler("../app/api/arquiteto/plan-silo/consolidate/route.ts");
  assert.match(rota, /action: "approve"/);
  assert.match(rota, /decisionHash/);
  assert.match(ler("../lib/agent/platform-catalog.ts"), /"\/api\/arquiteto\/plan-silo\/consolidate"/, "catálogo do MCP (AGENTS §17.1)");
});
