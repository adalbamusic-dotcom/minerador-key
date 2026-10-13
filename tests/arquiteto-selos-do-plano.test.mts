import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { articleDeclaredPlanSeals, declaredPlanPillarLabel, siloDeclaredPlanSeal } from "../lib/arquiteto/declared-plan-seals.ts";
import type { DeclaredArticlePlan, DeclaredPrincipalMark } from "../lib/minerador/declared-plan.ts";

/*
 * 2026-10-12 · SELOS DO PLANO DECLARADO NO ARQUITETO (SDD do plano declarado
 * §9 item 6): "Pilar do plano", "Suporte do plano · nº", "Principal
 * declarada", "Fora do plano" e, no cartão do Silo, "Plano declarado · Pilar".
 * Só leitura do pacote aprovado; texto sempre (a cor nunca sozinha); nada é
 * trocado. Domínio puro + a ligação na tela (estrutura). Sem rede.
 */

const G = "a9d5c87b-0000-4000-8000-000000000001";
const plano = (extra: Partial<DeclaredArticlePlan> = {}): DeclaredArticlePlan => ({ groupId: G, planVersion: 1, order: 3, role: "Suporte", scope: "Comparação", declaredPrincipal: { keywordId: "p3", phrase: "Claro Vivo ou TIM internet" }, ...extra });
type Standing = { plan: DeclaredArticlePlan | null; declaredPrincipal: DeclaredPrincipalMark | null; phrase?: string };
const standings = new Map<string, Standing>([
  ["s3", { plan: plano(), declaredPrincipal: null, phrase: "Claro, Vivo ou TIM" }],
  ["s1", { plan: plano({ order: 1, role: "Pilar", declaredPrincipal: { keywordId: "p1", phrase: "melhor plano de internet residencial" } }), declaredPrincipal: null, phrase: "Como escolher" }],
  ["p3", { plan: null, declaredPrincipal: { subjectKeywordId: "s3", groupId: G, planVersion: 1 } }],
  ["s9", { plan: null, declaredPrincipal: null, phrase: "solto" }],
]);
const standingOf = (id: string) => standings.get(id);

test("artigo do plano: papel e posição + Principal declarada; divergência é aviso, nunca troca", () => {
  const suporte = articleDeclaredPlanSeals({ subjectKeywordId: "s3", principalKeywordId: "p3", standingOf, groupHasPlan: true });
  assert.deepEqual(suporte.map(seal => seal.label), ["Suporte do plano · 3º", "Principal declarada"]);
  assert.ok(suporte.every(seal => seal.tone === "neutral" && seal.title.length > 10));
  const pilar = articleDeclaredPlanSeals({ subjectKeywordId: "s1", principalKeywordId: "p1", standingOf, groupHasPlan: true });
  assert.equal(pilar[0].label, "Pilar do plano · 1º");
  assert.equal(pilar[0].kind, "plan_pillar");
  const diverge = articleDeclaredPlanSeals({ subjectKeywordId: "s3", principalKeywordId: "claro-ou-vivo", standingOf, groupHasPlan: true });
  assert.deepEqual(diverge.map(seal => seal.kind), ["plan_support", "principal_diverges"]);
  assert.equal(diverge[1].tone, "warning");
  assert.match(diverge[1].title, /Nada é trocado sozinho/);
});

test("fora do plano, principal declarada solta e grupo sem plano", () => {
  const fora = articleDeclaredPlanSeals({ subjectKeywordId: "s9", principalKeywordId: "x", standingOf, groupHasPlan: true });
  assert.deepEqual(fora.map(seal => seal.label), ["Fora do plano"]);
  assert.match(fora[0].title, /Nada é apagado/);
  const semAssunto = articleDeclaredPlanSeals({ subjectKeywordId: null, principalKeywordId: "p3", standingOf, groupHasPlan: false });
  assert.deepEqual(semAssunto.map(seal => seal.label), ["Principal declarada"]);
  assert.deepEqual(articleDeclaredPlanSeals({ subjectKeywordId: "s9", principalKeywordId: "x", standingOf, groupHasPlan: false }), [], "grupo sem plano: nenhum selo");
});

test("Silo: 'Plano declarado · Pilar: …' do pacote aprovado; sem plano, nada", () => {
  const pilar = declaredPlanPillarLabel(standings.values() as Iterable<{ plan: DeclaredArticlePlan | null; phrase: string }>, G);
  assert.equal(pilar, "melhor plano de internet residencial");
  assert.equal(declaredPlanPillarLabel(standings.values() as Iterable<{ plan: DeclaredArticlePlan | null; phrase: string }>, "outro"), null);
  assert.equal(siloDeclaredPlanSeal({ groupHasPlan: true, planVersion: 2, pillarLabel: pilar })!.label, "Plano declarado · Pilar: melhor plano de internet residencial");
  assert.equal(siloDeclaredPlanSeal({ groupHasPlan: true, planVersion: 1, pillarLabel: null })!.label, "Plano declarado");
  assert.equal(siloDeclaredPlanSeal({ groupHasPlan: false, planVersion: 0, pillarLabel: null }), null);
});

