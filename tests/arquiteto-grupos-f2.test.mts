import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import {
  articleIdsInGroupFilter,
  articleKeywordIndex,
  closeKeywordSetOverArticles,
  filterRowsByEditorialGroup,
  inheritArticleGroup,
  parseGroupIdQuery,
  planArticleGroupMove,
  planArticleGroupTagging,
  resolveArticleGroupMemberships,
  sharedGroupOf,
  type ArticleKeywordIndex,
} from "../lib/editorial/article-groups.ts";
import { readArticleGroupMemberships, readGroupedKeywordIndex, readKeywordIdsInGroupFilter } from "../lib/editorial/article-groups-store.ts";
import {
  applyArticleGroupTaggingWithCore,
  ensureArticleGroupsFromKeywordsWithCore,
  moveArticlesToGroupWithCore,
  previewArticleGroupTaggingWithCore,
} from "../lib/editorial/article-group-core.ts";
import { GroupsFakeDb, type Row } from "./editorial-grupos-fake-db.mts";

/**
 * F2 DA SDD DE 2026-10-12 — O GRUPO NO ARQUITETO E NO RADAR.
 *
 * Domínio (a regra da herança, a prévia, o mover, o filtro), repositório e
 * núcleo com banco de mentira (sem Supabase, sem rede, sem custo), o
 * isolamento entre marcas e as provas estruturais das duas telas. A fixture
 * espelha a WifiConecta lida por SELECT em 2026-10-12: 8 ArticleDNA vigentes,
 * todas as keywords no grupo "laranja", 7 artigos com Assunto e 1 sem
 * ("plano vivo controle").
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MARCA = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OUTRA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ATOR = "11111111-1111-4111-8111-111111111111";
const LARANJA = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const AZUL = uuid(9001);
const ARQUIVADO = uuid(9002);
const GRUPO_DA_OUTRA = uuid(9003);

/* ------------------------------ fixture ------------------------------ */

type Artigo = { articleId: string; principal: string; texto: string; subject: string | null; outras: string[] };

/** Os 8 artigos da WifiConecta (ids de artigo reais; keywords da fixture). */
const ARTIGOS: Artigo[] = [
  { articleId: "04320a9b-94bf-467c-9dfb-cd602a6228d7", principal: uuid(11), texto: "internet residencial barata", subject: "04320a9b-94bf-467c-9dfb-cd602a6228d7", outras: [uuid(12), uuid(13), uuid(14), uuid(15)] },
  { articleId: "4339882e-6fe7-49b7-a7ea-975ecaef5b82", principal: uuid(21), texto: "melhor plano de internet residencial", subject: "4339882e-6fe7-49b7-a7ea-975ecaef5b82", outras: [uuid(22), uuid(23)] },
  { articleId: "4ac4d315-59f8-404d-bcb9-638b7d730b68", principal: uuid(31), texto: "internet residencial sem fidelidade", subject: "4ac4d315-59f8-404d-bcb9-638b7d730b68", outras: [] },
  { articleId: "6d5d87cd-3f0f-4431-bef4-81285715db0e", principal: uuid(41), texto: "claro ou vivo", subject: "6d5d87cd-3f0f-4431-bef4-81285715db0e", outras: [uuid(42), uuid(43), uuid(44), uuid(45), uuid(46)] },
  { articleId: "a1306160-1133-4a62-9924-8880aaa60dc1", principal: uuid(51), texto: "contratar internet residencial", subject: "a1306160-1133-4a62-9924-8880aaa60dc1", outras: [uuid(52), uuid(53), uuid(54), uuid(55), uuid(56)] },
  { articleId: "article-candidate:territory:9c75c3a7-15e1-4655-b627-c08e394b4606:679b1bb2-c0b8-40a0-bf18-07600d2cb92f", principal: "679b1bb2-c0b8-40a0-bf18-07600d2cb92f", texto: "plano vivo controle", subject: null, outras: [] },
  { articleId: "d59f40a5-5562-47e9-b23d-2a435f891fd0", principal: uuid(71), texto: "combo internet celular e TV", subject: "d59f40a5-5562-47e9-b23d-2a435f891fd0", outras: [uuid(72), uuid(73), uuid(74), uuid(75), uuid(76)] },
  { articleId: "f6c2f85e-f921-48ed-9dc7-172ae4aa9758", principal: uuid(81), texto: "internet disponível no meu cep", subject: "f6c2f85e-f921-48ed-9dc7-172ae4aa9758", outras: [uuid(82), uuid(83), uuid(84), uuid(85)] },
];

