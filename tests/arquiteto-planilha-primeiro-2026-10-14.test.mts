import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAN_SHEET_LOCKED_SEAL, applyPlanSheetSerp, buildPlanSheetRows, planPrincipalSwapCandidates, planSheetColorLabel,
  planSheetFormationSelection, planSheetOutcomeSentence, planSheetPreviewLines, planSheetSerpByKeyword, planSheetSerpSelection,
  type PlanSheetArticle,
} from "../lib/arquiteto/plan-article-sheet.ts";
import { planArticleImprovements, type ImprovementKeyword, type ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { ArticleImprovementRequestSchema } from "../lib/arquiteto/article-improvement-request.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import type { EditorialGroupScreenFilter } from "../lib/editorial/editorial-groups.ts";
import { AZUL, GRUPOS, LARANJA, MARCA_WIFI, TERRITORIO, cadastro, grupoDaKeyword, linha, mesaWifi } from "./arquiteto-planilha-primeiro-fixtures.mts";

/*
 * F5 · PLANILHA PRIMEIRO (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 5). CASO REAL COM FIXTURE: WifiConecta, grupo azul "Wi-Fi e fibra
 * óptica" — 7 keywords com Assunto cadastrado (ordem 9–15), Pilar = "internet
 * fibra óptica", 6 travadas (volume medido) e "diferença entre internet e
 * Wi-Fi" livre (sem volume) → 7 linhas. Sem rede, sem provider, sem custo.
 */

type Semantic = Record<string, unknown>;
const AGORA = new Date("2026-10-14T12:00:00Z");
function linhas(input: { filter?: EditorialGroupScreenFilter; articles?: PlanSheetArticle[]; radar?: string[]; keywords?: Record<string, unknown>[]; brandId?: string } = {}) {
  return buildPlanSheetRows({
    brandId: input.brandId ?? MARCA_WIFI,
    keywords: input.keywords ?? mesaWifi(),
    groupOf: id => GRUPOS[id] ?? null,
    keywordGroupOf: grupoDaKeyword,
    articles: input.articles ?? [],
    radarArticleIds: new Set(input.radar ?? []),
    serp: null,
    filter: input.filter ?? { kind: "groups", color: "azul", groupIds: [AZUL] },
    now: AGORA,
  });
}

test("caso real WifiConecta · azul: 7 keywords com Assunto viram 7 linhas, por ordem 9–15, Pilar primeiro, 6 travadas e 1 livre", () => {
  const rows = linhas();
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(row => row.order), [9, 10, 11, 12, 13, 14, 15]);
  assert.equal(rows[0].role, "Pilar");
  assert.equal(rows[0].keyword, "internet fibra óptica");
  assert.equal(rows.filter(row => row.role === "Pilar").length, 1);
  assert.equal(rows.filter(row => row.lock.state === "locked").length, 6);
  const livres = rows.filter(row => row.lock.state === "free");
  assert.deepEqual(livres.map(row => row.keyword), ["diferença entre internet e wi-fi"]);
  assert.match(livres[0].lock.label, /^Livre/);
  assert.match(livres[0].lock.why, /Sem volume medido/);
  assert.match(rows[0].lock.label, /^Travada · pelo volume medido/);
  assert.match(rows[0].lock.why, /mude a trava no Minerador/);
  // A linha mostra o Assunto (título cadastrado), a cor e o estado.
  assert.equal(rows[1].title, "Diferença entre internet e Wi-Fi: o que muda na sua casa");
  assert.equal(rows.every(row => row.color === "azul"), true);
  assert.equal(planSheetColorLabel(rows[0]), "Azul (Wi-Fi e fibra óptica)");
  assert.equal(rows.every(row => row.formation.state === "awaiting" && row.formation.label === "Aguardando formação"), true);
  assert.match(rows[0].volume.label, /^320 · medido em 20\/09\/2026/);
  assert.equal(rows[1].volume.label, "Sem volume medido");
  assert.deepEqual([rows[1].supports.count, rows[1].supports.withVolume], [4, 3], "a lista do Assunto: 4 sustentações, 3 com volume");
  assert.deepEqual([...rows[1].supports.withVolumeIds].sort(), ["s1", "s2", "s4"]);
  assert.equal(rows[1].currentPrincipalId, "k10", "antes da formação, a principal é a declarada (a própria keyword)");
});