test("tela: os selos entram na linha do artigo, na SiloPage e no cartão do Silo; a revisão da linha os inclui", () => {
  const limpar = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const tela = limpar(readFileSync(join(process.cwd(), "modules/arquiteto/arquiteto-workspace.tsx"), "utf8"));
  assert.match(tela, /<DeclaredPlanSeals seals=\{declaredPlanSealsFor\(art\)\} className="mt-1"\/>/);
  assert.equal((tela.match(/siloDeclaredPlanSeal\(\{/g) || []).length, 2, "SiloPage (aba Artigos) e cartão do Silo (aba Silos)");
  assert.match(tela, /siloRoleByArticleId, declaredPlanSealsFor \}\)/, "a linha memoizada redesenha quando o plano chega");
  const selo = limpar(readFileSync(join(process.cwd(), "modules/arquiteto/declared-plan-seals.tsx"), "utf8"));
  assert.match(selo, /\{seal\.label\}/, "texto sempre");
  assert.match(selo, /text-sm/, "texto de 14 px");
  assert.doesNotMatch(selo, /onClick|<button/, "selo só informa");
  assert.doesNotMatch(selo, /#[0-9a-f]{3,6}\b|rgb\(|bg-(red|green|yellow|orange|blue)-/i, "só tokens");
});

test("a linha do artigo mostra o Assunto/tema na cabeceira (ou \"Sem Assunto\"), pela mesma fonte do selo", () => {
  const tela = readFileSync(join(process.cwd(), "modules", "arquiteto", "arquiteto-workspace.tsx"), "utf8");
  assert.match(tela, /const assuntoDaLinhaRef = articleSubjectFor\(art\);/);
  assert.match(tela, /assuntoDaLinhaRef\.subject\?\.phrase \|\| keywordLabelById\.get\(assuntoDaLinhaRef\.keywordId\)/, "frase gravada no ArticleDNA ou o texto da keyword do Assunto em formação; nunca id cru");
  const celula = tela.slice(tela.indexOf("data-article-row-subject"), tela.indexOf("data-article-row-subject") + 400);
  /* 2026-10-13 · a cabeceira passou a usar o componente compartilhado (mesmo texto em todas as áreas). */
  assert.match(celula, /<ArticleSubjectLine phrase=\{assuntoDaLinha\}\/>/);
  const componente = readFileSync(join(process.cwd(), "components", "editorial", "article-subject-line.tsx"), "utf8");
  assert.match(componente, /ARTICLE_SUBJECT_LABEL = "Assunto · "/);
  assert.match(componente, /ARTICLE_SUBJECT_EMPTY = "Sem Assunto"/, "artigo sem Assunto aparece como tal, em vez de sumir");
  assert.ok(tela.indexOf("data-article-row-subject") < tela.indexOf("title={art.keywordPrincipal}>{art.keywordPrincipal}"), "o Assunto vem antes da keyword principal");
});

test("2026-10-13 · o Assunto legível nos outros painéis do Arquiteto (componente compartilhado, mesma fonte)", () => {
  const limpar = (texto: string) => texto.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");
  const tela = limpar(readFileSync(join(process.cwd(), "modules", "arquiteto", "arquiteto-workspace.tsx"), "utf8"));
  // painel expandido: o Assunto da linha antes da principal
  assert.match(tela, /Resumo do artigo<\/p>\s*<ArticleSubjectLine phrase=\{assuntoDaLinha\} className="mt-1" testId="architect-expanded-subject"\/>\s*<p className="mt-1 break-words text-base font-semibold text-keyword">\{art\.keywordPrincipal\}<\/p>/);
  // cartão do Silo: Pilar (fechado e em escolha), cada Suporte, retirada
  assert.match(tela, /const articleSubject = \(articleId: string\) => articleSubjectPhraseOf\(acceptedArticleDnas\[articleId\]\?\.payload\);/);
  assert.equal((tela.match(/testId="architect-silo-pillar-subject"/g) || []).length, 2, "Pilar fechado e Pilar em escolha");
  assert.match(tela, /Suporte · \{articleLabel\(articleId\)\}<\/span><ArticleSubjectLine phrase=\{articleSubject\(articleId\)\} testId="architect-silo-support-subject"\/>/);
  assert.match(tela, /\{ articleId, label: articleLabel\(articleId\), subjectPhrase: articleSubject\(articleId\) \}/);
  // SiloPage: Pilar e Suportes
  assert.match(tela, /testId="architect-silopage-pillar-subject"/);
  assert.match(tela, /testId="architect-silopage-support-subject"/);
  // Links internos: hierarquia, relações (só artigos) e nó selecionado
  assert.match(tela, /acceptedArticleDnas\[linksHierarchy\.pillar\.id\]\?\.payload\)\} testId="architect-link-pillar-subject"/);
  assert.match(tela, /acceptedArticleDnas\[unit\.id\]\?\.payload\)\} testId="architect-link-support-subject"/);
  assert.match(tela, /row\[ponta\]\.nodeId\.startsWith\("article:"\) \? <ArticleSubjectLine key=\{ponta\}[^>]*showEmpty=\{false\}/);
  assert.match(tela, /testId="architect-link-node-subject"/);
  // reparo pontual
  assert.match(tela, /subjectOf=\{articleId => articleSubjectPhraseOf\(articleRepairPlans\.find\(item => item\.plano\.articleId === articleId\)\?\.dna\?\.payload\)\}/);
  const reparo = limpar(readFileSync(join(process.cwd(), "modules", "arquiteto", "article-repair-panel.tsx"), "utf8"));
  assert.match(reparo, /\{plano\.label\}<\/p>\s*\{subjectOf && <ArticleSubjectLine phrase=\{subjectOf\(plano\.articleId\)\}/);
  const retirada = limpar(readFileSync(join(process.cwd(), "modules", "arquiteto", "silo-article-withdrawal-panel.tsx"), "utf8"));
  assert.match(retirada, /articles: ReadonlyArray<\{ articleId: string; label: string; subjectPhrase\?: string \| null \}>/);
  assert.match(retirada, /"subjectPhrase" in article \? <ArticleSubjectLine as="span" phrase=\{article\.subjectPhrase\}/);
  assert.match(retirada, /Prévia · \{previa\.article\.label\}<\/p>\s*\{\(\(\) => \{ const doAberto/);
});