function keyword(id: string, brand: string, group: string | null, texto = `keyword ${id.slice(-4)}`): Row {
  return { id, brand_id: brand, keyword: texto, group_id: group, deleted_at: null };
}

/** ArticleDNA cru, como está gravado em produção (`payload ? 'principalKeywordId'`). */
function dna(artigo: Artigo, brand: string, version = 1): Row {
  return {
    version_id: `${artigo.articleId}:v${version}`,
    entity_id: artigo.articleId,
    version_number: version,
    marca_id: brand,
    artifact_type: "article_dna",
    payload: {
      articleId: artigo.articleId,
      brandId: brand,
      principalKeywordId: artigo.principal,
      secondaryKeywordIds: artigo.outras.slice(0, 5),
      narrativeReinforcementIds: [],
      ...(artigo.subject ? { subject: { keywordId: artigo.subject } } : {}),
    },
  };
}

function wifiConecta(): GroupsFakeDb {
  const keywords: Row[] = [];
  for (const artigo of ARTIGOS) {
    keywords.push(keyword(artigo.principal, MARCA, LARANJA, artigo.texto));
    if (artigo.subject && artigo.subject !== artigo.principal) keywords.push(keyword(artigo.subject, MARCA, LARANJA, `assunto ${artigo.texto}`));
    for (const outra of artigo.outras) keywords.push(keyword(outra, MARCA, LARANJA));
  }
  return new GroupsFakeDb({
    editorial_groups: [
      { id: LARANJA, marca_id: MARCA, name: "laranja", color: "laranja", status: "active" },
      { id: AZUL, marca_id: MARCA, name: "azul", color: "azul", status: "active" },
      { id: ARQUIVADO, marca_id: MARCA, name: "velho", color: "verde", status: "archived" },
      { id: GRUPO_DA_OUTRA, marca_id: OUTRA, name: "laranja", color: "laranja", status: "active" },
    ],
    editorial_group_articles: [],
    editorial_group_events: [],
    minerador_keywords: keywords,
    editorial_artifact_versions: [
      ...ARTIGOS.map(artigo => dna(artigo, MARCA)),
      // Uma versão mais nova do artigo 3 (a herança lê a VIGENTE).
      { ...dna(ARTIGOS[3], MARCA, 3) },
    ],
  });
}

/* ============================ domínio ============================ */

const indice = (input: Partial<ArticleKeywordIndex> & { articleId: string }): ArticleKeywordIndex => articleKeywordIndex(input);

test("herança · Assunto primeiro, depois a principal, depois a maioria; empate não escolhe", () => {
  const grupos = new Map<string, string | null>([["s", "A"], ["p", "B"], ["k1", "C"], ["k2", "C"], ["k3", "D"], ["k4", "D"]]);
  const assunto = inheritArticleGroup(indice({ articleId: "x", subjectKeywordId: "s", principalKeywordId: "p", keywordIds: ["k1"] }), grupos);
  assert.deepEqual([assunto.groupId, assunto.origin, assunto.reason], ["A", "subject", "subject"]);
  const principal = inheritArticleGroup(indice({ articleId: "x", subjectKeywordId: "sem", principalKeywordId: "p", keywordIds: ["k1", "k2"] }), grupos);
  assert.deepEqual([principal.groupId, principal.origin], ["B", "principal"]);
  const maioria = inheritArticleGroup(indice({ articleId: "x", principalKeywordId: "sem", keywordIds: ["k1", "k2", "k3"] }), grupos);
  assert.deepEqual([maioria.groupId, maioria.origin, maioria.reason], ["C", "keywords", "majority"]);
  assert.deepEqual(maioria.counts, [{ groupId: "C", count: 2 }, { groupId: "D", count: 1 }]);
  const empate = inheritArticleGroup(indice({ articleId: "x", principalKeywordId: "sem", keywordIds: ["k1", "k2", "k3", "k4"] }), grupos);
  assert.deepEqual([empate.groupId, empate.reason], [null, "tie"], "dois grupos com o mesmo número: conflito visível, sem grupo");
  const nada = inheritArticleGroup(indice({ articleId: "x", principalKeywordId: "sem", keywordIds: ["outra"] }), grupos);
  assert.deepEqual([nada.groupId, nada.reason], [null, "no_group"]);
  // Keyword repetida não conta duas vezes.
  const repetida = inheritArticleGroup(indice({ articleId: "x", principalKeywordId: "sem", keywordIds: ["k3", "k3", "k1"] }), grupos);
  assert.equal(repetida.reason, "tie");
});

