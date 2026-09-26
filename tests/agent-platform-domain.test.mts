import assert from "node:assert/strict";
import test from "node:test";
import { lookupTopic, topicCoverage, topicTokens, type TopicCandidate } from "../lib/agent/topic-match.ts";
import { pathOfUrl, suggestArticleSlugFor, suggestSiloPageSlug, validateSiloPlan, type SiloPlan, type SiloPlanContext } from "../lib/agent/silo-plan.ts";
import { resolveNextActions } from "../lib/agent/next-actions.ts";
import type { PlatformStateSnapshot } from "../lib/agent/platform-state-model.ts";
import { operationById } from "../lib/agent/platform-catalog.ts";

/**
 * O QUE A IA ENTENDE DA MARCA ANTES DE AGIR — sem banco.
 *
 * Três decisões que precisam estar certas para a IA não criar artigo repetido,
 * silo que colide com o site ou passo fora de ordem: a busca de tema, a
 * validação do silo proposto e os próximos passos.
 */

/* ============================ busca de tema ============================ */

test("01 · tokens ignoram acento, caixa e palavras vazias", () => {
  assert.deepEqual(topicTokens("Skincare para Pele Oleosa"), ["skincare", "pele", "oleosa"]);
  assert.deepEqual(topicTokens("Clínica de Estética"), ["clinica", "estetica"]);
});

test("02 · a cobertura é a do TEMA: o artigo mais específico cobre o tema inteiro", () => {
  assert.equal(topicCoverage("pele oleosa", "skincare para pele oleosa no verão"), 1);
  assert.equal(topicCoverage("skincare para pele oleosa no verão", "pele oleosa") < 1, true, "o inverso não é o mesmo tema");
});

test("03 · plural simples casa com singular", () => {
  assert.equal(topicCoverage("creme para acne", "cremes para acnes"), 1);
  assert.equal(topicCoverage("clínica", "clínicas"), 1);
});

const candidatos: TopicCandidate[] = [
  { kind: "article", id: "art-1", text: "Skincare para pele oleosa · skincare pele oleosa", where: "Arquiteto · Suporte" },
  { kind: "silo", id: "silo-1", text: "Cuidados com a pele", where: "Arquiteto · Silo" },
  { kind: "keyword", id: "kw-1", text: "protetor solar facial", where: "Minerador · keyword · aprovado" },
];

test("04 · tema que já é artigo: a leitura manda NÃO criar outro", () => {
  const resultado = lookupTopic("pele oleosa", candidatos);
  assert.equal(resultado.match, "lexical");
  assert.deepEqual(resultado.same.map(item => item.id), ["art-1"]);
  assert.match(resultado.reading, /Não crie outro/);
});

test("05 · só silo relacionado: a leitura sugere entrar como Suporte", () => {
  const resultado = lookupTopic("rotina para pele sensível", candidatos);
  assert.equal(resultado.same.length, 0);
  assert.ok(resultado.related.some(item => item.kind === "silo"), JSON.stringify(resultado));
  assert.match(resultado.reading, /Suporte/);
});

test("06 · nada encontrado NÃO é declarado inédito", () => {
  const resultado = lookupTopic("tráfego pago para clínicas", candidatos);
  assert.equal(resultado.same.length + resultado.related.length, 0);
  assert.match(resultado.reading, /não prova que o tema é inédito/);
});

/* ============================ plano de silo ============================ */

const contextoVazio: SiloPlanContext = { publishedPaths: [], existingArticleSlugs: [], existingSiloPageSlugs: [], existingArticleTopics: [] };

const planoBom = (): SiloPlan => ({
  siloName: "Skincare para pele oleosa",
  siloPage: { keyword: "skincare pele oleosa" },
  articles: [
    { subject: "Guia completo de skincare para pele oleosa", targetKeyword: "rotina skincare pele oleosa", role: "Pilar", funnel: "TOFU", intent: "informacional" },
    { subject: "Como limpar a pele oleosa sem ressecar", targetKeyword: "como limpar pele oleosa", role: "Suporte", funnel: "TOFU", intent: "informacional" },
    { subject: "Melhores sabonetes para pele oleosa", targetKeyword: "melhor sabonete pele oleosa", role: "Suporte", funnel: "MOFU", intent: "comercial" },
    { subject: "Hidratante para pele oleosa: como escolher", targetKeyword: "hidratante pele oleosa", role: "Suporte", funnel: "MOFU", intent: "comercial" },
    { subject: "Tratamento profissional para pele oleosa", targetKeyword: "tratamento pele oleosa clinica", role: "Suporte", funnel: "BOFU", intent: "transacional" },
  ],
});

