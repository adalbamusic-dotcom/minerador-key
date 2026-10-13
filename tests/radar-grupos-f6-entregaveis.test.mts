import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarWritingGroupLines } from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import { buildRadarArticleBlueprintBrief, radarArticleBlueprintPrompt } from "../lib/radar/article-blueprint.ts";
import { readArticleGroupLabels } from "../lib/editorial/article-group-labels.ts";
import { editorialGroupLabelOf } from "../lib/editorial/editorial-group-scope.ts";
import { EDITORIAL_GROUP_AREAS } from "../lib/editorial/editorial-groups.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { plantaDe } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * ===== 2026-10-12 · F6 · RADAR, REDATOR E PUBLICAÇÕES POR GRUPO =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §6.3,
 * §6.4 e §9.1-A:
 *   · o CSV "Para escrever" (e o get_article_for_writing, pela mesma montagem)
 *     leva o grupo (a cor e o nome) e a promessa declarada, concluídos (D10);
 *   · a regra 24 do artigo-modelo recebe a promessa declarada sem moldura e
 *     parte dela;
 *   · a etiqueta de cor chega ao Redator e a Publicações (escolha por área),
 *     com a lista filtrada e a faixa/etiqueta na linha — só tela, sem mudança
 *     de contrato.
 *
 * Domínio puro, banco de mentira em memória e leitura de fonte. PROVIDER_CALLS = 0.
 */

const D10 = /pend[eê]ncia|pendente de|aguardando aprova|rascunho|fonte a obter|preencher|peça ao Arquiteto/i;
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const G_PLANO = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const G_AZUL = "22222222-3333-4444-8555-666666666666";
const G_FORA = "11111111-2222-4333-8444-555555555555";

const grupoDoPlano = editorialGroupLabelOf({ id: G_PLANO, color: "laranja", name: "Planos e contratação", origin: "declared_plan" });
const grupoManual = editorialGroupLabelOf({ id: G_AZUL, color: "azul", name: "Azul", origin: "manual" });

/* ============================ as linhas do grupo ============================ */

test("F6 · linhas do grupo: a cor e o nome; a promessa declarada sem moldura; sem grupo, nada", () => {
  assert.deepEqual(radarWritingGroupLines(null, "Qualquer promessa"), []);
  assert.deepEqual(radarWritingGroupLines(grupoDoPlano, "Explicar o que comparar antes da contratação."), [
    "Grupo: Laranja · Planos e contratação",
    "Promessa declarada no plano do Silo: Explicar o que comparar antes da contratação.",
  ]);
  assert.deepEqual(radarWritingGroupLines(grupoManual, "Mostrar como comparar custo-benefício."), [
    "Grupo: Azul",
    "Promessa declarada: Mostrar como comparar custo-benefício.",
  ]);
  // A moldura padrão do Arquiteto nunca vira promessa declarada.
  assert.deepEqual(radarWritingGroupLines(grupoDoPlano, "Cobrir com clareza o tema “internet barata”."), ["Grupo: Laranja · Planos e contratação"]);
  assert.deepEqual(radarWritingGroupLines(grupoDoPlano, "Cobrir com clareza o tema “internet barata”, mostrando o custo."), ["Grupo: Laranja · Planos e contratação"]);
  assert.deepEqual(radarWritingGroupLines(grupoDoPlano, null), ["Grupo: Laranja · Planos e contratação"]);
  for (const linha of radarWritingGroupLines(grupoDoPlano, "Explicar.")) assert.doesNotMatch(linha, D10);
});

