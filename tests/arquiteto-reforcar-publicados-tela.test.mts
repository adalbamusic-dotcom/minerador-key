/**
 * REFORÇAR PUBLICADOS · TELA — o botão, a busca em lote, a linha dos sem par e
 * as mensagens simples (SDD docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md).
 *
 * O caso real (AdalbaPro, 2026-09-28): "Reprocessar artigos" disse SUCCESS com
 * "ARTICLES_PROCESSED = 21 · … · READY_TO_CONCLUDE = 21", a tabela continuou em
 * "1 keyword", todo cartão mandava "conclua a formação e volte aqui" e o dono
 * perguntou "sucesso onde?". Três metades:
 *   1. as frases: o que foi feito, o que foi GRAVADO e o que não foi, com o
 *      botão que grava — nunca sucesso sem gravação;
 *   2. o modelo da tela: o pedido do "Reforçar publicados" a partir dos
 *      cartões, a prévia, o desfecho, a busca em lote com o teto de US$ 1,00
 *      e a linha única dos "Sem par no lote";
 *   3. a estrutura do painel, do hook e da fiação, lida como texto SEM
 *      comentários. Nenhuma rede: `fetch` falso que falha e conta.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { describeAllintitlePlain, describeArticleRunPlain, describeArticleRunStartPlain } from "../lib/arquiteto/plain-run-messages.ts";
import type { ArticleRunRow } from "../lib/arquiteto/process-observability.ts";
import { PUBLISHED_REINFORCEMENT_ACTION_LABEL, type PublishedReinforcementPagePlan } from "../lib/arquiteto/published-reinforcement.ts";
import { REINFORCEMENT_MAX_COST_USD, REINFORCEMENT_SEARCH_ACTION_LABEL, buildReinforcementSearchPlan, type ReinforcementPageResult } from "../lib/arquiteto/published-reinforcement-search.ts";
import type { DifferentiationPage } from "../lib/arquiteto/published-differentiation.ts";
import type { AnchorSerpDiagnosis } from "../lib/arquiteto/serp-subject-diagnosis.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";
import {
  REINFORCE_PUBLISHED_ACTION_LABEL,
  REINFORCE_PUBLISHED_SAVE_LABEL,
  describeSerpSubjectBatchOutcome,
  publishedSwapReadiness,
  serpSubjectBatchChoices,
  serpSubjectCardView,
  type SerpSubjectCardView,
} from "../modules/arquiteto/serp-subject-model.ts";
import {
  PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX,
  PUBLISHED_REINFORCEMENT_COST_LINE,
  PUBLISHED_REINFORCEMENT_SAVE_LABEL,
  PUBLISHED_REINFORCEMENT_TABLE_LINE,
  buildReinforcementRequest,
  reinforcementDefaultPicks,
  reinforcementDefaultSearchPicks,
  reinforcementRowNeedsAttention,
  reinforcementSuggestionOwners,
  reinforcementTableRows,
  reinforcementTableSummary,
  sortReinforcementRows,
  cardWithBatchSearch,
  defaultSearchPicks,
  noPairLineView,
  reinforcementApplyRequest,
  reinforcementBarSummary,
  reinforcementErrorMessage,
  reinforcementNeedsAttention,
  reinforcementOutcomeLines,
  reinforcementPreviewRequest,
  reinforcementPreviewView,
  searchActionLabel,
  searchConfirmLines,
  searchRunRequest,
  searchSuggestionViews,
  type ReinforcementPreviewData,
  type ReinforcementSearchPlanData,
} from "../modules/arquiteto/published-reinforcement-model.ts";
import { findVisualViolations } from "../scripts/check-visual-system.mjs";

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("rede proibida nos testes");
}) as typeof fetch;

/* ================================ 1. as frases ================================ */

const linha = (over: Partial<ArticleRunRow>): ArticleRunRow => ({
  articleId: "c", serpSource: "REUSED", serpVerdict: "SUPPORTED", decisionBasis: "Sustentada", formationChanged: true, readyToConclude: true, blocked: false, ...over,
});

test("Reprocessar com os 21 publicados pelo cache: nada gravado, sem SUCCESS e sem código; o botão que grava é o Reforçar", () => {
  const linhas = Array.from({ length: 21 }, (_, indice) => linha({ articleId: `pub-${indice}` }));
  const publicados = new Set(linhas.map(item => item.articleId));
  const saida = describeArticleRunPlain({ rows: linhas, publishedRefs: publicados, opinionsWritten: 0 });
  assert.equal(saida.tone, "info");
  assert.equal(saida.message, "21 artigos analisados pelo cache, sem custo. Nada foi gravado ainda. Para gravar os 21 publicados: \"Reforçar publicados\" (tabela no painel \"Mesmo assunto no Google\", botão \"Gravar reforços\").");
  assert.doesNotMatch(saida.message, /ARTICLES_PROCESSED|READY_TO_CONCLUDE|FORMATIONS_CHANGED|SERP_REUSED|Concluir formação/);
});

test("Reprocessar misto: pago e cache, parecer gravado, novos prontos e bloqueados — cada coisa dita, sucesso só com pendência zero", () => {
  const linhas = [
    linha({ articleId: "pub-1" }),
    linha({ articleId: "novo-1", serpSource: "COLLECTED" }),
    linha({ articleId: "novo-2", readyToConclude: false, blocked: true, serpSource: null, serpVerdict: "NOT_RUN" }),
  ];
  const saida = describeArticleRunPlain({ rows: linhas, publishedRefs: new Set(["pub-1"]), opinionsWritten: 1 });
  assert.equal(saida.tone, "warning", "ficou pendência: não é sucesso");
  assert.match(saida.message, /^3 artigos analisados: 1 com SERP coletada agora \(paga\), 1 pelo cache \(sem custo\), 1 sem SERP vigente\./);
  assert.match(saida.message, /Gravado: o parecer da SERP de 1 artigo, confirmado na releitura\. As keywords dos artigos ainda não foram gravadas\./);
  assert.match(saida.message, /Para gravar o publicado: "Reforçar publicados" \(tabela no painel "Mesmo assunto no Google", botão "Gravar reforços"\); o artigo novo: "Concluir formação"\./);
  assert.match(saida.message, /1 artigo novo ainda está bloqueado para concluir/);
  const limpo = describeArticleRunPlain({ rows: [linha({ articleId: "novo-1", serpSource: "COLLECTED" }), linha({ articleId: "novo-2", serpSource: "COLLECTED" })], publishedRefs: new Set(), opinionsWritten: 2 });
  assert.equal(limpo.tone, "info", "o Processar grava só o parecer: nenhum artigo muda, nunca SUCCESS");
  assert.match(limpo.message, /Gravado: o parecer da SERP de 2 artigos, confirmado na releitura\. .* Para gravar os 2 artigos novos: "Concluir formação"\.$/);
  const inicio = describeArticleRunStartPlain({ candidates: 21, withoutOpinion: 3 });
  assert.equal(inicio.tone, "info");
  assert.match(inicio.message, /Nada foi gravado ainda\.$/);
});

test("Allintitle: 0 medido, 4 já medidos e 17 sem volume é informação, não sucesso; medido e gravado é sucesso; falha é aviso", () => {
  const nada = describeAllintitlePlain({ measured: 0, reused: 4, withoutVolume: 17, outsideWorkingCopy: 0, failures: [] });
  assert.equal(nada.tone, "info");
  assert.equal(nada.message, "Allintitle da Principal: 4 já estavam medidas nos últimos 30 dias (sem custo); 17 Principais sem volume não foram medidas (sem volume não há KGR). Nada foi gravado.");
  const gravado = describeAllintitlePlain({ measured: 2, reused: 0, withoutVolume: 0, outsideWorkingCopy: 0, failures: [] });
  assert.equal(gravado.tone, "success");
  assert.match(gravado.message, /2 Principais medidas agora e gravadas/);
  assert.equal(describeAllintitlePlain({ measured: 1, reused: 0, withoutVolume: 0, outsideWorkingCopy: 0, failures: ["cota"] }).tone, "warning");
});

test("mudar keyword de Silo diz que só o Silo foi gravado e aponta o Reforçar", () => {
  const saida = describeSerpSubjectBatchOutcome({ swapsConfirmed: 0, swapsRefused: [], movedConfirmed: 12, movedUnchanged: 0, movedRefused: 0 });
  assert.equal(saida.tone, "info");
  assert.equal(saida.message, "12 keywords trazidas de outro Silo. Gravado: só o Silo delas. Elas ainda não estão no artigo nem no ArticleDNA: para gravar, \"Reforçar publicados\". URL, slug e canonical dos publicados não mudaram.");
});

/* ============================ 2. o cartão e o pedido ============================ */

const membro = (keywordId: string, keyword: string) => ({ keywordId, keyword, basis: "serp" as const, sharedPageCount: 5, reason: "5 páginas em comum" });
const sugestao = (keywordId: string, keyword: string, level: "strong" | "probable", preselected: boolean) => ({
  keywordId, keyword, volume: 20, level, basis: level === "strong" ? "pages" as const : "two_pages" as const, sharedPageCount: level === "strong" ? 7 : 2, sharedDomainCount: 0,
  reason: `${level === "strong" ? 7 : 2} páginas em comum no top 10`, warning: null, where: "leftover" as const, whereLabel: "Keywords não agrupadas",
  siloRef: "silo-1", siloLabel: "Captação", inArticlePrincipalKeywordId: null, preselected,
});

