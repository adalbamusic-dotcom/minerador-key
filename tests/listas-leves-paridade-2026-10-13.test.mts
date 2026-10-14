/**
 * F6 · LISTAS LEVES — PARIDADE (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, §8.3 regra 7).
 *
 * A planilha do Processador passa a ler `analise_leve` da view
 * `minerador_keywords_lista_leve` (migration M-L). Este arquivo prova:
 *
 * 1. a árvore da projeção é a MESMA na SQL da migration e em `KEYWORD_LIGHT_SHAPE`;
 * 2. `resolver(linha inteira) === resolver(linha leve)`, coluna a coluna e em cada
 *    filtro/ordenação da planilha, sobre 33 keywords REAIS (uma por combinação de
 *    estado, das 4 marcas; séries cortadas) e sobre linhas sintéticas de borda;
 * 3. a aprovação usa o veredito da linha inteira (nunca "aprovada" por suposição);
 * 4. nenhuma escrita parte da linha leve (marca + guarda do Assunto + pacote).
 *
 * Testes estruturais limpam comentários antes de casar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowContext, rowModel, listModel, SINTETICAS, type Row } from "./listas-leves-f6-row-model.mts";
import {
  KEYWORD_LIGHT_SHAPE, LISTA_LEVE_KEY, LIGHT_ROW_WRITE_REFUSAL, approvalVerdictCacheKey, approvalVerdictCacheStarted, markApprovalVerdictCacheStarted, assertFullKeywordSemanticForWrite,
  cachedApprovalVerdict, isLightKeywordSemantic, lightKeywordRowFromView, parseApprovalVerdictCache, planLightListVerdicts,
  projectKeywordSemanticForList, readLightListMarker,
} from "../lib/minerador/keyword-light-list.ts";
import { approvedPackageDiverged, buildApprovedPackage } from "../lib/minerador/approved-package.ts";
import { guardKeywordSemanticWrite, semanticForKeywordWrite } from "../lib/minerador/keyword-subject.ts";

const ler = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const MIGRATION = "supabase/migrations/20261016120000_listas_leves.sql";

const reais = JSON.parse(ler("tests/fixtures/listas-leves-f6-keywords.json")) as Row[];

function inputDe(row: Row) {
  return { keywordId: row.id, keyword: row.keyword, intent: row.intent ?? null, volumeSearch: row.volume_search ?? null, resultsAllintitle: row.results_allintitle ?? null, kgrScore: row.kgr_score ?? null, semantic: row.analise_semantica || {} };
}

/** A linha como a view a devolve, já com o veredito calculado na linha inteira. */
function leveDe(row: Row): Row {
  const { analise_semantica, ...colunas } = row;
  const veredito = approvedPackageDiverged(inputDe(row) as never);
  return lightKeywordRowFromView<Row>({ ...colunas, id: row.id, analise_leve: projectKeywordSemanticForList(analise_semantica as never), dna_hash: "h".repeat(32) }, typeof veredito === "boolean" ? veredito : undefined);
}

const sinteticas: Row[] = SINTETICAS;

test("formato · a árvore da SQL (M-L) é a mesma de KEYWORD_LIGHT_SHAPE", () => {
  const sql = ler(MIGRATION);
  const literal = /\$formato\$([\s\S]*?)\$formato\$/.exec(sql)?.[1];
  assert.ok(literal, "a função minerador_keyword_analise_leve carrega a árvore como literal");
  assert.deepEqual(JSON.parse(literal!), KEYWORD_LIGHT_SHAPE);
  assert.equal((sql.match(/\$formato\$/g) || []).length, 2, "um único literal");
});

test("paridade · 33 keywords reais (4 marcas): cada coluna da linha é igual na linha inteira e na leve", () => {
  assert.equal(reais.length, 33);
  const porMarca = new Map<string, Row[]>();
  for (const row of reais) porMarca.set(String(row.brand_id), [...(porMarca.get(String(row.brand_id)) || []), row]);
  for (const [, inteiras] of porMarca) {
    const leves = inteiras.map(leveDe);
    const ci = rowContext(inteiras);
    const cl = rowContext(leves);
    for (let i = 0; i < inteiras.length; i += 1) {
      assert.deepEqual(rowModel(leves[i], cl), rowModel(inteiras[i], ci), `linha ${inteiras[i].keyword}`);
    }
  }
});

