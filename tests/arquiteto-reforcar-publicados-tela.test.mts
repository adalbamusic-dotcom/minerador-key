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
  describeSerpSubjectBatchOutcome,
  publishedSwapReadiness,
  serpSubjectBatchChoices,
  serpSubjectCardView,
  type SerpSubjectCardView,
} from "../modules/arquiteto/serp-subject-model.ts";
import {
  PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX,
  PUBLISHED_REINFORCEMENT_COST_LINE,
  buildReinforcementRequest,
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
  assert.equal(saida.message, "21 artigos analisados pelo cache, sem custo. Nada foi gravado ainda. Para gravar os 21 publicados: \"Reforçar publicados\" (no painel \"Mesmo assunto no Google\", acima dos cartões).");
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
  assert.match(saida.message, /Para gravar o publicado: "Reforçar publicados" \(no painel "Mesmo assunto no Google", acima dos cartões\); o artigo novo: "Concluir formação"\./);
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
  assert.match(cartao.subline ?? "", /sem ArticleDNA ainda: "Reforçar publicados" grava/);
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
  assert.match(semGravar.subline ?? "", /proposta ainda não gravada: "Reforçar publicados" grava/);
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
  assert.match(confirmacao.lines.at(-1) ?? "", /Nada é gravado nos artigos: as sugestões caem nos cartões\. Para gravar, marque e use "Reforçar publicados"\./);
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
  assert.equal(devolvido.headline, "A busca em lote achou 2 keywords com volume (1 Forte, 1 Provável): marque e grave com \"Reforçar publicados\".");
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
  assert.match(gancho, /if \(result\.data\.written\) \{[\s\S]{0,400}onWritten\?\.\(\)/, "a mesa relê só quando algo foi gravado");
  assert.doesNotMatch(gancho, /localStorage|indexedDB|sessionStorage/, "nada de estado canônico no navegador");
  assert.doesNotMatch(gancho, /authorizedPlan: \{/, "o corpo pago só sai do modelo, com o plano confirmado");
});

test("cartões: o publicado usa a seleção do hook e 'Reforçar este publicado'; o Assunto continua com 'Aplicar selecionadas'", () => {
  assert.match(cartoes, /const selecionadas = reinforcement \? reinforcement\.selected : selecaoLocal;/);
  assert.match(cartoes, /onClick=\{reinforcement\.onReinforce\}/);
  assert.match(cartoes, /await handlers\.onApplySuggestions\(card\.key, \[\.\.\.selecionadas\]\)/);
  assert.match(cartoes, /<NoPairPublishedLine controller=\{reinforcement\} view=\{linhaSemPar\}/);
  assert.match(cartoes, /<PublishedReinforcementBar controller=\{reinforcement\} cards=\{cards\}/);
  assert.match(cartoes, /const visiveis = filtrados\.filter\(card => !\(card\.kind === "published" && naLinha\.has\(card\.anchorKeywordId\)\)\)/, "os sem par saem da grade e vão para a linha");
  assert.match(cartoes, /PEDEM_DECISAO\.has\(card\.state\) \|\| reinforcementNeedsAttention\(card\)/, "o reforço calculado e não gravado aparece no filtro padrão");
  assert.match(cartoes, /cardWithBatchSearch\(original, reinforcement\.results\.get\(original\.anchorKeywordId\)\)/);
  assert.match(cartoes, /Mudar de Silo grava só o Silo: para pôr as keywords no artigo publicado, use/);
  assert.match(painel, /dialog\.notices\.map/);
  assert.doesNotMatch(gancho, /status: "failed", conflicts/, "keyword repetida não trava a confirmação");
});

test("fiação da mesa: o hook com a marca ativa, releitura depois de gravar, 'Aplicar troca' sem ArticleDNA abre o Reforçar, e a Revisão do artigo usa a mesma seleção", () => {
  assert.match(workspace, /const publishedReinforcement = usePublishedReinforcement\(\{\s+brandId: selectedBrandId,/);
  assert.match(workspace, /onWritten: \(\) => \{\s+setCanonicalWorkspaceReload\(current => current \+ 1\);\s+setSerpSubjectReload\(current => current \+ 1\);/);
  assert.match(workspace, /aplicar\.viaReinforcement\) \{\s+void publishedReinforcement\.openReinforcement\(serpSubjectCards, \{ only: new Set\(\[anchorKeywordId\]\), acceptSwapOf: anchorKeywordId \}\);/);
  assert.match(workspace, /reinforcement=\{publishedReinforcement\}/);
  assert.match(workspace, /reinforcement=\{cardReinforcementOf\(publishedReinforcement, card, serpSubjectCards\)\}/);
  assert.match(workspace, /articleKeywordIds: vigente \? new Set\(vigente\.keywordReferences\.map/);
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
  for (const rotulo of [`'${PUBLISHED_REINFORCEMENT_ACTION_LABEL}'`, "'Reforçar este publicado'", "'Aceitar a troca'", `'${PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX}'`, "'Gravar e reler (N)'"]) {
    assert.ok(reforco.howOnScreen.includes(rotulo), rotulo);
  }
  for (const rotulo of [`'${searchActionLabel()}'`, "'Cancelar (nada é pago)'", "'Nova busca (outra rodada paga, com prévia)'"]) {
    assert.ok(busca.howOnScreen.includes(rotulo), rotulo);
  }
  assert.equal(chamadasDeRede, 0);
});