test("07 · os slugs são os da casa: página do silo pela keyword; artigo pela principal, relativo ao silo", () => {
  assert.equal(suggestSiloPageSlug("Skincare Pele Oleosa"), "skincare-pele-oleosa");
  // A principal inteira, sem repetir o que o silo já diz (regra do Arquiteto).
  assert.equal(suggestArticleSlugFor("como limpar pele oleosa", "skincare-pele-oleosa"), "como-limpar");
  assert.equal(suggestArticleSlugFor("creme para o rosto", "cremes"), "para-o-rosto");
  assert.equal(pathOfUrl("https://careglow.com.br/blog/pele-oleosa/"), "blog/pele-oleosa");
});

test("08 · plano correto passa, com slugs preenchidos e próximos passos", () => {
  const resultado = validateSiloPlan(planoBom(), contextoVazio);
  assert.equal(resultado.ok, true, JSON.stringify(resultado.issues));
  assert.equal(resultado.plan.siloPage.slug, "skincare-pele-oleosa");
  assert.equal(resultado.plan.articles[1].slug, "como-limpar");
  assert.equal(resultado.plan.articles[1].path, "skincare-pele-oleosa/como-limpar");
  assert.match(resultado.nextSteps.join(" "), /declare_subjects/);
});

test("09 · fora de 4 a 7 artigos é bloqueio", () => {
  const plano = planoBom();
  plano.articles = plano.articles.slice(0, 3);
  const resultado = validateSiloPlan(plano, contextoVazio);
  assert.equal(resultado.ok, false);
  assert.ok(resultado.issues.some(issue => issue.severity === "block" && /4 a 7/.test(issue.message)));
});

test("10 · sem Pilar, ou com dois, é bloqueio", () => {
  const semPilar = planoBom();
  semPilar.articles[0].role = "Suporte";
  assert.equal(validateSiloPlan(semPilar, contextoVazio).ok, false);
  const doisPilares = planoBom();
  doisPilares.articles[1].role = "Pilar";
  assert.equal(validateSiloPlan(doisPilares, contextoVazio).ok, false);
});

test("11 · endereço já publicado é bloqueio; mesmo final noutro caminho é aviso", () => {
  const publicado = validateSiloPlan(planoBom(), { ...contextoVazio, publishedPaths: ["skincare-pele-oleosa/hidratante"] });
  assert.equal(publicado.ok, false);
  assert.ok(publicado.issues.some(issue => issue.severity === "block" && /já está publicado/.test(issue.message)));

  const outroCaminho = validateSiloPlan(planoBom(), { ...contextoVazio, publishedPaths: ["blog/hidratante"] });
  assert.equal(outroCaminho.ok, true);
  assert.ok(outroCaminho.issues.some(issue => issue.severity === "warning" && /noutro caminho/.test(issue.message)));
});

test("12 · slug repetido dentro do plano é bloqueio", () => {
  const plano = planoBom();
  plano.articles[2].slug = "como-limpar";
  assert.ok(validateSiloPlan(plano, contextoVazio).issues.some(issue => issue.severity === "block" && /mais de uma vez/.test(issue.message)));
});

test("13 · sem TOFU é aviso (tráfego e respostas de IA), não bloqueio", () => {
  const plano = planoBom();
  plano.articles.forEach(article => { article.funnel = "BOFU"; article.intent = "transacional"; });
  const resultado = validateSiloPlan(plano, contextoVazio);
  assert.equal(resultado.ok, true);
  assert.ok(resultado.issues.some(issue => issue.severity === "warning" && /TOFU/.test(issue.message)));
});

test("14 · artigo igual a um que a marca já tem vira aviso de canibalização", () => {
  const resultado = validateSiloPlan(planoBom(), { ...contextoVazio, existingArticleTopics: [{ id: "a", text: "melhores sabonetes para pele oleosa em 2026" }] });
  assert.ok(resultado.issues.some(issue => issue.severity === "warning" && /Já existe artigo parecido/.test(issue.message)));
});

test("15 · keyword da página do silo igual à de um artigo é aviso: disputariam a mesma busca", () => {
  const plano = planoBom();
  plano.siloPage.keyword = "hidratante pele oleosa";
  plano.siloPage.slug = "silo-pele-oleosa";
  assert.ok(validateSiloPlan(plano, contextoVazio).issues.some(issue => /disputariam/.test(issue.message)));
});

/* ============================ próximos passos =========================== */