test("paridade · filtros e ordenações da planilha devolvem as mesmas linhas, na mesma ordem", () => {
  const leves = reais.map(leveDe);
  const esperado = listModel(reais);
  const obtido = listModel(leves);
  for (const chave of Object.keys(esperado)) assert.deepEqual(obtido[chave], esperado[chave], chave);
});

test("paridade · bordas sintéticas (sem DNA, formato antigo plano, aprovada divergente, publicada, Assunto com plano e a principal declarada)", () => {
  const leves = sinteticas.map(leveDe);
  const ci = rowContext(sinteticas);
  const cl = rowContext(leves);
  for (let i = 0; i < sinteticas.length; i += 1) assert.deepEqual(rowModel(leves[i], cl), rowModel(sinteticas[i], ci), String(sinteticas[i].id));
  assert.equal(rowModel(leves[2], cl).status && (rowModel(leves[2], cl).status as { status: string }).status, "em_revisao", "a aprovada mexida aparece em revisão na lista leve");
  const leve = leves[1].analise_semantica as Record<string, unknown>;
  assert.equal("dna_campos_logicos" in leve, false, "bloco que só o painel lê sai da lista");
  assert.equal("evidencias_logicas" in leve, false);
  assert.equal("site_origins" in (leves[3].analise_semantica as Record<string, unknown>), false);
  assert.equal("publication_link_history" in ((leves[3].analise_semantica as Record<string, Record<string, unknown>>).site_origin), false);
});

test("tamanho · a linha leve é menor que a inteira e que a listagem de antes", () => {
  const inteira = reais.reduce((total, row) => total + JSON.stringify(row).length, 0);
  const leve = reais.reduce((total, row) => { const { analise_semantica, ...c } = row; return total + JSON.stringify({ ...c, analise_leve: projectKeywordSemanticForList(analise_semantica as never), dna_hash: "h".repeat(32) }).length; }, 0);
  assert.ok(leve < inteira * 0.6, `leve ${leve} < 60% de ${inteira}`);
});

test("aprovação · a linha leve usa o veredito da linha inteira; sem veredito, nunca 'aprovada' por suposição", () => {
  const aprovada = reais.find(row => (row.analise_semantica as Record<string, unknown> | null)?.aprovacao && approvedPackageDiverged(inputDe(row) as never) === false);
  assert.ok(aprovada, "a fixture tem uma aprovada que bate");
  const leve = leveDe(aprovada!);
  assert.equal(approvedPackageDiverged(inputDe(leve) as never), false, "com o veredito guardado: aprovada");
  const { analise_semantica, ...colunas } = aprovada!;
  const semVeredito = lightKeywordRowFromView<Row>({ ...colunas, id: aprovada!.id, analise_leve: projectKeywordSemanticForList(analise_semantica as never), dna_hash: "h".repeat(32) });
  assert.equal(approvedPackageDiverged(inputDe(semVeredito) as never), true, "sem veredito: a projeção não assina igual e a linha aparece divergente");
  assert.equal(buildApprovedPackage(inputDe(leve) as never), null, "a linha leve nunca vira pacote aprovado");
  assert.notEqual(buildApprovedPackage(inputDe(aprovada!) as never), null, "a inteira continua virando pacote");
});

test("veredito · plano da carga: sem aprovação fica leve; com veredito do mesmo dna_hash fica leve; o resto é lido inteiro", () => {
  const linhas = [
    { id: "a", analise_leve: {}, dna_hash: "h1" },
    { id: "b", analise_leve: { aprovacao: { signature: "s", contentHash: "c", approvedAt: "t" } }, dna_hash: "h2" },
    { id: "c", analise_leve: { aprovacao: { signature: "s", contentHash: "c", approvedAt: "t" } }, dna_hash: "h3" },
    { id: "d", analise_leve: { aprovacao: { signature: "s", contentHash: "c", approvedAt: "t" } }, dna_hash: null },
  ];
  const cache = parseApprovalVerdictCache(JSON.stringify({ b: { h: "h2", d: false }, c: { h: "velho", d: false }, d: { h: "x", d: true }, lixo: 1 }));
  const plano = planLightListVerdicts(linhas, cache);
  assert.deepEqual(plano.light.map(item => [item.row.id, item.approvalDiverged]), [["a", undefined], ["b", false]]);
  assert.deepEqual(plano.needFull, ["c", "d"], "conteúdo mudou (dna_hash diferente) ou sem hash: lê inteira");
  assert.equal(cachedApprovalVerdict(cache, "c", "h3"), undefined);
  assert.deepEqual(parseApprovalVerdictCache("{quebrado"), {}, "cache corrompido vira vazio (a carga lê inteiro), nunca erro");
  assert.deepEqual(parseApprovalVerdictCache(null), {});
  assert.equal(approvalVerdictCacheKey("ator", "marca"), "minerador:lista-leve:v1:ator:marca:aprovacao", "chave por ator + marca + recorte");
  // A marca de início sobrevive ao parse e nunca casa com uma linha.
  const iniciado = parseApprovalVerdictCache(JSON.stringify(markApprovalVerdictCacheStarted({})));
  assert.equal(approvalVerdictCacheStarted(iniciado), true);
  assert.equal(approvalVerdictCacheStarted({}), false);
  assert.equal(cachedApprovalVerdict(iniciado, "__iniciado", ""), undefined);
});