test("grupo efetivo · etiqueta gravada vence a herança; artigo só com etiqueta continua listado", () => {
  const grupos = new Map<string, string | null>([["p1", "A"], ["p2", "A"]]);
  const memberships = resolveArticleGroupMemberships({
    articles: [indice({ articleId: "a1", principalKeywordId: "p1" }), indice({ articleId: "a2", principalKeywordId: "p2" })],
    persisted: [{ articleId: "a2", groupId: "B", origin: "human" }, { articleId: "a9", groupId: "A", origin: "subject" }],
    keywordGroupById: grupos,
  });
  assert.deepEqual(memberships.get("a1"), { articleId: "a1", groupId: "A", origin: "principal", persisted: false, conflict: false, inherited: memberships.get("a1")!.inherited });
  assert.equal(memberships.get("a2")!.groupId, "B");
  assert.equal(memberships.get("a2")!.persisted, true);
  assert.equal(memberships.get("a2")!.inherited!.groupId, "A", "a herança continua visível para a prévia");
  assert.equal(memberships.get("a9")!.groupId, "A");
});

test("prévia · will_tag, já etiquetado, outra etiqueta mantida, empate, sem grupo e grupo arquivado", () => {
  const grupos = new Map<string, string | null>([["p1", "A"], ["p2", "A"], ["p3", "A"], ["k1", "A"], ["k2", "B"], ["p6", "Z"]]);
  const memberships = resolveArticleGroupMemberships({
    articles: [
      indice({ articleId: "1-novo", principalKeywordId: "p1" }),
      indice({ articleId: "2-igual", principalKeywordId: "p2" }),
      indice({ articleId: "3-humano", principalKeywordId: "p3" }),
      indice({ articleId: "4-empate", principalKeywordId: "sem", keywordIds: ["k1", "k2"] }),
      indice({ articleId: "5-nada", principalKeywordId: "sem" }),
      indice({ articleId: "6-arquivado", principalKeywordId: "p6" }),
    ],
    persisted: [{ articleId: "2-igual", groupId: "A", origin: "principal" }, { articleId: "3-humano", groupId: "B", origin: "human" }],
    keywordGroupById: grupos,
  });
  const status = new Map<string, "active" | "archived">([["A", "active"], ["B", "active"], ["Z", "archived"]]);
  const plano = planArticleGroupTagging({ memberships, groupStatusById: status });
  assert.deepEqual(plano.entries.map(entry => [entry.articleId, entry.status]), [
    ["1-novo", "will_tag"], ["2-igual", "already_tagged"], ["3-humano", "kept_other"], ["4-empate", "tie"], ["5-nada", "no_group"], ["6-arquivado", "group_inactive"],
  ]);
  assert.deepEqual(plano.willTag, [{ articleId: "1-novo", groupId: "A", origin: "principal" }], "só o artigo sem etiqueta, com grupo ativo, é gravado");
  assert.deepEqual(planArticleGroupTagging({ memberships, groupStatusById: status, articleIds: ["2-igual"] }).entries.map(entry => entry.articleId), ["2-igual"]);
});

test("mover · humano grava, igual não regrava, \"voltar ao grupo das keywords\" apaga só a etiqueta, grupo arquivado ou de fora é recusado", () => {
  const memberships = resolveArticleGroupMemberships({
    articles: [indice({ articleId: "a", principalKeywordId: "p" }), indice({ articleId: "b", principalKeywordId: "p" })],
    persisted: [{ articleId: "b", groupId: "B", origin: "human" }],
    keywordGroupById: new Map([["p", "A"]]),
  });
  const status = new Map<string, "active" | "archived">([["A", "active"], ["B", "active"], ["Z", "archived"]]);
  const mover = planArticleGroupMove({ articleIds: ["a", "b", "fantasma"], targetGroupId: "B", memberships, groupStatusById: status });
  assert.deepEqual(mover.toUpsert, [{ articleId: "a", groupId: "B", fromGroupId: "A" }]);
  assert.deepEqual(mover.unchanged, ["b"]);
  assert.deepEqual(mover.refused.map(item => [item.articleId, item.code]), [["fantasma", "ARTICLE_NOT_FOUND"]]);
  const voltar = planArticleGroupMove({ articleIds: ["a", "b"], targetGroupId: null, memberships, groupStatusById: status });
  assert.deepEqual(voltar.toDelete, [{ articleId: "b", fromGroupId: "B" }]);
  assert.deepEqual(voltar.unchanged, ["a"], "herança não tem o que apagar");
  assert.deepEqual(planArticleGroupMove({ articleIds: ["a"], targetGroupId: "Z", memberships, groupStatusById: status }).refused[0].code, "GROUP_ARCHIVED");
  assert.deepEqual(planArticleGroupMove({ articleIds: ["a"], targetGroupId: "de-outra-marca", memberships, groupStatusById: status }).refused[0].code, "GROUP_NOT_FOUND");
});