test("F6 · CSV 'Para escrever': com o mapa de grupos, a coluna artigo ganha só as linhas do grupo; sem ele, byte a byte o de antes", () => {
  const entrada = entradaGoogle();
  const planta = plantaDe(entrada, { silo: null, articleId: ARTIGO, publication: null });
  const montadas = [{ articleId: ARTIGO, entrada, lentes: [], blueprint: planta }];
  const sem = radarPortableWritingExport({ articles: montadas as never, lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM });
  const vazio = radarPortableWritingExport({ articles: montadas as never, lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM, groups: new Map() });
  const com = radarPortableWritingExport({ articles: montadas as never, lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM, groups: new Map([[ARTIGO, grupoDoPlano]]) });
  assert.ok(sem.csv && com.csv);
  assert.equal(vazio.csv, sem.csv, "mapa vazio = o arquivo de antes");
  assert.match(com.csv!, /Grupo: Laranja · Planos e contratação\nPromessa declarada no plano do Silo: Skincare facial passo a passo\n/);
  assert.equal(com.csv!.replace("Grupo: Laranja · Planos e contratação\nPromessa declarada no plano do Silo: Skincare facial passo a passo\n", ""), sem.csv, "só as duas linhas mudam");
  // As linhas vêm logo depois do bloco de publicação, antes da keyword principal.
  const artigo = com.csv!.slice(com.csv!.indexOf("Grupo: Laranja"));
  assert.ok(artigo.indexOf("Promessa declarada no plano do Silo") < artigo.indexOf("Keyword principal:"));
  assert.doesNotMatch(com.csv!.slice(com.csv!.indexOf("Grupo:"), com.csv!.indexOf("Keyword principal:")), D10);
});

/* ============================ a regra 24 e a promessa declarada ============================ */

