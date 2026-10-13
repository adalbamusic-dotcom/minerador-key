import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * ===== O ASSUNTO LEGÍVEL EM TODO PAINEL — pedido do dono, 2026-10-13 =====
 *
 * "Coloca sempre o assunto no painel para que seja legível." O componente
 * compartilhado (`ArticleSubjectLine`) e o diálogo de importação real
 * (`WorkflowImportDialog`) no DOM:
 *
 *   1. com frase: rótulo "Assunto · " em text-text-muted, frase inteira em
 *      text-foreground, 14 px (text-sm), quebra de linha, `title` com a frase;
 *   2. sem frase: "Sem Assunto" em text-text-muted; com `showEmpty={false}`,
 *      nada;
 *   3. a leitura pura da frase do ArticleDNA (`subject.phrase`);
 *   4. o diálogo SEM `subjectOf` é byte a byte o de sempre; COM ele, cada linha
 *      abre com o Assunto e a busca casa com a frase.
 *
 * Roda dentro de `npm run test:radar`. Fixtures, sem rede.
 */

const { ArticleSubjectLine, articleSubjectPhraseOf, ARTICLE_SUBJECT_EMPTY, ARTICLE_SUBJECT_LABEL } = await import("../components/editorial/article-subject-line.tsx");
const { WorkflowImportDialog } = await import("../components/editorial/workflow-status.tsx");

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => { tela = await montarRadar(); });
test.afterEach(() => { tela?.destroy(); tela = null; });

const FRASE = "rotina de skincare para pele oleosa com sérum de vitamina C pela manhã";

test("01 · com frase: rótulo apagado, frase inteira legível, 14 px, title com a frase", async () => {
  await tela!.render(React.createElement(ArticleSubjectLine, { phrase: `  ${FRASE}  ` }));
  const linha = tela!.container.querySelector<HTMLElement>('[data-article-subject="presente"]');
  assert.ok(linha);
  assert.equal(linha.tagName, "P");
  assert.equal(linha.textContent, `${ARTICLE_SUBJECT_LABEL}${FRASE}`);
  assert.equal(linha.getAttribute("title"), `Assunto: ${FRASE}`);
  assert.match(linha.className, /\btext-sm\b/);
  assert.match(linha.className, /\btext-foreground\b/);
  assert.match(linha.className, /\bbreak-words\b/);
  assert.doesNotMatch(linha.className, /\btruncate\b|line-clamp|text-\[(9|10|11|12|13)px\]|text-xs/);
  assert.match(linha.querySelector("span")!.className, /\btext-text-muted\b/);
  assert.equal(chamadasDeRede, 0);
});

test("02 · sem frase: \"Sem Assunto\" apagado; showEmpty={false} não renderiza nada", async () => {
  for (const vazio of [null, undefined, "", "   "]) {
    await tela!.render(React.createElement(ArticleSubjectLine, { phrase: vazio }));
    const linha = tela!.container.querySelector<HTMLElement>('[data-article-subject="ausente"]');
    assert.ok(linha, `vazio: ${JSON.stringify(vazio)}`);
    assert.equal(linha.textContent, ARTICLE_SUBJECT_EMPTY);
    assert.match(linha.className, /\btext-sm\b/);
    assert.match(linha.className, /\btext-text-muted\b/);
  }
  await tela!.render(React.createElement(ArticleSubjectLine, { phrase: null, showEmpty: false }));
  assert.equal(tela!.container.innerHTML, "");
  await tela!.render(React.createElement(ArticleSubjectLine, { phrase: FRASE, as: "span" }));
  const inline = tela!.container.querySelector<HTMLElement>('[data-article-subject="presente"]')!;
  assert.equal(inline.tagName, "SPAN");
  assert.match(inline.className, /\bblock\b/, "span vira bloco para não colar na keyword");
});

test("03 · a frase sai do ArticleDNA (subject.phrase); sem Assunto, null", () => {
  assert.equal(articleSubjectPhraseOf({ subject: { phrase: ` ${FRASE} ` } }), FRASE);
  assert.equal(articleSubjectPhraseOf({ subject: { phrase: "" } }), null);
  assert.equal(articleSubjectPhraseOf({ subject: null }), null);
  assert.equal(articleSubjectPhraseOf({}), null);
  assert.equal(articleSubjectPhraseOf(null), null);
  assert.equal(articleSubjectPhraseOf(undefined), null);
});

type Linha = { id: string; nome: string; assunto: string | null };
const LINHAS: Linha[] = [
  { id: "a1", nome: "rotina de skincare", assunto: FRASE },
  { id: "a2", nome: "protetor solar", assunto: null },
];
const dialogo = (comAssunto: boolean) => React.createElement(WorkflowImportDialog<Linha>, {
  open: true,
  title: "Importar artigos aprovados",
  description: "fixture",
  rows: LINHAS,
  label: (row: Linha) => row.nome,
  onClose: () => {},
  onImport: async () => {},
  ...(comAssunto ? { subjectOf: (row: Linha) => row.assunto } : {}),
});
const busca = () => tela!.container.querySelector('input[placeholder="Buscar itens da etapa anterior…"]') as HTMLInputElement;