test("recorte da cor ativa: azul → 7, laranja → 1, todas → 8, sem grupo → 0; sem plano, não recebida ou outra marca não viram linha", () => {
  assert.equal(linhas({ filter: { kind: "groups", color: "azul", groupIds: [AZUL] } }).length, 7);
  assert.deepEqual(linhas({ filter: { kind: "group", groupId: LARANJA } }).map(row => row.keyword), ["plano de internet barato"]);
  const todas = linhas({ filter: { kind: "all" } });
  assert.equal(todas.length, 8);
  assert.deepEqual(todas.map(row => row.color), ["azul", "azul", "azul", "azul", "azul", "azul", "azul", "laranja"], "por cor (ordem da paleta) e depois por ordem");
  assert.equal(linhas({ filter: { kind: "none" } }).length, 0);
  assert.equal(todas.some(row => row.keywordId === "c1" || row.keywordId === "x1" || row.keywordId.startsWith("s")), false);
  assert.equal(linhas({ brandId: "outra-marca", filter: { kind: "all" } }).length, 0, "o pacote de outra marca nunca vira linha");
});

test("estado da formação: formado vN, no Radar e aguardando a principal declarada", () => {
  const artigos: PlanSheetArticle[] = [{ articleId: "art-9", versionNumber: 2, subjectKeywordId: "k9", principalKeywordId: "k9", keywordIds: ["k9"] }, { articleId: "art-11", versionNumber: 1, subjectKeywordId: "k11", principalKeywordId: "k11", keywordIds: ["k11"] }];
  const rows = linhas({ articles: artigos, radar: ["art-11"] });
  assert.equal(rows.find(row => row.keywordId === "k9")?.formation.label, "Formado · v2");
  assert.equal(rows.find(row => row.keywordId === "k11")?.formation.label, "No Radar · v1");
  // Plano anterior: o Assunto numa linha e a principal declarada em outra que não chegou.
  const mesa = mesaWifi();
  const antigo = linha("k20", "Qual operadora escolher", { ...cadastro("k20", "Qual operadora escolher", "Qual operadora escolher", 16, "Suporte"), keyword_subject: { ...(cadastro("k20", "x", "Qual operadora escolher", 16, "Suporte").keyword_subject as Semantic), plan: { groupId: AZUL, planVersion: 1, order: 16, role: "Suporte", scope: "Escopo.", declaredPrincipal: { keywordId: "k99", phrase: "melhor operadora de internet" } } } });
  const esperando = linhas({ keywords: [...mesa, antigo] }).find(row => row.keywordId === "k20");
  assert.equal(esperando?.formation.state, "awaiting_principal");
  assert.match(esperando!.formation.label, /melhor operadora de internet/);
});

test("SERP: a leitura do cache (grátis) dá as lentes por linha; vencida conta como falta", () => {
  const lido = planSheetSerpByKeyword({
    footprints: [
      { keywordId: "k9", lenses: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ lens, collectedAt: "2026-10-01T00:00:00Z" })) },
      { keywordId: "k11", lenses: [{ lens: "desktop-windows", collectedAt: "2026-10-02T00:00:00Z" }, { lens: "mobile-ios", collectedAt: "2026-08-01T00:00:00Z" }] },
    ],
    missingLenses: [{ keywordId: "k11", lens: "mobile-ios" }],
  });
  assert.deepEqual(lido.get("k9"), { lenses: 4, collectedAt: "2026-10-01T00:00:00Z" });
  assert.deepEqual(lido.get("k11"), { lenses: 1, collectedAt: "2026-10-02T00:00:00Z" });
  const rows = applyPlanSheetSerp(linhas(), { state: "ready", byKeyword: lido });
  assert.equal(rows.find(row => row.keywordId === "k9")?.serp.label, "4/4 lentes · 01/10/2026");
  assert.equal(rows.find(row => row.keywordId === "k11")?.serp.label, "1/4 lentes · 02/10/2026");
  assert.equal(rows.find(row => row.keywordId === "k12")?.serp.label, "Sem SERP no cache");
  assert.equal(applyPlanSheetSerp(linhas(), { state: "loading", byKeyword: new Map() })[0].serp.label, "Lendo o cache…");
});