test("F6 · a regra 24 do artigo-modelo parte da promessa declarada; a promessa do plano chega sem moldura para apagar", () => {
  const base = entradaGoogle();
  const declarada = "Explicar o que comparar antes da contratação: velocidade, preço, cobertura, instalação e quantidade de dispositivos.";
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ article: { ...base.article, promise: declarada } }), silo: null, articleId: ARTIGO, publication: null });
  assert.equal(brief.article.promise, declarada, "a promessa do plano passa como veio");
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(user, new RegExp(`^Promessa declarada: ${declarada.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.match(system, /24\. UM LEITOR SÓ E A PROMESSA: reader é UM público/);
  assert.match(system, /Quando vier 'Promessa declarada' \(no plano do Silo, a descrição do artigo declarada pelo dono\), promise parte dela: o mesmo escopo e o mesmo leitor/);
  assert.match(system, /nunca amplia, estreita nem troca o escopo declarado/);
  // A moldura de antes continua saindo (só ela: nada vai ao pedido).
  const comMoldura = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ article: { ...base.article, promise: "Cobrir com clareza o tema “skincare”." } }), silo: null, articleId: ARTIGO, publication: null });
  assert.equal(comMoldura.article.promise, null);
});

/* ============================ o grupo efetivo de cada artigo ============================ */

const KW_AZUL = "30000000-0000-4000-8000-000000000001";
const KW_SEM = "30000000-0000-4000-8000-000000000002";
const dna = (articleId: string, principal: string, marca = BRAND): Row => ({
  version_id: `v-${articleId}`, entity_id: articleId, version_number: 1, marca_id: marca, artifact_type: "article_dna",
  payload: { principalKeywordId: principal, secondaryKeywordIds: [], narrativeReinforcementIds: [] },
});

function banco(): PlanFakeDb {
  return new PlanFakeDb({
    editorial_groups: [
      { id: G_PLANO, marca_id: BRAND, name: "Planos e contratação", color: "laranja", origin: "declared_plan", status: "active" },
      { id: G_AZUL, marca_id: BRAND, name: "Azul", color: "azul", origin: "manual", status: "active" },
      { id: G_FORA, marca_id: OTHER_BRAND, name: "Fora", color: "verde", origin: "manual", status: "active" },
    ],
    editorial_group_articles: [
      { marca_id: BRAND, article_id: "artigo-gravado", group_id: G_PLANO, origin: "human" },
      // Etiqueta de OUTRA marca para um artigo com o mesmo id: nunca entra.
      { marca_id: OTHER_BRAND, article_id: "artigo-sem-grupo", group_id: G_FORA, origin: "human" },
    ],
    editorial_artifact_versions: [dna("artigo-gravado", KW_SEM), dna("artigo-herdado", KW_AZUL), dna("artigo-sem-grupo", KW_SEM)],
    minerador_keywords: [
      { id: KW_AZUL, brand_id: BRAND, keyword: "internet barata", group_id: G_AZUL, deleted_at: null },
      { id: KW_SEM, brand_id: BRAND, keyword: "internet residencial", group_id: null, deleted_at: null },
    ],
  });
}

test("F6 · readArticleGroupLabels: etiqueta gravada vence, herança pela principal, sem grupo fica de fora; outra marca nunca entra; só lê", async () => {
  const db = banco();
  const antes = JSON.stringify(db.tables);
  const rotulos = await readArticleGroupLabels(db, BRAND, ["artigo-gravado", "artigo-herdado", "artigo-sem-grupo"]);
  assert.equal(rotulos.get("artigo-gravado")?.text, "Laranja · Planos e contratação");
  assert.equal(rotulos.get("artigo-gravado")?.origin, "declared_plan");
  assert.equal(rotulos.get("artigo-herdado")?.text, "Azul");
  assert.equal(rotulos.has("artigo-sem-grupo"), false);
  assert.equal(JSON.stringify(db.tables), antes, "nada é gravado");
  assert.ok(db.log.every(item => item.op === "select"));
  assert.deepEqual([...(await readArticleGroupLabels(db, BRAND, [])).keys()], [], "sem artigo, nenhuma leitura");
});

test("F6 · readArticleGroupLabels nunca derruba o entregável: falha de leitura = mapa vazio", async () => {
  const quebrado = { from() { throw new Error("banco fora do ar"); } };
  const rotulos = await readArticleGroupLabels(quebrado as never, BRAND, ["artigo-gravado"]);
  assert.equal(rotulos.size, 0);
  const semM1 = { from() { return { select() { return this; }, eq() { return this; }, in() { return Promise.resolve({ data: null, error: { code: "42P01", message: "relation \"editorial_group_articles\" does not exist" } }); } }; } };
  assert.equal((await readArticleGroupLabels(semM1 as never, BRAND, ["artigo-gravado"])).size, 0);
});

/* ============================ a montagem, a rota e o MCP ============================ */

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ler = (arquivo: string) => semComentarios(readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8"));

test("F6 · uma montagem só: o núcleo lê o grupo dos montados; a rota e o MCP passam o MESMO mapa à MESMA projeção", () => {
  const nucleo = ler("lib/server/radar-portable-export-core.ts");
  assert.match(nucleo, /readArticleGroupLabels\(getOperationalClient\(\), input\.brandId, montadas\.map\(item => item\.articleId\)\)/);
  assert.match(nucleo, /return \{ exportedAt, montadas, identificacao, recusados, publicacoes, lentes, plano, planoDaSelecao, brandVoice, congelamentos, grupos \};/);
  assert.doesNotMatch(nucleo, /\.insert\(|\.update\(|\.upsert\(|writeArticleGroupRows|ensureArticleGroupsFromKeywordsWithCore/, "o export só lê");
  const rota = ler("app/api/editorial/radar-export/route.ts");
  assert.match(rota, /radarPortableWritingExport\(\{ articles: montadas, lenses: lentes, plan: plano, selectionPlan: planoDaSelecao, publications: publicacoes, today: exportedAt, brandVoice, \.\.\.\(grupos\.size \? \{ groups: grupos \} : \{\}\) \}\)/);
  const material = ler("lib/server/radar-mcp-material.ts");
  assert.match(material, /\.\.\.\(montagem\.grupos\?\.size \? \{ groups: montagem\.grupos \} : \{\}\),/);
  const ferramentas = ler("lib/server/platform-mcp-tools.ts");
  assert.match(ferramentas, /return \{ articleId, filename: pronto\.filename, canWrite: pronto\.blocked === 0, exportedAt: pronto\.exportedAt, group: grupo, \.\.\.sliceWritingCsv/);
  const csv = ler("lib/radar/portable-writing-export.ts");
  assert.match(csv, /\.\.\.radarPublicationIdentityLines\(identidade\),\s*\.\.\.radarWritingGroupLines\(contexto\.group, input\.article\.promise\),\s*"",/);
});

/* ============================ Redator e Publicações ============================ */

test("F6 · a etiqueta de cor vale nas cinco áreas, cada uma com a sua escolha", () => {
  assert.deepEqual([...EDITORIAL_GROUP_AREAS], ["minerador", "arquiteto", "radar", "redator", "publicacoes"]);
});

test("F6 · Redator: a lista de documentos é filtrada pela cor da área e cada linha tem faixa e etiqueta; o documento ativo e o editor leem todos", () => {
  const redator = ler("components/editorial/professional-writer.tsx");
  assert.match(redator, /useEditorialGroups\(\{ brandId: selectedBrandId \|\| null, enabled: Boolean\(selectedBrandId\), area: "redator", mainReady: !pipeline\.loading \}\)/, "leitura pesada só depois da mesa (ou com cor)");
  assert.match(redator, /documentosDaLista\.map\(item => <button key=\{item\.id\}/);
  assert.doesNotMatch(redator, /\{documents\.map\(item => <button/, "a lista não renderiza mais todos os documentos");
  assert.match(redator, /availableIds: documentIds,/, "a regra do documento ativo continua com a lista inteira");
  assert.match(redator, /const documentIds = documents\.map\(item => item\.id\);/);
  assert.match(redator, /editorialGroupStripeClass\(grupoDoDocumento\(item\)\)/);
  assert.match(redator, /<ArticleGroupRowTag group=\{grupoDoDocumento\(item\)\}/);
  assert.match(redator, /groupTagUngroupedDetail: documentosSemGrupo === null \? "" : `\$\{documentosSemGrupo\} documento/);
  assert.match(redator, /Nenhum documento na cor \$\{EDITORIAL_GROUP_COLOR_LABELS\[gruposDoRedator\.choice\]\} ainda\./);
  assert.doesNotMatch(redator, /ensureEditorialColorGroup|moveArticlesToColor|applyTagging/, "o Redator só mostra e filtra");
});