function diagnostico(over: Partial<AnchorSerpDiagnosis> & { anchorKeywordId: string; anchorLabel: string }): AnchorSerpDiagnosis {
  return {
    kind: "published", siloRef: "silo-1", siloLabel: "Captação", principalKeywordId: over.anchorKeywordId, state: "reinforced",
    headline: "", details: [], members: [{ keywordId: over.anchorKeywordId, keyword: over.anchorLabel, basis: "anchor", sharedPageCount: null, reason: "" }],
    slotsLeft: 5, serpEvidence: "complete", swap: null, crossSilo: [], pairsElsewhere: [], blockedByDna: [], publishedOverlaps: [], actions: [], suggestions: [],
    ...over,
  } as AnchorSerpDiagnosis;
}

const trocaProposta = (publicada: string, nome: string, substituta: string, nomeSub: string) => ({
  state: "proposed", publishedKeywordId: publicada, publishedKeyword: nome, post: "free",
  substitute: { keywordId: substituta, keyword: nomeSub, volume: 20, sharedPageCount: 7, overlap: {}, reason: "", warning: null, level: "strong" },
  alternatives: [], rejected: [], protectedIdentity: {}, previousPrimaryBecomes: "secundaria", candidates: [], decision: null, requiresHumanDecision: true, note: "",
}) as unknown as NonNullable<AnchorSerpDiagnosis["swap"]>;

test("sem ArticleDNA: 'Aplicar troca' fica ATIVO e vai pelo Reforçar (nunca 'conclua a formação'); em grupo, diz onde aceitar", () => {
  const diag = diagnostico({ anchorKeywordId: "pub-clinica", anchorLabel: "como atrair pacientes para clínica", state: "swap_proposed", swap: trocaProposta("pub-clinica", "como atrair pacientes para clínica", "kw-atrair", "como atrair pacientes") });
  const prontidao = publishedSwapReadiness({ diagnosis: diag, article: null, currentPost: "free" });
  assert.ok(!prontidao.ready && prontidao.viaReinforcement === true);
  const cartao = serpSubjectCardView(diag, { post: "free", swapReadiness: prontidao, articleKeywordIds: null });
  const aplicar = cartao.actions.find(action => action.kind === "apply_swap");
  assert.ok(aplicar && aplicar.kind === "apply_swap");
  assert.equal(aplicar.disabledReason, null, "não fica desabilitado");
  assert.equal(aplicar.viaReinforcement, true);
  assert.match(aplicar.note ?? "", /"Reforçar publicados" cria o ArticleDNA e aplica a troca numa confirmação só/);
  assert.deepEqual(cartao.swapSubstitute, { keywordId: "kw-atrair", keyword: "como atrair pacientes" });
  assert.equal(cartao.recordedInArticle, false);
  assert.match(cartao.subline ?? "", /sem ArticleDNA ainda: "Gravar reforços" \(tabela "Reforçar publicados"\) grava/);
  const escolha = serpSubjectBatchChoices({ diagnoses: [diag], cards: new Map([[cartao.key, cartao]]) }).find(item => item.kind === "swap")!;
  assert.match(escolha.disabledReason ?? "", /^Aceite esta troca em "Reforçar publicados"/);
  assert.equal(REINFORCE_PUBLISHED_ACTION_LABEL, PUBLISHED_REINFORCEMENT_ACTION_LABEL, "o mesmo nome no cartão e no núcleo");
});

test("cartão reforçado sem gravar: 'Reforço proposto', com o que grava; gravado: 'Reforçado', sem aviso", () => {
  const diag = diagnostico({ anchorKeywordId: "pub-dentistas", anchorLabel: "marketing digital para dentistas", members: [
    { keywordId: "pub-dentistas", keyword: "marketing digital para dentistas", basis: "anchor", sharedPageCount: null, reason: "" },
    membro("kw-1", "marketing para dentistas"), membro("kw-2", "marketing odontológico"),
  ] });
  const semGravar = serpSubjectCardView(diag, { post: "locked", articleKeywordIds: new Set(["pub-dentistas"]) });
  assert.match(semGravar.headline, /^Reforço proposto com 2 keywords que dividem a SERP/);
  assert.match(semGravar.subline ?? "", /proposta ainda não gravada: "Gravar reforços" \(tabela "Reforçar publicados"\) grava/);
  assert.deepEqual(semGravar.memberKeywordIds, ["kw-1", "kw-2"]);
  const gravado = serpSubjectCardView(diag, { post: "locked", articleKeywordIds: new Set(["pub-dentistas", "kw-1", "kw-2"]) });
  assert.equal(gravado.recordedInArticle, true);
  assert.match(gravado.headline, /^Reforçado com 2 keywords/);
  assert.doesNotMatch(gravado.subline ?? "", /Reforçar publicados/);
});

function cartoesDoLote() {
  const dentistas = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-d", anchorLabel: "marketing digital para dentistas", members: [
    { keywordId: "pub-d", keyword: "marketing digital para dentistas", basis: "anchor", sharedPageCount: null, reason: "" }, membro("kw-1", "marketing para dentistas"),
  ] }), { post: "locked", articleKeywordIds: null });
  const clinica = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: "como atrair pacientes para clínica", state: "suggestions_available",
    suggestions: [sugestao("kw-a", "como atrair pacientes", "strong", true), sugestao("kw-b", "como atrair mais pacientes", "probable", false)] }), { post: "locked", articleKeywordIds: null });
  const consultorio = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-o", anchorLabel: "como atrair clientes para consultório", state: "suggestions_available",
    suggestions: [sugestao("kw-a", "como atrair pacientes", "strong", true)] }), { post: "locked", articleKeywordIds: null });
  const gravado = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-g", anchorLabel: "captação de pacientes", members: [
    { keywordId: "pub-g", keyword: "captação de pacientes", basis: "anchor", sharedPageCount: null, reason: "" }, membro("kw-9", "como captar pacientes"),
  ] }), { post: "locked", articleKeywordIds: new Set(["pub-g", "kw-9"]) });
  const semPar = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-s", anchorLabel: "crescimento de clínicas", state: "no_pair_in_batch", members: [
    { keywordId: "pub-s", keyword: "crescimento de clínicas", basis: "anchor", sharedPageCount: null, reason: "" },
  ] }), { post: "locked", articleKeywordIds: null });
  const assunto = serpSubjectCardView(diagnostico({ kind: "subject", anchorKeywordId: "assunto-1", anchorLabel: "estética", state: "no_pair_in_batch" }), {});
  return { dentistas, clinica, consultorio, gravado, semPar, assunto };
}

