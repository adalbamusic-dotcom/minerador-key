/**
 * ===== O ASSUNTO LEGÍVEL NO REDATOR E EM PUBLICAÇÕES — pedido do dono, 2026-10-13 =====
 *
 * "Coloca sempre o assunto no painel para que seja legível."
 *
 * COMPORTAMENTAL — `writerDocumentSubjectPhrase`: a frase vem do ArticleDNA da
 * mesa (`articleVersions[articleDnaRef.entityId].payload.subject.phrase`);
 * sem ele, da linha do tronco gravada no envio (a mesma projeção do painel de
 * fundamentos); sem nenhum dos dois, null. Funciona na cópia de listagem.
 *
 * ESTRUTURAL — a lista de documentos, o cabeçalho do documento aberto e o
 * diálogo "Importar do Radar" usam o componente compartilhado; Publicações o
 * usa na grade (Fila/Publicados/Atualizações) e na Biblioteca, só quando há
 * Assunto. Os entregáveis ("Para escrever" e get_article_for_writing) já
 * levam "Assunto (tronco): …" — guardado aqui para não regredir.
 *
 * Fixtures, sem rede, sem banco, sem IA.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { writerDocumentSubjectPhrase } from "../lib/redator/document-subject.ts";
import { ContentDocumentSchema } from "../lib/arquiteto/contracts.ts";
import { toListingForm } from "../lib/editorial/content-document-listing.ts";
import { ASSUNTO, documentoDoPainel, linhasDoAssunto } from "./redator-assunto-painel-fixtures.mts";

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/[^\n]*/gm, " ");

test("o Assunto do documento: ArticleDNA da mesa primeiro, linha do envio depois, nada sem os dois", () => {
  const comLinhas = documentoDoPainel(linhasDoAssunto());
  const semLinhas = documentoDoPainel();
  const articleId = comLinhas.articleDnaRef.entityId;
  const mesa = { [articleId]: { payload: { subject: { phrase: "Assunto gravado no ArticleDNA" } } } };

  assert.equal(writerDocumentSubjectPhrase(comLinhas, mesa), "Assunto gravado no ArticleDNA", "o ArticleDNA da mesa vence");
  assert.equal(writerDocumentSubjectPhrase(comLinhas, {}), ASSUNTO.phrase, "sem o ArticleDNA na mesa, a linha do tronco do envio");
  assert.equal(writerDocumentSubjectPhrase(semLinhas, {}), null);
  assert.equal(writerDocumentSubjectPhrase(documentoDoPainel([]), {}), null);
  assert.equal(writerDocumentSubjectPhrase(semLinhas, { [articleId]: { payload: {} } }), null, "ArticleDNA sem Assunto");
  assert.equal(writerDocumentSubjectPhrase(semLinhas, { [articleId]: { payload: { subject: { phrase: "  " } } } }), null);
  assert.equal(writerDocumentSubjectPhrase(null, {}), null);

  const listado = toListingForm(ContentDocumentSchema.parse(comLinhas));
  assert.equal(writerDocumentSubjectPhrase(listado, {}), ASSUNTO.phrase, "a cópia de listagem (sem o bundle) tem as linhas do envio");
  assert.equal(chamadasDeRede, 0);
});

test("Redator: lista, cabeçalho e importação mostram o Assunto pelo componente compartilhado", async () => {
  const tela = semComentarios(await fonte("../components/editorial/professional-writer.tsx"));
  assert.match(tela, /import \{ ArticleSubjectLine, articleSubjectPhraseOf \} from "@\/components\/editorial\/article-subject-line";/);
  const lista = tela.slice(tela.indexOf("documentosDaLista.map(item =>"), tela.indexOf("documentosDaLista.map(item =>") + 1500);
  assert.match(lista, /<ArticleSubjectLine as="span" phrase=\{writerDocumentSubjectPhrase\(item, pipeline\.articleVersions\)\}[^>]*\/><strong className="block truncate">\{item\.title\}<\/strong>/, "o Assunto vem antes do título na lista");
  assert.match(tela, /\{listado && <div className="mx-auto mb-3 w-full max-w-\[880px\]"><ArticleSubjectLine phrase=\{writerDocumentSubjectPhrase\(listado, pipeline\.articleVersions\)\} testId="redator-document-header-subject"\/><\/div>\}<div className="mx-auto min-h-\[calc\(100vh-150px\)\]/, "cabeçalho do documento aberto, fora da folha branca");
  assert.match(tela, /rows=\{availableRadarArticles\} subjectOf=\{item => articleSubjectPhraseOf\(pipeline\.articleVersions\[item\.articleId\]\?\.payload\)\}/);
});

test("Publicações: a grade e a Biblioteca mostram o Assunto só quando existe", async () => {
  const tela = semComentarios(await fonte("../modules/publicacoes/publications-workspace.tsx"));
  assert.match(tela, /const assuntoDoArtigo = \(articleId: string\): string \| null => articleSubjectPhraseOf\(pipeline\.articleVersions\[articleId\]\?\.payload\);/);
  assert.match(tela, /header: "Conteúdo"[^\n]*<ArticleSubjectLine as="span" phrase=\{assuntoDoArtigo\(row\.articleId\)\} showEmpty=\{false\}[^>]*\/><span className="max-w-full truncate">\{row\.title\}<\/span>/);
  assert.match(tela, /groupOf=\{grupoDoArtigo\} subjectOf=\{assuntoDoArtigo\}/);
  assert.match(tela, /\{subjectOf \? <ArticleSubjectLine phrase=\{subjectOf\(row\.articleId\)\} showEmpty=\{false\}[^>]*\/> : null\}\s*<p className="truncate text-xs font-semibold text-foreground">\{row\.title\}<\/p>/);
});

test("entregáveis: o CSV 'Para escrever' (e get_article_for_writing, que devolve o mesmo CSV) já leva o Assunto", async () => {
  const exportador = semComentarios(await fonte("../lib/radar/portable-writing-export.ts"));
  assert.match(exportador, /\.\.\.\(p\.assunto \? \[`Assunto \(tronco\): \$\{p\.assunto\.phrase\}/, "linha condicional: sem Assunto, a coluna sai igual");
  const ferramenta = semComentarios(await fonte("../lib/server/platform-mcp-tools.ts"));
  assert.match(ferramenta, /materialDoRadar\(access, articleId, "writing"\)/);
});