test("filtro · groupId da URL das rotas: ausente = Todos, sem-grupo, uuid; lixo é erro e nunca vira Todos", () => {
  assert.deepEqual(parseGroupIdQuery(null), { ok: true, filter: { kind: "all" } });
  assert.deepEqual(parseGroupIdQuery("todos"), { ok: true, filter: { kind: "all" } });
  assert.deepEqual(parseGroupIdQuery("sem-grupo"), { ok: true, filter: { kind: "none" } });
  assert.deepEqual(parseGroupIdQuery(LARANJA.toUpperCase()), { ok: true, filter: { kind: "group", groupId: LARANJA } });
  assert.deepEqual(parseGroupIdQuery("laranja"), { ok: false });
  assert.deepEqual(parseGroupIdQuery("x'); drop"), { ok: false });
});

test("filtro de tela · Todos devolve a mesma lista; recorte nunca muda a lista de origem", () => {
  const linhas = [{ id: "1", g: "A" }, { id: "2", g: null }, { id: "3", g: "B" }];
  const copia = structuredClone(linhas);
  assert.equal(filterRowsByEditorialGroup(linhas, { kind: "all" }, row => row.g), linhas, "mesma referência: nada recalculado");
  assert.deepEqual(filterRowsByEditorialGroup(linhas, { kind: "group", groupId: "A" }, row => row.g).map(row => row.id), ["1"]);
  assert.deepEqual(filterRowsByEditorialGroup(linhas, { kind: "none" }, row => row.g).map(row => row.id), ["2"]);
  assert.deepEqual(linhas, copia, "a lista inteira continua intacta");
  const memberships = resolveArticleGroupMemberships({ articles: [indice({ articleId: "a", principalKeywordId: "p" }), indice({ articleId: "b", principalKeywordId: "q" })], persisted: [], keywordGroupById: new Map([["p", "A"]]) });
  assert.equal(articleIdsInGroupFilter({ kind: "all" }, memberships.values()), null);
  assert.deepEqual([...articleIdsInGroupFilter({ kind: "group", groupId: "A" }, memberships.values())!], ["a"]);
  assert.deepEqual([...articleIdsInGroupFilter({ kind: "none" }, memberships.values())!], ["b"]);
});

test("leitura parcial do Arquiteto · o recorte fecha por artigo: nenhum artigo chega com parte das keywords", () => {
  const artigos = [
    indice({ articleId: "a1", principalKeywordId: "k1", keywordIds: ["k2"] }),
    indice({ articleId: "a2", principalKeywordId: "k2", keywordIds: ["k3"], subjectKeywordId: "s2" }),
    indice({ articleId: "a3", principalKeywordId: "k9" }),
  ];
  assert.deepEqual([...closeKeywordSetOverArticles(["k1"], artigos)].sort(), ["k1", "k2", "k3", "s2"]);
  assert.deepEqual([...closeKeywordSetOverArticles(["k9"], artigos)].sort(), ["k9"]);
});

test("SiloPage · etiqueta só quando todos os artigos concordam", () => {
  assert.equal(sharedGroupOf(["A", "A", "A"]), "A");
  assert.equal(sharedGroupOf(["A", "B"]), null);
  assert.equal(sharedGroupOf(["A", null]), null);
  assert.equal(sharedGroupOf([]), null);
});

/* ===================== núcleo com banco de mentira ===================== */