test("o pedido do Reforçar: membros, marcadas, troca e keywords da busca; o gravado sem nada marcado fica de fora; a mesma keyword em dois publicados entra só no de mais páginas, sem travar a confirmação", () => {
  const { dentistas, clinica, consultorio, gravado, semPar, assunto } = cartoesDoLote();
  const cards: SerpSubjectCardView[] = [dentistas, clinica, consultorio, gravado, semPar, assunto];
  // A barra separa quem tem reforço proposto de quem só ganha o ArticleDNA; o reforço não gravado pede decisão.
  assert.equal(reinforcementBarSummary(cards), "3 publicados com reforço proposto ainda não gravado; 1 só ganha o ArticleDNA (sem reforço ainda)");
  assert.equal(reinforcementNeedsAttention(dentistas), dentistas.state === "reinforced");
  assert.equal(reinforcementNeedsAttention(gravado), false, "o já gravado não pede decisão");
  const padrao = (card: SerpSubjectCardView) => new Set(card.suggestions.filter(item => item.preselected).map(item => item.keywordId));
  // Os dados reais: "como atrair pacientes" é Forte em "clínica" (7 páginas) e em "consultório" (5).
  const consultorio5 = { ...consultorio, suggestions: consultorio.suggestions.map(item => ({ ...item, sharedPageCount: 5 })) };
  const dividido = buildReinforcementRequest({ cards: [dentistas, consultorio5, clinica, gravado, semPar, assunto], suggestionPicks: padrao, searchPicks: () => [], swapPicks: new Set() });
  assert.deepEqual(dividido.reassigned, ["\"como atrair pacientes\" entra só em \"como atrair pacientes para clínica\" (7 páginas em comum, a maior) e sai de \"como atrair clientes para consultório\": cada keyword vai para um artigo só. Para escolher outro, desmarque no cartão."]);
  assert.deepEqual(dividido.pages.map(page => page.publishedKeywordId), ["pub-d", "pub-o", "pub-c", "pub-s"], "ninguém trava: todos seguem para a prévia");
  assert.deepEqual(dividido.pages.find(page => page.publishedKeywordId === "pub-c")!.keywordIds, ["kw-a"]);
  assert.deepEqual(dividido.pages.find(page => page.publishedKeywordId === "pub-o")!.keywordIds, [], "sai do de menos páginas; ele segue só com o ArticleDNA");
  // Um publicado JÁ gravado que perde a única marcada sai do pedido (nada a gravar nele).
  const gravadoMarcado = { ...gravado, suggestions: clinica.suggestions.slice(0, 1).map(item => ({ ...item, sharedPageCount: 3 })) };
  const soGravado = buildReinforcementRequest({ cards: [clinica, gravadoMarcado], suggestionPicks: padrao, searchPicks: () => [], swapPicks: new Set() });
  assert.deepEqual(soGravado.pages.map(page => page.publishedKeywordId), ["pub-c"]);
  assert.equal(soGravado.reassigned.length, 1);
  // Membro da formação vence sempre.
  const membroDoConsultorio = { ...consultorio, memberKeywordIds: ["pub-o", "kw-a"], suggestions: [] };
  const membro = buildReinforcementRequest({ cards: [clinica, membroDoConsultorio], suggestionPicks: padrao, searchPicks: () => [], swapPicks: new Set() });
  assert.match(membro.reassigned[0], /entra só em "como atrair clientes para consultório" \(já está na formação dele\)/);
  assert.deepEqual(membro.pages.find(page => page.publishedKeywordId === "pub-c")!.keywordIds, []);

  const escolhas = new Map<string, Set<string>>([[consultorio.key, new Set()]]);
  const pedido = buildReinforcementRequest({
    cards,
    suggestionPicks: card => escolhas.get(card.key) ?? padrao(card),
    searchPicks: id => id === "pub-s" ? ["gestão de clínica de estética ", "gestão de clínica de estética"] : [],
    swapPicks: new Set(),
  });
  assert.deepEqual(pedido.reassigned, []);
  assert.deepEqual(pedido.pages.map(page => page.publishedKeywordId), ["pub-d", "pub-c", "pub-o", "pub-s"], "o gravado sem nada marcado e o Assunto ficam de fora");
  assert.deepEqual(pedido.pages.find(page => page.publishedKeywordId === "pub-d")!.keywordIds, ["kw-1"]);
  assert.deepEqual(pedido.pages.find(page => page.publishedKeywordId === "pub-c")!.keywordIds, ["kw-a"]);
  assert.deepEqual(pedido.pages.find(page => page.publishedKeywordId === "pub-o")!.keywordIds, [], "sem par marcado, só o ArticleDNA");
  assert.deepEqual(pedido.pages.find(page => page.publishedKeywordId === "pub-s")!.newKeywords, ["gestão de clínica de estética"]);

  const troca = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-t", anchorLabel: "como atrair pacientes para clínica", state: "swap_proposed", swap: trocaProposta("pub-t", "como atrair pacientes para clínica", "kw-t", "como atrair pacientes") }), { post: "free", swapReadiness: { ready: false, reason: "x", viaReinforcement: true }, articleKeywordIds: null });
  const soEste = buildReinforcementRequest({ cards: [...cards, troca], suggestionPicks: padrao, searchPicks: () => [], swapPicks: new Set(["pub-t"]), only: new Set(["pub-t"]) });
  assert.deepEqual(soEste.pages, [{ publishedKeywordId: "pub-t", keywordIds: ["kw-t"], newKeywords: [], swapKeywordId: "kw-t" }], "a substituta vai junto para o artigo");

  const muitos = Array.from({ length: 32 }, (_, indice) => serpSubjectCardView(diagnostico({ anchorKeywordId: `pub-${indice}`, anchorLabel: `publicado ${indice}` }), { post: "locked", articleKeywordIds: null }));
  const lote = buildReinforcementRequest({ cards: muitos, suggestionPicks: padrao, searchPicks: () => [], swapPicks: new Set() });
  assert.equal(lote.pages.length, 30);
  assert.deepEqual(lote.left, ["pub-30", "pub-31"]);

  assert.deepEqual(reinforcementPreviewRequest("marca-1", pedido.pages.slice(0, 1)), { brandId: "marca-1", mode: "preview", pages: [pedido.pages[0]] });
  const aplicar = reinforcementApplyRequest({ brandId: "marca-1", pages: pedido.pages.slice(0, 1), decisionHash: "h1", operationRequestId: "00000000-0000-4000-8000-000000000000", approveNewKeywords: false });
  assert.equal(aplicar.mode, "apply");
  assert.equal(aplicar.decisionHash, "h1");
  assert.ok(!("approveNewKeywords" in aplicar), "o aceite só vai quando o dono marcou");
  assert.equal(reinforcementApplyRequest({ ...aplicar, pages: aplicar.pages, approveNewKeywords: true }).approveNewKeywords, true);
});

/* ============================ 3. a prévia e o desfecho ============================ */

const plano = (over: Partial<PublishedReinforcementPagePlan>): PublishedReinforcementPagePlan => ({
  publishedKeywordId: "pub-c", keyword: "como atrair pacientes para clínica", url: "https://www.adalbapro.com.br/como-atrair-pacientes-para-clinica/", articleId: "pub-c",
  status: "ready", refusal: null, territoryRef: "silo-1", formationRef: null, dna: { mode: "first", fromVersionId: null, fromVersionNumber: null },
  keep: [], add: [], create: [], swap: { keywordId: null, keyword: null, state: "none", reason: "" }, refused: [], lines: ["\"como atrair pacientes para clínica\": cria o ArticleDNA do publicado (versão 1), aprovado por você.", "URL, slug e canonical não mudam."],
  ...over,
});

test("a confirmação: por artigo, o que será gravado; no topo a conta, o custo zero e o aceite das keywords novas", () => {
  const previa: ReinforcementPreviewData = {
    mode: "preview", decisionHash: "abc", written: false, message: "",
    approvalText: "Ao confirmar, você aprova estas keywords no Minerador (Lógica e Volume do Google Ads medidos agora) e as coloca nos artigos publicados. URL, slug e canonical não mudam.",
    pages: [
      plano({ add: [{ keywordId: "kw-a", keyword: "como atrair pacientes", level: "strong", sharedPageCount: 7, fromTerritoryRef: null, workflowItemId: "w", lockVersion: 1 }], swap: { keywordId: "kw-a", keyword: "como atrair pacientes", state: "apply", reason: "" } }),
      plano({ publishedKeywordId: "pub-d", keyword: "marketing digital para dentistas", dna: { mode: "successor", fromVersionId: "v1", fromVersionNumber: 1 }, create: [{ keyword: "marketing para dentistas", normalizedKeyword: "marketing para dentistas", adsVolume: 210, level: "strong", sharedPageCount: 5, origins: ["ads_keyword_seed"], evidence: [], searchId: "op", existingKeywordId: null }] }),
      plano({ publishedKeywordId: "pub-o", keyword: "como atrair clientes para consultório", status: "unchanged", dna: { mode: "none", fromVersionId: "v2", fromVersionNumber: 2 } }),
      plano({ publishedKeywordId: "pub-x", keyword: "estratégia de negócios", status: "refused", refusal: "sem Silo", dna: { mode: "none", fromVersionId: null, fromVersionNumber: null }, lines: ["\"estratégia de negócios\": nada será gravado. sem Silo"] }),
    ],
  };
  const view = reinforcementPreviewView(previa);
  assert.equal(view.ready, 2);
  assert.equal(view.headline, `2 artigos publicados serão gravados: 1 ArticleDNA novo, 1 versão nova, 1 keyword do Minerador entra, 1 keyword nova passa pelo Minerador, 1 troca de principal. ${PUBLISHED_REINFORCEMENT_COST_LINE} URL, slug e canonical não mudam.`);
  assert.deepEqual(view.pages.map(page => page.statusLabel), ["Cria o ArticleDNA (v1)", "Nova versão (v2)", "Nada muda", "Não será gravado"]);
  assert.equal(view.confirmLabel, "Gravar e reler (2)");
  assert.match(view.approvalText ?? "", /você aprova estas keywords no Minerador/);
  assert.equal(PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX, "Eu aprovo estas keywords novas no Minerador.");
  assert.match(reinforcementPreviewView({ ...previa, pages: [previa.pages[2]] }).headline, /^Nada a gravar/);

  const linhas = reinforcementOutcomeLines({ pages: [
    { publishedKeywordId: "pub-c", keyword: "como atrair pacientes para clínica", written: true, versionNumber: 1, added: 1, created: 0, swapApplied: true, error: null },
    { publishedKeywordId: "pub-d", keyword: "marketing digital para dentistas", written: false, versionNumber: null, added: 0, created: 0, swapApplied: false, error: "o Volume do Google Ads não foi medido: cota", partial: ["1 keyword(s) importada(s) no Minerador (\"marketing para dentistas\")", "a Lógica delas"] },
    { publishedKeywordId: "pub-e", keyword: "captação de pacientes", written: false, versionNumber: null, added: 0, created: 0, swapApplied: false, error: null, partial: ["o Volume do Google Ads delas"], leftOut: [{ keyword: "captar pacientes", reason: "o Google Ads não confirmou volume: ficou no Minerador, fora do artigo" }] },
  ], notAttempted: [{ publishedKeywordId: "pub-z", keyword: "crescimento de clínicas" }] });
  assert.deepEqual(linhas, [
    "\"como atrair pacientes para clínica\": gravado e relido — ArticleDNA v1, 1 keyword do Minerador, troca da principal.",
    "\"marketing digital para dentistas\": ArticleDNA não gravado (o Volume do Google Ads não foi medido: cota). Já ficou gravado: 1 keyword(s) importada(s) no Minerador (\"marketing para dentistas\"); a Lógica delas.",
    "\"captação de pacientes\": o ArticleDNA não mudou. Já ficou gravado: o Volume do Google Ads delas. Ficaram de fora: \"captar pacientes\" (o Google Ads não confirmou volume: ficou no Minerador, fora do artigo).",
    "\"crescimento de clínicas\": não tentado (a gravação parou antes). Nada foi gravado nele.",
  ]);
});