test("escrita · a marca da lista leve viaja no spread e recusa toda gravação", () => {
  const leve = leveDe(reais[0]);
  const semantica = leve.analise_semantica as Record<string, unknown>;
  assert.ok(isLightKeywordSemantic(semantica));
  assert.ok(readLightListMarker(semantica));
  const derivada = { ...semantica, nicho_override: "x" };
  assert.ok(LISTA_LEVE_KEY in derivada, "o spread leva a marca");
  assert.throws(() => assertFullKeywordSemanticForWrite(semantica, derivada), { message: LIGHT_ROW_WRITE_REFUSAL });
  assert.doesNotThrow(() => assertFullKeywordSemanticForWrite(reais[0].analise_semantica, { ...(reais[0].analise_semantica as object) }));
  const guarda = guardKeywordSemanticWrite(semantica, derivada);
  assert.equal(guarda.ok, false);
  assert.equal(guarda.ok === false && guarda.code, "LIGHT_ROW_WRITE", "a guarda de TODO escritor (tela, servidor, MCP) recusa");
  assert.throws(() => semanticForKeywordWrite(reais[0].analise_semantica as never, derivada), { message: LIGHT_ROW_WRITE_REFUSAL });
});

test("estrutura · a migration cria as views com security_invoker, grants das tabelas base, guardas e pós-checagem", () => {
  const sql = ler(MIGRATION);
  for (const view of ["minerador_keywords_lista_leve", "arquiteto_formation_serp_lista_leve", "editorial_article_dna_lista_leve"]) {
    assert.match(sql, new RegExp(`CREATE VIEW public\\.${view} WITH \\(security_invoker = true\\)`), view);
  }
  assert.match(sql, /REVOKE ALL ON public\.minerador_keywords_lista_leve, public\.arquiteto_formation_serp_lista_leve, public\.editorial_article_dna_lista_leve FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT SELECT ON public\.minerador_keywords_lista_leve, public\.arquiteto_formation_serp_lista_leve, public\.editorial_article_dna_lista_leve TO authenticated, service_role;/);
  assert.match(sql, /RAISE EXCEPTION 'LEVE_PRE: objetos já existem/);
  assert.match(sql, /RAISE EXCEPTION 'LEVE_POS: a view de keywords tem/);
  assert.match(sql, /WHERE k\.deleted_at IS NULL;/);
  assert.match(sql, /^COMMIT;\s*$/m, "o ensaio troca este COMMIT por RAISE 'ENSAIO'");
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER TABLE|DROP TABLE)\b/i, "a M-L não escreve dado nem mexe em tabela");
  const rollback = ler("supabase/rollback/20261016120000_listas_leves.rollback.sql");
  assert.match(rollback, /DROP VIEW IF EXISTS public\.minerador_keywords_lista_leve;/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.minerador_jsonb_por_formato\(jsonb, jsonb\);/);
});

test("estrutura · nenhum caminho de entregável nem de escrita do servidor lê a lista leve", () => {
  const proibido = /keyword-light-list|minerador_keywords_lista_leve|lightKeywordRowFromView|projectKeywordSemanticForList/;
  for (const arquivo of ["lib/server/minerador-keyword-decision-core.ts", "lib/server/minerador-volume-measure.ts", "lib/minerador/approve-and-send-core.ts", "lib/server/platform-mcp-tools.ts", "lib/radar/portable-writing-export.ts", "lib/server/radar-portable-export-core.ts"]) {
    assert.doesNotMatch(semComentarios(ler(arquivo)), proibido, arquivo);
  }
});