test("Validar SERP: já temos (sem custo), falta (vai ao plano de custo) e recusa por item (sem volume)", () => {
  const lido = new Map([["k9", { lenses: 4, collectedAt: "2026-10-01T00:00:00Z" }], ["k11", { lenses: 2, collectedAt: null }]]);
  const rows = applyPlanSheetSerp(linhas(), { state: "ready", byKeyword: lido });
  const escolha = planSheetSerpSelection(rows);
  assert.deepEqual(escolha.known.map(item => item.keywordId), ["k9"]);
  assert.match(escolha.known[0].reason, /Já temos as 4 lentes/);
  assert.deepEqual(escolha.refused.map(item => item.keywordId), ["k10"], "a livre sem volume não é coletada");
  assert.match(escolha.refused[0].reason, /Sem volume medido no Minerador/);
  assert.deepEqual(escolha.toPlan.map(row => row.keywordId), ["k11", "k12", "k13", "k14", "k15"]);
});

test("Trocar principal: só a livre; candidatas = sustentações com volume da lista do Assunto, por lentes e volume; travada recusa com o selo", () => {
  const mesa = mesaWifi();
  const k10 = mesa.find(row => row.id === "k10")!;
  const lentes = new Map([["s1", 4], ["s2", 2]]);
  const lido = planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: k10, rows: mesa, currentPrincipalId: "k10", lensesOf: id => lentes.get(id) ?? 0, now: AGORA });
  assert.equal(lido.ok, true);
  if (!lido.ok) return;
  assert.deepEqual(lido.candidates.map(item => item.keywordId), ["s1", "s2"], "mais lentes primeiro; sem volume e publicada ficam fora");
  // Sem SERP lida, decide o volume.
  const semSerp = planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: k10, rows: mesa, currentPrincipalId: "k10", now: AGORA });
  assert.deepEqual(semSerp.ok && semSerp.candidates.map(item => item.keywordId), ["s2", "s1"]);
  // Já trocada: a keyword do Assunto volta a ser candidata; a de outro artigo, não.
  const depois = planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: k10, rows: mesa, currentPrincipalId: "s2", keywordIdsInOtherArticles: new Set(["s1"]), now: AGORA });
  assert.deepEqual(depois.ok && depois.candidates.map(item => item.keywordId), ["k10"]);
  const travada = planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: mesa.find(row => row.id === "k9")!, rows: mesa, currentPrincipalId: "k9", now: AGORA });
  assert.equal(travada.ok, false);
  assert.match(!travada.ok ? travada.reason : "", new RegExp(PLAN_SHEET_LOCKED_SEAL));
});

test("Concluir formação e Trocar principal no lote: recusa por item antes do servidor (travada, sem Silo) e um prepare por grupo", () => {
  const rows = linhas({ filter: { kind: "all" } });
  const troca = planSheetFormationSelection(rows, "swapPrincipal");
  assert.equal(troca.refused.length, 7, "as 6 travadas do azul e a laranja travada");
  assert.ok(troca.refused.every(item => item.reason.startsWith(PLAN_SHEET_LOCKED_SEAL)));
  assert.deepEqual([...troca.byGroup.keys()], [AZUL]);
  assert.deepEqual(troca.byGroup.get(AZUL)!.map(row => row.keywordId), ["k10"]);
  const formar = planSheetFormationSelection(rows, "concludeFormation");
  assert.deepEqual([...formar.byGroup.keys()].sort(), [AZUL, LARANJA].sort());
  assert.equal(formar.byGroup.get(AZUL)!.length, 7);
  const semSilo = planSheetFormationSelection(rows.map(row => row.keywordId === "k12" ? { ...row, territoryRef: null } : row), "concludeFormation");
  assert.deepEqual(semSilo.refused.map(item => item.keywordId), ["k12"]);
  assert.match(semSilo.refused[0].reason, /Sem Silo/);
});

