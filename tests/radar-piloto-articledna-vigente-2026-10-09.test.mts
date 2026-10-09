import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { radarCurrentArticleDnaVersion } from "../lib/radar/article-dna-current.ts";
import { resolveVersionAuthority } from "../lib/arquiteto/canonical-version-authority.ts";
import { effectiveVersionStatus } from "../lib/editorial/operational-flow.ts";

/*
 * ===== 2026-10-09 · A VERSÃO VIGENTE DO ARTICLEDNA NO DOSSIÊ PORTÁTIL =====
 *
 * O núcleo do export escolhia a versão com `find()` sobre `ArtifactRepository.list`,
 * que não ordena. Depois de um reajuste (versão nova aprovada do ArticleDNA), o
 * CSV, o artigo-modelo e a prontidão descreviam a versão antiga ou a nova
 * conforme a ordem em que o banco devolveu as linhas.
 *
 * A regra é a canônica da plataforma (`canonical-version-authority`, a mesma da
 * mesa do Arquiteto): a última APROVADA; sem aprovada, a mais nova viva.
 */

const versao = (numero: number, patch: { articleId?: string; brandId?: string } = {}) => ({
  versionId: `dna-v${numero}${patch.articleId && patch.articleId !== "artigo-1" ? `-${patch.articleId}` : ""}${patch.brandId && patch.brandId !== "marca-1" ? `-${patch.brandId}` : ""}`,
  versionNumber: numero,
  payload: { articleId: patch.articleId ?? "artigo-1", brandId: patch.brandId ?? "marca-1" },
});

const evento = (versionId: string, status: string, occurredAt: string) => ({ versionId, status, occurredAt, eventId: `${versionId}:${status}`, actorId: "u", reason: "r" });

const escolher = (versoes: ReturnType<typeof versao>[], eventos: ReturnType<typeof evento>[], articleId = "artigo-1") =>
  radarCurrentArticleDnaVersion({ versions: versoes, events: eventos, brandId: "marca-1", articleId })?.versionId ?? null;

test("duas versões aprovadas fora de ordem: a vigente é a de maior número, nas duas ordens de leitura", () => {
  const v1 = versao(1), v2 = versao(2);
  const eventos = [evento(v1.versionId, "approved", "2026-10-01T10:00:00.000Z"), evento(v2.versionId, "approved", "2026-10-08T10:00:00.000Z")];
  assert.equal(escolher([v2, v1], eventos), "dna-v2");
  assert.equal(escolher([v1, v2], eventos), "dna-v2");
  /* O `find()` antigo dependia da ordem: sobre [v1, v2] ele devolvia a versão antiga. */
  assert.equal([v1, v2].find(item => item.payload.articleId === "artigo-1")?.versionId, "dna-v1");
});

test("a proposta mais nova não tira a autoridade da aprovada; rejeitada e substituída saem da disputa", () => {
  const v1 = versao(1), v2 = versao(2), v3 = versao(3);
  const aprovadas = [evento(v1.versionId, "approved", "2026-10-01T10:00:00.000Z"), evento(v2.versionId, "approved", "2026-10-08T10:00:00.000Z")];
  assert.equal(escolher([v3, v1, v2], [...aprovadas, evento(v3.versionId, "proposed", "2026-10-09T10:00:00.000Z")]), "dna-v2");
  assert.equal(escolher([v3, v1, v2], [...aprovadas, evento(v2.versionId, "rejected", "2026-10-09T11:00:00.000Z")]), "dna-v1", "a aprovada rejeitada depois sai");
  assert.equal(escolher([v1, v2], [evento(v1.versionId, "approved", "2026-10-01T10:00:00.000Z"), evento(v2.versionId, "superseded", "2026-10-09T11:00:00.000Z")]), "dna-v1");
});

test("sem nenhum evento (acervo antigo), vale a mais nova — sempre a mesma; tudo rejeitado, nenhuma; outra marca ou outro artigo nunca entram", () => {
  assert.equal(escolher([versao(2), versao(5), versao(3)], []), "dna-v5");
  assert.equal(escolher([versao(3), versao(5), versao(2)], []), "dna-v5");
  const v1 = versao(1);
  assert.equal(escolher([v1], [evento(v1.versionId, "rejected", "2026-10-01T10:00:00.000Z")]), null);
  const alheia = versao(9, { brandId: "marca-2" });
  const outroArtigo = versao(8, { articleId: "artigo-2" });
  assert.equal(escolher([alheia, outroArtigo, versao(1)], []), "dna-v1");
  assert.equal(escolher([alheia], []), null);
});

test("é a MESMA regra da mesa do Arquiteto (resolveVersionAuthority + effectiveVersionStatus)", () => {
  const versoes = [versao(4), versao(1), versao(3), versao(2)];
  const eventos = [
    evento("dna-v1", "approved", "2026-10-01T10:00:00.000Z"),
    evento("dna-v3", "approved", "2026-10-03T10:00:00.000Z"),
    evento("dna-v4", "proposed", "2026-10-04T10:00:00.000Z"),
  ];
  const autoridade = resolveVersionAuthority({ versions: versoes, statusOf: id => effectiveVersionStatus(id, eventos as never) });
  assert.equal(escolher(versoes, eventos), autoridade.canonical?.versionId);
  assert.equal(escolher(versoes, eventos), "dna-v3");
});

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

test("o núcleo do export escolhe a versão pela regra, com os eventos que o lote já leu (nenhuma leitura nova)", async () => {
  const nucleo = semComentarios(await readFile(new URL("../lib/server/radar-portable-export-core.ts", import.meta.url), "utf8"));
  const laco = nucleo.slice(nucleo.indexOf("for (const articleId of [...new Set(input.articleIds)])"), nucleo.indexOf("const corrente = await radarExportArticleReads.currentAnalysis"));
  /* 2026-10-09 (correção) · antes da análise, a regra da mesa só confere que o artigo existe nesta marca. */
  assert.match(laco, /const daMesa = radarCurrentArticleDnaVersion\(\{ versions: artefatos\.articles, events: artefatos\.events, brandId: input\.brandId, articleId \}\);/);
  assert.doesNotMatch(laco, /artefatos\.articles\.find\(/, "a escolha voltou a depender da ordem da leitura");
  /* A versão do dossiê é a TRANSPORTADA (a que a análise corrente carrega, a do item do Radar), escolhida pela mesma regra. */
  const depois = nucleo.slice(nucleo.indexOf("const corrente = await radarExportArticleReads.currentAnalysis"), nucleo.indexOf("const fundamento = {"));
  assert.match(depois, /const article = radarCurrentArticleDnaVersion\(\{\s*versions: artefatos\.articles, events: artefatos\.events, brandId: input\.brandId, articleId,\s*transportedVersionId: corrente\.payload\.articleDnaVersionId,\s*\}\) \?\? daMesa;/);
  assert.doesNotMatch(depois, /artefatos\.articles\.find\(/);
  assert.equal((nucleo.match(/new ArtifactRepository\(\)\.list\(/g) || []).length, 1, "uma leitura do acervo por lote");
});