test("erros: o código vira frase curta que diz que nada foi gravado/pago; pedido recusado traz o motivo do servidor", () => {
  assert.match(reinforcementErrorMessage(409, { code: "PREVIEW_CHANGED" }), /confira a prévia nova antes de gravar\. Nada foi gravado\./);
  assert.match(reinforcementErrorMessage(422, { code: "HUMAN_APPROVAL_REQUIRED" }), /aprova no Minerador|as aprova no Minerador/);
  assert.match(reinforcementErrorMessage(422, { code: "REINFORCEMENT_PLAN_ABOVE_CAP" }), /teto de US\$ 1,00\. Nada foi pago\./);
  assert.equal(
    reinforcementErrorMessage(400, { code: "INVALID_REINFORCEMENT_REQUEST", error: "Pedido do Reforçar publicados inválido. Nada foi gravado.", issues: { formErrors: [], fieldErrors: { pages: ["Cada keyword vai para um artigo só nesta confirmação: kw-a."] } } }),
    "Pedido do Reforçar publicados inválido. Nada foi gravado. Cada keyword vai para um artigo só nesta confirmação: kw-a.",
  );
  assert.equal(reinforcementErrorMessage(0, null), "Sem resposta do servidor. Nada foi gravado.");
});

/* ============================ 4. a busca em lote ============================ */

const pagina = (keywordId: string, keyword: string, slug: string): DifferentiationPage => ({
  keywordId, keyword, url: `https://www.adalbapro.com.br/${slug}/`, canonical: null, slug, post: "locked", volume: null, volumeValidated: false,
  intent: null, entity: null, problem: null, articleId: null, articleKeywordCount: null,
});

const SEM_PAR = [
  ["marketing para harmonização facial", "marketing-harmonizacao-facial"], ["estratégia de negócios para clínicas", "estrategia-negocios-clinicas"],
  ["instagram não traz pacientes", "instagram-nao-traz-pacientes"], ["captação de pacientes sem tráfego pago", "captacao-sem-trafego-pago"],
  ["crescimento de clínicas", "crescimento-de-clinicas"], ["leads sem tráfego pago", "leads-sem-trafego-pago"],
  ["plano de marketing para estética", "plano-marketing-estetica"], ["plano de marketing estética 2026", "plano-marketing-estetica-2026"],
  ["atrair clientes estética", "atrair-clientes-estetica"], ["captar clientes estética", "captar-clientes-estetica"],
  ["agência de marketing para estética", "agencia-marketing-estetica"], ["campanhas para estética", "campanhas-estetica"],
  ["modelos de post para estética", "modelos-post-estetica"], ["promoções para estética", "promocoes-para-estetica"],
] as const;

test("busca em lote dos 14 sem par: prévia com a faixa de custo dentro do teto de US$ 1,00, uma confirmação, e o corpo pago leva o hash e o custo confirmados", async () => {
  const pages = SEM_PAR.map(([keyword, slug], indice) => pagina(`pub-${indice}`, keyword, slug));
  const plan = await buildReinforcementSearchPlan({ brandId: "marca-1", searchId: "rs-0123456789abcdef", pages });
  assert.ok(plan.withinCap && plan.costRange.maxUsd <= REINFORCEMENT_MAX_COST_USD, `até US$ 1,00 (foi ${plan.costRange.maxUsd})`);
  const dados: ReinforcementSearchPlanData = { mode: "plan", searchId: plan.searchId, plan, run: null, differentiation: [{ groupId: "g1", keywordIds: ["x", "y"], keywords: ["a", "b"], message: "Disputam o mesmo assunto entre si: use \"Diferenciar publicados\" (\"a\", \"b\")." }] };
  const confirmacao = searchConfirmLines(dados);
  assert.equal(confirmacao.blockedReason, null);
  assert.match(confirmacao.lines[0], /^14 publicados nesta rodada: "marketing para harmonização facial"/);
  assert.match(confirmacao.lines[1], /^Custo: US\$ 0,00 a 0,\d\d \(teto de US\$ 1,00 por rodada, conferido no servidor\)\. Cache válido não cobra\.$/);
  assert.ok(confirmacao.lines.some(item => /use "Diferenciar publicados"/.test(item)), "os que disputam entre si vão à diferenciação");
  assert.match(confirmacao.lines.at(-1) ?? "", /Nada é gravado nos artigos: as sugestões caem na tabela "Reforçar publicados", na linha de cada publicado\. Para gravar, marque e use "Gravar reforços"\./);
  assert.match(confirmacao.confirmLabel, /^Confirmar US\$ 0,00 a 0,\d\d$/);
  assert.equal(searchActionLabel(), `${REINFORCEMENT_SEARCH_ACTION_LABEL} (até US$ 1,00)`);
  const corpo = searchRunRequest({ brandId: "marca-1", searchId: plan.searchId, plan, operationRequestId: "00000000-0000-4000-8000-000000000001" });
  assert.equal(corpo.authorizedPlan.planHash, plan.planHash);
  assert.ok(corpo.authorizedPlan.maxCostUsd > 0 && corpo.authorizedPlan.maxCostUsd <= 1);
  assert.equal(searchConfirmLines({ ...dados, plan: null, message: "Nenhum publicado." }).blockedReason, "Nenhum publicado.");
});

test("os 'Sem par no lote' numa linha só; quem a busca achou volta a ser cartão com as keywords (Forte marcada); quem ficou sem nada fica na linha com o motivo", () => {
  const { dentistas, semPar, assunto } = cartoesDoLote();
  const outros = SEM_PAR.slice(0, 3).map(([keyword], indice) => serpSubjectCardView(diagnostico({ anchorKeywordId: `sp-${indice}`, anchorLabel: keyword, state: "no_pair_in_batch" }), { post: "locked", articleKeywordIds: null }));
  const cards = [dentistas, semPar, assunto, ...outros];
  const antes = noPairLineView(cards, new Map());
  assert.deepEqual(antes.pageIds, ["pub-s", "sp-0", "sp-1", "sp-2"], "só publicados; o Assunto sem par segue com 'Buscar reforço'");
  assert.equal(antes.headline, "4 publicados sem par no lote: nenhuma keyword deste lote trata do mesmo assunto no Google.");
  assert.equal(antes.names, "\"crescimento de clínicas\", \"marketing para harmonização facial\", \"estratégia de negócios para clínicas\", \"instagram não traz pacientes\"");

  const achado: ReinforcementPageResult = { keywordId: "pub-s", keyword: "crescimento de clínicas", url: null, state: "found", reason: "", slotsLeft: 5, measured: 5, suggestions: [
    { candidateId: "cand:a", keyword: "como crescer uma clínica", normalizedKeyword: "como crescer uma clinica", adsVolume: 90, level: "strong", sharedPageCount: 4, reason: "4 páginas em comum no top 10", existingKeywordId: null, origins: ["ads_url_seed"], evidence: [], preselected: true },
    { candidateId: "cand:b", keyword: "gestão de clínica", normalizedKeyword: "gestao de clinica", adsVolume: 50, level: "probable", sharedPageCount: 2, reason: "2 páginas e palavras em comum no top 10", existingKeywordId: "kw-77", origins: ["ads_keyword_seed"], evidence: [], preselected: false },
  ] };
  const vazio: ReinforcementPageResult = { keywordId: "sp-0", keyword: SEM_PAR[0][0], url: null, state: "none", reason: "5 candidata(s) com volume foram medidas na SERP, e nenhuma divide 2 ou mais páginas com o artigo: o Google trata como outro assunto.", slotsLeft: 5, measured: 5, suggestions: [] };
  const depois = noPairLineView(cards, new Map([["pub-s", achado], ["sp-0", vazio]]));
  // O cartão devolvido pela busca não se contradiz: diz o que achou e não oferece "Buscar reforço".
  const devolvido = cardWithBatchSearch(semPar, achado);
  assert.equal(devolvido.headline, "A busca em lote achou 2 keywords com volume (1 Forte, 1 Provável): marque na tabela e grave com \"Gravar reforços\".");
  assert.ok(!devolvido.actions.some(action => action.kind === "search_reinforcement"));
  assert.ok(semPar.actions.some(action => action.kind === "search_reinforcement"), "sem resultado, o cartão fica como estava");
  assert.equal(cardWithBatchSearch(semPar, vazio), semPar);
  assert.deepEqual(depois.found, ["pub-s"]);
  assert.equal(depois.headline, "3 publicados sem par no lote: nenhuma keyword deste lote trata do mesmo assunto no Google.");
  assert.deepEqual(depois.without, [{ keyword: SEM_PAR[0][0], reason: vazio.reason }]);
  assert.deepEqual(defaultSearchPicks(achado), ["como crescer uma clínica"], "Forte marcada, Provável desmarcada");
  assert.deepEqual(searchSuggestionViews(achado).map(item => [item.levelLabel, item.detail]), [
    ["Forte", "volume 90 (Google Ads) · 4 páginas em comum no top 10 · nova no Minerador"],
    ["Provável", "volume 50 (Google Ads) · 2 páginas e palavras em comum no top 10"],
  ]);
});

/* ======================= 4b. a tabela única (pedido do dono) ======================= */

/*
 * "Não notei nenhuma diferença, e não está claro como reforçar": só as Forte do
 * mesmo Silo vinham marcadas e o resto pedia caixinhas espalhadas. A tabela:
 * uma linha por publicado e Assunto, Forte de QUALQUER Silo marcada, Provável
 * desmarcada, cada keyword num publicado só (o de mais páginas), volume somado
 * antes → depois, e depois de gravar o total novo de cada artigo.
 */