test("04 · diálogo de importação: sem subjectOf nada muda; com ele, o Assunto abre cada linha e entra na busca", async () => {
  await tela!.render(dialogo(false));
  assert.equal(tela!.container.querySelectorAll("[data-article-subject]").length, 0, "consumidores sem subjectOf preservados");
  await tela!.render(dialogo(true));
  const linhas = [...tela!.container.querySelectorAll("label")].filter(label => label.querySelector('input[type="checkbox"]') && label.querySelector("strong"));
  assert.equal(linhas.length, 2);
  const primeira = linhas[0]!.querySelector<HTMLElement>("[data-article-subject]")!;
  assert.equal(primeira.dataset.articleSubject, "presente");
  assert.ok(primeira.compareDocumentPosition(linhas[0]!.querySelector("strong")!) & 4, "o Assunto vem antes da keyword");
  assert.equal(linhas[1]!.querySelector<HTMLElement>("[data-article-subject]")!.textContent, "Sem Assunto");
  await tela!.type(busca(), "vitamina c");
  const visiveis = [...tela!.container.querySelectorAll("label strong")].map(item => item.textContent);
  assert.deepEqual(visiveis, ["rotina de skincare"], "a busca casa com a frase do Assunto");
});

/* ===== a ligação em cada tela do Radar (estrutural, sem comentários) ===== */
const fonteSemComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/[^\n]*/gm, " ");

test("05 · Radar: linha da planilha, perfil, cabeçalho do foco, página do artigo e importação usam o Assunto do ArticleDNA", () => {
  const pagina = fonteSemComentarios("../modules/radar/radar-page.tsx");
  const coluna = pagina.slice(pagina.indexOf('{ id: "article", header: "Artigo"'), pagina.indexOf('{ id: "article", header: "Artigo"') + 900);
  assert.match(coluna, /<ArticleSubjectLine phrase=\{articleSubjectPhraseOf\(data\.article\?\.payload\)\} className="mb-1"\/><div className="flex min-w-0 items-center gap-2"><strong/, "o Assunto abre a célula, antes do título");
  assert.match(pagina, /<ImportPanel title="Importar artigos aprovados"[^\n]*subjectOf=\{version => articleSubjectPhraseOf\(version\.payload\)\}/);
  const perfil = fonteSemComentarios("../modules/radar/radar-r3-profile-mirror.tsx");
  assert.match(perfil, /\{model\.title\}<\/h2><ArticleSubjectLine phrase=\{model\.researchContext\?\.article\.subject\?\.phrase\} showEmpty=\{Boolean\(model\.researchContext\)\}/);
  const foco = fonteSemComentarios("../modules/radar/radar-r3-workbench.tsx");
  assert.match(foco, /\{model\.title\}<\/h1>\s*<ArticleSubjectLine phrase=\{model\.researchContext\?\.article\.subject\?\.phrase\}/);
  const artigo = fonteSemComentarios("../modules/radar/radar-analysis-page.tsx");
  assert.match(artigo, /\{identity\.title\}<\/h1>\s*<ArticleSubjectLine phrase=\{articleSubjectPhraseOf\(article\.payload\)\} className="mt-2"\/>/);
  const compartilhado = fonteSemComentarios("../components/editorial/operational-screen-shared.tsx");
  assert.match(compartilhado, /groupOf=\{groupOf\} subjectOf=\{subjectOf\}/, "o ImportPanel repassa o Assunto ao diálogo");
});

test("06 · Arquiteto no DOM: cada suporte da retirada e cada artigo do reparo mostram o Assunto (sem subjectPhrase, nada muda)", async () => {
  const { SiloArticleWithdrawalPanel } = await import("../modules/arquiteto/silo-article-withdrawal-panel.tsx");
  const { ArticleRepairPanel } = await import("../modules/arquiteto/article-repair-panel.tsx");
  const base = { brandId: "marca-1", siloId: "silo-1", classNames: { button: "b", dangerButton: "d", control: "c" }, notify: () => {}, onApplied: () => {} };

  await tela!.render(React.createElement(SiloArticleWithdrawalPanel, { ...base, articles: [{ articleId: "a1", label: "rotina de skincare" }] }));
  const semAssunto = tela!.container.innerHTML;
  assert.equal(tela!.container.querySelectorAll("[data-article-subject]").length, 0, "chamador antigo (sem subjectPhrase): nenhum Assunto");

  await tela!.render(React.createElement(SiloArticleWithdrawalPanel, { ...base, articles: [
    { articleId: "a1", label: "rotina de skincare", subjectPhrase: FRASE },
    { articleId: "a2", label: "protetor solar", subjectPhrase: null },
  ] }));
  const linhas = tela!.all("silo-withdrawal-subject");
  assert.deepEqual(linhas.map(item => item.textContent), [`Assunto · ${FRASE}`, "Sem Assunto"]);
  assert.notEqual(tela!.container.innerHTML, semAssunto);

  const plano = (articleId: string, label: string) => ({ articleId, label, saudavel: false, bloqueios: [] });
  await tela!.render(React.createElement(ArticleRepairPanel, {
    planos: [plano("a1", "rotina de skincare"), plano("a2", "protetor solar")],
    busy: false, mensagem: null, onReexecutar: () => {}, onDecidir: () => {}, onClose: () => {},
    subjectOf: (articleId: string) => articleId === "a1" ? FRASE : null,
  }));
  assert.deepEqual(tela!.all("architect-repair-subject").map(item => item.textContent), [`Assunto · ${FRASE}`, "Sem Assunto"]);
  await tela!.render(React.createElement(ArticleRepairPanel, {
    planos: [plano("a1", "rotina de skincare")], busy: false, mensagem: null, onReexecutar: () => {}, onDecidir: () => {}, onClose: () => {},
  }));
  assert.equal(tela!.all("architect-repair-subject").length, 0, "sem subjectOf, o painel é o de sempre");
  assert.equal(chamadasDeRede, 0);
});