test("prévia por linha (da execução preparada): vai gravar, já adequado, Precisa do Minerador, falta SERP e recusa por item", () => {
  const rows = linhas().slice(0, 5);
  const proposta = (targetId: string, extra: Record<string, unknown> = {}) => ({ targetId, status: "ready" as const, reasons: ["Motivo do núcleo."], principalId: targetId, currentPrimaryId: targetId, memberIds: [targetId], ...extra });
  const linhasDaPrevia = planSheetPreviewLines({
    proposals: [
      proposta("k9"),
      proposta("k10", { principalId: "s2", currentPrimaryId: "k10", memberIds: ["s2"] }),
      proposta("k11", { status: "insufficient_evidence", needsMinerador: { newKeywordIds: [], measureKeywordIds: ["k11"], logicKeywordIds: [] }, reasons: ["Precisa do Minerador: medição."] }),
      proposta("k12", { status: "insufficient_evidence", needsValidation: true }),
    ],
    keywords: [{ id: "s2", keyword: "wifi e internet são a mesma coisa" }],
    refusedTargets: [{ id: "k13", reason: "Não é um Assunto do plano recebido." }],
  }, rows);
  assert.deepEqual(linhasDaPrevia.map(item => item.kind), ["will_write", "will_write", "needs_minerador", "needs_serp", "refused"]);
  assert.match(linhasDaPrevia[0].sentence, /primeiro ArticleDNA \(v1\)/);
  assert.match(linhasDaPrevia[1].sentence, /principal: diferença entre internet e wi-fi → wifi e internet são a mesma coisa/);
  assert.match(linhasDaPrevia[3].sentence, /Validar SERP/);
  assert.equal(linhasDaPrevia[4].sentence, "Não é um Assunto do plano recebido.");
  // O motivo genérico do núcleo ("Assunto declarado mantido…") não explica nada: a linha livre sem volume aponta a saída.
  const generica = planSheetPreviewLines({ proposals: [proposta("k10", { status: "insufficient_evidence", reasons: ["Assunto declarado mantido como fundamento, fora das seis keywords."] })] }, [rows[1]]);
  assert.equal(generica[0].kind, "refused");
  assert.match(generica[0].sentence, /use “Trocar principal” para uma sustentação com volume/);
  const formado = planSheetPreviewLines({ proposals: [proposta("k9")] }, [{ ...rows[0], formation: { ...rows[0].formation, state: "formed", version: 3 } }]);
  assert.match(formado[0].sentence, /nova versão \(v4\)/);
  assert.deepEqual(planSheetOutcomeSentence({ status: "dna_created", message: "Primeiro ArticleDNA criado." }), { tone: "success", text: "Primeiro ArticleDNA criado." });
  assert.equal(planSheetOutcomeSentence({ status: "failed", message: "Falhou." }).tone, "warning");
  assert.equal(planSheetOutcomeSentence(undefined).tone, "warning");
});

test("núcleo da melhoria: a escolha do humano vira a principal (livre), a travada nunca troca, a recusa da escolha deixa a linha fora", () => {
  const sinaisDe = (keywordId: string, text: string) => resolveKeywordDnaSignals({ keywordId, text, semantic: { intencao_principal: "Informativa" } });
  const alvo = (extra: Partial<ImprovementTarget> = {}): ImprovementTarget => ({ id: "k10", kind: "subject", theme: "Diferença entre internet e Wi-Fi", note: null, primaryId: "k10", post: "free", memberIds: [], territoryRef: TERRITORIO, slug: null, url: null, canonical: null, signals: sinaisDe("k10", "diferença entre internet e wi-fi"), planPrincipalId: "k10", ...extra });
  const keywords: ImprovementKeyword[] = [{ id: "s2", keyword: "wifi e internet são a mesma coisa", volume: 480, volumeValidated: true, signals: sinaisDe("s2", "wifi e internet são a mesma coisa"), ownerId: null, published: false, territoryRef: TERRITORIO, external: false }];
  const [escolhida] = planArticleImprovements({ targets: [alvo({ chosenPrincipalId: "s2" })], keywords, evidence: [] });
  assert.equal(escolhida.principalId, "s2");
  assert.deepEqual(escolhida.memberIds, ["s2"], "a keyword do Assunto não é secundária do próprio artigo");
  assert.equal(escolhida.status, "ready");
  assert.match(escolhida.reasons.join(" "), /Troca de principal escolhida por você na planilha/);
  const [recusada] = planArticleImprovements({ targets: [alvo({ chosenPrincipalId: null, principalChoiceRefusal: "Principal travada · mude a trava no Minerador." })], keywords, evidence: [] });
  assert.equal(recusada.status, "no_alternative");
  assert.match(recusada.reasons.join(" "), /Principal travada/);
  const [travada] = planArticleImprovements({ targets: [alvo({ declaredPrincipalId: "k10", chosenPrincipalId: "s2" })], keywords, evidence: [] });
  assert.equal(travada.principalId, "k10", "declaredPrincipalId vence a escolha");
  const [semEscolha] = planArticleImprovements({ targets: [alvo({ territoryRef: null, chosenPrincipalId: "s2" })], keywords, evidence: [] });
  assert.equal(semEscolha.status, "insufficient_evidence", "sem Silo, nada fica pronto");
});