const deOutroSilo = (keywordId: string, keyword: string, emArtigo: string | null = null) => ({
  ...sugestao(keywordId, keyword, "strong", false), volume: 30, sharedPageCount: 4, reason: "4 páginas em comum no top 10",
  where: "other_silo" as const, whereLabel: "Silo \"Leads\"", siloRef: "silo-2", siloLabel: "Leads", inArticlePrincipalKeywordId: emArtigo,
});

const KEYWORDS: Record<string, { keyword: string; volume: number | null }> = {
  "pub-c": { keyword: "como atrair pacientes para clínica", volume: 10 },
  "pub-o": { keyword: "como atrair clientes para consultório", volume: 40 },
  "kw-a": { keyword: "como atrair pacientes", volume: 20 },
  "kw-b": { keyword: "como atrair mais pacientes", volume: 20 },
  "kw-x": { keyword: "captação de pacientes sem anúncio", volume: 30 },
  "kw-y": { keyword: "atrair pacientes particulares", volume: 30 },
  "kw-t": { keyword: "como atrair pacientes", volume: 20 },
};
const keywordOf = (id: string) => KEYWORDS[id] ?? null;

function loteDaTabela() {
  const clinica = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: KEYWORDS["pub-c"].keyword, state: "suggestions_available", slotsLeft: 5, suggestions: [
    sugestao("kw-a", KEYWORDS["kw-a"].keyword, "strong", true),
    sugestao("kw-b", KEYWORDS["kw-b"].keyword, "probable", false),
    deOutroSilo("kw-x", KEYWORDS["kw-x"].keyword),
    deOutroSilo("kw-y", KEYWORDS["kw-y"].keyword, "pub-outro"),
  ] }), { post: "locked", articleKeywordIds: new Set(["pub-c"]), articlePrincipalKeywordId: "pub-c" });
  // "como atrair pacientes" também é Forte no consultório, mas com 5 páginas (7 na clínica).
  const consultorio = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-o", anchorLabel: KEYWORDS["pub-o"].keyword, state: "suggestions_available", suggestions: [
    { ...sugestao("kw-a", KEYWORDS["kw-a"].keyword, "strong", true), sharedPageCount: 5 },
  ] }), { post: "locked", articleKeywordIds: null });
  const assunto = serpSubjectCardView(diagnostico({ kind: "subject", anchorKeywordId: "assunto-1", anchorLabel: "estética", state: "suggestions_available", suggestions: [
    sugestao("kw-e", "marketing para estética", "strong", true), sugestao("kw-f", "clínica de estética", "probable", false),
  ] }), {});
  return { clinica, consultorio, assunto, cards: [clinica, consultorio, assunto] };
}

function linhasDe(cards: SerpSubjectCardView[], extra: { results?: Map<string, ReinforcementPageResult>; written?: Set<string>; swaps?: Set<string>; picks?: Map<string, Set<string>> } = {}) {
  const owners = reinforcementSuggestionOwners(cards, extra.results);
  return reinforcementTableRows({
    cards,
    results: extra.results,
    keywordOf,
    suggestionPicksOf: card => extra.picks?.get(card.key) ?? reinforcementDefaultPicks(card, owners),
    searchPicksOf: id => reinforcementDefaultSearchPicks(id, extra.results?.get(id), owners),
    swapAccepted: id => Boolean(extra.swaps?.has(id)),
    writtenPageIds: extra.written,
    owners,
  });
}

test("tabela: Forte de qualquer Silo vem marcada, Provável desmarcada, Forte que já está em outro artigo não; cada keyword aparece num publicado só (o de mais páginas)", () => {
  const { clinica, consultorio, cards } = loteDaTabela();
  const owners = reinforcementSuggestionOwners(cards);
  assert.equal(owners.get("kw-a"), "pub-c", "7 páginas na clínica contra 5 no consultório");
  assert.deepEqual([...reinforcementDefaultPicks(clinica, owners)].sort(), ["kw-a", "kw-x"], "Forte do mesmo Silo e Forte de outro Silo fora de artigo");
  assert.deepEqual([...reinforcementDefaultPicks(consultorio, owners)], [], "a keyword ficou com a clínica");
  const [linhaClinica, linhaConsultorio, linhaAssunto] = linhasDe(cards);
  assert.deepEqual(linhaClinica.suggestions.map(item => [item.keyword, item.levelLabel, item.checked, item.siloLabel, item.changesSilo]), [
    ["como atrair pacientes", "Forte", true, "Captação", false],
    ["como atrair mais pacientes", "Provável", false, "Captação", false],
    ["captação de pacientes sem anúncio", "Forte", true, "Leads", true],
    ["atrair pacientes particulares", "Forte", false, "Leads", true],
  ]);
  assert.equal(linhaClinica.suggestions[2].detail, "volume 30 · 4 páginas em comum · Silo \"Leads\" (muda para o deste artigo)");
  assert.equal(linhaClinica.suggestions[0].detail, "volume 20 · 7 páginas em comum · Silo \"Captação\"");
  assert.deepEqual(linhaConsultorio.suggestions, [], "a mesma keyword não aparece em dois publicados");
  assert.equal(linhaConsultorio.emptyReason, "\"como atrair pacientes\" está na linha de \"como atrair pacientes para clínica\" (mais páginas em comum): cada keyword vai para um artigo só.");
  // O Assunto segue a marcação do domínio e aplica pelo caminho dele.
  assert.deepEqual(linhaAssunto.subjectPicks, ["kw-e"]);
  assert.equal(linhaAssunto.pending, false, "Assunto não entra no \"Gravar reforços\"");
  assert.equal(linhaAssunto.status.label, linhaAssunto.card.stateLabel);
  // O pedido do "Gravar reforços" sai das mesmas marcações: a clínica leva as duas, o consultório só o primeiro DNA.
  const pedido = buildReinforcementRequest({ cards, suggestionPicks: card => reinforcementDefaultPicks(card, owners), searchPicks: () => [], swapPicks: new Set() });
  assert.deepEqual(pedido.reassigned, [], "nada a redistribuir: a tabela já dividiu");
  assert.deepEqual(pedido.pages.map(page => [page.publishedKeywordId, page.keywordIds]), [["pub-c", ["kw-a", "kw-x"]], ["pub-o", []]]);
  // "Gravar reforços" manda também o já gravado sem nada marcado (depois de quem tem algo): o servidor diz se falta
  // alinhar a troca já confirmada ou levar o parecer da composição; sem a opção, o pedido continua como antes.
  const gravado = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-g", anchorLabel: "captação de pacientes", state: "reinforced", members: [
    { keywordId: "pub-g", keyword: "captação de pacientes", basis: "anchor", sharedPageCount: null, reason: "" }, membro("kw-9", "como captar pacientes"),
  ] }), { post: "free", articleKeywordIds: new Set(["pub-g", "kw-9"]) });
  const comGravado = buildReinforcementRequest({ cards: [gravado, ...cards], suggestionPicks: card => reinforcementDefaultPicks(card, owners), searchPicks: () => [], swapPicks: new Set(), includeRecorded: true });
  assert.deepEqual(comGravado.pages.map(page => [page.publishedKeywordId, page.keywordIds]), [["pub-c", ["kw-a", "kw-x"]], ["pub-o", []], ["pub-g", ["kw-9"]]], "o sem ArticleDNA também tem o que gravar; o já gravado vai por último");
  assert.ok(!buildReinforcementRequest({ cards: [gravado, ...cards], suggestionPicks: card => reinforcementDefaultPicks(card, owners), searchPicks: () => [], swapPicks: new Set() }).pages.some(page => page.publishedKeywordId === "pub-g"));
  assert.equal(REINFORCE_PUBLISHED_SAVE_LABEL, PUBLISHED_REINFORCEMENT_SAVE_LABEL, "o mesmo nome no detalhe e na tabela");
  assert.equal(PUBLISHED_REINFORCEMENT_SAVE_LABEL, "Gravar reforços");
  assert.equal(PUBLISHED_REINFORCEMENT_TABLE_LINE, "Reforço só vale com keywords do mesmo assunto no Google; keywords de volume alto de outro assunto viram artigo novo em Sobras.");
});

