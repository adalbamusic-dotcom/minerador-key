import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAN_SHEET_CONFLICT_LABEL, buildPlanSheetRows,
  planSheetFormationSelection, planSheetServerErrorSentence, planSubjectOfKeyword,
  type PlanSheetArticle,
} from "../lib/arquiteto/plan-article-sheet.ts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import { articleDeclaredPlanSeals } from "../lib/arquiteto/declared-plan-seals.ts";
import { assessRework, decideRework, type ReworkPrevious } from "../lib/editorial/rework-guard.ts";
import { GRUPOS } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { ARTIGO_INTRUSO, ASSUNTO_MEGA_GIGA, AZUL, INTRUSO_ID, MARCA_WIFI, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-14 · DEFEITOS REAIS DO DONO (WifiConecta, cor azul "Wi-Fi e fibra
 * óptica"): "criou 2 listas", "travou, sem poder avançar", "não sei o que esse
 * Silo [planos de internet] está fazendo nesse grupo". Fixture do caso real,
 * sem rede, sem provider, sem custo.
 */

const AGORA = new Date("2026-10-14T12:00:00Z");
const mesa = mesaWifiReal();
const standings = readArchitectSubjectStandings(mesa);
const linhas = (articles: PlanSheetArticle[] = [ARTIGO_INTRUSO]) => buildPlanSheetRows({
  brandId: MARCA_WIFI, keywords: mesa, standings, groupOf: id => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal,
  articles, radarArticleIds: new Set(), serp: null, filter: { kind: "groups", color: "azul", groupIds: [AZUL] }, now: AGORA,
});

/* ----------------------------------------------------------- uma lista só */

/*
 * 2026-10-16 · `planCandidateShownInSheet` e `planCandidatesInSheetSentence`
 * saíram do domínio (serviam à planilha separada, sem consumidor desde "uma
 * tabela só"). O que fica: uma linha por artigo do plano, e o plano só vale
 * para a keyword do plano da própria marca.
 */
test("uma lista só: uma linha por artigo do plano; keyword sem plano ou de outra marca não é do plano", () => {
  for (const principal of ["k9", "k10", "k11", "k15"]) {
    assert.ok(planSubjectOfKeyword({ keywordId: principal, brandId: MARCA_WIFI, standings }), principal);
  }
  assert.equal(planSubjectOfKeyword({ keywordId: INTRUSO_ID, brandId: MARCA_WIFI, standings }), null, "Assunto sem plano: a mesa de sempre");
  assert.equal(planSubjectOfKeyword({ keywordId: "k9", brandId: "outra-marca", standings }), null, "pacote de outra marca nunca vale");
  assert.equal(linhas([]).length, 7);
});

test("principal declarada de outro Assunto também é do plano (o Assunto é o do plano, não 'Sem Assunto')", () => {
  const comDeclarada = mesa.map(row => row.id === "k11" ? { ...row } : row);
  const lido = readArchitectSubjectStandings(comDeclarada);
  const k11 = lido.get("k11")!;
  const outra = new Map(lido);
  outra.set("k11", { ...k11, plan: { ...k11.plan!, declaredPrincipal: { keywordId: "kx", phrase: "wi-fi caindo" } } });
  assert.equal(planSubjectOfKeyword({ keywordId: "kx", brandId: MARCA_WIFI, standings: outra })?.keywordId, "k11");
  assert.equal(planSubjectOfKeyword({ keywordId: "nada", brandId: MARCA_WIFI, standings: outra }), null);
});

test("selos corretos: candidato do plano mostra 'Suporte do plano · 11º' e 'Principal declarada', nunca 'Sem Assunto' nem 'Fora do plano'", () => {
  const assunto = planSubjectOfKeyword({ keywordId: "k11", brandId: MARCA_WIFI, standings });
  assert.equal(assunto?.keywordId, "k11");
  assert.equal(assunto?.phrase, "Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão");
  const selos = articleDeclaredPlanSeals({ subjectKeywordId: assunto!.keywordId, principalKeywordId: "k11", standingOf: id => standings.get(id), groupHasPlan: true });
  const rotulos = selos.map(selo => selo.label);
  assert.ok(rotulos.includes("Suporte do plano · 11º"), JSON.stringify(rotulos));
  assert.ok(rotulos.includes("Principal declarada"), JSON.stringify(rotulos));
  assert.equal(rotulos.includes("Fora do plano"), false);
  // O defeito, como era: sem o Assunto lido da keyword do plano, o selo dizia "Fora do plano".
  const antes = articleDeclaredPlanSeals({ subjectKeywordId: null, principalKeywordId: "k11", standingOf: id => standings.get(id), groupHasPlan: true }).map(selo => selo.label);
  assert.ok(antes.includes("Fora do plano"));
});

/* --------------------------------------------------- o artigo intruso */

test("conflito do artigo intruso: as linhas 12, 13 e 14 dizem onde estão presas e o caminho; as outras seguem", () => {
  const rows = linhas();
  const presas = rows.filter(row => row.conflict);
  assert.deepEqual(presas.map(row => row.order), [12, 13, 14]);
  for (const row of presas) {
    assert.equal(row.formation.state, "conflict");
    assert.equal(row.formation.label, PLAN_SHEET_CONFLICT_LABEL);
    assert.equal(row.conflict!.articleId, INTRUSO_ID);
    assert.equal(row.conflict!.siloRef, ARTIGO_INTRUSO.siloRef);
    assert.equal(row.conflict!.sentence, `Presa no artigo “melhor-para-jogos-online” do Silo “planos de internet” (Assunto “${ASSUNTO_MEGA_GIGA}” · cor Laranja). Esta linha só forma no Silo do plano depois de “Retirar artigo do Silo” nesse artigo (prévia e decisão sua; nada é apagado, as keywords voltam a ficar livres).`);
  }
  assert.ok(rows.filter(row => !row.conflict).every(row => row.formation.state === "awaiting"));
});

test("Concluir formação (7): recusa SÓ as 3 presas, com o motivo; as 4 outras vão à prévia num prepare do grupo azul", () => {
  const selecao = planSheetFormationSelection(linhas(), "concludeFormation");
  assert.deepEqual(selecao.refused.map(item => item.keywordId), ["k12", "k13", "k14"]);
  assert.ok(selecao.refused.every(item => /^Presa no artigo “melhor-para-jogos-online”/.test(item.reason)));
  assert.deepEqual([...selecao.byGroup.keys()], [AZUL]);
  assert.deepEqual(selecao.byGroup.get(AZUL)!.map(row => row.keywordId), ["k9", "k10", "k11", "k15"]);
  // Trocar principal também recusa a presa (antes da trava).
  assert.ok(planSheetFormationSelection(linhas(), "swapPrincipal").refused.filter(item => item.keywordId === "k13").every(item => /^Presa no artigo/.test(item.reason)));
});

test("depois de retirar o intruso (decisão do dono): as 3 keywords ficam livres e as 7 linhas podem concluir formação", () => {
  const rows = linhas([]);
  assert.equal(rows.some(row => row.conflict), false);
  const selecao = planSheetFormationSelection(rows, "concludeFormation");
  assert.equal(selecao.refused.length, 0);
  assert.equal(selecao.byGroup.get(AZUL)!.length, 7);
});

test("o artigo do próprio plano não é conflito (a formação dele responde)", () => {
  const proprio: PlanSheetArticle = { articleId: "art-13", versionNumber: 1, subjectKeywordId: "k13", principalKeywordId: "k13", keywordIds: ["k13"] };
  const rows = linhas([proprio]);
  const k13 = rows.find(row => row.keywordId === "k13")!;
  assert.equal(k13.conflict, null);
  assert.equal(k13.formation.label, "Formado · v1");
});

/* 2026-10-16 · o teste do "próximo passo da planilha" saiu com `planSheetNextStep` (sem consumidor na tela). */

/* -------------------------------------------- erro do servidor, humano */

test("erro do servidor vira frase humana com o que fazer; recusa de negócio passa como está", () => {
  assert.match(planSheetServerErrorSentence({ status: 504, error: "TEMPO_ESGOTADO" }), /demorou demais.*toque de novo no mesmo botão/);
  assert.match(planSheetServerErrorSentence({ status: 0, error: "TEMPO_ESGOTADO" }), /demorou demais/);
  assert.match(planSheetServerErrorSentence({ status: 500, error: "QUERY_FAILURE" }), /^O servidor falhou nesta etapa \(erro 500\)\. Nada foi gravado por ela; tente de novo/);
  assert.doesNotMatch(planSheetServerErrorSentence({ status: 500, error: "QUERY_FAILURE" }), /QUERY_FAILURE/);
  assert.match(planSheetServerErrorSentence({ status: 503, error: "QUERY_FAILURE: A releitura não confirmou o artigo." }), /erro 503\): A releitura não confirmou o artigo\./);
  assert.match(planSheetServerErrorSentence({ status: 401 }), /sessão expirou/);
  assert.equal(planSheetServerErrorSentence({ status: 409, error: "Um dos alvos não pertence à marca." }), "Um dos alvos não pertence à marca.");
  assert.match(planSheetServerErrorSentence({ status: 409, error: "CONFLICT" }), /não foi confirmada pelo servidor/);
});

/* ------------------------------------------------- painel e leitura grátis */

test("guarda de retrabalho: leitura GRÁTIS repetida nunca pede motivo; o motivo é só para o que custa", () => {
  const previous: ReworkPrevious = { kind: "article_improvement_prepare", fingerprint: "f", at: "2026-10-14T15:30:00Z", actorId: "a", outcome: "succeeded", outcomeCode: null, resultRef: "run", costUsd: 0, message: null, attempts: 1, source: "article_improvement_run", summary: "7 alvo(s), IA leu a lista, 0 consulta(s) paga(s) no plano" };
  const gratis = assessRework({ kind: "article_improvement_prepare", fingerprint: "f", previous, policy: { sameInputs: "reuse", sameRefusal: "inform", freeRepeat: true } });
  assert.equal(gratis.verdict, "same_inputs_reuse");
  assert.equal(gratis.blocks, false);
  assert.equal(gratis.paidOnlyOverride, true);
  assert.match(gratis.message, /^Já feito com os mesmos insumos em 14\/10 às 12:30 — 7 alvo\(s\)/);
  assert.match(gratis.message, /A leitura grátis roda de novo sem pedir motivo/);
  assert.doesNotMatch(gratis.message, /diga o motivo em “Refazer mesmo assim”/);
  assert.deepEqual(decideRework(gratis), { proceed: true, overridden: false, overrideReason: null }, "roda sem motivo");
  // Mesmo com política "block", a repetição grátis não trava.
  assert.equal(assessRework({ kind: "article_improvement_prepare", fingerprint: "f", previous, policy: { sameInputs: "block", sameRefusal: "inform", freeRepeat: true } }).blocks, false);
  // Sem a marca (o que custa), o contrato de sempre.
  const pago = assessRework({ kind: "article_improvement_prepare", fingerprint: "f", previous, policy: { sameInputs: "reuse", sameRefusal: "inform" } });
  assert.equal(pago.paidOnlyOverride, undefined);
  assert.match(pago.message, /diga o motivo em “Refazer mesmo assim”/);
});

/* -------------------------------------------------------------- estrutural */

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/*
 * 2026-10-14 (tarde) · pedido do dono: "coloca só numa lista, não cria várias
 * listas, sem planilhas duplicadas". A planilha separada saiu da aba; a tabela
 * de artigos de sempre é a lista: o candidato do plano volta a ser linha da
 * mesa (com o detalhe de sempre) e ganha os selos do plano; a linha do plano
 * sem artigo é linha própria da MESMA tabela. Os testes antigos que fixavam a
 * planilha separada ("a mesa não repete o candidato", a frase com o atalho e
 * o painel recolhido) foram trocados por estes.
 */
test("estrutural · uma tabela só: o candidato do plano é linha da mesa com os selos; a linha do plano sem artigo entra na MESMA tabela; nada é apagado", () => {
  const tela = semComentarios(ler("../modules/arquiteto/arquiteto-workspace.tsx"));
  assert.doesNotMatch(tela, /planSheetCandidateIds|planCandidateShownInSheet|architect-plan-candidates-in-sheet|<PlanArticleSheet /, "a mesa não esconde mais o candidato do plano nem manda para outra planilha");
  assert.match(tela, /const doPlano = planSubjectOfKeyword\(\{/, "o Assunto do candidato vem do plano");
  assert.doesNotMatch(tela, /activeColorHasPlan=/);
  assert.match(tela, /<PlanArticleTableRow\s/, "a linha do plano sem artigo é linha da tabela de artigos");
  assert.match(tela, /<PlanRowSeals row=\{linhaDoPlano\}/, "a linha do artigo do plano ganha os selos do plano");
  assert.match(tela, /<PlanRowActions sheet=\{planSheet\} row=\{linhaDoPlano\}/, "e as ações por linha do plano");
  assert.match(tela, /group\.items\.map\(item => item\.kind === "plan" \?/);
  const principal = tela.slice(tela.indexOf("<main className=\"min-w-0 flex-1 overflow-y-auto bg-background\">"), tela.indexOf("</main>"));
  assert.equal((principal.match(/<table\b/g) || []).length, 1, "uma tabela só na aba (o diálogo de restauração de backup tem a dele, fora da aba)");
  // A montagem das linhas do plano só lê: nenhuma escrita nasce desta mudança.
  const montagem = tela.slice(tela.indexOf("const planBaseRows = useMemo"), tela.indexOf("const filteredArticles = useMemo"));
  assert.doesNotMatch(montagem, /fetch\(|persist|delete|remove|setMasterList|setArticlesList/);
});

test("estrutural · a planilha abre 'Retirar artigo do Silo' (o núcleo de sempre) com prévia; não retira sozinha", () => {
  const tela = semComentarios(ler("../modules/arquiteto/plan-article-sheet.tsx"));
  assert.match(tela, /<SiloArticleWithdrawalPanel/);
  assert.match(tela, /autoOpenArticleId=\{withdrawing\.articleId\}/, "abre a PRÉVIA (grátis)");
  assert.ok(tela.includes("onClick={() => sheet.setWithdrawing(row.conflict)}"), "só pelo clique do dono (o botão da linha)");
  // A aplicação da retirada é do painel, com motivo e confirmação (2026-10-16: sem "Consolidar o Silo do plano", a planilha não tem nenhum "apply").
  assert.equal(tela.includes("/api/arquiteto/silo-article-withdrawal"), false, "a planilha não chama a rota da retirada");
  assert.doesNotMatch(tela, /mode: "apply"/, "a aplicação da retirada é do painel, com motivo e confirmação");
  const painel = semComentarios(ler("../modules/arquiteto/silo-article-withdrawal-panel.tsx"));
  assert.match(painel, /abrirPrevia\(autoOpenArticleId\)/);
  assert.match(painel, /disabled=\{ocupado \|\| !motivoValido\}/, "confirmar continua exigindo o motivo");
  const servidor = semComentarios(ler("../lib/server/arquiteto-silo-article-withdrawal.ts"));
  assert.match(servidor, /plan\.pairUnchanged\s*\?/);
});