test("contrato do pedido: origin, principalChoice e excludePlanArticles são aditivos; ausentes = o de sempre", () => {
  const base = { brandId: "22222222-2222-4222-8222-222222222222", action: "prepare" as const };
  assert.equal(ArticleImprovementRequestSchema.safeParse(base).success, true);
  assert.equal(ArticleImprovementRequestSchema.safeParse({ ...base, origin: "plan_sheet", group: AZUL, targetIds: ["k10"], principalChoice: { k10: "s2" } }).success, true);
  assert.equal(ArticleImprovementRequestSchema.safeParse({ ...base, excludePlanArticles: true }).success, true);
  assert.equal(ArticleImprovementRequestSchema.safeParse({ ...base, origin: "outra" }).success, false);
});

/* ------------------------------ estrutural ------------------------------ */

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("estrutural · a planilha só chama a melhoria, a SERP por keyword e a leitura do cache: nada no Minerador", () => {
  const tela = semComentarios(ler("../modules/arquiteto/plan-article-sheet.tsx"));
  const rotas = [...tela.matchAll(/["'`](\/api\/[^"'`?$]+)/g)].map(match => match[1]).sort();
  assert.deepEqual([...new Set(rotas)], ["/api/arquiteto/article-improvement", "/api/arquiteto/keyword-serp", "/api/arquiteto/serp-subject"]);
  assert.doesNotMatch(tela, /\/api\/minerador/);
  assert.doesNotMatch(tela, /measureKeywordVolume|runKeywordLogicWithCore|importSubjectDiscoveryWithCore|applyKeywordDecisionEntries|approveNewKeywords|keywords\/delete/);
  assert.match(tela, /onlyMeasuredVolume: true/, "o servidor confere o volume no banco antes de pagar");
  assert.match(tela, /origin: "plan_sheet"/);
  assert.match(tela, /runPaidSerpBlocks/, "o mesmo executor de blocos pagos da mesa (plano somado, uma confirmação)");
  assert.match(tela, /<OperationProgress /, "o andamento de cada ação");
  assert.match(tela, /data-testid="architect-plan-sheet-result"/, "o resultado por linha");
  assert.match(tela, /setSerpReload\(valor => valor \+ 1\)/, "releitura da SERP depois da coleta");
  assert.match(tela, /onApplied\(\);/, "releitura da mesa depois de gravar");
  const dominio = semComentarios(ler("../lib/arquiteto/plan-article-sheet.ts"));
  assert.doesNotMatch(dominio, /fetch\(|supabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("estrutural · o painel de texto fica para publicados; as outras portas apontam para a planilha", () => {
  const painel = semComentarios(ler("../modules/arquiteto/article-improvement-panel.tsx"));
  assert.doesNotMatch(painel, /planGroups|Formar os artigos do plano|architect-improvement-plan-group/);
  assert.match(painel, /excludePlanArticles: true/);
  assert.match(painel, /restored\.origin === "plan_sheet"/, "o painel não retoma a execução da planilha");
  const tela = semComentarios(ler("../modules/arquiteto/arquiteto-workspace.tsx"));
  assert.doesNotMatch(tela, /planGroups=/);
  // 2026-10-14 (tarde) · pedido do dono ("uma lista só, sem planilhas duplicadas"): a planilha separada saiu da aba;
  // o MESMO núcleo roda pelo hook, e as linhas do plano estão na tabela de artigos.
  assert.doesNotMatch(tela, /<PlanArticleSheet /);
  assert.match(tela, /const planSheet = usePlanArticleSheet\(\{\s*brandId: selectedBrandId \|\| null/);
  assert.match(tela, /filter: arquitetoGroups\.filter, articles: planSheetArticles/, "a cor ativa da etiqueta recorta as linhas do plano");
  assert.match(tela, /o caminho do plano é o das linhas do plano nesta mesma tabela/, "Processar artigos aponta para as linhas do plano");
  const servidor = semComentarios(ler("../lib/server/arquiteto-article-improvement.ts"));
  assert.match(servidor, /if \(options\.excludePlanArticles && standing\.plan\) continue;/);
  assert.match(servidor, /planPrincipalSwapCandidates\(/, "a mesma regra das candidatas na tela e no servidor");
  assert.match(servidor, /if \(foraDosAlvos\.length && !options\.lenient\) throw refusal/);
});

/*
 * 2026-10-14 · "uma lista só", o artigo intruso, Concluir formação por linha,
 * painel recolhido e leitura grátis (caso real WifiConecta). Os testes moram em
 * arquivo próprio e entram em `test:arquiteto` por aqui: o script já está no
 * limite da linha de comando do Windows (8.191 caracteres).
 */
await import("./arquiteto-uma-lista-so-2026-10-14.test.mts");