test("F6 · Publicações: Biblioteca e planilha filtradas pela cor da área, faixa e etiqueta na linha; o eixo de entrega continua", () => {
  const publicacoes = ler("modules/publicacoes/publications-workspace.tsx");
  assert.match(publicacoes, /useEditorialGroups\(\{ brandId: selectedBrandId \|\| null, enabled: Boolean\(selectedBrandId\), area: "publicacoes", mainReady: !pipeline\.loading \}\)/);
  const gancho = publicacoes.indexOf('area: "publicacoes"');
  assert.ok(gancho > 0 && gancho < publicacoes.indexOf("if (pipeline.loading && !pipeline.snapshot)"), "o hook vem antes de qualquer retorno");
  assert.match(publicacoes, /const libraryDoEixo = filterEditorialLibrary\(libraryRows, libraryStatus\);\s*const libraryVisible = libraryDoEixo\.filter\(row => doGrupo\(row\.articleId\)\);/);
  assert.match(publicacoes, /rowFilter=\{filtroDoGrupo\} rowStripeClassName=\{row => editorialGroupStripeClass\(grupoDoArtigo\(row\.articleId\)\)\}/);
  assert.match(publicacoes, /groupTagUngroupedDetail: semGrupoNaEtiqueta/);
  assert.match(publicacoes, /<PublicacoesAreaTabs tabs=\{areaTabs\} ungroupedDetail=\{semGrupoNaEtiqueta\}\/>/);
  assert.match(publicacoes, /<ArticleGroupRowTag group=\{groupOf\(row\.articleId\)\}\/>/);
  assert.doesNotMatch(publicacoes, /ensureEditorialColorGroup|moveArticlesToColor|applyTagging/, "Publicações só mostra e filtra");
});

test("F6 · Radar: a mesa já filtra pela cor e mostra faixa e etiqueta (sem mudança nesta fase)", () => {
  const radar = ler("modules/radar/radar-page.tsx");
  assert.match(radar, /useEditorialGroups\(\{ brandId: selectedBrandId \|\| null, enabled: Boolean\(selectedBrandId\), area: "radar", mainReady: !pipeline\.loading \}\)/);
  assert.match(radar, /rowFilter=\{filtroDoGrupo\} rowStripeClassName=\{row => editorialGroupStripeClass\(grupoDoItem\(row\)\)\}/);
  assert.match(radar, /<ArticleGroupRowTag group=\{grupoDoItem\(row\)\}/);
});