test("WifiConecta · prévia: os 8 artigos recebem \"laranja\" (7 pelo Assunto, \"plano vivo controle\" pela principal); nada é gravado", async () => {
  const db = wifiConecta();
  const previa = await previewArticleGroupTaggingWithCore(db, { brandId: MARCA });
  assert.ok(previa.ok);
  if (!previa.ok) return;
  assert.equal(previa.willTagCount, 8);
  assert.ok(previa.entries.every(entry => entry.status === "will_tag" && entry.groupId === LARANJA));
  const porArtigo = new Map(previa.entries.map(entry => [entry.articleId, entry]));
  assert.equal(porArtigo.get(ARTIGOS[5].articleId)!.origin, "principal");
  assert.equal(porArtigo.get(ARTIGOS[5].articleId)!.label, "plano vivo controle");
  assert.equal(previa.entries.filter(entry => entry.origin === "subject").length, 7);
  assert.equal(porArtigo.get(ARTIGOS[3].articleId)!.label, "claro ou vivo", "lê a versão vigente");
  assert.equal(db.rows("editorial_group_articles").length, 0, "a prévia não grava");
  assert.ok(db.log.every(entry => entry.op === "select"), "a prévia só lê");
});

test("WifiConecta · gravar: 8 etiquetas confirmadas pela releitura, histórico por grupo, e a segunda vez não grava nada", async () => {
  const db = wifiConecta();
  const primeira = await applyArticleGroupTaggingWithCore(db, { brandId: MARCA, actorUserId: ATOR, trigger: "explicit" });
  assert.ok(primeira.ok);
  if (!primeira.ok) return;
  assert.equal(primeira.tagged.length, 8);
  assert.deepEqual(primeira.notConfirmed, []);
  assert.equal(db.rows("editorial_group_articles").length, 8);
  assert.ok(db.rows("editorial_group_articles").every(row => row.marca_id === MARCA && row.group_id === LARANJA && row.assigned_by === ATOR));
  const evento = db.rows("editorial_group_events").at(-1)!;
  assert.equal(evento.event_type, "article_assigned");
  assert.equal((evento.payload as { articleIds: string[] }).articleIds.length, 8);
  const segunda = await applyArticleGroupTaggingWithCore(db, { brandId: MARCA, actorUserId: ATOR, trigger: "explicit" });
  assert.ok(segunda.ok && segunda.tagged.length === 0 && segunda.skipped.every(entry => entry.status === "already_tagged"));
  assert.equal(db.rows("editorial_group_articles").length, 8, "idempotente");
});

test("aditivo · ao formar/importar nunca troca a etiqueta de ninguém (decisão humana fica)", async () => {
  const db = wifiConecta();
  db.rows("editorial_group_articles").push({ marca_id: MARCA, article_id: ARTIGOS[0].articleId, group_id: AZUL, origin: "human", assigned_by: ATOR });
  const artigo = ARTIGOS[0];
  const resultado = await ensureArticleGroupsFromKeywordsWithCore(db, {
    brandId: MARCA, actorUserId: ATOR, trigger: "formation",
    articles: [articleKeywordIndex({ articleId: artigo.articleId, principalKeywordId: artigo.principal, subjectKeywordId: artigo.subject, secondaryKeywordIds: artigo.outras })],
  });
  assert.equal(resultado.status, "nothing_to_tag");
  assert.equal(db.rows("editorial_group_articles")[0].group_id, AZUL);
  const novo = ARTIGOS[1];
  const formou = await ensureArticleGroupsFromKeywordsWithCore(db, {
    brandId: MARCA, actorUserId: ATOR, trigger: "formation",
    articles: [articleKeywordIndex({ articleId: novo.articleId, principalKeywordId: novo.principal, subjectKeywordId: novo.subject, secondaryKeywordIds: novo.outras })],
  });
  assert.deepEqual(formou, { status: "tagged", tagged: 1 });
  assert.ok(!db.log.some(entry => entry.table === "editorial_artifact_versions"), "na formação o índice vem do próprio ArticleDNA gravado: sem reler a tabela");
});

test("aditivo · sem a M1 ou com o banco caindo, a formação segue: nunca lança", async () => {
  const semM1 = wifiConecta();
  semM1.failures.editorial_group_articles = { code: "42P01", message: "relation \"public.editorial_group_articles\" does not exist" };
  const artigo = ARTIGOS[0];
  const entrada = { brandId: MARCA, actorUserId: ATOR, trigger: "formation" as const, articles: [articleKeywordIndex({ articleId: artigo.articleId, principalKeywordId: artigo.principal })] };
  assert.deepEqual(await ensureArticleGroupsFromKeywordsWithCore(semM1, entrada), { status: "unavailable", tagged: 0 });
  const quebrado = { from() { throw new Error("rede"); } };
  assert.deepEqual(await ensureArticleGroupsFromKeywordsWithCore(quebrado as never, entrada), { status: "failed", tagged: 0 });
});

