import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertArchitectKeywordDeleteReadback,
  parseArchitectKeywordDeletePreview,
  parseArchitectKeywordDeleteResult,
  selectedArticleKeywordIds,
} from "../lib/arquiteto/selected-keyword-delete-lifecycle.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const articles = [
  { id: "article-a", mainKeywordObj: { id: "keyword-a" }, supportKeywords: [{ id: "keyword-a-2" }] },
  { id: "article-b", mainKeywordObj: { id: "keyword-b" }, supportKeywords: [{ id: "keyword-b-2" }] },
  { id: "article-c", mainKeywordObj: { id: "keyword-c" }, supportKeywords: [] },
] as const;

function preview(ids: string[], publishedIds: string[] = []) {
  return {
    success: true,
    items: ids.map((id, index) => ({
      id,
      keyword: `keyword ${index + 1}`,
      impact: {
        ownedChildren: [{ key: `owned-${id}`, label: "medição operacional", count: 0, classification: "OWNED_CHILD", behavior: "delete" }],
        downstreamDrafts: [],
        sharedReferences: [{ key: `history-${id}`, label: "histórico canônico", count: 1, classification: "CANONICAL_HISTORY", behavior: "preserve" }],
        publishedReferences: [],
      },
    })),
    publishedIds,
    hardDeleteIds: ids.filter(id => !publishedIds.includes(id)),
  };
}

test("a seleção resolve somente Principal e secundárias dos artigos selecionados", () => {
  assert.deepEqual(selectedArticleKeywordIds(new Set(["article-b"]), articles), ["keyword-b", "keyword-b-2"]);
  assert.deepEqual(selectedArticleKeywordIds(new Set(["article-a", "article-c"]), articles), ["keyword-a", "keyword-a-2", "keyword-c"]);
  assert.deepEqual(selectedArticleKeywordIds(new Set(), articles), []);
});

test("a prévia exige a confirmação exata da seleção e preserva impactos canônicos", () => {
  const review = parseArchitectKeywordDeletePreview(["keyword-b", "keyword-b-2"], preview(["keyword-b", "keyword-b-2"]));
  assert.deepEqual(review.ids, ["keyword-b", "keyword-b-2"]);
  assert.deepEqual(review.hardDeleteIds, ["keyword-b", "keyword-b-2"]);
  assert.equal(review.publishedIds.length, 0);
  assert.equal(review.impact.length, 4);
  assert.equal(review.confirmationName, "2 keywords selecionadas");
});

test("a prévia mista mantém o caminho recuperável para publicadas", () => {
  const review = parseArchitectKeywordDeletePreview(["keyword-a", "keyword-b"], preview(["keyword-a", "keyword-b"], ["keyword-a"]));
  assert.deepEqual(review.publishedIds, ["keyword-a"]);
  assert.deepEqual(review.hardDeleteIds, ["keyword-b"]);
});

test("prévia ausente, incompleta ou fora da seleção falha antes do delete", () => {
  assert.throws(() => parseArchitectKeywordDeletePreview(["keyword-a"], preview(["keyword-b"])), /exatamente/);
  assert.throws(() => parseArchitectKeywordDeletePreview(["keyword-a", "keyword-b"], preview(["keyword-a"])), /exatamente/);
  assert.throws(() => parseArchitectKeywordDeletePreview([], preview([])), /exatamente/);
});

test("o resultado precisa confirmar a seleção inteira sem partial delete", () => {
  const review = { ids: ["keyword-a", "keyword-b"] };
  assert.deepEqual(parseArchitectKeywordDeleteResult(review, { success: true, hardDeletedIds: ["keyword-b"], recoverableIds: ["keyword-a"] }), { hardDeletedIds: ["keyword-b"], recoverableIds: ["keyword-a"] });
  assert.throws(() => parseArchitectKeywordDeleteResult(review, { success: true, hardDeletedIds: ["keyword-a"], recoverableIds: [] }), /toda a seleção/);
  assert.throws(() => parseArchitectKeywordDeleteResult(review, { success: false }), /não foi concluída/);
});

test("o readback só aceita a remoção quando nenhuma KeywordDNA selecionada continua ativa", () => {
  const review = { ids: ["keyword-a", "keyword-b"] };
  assert.doesNotThrow(() => assertArchitectKeywordDeleteReadback(review, ["keyword-c"]));
  assert.throws(() => assertArchitectKeywordDeleteReadback(review, ["keyword-a", "keyword-c"]), /readback canônico/);
});

/*
 * F4 · O ARQUITETO SÓ LÊ (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`,
 * item 2, W7; ajuste declarado 2026-10-14): excluir keyword é do Minerador. O
 * Arquiteto não chama mais a prévia nem a exclusão do ciclo de vida (que ele
 * chamava sem `allowRecoverable`); o botão leva ao Minerador com as keywords
 * dos artigos marcadas, e o "Excluir" de lá faz a prévia e a confirmação.
 */
test("F4 · o entrypoint do Arquiteto leva ao Minerador com as keywords marcadas, sem chamar a exclusão", () => {
  const workspace = read("../modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(workspace, /selectedArticleKeywordIds\(selectedArticleIdsRef\.current, articlesList\)/);
  assert.match(workspace, /window\.location\.assign\(mineradorHandoffHref\(serpSubjectBrandRef, \{ action: "selecionar", ids: keywordIds \}\)\)/);
  assert.match(workspace, />Excluir no Minerador</);
  assert.doesNotMatch(workspace, /\/keywords\/delete/);
  assert.doesNotMatch(workspace, /<DeleteConfirmation open=\{keywordDeleteSimpleOpen\}|<PublishedDeleteConfirmation open=\{keywordDeletePublishedOpen\}/);
  assert.doesNotMatch(workspace, /handleDeleteSelectedNonPublished/);
  assert.doesNotMatch(workspace, /\.from\(["']minerador_keywords["']\)[\s\S]{0,180}\.delete\(\)/);
  // No Minerador, o pedido do Arquiteto marca as linhas para a ação de sempre (com a prévia e a confirmação de sempre).
  const minerador = read("../modules/minerador/minerador-workspace.tsx");
  assert.match(minerador, /const pedido = readMineradorHandoff\(url\.searchParams\);/);
  assert.match(minerador, /pendingSheetSelectionRef\.current = pedido\.ids;/);
});