const vazio = (): PlatformStateSnapshot => ({
  brand: {
    brandId: "b", brandName: "Marca", siteUrl: null, niche: null,
    screens: { marca: "/m", minerador: "/m/minerador", arquiteto: "/m/arquiteto", radar: "/m/radar", redator: "/m/redator", publicacoes: "/m/publicacoes" },
  },
  minerador: { total: 0, byStatus: {}, subjects: [], approvedNotSentIds: [] },
  arquiteto: { receivedKeywords: 0, articles: [], silos: [] },
  radar: { items: [] },
  redator: { documents: [] },
  published: { total: 0, pages: [] },
  truncated: [],
  readAt: "2026-09-26T00:00:00.000Z",
});

test("16 · marca vazia: playbook do silo do zero", () => {
  const { actions, playbook } = resolveNextActions(vazio());
  assert.equal(playbook, "silo_do_zero");
  assert.equal(actions.length, 0);
});

test("17 · site sem catálogo sincronizado: primeiro sincronizar, na tela", () => {
  const estado = vazio();
  estado.brand.siteUrl = "https://careglow.com.br";
  const [primeira] = resolveNextActions(estado).actions;
  assert.equal(primeira.operationId, "marca.site_catalog");
  assert.equal(primeira.who, "human");
  assert.equal(primeira.screen, "/m");
});

test("18 · aprovadas não enviadas: a IA envia, com a ferramenta", () => {
  const estado = vazio();
  estado.minerador = { total: 3, byStatus: { aprovado: 3 }, subjects: [], approvedNotSentIds: ["k1", "k2"] };
  const acao = resolveNextActions(estado).actions.find(item => item.operationId === "minerador.send_to_arquiteto");
  assert.ok(acao);
  assert.equal(acao.who, "agent");
  assert.deepEqual(acao.tools, ["send_keywords_to_arquiteto"]);
  assert.deepEqual(acao.items, ["k1", "k2"]);
});

test("19 · keywords em bruto: medir e aprovar são humanos, com o link do Minerador", () => {
  const estado = vazio();
  estado.minerador = { total: 5, byStatus: { bruto: 5 }, subjects: [], approvedNotSentIds: [] };
  const acoes = resolveNextActions(estado).actions;
  const medir = acoes.find(item => item.operationId === "minerador.measure_and_qualify");
  const aprovar = acoes.find(item => item.operationId === "minerador.review_and_approve");
  assert.equal(medir?.who, "human");
  assert.equal(aprovar?.who, "human");
  assert.equal(aprovar?.screen, "/m/minerador");
});

test("20 · Radar aprovado vira envio ao Redator pela IA; Radar em curso fica com o humano", () => {
  const estado = vazio();
  estado.arquiteto.articles = [{ articleId: "a1", promise: "x", slug: "x", siloId: null, hierarchy: null, siloRole: null, journeyStage: null, mainIntent: null, principalKeyword: null, workflowState: "ENVIADO_AO_RADAR", canonical: null }];
  estado.radar.items = [{ articleId: "a1", state: "approved" }, { articleId: "a2", state: "research_pending" }];
  const acoes = resolveNextActions(estado).actions;
  assert.equal(acoes.find(item => item.operationId === "radar.send_to_writer")?.who, "agent");
  assert.deepEqual(acoes.find(item => item.operationId === "radar.send_to_writer")?.items, ["a1"]);
  assert.equal(acoes.find(item => item.operationId === "radar.investigate")?.who, "human");
});

test("21 · documento planejado: a IA escreve; em revisão: o humano aprova", () => {
  const estado = vazio();
  estado.redator.documents = [
    { documentId: "d1", articleId: "a1", title: "t", status: "planejado" },
    { documentId: "d2", articleId: "a2", title: "t", status: "em_revisao" },
  ];
  const acoes = resolveNextActions(estado).actions;
  assert.deepEqual(acoes.find(item => item.operationId === "redator.write_draft")?.items, ["d1"]);
  assert.equal(acoes.find(item => item.operationId === "redator.approve")?.who, "human");
});

test("22 · toda ação aponta para uma operação real do catálogo", () => {
  const estado = vazio();
  estado.brand.siteUrl = "https://x.com";
  estado.minerador = { total: 4, byStatus: { bruto: 1, em_revisao: 1, aprovado: 2 }, subjects: [], approvedNotSentIds: ["k"] };
  estado.arquiteto = { receivedKeywords: 2, articles: [{ articleId: "a", promise: "p", slug: null, siloId: null, hierarchy: null, siloRole: null, journeyStage: null, mainIntent: null, principalKeyword: null, workflowState: "PRONTO_PARA_RADAR", canonical: null }], silos: [{ siloId: "s", name: "S", pillarArticleId: "a", supportArticleIds: [], formationStatus: "draft", page: null }] };
  for (const acao of resolveNextActions(estado).actions) assert.ok(operationById(acao.operationId), acao.operationId);
});