test("tabela: principal atual com volume, volume somado antes → depois, teto de 6, estado e o que a confirmação acrescenta (mudança de Silo e total)", () => {
  const { cards } = loteDaTabela();
  const [clinica, consultorio] = linhasDe(cards);
  assert.deepEqual(clinica.principal, { keyword: "como atrair pacientes para clínica", volumeLabel: "volume 10" });
  assert.equal(clinica.pageNote, null);
  assert.equal(clinica.keywordsChangeLabel, "1 → 3 keywords");
  assert.equal(clinica.volumeChangeLabel, "volume 10 → 60");
  assert.deepEqual(clinica.status, { label: "Grava +2", tone: "info" });
  assert.equal(clinica.pending, true);
  assert.deepEqual(clinica.confirmLines, [
    "\"captação de pacientes sem anúncio\" muda do Silo \"Leads\" para o Silo \"Captação\" deste publicado.",
    "Pela tabela, o artigo fica com 3 keywords (eram 1), volume somado 10 → 60; as recusadas acima, com o motivo, ficam de fora.",
  ]);
  assert.deepEqual(consultorio.status, { label: "Cria o ArticleDNA", tone: "info" }, "sem ArticleDNA: grava o primeiro");
  assert.equal(consultorio.keywordsChangeLabel, "1 → 1 keywords");
  assert.equal(reinforcementTableSummary(linhasDe(cards)), `2 artigos publicados com algo a gravar (2 keywords entram, 1 ganha o primeiro ArticleDNA). A confirmação mostra, por artigo, o que muda. ${PUBLISHED_REINFORCEMENT_COST_LINE}`);
  // Marcar demais passa do teto: a linha avisa antes da confirmação (o servidor recusa acima de 6).
  const cheio = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: "como atrair pacientes para clínica", state: "suggestions_available", slotsLeft: 1, suggestions: [
    sugestao("kw-a", "como atrair pacientes", "strong", true), sugestao("kw-b", "como atrair mais pacientes", "probable", false),
  ] }), { post: "locked", articleKeywordIds: new Set(["pub-c", "m1", "m2", "m3", "m4"]) });
  const [cheia] = linhasDe([cheio], { picks: new Map([[cheio.key, new Set(["kw-a", "kw-b"])]]) });
  assert.equal(cheia.capWarning, "Passa do teto de 6: desmarque 1.");
  assert.deepEqual([...reinforcementDefaultPicks(cheio)], ["kw-a"], "a pré-marcação respeita as vagas");
  // Troca aceita: entra a substituta e o estado diz a troca; sem aceitar, nada muda na principal.
  const troca = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-t", anchorLabel: "como atrair pacientes para clínica", state: "swap_proposed", swap: trocaProposta("pub-t", "como atrair pacientes para clínica", "kw-t", "como atrair pacientes") }), { post: "free", swapReadiness: { ready: false, reason: "x", viaReinforcement: true }, articleKeywordIds: new Set(["pub-t"]) });
  const [semAceite] = linhasDe([troca]);
  assert.deepEqual(semAceite.swap, { keyword: "como atrair pacientes", detail: "volume 20", accepted: false }, "a troca é opt-in");
  assert.equal(semAceite.pending, false);
  const [aceita] = linhasDe([troca], { swaps: new Set(["pub-t"]) });
  assert.deepEqual(aceita.status, { label: "Grava +1 e troca a principal", tone: "info" });
  assert.equal(aceita.keywordsChangeLabel, "1 → 2 keywords");
});

test("tabela depois de gravar: a linha mostra o total novo do ArticleDNA relido, fica visível no filtro padrão, e a troca aplicada mostra a página", () => {
  // A releitura: o ArticleDNA da clínica agora tem as 3, a principal é a nova e a página continua a mesma.
  const gravada = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: "como atrair pacientes para clínica", members: [
    { keywordId: "pub-c", keyword: "como atrair pacientes para clínica", basis: "anchor", sharedPageCount: null, reason: "" },
    membro("kw-a", "como atrair pacientes"), membro("kw-x", "captação de pacientes sem anúncio"),
  ] }), { post: "free", articleKeywordIds: new Set(["pub-c", "kw-a", "kw-x"]), articlePrincipalKeywordId: "kw-a" });
  const outro = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-o", anchorLabel: "como atrair clientes para consultório", state: "suggestions_available", suggestions: [sugestao("kw-b", "como atrair mais pacientes", "strong", true)] }), { post: "locked", articleKeywordIds: new Set(["pub-o"]) });
  const semNada = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-s", anchorLabel: "crescimento de clínicas", state: "no_pair_in_batch" }), { post: "locked", articleKeywordIds: new Set(["pub-s"]) });
  const linhas = linhasDe([semNada, gravada, outro], { written: new Set(["pub-c"]) });
  const clinica = linhas.find(row => row.anchorKeywordId === "pub-c")!;
  assert.deepEqual(clinica.status, { label: "Gravado e relido agora", tone: "success" });
  // Corretor 2026-09-28: depois de gravar, a célula mostra o total NOVO, não "3 → 3".
  assert.equal(clinica.keywordsChangeLabel, "3 keywords (gravado agora)");
  assert.equal(clinica.volumeChangeLabel, "volume 60");
  assert.equal(clinica.totalsLabel, "3 keywords · volume 60 (gravado agora)");
  assert.equal(clinica.pending, false);
  assert.deepEqual(clinica.principal, { keyword: "como atrair pacientes", volumeLabel: "volume 20" });
  assert.equal(clinica.pageNote, "Página: \"como atrair pacientes para clínica\" (URL, slug e canonical dela)");
  assert.ok(reinforcementRowNeedsAttention(clinica), "a linha gravada agora continua no filtro padrão");
  assert.deepEqual(sortReinforcementRows(linhas).map(row => row.anchorKeywordId), ["pub-o", "pub-c", "pub-s"], "primeiro o que falta gravar, depois o gravado agora, depois o resto");
  const semPar = linhas.find(row => row.anchorKeywordId === "pub-s")!;
  assert.match(semPar.emptyReason ?? "", /^Sem par no lote: nenhuma keyword deste lote trata do mesmo assunto no Google\. Use a busca em lote acima\.$/);
  assert.deepEqual(semPar.status, { label: "Gravado no ArticleDNA", tone: "success" });
});

test("tabela com a busca em lote: as keywords da busca entram na linha do publicado (Forte marcada); erro do Google Ads fica como aviso, nunca como 'nada achado'", () => {
  const semPar = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-s", anchorLabel: "crescimento de clínicas", state: "no_pair_in_batch" }), { post: "locked", articleKeywordIds: null });
  const falhou = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-h", anchorLabel: "marketing para harmonização facial", state: "no_pair_in_batch" }), { post: "locked", articleKeywordIds: null });
  const achado: ReinforcementPageResult = { keywordId: "pub-s", keyword: "crescimento de clínicas", url: null, state: "found", reason: "", slotsLeft: 5, measured: 2, suggestions: [
    { candidateId: "cand:a", keyword: "como crescer uma clínica", normalizedKeyword: "como crescer uma clinica", adsVolume: 90, level: "strong", sharedPageCount: 4, reason: "4 páginas em comum no top 10", existingKeywordId: null, origins: ["ads_url_seed"], evidence: [], preselected: true },
    { candidateId: "cand:b", keyword: "gestão de clínica", normalizedKeyword: "gestao de clinica", adsVolume: 50, level: "probable", sharedPageCount: 2, reason: "2 páginas", existingKeywordId: "kw-77", origins: ["ads_keyword_seed"], evidence: [], preselected: false },
  ] };
  const erro: ReinforcementPageResult = { keywordId: "pub-h", keyword: "marketing para harmonização facial", url: null, state: "ads_error", reason: "Erro do Google Ads: invalid_grant. Nenhuma ideia veio para esta página; nada foi medido na SERP.", slotsLeft: 5, measured: 0, suggestions: [] };
  const results = new Map([["pub-s", achado], ["pub-h", erro]]);
  const [linhaSemPar, linhaErro] = linhasDe([semPar, falhou], { results });
  assert.deepEqual(linhaSemPar.suggestions.map(item => [item.keyword, item.source, item.checked, item.isNew]), [
    ["como crescer uma clínica", "busca", true, true],
    ["gestão de clínica", "busca", false, false],
  ]);
  assert.equal(linhaSemPar.suggestions[0].detail, "volume 90 (Google Ads) · 4 páginas em comum · busca em lote · nova no Minerador");
  assert.equal(linhaSemPar.volumeChangeLabel, "volume sem volume → 90", "sem medida não é 0; a nova conta pelo volume do Google Ads");
  assert.deepEqual(linhaSemPar.status, { label: "Cria o ArticleDNA com +1", tone: "info" });
  assert.equal(linhaErro.emptyIsError, true);
  assert.match(linhaErro.emptyReason ?? "", /^Erro do Google Ads: invalid_grant\./);
  assert.equal(linhaSemPar.emptyIsError, false);
});

/* ============================ 5. estrutura e fiação ============================ */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const painel = semComentarios(readFileSync("modules/arquiteto/published-reinforcement-panel.tsx", "utf8"));
const modelo = semComentarios(readFileSync("modules/arquiteto/published-reinforcement-model.ts", "utf8"));
const gancho = semComentarios(readFileSync("modules/arquiteto/use-published-reinforcement.ts", "utf8"));
const cartoes = semComentarios(readFileSync("modules/arquiteto/serp-subject-panels.tsx", "utf8"));
const workspace = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));