test("mover pelo rodapé · humano para \"azul\" e de volta ao grupo das keywords (a etiqueta some e a herança volta)", async () => {
  const db = wifiConecta();
  const alvo = ARTIGOS[4].articleId;
  const moveu = await moveArticlesToGroupWithCore(db, { brandId: MARCA, actorUserId: ATOR, articleIds: [alvo], groupId: AZUL });
  assert.ok(moveu.ok && moveu.moved.length === 1);
  assert.deepEqual(db.rows("editorial_group_articles").map(row => [row.article_id, row.group_id, row.origin]), [[alvo, AZUL, "human"]]);
  const lido = await readArticleGroupMemberships(db, MARCA);
  assert.ok(lido.ok && lido.memberships.get(alvo)!.groupId === AZUL);
  const voltou = await moveArticlesToGroupWithCore(db, { brandId: MARCA, actorUserId: ATOR, articleIds: [alvo], groupId: null });
  assert.ok(voltou.ok && voltou.returnedToKeywords.length === 1);
  assert.equal(db.rows("editorial_group_articles").length, 0);
  const relido = await readArticleGroupMemberships(db, MARCA);
  assert.ok(relido.ok && relido.memberships.get(alvo)!.groupId === LARANJA && !relido.memberships.get(alvo)!.persisted);
  const arquivado = await moveArticlesToGroupWithCore(db, { brandId: MARCA, actorUserId: ATOR, articleIds: [alvo], groupId: ARQUIVADO });
  assert.ok(arquivado.ok && arquivado.refused[0].code === "GROUP_ARCHIVED" && db.rows("editorial_group_articles").length === 0);
});

test("isolamento · grupo, etiqueta, ArticleDNA e keyword de outra marca nunca entram", async () => {
  const db = wifiConecta();
  // Artigo da OUTRA marca que cita uma keyword desta (id que ela não tem).
  db.rows("editorial_artifact_versions").push(dna({ articleId: "artigo-da-outra", principal: ARTIGOS[0].principal, texto: "x", subject: null, outras: [] }, OUTRA));
  db.rows("editorial_group_articles").push({ marca_id: OUTRA, article_id: ARTIGOS[0].articleId, group_id: GRUPO_DA_OUTRA, origin: "human", assigned_by: ATOR });
  const daqui = await readArticleGroupMemberships(db, MARCA);
  assert.ok(daqui.ok);
  if (!daqui.ok) return;
  assert.ok(!daqui.memberships.has("artigo-da-outra"));
  assert.equal(daqui.memberships.get(ARTIGOS[0].articleId)!.persisted, false, "a etiqueta da outra marca não vale aqui");
  const dela = await readArticleGroupMemberships(db, OUTRA);
  assert.ok(dela.ok && dela.memberships.get("artigo-da-outra")!.groupId === null, "a keyword desta marca não dá grupo ao artigo da outra");
  const recusado = await moveArticlesToGroupWithCore(db, { brandId: MARCA, actorUserId: ATOR, articleIds: [ARTIGOS[0].articleId], groupId: GRUPO_DA_OUTRA });
  assert.ok(recusado.ok && recusado.refused[0].code === "GROUP_NOT_FOUND");
  const forasteiro = await moveArticlesToGroupWithCore(db, { brandId: MARCA, actorUserId: ATOR, articleIds: ["artigo-da-outra"], groupId: AZUL });
  assert.ok(forasteiro.ok && forasteiro.refused[0].code === "ARTICLE_NOT_FOUND");
  assert.equal(db.rows("editorial_group_articles").filter(row => row.marca_id === MARCA).length, 0);
});

test("keywords por grupo · índice da tela e recorte do Arquiteto lêem só a marca, paginados", async () => {
  const db = wifiConecta();
  db.rows("minerador_keywords").push(keyword(uuid(777), OUTRA, GRUPO_DA_OUTRA), keyword(uuid(778), MARCA, null), keyword(uuid(779), MARCA, LARANJA));
  db.rows("minerador_keywords").at(-1)!.deleted_at = "2026-10-12T00:00:00Z";
  const indiceDaTela = await readGroupedKeywordIndex(db, MARCA);
  assert.ok(indiceDaTela.ok && indiceDaTela.rows.every(row => row.groupId === LARANJA) && !indiceDaTela.rows.some(row => row.id === uuid(779)));
  const semGrupo = await readKeywordIdsInGroupFilter(db, MARCA, { kind: "none" });
  assert.ok(semGrupo.ok && semGrupo.ids.length === 1 && semGrupo.ids[0] === uuid(778));
  const daOutra = await readKeywordIdsInGroupFilter(db, MARCA, { kind: "group", groupId: GRUPO_DA_OUTRA });
  assert.ok(daOutra.ok && daOutra.ids.length === 0);
});

