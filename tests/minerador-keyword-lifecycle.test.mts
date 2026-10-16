import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  keywordRecoveryRemainingLabel,
  resolveKeywordPublication,
} from "../lib/minerador/keyword-lifecycle.ts";

/*
 * 2026-10-16 · F1 da linha única do Minerador (P-8): as decisões de exclusão do
 * cliente sem uso em produção saíram (`assessKeywordHardDelete`,
 * `keywordHardDeleteBlockMessage`, o catálogo de dependências, o erro de
 * auditoria, `recoverablePurgeAfter`, `canRestoreKeyword`), e os testes que só
 * as testavam saíram junto. Quem decide é a RPC do ciclo de vida; o cenário G15
 * (`tests/minerador-linha-unica-cenarios.test.mts`) confere a regra nela.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

test("a publicação é resolvida antes da confirmação e a mutação usa a rota transacional", () => {
  const start = workspace.indexOf("const handleBatchDelete");
  const end = workspace.indexOf("const organizeFilterLabels", start);
  const handler = workspace.slice(start, end);
  assert.ok(handler.indexOf("requestKeywordDeletePreview") >= 0);
  assert.doesNotMatch(handler, /window\.confirm/);
  assert.match(workspace, /<DeleteConfirmation/);
  assert.match(workspace, /<PublishedDeleteConfirmation/);
  assert.doesNotMatch(handler, /\.from\("minerador_keywords"\)/);
  assert.doesNotMatch(handler, /\.delete\(\)/);
  assert.match(workspace, /keywords\/delete\/preview/);
  assert.match(workspace, /keywords\/delete/);
});

test("duplicatas e recuperação usam o mesmo gate server-side", () => {
  assert.match(workspace, /handleBatchDelete\(false, idsToDelete\)/);
  assert.doesNotMatch(workspace, /executeKeywordDeletion\(\{ ids: idsToDelete/);
  assert.match(workspace, /loadRecoverableKeywords\(selectedBrandId\)/);
  assert.doesNotMatch(workspace, /new Date\(Date\.parse\(deletedAt\)/);
});

test("carregar a tela não executa mais hard delete automático de duplicatas", () => {
  const start = workspace.indexOf("let loadedKeywords =");
  const end = workspace.indexOf("// B.", start);
  const hydration = workspace.slice(start, end);
  assert.doesNotMatch(hydration, /\.delete\(\)/);
});

test("status editorial e vínculo candidato não são usados como archive", () => {
  assert.doesNotMatch(workspace, /status\s*=\s*["']archived["']/i);
  assert.doesNotMatch(workspace, /publicationStatus\s*=\s*["']archived["']/i);
});

test("a janela recuperável mostra o tempo que falta, lido do purge_after gravado pela RPC", () => {
  const deletedAt = "2026-08-20T12:00:00.000Z";
  const purgeAfter = "2026-08-21T12:00:00.000Z";
  assert.match(keywordRecoveryRemainingLabel({ deleted_at: deletedAt, purge_after: purgeAfter }, new Date("2026-08-20T13:00:00.000Z")), /23h/);
  assert.equal(keywordRecoveryRemainingLabel({ deleted_at: deletedAt, purge_after: purgeAfter }, new Date("2026-08-21T12:00:00.000Z")), "Janela encerrada");
  assert.equal(keywordRecoveryRemainingLabel({ deleted_at: deletedAt, purge_after: null }), "Janela de recuperação indisponível");
});

test("a fonte publicada é formal ou linhagem canônica, nunca DNA/metrics/workflow/status legado", () => {
  assert.deepEqual(resolveKeywordPublication({ status: "bruto", semantic: { keyword_dna: { version: 1 }, workflow: { state: "approved" } } }), { isPublished: false, source: "none" });
  assert.deepEqual(resolveKeywordPublication({ status: "publicado", semantic: null }), { isPublished: false, source: "legacy_unverified" });
  assert.deepEqual(resolveKeywordPublication({
    status: "aprovado",
    semantic: {
      site_origin: {
        publicationStatus: "published",
        resolvedUrl: "https://example.com/keyword",
        urlSituation: "accessible",
        lastCheckedAt: "2026-08-20T12:00:00.000Z",
        publicationConfirmedBy: "actor-1",
        publicationConfirmedAt: "2026-08-20T12:01:00.000Z",
      },
    },
  }), { isPublished: true, source: "formal_site_link" });
});

test("o pacote não usa CASCADE como atalho client-side", () => {
  assert.doesNotMatch(workspace, /ALTER\s+TABLE[\s\S]{0,120}ON\s+DELETE\s+CASCADE/i);
});

test("a tela não consulta fonte legada de dependência", () => {
  assert.equal(workspace.includes("brand_site_keyword_candidates"), false);
  assert.doesNotMatch(workspace, /site_import_reference/);
});
