/**
 * F6 · LISTAS LEVES NO PROCESSADOR (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 4).
 *
 * A planilha lê da view leve e cai para a listagem de antes sem ela; o DNA
 * inteiro é lido por id ao abrir o painel, ao selecionar e na entrada de cada
 * ação; nenhuma operação da planilha (ações em lote, ações de uma linha, CSV)
 * roda sobre a linha leve — e nenhuma fica parcial em silêncio. Estrutural
 * (o componente é grande demais para montar aqui); comentários são limpos
 * antes de casar. A paridade dos resolvers está em `listas-leves-paridade-2026-10-13.test.mts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const tela = semComentarios(ler("modules/minerador/minerador-workspace.tsx"));

function corpo(nome: string): string {
  const inicio = tela.indexOf(`const ${nome} = `);
  assert.ok(inicio >= 0, `${nome} existe`);
  const proximo = tela.slice(inicio + 10).search(/\n  const [A-Za-z]+ = (async |useCallback|useMemo|\()/);
  return proximo < 0 ? tela.slice(inicio) : tela.slice(inicio, inicio + 10 + proximo);
}

test("carga · a planilha lê a view leve primeiro; sem ela (42P01/PGRST205), a sessão volta à listagem de antes", () => {
  const carga = corpo("fetchData");
  assert.match(carga, /const leve = await lerDe\(MINERADOR_LIGHT_LIST_VIEW, true, iniciado \? MINERADOR_LIGHT_LIST_COLUMNS : "id,dna_hash"\);/);
  assert.match(carga, /if \(leve\.error && viewLeveAusente\(leve\.error\)\) fonteLeveDisponivel = false;\s*else if \(leve\.error\) throw leve\.error;/, "outro erro não vira lista vazia");
  assert.match(carga, /else if \(iniciado\) return await completeLightListRows\(/);
  assert.ok(carga.indexOf("completeLightListRows") < carga.indexOf("lerDe(fonteDaListagem)"), "a leitura de antes só depois do recuo");
  // 1ª carga da marca neste navegador: a listagem de antes (mais só id,dna_hash) semeia os vereditos — não lê leve + inteira.
  assert.match(carga, /if \(primeiraCarga\) await seedApprovalVerdicts\(\(keywordsData \|\| \[\]\) as KeywordItem\[\], primeiraCarga\);/);
  const semeia = corpo("seedApprovalVerdicts");
  assert.match(semeia, /hashAfter\.get\(row\.id\) !== hash\) continue;/);
  assert.match(semeia, /writeApprovalVerdictCache\(cacheKey, markApprovalVerdictCacheStarted\(cache\)\);/);
  assert.match(tela, /function viewLeveAusente\([^)]*\)[^{]*\{[\s\S]*?code === "42P01" \|\| code === "PGRST205"/);
});

test("carga · o veredito da aprovação vem da linha INTEIRA; a leitura que falha derruba a carga (nunca troca por parcial)", () => {
  const completa = corpo("completeLightListRows");
  assert.match(completa, /planLightListVerdicts\(rows, cache\)/);
  assert.match(completa, /await readCanonicalKeywordRows\(plan\.needFull\)/, "sem .catch: falha propaga e a lista de antes fica");
  assert.doesNotMatch(completa, /readCanonicalKeywordRows\(plan\.needFull\)\.catch/);
  assert.match(completa, /hashAfter\.get\(id\) !== hash\) continue;/, "veredito só vai para o cache se o conteúdo não mudou entre as leituras");
  assert.match(completa, /approvedPackageDiverged\(\{ keywordId: full\.id/);
  assert.match(completa, /fullById\.get\(String\(row\.id\)\) \?\? lightKeywordRowFromView<KeywordItem>\(row, verdictById\.get\(String\(row\.id\)\)\)/);
  const leitor = corpo("readCanonicalKeywordRows");
  assert.match(leitor, /const source = options\.source \|\| MINERADOR_KEYWORDS_TABLE;/, "a linha inteira vem da TABELA");
});

test("detalhe por id · troca só a linha leve, nunca uma inteira (gravada depois); seleção e painel pedem o DNA", () => {
  const hidrata = corpo("ensureFullKeywords");
  assert.match(hidrata, /full\.has\(item\.id\) && isLightKeywordSemantic\(item\.analise_semantica\) \? full\.get\(item\.id\)! : item/);
  assert.match(hidrata, /await readCanonicalKeywordRows\(light\)/);
  assert.match(tela, /const leves = \[\.\.\.selectedIds\]\.filter\(id => isLightKeywordSemantic\(rowById\.get\(id\)\?\.analise_semantica\)/, "a seleção comanda as ações: lê o DNA das selecionadas");
  assert.match(tela, /const keywordId = expandedRowId;\s*if \(!keywordId\) return;\s*const row = keywords\.find\(item => item\.id === keywordId\);\s*if \(!isLightKeywordSemantic\(row\?\.analise_semantica\)/, "abrir o painel lê o DNA daquela keyword");
});

test("ações · nenhuma ação em lote começa sobre linha leve (o portão comum de todas)", () => {
  const portao = corpo("startBulkProgress");
  assert.match(portao, /const leves = alvo\.filter\(id => isLightKeywordSemantic\(rowById\.get\(id\)\?\.analise_semantica\)\);\s*if \(leves\.length > 0\) \{[\s\S]*?return false;\s*\}/);
  assert.ok(portao.indexOf("leves.length > 0") < portao.indexOf("bulkProgressLockRef.current = true"), "recusa antes de trancar o lote");
});

test("ações de uma linha · leem a linha inteira por id antes de gravar", () => {
  assert.match(corpo("handleHumanReviewAction"), /const item = selectedBrandId \? await fullKeywordFor\(keywordId\) : null;/);
  assert.match(corpo("handlePublicationLinkAction"), /const item = await fullKeywordFor\(itemDaLinha\.id\);\s*if \(!item\) return;/);
});

test("escritas · todo UPDATE de analise_semantica da tela passa pela guarda (marca da lista leve)", () => {
  const updates = [...tela.matchAll(/\.update\(\{[^}]*analise_semantica[^}]*\}\)/g)].map(m => m[0]);
  assert.ok(updates.length >= 6, `${updates.length} escritas de analise_semantica`);
  for (const update of updates) assert.match(update, /semanticForKeywordWrite\(/, update);
  const payloads = [...tela.matchAll(/const payload: Record<string, unknown> = \{ analise_semantica: ([A-Za-z.]+) \};/g)];
  assert.equal(payloads.length, 2);
  for (const payload of payloads) {
    const antes = tela.slice(Math.max(0, payload.index! - 200), payload.index!);
    assert.match(antes, new RegExp(`assertFullKeywordSemanticForWrite\\([^)]*${payload[1].replace(".", "\\.")}\\)`), payload[0]);
  }
});

test("CSV · leva TODAS as chaves: lê as selecionadas inteiras e não exporta nada se alguma ficou leve", () => {
  const csv = corpo("exportSelectedToCSV");
  assert.match(csv, /fullById = await ensureFullKeywords\(\[\.\.\.selectedIds\]\);/);
  assert.match(csv, /if \(selectedKeywords\.some\(k => isLightKeywordSemantic\(k\.analise_semantica\)\)\) \{[\s\S]*?return;/);
  assert.match(tela, /void exportSelectedToCSV\(exportFileName\);/);
});

test("cache local · só apresentação, chave por ator+marca+recorte, nunca limpo", () => {
  assert.match(tela, /approvalVerdictCacheKey\(actorUserId, selectedBrandId\)/);
  assert.doesNotMatch(tela, /localStorage\.(removeItem|clear)\(|indexedDB\.deleteDatabase/);
});