/* ============================ estrutural ============================ */

test("núcleo único · só o repositório do grupo do artigo escreve editorial_group_articles", () => {
  const escritores: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminhoCompleto = join(dir, nome);
      if (statSync(caminhoCompleto).isDirectory()) { if (!["node_modules", ".next", "tests", "docs", "supabase", ".git"].includes(nome)) varrer(caminhoCompleto); continue; }
      if (!/\.(ts|tsx|mts)$/.test(nome)) continue;
      const fonte = semComentarios(readFileSync(caminhoCompleto, "utf8"));
      if (/from\("editorial_group_articles"\)\s*\.(upsert|insert|update|delete)\(/.test(fonte)) escritores.push(relative(ROOT, caminhoCompleto).split(sep).join("/"));
    }
  };
  for (const raiz of ["app", "lib", "components", "modules"]) varrer(join(ROOT, raiz));
  assert.deepEqual(escritores.sort(), ["lib/editorial/article-groups-store.ts"]);
  const core = semComentarios(read("lib/editorial/article-group-core.ts"));
  for (const chamador of ["app/api/editorial/groups/articles/route.ts", "lib/server/arquiteto-persistence.ts", "app/api/editorial/workflow/route.ts"]) {
    assert.match(semComentarios(read(chamador)), /article-group-core/, `${chamador} usa o núcleo`);
  }
  assert.match(core, /mode: "if_missing"/, "etiquetar pelas keywords é aditivo");
});

test("formação e importação etiquetam DEPOIS de gravar, e só quando gravou", () => {
  const persistencia = semComentarios(read("lib/server/arquiteto-persistence.ts"));
  const append = persistencia.slice(persistencia.indexOf("export async function appendArquitetoArtifact"), persistencia.indexOf("export async function", persistencia.indexOf("export async function appendArquitetoArtifact") + 10));
  assert.ok(append.indexOf("repository.append(") < append.indexOf("ensureArticleGroupsFromKeywordsWithCore("));
  assert.match(append, /type === "article_dna" && result\.status === "PERSISTED"/);
  const workflow = semComentarios(read("app/api/editorial/workflow/route.ts"));
  assert.ok(workflow.indexOf("confirmedRadar.push(") < workflow.indexOf("ensureArticleGroupsFromKeywordsWithCore("), "no Radar, depois da releitura confirmada");
});