test("painel e modelo: sem rede, tokens, 14px+, diálogos com foco, keyword na cor dela, gravar e pagar só pela confirmação", () => {
  for (const fonte of [painel, modelo]) assert.doesNotMatch(fonte, /\bfetch\(|\/api\/|supabase|dataforseo\.com/i);
  for (const caminho of ["modules/arquiteto/published-reinforcement-panel.tsx", "modules/arquiteto/published-reinforcement-model.ts", "modules/arquiteto/use-published-reinforcement.ts", "modules/arquiteto/serp-subject-panels.tsx"]) {
    assert.deepEqual(findVisualViolations(readFileSync(caminho, "utf8")), [], caminho);
  }
  assert.doesNotMatch(painel, /\btext-xs\b|text-\[\d+px\]/);
  assert.equal((painel.match(/role="dialog"\s+aria-modal="true"/g) || []).length, 2, "a confirmação do Reforçar e a da busca paga");
  assert.match(painel, /useSubjectDialogFocus\(dialog\.open, dialogRef, controller\.closeReinforcement, !busy\)/);
  assert.match(painel, /useSubjectDialogFocus\(aberto, dialogRef, controller\.cancelSearch, !controller\.busy\)/);
  assert.match(painel, /text-keyword/);
  assert.equal((painel.match(/controller\.applyReinforcement\(/g) || []).length, 1, "gravar só no botão da confirmação");
  assert.equal((painel.match(/controller\.runSearchConfirmed\(/g) || []).length, 1, "pagar só no botão da confirmação do custo");
  assert.match(painel, /disabled=\{!podeGravar\}/);
  assert.match(painel, /const podeGravar = Boolean\(view && view\.ready > 0 && !busy && \(!precisaAceite \|\| aprovo\)\)/, "keyword nova exige o aceite do dono");
  assert.match(painel, /aprovadoPara === dialog\.data\.decisionHash/, "o aceite vale para a prévia vista");
  assert.match(painel, /Cancelar \(nada é pago\)/);
  assert.doesNotMatch(`${painel} ${modelo} ${cartoes}`, /conclua a formação|volte aqui/);
});

test("hook: as rotas do núcleo, hash e id novo ao gravar, prévia nova no 409, id novo por rodada paga, resultado pago relido e nunca refeito em silêncio", () => {
  assert.equal((gancho.match(/"\/api\/arquiteto\/published-reinforcement"/g) || []).length, 2, "prévia e gravar");
  assert.equal((gancho.match(/"\/api\/arquiteto\/published-reinforcement\/search\/plan"/g) || []).length, 3, "prévia, reler ao abrir e reler o gravado");
  assert.equal((gancho.match(/"\/api\/arquiteto\/published-reinforcement\/search\/run"/g) || []).length, 1);
  assert.match(gancho, /decisionHash: data\.decisionHash,\s+operationRequestId: crypto\.randomUUID\(\),/);
  assert.match(gancho, /result\.code === "PREVIEW_CHANGED" && result\.body\?\.preview/);
  assert.match(gancho, /await runOnce\(crypto\.randomUUID\(\)\)/);
  assert.match(gancho, /retryOperationId: !result\.responded \|\| result\.code === "OPERATION_IN_PROGRESS" \? operationRequestId : null/, "repetir só a MESMA rodada");
  assert.match(gancho, /result\.code === "REINFORCEMENT_RESULT_PENDING"[\s\S]{0,400}resume: true/);
  assert.match(gancho, /\.\.\.\(mode === "replace" \? \{ replaceResult: true \} : \{\}\)/, "nova rodada só por pedido explícito");
  // Corretor 2026-09-28: relê quando QUALQUER coisa foi gravada (ArticleDNA, ou só a mesa com o DNA adiado).
  assert.match(gancho, /const gravadas = result\.data\.pages\.filter\(page => page\.written \|\| Boolean\(page\.partial\?\.length\) \|\| Boolean\(page\.dnaDeferred\)\);/);
  assert.match(gancho, /if \(result\.data\.written \|\| gravadas\.length\) \{[\s\S]{0,400}onWritten\?\.\(\)/, "a mesa relê sempre que algo foi gravado");
  assert.match(gancho, /setDeferredPageIds\(new Map\(result\.data\.pages\.filter\(page => !page\.written && page\.dnaDeferred\)/);
  assert.doesNotMatch(gancho, /localStorage|indexedDB|sessionStorage/, "nada de estado canônico no navegador");
  assert.doesNotMatch(gancho, /authorizedPlan: \{/, "o corpo pago só sai do modelo, com o plano confirmado");
});

test("tabela única: o painel troca a grade de cartões pela tabela; o cartão vira o detalhe da linha; a Revisão do artigo continua com o cartão", () => {
  assert.match(cartoes, /const selecionadas = reinforcement \? reinforcement\.selected : selecaoLocal;/, "a Revisão do artigo usa a seleção do hook");
  assert.match(cartoes, /onClick=\{reinforcement\.onReinforce\}/);
  assert.match(cartoes, /\{reinforcement && !asDetail && \(/, "no detalhe da tabela, nenhum botão de gravar próprio");
  assert.match(cartoes, /\{card\.suggestions\.length > 0 && !asDetail && \(/, "no detalhe, as sugestões ficam só na tabela");
  assert.match(cartoes, /const \[open, setOpen\] = useState\(asDetail\);/, "o detalhe abre com a evidência");
  assert.match(cartoes, /await handlers\.onApplySuggestions\(card\.key, \[\.\.\.selecionadas\]\)/);
  assert.match(cartoes, /await handlers\.onApplySuggestions\(assuntoAplicando\.card\.key, assuntoAplicando\.keywordIds\)/, "o Assunto aplica pela mesma confirmação de antes");
  assert.match(cartoes, /<NoPairPublishedLine controller=\{reinforcement\} view=\{linhaSemPar\}/);
  assert.doesNotMatch(cartoes, /PublishedReinforcementBar|naLinha/, "a barra e a grade antigas saíram; os sem par ficam na tabela");
  assert.match(cartoes, /<PublishedReinforcementTable\s+controller=\{reinforcement\}\s+cards=\{cards\}\s+rows=\{linhasVisiveis\}\s+allRows=\{linhas\}/);
  assert.match(cartoes, /renderDetail=\{card => \(\s+<SerpSubjectCard\s+card=\{cardWithBatchSearch\(card, reinforcement\.results\.get\(card\.anchorKeywordId\)\)\}[\s\S]{0,400}asDetail/);
  assert.match(cartoes, /PEDEM_DECISAO\.has\(card\.state\) \|\| reinforcementNeedsAttention\(card\) \|\| Boolean\(linha && reinforcementRowNeedsAttention\(linha\)\)/, "a linha gravada agora continua visível no filtro padrão");
  assert.match(cartoes, /Mudar de Silo grava só o Silo: para pôr as keywords no artigo publicado, use a tabela/);
  assert.match(painel, /dialog\.notices\.map/);
  assert.doesNotMatch(gancho, /status: "failed", conflicts/, "keyword repetida não trava a confirmação");

  // A tabela: uma só, cinco colunas, caixinha com rótulo, gravar só pela confirmação.
  assert.equal((painel.match(/<table\b/g) || []).length, 1);
  assert.deepEqual([...painel.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map(item => item[1]), ["Publicado ou Assunto", "Principal atual", "Keywords sugeridas", "Volume somado", "Estado"]);
  assert.match(painel, /data-testid="architect-reinforcement-rule">\{PUBLISHED_REINFORCEMENT_TABLE_LINE\}/);
  assert.equal((painel.match(/controller\.openReinforcement\(/g) || []).length, 1, "um botão só abre a confirmação");
  assert.match(painel, /disabled=\{ocupado\} onClick=\{\(\) => void controller\.openReinforcement\(cards, \{ includeRecorded: true \}\)\}/, "o botão manda também os já gravados: o servidor diz se falta algo neles");
  assert.match(painel, /view\.pages\.filter\(page => page\.status !== "unchanged"\)/, "a confirmação agrupa os sem mudança numa linha");
  assert.match(gancho, /await openReinforcement\(cards, \{ only, swaps: trocas, includeRecorded: true \}\);/);
  assert.match(painel, /item\.source === "busca" \? controller\.toggleSearchPick\(row\.anchorKeywordId, item\.keyword\) : controller\.toggleSuggestion\(row\.card, item\.keywordId!\)/);
  assert.match(painel, /onChange=\{\(\) => controller\.toggleSwap\(row\.anchorKeywordId\)\}/, "a troca continua opt-in");
  assert.match(painel, /<label htmlFor=\{id\}/);
  assert.match(painel, /aria-expanded=\{open\} aria-controls=\{detalheId\}/);
  assert.match(painel, /\{open \? "Esconder a evidência" : "Ver a evidência"\}/);
  assert.match(painel, /overflow-x-auto/, "no celular a tabela rola na horizontal, a página não");
  assert.match(painel, /daTabela\.get\(page\.keywordId\)/, "a confirmação acrescenta a mudança de Silo e o total por artigo");
  assert.match(painel, /row\.emptyIsError \? "text-warning" : "text-text-muted"/, "erro do Google Ads é aviso na linha");

  // O hook: dono único por keyword, pré-marcação nova, e os publicados gravados agora.
  assert.match(gancho, /const owners = useMemo\(\(\) => reinforcementSuggestionOwners\(cards \|\| \[\], results\), \[cards, results\]\);/);
  assert.match(gancho, /return explicitas \? new Set\(explicitas\) : reinforcementDefaultPicks\(card, owners\);/);
  assert.match(gancho, /reinforcementDefaultSearchPicks\(pageId, results\.get\(pageId\), owners\)/);
  assert.match(gancho, /setWrittenPageIds\(new Set\(result\.data\.pages\.filter\(page => page\.written\)\.map\(page => page\.publishedKeywordId\)\)\);/);
  assert.doesNotMatch(gancho, /initialSuggestionSelection/);
});

test("fiação da mesa: o hook com a marca ativa, releitura depois de gravar, 'Aplicar troca' sem ArticleDNA abre o Reforçar, e a Revisão do artigo usa a mesma seleção", () => {
  assert.match(workspace, /const publishedReinforcement = usePublishedReinforcement\(\{\s+brandId: selectedBrandId,/);
  assert.match(workspace, /onWritten: \(\) => \{\s+setCanonicalWorkspaceReload\(current => current \+ 1\);\s+setSerpSubjectReload\(current => current \+ 1\);/);
  assert.match(workspace, /aplicar\.viaReinforcement\) \{\s+void publishedReinforcement\.openReinforcement\(serpSubjectCards, \{ only: new Set\(\[anchorKeywordId\]\), acceptSwapOf: anchorKeywordId \}\);/);
  assert.match(workspace, /reinforcement=\{publishedReinforcement\}/);
  assert.match(workspace, /reinforcement=\{cardReinforcementOf\(publishedReinforcement, card, serpSubjectCards\)\}/);
  assert.match(workspace, /articleKeywordIds: vigente \? new Set\(vigente\.keywordReferences\.map/);
  assert.match(workspace, /articlePrincipalKeywordId: vigente \? String\(vigente\.principalKeywordId\) : null/);
  assert.match(workspace, /noPairPageIds: serpSubjectNoPairIds,\s+cards: serpSubjectCards,/, "o hook conhece os cartões: dono único e pré-marcação");
  assert.match(workspace, /reinforcement=\{publishedReinforcement\}\s+keywordOf=\{serpSubjectKeywordOf\}/);
  assert.doesNotMatch(workspace, /ARTICLES_PROCESSED|formatArticleRunReadout\(/, "a notificação não mostra os códigos do §4");
  assert.match(workspace, /showNotification\(allintitle\.tone, allintitle\.message\)/);
  assert.doesNotMatch(workspace, /conclua a formação|volte aqui/);
  const diferenciacao = semComentarios(readFileSync("lib/arquiteto/published-differentiation-apply.ts", "utf8"));
  assert.doesNotMatch(diferenciacao, /conclua a formação/);
  assert.match(diferenciacao, /use \\"Reforçar publicados\\"/);
});

test("catálogo das IAs fala os rótulos da tela (AGENTS §17.1)", () => {
  const reforco = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.published_reinforcement")!;
  const busca = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.published_reinforcement_search")!;
  for (const rotulo of [`'${PUBLISHED_REINFORCEMENT_ACTION_LABEL}'`, `'${PUBLISHED_REINFORCEMENT_SAVE_LABEL} (N)'`, "'Reforçar este publicado'", "'Aceitar a troca'", `'${PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX}'`, "'Gravar e reler (N)'"]) {
    assert.ok(reforco.howOnScreen.includes(rotulo), rotulo);
  }
  for (const rotulo of [`'${searchActionLabel()}'`, "'Cancelar (nada é pago)'", "'Nova busca (outra rodada paga, com prévia)'"]) {
    assert.ok(busca.howOnScreen.includes(rotulo), rotulo);
  }
  const dilemas = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.serp_subject_dilemmas")!;
  for (const rotulo of ["'Publicado ou Assunto'", "'Principal atual'", "'Keywords sugeridas'", "'Volume somado'", "'Estado'", "'Ver a evidência'", "'Aplicar no Assunto (N)'", "'Gravado e relido agora'", `'${PUBLISHED_REINFORCEMENT_TABLE_LINE}'`]) {
    assert.ok(dilemas.howOnScreen.includes(rotulo), rotulo);
  }
  assert.equal(chamadasDeRede, 0);
});

/* ================= corretor de 2026-09-28: os achados da revisão da tela ================= */

test("Corretor: 'Mesa gravada · falta o ArticleDNA' — a linha adiada diz a verdade, não conta no botão e continua no filtro", () => {
  // A mesa foi relida depois da confirmação: "como atrair pacientes" já está na formação; o ArticleDNA ainda não a tem.
  const diag = diagnostico({ anchorKeywordId: "pub-c", anchorLabel: KEYWORDS["pub-c"].keyword, members: [
    { keywordId: "pub-c", keyword: KEYWORDS["pub-c"].keyword, basis: "anchor", sharedPageCount: null, reason: "" },
    membro("kw-a", KEYWORDS["kw-a"].keyword),
  ] });
  const gravadaNaMesa = serpSubjectCardView(diag, { post: "free", articleKeywordIds: new Set(["pub-c"]), articlePrincipalKeywordId: "pub-c", formationRecorded: true });
  assert.equal(gravadaNaMesa.formationRecorded, true);
  assert.equal(gravadaNaMesa.recordedInArticle, false);
  const [linha] = linhasDe([gravadaNaMesa]);
  assert.deepEqual(linha.status, { label: "Mesa gravada · falta o ArticleDNA", tone: "warning" });
  assert.equal(linha.pending, false, "clicar de novo sem o Processar adiaria de novo: não conta no botão");
  assert.match(String(linha.statusNote), /Próximo passo: "Processar artigos" \(cache primeiro, sem custo quando as 4 lentes estão no cache\) e "Gravar reforços" de novo/);
  assert.ok(reinforcementRowNeedsAttention(linha), "continua no filtro \"Pedem decisão\"");
  assert.equal(reinforcementTableSummary([linha]), "Nada marcado. O botão também confere se falta algo nos artigos já gravados. Custo: zero.");
  // O botão ainda leva o publicado ao servidor, que grava o ArticleDNA quando o parecer desta composição existir.
  const pedidoDoBotao = buildReinforcementRequest({ cards: [gravadaNaMesa], suggestionPicks: () => new Set(), searchPicks: () => [], swapPicks: new Set(), includeRecorded: true });
  assert.deepEqual(pedidoDoBotao.pages.map(page => page.publishedKeywordId), ["pub-c"]);

  // Pelo desfecho do servidor (sem a formação conhecida): o motivo dele aparece na linha.
  const semFormacao = serpSubjectCardView(diag, { post: "free", articleKeywordIds: new Set(["pub-c"]), articlePrincipalKeywordId: "pub-c" });
  const [adiada] = reinforcementTableRows({
    cards: [semFormacao], keywordOf, suggestionPicksOf: () => new Set(), searchPicksOf: () => [], swapAccepted: () => false,
    deferredPageIds: new Map([["pub-c", "Entram keywords novas: o parecer da SERP gravado não as confrontou."]]),
  });
  assert.equal(adiada.status.label, "Mesa gravada · falta o ArticleDNA");
  assert.match(String(adiada.statusNote), /^Entram keywords novas: o parecer da SERP gravado não as confrontou\. A composição já está gravada na mesa/);
  // Sem a formação gravada e sem desfecho: é a proposta da lógica, que o Reforçar grava.
  assert.equal(linhasDe([semFormacao])[0].status.label, "Grava +1");
});

test("Corretor: troca aplicada que contradiz o slug — o cartão avisa e oferece a que cabe no slug (nunca 'Troca aplicada' em verde)", () => {
  const nomes: Record<string, string> = { "pub-c": KEYWORDS["pub-c"].keyword, "kw-cons": "como atrair pacientes para o consultório", "kw-a": KEYWORDS["kw-a"].keyword };
  const proposta = {
    state: "proposed", publishedKeywordId: "pub-c", publishedKeyword: nomes["pub-c"], post: "free",
    substitute: { keywordId: "kw-a", keyword: nomes["kw-a"], volume: 20, sharedPageCount: 7, overlap: { strength: "strong", sharedPageCount: 7 }, reason: "", warning: null, level: "strong", slugFit: "fits" },
    alternatives: [], rejected: [], protectedIdentity: { url: null, canonical: null, slug: null }, previousPrimaryBecomes: "secundaria", candidates: [], decision: null, requiresHumanDecision: true, note: "",
  };
  const contexto = (selecionada: string) => ({
    post: "free" as const,
    pageUrl: "https://adalbapro.com.br/captacao-de-pacientes/como-atrair-pacientes-para-clinica",
    appliedSwap: { previousKeywordId: "pub-c", selectedKeywordId: selecionada, decidedAt: "2026-09-28T22:52:00.000Z", actorId: "ator" },
    articleKeywordIds: new Set(["pub-c", selecionada]), articlePrincipalKeywordId: selecionada,
    nameOf: (id: string) => nomes[id] ?? id,
  });
  const errada = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: nomes["pub-c"], state: "swap_proposed", swap: proposta as never }), contexto("kw-cons"));
  assert.equal(errada.tone, "warning");
  assert.equal(errada.state, "swap_applied");
  assert.match(errada.headline, /A principal atual, "como atrair pacientes para o consultório", não combina com o slug publicado "como-atrair-pacientes-para-clinica": troca a entidade do slug/);
  assert.match(errada.headline, /A que cabe no slug é "como atrair pacientes" \(volume 20, 7 páginas em comum\): marque "Aceitar a troca" na tabela/);
  assert.deepEqual(errada.swapSubstitute, { keywordId: "kw-a", keyword: "como atrair pacientes" });
  // Na tabela: a caixinha da troca aparece (opt-in, desmarcada) e a linha diz a página.
  const [linha] = linhasDe([errada]);
  assert.equal(linha.swap?.accepted, false, "nada vem marcado por padrão");
  assert.equal(linha.pageNote, "Página: \"como atrair pacientes para clínica\" (URL, slug e canonical dela)");
  const [aceita] = linhasDe([errada], { swaps: new Set(["pub-c"]) });
  assert.match(aceita.status.label, /troca a principal/);

  // A troca que cabe no slug continua sendo "Troca aplicada" em verde, sem nova sugestão.
  const certa = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: nomes["pub-c"], state: "swap_proposed", swap: proposta as never }), contexto("kw-a"));
  assert.equal(certa.tone, "success");
  assert.match(certa.headline, /^Troca aplicada: "como atrair pacientes" é a principal/);
  assert.equal(certa.swapSubstitute, null);
});