test("tela do Arquiteto · seletor no topo, faixa e etiqueta nas abas Artigos e Silos, filtro de tela, rodapé e prévia", () => {
  const tela = semComentarios(read("modules/arquiteto/arquiteto-workspace.tsx"));
  // 2026-10-12 · cores fixas: a escolha é do Arquiteto e a leitura pesada dos artigos espera a mesa.
  assert.match(tela, /useEditorialGroups\(\{ brandId: selectedBrandId \|\| null, enabled: sessionStatus === "authenticated", includeKeywords: true, area: "arquiteto", mainReady: !mesaDoArquitetoCarregando \}\)/);
  assert.match(tela, /const \{ loading: mesaDoArquitetoCarregando \} = useEditorialPipeline\(\);/);
  // A etiqueta é da topbar global; o Arquiteto só acrescenta o atalho no fim do menu.
  assert.match(tela, /groupTagMenuFooter: rodapeDaEtiquetaDoArquiteto,/);
  assert.match(tela, /const rodapeDaEtiquetaDoArquiteto = useMemo\(\(\) => \(arquitetoGroups\.available\s*\?\s*\(fechar: \(\) => void\) => <ArticleGroupTagMenuItem/);
  assert.doesNotMatch(tela, /<EditorialGroupSelector|groupTag:/, "o Arquiteto não monta mais o seletor");
  assert.match(tela, /title=\{art\.keywordPrincipal\}>\{art\.keywordPrincipal\}<\/p><ArticleGroupRowTag group=\{grupoDaLinhaResumo\}/);
  assert.match(tela, /editorialGroupStripeClass\(grupoDaLinhaResumo\)/);
  assert.match(tela, /filterRowsByEditorialGroup\(porAssunto, arquitetoGroups\.filter/);
  assert.match(tela, /surface=\{groupScopedTerritorialSurface\}\s*groupForKeyword=/);
  assert.match(tela, /<ArticleGroupMoveSelect groups=\{arquitetoGroups\.groups\} disabled=\{updating\} onMove=\{color => \{ void moverArtigosDeGrupo\(color\); \}\} \/>/);
  assert.match(tela, /await arquitetoGroups\.moveArticlesToColor\(ids, color\)/, "mover por cor garante o grupo da cor antes");
  assert.match(tela, /<ArticleGroupTaggingDialog/);
  // A mesa e a cópia local continuam inteiras: o filtro não escreve em masterList nem nas fontes.
  assert.doesNotMatch(tela, /setMasterList\([^)]*filterRowsByEditorialGroup/);
});

test("tela do Radar · seletor no topo, faixa e etiqueta na linha, rodapé, e a lista do pipeline intocada", () => {
  const tela = semComentarios(read("modules/radar/radar-page.tsx"));
  // A tabela recebe a lista INTEIRA (o guarda do expansor procura nela) e o recorte vai como filtro de tela.
  assert.match(tela, /rows=\{pipeline\.radarItems\} rowFilter=\{filtroDoGrupo\} rowStripeClassName=\{row => editorialGroupStripeClass\(grupoDoItem\(row\)\)\}/);
  assert.match(tela, /renderActions: renderTopbarActions, groupTagMenuFooter: rodapeDaEtiquetaDoRadar, groupTagUngroupedDetail: /);
  assert.match(tela, /useEditorialGroups\(\{ brandId: selectedBrandId \|\| null, enabled: Boolean\(selectedBrandId\), area: "radar", mainReady: !pipeline\.loading \}\)/);
  assert.doesNotMatch(tela, /<EditorialGroupSelector/, "o Radar não monta mais o seletor");
  assert.match(tela, /<ArticleGroupMoveSelect groups=\{gruposDoRadar\.groups\} onMove=\{color => void moverItensDeGrupo\(rows, color\)\}\/>/);
  assert.match(tela, /<ArticleGroupRowTag group=\{grupoDoItem\(row\)\}/);
  assert.match(tela, /renderBulkBarAside=\{rows => gruposDoRadar\.available \? <ArticleGroupMoveSelect/);
  assert.match(tela, /editorialGroupFilterMatches\(gruposDoRadar\.filter, gruposDoRadar\.articleGroupById\.get\(row\.articleId\)/);
  assert.doesNotMatch(tela, /pipeline\.radarItems\s*=/, "o recorte nunca substitui a lista");
});

test("a mesa no navegador: fora do Radar lê inteira; no Radar, só a cor (SDD acelerar 2026-10-13, item 6)", () => {
  // Mudança declarada (item 6): o pipeline pede o recorte da cor só na rota do Radar; sem recorte a URL é a de sempre.
  const contexto = semComentarios(read("components/editorial-pipeline-context.tsx"));
  assert.match(contexto, /fetch\(workspaceReadUrl\(selectedBrandId, recorte\), \{ cache: "no-store" \}\)/);
  assert.match(contexto, /useAreaGroupFilter\(rotaDoRadar \? selectedBrandId \|\| null : null, "radar"\)/);
  const escopo = semComentarios(read("lib/editorial/workspace-read-scope.ts"));
  assert.match(escopo, /return `\/api\/editorial\/workspace\?\$\{partes\.join\("&"\)\}`;/);
  const hook = semComentarios(read("components/editorial/use-editorial-groups.ts"));
  // 2026-10-12 · cores fixas: a escolha é de cada área (lembrança por área no estado compartilhado com a topbar).
  assert.match(hook, /useAreaGroupFilter\(alvo, area\)/);
  const estado = semComentarios(read("components/editorial/editorial-group-area-store.ts"));
  assert.match(estado, /editorialGroupAreaStorageKey\(brandId, area\)/, "lembrança local por marca E por área (D12)");
  assert.doesNotMatch(hook + estado, /localStorage\.(removeItem|clear)/, "nada é limpo");
});

test("catálogo do MCP · a rota nova e o processo de grupos no Arquiteto e no Radar", () => {
  const catalogo = read("lib/agent/platform-catalog.ts");
  assert.match(catalogo, /"\/api\/editorial\/groups\/articles"/);
  assert.match(catalogo, /Etiquetar artigos pelo grupo das keywords/);
});
